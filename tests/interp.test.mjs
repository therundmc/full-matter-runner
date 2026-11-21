import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Interp, { StepClock, JUMP, Movers, eachDrawnVertex } from '../src/engine/Interp.js';
import Camera, { fitView } from '../src/engine/Camera.js';
import { FIXED_DT } from '../src/game/Config.js';

const body = (x, y, angle = 0) => ({ position: { x, y }, angle, isStatic: false });
const spreadOf = (a) => Math.max(...a) - Math.min(...a);

// a loop as Game runs it: a body pushed v px a step (times the time scale), drawn at every frame of a screen at hz
function play({ hz, frames, v = 3, scale = () => 1, hitstop = () => false, interp = true }) {
  const clock = new StepClock(FIXED_DT), I = new Interp(), b = body(0, 0), drawn = [], real = [];
  let steps = 0;
  for (let f = 0; f < frames; f++) {
    if (!hitstop(f)) {
      steps += clock.run(1 / hz, () => {
        I.capture([b]);
        b.position.x += v * scale(f);
      });
    }
    I.apply(interp ? clock.alpha : 1);
    drawn.push(b.position.x);
    I.restore();
    real.push(b.position.x);
  }
  return { drawn, real, steps, clock, b };
}
const deltas = (a) => a.slice(1).map((x, i) => x - a[i]);

test('interp: the clock runs the steps due and keeps the rest as alpha', () => {
  const c = new StepClock(1 / 60);
  assert.equal(c.run(1 / 144, () => {}), 0);
  assert.ok(Math.abs(c.alpha - 60 / 144) < 1e-9);
  assert.equal(c.run(1 / 144, () => {}), 0);
  assert.equal(c.run(1 / 144, () => {}), 1);
  assert.ok(Math.abs(c.alpha - 0.25) < 1e-9);
  // a long frame: no more than `most` steps, and the time owed is dropped
  assert.equal(c.run(1, () => {}), 5);
  assert.equal(c.alpha, 0);
  // a step that starts a hit-stop ends the frame's steps, the time left kept
  c.reset();
  let n = 0;
  assert.equal(c.run(2.5 / 60, () => { n++; return false; }), 1);
  assert.equal(n, 1);
  assert.equal(c.alpha, 1); // (more than a step is owed: the last state, as it is)
  c.reset();
  assert.equal(c.alpha, 0);
});

test('interp: at 144 Hz a body at constant speed advances evenly, where drawn as stepped it stutters', () => {
  const smooth = deltas(play({ hz: 144, frames: 400 }).drawn.slice(10)), raw = deltas(play({ hz: 144, frames: 400, interp: false }).drawn.slice(10));
  const per = 3 * 60 / 144;
  for (const d of smooth) assert.ok(Math.abs(d - per) < 1e-6, `a frame advanced ${d}, not ${per}`);
  assert.ok(spreadOf(raw) >= 3, 'drawn as stepped: some frames a whole step, some none');
});

test('interp: at 60 Hz every frame is one step on, as before', () => {
  const r = play({ hz: 60, frames: 200 });
  for (const d of deltas(r.drawn.slice(5))) assert.ok(Math.abs(d - 3) < 1e-6);
  // and the real state is never what was drawn: apply / restore leave the body where the simulation put it
  assert.equal(r.real.at(-1), r.steps * 3);
});

test('interp: a time scale slows the drawn motion by as much, still even', () => {
  const d = deltas(play({ hz: 144, frames: 300, scale: () => 0.25 }).drawn.slice(10));
  for (const x of d) assert.ok(Math.abs(x - 0.25 * 3 * 60 / 144) < 1e-6);
});

test('interp: through a hit-stop nothing moves, and it goes on from where it stood', () => {
  const r = play({ hz: 144, frames: 300, hitstop: (f) => f >= 100 && f < 130 });
  const d = deltas(r.drawn);
  for (let f = 100; f < 129; f++) assert.equal(d[f], 0, `frame ${f} moved in the hit-stop`);
  for (let f = 131; f < 298; f++) assert.ok(Math.abs(d[f] - 1.25) < 1e-6);
  assert.ok(Math.abs(d[129] - 1.25) < 1e-6, 'no jump as time comes back');
});

test('interp: a world held still is drawn as it stands', () => {
  const clock = new StepClock(FIXED_DT), I = new Interp(), b = body(0, 0);
  clock.run(1.4 / 60, () => { I.capture([b]); b.position.x += 3; });
  clock.reset();
  I.still();
  I.apply(clock.alpha);
  assert.equal(b.position.x, 3);
  I.restore();
});

test('interp: a teleport is not smeared, a body made during the step is drawn where it is', () => {
  const I = new Interp(), a = body(10, 10), b = body(0, 0, 1);
  I.capture([a, b]);
  a.position.x += JUMP + 1;      // put somewhere else
  b.position.x += 4; b.angle += 0.2;
  const born = body(50, 50);     // (never captured)
  I.apply(0.5);
  assert.equal(a.position.x, 10 + JUMP + 1);
  assert.equal(b.position.x, 2);
  assert.ok(Math.abs(b.angle - 1.1) < 1e-12);
  assert.equal(born.position.x, 50);
  I.apply(0.9); // (applied already: nothing more)
  assert.equal(b.position.x, 2);
  I.restore();
  assert.deepEqual([b.position.x, b.angle], [4, 1.2]);
  I.restore();
  assert.equal(b.position.x, 4);
});

test('interp: static bodies are left out; particles and bullets go by x, y and their height', () => {
  const I = new Interp(), wall = { ...body(0, 0), isStatic: true }, p = { x: 0, y: 0, z: 10 }, shot = { x: 0, y: 0 };
  I.capture([wall], [[p], [shot]]);
  wall.position.x = 5; p.x = 4; p.z = 6; shot.x = 40; shot.y = 20;
  I.apply(0.25);
  assert.equal(wall.position.x, 5);
  assert.deepEqual([p.x, p.z], [1, 9]);
  assert.deepEqual([shot.x, shot.y, shot.z], [10, 5, undefined]);
  I.restore();
  assert.deepEqual([p.x, p.z, shot.x, shot.y], [4, 6, 40, 20]);
  assert.ok(!('z' in shot));
  // the step after: what was not captured again has no place to come from
  I.capture([]);
  I.apply(0.25);
  assert.equal(p.x, 4);
  I.restore();
});

test('interp: at the wheel the in-between places still land on whole px of the picture', () => {
  // the camera held on whole px (Camera `pixel`) follows a car drawn between two steps: the view and the car's
  // snapped place (Vehicle.pose's rule) are on the picture's grid at every frame of a 144 Hz screen
  const cam = new Camera(), { zoom } = fitView(360, 1080, true, true);
  cam.resize(1920, 1080, zoom);
  cam.pixel = true;
  assert.equal(zoom, 3);
  const clock = new StepClock(FIXED_DT), I = new Interp(), car = body(100.3, 200.7);
  const whole = (n) => Math.abs(n * zoom - Math.round(n * zoom)) < 1e-6;
  let between = 0;
  for (let f = 0; f < 300; f++) {
    clock.run(1 / 144, () => { I.capture([car]); car.position.x += 7.37; car.position.y += 0.41; });
    I.apply(clock.alpha);
    if (!whole(car.position.x)) between++;
    const snap = (n) => Math.round(n * cam.z) / cam.z, drawn = { x: snap(car.position.x), y: snap(car.position.y) };
    cam.update(1 / 144, drawn.x + 40, drawn.y);
    const at = cam.at();
    assert.ok(whole(at.x) && whole(at.y) && whole(drawn.x) && whole(drawn.y), `frame ${f} off the grid`);
    assert.ok(whole(drawn.x - at.x), 'the car sits a whole number of px from the view');
    I.restore();
  }
  assert.ok(between > 200, 'the places handed to the snap were in-between ones');
});

test('interp: a list registered with the movers is drawn between its two step places, whatever array holds it', () => {
  // the regression: pool balls, a car's billows, the streaks of air, papers and litter were moved by hand each step
  // but never captured, so at 120 / 144 Hz they were drawn stepped
  const M = new Movers(), I = new Interp(), sys = { list: [{ x: 0, y: 0 }] }, ball = { x: 10, y: 10, z: 2 };
  M.add((out) => out.push(sys.list));
  M.add((out) => out.push([ball]));
  I.capture([], M.lists());
  sys.list[0].x = 8; ball.y = 14; ball.z = 0;
  sys.list = sys.list.filter(() => true); // (a system that swaps its array: read again at the next capture)
  I.apply(0.25);
  assert.deepEqual([sys.list[0].x, ball.y, ball.z], [2, 11, 1.5]);
  I.restore();
  assert.deepEqual([sys.list[0].x, ball.y, ball.z], [8, 14, 0]);
  assert.equal(M.lists().length, 2);
  assert.equal(M.lists()[0], sys.list, 'the new array');
});

test('interp: a body\'s outline is drawn where its sprite is (F4), its real vertices left alone', () => {
  const I = new Interp(), vs = [{ x: 9, y: 9 }, { x: 11, y: 9 }, { x: 11, y: 11 }, { x: 9, y: 11 }];
  const b = { position: { x: 10, y: 10 }, angle: 0, isStatic: false, vertices: vs };
  I.capture([b]);
  b.position.x = 14; b.angle = Math.PI / 2;
  for (const v of vs) { const dx = v.x - 10, dy = v.y - 10; v.x = 14 - dy; v.y = 10 + dx; } // (Matter's own update)
  I.apply(0.5);
  const got = [];
  eachDrawnVertex(b, (x, y) => got.push([+x.toFixed(6), +y.toFixed(6)]));
  const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4);
  const want = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [+(12 + dx * c - dy * s).toFixed(6), +(10 + dx * s + dy * c).toFixed(6)]);
  assert.deepEqual(got, want, 'the square half way, turned half way');
  I.restore();
  got.length = 0;
  eachDrawnVertex(b, (x, y) => got.push([x, y]));
  assert.deepEqual(got, vs.map((v) => [v.x, v.y]), 'restored: its own vertices');
  assert.equal(b.position.x, 14);
});
