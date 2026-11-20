// The floor's liquid solver (engine/physics/Shallow.js): volume kept, walls, a doorway, spreading that stops at a
// film, drying and soaking per floor, mixing, blood setting into a stain, standing puddles, momentum, sleeping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Shallow } = await load('engine/physics/Shallow.js');

const WATER = { film: 1, flow: 1, drag: 2.5, dry: 0.012, age: 4, grip: 0.7 };
const BLOOD = { film: 1.5, flow: 0.5, drag: 7, dry: 0, age: 45, sets: true, stains: true, grip: 0.5 };
const BEER = { film: 1.15, flow: 0.85, drag: 3.5, dry: 0.01, age: 6, grip: 0.3, slip: true };
const KINDS = [WATER, BLOOD, BEER];
const W = 0, B = 1, BR = 2;
const DT = 1 / 30;

const grid = (w = 60, h = 60, o = {}) => new Shallow(w, h, 4, KINDS, { k: 140, stick: 0.5, thin: 1.2, ...o });
const run = (S, s) => { for (let t = 0; t < s; t += DT) S.step(DT); };
const wetCells = (S, min = 0.05) => { let n = 0; for (let i = 0; i < S.N; i++) if (S.depth(i) > min) n++; return n; };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

test('shallow: what is poured is kept as it runs, kind by kind', () => {
  const S = grid();
  S.pour(120, 120, 6, 200, W);
  S.pour(90, 100, 4, 60, B);
  for (let i = 0; i < S.N; i++) S.z[S.cellOf(i)] = (i * 7919) % 13 / 13 * 0.6; // a bumpy floor
  run(S, 6);
  assert.ok(near(S.total(W), 200), `water ${S.total(W)}`);
  assert.ok(near(S.total(B), 60), `blood ${S.total(B)}`);
  assert.ok(near(S.total(), 260));
  for (let i = 0; i < S.N; i++) assert.ok(S.depth(i) >= 0, 'never below nothing');
});

test('shallow: a pool spreads, then stops at the thickness of its film', () => {
  const S = grid(80, 80);
  S.pour(160, 160, 6, 150, W);
  run(S, 0.2);
  const early = wetCells(S);
  run(S, 6);
  const settled = wetCells(S);
  run(S, 5);
  assert.ok(settled > early, 'it spread');
  assert.equal(wetCells(S), settled, 'and stopped');
  // about as many cells as a film deep holds (it thins a little under its film at the edge)
  assert.ok(settled > 150 / WATER.film && settled < (150 / WATER.film) * 2.5, `${settled} cells`);
  let deep = 0;
  for (let i = 0; i < S.N; i++) deep = Math.max(deep, S.depth(i));
  assert.ok(deep < WATER.film * 1.6, `no tower left: ${deep}`);
  assert.equal(S.active.length, 0, 'asleep once still');
});

test('shallow: a wall holds it, a doorway lets it through, a solid cell keeps what it held', () => {
  const S = grid(60, 40);
  for (let y = 0; y < 40; y++) S.setSolid(y * 60 + 30, 1); // a wall down the middle
  S.pour(60, 80, 6, 2400, W); // about 2 mm over the left half: more than a film
  run(S, 6);
  let right = 0;
  for (let y = 0; y < 40; y++) for (let x = 31; x < 60; x++) right += S.depth(y * 60 + x);
  assert.equal(right, 0, 'nothing past the wall');
  // a doorway two cells wide
  S.setSolid(20 * 60 + 30, 0); S.setSolid(21 * 60 + 30, 0);
  run(S, 8);
  right = 0;
  for (let y = 0; y < 40; y++) for (let x = 31; x < 60; x++) right += S.depth(y * 60 + x);
  assert.ok(right > 10, `through the doorway: ${right}`);
  assert.ok(near(S.total(), 2400));
  // a door shut on a wet cell: what it held waits there
  const i = 20 * 60 + 30, held = S.depth(i);
  S.setSolid(i, 1);
  run(S, 1);
  assert.equal(S.depth(i), held);
});

test('shallow: water dries, faster on a floor that drinks; nothing is left of it', () => {
  const tile = grid(), carpet = grid(60, 60, { floor: (S, c, a) => S.soak.fill(0.05, a, a + 256) });
  for (const S of [tile, carpet]) { S.pour(120, 120, 6, 120, W); run(S, 4); }
  let dried = 0;
  const stains = [];
  for (let t = 0; t < 30; t += 0.25) { tile.dry(0.25); carpet.dry(0.25, (i, mm) => stains.push(mm)); }
  assert.ok(carpet.total() < tile.total() * 0.6, `carpet ${carpet.total()} tile ${tile.total()}`);
  for (let t = 0; t < 400; t += 0.25) { tile.dry(0.25, () => dried++); carpet.dry(0.25); }
  assert.equal(tile.total(), 0, 'dry');
  assert.equal(dried + stains.length, 0, 'water leaves no stain');
  assert.equal(tile.wetList.length, 0);
});

test('shallow: blood sets once it has stood its time, and is handed over as a stain', () => {
  const S = grid();
  S.pour(120, 120, 4, 40, B);
  run(S, 3);
  const before = S.total(B);
  for (let t = 0; t < BLOOD.age - 2; t += 0.25) S.dry(0.25, () => assert.fail('not yet'));
  assert.ok(near(S.total(B), before), 'blood does not evaporate');
  const stains = [];
  for (let t = 0; t < 4; t += 0.25) S.dry(0.25, (i, mm) => stains.push([i, mm]));
  assert.equal(S.total(B), 0, 'set');
  assert.ok(stains.length >= 10 && stains.every(([, mm]) => mm > 0), `${stains.length} stained cells`);
});

test('shallow: kinds mix as they run into each other, and the mix decides how it grips', () => {
  const S = grid(80, 40);
  S.pour(100, 80, 6, 500, W);
  S.pour(200, 80, 6, 500, BR);
  run(S, 10);
  let mixed = 0;
  for (let i = 0; i < S.N; i++) { const a = S.addr(i); if (a >= 0 && S.vol[a * 3 + W] > 0.01 && S.vol[a * 3 + BR] > 0.01) mixed++; }
  assert.ok(mixed > 0, 'they met');
  assert.ok(near(S.total(W), 500) && near(S.total(BR), 500));
  const pure = S.addr(S.index(230, 80));
  assert.ok(S.slip[pure] > 0.5 && S.grip[pure] < 0.4, 'beer is slick');
  const w = S.addr(S.index(70, 80));
  assert.ok(S.slip[w] < 0.5 && S.grip[w] > 0.6, 'water less so');
});

test('shallow: a standing puddle never dries under its rest level; a kerb holds a shallow flow', () => {
  const S = grid(40, 40);
  const i = S.index(80, 80);
  S.addCell(i, 2, W, 0);
  S.rest[S.addr(i)] = 1.5;
  S.z[S.addr(i)] = -3; // in a hollow
  for (let t = 0; t < 300; t += 0.25) S.dry(0.25);
  assert.ok(near(S.depth(i), 1.5), `${S.depth(i)}`);
  // a step up of 6 mm along x = 20: a thin flow on the low side does not climb it
  const K = grid(40, 40);
  for (let y = 0; y < 40; y++) for (let x = 20; x < 40; x++) K.z[K.cellOf(y * 40 + x)] = 6;
  K.pour(60, 80, 6, 60, W);
  run(K, 6);
  let up = 0;
  for (let y = 0; y < 40; y++) for (let x = 20; x < 40; x++) up += K.depth(y * 40 + x);
  assert.equal(up, 0);
});

test('shallow: a push carries a pool on (a gush runs on), asleep it wakes again when fed', () => {
  const S = grid(80, 40), T = grid(80, 40);
  for (const G of [S, T]) G.pour(160, 80, 6, 120, W);
  for (let t = 0; t < 1; t += DT) { S.push(160, 80, 12, 120, 0, 0.4); S.step(DT); T.step(DT); }
  run(S, 4); run(T, 4);
  const cx = (G) => { let s = 0, m = 0; for (let i = 0; i < G.N; i++) { s += (i % G.w) * G.depth(i); m += G.depth(i); } return s / m; };
  assert.ok(cx(S) > cx(T) + 2, `pushed east: ${cx(S)} vs ${cx(T)}`);
  run(T, 4);
  assert.equal(T.active.length, 0);
  T.pour(160, 80, 4, 30, W);
  assert.ok(T.next.length > 0, 'woken');
  assert.equal(T.step(DT), true);
});

// ---- the sparse grid: chunks made where liquid is, let go once dry, the flow as it was on the whole grid

const { default: Dense } = await import('./fixtures/ShallowDense.mjs');
// a floor with bumps, a wall down x = 70 with a doorway at y 40..43 and a kerb along y = 60 (z up 6 mm below it)
const FW = 150, FH = 90;
const floorZ = (i) => { const x = i % FW, y = (i / FW) | 0; return ((i * 7919) % 13) / 13 * 0.6 + (y >= 60 ? 6 : 0) + x * 0.002; };
const isWall = (i) => { const x = i % FW, y = (i / FW) | 0; return x === 70 && (y < 40 || y > 43) ? 1 : 0; };
function pair() {
  const opts = { k: 140, stick: 0.5, thin: 1.2 };
  const D = new Dense(FW, FH, 4, KINDS, opts);
  for (let i = 0; i < D.N; i++) { D.z[i] = floorZ(i); if (isWall(i)) D.setSolid(i, 1); }
  const S = new Shallow(FW, FH, 4, KINDS, {
    ...opts, slots: 4, solid: isWall,
    floor: (G, c, a0) => {
      const cx = (c % G.cw) * 16, cy = ((c / G.cw) | 0) * 16;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (cx + x < FW && cy + y < FH) G.z[a0 + y * 16 + x] = floorZ((cy + y) * FW + cx + x);
    },
  });
  return [D, S];
}
// every cell the same, to the last bit (a cell not made is dry)
function same(D, S, what) {
  let bad = 0;
  for (let i = 0; i < D.N; i++) {
    const a = S.addr(i);
    if (a < 0 ? D.dep[i] !== 0 : D.dep[i] !== S.dep[a] || D.fx[i] !== S.fx[a] || D.fy[i] !== S.fy[a]) bad++;
    else if (a >= 0) for (let k = 0; k < S.K; k++) if (D.vol[i * S.K + k] !== S.vol[a * S.K + k]) bad++;
  }
  assert.equal(bad, 0, `${what}: ${bad} cells differ`);
}

test('shallow (sparse): it flows exactly as the whole grid did, across chunk edges, a wall, a doorway and a kerb', () => {
  const [D, S] = pair();
  const both = (fn) => { fn(D); fn(S); };
  // a pool on a chunk corner (cells 16 / 32: px 64 / 128), a gush against the wall, blood on the kerb
  both((G) => { G.pour(128, 128, 8, 300, W); G.pour(250, 150, 6, 900, W); G.pour(160, 236, 5, 80, B); G.pour(400, 60, 6, 200, BR); });
  for (let t = 0; t < 4; t += DT) {
    both((G) => { if (t < 1) G.push(250, 150, 10, 90, 20, 0.3); G.step(DT); });
    if (Math.round(t / DT) % 8 === 0) { both((G) => G.dry(DT * 8)); S.sweep(); }
  }
  same(D, S, 'running');
  both((G) => { G.setSolid(41 * FW + 70, 1); G.pour(280, 170, 4, 50, W); }); // a door shut in the doorway, more poured
  for (let t = 0; t < 3; t += DT) both((G) => G.step(DT));
  same(D, S, 'door shut');
  both((G) => G.setSolid(41 * FW + 70, 0));
  for (let t = 0; t < 3; t += DT) both((G) => G.step(DT));
  same(D, S, 'opened again');
  assert.ok(Math.abs(D.total() - S.total()) < 1e-3, 'as much in all');
});

test('shallow (sparse): a spill far from the others makes its own chunks; once dry and still they are let go', () => {
  const [, S] = pair();
  assert.equal(S.count, 0, 'nothing made before anything is poured');
  S.pour(40, 40, 5, 60, W);
  const near = S.count;
  assert.ok(near > 0 && near <= 9, `a spill and its neighbours: ${near} chunks`);
  S.pour(560, 320, 5, 60, W);   // far off, in another corner
  assert.ok(S.slot[S.chunkOf(S.index(560, 320))] >= 0, 'its chunk made');
  assert.ok(S.count > near && S.count <= near * 2 + 4, `${S.count} chunks`);
  for (let t = 0; t < 4; t += DT) S.step(DT);
  const held = S.total();
  S.sweep(); // (the chunks made past the pools' neighbours may go: nothing ran there)
  assert.ok(S.wetList.every((c) => S.slot[c] >= 0), 'never a wet chunk');
  assert.equal(S.total(), held, 'nothing lost');
  for (let t = 0; t < 600 && S.total() > 0; t += 0.25) S.dry(0.25);
  S.dry(0.25); // (the pass that finds a chunk dry tells it so)
  for (let t = 0; t < 2; t += DT) S.step(DT);
  assert.equal(S.total(), 0, 'dried');
  assert.ok(S.sweep() > 0, 'dry chunks let go');
  assert.equal(S.count, 0, 'all of them');
  // poured again where it was: made again with its floor as it was
  S.pour(40, 40, 5, 60, W);
  const i = S.index(44, 44);
  assert.equal(S.z[S.addr(i)], Math.fround(floorZ(i)));
});

test('shallow (sparse): a grid with no owner for its solids keeps what it made (a wall set by hand is never lost)', () => {
  const S = grid(60, 40);
  S.setSolid(10 * 60 + 30, 1);
  assert.ok(S.count >= 1);
  assert.equal(S.sweep(), 0);
  assert.equal(S.solidAt(10 * 60 + 30), 1);
});
