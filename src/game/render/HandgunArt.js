// A handgun in the fist (weapons.js hold 'side'), turned three-quarters: seen from above, both the top of its slide
// and its side show. Built at run time from the side-on sprite: the side is squashed across its height about the bore
// (CANT.f of it shows; the barrel stays where it was, so does the muzzle), the top of the slide is laid over it as a
// lit band `deck` world px wide (the sights standing on it), and everything under the line the fist closes on (grip,
// guard, magazine well) is taken out, the cut edged with the outline. The image is as wide as the sprite and CANT.pad
// rows taller at top and bottom, so its middle line stays the sprite's.
import { PALETTE } from '../Config.js';
import { hexRgb } from '../../engine/math.js';

export const CANT = { f: 0.7, pad: 4 };
// how far the top of the slide goes from its side's steel toward its edge's highlight: its far row, the others
const BAND = [0.2, 0.4];

// world px off the sprite's middle line, held canted: the line the fist closes on (squashed toward the bore as the
// rest of the side) and the fist's centre (as far under that line as it is side-on)
export const cantHide = (d) => d.bore + (d.hide - d.bore) * CANT.f;
export const cantPalm = (d) => cantHide(d) + d.palm - d.hide;

// n rows from `a` shown on m rows, the first and the last kept
const pick = (a, n, m, j) => a + (m > 1 ? Math.round((j * (n - 1)) / (m - 1)) : 0);

// The rows of the canted image of a sprite h rows high at k world px per row, whose slide has its top outline on
// sprite row `rim` (pure: tests): map[i] = the sprite row shown on image row i (-1: none), band = image rows [b0, b1)
// of the top of the slide, cut = the image row edged with the outline (sprite row cutFrom, everything under it gone).
export function cantRows(h, k, d, rim) {
  const f = CANT.f, pad = CANT.pad, map = new Array(h + 2 * pad).fill(-1);
  const bore = Math.ceil(h / 2 + d.bore / k - 0.5);        // first row under the bore line: it does not move
  const cutFrom = Math.round(h / 2 + d.hide / k), cut = Math.round(h / 2 + cantHide(d) / k);
  const nA = bore - rim - 1, mA = Math.max(1, Math.round(nA * f)), nB = cutFrom - bore, mB = Math.max(1, cut - bore);
  for (let j = 0; j < mA; j++) map[pad + bore - mA + j] = pick(rim + 1, nA, mA, j);
  for (let j = 0; j < mB; j++) map[pad + bore + j] = pick(bore, nB, mB, j);
  map[pad + cut] = cutFrom;
  const b1 = bore - mA, b0 = b1 - Math.max(1, Math.round(d.deck / k));
  for (let y = 0; y <= rim; y++) map[pad + y - (rim + 1 - b0)] = y; // the outline and what stands on it, lifted
  return { map, band: [pad + b0, pad + b1], cut: pad + cut, cutFrom };
}

const mixRGB = (a, b, t, out, o) => { for (let i = 0; i < 3; i++) out[o + i] = Math.round(a[i] + (b[i] - a[i]) * t); out[o + 3] = 255; };

// the canted image of handgun d's sprite img (cached; a sprite with no slide to find, a placeholder, is left as it is)
const CANTED = new WeakMap();
export function cantedGun(img, d) {
  let c = CANTED.get(img);
  if (c) return c;
  const w = img.width, h = img.height, k = img.k || 1;
  const sc = document.createElement('canvas');
  sc.width = w; sc.height = h;
  const sg = sc.getContext('2d');
  sg.drawImage(img, 0, 0);
  const src = sg.getImageData(0, 0, w, h).data, at = (x, y) => (y * w + x) * 4, on = (x, y) => src[at(x, y) + 3] > 0;
  const rgb = (x, y) => [src[at(x, y)], src[at(x, y) + 1], src[at(x, y) + 2]];
  // the top of the slide: the row most columns start on
  const tops = new Array(w), count = new Array(h).fill(0);
  for (let x = 0; x < w; x++) { let y = 0; while (y < h && !on(x, y)) y++; tops[x] = y; if (y < h) count[y]++; }
  const rim = count.indexOf(Math.max(...count));
  const deck = (x) => tops[x] <= rim && on(x, rim); // a column of the slide (or of something standing on it)
  // the top of the slide is lit metal, between the steel of its side (the colour most of the row under its edge has)
  // and the highlight of that edge; a sight standing on it darkens its middle
  const common = (y) => {
    const n = new Map();
    for (let x = 0; x < w; x++) if (y < h && deck(x) && on(x, y)) { const key = rgb(x, y).join(); n.set(key, (n.get(key) || 0) + 1); }
    return n.size ? [...n].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number) : null;
  };
  const hi = common(rim + 1), lo = common(rim + 2);
  if (!hi || !lo) { CANTED.set(img, img); return img; }
  const R = cantRows(h, k, d, rim), H = h + 2 * CANT.pad;
  c = document.createElement('canvas');
  c.width = w; c.height = H; c.k = k;
  const g = c.getContext('2d'), out = g.createImageData(w, H), o = out.data, ink = hexRgb(PALETTE.ink);
  const [b0, b1] = R.band, mid = (b0 + b1 - 1) >> 1;
  for (let x = 0; x < w; x++) {
    const top = deck(x);
    for (let i = 0; i < H; i++) {
      const y = R.map[i], p = (i * w + x) * 4;
      if (i >= b0 && i < b1) {
        if (!top) continue;
        if (tops[x] < rim && i === mid) mixRGB(ink, lo, 0.35, o, p);
        else mixRGB(lo, hi, i === b0 ? BAND[0] : BAND[1], o, p);
      } else if (y >= 0 && (y > rim || top) && on(x, y)) {
        if (i === R.cut) { o.set(ink, p); o[p + 3] = 255; } else { const q = at(x, y); o.set(src.subarray(q, q + 4), p); }
      }
    }
  }
  g.putImageData(out, 0, 0);
  CANTED.set(img, c);
  return c;
}
