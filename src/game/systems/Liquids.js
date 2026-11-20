// What is wet on the floor and what it does (LIQUIDS in data/liquids.js). Every liquid poured on the floor is
// one shallow liquid over the whole map (engine/physics/Shallow.js, cells of a few px): it runs, spreads, gathers
// in hollows and along the kerbs, is held by walls, shut doors and what stands on the floor, mixes (beer into
// water thins it, blood into water turns it pink), dries or soaks into the floor; blood sets and is left as a stain.
// Where it comes from: sources pouring a while (a burst hydrant, a holed keg, a broken pipe: `source`, 'spill'
// with a `dur`), spills at once ('spill': smashed bottles), what rains on the floor (the sprinklers: `sprinkle`),
// the bodies bleeding (the pool each corpse lets out, fed as it grows), the rain's puddles lying in the hollows
// of the open ground (systems/Weather.js lays them), the petrol poured in trails that a match sets alight (level
// `petrol`, systems/FireSpread.js).
// What it does: a wet floor grips less (World.floorGrip; a slick kind floors runners, systems/Slips.js); whoever
// walks in it splashes, pushes it along, then prints fading footprints on the dry floor or one long smear when
// sliding (`decals.footprint` / `decals.smear`, event 'footprint' for the guards); drops landing in it ring.
// The grid is sparse (engine/physics/Shallow.js): its chunks are made where liquid is poured or runs, and let go once
// dry and still (`sweep`); a chunk made again gets its floor from here as the whole floor was laid at the start (its
// level and bumps, a road's camber, the manholes, the rain's hollows), and what is solid from the map, the doors and
// the furniture as they last stood (`gated`): it is as it would have been.
// DOM-free: render/LiquidArt.js draws the grid and paints the stains it hands over (`stained`).
// Listens to 'propDestroyed' (a `fountain` prop: the hydrant) and 'spill'.
import { TILE } from '../Config.js';
import { LIQUIDS } from '../data/liquids.js';
import { rand, angDiff, TAU, seeded } from '../../engine/math.js';
import Shallow, { CH } from '../../engine/physics/Shallow.js';
import { bytesOf } from '../../engine/Bytes.js';

const JUMP = 48;   // px in one step: a teleport, not a stride

// smooth value noise 0..1 on a seeded lattice (the floor's bumps)
function noise(R) {
  const N = 64, lat = Float32Array.from({ length: N * N }, R);
  const at = (x, y) => lat[(y & (N - 1)) * N + (x & (N - 1))];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
}

export default class Liquids {
  constructor(world, cfg = LIQUIDS) {
    this.world = world;
    this.cfg = cfg;
    this.names = Object.keys(cfg.kinds);
    this.kinds = this.names.map((n) => cfg.kinds[n]);
    const m = world.map, C = cfg.cell;
    this.walled = false;      // the map's walls laid in the grid (at the first step: walls())
    this.gated = new Map();   // cell -> solid or not, as a door or a piece of furniture last left it (look)
    this.dents = new Map();   // cell -> [mm, ...] the rain's hollows dug in its floor (seed)
    this.prepare(m, world.level);
    this.sim = new Shallow(Math.ceil(m.widthPx / C), Math.ceil(m.heightPx / C), C, this.kinds,
      { ...cfg, floor: (S, c, a0) => this.lay(S, c, a0), solid: (i) => this.solidOf(i) });
    this.sources = [];
    this.walkers = new Map(); // character -> { x, y, kind, left, dist, side }
    this.bled = new Map();    // corpse -> the radius of its pool already poured
    this.ripples = [];        // { x, y, t, life, size, kind }
    this.stains = new Map();  // chunk -> mm of what stained each of its cells when it set or dried (made where some did)
    this.stained = [];        // cells set or dried since the drawing last painted them
    this.onDry = (i, mm) => { this.stain(i, mm); if (this.stained.length < cfg.maxStains) this.stained.push(i); };
    this.version = -1;
    this.gates = null;        // doors and furniture holding the liquid, linked at the first step
    this.clock = 0;
    this.dryT = 0;
    this.checkT = 0;
    this.sweepT = 0;
    this.tick = 0;
    world.events.on('propDestroyed', ({ prop, x, y }) => {
      if (prop.def.fountain) this.source(x, y, cfg.hydrant);
    });
    // area px2 of `kind` poured at (x, y): at once, or over dur seconds (a jet thrown toward `a`)
    world.events.on('spill', ({ x, y, kind, area, dur = 0, a }) => {
      if (dur > 0) this.source(x, y, { kind, rate: area / dur, dur, a });
      else this.feed(x, y, area, kind);
    });
  }

  // what its arrays hold, the flow's included, bytes (engine/Bytes.js; the perf overlay)
  bytes(seen) { return bytesOf([this, this.sim], seen); }

  // its grid let go (World.dispose): the world is not stepped again
  dispose() {
    this.sim = null;
    this.stains.clear();
    this.dents.clear();
    this.gated.clear();
  }

  // mm of what stained cell i when it set or dried (0: nothing did), kept by chunk
  stainOf(i) {
    const S = this.sim, t = this.stains.get(S.chunkOf(i)), x = i % S.w;
    return t ? t[(((i - x) / S.w) & (CH - 1)) * CH + (x & (CH - 1))] : 0;
  }
  stain(i, mm) {
    const S = this.sim, c = S.chunkOf(i), x = i % S.w;
    let t = this.stains.get(c);
    if (!t) this.stains.set(c, (t = new Float32Array(CH * CH)));
    t[(((i - x) / S.w) & (CH - 1)) * CH + (x & (CH - 1))] = mm;
  }

  // ---- the floor: its level and what it drinks

  // what the floor is made of, kept as it was when the level started (a wall knocked down is left as it was laid);
  // its bumps (two noises), its roads and their camber's reach, its manholes
  prepare(m, level = {}) {
    const R = seeded(7411 + (level.name || '').length), road = new Set(this.cfg.road.floors);
    this.broad = noise(R);
    this.fine = noise(R);
    this.floors = m.floor.slice();
    this.roads = Uint8Array.from(this.floors, (f) => (road.has(f) ? 1 : 0));
    this.tiles = [m.w, m.h];
    // past this many cells from a kerb the camber is at its most: no need to count further
    this.reach = Math.ceil(this.cfg.road.max / this.cfg.road.camber) + 1;
    this.manholes = level.street?.manholes || [];
  }

  // the floor's tile under cell (gx, gy): its index in the map, -1 out of it
  tileOf(gx, gy) {
    const C = this.cfg.cell, tx = Math.floor((gx * C) / TILE), ty = Math.floor((gy * C) / TILE), [w, h] = this.tiles;
    return tx < w && ty < h ? ty * w + tx : -1;
  }

  // a chunk of the grid made (Shallow `floor`, its first cell at address a0): its cells' level and what they drink
  lay(S, c, a0) {
    const C = this.cfg.cell, F = this.cfg.floors, rf = this.cfg.relief, { camber, max } = this.cfg.road;
    const cx = (c % S.cw) * CH, cy = ((c / S.cw) | 0) * CH, x1 = Math.min(S.w, cx + CH), y1 = Math.min(S.h, cy + CH);
    const dist = this.camber(S, cx, cy);
    for (let gy = cy; gy < y1; gy++) {
      for (let gx = cx; gx < x1; gx++) {
        const a = a0 + (gy - cy) * CH + gx - cx, t = this.tileOf(gx, gy), name = t >= 0 ? this.floors[t] : null, f = F[name] || F.concrete;
        const bump = this.broad(gx / rf.size, gy / rf.size) * rf.share + this.fine(gx / rf.fine + 31, gy / rf.fine + 17) * (1 - rf.share);
        S.z[a] = f.z + (bump - 0.5) * 2 * f.rough;
        S.soak[a] = f.soak;
        if (t >= 0 && this.roads[t]) S.z[a] += Math.min(max, dist[(gy - cy) * CH + gx - cx] * camber);
      }
    }
    // the manholes swallow what runs into them
    const d = this.cfg.drain;
    for (const [mc, mr] of this.manholes) {
      const x = mc * TILE, y = mr * TILE;
      for (let gy = Math.max(cy, Math.floor((y - d.r) / C)); gy <= Math.min(y1 - 1, Math.floor((y + d.r) / C)); gy++) {
        for (let gx = Math.max(cx, Math.floor((x - d.r) / C)); gx <= Math.min(x1 - 1, Math.floor((x + d.r) / C)); gx++) {
          if (Math.hypot((gx + 0.5) * C - x, (gy + 0.5) * C - y) > d.r) continue;
          const a = a0 + (gy - cy) * CH + gx - cx;
          S.soak[a] += d.soak;
          S.z[a] -= d.dip;
        }
      }
    }
    // the rain's hollows dug since the start
    if (!this.dents.size) return;
    for (let gy = cy; gy < y1; gy++) {
      for (let gx = cx; gx < x1; gx++) {
        const dz = this.dents.get(gy * S.w + gx);
        if (dz) for (const v of dz) S.z[a0 + (gy - cy) * CH + gx - cx] -= v;
      }
    }
  }

  // a road rises away from its kerbs: for each cell of the chunk at (cx, cy), how many cells it is from the nearest
  // one that is not road (a breadth-first count from those within `reach`: farther, the camber is at its most)
  camber(S, cx, cy) {
    const R = this.reach, x0 = Math.max(0, cx - R), y0 = Math.max(0, cy - R), x1 = Math.min(S.w, cx + CH + R), y1 = Math.min(S.h, cy + CH + R);
    const W = x1 - x0, n = W * (y1 - y0), dist = new Int32Array(n).fill(-1), queue = new Int32Array(n), out = new Int32Array(CH * CH).fill(R);
    let head = 0, tail = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const t = this.tileOf(x, y), j = (y - y0) * W + x - x0;
        if (t < 0 || !this.roads[t]) { dist[j] = 0; queue[tail++] = j; }
      }
    }
    while (head < tail) {
      const j = queue[head++], x = j % W;
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W]) {
        if (k < 0 || k >= n || dist[k] >= 0) continue;
        dist[k] = dist[j] + 1;
        queue[tail++] = k;
      }
    }
    for (let y = cy; y < Math.min(S.h, cy + CH); y++) {
      for (let x = cx; x < Math.min(S.w, cx + CH); x++) {
        const v = dist[(y - y0) * W + x - x0];
        if (v >= 0 && v < R) out[(y - cy) * CH + x - cx] = v;
      }
    }
    return out;
  }

  // is cell i solid (a cell of the grid not made yet): a wall or a window once the walls are laid, else as a door
  // or a piece of furniture last left it
  solidOf(i) {
    if (this.walled) {
      const m = this.world.map, S = this.sim, C = this.cfg.cell, gx = i % S.w;
      const tx = Math.floor((gx * C) / TILE), ty = Math.floor((((i - gx) / S.w) * C) / TILE);
      if (m.isSolid(tx, ty) || m.at(tx, ty) === 'G') return 1;
    }
    return this.gated.get(i) ?? 0;
  }

  // walls (and the windows in them: the sill is above the floor) hold it
  // (on the chunks made, in the order of the whole grid; those not made ask solidOf when they are)
  walls() {
    const m = this.world.map, S = this.sim, C = this.cfg.cell;
    this.version = m.version ?? 0;
    this.walled = true;
    this.gated.clear();
    for (let gy = 1; gy < S.h - 1; gy++) {
      const row = Math.floor(gy / CH) * S.cw;
      for (let gx = 1; gx < S.w - 1; gx++) {
        if (S.slot[row + Math.floor(gx / CH)] < 0) { gx += CH - 1 - (gx % CH); continue; }
        const tx = Math.floor((gx * C) / TILE), ty = Math.floor((gy * C) / TILE);
        S.setSolid(gy * S.w + gx, m.isSolid(tx, ty) || m.at(tx, ty) === 'G' ? 1 : 0);
      }
    }
    for (let c = 0; c < S.slot.length; c++) if (S.slot[c] < 0) S.ver[c]++; // (what they show beside a wet one may change)
    if (this.gates) for (const g of this.gates) g.on = null; // laid again at the next look
  }

  // the cells under a closed door's leaf and under each piece of furniture that stands on the floor
  link() {
    const w = this.world, S = this.sim, C = this.cfg.cell, dams = new Set(this.cfg.dams);
    const cellsOf = (pts) => [...new Set(pts.map(([x, y]) => S.index(x, y)).filter((i) => i >= 0))];
    this.gates = [];
    for (const d of w.doors) {
      const pts = [], c = Math.cos(d.a0), s = Math.sin(d.a0);
      // the leaf and a little past both its ends: it closes the doorway to the jambs (cells in the wall are left be)
      for (let t = -C * 2; t <= d.len + C * 2; t += 1) for (const o of [-1, 0, 1]) pts.push([d.hx + c * t - s * o, d.hy + s * t + c * o]);
      this.gates.push({ door: d, cells: cellsOf(pts), on: null });
    }
    for (const p of w.props) {
      if (!dams.has(p.type) || !p.def.static) continue;
      const parts = p.body.parts.length > 1 ? p.body.parts.slice(1) : [p.body], b = p.body.bounds, pts = [];
      for (let y = Math.floor(b.min.y / C) * C + C / 2; y < b.max.y; y += C) {
        for (let x = Math.floor(b.min.x / C) * C + C / 2; x < b.max.x; x += C) {
          if (parts.some((q) => Matter.Vertices.contains(q.vertices, { x, y }))) pts.push([x, y]);
        }
      }
      this.gates.push({ prop: p, cells: cellsOf(pts), on: null });
    }
    this.seed();
  }

  // is each gate holding now? (a door shut on its frame, a piece of furniture still standing)
  look() {
    const w = this.world, S = this.sim, m = w.map, C = this.cfg.cell, shut = this.cfg.shut;
    for (const g of this.gates) {
      const on = g.door
        ? w.doors.includes(g.door) && (g.door.locked || Math.abs(angDiff(g.door.body.angle, g.door.a0)) < shut)
        : !g.prop.dead && !g.prop.dying && w.props.includes(g.prop);
      if (on === g.on) continue;
      g.on = on;
      for (const i of g.cells) {
        const tx = Math.floor(((i % S.w) * C) / TILE), ty = Math.floor((Math.floor(i / S.w) * C) / TILE);
        if (m.isSolid(tx, ty) || m.at(tx, ty) === 'G' || S.solidAt(i) === +on) continue;
        this.gated.set(i, +on);
        S.setSolid(i, +on);
      }
    }
  }

  // what is already on the floor when the level starts: the rain's puddles in their hollows, the petrol, the spills
  seed() {
    const S = this.sim, C = this.cfg.cell, rain = this.cfg.rain, wet = this.names.indexOf('rain');
    for (const p of this.world.weather?.puddles || []) {
      const q = p.squash ?? 1, R = p.r * 1.3, cells = [];
      const blobs = [[p.x, p.y, p.r * 0.8, p.r * 0.72 * q]];
      for (const l of p.lobes) blobs.push([p.x + Math.cos(l.a) * l.d * p.r, p.y + Math.sin(l.a) * l.d * p.r * q, l.s * p.r, l.s * p.r * q]);
      for (let gy = Math.floor((p.y - R) / C); gy <= Math.floor((p.y + R) / C); gy++) {
        for (let gx = Math.floor((p.x - R) / C); gx <= Math.floor((p.x + R) / C); gx++) {
          if (gx < 1 || gy < 1 || gx >= S.w - 1 || gy >= S.h - 1) continue;
          const i = gy * S.w + gx, x = (gx + 0.5) * C, y = (gy + 0.5) * C;
          if (S.solidAt(i)) continue;
          let k = 0;
          for (const [bx, by, rx, ry] of blobs) k = Math.max(k, 1 - ((x - bx) / rx) ** 2 - ((y - by) / ry) ** 2);
          if (k <= 0) continue;
          const v = rain.hollow * Math.sqrt(k);
          S.z[S.cellOf(i)] -= v;
          if (this.dents.has(i)) this.dents.get(i).push(v); else this.dents.set(i, [v]);
          cells.push(i);
        }
      }
      // the water stands level in its hollow, a little under the lowest point of its rim: at rest from the start,
      // and it never dries under that
      const inside = new Set(cells);
      let rim = Infinity;
      for (const i of cells) for (const j of [i - 1, i + 1, i - S.w, i + S.w]) if (!inside.has(j) && !S.solidAt(j)) rim = Math.min(rim, S.z[S.cellOf(j)]);
      for (const i of cells) {
        const h = rim - rain.margin - S.z[S.cellOf(i)];
        if (h < rain.min) continue;
        S.addCell(i, h, wet, 0);
        S.rest[S.addr(i)] = h;
      }
    }
    // the petrol poured in trails (level `petrol`: [width px, [col, row], ...]), a pour every `step` px of them
    const P = this.cfg.petrol;
    for (const [width, ...pts] of this.world.level?.petrol || []) {
      for (let k = 0; k < pts.length; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1] || pts[k], len = Math.hypot(x1 - x0, y1 - y0) * TILE;
        for (let d = 0; d <= len; d += P.step) {
          const u = len ? d / len : 0;
          this.feed((x0 + (x1 - x0) * u) * TILE, (y0 + (y1 - y0) * u) * TILE, width * P.step * P.fill, 'petrol', width / 2);
        }
      }
    }
    // what was spilled before he came (level `spills`: [kind, col, row, area px2]): a bottle knocked over, a puddle
    for (const [kind, c, r, area] of this.world.level?.spills || []) this.feed(c * TILE, r * TILE, area, kind);
  }

  // ---- what is poured

  // something pours `rate` px2 of liquid per second at (x, y) for `dur` seconds, thrown toward `a` if given
  source(x, y, { kind = 'water', rate, dur, a, r }) {
    this.sources.push({ x, y, kind, rate, t: dur, a, r });
  }

  // `area` px2 of liquid poured at (x, y), over a disc of r px
  feed(x, y, area, kind = 'water', r = this.cfg.pourR) {
    const k = this.names.indexOf(kind);
    if (k < 0 || !(area > 0)) return;
    const C = this.cfg.cell;
    this.sim.pour(x, y, r, (area / (C * C)) * this.kinds[k].film * this.cfg.fill, k);
  }

  // `area` px2 of liquid falling as drops over a disc of r px (the sprinklers' rain), a ring where some land
  sprinkle(x, y, r, area, kind = 'water') {
    const S = this.cfg.sprinkle;
    for (let i = 0; i < S.drops; i++) {
      const a = rand(0, TAU), d = r * Math.sqrt(Math.random()), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      this.feed(px, py, area / S.drops, kind, this.cfg.cell);
      if (Math.random() < S.ring) this.ripple(px, py);
    }
  }

  // a drop falls in at (x, y): a ring spreads if there is standing liquid there
  ripple(x, y, size) {
    const S = this.sim, i = S.index(x, y), R = this.cfg.ripple;
    if (i < 0) return;
    const a = S.addr(i), dep = a < 0 ? 0 : S.dep[a], film = a < 0 ? 0 : S.film[a];
    if (dep < film * this.cfg.splash || this.ripples.length >= R.max) return;
    this.ripples.push({ x, y, t: 0, life: rand(...R.life), size: size ?? rand(...R.size), kind: a < 0 ? 255 : S.dom[a] });
  }

  // ---- reading

  // the wet under a point, if any: { kind, depth (films), slip }
  at(x, y) {
    const S = this.sim, a = S ? S.addr(S.index(x, y)) : -1;
    if (a < 0 || S.solid[a]) return null;
    const d = S.dep[a], f = S.film[a];
    if (d <= 0 || d < f * this.cfg.wet) return null;
    return { kind: this.names[S.dom[a]], depth: d / f, slip: S.slip[a] > 0.5 };
  }

  // floor grip multiplier at a point (a film deep or more: its kinds' grip; thinner, part of it)
  grip(x, y) {
    const S = this.sim, a = S ? S.addr(S.index(x, y)) : -1;
    if (a < 0) return 1;
    const d = S.dep[a], f = S.film[a];
    if (d <= 0 || d < f * this.cfg.wet) return 1;
    return 1 - (1 - S.grip[a]) * Math.min(1, d / f);
  }

  // ---- stepping

  update(dt) {
    const w = this.world, S = this.sim, c = this.cfg;
    if (!S) return;
    if ((w.map.version ?? 0) !== this.version) this.walls();
    if (!this.gates) this.link();
    if ((this.checkT -= dt) <= 0) { this.checkT = c.check; this.look(); }
    for (const s of this.sources) {
      s.t -= dt;
      this.feed(s.x, s.y, s.rate * dt, s.kind, s.r);
      if (s.a !== undefined) S.push(s.x, s.y, c.pourR * 2, Math.cos(s.a) * c.jet.speed, Math.sin(s.a) * c.jet.speed, c.jet.k);
    }
    if (this.sources.length) this.sources = this.sources.filter((s) => s.t > 0);
    this.bleed();
    const P = 1 / c.rate;
    this.clock = Math.min(this.clock + dt, P * 2);
    while (this.clock >= P) { this.clock -= P; S.step(P); }
    if ((this.dryT += dt) >= c.dryEvery) { S.dry(this.dryT, this.onDry); this.dryT = 0; }
    if ((this.sweepT += dt) >= c.sweep) { S.sweep(); this.sweepT = 0; } // the chunks left dry and still let go
    for (const r of this.ripples) r.t += dt;
    if (this.ripples.length) this.ripples = this.ripples.filter((r) => r.t < r.life);
    this.tick++;
    for (const ch of w.chars) this.walk(ch, dt);
    for (const [ch, t] of this.walkers) if (t.seen !== this.tick) this.walkers.delete(ch); // dead or gone
  }

  // the bodies' blood: each pool as it grows (Bleeding: `pool` px of radius at `poolAt()`), poured at the wound
  bleed() {
    const w = this.world;
    for (const c of w.corpses) {
      if (!c.poolPos || !c.poolAt) continue;
      let r0 = this.bled.get(c) ?? 0;
      if (c.pool < r0) r0 = 0; // shoved out of its pool: a new one starts
      if (c.pool > r0 && c.pool > this.cfg.minPool) {
        const at = c.poolAt();
        this.feed(at.x, at.y, Math.PI * (c.pool * c.pool - r0 * r0), 'blood', this.cfg.cell);
        r0 = c.pool;
      }
      this.bled.set(c, r0);
    }
    if (this.bled.size > w.corpses.length) for (const c of this.bled.keys()) if (!w.corpses.includes(c)) this.bled.delete(c);
  }

  // one character's feet: wet them in it, push it along, print them on the dry floor after it
  walk(ch, dt) {
    if (!ch.alive) return;
    let t = this.walkers.get(ch);
    if (!t) this.walkers.set(ch, t = { x: ch.x, y: ch.y, kind: null, left: 0, dist: 0, side: 1 });
    t.seen = this.tick;
    const dx = ch.x - t.x, dy = ch.y - t.y, d = Math.hypot(dx, dy);
    t.x = ch.x; t.y = ch.y;
    if (d > JUMP || d < 0.01 || ch.vaulting) return;
    const zone = this.at(ch.x, ch.y);
    if (!zone && t.left <= 0) return;
    const w = this.world, c = this.cfg, sliding = !!ch.slide, a = Math.atan2(dy, dx);
    t.dist += d;
    if (zone) {
      const k = c.kinds[zone.kind];
      t.kind = zone.kind;
      t.left = k.prints;
      if (zone.depth >= 1 && dt > 0) this.sim.push(ch.x, ch.y, c.wade.r, dx / dt, dy / dt, c.wade.k);
      if (t.dist < c.stride) return;
      t.dist = 0;
      // feet (or a sliding hip) slapping through it; a film only wets the soles
      if (k.splash && zone.depth >= c.splash) {
        w.particles.drops(ch.x, ch.y, a, 1.2, sliding ? 5 : 2, k.splash, sliding ? 150 : 90, 3, false);
        if (!k.quiet) w.sound('splash', ch.x, ch.y, sliding ? 0.9 : 0.45);
        this.ripple(ch.x, ch.y, 5);
      }
      return;
    }
    const k = c.kinds[t.kind], fade = t.left / k.prints;
    if (sliding) {
      // a slide wipes it all off in one long smear
      if (t.dist < c.smear) return;
      w.decals.smear(ch.x, ch.y, a, t.dist + 2, k.color, k.alpha * fade * 0.8);
      t.dist = 0;
      t.left -= 0.5;
      return;
    }
    if (t.dist < c.stride) return;
    t.dist = 0;
    t.side = -t.side;
    const px = ch.x - Math.sin(a) * c.gait * t.side, py = ch.y + Math.cos(a) * c.gait * t.side;
    w.decals.footprint(px, py, a, k.color, k.alpha * (0.25 + 0.75 * fade));
    w.events.emit('footprint', { who: ch, x: px, y: py, angle: a, kind: t.kind });
    t.left--;
  }
}
