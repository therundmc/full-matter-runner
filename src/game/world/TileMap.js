import { TILE, CAT, MASK, WALL_HP } from '../Config.js';
import { gridRaycast } from '../../engine/physics/Raycast.js';

const { Bodies } = Matter;

// Tile legend for level ASCII maps.
export const FLOORS = {
  '.': 'wood', ',': 'checker', '+': 'tile_blue', ':': 'carpet_red', ';': 'carpet_purple', '_': 'concrete',
  '"': 'grass', '=': 'asphalt', '-': 'asphalt_line', '~': 'dirt', 's': 'sidewalk', '*': 'neon_floor',
  '^': 'roof', // a flat roof one can walk on (same tar paper as the roofs of the buildings around)
};
export const WALLS = { '#': 'wall', 'X': 'brick' };
const STRUCT = new Set(['D', 'L', 'G', 'F']);

// Pure grid logic (no DOM): tiles, solidity, path blocking, wall HP, raycasts, wall bodies.
export default class TileMap {
  constructor(rows) {
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.chars = rows.map((r) => r.padEnd(this.w, ' ').split(''));
    const n = this.w * this.h;
    this.solid = new Uint8Array(n);   // blocks bullets / vision / movement
    this.blocked = new Uint8Array(n); // blocks path-finding
    this.floor = new Array(n).fill(null);
    this.hp = new Float32Array(n);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.chars[y][x], i = y * this.w + x;
        if (ch === ' ' || WALLS[ch]) { this.solid[i] = 1; this.blocked[i] = 1; }
        if (WALLS[ch]) this.hp[i] = WALL_HP[ch];
        if (ch === 'G' || ch === 'F') this.blocked[i] = 1;
        if (FLOORS[ch]) this.floor[i] = FLOORS[ch];
      }
    }
    // structural tiles take the floor of a neighbour
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!STRUCT.has(this.chars[y][x])) continue;
        const i = y * this.w + x;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const f = FLOORS[this.at(x + dx, y + dy)];
          if (f) { this.floor[i] = f; break; }
        }
        if (!this.floor[i]) this.floor[i] = 'concrete';
      }
    }
    this.version = 0; // bumped whenever the walls change
    this.widthPx = this.w * TILE;
    this.heightPx = this.h * TILE;
    this.isSolid = (cx, cy) => cx < 0 || cy < 0 || cx >= this.w || cy >= this.h || this.solid[cy * this.w + cx] === 1;
    this.isBlocked = (cx, cy) => cx < 0 || cy < 0 || cx >= this.w || cy >= this.h || this.blocked[cy * this.w + cx] === 1;
  }

  at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? ' ' : this.chars[y][x]; }
  isWallChar(x, y) { const c = this.at(x, y); return !!WALLS[c]; }
  // deep inside a block of brick: the flat roof of a neighbouring building (its outer ring of tiles is the parapet)
  isRoof(x, y) {
    if (this.at(x, y) !== 'X') return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && !WALLS[this.chars[ny][nx]]) return false;
      }
    }
    return true;
  }
  inside(px, py) { return px >= 0 && py >= 0 && px < this.widthPx && py < this.heightPx; }
  solidAt(px, py) { return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE)); }

  raycast(x0, y0, x1, y1) { return gridRaycast(x0, y0, x1, y1, this.isSolid); }

  // is a straight walk possible (with body clearance) - used for path smoothing
  walkLine(x0, y0, x1, y1, r = 8) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * r, ny = dx / len * r;
    for (const s of [-1, 0, 1]) {
      if (gridRaycast(x0 + nx * s, y0 + ny * s, x1 + nx * s, y1 + ny * s, this.isBlocked)) return false;
    }
    return true;
  }

  // static Matter bodies for walls/void, greedy-merged into rectangles
  buildBodies() {
    const used = new Uint8Array(this.w * this.h);
    const bodies = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (!this.solid[i] || used[i]) continue;
        let w = 1;
        while (x + w < this.w && this.solid[i + w] && !used[i + w]) w++;
        let h = 1;
        outer: while (y + h < this.h) {
          for (let k = 0; k < w; k++) {
            const j = (y + h) * this.w + x + k;
            if (!this.solid[j] || used[j]) break outer;
          }
          h++;
        }
        for (let yy = 0; yy < h; yy++) for (let k = 0; k < w; k++) used[(y + yy) * this.w + x + k] = 1;
        bodies.push(Bodies.rectangle((x + w / 2) * TILE, (y + h / 2) * TILE, w * TILE, h * TILE, {
          isStatic: true, label: 'wall', material: 'concrete', friction: 0, restitution: 0.2,
          collisionFilter: { category: CAT.WALL, mask: MASK.WALL },
        }));
      }
    }
    return bodies;
  }

  // invisible static bars hugging the map from outside: on an open border (street running off the map) they keep
  // characters, loose items and bodies in; through-traffic and passers-by leave CAT.EDGE out of their mask
  buildEdgeBodies() {
    const T = TILE, W = this.widthPx, H = this.heightPx;
    const opt = { isStatic: true, label: 'edge', friction: 0, restitution: 0.1, collisionFilter: { category: CAT.EDGE, mask: MASK.WALL } };
    return [
      Bodies.rectangle(W / 2, -T / 2, W + 2 * T, T, opt),
      Bodies.rectangle(W / 2, H + T / 2, W + 2 * T, T, opt),
      Bodies.rectangle(-T / 2, H / 2, T, H, opt),
      Bodies.rectangle(W + T / 2, H / 2, T, H, opt),
    ];
  }

  // ---------- destruction ----------
  canBreak(cx, cy) {
    return this.isWallChar(cx, cy) && cx > 0 && cy > 0 && cx < this.w - 1 && cy < this.h - 1;
  }

  chipColor(cx, cy) { return this.at(cx, cy) === 'X' ? '#8a3a2a' : '#d8ccb0'; }

  // a wall tile gives way and becomes floor; returns the wall texture name (for the renderer)
  destroyTile(cx, cy) {
    const i = cy * this.w + cx;
    const tex = WALLS[this.chars[cy][cx]];
    this.solid[i] = 0;
    this.blocked[i] = 0;
    this.hp[i] = 0;
    this.chars[cy][cx] = '_';
    this.floor[i] = 'concrete';
    this.version++;
    return tex;
  }
}

// Tiles under a path-blocking prop (also used when a traffic vehicle comes to rest as a parked wreck). A tile is
// closed to the pathfinder only when the prop really fills it (BLOCK_SHARE of its area): a shelf flat against a wall
// leaves room to walk past, and closing its tiles shut whole shops and the back of the bar to the guards. What stands
// in a gap of a wall to close it (`lasting`: a ladder, a parapet) closes every tile it touches.
const BLOCK_SHARE = 0.4;
export function markBlocked(map, prop) {
  const b = prop.body.bounds, whole = !!prop.def?.lasting;
  const x0 = Math.floor((b.min.x + 4) / TILE), x1 = Math.floor((b.max.x - 4) / TILE);
  const y0 = Math.floor((b.min.y + 4) / TILE), y1 = Math.floor((b.max.y - 4) / TILE);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const ox = Math.min(b.max.x, (x + 1) * TILE) - Math.max(b.min.x, x * TILE);
      const oy = Math.min(b.max.y, (y + 1) * TILE) - Math.max(b.min.y, y * TILE);
      if (whole || ox * oy >= BLOCK_SHARE * TILE * TILE) map.blocked[y * map.w + x] = 1;
    }
  }
}
