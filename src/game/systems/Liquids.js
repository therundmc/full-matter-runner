// What is wet on the floor and what it does (LIQUIDS in data/liquids.js). Every liquid poured on the floor is
// one shallow liquid over the whole map (engine/physics/Shallow.js, cells of a few px): it runs, spreads, gathers
// in hollows and along the kerbs, is held by walls, shut doors and what stands on the floor, mixes (beer into
// water thins it, blood into water turns it pink), dries or soaks into the floor; blood sets and is left as a stain.
// Where it comes from: sources pouring a while (a burst hydrant, a holed keg, a broken pipe: `source`, 'spill'
// with a `dur`), spills at once ('spill': smashed bottles), what rains on the floor (the sprinklers: `sprinkle`),
// the bodies bleeding (the pool each corpse lets out, fed as it grows), the rain's puddles lying in the hollows
// of the open ground (systems/Weather.js lays them), the petrol on the floor of a room the lesson sets alight.
// What it does: a wet floor grips less (World.floorGrip; a slick kind floors runners, systems/Slips.js); whoever
// walks in it splashes, pushes it along, then prints fading footprints on the dry floor or one long smear when
// sliding (`decals.footprint` / `decals.smear`, event 'footprint' for the guards); drops landing in it ring.
// DOM-free: render/LiquidArt.js draws the grid and paints the stains it hands over (`stained`).
// Listens to 'propDestroyed' (a `fountain` prop: the hydrant) and 'spill'.
import { TILE } from '../Config.js';
import { LIQUIDS } from '../data/liquids.js';
import { seeded } from './Weather.js';
import { rand, angDiff, TAU } from '../../engine/math.js';
import Shallow from '../../engine/physics/Shallow.js';

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
    this.sim = new Shallow(Math.ceil(m.widthPx / C), Math.ceil(m.heightPx / C), C, this.kinds, cfg);
    this.lay(m, world.level);
    this.sources = [];
    this.walkers = new Map(); // character -> { x, y, kind, left, dist, side }
    this.bled = new Map();    // corpse -> the radius of its pool already poured
    this.ripples = [];        // { x, y, t, life, size, kind }
    this.stain = new Float32Array(this.sim.N); // mm of what stained each cell when it set or dried
    this.stained = [];        // cells set or dried since the drawing last painted them
    this.onDry = (i, mm) => { this.stain[i] = mm; if (this.stained.length < cfg.maxStains) this.stained.push(i); };
    this.version = -1;
    this.gates = null;        // doors and furniture holding the liquid, linked at the first step
    this.clock = 0;
    this.dryT = 0;
    this.checkT = 0;
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

  // ---- the floor: its level and what it drinks

  lay(m, level = {}) {
    const S = this.sim, C = this.cfg.cell, F = this.cfg.floors, R = seeded(7411 + (level.name || '').length);
    const broad = noise(R), fine = noise(R), rf = this.cfg.relief, road = new Set(this.cfg.road.floors);
    const isRoad = new Uint8Array(S.N);
    for (let gy = 0; gy < S.h; gy++) {
      for (let gx = 0; gx < S.w; gx++) {
        const i = gy * S.w + gx, tx = Math.floor((gx * C) / TILE), ty = Math.floor((gy * C) / TILE);
        const name = tx < m.w && ty < m.h ? m.floor[ty * m.w + tx] : null, f = F[name] || F.concrete;
        const bump = broad(gx / rf.size, gy / rf.size) * rf.share + fine(gx / rf.fine + 31, gy / rf.fine + 17) * (1 - rf.share);
        S.z[i] = f.z + (bump - 0.5) * 2 * f.rough;
        S.soak[i] = f.soak;
        if (road.has(name)) isRoad[i] = 1;
      }
    }
    this.camber(isRoad);
    // the manholes swallow what runs into them
    const d = this.cfg.drain;
    for (const [c, r] of level.street?.manholes || []) {
      const x = c * TILE, y = r * TILE;
      for (let gy = Math.floor((y - d.r) / C); gy <= Math.floor((y + d.r) / C); gy++) {
        for (let gx = Math.floor((x - d.r) / C); gx <= Math.floor((x + d.r) / C); gx++) {
          if (gx < 0 || gy < 0 || gx >= S.w || gy >= S.h) continue;
          if (Math.hypot((gx + 0.5) * C - x, (gy + 0.5) * C - y) <= d.r) { S.soak[gy * S.w + gx] += d.soak; S.z[gy * S.w + gx] -= d.dip; }
        }
      }
    }
  }

  // a road rises away from its kerbs (a breadth-first count of cells from the nearest one that is not road)
  camber(isRoad) {
    const S = this.sim, { camber, max } = this.cfg.road, dist = new Int32Array(S.N).fill(-1), queue = new Int32Array(S.N);
    let head = 0, tail = 0;
    for (let i = 0; i < S.N; i++) if (!isRoad[i]) { dist[i] = 0; queue[tail++] = i; }
    while (head < tail) {
      const i = queue[head++], x = i % S.w;
      for (const j of [x > 0 ? i - 1 : -1, x < S.w - 1 ? i + 1 : -1, i - S.w, i + S.w]) {
        if (j < 0 || j >= S.N || dist[j] >= 0) continue;
        dist[j] = dist[i] + 1;
        queue[tail++] = j;
      }
    }
    for (let i = 0; i < S.N; i++) if (isRoad[i]) S.z[i] += Math.min(max, dist[i] * camber);
  }

  // walls (and the windows in them: the sill is above the floor) hold it
  walls() {
    const m = this.world.map, S = this.sim, C = this.cfg.cell;
    this.version = m.version ?? 0;
    for (let gy = 1; gy < S.h - 1; gy++) {
      for (let gx = 1; gx < S.w - 1; gx++) {
        const tx = Math.floor((gx * C) / TILE), ty = Math.floor((gy * C) / TILE);
        S.setSolid(gy * S.w + gx, m.isSolid(tx, ty) || m.at(tx, ty) === 'G' ? 1 : 0);
      }
    }
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
        if (!m.isSolid(tx, ty) && m.at(tx, ty) !== 'G') S.setSolid(i, on ? 1 : 0);
      }
    }
  }

  // what is already on the floor when the level starts: the rain's puddles in their hollows, the petrol
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
          if (S.solid[i]) continue;
          let k = 0;
          for (const [bx, by, rx, ry] of blobs) k = Math.max(k, 1 - ((x - bx) / rx) ** 2 - ((y - by) / ry) ** 2);
          if (k <= 0) continue;
          S.z[i] -= rain.hollow * Math.sqrt(k);
          cells.push(i);
        }
      }
      // the water stands level in its hollow, a little under the lowest point of its rim: at rest from the start,
      // and it never dries under that
      const inside = new Set(cells);
      let rim = Infinity;
      for (const i of cells) for (const j of [i - 1, i + 1, i - S.w, i + S.w]) if (!inside.has(j) && !S.solid[j]) rim = Math.min(rim, S.z[j]);
      for (const i of cells) {
        const h = rim - rain.margin - S.z[i];
        if (h < rain.min) continue;
        S.addCell(i, h, wet, 0);
        S.rest[i] = h;
      }
    }
    const lv = this.world.level, stages = lv?.tutorial?.stages, P = this.cfg.petrol;
    for (const [col, row, stage = -1] of lv?.fires || []) {
      if (stages?.[stage]?.spark) this.feed(col * TILE, row * TILE, P.area, 'petrol', P.r);
    }
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
    if (i < 0 || S.dep[i] < S.film[i] * this.cfg.splash || this.ripples.length >= R.max) return;
    this.ripples.push({ x, y, t: 0, life: rand(...R.life), size: size ?? rand(...R.size), kind: S.dom[i] });
  }

  // ---- reading

  // the wet under a point, if any: { kind, depth (films), slip }
  at(x, y) {
    const S = this.sim, i = S.index(x, y);
    if (i < 0 || S.solid[i]) return null;
    const d = S.dep[i], f = S.film[i];
    if (d <= 0 || d < f * this.cfg.wet) return null;
    return { kind: this.names[S.dom[i]], depth: d / f, slip: S.slip[i] > 0.5 };
  }

  // floor grip multiplier at a point (a film deep or more: its kinds' grip; thinner, part of it)
  grip(x, y) {
    const S = this.sim, i = S.index(x, y);
    if (i < 0) return 1;
    const d = S.dep[i], f = S.film[i];
    if (d <= 0 || d < f * this.cfg.wet) return 1;
    return 1 - (1 - S.grip[i]) * Math.min(1, d / f);
  }

  // ---- stepping

  update(dt) {
    const w = this.world, S = this.sim, c = this.cfg;
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
