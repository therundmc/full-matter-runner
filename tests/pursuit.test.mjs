import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { ctx, quiet } from './helpers.mjs';

// no DOM under Node: what the cars paint on themselves goes nowhere
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Pursuit, dueEvents, lanesOf, slotOf, pickSlots, lockOf, inBand, reaches } = await load('game/systems/Pursuit.js');
const { default: Drive } = await load('game/systems/Drive.js');
const { seatOf } = await load('game/systems/drive/rules.js');
const { arcOf, inArc, inCone } = await load('game/systems/CarGun.js');
const { CHASE } = await load('game/data/chase.js');
const { SEAT } = await load('game/data/feel.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: level2a } = await load('game/data/levels/level2a.js');
const { default: Scoring } = await load('game/systems/Scoring.js');
const { listenMoments } = await load('game/fx/Impact.js');
const { angDiff } = await load('engine/math.js');

const { Bodies, Body } = Matter;
const DT = 1 / 60;
const SIZE = { car: [140, 58], car2: [134, 56], van: [160, 64], pursuer: [140, 58], convertible: [172, 64] };
const LANES = level2a.chase.lanes, [NORTH, SOUTH] = LANES.map((r) => r * TILE);

// a vehicle as Vehicle makes it (its real size, mass and body), nothing drawn
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
    hat: !!m.hat, gun: !!m.gun, drawn: null,
    def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.physics.freezeIfHeavy(body);
  w.props.push(v);
  return v;
}

// the pursuers' cars made as above (Vehicle needs its sprite to know its size)
Pursuit.prototype.spawn = function (x, y, a, state, speed = 0, style = undefined) {
  const car = this.add(vehicle(this.world, 'pursuer', x, y, a), state, { speed, style });
  if (state !== 'wait') this.loose(car);
  return car;
};

// his pistol: what CarGun asks of him (his pools are never touched at the wheel)
function runner(body) {
  return {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', reloading: 0, reloadDur: 1,
    weapon: { type: 'pistol', mag: 7 }, ammo: { '9mm': 7 },
    get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; this.reloading = 0; },
    kill(a, cause, killer) { this.alive = false; this.world.onKill(this, cause, killer); },
  };
}

// just enough of World for the chase: the real back road's walls, the physics, the player, the events
function world(rows = level2a.tiles) {
  const events = new EventBus();
  const physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const map = new TileMap(rows);
  physics.add(map.buildBodies());
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const w = {
    map, physics, events, player: runner(body), chars: [], props: [], corpses: [], projectiles: [], texts: [], time: 0,
    particles: quiet, killed: null, kills: [], exited: false, cleared: false, drive: null, totalEnemies: 0,
    game: { onExit() {} },
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), sound() {}, shake() {}, noise() {}, light() {},
    addDebris() {}, flashGlass() {},
    addProjectile(p) { w.projectiles.push(p); },
    onKill(ch, cause, killer) { w.killed = { ch, cause, killer }; },
  };
  w.chars.push(w.player);
  w.player.world = w;
  events.on('kill', (e) => w.kills.push(e));
  return w;
}

// the keys and the mouse, as engine/Input.js answers
function keys() {
  const held = new Set(), pressed = new Set();
  return { held, pressed, down: (c) => held.has(c), hit: (c) => pressed.delete(c), mouseHit: (b) => pressed.delete('mouse' + b), mouseDown: () => false };
}

// his car (the chase's: THE BOSS's convertible, him sat in it) at col, row (in his lane by default) at cruise, the
// pursuit of the chase o
function start(o = {}, at = [20, LANES[1]]) {
  const w = world(o.rows);
  const v = vehicle(w, o.model ?? CHASE.vehicle, at[0] * TILE, at[1] * TILE);
  // (a map of the test's own has none of the level's streets across)
  // (no opening on his cigarette, unless asked: tests/chasecinema.test.mjs has it)
  // (a map of the test's own is one straight road: no legs, no bends of the level's)
  const chase = { ...level2a.chase, across: o.rows ? [] : level2a.chase.across, events: o.events ?? [], intro: o.intro ?? null, ...(o.rows && { legs: null, bends: null }), ...o.chase };
  w.drive = new Drive(w, { ...chase, arms: o.arms ?? null, van: at, end: null }, v);
  w.pursuit = new Pursuit(w, chase);
  return { w, v, d: w.drive, P: w.pursuit, input: keys() };
}

// World.step's order: intentions (his car, theirs), the physics, what they ran into
function run(s, sec, aim = null, until = null) {
  const { w, d, P, input } = s;
  for (let t = 0; t < sec; t += DT) {
    w.time += DT;
    d.step(DT, input, aim);
    P.step(DT);
    w.physics.step(DT, w.time);
    d.after(DT);
    P.after(DT);
    for (const p of w.projectiles) p.dead = true;
    if (until?.()) return true;
  }
  return false;
}

// with the rams and the brakes (and the tells, but with `tells`) out of the way (put back after)
function calm(fn, tells = false) {
  const r = CHASE.pursuit.attack.round, g = CHASE.gunman.range;
  CHASE.pursuit.attack.round = ['shot'];
  if (!tells) CHASE.gunman.range = 0;
  try { return fn(); } finally { CHASE.pursuit.attack.round = r; CHASE.gunman.range = g; }
}

// the way from his seat to a point, as his gun sees it: inside its arc?
const inArcOf = (s, x, y) => {
  const seat = s.v.toWorld(...seatOf(s.v));
  return inCone(Math.atan2(y - seat.y, x - seat.x), s.v.body.angle);
};

test('pursuit: the slots are alongside him and ahead, inside his gun\'s arc, none behind; the other lane follows him (pure)', () => {
  const band = [NORTH, SOUTH], S = CHASE.pursuit.slots;
  assert.deepEqual(lanesOf(SOUTH, band), { his: SOUTH, other: NORTH });
  assert.deepEqual(lanesOf(NORTH, band), { his: NORTH, other: SOUTH }, 'in the top lane: they come up below him');
  // he straddles the line: the lane he was in is kept until he is well past the middle
  const mid = (NORTH + SOUTH) / 2, was = lanesOf(SOUTH, band);
  assert.equal(lanesOf(mid - 5, band, was).his, SOUTH);
  assert.equal(lanesOf(mid - CHASE.pursuit.flip - 1, band, was).his, NORTH);
  assert.deepEqual(lanesOf(300, null), { his: 300, other: 300 - CHASE.pursuit.side }, 'no lanes (the lab): his driver\'s side');
  for (const [name, [dx, lane]] of Object.entries(S)) {
    assert.ok(dx >= 0, `${name}: never behind him`);
    for (const his of [SOUTH, NORTH]) {
      const L = lanesOf(his, band), at = slotOf(name, 1000, L);
      assert.deepEqual(at, { x: 1000 + dx, y: lane === 'his' ? his : L.other });
      // from his seat (THE BOSS's convertible: 7 px ahead of its middle, 12.5 px to its driver's side) the middle of
      // a car there is inside his arc
      const a = Math.atan2(at.y - (his - 12.5), at.x - 1007);
      assert.ok(inCone(a, 0), `${name} from the ${his === SOUTH ? 'south' : 'north'} lane: in his arc`);
    }
  }
  assert.deepEqual(S.abreast, [0, 'other'], 'abreast of him, in the lane he is not in');
  assert.ok(S.lead[1] === 'other' && S.ahead[1] === 'his' && S.lead[0] >= 150 && S.ahead[0] > S.lead[0] && S.ahead[0] <= 250);
  assert.ok(slotOf('far', 1000, lanesOf(SOUTH, band), 2).x > slotOf('far', 1000, lanesOf(SOUTH, band), 1).x, 'more than four: one behind the other');
  // which slots n cars hold, rearmost first
  for (const roll of [0, 0.34, 0.67, 0.999]) {
    const one = pickSlots(1, roll), two = pickSlots(2, roll);
    assert.ok(one.length === 1 && ['abreast', 'lead', 'ahead'].includes(one[0][0]));
    assert.ok(two.length === 2 && two[0][0] !== two[1][0] && S[two[0][0]][0] < S[two[1][0]][0], `two: ${two}`);
  }
  assert.notDeepEqual(pickSlots(1, 0), pickSlots(1, 0.999), 'the picture changes');
  assert.deepEqual(pickSlots(3, 0.5).map(([k]) => k), ['abreast', 'lead', 'ahead']);
  assert.deepEqual(pickSlots(5, 0.5), [['abreast', 0], ['lead', 0], ['ahead', 0], ['far', 0], ['far', 1]]);
  const aim = lockOf({ x: 100, y: 200 }, { x: 8.9, y: 2 }, 0.75);
  assert.deepEqual([Math.round(aim.x), aim.y], [100 + Math.round(8.9 * 45), 200], 'his y held, his x led by his speed');
  assert.ok(inBand({ x: aim.x + 30, y: 210 }, aim) && !inBand({ x: aim.x, y: 240 }, aim) && !inBand({ x: aim.x - 60, y: 200 }, aim));
});

test('pursuit: a closed car is reached through a side window or the windscreen, not its panels; the open one across its cabin (pure)', () => {
  const w = world(), v = vehicle(w, 'van', 1000, SOUTH), s = seatOf(v), seat = v.toWorld(...s);
  assert.ok(reaches(v, seat.x - 10, seat.y - 100, s), 'from his side, level with him: the window');
  assert.ok(!reaches(v, seat.x - 200, seat.y + 4, s), 'from behind: the van\'s back doors');
  assert.ok(reaches(v, seat.x + 140, seat.y + 10, s), 'from ahead: the windscreen');
  const c = vehicle(w, 'convertible', 1000, NORTH), cs = seatOf(c), at = c.toWorld(...cs);
  assert.deepEqual(cs, VEHICLES.convertible.seat);
  c.seatIn(w.player);
  assert.ok(reaches(c, at.x - 200, at.y + 4, cs) && reaches(c, at.x - 60, at.y - 100, cs), 'the open car: from behind, from his side');
  c.unseat();
  assert.ok(!reaches(c, at.x - 200, at.y + 4, cs), 'nobody sat there: nobody to reach');
});

test('pursuit: one joining from behind is alongside, inside his arc and within 250 px, in under 3 s (in about 2)', () => calm(() => {
  for (const lane of [1, 0]) {
    const s = start({ events: [{ at: 21, kind: 'behind' }] }, [20, LANES[lane]]);
    let at = null, car = null, from = null;
    run(s, 3, null, () => {
      car ??= s.P.cars[0];
      if (!car) return false;
      from ??= car.v.y;
      const d = Math.hypot(car.v.x - s.v.x, car.v.y - s.v.y);
      if (at === null && inArcOf(s, car.v.x, car.v.y) && d < 250) at = car.t;
      return false;
    });
    assert.ok(car && car.state === 'chase', 'it joined');
    assert.ok(Math.abs(from - LANES[1 - lane] * TILE) < 1, `it comes up in the lane he is not in (${Math.round(from)})`);
    assert.ok(at !== null && at < 2.2, `in his arc ${at?.toFixed(2)} s after it joined`);
    assert.ok(inArcOf(s, car.v.x, car.v.y) && Math.hypot(car.v.x - s.v.x, car.v.y - s.v.y) < 250, 'and still there at 3 s');
    assert.ok(car.v.x > s.v.x - 60, `not behind him (${Math.round(car.v.x - s.v.x)} px along the road)`);
    assert.equal(s.w.kills.length, 0);
  }
}));

test('pursuit: three in the chase take three different slots, none behind him; the rearmost car the rearmost slot', () => calm(() => {
  const s = start();
  const cars = [s.P.spawn(s.v.x - 330, NORTH, 0, 'chase', 12), s.P.spawn(s.v.x + 260, NORTH, 0, 'chase', 8.9), s.P.spawn(s.v.x + 420, SOUTH, 0, 'chase', 8.9)];
  run(s, DT);
  assert.deepEqual(cars.map((c) => c.slot), ['abreast', 'lead', 'ahead'], 'dealt by where they are along the road');
  for (const c of cars) {
    const at = s.P.slot(c, s.P.target());
    assert.ok(at.x >= s.v.x, `${c.slot}: not behind him`);
    assert.equal(at.y, CHASE.pursuit.slots[c.slot][1] === 'his' ? SOUTH : NORTH, `${c.slot}: its lane`);
  }
  run(s, 4);
  for (const c of cars) {
    const at = s.P.slot(c, s.P.target());
    assert.equal(c.state, 'chase');
    assert.ok(Math.hypot(c.v.x - at.x, c.v.y - at.y) < 40, `${c.slot}: held (${Math.round(c.v.x - at.x)}, ${Math.round(c.v.y - at.y)} px off it)`);
    assert.ok(inArcOf(s, c.v.x, c.v.y) && Math.hypot(c.v.x - s.v.x, c.v.y - s.v.y) < 250, `${c.slot}: in his arc, close`);
  }
  assert.equal(new Set(cars.map((c) => c.slot)).size, 3);
  assert.equal(s.w.kills.length, 0);
  // two ahead of him, he goes over to the top lane: they keep their lanes and swap their slots (the one in what is
  // now his lane is the one `ahead`), rather than cross each other's way
  const random = Math.random;
  Math.random = () => 0.999; // (pickSlots: lead and ahead)
  try {
    const r = start();
    const [a, b] = [r.P.spawn(r.v.x + 165, NORTH, 0, 'chase', 8.9), r.P.spawn(r.v.x + 220, SOUTH, 0, 'chase', 8.9)];
    run(r, 1);
    assert.deepEqual([a.slot, b.slot], ['lead', 'ahead']);
    r.input.held.add('KeyW');
    let off = 0;
    const watch = () => { off = Math.max(off, Math.abs(a.v.y - NORTH), Math.abs(b.v.y - SOUTH)); return false; };
    run(r, 1, null, () => watch() || r.v.y <= NORTH + 42); // (let go a little early: it runs on as it straightens)
    r.input.held.clear();
    run(r, 2.5, null, watch);
    assert.ok(Math.abs(r.v.y - NORTH) < 20, `he is in the top lane (${Math.round(r.v.y - NORTH)})`);
    assert.deepEqual([a.slot, b.slot], ['ahead', 'lead'], 'swapped');
    assert.ok(off < 12, `neither left its lane (${Math.round(off)} px)`);
    assert.ok(Math.abs(a.v.x - r.v.x - 220) < 30 && Math.abs(b.v.x - r.v.x - 165) < 30, 'each at its new slot');
    assert.equal(r.w.kills.length, 0, 'nobody wrecked by it');
  } finally { Math.random = random; }
}));

test('pursuit: the gunman leans out on the runner\'s side: from the car below him, from the car dead ahead of him', () => calm(() => {
  // below him (he is in the top lane): its gunman out of its top window, telling
  const below = start({}, [20, LANES[0]]);
  const a = below.P.spawn(below.v.x - 40, SOUTH, 0, 'chase', 8.9);
  assert.ok(run(below, 6, null, () => below.P.tell), 'he tells from below');
  assert.equal(a.gunSide, -1, 'out of the window on his side (-y)');
  // dead ahead of him in his lane: one window, kept (no flutter), and he tells from there, firing back along the flank
  const s = start();
  const car = s.P.spawn(s.v.x + CHASE.pursuit.slots.ahead[0], SOUTH, 0, 'chase', 8.9);
  s.P.assign = function () { this.road = lanesOf(SOUTH, this.band); car.slot = 'ahead'; };
  const sides = new Set();
  let told = false;
  run(s, 6, null, () => { sides.add(car.gunSide); told ||= !!s.P.tell; return told; });
  assert.equal(sides.size, 1, `one window (${[...sides]})`);
  assert.ok(told, 'he tells from ahead');
  const g = s.P.gunPoint(car), seat = s.v.toWorld(...seatOf(s.v));
  assert.ok(g.x > seat.x + 100 && Math.abs(car.v.y - s.v.y) < 12, 'from ahead of him, in his lane');
}, true));

test('pursuit: his shove into a pursuer alongside is a real blow: half its hp and thrown half a lane; two wreck it (SHOVED)', () => calm(() => {
  // an open yard, nothing to be thrown into
  const rows = [];
  for (let y = 0; y < 40; y++) {
    let r = '';
    for (let x = 0; x < 200; x++) r += y === 0 || y === 39 || x === 0 || x === 199 ? 'X' : '=';
    rows.push(r);
  }
  const s = start({ rows, chase: { lanes: [18.0, 20.5] } }, [8, 20.5]);
  const car = s.P.spawn(s.v.x, 18.0 * TILE, 0, 'chase', 8.9);
  s.P.assign = function () { this.road = lanesOf(this.target().y, this.band, this.road); car.slot = 'abreast'; };
  run(s, 0.3);
  const hp = car.v.hp, y0 = car.v.y;
  assert.equal(hp, VEHICLES.pursuer.hp);
  // no shove: steering into it is a knock, not a blow
  s.input.held.add('KeyW');
  run(s, 0.4);
  s.input.held.clear();
  assert.ok(car.dents === 0 && car.v.hp === hp, 'steered into: nothing lost');
  const toward = () => ({ x: s.v.x, y: car.v.y });
  const lined = () => Math.abs(car.v.x - s.v.x) < 60 && Math.abs(car.v.y - s.v.y) > 60 && Math.abs(car.v.y - s.v.y) < 100 && s.d.cool <= 0 && car.stun <= 0;
  assert.ok(run(s, 8, null, lined), `abreast of him again, round his nose, never through him (${Math.round(car.v.x - s.v.x)}, ${Math.round(car.v.y - s.v.y)})`);
  const side = Math.sign(car.v.y - s.v.y), y1 = car.v.y;
  s.input.pressed.add('Space');
  let far = 0;
  run(s, 0.7, toward(), () => { far = Math.max(far, (car.v.y - y1) * side); return false; });
  assert.equal(car.dents, 1, 'landed, once');
  assert.ok(Math.abs(car.v.hp - hp * (1 - CHASE.pursuit.shoved.cost)) < 1e-9 && CHASE.pursuit.shoved.cost === 0.5, `half its hp (${car.v.hp})`);
  assert.ok(far >= 40, `knocked ${Math.round(far)} px aside: half a lane at least`);
  assert.equal(car.state, 'chase', 'not wrecked: nothing to be thrown into');
  assert.equal(s.w.kills.length, 0);
  // the second one, once he is back in his lane and it has come back alongside
  s.input.held.add('KeyS');
  run(s, 3, null, () => s.v.y >= 20.5 * TILE - 42); // (let go a little early: it runs on as it straightens)
  s.input.held.clear();
  assert.ok(run(s, 8, null, lined), `it comes back alongside (${Math.round(car.v.x - s.v.x)}, ${Math.round(car.v.y - s.v.y)})`);
  s.input.pressed.add('Space');
  run(s, 0.5, toward());
  assert.equal(car.state, 'wrecked', 'two shoves');
  const kills = s.w.kills.filter((k) => k.how.car === 'shoved');
  assert.ok(kills.length === 2 && kills.every((k) => k.cause === 'wreck' && k.killer === s.w.player), 'its driver and its gunman, his, tagged SHOVED');
  assert.ok(y0 > 0);
}));

test('pursuit: it swerves round a car standing in its lane, never into it', () => calm(() => {
  const s = start();
  const car = s.P.spawn(s.v.x - 40, NORTH + 8, 0, 'chase', 8.9);
  run(s, 2);
  const parked = vehicle(s.w, 'car', s.v.x + 900, NORTH, 0), x0 = parked.x;
  let near = Infinity;
  run(s, 12, null, () => {
    if (Math.abs(car.v.x - parked.x) < 140) near = Math.min(near, Math.abs(car.v.y - parked.y));
    return car.v.x > parked.x + 400;
  });
  assert.ok(car.v.x > parked.x + 300, 'past it');
  assert.notEqual(car.state, 'wrecked');
  assert.ok(near > 56, `a car's width clear of it going by (${Math.round(near)} px)`);
  assert.ok(Math.abs(parked.x - x0) < 4, 'never touched');
}));

test('pursuit: ONE shove that throws it into something solid wrecks it: a wall, the parked cars (his doing: SHOVED)', () => calm(() => {
  // a yard: his car along the bottom of a wall, the pursuer between him and it
  const rows = [];
  for (let y = 0; y < 14; y++) {
    let r = '';
    for (let x = 0; x < 80; x++) r += y === 0 || y === 13 || x === 0 || x === 79 ? 'X' : '=';
    rows.push(r);
  }
  const s = start({ rows, chase: { lanes: [2.6, 5.1] } }, [8, 5.1]);
  const car = s.P.spawn(s.v.x, 2.6 * TILE, 0, 'chase', 8.9);
  run(s, 0.3);
  s.input.pressed.add('Space');
  run(s, 1.2, { x: s.v.x, y: s.v.y - 200 });
  assert.equal(car.state, 'wrecked');
  assert.equal(car.dents, 1, 'one shove');
  const k = s.w.kills.find((e) => e.how.car === 'shoved');
  assert.ok(k && k.cause === 'wreck' && k.killer === s.w.player, 'the crew\'s kill is his, tagged SHOVED');
  // the back road: abreast of him in the top lane, a car parked along it
  const r = start();
  const p = r.P.spawn(r.v.x, NORTH, 0, 'chase', 8.9);
  vehicle(r.w, 'car', r.v.x + 150, 10 * TILE);
  run(r, 0.3);
  r.input.pressed.add('Space');
  run(r, 1, { x: r.v.x, y: r.v.y - 200 });
  assert.ok(p.state === 'wrecked' && p.dents === 1, `into the parked car: wrecked by one (${p.state}, ${p.dents})`);
}));

test('pursuit: the tell locks a lane band at its start; staying in it is death, a lane change or a shove dodges it', () => calm(() => {
  const told = (react) => {
    const s = start();
    s.P.spawn(s.v.x - 300, NORTH, 0, 'chase', 10);
    assert.ok(run(s, 10, null, () => s.P.tell), 'a tell starts once it is alongside');
    const T = s.P.tell, aim = { ...T.aim };
    const seat = s.v.toWorld(...seatOf(s.v)), vel = Body.getVelocity(s.v.body);
    const lock = lockOf(seat, vel, T.dur);
    assert.ok(Math.abs(lock.x - aim.x) < 12 && Math.abs(lock.y - aim.y) < 1, 'locked on where he will be');
    react(s);
    run(s, 0.3);
    s.input.held.clear(); // a tap, not into the kerb
    assert.deepEqual(s.P.tell?.aim ?? aim, aim, 'it does not follow him');
    run(s, T.dur);
    assert.ok(!s.P.tell, 'shot');
    return s;
  };
  const stayed = told(() => {});
  assert.ok(stayed.w.killed && stayed.w.killed.cause === 'bullet' && !stayed.w.player.alive, 'he stayed in the band: shot dead');
  assert.equal(stayed.w.killed.killer.kind, 'gunman');
  const swerved = told((s) => s.input.held.add('KeyD'));
  assert.ok(swerved.w.player.alive && !swerved.w.killed, 'out of the band across: alive');
  const shoved = told((s) => s.input.pressed.add('Space'));
  assert.ok(shoved.w.player.alive && !shoved.w.killed, 'thrown out of the band by his own shove: alive');
  // S held is the wheel, not a brake: it takes him out of the band the same way
  const steered = told((s) => s.input.held.add('KeyS'));
  assert.ok(steered.w.player.alive && steered.v.y > SOUTH + 20, 'S: down the picture, out of the band');
}, true));

test('pursuit: one tell at a time, a cooldown of 2-3 s between two', () => calm(() => {
  const s = start();
  const a = s.P.spawn(s.v.x - 200, NORTH, 0, 'chase', 10), b = s.P.spawn(s.v.x - 500, NORTH, 0, 'chase', 10);
  let both = false, gap = Infinity, last = null, ended = null;
  s.w.player.invulnerable = true; // to go on after a shot
  s.w.onKill = () => {};
  run(s, 20, null, () => {
    if (s.P.tell && a.telling && b.telling) both = true;
    if (s.P.tell && s.P.tell !== last) {
      if (ended !== null) gap = Math.min(gap, s.w.time - ended);
      last = s.P.tell;
    }
    if (!s.P.tell && last && ended === null) ended = s.w.time;
    if (!s.P.tell && last && ended !== null && s.w.time - ended > 4) return true;
    return false;
  });
  assert.ok(last, 'they told');
  assert.ok(!both, 'never two at once');
  assert.ok(gap >= CHASE.gunman.cool[0] - 1e-6 && gap <= CHASE.gunman.cool[1] + 0.1, `the gap between two tells: ${gap}`);
}, true));

test('car gun: his arc is the driver\'s side and ahead, about 200 degrees; a shot in it fires, one out of it does not', () => {
  const s = start({ model: 'van' }), g = s.d.gun, [ahead, back] = g.arc;
  const deg = ((ahead + back) * 180) / Math.PI;
  assert.ok(deg > 190 && deg < 210, `${deg} degrees`);
  assert.ok(inArc(-Math.PI / 2, 0, g.arc) && inArc(0, 0, g.arc) && inArc(-Math.PI + 0.02, 0, g.arc), 'his side, ahead, behind');
  assert.ok(!inArc(Math.PI / 2, 0, g.arc) && !inArc(0.4, 0, g.arc), 'never across his own car');
  assert.deepEqual(arcOf(160, 118.4).map((a) => Math.round(a * 100)), g.arc.map((a) => Math.round(a * 100)));
  s.input.pressed.add('mouse0');
  run(s, DT, { x: s.v.x + 50, y: s.v.y - 300 });
  assert.equal(s.w.projectiles.length, 1, 'out of his window');
  assert.ok(s.w.projectiles[0].ignore.has(s.v), 'never into his own car');
  run(s, 0.5);
  s.input.pressed.add('mouse0');
  run(s, DT, { x: s.v.x, y: s.v.y + 300 });
  assert.equal(s.w.projectiles.length, 1, 'across his own car: nothing');
});

test('car gun: at the wheel it never runs dry: 200 rounds of the Uzi without a reload, no round counted, R does nothing', () => {
  const s = start({ arms: { weapon: 'uzi', mag: 30 } }), p = s.w.player;
  s.input.mouseDown = () => true;
  let most = 0, last = 0, t = 0;
  // (the trigger held, the aim kept out of his door as the car goes on)
  while (s.w.projectiles.length < 200 && t < 20) {
    run(s, DT, { x: s.v.x + 30, y: s.v.y - 300 });
    t += DT;
    if (s.w.projectiles.length > last) { last = s.w.projectiles.length; most = 0; } else most += DT;
    assert.ok(most <= WEAPONS.uzi.rate + 2 * DT, `never a gap in the fire (${most.toFixed(3)} s at round ${last})`);
    if (last === 100) s.input.pressed.add('KeyR');
  }
  assert.equal(s.w.projectiles.length, 200);
  assert.ok(Math.abs(t - 200 * WEAPONS.uzi.rate) < 2, `at its own rate (${t.toFixed(1)} s)`);
  assert.deepEqual([p.weapon.mag, p.ammo['9mm'], p.reloading], [30, 7, 0], 'its magazine, his pools and his hands untouched');
  // an empty gun fires all the same (the count is not the wheel's business)
  p.weapon.mag = 0;
  const n = s.w.projectiles.length;
  run(s, 0.2, { x: s.v.x + 30, y: s.v.y - 300 });
  assert.ok(s.w.projectiles.length > n);
});

test('car gun: THE BOSS\'s open car: 125 degrees either side of the nose (250 in all): his door, over the windscreen, across the other seat; not behind him', () => {
  const [left, right] = CHASE.gun.cone, deg = ((left + right) * 180) / Math.PI;
  assert.ok(deg > 235 && deg < 260 && left === right, `${deg} degrees, the same either side`);
  for (const a of [-Math.PI / 2, 0, Math.PI / 2, 2.1, -2.1, 0.4, -0.4]) assert.ok(inCone(a, 0), `${a} in it`);
  for (const a of [Math.PI, -2.4, 2.4]) assert.ok(!inCone(a, 0), `${a} behind him: out`);
  assert.ok(inCone(0.5 + Math.PI / 2, 0.5) && !inCone(0.5 + Math.PI, 0.5), 'it turns with the car');
  const s = start({ arms: { weapon: 'pistol', mag: 7 } });
  run(s, 0.3);
  const fire = (dx, dy) => {
    const n = s.w.projectiles.length;
    s.input.pressed.add('mouse0');
    run(s, DT, { x: s.w.player.x + dx, y: s.w.player.y + dy });
    // (the aim kept on that side as the car goes on; the car's own step eases his arm: World does it)
    for (let i = 0; i < 30; i++) { run(s, DT, { x: s.w.player.x + dx, y: s.w.player.y + dy }); s.v.carry(DT); }
    return s.w.projectiles.length - n;
  };
  assert.equal(fire(0, -300), 1, 'out of his door');
  assert.equal(fire(300, 0), 1, 'ahead, over the windscreen');
  assert.ok(s.w.player.riding.side < 0 && s.w.player.riding.hand === 0, 'still the door\'s hand, held out over the screen');
  assert.equal(fire(0, 300), 1, 'to his right, across the passenger seat');
  assert.ok(s.w.player.riding.side > 0 && s.w.player.riding.hand === 1, `the gun gone over to the right hand (${s.w.player.riding.side} ${s.w.player.riding.hand} ${s.w.player.riding.aim})`);
  assert.equal(fire(-150, 260), 1, 'back along the right flank (120 degrees off the nose)');
  assert.equal(fire(-300, 0), 0, 'straight behind him: nothing');
  assert.equal(s.d.gun.aimed.ok, false, 'and the cursor says so');
  assert.ok(s.w.player.alive, 'none of it his own');
});

// After a car is stopped for good (fn): 1.5 s of its exit, watched. { touched: his car and it ever in contact, out:
// clear of his lane at the end (their widths apart across), behind: its nose behind his tail at the end, ahead: it
// was ever level with him or ahead of him inside his lane after the first 0.4 s }
function exits(s, car, fn) {
  fn();
  let touched = false, ahead = false, t = 0;
  const apart = () => Math.abs(car.v.y - s.v.y) >= (car.v.h + s.v.h) / 2;
  run(s, 1.5, null, () => {
    t += DT;
    touched ||= Matter.Collision.collides(car.v.body, s.v.body)?.collided ?? false;
    if (t > 0.4 && !apart() && car.v.x + car.v.w / 2 > s.v.x - s.v.w / 2) ahead = true;    return false;
  });
  return { touched, ahead, out: apart(), behind: car.v.x + car.v.w / 2 < s.v.x - s.v.w / 2 };
}

test('pursuit: a car wrecked alongside him (above, below) or ahead in his lane leaves the picture: away from him, out of his lane and behind him in 1.5 s, never touching him', () => calm(() => {
  const cases = [
    ['above', LANES[1], NORTH, 0],
    ['below', LANES[0], SOUTH, 0],
    ['ahead', LANES[1], SOUTH, CHASE.pursuit.slots.ahead[0]],
    ['ahead, top lane', LANES[0], NORTH, CHASE.pursuit.slots.ahead[0]],
  ];
  for (const [name, row, y, dx] of cases) {
    const s = start({}, [20, row]);
    const car = s.P.spawn(s.v.x + dx, y, 0, 'chase', 8.9);
    run(s, 0.4);
    const y0 = car.v.y, r = exits(s, car, () => s.P.wreck(car));
    assert.equal(car.state, 'wrecked', name);
    assert.ok(!r.touched, `${name}: never touching him`);
    assert.ok(r.out && !r.ahead, `${name}: out of his lane, never in it ahead of him (${Math.round(car.v.y - s.v.y)})`);
    assert.ok(r.behind, `${name}: left behind him (${Math.round(car.v.x - s.v.x)})`);
    if (dx === 0) assert.equal(Math.sign(car.v.y - y0), Math.sign(y0 - s.v.y), `${name}: away from him`);
    assert.ok(Math.abs(angDiff(0, car.v.body.angle)) > 0.2, `${name}: skidded round (${car.v.body.angle.toFixed(2)})`);
    assert.equal(car.out, null, 'the script is over: the physics has it');
  }
}));

// a passer-by standing at (x, y): a body as a man's (CAT.CHAR, 10 px), killed for good
function passerBy(w, x, y) {
  const body = Bodies.circle(x, y, 10, { frictionAir: 0.2, collisionFilter: { category: CAT.CHAR, mask: MASK.CHAR } });
  setMaterial(body, 75, 0.6);
  const c = {
    body, alive: true, isCivilian: true, hidden: false, radius: 10, death: null,
    get x() { return body.position.x; }, get y() { return body.position.y; },
    kill(a, cause, killer) { this.alive = false; this.death = { a, cause, killer }; w.physics.remove(body); },
  };
  body.entity = c;
  w.physics.add(body);
  w.chars.push(c);
  return c;
}

test('pursuit: a wreck skidding out onto the sidewalk runs down the people it hits there, never pins one alive against the fronts', () => calm(() => {
  const s = start();
  const car = s.P.spawn(s.v.x, NORTH, 0, 'chase', 8.9);
  run(s, 0.4);
  // a row of them along the north sidewalk, against the fronts, where its exit (away from him) takes it
  const men = [];
  for (let x = car.v.x - 40; x < car.v.x + 420; x += 36) men.push(passerBy(s.w, x, 8.5 * TILE));
  const touched = new Set();
  s.P.wreck(car);
  run(s, 3, null, () => {
    for (const m of men) if (m.alive && Matter.Collision.collides(car.v.body, m.body)?.collided) touched.add(m);
    return false;
  });
  assert.ok(touched.size > 0, 'it reached the sidewalk');
  for (const m of touched) {
    assert.ok(!m.alive, `the one at ${Math.round(m.x)} is run down, not pinned (${Math.round(car.v.x)}, ${Math.round(car.v.y)})`);
    assert.equal(m.death.cause, 'vehicle');
    assert.equal(m.death.killer, car.v);
  }
  for (const m of men) if (m.alive) assert.ok(!Matter.Collision.collides(car.v.body, m.body)?.collided, `nobody alive under it (${Math.round(m.x)})`);
}));

test('pursuit: a rear tyre shot, the car ahead of him in his lane limps out of it, never slowing him', () => calm(() => {
  const s = start();
  const car = s.P.spawn(s.v.x + CHASE.pursuit.slots.ahead[0], SOUTH, 0, 'chase', 8.9);
  s.P.assign = function () { this.road = lanesOf(this.target().y, this.band, this.road); };
  car.slot = 'ahead';
  run(s, 0.6);
  car.v.popTire(0, 0);
  assert.equal(car.state, 'limp');
  let touched = false, slow = Infinity;
  run(s, 4, null, () => {
    touched ||= Matter.Collision.collides(car.v.body, s.v.body)?.collided ?? false;
    slow = Math.min(slow, Body.getVelocity(s.v.body).x);
    return false;
  });
  assert.ok(!touched && slow > CHASE.cruise - 0.5, `never in his way (${slow.toFixed(1)} px/step)`);
  // and it hangs on alongside him, in his arc, out of his lane, for him to finish it
  let held = 0;
  run(s, 6, null, () => {
    const near = Math.hypot(car.v.x - s.v.x, car.v.y - s.v.y) < 250, out = Math.abs(car.v.y - s.v.y) >= (car.v.h + s.v.h) / 2;
    if (near && out && inArcOf(s, car.v.x, car.v.y)) held += DT;
    return false;
  });
  assert.equal(car.state, 'limp');
  assert.ok(held > 5.5, `alongside him, in his arc (${held.toFixed(1)} s of 6)`);
}));

test('pursuit: a tyre goes to a burst at it (5 rounds square on its flank), not to a stray round at a slant off the body\'s burst', () => calm(() => {
  const s = start(), T = CHASE.pursuit.rounds.tyre;
  const car = s.P.spawn(s.v.x, NORTH, 0, 'chase', 8.9), v = car.v;
  run(s, 0.4);
  const wheel = () => v.toWorld(v.m.wheels[1][0], v.h - 1); // its rear wheel on his side (+y)
  // at a slant (from well behind it): they skip off into the body
  for (let i = 0; i < 20; i++) { const at = wheel(); v.hit(1, at.x, at.y, -Math.PI / 2 + T.skip + 0.2, 1, 'bullet'); }
  assert.ok(v.tires[1] && car.state === 'chase', 'still on it');
  for (let i = 1; i < T.hp; i++) { const at = wheel(); v.hit(1, at.x, at.y, -Math.PI / 2, 1, 'bullet'); }
  assert.ok(v.tires[1], `${T.hp - 1} square on: chewed up, not gone`);
  const at = wheel();
  v.hit(1, at.x, at.y, -Math.PI / 2, 1, 'bullet');
  assert.ok(!v.tires[1] && car.state === 'limp', 'the last one: it limps');
  assert.ok(T.hp >= 4 && T.hp <= 6);
}));

test('pursuit: a burst through its windscreen kills the driver (a stray round only stars it) and it is out at once, his gunman with it; a front tyre spins it out; both by the exit', () => calm(() => {
  {
    const s = start();
    const car = s.P.spawn(s.v.x + 20, NORTH, 0, 'chase', 8.9);
    run(s, 0.5);
    const v = car.v, shot = () => { const at = v.toWorld(89, v.h - 1); v.hit(1, at.x, at.y, -Math.PI / 2, 1, 'bullet'); }; // from his side, by the A pillar
    shot();
    assert.ok(car.driver && car.state === 'chase' && v.windows.wind === 1, 'one round: the windscreen starred, nobody hit');
    const r = exits(s, car, shot);
    assert.ok(!car.driver && !car.gunman && car.state === 'wrecked', `the driver (${car.state})`);
    const k = s.w.kills.find((e) => e.how.car === 'driver');
    assert.ok(k && k.cause === 'bullet' && k.killer === s.w.player);
    assert.ok(s.w.kills.length === 2 && s.w.kills[1].how.crew, 'his gunman dies with him: not one more for the streak');
    assert.ok(!r.touched && r.out && r.behind, 'the exit');
  }
  {
    const s = start();
    const car = s.P.spawn(s.v.x + 20, NORTH, 0, 'chase', 8.9);
    run(s, 0.5);
    let spun = 0;
    const r = exits(s, car, () => car.v.popTire(2, Math.PI / 2));
    spun = Math.abs(angDiff(0, car.v.body.angle));
    assert.equal(car.state, 'wrecked');
    assert.ok(s.w.kills.some((e) => e.how.car === 'tyre'), 'BLOWOUT');
    assert.ok(!r.touched && r.out && r.behind && spun > 0.3, `the exit, spun round (${spun.toFixed(2)})`);
  }
}));

test('pursuit: a long burst on its body wrecks it in stages (its rear glass cracked, blown out, smoke, fire, wrecked): 2-3 times the rounds it took', () => calm(() => {
  const s = start(), R = CHASE.pursuit.rounds;
  const car = s.P.spawn(s.v.x, NORTH, 0, 'chase', 8.9), v = car.v;
  run(s, 0.4);
  assert.ok(v.m.hp >= 2 * VEHICLES.car.hp && v.m.hp <= 3 * VEHICLES.car.hp, 'its hp: 2 to 3 times a parked car\'s');
  const seen = [];
  let rounds = 0;
  const flank = () => v.toWorld(v.w / 2, v.h - 1); // its middle, from his side: never a window, a tyre, the tank
  const r = exits(s, car, () => {
    while (car.state !== 'wrecked' && rounds < 200) {
      const at = flank();
      v.hit(1, at.x, at.y, -Math.PI / 2, 1, 'bullet');
      rounds++;
      run(s, WEAPONS.uzi.rate);
      const stage = `${v.windows.rear}${v.windows.wind}${v.burning ? 'f' : ''}`;
      if (seen.at(-1) !== stage) seen.push(stage);
    }
    // (the rounds still on their way: it blows up when its fire's fuse is out, off to the side, never by his car)
    for (let i = 0; i < 12; i++) { const at = flank(); v.hit(1, at.x, at.y, -Math.PI / 2, 1, 'bullet'); }
    assert.ok(v.hp <= 0 && !v.exploded && v.burning, 'not blown up by him');
  });
  assert.deepEqual(seen, ['00', '10', '20', '20f'], 'its rear window cracked, blown out, on fire (the windscreen left to his rounds)');
  assert.ok(rounds >= 2 * 28 && rounds <= 3 * 28, `rounds to wreck it: ${rounds} (28 before)`);
  assert.ok(Math.abs(rounds - Math.ceil(v.m.hp * R.wreck)) <= 2, 'at its `wreck` share');
  assert.ok(s.w.kills.filter((e) => e.how.car === 'wrecked').length === 2 && !car.driver && !car.gunman, 'its crew killed');
  assert.ok(!r.touched && r.out && r.behind, 'the exit');
  // on fire, it does not run long
  const t = start(), c2 = t.P.spawn(t.v.x, NORTH, 0, 'chase', 8.9);
  run(t, 0.4);
  c2.v.damage(Math.ceil(c2.v.m.hp * R.fire));
  assert.ok(c2.v.burning && c2.state === 'chase');
  run(t, R.burn + 0.1);
  assert.equal(c2.state, 'wrecked', 'its engine on fire stops it');
}));

test('pursuit: its gunman shot, no more tells from that car (it can still ram)', () => calm(() => {
  const s = start();
  const car = s.P.spawn(s.v.x - 60, NORTH, 0, 'chase', 9.5);
  run(s, CHASE.gunman.grace - 0.2);
  assert.ok(!s.P.tell, 'not yet (his grace)');
  const g = s.P.gunPoint(car);
  s.w.events.emit('round', { x0: g.x - 3, y0: g.y + 80, x1: g.x + 3, y1: g.y - 20, owner: s.w.player, team: 'player' });
  assert.ok(!car.gunman && car.driver && car.state === 'chase');
  assert.ok(s.w.kills.some((e) => e.how.car === 'gunman'));
  run(s, 6);
  assert.ok(!s.P.tell && s.w.player.alive, 'no tell');
  assert.ok(car.state === 'chase' && car.v.x > s.v.x - 60 && Math.hypot(car.v.x - s.v.x, car.v.y - s.v.y) < 250, 'still at him, alongside');
}, true));

test('events: the alley car goes at its distance, not before; its red lane is told 0.7 s before it is in his lane', () => calm(() => {
  const ev = level2a.chase.events.find((e) => e.kind === 'alley');
  assert.ok(ev && ev.car[0] >= 138 && ev.car[0] <= 142, 'the alley at col 138 (event 1)');
  const fired = new Set();
  assert.equal(dueEvents([ev], fired, (ev.at - 0.1) * TILE).length, 0, 'not before');
  assert.deepEqual(dueEvents([ev], fired, ev.at * TILE), [ev]);
  fired.add(ev);
  assert.equal(dueEvents([ev], fired, (ev.at + 5) * TILE).length, 0, 'once');
  // the real thing: his van from 20 m before it at 60 km/h
  const s = start({ events: [ev] }, [ev.at - 20, LANES[1]]);
  const car = s.P.cars[0];
  assert.equal(car.state, 'wait', 'it waits in the alley, lamps on');
  let shown = null, inLane = null;
  const edge = SOUTH + (SOUTH - NORTH) / 2;
  run(s, 4, null, () => {
    if (shown === null && s.P.lanes.length) shown = s.w.time;
    if (shown !== null && inLane === null && car.v.y - car.v.w / 2 < edge) inLane = s.w.time;
    return inLane !== null;
  });
  const vanAt = s.v.x / TILE;
  assert.ok(shown !== null && inLane !== null);
  assert.ok(Math.abs(inLane - shown - CHASE.alley.red) < 0.1, `the red lane ${(inLane - shown).toFixed(2)} s ahead`);
  assert.ok(vanAt > ev.at && vanAt < ev.car[0], 'before it reaches the alley');
}));

// ---------------------------------------------------------------- the Uzi on the passenger seat (Drive.grab)
const ARMS = level2a.chase.arms;
const stepsTo = (s, t) => run(s, t - s.d.grab.t);

test('grab: level 2A sets off with the boss\'s Uzi on the passenger seat (no spare magazine: it never runs dry at the wheel)', () => {
  assert.deepEqual(ARMS, { weapon: 'uzi', mag: 30, seat: true });
  assert.equal(CHASE.vehicle, 'convertible');
  assert.equal(VEHICLES.convertible.gun[3], ARMS.weapon, 'the gun lying on its seat is the one he takes');
});

test('grab: the first start, he takes it in a short beat as the car rolls on by itself; nothing he does counts until it is done', () => {
  const s = start({ arms: ARMS }), { w, v, d, input } = s, p = w.player, G = SEAT.grab, y0 = v.y;
  p.ammo['9mm'] = 0;
  assert.ok(d.grab && d.grabbing && v.gun && p.weapon === null, 'the gun on the seat, his hands empty');
  assert.equal(p.riding.grab, 0);
  assert.equal(d.shot().name, 'grab', 'the camera pushed in on him');
  // he holds everything down: the wheel, the shove, the trigger
  for (const k of ['KeyW', 'KeyA', 'Space']) input.held.add(k);
  input.pressed.add('Space');
  input.mouseDown = () => true;
  stepsTo(s, G.take - 0.05);
  assert.ok(v.gun && p.weapon === null, 'still on the seat');
  stepsTo(s, G.take + 0.05);
  assert.ok(!v.gun && p.weapon.type === 'uzi' && p.weapon.mag === 30 && p.ammo['9mm'] === 0, 'in his hand, 30 in it; nothing spare');
  stepsTo(s, G.dur - 0.05);
  assert.ok(d.grabbing && w.projectiles.length === 0 && p.weapon.mag === 30, 'not a round fired');
  assert.ok(Math.abs(d.v - CHASE.cruise) < 1e-6 && Math.abs(v.y - y0) < 1 && d.cool === 0, 'at cruise on its line, no shove');
  run(s, 0.1);
  assert.ok(!d.grabbing && p.riding.grab === null, 'done: the hand his');
  assert.equal(d.shot().name, 'grabOut', 'the camera going back out');
  run(s, 0.3);
  assert.ok(v.y < y0 - 5 && Math.abs(d.v - CHASE.cruise) < 1e-6, 'the wheel his again (W held: up the picture), the speed the road\'s');
  run(s, G.out);
  assert.ok(d.grab === null && d.shot() === null, 'the usual view');
});

test('car gun: the pad\'s RB fires it: held, the Uzi runs on at its rate; the pistol once a press', async () => {
  const { default: Input } = await load('engine/Input.js');
  const { BUTTONS } = await load('engine/Gamepad.js');
  const { PAD_BINDINGS } = await load('game/data/controls.js');
  const fire = (o, hold, sec) => {
    const s = start(o), pad = { connected: true, buttons: BUTTONS.map(() => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
    const inp = new Input(null, { pads: () => [pad] }), rb = pad.buttons[BUTTONS.indexOf('RB')];
    inp.bindPad(PAD_BINDINGS);
    s.input = inp;
    if (o.arms) s.d.skipGrab();
    for (let i = 0; i * DT < sec; i++) {
      rb.pressed = hold(i); rb.value = rb.pressed ? 1 : 0;
      inp.poll(DT);
      run(s, DT, { x: s.v.x + 50, y: s.v.y - 300 });
      inp.consume();
    }
    return s.w.projectiles.length;
  };
  const n = fire({ arms: ARMS }, () => true, 0.5);
  assert.ok(Math.abs(n - Math.ceil(0.5 / WEAPONS.uzi.rate)) <= 1, `${n} rounds of the Uzi in 0.5 s`);
  assert.equal(fire({ model: 'van' }, () => true, 0.5), 1, 'the pistol held: one round');
  assert.equal(fire({ model: 'van' }, (i) => i % 40 < 3, 1.4), 3, 'pressed three times: three rounds');
});

test('grab: a retry starts with the Uzi already in hand, no beat', () => {
  const s = start({ arms: ARMS }), { v, d } = s, p = s.w.player;
  p.ammo['9mm'] = 0;
  d.skipGrab();
  assert.ok(!d.grab && !d.grabbing && !v.gun && d.shot() === null);
  assert.ok(p.weapon.type === 'uzi' && p.weapon.mag === 30 && p.ammo['9mm'] === 0 && p.riding.grab === null);
  d.skipGrab(); // (twice: nothing more)
  assert.ok(p.weapon.type === 'uzi' && !d.grab);
});

test('grab: nothing is told while he takes it; the event due meanwhile goes once it is done', () => calm(() => {
  const ev = level2a.chase.events.find((e) => e.kind === 'alley');
  const s = start({ arms: ARMS, events: [ev] }, [ev.at + 0.5, LANES[1]]);
  run(s, SEAT.grab.dur - 0.05);
  assert.ok(s.d.grabbing && s.P.fired.size === 0 && s.P.lanes.length === 0 && !s.P.tell, 'nothing set off, nothing told');
  run(s, 0.1);
  assert.ok(s.P.fired.has(ev), 'then the alley car');
}, true));

test('grab: the lab\'s convertible gives the gun every time he gets in, and takes it back when he gets out', () => {
  const w = world(), v = vehicle(w, 'convertible', 30 * TILE, LANES[1] * TILE), p = w.player;
  p.weapon = { type: 'knife', mag: 0 };
  for (let i = 0; i < 2; i++) {
    const d = new Drive(w, { exit: true }, v), input = keys();
    w.drive = d;
    assert.ok(d.grabbing && p.weapon === null && v.gun, 'the beat, his knife put aside');
    for (let t = 0; t < SEAT.grab.dur + 0.1; t += DT) { w.time += DT; d.step(DT, input, null); w.physics.step(DT, w.time); d.after(DT); }
    assert.ok(!d.grabbing && p.weapon.type === 'uzi' && !v.gun);
    input.pressed.add('KeyE');
    d.step(DT, input, null);
    assert.ok(w.drive === null && v.gun && p.weapon.type === 'knife', 'out: the Uzi back on the seat, his knife in his hand');
  }
});

test('pursuit: a car wrecked with both men in it is two kills but ONE for the streak: no double, no slow motion at the wheel', () => calm(() => {
  const s = start(), w = s.w;
  w.enemies = [];
  const sc = new Scoring(w), multi = [], slow = [];
  w.events.on('multiKill', (e) => multi.push(e.tag));
  w.slowmo = (...a) => slow.push(a);
  w.hitstop = (t) => slow.push(t);
  listenMoments(w);
  const a = s.P.spawn(s.v.x + 300, NORTH, 0, 'chase', 8.9), b = s.P.spawn(s.v.x + 600, NORTH, 0, 'chase', 8.9);
  s.P.wreck(a);
  assert.equal(w.kills.length, 2, 'its driver and its gunman');
  assert.ok(!w.kills[0].how.crew && w.kills[1].how.crew, 'the second one of its crew');
  assert.equal(sc.kills, 2);
  assert.equal(sc.streak, 1);
  assert.ok(!sc.tags.includes('double') && multi.length === 0, 'one wreck: no double');
  // two cars in the same breath are a double, but at the wheel nothing slows down nor freezes
  s.P.wreck(b);
  assert.deepEqual(multi, ['double']);
  assert.equal(slow.length, 0, 'no slow motion, no hit-stop at the wheel');
  w.drive.on = false;
  w.events.emit('multiKill', { tag: 'double' });
  assert.ok(slow.length > 0, 'on foot the moment is as it was');
}));

test('pursuit: what stands in a car\'s way is looked up once (the cars and what blocks a path), again when props come', () => calm(() => {
  const s = start(), P = s.P;
  P.blockedAt(null, s.v.x, SOUTH, 100);
  assert.ok(P.blockers.every((p) => p.isVehicle || p.def?.blocksPath), 'nothing a car goes over');
  const was = P.blockers, car = P.spawn(s.v.x + 600, NORTH, 0, 'chase', 0);
  assert.equal(P.blockedAt(null, s.v.x + 600, NORTH, 100)?.p, car.v, 'found in the way');
  assert.ok(P.blockers !== was && P.blockers.includes(car.v));
  const now = P.blockers;
  P.blockedAt(null, s.v.x, SOUTH, 100);
  assert.equal(P.blockers, now, 'not looked up again while nothing came');
}));

// ---- they take turns attacking, each attack told; smooth at the wheel
const { nextAttack, attackPhase, easeLine } = await load('game/systems/Pursuit.js');

test('attacks: a rhythm, one kind after the other, the kind due skipped only when nobody can make it (pure)', () => {
  const all = { shot: true, ram: true, brake: true }, R = CHASE.pursuit.attack.round;
  assert.deepEqual([0, 1, 2, 3, 4].map((t) => nextAttack(t, all)), [...R, R[0]]);
  assert.ok(R.includes('ram') && R.includes('brake') && R.includes('shot'), 'the three of them in the round');
  for (let i = 0; i < R.length; i++) assert.notEqual(R[i], R[(i + 1) % R.length], 'never the same twice running');
  assert.equal(nextAttack(1, { shot: true, ram: false, brake: true }), 'shot', 'no one abreast: the next in the round');
  assert.equal(nextAttack(0, { shot: false, ram: false, brake: false }), null);
  // told first, then made, then over
  assert.equal(attackPhase('ram', 0.1), 'wind');
  assert.equal(attackPhase('ram', CHASE.pursuit.ram.wind + 0.05), 'go');
  assert.equal(attackPhase('ram', CHASE.pursuit.ram.wind + CHASE.pursuit.ram.dur + 0.01), null);
  assert.ok(CHASE.pursuit.ram.wind >= 0.4 && CHASE.pursuit.block.wind >= 0.4, 'time to react');
  assert.equal(easeLine(100, 400, DT), 100 + CHASE.pursuit.ease * DT, 'the line slides');
  assert.equal(easeLine(100, 101, DT), 101);
});

test('attacks: a ram is told (lamps flashing, drawn away from him), then swipes at his flank; one attack at a time', () => {
  const g = CHASE.gunman.range;
  CHASE.gunman.range = 0; // (no told shot: the ram's turn comes)
  try {
    const s = start();
    const car = s.P.spawn(s.v.x - 160, NORTH, 0, 'chase', 10, 'rammer');
    s.w.player.invulnerable = true;
    let told = null, flashed = false, away = 0, toward = 0, rams = 0, y0 = null, kinds = new Set();
    s.w.events.on('pursuerTell', (e) => { told = e; kinds.add(e.kind); });
    s.w.events.on('pursuerRam', () => rams++);
    run(s, 9, null, () => {
      const A = s.P.attack;
      if (A) {
        assert.equal(A.car, car);
        assert.equal(s.P.tell, null, 'no shot told meanwhile');
        const ph = attackPhase(A.kind, A.t);
        if (y0 === null) y0 = car.v.y;
        if (ph === 'wind') { flashed ||= car.v.lightsOut; away = Math.max(away, (y0 - car.v.y) * A.side); }
        if (ph === 'go') toward = Math.max(toward, (car.v.y - y0) * A.side);
      }
      return rams > 0;
    });
    assert.ok(told && told.kind === 'ram' && told.car === car.v, 'told: pursuerTell');
    assert.ok(flashed, 'its lamps flashed');
    assert.ok(away > 4, `it drew away first (${away.toFixed(1)} px)`);
    assert.ok(rams === 1 && toward > 0, `then swiped at him and landed (${toward.toFixed(1)} px)`);
    run(s, 0.6); // (inside the shortest pause between two attacks: CHASE.pursuit.attack)
    assert.ok(!car.v.lightsOut && s.P.cool > 0 || s.P.attack, 'its lamps back on, a pause before the next');
    assert.equal(s.w.killed, null, 'a swipe is not his death');
  } finally { CHASE.gunman.range = g; }
});

test('attacks: a shove into the rammer as it winds up lands first: its attack is off, it keeps its distance, hurt', () => {
  const g = CHASE.gunman.range;
  CHASE.gunman.range = 0;
  try {
    const s = start();
    const car = s.P.spawn(s.v.x - 120, NORTH, 0, 'chase', 10, 'rammer');
    s.w.player.invulnerable = true;
    assert.ok(run(s, 9, null, () => !!s.P.attack), 'it winds up');
    s.input.pressed.add('Space');
    run(s, 0.5, { x: s.v.x, y: s.v.y - 100 });
    assert.equal(s.P.attack, null, 'its ram is off');
    assert.equal(car.dents, 1);
    assert.ok(car.hurt > 0, 'hurt');
    run(s, 1.6);
    if (car.state === 'chase') assert.ok(car.v.x > s.v.x + 150, `it keeps ahead, out of reach (${(car.v.x - s.v.x).toFixed(0)} px)`);
  } finally { CHASE.gunman.range = g; }
});

test('attacks: the blocker ahead in his lane shows its brake lights, then drops back onto his nose; a lane change dodges it', () => {
  const g = CHASE.gunman.range;
  CHASE.gunman.range = 0;
  try {
    for (const dodge of [false, true]) {
      const s = start();
      const car = s.P.spawn(s.v.x + 200, SOUTH, 0, 'chase', 9, 'blocker');
      s.w.player.invulnerable = true;
      const gap = () => car.v.x - s.v.x;
      assert.ok(run(s, 8, null, () => s.P.attack?.kind === 'brake'), 'it brakes');
      assert.equal(car.slot, 'ahead', 'alone, a blocker holds the slot ahead of him');
      const g0 = gap();
      run(s, CHASE.pursuit.block.wind - 0.1);
      assert.ok(car.v.brake > 0, 'brake lights first');
      assert.ok(Math.abs(gap() - g0) < 14, `told before it slows (${(gap() - g0).toFixed(0)} px)`);
      if (dodge) s.input.held.add('KeyW');
      let hit = false, low = 9;
      s.w.events.on('ride', (e) => { if (e.beat === 'hit') hit = true; });
      run(s, 1.3, null, () => { low = Math.min(low, s.d.v); return false; });
      if (dodge) assert.ok(!hit && low > 6.5, `a lane change: clear of it (${low.toFixed(1)})`);
      else {
        assert.ok(gap() < g0 - 30 || hit, `it came back at him (${gap().toFixed(0)} from ${g0.toFixed(0)})`);
        // a jolt that takes his speed, never a crawl: it drops back from the speed he had as it was told, not from
        // what is left of his after each knock (it followed him down to a standstill, the two crawling for seconds:
        // the QA robot's runs lost 5 to 12 s of the route to it)
        assert.ok(low > 0.3 * s.d.cruise, `he is never brought to a crawl (${low.toFixed(1)} px/step at the slowest)`);
        run(s, 1.2);
        assert.ok(s.d.v > 0.85 * s.d.cruise, `and back at speed soon after (${s.d.v.toFixed(1)} px/step)`);
      }
      assert.equal(s.w.killed, null);
    }
  } finally { CHASE.gunman.range = g; }
});

test('pursuit: steering is smooth: the heading and the body turn by a bounded angle a step, no jump across the road', () => calm(() => {
  const s = start();
  const cars = [s.P.spawn(s.v.x - 330, NORTH, 0, 'chase', 12), s.P.spawn(s.v.x - 600, NORTH, 0, 'chase', 12)];
  // a parked car shoved into their lane to go round, and he weaves
  vehicle(s.w, 'car', s.v.x + 900, NORTH, 0);
  const most = CHASE.pursuit.turn * DT + 1e-9;
  let worstH = 0, worstA = 0, worstY = 0;
  const was = cars.map((c) => ({ h: c.h, a: c.v.body.angle, y: c.v.y }));
  run(s, 10, null, () => {
    const t = s.w.time;
    s.input.held.clear();
    if (Math.floor(t / 1.3) % 3 === 1) s.input.held.add('KeyW'); else if (Math.floor(t / 1.3) % 3 === 2) s.input.held.add('KeyS');
    cars.forEach((c, i) => {
      if (c.state === 'chase' && c.stun <= 0 && c.set) {
        worstH = Math.max(worstH, Math.abs(c.h - was[i].h));
        worstA = Math.max(worstA, Math.abs(c.v.body.angle - was[i].a));
        worstY = Math.max(worstY, Math.abs(c.v.y - was[i].y));
      }
      was[i] = { h: c.h, a: c.v.body.angle, y: c.v.y };
    });
    return false;
  });
  assert.ok(worstH <= most, `the heading: ${worstH.toFixed(4)} rad a step at most (${most.toFixed(4)})`);
  assert.ok(worstA < 0.06, `the body: ${worstA.toFixed(4)} rad a step`);
  assert.ok(worstY <= 7, `across: ${worstY.toFixed(2)} px a step`);
}));

test('pursuit: a car thrown by his shove into a tree or a bus shelter is wrecked too (the kerb is his weapon everywhere)', () => {
  for (const k of ['streetlight', 'traffic_light', 'street_tree', 'bus_shelter']) assert.ok(CHASE.pursuit.wreck.poles.includes(k), k);
});

test('events: the waves of level 2A differ: a gunner, a rammer, a blocker, and the last ones', () => {
  const ev = level2a.chase.events.filter((e) => e.kind === 'alley' || e.kind === 'behind');
  const styles = ev.map((e) => e.style ?? 'gunner');
  for (const k of ['gunner', 'rammer', 'blocker']) assert.ok(styles.includes(k), `a ${k}`);
  const street = ev.filter((e) => e.at < level2a.chase.legs[1].from), toll = ev.filter((e) => e.at >= level2a.chase.toll.at - 60);
  assert.ok(street.length >= 5 && street.length <= 6, `${street.length} cars down the street`);
  assert.equal(toll.length, 2, 'two more as the road opens to the toll');
  assert.deepEqual(toll.map((e) => e.gate ?? null), ['steel', null], 'the first takes the wrong gate, the other follows him');
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].at > ev[i - 1].at, 'one after the other along the road');
});
