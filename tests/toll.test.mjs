// THE TOLL (level 2A's event 3, docs/LEVEL2.md; systems/Toll.js, CHASE.toll; the lab's station 37): leg 1's two lanes
// open to four and on to the plaza with no bend (the car goes on in its row, the view eased across), a gate at the
// end of each lane (a wooden arm torn off at a small cost, a steel boom: nose-on the crash), each told by its lane's
// signal and the chase's tells 1.5 s out; a pursuer sent the wrong way wrecks on a boom, another follows him through
// an arm. Drive, Pursuit and Toll on the real map and props of level 2A.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: what the cars paint on themselves goes nowhere
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Toll, laneY, nearestLane, woodFor, steelFor, reach, mouthX, onBoom } = await load('game/systems/Toll.js');
const { default: Drive } = await load('game/systems/Drive.js');
const { default: Pursuit } = await load('game/systems/Pursuit.js');
const { default: ChaseCam, gatesIn, tollCommitted } = await load('game/systems/ChaseCam.js');
const { SHOTS } = await load('game/data/staging.js');
const { whole } = await load('game/systems/Direction.js');
const { legsOf, legAt } = await load('game/systems/Route.js');
const { CHASE } = await load('game/data/chase.js');
const { PROPS } = await load('game/data/props.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: level2a } = await load('game/data/levels/level2a.js');
const { default: lab } = await load('game/data/levels/lab.js');

const { Bodies } = Matter;
const DT = 1 / 60;
const quiet = new Proxy({}, { get: () => () => {} });
const C = level2a.chase, T = C.toll, GX = T.at * TILE;
const SIZE = { pursuer: [140, 58], convertible: [172, 64] };

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

// just enough of World for the chase on the real map of level 2A, its props from col c0 to c1
function world(c0, c1) {
  const events = new EventBus(), physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const map = new TileMap(level2a.tiles);
  physics.add(map.buildBodies());
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const w = {
    map, physics, events, chars: [], props: [], corpses: [], projectiles: [], debris: [], items: [], windows: [], doors: [], rings: [],
    texts: [], time: 0, particles: quiet, decals: quiet, papers: quiet, smoke: quiet, camera: quiet, killed: null, kills: [], told: [],
    exited: false, cleared: false, drive: null, totalEnemies: 0, game: { onExit() {}, flash() {} },
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), sound() {}, shake() {}, noise() {}, light() {},
    addDebris() {}, removeDebris() {}, flashGlass() {}, hitstop() {}, emit() {}, damageWall() {}, after() {},
    addProjectile(p) { w.projectiles.push(p); }, onKill(ch, cause, killer) { w.killed = { ch, cause, killer }; },
  };
  w.player = {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', reloading: 0, reloadDur: 1, world: w,
    weapon: { type: 'uzi', mag: 30 }, ammo: {}, get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; },
    kill(a, cause, killer) { this.alive = false; w.onKill(this, cause, killer); },
  };
  w.chars.push(w.player);
  for (const [type, col, row, deg = 0] of level2a.props) {
    if (VEHICLES[type] || col < c0 || col > c1) continue;
    w.props.push(new Prop(w, type, col * TILE, row * TILE, (deg * Math.PI) / 180));
  }
  events.on('kill', (e) => w.kills.push(e));
  for (const k of ['tollGate', 'pursuerWreck', 'chaseBeat', 'tollCrash']) events.on(k, (e) => w.told.push({ k, ...e }));
  return w;
}

const keys = () => { const held = new Set(), pressed = new Set(); return { held, pressed, down: (c) => held.has(c), hit: (c) => pressed.delete(c), mouseHit: () => false, mouseDown: () => false }; };

// his convertible at col, row going `speed` px/step, the toll, the pursuit (`events`: the level's from col on)
function start(col, row, { speed = null, events = [] } = {}) {
  const w = world(col - 4, T.at + 40), v = vehicle(w, CHASE.vehicle, col * TILE, row * TILE);
  const chase = { ...C, events, intro: null, arms: null, water: null };
  w.drive = new Drive(w, { ...chase, van: [col, row] }, v);
  if (speed !== null) w.drive.v = speed;
  w.toll = Toll.of(w, level2a);
  w.pursuit = new Pursuit(w, chase);
  w.chaseCam = new ChaseCam(w);
  return { w, v, d: w.drive, P: w.pursuit, input: keys() };
}

// World.step's order; `steer`: his wheel held toward the toll's way through (its guide, as the QA robot does; a
// number: down that lane, by its index)
function run(s, sec, { each = null, steer = false } = {}) {
  const { w, d, P, input, v } = s;
  for (let t = 0; t < sec; t += DT) {
    w.time += DT;
    if (steer !== false) {
      const g = w.toll.guide(v.x, v.y), y = typeof steer === 'number' ? laneY(T, steer, v.x + d.v * 18) : g?.y;
      input.held.clear();
      // (let go before it: the road's pull takes the sideways speed off, 30 u2 / pull px further on)
      const u = Math.abs(d.u), stop = (30 * u * u) / CHASE.pull + 4;
      if (y !== undefined && Math.abs(y - v.y) > stop) input.held.add(y < v.y ? 'KeyW' : 'KeyS');
    }
    d.step(DT, input, null);
    P.step(DT);
    w.toll.step(DT);
    w.physics.step(DT, w.time);
    for (const p of w.props) if (p.update && !p.isVehicle) p.update(DT);
    d.after(DT);
    P.after(DT);
    w.props = w.props.filter((p) => !p.dead);
    if (each?.() === true) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the data
test('toll: four lanes, a gate at the end of each: at least two wooden, and the lane he comes in on is not one', () => {
  assert.equal(T.lanes.length, 4);
  assert.equal(T.gates.length, 4);
  assert.ok(T.gates.filter((g) => g === 'wood').length >= 2, 'two wooden lanes at least');
  assert.ok(T.gates.every((g) => g === 'wood' || g === 'steel'));
  // he comes in on leg 1's south lane, ours: the approach's lane of the same row, the plaza's lane of that index
  const ours = C.legs[1].lanes[1], k = T.from.indexOf(ours);
  assert.ok(k >= 0, 'leg 1\'s lane goes on into the approach');
  assert.equal(T.gates[k], 'steel', 'the lane he arrives in is shut: he has to steer');
  assert.ok(T.gates.some((g, i) => g === 'wood' && i !== k));
  // the plaza's lanes on the roof's grid: 4.5 m apart (TOLL_LANES), the approach's 2.5 m
  for (let i = 1; i < 4; i++) {
    assert.ok(Math.abs(T.lanes[i] - T.lanes[i - 1] - 4.5) < 1e-9);
    assert.ok(Math.abs(T.from[i] - T.from[i - 1] - 2.5) < 1e-9);
  }
});

test('toll: each lane\'s gate stands across it at the islands\' end, its signal says the same (a green arrow: wood, a red X: steel)', () => {
  const props = level2a.props;
  T.lanes.forEach((r, k) => {
    const gates = props.filter(([t, c, y]) => (t === 'gate_arm_wood' || t === 'gate_steel') && Math.abs(c - T.at) < 0.5 && Math.abs(y - r) < 0.6);
    assert.equal(gates.length, 1, `lane ${k + 1}: one gate`);
    assert.equal(gates[0][0], T.gates[k] === 'wood' ? 'gate_arm_wood' : 'gate_steel', `lane ${k + 1}: its gate is ${T.gates[k]}`);
    assert.equal(Math.round(gates[0][3]) % 180, 90, 'across the lane');
    // its signal: on the island below it, before the roof
    const sig = props.filter(([t, c, y]) => t.startsWith('lane_signal_') && c < T.at && Math.abs(y - (r + 2.25)) < 0.2);
    assert.equal(sig.length, 1, `lane ${k + 1}: its signal`);
    assert.equal(sig[0][0], T.gates[k] === 'wood' ? 'lane_signal_go' : 'lane_signal_stop', `lane ${k + 1}: its signal matches its gate`);
  });
  assert.equal(props.filter(([t]) => t.startsWith('lane_signal_')).length, 4);
  // the lab's two the same
  const L = lab.routes.bend.toll;
  L.lanes.forEach((r, k) => {
    const g = lab.props.find(([t, c, y]) => (t === 'gate_arm_wood' || t === 'gate_steel') && Math.abs(c - L.at) < 0.5 && Math.abs(y - r) < 0.6);
    assert.equal(g?.[0], L.gates[k] === 'wood' ? 'gate_arm_wood' : 'gate_steel');
  });
  assert.ok(lab.floor.some(([n]) => n === 'label_toll'), 'station 37 is labelled');
});

test('toll: nothing of the plaza\'s islands, their crash cushions, booths or signals is in a lane; the roof is hung over them', () => {
  const half = (t, deg) => { const d = PROPS[t]; const [w, h] = d.r ? [d.r * 2, d.r * 2] : [d.w, d.h]; return (Math.round(deg) % 180 === 90 ? w : h) / 64; };
  let n = 0;
  for (const [t, c, r, deg = 0] of level2a.props) {
    // (the cushions too: 2.6 m wide before a 1.5 m island they stood 0.6 m into each lane, burst by every car through)
    if (!['toll_island', 'crash_cushion_narrow', 'crash_cushion', 'toll_booth', 'lane_signal_go', 'lane_signal_stop', 'sign_exact_change'].includes(t) || c < T.fan[0] || c > T.at + 1) continue;
    n++;
    for (const y of T.lanes) assert.ok(r + half(t, deg) <= y - 1.5 + 0.01 || r - half(t, deg) >= y + 1.5 - 0.01, `${t} at ${c}, ${r} in the lane of row ${y}`);
  }
  assert.ok(n >= 5 + 5 + 4 + 4, `${n} islands, cushions, booths, signals`);
  const roof = level2a.props.find(([t]) => t === 'toll_canopy');
  assert.ok(roof && PROPS.toll_canopy.hung && PROPS.toll_canopy.overhead && PROPS.toll_canopy.lasting, 'the roof: hung over everything');
  // its lanes (TOLL_LANES: 104, 248, 392, 536 px from its top edge) on the plaza's
  const top = roof[2] - 320 / TILE;
  [104, 248, 392, 536].forEach((y, k) => assert.ok(Math.abs(top + y / TILE - T.lanes[k]) < 1e-6, `its lane ${k + 1}`));
});

// ---------------------------------------------------------------- pure
test('toll: a lane\'s line runs from its row on the approach through the fan to its row on the plaza', () => {
  const [a, b] = T.fan;
  for (let k = 0; k < 4; k++) {
    assert.equal(laneY(T, k, (a - 5) * TILE), T.from[k] * TILE);
    assert.equal(laneY(T, k, (b + 3) * TILE), T.lanes[k] * TILE);
    assert.ok(Math.abs(laneY(T, k, ((a + b) / 2) * TILE) - ((T.from[k] + T.lanes[k]) / 2) * TILE) < 1e-6);
  }
  // the way through for him: the wooden lane nearest; for a pursuer, the other one when there are two
  const ours = T.from.indexOf(C.legs[1].lanes[1]), x = (a - 2) * TILE;
  const his = woodFor(T, x, T.from[ours] * TILE);
  assert.equal(T.gates[his], 'wood');
  assert.ok(Math.abs(his - ours) === 1, 'a lane up or a lane down');
  const theirs = woodFor(T, x, T.from[ours] * TILE, his);
  assert.ok(theirs !== his && T.gates[theirs] === 'wood', 'a pursuer keeps off his');
  // the one sent the wrong way: the steel lane beside his
  const wrong = steelFor(T, x, T.from[ours] * TILE, his);
  assert.ok(T.gates[wrong] === 'steel' && Math.abs(wrong - his) === 1);
  assert.equal(nearestLane(T, T.lanes[3] * TILE, GX), 3);
  assert.ok(Math.abs(reach(1.5, 13.3) - 1197) < 1e-6, '1.5 s at 90 km/h');
});

test('toll: told 1.5 s out at his speed, until he is past its gates', () => {
  const w = { props: [], events: new EventBus(), exited: false, drive: null };
  const S = new Toll(w, [T]), P = S.plazas[0], v = 13.3;
  const drive = (x) => { w.drive = { on: true, dead: false, v, van: { x, y: T.from[2] * TILE } }; };
  drive(GX - reach(CHASE.toll.tell, v) - 40);
  for (let i = 0; i < 20; i++) S.step(DT);
  assert.equal(P.k, 0, 'not yet');
  assert.ok(!S.busy(GX - reach(CHASE.toll.tell + 0.6, v), v), 'nothing quiet yet');
  drive(GX - reach(CHASE.toll.tell, v) + 10);
  S.step(DT);
  assert.ok(P.k > 0 && P.k < 1, 'fading in');
  for (let i = 0; i < 20; i++) S.step(DT);
  assert.equal(P.k, 1);
  assert.equal(S.told().length, 1);
  assert.ok(S.busy(GX - 300, v), 'the pursuers quiet meanwhile');
  const g = S.guide(GX - 600, T.from[2] * TILE);
  assert.equal(T.gates[g.k], 'wood', 'the robot\'s way: a wooden lane');
  drive(GX + CHASE.toll.past + 10);
  for (let i = 0; i < 20; i++) S.step(DT);
  assert.equal(P.k, 0, 'past it: over');
});

// ---------------------------------------------------------------- his car
test('toll: from leg 1 on through the merge into the approach and the plaza with no bend: his row kept, no jump, the view eased across', () => {
  const legs = legsOf(C), k1 = legAt(legs, (T.fan[0] - 10) * TILE), km = legAt(legs, (T.at - 60) * TILE);
  assert.ok(legs[k1].lanes.includes(C.legs[1].lanes[0]) && legs[k1].lanes.includes(C.legs[1].lanes[1]), 'the approach holds leg 1\'s two lanes');
  assert.equal(km, 2, 'the merge: the leg after leg 1');
  assert.equal(legs[km].from, C.legs[1].to, 'right after leg 1');
  assert.equal(legs[k1].from, legs[km].to, 'the approach right after the merge');
  assert.ok(!(C.bends || []).some((b) => b.to > 1), 'no bend into the toll');
  const row = C.legs[1].lanes[1], s = start(legs[km].from - 8, row), { d, v } = s, z = 3, viewW = 640;
  let was = d.frame(viewW, z), wasY = v.y, most = 0, drift = 0, legsSeen = new Set();
  run(s, 3, { each: () => {
    const f = d.frame(viewW, z);
    most = Math.max(most, Math.abs(f.y - was.y));
    drift = Math.max(drift, Math.abs(v.y - wasY));
    legsSeen.add(d.legI);
    was = f;
    return v.x > (T.fan[0] - 4) * TILE;
  } });
  assert.ok(legsSeen.has(1) && legsSeen.has(km) && legsSeen.has(k1), 'leg 1, the merge, then the approach');
  assert.ok(drift < 1, `his row kept (${drift.toFixed(2)} px)`);
  assert.ok(most <= CHASE.camera.across.most + 1, `the view never jumps across (${most.toFixed(1)} px a step)`);
  assert.ok(Math.abs(d.v - legs[k1].cruise) < 0.6, `the toll's cruise picked up (${(d.v * CHASE.kmh).toFixed(0)} km/h)`);
  assert.equal(s.w.killed, null);
});

test('toll: on the plaza the view follows him across (`track`): steered to the outer wooden lane, it goes with him, never a jump', () => {
  const legs = legsOf(C), kp = legAt(legs, GX), L = legs[kp];
  assert.ok(L.track > 0 && L.lanes.join() === T.lanes.join(), 'the plaza\'s leg follows him');
  // (the wooden lane farthest from the road's middle: the one the view has to follow him to)
  const k = T.gates.reduce((best, g, i) => (g === 'wood' && (best < 0 || Math.abs(T.lanes[i] - L.mid) > Math.abs(T.lanes[best] - L.mid)) ? i : best), -1);
  const s = start(T.fan[0] - 8, T.from[k], { speed: L.cruise }), { d, v } = s, z = 3, viewW = 640;
  let was = d.frame(viewW, z), most = 0;
  run(s, 1.6, { steer: k, each: () => {
    const f = d.frame(viewW, z);
    most = Math.max(most, Math.abs(f.y - was.y));
    was = f;
    return v.x > GX - 2 * TILE;
  } });
  const f = d.frame(viewW, z), want = L.mid * TILE + (v.y - L.mid * TILE) * L.track;
  assert.ok(Math.abs(v.y - T.lanes[k] * TILE) < 12, `in lane ${k + 1} (${(v.y / TILE).toFixed(2)})`);
  assert.ok(most <= CHASE.camera.across.most + 1, `${most.toFixed(1)} px a step at most`);
  assert.ok(Math.abs(f.y - want) < 24, `the view's middle with him (${(f.y / TILE).toFixed(2)}, wants ${(want / TILE).toFixed(2)})`);
  assert.ok(Math.abs(f.y - L.mid * TILE) > 3 * TILE, 'moved across with him');
  assert.ok(Math.abs(v.y - f.y) + 40 < 180, 'his lane on the picture (the view 360 px high)');
  assert.equal(s.w.killed, null);
});

test('toll: through a wooden arm he goes on at a small cost, the arm torn off, told (the breath of slow motion)', () => {
  const k = T.gates.indexOf('wood'), s = start(T.fan[1] + 1, T.lanes[k], { speed: 13.3 }), { d, v, w } = s;
  const arm = w.props.find((p) => p.type === 'gate_arm_wood' && Math.abs(p.y - T.lanes[k] * TILE) < TILE);
  assert.ok(arm, 'its arm');
  let low = Infinity;
  run(s, 1.2, { each: () => { if (v.x > GX - 100) low = Math.min(low, d.v); return v.x > GX + 200; } });
  assert.ok(!d.dead && w.killed === null, 'alive');
  assert.ok(arm.dying || arm.dead, 'the arm torn off');
  assert.ok(low < 13.3 * 0.97 && low > 13.3 * 0.84, `a small cost (${(low / 13.3 * 100).toFixed(0)} % of his speed kept)`);
  assert.ok(Math.abs(PROPS.gate_arm_wood.cost - 0.1) < 1e-9);
  const g = w.told.find((e) => e.k === 'tollGate');
  assert.ok(g?.his && g.lane === k, 'told: his car through it');
  assert.ok(w.told.some((e) => e.k === 'chaseBeat' && e.kind === 'toll'), 'the beat');
  assert.equal(w.chaseCam.beat?.kind, 'toll');
  assert.ok(w.chaseCam.beat.slow < 1 && w.chaseCam.beat.slow >= 0.3, 'light: a breath');
});

// ---------------------------------------------------------------- choosing his lane: the slow motion
// the chase's director with the world, its clock on the real one (a game step lasts DT / scale real s)
function directed(s) {
  const cc = s.w.chaseCam;
  return () => { cc.step(); cc.update(DT / Math.max(0.1, cc.scale)); };
}

test('toll: choosing: the gates so many s off at his speed, and committed once in the fan on a wooden lane\'s line, going straight on', () => {
  const K = CHASE.cinema.choose, v = 13.3, P = { ...T, x: GX };
  assert.ok(Math.abs(gatesIn(P, GX - v * 60, v) - 1) < 1e-9, 'a second at 90 km/h');
  assert.equal(gatesIn(P, GX + 1, v), null, 'past them');
  const wood = T.gates.indexOf('wood'), steel = T.gates.indexOf('steel'), x = (T.fan[0] + 2) * TILE;
  const on = (k, dy = 0, u = 0, at = x) => tollCommitted(P, { x: at, y: laneY(T, k, at) + dy, u }, K);
  assert.ok(on(wood), 'on a wooden lane\'s line in the fan');
  assert.ok(on(wood, K.commit - 1), 'within `commit` px of it');
  assert.ok(!on(wood, K.commit + 4), 'not off it');
  assert.ok(!on(wood, 0, K.still + 1), 'not while still going across');
  assert.ok(!on(steel), 'never a steel lane');
  assert.ok(!on(wood, 0, 0, (T.fan[0] - 1) * TILE), 'not before the fan: the lanes are side by side there');
  assert.ok(tollCommitted(P, { x: GX + 2, y: 0, u: 3 }, K), 'past the gates: over');
  // its framing: a whole zoom further out (2 px a world px at 1080, an even one: the fine sprites stay whole)
  assert.equal(SHOTS[K.shot].pull, 1);
  assert.equal(3 * whole(SHOTS[K.shot].zoom, 3, 2), 2, '1080: 3 -> 2');
  assert.equal(2 * whole(SHOTS[K.shot].zoom, 2, 2), 2, '720: already the least, no cut');
  assert.ok(K.slow <= 0.35 && K.lead >= 1.1 && K.lead <= CHASE.toll.tell, 'a real slow motion, once its tells are up');
});

test('toll: choosing: the world slows `lead` s before the gates, the view framing them, the wheel handed more; steered onto a wooden lane it lets go, once a plaza', () => {
  const K = CHASE.cinema.choose, k = T.gates.indexOf('steel', 2), s = start(T.fan[0] - 26, T.from[k], { speed: 13.3 }), { d, v, w } = s;
  const cc = w.chaseCam, tick = directed(s);
  let openAt = null, wheel = null, shot = null, endAt = null;
  // (straight on first: it opens by itself)
  run(s, 2, { each: () => { tick(); if (cc.beat?.kind === 'choose') { openAt = v.x; wheel = cc.wheel; shot = cc.shot(); return true; } return false; } });
  assert.ok(openAt !== null, 'it opens');
  assert.ok(Math.abs((GX - openAt) / (d.v * 60) - K.lead) < 0.05, `${((GX - openAt) / (d.v * 60)).toFixed(2)} s before the gates`);
  assert.ok(w.toll.plazas[0].k > 0, 'its tells up');
  assert.ok(wheel && wheel.most === K.wheel && wheel.rate >= 1, 'the wheel in real time, and more of it');
  assert.equal(shot?.name, K.shot);
  assert.ok(shot.at.x > v.x + 100, 'the view drawn on toward the gates');
  assert.ok(Math.abs(shot.at.y - T.lanes.reduce((a, r) => a + r, 0) / 4 * TILE) < 1, 'across, on the plaza\'s middle');
  // (now he steers for the wooden lane the robot is sent down)
  let low = 1;
  run(s, 6, { steer: true, each: () => {
    tick();
    low = Math.min(low, cc.scale);
    if (endAt === null && cc.beat?.kind === 'choose' && !cc.beat.held) endAt = v.x;
    return v.x > GX + 4 * TILE;
  } });
  assert.ok(low <= K.slow + 0.01, `slowed to x${low.toFixed(2)}`);
  assert.ok(endAt !== null && endAt < mouthX(T), `let go once committed, before the mouths (col ${(endAt / TILE).toFixed(1)})`);
  assert.ok(endAt >= T.fan[0] * TILE, 'in the fan');
  assert.equal(w.killed, null, 'through');
  assert.ok(w.told.filter((e) => e.k === 'chaseBeat' && e.kind === 'choose').length === 1, 'once');
  assert.ok(w.toll.plazas[0].chosen);
});

test('toll: choosing: never steered, it lets go `last` s before the lanes\' mouths (his to make at full speed), and before its cap', () => {
  const K = CHASE.cinema.choose, k = T.gates.indexOf('steel', 2), s = start(T.fan[0] - 26, T.from[k], { speed: 13.3 }), { d, v, w } = s;
  const cc = w.chaseCam, tick = directed(s);
  let endX = null, held = 0;
  run(s, 4, { each: () => {
    tick();
    if (cc.beat?.kind === 'choose' && cc.beat.left < 0) held = cc.beat.t;
    if (cc.beat?.kind === 'choose' && cc.beat.left >= 0 && endX === null) endX = v.x;
    return endX !== null;
  } });
  assert.ok(endX !== null, 'over');
  const left = (mouthX(T) - endX) / (d.v * 60);
  assert.ok(Math.abs(left - K.last) < 0.05, `${left.toFixed(2)} s before the mouths`);
  assert.ok(held < K.in + K.cap && held > 1, `held ${held.toFixed(2)} s real, under its cap`);
  assert.equal(w.killed, null);
});

test('toll: choosing: none in the opening, dead or past the gates; the kill beat never cuts into it', () => {
  const s = start(T.fan[0] - 26, T.from[3], { speed: 13.3 }), { w, d } = s, cc = w.chaseCam, tick = directed(s);
  d.dead = true;
  run(s, 1.5, { each: () => { tick(); return !!cc.beat; } });
  assert.equal(cc.beat, null, 'dead: none');
  const s2 = start(T.at + 6, T.from[0], { speed: 13.3 }), tick2 = directed(s2);
  run(s2, 0.5, { each: () => { tick2(); return !!s2.w.chaseCam.beat; } });
  assert.equal(s2.w.chaseCam.beat, null, 'past the gates: none');
  const s3 = start(T.fan[0] - 26, T.from[3], { speed: 13.3 }), cc3 = s3.w.chaseCam, tick3 = directed(s3);
  run(s3, 2, { each: () => { tick3(); return cc3.beat?.kind === 'choose'; } });
  const car = s3.P.spawn(s3.v.x + 200, T.from[0] * TILE, 0, 'chase', 13.3, 'gunner');
  s3.w.events.emit('pursuerWreck', { car: car.v, x: car.v.x, y: car.v.y });
  assert.equal(cc3.beat?.kind, 'choose', 'a kill meanwhile: the choosing goes on');
});

// ---------------------------------------------------------------- the crash on a steel boom
test('toll: one of theirs stopped on a steel boom: thrown back off it spinning, its nose folded, the boom bent, told; the strong kill beat whatever the cooldown', () => {
  const k = T.gates.indexOf('steel'), s = start(T.fan[0] - 26, T.from[3], { speed: 13.3 }), { w, P } = s;
  const gate = w.toll.plazas[0].props[k];
  assert.ok(onBoom(T, k, GX - 30, laneY(T, k, GX), 140) && !onBoom(T, k, GX - 30, laneY(T, k, GX) + 2 * TILE, 140) && !onBoom(T, T.gates.indexOf('wood'), GX - 30, laneY(T, T.gates.indexOf('wood'), GX), 140));
  const car = P.spawn(GX - 70 - 4, laneY(T, k, GX) + 6, 0, 'chase', 0, 'gunner');
  w.chaseCam.S = { strong: w.chaseCam.now, beat: -Infinity, kill: -Infinity, tier: 'strong', on: false }; // (a strong beat just now: the cooldown on)
  P.wreck(car);
  const e = w.told.find((q) => q.k === 'tollCrash');
  assert.ok(e && e.car === car.v && e.lane === k, 'told');
  assert.ok(car.v.tollCrash && gate.bent, 'the car marked, the boom bent');
  const vel = Matter.Body.getVelocity(car.v.body);
  assert.ok(vel.x < 0 && Math.abs(Matter.Body.getAngularVelocity(car.v.body)) > 0.1, 'thrown back, spinning');
  assert.equal(w.chaseCam.beat?.kind, 'kill');
  assert.equal(w.chaseCam.beat?.tier, 'strong', 'the strong beat');
  // a car wrecked anywhere else: no crash of the toll's
  const other = P.spawn(GX - 20 * TILE, T.from[0] * TILE, 0, 'chase', 0, 'gunner');
  P.wreck(other);
  assert.ok(!other.v.tollCrash && w.told.filter((q) => q.k === 'tollCrash').length === 1);
});

test('toll: nose-on into a steel boom is the crash, his death', () => {
  const k = T.gates.indexOf('steel'), s = start(T.fan[1] + 1, T.lanes[k], { speed: 13.3 }), { d, v, w } = s;
  run(s, 1.2, { each: () => d.dead });
  assert.ok(d.dead, 'dead');
  assert.equal(w.killed?.cause, 'crash');
  assert.ok(v.x < GX, 'stopped at the boom');
  const boom = w.props.find((p) => p.type === 'gate_steel' && Math.abs(p.y - T.lanes[k] * TILE) < TILE);
  assert.ok(boom && !boom.dead && !boom.dying, 'it never gives');
});

test('toll: straight on in the lane he comes in on, he does not get through: he has to steer', () => {
  const s = start(T.fan[0] - 12, T.from.indexOf(C.legs[1].lanes[1]) >= 0 ? C.legs[1].lanes[1] : T.from[2], { speed: 13.3 }), { d, v } = s;
  run(s, 3, { each: () => d.dead || v.x > GX + 100 });
  assert.ok(d.dead, 'dead');
});

// ---------------------------------------------------------------- the pursuers
// (his way through: down the wooden lane above his, or the one below it)
for (const lane of T.gates.flatMap((g, i) => (g === 'wood' ? [i] : []))) {
  test(`toll: he goes down lane ${lane + 1}; the one sent the wrong way takes a steel lane and wrecks on the boom (his kill, the kill beat); the other follows him through a wooden arm`, () => {
    const ev = C.events.filter((e) => e.at >= C.legs[1].to - 1);
    assert.equal(ev.length, 2);
    const s = start(C.legs[1].to - 3, C.legs[1].lanes[1], { events: ev }), { v, w, P } = s;
    let wrongAt = null;
    const through = new Map();
    run(s, 6, { steer: lane, each: () => {
      for (const c of P.cars) if (!through.has(c) && c.v.x + c.v.w / 2 > GX) through.set(c, c.v.y);
      const wrong = P.cars.find((c) => c.gate0 === 'steel');
      if (wrong?.state === 'wrecked' && !wrongAt) wrongAt = { x: wrong.v.x, y: wrong.v.y, his: v.x };
      return v.x > GX + 12 * TILE;
    } });
    assert.equal(P.cars.length, 2, 'two of them');
    assert.equal(w.killed, null, 'he got through');
    const wrong = P.cars.find((c) => c.gate0 === 'steel'), other = P.cars.find((c) => c !== wrong);
    assert.ok(wrongAt, `the wrong one wrecked (${wrong.state}, at ${(wrong.v.x / TILE).toFixed(1)}, ${(wrong.v.y / TILE).toFixed(1)})`);
    assert.ok(Math.abs(wrongAt.x - GX) < 4 * TILE, `at the gates (${(wrongAt.x / TILE).toFixed(1)})`);
    const k = nearestLane(T, wrongAt.y, GX);
    assert.equal(T.gates[k], 'steel', `in a steel lane (${k + 1})`);
    assert.equal(Math.abs(k - lane), 1, 'the one beside his');
    assert.ok(wrongAt.his > wrongAt.x - 2 * TILE, 'as he goes through, beside him or just behind');
    assert.ok(w.told.some((e) => e.k === 'pursuerWreck' && e.car === wrong.v), 'the kill beat told');
    assert.ok(w.told.some((e) => e.k === 'tollCrash' && e.car === wrong.v) && wrong.v.tollCrash, 'THE CRASH on its boom');
    assert.ok(w.kills.length >= 1, 'its crew his kills');
    assert.ok(other.v.x > GX && other.state === 'chase', `the other one through (${other.state} at ${(other.v.x / TILE).toFixed(1)})`);
    assert.equal(T.gates[nearestLane(T, through.get(other), GX)], 'wood', 'through a wooden arm');
  });
}

test('toll: their top speed keeps its margin over his leg\'s cruise (the toll\'s road at 90 km/h)', () => {
  const s = start(T.fan[0] - 20, T.from[1]);
  assert.ok(Math.abs(s.P.top() - (CHASE.pursuit.max + legsOf(C)[s.d.legI].cruise - CHASE.cruise)) < 1e-9);
  assert.ok(s.P.top() > s.d.leg.cruise + 4);
});

// ---------------------------------------------------------------- the roof
test('toll: the roof over the plaza fades over his car as the railway bridge does (overhead, see-through over him)', () => {
  const w = world(T.at - 10, T.at + 1), roof = w.props.find((p) => p.type === 'toll_canopy');
  roof.img = { width: 192, height: 640, k: 1 };
  const alphas = [], stack = [];
  const g = {
    globalAlpha: 1, save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); }, translate() {}, rotate() {}, scale() {},
    drawImage() { alphas.push(this.globalAlpha); }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const cam = { x: roof.x, y: roof.y };
  roof.drawOverhead(g, { x: roof.x - 300, y: T.lanes[1] * TILE }, cam);
  roof.drawOverhead(g, { x: roof.x + 20, y: T.lanes[1] * TILE }, cam);
  roof.drawOverhead(g, { x: roof.x - 40, y: T.lanes[3] * TILE }, cam);
  assert.equal(alphas[0], 1, 'whole before he is under it');
  assert.ok(alphas[1] < 0.6 && alphas[2] < 0.6, 'see-through over him, in any lane');
  const isle = w.props.find((p) => p.type === 'toll_island');
  assert.ok(!isle.def.overhead && isle.def.lasting, 'the islands on the ground, never giving');
});

// ---------------------------------------------------------------- past the gates: where the road narrows
test('merge: steered north across the gore past the end of the freeway\'s rail, he reaches the freeway\'s lanes (held off the bank only beside it)', () => {
  // (the freeway's rail along the top of the bank, its last length's end: the bank's hold ends there, not at the toll)
  const rails = level2a.props.filter(([k, , r]) => k === 'guardrail' && Math.abs(r - 41.15) < 0.01);
  const end = Math.max(...rails.map(([, c]) => c + 2));
  const s = start(end - 12, C.legs[1].lanes[0]), { d, v, w, input } = s;
  let beside = Infinity, slowest = Infinity;
  run(s, 3, { each: () => {
    // (W held from just short of the rail's end until he is over the freeway's near lane)
    if (v.x > (end - 6) * TILE && v.y > 41.75 * TILE) input.held.add('KeyW');
    else input.held.clear();
    // (alongside the rail its whole body stays off the bank: below row 42.6)
    if (v.body.bounds.min.x < end * TILE) beside = Math.min(beside, v.body.bounds.min.y);
    else slowest = Math.min(slowest, d.v);
    return v.x > 558 * TILE;
  } });
  assert.ok(w.player.alive && !d.dead, 'alive');
  assert.ok(beside >= 42.6 * TILE - 1, `beside the rail held off the bank (top at row ${(beside / TILE).toFixed(2)})`);
  assert.ok(v.y < 41.75 * TILE + 8, `on the freeway's lanes by col 558 (row ${(v.y / TILE).toFixed(2)})`);
  assert.ok(slowest > 0.9 * d.cruise, `never held up across the gore (${(slowest / d.cruise * 100).toFixed(0)} % of his speed)`);
});

test('merge: the gore is channelized, a line of posts along each edge on its paint; driven through, each is torn off at no cost', () => {
  const posts = level2a.props.filter(([k]) => k === 'channelizer');
  const ramp = posts.filter(([, , r]) => Math.abs(r - 42.72) < 0.01), fwy = posts.filter(([, , r]) => r < 42.6);
  assert.ok(ramp.length >= 6 && fwy.length >= 4, `two lines (${ramp.length} along the ramp's edge, ${fwy.length} along the freeway's)`);
  assert.ok(posts.every(([, c]) => c > C.legs[1].to && c < T.at - 40), 'on the merge only');
  for (let i = 1; i < ramp.length; i++) assert.ok(Math.abs(ramp[i][1] - ramp[i - 1][1] - 3) < 1e-6, '3 m apart');
  const def = PROPS.channelizer;
  assert.ok(def.static && !def.lasting && def.cost === 0, 'bolted, torn off, at no cost');
  // his car run along the ramp's line of them (from past the bank's nose: beside it, it is held off the bank)
  const x0 = ramp[1][1] - 1, s = start(x0, 42.72), { d, v, w } = s;
  const mine = w.props.filter((p) => p.type === 'channelizer' && Math.abs(p.y - 42.72 * TILE) < 2 && p.x > x0 * TILE);
  let slowest = Infinity;
  run(s, 2.5, { each: () => { slowest = Math.min(slowest, d.v); return v.x > (ramp.at(-1)[1] + 4) * TILE; } });
  assert.equal(mine.length, ramp.filter(([, c]) => c > x0).length);
  assert.ok(mine.every((p) => p.dying || p.dead), `all torn off (${mine.filter((p) => p.dying || p.dead).length} of ${mine.length})`);
  assert.ok(slowest > 0.99 * d.cruise, `never slowed (${(slowest / d.cruise * 100).toFixed(1)} % of his speed)`);
  assert.ok(Math.abs(v.y - 42.72 * TILE) < 6, 'never pushed off his line');
  assert.ok(!d.dead && w.killed === null);
});

test('toll: steered out wide past the gates and on to where the outer lanes end, the wheel is brought in ahead of the narrowing: never stopped on a rail\'s end', () => {
  // (out of the outer wooden lane, the wheel held to the outside: the fan back's crash cushions and the rail behind
  // them at col 627, the lane drop's at col 652; nose-on to the rail's end the car stood at 3 % of its speed)
  for (const [row, key] of [[T.lanes[0], 'KeyW'], [T.lanes[2], 'KeyS']]) {
    const s = start(Math.ceil(T.at) + 3, row, { speed: 13.3 }), { d, v, w, input } = s;
    input.held.add(key);
    let slowest = Infinity, wide = 0;
    run(s, 4.2, { each: () => { slowest = Math.min(slowest, d.v); return v.x > 668 * TILE; } });
    // (the freeway's guardrails there)
    const rails = level2a.props.filter(([k, c]) => k === 'guardrail' && c > 656 && c < 668).map(([, , r]) => r * TILE);
    wide = Math.max(Math.min(...rails) - v.body.bounds.min.y, v.body.bounds.max.y - Math.max(...rails));
    assert.ok(w.player.alive && !d.dead, `${key}: alive`);
    assert.ok(slowest > 0.8 * d.cruise, `${key}: never held up (${(slowest / d.cruise * 100).toFixed(0)} % of his speed at the slowest)`);
    assert.ok(v.x > 668 * TILE, `${key}: on down the freeway (${(v.x / TILE).toFixed(0)})`);
    assert.ok(wide < -2, `${key}: inside its guardrails (${wide.toFixed(0)} px out)`);
  }
  // (theirs: past the gates the leg is the four lanes the fan back closes to, then the freeway's two from where the
  // outer two start to end: their slots are never out wide into a cushion)
  const legs = legsOf(C), back = legs[legAt(legs, (T.at + 3) * TILE)], drop = legs[legAt(legs, 642 * TILE)];
  assert.deepEqual(back.lanes, T.from, 'the fan back: the approach\'s four');
  assert.equal(drop.lanes.length, 2, 'where the outer two end: the middle two');
});

test('toll: a pursuer left far behind is not brought back up while the plaza is told (put in the lane beside his there, it was across an island\'s nose), only past the gates', () => {
  const s = start(T.fan[0] - 14, T.from[3], { speed: 13.3 }), { v, P } = s;
  s.w.view = () => ({ x: v.x + 100, y: v.y, hw: 320, hh: 180 }); // (the picture: off it, a car may be brought up)
  const car = s.P.spawn(v.x - 1500, T.from[2] * TILE, 0, 'chase', 13.3, 'gunner');
  let jumpAt = null, was = car.v.x;
  run(s, 3, { steer: true, each: () => {
    if (jumpAt === null && car.v.x - was > 60) jumpAt = v.x;
    was = car.v.x;
    return false;
  } });
  assert.ok(jumpAt !== null, 'brought back up at last');
  assert.ok(jumpAt > GX + CHASE.toll.past - 1, `past the gates, not in the plaza (he was at col ${(jumpAt / TILE).toFixed(1)})`);
  assert.ok(car.state === 'chase', `and still after him (${car.state})`);
});

test('hud: an edge marker on the top edge under the road\'s line and its metres is put below them, never over them', async () => {
  const { underRoad } = await load('game/ui/HUD.js');
  const W = 1920, pad = 24, s = 1.5;
  const over = underRoad({ x: W / 2 + 100, y: 30, angle: -1 }, W, pad, s), aside = underRoad({ x: 60, y: 30, angle: -2 }, W, pad, s);
  assert.ok(over.y >= pad + 40 * s, `pushed below the line (${over.y})`);
  assert.equal(aside.y, 30, 'away from it: left where it is');
  assert.equal(underRoad(null, W, pad, s), null);
});

// ---------------------------------------------------------------- the polish pass (2026-11-20)
test('toll: a pursuer stopped for good on the approach is braked to a stand short of the islands; one stopped at the mouths runs on through its lane', () => {
  // (it slid on down its lane to the islands' noses and lay across a mouth: he was held up five seconds there)
  const nose = (T.nose ?? T.fan[1]) * TILE, K = CHASE.toll.wreck;
  const s = start(T.fan[0] - 22, C.legs[2].lanes[2], { speed: C.legs[2].cruise });
  const car = s.P.spawn(s.v.x + 200, C.legs[2].lanes[1] * TILE, 0, 'chase', C.legs[2].cruise);
  run(s, 0.2);
  s.P.wreck(car);
  assert.ok(s.w.toll.wreckWay(car.v.x, car.v.y)?.stop, 'on the approach: a place to stop before');
  run(s, 4, { steer: true });
  assert.ok(car.v.x + car.v.w / 2 < nose - K.short + K.room, `stopped short of the islands (col ${(car.v.x / TILE).toFixed(1)}, their noses at ${T.nose})`);
  assert.equal(s.w.killed, null, 'and he got past it');
  // (pure) the three stretches of its way
  const toll = s.w.toll, y = T.lanes[0] * TILE + 40;
  assert.equal(toll.wreckWay(nose - K.short - K.from - 10, y), null, 'far out: the usual exit');
  assert.ok(toll.wreckWay(nose - K.short - K.room - 10, y).stop === nose - K.short);
  const on = toll.wreckWay(nose + 40, y);
  assert.ok(on.run > 0 && Math.abs(on.lane - T.lanes[0] * TILE) < 1, 'between the islands: on down its own lane');
  assert.equal(toll.wreckWay(GX + K.past + 10, y), null, 'past the gates: the usual exit');
});

test('pursuit: no more than CHASE.pursuit.most of them drive after him at once; a toll\'s wrong-gate car still joins', () => {
  const s = start(C.legs[2].from + 2, C.legs[2].lanes[2], { speed: C.legs[2].cruise }), { P } = s;
  const tg = P.target(), live = () => P.cars.filter((c) => ['chase', 'cross', 'limp'].includes(c.state)).length;
  for (let i = 0; i < 6; i++) P.trigger({ kind: 'behind', style: 'gunner' }, tg);
  assert.equal(live(), CHASE.pursuit.most, 'the events past the cap bring nobody');
  P.trigger({ kind: 'behind', style: 'rammer', gate: 'steel' }, tg);
  assert.ok(P.cars.some((c) => c.gate0 === 'steel'), 'the wrong-gate car is its event: it joins all the same');
  assert.equal(level2a.chase.end, 656, 'the level ends well before the map\'s edge (44 columns to run on in the dark)');
  assert.ok(level2a.tiles[0].length - level2a.chase.end >= 40);
});
