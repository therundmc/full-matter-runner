// Geometry of the openings cut in walls (pure, no DOM): where the door leaves of a run of door tiles hinge,
// and which wall tiles hold a door or a window up (when one of them collapses, the opening goes with it), or what
// hangs on a wall face (a lamp, a clock, a sign: it goes with it too).
import { TILE } from '../Config.js';
import { ON_WALL } from '../data/props.js';

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

const MOUNT = { reach: 6, play: 4, step: 8 }; // px: past its back to the wall, off each end of its length, between probes

// The wall tiles [[cx, cy], ...] a piece hung on a wall face hangs on (walls and the windows in them): the piece is
// at (x, y) turned by `angle`, `len` px along the wall and `depth` px across. The wall is at its back (its local -y:
// data/props.js), or in front of it for a sign read one way up (never rotated). None: it hangs on nothing.
export function wallMount(map, x, y, angle, len, depth) {
  const c = Math.cos(angle), s = Math.sin(angle), half = Math.max(0, len / 2 - MOUNT.play), d = depth / 2 + MOUNT.reach;
  for (const side of [-1, 1]) {
    const tiles = [];
    for (let k = -half; ; k = Math.min(half, k + MOUNT.step)) {
      const cx = Math.floor((x + c * k - s * d * side) / TILE), cy = Math.floor((y + s * k + c * d * side) / TILE);
      if ((map.isWallChar(cx, cy) || map.at(cx, cy) === 'G') && !tiles.some((t) => holds(t, cx, cy))) tiles.push([cx, cy]);
      if (k >= half) break;
    }
    if (tiles.length) return tiles;
  }
  return [];
}

// a prop of the level is hung on its wall (the level loader: what is dropped in later hangs on nothing)
export function hang(map, prop) {
  if (ON_WALL.has(prop.type)) prop.wallTiles = wallMount(map, prop.x, prop.y, prop.body.angle, prop.def.w, prop.def.h);
}

// What the tile (cx, cy) giving way takes with it: the windows built into it, the doors hinged on it,
// the locked doors whose bolt was shot into it (they are simply free to swing), and what hung on it (`hung`).
export function heldBy(world, cx, cy) {
  return {
    hung: (world.props || []).filter((p) => !p.dead && p.wallTiles?.some((t) => holds(t, cx, cy))),
    windows: world.windows.filter((g) => g.supports.some((t) => holds(t, cx, cy))),
    doors: world.doors.filter((d) => holds(d.support, cx, cy)),
    unbolted: world.doors.filter((d) => d.locked && holds(d.strike, cx, cy) && !holds(d.support, cx, cy)),
  };
}
