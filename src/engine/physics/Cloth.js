// A hung cloth (a curtain across a doorway) as a small position-based mesh, seen from above. It works in its own
// frame: `s` along the rod (0 at its middle), `n` out of the cloth's plane, `z` up from the floor. The top row are
// the rings: they slide along the rod (n and z held), with drag, a soft spring back to where they hang, never past
// their neighbours nor further apart than the heading lets them; the ring at each end of the rod is fixed. The
// cloth falls `drop` px under them in `rows - 1` links and is cut into `panels` side by side (two: it parts in the
// middle). Every link is a rope (it pulls, never pushes), so the cloth bunches as the rings close up and hangs
// straight under them at rest; the heading's pleats (`fold`: out, in, out the other way, in, every four columns)
// give it its folds. Gravity is real (in z): a lower point pushed out rises on its links and falls back, braked
// far harder on its way out and up than on its way back (`catch`): dead weight, it does not swing through.
// Colliders are upright cylinders in the same frame ({ s, n, vs, vn, r, top, speed }: a man, a body, a piece of
// debris): they push the points out of their disc, hand them only part of their speed (`give`: the cloth is dead
// weight) and hold them by friction (`grip`): the harder a point is pressed on, the more it sticks, so the cloth
// wraps round whoever pushes into it and slips off his sides and back once it only hangs on him. A collider that
// was touched is marked (`touch`). A rope stretched
// past `tear.stretch` by something faster than `tear.speed` tears (a body thrown through). Verlet on fixed
// sub-steps of `sub` s (an accumulator: one step of 2 dt is two of dt). Typed arrays, no allocation per step.
// DOM-free.
import { segSeg } from './Raycast.js';

export default class Cloth {
  // cfg: { len, panels, cols (per panel), rows, top, drop, fold, gravity, drag, catch, iters, sub,
  //        grip: { stick, slide, drape },
  //        give, slack, part, thick, jamb,
  //        ring: { w, drag, home, gap }, tear: { stretch, speed }, sight: { rows, gap } }
  constructor(cfg) {
    this.cfg = cfg;
    const { len, panels, cols, rows } = cfg;
    const C = this.C = panels * cols, R = this.R = rows, N = C * R;
    const f = () => new Float64Array(N);
    this.s = f(); this.n = f(); this.z = f(); this.ps = f(); this.pn = f(); this.pz = f();
    this.w = f();                          // inverse mass (0: fixed)
    this.home = new Float64Array(C);       // where each ring hangs at rest
    this.nr = new Float64Array(C);         // the pleat of each column (its ring's n)
    this.lo = new Float64Array(C); this.hi = new Float64Array(C); // how far each ring may slide
    this.panel = new Int32Array(C);
    this.cut = new Uint8Array(N);          // r * C + c: the rope across from column c at row r is torn
    this.pen = f();                        // how far each point was pushed into a collider this sub-step
    const pw = len / panels, sp = this.sp = (pw - 1) / (cols - 1);
    for (let c = 0; c < C; c++) {
      const p = this.panel[c] = Math.floor(c / cols), j = c % cols, l0 = -len / 2 + p * pw;
      this.home[c] = l0 + 0.5 + j * sp;
      this.nr[c] = [-1, 0, 1, 0][j % 4] * cfg.fold;
      this.lo[c] = l0 + 0.5; this.hi[c] = l0 + pw - 0.5;
    }
    const dz = cfg.drop / (rows - 1);
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        this.w[i] = r ? 1 : c === 0 || c === C - 1 ? 0 : cfg.ring.w;
      }
    }
    // ropes: down the drop (v), across a panel (h, below the rings), and the two diagonals of each cell (d)
    this.links = [];
    const rest = (a, b) => Math.hypot(this.home[a % C] - this.home[b % C], this.nr[a % C] - this.nr[b % C], dz * (Math.floor(a / C) - Math.floor(b / C)));
    const link = (a, b, kind, row, pair) => this.links.push({ a, b, rest: rest(a, b), kind, row, pair, broken: false });
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c, same = c + 1 < C && this.panel[c + 1] === this.panel[c];
        if (r + 1 < R) link(i, i + C, 'v', r, c);
        if (r && same) link(i, i + 1, 'h', r, c);
        if (r + 1 < R && same) { link(i, i + C + 1, 'd', r, c); link(i + 1, i + C, 'd', r, c); }
      }
    }
    this.acc = 0;
    this.version = 0;    // bumped by every step that moved it (the drawing's cache)
    this.touched = null; // the last collider in contact (sub-step), null when none
    this.rest();
  }

  // hanging still, as hung
  rest() {
    const { C, R } = this, dz = this.cfg.drop / (R - 1);
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        this.s[i] = this.ps[i] = this.home[c];
        this.n[i] = this.pn[i] = this.nr[c];
        this.z[i] = this.pz[i] = this.cfg.top - r * dz;
      }
    }
    // let it find its own sag under gravity (a few seconds), then still
    for (let k = 0; k < 4 / this.cfg.sub; k++) this.sub(this.cfg.sub, [], 0);
    this.ps.set(this.s); this.pn.set(this.n); this.pz.set(this.z);
    this.hung = this.s.slice(0, C); // where its rings rest, the cloth's weight on them
    this.version++;
  }

  // advance dt s (whole sub-steps; the remainder waits for the next call)
  step(dt, colliders = []) {
    const h = this.cfg.sub;
    this.acc += dt;
    let k = Math.floor(this.acc / h + 1e-9);
    this.acc -= k * h;
    if (k > 8) k = 8; // a long hitch is not caught up
    this.touched = null;
    for (let i = 0; i < k; i++) this.sub(h, colliders, (k - 1 - i) * h);
    if (k) this.version++;
  }

  sub(h, colliders, back) {
    const cfg = this.cfg, { C, s, n, z, ps, pn, pz, w, pen } = this, N = s.length, top = cfg.top - 1, half = cfg.len / 2 - 0.5, jamb = cfg.jamb;
    const damp = Math.exp(-cfg.drag * h), held = Math.exp(-(cfg.drag + cfg.catch) * h), ringDamp = Math.exp(-cfg.ring.drag * h), g = cfg.gravity * h * h;
    for (let i = 0; i < N; i++) {
      if (!w[i]) continue;
      if (i < C) {
        // a ring: along the rod only, braked by it, drawn back to its place
        const v = (s[i] - ps[i]) * ringDamp - cfg.ring.home * (s[i] - this.home[i]) * h * h;
        ps[i] = s[i]; s[i] += v;
        continue;
      }
      // braked hard going away from where it hangs (out of its plane, or up) and hardly coming back: heavy, it is
      // barely carried off and falls back into place without swinging through
      const un = n[i] - pn[i], uz = z[i] - pz[i];
      const vs = (s[i] - ps[i]) * damp, vn = un * ((n[i] - this.nr[i % C]) * un > 0 ? held : damp), vz = uz * (uz > 0 ? held : damp);
      ps[i] = s[i]; pn[i] = n[i]; pz[i] = z[i];
      s[i] += vs; n[i] += vn; z[i] += vz - g;
    }
    // where the colliders were at this sub-step (they are given where they end the frame)
    const cols = colliders.map((c) => ({ c, s: c.s - c.vs * back, n: c.n - c.vn * back, rr: c.r + cfg.thick }));
    for (const q of cols) if (q.c.speed > cfg.tear.speed) this.tear(q, true); // driven through it: it gives
    pen.fill(0);
    for (let it = 0; it < cfg.iters; it++) {
      for (const l of this.links) {
        if (l.broken) continue;
        const { a, b } = l, ds = s[b] - s[a], dn = n[b] - n[a], dz = z[b] - z[a];
        const d = Math.sqrt(ds * ds + dn * dn + dz * dz);
        if (d <= l.rest) continue; // a rope: slack when shorter
        const wa = w[a], wb = w[b], sum = wa + wb;
        if (!sum) continue;
        const k = (d - l.rest) / (d * sum);
        s[a] += ds * k * wa; n[a] += dn * k * wa; z[a] += dz * k * wa;
        s[b] -= ds * k * wb; n[b] -= dn * k * wb; z[b] -= dz * k * wb;
      }
      this.rings();
      for (const q of cols) {
        for (let i = C; i < N; i++) {
          if (z[i] > q.c.top) continue;
          const ds = s[i] - q.s, dn = n[i] - q.n, d2 = ds * ds + dn * dn;
          if (d2 >= q.rr * q.rr) continue;
          const d = Math.sqrt(d2);
          pen[i] += q.rr - d;
          if (d < 1e-6) { n[i] = q.n + (pn[i] >= q.n ? q.rr : -q.rr); continue; }
          s[i] = q.s + (ds / d) * q.rr; n[i] = q.n + (dn / d) * q.rr;
        }
      }
      for (let i = C; i < N; i++) {
        if (z[i] < 0) z[i] = 0; // the hem on the floor
        else if (z[i] > top) z[i] = top; // never over the rod
        if (n[i] < jamb && n[i] > -jamb) { if (s[i] < -half) s[i] = -half; else if (s[i] > half) s[i] = half; } // the jambs
      }
    }
    // a point touched leaves the collider at only part of its speed (velvet is dead weight, it is not shot off),
    // sticks to it by friction as hard as it was pressed on (else slides, braked), slips aside a little at his gap
    // (a split curtain opens there), and may tear
    const out = cfg.slack * h, { stick, slide } = cfg.grip, lay = cfg.grip.drape * h;
    for (const q of cols) {
      const c = q.c, reach = q.rr + 0.5, cs = c.vs * h, cn = c.vn * h;
      let hit = false;
      for (let i = C; i < N; i++) {
        if (z[i] > c.top) continue;
        const ds = s[i] - q.s, dn = n[i] - q.n, d = Math.hypot(ds, dn);
        if (d > reach || d < 1e-6) continue;
        hit = true;
        const rs = ds / d, rn = dn / d, ts = -rn, tn = rs;
        // friction: its slide along his surface this sub-step (against his own) is taken off whole while under
        // `stick` x the push it got (and its weight laid on him, `drape`), else braked by `slide` x the push
        const rel = (s[i] - ps[i] - cs) * ts + (n[i] - pn[i] - cn) * tn, a = Math.abs(rel);
        if (a > 1e-9) {
          const k = a <= pen[i] * stick + lay ? rel : rel * ((pen[i] * slide + lay) / a);
          s[i] -= ts * k; n[i] -= tn * k;
        }
        const over = (s[i] - ps[i]) * rs + (n[i] - pn[i]) * rn - Math.max(0, (cs * rs + cn * rn) * cfg.give) - out;
        if (over > 0) { ps[i] += rs * over; pn[i] += rn * over; }
        // and it parts round him: slides off to the side of his way it lies on, slowly
        if (c.speed > 1) {
          const ws = -c.vn / c.speed, wn = c.vs / c.speed, side = ds * ws + dn * wn;
          const k = (side > 0.01 ? 1 : side < -0.01 ? -1 : s[i] >= 0 ? (ws >= 0 ? 1 : -1) : ws >= 0 ? -1 : 1) * Math.min(1, c.speed / 100) * cfg.part * h;
          s[i] += ws * k; n[i] += wn * k; ps[i] += ws * k * 0.7; pn[i] += wn * k * 0.7; // little of it kept as speed
        }
      }
      if (!hit) continue;
      this.touched = c;
      c.touch = true;
      if (c.speed > cfg.tear.speed) this.tear(q, false);
    }
  }

  // the rings stay on the rod, in order, no closer than `gap` nor further apart than the heading's pleat
  rings() {
    const { C, s, n, z, w } = this, top = this.cfg.top, gap = this.cfg.ring.gap, sp = this.sp;
    for (let c = 0; c < C; c++) {
      n[c] = this.nr[c]; z[c] = top;
      if (s[c] < this.lo[c]) s[c] = this.lo[c];
      else if (s[c] > this.hi[c]) s[c] = this.hi[c];
    }
    const pair = (a) => {
      const b = a + 1, d = s[b] - s[a], wa = w[a], wb = w[b], sum = wa + wb;
      const off = d < gap ? d - gap : d > sp ? d - sp : 0;
      if (!off || !sum) return;
      s[a] += (off * wa) / sum; s[b] -= (off * wb) / sum;
    };
    for (let c = 0; c + 1 < C; c++) if (this.panel[c] === this.panel[c + 1]) pair(c);
    for (let c = C - 2; c >= 0; c--) if (this.panel[c] === this.panel[c + 1]) pair(c);
  }

  // ropes across that something fast is driven through (`punch`: the rope lies across its disc, below its top) or
  // that it stretched far give way, and the diagonals of their cells with them
  tear(q, punch) {
    const { s, n, z } = this, lim = this.cfg.tear.stretch, near = q.rr + 4, top = q.c.top;
    for (const l of this.links) {
      if (l.broken || l.kind !== 'h') continue;
      const a = l.a, b = l.b;
      if (punch) {
        if (z[a] > top || z[b] > top) continue;
        const ds = s[b] - s[a], dn = n[b] - n[a], ll = ds * ds + dn * dn;
        const t = ll ? Math.max(0, Math.min(1, ((q.s - s[a]) * ds + (q.n - n[a]) * dn) / ll)) : 0;
        if (Math.hypot(s[a] + ds * t - q.s, n[a] + dn * t - q.n) > q.rr * 0.7) continue;
      } else {
        if (Math.hypot(s[b] - s[a], n[b] - n[a], z[b] - z[a]) < l.rest * lim) continue;
        if (Math.hypot(s[a] - q.s, n[a] - q.n) > near && Math.hypot(s[b] - q.s, n[b] - q.n) > near) continue;
      }
      l.broken = true;
      this.cut[l.row * this.C + l.pair] = 1;
      for (const m of this.links) if (m.kind === 'd' && m.pair === l.pair && (m.row === l.row || m.row === l.row - 1)) m.broken = true;
    }
  }

  // whether the rope across between columns c and c + 1 at row r is torn (or there is none: two panels)
  open(r, c) {
    if (this.panel[c] !== this.panel[c + 1]) return true;
    return this.cut[r * this.C + c] === 1;
  }

  // a shove (px/s along s, n) to the points within `radius` of (s0, n0), less further out: a round going by, a blast
  push(s0, n0, vs, vn, radius) {
    const { C, s, n, ps, pn } = this, h = this.cfg.sub;
    for (let i = C; i < s.length; i++) {
      const d = Math.hypot(s[i] - s0, n[i] - n0);
      if (d >= radius) continue;
      const k = (1 - d / radius) * h;
      ps[i] -= vs * k; pn[i] -= vn * k;
    }
  }

  // how far the furthest ring is from where it rests, px (they creep back slowly: still is not home yet)
  drift() {
    let d = 0;
    for (let c = 0; c < this.C; c++) d = Math.max(d, Math.abs(this.s[c] - this.hung[c]));
    return d;
  }

  // mean squared speed of its points, (px/s)^2
  energy() {
    const { s, n, z, ps, pn, pz } = this, h = this.cfg.sub;
    let e = 0;
    for (let i = 0; i < s.length; i++) e += (s[i] - ps[i]) ** 2 + (n[i] - pn[i]) ** 2 + (z[i] - pz[i]) ** 2;
    return e / (s.length * h * h);
  }

  // does the cloth hide the segment (local frame)? Each of the `sight.rows` (the height of a man's body) is a line
  // from one end of the rod to the other: a panel's row, then a bridge over any gap narrower than `sight.gap` to the
  // next one (the other panel, a torn piece, the jamb). A row the segment gets through without crossing it is a
  // way to see through.
  blocks(a0, b0, a1, b1) {
    const { C, s, n } = this, cfg = this.cfg, half = cfg.len / 2, g2 = cfg.sight.gap * cfg.sight.gap;
    for (const r of cfg.sight.rows) {
      let hit = false, ls = -half, ln = 0; // the last point of the line so far (the rod's end to begin with)
      let joined = false;                  // whether that last point is joined to the next by cloth
      const cross = (x0, y0, x1, y1) => segSeg(a0, b0, a1, b1, x0, y0, x1, y1) !== null;
      for (let c = 0; c <= C && !hit; c++) {
        const i = r * C + c, ps = c < C ? s[i] : half, pn = c < C ? n[i] : 0;
        if (joined || (ps - ls) ** 2 + (pn - ln) ** 2 < g2) hit = cross(ls, ln, ps, pn);
        ls = ps; ln = pn;
        joined = c + 1 < C && !this.open(r, c);
      }
      if (!hit) return false;
    }
    return true;
  }
}
