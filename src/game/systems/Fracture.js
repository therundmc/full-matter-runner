// Destruction math, DOM-free: the mark a hit leaves (by weapon, energy and angle), where the debris goes, which
// side of an object is worn away (damage zones), and the shapes an object breaks into (part recipes).
// Coordinates are sprite pixels (x right, y down); angles are radians in the same frame.

import { clamp } from '../../engine/math.js';

// cos of the angle between a shot and the surface it hits: 1 = head-on, 0 = grazing. No normal = head-on.
export function incidence(dirA, nx, ny) {
  if (nx === undefined || ny === undefined) return 1;
  return clamp(-(Math.cos(dirA) * nx + Math.sin(dirA) * ny), 0, 1);
}

// Mark left on an object. size = shortest side of the sprite (px), energy = penetration energy (weapons.js `pen`),
// inc = incidence(). Returns
//   { shape, r, len, bite, cracks, pocks, scorch }
// shape: hole | pock | furrow | scrape | dent | slash | scuff | scorch | blowout ; r = radius of the hole / dent,
// len = length along the shot (furrows, slashes), bite = radius of material torn out (0 = none),
// cracks = radiating cracks, pocks = shrapnel pocks around, scorch = radius of the burn.
export function markShape(kind, { energy = 10, inc = 1, size = 16, hard = false, cracks = 3, glass = false, ricochet = false } = {}) {
  const m = { shape: 'hole', r: 1, len: 0, bite: 0, cracks: 0, pocks: 0, scorch: 0 };
  const big = clamp(size / 16, 0.6, 1.8);
  switch (kind) {
    case 'pellet': m.shape = 'pock'; m.r = 0.7; m.bite = hard ? 0 : 1.2; break;
    case 'bullet': m.r = 0.9; m.bite = hard ? 0 : 1.6 + energy * 0.04; m.cracks = glass ? 5 : cracks > 3 ? 1 : 0; break;
    case 'rifle': m.r = 1.1; m.bite = hard ? 0.8 : 1.4; m.cracks = glass ? 7 : cracks > 3 ? 2 : 0; break;
    case 'graze': m.shape = hard ? 'scrape' : 'furrow'; m.r = 0.6; break;
    case 'blunt':
      m.shape = 'dent'; m.r = clamp(size * 0.22, 2.5, 6);
      m.cracks = cracks; m.bite = hard ? 0 : cracks ? m.r * 0.8 : 0;
      return m;
    case 'cut': m.shape = 'slash'; m.r = 0.6; m.len = clamp(size * 0.5, 4, 12); return m;
    case 'punch': m.shape = 'scuff'; m.r = 1.5; return m;
    case 'shrapnel': m.shape = 'pock'; m.r = 0.7; m.pocks = 9; return m;
    case 'blast':
      m.shape = 'scorch'; m.scorch = clamp(size * 0.6, 6, 18); m.pocks = 7; m.r = 1.5;
      m.bite = hard ? 0 : clamp(2.5 * big, 2, 5); m.cracks = Math.ceil(cracks / 2);
      return m;
    default: break;
  }
  // grazing: the round ploughs a furrow along the surface (hard surfaces only get scraped: it ricocheted)
  if (ricochet) { m.shape = 'scrape'; m.bite = 0; m.cracks = 0; m.len = clamp(3 + energy * 0.3, 3, 10); return m; }
  if (inc < 0.4) {
    m.shape = hard ? 'scrape' : 'furrow';
    m.len = clamp((1 - inc) * (2.5 + energy * 0.25) * big, 2, size * 0.8);
    m.bite *= 0.6;
  } else m.len = m.r * (1 + (1 - inc) * 1.5); // a bit oval when oblique
  return m;
}

// The far side of a round that went through: a wider, ragged blow-out that grows with the energy it still had.
export function exitShape(energy, { hard = false, glass = false } = {}) {
  const r = clamp(1 + energy * 0.08, 1.2, 4.5);
  return { shape: 'blowout', r, len: r, bite: hard ? r * 0.5 : r * (glass ? 1.6 : 1.3), cracks: glass ? 6 : hard ? 0 : 2, pocks: 0, scorch: 0 };
}

// The channel a round digs through an object, from its entry (x, y) along a (sprite space): up to the exit point
// when it went through, otherwise as deep as its energy lets it go (energy / resist px), kept on the sprite.
export function track(x, y, a, energy, resist, W, H, exit = null) {
  if (exit) return { x: exit[0], y: exit[1], len: Math.hypot(exit[0] - x, exit[1] - y) };
  const depth = Math.min(energy / Math.max(0.05, resist), Math.hypot(W, H));
  const ex = clamp(x + Math.cos(a) * depth, 0, W), ey = clamp(y + Math.sin(a) * depth, 0, H);
  return { x: ex, y: ey, len: Math.hypot(ex - x, ey - y) };
}

// Where the material goes. side 'exit': a cone along the shot, faster and tighter the more energy is left;
// side 'entry': a little back-splash out of the hole (mirrored about the surface normal when known).
// Speeds are px/s. n = how many bits (before the material's backSplash / exit factor).
export function ejecta(side, dirA, energy = 10, nx, ny) {
  if (side === 'exit') {
    return { a: dirA, spread: 0.12 + 0.55 / (1 + energy / 8), vmin: 40 + energy * 4, vmax: 90 + energy * 10, n: clamp(Math.round(2 + energy / 3), 2, 12) };
  }
  let a = dirA + Math.PI;
  if (nx !== undefined) {
    // mirror of the incoming shot about the surface
    const dx = Math.cos(dirA), dy = Math.sin(dirA), d = dx * nx + dy * ny;
    a = Math.atan2(dy - 2 * d * ny, dx - 2 * d * nx);
  }
  return { a, spread: 0.7, vmin: 25, vmax: 60 + energy * 3, n: clamp(Math.round(1 + energy / 8), 1, 4) };
}

// Damage zones: the sprite is cut into cells; hits wear down the cell they land in (and a bit of the neighbours).
// A cell at 0 is torn away (a corner off, a hole); a full line of torn cells across the object saws it in two.
// state per cell: 0 intact, 1 torn (carved out), 2 detached (part of a piece that fell off)
export class ZoneGrid {
  constructor(W, H, hp) {
    this.W = W; this.H = H;
    // a third of the short side: a torn zone is a bite out of the object, never a quarter of it
    const cell = Math.max(6, Math.min(W, H) / 3);
    this.cols = clamp(Math.round(W / cell), 1, 6);
    this.rows = clamp(Math.round(H / cell), 1, 4);
    this.cw = W / this.cols; this.ch = H / this.rows;
    const n = this.cols * this.rows;
    this.max = clamp(hp * 0.4, 3, 8);
    this.hp = new Float32Array(n).fill(this.max);
    this.state = new Uint8Array(n);
  }

  cellAt(sx, sy) {
    const c = clamp(Math.floor(sx / this.cw), 0, this.cols - 1), r = clamp(Math.floor(sy / this.ch), 0, this.rows - 1);
    return r * this.cols + c;
  }

  // rect of a cell in sprite px
  rect(i) {
    const c = i % this.cols, r = Math.floor(i / this.cols);
    return [c * this.cw, r * this.ch, (c + 1) * this.cw, (r + 1) * this.ch];
  }

  // wear the cell under (sx, sy); spill = share given to the 4 neighbours. Returns the cells torn by this hit.
  damage(sx, sy, amount, spill = 0.25) {
    const i = this.cellAt(sx, sy), c = i % this.cols, r = Math.floor(i / this.cols);
    const torn = [];
    const wear = (j, a) => {
      if (this.state[j]) return;
      this.hp[j] -= a;
      if (this.hp[j] <= 0) { this.state[j] = 1; torn.push(j); }
    };
    wear(i, amount);
    if (spill > 0) {
      if (c > 0) wear(i - 1, amount * spill);
      if (c < this.cols - 1) wear(i + 1, amount * spill);
      if (r > 0) wear(i - this.cols, amount * spill);
      if (r < this.rows - 1) wear(i + this.cols, amount * spill);
    }
    return torn;
  }

  // a round's track through the object wears every zone it crosses (after the first) by `amount`
  wearLine(x0, y0, x1, y1, amount) {
    const first = this.cellAt(x0, y0), seen = new Set([first]), torn = [];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (Math.min(this.cw, this.ch) / 2));
    for (let k = 1; k <= n; k++) {
      const i = this.cellAt(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
      if (seen.has(i)) continue;
      seen.add(i);
      if (this.state[i]) continue;
      this.hp[i] -= amount;
      if (this.hp[i] <= 0) { this.state[i] = 1; torn.push(i); }
    }
    return torn;
  }

  intactCount() { let n = 0; for (const s of this.state) if (!s) n++; return n; }

  // A full line of torn cells with intact cells on both sides: the object is sawn in two.
  // Returns { axis: 'x'|'y', at (column / row index), cells: the cells of the smaller side (they fall off) } or null.
  cut() {
    const lines = [['x', this.cols, this.rows], ['y', this.rows, this.cols]];
    for (const [axis, nLines, nAcross] of lines) {
      for (let k = 1; k < nLines - 1; k++) {
        let gone = true;
        for (let u = 0; u < nAcross && gone; u++) gone = this.state[axis === 'x' ? u * this.cols + k : k * this.cols + u] !== 0;
        if (!gone) continue;
        // cells still attached on each side (torn ones go with their side); each side needs something intact
        const before = [], after = [];
        let nb = 0, na = 0;
        for (let i = 0; i < this.state.length; i++) {
          if (this.state[i] === 2) continue;
          const idx = axis === 'x' ? i % this.cols : Math.floor(i / this.cols);
          if (idx < k) { before.push(i); if (!this.state[i]) nb++; } else if (idx > k) { after.push(i); if (!this.state[i]) na++; }
        }
        if (nb && na) return { axis, at: k, cells: nb <= na ? before : after };
      }
    }
    return null;
  }

  // mark cells as fallen off
  detach(cells) { for (const i of cells) this.state[i] = 2; }

  // bounding box (sprite px) of what is still standing (intact or torn but attached), or null
  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] === 2) continue;
      const [a, b, c, d] = this.rect(i);
      x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
    }
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  }
}

// ---- part recipes -> polygons (sprite px). rnd() in [0, 1) so tests can be deterministic. ----

const jit = (rnd, a) => (rnd() * 2 - 1) * a;

function rectOf(fr, W, H) {
  const f = fr || [0, 0, 1, 1];
  return [f[0] * W, f[1] * H, f[2] * W, f[3] * H];
}

// a jagged polyline from (ax, ay) to (bx, by), endpoints included
function seam(ax, ay, bx, by, rnd, amp, steps) {
  const pts = [[ax, ay]];
  const len = Math.hypot(bx - ax, by - ay) || 1, px = -(by - ay) / len, py = (bx - ax) / len;
  for (let i = 1; i < steps; i++) {
    const t = i / steps, o = jit(rnd, amp);
    pts.push([ax + (bx - ax) * t + px * o, ay + (by - ay) * t + py * o]);
  }
  pts.push([bx, by]);
  return pts;
}

// boards along the long (or short) axis; snap: some boards break across too
function planks(g, W, H, rnd) {
  const [x0, y0, x1, y1] = rectOf(g.rect, W, H);
  const along = (g.axis === 'short') !== (x1 - x0 < y1 - y0) ? 'y' : 'x'; // the axis the boards run along
  const n = Math.max(1, g.n || 3);
  const out = [];
  const amp = 0.6;
  // seams between boards (shared by both neighbours)
  const seams = [];
  for (let k = 0; k <= n; k++) {
    if (along === 'x') {
      const y = y0 + ((y1 - y0) * k) / n;
      seams.push(k === 0 || k === n ? [[x0, y], [x1, y]] : seam(x0, y, x1, y, rnd, amp, 4));
    } else {
      const x = x0 + ((x1 - x0) * k) / n;
      seams.push(k === 0 || k === n ? [[x, y0], [x, y1]] : seam(x, y0, x, y1, rnd, amp, 4));
    }
  }
  for (let k = 0; k < n; k++) {
    const a = seams[k], b = seams[k + 1];
    const poly = [...a, ...b.slice().reverse()];
    const long = along === 'x' ? x1 - x0 : y1 - y0;
    if (g.snap && long > 14 && rnd() < 0.6) {
      // broken across: split the board in two at a random point with a splintered edge
      const t = 0.3 + rnd() * 0.4;
      out.push(...splitPoly(poly, along, along === 'x' ? x0 + long * t : y0 + long * t, rnd));
    } else out.push(poly);
  }
  return out;
}

// split a polygon across `along` at coordinate c, by a slanted (splintered) line
function splitPoly(poly, along, c, rnd) {
  const slope = jit(rnd, 1.2);
  const side = (p) => (along === 'x' ? p[0] : p[1]) - c - slope * ((along === 'x' ? p[1] : p[0]) - (along === 'x' ? poly[0][1] : poly[0][0]));
  const clip = (keep) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const sp = side(p) * keep, sq = side(q) * keep;
      if (sp <= 0) out.push(p);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  };
  return [clip(1), clip(-1)].filter((p) => p.length >= 3);
}

// where a ray from (cx, cy) at angle a leaves the rect
function rayRect(cx, cy, a, x0, y0, x1, y1) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (x1 - cx) / dx); else if (dx < -1e-9) t = Math.min(t, (x0 - cx) / dx);
  if (dy > 1e-9) t = Math.min(t, (y1 - cy) / dy); else if (dy < -1e-9) t = Math.min(t, (y0 - cy) / dy);
  return [cx + dx * t, cy + dy * t];
}

// radial fracture: n wedges around (hx, hy) (the impact; the middle with g.centre: a lid along its own seams),
// seams jagged and shared
function wedges(g, W, H, rnd, hit) {
  const [x0, y0, x1, y1] = rectOf(g.rect, W, H);
  if (g.centre) hit = null;
  const cx = clamp(hit ? hit[0] : (x0 + x1) / 2, x0 + 1, x1 - 1), cy = clamp(hit ? hit[1] : (y0 + y1) / 2, y0 + 1, y1 - 1);
  const n = Math.max(3, g.n || 5);
  const base = rnd() * Math.PI * 2;
  const angs = Array.from({ length: n }, (_, i) => base + ((i + 0.5 + jit(rnd, 0.3)) / n) * Math.PI * 2);
  const amp = Math.min(x1 - x0, y1 - y0) * 0.08 + 0.4;
  const seams = angs.map((a) => {
    const [ex, ey] = rayRect(cx, cy, a, x0, y0, x1, y1);
    return seam(cx, cy, ex, ey, rnd, amp, 3);
  });
  const corners = [[x1, y1], [x0, y1], [x0, y0], [x1, y0]].map(([x, y]) => ({ x, y, a: Math.atan2(y - cy, x - cx) }));
  const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a0 = angs[i], a1 = angs[(i + 1) % n] + (i === n - 1 ? Math.PI * 2 : 0);
    const span = a1 - a0;
    const between = corners.filter((k) => norm(k.a - a0) < span).sort((p, q) => norm(p.a - a0) - norm(q.a - a0));
    out.push([...seams[i], ...between.map((k) => [k.x, k.y]), ...seams[(i + 1) % n].slice().reverse()]);
  }
  return out;
}

// jagged grid; interior vertices jittered once so neighbours share edges
function grid(g, W, H, rnd) {
  const [x0, y0, x1, y1] = rectOf(g.rect, W, H);
  const cols = Math.max(1, g.cols || 2), rows = Math.max(1, g.rows || 1);
  const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
  const v = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const edgeX = c === 0 || c === cols, edgeY = r === 0 || r === rows;
      v.push([x0 + c * cw + (edgeX ? 0 : jit(rnd, cw * 0.18)), y0 + r * ch + (edgeY ? 0 : jit(rnd, ch * 0.18))]);
    }
  }
  const at = (c, r) => v[r * (cols + 1) + c];
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push([at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)]);
  }
  return out;
}

// border strips (back and arms of a sofa, the cushion rails of a pool table)
function frame(g, W, H) {
  const [x0, y0, x1, y1] = rectOf(g.rect, W, H);
  const t = Math.max(1.5, Math.min(x1 - x0, y1 - y0) * (g.t ?? 0.25));
  const s = g.sides || 'tlrb';
  const out = [];
  const top = s.includes('t') ? y0 + t : y0, bot = s.includes('b') ? y1 - t : y1;
  if (s.includes('t')) out.push(box(x0, y0, x1, y0 + t));
  if (s.includes('b')) out.push(box(x0, y1 - t, x1, y1));
  if (s.includes('l')) out.push(box(x0, top, x0 + t, bot));
  if (s.includes('r')) out.push(box(x1 - t, top, x1, bot));
  return out;
}

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// the rim of something round (the ellipse in the rect): n arcs of a band t thick (fraction of the radius), split
// by jagged seams. What is inside is left to the next cut.
function ring(g, W, H, rnd) {
  const [x0, y0, x1, y1] = rectOf(g.rect, W, H);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const n = Math.max(3, g.n || 6), k = 1 - (g.t ?? 0.2), base = rnd() * Math.PI * 2;
  const at = (a, s) => [cx + Math.cos(a) * rx * s, cy + Math.sin(a) * ry * s];
  const seams = Array.from({ length: n + 1 }, (_, i) => base + ((i + (i % n ? jit(rnd, 0.25) : 0)) / n) * Math.PI * 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a0 = seams[i], a1 = seams[i + 1], steps = 4, outer = [], inner = [];
    for (let s = 0; s <= steps; s++) {
      const a = a0 + ((a1 - a0) * s) / steps;
      outer.push(at(a, 1));
      inner.push(at(a, k * (s % steps ? 1 : 1 + jit(rnd, 0.05))));
    }
    out.push([...outer, ...inner.reverse()]);
  }
  return out;
}

// The patch a worn-out zone tears off (cell rect in sprite px): a ragged blob around the middle of the cell, pushed
// out toward the edge it is on so that it opens there as a broken notch, kept on the sprite. rnd() in [0, 1).
export function tearShape([x0, y0, x1, y1], W, H, rnd = Math.random) {
  const cw = x1 - x0, ch = y1 - y0;
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (x0 <= 0) cx -= cw * 0.25; else if (x1 >= W) cx += cw * 0.25;
  if (y0 <= 0) cy -= ch * 0.25; else if (y1 >= H) cy += ch * 0.25;
  const n = 11, base = rnd() * Math.PI * 2, poly = [];
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * Math.PI * 2 + jit(rnd, 0.2);
    // a spike now and then: what breaks off is splintered, not round
    const r = (i % 3 === 0 ? 0.6 + rnd() * 0.25 : 0.35 + rnd() * 0.2);
    poly.push([clamp(cx + Math.cos(a) * cw * r, 0, W), clamp(cy + Math.sin(a) * ch * r, 0, H)]);
  }
  return poly;
}

// One cut of a recipe -> list of { poly, name? }
export function cutPolys(g, W, H, rnd = Math.random, hit = null) {
  switch (g.cut) {
    case 'planks': return planks(g, W, H, rnd).map((poly) => ({ poly, name: 'plank' }));
    case 'wedges': return wedges(g, W, H, rnd, hit).map((poly) => ({ poly, name: 'shard' }));
    case 'grid': return grid(g, W, H, rnd).map((poly) => ({ poly, name: 'chunk' }));
    case 'frame': return frame(g, W, H).map((poly) => ({ poly, name: 'frame' }));
    case 'ring': return ring(g, W, H, rnd).map((poly) => ({ poly, name: g.name || 'rim', fly: g.fly }));
    case 'panel': { const [a, b, c, d] = rectOf(g.rect, W, H); return [{ poly: box(a, b, c, d), name: g.name || 'panel', fly: g.fly }]; }
    default: return [];
  }
}

// Launch of a collapse piece: mostly along the blow (dirA), pushed out from the object's centre, harder for
// lighter pieces. lx, ly = piece offset from the centre (world-aligned), power = how violent (1 bullet .. 2+ blast).
export function launch(dirA, lx, ly, power, fly = 1, rnd = Math.random) {
  const out = Math.atan2(ly, lx), d = Math.hypot(lx, ly);
  let da = out - dirA;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  const a = dirA + (d > 1.5 ? da * 0.55 : 0) + jit(rnd, 0.5);
  const v = (25 + rnd() * 70) * power * fly;
  return { a, v, vz: (40 + rnd() * 80) * Math.min(1.6, 0.6 + power * 0.4), spin: jit(rnd, 0.25 + power * 0.1) };
}

// When each part of a collapsing object lets go: the collapse runs through it like a wave, from the blow (hit, sprite
// px) to its far end, over `dur` seconds. parts: [{ cx, cy }] (sprite px). Returns one delay (s) per part.
export function crumble(parts, hit, dur, rnd = Math.random) {
  const d = parts.map((p) => Math.hypot(p.cx - hit[0], p.cy - hit[1]));
  const far = Math.max(1, ...d);
  return d.map((v) => dur * Math.min(1, (v / far) * 0.85 + rnd() * 0.15));
}
