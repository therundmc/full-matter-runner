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
  const MELEE_CLICK = new Set(['EXECUTE']); // context actions done with the left click
  const VAULTS = new Set(['VAULT', 'DIVE THROUGH', 'CLIMB']);
  // a gun guard who sees him and is about to fire, far enough for a slide to carry him under the round
  const underFire = (w, p) => w.enemies.some((e) => e.alive && e.sees && e.def.kind === 'gun' && e.react <= 0.1
    && e.cooldown <= 0.15 && Math.hypot(e.x - p.x, e.y - p.y) > 70);
  // features a long session should exercise at least once (else a 'not-covered' warning, see run.mjs), unless the
  // level has nothing for it (notApplicable)
  const FEATURES = ['vault', 'windowDive', 'windowVault', 'climb', 'ladderUp', 'ladderDown', 'roofDrop', 'roll', 'slide', 'takedown', 'envTakedown',
    'finisher', 'trunk', 'doorOpened', 'doorBreached', 'weaponBroken', 'pickup', 'throw', 'thrownKill', 'reload', 'gunKill', 'meleeKill',
    'powerCut', 'horn', 'dyingCrawl', 'dyingCurl', 'dyingSpasm', 'dyingThroat', 'clear', 'exit', 'deviceUse'];
  const DYING = { crawl: 'dyingCrawl', curl: 'dyingCurl', spasm: 'dyingSpasm', throat: 'dyingThroat' };

  // Plans: what the bot sets out to do, drawn at each session start (and again after a while of free play) from a
  // seeded shuffled deck, so each comes up as often as the others. A plan is a list of steps (tile coordinates):
  //   go: [x, y]        walk there (grid path; a locked door on the way is broken open)
  //   to: [x, y]        walk straight there (where the grid sees furniture: the liquor store is mostly blocked cells)
  //   cross: [x, y]     push toward it and press Space (ladder, parapet, counter): done when the move is over
  //   pick: type        walk to the nearest such weapon (by `near`, within `r` tiles, or anywhere with `any`;
  //                     `direct`: straight at it, not along the grid), E
  //   trunk             open the first closed trunk (skipped when already armed); a pick `optional` is skipped
  //                     when there is no such weapon
  //   wait: s           stand there s seconds (in a traffic lane: a held-up driver leans on his horn)
  //   smash: type       go to `stand`, then strike or shoot the prop by `near` until it is gone (`enough`: s of it)
  //   use: kind         walk to the device spot of that kind (systems/Uses.js; by `near`) and press E there
  // then the bot plays freely, in the plan's `style` ('throw': blades are thrown at guards in range).
  // ok(w, p): whether the plan still makes sense now. Routes through the map are level 1's; a level with no entry
  // here only plays 'free'. A plan marked `rescue` is never drawn, only started when needed.
  const FIRE_ESCAPE = [{ go: [1.5, 21.4] }, { cross: [1.5, 19.3] }]; // up the street corner's ladder onto the liquor store roof
  const DROP_LOT = [{ go: [9.45, 3.5] }, { cross: [11.7, 3.5] }];    // over the parapet, down into the back lot (a roll)
  const DROP_ALLEY = [{ go: [9.45, 12.5] }, { cross: [11.7, 12.5] }]; // ... into the service alley
  // the liquor store: the pistol lies behind the counter, in the aisle between it and the shelves that leads west to
  // the foot of the shop's ladder (all of it blocked cells for the grid)
  const PISTOL = { pick: 'pistol', near: [8.5, 17.5], r: 3, direct: true };
  const SHOP_DOWN = [{ go: [3.5, 15.45] }, { cross: [3.5, 17.6] }];  // down the shop's own ladder, into the aisle
  const SHOP_UP = [{ to: [3.5, 17.75] }, { to: [3.5, 17.45] }, { cross: [3.5, 15.4] }];
  const COUNTER_IN = [{ go: [8.5, 19.5] }, { cross: [8.5, 17.7] }];  // in by the front door (locked: broken open), over the counter
  const COUNTER_OUT = [{ to: [8.5, 17.75] }, { cross: [8.5, 19.6] }];
  const itemNear = (w, type, at, r) => w.items.find((it) => !it.dead && it.type === type && Math.hypot(it.x - at[0] * TILE, it.y - at[1] * TILE) < r * TILE);
  const TIRE_IRON = [{ trunk: true }, { pick: 'tire_iron', near: [13.5, 24], r: 4, optional: true }];
  const THROW = { steps: [{ pick: 'knife', any: true }], style: 'throw', ok: (w) => w.items.some((it) => !it.dead && it.type === 'knife') };
  // a device of the level that can be used now (data/devices.js)
  const usable = (kind) => (w, p) => w.uses.spots.some((s) => s.kind === kind && (!s.ok || s.ok(p)));
  const PLANS = {
    level1: {
      free: { steps: [] },
      trunk: { steps: TIRE_IRON, ok: (w, p) => !p.armed && B.trunks.some((c) => !c.dead && !c.trunk.open) },
      roof: { steps: [...FIRE_ESCAPE, ...DROP_LOT] },
      roofShop: { steps: [...FIRE_ESCAPE, ...SHOP_DOWN, PISTOL, ...SHOP_UP, ...DROP_ALLEY], ok: (w) => !!itemNear(w, 'pistol', PISTOL.near, 3) },
      liquor: { steps: [...COUNTER_IN, PISTOL, ...COUNTER_OUT], ok: (w, p) => !p.hasGun && !!itemNear(w, 'pistol', PISTOL.near, 3) },
      // the back lot is watched (a patrol, a doorman by the back door): a tire iron first, if the trunk still has it
      fuse: { steps: [...TIRE_IRON, { smash: 'fuse_box', near: [23.5, 4.92], stand: [23.5, 4.3] }], ok: (w) => w.power.on },
      // in the westbound lane until a driver stops and leans on his horn: --god only, drivers see a man in the road
      // late by design (Traffic.Driver attention) and he is nearly always run over
      road: { steps: [{ go: [17.5, 26.2] }, { wait: 15 }], ok: () => opts.god },
      throw: { steps: [{ pick: 'knife', near: [30.5, 17.5], r: 3, any: true }], style: 'throw' },
      // the level's devices: the jukebox turned up, the fire alarm pulled (rain, panic, a slick floor), the kegs behind the counter holed (beer: runners
      // slip), down the TV shop's trapdoor and up in the back room
      jukebox: { steps: [{ use: 'jukebox' }], ok: usable('jukebox') },
      alarm: { steps: [{ use: 'fire_alarm' }], ok: usable('fire_alarm') },
      kegs: { steps: [{ smash: 'keg', near: [15.36, 12.45], enough: 3 }], ok: (w) => w.props.some((q) => q.type === 'keg' && !q.dead) },
      passage: { steps: [{ use: 'trapdoor', near: [35.55, 17.95] }, { wait: 2.5 }], ok: usable('trapdoor') },
      // off the roof when a failed plan left the bot up there (the grid has no way down: ladders and parapets block)
      offRoof: { steps: DROP_ALLEY, rescue: true },
    },
    lab: {
      free: { steps: [] },
      throw: THROW,
      // the lab's stations that need a hand: its jukebox, its fire alarm, its kegs, its trapdoors, its fuse box
      jukebox: { steps: [{ use: 'jukebox' }], ok: usable('jukebox') },
      alarm: { steps: [{ use: 'fire_alarm' }], ok: usable('fire_alarm') },
      kegs: { steps: [{ smash: 'keg', near: [44.4, 12.4], enough: 3 }], ok: (w) => w.props.some((q) => q.type === 'keg' && !q.dead) },
      passage: { steps: [{ use: 'trapdoor', near: [45.4, 5.0] }, { wait: 2.5 }], ok: usable('trapdoor') },
      fuse: { steps: [{ smash: 'fuse_box', near: [35.5, 7.08], stand: [35.5, 7.7] }], ok: (w) => w.power.on },
    },
    // the tutorial: played freely room after room, then out by the front room window once nobody is left (`out` is
    // started by hand when the level is cleared: it has no exit zone)
    tutorial: { free: { steps: [] }, out: { steps: [{ go: [4.7, 14.5] }, { cross: [1.6, 14.5] }], rescue: true } },
    street: {
      free: { steps: [] },
      throw: THROW,
      road: { steps: [{ go: [20.5, 11.2] }, { wait: 15 }], ok: () => opts.god },
      road2: { steps: [{ go: [24.5, 14.2] }, { wait: 15 }], ok: () => opts.god },
    },
  };

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
    clock: 0, steps: 0, session: 0, world: null, sess: null, deck: [],
    findings: new Map(), dirty: new Set(), freshKinds: [],
    actions: [],
    stats: {
      sessions: 0, deaths: {}, deathsBy: {}, deathsIn: {}, clears: [], exits: 0, giveUps: 0, forcedRestarts: 0,
      kills: 0, playerKills: 0, styles: {}, tags: {}, killWeapons: {}, picked: {}, fired: {}, civilians: {},
      coverage: Object.fromEntries(FEATURES.map((f) => [f, 0])), maxKills: 0, maxKillsSession: 0,
      goalsAbandoned: 0, goals: {}, transientInWall: 0, renderErrors: 0,
      plans: {}, dying: {}, notApplicable: null, ammoOnFloor: 0, devices: {}, slips: 0, envTakedowns: {},
      // the guards and the street at work (aiCheck, the 'challenge' / 'heldUp' events): guards entering a fight, a
      // guard in a fight who got within reach of the player, travellers held 3 s on one spot, challenges by act and by
      // the stage they reached, drivers held up at gunpoint
      ai: { engaged: 0, reached: 0, stall3: 0, challenges: {}, stages: {}, heldUp: {} },
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
    if (B.plan) planStat(B.plan.name).cut++; // the session ended under it (death, restart)
    S.world = w;
    S.session++;
    S.stats.sessions++;
    const sess = S.sess = {
      index: S.session, start: r1(S.clock), kills: 0, playerKills: 0, died: null, cleared: false, exited: false,
      samples: [], nextSample: 0, startBodies: w.physics.bodies().length,
      heapStart: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      guards: w.totalEnemies, lastKillT: S.clock, plans: [],
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
    // the horn of a held-up driver (systems/Ambient.js) is only a sound: listen for it
    const sound = w.sound;
    w.sound = function (name, ...a) { if (name === 'horn') { cover('horn'); act('horn'); } return sound.call(this, name, ...a); };
    // the ways through walls (ladders, parapets) take marks but must never go: watch them and what hit them last
    B.lasting = w.props.filter((q) => q.def.lasting);
    for (const q of B.lasting) {
      const hit = q.hit;
      q.hit = function (damage, px, py, dirA, power, kind, ...a) { this.__qaHit = { damage, kind, t: r1(w.time) }; return hit.call(this, damage, px, py, dirA, power, kind, ...a); };
    }
    if (!S.stats.notApplicable) S.stats.notApplicable = notApplicable(w);
    const ev = w.events;
    ev.on('kill', (e) => onKill(w, e));
    ev.on('powerCut', () => { cover('powerCut'); act('POWER CUT'); B.powerCheckT = w.time + 1.5; });
    ev.on('slide', ({ ch }) => { if (ch?.isPlayer) cover('slide'); });
    ev.on('challenge', ({ act: what, stage }) => {
      if (stage === 1) bump(S.stats.ai.challenges, what);
      bump(S.stats.ai.stages, stage);
      act(`challenged (${what}, ${stage})`);
    });
    ev.on('heldUp', ({ how }) => bump(S.stats.ai.heldUp, how));
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
    B.powerCheckT = null; B.lastingSeen = new Set();
    B.plan = null; B.style = null;
    act(`session ${S.session}`);
    startPlan(w, p, drawPlan(w, p));
  }

  // features this level has nothing for (no 'not-covered' warning about them)
  function notApplicable(w) {
    const has = (type) => w.props.some((q) => q.type === type);
    const na = [];
    if (!has('ladder')) na.push('ladderUp', 'ladderDown');
    if (!has('parapet')) na.push('roofDrop');
    if (!w.props.some((q) => q.def.land === 'roll')) na.push('roll'); // parapets, chain-link fences
    if (!w.power.zone) na.push('powerCut');
    if (!w.level.ambient?.traffic?.length) na.push('horn');
    if (!w.props.some((q) => q.trunk)) na.push('trunk');
    if (!w.windows.length) na.push('windowDive', 'windowVault');
    if (!w.doors.some((d) => d.locked)) na.push('doorBreached');
    if (!w.level.exit) na.push('exit');
    if (!w.enemies.length) na.push('takedown', 'envTakedown', 'finisher', 'gunKill', 'meleeKill', 'thrownKill', ...Object.values(DYING), 'clear');
    if (!w.uses?.spots.length) na.push('deviceUse');
    return na;
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
      // what he was locked in when it got him (a ground finisher, a takedown), or free
      bump(S.stats.deathsIn, victim.execution ? 'finisher' : victim.takedown ? 'takedown' : 'free');
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
    if (e.how?.thrown) { cover('thrownKill'); act('THROWN KILL'); }
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
    const wantGun = B.style !== 'throw' && !p.hasGun && items.some(loaded); // a blade thrower keeps to blades
    const options = [];
    if (guards.length) options.push({ w: p.armed ? 7 : 3, f: () => { const g = near(guards).find(({ o }) => !blacklisted(o.x, o.y)) || near(guards)[0]; return { type: 'guard', x: g.o.x, y: g.o.y, guard: g.o }; } });
    const gunNear = wantGun && items.some((x) => loaded(x) && x.d < 400);
    if (items.length && (!p.armed || wantGun)) options.push({ w: gunNear ? 12 : p.armed ? 3 : 8, f: () => { const pool = wantGun ? items.filter(loaded) : items, it = pool[Math.floor(rnd() * Math.min(3, pool.length))].o; return { type: 'item', x: it.x, y: it.y, item: it }; } });
    // rounds on the floor: for the gun in hand, or of a caliber we have none of (level 1: a guard's dropped magazine
    // is the only way to a reload)
    const mine = (o) => p.hasGun && o.type === p.def.ammo;
    const ammo = near((w.ammoItems || []).filter((a) => !a.dead && !blacklisted(a.x, a.y)))
      .filter(({ o, d }) => d < 12 * TILE && p.ammo[o.type] < (mine(o) ? p.def.mag * 2 : 1));
    if (ammo.length) options.push({ w: mine(ammo[0].o) ? 4 : 1.5, f: () => ({ type: 'ammo', x: ammo[0].o.x, y: ammo[0].o.y, item: ammo[0].o }) });
    const trunks = B.trunks.filter((c) => !c.dead && c.trunk && !c.trunk.open);
    if (trunks.length) options.push({ w: p.armed ? 0.6 : 3, f: () => { const c = trunks[0], at = c.toWorld(-14, c.h / 2); return { type: 'trunk', x: at.x, y: at.y, car: c }; } });
    if (w.doors.length) options.push({ w: 1, f: () => doorGoal(w, p, w.doors[Math.floor(rnd() * w.doors.length)]) });
    if (w.windows.length) options.push({ w: 1.3, f: () => windowGoal(w, p, w.windows[Math.floor(rnd() * w.windows.length)]) });
    options.push({ w: 0.8, f: () => { const [cx, cy] = B.walkable[Math.floor(rnd() * B.walkable.length)]; return { type: 'wander', x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE }; } });
    options.push({ w: guards.length ? 0.6 : 4, f: () => (smashGoal(w, p) ? 'plan' : null) });
    for (let i = 0; i < 6; i++) {
      const g = pickWeighted(options).f();
      if (g === 'plan') return true;
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

  // a way round what burns (systems/FireSpread.js): a tile with fire in it costs a long detour
  const fireCost = (w) => (w.fireSpread?.burning.length ? (i) => (w.fireSpread.hot(i) ? 30 : 0) : null);

  function setGoal(w, p, g) {
    let path = findPath(w.map, p.x, p.y, g.x, g.y, 8000, fireCost(w));
    g.breach = false;
    if (!path && w.doors.some((d) => d.locked)) {
      // through a locked door, to be broken open on the way: plan as if its cells were free (restored at once)
      const m = w.map.blocked, cells = w.doors.filter((d) => d.locked).flatMap((d) => d.cells), was = cells.map((i) => m[i]);
      for (const i of cells) m[i] = 0;
      try { path = findPath(w.map, p.x, p.y, g.x, g.y, 8000, fireCost(w)); } finally { cells.forEach((i, k) => { m[i] = was[k]; }); }
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

  // ---------------------------------------------------------------- plans (see PLANS)
  const onRoofTile = (w, x, y) => w.map.at(...cellOf(x, y)) === '^';
  const guardsUp = (w) => w.enemies.some((e) => e.alive && !e.yielded);
  const planStat = (name) => S.stats.plans[name] || (S.stats.plans[name] = { started: 0, done: 0, cut: 0, skipped: 0, failed: {} });
  const stepName = (st) => (st.go ? `go ${st.go}` : st.to ? `to ${st.to}` : st.cross ? `cross ${st.cross}` : st.pick ? `pick ${st.pick}`
    : st.trunk ? 'trunk' : st.wait ? `wait ${st.wait}` : st.use ? `use ${st.use}` : `smash ${st.smash}`);

  // the next plan of the deck that makes sense now ('free' only at a session start; rescues are never drawn)
  function drawPlan(w, p, start = true) {
    const plans = PLANS[opts.level] || { free: { steps: [] } };
    const names = Object.keys(plans).filter((n) => !plans[n].rescue && (!opts.plans || opts.plans.includes(n)));
    if (!names.length) return start ? 'free' : null;
    for (let i = 0; i < names.length * 2; i++) {
      if (!S.deck.length) {
        S.deck = names.slice();
        for (let k = S.deck.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [S.deck[k], S.deck[j]] = [S.deck[j], S.deck[k]]; }
      }
      const name = S.deck.shift(), plan = plans[name];
      if (name === 'free' && !start) continue;
      if (!plan.ok || plan.ok(w, p)) return name;
      planStat(name).skipped++;
    }
    return start ? 'free' : null;
  }

  function startPlan(w, p, name, steps = PLANS[opts.level]?.[name]?.steps || []) {
    planStat(name).started++;
    S.sess.plans.push(name);
    const style = PLANS[opts.level]?.[name]?.style;
    if (style) B.style = style;
    B.nextPlanT = S.clock + 40;
    act(`plan ${name}`);
    B.plan = { name, steps, i: -1 };
    nextStep(w, p);
  }

  function endPlan(ok, why) {
    const pl = B.plan;
    if (!pl) return null;
    if (ok) { planStat(pl.name).done++; act(`plan ${pl.name} done`); }
    else {
      const at = `${pl.i}: ${stepName(pl.steps[pl.i])}: ${why}`;
      bump(planStat(pl.name).failed, at);
      act(`plan ${pl.name} failed (${at})`);
      // a route that breaks is worth a look (a ladder that no longer takes him, a door that will not give); a roaming
      // smash that cannot get there is not
      const p = game.world.player;
      if (pl.name !== 'smash' && why !== 'level cleared') {
        report('plan-failed', 'warn', `${pl.name} ${at}`, posOf(p.x, p.y), { plan: pl.name, step: at, weapon: p.weapon?.type || 'fists', goal: B.goal && B.goal.type, ctx: p.contextAction });
      }
    }
    B.plan = B.step = null; B.goal = B.path = null;
    B.nextPlanT = S.clock + 40;
    return null;
  }

  // a stand point by prop q: its own cell if free, else the free neighbour nearest to the player
  function standBy(w, p, q) {
    const [cx, cy] = cellOf(q.x, q.y);
    if (!w.map.isBlocked(cx, cy)) return { x: q.x, y: q.y };
    let best = null;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (w.map.isBlocked(cx + ox, cy + oy)) continue;
      const at = { x: (cx + ox + 0.5) * TILE, y: (cy + oy + 0.5) * TILE }, d = Math.hypot(at.x - p.x, at.y - p.y);
      if (!best || d < best.d) best = { ...at, d };
    }
    return best;
  }

  function nextStep(w, p) {
    const pl = B.plan;
    if (++pl.i >= pl.steps.length) return endPlan(true);
    const st = B.step = { ...pl.steps[pl.i], t0: S.clock };
    B.goal = B.path = null;
    const go = (g) => (setGoal(w, p, g) ? undefined : endPlan(false, 'no path'));
    if (st.go) { st.x = st.go[0] * TILE; st.y = st.go[1] * TILE; return go({ type: 'route', x: st.x, y: st.y }); }
    const spot = st.to || st.cross;
    if (spot) { st.x = spot[0] * TILE; st.y = spot[1] * TILE; st.best = Infinity; return null; }
    if (st.pick) return p.weapon?.type === st.pick ? nextStep(w, p) : findItem(w, p, st);
    if (st.wait) return null;
    if (st.use) {
      const near = st.near && { x: st.near[0] * TILE, y: st.near[1] * TILE };
      st.spot = w.uses.spots.filter((u) => u.kind === st.use && (!u.ok || u.ok(p)))
        .sort((a, b) => (near ? Math.hypot(w.uses.at(a).x - near.x, w.uses.at(a).y - near.y) - Math.hypot(w.uses.at(b).x - near.x, w.uses.at(b).y - near.y) : 0))[0];
      if (!st.spot) return endPlan(false, `no ${st.use} to use`);
      const at = w.uses.at(st.spot), stand = standBy(w, p, at);
      if (!stand) return endPlan(false, 'nowhere to stand');
      st.x = at.x; st.y = at.y; st.best = Infinity; st.stand = stand;
      return go({ type: 'route', x: stand.x, y: stand.y });
    }
    if (st.trunk) {
      st.car = B.trunks.find((c) => !c.dead && !c.trunk.open);
      if (!st.car || p.armed) return nextStep(w, p);
      const at = st.car.toWorld(-14, st.car.h / 2);
      return go({ type: 'trunk', x: at.x, y: at.y, car: st.car });
    }
    // smash
    st.prop = st.prop || w.props.find((q) => !q.dead && q.type === st.smash && Math.hypot(q.x - st.near[0] * TILE, q.y - st.near[1] * TILE) < 1.5 * TILE);
    if (!st.prop) return nextStep(w, p);
    const at = st.stand ? { x: st.stand[0] * TILE, y: st.stand[1] * TILE } : standBy(w, p, st.prop);
    if (!at) return endPlan(false, 'nowhere to stand');
    st.x = at.x; st.y = at.y;
    return go({ type: 'route', x: st.x, y: st.y });
  }

  // the weapon a pick step is after (one just thrown out of a trunk may take a step to show up)
  function findItem(w, p, st) {
    st.item = (st.near && itemNear(w, st.pick, st.near, st.r || 2))
      || (st.any && w.items.filter((it) => !it.dead && it.type === st.pick).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]);
    if (!st.item) return S.clock - st.t0 < 1.5 ? null : st.optional ? nextStep(w, p) : endPlan(false, `no ${st.pick} left`);
    if (st.direct) { st.best = Infinity; return null; }
    return setGoal(w, p, { type: 'item', x: st.item.x, y: st.item.y, item: st.item }) ? undefined : endPlan(false, 'no path');
  }

  // one frame of the current step: a heading when the step steers itself (cross, smash), null to stand, undefined to
  // follow the path the step planned (go, pick, trunk)
  function runPlan(w, p, inp) {
    const st = B.step;
    if (w.cleared && w.level.exit && !onRoofTile(w, p.x, p.y)) return endPlan(false, 'level cleared');
    if (S.clock - st.t0 > (st.cross ? 4 : st.to || st.direct ? 8 : 45)) return endPlan(false, 'timeout');
    if (st.go) {
      if (Math.hypot(p.x - st.x, p.y - st.y) < 8) return nextStep(w, p);
      return B.goal ? undefined : endPlan(false, 'gave up the way');
    }
    if (st.to) return Math.hypot(p.x - st.x, p.y - st.y) < 6 ? nextStep(w, p) : straight(p, inp, st, st.x, st.y);
    if (st.wait) return S.clock - st.t0 > st.wait ? nextStep(w, p) : null;
    if (st.cross) {
      if (p.vaulting) { st.vaulted = true; return null; }
      if (st.vaulted) return nextStep(w, p);
      const h = steer(inp, st.x - p.x, st.y - p.y);
      if (VAULTS.has(p.contextAction) && S.clock > B.spaceT) { press(inp, 'Space'); B.spaceT = S.clock + 0.3; act(`space (${p.contextAction})`); }
      return h;
    }
    if (st.pick) {
      if (p.weapon?.type === st.pick) return nextStep(w, p);
      if (!st.item) return findItem(w, p, st);
      if (st.item.dead) return endPlan(false, `${st.pick} taken`);
      if (p.nearItem === st.item) { press(inp, 'KeyE'); act(`pick up ${st.pick}`); }
      if (st.direct) return straight(p, inp, st, st.item.x, st.item.y);
      return B.goal ? undefined : endPlan(false, 'gave up the way');
    }
    if (st.trunk) {
      if (st.car.dead || st.car.trunk.open) return nextStep(w, p);
      if (p.nearTrunk) { press(inp, 'KeyE'); act('open trunk'); }
      return B.goal ? undefined : endPlan(false, 'gave up the way');
    }
    if (st.use) {
      if (st.pressed) return nextStep(w, p);
      if (p.nearUse === st.spot) {
        press(inp, 'KeyE');
        st.pressed = true;
        act(`use ${st.use}`);
        cover('deviceUse');
        bump(S.stats.devices, st.use);
        return null;
      }
      // the grid takes him to the cell by it (again, if he lost the way), the last steps are straight at it
      const d = Math.hypot(p.x - st.stand.x, p.y - st.stand.y);
      if (B.goal) { if (d > 8) return undefined; B.goal = B.path = null; }
      if (d > 48 && S.clock > (st.retry || 0)) {
        st.retry = S.clock + 2;
        if (setGoal(w, p, { type: 'route', x: st.stand.x, y: st.stand.y })) return undefined;
      }
      return straight(p, inp, st, st.x, st.y);
    }
    // smash: get there, then hit it until it is gone (a roaming smash stops after a few seconds of it)
    const q = st.prop, d = Math.hypot(q.x - p.x, q.y - p.y);
    if (q.dead || !w.props.includes(q) || (q.type === 'fuse_box' && !w.power.on)) { act(`smashed ${q.type}`); return nextStep(w, p); }
    // a gun shoots it from where it is seen; a blow needs to be at it
    const shoot = p.def.kind === 'gun' && d < 220 && w.lineOfSight(p.x, p.y, q.x, q.y);
    if (!st.at && (Math.hypot(p.x - st.x, p.y - st.y) < 8 || d < 22 || shoot)) { st.at = S.clock; B.goal = B.path = null; }
    if (!st.at) return B.goal ? undefined : endPlan(false, 'gave up the way');
    if (st.enough && S.clock - st.at > st.enough) return nextStep(w, p);
    if (S.clock - st.at > 8) return endPlan(false, `${q.type} still there (hp ${q.hp})`);
    aimAt(inp, q.x, q.y);
    if (p.def.kind === 'gun') { if (S.clock > B.fireT) { inp.mouse.clicked[0] = inp.mouse.down[0] = true; B.fireT = S.clock + 0.35; act(`shoot ${q.type}`); } }
    else { inp.mouse.down[0] = true; act(`strike ${q.type}`); }
    return !shoot && d > (p.def.range || 20) + 4 ? steer(inp, q.x - p.x, q.y - p.y) : null;
  }

  // straight at (x, y), off the grid: a counter or a box in the way is vaulted
  function straight(p, inp, st, x, y) {
    if (p.vaulting) return null;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < st.best - 4) { st.best = d; st.bestT = S.clock; }
    if (S.clock - st.bestT > 0.8 && VAULTS.has(p.contextAction) && S.clock > B.spaceT) { press(inp, 'Space'); B.spaceT = S.clock + 0.5; act(`space (${p.contextAction})`); }
    return steer(inp, x - p.x, y - p.y);
  }

  // a roaming target: something breakable around, to hit or shoot (on levels with nothing else to do, mostly); only
  // one the grid can reach
  function smashGoal(w, p) {
    const list = w.props.filter((q) => !q.dead && !q.def.lasting && !q.trunk && Math.hypot(q.x - p.x, q.y - p.y) < 15 * TILE && !blacklisted(q.x, q.y));
    for (let i = 0; i < 4 && list.length; i++) {
      const q = pickWeighted(list.map((o) => ({ o, w: o.isVehicle ? 0.3 : 1 }))).o;
      list.splice(list.indexOf(q), 1);
      B.blacklist.push({ x: q.x, y: q.y, until: S.clock + 30 });
      const at = standBy(w, p, q);
      if (!at || !findPath(w.map, p.x, p.y, at.x, at.y, 8000)) continue;
      startPlan(w, p, 'smash', [{ smash: q.type, prop: q, stand: [at.x / TILE, at.y / TILE], enough: 2 + rnd() * 3 }]);
      return !!B.plan;
    }
    return false;
  }

  // about to step into a lane a car is coming down: wait on the kerb (drivers see a man in the road late, by design:
  // Traffic.Driver attention). Once in the lane, he keeps going.
  function trafficAhead(w, p, heading) {
    const nx = p.x + Math.cos(heading) * 26, ny = p.y + Math.sin(heading) * 26;
    for (const c of w.ambient?.cars || []) {
      if (c.v.exploded || !c.d.moving || Math.abs(c.d.speed) < 20) continue;
      const band = c.hw + 14;
      if (Math.abs(ny - c.v.y) > band || Math.abs(p.y - c.v.y) <= band) continue;
      const ahead = (nx - c.v.x) * c.lane.dir; // px from the car to where he would step in, along its way
      if (ahead > -c.hl - 10 && ahead < c.hl + Math.abs(c.d.speed) * 2.2) return true;
    }
    return false;
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
    const range = d.pellets > 1 ? 210 : 360; // a gun: a sensible distance to shoot from
    // on a plan, only a guard who is on to us is fought; the others are left alone
    const threat = !!tg && (tdist < reach + 24 || (tg.aware >= 2 && tdist < (gun ? range : 170)));
    const foe = B.plan && !threat ? null : tg;
    // an unaware guard, standing: creep up behind him for a takedown (half the time; a third with a gun in hand: the
    // execution from behind, a round or the butt), instead of rushing him or shooting him
    if (foe !== B.sneakFor) { B.sneakFor = foe; B.sneak = !!foe && rnd() < (gun ? 0.35 : 0.5); }
    const sneaking = foe && B.sneak && foe.aware === 0 && !(foe.knocked > 0) && !foe.held;
    const back = sneaking && { x: foe.x - Math.cos(foe.angle) * 20, y: foe.y - Math.sin(foe.angle) * 20 };

    // plan or goal upkeep
    let planHeading;
    if (!B.plan && !p.vaulting && onRoofTile(w, p.x, p.y) && PLANS[opts.level]?.offRoof) startPlan(w, p, 'offRoof');
    else if (!B.plan && !w.cleared && guardsUp(w) && S.clock > B.nextPlanT && !threat) {
      const name = drawPlan(w, p, false);
      if (name) startPlan(w, p, name); else B.nextPlanT = S.clock + 40;
    }
    if (!B.plan && w.cleared && !w.level.exit && PLANS[opts.level]?.out && S.clock > (B.outT || 0)) { B.outT = S.clock + 12; startPlan(w, p, 'out'); }
    if (B.plan) planHeading = runPlan(w, p, inp);
    else if (!B.goal || S.clock - B.goalT > 25 || (w.cleared && w.level.exit && B.goal.type !== 'exit')) chooseGoal(w, p);
    else if (B.goal.type === 'guard' && (!B.goal.guard.alive || B.goal.guard.yielded)) chooseGoal(w, p);
    else if ((B.goal.type === 'item' || B.goal.type === 'ammo') && B.goal.item.dead) chooseGoal(w, p);
    else if (B.goal.type === 'trunk' && B.goal.car.trunk?.open) chooseGoal(w, p);
    if (B.goal && S.clock >= B.replanT && !B.goal.crossing) {
      if (B.goal.type === 'guard') { B.goal.x = B.goal.guard.x; B.goal.y = B.goal.guard.y; }
      if (B.goal.type === 'item' || B.goal.type === 'ammo') { B.goal.x = B.goal.item.x; B.goal.y = B.goal.item.y; }
      if (!setGoal(w, p, B.goal)) { if (B.plan) B.goal = B.path = null; else chooseGoal(w, p); }
    }
    const steering = planHeading !== undefined; // the plan steers (cross, smash): no chase, no unsticking moves

    // movement: straight at a close target in sight, else along the path
    let heading = null;
    const chase = foe && !gun && tdist < 240;
    if (steering) heading = planHeading;
    else if (B.side && S.clock < B.sideT) heading = steer(inp, Math.cos(B.side), Math.sin(B.side));
    else if (sneaking && tdist < 240) {
      B.side = null;
      const bd = Math.hypot(back.x - p.x, back.y - p.y);
      // round him, not through him: aim for a point off to the side of his back while still in front of him
      const ahead = Math.cos(foe.angle) * (p.x - foe.x) + Math.sin(foe.angle) * (p.y - foe.y) > 0;
      const via = ahead ? { x: foe.x + Math.cos(foe.angle + Math.PI / 2) * 40, y: foe.y + Math.sin(foe.angle + Math.PI / 2) * 40 } : back;
      if (bd > 6) heading = steer(inp, via.x - p.x, via.y - p.y);
      act('sneak');
    } else if (chase) {
      B.side = null;
      if (tdist > reach * 0.6) heading = steer(inp, foe.x - p.x, foe.y - p.y);
    } else if (gun && foe && tdist < range * 0.6) {
      // a gun at close range: hold the ground, a step aside now and then
      if (rnd() < 0.02) { B.side = Math.atan2(foe.y - p.y, foe.x - p.x) + (rnd() < 0.5 ? 1.6 : -1.6); B.sideT = S.clock + 0.3; }
    } else if (B.path) {
      let wp = B.path[B.idx];
      while (wp && Math.hypot(wp.x - p.x, wp.y - p.y) < (B.idx === B.path.length - 1 ? 14 : 12)) wp = B.path[++B.idx];
      if (!wp) heading = arrive(w, p, inp) ?? null;
      else heading = steer(inp, wp.x - p.x, wp.y - p.y);
    }
    if (B.goal?.type === 'window' && (B.goal.crossing || (B.path && B.idx >= B.path.length - 1 && Math.hypot(B.goal.x - p.x, B.goal.y - p.y) < 20))) heading = windowApproach(w, p, inp);
    if (heading !== null && !p.vaulting && trafficAhead(w, p, heading)) { inp.keys.clear(); heading = null; act('wait for traffic'); }

    // progress watch: no headway for a while -> vault, then sidestep, then report and give up the goal
    if (heading !== null && !steering && !p.vaulting && !p.execution && !p.takedown && !p.slide && !B.goal?.crossing) {
      const a = B.anchor || (B.anchor = { x: p.x, y: p.y, t: w.time });
      const moved = Math.hypot(p.x - a.x, p.y - a.y);
      if (moved >= 8) { B.anchor = { x: p.x, y: p.y, t: w.time }; }
      else {
        const held = w.time - a.t;
        if (held > 0.6 && S.clock > B.spaceT && VAULTS.has(p.contextAction)) { press(inp, 'Space'); B.spaceT = S.clock + 0.5; act('space (unstuck)'); }
        else if (held > 0.9 && !B.side) { B.side = heading + (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2 + rnd() * 0.6); B.sideT = S.clock + 0.35; act('sidestep'); }
        if (held > 3 && B.path) {
          report('player-stuck', 'warn', `${B.goal?.type}@${cellOf(p.x, p.y)}`, posOf(p.x, p.y),
            { goal: B.goal && { type: B.goal.type, at: cellOf(B.goal.x, B.goal.y) }, plan: B.plan && `${B.plan.name} ${stepName(B.step)}`, heading: r1(heading), front: inFront(w, p, heading) });
          abandon('stuck');
          B.anchor = null;
        }
      }
      if (B.side && S.clock >= B.sideT) B.side = null;
    } else B.anchor = null;
    // no headway toward the goal for a long time (circling round furniture the grid does not know): give it up
    if (B.goal && heading !== null && !steering && !B.goal.crossing) {
      const gd = Math.hypot(B.goal.x - p.x, B.goal.y - p.y), h = B.headway;
      if (gd < h.best - 16) { h.best = gd; h.t = S.clock; }
      else if (S.clock - h.t > 10) abandon('no headway');
    }

    // a locked door on the way: break it open (kicks, blows or rounds into the lock)
    const lockedDoor = B.goal?.breach && !threat && w.doors.find((dd) => dd.locked && Math.hypot(doorMid(dd).x - p.x, doorMid(dd).y - p.y) < 40);
    if (lockedDoor) {
      const m = doorMid(lockedDoor);
      inp.keys.clear();
      // close enough for the blow to land (a kick reaches the middle of the door from range + 14 px)
      if (!gun && Math.hypot(m.x - p.x, m.y - p.y) > (d.range || 20) + 8) steer(inp, m.x - p.x, m.y - p.y);
      aimAt(inp, m.x, m.y);
      if (gun) { if (S.clock > B.fireT) { inp.mouse.clicked[0] = inp.mouse.down[0] = true; B.fireT = S.clock + 0.3; } }
      else inp.mouse.down[0] = true;
      act('breach locked door');
      B.anchor = null; B.headway.t = S.clock; // breaking it is headway
      return;
    }

    // aim and fight
    const smashing = B.step?.smash && B.step.at;
    if (foe) aimAt(inp, foe.x, foe.y);
    else if (heading !== null && !smashing) aimAt(inp, p.x + Math.cos(heading) * 120, p.y + Math.sin(heading) * 120);
    if (foe) {
      const aimed = Math.abs(angDiff(p.angle, Math.atan2(foe.y - p.y, foe.x - p.x))) < 0.12;
      if (gun) {
        if (tdist < range && !sneaking && (p.weapon.mag > 0 || p.reserveCount() === 0)) {
          if (d.auto) { inp.mouse.down[0] = true; if (S.clock > B.fireT) { B.fireT = S.clock + 0.4; act('fire (auto)'); } }
          else if (S.clock > B.fireT && aimed) { inp.mouse.clicked[0] = true; inp.mouse.down[0] = true; B.fireT = S.clock + 0.15 + rnd() * 0.25; act('fire'); }
        }
      } else if (B.style === 'throw' && d.swing === 'blade' && aimed && tdist > 45 && tdist < 170 && !(foe.knocked > 0)) {
        inp.mouse.clicked[2] = true; act('throw blade');
      } else if (tdist < reach && !sneaking) { inp.mouse.down[0] = true; act('strike'); }
      if (p.armed && tdist < 220 && tdist > 60 && rnd() < 0.002) { inp.mouse.clicked[2] = true; act('throw weapon'); }
    }
    if (gun && p.reserveCount() > 0 && !p.reloading && (p.weapon.mag === 0 || (!foe && p.weapon.mag < d.mag && rnd() < 0.01))) { press(inp, 'KeyR'); act('reload'); }

    // a long execution whose man is dead, somebody on him: he walks out of it, as a player would (Space)
    if (p.execution?.dead && !p.execution.f.quick && w.danger?.threatened(p)) { press(inp, 'Space'); act('walk out of the execution'); }
    // context actions
    const ca = p.contextAction;
    if (ca && p.nearTakedown && !VAULTS.has(ca)) { inp.mouse.down[0] = true; inp.mouse.clicked[0] = true; act(`click (${ca})`); }
    else if (ca && MELEE_CLICK.has(ca)) { inp.mouse.down[0] = true; inp.mouse.clicked[0] = true; act(`click (${ca})`); }
    // (no slide on a plan: one chains into a vault, a ladder too, and off the route); a gunman about to fire: under it
    else if (!B.plan && heading !== null && !ca && (rnd() < 0.004 || (S.clock > (B.dodgeT || 0) && underFire(w, p)))) {
      press(inp, 'Space'); B.dodgeT = S.clock + 1.2; act('slide');
    }
    else if (!B.plan && VAULTS.has(ca) && heading !== null && rnd() < 0.01) { press(inp, 'Space'); act(`space (${ca})`); }
    if (B.plan) return; // the plan picks up what it wants
    const it = p.nearItem, thrower = B.style === 'throw';
    if (p.nearTrunk) { press(inp, 'KeyE'); act('open trunk'); }
    else if (it && (!p.armed || (!thrower && !gun && it.def?.kind === 'gun' && it.mag > 0) || (thrower && !gun && d.swing !== 'blade' && it.def?.swing === 'blade') || rnd() < 0.003)) {
      press(inp, 'KeyE'); act(`pick up ${it.type}`);
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
    if (g.type === 'exit') { const ex = w.level.exit; return steer(inp, ex.x * TILE - p.x, ex.y * TILE - p.y); }
    if (g.type === 'route') return Math.hypot(g.x - p.x, g.y - p.y) > 3 ? steer(inp, g.x - p.x, g.y - p.y) : null; // the plan's spot, exactly
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
    // the title is a menu: the level under test is started straight away (a click when the game has no startLevel)
    if (st === 'title') {
      if (g.startLevel) { g.tutorialAt = null; g.startLevel(opts.level); act('title: start'); }
      else { inp.mouse.clicked[0] = true; inp.anyPressed = true; act('title: click'); }
      return;
    }
    if (!g.world) return;
    // out of the tutorial the game goes on to the next level: back to the one under test, from its beginning
    if (opts.level === 'tutorial' && !g.world.tutorial && g.startLevel) { g.tutorialAt = null; g.startLevel(opts.level); act('tutorial: again'); return; }
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
    if (w.tutorial?.over && !S.sess.exited) { S.sess.exited = true; cover('exit'); act('tutorial: out by the window'); }
    if (st !== 'play') return;
    // a session going nowhere: start over
    if (S.clock - B.sessionStart > opts.sessionCap && S.clock - S.sess.lastKillT > 60) {
      S.stats.giveUps++;
      act('give up: restart');
      press(inp, 'Backspace');
      return;
    }
    // a level with no way out (lab, street): a minute of roaming once it is cleared, then another go
    if (w.cleared && !w.level.exit && S.clock - B.clearT > 60) {
      S.stats.restartsAfterClear = (S.stats.restartsAfterClear || 0) + 1;
      act('cleared, no exit: restart');
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
    const v = p.vaulting;
    if (v && v !== B.vaultWas) {
      const what = v.kind === 'window' ? (v.over?.intact ? 'windowDive' : 'windowVault')
        : v.ladder ? (v.ladder.up ? 'ladderUp' : 'ladderDown') : v.kind === 'climb' ? 'climb' : 'vault';
      cover(what);
      if (v.over?.type === 'parapet') cover('roofDrop');
      act(`${what}${v.over?.type ? ' ' + v.over.type : ''}`);
    }
    if (v?.rolling && v.rolling !== B.rollWas) { cover('roll'); act('roll'); }
    B.vaultWas = v;
    B.rollWas = v?.rolling;
    if (p.takedown && p.takedown !== B.takedownWas) {
      cover('takedown');
      if (p.takedown.spot) { cover('envTakedown'); S.stats.envTakedowns[p.takedown.spot.kind] = (S.stats.envTakedowns[p.takedown.spot.kind] || 0) + 1; }
      act(`takedown (${p.takedown.f.label})`);
    }
    B.takedownWas = p.takedown;
    if (p.execution && p.execution !== B.execWas) { cover('finisher'); act(`finisher (${p.execution.f.quick ? 'quick' : p.execution.f.label})`); }
    B.execWas = p.execution;
    if (w.cleared && !S.sess.cleared) { S.sess.cleared = true; B.clearT = S.clock; cover('clear'); act('LEVEL CLEARED'); }
    for (const c of B.trunks) if (c.trunk?.open && !c.__qaOpen) { c.__qaOpen = true; cover('trunk'); }
    // feet gone on a slick floor (systems/Slips.js): the player, a guard dazed
    if (p.slipped && !B.slipWas) { S.stats.slips++; act('slipped'); }
    B.slipWas = !!p.slipped;
    for (const e of w.enemies) { if (e.dazed && !e.__qaDazed) S.stats.slips++; e.__qaDazed = !!e.dazed; }
    if (S.steps % 15 === 0) {
      for (const d of B.locked) if (!d.locked) { B.locked.delete(d); cover('doorBreached'); act('door breached'); }
      for (const d of B.doors) {
        if (B.opened.has(d)) continue;
        if (!w.doors.includes(d) || Math.abs(angDiff(d.a0, d.body.angle)) > 0.5) { B.opened.add(d); cover('doorOpened'); }
      }
      for (const e of w.enemies) wrapGuard(e);
      // rounds on the floor (level 1 has no box: only a magazine a guard drops when he reloads early)
      for (const a of w.ammoItems || []) if (!a.__qaSeen) { a.__qaSeen = true; S.stats.ammoOnFloor++; }
      // how the dead go: a crawl, a curl, a spasm (scripted, Ragdoll.dying) or a few throes
      for (const c of w.corpses) {
        if (c.__qaSeen) continue;
        c.__qaSeen = true;
        const how = c.dying?.kind || (c.throes ? 'throes' : null);
        if (!how) continue;
        bump(S.stats.dying, how);
        if (DYING[how]) cover(DYING[how]);
      }
    }
    if (g.state !== 'play' && g.state !== 'dead') return;

    // in-wall: a centre inside a solid tile for more than 0.2 s (a single step of it is counted, not reported)
    const walled = (ch) => !ch.vaulting && w.map.inside(ch.x, ch.y) && w.map.solidAt(ch.x, ch.y);
    const checkWall = (ch, who, alive = ch.alive) => {
      if (!alive || !walled(ch)) { S.inWall.delete(ch); return; }
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
      // a man not quite dead drags himself along the floor: never into a wall
      for (const c of w.corpses) if (c.dying?.kind === 'crawl') checkWall(c, 'crawler', !c.dead);
    }

    if (S.steps % 30 === 0) {
      nanCheck(w);
      outOfMap(w);
      guardStuck(w);
      aiCheck(w);
      lastingCheck(w);
      powerCheck(w);
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
      if (!q.anchor.stalled && w.time - q.anchor.t > 3) { q.anchor.stalled = true; S.stats.ai.stall3++; }
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

  // the guards at work: each one entering a fight, and a guard in the fight who got within reach of the player (once
  // per guard every 4 s)
  function aiCheck(w) {
    const p = w.player;
    for (const e of w.enemies) {
      const q = e.__qa;
      if (!q || !e.alive) continue;
      if (e.aware === 2 && !q.engaged) { q.engaged = true; S.stats.ai.engaged++; }
      else if (e.aware < 2) q.engaged = false;
      if (p.alive && e.aware === 2 && !(e.knocked > 0) && Math.hypot(e.x - p.x, e.y - p.y) < 40 && w.time - (q.reachedT ?? -9) > 4) {
        q.reachedT = w.time;
        S.stats.ai.reached++;
      }
    }
  }

  // a lasting prop (a ladder or a parapet closing a gap in a wall) must never be destroyed or removed
  function lastingCheck(w) {
    for (const q of B.lasting) {
      if (B.lastingSeen.has(q) || (!q.dead && w.props.includes(q))) continue;
      B.lastingSeen.add(q);
      report('lasting-dead', 'error', `${q.type}@${cellOf(q.x, q.y)}`, posOf(q.x, q.y),
        { type: q.type, dead: !!q.dead, inWorld: w.props.includes(q), hp: q.hp, lastHit: q.__qaHit || null });
    }
  }

  // once the bar's power is cut (and the lights had time to stutter out), no lamp on its mains may still glow
  function powerCheck(w) {
    const pw = w.power;
    if (pw.on || B.powerCheckT === null || w.time < B.powerCheckT) return;
    for (const q of w.props) {
      if (q.dead || q.lightsOut || q.isVehicle || q.def.standby || q.__qaLit || !pw.inside(q.x, q.y)) continue;
      if (!(pw.wired || []).includes(q) && !w.lighting.propLights(q).length) continue;
      q.__qaLit = true;
      report('power-lit', 'error', `${q.type}@${cellOf(q.x, q.y)}`, posOf(q.x, q.y),
        { type: q.type, wired: (pw.wired || []).includes(q), lights: w.lighting.propLights(q).length, sputter: !!q.sputter,
          cutAgo: r1(w.time - pw.cutAt), why: 'a lamp on the cut mains is still lit (lightsOut false)' });
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
    if (now - B.exitPathT > 5 && !p.vaulting && !onRoofTile(w, p.x, p.y)) { // the roof's ways down are not in the grid
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
    opts = { seed: 1, god: false, mode: 'fast', level: 'level1', sessionCap: 300, ...o };
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
      state: game.state, plan: B.plan && `${B.plan.name} ${stepName(B.step)}`, style: B.style,
      goal: B.goal && { type: B.goal.type, at: cellOf(B.goal.x, B.goal.y) }, path: B.path ? `${B.idx}/${B.path.length}` : null,
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
