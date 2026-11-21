// The wet of a level after an earlier rain (level `wet` / `soundscape.rain`, 0..1; RAIN in data/atmosphere.js; no
// rain falls: the user). What is kept here does not move: which tiles are under the open sky (the wet floors mirror
// there: render/Lighting.js) and the puddles of rain lying in the open (where they lie: the water itself is liquid on
// the floor, systems/Liquids.js fills their hollows). DOM-free; laid out with its own seeded random numbers, so the
// game's random sequence is not touched and the puddles lie in the same places every time.
import { TILE, AMBIENCE } from '../Config.js';
import { RAIN } from '../data/atmosphere.js';
import { clamp, TAU, seeded, hashString } from '../../engine/math.js';

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

// which tiles are in the open air (1): the street, the alleys, the yards, the walkable roofs; never a room, a wall, a
// door or a window. A floor of AMBIENCE.outdoors is; one of `indoors` is not; any other (bare concrete: a back lot or
// a store room) is when its stretch of tiles runs out onto an open one without passing a door.
export function openAir(map, indoors = AMBIENCE.indoors, outdoors = AMBIENCE.outdoors) {
  const roofed = new Set(indoors), sure = new Set(outdoors), open = new Uint8Array(map.w * map.h), todo = [];
  const kind = (x, y) => {
    const f = x >= 0 && y >= 0 && x < map.w && y < map.h && map.floor[y * map.w + x];
    if (!f || map.isWallChar(x, y) || 'DLG'.includes(map.at(x, y)) || roofed.has(f)) return 0;
    return sure.has(f) ? 2 : 1; // 1: to be found out
  };
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) if (kind(x, y) === 2) { open[y * map.w + x] = 1; todo.push(x, y); }
  }
  while (todo.length) {
    const y = todo.pop(), x = todo.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (kind(nx, ny) !== 1 || open[ny * map.w + nx]) continue;
      open[ny * map.w + nx] = 1;
      todo.push(nx, ny);
    }
  }
  return open;
}

export default class Weather {
  constructor(world, level = {}, cfg = RAIN) {
    this.world = world;
    this.cfg = cfg;
    this.k = clamp((level.wet ?? level.soundscape?.rain ?? 0) * cfg.look, 0, 1); // how wet it is seen to be (level `wet`)
    this.puddles = [];
    if (!this.k) return;
    this.sky = skyGrid(world.map);
    this.layPuddles(world.map, seeded(hashString(level.name || 'level')));
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
  layPuddles(map, R) {
    const c = this.cfg.puddles, cells = this.openFloors(map, new Set(c.floors));
    const want = Math.round((cells.length / 100) * c.per);
    for (let tries = 0; this.puddles.length < want && tries < want * 20; tries++) {
      const [cx, cy] = cells[Math.floor(R() * cells.length)];
      const x = (cx + 0.15 + R() * 0.7) * TILE, y = (cy + 0.15 + R() * 0.7) * TILE;
      if (this.puddles.some((p) => Math.hypot(p.x - x, p.y - y) < c.gap)) continue;
      // flatter and more ragged than a spill: water lying in a dip of the ground
      const lobes = [], n = c.lobes;
      for (let i = 0; i < n; i++) lobes.push({ a: (i + (R() - 0.5) * 0.8) * TAU / n, d: 0.3 + R() * 0.5, s: 0.28 + R() * 0.3, ph: R() * TAU });
      this.puddles.push({ x, y, r: c.r[0] + R() * (c.r[1] - c.r[0]), squash: c.squash[0] + R() * (c.squash[1] - c.squash[0]), lobes });
    }
  }
}
