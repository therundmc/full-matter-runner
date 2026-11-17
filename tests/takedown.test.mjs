import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { behind, unspotted, newTakedown, advance, lockedFor } = await load('game/systems/Takedown.js');
const { TAKEDOWN, BODY_SCALE } = await load('game/Config.js');
const { TAKEDOWNS, TAKEDOWN_VARIANTS, takedownFor, takedownChoice, shotCause } = await load('game/data/finishers.js');
const { KNEELS, KNEEL } = await load('game/data/wounds.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { default: Player } = await load('game/entities/Player.js');
const { throatPlan, throatPose } = await load('game/fx/DyingPose.js');

const guard = (o = {}) => ({ x: 20, y: 0, angle: 0, alive: true, knocked: 0, vaulting: null, held: null, ...o });
const me = (o = {}) => ({ x: 0, y: 0, angle: 0, ...o });

test('takedown: only right behind a standing guard, facing his back', () => {
  assert.ok(behind(me(), guard()));
  assert.ok(behind(me({ angle: 0.6 }), guard({ angle: -0.7 })), 'a little off axis still counts');
  assert.ok(!behind(me(), guard({ angle: Math.PI })), 'he is facing us');
  assert.ok(!behind(me(), guard({ angle: Math.PI / 2 })), 'we are at his side');
  assert.ok(!behind(me({ angle: Math.PI }), guard()), 'we have our back to him');
  assert.ok(!behind(me(), guard({ x: TAKEDOWN.reach + 1 })), 'out of reach');
  assert.ok(behind(me(), guard({ x: 32 })), 'the widened reach');
  assert.ok(behind(me(), guard({ angle: 1.2 })), 'the widened rear arc');
});

test('takedown: not on a guard who is down, vaulting or already held', () => {
  assert.ok(!behind(me(), guard({ alive: false })));
  assert.ok(!behind(me(), guard({ knocked: 1 })));
  assert.ok(!behind(me(), guard({ vaulting: {} })));
  assert.ok(!behind(me(), guard({ held: {} })));
});

const of = (type, mag) => takedownFor(WEAPONS[type || 'fists'], type ? { type, mag: mag ?? WEAPONS[type].mag } : null);

test('takedown: the sequence goes by what is in the hand (swing, hold, kind), and an empty gun is struck with', () => {
  assert.equal(of(null), TAKEDOWNS.neck);
  assert.equal(of('knife'), TAKEDOWNS.blade);
  assert.equal(of('cue_half'), TAKEDOWNS.blade, 'a broken cue is a blade');
  assert.equal(of('bat'), TAKEDOWNS.club);
  assert.equal(of('tire_iron'), TAKEDOWNS.club);
  assert.equal(of('cue'), TAKEDOWNS.choke);
  for (const g of ['pistol', 'uzi', 'uzi_silenced']) {
    assert.equal(of(g), TAKEDOWNS.pistol, g);
    assert.equal(of(g, 1), TAKEDOWNS.pistol, `${g}: one round is enough`);
    assert.equal(of(g, 0), TAKEDOWNS.pistolDry, `${g}: no round, the butt`);
  }
  for (const g of ['rifle', 'shotgun', 'sniper']) {
    assert.equal(of(g), TAKEDOWNS.long, g);
    assert.equal(of(g, 0), TAKEDOWNS.longDry, `${g}: no round, two butt strokes`);
  }
  assert.equal(of('bazooka'), TAKEDOWNS.longDry, 'never a rocket at point blank');
  // every weapon has one, with its hint
  for (const type of Object.keys(WEAPONS)) assert.ok(of(type === 'fists' ? null : type)?.action, type);
});

test('takedown: every sequence is short, ends on a kill, and goes down a known way', () => {
  const WHAT = ['seize', 'struggle', 'twist', 'draw', 'cut', 'windup', 'nape', 'muzzle', 'shot', 'butt', 'smash', 'dunk', 'limp', 'knee', 'stab', 'wrench',
    'kneeHit', 'kneeShot', 'backShot', 'headbutt', 'throat', 'sweep', 'temple'];
  const KILLS = ['twist', 'cut', 'nape', 'shot', 'butt', 'smash', 'dunk', 'limp', 'knee', 'stab', 'wrench', 'sweep', 'temple'];
  const actions = new Set();
  for (const [name, f] of Object.entries(TAKEDOWNS)) {
    const n = f.beats.length, lock = lockedFor(f);
    // a head driven into something takes longer (two blows, the toilet a struggle between them)
    assert.ok(lock >= 0.8 && lock <= (f.context ? 1.8 : 1.4), `${name}: ${lock.toFixed(2)} s`);
    for (const [wait, what] of f.beats) assert.ok(wait > 0 && WHAT.includes(what), `${name}: ${what}`);
    assert.ok(KILLS.includes(f.beats[n - 1][1]), `${name} ends on a kill`);
    assert.ok(f.front ? f.dying === undefined : KNEELS[f.dying] || f.dying === 'wall', `${name}: ${f.dying}`);
    assert.ok(['snap', 'slash', 'melee', 'shot'].includes(f.cause), name);
    assert.ok(f.drop === undefined || f.drop < n - 1, `${name}: he drops before the kill`);
    assert.ok(!f.grip || f.beats.some((b) => b[1] === 'seize'), `${name}: a grip has its seize`);
    assert.ok(f.gap > 0 && f.gap <= TAKEDOWN.reach && f.after > 0 && f.label && f.action, name);
    assert.notEqual(f.action, 'EXECUTE', 'EXECUTE is the hint for a man down');
    actions.add(f.action);
  }
  assert.equal(actions.size, Object.keys(TAKEDOWNS).length, 'one hint per sequence');
  // what the guards hear: a throat cut is silent, a blow on the head is heard, a round is the gun's own noise
  assert.equal(TAKEDOWNS.blade.noise, 0);
  assert.ok(TAKEDOWNS.neck.noise < TAKEDOWNS.club.noise && TAKEDOWNS.club.noise < WEAPONS.pistol.noise);
  assert.equal(shotCause(WEAPONS.pistol), 'bullet');
  assert.equal(shotCause(WEAPONS.shotgun), 'blast');
  assert.equal(shotCause(WEAPONS.sniper), 'heavy');
});

test('takedown: the beats land at the end of their waits, the last one kills, then `after` and it is over', () => {
  for (const [name, f] of Object.entries(TAKEDOWNS)) {
    const td = newTakedown(f), dt = 1 / 240, times = [];
    let t = 0;
    while (!td.over && t < 3) {
      t += dt;
      for (const what of advance(td, dt)) times.push([t, what, td.done]);
    }
    let at = 0;
    f.beats.forEach(([wait, what], i) => {
      at += wait;
      assert.ok(Math.abs(times[i][0] - at) < 2 * dt, `${name}: ${what} at ${times[i][0].toFixed(3)} (${at.toFixed(3)})`);
      assert.equal(times[i][1], what);
      assert.equal(times[i][2], i === f.beats.length - 1, `${name}: only the last kills`);
    });
    assert.equal(times.length, f.beats.length);
    assert.ok(Math.abs(t - lockedFor(f)) < 2 * dt, `${name}: over at ${t.toFixed(3)}`);
    // the beat that drops him to his knees is when he goes down
    if (f.drop !== undefined) assert.ok(Math.abs(td.downAt - f.beats.slice(0, f.drop + 1).reduce((s, b) => s + b[0], 0)) < 2 * dt, name);
    else assert.equal(td.downAt, -1, name);
  }
  // a long step lands everything it covers, in order
  const td = newTakedown(TAKEDOWNS.blade);
  assert.deepEqual(advance(td, 0.6), ['seize', 'draw', 'cut']);
  assert.ok(td.done && !td.over);
  assert.deepEqual(advance(td, 1), []);
  assert.ok(td.over);
  assert.equal(newTakedown(TAKEDOWNS.club, true).downAt, 0, 'a man on his knees already');
});

test('takedown: struck down from behind he kneels, arms hanging, then lies on his face, no spurt', () => {
  const G = { arms: [{ x: -6, y: -5, len: 8 }, { x: 6, y: -5, len: 8 }], legs: [{ x: -3, y: 6, len: 10 }, { x: 3, y: 6, len: 10 }], half: 7 };
  for (const T of [KNEELS.kneel, KNEELS.slump]) {
    const plan = throatPlan(5, T);
    assert.equal(plan.beats.length, 0);
    const kneel = throatPose(plan, T.kneel, G, T), down = throatPose(plan, T.kneel + T.hold + T.pitch + 0.01, G, T);
    assert.ok(kneel.arch < 0.6 && !kneel.down && down.down && down.arch > 0.95);
    for (const a of kneel.arms) assert.ok(a.a > 1 && a.a < 2.2, 'the arms hang along him');
    for (let u = 0; u < plan.dur; u += 0.05) assert.equal(throatPose(plan, u, G, T).jet, 0);
  }
  assert.ok(KNEEL.kneel + KNEEL.hold + KNEEL.pitch < KNEEL.dur[0]);
});

// ---- the move itself, played by the player on a world that only knows what it needs ----
const noop = () => {};
const sink = new Proxy({}, { get: () => noop });
function scene(type, mag) {
  const heard = [], sounds = [];
  const w = {
    particles: sink, decals: sink, camera: sink, events: sink, time: 0, slowmo: noop, hitstop: noop, shake: noop, light: noop,
    sound: (name) => sounds.push(name), noise: (x, y, r, src, kind) => heard.push([r, kind]),
    map: { solidAt: () => false, raycast: () => null, isWallChar: () => false, at: () => '.' }, lineOfSight: () => true,
    enemies: [], props: [], items: [], corpses: [],
  };
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, recoil: 0,
    body: Matter.Bodies.circle(-22, 0, 10) });
  p.setWeapon(type, mag);
  p.muzzleNote = { def: p.def, x: 14, y: 2, da: 0 };
  const g = {
    alive: true, x: 0, y: 0, angle: 0, voice: 1, held: null, knocked: 0, yielded: false, body: Matter.Bodies.circle(0, 0, 10),
    kill(a, cause, killer, by, how) { this.alive = false; Object.assign(this, { a, cause, killer, by, how, killedAt: w.time }); },
  };
  return { w, p, g, heard, sounds };
}
function play(s, until = 3) {
  const { w, p, g } = s, dt = 1 / 60, start = w.time;
  p.startTakedown(g, { f: s.f ?? takedownFor(p.def, p.weapon), front: !!s.front }); // the weapon's own, unless the scene names a variant
  const track = { held: [], gap: [] };
  while (p.takedown && w.time - start < until) {
    w.time += dt;
    p.updateTakedown(dt);
    track.held.push(g.held === p || !p.takedown);
    track.gap.push(Math.hypot(g.x - p.x, g.y - p.y));
  }
  return track;
}

test('takedown: the player is locked in it until the end, the man held, then both let go', () => {
  for (const [type, mag] of [[null], ['knife'], ['bat'], ['cue'], ['pistol'], ['pistol', 0], ['rifle'], ['shotgun', 0]]) {
    const s = scene(type, mag), f = of(type, mag);
    assert.equal(s.p.contextAction, undefined);
    const tr = play(s);
    assert.ok(!s.p.takedown, `${type}: over`);
    assert.ok(tr.held.every(Boolean), `${type}: held throughout`);
    assert.ok(Math.abs(s.w.time - lockedFor(f)) < 0.05, `${type}: ${s.w.time.toFixed(2)} s`);
    assert.ok(Math.abs(s.g.killedAt - (lockedFor(f) - f.after)) < 0.05, `${type}: killed on the last beat`);
    // set at the sequence's gap behind his back (a little to one side), looking at him
    const lat = f.lat ?? 0;
    assert.ok(Math.abs(tr.gap[Math.round(0.3 * 60)] - Math.hypot(f.gap, lat)) < 1.5, `${type}: ${tr.gap[18].toFixed(1)} px`);
    assert.ok(Math.abs(s.p.angle - Math.atan2(-lat, f.gap)) < 0.05, `${type}: facing ${s.p.angle.toFixed(2)}`);
    assert.equal(s.p.body.collisionFilter.group, 0, 'solid again');
    assert.equal(s.g.how.label, f.label);
    assert.equal(s.g.how.from, 'behind');
    assert.equal(s.g.how.dying, f.dying);
  }
});

test('takedown: what each weapon does to him, the rounds it takes, what the guards hear', () => {
  let s = scene('knife');
  play(s);
  assert.equal(s.g.cause, 'slash');
  assert.equal(s.g.how.dying, 'throat');
  assert.deepEqual(s.heard, [], 'a throat cut is silent');

  s = scene(null);
  play(s);
  assert.equal(s.g.cause, 'snap');
  assert.equal(s.g.by, undefined, 'a broken neck leaves no blood');
  assert.ok(s.heard.every(([r]) => r <= 40));

  s = scene('bat');
  play(s);
  assert.deepEqual([s.g.cause, s.g.by.wound, s.g.how.kneeling], ['melee', 'crush', false]);
  assert.ok(s.heard.length && s.heard.every(([r, k]) => r === TAKEDOWNS.club.noise && k !== 'gunshot'));

  s = scene('pistol', 3);
  play(s);
  assert.equal(s.p.weapon.mag, 2, 'one round');
  assert.equal(s.g.cause, 'bullet');
  assert.ok(s.heard.some(([r, k]) => r === WEAPONS.pistol.noise && k === 'gunshot'));
  assert.ok(s.sounds.includes(WEAPONS.pistol.sound));

  s = scene('pistol', 1);
  play(s);
  assert.ok(s.p.weapon.mag === 0 && s.g.how.last, 'the last round');

  s = scene('uzi_silenced');
  play(s);
  assert.ok(!s.heard.some(([, k]) => k === 'gunshot'), 'a silenced gun is not heard');

  s = scene('pistol', 0);
  play(s);
  assert.deepEqual([s.p.weapon.mag, s.g.cause, s.g.by.wound], [0, 'melee', 'crush']);
  assert.ok(!s.sounds.includes(WEAPONS.pistol.sound), 'no shot');

  s = scene('rifle', 5);
  play(s);
  assert.deepEqual([s.p.weapon.mag, s.g.cause, s.g.how.kneeling], [4, 'bullet', true], 'shot on his knees');

  s = scene('shotgun', 0);
  play(s);
  assert.deepEqual([s.p.weapon.mag, s.g.cause, s.g.how.kneeling], [0, 'melee', true], 'two butt strokes');

  s = scene('sniper', 2);
  play(s);
  assert.equal(s.g.cause, 'heavy');
});

test('takedown: somebody else kills him first: it stops there and lets go', () => {
  const s = scene('knife');
  s.p.startTakedown(s.g, { f: takedownFor(s.p.def, s.p.weapon) });
  s.w.time += 0.1;
  s.p.updateTakedown(0.1);
  s.g.alive = false;
  s.p.updateTakedown(1 / 60);
  assert.ok(!s.p.takedown && s.g.held === null && s.p.body.collisionFilter.group === 0);
  assert.equal(s.g.cause, undefined, 'not killed twice');
});

test('takedown: pose distances are taken in pose px (the body is drawn BODY_SCALE larger)', () => {
  const s = scene('knife');
  s.p.startTakedown(s.g, { f: takedownFor(s.p.def, s.p.weapon) });
  assert.ok(Math.abs(s.p.takedown.d - 22 / BODY_SCALE) < 1e-6);
});

// ---- spotted: no takedown; unspotted: several of them per weapon ----
test('takedown: none on a guard who is after us, none while the squad has us located; open again once they lost us', () => {
  const calm = { aware: 0 }, wary = { aware: 1 }, hunting = { aware: 2 };
  assert.ok(unspotted(calm, 'normal') && unspotted(wary, 'caution'));
  assert.ok(!unspotted(hunting, 'normal'), 'he is after us');
  assert.ok(!unspotted(calm, 'alert') && !unspotted(wary, 'alert'), 'they know where we are');
  assert.ok(unspotted(calm, 'evasion') && unspotted(calm, 'caution'), 'they lost us');
  assert.ok(unspotted({ aware: 2, yielded: true }, 'normal'), 'a man who gave up');
  assert.deepEqual(TAKEDOWN.spotted, ['alert']);
  assert.ok(unspotted(calm, 'alert', { spotted: [] }), 'data-driven');
});

test('takedown: spotted, the player has no guard to take from behind and no hint; the click is an attack', () => {
  const run = (phase, aware) => {
    const s = scene('knife');
    Object.assign(s.g, { aware, x: 0, y: 0, isEnemy: true });
    s.w.enemies = [s.g];
    s.w.director = { phase };
    Object.assign(s.w, { uses: { near: () => null }, windows: [], fences: [], ladders: [], doors: [] });
    Object.assign(s.p, { nearItem: null, slideCd: 0, winded: 0, stamina: 1, safe: { x: -22, y: 0 }, sit: 0, vel: { x: 0, y: 0 }, cooldown: 0, swing: 0,
      baseUpdate() {}, unstick() {}, updateVault: () => false, steer() {}, attacked: 0, attack() { this.attacked++; return false; } });
    const input = { down: () => false, hit: () => false, mouseDown: (b) => b === 0, mouseHit: (b) => b === 0, move: () => null };
    s.p.update(1 / 60, input, { x: 0, y: 0 });
    return s.p;
  };
  let p = run('normal', 0);
  assert.ok(p.takedown && !p.attacked, 'unspotted: the takedown');
  p = run('alert', 0);
  assert.ok(!p.takedown && p.nearTakedown === null && p.contextAction === null && p.attacked === 1, 'the squad has him located');
  p = run('normal', 2);
  assert.ok(!p.takedown && p.nearTakedown === null && p.attacked === 1, 'this guard is after him');
  p = run('evasion', 0);
  assert.ok(p.takedown, 'they lost him: open again');
});

test('takedown: several variants per weapon, drawn without repeating the last, by what the gun still holds', () => {
  assert.ok(TAKEDOWN_VARIANTS.neck.length >= 3 && TAKEDOWN_VARIANTS.blade.length >= 3 && TAKEDOWN_VARIANTS.pistol.length >= 3);
  assert.ok(TAKEDOWN_VARIANTS.club.length >= 2 && TAKEDOWN_VARIANTS.choke.length >= 2);
  for (const [own, names] of Object.entries(TAKEDOWN_VARIANTS)) {
    assert.equal(names[0], own, 'the first is the weapon\'s own');
    for (const n of names) assert.ok(TAKEDOWNS[n], n);
  }
  const pick = (type, mag, last, r) => takedownChoice({ d: WEAPONS[type || 'fists'], weapon: type ? { type, mag: mag ?? WEAPONS[type].mag } : null, last, rnd: () => r });
  for (const [type, own] of [[null, 'neck'], ['knife', 'blade'], ['bat', 'club'], ['cue', 'choke'], ['pistol', 'pistol']]) {
    const seen = new Set();
    let last = null;
    for (let i = 0; i < 60; i++) {
      const f = pick(type, undefined, last, (i * 0.377) % 1);
      assert.notEqual(f, last, `${type}: never twice in a row`);
      assert.ok(TAKEDOWN_VARIANTS[own].some((n) => TAKEDOWNS[n] === f));
      seen.add(f);
      last = f;
    }
    assert.equal(seen.size, TAKEDOWN_VARIANTS[own].length, `${type}: all of them come up`);
  }
  // rounds: three for the knees and the head, two for the double tap
  for (let i = 0; i < 20; i++) {
    assert.equal(pick('pistol', 1, null, i / 20), TAKEDOWNS.pistol, 'one round: the nape shot');
    assert.notEqual(pick('pistol', 2, null, i / 20), TAKEDOWNS.kneecap);
  }
  assert.equal(pick('pistol', 0, null, 0.5), TAKEDOWNS.pistolDry);
  assert.equal(pick('rifle', 5, TAKEDOWNS.long, 0.5), TAKEDOWNS.long, 'a single one comes again');
  // a move the place gives wins over the weapon's, with a hand free for it
  assert.equal(takedownChoice({ d: WEAPONS.knife, weapon: { type: 'knife' }, spot: { kind: 'wall' } }), TAKEDOWNS.wall);
  assert.equal(takedownChoice({ d: WEAPONS.knife, weapon: { type: 'knife' }, spot: { kind: 'wall' }, front: true }), TAKEDOWNS.wall);
  const busy = takedownChoice({ d: WEAPONS.bat, weapon: { type: 'bat' }, spot: { kind: 'wall' } });
  assert.ok(TAKEDOWN_VARIANTS.club.some((n) => TAKEDOWNS[n] === busy), 'both hands busy');
});

test('takedown: every variant plays to its kill, with its rounds, its wounds and the way he goes down', () => {
  const VAR = [[null, 'sleeper'], [null, 'rabbit'], ['knife', 'kidney'], ['knife', 'spike'], ['bat', 'hobble'], ['cue', 'kneeChoke'], ['pistol', 'kneecap'],
    ['pistol', 'double']];
  for (const [type, name] of VAR) {
    const s = scene(type), f = TAKEDOWNS[name];
    s.f = f;
    const tr = play(s);
    assert.ok(!s.p.takedown && tr.held.every(Boolean), `${name}: over, held throughout`);
    assert.ok(Math.abs(s.w.time - lockedFor(f)) < 0.05, `${name}: ${s.w.time.toFixed(2)} s`);
    assert.ok(Math.abs(s.g.killedAt - (lockedFor(f) - f.after)) < 0.05, `${name}: killed on the last beat`);
    assert.deepEqual([s.g.how.label, s.g.how.dying, s.g.how.from], [f.label, f.dying, 'behind'], name);
    assert.equal(s.g.how.kneeling, f.drop !== undefined, `${name}: on his knees when he dies`);
  }
  let s = scene('pistol', 7);
  s.f = TAKEDOWNS.kneecap;
  play(s);
  assert.equal(s.p.weapon.mag, 4, 'two knees and the head');
  assert.equal(s.sounds.filter((n) => n === 'kneeShot').length, 2);
  assert.equal(s.g.cause, 'bullet');
  s = scene('pistol', 7);
  s.f = TAKEDOWNS.double;
  play(s);
  assert.equal(s.p.weapon.mag, 5, 'one in the back, one in the head');
  s = scene(null);
  s.f = TAKEDOWNS.sleeper;
  play(s);
  assert.deepEqual([s.g.cause, s.g.how.limp, s.g.by], ['snap', true, undefined], 'choked out: no blood, no crack');
  s = scene('knife');
  s.f = TAKEDOWNS.spike;
  play(s);
  assert.deepEqual([s.g.cause, s.g.by.wound, s.g.how.dying], ['slash', 'throat', 'throat']);
  s = scene('bat');
  s.f = TAKEDOWNS.hobble;
  play(s);
  assert.ok(s.sounds.includes('boneCrack') && s.heard.length >= 2, 'the knee, then the head: both heard');
});

test('takedown: the hint names the variant he is about to do, and the next one is another', () => {
  const s = scene('knife');
  const f = s.p.pickTakedown();
  assert.equal(s.p.pickTakedown(), f, 'kept until it is done');
  play({ ...s, f });
  assert.equal(s.p.lastTakedown, f);
  s.p.lastTakedown = f; s.p.nextTakedown = null;
  for (let i = 0; i < 10; i++) { s.p.nextTakedown = null; assert.notEqual(s.p.pickTakedown(), f); }
  s.p.setWeapon('pistol', 7);
  assert.ok(TAKEDOWN_VARIANTS.pistol.some((n) => TAKEDOWNS[n] === s.p.pickTakedown()), 'another weapon: picked again');
});

// ---- face to face: a takedown needs a man who is not aware of us, not his back ----
const { within } = await load('game/systems/Takedown.js');
const { TAKEDOWN_FRONT } = await load('game/data/finishers.js');
const { spotFor } = await load('game/systems/TakedownSpot.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { PROPS } = await load('game/data/props.js');
const { TILE } = await load('game/Config.js');
const { default: LAB } = await load('game/data/levels/lab.js');

test('takedown: within reach and turned to him from any side; `behind` only tells which kind it is', () => {
  for (const a of [0, 1.2, Math.PI / 2, Math.PI, -2]) assert.ok(within(me(), guard({ angle: a })), `he faces ${a}`);
  assert.ok(!within(me({ angle: Math.PI }), guard()), 'we have our back to him');
  assert.ok(!within(me(), guard({ x: TAKEDOWN.reach + 1 })), 'out of reach');
  for (const out of [{ alive: false }, { knocked: 1 }, { vaulting: {} }, { held: {} }]) assert.ok(!within(me(), guard(out)));
  assert.ok(behind(me(), guard()) && !behind(me(), guard({ angle: Math.PI })) && !behind(me(), guard({ angle: Math.PI / 2 })));
  // unaware: not after us, his meter not full; the squad not on us
  assert.ok(unspotted({ aware: 0, meter: 0.6 }, 'normal') && unspotted({ aware: 1, meter: 0.9 }, 'caution'));
  assert.ok(!unspotted({ aware: 1, meter: 1 }, 'normal'), 'he has just made us out');
  assert.ok(!unspotted({ aware: 2, meter: 0 }, 'normal'));
});

test('takedown: every weapon has its move face to face, none of them from behind', () => {
  for (const [type, mag] of [[null], ['knife'], ['cue_half'], ['bat'], ['tire_iron'], ['cue'], ['pistol', 7], ['pistol', 0], ['uzi', 30], ['rifle', 5], ['shotgun', 0],
    ['bazooka', 1]]) {
    const d = WEAPONS[type || 'fists'], weapon = type ? { type, mag: mag ?? 0 } : null;
    for (let i = 0; i < 12; i++) {
      const f = takedownChoice({ d, weapon, front: true, rnd: () => i / 12 });
      assert.ok(f.front, `${type}: ${f.label}`);
      assert.ok(!takedownChoice({ d, weapon, front: false, rnd: () => i / 12 }).front, `${type}: from behind`);
    }
  }
  const front = Object.values(TAKEDOWNS).filter((f) => f.front);
  assert.equal(front.length, new Set(Object.values(TAKEDOWN_FRONT).flat()).size);
  for (const names of Object.values(TAKEDOWN_FRONT)) for (const n of names) assert.ok(TAKEDOWNS[n]?.front, n);
  assert.deepEqual(TAKEDOWN_FRONT.neck, ['headbutt', 'throatPunch']);
  assert.deepEqual([TAKEDOWN_FRONT.blade, TAKEDOWN_FRONT.pistol, TAKEDOWN_FRONT.club], [['faceStab'], ['chin'], ['temple']]);
  let last = null;
  for (let i = 0; i < 20; i++) {
    const f = takedownChoice({ d: WEAPONS.fists, weapon: null, front: true, last, rnd: () => (i * 0.37) % 1 });
    assert.notEqual(f, last, 'fists: never the same twice in a row');
    last = f;
  }
});

// the player by a guard who faces `angle` (0: his back to us, PI: face to face), one frame with the button down
function click(type, angle, over = {}, phase = 'normal') {
  const s = scene(type);
  Object.assign(s.g, { aware: 0, meter: 0, x: 0, y: 0, angle, isEnemy: true }, over);
  Object.assign(s.w, { enemies: [s.g], director: { phase }, uses: { near: () => null }, windows: [], fences: [], ladders: [], doors: [],
    map: { solidAt: () => false, raycast: () => null, isWallChar: () => false, at: () => '.' } });
  Object.assign(s.p, { nearItem: null, slideCd: 0, winded: 0, stamina: 1, safe: { x: -22, y: 0 }, sit: 0, vel: { x: 0, y: 0 }, cooldown: 0, swing: 0,
    baseUpdate() {}, unstick() {}, updateVault: () => false, steer() {}, attacked: 0, attack() { this.attacked++; return false; } });
  const input = { down: () => false, hit: () => false, mouseDown: (b) => b === 0, mouseHit: (b) => b === 0, move: () => null };
  s.p.update(1 / 60, input, { x: 0, y: 0 });
  return s;
}

test('takedown: from the front on a guard who has not made him out it starts, and plays a face to face move', () => {
  for (const [type, names] of [[null, TAKEDOWN_FRONT.neck], ['knife', TAKEDOWN_FRONT.blade], ['pistol', TAKEDOWN_FRONT.pistol], ['bat', TAKEDOWN_FRONT.club]]) {
    const s = click(type, Math.PI);
    assert.ok(s.p.takedown && !s.p.attacked, `${type}: taken`);
    assert.ok(s.p.takedown.front && s.p.takedown.f.front && names.some((n) => TAKEDOWNS[n] === s.p.takedown.f), `${type}: ${s.p.takedown.f.label}`);
    assert.equal(s.g.held, s.p);
    // ... to its end: he is turned to us, we stand before him, he dies killed from the front, thrown back like any man
    const f = s.p.takedown.f, dt = 1 / 60;
    let t = 0, gap = 0;
    while (s.p.takedown && t < 3) {
      t += dt; s.w.time += dt;
      s.p.updateTakedown(dt);
      if (s.g.alive) gap = (s.p.x - s.g.x) * Math.cos(s.g.angle) + (s.p.y - s.g.y) * Math.sin(s.g.angle);
    }
    assert.ok(!s.p.takedown && !s.g.alive, `${type}: over`);
    assert.ok(Math.abs(gap - f.gap) < 2, `${type}: ${gap.toFixed(1)} px in front of him`);
    assert.deepEqual([s.g.how.from, s.g.how.dying, s.g.how.label], ['front', undefined, f.label], type);
  }
  // from behind, the same click plays one from behind
  const s = click('knife', 0);
  assert.ok(s.p.takedown && !s.p.takedown.front && !s.p.takedown.f.front);
  // the hint follows
  const h = click(null, Math.PI, { held: null });
  assert.ok(['HEADBUTT', 'THROAT PUNCH'].includes(h.p.takedown.f.action));
});

test('takedown: none on a guard who has spotted him, from the front or from behind; the click is an attack', () => {
  for (const angle of [0, Math.PI]) {
    for (const [over, phase] of [[{ aware: 2 }, 'normal'], [{ meter: 1 }, 'normal'], [{}, 'alert']]) {
      const s = click('knife', angle, over, phase);
      assert.ok(!s.p.takedown && s.p.nearTakedown === null && s.p.takeMove === null && s.p.contextAction === null, JSON.stringify([angle, over, phase]));
      assert.equal(s.p.attacked, 1);
    }
  }
  // not started: the hint names the move he would do
  const s = scene(null);
  Object.assign(s.g, { aware: 0, angle: Math.PI });
  Object.assign(s.w, { map: { solidAt: () => false, raycast: () => null, isWallChar: () => false, at: () => '.' } });
  const mv = s.p.takedownMove(s.g);
  assert.ok(mv.front && mv.f.front && mv.spot === null);
  assert.equal(s.p.takedownMove(s.g).f, mv.f, 'kept until it is done');
});

// ---- what stands by him: in front of him from behind, on his far side from the front ----
const ROOM = ['########', '#......#', '#......#', '#......#', '#......#', '########'];
test('takedown: from the front, the spot is what is on his far side (he is spun round to it); none there, face to face', () => {
  const s = scene(null), m = new TileMap(ROOM);
  s.w.map = m;
  // his back to the west wall (x = 32), 16 px off it, facing east; we stand east of him, face to face
  Object.assign(s.g, { x: 48, y: 80, angle: 0 });
  Matter.Body.setPosition(s.p.body, { x: 70, y: 80 });
  s.p.angle = Math.PI;
  let mv = s.p.takedownMove(s.g);
  assert.deepEqual([mv.spot?.kind, mv.f, mv.front], ['wall', TAKEDOWNS.wall, false], 'the wall behind him');
  assert.ok(mv.spot.nx === 1, 'the west wall');
  // from behind he would need one in front of him: there is none (the room is wide)
  Object.assign(s.g, { x: 100, y: 80, angle: 0 });
  Matter.Body.setPosition(s.p.body, { x: 122, y: 80 });
  mv = s.p.takedownMove(s.g);
  assert.ok(mv.spot === null && mv.front && mv.f.front, 'in the open: face to face');
  // a bat keeps both hands busy: no spot, its own move
  s.p.setWeapon('bat');
  Object.assign(s.g, { x: 48, y: 80, angle: 0 });
  Matter.Body.setPosition(s.p.body, { x: 70, y: 80 });
  mv = s.p.takedownMove(s.g);
  assert.deepEqual([mv.spot, mv.f, mv.front], [null, TAKEDOWNS.temple, true]);
});

// ---- the lab's station ----
test('lab: the takedowns station has a dummy at each context, unaware, and each picks its move', () => {
  const m = new TileMap(LAB.tiles);
  const props = LAB.props.filter(([type]) => PROPS[type] && !PROPS[type].hung && !PROPS[type].overhead && (PROPS[type].w || PROPS[type].r)).map(([type, col, row, deg = 0]) => {
    const d = PROPS[type], angle = (deg * Math.PI) / 180;
    const body = d.r ? Matter.Bodies.circle(col * TILE, row * TILE, d.r, { angle }) : Matter.Bodies.rectangle(col * TILE, row * TILE, d.w, d.h, { angle });
    return { type, def: d, body, dead: false };
  });
  const dummy = (key) => {
    const [c, r] = key.split(',').map(Number), at = LAB.stand?.[key];
    assert.ok('pushrbkmji'.includes(LAB.actors[r][c]), `a guard at ${key}`);
    return { x: (at ? at[0] : c + 0.5) * TILE, y: (at ? at[1] : r + 0.5) * TILE, angle: (LAB.facing[key] * Math.PI) / 180 };
  };
  const WANT = { '53,2': ['bowl'], '52,4': ['urinal'], '54,3': ['sink'], '58,2': ['ledge', 'TABLE'], '61,2': ['ledge', 'BAR'], '57,5': ['wall'], '59,9': [null] };
  for (const [key, [kind, name]] of Object.entries(WANT)) {
    const g = dummy(key), s = spotFor(g, m, props);
    assert.equal(s?.kind ?? null, kind, `${key}: ${JSON.stringify(s && [s.kind, s.d])}`);
    if (name) assert.equal(s.name, name, key);
    if (kind) assert.equal(takedownChoice({ d: WEAPONS.fists, weapon: null, spot: s }), TAKEDOWNS[kind], key);
    assert.ok(!m.solidAt(g.x, g.y), `${key} stands on the floor`);
  }
  // in the open: from behind the weapon's own, face to face its front move; nothing to slam him on either way
  const open = dummy('59,9');
  assert.equal(spotFor({ ...open, angle: open.angle + Math.PI }, m, props), null);
  // the dummies are passive: blind and deaf, they stay unaware (aware 0), so every takedown is open on them
  assert.equal(LAB.passive, true);
  for (const key of Object.keys(WANT)) assert.ok(!(LAB.awake || []).includes(key), `${key} is a dummy`);
  assert.ok(unspotted({ aware: 0, meter: 0 }, 'normal'));
  // what to take them with lies on the floor of the station
  const drops = LAB.drops.map((d) => d[0]);
  for (const kind of ['pistol', 'knife', 'tire_iron']) {
    assert.ok(LAB.drops.some(([k, x, y]) => k === kind && x > 51 && y > 8 && y < 11), `${kind} on the floor (${drops})`);
  }
  assert.ok(LAB.floor.some(([name]) => name === 'label_takedowns'));
});
