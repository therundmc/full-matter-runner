// The title picture's frame and the pixel tools its layers are painted with. The picture is pixel art at a low
// logical resolution (LW x LH); each layer is a canvas with margins (M, MY) so it can be shifted for the parallax.
// Layer canvases use layer coordinates (logical + margins): the painters translate by (M, MY) first.
// Flat colours and hard edges only: a light is a few flat steps, never a smooth gradient, never a dither.

export const LW = 384, LH = 216;           // logical picture
export const M = 58, MY = 16;              // layer margins: room for the parallax shift
const CW = LW + 2 * M, CH = LH + 2 * MY;
export const RX = 110, RY = 26;            // parallax range in logical px for a factor of 1

export function canvas(w = CW, h = CH) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}
// a layer canvas whose painters work in logical px (its margins already applied)
export function layer(w = CW, h = CH) {
  const L = canvas(w, h);
  L.g.translate(M, MY);
  return L;
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
export function px(g, col, x, y, w = 1, h = 1) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
// a filled polygon with hard edges: one run of whole pixels per row. pts: [[x, y]...]
export function poly(g, col, pts) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  g.fillStyle = col;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
      if (xb > xa) g.fillRect(xa, y, xb - xa, 1);
    }
  }
}
// a filled ellipse with hard edges (cx, cy its centre, rx, ry its radii)
export function oval(g, col, cx, cy, rx, ry) {
  g.fillStyle = col;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const k = (y + 0.5 - cy) / ry;
    if (k * k >= 1) continue;
    const w = rx * Math.sqrt(1 - k * k), xa = Math.round(cx - w), xb = Math.round(cx + w);
    if (xb > xa) g.fillRect(xa, y, xb - xa, 1);
  }
}
// a light as a few flat steps: nested hard ellipses, each step adding `a` of the colour (draw it with 'lighter')
export function halo(rgb, rx, ry, steps = 3, a = 0.12) {
  const { c, g } = canvas(Math.ceil(rx * 2) + 2, Math.ceil(ry * 2) + 2);
  for (let i = 0; i < steps; i++) {
    const k = 1 - i / steps;
    oval(g, `rgba(${rgb},${a})`, c.width / 2, c.height / 2, rx * k, ry * k);
  }
  return c;
}
// Light a painted layer: dst (a canvas the size of src) gets src multiplied by flat colour bands [{ y0, y1, c: rgb }]
// (Cycle.lightBands, in logical px; oy: where logical y 0 falls on the canvas), keeping src's alpha. A layer is
// painted once as it looks by day; the hour of the day is this.
export function tone(dst, src, bands, oy = MY) {
  const g = dst.getContext('2d'), w = src.width, h = src.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'copy';
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply';
  for (const b of bands) {
    const y0 = Math.max(0, b.y0 + oy), y1 = Math.min(h, b.y1 + oy);
    if (y1 <= y0) continue;
    g.fillStyle = `rgb(${Math.round(b.c[0])},${Math.round(b.c[1])},${Math.round(b.c[2])})`;
    g.fillRect(0, y0, w, y1 - y0);
  }
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return dst;
}
// draw a sprite (a halo: with 'lighter') centred on (x, y), whole pixels
export function centre(g, c, x, y) { g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); }

// ---------------------------------------------------------------- a 3 x 5 pixel font, for the signs far away
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101',
  L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  Q: '010101101110011', W: '101101111111101', Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111',
  2: '110001010100111', 4: '101101111001001', 9: '111101111001110', '-': '000000111000000', '.': '000000000000010',
  ' ': '000000000000000', '$': '011110010011110',
};
// the pixels of one letter: [[x, y]...]
export function glyph(ch) {
  const s = GLYPHS[ch] || GLYPHS[' '], out = [];
  for (let i = 0; i < 15; i++) if (s[i] === '1') out.push([i % 3, Math.floor(i / 3)]);
  return out;
}
// a line of it, top-left at (x, y), each pixel `k` px wide, `gap` px between letters
export function pixText(g, str, x, y, col, k = 1, gap = 1) {
  g.fillStyle = col;
  [...str].forEach((ch, i) => {
    for (const [gx, gy] of glyph(ch)) g.fillRect(x + i * (3 * k + gap) + gx * k, y + gy * k, k, k);
  });
}
