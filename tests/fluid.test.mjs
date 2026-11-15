import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Fluid } = await load('engine/physics/Fluid.js');

const DT = 1 / 30;
// a closed box of w x h flow cells of 16 px (a ring of wall), optional wall column at x = `wall` with a gap
function box(w = 30, h = 20, { wall = -1, gap = null, loss = 0, kinds = 1 } = {}) {
  const F = new Fluid(w, h, 16, 2, kinds);
  Object.assign(F, { drag: 0.3, vorticity: 0.4 });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ring = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const inWall = x === wall && !(gap && y >= gap[0] && y <= gap[1]);
      if (ring || inWall) F.setSolid(y * w + x, 1);
    }
  }
  for (let k = 0; k < kinds; k++) F.setLoss(k, 0, loss);
  return F;
}
const total = (F, k = 0) => F.kinds[k].d.reduce((s, v) => s + v, 0);
const step = (F, n, each) => { for (let i = 0; i < n; i++) { each?.(); F.flow(DT); F.carry(DT); } };
const side = (F, x0, x1) => {
  let s = 0;
  for (let gy = 0; gy < F.H; gy++) for (let gx = x0 * F.sub; gx < x1 * F.sub; gx++) s += F.d[gy * F.W + gx];
  return s;
};

test('fluid: carrying the smoke through a stirred box keeps its amount (no loss set)', () => {
  const F = box();
  F.addDensity(200, 160, 30, 0.8);
  const m0 = total(F);
  step(F, 90, () => F.swirl(240, 160, 80, 2, 60, 0.2));
  assert.ok(Math.abs(total(F) - m0) / m0 < 0.02, `${total(F)} vs ${m0}`);
  assert.ok(F.peak < 0.8, 'spread by the flow');
});

test('fluid: what is over the rest level decays at its loss rate, what is under it comes back', () => {
  const F = box(20, 12, { loss: 0.2 });
  F.kinds[0].recover = 0.5;
  const j = 6 * F.W + 10, k = 6 * F.W + 20;
  F.setRest(0, j, 0.1); F.setRest(0, k, 0.1);
  F.d[j] = 0.6; F.d[k] = 0;
  step(F, 150); // 5 s, no flow
  const want = 0.1 + 0.5 * Math.exp(-0.2 * 5);
  assert.ok(Math.abs(F.d[j] - want) < 0.03, `${F.d[j]} vs ${want}`);
  assert.ok(F.d[k] > 0.08, `came back to ${F.d[k]}`);
  F.restK = 0.4; // the power cut
  step(F, 600);
  assert.ok(F.d[j] < 0.06, `down to ${F.d[j]}`);
});

test('fluid: a wall holds the smoke and the flow; a gap lets it through', () => {
  const push = (F) => () => F.push(150, 160, 60, 80, 0, 0.3);
  const shut = box(30, 20, { wall: 15 });
  shut.addDensity(150, 160, 40, 1);
  step(shut, 120, push(shut));
  assert.equal(side(shut, 15, 30), 0, 'nothing past the wall');
  assert.ok(Math.abs(shut.velocityAt(16 * 15 + 8, 160, {}).x) < 1e-6, 'no flow in it');
  const open = box(30, 20, { wall: 15, gap: [8, 11] });
  open.addDensity(150, 160, 40, 1);
  step(open, 120, push(open));
  assert.ok(side(open, 16, 30) > 0.2, `through the gap: ${side(open, 16, 30)}`);
});

test('fluid: a source adds where it is, a deposit adds exactly its amount', () => {
  const F = box();
  F.addDensity(200, 160, 20, 0.5);
  assert.ok(F.densityAt(200, 160) > 0.4 && F.densityAt(300, 160) === 0);
  const m = total(F);
  F.deposit(301, 77, 0.25);
  assert.ok(Math.abs(total(F) - m - 0.25) < 1e-6);
  F.addDensity(8, 8, 20, 1); // over the wall ring: only on open cells
  for (let j = 0; j < F.d.length; j++) if (F.fsolid[j]) assert.equal(F.d[j], 0);
});

test('fluid: the flow comes out divergence-free, and a swirl keeps turning the way it was set', () => {
  const F = box();
  step(F, 10, () => F.swirl(240, 160, 64, 1.5, 60, 0.3));
  const v = {}, at = (x, y) => F.velocityAt(x, y, v);
  const right = at(280, 160).y, left = at(200, 160).y;
  assert.ok(right > 3 && left < -3, `turning: ${right} / ${left}`);
  let worst = 0, scale = 0;
  for (let y = 2; y < F.h - 2; y++) {
    for (let x = 2; x < F.w - 2; x++) {
      const i = y * F.w + x;
      if (F.solid[i] || F.solid[i - 1] || F.solid[i + 1] || F.solid[i - F.w] || F.solid[i + F.w]) continue;
      worst = Math.max(worst, Math.abs(F.u[i + 1] - F.u[i - 1] + F.v[i + F.w] - F.v[i - F.w]));
      scale = Math.max(scale, Math.abs(F.u[i]) + Math.abs(F.v[i]));
    }
  }
  assert.ok(worst < scale * 0.25, `divergence ${worst} for speeds ${scale}`);
});

test('fluid: a blast pushes the air out of its heart', () => {
  const F = box();
  F.addExpand(240, 160, 40, 12);
  F.flow(DT);
  const v = {};
  assert.ok(F.velocityAt(300, 160, v).x > 1 && F.velocityAt(180, 160, v).x < -1);
});

test('fluid: kinds ride the same flow, each lost at its own rate in each place', () => {
  const F = box(30, 20, { kinds: 2 });
  F.setLoss(1, 0, 0.5);
  F.setLoss(1, 1, 2);
  F.addDensity(150, 160, 30, 0.8, 0);
  F.addDensity(150, 160, 30, 0.8, 1);
  step(F, 60, () => F.push(150, 160, 60, 60, 0, 0.3));
  const at = (k) => F.densityAt(200, 160, k);
  assert.ok(at(0) > 0.05 && at(1) > 0.01, 'both carried along');
  assert.ok(Math.abs(total(F, 0) - total(F, 1) / Math.exp(-0.5 * 2)) / total(F, 0) < 0.1, 'kind 1 lost at its rate');
  // the open place (1) takes kind 1 four times faster
  const G = box(20, 12, { kinds: 2 });
  G.setLoss(1, 0, 0.5);
  G.setLoss(1, 1, 2);
  for (let j = 0; j < G.place.length; j++) G.place[j] = 1;
  G.addDensity(150, 100, 30, 0.8, 1);
  const m0 = total(G, 1);
  step(G, 30);
  assert.ok(Math.abs(total(G, 1) / m0 - Math.exp(-2)) < 0.03, `${total(G, 1) / m0}`);
});

test('fluid: a kind with nothing in the stepped region is not carried; one carried into it is', () => {
  const F = box(30, 20, { kinds: 2 });
  F.setLoss(1, 0, 1);
  step(F, 3);
  assert.equal(F.kinds[1].peak, 0);
  assert.equal(total(F, 1), 0, 'left empty');
  F.setRegion(16, 16, 200, 300);  // the left of the box only
  F.kinds[1].d[10 * F.W + 50] = 0.5; // smoke waiting further right, not stepped
  step(F, 3);
  assert.equal(F.kinds[1].d[10 * F.W + 50], 0.5, 'waits where nothing is stepped');
  F.setRegion(16, 16, 464, 304);   // the view moved over it
  step(F, 3);
  assert.ok(F.kinds[1].peak > 0 && F.kinds[1].d[10 * F.W + 50] < 0.5, 'found and carried');
});

test('fluid: how far along a segment the air is thick', () => {
  const F = box(30, 20, { kinds: 2 });
  F.addDensity(240, 160, 40, 1.5, 1);
  const w = [0, 1];
  const across = F.thickAlong(100, 160, 380, 160, w, 0.5);
  assert.ok(across > 30 && across < 80, `${across} px thick`);
  assert.equal(F.thickAlong(100, 260, 380, 260, w, 0.5), 0, 'past it');
  assert.equal(F.thickAlong(100, 160, 380, 160, [1, 0], 0.5), 0, 'a kind that does not count');
  assert.ok(F.thickAlong(100, 160, 380, 160, w, 0.5, 16) <= 24, 'stops counting at enough');
});
