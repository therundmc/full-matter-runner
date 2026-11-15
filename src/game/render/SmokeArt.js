// Canvas side of the smoke in the air (systems/Smoke.js, SMOKE in data/atmosphere.js) and of the mist of a rainy
// night (RAIN.mist). The smoke is never a grey veil laid over the picture: its density is sampled into buffers at
// the light map's size (a texel = 2 world px, on the world's grid), cut into a few flat bands (pixel-art steps,
// crisp ragged edges, no blur), walls left clear. Like real smoke it both lights up and veils: the scene under it is
// dimmed a little where it is lit (the veil, multiplied), and the light it scatters is added (its tint multiplied twice by the light
// map, so where a lamp shines the smoke glows in its colour and the dark stays clear, screened over the scene). The
// cigarettes' threads are drawn with the scene, before the light, a world pixel at a time.
import { TILE } from '../Config.js';
import { SMOKE, RAIN } from '../data/atmosphere.js';

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

export default class SmokeArt {
  constructor(world) {
    this.world = world;
    this.glow = null;    // the light the smoke scatters
    this.veil = null;    // what it takes off the scene under it
    this.cols = null;    // per texel column: density cell left of it, share of the next one, its own cell, its tile
    this.lut = null;     // the colours of the bands (tables())
    this.line = null;    // a row of density, mixed between two rows of cells, for the texel row being filled
    this.key = { steps: -1, x0: 0, y0: 0, w: 0, h: 0, mist: 0, smoke: false, veiled: false }; // what the pixels show
    this.warmed = false; // drawn once at the first frame, nothing or not: the graphics card prepares each way of
                         // drawing the first time it meets it (a hitch), better then than at the first shot fired
  }

  // the threads off the cigarettes, with the scene (the light falls on them like on the rest): a world pixel each,
  // swelling to two as they spread, fading
  drawThreads(ctx, smoke, vis) {
    const T = smoke?.rib;
    if (!T?.n) return;
    const S = SMOKE.cig;
    ctx.fillStyle = S.color;
    for (let i = 0; i < T.n; i++) {
      const x = T.x[i], y = T.y[i];
      if (!vis(x, y)) continue;
      const k = T.age[i] / T.life[i], a = T.a[i] * Math.min(1, k * 10) * (1 - k) * (1 - k);
      if (a < 0.01) continue;
      const s = Math.round(1 + k * S.grow);
      ctx.globalAlpha = a;
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
  }

  // the smoke and the mist, lit. After Lighting.apply (its light map and view are this frame's).
  draw(ctx, lighting) {
    const w = this.world, F = w.smoke?.fluid, look = SMOKE.look, mist = RAIN.mist * (w.weather?.k || 0);
    const smoke = !!F && F.peak * look.gain >= look.step * look.from * 0.5;
    const first = !this.warmed;
    if ((!smoke && !mist && !first) || !lighting.lm) return;
    this.warmed = true;
    const lm = lighting.lm, { x0, y0, w: vw, h: vh } = lighting.view, TW = lm.width, TH = lm.height;
    if (!this.glow || this.glow.c.width !== TW || this.glow.c.height !== TH) {
      this.glow = buffer(TW, TH);
      this.veil = buffer(TW, TH);
      this.cols = { j: new Int32Array(TW), s: new Float32Array(TW), own: new Int32Array(TW), tile: new Int32Array(TW) };
    }
    if (F && (!this.line || this.line.length < F.W + 2)) this.line = new Float32Array(F.W + 2);
    // the density only changes when the smoke steps (every other frame): the pixels are kept till then, or till the
    // view moves
    const key = this.key;
    if (first || key.steps !== (F?.steps ?? -1) || key.x0 !== x0 || key.y0 !== y0 || key.w !== TW || key.h !== TH || key.mist !== mist || key.smoke !== smoke) {
      key.veiled = this.fill(F, smoke, mist, x0, y0, vw / TW, vh / TH);
      Object.assign(key, { steps: F?.steps ?? -1, x0, y0, w: TW, h: TH, mist, smoke });
    }
    const veiled = key.veiled;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (veiled || first) {
      // the veil: how much it takes off, times the light there (in the dark there is nothing to take off: no black
      // cloud), turned into what is left (1 - that) and multiplied over the scene
      const v = this.veil.c.getContext('2d');
      v.putImageData(this.veil.img, 0, 0);
      v.globalCompositeOperation = 'multiply';
      v.drawImage(lm, 0, 0);
      v.globalCompositeOperation = 'difference';
      v.fillStyle = '#fff';
      v.fillRect(0, 0, TW, TH);
      v.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.veil.c, x0, y0, vw, vh);
    }
    // the glow, lit by the light map twice: a lamp lights its smoke fully, the night ambient hardly at all
    const g = this.glow.c.getContext('2d');
    g.putImageData(this.glow.img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(lm, 0, 0);
    g.drawImage(lm, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.glow.c, x0, y0, vw, vh);
    ctx.restore();
  }

  // colours of each band, without and with the mist: glow (tinted) and veil (how much it takes off)
  tables(mist) {
    const look = SMOKE.look, n = Math.min(look.levels, Math.floor(look.max / look.step)) + 1, t = this.lut;
    if (t && t.mist === mist) return t;
    const rgb = (r, g, b) => 0xff000000 | (Math.min(255, Math.round(b * 255)) << 16) | (Math.min(255, Math.round(g * 255)) << 8) | Math.min(255, Math.round(r * 255));
    const [tr, tg, tb] = look.tint, lut = { mist, top: n - 1, glow: new Uint32Array(n), misty: new Uint32Array(n), veil: new Uint32Array(n) };
    for (let q = 0; q < n; q++) {
      const k = q * look.step, v = Math.min(1, k * look.dim);
      lut.glow[q] = rgb(k * tr, k * tg, k * tb);
      lut.misty[q] = rgb(k * tr + mist, k * tg + mist, k * tb + mist);
      lut.veil[q] = rgb(v, v, v);
    }
    return (this.lut = lut);
  }

  // the buffers' pixels: the density at each texel (bilinear between the density cells), cut into flat bands whose edges are ragged by a hash of the texel's place in the world (so
  // they stay put as the view moves), nothing over a wall; plus the mist where the sky is. True when there is a veil.
  fill(F, smoke, mist, x0, y0, kx, ky) {
    const glow = this.glow.px, veil = this.veil.px, TW = this.glow.c.width, TH = this.glow.c.height, cols = this.cols;
    const look = SMOKE.look, map = this.world.map, sky = this.world.weather?.sky, lut = this.tables(Math.min(1, mist));
    const gain = look.gain / look.step, bias = 1 - look.from, rag = look.rag, top = lut.top, quiet = 1 - bias - rag / 2;
    const f = smoke ? F.fcell : 1, W = smoke ? F.W : 0, H = smoke ? F.H : 0, d = smoke ? F.d : null, fs = smoke ? F.fsolid : null;
    const ox = Math.round(x0 / kx), oy = Math.round(y0 / ky); // the texel grid's place in the world
    for (let tx = 0; tx < TW; tx++) {
      const wx = x0 + (tx + 0.5) * kx;
      cols.tile[tx] = Math.floor(wx / TILE);
      if (!smoke) continue;
      const gx = Math.min(W - 1.001, Math.max(0, wx / f - 0.5)), j = gx | 0;
      cols.j[tx] = j; cols.s[tx] = gx - j;
      cols.own[tx] = Math.min(W - 1, Math.max(0, Math.floor(wx / f)));
    }
    const none = lut.veil[0], j0 = smoke ? cols.j[0] : 0, n = smoke ? cols.j[TW - 1] + 2 - j0 : 0, line = this.line;
    let veiled = false;
    for (let ty = 0; ty < TH; ty++) {
      const wy = y0 + (ty + 0.5) * ky, trow = Math.floor(wy / TILE), row = ty * TW;
      const skyRow = sky && mist && trow >= 0 && trow < map.h ? trow * map.w : -1;
      let ownRow = 0, hot = false;
      if (smoke) {
        // the two rows of density cells about this texel row, mixed once for the whole row (scaled to bands)
        const gy = Math.min(H - 1.001, Math.max(0, wy / f - 0.5)), jy = gy | 0, sy = gy - jy, r0 = jy * W + j0, r1 = r0 + W;
        for (let k = 0; k < n; k++) {
          const v = (d[r0 + k] + (d[r1 + k] - d[r0 + k]) * sy) * gain;
          line[k] = v;
          if (v > quiet) hot = true;
        }
        ownRow = Math.min(H - 1, Math.max(0, Math.floor(wy / f))) * W;
      }
      const hy = Math.imul(oy + ty, 0x27d4eb2d);
      for (let tx = 0; tx < TW; tx++) {
        let q = 0;
        if (hot) {
          const k = cols.j[tx] - j0, a = line[k], b = line[k + 1];
          // nothing near enough a band to show (the common case), or over a wall: no need to look closer
          if ((a > quiet || b > quiet) && !fs[ownRow + cols.own[tx]]) {
            let h = Math.imul((ox + tx) ^ hy, 0x165667b1);
            h ^= h >>> 15;
            const v = a + (b - a) * cols.s[tx] + bias + ((h & 1023) / 1023 - 0.5) * rag;
            if (v >= 1) { q = v | 0; if (q > top) q = top; veiled = true; }
          }
        }
        let misty = false;
        if (skyRow >= 0) {
          const col = cols.tile[tx];
          misty = col >= 0 && col < map.w && sky[skyRow + col] === 1;
        }
        glow[row + tx] = misty ? lut.misty[q] : lut.glow[q];
        veil[row + tx] = q ? lut.veil[q] : none;
      }
    }
    return veiled;
  }
}
