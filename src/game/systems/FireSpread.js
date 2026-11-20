// Fire that spreads (FIRE in data/fire.js). The floor is a grid of cells; each knows what it would burn as: the
// petrol poured on it (level `petrol`: trails [width px, [col, row], ...], and whatever petrol lies there when the
// front comes: systems/Liquids.js), what is painted on it (a rug, a carpet runner, a mattress: level `floor`), its
// floor (carpet, boards, lino; tiles and concrete do not burn). Something lights a cell (a match let fall: event
// 'matchDrop'; ignite(); a blast, in a level with petrol poured: 'explosion'): from there a front runs from cell to cell, each catching when the
// fire has crossed it at its fuel's speed, so it races along a trail of petrol, forks where the trail forks, and
// creeps over a dry floor. A cell burns a while, then is left charred (and the wall tops beside it sooted).
// Furniture the front reaches catches by its material, burns and falls apart; a gas bottle or a stove blows
// (systems/Gas.js). Whoever stands in a burning cell dies.
// In a lesson (systems/Tutorial.js) a stage with `hold` keeps the fire out of its room until `hold` s after he
// walked in: the front waits at its threshold. A retry plays the fire forward to where it would be (restore).
// Deterministic (no random: a cell's own pace is hashed from its place) and DOM-free. The flames, their light and
// their sound are systems/Fires.js: one fire a block of cells, lit and put out from here.
import { TILE } from '../Config.js';
import { FIRE } from '../data/fire.js';
import { ignite as pierce } from './Gas.js';
import { bytesOf } from '../../engine/Bytes.js';

const COLD = 0, BURNING = 1, BURNT = 2;
const AROUND = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
// 0..1, the same for a cell every time
const hash = (i, salt = 0) => { const s = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453; return s - Math.floor(s); };

export default class FireSpread {
  constructor(world, level = {}, cfg = FIRE) {
    this.world = world;
    this.cfg = cfg;
    const m = world.map, C = cfg.cell;
    this.w = Math.ceil(m.widthPx / C);
    this.h = Math.ceil(m.heightPx / C);
    const n = this.w * this.h;
    this.names = Object.keys(cfg.fuels);              // fuel n is names[n - 1]; 0: nothing to burn
    this.fuel = new Uint8Array(n);
    this.wet = new Uint8Array(n);                     // petrol on it
    this.state = new Uint8Array(n);
    this.due = new Float32Array(n).fill(Infinity);    // when the front will have crossed it
    this.lit = new Float32Array(n);                   // when it caught, when it burns out
    this.out = new Float32Array(n);
    this.gate = new Int8Array(n).fill(-1);            // the stage of the lesson that holds the fire out of it
    this.queued = new Uint8Array(n);
    this.pending = [];                                // cells the front is on its way to
    this.burning = [];
    this.blocks = new Map();                          // block -> { n: cells of it burning, fire: its flames (Fires) }
    this.tiles = new Uint16Array(m.w * m.h);          // cells burning in each tile of the map ...
    this.fuse = new Uint16Array(m.w * m.h);           // ... and cells of petrol not yet caught
    this.charred = new Set();
    this.props = null;                                // furniture that burns, linked at the first step
    this.panes = new Map();                           // window in the heat -> when it bursts
    this.clock = 0;
    this.acc = 0;
    this.whooshT = 0;
    this.mute = false;                                // a retry's fire played forward makes no sound
    this.reached = [];                                // when each stage of the lesson was reached, on this clock
    this.holds = (level.tutorial?.stages || []).map((s) => s.hold ?? s.keepFor);
    this.staged = !!level.petrol?.length;             // a level set to burn: there a blast lights the floor too
    this.lay(m, level);
    this.chase = level.tutorial?.chase ? this.course(level.tutorial.chase) : null; // the fire that follows him
    world.events?.on('matchDrop', ({ x, y }) => this.ignite(x, y));
    world.events?.on('explosion', ({ x, y, radius }) => this.blast(x, y, radius));
  }

  // what its arrays hold, bytes (engine/Bytes.js; the perf overlay)
  bytes(seen) { return bytesOf(this, seen); }

  // ---- what each cell would burn as

  lay(m, level) {
    const c = this.cfg, C = c.cell, id = (name) => this.names.indexOf(name) + 1;
    for (let gy = 0; gy < this.h; gy++) {
      for (let gx = 0; gx < this.w; gx++) {
        const tx = Math.floor((gx * C) / TILE), ty = Math.floor((gy * C) / TILE);
        if (m.isSolid(tx, ty) || m.at(tx, ty) === 'G') continue;
        this.fuel[gy * this.w + gx] = id(c.floors[m.floor[ty * m.w + tx]]);
      }
    }
    // what lies on the floor: a rectangle of its fuel, turned
    for (const [name, col, row, deg = 0] of level.floor || []) {
      const P = c.paint[name];
      if (!P) continue;
      const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), cx = col * TILE, cy = row * TILE, r = Math.hypot(P[1], P[2]) / 2;
      this.each(cx - r, cy - r, cx + r, cy + r, (i, x, y) => {
        const lx = (x - cx) * ca + (y - cy) * sa, ly = -(x - cx) * sa + (y - cy) * ca;
        if (Math.abs(lx) <= P[1] / 2 && Math.abs(ly) <= P[2] / 2 && this.passable(i)) this.fuel[i] = id(P[0]);
      });
    }
    // the petrol: every cell within half its width of a trail
    for (const [width, ...pts] of level.petrol || []) {
      const r = width / 2;
      for (let k = 0; k < pts.length; k++) {
        const [x0, y0] = pts[k].map((v) => v * TILE), [x1, y1] = (pts[k + 1] || pts[k]).map((v) => v * TILE);
        const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
        this.each(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (i, x, y) => {
          const t = len2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2)) : 0;
          if (Math.hypot(x - x0 - dx * t, y - y0 - dy * t) <= r && this.passable(i)) this.wet[i] = 1;
        });
      }
    }
    for (let i = 0; i < this.wet.length; i++) if (this.wet[i]) this.fuse[this.tileOf(i)]++;
    // the rooms of the lesson that hold the fire out for a while, and what else each keeps with it (`keep`)
    (level.tutorial?.stages || []).forEach((s, k) => {
      if (s.hold === undefined && s.keepFor === undefined) return;
      // (`keepFor` without `hold`: only its `keep` rectangles, not the room)
      for (const [c0, r0, c1, r1] of [...(s.hold === undefined ? [] : [s.zone]), ...(s.keep || [])]) {
        this.each(c0 * TILE, r0 * TILE, (c1 + 1) * TILE - 1, (r1 + 1) * TILE - 1, (i) => { if (this.gate[i] < 0) this.gate[i] = k; });
      }
    });
  }

  // fn(i, x, y) for every cell whose middle is in the rectangle (px)
  each(x0, y0, x1, y1, fn) {
    const C = this.cfg.cell;
    const gx0 = Math.max(0, Math.floor(x0 / C)), gx1 = Math.min(this.w - 1, Math.floor(x1 / C));
    const gy0 = Math.max(0, Math.floor(y0 / C)), gy1 = Math.min(this.h - 1, Math.floor(y1 / C));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) fn(gy * this.w + gx, (gx + 0.5) * C, (gy + 0.5) * C);
  }

  // a cell of floor (no wall, no window)
  passable(i) {
    const m = this.world.map, C = this.cfg.cell, tx = Math.floor(((i % this.w) * C) / TILE), ty = Math.floor((Math.floor(i / this.w) * C) / TILE);
    return !m.isSolid(tx, ty) && m.at(tx, ty) !== 'G';
  }

  index(x, y) {
    const C = this.cfg.cell, gx = Math.floor(x / C), gy = Math.floor(y / C);
    return gx < 0 || gy < 0 || gx >= this.w || gy >= this.h ? -1 : gy * this.w + gx;
  }

  at(i) { const C = this.cfg.cell; return { x: ((i % this.w) + 0.5) * C, y: (Math.floor(i / this.w) + 0.5) * C }; }

  // is there petrol on cell i (the level's trails, or what was poured since)?
  soaked(i) {
    if (this.wet[i]) return true;
    const L = this.world.liquids;
    if (!L?.at) return false;
    const p = this.at(i);
    return L.at(p.x, p.y)?.kind === 'petrol';
  }

  // what cell i burns as: a FIRE.fuels entry, or null
  fuelOf(i) {
    if (this.soaked(i)) return this.cfg.fuels.petrol;
    return this.fuel[i] ? this.cfg.fuels[this.names[this.fuel[i] - 1]] : null;
  }

  // ---- the fire that follows him down a corridor (FIRE.chase; level tutorial.chase: { from: the stage whose
  // reaching lets it go, path: [[col, row]...] the corridor's middle line, zones: [[c0, r0, c1, r1]...] the floor it
  // rules, start: tiles along the path the fire may be at before that }). A cell of those zones has a place along
  // the path (`along`, px); it may burn only once the front has passed it, and catches as it does, whatever
  // natural fire is about.

  course(def) {
    const pts = def.path.map(([c, r]) => ({ x: c * TILE, y: r * TILE })), at = [0];
    for (let k = 1; k < pts.length; k++) at.push(at[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const C = { from: def.from ?? 0, pts, at, total: at[at.length - 1], along: new Float32Array(this.w * this.h).fill(-1), cells: [], next: 0,
      front: (def.start ?? 0) * TILE, far: 0, on: false };
    this.chase = C;
    for (const [c0, r0, c1, r1] of def.zones) {
      this.each(c0 * TILE, r0 * TILE, (c1 + 1) * TILE - 1, (r1 + 1) * TILE - 1, (i, x, y) => {
        if (C.along[i] >= 0 || !this.passable(i)) return;
        C.along[i] = this.alongPath(x, y);
        C.cells.push(i);
      });
    }
    C.cells.sort((a, b) => C.along[a] - C.along[b]);
    while (C.next < C.cells.length && C.along[C.cells[C.next]] <= C.front) C.next++; // (what natural fire may have)
    return C;
  }

  // how far along the chase's path the point (x, y) is, px (its nearest point of the path)
  alongPath(x, y) {
    const { pts, at } = this.chase;
    let best = Infinity, s = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)), d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
      if (d < best) { best = d; s = at[k] + Math.sqrt(l2) * t; }
    }
    return s;
  }

  // the front comes on after him (see FIRE.chase), and what it passes catches
  follow(dt) {
    const C = this.chase, F = this.cfg.chase, p = this.world.player;
    if (!C.on) {
      if (this.reached[C.from] === undefined) return;
      C.on = true;
    }
    if (p?.alive) {
      const i = this.index(p.x, p.y);
      if (i >= 0 && C.along[i] >= 0) C.far = Math.max(C.far, C.along[i]);
    }
    const gap = C.far - C.front;
    C.front = Math.min(C.total, C.front + (gap > F.far ? F.run : gap > F.near ? F.pace : F.creep) * dt);
    while (C.next < C.cells.length && C.along[C.cells[C.next]] <= C.front) {
      const i = C.cells[C.next++];
      if (this.state[i] === COLD && this.fuelOf(i)) this.offer(i, this.clock);
    }
  }

  // may the fire be in cell i yet (the lesson holds it out of a room for a while; the chase's floor waits for its front)?
  open(i) {
    if (this.chase && this.chase.along[i] >= 0) return this.chase.along[i] <= this.chase.front;
    const g = this.gate[i];
    return g < 0 || (this.reached[g] !== undefined && this.clock >= this.reached[g] + this.holds[g]);
  }

  // ---- reading

  // the tile of the map (its index) cell i is in
  tileOf(i) {
    const C = this.cfg.cell;
    return Math.floor((Math.floor(i / this.w) * C) / TILE) * this.world.map.w + Math.floor(((i % this.w) * C) / TILE);
  }

  // is anything burning in tile `t` of the map (its index), or petrol lying there while something burns (the fire
  // will be there in a moment)? For whoever plans a way round it
  hot(t) { return this.tiles[t] > 0 || (this.fuse[t] > 0 && this.burning.length > 0); }

  // is (x, y) burning (hot enough to kill: it has burned `bite` s)?
  burns(x, y) {
    const i = this.index(x, y);
    return i >= 0 && this.state[i] === BURNING && this.clock - this.lit[i] >= this.cfg.bite;
  }

  // the burning cell nearest (x, y): { x, y }, or null
  nearest(x, y) {
    let best = null, bd = Infinity;
    for (const i of this.burning) {
      const p = this.at(i), d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // cells burning now, cells burned out
  count() { return { burning: this.burning.length, burnt: this.charred.size }; }

  // ---- lighting it

  // something lights the floor at (x, y): that cell, or the nearest one about it that burns
  ignite(x, y) {
    let best = -1, bd = Infinity;
    const C = this.cfg.cell;
    this.each(x - C * 2, y - C * 2, x + C * 2, y + C * 2, (i, cx, cy) => {
      const d = Math.hypot(cx - x, cy - y) - (this.soaked(i) ? C * 2 : 0); // the petrol first
      if (this.state[i] === COLD && this.fuelOf(i) && d < bd) { bd = d; best = i; }
    });
    if (best < 0) return false;
    this.gate[best] = -1; // what is lit by hand burns
    this.catch(best);
    return true;
  }

  // a blast lights what burns about it
  blast(x, y, radius) {
    if (!this.staged) return;
    const r = radius * this.cfg.blast;
    this.each(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      const d = Math.hypot(cx - x, cy - y);
      if (d <= r && this.state[i] === COLD && this.fuelOf(i)) this.offer(i, this.clock + (this.cfg.delay * d) / r);
    });
  }

  // the front will be at cell i at time t, if nothing gets there first
  offer(i, t) {
    if (t >= this.due[i]) return;
    this.due[i] = t;
    if (!this.queued[i]) { this.queued[i] = 1; this.pending.push(i); }
  }

  catch(i) {
    const c = this.cfg, f = this.fuelOf(i), under = this.fuel[i] ? c.fuels[this.names[this.fuel[i] - 1]] : null;
    const span = (F, salt) => F.burn[0] + (F.burn[1] - F.burn[0]) * hash(i, salt);
    // when it caught: when the front got there, unless it was kept waiting (a room held, a look missed)
    const t0 = this.due[i] <= this.clock && this.clock - this.due[i] < c.tick * 1.5 ? this.due[i] : this.clock;
    this.state[i] = BURNING;
    this.lit[i] = t0;
    // petrol flares off, then what is under it burns on
    this.out[i] = t0 + span(f, 1) + (f === c.fuels.petrol && under ? span(under, 2) : 0);
    this.burning.push(i);
    const gx = i % this.w, gy = Math.floor(i / this.w), p = this.at(i);
    this.tiles[this.tileOf(i)]++;
    if (this.wet[i]) this.fuse[this.tileOf(i)]--;
    // its neighbours, each after the time the fire takes to cross it
    for (const [dx, dy, d] of AROUND) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      const j = ny * this.w + nx;
      if (this.state[j] !== COLD) continue;
      const F = this.fuelOf(j);
      if (F) this.offer(j, t0 + ((d * c.cell) / F.speed) * (1 - c.jitter + 2 * c.jitter * hash(j)));
    }
    // its flames: one fire a block
    const b = Math.floor(gy / c.block) * this.w + Math.floor(gx / c.block);
    let B = this.blocks.get(b);
    if (!B) this.blocks.set(b, B = { n: 0, fire: null });
    if (B.n++ === 0) B.fire = this.world.fires?.add(p.x, p.y, 1) || null;
    // a front running along petrol is heard
    if (f === c.fuels.petrol && this.clock >= this.whooshT && !this.mute) {
      this.whooshT = this.clock + c.whoosh;
      this.world.sound?.('fireRun', p.x, p.y, 0.8);
    }
  }

  burnOut(i) {
    const c = this.cfg, gx = i % this.w, gy = Math.floor(i / this.w);
    this.state[i] = BURNT;
    this.tiles[this.tileOf(i)]--;
    const b = Math.floor(gy / c.block) * this.w + Math.floor(gx / c.block), B = this.blocks.get(b);
    if (B && --B.n <= 0) {
      if (B.fire) this.world.fires?.remove(B.fire);
      this.blocks.delete(b);
    }
    if (!this.charred.has(b)) {
      this.charred.add(b);
      const s = c.block * c.cell;
      this.world.decals?.scorch((Math.floor(gx / c.block) + 0.5) * s, (Math.floor(gy / c.block) + 0.5) * s, c.char);
    }
  }

  // ---- furniture

  link() {
    const w = this.world, c = this.cfg;
    this.props = [];
    for (const p of w.props || []) {
      const d = p.def || {}, mat = d.curtain ? 'fabric' : d.material;
      const gas = !!d.gas || !!d.explosive;
      if (p.isVehicle || d.lasting || d.fixture || (!gas && (!c.props[mat] || d.hung))) continue;
      this.props.push({ p, gas, M: c.props[mat], due: Infinity, out: Infinity, state: COLD, fire: null });
    }
  }

  // is a burning cell at the foot of prop q?
  touched(q) {
    const b = q.p.body?.bounds, r = this.cfg.reach;
    if (!b) return false;
    let hit = false;
    this.each(b.min.x - r, b.min.y - r, b.max.x + r, b.max.y + r, (i) => { if (this.state[i] === BURNING) hit = true; });
    return hit;
  }

  furniture() {
    const w = this.world, now = this.clock;
    for (const q of this.props) {
      const p = q.p;
      if (q.state === BURNT || p.dead || p.dying) { if (q.fire) { w.fires?.remove(q.fire); q.fire = null; } q.state = BURNT; continue; }
      if (q.state === COLD) {
        // (what stands where the fire is kept out waits with its floor)
        if (q.due === Infinity && this.burning.length && this.open(this.index(p.x, p.y)) && this.touched(q)) q.due = now + (q.gas ? 0 : q.M.catch);
        if (now < q.due) continue;
        if (q.gas) {
          // the lesson keeps a stove for its last moment; any other goes off after its fuse
          if (p.staged) continue;
          q.state = BURNT;
          if (!p.gasLeak) pierce(p, (p.W ?? 0) / 2, (p.H ?? 0) / 2, hash(this.props.indexOf(q)) * 6.28);
          continue;
        }
        q.state = BURNING;
        q.out = now + q.M.burn[0] + (q.M.burn[1] - q.M.burn[0]) * hash(this.props.indexOf(q), 3);
        q.fire = w.fires?.add(p.x, p.y, 1.6, true) || null;
        // the floor under it and about it catches with it
        const b = p.body.bounds;
        this.each(b.min.x, b.min.y, b.max.x, b.max.y, (i) => { if (this.state[i] === COLD && this.fuelOf(i)) this.offer(i, now); });
      } else if (now >= q.out) {
        q.state = BURNT;
        if (q.fire) { w.fires?.remove(q.fire); q.fire = null; }
        w.decals?.scorch(p.x, p.y, this.cfg.char * 1.5);
        p.break?.(hash(this.props.indexOf(q), 5) * 6.28, 0.8);
      } else if (q.fire) { q.fire.x = p.x; q.fire.y = p.y; }
    }
  }

  // ---- stepping

  update(dt) {
    const w = this.world, c = this.cfg, T = w.tutorial;
    this.clock += dt;
    if (T) for (let i = 0; i <= T.stage; i++) if (this.reached[i] === undefined) this.reached[i] = this.clock;
    if (this.chase) this.follow(dt);
    this.acc += dt;
    if (this.acc >= c.tick) { this.acc %= c.tick; this.front(); }
    // one touch kills
    if (!this.burning.length) return;
    for (const ch of w.chars || []) {
      if (ch.alive && !ch.vaulting && this.burns(ch.x, ch.y)) ch.kill(ch.angle + Math.PI, 'fire', null);
    }
  }

  // one look at the front: what it has reached catches (and what that reaches within the same look), what has
  // burned its time goes out
  front() {
    const now = this.clock;
    for (let pass = 0, caught = true; caught && pass < 64; pass++) {
      caught = false;
      const list = this.pending;
      this.pending = [];
      for (const i of list) {
        if (this.state[i] !== COLD) { this.queued[i] = 0; continue; }
        if (!this.fuelOf(i)) { this.queued[i] = 0; this.due[i] = Infinity; continue; } // the petrol it was to burn is gone
        if (this.due[i] <= now && this.open(i)) { this.queued[i] = 0; this.catch(i); caught = true; } else this.pending.push(i);
      }
    }
    if (this.burning.length) {
      const still = [];
      for (const i of this.burning) { if (this.out[i] <= now) this.burnOut(i); else still.push(i); }
      this.burning = still;
    }
    if (!this.props) this.link();
    if (this.props.length) this.furniture();
    if (this.burning.length) this.glass();
  }

  // a pane with fire at its foot cracks, then bursts outward (FIRE.glass: px, s)
  glass() {
    const w = this.world, [reach, after] = this.cfg.glass, now = this.clock;
    for (const g of w.windows || []) {
      if (!g.intact) { this.panes.delete(g); continue; }
      const due = this.panes.get(g);
      if (due !== undefined) { if (now >= due && !this.mute) g.shatter(g.vertical ? Math.PI : -Math.PI / 2, null, 0.7); continue; }
      let hot = false;
      this.each(g.x - reach, g.y - reach, g.x + reach, g.y + reach, (i) => { if (this.state[i] === BURNING) hot = true; });
      if (!hot) continue;
      this.panes.set(g, now + after);
      if (!this.mute) w.sound?.('heatCrack', g.x, g.y, 0.9);
    }
  }

  // water on it (Fires.douse): the cells burning where `where(x, y)` holds go out, and what was on its way there
  quench(where) {
    this.burning = this.burning.filter((i) => {
      const p = this.at(i);
      if (!where(p.x, p.y)) return true;
      this.burnOut(i);
      return false;
    });
    for (const i of this.pending) { const p = this.at(i); if (where(p.x, p.y)) this.due[i] = Infinity; }
  }

  // a retry of the lesson at stage `from`: the match fell at (x, y) and the fire has burned since, the rooms
  // before that stage reached when FIRE.elapsed says
  restore(from, x, y) {
    const E = this.cfg.elapsed, total = E[Math.min(from, E.length - 1)] ?? 0;
    this.mute = true; // nothing of it is heard
    if (!(total > 0) || !this.ignite(x, y)) { this.mute = false; this.resume(from); return; }
    for (let t = 0; t < total; t += this.cfg.tick) {
      this.clock += this.cfg.tick;
      for (let k = 0; k < from; k++) if (this.reached[k] === undefined && this.clock >= (E[k] ?? 0)) this.reached[k] = this.clock;
      this.front();
    }
    this.mute = false;
    this.resume(from);
  }

  // a retry at stage `from`: the chase takes up `far` behind where he starts again (or where it was let go from, if
  // he is not that far yet)
  resume(from) {
    const C = this.chase, p = this.world.player, at = C && p ? this.index(p.x, p.y) : -1;
    if (!C || from < C.from) return;
    C.on = true;
    C.far = at >= 0 && C.along[at] >= 0 ? C.along[at] : from > C.from ? C.total : 0;
    C.front = Math.max(C.front, Math.min(C.total, C.far - this.cfg.chase.far));
    this.follow(0);
  }
}
