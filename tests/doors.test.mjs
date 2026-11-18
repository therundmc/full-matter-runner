import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: entities only need canvases to exist, nothing is looked at here
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { Bodies, Body } = Matter;
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setKg } = await load('engine/physics/Body.js');
const { leafInertia, pushLeaf, swing } = await load('engine/physics/Hinge.js');
const { STEP } = await load('engine/physics/Units.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { doorLeaves } = await load('game/world/Openings.js');
const { default: Door } = await load('game/entities/Door.js');
const { default: Doors } = await load('game/systems/Doors.js');
const { default: Uses } = await load('game/systems/Uses.js');
const { DOORS } = await load('game/data/doors.js');
const { PHYSICS, PLAYER, CAT, MASK } = await load('game/Config.js');

const DT = 1 / 60;
// a corridor across a brick wall: a door in it at tile (5, 3), the leaf along x, hinged on the west
const ROWS = ['XXXXXXXXXXX', ...Array(2).fill('X.........X'), 'XXXXXDXXXXX', ...Array(3).fill('X.........X'), 'XXXXXXXXXXX'];

// just enough of World for doors and walkers: a real physics world
function world() {
  const quiet = new Proxy({}, { get: () => () => {} });
  const w = {
    map: new TileMap(ROWS), events: new EventBus(), time: 0, particles: quiet, chars: [], doors: [], heard: [],
    uses: new Uses(),
    addBody(b) { w.physics.add(b); }, removeBody(b) { w.physics.remove(b); },
    characters() { return w.chars; },
    sound(name) { w.heard.push(name); }, shake() {}, noise() {}, addScore() {}, detachDoor() {},
  };
  w.physics = new PhysicsWorld({ events: w.events, muAt: () => 1, pushForce: PHYSICS.pushForce, substeps: PHYSICS.substeps });
  return w;
}
function door(w, opts = {}) {
  const [l] = doorLeaves(5, 3, 1, true);
  const d = new Door(w, l.hx, l.hy, l.angle, l.len, { cells: [3 * w.map.w + 5], support: l.support, strike: l.strike, ...opts });
  w.doors.push(d);
  return d;
}
// a walker like Character: 80 kg, no spin, his velocity set every step (steer)
function walker(w, x, y) {
  const body = Bodies.circle(x, y, PLAYER.radius, { frictionAir: 0, friction: 0, frictionStatic: 0, restitution: 0,
    collisionFilter: { category: CAT.CHAR, mask: MASK.CHAR } });
  setKg(body, 80);
  Body.setInertia(body, Infinity);
  const c = { body, vel: { x: 0, y: 0 }, alive: true, radius: PLAYER.radius, angle: 0,
    get x() { return body.position.x; }, get y() { return body.position.y; } };
  body.entity = c;
  w.physics.add(body);
  w.chars.push(c);
  c.steer = (dx, dy, speed) => {
    const l = Math.hypot(dx, dy) || 1;
    c.vel.x += ((dx / l) * speed - c.vel.x) * PLAYER.accel; c.vel.y += ((dy / l) * speed - c.vel.y) * PLAYER.accel;
    Body.setVelocity(body, c.vel);
  };
  c.stand = () => { c.vel.x = c.vel.y = 0; Body.setVelocity(body, c.vel); };
  return c;
}
// one step of World's order for these: the leaves leaned on, the physics, the hinges
function frame(w, sys, drive) {
  w.time += DT;
  drive?.();
  sys.prePush(DT);
  w.physics.step(DT, w.time);
  for (const d of w.doors) d.constrain(DT);
}
const run = (w, sys, s, drive) => { for (let i = 0; i < Math.round(s / DT); i++) frame(w, sys, drive); };
// leaf thrown open at `rel` rad, at rest
function openAt(d, rel) {
  Body.setAngle(d.body, d.a0 + rel);
  d.lastA = d.a0 + rel; d.lastRel = rel; d.latched = false;
  d.setSpin(0);
}

test('hinge: the same push gets a heavier leaf going slower, and it slows to a stop without swinging on', () => {
  const kinds = DOORS.kinds, len = 27;
  const light = leafInertia(kinds.wood.kg, -3, len, 6), heavy = leafInertia(kinds.reinforced.kg, -3, len, 6);
  assert.ok(heavy > light * 1.5);
  const c = { nx: 0, ny: 1, x: 18, y: -3 }; // a man south of a leaf along x, at 18 px from the pivot
  const a = pushLeaf(0, 0, 0, light, c, PLAYER.speed, 500, DT), b = pushLeaf(0, 0, 0, heavy, c, PLAYER.speed, 500, DT);
  assert.ok(a.w > 0 && b.w > 0 && b.w < a.w * 0.7, `light ${a.w} heavy ${b.w}`);
  assert.ok(b.keep < a.keep && a.keep < PLAYER.speed, 'he is held to it, the heavier the more');
  // set going at a walker's pace, the hinge stops it: never back the other way, within a quarter turn or so
  for (const [k, I] of [['wood', light], ['reinforced', heavy]]) {
    let w = 2.5 * STEP, rel = 0.3, prev = w, n = 0;
    while (w > 0 && n++ < 600) { rel += w; w = swing(w, rel, I, DT, kinds[k]); assert.ok(w <= prev && w >= 0, 'only ever slower'); prev = w; }
    assert.equal(w, 0, `${k} comes to rest`);
    // a touch of inertia: it goes on a while, but stops well short of a flap
    assert.ok(n < 100 && rel - 0.3 > 0.6 && rel - 0.3 < 1.5, `${k}: stopped in ${n} steps, ${(rel - 0.3).toFixed(2)} rad on`);
  }
  // a stall's leaf is easy, a reinforced one hard
  const stall = leafInertia(kinds.stall.kg, -3, len, 6);
  assert.ok(pushLeaf(0, 0, 0, stall, c, PLAYER.speed, 500, DT).w > a.w);
});

test('door: a man walking into a shut leaf opens it at his pace, held back a moment by its weight', () => {
  const opened = (opts) => {
    const w = world(), d = door(w, opts), sys = new Doors(w), c = walker(w, d.hx + 16, d.hy + 24);
    let slow = Infinity;
    run(w, sys, 0.4, () => { c.steer(0, -1, PLAYER.speed * 0.4); if (Math.abs(d.rel) > 0.02) slow = Math.min(slow, Body.getSpeed(c.body)); });
    return { rel: d.rel, slow, d };
  };
  const wood = opened(), heavy = opened({ kind: 'reinforced' });
  assert.ok(wood.rel < -0.6, `the wooden one swung away from him (${wood.rel})`);
  assert.ok(heavy.rel < 0 && heavy.rel > wood.rel, `the heavier one less far (${heavy.rel} vs ${wood.rel})`);
  assert.ok(heavy.slow < wood.slow, 'it held him back more');
  // left alone, it comes to rest: it does not flap on
  const w = world(), d = door(w), sys = new Doors(w), c = walker(w, d.hx + 16, d.hy + 24);
  run(w, sys, 0.3, () => c.steer(0, -1, PLAYER.speed * 0.5));
  Body.setPosition(c.body, { x: d.hx + 150, y: d.hy + 60 }); c.stand();
  const at = d.rel;
  run(w, sys, 2.5);
  assert.ok(Math.abs(d.spin) < 1e-6, 'at rest');
  assert.ok(Math.sign(d.rel) === Math.sign(at) && Math.abs(d.rel) >= Math.abs(at) - 0.05, 'it went on its way and stopped, no swing back');
  // run into, it bursts open to its stop and stays by it (a short bounce, no swing back across)
  const w2 = world(), d2 = door(w2), sys2 = new Doors(w2), c2 = walker(w2, d2.hx + 16, d2.hy + 24);
  run(w2, sys2, 0.35, () => c2.steer(0, -1, PLAYER.speed));
  Body.setPosition(c2.body, { x: d2.hx + 150, y: d2.hy + 60 }); c2.stand();
  run(w2, sys2, 2.5);
  assert.ok(d2.rel < -(DOORS.stop.swing - 0.35), `by its stop (${d2.rel})`);
});

test('door: kicks and blows slam it open, a round barely turns it, a heavy one a little', () => {
  const after = (dmg, kind) => {
    const w = world(), d = door(w), sys = new Doors(w), m = d.mid();
    d.hit(m.x, m.y, -Math.PI / 2, dmg, kind);
    run(w, sys, 2);
    return Math.abs(d.rel);
  };
  const shot = after(1, 'bullet'), rifle = after(3, 'bullet'), bat = after(1, 'melee'), kick = after(1, 'kick');
  assert.ok(shot < 0.05, `a pistol round ${shot}`);
  assert.ok(rifle > shot && rifle < 0.4, `a 7.62 round ${rifle}`);
  assert.ok(bat > 0.8 && kick > 1.2, `a blow ${bat}, a kick ${kick}`);
});

test('closer: it swings the door back shut within its time and latches, unless someone stands in its arc', () => {
  const w = world(), d = door(w, { closer: true }), sys = new Doors(w);
  openAt(d, 1.5);
  let shutAt = null;
  run(w, sys, 3, () => { if (shutAt === null && d.latched) shutAt = w.time; });
  assert.ok(shutAt !== null && shutAt > 1.2 && shutAt < 2.5, `shut after ${shutAt} s`);
  assert.equal(d.rel, 0);
  assert.ok(w.heard.includes('doorLatch') && w.heard.includes('doorCloserHiss'));
  assert.ok(d.latched);
  // a man in its arc: it comes to rest against him and stays open
  const w2 = world(), d2 = door(w2, { closer: true }), sys2 = new Doors(w2);
  openAt(d2, 1.5);
  const c = walker(w2, d2.hx + 14 * Math.cos(d2.a0 + 0.8), d2.hy + 14 * Math.sin(d2.a0 + 0.8) + 6);
  run(w2, sys2, 4, () => c.stand());
  assert.ok(d2.rel > 0.6 && !d2.latched, `held open at ${d2.rel}`);
  // a heavy thing too (a frozen body: furniture too heavy to shove)
  const w3 = world(), d3 = door(w3, { closer: true }), sys3 = new Doors(w3);
  openAt(d3, 1.5);
  const box = Bodies.rectangle(d3.hx + 20 * Math.cos(d3.a0 + 0.7), d3.hy + 20 * Math.sin(d3.a0 + 0.7), 10, 10, { isStatic: true, collisionFilter: { category: CAT.PROP, mask: MASK.PROP } });
  w3.physics.add(box);
  run(w3, sys3, 4);
  assert.ok(d3.rel > 0.5 && !d3.latched, `held open by the box at ${d3.rel}`);
  // the door without a closer stays where it was left
  const w4 = world(), d4 = door(w4), sys4 = new Doors(w4);
  openAt(d4, 1.2);
  run(w4, sys4, 3);
  assert.ok(Math.abs(d4.rel - 1.2) < 1e-6);
});

test('door: a man against the wall on the far side, by the hinge, never flips the open leaf through the wall to him', () => {
  // (QA level 1 61053: the bar's front door at 30,20 found 2 rad open, past its stop, the bot sneaking by it outside)
  for (const ox of [-20, -14, -8, -4, 2]) {
    const w = world(), d = door(w), sys = new Doors(w), c = walker(w, d.hx + ox, d.hy + 26);
    openAt(d, -0.9);
    d.setSpin(-0.04); // swinging on open, away from him, toward its stop on the north side
    let worst = -Infinity, prev = d.rel, jump = 0;
    run(w, sys, 1.5, () => {
      c.stand();
      worst = Math.max(worst, d.rel);
      jump = Math.max(jump, Math.abs(d.rel - prev));
      prev = d.rel;
    });
    assert.ok(worst <= 0, `${ox}: the leaf stayed on its own side (${worst.toFixed(2)})`);
    assert.ok(jump < 0.2, `${ox}: no jump (${jump.toFixed(2)} rad in a step)`);
    assert.ok(Math.abs(d.rel) <= d.limit() + 1e-6, `${ox}: within its stop (${d.rel.toFixed(2)})`);
  }
});

test('doors: no E on a door (pushed open, its closer shuts it); E is only for the lab\'s doorbell', () => {
  const w = world();
  door(w); door(w, { closer: true });
  new Doors(w);
  assert.equal(w.uses.spots.length, 0);
});

test('lock lamp: red locked, amber while a guard turns his key, green once it turned, green after a burst too', () => {
  const w = world(), d = door(w, { locked: true }), sys = new Doors(w);
  const color = () => d.lamp()?.color;
  assert.equal(d.lampState(), 'locked');
  assert.equal(color(), DOORS.lamp.colors.locked);
  d.unlatch(); // a guard of the house lets himself through (Enemy.follow)
  assert.equal(d.lampState(), 'turning');
  assert.equal(color(), DOORS.lamp.colors.turning);
  run(w, sys, DOORS.lamp.turn + 0.1);
  assert.equal(d.lampState(), 'open');
  assert.equal(color(), DOORS.lamp.colors.open);
  assert.ok(w.heard.includes('lockBeep'));
  d.lock(); // locked again
  assert.equal(color(), DOORS.lamp.colors.locked);
  // the player shoots the lock off: green, and its open way stays
  const m = d.tip();
  for (let i = 0; i < 4 && d.locked; i++) d.hit(m.x - 3, m.y, -Math.PI / 2, 1, 'bullet');
  assert.equal(d.locked, false);
  assert.equal(d.lampState(), 'open');
  assert.ok(d.burst);
  // an electric strike (the lab's door): shut on its latch a while, it locks itself again
  const w3 = world(), d3 = door(w3, { locked: true, relock: 2 }), sys3 = new Doors(w3);
  d3.unlatch();
  run(w3, sys3, 1);
  assert.equal(d3.lampState(), 'open');
  run(w3, sys3, 2);
  assert.equal(d3.lampState(), 'locked');
  // a plain door has no lamp
  const w2 = world();
  assert.equal(door(w2).lamp(), null);
});

test('closer: as it comes shut it overshoots a few degrees, settles in a swing or two, then latches', () => {
  const w = world(), d = door(w, { closer: true }), sys = new Doors(w);
  openAt(d, 1.2);
  let crossings = 0, prev = d.rel, over = 0, latchedAt = null;
  run(w, sys, 4, () => {
    const r = d.rel;
    if (r && prev && Math.sign(r) !== Math.sign(prev)) crossings++;
    if (crossings && !d.latched) over = Math.max(over, Math.abs(r));
    if (r) prev = r;
    if (latchedAt === null && d.latched) latchedAt = w.time;
  });
  assert.ok(crossings >= 1 && crossings <= 4, `swung through shut ${crossings} times`);
  assert.ok(over > 0.02 && over < 0.15, `overshot ${(over * 57.3).toFixed(1)} degrees`);
  assert.ok(latchedAt !== null && latchedAt < 3.2 && d.rel === 0, `latched at ${latchedAt}`);
});

test('swinging doors: a pair of half-leaves pushed either way, back to the middle in a few swings, never latched', () => {
  const pair = (w) => doorLeaves(5, 3, 1, true, true).map((l) => {
    const d = new Door(w, l.hx, l.hy, l.angle, l.len, { kind: 'swing', cells: [3 * w.map.w + 5] });
    w.doors.push(d);
    return d;
  });
  for (const from of [1, -1]) {                       // from the south, then from the north
    const w = world(), [a, b] = pair(w), sys = new Doors(w);
    assert.ok(a.len < 16 && b.len < 16 && a.closer && !a.latched, 'two short leaves on springs');
    const c = walker(w, 5.5 * 32, 3.5 * 32 + from * 30);
    let most = 0, way = 0;
    run(w, sys, 0.6, () => { c.steer(0, -from, PLAYER.speed * 0.5); if (Math.abs(a.rel) > most) { most = Math.abs(a.rel); way = Math.sign(a.rel); } });
    assert.ok(most > 0.8, `pushed open ${most}`);
    // a leaf along +x (a0 0) opens toward -y (rel < 0) pushed from the south, toward +y from the north
    assert.equal(way, -from, 'away from whoever pushed it');
    Body.setPosition(c.body, { x: 9 * 32, y: 1.5 * 32 }); c.stand();
    let crossings = 0, prev = a.rel;
    run(w, sys, 5, () => { if (a.rel && prev && Math.sign(a.rel) !== Math.sign(prev)) crossings++; if (a.rel) prev = a.rel; });
    assert.ok(crossings >= 2, `swung back through the middle ${crossings} times`);
    assert.ok(Math.abs(a.rel) < 0.08 && Math.abs(b.rel) < 0.08 && !a.latched, `back to the middle (${a.rel}, ${b.rel})`);
  }
});

test('kinds: each its sprite and weight; the emergency exit on a closer with its EXIT sign; glass that breaks', () => {
  const w = world();
  const fire = door(w, { kind: 'fire', inside: [0, 1] }), plain = door(w), bar = door(w, { kind: 'bar' });
  assert.ok(fire.kg > plain.kg && fire.closer && !plain.closer && bar.closer);
  const sign = fire.lights().find((l) => l.color === DOORS.exit.color);
  assert.ok(sign && sign.y > fire.hy, 'the EXIT sign glows on the room side');
  assert.equal(fire.lights().length, 1, 'no lock, no lamp');
  // a round through the porthole breaks its glass; one through the wood does not
  const sAt = (x) => ({ x: bar.hx + x, y: bar.hy });
  bar.hit(sAt(24).x, sAt(24).y, -Math.PI / 2, 1, 'bullet');
  assert.equal(bar.glassBroken, false);
  bar.hit(sAt(9).x, sAt(9).y, -Math.PI / 2, 1, 'bullet');
  assert.ok(bar.glassBroken && w.heard.includes('glass'));
});
