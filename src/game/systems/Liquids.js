// What is wet on the floor and what it does (no DOM: painting goes through world.decals and WorldRenderer).
//   puddles  liquid poured on the floor (a burst hydrant, a broken toilet, smashed bottles), spreading in real
//            time, standing, then drying; one kind each (LIQUIDS.kinds: water, booze)
//   pools    the blood under each body (the corpse owns and draws it; we only know where it is wet)
//   walkers  whoever steps in one carries it away: fading footprints, a smear when sliding
// A wet floor also grips less (World.floorGrip), so bodies and loose objects slide further on it.
// Tuning lives in LIQUIDS (Config.js). Listens to 'propDestroyed' (hydrants) and 'spill' (anything pouring liquid).
// Emits 'footprint' (guards read them).
import { LIQUIDS } from '../Config.js';
import { rand, TAU } from '../../engine/math.js';

const JUMP = 48;   // px in one step: a teleport, not a stride
const MERGE = 0.6; // seconds a puddle takes to run into the bigger one that reached it

// irregular outline of a puddle: blobs around the centre, as fractions of its radius
function lobes() {
  const n = 6, out = [];
  for (let i = 0; i < n; i++) out.push({ a: (i + rand(-0.35, 0.35)) * TAU / n, d: rand(0.35, 0.62), s: rand(0.5, 0.78), ph: rand(0, TAU) });
  return out;
}

// the outline of a puddle as overlapping ellipses [x, y, rx, ry] (renderers fill them as one shape); `squash` (a rain
// puddle's) flattens it
export function puddleShape(p) {
  const q = p.squash ?? 1, out = [[p.x, p.y, p.r * 0.8, p.r * 0.72 * q]];
  for (const l of p.lobes) out.push([p.x + Math.cos(l.a) * l.d * p.r, p.y + Math.sin(l.a) * l.d * p.r * q, l.s * p.r, l.s * p.r * q]);
  return out;
}

export default class Liquids {
  constructor(world) {
    this.world = world;
    this.puddles = [];
    this.sources = [];
    this.pools = new Map();   // corpse -> { kind, x, y, r, ttl }
    this.walkers = new Map(); // character -> { x, y, kind, left, dist, side }
    this.tick = 0;
    world.events.on('propDestroyed', ({ prop, x, y }) => {
      if (prop.def.fountain) this.source(x, y, LIQUIDS.hydrant);
    });
    // area px² of `kind` poured at (x, y): at once, or over dur seconds
    world.events.on('spill', ({ x, y, kind, area, dur = 0, cap }) => {
      if (dur > 0) this.source(x, y, { kind, rate: area / dur, dur, cap });
      else this.feed(x, y, area, kind, cap);
    });
  }

  // something pours `rate` px² of liquid per second at (x, y) for `dur` seconds
  source(x, y, { kind = 'water', rate, dur, cap = 60 }) {
    this.sources.push({ x, y, kind, rate, cap, t: dur });
  }

  // add liquid at a point: it joins the puddle it falls into (which creeps toward it), or starts a new one
  feed(x, y, area, kind = 'water', cap = 60) {
    let p = this.puddles.find((q) => q.kind === kind && Math.hypot(q.x - x, q.y - y) < q.r + 10);
    if (!p) {
      // too many: the smallest one has soaked away
      if (this.puddles.length >= LIQUIDS.maxPuddles) {
        this.puddles.splice(this.puddles.reduce((m, q, i, all) => (q.area < all[m].area ? i : m), 0), 1);
      }
      p = { kind, x, y, area: 0, r: 0, cap, lobes: lobes(), dry: 0, alpha: 1, fed: 0 };
      this.puddles.push(p);
    }
    p.area += area;
    p.x += (x - p.x) * (area / p.area);
    p.y += (y - p.y) * (area / p.area);
    p.cap = Math.max(p.cap, cap);
    p.r = Math.min(p.cap, Math.sqrt(p.area / Math.PI));
    p.dry = LIQUIDS.kinds[kind].wet;
    p.fed = 0.25;
    return p;
  }

  // the wet area under a point, if any ({ kind, x, y, r })
  at(x, y) {
    for (const p of this.puddles) {
      const dx = p.x - x, dy = p.y - y, r = p.r * 0.92;
      if (dx * dx + dy * dy < r * r) return p;
    }
    for (const z of this.pools.values()) {
      const dx = z.x - x, dy = z.y - y;
      if (dx * dx + dy * dy < z.r * z.r) return z;
    }
    return null;
  }

  // floor grip multiplier at a point
  grip(x, y) {
    if (!this.puddles.length && !this.pools.size) return 1;
    return this.at(x, y) ? LIQUIDS.grip : 1;
  }

  update(dt) {
    const w = this.world;
    for (const s of this.sources) { s.t -= dt; this.feed(s.x, s.y, s.rate * dt, s.kind, s.cap); }
    this.sources = this.sources.filter((s) => s.t > 0);

    for (const p of this.puddles) {
      if (p.fed > 0) { p.fed -= dt; continue; }
      p.dry -= dt;
      p.alpha = Math.min(1, p.dry / LIQUIDS.fade);
    }
    this.puddles = this.puddles.filter((p) => p.dry > 0);
    this.merge();

    // blood: wet while the body lies in it, then for a while after it has been baked into the floor
    for (const c of w.corpses) {
      if (!(c.pool > LIQUIDS.minPool) || !c.poolAt) continue;
      let z = this.pools.get(c);
      if (!z) this.pools.set(c, z = { kind: 'blood', x: 0, y: 0, r: 0, ttl: LIQUIDS.kinds.blood.wet });
      const at = c.poolAt();
      z.x = at.x; z.y = at.y; z.r = c.pool * 0.9;
    }
    for (const [c, z] of this.pools) {
      if (!c.dead) continue;
      z.ttl -= dt;
      if (z.ttl <= 0) this.pools.delete(c);
    }

    this.tick++;
    for (const ch of w.chars) this.walk(ch);
    for (const [ch, t] of this.walkers) if (t.seen !== this.tick) this.walkers.delete(ch); // dead or gone
  }

  // a puddle that has spread over a smaller one of the same liquid drinks it up
  merge() {
    const all = this.puddles;
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      const big = all.find((q) => q !== s && q.kind === s.kind && q.area >= s.area && Math.hypot(q.x - s.x, q.y - s.y) + s.r * 0.5 < q.r);
      if (!big) continue;
      all.splice(i, 1);
      this.sources.push({ x: s.x, y: s.y, kind: s.kind, rate: s.area / MERGE, cap: Math.max(big.cap, s.cap), t: MERGE });
    }
  }

  // one character's feet: wet them in a puddle, print them on the dry floor after it
  walk(ch) {
    if (!ch.alive) return;
    let t = this.walkers.get(ch);
    if (!t) this.walkers.set(ch, t = { x: ch.x, y: ch.y, kind: null, left: 0, dist: 0, side: 1 });
    t.seen = this.tick;
    const dx = ch.x - t.x, dy = ch.y - t.y, d = Math.hypot(dx, dy);
    t.x = ch.x; t.y = ch.y;
    if (d > JUMP || d < 0.01 || ch.vaulting) return;
    const zone = this.at(ch.x, ch.y);
    if (!zone && t.left <= 0) return;
    const w = this.world, sliding = !!ch.slide, a = Math.atan2(dy, dx);
    t.dist += d;
    if (zone) {
      const k = LIQUIDS.kinds[zone.kind];
      t.kind = zone.kind;
      t.left = k.prints;
      if (t.dist < LIQUIDS.stride) return;
      t.dist = 0;
      // feet (or a sliding hip) slapping through water; a film of blood only wets the soles
      if (k.splash) {
        w.particles.drops(ch.x, ch.y, a, 1.2, sliding ? 5 : 2, k.splash, sliding ? 150 : 90, 3, false);
        if (!k.quiet) w.sound('splash', ch.x, ch.y, sliding ? 0.9 : 0.45);
      }
      return;
    }
    const k = LIQUIDS.kinds[t.kind], fade = t.left / k.prints;
    if (sliding) {
      // a slide wipes it all off in one long smear
      if (t.dist < LIQUIDS.smear) return;
      w.decals.smear(ch.x, ch.y, a, t.dist + 2, k.color, k.alpha * fade * 0.8);
      t.dist = 0;
      t.left -= 0.5;
      return;
    }
    if (t.dist < LIQUIDS.stride) return;
    t.dist = 0;
    t.side = -t.side;
    const px = ch.x - Math.sin(a) * LIQUIDS.gait * t.side, py = ch.y + Math.cos(a) * LIQUIDS.gait * t.side;
    w.decals.footprint(px, py, a, k.color, k.alpha * (0.25 + 0.75 * fade));
    w.events.emit('footprint', { who: ch, x: px, y: py, angle: a, kind: t.kind });
    t.left--;
  }
}
