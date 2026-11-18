// The performance pass: what is cached or left out must change nothing drawn or decided.
// - Fires.near picks the n nearest in one pass: the same fires, in the same order, as sorting them all.
// - FireArt keeps each fire's hashed tongues till the next beat: the same squares as working them out every frame.
// - Particles leave out what lies off the picture: the same draws for what is on it, none for the rest.
// - Lighting keeps a Path2D per shadow polygon (clipPoly) and a prop type's emissive map (glowOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Fires } = await load('game/systems/Fires.js');
const { drawFlames } = await load('game/render/FireArt.js');
const { default: Particles, P } = await load('game/fx/Particles.js');
const { default: Lighting } = await load('game/render/Lighting.js');

// a little seeded random
const prng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('fires: near() gives the n nearest nearest first, equals in their order, like a full stable sort', () => {
  const rnd = prng(7);
  for (let trial = 0; trial < 200; trial++) {
    const fires = new Fires({}, []);
    // on a coarse grid: many fires at the same distance
    const count = 1 + Math.floor(rnd() * 40);
    for (let i = 0; i < count; i++) fires.add(Math.floor(rnd() * 8) * 32, Math.floor(rnd() * 8) * 32);
    const x = Math.floor(rnd() * 8) * 32, y = Math.floor(rnd() * 8) * 32, n = Math.floor(rnd() * 6);
    const want = fires.fires.length <= n ? fires.fires
      : [...fires.fires].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, n);
    assert.deepEqual(fires.near(x, y, n), want, `trial ${trial}`);
  }
});

// a 2D context that records what is drawn; its transform maps the world 1:1 onto a w x h canvas
function recorder(w = 4000, h = 4000, ox = -2000, oy = -2000) {
  const calls = [];
  const ctx = {
    canvas: { width: w, height: h }, fillStyle: '', globalAlpha: 1, globalCompositeOperation: 'source-over', strokeStyle: '', lineWidth: 1,
    getTransform: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: ox, f: oy }) }),
    save() {}, restore() {}, transform() {}, beginPath() {}, moveTo(x, y) { this.at = [x, y]; }, lineTo() {},
    stroke() { calls.push(['stroke', this.strokeStyle, this.globalAlpha, this.at[0] - 10, this.at[1] - 10, 20, 20]); },
    fillRect(...a) { calls.push(['rect', this.fillStyle, this.globalAlpha, ...a]); },
    drawImage(img, ...a) { calls.push(['img', this.globalAlpha, ...a]); },
  };
  return { ctx, calls };
}

// FireArt.drawFlames as it was before its tongues were kept: every hash worked out at every draw
const BEAT = 11, COLS = ['#d8401a', '#ff8a1e', '#ffd040', '#fff6cf'];
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function reference(ctx, fires, t, vis) {
  const beat = Math.floor(t * BEAT), seen = fires.filter((f) => vis(f.x, f.y));
  if (!seen.length) return;
  const sq = (x, y, s) => ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  const grow = (f) => Math.min(1, 0.3 + f.age / 1.2) * Math.sqrt(f.k);
  ctx.fillStyle = '#7e1a0c';
  ctx.globalAlpha = 0.5;
  for (const f of seen) { const s = Math.round(15 * grow(f)); ctx.fillRect(Math.round(f.x - s / 2), Math.round(f.y - s / 2), s, s); }
  ctx.globalAlpha = 1;
  for (let layer = 0; layer < 4; layer++) {
    ctx.fillStyle = COLS[layer];
    for (const f of seen) {
      const g = grow(f), n = f.k > 1 ? 5 : 3;
      for (let j = 0; j < n; j++) {
        const seed = hash(f.x + j * 17.3, f.y - j * 5.1), ph = hash(seed * 91.7 + j, beat + Math.floor(seed * 7));
        const ox = f.x + (hash(seed, 1) - 0.5) * 15 * g, oy = f.y + (hash(seed, 2) - 0.5) * 11 * g;
        const h = (4 + 9 * ph) * g, lean = (hash(seed, beat) - 0.5) * 3;
        if (layer === 0) sq(ox, oy, Math.max(3, Math.round(7 * g)));
        else if (layer === 1) sq(ox + lean * 0.5, oy - h * 0.45, Math.max(2, Math.round(5 * g)));
        else if (layer === 2) { if (ph > 0.25) sq(ox + lean, oy - h, Math.max(2, Math.round(3 * g))); }
        else if (ph > 0.7) sq(ox, oy - h * 0.2, 2);
      }
    }
  }
}

test('flames: the tongues kept from one beat to the next draw the very same squares as hashed afresh', () => {
  const rnd = prng(3);
  const fires = Array.from({ length: 30 }, () => ({ x: rnd() * 600 - 300, y: rnd() * 600 - 300, k: rnd() < 0.3 ? 2.5 : 1, age: rnd() }));
  const vis = (x) => x < 250; // what the renderer calls in view
  for (let frame = 0; frame < 90; frame++) {
    const t = 3 + frame / 60;
    for (const f of fires) f.age += 1 / 60;
    if (frame === 40) { fires[0].x += 12; fires[1].k = 1; } // one moves (furniture burning), one changes size
    const a = recorder(), b = recorder();
    drawFlames(a.ctx, fires, t, vis);
    reference(b.ctx, fires, t, vis);
    assert.deepEqual(a.calls, b.calls, `frame ${frame}`);
  }
});

test('flames: within a beat nothing is hashed again; a new beat hashes only the heights and leans', () => {
  const fires = [{ x: 10, y: 20, k: 1, age: 2 }, { x: 60, y: -40, k: 2, age: 2 }];
  const sin = Math.sin;
  let n = 0;
  Math.sin = (v) => { n++; return sin(v); };
  try {
    const { ctx } = recorder();
    drawFlames(ctx, fires, 5 / BEAT, () => true);
    n = 0;
    drawFlames(ctx, fires, 5 / BEAT + 0.01, () => true);
    assert.equal(n, 0, 'same beat: all kept');
    drawFlames(ctx, fires, 6 / BEAT + 0.01, () => true);
    assert.equal(n, 2 * (3 + 5), 'next beat: a height and a lean per tongue');
  } finally { Math.sin = sin; }
});

test('flames: a fire whose tongues cannot reach the picture is not drawn, one by its edge is', () => {
  const { ctx, calls } = recorder(200, 200, 0, 0); // the picture shows the world from (0, 0) to (200, 200)
  drawFlames(ctx, [{ x: -60, y: 100, k: 1, age: 3 }, { x: 100, y: 300, k: 1, age: 3 }], 1, () => true);
  assert.equal(calls.length, 0);
  drawFlames(ctx, [{ x: -8, y: 100, k: 1, age: 3 }], 1, () => true);
  assert.ok(calls.length > 0);
});

// particles of every drawn kind spread over a large area
function scatter(parts, rnd) {
  for (let i = 0; i < 400; i++) {
    const x = rnd() * 1200 - 600, y = rnd() * 1200 - 600, kind = i % 7;
    if (kind === 0) parts.list.push({ type: P.BLOOD, x, y, z: rnd() * 20, vx: rnd() * 300, vy: 0, size: 2, color: '#a00' });
    else if (kind === 1) parts.list.push({ type: P.MIST, x, y, size: 1, life: 0.3, maxLife: 0.5, color: '#a00' });
    else if (kind === 2) parts.list.push({ type: P.FIRE, x, y, size: 6, life: 0.3, maxLife: 0.5, heat: 0.1, h: rnd() * 30, lobe: 1 });
    else if (kind === 3) parts.list.push({ type: P.SMOKE, x, y, size: 8, life: 1, maxLife: 1.5, puff: true, h: rnd() * 40, tones: ['#111', '#222', '#333'], tone: 0, lobe: 2 });
    else if (kind === 4) parts.list.push({ type: P.SPARK, x, y, vx: 300, vy: -200, life: 0.1, maxLife: 0.2, color: '#ff0' });
    else if (kind === 5) parts.list.push({ type: P.EMBER, x, y, z: rnd() * 100, life: 0.5, maxLife: 1 });
    else parts.list.push({ type: P.CHIP, x, y, z: 4, size: 2, color: '#888' });
  }
}

test('particles: what lies off the picture is left out, what is on it is drawn exactly as before', () => {
  const world = { camera: { x: 0, y: 0 }, map: { solidAt: () => false } };
  const a = new Particles(world), b = new Particles(world);
  scatter(a, prng(11)); scatter(b, prng(11));
  // the picture: the world from (-100, -80) to (100, 80)
  const small = recorder(200, 160, -100, -80), all = recorder(4000, 4000, -2000, -2000);
  for (const m of ['draw', 'drawFire', 'drawGlow']) { a[m](small.ctx); b[m](all.ctx); }
  assert.ok(small.calls.length < all.calls.length / 3, `${small.calls.length} of ${all.calls.length}`);
  // every call drawn for the small picture is one of the full ones, in the same order; every full call left out
  // lands wholly outside the small picture
  const inside = (c) => {
    const [x, y, w, h] = c[0] === 'img' ? c.slice(2) : c.slice(3);
    return x + w > -100 && x < 100 && y + h > -80 && y < 80;
  };
  let j = 0;
  for (const c of all.calls) {
    if (j < small.calls.length && JSON.stringify(c) === JSON.stringify(small.calls[j])) { j++; continue; }
    assert.ok(!inside(c), `left out but on the picture: ${JSON.stringify(c)}`);
  }
  assert.equal(j, small.calls.length);
});

test('lighting: a shadow polygon is turned into a path once and reused, a new polygon gets its own', () => {
  const made = [];
  globalThis.Path2D = class { constructor() { this.pts = []; made.push(this); } lineTo(x, y) { this.pts.push(x, y); } closePath() { this.closed = true; } };
  try {
    const self = { paths: new WeakMap() }, clipped = [];
    const g = { clip: (p) => clipped.push(p) };
    const poly = [0, 0, 10, 0, 10, 10, 0, 10];
    Lighting.prototype.clipPoly.call(self, g, poly);
    Lighting.prototype.clipPoly.call(self, g, poly);
    assert.equal(made.length, 1);
    assert.deepEqual(made[0].pts, poly);
    assert.ok(made[0].closed);
    assert.equal(clipped[0], clipped[1]);
    Lighting.prototype.clipPoly.call(self, g, [0, 0, 5, 0, 5, 5]); // the light moved: its polygon was made anew
    assert.equal(made.length, 2);
    assert.equal(clipped[2], made[1]);
  } finally { delete globalThis.Path2D; }
});

test('lighting: a prop type\'s emissive map is looked up once and kept, a missing one too', () => {
  const self = { glows: new Map() };
  const a = Lighting.prototype.glowOf.call(self, 'no_such_prop');
  assert.equal(a, null);
  assert.ok(self.glows.has('no_such_prop'));
  self.glows.set('lamp', 'IMG');
  assert.equal(Lighting.prototype.glowOf.call(self, 'lamp'), 'IMG');
});
