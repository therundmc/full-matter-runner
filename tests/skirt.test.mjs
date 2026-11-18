import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const { newSkirt, stepSkirt } = await load('game/entities/Skirt.js');
const { COAT } = await load('game/data/feel.js');
const { KINDS } = await load('game/entities/Character.js');
const { PLAYER } = await load('game/Config.js');

const DT = 1 / 60;
// width / height of a sprite's PNG (IHDR)
function png(name) {
  const b = readFileSync(new URL(`../assets/sprites/${name}.png`, import.meta.url));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
// a skirt after s seconds of the same going (facing a, velocity along va at sp px/step)
function settle(S, a, va, sp, s = 2, phase = 0.25) {
  for (let i = 0; i < s * 60; i++) stepSkirt(S, a + Math.PI, Math.cos(va) * sp, Math.sin(va) * sp, phase, DT);
  return S;
}
const finite = (S) => [S.w, S.v, S.len, S.open, ...S.half.flatMap((h) => [h.a, h.len])].every(Number.isFinite);

test('skirt: standing still it hangs as a short hem, straight behind him, its vent shut', () => {
  const S = settle(newSkirt(), 0.7, 0, 0);
  for (const h of S.half) {
    assert.ok(Math.abs(h.len - COAT.hem) < 1e-3, `len ${h.len}`);
    assert.ok(Math.abs(h.a) < 1e-3, `a ${h.a}`);
  }
  assert.ok(COAT.hem > 0.2 && COAT.hem < 0.7);
});

test('skirt: it is drawn out and its vent opens with his speed', () => {
  const walk = settle(newSkirt(), 0, 0, PLAYER.speed * 0.4, 2, 0), run = settle(newSkirt(), 0, 0, PLAYER.speed, 2, 0);
  assert.ok(run.len > walk.len && walk.len > COAT.hem, `${walk.len} ${run.len}`);
  assert.ok(run.len > 0.95, 'fully out at a run');
  assert.ok(run.open > walk.open && walk.open > 0);
  // the halves open away from each other: his left one toward his left (+), his right one toward his right
  assert.ok(run.half[0].a > 0 && run.half[1].a < 0, `${run.half[0].a} ${run.half[1].a}`);
});

test('skirt: his stride kicks each half out in turn', () => {
  const a = settle(newSkirt(), 0, 0, PLAYER.speed, 2, 0.25), b = settle(newSkirt(), 0, 0, PLAYER.speed, 2, 0.75);
  assert.ok(a.half[0].len > a.half[1].len, 'the left half out at a quarter of the stride');
  assert.ok(b.half[1].len > b.half[0].len, 'the right half out at three quarters');
  assert.ok(Math.abs(a.half[0].a) > Math.abs(a.half[1].a));
});

test('skirt: it lags a turn, swings to the outside of it and comes back behind him', () => {
  const S = settle(newSkirt(), 0, 0, PLAYER.speed, 2, 0);
  // he turns a quarter to his right in a tenth of a second, running on
  let peak = 0;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 2) * ((i + 1) / 6);
    stepSkirt(S, a + Math.PI, Math.cos(a) * PLAYER.speed, Math.sin(a) * PLAYER.speed, 0, DT);
    peak = Math.min(peak, (S.half[0].a + S.half[1].a) / 2);
  }
  assert.ok(peak < -0.3, `it is left behind, on the outside of the turn: ${peak}`);
  assert.ok(peak >= -COAT.swing - 1e-9, 'never further than its swing');
  settle(S, Math.PI / 2, Math.PI / 2, PLAYER.speed, 2, 0);
  assert.ok(Math.abs(S.half[0].a + S.half[1].a) < 1e-3, 'back behind him');
});

test('skirt: side-stepping, it trails where he comes from, no further than its trail', () => {
  const S = settle(newSkirt(), 0, Math.PI / 2, PLAYER.speed, 2, 0);   // facing +x, going to his right
  const mid = (S.half[0].a + S.half[1].a) / 2;
  assert.ok(mid > 0.3, `toward his left: ${mid}`);
  assert.ok(mid <= Math.min(COAT.trail, COAT.swing) + 1e-6);
});

test('skirt: gathered in when he is curled up', () => {
  const S = settle(newSkirt(), 0, 0, PLAYER.speed);
  stepSkirt(S, Math.PI, PLAYER.speed, 0, 0, DT, 1);
  assert.equal(S.half[0].len, 0);
  assert.equal(S.half[1].len, 0);
});

test('skirt: a teleport, a long frame, a stopped clock or bad numbers leave it finite and in bounds', () => {
  const S = settle(newSkirt(), 0, 0, PLAYER.speed);
  const cases = [[Math.PI + 300, 9000, -9000, 12.3, 5], [NaN, NaN, NaN, NaN, NaN], [0, Infinity, 0, 0, DT], [1, 2, 0, 0, 0], [1, 2, 0, 0, -1],
    [-40, 0, 0, 1e9, DT]];
  for (const [back, vx, vy, phase, dt] of cases) {
    stepSkirt(S, back, vx, vy, phase, dt, NaN);
    assert.ok(finite(S), JSON.stringify([back, vx, vy, phase, dt]));
    for (const h of S.half) {
      assert.ok(Math.abs(h.a) <= COAT.swing + COAT.open + COAT.kick[0] + 1e-9);
      assert.ok(h.len >= 0 && h.len <= 1 + COAT.kick[1] + 1e-9);
    }
  }
  S.w = NaN; S.v = NaN;
  stepSkirt(S, 0, 1, 0, 0, DT);
  assert.ok(finite(S), 'it recovers from a broken state');
  for (let i = 0; i < 600; i++) stepSkirt(S, i * 2.5, Math.cos(i) * 3, Math.sin(i * 1.7) * 3, i * 0.05, 0.05);
  assert.ok(finite(S), 'spun wildly at the longest step');
});

test('skirt: the runner wears it, its sprites and its numbers are there', () => {
  assert.equal(KINDS.player.coat, 'characters/player_tail');
  for (const k of Object.keys(KINDS)) if (k !== 'player') assert.equal(KINDS[k].coat, undefined, k);
  const l = png('characters/player_tail_l'), r = png('characters/player_tail_r');
  assert.deepEqual(l, r);
  assert.ok(l.w > COAT.root * 4 && l.h > 8);
  assert.ok(png('characters/player_rag_skirt').w > 0);
  // they are painted finer than the world, as the standing man is; his skirt on the floor is not
  const src = readFileSync(fileURLToPath(new URL('../src/engine/Assets.js', import.meta.url)), 'utf8');
  const FINE = new RegExp(src.match(/const FINE = \/(.*)\/;/)[1]);
  assert.ok(FINE.test('characters/player_tail_l') && FINE.test('characters/player_tail_r'));
  assert.ok(!FINE.test('characters/player_rag_skirt'));
  for (const n of ['player_tail_l', 'player_tail_r', 'player_rag_skirt']) assert.ok(src.includes(`'characters/${n}'`), n);
  // half the sprite's height apart at most: the two halves meet down his back
  assert.ok(COAT.hinge[1] * 2 <= l.h / 2 + 1e-9 && COAT.hinge[0] < 0);
});

test('skirt: the lab has its lane', async () => {
  const { default: lab } = await load('game/data/levels/lab.js');
  assert.ok(lab.floor.some(([name]) => name === 'label_coat'));
  assert.ok(png('props/label_coat').w > 0);
});
