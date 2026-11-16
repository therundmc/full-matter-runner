// Where a guard's feet take him, worked out (no DOM, no world access, unit tested): tiles he has learnt to keep away
// from for a while (a doorway he found jammed, where a mate fell), the extra cost each tile is worth to his
// path-finding (those, the routes his mates in the fight already take, fire, a slick floor), the tile in his way
// when something stops him, and how he gives way to the people around him. Tuning: Config AI.nav.
import { AI, TILE } from '../Config.js';

// Tiles with an extra path cost that wears off: cell -> { cost, until }. A guard keeps his own (what he ran into);
// the Director keeps the squad's (where a mate was killed: it is called out).
export class CellMemory {
  constructor() { this.cells = new Map(); }

  get size() { return this.cells.size; }

  // the tile is worth `cost` more until `until` (the higher cost and the later end win)
  mark(cell, cost, until) {
    const o = this.cells.get(cell);
    if (o) { o.cost = Math.max(o.cost, cost); o.until = Math.max(o.until, until); } else this.cells.set(cell, { cost, until });
  }

  cost(cell, now) {
    const o = this.cells.get(cell);
    if (!o) return 0;
    if (o.until > now) return o.cost;
    this.cells.delete(cell);
    return 0;
  }

  // mark the tile of (x, y) and those around it within r tiles (a lighter cost on the ring)
  markAround(map, x, y, r, cost, until) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const nx = cx + i, ny = cy + j;
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
        this.mark(ny * map.w + nx, i || j ? cost * 0.5 : cost, until);
      }
    }
  }

  prune(now) { for (const [k, o] of this.cells) if (o.until <= now) this.cells.delete(k); }
}

// The cells a path runs through (from (x, y) along its points), sampled every half tile: a mate's route
export function routeCells(map, x, y, path) {
  const out = new Set();
  let ax = x, ay = y;
  for (const p of path || []) {
    const n = Math.ceil(Math.hypot(p.x - ax, p.y - ay) / (TILE / 2));
    for (let k = 1; k <= n; k++) {
      const px = ax + ((p.x - ax) * k) / n, py = ay + ((p.y - ay) * k) / n;
      out.add(Math.floor(py / TILE) * map.w + Math.floor(px / TILE));
    }
    ax = p.x; ay = p.y;
  }
  return out;
}

// The tile in a walker's way: the one `reach` px ahead of (x, y) along (ux, uy), or the next one along when that is
// still his own. null off the map.
export function cellAhead(map, x, y, ux, uy, reach = 20) {
  const own = Math.floor(y / TILE) * map.w + Math.floor(x / TILE);
  for (const r of [reach, reach + TILE / 2, reach + TILE]) {
    const cx = Math.floor((x + ux * r) / TILE), cy = Math.floor((y + uy * r) / TILE);
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return null;
    const c = cy * map.w + cx;
    if (c !== own) return c;
  }
  return null;
}

// Giving way, for a walker `me` { x, y, radius } heading (ux, uy) among `others` (characters: { x, y, vel, radius },
// or plain { x, y, vx, vy, r }; velocities in px per step):
//   - pushed off anyone overlapping his personal space (r + their r + A.space),
//   - stepping aside, always to his right (both do: they pass each other), of anyone standing or coming the other
//     way in a cone ahead of him within A.ahead px,
//   - slowed behind one going his way slower (a queue in a corridor, a doorway).
// Returns { x, y } to add to his heading (unit-ish) and `slow` 0..1, the share of his pace he keeps.
export function giveWay(me, ux, uy, others, A = AI.nav.avoid) {
  let x = 0, y = 0, slow = 1;
  const mr = me.radius ?? me.r ?? 10;
  for (const o of others) {
    const or = o.radius ?? o.r ?? 10, dx = o.x - me.x, dy = o.y - me.y, d = Math.hypot(dx, dy);
    if (d < 0.01 || d > A.ahead + or) continue;
    const room = mr + or + A.space;
    if (d < room) { const k = (room - d) / room; x -= (dx / d) * k * A.push; y -= (dy / d) * k * A.push; }
    const along = dx * ux + dy * uy, across = -dx * uy + dy * ux; // ahead of him / to his right
    if (along <= 0 || Math.abs(across) > mr + or + 4) continue;
    const ov = (o.vel ? o.vel.x : o.vx ?? 0) * ux + (o.vel ? o.vel.y : o.vy ?? 0) * uy; // how fast he goes the same way
    const k = 1 - Math.min(1, Math.max(0, d - room * 0.6) / A.ahead);
    if (ov > A.queue) {
      // the one ahead goes his way: fall in behind him at his pace
      slow = Math.min(slow, Math.max(A.minPace, 1 - k * (1 - A.keep)));
    } else {
      // in his way: step round him, on the side away from where he stands (to the right if dead ahead)
      const side = across > 2 ? -1 : 1;
      x += -uy * side * k * A.side; y += ux * side * k * A.side;
      slow = Math.min(slow, 1 - k * 0.4);
    }
  }
  return { x, y, slow };
}

// The extra cost function handed to findPath for one guard: the sum of what he and the squad keep away from.
// layers: [{ cost(cell) -> number }] (memories bound to the time, the shared routes, fire, the floor)
export function pathCost(layers) {
  const L = layers.filter(Boolean);
  if (!L.length) return null;
  return (i) => {
    let c = 0;
    for (const l of L) c += l(i);
    return c;
  };
}
