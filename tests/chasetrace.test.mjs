// THE CHASE, STEP FOR STEP: scripted runs of level 2A (its real map, props, route and events; Drive, Pursuit,
// Lorries, Toll and ChaseCam stepped in World.step's order), both dice seeded (Math.random and world.rng), his
// car's and every pursuer's place, angle and state hashed every step and compared with a recorded trace
// (tests/fixtures/chase-trace.json). A refactor of the chase code must leave it identical. A deliberate change of
// behaviour records it again: CHASE_TRACE_RECORD=1 node --test tests/chasetrace.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { load } from './setup.mjs';
import { ctx, quiet } from './helpers.mjs';

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Toll, laneY } = await load('game/systems/Toll.js');
const { default: Drive } = await load('game/systems/Drive.js');
const { default: Pursuit } = await load('game/systems/Pursuit.js');
const { default: Lorries } = await load('game/systems/Lorries.js');
const { default: ChaseCam } = await load('game/systems/ChaseCam.js');
const { makeRng } = await load('game/systems/Rng.js');
const { seeded, hashString } = await load('engine/math.js');
const { CHASE } = await load('game/data/chase.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: level2a } = await load('game/data/levels/level2a.js');

const { Bodies } = Matter;
const DT = 1 / 60;
const C = level2a.chase;
const SIZE = { car: [140, 58], car2: [134, 56], van: [160, 64], pursuer: [140, 58], convertible: [172, 64] };
const FIXTURE = new URL('./fixtures/chase-trace.json', import.meta.url);

function vehicle(w, model, x, y, a = 0) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model], [W, H] = SIZE[model];
  const body = Bodies.rectangle(x, y, W - 4, H - 4, {
    angle: a, frictionAir: 0.02, friction: 0.6, restitution: 0.05, label: 'vehicle',
    collisionFilter: { category: CAT.PROP, mask: MASK.PROP },
  });
  setMaterial(body, m.kg, 0.9);
  scaleInertia(body, 3);
  body.material = 'metal';
  body.entity = v;
  Object.assign(v, {
    world: w, type: model, m, k: 1, w: W, h: H, body, isVehicle: true, g: ctx, glassPx: { wind: [], rear: [] },
    windows: { wind: 0, rear: 0 }, tires: [true, true, true, true], lamps: [true, true, true, true], hp: m.hp, fuel: 0,
    puddle: 0, alarm: 0, lit: true, flash: 0, moving: false, dead: false, exploded: false, burning: false, rider: null,
    hat: false, gun: false, drawn: null, def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.physics.freezeIfHeavy(body);
  w.props.push(v);
  return v;
}

Pursuit.prototype.spawn = function (x, y, a, state, speed = 0, style = undefined) {
  const car = this.add(vehicle(this.world, 'pursuer', x, y, a), state, { speed, style });
  if (state !== 'wait') this.loose(car);
  return car;
};

// just enough of World for the chase on level 2A's real map, its props from col c0 to c1, the dice seeded
function world(c0, c1, seed) {
  const events = new EventBus(), physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const map = new TileMap(level2a.tiles);
  physics.add(map.buildBodies());
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const w = {
    map, physics, events, chars: [], props: [], corpses: [], projectiles: [], debris: [], items: [], windows: [], doors: [], rings: [],
    texts: [], time: 0, particles: quiet, decals: quiet, papers: quiet, smoke: quiet, camera: quiet, killed: null, kills: [],
    exited: false, cleared: false, drive: null, totalEnemies: 0, game: { onExit() {}, flash() {} }, rng: makeRng(seed),
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), sound() {}, shake() {}, noise() {}, light() {},
    addDebris() {}, removeDebris() {}, flashGlass() {}, hitstop() {}, emit() {}, damageWall() {}, after() {},
    addProjectile(p) { w.projectiles.push(p); }, onKill(ch, cause, killer) { w.killed = { ch, cause, killer }; },
  };
  w.player = {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', reloading: 0, reloadDur: 1, world: w,
    invulnerable: true, weapon: null, ammo: {}, get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; },
    kill(a, cause, killer) { this.alive = false; w.onKill(this, cause, killer); },
  };
  w.chars.push(w.player);
  for (const [type, col, row, deg = 0] of level2a.props) {
    if (VEHICLES[type] || col < c0 || col > c1) continue;
    w.props.push(new Prop(w, type, col * TILE, row * TILE, (deg * Math.PI) / 180));
  }
  // (the parked cars of the stretch: shoved aside, flanked in the bend)
  for (const [type, col, row, deg = 0] of level2a.props) {
    if (!VEHICLES[type] || col < c0 || col > c1) continue;
    vehicle(w, type, col * TILE, row * TILE, (deg * Math.PI) / 180);
  }
  events.on('kill', (e) => w.kills.push(e));
  return w;
}

const keys = () => {
  const held = new Set(), pressed = new Set();
  return { held, pressed, down: (c) => held.has(c), hit: (c) => pressed.delete(c), mouseHit: () => false, mouseDown: () => false };
};

// his convertible at col, row, the seat's gun taken in the beat, the whole chase from there on
function start(col, row, seed, c1) {
  const w = world(col - 4, c1, seed), v = vehicle(w, CHASE.vehicle, col * TILE, row * TILE);
  v.gun = true;
  const chase = { ...C, intro: null, water: null, van: [col, row] };
  w.drive = new Drive(w, chase, v);
  w.toll = Toll.of(w, level2a);
  w.pursuit = new Pursuit(w, { ...chase, events: C.events.filter((e) => e.kind !== 'lorry' || e.at >= col) });
  w.lorries = new Lorries(w, { events: C.events.filter((e) => e.kind === 'lorry' && e.at >= col) });
  w.chaseCam = new ChaseCam(w);
  return { w, v, d: w.drive, P: w.pursuit, input: keys() };
}

// the script: the wheel over one way then the other, a shove every 2.5 s at alternate sides, through a toll's plaza
// down its guide; his rounds at set steps: a gunman shot, a front tyre, a windscreen burst
function script(s, i) {
  const { w, d, P, input, v } = s;
  input.held.clear();
  const g = w.toll?.guide(v.x, v.y);
  if (g) {
    const u = Math.abs(d.u), stop = (30 * u * u) / CHASE.pull + 4;
    if (Math.abs(g.y - v.y) > stop) input.held.add(g.y < v.y ? 'KeyW' : 'KeyS');
  } else {
    const k = i % 240;
    if (k < 24) input.held.add('KeyW');
    else if (k >= 120 && k < 144) input.held.add('KeyS');
  }
  const aim = { x: v.x + 60, y: v.y + (Math.floor(i / 150) % 2 ? 120 : -120) };
  if (i % 150 === 75) input.pressed.add('Space');
  const live = P.cars.filter((c) => !c.dummy && ['chase', 'limp', 'cross'].includes(c.state));
  if (i % 300 === 200 && live[0]?.gunman) {
    const gp = P.gunPoint(live[0]);
    w.events.emit('round', { x0: gp.x - 40, y0: gp.y - 40, x1: gp.x + 40, y1: gp.y + 40, owner: w.player });
  }
  if (i % 420 === 380 && live.length) w.events.emit('carPart', { car: live[live.length - 1].v, part: 'tyre', i: 2, kind: 'uzi' });
  if (i % 420 === 190 && live.length > 1) {
    const car = live[1].v;
    car.windows.wind = 9;
    w.events.emit('carPart', { car, part: 'wind', i: 0, kind: 'uzi' });
  }
  return aim;
}

// World.step's order; every step hashed: his car, the pursuers, the lorries, the tell and the attack
function trace(s, steps) {
  const { w, d, P, input, v } = s;
  const n = (x) => (Number.isFinite(x) ? String(x) : String(x));
  const hashes = [], samples = [];
  for (let i = 0; i < steps; i++) {
    w.time += DT;
    const aim = script(s, i);
    d.step(DT, input, aim);
    P.step(DT);
    w.lorries.step(DT);
    w.toll?.step(DT);
    w.chaseCam.step();
    w.physics.step(DT, w.time);
    for (const p of w.props) if (p.update && !p.isVehicle) p.update(DT);
    d.after(DT);
    P.after(DT);
    w.chaseCam.update(DT);
    w.props = w.props.filter((p) => !p.dead);
    const b = v.body, row = [b.position.x, b.position.y, b.angle, d.v, d.u, d.slip, d.legI, d.dead, d.far];
    for (const c of P.cars) row.push(c.n, c.state, c.slot, c.v.body.position.x, c.v.body.position.y, c.v.body.angle, c.s, c.driver, c.gunman);
    for (const L of w.lorries.list) row.push(L.state, L.p.body.position.x, L.p.body.position.y);
    row.push(P.tell?.car.n ?? -1, P.tell?.t ?? -1, P.attack?.car.n ?? -1, P.attack?.kind ?? '', P.turn, w.kills.length, w.exited);
    const str = row.map(n).join(',');
    hashes.push(hashString(str).toString(16));
    if (i % 60 === 0) samples.push([i, str]);
  }
  return { hashes, samples };
}

// a run with both dice seeded (Math.random given back after)
function run(col, row, seed, c1, steps) {
  const real = Math.random;
  Math.random = seeded(seed * 7919 + 1);
  try {
    return trace(start(col, row, seed, c1), steps);
  } finally {
    Math.random = real;
  }
}

const RUNS = {
  // from the start: the grab, the alley car, the three from behind, the lorry (20 s)
  street: () => run(C.van[0], C.van[1], 2, 380, 1200),
  // the lorry backing across the street, the second alley car, up to the bend (20 s)
  lorry: () => run(280, C.lanes[1], 3, 445, 1200),
  // the bend onto the on-ramp, the two lanes opening to four, the toll's plaza and its two (20 s)
  ramp: () => run(420, C.lanes[1], 1, 700, 1200),
};

const recorded = (() => { try { return JSON.parse(readFileSync(FIXTURE, 'utf8')); } catch { return null; } })();

if (process.env.CHASE_TRACE_RECORD) {
  test('chase trace: recorded', () => {
    const out = {};
    for (const [k, f] of Object.entries(RUNS)) out[k] = f();
    writeFileSync(FIXTURE, JSON.stringify(out) + '\n');
  });
} else {
  for (const [k, f] of Object.entries(RUNS)) {
    test(`chase trace: the ${k} run is the recorded one, step for step`, () => {
      assert.ok(recorded?.[k], 'a recorded trace (CHASE_TRACE_RECORD=1 to make it)');
      const got = f(), want = recorded[k];
      assert.equal(got.hashes.length, want.hashes.length);
      const i = got.hashes.findIndex((h, j) => h !== want.hashes[j]);
      if (i >= 0) {
        const s = Math.floor(i / 60), at = (t) => t.samples[s]?.[1];
        assert.fail(`step ${i} differs (second ${s}: recorded ${at(want)} / now ${at(got)})`);
      }
    });
  }
}
