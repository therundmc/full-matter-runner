// Level 2A's ALLEY (docs/LEVEL2.md "Segment 1, part two"; CHASE.bend.smash): the scripted bend down a back alley full
// of things the car ploughs through. His car keeps to the bend's line, tears and throws what stands on it (it bursts),
// scrapes the parked car along its whole flank (sparks the whole contact, never held up) and loses a bounded share of
// its speed; a pursuer following him through ploughs what is left, and the first to scrape the parked car (`snare`)
// is wrecked on it. Tested on the real map and props of level 2A.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: what the cars paint on themselves goes nowhere
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Drive, smashable, smashSpeed, bursts, smashCost } = await load('game/systems/Drive.js');
const { default: Pursuit } = await load('game/systems/Pursuit.js');
const { default: CarFx } = await load('game/systems/CarFx.js');
const { default: ChaseCam } = await load('game/systems/ChaseCam.js');
const { routeOf, project } = await load('game/systems/Route.js');
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

const { Bodies, Body } = Matter;
const DT = 1 / 60;
const quiet = new Proxy({}, { get: () => () => {} });
const SIZE = { pursuer: [140, 58], convertible: [172, 64], car: [140, 58], car2: [134, 56] };
const C = level2a.chase, B = C.bends[0], K = CHASE.bend.smash;

function vehicle(w, model, x, y, a = 0, opt = {}) {
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
    hat: false, gun: false, drawn: null, def: { static: true, hp: m.hp, vault: true }, scars: 0, sheds: [], ...opt,
  });
  v.scar = () => { v.scars++; };
  v.shed = (x, y, a, sp, all, which) => { v.sheds.push(which ?? 'any'); };
  v.hit = () => {};
  v.startAlarm = () => { v.alarm = 9; };
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

// the alley's stretch of level 2A: its walls, its props (the real ones, Prop as the game makes them), its parked car
function world(x0 = (B.at - 20) * TILE, x1 = (B.at + 30) * TILE) {
  const events = new EventBus(), physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const map = new TileMap(level2a.tiles);
  physics.add(map.buildBodies());
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const w = {
    map, physics, events, chars: [], props: [], corpses: [], debris: [], items: [], windows: [], doors: [], rings: [],
    projectiles: [], time: 0, particles: quiet, decals: quiet, papers: quiet, smoke: quiet, liquids: quiet, exited: false,
    cleared: false, drive: null, totalEnemies: 0, game: { onExit() {}, flash() {} }, camera: quiet, beats: [], smashes: [],
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), addDebris() {}, removeDebris() {}, after() {},
    sound() {}, shake() {}, noise() {}, light() {}, hitstop() {}, flashGlass() {}, damageWall() {}, onKill() {}, emit() {},
    addProjectile(p) { w.projectiles.push(p); },
  };
  w.player = {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', reloading: 0, reloadDur: 1, world: w,
    weapon: { type: 'uzi', mag: 30 }, ammo: {}, get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; }, kill() { this.alive = false; },
  };
  w.chars.push(w.player);
  for (const [type, col, row, deg = 0, opt] of level2a.props) {
    if (col * TILE < x0 || col * TILE > x1) continue;
    if (VEHICLES[type]) { const v = vehicle(w, type === 'car' ? 'car' : 'car2', col * TILE, row * TILE, (deg * Math.PI) / 180); if (opt?.snare) v.snare = true; continue; }
    w.props.push(new Prop(w, type, col * TILE, row * TILE, (deg * Math.PI) / 180));
  }
  events.on('chaseBend', (e) => w.beats.push(e.phase));
  events.on('chaseSmash', (e) => w.smashes.push(e));
  return w;
}

const keys = () => ({ held: new Set(), down: () => false, hit: () => false, mouseHit: () => false, mouseDown: () => false });

function start(col = B.at - 10, row = C.lanes[1]) {
  const w = world(), v = vehicle(w, CHASE.vehicle, col * TILE, row * TILE);
  const chase = { ...C, events: [], intro: null, arms: null, water: null };
  w.drive = new Drive(w, { ...chase, van: [col, row] }, v);
  w.pursuit = new Pursuit(w, chase);
  return { w, v, d: w.drive, P: w.pursuit, input: keys() };
}

// (k: the world's time scale, a slow motion: Game steps it at FIXED_DT x k)
function run(s, sec, each = null, fx = null, k = 1) {
  const { w, d, P, input } = s, dt = DT * k;
  for (let t = 0; t < sec; t += dt) {
    w.time += dt;
    d.step(dt, input, null);
    P.step(dt);
    w.physics.step(dt, w.time);
    d.after(dt);
    P.after(dt);
    fx?.update(dt);
    if (each?.() === true) return true;
  }
  return false;
}

// the props of the level standing within `r` tiles of the bend's line
function onLine(r) {
  const R = routeOf(C), b = R.bends[0];
  return level2a.props.filter(([type, col, row]) => {
    const p = project(b.path, col * TILE, row * TILE);
    const q = b.path.at(p);
    return Math.hypot(q.x - col * TILE, q.y - row * TILE) < r * TILE && !PROPS[type]?.hung;
  });
}

// ---------------------------------------------------------------- the level
test('alley: a back alley five metres wide on the bend\'s line, full of what the car ploughs through, nothing lasting on it', () => {
  const map = new TileMap(level2a.tiles), R = routeOf(C), b = R.bends[0];
  // the alley: its walls 5 m apart either side of the line down it
  const x = B.path[1][0];
  for (let row = 22; row <= 40; row++) {
    let w0 = Math.floor(x), w1 = Math.floor(x);
    const wall = (c) => map.isSolid(c, row) || 'DLG'.includes(map.at(c, row)); // (a back door is in its wall)
    while (!wall(w0 - 1)) w0--;
    while (!wall(w1 + 1)) w1++;
    assert.ok(w1 - w0 + 1 <= 5.5 && w1 - w0 + 1 >= 4.5, `row ${row}: ${w1 - w0 + 1} m between its walls`);
  }
  // what stands on (or by) the line gives: torn off, thrown and burst, a car scraped; never a LASTING thing
  const near = onLine(1.6);
  assert.ok(near.length >= 14, `${near.length} things on its line`);
  for (const [type, col, row] of near) {
    const def = PROPS[type];
    if (VEHICLES[type]) continue;
    assert.ok(def && !def.lasting, `${type} at ${col},${row} gives`);
    assert.ok(def.static || smashable(def.kg), `${type} at ${col},${row}: torn off or thrown (${def.kg} kg)`);
  }
  const kinds = new Set(near.map(([t]) => t));
  for (const k of ['produce_crates', 'box_stack', 'fruit_cart', 'news_stand', 'domino_table', 'hydrant', 'dumpster_mint', 'trash_can', 'bin_bag'])
    assert.ok(kinds.has(k), `${k} on its way`);
  // its parked car, set as the snare, its flank a few px into his line, never across it
  const car = level2a.props.find(([t, , , , o]) => VEHICLES[t] && o?.snare);
  assert.ok(car, 'a parked car set as a snare');
  const p = b.path.at(project(b.path, car[1] * TILE, car[2] * TILE)), half = (SIZE[car[0]][1] - 4) / 2, his = (SIZE.convertible[1] - 4) / 2;
  const gap = Math.abs(car[1] * TILE - p.x) - half - his;
  assert.ok(gap < -2 && gap > -10, `its flank ${(-gap).toFixed(1)} px into his`);
  // the washing across it: torn down by a car under it
  assert.ok(level2a.props.filter(([t, c, r]) => t === 'laundry_line' && Math.abs(c - x) < 1 && r > 18 && r < 33).length === 2);
  assert.ok(PROPS.laundry_line.canopy && PROPS.laundry_line.hung);
});

// ---------------------------------------------------------------- pure
test('alley: what a bend throws, how fast, what bursts, what it costs (CHASE.bend.smash)', () => {
  assert.ok(smashable(240) && smashable(K.kg) && !smashable(K.kg + 1));
  const light = smashSpeed(10), heavy = smashSpeed(240), most = smashSpeed(K.kg);
  assert.ok(light >= CHASE.hit.fling.v[0] && light <= CHASE.hit.fling.v[1]);
  assert.ok(heavy < CHASE.hit.fling.v[0] && heavy > most && most >= K.heavy[0] - 1e-9, `${heavy} ${most}`);
  assert.ok(bursts(PROPS.produce_crates) && bursts(PROPS.box_stack) && bursts(PROPS.trash_can) && bursts(PROPS.scooter_pink));
  assert.ok(!bursts(PROPS.dumpster_mint) && !bursts(PROPS.oil_drum) && !bursts(PROPS.graffiti), 'a dumpster, a drum stay whole');
  // never under its floor, however much it hits
  let v = B.speed ?? CHASE.bend.speed;
  for (let i = 0; i < 100; i++) v = smashCost(v, K.heavyCost, CHASE.bend.speed);
  assert.ok(Math.abs(v - CHASE.bend.speed * K.floor) < 1e-9, `${v}`);
  assert.equal(smashCost(2, 0.5, CHASE.bend.speed), 2, 'already under the floor: no lower');
});

// ---------------------------------------------------------------- his car
test('alley: his car ploughs down it on the bend\'s line: things torn and thrown and burst, the parked car scraped, never held up', () => {
  const s = start(), { w, d, v } = s, R = d.route, b = R.bends[0];
  const fx = new CarFx(w);
  let off = 0, slowest = Infinity, inBend = 0, rubbing = 0, maxRub = 0, scraping = 0;
  const parked = w.props.find((p) => p.snare);
  const watch = w.props.filter((p) => !p.isVehicle && !p.def.lasting && !p.def.hung && onLine(1.2).some(([t, c, r]) => t === p.type && Math.abs(c * TILE - p.x) < 2 && Math.abs(r * TILE - p.y) < 2));
  const moved = new Set();
  const out = run(s, 9, () => {
    for (const p of watch) if (p.dead || p.dying || p.body.isSensor || Body.getSpeed(p.body) > 0.5) moved.add(p);
    if (d.bend) {
      inBend++;
      const st = d.bend, q = b.path.at(st.p), fx_ = v.x + Math.cos(v.body.angle) * CHASE.bend.pivot, fy = v.y + Math.sin(v.body.angle) * CHASE.bend.pivot;
      if (st.p - st.p0 > CHASE.bend.merge) off = Math.max(off, Math.hypot(fx_ - q.x, fy - q.y));
      if (st.p > b.length * 0.25) slowest = Math.min(slowest, st.v);
      // (the parked car alongside: the shower of sparks for as long as their flanks overlap)
      const along = Math.abs(v.y - parked.y) < parked.w / 2 - 10;
      if (along) { scraping++; if (fx.rubs.size) rubbing++; }
      for (const r of fx.rubs.values()) maxRub = Math.max(maxRub, r.acc);
    }
    return inBend > 0 && !d.bend;
  }, fx);
  assert.ok(out, 'through it');
  assert.equal(w.player.alive, true);
  assert.equal(d.dead, false, 'nothing it met was the crash');
  assert.ok(off < 8, `on its line within ${off.toFixed(1)} px`);
  assert.ok(slowest >= CHASE.bend.speed * K.floor - 0.3, `never under its floor (${slowest.toFixed(2)} px/step)`);
  assert.ok(Math.abs(v.y - C.legs[1].lanes[1] * TILE) < 8, 'out on his lane of leg 1');
  // what stood on its line is torn off, or thrown and burst (or thrown whole: a dumpster)
  const gone = watch.filter((p) => moved.has(p));
  assert.ok(gone.length >= watch.length * 0.85, `${gone.length} of ${watch.length} things on the line torn or thrown (left: ${watch.filter((p) => !gone.includes(p)).map((p) => p.type)})`);
  assert.ok(watch.filter((p) => p.dead || p.dying).length >= 8, 'and most of them burst');
  // the parked car scraped its whole length: sparks the whole contact, its alarm, a mirror off, dents on both
  assert.ok(scraping > 10, `alongside it ${scraping} steps`);
  assert.ok(rubbing >= scraping * 0.8, `a shower for ${rubbing} of them`);
  assert.equal(parked.alarm > 0, true, 'its alarm');
  assert.deepEqual(parked.sheds, ['car_mirror'], 'its mirror torn off');
  assert.ok(parked.scars >= 4 && v.scars >= 4, `dents on both (${parked.scars}, ${v.scars})`);
  assert.ok(Math.abs(parked.x - 448.14 * TILE) < 24, 'never thrown out of its place');
  // the first thing he smashed: the slow motion's beat
  assert.equal(w.smashes.length, 1, 'told once');
  assert.ok(w.smashes[0].y > 18 * TILE && w.smashes[0].y < 23 * TILE, `at the alley's mouth (${(w.smashes[0].y / TILE).toFixed(1)})`);
});

test('alley: the slow motion as he goes in: x0.35 for about 0.6 s real, then back (ChaseCam "smash", over a bend\'s breath)', () => {
  const w = { events: new EventBus(), drive: { on: true, dead: false, grabbing: false, van: { x: 0, y: 0 } }, player: { alive: true }, camera: quiet, shake() {} };
  const cam = new ChaseCam(w);
  w.events.emit('chaseBend', { phase: 'turn', x: 0, y: 0 });
  assert.equal(cam.beat.kind, 'bend');
  w.events.emit('chaseSmash', { x: 10, y: 50 });
  assert.equal(cam.beat.kind, 'smash', 'over the bend\'s breath');
  let low = 1, slow = 0;
  for (let t = 0; t < 2; t += DT) { cam.update(DT); low = Math.min(low, cam.scale); if (cam.scale <= K.beat.slow + 0.01) slow += DT; }
  assert.ok(Math.abs(low - K.beat.slow) < 1e-6 && Math.abs(K.beat.slow - 0.35) < 1e-9);
  assert.ok(slow > 0.5 && slow < 0.7, `held ${slow.toFixed(2)} s real`);
  assert.equal(cam.scale, 1, 'back');
  // a kill beat under way is never cut into
  cam.open({ kind: 'kill', slow: 0.25, in: 0.05, hold: 0.5, out: 0.1 });
  w.events.emit('chaseSmash', { x: 10, y: 50 });
  assert.equal(cam.beat.kind, 'kill');
});

// ---------------------------------------------------------------- the pursuers
test('alley: pursuers follow him through it; the first to scrape the parked car is wrecked on it, the next ones plough on', () => {
  const s = start(B.at - 16), { w, d, v, P } = s;
  const a = P.spawn(v.x - 260, C.lanes[0] * TILE, 0, 'chase', CHASE.cruise);
  const c = P.spawn(v.x - 520, C.lanes[1] * TILE, 0, 'chase', CHASE.cruise);
  P.assign = function () { for (const k of this.cars) { k.slot = 'abreast'; k.rank = 0; } };
  P.busy = () => true;
  const wrecks = [];
  w.events.on('pursuerWreck', (e) => wrecks.push(e));
  run(s, 14, () => wrecks.length > 0 && [a, c].every((k) => k.state === 'wrecked' || (k.bendI === -1 && !k.bend && k.v.x > (B.path[3][0] - 4) * TILE)));
  assert.ok(wrecks.length >= 1, 'one of them wrecked');
  const [caught, through] = a.state === 'wrecked' && (c.state !== 'wrecked' || a.v.y < c.v.y) ? [a, c] : [c, a];
  assert.equal(caught.state, 'wrecked', 'the first to touch the parked car, on it');
  const parked = w.props.find((p) => p.snare);
  assert.ok(caught.v.y > 22 * TILE && caught.v.y < 36 * TILE, `in the alley, by it (${(caught.v.y / TILE).toFixed(1)}; it at ${(parked.y / TILE).toFixed(1)})`);
  assert.ok(Math.abs(parked.y - 31.1 * TILE) < 3 * TILE, `the parked car about where it was (${(parked.y / TILE).toFixed(1)})`);
  // the other one: through and out on leg 1, or (jammed in the narrow way) wrecked in it; never stuck there
  assert.ok(['chase', 'wrecked'].includes(through.state), `the other one through or wrecked (${through.state} at ${(through.v.x / TILE).toFixed(1)}, ${(through.v.y / TILE).toFixed(1)})`);
  if (through.state === 'chase') {
    run(s, 6, () => through.bendI === -1 && !through.bend && through.v.x > (B.path[3][0] - 4) * TILE);
    assert.ok(through.v.y > 43 * TILE, `out on leg 1 (${(through.v.y / TILE).toFixed(1)})`);
  }
  assert.equal(w.player.alive, true);
});

test('alley: in the slow motion (the world at x0.35) his car goes on through it at its speed, never brought to a crawl', () => {
  const s = start(), { d, v } = s, b = d.route.bends[0];
  let slowest = Infinity, inBend = 0;
  const out = run(s, 9 / 0.35, () => {
    if (d.bend) { inBend++; if (d.bend.p > b.length * 0.25) slowest = Math.min(slowest, d.bend.v); }
    return inBend > 0 && !d.bend;
  }, null, 0.35);
  assert.ok(out, 'through it');
  assert.ok(slowest >= CHASE.bend.speed * K.floor - 0.3, `never under its floor (${slowest.toFixed(2)} px/step)`);
  assert.ok(Math.abs(v.y - C.legs[1].lanes[1] * TILE) < 8, 'out on his lane of leg 1');
});

test('alley: a pursuer in a bend throws things, never a man (he is run down as anywhere)', () => {
  const s = start(), { P, v } = s, car = P.spawn(v.x - 300, C.lanes[1] * TILE, 0, 'chase', CHASE.cruise);
  car.bend = { b: { snared: null } };
  const o = Bodies.circle(0, 0, 10), pair = { isActive: true, isSensor: false };
  const man = { isCivilian: true, def: { hp: 1 }, break() { throw new Error('broken'); } };
  assert.equal(P.smash(car, o, pair, man, { x: 0, y: 6 }), false);
  assert.equal(pair.isSensor, false);
  const box = new Prop(s.w, 'box_stack', 0, 0);
  assert.equal(P.smash(car, box.body, pair, box, { x: 0, y: 6 }), true, 'a box: thrown');
  assert.equal(pair.isSensor, true);
});
