// Liquid lying on a flat floor, seen from above: a height field on a grid of `cell` px cells ("virtual pipes"
// shallow water, after O'Brien & Hodgins 1995 and Mei et al. 2007). Each cell holds a depth of every kind of
// liquid (mm, `vol`, K kinds side by side; `dep` is their sum). Between two neighbouring cells a pipe carries a
// flux (mm/s of the cell's area, `fx` to the right, `fy` down) that has inertia: each step it is pushed by the
// difference of the two levels and slowed by the liquid's drag, so a gush runs on, sloshes and evens out.
// The level a cell pushes with is its floor (`z`, mm: kerbs, a road's camber, the floor's small bumps, hollows)
// plus only what stands over its film: a liquid holds together in a film (`film`, mm, per kind: surface tension)
// and a pool stops spreading once it is that thin at its edge. A cell under `stick` of its film no longer gives
// anything (the wet trail a flow leaves behind it). Outflows are scaled so a cell never gives more than it holds:
// the volume is kept exactly (but for what dries). Kinds mix by volume as they flow (blood into water turns it
// pink); a cell's film, drag, grip... are the mix of its kinds'.
// Drying (dry(), at a slower pace): each kind evaporates at its own rate (mm/s), the floor drinks (`soak`, mm/s: a
// carpet, a drain; times the kind's `drunk`, 1 if not given), down to `rest` (the rain's standing puddles never
// dry); a kind that `sets` (blood) does not evaporate but stops being wet `age` s after it was last fed and is
// handed over as a stain. Freshness (`fresh`, 1 at the source, carried with the flow, then fading) says how new the
// liquid in a cell is.
// Solid cells (walls, a shut door, a counter) hold their liquid frozen and let nothing through; the outer ring of
// the grid is solid. Only chunks of CH x CH cells that move are stepped (and their neighbours): a pool at rest
// sleeps. Typed arrays, no allocation per step. DOM-free.
export const CH = 16; // cells to a side of a chunk

export default class Shallow {
  // w x h cells of `cell` px; kinds: [{ film, flow, drag, dry, drunk, age, sets, stains, grip, slip }] (data/liquids.js)
  constructor(w, h, cell, kinds, opts = {}) {
    this.w = w; this.h = h; this.cell = cell;
    this.kinds = kinds;
    const K = (this.K = kinds.length), N = (this.N = w * h);
    this.vol = new Float32Array(N * K);   // mm of each kind
    this.dep = new Float32Array(N);       // mm in all
    this.fx = new Float32Array(N);        // mm/s from i to i + 1
    this.fy = new Float32Array(N);        // mm/s from i to i + w
    this.z = new Float32Array(N);         // floor level, mm
    this.solid = new Uint8Array(N);
    this.soak = new Float32Array(N);      // mm/s the floor drinks
    this.rest = new Float32Array(N);      // mm under which nothing dries
    this.fresh = new Float32Array(N);     // 0..1
    this.mark = new Float32Array(N);      // mm: the most a staining kind stood in it since it was last dry
    this.scale = new Float32Array(N);     // scratch: share of its outflows a cell can afford this step
    // the mix of its kinds, worked out when it changes
    this.film = new Float32Array(N); this.hold = new Float32Array(N); this.mob = new Float32Array(N);
    this.drag = new Float32Array(N); this.grip = new Float32Array(N).fill(1); this.slip = new Float32Array(N);
    this.dom = new Uint8Array(N).fill(255); // the kind there is most of (255: dry)
    this.k = opts.k ?? 140;               // 1/s2: how hard a difference of level drives the flux
    this.stick = opts.stick ?? 0.5;
    this.tiny = opts.tiny ?? 0.002;       // mm under which a cell is dry
    this.wake = opts.wake ?? 0.002;       // mm moved in a step that wakes a chunk
    this.sleep = opts.sleep ?? 12;        // still steps before a chunk sleeps
    this.thin = opts.thin ?? 1;           // a film drags this much more per film of thinness
    for (let x = 0; x < w; x++) { this.solid[x] = 1; this.solid[(h - 1) * w + x] = 1; }
    for (let y = 0; y < h; y++) { this.solid[y * w] = 1; this.solid[y * w + w - 1] = 1; }
    // chunks
    const cw = (this.cw = Math.ceil(w / CH)), chh = (this.ch = Math.ceil(h / CH)), C = cw * chh;
    this.awake = new Uint8Array(C);
    this.still = new Uint8Array(C);
    this.wet = new Uint8Array(C);         // has liquid (dried over by dry())
    this.seen = new Uint32Array(C);       // stamp of the step a chunk was last taken in
    this.ver = new Uint32Array(C);        // bumped when what it shows changed (render)
    this.moved = new Float32Array(C);     // mm moved in it this step
    this.active = []; this.next = []; this.proc = []; this.wetList = [];
    this.tick = 0;
  }

  // ---- set up

  chunkOf(i) { return Math.floor((i % this.w) / CH) + Math.floor(i / this.w / CH) * this.cw; }

  wakeChunk(c) {
    this.still[c] = 0;
    if (this.awake[c]) return;
    this.awake[c] = 1;
    this.next.push(c);
  }

  wetChunk(c) {
    if (this.wet[c]) return;
    this.wet[c] = 1;
    this.wetList.push(c);
  }

  setSolid(i, s) {
    if (this.solid[i] === s) return;
    const x = i % this.w, y = (i / this.w) | 0;
    if (!s && (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1)) return; // the outer ring stays shut
    this.solid[i] = s;
    this.fx[i] = 0; this.fy[i] = 0; this.fx[i - 1] = 0; this.fy[i - this.w] = 0;
    const c = this.chunkOf(i);
    this.ver[c]++;
    // opened: what it held runs out again, what stood against it runs in
    if (!s) for (const j of [i, i - 1, i + 1, i - this.w, i + this.w]) if (this.dep[j] > 0) this.wakeChunk(this.chunkOf(j));
  }

  // ---- what is poured (world px; an amount is mm x cells: a depth spread over that many cells)

  index(x, y) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    return cx < 0 || cy < 0 || cx >= this.w || cy >= this.h ? -1 : cy * this.w + cx;
  }

  // the nearest open cell to (x, y) within `reach` cells (-1: none): what is poured on a counter runs off it
  open(x, y, reach = 4) {
    const c = this.cell, cx = Math.floor(x / c), cy = Math.floor(y / c);
    for (let r = 0; r <= reach; r++) {
      let best = -1, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const gx = cx + dx, gy = cy + dy;
          if (gx < 1 || gy < 1 || gx >= this.w - 1 || gy >= this.h - 1) continue;
          const i = gy * this.w + gx;
          if (this.solid[i]) continue;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // `amount` of kind k into cell i, `fresh` that new
  addCell(i, amount, k, fresh = 1) {
    if (amount <= 0 || i < 0 || this.solid[i]) return 0;
    const d = this.dep[i];
    this.vol[i * this.K + k] += amount;
    this.dep[i] = d + amount;
    this.fresh[i] = (this.fresh[i] * d + fresh * amount) / (d + amount);
    this.mix(i);
    const c = this.chunkOf(i);
    this.wakeChunk(c);
    this.wetChunk(c);
    this.ver[c]++;
    return amount;
  }

  // `amount` of kind k spread over the open cells of a disc of radius r px (more at its heart); what falls on a
  // solid cell goes to the nearest open one. Returns what was poured.
  pour(x, y, r, amount, k, fresh = 1) {
    const c = this.cell, rr = Math.max(r, c * 0.5);
    const x0 = Math.max(1, Math.floor((x - rr) / c)), x1 = Math.min(this.w - 2, Math.floor((x + rr) / c));
    const y0 = Math.max(1, Math.floor((y - rr) / c)), y1 = Math.min(this.h - 2, Math.floor((y + rr) / c));
    let sum = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const i = gy * this.w + gx;
          if (this.solid[i]) continue;
          const dx = (gx + 0.5) * c - x, dy = (gy + 0.5) * c - y, q = 1 - (dx * dx + dy * dy) / (rr * rr);
          if (q <= 0) continue;
          if (pass === 0) sum += q;
          else this.addCell(i, (amount * q) / sum, k, fresh);
        }
      }
      if (!sum) return this.addCell(this.open(x, y), amount, k, fresh);
    }
    return amount;
  }

  // the liquid in a disc pushed toward (vx, vy) px/s: k = share of the way per call at its heart (0..1)
  push(x, y, r, vx, vy, k) {
    const c = this.cell, w = this.w, ux = vx / c, uy = vy / c;
    const x0 = Math.max(1, Math.floor((x - r) / c)), x1 = Math.min(w - 2, Math.floor((x + r) / c));
    const y0 = Math.max(1, Math.floor((y - r) / c)), y1 = Math.min(this.h - 2, Math.floor((y + r) / c));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const i = gy * w + gx, d = this.dep[i];
        if (d <= this.hold[i] || this.solid[i]) continue;
        const dx = (gx + 0.5) * c - x, dy = (gy + 0.5) * c - y, f = k * (1 - Math.sqrt(dx * dx + dy * dy) / r);
        if (f <= 0) continue;
        // a flux is a speed times a depth (cells/s x mm)
        if (ux > 0 ? !this.solid[i + 1] : !this.solid[i - 1]) {
          const e = ux > 0 ? i : i - 1;
          this.fx[e] += (ux * d - this.fx[e]) * f;
        }
        if (uy > 0 ? !this.solid[i + w] : !this.solid[i - w]) {
          const e = uy > 0 ? i : i - w;
          this.fy[e] += (uy * d - this.fy[e]) * f;
        }
        this.wakeChunk(this.chunkOf(i));
      }
    }
  }

  // ---- reading

  depthAt(x, y) {
    const i = this.index(x, y);
    return i < 0 || this.solid[i] ? 0 : this.dep[i];
  }

  // all the liquid there is (of kind k, or all kinds): what the tests check is kept
  total(k = -1) {
    let s = 0;
    if (k < 0) for (let i = 0; i < this.N; i++) s += this.dep[i];
    else for (let i = k; i < this.vol.length; i += this.K) s += this.vol[i];
    return s;
  }

  // a cell's mix of kinds: its film, drag, grip...
  mix(i) {
    const d = this.dep[i];
    if (d <= 0) {
      this.film[i] = 0; this.hold[i] = 0; this.mob[i] = 0; this.drag[i] = 0; this.grip[i] = 1; this.slip[i] = 0; this.dom[i] = 255;
      return;
    }
    const K = this.K, o = i * K, kinds = this.kinds;
    let fi = 0, mo = 0, dr = 0, gr = 0, sl = 0, best = 0, bv = -1;
    for (let k = 0; k < K; k++) {
      const v = this.vol[o + k];
      if (v <= 0) continue;
      const p = v / d, q = kinds[k];
      fi += p * q.film; mo += p * q.flow; dr += p * q.drag; gr += p * q.grip; sl += p * (q.slip ? 1 : 0);
      if (v > bv) { bv = v; best = k; }
    }
    this.film[i] = fi; this.hold[i] = fi * this.stick; this.mob[i] = mo; this.drag[i] = dr;
    this.grip[i] = gr; this.slip[i] = sl; this.dom[i] = best;
  }

  // ---- stepping

  // the chunks to take this step: those awake and their neighbours (whose edges they share)
  gather() {
    const t = ++this.tick, list = this.proc, cw = this.cw, chh = this.ch, seen = this.seen;
    list.length = 0;
    // the chunks woken since the last step join the awake ones
    for (const c of this.next) this.active.push(c);
    this.next.length = 0;
    for (const c of this.active) {
      const cx = c % cw, cy = (c / cw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= chh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= cw || (dx && dy)) continue;
          const n = y * cw + x;
          if (seen[n] !== t) { seen[n] = t; list.push(n); }
        }
      }
    }
    return list;
  }

  // One step of the flow over the moving chunks. True if anything was stepped.
  step(dt) {
    const list = this.gather();
    if (!list.length) return false;
    const { w, h, dep, fx, fy, z, solid, film, hold, mob, drag, scale, moved } = this, kd = this.k * dt;
    // 1. the fluxes on the edges each cell owns (right, down): pushed by the difference of level over the films,
    // slowed by the drag; none out of a cell that holds no more than what sticks
    for (const c of list) {
      const cx = (c % this.cw) * CH, cy = ((c / this.cw) | 0) * CH;
      const X0 = Math.max(1, cx), Y0 = Math.max(1, cy), X1 = Math.min(w - 1, cx + CH), Y1 = Math.min(h - 1, cy + CH);
      moved[c] = 0;
      for (let y = Y0; y < Y1; y++) {
        for (let x = X0; x < X1; x++) {
          const a = y * w + x, ha = dep[a];
          for (let e = 0; e < 2; e++) {
            const b = e ? a + w : a + 1, hb = dep[b], F = e ? fy : fx;
            if ((ha <= 0 && hb <= 0) || solid[a] || solid[b]) { F[a] = 0; continue; }
            // two wet cells even out their levels; a wet one runs onto a dry one only with more than its film
            let G, m, g, hm;
            if (ha > 0 && hb > 0) {
              G = z[a] + ha - z[b] - hb; m = (mob[a] + mob[b]) * 0.5; g = (drag[a] + drag[b]) * 0.5; hm = (ha + hb) * 0.5;
            } else if (ha > 0) {
              G = z[a] + ha - film[a] - z[b]; if (G < 0) G = 0; m = mob[a]; g = drag[a]; hm = ha;
            } else {
              G = z[a] - z[b] - hb + film[b]; if (G > 0) G = 0; m = mob[b]; g = drag[b]; hm = hb;
            }
            // a thin film drags far more than a deep flow (it is all against the floor)
            g *= 1 + (this.thin * (ha > 0 ? film[a] : film[b])) / (hm + 0.05);
            let f = (F[a] + kd * m * G) / (1 + dt * g);
            if (f > 0 ? ha <= hold[a] : hb <= hold[b]) f = 0;
            F[a] = f;
          }
        }
      }
    }
    // 2. what each cell can afford to give (its chunk and the ring of cells round it, whose edges were just set)
    for (const c of list) {
      const cx = (c % this.cw) * CH, cy = ((c / this.cw) | 0) * CH;
      const X0 = Math.max(1, cx - 1), Y0 = Math.max(1, cy - 1), X1 = Math.min(w - 1, cx + CH + 1), Y1 = Math.min(h - 1, cy + CH + 1);
      for (let y = Y0; y < Y1; y++) {
        for (let x = X0; x < X1; x++) {
          const i = y * w + x, d = dep[i];
          let out = 0;
          if (fx[i] > 0) out += fx[i];
          if (fx[i - 1] < 0) out -= fx[i - 1];
          if (fy[i] > 0) out += fy[i];
          if (fy[i - w] < 0) out -= fy[i - w];
          out *= dt;
          scale[i] = out > d ? (out > 0 ? d / out : 0) : 1;
        }
      }
    }
    // 3. the liquid moves along the edges, each kind in its share of the cell it leaves
    for (const c of list) {
      const cx = (c % this.cw) * CH, cy = ((c / this.cw) | 0) * CH;
      const X0 = Math.max(1, cx), Y0 = Math.max(1, cy), X1 = Math.min(w - 1, cx + CH), Y1 = Math.min(h - 1, cy + CH);
      for (let y = Y0; y < Y1; y++) {
        for (let x = X0; x < X1; x++) {
          const a = y * w + x;
          let f = fx[a];
          if (f !== 0) {
            f *= f > 0 ? scale[a] : scale[a + 1];
            fx[a] = f;
            if (f > 0) this.move(a, a + 1, f * dt, c); else this.move(a + 1, a, -f * dt, c);
          }
          f = fy[a];
          if (f !== 0) {
            f *= f > 0 ? scale[a] : scale[a + w];
            fy[a] = f;
            if (f > 0) this.move(a, a + w, f * dt, c); else this.move(a + w, a, -f * dt, c);
          }
        }
      }
    }
    // 4. the new mixes; chunks that hardly moved go to sleep (their fluxes let go)
    for (const c of list) {
      const cx = (c % this.cw) * CH, cy = ((c / this.cw) | 0) * CH;
      const X0 = Math.max(1, cx - 1), Y0 = Math.max(1, cy - 1), X1 = Math.min(w - 1, cx + CH + 1), Y1 = Math.min(h - 1, cy + CH + 1);
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (dep[y * w + x] > 0) this.mix(y * w + x);
    }
    const keep = this.next;
    for (const c of list) {
      if (moved[c] > this.wake) { this.ver[c]++; this.still[c] = 0; if (!this.awake[c]) { this.awake[c] = 1; keep.push(c); } continue; }
      if (moved[c] > 0) this.ver[c]++;
      if (!this.awake[c]) continue;
      if (++this.still[c] < this.sleep) continue;
      this.awake[c] = 0;
      const X0 = (c % this.cw) * CH, Y0 = ((c / this.cw) | 0) * CH;
      for (let y = Y0; y < Math.min(h, Y0 + CH); y++) for (let x = X0; x < Math.min(w, X0 + CH); x++) { fx[y * w + x] = 0; fy[y * w + x] = 0; }
    }
    // the awake ones go on (those just woken were put in `next`, taken at the next gather)
    const act = this.active;
    let n = 0;
    for (const c of act) if (this.awake[c]) act[n++] = c;
    act.length = n;
    return true;
  }

  // q mm from cell u to cell d (u's kinds in their shares), counted in chunk c
  move(u, d, q, c) {
    const hu = this.dep[u];
    if (hu <= 0 || q <= 0) return;
    const K = this.K, vol = this.vol, ou = u * K, od = d * K, r = q >= hu ? 1 : q / hu;
    let sent = 0;
    for (let k = 0; k < K; k++) {
      const m = vol[ou + k] * r;
      if (m <= 0) continue;
      vol[ou + k] -= m; vol[od + k] += m;
      sent += m;
    }
    const hd = this.dep[d];
    this.fresh[d] = (this.fresh[d] * hd + this.fresh[u] * sent) / (hd + sent);
    this.dep[u] = r === 1 ? 0 : hu - sent;
    if (r === 1) for (let k = 0; k < K; k++) vol[ou + k] = 0;
    this.dep[d] = hd + sent;
    this.moved[c] += sent;
    if (sent > this.wake) {
      const cd = this.chunkOf(d);
      if (cd !== c) { this.wakeChunk(cd); this.moved[cd] += sent; }
      this.wetChunk(cd);
    } else this.wetChunk(this.chunkOf(d));
  }

  // One pass of drying over every wet chunk, `dt` s since the last one. onDry(i, mm) is told of a cell that dried
  // or set with a staining kind in it (the most of it that stood there).
  dry(dt, onDry) {
    const { w, K, vol, dep, fresh, mark, soak, rest, kinds, dom, solid } = this;
    const list = this.wetList;
    let n = 0;
    for (const c of list) {
      const X0 = (c % this.cw) * CH, Y0 = ((c / this.cw) | 0) * CH;
      let wet = false, changed = false;
      for (let y = Y0; y < Math.min(this.h, Y0 + CH); y++) {
        for (let x = X0; x < Math.min(w, X0 + CH); x++) {
          const i = y * w + x, d = dep[i];
          if (d <= 0) continue;
          wet = true;
          if (solid[i]) continue;
          if (dom[i] === 255) this.mix(i);
          const o = i * K, q = kinds[dom[i]];
          const f0 = fresh[i];
          if (f0 > 0) fresh[i] = Math.max(0, f0 - dt / q.age);
          if ((f0 > 0.5) !== (fresh[i] > 0.5)) changed = true;
          // what stains: the most of it that has stood there
          let st = 0;
          for (let k = 0; k < K; k++) if (kinds[k].stains) st += vol[o + k];
          if (st > mark[i]) mark[i] = st;
          // a kind that sets (blood) is no longer wet once it has stood long enough: it is a stain now
          let gone = q.sets && fresh[i] <= 0;
          if (!gone) {
            const top = d - rest[i];
            if (top <= 0) continue;
            let loss = 0;
            for (let k = 0; k < K; k++) {
              const v = vol[o + k];
              if (v > 0) loss += (v / d) * (kinds[k].dry + soak[i] * (kinds[k].drunk ?? 1));
            }
            loss *= dt;
            if (loss <= 0) continue;
            const s = loss > top ? top / loss : 1;
            let left = 0;
            for (let k = 0; k < K; k++) {
              const v = vol[o + k];
              if (v <= 0) continue;
              const l = (v / d) * (kinds[k].dry + soak[i] * (kinds[k].drunk ?? 1)) * dt * s;
              vol[o + k] = v > l ? v - l : 0;
              left += vol[o + k];
            }
            dep[i] = left;
            changed = true;
            gone = left <= this.tiny && rest[i] <= 0;
            if (!gone) { this.mix(i); continue; }
          }
          if (mark[i] > 0 && onDry) onDry(i, mark[i]);
          for (let k = 0; k < K; k++) vol[o + k] = 0;
          dep[i] = 0; fresh[i] = 0; mark[i] = 0;
          this.fx[i] = 0; this.fy[i] = 0; this.fx[i - 1] = 0; this.fy[i - w] = 0;
          this.mix(i);
          changed = true;
        }
      }
      if (changed) this.ver[c]++;
      if (wet) list[n++] = c; else this.wet[c] = 0;
    }
    list.length = n;
  }
}
