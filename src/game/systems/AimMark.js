// The shapes of the LOCK concept's marks as lists of pixels (data/aim.js AIM.lock, AIM.worn; render/AimArt.js lays
// them down): worn paint, a stencil sprayed on the floor a long time ago. The wear is a hash of the mark's own bits
// (never of the frame or of where it stands), so a mark keeps its chips while its man walks, and two men do not
// wear the same. DOM-free, pure.
import { AIM } from '../data/aim.js';

const TAU = Math.PI * 2;

// a number 0..1 out of two whole numbers, the same every time
export function grit(seed, i) {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((i | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// what is left of bit `i` of the mark `seed`: 0 chipped away, W.fade worn thin, 1 whole
export function wear(seed, i, W = AIM.worn) {
  const g = grit(seed, i);
  return g < W.chip ? 0 : g < W.chip + W.thin ? W.fade : 1;
}

// A stencilled circle: `arcs` arcs of `span` rad each, the first centred on `turn`, `width` px thick at radius r,
// the bridges of the stencil left bare between them. Returns [{ x, y, k }]: whole px offsets from its middle and how
// much paint is left there (1 whole, W.fade thin; the chipped ones are not in the list). The wear goes in flakes of
// W.run px along each arc, counted from the arc's own middle: it turns with the arc and stays put under it.
export function ringBits(seed, r, arcs, span, turn = 0, width = 1, W = AIM.worn) {
  const out = [], R = Math.ceil(r + width), step = TAU / arcs, lo = r - 0.5, hi = r + width - 0.5;
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y);
      if (d < lo || d >= hi) continue;
      const rel = (((Math.atan2(y, x) - turn + step / 2) % TAU) + TAU) % TAU, n = Math.floor(rel / step), off = rel - n * step - step / 2;
      if (Math.abs(off) > span / 2) continue;
      const k = wear(seed, n * 256 + Math.floor(off * r / W.run) + 128, W);
      if (k > 0) out.push({ x, y, k });
    }
  }
  return out;
}

// A stencilled bar `len` px long, centred on 0: [{ u, k }] along it, worn in the same flakes
export function barBits(seed, len, W = AIM.worn) {
  const out = [], h = Math.floor(len / 2);
  for (let u = -h; u <= h; u++) {
    const k = wear(seed, Math.floor(u / W.run) + 128, W);
    if (k > 0) out.push({ u, k });
  }
  return out;
}

// A stencilled chevron pointing along +x, its tip at (0, 0), arms `size` px long and two px thick. Returns
// [{ u, v, k }]: u along its way, v across, k as above. The tip is never chipped (it is what points).
export function chevronBits(seed, size, W = AIM.worn) {
  const out = [];
  for (let n = 0; n <= size; n++) {
    for (const side of [-1, 1]) {
      if (n === 0 && side > 0) continue;
      // one hash for the two px of the arm's thickness: paint goes in flakes, not in single dots
      const k = n === 0 ? 1 : wear(seed, n * 2 + (side > 0 ? 1 : 0), W);
      if (k > 0) for (const back of [0, 1]) out.push({ u: -(n + back), v: n * side, k });
    }
  }
  return out;
}

// the stray specks of spray round a mark of radius r: [{ x, y }], W.flecks of them at most, the same every time
export function flecks(seed, r, W = AIM.worn) {
  const out = [];
  for (let i = 0; i < W.flecks; i++) {
    const a = grit(seed, 900 + i) * TAU, d = r + W.stray[0] + grit(seed, 950 + i) * (W.stray[1] - W.stray[0]);
    out.push({ x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d) });
  }
  return out;
}

// how tight the circle is: R.r[0] round a man near the line, R.r[1] once the line is on him, closing in over
// R.snap s (`age`: s since it took him); whole px
export function ringRadius(on, age, R = AIM.lock.ring) {
  if (!on) return R.r[0];
  return Math.round(R.r[1] + (R.r[0] - R.r[1]) * Math.max(0, 1 - age / R.snap));
}
