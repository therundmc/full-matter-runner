// Close combat's edges (Character.meleeStrike, WeaponItem, Player's hands, LOCK, a blast on a car): a blow that cannot
// land once its weapon is gone, panes and doors struck only in the arc and in sight, a blade that does not kill
// falling off, a car's glass broken once, the hands let go when the getaway takes him over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }) }) };
const { default: Player } = await load('game/entities/Player.js');
const { default: Window } = await load('game/entities/Window.js');
const { default: Enemy } = await load('game/entities/Enemy.js');
const { default: Boss } = await load('game/entities/Boss.js');
const { default: Character } = await load('game/entities/Character.js');
const { default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: WeaponItem } = await load('game/entities/WeaponItem.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { BOSSES } = await load('game/data/bosses.js');
const { DROP } = await load('game/data/feel.js');
const { lockTarget, meleeLock } = await load('game/systems/AimCue.js');
const { lungeTarget } = await load('game/systems/Lunge.js');
const { PLAYER } = await load('game/Config.js');

const noop = () => {};
const sink = new Proxy({}, { get: () => noop });
const DT = 1 / 60;

function world() {
  const w = {
    particles: sink, decals: sink, events: new EventBus(), time: 0, timers: [], light: noop, shake: noop, noise: noop, hitstop: noop,
    camera: { punch: noop, push: noop }, slowmo: noop, sound: noop,
    after(s, fn) { this.timers.push({ t: this.time + s, fn }); },
    map: { solidAt: () => false, raycast: () => null, isWallChar: () => false, at: () => '.' }, lineOfSight: () => true, sightLine: () => true,
    traceBullet: () => null,
    props: [], items: [], corpses: [], debris: [], uses: { near: () => null }, windows: [], fences: [], ladders: [], doors: [], director: { phase: 'combat' },
    aimMark: false, enemies: [], chars: [],
    addBody: noop, removeBody: noop, addItem(it) { this.items.push(it); }, removeItem(it) { it.dead = true; }, pickupFlash: noop,
    addDebris(d) { this.debris.push(d); },
  };
  w.characters = () => w.chars;
  return w;
}
// the world's timers run for s seconds
function run(w, s) {
  for (let t = 0; t < s; t += DT) {
    w.time += DT;
    const due = w.timers.filter((q) => q.t <= w.time);
    w.timers = w.timers.filter((q) => q.t > w.time);
    for (const q of due) q.fn();
  }
}

function player(w, type) {
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, recoil: 0,
    body: Matter.Bodies.circle(0, 0, 10), radius: 10, nearItem: null, slideCd: 0, winded: 0, stamina: 1, safe: { x: 0, y: 0 }, sit: 0,
    vel: { x: 0, y: 0 }, cooldown: 0, swing: 0, throwT: 0, throwDur: 0.28, throwHold: null, ammo: { '9mm': 0 }, held: null,
    lunge: null, facingLock: null, snatch: null, baseUpdate() {}, unstick() {}, updateVault: () => false });
  p.setWeapon(type);
  w.player = p;
  w.chars.push(p);
  return p;
}

function guard(w, x, y, more = {}) {
  const g = {
    alive: true, team: 'enemy', isEnemy: true, aware: 2, meter: 1, radius: 10, held: null, knocked: 0, angle: Math.PI,
    body: Matter.Bodies.circle(x, y, 10),
    get x() { return this.body.position.x; }, get y() { return this.body.position.y; },
    kill(a, cause, killer, by, how) { Object.assign(this, { alive: false, cause, killer, by, how }); },
    knock(a, cause) { this.knocked = 1; this.knockedBy = cause; },
    ...more,
  };
  w.enemies.push(g);
  w.chars.push(g);
  return g;
}

// a window set in a wall at (x, y) (vertical: the wall runs along y), counting its breaks
function pane(w, x, y, vertical = true) {
  const win = Object.create(Window.prototype);
  Object.assign(win, { x, y, vertical, intact: true, broke: 0, shatter() { this.broke++; this.intact = false; } });
  w.windows.push(win);
  return win;
}
// a door shut across the way at x (its leaf from y - 16 to y + 16), counting its blows
function door(w, x, y = 0) {
  const d = { hx: x, hy: y - 16, hits: 0, tip: () => ({ x, y: y + 16 }), hit() { this.hits++; } };
  w.doors.push(d);
  return d;
}

test('combat: a weapon thrown during its own windup never lands the swing', () => {
  const w = world(), p = player(w, 'bat'), g = guard(w, 22, 0);
  // the left click (a swing) and a right-click tap (the quick throw) in the same step
  const input = { down: () => false, hit: () => false, mouseDown: (b) => b === 0, mouseHit: (b) => b === 0 || b === 2, move: () => null };
  p.update(DT, input, { x: 100, y: 0 });
  assert.equal(p.weapon, null, 'the bat is gone from his hand');
  assert.equal(w.items.length, 1);
  run(w, 0.4);
  assert.ok(g.alive, 'only the bat in flight may hit him, not a swing of an empty hand');
  // swapped for another during the windup: no blow either, and no wear on the new one
  const w2 = world(), p2 = player(w2, 'bat'), g2 = guard(w2, 22, 0);
  p2.attack();
  p2.setWeapon('knife');
  run(w2, 0.4);
  assert.ok(g2.alive);
  assert.equal(p2.weapon.wear, WEAPONS.knife.wear);
  // the swing kept: it lands
  const w3 = world(), p3 = player(w3, 'bat'), g3 = guard(w3, 22, 0);
  p3.attack();
  run(w3, 0.4);
  assert.equal(g3.alive, false);
});

test('combat: a man seized during his windup never lands it', () => {
  const w = world(), p = player(w, 'bat'), g = guard(w, 22, 0);
  p.attack();
  p.held = {}; // in somebody's hands
  run(w, 0.4);
  assert.ok(g.alive);
});

test('combat: a blow breaks a pane and strikes a door in its arc, never behind him nor through a wall', () => {
  // he faces +x
  const w = world(), p = player(w, 'fists'), back = pane(w, -20, 0), backDoor = door(w, -24);
  p.meleeStrike(WEAPONS.fists);
  assert.equal(back.broke, 0, 'the window behind him');
  assert.equal(backDoor.hits, 0, 'the door behind him');
  // ahead of him: they do
  const a = world(), pa = player(a, 'fists'), ahead = pane(a, 26, 0), aheadDoor = door(a, 24);
  pa.meleeStrike(WEAPONS.fists);
  assert.equal(ahead.broke, 1);
  assert.equal(aheadDoor.hits, 1);
  // a wall between (x = 8): nothing
  const b = world(), pb = player(b, 'bat');
  b.lineOfSight = (x0, y0, x1, y1) => !(Math.min(x0, x1) < 8 && Math.max(x0, x1) > 8);
  const walled = pane(b, 26, 0), walledDoor = door(b, 24);
  pb.meleeStrike(WEAPONS.bat);
  assert.equal(walled.broke, 0, 'a pane through a wall');
  assert.equal(walledDoor.hits, 0, 'a door through a wall');
  // a pane of a wall along his way (a horizontal one, 26 px to his side), struck with the swing turned onto it
  const c = world(), pc = player(c, 'bat'), side = pane(c, 10, 26, false);
  pc.angle = Math.PI / 2;
  pc.meleeStrike(WEAPONS.bat);
  assert.equal(side.broke, 1);
});

test('combat: a club swung all the way round shoves what lies behind him away from him', () => {
  const w = world(), p = player(w, 'bat');
  const behind = { body: Matter.Bodies.circle(-20, 0, 4), age: 1 };
  w.items.push(behind);
  p.strike = 3; // the spin
  p.meleeStrike(WEAPONS.bat);
  assert.ok(behind.body.velocity.x < -1, 'flung back, away from him');
  // a plain swing leaves it there
  const v = world(), q = player(v, 'bat'), still = { body: Matter.Bodies.circle(-20, 0, 4), age: 1 };
  v.items.push(still);
  q.meleeStrike(WEAPONS.bat);
  assert.equal(still.body.velocity.x, 0);
});

test('combat: a blade thrown at a man it does not kill (a boss whole) falls off him, still a weapon on the floor', () => {
  const w = world(), p = player(w, 'knife');
  let wounded = 0;
  const boss = guard(w, 60, 0, { kill() { wounded++; } }); // the first hit only wounds him
  p.throwWeapon(false, 1); // full: a blade plants
  const it = w.items[0];
  for (let i = 0; i < 30 && it.thrower; i++) {
    Matter.Body.setPosition(it.body, { x: it.x + it.body.velocity.x, y: it.y + it.body.velocity.y });
    it.update(DT);
  }
  assert.equal(wounded, 1);
  assert.ok(boss.alive);
  assert.ok(!it.dead, 'still in the world');
  assert.equal(it.thrower, null, 'it bounced off him');
  assert.ok(it.body.velocity.x < 0);
  // a man it kills keeps it in him (gone from the floor)
  const k = world(), pk = player(k, 'knife'), g = guard(k, 60, 0);
  pk.throwWeapon(false, 1);
  const kt = k.items[0];
  for (let i = 0; i < 30 && kt.thrower && !kt.dead; i++) {
    Matter.Body.setPosition(kt.body, { x: kt.x + kt.body.velocity.x, y: kt.y + kt.body.velocity.y });
    kt.update(DT);
  }
  assert.equal(g.alive, false);
  assert.ok(kt.dead);
});

test('combat: a blast on a car breaks a window once', () => {
  const car = (state) => {
    const v = Object.create(Vehicle.prototype);
    Object.assign(v, { exploded: false, m: { wind: [82, 96, 11, 46], rear: [35, 44, 11, 46] }, h: 58, windows: { wind: state, rear: state },
      shattered: [], damage() {}, popTire() {} });
    v.hitWindow = function (which) { if (++this.windows[which] === 2) this.shattered.push(which); };
    return v;
  };
  const R = Math.random;
  Math.random = () => 0; // its chance always passes
  try {
    const gone = car(2), whole = car(0);
    gone.onBlast(10, 160, 0);
    whole.onBlast(10, 160, 0);
    assert.deepEqual(gone.shattered, [], 'already gone: no second shatter');
    assert.deepEqual(whole.shattered, ['wind', 'rear']);
  } finally {
    Math.random = R;
  }
});

test('combat: LOCK never brackets a bystander, nor turns a swing onto a man who gave up', () => {
  const p = { x: 0, y: 0, alive: true, team: 'player', radius: 10, isPlayer: true };
  const civ = { x: 120, y: 4, alive: true, team: 'civilian', radius: 10, isCivilian: true };
  const w = { player: p, chars: [p, civ], enemies: [], sightLine: () => true };
  assert.equal(lockTarget(w, 'player', 0, 0, 0), null, 'a patron in the cone');
  const g = { x: 160, y: 0, alive: true, team: 'enemy', radius: 10, isEnemy: true, knocked: 0 };
  w.chars.push(g);
  assert.equal(lockTarget(w, 'player', 0, 0, 0), g, 'the guard behind him');
  // a guard on his knees, close, with a bat in hand
  const knelt = { x: 30, y: 0, alive: true, team: 'enemy', radius: 10, isEnemy: true, knocked: 0, yielded: true };
  const m = { player: p, chars: [p, knelt], enemies: [knelt], sightLine: () => true };
  assert.equal(meleeLock(m, p, WEAPONS.bat, 0)?.close ?? false, false);
  assert.equal(lungeTarget(p, WEAPONS.bat, [knelt], 0, PLAYER.lunge, () => true, () => false), null);
  assert.equal(lungeTarget(p, WEAPONS.bat, [knelt], 0, PLAYER.lunge, () => true, () => false, knelt), null, 'even held by LOCK');
  knelt.yielded = false;
  assert.equal(meleeLock(m, p, WEAPONS.bat, 0).man, knelt);
  assert.equal(lungeTarget(p, WEAPONS.bat, [knelt], 0, PLAYER.lunge, () => true, () => false).target, knelt);
});

test('combat: the getaway lets go of his hands: the throw wound up, the step, the turn, the weapon he was taking', () => {
  const w = world(), p = player(w, 'fists');
  const it = new WeaponItem(w, 'pistol', 7, 20, 0).reserve();
  Object.assign(p, { throwHold: { t: 0.2, paused: false }, lunge: { a: 0 }, facingLock: { who: {} } });
  p.snatchFrom(it);
  p.releaseHands();
  assert.deepEqual([p.throwHold, p.lunge, p.facingLock, p.snatch], [null, null, null, null]);
  assert.equal(it.reserved, false);
  assert.equal(it.body.isStatic, false, 'back in the physics, to be picked up');
});

test('combat: a second weapon snatched before the first is in his hand lets the first go', () => {
  const w = world(), p = player(w, 'fists');
  const a = new WeaponItem(w, 'pistol', 7, 20, 0).reserve(), b = new WeaponItem(w, 'pistol', 7, -20, 0).reserve();
  p.snatchFrom(a, true);
  p.snatchFrom(b, true);
  assert.equal(p.snatch.item, b);
  assert.equal(a.reserved, false);
  assert.equal(a.body.isStatic, false);
  assert.equal(b.reserved, true);
});

test('combat: a dead man\'s weapon falls by him (DROP), a boss\'s flies (death.gun), a man floored drops it a little further', () => {
  for (let i = 0; i < 40; i++) {
    const [, v] = Character.prototype.deathDrop.call({}, 0);
    assert.ok(v >= DROP.speed[0] && v <= DROP.speed[1]);
    const [ba, bv] = Boss.prototype.deathDrop.call({ traits: BOSSES.cueball }, 1);
    assert.ok(bv >= BOSSES.cueball.death.gun[0] && bv <= BOSSES.cueball.death.gun[1]);
    assert.ok(Math.abs(ba - 1) <= 0.6);
  }
  assert.ok(DROP.knock[1] <= 1.6);
  for (let i = 0; i < 20; i++) {
    const w = world(), e = Object.create(Enemy.prototype);
    w.director.release = noop;
    Object.assign(e, { world: w, alive: true, knocked: 0, body: Matter.Bodies.circle(0, 0, 10), vel: { x: 0, y: 0 } });
    e.setWeapon('bat');
    e.knock(0, 'punch');
    const v = w.items[0].body.velocity, s = Math.hypot(v.x, v.y);
    assert.ok(s >= DROP.knock[0] - 1e-9 && s <= DROP.knock[1] + 1e-9, `knocked out of his hand at ${s}`);
  }
});
