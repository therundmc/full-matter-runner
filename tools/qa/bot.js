// QA robot, injected into the game page as source text by tools/qa/run.mjs (the game never imports it).
// It plays level after level through the game's own input object (held keys, one-shot presses, mouse), walks along
// the guards' grid path-finding, fights, dies, restarts, and watches the simulation for problems (the detectors
// below). Everything it learns is kept here and handed to Node in small JSON statuses (batch / poll / final).
//
// Two drive modes:
//   fast      the bot advances the game itself, one game.update(1/60) per step, a few hundred steps per batch, and
//             lets one real animation frame render between batches (the page's own loop only draws then);
//   realtime  the game's own requestAnimationFrame loop runs; the bot wraps game.update to set the inputs before
//             each frame and to run the detectors after it.
// Findings: { kind, severity: 'error' | 'warn', t (game s), session, pos, detail, lastActions, count }, repeats of
// the same kind and signature are counted, not stored again.
(() => {
  if (window.__qa) return;

  const TILE = 32;
  const DT = 1 / 60;
  const MELEE_SPACE = new Set(['EXECUTE']);
  const VAULTS = new Set(['VAULT', 'DIVE THROUGH', 'CLIMB']);
  // features a long session should exercise at least once (else a 'not-covered' warning, see run.mjs)
  const FEATURES = ['vault', 'windowDive', 'windowVault', 'climb', 'slide', 'takedown', 'finisher', 'trunk', 'doorOpened', 'doorBreached',
    'weaponBroken', 'pickup', 'throw', 'reload', 'gunKill', 'meleeKill', 'clear', 'exit'];

  // seeded PRNG (mulberry32)
  const prng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const r1 = (v) => Math.round(v * 10) / 10;
  const cellOf = (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)];
  const posOf = (x, y) => ({ x: Math.round(x), y: Math.round(y), cell: cellOf(x, y) });
  const firstLine = (s) => String(s || '').split('\n')[0].slice(0, 200);
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  const qa = (window.__qa = {});
  let game, findPath, Audio, killStyle, rnd, opts;
  const S = {
    clock: 0, steps: 0, session: 0, world: null, sess: null,
    findings: new Map(), dirty: new Set(), freshKinds: [],
    actions: [],
    stats: {
      sessions: 0, deaths: {}, deathsBy: {}, clears: [], exits: 0, giveUps: 0, forcedRestarts: 0,
      kills: 0, playerKills: 0, styles: {}, tags: {}, killWeapons: {}, picked: {}, fired: {}, civilians: {},
      coverage: Object.fromEntries(FEATURES.map((f) => [f, 0])), maxKills: 0, maxKillsSession: 0,
      goalsAbandoned: 0, goals: {}, transientInWall: 0, renderErrors: 0,
    },
    sessions: [],      // per session summary (Node analyses its samples for leaks)
    newSamples: [],    // leak samples since the last status
    timing: { n: 0, ms: 0, worst: 0, worstAt: null }, // fast mode: game.update cost
    perfSamples: [],   // realtime: game.perf
    renderWanted: false, frameDone: null,
    inWall: new Map(), // entity -> first time seen inside a wall
  };

  // ---------------------------------------------------------------- bookkeeping
  function act(name) {
    const a = S.actions, last = a[a.length - 1], t = r1(S.clock);
    if (last && last.a === name) { last.n++; last.t = t; return; }
    a.push({ t, a: name, n: 1 });
    if (a.length > 10) a.shift();
  }
  const lastActions = () => S.actions.map((x) => `${x.t}s ${x.a}${x.n > 1 ? ' x' + x.n : ''}`);

  function report(kind, severity, sig, pos, detail) {
    const key = kind + '|' + sig;
    let f = S.findings.get(key);
    if (f) { f.count++; f.lastT = r1(S.clock); f.lastSession = S.session; }
    else {
      f = { key, kind, severity, sig, t: r1(S.clock), worldT: r1(game.world?.time || 0), session: S.session, pos, detail,
        lastActions: lastActions(), count: 1, lastT: r1(S.clock), lastSession: S.session };
      S.findings.set(key, f);
      if (![...S.findings.values()].some((o) => o !== f && o.kind === kind)) S.freshKinds.push({ kind, key, pos });
    }
    S.dirty.add(key);
    return f;
  }
  const cover = (f) => { S.stats.coverage[f] = (S.stats.coverage[f] || 0) + 1; };
  const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

  // ---------------------------------------------------------------- per session
  function onNewWorld(w) {
    S.world = w;
    S.session++;
    S.stats.sessions++;
    const sess = S.sess = {
      index: S.session, start: r1(S.clock), kills: 0, playerKills: 0, died: null, cleared: false, exited: false,
      samples: [], nextSample: 0, startBodies: w.physics.bodies().length,
      heapStart: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      guards: w.totalEnemies, lastKillT: S.clock,
    };
    S.sessions.push(sess);
    if (S.sessions.length > 400) S.sessions.shift();
    S.inWall.clear();
    const p = w.player;
    if (opts.god) p.invulnerable = true;
    // game hooks, wrapped from the outside on this world's instances
    const unstick = p.unstick;
    p.unstick = function () {
      const x = this.x, y = this.y;
      unstick.call(this);
      if (Math.hypot(this.x - x, this.y - y) > 0.5) {
        const what = w.map.solidAt(x, y) ? 'wall' : 'vehicle';
        report('unstick', 'error', `${what}@${cellOf(x, y)}`, posOf(x, y),
          { from: posOf(x, y), to: posOf(this.x, this.y), inside: what, slide: !!this.slide, weapon: this.weapon?.type || 'fists' });
      }
    };
    const breakWeapon = p.breakWeapon;
    p.breakWeapon = function (...a) { cover('weaponBroken'); act('weapon broke'); return breakWeapon.apply(this, a); };
    const throwWeapon = p.throwWeapon;
    p.throwWeapon = function (...a) { cover('throw'); return throwWeapon.apply(this, a); };
    const reload = p.reload;
    p.reload = function (...a) { const r = reload.apply(this, a); if (r) cover('reload'); return r; };
    for (const e of w.enemies) wrapGuard(e);
    const ev = w.events;
    ev.on('kill', (e) => onKill(w, e));
    ev.on('slide', ({ ch }) => { if (ch?.isPlayer) cover('slide'); });
    ev.on('pickup', ({ ch, type }) => { if (ch?.isPlayer) { cover('pickup'); bump(S.stats.picked, type); } });
    ev.on('shot', ({ shooter, weapon }) => { if (shooter?.isPlayer) bump(S.stats.fired, weapon?.type || weapon?.name || 'gun'); });
    // what the bot knows of the level
    B.walkable = [];
    for (let cy = 0; cy < w.map.h; cy++) for (let cx = 0; cx < w.map.w; cx++) if (!w.map.isBlocked(cx, cy)) B.walkable.push([cx, cy]);
    B.doors = new Set(w.doors);
    B.opened = new Set();
    B.locked = new Set(w.doors.filter((d) => d.locked));
    B.trunks = w.props.filter((q) => q.trunk);
    B.goal = null; B.path = null; B.target = null; B.anchor = null; B.side = null; B.vaultWas = null;
    B.takedownWas = null; B.execWas = null; B.diedSeen = false; B.resultsSeen = false; B.clearT = null;
    B.sessionStart = S.clock; B.noTarget = 0; B.blacklist = [];
    B.exitSince = null; B.leftZero = null; B.exitPathT = -99;
    act(`session ${S.session}`);
  }

  // a guard's travel(): when it is asked to walk somewhere, for the guard-stuck detector
  function wrapGuard(e) {
    if (e.__qa) return;
    e.__qa = { anchor: null };
    const travel = e.travel;
    e.travel = function (dt, x, y, ...rest) {
      this.__qa.travel = { t: this.world.time, x, y, near: rest[1]?.near ?? 8 };
      return travel.call(this, dt, x, y, ...rest);
    };
  }

  function onKill(w, e) {
    const { victim, cause, killer } = e;
    if (victim.isPlayer) {
      bump(S.stats.deaths, cause || '?');
      bump(S.stats.deathsBy, killer ? (killer.isPlayer ? 'self' : killer.kind || killer.label || 'other') : 'world');
      S.sess.died = cause;
      act(`DIED (${cause})`);
      return;
    }
    if (victim.isCivilian) { bump(S.stats.civilians, cause || '?'); return; }
    if (!victim.isEnemy) return;
    S.stats.kills++;
    S.sess.kills++;
    S.sess.lastKillT = S.clock;
    S.stats.maxKills = Math.max(S.stats.maxKills, S.sess.kills);
    if (S.stats.maxKills === S.sess.kills) S.stats.maxKillsSession = S.session;
    if (!killer?.isPlayer) return;
    S.stats.playerKills++;
    S.sess.playerKills++;
    const how = killStyle(e);
    if (how) {
      bump(S.stats.styles, how.style);
      for (const t of w.scoring.tags || []) bump(S.stats.tags, t);
    }
    const weapon = killer.weapon?.type || 'fists';
    bump(S.stats.killWeapons, weapon);
    if (['bullet', 'blast', 'heavy'].includes(cause)) cover('gunKill');
    if (['melee', 'slash', 'snap', 'execute'].includes(cause) || how?.style === 'melee' || how?.style === 'execution' || how?.style === 'takedown') cover('meleeKill');
    act(`killed ${victim.kind} (${cause}${how ? ', ' + how.style : ''})`);
  }

  // ---------------------------------------------------------------- the bot's brain
  const B = { goal: null, path: null, idx: 0, replanT: 0, goalT: 0, fireT: 0, target: null, seeT: 0,
    anchor: null, headway: null, side: null, sideT: 0, dither: 0, spaceT: 0, walkable: [], blacklist: [] };

  function press(inp, code) { inp.pressed.add(code); inp.anyPressed = true; }

  // hold the keys of the 8-way direction closest to (dx, dy), dithered between the two nearest so the mean heading
  // is the wanted one; returns the heading actually pressed
  function steer(inp, dx, dy) {
    const a = Math.atan2(dy, dx) / (Math.PI / 4), lo = Math.floor(a), frac = a - lo;
    B.dither += frac;
    let o = lo;
    if (B.dither >= 1) { B.dither -= 1; o = lo + 1; }
    const ux = Math.round(Math.cos(o * Math.PI / 4)), uy = Math.round(Math.sin(o * Math.PI / 4));
    if (ux > 0) inp.keys.add('KeyD'); else if (ux < 0) inp.keys.add('KeyA');
    if (uy > 0) inp.keys.add('KeyS'); else if (uy < 0) inp.keys.add('KeyW');
    return Math.atan2(uy, ux);
  }

  function aimAt(inp, x, y) {
    const s = game.camera.worldToScreen(x, y);
    inp.mouse.x = Math.max(0, Math.min(game.canvas.width - 1, s.x));
    inp.mouse.y = Math.max(0, Math.min(game.canvas.height - 1, s.y));
  }

  const blacklisted = (x, y) => B.blacklist.some((b) => b.until > S.clock && Math.hypot(b.x - x, b.y - y) < 40);

  function pickWeighted(list) {
    const total = list.reduce((s, o) => s + o.w, 0);
    let r = rnd() * total;
    for (const o of list) { if ((r -= o.w) <= 0) return o; }
    return list[list.length - 1];
  }

  // a new destination: what it is and where (world px), with a path to it
  function chooseGoal(w, p) {
    const ex = w.level.exit;
    if (w.cleared && ex) return setGoal(w, p, { type: 'exit', x: ex.x * TILE, y: ex.y * TILE });
    const guards = w.enemies.filter((e) => e.alive && !e.yielded);
    const near = (list) => list.map((o) => ({ o, d: Math.hypot(o.x - p.x, o.y - p.y) })).sort((a, b) => a.d - b.d);
    const items = near(w.items.filter((it) => !it.dead && it.speed <= 3 && !blacklisted(it.x, it.y)));
    const loaded = ({ o }) => o.def?.kind === 'gun' && o.mag > 0;
    const wantGun = !p.hasGun && items.some(loaded);
    const options = [];
    if (guards.length) options.push({ w: p.armed ? 7 : 3, f: () => { const g = near(guards).find(({ o }) => !blacklisted(o.x, o.y)) || near(guards)[0]; return { type: 'guard', x: g.o.x, y: g.o.y, guard: g.o }; } });
    const gunNear = wantGun && items.some((x) => loaded(x) && x.d < 400);
    if (items.length && (!p.armed || wantGun)) options.push({ w: gunNear ? 12 : p.armed ? 3 : 8, f: () => { const pool = wantGun ? items.filter(loaded) : items, it = pool[Math.floor(rnd() * Math.min(3, pool.length))].o; return { type: 'item', x: it.x, y: it.y, item: it }; } });
    const ammo = p.hasGun ? near((w.ammoItems || []).filter((a) => !a.dead && a.type === p.def.ammo && !blacklisted(a.x, a.y))) : [];
    if (ammo.length && p.ammo[p.def.ammo] < p.def.mag * 2) options.push({ w: 4, f: () => ({ type: 'ammo', x: ammo[0].o.x, y: ammo[0].o.y, item: ammo[0].o }) });
    const trunks = B.trunks.filter((c) => !c.dead && c.trunk && !c.trunk.open);
    if (trunks.length) options.push({ w: p.armed ? 0.6 : 3, f: () => { const c = trunks[0], at = c.toWorld(-14, c.h / 2); return { type: 'trunk', x: at.x, y: at.y, car: c }; } });
    if (w.doors.length) options.push({ w: 1, f: () => doorGoal(w, p, w.doors[Math.floor(rnd() * w.doors.length)]) });
    if (w.windows.length) options.push({ w: 1.3, f: () => windowGoal(w, p, w.windows[Math.floor(rnd() * w.windows.length)]) });
    options.push({ w: 0.8, f: () => { const [cx, cy] = B.walkable[Math.floor(rnd() * B.walkable.length)]; return { type: 'wander', x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE }; } });
    for (let i = 0; i < 6; i++) {
      const g = pickWeighted(options).f();
      if (g && setGoal(w, p, g)) return true;
    }
    return false;
  }

  // the cell two steps past a door, on the side away from the player
  function doorGoal(w, p, d) {
    const W = w.map.w, c = d.cells?.[0];
    if (c === undefined) return null;
    const cx = c % W, cy = Math.floor(c / W);
    const horizontal = d.cells.length > 1 ? d.cells[1] - d.cells[0] === 1 : w.map.isSolid(cx - 1, cy) && w.map.isSolid(cx + 1, cy);
    const x = (cx + 0.5) * TILE, y = (cy + 0.5) * TILE;
    const s = horizontal ? Math.sign(y - p.y) || 1 : Math.sign(x - p.x) || 1;
    for (const k of [2, 1]) {
      const gx = horizontal ? cx : cx - s * k, gy = horizontal ? cy - s * k : cy;
      if (!w.map.isBlocked(gx, gy)) return { type: 'door', x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE, door: d };
    }
    return null;
  }

  // a window: walk to the cell in front of it on our side, then jump through to the far one (see windowApproach)
  function windowGoal(w, p, win) {
    const ux = win.vertical ? 1 : 0, uy = win.vertical ? 0 : 1;
    let s = Math.sign(win.vertical ? p.x - win.x : p.y - win.y) || 1;
    const free = (k) => !w.map.isBlocked(win.cx + ux * k, win.cy + uy * k);
    if (!free(s)) s = -s;
    if (!free(s) || !free(-s)) return null;
    return { type: 'window', x: win.x + ux * s * TILE, y: win.y + uy * s * TILE, win, far: { x: win.x - ux * s * TILE, y: win.y - uy * s * TILE } };
  }

  function setGoal(w, p, g) {
    let path = findPath(w.map, p.x, p.y, g.x, g.y, 8000);
    g.breach = false;
    if (!path && w.doors.some((d) => d.locked)) {
      // through a locked door, to be broken open on the way: plan as if its cells were free (restored at once)
      const m = w.map.blocked, cells = w.doors.filter((d) => d.locked).flatMap((d) => d.cells), was = cells.map((i) => m[i]);
      for (const i of cells) m[i] = 0;
      try { path = findPath(w.map, p.x, p.y, g.x, g.y, 8000); } finally { cells.forEach((i, k) => { m[i] = was[k]; }); }
      g.breach = !!path;
    }
    if (!path || !path.length) { B.blacklist.push({ x: g.x, y: g.y, until: S.clock + 20 }); return false; }
    if (g !== B.goal) {
      bump(S.stats.goals, g.type);
      act(`goal ${g.type} @${cellOf(g.x, g.y)}`);
      B.goalT = S.clock;
      B.headway = { best: Infinity, t: S.clock };
    }
    B.goal = g; B.path = path; B.idx = 0; B.replanT = S.clock + (g.type === 'guard' ? 0.6 : 2);
    B.anchor = null;
    B.side = null;
    return true;
  }

  function abandon(why) {
    if (B.goal) B.blacklist.push({ x: B.goal.x, y: B.goal.y, until: S.clock + 15 });
    S.stats.goalsAbandoned++;
    act(`abandon goal (${why})`);
    B.goal = null; B.path = null;
  }

  // what stands right in front of the player (for the player-stuck report)
  function inFront(w, p, heading) {
    const fx = p.x + Math.cos(heading) * 18, fy = p.y + Math.sin(heading) * 18;
    const near = [];
    const add = (type, o, x, y) => { const d = Math.hypot(x - fx, y - fy); if (d < 48) near.push({ type, d: Math.round(d), at: cellOf(x, y), ...o }); };
    for (const q of w.props) if (!q.dead) add('prop', { name: q.type, vehicle: !!q.isVehicle, static: !!q.body?.isStatic }, q.x, q.y);
    for (const d of w.doors) add('door', { locked: !!d.locked, angle: r1(angDiff(d.a0, d.body.angle)) }, d.body.position.x, d.body.position.y);
    for (const e of w.enemies) if (e.alive) add('guard', { kind: e.kind, state: e.state }, e.x, e.y);
    for (const c of w.civilians) if (c.alive) add('civilian', {}, c.x, c.y);
    for (const c of w.corpses) if (!c.dead) add('corpse', {}, c.x, c.y);
    for (const win of w.windows) add('window', { intact: win.intact }, win.x, win.y);
    const [cx, cy] = cellOf(fx, fy);
    return { wallAhead: w.map.isSolid(cx, cy), tile: w.map.at(cx, cy), near: near.sort((a, b) => a.d - b.d).slice(0, 4) };
  }

  // one decision + input frame of the bot while playing
  function play(w, p, inp) {
    inp.keys.clear();
    inp.mouse.down[0] = inp.mouse.down[2] = false;
    if (p.sit > 0 && !p.rising) { inp.anyPressed = true; act('get up'); return; }
    if (!p.alive) return;

    // re-target every 0.1 s: the nearest guard in sight (knocked ones first)
    if (S.clock >= B.seeT) {
      B.seeT = S.clock + 0.1;
      let best = null, bd = 700;
      for (const e of w.enemies) {
        if (!e.alive || e.yielded) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y) - (e.knocked > 0 ? 150 : 0);
        if (d < bd && w.lineOfSight(p.x, p.y, e.x, e.y)) { bd = d; best = e; }
      }
      B.target = best;
    }
    const tg = B.target && B.target.alive ? B.target : null;
    const d = p.def, gun = d.kind === 'gun';
    const tdist = tg ? Math.hypot(tg.x - p.x, tg.y - p.y) : Infinity;
    const reach = (d.range || 20) + 12;
    // an unaware guard, standing: creep up behind him for a takedown (half the time), instead of rushing him
    if (tg !== B.sneakFor) { B.sneakFor = tg; B.sneak = !!tg && rnd() < 0.5; }
    const sneaking = tg && B.sneak && !gun && tg.aware === 0 && !(tg.knocked > 0) && !tg.held;
    const back = sneaking && { x: tg.x - Math.cos(tg.angle) * 20, y: tg.y - Math.sin(tg.angle) * 20 };

    // goal upkeep
    if (!B.goal || S.clock - B.goalT > 25 || (w.cleared && B.goal.type !== 'exit')) chooseGoal(w, p);
    else if (B.goal.type === 'guard' && (!B.goal.guard.alive || B.goal.guard.yielded)) chooseGoal(w, p);
    else if ((B.goal.type === 'item' || B.goal.type === 'ammo') && B.goal.item.dead) chooseGoal(w, p);
    else if (B.goal.type === 'trunk' && B.goal.car.trunk?.open) chooseGoal(w, p);
    else if (S.clock >= B.replanT && !B.goal.crossing) {
      if (B.goal.type === 'guard') { B.goal.x = B.goal.guard.x; B.goal.y = B.goal.guard.y; }
      if (!setGoal(w, p, B.goal)) chooseGoal(w, p);
    }

    // movement: straight at a close target in sight, else along the path
    let heading = null;
    const chase = tg && !gun && tdist < 240;
    if (B.side && S.clock < B.sideT) heading = steer(inp, Math.cos(B.side), Math.sin(B.side));
    else if (sneaking && tdist < 240) {
      B.side = null;
      const bd = Math.hypot(back.x - p.x, back.y - p.y);
      // round him, not through him: aim for a point off to the side of his back while still in front of him
      const ahead = Math.cos(tg.angle) * (p.x - tg.x) + Math.sin(tg.angle) * (p.y - tg.y) > 0;
      const via = ahead ? { x: tg.x + Math.cos(tg.angle + Math.PI / 2) * 40, y: tg.y + Math.sin(tg.angle + Math.PI / 2) * 40 } : back;
      if (bd > 6) heading = steer(inp, via.x - p.x, via.y - p.y);
      act('sneak');
    } else if (chase) {
      B.side = null;
      if (tdist > reach * 0.6) heading = steer(inp, tg.x - p.x, tg.y - p.y);
    } else if (gun && tg && tdist < 170) {
      // too close with a gun: hold the ground, a step aside now and then
      if (rnd() < 0.02) { B.side = Math.atan2(tg.y - p.y, tg.x - p.x) + (rnd() < 0.5 ? 1.6 : -1.6); B.sideT = S.clock + 0.3; }
    } else if (B.path) {
      let wp = B.path[B.idx];
      while (wp && Math.hypot(wp.x - p.x, wp.y - p.y) < (B.idx === B.path.length - 1 ? 14 : 12)) wp = B.path[++B.idx];
      if (!wp) arrive(w, p, inp);
      else heading = steer(inp, wp.x - p.x, wp.y - p.y);
    }
    if (B.goal?.type === 'window' && (B.goal.crossing || (B.path && B.idx >= B.path.length - 1 && Math.hypot(B.goal.x - p.x, B.goal.y - p.y) < 20))) heading = windowApproach(w, p, inp);

    // progress watch: no headway for a while -> vault, then sidestep, then report and give up the goal
    if (heading !== null && !p.vaulting && !p.execution && !p.takedown && !p.slide && !B.goal?.crossing) {
      const a = B.anchor || (B.anchor = { x: p.x, y: p.y, t: w.time });
      const moved = Math.hypot(p.x - a.x, p.y - a.y);
      if (moved >= 8) { B.anchor = { x: p.x, y: p.y, t: w.time }; }
      else {
        const held = w.time - a.t;
        if (held > 0.6 && S.clock > B.spaceT && VAULTS.has(p.contextAction)) { press(inp, 'Space'); B.spaceT = S.clock + 0.5; act('space (unstuck)'); }
        else if (held > 0.9 && !B.side) { B.side = heading + (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2 + rnd() * 0.6); B.sideT = S.clock + 0.35; act('sidestep'); }
        if (held > 3 && B.path) {
          report('player-stuck', 'warn', `${B.goal?.type}@${cellOf(p.x, p.y)}`, posOf(p.x, p.y),
            { goal: B.goal && { type: B.goal.type, at: cellOf(B.goal.x, B.goal.y) }, heading: r1(heading), front: inFront(w, p, heading) });
          abandon('stuck');
          B.anchor = null;
        }
      }
      if (B.side && S.clock >= B.sideT) B.side = null;
    } else B.anchor = null;
    // no headway toward the goal for a long time (circling round furniture the grid does not know): give it up
    if (B.goal && heading !== null && !B.goal.crossing) {
      const gd = Math.hypot(B.goal.x - p.x, B.goal.y - p.y), h = B.headway;
      if (gd < h.best - 16) { h.best = gd; h.t = S.clock; }
      else if (S.clock - h.t > 10) abandon('no headway');
    }

    // a locked door on the way: break it open (kicks, blows or rounds into the lock)
    const lockedDoor = B.goal?.breach && !tg && w.doors.find((dd) => dd.locked && Math.hypot(doorMid(dd).x - p.x, doorMid(dd).y - p.y) < 40);
    if (lockedDoor) {
      const m = doorMid(lockedDoor);
      inp.keys.clear();
      aimAt(inp, m.x, m.y);
      if (gun) { if (S.clock > B.fireT) { inp.mouse.clicked[0] = inp.mouse.down[0] = true; B.fireT = S.clock + 0.3; } }
      else inp.mouse.down[0] = true;
      act('breach locked door');
      return;
    }

    // aim and fight
    if (tg) aimAt(inp, tg.x, tg.y);
    else if (heading !== null) aimAt(inp, p.x + Math.cos(heading) * 120, p.y + Math.sin(heading) * 120);
    if (tg) {
      if (gun) {
        if (tdist < 520 && (p.weapon.mag > 0 || p.reserveCount() === 0)) {
          if (d.auto) { inp.mouse.down[0] = true; if (S.clock > B.fireT) { B.fireT = S.clock + 0.4; act('fire (auto)'); } }
          else if (S.clock > B.fireT) { inp.mouse.clicked[0] = true; inp.mouse.down[0] = true; B.fireT = S.clock + 0.12 + rnd() * 0.25; act('fire'); }
        }
      } else if (tdist < reach && !sneaking) { inp.mouse.down[0] = true; act('strike'); }
      if (p.armed && tdist < 220 && tdist > 60 && rnd() < 0.002) { inp.mouse.clicked[2] = true; act('throw weapon'); }
    }
    if (gun && p.reserveCount() > 0 && !p.reloading && (p.weapon.mag === 0 || (!tg && p.weapon.mag < d.mag && rnd() < 0.01))) { press(inp, 'KeyR'); act('reload'); }

    // context actions
    const ca = p.contextAction;
    if (ca && (MELEE_SPACE.has(ca) || (p.nearBack && !VAULTS.has(ca)))) { press(inp, 'Space'); act(`space (${ca})`); }
    else if (heading !== null && !ca && rnd() < 0.004) { press(inp, 'Space'); act('slide'); }
    else if (VAULTS.has(ca) && heading !== null && rnd() < 0.01) { press(inp, 'Space'); act(`space (${ca})`); }
    if (p.nearTrunk) { press(inp, 'KeyE'); act('open trunk'); }
    else if (p.nearItem && (!p.armed || (!gun && p.nearItem.def?.kind === 'gun' && p.nearItem.mag > 0) || rnd() < 0.003)) {
      press(inp, 'KeyE'); act(`pick up ${p.nearItem.type}`);
    }
  }

  const doorMid = (d) => { const t = d.tip(); return { x: (d.hx + t.x) / 2, y: (d.hy + t.y) / 2 }; };

  // at the end of the path
  function arrive(w, p, inp) {
    const g = B.goal;
    if (!g) return;
    if (g.type === 'item' && p.nearItem) { press(inp, 'KeyE'); act(`pick up ${p.nearItem.type}`); }
    if (g.type === 'trunk' && p.nearTrunk) { press(inp, 'KeyE'); act('open trunk'); }
    if (g.type === 'window') return; // windowApproach finishes it
    if (g.type === 'exit') { const ex = w.level.exit; steer(inp, ex.x * TILE - p.x, ex.y * TILE - p.y); return; }
    if (g.type === 'guard') return;
    B.goal = null; B.path = null;
  }

  // last steps to a window: square up to it and jump through (Space while pushing at it)
  function windowApproach(w, p, inp) {
    const g = B.goal, win = g.win;
    if (!g.crossing) g.crossing = S.clock;
    if (p.vaulting) return null;
    // over on the far side: done
    const far = (win.vertical ? (p.x - win.x) * (g.far.x - win.x) : (p.y - win.y) * (g.far.y - win.y)) > 0;
    if (far && Math.hypot(p.x - win.x, p.y - win.y) > 14) { B.goal = null; B.path = null; return null; }
    // refused (furniture on the far side, a wall in the way): try another one
    if (S.clock - g.crossing > 2.5) { S.stats.windowRefused = (S.stats.windowRefused || 0) + 1; abandon('window refused'); return null; }
    inp.keys.clear();
    // square across the wall the window is set in
    const heading = steer(inp, g.far.x - p.x, g.far.y - p.y);
    if (S.clock > B.spaceT) { press(inp, 'Space'); B.spaceT = S.clock + 0.25; act('space (window)'); }
    return heading;
  }

  // ---------------------------------------------------------------- frame / step
  // before a step (fast) or a frame (realtime): the state machine and the inputs
  function tick(dt) {
    const g = game, inp = g.input, st = g.state;
    if (st === 'title') { inp.mouse.clicked[0] = true; inp.anyPressed = true; act('title: click'); return; }
    if (!g.world) return;
    if (g.world !== S.world) onNewWorld(g.world);
    const w = g.world, p = w.player;
    if (st === 'intro') { inp.keys.clear(); if (g.stateT > 0.35) { inp.anyPressed = true; act('intro: key'); } return; }
    if (st === 'pause') { press(inp, 'Escape'); return; }
    if (st === 'dead') {
      inp.keys.clear(); inp.mouse.down[0] = false;
      if (g.stateT > 0.9) { press(inp, 'KeyR'); act('dead: restart'); }
      return;
    }
    if (st === 'results') {
      inp.keys.clear(); inp.mouse.down[0] = false;
      if (!B.resultsSeen) {
        B.resultsSeen = true;
        const r = g.results || {};
        S.stats.clears.push({ session: S.session, score: r.total, grade: r.grade, time: r1(w.time), kills: S.sess.kills });
        cover('exit');
        S.sess.exited = true;
        act(`results ${r.grade} ${r.total}`);
      }
      if (g.stateT > 1.2) { press(inp, 'KeyR'); act('results: restart'); }
      return;
    }
    if (st !== 'play') return;
    // a session going nowhere: start over
    if (S.clock - B.sessionStart > opts.sessionCap && S.clock - S.sess.lastKillT > 60) {
      S.stats.giveUps++;
      act('give up: restart');
      press(inp, 'Backspace');
      return;
    }
    play(w, p, inp);
  }

  // after a step / frame: coverage, detectors, samples
  function after() {
    const g = game, w = g.world;
    if (!w || w !== S.world) return;
    const p = w.player, now = w.time;
    S.steps++;
    // coverage through state changes
    if (p.vaulting && p.vaulting !== B.vaultWas) {
      const v = p.vaulting;
      cover(v.kind === 'window' ? (v.over?.intact ? 'windowDive' : 'windowVault') : v.kind === 'climb' ? 'climb' : 'vault');
      act(`${v.kind === 'window' ? (v.over?.intact ? 'dive through window' : 'vault window') : v.kind}`);
    }
    B.vaultWas = p.vaulting;
    if (p.takedown && p.takedown !== B.takedownWas) { cover('takedown'); act('takedown'); }
    B.takedownWas = p.takedown;
    if (p.execution && p.execution !== B.execWas) { cover('finisher'); act('finisher'); }
    B.execWas = p.execution;
    if (w.cleared && !S.sess.cleared) { S.sess.cleared = true; cover('clear'); act('LEVEL CLEARED'); }
    for (const c of B.trunks) if (c.trunk?.open && !c.__qaOpen) { c.__qaOpen = true; cover('trunk'); }
    if (S.steps % 15 === 0) {
      for (const d of B.locked) if (!d.locked) { B.locked.delete(d); cover('doorBreached'); act('door breached'); }
      for (const d of B.doors) {
        if (B.opened.has(d)) continue;
        if (!w.doors.includes(d) || Math.abs(angDiff(d.a0, d.body.angle)) > 0.5) { B.opened.add(d); cover('doorOpened'); }
      }
      for (const e of w.enemies) wrapGuard(e);
    }
    if (g.state !== 'play' && g.state !== 'dead') return;

    // in-wall: a centre inside a solid tile for more than 0.2 s (a single step of it is counted, not reported)
    const walled = (ch) => !ch.vaulting && w.map.inside(ch.x, ch.y) && w.map.solidAt(ch.x, ch.y);
    const checkWall = (ch, who) => {
      if (!ch.alive || !walled(ch)) { S.inWall.delete(ch); return; }
      const t0 = S.inWall.get(ch);
      if (t0 === undefined) { S.inWall.set(ch, now); S.stats.transientInWall++; return; }
      if (now - t0 > 0.2 && t0 !== -1) {
        S.inWall.set(ch, -1);
        report('in-wall', 'error', `${who}@${cellOf(ch.x, ch.y)}`, posOf(ch.x, ch.y),
          { who, kind: ch.kind, state: ch.state, tile: w.map.at(...cellOf(ch.x, ch.y)), knocked: ch.knocked > 0 });
      }
    };
    checkWall(p, 'player');
    if (S.steps % 6 === 0) {
      for (const e of w.enemies) checkWall(e, 'guard');
      for (const c of w.civilians) checkWall(c, 'civilian');
    }

    if (S.steps % 30 === 0) {
      nanCheck(w);
      outOfMap(w);
      guardStuck(w);
      if (opts.mode === 'realtime') audioCheck();
      else if (S.steps % 600 === 0) audioCheck(true);
    }
    softlock(w, p);

    // leak samples every 10 s of game time
    if (now >= S.sess.nextSample) {
      S.sess.nextSample = now + 10;
      const s = {
        session: S.session, t: Math.round(now), bodies: w.physics.bodies().length, debris: w.debris.length,
        particles: w.particles.list.length, corpses: w.corpses.length, items: w.items.length + (w.ammoItems?.length || 0),
        texts: w.texts.length, projectiles: w.projectiles.length,
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      };
      S.sess.samples.push(s);
      S.newSamples.push(s);
    }
  }

  function nanCheck(w) {
    const bad = (b) => b && !(finite(b.position.x) && finite(b.position.y) && finite(b.velocity.x) && finite(b.velocity.y));
    const flag = (what, o, b) => {
      const pos = b ? { x: b.position.x, y: b.position.y } : { x: o.x, y: o.y };
      report('nan', 'error', what, pos, { what, type: o.type || o.kind, pos: [pos.x, pos.y], vel: b ? [b.velocity.x, b.velocity.y] : null });
    };
    const p = w.player;
    if (bad(p.body) || !finite(p.vel.x) || !finite(p.vel.y)) flag('player', p, p.body);
    for (const e of w.enemies) if (e.alive && (bad(e.body) || !finite(e.vel.x))) flag('guard', e, e.body);
    for (const c of w.civilians) if (c.alive && bad(c.body)) flag('civilian', c, c.body);
    for (const q of w.props) if (!q.dead && bad(q.body)) flag('prop', q, q.body);
    for (const it of w.items) if (!it.dead && bad(it.body)) flag('item', it, it.body);
    for (const it of w.ammoItems || []) if (!it.dead && bad(it.body)) flag('ammo', it, it.body);
    for (const dd of w.debris) if (!dd.dead && bad(dd.body)) flag('debris', dd, dd.body);
    for (const c of w.corpses) {
      if (c.dead) continue;
      for (const part of c.parts || [c]) if (bad(part.body)) { flag('corpse', c, part.body); break; }
    }
  }

  function outOfMap(w) {
    const m = w.map, far = 16 * TILE;
    const out = (x, y, margin = 0) => x < -margin || y < -margin || x > m.widthPx + margin || y > m.heightPx + margin;
    const flag = (who, o) => report('out-of-map', 'error', who, posOf(o.x, o.y), { who, type: o.type || o.kind, at: [Math.round(o.x), Math.round(o.y)], map: [m.widthPx, m.heightPx] });
    const p = w.player;
    if (p.alive && out(p.x, p.y)) flag('player', p);
    for (const e of w.enemies) if (e.alive && out(e.x, e.y)) flag('guard', e);
    for (const c of w.civilians) if (c.alive && out(c.x, c.y, far)) flag('civilian', c);
    // a loose item may sink a few px into the invisible edge bars (physics overlap), not get through them
    for (const it of w.items) if (!it.dead && out(it.x, it.y, 8)) flag('item', it);
    for (const it of w.ammoItems || []) if (!it.dead && out(it.x, it.y, 8)) flag('ammo', it);
  }

  // a guard asked to walk somewhere (travel() called lately, target still far) who has not moved 6 px in 6 s
  function guardStuck(w) {
    for (const e of w.enemies) {
      const q = e.__qa;
      if (!q) continue;
      const tr = q.travel;
      const travelling = e.alive && !e.yielded && !(e.knocked > 0) && !e.held && !e.executing && !e.vaulting
        && tr && w.time - tr.t < 0.25 && Math.hypot(tr.x - e.x, tr.y - e.y) > Math.max(40, tr.near + 24);
      if (!travelling) { q.anchor = null; continue; }
      if (!q.anchor || Math.hypot(e.x - q.anchor.x, e.y - q.anchor.y) > 6) { q.anchor = { x: e.x, y: e.y, t: w.time, reported: false }; continue; }
      if (!q.anchor.reported && w.time - q.anchor.t > 6) {
        q.anchor.reported = true;
        report('guard-stuck', 'warn', `${e.state}@${cellOf(e.x, e.y)}`, posOf(e.x, e.y), {
          kind: e.kind, state: e.state, sub: e.sub, tactic: e.tactic, activity: e.activity, to: posOf(tr.x, tr.y),
          dist: Math.round(Math.hypot(tr.x - e.x, tr.y - e.y)), path: e.path ? e.path.length - e.pathIdx : 0,
          doorWait: r1(e.doorT || 0), gateWait: r1(e.gateWait || 0), speed: r1(e.moving || 0), front: inFront(w, e, Math.atan2(tr.y - e.y, tr.x - e.x)),
        });
      }
    }
  }

  function softlock(w, p) {
    const now = w.time;
    // every guard down (or given up) but the level not cleared
    if (w.enemiesLeft === 0 && !w.cleared) {
      if (B.leftZero === null) B.leftZero = now;
      else if (now - B.leftZero > 2) report('softlock', 'error', 'not-cleared', posOf(p.x, p.y), { why: 'enemiesLeft is 0 but world.cleared stays false', left: w.enemies.filter((e) => e.alive).map((e) => ({ kind: e.kind, state: e.state, yielded: e.yielded })) });
    } else B.leftZero = null;
    const ex = w.level.exit;
    if (!w.cleared || !ex || !p.alive) { B.exitSince = null; return; }
    // no way to the exit
    if (now - B.exitPathT > 5) {
      B.exitPathT = now;
      if (!findPath(w.map, p.x, p.y, ex.x * TILE, ex.y * TILE, 20000)) report('softlock', 'error', 'no-path-to-exit', posOf(p.x, p.y), { why: 'level cleared but no grid path from the player to the exit', exit: ex });
    }
    // standing in the exit and nothing happens
    const inExit = Math.hypot(p.x - ex.x * TILE, p.y - ex.y * TILE) < ex.r * TILE - 2;
    if (inExit && game.state === 'play') {
      if (B.exitSince === null) B.exitSince = now;
      else if (now - B.exitSince > 1.5) report('softlock', 'error', 'no-results', posOf(p.x, p.y), { why: 'player inside the exit of a cleared level, no results screen', exited: w.exited });
    } else B.exitSince = null;
  }

  function audioCheck(stateOnly = false) {
    if (!Audio) return;
    const ctx = Audio.ctx;
    S.stats.audioState = ctx ? ctx.state : 'none';
    if (S.clock > 3 && (!ctx || ctx.state !== 'running')) report('audio', 'warn', 'context', null, { why: 'audio context not running after the click', state: ctx ? ctx.state : 'none' });
    if (stateOnly) return;
    const n = Audio.active?.length || 0;
    S.stats.maxVoices = Math.max(S.stats.maxVoices || 0, n);
    if (n >= 40) report('audio', 'warn', 'voices', null, { why: 'active voices at or above 40 (the hard cap)', active: n, names: Object.entries((Audio.active || []).reduce((o, a) => { o[a.name] = (o[a.name] || 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8) });
  }

  function renderError(e, where) {
    S.stats.renderErrors++;
    report('exception', 'error', `${where}: ${firstLine(e?.message || e)}`, game.world ? posOf(game.world.player.x, game.world.player.y) : null,
      { where, message: String(e?.message || e), stack: String(e?.stack || '').split('\n').slice(0, 8).join('\n') });
  }

  // ---------------------------------------------------------------- API used by run.mjs
  qa.init = async (o) => {
    opts = { seed: 1, god: false, mode: 'fast', sessionCap: 300, ...o };
    rnd = prng(opts.seed * 7919 + 13);
    game = window.game;
    if (!game) throw new Error('window.game missing');
    ({ findPath } = await import('/src/engine/nav/Pathfinding.js'));
    ({ killStyle } = await import('/src/game/systems/Scoring.js'));
    try { Audio = (await import('/src/audio/Audio.js')).default; } catch { Audio = null; }
    // every error a draw swallows, not only the first one the game logs
    const safeDraw = game.safeDraw;
    game.safeDraw = function (ctx, fn) { return safeDraw.call(this, ctx, () => { try { fn(); } catch (e) { renderError(e, 'render'); throw e; } }); };
    if (opts.mode === 'fast') {
      // the page's loop only draws, when a batch asks for a frame; the bot runs the logic
      game.loop = () => {
        requestAnimationFrame(game.loop);
        if (!S.renderWanted) return;
        S.renderWanted = false;
        try { game.render(); } catch (e) { renderError(e, 'render (outside safeDraw)'); }
        const done = S.frameDone; S.frameDone = null; done?.();
      };
    } else {
      const update = game.update;
      game.update = function (dt) {
        tick(dt);
        update.call(this, dt);
        S.clock += dt;
        after();
      };
    }
    return { features: FEATURES };
  };

  const frame = () => new Promise((done) => {
    S.renderWanted = true;
    S.frameDone = done;
    setTimeout(() => { if (S.frameDone === done) { S.renderWanted = false; S.frameDone = null; try { game.render(); } catch (e) { renderError(e, 'render'); } done(); } }, 250);
  });

  // fast mode: n steps (stops early at the first occurrence of a new kind of finding, for its screenshot)
  qa.batch = async (n) => {
    const g = game;
    let errs = 0;
    for (let i = 0; i < n; i++) {
      g.time += DT;
      g.stateT += DT;
      tick(DT);
      const before = g.world, t0 = performance.now();
      try { g.update(DT); } catch (e) {
        errs++;
        report('exception', 'error', `update: ${firstLine(e?.message || e)}`, g.world ? posOf(g.world.player.x, g.world.player.y) : null,
          { where: 'game.update', state: g.state, message: String(e?.message || e), stack: String(e?.stack || '').split('\n').slice(0, 8).join('\n') });
        // a world that keeps throwing is no use: start over
        if (S.findings.get(`exception|update: ${firstLine(e?.message || e)}`).count % 50 === 0) { S.stats.forcedRestarts++; act('forced restart'); try { g.newGame(); } catch { /* reported */ } }
      }
      const ms = performance.now() - t0;
      if (g.world === before && g.state === 'play') {
        const T = S.timing;
        T.n++; T.ms += ms;
        if (ms > T.worst) { T.worst = ms; T.worstAt = { t: r1(S.clock), session: S.session }; }
        if (ms > 50) report('slow', 'warn', 'worst-step', g.world ? posOf(g.world.player.x, g.world.player.y) : null, { ms: r1(ms), physicsMs: r1(g.world?.physics.stepMs || 0), why: 'one game.update step over 50 ms' });
      }
      S.clock += DT;
      after();
      if (S.freshKinds.length) break;
    }
    await frame();
    return qa.status();
  };

  // realtime mode: nothing to drive, just read
  qa.poll = async () => {
    if (game.perf) S.perfSamples.push({ t: r1(S.clock), ...game.perf });
    return qa.status();
  };

  qa.status = () => {
    const w = game.world, p = w?.player;
    const out = {
      clock: S.clock, steps: S.steps, state: game.state, session: S.session, worldT: r1(w?.time || 0),
      pos: p ? posOf(p.x, p.y) : null, lastActions: lastActions(),
      findings: [...S.dirty].map((k) => S.findings.get(k)), freshKinds: S.freshKinds.splice(0),
      samples: S.newSamples.splice(0), perf: game.perf || null,
      sessions: S.stats.sessions, deaths: Object.values(S.stats.deaths).reduce((a, b) => a + b, 0),
      clears: S.stats.clears.length, kills: S.stats.playerKills, timing: { ...S.timing },
    };
    S.dirty.clear();
    return out;
  };

  // look at a spot for a screenshot (null: back on the player)
  qa.focus = async (x, y) => {
    const w = game.world;
    document.getElementById('qa-mark')?.remove();
    if (!w) return;
    if (x === undefined || x === null) game.camera.snap(w.player.x, w.player.y);
    else {
      game.camera.snap(x, y);
      // a ring over the spot (a page element, the game's canvas is left alone)
      const s = game.camera.worldToScreen(x, y), k = game.canvas.getBoundingClientRect().width / game.canvas.width;
      const m = document.createElement('div');
      m.id = 'qa-mark';
      m.style.cssText = `position:fixed;left:${s.x * k - 22}px;top:${s.y * k - 22}px;width:40px;height:40px;border:2px dashed #ff2a2a;border-radius:50%;pointer-events:none;z-index:9`;
      document.body.appendChild(m);
    }
    if (opts.mode === 'fast') await frame();
    else await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  // what the bot is up to (in the final report, and handy from the console)
  qa.debug = () => {
    const w = game.world, p = w?.player;
    return {
      state: game.state, goal: B.goal && { type: B.goal.type, at: cellOf(B.goal.x, B.goal.y) }, path: B.path ? `${B.idx}/${B.path.length}` : null,
      target: B.target && { kind: B.target.kind, at: cellOf(B.target.x, B.target.y), aware: B.target.aware, knocked: B.target.knocked > 0 },
      player: p && { at: posOf(p.x, p.y), alive: p.alive, weapon: p.weapon?.type || 'fists', sit: p.sit, ctx: p.contextAction, execution: !!p.execution, takedown: !!p.takedown, vaulting: !!p.vaulting },
      guardsLeft: w?.enemiesLeft, lastActions: lastActions(),
    };
  };

  qa.final = () => {
    const st = S.stats;
    return {
      bot: qa.debug(),
      stats: st, features: FEATURES, perfSamples: S.perfSamples.slice(-400), timing: S.timing,
      sessions: S.sessions.map(({ samples, nextSample, ...s }) => ({ ...s, samples: samples.length })),
      findings: [...S.findings.values()],
    };
  };
})();
