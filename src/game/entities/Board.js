// A billboard's face (a prop whose mount is 'billboard': data/mounts.js; numbers and layouts in data/billboards.js).
// The rounds that cross it punch holes where their line does, its lamps are shot out one by one, and as it takes
// more the paper tears and hangs in strips, the lettering is ripped and sheets torn out show the frame, then the
// face is gone, shreds hanging off the frame. The frame and its posts are a structure: they never move, never fall,
// never stop a round (the round flies on: entities/Projectile.js 'overhead').
// What it decides is kept in `mask` (a cell a pixel of the sprite: paper, bare, gone, a dead lamp's) and handed as
// paint ops to render/BoardArt.js, which does the pixels: nothing here needs a canvas.
import { BOARD, BOARDS, CELL } from '../data/billboards.js';
import { FLOATS } from '../data/destruction.js';
import { rand, randi, chance, clamp, TAU } from '../../engine/math.js';
import { paintBoard } from '../render/BoardArt.js';

const { PAPER, BARE, GONE, LOCK } = CELL;
const inRect = (r, x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];

// the stretch [t0, t1] of the segment a -> b (t in 0..1) inside the rect r, or null (Liang-Barsky)
export function clipT(a, b, r) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - r[0]], [dx, r[2] - a.x], [-dy, a.y - r[1]], [dy, r[3] - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return t1 > t0 ? [t0, t1] : null;
}

export default class Board {
  constructor(prop) {
    this.prop = prop;
    this.g = BOARDS[prop.type];
    if (!this.g) throw new Error('no billboard layout for ' + prop.type);
    this.hp = BOARD.hp;
    this.stage = 0;
    this.hits = [];                                  // the last hits' sprite points (a stage tears there first)
    this.holes = 0;                                  // rounds that holed it, all told
    this.k = prop.img?.k || 1;                       // world px a cell (the sprite's density)
    const [W, H] = this.g.size;
    this.cw = Math.ceil(W / this.k); this.ch = Math.ceil(H / this.k);
    this.mask = new Uint8Array(this.cw * this.ch);
    this.up = this.g.lamps.map(() => true);          // each lamp head whole
    prop.lamps = [].concat(prop.def.light || []).map(() => true); // its lights, on (render/Lighting.js lampOn)
    this.glow = null;                                // its emissive map once marked (BoardArt)
    // (Lighting draws its emissive map through this: holes and tears put out what glowed there)
    prop.drawLamps = (g, gl, x0, y0) => g.drawImage(this.glow || gl, x0, y0);
    this.ops = [];
  }

  get world() { return this.prop.world; }

  // world point <-> sprite px (the layout's own size: it holds without a loaded sprite)
  local(px, py) {
    const o = this.prop.centre(), a = -this.prop.body.angle, dx = px - o.x, dy = py - o.y, [W, H] = this.g.size;
    return { x: dx * Math.cos(a) - dy * Math.sin(a) + W / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + H / 2 };
  }

  toWorld(sx, sy) {
    const o = this.prop.centre(), a = this.prop.body.angle, [W, H] = this.g.size, lx = sx - W / 2, ly = sy - H / 2;
    return { x: o.x + lx * Math.cos(a) - ly * Math.sin(a), y: o.y + lx * Math.sin(a) + ly * Math.cos(a) };
  }

  cellAt(sx, sy) {
    const i = Math.floor(sx / this.k), j = Math.floor(sy / this.k);
    return i < 0 || j < 0 || i >= this.cw || j >= this.ch ? -1 : j * this.cw + i;
  }

  // what is left of the face at sprite px (sx, sy): PAPER, BARE, GONE (or LOCK), -1 off its faces
  at(sx, sy) {
    if (!this.g.faces.some((f) => inRect(f, sx, sy))) return -1;
    return this.mask[this.cellAt(sx, sy)];
  }

  // the share of its faces torn down to `level` or further (0..1)
  share(level) {
    let n = 0, all = 0;
    for (const f of this.g.faces) {
      for (let j = Math.ceil(f[1] / this.k); j < f[3] / this.k; j++) {
        for (let i = Math.ceil(f[0] / this.k); i < f[2] / this.k; i++) { all++; if (this.mask[j * this.cw + i] >= level) n++; }
      }
    }
    return all ? n / all : 0;
  }

  // ------------------------------------------------------------------ what reaches it

  // A round of `kind` at (x, y) flying along a (its line from there on through the board): the first whole lamp it
  // crosses is shot out, and where it crosses a face a hole is punched at a point of that stretch. True if it struck
  // anything (the frame alone: nothing).
  shot(kind, x, y, a) {
    const p = this.local(x, y), la = a - this.prop.body.angle, [W, H] = this.g.size, L = Math.hypot(W, H) * 2;
    const q = { x: p.x + Math.cos(la) * L, y: p.y + Math.sin(la) * L };
    let struck = false, first = null;
    this.g.lamps.forEach((l, i) => {
      const t = this.up[i] && clipT(p, q, l.at);
      if (t && (!first || t[0] < first.t)) first = { i, t: t[0] };
    });
    if (first) { this.lampOut(first.i, a); struck = true; }
    const spans = this.g.faces.map((f) => clipT(p, q, f)).filter(Boolean);
    let u = Math.random() * spans.reduce((s, [t0, t1]) => s + t1 - t0, 0);
    for (const [t0, t1] of spans) {
      if (u > t1 - t0) { u -= t1 - t0; continue; }
      const t = t0 + u, sx = p.x + (q.x - p.x) * t, sy = p.y + (q.y - p.y) * t, c = this.at(sx, sy);
      if (c >= 0 && c < GONE) { this.struck(kind, sx, sy, a); struck = true; }
      break;
    }
    this.flush();
    return struck;
  }

  // a blast at (x, y) of radius R; occ(x, y): how much of it reaches that point (systems/Explosions.js)
  blast(x, y, R, occ = () => 1) {
    const B = BOARD.blast, p = this.local(x, y);
    let best = null;
    for (const f of this.g.faces) {
      const sx = clamp(p.x, f[0], f[2] - 0.5), sy = clamp(p.y, f[1], f[3] - 0.5), d = Math.hypot(sx - p.x, sy - p.y);
      if (!best || d < best.d) best = { sx, sy, d };
    }
    const w = this.world, a = Math.atan2(best.sy - p.y, best.sx - p.x) + this.prop.body.angle;
    // its lamps near it go out
    this.g.lamps.forEach((l, i) => {
      const c = this.toWorld((l.at[0] + l.at[2]) / 2, (l.at[1] + l.at[3]) / 2);
      if (this.up[i] && Math.hypot(c.x - x, c.y - y) < R * B.lamps) this.lampOut(i, a);
    });
    const at = this.toWorld(best.sx, best.sy), f = best.d < R * B.reach ? occ(at.x, at.y) : 0;
    const k = f > 0 ? (1 - best.d / (R * B.reach)) * f : 0;
    if (k > 0 && this.at(best.sx, best.sy) < GONE) {
      if (this.g.layers) {
        const r = B.r[0] + (B.r[1] - B.r[0]) * k;
        this.tear(best.sx, best.sy, r, BARE);
        if (k > B.core) this.tear(best.sx, best.sy, r * 0.6, GONE);
        this.strips(best.sx, best.sy, r, randi(1, 3));
      } else this.ops.push({ op: 'hole', x: best.sx, y: best.sy, r: 1.5 });
      this.bits(at.x, at.y, a, 10 + 20 * k);
      w.sound(BOARD.sound.tear, at.x, at.y, 0.8);
      this.damage(B.dmg * k);
    }
    this.flush();
  }

  // ------------------------------------------------------------------ damage

  // a round struck the face at sprite px (sx, sy)
  struck(kind, sx, sy, a) {
    const w = this.world, at = this.toWorld(sx, sy);
    this.holes++;
    this.hits.push([sx, sy]);
    if (this.hits.length > 8) this.hits.shift();
    this.ops.push({ op: 'hole', x: sx, y: sy, r: BOARD.hole[kind] ?? BOARD.hole.bullet });
    if (this.g.layers && this.stage === 1 && chance(BOARD.peel.odds)) {
      const P = BOARD.peel, r = rand(...P.r);
      this.tear(sx, sy, r, BARE);
      this.strips(sx, sy, r, randi(...P.strips));
    } else if (this.g.layers && this.stage === 2) {
      const r = rand(...BOARD.rip.paper);
      this.tear(sx, sy, r, BARE);
      this.tear(sx, sy, rand(...BOARD.rip.r), GONE);
      this.strips(sx, sy, r, randi(0, 1));
    }
    this.bits(at.x, at.y, a, 4);
    w.sound(BOARD.sound.hole, at.x, at.y, kind === 'pellet' ? 0.3 : 0.5);
    this.damage(BOARD.dmg[kind] ?? 1);
  }

  damage(n) {
    if (!this.g.layers || this.stage >= BOARD.stages.length) return;
    this.hp -= n;
    while (this.stage < BOARD.stages.length && this.hp <= BOARD.hp * BOARD.stages[this.stage]) this.enter(++this.stage);
  }

  // a stage reached: tears at once (at the last hits, across the lettering), then the face gone
  enter(stage) {
    const w = this.world, F = this.g.faces[0], S = BOARD.burst, c = this.toWorld(this.g.size[0] / 2, this.g.size[1] / 2);
    const some = (box) => [rand(box[0], box[2]), rand(box[1], box[3])];
    if (stage === 1) {
      for (let i = 0; i < S.peel.n; i++) {
        const [sx, sy] = this.hits[this.hits.length - 1 - i] || some(F), r = rand(...S.peel.r);
        this.tear(sx, sy, r, BARE);
        this.strips(sx, sy, r, randi(...S.strips));
      }
    } else if (stage === 2) {
      const box = this.g.letters || F;
      for (let i = 0; i < S.rip.n; i++) {
        const [sx, sy] = some(box), r = rand(...S.rip.r);
        this.tear(sx, sy, r, BARE);
        this.tear(sx, sy, r * S.rip.core, GONE);
        this.strips(sx, sy, r, randi(...S.strips));
      }
      this.bits(c.x, c.y, 0, 24);
    } else this.gone();
    w.sound(stage === 3 ? BOARD.sound.gone : BOARD.sound.tear, c.x, c.y, 0.9);
  }

  // the face destroyed: every cell of it gone, shreds left hanging off the top rail and the stringers, paper flying
  gone() {
    const w = this.world, G = BOARD.gone, [W, H] = this.g.size, c = this.toWorld(W / 2, H / 2);
    // (a tear's ragged reach is at least 0.44 of its radius: 1.2 diagonals take a face's corners too)
    for (const f of this.g.faces) this.tear((f[0] + f[2]) / 2, (f[1] + f[3]) / 2, Math.hypot(f[2] - f[0], f[3] - f[1]) * 1.2, GONE, false);
    for (const f of this.g.faces) {
      const rails = [f[1], f[1] + (f[3] - f[1]) * 0.3, f[1] + (f[3] - f[1]) * 0.68];
      for (let n = randi(...G.shreds); n > 0; n--) {
        const x = rand(f[0], f[2] - 3), y = rails[randi(0, rails.length - 1)] + 1;
        this.ops.push({ op: 'strip', x, y, w: rand(...G.width), len: rand(...G.long), drop: 0 });
      }
    }
    w.papers?.drop(c.x, c.y, G.papers, rand(0, TAU), G.v);
    w.particles.floaters(c.x, c.y, FLOATS.paper, G.floaters, 0, Math.PI, 90, BOARD.lift);
    w.particles.chips(c.x, c.y, 0, Math.PI, 30, this.prop.def.chips, 160);
    w.shake(0.12);
  }

  // A ragged tear of radius r round (sx, sy) down to `level` (BARE: the paper off; GONE: the sheet out too), on
  // its faces only, never back up a level, never over a dead lamp; `lip`: the paper's torn edge left round it.
  tear(sx, sy, r, level, lip = true) {
    const k = this.k, ph = [rand(0, TAU), rand(0, TAU), rand(0, TAU)];
    const reach = (t) => r * (0.72 + 0.12 * Math.sin(3 * t + ph[0]) + 0.1 * Math.sin(5 * t + ph[1]) + 0.06 * Math.sin(9 * t + ph[2]));
    const cells = [], edge = [];
    const i0 = Math.max(0, Math.floor((sx - r - 2) / k)), i1 = Math.min(this.cw - 1, Math.ceil((sx + r + 2) / k));
    const j0 = Math.max(0, Math.floor((sy - r - 2) / k)), j1 = Math.min(this.ch - 1, Math.ceil((sy + r + 2) / k));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * k, y = (j + 0.5) * k;
        if (!this.g.faces.some((f) => inRect(f, x, y))) continue;
        const idx = j * this.cw + i, m = this.mask[idx], d = Math.hypot(x - sx, y - sy), e = reach(Math.atan2(y - sy, x - sx));
        if (d <= e) { if (m < level) { this.mask[idx] = level; cells.push(idx); } }
        else if (lip && m === PAPER && d <= e + 1.2) edge.push(idx);
      }
    }
    if (cells.length || edge.length) this.ops.push({ op: 'tear', level, cells, edge });
  }

  // n strips of the paper torn off round (sx, sy) left hanging from the tear's top edge
  strips(sx, sy, r, n) {
    const P = BOARD.peel;
    for (let i = 0; i < n; i++) {
      const x = sx + rand(-r, r) * 0.7, y = sy - r * rand(0.4, 0.8);
      this.ops.push({ op: 'strip', x, y, w: rand(...P.width), len: r * rand(0.8, 1.4), drop: rand(...P.drop) });
    }
  }

  // lamp i shot out: its light goes when the last lamp on it does; sparks, its glass
  lampOut(i, a) {
    const l = this.g.lamps[i], w = this.world, [x0, y0, x1, y1] = l.at, c = this.toWorld((x0 + x1) / 2, (y0 + y1) / 2);
    this.up[i] = false;
    for (let j = Math.floor(y0 / this.k); j < y1 / this.k; j++) {
      for (let q = Math.floor(x0 / this.k); q < x1 / this.k; q++) {
        if (q >= 0 && j >= 0 && q < this.cw && j < this.ch) this.mask[j * this.cw + q] = LOCK;
      }
    }
    if (!this.g.lamps.some((o, j) => this.up[j] && o.light === l.light)) this.prop.lamps[l.light] = false;
    this.ops.push({ op: 'lamp', at: l.at });
    w.particles.sparks(c.x, c.y, a + Math.PI, 1.2, 12, 240, '#fff2c0');
    w.particles.glass(c.x, c.y, a, 1.4, 10, 110);
    w.light(c.x, c.y, 60, '#fff0c8', 0.08);
    w.sound(BOARD.sound.lamp, c.x, c.y, 0.7);
  }

  // what a hit tears off it, falling from up there: paper floating down, chips of its colours
  bits(x, y, a, n) {
    const P = this.world.particles;
    P.floaters(x, y, FLOATS.paper, Math.ceil(n / 2), a, 1.2, 50, BOARD.lift);
    P.chips(x, y, a, 1.1, n, this.prop.def.chips, 90);
  }

  // hand the paint over (nothing to paint on with no canvas: tests)
  flush() {
    if (!this.ops.length) return;
    paintBoard(this, this.ops);
    this.ops = [];
  }
}
