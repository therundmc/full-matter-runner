// Holes carved into the wall tops: a bullet's entry and exit, a ricochet's scuff, a club's dent. A mark is dug INTO
// the wall where the blow landed, never painted past it: everything is clipped to the wall tiles around it, and only
// the dark of the crater may reach the wall's outline (the outline is bitten inward, never pushed out); the bare rim
// and the cracks stay inside it. Marks landing on an older one dig it out into a gouge (data/materials.js WALL_SCAR).
// Bookkeeping (place, merge, clip rectangles) is plain logic; paint() draws on the wall layer (MapRenderer).
import { TILE, WALL_RIM as RIM } from '../Config.js';
import { rand, randi, chance, TAU } from '../../engine/math.js';
import { WALL_IMPACT, WALL_SCAR } from '../data/materials.js';

const KEEP = 24; // marks remembered per tile (to dig out); older ones only stay painted

export default class WallScars {
  constructor(map) {
    this.map = map;
    this.byTile = new Map(); // tile index -> [{ x, y, r, core, n, kind }]
  }

  // A blow of `kind` at (x, y) on a wall's face whose normal (nx, ny) points out of the wall, size x its spec:
  // the mark it leaves (a new one, or an older one dug out), or null when there is no wall there to carve.
  place(x, y, nx, ny, kind, size = 1) {
    const S = WALL_SCAR, spec = S[kind], m = this.map;
    const r = spec.r * size;
    // its centre sits behind the outline, deep enough for the crater to reach it and bite it
    const deep = RIM + r * 0.35;
    const cx = x - nx * deep, cy = y - ny * deep;
    const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
    if (!m.isWallChar(tx, ty)) return null;
    let best = null, bd = Infinity;
    for (let j = ty - 1; j <= ty + 1; j++) {
      for (let i = tx - 1; i <= tx + 1; i++) {
        for (const s of this.byTile.get(j * m.w + i) || []) {
          const d = Math.hypot(s.x - cx, s.y - cy);
          if (d < (s.r + r) * S.merge && d < bd) { best = s; bd = d; }
        }
      }
    }
    if (best) {
      best.x += (cx - best.x) * 0.3;
      best.y += (cy - best.y) * 0.3;
      best.r = Math.min(S.max, Math.max(best.r, r) + Math.min(best.r, r) * S.grow);
      best.core = Math.min(S.deepest, Math.max(best.core, spec.core) + S.deepen);
      best.n++;
      return best;
    }
    const s = { x: cx, y: cy, r, core: spec.core, n: 1, kind };
    const key = ty * m.w + tx, list = this.byTile.get(key) || [];
    list.push(s);
    if (list.length > KEEP) list.shift();
    this.byTile.set(key, list);
    return s;
  }

  // the tile went: nothing left to dig out there
  forget(cx, cy) { this.byTile.delete(cy * this.map.w + cx); }

  // The wall tiles within `reach` px of (x, y) as rectangles [x, y, w, h]; `inset`: drawn back from the open faces by
  // the outline's width (where the bare rim and the cracks may go).
  rects(x, y, reach, inset) {
    const m = this.map, out = [];
    const open = (i, j) => !m.isWallChar(i, j) && m.at(i, j) !== ' ';
    for (let j = Math.floor((y - reach) / TILE); j <= Math.floor((y + reach) / TILE); j++) {
      for (let i = Math.floor((x - reach) / TILE); i <= Math.floor((x + reach) / TILE); i++) {
        if (!m.isWallChar(i, j)) continue;
        const l = inset && open(i - 1, j) ? RIM : 0, t = inset && open(i, j - 1) ? RIM : 0;
        const r = inset && open(i + 1, j) ? RIM : 0, b = inset && open(i, j + 1) ? RIM : 0;
        out.push([i * TILE + l, j * TILE + t, TILE - l - r, TILE - t - b]);
      }
    }
    return out;
  }

  // restrict g to those rectangles (inside a save / restore)
  clip(g, x, y, reach, inset) {
    g.beginPath();
    for (const [rx, ry, rw, rh] of this.rects(x, y, reach, inset)) g.rect(rx, ry, rw, rh);
    g.clip();
  }

  // Paint a mark (from place) on the wall layer g, in whole pixels: the crater, all dark where it eats into the
  // outline; inside the outline, the bare rim and its cracks, then the crater's sides (lit on its lower right, shaded
  // on its upper left) round the dark core.
  paint(g, s) {
    const m = this.map, look = WALL_IMPACT[m.at(Math.floor(s.x / TILE), Math.floor(s.y / TILE))] || WALL_IMPACT.X;
    const spec = WALL_SCAR[s.kind], R = s.r, box = Math.ceil(R + 2);
    // a ragged outline: a few harmonics of the angle
    const ph = [rand(0, TAU), rand(0, TAU), rand(0, TAU)];
    const edge = (a) => 1 + 0.13 * Math.sin(3 * a + ph[0]) + 0.08 * Math.sin(5 * a + ph[1]) + 0.06 * Math.sin(8 * a + ph[2]);
    const X0 = Math.floor(s.x) - box, Y0 = Math.floor(s.y) - box;
    const cells = [];
    for (let py = Y0; py <= Y0 + box * 2; py++) {
      for (let px = X0; px <= X0 + box * 2; px++) {
        const dx = px + 0.5 - s.x, dy = py + 0.5 - s.y;
        cells.push([px, py, dx, dy, Math.hypot(dx, dy) / edge(Math.atan2(dy, dx))]);
      }
    }
    // drawn over the wall's own pixels, within the wall tiles (inset: off the outline of the open faces)
    const pass = (inset, fn) => {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      this.clip(g, s.x, s.y, box, inset);
      fn();
      g.restore();
    };
    // where the crater reaches the outline, it is all dark: the outline is bitten inward
    pass(false, () => {
      g.fillStyle = look.core;
      for (const [px, py, , , d] of cells) if (d < R * spec.pit) g.fillRect(px, py, 1, 1);
    });
    pass(true, () => {
      // the material laid bare round the hole, thinning out at its edge, and a little dust of it beyond
      g.fillStyle = look.bare;
      for (const [px, py, , , d] of cells) {
        const u = d / R, rim = Math.max(0, (u - spec.pit) / (1 - spec.pit));
        if (u >= spec.pit && (u < 1 ? chance(1 - 0.55 * rim * rim) : u < 1 + 1.4 / R && chance(0.25))) {
          g.globalAlpha = u < 1 ? rand(0.75, 1) : 0.45;
          g.fillRect(px, py, 1, 1);
        }
      }
      g.globalAlpha = 1;
      // hairline cracks off the rim, more as the gouge deepens
      g.fillStyle = look.crack;
      const [c0, c1] = spec.cracks;
      for (let k = randi(c0, c1) + Math.floor((s.n - 1) / 3); k > 0; k--) {
        let a = rand(0, TAU), x = s.x + Math.cos(a) * R * 0.9, y = s.y + Math.sin(a) * R * 0.9;
        for (let i = Math.round(rand(...spec.len) * (1 + (s.n - 1) * 0.1)); i > 0; i--) {
          a += rand(-0.6, 0.6);
          x += Math.cos(a); y += Math.sin(a);
          g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
        }
      }
      // the crater's sides round the dark core
      for (const [px, py, dx, dy, d] of cells) {
        const u = d / R;
        if (u >= spec.pit) continue;
        g.fillStyle = u < s.core ? look.core : dx + dy > 0.6 ? look.lit : look.shade;
        g.fillRect(px, py, 1, 1);
      }
    });
  }
}
