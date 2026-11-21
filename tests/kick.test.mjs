// The player's feet on a standing guard (systems/Kick.js): the kick out of a slide's end, the legs off a car's hood;
// and the guard who sits back against a parked car's hood for a smoke (ai/Pastimes.js hoodSpot, body 'hood')
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { noop, sink } from './helpers.mjs';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
const { standing, kickReady, kickTarget, inPath, throwSpeed } = await load('game/systems/Kick.js');
const { hoodSpot, leanBroken } = await load('game/ai/Pastimes.js');
const { PLAYER, ENEMY, TILE, CAT } = await load('game/Config.js');
const { TRAVERSE, MOMENTS } = await load('game/data/feel.js');
const { POSTS, HOOD } = await load('game/data/posts.js');
const { SCORING } = await load('game/data/scoring.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: Player } = await load('game/entities/Player.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { newPose, kickPose, kickPhases, postPose } = await load('game/entities/CharacterAnim.js');

const K = PLAYER.slide.kick;
const guard = (x, y, over = {}) => ({ alive: true, knocked: 0, x, y, radius: 10, ...over });

test('kick: only at the end of a slide (its last part, as it stalls on him, or just after it)', () => {
  assert.equal(kickReady(0.2, 0, K), false, 'not in the heart of it: that is the sweep\'s');
  assert.equal(kickReady(K.from, 0, K), true);
  assert.equal(kickReady(0.95, 0, K), true);
  assert.equal(kickReady(0.3, 0, K, true), true, 'stopped short by him');
  assert.equal(kickReady(null, K.late * 0.5, K), true, 'as he gets up');
  assert.equal(kickReady(null, K.late + 0.05, K), false, 'too late: he is running again');
  assert.ok(K.from > 0.4 && K.from < 0.9 && K.late <= 0.2);
});

test('kick: the nearest standing guard within about a metre ahead, in a narrow cone, never one down, held or gone', () => {
  const ahead = guard(34, 0), near = guard(28, 4), aside = guard(0, 34), behind = guard(-30, 0), far = guard(K.range + 6, 0);
  assert.equal(kickTarget(0, 0, 0, [ahead, aside, behind, far], K), ahead);
  assert.equal(kickTarget(0, 0, 0, [ahead, near], K), near, 'the nearest');
  assert.equal(kickTarget(0, 0, 0, [aside, behind, far], K), null);
  assert.equal(kickTarget(0, 0, Math.PI / 2, [ahead, aside], K), aside, 'along the slide\'s way');
  // the cone: a man at 0.4 rad off the way is in it, at 0.65 rad not
  const at = (r) => guard(Math.cos(r) * 30, Math.sin(r) * 30);
  assert.ok(kickTarget(0, 0, 0, [at(0.4)], K) && !kickTarget(0, 0, 0, [at(0.65)], K));
  for (const over of [{ knocked: 1.5 }, { held: {} }, { vaulting: {} }, { alive: false }, { yielded: true }, { executing: true }]) {
    const g = guard(30, 0, over);
    assert.equal(standing(g), false, JSON.stringify(over));
    assert.equal(kickTarget(0, 0, 0, [g], K), null, JSON.stringify(over));
  }
  assert.equal(kickTarget(0, 0, 0, [ahead], K, () => false), null, 'no kick through a wall');
  assert.ok(K.range >= 30 && K.range <= 44, 'about a metre, centre to centre');
});

test('kick: the guard is thrown back 0.6 to 1 m along it (his slide on the floor braked as Enemy.updateKnocked does)', () => {
  const slid = (v0) => { let d = 0, v = v0; for (let i = 0; i < 600; i++) { v *= 1 - ENEMY.knockBrake; d += v; } return d; };
  for (const back of [K.back, TRAVERSE.vault.hip.strike.back]) {
    const d = slid(throwSpeed(back, ENEMY.knockBrake));
    assert.ok(Math.abs(d - back) < 0.5, `${d} px for ${back}`);
    assert.ok(back / TILE >= 0.6 && back / TILE <= 1, `${back / TILE} m`);
  }
  assert.ok(throwSpeed(K.back, ENEMY.knockBrake) < 4.5, 'gentler than a slide\'s sweep');
});

test('kick: data in range, a knock worth points and its label', () => {
  const T = TRAVERSE.kick;
  assert.ok(T.chamber < T.hit && T.hit < T.hold && T.hold < T.plant && T.plant < 1 && T.dur > 0.3 && T.dur < 0.6);
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const ph = kickPhases(u);
    for (const k of ['rise', 'chamber', 'ext', 'plant', 'w']) assert.ok(ph[k] >= 0 && ph[k] <= 1, `${k} at ${u}`);
  }
  assert.ok(kickPhases(T.hit).ext > 0.95, 'the leg right out at the contact');
  assert.ok(kickPhases(T.chamber).chamber > 0.95 && kickPhases(T.chamber).ext < 0.05, 'the knee drawn up before');
  assert.equal(kickPhases(1).w, 0, 'ends on the run');
  assert.ok(MOMENTS.slideKick.stop > MOMENTS.slide.stop && MOMENTS.slideKick.power <= 1);
  assert.ok(SCORING.knock.kick > 0 && SCORING.knock.hood > 0);
  assert.equal(SCORING.knockLabels.kick, 'SLIDE KICK');
  assert.equal(SCORING.knockLabels.hood, 'HOOD SLIDE');
});

// a player at (x, y), sliding along `a` at progress k, in a world that records what happens
function slider(x, y, a, enemies) {
  const done = [];
  const w = {
    time: 0, enemies, map: { solidAt: () => false }, windows: [], props: [], items: [],
    physics: { bodies: () => [], activePairs: () => [] },
    events: { emit: (n, e) => done.push([n, e]) }, particles: sink, decals: sink, camera: sink,
    sound: (n) => done.push(['sound', n]), noise: (...a) => done.push(['noise', a[2]]), shake: noop, hitstop: (s) => done.push(['hitstop', s]),
    slowmo: noop, floorAt: () => 'concrete', lineOfSight: () => true, light: noop,
  };
  const p = Object.create(Player.prototype);
  const body = Matter.Bodies.circle(x, y, PLAYER.radius);
  Object.assign(p, { world: w, body, isPlayer: true, alive: true, knocked: 0, angle: a, radius: PLAYER.radius, vaulting: null,
    vel: { x: 0, y: 0 }, slideEnd: { t: -9, a: 0 }, kick: null, slideAnim: { dir: a, side: 1, k: 0.8, w: 1 }, weapon: null });
  return { p, w, done };
}

test('kick: the slide ends in a kick on the guard just ahead: floored, thrown back along it, scored as a kick', () => {
  const knocks = [];
  const g = guard(130, 100, { isEnemy: true, knock(a, cause, opt) { knocks.push({ a, cause, opt }); this.knocked = 2.8; } });
  const { p, done } = slider(100, 100, 0, [g]);
  p.slide = { angle: 0, k: 0.7, speed: 2, dx: 1, dy: 0 };
  assert.ok(p.tryKick(0, 0.7), 'he pops up out of the slide');
  assert.equal(p.slide, null);
  assert.ok(p.kick && p.kick.target === g);
  for (let i = 0; i < 60 && p.kick; i++) { p.updateKick(1 / 60); Matter.Body.setPosition(p.body, { x: p.x + p.vel.x, y: p.y }); }
  assert.equal(p.kick, null, 'over within its clock');
  assert.equal(knocks.length, 1, 'one kick lands');
  const [{ a, cause, opt }] = knocks;
  assert.equal(cause, 'kick');
  assert.ok(Math.abs(a) < 0.2, 'thrown along the kick, his head away from it');
  assert.ok(Math.abs(opt.speed - throwSpeed(K.back, ENEMY.knockBrake)) < 1e-9);
  assert.ok(done.some(([n, s]) => n === 'hitstop' && s >= MOMENTS.slideKick.stop), 'the contact held');
  assert.ok(done.some(([n, s]) => n === 'sound' && s === 'kickHit'));
  // not on a man already down, nor in the heart of the slide
  const { p: q } = slider(100, 100, 0, [guard(130, 100, { knocked: 1 })]);
  assert.equal(q.tryKick(0, 0.9), false);
  const { p: r } = slider(100, 100, 0, [guard(130, 100)]);
  assert.equal(r.tryKick(0, 0.3), false);
});

test('kick: the pose drives the lead leg out at his head, the foot up toward the eye, and ends on the stance', () => {
  const g = guard(126, 100, { isEnemy: true, knock() { this.knocked = 2.8; } });
  const { p } = slider(100, 100, 0, [g]);
  p.slide = { angle: 0, k: 0.8, speed: 1.8, dx: 1, dy: 0 };
  p.tryKick(0, 0.8);
  const T = TRAVERSE.kick, lead = p.kick.side > 0 ? 0 : 1; // the slide's lead leg: across from its palm
  const pose = (t) => { p.kick.t = t; return kickPose(p, newPose(), newPose()); };
  const atHit = pose(T.hit * T.dur), foot = atHit.feet[lead], other = atHit.feet[1 - lead];
  assert.ok(foot.x > 12, `the foot out ahead (${foot.x.toFixed(1)} pose px)`);
  assert.ok(foot.lift > 1, 'up toward the eye');
  assert.ok(other.x < 2, 'the other one under him');
  assert.ok(atHit.tx < -1, 'the torso back off it');
  const chambered = pose(T.chamber * T.dur).feet[lead];
  assert.ok(chambered.x < 6 && chambered.lift > 0.5, 'the knee drawn up first');
  const end = pose(T.dur), still = newPose();
  assert.ok(Math.abs(end.feet[lead].x - still.feet[lead].x) < 1e-9, 'back to the stance');
});

// a parked car facing `deg` at (x, y): the real one's geometry, nothing drawn
function car(model, x, y, deg) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model], w = model === 'car' ? 140 : model === 'car2' ? 134 : 160;
  const h = model === 'car' ? 58 : model === 'car2' ? 56 : 64;
  const body = Matter.Bodies.rectangle(x, y, w - 4, h - 4, { isStatic: true, angle: (deg * Math.PI) / 180, collisionFilter: { category: CAT.PROP } });
  body.entity = v;
  Object.assign(v, { type: model, m, w, h, body, isVehicle: true, moving: false, burning: false, exploded: false, dead: false,
    flash: 0, def: { vault: true, static: true } });
  return v;
}

test('hood: the spot is against the flank by the hood (or its nose), facing away, off the road, turned with the car', () => {
  const offRoad = (x, y) => y < 727; // the road: south of the car's middle
  for (const deg of [0, 180, 37]) {
    const c = car('car2', 500, 728, deg), a = (deg * Math.PI) / 180, gap = ENEMY.radius + HOOD.gap;
    const s = hoodSpot(c, 500, 600, gap, offRoad);
    assert.ok(s, `${deg}`);
    assert.ok(s.y < 727, `${deg}: on the sidewalk`);
    // its back to the car: the way it faces points from the car's middle line out through it
    const lx = (s.x - c.x) * Math.cos(a) + (s.y - c.y) * Math.sin(a), ly = -(s.x - c.x) * Math.sin(a) + (s.y - c.y) * Math.cos(a);
    const out = Math.abs(ly) > 1 ? Math.atan2(Math.sign(ly) * Math.cos(a), -Math.sign(ly) * Math.sin(a)) : a;
    assert.ok(Math.abs(Math.atan2(Math.sin(s.face - out), Math.cos(s.face - out))) < 1e-6, `${deg}: facing away`);
    // by the hood, the body's circle just off the bodywork
    const [h0, h1] = VEHICLES.car2.hood;
    if (Math.abs(ly) > 1) {
      assert.ok(Math.abs(lx - ((h0 + h1) / 2 - c.w / 2)) < 1e-6, `${deg}: by the hood`);
      assert.ok(Math.abs(Math.abs(ly) - c.h / 2 - gap) < 1e-6);
    } else assert.ok(Math.abs(lx - c.w / 2 - gap) < 1e-6, `${deg}: against the nose`);
  }
  assert.equal(hoodSpot(car('car2', 500, 728, 0), 500, 600, 12, () => false), null, 'nowhere to stand');
  // turned with the car: the same spot in its own frame
  const s0 = hoodSpot(car('car', 0, 0, 0), 0, -100, 12), s1 = hoodSpot(car('car', 0, 0, 90), 100, 0, 12);
  assert.ok(Math.abs(s1.x - -s0.y) < 1e-6 && Math.abs(s1.y - s0.x) < 1e-6 && Math.abs(s1.face - s0.face - Math.PI / 2) < 1e-6);
});

test('hood: the lean is over when the car drives off, is shoved, struck, burns or blows up', () => {
  const c = car('car', 0, 0, 0), at = { x: 0, y: 0 };
  assert.equal(leanBroken(c, at), false);
  for (const [k, v] of [['moving', true], ['flash', 0.05], ['burning', true], ['exploded', true]]) {
    const d = car('car', 0, 0, 0);
    d[k] = v;
    assert.equal(leanBroken(d, at), true, k);
  }
  Matter.Body.setPosition(c.body, { x: 5, y: 0 });
  assert.equal(leanBroken(c, at), true, 'shoved');
});

// a street (sidewalk rows 0-2, road rows 3-6), a car parked along the kerb, a guard on the sidewalk at the 'beat' job
async function streetGuard(x, y) {
  const { default: Enemy } = await load('game/entities/Enemy.js');
  const { default: Director } = await load('game/ai/Director.js');
  const { findPath } = await load('engine/nav/Pathfinding.js');
  const map = new TileMap(['ssssssssss', 'ssssssssss', 'ssssssssss', '==========', '==========', '----------', '==========']);
  const v = car('car2', 5 * TILE, 3 * TILE + 30, 0);
  const world = {
    map, props: [v], enemies: [], chars: [], doors: [], texts: [], time: 0, level: {}, events: { on() {}, emit() {} },
    player: { alive: false, x: 0, y: 0 },
    particles: sink, smoke: null,
    sound() {}, light() {}, emit() {}, after() {}, addBody() {}, floorAt: () => 'sidewalk', sightLine: () => false, lineOfSight: () => false,
    pathForGuard: (a, b, c, d) => findPath(map, a, b, c, d),
  };
  world.director = new Director(world);
  const e = new Enemy(world, x, y, 0, 'thug', 'knife');
  e.perceive = () => {}; e.scanWorld = () => {};
  e.takeJob('beat');
  world.enemies.push(e); world.chars.push(e);
  const step = (s) => {
    for (let t = 0; t < s; t += 1 / 60) {
      world.time += 1 / 60;
      e.update(1 / 60);
      const vel = Matter.Body.getVelocity(e.body);
      Matter.Body.setPosition(e.body, { x: e.x + vel.x, y: e.y + vel.y });
    }
  };
  return { e, v, step, world };
}

// the hood act begun where he stands (a halt on his round)
function startHood(e) {
  e.pauseT = 0;
  e.routine.act = null;
  e.activity = e.job;
  e.routine.begin('hood');
  e.startPhase();
}

test('hood: a guard backs onto the car by its hood, settles, smokes with a hand on it, and is off it when it moves', async () => {
  const { e, v, step } = await streetGuard(5.9 * TILE, 1.2 * TILE);
  e.pauseT = 0; e.state = 'idle'; e.home = { x: e.x, y: e.y, angle: 0 };
  startHood(e);
  step(4);
  assert.equal(e.postureOf, 'hood');
  assert.equal(e.posture, 1, 'settled against it');
  const s = e.workSpot;
  assert.ok(s?.car === v && Math.hypot(e.x - s.x, e.y - s.y) < 10, 'at the spot');
  assert.ok(s.y < 3 * TILE, 'on the sidewalk side');
  assert.ok(Math.abs(Math.atan2(Math.sin(e.angle - s.face), Math.cos(e.angle - s.face))) < 0.6, 'his back to it');
  step(3);
  assert.equal(e.routine.phase.g, 'hood', 'lit up, at his smoke');
  const B = e.postBody(), P = postPose(e, newPose(), newPose(), B);
  assert.equal(P.flat, 'hl', 'a hand flat on the hood behind him');
  assert.ok(Math.abs(B.face - s.face) < 1e-9, 'laid out square to the car');
  const fx = (f) => (f.x * Math.cos(s.face) + f.y * Math.sin(s.face)), fy = (f) => (-f.x * Math.sin(s.face) + f.y * Math.cos(s.face));
  assert.ok(fx(P.feet[0]) > 8 && fx(P.feet[1]) > 8, 'the legs out in front');
  assert.ok(fy(P.feet[0]) > fy(P.feet[1]), 'crossed at the ankles (the left foot over to the right)');
  // the car drives off: he is off it at once, and never goes back to it
  v.moving = true;
  step(HOOD.off + 0.1);
  assert.equal(e.posture, 0, 'off it');
  assert.equal(e.shunned, v);
  v.moving = false;
  startHood(e);
  step(1);
  assert.notEqual(e.workSpot?.car, v, 'not that one again');
});

test('hood: the level may open on the patrol already leaning there; alerted, he pushes off it at once', async () => {
  const { e, v, step, world } = await streetGuard(5.9 * TILE, 1.2 * TILE);
  e.openAt(POSTS.beat.open);
  assert.ok(e.posture === 1 && e.postureOf === 'hood' && e.workSpot?.car === v);
  assert.equal(e.routine.phase.g, 'hood', 'smoking already');
  e.routine.t = 0; // (somewhere into his smoke: from its start here, so it lasts the test)
  step(1);
  assert.equal(e.posture, 1, 'still there');
  world.director.phase = 'alert';
  e.suspect(e.x, e.y - 100, 'noise');
  step(HOOD.off * 0.5);
  assert.ok(e.posture > 0 && e.posture < 1, 'pushing off');
  step(HOOD.off * 0.6);
  assert.equal(e.posture, 0, 'up on his feet');
});

test('hood slide: the player\'s legs off a car\'s hood take the guard leaning on its far side', () => {
  const v = car('car2', 300, 300, 0), [h0, h1] = VEHICLES.car2.hood, hx = 300 + (h0 + h1) / 2 - v.w / 2;
  const gap = ENEMY.radius + HOOD.gap;
  const knocks = [];
  const g = guard(hx, 300 - v.h / 2 - gap, { isEnemy: true, body: Matter.Bodies.circle(hx, 300 - v.h / 2 - gap, 10, { collisionFilter: { category: CAT.CHAR } }),
    knock(a, cause, opt) { knocks.push({ a, cause, opt }); this.knocked = 2.8; } });
  g.body.entity = g;
  const { p, w } = slider(hx, 300 + v.h / 2 + 16, -Math.PI / 2, [g]);
  w.props = [v];
  w.physics.bodies = () => [v.body, g.body];
  assert.ok(p.tryVault(-Math.PI / 2), 'over the hood, though he stands where the feet come down');
  assert.equal(p.vaulting.style, 'hip');
  assert.equal(p.vaulting.strike?.target, g, 'the guard in the way');
  for (let i = 0; i < 60 && p.vaulting; i++) p.updateVault(1 / 60);
  assert.equal(knocks.length, 1, 'struck once');
  assert.equal(knocks[0].cause, 'hood');
  assert.ok(Math.abs(knocks[0].a + Math.PI / 2) < 1e-9, 'thrown on along the vault');
  // a guard well off the way out is left alone
  const h = guard(hx + 60, 300 - v.h / 2 - gap, { isEnemy: true, knock() { knocks.push('h'); } });
  const { p: q, w: w2 } = slider(hx, 300 + v.h / 2 + 16, -Math.PI / 2, [h]);
  w2.props = [v];
  w2.physics.bodies = () => [v.body];
  assert.ok(q.tryVault(-Math.PI / 2));
  assert.equal(q.vaulting.strike, null);
  assert.ok(inPath({ x: 0, y: 0 }, { x: 0, y: -50 }, [guard(4, -45)], 16));
});
