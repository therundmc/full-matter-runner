import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { ENEMY, AI } = await load('game/Config.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { detectionRate, inView, aimError, hearingError } = await load('game/ai/Perception.js');
const { searchPoints, findCover, isCovered, randomPoint, throughDoor, tableToFlip } = await load('game/ai/Tactics.js');
const { default: Director } = await load('game/ai/Director.js');
const { lineFor } = await load('game/ai/Barks.js');
const { BARKS, SHOUTED, BARK_TONE } = await load('game/data/barks.js');
const { PALETTE } = await load('game/Config.js');

const c = (n) => (n + 0.5) * 32;

// two rooms joined by a door, a pillar in the left room
const ROWS = [
  'XXXXXXXXXXXXXXXX',
  'X......#.......X',
  'X......#.......X',
  'X..##..D.......X',
  'X......#.......X',
  'X......#.......X',
  'XXXXXXXXXXXXXXXX',
];
const fakeWorld = () => {
  const map = new TileMap(ROWS);
  return {
    map, events: new EventBus(), enemies: [], doors: [], windows: [], texts: [], time: 0,
    player: { alive: true, x: c(12), y: c(3), moving: 0 },
    lineOfSight: (x0, y0, x1, y1) => !map.raycast(x0, y0, x1, y1),
  };
};
const fakeGuard = (x, y, extra = {}) => ({
  alive: true, isEnemy: true, x, y, knocked: 0, aware: 0, state: 'idle', heard: [], stood: 0, roam: true, home: { x, y },
  hear(type) { this.heard.push(type); },
  standDown() { this.stood++; },
  beginSearch() { this.state = 'search'; },
  canSeePoint() { return false; },
  ...extra,
});

// ---------------- perception ----------------
test('detection: closer, centred, running and lit targets are spotted faster', () => {
  const base = { dist: 200, off: 0, moving: 1, light: 0.5 };
  const r = detectionRate(base);
  assert.ok(detectionRate({ ...base, dist: 60 }) > r, 'closer');
  assert.ok(detectionRate({ ...base, off: ENEMY.fov / 2 - 0.01 }) < r, 'edge of the cone');
  assert.ok(detectionRate({ ...base, moving: 2.9 }) > r, 'running');
  assert.ok(detectionRate({ ...base, moving: 0 }) < r, 'standing still');
  assert.ok(detectionRate({ ...base, light: 0 }) < r * 0.6, 'darkness');
  assert.ok(detectionRate({ ...base, vigilance: AI.vigilance.alert }) > r, 'alert squad');
  assert.ok(detectionRate({ ...base, focus: 0.45 }) < r, 'distracted');
});

test('detection: never instant, even point blank in full light', () => {
  const r = detectionRate({ dist: 10, off: 0, moving: 3, light: 1, vigilance: AI.vigilance.alert });
  assert.ok(1 / r > 0.12, `fills in ${(1 / r).toFixed(2)} s`);
  // a still player in the dark at mid range takes seconds
  assert.ok(1 / detectionRate({ dist: 220, off: 0, moving: 0, light: 0 }) > 4);
});

test('view: cone, distance and the close-awareness bubble', () => {
  assert.equal(inView(100, 0, 0), true);
  assert.equal(inView(ENEMY.viewDist + 1, 0, 2), false);
  assert.equal(inView(100, Math.PI, 0), false, 'behind');
  assert.equal(inView(15, Math.PI, 0), true, 'bumped into');
  assert.equal(inView(60, Math.PI, 2), true, 'alert guards feel you close');
});

test('aim: wide first shots that tighten, worse on a running target', () => {
  assert.ok(aimError(0) > aimError(0.5));
  assert.ok(aimError(0.5) > aimError(1));
  assert.equal(aimError(1), 0);
  assert.ok(aimError(0.2, 2.9) > aimError(0.2, 0));
  assert.ok(hearingError(400) > hearingError(100));
});

test('barks: short readable lines, no doubles, known tones, and the squad does not repeat itself', () => {
  for (const [kind, lines] of Object.entries(BARKS)) {
    assert.ok(lines.length > 0, kind);
    assert.equal(new Set(lines).size, lines.length, `${kind}: a line twice`);
    for (const l of lines) assert.ok(l === l.toUpperCase(), `${kind}: ${l}`);
  }
  for (const kind of SHOUTED) assert.ok(BARKS[kind], kind);
  for (const [kind, tone] of Object.entries(BARK_TONE)) assert.ok(BARKS[kind] && PALETTE[tone], kind);
  const lines = ['A', 'B', 'C'];
  assert.equal(lineFor(lines, {}, ['A', 'C']), 'B');
  assert.equal(lineFor(lines, {}, ['B', 'A', 'C'], () => 0.99), 'B', 'all used: the one said the longest ago');
  const d = new Director({ time: 0, enemies: [], texts: [], events: { on() {}, emit() {} } });
  const said = [];
  for (let i = 0; i < 3; i++) { d.world.time += 2; d.bark({ x: 0, y: 0 }, 'clear'); said.push(d.world.texts.at(-1).str); }
  assert.equal(new Set(said).size, 3);
});

test('director: the tiles where a mate fell are let go once safe, a reported incident once nobody is wary of it', () => {
  const map = new TileMap(ROWS), w = { time: 0, map, enemies: [], texts: [], events: new EventBus() };
  const d = new Director(w), N = AI.nav.danger;
  d.hotT = 1e9; // (no fires to look for here)
  d.danger.markAround(map, c(3), c(3), N.r, N.cost, N.forget);
  const body = d.incident('body', c(3), c(3)), wall = d.incident('wall', c(9), c(2));
  body.reported = true;
  w.time = 5;
  d.tick(1 / 60);
  assert.ok(d.danger.size > 0 && d.incidents.length === 2);
  assert.ok(d.wary(c(3), c(3)));
  w.time = Math.max(N.forget, AI.wary.time) + 1;
  d.tick(1 / 60);
  assert.equal(d.danger.size, 0, 'no more cost on the paths');
  assert.deepEqual(d.incidents, [wall], 'the unreported one stays till a guard finds it');
  assert.ok(!d.wary(c(3), c(3)));
});

// ---------------- tactics ----------------
test('a doorway is taken down its middle, whatever corner the path cuts', () => {
  const map = new TileMap(ROWS);
  // the door (7, 3) joins the rooms left and right: from its upper edge, heading right and up, he is brought back
  // down to the axis while still going right
  const w = throughDoor(map, 7, 3, 7 * 32 + 4, 3 * 32 + 4, 0.7, -0.7);
  assert.ok(w.x > 0.5 && w.y > 0.3, `${w.x}, ${w.y}`);
  assert.ok(Math.abs(Math.hypot(w.x, w.y) - 1) < 1e-9);
  const back = throughDoor(map, 7, 3, c(7), c(3), -1, 0);
  assert.ok(back.x === -1 && back.y === 0, 'on the axis, straight on');
  assert.equal(throughDoor(map, 1, 1, c(1), c(1), 1, 0), null, 'a corner is no passage');
});

test('search points: origin first, doorway found, spread apart', () => {
  const map = new TileMap(ROWS);
  const pts = searchPoints(map, c(3), c(1), 16, 6);
  assert.ok(pts[0].origin);
  assert.ok(pts.length > 2);
  assert.ok(pts.some((p) => Math.floor(p.x / 32) === 7 && Math.floor(p.y / 32) === 3), 'the door');
  for (let i = 1; i < pts.length; i++) {
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= 32 * 3.5 - 1e-6);
    assert.equal(map.isBlocked(Math.floor(pts[i].x / 32), Math.floor(pts[i].y / 32)), false);
  }
});

test('cover: a spot hidden from the threat with a peek cell that has a shot', () => {
  const w = fakeWorld();
  const threat = { x: c(1), y: c(3) };
  const guard = { x: c(6), y: c(3) };
  const cov = findCover(w, guard, threat.x, threat.y, 120, null, 4);
  assert.ok(cov, 'found');
  assert.ok(isCovered(w, cov.x, cov.y, threat.x, threat.y));
  assert.ok(w.lineOfSight(cov.peek.x, cov.peek.y, threat.x, threat.y));
  // claimed spots are skipped
  const other = findCover(w, guard, threat.x, threat.y, 120, (x, y) => x === cov.x && y === cov.y, 4);
  assert.ok(!other || other.x !== cov.x || other.y !== cov.y);
});

test('random point lands on a walkable tile', () => {
  const map = new TileMap(ROWS);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20; i++) {
    const p = randomPoint(map, c(4), c(2), 5, rnd);
    if (p) assert.equal(map.isBlocked(Math.floor(p.x / 32), Math.floor(p.y / 32)), false);
  }
});

// ---------------- director ----------------
test('director: normal -> alert -> evasion -> caution -> normal', () => {
  const w = fakeWorld();
  const d = new Director(w);
  const phases = [];
  w.events.on('alertPhase', (e) => phases.push(e.phase));
  const g = fakeGuard(c(10), c(2));
  w.enemies.push(g);
  assert.equal(d.phase, 'normal');
  d.sighted(c(12), c(3));
  assert.equal(d.phase, 'alert');
  w.time += AI.alertLinger + 0.1;
  d.tick(0.1);
  assert.equal(d.phase, 'evasion');
  assert.ok(d.searchPts.length > 1, 'sweep planned around the last known position');
  for (let t = 0; t < AI.evasion + 1; t += 0.5) d.tick(0.5);
  assert.equal(d.phase, 'caution');
  assert.equal(g.stood, 1, 'guards stand down');
  for (let t = 0; t < AI.caution + 1; t += 0.5) d.tick(0.5);
  assert.equal(d.phase, 'normal');
  assert.deepEqual(phases, ['alert', 'evasion', 'caution', 'normal']);
});

test('director: incidents raise to caution, a new sighting goes back to alert', () => {
  const w = fakeWorld();
  const d = new Director(w);
  d.raise();
  assert.equal(d.phase, 'caution');
  assert.equal(d.phaseT, AI.caution);
  d.sighted(c(2), c(2));
  d.raise(); // does not downgrade an alert
  assert.equal(d.phase, 'alert');
});

test('director: noises are heard in range, walls muffle the far half, automatic fire is throttled', () => {
  const w = fakeWorld();
  new Director(w);
  const near = fakeGuard(c(3), c(1));     // same room as the noise
  const behind = fakeGuard(c(12), c(1));  // other room, behind the wall
  w.enemies.push(near, behind);
  const shooter = { isPlayer: true };
  w.events.emit('noise', { x: c(2), y: c(1), radius: 400, source: shooter, type: 'gunshot' });
  assert.deepEqual(near.heard, ['gunshot']);
  assert.deepEqual(behind.heard, [], 'far and through a wall');
  w.events.emit('noise', { x: c(2), y: c(1), radius: 400, source: shooter, type: 'gunshot' });
  assert.equal(near.heard.length, 1, 'same source too soon');
  w.time += AI.noiseGap + 0.01;
  w.events.emit('noise', { x: c(2), y: c(1), radius: 400, source: shooter, type: 'gunshot' });
  assert.equal(near.heard.length, 2);
  // a guard's gunfire is "ally fire" for his mates
  w.events.emit('noise', { x: c(2), y: c(1), radius: 400, source: { isEnemy: true }, type: 'gunshot' });
  assert.equal(near.heard[2], 'allyFire');
  // silent weapons make no noise
  w.events.emit('noise', { x: c(2), y: c(1), radius: 0, source: null, type: 'gunshot' });
  assert.equal(near.heard.length, 3);
});

test('director: the last guard of a real squad may be shaken by the kill before, never in a small one', () => {
  const random = Math.random;
  const last = (total, roll, extra) => {
    const w = fakeWorld(), d = new Director(w);
    const victim = fakeGuard(c(3), c(2)), g = fakeGuard(c(10), c(2), extra);
    w.enemies.push(victim, g, fakeGuard(c(5), c(2), { yielded: true }));
    w.totalEnemies = total;
    victim.alive = false;
    Math.random = () => roll;
    try { d.onKill({ victim, cause: 'bullet', killer: w.player }); } finally { Math.random = random; }
    return !!g.shaken;
  };
  assert.equal(last(AI.surrender.squad, 0), true);
  assert.equal(last(AI.surrender.squad, 0.999), false, 'not every time');
  assert.equal(last(AI.surrender.squad - 1, 0), false, 'too small a squad');
  assert.equal(last(AI.surrender.squad, AI.surrender.brute + 0.01, { kind: 'brute' }), false, 'a brute rarely gives up');
});

test('director: kills and wrecked structure become incidents; budget and claims', () => {
  const w = fakeWorld();
  const d = new Director(w);
  const victim = fakeGuard(c(3), c(2), { roam: false });
  w.enemies.push(victim);
  w.events.emit('kill', { victim, cause: 'bullet', killer: w.player });
  assert.deepEqual(d.incidents.map((i) => i.kind), ['body', 'missing']);
  w.events.emit('windowBroken', { x: 10, y: 10 });
  w.events.emit('doorBroken', { x: 20, y: 20 });
  w.events.emit('wallDestroyed', { cx: 1, cy: 1, x: 48, y: 48 });
  assert.deepEqual(d.incidents.slice(2).map((i) => i.kind), ['window', 'door', 'wall']);
  d.budgetLeft = AI.planBudget;
  let n = 0;
  while (d.budget(1)) n++;
  assert.equal(n, AI.planBudget);
  const a = fakeGuard(0, 0), b = fakeGuard(0, 0);
  d.claim(a, 100, 100);
  assert.equal(d.isClaimed(110, 100, b), true);
  assert.equal(d.isClaimed(110, 100, a), false, 'own claim');
  d.release(a);
  assert.equal(d.isClaimed(110, 100, b), false);
});

test('tactics: a table in front of the cover spot is tipped toward the threat, from one of its long sides only', () => {
  const table = (x, y, angle, def = { flips: 'table_flipped', w: 44, h: 26 }) => ({ def, x, y, body: { angle }, dead: false });
  const long = table(200, 200, 0), world = [long];
  // behind it to the south, the threat to the north: over it goes northward, shoved from just behind its edge
  const f = tableToFlip(world, 205, 232, 200, 60, AI.flip.reach);
  assert.equal(f.prop, long);
  assert.ok(Math.abs(f.a + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(f.x - 205) < 1e-9 && Math.abs(f.y - 223) < 1e-9);
  assert.equal(tableToFlip(world, 205, 232, 200, 400, AI.flip.reach), null, 'the threat on his own side');
  assert.equal(tableToFlip(world, 240, 200, 60, 200, AI.flip.reach), null, 'not from its end');
  assert.equal(tableToFlip(world, 205, 290, 200, 60, AI.flip.reach), null, 'too far to reach');
  // a round one goes over whichever way he pushes it; turned a quarter, a long one goes over east-west
  const round = table(300, 300, 0, { flips: 'table_round_flipped', r: 14 });
  const g = tableToFlip([round], 270, 330, 400, 200, AI.flip.reach);
  assert.ok(Math.abs(g.a + Math.PI / 4) < 1e-9 && Math.hypot(g.x - 300, g.y - 300) > 23 && g.x < 300 && g.y > 300);
  const h = tableToFlip([table(200, 200, Math.PI / 2)], 170, 195, 330, 200, AI.flip.reach);
  assert.ok(Math.abs(Math.cos(h.a) - 1) < 1e-9 && Math.abs(h.x - 177) < 1e-9 && Math.abs(h.y - 195) < 1e-9);
});
