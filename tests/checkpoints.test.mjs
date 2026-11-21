// The chase's checkpoints (level 2A, docs/LEVEL2.md "Story and structure"; systems/Checkpoints.js): one a part of the
// road as it was cut (the street, the detour, the frontage road, the toll); reached, it is kept on the game; a death
// after it retries there (the car on its leg's lane, rolling, the events behind it not replayed, the clock and the
// score as they were); RESTART and a start from the menus start from the beginning; the tutorial's rooms unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { ctx, quiet } from './helpers.mjs';

// no DOM under Node: what the cars paint on themselves goes nowhere
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Checkpoints, fromCheckpoint, resumeAt } = await load('game/systems/Checkpoints.js');
const { default: Drive } = await load('game/systems/Drive.js');
const { default: Pursuit } = await load('game/systems/Pursuit.js');
const { default: Scoring } = await load('game/systems/Scoring.js');
const { legAt, along, routeOf } = await load('game/systems/Route.js');
const { CHASE } = await load('game/data/chase.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: LevelFlow, introCard } = await load('game/flow/LevelFlow.js');
const { default: MenuInput } = await load('game/flow/MenuInput.js');
const { default: level2a } = await load('game/data/levels/level2a.js');
const { default: level1 } = await load('game/data/levels/level1.js');
const { default: tutorial } = await load('game/data/levels/tutorial.js');
const { default: lab } = await load('game/data/levels/lab.js');

const { Bodies } = Matter;
const DT = 1 / 60;
const C = level2a.chase, CP = C.checkpoints, B = C.bends[0];
const SIZE = { pursuer: [140, 58], convertible: [172, 64] };
const named = (n) => ({ ...CP.find((c) => c.name === n), i: CP.findIndex((c) => c.name === n) });

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
    map, physics, events, level: level2a, chars: [], props: [], corpses: [], projectiles: [], debris: [], items: [], windows: [], doors: [], rings: [],
    texts: [], time: 0, particles: quiet, decals: quiet, papers: quiet, smoke: quiet, camera: quiet, kills: [], told: [],
    exited: false, cleared: false, drive: null, totalEnemies: 0, game: { onExit() {}, flash() {} }, clockFrom: 0,
    get runTime() { return Math.max(0, this.time - (this.clockFrom || 0)); },
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), sound() {}, shake() {}, noise() {}, light() {},
    addDebris() {}, removeDebris() {}, flashGlass() {}, hitstop() {}, emit() {}, damageWall() {}, after() {},
    addProjectile(p) { w.projectiles.push(p); }, onKill() {},
  };
  w.player = {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', reloading: 0, reloadDur: 1, world: w,
    weapon: null, ammo: {}, get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; },
    kill() { this.alive = false; },
  };
  w.chars.push(w.player);
  for (const [type, col, row, deg = 0] of level2a.props) {
    if (VEHICLES[type] || col < c0 || col > c1) continue;
    w.props.push(new Prop(w, type, col * TILE, row * TILE, (deg * Math.PI) / 180));
  }
  w.scoring = new Scoring(w);
  events.on('checkpoint', (e) => w.told.push(e));
  return w;
}

const keys = () => ({ held: new Set(), down: () => false, hit: () => false, mouseHit: () => false, mouseDown: () => false });

// World as it builds the chase (its checkpoints, the chase as from the one it resumes at, the drive, the pursuit) at
// the game's `at`; without the water nor the opening's props (none in this mini world)
function build(at, c0, c1) {
  const w = world(c0, c1);
  w.game.chaseAt = at;
  w.checkpoints = Checkpoints.of(w, level2a, at);
  const chase = fromCheckpoint(C, w.checkpoints?.from);
  const start = chase.start ?? chase.van, v = vehicle(w, CHASE.vehicle, start[0] * TILE, start[1] * TILE);
  w.drive = new Drive(w, { ...chase, water: null }, v);
  w.pursuit = new Pursuit(w, chase);
  w.checkpoints.resume();
  return { w, d: w.drive, P: w.pursuit, v, chase, input: keys() };
}

// World.step's order (no wheel: the car runs on in its lane)
function run(s, sec, until = null) {
  const { w, d, P, input } = s;
  for (let t = 0; t < sec; t += DT) {
    w.time += DT;
    d.step(DT, input, null);
    P.step(DT);
    w.checkpoints.step(DT);
    w.physics.step(DT, w.time);
    d.after(DT);
    P.after(DT);
    if (until?.()) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the data
test('checkpoints: one a part of 2A as it was cut, in order: the street (the start), then the on-ramp just out of the detour', () => {
  assert.deepEqual(CP.map((c) => c.name), ['THE STREET', 'THE ON-RAMP']);
  assert.ok(CP[1].at > CP[0].at);
  assert.ok(CP[0].at <= C.van[0], 'the first is the start itself');
  const { legs, bends } = routeOf(C), legOf = (c) => legAt(legs, c.at * TILE), bend = bends[0];
  const ramp = named('THE ON-RAMP');
  // just past the bend's way out, on the leg it hands the car to, with the road's pursuers still ahead of it
  assert.equal(legOf(ramp), bend.to);
  assert.ok(ramp.at * TILE > B.path.at(-1)[0] * TILE - 1);
  assert.ok(C.events.some((e) => e.at > ramp.at), 'pursuers still to come after it');
});

test('checkpoints: the chase as from one: the car at its column on ours, rolling at its leg\'s cruise, the events behind it gone, no opening', () => {
  assert.equal(fromCheckpoint(C, null), C, 'from the beginning: the chase as it is');
  assert.equal(fromCheckpoint(C, named('THE STREET')), C, 'the start\'s own: the chase as it is');
  const legs = routeOf(C).legs;
  for (const name of ['THE ON-RAMP']) {
    const cp = named(name), ch = fromCheckpoint(C, cp), leg = legs[legAt(legs, cp.at * TILE)];
    assert.deepEqual(ch.start, [cp.at, leg.lanes.at(-1)], `${name}: ours, the leg's last lane`);
    assert.equal(ch.speed, leg.cruise);
    assert.deepEqual(ch.van, C.van, 'the route is still measured from the start');
    assert.equal(ch.intro, null);
    assert.ok(ch.events.every((e) => e.at > cp.at));
    assert.deepEqual(ch.events, C.events.filter((e) => e.at > cp.at), 'those ahead armed as they are');
    assert.equal(ch.bends, C.bends);
  }
  assert.equal(C.intro, 'drag', 'the level\'s own chase untouched');
});

test('checkpoints: a retry resumes only at a checkpoint kept for this very level', () => {
  const at = { name: level2a.name, i: 1, time: 31, score: null, guards: 8 };
  const cp = resumeAt(level2a, at);
  assert.equal(cp.name, 'THE ON-RAMP');
  assert.equal(cp.at, CP[1].at);
  assert.equal(cp.time, 31);
  assert.equal(resumeAt(level2a, { ...at, name: 'ANOTHER' }), null);
  assert.equal(resumeAt(level2a, null), null);
  assert.equal(resumeAt(level2a, { ...at, i: 9 }), null);
});

test('checkpoints: levels without them have none (level 1, the tutorial, the lab): their restart is unchanged', () => {
  for (const L of [level1, tutorial, lab]) assert.equal(Checkpoints.of({}, L, { name: L.name, i: 1 }), null, L.name);
});

// ---------------------------------------------------------------- reached
test('checkpoints: reached by his car, each is kept on the game with the clock and the score then; the start kept silently', () => {
  const events = new EventBus(), told = [], sounds = [];
  events.on('checkpoint', (e) => told.push(e));
  const w = {
    events, level: level2a, game: {}, time: 0, runTime: 0, totalEnemies: 2, exited: false, player: { alive: true },
    scoring: { snapshot: () => ({ points: w.runTime * 10 }) }, sound: (n) => sounds.push(n),
    drive: { on: true, dead: false, car: { x: C.van[0] * TILE, y: 0 } },
  };
  const k = Checkpoints.of(w, level2a, null);
  k.step(DT);
  const legY = routeOf(C).legs[1].lanes.at(-1) * TILE;
  w.drive.car.y = legY;
  assert.equal(w.game.chaseAt.i, 0, 'the start: kept');
  assert.equal(told.length, 0, 'never told');
  assert.equal(k.view, null);
  w.drive.car.x = CP[1].at * TILE - 1; w.runTime = 24.5; w.totalEnemies = 10;
  k.step(DT);
  assert.equal(w.game.chaseAt.i, 0);
  w.drive.car.x = CP[1].at * TILE + 2;
  k.step(DT);
  assert.deepEqual(w.game.chaseAt, { name: level2a.name, i: 1, time: 24.5, score: { points: 245 }, guards: 10 });
  assert.deepEqual(told.map((e) => e.name), ['THE ON-RAMP']);
  assert.deepEqual(sounds, ['checkpoint']);
  assert.equal(k.view.name, 'THE ON-RAMP', 'its name stamped on the HUD');
  for (let t = 0; t < CHASE.checkpoint.hold + 0.1; t += DT) k.step(DT);
  assert.equal(k.view, null, 'a moment only');
});

test('checkpoints: dead at the wheel, nothing is kept', () => {
  const w = {
    events: new EventBus(), level: level2a, game: {}, time: 0, runTime: 0, totalEnemies: 2, exited: false, player: { alive: true },
    scoring: { snapshot: () => ({}) }, sound: () => {},
    drive: { on: true, dead: false, car: { x: C.van[0] * TILE, y: 0 } },
  };
  const k = Checkpoints.of(w, level2a, null);
  k.step(DT);
  w.drive.dead = true;
  w.drive.car.x = CP[1].at * TILE + 2;
  k.step(DT);
  assert.equal(w.game.chaseAt.i, 0);
});

// ---------------------------------------------------------------- the retry
test('checkpoints: a run through 2A records them in turn; the score earned is kept with each', () => {
  const s = build(null, 400, 480);
  // straight to the on-ramp's column: the car placed short of it on leg 1 (the run up to it is the other tests')
  const { d, w } = s;
  Matter.Body.setPosition(d.car.body, { x: (CP[1].at - 3) * TILE, y: routeOf(C).legs[1].lanes.at(-1) * TILE });
  w.scoring.points = 1200; w.scoring.kills = 4; w.scoring.methods.add('wreck');
  let then = null;
  w.events.on('checkpoint', () => { then = w.scoring.points; });
  assert.ok(run(s, 1, () => w.game.chaseAt?.i === 1), 'the on-ramp reached');
  assert.ok(then >= 1200);
  assert.equal(w.game.chaseAt.score.points, then, 'the score as it was when reached');
  assert.deepEqual(w.game.chaseAt.score.methods, ['wreck']);
});

test('checkpoints: a death after THE ON-RAMP retries on leg 1 out of the detour\'s corner, its pursuer from behind still to come', () => {
  const cp = named('THE ON-RAMP');
  const s = build({ name: level2a.name, i: cp.i, time: 31, score: null, guards: 10 }, cp.at - 8, cp.at + 40);
  const { d, P, v } = s;
  const leg1 = d.route.legs[1];
  assert.equal(d.legI, 1);
  assert.equal(d.bendI, -1, 'no bend left');
  assert.ok(Math.abs(v.y - leg1.lanes.at(-1) * TILE) < 1, 'in ours (the south lane)');
  assert.ok(Math.abs(v.body.angle) < 1e-9, 'heading on along the road');
  assert.equal(d.v, leg1.cruise);
  assert.ok(run(s, 1.5, () => P.cars.length > 0), 'the frontage road\'s pursuer set off');
  assert.deepEqual([...P.fired].map((e) => e.at), [C.events.find((e) => e.at > cp.at).at]);
  assert.equal(d.bend, null);
});

test('checkpoints: resumed, the score as it was kept (the chain under way not kept)', () => {
  const w = world(0, 0), sc = w.scoring;
  Object.assign(sc, { points: 900, kills: 3, maxCombo: 2, shots: 40, hits: 2, alerts: 0, civilians: 1, combo: 2 });
  sc.methods.add('wreck'); sc.styled.wreck = 2;
  const kept = sc.snapshot(), next = new Scoring(world(0, 0));
  next.restore(kept);
  for (const k of ['points', 'kills', 'maxCombo', 'shots', 'hits', 'alerts', 'civilians']) assert.equal(next[k], sc[k], k);
  assert.deepEqual([...next.methods], ['wreck']);
  assert.deepEqual(next.styled, { wreck: 2 });
  assert.equal(next.combo, 0);
  sc.styled.wreck = 5;
  assert.equal(next.styled.wreck, 2, 'a copy');
});

// ---------------------------------------------------------------- the game
test('game: a retry after a death keeps the chase\'s checkpoint and the tutorial\'s room; RESTART and a start from the menus forget both', () => {
  const g = { tutorialAt: { name: 'T', stage: 2 }, chaseAt: { name: 'C', i: 2 }, taught: new Set(['x']) };
  new LevelFlow(g).forget(true, true);             // R / the pad's A / RETRY, dead
  assert.deepEqual(g.chaseAt, { name: 'C', i: 2 });
  assert.equal(g.tutorialAt.stage, 2);
  new LevelFlow(g).forget(true, false);            // RESTART in the pause, Backspace
  assert.equal(g.chaseAt, null, 'from the beginning');
  assert.equal(g.tutorialAt, null, 'the tutorial from its beginning too');
  assert.ok(g.taught.has('x'), 'its lessons taught kept');
  g.chaseAt = { name: 'C', i: 1 };
  g.tutorialAt = { name: 'T', stage: 1 };
  new LevelFlow(g).forget(false, false);           // the menus, the LEVELS page, the next level
  assert.equal(g.chaseAt, null);
  assert.equal(g.tutorialAt, null);
  assert.equal(g.taught.size, 0);
  // which way each goes
  const calls = [], stub = { levelId: 'level2a', startLevel: (id, o) => calls.push([id, o]) };
  new LevelFlow(stub).retry();
  new LevelFlow(stub).restart();
  assert.deepEqual(calls, [['level2a', { retry: true, resume: true }], ['level2a', { retry: true }]]);
  // the menu's RETRY (dead) and RESTART
  const applied = [], g2 = { retry: () => applied.push('retry'), restart: () => applied.push('restart') };
  new MenuInput(g2).apply({ type: 'retry' });
  new MenuInput(g2).apply({ type: 'restart' });
  assert.deepEqual(applied, ['retry', 'restart']);
});

test('game: resumed at a checkpoint, the level\'s card shows the part\'s name', () => {
  const level = { ...level2a, subtitle: 'X' };
  const card = (from) => introCard({ world: { level, checkpoints: from ? { from } : null }, best: null, levelId: 'level2a', input: {} });
  assert.equal(card(null).level.name, level2a.name);
  assert.equal(card({ name: 'THE TOLL' }).level.name, 'THE TOLL');
  assert.equal(card({ name: 'THE TOLL' }).level.subtitle, 'X');
});

test('checkpoints: the men counted at a checkpoint leave out those still in a car (the retry does not bring it back); resumed, the cars it sets off are counted on top', () => {
  const cp = named('THE ON-RAMP');
  const s = build(null, cp.at - 8, cp.at + 40), { w, P } = s;
  const before = w.totalEnemies;
  // two cars after him as he reaches it: one with both men, one with its gunman shot
  P.spawn(s.v.x - 300, s.v.y, 0, 'chase', 5);
  const b = P.spawn(s.v.x - 600, s.v.y, 0, 'chase', 5);
  b.gunman = false;
  assert.equal(w.totalEnemies, before + 4, 'two men a car, counted as it is made');
  assert.equal(P.aboard(), before + 3, 'three of them still in their cars (and the alley cars waiting ahead)');
  w.checkpoints.reach(cp.i);
  assert.equal(w.game.chaseAt.guards, w.totalEnemies - P.aboard(), 'only the man out by then');
  // the retry: what it sets off counted on top of that
  const r = build(w.game.chaseAt, cp.at - 8, cp.at + 40);
  assert.equal(r.w.totalEnemies, w.game.chaseAt.guards + r.P.aboard());
  assert.ok(run(r, 1.5, () => r.P.cars.length > 0), 'the frontage road\'s pursuer set off');
  assert.equal(r.w.totalEnemies, w.game.chaseAt.guards + r.P.aboard(), 'each of its men counted as it comes');
});
