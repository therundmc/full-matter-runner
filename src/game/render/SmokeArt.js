// Canvas side of the air (systems/Smoke.js, SMOKE in data/atmosphere.js) and of the mist of a rainy night
// (RAIN.mist). What is in the air is never a veil laid over the picture: the densities of its kinds are sampled into
// buffers at the light map's size (a texel = 2 world px, on the world's grid), added up into an opacity cut into
// flat bands (pixel-art steps, crisp wavering edges, no blur, no dither), each kind capped (`look.max`: what is in it still
// reads), walls left clear. The colour of a band is the mix of the kinds in it. Like real smoke it both lights up
// and veils, each kind its own way (SMOKE.kinds[].look):
// - glow: the light it scatters, multiplied twice by the light map (where a lamp shines the smoke glows in its colour,
//   the dark stays clear), screened over the scene;
// - pale: the white of powder and steam, lit once by the light map (it shows wherever there is a little light);
// - veil: what it takes off the scene where it is lit (multiplied);
// - soot: what it takes off whatever the light (black smoke is black in the dark too).
// The threads of the cigarettes, butts and hot barrels are drawn with the scene, before the light, a world pixel at
// a time.
import { TILE } from '../Config.js';
import { SMOKE, RAIN } from '../data/atmosphere.js';
import { shown } from '../fx/Particles.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

// a canvas with its pixels (ImageData) and a 32-bit view of them
function buffer(w, h) {
  const c = canvas(w, h), img = c.getContext('2d').createImageData(c.width, c.height);
  return { c, img, px: new Uint32Array(img.data.buffer) };
}

const rgb = (r, g, b) => 0xff000000 | (Math.min(255, Math.round(b * 255)) << 16) | (Math.min(255, Math.round(g * 255)) << 8) | Math.min(255, Math.round(r * 255));
const BLACK = rgb(0, 0, 0), WHITE = rgb(1, 1, 1);
const ch = (v) => (v >= 1 ? 255 : v <= 0 ? 0 : (v * 255) | 0);
const pack = (r, g, b) => (0xff000000 | (ch(b) << 16) | (ch(g) << 8) | ch(r)) >>> 0; // rgb() without the rounding, for the many
const MIXED = 0.05; // in bands: a kind under this at a texel is as good as not there
const LOOKS = Object.values(SMOKE.kinds).map((K) => ({ ...K.look, pale: K.look.pale || [0, 0, 0] }));

// what ruffles the edges of the bands: a smooth wavy noise -0.5..0.5 over a 64 x 64 texel tile that wraps (lattice
// of 8 texels, an octave of 4 on top), laid on the world's grid: the edges wander as contours, they are never
// speckled (no dither)
const RAG = (() => {
  const N = 64, L = 8, n = N / L, lat = [];
  let h = 0x2545f491;
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  for (let i = 0; i < n * n * 5; i++) lat.push(rnd());
  const at = (x, y, m, o) => lat[o + ((y % m + m) % m) * m + ((x % m + m) % m)];
  const vn = (x, y, cell, o) => {
    const m = N / cell, gx = x / cell, gy = y / cell, i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = at(i, j, m, o) + (at(i + 1, j, m, o) - at(i, j, m, o)) * su, b = at(i, j + 1, m, o) + (at(i + 1, j + 1, m, o) - at(i, j + 1, m, o)) * su;
    return a + (b - a) * sv;
  };
  const t = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = vn(x, y, L, 0) * 2 + vn(x, y, L / 2, n * n);
  let lo = Infinity, hi = -Infinity;
  for (const v of t) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < t.length; i++) t[i] = (t[i] - lo) / (hi - lo) - 0.5; // stretched to -0.5..0.5
  return t;
})();

export default class SmokeArt {
  constructor(world) {
    this.world = world;
    this.glow = null;    // the light it scatters
    this.pale = null;    // the white of powder and steam
    this.veil = null;    // what it takes off the scene where it is lit
    this.soot = null;    // what it takes off whatever the light (1 - that)
    this.cols = null;    // per texel column: density cell left of it, share of the next one, its own cell, its tile
    this.rows = null;    // per kind, the softened rows of density cells under the view (in bands)
    this.lines = LOOKS.map(() => null); // per kind, a row of density mixed between two of those rows
    this.sum = null;     // those rows added up
    this.soft = null;    // a row being softened
    this.v = new Float32Array(LOOKS.length); // each kind's share of a texel
    this.luts = LOOKS.map(() => null); // each kind's look band by band (bands())
    this.ctx = { row: 0, ry: 0, ownRow: 0, skyRow: -1, hot: false }; // what a row being painted needs (fill -> paintOne / paintMix)
    this.act = [];       // the kinds there is something of
    this.key = { steps: -1, x0: 0, y0: 0, w: 0, h: 0, mist: 0, kinds: '', got: null }; // what the pixels show
    this.warmed = false; // drawn once at the first frame, nothing or not: the graphics card prepares each way of
                         // drawing the first time it meets it (a hitch), better then than at the first shot fired
  }

  // its buffers let go (World.dispose)
  dispose() {
    for (const b of [this.glow, this.pale, this.veil, this.soot]) if (b) b.c.width = b.c.height = 0;
    this.glow = this.pale = this.veil = this.soot = null;
  }

  // the threads (cigarettes, butts, hot barrels), with the scene (the light falls on them like on the rest): a world
  // pixel each, swelling to two as they spread, fading
  drawThreads(ctx, smoke, vis) {
    const T = smoke?.rib;
    if (!T?.n) return;
    const S = SMOKE.cig, R = shown(ctx), m = 2 + S.grow; // (a thread is a few px at most)
    ctx.fillStyle = S.color;
    for (let i = 0; i < T.n; i++) {
      const x = T.x[i], y = T.y[i];
      if (!vis(x, y) || x < R[0] - m || x > R[2] + m || y < R[1] - m || y > R[3] + m) continue;
      const k = T.age[i] / T.life[i], a = T.a[i] * Math.min(1, k * 10) * (1 - k) * (1 - k);
      if (a < 0.01) continue;
      const s = Math.round(1 + k * S.grow);
      ctx.globalAlpha = a;
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
  }

  // what is in the air and the mist, lit. After Lighting.apply (its light map and view are this frame's).
  draw(ctx, lighting) {
    const w = this.world, F = w.smoke?.fluid, step = SMOKE.look.step, mist = RAIN.mist * (w.weather?.k || 0);
    // the kinds there is enough of to show a band
    const act = this.act;
    act.length = 0;
    if (F) F.kinds.forEach((K, k) => { if (K.peak * LOOKS[k].gain >= step * SMOKE.look.from * 0.5) act.push(k); });
    const first = !this.warmed;
    if ((!act.length && !mist && !first) || !lighting.lm) return;
    this.warmed = true;
    // the buffers are the light map's size (it only grows: Lighting.setView), the part in use its part in use, TW x TH
    const lm = lighting.lm, { x0, y0, w: vw, h: vh } = lighting.view, TW = lighting.tw, TH = lighting.th;
    if (!this.glow || this.glow.c.width !== lm.width || this.glow.c.height !== lm.height) {
      this.dispose();
      const CW = lm.width, CH = lm.height;
      this.glow = buffer(CW, CH);
      this.pale = buffer(CW, CH);
      this.veil = buffer(CW, CH);
      this.soot = buffer(CW, CH);
      this.cols = { j: new Int32Array(CW), s: new Float32Array(CW), own: new Int32Array(CW), tile: new Int32Array(CW) };
      this.key.w = -1; // new buffers: filled again
    }
    if (F && (!this.sum || this.sum.length < F.W + 2)) {
      this.sum = new Float32Array(F.W + 2);
      this.soft = new Float32Array(F.W + 4);
      this.lines = LOOKS.map(() => new Float32Array(F.W + 2));
    }
    // the density only changes when the smoke steps (every other frame): the pixels are kept till then, or till the
    // view moves
    const key = this.key, kinds = act.join();
    if (first || key.steps !== (F?.steps ?? -1) || key.x0 !== x0 || key.y0 !== y0 || key.w !== TW || key.h !== TH || key.mist !== mist || key.kinds !== kinds) {
      key.got = this.fill(F, act, mist, x0, y0, vw / TW, vh / TH, TW, TH);
      Object.assign(key, { steps: F?.steps ?? -1, x0, y0, w: TW, h: TH, mist, kinds });
    }
    const got = key.got;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (got.veil || got.soot || first) {
      // the veil: how much it takes off, times the light there, turned into what is left (1 - that); what soot
      // takes off whatever the light multiplied in; the whole multiplied over the scene
      const v = this.veil.c.getContext('2d');
      v.putImageData(this.veil.img, 0, 0, 0, 0, TW, TH);
      v.globalCompositeOperation = 'multiply';
      v.drawImage(lm, 0, 0, TW, TH, 0, 0, TW, TH);
      v.globalCompositeOperation = 'difference';
      v.fillStyle = '#fff';
      v.fillRect(0, 0, TW, TH);
      if (got.soot || first) {
        this.soot.c.getContext('2d').putImageData(this.soot.img, 0, 0, 0, 0, TW, TH);
        v.globalCompositeOperation = 'multiply';
        v.drawImage(this.soot.c, 0, 0, TW, TH, 0, 0, TW, TH);
      }
      v.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.veil.c, 0, 0, TW, TH, x0, y0, vw, vh);
    }
    // the light: the glow lit by the light map twice (a lamp lights its smoke fully, the night ambient hardly at
    // all), the white of powder and steam once: (glow x lm + pale) x lm
    const g = this.glow.c.getContext('2d');
    g.putImageData(this.glow.img, 0, 0, 0, 0, TW, TH);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(lm, 0, 0, TW, TH, 0, 0, TW, TH);
    if (got.pale || first) {
      this.pale.c.getContext('2d').putImageData(this.pale.img, 0, 0, 0, 0, TW, TH);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.pale.c, 0, 0, TW, TH, 0, 0, TW, TH);
      g.globalCompositeOperation = 'multiply';
    }
    g.drawImage(lm, 0, 0, TW, TH, 0, 0, TW, TH);
    g.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.glow.c, 0, 0, TW, TH, x0, y0, vw, vh);
    ctx.restore();
  }

  // one kind's look band by band (band 0: nothing): what a texel of it alone shows at each band, packed (the glow
  // with and without the mist), and which buffers it puts something in (`got`: 1 veil, 2 pale, 4 soot)
  bands(k, m) {
    const l = LOOKS[k], step = SMOKE.look.step, top = Math.ceil(l.max / step) + 1, T = this.luts[k];
    if (T && T.m === m) return T;
    const n = top + 1, t = { m, top, glow: new Uint32Array(n), misty: new Uint32Array(n), pale: new Uint32Array(n), veil: new Uint32Array(n), soot: new Uint32Array(n), got: new Uint8Array(n) };
    const hasPale = l.pale[0] + l.pale[1] + l.pale[2] > 0;
    for (let q = 0; q <= top; q++) {
      const A = Math.min(q * step, l.max);
      t.glow[q] = rgb(l.glow[0] * A, l.glow[1] * A, l.glow[2] * A);
      t.misty[q] = rgb(l.glow[0] * A + m, l.glow[1] * A + m, l.glow[2] * A + m);
      t.pale[q] = rgb(l.pale[0] * A, l.pale[1] * A, l.pale[2] * A);
      t.veil[q] = rgb(l.veil * A, l.veil * A, l.veil * A);
      t.soot[q] = rgb(1 - l.soot * A, 1 - l.soot * A, 1 - l.soot * A);
      t.got[q] = q ? (l.veil > 0 ? 1 : 0) | (hasPale ? 2 : 0) | (l.soot > 0 ? 4 : 0) : 0;
    }
    return (this.luts[k] = t);
  }

  // the buffers' pixels: each kind's density at each texel (softened by a 1-2-1 kernel each way, so that what the
  // carrying leaves cell to cell never shows as a grain, then bilinear, in bands), added up and cut into flat bands
  // whose edges are ruffled by a smooth noise laid on the world's grid (so they stay put as the view moves),
  // coloured by the mix of the kinds, nothing over a wall; plus the mist where the sky is.
  // TW x TH: the part of the buffers in use (a row of them is the buffer's width apart)
  // -> { veil, soot, pale }: which of those buffers has anything in it
  fill(F, act, mist, x0, y0, kx, ky, TW, TH) {
    const glow = this.glow.px, pale = this.pale.px, veil = this.veil.px, soot = this.soot.px, stride = this.glow.c.width;
    const cols = this.cols, n = act.length, smoke = n > 0;
    const look = SMOKE.look, step = look.step, map = this.world.map, sky = this.world.weather?.sky, m = Math.min(1, mist);
    const bias = 1 - look.from, rag = look.rag, quiet = 1 - bias - rag / 2;
    const f = smoke ? F.fcell : 1, W = smoke ? F.W : 0, H = smoke ? F.H : 0, fs = smoke ? F.fsolid : null;
    const ox = Math.round(x0 / kx), oy = Math.round(y0 / ky); // the texel grid's place in the world
    const L = act.map((k) => LOOKS[k]), lines = act.map((k) => this.lines[k]), sum = this.sum, v = this.v;
    // the buffers these kinds use (the veil's is the base the soot is multiplied into): only those are written
    const useSoot = L.some((l) => l.soot > 0), useVeil = useSoot || L.some((l) => l.veil > 0), usePale = L.some((l) => l.pale[0] + l.pale[1] + l.pale[2] > 0);
    let got = 0; // 1 veil, 2 pale, 4 soot
    const luts = act.map((k) => this.bands(k, m)), lut = n === 1 ? luts[0] : null;
    for (let tx = 0; tx < TW; tx++) {
      const wx = x0 + (tx + 0.5) * kx;
      cols.tile[tx] = Math.floor(wx / TILE);
      if (!smoke) continue;
      const gx = Math.min(W - 1.001, Math.max(0, wx / f - 0.5)), j = gx | 0;
      cols.j[tx] = j; cols.s[tx] = gx - j;
      cols.own[tx] = Math.min(W - 1, Math.max(0, Math.floor(wx / f)));
    }
    const mistGlow = rgb(m, m, m), j0 = smoke ? cols.j[0] : 0, span = smoke ? cols.j[TW - 1] + 2 - j0 : 0;
    // what painting a row needs: the same for every row but where it is (set below)
    const P = Object.assign(this.ctx, { TW, ox, j0, quiet, bias, rag, step, fs, cols, map, sky, m, mistGlow, glow, pale, veil, soot, useVeil, usePale, useSoot });
    // the rows of density cells the view covers, softened once each, kind by kind (in bands)
    const gyOf = (ty) => Math.min(H - 1.001, Math.max(0, (y0 + (ty + 0.5) * ky) / f - 0.5));
    const jLo = smoke ? gyOf(0) | 0 : 0, nr = smoke ? (gyOf(TH - 1) | 0) + 2 - jLo : 0;
    if (smoke) {
      if (!this.rows || this.rows.length < n * nr * span) this.rows = new Float32Array((n * nr * span * 1.5) | 0);
      const rows = this.rows, soft = this.soft;
      for (let q = 0; q < n; q++) {
        const d = F.kinds[act[q]].d, gq = L[q].gain / step / 16;
        for (let r = 0; r < nr; r++) {
          const jy = Math.min(H - 1, jLo + r), ya = Math.max(0, jy - 1) * W, yb = jy * W, yc = Math.min(H - 1, jy + 1) * W;
          for (let k = -1; k <= span; k++) {
            const x = Math.min(W - 1, Math.max(0, j0 + k));
            soft[k + 1] = d[ya + x] + 2 * d[yb + x] + d[yc + x];
          }
          const o = (q * nr + r) * span;
          for (let k = 0; k < span; k++) rows[o + k] = (soft[k] + 2 * soft[k + 1] + soft[k + 2]) * gq;
        }
      }
    }
    for (let ty = 0; ty < TH; ty++) {
      const wy = y0 + (ty + 0.5) * ky, trow = Math.floor(wy / TILE), row = ty * stride;
      const skyRow = sky && mist && trow >= 0 && trow < map.h ? trow * map.w : -1;
      let ownRow = 0, hot = false;
      if (smoke) {
        // the two softened rows about this texel row, mixed once for the whole row, each kind
        const gy = gyOf(ty), r = (gy | 0) - jLo, sy = gy - (gy | 0), rows = this.rows;
        sum.fill(0, 0, span);
        for (let q = 0; q < n; q++) {
          const line = lines[q], a = (q * nr + r) * span, b = a + span;
          for (let k = 0; k < span; k++) {
            const val = rows[a + k] + (rows[b + k] - rows[a + k]) * sy;
            line[k] = val;
            sum[k] += val;
          }
        }
        for (let k = 0; k < span; k++) if (sum[k] > quiet) { hot = true; break; }
        ownRow = Math.min(H - 1, Math.max(0, Math.floor(wy / f))) * W;
      }
      if (!hot && skyRow < 0) {
        // nothing in this row (most of them)
        glow.fill(BLACK, row, row + TW);
        if (useVeil) veil.fill(BLACK, row, row + TW);
        if (usePale) pale.fill(BLACK, row, row + TW);
        if (useSoot) soot.fill(WHITE, row, row + TW);
        continue;
      }
      P.row = row | 0; P.ry = ((oy + ty) & 63) << 6; P.ownRow = ownRow | 0; P.skyRow = skyRow | 0; P.hot = hot; // (ints: indices)
      got |= lut ? this.paintOne(P, lines[0], lut) : this.paintMix(P, lines, L, n, luts);
    }
    return { veil: !!(got & 1), pale: !!(got & 2), soot: !!(got & 4) };
  }

  // a texel row of one kind alone (the common case: the resting layer, a fight's smoke): its bands as they are.
  // -> what it wrote (1 veil, 2 pale, 4 soot)
  paintOne(P, line, lut) {
    const { TW, row, ry, ox, ownRow, skyRow, hot, j0, quiet, bias, rag, fs, cols, map, sky, glow, pale, veil, soot, useVeil, usePale, useSoot } = P;
    const lg = lut.glow, lmi = lut.misty, lp = lut.pale, lv = lut.veil, ls = lut.soot, lgot = lut.got, top = lut.top;
    const cj = cols.j, cs0 = cols.s, own = cols.own;
    let got = 0;
    // no branch on what is found (a band or none): band 0 of the tables is nothing
    for (let tx = 0; tx < TW; tx++) {
      let q = 0, misty = false;
      if (skyRow >= 0) {
        const col = cols.tile[tx];
        misty = col >= 0 && col < map.w && sky[skyRow + col] === 1;
      }
      if (hot) {
        const k = cj[tx] - j0, va = line[k], vb = line[k + 1];
        // nothing near enough a band to show (the common case), or over a wall: no need to look closer
        if ((va > quiet || vb > quiet) && !fs[ownRow + own[tx]]) {
          const v = va + (vb - va) * cs0[tx] + bias + RAG[ry + ((ox + tx) & 63)] * rag;
          if (v >= 1) q = v < top ? v | 0 : top;
        }
      }
      const i = row + tx;
      glow[i] = misty ? lmi[q] : lg[q];
      if (useVeil) veil[i] = lv[q];
      if (usePale) pale[i] = lp[q];
      if (useSoot) soot[i] = ls[q];
      got |= lgot[q];
    }
    return got;
  }

  // a texel row of several kinds: the band of what they add up to (never over the mix's cap). Where one kind is all
  // there is, its own bands (luts); where they mix, coloured by the share of each kind in it.
  // -> what it wrote (1 veil, 2 pale, 4 soot)
  paintMix(P, lines, L, n, luts) {
    const { TW, row, ry, ox, ownRow, skyRow, hot, j0, quiet, bias, rag, step, fs, cols, map, sky, m, mistGlow, glow, pale, veil, soot, useVeil, usePale, useSoot } = P;
    const v = this.v, sum = this.sum, cj = cols.j, cs0 = cols.s, own = cols.own;
    let got = 0;
    for (let tx = 0; tx < TW; tx++) {
      let cg = 0, cp = 0, cv = 0, cs = 0, misty = 0; // glow, pale, veil, soot: 0 = none
      if (skyRow >= 0) {
        const col = cols.tile[tx];
        if (col >= 0 && col < map.w && sky[skyRow + col] === 1) misty = m;
      }
      if (hot) {
        const k = cj[tx] - j0;
        if ((sum[k] > quiet || sum[k + 1] > quiet) && !fs[ownRow + own[tx]]) {
          const s = cs0[tx];
          let a = 0, top = 0, one = -1, many = 0;
          for (let q = 0; q < n; q++) {
            const lq = lines[q], val = lq[k] + (lq[k + 1] - lq[k]) * s;
            v[q] = val; a += val; top += val * L[q].max;
            if (val > MIXED) { one = q; many++; }
          }
          const b = a + bias + RAG[ry + ((ox + tx) & 63)] * rag;
          if (b >= 1 && many === 1) {
            // one kind all but alone here: its own bands
            const t = luts[one], q = b < t.top ? b | 0 : t.top;
            cg = misty ? t.misty[q] : t.glow[q]; cp = t.pale[q]; cv = t.veil[q]; cs = t.soot[q];
            got |= t.got[q];
          } else if (b >= 1) {
            const A = Math.min((b | 0) * step, top / a) / a;
            let gr = misty, gg = misty, gb = misty, pr = 0, pg = 0, pb = 0, ve = 0, so = 0;
            for (let q = 0; q < n; q++) {
              const l = L[q], w = v[q] * A;
              if (w <= 0) continue;
              gr += l.glow[0] * w; gg += l.glow[1] * w; gb += l.glow[2] * w;
              pr += l.pale[0] * w; pg += l.pale[1] * w; pb += l.pale[2] * w;
              ve += l.veil * w; so += l.soot * w;
            }
            cg = pack(gr, gg, gb);
            if (usePale) { cp = pack(pr, pg, pb); if (pr + pg + pb > 0.004) got |= 2; }
            if (useVeil) { cv = pack(ve, ve, ve); if (ve > 0.004) got |= 1; }
            if (useSoot) { cs = pack(1 - so, 1 - so, 1 - so); if (so > 0.004) got |= 4; }
          }
        }
      }
      if (!cg && misty) cg = mistGlow;
      const i = row + tx;
      glow[i] = cg || BLACK;
      if (useVeil) veil[i] = cv || BLACK;
      if (usePale) pale[i] = cp || BLACK;
      if (useSoot) soot[i] = cs || WHITE;
    }
    return got;
  }
}
