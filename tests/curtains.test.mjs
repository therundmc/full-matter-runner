// The velvet curtain as a cloth (engine/physics/Cloth.js, systems/Curtains.js): it hangs still, gives way along
// the way of whoever goes through, heavy (barely carried off, no swing through, still sooner than the light cloth it
// was), clings to him and slips off his back, its rings slide apart and come back, it sleeps and wakes, its steps
// do not depend on the frame rate, and what it hides follows the cloth and whoever it wraps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Cloth } = await load('engine/physics/Cloth.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Curtains } = await load('game/systems/Curtains.js');
const { CURTAIN } = await load('game/data/cloth.js');
const { PROPS } = await load('game/data/props.js');

const { Bodies, Body } = Matter;
const DT = 1 / 60;
const cloth = () => new Cloth({ ...CURTAIN.cloth, len: PROPS.curtain.h });

// a curtain at (200, 200), its rod along y (as level 1's: the doorway is crossed along x), and a world round it
function scene(angle = 0) {
  const prop = { def: PROPS.curtain, dead: false, x: 200, y: 200, body: { angle } };
  const world = { props: [prop], player: null, enemies: [], civilians: [], corpses: [], debris: [], events: new EventBus(), time: 0, heard: [] };
  world.sound = (name) => world.heard.push(name);
  const curtains = new Curtains(world);
  return { world, curtains, c: curtains.list[0] };
}
// a man walking at (vx, vy) px/s from (x, y); move() takes him on by dt
function walker(world, x, y, vx, vy) {
  const body = Bodies.circle(x, y, 10);
  const m = { alive: true, body, get x() { return body.position.x; }, get y() { return body.position.y; } };
  m.move = (dt) => { Body.setPosition(body, { x: body.position.x + vx * dt, y: body.position.y + vy * dt }); Body.setVelocity(body, { x: vx / 60, y: vy / 60 }); };
  world.player = m;
  return m;
}
const run = (s, secs, m) => { for (let t = 0; t < secs; t += DT) { m?.move(DT); s.world.time += DT; s.curtains.update(DT); } };
// the mean of a row's out-of-plane offset (n) and its two middle points' gap along the rod
const rowN = (cl, r) => { let a = 0; for (let c = 0; c < cl.C; c++) a += cl.n[r * cl.C + c]; return a / cl.C; };
const ringGap = (cl) => cl.s[cl.C / 2] - cl.s[cl.C / 2 - 1];

test('curtain: left alone it hangs still where it hung, and a shove dies out at once, hardly a swing', () => {
  const cl = cloth(), s0 = Float64Array.from(cl.s), z0 = Float64Array.from(cl.z);
  for (let i = 0; i < 120; i++) cl.step(DT);
  for (let i = 0; i < cl.s.length; i++) {
    assert.ok(Math.abs(cl.s[i] - s0[i]) < 0.1 && Math.abs(cl.z[i] - z0[i]) < 0.1, `point ${i} stays put`);
  }
  cl.push(0, 0, 0, 200, Infinity); // thrown out of its plane
  let out = 0, back = 0, t = 0;
  for (; t < 12; t += DT) {
    cl.step(DT);
    out = Math.max(out, rowN(cl, cl.R - 1)); back = Math.min(back, rowN(cl, cl.R - 1));
    if (t > 0.2 && cl.energy() < CURTAIN.still) break;
  }
  // the light cloth it was: the hem out 51 px, back through 9 px the other side, still after 3.3 s
  assert.ok(out > 3 && out < 20, `swung out a little (${out.toFixed(1)} px)`);
  assert.ok(back > -2, `barely swings through (${back.toFixed(1)} px)`);
  assert.ok(t < 2.2, `and settles soon (${t.toFixed(2)} s)`);
  for (let i = 0; i < 60 * 4; i++) cl.step(DT);
  assert.ok(Math.abs(rowN(cl, cl.R - 1)) < 0.5, 'back under its rod');
});

test('curtain: a man going through pushes it along his way, parts it, and it falls back', () => {
  const s = scene(), cl = s.c.cloth, m = walker(s.world, 160, 200, 120, 0);
  const gap0 = ringGap(cl);
  run(s, 0.33, m); // his front is past the rod
  assert.ok(rowN(cl, 3) > 3, `bulged along his way (${rowN(cl, 3).toFixed(1)} px)`);
  run(s, 0.12, m);
  assert.ok(ringGap(cl) > gap0 + 3, `the rings slid apart (${gap0.toFixed(1)} -> ${ringGap(cl).toFixed(1)} px)`);
  run(s, 0.5, m); // he is through and away
  run(s, 8);
  assert.ok(Math.abs(ringGap(cl) - gap0) < 0.6, `the rings came back (${ringGap(cl).toFixed(2)} px)`);
  assert.ok(Math.abs(rowN(cl, 3)) < 1, 'hanging straight again');
  assert.ok(s.world.heard.includes(CURTAIN.sound.brush), 'brushed as he went in');
});

test('curtain: it clings to a man pushing through and slips off his back, not thrown off him', () => {
  const s = scene(), cl = s.c.cloth, m = walker(s.world, 160, 200, 90, 0);
  let first = -1, last = -1, t = 0;
  for (; m.x < 220; t += DT) {
    m.move(DT); s.world.time += DT; s.curtains.update(DT);
    if (cl.touched === null) continue;
    if (first < 0) first = t;
    last = t;
    if (m.x > 204) assert.ok(rowN(cl, 3) > 2, `dragged along with him (${rowN(cl, 3).toFixed(1)} px)`);
  }
  // the light cloth slid off him in 0.17 s, before he was half through
  assert.ok(last - first > 0.22, `on him for ${(last - first).toFixed(2)} s`);
  assert.ok(first >= 0 && 160 + 90 * (last + DT) > 204, 'still on him once he is half through');
  assert.ok(last < t - 0.1, 'and off him before he is clear of it');
});

test('curtain: a runner barely carries it off, and it does not fly on once he is gone', () => {
  const s = scene(), cl = s.c.cloth, m = walker(s.world, 160, 200, 177, 0);
  let most = 0, free = -1, after = 0;
  for (let t = 0; t < 3; t += DT) {
    m.move(DT); s.world.time += DT; s.curtains.update(DT);
    let row = 0;
    for (let r = 1; r < cl.R; r++) row = Math.max(row, Math.abs(rowN(cl, r)));
    most = Math.max(most, row);
    if (t < 0.3 || cl.touched) continue;
    if (free < 0) free = row;
    after = Math.max(after, row - free);
  }
  // the light cloth: a row 23 px into the room, 12 px of it flown on after he left it
  assert.ok(most < 14, `carried ${most.toFixed(1)} px into the room`);
  assert.ok(after < 2, `flew on ${after.toFixed(1)} px once let go`);
});

test('curtain: the other way round, and turned with its prop', () => {
  const s = scene(Math.PI / 2), cl = s.c.cloth, m = walker(s.world, 200, 240, 0, -120); // rod along x, crossed going up
  run(s, 0.36, m);
  // its normal is the prop's angle: (0, 1) here, so walking up (-y) pushes it to -n
  assert.ok(rowN(cl, 2) < -3, `bulged along his way (${rowN(cl, 2).toFixed(1)} px)`);
});

test('curtain: it sleeps when still with nobody near, and wakes at a touch', () => {
  const s = scene();
  run(s, 1.5);
  assert.equal(s.c.awake, false, 'nobody near: asleep');
  const v = s.c.cloth.version;
  run(s, 0.5);
  assert.equal(s.c.cloth.version, v, 'asleep, not stepped');
  const m = walker(s.world, 150, 200, 120, 0);
  run(s, 0.2, m);
  assert.equal(s.c.awake, false, 'still asleep while he comes up to it');
  run(s, 0.2, m);
  assert.equal(s.c.awake, true, 'awake at his touch');
  s.world.player = null;
  run(s, 12);
  assert.equal(s.c.awake, false, 'asleep again once he has gone and it is still');
  s.world.events.emit('round', { x0: 150, y0: 205, x1: 260, y1: 195 });
  assert.equal(s.c.awake, true, 'a round through it wakes it');
  run(s, 0.1);
  assert.ok(Math.abs(rowN(s.c.cloth, 2)) > 0.05, 'and flicks it');
});

test('curtain: one step of 2 dt is two of dt', () => {
  const a = cloth(), b = cloth();
  for (const cl of [a, b]) cl.push(0, 0, 40, 150, Infinity);
  for (let i = 0; i < 30; i++) { a.step(2 * DT); b.step(DT); b.step(DT); }
  for (let i = 0; i < a.s.length; i++) {
    assert.ok(Math.abs(a.s[i] - b.s[i]) + Math.abs(a.n[i] - b.n[i]) + Math.abs(a.z[i] - b.z[i]) < 1e-6, `point ${i}`);
  }
  const c = cloth(), d = cloth();
  for (const cl of [c, d]) cl.push(0, 0, 0, 150, Infinity);
  for (let i = 0; i < 40; i++) { c.step(DT * 1.3); for (let k = 0; k < 13; k++) d.step(DT / 10); }
  for (let i = 0; i < c.s.length; i++) assert.ok(Math.abs(c.n[i] - d.n[i]) < 0.05, `uneven frames, point ${i}`);
});

test('curtain: a man through it at 30 frames a second moves it as at 60', () => {
  const most = (dt) => {
    const s = scene(), cl = s.c.cloth, m = walker(s.world, 160, 200, 120, 0);
    let out = 0, on = 0;
    for (let t = 0; t < 1.5; t += dt) {
      m.move(dt); s.world.time += dt; s.curtains.update(dt);
      out = Math.max(out, rowN(cl, 3));
      if (cl.touched) on += dt;
    }
    return { out, on };
  };
  const a = most(DT), b = most(2 * DT);
  assert.ok(Math.abs(a.out - b.out) < 0.15 * a.out, `bulge ${a.out.toFixed(1)} / ${b.out.toFixed(1)} px`);
  assert.ok(Math.abs(a.on - b.on) < 0.05, `on him ${a.on.toFixed(2)} / ${b.on.toFixed(2)} s`);
});

test('curtain: it hides what is beyond at rest, not through a wide parting', () => {
  const s = scene(), cl = s.c.cloth;
  const seen = () => !s.curtains.blocks(150, 200, 250, 200);
  assert.equal(seen(), false, 'straight through the middle, at rest');
  assert.equal(seen(), !s.curtains.blocks(150, 203, 250, 197), 'a slant just the same');
  assert.equal(s.curtains.blocks(150, 260, 250, 260), false, 'beside it');
  // parted by a man standing in it: wider than the gap that hides
  const m = walker(s.world, 200, 200, 0, 0);
  m.move = () => {};
  run(s, 0.5, m);
  const r = CURTAIN.cloth.sight.rows[0], C = cl.C, gap = cl.s[r * C + C / 2] - cl.s[r * C + C / 2 - 1];
  assert.ok(gap > CURTAIN.cloth.sight.gap, `parted ${gap.toFixed(1)} px`);
  assert.equal(cl.blocks(3, -50, -3, 50), false, 'seen through the gap');
  assert.equal(seen(), true, 'and him in it');
  // a narrow parting still hides
  s.world.player = null;
  run(s, 8);
  assert.equal(seen(), false, 'fallen back: hidden again');
});

test('curtain: a man pushing through is seen from beyond while it clings to him in the doorway, not before', () => {
  const s = scene(), m = walker(s.world, 160, 200, 90, 0);
  const seen = () => !s.curtains.blocks(260, 200, m.x, m.y); // a guard on the far side looking at him
  let before = false, during = 0, frames = 0;
  for (let t = 0; t < 0.8; t += DT) {
    m.move(DT); s.world.time += DT; s.curtains.update(DT);
    if (m.x < 185) before ||= seen();
    if (!s.c.cloth.touched || Math.abs(m.x - 200) >= CURTAIN.person.r) continue;
    frames++;
    if (seen()) during++;
  }
  assert.equal(before, false, 'hidden while he comes up to it');
  assert.ok(frames > 10 && during === frames, `seen every frame it is on him (${during} / ${frames})`);
  assert.equal(s.curtains.blocks(260, 230, 140, 230), false, 'nothing hidden beside it');
  assert.equal(s.curtains.blocks(260, 196, 140, 204), false, 'nor straight through the parting he left');
});

test('curtain: something thrown through hard tears it, a man walking never does', () => {
  const s = scene(), cl = s.c.cloth;
  run(s, 0.4, walker(s.world, 150, 200, 177, 0));
  assert.equal(cl.cut.some((v) => v), false, 'a runner does not tear it');
  const t = scene(), body = Bodies.circle(160, 196, 7);
  t.world.corpses.push({ dead: false, body });
  for (let i = 0; i < 20; i++) {
    Body.setPosition(body, { x: body.position.x + 700 * DT, y: 196 }); Body.setVelocity(body, { x: 700 / 60, y: 0 });
    t.world.time += DT; t.curtains.update(DT);
  }
  assert.ok(t.c.cloth.cut.some((v) => v), 'a body flung through tears it');
  assert.ok(t.world.heard.includes(CURTAIN.sound.whoosh), 'with a whoosh');
});
