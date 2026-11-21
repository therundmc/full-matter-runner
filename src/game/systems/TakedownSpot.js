// What stands right in front of a guard taken from behind that his head can be driven into (DOM-free): a toilet, a
// urinal, a sink, something waist high (data/finishers.js SLAMS), a wall. The takedown with a hand free plays the
// move of that spot (TAKEDOWNS by `context`). Rays from his centre along a short fan of his facing (SPOT.fan); on
// each the first thing met counts (what stands in the way hides what is behind it), within its kind's reach; the most
// specific kind wins (SPOT.order), then the nearest.
import { segPoly } from '../../engine/physics/Raycast.js';
import { TILE } from '../Config.js';
import { SLAMS, SPOT } from '../data/finishers.js';
import { OPENINGS } from '../world/TileMap.js';


// g: the guard { x, y, angle }; map: TileMap; props: the level's (anything with def, body.vertices, dead).
// -> { kind, x, y (the point of the surface struck, just off it), nx, ny (its normal, toward him), d (px from his
// centre), prop (null for a wall), name (a ledge's, for the hint), rest (how the dead man stays against it: SLAMS) }
// or null
export function spotFor(g, map, props, S = SPOT) {
  let best = null;
  const rank = (k) => S.order.indexOf(k), top = Math.max(...Object.values(S.reach));
  for (const [off, k] of S.fan) {
    const a = g.angle + off, c = Math.cos(a), s = Math.sin(a), far = top * k + 2;
    const x1 = g.x + c * far, y1 = g.y + s * far;
    const hit = firstProp(g, x1, y1, far, props);
    const wall = map.raycast(g.x, g.y, x1, y1);
    const wd = wall ? wall.t * far : Infinity;
    let spot = null;
    if (hit && hit.t * far < wd) {
      const slam = SLAMS[hit.p.type];
      if (slam) {
        const d = hit.t * far;
        spot = { kind: slam.kind, x: g.x + c * d + hit.nx, y: g.y + s * d + hit.ny, nx: hit.nx, ny: hit.ny, d, prop: hit.p, name: slam.name, rest: slam.rest };
      }
    } else if (wall && map.isWallChar(wall.cx, wall.cy) && !throughOpening(map, g.x, g.y, c, s, wd)) {
      spot = { kind: 'wall', x: wall.x + wall.nx, y: wall.y + wall.ny, nx: wall.nx, ny: wall.ny, d: wd, prop: null };
    }
    if (!spot || spot.d > S.reach[spot.kind] * k) continue;
    if (!best || rank(spot.kind) < rank(best.kind) || (spot.kind === best.kind && spot.d < best.d)) best = spot;
  }
  return best;
}

// the nearest prop standing in the way of the ray (hung ones are overhead): { p, t, nx, ny }
function firstProp(g, x1, y1, far, props) {
  let near = null;
  for (const p of props) {
    if (p.dead || p.dying || !p.body || p.def.hung || p.def.overhead) continue;
    const q = p.body.position;
    if (Math.abs(q.x - g.x) > far + 80 || Math.abs(q.y - g.y) > far + 80) continue;
    const r = segPoly(g.x, g.y, x1, y1, p.body.vertices);
    // (no face crossed: he stands in it already, a counter's flap, never the thing in front of him)
    if (r && (r.nx || r.ny) && (!near || r.t < near.t)) near = { p, t: r.t, nx: r.nx, ny: r.ny };
  }
  return near;
}

// does the ray cross a doorway, a window or a gate before the wall (d px along c, s)? Then that wall is beyond an
// opening, not in front of him. The tile he stands in does not count (a man in a doorway facing its jamb).
function throughOpening(map, x, y, c, s, d) {
  const cx0 = Math.floor(x / TILE), cy0 = Math.floor(y / TILE);
  for (let k = 2; k < d; k += 2) {
    const cx = Math.floor((x + c * k) / TILE), cy = Math.floor((y + s * k) / TILE);
    if ((cx !== cx0 || cy !== cy0) && OPENINGS.has(map.at(cx, cy))) return true; // (never a wall to slam on)
  }
  return false;
}
