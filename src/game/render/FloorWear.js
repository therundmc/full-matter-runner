// The wear of the floors (WEAR in data/floorwear.js): cracks that run on over several tiles, potholes, a patched
// road, oil down the lanes, the dirt along the foot of the walls, split and gaping boards, glass rings and burns,
// gum on the pavement... Planned once from the level (planWear: seeded by its name, the same every time) and painted
// into the floor's pixels (paintWear, on an ImageData-like { data, width, height } at `s` pixels per world px), each
// mark on its own surface only and stopped by the walls, so nothing follows the 32 px grid of the tiles.
// DOM-free: MapRenderer hands it the floor's pixels. The light comes from the top left, as on every sprite.
import { TILE } from '../Config.js';
import { WEAR } from '../data/floorwear.js';
import { TAU, seeded, hashString, hexRgb, smooth } from '../../engine/math.js';

const OIL = hexRgb('#16141c'), GRIME = hexRgb('#2a2420'), TAR = hexRgb('#34343f'), GRAVEL = hexRgb('#8a857c'), GLASS = hexRgb('#b4dcd2');
const HOLE = hexRgb('#2e2c2c'), SOOT = hexRgb('#140c08'), SCORCH = hexRgb('#5a3a20'), RUBBER = hexRgb('#141018');
const FILTER = hexRgb('#c88a4a'), PAPER = hexRgb('#e2dccc'), ASHEN = hexRgb('#6a6670'), SHELL = hexRgb('#a8804a'), SHELL_L = hexRgb('#d0ac70');
const DRINK = hexRgb('#4a3010'), GLITTER = ['#f4e4b0', '#e8eef8', '#ffc8e8', '#c8f4ff'].map(hexRgb);
const GUM = hexRgb('#2a262c'), LEAF = hexRgb('#3c5430'), TIP = hexRgb('#6c8a46'), BACKING = hexRgb('#c8bca0');
const PATCHED = hexRgb('#4a4c56'), CEMENT = hexRgb('#55525a'), WORN = hexRgb('#8a8078'), WOOD_DARK = hexRgb('#3a2418');
// the boards of the wood floor, world px from the top of a tile (kept in step with FL_WOOD_ROWS in
// tools/generate_assets.py: 5, 6, 5, 5, 6, 5); the seam is the last pixel row of each board
const BOARDS = [0, 5, 11, 16, 21, 27, 32];
const DAMP = hexRgb('#3a4a3a'), RUST = hexRgb('#7a4a26'), STEEL = hexRgb('#6a707a'), STEEL_L = hexRgb('#9aa0aa');
const LINT = hexRgb('#b4bccc');
const DRAIN = 5; // px across a floor drain's grate
const GAP = 20; // px: two marks of a kind never closer on a surface

// smooth value noise 0..1 on a seeded lattice
function valueNoise(R) {
  const N = 64, lat = Float32Array.from({ length: N * N }, () => R());
  const at = (x, y) => lat[(y & (N - 1)) * N + (x & (N - 1))];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = smooth(x - i), v = smooth(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return a + (b - a) * v;
  };
}

// the surface of each tile (an index in the names of WEAR.surfaces), -1 where there is none: walls, windows, the void
export function surfaces(map, cfg = WEAR) {
  const names = Object.keys(cfg.surfaces), of = {};
  names.forEach((n, i) => { for (const f of cfg.surfaces[n].floors) of[f] = i; });
  const surf = new Int8Array(map.w * map.h).fill(-1);
  for (let i = 0; i < surf.length; i++) {
    const x = i % map.w, y = Math.floor(i / map.w), f = map.floor[i], ch = map.at(x, y);
    if (f && of[f] !== undefined && ch !== 'G' && ch !== 'F' && !map.isWallChar(x, y)) surf[i] = of[f];
  }
  return { names, surf };
}

// where every mark goes: { names, surf, marks: [{ kind, s (surface), x, y (world px), seed, o (options) }] }
export function planWear(map, level = {}, cfg = WEAR) {
  const { names, surf } = surfaces(map, cfg);
  const R = seeded(hashString(level.name || 'level') ^ 0x5bd1e995);
  const marks = [], W = map.w;
  const wall = (x, y) => x >= 0 && y >= 0 && x < W && y < map.h && surf[y * W + x] === -1;
  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  names.forEach((name, id) => {
    const S = cfg.surfaces[name], cells = [];
    for (let i = 0; i < surf.length; i++) if (surf[i] === id) cells.push(i);
    if (!cells.length) return;
    const byWall = cells.filter((i) => SIDES.some(([dx, dy]) => wall((i % W) + dx, Math.floor(i / W) + dy)));
    for (const [kind, per, o = {}] of S.marks || []) {
      const want = (per * cells.length) / 100, n = Math.floor(want) + (R() < want % 1 ? 1 : 0);
      const pool = o.at === 'wall' ? byWall : cells;
      if (!pool.length) continue;
      for (let k = 0, tries = 0; k < n && tries < n * 12; tries++) {
        const i = pool[Math.floor(R() * pool.length)], cx = i % W, cy = Math.floor(i / W);
        let x = (cx + R()) * TILE, y = (cy + R()) * TILE;
        if (o.at === 'wall') {
          // at the foot of one of the walls beside it
          const sides = SIDES.filter(([dx, dy]) => wall(cx + dx, cy + dy)), [dx, dy] = sides[Math.floor(R() * sides.length)];
          const off = 1.5 + R() * 3;
          if (dx) x = dx > 0 ? (cx + 1) * TILE - off : cx * TILE + off;
          else y = dy > 0 ? (cy + 1) * TILE - off : cy * TILE + off;
        } else if (o.at === 'joint') {
          // in the joint between two slabs (the tile's top or left edge)
          if (R() < 0.5) x = cx * TILE + 0.25; else y = cy * TILE + 0.25;
        }
        if (marks.some((m) => m.kind === kind && m.s === id && Math.hypot(m.x - x, m.y - y) < GAP)) continue;
        marks.push({ kind, s: id, x, y, seed: Math.floor(R() * 4294967296), o });
        k++;
      }
    }
  });
  // the life of a room, laid by the level (`grime`: [kind, col0, row0, col1, row1, n, options?], n marks of that kind
  // somewhere in the tile rectangle: drink rings and spills by a counter, butts and peanut shells along it...) and the
  // paths worn by feet (`worn`: [col0, row0, col1, row1, width px], from one point to the other)
  const surfAt = (x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return tx < 0 || ty < 0 || tx >= W || ty >= map.h ? -1 : surf[ty * W + tx];
  };
  for (const [kind, c0, r0, c1, r1, n, o = {}] of level.grime || []) {
    if (o.at === 'point') {
      // the one mark at (c0, r0) exactly (a ring round a stage), seeded by where it is: it moves no other mark
      const x = c0 * TILE, y = r0 * TILE, s = surfAt(x, y);
      if (s >= 0) marks.push({ kind, s, x, y, seed: hashString(`${kind}${x},${y}`), o });
      continue;
    }
    for (let k = 0, tries = 0; k < n && tries < n * 12; tries++) {
      const x = (c0 + R() * (c1 + 1 - c0)) * TILE, y = (r0 + R() * (r1 + 1 - r0)) * TILE, s = surfAt(x, y);
      if (s < 0 || marks.some((m) => m.kind === kind && Math.hypot(m.x - x, m.y - y) < (o.gap ?? 8))) continue;
      marks.push({ kind, s, x, y, seed: Math.floor(R() * 4294967296), o });
      k++;
    }
  }
  for (const [c0, r0, c1, r1, w = 12] of level.worn || []) {
    const x = c0 * TILE, y = r0 * TILE, s = surfAt(x, y);
    if (s >= 0) marks.push({ kind: 'path', s, x, y, seed: Math.floor(R() * 4294967296), o: { to: [c1 * TILE, r1 * TILE], w } });
  }
  return { names, surf, marks };
}

// the floor's pixels, drawn on one surface at a time (`id`). Coordinates are the whole floor's (w, h: its fine
// pixels); img holds the strip of it from fine x `ox` on (a chunk of a long map), what falls outside is not painted
class Pixels {
  constructor(img, s, map, surf, ox = 0) {
    this.d = img.data; this.dw = img.width; this.x0 = ox; this.x1 = ox + img.width;
    this.w = map.w * TILE * s; this.h = img.height;
    this.s = s; this.map = map; this.surf = surf; this.tw = TILE * s; this.id = -1;
  }

  // the surface under the fine pixel (px, py), -1 off the map
  at(px, py) {
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return -1;
    return this.surf[Math.floor(py / this.tw) * this.map.w + Math.floor(px / this.tw)];
  }

  // shade the fine pixel (px, py) by d if it is on the current surface, pulled toward the colour col by k
  tint(px, py, d, col = null, k = 0) {
    px = Math.floor(px); py = Math.floor(py);
    if (px < this.x0 || px >= this.x1 || this.at(px, py) !== this.id) return;
    const D = this.d, i = (py * this.dw + px - this.x0) * 4;
    for (let c = 0; c < 3; c++) {
      let v = D[i + c] + d;
      if (col && k > 0) v += (col[c] - v) * k;
      D[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
}


const put = (m, P, px, py, k) => { const key = py * P.w + px; if (!(m.get(key) >= k)) m.set(key, k); };
const apply = (P, m, fn) => { for (const [key, k] of m) fn(key % P.w, Math.floor(key / P.w), k); };
const span = (r, R, lo, hi) => (r ? r[0] + R() * (r[1] - r[0]) : lo + R() * (hi - lo));

// a wandering line from (x, y) world px heading a, len world px long: the fine pixels it crosses and their weight,
// each counted once (in `out`), tapered at both ends (only at its far end with `from`), stopped at the surface's
// edge. o: curve (rad a step), kink (odds a step of a sharp turn), wide (odds a step is two pixels wide), branch
// (branches per world px), k (weight), taper (world px)
function walk(P, R, x, y, a, len, o = {}, out = new Map()) {
  const s = P.s, n = Math.round(len * s), taper = (o.taper ?? 4) * s, depth = o.depth ?? 0;
  const curve = o.curve ?? 0.05, kink = o.kink ?? 0.01, w = o.k ?? 1;
  let fx = x * s, fy = y * s;
  for (let i = 0; i < n; i++) {
    const px = Math.floor(fx), py = Math.floor(fy);
    if (P.at(px, py) !== P.id) break;
    const k = smooth((o.from ? n - i : Math.min(i + 1, n - i)) / taper) * w;
    put(out, P, px, py, k);
    if (o.wide && R() < o.wide) {
      if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) put(out, P, px, py + 1, k * 0.6); else put(out, P, px + 1, py, k * 0.6);
    }
    a += (R() - 0.5) * 2 * curve;
    if (R() < kink) a += (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.5);
    if (o.branch && depth < 2 && R() < o.branch / s) {
      const b = a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6);
      walk(P, R, fx / s, fy / s, b, ((n - i) / s) * (0.25 + R() * 0.35),
        { ...o, from: true, depth: depth + 1, k: w * 0.7, branch: o.branch * 0.5, wide: 0 }, out);
    }
    fx += Math.cos(a); fy += Math.sin(a);
  }
  return out;
}

// a radius that wanders round a shape (a few sines of random phase, mostly broad ones: a lobed blot, never a
// star), f(angle) about 1
function ragged(R, amp) {
  const p = [R() * TAU, R() * TAU, R() * TAU];
  const f = (a) => 1 + amp * (0.6 * Math.sin(2 * a + p[0]) + 0.3 * Math.sin(3 * a + p[1]) + 0.1 * Math.sin(7 * a + p[2]));
  f.amp = amp;
  return f;
}

// a ragged ellipse (radii rx, ry world px, turned by rot): fn(px, py, e, ux, uy) on each fine pixel whose normalised
// radius e (1 on the rim) is under `reach`, (ux, uy) the way from the centre
function blob(P, x, y, rx, ry, rot, rag, fn, reach = 1) {
  const s = P.s, c = Math.cos(rot), sn = Math.sin(rot), m = Math.max(rx, ry) * reach * (1 + rag.amp) + 1;
  // the rag never takes the rim further out than 1 + amp: past that, no need for its angle (a hair of slack)
  const far = (reach * (1 + Math.abs(rag.amp)) * (1 + 1e-9)) ** 2;
  for (let py = Math.floor((y - m) * s); py <= Math.ceil((y + m) * s); py++) {
    for (let px = Math.floor((x - m) * s); px <= Math.ceil((x + m) * s); px++) {
      if (P.at(px, py) !== P.id) continue;
      const wx = (px + 0.5) / s - x, wy = (py + 0.5) / s - y;
      const u = (wx * c + wy * sn) / rx, v = (-wx * sn + wy * c) / ry;
      if (u * u + v * v > far) continue;
      const e = Math.hypot(u, v) / rag(Math.atan2(v, u));
      if (e >= reach) continue;
      const dl = Math.hypot(wx, wy) || 1;
      fn(px, py, e, wx / dl, wy / dl);
    }
  }
}

// a crack grown both ways from (x, y): dark, the lower right edge of it catching a little light
function crack(P, R, x, y, o = {}) {
  const len = span(o.len, R, 24, 80), d = o.d ?? -12, lit = o.lit ?? 3, a = R() * TAU;
  const opts = { curve: 0.06, kink: 0.012, branch: o.branch ?? 0.02, wide: o.wide ?? 0.15, from: true, taper: 6 };
  const m = walk(P, R, x, y, a, len / 2, opts);
  walk(P, R, x, y, a + Math.PI, len / 2, opts, m);
  apply(P, m, (px, py, k) => {
    P.tint(px, py, d * k);
    if (lit && !m.has((py + 1) * P.w + px + 1)) P.tint(px + 1, py + 1, lit * k);
  });
}

// the board of the wood floor under world y: its first and last fine pixel rows (seam excluded) and its seam row
function board(P, y) {
  const s = P.s, ty = Math.floor(y / TILE) * TILE, ly = y - ty;
  let j = 0;
  while (j < BOARDS.length - 2 && ly >= BOARDS[j + 1]) j++;
  return { top: (ty + BOARDS[j]) * s, bot: (ty + BOARDS[j + 1]) * s - 2, seam: (ty + BOARDS[j + 1]) * s - 1 };
}


// every kind of mark: fn(P, R, x, y, o), (x, y) its middle in world px, R its own random numbers
const KINDS = {
  crack,

  // a pothole: the hollow in shade under its top left lip, its lower right wall lit, gravel at the bottom, the edge
  // crumbling and a few cracks running out of it
  pothole(P, R, x, y, o) {
    const r = span(o.r, R, 6, 11), q = 0.6 + R() * 0.3, rot = R() * TAU, edge = ragged(R, 0.22);
    for (let n = 2 + Math.floor(R() * 3); n > 0; n--) {
      const b = R() * TAU;
      const m = walk(P, R, x + Math.cos(b) * r * 0.85, y + Math.sin(b) * r * q * 0.85, b, r * (0.8 + R() * 1.6), { curve: 0.08, from: true });
      apply(P, m, (px, py, k) => P.tint(px, py, -10 * k));
    }
    // seen from above, lit from the top left: the wall under the top left lip is in shade, the far (lower right)
    // wall faces the light; a dark line where the hole breaks off the road, its rim worn pale on the lit side
    blob(P, x, y, r, r * q, rot, edge, (px, py, e, ux, uy) => {
      const lit = (ux + uy) * 0.707;
      if (e < 0.9) {
        const wall = smooth((e - 0.45) / 0.4);
        let d = -20 + wall * (lit > 0 ? lit * 22 : lit * 8);
        if (e < 0.6 && lit < 0) d += lit * 6; // its floor in the lip's shadow
        P.tint(px, py, d, HOLE, 0.25);
        if (e < 0.65 && R() < 0.12) P.tint(px, py, 12, GRAVEL, 0.3);
      } else if (e < 1) {
        P.tint(px, py, lit < 0 ? -24 : -12, HOLE, 0.3); // the broken edge
      } else {
        const t = 1 - (e - 1) / 0.4;
        P.tint(px, py, (lit < 0 ? 5 : -6) * t * (0.5 + R() * 0.7));
        if (R() < 0.06) P.tint(px, py, R() < 0.5 ? 9 : -9, GRAVEL, 0.15);
      }
    }, 1.4);
  },

  // alligator cracking: a patch of the road broken into small cells
  crazing(P, R, x, y) {
    const rx = 12 + R() * 10, ry = rx * (0.6 + R() * 0.3), inside = new Map(), m = new Map();
    blob(P, x, y, rx, ry, R() * TAU, ragged(R, 0.3), (px, py, e) => inside.set(py * P.w + px, e), 1.1);
    apply(P, inside, (px, py, e) => P.tint(px, py, -3 * smooth((1.1 - e) / 0.4)));
    for (let n = 12 + Math.floor(R() * 9); n > 0; n--) {
      const a = R() * TAU, d = Math.sqrt(R());
      walk(P, R, x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, R() * TAU, 4 + R() * 7, { curve: 0.05, kink: 0.1, taper: 1.5 }, m);
    }
    apply(P, m, (px, py, k) => { if (inside.has(py * P.w + px)) { P.tint(px, py, -10 * k); P.tint(px + 1, py + 1, 2 * k); } });
  },

  // a rectangle of the road cut out and filled again: a darker, finer tarmac, its edge sealed with a wobbly tar band
  patch(P, R, x, y) {
    const s = P.s, w = 22 + R() * 34, h = 14 + R() * 18, x0 = x - w / 2, y0 = y - h / 2, band = valueNoise(R);
    for (let py = Math.floor((y0 - 3) * s); py <= Math.ceil((y0 + h + 3) * s); py++) {
      for (let px = Math.floor((x0 - 3) * s); px <= Math.ceil((x0 + w + 3) * s); px++) {
        const wx = (px + 0.5) / s, wy = (py + 0.5) / s;
        const out = Math.max(x0 - wx, wx - (x0 + w), y0 - wy, wy - (y0 + h)); // < 0 inside, else the distance out
        if (out < -0.5) { P.tint(px, py, -6 + (R() < 0.05 ? (R() < 0.5 ? 5 : -5) : 0), PATCHED, 0.12); continue; }
        if (out < 0) { P.tint(px, py, -12); continue; }
        const reach = 0.6 + band(wx / 6, wy / 6) * 1.6;
        if (out < reach) P.tint(px, py, -5 * (1 - out / reach), TAR, 0.15);
      }
    }
  },

  // a long crack sealed with tar: a soft darker band
  seam(P, R, x, y) {
    const len = 60 + R() * 100, a = R() * TAU, opts = { curve: 0.02, kink: 0.006, wide: 1, from: true, taper: 8 };
    const m = walk(P, R, x, y, a, len / 2, opts);
    walk(P, R, x, y, a + Math.PI, len / 2, opts, m);
    apply(P, m, (px, py, k) => P.tint(px, py, -8 * k, TAR, 0.15 * k));
  },

  // a car's oil: a soft dark blot and a few drops off it
  oil(P, R, x, y) {
    const r = 5 + R() * 6, b = R() * TAU;
    blob(P, x, y, r, r * (0.5 + R() * 0.4), R() * TAU, ragged(R, 0.35), (px, py, e) => {
      const w = smooth((1 - e) / 0.5);
      P.tint(px, py, -10 * w, OIL, 0.3 * w);
    });
    for (let n = 2 + Math.floor(R() * 4); n > 0; n--) {
      const d = r + 2 + R() * 9, dr = 0.8 + R() * 1.2;
      blob(P, x + Math.cos(b) * d + (R() - 0.5) * 4, y + Math.sin(b) * d + (R() - 0.5) * 4, dr, dr * 0.8, 0, ragged(R, 0.2),
        (px, py, e) => P.tint(px, py, -8 * smooth((1 - e) / 0.6), OIL, 0.3));
    }
  },


  // grit and small stones (now and then a sliver of glass), each with its shadow
  grit(P, R, x, y, o) {
    const r = 6 + R() * 10, s = P.s;
    for (let n = 8 + Math.floor(R() * 13); n > 0; n--) {
      const a = R() * TAU, d = Math.sqrt(R()) * r, px = Math.floor((x + Math.cos(a) * d) * s), py = Math.floor((y + Math.sin(a) * d) * s);
      if (o.glass && R() < o.glass) P.tint(px, py, 14, GLASS, 0.45);
      else P.tint(px, py, 12, GRAVEL, 0.3);
      if (R() < 0.3) P.tint(px + 1, py, 8, GRAVEL, 0.2);
      P.tint(px + 1, py + 1, -8);
    }
  },

  // a small piece broken out of the surface: the hollow in shade, its lower right rim lit
  chip(P, R, x, y) {
    const r = 1.4 + R() * 1.8;
    blob(P, x, y, r, r * (0.7 + R() * 0.3), R() * TAU, ragged(R, 0.3), (px, py, e, ux, uy) => {
      if (e < 0.6) P.tint(px, py, -14); else P.tint(px, py, ux + uy > 0 ? 5 : -7);
    });
  },

  // old chewing gum trodden flat: dark dots, a few pale ones
  gum(P, R, x, y) {
    const r = 8 + R() * 12;
    for (let n = 4 + Math.floor(R() * 7); n > 0; n--) {
      const a = R() * TAU, d = Math.sqrt(R()) * r, dr = 0.6 + R() * 0.6, pale = R() < 0.2;
      blob(P, x + Math.cos(a) * d, y + Math.sin(a) * d, dr, dr * (0.7 + R() * 0.3), 0, ragged(R, 0.2),
        (px, py) => (pale ? P.tint(px, py, 6, WORN, 0.2) : P.tint(px, py, -9, GUM, 0.35)));
    }
  },

  // an old spill dried in: a soft patch pulled toward its colour, its rim a touch darker
  stain(P, R, x, y, o) {
    const r = 5 + R() * 9, col = o.col ? hexRgb(o.col) : GRIME, d = o.d ?? -5;
    blob(P, x, y, r, r * (0.6 + R() * 0.4), R() * TAU, ragged(R, 0.35), (px, py, e) => {
      const w = smooth((1 - e) / 0.4);
      P.tint(px, py, d * w + (e > 0.88 ? d * 0.5 : 0), col, 0.18 * w);
    });
  },

  // the ring a dried puddle left, broken here and there
  tide(P, R, x, y, o) {
    const r = 10 + R() * 14, th = 0.7 / r, ph = R() * TAU, d = o.d ?? -6;
    blob(P, x, y, r, r * (0.6 + R() * 0.3), R() * TAU, ragged(R, 0.3), (px, py, e, ux, uy) => {
      if (Math.abs(e - 1) < th) P.tint(px, py, d * (0.5 + 0.5 * Math.sin(4 * Math.atan2(uy, ux) + ph)));
    }, 1 + th);
  },

  // a tuft of weeds in a joint or at the foot of a wall
  weeds(P, R, x, y) {
    const s = P.s, along = R() < 0.5;
    for (let t = 1 + Math.floor(R() * 3); t > 0; t--) {
      const bx = x + (along ? (R() - 0.5) * 6 : 0), by = y + (along ? 0 : (R() - 0.5) * 6);
      P.tint(bx * s, by * s, -12);
      for (let n = 3 + Math.floor(R() * 5); n > 0; n--) {
        const a = R() * TAU, l = (1 + R() * 2) * s;
        for (let i = 0; i <= l; i++) {
          const tip = i > l * 0.6;
          P.tint(bx * s + Math.cos(a) * i, by * s + Math.sin(a) * i, 0, tip ? TIP : LEAF, tip ? 0.5 : 0.65);
        }
      }
    }
  },

  // concrete spalled away: a shallow hollow with the aggregate showing
  spall(P, R, x, y) {
    const r = 3 + R() * 5;
    blob(P, x, y, r, r * (0.6 + R() * 0.4), R() * TAU, ragged(R, 0.5), (px, py, e, ux, uy) => {
      P.tint(px, py, -8, CEMENT, 0.15);
      if (R() < 0.15) P.tint(px, py, R() < 0.5 ? 10 : -10);
      if (e > 0.85) P.tint(px, py, ux + uy > 0 ? 5 : -6);
    });
  },

  // a blister in the roof's bitumen: lit on its top left, its shadow on the lower right
  blister(P, R, x, y) {
    const r = 2.5 + R() * 3.5;
    blob(P, x, y, r, r * (0.6 + R() * 0.4), R() * TAU, ragged(R, 0.2), (px, py, e, ux, uy) => {
      P.tint(px, py, 4 * (1 - e));
      if (e > 0.75) P.tint(px, py, ux + uy > 0 ? -7 : 4);
    });
  },


  // a crack along the grain of a board, over a tile or two
  split(P, R, x, y, o) {
    const { top, bot } = board(P, y);
    if (bot - top < 2) return;
    let row = top + 1 + Math.floor(R() * (bot - top - 1)), px = Math.floor(x * P.s);
    const n = Math.round(span(o.len, R, 14, 70) * P.s), dir = R() < 0.5 ? -1 : 1, m = new Map();
    for (let i = 0; i < n; i++, px += dir) {
      if (P.at(px, row) !== P.id) break;
      const k = smooth(Math.min(i + 1, n - i) / (5 * P.s));
      put(m, P, px, row, k);
      if (k > 0.7 && R() < 0.25 && row + 1 <= bot) put(m, P, px, row + 1, k * 0.5);
      if (R() < 0.04) { const r2 = row + (R() < 0.5 ? -1 : 1); if (r2 > top && r2 < bot) row = r2; }
    }
    apply(P, m, (qx, qy, k) => P.tint(qx, qy, (o.d ?? -14) * k, GRIME, 0.1 * k));
  },

  // the seam between two boards opened and packed with dirt
  gap(P, R, x, y) {
    const { seam } = board(P, y), n = Math.round((24 + R() * 72) * P.s), x0 = Math.floor(x * P.s);
    for (let i = 0; i < n; i++) {
      const k = smooth(Math.min(i + 1, n - i) / (6 * P.s)), px = x0 + i;
      if (P.at(px, seam) !== P.id) break;
      P.tint(px, seam, (R() < 0.06 ? -18 : -10) * k, GRIME, 0.15 * k);
      P.tint(px, seam - 1, -4 * k);
    }
  },

  // a stretch of board broken in: sunk and darker, splintered ends, cracked along it
  broken(P, R, x, y) {
    const { top, bot, seam } = board(P, y), s = P.s, xa = Math.floor(x * s), xb = xa + Math.round((10 + R() * 16) * s);
    const mid = top + Math.floor((bot - top) / 2) + (R() < 0.5 ? 0 : 1);
    for (let py = top; py <= bot; py++) {
      const ja = xa + Math.round((R() - 0.5) * 6), jb = xb + Math.round((R() - 0.5) * 6);
      for (let px = ja; px <= jb; px++) {
        if (px <= ja + 1 || px >= jb - 1) P.tint(px, py, -16, WOOD_DARK, 0.15);
        else P.tint(px, py, py === mid ? -14 : R() < 0.06 ? 8 : -6, WOOD_DARK, 0.1);
      }
    }
    for (let px = xa; px <= xb; px++) { P.tint(px, top - 1, -8); P.tint(px, seam, -6); }
  },

  // a path worn pale by feet (and greyer); o.r: a small patch that size instead (where heels rest)
  wear(P, R, x, y, o) {
    const rx = o.r ?? 24 + R() * 36, ry = o.r ? o.r * 0.65 : 8 + R() * 10, d = o.d ?? 4, grey = o.grey ?? 0.08;
    blob(P, x, y, rx, ry, R() * TAU, ragged(R, 0.3), (px, py, e) => {
      const w = smooth((1 - e) / 0.6);
      P.tint(px, py, d * w, WORN, grey * w);
    });
  },

  // the rings of wet glasses put down on it, one to three, never quite closed
  rings(P, R, x, y) {
    const s = P.s;
    for (let n = 1 + Math.floor(R() * 3); n > 0; n--) {
      const cx = x + (R() - 0.5) * 8, cy = y + (R() - 0.5) * 8, r = 2.5 + R() * 1.5, g0 = R() * TAU, gl = 0.6 + R();
      for (let py = Math.floor((cy - r - 1) * s); py <= Math.ceil((cy + r + 1) * s); py++) {
        for (let px = Math.floor((cx - r - 1) * s); px <= Math.ceil((cx + r + 1) * s); px++) {
          const wx = (px + 0.5) / s - cx, wy = (py + 0.5) / s - cy;
          if (Math.abs(Math.hypot(wx, wy) - r) >= 0.4) continue;
          if ((Math.atan2(wy, wx) - g0 + TAU * 2) % TAU > gl) P.tint(px, py, -7 * (0.6 + 0.4 * R()));
        }
      }
    }
  },

  // a few parallel scratches (a chair dragged, a heel turned), paler than the floor
  scratches(P, R, x, y, o) {
    const a = R() * TAU, nx = -Math.sin(a), ny = Math.cos(a), m = new Map();
    let off = 0;
    for (let n = 2 + Math.floor(R() * 4); n > 0; n--) {
      off += 0.6 + R() * 0.7;
      walk(P, R, x + nx * off + Math.cos(a) * R() * 3, y + ny * off + Math.sin(a) * R() * 3, a, 6 + R() * 12,
        { curve: 0.01, kink: 0, taper: 2, k: 0.6 + R() * 0.4 }, m);
    }
    apply(P, m, (px, py, k) => P.tint(px, py, (o.d ?? 5) * k));
  },

  // cigarettes put out on it: a black pit in a brown ring
  burns(P, R, x, y) {
    for (let n = 1 + Math.floor(R() * 3); n > 0; n--) {
      blob(P, x + (R() - 0.5) * 10, y + (R() - 0.5) * 10, 2.2, 1.8, R() * TAU, ragged(R, 0.25), (px, py, e) => {
        if (e < 0.35) P.tint(px, py, -26, SOOT, 0.5);
        else P.tint(px, py, -8 * (1 - e), SCORCH, 0.25 * (1 - e));
      });
    }
  },

  // cigarette butts trodden out: the filter's tan end, the paper, a smear of ash (a few of them)
  butts(P, R, x, y) {
    const s = P.s;
    for (let n = 1 + Math.floor(R() * 3); n > 0; n--) {
      const bx = x + (R() - 0.5) * 10, by = y + (R() - 0.5) * 10, a = R() * TAU, l = (1.6 + R()) * s;
      for (let i = 0; i <= l; i++) {
        const px = bx * s + Math.cos(a) * i, py = by * s + Math.sin(a) * i;
        P.tint(px, py, 0, i < s * 0.7 ? FILTER : PAPER, i < s * 0.7 ? 0.5 : 0.45);
        P.tint(px + 1, py + 1, -5);
      }
      if (R() < 0.6) P.tint(bx * s - Math.cos(a) * 2, by * s - Math.sin(a) * 2, -4, ASHEN, 0.3);
    }
  },

  // peanut shells dropped under the stools: small tan halves, a few pale
  shells(P, R, x, y) {
    const s = P.s;
    for (let n = 4 + Math.floor(R() * 6); n > 0; n--) {
      const a = R() * TAU, d = Math.sqrt(R()) * 9, px = Math.floor((x + Math.cos(a) * d) * s), py = Math.floor((y + Math.sin(a) * d) * s);
      const pale = R() < 0.35;
      P.tint(px, py, 0, pale ? SHELL_L : SHELL, 0.5);
      P.tint(px + (R() < 0.5 ? 1 : 0), py + 1, 0, SHELL, 0.4);
      P.tint(px + 1, py + 2, -5);
    }
  },

  // a paper napkin crumpled and trodden flat: pale, its creases a shade darker
  napkin(P, R, x, y) {
    const r = 1.5 + R() * 0.8;
    blob(P, x, y, r, r * (0.7 + R() * 0.3), R() * TAU, ragged(R, 0.35), (px, py, e, ux, uy) => {
      P.tint(px, py, R() < 0.2 ? -6 : 0, PAPER, e > 0.8 ? 0.3 : 0.48);
      if (e > 0.85 && ux + uy > 0) P.tint(px + 1, py + 1, -5);
    });
  },

  // a drink spilt and dried sticky: a faint darker patch, its rim a touch darker, glossy here and there (o.col: the
  // drink's colour, champagne paler than beer)
  sticky(P, R, x, y, o) {
    const r = 3 + R() * 4, col = o.col ? hexRgb(o.col) : DRINK;
    blob(P, x, y, r, r * (0.55 + R() * 0.35), R() * TAU, ragged(R, 0.4), (px, py, e) => {
      const w = smooth((1 - e) / 0.5);
      P.tint(px, py, -4 * w + (e > 0.85 ? -3 : 0), col, 0.12 * w);
      if (e < 0.5 && R() < 0.02) P.tint(px, py, 7);
    });
  },

  // glitter shed by the dancers: single specks of gold, silver, pink, a few of them caught bright, scattered thin
  glitter(P, R, x, y, o) {
    const s = P.s, rad = o.r ?? 12;
    for (let n = 10 + Math.floor(R() * 14); n > 0; n--) {
      const a = R() * TAU, d = Math.sqrt(R()) * rad;
      P.tint(Math.floor((x + Math.cos(a) * d) * s), Math.floor((y + Math.sin(a) * d) * s), 6 + R() * 10, GLITTER[Math.floor(R() * GLITTER.length)], 0.3 + R() * 0.25);
    }
  },

  // the pile worn flat in a ring by the feet round something (a stage): o.r px from (x, y), o.w px across, paler and
  // greyer, broken along its way
  halo(P, R, x, y, o) {
    const s = P.s, r = o.r, w = o.w, noise = valueNoise(R), out = r + w;
    for (let py = Math.floor((y - out) * s); py <= Math.ceil((y + out) * s); py++) {
      for (let px = Math.floor((x - out) * s); px <= Math.ceil((x + out) * s); px++) {
        const wx = (px + 0.5) / s - x, wy = (py + 0.5) / s - y, off = Math.abs(Math.hypot(wx, wy) - r);
        if (off >= w) continue;
        const k = smooth(1 - off / w) * smooth((noise((px / s) / 7, (py / s) / 7) - 0.2) / 0.5);
        if (k > 0) P.tint(px, py, (o.d ?? 4) * k, WORN, (o.grey ?? 0.12) * k);
      }
    }
  },

  // the way feet go, worn a little paler and greyer: a soft band from (x, y) to o.to, w px wide, its edges broken
  path(P, R, x, y, o) {
    const s = P.s, [x1, y1] = o.to, w = o.w, dx = x1 - x, dy = y1 - y, L = Math.hypot(dx, dy) || 1, noise = valueNoise(R);
    const x0 = Math.min(x, x1) - w, y0 = Math.min(y, y1) - w, xm = Math.max(x, x1) + w, ym = Math.max(y, y1) + w;
    for (let py = Math.floor(y0 * s); py <= Math.ceil(ym * s); py++) {
      for (let px = Math.floor(x0 * s); px <= Math.ceil(xm * s); px++) {
        const wx = (px + 0.5) / s - x, wy = (py + 0.5) / s - y, t = (wx * dx + wy * dy) / (L * L);
        if (t < 0 || t > 1) continue;
        const off = Math.abs(wx * dy - wy * dx) / L, n = noise((px / s) / 9, (py / s) / 9);
        const k = smooth(1 - off / (w * (0.6 + 0.6 * n))) * smooth(Math.min(t, 1 - t) * L / 16);
        if (k > 0) P.tint(px, py, (o.d ?? 3) * k, WORN, (o.grey ?? 0.06) * k);
      }
    }
  },

  // a floor drain: the damp gone green round it, a square steel grate five px across sunk in the floor (its rim dark
  // on the top left, lit on the lower right, as a hollow is), three slots, a streak of rust running to it
  drain(P, R, x, y, o) {
    const s = P.s, r = o.r ?? 9 + R() * 3, a = R() * TAU;
    blob(P, x, y, r, r * (0.7 + R() * 0.25), a, ragged(R, 0.3), (px, py, e) => {
      const w = smooth((1 - e) / 0.5);
      P.tint(px, py, -6 * w + (e > 0.9 ? -3 : 0), DAMP, 0.16 * w);
    });
    const m = walk(P, R, x + Math.cos(a) * 3, y + Math.sin(a) * 3, a, r * 0.9, { curve: 0.1, from: true, wide: 0.4 });
    apply(P, m, (px, py, k) => P.tint(px, py, -4 * k, RUST, 0.3 * k));
    const x0 = Math.round(x * s) - Math.floor(DRAIN * s / 2), n = DRAIN * s, y0 = Math.round(y * s) - Math.floor(n / 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const rim = i === 0 || j === 0 ? HOLE : i === n - 1 || j === n - 1 ? STEEL_L : null;
        const slot = j > 1 && j < n - 2 && i > 1 && i < n - 2 && Math.floor((i - 2) / (s / 2 || 1)) % 2 === 0;
        P.tint(x0 + i, y0 + j, 0, rim || (slot ? SOOT : STEEL), 1);
      }
    }
  },

  // black rubber heel marks
  scuffs(P, R, x, y, o = {}) {
    const m = new Map(), k0 = o.k ?? 1; // k: how hard they show
    for (let n = 2 + Math.floor(R() * 4); n > 0; n--) {
      walk(P, R, x + (R() - 0.5) * 24, y + (R() - 0.5) * 24, R() * TAU, 3 + R() * 5, { curve: 0.15, kink: 0, taper: 1.5 }, m);
    }
    apply(P, m, (px, py, k) => P.tint(px, py, -12 * k * k0, RUBBER, Math.min(1, 0.25 * k * k0)));
  },

  // lint blown out of a dryer and trodden about: a loose cluster of pale grey-blue specks, a few of them darker
  lint(P, R, x, y, o) {
    const s = P.s, r = o.r ?? 5;
    for (let n = 7 + Math.floor(R() * 6); n > 0; n--) {
      const a = R() * TAU, d = r * R() * R(), px = Math.floor((x + Math.cos(a) * d) * s), py = Math.floor((y + Math.sin(a) * d) * s);
      const dark = R() < 0.25;
      P.tint(px, py, 0, dark ? ASHEN : LINT, dark ? 0.35 : 0.5);
      if (R() < 0.3) P.tint(px + 1, py, 0, LINT, 0.3);
    }
  },

  // the lino torn: its pale backing showing, the edge of the tear dark
  tear(P, R, x, y) {
    const r = 2 + R() * 3;
    blob(P, x, y, r, r * (0.5 + R() * 0.4), R() * TAU, ragged(R, 0.4), (px, py, e) => {
      if (e < 0.8) P.tint(px, py, 10, BACKING, 0.35); else P.tint(px, py, -9);
    });
  },
};

export const WEAR_KINDS = Object.keys(KINDS);


// the tiles across the strip of floor being painted
function cols(P) {
  return [Math.max(0, Math.floor(P.x0 / P.tw)), Math.min(P.map.w - 1, Math.floor((P.x1 - 1) / P.tw))];
}

// dirt gathered along the foot of the walls (and of what `next` lists: the gutter along the kerb), loose grit in it
// (its specks drawn from each tile's own numbers: a strip of the floor is painted as the whole of it would be)
function edges(P, seed, S, names, noise) {
  const E = S.edge;
  if (!E) return;
  const m = P.map, s = P.s, next = new Set((E.next || []).map((n) => names.indexOf(n))), [c0, c1] = cols(P);
  const wallish = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
    const v = P.surf[ty * m.w + tx];
    return v === -1 || next.has(v);
  };
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = c0; tx <= c1; tx++) {
      if (P.surf[ty * m.w + tx] !== P.id) continue;
      const R = seeded((seed ^ Math.imul(tx + 1, 73856093) ^ Math.imul(ty + 1, 19349663) ^ Math.imul(P.id + 1, 83492791)) >>> 0);
      const near = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && wallish(tx + dx, ty + dy)) near.push([dx, dy]);
      if (!near.length) continue;
      const px0 = tx * TILE * s, px1 = (tx + 1) * TILE * s - 1;
      for (let py = ty * TILE * s; py < (ty + 1) * TILE * s; py++) {
        // only the strips within E.w of the edges and corners found can be dirtied: the span of this row they
        // cover (a pixel of slack), walked in the same order (the grit's draws keep their sequence)
        const ly = (py + 0.5) / s - ty * TILE;
        let lo = Infinity, hi = -Infinity;
        for (const [dx, dy] of near) {
          if (dy < 0 ? !(ly < E.w) : dy > 0 ? !(TILE - ly < E.w) : false) continue;
          lo = Math.min(lo, dx > 0 ? TILE - E.w : 0); hi = Math.max(hi, dx < 0 ? E.w : TILE);
        }
        if (lo > hi) continue;
        const pa = Math.max(px0, Math.floor((lo + tx * TILE) * s) - 1), pb = Math.min(px1, Math.ceil((hi + tx * TILE) * s) + 1);
        for (let px = pa; px <= pb; px++) {
          const lx = (px + 0.5) / s - tx * TILE, ly = (py + 0.5) / s - ty * TILE;
          let dist = Infinity;
          for (const [dx, dy] of near) {
            const ex = dx < 0 ? lx : dx > 0 ? TILE - lx : 0, ey = dy < 0 ? ly : dy > 0 ? TILE - ly : 0;
            dist = Math.min(dist, dx && dy ? Math.hypot(ex, ey) : ex + ey);
          }
          if (dist >= E.w) continue;
          const t = 1 - dist / E.w, n = noise(px / s / 5, py / s / 5);
          P.tint(px, py, E.d * t * t * (0.5 + n), GRIME, 0.08 * t);
          if (E.grit && R() < E.grit * t) P.tint(px, py, R() < 0.5 ? 10 : -8, GRAVEL, 0.2);
        }
      }
    }
  }
}

// slabs laid one by one: each tile a shade off the next
function tones(P, S) {
  if (!S.tone) return;
  const m = P.map, T = TILE * P.s, [c0, c1] = cols(P);
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = c0; tx <= c1; tx++) {
      if (P.surf[ty * m.w + tx] !== P.id) continue;
      let h = Math.imul(tx * 374761393 + ty * 668265263, 1274126177);
      h = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      const d = Math.round(S.tone * (2 * h - 1));
      if (d) for (let py = ty * T; py < (ty + 1) * T; py++) for (let px = tx * T; px < (tx + 1) * T; px++) P.tint(px, py, d);
    }
  }
}

// down each traffic lane (level ambient.traffic rows, a chase's lanes): oil dripped in the middle, the tyres'
// tracks either side
function lanes(P, S, level, noise) {
  const L = S.lanes, rows = level.ambient?.traffic || level.chase?.lanes?.map((row) => ({ row }));
  if (!L || !rows) return;
  const s = P.s;
  for (const { row } of rows) {
    const y0 = row * TILE;
    for (let py = Math.floor((y0 - L.gauge - 5) * s); py <= Math.ceil((y0 + L.gauge + 5) * s); py++) {
      const dy = (py + 0.5) / s - y0;
      for (let px = Math.max(0, P.x0); px < Math.min(P.w, P.x1); px++) {
        const wx = (px + 0.5) / s;
        // the drips: a soft broken band, its patches of every length (two octaves), never a dashed line
        if (Math.abs(dy) < 7) {
          const n = noise(wx / 23, row * 7.3) * 0.65 + noise(wx / 6.5 + 40, (y0 + dy) / 5 + 50) * 0.35;
          const k = smooth((n - 0.5) / 0.3) * (1 - Math.abs(dy) / 7) ** 2;
          if (k > 0) P.tint(px, py, L.drip * k, OIL, 0.12 * k);
        }
        const t = Math.abs(Math.abs(dy) - L.gauge);
        if (t < 4) P.tint(px, py, L.track * (1 - t / 4) * (0.6 + 0.4 * noise(wx / 11, dy > 0 ? 90 : 120)));
      }
    }
  }
}

// how far from its middle a mark may paint, world px (a crack's branches, a seam, a pothole's cracks all stay within
// REACH; a halo and a worn path say how far they go)
const REACH = 128;
function reach(m) {
  if (m.kind === 'path') return [Math.min(m.x, m.o.to[0]) - m.o.w - 2, Math.max(m.x, m.o.to[0]) + m.o.w + 2];
  const r = m.kind === 'halo' ? m.o.r + m.o.w + 2 : REACH;
  return [m.x - r, m.x + r];
}

// paint the floor's wear into its pixels: img { data, width, height } is the whole floor at `s` pixels per world px,
// or the strip of it from fine x `ox` on (painted exactly as the whole floor is there: no seam between two strips);
// plan: planWear's, when it is already made
export function paintWear(img, s, map, level = {}, cfg = WEAR, ox = 0, plan = planWear(map, level, cfg)) {
  const P = new Pixels(img, s, map, plan.surf, ox), base = hashString(level.name || 'level');
  const noise = valueNoise(seeded(base + 17));
  plan.names.forEach((name, id) => {
    const S = cfg.surfaces[name];
    P.id = id;
    tones(P, S);
    edges(P, base ^ 0x2c1b3c6d, S, plan.names, noise);
    lanes(P, S, level, noise);
  });
  const x0 = P.x0 / s, x1 = P.x1 / s;
  for (const m of plan.marks) {
    const [a, b] = reach(m);
    if (b < x0 || a > x1) continue;
    P.id = m.s;
    KINDS[m.kind](P, seeded(m.seed), m.x, m.y, m.o);
  }
  return plan;
}

