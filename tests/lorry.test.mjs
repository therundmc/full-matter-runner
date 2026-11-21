// Level 2A's back road polish (docs/LEVEL2.md, M1c): the lorry that backs out across the street (systems/Lorries.js),
// what the car does to the kerb's furniture (systems/Drive.js: torn, flung, never held up), its speed's effects (pure),
// the card that closes the demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { ctx, quiet } from './helpers.mjs';

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Lorries, backedAt, beepsBy } = await load('game/systems/Lorries.js');
const { default: Pursuit } = await load('game/systems/Pursuit.js');
const { default: Drive, skidOf, tearPower, finishView, onNose, nosedIn } = await load('game/systems/Drive.js');
const { CHASE } = await load('game/data/chase.js');
const { PROPS } = await load('game/data/props.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: level2a } = await load('game/data/levels/level2a.js');
const { default: lab } = await load('game/data/levels/lab.js');

const { Bodies, Body } = Matter;
const DT = 1 / 60;
const SIZE = { pursuer: [140, 58], convertible: [172, 64], van: [160, 64] };
const C = level2a.chase, [NORTH, SOUTH] = C.lanes.map((r) => r * TILE), KERB = C.kerbs[1] * TILE;
const EV = C.events.find((e) => e.kind === 'lorry');

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
    def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.physics.freezeIfHeavy(body);
  w.props.push(v);
  return v;
}
Pursuit.prototype.spawn = function (x, y, a, state, speed = 0) {
  const car = this.add(vehicle(this.world, 'pursuer', x, y), state, { speed });
  if (state !== 'wait') this.loose(car);
  return car;
};

// a prop as the systems see it (its def, its body), nothing drawn; `broke`: what break() was called with
function prop(w, type, x, y, a = 0) {
  const d = PROPS[type], o = { isStatic: !!d.static, angle: a, label: 'prop', collisionFilter: { category: CAT.PROP, mask: MASK.PROP } };
  const body = d.r ? Bodies.circle(x, y, d.r, o) : Bodies.rectangle(x, y, d.w, d.h, o);
  if (!d.static) setMaterial(body, d.kg, d.mu);
  const p = { type, def: d, body, dead: false, broke: null, get x() { return body.position.x; }, get y() { return body.position.y; },
    break(dir, power) { this.broke = { dir, power }; }, hit() {} };
  body.entity = p;
  w.physics.add(body);
  w.props.push(p);
  return p;
}

function world() {
  const events = new EventBus(), physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  physics.add(new TileMap(level2a.tiles).buildBodies());
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const w = {
    physics, events, chars: [], props: [], corpses: [], projectiles: [], texts: [], time: 0, sounds: [],
    particles: quiet, killed: null, kills: [], exited: false, cleared: false, drive: null, totalEnemies: 0, game: { onExit() {} },
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), sound(n) { w.sounds.push(n); }, shake() {}, noise() {}, light() {},
    addProjectile(p) { w.projectiles.push(p); },
    onKill(ch, cause, killer) { w.killed = { ch, cause, killer }; },
  };
  w.player = {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', reloading: 0, reloadDur: 1,
    weapon: { type: 'pistol', mag: 7 }, ammo: { '9mm': 7 }, world: w, takeMag() { return 0; }, addAmmo() { return true; },
    get x() { return body.position.x; }, get y() { return body.position.y; }, get def() { return WEAPONS[this.weapon.type]; },
    reserveCount() { return 7; }, kill(a, cause, killer) { this.alive = false; w.onKill(this, cause, killer); },
  };
  w.chars.push(w.player);
  events.on('kill', (e) => w.kills.push(e));
  return w;
}

const keys = () => { const held = new Set(), pressed = new Set(); return { held, pressed, down: (c) => held.has(c), hit: (c) => pressed.delete(c), mouseHit: () => false, mouseDown: () => false }; };

// his convertible at col, y px at cruise on the real back road, the lorry of event 2 (its prop made by hand) and the
// pursuit; out: the lorry already across the street
function start(col, y = SOUTH, o = {}) {
  const w = world(), v = vehicle(w, 'convertible', col * TILE, y);
  const chase = { ...C, events: [EV], arms: null, van: [col, y / TILE], end: null, water: null };
  w.drive = new Drive(w, chase, v);
  w.pursuit = new Pursuit(w, { ...chase, events: [] });
  w.lorries = new Lorries(w, null);
  const p = prop(w, 'lorry', EV.lorry[0] * TILE, EV.lorry[1] * TILE, -Math.PI / 2);
  const L = w.lorries.add(p, EV.back * TILE, { at: EV.at * TILE, gap: { x: EV.gap[0] * TILE, y: EV.gap[1] * TILE } });
  if (o.out) { w.lorries.move(L, L.dist); L.state = 'out'; }
  return { w, v, d: w.drive, P: w.pursuit, S: w.lorries, L, p, input: keys() };
}

function run(s, sec, until = null) {
  const { w, d, P, S, input } = s;
  for (let t = 0; t < sec; t += DT) {
    w.time += DT;
    d.step(DT, input, null);
    P.step(DT);
    S.step(DT);
    w.physics.step(DT, w.time);
    d.after(DT);
    P.after(DT);
    if (until?.()) return true;
  }
  return false;
}

test('lorry: told first, then backing at its speed until it has shut the road; a beep on the beat (pure)', () => {
  const L = CHASE.lorry, dist = 160;
  assert.equal(backedAt(0, dist), 0);
  assert.equal(backedAt(L.tell, dist), 0, 'it does not move while it is told');
  assert.ok(Math.abs(backedAt(L.tell + 0.5, dist) - L.speed * 0.5) < 1e-9);
  assert.equal(backedAt(L.tell + 10, dist), dist, 'and no further');
  assert.equal(backedAt(L.tell + dist / L.speed, dist), dist, 'shut');
  assert.equal(beepsBy(-1, dist), 0);
  assert.equal(beepsBy(0, dist), 1, 'the first beep as it is set off');
  assert.ok(beepsBy(L.tell, dist) >= 3, 'beeps before it moves: it is told');
  assert.equal(beepsBy(99, dist), beepsBy(L.tell + dist / L.speed, dist), 'silent once stopped');
});

test('lorry: the level\'s event 2 is set off at its distance, told before it moves, and shuts the street from the parking row to the south kerb', () => {
  assert.ok(EV && EV.at > 280 && EV.at < EV.lorry[0] - 20, 'told well before its yard (about 0:18 at 60 km/h)');
  const s = start(EV.at - 12), y0 = s.p.y;
  run(s, 0.5);
  assert.equal(s.L.state, 'wait', 'not before its distance');
  assert.equal(s.S.told().length, 0);
  assert.ok(run(s, 2, () => s.L.state === 'tell'), 'set off as his car passes its column');
  assert.ok(s.v.x >= EV.at * TILE && s.v.x < EV.at * TILE + 20);
  assert.equal(s.S.told().length, 1, 'told: the HUD\'s chevrons, the red lane');
  run(s, CHASE.lorry.tell - 0.1);
  assert.equal(s.p.y, y0, 'the tell first: it has not moved');
  assert.ok(s.w.sounds.filter((n) => n === 'lorryBeep').length >= 3, 'its beeper');
  run(s, 0.1 + (EV.back * TILE) / CHASE.lorry.speed + 0.2);
  assert.equal(s.L.state, 'out');
  assert.ok(Math.abs(s.p.y - y0 - EV.back * TILE) < 1e-6, 'backed its distance, along its tail (south)');
  const b = s.p.body.bounds;
  assert.ok(b.max.y >= KERB - 2, `its tail on the south kerb (${b.max.y} for ${KERB})`);
  assert.ok(b.min.y <= C.kerbs[0] * TILE, 'its cab still across the parking row: no way round by the north');
  assert.ok(b.min.x < EV.lorry[0] * TILE && b.max.x > EV.lorry[0] * TILE);
  assert.equal(s.S.told().length, 0, 'nothing told any more');
  // the way round: the terrace, open ground wide enough for the car between its tail and the cafe's front
  const map = new TileMap(level2a.tiles), col = Math.floor(EV.lorry[0]);
  for (let r = C.kerbs[1]; r < C.kerbs[1] + 4; r++) assert.ok(!map.isSolid(col, r), `the terrace is floor (row ${r})`);
  assert.ok(Math.abs(EV.gap[1] * TILE - (KERB + 2 * TILE)) < 2 * TILE, 'the bone arrows on it');
});

test('lorry: nose-on into it kills; a pursuer that follows him into it is wrecked there', () => {
  const s = start(EV.lorry[0] - 14, SOUTH, { out: true });
  const car = s.P.spawn(s.v.x - 150, NORTH, 0, 'chase', 9.5);
  assert.ok(run(s, 3, () => !s.w.player.alive), 'dead');
  assert.equal(s.w.killed.cause, 'crash');
  assert.ok(s.v.x < s.p.x, 'stopped on it');
  run(s, 2, () => car.state === 'wrecked');
  assert.equal(car.state, 'wrecked', 'the pursuer never saw it (prop `blind`)');
  assert.ok(s.w.kills.length >= 2, 'its two men');
  assert.ok(PROPS.lorry.lasting && PROPS.lorry.blind && PROPS.lorry.static);
});

test('lorry: a scrape along its tail, or a corner clipped, does not kill', () => {
  // through the terrace, his flank just brushing the end of its tail
  const s = start(EV.lorry[0] - 10, KERB + 30 - 2, { out: true });
  run(s, 2.2);
  assert.ok(s.w.player.alive, 'alive');
  assert.ok(s.v.x > s.p.x + 100, 'and past it');
  // (pure) what covers under a fifth of the nose's width is a clip, more of it the crash
  assert.ok(!onNose(0, 106, 130, 60) && !onNose(155, 400, 130, 60) && onNose(0, 400, 130, 60) && onNose(100, 115, 130, 60));
  assert.ok(nosedIn(0, 8.9, 0, 1, 0) && !nosedIn(0, 8.9, 0, 0, 1), 'square on, not along');
});

// his car come to a crawl with its nose on the lorry's flank, in the middle of the street (the QA robot's seed 7:
// col 336), the street's fronts and the terrace's bolted things there; van: the parked van of col 326 shoved into the
// south lane against the lorry and the kerb's planters, the way round shut
function nosed(van) {
  const s = start(330, SOUTH, { out: true });
  s.w.map = new TileMap(level2a.tiles);
  for (const [t, c, r, deg] of level2a.props) {
    if (c > 320 && c < 360 && r > C.kerbs[1] - 1 && r < C.kerbs[1] + 6 && PROPS[t]?.static && !PROPS[t].hung) prop(s.w, t, c * TILE, r * TILE, (deg * Math.PI) / 180);
  }
  Body.setPosition(s.v.body, { x: s.p.body.bounds.min.x - 102, y: 418 });
  s.d.v = 2;
  if (van) s.van = vehicle(s.w, 'van', s.v.x + 7, 483);
  return s;
}

test('lorry: boxed in at its flank (a car shoved into the way round), it is the crash, never a wait for good', () => {
  // (hands off, steering into the van, up into the dead end, back and forth between the two as the QA robot did)
  for (const steer of [null, 'KeyS', 'KeyW', 'both']) {
    const s = nosed(true), keys = s.input.held;
    if (steer && steer !== 'both') keys.add(steer);
    const how = steer || 'hands off', shuttle = () => {
      if (steer === 'both' && Math.round(s.w.time * 60) % 20 === 0) { keys.clear(); keys.add(Math.round(s.w.time * 3) % 2 ? 'KeyW' : 'KeyS'); }
      return !s.w.player.alive || (s.v.x > s.p.x + 40 && s.d.v > 0.6 * C.cruise);
    };
    assert.ok(run(s, 4, shuttle), `dead or through, not stuck there (${how}; at ${s.v.x.toFixed(0)}, ${s.v.y.toFixed(0)})`);
    // (steering into the van he shoves it aside now, a parked car never holds him up: he may get round the tail)
    if (s.w.player.alive) { assert.equal(how, 'KeyS', `${how}: the van shoved out of the way round`); continue; }
    assert.equal(s.w.killed.cause, 'crash');
    // (the market's kerb has no bolted planter to wedge the van on, as the terrace's had: it gives a while first)
    assert.ok(s.w.time < 3, `soon (${how}): ${s.w.time.toFixed(2)} s`);
    assert.ok(s.v.x < s.p.x, 'still at its flank');
  }
});

test('lorry: nose on its flank at a crawl with the way round open, it eases round the end of its tail and runs on', () => {
  const s = nosed(false);
  assert.ok(run(s, 4, () => s.v.x > s.p.x + 40 && s.d.v > 0.6 * C.cruise), `round it and running (at ${s.v.x.toFixed(0)}, ${s.v.y.toFixed(0)})`);
  assert.ok(s.w.player.alive && s.w.time < 3, `alive, in ${s.w.time.toFixed(2)} s`);
  assert.ok(s.v.y > s.p.body.bounds.max.y, 'by the terrace, south of its tail');
});

test('kerb: what stands on the fruit market is thrown or torn down, never a wall; the car is not held up by it', () => {
  // the level: the market's stalls, crates and signs on the way round the lorry (no cafe terrace), none of
  // them `lasting`: the stalls torn (bolted), the crates and the signs flung (loose, light)
  const [x, y] = EV.gap, on = level2a.props.filter(([t, c, r]) => Math.abs(c - x) < 14 && r > C.kerbs[1] && r < C.kerbs[1] + 5);
  const kinds = new Set(on.map(([t]) => t));
  for (const k of ['market_stall', 'market_stall_coco', 'fruit_crate_orange', 'fruit_crate_mango', 'fruit_crate_coconut', 'market_sign']) assert.ok(kinds.has(k), `${k} on the market`);
  for (const k of ['table_round', 'bollard']) assert.ok(!kinds.has(k), `no ${k}: no cafe terrace there`);
  for (const k of kinds) assert.ok(PROPS[k] && !PROPS[k].lasting, `${k} gives`);
  for (const k of kinds) assert.ok(PROPS[k].static || PROPS[k].hung || PROPS[k].kg <= CHASE.hit.fling.kg, `${k} is torn or flung`);
  assert.ok(on.length >= 30, `enough of it to fly (${on.length})`);
  assert.ok(PROPS.awning.canopy && PROPS.awning.hung && PROPS.awning_peach.canopy);
  // a chair (loose, light) in his lane is flung on ahead and to its side; a table (bolted) is torn down
  const s = start(60);
  const chair = prop(s.w, 'chair', s.v.x + 200, SOUTH - 12), table = prop(s.w, 'table_round', s.v.x + 420, SOUTH + 6);
  let fast = 0;
  run(s, 0.6, () => { fast = Math.max(fast, Body.getSpeed(chair.body)); return false; });
  assert.ok(fast > CHASE.cruise * 0.8, `the chair thrown at about the car's speed (${fast.toFixed(1)} px/step)`);
  assert.ok(Body.getVelocity(chair.body).y < 0 || chair.y < SOUTH - 12, 'out to the side it stood on');
  run(s, 0.6);
  assert.ok(table.broke && table.broke.power >= 2, 'the table torn down at once (power over 2: its pieces fly)');
  assert.ok(table.body.isSensor, 'and no longer in his way while it falls apart');
  assert.ok(s.d.v > CHASE.cruise * 0.9 && s.w.player.alive, `not held up (${s.d.v.toFixed(1)} px/step)`);
  // an awning he drives under comes down
  const awning = prop(s.w, 'awning', s.v.x + 300, s.v.y);
  awning.dying = false;
  s.d.canopies = null;
  run(s, 1);
  assert.ok(awning.broke, 'the awning');
  assert.ok(s.w.sounds.includes('awningRip'));
});

test('feel: the tyres let go on a shove and hard steering; a thing is torn harder the faster (pure)', () => {
  assert.equal(skidOf(0, 8.9, false), 0, 'straight: nothing');
  assert.equal(skidOf(0, 8.9, true), 1, 'a shove');
  assert.equal(skidOf(0, 1, true), 0, 'not at a crawl');
  assert.ok(skidOf(CHASE.steer, 8.9, false) > 0 && skidOf(-CHASE.steer, 8.9, false) > 0, 'full lock');
  assert.equal(skidOf(CHASE.steer * 0.5, 8.9, false), 0, 'a lane change taken gently');
  assert.ok(tearPower(CHASE.cruise) >= 2, 'at cruise speed a thing goes at once');
  assert.ok(tearPower(CHASE.max) > tearPower(CHASE.cruise) && tearPower(99) === CHASE.hit.most);
  assert.ok(tearPower(2.5) < tearPower(CHASE.cruise));
});

test('end: past the road\'s end the picture goes black, TO BE CONTINUED and what is next come up, then the results', () => {
  assert.equal(C.next, 'THE MOTORWAY');
  const F = CHASE.finish, a = finishView(0), b = finishView(F.fade), c = finishView(F.name + F.rise), d = finishView(F.hold);
  assert.deepEqual([a.black, a.title, a.name, a.skip, a.over], [0, 0, 0, false, false]);
  assert.equal(b.black, 1, 'black');
  assert.deepEqual([c.title, c.name, c.over], [1, 1, false], 'the card up');
  assert.ok(finishView(F.skipAfter).skip && !finishView(F.skipAfter - 0.1).skip, 'a key passes it once it is up');
  assert.ok(d.over);
  // the road still ends the level (Drive hands over to Game.onExit, which shows the card)
  const s = start(C.end - 2, C.legs[C.legs.length - 1].lanes[1] * TILE); // (on the last leg: the route's end)
  s.d.o.end = C.end;
  let exits = 0;
  s.w.game.onExit = () => exits++;
  run(s, 0.6);
  assert.ok(s.w.exited && exits === 1);
});

test('told shot: dead at the wheel of the open car he stays sat, slumped; the car runs on, slows and stops', () => {
  const s = start(60);
  s.v.seatIn = Vehicle.prototype.seatIn; s.v.slumpIn = Vehicle.prototype.slumpIn; s.v.unseat = Vehicle.prototype.unseat;
  s.v.seatIn(s.w.player);
  run(s, 0.2);
  const x0 = s.v.x;
  s.P.killRunner(s.P.target(), 0);
  assert.ok(!s.w.player.alive && s.d.dead && s.d.coasting, 'dead, nobody driving');
  assert.equal(s.v.rider, s.w.player, 'still in the seat');
  assert.ok(s.w.player.riding.slump > 0, 'slumped over the wheel');
  run(s, 0.5);
  assert.ok(s.v.x > x0 + 150 && s.d.v < CHASE.cruise, `it runs on, slower (${s.d.v.toFixed(1)})`);
  run(s, CHASE.cruise / CHASE.coast.slow + 1);
  assert.ok(!s.d.coasting && Body.getSpeed(s.v.body) < 0.2, 'stopped');
});

test('lab: a lorry to try (station 21), set to back out across the street', () => {
  const p = lab.props.find(([t]) => t === 'lorry');
  assert.ok(p && p[4]?.backs > 0, 'prop option `backs`');
  assert.ok(lab.props.some(([t, c, r, d, o]) => o?.drive && Math.abs(c - p[1]) < 12), 'a car to drive stands near it');
});
