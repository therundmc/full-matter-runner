// The player's throw (THROW in data/feel.js): the right click held winds it up and aims it, let go it flies; a tap is
// the quick throw of old; LOCK draws it onto its man; a full one plants a blade and the hit has its beat
// (systems/ThrowBeat.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
const { default: Player } = await load('game/entities/Player.js');
const { default: ThrowBeat } = await load('game/systems/ThrowBeat.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { THROW } = await load('game/data/feel.js');
const { AIM } = await load('game/data/aim.js');
const { PLAYER } = await load('game/Config.js');

const noop = () => {};
const sink = new Proxy({}, { get: () => noop });
const DT = 1 / 60;

// a world that knows only what a step of the player and a throw need; it keeps what it was asked (slowmo, hitstop,
// the camera's punch) and the items thrown
function world(style = 'cross') {
  const asked = { slowmo: [], hitstop: [], punch: [], sounds: [] };
  const w = {
    asked, particles: sink, decals: sink, events: new EventBus(), time: 0, timers: [], light: noop, shake: noop, noise: noop,
    camera: { punch: (k) => asked.punch.push(k), push: noop },
    slowmo: (s, d) => asked.slowmo.push([s, d]), hitstop: (s) => asked.hitstop.push(s), sound: (n) => asked.sounds.push(n),
    after(s, fn) { this.timers.push({ t: this.time + s, fn }); },
    map: { solidAt: () => false, raycast: () => null, isWallChar: () => false, at: () => '.' }, lineOfSight: () => true, sightLine: () => true,
    traceBullet: () => null,
    props: [], items: [], corpses: [], debris: [], uses: { near: () => null }, windows: [], fences: [], ladders: [], doors: [], director: { phase: 'combat' },
    aimStyle: style, aimMark: false, enemies: [], chars: [],
    addBody: noop, removeBody: noop, addItem(it) { this.items.push(it); }, removeItem(it) { it.dead = true; }, pickupFlash: noop,
  };
  w.characters = () => w.chars;
  return w;
}

function player(w, type) {
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, recoil: 0,
    body: Matter.Bodies.circle(0, 0, 10), radius: 10, nearItem: null, slideCd: 0, winded: 0, stamina: 1, safe: { x: 0, y: 0 }, sit: 0,
    vel: { x: 0, y: 0 }, cooldown: 0, swing: 0, throwT: 0, throwDur: 0.28, throwHold: null, ammo: { '9mm': 0 },
    baseUpdate() {}, unstick() {}, updateVault: () => false });
  p.setWeapon(type);
  w.player = p;
  w.chars.push(p);
  return p;
}

function guard(w, x, y) {
  const g = {
    alive: true, team: 'enemy', isEnemy: true, aware: 2, meter: 1, radius: 10, held: null, knocked: 0, angle: Math.PI,
    body: Matter.Bodies.circle(x, y, 10),
    get x() { return this.body.position.x; }, get y() { return this.body.position.y; },
    kill(a, cause, killer, by, how) { Object.assign(this, { alive: false, cause, killer, by, how }); },
    knock(a, cause) { this.knocked = 1; this.knockedBy = cause; },
  };
  w.enemies.push(g);
  w.chars.push(g);
  return g;
}

// steps of the player with the right click: down over `hold` steps (0: a click down and up within the first step),
// the aim at `aim`; returns what was thrown
function play(w, p, hold, steps = hold + 6, aim = { x: 100, y: 0 }) {
  for (let i = 0; i < steps; i++) {
    const down = i < hold;
    const input = { down: () => false, hit: () => false, mouseDown: (b) => b === 2 && down, mouseHit: (b) => b === 2 && i === 0, move: () => null };
    p.update(DT, input, aim);
    w.time += DT;
  }
  return w.items;
}
const speedOf = (it) => Math.hypot(it.body.velocity.x, it.body.velocity.y);

test('throw: a tap throws at the quick speed at once, a 0.4 s hold at the full one', () => {
  let w = world(), p = player(w, 'knife');
  let [it] = play(w, p, 0, 1);
  assert.ok(it, 'a click down and up within a step: thrown that step');
  assert.ok(Math.abs(speedOf(it) - THROW.speed[0]) < 1e-6 && it.charge === 0);
  assert.equal(p.weapon, null);
  // released within the tap
  w = world(); p = player(w, 'knife');
  [it] = play(w, p, Math.floor(THROW.tap * 60));
  assert.ok(Math.abs(speedOf(it) - THROW.speed[0]) < 1e-6, `a tap: ${speedOf(it)}`);
  // held 0.4 s
  w = world(); p = player(w, 'knife');
  assert.equal(play(w, p, 24, 23).length, 0, 'nothing goes while it is held');
  assert.ok(p.throwHold && p.throwCharge() > 0.9);
  [it] = play(w, p, 0, 1);
  assert.ok(Math.abs(speedOf(it) - THROW.speed[1]) < 1e-6 && it.charge === 1, `held: ${speedOf(it)}`);
  assert.ok(Math.abs(it.body.velocity.y) < 1e-9, 'along the aim');
  assert.equal(p.throwHold, null);
});

test('throw: the charge runs from the tap to `charge` s and no further', () => {
  const p = Object.create(Player.prototype);
  assert.equal(p.throwCharge({ t: 0 }), 0);
  assert.equal(p.throwCharge({ t: THROW.tap }), 0);
  assert.ok(Math.abs(p.throwCharge({ t: (THROW.tap + THROW.charge) / 2 }) - 0.5) < 1e-9);
  assert.equal(p.throwCharge({ t: THROW.charge }), 1);
  assert.equal(p.throwCharge({ t: 5 }), 1);
  // held 2 s: still the full speed
  const w = world(), q = player(w, 'bat');
  const [it] = play(w, q, 120);
  assert.ok(Math.abs(speedOf(it) - THROW.speed[1]) < 1e-6);
});

test('throw: while it is held he walks at the move share, the left click and R do nothing', () => {
  const w = world(), p = player(w, 'pistol');
  const paces = [];
  p.steer = (dx, dy, speed) => paces.push(speed);
  let attacks = 0, reloads = 0;
  p.attack = () => { attacks++; return true; };
  p.reload = () => { reloads++; return true; };
  for (let i = 0; i < 10; i++) {
    // (from the step after the one it starts on)
    const input = { down: (c) => c === 'KeyD', hit: (c) => c === 'KeyR' && i > 0, mouseDown: (b) => b === 2 || (b === 0 && i > 0),
      mouseHit: (b) => (b === 2 && i === 0) || (b === 0 && i > 0), move: () => null };
    p.update(DT, input, { x: 100, y: 0 });
  }
  assert.ok(Math.abs(paces[0] - PLAYER.speed) < 1e-9, 'the step it starts on: still his pace');
  assert.ok(paces.slice(1).every((v) => Math.abs(v - PLAYER.speed * THROW.move) < 1e-9), `${paces}`);
  assert.equal(attacks, 0);
  assert.equal(reloads, 0);
});

test('throw: LOCK draws a held throw onto its man within the cone; the CROSS throws along the aim', () => {
  const off = AIM.lock.cone - 0.05, d = 150;
  for (const style of ['lock', 'cross']) {
    const w = world(style), p = player(w, 'knife');
    guard(w, Math.cos(off) * d, Math.sin(off) * d);
    const [it] = play(w, p, 30);
    const a = Math.atan2(it.body.velocity.y, it.body.velocity.x);
    if (style === 'lock') assert.ok(Math.abs(a - off) < 1e-6, `onto him: ${a}`);
    else assert.ok(Math.abs(a) < 1e-9, `along the aim: ${a}`);
  }
  // out of the cone or past the reach: along the aim
  for (const [o, r] of [[AIM.lock.cone + 0.05, 150], [0.1, THROW.lock + 20]]) {
    const w = world('lock'), p = player(w, 'knife');
    guard(w, Math.cos(o) * r, Math.sin(o) * r);
    const [it] = play(w, p, 30);
    assert.ok(Math.abs(Math.atan2(it.body.velocity.y, it.body.velocity.x)) < 1e-9);
  }
});

test('throw: a full throw plants a blade even slowed down, with the thrown tag, and the hit has its beat', () => {
  const w = world(), p = player(w, 'knife');
  const beat = new ThrowBeat(w), hits = [];
  w.events.on('thrownHit', (e) => hits.push(e));
  const [it] = play(w, p, 30);
  // slowed under the old sticking speed: a full throw still plants
  Matter.Body.setVelocity(it.body, { x: 4, y: 0 });
  const g = guard(w, it.x + 8, it.y);
  it.update(DT);
  assert.ok(!g.alive && g.cause === 'slash' && g.how.thrown, 'planted: killed');
  assert.equal(g.by.stuck, it.def.sprite);
  assert.equal(g.by.stuckA, 0, 'standing in him along the way it flew');
  assert.ok(it.dead, 'gone from the floor');
  assert.equal(hits.length, 1);
  assert.ok(hits[0].kill && hits[0].planted && hits[0].thrower === p);
  const K = THROW.hit.kill;
  assert.deepEqual(w.asked.slowmo, [K.slowmo]);
  assert.deepEqual(w.asked.hitstop, [K.stop]);
  assert.deepEqual(w.asked.punch, [K.punch]);
  assert.ok(w.asked.sounds.includes('bladeThunk'));
  // the camera: on where it struck, for `hold` real s
  assert.equal(beat.shot().name, K.shot);
  beat.update(K.hold + 0.01);
  assert.equal(beat.shot(), null);
});

test('throw: a quick blade that slowed down, or a bat, only floors him: the lighter beat', () => {
  const w = world(), p = player(w, 'bat');
  new ThrowBeat(w);
  const [it] = play(w, p, 0, 1);
  const g = guard(w, it.x + 8, it.y);
  it.update(DT);
  assert.ok(g.alive && g.knocked && g.knockedBy === 'throw');
  assert.deepEqual(w.asked.slowmo, [THROW.hit.knock.slowmo]);
  // a guard's throw at the player has no beat of the player's
  const w2 = world();
  player(w2, 'knife');
  new ThrowBeat(w2);
  w2.events.emit('thrownHit', { thrower: { isPlayer: false }, x: 0, y: 0, angle: 0, kill: true });
  assert.equal(w2.asked.slowmo.length + w2.asked.hitstop.length, 0);
});

test('throw: the camera follows a throw with a man on its line over its last stretch', () => {
  const w = world(), p = player(w, 'knife');
  const beat = new ThrowBeat(w);
  const g = guard(w, 200, 0);
  const [it] = play(w, p, 0, 1);
  assert.equal(beat.shot(), null, 'far from him: the usual view');
  Matter.Body.setPosition(it.body, { x: g.x - THROW.follow + 10, y: 0 });
  assert.equal(beat.shot().name, 'throwFollow');
  it.dead = true;
  beat.update(DT);
  assert.equal(beat.shot(), null);
});

test('throw: unarmed, the right click picks up at once; a hold paused and let go meanwhile is dropped', () => {
  const w = world(), p = player(w, null);
  w.items.push({ x: 8, y: 0, speed: 0, dead: false, type: 'knife', hilite: 0 });
  play(w, p, 1, 1);
  assert.equal(p.weapon?.type, 'knife');
  assert.equal(p.throwHold, null);
  // paused under a hold (Game: interrupt), the button let go meanwhile: nothing thrown, nothing held
  const w2 = world(), q = player(w2, 'knife');
  play(w2, q, 10, 5);
  q.interrupt();
  const up = { down: () => false, hit: () => false, mouseDown: () => false, mouseHit: () => false, move: () => null };
  q.update(DT, up, { x: 100, y: 0 });
  assert.equal(w2.items.length, 0);
  assert.equal(q.throwHold, null);
  assert.equal(q.weapon?.type, 'knife');
  // ... still held when play comes back: it goes on, and flies when let go
  const w3 = world(), r = player(w3, 'knife');
  play(w3, r, 10, 5);
  r.interrupt();
  const held = { ...up, mouseDown: (b) => b === 2 };
  r.update(DT, held, { x: 100, y: 0 });
  r.update(DT, up, { x: 100, y: 0 });
  assert.equal(w3.items.length, 1);
});
