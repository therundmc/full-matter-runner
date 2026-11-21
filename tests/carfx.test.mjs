// A car in trouble (systems/CarFx.js, data/carfx.js): its engine's smoke by damage stage, laid behind it in the
// modelled air; the shower of sparks that follows the rubbing speed and stops with the contact; the budgets per
// QUALITY; what a fire-ball throws; and that none of it touches the chase (his car and the pursuers go the same way
// with and without it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { ctx } from './helpers.mjs';

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: CarFx, smokeStage, showerRate, rubOf, budgetOf } = await load('game/systems/CarFx.js');
const { CARFX } = await load('game/data/carfx.js');
const { SMOKE } = await load('game/data/atmosphere.js');
const { QUALITY } = await load('game/data/quality.js');
const { setQuality, quality } = await load('game/systems/Quality.js');
const { default: Smoke } = await load('game/systems/Smoke.js');
const { default: Pursuit, lanesOf } = await load('game/systems/Pursuit.js');
const { default: Drive } = await load('game/systems/Drive.js');
const { CHASE } = await load('game/data/chase.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: level2a } = await load('game/data/levels/level2a.js');

const { Bodies, Body } = Matter;
const DT = 1 / 60;
// (the effects draw their numbers from Math.random: the same ones every run, this file is its own process)
let seed = 20261119;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const SIZE = { pursuer: [140, 58], convertible: [172, 64], car: [140, 58] };
const at = (level, fn) => { setQuality(level); try { return fn(); } finally { setQuality('high'); } };

// an open yard of road, walled round
function yard(cols = 200, rows = 40) {
  const out = [];
  for (let y = 0; y < rows; y++) {
    let r = '';
    for (let x = 0; x < cols; x++) r += y === 0 || y === rows - 1 || x === 0 || x === cols - 1 ? 'X' : '=';
    out.push(r);
  }
  return out;
}

function vehicle(w, model, x, y) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model], [W, H] = SIZE[model];
  const body = Bodies.rectangle(x, y, W - 4, H - 4, { frictionAir: 0.02, friction: 0.6, restitution: 0.05, label: 'vehicle', collisionFilter: { category: CAT.PROP, mask: MASK.PROP } });
  setMaterial(body, m.kg, 0.9);
  scaleInertia(body, 3);
  body.material = 'metal';
  body.entity = v;
  Object.assign(v, {
    world: w, type: model, m, k: 1, w: W, h: H, body, isVehicle: true, g: ctx, glassPx: { wind: [], rear: [] },
    windows: { wind: 0, rear: 0 }, tires: [true, true, true, true], lamps: [true, true, true, true], hp: m.hp, fuel: 0,
    puddle: 0, alarm: 0, lit: true, flash: 0, moving: false, dead: false, exploded: false, burning: false, rider: null,
    hat: !!m.hat, gun: !!m.gun, drawn: null, def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.props.push(v);
  return v;
}

// what the particles were asked for, counted by emitter (glass, sparks and chips take their count after the cone)
function counted() {
  const n = {}, AT = { glass: 2, sparks: 2, chips: 2 };
  return new Proxy({ n }, { get: (t, k) => (k === 'n' ? n : (x, y, ...rest) => { const c = rest[AT[k] ?? 0]; n[k] = (n[k] || 0) + (typeof c === 'number' ? c : 1); (n.calls ||= []).push([k, x, y, ...rest]); }) });
}

// just enough of World: a map, the physics, the air, the particles counted, the lights and debris kept
function world(rows = yard(), air = true, fx = true) {
  const events = new EventBus(), physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const map = new TileMap(rows);
  physics.add(map.buildBodies());
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const player = {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', weapon: null, ammo: { '9mm': 0 }, riding: null, reloading: 0,
    get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; },
  };
  const w = {
    map, physics, events, player, chars: [player], props: [], corpses: [], projectiles: [], doors: [], windows: [], texts: [], rings: [],
    time: 0, particles: counted(), lights: [], debris: [], sounds: [], timers: [], exited: false, drive: null, power: { on: true }, game: { onExit() {} },
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), shake() {}, noise() {}, flashGlass() {}, addProjectile() {}, onKill() {},
    sound(name) { w.sounds.push(name); }, light(x, y, r, color, t) { w.lights.push({ x, y, r, color, t }); },
    addDebris(d) { w.debris.push(d); }, after(t, fn) { w.timers.push({ t: w.time + t, fn }); }, emit() {},
  };
  if (air) w.smoke = new Smoke(w, { name: 'yard' });
  w.carFx = fx ? new CarFx(w) : { update() {}, puffs: [] };
  return w;
}

// the world's own clock: its timers, the air, the effects (after the physics, as World.step does)
function tick(w, dt = DT) {
  w.time += dt;
  for (const t of w.timers.filter((q) => q.t <= w.time)) { w.timers.splice(w.timers.indexOf(t), 1); t.fn(); }
  w.carFx.update(dt);
  w.smoke?.update(dt);
}

// a car carried along +x at `v` px/step by hand for `sec` s
function roll(w, car, v, sec) {
  for (let t = 0; t < sec - 1e-9; t += DT) {
    Body.setPosition(car.body, { x: car.x + v, y: car.y });
    Body.setVelocity(car.body, { x: v, y: 0 });
    tick(w);
  }
}

// ---------------------------------------------------------------- smoke by stage
test('carfx: the engine\'s smoke by damage: nothing, steam, grey, black, then fire whatever its hp; a blown wreck has its own (pure)', () => {
  const m = VEHICLES.pursuer, car = (gone, o = {}) => ({ m, hp: m.hp * (1 - gone), burning: false, exploded: false, ...o });
  const S = CARFX.smoke, name = (v) => smokeStage(v)?.name ?? null;
  assert.deepEqual(S.stages.map((s) => s.name), ['steam', 'grey', 'black']);
  assert.ok(S.stages.every((s, i) => !i || s.from > S.stages[i - 1].from), 'worse and worse');
  assert.equal(name(car(0)), null);
  assert.equal(name(car(S.stages[0].from - 0.01)), null, 'a few rounds: nothing yet');
  assert.equal(name(car(0.2)), 'steam');
  assert.equal(name(car(0.45)), 'grey');
  assert.equal(name(car(0.6)), 'black');
  assert.equal(name(car(1.2)), 'black', 'hp under zero: still a stage');
  assert.equal(name(car(0.1, { burning: true })), 'fire', 'on fire: fire, whatever is left of it');
  assert.equal(name(car(0.9, { burning: true, exploded: true })), null, 'blown: the wreck burns by itself (Vehicle.update)');
  // what each stage is made of: white steam, then grey, then black soot; flames at the last two only
  const kinds = (s) => s.lay.map((l) => l[0]);
  assert.deepEqual(kinds(S.stages[0]), ['steam']);
  assert.equal(kinds(S.stages[1])[0], 'smoke');
  assert.equal(kinds(S.stages[2])[0], 'soot');
  assert.equal(kinds(S.fire)[0], 'soot');
  assert.deepEqual([S.stages[0].puff[0], S.stages[1].puff[0], S.stages[2].puff[0], S.fire.puff[0]], ['white', 'grey', 'black', 'black'], 'the billows that are seen: the same tones');
  assert.ok(!S.stages[0].flames && !S.stages[1].flames && S.stages[2].flames[0] < 0.5 && S.fire.flames[0] === 1, 'a spit of fire at the black stage, flames all the time once it burns');
  for (const s of [...S.stages, S.fire]) for (const [k] of s.lay) assert.ok(SMOKE.kinds[k], `${k} is a kind of the air`);
  // a pursuer's own stages (CHASE.pursuit.rounds) fall on them: black before it catches, fire then
  const R = CHASE.pursuit.rounds;
  assert.ok(S.stages[2].from < R.fire && R.fire < R.wreck);
});

test('carfx: a damaged car at 60 km/h leaves its plume BEHIND it in the modelled air, unbroken; a whole one leaves nothing', () => {
  const w = world(), hurt = vehicle(w, 'pursuer', 400, 300), whole = vehicle(w, 'pursuer', 400, 700);
  const F = w.smoke.fluid, k = w.smoke.kind;
  hurt.hp = hurt.m.hp * 0.55; // 45 % gone: grey
  hurt.moving = whole.moving = true;
  for (let t = 0; t < 1; t += DT) {
    for (const c of [hurt, whole]) { Body.setPosition(c.body, { x: c.x + CHASE.cruise, y: c.y }); Body.setVelocity(c.body, { x: CHASE.cruise, y: 0 }); }
    tick(w);
  }
  const row = (car, kind, dxs) => dxs.map((dx) => F.densityAt(car.x + dx, car.y, kind));
  const behind = row(hurt, k.smoke, [-80, -140, -200, -260, -320]);
  assert.ok(behind.every((d) => d > 0.08), `grey smoke all along its way: ${behind.map((d) => d.toFixed(2))}`);
  assert.ok(F.densityAt(hurt.x + 140, hurt.y, k.smoke) < 0.01, 'none ahead of it');
  assert.ok(Math.max(...row(hurt, k.soot, [-80, -200, -320])) < 0.01, 'no soot yet');
  assert.ok(Math.max(...row(whole, k.smoke, [-80, -200, -320, 0])) < 0.01, 'a whole car: nothing');
  // what is seen of it: grey billows strung behind it, none ahead, riding the air
  const P = w.carFx.puffs;
  assert.ok(P.length > 20 && P.every((p) => p.tone === 'grey'), `${P.length} billows`);
  assert.ok(P.every((p) => p.x < hurt.x + 60 && Math.abs(p.y - hurt.y) < 60), 'behind its hood, on its line');
  assert.ok(Math.min(...P.map((p) => p.x)) < hurt.x - 200, 'a trail, not a ball on its roof');
  // worse: black soot; on fire: flames out of the hood too
  hurt.hp = hurt.m.hp * 0.4;
  roll(w, hurt, CHASE.cruise, 0.5);
  assert.ok(F.densityAt(hurt.x - 120, hurt.y, k.soot) > 0.1 && w.carFx.puffs.some((p) => p.tone === 'black'), 'black');
  const before = w.particles.n.fire || 0;
  hurt.burning = true;
  roll(w, hurt, CHASE.cruise, 0.5);
  assert.ok((w.particles.n.fire || 0) - before >= 30, 'flames licking out of the hood while it burns');
  const flame = w.particles.n.calls.filter((c) => c[0] === 'fire').pop();
  assert.ok(flame[5].vx > CHASE.cruise * 60 * 0.5, 'carried along with the car');
});

test('carfx: standing, a damaged engine still smokes (a steady source), and stops when the car is blown', () => {
  const w = world(), v = vehicle(w, 'car', 400, 300), F = w.smoke.fluid;
  v.hp = v.m.hp * 0.8;
  for (let t = 0; t < 1.5; t += DT) tick(w);
  const hood = w.carFx.hood(v);
  assert.ok(F.densityAt(hood.x, hood.y, w.smoke.kind.steam) > 0.1, 'steam over the hood');
  assert.ok(w.carFx.puffs.length >= 1 && w.carFx.puffs.every((p) => p.tone === 'white'));
  v.exploded = true;
  w.carFx.puffs.length = 0;
  for (let t = 0; t < 0.5; t += DT) tick(w);
  assert.equal(w.carFx.puffs.length, 0);
});

// ---------------------------------------------------------------- sparks where it scrapes
test('carfx: the shower follows the rubbing speed: none under a crawl, more the faster, capped (pure)', () => {
  const S = CARFX.scrape;
  assert.equal(showerRate(0), 0);
  assert.equal(showerRate(S.from), 0);
  assert.ok(showerRate(2) > 0 && showerRate(4) > showerRate(2) * 1.5 && showerRate(CHASE.cruise) > showerRate(4) * 1.5, 'sized by it');
  assert.ok(showerRate(CHASE.cruise) >= 150, 'a real shower at 60 km/h');
  assert.equal(showerRate(1000), S.most);
  // how fast two things rub: what slides along the contact; two cars side by side at the same speed still grind
  const n = { x: 0, y: 1 };
  assert.equal(rubOf({ x: 8, y: 0 }, { x: 0, y: 0 }, n), 8, 'along a wall: all of its speed');
  assert.equal(rubOf({ x: 0, y: 5 }, { x: 0, y: 0 }, n), 0, 'square into it: no slide');
  assert.equal(rubOf({ x: 8, y: 0 }, { x: 8, y: 0 }, n), 0, 'two things going together: none');
  assert.ok(rubOf({ x: 8.9, y: 0 }, { x: 8.9, y: 0 }, n, true) > CARFX.scrape.from * 2, 'two CARS leaning on each other at speed: their flanks grind');
  assert.ok(rubOf({ x: 8.9, y: 0 }, { x: 5, y: 0 }, n, true) > rubOf({ x: 8.9, y: 0 }, { x: 8.9, y: 0 }, n, true), 'more as one passes the other');
});

// a car's flank held on a wall: the contact as the physics would tell it
function rubbing(w, car, speed) {
  const wall = Bodies.rectangle(car.x, car.y + car.h / 2 + 10, 4000, 20, { isStatic: true });
  let on = true;
  w.physics.activePairs = () => (on ? [{ id: 'A1B2', isActive: true, isSensor: false, bodyA: car.body, bodyB: wall, collision: { normal: { x: 0, y: 1 }, supports: [{ x: car.x + 30, y: car.y + car.h / 2 }, { x: car.x - 30, y: car.y + car.h / 2 }], supportCount: 2 } }] : []);
  const go = (sec, v = speed) => { const n0 = w.particles.n.hot || 0; roll(w, car, v, sec); return (w.particles.n.hot || 0) - n0; };
  return { go, off() { on = false; }, on() { on = true; } };
}

test('carfx: a car grinding along a wall throws sparks for as long as it rubs, by its speed, and stops when the contact ends', () => {
  const w = world(yard(), false), car = vehicle(w, 'pursuer', 400, 300), r = rubbing(w, car, 8.9);
  const fast = r.go(1);
  assert.ok(Math.abs(fast - showerRate(8.9)) <= showerRate(8.9) * 0.1, `about showerRate a second: ${fast} for ${showerRate(8.9)}`);
  const slow = r.go(1, 3);
  assert.ok(slow > 20 && slow < fast * 0.4, `slower: fewer (${slow})`);
  assert.equal(r.go(1, 0.5), 0, 'a crawl: none');
  // every step of it, not a burst now and then
  const per = [];
  for (let i = 0; i < 30; i++) per.push(r.go(DT));
  assert.ok(per.filter((n) => n > 0).length >= 28, 'continuous');
  // thrown back off the contact, carried part of the way with the car, bouncing
  const [, x, y, , o] = w.particles.n.calls.filter((c) => c[0] === 'hot').pop();
  assert.ok(Math.abs(y - (car.y + car.h / 2)) < 1 && Math.abs(x - car.x) < 40, 'from the contact');
  assert.ok(o.vx > 0 && o.vx < 8.9 * 60 && o.hops >= 1 && o.mark > 0, 'slower than the car: they stream back past it; they bounce and mark the road');
  // lit, heard, the paint scored (and no more scores than the cap)
  assert.ok(w.lights.length > 5 && w.sounds.includes('carGrind'));
  assert.ok(w.carFx.state(car).scores > 3 && w.carFx.state(car).scores <= CARFX.scrape.paint.most);
  // the contact ends: nothing more, at once
  r.off();
  const lights = w.lights.length, sounds = w.sounds.length;
  assert.equal(r.go(0.5), 0, 'no contact, no sparks');
  assert.ok(w.lights.length === lights && w.sounds.length === sounds && w.carFx.rubs.size === 0);
  r.on();
  assert.ok(r.go(0.2) > 10, 'and again when it touches again');
});

test('carfx: a bare rim throws sparks off the road while the car moves; a wreck sliding too; a car standing neither', () => {
  const w = world(yard(), false), car = vehicle(w, 'pursuer', 400, 300), n = () => w.particles.n.hot || 0;
  roll(w, car, 8.9, 0.5);
  assert.equal(n(), 0, 'four tyres: none');
  car.tires[1] = false;
  roll(w, car, 8.9, 1);
  const rim = n();
  assert.ok(rim > 60, `a stream off the rim: ${rim}`);
  const wheel = car.toWorld(...car.m.wheels[1]), last = w.particles.n.calls.filter((c) => c[0] === 'hot').pop();
  assert.ok(Math.hypot(last[1] - wheel.x, last[2] - wheel.y) < 12, 'at that wheel');
  assert.ok(w.sounds.includes('rimGrind'));
  roll(w, car, 0, 0.5);
  assert.equal(n(), rim, 'standing: none');
  car.tires[1] = true;
  car.pursuer = { state: 'wrecked' };
  roll(w, car, 6, 0.5);
  assert.ok(n() > rim + 15, 'a wreck sliding: sparks from under it');
});

// ---------------------------------------------------------------- budgets
test('carfx: the budgets by QUALITY: LOW throws a third of the sparks and lays no light, HIGH the full show, never over the caps', () => {
  const B = CARFX.budget;
  assert.deepEqual(budgetOf(QUALITY.high), { sparks: B.sparks, burst: B.burst, lights: B.lights, burning: B.burning });
  assert.equal(budgetOf(QUALITY.low).lights, 0);
  assert.ok(budgetOf(QUALITY.low).sparks < budgetOf(QUALITY.medium).sparks && budgetOf(QUALITY.medium).sparks < B.sparks);
  assert.ok(budgetOf(QUALITY.low).burning < budgetOf(QUALITY.medium).burning && budgetOf(QUALITY.medium).burning <= B.burning);
  const show = (level) => at(level, () => {
    // everything at once for two seconds: four contacts at full speed, a bare rim, an engine on fire, three fire-balls
    const w = world(yard(), false), cars = [0, 1, 2, 3].map((i) => vehicle(w, 'pursuer', 400, 200 + i * 200));
    const pairs = cars.map((c, i) => ({ id: 'p' + i, isSensor: false, bodyA: c.body, bodyB: { isStatic: true }, collision: { normal: { x: 0, y: 1 }, supports: [{ x: c.x, y: c.y + 29 }], supportCount: 1 } }));
    w.physics.activePairs = () => pairs;
    cars[0].tires[0] = false;
    cars[1].burning = true;
    let most = 0;
    for (let t = 0; t < 2; t += DT) {
      for (const c of cars) { Body.setPosition(c.body, { x: c.x + 12, y: c.y }); Body.setVelocity(c.body, { x: 12, y: 0 }); pairs[cars.indexOf(c)].collision.supports[0].x = c.x; }
      if (Math.abs(t - 0.5) < DT / 2) for (const c of cars.slice(0, 3)) w.carFx.boom('crash', { x: c.x, y: c.y }, null, c);
      tick(w);
      most = Math.max(most, w.carFx.puffs.length);
    }
    return { sparks: w.particles.n.hot || 0, lights: w.lights.length, pieces: w.debris.length, puffs: most };
  });
  const hi = show('high'), mid = show('medium'), lo = show('low');
  // (2 s of budget, the half second it may hold in reserve, and the fire-balls' own bursts, each capped)
  const cap = (q) => budgetOf(q).sparks * 2.5 + 3 * 2 * budgetOf(q).burst;
  assert.ok(hi.sparks > B.sparks * 1.5 && hi.sparks <= cap(QUALITY.high), `HIGH: ${hi.sparks}`);
  assert.ok(mid.sparks < hi.sparks && mid.sparks <= cap(QUALITY.medium), `MEDIUM: ${mid.sparks}`);
  assert.ok(lo.sparks < mid.sparks && lo.sparks <= cap(QUALITY.low) && lo.sparks < hi.sparks * 0.5, `LOW: ${lo.sparks}`);
  assert.equal(lo.lights, 0, 'LOW: no extra light');
  assert.ok(hi.lights > 20 && hi.lights <= B.lights * 2 + 5, `HIGH: ${hi.lights} lights in 2 s`);
  assert.ok(mid.lights > 0 && mid.lights <= QUALITY.medium.fxLights * 2 + 5 && mid.lights < hi.lights);
  assert.ok(hi.pieces <= B.burning && mid.pieces <= budgetOf(QUALITY.medium).burning && lo.pieces <= budgetOf(QUALITY.low).burning && lo.pieces < hi.pieces, `burning pieces: ${hi.pieces} ${mid.pieces} ${lo.pieces}`);
  assert.ok(hi.puffs <= CARFX.puffs.most && lo.puffs <= Math.round(CARFX.puffs.most * QUALITY.low.fx) && lo.puffs < hi.puffs, `billows: ${hi.puffs} ${lo.puffs}`);
  assert.equal(quality().level, 'high');
});

// ---------------------------------------------------------------- boom
test('carfx: a pursuer stopped: its engine goes in a fire-ball in stages and throws burning pieces that meet walls only', () => {
  const w = world(), car = vehicle(w, 'pursuer', 600, 400), K = CARFX.boom.engine;
  Body.setVelocity(car.body, { x: 8.9, y: 0 });
  w.events.emit('pursuerWreck', { car, x: car.x, y: car.y });
  const n = w.particles.n, hood = w.carFx.hood(car);
  // at once: the flash (a light, never the whole picture), the shock front, the white-hot core, sparks, glass
  assert.ok(w.lights.some((l) => Math.abs(l.r - K.R * K.flash) < 1 && Math.hypot(l.x - hood.x, l.y - hood.y) < 1), 'the flash: a light at the hood');
  assert.ok(w.lights.every((l) => l.r <= 200), 'local: nothing the size of the picture');
  assert.equal(w.rings.length, 1);
  assert.equal(n.fire, K.core[0], 'the core');
  assert.equal(n.hot, K.sparks);
  assert.equal(n.glass, K.glass);
  // its pieces: the count, alight, thrown up, and nothing a car or a man can meet
  assert.equal(w.debris.length, K.debris[0], 'its burning pieces');
  assert.equal(w.carFx.pieces.length, K.debris[0]);
  for (const d of w.debris) {
    assert.equal(d.body.collisionFilter.mask, CAT.WALL | CAT.EDGE, 'walls only');
    assert.ok(!d.harm && d.z > 0 && d.vz > 0);
    assert.ok((d.body.collisionFilter.mask & car.body.collisionFilter.category) === 0, 'never a car');
  }
  // then: the orange balls, the soot into the modelled air, the pop
  const soot0 = w.smoke.fluid.densityAt(hood.x, hood.y, w.smoke.kind.soot);
  for (let t = 0; t < 1; t += DT) tick(w);
  assert.ok(n.fire >= K.core[0] + K.lobes * K.lobe[0], 'the lobes');
  assert.ok(w.smoke.fluid.kinds[w.smoke.kind.soot].peak > 0.5 && soot0 === 0, 'its soot in the air, a moment later');
  assert.ok(w.carFx.puffs.filter((p) => p.tone === 'black').length >= K.puffs / 2, 'the black billows');
  assert.equal(w.sounds.filter((s) => s === 'carPop').length, K.pops[0], 'the pop that follows');
  // while they fly they burn (flames, a thread of soot), then go out
  const fire = n.fire;
  for (const d of w.debris) Body.setPosition(d.body, { x: d.body.position.x + 3, y: d.body.position.y });
  tick(w);
  assert.ok(n.fire > fire, 'alight');
  for (let t = 0; t < K.debris[4] + 0.2; t += DT) tick(w);
  assert.equal(w.carFx.pieces.length, 0, 'burnt out');
  // a blown car gets nothing from the wreck's event (its own explosion is told by `explosion`)
  const w2 = world(yard(), false), c2 = vehicle(w2, 'pursuer', 600, 400);
  c2.exploded = true;
  w2.events.emit('pursuerWreck', { car: c2, x: c2.x, y: c2.y });
  assert.equal(w2.debris.length, 0);
  w2.events.emit('explosion', { x: 600, y: 400, radius: 160, source: 'car' });
  assert.equal(w2.debris.length, CARFX.boom.car.debris[0], 'a car\'s real explosion: the pieces it throws');
  assert.equal(w2.lights.length, 0, 'no flash of its own over the explosion\'s');
  at('low', () => {
    const w3 = world(yard(), false), c3 = vehicle(w3, 'pursuer', 600, 400);
    w3.events.emit('pursuerWreck', { car: c3, x: c3.x, y: c3.y });
    assert.equal(w3.debris.length, Math.round(K.debris[0] * QUALITY.low.fx), 'LOW: fewer');
    assert.equal(w3.lights.length, 0);
  });
});

test('carfx: rounds on a car spark off its bodywork; a window taken throws more glass; a tyre shot out bursts in smoke', () => {
  const w = world(), car = vehicle(w, 'pursuer', 600, 400), n = w.particles.n;
  w.events.emit('carStruck', { car, x: car.x, y: car.y - 27, dirA: Math.PI / 2 });
  assert.equal(n.hot, CARFX.rounds.sparks);
  const o = n.calls.find((c) => c[0] === 'hot')[4];
  assert.ok(Math.abs(o.a - (Math.PI / 2 + Math.PI)) < 1e-9 && o.hops > 0, 'back toward the shooter, bouncing');
  assert.equal(w.lights.length, 1, 'a glint');
  car.windows.rear = 2;
  w.events.emit('carPart', { car, part: 'rear', dirA: 0 });
  assert.equal(n.glass, CARFX.glass.more[1]);
  const F = w.smoke.fluid, wheel = car.toWorld(...car.m.wheels[0]);
  w.events.emit('carPart', { car, part: 'tyre', i: 0, dirA: 0 });
  assert.ok(F.densityAt(wheel.x, wheel.y, w.smoke.kind.smoke) > 0.2, 'rubber smoke at the wheel');
  // tyres letting go (a shove, a burn-out): smoke in the air and white billows at each wheel
  const at4 = car.m.wheels.map(([sx, sy]) => car.toWorld(sx, sy));
  w.carFx.puffs.length = 0;
  for (let i = 0; i < 30; i++) w.events.emit('tyres', { car, at: at4, k: 1 });
  assert.ok(w.carFx.puffs.length > 10 && w.carFx.puffs.every((p) => p.tone === 'white'));
  assert.ok(at4.every((q) => F.densityAt(q.x, q.y, w.smoke.kind.steam) > 0.05));
});

// ---------------------------------------------------------------- nothing of it touches the chase
// the same seconds of chase (a pursuer alongside shot up, shoved, wrecked; his car steered into the fronts), with the
// effects and without: his car and the pursuer are where they were, to the last bit
function chase(fx) {
  const real = Math.random;
  Math.random = () => 0.5; // (the effects draw numbers too: the chase must not depend on how many)
  const ram = CHASE.pursuit.ram.chance, range = CHASE.gunman.range;
  CHASE.pursuit.ram.chance = 0; CHASE.gunman.range = 0;
  try {
    const w = world(level2a.tiles, false, fx), LANES = level2a.chase.lanes, v = vehicle(w, CHASE.vehicle, 20 * TILE, LANES[1] * TILE);
    w.physics.freezeIfHeavy(v.body);
    w.addDebris = (d) => { w.debris.push(d); w.physics.add(d.body); }; // (its pieces are real bodies)
    w.camera = { push() {} };
    w.view = () => ({ x: v.x + 100, y: v.y, hw: 320, hh: 180 });
    if (fx) w.smoke = new Smoke(w, { name: 'level2a' });
    const chaseO = { ...level2a.chase, events: [], intro: null };
    w.drive = new Drive(w, { ...chaseO, arms: null, van: [20, LANES[1]], end: null }, v);
    w.pursuit = new Pursuit(w, chaseO);
    w.pursuit.spawn = function (x, y, a, state, speed = 0) { const car = this.add(vehicle(w, 'pursuer', x, y), state, { speed }); this.loose(car); return car; };
    const car = w.pursuit.spawn(v.x, LANES[0] * TILE, 0, 'chase', 8.9);
    w.pursuit.assign = function () { this.road = lanesOf(this.target().y, this.band, this.road); car.slot = 'abreast'; };
    const held = new Set(), pressed = new Set(), input = { down: (c) => held.has(c), hit: (c) => pressed.delete(c), mouseHit: () => false, mouseDown: () => false };
    const trace = [];
    let n = 0;
    for (let t = 0; t < 6; t += DT, n++) {
      if (n === 30) car.v.hp = car.v.m.hp * 0.5;            // shot up: it smokes
      if (n === 90) { car.v.hp = car.v.m.hp * 0.3; car.v.burning = true; car.v.fuse = Infinity; } // on fire (wrecked by its burn)
      if (n === 60) pressed.add('Space');                    // the shove, toward it
      if (n === 200) held.add('KeyS');                       // then into the fronts on his side
      if (n === 300) held.delete('KeyS');
      w.time += DT;
      w.drive.step(DT, input, { x: v.x, y: car.v.y });
      w.pursuit.step(DT);
      w.physics.step(DT, w.time);
      w.drive.after(DT);
      w.pursuit.after(DT);
      for (const q of w.timers.filter((q) => q.t <= w.time)) { w.timers.splice(w.timers.indexOf(q), 1); q.fn(); }
      w.carFx.update(DT);
      w.smoke?.update(DT);
      trace.push([v.x, v.y, v.body.angle, w.drive.v, w.drive.u, car.v.x, car.v.y, car.v.body.angle, car.v.hp, car.state]);
    }
    return { trace, w, car };
  } finally { Math.random = real; CHASE.pursuit.ram.chance = ram; CHASE.gunman.range = range; }
}

test('carfx: looks only: his car\'s speed and place and the pursuer\'s path are the same with the effects and without', () => {
  const on = chase(true), off = chase(false);
  // the show did happen: smoke, sparks, a fire-ball and its pieces, tyre smoke
  const n = on.w.particles.n;
  assert.equal(on.car.state, 'wrecked');
  assert.ok(n.hot > 30 && n.fire > 30 && on.w.debris.length >= CARFX.boom.engine.debris[0] && on.w.smoke.fluid.steps > 20, `sparks ${n.hot}, flames ${n.fire}, pieces ${on.w.debris.length}`);
  assert.ok(!off.w.particles.n.hot && off.w.debris.length < on.w.debris.length, 'and not without it');
  assert.equal(on.trace.length, off.trace.length);
  for (let i = 0; i < on.trace.length; i++) assert.deepEqual(on.trace[i], off.trace[i], `step ${i}`);
  const last = on.trace[on.trace.length - 1];
  assert.ok(last[0] > 20 * TILE + 5 * 60 * 5, 'and he did drive on');
});
