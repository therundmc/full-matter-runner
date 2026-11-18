import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: what the cars paint on themselves goes nowhere
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Pursuit, dueEvents, slotOf, lockOf, inBand, reaches } = await load('game/systems/Pursuit.js');
const { default: Drive, seatOf } = await load('game/systems/Drive.js');
const { arcOf, inArc } = await load('game/systems/CarGun.js');
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

const { Bodies, Body } = Matter;
const DT = 1 / 60;
const quiet = new Proxy({}, { get: () => () => {} });
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
    hat: !!m.hat, gun: !!m.gun,
    def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.physics.freezeIfHeavy(body);
  w.props.push(v);
  return v;
}

// the pursuers' cars made as above (Vehicle needs its sprite to know its size)
Pursuit.prototype.spawn = function (x, y, a, state, speed = 0) {
  const car = this.add(vehicle(this.world, 'pursuer', x, y, a), state, { speed });
  if (state !== 'wait') this.loose(car);
  return car;
};

// his pistol, his pools: what CarGun asks of him
function runner(body) {
  return {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', reloading: 0, reloadDur: 1,
    weapon: { type: 'pistol', mag: 7 }, ammo: { '9mm': 7 },
    get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; this.reloading = 0; },
    reserveCount() { return this.ammo['9mm']; },
    kill(a, cause, killer) { this.alive = false; this.world.onKill(this, cause, killer); },
    takeMag() { const n = Math.min(this.def.mag, this.ammo['9mm']); this.ammo['9mm'] -= n; return n; },
    addAmmo(c, n) { this.ammo[c] += n; return true; },
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
  const chase = { ...level2a.chase, events: o.events ?? [], ...o.chase };
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

// with the swipes (and the tells, but with `tells`) out of the way (put back after)
function calm(fn, tells = false) {
  const r = CHASE.pursuit.ram.chance, g = CHASE.gunman.range;
  CHASE.pursuit.ram.chance = 0;
  if (!tells) CHASE.gunman.range = 0;
  try { return fn(); } finally { CHASE.pursuit.ram.chance = r; CHASE.gunman.range = g; }
}

test('pursuit: the slots, the lock, the band (pure)', () => {
  const band = [NORTH, SOUTH];
  const side = slotOf('side', 1000, SOUTH, band), behind = slotOf('behind', 1000, SOUTH, band);
  assert.ok(side.y < SOUTH - 60 && Math.abs(side.x - 1000) < 40, 'alongside, on his driver\'s side (-y), in the other lane');
  assert.equal(behind.y, SOUTH);
  assert.ok(behind.x < 1000 - 150);
  assert.ok(slotOf('side', 1000, NORTH, band).y > NORTH + 60, 'no room on his driver\'s side: the other one');
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

test('pursuit: a pursuer behind closes the gap and takes its slot alongside on his driver\'s side', () => calm(() => {
  const s = start();
  const car = s.P.spawn(s.v.x - 600, SOUTH, 0, 'chase', 9);
  run(s, 8);
  const sl = slotOf('side', s.v.x, s.v.y, s.P.band);
  assert.equal(car.state, 'chase');
  assert.ok(Math.abs(car.v.x - sl.x) < 40, `alongside (${Math.round(car.v.x - s.v.x)} px off him along the road)`);
  assert.ok(Math.abs(car.v.y - sl.y) < 16 && car.v.y < s.v.y - 60, `in the other lane, his driver's side (${Math.round(car.v.y)})`);
  assert.equal(s.w.kills.length, 0);
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

test('pursuit: shoved by his car into a wall at speed, it is wrecked (his doing: SHOVED)', () => calm(() => {
  // a yard: his van along the bottom of a wall, the pursuer between him and it
  const rows = [];
  for (let y = 0; y < 14; y++) {
    let r = '';
    for (let x = 0; x < 80; x++) r += y === 0 || y === 13 || x === 0 || x === 79 ? 'X' : '=';
    rows.push(r);
  }
  const s = start({ rows, chase: { lanes: [4.0, 6.5] } }, [8, 6.5]);
  const car = s.P.spawn(s.v.x, 4.0 * TILE, 0, 'chase', 8.9);
  run(s, 0.3);
  s.input.pressed.add('Space');
  run(s, 1.2, { x: s.v.x, y: s.v.y - 200 });
  assert.equal(car.state, 'wrecked');
  const k = s.w.kills.find((e) => e.how.car === 'shoved');
  assert.ok(k && k.cause === 'wreck' && k.killer === s.w.player, 'the crew\'s kill is his, tagged SHOVED');
}));

test('pursuit: the tell locks a lane band at its start; staying in it is death, a lane change or a brake dodges it', () => calm(() => {
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
  const braked = told((s) => s.input.held.add('KeyS'));
  assert.ok(braked.w.player.alive && !braked.w.killed, 'short of the bracket: alive');
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
  assert.equal(s.w.player.weapon.mag, 6);
  assert.ok(s.w.projectiles[0].ignore.has(s.v), 'never into his own car');
  run(s, 0.5);
  s.input.pressed.add('mouse0');
  run(s, DT, { x: s.v.x, y: s.v.y + 300 });
  assert.equal(s.w.projectiles.length, 1, 'across his own car: nothing');
  assert.equal(s.w.player.weapon.mag, 6);
  // R: the magazine out with its rounds, the spare one in
  s.input.pressed.add('KeyR');
  run(s, WEAPONS.pistol.reload + 0.1);
  assert.deepEqual([s.w.player.weapon.mag, s.w.player.ammo['9mm']], [7, 0]);
});

test('pursuit: a round through its windscreen kills the driver and it veers off; a front tyre spins it out', () => calm(() => {
  {
    const s = start();
    const car = s.P.spawn(s.v.x + 20, NORTH, 0, 'chase', 8.9);
    run(s, 0.5);
    const v = car.v, at = v.toWorld(89, v.h - 1);
    v.hit(1, at.x, at.y, -Math.PI / 2, 1, 'bullet'); // from his side, by the A pillar
    assert.ok(!car.driver && car.state === 'veer', `the driver (${car.state})`);
    const k = s.w.kills.find((e) => e.how.car === 'driver');
    assert.ok(k && k.cause === 'bullet' && k.killer === s.w.player);
    const y0 = v.y;
    run(s, 4, null, () => car.state === 'wrecked');
    assert.equal(car.state, 'wrecked', 'into the parked cars, a wall');
    assert.ok(Math.abs(v.y - y0) > 30, 'off its line');
  }
  {
    const s = start();
    const car = s.P.spawn(s.v.x + 20, NORTH, 0, 'chase', 8.9);
    run(s, 0.5);
    car.v.popTire(2, Math.PI / 2);
    assert.equal(car.state, 'spin');
    run(s, 0.2);
    assert.ok(Math.abs(Body.getAngularVelocity(car.v.body)) > 0.05, 'spinning');
    run(s, CHASE.pursuit.spin.dur + 0.1);
    assert.equal(car.state, 'wrecked');
    assert.ok(s.w.kills.some((e) => e.how.car === 'tyre'), 'BLOWOUT');
  }
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
  assert.equal(car.slot, 'side', 'still at him');
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

test('grab: level 2A sets off with the boss\'s Uzi on the passenger seat, 30 rounds in it and one spare magazine', () => {
  assert.deepEqual(ARMS, { weapon: 'uzi', mag: 30, spare: 30, seat: true });
  assert.equal(CHASE.vehicle, 'convertible');
  assert.equal(VEHICLES.convertible.gun[3], ARMS.weapon, 'the gun lying on its seat is the one he takes');
});

test('grab: the first start, he takes it in a short beat as the car rolls on by itself; nothing he does counts until it is done', () => {
  const s = start({ arms: ARMS }), { w, v, d, input } = s, p = w.player, G = SEAT.grab, y0 = v.y;
  p.ammo['9mm'] = 0;
  assert.ok(d.grab && d.grabbing && v.gun && p.weapon === null, 'the gun on the seat, his hands empty');
  assert.equal(p.riding.grab, 0);
  assert.equal(d.shot().name, 'grab', 'the camera pushed in on him');
  // he holds everything down: the throttle, a side, the shove, the trigger
  for (const k of ['KeyW', 'KeyA', 'Space']) input.held.add(k);
  input.pressed.add('Space');
  input.mouseDown = () => true;
  stepsTo(s, G.take - 0.05);
  assert.ok(v.gun && p.weapon === null, 'still on the seat');
  stepsTo(s, G.take + 0.05);
  assert.ok(!v.gun && p.weapon.type === 'uzi' && p.weapon.mag === 30 && p.ammo['9mm'] === 30, 'in his hand: 30 in it, 30 spare');
  stepsTo(s, G.dur - 0.05);
  assert.ok(d.grabbing && w.projectiles.length === 0 && p.weapon.mag === 30, 'not a round fired');
  assert.ok(Math.abs(d.v - CHASE.cruise) < 1e-6 && Math.abs(v.y - y0) < 1 && d.cool === 0, 'at cruise on its line, no shove');
  run(s, 0.1);
  assert.ok(!d.grabbing && p.riding.grab === null, 'done: the hand his');
  assert.equal(d.shot().name, 'grabOut', 'the camera going back out');
  run(s, 0.3);
  assert.ok(d.v > CHASE.cruise, 'the throttle his again');
  run(s, G.out);
  assert.ok(d.grab === null && d.shot() === null, 'the usual view');
});

test('grab: a retry starts with the Uzi already in hand, no beat', () => {
  const s = start({ arms: ARMS }), { v, d } = s, p = s.w.player;
  p.ammo['9mm'] = 0;
  d.skipGrab();
  assert.ok(!d.grab && !d.grabbing && !v.gun && d.shot() === null);
  assert.ok(p.weapon.type === 'uzi' && p.weapon.mag === 30 && p.ammo['9mm'] === 30 && p.riding.grab === null);
  d.skipGrab(); // (twice: nothing more)
  assert.equal(p.ammo['9mm'], 30);
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
