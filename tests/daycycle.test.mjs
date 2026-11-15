import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { DAY } = await load('game/data/daycycle.js');
const { hourAt, lookAt, sunAt, moonAt, rainAt, lampLit, officeLit, lightBands, glassBands, planeAt, birdsAt } = await load('game/ui/title/Cycle.js');
const { GAP } = await load('game/ui/title/Layout.js');

const { LOOP, STEP } = DAY;
const DT = 1 / 60;
const same = (a, b) => JSON.stringify({ ...a, step: 0 }) === JSON.stringify({ ...b, step: 0 });
// the palette held at t, copied (lookAt keeps one step in memory)
const look = (t) => ({ ...lookAt(t) });
const warmth = (c) => c[0] - c[2];

test('title day: a whole day and night in 90 to 120 s, looping onto itself', () => {
  assert.ok(LOOP >= 90 && LOOP <= 120, `${LOOP} s`);
  for (let t = 0; t < LOOP; t += 1.7) {
    assert.ok(same(look(t), look(t + LOOP)), `palette at ${t}`);
    assert.ok(same(look(t), look(t + 3 * LOOP)), `palette three loops on at ${t}`);
    assert.ok(Math.abs(hourAt(t) - hourAt(t + LOOP)) < 1e-6, `hour at ${t}`);
  }
  assert.ok(same(look(-1), look(LOOP - 1)), 'any t, even before the start');
});

test('title day: the clock goes once round the 24 hours, opening at sunset', () => {
  assert.ok(hourAt(0) >= 18.5 && hourAt(0) <= 20, `opens at ${hourAt(0)} h`);
  let run = 0, prev = hourAt(0);
  for (let t = DT; t <= LOOP + 1e-9; t += DT) {
    const h = hourAt(t), d = (h - prev + 24) % 24;
    assert.ok(h >= 0 && h < 24);
    assert.ok(d >= 0 && d < 0.5, `the clock jumps at ${t}`);
    run += d;
    prev = h;
  }
  assert.ok(Math.abs(run - 24) < 1e-6, `${run} h in a loop`);
});

test('title day: the palette by the hour: night, dawn, day, dusk', () => {
  const at = (hour) => {                                     // the first t whose hour is that one
    for (let t = 0; t < LOOP; t += 0.05) if (Math.abs(hourAt(t) - hour) < 0.1) return look(t);
    throw new Error(`no ${hour} h`);
  };
  const night = at(2), dawn = at(6), noon = at(13), dusk = at(19.5);
  assert.equal(night.lamps, 1, 'the city lit at night');
  assert.ok(night.stars > 0.9 && night.bright < 0.05 && night.glint === 0);
  assert.ok(noon.lamps === 0 && noon.stars === 0 && noon.glint === 1 && noon.bright > 0.8, 'day: no lamps, sun in the glass, a bright sky');
  for (const p of [noon, night]) assert.ok(p.sky[0].every((v, i) => v <= p.sky[5][i] + 1e-9), 'the sky lighter toward its horizon');
  for (const p of [dawn, dusk]) {
    assert.ok(warmth(p.sky[5]) > 60, 'a pink and orange band at the horizon');
    assert.ok(warmth(p.glassTop) > warmth(p.glass), 'the towers\' high floors catch the low sun');
  }
  assert.ok(warmth(noon.sky[3]) < 0, 'a pale blue sky by day');
  assert.ok(noon.haze.k > 0.3, 'a light haze by day');
  // what lights the steel and the glass is bright by day, dim at night
  const lum = (c) => c[0] + c[1] + c[2];
  assert.ok(lum(noon.light) > 3 * lum(night.light) && lum(noon.glass) > 3 * lum(night.glass));
});

test('title day: it opens on the city lighting up, neon after neon', () => {
  assert.ok(lookAt(0).lamps < 0.1, 'still day at the first frame');
  const lit = (at) => { for (let t = 0; t < 20; t += DT) if (lookAt(t).lamps >= at + 0.06) return t; return Infinity; };
  assert.ok(lit(0.1) < lit(0.32) && lit(0.32) < 8, 'the first neons within a few seconds, one after the other');
  assert.ok(lookAt(15).lamps > 0.8, 'all lit by the blue hour');
  // a light stutters while it catches, then holds
  let flips = 0, prev = lampLit(0.13, 0.1, 1, 0);
  for (let t = 0; t < 2; t += DT) { const v = lampLit(0.13, 0.1, 1, t); if (v !== prev) flips++; prev = v; }
  assert.ok(flips > 4, 'it stutters');
  for (let t = 0; t < 2; t += DT) { assert.equal(lampLit(0.5, 0.1, 1, t), true); assert.equal(lampLit(0.05, 0.1, 1, t), false); }
});

test('title day: the palette holds for a step, then moves by a small step, never a jump', () => {
  for (let k = 0; k < LOOP / STEP; k++) {
    const t = k * STEP;
    assert.equal(lookAt(t + 0.01), lookAt(t + STEP - 0.01), 'held within a step');
    const a = look(t), b = look(t + STEP);
    for (const key of ['light', 'low', 'glass', 'glassTop']) {
      const d = Math.max(...a[key].map((v, i) => Math.abs(v - b[key][i])));
      assert.ok(d < 16, `${key} jumps by ${d} at ${t}`);
    }
    for (let i = 0; i < 6; i++) assert.ok(Math.max(...a.sky[i].map((v, j) => Math.abs(v - b.sky[i][j]))) < 16, `sky band ${i} jumps at ${t}`);
    assert.ok(Math.abs(a.lamps - b.lamps) < 0.1, `lamps jump at ${t}`);
  }
});

test('title day: the sun by day, the moon by night; the sun goes down in the slit between the towers', () => {
  let sunT = 0, moonT = 0, top = Infinity;
  for (let t = 0; t < LOOP; t += 0.1) {
    const P = look(t), s = sunAt(t), m = moonAt(t);
    if (s) { sunT += 0.1; top = Math.min(top, s.y); assert.ok(s.up >= 0 && s.up <= 1); }
    if (m) moonT += 0.1;
    if (P.lamps >= 0.95) assert.equal(s, null, `no sun in the night at ${t}`);
    if (P.bright > 0.9 && P.glint === 1) assert.equal(m, null, `no moon by day at ${t}`);
    assert.ok(!(s && m && s.up > 0.1 && m.up > 0.1), 'never both high together');
  }
  assert.ok(sunT > 0.3 * LOOP && moonT > 0.3 * LOOP, `sun ${sunT} s, moon ${moonT} s`);
  assert.ok(top < 30, 'high at noon');
  const s0 = sunAt(0);
  assert.ok(s0 && s0.x > GAP.x0 && s0.x < GAP.x1 && s0.y > 60, 'low in the slit at the opening');
  assert.equal(sunAt(6), null, 'down a few seconds in');
  assert.ok(look(0).shadow && look(80).shadow && !look(30).shadow, 'the truss casts a shadow while the sun is up');
  assert.ok(Math.abs(look(66).shadow.dx) > Math.abs(look(100).shadow.dx), 'the shadow leans away from the sun');
});

test('title day: showers come and go, light, dry most of the time', () => {
  let dry = 0, wet = 0, prev = rainAt(0), top = 0;
  for (let t = DT; t < LOOP; t += DT) {
    const r = rainAt(t);
    assert.ok(r >= 0 && r <= 1);
    assert.ok(Math.abs(r - prev) < 0.02, `the rain jumps at ${t}`);
    if (r === 0) dry += DT; else wet += DT;
    top = Math.max(top, r);
    prev = r;
  }
  assert.ok(dry > 0.6 * LOOP, `dry ${dry} s of ${LOOP}`);
  assert.ok(wet > 10, 'it does rain');
  assert.ok(top <= 0.8, 'never more than a light shower');
  assert.equal(rainAt(0), 0, 'the title opens dry');
  for (let t = 0; t < LOOP; t += 3.3) assert.ok(Math.abs(rainAt(t) - rainAt(t + LOOP)) < 1e-9, 'loops');
});

test('title day: offices lit at dusk and in the night, dark by day, fewer late in the night', () => {
  const life = () => 1, count = (t) => { const P = look(t); let n = 0; for (let i = 0; i < 200; i++) n += officeLit(i, t, P, life) ? 1 : 0; return n; };
  assert.equal(count(82), 0, 'by day');
  assert.equal(count(0.2), 0, 'not yet at sunset');
  assert.ok(count(20) > 100, `${count(20)} of 200 in the evening`);
  assert.ok(count(46) < count(20) * 0.6, 'the city sleeps');
  const lit = []; for (let t = 0; t < 20; t += 0.5) lit.push(count(t));
  assert.ok(lit.every((n, i) => i === 0 || n >= lit[i - 1] - 12) && new Set(lit).size > 6 && lit.at(-1) > lit[4] + 50, 'they light one by one at dusk');
});

test('title day: a plane only at night, pigeons only by day', () => {
  let planes = 0, flocks = 0;
  for (let t = 0; t < 4 * LOOP; t += 0.25) {
    const p = planeAt(t), b = birdsAt(t), P = look(t);
    if (p) { planes++; assert.ok(P.bright < 0.75, `a plane by day at ${t}`); assert.ok(p.x > -60 && p.x < 460); }
    if (b) { flocks++; assert.equal(P.stars, 0, `pigeons at night at ${t}`); assert.ok(b.length > 2); }
  }
  assert.ok(planes > 0 && flocks > 0);
});

test('title day: the bands of light cover the whole height of a layer, top down', () => {
  for (const bands of [lightBands(look(30)), glassBands(look(80))]) {
    assert.ok(bands[0].y0 <= -16 && bands.at(-1).y1 >= 216 + 16);
    for (let i = 1; i < bands.length; i++) assert.equal(bands[i].y0, bands[i - 1].y1);
    for (const b of bands) assert.ok(b.c.every((v) => v >= 0 && v <= 255));
  }
});
