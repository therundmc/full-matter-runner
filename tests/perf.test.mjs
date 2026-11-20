import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Profiler, percentile } = await load('engine/Profiler.js');
const { bytesOf } = await load('engine/Bytes.js');
const { default: Perf, PERF_MODES, nextMode, SECTIONS, LEAVES, refreshOf, topOf } = await load('game/systems/Perf.js');
const { DEV_KEYS, devMode } = await load('game/data/build.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: Liquids } = await load('game/systems/Liquids.js');
const { default: Smoke } = await load('game/systems/Smoke.js');
const { default: FireSpread } = await load('game/systems/FireSpread.js');
const { default: Fires } = await load('game/systems/Fires.js');

// a profiler on a clock the test moves
function clocked(size = 240) {
  let t = 0;
  const P = new Profiler(size, () => t);
  return { P, tick: (ms) => { t += ms; } };
}

test('perf: percentile is the nearest rank, the list left as it was', () => {
  const v = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10];
  assert.equal(percentile(v, 0.5), 5);
  assert.equal(percentile(v, 0.95), 10);
  assert.equal(percentile(v, 0), 1);
  assert.equal(percentile([], 0.95), 0);
  assert.deepEqual(v, [5, 1, 4, 2, 3, 6, 7, 8, 9, 10]);
});

test('perf: a section is added up over a frame (one per step), kept per frame, averaged over the span', () => {
  const { P, tick } = clocked();
  P.on = true;
  // 20 frames of 10 ms; section `a` runs twice a frame for i ms each, `b` once for 1 ms
  for (let i = 1; i <= 20; i++) {
    P.begin('a'); tick(i); P.end('a');
    P.begin('a'); tick(i); P.end('a');
    P.begin('b'); tick(1); P.end('b');
    P.frame(10);
  }
  assert.equal(P.last('a'), 40);
  // 50 ms: the last 5 frames (16..20, twice each)
  const s = P.stats('a', 50);
  assert.equal(s.mean, 36);
  assert.equal(s.min, 32);
  assert.equal(s.max, 40);
  assert.equal(s.p95, 40);
  assert.equal(s.last, 40);
  assert.equal(P.stats('b', 1000).mean, 1);
  // an end with no begin (turned on in between) is ignored
  P.end('b');
  P.frame(10);
  assert.equal(P.last('b'), 0);
  // the frames' own lengths, and the p95 of a skewed run
  const f = P.frameStats(200);
  assert.equal(f.mean, 10);
  for (let i = 0; i < 19; i++) { P.add('c', 1); P.frame(10); }
  P.add('c', 50); P.frame(10);
  assert.equal(P.stats('c', 200).p95, 1);
  assert.equal(P.stats('c', 200).max, 50);
  assert.equal(P.stats('c', 200).mean, (19 + 50) / 20);
});

test('perf: counters are means a frame; the ring keeps its size; reset forgets', () => {
  const { P } = clocked(8);
  for (let i = 0; i < 20; i++) { P.count('gl', 1, 100); P.count('gl', 1, 100); P.frame(16); }
  assert.deepEqual(P.countStats('gl', 1000), { n: 2, bytes: 200 });
  assert.equal(P.filled, 8);
  assert.equal(P.frames(1e9), 8);
  P.reset();
  assert.equal(P.filled, 0);
  assert.deepEqual(P.countStats('gl', 1000), { n: 0, bytes: 0 });
});

test('perf: the display rate is snapped to a screen rate when the frames keep up with it', () => {
  assert.deepEqual(refreshOf(Array(60).fill(1000 / 60)), { hz: 60, sure: true });
  assert.deepEqual(refreshOf(Array(60).fill(1000 / 144 * 1.01)), { hz: 144, sure: true });
  assert.equal(refreshOf(Array(10).fill(150)).sure, false);
  assert.equal(refreshOf([]).hz, 0);
});

test('perf: the leaf that spent the most, a parent\'s remainder included', () => {
  const ms = { update: 10, sim: 8, phys: 6, render: 4, draw: 3 };
  assert.equal(topOf((k) => ms[k] || 0).id, 'phys');
  const lots = { update: 10, sim: 9, phys: 1 };
  const t = topOf((k) => lots[k] || 0);
  assert.equal(t.id, 'sim.other');
  assert.equal(t.ms, 8);
  for (const s of SECTIONS) if (s.in) assert.ok(SECTIONS.some((p) => p.id === s.in), `${s.id}: its parent is a section`);
  assert.ok(LEAVES.includes('draw.other') && !LEAVES.includes('sim'));
});

test('perf: F8 cycles OFF -> COMPACT -> FULL -> OFF, the profiler on while the overlay shows', () => {
  assert.deepEqual(PERF_MODES, ['off', 'compact', 'full']);
  assert.equal(nextMode('off'), 'compact');
  assert.equal(nextMode('compact'), 'full');
  assert.equal(nextMode('full'), 'off');
  const prof = new Profiler();
  const perf = new Perf({ state: 'title' }, { prof });
  assert.equal(perf.mode, 'off');
  assert.equal(prof.on, false);
  assert.equal(perf.cycle(), 'compact');
  assert.equal(prof.on, true);
  assert.equal(perf.cycle(), 'full');
  assert.equal(prof.on, true);
  assert.equal(perf.cycle(), 'off');
  assert.equal(prof.on, false);
});

test('perf: F8 is a developer\'s key: a release build drops it (data/build.js)', () => {
  assert.ok(DEV_KEYS.includes('F8'));
  assert.equal(devMode('', { release: true }), false);
  assert.equal(devMode('?dev=1', { release: true }), true);
  assert.equal(devMode('', { release: false }), true);
});

// a game reduced to what Perf reads, with a small world of real systems
function game() {
  const ROWS = ['##########', '#........#', '#........#', '#........#', '##########'];
  const map = new TileMap(ROWS), events = new EventBus();
  const body = (isStatic, isSleeping = false) => ({ isStatic, isSleeping });
  const world = {
    map, events, level: {}, time: 0, chars: [{ alive: true }, { alive: false }], civilians: [], corpses: [], doors: [], windows: [],
    props: [], items: [], projectiles: [], debris: [], lights: [], player: { x: 0, y: 0 }, power: { on: true },
    particles: { list: [{}, {}], drops() {}, fire() {}, embers() {}, sparks() {} },
    physics: { bodies: () => [body(true), body(false), body(false, true)], activePairs: () => [1] },
    decals: { bytes: () => ({ arr: 0, cvs: 4096 }), ageing: [[1, 2], [3]], heads: [1, 0] },
    sound() {}, light() {}, emit() {}, after() {}, noise() {},
  };
  world.liquids = new Liquids(world);
  world.smoke = new Smoke(world, {});
  world.fires = new Fires(world);
  world.fireSpread = new FireSpread(world, {});
  return { state: 'play', levelId: 'test', world, settings: { quality: 'auto' }, timeScale: 0.5, hitstop: 0, camera: { zoom: 3, z: 3 }, view: 290, canvas: { width: 64, height: 32, getContext() {} } };
}

test('perf: snapshot() is a plain object with every part, and the robot\'s spread stays the F4 numbers', () => {
  const g = game(), prof = new Profiler();
  const perf = new Perf(g, { prof, voices: () => 3, extra: () => ({ sprites: { cvs: 1000 } }) });
  perf.setMode('full');
  for (let i = 0; i < 40; i++) {
    prof.begin('sim'); prof.end('sim');
    perf.tick(1 / 60, 1 / 60, 2, 3, 1);
  }
  const s = perf.snapshot();
  assert.deepEqual(Object.keys(s).sort(), ['cpu', 'frame', 'gpu', 'level', 'memory', 'mode', 'quality', 'state', 't', 'world'].sort());
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  for (const k of ['fps', 'ms', 'min', 'p95', 'worst', 'refreshHz', 'steps', 'timeScale', 'hitstop']) assert.ok(k in s.frame, k);
  assert.equal(s.frame.fps, 60);
  assert.equal(s.frame.refreshHz, 60);
  assert.equal(s.frame.steps.last, 1);
  assert.equal(s.frame.timeScale, 0.5);
  assert.equal(s.cpu.profiling, true);
  for (const sec of SECTIONS) assert.ok(s.cpu.sections[sec.id], sec.id);
  assert.equal(s.cpu.sections.update.mean, 2);
  assert.equal(s.cpu.sections.render.mean, 3);
  assert.ok(s.cpu.sections['update.other']);
  assert.equal(s.gpu.lensMs, null);
  assert.deepEqual(s.gpu.scene, [64, 32]);
  assert.equal(s.world.bodies, 3);
  assert.equal(s.world.static, 1);
  assert.equal(s.world.sleeping, 1);
  assert.equal(s.world.alive, 1);
  assert.equal(s.world.particles, 2);
  assert.equal(s.world.stains, 2);
  assert.equal(s.world.voices, 3);
  assert.equal(s.quality.setting, 'auto');
  // the QA robot spreads game.perf: only the F4 numbers come with it
  assert.deepEqual(Object.keys({ ...perf }).sort(), ['fps', 'frame', 'render', 'update', 'worst']);
  assert.equal(perf.update, 2);
  assert.equal(perf.render, 3);
  // the overlay's view: the last snapshot, the graph's frames, the top leaf
  const v = perf.view();
  assert.ok(v.snap && v.graph.length === 40 && v.top.id);
});

test('perf: the byte estimates are numbers >= 0, each buffer counted once, by its first owner', () => {
  const g = game(), perf = new Perf(g, { extra: () => ({ sprites: { cvs: 1000 } }) });
  const m = perf.memory(true);
  assert.ok(m.owners.length >= 5);
  for (const o of m.owners) {
    assert.ok(Number.isFinite(o.arr) && o.arr >= 0, o.name);
    assert.ok(Number.isFinite(o.cvs) && o.cvs >= 0, o.name);
  }
  const by = Object.fromEntries(m.owners.map((o) => [o.name, o]));
  // the liquids' flow and the smoke's fluid are reached through their systems
  const typed = (o) => Object.values(o).filter((v) => ArrayBuffer.isView(v)).reduce((n, v) => n + v.byteLength, 0);
  assert.ok(by.liquids.arr * 1048576 >= typed(g.world.liquids.sim));
  assert.ok(by.smoke.arr * 1048576 >= typed(g.world.smoke.fluid));
  assert.ok(by.fire.arr > 0);
  assert.equal(by['map layers'].cvs * 1048576, 4096);
  assert.equal(by.sprites.cvs * 1048576, 1000);
  assert.ok(Math.abs(m.arr - m.owners.reduce((n, o) => n + o.arr, 0)) < 1e-9);
  // the walk: typed arrays once (a view on a counted buffer is not counted again), canvases w x h x 4, plain objects
  // and lists followed, another class instance and a way back into the world left alone
  class Other { constructor() { this.big = new Float64Array(1000); } }
  const buf = new Float32Array(10), cv = { width: 4, height: 2, getContext() {} };
  const owner = { a: buf, b: new Uint8Array(buf.buffer), list: [cv, new Map([[1, new Uint8Array(5)]])], other: new Other(), world: { x: new Uint8Array(99) } };
  assert.deepEqual(bytesOf(owner), { arr: 45, cvs: 32 });
  const seen = new Set();
  bytesOf(owner, seen);
  assert.deepEqual(bytesOf([owner, owner.other], seen), { arr: 8000, cvs: 0 });
});
