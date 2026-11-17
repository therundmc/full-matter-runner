import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { behind, newTakedown, advance, lockedFor } = await load('game/systems/Takedown.js');
const { TAKEDOWN, BODY_SCALE } = await load('game/Config.js');
const { TAKEDOWNS, takedownFor, shotCause } = await load('game/data/finishers.js');
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
  const WHAT = ['seize', 'struggle', 'twist', 'draw', 'cut', 'windup', 'nape', 'muzzle', 'shot', 'butt', 'smash', 'dunk'];
  const KILLS = ['twist', 'cut', 'nape', 'shot', 'butt', 'smash', 'dunk'];
  const actions = new Set();
  for (const [name, f] of Object.entries(TAKEDOWNS)) {
    const n = f.beats.length, lock = lockedFor(f);
    // a head driven into something takes longer (two blows, the toilet a struggle between them)
    assert.ok(lock >= 0.8 && lock <= (f.context ? 1.8 : 1.4), `${name}: ${lock.toFixed(2)} s`);
    for (const [wait, what] of f.beats) assert.ok(wait > 0 && WHAT.includes(what), `${name}: ${what}`);
    assert.ok(KILLS.includes(f.beats[n - 1][1]), `${name} ends on a kill`);
    assert.ok(KNEELS[f.dying] || f.dying === 'wall', `${name}: ${f.dying}`);
    assert.ok(['snap', 'slash', 'melee', 'shot'].includes(f.cause), name);
    assert.ok(f.drop === undefined || f.drop < n - 1, `${name}: he drops before the kill`);
    assert.ok(!f.grip || f.beats[0][1] === 'seize', `${name}: a grip starts on the seize`);
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
    if (f.drop !== undefined) assert.ok(Math.abs(td.downAt - f.beats[0][0]) < 2 * dt, name);
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
  p.startTakedown(g);
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
  s.p.startTakedown(s.g);
  s.w.time += 0.1;
  s.p.updateTakedown(0.1);
  s.g.alive = false;
  s.p.updateTakedown(1 / 60);
  assert.ok(!s.p.takedown && s.g.held === null && s.p.body.collisionFilter.group === 0);
  assert.equal(s.g.cause, undefined, 'not killed twice');
});

test('takedown: pose distances are taken in pose px (the body is drawn BODY_SCALE larger)', () => {
  const s = scene('knife');
  s.p.startTakedown(s.g);
  assert.ok(Math.abs(s.p.takedown.d - 22 / BODY_SCALE) < 1e-6);
});
