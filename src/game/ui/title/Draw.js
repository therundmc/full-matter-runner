// The title picture's frame and the pixel helpers its layers are painted with. The picture is pixel art at a low
// logical resolution (LW x LH); each layer is a canvas with margins (M, MY) so it can be shifted for the parallax.
// Layer canvases use layer coordinates (logical + margins); the painters translate by (M, MY) first.
import { clamp, smooth } from './Timeline.js';

export const LW = 384, LH = 216;           // logical picture
export const M = 58, MY = 16;              // layer margins: room for the parallax shift
export const CW = LW + 2 * M, CH = LH + 2 * MY;
export const RX = 110, RY = 26;            // parallax range in logical px for a factor of 1
export const GY = 146;                     // foot of the facades
export const KERB = 158;                   // kerb top
export const ROAD = 165;                   // road starts (after kerb face + gutter)
export const F = { far: 0.02, mid: 0.05, bar: 0.1, near: 0.24, fg: 0.36 };
// ground row parallax: the far edge of the pavement moves with the facades, the bottom of the screen with the near plane
export const rowF = (y) => F.bar + clamp((y - GY) / (LH - GY), 0, 1) * (F.near - F.bar);
// how much bigger things look at that ground row (0.6 at the foot of the facades, 1.3 at the bottom of the picture)
export const persp = (y) => 0.6 + 0.7 * smooth(GY, LH, y);

export function canvas(w = CW, h = CH) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}
// seeded generator for the painters (the same picture every time)
export function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function px(g, col, x, y, w = 1, h = 1) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); }
export function line(g, col, x0, y0, x1, y1) {
  g.fillStyle = col;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
export function poly(g, col, pts) {
  g.fillStyle = col;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
}
// hard alpha edges after path fills (pixel art, no soft fringes)
export function crisp(c) {
  const g = c.getContext('2d'), id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 110 ? 0 : 255;
  g.putImageData(id, 0, 0);
}
// a little per pixel noise on the albedo: grit, and no flat programmer colour
export function grain(c, amt, seed) {
  const g = c.getContext('2d'), id = g.getImageData(0, 0, c.width, c.height), d = id.data, r = rand(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const n = 1 + (r() - 0.5) * amt;
    d[i] *= n; d[i + 1] *= n; d[i + 2] *= n;
  }
  g.putImageData(id, 0, 0);
}
// lit = albedo * (ambient + lights); light { x, y, r, c, k, sy (vertical squash on the ground), up (factor above it) }.
// The albedo may be a cropped piece of a layer (ox, oy). Without ambient the result is cropped to the lights' reach.
// The result carries its place in the layer (ox, oy): draw it with put().
export function shade(src, lights, amb, ambY = null) {
  const w = src.width, h = src.height, sx = src.ox || 0, sy = src.oy || 0;
  const d = src.px || (src.px = src.getContext('2d').getImageData(0, 0, w, h).data);   // read once per albedo
  let x0 = 0, y0 = 0, x1 = w, y1 = h;
  if (!amb) {
    x0 = w; y0 = h; x1 = 0; y1 = 0;
    for (const L of lights) {
      const ry = L.r / (L.sy || 1);
      x0 = Math.min(x0, L.x - L.r + M - sx); x1 = Math.max(x1, L.x + L.r + M - sx);
      y0 = Math.min(y0, L.y - ry + MY - sy); y1 = Math.max(y1, L.y + ry + MY - sy);
    }
    x0 = clamp(Math.floor(x0), 0, w - 1); y0 = clamp(Math.floor(y0), 0, h - 1);
    x1 = clamp(Math.ceil(x1), x0 + 1, w); y1 = clamp(Math.ceil(y1), y0 + 1, h);
  }
  const ow = x1 - x0, oh = y1 - y0, { c, g } = canvas(ow, oh);
  const od = g.createImageData(ow, oh), o = od.data;
  const a = amb || [0, 0, 0];
  for (let y = y0; y < y1; y++) {
    const ly = y + sy - MY, ka = ambY ? ambY(ly) : 1;
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3]) continue;
      const lx = x + sx - M;
      let lr = a[0] * ka, lg = a[1] * ka, lb = a[2] * ka;
      for (const L of lights) {
        const dx = lx - L.x, dy = (ly - L.y) * (L.sy || 1), q = dx * dx + dy * dy;
        if (q >= L.r * L.r) continue;
        let f = 1 - Math.sqrt(q) / L.r;
        f *= f * L.k;
        if (L.up !== undefined && ly < L.y) f *= L.up;
        lr += L.c[0] * f; lg += L.c[1] * f; lb += L.c[2] * f;
      }
      const j = ((y - y0) * ow + x - x0) * 4;
      o[j] = d[i] * lr; o[j + 1] = d[i + 1] * lg; o[j + 2] = d[i + 2] * lb; o[j + 3] = d[i + 3];
    }
  }
  g.putImageData(od, 0, 0);
  c.ox = x0 + sx; c.oy = y0 + sy;
  return c;
}
// draw a (possibly cropped) layer piece at its place, shifted by (dx, dy)
export function put(g, c, dx = 0, dy = 0) { g.drawImage(c, (c.ox || 0) + dx, (c.oy || 0) + dy); }
// keep only the part of a layer-sized canvas that holds anything (with a margin), remembering where it was
export function cropTo(src, x0, y0, x1, y1) {
  const { c, g } = canvas(x1 - x0, y1 - y0);
  g.drawImage(src, -x0, -y0);
  c.ox = x0; c.oy = y0;
  return c;
}
// soft glow sprite: radial gradient, drawn scaled with smoothing on
export function glowSprite(rgb, size = 64) {
  const { c, g } = canvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.25, `rgba(${rgb},0.45)`);
  gr.addColorStop(0.6, `rgba(${rgb},0.12)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}
// cheap blur (works everywhere): down then up with smoothing
export function blur(src, k) {
  const w = Math.max(1, Math.round(src.width / k)), h = Math.max(1, Math.round(src.height / k));
  const a = canvas(w, h); a.g.imageSmoothingEnabled = true; a.g.drawImage(src, 0, 0, w, h);
  const b = canvas(src.width, src.height); b.g.imageSmoothingEnabled = true; b.g.drawImage(a.c, 0, 0, src.width, src.height);
  return b.c;
}
