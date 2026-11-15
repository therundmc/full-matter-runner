import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const {
  windState, GUST, trainState, trainSlot, TRAIN, TRAIN_LEN, TRAIN_DUR, policeState, PATROL, lampOn, titleBeats,
} = await load('game/ui/title/Timeline.js');
const { LW } = await load('game/ui/title/Draw.js');

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

test('title sounds: each train heard as it comes, its horn now and then; one that pulls up sighs and goes on', () => {
  const cues = [];
  for (let t = 0; t < 600; t += DT) cues.push(...titleBeats(t, t + DT).map((c) => ({ ...c, t: t + DT })));
  const slots = [];
  for (let k = 0; trainSlot(k).start < 600 - 30; k++) slots.push(trainSlot(k));
  const rumbles = cues.filter((c) => c.name === 'passby'), horns = cues.filter((c) => c.name === 'horn');
  const stops = slots.filter((s) => s.stop);
  assert.ok(stops.length > 0);
  assert.ok(rumbles.length >= slots.length + stops.length, `${rumbles.length} rumbles for ${slots.length} trains`);
  assert.ok(horns.length >= stops.length && horns.length < slots.length + stops.length, `${horns.length} horns`);
  for (const s of slots.filter((q) => !q.stop)) {
    const r = rumbles.find((c) => Math.abs(c.t - (s.start - TRAIN.approach)) < 2 * DT);
    const tr = trainState(r.t + r.opts.lead);
    assert.ok(tr && Math.abs((tr.x + tr.tail) / 2 - LW / 2) < 4, 'loudest when the middle of the train crosses the middle of the window');
  }
  for (const s of stops) {
    assert.ok(cues.some((c) => c.name === 'hiss' && Math.abs(c.t - (s.start + s.stand)) < 2 * DT), 'its brakes let go as it stands');
    assert.ok(rumbles.some((c) => Math.abs(c.t - (s.start + s.go)) < 2 * DT), 'heard pulling away');
  }
  assert.ok(cues.some((c) => c.name === 'air'));
  assert.deepEqual(titleBeats(5, 5), [], 'nothing twice');
});
