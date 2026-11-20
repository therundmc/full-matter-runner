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
// The grid is sparse: a chunk's cells are only made (a slot of a pool of arrays, grown as needed) where liquid is or
// may run next: a chunk poured in and its neighbours, the chunks stepped and those they give to. A cell is named by
// its place on the whole grid (i = y * w + x); addr(i) is where a made cell's values are in the arrays (-1: not
// made, dry). What a new chunk's floor is comes from its owner (opts.floor: its level, what it drinks; opts.solid:
// what is solid on a cell not made), so a chunk let go (sweep: nothing in it, nothing wet or moving about it) is
// made again as it was. Slot 0 is the void: all dry and still, read for a neighbour not made, never written to.
export const CH = 16; // cells to a side of a chunk
const SH = 4, SA = 8, A = CH * CH, M = CH - 1; // log2 CH, log2 of a chunk's cells, its cells, the last row / column
const F32 = ['dep', 'fx', 'fy', 'z', 'soak', 'rest', 'fresh', 'mark', 'scale', 'film', 'hold', 'mob', 'drag', 'grip', 'slip'];

export default class Shallow {
  // w x h cells of `cell` px; kinds: [{ film, flow, drag, dry, drunk, age, sets, stains, grip, slip }] (data/liquids.js)
  // opts: the flow's numbers (k, stick, tiny, wake, sleep, thin), floor(S, c, a0): a chunk just made sets its cells'
  // z / soak (a0: its first cell's address, rows of CH), solid(i): whether a cell not made is solid (given, the
  // chunks emptied are let go by sweep()), slots: chunks the pool starts with
  constructor(w, h, cell, kinds, opts = {}) {
    this.w = w; this.h = h; this.cell = cell;
    this.kinds = kinds;
    this.K = kinds.length;
    this.N = w * h;
    this.k = opts.k ?? 140;               // 1/s2: how hard a difference of level drives the flux
    this.stick = opts.stick ?? 0.5;
    this.tiny = opts.tiny ?? 0.002;       // mm under which a cell is dry
    this.wake = opts.wake ?? 0.002;       // mm moved in a step that wakes a chunk
    this.sleep = opts.sleep ?? 12;        // still steps before a chunk sleeps
    this.thin = opts.thin ?? 1;           // a film drags this much more per film of thinness
    this.floor = opts.floor || null;
    this.solidOf = opts.solid || null;
    // chunks
    const cw = (this.cw = Math.ceil(w / CH)), chh = (this.ch = Math.ceil(h / CH)), C = cw * chh;
    this.awake = new Uint8Array(C);
    this.still = new Uint8Array(C);
    this.wet = new Uint8Array(C);         // has liquid (dried over by dry())
    this.seen = new Uint32Array(C);       // stamp of the step a chunk was last taken in
    this.ver = new Uint32Array(C);        // bumped when what it shows changed (render)
    this.moved = new Float32Array(C);     // mm moved in it this step
    this.slot = new Int32Array(C).fill(-1); // chunk -> its slot in the pool (-1: not made)
    this.active = []; this.next = []; this.proc = []; this.wetList = [];
    this.tick = 0;
    // the pool: per cell of a slot, vol (mm of each kind), dep (mm in all), fx / fy (mm/s to i + 1 / i + w), z (floor
    // level, mm), solid, soak (mm/s the floor drinks), rest (mm under which nothing dries), fresh (0..1), mark (mm:
    // the most a staining kind stood in it since it was last dry), scale (scratch: share of its outflows a cell can
    // afford this step); the mix of its kinds, worked out when it changes: film, hold, mob, drag, grip, slip, dom
    // (the kind there is most of, 255: dry)
    this.min = Math.max(2, opts.slots ?? 16);
    this.cap = 0;
    this.whose = new Int32Array(0);       // slot -> its chunk (-1: free)
    this.resize(this.min);
    this.solid.fill(1, 0, A);             // (the void)
    this.top = 1;                         // slots handed out so far (0: the void)
    this.free = [];
    this.count = 0;                       // chunks made
  }

  // ---- the pool

  // its arrays for n slots, what the first ones held kept
  resize(n) {
    const K = this.K, keep = Math.min(n, this.cap) * A;
    const make = (T, old, per = 1, v = 0) => {
      const a = new T(n * A * per);
      if (v) a.fill(v);
      if (old) a.set(old.subarray(0, keep * per));
      return a;
    };
    for (const f of F32) this[f] = make(Float32Array, this[f], 1, f === 'grip' ? 1 : 0);
    this.vol = make(Float32Array, this.vol, K);
    this.solid = make(Uint8Array, this.solid);
    this.dom = make(Uint8Array, this.dom, 1, 255);
    const own = new Int32Array(n).fill(-1);
    own.set(this.whose.subarray(0, Math.min(n, this.cap)));
    this.whose = own;
    this.cap = n;
  }

  // chunk c made: its slot, its cells dry and still, its floor as its owner says (the outer ring always solid)
  make(c) {
    let s = this.free.pop();
    if (s === undefined) {
      if (this.top >= this.cap) this.resize(this.cap * 2);
      s = this.top++;
    }
    this.slot[c] = s;
    this.whose[s] = c;
    this.count++;
    const a0 = s << SA, a1 = a0 + A, K = this.K;
    for (const f of F32) this[f].fill(f === 'grip' ? 1 : 0, a0, a1);
    this.vol.fill(0, a0 * K, a1 * K);
    this.dom.fill(255, a0, a1);
    const cx = (c % this.cw) * CH, cy = ((c / this.cw) | 0) * CH;
    for (let ly = 0; ly < CH; ly++) {
      for (let lx = 0; lx < CH; lx++) {
        const x = cx + lx, y = cy + ly;
        this.solid[a0 + (ly << SH) + lx] = x >= this.w || y >= this.h ? 1 : this.wall(y * this.w + x);
      }
    }
    this.floor?.(this, c, a0);
    return s;
  }

  // the first address of chunk c's cells (made if it is not)
  base(c) {
    const s = this.slot[c];
    return (s >= 0 ? s : this.make(c)) << SA;
  }

  // chunk c and its four neighbours made (what is in c may run or be pushed into them)
  around(c) {
    const cw = this.cw, x = c % cw, y = (c / cw) | 0;
    this.base(c);
    if (x > 0) this.base(c - 1);
    if (x + 1 < cw) this.base(c + 1);
    if (y > 0) this.base(c - cw);
    if (y + 1 < this.ch) this.base(c + cw);
  }

  // where cell i's values are (-1: its chunk is not made: dry)
  addr(i) {
    if (i < 0 || i >= this.N) return -1;
    const w = this.w, x = i % w, y = (i - x) / w, s = this.slot[(x >> SH) + (y >> SH) * this.cw];
    return s < 0 ? -1 : (s << SA) + ((y & M) << SH) + (x & M);
  }

  // ... made if it is not
  cellOf(i) {
    const w = this.w, x = i % w, y = (i - x) / w;
    return this.base((x >> SH) + (y >> SH) * this.cw) + ((y & M) << SH) + (x & M);
  }

  // is cell i solid (a cell not made: as its owner says; the outer ring always)
  solidAt(i) {
    const a = this.addr(i);
    return a >= 0 ? this.solid[a] : this.wall(i);
  }
  wall(i) {
    const w = this.w, x = i % w, y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === this.h - 1) return 1;
    return this.solidOf ? this.solidOf(i) : 0;
  }

  // Let go of the chunks with nothing in them (no liquid, no flux, no mark, no rest level) and nothing wet or moving
  // beside them; the pool is shrunk once it is mostly free. Only when the owner can say what is solid (opts.solid):
  // a chunk made again is then as it was. Returns how many were let go.
  sweep() {
    if (!this.solidOf) return 0;
    const cw = this.cw, chh = this.ch, busy = (n) => this.wet[n] || this.awake[n];
    let n = 0;
    for (let s = 1; s < this.top; s++) {
      const c = this.whose[s];
      if (c < 0 || busy(c)) continue;
      const x = c % cw, y = (c / cw) | 0;
      if ((x > 0 && busy(c - 1)) || (x + 1 < cw && busy(c + 1)) || (y > 0 && busy(c - cw)) || (y + 1 < chh && busy(c + cw))) continue;
      if (!this.empty(s)) continue;
      this.slot[c] = -1;
      this.whose[s] = -1;
      this.free.push(s);
      this.count--;
      n++;
    }
    if (n && (this.count + 1) * 4 <= this.cap && this.cap > this.min) this.compact();
    return n;
  }

  empty(s) {
    const a0 = s << SA, a1 = a0 + A, K = this.K, { dep, fx, fy, mark, rest, vol } = this;
    for (let a = a0; a < a1; a++) if (dep[a] !== 0 || fx[a] !== 0 || fy[a] !== 0 || mark[a] !== 0 || rest[a] !== 0) return false;
    for (let a = a0 * K; a < a1 * K; a++) if (vol[a] !== 0) return false;
    return true;
  }

  // the chunks made packed into the first slots, the pool cut to twice what they need
  compact() {
    let n = this.min;
    while (n < (this.count + 1) * 2) n *= 2;
    if (n >= this.cap) return;
    const K = this.K, old = {};
    for (const f of [...F32, 'vol', 'solid', 'dom']) old[f] = this[f];
    const whose = this.whose, top = this.top;
    this.cap = 0;
    this.whose = new Int32Array(0);
    this.resize(n);
    let t = 1;
    for (const f of [...F32, 'solid', 'dom']) this[f].set(old[f].subarray(0, A));
    for (let s = 1; s < top; s++) {
      const c = whose[s];
      if (c < 0) continue;
      for (const f of [...F32, 'solid', 'dom']) this[f].set(old[f].subarray(s << SA, (s + 1) << SA), t << SA);
      this.vol.set(old.vol.subarray((s << SA) * K, ((s + 1) << SA) * K), (t << SA) * K);
      this.slot[c] = t;
      this.whose[t] = c;
      t++;
    }
    this.top = t;
    this.free = [];
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

  // cell i made solid or opened. A cell whose chunk is not made is only made for it when the grid has no owner to say
  // what is solid (opts.solid): else the owner has already noted it, and only the chunk's version and the liquid about
  // it are told
  setSolid(i, s) {
    const w = this.w, x = i % w, y = (i / w) | 0;
    if (!s && (x === 0 || y === 0 || x === w - 1 || y === this.h - 1)) return; // the outer ring stays shut
    let a = this.addr(i);
    if (a < 0 && !this.solidOf) a = this.cellOf(i);
    if (a >= 0) {
      if (this.solid[a] === s) return;
      this.solid[a] = s;
      this.fx[a] = 0; this.fy[a] = 0;
      const l = this.addr(i - 1), u = this.addr(i - w);
      if (l >= 0) this.fx[l] = 0;
      if (u >= 0) this.fy[u] = 0;
    }
    this.ver[this.chunkOf(i)]++;
    // opened: what it held runs out again, what stood against it runs in
    if (!s) {
      for (const j of [i, i - 1, i + 1, i - w, i + w]) {
        const b = this.addr(j);
        if (b >= 0 && this.dep[b] > 0) this.wakeChunk(this.chunkOf(j));
      }
    }
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
          if (this.solidAt(i)) continue;
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
    if (amount <= 0 || i < 0 || this.solidAt(i)) return 0;
    const c = this.chunkOf(i);
    this.around(c);
    const a = this.addr(i), d = this.dep[a];
    this.vol[a * this.K + k] += amount;
    this.dep[a] = d + amount;
    this.fresh[a] = (this.fresh[a] * d + fresh * amount) / (d + amount);
    this.mix(a);
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
          if (this.solidAt(i)) continue;
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
    if (x1 < x0 || y1 < y0) return;
    // the chunks it touches made first (with the cells beside them: their edges are pushed too)
    for (let cy = (y0 - 1) >> SH; cy <= (y1 + 1) >> SH; cy++) {
      for (let cx = (x0 - 1) >> SH; cx <= (x1 + 1) >> SH; cx++) if (cx < this.cw && cy < this.ch) this.base(cy * this.cw + cx);
    }
    const { dep, hold, solid, fx, fy } = this;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const i = gy * w + gx, a = this.addr(i), d = dep[a];
        if (d <= hold[a] || solid[a]) continue;
        const dx = (gx + 0.5) * c - x, dy = (gy + 0.5) * c - y, f = k * (1 - Math.sqrt(dx * dx + dy * dy) / r);
        if (f <= 0) continue;
        // a flux is a speed times a depth (cells/s x mm)
        const l = this.addr(i - 1);
        if (ux > 0 ? !solid[this.addr(i + 1)] : !solid[l]) {
          const e = ux > 0 ? a : l;
          fx[e] += (ux * d - fx[e]) * f;
        }
        const u = this.addr(i - w);
        if (uy > 0 ? !solid[this.addr(i + w)] : !solid[u]) {
          const e = uy > 0 ? a : u;
          fy[e] += (uy * d - fy[e]) * f;
        }
        this.wakeChunk(this.chunkOf(i));
      }
    }
  }

  // ---- reading

  depthAt(x, y) {
    const a = this.addr(this.index(x, y));
    return a < 0 || this.solid[a] ? 0 : this.dep[a];
  }

  // mm of liquid in cell i (0 where nothing is made)
  depth(i) {
    const a = this.addr(i);
    return a < 0 ? 0 : this.dep[a];
  }

  // all the liquid there is (of kind k, or all kinds): what the tests check is kept
  total(k = -1) {
    let s = 0;
    const n = this.top << SA;
    if (k < 0) for (let a = 0; a < n; a++) s += this.dep[a];
    else for (let a = k; a < n * this.K; a += this.K) s += this.vol[a];
    return s;
  }

  // a cell's mix of kinds (a: its address): its film, drag, grip...
  mix(a) {
    const d = this.dep[a];
    if (d <= 0) {
      this.film[a] = 0; this.hold[a] = 0; this.mob[a] = 0; this.drag[a] = 0; this.grip[a] = 1; this.slip[a] = 0; this.dom[a] = 255;
      return;
    }
    const K = this.K, o = a * K, kinds = this.kinds;
    let fi = 0, mo = 0, dr = 0, gr = 0, sl = 0, best = 0, bv = -1;
    for (let k = 0; k < K; k++) {
      const v = this.vol[o + k];
      if (v <= 0) continue;
      const p = v / d, q = kinds[k];
      fi += p * q.film; mo += p * q.flow; dr += p * q.drag; gr += p * q.grip; sl += p * (q.slip ? 1 : 0);
      if (v > bv) { bv = v; best = k; }
    }
    this.film[a] = fi; this.hold[a] = fi * this.stick; this.mob[a] = mo; this.drag[a] = dr;
    this.grip[a] = gr; this.slip[a] = sl; this.dom[a] = best;
  }

  // ---- stepping

  // the chunks to take this step: those awake and their neighbours (whose edges they share); made, with the chunks
  // on their right and below (they own the edges into those)
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
    for (const c of list) {
      this.base(c);
      if (c % cw + 1 < cw) this.base(c + 1);
      if (((c / cw) | 0) + 1 < chh) this.base(c + cw);
    }
    return list;
  }

  // One step of the flow over the moving chunks. True if anything was stepped.
  step(dt) {
    const list = this.gather();
    if (!list.length) return false;
    const { w, h, cw, slot, dep, fx, fy, z, solid, film, hold, mob, drag, scale, moved } = this, kd = this.k * dt;
    // the first address of a chunk beside c (the void when it is not made: nothing there, nothing moving)
    const at = (n) => (slot[n] < 0 ? 0 : slot[n] << SA);
    // 1. the fluxes on the edges each cell owns (right, down): pushed by the difference of level over the films,
    // slowed by the drag; none out of a cell that holds no more than what sticks
    for (const c of list) {
      const cx = (c % cw) * CH, cy = ((c / cw) | 0) * CH, base = slot[c] << SA;
      const rB = cx + CH < w ? at(c + 1) : 0, dB = cy + CH < h ? at(c + cw) : 0;
      const X0 = Math.max(1, cx), Y0 = Math.max(1, cy), X1 = Math.min(w - 1, cx + CH), Y1 = Math.min(h - 1, cy + CH);
      moved[c] = 0;
      for (let y = Y0; y < Y1; y++) {
        const ly = y - cy, row = base + (ly << SH);
        for (let x = X0; x < X1; x++) {
          const lx = x - cx, a = row + lx, ha = dep[a];
          for (let e = 0; e < 2; e++) {
            const b = e ? (ly < M ? a + CH : dB + lx) : (lx < M ? a + 1 : rB + (ly << SH)), hb = dep[b], F = e ? fy : fx;
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
    // 2. what each cell can afford to give: the chunk's and those of the column on its right and the row below it
    // (it gives to them along its edges); a cell's outflows are on its own edges and on those of the cells on its
    // left and above
    const afford = (a, l, u) => {
      let out = 0;
      if (fx[a] > 0) out += fx[a];
      if (fx[l] < 0) out -= fx[l];
      if (fy[a] > 0) out += fy[a];
      if (fy[u] < 0) out -= fy[u];
      out *= dt;
      const d = dep[a];
      scale[a] = out > d ? (out > 0 ? d / out : 0) : 1;
    };
    for (const c of list) {
      const cx = (c % cw) * CH, cy = ((c / cw) | 0) * CH, base = slot[c] << SA;
      const X0 = Math.max(1, cx), Y0 = Math.max(1, cy), X1 = Math.min(w - 1, cx + CH), Y1 = Math.min(h - 1, cy + CH);
      const lB = cx > 0 ? at(c - 1) : 0, uB = cy > 0 ? at(c - cw) : 0;
      for (let y = Y0; y < Y1; y++) {
        const ly = y - cy, row = base + (ly << SH);
        for (let x = X0; x < X1; x++) {
          const lx = x - cx, a = row + lx;
          afford(a, lx ? a - 1 : lB + (ly << SH) + M, ly ? a - CH : uB + (M << SH) + lx);
        }
      }
      if (cx + CH <= w - 2) {
        const rB = at(c + 1), urB = cy > 0 ? at(c - cw + 1) : 0;
        for (let y = Y0; y < Y1; y++) {
          const ly = y - cy, a = rB + (ly << SH);
          afford(a, base + (ly << SH) + M, ly ? a - CH : urB + (M << SH));
        }
      }
      if (cy + CH <= h - 2) {
        const dB = at(c + cw), dlB = cx > 0 ? at(c + cw - 1) : 0;
        for (let x = X0; x < X1; x++) {
          const lx = x - cx, a = dB + lx;
          afford(a, lx ? a - 1 : dlB + M, base + (M << SH) + lx);
        }
      }
    }
    // 3. the liquid moves along the edges, each kind in its share of the cell it leaves
    for (const c of list) {
      const cx = (c % cw) * CH, cy = ((c / cw) | 0) * CH, base = slot[c] << SA;
      const rB = cx + CH < w ? at(c + 1) : 0, dB = cy + CH < h ? at(c + cw) : 0;
      const X0 = Math.max(1, cx), Y0 = Math.max(1, cy), X1 = Math.min(w - 1, cx + CH), Y1 = Math.min(h - 1, cy + CH);
      for (let y = Y0; y < Y1; y++) {
        const ly = y - cy, row = base + (ly << SH);
        for (let x = X0; x < X1; x++) {
          const lx = x - cx, a = row + lx;
          let f = fx[a];
          if (f !== 0) {
            const b = lx < M ? a + 1 : rB + (ly << SH);
            f *= f > 0 ? scale[a] : scale[b];
            fx[a] = f;
            if (f > 0) this.move(a, b, f * dt, c); else this.move(b, a, -f * dt, c);
          }
          f = fy[a];
          if (f !== 0) {
            const b = ly < M ? a + CH : dB + lx;
            f *= f > 0 ? scale[a] : scale[b];
            fy[a] = f;
            if (f > 0) this.move(a, b, f * dt, c); else this.move(b, a, -f * dt, c);
          }
        }
      }
    }
    // 4. the new mixes (of the cells it gave to or took from); chunks that hardly moved go to sleep (their fluxes let go)
    for (const c of list) {
      const cx = (c % cw) * CH, cy = ((c / cw) | 0) * CH, base = slot[c] << SA;
      const X0 = Math.max(1, cx), Y0 = Math.max(1, cy), X1 = Math.min(w - 1, cx + CH), Y1 = Math.min(h - 1, cy + CH);
      for (let y = Y0; y < Y1; y++) {
        const row = base + ((y - cy) << SH);
        for (let x = X0; x < X1; x++) if (dep[row + x - cx] > 0) this.mix(row + x - cx);
      }
      if (cx + CH <= w - 2) {
        const rB = at(c + 1);
        for (let y = Y0; y < Y1; y++) { const a = rB + ((y - cy) << SH); if (dep[a] > 0) this.mix(a); }
      }
      if (cy + CH <= h - 2) {
        const dB = at(c + cw);
        for (let x = X0; x < X1; x++) { const a = dB + x - cx; if (dep[a] > 0) this.mix(a); }
      }
    }
    const keep = this.next;
    for (const c of list) {
      if (moved[c] > this.wake) { this.ver[c]++; this.still[c] = 0; if (!this.awake[c]) { this.awake[c] = 1; keep.push(c); } continue; }
      if (moved[c] > 0) this.ver[c]++;
      if (!this.awake[c]) continue;
      if (++this.still[c] < this.sleep) continue;
      this.awake[c] = 0;
      const a0 = slot[c] << SA;
      fx.fill(0, a0, a0 + A);
      fy.fill(0, a0, a0 + A);
    }
    // the awake ones go on (those just woken were put in `next`, taken at the next gather)
    const act = this.active;
    let n = 0;
    for (const c of act) if (this.awake[c]) act[n++] = c;
    act.length = n;
    return true;
  }

  // q mm from cell u to cell d (addresses; u's kinds in their shares), counted in chunk c
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
    const cd = this.whose[d >> SA];
    if (sent > this.wake) {
      if (cd !== c) { this.wakeChunk(cd); this.moved[cd] += sent; }
      this.wetChunk(cd);
    } else this.wetChunk(cd);
  }

  // One pass of drying over every wet chunk, `dt` s since the last one. onDry(i, mm) is told of a cell that dried
  // or set with a staining kind in it (the most of it that stood there).
  dry(dt, onDry) {
    const { w, K, vol, dep, fresh, mark, soak, rest, kinds, dom, solid } = this;
    const list = this.wetList;
    let n = 0;
    for (const c of list) {
      const X0 = (c % this.cw) * CH, Y0 = ((c / this.cw) | 0) * CH, base = this.slot[c] << SA;
      let wet = false, changed = false;
      for (let y = Y0; y < Math.min(this.h, Y0 + CH); y++) {
        for (let x = X0; x < Math.min(w, X0 + CH); x++) {
          const a = base + ((y - Y0) << SH) + x - X0, d = dep[a];
          if (d <= 0) continue;
          wet = true;
          if (solid[a]) continue;
          if (dom[a] === 255) this.mix(a);
          const o = a * K, q = kinds[dom[a]];
          const f0 = fresh[a];
          if (f0 > 0) fresh[a] = Math.max(0, f0 - dt / q.age);
          if ((f0 > 0.5) !== (fresh[a] > 0.5)) changed = true;
          // what stains: the most of it that has stood there
          let st = 0;
          for (let k = 0; k < K; k++) if (kinds[k].stains) st += vol[o + k];
          if (st > mark[a]) mark[a] = st;
          // a kind that sets (blood) is no longer wet once it has stood long enough: it is a stain now
          let gone = q.sets && fresh[a] <= 0;
          if (!gone) {
            const top = d - rest[a];
            if (top <= 0) continue;
            let loss = 0;
            for (let k = 0; k < K; k++) {
              const v = vol[o + k];
              if (v > 0) loss += (v / d) * (kinds[k].dry + soak[a] * (kinds[k].drunk ?? 1));
            }
            loss *= dt;
            if (loss <= 0) continue;
            const s = loss > top ? top / loss : 1;
            let left = 0;
            for (let k = 0; k < K; k++) {
              const v = vol[o + k];
              if (v <= 0) continue;
              const l = (v / d) * (kinds[k].dry + soak[a] * (kinds[k].drunk ?? 1)) * dt * s;
              vol[o + k] = v > l ? v - l : 0;
              left += vol[o + k];
            }
            dep[a] = left;
            changed = true;
            gone = left <= this.tiny && rest[a] <= 0;
            if (!gone) { this.mix(a); continue; }
          }
          const i = y * w + x;
          if (mark[a] > 0 && onDry) onDry(i, mark[a]);
          for (let k = 0; k < K; k++) vol[o + k] = 0;
          dep[a] = 0; fresh[a] = 0; mark[a] = 0;
          this.fx[a] = 0; this.fy[a] = 0;
          const l = this.addr(i - 1), u = this.addr(i - w);
          if (l >= 0) this.fx[l] = 0;
          if (u >= 0) this.fy[u] = 0;
          this.mix(a);
          changed = true;
        }
      }
      if (changed) this.ver[c]++;
      if (wet) list[n++] = c; else this.wet[c] = 0;
    }
    list.length = n;
  }
}
