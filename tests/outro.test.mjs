import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { OUTRO, outroPhase, routePath, routeSpeed, slideStep, fadeAlpha, outroOver, barsK, camBlend, crossed } = await load('game/systems/Outro.js');
const { TILE } = await load('game/Config.js');
const { default: level } = await load('game/data/levels/level1.js');

const STEP = 1 / 60;

test('outro: the phases come in order, from the walk to the drive', () => {
  const order = ['walk', 'board', 'ignition', 'drive'];
  let last = 0;
  for (let t = 0; t <= OUTRO.go + 0.5; t += 0.01) {
    const i = order.indexOf(outroPhase(t));
    assert.ok(i >= last, `phase went back at t=${t.toFixed(2)}`);
    last = i;
  }
  assert.equal(last, order.length - 1);
  assert.ok(OUTRO.walk < OUTRO.lights && OUTRO.lights < OUTRO.go);
  assert.ok(OUTRO.skipAfter < OUTRO.walk);
});

test('outro: a route is straight lines joined by bends, without a jump in place or in direction', () => {
  const path = routePath([[0, 0], [300, 0], [300, 400], [-200, 400]], [96, 60]);
  assert.ok(Math.abs(path.length - (300 - 96 + 96 * Math.PI / 2 + 400 - 96 - 60 + 60 * Math.PI / 2 + 500 - 60)) < 1e-6);
  let prev = path.at(0);
  assert.deepEqual([prev.x, prev.y, prev.a, prev.turn], [0, 0, 0, 0]);
  const turns = new Set();
  for (let s = 1; s <= path.length; s += 1) {
    const q = path.at(s);
    assert.ok(Math.hypot(q.x - prev.x, q.y - prev.y) < 1.001, `a jump at ${s}`);
    assert.ok(Math.abs(Math.atan2(Math.sin(q.a - prev.a), Math.cos(q.a - prev.a))) < 0.03, `a kink at ${s}`);
    turns.add(q.turn);
    prev = q;
  }
  assert.deepEqual([...turns].sort(), [0, 1], 'two bends the same way, clockwise on screen');
  const end = path.at(path.length + 50);
  assert.ok(Math.abs(end.x + 200) < 1e-6 && Math.abs(end.y - 400) < 1e-6, 'it stops at the end');
  // a bend too wide for its lines is tightened, a straight route has none
  assert.ok(routePath([[0, 0], [20, 0], [20, 20]], [500]).length < 40);
  assert.equal(routePath([[0, 0], [100, 0]]).at(50).turn, 0);
});

test('outro: the van floors it on a straight, brakes for a bend and never stalls', () => {
  let v = 0;
  for (let i = 0; i < 300; i++) { const n = routeSpeed(v, false, STEP); assert.ok(n >= v); v = n; }
  assert.equal(v, OUTRO.speed);
  for (let i = 0; i < 300; i++) { const n = routeSpeed(v, true, STEP); assert.ok(n <= v && n >= OUTRO.corner); v = n; }
  assert.equal(v, OUTRO.corner);
  assert.ok(OUTRO.corner < OUTRO.speed);
});

test('outro: the tail steps out in a bend and swings back past straight after it', () => {
  let slip = 0, sv = 0, max = 0;
  for (let i = 0; i < 40; i++) { [slip, sv] = slideStep(slip, sv, 1, OUTRO.corner, STEP); max = Math.max(max, slip); }
  assert.ok(max > OUTRO.smoke * 2, 'the tyres smoke in a bend');
  let min = Infinity;
  for (let i = 0; i < 120; i++) { [slip, sv] = slideStep(slip, sv, 0, OUTRO.speed, STEP); min = Math.min(min, slip); }
  assert.ok(min < -0.01, 'it fishtails once');
  assert.ok(Math.abs(slip) < 0.02, 'and settles');
  const [left] = slideStep(0, 0, -1, OUTRO.corner, STEP);
  assert.ok(left < 0, 'the other way in a bend the other way');
});

test('outro: the picture goes black over the last stretch, is held, then the results; never later than the timeout', () => {
  const out = { t: 3, fadeAt: null };
  assert.equal(fadeAlpha(out), 0);
  assert.equal(outroOver(out), false);
  out.fadeAt = 3;
  assert.equal(fadeAlpha(out), 0);
  out.t = 3 + OUTRO.fadeDur;
  assert.equal(fadeAlpha(out), 1);
  assert.equal(outroOver(out), false, 'black is held a moment');
  out.t += OUTRO.hold;
  assert.equal(outroOver(out), true);
  assert.equal(outroOver({ t: OUTRO.timeout, fadeAt: null }), true);
});

test('outro: the letterbox bars are fully in by 0.35 s, the camera reaches the cab', () => {
  assert.equal(barsK(0), 0);
  assert.equal(barsK(OUTRO.barsIn), 1);
  assert.equal(camBlend(OUTRO.walk), 0);
  assert.equal(camBlend(OUTRO.walk + OUTRO.cam), 1);
});

test('outro: a beat fires once, on the step that reaches it', () => {
  let n = 0;
  for (let t = 0; t < 2; t += STEP) if (crossed(t, t + STEP, OUTRO.lights)) n++;
  assert.equal(n, 1);
});

test('outro: the way out of level 1 keeps the van on open ground, through the gate and off the west end of the road', () => {
  const van = level.props.find((p) => p[0] === 'van' && Math.hypot(p[1] - level.exit.x, p[2] - level.exit.y) < OUTRO.reach / TILE);
  assert.ok(van && level.exit.route, 'a van by the exit and a route for it');
  const pts = [[van[1] * TILE, van[2] * TILE], ...level.exit.route.map(([c, r]) => [c * TILE, r * TILE])];
  const path = routePath(pts, level.exit.radius.map((r) => r * TILE));
  const open = (x, y) => {
    const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    return c < 0 || !'X#'.includes(level.tiles[r][c]); // past the map's edge: gone
  };
  const gate = level.props.filter((p) => p[0] === 'chain_fence');
  let through = false;
  for (let s = 0; s <= path.length; s += 4) {
    const q = path.at(s), nx = -Math.sin(q.a), ny = Math.cos(q.a);
    // its middle and both flanks (the van is 64 px wide): never over a wall
    for (const k of [-26, 0, 26]) assert.ok(open(q.x + nx * k, q.y + ny * k), `in a wall at ${s} px (${(q.x / TILE).toFixed(1)}, ${(q.y / TILE).toFixed(1)})`);
    if (gate.some((g) => Math.hypot(g[1] * TILE - q.x, g[2] * TILE - q.y) < 20)) through = true;
  }
  assert.ok(through, 'it goes through the gate of the service alley');
  const end = path.at(path.length);
  assert.ok(end.x < 0 && Math.abs(Math.cos(end.a) + 1) < 0.01, 'it leaves by the west end of the road');
  assert.ok(level.exit.fade * TILE < path.length);
});
