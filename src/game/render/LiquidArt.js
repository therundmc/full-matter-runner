// Canvas side of the liquid on the floor (systems/Liquids.js over engine/physics/Shallow.js, LIQUIDS.look in
// data/liquids.js). The grid is painted into a buffer a texel of `look.px` world px at a time: at each
// texel the depth (in films of what lies there), softened a little over the cells round it, is mixed between the
// four nearest cells, roughened by a still noise of the texel's place (steady as the view moves) and cut into flat
// steps: its edge line (lit on the side the light comes from, the top left), its thin film, its body,
// its deep part, its core, in the colours of its kind (mixed with a second kind when there is enough of it: pink
// water, thinned beer), fresh or aged (blood: wet crimson, then tacky). A pale glint now and then in the deep, foam
// along the edge of a fresh flow of beer and in clumps on it (where the still noise is high: never a dither), a
// petrol's rainbow bands. Only the chunks whose cells changed are painted again (and
// only once they are in view); the buffer is drawn with the floor, before the lighting (the light map lights it).
// The buffer is a window on the map round the view (`look.margin` chunks each way), not the map: when the view
// leaves it, it is set again round the view and the wet chunks in view are painted into it afresh.
// A second buffer says how much of the lights each texel mirrors (Lighting.post draws the reflections through it).
// Blood that has set (or dried) is painted for good into the blood layer of the floor, dry.
// Ripples: rings of single pixels spreading where a drop fell in.
import { LIQUIDS } from '../data/liquids.js';
import { RAMPS } from './BloodArt.js';
import { CH } from '../../engine/physics/Shallow.js';
import { bytesOf } from '../../engine/Bytes.js';
import { PROF } from '../../engine/Profiler.js';

const SLOTS = 13; // per look: [none, edge, thin, body, deep, core, glint, foam, sheen x 4, lit edge]
const GRAIN = 240; // texels to a side of the still noise's tile (repeated over the map; a multiple of look.grain)

// 'rgba(r,g,b,a)' or '#rrggbb' -> [r, g, b, a 0..1]
function parse(css) {
  if (css[0] === '#') {
    const n = parseInt(css.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const v = css.slice(css.indexOf('(') + 1, -1).split(',').map(Number);
  return [v[0], v[1], v[2], v[3] ?? 1];
}
const pack = (c) => ((Math.round(c[3] * 255) << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
// b painted over a (both straight alpha)
function over(a, b) {
  const o = b[3] + a[3] * (1 - b[3]);
  if (o <= 0) return [0, 0, 0, 0];
  return [0, 1, 2].map((i) => (b[i] * b[3] + a[i] * a[3] * (1 - b[3])) / o).concat(o);
}

// 0..1 from a texel's place in the world
function hash(x, y, s) {
  let h = Math.imul(x + s * 7919, 0x27d4eb2d) ^ Math.imul(y - s * 104729, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// smooth value noise -1..1 over an n x n tile that repeats seamlessly, `size` cells to a lump (seeded)
function still(n, size, seed) {
  const out = new Float32Array(n * n), m = Math.round(n / size);
  const at = (x, y) => hash(x % m, y % m, seed) * 2 - 1;
  for (let y = 0; y < n; y++) {
    const gy = y / size, j = Math.floor(gy), v = gy - j, sv = v * v * (3 - 2 * v);
    for (let x = 0; x < n; x++) {
      const gx = x / size, i = Math.floor(gx), u = gx - i, su = u * u * (3 - 2 * u);
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
      out[y * n + x] = a + (b - a) * sv;
    }
  }
  return out;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}
function buffer(w, h) {
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(c.width, c.height);
  return { c, g, img, px: new Uint32Array(img.data.buffer) };
}

export default class LiquidArt {
  constructor(world) {
    this.world = world;
    this.sim = null;
    this.shown = false; // something wet in view this frame
  }

  // what its buffers hold, bytes (engine/Bytes.js; the perf overlay)
  bytes(seen) { return bytesOf(this, seen); }

  // its buffers let go (World.dispose)
  dispose() {
    const W = this.win;
    if (W) for (const b of [W.color, W.mirror]) b.c.width = b.c.height = 0;
    this.win = this.patch = null;
    this.sim = null;
  }

  setup(S) {
    const look = LIQUIDS.look, px = look.px, L = CH + 2, R = CH + 4;
    this.sim = S;
    this.TW = Math.ceil((S.w * S.cell) / px); this.TH = Math.ceil((S.h * S.cell) / px);
    // the ragged edges: two octaves of still noise, a tile repeated over the buffer
    const [big, small] = look.grain, a = still(GRAIN, big, 3), b = still(GRAIN, small, 4);
    this.grain = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) this.grain[i] = (a[i] * 0.6 + b[i] * 0.4) * look.rag;
    // one chunk's texels, painted before they are put into the window
    const P = Math.ceil((CH * S.cell) / px) + 1;
    this.patch = { w: P, color: buffer(P, P), mirror: buffer(P, P) };
    this.win = null;
    const C = S.cw * S.ch;
    this.drawn = new Float64Array(C).fill(-1); // the versions (summed over the chunk and its neighbours) last painted
    this.clear = new Uint8Array(C).fill(1);
    this.raw = new Float32Array(R * R);
    this.lv = new Float32Array(L * L); this.key = new Int32Array(L * L); this.sol = new Uint8Array(L * L);
    this.tables();
  }

  // the colours of every look: a dominant kind, a second one and how much of it, fresh or aged
  tables() {
    const look = LIQUIDS.look, names = Object.keys(LIQUIDS.kinds), K = names.length;
    const kindLook = names.map((n) => look.kinds[n]);
    const col = (k, q, a) => {
      const L = kindLook[k];
      if (L.blood) { const r = RAMPS[a][L.blood[q - 1]]; return [r[0], r[1], r[2], r[3] / 255]; }
      return parse((a && L.aged ? L.aged : L.ramp)[q - 1]);
    };
    const glint = (k, a) => {
      const L = kindLook[k];
      if (L.blood) { const r = RAMPS[a][6]; return [r[0], r[1], r[2], r[3] / 255]; }
      return L.glint ? parse(L.glint) : col(k, 4, a);
    };
    const shares = [0, ...look.mix.slice(0, 3).map((v, i, m) => (v + (m[i + 1] ?? 0.5)) / 2)];
    const n = K * K * 3 * 2;
    this.lut = new Uint32Array(n * SLOTS);
    this.mlut = new Uint32Array(n * 6);
    this.flags = new Uint8Array(n); // 1: foam, 2: sheen
    this.stripe = new Float32Array(n); // share of a sheen band that shows
    for (let d = 0; d < K; d++) {
      for (let s = 0; s < K; s++) {
        for (let m = 0; m < 3; m++) {
          for (let a = 0; a < 2; a++) {
            const key = ((d * K + s) * 3 + m) * 2 + a, o = key * SLOTS, wt = s === d ? 0 : shares[m + 1];
            const Ld = kindLook[d], Ls = kindLook[s];
            for (let q = 1; q <= 5; q++) this.lut[o + q] = pack(lerp(col(d, q, a), col(s, q, a), wt));
            this.lut[o + 6] = pack(lerp(glint(d, a), glint(s, a), wt));
            if (Ld.foam && !a) { this.lut[o + 7] = pack(parse(Ld.foam)); this.flags[key] |= 1; }
            this.lut[o + 12] = Ld.rim ? pack(lerp(parse(Ld.rim), col(s, 1, a), wt)) : this.lut[o + 1];
            if (Ld.sheen) {
              for (let b = 0; b < 4; b++) this.lut[o + 8 + b] = pack(over(lerp(col(d, 3, a), col(s, 3, a), wt), parse(Ld.sheen[b % Ld.sheen.length])));
              this.flags[key] |= 2;
              this.stripe[key] = Ld.stripe ?? 1;
            }
            const mir = (L) => (a && L.matte !== undefined ? L.matte : L.mirror ?? 0);
            const sky = Ld.sky ? parse(Ld.sky) : [0, 0, 0, 0];
            for (let q = 1; q <= 5; q++) {
              const k = (mir(Ld) * (1 - wt) + mir(Ls) * wt) * (q >= 2 ? 1 : 0.5);
              this.mlut[key * 6 + q] = pack([sky[0], sky[1], sky[2], Math.min(1, k)]);
            }
          }
        }
      }
    }
    this.rings = kindLook.map((L) => L.ring || 'rgba(255,255,255,0.3)');
  }

  // the look of the cell at address a (depth d): its dominant kind, the second one and its share, fresh or not
  keyOf(a, d) {
    const S = this.sim, K = S.K, o = a * K, dom = S.dom[a], mix = LIQUIDS.look.mix;
    let s = dom, sv = 0;
    for (let k = 0; k < K; k++) if (k !== dom && S.vol[o + k] > sv) { sv = S.vol[o + k]; s = k; }
    const p = sv / d;
    let m = 0;
    if (p < mix[0]) s = dom; else m = p < mix[1] ? 0 : p < mix[2] ? 1 : 2;
    return ((dom * K + s) * 3 + m) * 2 + (S.fresh[a] > 0.5 ? 0 : 1);
  }

  // what a chunk and its neighbours show now (their versions summed)
  sig(c) {
    const S = this.sim, cw = S.cw, cx = c % cw, cy = (c / cw) | 0, ver = S.ver;
    let s = 0;
    for (let y = Math.max(0, cy - 1); y <= Math.min(S.ch - 1, cy + 1); y++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(cw - 1, cx + 1); x++) s += ver[y * cw + x] * (1 + ((x - cx + 1) + (y - cy + 1) * 3));
    }
    return s;
  }

  // paint chunk c's texels into the patch (its top left texel at its own top left); returns the texel rectangle
  fill(c) {
    const S = this.sim, look = LIQUIDS.look, L = CH + 2, R = CH + 4, raw = this.raw, lv = this.lv, key = this.key, sol = this.sol;
    const cx0 = (c % S.cw) * CH, cy0 = ((c / S.cw) | 0) * CH, cell = S.cell, px = look.px;
    let any = false;
    // the depth in films of the cells about the chunk (two cells round it), then softened over each cell's eight
    // neighbours (the edges come out round rather than along the grid; walls give nothing)
    for (let ry = 0; ry < R; ry++) {
      const gy = cy0 - 2 + ry;
      for (let rx = 0; rx < R; rx++) {
        const gx = cx0 - 2 + rx, a = gx < 0 || gy < 0 || gx >= S.w || gy >= S.h ? -1 : S.addr(gy * S.w + gx);
        const out = a < 0 || S.solid[a] || S.dep[a] <= 0;
        raw[ry * R + rx] = out ? 0 : S.dep[a] / S.film[a];
        if (!out) any = true;
      }
    }
    const [kc0, kn, kd] = look.soften;
    for (let ly = 0; ly < L; ly++) {
      const gy = cy0 - 1 + ly;
      for (let lx = 0; lx < L; lx++) {
        const gx = cx0 - 1 + lx, j = ly * L + lx, r = (ly + 1) * R + lx + 1;
        if (gx < 0 || gy < 0 || gx >= S.w || gy >= S.h) { lv[j] = 0; key[j] = -1; sol[j] = 1; continue; }
        const i = gy * S.w + gx, a = S.addr(i), d = a < 0 ? 0 : S.dep[a];
        sol[j] = a < 0 ? S.wall(i) : S.solid[a];
        lv[j] = sol[j] ? 0 : raw[r] * kc0 + (raw[r - 1] + raw[r + 1] + raw[r - R] + raw[r + R]) * kn
          + (raw[r - R - 1] + raw[r - R + 1] + raw[r + R - 1] + raw[r + R + 1]) * kd;
        key[j] = d > 0 && !sol[j] ? this.keyOf(a, d) : -1;
      }
    }
    const tx0 = Math.floor((cx0 * cell) / px), ty0 = Math.floor((cy0 * cell) / px);
    const tx1 = Math.min(this.TW, Math.floor(((cx0 + CH) * cell) / px)), ty1 = Math.min(this.TH, Math.floor(((cy0 + CH) * cell) / px));
    const P = this.patch, col = P.color.px, mir = P.mirror.px, TW = P.w, lut = this.lut, mlut = this.mlut, flags = this.flags;
    const [T0, T1, T2, T3, T4] = look.levels, grain = this.grain, gl = look.glint, G = look.gap;
    const fe = look.foam.edge * look.rag, fd = look.foam.deep * look.rag;
    for (let ty = ty0; ty < ty1; ty++) {
      const row = (ty - ty0) * TW - tx0;
      if (!any) { col.fill(0, row + tx0, row + tx1); mir.fill(0, row + tx0, row + tx1); continue; }
      const wy = (ty + 0.5) * px, gy = wy / cell - 0.5, jy = Math.floor(gy), sy = gy - jy;
      const ly = jy - cy0 + 1, oy = Math.floor(wy / cell) - cy0 + 1;
      for (let tx = tx0; tx < tx1; tx++) {
        const o = row + tx, wx = (tx + 0.5) * px, gx = wx / cell - 0.5, jx = Math.floor(gx), sx = gx - jx;
        const own = oy * L + Math.floor(wx / cell) - cx0 + 1, j = ly * L + jx - cx0 + 1;
        const a = lv[j], b = lv[j + 1], c2 = lv[j + L], d2 = lv[j + L + 1];
        if (sol[own] || a + b + c2 + d2 <= 0) { col[o] = 0; mir[o] = 0; continue; }
        // `gap` px short of what holds it: no texel by a solid cell
        const ax = Math.floor((wx - G) / cell) - cx0 + 1, bx = Math.floor((wx + G) / cell) - cx0 + 1;
        const ay = (Math.floor((wy - G) / cell) - cy0 + 1) * L, by = (Math.floor((wy + G) / cell) - cy0 + 1) * L;
        if (sol[ay + ax] || sol[ay + bx] || sol[by + ax] || sol[by + bx]) { col[o] = 0; mir[o] = 0; continue; }
        const g = grain[(ty % GRAIN) * GRAIN + (tx % GRAIN)];
        const v = (a + (b - a) * sx) * (1 - sy) + (c2 + (d2 - c2) * sx) * sy + g;
        if (v < T0) { col[o] = 0; mir[o] = 0; continue; }
        const q = v < T1 ? 1 : v < T2 ? 2 : v < T3 ? 3 : v < T4 ? 4 : 5;
        let kc = key[own];
        if (kc < 0) {
          let best = -1;
          for (const n of [j, j + 1, j + L, j + L + 1]) if (lv[n] > best && key[n] >= 0) { best = lv[n]; kc = key[n]; }
          if (kc < 0) { col[o] = 0; mir[o] = 0; continue; }
        }
        const base = kc * SLOTS, f = flags[kc], h2 = hash(tx, ty, 2);
        let out = lut[base + q];
        // the edge facing the light (the depth grows toward the bottom right there) catches it
        if (q === 1 && (b - a) * (1 - sy) + (d2 - c2) * sy + (c2 - a) * (1 - sx) + (d2 - b) * sx > 0) out = lut[base + 12];
        else if (q >= 4 && h2 < gl) out = lut[base + 6];
        else if ((f & 1) && (q === 1 ? g > fe : g > fd)) out = lut[base + 7];
        else if ((f & 2) && q >= 2 && q <= 3) {
          // thin bands of colour wandering over it, the body between them
          const u = (Math.sin(wx * 0.11 + wy * 0.06) + Math.sin(wx * 0.047 - wy * 0.09) + 2) * 1.6 + g * 2, band = Math.floor(u);
          if (u - band < this.stripe[kc]) out = lut[base + 8 + (band & 3)];
        }
        col[o] = out;
        mir[o] = mlut[kc * 6 + q];
      }
    }
    return [tx0, ty0, tx1 - tx0, ty1 - ty0];
  }

  // blood that has set (or dried) is painted into the floor's blood layer for good, in its dry colours
  bake() {
    const liq = this.world.liquids, list = liq.stained;
    if (!list.length) return;
    const decals = this.world.decals;
    if (!decals?.paint) { list.length = 0; return; }
    const S = this.sim, look = LIQUIDS.look, px = look.px, cell = S.cell, per = Math.max(1, Math.round(cell / px));
    const film = LIQUIDS.kinds.blood.film, shade = look.kinds.blood.blood, [T0, T1, T2, T3, T4] = look.levels;
    const at = (gx, gy) => (gx < 0 || gy < 0 || gx >= S.w || gy >= S.h ? 0 : liq.stainOf(gy * S.w + gx) / film);
    const rects = [[], [], [], [], []];
    for (const i of list) {
      const cx = i % S.w, cy = (i / S.w) | 0;
      for (let sy = 0; sy < per; sy++) {
        for (let sx = 0; sx < per; sx++) {
          const tx = cx * per + sx, ty = cy * per + sy, wx = (tx + 0.5) * px, wy = (ty + 0.5) * px;
          const gx = wx / cell - 0.5, gy = wy / cell - 0.5, jx = Math.floor(gx), jy = Math.floor(gy), fx = gx - jx, fy = gy - jy;
          const v = (at(jx, jy) * (1 - fx) + at(jx + 1, jy) * fx) * (1 - fy) + (at(jx, jy + 1) * (1 - fx) + at(jx + 1, jy + 1) * fx) * fy
            + this.grain[(ty % GRAIN) * GRAIN + (tx % GRAIN)];
          if (v < T0) continue;
          rects[v < T1 ? 0 : v < T2 ? 1 : v < T3 ? 2 : v < T4 ? 3 : 4].push(tx * px, ty * px);
        }
      }
    }
    list.length = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rects) {
      for (let k = 0; k < r.length; k += 2) {
        x0 = Math.min(x0, r[k]); y0 = Math.min(y0, r[k + 1]); x1 = Math.max(x1, r[k] + px); y1 = Math.max(y1, r[k + 1] + px);
      }
    }
    if (x1 <= x0) return;
    decals.paint((g) => {
      for (let q = 0; q < 5; q++) {
        const r = rects[q];
        if (!r.length) continue;
        const c = RAMPS[2][shade[q]];
        g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
        g.beginPath();
        for (let k = 0; k < r.length; k += 2) g.rect(r[k], r[k + 1], px, px);
        g.fill();
      }
      decals.trim(g, x0, y0, x1, y1); // off the walls, as every stain
    }, 'blood', x0, x1);
  }

  // with the floor, before the lighting: the liquid in view (rect { x0, y0, x1, y1 } world px), its ripples
  draw(ctx, view) {
    const S = this.world.liquids?.sim;
    if (!S) return;
    if (this.sim !== S) this.setup(S);
    this.bake();
    const px = LIQUIDS.look.px, span = CH * S.cell;
    const cx0 = Math.max(0, Math.floor(view.x0 / span)), cx1 = Math.min(S.cw - 1, Math.floor(view.x1 / span));
    const cy0 = Math.max(0, Math.floor(view.y0 / span)), cy1 = Math.min(S.ch - 1, Math.floor(view.y1 / span));
    const W = this.frame(cx0, cy0, cx1, cy1);
    let shown = false;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cy * S.cw + cx;
        if (S.wet[c]) shown = true;
        const sig = this.sig(c);
        if (this.drawn[c] === sig) continue;
        this.drawn[c] = sig;
        if (!S.wet[c] && this.clear[c]) continue;
        const [x, y, w, h] = this.fill(c), P = this.patch;
        this.clear[c] = S.wet[c] ? 0 : 1;
        W.color.g.putImageData(P.color.img, x - W.tx, y - W.ty, 0, 0, w, h);
        W.mirror.g.putImageData(P.mirror.img, x - W.tx, y - W.ty, 0, 0, w, h);
        if (PROF.on) PROF.count('put', 2, w * h * 8); // (the perf overlay: pixels sent up)
      }
    }
    this.shown = shown;
    if (!shown) return;
    const vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(W.color.c, view.x0 / px - W.tx, view.y0 / px - W.ty, vw / px, vh / px, view.x0, view.y0, vw, vh);
    this.drawRipples(ctx, view);
    ctx.restore();
  }

  // The window over chunks [cx0, cx1] x [cy0, cy1] (and `look.margin` more each way): set again round them when they
  // are not all in it (its canvases made again only when they are too small or far too large); the chunks it held
  // are to be painted afresh when they come back into it
  frame(cx0, cy0, cx1, cy1) {
    const S = this.sim, look = LIQUIDS.look, m = look.margin, span = (CH * S.cell) / look.px;
    let W = this.win;
    if (W && cx0 >= W.ox && cy0 >= W.oy && cx1 < W.ox + W.cw && cy1 < W.oy + W.ch) return W;
    const cw = cx1 - cx0 + 1 + m * 2, ch = cy1 - cy0 + 1 + m * 2;
    const tw = Math.ceil(cw * span) + 1, th = Math.ceil(ch * span) + 1;
    if (W) {
      for (let y = Math.max(0, W.oy); y < Math.min(S.ch, W.oy + W.ch); y++) {
        for (let x = Math.max(0, W.ox); x < Math.min(S.cw, W.ox + W.cw); x++) this.drawn[y * S.cw + x] = -1;
      }
    }
    const fits = W && W.color.c.width >= tw && W.color.c.height >= th && W.color.c.width <= tw * 2 && W.color.c.height <= th * 2;
    if (fits) for (const b of [W.color, W.mirror]) b.g.clearRect(0, 0, b.c.width, b.c.height);
    else {
      if (W) for (const b of [W.color, W.mirror]) b.c.width = b.c.height = 0;
      const make = () => { const c = canvas(tw, th); return { c, g: c.getContext('2d') }; };
      W = { color: make(), mirror: make() };
    }
    W.ox = cx0 - m; W.oy = cy0 - m; W.cw = Math.floor((W.color.c.width - 1) / span); W.ch = Math.floor((W.color.c.height - 1) / span);
    // (the texel of the map at the window's top left)
    W.tx = Math.floor((W.ox * CH * S.cell) / look.px); W.ty = Math.floor((W.oy * CH * S.cell) / look.px);
    return (this.win = W);
  }

  // rings of single pixels, only where there is liquid under them
  drawRipples(ctx, view) {
    const liq = this.world.liquids, S = this.sim;
    for (const r of liq.ripples) {
      if (r.x < view.x0 || r.x > view.x1 || r.y < view.y0 || r.y > view.y1) continue;
      const k = r.t / r.life, rad = r.size * (0.25 + k), n = Math.max(6, Math.round(rad * 4));
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = this.rings[r.kind] || this.rings[0];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = Math.round(r.x + Math.cos(a) * rad), y = Math.round(r.y + Math.sin(a) * rad * 0.85);
        if (S.depthAt(x, y) > 0) ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // the reflections' mask (Lighting.post: g in world px at its scale): false when nothing wet is in view
  mirrorInto(g, x0, y0, vw, vh) {
    const W = this.win;
    if (!this.shown || !W) return false;
    const px = LIQUIDS.look.px;
    g.drawImage(W.mirror.c, x0 / px - W.tx, y0 / px - W.ty, vw / px, vh / px, x0, y0, vw, vh);
    return true;
  }
}
