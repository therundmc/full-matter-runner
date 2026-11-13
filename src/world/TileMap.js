import { TILE, CAT, MASK, PALETTE, WALL_HP } from '../core/Config.js';
import { sprite, spriteOpt } from '../core/Assets.js';
import { gridRaycast } from '../core/Raycast.js';
import { rand, pick, chance } from '../core/math.js';

const { Bodies } = Matter;

// Tile legend for level ASCII maps.
export const FLOORS = {
  '.': 'wood', ',': 'checker', '+': 'tile_blue', ':': 'carpet_red', ';': 'carpet_purple', '_': 'concrete',
  '"': 'grass', '=': 'asphalt', '-': 'asphalt_line', '~': 'dirt', 's': 'sidewalk', '*': 'neon_floor',
};
export const WALLS = { '#': 'wall', 'X': 'brick' };
const STRUCT = new Set(['D', 'G', 'F']);

// pick a texture variant (tiles/<name>_v1, _v2 when they exist) with a stable hash of the cell
function floorTile(name, x, y) {
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const k = h % 5;
  if (k === 3) return spriteOpt(`tiles/${name}_v1`) || sprite('tiles/' + name);
  if (k === 4) return spriteOpt(`tiles/${name}_v2`) || sprite('tiles/' + name);
  return sprite('tiles/' + name);
}

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
    this.widthPx = this.w * TILE;
    this.heightPx = this.h * TILE;
    this.isSolid = (cx, cy) => cx < 0 || cy < 0 || cx >= this.w || cy >= this.h || this.solid[cy * this.w + cx] === 1;
    this.isBlocked = (cx, cy) => cx < 0 || cy < 0 || cx >= this.w || cy >= this.h || this.blocked[cy * this.w + cx] === 1;
  }

  at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? ' ' : this.chars[y][x]; }
  isWallChar(x, y) { const c = this.at(x, y); return !!WALLS[c]; }
  solidAt(px, py) { return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE)); }

  raycast(x0, y0, x1, y1) { return gridRaycast(x0, y0, x1, y1, this.isSolid); }

  // is a straight walk possible (with body clearance) — used for path smoothing
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
          isStatic: true, label: 'wall', friction: 0, restitution: 0.2,
          collisionFilter: { category: CAT.WALL, mask: MASK.WALL },
        }));
      }
    }
    return bodies;
  }

  // ---------- rendering ----------
  render() {
    const W = this.widthPx, H = this.heightPx;
    this.floorCanvas = document.createElement('canvas');
    this.floorCanvas.width = W; this.floorCanvas.height = H;
    const g = this.floorCanvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const f = this.floor[y * this.w + x];
        if (f) g.drawImage(floorTile(f, x, y), x * TILE, y * TILE, TILE, TILE);
      }
    }
    // soft drop shadow of walls on the floor
    const sh = document.createElement('canvas');
    sh.width = W; sh.height = H;
    const sg = sh.getContext('2d');
    sg.fillStyle = '#000';
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) if (this.isWallChar(x, y)) sg.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    g.globalAlpha = 0.18; g.drawImage(sh, 9, 9);
    g.globalAlpha = 0.3; g.drawImage(sh, 5, 5);
    g.globalAlpha = 1;
    this.floorCtx = g;

    this.wallCanvas = document.createElement('canvas');
    this.wallCanvas.width = W; this.wallCanvas.height = H;
    const w = this.wallCanvas.getContext('2d');
    w.imageSmoothingEnabled = false;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.at(x, y);
        if (!WALLS[ch]) continue;
        w.drawImage(sprite('tiles/' + WALLS[ch]), x * TILE, y * TILE, TILE, TILE);
      }
    }
    // edges: dark outline where a wall meets something that isn't a wall, light bevel inside
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.isWallChar(x, y)) continue;
        const px = x * TILE, py = y * TILE;
        const open = (dx, dy) => !this.isWallChar(x + dx, y + dy) && this.at(x + dx, y + dy) !== ' ';
        w.fillStyle = PALETTE.ink;
        if (open(0, -1)) w.fillRect(px, py, TILE, 3);
        if (open(0, 1)) w.fillRect(px, py + TILE - 3, TILE, 3);
        if (open(-1, 0)) w.fillRect(px, py, 3, TILE);
        if (open(1, 0)) w.fillRect(px + TILE - 3, py, 3, TILE);
        w.fillStyle = 'rgba(255,255,255,0.18)';
        if (open(0, -1)) w.fillRect(px, py + 3, TILE, 1);
        if (open(-1, 0)) w.fillRect(px + 3, py, 1, TILE);
        w.fillStyle = 'rgba(0,0,0,0.25)';
        if (open(0, 1)) w.fillRect(px, py + TILE - 5, TILE, 2);
        if (open(1, 0)) w.fillRect(px + TILE - 5, py, 2, TILE);
      }
    }
    this.wallCtx = w;
  }

  // ---------- destruction ----------
  canBreak(cx, cy) {
    return this.isWallChar(cx, cy) && cx > 0 && cy > 0 && cx < this.w - 1 && cy < this.h - 1;
  }

  chipColor(cx, cy) { return this.at(cx, cy) === 'X' ? '#8a3a2a' : '#d8ccb0'; }

  // dark jagged cracks around an impact, more as the tile weakens
  crack(x, y, severity) {
    const g = this.wallCtx;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = `rgba(20,12,28,${0.45 + severity * 0.5})`;
    g.lineWidth = 1;
    const n = 1 + Math.floor(severity * 4);
    for (let k = 0; k < n; k++) {
      let px = x, py = y;
      let a = rand(0, Math.PI * 2);
      g.beginPath();
      g.moveTo(px, py);
      for (let s = 0; s < 3 + severity * 4; s++) {
        a += rand(-0.7, 0.7);
        px += Math.cos(a) * rand(2, 4);
        py += Math.sin(a) * rand(2, 4);
        g.lineTo(px, py);
      }
      g.stroke();
    }
    g.restore();
  }

  // a wall tile gives way: it becomes rubble-covered floor
  destroyTile(cx, cy) {
    const i = cy * this.w + cx;
    const px = cx * TILE, py = cy * TILE;
    const tex = WALLS[this.chars[cy][cx]];
    this.solid[i] = 0;
    this.blocked[i] = 0;
    this.hp[i] = 0;
    this.chars[cy][cx] = '_';
    this.floor[i] = 'concrete';
    const g = this.floorCtx;
    g.drawImage(floorTile('concrete', cx, cy), px, py, TILE, TILE);
    for (let k = 0; k < 26; k++) {
      g.fillStyle = chance(0.5) ? 'rgba(20,12,20,0.55)' : (tex === 'brick' ? '#7a3424' : '#b8ae98');
      const s = rand(1, 4);
      g.fillRect(px + rand(0, TILE - s), py + rand(0, TILE - s), s, s * rand(0.5, 1));
    }
    const w = this.wallCtx;
    w.clearRect(px, py, TILE, TILE);
    // broken edges on the neighbouring walls
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!this.isWallChar(nx, ny)) continue;
      const ex = dx === 1 ? nx * TILE : dx === -1 ? nx * TILE + TILE - 3 : nx * TILE;
      const ey = dy === 1 ? ny * TILE : dy === -1 ? ny * TILE + TILE - 3 : ny * TILE;
      w.fillStyle = PALETTE.ink;
      if (dx) w.fillRect(ex, ey, 3, TILE); else w.fillRect(ex, ey, TILE, 3);
      // jagged bites out of the edge
      for (let k = 0; k < 5; k++) {
        const t = rand(0, TILE - 4), d = rand(2, 6);
        if (dx) w.fillRect(dx === 1 ? ex : ex - d + 3, ey + t, d, rand(2, 5));
        else w.fillRect(ex + t, dy === 1 ? ey : ey - d + 3, rand(2, 5), d);
      }
    }
  }

  // ---------- persistent decals ----------
  stampBlood(x, y, r = 3, n = 1) {
    const g = this.floorCtx;
    for (let i = 0; i < n; i++) {
      g.fillStyle = pick(PALETTE.blood);
      g.globalAlpha = rand(0.75, 1);
      const ox = rand(-r, r) * (n > 1 ? 1 : 0), oy = rand(-r, r) * (n > 1 ? 1 : 0);
      const rr = Math.max(0.6, r * rand(0.4, 1));
      g.beginPath();
      g.ellipse(x + ox, y + oy, rr, rr * rand(0.6, 1), rand(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // elongated streak in direction (dx, dy)
  stampStreak(x, y, dx, dy, len, width) {
    const g = this.floorCtx;
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(dy, dx));
    g.fillStyle = pick(PALETTE.blood);
    g.globalAlpha = 0.9;
    g.beginPath();
    g.ellipse(len / 2, 0, len / 2, width / 2, 0, 0, Math.PI * 2);
    g.fill();
    if (chance(0.5)) { g.beginPath(); g.arc(len + rand(1, 4), rand(-1, 1), width * 0.4, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }

  stampPool(x, y, r) {
    const g = this.floorCtx;
    g.fillStyle = PALETTE.blood[3];
    g.globalAlpha = 0.95;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(x + rand(-r, r) * 0.4, y + rand(-r, r) * 0.4, r * rand(0.6, 1), r * rand(0.5, 0.9), rand(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,120,120,0.12)';
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }

  // blood/holes on walls: drawn only where wall pixels exist
  stampWall(x, y, r, color) {
    const g = this.wallCtx;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color || pick(PALETTE.blood);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  bulletHole(x, y) {
    const g = this.wallCtx;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d0710';
    g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    g.restore();
  }

  scorch(x, y, r) {
    const g = this.floorCtx;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(10,6,6,0.85)');
    grad.addColorStop(0.6, 'rgba(20,10,10,0.5)');
    grad.addColorStop(1, 'rgba(20,10,10,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    const wg = this.wallCtx;
    wg.save();
    wg.globalCompositeOperation = 'source-atop';
    wg.fillStyle = grad;
    wg.beginPath(); wg.arc(x, y, r, 0, Math.PI * 2); wg.fill();
    wg.restore();
  }

  // permanently paint an image (corpse, gib, debris) onto the floor
  bake(img, x, y, angle, alpha = 1) {
    const g = this.floorCtx;
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.globalAlpha = alpha;
    g.drawImage(img, -img.width / 2, -img.height / 2);
    g.restore();
  }
}
