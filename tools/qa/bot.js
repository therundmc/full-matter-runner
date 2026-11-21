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
// Findings: { kind, severity: 'error' | 'warn', t (game s), session, plan, pos, detail, lastActions, count }, repeats
// of the same kind and signature are counted, not stored again. The pure checks and trackers are in checks.js
// (injected first, as __qaChecks); the chaos plans (CHAOS below) are the tester trying to break the game.
(() => {
  if (window.__qa) return;
  const K = window.__qaChecks;
  if (!K) throw new Error('tools/qa/checks.js must be injected before bot.js');

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
    'powerCut', 'horn', 'dyingCrawl', 'dyingCurl', 'dyingSpasm', 'dyingThroat', 'clear', 'exit', 'deviceUse', 'shield', 'shieldThrow'];
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
  //   smash: type       go to `stand` (else beside it), then strike or shoot the prop of that type by `near` (within
  //                     1.5 tiles), else the one nearest to him, until it is gone (`enough`: s of it); none: the plan fails
  //   use: kind         walk to the device spot of that kind (systems/Uses.js; by `near`) and press E there
  // then the bot plays freely, in the plan's `style` ('throw': blades are thrown at guards in range).
  // ok(w, p): whether the plan still makes sense now. Routes through the map are level 1's; a level with no entry
  // here only plays 'free'. A plan marked `rescue` is never drawn, only started when needed.
  const DROP_LOT = [{ go: [9.45, 3.5] }, { cross: [11.7, 3.5] }];    // over the parapet, down into the back lot (a roll)
  const DROP_ALLEY = [{ go: [9.45, 12.5] }, { cross: [11.7, 12.5] }]; // ... into the service alley
  // the liquor store: the aisle between its counter and the shelves leads west to the foot of the shop's ladder (all of
  // it blocked cells for the grid); its pistol is hidden up on the roof, by the lookout's chair over the back lot
  const PISTOL = { pick: 'pistol', near: [8.6, 4.7], r: 2 };
  const SHOP_UP = [{ to: [3.5, 17.75] }, { to: [3.5, 17.45] }, { cross: [3.5, 15.4] }];
  const COUNTER_IN = [{ go: [8.5, 19.5] }, { cross: [8.5, 17.7] }];  // in by the front door (locked: broken open), over the counter
  const COUNTER_OUT = [{ to: [8.5, 17.75] }, { cross: [8.5, 19.6] }];
  const ROOF_UP = [...COUNTER_IN, ...SHOP_UP];                       // the only way up: into the shop and up its ladder
  const itemNear = (w, type, at, r) => w.items.find((it) => !it.dead && it.type === type && Math.hypot(it.x - at[0] * TILE, it.y - at[1] * TILE) < r * TILE);
  const TIRE_IRON = [{ trunk: true }, { pick: 'tire_iron', near: [13.5, 24], r: 4, optional: true }];
  const THROW = { steps: [{ pick: 'knife', any: true }], style: 'throw', ok: (w) => w.items.some((it) => !it.dead && it.type === 'knife') };
  const THROW_HOLD = 0.4; // s a full throw is held (THROW.charge in src/game/data/feel.js, a little over)
  // a device of the level that can be used now (data/devices.js)
  const usable = (kind) => (w, p) => w.uses.spots.some((s) => s.kind === kind && (!s.ok || s.ok(p)));
  const PLANS = {
    level1: {
      free: { steps: [] },
      trunk: { steps: TIRE_IRON, ok: (w, p) => !p.armed && B.trunks.some((c) => !c.dead && !c.trunk.open) },
      roof: { steps: [...ROOF_UP, ...DROP_LOT] },
      roofShop: { steps: [...ROOF_UP, ...DROP_ALLEY] },
      roofGun: { steps: [...ROOF_UP, PISTOL, ...DROP_LOT], ok: (w, p) => !p.hasGun && !!itemNear(w, 'pistol', PISTOL.near, 2) },
      liquor: { steps: [...COUNTER_IN, ...COUNTER_OUT] },
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
      // (no `near`: the nearest of each, wherever the lab's builder put it)
      kegs: { steps: [{ smash: 'keg', enough: 3 }], ok: (w) => w.props.some((q) => q.type === 'keg' && !q.dead) },
      passage: { steps: [{ use: 'trapdoor' }, { wait: 2.5 }], ok: usable('trapdoor') },
      fuse: { steps: [{ smash: 'fuse_box' }], ok: (w) => w.power.on },
    },
    // the tutorial: played freely room after room, then out by the front room window once nobody is left (`out` is
    // started by hand when the level is cleared: it has no exit zone)
    // (`bed`: out of the bedroom by its single door, down the living room's lane between its two fires and over the
    // table at its end, started by hand while he is in it)
    tutorial: {
      free: { steps: [] }, out: { steps: [{ go: [4.7, 14.5] }, { cross: [1.6, 14.5] }], rescue: true },
      bed: { steps: [{ go: [8.5, 2.55] }, { to: [10.4, 2.6] }, { to: [11.2, 3.0] }, { to: [13.6, 3.1] }, { to: [13.6, 4.6] }, { cross: [13.6, 6.5] }], rescue: true },
    },
    // level 2A, at the wheel (systems/Drive.js): no steps, the drive itself (playChase): lanes changed on a slow random
    // cycle, now and then up onto a sidewalk against the building fronts, the shove on a pursuer alongside, the Uzi at
    // the nearest one in his arc
    level2a: { chase: { steps: [] } },
  };
  // the chase's bot: s a lane is held [from, to], the odds the next target is a sidewalk (into the building fronts) and
  // s it is held at most, px from the target line that count as on it, px of reach of the gun, the box a pursuer
  // alongside is shoved in ([dx, dy from, dy to] from his car's middle), px past a told lorry's far side the way round
  // it is held
  const CHASE_BOT = { hold: [1.5, 4], kerb: 0.2, kerbFor: 2.5, near: 10, range: 420, abreast: [70, 45, 120], lorryPast: 24 };

  const prng = K.prng;

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const r1 = (v) => Math.round(v * 10) / 10;
  const cellOf = (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)];
  const posOf = (x, y) => ({ x: Math.round(x), y: Math.round(y), cell: cellOf(x, y) });
  const firstLine = (s) => String(s || '').split('\n')[0].slice(0, 200);
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  const qa = (window.__qa = {});
  let game, findPath, Audio, killStyle, rnd, opts;
  // the game's data the checks read (moves' lengths, sizes), filled by init; fallbacks for an old checkout
  const D = { lockTime: () => 6, lockedFor: () => 5, TRAVERSE: { kick: { dur: 1 } }, GESTURE: { trunk: { dur: 2 } }, rollDur: 0.6,
    BODY_SCALE: 1.3, VIEW: 290, kmh: 6.75, sounds: null };
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
      // at the wheel (level 2A, playChase): shoves thrown, bursts fired, pursuers' men killed (by how.car), stalls (and
      // how long the longest one lasted, s: from the crawl to the car running again, a crash or a restart), the farthest
      // down the route he got (m along its legs and bends: Drive.progress); the chase's checkpoints reached (by name)
      // and the retries that started at one after a death (systems/Checkpoints.js: R once dead, Game.retry)
      drive: { shoves: 0, bursts: 0, kills: {}, stalls: 0, stallMost: 0, far: 0, checkpoints: {}, resumed: {} },
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
    // the deeper checks (deepCheck): their trackers, round-robin cursors, and what they cost
    trk: null, rr: { pose: 0, props: 0, items: 0 }, cost: { checks: 0, probes: 0, wraps: 0, bot: 0, update: 0, n: 0 },
    probing: false, drawDepth: 0, sched: null, mash: null,
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
      const pl = planNow();
      f = { key, kind, severity, sig, t: r1(S.clock), worldT: r1(game.world?.time || 0), session: S.session, pos, detail,
        plan: pl.name, chaos: pl.chaos, planDrawn: pl.drawn, lastActions: lastActions(), count: 1, lastT: r1(S.clock), lastSession: S.session };
      S.findings.set(key, f);
      if (![...S.findings.values()].some((o) => o !== f && o.kind === kind)) S.freshKinds.push({ kind, key, pos });
    }
    S.dirty.add(key);
    return f;
  }
  // the plan the bot is on (or was on last this session): findings carry it, a replay can be narrowed to it
  function planNow() {
    const m = B.mischief || B.plan || S.sess?.lastPlan;
    return m ? { name: m.name, chaos: !!m.chaos, drawn: !!m.drawn } : { name: null, chaos: false, drawn: false };
  }
  const cover = (f) => { S.stats.coverage[f] = (S.stats.coverage[f] || 0) + 1; };
  const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

  // ---------------------------------------------------------------- per session
  function onNewWorld(w) {
    if (B.plan) planStat(B.plan.name).cut++; // the session ended under it (death, restart)
    if (B.mischief) { planStat(B.mischief.name).cut++; B.mischief = null; }
    S.pauseHold = 0;
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
    if (w.checkpoints?.from) { bump(S.stats.drive.resumed, w.checkpoints.from.name); act(`retry at the checkpoint ${w.checkpoints.from.name}`); }
    w.events.on('checkpoint', ({ name }) => { bump(S.stats.drive.checkpoints, name); act(`checkpoint ${name}`); });
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
    // a guard taken as a shield, and thrown (not on a commit older than the mechanic)
    const startShield = p.startShield, throwShield = p.throwShield;
    if (startShield) p.startShield = function (...a) { cover('shield'); return startShield.apply(this, a); };
    if (throwShield) p.throwShield = function (...a) { cover('shieldThrow'); return throwShield.apply(this, a); };
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
    ev.on('kill', (e) => { S.killClock = S.clock; onKill(w, e); });
    // what may move a body, a car or a prop that is not to blame on the game (deepCheck excuses)
    ev.on('explosion', ({ x, y, radius }) => S.blasts.push({ t: w.time, x, y, r: (radius || 100) + 120 }));
    ev.on('shot', () => { S.shotT = w.time; });
    ev.on('powerCut', () => { cover('powerCut'); act('POWER CUT'); B.powerCheckT = w.time + 1.5; });
    ev.on('slide', ({ ch }) => { if (ch?.isPlayer) cover('slide'); });
    ev.on('challenge', ({ act: what, stage }) => {
      const m = B.mischief;
      if (m?.name === 'bouncerStare' && m.M.at && !m.M.challenged) m.M.challenged = { act: what, stage };
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
    B.plan = null; B.style = null; B.chase = null; B.stall = null;
    newTrackers(w);
    wrapDraws(w.chars);
    wrapGhosts(w);
    wrapAudio();
    act(`session ${S.session}`);
    startPlan(w, p, drawPlan(w, p));
  }

  // features this level has nothing for (no 'not-covered' warning about them)
  function notApplicable(w) {
    if (w.level.chase) return FEATURES.filter((f) => f !== 'exit'); // at the wheel all the way (level 2A)
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
    if (!w.enemies.length) na.push('takedown', 'envTakedown', 'finisher', 'gunKill', 'meleeKill', 'thrownKill', 'shield', 'shieldThrow', ...Object.values(DYING), 'clear');
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
      act(`DIED (${cause})${w.drive?.on ? ` at the wheel, cell ${cellOf(w.drive.van.x, w.drive.van.y)}` : ''}`);
      return;
    }
    if (victim.isCivilian) { bump(S.stats.civilians, cause || '?'); return; }
    if (victim.isPursuer) { bump(S.stats.drive.kills, e.how?.car || cause || '?'); act(`killed a pursuer's man (${e.how?.car || cause})`); return; }
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
    : st.trunk ? 'trunk' : st.wait ? `wait ${st.wait}` : st.use ? `use ${st.use}` : st.provoke ? 'provoke' : `smash ${st.smash}`);
  // a pick step's weapon: a type, '*' any weapon, '*gun' a gun with rounds in it
  const fits = (it, pick) => (pick === '*' ? !!it.def : pick === '*gun' ? it.def?.kind === 'gun' && it.mag > 0 : it.type === pick);
  const holds = (p, pick) => (pick === '*' ? p.armed : pick === '*gun' ? p.hasGun && p.weapon.mag > 0 : p.weapon?.type === pick);

  // a plan by name: the level's (PLANS) or a chaos one (CHAOS)
  const isChaos = (name) => Object.prototype.hasOwnProperty.call(CHAOS, name);
  // a level with no plans of its own plays 'free' only
  const planDef = (name) => (isChaos(name) ? CHAOS[name] : (PLANS[opts.level] || { free: { steps: [] } })[name]);
  // the plans a session may be drawn on (rescues never are; --plans narrows both families)
  function planNames() {
    const plans = PLANS[opts.level] || { free: { steps: [] } }, pick = (n) => !opts.plans || opts.plans.includes(n);
    return {
      normal: Object.keys(plans).filter((n) => !plans[n].rescue && pick(n)),
      chaos: Object.keys(CHAOS).filter((n) => (!CHAOS[n].levels || CHAOS[n].levels.includes(opts.level)) && pick(n)),
    };
  }

  // the next plan of the deck that makes sense now ('free' only at a session start; rescues are never drawn), from
  // the chaos deck for a share opts.chaos of the draws (checks.js Scheduler): its name, or null
  function drawPlan(w, p, start = true) {
    const r = S.sched.next((name) => {
      const d = planDef(name);
      if (!d.ok || d.ok(w, p)) return true;
      planStat(name).skipped++;
      return false;
    }, start);
    return r ? r.name : start ? 'free' : null;
  }

  function startPlan(w, p, name, steps = planDef(name)?.steps || [], drawn = true) {
    planStat(name).started++;
    S.sess.plans.push(name);
    const style = planDef(name)?.style;
    if (style) B.style = style;
    B.nextPlanT = S.clock + 40;
    act(`plan ${name}`);
    B.plan = { name, steps, i: -1, chaos: isChaos(name), drawn: drawn && !!planDef(name) };
    S.sess.lastPlan = { name, chaos: B.plan.chaos, drawn: B.plan.drawn };
    // god: false, it must be able to die; god: true, it must live through it (standing in a traffic lane)
    if (B.plan.chaos && typeof planDef(name).god === 'boolean' && planDef(name).god !== !!opts.god) p.invulnerable = planDef(name).god;
    nextStep(w, p);
  }

  function endPlan(ok, why) {
    const pl = B.plan;
    if (!pl) return null;
    if (ok && planDef(pl.name)?.fn) { B.plan = B.step = null; B.goal = B.path = null; startMischief(pl); return null; }
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
    if (st.pick) return holds(p, st.pick) ? nextStep(w, p) : findItem(w, p, st);
    if (st.wait) return null;
    if (st.provoke) return null;
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
    // smash: the one by `near`, else the nearest of that type; none is a failure (a plan that did nothing is not done)
    const left = w.props.filter((q) => !q.dead && q.type === st.smash), dist = (q, x, y) => Math.hypot(q.x - x, q.y - y);
    st.prop = st.prop || (st.near && left.find((q) => dist(q, st.near[0] * TILE, st.near[1] * TILE) < 1.5 * TILE))
      || left.sort((a, b) => dist(a, p.x, p.y) - dist(b, p.x, p.y))[0];
    if (!st.prop) return endPlan(false, `no ${st.smash} to smash`);
    const at = st.stand ? { x: st.stand[0] * TILE, y: st.stand[1] * TILE } : standBy(w, p, st.prop);
    if (!at) return endPlan(false, 'nowhere to stand');
    st.x = at.x; st.y = at.y;
    return go({ type: 'route', x: st.x, y: st.y });
  }

  // the weapon a pick step is after (one just thrown out of a trunk may take a step to show up)
  function findItem(w, p, st) {
    st.item = (st.near && itemNear(w, st.pick, st.near, st.r || 2))
      || (st.any && w.items.filter((it) => !it.dead && fits(it, st.pick)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]);
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
    // walk at the nearest guard until one of them is on to him (a fight to drag somewhere)
    if (st.provoke) {
      if (w.enemies.some((e) => e.alive && e.aware === 2) || S.clock - st.t0 > 25) return nextStep(w, p);
      const g = w.enemies.filter((e) => e.alive && !e.yielded).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (!g) return nextStep(w, p);
      if (S.clock > (st.retry || 0)) { st.retry = S.clock + 1; setGoal(w, p, { type: 'route', x: g.x, y: g.y }); }
      return B.goal ? undefined : null;
    }
    if (st.cross) {
      if (p.vaulting) { st.vaulted = true; return null; }
      if (st.vaulted) return nextStep(w, p);
      const h = steer(inp, st.x - p.x, st.y - p.y);
      if (VAULTS.has(p.contextAction) && S.clock > B.spaceT) { press(inp, 'Space'); B.spaceT = S.clock + 0.3; act(`space (${p.contextAction})`); }
      return h;
    }
    if (st.pick) {
      if (holds(p, st.pick)) return nextStep(w, p);
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
      startPlan(w, p, 'smash', [{ smash: q.type, prop: q, stand: [at.x / TILE, at.y / TILE], enough: 2 + rnd() * 3 }], false);
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

  // one decision + input frame of the bot while playing: a chaos plan's mischief (CHAOS) either takes the inputs
  // over (own) or is laid over what the bot does
  function play(w, p, inp) {
    inp.keys.clear();
    inp.mouse.down[0] = inp.mouse.down[2] = false;
    if (p.sit > 0 && !p.rising) { inp.anyPressed = true; act('get up'); return; }
    if (!p.alive) return;
    const m = B.mischief;
    if (m && (S.clock > m.until || m.over || m.M.over)) { endMischief(m.over ? 'broke' : m.M.over ? 'done' : 'time'); return play(w, p, inp); }
    if (w.drive?.on) { playChase(w, p, inp, w.drive); return; } // at the wheel: the drive's own (no walking, no mischief)
    if (m?.own) { runMischief(w, p, inp, m); return; }
    playFree(w, p, inp);
    if (m) runMischief(w, p, inp, m);
  }

  // At the wheel (level 2A: systems/Drive.js, systems/Pursuit.js, systems/CarGun.js): the wheel turned toward a lane
  // picked on a slow random cycle (sometimes a sidewalk, into the building fronts: CHASE_BOT.kerb; a toll's wooden
  // lane when one is told: systems/Toll.js guide), the shove (Space,
  // aimed at it) on a pursuer alongside, else the Uzi held on the nearest pursuer still driven within its arc
  function playChase(w, p, inp, d) {
    // (the leg of the route he is on: its lanes and kerbs, systems/Route.js; a new leg, a new target)
    const C = CHASE_BOT, van = d.van, o = d.leg, ch = B.chase ??= { y: van.y, until: 0, kerb: false, leg: d.legI };
    if (ch.leg !== d.legI) { ch.leg = d.legI; ch.until = 0; }
    S.stats.drive.far = Math.max(S.stats.drive.far || 0, Math.round((d.progress?.s ?? 0) / TILE));
    if (S.clock >= ch.until) {
      const lanes = (o.lanes || [van.y / TILE]).map((r) => r * TILE), kerbs = o.kerbs?.map((r) => r * TILE);
      ch.kerb = !!kerbs && rnd() < C.kerb;
      // a sidewalk: past the kerb, as far as the building fronts let it go
      ch.y = ch.kerb ? (rnd() < 0.5 ? kerbs[0] - 2 * TILE : kerbs[1] + 2 * TILE) : lanes[Math.floor(rnd() * lanes.length)];
      ch.until = S.clock + (ch.kerb ? C.kerbFor : C.hold[0] + rnd() * (C.hold[1] - C.hold[0]));
      act(ch.kerb ? 'chase: into the kerb' : `chase: lane ${Math.round(ch.y / TILE)}`);
    }
    // a toll told ahead (systems/Toll.js): down the wooden lane it sends him, on its line ahead of him, let go of
    // the wheel in time (the road's pull takes the sideways speed off: no overshoot into an island)
    const toll = w.toll?.guide(van.x, van.y);
    if (toll) {
      if (ch.toll !== toll.k) { ch.toll = toll.k; act(`chase: toll, lane ${toll.k + 1}`); }
      ch.y = toll.y;
      ch.kerb = false;
      ch.until = S.clock + 0.3;
    } else ch.toll = null;
    // a lorry told across the road ahead (systems/Lorries.js: its lamps, the beeper, the red lane, the bone arrows on
    // the way round): onto the way round (its `gap`) as a player reading the tell would, held until its tail is passed
    const lorry = !toll && (w.lorries?.list || []).find((L) => L.gap && L.state !== 'wait' && van.body.bounds.min.x < L.p.body.bounds.max.x + C.lorryPast);
    if (lorry) {
      if (!ch.lorry) { ch.lorry = true; act('chase: lorry told, the way round'); }
      ch.y = lorry.gap.y;
      ch.kerb = false;
      ch.until = S.clock + 0.3;
    } else ch.lorry = false;
    // (stalled, the car easing itself out of what holds it: hands off the wheel, as a player would let it come out)
    const dy = ch.y - van.y, near = toll ? Math.max(C.near, (30 * d.u * d.u) / d.C.pull + 4) : C.near;
    if (Math.abs(dy) > near && !d.freeing) inp.keys.add(dy < 0 ? 'KeyW' : 'KeyS');
    const cars = (w.pursuit?.cars || []).filter((c) => !c.dummy && ['chase', 'limp', 'cross'].includes(c.state));
    // a pursuer alongside: shoved
    const side = cars.find((c) => Math.abs(c.v.x - van.x) < C.abreast[0] && Math.abs(c.v.y - van.y) > C.abreast[1] && Math.abs(c.v.y - van.y) < C.abreast[2]);
    // (never a shove away from a told lorry's way round: it throws the car a lane that way)
    const away = lorry && side && Math.sign(side.v.y - van.y) !== Math.sign(lorry.gap.y - van.y);
    if (side && !away && d.cool <= 0 && !d.grabbing) {
      aimAt(inp, side.v.x, side.v.y);
      press(inp, 'Space');
      bump(S.stats.drive, 'shoves');
      act('chase: shove');
      return;
    }
    // the nearest one with its driver still in it, in his arc: a burst at its windscreen
    let best = null, bd = C.range;
    for (const c of cars) {
      if (!c.driver) continue;
      const a = c.v.body.angle, at = { x: c.v.x + Math.cos(a) * c.v.w * 0.2, y: c.v.y + Math.sin(a) * c.v.w * 0.2 };
      const dist = Math.hypot(at.x - van.x, at.y - van.y);
      if (dist < bd && d.gun.aimAt(at).ok) { bd = dist; best = at; }
    }
    if (best) {
      aimAt(inp, best.x, best.y);
      inp.mouse.down[0] = true;
      if (S.clock > B.fireT) { B.fireT = S.clock + 0.4; bump(S.stats.drive, 'bursts'); act('chase: fire'); }
    } else aimAt(inp, van.x + 200, van.y);
  }

  function playFree(w, p, inp) {

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
    if (!B.plan && !p.vaulting && onRoofTile(w, p.x, p.y) && PLANS[opts.level]?.offRoof) startPlan(w, p, 'offRoof', undefined, false);
    else if (!B.plan && !p.vaulting && PLANS[opts.level]?.bed && w.tutorial?.stage === 0 && !w.tutorial.scene && p.x < 9 * TILE && p.y < 6 * TILE) startPlan(w, p, 'bed', undefined, false);
    else if (!B.plan && !B.mischief && ((!w.cleared && guardsUp(w)) || opts.chaos) && S.clock > B.nextPlanT && !threat) {
      const name = drawPlan(w, p, false);
      if (name) startPlan(w, p, name); else B.nextPlanT = S.clock + 40;
    }
    if (!B.plan && !B.mischief && w.cleared && !w.level.exit && PLANS[opts.level]?.out && S.clock > (B.outT || 0)) { B.outT = S.clock + 12; startPlan(w, p, 'out', undefined, false); }
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
      } else if (B.style === 'throw' && d.swing === 'blade' && aimed && tdist > 45 && tdist < 220 && !(foe.knocked > 0)) {
        // every other blade wound up to a full throw (the right click held THROW_HOLD s, then let go), the others tapped
        if (p.throwHold) { if (p.throwHold.t < THROW_HOLD) inp.mouse.down[2] = true; else act('throw blade (full)'); }
        else { inp.mouse.clicked[2] = true; B.throws = (B.throws || 0) + 1; if (B.throws % 2 === 0) inp.mouse.down[2] = true; act('throw blade'); }
      } else if (tdist < reach && !sneaking) { inp.mouse.down[0] = true; act('strike'); }
      if (p.armed && tdist < 220 && tdist > 60 && rnd() < 0.002) { inp.mouse.clicked[2] = true; act('throw weapon'); }
    }
    if (gun && p.reserveCount() > 0 && !p.reloading && (p.weapon.mag === 0 || (!foe && p.weapon.mag < d.mag && rnd() < 0.01))) { press(inp, 'KeyR'); act('reload'); }

    // a long execution whose man is dead, somebody on him: he walks out of it, as a player would (Space)
    if (p.execution?.dead && !p.execution.f.quick && w.danger?.threatened(p)) { press(inp, 'Space'); act('walk out of the execution'); }
    // context actions
    const ca = p.contextAction;
    // a guard who offers himself as a shield (Player.nearShield) is taken one time in four (E) rather than taken
    // down; held, he is thrown after a moment (the right click), or killed by the click when no loaded gun is in hand
    if (p.shield) {
      B.shieldT ??= S.clock + 0.6 + rnd() * 2.5;
      if (S.clock > B.shieldT) {
        B.shieldT = null;
        if ((gun && p.weapon.mag > 0) || rnd() < 0.5) { inp.mouse.clicked[2] = true; act('throw the shield'); }
        else { inp.mouse.down[0] = true; inp.mouse.clicked[0] = true; act(`click (${ca})`); }
      }
    } else B.shieldT = null;
    // (always the man a lesson keeps for it, systems/Tutorial.js `only`: nothing else gets him out of the way)
    if (p.nearShield && (p.nearShield.shieldOnly || rnd() < 0.25)) { press(inp, 'KeyE'); act('take a shield'); }
    // (nearBack: the same before 4148aa1, for a bisect over older commits)
    else if (ca && (p.nearTakedown ?? p.nearBack) && !VAULTS.has(ca)) { inp.mouse.down[0] = true; inp.mouse.clicked[0] = true; act(`click (${ca})`); }
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

  // ---------------------------------------------------------------- chaos: the tester trying to break the game
  // A chaos plan is a plan (its `steps`, as in PLANS) and then its mischief: fn(c) every frame for `dur` s, with
  // c = { w, p, inp, M (its own state), rnd (its own dice, from the seed, the session and its name), t (s into it) }.
  // `own`: it takes the inputs over, else it is laid over the bot's free play; fn sets M.over to end it early.
  // god: false lets him die even in --god; levels: only on those. They come from a deck of their own for a share of
  // the draws (--chaos: all of them, --chaos-share x), and every finding carries the plan it came under.
  const MASH_KEYS = ['Mouse0', 'Mouse2', 'Space', 'KeyE', 'KeyR'];
  const MENU_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Escape', 'KeyW', 'KeyS', 'KeyE', 'KeyR', 'Backspace', 'Mouse0', 'Mouse2'];
  const VAULTABLE = /table|counter|desk|crate|sofa|bench|armchair|keg|washer/;

  // a key, or a click (Mouse0 / Mouse2), pressed this frame
  function hit(inp, code) {
    if (code === 'Mouse0' || code === 'Mouse2') { const b = code === 'Mouse0' ? 0 : 2; inp.mouse.clicked[b] = inp.mouse.down[b] = true; }
    else press(inp, code);
  }
  const pickOf = (r, list) => list[Math.floor(r() * list.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearest = (list, at) => list.reduce((best, o) => (!best || dist(o, at) < dist(best, at) ? o : best), null);
  const chaosStat = (name) => ((S.stats.chaos ||= {})[name] ||= {});
  const restingWeapons = (w) => w.items.filter((it) => !it.dead && it.def && it.speed <= 3);
  // no wall tile on the straight line from a to b
  const clearLine = (w, a, b) => {
    const n = Math.ceil(dist(a, b) / 8);
    for (let i = 1; i < n; i++) if (w.map.solidAt(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
    return true;
  };
  const freeCell = (w, x, y) => w.map.inside(x, y) && !w.map.isBlocked(...cellOf(x, y)) && !w.map.solidAt(x, y);
  // a point r px from `at` in one of 16 directions, on a free cell and in a straight line to it, nearest to the player
  function approach(w, p, at, r, pred = () => true) {
    let best = null;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, s = { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r };
      if (!freeCell(w, s.x, s.y) || !clearLine(w, s, at) || !pred(s)) continue;
      if (!best || dist(s, p) < dist(best, p)) best = s;
    }
    return best;
  }

  // walk to (x, y) along the grid, straight for the last steps: px left to go
  function follow(c, x, y, near = 8) {
    const { w, p, inp, M } = c, d = Math.hypot(x - p.x, y - p.y);
    if (d < near) return d;
    const F = M.follow;
    if (!F || Math.hypot(F.x - x, F.y - y) > 4 || S.clock > F.t) M.follow = { x, y, t: S.clock + 2, path: findPath(w.map, p.x, p.y, x, y, 8000) || [], i: 0 };
    const f = M.follow;
    let wp = f.path[f.i];
    while (wp && Math.hypot(wp.x - p.x, wp.y - p.y) < 12) wp = f.path[++f.i];
    if (!wp || d < 40) wp = { x, y };
    steer(inp, wp.x - p.x, wp.y - p.y);
    aimAt(inp, p.x + (wp.x - p.x) * 3, p.y + (wp.y - p.y) * 3);
    return d;
  }

  // a free cell next to a wall within 8 tiles: where he stands, and the wall's centre he faces
  function wallSpot(w, p) {
    let best = null;
    for (const [cx, cy] of B.walkable) {
      const x = (cx + 0.5) * TILE, y = (cy + 0.5) * TILE, d = Math.hypot(x - p.x, y - p.y);
      if (d > 8 * TILE || (best && d >= best.d)) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!w.map.isSolid(cx + ox, cy + oy)) continue;
        best = { x, y, d, wx: x + ox * TILE * 0.6, wy: y + oy * TILE * 0.6 };
        break;
      }
    }
    return best;
  }

  const staticAt = (w, x, y) => Matter.Query.point(w.props.filter((q) => !q.dead && q.body?.isStatic).map((q) => q.body), { x, y }).length > 0;
  // a corner of a piece of furniture to vault at 45 degrees: the stand point out along its diagonal
  function cornerSpot(w, p, M) {
    M.used ||= new Set();
    const list = w.props.filter((q) => !q.dead && !q.isVehicle && q.body && VAULTABLE.test(q.type) && Math.hypot(q.x - p.x, q.y - p.y) < 12 * TILE)
      .sort((a, b) => dist(a, p) - dist(b, p));
    for (const q of list) {
      for (const v of q.body.vertices) {
        const key = `${q.type}@${Math.round(v.x)},${Math.round(v.y)}`;
        if (M.used.has(key)) continue;
        M.used.add(key);
        const ux = v.x - q.body.position.x, uy = v.y - q.body.position.y, l = Math.hypot(ux, uy) || 1;
        const s = { x: v.x + (ux / l) * 28, y: v.y + (uy / l) * 28 };
        if (!freeCell(w, s.x, s.y) || staticAt(w, s.x, s.y)) continue;
        return { type: q.type, sx: s.x, sy: s.y, cx: v.x, cy: v.y, q };
      }
    }
    return null;
  }

  // what to slide into: door leaves, the curtain, cars (one of each kind in turn, nearest first)
  function slideTargets(w, p) {
    const doors = w.doors.filter((d) => !d.locked).map((d) => ({ kind: 'door', ...doorMid(d) }));
    const curtains = w.props.filter((q) => !q.dead && q.type === 'curtain').map((q) => ({ kind: 'curtain', x: q.x, y: q.y }));
    const cars = w.props.filter((q) => !q.dead && q.isVehicle && !q.exploded).map((q) => ({ kind: 'car', x: q.x, y: q.y }));
    const by = [doors, curtains, cars].map((l) => l.sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 2));
    const out = [];
    for (let i = 0; i < 2; i++) for (const l of by) if (l[i]) out.push(l[i]);
    return out;
  }

  const inRects = (rects, x, y) => (rects || []).some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 + 1 && y >= y0 && y <= y1 + 1);
  const doorGuard = (w) => w.enemies.find((e) => e.alive && !e.yielded && e.job === 'door');

  // menus, the opening and the results: keys and clicks at random (states that are not play)
  function mashKeys(inp, r, keys = MENU_KEYS) {
    if (r() < 0.35) hit(inp, pickOf(r, keys));
    if (r() < 0.1) { inp.mouse.x = r() * game.canvas.width; inp.mouse.y = r() * game.canvas.height; }
  }

  const CHAOS = {
    // attack, throw, Space, E and R hammered while locked in a takedown, a finisher, a kick, a slide, a vault, a reload
    mashMoves: { dur: 60, fn: ({ p, inp, rnd: r }) => {
      const mv = p.takedown ? 'takedown' : p.execution ? 'execution' : p.kick ? 'kick' : p.slide ? 'slide' : p.vaulting ? 'vault'
        : p.reloading > 0 ? 'reload' : p.trunkOpen ? 'trunk' : null;
      if (!mv || r() > 0.6) return;
      hit(inp, pickOf(r, MASH_KEYS));
      bump(chaosStat('mashed'), mv);
    } },
    // Escape in slow motion, under a kill banner, in a takedown or a finisher; held paused a few frames, then back
    pauseMash: { dur: 60, fn: ({ p, inp, M, rnd: r }) => {
      const why = game.slow ? 'slowmo' : S.clock - (S.killClock ?? -9) < 0.6 ? 'kill banner' : p.takedown ? 'takedown' : p.execution ? 'execution' : null;
      if (!why || S.clock < (M.next || 0)) return;
      M.next = S.clock + 0.8 + r() * 2;
      S.pauseHold = Math.floor(r() * 30);
      hit(inp, 'Escape');
      bump(chaosStat('paused'), why);
      act(`pause (${why})`);
    } },
    // Backspace (restart) in slow motion or in a finisher
    restartMash: { dur: 90, fn: ({ p, inp, M, rnd: r }) => {
      const why = game.slow ? 'slowmo' : p.execution ? 'execution' : null;
      if (!why || M.done || r() > 0.08) return;
      M.done = true;
      hit(inp, 'Backspace');
      bump(chaosStat('restarted'), why);
      act(`restart (${why})`);
    } },
    // shot dead by the nearest guard while in a finisher (he does not walk out of it)
    dieInExecution: { dur: 120, god: false, fn: ({ w, p, inp, M }) => {
      if (!p.execution) { M.in = null; return; }
      inp.pressed.delete('Space');
      M.in ??= S.clock;
      if (S.clock - M.in < 0.35 || M.shot) return;
      const g = nearest(w.enemies.filter((e) => e.alive && !(e.knocked > 0) && e !== p.execution.target && dist(e, p) < 500), p);
      if (!g) return;
      M.shot = true;
      const a = Math.atan2(p.y - g.y, p.x - g.x);
      act('killed in a finisher');
      bump(chaosStat('killedIn'), p.execution.f.quick ? 'quick finisher' : 'long finisher');
      if (g.def?.kind === 'gun') p.shot(a, g.def, dist(g, p), g, {});
      else p.kill(a, 'melee', g, g.def || {}, {});
    } },
    // the weapon in hand thrown at a wall point blank, picked up again, six times
    throwAtWall: { own: true, dur: 45, fn: (c) => {
      const { w, p, inp, M } = c;
      if ((M.n || 0) >= 6) { M.over = true; return; }
      if (!p.armed) {
        const it = nearest(restingWeapons(w), p);
        if (!it) { M.over = true; return; }
        if (p.nearItem) hit(inp, 'KeyE'); else follow(c, it.x, it.y, 4);
        return;
      }
      M.wall ??= wallSpot(w, p);
      if (!M.wall) { M.over = true; return; }
      if (follow(c, M.wall.x, M.wall.y, 6) >= 6) return;
      aimAt(inp, M.wall.wx, M.wall.wy);
      if (Math.abs(angDiff(p.angle, Math.atan2(M.wall.wy - p.y, M.wall.wx - p.x))) < 0.2 && S.clock > (M.next || 0)) {
        hit(inp, 'Mouse2');
        M.n = (M.n || 0) + 1; M.next = S.clock + 0.6; M.wall = null;
        bump(chaosStat('thrownAtWall'), p.weapon?.type || '?');
        act('throw at the wall');
      }
    } },
    // Space at a 45 degree angle into the corners of tables, counters, crates...
    vaultCorner: { own: true, dur: 50, ok: (w) => w.props.some((q) => !q.dead && VAULTABLE.test(q.type)), fn: (c) => {
      const { w, p, inp, M } = c;
      if ((M.n || 0) >= 8) { M.over = true; return; }
      if (p.vaulting) { M.went = true; return; }
      if (!M.k) { M.k = cornerSpot(w, p, M); if (!M.k) { M.over = true; return; } M.t0 = S.clock; M.at = null; M.went = false; }
      const k = M.k;
      const done = (how) => { M.n = (M.n || 0) + 1; bump(chaosStat('cornerVault'), how); M.k = null; };
      if (M.went) return done('vaulted');
      if (!M.at) {
        if (follow(c, k.sx, k.sy, 6) >= 6) { if (S.clock - M.t0 > 10) done('unreached'); return; }
        M.at = S.clock;
      }
      steer(inp, k.cx - p.x, k.cy - p.y);
      aimAt(inp, k.cx + (k.cx - p.x) * 3, k.cy + (k.cy - p.y) * 3);
      if (S.clock > (M.space || 0)) { hit(inp, 'Space'); M.space = S.clock + 0.25; }
      if (S.clock - M.at > 2) done('refused');
    } },
    // a run and a slide into a door leaf, the curtain, a car (and then on pushing at the car)
    slideInto: { own: true, dur: 70, fn: (c) => {
      const { w, p, inp, M } = c;
      M.list ??= slideTargets(w, p);
      if (!M.k) {
        M.k = M.list.shift();
        if (!M.k) { M.over = true; return; }
        M.stand = approach(w, p, M.k, 100);
        M.phase = 'go'; M.t0 = S.clock;
        if (!M.stand) { M.k = null; return; }
      }
      const k = M.k;
      if (M.phase === 'go') {
        if (follow(c, M.stand.x, M.stand.y, 8) < 8) { M.phase = 'run'; M.t0 = S.clock; } else if (S.clock - M.t0 > 12) M.k = null;
        return;
      }
      steer(inp, k.x - p.x, k.y - p.y);
      aimAt(inp, k.x + (k.x - p.x), k.y + (k.y - p.y));
      if (M.phase === 'run' && S.clock - M.t0 > 0.4) { hit(inp, 'Space'); M.phase = 'slide'; M.t0 = S.clock; bump(chaosStat('slidInto'), k.kind); act(`slide into ${k.kind}`); }
      if (M.phase === 'slide' && S.clock - M.t0 > (k.kind === 'car' ? 4 : 1.5)) M.k = null;
    } },
    // a car walked into, side on, for four seconds: one of the traffic stopped for him in its lane (he stands in the
    // road until a driver brakes: --god, or this plan's own invulnerability), else a parked one shot loose first
    shoveCar: { own: true, dur: 60, god: true, ok: (w) => w.props.some((q) => q.isVehicle && !q.dead), fn: (c) => {
      const { w, p, inp, M } = c;
      const lane = PLANS[opts.level]?.road?.steps[0]?.go;
      const stopped = () => (w.ambient?.cars || []).find((k) => k.d?.state === 'stopped' && !k.v.dead && dist(k.v, p) < 200)?.v;
      if (!M.car) {
        M.car = stopped();
        if (!M.car && lane && c.t < 30) { follow(c, lane[0] * TILE, lane[1] * TILE, 6); return; } // wait in the lane
        M.car ||= nearest(w.props.filter((q) => q.isVehicle && !q.dead && !q.exploded), p);
        if (!M.car) { M.over = true; return; }
        const b = M.car.body.bounds, cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
        const sides = b.max.x - b.min.x > b.max.y - b.min.y // the middle of a long side, a step off it
          ? [{ x: cx, y: b.min.y - 16, ux: 0, uy: 1 }, { x: cx, y: b.max.y + 16, ux: 0, uy: -1 }]
          : [{ x: b.min.x - 16, y: cy, ux: 1, uy: 0 }, { x: b.max.x + 16, y: cy, ux: -1, uy: 0 }];
        M.side = sides.filter((o) => freeCell(w, o.x, o.y)).sort((a, b2) => dist(a, p) - dist(b2, p))[0];
        if (!M.side) { M.over = true; return; }
        M.phase = 'go'; M.t0 = S.clock; M.shots = M.car.body.isStatic ? 0 : 2; // a frozen one is shot loose first
      }
      const o = M.side, car = M.car;
      if (M.phase === 'go') {
        if (follow(c, o.x, o.y, 6) < 6) { M.phase = 'shoot'; M.t0 = S.clock; } else if (S.clock - M.t0 > 15) M.over = true;
        return;
      }
      aimAt(inp, car.x, car.y);
      if (M.phase === 'shoot') {
        if (p.hasGun && p.weapon.mag > 0 && M.shots < 2) { if (S.clock > (M.fire || 0)) { hit(inp, 'Mouse0'); M.shots++; M.fire = S.clock + 0.2; } return; }
        M.phase = 'push'; M.t0 = S.clock; M.from = { x: car.body.position.x, y: car.body.position.y }; act(`walk into the ${car.type}`); bump(chaosStat('shoveCar'), `${car.type}${car.body.isStatic ? ' (frozen)' : ''}`);
      }
      steer(inp, o.ux, o.uy);
      if (S.clock - M.t0 > 4) { M.over = true; bump(chaosStat('shoveCarPx'), Math.round(dist(car.body.position, M.from))); }
    } },
    // in a doorway, in and out across it, now and then E
    doorCamp: { own: true, dur: 25, ok: (w) => w.doors.some((d) => !d.locked && d.cells?.length), fn: (c) => {
      const { w, p, inp, M, rnd: r } = c;
      if (!M.door) {
        M.door = nearest(w.doors.filter((d) => !d.locked && d.cells?.length).map((d) => Object.assign(doorMid(d), { d })), p)?.d;
        if (!M.door) { M.over = true; return; }
        const i = M.door.cells[0], W = w.map.w;
        M.at = { x: (i % W + 0.5) * TILE, y: (Math.floor(i / W) + 0.5) * TILE };
        M.n = { x: -Math.sin(M.door.a0), y: Math.cos(M.door.a0) };
      }
      if (!M.in) { if (follow(c, M.at.x, M.at.y, 6) < 6) { M.in = S.clock; act('in the doorway'); } else if (c.t > 15) M.over = true; return; }
      const k = Math.floor((S.clock - M.in) / 0.6) % 2 ? 1 : -1;
      steer(inp, M.at.x + M.n.x * k * 22 - p.x, M.at.y + M.n.y * k * 22 - p.y);
      if (r() < 0.04) hit(inp, 'KeyE');
    } },
    // through the VIP curtain and back, again and again
    curtainRun: { own: true, dur: 45, ok: (w) => w.props.some((q) => !q.dead && q.type === 'curtain'), fn: (c) => {
      const { w, M } = c;
      if (!M.ends) {
        const q = w.props.find((o) => !o.dead && o.type === 'curtain');
        const a = q.body?.angle ?? q.angle ?? 0;
        for (const [nx, ny] of [[-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)]]) {
          const A = { x: q.x + nx * 44, y: q.y + ny * 44 }, Bp = { x: q.x - nx * 44, y: q.y - ny * 44 };
          if (freeCell(w, A.x, A.y) && freeCell(w, Bp.x, Bp.y)) { M.ends = [A, Bp]; break; }
        }
        if (!M.ends) { M.over = true; return; }
        M.i = 0; M.t0 = S.clock;
      }
      if ((M.passes || 0) >= 10) { M.over = true; return; }
      const e = M.ends[M.i % 2];
      if (follow(c, e.x, e.y, 10) < 10 || S.clock - M.t0 > 8) { M.i++; M.passes = (M.passes || 0) + 1; M.t0 = S.clock; bump(chaosStat('curtain'), 'pass'); }
    } },
    // loose furniture pushed into doorways
    shoveFurniture: { own: true, dur: 50, fn: (c) => {
      const { w, p, inp, M } = c;
      if (!M.list) {
        const doors = w.doors.filter((d) => !d.locked).map(doorMid);
        M.list = w.props.filter((q) => !q.dead && !q.isVehicle && q.body && !q.body.isStatic && dist(q, p) < 10 * TILE && doors.length)
          .map((q) => ({ q, door: nearest(doors, q) })).filter((o) => dist(o.q, o.door) < 6 * TILE)
          .sort((a, b) => dist(a.q, a.door) - dist(b.q, b.door)).slice(0, 3);
      }
      if (!M.k) { M.k = M.list.shift(); if (!M.k) { M.over = true; return; } M.phase = 'go'; M.t0 = S.clock; }
      const { q, door } = M.k;
      if (q.dead) { M.k = null; return; }
      const l = dist(door, q) || 1, ux = (door.x - q.x) / l, uy = (door.y - q.y) / l;
      const b = q.body.bounds, rad = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) / 2;
      if (M.phase === 'go') {
        const s = { x: q.x - ux * (rad + 14), y: q.y - uy * (rad + 14) };
        if (follow(c, s.x, s.y, 8) < 8) { M.phase = 'push'; M.t0 = S.clock; act(`shove ${q.type} at a door`); } else if (S.clock - M.t0 > 10) M.k = null;
        return;
      }
      steer(inp, ux, uy);
      if (S.clock - M.t0 > 6) { bump(chaosStat('shoved'), q.type); M.k = null; }
    } },
    // a gun emptied into one prop, reloaded, emptied again
    emptyIntoProp: { own: true, dur: 35, steps: [{ pick: '*gun', any: true }],
      ok: (w, p) => (p.hasGun && p.weapon.mag > 0) || w.items.some((it) => !it.dead && it.def?.kind === 'gun' && it.mag > 0), fn: (c) => {
        const { w, p, inp, M } = c;
        if (!p.hasGun) { M.over = true; return; }
        if (!M.q || M.q.dead || !w.props.includes(M.q)) {
          if ((M.targets = (M.targets || 0) + 1) > 3) { M.over = true; return; }
          M.q = nearest(w.props.filter((q) => !q.dead && !q.def.lasting && q.def.mount !== 'ceiling' && dist(q, p) > 50 && dist(q, p) < 230 && w.lineOfSight(p.x, p.y, q.x, q.y)), p);
          if (!M.q) { M.over = true; return; }
        }
        aimAt(inp, M.q.x, M.q.y);
        if (p.weapon.mag > 0) { if (S.clock > (M.fire || 0)) { hit(inp, 'Mouse0'); M.fire = S.clock + 0.14; bump(chaosStat('roundsInto'), M.q.type); } }
        else if (p.reserveCount() > 0) { if (!p.reloading) hit(inp, 'KeyR'); }
        else if (!p.reloading) M.over = true;
      } },
    // three minutes unarmed in front of the doorman, on public ground: nobody should get worked up at him
    bouncerStare: { own: true, dur: 200, levels: ['level1'], ok: (w, p) => !p.armed && !!doorGuard(w), fn: (c) => {
      const { w, p, inp, M } = c;
      const g = (M.g ??= doorGuard(w));
      if (!g?.alive || p.armed) { M.over = true; return; }
      if (!M.spot) {
        // in front of him (where a man standing about is seen), off the premises
        const pub = (s) => !inRects(w.level.premises, s.x / TILE, s.y / TILE);
        M.spot = approach(w, p, g, 48, (s) => pub(s) && Math.abs(angDiff(g.angle, Math.atan2(s.y - g.y, s.x - g.x))) < 0.7) || approach(w, p, g, 48, pub);
        if (!M.spot) { M.over = true; return; }
      }
      if (!M.at) {
        if (follow(c, M.spot.x, M.spot.y, 6) >= 6) { if (c.t > 40) M.over = true; return; }
        M.at = S.clock;
        M.hot = new Set(w.enemies.filter((e) => e.aware === 2));
        act('stares at the doorman');
      }
      aimAt(inp, g.x, g.y);
      if (M.told || S.clock - M.at < 2) return;
      const hot = w.enemies.find((e) => e.alive && e.aware === 2 && !M.hot.has(e));
      if (hot || M.challenged) {
        M.told = true;
        report('loiter-provoked', 'error', `${(hot || g).job || (hot || g).kind}`, posOf(p.x, p.y), {
          why: 'a guard got worked up at an unarmed man standing still on public ground', after: r1(S.clock - M.at), said: M.said || [],
          challenge: M.challenged || null, guard: hot && { kind: hot.kind, job: hot.job, state: hot.state, aware: hot.aware, at: cellOf(hot.x, hot.y) },
        });
      }
    } },
    // a weapon picked up and dropped (thrown at his feet) fifty times
    pickDrop: { own: true, dur: 90, ok: (w) => restingWeapons(w).length > 0, fn: (c) => {
      const { w, p, inp, M } = c;
      if ((M.picks || 0) >= 50) { M.over = true; return; }
      if (S.clock < (M.wait || 0)) return;
      if (p.armed) {
        aimAt(inp, p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24);
        hit(inp, 'Mouse2');
        M.wait = S.clock + 0.35;
        return;
      }
      if (p.nearItem) { hit(inp, 'KeyE'); M.picks = (M.picks || 0) + 1; bump(chaosStat('pickDrop'), 'pick'); M.wait = S.clock + 0.25; return; }
      const it = nearest(restingWeapons(w), p);
      if (!it) { M.over = true; return; }
      follow(c, it.x, it.y, 4);
    } },
    // E hammered at every device of the level (jukebox, alarm, trapdoor...)
    deviceMash: { own: true, dur: 60, ok: (w) => !!w.uses?.spots.length, fn: (c) => {
      const { w, p, inp, M, rnd: r } = c;
      M.list ??= w.uses.spots.slice();
      if (!M.cur) { M.cur = M.list.shift(); if (!M.cur) { M.over = true; return; } M.t0 = S.clock; M.at = null; M.stand = standBy(w, p, w.uses.at(M.cur)); }
      const at = w.uses.at(M.cur);
      if (!M.at) {
        if (!M.stand || S.clock - M.t0 > 15) { M.cur = null; return; }
        if (follow(c, M.stand.x, M.stand.y, 8) < 8) M.at = S.clock;
        return;
      }
      if (dist(at, p) > 14) steer(inp, at.x - p.x, at.y - p.y);
      aimAt(inp, at.x, at.y);
      if (r() < 0.5) { hit(inp, 'KeyE'); bump(chaosStat('deviceMash'), M.cur.kind); }
      if (S.clock - M.at > 3) M.cur = null;
    } },
    // the fuse box broken, then a fight in the dark
    darkFight: { dur: 45, levels: ['level1', 'lab'], get steps() { return PLANS[opts.level]?.fuse?.steps || []; },
      ok: (w, p) => !!PLANS[opts.level]?.fuse && PLANS[opts.level].fuse.ok(w, p), fn: () => {} },
    // a fight dragged through the liquor store and up its ladder onto the roof
    roofFight: { dur: 25, levels: ['level1'], steps: [{ provoke: true }, ...ROOF_UP, { wait: 12 }], fn: () => {} },
    // into the tutorial's fire
    tutorialFire: { own: true, dur: 20, levels: ['tutorial'], fn: (c) => {
      const { w, p, M } = c, f = w.fireSpread?.nearest(p.x, p.y);
      if (!f) return; // not lit yet
      if (!M.in) { M.in = S.clock; act('into the fire'); bump(chaosStat('fire'), 'walked in'); }
      follow(c, f.x, f.y, 2);
    } },
    // keys at the pause menu, the title menu, the opening (and, in chaos runs, the results screen: see tick)
    menuMash: { own: true, dur: 30, fn: ({ inp, rnd: r }) => {
      if (!S.mash) { S.mash = { phase: 'pause', until: S.clock + 3, hard: S.clock + 15, rnd: r }; hit(inp, 'Escape'); act('menus: pause'); return; }
      if (S.mash.phase === 'pause' && S.clock > S.mash.until) {
        S.mash.phase = 'title'; S.mash.until = S.clock + 3;
        act('menus: title');
        game.toTitle();
      }
    } },
    // a monkey on the controls: seeded random keys, aim, clicks for a minute
    monkey: { own: true, dur: 60, fn: ({ inp, M, rnd: r }) => {
      if (!M.keys || r() < 0.05) M.keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'].filter(() => r() < 0.35);
      for (const k of M.keys) inp.keys.add(k);
      if (!M.mouse || r() < 0.08) M.mouse = { x: r() * game.canvas.width, y: r() * game.canvas.height };
      inp.mouse.x = M.mouse.x; inp.mouse.y = M.mouse.y;
      if (M.hold > 0) { M.hold--; inp.mouse.down[0] = true; }
      const x = r();
      if (x < 0.06) { hit(inp, 'Mouse0'); M.hold = Math.floor(r() * 20); }
      else if (x < 0.09) hit(inp, 'Space');
      else if (x < 0.12) hit(inp, 'KeyE');
      else if (x < 0.14) hit(inp, 'KeyR');
      else if (x < 0.15) hit(inp, 'Mouse2');
      else if (x < 0.152) hit(inp, 'Escape');
      else if (x < 0.1523) hit(inp, 'Backspace');
    } },
  };

  function startMischief(pl) {
    const d = planDef(pl.name);
    B.mischief = { name: pl.name, chaos: true, drawn: pl.drawn, own: !!d.own, fn: d.fn, t0: S.clock, until: S.clock + (d.dur || 30), M: {},
      rnd: prng(K.hash(opts.seed, S.session, pl.name)) };
    S.sess.lastPlan = { name: pl.name, chaos: true, drawn: pl.drawn };
    act(`mischief ${pl.name}`);
  }

  function endMischief(why) {
    const m = B.mischief;
    B.mischief = null;
    planStat(m.name).done++;
    act(`mischief ${m.name} over (${why})`);
    B.goal = B.path = null;
    B.nextPlanT = S.clock + 8;
    const p = game.world?.player;
    if (typeof planDef(m.name)?.god === 'boolean' && p?.alive) p.invulnerable = !!opts.god;
  }

  function runMischief(w, p, inp, m) {
    try { m.fn({ w, p, inp, M: m.M, rnd: m.rnd, t: S.clock - m.t0 }); } catch (e) {
      report('exception', 'error', `bot: chaos ${m.name}: ${firstLine(e?.message || e)}`, posOf(p.x, p.y),
        { where: 'bot.js (a tool bug)', message: String(e?.message || e), stack: String(e?.stack || '').split('\n').slice(0, 8).join('\n') });
      m.over = true;
    }
  }

  // ---------------------------------------------------------------- deeper invariants
  // checks.js judges, this gathers: what each character is drawn in (pose, draw-scale), the camera, the moves the
  // player is locked in (stuck-anim), the dead acting alive (ghost), loose props in walls, cars carried along by
  // people on foot, weapons out of reach, sounds that play nothing, door leaves, civilians who stop fleeing, bodies
  // that will not lie still. Sampled every 30 steps, capped per sample; the cost is kept in S.cost.
  const whoOf = (ch) => (ch.isPlayer ? 'player' : ch.isEnemy ? 'guard' : String(ch.kind || '').startsWith('dancer') ? 'dancer' : 'civilian');
  const LOOSE_POSE = { sMin: 0, sMax: 99, torso: 999 }; // a man on the floor is drawn by drawDown: numbers only
  const PROBE_CAP = 10;  // characters drawn into the probe per sample (round robin)
  const PROP_CAP = 90;   // loose props looked at per sample
  const ITEM_CAP = 24;   // weapons on the floor per sample
  const DOOR_SWING = 1.75; // entities/Door.js MAX_SWING
  let probeCtx = null;

  function newTrackers(w) {
    S.blasts = []; S.shotT = -9; S.camStart = true;
    S.trk = {
      moves: new Map(),           // move kind -> { o, t0, limit, told }
      props: new K.Spell(1),      // a loose prop's centre in a wall or a solid piece of furniture
      items: new K.Spell(1.5),    // a weapon on the floor nobody can get within reach of
      doors: new K.Spell(0.4),    // a locked leaf on somebody
      offScreen: new K.Spell(1),  // the player out of the picture
      civ: new K.Anchor(6, 4), civDone: new K.Spell(4),
      cars: new K.ShoveWatch(6, 3),
      corpses: new K.CorpseWatch(),
      pFilter: { ...w.player.body.collisionFilter },
    };
  }

  // what a character is locked in or holding, for a finding's detail (a door hand's fields: the NaN pose of c7f2738)
  const movesOf = (ch) => ({
    state: ch.state, doorHand: ch.doorHand ? Object.keys(ch.doorHand) : null, lockHand: !!ch.lockHand, takedown: !!ch.takedown,
    execution: !!ch.execution, held: !!ch.held, vaulting: ch.vaulting?.kind || null, slide: !!ch.slideAnim, kick: !!ch.kick,
    sit: ch.sit || 0, knocked: ch.knocked > 0, posted: !!ch.postBody?.(), crouch: ch.crouch || 0, dance: !!ch.dance,
  });

  // after a character's draw (init wraps the prototypes' draw): his pose as drawn; in the real frame, his size
  function afterDraw(ch, entry) {
    const w = game.world;
    if (!w || ch.world !== w || !ch.pose) return;
    const issues = K.poseIssues(ch.pose, ch.facing, ch.knocked > 0 ? LOOSE_POSE : K.POSE);
    if (issues.length) {
      report('pose', 'error', `${whoOf(ch)}:${issues[0].field}`, posOf(ch.x, ch.y),
        { who: whoOf(ch), kind: ch.kind, issues: issues.slice(0, 6), moves: movesOf(ch), probe: S.probing });
    }
    if (entry === null || ch.knocked > 0) return;
    // (the pose's own scale, a vault's dip or a landing, is the pose check's: here the frame he is drawn in)
    const cam = game.camera, bad = K.drawScale(entry, 1, cam.zoom * (cam.scale ?? 1));
    if (bad) {
      report('draw-scale', 'error', whoOf(ch), posOf(ch.x, ch.y),
        { who: whoOf(ch), kind: ch.kind, ...bad, entry: r1(entry * 100) / 100, poseS: ch.pose.s, crouch: ch.crouch || 0, zoom: cam.zoom, scale: cam.scale, moves: movesOf(ch) });
    }
  }

  // wrap the draw of every character class (Player / Enemy / Civilian and Character under them) once
  function wrapDraws(chars) {
    S.drawProtos ||= new Set();
    for (const ch of chars) {
      for (let pr = Object.getPrototypeOf(ch); pr && pr !== Object.prototype; pr = Object.getPrototypeOf(pr)) {
        if (S.drawProtos.has(pr) || !Object.prototype.hasOwnProperty.call(pr, 'draw')) continue;
        S.drawProtos.add(pr);
        const draw = pr.draw;
        // the scale the body is drawn at: the transform when the innermost draw (Character's) is entered, a crouch's
        // shrink included; the outer one's when a class draws the pose itself (a guard at his post)
        const base = !Object.getPrototypeOf(pr) || Object.getPrototypeOf(pr) === Object.prototype;
        pr.draw = function (ctx) {
          const outer = S.drawDepth === 0, real = !S.probing && game.state === 'play' && !!ctx?.getTransform;
          if (outer) S.entry = null;
          if (real && (outer || base)) { const m = ctx.getTransform(); S.entry = Math.hypot(m.a, m.b); }
          S.drawDepth++;
          try { return draw.call(this, ctx); } finally {
            S.drawDepth--;
            if (outer) { const t0 = performance.now(); afterDraw(this, real ? S.entry : null); S.cost.wraps += performance.now() - t0; }
          }
        };
      }
    }
  }

  // the dead acting alive: a word, a step under his own steering (wrapped on the prototypes once)
  function wrapGhosts(w) {
    if (S.ghostWrapped) return;
    S.ghostWrapped = true;
    const wrap = (pr, name, test) => {
      const f = pr?.[name];
      if (typeof f !== 'function') return;
      pr[name] = function (...a) {
        // what the guards say to a man staring at the doorman (chaos bouncerStare), for its finding
        const m = B.mischief;
        if (name === 'say' && m?.name === 'bouncerStare' && m.M.at && this.alive) (m.M.said ||= []).push(`${this.job || this.kind}: ${a[0]}`);
        if (this.alive === false && this.world === game.world && test(a)) {
          report('ghost', 'error', `${whoOf(this)} ${name}`, posOf(this.x, this.y), { who: whoOf(this), kind: this.kind, what: name, args: a.filter((x) => typeof x !== 'object').slice(0, 3) });
        }
        return f.apply(this, a);
      };
    };
    const charP = Object.getPrototypeOf(Object.getPrototypeOf(w.player));
    wrap(charP, 'speak', () => true);
    wrap(charP, 'steer', (a) => a[2] > 0);
    if (w.enemies[0]) wrap(Object.getPrototypeOf(w.enemies[0]), 'say', () => true);
    // a door locked on somebody in its arc (Tutorial locks one behind him)
    const doorP = w.doors[0] && Object.getPrototypeOf(w.doors[0]);
    const lock = doorP?.lock;
    if (lock) {
      doorP.lock = function (...a) {
        const r = lock.apply(this, a);
        if (this.world === game.world) for (const ch of onLeaf(this)) report('door-state', 'error', `locked-on-${whoOf(ch)}`, posOf(ch.x, ch.y), { why: 'a door was locked with somebody in its leaf', who: whoOf(ch), kind: ch.kind });
        return r;
      };
    }
  }

  // the living on a door's closed leaf (hinge to latch, along a0)
  const onLeaf = (d) => d.world.chars.filter((ch) => ch.alive && !ch.vaulting && !ch.hidden
    && K.segDist(ch.x, ch.y, d.hx, d.hy, d.hx + Math.cos(d.a0) * d.len, d.hy + Math.sin(d.a0) * d.len) < (ch.radius || 10) - 2);

  // a sound name the mixer has nothing for (src/audio/Audio.js play() then plays nothing, silently)
  function wrapAudio() {
    if (!Audio?.play || !D.sounds || Audio.play.__qa) return;
    const play = Audio.play;
    Audio.play = function (name, ...a) {
      if (typeof name === 'string' && !D.sounds.has(name) && !S.soundsMissing?.has(name)) {
        (S.soundsMissing ||= new Set()).add(name);
        const w = game.world;
        report('sound-missing', 'warn', name, w ? posOf(w.player.x, w.player.y) : null, { name, why: 'no GUNS / FOLEY / recipe / alias entry: it plays nothing' });
      }
      return play.call(this, name, ...a);
    };
    Audio.play.__qa = true;
  }

  // the player locked in a move longer than its data allows
  const MOVES = [['execution', (p) => p.execution], ['takedown', (p) => p.takedown], ['kick', (p) => p.kick],
    ['vault', (p) => p.vaulting], ['trunk', (p) => p.trunkOpen], ['passage', (p) => p.passage]];
  const snap = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean').slice(0, 14).map(([k, v]) => [k, typeof v === 'number' ? r1(v) : v]));
  function stuckAnim(w, p) {
    if (!p.alive) return;
    for (const [kind, get] of MOVES) {
      const o = get(p), t = S.trk.moves.get(kind);
      if (!o) { S.trk.moves.delete(kind); continue; }
      if (!t || t.o !== o) { S.trk.moves.set(kind, { o, t0: w.time, limit: K.moveLimit(kind, o, D), told: false }); continue; }
      const held = w.time - t.t0;
      if (t.told || held <= t.limit) continue;
      t.told = true;
      report('stuck-anim', 'error', `${kind}${o.f?.label ? ' ' + o.f.label : ''}`, posOf(p.x, p.y),
        { move: kind, held: r1(held), limit: r1(t.limit), label: o.f?.label || null, state: snap(o), target: o.target ? { kind: o.target.kind, alive: o.target.alive } : null });
    }
  }

  // the camera: back to the level's default at its start, nothing NaN, the player in the picture
  function cameraCheck(w, p) {
    const c = game.camera, start = S.camStart, cam = { x: c.x, y: c.y, zoom: c.zoom, scale: c.scale ?? 1, w: c.w, h: c.h }; // (no scale before 211ceb5)
    S.camStart = false;
    // (a staged level's shot may look away from him: systems/Direction.js, the tutorial)
    const see = p.alive && !p.hidden && !p.passage && game.state === 'play' && !w.tutorial?.shot?.()?.name;
    const s = see ? c.worldToScreen(p.x, p.y) : null;
    // a staged opening starts on its own shot, a level driven in the van (systems/Drive.js) on the view its speed gives
    const issues = K.cameraIssues(cam, { start, scale: w.tutorial || game.stagedShot?.() || w.drive ? undefined : 1,
      zoom: Math.max(1, Math.round(cam.h / D.VIEW)), player: s });
    let off = false;
    for (const f of issues) {
      if (f.sig === 'player-off-screen') { off = true; if (!S.trk.offScreen.hold('p', true, w.time)) continue; }
      report('camera', 'error', f.sig, posOf(p.x, p.y), { ...f, x: r1(cam.x), y: r1(cam.y), zoom: cam.zoom, scale: cam.scale, w: cam.w, h: cam.h, start });
    }
    if (!off) S.trk.offScreen.hold('p', false, w.time);
  }

  const blastNear = (w, x, y) => S.blasts.some((b) => w.time - b.t < 2.5 && Math.hypot(b.x - x, b.y - y) < b.r);
  const solidProps = (w, test) => w.props.filter((q) => !q.dead && q.body && (q.body.isStatic || q.isVehicle) && test(q));
  const canHit = (f, q) => Matter.Detector.canCollide(f, q.body.collisionFilter);
  // the solid prop (from list) whose body holds (x, y), or null
  function propAt(list, x, y, except = null) {
    for (const q of list) {
      if (q === except) continue;
      const b = q.body.bounds;
      if (x < b.min.x || x > b.max.x || y < b.min.y || y > b.max.y) continue;
      if (Matter.Query.point([q.body], { x, y }).length) return q;
    }
    return null;
  }

  // a loose prop whose centre stays inside a wall tile or a solid prop it collides with
  function propInWall(w) {
    const loose = w.props.filter((q) => !q.dead && q.body && !q.body.isStatic && !q.isVehicle && !q.def?.hung && !q.def?.high);
    const solid = solidProps(w, () => true), n = Math.min(PROP_CAP, loose.length);
    for (let i = 0; i < n; i++) {
      const q = loose[(S.rr.props + i) % loose.length], { x, y } = q.body.position;
      const wall = w.map.inside(x, y) && w.map.solidAt(x, y);
      const in_ = wall ? null : propAt(solid.filter((o) => canHit(q.body.collisionFilter, o)), x, y, q);
      const held = S.trk.props.hold(q, wall || !!in_, w.time);
      if (held) {
        report('prop-in-wall', 'error', `${q.type} in ${wall ? 'wall' : in_.type}`, posOf(x, y),
          { type: q.type, inside: wall ? 'wall' : in_.type, held: r1(held), speed: r1(Matter.Body.getSpeed(q.body)), sleeping: !!q.body.isSleeping });
      }
    }
    S.rr.props += n;
  }

  // a parked or stopped car that moves while only people on foot touch it
  function vehicleShove(w) {
    const cars = w.props.filter((v) => v.isVehicle && !v.dead && !v.exploded && v.body);
    // the traffic's cars (systems/Traffic.js Driver): moved by their drivers unless stopped
    const drivers = new Map((w.ambient?.cars || []).map((c) => [c.v, c.d]));
    for (const v of cars) {
      // a round, a blow, debris on it: not a shove (Vehicle.hit)
      if (!v.__qaHit) { const hit = v.hit; v.__qaHit = true; v.hit = function (...a) { this.__qaHitT = this.world.time; return hit.apply(this, a); }; }
      const b = v.body.bounds, pos = v.body.position, pad = 14;
      const on = (c) => c.alive && c.body && !c.hidden && c.x > b.min.x - pad && c.x < b.max.x + pad && c.y > b.min.y - pad && c.y < b.max.y + pad;
      const by = w.chars.filter(on);
      const bumped = cars.some((o) => o !== v && o.body.bounds.max.x > b.min.x - 8 && o.body.bounds.min.x < b.max.x + 8 && o.body.bounds.max.y > b.min.y - 8 && o.body.bounds.min.y < b.max.y + 8);
      const d = drivers.get(v), driven = !!d && !(d.state === 'stopped' && !(d.speed > 0));
      const excused = driven || !!v.moving || bumped || w.time - (v.__qaHitT ?? -9) < 2 || blastNear(w, pos.x, pos.y) || v === w.outro?.car || !!v.driver;
      const px = S.trk.cars.update(v, { x: pos.x, y: pos.y }, w.time, { touched: by.length > 0, excused });
      if (px) {
        report('vehicle-shoved', 'error', v.type, posOf(pos.x, pos.y),
          { type: v.type, px, by: by.map((c) => ({ who: whoOf(c), slide: !!c.slide, speed: r1(Math.hypot(c.vel?.x || 0, c.vel?.y || 0)) })), static: !!v.body.isStatic,
            traffic: d ? { state: d.state, reason: d.reason || null, speed: r1(d.speed || 0) } : null, vel: r1(Matter.Body.getSpeed(v.body)),
            lastShot: r1(w.time - S.shotT), lastHit: r1(w.time - (v.__qaHitT ?? -99)), at: cellOf(pos.x, pos.y), hp: v.hp });
      }
    }
  }

  // a weapon on the floor that nobody can get within reach of (inside a wall, a counter, under a car)
  function unreachableItems(w) {
    const f = S.trk.pFilter, solid = solidProps(w, (q) => canHit(f, q));
    const items = w.items.filter((it) => !it.dead && it.def && it.speed <= 0.5), n = Math.min(ITEM_CAP, items.length);
    for (let i = 0; i < n; i++) {
      const it = items[(S.rr.items + i) % items.length];
      const near = solid.filter((q) => { const b = q.body.bounds; return it.x > b.min.x - 48 && it.x < b.max.x + 48 && it.y > b.min.y - 48 && it.y < b.max.y + 48; });
      const free = (x, y) => w.map.inside(x, y) && !w.map.solidAt(x, y) && !propAt(near, x, y);
      const out = !K.reachable(it.x, it.y, free);
      const held = S.trk.items.hold(it, out, w.time);
      if (held) {
        const inside = w.map.solidAt(it.x, it.y) ? 'wall' : propAt(near, it.x, it.y)?.type || 'furniture around';
        report('unreachable-item', 'error', `${it.type} in ${inside}`, posOf(it.x, it.y), { type: it.type, inside, held: r1(held) });
      }
    }
    S.rr.items += n;
  }

  // door leaves: finite, within their stops, on their hinges; none locked on somebody
  function doorCheck(w) {
    for (const d of w.doors) {
      const b = d.body;
      if (!b) continue;
      const h = (d.len - d.back) / 2, ex = d.hx + Math.cos(b.angle) * h, ey = d.hy + Math.sin(b.angle) * h;
      const why = K.doorIssues({ rel: K.angDiff(d.a0, b.angle), max: DOOR_SWING, off: Math.hypot(b.position.x - ex, b.position.y - ey), x: b.position.x, y: b.position.y });
      for (const sig of why) {
        report('door-state', 'error', sig, posOf(d.hx, d.hy), { sig, locked: !!d.locked, rel: r1(K.angDiff(d.a0, b.angle)), hp: d.hp, at: cellOf(d.hx, d.hy) });
      }
      const on = d.locked ? onLeaf(d) : [];
      if (S.trk.doors.hold(d, on.length > 0, w.time)) {
        report('door-state', 'error', `locked-on-${whoOf(on[0])}`, posOf(on[0].x, on[0].y), { why: 'a locked leaf stands on somebody', who: whoOf(on[0]), at: cellOf(d.hx, d.hy) });
      }
    }
  }

  // a civilian running away or for cover who stays put with his way not done; one who got there and lingers
  function civStuck(w) {
    for (const c of w.civilians) {
      const b = c.brain;
      if (!c.alive || !b) { S.trk.civ.drop(c); continue; }
      const busy = c.knocked > 0 || c.held || c.vaulting || b.fall || c.slipped || c.asleep;
      const going = !busy && (b.state === 'flee' || b.state === 'hide') && b.route && b.ri < b.route.length;
      if (!going) S.trk.civ.drop(c);
      else {
        const held = S.trk.civ.still(c, c.x, c.y, w.time);
        if (held) {
          const end = b.route[b.route.length - 1], next = b.route[b.ri];
          report('civ-stuck', 'error', `${b.state}@${cellOf(c.x, c.y)}`, posOf(c.x, c.y), {
            kind: c.kind, state: b.state, held: r1(held), left: b.route.length - b.ri, toEnd: Math.round(Math.hypot(end.x - c.x, end.y - c.y)),
            toNext: next && Math.round(Math.hypot(next.x - c.x, next.y - c.y)), stuck: b.stuck, temper: b.temper, front: next ? inFront(w, c, Math.atan2(next.y - c.y, next.x - c.x)) : null,
          });
        }
      }
      const done = S.trk.civDone.hold(c, b.state === 'done', w.time);
      if (done) report('civ-stuck', 'error', `done-lingering@${cellOf(c.x, c.y)}`, posOf(c.x, c.y), { kind: c.kind, why: 'at the end of his way and still in the world', held: r1(done) });
    }
  }

  // the box round all the parts of a body on the floor
  const boundsOf = (c) => {
    const b = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
    for (const p of c.parts || [c]) {
      const q = p.body.bounds;
      b.min.x = Math.min(b.min.x, q.min.x); b.min.y = Math.min(b.min.y, q.min.y);
      b.max.x = Math.max(b.max.x, q.max.x); b.max.y = Math.max(b.max.y, q.max.y);
    }
    return b;
  };

  // a body still moving 5 s after death, or turned round on itself, with nothing to explain it (a blast, a car,
  // somebody or loose furniture shoving it, rounds flying)
  function corpseDrift(w) {
    const cars = w.props.filter((v) => v.isVehicle && !v.dead);
    // (and what a blast sends flying well beyond its own reach: its debris, a weapon on the floor: the tutorial's
    // gas bottle clears a whole corridor onto the men lying in it)
    const loose = [...w.props.filter((v) => !v.isVehicle && !v.dead && !v.body?.isStatic), ...(w.debris || []), ...(w.items || [])].filter((v) => v.body && !v.dead)
      .map((v) => ({ bounds: v.body.bounds, speed: Matter.Body.getSpeed(v.body) })).filter((v) => v.speed > 0.3)
      .concat(w.doors.filter((d) => d.body).map((d) => ({ bounds: d.body.bounds, press: true })));
    for (const c of w.corpses) {
      if (c.dead || !c.body) { S.trk.corpses.forget(c); continue; }
      // slammed on a table, a counter, a crate (folded over it, sat against it): he stays there, from the start
      if (c.against || c.dying?.kind === 'ledge' || c.dying?.kind === 'sit') c.__qaSlam = true;
      if (c.dying && !c.__qaSlam) continue; // a scripted end (crawl, spasm, curl...) moves by design
      const b = c.body, x = b.position.x, y = b.position.y;
      const pushed = w.chars.some((ch) => {
        // (one locked in a takedown or a finisher is not walking into it: the slam is what is checked)
        if (!ch.alive || ch.takedown || ch.execution || Math.hypot(ch.x - x, ch.y - y) > (ch.radius || 10) + 8) return false;
        const v = ch.vel || { x: 0, y: 0 };
        return (v.x * (x - ch.x) + v.y * (y - ch.y)) / (Math.hypot(x - ch.x, y - ch.y) || 1) > 0.3; // moving into it
      });
      const excused = pushed || blastNear(w, x, y) || w.time - S.shotT < 0.8 || w.player.execution?.corpse === c
        || cars.some((v) => Math.hypot(v.x - x, v.y - y) < 90) || (loose.length && K.shovedBy(boundsOf(c), loose));
      const r = S.trk.corpses.update(c, { x, y, a: b.angle, age: c.age ?? 0, excused, from: c.__qaSlam ? 0.3 : undefined }, w.time);
      if (r) report('corpse-drift', 'error', `${r.kind}${c.__qaSlam ? ' after a slam' : ''}`, posOf(x, y), { ...r, age: r1(c.age ?? 0), body: c.kind, against: c.against?.type || null, dying: c.dying?.kind || null });
    }
  }

  // the dead in the guards' sights
  function ghostTargets(w) {
    if (!w.player.alive) return;
    for (const e of w.enemies) {
      const t = e.target;
      if (!e.alive || !t || typeof t.alive !== 'boolean' || t.alive || !t.body || (e.state !== 'combat' && e.state !== 'hunt')) continue;
      report('ghost', 'error', `targeted ${whoOf(t)}`, posOf(e.x, e.y), { why: 'a guard fights a dead man', state: e.state, target: { who: whoOf(t), kind: t.kind } });
    }
  }

  // the characters drawn into a tiny canvas off to the side: their poses checked between two real frames
  function probePoses(w) {
    probeCtx ||= Object.assign(document.createElement('canvas'), { width: 2, height: 2 }).getContext('2d');
    const list = w.chars.filter((c) => c.alive && !c.hidden), n = Math.min(PROBE_CAP, list.length);
    wrapDraws(list);
    S.probing = true;
    try {
      for (let i = 0; i < n; i++) {
        const ch = list[(S.rr.pose + i) % list.length];
        probeCtx.setTransform(1, 0, 0, 1, -1e5, -1e5);
        try { ch.draw(probeCtx); } catch (e) { renderError(e, 'pose probe'); }
      }
    } finally { S.probing = false; }
    S.rr.pose += n;
  }

  function deepCheck(w, p, driving = false) {
    const t0 = performance.now();
    cameraCheck(w, p);
    ghostTargets(w);
    // (at the wheel what it throws aside lands against the building fronts, and nobody walks to an item)
    if (!driving) propInWall(w);
    vehicleShove(w);
    doorCheck(w);
    civStuck(w);
    if (!driving && S.steps % 60 === 0) unreachableItems(w);
    S.cost.checks += performance.now() - t0;
  }

  // ---------------------------------------------------------------- frame / step
  // before a step (fast) or a frame (realtime): the state machine and the inputs
  function tick(dt) {
    const g = game, inp = g.input, st = g.state;
    // the menus mashed (chaos menuMash): the pause menu, then the title, then the opening
    if (S.mash && st !== 'play' && mashMenus(g, inp, st)) return;
    if (S.mash && st === 'play' && S.mash.phase !== 'pause') S.mash = null;
    // the title is a menu: the level under test is started straight away (a click when the game has no startLevel)
    if (st === 'title') {
      if (g.startLevel) { g.tutorialAt = null; g.startLevel(opts.level); act('title: start'); }
      else { inp.mouse.clicked[0] = true; inp.anyPressed = true; act('title: click'); }
      return;
    }
    // the hit list between two levels (a chaos run's keys at the results can lead there): on at once
    if (st === 'hitlist') { if (g.stateT > 1.2) { press(inp, 'Enter'); act('hit list: on'); } return; }
    if (!g.world) return;
    // out of a campaign level the game goes on to the next one: back to the one under test, from its beginning
    S.under ??= g.levelId;
    if (g.levelId !== S.under && g.startLevel) { g.tutorialAt = null; g.startLevel(S.under); act(`${S.under}: again`); return; }
    if (g.world !== S.world) onNewWorld(g.world);
    const w = g.world, p = w.player;
    if (st === 'intro') { inp.keys.clear(); if (g.stateT > 0.35) { inp.anyPressed = true; act('intro: key'); } return; }
    // paused: back at once, or after the frames a chaos plan holds it (pauseMash)
    if (st === 'pause') { if (S.pauseHold > 0) S.pauseHold--; else press(inp, 'Escape'); return; }
    if (st === 'dead') {
      inp.keys.clear(); inp.mouse.down[0] = false;
      if (opts.chaos && g.stateT < 0.45) mashKeys(inp, rnd, ['Space', 'KeyE', 'Mouse2', 'Escape', 'KeyW']);
      if (g.stateT > 0.9) { press(inp, 'KeyR'); act('dead: restart'); }
      return;
    }
    if (st === 'results') {
      inp.keys.clear(); inp.mouse.down[0] = false;
      if (!B.resultsSeen) {
        B.resultsSeen = true;
        const r = g.results || {};
        S.stats.clears.push({ session: S.session, score: r.total, grade: r.grade, time: r1(w.time), kills: S.sess.kills,
          lines: (r.lines || []).map((l) => `${l.key} ${l.points} (${l.detail})`).join(', ') });
        cover('exit');
        S.sess.exited = true;
        act(`results ${r.grade} ${r.total}`);
      }
      if (opts.chaos && g.stateT < 1.1) mashKeys(inp, rnd); // a chaos run: keys at the results screen first
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
    // a level with no way out (the lab): a minute of roaming once it is cleared, then another go
    if (w.cleared && !w.level.exit && S.clock - B.clearT > 60) {
      S.stats.restartsAfterClear = (S.stats.restartsAfterClear || 0) + 1;
      act('cleared, no exit: restart');
      press(inp, 'Backspace');
      return;
    }
    play(w, p, inp);
  }

  // a state that is not play while the menus are mashed: true when handled
  function mashMenus(g, inp, st) {
    const m = S.mash;
    if (S.clock > m.hard) { S.mash = null; return false; } // never stuck in it
    if (st === 'pause') { if (S.clock < m.until) mashKeys(inp, m.rnd); else press(inp, 'Escape'); return true; }
    if (st === 'title') {
      if (m.phase === 'title' && S.clock < m.until) { mashKeys(inp, m.rnd); return true; }
      m.phase = 'opening'; m.until = S.clock + 2.5;
      g.tutorialAt = null;
      g.startLevel(opts.level, { state: 'cinematic' });
      act('menus: the opening');
      return true;
    }
    if (st === 'cinematic' || st === 'intro') {
      if (S.clock < m.until) { mashKeys(inp, m.rnd); return true; }
      S.mash = null;
    }
    return false;
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
    const driving = !!w.drive?.on; // (at the wheel he is carried in his seat: the detectors made for walking stay off)
    if (!driving) checkWall(p, 'player');
    else stalled(w, w.drive);
    if (S.steps % 6 === 0) {
      for (const e of w.enemies) checkWall(e, 'guard');
      for (const c of w.civilians) checkWall(c, 'civilian');
      // a man not quite dead drags himself along the floor: never into a wall
      for (const c of w.corpses) if (c.dying?.kind === 'crawl') checkWall(c, 'crawler', !c.dead);
    }

    if (S.camStart && g.state === 'play') cameraCheck(w, p);
    if (S.steps % 6 === 0) stuckAnim(w, p);
    // a slam turns a body round in a fraction of a second
    if (S.steps % 10 === 5) { const t0 = performance.now(); corpseDrift(w); S.cost.checks += performance.now() - t0; }
    if (S.steps % 30 === 15) { const t0 = performance.now(); probePoses(w); S.cost.probes += performance.now() - t0; }
    if (S.steps % 30 === 0) {
      deepCheck(w, p, driving);
      nanCheck(w);
      outOfMap(w);
      guardStuck(w);
      aiCheck(w);
      lastingCheck(w);
      powerCheck(w);
      if (opts.mode === 'realtime') audioCheck();
      else if (S.steps % 600 === 0) audioCheck(true);
    }
    if (!driving) softlock(w, p);

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
        // no way there on foot (the player up a ladder, behind a counter): he waits as near as he gets, by design
        if (!e.path && !w.pathForGuard(e.x, e.y, tr.x, tr.y)) continue;
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

  // At the wheel: the car crawling under CHASE_STALL.under of its cruise speed for CHASE_STALL.after s while the drive
  // is on, he is alive and the road not over (a crash stops it dead: that is a death, not a stall): what touches it
  // then is in the finding (the sig: what holds it, the first solid contact)
  const CHASE_STALL = { under: 0.25, after: 2 };
  function stalled(w, d) {
    // (2A's opening: the car stands on purpose while he finishes his cigarette, Drive `standing`)
    const live = !d.dead && !d.standing && !w.exited && game.state === 'play' && w.player.alive;
    if (!live || d.v >= CHASE_STALL.under * d.cruise) { B.stall = null; return; }
    const b = d.van.body;
    if (!B.stall) { B.stall = { t: w.time, told: false, then: touchingOf(w, b) }; return; }
    if (B.stall.told) S.stats.drive.stallMost = Math.max(S.stats.drive.stallMost, r1(w.time - B.stall.t));
    if (B.stall.told || w.time - B.stall.t < CHASE_STALL.after) return;
    B.stall.told = true;
    S.stats.drive.stalls++;
    const then = B.stall.then, held = then.find((c) => !c.sensor);
    report('stalled', 'error', `against ${held?.what || 'nothing'}`, posOf(d.van.x, d.van.y), {
      kmh: d.kmh, cruise: Math.round(d.cruise * D.kmh), held: r1(w.time - B.stall.t), angle: Math.round(b.angle * 1000) / 1000,
      bounds: [Math.round(b.bounds.min.x), Math.round(b.bounds.min.y), Math.round(b.bounds.max.x), Math.round(b.bounds.max.y)],
      then, now: touchingOf(w, b),
    });
  }

  // what touches body b now (the physics' active pairs): what, a sensor or not, how deep, the normal, where
  function touchingOf(w, b) {
    const out = [];
    for (const pr of w.physics.activePairs()) {
      const o = pr.bodyA === b ? pr.bodyB : pr.bodyB === b ? pr.bodyA : null;
      if (!o) continue;
      const n = pr.collision.normal;
      out.push({ what: o.entity?.type || o.label, sensor: !!pr.isSensor, depth: r1(pr.collision.depth), normal: [r1(n.x), r1(n.y)],
        at: [Math.round(o.position.x), Math.round(o.position.y)] });
    }
    return out;
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
      // (a locked door is kicked open, the passage taken: neither is in the grid)
      const way = (a, b) => !!findPath(w.map, a.x, a.y, b.x, b.y, 20000), shut = w.doors.filter((d) => d.locked).flatMap((d) => d.cells);
      const out = K.withOpen(w.map.blocked, shut, () => K.exitReachable(way, p, { x: ex.x * TILE, y: ex.y * TILE }, w.passage?.hatches));
      if (!out) report('softlock', 'error', 'no-path-to-exit', posOf(p.x, p.y), { why: 'level cleared but no grid path from the player to the exit', exit: ex });
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
    opts = { seed: 1, god: false, mode: 'fast', level: 'level1', sessionCap: 300, chaos: 0, ...o };
    rnd = prng(opts.seed * 7919 + 13);
    game = window.game;
    if (!game) throw new Error('window.game missing');
    ({ findPath } = await import('/src/engine/nav/Pathfinding.js'));
    ({ killStyle } = await import('/src/game/systems/Scoring.js'));
    try { Audio = (await import('/src/audio/Audio.js')).default; } catch { Audio = null; }
    // the data the checks read; an old checkout (--root) may lack some: the fallbacks in D stay
    const load = async (path) => { try { return await import(path); } catch { return {}; } };
    const [fin, td, feel, cfg, cam, foley, chase] = await Promise.all(['/src/game/data/finishers.js', '/src/game/systems/Takedown.js',
      '/src/game/data/feel.js', '/src/game/Config.js', '/src/engine/Camera.js', '/src/audio/Foley.js', '/src/game/data/chase.js'].map(load));
    if (fin.lockTime) D.lockTime = fin.lockTime;
    if (td.lockedFor) D.lockedFor = td.lockedFor;
    if (feel.TRAVERSE?.kick) D.TRAVERSE = feel.TRAVERSE;
    if (feel.GESTURE?.trunk) D.GESTURE = feel.GESTURE;
    if (cfg.PLAYER?.roll?.dur) D.rollDur = cfg.PLAYER.roll.dur;
    if (cam.VIEW) D.VIEW = cam.VIEW;
    if (chase.CHASE?.kmh) D.kmh = chase.CHASE.kmh;
    try {
      // what the mixer can play: Audio.js's tables read from its source, Foley.js's recipes, the mixer's own methods
      D.sounds = K.soundNames(await (await fetch('/src/audio/Audio.js')).text());
      for (const k of Object.keys(foley.RECIPES || {})) D.sounds.add(k);
      for (const o of [Audio, Audio && Object.getPrototypeOf(Audio)]) for (const k of o ? Object.getOwnPropertyNames(o) : []) if (k[0] === '_') D.sounds.add(k.slice(1));
      if (D.sounds.size < 20) D.sounds = null; // the source did not parse: no check rather than a flood
    } catch { D.sounds = null; }
    const names = planNames();
    S.sched = new K.Scheduler({ normal: names.normal, chaos: names.chaos, share: opts.chaos || 0, rnd });
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
        const b0 = performance.now();
        tick(dt);
        const t0 = performance.now();
        update.call(this, dt);
        const t1 = performance.now();
        S.clock += dt;
        after();
        const t2 = performance.now();
        S.cost.bot += t0 - b0 + t2 - t1; S.cost.update += t1 - t0; S.cost.n++;
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
      const b0 = performance.now();
      tick(DT);
      const before = g.world, t0 = performance.now();
      S.cost.bot += t0 - b0;
      try { g.update(DT); } catch (e) {
        errs++;
        report('exception', 'error', `update: ${firstLine(e?.message || e)}`, g.world ? posOf(g.world.player.x, g.world.player.y) : null,
          { where: 'game.update', state: g.state, message: String(e?.message || e), stack: String(e?.stack || '').split('\n').slice(0, 8).join('\n') });
        // a world that keeps throwing is no use: start over
        if (S.findings.get(`exception|update: ${firstLine(e?.message || e)}`).count % 50 === 0) { S.stats.forcedRestarts++; act('forced restart'); try { g.restart(); } catch { /* reported */ } }
      }
      const ms = performance.now() - t0;
      if (g.world === before && g.state === 'play') {
        const T = S.timing;
        T.n++; T.ms += ms;
        if (ms > T.worst) { T.worst = ms; T.worstAt = { t: r1(S.clock), session: S.session }; }
        if (ms > 50) report('slow', 'warn', 'worst-step', g.world ? posOf(g.world.player.x, g.world.player.y) : null, { ms: r1(ms), physicsMs: r1(g.world?.physics.stepMs || 0), why: 'one game.update step over 50 ms' });
      }
      S.clock += DT;
      const a0 = performance.now();
      after();
      S.cost.bot += performance.now() - a0;
      S.cost.update += ms;
      S.cost.n++;
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

  // the deeper checks once, now, on whatever state the game is in (a scenario stepping the game itself:
  // tools/shot.mjs, a console): the findings so far, kind and signature
  qa.check = () => {
    const w = game.world;
    if (!w) return [];
    if (w !== S.world) onNewWorld(w);
    stuckAnim(w, w.player);
    corpseDrift(w);
    probePoses(w);
    deepCheck(w, w.player);
    return [...S.findings.values()].map((f) => `${f.kind} ${f.sig}`);
  };

  // what the bot is up to (in the final report, and handy from the console)
  qa.debug = () => {
    const w = game.world, p = w?.player;
    return {
      state: game.state, plan: B.plan && `${B.plan.name} ${stepName(B.step)}`, style: B.style,
      mischief: B.mischief && { name: B.mischief.name, own: B.mischief.own, phase: B.mischief.M.phase ?? null, over: !!B.mischief.M.over, left: r1(B.mischief.until - S.clock) },
      goal: B.goal && { type: B.goal.type, at: cellOf(B.goal.x, B.goal.y) }, path: B.path ? `${B.idx}/${B.path.length}` : null,
      target: B.target && { kind: B.target.kind, at: cellOf(B.target.x, B.target.y), aware: B.target.aware, knocked: B.target.knocked > 0 },
      player: p && { at: posOf(p.x, p.y), alive: p.alive, weapon: p.weapon?.type || 'fists', sit: p.sit, ctx: p.contextAction, execution: !!p.execution, takedown: !!p.takedown, vaulting: !!p.vaulting },
      guardsLeft: w?.enemiesLeft, lastActions: lastActions(),
    };
  };

  qa.final = () => {
    const st = S.stats, c = S.cost, per = (v) => +(v / Math.max(1, c.n)).toFixed(3);
    // what the bot costs next to the game: ms per step (its brain and all its checks; the deeper checks, the pose
    // probes and the draw wraps within it) and its share of the time
    st.overhead = { steps: c.n, updateMs: per(c.update), botMs: per(c.bot), checksMs: per(c.checks), probesMs: per(c.probes), wrapsMs: per(c.wraps),
      share: +((100 * (c.bot + c.wraps)) / Math.max(1e-6, c.update + c.bot + c.wraps)).toFixed(1) };
    return {
      bot: qa.debug(),
      stats: st, features: FEATURES, perfSamples: S.perfSamples.slice(-400), timing: S.timing,
      sessions: S.sessions.map(({ samples, nextSample, ...s }) => ({ ...s, samples: samples.length })),
      findings: [...S.findings.values()],
    };
  };
})();
