import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { lungeTarget } = await load('game/systems/Lunge.js');
const { PLAYER } = await load('game/Config.js');
const { WEAPONS } = await load('game/data/weapons.js');

const L = PLAYER.lunge;
const me = { x: 0, y: 0, radius: 10 };
const guard = (x, y, over = {}) => ({ x, y, radius: 10, alive: true, knocked: 0, held: null, ...over });
const sees = () => true, open = () => false;
const knife = WEAPONS.knife, fists = WEAPONS.fists, bat = WEAPONS.bat;

test('lunge: a swing is drawn to the nearest standing guard in the cone, in reach', () => {
  const near = guard(40, 4), far = guard(44, -2), aside = guard(0, 40);
  const r = lungeTarget(me, knife, [far, aside, near], 0, L, sees, open);
  assert.equal(r.target, near);
  assert.ok(Math.abs(r.a - Math.atan2(4, 40)) < 1e-9, 'a small turn is taken whole');
  // out of reach (the weapon's + extra) or out of the cone: nobody
  assert.equal(lungeTarget(me, knife, [guard(knife.range + 10 + L.extra + 1, 0)], 0, L, sees, open), null);
  assert.equal(lungeTarget(me, knife, [guard(30, 30)], 0, L, sees, open), null);
  assert.ok(lungeTarget(me, fists, [guard(30, 0)], 0, L, sees, open), 'bare hands too');
});

test('lunge: never to a man down, held, dead or behind a wall', () => {
  for (const g of [guard(30, 0, { knocked: 2 }), guard(30, 0, { held: me }), guard(30, 0, { alive: false })]) {
    assert.equal(lungeTarget(me, bat, [g], 0, L, sees, open), null);
  }
  const g = guard(30, 0);
  assert.equal(lungeTarget(me, bat, [g], 0, L, (e) => e !== g, open), null);
});

test('lunge: the turn is held to its limit, the step to its length, short of contact and of walls', () => {
  // 0.45 rad off the aim: in the cone, turned by 0.25 only
  const off = 0.45, d = 36, g = guard(Math.cos(off) * d, Math.sin(off) * d);
  const r = lungeTarget(me, bat, [g], 0, L, sees, open);
  assert.ok(Math.abs(r.a - L.turn) < 1e-9);
  assert.equal(r.push, L.push);
  // close: only to contact
  const c = lungeTarget(me, bat, [guard(25, 0)], 0, L, sees, open);
  assert.equal(c.push, 25 - 20 - L.gap);
  // already in contact range (him or another one): no step, the aim still helps
  assert.equal(lungeTarget(me, bat, [guard(20.5, 0)], 0, L, sees, open).push, 0);
  assert.equal(lungeTarget(me, bat, [guard(36, 0), guard(-18, 0)], 0, L, sees, open).push, 0);
  // a wall 4 px ahead of his front
  const wall = (x) => x > me.radius + 4;
  assert.equal(lungeTarget(me, bat, [guard(36, 0)], 0, L, sees, wall).push, 4);
});

test('lunge: never with a gun in hand', () => {
  assert.equal(lungeTarget(me, WEAPONS.pistol, [guard(30, 0)], 0, L, sees, open), null);
  assert.equal(lungeTarget(me, WEAPONS.shotgun, [guard(30, 0)], 0, L, sees, open), null);
});

// ---- the man the LOCK aim cue holds (data/aim.js AIM.lock; Player.startLunge passes him in) ----
const LK = L.lock;

test('lunge: the man LOCK holds takes the whole turn and the longer step', () => {
  // 0.6 rad off the aim, 50 px off: out of today's cone, but LOCK holds him
  const off = 0.6, d = 50, g = guard(Math.cos(off) * d, Math.sin(off) * d);
  assert.equal(lungeTarget(me, bat, [g], 0, L, sees, open), null, 'without the lock: nobody');
  const r = lungeTarget(me, bat, [g], 0, L, sees, open, g);
  assert.equal(r.target, g);
  assert.ok(r.lock && Math.abs(r.a - off) < 1e-9 && r.dir === r.a, 'the whole way to him');
  assert.equal(r.push, LK.push);
  // close: only to contact; already at contact: no step, the turn still whole
  const c = guard(0, 25), rc = lungeTarget(me, fists, [c], 0, L, sees, open, c);
  assert.ok(Math.abs(rc.a - Math.PI / 2) < 1e-9);
  assert.equal(rc.push, 25 - 20 - L.gap);
  const touch = guard(0, 20.5);
  assert.equal(lungeTarget(me, fists, [touch], 0, L, sees, open, touch).push, 0);
  // a wall 4 px ahead of his front stops it
  const wall = (x) => x > me.radius + 4, ahead = guard(50, 0);
  assert.equal(lungeTarget(me, bat, [ahead], 0, L, sees, wall, ahead).push, 4);
});

test('lunge: the lock step covers the lock margin, so a swing at a held man within it lands', () => {
  assert.ok(LK.push >= LK.margin && LK.margin > L.extra);
  for (const w of [fists, bat, knife, WEAPONS.cue]) {
    const at = w.range + 10 + LK.margin, g = guard(at, 0), r = lungeTarget(me, w, [g], 0, L, sees, open, g);
    assert.ok(r?.lock, w.name);
    assert.ok(at - r.push <= w.range + 10, `${w.name}: ${at} px -> ${at - r.push} px, its reach ${w.range + 10}`);
  }
});

test('lunge: a held man beyond the margin, down, held or behind a wall: today\'s rules', () => {
  const far = guard(bat.range + 10 + LK.margin + 1, 0);
  assert.equal(lungeTarget(me, bat, [far], 0, L, sees, open, far), null);
  // today's nearest guard in the cone still draws the swing, clamped
  const off = 0.45, near = guard(Math.cos(off) * 36, Math.sin(off) * 36);
  for (const lock of [far, guard(30, 0, { knocked: 2 }), guard(30, 0, { held: me }), guard(30, 0, { alive: false })]) {
    const r = lungeTarget(me, bat, [near, lock], 0, L, sees, open, lock);
    assert.ok(!r.lock && r.target === near && Math.abs(r.a - L.turn) < 1e-9);
  }
  const hid = guard(30, 0);
  assert.equal(lungeTarget(me, bat, [hid], 0, L, (e) => e !== hid, open, hid), null);
  assert.equal(lungeTarget(me, WEAPONS.pistol, [hid], 0, L, sees, open, hid), null, 'never with a gun');
});

// ---- played by the player: one swing, the button down for a frame, on a world that only knows what it needs ----
const { default: Player } = await load('game/entities/Player.js');
const { AIM } = await load('game/data/aim.js');
const noop = () => {};
const sink = new Proxy({}, { get: () => noop });

// the player at (0, 0) aiming along +x, a guard who has seen him `d` px off at `off` rad; the swing stepped through
// in the world's order (timers, the player, then the physics moving him by his velocity)
function swing(type, d, off, style) {
  const w = {
    particles: sink, decals: sink, camera: sink, events: sink, time: 0, timers: [], slowmo: noop, hitstop: noop, shake: noop, light: noop,
    sound: noop, noise: noop, after(s, fn) { this.timers.push({ t: this.time + s, fn }); },
    map: { solidAt: () => false, raycast: () => null, isWallChar: () => false, at: () => '.' }, lineOfSight: () => true, sightLine: () => true,
    props: [], items: [], corpses: [], debris: [], uses: { near: () => null }, windows: [], fences: [], ladders: [], doors: [], director: { phase: 'combat' },
    aimStyle: style, aimMark: false,
  };
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, recoil: 0,
    body: Matter.Bodies.circle(0, 0, 10), radius: 10, nearItem: null, slideCd: 0, winded: 0, stamina: 1, safe: { x: 0, y: 0 }, sit: 0,
    vel: { x: 0, y: 0 }, cooldown: 0, swing: 0, baseUpdate() {}, unstick() {}, updateVault: () => false });
  p.setWeapon(type);
  const g = {
    alive: true, team: 'enemy', isEnemy: true, aware: 2, meter: 1, radius: 10, held: null, knocked: 0, angle: Math.PI + off,
    body: Matter.Bodies.circle(Math.cos(off) * d, Math.sin(off) * d, 10),
    get x() { return this.body.position.x; }, get y() { return this.body.position.y; },
    kill() { this.alive = false; }, knock() { this.knocked = 1; },
  };
  w.enemies = [g]; w.chars = [p, g]; w.characters = () => w.chars;
  const aim = { x: 100, y: 0 }, angles = [];
  for (let i = 0; i < 12; i++) {
    const input = { down: () => false, hit: () => false, mouseDown: (b) => b === 0 && i === 0, mouseHit: (b) => b === 0 && i === 0, move: () => null };
    const due = w.timers.filter((t) => t.t <= w.time);
    w.timers = w.timers.filter((t) => t.t > w.time);
    for (const t of due) t.fn();
    if (g.alive && !g.knocked) p.update(1 / 60, input, aim);
    angles.push(p.angle);
    const v = p.body.velocity;
    Matter.Body.setPosition(p.body, { x: p.x + v.x, y: p.y + v.y });
    w.time += 1 / 60;
  }
  return { p, g, angles, dir: Math.atan2(g.y, g.x) };
}

test('lunge: with LOCK, a swing at a held man off the aim turns the player onto him and the blow lands', () => {
  const cone = AIM.lock.cone;
  // in LOCK's cone, off the aim: a bat at 40 px (and at 52, past today's reach), fists at 25 px (and at 44)
  for (const [type, d, off] of [['bat', 40, cone - 0.05], [null, 25, cone - 0.02], ['bat', 52, cone - 0.05], [null, 44, cone - 0.05]]) {
    const s = swing(type, d, off, 'lock');
    assert.ok(Math.abs(s.angles[0] - s.dir) < 0.05, `${type}: turned onto him (${s.angles[0].toFixed(3)} vs ${s.dir.toFixed(3)})`);
    assert.ok(!s.g.alive || s.g.knocked, `${type || 'fists'} at ${d} px: the blow landed (${Math.hypot(s.g.x - s.p.x, s.g.y - s.p.y).toFixed(1)} px)`);
  }
});

test('lunge: with the CROSS (or nobody held), the swing is today\'s: the aim turned by PLAYER.lunge.turn at most', () => {
  const s = swing('bat', 40, AIM.lock.cone - 0.05, 'cross');
  assert.ok(Math.abs(s.angles[0] - L.turn) < 1e-9);
  assert.ok(swing('bat', 52, AIM.lock.cone - 0.05, 'cross').g.alive, 'today\'s short step: the bat falls short at 52 px');
  // a man past LOCK's melee reach: nobody held, no lunge, no turn
  const far = swing('bat', AIM.lock.melee + 10, 0.2, 'lock');
  assert.equal(far.angles[0], 0);
  assert.ok(far.g.alive);
});
