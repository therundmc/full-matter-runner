import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: entities only need canvases to exist, nothing is looked at here
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: Tipping, lieAt } = await load('game/systems/Tipping.js');
const { PROPS } = await load('game/data/props.js');
const { setKg } = await load('engine/physics/Body.js');

const { Bodies, Body } = Matter;
const T = PROPS.trash_can.tips;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// a yard walled round, 10 x 8 tiles
const ROWS = ['XXXXXXXXXX', ...Array(6).fill('X........X'), 'XXXXXXXXXX'];

// just enough of World for a prop: real map and event bus, timers run by hand, what it makes counted
function world() {
  const quiet = new Proxy({}, { get: () => () => {} });
  const w = {
    map: new TileMap(ROWS), events: new EventBus(), time: 0, particles: quiet, decals: quiet, smoke: quiet,
    props: [], debris: [], chars: [], enemies: [], timers: [], heard: [], noises: [], sheets: 0, bodies: new Set(),
    physics: { freezeIfHeavy() {} },
    papers: { drop(x, y, n) { w.sheets += n; } },
    addBody(b) { this.bodies.add(b); }, removeBody(b) { this.bodies.delete(b); },
    addDebris(d) { this.debris.push(d); }, removeDebris(d) { this.debris = this.debris.filter((o) => o !== d); },
    shake() {}, light() {}, emit() {}, flashGlass() {},
    noise(x, y, radius, source, type) { this.noises.push(type); },
    sound(name) { this.heard.push(name); },
    after(sec, fn) { this.timers.push(fn); },
    run() { while (this.timers.length) this.timers.shift()(); },
  };
  return w;
}
// a bin standing in the middle of the yard
function bin(w, x = 160, y = 128) {
  const p = new Prop(w, 'trash_can', x, y);
  w.props.push(p);
  return p;
}
// something running into it: a body of kg at (x, y) moving at v px/step along a
function mover(w, x, y, kg, v, a, entity = {}) {
  const b = Bodies.circle(x, y, 10);
  setKg(b, kg);
  Body.setVelocity(b, { x: Math.cos(a) * v, y: Math.sin(a) * v });
  b.entity = entity;
  return b;
}
const lying = (p) => p.body.vertices.length === 4;
const bags = (w) => w.props.filter((p) => p.type === 'bin_bag').length;

test('tipping: a blow knocks a street bin over the way it was struck, its mouth away from the hitter', () => {
  for (const a of [0, Math.PI / 2, 2.4]) {
    const w = world(), p = bin(w);
    p.hit(1, p.x - Math.cos(a) * 7, p.y - Math.sin(a) * 7, a, 2.5, 'blunt');
    assert.ok(p.tipped && !p.dead && !p.dying, 'down, not broken');
    assert.ok(lying(p), 'its body is the can lying');
    assert.ok(near(p.body.angle, a), 'base toward the hitter, mouth away');
    assert.ok(w.bodies.has(p.body));
    assert.equal(p.hp, PROPS.trash_can.hp);
    assert.ok(w.noises.includes('clatter'), 'the guards hear it');
  }
});

test('tipping: the lid rolls off and the rubbish spills out once; more hits only ring and roll it', () => {
  const w = world(), p = bin(w);
  p.hit(1, p.x, p.y - 7, Math.PI / 2, 1, 'bullet');
  assert.equal(w.debris.length, 1, 'the lid');
  assert.ok(w.debris[0].body.circleRadius > 0);
  w.run();
  const spilled = w.debris.length, sheets = w.sheets, bag = bags(w);
  assert.ok(spilled > 1 + 2, 'cans, scraps... out of the mouth');
  assert.ok(sheets >= 4 && bag >= 1);
  // shot again and again, kicked: dented, rolled, never emptied twice or broken
  for (let i = 0; i < 12; i++) p.hit(1, p.x + 9, p.y, Math.PI, i % 2 ? 1 : 2.5, i % 2 ? 'bullet' : 'punch');
  w.run();
  assert.ok(p.tipped && !p.dead && !p.dying);
  assert.equal(p.hp, PROPS.trash_can.hp);
  assert.equal(w.sheets, sheets);
  assert.equal(bags(w), bag);
  assert.equal(w.heard.filter((n) => n === 'binTip').length, 1);
  assert.ok(Math.hypot(p.body.velocity.x, p.body.velocity.y) > 0, 'it rolls');
});

test('tipping: only a blast wrecks it, standing or lying, and a lying one has nothing left to spill', () => {
  const w = world(), p = bin(w);
  p.break(0.5, 3);
  w.run();
  assert.ok(p.dead && !p.tipped, 'right by an explosion: torn apart where it stands');
  const w2 = world(), q = bin(w2);
  q.hit(1, q.x - 7, q.y, 0, 1, 'bullet');
  w2.run();
  const sheets = w2.sheets, bag = bags(w2);
  for (let i = 0; i < 6 && !q.dead && !q.dying; i++) q.hit(1, q.x, q.y, 0, 1.4, 'blast');
  w2.run();
  assert.ok(q.dead || q.dying, 'a blast gets the better of it lying');
  assert.equal(w2.sheets, sheets);
  assert.equal(bags(w2), bag);
});

test('tipping: walked into it only rocks; a run, a body thrown or a car knock it over, a car at speed flattens it', () => {
  const w = world(), p = bin(w);
  new Tipping(w);
  // a guard walking by: it rocks on its base
  w.events.emit('impact', { a: p.body, b: mover(w, p.x - 15, p.y, 80, 1, 0, { isEnemy: true }), speed: 1 });
  w.run();
  assert.ok(!p.tipped && p.kick.vx > 0, 'rocks');
  // something light, however fast (a thrown bottle)
  w.events.emit('impact', { a: mover(w, p.x - 15, p.y, 0.5, 6, 0), b: p.body, speed: 6 });
  w.run();
  assert.ok(!p.tipped);
  // the player running into it, along his run
  const a = -0.6;
  w.events.emit('impact', { a: mover(w, p.x - 15, p.y, 80, 2.95, a, { isPlayer: true }), b: p.body, speed: 2.95 });
  assert.ok(!p.tipped, 'after the physics step');
  w.run();
  assert.ok(p.tipped && near(p.body.angle, a));
  // a car at speed into the can lying there
  w.events.emit('impact', { a: p.body, b: mover(w, p.x - 30, p.y, 1200, 1, 0, { isVehicle: true }), speed: 1 });
  w.run();
  assert.ok(!p.dying && !p.dead, 'a car crawling by only pushes it');
  w.events.emit('impact', { a: p.body, b: mover(w, p.x - 30, p.y, 1200, T.wreck + 1, 0, { isVehicle: true }), speed: T.wreck + 1 });
  w.run();
  assert.ok(p.dying || p.dead);
});

test('tipping: against a wall it lies clear of it; a level keeps one indoors standing', () => {
  const w = world();
  const blocked = (x, y) => w.map.solidAt(x, y);
  // right against the north wall (row 0), sent north
  const at = lieAt(160, 32 + 8, -Math.PI / 2, T.body, blocked);
  const c = Math.cos(at.a), s = Math.sin(at.a);
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const lx = (u * T.body[0]) / 2, ly = (v * T.body[1]) / 2;
    assert.ok(!blocked(at.x + lx * c - ly * s, at.y + lx * s + ly * c), 'no corner in the wall');
  }
  // in the open it keeps to the blow
  assert.ok(near(lieAt(160, 128, 1, T.body, blocked).a, 1));
  // { tips: false } (Level.js): it takes the hits like any other prop
  const p = bin(w);
  p.noTip = true;
  p.hit(1, p.x - 7, p.y, 0, 1, 'bullet');
  assert.ok(!p.tipped && p.hp < PROPS.trash_can.hp);
});
