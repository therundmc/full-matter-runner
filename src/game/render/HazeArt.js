// Canvas side of the smoke in the air (systems/Haze.js, HAZE in data/atmosphere.js) and of the mist of a rainy
// night (RAIN.mist). The haze is never drawn as a grey veil: its density is laid into a small buffer at the light
// map's resolution (an even fill per smoky place plus its puffs, turning), cut to the floors it hangs over (walls
// stay clear), then multiplied twice by the light map, so where a lamp shines the smoke glows in its colour and
// the dark stays clear. That buffer is screened over the lit scene. Dust motes float in the beams; the smoke of the
// cigarettes is drawn with the scene, before the light, as soft wisps.
import { TILE, LIGHTING as L, AMBIENCE } from '../Config.js';
import { HAZE, RAIN } from '../data/atmosphere.js';
import { hash } from './Flicker.js';
import { seeded } from '../systems/Weather.js';

const h3 = (a, b, c) => hash(a * 12.9898 + b * 78.233 + c * 37.719);
const SHAPES = 3;
let sprites = null; // made once (a few ms of noise), kept from run to run
let warmed = false;  // see warm()

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

// value noise on a seeded lattice, summed over octaves (fbm)
function fbm(R) {
  const N = 32, lat = Float32Array.from({ length: N * N }, R);
  const at = (x, y) => lat[((y % N + N) % N) * N + ((x % N + N) % N)];
  const vn = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
  return (x, y) => {
    let s = 0, k = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { s += vn(x * f, y * f) * k; k *= 0.5; f *= 2.03; }
    return s / 0.9375;
  };
}

// a drift of smoke: torn, curling wisps of white (domain-warped noise), longer than wide, fading to nothing at its
// rim, so that it shows when it moves and turns
function puffSprite(seed) {
  const S = HAZE.puff.sprite, c = canvas(S, S), g = c.getContext('2d'), R = seeded(seed), n = fbm(R), h = S / 2;
  const img = g.createImageData(S, S), d = img.data, f = 6 / S, ox = R() * 50, oy = R() * 50;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - h) / h, dy = ((y - h) / h) * HAZE.puff.stretch, r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const wx = n(x * f + ox, y * f + oy) * 3, wy = n(x * f + oy + 7, y * f + ox) * 3; // the warp: wisps curl
      const v = n(x * f * 0.8 + wx + ox, y * f * 1.6 + wy + oy);
      const a = Math.max(0, Math.min(1, (v - 0.36) * 2.6)) * (1 - r2) * (1 - r2);
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// a wisp of cigarette smoke, pale grey
function wispSprite([r, gg, b]) {
  const c = canvas(16, 16), g = c.getContext('2d'), gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  gr.addColorStop(0.5, `rgba(${r},${gg},${b},0.45)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 16);
  return c;
}

export default class HazeArt {
  constructor(world) {
    this.world = world;
    sprites ||= { puffs: Array.from({ length: SHAPES }, (_, i) => puffSprite(911 + i * 37)), wisp: wispSprite(HAZE.smoke.color) };
    this.puffs = sprites.puffs;
    this.wisp = sprites.wisp;
    this.buf = null;
    this.version = -1;
  }

  // the floors smoke may hang over (indoor floors) and those under the open sky (the mist): 1 texel per tile,
  // drawn without smoothing, so the walls stay clean
  masks() {
    const m = this.world.map;
    if (this.version === (m.version ?? 0) && this.inMask) return;
    this.version = m.version ?? 0;
    const roofed = new Set(AMBIENCE.indoors), sky = this.world.weather?.sky;
    this.inMask ||= canvas(m.w, m.h);
    this.skyMask ||= canvas(m.w, m.h);
    const a = this.inMask.getContext('2d'), b = this.skyMask.getContext('2d');
    a.fillStyle = b.fillStyle = '#000';
    a.fillRect(0, 0, m.w, m.h);
    b.fillRect(0, 0, m.w, m.h);
    a.fillStyle = b.fillStyle = '#fff';
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        if (!m.isSolid(x, y) && roofed.has(m.floor[i])) a.fillRect(x, y, 1, 1);
        if (sky?.[i]) b.fillRect(x, y, 1, 1);
      }
    }
  }

  // the cigarettes' smoke, with the scene (the light falls on it like on the rest)
  drawWisps(ctx, haze, vis) {
    if (!haze?.wisps.length) return;
    for (const p of haze.wisps) {
      if (!vis(p.x, p.y)) continue;
      const k = p.life / p.max, a = p.alpha * Math.min(1, (1 - k) * 6) * k; // swells in, thins away
      if (a < 0.01) continue;
      const s = p.size * 2;
      ctx.globalAlpha = a;
      ctx.drawImage(this.wisp, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // the haze and the mist, lit; then the motes. After Lighting.apply (its light map and view are this frame's).
  draw(ctx, lighting, t) {
    const w = this.world, haze = w.haze, mist = RAIN.mist * (w.weather?.k || 0);
    const zones = (haze?.zones || []).filter((z) => z.k > 0.005 && lighting.inView((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, Math.max(z.x1 - z.x0, z.y1 - z.y0)));
    if (!zones.length && !mist) return;
    if (!lighting.lm) return;
    this.masks();
    const { x0, y0, w: vw, h: vh } = lighting.view, s = L.scale, lm = lighting.lm;
    if (!this.buf || this.buf.width !== lm.width || this.buf.height !== lm.height) this.buf = canvas(lm.width, lm.height);
    const g = this.buf.getContext('2d');
    if (!warmed) this.warm(g, lighting);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.buf.width, this.buf.height);
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    const B = HAZE.base;
    for (const z of zones) {
      const v = Math.round(255 * Math.min(1, z.k * B));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.save();
      g.beginPath(); g.rect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0); g.clip();
      g.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      const k = z.k * (1 - B) * 2.2;
      for (const list of [z.puffs, z.extra]) {
        for (const p of list) {
          const life = p.max ? Math.min(1, p.life / p.max * 2) : 1, d = p.r * 2 * (p.max ? 1 + (1 - p.life / p.max) * 1.5 : 1);
          g.globalAlpha = Math.min(1, k * p.a * life);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.drawImage(this.puffs[p.shape], -d / 2, -d / 2, d, d);
          g.restore();
        }
      }
      g.restore();
    }
    // the shafts: under each lamp of a smoky place the smoke hangs thicker in its beam, so from above the lamp
    // stands in a cone of glowing smoke that fades out from it
    const sh = HAZE.shafts, white = lighting.blob('#ffffff');
    for (const [l, k] of lighting.frameLights || []) {
      if (k < 0.05 || l.r < sh.min || l.moving || l.spots) continue;
      const z = zones.find((q) => l.x > q.x0 && l.x < q.x1 && l.y > q.y0 && l.y < q.y1);
      if (!z) continue;
      const rr = l.r * sh.r;
      g.globalAlpha = Math.min(1, sh.k * z.k * Math.min(1, k));
      g.drawImage(white, l.x - rr, l.y - rr, rr * 2, rr * 2);
    }
    g.globalAlpha = 1;
    // cut to the floors under a roof, then the mist of the open air on top
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.inMask, 0, 0, this.inMask.width, this.inMask.height, 0, 0, this.inMask.width * TILE, this.inMask.height * TILE);
    if (mist > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, mist);
      g.drawImage(this.skyMask, 0, 0, this.skyMask.width, this.skyMask.height, 0, 0, this.skyMask.width * TILE, this.skyMask.height * TILE);
      g.globalAlpha = 1;
    }
    // lit by the light map, twice: a lamp lights its smoke fully, the night ambient hardly at all
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(lm, 0, 0);
    g.drawImage(lm, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = HAZE.gain;
    ctx.drawImage(this.buf, x0, y0, vw, vh);
    ctx.restore();
    this.motes(ctx, lighting, zones, t);
  }

  // every way the puffs are drawn, done once into the buffer at the first frame (already a slow one; the frame's
  // own drawing wipes it): the graphics card prepares each new way of drawing the first time it meets it, a hitch of
  // tens of ms, which would otherwise fall on the moment the player first walks into the bar
  warm(g, lighting) {
    warmed = true;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    g.beginPath(); g.rect(2, 2, 28, 28); g.clip();
    g.fillStyle = '#333';
    g.fillRect(0, 0, 32, 32);
    g.translate(16, 16); g.rotate(0.5);
    g.globalAlpha = 0.5;
    g.drawImage(this.puffs[0], -12, -12, 24, 24);
    g.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5;
    g.drawImage(lighting.blob('#ffffff'), 4, 4, 20, 20);
    g.restore();
  }

  // specks of dust drifting slowly where a lamp shines into the smoke
  motes(ctx, lighting, zones, t) {
    const M = HAZE.motes;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = M.color;
    for (const z of zones) {
      const n = Math.round((((z.x1 - z.x0) * (z.y1 - z.y0)) / (TILE * TILE * 100)) * M.per * Math.min(1, z.k / z.base));
      const W = z.x1 - z.x0, H = z.y1 - z.y0;
      for (let i = 0; i < n; i++) {
        const a = h3(z.x0, z.y0, i), b = h3(i, z.x1, z.y1), ph = a * 40;
        const x = z.x0 + ((a * W + Math.sin(t * 0.13 + ph) * M.drift * 6 + t * M.drift * (b - 0.5)) % W + W) % W;
        const y = z.y0 + ((b * H + Math.cos(t * 0.11 + ph * 1.3) * M.drift * 6 + t * M.drift * 0.3) % H + H) % H;
        if (!lighting.inView(x, y, 2)) continue;
        const lit = lighting.levelAt(x, y, false) - M.from;
        if (lit <= 0) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * (1.3 + b * 2) + ph); // they catch the light as they turn
        ctx.globalAlpha = Math.min(1, (lit / (1 - M.from)) * M.alpha * tw);
        ctx.fillRect(x, y, 0.75, 0.75);
      }
    }
    ctx.restore();
  }
}
