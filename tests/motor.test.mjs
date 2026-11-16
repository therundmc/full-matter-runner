import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { mockContext } from './webaudio.mjs';

const { MOTOR, VOICE, Gearbox, squealOf, launchChirp, v8Cycle, cycleHz } = await load('audio/Motor.js');
const { OUTRO, routePath, routeSpeed, slideStep, motorState } = await load('game/systems/Outro.js');
const { TILE } = await load('game/Config.js');
const { default: level } = await load('game/data/levels/level1.js');
const { default: Audio, META } = await load('audio/Audio.js');

const STEP = 1 / 60;

test('motor: a V8\'s cycle is eight firings, its firing harmonic the strongest, with the burble under it', () => {
  const { real, imag } = v8Cycle(64);
  const amp = (k) => Math.hypot(real[k], imag[k]);
  assert.ok([...real, ...imag].every(Number.isFinite));
  const low = Array.from({ length: 16 }, (_, i) => amp(i + 1));
  assert.equal(low.indexOf(Math.max(...low)) + 1, 8, 'the 8th harmonic of the cycle: one per firing');
  for (const k of [1, 3, 5, 7]) assert.ok(amp(k) > amp(8) * 0.06, `the two banks leave harmonic ${k}: the burble`);
  assert.ok(cycleHz(MOTOR.idle) * 8 > 40 && cycleHz(MOTOR.idle) * 8 < 70, 'idles at 40-70 firings a second');
  assert.ok(cycleHz(1) * 8 > 300, 'screams at the redline');
});

test('motor: the revs climb in each gear, drop at each upshift, and the gears follow the speed', () => {
  const box = new Gearbox();
  let speed = 0, last = box.revs, shifts = 0, drops = 0;
  const gears = [];
  for (let t = 0; t < 3; t += STEP) {
    speed = Math.min(1, speed + 0.6 * STEP);
    box.step(speed, 1, false, STEP);
    assert.ok(box.revs >= MOTOR.idle * 0.99 && box.revs <= 1.02, `revs ${box.revs}`);
    if (box.shifted > 0) { shifts++; gears.push(box.gear); assert.equal(box.load, 0, 'off the throttle at a shift'); }
    if (box.revs < last - 0.01) drops++;
    last = box.revs;
  }
  assert.deepEqual(gears, [1, 2], 'first, second, third');
  assert.ok(shifts === 2 && drops > 0, 'the revs drop at the shifts');
  assert.ok(box.revs > 0.7 && box.revs < 0.85, 'flat out in third, under the redline: ' + box.revs);
  // more speed in a gear is more revs
  const a = new Gearbox(), b = new Gearbox();
  for (let i = 0; i < 60; i++) { a.step(0.2, 1, false, STEP); b.step(0.4, 1, false, STEP); }
  assert.ok(b.revs > a.revs && a.gear === b.gear);
});

test('motor: braking for a bend shifts down and blips the revs up; the spinning wheels hold them high', () => {
  const box = new Gearbox();
  for (let i = 0; i < 300; i++) box.step(1, 1, false, STEP);
  assert.equal(box.gear, 2);
  let speed = 1, blip = false, before = box.revs;
  for (let i = 0; i < 120; i++) {
    speed = Math.max(0.6, speed - 1.9 * STEP);
    box.step(speed, 0, false, STEP);
    if (box.shifted < 0) before = box.revs;
    if (box.gear === 1 && box.revs > before + 0.05) blip = true;
  }
  assert.ok(box.gear === 1 && blip, 'down to second, the revs up');
  const spin = new Gearbox();
  for (let i = 0; i < 20; i++) spin.step(0.05, 1, true, STEP);
  assert.ok(spin.revs > MOTOR.spin * 0.9 && spin.gear === 0, 'wheelspin: high revs, still in first');
  const free = new Gearbox();
  for (let i = 0; i < 15; i++) free.step(0, 1, false, STEP, 0.6);
  assert.ok(free.revs > 0.5, 'a flare at a standstill');
});

test('motor: the tyres squeal with the slide and the speed, either way, and chirp at the launch', () => {
  const S = MOTOR.squeal;
  assert.equal(squealOf(0, 1), 0);
  assert.equal(squealOf(S.from * 0.9, 1), 0, 'a little slip is silent');
  assert.equal(squealOf(S.full, 1), 1);
  assert.equal(squealOf(-0.3, 1), squealOf(0.3, 1), 'either way');
  let last = 0;
  for (let s = 0; s <= 0.6; s += 0.02) { const v = squealOf(s, 1); assert.ok(v >= last); last = v; }
  assert.ok(squealOf(0.3, 0.1) < squealOf(0.3, 0.6), 'slower, less');
  assert.equal(squealOf(0.3, 0), 0, 'standing still: nothing');
  assert.equal(squealOf(0, 0, 0.7), 0.7, 'a chirp on top');
  assert.equal(launchChirp(0), S.launch);
  assert.ok(launchChirp(0.5) < launchChirp(0.1) && launchChirp(1) === 0 && launchChirp(-0.1) === 0);
});

// the getaway on level 1's route, as World.stepOutro drives it, with the sound it makes
function getaway() {
  const van = level.props.find((p) => p[0] === 'van' && Math.hypot(p[1] - level.exit.x, p[2] - level.exit.y) < OUTRO.reach / TILE);
  const pts = [[van[1] * TILE, van[2] * TILE], ...level.exit.route.map(([c, r]) => [c * TILE, r * TILE])];
  const path = routePath(pts, level.exit.radius.map((r) => r * TILE));
  const o = { s: 0, v: 0, slip: 0, slipV: 0, box: new Gearbox(), lastV: 0, chirpT: 0 }, out = [];
  for (let t = STEP; t < 5; t += STEP) {
    if (t >= OUTRO.go) {
      const bend = path.at(o.s).turn || path.at(o.s + OUTRO.look).turn;
      o.v = routeSpeed(o.v, bend, STEP);
      o.s = Math.min(path.length, o.s + o.v * STEP * 60);
      [o.slip, o.slipV] = slideStep(o.slip, o.slipV, path.at(o.s).turn, o.v, STEP);
    }
    out.push({ t, v: o.v, slip: o.slip, gear: o.box.gear, m: motorState(o, t, STEP) });
  }
  return out;
}

test('outro: the van is silent until it catches, pops as it does, revs up through the gears and squeals in the bends', () => {
  const run = getaway();
  assert.ok(run.filter((r) => r.t < OUTRO.catch - 1e-9).every((r) => r.m === null), 'the starter (a one-shot) before the catch');
  const caught = run.find((r) => r.m);
  assert.ok(caught.m.pops > 0, 'it catches with a bark');
  const flare = run.find((r) => r.t > OUTRO.catch + 0.1);
  assert.ok(flare.m.revs > 0.4, 'and flares');
  // the gears: up through them, down for the bends
  const gears = run.filter((r, i) => i && r.gear !== run[i - 1].gear).map((r) => r.gear);
  assert.ok(gears.length >= 4 && gears.includes(2), 'gear changes: ' + gears.join());
  assert.ok(gears.some((g, i) => i && g < gears[i - 1]), 'a downshift into a bend');
  // the squeal follows the slide: loud while it slides fast, silent on the straights once the launch is over
  const driving = run.filter((r) => r.m && r.t > OUTRO.go + OUTRO.spin);
  const sliding = driving.filter((r) => Math.abs(r.slip) > 0.3);
  const straight = driving.filter((r) => Math.abs(r.slip) < MOTOR.squeal.from && r.t > OUTRO.go + OUTRO.spin + 0.4); // past the shift's chirp
  assert.ok(sliding.length > 20 && sliding.every((r) => r.m.squeal > 0.6), 'squealing through the bends');
  assert.ok(straight.length > 20 && straight.every((r) => r.m.squeal === 0), 'quiet on the straights');
  const launch = run.filter((r) => r.t >= OUTRO.go && r.t < OUTRO.go + 0.15);
  assert.ok(launch.every((r) => r.m.squeal > 0.8), 'a chirp as it tears off');
  // flat out on a straight: on the throttle, the tyres roaring with the speed
  const flat = driving.find((r) => r.v >= OUTRO.speed - 1e-9);
  assert.ok(flat.m.load === 1 && flat.m.road === 1 && flat.m.revs > 0.6);
});

test('audio: a live vehicle voice builds valid nodes, follows its updates, dips the music, and lets go', () => {
  const ctx = mockContext();
  Audio.ctx = ctx; Audio.active = []; Audio.lastPlay = {}; Audio.buffers = { foley: { duration: 90 } };
  Audio._build(ctx);
  try {
    Audio.listener = { x: 0, y: 0 };
    for (let i = 0; i < 30; i++) {
      ctx.currentTime = i / 60;
      Audio.motor('van', { x: 50, y: 0, revs: 0.2 + i / 40, load: i % 10 ? 1 : 0, squeal: (i % 7) / 7, road: i / 30, fade: 1, pops: i === 5 ? 3 : 0 });
    }
    const mv = Audio.motors.van;
    assert.ok(mv && mv.srcs.length >= 8, 'engine, growl, whine, road, hiss, squeal and their LFOs');
    assert.equal(Object.keys(Audio.motors).length, 1, 'one voice per vehicle, kept from update to update');
    Audio.motor('van', null);
    assert.equal(Audio.motors.van, undefined, 'let go');
    Audio.play('crank', { x: 40, y: 0, dur: 0.3 });
    assert.ok(Audio.active.some((a) => a.name === 'crank'), 'the starter plays');
    assert.ok(META.crank && VOICE.duck < 1 && VOICE.duck > 0.5, 'the music dips a little, not away');
  } finally { Audio.ctx = null; Audio.buffers = {}; Audio.motors = {}; }
});
