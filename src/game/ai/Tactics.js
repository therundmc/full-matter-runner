// Grid geometry for the squad AI (no DOM): cover, flanking and ambush spots, search points.
// `world` only needs { map: TileMap, lineOfSight(x0, y0, x1, y1) }.
// Walls and path-blocking furniture stop bullets; windows, fences and doorways don't count as cover.
import { TILE } from '../Config.js';
import { gridRaycast } from '../../engine/physics/Raycast.js';
import { angDiff } from '../../engine/math.js';
import { findPath } from '../../engine/nav/Pathfinding.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const centre = (c) => (c + 0.5) * TILE;

// cell test "stops a bullet" (cached per map)
const coverFns = new WeakMap();
function coverCell(map) {
  let fn = coverFns.get(map);
  if (!fn) {
    fn = (cx, cy) => map.isSolid(cx, cy) || (map.isBlocked(cx, cy) && !'GFDL'.includes(map.at(cx, cy)));
    coverFns.set(map, fn);
  }
  return fn;
}

// is a body at (x, y) shielded from a shooter at (sx, sy)? (three rays so shoulders don't stick out)
function hidden(blocks, sx, sy, x, y) {
  const dx = x - sx, dy = y - sy, len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 6, ny = (dx / len) * 6;
  for (let s = -1; s <= 1; s++) if (!gridRaycast(sx, sy, x + nx * s, y + ny * s, blocks)) return false;
  return true;
}

// The way through the doorway of cell (cx, cy) for a walker at (x, y) heading (ux, uy): down the middle of the
// opening, where neither jamb nor the leaf swung against it is in the way. Unit vector, or null when the cell is
// not a passage between two free cells.
export function throughDoor(map, cx, cy, x, y, ux, uy) {
  const free = (i, j) => i >= 0 && j >= 0 && i < map.w && j < map.h && !map.blocked[j * map.w + i];
  const vert = free(cx, cy - 1) && free(cx, cy + 1);
  if (!vert && !(free(cx - 1, cy) && free(cx + 1, cy))) return null;
  const ahead = 18 * (Math.sign(vert ? uy : ux) || 1); // px further along the passage
  const dx = vert ? centre(cx) - x : ahead, dy = vert ? ahead : centre(cy) - y, d = Math.hypot(dx, dy);
  return { x: dx / d, y: dy / d };
}

export function isCovered(world, x, y, sx, sy) { return hidden(coverCell(world.map), sx, sy, x, y); }

// clear shot both ways (vision and bullets)
function clearShot(world, x0, y0, x1, y1) {
  return world.lineOfSight(x0, y0, x1, y1) && !gridRaycast(x0, y0, x1, y1, coverCell(world.map));
}

// Nearest spot (from `from`) hidden from the threat (tx, ty), with a free "peek" cell next to it that has a clear
// shot at it. prefDist = preferred distance to the threat; isClaimed(x, y) filters spots taken by squad mates.
// approach = true allows moving toward the threat (melee stalking, shotgun ambush). bonus(x, y) = px of extra way
// a spot is worth (a table to tip over in front of it).
export function findCover(world, from, tx, ty, prefDist, isClaimed, radius = 5, approach = false, bonus = null) {
  const map = world.map, blocks = coverCell(map);
  const ecx = Math.floor(from.x / TILE), ecy = Math.floor(from.y / TILE);
  const dET = Math.hypot(tx - from.x, ty - from.y) || 1;
  const cands = [];
  for (let cy = ecy - radius; cy <= ecy + radius; cy++) {
    for (let cx = ecx - radius; cx <= ecx + radius; cx++) {
      if (map.isBlocked(cx, cy)) continue;
      const x = centre(cx), y = centre(cy);
      const dE = Math.hypot(x - from.x, y - from.y), dT = Math.hypot(x - tx, y - ty);
      if (dE > radius * TILE || dT < 48 || (isClaimed && isClaimed(x, y))) continue;
      // never run across the threat's face to reach cover
      const toward = ((x - from.x) * (tx - from.x) + (y - from.y) * (ty - from.y)) / dET;
      if (!approach && toward > dE * 0.6 && dT < dET - 40) continue;
      if (approach && dT > dET) continue;
      cands.push({ cx, cy, x, y, score: dE + Math.abs(dT - prefDist) * 0.5 - (bonus ? bonus(x, y) : 0) });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  let tries = 0;
  for (const c of cands) {
    if (!hidden(blocks, tx, ty, c.x, c.y)) continue;
    let peek = null;
    for (const [dx, dy] of DIRS8) {
      const px = c.cx + dx, py = c.cy + dy;
      if (map.isBlocked(px, py) || (dx && dy && (map.isBlocked(c.cx + dx, c.cy) || map.isBlocked(c.cx, c.cy + dy)))) continue;
      if (clearShot(world, centre(px), centre(py), tx, ty)) { peek = { x: centre(px), y: centre(py) }; break; }
    }
    if (!peek) continue;
    if (++tries > 3) break;
    if (findPath(map, from.x, from.y, c.x, c.y, 1500)) return { x: c.x, y: c.y, peek };
  }
  return null;
}

// The one of `tables` (live props with a def `flips`) standing right in front of the cover spot (x, y), the threat
// (tx, ty) beyond it, that a guard can tip over for a shield: { prop, a, x, y } with a = the way its top goes down and (x, y) = where to stand
// to shove it, or null. A long table (def.w along its length) only goes over across, pushed from a long side.
export function tableToFlip(tables, x, y, tx, ty, reach) {
  let best = null, bestD = reach;
  for (const p of tables) {
    const d = p.def;
    const dx = x - p.x, dy = y - p.y;
    let a, half, lx = 0;
    if (d.r) {
      a = Math.atan2(-dy, -dx);
      half = d.r;
    } else {
      const c = Math.cos(p.body.angle), s = Math.sin(p.body.angle), ly = -dx * s + dy * c; // the spot in the table's frame
      lx = dx * c + dy * s;
      if (Math.abs(lx) > d.w / 2 + 4 || Math.abs(ly) < d.h / 2) continue;
      a = p.body.angle + (ly > 0 ? -Math.PI / 2 : Math.PI / 2);
      half = d.h / 2;
      lx = Math.max(-d.w / 2 + 6, Math.min(d.w / 2 - 6, lx));
    }
    const ux = Math.cos(a), uy = Math.sin(a);
    if (ux * (tx - p.x) + uy * (ty - p.y) < half) continue; // the threat is not on the far side
    const sx = p.x - ux * (half + 10) - uy * lx, sy = p.y - uy * (half + 10) + ux * lx;
    const dist = Math.hypot(sx - x, sy - y);
    if (dist < bestD) { bestD = dist; best = { prop: p, a, x: sx, y: sy }; }
  }
  return best;
}

// A firing spot around the target seen from a new angle (away from the angles `avoid` already covered by the squad).
export function findFlank(world, from, tx, ty, avoid, dist) {
  const map = world.map;
  const cands = [];
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    if (avoid.some((b) => Math.abs(angDiff(a, b)) < 0.9)) continue;
    for (const r of [dist, dist * 0.7]) {
      const cx = Math.floor((tx + Math.cos(a) * r) / TILE), cy = Math.floor((ty + Math.sin(a) * r) / TILE);
      if (map.isBlocked(cx, cy)) continue;
      const x = centre(cx), y = centre(cy);
      if (!clearShot(world, x, y, tx, ty)) continue;
      // avoid routes that cross right in front of the target
      const sx = x - from.x, sy = y - from.y, l2 = sx * sx + sy * sy || 1;
      const u = Math.max(0, Math.min(1, ((tx - from.x) * sx + (ty - from.y) * sy) / l2));
      const pass = Math.hypot(from.x + sx * u - tx, from.y + sy * u - ty);
      cands.push({ x, y, cost: Math.sqrt(l2) + (pass < 90 ? 400 : 0) });
    }
  }
  cands.sort((a, b) => a.cost - b.cost);
  for (let i = 0; i < Math.min(3, cands.length); i++) {
    const c = cands[i];
    if (findPath(map, from.x, from.y, c.x, c.y, 2500)) return { x: c.x, y: c.y };
  }
  return null;
}

// Spots worth checking around (x, y) within maxTiles of walking: doorways, corners, places hidden from (x, y).
// The first point is (x, y) itself (origin: true); the others are spread at least 3.5 tiles apart.
// Each point has `look`: the direction to sweep once there.
export function searchPoints(map, x, y, maxTiles, count) {
  const W = map.w, sx = Math.floor(x / TILE), sy = Math.floor(y / TILE);
  if (map.isBlocked(sx, sy)) return [{ x, y, look: 0, origin: true }];
  const start = sy * W + sx;
  const dist = new Int16Array(W * map.h).fill(-1);
  dist[start] = 0;
  const queue = [start], cands = [];
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi], cx = i % W, cy = (i / W) | 0;
    if (dist[i] >= maxTiles) continue;
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx, ny = cy + dy;
      if (map.isBlocked(nx, ny)) continue;
      const j = ny * W + nx;
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
      const px = centre(nx), py = centre(ny);
      const L = map.isSolid(nx - 1, ny), R = map.isSolid(nx + 1, ny), U = map.isSolid(nx, ny - 1), Dn = map.isSolid(nx, ny + 1);
      let score = 0;
      const door = map.at(nx, ny) === 'D' || map.at(nx, ny) === 'L';
      if (door) score += 4;                                                   // doorway
      else if ((L && R && !U && !Dn) || (U && Dn && !L && !R)) score += 3;    // corridor
      else if ((L || R) && (U || Dn)) score += 2;                             // corner
      if (map.raycast(x, y, px, py)) score += 2;                              // out of sight of the origin
      if (score >= 2) cands.push({ x: px, y: py, d: dist[j], score, look: Math.atan2(py - y, px - x) });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.d - b.d);
  const out = [{ x, y, look: 0, origin: true }];
  const minD = TILE * 3.5;
  for (const c of cands) {
    if (out.length >= count) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < minD)) continue;
    out.push(c);
  }
  return out;
}

// Random walkable tile centre within radiusTiles of (cx, cy), or null.
export function randomPoint(map, cx, cy, radiusTiles, rnd = Math.random) {
  for (let i = 0; i < 12; i++) {
    const tx = Math.floor((cx + (rnd() * 2 - 1) * radiusTiles * TILE) / TILE);
    const ty = Math.floor((cy + (rnd() * 2 - 1) * radiusTiles * TILE) / TILE);
    if (map.isBlocked(tx, ty)) continue;
    return { x: centre(tx), y: centre(ty) };
  }
  return null;
}
