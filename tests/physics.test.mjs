import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { Bodies, Body } = Matter;
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, impulse, kgOf } = await load('engine/physics/Body.js');
const { stoppingDistance } = await load('engine/physics/Friction.js');
const { fromMps } = await load('engine/physics/Units.js');

const DT = 1 / 60;
function run(phys, seconds, t0 = 0) {
  let t = t0;
  for (let i = 0; i < Math.round(seconds / DT); i++) { t += DT; phys.step(DT, t); }
  return t;
}

test('sliding object stops after v2/(2*mu*g), not drifting forever', () => {
  const phys = new PhysicsWorld({ muAt: () => 1, substeps: 2 });
  const b = Bodies.rectangle(0, 0, 12, 12, { frictionAir: 0 }); // floor friction only
  phys.add(b);
  setMaterial(b, 6, 0.5);
  const v = fromMps(5); // 5 m/s
  Body.setVelocity(b, { x: v, y: 0 });
  run(phys, 3);
  const expected = stoppingDistance(v, 0.5);
  assert.equal(Body.getSpeed(b), 0);
  assert.ok(Math.abs(b.position.x - expected) / expected < 0.12, `slid ${b.position.x.toFixed(1)} px, expected ~${expected.toFixed(1)}`);
});

test('grippier floor = shorter slide', () => {
  const slide = (grip) => {
    const phys = new PhysicsWorld({ muAt: () => grip });
    const b = Bodies.rectangle(0, 0, 12, 12);
    phys.add(b);
    setMaterial(b, 6, 0.5);
    Body.setVelocity(b, { x: 4, y: 0 });
    run(phys, 3);
    return b.position.x;
  };
  assert.ok(slide(1.5) < slide(1) && slide(1) < slide(0.75));
});

test('impulse is shared out by mass', () => {
  const chair = Bodies.rectangle(0, 0, 11, 11);
  const table = Bodies.rectangle(0, 0, 38, 22);
  setMaterial(chair, 6, 0.5);
  setMaterial(table, 40, 0.5);
  const dvChair = impulse(chair, 0, 30, 0, 100);
  const dvTable = impulse(table, 0, 30, 0, 100);
  assert.ok(Math.abs(dvChair / dvTable - 40 / 6) < 0.01);
  assert.ok(Math.abs(kgOf(chair) - 6) < 1e-9);
});

test('heavy objects freeze, ignore small hits and wake up on big ones, then settle again', () => {
  const phys = new PhysicsWorld({ muAt: () => 1, pushForce: 520 });
  const car = Bodies.rectangle(0, 0, 72, 32);
  phys.add(car);
  setMaterial(car, 1200, 0.9);
  phys.freezeIfHeavy(car);
  assert.equal(car.isStatic, true);
  impulse(car, 0, 100);                 // a bullet's worth
  assert.equal(car.isStatic, true);
  impulse(car, 0, 2400, 0, 12);         // an explosion
  assert.equal(car.isStatic, false);
  run(phys, 2);
  assert.equal(car.isStatic, true, 'came back to rest and froze again');
  assert.ok(car.position.x > 0);
});

test('light objects stay pushable', () => {
  const phys = new PhysicsWorld({ muAt: () => 1, pushForce: 520 });
  const chair = Bodies.rectangle(0, 0, 11, 11);
  phys.add(chair);
  setMaterial(chair, 6, 0.55);
  phys.freezeIfHeavy(chair);
  assert.equal(chair.isStatic, false);
  assert.ok(phys.breakaway(chair) < 50); // static friction: 1.25 x mu.kg.g
});

test('fast bodies do not tunnel through a 1 m wall', () => {
  const phys = new PhysicsWorld({ muAt: () => 0.01 });
  const wall = Bodies.rectangle(100, 0, 32, 200, { isStatic: true });
  const ball = Bodies.circle(0, 0, 3);
  phys.add([wall, ball]);
  setMaterial(ball, 1, 0.1);
  Body.setVelocity(ball, { x: 22, y: 0 }); // the cap used for blast debris
  run(phys, 1);
  assert.ok(ball.position.x < 84, `ball at ${ball.position.x}`);
});

test('collisions emit impact events with a closing speed', () => {
  const events = new EventBus();
  const impacts = [];
  events.on('impact', (e) => impacts.push(e));
  const phys = new PhysicsWorld({ events, muAt: () => 0.01 });
  const wall = Bodies.rectangle(60, 0, 32, 100, { isStatic: true });
  const box = Bodies.rectangle(0, 0, 10, 10);
  phys.add([wall, box]);
  setMaterial(box, 5, 0.1);
  Body.setVelocity(box, { x: 5, y: 0 });
  run(phys, 1);
  assert.ok(impacts.length >= 1);
  assert.ok(impacts[0].speed > 3, `speed ${impacts[0].speed}`);
});
