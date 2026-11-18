// Geometry of the openings cut in walls (pure, no DOM): where the door leaves of a run of door tiles hinge,
// and which wall tiles hold a door or a window up (when one of them collapses, the opening goes with it).
import { TILE } from '../Config.js';

// Door leaf, in px (1 m = 32 px). The leaf turns on a pivot set in from the wall end by its own half thickness,
// so an open door lies flat against the wall end instead of disappearing under it.
export const LEAF = {
  back: 3,     // leaf behind the pivot
  inset: 1,    // play between the wall end and the leaf
  gap: 1,      // play at the latch
  thick: 6,    // physical thickness
};

// Leaves closing a run of `n` door tiles starting at tile (x, y); `horizontal` = the run goes along x.
// A run of two is a double door (one leaf hinged on each wall end), anything else a single leaf; `pair`: two
// leaves meeting in the middle whatever the run (a swinging door's half-leaves).
// Returns [{ hx, hy, angle, len, support, strike }]: pivot (px), closed angle, pivot-to-latch length, the wall tile
// [cx, cy] carrying the hinges and the one the latch closes on (null where two leaves meet).
export function doorLeaves(x, y, n, horizontal, pair = false) {
  const p = LEAF.inset + LEAF.back;
  const mid = (horizontal ? y : x) * TILE + TILE / 2;
  const a0 = (horizontal ? x : y) * TILE, a1 = a0 + n * TILE;
  const tile = (k) => (horizontal ? [x + k, y] : [x, y + k]);
  const leaf = (fromStart, len, strike) => {
    const along = fromStart ? a0 + p : a1 - p;
    const angle = horizontal ? (fromStart ? 0 : Math.PI) : (fromStart ? Math.PI / 2 : -Math.PI / 2);
    return {
      hx: horizontal ? along : mid, hy: horizontal ? mid : along, angle, len,
      support: tile(fromStart ? -1 : n), strike,
    };
  };
  if (n === 2 || pair) {
    const len = (n * TILE) / 2 - p - LEAF.gap / 2;
    return [leaf(true, len, null), leaf(false, len, null)];
  }
  return [leaf(true, n * TILE - p - LEAF.gap, tile(n))];
}

// the two tiles a window at tile (cx, cy) is built into; `vertical` = the wall runs along y
export function windowSupports(cx, cy, vertical) {
  return vertical ? [[cx, cy - 1], [cx, cy + 1]] : [[cx - 1, cy], [cx + 1, cy]];
}

const holds = (tile, cx, cy) => !!tile && tile[0] === cx && tile[1] === cy;

// What the tile (cx, cy) giving way takes with it: the windows built into it, the doors hinged on it,
// and the locked doors whose bolt was shot into it (they are simply free to swing).
export function heldBy(world, cx, cy) {
  return {
    windows: world.windows.filter((g) => g.supports.some((t) => holds(t, cx, cy))),
    doors: world.doors.filter((d) => holds(d.support, cx, cy)),
    unbolted: world.doors.filter((d) => d.locked && holds(d.strike, cx, cy) && !holds(d.support, cx, cy)),
  };
}
