import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { mockContext } from './webaudio.mjs';

const {
  windState, GUST, trainState, trainSlot, TRAIN, TRAIN_LEN, TRAIN_DUR, policeState, PATROL, lampOn, titleBeats,
  cloudDrift, CLOUD, RAIL, trainKnocks, trainHeard, trainSound,
} = await load('game/ui/title/Timeline.js');
const { LW } = await load('game/ui/title/Draw.js');
const { ElevatedVoice } = await load('audio/Elevated.js');

const DT = 1 / 60;

test('title wind: the gust stays in [0, 1], moves without pops and the rain leans 8 deg when calm, 30 to 35 at a peak', () => {
  let prev = windState(0), top = 0, calm = 90;
  for (let t = DT; t < 600; t += DT) {
    const w = windState(t);
    assert.ok(w.gust >= 0 && w.gust <= 1, `gust ${w.gust} at ${t}`);
    assert.ok(Math.abs(w.gust - prev.gust) < 0.05, `gust jumps at ${t.toFixed(3)}`);
    assert.ok(Math.abs(w.angle - prev.angle) < 1.5, `angle jumps at ${t.toFixed(3)}`);
    assert.ok(Math.abs(w.slant - Math.tan(w.angle * Math.PI / 180)) < 1e-9);
    top = Math.max(top, w.angle);
    if (w.gust === 0) calm = Math.min(calm, Math.abs(w.angle - 8));
    prev = w;
  }
  assert.ok(top >= 30 && top <= 35.5, `peak angle ${top}`);
  assert.ok(calm < 4, 'about 8 deg when calm');
});

test('title wind: at least one gust in any 20 s, 7 to 13 s apart, rising in 0.6 s', () => {
  const starts = [];
  let was = false;
  for (let t = 0; t < 1200; t += DT) {
    const on = windState(t).gust > 0;
    if (on && !was) starts.push(t);
    was = on;
  }
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    assert.ok(gap > 7 - 0.05 && gap < 13 + 0.05, `gap ${gap}`);
  }
  for (let a = 0; a < 1180; a += 0.5) assert.ok(starts.some((s) => s >= a && s <= a + 20), `no gust in [${a}, ${a + 20}]`);
  assert.ok(windState(starts[5] + GUST.rise + 0.05).gust > 0.75, 'up after the rise');
});

test('title train: one every 22 to 34 s, crossing the whole picture, felt while it runs past', () => {
  const enter = [];
  let was = false, prev = null;
  for (let t = 0; t < 1200; t += DT) {
    const tr = trainState(t), lo = tr && Math.min(tr.x, tr.tail), hi = tr && Math.max(tr.x, tr.tail);
    const seen = !!tr && hi > 0 && lo < LW;
    if (seen && !was) enter.push(t);
    was = seen;
    if (tr) {
      assert.ok(tr.rumble >= 0 && tr.rumble <= 1 && tr.shake >= 0 && tr.shake <= tr.rumble + 1e-9, `rumble ${tr.rumble} shake ${tr.shake}`);
      assert.ok(Math.abs(Math.abs(tr.x - tr.tail) - TRAIN_LEN) < 1e-6);
      assert.ok(tr.v >= 0 && tr.v <= TRAIN.speed + 1e-6);
      if (prev && prev.k === tr.k) {
        const moved = (tr.x - prev.x) * tr.dir;
        assert.ok(moved >= -1e-9 && moved < TRAIN.speed * DT + 1e-6, 'never backward, never faster than its speed');
        if (!tr.stop) assert.ok(Math.abs(moved - TRAIN.speed * DT) < 1e-6, 'steady speed');
      }
      if (seen && tr.v > TRAIN.speed * 0.95 && hi > LW * 0.3 && lo < LW * 0.7) assert.ok(tr.shake > 0.6, `the glass shakes while it runs past (${tr.shake} at ${t})`);
    }
    prev = tr;
  }
  assert.ok(enter.length >= 1200 / 34 - 1, `${enter.length} trains`);
  for (let i = 1; i < enter.length; i++) {
    const gap = enter[i] - enter[i - 1];
    assert.ok(gap > 22 - 0.6 && gap < 34 + 0.6, `gap ${gap}`);
  }
  const slots = Array.from({ length: 40 }, (_, k) => trainSlot(k));
  assert.equal(new Set(slots.map((s) => s.dir)).size, 2, 'both ways');
  assert.ok(!slots[0].stop, 'the first one passes');
  const stops = slots.filter((s) => s.stop).length;
  assert.ok(stops >= 8 && stops <= 24, `${stops} of 40 pull up`);
  assert.ok(TRAIN_DUR > 4 && TRAIN_DUR < 8, `it takes ${TRAIN_DUR} s to pass`);
});

test('title train: one that pulls up brakes to a stand with its middle in the middle, waits, then pulls away', () => {
  const s = Array.from({ length: 40 }, (_, k) => trainSlot(k)).find((q) => q.stop);
  const at = (a) => trainState(s.start + a);
  assert.ok(at(s.brakeAt - 0.1).v > TRAIN.speed * 0.99, 'at speed before braking');
  assert.ok(at((s.brakeAt + s.stand) / 2).braking, 'braking');
  for (const a of [s.stand + 0.05, (s.stand + s.go) / 2, s.go - 0.05]) {
    const tr = at(a);
    assert.equal(tr.v, 0);
    assert.ok(Math.abs((tr.x + tr.tail) / 2 - LW / 2) < 1e-6, 'centred');
    assert.equal(tr.shake, 0, 'the glass is still');
    assert.ok(tr.rumble > 0.1 && tr.rumble < 0.3, 'it idles');
  }
  assert.ok(s.go - s.stand >= TRAIN.hold[0] - 1e-9 && s.go - s.stand <= TRAIN.hold[1] + 1e-9);
  const out = at(s.dur + 0.01), lo = Math.min(out.x, out.tail), hi = Math.max(out.x, out.tail);
  assert.ok(hi < 0 || lo > LW, 'gone at the end');
  assert.ok(s.dur + TRAIN.leave < TRAIN.slot - TRAIN.jitter - TRAIN.approach, 'over before the next one is heard');
});

test('title patrol car: along the lower deck now and then, its bar alternating red and blue', () => {
  let n = 0, was = false, red = 0, blue = 0, on = 0, total = 0;
  for (let t = 0; t < 900; t += DT) {
    const p = policeState(t);
    if (p && !was) n++;
    was = !!p;
    if (!p) continue;
    total++;
    red += p.red; blue += p.blue;
    if (p.red || p.blue) on++;
    assert.ok(p.x > -90 && p.x < LW + 90);
  }
  assert.ok(n >= 900 / (PATROL.slot + PATROL.jitter) && n <= 900 / (PATROL.slot - PATROL.jitter) + 1, `${n} patrols`);
  assert.ok(policeState(PATROL.first + 4), 'on the first pass');
  assert.ok(red > total * 0.2 && blue > total * 0.2, 'both colours');
  assert.ok(on > total * 0.5, 'flashing most of the time');
});

test('title offices: most lamps on, going off and on over the minutes', () => {
  let on = 0, changes = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    let prev = lampOn(i, 0);
    for (let t = 0; t < 600; t += 0.5) { const v = lampOn(i, t); on += v; n++; if (v !== prev) changes++; prev = v; }
  }
  assert.ok(on / n > 0.6 && on / n < 0.85, `lit ${on / n}`);
  assert.ok(changes > 60 * 600 / 150 && changes < 60 * 600 / 10, `${changes} changes`);
});

test('title clouds: the deck drifts left slowly and steadily, never back, without a jump at the palette steps', () => {
  const top = CLOUD.speed * (1 + CLOUD.swell.reduce((a, [k]) => a + k, 0));
  assert.ok(top <= 2, `at most ${top} px/s`);
  let lo = Infinity, hi = 0;
  for (let t = 0; t < 1200; t += DT) {
    const v = (cloudDrift(t + DT) - cloudDrift(t)) / DT;
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  assert.ok(lo > 0.3 && hi <= top + 1e-6, `speed ${lo} .. ${hi} px/s`);
  // across every step of the palette (the deck is repainted in its new colours then) it carries on where it was
  for (let t = 0.5; t < 600; t += 0.5) {
    const jump = cloudDrift(t + 1e-4) - cloudDrift(t - 1e-4);
    assert.ok(jump > 0 && jump < 1e-3, `jump ${jump} at ${t}`);
  }
  // over a minute it moves a little, nothing like the gusts of the street
  const minute = cloudDrift(90) - cloudDrift(30);
  assert.ok(minute > 40 && minute < 105, `${minute} px in a minute`);
});

// every cue of the title over `secs` s, with the time it was given at
function cuesOver(secs) {
  const cues = [];
  for (let t = 0; t < secs; t += DT) cues.push(...titleBeats(t, t + DT).map((c) => ({ ...c, t: t + DT })));
  return cues;
}

test('title sounds: no horn, each train heard piece by piece from far off to far off, cued ahead of its time', () => {
  const cues = cuesOver(600), names = new Set(cues.map((c) => c.name));
  assert.deepEqual([...names].sort(), ['air', 'elTrain'], 'the train and the far wash only: no horn, no hiss, no car passing');
  const slots = [];
  for (let k = 0; trainSlot(k).start < 600 - 30; k++) slots.push(trainSlot(k));
  for (const s of slots) {
    const mine = cues.filter((c) => c.name === 'elTrain' && c.opts.el.k === s.k).map((c) => c.opts.el);
    assert.ok(Math.abs(mine[0].a0 + TRAIN.approach) < 1e-9, 'heard from its approach');
    for (let i = 1; i < mine.length; i++) assert.ok(Math.abs(mine[i].a0 - mine[i - 1].a0 - RAIL.seg) < 1e-9, 'pieces one after another');
    assert.ok(mine[mine.length - 1].a0 + RAIL.seg >= s.dur + TRAIN.leave, 'heard until it has gone');
  }
  for (const c of cues.filter((q) => q.name === 'elTrain')) {
    assert.ok(c.opts.delay > RAIL.lead - 2 * DT && c.opts.delay <= RAIL.lead + 1e-9, `delay ${c.opts.delay}`);
    assert.ok(Math.abs(c.t + c.opts.delay - (trainSlot(c.opts.el.k).start + c.opts.el.a0)) < 1e-9, 'its delay lands it on its time');
  }
  assert.deepEqual(titleBeats(5, 5), [], 'nothing twice');
});

// the drawn axles of a train (Train.carsOf + TRAIN.wheels, the car flipped when it runs left), logical px
function axlesDrawn(tr) {
  const out = [];
  for (let i = 0; i < TRAIN.cars; i++) {
    const x = tr.dir > 0 ? tr.x - (i + 1) * TRAIN.car - i * TRAIN.gap : tr.x + i * (TRAIN.car + TRAIN.gap);
    for (const w of TRAIN.wheels) out.push(tr.dir > 0 ? x + w : x + TRAIN.car - w);
  }
  return out;
}

test('title sounds: the wheels knock on the joints as the drawn axles roll over them, in the rhythm of the trucks', () => {
  for (let k = 0; k < 12; k++) {
    const s = trainSlot(k), knocks = trainKnocks(s, -TRAIN.approach, s.dur + TRAIN.leave);
    assert.ok(knocks.length > 40, `${knocks.length} knocks`);
    for (const c of knocks) {
      const tr = trainState(s.start + c.at);
      assert.ok(axlesDrawn(tr).some((x) => Math.abs(x - c.x) < 0.5), `an axle is on the joint at ${c.x} when it knocks`);
      assert.ok(c.g > 0 && c.g <= 1 && Math.abs(c.pan) <= 0.7);
    }
    // the joint in front of the ear: every axle of a train running past knocks on it once, the loudest of all
    const front = knocks.filter((c) => c.x === RAIL.joint.at);
    if (s.stop) continue;
    assert.equal(front.length, TRAIN.cars * TRAIN.wheels.length);
    const loudest = Math.max(...knocks.map((q) => q.g));
    assert.ok(front.every((c) => c.g >= loudest - 1e-9));
    // da-dum, da-dum: the two axles of a truck close together, two trucks a little apart, then a car
    const gaps = front.slice(1).map((c, i) => c.at - front[i].at);
    assert.ok(Math.abs(gaps[0] - (TRAIN.wheels[3] - TRAIN.wheels[2]) / TRAIN.speed) < 1e-6);
    assert.ok(Math.max(...gaps) < 0.6 && Math.min(...gaps) > 0.05);
  }
});

test('title sounds: a train swells from far, is loudest passing, idles low standing, its pieces render as one sound', () => {
  const pass = trainSlot(0), stop = trainSlot(1);
  assert.ok(!pass.stop && stop.stop);
  assert.ok(trainHeard(pass, -2).near < 0.05 && trainHeard(pass, pass.dur / 2).near > 0.9, 'from far to near');
  assert.ok(trainHeard(pass, -1).pan * pass.dir < -0.5 && trainHeard(pass, pass.dur + 1).pan * pass.dir > 0.5, 'from one side to the other');
  const still = trainHeard(stop, (stop.stand + stop.go) / 2);
  assert.ok(still.stand > 0.9 && still.roll === 0 && still.pace === 0, 'standing');
  assert.ok(trainHeard(stop, (stop.brakeAt + 2 * stop.stand) / 3).brake > 0.3, 'its shoes sing as it stops');

  // rendered piece by piece as the mixer chains them, it is the same as rendered in one go
  const a0 = 1, n = 4, one = new ElevatedVoice(3).render(trainSound(pass, a0, n * RAIL.seg), true);
  const v = new ElevatedVoice(3), sr = v.sr, len = Math.round(n * RAIL.seg * sr), sum = [new Float32Array(len), new Float32Array(len)];
  for (let i = 0; i < n; i++) {
    const { data } = v.render(trainSound(pass, a0 + i * RAIL.seg), i === 0), off = Math.round(i * RAIL.seg * sr);
    for (let c = 0; c < 2; c++) for (let j = 0; j < data[c].length && off + j < len; j++) sum[c][off + j] += data[c][j];
  }
  let err = 0, peak = 0;
  for (let c = 0; c < 2; c++) for (let j = 0; j < len; j++) { err = Math.max(err, Math.abs(sum[c][j] - one.data[c][j])); peak = Math.max(peak, Math.abs(one.data[c][j])); }
  assert.ok(peak > 0.05 && err < 1e-4 * peak, `pieces differ from the whole by ${err} (peak ${peak})`);

  // loud passing, low standing, faint far off, never past full scale
  const rms = (s, a) => {
    const d = new ElevatedVoice(5).render(trainSound(s, a, 1), true).data, from = Math.round(sr * 0.2);
    let q = 0;
    for (const c of d) for (let j = from; j < c.length; j++) { q += c[j] * c[j]; assert.ok(Math.abs(c[j]) < 1); }
    return Math.sqrt(q / (2 * (d[0].length - from)));
  };
  const loud = rms(pass, pass.dur / 2 - 0.5), idle = rms(stop, (stop.stand + stop.go) / 2), far = rms(pass, -2.3);
  assert.ok(20 * Math.log10(loud / idle) > 12, `standing ${20 * Math.log10(loud / idle)} dB under passing`);
  assert.ok(20 * Math.log10(loud / far) > 20, `far off ${20 * Math.log10(loud / far)} dB under passing`);
});

test('title sounds: the mixer starts each piece of a train where the last one hands over, a new train afresh', async () => {
  const { default: Audio, META } = await load('audio/Audio.js');
  const ctx = mockContext(), starts = [];
  Object.assign(Audio, { ctx, active: [], lastPlay: {}, buffers: {}, elevated: null });
  Audio._build(ctx);
  const make = ctx.createBufferSource;
  ctx.createBufferSource = () => { const s = make(); const go = s.start; s.start = (t, ...r) => { starts.push(t); go(t, ...r); }; return s; };
  const s = trainSlot(0), play = (a, delay) => Audio.play('elTrain', { vol: 1, el: trainSound(s, a), delay, inside: 0 });
  play(-2.5, 0.3);
  assert.ok(Math.abs(starts[0] - 0.3) < 1e-9, 'a first piece starts when it is due');
  ctx.currentTime = 0.5;
  play(-2, 0.29);                                  // a frame late: still joined on exactly
  assert.ok(Math.abs(starts[1] - (starts[0] + RAIL.seg)) < 1e-9, 'the next starts where the last hands over');
  ctx.currentTime = 30;
  Audio.play('elTrain', { vol: 1, el: trainSound(trainSlot(1), -2.5), delay: 0.3 });
  assert.ok(Math.abs(starts[2] - 30.3) < 1e-9, 'another train starts afresh');
  assert.ok(META.elTrain.gain < 0.3, 'under the music');
  Audio.ctx = null;
});
