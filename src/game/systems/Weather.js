// The wet of a level after the rain, and the rain itself when `RAIN.falls` is on (it is off: the user wants none;
// level `soundscape.rain`, 0..1; RAIN in data/atmosphere.js). What is kept here is what does not move: which tiles are under the open sky, the puddles of rain lying in the
// open and the spots where water drips off the eaves and the fire escape. The drops themselves are not stored:
// render/WeatherArt.js hashes each one's place and timing from the time (cheap, nothing to update).
// Someone walking through a puddle of rain splashes. DOM-free; laid out with its own seeded random numbers, so the
// game's random sequence is not touched and the puddles lie in the same places every time.
import { TILE, AMBIENCE } from '../Config.js';
import { RAIN } from '../data/atmosphere.js';
import { clamp, TAU } from '../../engine/math.js';

const { Body } = Matter;

// small seeded generator (mulberry32)
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// which tiles see the sky: open floors that are not under a roof, and the tops of walls that are not a room's own
// (the roofs around, the outer walls); a wall bordering an indoor floor is under the same roof as the room
export function skyGrid(map, indoors = AMBIENCE.indoors) {
  const roofed = new Set(indoors), sky = new Uint8Array(map.w * map.h);
  const inside = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && !map.isWallChar(x, y) && roofed.has(map.floor[y * map.w + x]);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const f = map.floor[y * map.w + x];
      if (map.isWallChar(x, y)) sky[y * map.w + x] = inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1) ? 0 : 1;
      else if (f) sky[y * map.w + x] = roofed.has(f) ? 0 : 1;
    }
  }
  return sky;
}

export default class Weather {
  constructor(world, level = {}, cfg = RAIN) {
    this.world = world;
    this.cfg = cfg;
    this.k = clamp((level.wet ?? level.soundscape?.rain ?? 0) * cfg.look, 0, 1); // how wet it is seen to be (level `wet`)
    this.puddles = [];
    this.drips = [];
    this.walkers = new Map(); // character -> px walked since his last splash
    if (!this.k) return;
    const map = world.map;
    this.rand = seeded(hashString(level.name || 'level'));
    this.sky = skyGrid(map);
    this.layPuddles(map);
    this.dripsLaid = !cfg.falls; // (no drips when it is not raining) the fire escape is a prop: laid at the first step
  }

  // under the open sky at (x, y) px
  open(x, y) {
    if (!this.sky) return false;
    const m = this.world.map, cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    return cx >= 0 && cy >= 0 && cx < m.w && cy < m.h && this.sky[cy * m.w + cx] === 1;
  }

  // walkable open floors of the given kinds
  openFloors(map, kinds) {
    const out = [];
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const i = y * map.w + x;
        if (this.sky[i] && !map.isSolid(x, y) && !map.isBlocked(x, y) && kinds.has(map.floor[i])) out.push([x, y]);
      }
    }
    return out;
  }

  // puddles of rain in the open: never on top of each other, their shape a few lobes like a spill's
  layPuddles(map) {
    const c = this.cfg.puddles, R = this.rand, cells = this.openFloors(map, new Set(c.floors));
    const want = Math.round((cells.length / 100) * c.per);
    for (let tries = 0; this.puddles.length < want && tries < want * 20; tries++) {
      const [cx, cy] = cells[Math.floor(R() * cells.length)];
      const x = (cx + 0.15 + R() * 0.7) * TILE, y = (cy + 0.15 + R() * 0.7) * TILE;
      if (this.puddles.some((p) => Math.hypot(p.x - x, p.y - y) < c.gap)) continue;
      // flatter and more ragged than a spill: water lying in a dip of the ground
      const lobes = [], n = c.lobes;
      for (let i = 0; i < n; i++) lobes.push({ a: (i + (R() - 0.5) * 0.8) * TAU / n, d: 0.3 + R() * 0.5, s: 0.28 + R() * 0.3, ph: R() * TAU });
      this.puddles.push({ kind: 'water', look: c.look, x, y, r: c.r[0] + R() * (c.r[1] - c.r[0]), squash: c.squash[0] + R() * (c.squash[1] - c.squash[0]), lobes, alpha: 1, fed: 0, seed: R() * 100 });
    }
  }

  // drip spots: along the foot of walls in the open (the eaves above) and under the fire escape's ladders
  layDrips() {
    this.dripsLaid = true;
    const map = this.world.map, d = this.cfg.drips, R = this.rand, spots = [];
    const wall = (x, y) => map.isWallChar(x, y);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (!this.sky[y * map.w + x] || map.isSolid(x, y)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (wall(x + dx, y + dy)) spots.push([x, y, dx, dy]);
      }
    }
    const want = Math.round((spots.length / 100) * d.per);
    for (let i = 0; i < want && spots.length; i++) {
      const [x, y, dx, dy] = spots.splice(Math.floor(R() * spots.length), 1)[0];
      // a few px out from the wall face, anywhere along it
      const along = 4 + R() * (TILE - 8), out = 3 + R() * 3;
      const px = dx ? (x + (dx > 0 ? 1 : 0)) * TILE - dx * out : x * TILE + along;
      const py = dy ? (y + (dy > 0 ? 1 : 0)) * TILE - dy * out : y * TILE + along;
      this.drips.push(this.drip(px, py));
    }
    for (const p of this.world.props) {
      if (p.type !== 'ladder' || !this.open(p.x, p.y)) continue;
      for (let i = 0; i < d.ladder; i++) {
        const a = p.body.angle, u = (R() - 0.5) * p.def.w * 0.8, v = (R() - 0.5) * p.def.h * 0.8;
        this.drips.push(this.drip(p.x + u * Math.cos(a) - v * Math.sin(a), p.y + u * Math.sin(a) + v * Math.cos(a)));
      }
    }
  }

  drip(x, y) {
    const [a, b] = this.cfg.drips.every, R = this.rand;
    return { x, y, period: a + R() * (b - a), seed: R() * 100 };
  }

  update() {
    if (!this.k) return;
    if (!this.dripsLaid) this.layDrips();
    if (!this.puddles.length) return;
    // feet through a puddle of rain throw a little water about (no sound, no prints: it is only rain)
    const c = this.cfg.puddles.splash, w = this.world;
    for (const ch of w.chars) {
      if (!ch.alive || ch.vaulting) continue;
      const v = Body.getVelocity(ch.body), sp = Math.hypot(v.x, v.y);
      if (sp < 0.4) continue;
      const p = this.puddles.find((q) => Math.abs(q.x - ch.x) < q.r && Math.abs(q.y - ch.y) < q.r && Math.hypot(q.x - ch.x, q.y - ch.y) < q.r * 0.85);
      if (!p) { this.walkers.delete(ch); continue; }
      const d = (this.walkers.get(ch) ?? c.stride) + sp;
      if (d < c.stride) { this.walkers.set(ch, d); continue; }
      this.walkers.set(ch, 0);
      w.particles.drops(ch.x, ch.y, Math.atan2(v.y, v.x), 1.3, ch.slide ? c.drops * 2 : c.drops, c.color, c.speed, 3, false);
    }
  }
}
