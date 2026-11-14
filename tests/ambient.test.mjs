import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, AMBIENT: A, CAT, MASK } = await load('game/Config.js');
const { Lane, Driver, gapAhead, safeSpeed, findBypass, steerAngle, seeded } = await load('game/systems/Traffic.js');
const { Walker, WALKER, escapeRoute, pathLength, pointAlong } = await load('game/ai/Civilians.js');
const { default: TileMap } = await load('game/world/TileMap.js');

const box = (x0, x1, y0, y1, extra = {}) => ({ x0, x1, y0, y1, ref: {}, moving: false, speed: 0, ...extra });
const laneDef = { row: 10, dir: 1, speed: 9, gap: [2, 4], models: ['car'] };

test('ambient: seeded random is deterministic', () => {
  const a = seeded(42), b = seeded(42), c = seeded(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, [c(), c(), c()]);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('traffic: lane spawn schedule follows the gaps and the global cap', () => {
  const lane = new Lane(laneDef, 40 * TILE), r = seeded(1);
  let spawns = 0;
  for (let t = 0; t < 60; t += 0.1) if (lane.tick(0.1, { spawnClear: true, laneClear: true, room: true }, r)) spawns++;
  assert.ok(spawns >= 60 / 4 - 1 && spawns <= 60 / 2 + 1, `${spawns} spawns in 60 s with a 2-4 s gap`);
  let capped = 0;
  for (let t = 0; t < 20; t += 0.1) if (lane.tick(0.1, { spawnClear: true, laneClear: true, room: false }, r)) capped++;
  assert.equal(capped, 0);
  assert.equal(lane.closed, false, 'a full street is not a jam');
});

test('traffic: a lane whose spawn stays blocked closes, then reopens once clear', () => {
  const lane = new Lane(laneDef, 40 * TILE), r = seeded(2);
  for (let t = 0; t < A.jam + 5; t += 0.1) assert.equal(lane.tick(0.1, { spawnClear: false, laneClear: false, room: true }, r), false);
  assert.equal(lane.closed, true);
  for (let t = 0; t < A.reopen - 0.5; t += 0.1) lane.tick(0.1, { spawnClear: true, laneClear: true, room: true }, r);
  assert.equal(lane.closed, true, 'still waiting for the lane to stay clear');
  let spawned = false;
  for (let t = 0; t < 10 && !spawned; t += 0.1) spawned = lane.tick(0.1, { spawnClear: true, laneClear: true, room: true }, r);
  assert.equal(lane.closed, false);
  assert.ok(spawned);
});

test('traffic: spawn / exit points sit beyond the map edge in the driving direction', () => {
  const W = 40 * TILE;
  const east = new Lane(laneDef, W), west = new Lane({ ...laneDef, dir: -1 }, W);
  assert.ok(east.spawnX(70) < -70 && west.spawnX(70) > W + 70);
  assert.ok(east.gone(W + 70 + A.margin * TILE + 20, 70) && !east.gone(W / 2, 70));
  assert.ok(west.gone(-70 - A.margin * TILE - 20, 70) && !west.gone(W / 2, 70));
});

test('traffic: obstacles ahead in the band only', () => {
  const car = { x: 100, y: 320, hl: 70, hw: 27, dir: 1, ref: 'me' };
  const ahead = box(400, 500, 300, 340), other = box(250, 300, 420, 460), behind = box(-200, -100, 300, 340);
  assert.equal(gapAhead(car, [ahead, other, behind]).gap, 400 - 170);
  assert.equal(gapAhead(car, [other, behind]).gap, Infinity);
  assert.equal(gapAhead(car, [box(120, 260, 300, 340)]).gap, 0, 'overlapping its nose');
  assert.equal(gapAhead(car, [{ ...ahead, ref: 'me' }]).gap, Infinity, 'not itself');
  // driving west, the obstacle is on the other side
  assert.equal(gapAhead({ ...car, dir: -1 }, [ahead]).gap, Infinity);
  assert.equal(gapAhead({ ...car, dir: -1 }, [box(-300, -200, 300, 340)]).gap, (100 - 70) - -200);
  // the band can be another row (going around)
  assert.equal(gapAhead(car, [ahead], 440).gap, Infinity);
});

test('traffic: safe speed stops short of the obstacle and grows with room', () => {
  assert.equal(safeSpeed(A.minGap * TILE * 0.9), 0);
  const v1 = safeSpeed(5 * TILE), v2 = safeSpeed(15 * TILE), v3 = safeSpeed(15 * TILE, 8 * TILE);
  assert.ok(v1 > 0 && v2 > v1 && v3 > v2, 'a moving leader leaves more room');
  // a car approaching a wreck stops between minGap and minGap + detour room, without touching it
  const lane = new Lane(laneDef, 80 * TILE), d = new Driver(lane, seeded(3));
  let x = 0;
  const wreck = 40 * TILE;
  for (let t = 0; t < 20; t += 1 / 60) {
    const gap = wreck - (x + 70);
    d.update(1 / 60, { x, y: lane.y, hw: 27, gap, lead: 0, leadStatic: true, person: Infinity, passed: false, stalled: false });
    x += d.speed / 60;
  }
  const gap = wreck - (x + 70);
  assert.ok(d.speed < 1, `stopped (${d.speed})`);
  assert.ok(gap > A.minGap * TILE * 0.8 && gap < (A.minGap + A.detour.room) * TILE * 1.6, `gap ${gap}`);
});

test('traffic: going around a stuck obstacle after waiting, only through a free row', () => {
  const car = { x: 300, y: 320, hl: 70, hw: 27, dir: 1, ref: 'me' };
  const wreck = box(450, 590, 295, 345);
  assert.deepEqual(findBypass(car, wreck, [320, 416], [wreck]), { y: 416, passX: 590 + 70 + A.minGap * TILE });
  assert.equal(findBypass(car, wreck, [320, 416], [wreck, box(500, 640, 390, 440)]), null, 'other row blocked');
  // oncoming traffic (driving west on that row) still far away but fast: wait
  assert.equal(findBypass(car, wreck, [320, 416], [wreck, box(1200, 1340, 390, 440, { moving: true, speed: -280 })]), null);
  assert.ok(findBypass(car, wreck, [320, 416], [wreck, box(2400, 2540, 390, 440, { moving: true, speed: -280 })]));

  const lane = new Lane(laneDef, 80 * TILE), d = new Driver(lane, seeded(4));
  d.speed = 0;
  let asked = 0;
  const s = { x: 300, y: lane.y, hw: 27, gap: 60, lead: 0, leadStatic: true, person: Infinity, passed: false, stalled: false,
    bypass: () => { asked++; return { y: lane.y + 96, passX: 900 }; } };
  for (let t = 0; t < d.patience - 0.2; t += 1 / 60) d.update(1 / 60, s);
  assert.equal(asked, 0, 'patient first');
  for (let t = 0; t < 0.5; t += 1 / 60) d.update(1 / 60, s);
  assert.equal(asked, 1);
  assert.ok(Math.abs(d.targetY - (lane.y + 96)) < 8, 'heads for the free row');
  // wedged against the corner: backs up a little
  d.update(1 / 60, { ...s, stalled: true });
  assert.ok(d.speed < 0);
  for (let t = 0; t < A.detour.reverse + 0.1; t += 1 / 60) d.update(1 / 60, s);
  assert.ok(d.reverseT <= 0);
  d.update(1 / 60, { ...s, passed: true, gap: Infinity });
  assert.equal(d.bypass, null, 'back to its lane once past');
});

test('traffic: a driver who hears shots stands on the brake after a moment of shock and abandons the car', () => {
  const lane = new Lane(laneDef, 80 * TILE), d = new Driver(lane, seeded(6));
  const s = { x: 0, y: lane.y, hw: 27, gap: Infinity, lead: 0, leadStatic: false, person: Infinity, passed: false, stalled: false };
  d.update(1 / 60, s);
  const cruise = d.speed;
  d.flee(0.5);
  d.flee(5); // the first scare counts
  let t = 0, x = 0;
  for (; t < 0.4; t += 1 / 60) d.update(1 / 60, s);
  assert.ok(d.speed >= cruise * 0.95, 'still driving during the shock');
  for (; d.state !== 'stopped' && t < 10; t += 1 / 60) { d.update(1 / 60, s); x += d.speed / 60; }
  assert.equal(d.state, 'stopped');
  assert.equal(d.reason, 'scared');
  assert.ok(t < 4, `stopped in ${t} s`);
  assert.ok(x / TILE < 14, `over ${x / TILE} m`);
  assert.ok(A.flee.odds > 0.5 && A.flee.odds < 1, 'most stop, some floor it');
});

test('traffic: a hopeless jam ends with the engine off (parked), never a frozen driver', () => {
  const lane = new Lane(laneDef, 80 * TILE), d = new Driver(lane, seeded(5));
  d.speed = 0;
  const s = { x: 0, y: lane.y, hw: 27, gap: 60, lead: 0, leadStatic: true, person: Infinity, passed: false, stalled: false, bypass: () => null };
  for (let t = 0; t < A.giveUp + 1; t += 1 / 60) d.update(1 / 60, s);
  assert.equal(d.state, 'stopped');
  assert.equal(d.reason, 'jam');
});

test('traffic: people are seen late, shot-up cars coast and stop, a driver under fire floors it', () => {
  const lane = new Lane(laneDef, 80 * TILE);
  const free = { x: 0, y: lane.y, hw: 27, gap: Infinity, lead: 0, leadStatic: false, person: Infinity, passed: false, stalled: false };
  const d = new Driver(lane, seeded(6));
  const v0 = d.speed;
  for (let t = 0; t < 0.6; t += 1 / 60) d.update(1 / 60, { ...free, person: 0.5 * TILE });
  assert.ok(d.speed < v0 && d.brake === 1, 'stomps on the brake');
  const p = new Driver(lane, seeded(6));
  p.panic = true;
  for (let t = 0; t < 3; t += 1 / 60) p.update(1 / 60, free);
  assert.ok(p.speed > p.cruise * 1.2);
  const c = new Driver(lane, seeded(7));
  c.disable('tyre', 1);
  assert.equal(c.state, 'coast');
  assert.ok(c.coastY > lane.y, 'drifts toward the burst tyre side');
  let tt = 0;
  for (; tt < 10 && c.state !== 'stopped'; tt += 1 / 60) c.update(1 / 60, free);
  assert.equal(c.state, 'stopped');
  assert.ok(tt > 1 && tt < 6, `rolled for ${tt.toFixed(1)} s`);
  c.disable('fire', 1);
  assert.equal(c.reason, 'tyre', 'first cause kept');
});

test('traffic: steering toward the target row depends on the driving direction', () => {
  assert.ok(steerAngle(1, 320, 352) > 0 && steerAngle(1, 352, 320) < 0);
  assert.ok(steerAngle(-1, 320, 352) < Math.PI && steerAngle(-1, 352, 320) > Math.PI);
  assert.ok(Math.abs(steerAngle(1, 0, 1000)) <= A.maxSteer + 1e-9);
});

// ---------------- passers-by ----------------
const path = [{ x: -48, y: 100 }, { x: 600, y: 100 }];
const run = (w, sense, dt = 1 / 30, max = 60) => {
  let x = w.path[0].x, y = w.path[0].y, t = 0;
  const states = new Set();
  for (; t < max && w.state !== WALKER.DONE; t += dt) {
    const it = w.update(dt, x, y, sense);
    states.add(w.state);
    if (it.x !== null) {
      const dx = it.x - x, dy = it.y - y, l = Math.hypot(dx, dy) || 1, s = Math.min(l, it.speed * dt);
      x += (dx / l) * s; y += (dy / l) * s;
    }
  }
  return { x, y, t, states };
};

test('walkers: stroll the whole path, maybe stopping once', () => {
  assert.equal(pathLength(path), 648);
  assert.deepEqual(pointAlong(path, 100), { x: 52, y: 100, i: 1 });
  for (let seed = 1; seed < 12; seed++) {
    const w = new Walker(path, { r: seeded(seed), speed: 40, run: 150 });
    const res = run(w, { escape: () => null });
    assert.equal(w.state, WALKER.DONE);
    assert.ok(Math.abs(res.x - 600) < 8);
    if (res.states.has(WALKER.STOP)) assert.ok(res.t > 648 / 40 + A.stop[0] - 1, 'a stop takes time');
  }
});

test('walkers: panic (freeze) then run away along the escape route, or cower without one', () => {
  const w = new Walker(path, { r: seeded(3), speed: 40, run: 150 });
  w.update(0.1, 0, 100, {});
  assert.equal(w.alarm(50, 100, 'armed'), true);
  assert.equal(w.state, WALKER.PANIC);
  assert.equal(w.pose, 'hands');
  assert.equal(w.bark, 'beg');
  assert.equal(w.alarm(50, 100, 'gunshot'), false, 'already panicking');
  let asked = null;
  const sense = { escape: (x, y, danger) => { asked = danger; return [{ x: -100, y: 100 }]; } };
  let it;
  for (let t = 0; t < 1.2; t += 0.05) it = w.update(0.05, 0, 100, sense);
  assert.equal(w.state, WALKER.FLEE);
  assert.deepEqual(asked, { x: 50, y: 100 });
  assert.equal(it.speed, 150);
  assert.equal(it.x, -100);
  w.update(0.05, -95, 100, sense);
  assert.equal(w.state, WALKER.DONE);

  const c = new Walker(path, { r: seeded(4), speed: 40, run: 150 });
  c.alarm(0, 0, 'explosion');
  for (let t = 0; t < 1.2; t += 0.05) c.update(0.05, 0, 100, { escape: () => null });
  assert.equal(c.state, WALKER.COWER);
  assert.equal(c.pose, 'duck');
});

test('walkers: a couple stops together', () => {
  let lead;
  for (let seed = 1; !lead; seed++) {
    const w = new Walker(path, { r: seeded(seed), speed: 40, run: 150 });
    if (w.stopAt > 0) lead = w;
  }
  const mate = new Walker(path.map((p) => ({ x: p.x, y: p.y + 15 })), { r: seeded(99), speed: 40, run: 150, partner: lead });
  assert.equal(mate.stopAt, -1, 'the follower never stops on his own');
  let x = path[0].x;
  for (let t = 0; t < 30 && lead.state !== WALKER.STOP; t += 0.05) {
    const it = lead.update(0.05, x, 100, {});
    mate.update(0.05, x, 115, {});
    if (it.x !== null) x += 40 * 0.05;
  }
  assert.equal(lead.state, WALKER.STOP);
  mate.update(0.05, x, 115, {});
  assert.equal(mate.state, WALKER.STOP);
  assert.equal(mate.activity, 'chat');
});

test('walkers: escape routes leave the map away from the danger', () => {
  const rows = [
    'XXXXXXXXXXXXXXXXXXXX',
    'ssssssssssssssssssss',
    'ssssssssssssssssssss',
    '====================',
    'XXXXXXXXXXXXXXXXXXXX',
  ];
  const m = new TileMap(rows);
  const T = TILE, W = m.widthPx;
  const west = escapeRoute(m, 12 * T, 1.5 * T, { x: 14 * T, y: 1.5 * T });
  assert.ok(west.at(-1).x < 0, 'danger east: runs west');
  const east = escapeRoute(m, 8 * T, 1.5 * T, { x: 6 * T, y: 1.5 * T });
  assert.ok(east.at(-1).x > W, 'danger west: runs east');
  // nearest exit when nothing is around
  assert.ok(escapeRoute(m, 2 * T, 2 * T, null).at(-1).x < 0);
  // already off the map: keep going
  assert.deepEqual(escapeRoute(m, -10, 2 * T, { x: 100, y: 2 * T }).length, 1);
  // walled-in room: no way out
  const room = new TileMap(['XXXXX', 'X...X', 'X...X', 'XXXXX']);
  assert.equal(escapeRoute(room, 2.5 * T, 1.5 * T, null), null);
});

test('edges: invisible bars around the map stop characters, not traffic or passers-by', () => {
  const m = new TileMap(['ssss', '====', 'ssss']);
  const bars = m.buildEdgeBodies();
  assert.equal(bars.length, 4);
  for (const b of bars) assert.equal(b.collisionFilter.category, CAT.EDGE);
  const collides = (mask) => (mask & CAT.EDGE) !== 0;
  assert.ok(collides(MASK.CHAR) && collides(MASK.PROP) && collides(MASK.ITEM) && collides(MASK.CORPSE));
  assert.ok(!collides(MASK.PROP & ~CAT.EDGE & ~CAT.CORPSE), 'driving mask');
  // left bar spans the whole height just outside x = 0
  const left = bars.find((b) => b.position.x < 0);
  assert.ok(left.bounds.max.x <= 0.01 && left.bounds.min.y <= 0 && left.bounds.max.y >= m.heightPx);
});

test('walkers: a bat or a knife scares them too, but only a gun makes them beg', () => {
  const w = new Walker(path, { r: seeded(3), speed: 40, run: 150 });
  w.update(0.1, 0, 100, {});
  assert.equal(w.alarm(50, 100, 'weapon'), true);
  assert.equal(w.state, WALKER.PANIC);
  assert.equal(w.pose, 'duck');
  assert.equal(w.bark, 'back');
});

test('patrons: posted at their spot for good, busy, they panic like anyone at the first shot', () => {
  const w = new Walker([{ x: 100, y: 100 }], { r: seeded(5), speed: 40, run: 150, post: { activity: 'cards', face: 1 } });
  for (let i = 0; i < 600; i++) w.update(0.1, 100, 100, {});
  assert.deepEqual(w.update(0.1, 100, 100, {}), { x: null, y: null, speed: 0, face: 1 });
  assert.equal(w.state, WALKER.STOP);
  assert.equal(w.activity, 'cards');
  assert.equal(w.alarm(50, 100, 'gunshot'), true);
  assert.equal(w.state, WALKER.PANIC);
});

test('pastimes: one pool stroke per cycle, the cue shot through right then', async () => {
  const { struck, cueShift, sip } = await load('game/ai/Pastimes.js');
  let n = 0, at = 0;
  for (let i = 0; i < 1000; i++) if (struck(i * 0.02, (i + 1) * 0.02, 0.3)) { n++; at = (i + 1) * 0.02; }
  assert.equal(n, 4, 'four strokes in 20 s');
  assert.ok(cueShift(at - 0.3, 0.3) < -3 && cueShift(at + 0.1, 0.3) > 6, 'drawn back, then through the ball');
  for (let t = 0; t < 20; t += 0.05) assert.ok(sip(t, 0.7) >= 0 && sip(t, 0.7) <= 1);
});

test('patrons: boxed in by the furniture he sits on, a patron still finds his way out, never through a wall', () => {
  const m = new TileMap(['XXXXXXX', 'X.....s', 'X.....s', 'X.....s', 'XXXXXXX']);
  const T = TILE, W = m.w;
  // a booth against the west wall: sofa cells (1, 1..3), tables right of them (2, 1..3)
  for (const [x, y] of [[1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3]]) m.blocked[y * W + x] = 1;
  const route = escapeRoute(m, 1.5 * T, 2.5 * T, null);
  assert.ok(route && route.at(-1).x > m.widthPx, 'out by the east side');
  // furniture on every side for more than two cells: he stays put
  for (let y = 1; y <= 3; y++) for (let x = 3; x <= 5; x++) m.blocked[y * W + x] = 1;
  assert.equal(escapeRoute(m, 1.5 * T, 2.5 * T, null), null);
});
