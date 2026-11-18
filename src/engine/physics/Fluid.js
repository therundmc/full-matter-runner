// A coarse 2D fluid: the air of a level seen from above, as a "stable fluids" solver (Stam 1999). The flow lives on
// a grid of `cell` px cells (velocity in px/s); what it carries lives on a grid `sub` times finer, so it keeps a
// finer edge than the flow that moves it. One step of the flow: vorticity confinement (gives the curls back that the
// coarse grid smooths away), semi-Lagrangian advection of the velocity, drag, then a pressure projection
// (Gauss-Seidel over-relaxed sweeps) that makes it divergence-free but for the `expand` sources (volume pushed in: a
// blast). What it carries comes in `kinds` (each its own density: in the game grey smoke, black soot, white powder,
// steam), all moved by the same flow. One step of a kind: MacCormack advection (sharper than plain semi-Lagrangian),
// a little diffusion (its `spread`), then its loss: what is over the cell's rest level decays at the kind's rate for
// the cell's `place` (a room keeps it, the open air takes it), what is under it comes back at `recover`. A kind with
// nothing in the stepped region is not carried at all.
// Solid cells (walls, a shut door, a pane) carry nothing and let nothing through. Only the cells of the `region`
// are stepped (the rooms about the player); the rest of the grid waits as it is. Typed arrays, no allocation per
// step. DOM-free.
import { clamp } from '../math.js';
const EMPTY = 1e-3; // a kind whose densest cell in the region is under this is left as it is

export default class Fluid {
  // w x h flow cells of `cell` px, density cells `sub` to a side in each, `kinds` densities carried, `places` kinds
  // of place (each kind loses what it carries at its own rate in each)
  constructor(w, h, cell, sub = 2, kinds = 1, places = 2) {
    this.w = w; this.h = h; this.cell = cell; this.sub = sub;
    this.W = w * sub; this.H = h * sub; this.fcell = cell / sub;
    const n = w * h, N = this.W * this.H;
    this.u = new Float32Array(n); this.v = new Float32Array(n);   // px/s
    this.u0 = new Float32Array(n); this.v0 = new Float32Array(n);
    this.p = new Float32Array(n); this.div = new Float32Array(n);
    this.curl = new Float32Array(n);
    this.expand = new Float32Array(n);  // volume sources, 1/s (decay with `expandFade`)
    this.solid = new Uint8Array(n);
    this.d0 = new Float32Array(N);      // carrying scratch, shared by the kinds
    this.hat = new Float32Array(N); this.lo = new Float32Array(N); this.hi = new Float32Array(N);
    this.mvx = new Float32Array(N); this.mvy = new Float32Array(N);
    this.fsolid = new Uint8Array(N);
    this.place = new Uint8Array(N);     // the kind of place of each density cell (0..places-1)
    // each kind: its density (0..~1), the level it settles to (`rest`, made by setRest: none = 0), its loss per
    // place (1/s, of what is over the rest level), how fast it comes back up to the rest level (1/s), its diffusion
    // (px2/s), its densest cell in the region after its last step (raised at once by what is added)
    this.kinds = Array.from({ length: kinds }, () => ({
      d: new Float32Array(N), rest: null, loss: new Float32Array(places), keep: new Float32Array(places), keepDt: -1,
      recover: 0.05, spread: 0, peak: 0,
    }));
    this.d = this.kinds[0].d;           // the first kind's density
    this.restK = 1;                     // scale of the rest levels (a power cut takes them down)
    this.drag = 0.5;                    // 1/s
    this.vorticity = 0.3;               // confinement strength
    this.sweeps = 12;                   // pressure sweeps per step
    this.relax = 1.6;                   // over-relaxation of the sweeps
    this.expandFade = 6;                // 1/s
    this.region = { x0: 1, y0: 1, x1: w - 1, y1: h - 1 }; // flow cells stepped: [x0, x1) x [y0, y1)
    this.peak = 0;                      // highest density of any kind in the region after the last step
    this.steps = 0;                     // density steps taken (a drawing of it is good until the next one)
  }

  // ---- set up

  setSolid(i, s) {
    if (this.solid[i] === s) return;
    this.solid[i] = s;
    const { w, sub, W } = this, cx = (i % w) * sub, cy = ((i / w) | 0) * sub;
    for (let y = 0; y < sub; y++) {
      for (let x = 0; x < sub; x++) {
        const j = (cy + y) * W + cx + x;
        this.fsolid[j] = s;
        if (s) for (const K of this.kinds) K.d[j] = 0;
      }
    }
    if (s) { this.u[i] = 0; this.v[i] = 0; }
  }

  // kind k's loss rate (1/s) in place c
  setLoss(k, c, rate) { const K = this.kinds[k]; K.loss[c] = rate; K.keepDt = -1; }

  // the level kind k settles back to in density cell j
  setRest(k, j, level) {
    const K = this.kinds[k];
    K.rest ||= new Float32Array(this.W * this.H);
    K.rest[j] = level;
  }

  // the flow cells to step: those under the world rectangle (px), never the outer ring of the grid
  setRegion(x0, y0, x1, y1) {
    const c = this.cell, r = this.region;
    r.x0 = clamp(Math.floor(x0 / c), 1, this.w - 1); r.x1 = clamp(Math.ceil(x1 / c), r.x0, this.w - 1);
    r.y0 = clamp(Math.floor(y0 / c), 1, this.h - 1); r.y1 = clamp(Math.ceil(y1 / c), r.y0, this.h - 1);
  }

  // ---- sources (world px)

  // density of kind k laid in a disc of radius r, `amount` at its heart, fading to nothing at its rim; no cell is
  // made denser than `cap` by it
  addDensity(x, y, r, amount, k = 0, cap = 2) {
    const f = this.fcell, W = this.W, rr = Math.max(r, f * 0.5), K = this.kinds[k], d = K.d;
    const x0 = clamp(Math.floor((x - rr) / f), 0, W - 1), x1 = clamp(Math.floor((x + rr) / f), 0, W - 1);
    const y0 = clamp(Math.floor((y - rr) / f), 0, this.H - 1), y1 = clamp(Math.floor((y + rr) / f), 0, this.H - 1);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const j = gy * W + gx;
        if (this.fsolid[j]) continue;
        const dx = (gx + 0.5) * f - x, dy = (gy + 0.5) * f - y, q = 1 - (dx * dx + dy * dy) / (rr * rr);
        if (q > 0 && d[j] < cap) d[j] = Math.min(cap, d[j] + amount * q);
      }
    }
    K.peak = Math.max(K.peak, Math.min(cap, amount));
  }

  // a little density of kind k dropped at a point, shared out to the four nearest cells (what a thread of smoke
  // leaves)
  deposit(x, y, amount, k = 0) {
    const f = this.fcell, gx = x / f - 0.5, gy = y / f - 0.5, i = Math.floor(gx), j = Math.floor(gy);
    if (i < 0 || j < 0 || i >= this.W - 1 || j >= this.H - 1) return;
    const sx = gx - i, sy = gy - j, W = this.W, a = j * W + i, fs = this.fsolid, K = this.kinds[k], d = K.d;
    K.peak = Math.max(K.peak, amount);
    if (!fs[a]) d[a] += amount * (1 - sx) * (1 - sy);
    if (!fs[a + 1]) d[a + 1] += amount * sx * (1 - sy);
    if (!fs[a + W]) d[a + W] += amount * (1 - sx) * sy;
    if (!fs[a + W + 1]) d[a + W + 1] += amount * sx * sy;
  }

  // the air in a disc pulled toward the velocity (vx, vy): k = share of the way per call at the heart (0..1)
  push(x, y, r, vx, vy, k) {
    const c = this.cell, w = this.w;
    const x0 = clamp(Math.floor((x - r) / c), 1, w - 2), x1 = clamp(Math.floor((x + r) / c), 1, w - 2);
    const y0 = clamp(Math.floor((y - r) / c), 1, this.h - 2), y1 = clamp(Math.floor((y + r) / c), 1, this.h - 2);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * w + cx;
        if (this.solid[i]) continue;
        const dx = (cx + 0.5) * c - x, dy = (cy + 0.5) * c - y, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        const f = k * (1 - Math.sqrt(d2) / r);
        this.u[i] += (vx - this.u[i]) * f; this.v[i] += (vy - this.v[i]) * f;
      }
    }
  }

  // the air in a disc set turning about its centre at `omega` rad/s (capped at `vmax` px/s), k as in push()
  swirl(x, y, r, omega, vmax, k) {
    const c = this.cell, w = this.w;
    const x0 = clamp(Math.floor((x - r) / c), 1, w - 2), x1 = clamp(Math.floor((x + r) / c), 1, w - 2);
    const y0 = clamp(Math.floor((y - r) / c), 1, this.h - 2), y1 = clamp(Math.floor((y + r) / c), 1, this.h - 2);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * w + cx;
        if (this.solid[i]) continue;
        const dx = (cx + 0.5) * c - x, dy = (cy + 0.5) * c - y, d = Math.hypot(dx, dy);
        if (d >= r || d < 1e-3) continue;
        const s = Math.min(vmax, omega * d) / d, f = k * (1 - d / r);
        this.u[i] += (-dy * s - this.u[i]) * f; this.v[i] += (dx * s - this.v[i]) * f;
      }
    }
  }

  // volume pushed into the air in a disc (rate in 1/s, negative: drawn out of it)
  addExpand(x, y, r, rate) {
    const c = this.cell, w = this.w;
    const x0 = clamp(Math.floor((x - r) / c), 1, w - 2), x1 = clamp(Math.floor((x + r) / c), 1, w - 2);
    const y0 = clamp(Math.floor((y - r) / c), 1, this.h - 2), y1 = clamp(Math.floor((y + r) / c), 1, this.h - 2);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * w + cx, dx = (cx + 0.5) * c - x, dy = (cy + 0.5) * c - y;
        if (!this.solid[i] && dx * dx + dy * dy < r * r) this.expand[i] += rate;
      }
    }
  }

  // ---- sampling (world px)

  // the flow at (x, y), bilinear, written into out { x, y }
  velocityAt(x, y, out) {
    const c = this.cell, w = this.w;
    const gx = clamp(x / c - 0.5, 0, w - 1.001), gy = clamp(y / c - 0.5, 0, this.h - 1.001);
    const i = gx | 0, j = gy | 0, sx = gx - i, sy = gy - j, a = j * w + i;
    const u = this.u, v = this.v;
    out.x = (u[a] * (1 - sx) + u[a + 1] * sx) * (1 - sy) + (u[a + w] * (1 - sx) + u[a + w + 1] * sx) * sy;
    out.y = (v[a] * (1 - sx) + v[a + 1] * sx) * (1 - sy) + (v[a + w] * (1 - sx) + v[a + w + 1] * sx) * sy;
    return out;
  }

  // kind k's density at (x, y), bilinear
  densityAt(x, y, k = 0) {
    const f = this.fcell, W = this.W;
    const gx = clamp(x / f - 0.5, 0, W - 1.001), gy = clamp(y / f - 0.5, 0, this.H - 1.001);
    const i = gx | 0, j = gy | 0, sx = gx - i, sy = gy - j, a = j * W + i, d = this.kinds[k].d;
    return (d[a] * (1 - sx) + d[a + 1] * sx) * (1 - sy) + (d[a + W] * (1 - sx) + d[a + W + 1] * sx) * sy;
  }

  // how far (px) along the segment the air is thick: where the densities weighted by `weights` (one per kind, 0
  // for a kind that does not count) add up to `thick` or more, sampled once per density cell crossed; it stops
  // counting at `enough`
  thickAlong(x0, y0, x1, y1, weights, thick, enough = Infinity) {
    const f = this.fcell, W = this.W, len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / f)), ds = len / n;
    let out = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const gx = clamp(Math.floor((x0 + (x1 - x0) * t) / f), 0, W - 1), gy = clamp(Math.floor((y0 + (y1 - y0) * t) / f), 0, this.H - 1);
      const j = gy * W + gx;
      let s = 0;
      for (let k = 0; k < weights.length; k++) if (weights[k]) s += this.kinds[k].d[j] * weights[k];
      if (s >= thick && (out += ds) >= enough) return out;
    }
    return out;
  }

  // ---- stepping

  // one step of the flow
  flow(dt) {
    const { w, u, v, u0, v0, solid, cell } = this, { x0, y0, x1, y1 } = this.region;
    if (x1 <= x0 || y1 <= y0) return;
    // vorticity confinement: a push along the gradient of |curl| turned a quarter, which keeps the eddies alive
    if (this.vorticity > 0) {
      const curl = this.curl, half = 0.5 / cell;
      for (let y = y0 - 1; y < y1 + 1; y++) {
        if (y < 1 || y >= this.h - 1) continue;
        for (let x = Math.max(1, x0 - 1); x < Math.min(w - 1, x1 + 1); x++) {
          const i = y * w + x;
          curl[i] = ((v[i + 1] - v[i - 1]) - (u[i + w] - u[i - w])) * half;
        }
      }
      const eps = this.vorticity * cell * dt;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          if (solid[i]) continue;
          const nx = Math.abs(curl[i + 1]) - Math.abs(curl[i - 1]), ny = Math.abs(curl[i + w]) - Math.abs(curl[i - w]);
          const l = Math.hypot(nx, ny);
          if (l < 1e-6) continue;
          const k = (eps * curl[i]) / l;
          u[i] += ny * k; v[i] -= nx * k;
        }
      }
    }
    // advection of the velocity by itself
    u0.set(u); v0.set(v);
    const back = dt / cell, damp = Math.exp(-this.drag * dt);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        const bx = clamp(x - u0[i] * back, 0, w - 1.001), by = clamp(y - v0[i] * back, 0, this.h - 1.001);
        const ix = bx | 0, iy = by | 0, sx = bx - ix, sy = by - iy, a = iy * w + ix;
        u[i] = ((u0[a] * (1 - sx) + u0[a + 1] * sx) * (1 - sy) + (u0[a + w] * (1 - sx) + u0[a + w + 1] * sx) * sy) * damp;
        v[i] = ((v0[a] * (1 - sx) + v0[a + 1] * sx) * (1 - sy) + (v0[a + w] * (1 - sx) + v0[a + w + 1] * sx) * sy) * damp;
      }
    }
    this.project(dt);
  }

  // make the flow divergence-free (but for the volume sources): solve for the pressure, take its gradient off
  project(dt) {
    const { w, u, v, p, div, solid, cell, expand } = this, { x0, y0, x1, y1 } = this.region;
    const half = 0.5 / cell, h2 = cell * cell;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        div[i] = solid[i] ? 0 : ((u[i + 1] - u[i - 1]) + (v[i + w] - v[i - w])) * half - expand[i];
      }
    }
    // a solid neighbour mirrors the cell's own pressure (no flow through a wall)
    const om = this.relax;
    for (let k = 0; k < this.sweeps; k++) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          if (solid[i]) continue;
          let s = 0, n = 0;
          if (!solid[i - 1]) { s += p[i - 1]; n++; }
          if (!solid[i + 1]) { s += p[i + 1]; n++; }
          if (!solid[i - w]) { s += p[i - w]; n++; }
          if (!solid[i + w]) { s += p[i + w]; n++; }
          if (!n) continue;
          p[i] += om * ((s - div[i] * h2) / n - p[i]);
        }
      }
    }
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (solid[i]) { u[i] = 0; v[i] = 0; continue; }
        const pi = p[i];
        u[i] -= ((solid[i + 1] ? pi : p[i + 1]) - (solid[i - 1] ? pi : p[i - 1])) * half;
        v[i] -= ((solid[i + w] ? pi : p[i + w]) - (solid[i - w] ? pi : p[i - w])) * half;
      }
    }
    const fade = Math.exp(-this.expandFade * dt);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) expand[y * w + x] *= fade;
  }

  // one step of what the air carries: each kind carried by the flow, spread a little, lost down to its rest level
  carry(dt) {
    const { w, u, v, mvx, mvy, fsolid, W, sub } = this, r = this.region;
    const fx0 = r.x0 * sub, fx1 = r.x1 * sub, fy0 = r.y0 * sub, fy1 = r.y1 * sub, toFlow = 1 / sub;
    if (fx1 <= fx0 || fy1 <= fy0) return;
    // the way back along the flow from each density cell's centre (in density cells), the same for every kind
    const back = dt / this.fcell;
    for (let gy = fy0; gy < fy1; gy++) {
      const cy = clamp((gy + 0.5) * toFlow - 0.5, 0, this.h - 1.001), iy = cy | 0, sy = cy - iy;
      for (let gx = fx0; gx < fx1; gx++) {
        const j = gy * W + gx;
        if (fsolid[j]) continue;
        const cx = clamp((gx + 0.5) * toFlow - 0.5, 0, w - 1.001), ix = cx | 0, sx = cx - ix, a = iy * w + ix;
        mvx[j] = ((u[a] * (1 - sx) + u[a + 1] * sx) * (1 - sy) + (u[a + w] * (1 - sx) + u[a + w + 1] * sx) * sy) * back;
        mvy[j] = ((v[a] * (1 - sx) + v[a + 1] * sx) * (1 - sy) + (v[a + w] * (1 - sx) + v[a + w + 1] * sx) * sy) * back;
      }
    }
    let peak = 0;
    for (const K of this.kinds) {
      // nothing of it here (it may have come in with the region, from cells that were not stepped: looked for)
      if (K.peak < EMPTY && !K.rest && this.densest(K.d) < EMPTY) { K.peak = 0; continue; }
      this.carryKind(K, dt, fx0, fx1, fy0, fy1);
      peak = Math.max(peak, K.peak);
    }
    this.peak = peak;
    this.steps++;
  }

  // the densest cell of d in the stepped region
  densest(d) {
    const W = this.W, sub = this.sub, r = this.region;
    let m = 0;
    for (let gy = r.y0 * sub; gy < r.y1 * sub; gy++) {
      for (let j = gy * W + r.x0 * sub, e = gy * W + r.x1 * sub; j < e; j++) if (d[j] > m) m = d[j];
    }
    return m;
  }

  carryKind(K, dt, fx0, fx1, fy0, fy1) {
    const { d0, hat, lo, hi, mvx, mvy, fsolid, place, W } = this, d = K.d, rest = K.rest, keep = K.keep;
    if (dt !== K.keepDt) {
      for (let c = 0; c < keep.length; c++) keep[c] = Math.exp(-K.loss[c] * dt);
      K.keepDt = dt;
    }
    d0.set(d);
    hat.set(d);
    const diff = Math.min(0.2, (K.spread * dt) / (this.fcell * this.fcell));
    // carried (MacCormack: a semi-Lagrangian step back along the flow, then one forward again to measure what the
    // first one smeared, half of which is given back, kept within what the cell was made from): sharp edges, curls
    // that stay; walls mirror the cell's own value
    for (let gy = fy0; gy < fy1; gy++) {
      for (let gx = fx0; gx < fx1; gx++) {
        const j = gy * W + gx;
        if (fsolid[j]) continue;
        const bx = clamp(gx - mvx[j], 0, W - 1.001), by = clamp(gy - mvy[j], 0, this.H - 1.001), own = d0[j];
        const jx = bx | 0, jy = by | 0, tx = bx - jx, ty = by - jy, b = jy * W + jx;
        const q00 = fsolid[b] ? own : d0[b], q10 = fsolid[b + 1] ? own : d0[b + 1];
        const q01 = fsolid[b + W] ? own : d0[b + W], q11 = fsolid[b + W + 1] ? own : d0[b + W + 1];
        hat[j] = (q00 * (1 - tx) + q10 * tx) * (1 - ty) + (q01 * (1 - tx) + q11 * tx) * ty;
        lo[j] = Math.min(q00, q10, q01, q11); hi[j] = Math.max(q00, q10, q01, q11);
      }
    }
    let before = 0, after = 0;
    for (let gy = fy0; gy < fy1; gy++) {
      for (let gx = fx0; gx < fx1; gx++) {
        const j = gy * W + gx;
        if (fsolid[j]) continue;
        const bx = clamp(gx + mvx[j], 0, W - 1.001), by = clamp(gy + mvy[j], 0, this.H - 1.001), own = hat[j];
        const jx = bx | 0, jy = by | 0, tx = bx - jx, ty = by - jy, b = jy * W + jx;
        const q00 = fsolid[b] ? own : hat[b], q10 = fsolid[b + 1] ? own : hat[b + 1];
        const q01 = fsolid[b + W] ? own : hat[b + W], q11 = fsolid[b + W + 1] ? own : hat[b + W + 1];
        const there = (q00 * (1 - tx) + q10 * tx) * (1 - ty) + (q01 * (1 - tx) + q11 * tx) * ty;
        const val = clamp(own + 0.5 * (d0[j] - there), lo[j], hi[j]);
        d[j] = val;
        before += d0[j];
        after += val;
      }
    }
    // that carrying is not conservative: what it made or lost is given back evenly; then the diffusion
    // (on what was there before the step: cheap, stable for diff < 0.25) and the loss down to the rest level
    const fix = after > 1e-6 ? clamp(before / after, 0.9, 1.1) : 1;
    const up = 1 - Math.exp(-K.recover * dt), restK = this.restK;
    let peak = 0;
    for (let gy = fy0; gy < fy1; gy++) {
      for (let gx = fx0; gx < fx1; gx++) {
        const j = gy * W + gx;
        if (fsolid[j]) continue;
        let val = d[j] * fix;
        if (diff > 0) {
          const own = d0[j];
          let s = 0, n = 0;
          if (!fsolid[j - 1]) { s += d0[j - 1]; n++; }
          if (!fsolid[j + 1]) { s += d0[j + 1]; n++; }
          if (!fsolid[j - W]) { s += d0[j - W]; n++; }
          if (!fsolid[j + W]) { s += d0[j + W]; n++; }
          val += diff * (s - n * own);
        }
        const rs = rest ? rest[j] * restK : 0;
        val = val > rs ? rs + (val - rs) * keep[place[j]] : val + (rs - val) * up;
        d[j] = val;
        if (val > peak) peak = val;
      }
    }
    K.peak = peak;
  }
}
