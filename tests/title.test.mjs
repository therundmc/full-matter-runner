import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { windState, signState, bulbState, chaseOn, BULBS, lightningState, LIGHTNING, sweepState, tubeState, GUST } = await load('game/ui/title/Timeline.js');

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

test('title sign: every part stays in [0, 1], the R drops out and strikes again, the corner tries', () => {
  let rOff = 0, strikes = 0, cornerOn = 0;
  for (let t = 0; t < 300; t += DT) {
    const s = signState(t);
    for (const k of ['main', 'R', 'glass', 'border', 'corner']) assert.ok(s[k] >= 0 && s[k] <= 1, `${k} ${s[k]} at ${t}`);
    for (const b of s.bubbles) assert.ok(b === 0 || b === 1);
    assert.ok(s.bubbles.reduce((a, b) => a + b, 0) <= 1, 'one bubble at a time');
    assert.ok(s.strike === -1 || (s.strike >= 0 && s.strike < 1.2));
    if (s.R < 0.1) rOff++;
    if (s.strike >= 0 && s.strike < DT) strikes++;
    if (s.corner > 0.5) cornerOn++;
  }
  assert.ok(rOff > 60, 'the R drops out');
  assert.ok(strikes >= 20, `the R strikes again (${strikes})`);
  assert.ok(cornerOn > 10 && cornerOn < 300 * 60 * 0.2, 'the dead corner only tries now and then');
});

test('title bulbs: two on one off chasing toward the head, two dead, values in [0, 1]', () => {
  for (let t = 0; t < 30; t += 0.013) {
    const b = bulbState(t), step = Math.floor(t * BULBS.rate), f = t * BULBS.rate - step;
    assert.equal(b.length, BULBS.n);
    for (let i = 0; i < BULBS.n; i++) {
      assert.ok(b[i] >= 0 && b[i] <= 1);
      if (BULBS.dead.includes(i)) { assert.equal(b[i], 0); continue; }
      // past the warm-up / cool-down, a bulb is lit exactly when the chase says so (the flickering one may dip)
      if (f > 0.4 && i !== BULBS.flick) assert.equal(b[i] > 0.5, chaseOn(i, step), `bulb ${i} at ${t}`);
    }
  }
  // the pattern moves one bulb toward the head each step
  for (let s = 0; s < 6; s++) for (let i = 1; i < 9; i++) assert.equal(chaseOn(i, s), chaseOn(i + 1, s + 1));
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => chaseOn(i, 0)), [false, true, true, false, true, true]);
});

test('title lightning: two quick flickers every 25 to 45 s, dark in between', () => {
  const starts = [];
  let was = false, peaks = 0, inFlash = false;
  for (let t = 0; t < 900; t += 0.005) {
    const l = lightningState(t);
    assert.ok(l.flash >= 0 && l.flash <= 1);
    const on = l.flash > 0;
    if (on && !was && !(starts.length && t - starts[starts.length - 1] < LIGHTNING.len)) starts.push(t);
    was = on;
    if (l.flash > 0.5 && !inFlash) peaks++;
    inFlash = l.flash > 0.5;
  }
  assert.ok(starts.length >= 900 / 45 - 1);
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    assert.ok(gap > 25 - 0.05 && gap < 45 + 0.05, `gap ${gap}`);
  }
  assert.equal(peaks, starts.length * 2, 'two flickers each');
  assert.equal(lightningState(starts[3] + LIGHTNING.len + 0.01).flash, 0);
});

test('title sweep: a car passes every 8 to 12 s', () => {
  let n = 0, was = false;
  for (let t = 0; t < 120; t += DT) { const on = !!sweepState(t); if (on && !was) n++; was = on; }
  assert.ok(n >= 10 && n <= 13);
});

test('title pawn shop tube: buzzes near full, drops out now and then', () => {
  let out = 0;
  for (let t = 0; t < 120; t += DT) { const v = tubeState(t); assert.ok(v >= 0 && v <= 1); if (v < 0.1) out++; }
  assert.ok(out > 10 && out < 120 * 60 * 0.08, `${out}`);
});
