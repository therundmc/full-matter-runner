// A coarse 2D fluid: the air of a level seen from above, as a "stable fluids" solver (Stam 1999). The flow lives on
// a grid of `cell` px cells (velocity in px/s); what it carries (a density: smoke) lives on a grid `sub` times finer,
// so the smoke keeps a finer edge than the flow that moves it. One step of the flow: vorticity confinement (gives
// the curls back that the coarse grid smooths away), semi-Lagrangian advection of the velocity, drag, then a
// pressure projection (Gauss-Seidel over-relaxed sweeps) that makes it divergence-free but for the `expand` sources
// (volume pushed in: a blast). One step of the density: MacCormack advection through that flow (sharper than plain
// semi-Lagrangian), a little diffusion, then its loss: what is over the cell's `rest` level decays at the cell's `loss` rate,
// what is under it comes back at `recover`.
// Solid cells (walls, a shut door, a pane) carry nothing and let nothing through. Only the cells of the `region`
// are stepped (the rooms about the player); the rest of the grid waits as it is. Typed arrays, no allocation per
// step. DOM-free.
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);

export default class Fluid {
  // w x h flow cells of `cell` px, density cells `sub` to a side in each
  constructor(w, h, cell, sub = 2) {
    this.w = w; this.h = h; this.cell = cell; this.sub = sub;
    this.W = w * sub; this.H = h * sub; this.fcell = cell / sub;
    const n = w * h, N = this.W * this.H;
    this.u = new Float32Array(n); this.v = new Float32Array(n);   // px/s
    this.u0 = new Float32Array(n); this.v0 = new Float32Array(n);
    this.p = new Float32Array(n); this.div = new Float32Array(n);
    this.curl = new Float32Array(n);
    this.expand = new Float32Array(n);  // volume sources, 1/s (decay with `expandFade`)
    this.solid = new Uint8Array(n);
    this.d = new Float32Array(N); this.d0 = new Float32Array(N);  // density, 0..~1
    this.hat = new Float32Array(N); this.lo = new Float32Array(N); this.hi = new Float32Array(N); // carrying scratch
    this.mvx = new Float32Array(N); this.mvy = new Float32Array(N);
    this.fsolid = new Uint8Array(N);
    this.rest = new Float32Array(N);    // the level the density settles to
    this.loss = new Float32Array(N);    // 1/s: how fast what is over the rest level goes
    this.keep = new Float32Array(N);    // exp(-loss dt), for the dt it was worked out for
    this.keepDt = -1;
    this.restK = 1;                     // scale of the rest levels (a power cut takes them down)
    this.recover = 0.05;                // 1/s back up to the rest level
    this.spread = 0;                    // px2/s of diffusion
    this.drag = 0.5;                    // 1/s
    this.vorticity = 0.3;               // confinement strength
    this.sweeps = 12;                   // pressure sweeps per step
    this.relax = 1.6;                   // over-relaxation of the sweeps
    this.expandFade = 6;                // 1/s
    this.region = { x0: 1, y0: 1, x1: w - 1, y1: h - 1 }; // flow cells stepped: [x0, x1) x [y0, y1)
    this.peak = 0;                      // highest density in the region after the last density step
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
        if (s) this.d[j] = 0;
      }
    }
    if (s) { this.u[i] = 0; this.v[i] = 0; }
  }

  setLoss(j, rate) { this.loss[j] = rate; this.keepDt = -1; }

  // the flow cells to step: those under the world rectangle (px), never the outer ring of the grid
  setRegion(x0, y0, x1, y1) {
    const c = this.cell, r = this.region;
    r.x0 = clampI(Math.floor(x0 / c), 1, this.w - 1); r.x1 = clampI(Math.ceil(x1 / c), r.x0, this.w - 1);
    r.y0 = clampI(Math.floor(y0 / c), 1, this.h - 1); r.y1 = clampI(Math.ceil(y1 / c), r.y0, this.h - 1);
  }

  // ---- sources (world px)

  // density laid in a disc of radius r, `amount` at its heart, fading to nothing at its rim
  addDensity(x, y, r, amount, cap = 2) {
    const f = this.fcell, W = this.W, rr = Math.max(r, f * 0.5);
    const x0 = clampI(Math.floor((x - rr) / f), 0, W - 1), x1 = clampI(Math.floor((x + rr) / f), 0, W - 1);
    const y0 = clampI(Math.floor((y - rr) / f), 0, this.H - 1), y1 = clampI(Math.floor((y + rr) / f), 0, this.H - 1);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const j = gy * W + gx;
        if (this.fsolid[j]) continue;
        const dx = (gx + 0.5) * f - x, dy = (gy + 0.5) * f - y, k = 1 - (dx * dx + dy * dy) / (rr * rr);
        if (k > 0) this.d[j] = Math.min(cap, this.d[j] + amount * k);
      }
    }
  }

  // a little density dropped at a point, shared out to the four nearest cells (what a thread of smoke leaves)
  deposit(x, y, amount) {
    const f = this.fcell, gx = x / f - 0.5, gy = y / f - 0.5, i = Math.floor(gx), j = Math.floor(gy);
    if (i < 0 || j < 0 || i >= this.W - 1 || j >= this.H - 1) return;
    const sx = gx - i, sy = gy - j, W = this.W, a = j * W + i, fs = this.fsolid, d = this.d;
    if (!fs[a]) d[a] += amount * (1 - sx) * (1 - sy);
    if (!fs[a + 1]) d[a + 1] += amount * sx * (1 - sy);
    if (!fs[a + W]) d[a + W] += amount * (1 - sx) * sy;
    if (!fs[a + W + 1]) d[a + W + 1] += amount * sx * sy;
  }

  // the air in a disc pulled toward the velocity (vx, vy): k = share of the way per call at the heart (0..1)
  push(x, y, r, vx, vy, k) {
    const c = this.cell, w = this.w;
    const x0 = clampI(Math.floor((x - r) / c), 1, w - 2), x1 = clampI(Math.floor((x + r) / c), 1, w - 2);
    const y0 = clampI(Math.floor((y - r) / c), 1, this.h - 2), y1 = clampI(Math.floor((y + r) / c), 1, this.h - 2);
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
    const x0 = clampI(Math.floor((x - r) / c), 1, w - 2), x1 = clampI(Math.floor((x + r) / c), 1, w - 2);
    const y0 = clampI(Math.floor((y - r) / c), 1, this.h - 2), y1 = clampI(Math.floor((y + r) / c), 1, this.h - 2);
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
    const x0 = clampI(Math.floor((x - r) / c), 1, w - 2), x1 = clampI(Math.floor((x + r) / c), 1, w - 2);
    const y0 = clampI(Math.floor((y - r) / c), 1, this.h - 2), y1 = clampI(Math.floor((y + r) / c), 1, this.h - 2);
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
    const gx = clampI(x / c - 0.5, 0, w - 1.001), gy = clampI(y / c - 0.5, 0, this.h - 1.001);
    const i = gx | 0, j = gy | 0, sx = gx - i, sy = gy - j, a = j * w + i;
    const u = this.u, v = this.v;
    out.x = (u[a] * (1 - sx) + u[a + 1] * sx) * (1 - sy) + (u[a + w] * (1 - sx) + u[a + w + 1] * sx) * sy;
    out.y = (v[a] * (1 - sx) + v[a + 1] * sx) * (1 - sy) + (v[a + w] * (1 - sx) + v[a + w + 1] * sx) * sy;
    return out;
  }

  densityAt(x, y) {
    const f = this.fcell, W = this.W;
    const gx = clampI(x / f - 0.5, 0, W - 1.001), gy = clampI(y / f - 0.5, 0, this.H - 1.001);
    const i = gx | 0, j = gy | 0, sx = gx - i, sy = gy - j, a = j * W + i, d = this.d;
    return (d[a] * (1 - sx) + d[a + 1] * sx) * (1 - sy) + (d[a + W] * (1 - sx) + d[a + W + 1] * sx) * sy;
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
        const bx = clampI(x - u0[i] * back, 0, w - 1.001), by = clampI(y - v0[i] * back, 0, this.h - 1.001);
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

  // one step of the density: carried by the flow, spread a little, lost down to its rest level
  carry(dt) {
    const { w, u, v, d, d0, hat, lo, hi, mvx, mvy, fsolid, rest, keep, W, sub, fcell } = this, r = this.region;
    if (dt !== this.keepDt) {
      for (let j = 0; j < keep.length; j++) keep[j] = Math.exp(-this.loss[j] * dt);
      this.keepDt = dt;
    }
    const fx0 = r.x0 * sub, fx1 = r.x1 * sub, fy0 = r.y0 * sub, fy1 = r.y1 * sub, toFlow = 1 / sub;
    if (fx1 <= fx0 || fy1 <= fy0) return;
    d0.set(d);
    hat.set(d);
    const back = dt / fcell, diff = Math.min(0.2, (this.spread * dt) / (fcell * fcell));
    // carried (MacCormack: a semi-Lagrangian step back along the flow, then one forward again to measure what the
    // first one smeared, half of which is given back, kept within what the cell was made from): sharp edges, curls
    // that stay; walls mirror the cell's own value
    for (let gy = fy0; gy < fy1; gy++) {
      // the flow sampled at the cell's centre: flow-cell coordinates of the density cell
      const cy = clampI((gy + 0.5) * toFlow - 0.5, 0, this.h - 1.001), iy = cy | 0, sy = cy - iy;
      for (let gx = fx0; gx < fx1; gx++) {
        const j = gy * W + gx;
        if (fsolid[j]) continue;
        const cx = clampI((gx + 0.5) * toFlow - 0.5, 0, w - 1.001), ix = cx | 0, sx = cx - ix, a = iy * w + ix;
        const ox = ((u[a] * (1 - sx) + u[a + 1] * sx) * (1 - sy) + (u[a + w] * (1 - sx) + u[a + w + 1] * sx) * sy) * back;
        const oy = ((v[a] * (1 - sx) + v[a + 1] * sx) * (1 - sy) + (v[a + w] * (1 - sx) + v[a + w + 1] * sx) * sy) * back;
        mvx[j] = ox; mvy[j] = oy;
        const bx = clampI(gx - ox, 0, W - 1.001), by = clampI(gy - oy, 0, this.H - 1.001), own = d0[j];
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
        const bx = clampI(gx + mvx[j], 0, W - 1.001), by = clampI(gy + mvy[j], 0, this.H - 1.001), own = hat[j];
        const jx = bx | 0, jy = by | 0, tx = bx - jx, ty = by - jy, b = jy * W + jx;
        const q00 = fsolid[b] ? own : hat[b], q10 = fsolid[b + 1] ? own : hat[b + 1];
        const q01 = fsolid[b + W] ? own : hat[b + W], q11 = fsolid[b + W + 1] ? own : hat[b + W + 1];
        const there = (q00 * (1 - tx) + q10 * tx) * (1 - ty) + (q01 * (1 - tx) + q11 * tx) * ty;
        const val = clampI(own + 0.5 * (d0[j] - there), lo[j], hi[j]);
        d[j] = val;
        before += d0[j];
        after += val;
      }
    }
    // that carrying is not conservative: what it made or lost is given back evenly; then the diffusion
    // (on what was there before the step: cheap, stable for diff < 0.25) and the loss down to the rest level
    const fix = after > 1e-6 ? clampI(before / after, 0.9, 1.1) : 1;
    const up = 1 - Math.exp(-this.recover * dt), restK = this.restK;
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
        const rs = rest[j] * restK;
        val = val > rs ? rs + (val - rs) * keep[j] : val + (rs - val) * up;
        d[j] = val;
        if (val > peak) peak = val;
      }
    }
    this.peak = peak;
    this.steps++;
  }
}
