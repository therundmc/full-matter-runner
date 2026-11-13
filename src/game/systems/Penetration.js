// Terminal ballistics, DOM-free: how much of a bullet's energy each obstacle eats, where it comes out the other
// side, and when a grazing hit on a hard surface ricochets instead. Energy is in "pen" units (weapons.js `pen`);
// a material eats RESIST[material] per pixel of thickness crossed.
import { TILE } from '../Config.js';
import { segPoly } from '../../engine/physics/Raycast.js';

export const RESIST = {
  glass: 0.1, mesh: 0.12, fabric: 0.3, plastic: 0.45, rubber: 0.5, flesh: 0.55, wood: 0.6, ceramic: 1.1,
  concrete: 2.2, metal: 2.8, brass: 2.8,
};
// wall tiles: '#' plaster/drywall partition, 'X' brick
export const WALL_RESIST = { '#': 0.85, 'X': 2.1 };
// fixed costs for things we don't measure: a human body, a car (two steel skins + seats), a pane of glass
export const COST = { flesh: 14, vehicle: 18, glass: 0.6 };
// surfaces that can send a round flying off at a grazing angle (0 = never, 1 = readily)
export const HARDNESS = { metal: 1, concrete: 0.8, ceramic: 0.6, brass: 1, X: 0.8, '#': 0.35 };

const SPENT = 1.5; // below this a round has no punch left

// Walk a bullet through solid wall tiles from its entry point (x, y) along angle a.
// Returns { x, y, cost, cells: [{ cx, cy, cost }] } at the exit, or { stopped, cells } if it stays inside
// (out of energy, or it hit the void / an unbreakable border tile).
export function wallExit(map, x, y, a, energy) {
  const dx = Math.cos(a), dy = Math.sin(a);
  // nudge inside the first tile so the walk starts in it
  let px = x + dx * 0.01, py = y + dy * 0.01;
  let cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(TILE / dx) : Infinity, tDY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tMX = dx !== 0 ? (stepX > 0 ? (cx + 1) * TILE - px : px - cx * TILE) / Math.abs(dx) : Infinity;
  let tMY = dy !== 0 ? (stepY > 0 ? (cy + 1) * TILE - py : py - cy * TILE) / Math.abs(dy) : Infinity;
  let t = 0, cost = 0;
  const cells = [];
  for (let i = 0; i < 64; i++) {
    if (!map.isSolid(cx, cy)) return { x: px + dx * t, y: py + dy * t, cost, cells };
    const r = WALL_RESIST[map.at(cx, cy)];
    if (r === undefined || !map.canBreak(cx, cy)) return { stopped: true, cells, cost };
    const tNext = Math.min(tMX, tMY);
    const c = (tNext - t) * r;
    if (cost + c >= energy - SPENT) {
      cells.push({ cx, cy, cost: energy - cost });
      return { stopped: true, cells, cost: energy };
    }
    cost += c;
    cells.push({ cx, cy, cost: c });
    t = tNext;
    if (tMX < tMY) { tMX += tDX; cx += stepX; } else { tMY += tDY; cy += stepY; }
  }
  return { stopped: true, cells, cost };
}

// Where a straight shot entering a convex body at (x, y) along a comes out: { x, y, len } or null.
export function bodyExit(verts, x, y, a, reach = 160) {
  const fx = x + Math.cos(a) * reach, fy = y + Math.sin(a) * reach;
  const r = segPoly(fx, fy, x, y, verts);
  if (!r) return null;
  const ex = fx + (x - fx) * r.t, ey = fy + (y - fy) * r.t;
  return { x: ex, y: ey, len: Math.hypot(ex - x, ey - y) };
}

// Energy left after crossing `cost`, or 0 when the round is stopped.
export function afterCost(energy, cost) {
  const left = energy - cost;
  return left > SPENT ? left : 0;
}

// Does a round coming in along `a` glance off a surface with normal (nx, ny)?
// Only shallow angles on hard surfaces; rnd in [0, 1). Returns the new heading or null.
export function ricochet(a, nx, ny, hardness, rnd) {
  if (!hardness) return null;
  const dx = Math.cos(a), dy = Math.sin(a);
  const along = dx * nx + dy * ny; // -1 head-on, 0 grazing
  const graze = 1 - Math.min(1, -along / 0.34); // 1 at 0 deg, 0 at ~20 deg off the surface
  if (graze <= 0 || rnd >= graze * 0.85 * hardness) return null;
  const rx = dx - 2 * along * nx, ry = dy - 2 * along * ny;
  return Math.atan2(ry, rx);
}
