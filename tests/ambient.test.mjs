import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, AMBIENT: A, CAT, MASK } = await load('game/Config.js');
const { Lane, Driver, gapAhead, safeSpeed, findBypass, steerAngle, seeded } = await load('game/systems/Traffic.js');
const { Walker, WALKER, escapeRoute, hideRoute, groundOf, pathLength, pointAlong } = await load('game/ai/Civilians.js');
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
  const w = new Walker(path, { r: seeded(3), speed: 40, run: 150, temper: 'run' });
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

  const c = new Walker(path, { r: seeded(4), speed: 40, run: 150, temper: 'run' });
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
  const w = new Walker(path, { r: seeded(3), speed: 40, run: 150, temper: 'run' });
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

test('walkers: by temperament they run (a few trip), curl up in a corner sobbing, or freeze until it gets close', () => {
  const tempers = { run: 0, hide: 0, stay: 0 };
  let trips = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const w = new Walker(path, { r: seeded(seed), speed: 40, run: 150 });
    w.alarm(50, 100, 'gunshot');
    tempers[w.temper]++;
    if (w.tripIn !== null) trips++;
  }
  assert.ok(tempers.run > 150 && tempers.hide > 40 && tempers.stay > 20, JSON.stringify(tempers));
  assert.ok(trips > 30 && trips < 100, 'a few trip: ' + trips);

  // the hider runs to his corner, curls up and sobs, then dares to run
  const sense = { escape: () => [{ x: -100, y: 100 }], hide: () => [{ x: 0, y: 160 }] };
  const h = new Walker(path, { r: seeded(7), speed: 40, run: 150, temper: 'hide' });
  h.alarm(50, 100, 'gunshot');
  h.bark = null;
  let it;
  for (let t = 0; t < 1; t += 0.05) it = h.update(0.05, 0, 100, sense);
  assert.equal(h.state, WALKER.HIDE);
  assert.deepEqual([it.x, it.y, it.speed], [0, 160, 150]);
  h.update(0.05, 0, 158, sense);
  assert.equal(h.state, WALKER.COWER);
  assert.equal(h.pose, 'ball');
  assert.ok(h.panicked);
  const barks = [];
  for (let t = 0; t < 12; t += 0.1) { h.update(0.1, 0, 158, sense); if (h.bark) { barks.push(h.bark); h.bark = null; } }
  assert.ok(barks.length >= 3 && barks.every((b) => b === 'sob'), barks.join());
  assert.equal(h.alarm(10, 158, 'gunshot', { x: 0, y: 158 }), false);
  assert.equal(h.state, WALKER.COWER, 'a shot next to him: he stays down');
  for (let t = 0; t < 16; t += 0.1) h.update(0.1, 0, 158, sense);
  assert.equal(h.state, WALKER.FLEE);
  assert.equal(h.pose, null);
  // no corner around: he runs like the others
  const n = new Walker(path, { r: seeded(8), speed: 40, run: 150, temper: 'hide' });
  n.alarm(50, 100, 'gunshot');
  for (let t = 0; t < 1; t += 0.05) n.update(0.05, 0, 100, { escape: sense.escape, hide: () => null });
  assert.equal(n.state, WALKER.FLEE);

  // the frozen one stands hands up for seconds; a gun brought close sets him running, a far shot does not
  const f = new Walker(path, { r: seeded(9), speed: 40, run: 150, temper: 'stay' });
  f.alarm(300, 100, 'gunshot');
  for (let t = 0; t < 3; t += 0.1) f.update(0.1, 0, 100, sense);
  assert.ok(f.frozen && f.pose === 'hands');
  f.alarm(300, 100, 'gunshot', { x: 0, y: 100 });
  assert.ok(f.frozen);
  f.alarm(40, 100, 'armed', { x: 0, y: 100 });
  assert.equal(f.state, WALKER.FLEE);
  assert.deepEqual(f.danger, { x: 40, y: 100 });

  // a runner pants between two screams, and trips once
  const r = new Walker(path, { r: seeded(10), speed: 40, run: 150, temper: 'run' });
  r.alarm(50, 100, 'gunshot');
  r.tripIn = 0.5;
  const heard = new Set();
  let falls = 0;
  for (let t = 0; t < 8; t += 0.05) {
    r.update(0.05, 0, 100, { escape: () => [{ x: -9000, y: 100 }] });
    if (r.bark) { heard.add(r.bark); r.bark = null; }
    if (r.fall) { falls++; r.fall = false; }
  }
  assert.equal(falls, 1);
  assert.ok(heard.has('pant') && heard.has('scream'), [...heard].join());
});

test('walkers: a runner cries out now and then, not on every breath: about one scream every three seconds', () => {
  const path = [{ x: 0, y: 100 }, { x: 900, y: 100 }];
  let screams = 0, firstOnTheRun = null, secs = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const w = new Walker(path, { r: seeded(seed), speed: 40, run: 150, temper: 'run' });
    w.alarm(50, 100, 'gunshot');
    assert.equal(w.bark, 'scream', 'his fright');
    w.bark = null;
    for (let t = 0; t < 30; t += 0.05) {
      w.update(0.05, 0, 100, { escape: () => [{ x: -9000, y: 100 }] });
      if (w.bark === 'scream') { screams++; if (seed === 1 && firstOnTheRun === null) firstOnTheRun = t; }
      w.bark = null;
    }
    secs += 30;
  }
  const P = A.panic, rate = screams / secs, mean = (P.cry[0] + P.cry[1]) / 2;
  assert.ok(Math.abs(rate - P.scream / mean) < 0.06, `${rate.toFixed(3)} a second`);
  assert.ok(rate < 0.75 / 1.35 * 0.7, 'at least 30 % fewer than the old 3 in 4 every 0.8-1.9 s');
  assert.ok(firstOnTheRun > P.freeze[0] + P.cry[0] * 0.9, 'not again the moment he starts running: ' + firstOnTheRun);
});

test('walkers: a hiding corner is close, tucked in and out of sight of the danger, one person each', () => {
  // a room with a recess in the north-east, behind a wall stub
  const m = new TileMap([
    'XXXXXXXXXX',
    'X.....X..X',
    'X.....X..X',
    'X........X',
    'X........X',
    'XXXXXXXXXX',
  ]);
  const T = TILE, W = m.w;
  const danger = { x: 1.5 * T, y: 1.5 * T };
  const seen = (x, y) => { // crude sight: blocked by the stub for whoever is east of it and above its end
    const cx = Math.floor(x / T), cy = Math.floor(y / T);
    return !(cx >= 7 && cy <= 2);
  };
  const taken = new Set();
  const route = hideRoute(m, 4.5 * T, 3.5 * T, danger, seen, taken);
  const end = route.at(-1), cell = Math.floor(end.y / T) * W + Math.floor(end.x / T);
  assert.ok(!seen(end.x, end.y), 'out of sight');
  assert.ok(!m.blocked[cell] && taken.has(cell));
  const other = hideRoute(m, 4.5 * T, 3.5 * T, danger, seen, taken).at(-1);
  assert.notDeepEqual(other, end, 'the corner is taken');
  // everything in sight and nothing to get behind: nowhere to hide
  const open = new TileMap(['XXXXXXXX', 'X......X', 'X......X', 'X......X', 'XXXXXXXX']);
  assert.equal(hideRoute(open, 5.5 * T, 2.5 * T, { x: 2.5 * T, y: 2.5 * T }, () => true), null);
  // furniture between him and the gun will do
  open.blocked[2 * open.w + 4] = 1;
  const behind = hideRoute(open, 5.5 * T, 1.5 * T, { x: 1.5 * T, y: 2.5 * T }, () => true);
  assert.deepEqual(behind.at(-1), { x: 5.5 * T, y: 2.5 * T });
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

// does a route from (x, y) run through tile (c, r)? (sampled every 4 px, on the map only)
const crosses = (map, x, y, route, c, r) => {
  let ax = x, ay = y;
  for (const p of route) {
    const n = Math.ceil(Math.hypot(p.x - ax, p.y - ay) / 4);
    for (let k = 1; k <= n; k++) {
      const px = ax + ((p.x - ax) * k) / n, py = ay + ((p.y - ay) * k) / n;
      if (Math.floor(px / TILE) === c && Math.floor(py / TILE) === r) return true;
    }
    ax = p.x; ay = p.y;
  }
  return false;
};
const fixed = (cx, cy, w, h, extra = {}) => ({
  body: { isStatic: true, bounds: { min: { x: cx - w / 2, y: cy - h / 2 }, max: { x: cx + w / 2, y: cy + h / 2 } },
    collisionFilter: { category: CAT.PROP, mask: MASK.PROP } },
  def: {}, ...extra,
});

test('walkers: a bench flat against the wall is in a runner\'s way: his way out goes round it (guards still go over it)', () => {
  const T = TILE;
  // a sidewalk between two buildings (off the map only at its ends); a bench (50 x 15) against the wall in tile (6, 3)
  const m = new TileMap(['XXXXXXXXXXXXXXXX', 'ssssssssssssssss', 'ssssssssssssssss', 'ssssssssssssssss', 'XXXXXXXXXXXXXXXX']);
  const bench = fixed(6.5 * T, 4 * T - 10, 50, 15);
  const chair = { ...fixed(9.5 * T, 3.5 * T, 30, 30), body: { ...fixed(0, 0, 30, 30).body, isStatic: false } };
  const lamp = fixed(3.5 * T, 3.5 * T, 30, 30, { def: { hung: true } });
  const gone = fixed(2.5 * T, 3.5 * T, 30, 30, { dead: true });
  const g = groundOf(m, [bench, chair, lamp, gone]);
  const at = (map, c, r) => map.blocked[r * map.w + c];
  assert.equal(at(g, 6, 3), 1, 'the bench is in a passer-by\'s way');
  assert.equal(at(m, 6, 3), 0, 'the guards\' grid is left as it is (they vault it)');
  assert.equal(at(g, 9, 3) + at(g, 3, 3) + at(g, 2, 3), 0, 'what he pushes, what hangs above, what is broken: not in his way');
  const from = { x: 10.5 * T, y: 3.5 * T }, danger = { x: 15 * T, y: 3.5 * T };
  assert.ok(crosses(m, from.x, from.y, escapeRoute(m, from.x, from.y, danger), 6, 3), 'on the bare grid: straight into the bench');
  const route = escapeRoute(g, from.x, from.y, danger);
  assert.ok(route.at(-1).x < 0, 'still off the west side');
  assert.ok(!crosses(g, from.x, from.y, route, 6, 3), 'round the bench');
});

test('walkers: a broken window\'s frame is no way out for a passer-by (he does not vault it), a torn-out one is', () => {
  const T = TILE;
  // a bar room (rows 1-3) over a sidewalk (row 5), its front wall on row 4: a window at (3, 4), the door at (8, 4)
  const m = new TileMap(['XXXXXXXXXX', 'X........X', 'X........X', 'X........X', 'XXXGXXXX.X', 'ssssssssss', 'XXXXXXXXXX']);
  m.blocked[4 * m.w + 3] = 0; // the pane shattered (Window.shatter opens the guards' grid: they vault the frame)
  const win = { cx: 3, cy: 4 };
  const from = { x: 3.5 * T, y: 3.5 * T }, danger = { x: 3.5 * T, y: 1.5 * T };
  assert.ok(crosses(m, from.x, from.y, escapeRoute(m, from.x, from.y, danger), 3, 4), 'on the guards\' grid: out through the frame');
  const g = groundOf(m, [], [win]);
  assert.equal(g.blocked[4 * m.w + 3], 1, 'the frame still standing is a wall to him');
  assert.equal(m.blocked[4 * m.w + 3], 0, 'the guards\' grid is left as it is');
  const route = escapeRoute(g, from.x, from.y, danger);
  assert.ok(route && !crosses(g, from.x, from.y, route, 3, 4), 'out by the door');
  assert.equal(groundOf(m, [], []).blocked[4 * m.w + 3], 0, 'a window torn out of the wall (gone from world.windows) is a hole');
});

test('walkers: a runner held up on a wide sidewalk is not sent straight back through that spot by the string pulling', () => {
  const T = TILE;
  const m = new TileMap(['XXXXXXXXXXXX', '............', '............', 'XXXXXXXXXXXX']);
  const from = { x: 6.5 * T, y: 2.5 * T }, danger = { x: 11.5 * T, y: 2.5 * T };
  assert.ok(crosses(m, from.x, from.y, escapeRoute(m, from.x, from.y, danger), 4, 2), 'the straight way west');
  const jam = 2 * m.w + 4;
  const route = escapeRoute(m, from.x, from.y, danger, { cost: (i) => (i === jam ? A.runJam.cost : 0) });
  assert.ok(route.at(-1).x < 0, 'still west');
  assert.ok(!crosses(m, from.x, from.y, route, 4, 2), 'round the spot he was held up at');
});

test('walkers: a doorway is everyone\'s way through, never a corner to curl up in', () => {
  const T = TILE;
  // a room above a corridor, a doorway between them at (4, 3); the danger down the corridor to the west
  const m = new TileMap(['XXXXXXXXX', 'X.......X', 'X.......X', 'XXXX.XXXX', 'X.......X', 'XXXXXXXXX']);
  const route = hideRoute(m, 5.5 * T, 4.5 * T, { x: 1.5 * T, y: 4.5 * T }, () => true);
  assert.ok(route, 'somewhere to hide');
  const end = route.at(-1), c = Math.floor(end.x / T), r = Math.floor(end.y / T);
  assert.ok(!(c === 4 && r === 3), 'not in the doorway');
  assert.ok(!(c === 4 && (r === 2 || r === 4)), 'nor in its mouth');
});

test('walkers: held up on his way to a corner, a hider finds another one, or runs for it', () => {
  const corners = [[{ x: 0, y: 160 }], [{ x: 80, y: 100 }]];
  let asked = 0, jammed = null;
  const sense = { escape: () => [{ x: -100, y: 100 }], hide: (x, y, d, j) => { asked++; jammed = j; return corners.shift() ?? null; } };
  const h = new Walker(path, { r: seeded(7), speed: 40, run: 150, temper: 'hide' });
  h.alarm(50, 100, 'gunshot');
  let it;
  for (let t = 0; t < 1; t += 0.05) it = h.update(0.05, 0, 100, sense);
  assert.equal(h.state, WALKER.HIDE);
  assert.deepEqual([it.x, it.y], [0, 160]);
  h.blocked();
  it = h.update(0.05, 0, 120, sense);
  assert.equal(h.state, WALKER.HIDE, 'another corner');
  assert.deepEqual([it.x, it.y], [80, 100]);
  assert.equal(asked, 2);
  assert.equal(jammed, true, 'round the spot he was held up at');
  h.blocked();
  it = h.update(0.05, 20, 110, sense);
  assert.equal(h.state, WALKER.FLEE, 'no corner left: he runs for it');
  assert.equal(it.x, -100);
});

test('walkers: curled up or ducking, a passer-by is drawn hardly smaller than standing', async () => {
  const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  const { crouchScale } = await load('game/entities/Civilian.js');
  assert.equal(crouchScale(0), 1);
  for (const crouch of [0.5, 1, 1.6, 3]) assert.ok(crouchScale(crouch) >= 0.93 && crouchScale(crouch) <= 1, `${crouch}: ${crouchScale(crouch)}`);
});

test('traffic: a gun held on a driver: he runs for it, stops dead hands up until it is off him, or floors it', () => {
  const lane = new Lane(laneDef, 80 * TILE);
  const s = { x: 0, y: lane.y, hw: 27, gap: Infinity, lead: 0, leadStatic: false, person: Infinity, passed: false, stalled: false };
  const seen = {};
  for (let seed = 1; seed < 80; seed++) {
    const d = new Driver(lane, seeded(seed));
    d.update(1 / 60, s);
    const how = d.heldUp();
    seen[how] = (seen[how] || 0) + 1;
    assert.equal(d.heldUp(), null, 'once is enough');
  }
  assert.ok(seen.flee > 15 && seen.duck > 10 && seen.floor > 5, JSON.stringify(seen));
  // the one who ducks: stopped dead while the gun is on him, off flat out once it has been away a while
  let d;
  for (let seed = 1; !d; seed++) { const c = new Driver(lane, seeded(seed)); c.update(1 / 60, s); if (c.heldUp() === 'duck') d = c; }
  let t = 0;
  for (; t < 3; t += 1 / 60) d.update(1 / 60, { ...s, aimed: true });
  assert.equal(d.speed, 0, 'stopped');
  assert.equal(d.state, 'held');
  for (let k = 0; k < A.heldUp.resume * 0.8; k += 1 / 60) d.update(1 / 60, s);
  assert.equal(d.state, 'held', 'not yet: he waits a while');
  for (let k = 0; k < A.heldUp.resume; k += 1 / 60) d.update(1 / 60, s);
  assert.equal(d.state, 'drive');
  for (let k = 0; k < 3; k += 1 / 60) d.update(1 / 60, s);
  assert.ok(d.speed > d.cruise * 1.2, 'away, foot down');
  // shots while he sits there: he gets out and runs like the others
  const h = new Driver(lane, seeded(1));
  h.state = 'held';
  h.flee(0.1);
  assert.equal(h.state, 'drive');
  for (let k = 0; k < 2; k += 1 / 60) h.update(1 / 60, { ...s, aimed: true });
  assert.equal(h.reason, 'scared');
});

test('traffic: a body in the road is gone round when a lane is free, crept over when none is', () => {
  const lane = new Lane(laneDef, 80 * TILE), d = new Driver(lane, seeded(5));
  d.speed = 0;
  const s = { x: 0, y: lane.y, hw: 27, gap: 60, lead: 0, leadStatic: true, soft: true, person: Infinity, passed: false, stalled: false, bypass: () => null };
  for (let t = 0; t < d.patience + 0.2; t += 1 / 60) d.update(1 / 60, s);
  assert.ok(d.creep > 0, 'no way round: he creeps over it');
  const r = new Driver(lane, seeded(5));
  r.speed = 0;
  for (let t = 0; t < r.patience + 0.2; t += 1 / 60) r.update(1 / 60, { ...s, bypass: () => ({ y: lane.y + TILE, passX: 200 }) });
  assert.ok(r.bypass && !(r.creep > 0), 'a free lane: round it');
});

test('walkers: a commotion gets a look (a stroller slows down for it), a fight close by sends them off; not once they panic', () => {
  const w = new Walker(path, { r: seeded(3), speed: 40, run: 150, temper: 'run' });
  const before = w.update(1 / 60, 0, 0, {});
  w.notice(0, 100, 2);
  const it = w.update(1 / 60, 0, 0, {});
  assert.ok(it.speed < before.speed, 'slows down');
  assert.ok(Math.abs(it.look - Math.PI / 2) < 1e-9, 'looking at it');
  for (let t = 0; t < 2.1; t += 1 / 60) w.update(1 / 60, 0, 0, {});
  assert.equal(w.update(1 / 60, 0, 0, {}).look, undefined, 'for a while');
  const p = new Walker([{ x: 100, y: 100 }], { r: seeded(5), speed: 40, run: 150, post: { activity: 'drink', face: 0 } });
  p.notice(100, 0, 2);
  assert.ok(Math.abs(p.update(1 / 60, 100, 100, {}).face + Math.PI / 2) < 1e-9, 'a customer on his stool turns to look');
  assert.ok(w.alarm(0, 0, 'fight', { x: 10, y: 0 }), 'a man floored close by: a fright');
  assert.equal(w.bark, 'back');
  w.notice(0, 100, 2);
  assert.equal(w.look, null, 'too scared to stare');
});
