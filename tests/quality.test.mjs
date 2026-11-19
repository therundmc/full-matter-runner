import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, QUALITY_LEVELS, QUALITY_CHOICES, AUTO } from '../src/game/data/quality.js';
import { quality, setQuality, levelOf, qualityLabel, QualityWatch } from '../src/game/systems/Quality.js';
import { fitView, VIEW } from '../src/engine/Camera.js';
import { MAX_PARTICLES } from '../src/game/Config.js';
import { POST } from '../src/game/data/post.js';
import { FIRE } from '../src/game/data/fire.js';
import Particles from '../src/game/fx/Particles.js';
import Fires from '../src/game/systems/Fires.js';
import Lens from '../src/game/render/Lens.js';
import { nearest } from '../src/game/render/Lighting.js';

const at = (level, fn) => { setQuality(level); try { return fn(); } finally { setQuality('high'); } };

test('quality: the table has the three levels, each with every key, HIGH dropping nothing and each level no more than the one above', () => {
  assert.deepEqual(QUALITY_LEVELS, ['low', 'medium', 'high']);
  assert.deepEqual(QUALITY_CHOICES, ['auto', 'low', 'medium', 'high']);
  const keys = Object.keys(QUALITY.high).sort();
  for (const l of QUALITY_LEVELS) assert.deepEqual(Object.keys(QUALITY[l]).sort(), keys, l);
  assert.deepEqual(QUALITY.high, { ss: Infinity, zoom: Infinity, mirrors: true, bloom: 1, light: 1, smoke: 1, particles: 1, shimmer: true, glow: true, rays: true, lights: Infinity, fire: 1 });
  for (const k of keys) {
    const [lo, mid, hi] = QUALITY_LEVELS.map((l) => +QUALITY[l][k]);
    assert.ok(lo <= mid && mid <= hi, `${k}: ${lo} ${mid} ${hi}`);
  }
  const M = QUALITY.medium, L = QUALITY.low;
  assert.ok(M.ss <= 1.1 && !M.mirrors && M.bloom < 1 && M.smoke < 1 && M.particles === 0.5 && !M.shimmer, 'MEDIUM');
  assert.ok(M.light === 1 && M.glow && M.rays && M.fire === 1, 'MEDIUM keeps the light map, the lens and the fires');
  assert.ok(L.ss === 1 && L.light === 0.5 && !L.rays && !L.glow && Number.isFinite(L.lights) && L.fire === 0.5, 'LOW');
});

test('quality: one function says what is in force; a level is put in force whole; an unknown one is HIGH', () => {
  assert.equal(quality().level, 'high');
  const Q = quality();
  setQuality('low');
  assert.equal(quality(), Q, 'the same object: read each frame');
  assert.deepEqual(Q, { level: 'low', ...QUALITY.low });
  setQuality('medium');
  assert.deepEqual(Q, { level: 'medium', ...QUALITY.medium });
  setQuality('ultra');
  assert.deepEqual(Q, { level: 'high', ...QUALITY.high });
  assert.equal(levelOf({ quality: 'low', autoQuality: 'high' }), 'low');
  assert.equal(levelOf({ quality: 'auto', autoQuality: 'medium' }), 'medium');
  assert.equal(levelOf({ quality: 'auto' }), 'high');
  assert.equal(qualityLabel({ quality: 'auto', autoQuality: 'medium' }), 'AUTO (MEDIUM)');
  assert.equal(qualityLabel({ quality: 'high', autoQuality: 'low' }), 'HIGH');
});

test('quality: the scene drawn - HIGH as ever, MEDIUM no more than a tenth over the window, LOW never over it, and never a fractional zoom', () => {
  for (const h of [720, 768, 900, 1080, 1200, 1440, 2160]) {
    const hi = fitView(VIEW, h, true, false, QUALITY.high), mid = fitView(VIEW, h, true, false, QUALITY.medium), lo = fitView(VIEW, h, true, false, QUALITY.low);
    assert.deepEqual(hi, fitView(VIEW, h, true), `${h}: HIGH is what it was`);
    assert.ok(hi.ss >= 1 && mid.ss <= 1.1 + 1e-9 && lo.ss <= 1 + 1e-9, `${h}: ${hi.ss} ${mid.ss} ${lo.ss}`);
    for (const f of [hi, mid, lo]) assert.ok(Number.isInteger(f.zoom) && f.zoom >= 1 && Math.abs(f.ss - (VIEW * f.zoom) / h) < 1e-9, `${h}: a whole zoom, the view ${VIEW} px high`);
    assert.ok(lo.zoom <= mid.zoom && mid.zoom <= hi.zoom && mid.zoom <= QUALITY.medium.zoom && lo.zoom <= QUALITY.low.zoom);
  }
  assert.deepEqual(fitView(VIEW, 1080, true, false, QUALITY.medium), { ss: (VIEW * 4) / 1080, zoom: 4 }, '1080 MEDIUM: 7 % over, kept');
  assert.deepEqual(fitView(VIEW, 720, true, false, QUALITY.medium), { ss: (VIEW * 2) / 720, zoom: 2 }, '720 MEDIUM: 21 % over, a zoom less');
  assert.deepEqual(fitView(VIEW, 1080, true, false, QUALITY.low), { ss: (VIEW * 3) / 1080, zoom: 3 });
  // at the wheel the picture is 1:1 whatever the level (resampled, the car blurs), and so is a picture with no lens
  for (const l of QUALITY_LEVELS) {
    assert.deepEqual(fitView(360, 1080, true, true, QUALITY[l]), { ss: 1, zoom: 3 });
    assert.deepEqual(fitView(VIEW, 1080, false, false, QUALITY[l]), { ss: 1, zoom: 4 });
  }
});

test('quality: the particles kept are halved under HIGH', () => {
  const fill = () => {
    const P = new Particles({ map: { solidAt: () => false }, camera: { x: 0, y: 0 } });
    for (let i = 0; i < MAX_PARTICLES + 500; i++) P.add({ type: 2, x: 0, y: 0, vx: 0, vy: 0, life: 9, maxLife: 9, size: 1 });
    P.trim();
    return P.list.length;
  };
  assert.equal(fill(), MAX_PARTICLES);
  assert.equal(at('medium', fill), MAX_PARTICLES / 2);
  assert.equal(at('low', fill), MAX_PARTICLES / 2);
});

test('quality: on LOW a floor on fire throws half the puffs of flame', () => {
  // many fires in view, once their turns have settled: the puffs asked of the particles in ten seconds
  const puffs = () => {
    let n = 0;
    const world = { particles: { fire: (x, y, c) => { n += c ?? 1; }, smoke() {}, embers() {} }, light() {}, sound() {}, smoke: null, decals: null };
    const F = new Fires(world, []);
    for (let i = 0; i < 2000; i++) F.add(i % 50, Math.floor(i / 50));
    for (let i = 0; i < 40 * 60; i++) F.update(1 / 60);
    n = 0;
    for (let i = 0; i < 10 * 60; i++) F.update(1 / 60);
    return n;
  };
  const hi = puffs(), lo = at('low', puffs), mid = at('medium', puffs);
  assert.ok(hi > FIRE.budget * 10 * 0.7, `${hi} puffs in ten seconds on HIGH`);
  assert.ok(Math.abs(mid - hi) < hi * 0.15, 'MEDIUM: as many');
  assert.ok(lo > hi * 0.35 && lo < hi * 0.65, `${lo} on LOW against ${hi}`);
});

test('quality: the lens - no shimmer under HIGH; on LOW no glow and no shafts, the grade, vignette and fringe as ever', () => {
  const view = () => ({ W: 1920, H: 1080, outH: 1080, scale: 4, state: 'play', phase: 'normal', powerOn: true, timeScale: 1, trauma: 0, combo: 0,
    toScreen: (x, y) => ({ x, y }), player: { x: 900, y: 500, angle: 0 }, lights: [{ x: 300, y: 300, k: 1 }], heat: [{ x: 400, y: 400, kind: 'fire' }] });
  const uni = () => { const l = new Lens(); for (let i = 0; i < 120; i++) l.update(1 / 60, view()); return l.uniforms(view()); };
  const hi = uni(), mid = at('medium', uni), lo = at('low', uni);
  assert.ok(hi.heat[3] > 0 && hi.glow.strength === POST.glow.strength && hi.rays.strength === POST.rays.strength);
  assert.ok(mid.heat.every((v) => v === 0), 'MEDIUM: the air does not shimmer');
  assert.ok(mid.glow.strength > 0 && mid.rays.strength > 0);
  assert.ok(lo.heat.every((v) => v === 0) && lo.glow.strength === 0 && lo.rays.strength === 0, 'LOW: their passes are not run (PostGL)');
  for (const u of [mid, lo]) {
    assert.equal(u.vignette, hi.vignette);
    assert.equal(u.fringe, hi.fringe);
    assert.deepEqual(u.grade, hi.grade);
    assert.equal(u.scan, hi.scan);
  }
});

test('quality: the flashes lit at once are the nearest to the middle of the view', () => {
  const L = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 100, y: 0 }));
  assert.equal(nearest(L, 250, 0, Infinity), L, 'HIGH: all of them, the list itself');
  assert.deepEqual(nearest(L, 250, 0, 4).map((l) => l.x).sort((a, b) => a - b), [100, 200, 300, 400]);
  assert.equal(nearest(L.slice(0, 3), 0, 0, 4).length, 3);
});

// frames of `ms` for `sec` s; -> the levels it went down to
const feed = (w, ms, sec, counted = true) => {
  const out = [];
  for (let t = 0; t < sec * 1000; t += ms) { const to = w.frame(ms, counted); if (to) out.push(to); }
  return out;
};

test('quality: AUTO starts at HIGH and stays there while the frames keep up', () => {
  const w = new QualityWatch();
  assert.equal(w.level, 'high');
  assert.deepEqual(feed(w, 1000 / 60, 60), []);
  assert.deepEqual(feed(w, 1000 / 144, 60), []);
  assert.deepEqual(feed(w, AUTO.over, 30), [], 'on the mark is not over it');
  assert.equal(w.level, 'high');
});

test('quality: AUTO goes down one level at a time when the mean frame is over 18 ms, waiting between two, and never back up', () => {
  const w = new QualityWatch();
  // the first `skip` s of a level say nothing, then a full window is needed
  assert.deepEqual(feed(w, 25, AUTO.skip + AUTO.window - 0.2), []);
  assert.deepEqual(feed(w, 25, 0.4), ['medium']);
  // just gone down: nothing counted for `skip` s, then a window again
  assert.deepEqual(feed(w, 25, AUTO.skip + AUTO.window - 0.6), []);
  assert.deepEqual(feed(w, 25, 0.8), ['low']);
  assert.deepEqual(feed(w, 40, 30), [], 'nothing under LOW');
  assert.deepEqual(feed(w, 5, 60), [], 'never back up by itself');
  assert.equal(w.level, 'low');
});

test('quality: AUTO is not moved by a hitch, a hit-stop, a held beat or a few slow frames', () => {
  const w = new QualityWatch();
  feed(w, 16, AUTO.skip + 0.1);
  // a spike in a window of good frames: the mean stays under the mark
  for (let i = 0; i < 5; i++) assert.equal(w.frame(60), null);
  assert.deepEqual(feed(w, 16, 10), []);
  // a load (a frame of `hitch` ms or more) is not the game's pace
  for (let i = 0; i < 100; i++) assert.equal(w.frame(AUTO.hitch + 50), null);
  assert.deepEqual(feed(w, 16, 5), []);
  // frames that do not count (not in play, a hit-stop): however slow
  assert.deepEqual(feed(w, 40, 30, false), []);
  assert.equal(w.level, 'high');
  // a level starts: the window is thrown away with the slow frames in it
  feed(w, 30, AUTO.window - 0.5);
  w.rest();
  assert.deepEqual(feed(w, 16, 10), []);
});

test('quality: AUTO goes on from the level kept from the last session', () => {
  const w = new QualityWatch('medium');
  assert.deepEqual(feed(w, 30, 20), ['low']);
  assert.equal(new QualityWatch('nonsense').level, 'high');
});
