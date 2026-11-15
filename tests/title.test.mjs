import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const {
  windState, GUST, lightningState, LIGHTNING, trainState, trainSlot, TRAIN, TRAIN_LEN, TRAIN_DUR, policeState, traffic,
  lampOn, tubeFlicker, walker, beamAngles, titleBeats, planeState,
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
  const s = starts[5], w = windState(s + GUST.rise + 0.05);
  assert.ok(w.gust > 0.75, 'up after the rise');
  assert.ok(Math.abs(w.last.start - s) < 0.05, 'the gust is known to whoever rides it');
});

test('title train: one every 20 to 30 s, crossing the whole picture at its speed, felt while it passes', () => {
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
      if (prev && prev.k === tr.k) assert.ok(Math.abs((tr.x - prev.x) * tr.dir - TRAIN.speed * DT) < 1e-6, 'steady speed');
      if (seen && hi > LW * 0.3 && lo < LW * 0.7) assert.ok(tr.shake > 0.6, `the glass shakes while it passes (${tr.shake} at ${t})`);
    }
    prev = tr;
  }
  assert.ok(enter.length >= 1200 / 30 - 1, `${enter.length} trains`);
  for (let i = 1; i < enter.length; i++) {
    const gap = enter[i] - enter[i - 1];
    assert.ok(gap > 20 - 0.6 && gap < 30 + 0.6, `gap ${gap}`);
  }
  const dirs = new Set(Array.from({ length: 40 }, (_, k) => trainSlot(k).dir));
  assert.equal(dirs.size, 2, 'both ways');
  assert.ok(TRAIN_DUR > 4 && TRAIN_DUR < 8, `it takes ${TRAIN_DUR} s to pass`);
});

test('title patrol car: now and then, its bar alternating red and blue, never both dark for long', () => {
  let n = 0, was = false, red = 0, blue = 0, on = 0, total = 0;
  for (let t = 0; t < 900; t += DT) {
    const p = policeState(t);
    if (p && !was) n++;
    was = !!p;
    if (!p) continue;
    total++;
    red += p.red; blue += p.blue;
    if (p.red || p.blue) on++;
    assert.ok(p.lane === 0 || p.lane === 1);
  }
  assert.ok(n >= 900 / 90 && n <= 900 / 34 + 1, `${n} patrols`);
  assert.ok(policeState(15), 'on the first pass');
  assert.ok(red > total * 0.2 && blue > total * 0.2, 'both colours');
  assert.ok(on > total * 0.5, 'flashing most of the time');
});

test('title traffic: cars come and go both ways in their lanes, never into each other or into the patrol car', () => {
  const seen = new Set();
  for (let t = 0; t < 300; t += 0.25) {
    const cars = traffic(t), p = policeState(t);
    if (p) cars.push(p);
    for (const c of cars) {
      assert.ok(c.x > -90 && c.x < LW + 90);
      assert.equal(c.dir, c.lane ? 1 : -1);
      seen.add(c.kind);
      for (const o of cars) if (o !== c && o.lane === c.lane) assert.ok(Math.abs(o.x - c.x) > 40, `cars overlap at ${t}`);
    }
  }
  assert.ok(seen.size >= 6);
});

test('title windows: most lamps on, going off and on over the minutes; a bad tube stutters; people cross rooms', () => {
  let on = 0, changes = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    let prev = lampOn(i, 0);
    for (let t = 0; t < 600; t += 0.5) { const v = lampOn(i, t); on += v; n++; if (v !== prev) changes++; prev = v; }
  }
  assert.ok(on / n > 0.6 && on / n < 0.85, `lit ${on / n}`);
  assert.ok(changes > 60 * 600 / 150 && changes < 60 * 600 / 10, `${changes} changes`);
  let off = 0, walks = 0;
  for (let t = 0; t < 120; t += DT) { if (tubeFlicker(3, t) < 0.5) off++; if (walker(5, t) >= 0) walks++; }
  assert.ok(off > 0 && off < 120 * 60 * 0.1, `tube out ${off}`);
  assert.ok(walks > 0 && walks < 120 * 60 * 0.4, `walks ${walks}`);
  for (let t = 0; t < 60; t += 0.1) { const p = walker(2, t); assert.ok(p === -1 || (p >= 0 && p <= 1)); }
});

test('title searchlights: sweeping, never lying flat', () => {
  let min = 9, max = -9;
  for (let t = 0; t < 300; t += 0.25) for (const a of beamAngles(t)) { min = Math.min(min, a); max = Math.max(max, a); }
  assert.ok(min < -0.3 && max > 0.3 && min > -1 && max < 1, `${min} .. ${max}`);
});

test('title plane: one over now and then, crossing the sky high up, its lights blinking', () => {
  let n = 0, was = false, strobes = 0;
  for (let t = 0; t < 900; t += 0.05) {
    const p = planeState(t);
    if (p && !was) n++;
    was = !!p;
    if (!p) continue;
    assert.ok(p.y >= 10 && p.y < 30 && p.x > -12 && p.x < LW + 12);
    if (p.strobe) strobes++;
  }
  assert.ok(n >= 900 / 90 - 1 && n <= 900 / 60 + 1, `${n} planes`);
  assert.ok(strobes > 0);
});

test('title lightning: rare, far, two quick flickers 70 to 110 s apart, dark in between', () => {
  const starts = [];
  let was = false, peaks = 0, inFlash = false, bolts = 0;
  for (let t = 0; t < 1800; t += 0.005) {
    const l = lightningState(t);
    assert.ok(l.flash >= 0 && l.flash <= 1);
    const on = l.flash > 0;
    if (on && !was && !(starts.length && t - starts[starts.length - 1] < LIGHTNING.len)) starts.push(t);
    was = on;
    if (l.flash > 0.5 && !inFlash) peaks++;
    inFlash = l.flash > 0.5;
    if (l.bolt) bolts++;
  }
  assert.ok(starts.length >= 1800 / 110 - 1);
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    assert.ok(gap > 70 - 0.05 && gap < 110 + 0.05, `gap ${gap}`);
  }
  assert.equal(peaks, starts.length * 2, 'two flickers each');
  assert.ok(bolts > 0);
  assert.equal(lightningState(starts[3] + LIGHTNING.len + 0.01).flash, 0);
});

test('title sounds: each train heard once as it comes, its horn now and then, the city under it all', () => {
  const cues = [];
  for (let t = 0; t < 600; t += DT) cues.push(...titleBeats(t, t + DT).map((c) => ({ ...c, t: t + DT })));
  const rumbles = cues.filter((c) => c.name === 'passby'), horns = cues.filter((c) => c.name === 'horn');
  assert.ok(rumbles.length >= 600 / 30 - 1 && rumbles.length <= 600 / 20 + 1, `${rumbles.length} trains heard`);
  assert.ok(horns.length > 0 && horns.length < rumbles.length, `${horns.length} horns`);
  for (const r of rumbles) {
    const tr = trainState(r.t + r.opts.lead);
    assert.ok(tr && Math.abs((tr.x + tr.tail) / 2 - LW / 2) < 4, 'loudest when the middle of the train crosses the middle of the window');
  }
  assert.ok(cues.some((c) => c.name === 'air'));
  assert.deepEqual(titleBeats(5, 5), [], 'nothing twice');
});
