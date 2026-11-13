import { TILE, PALETTE } from '../Config.js';
import { sprite, spriteOpt, silhouette } from '../../engine/Assets.js';
import { rand, pick, chance } from '../../engine/math.js';
import { WALLS } from '../world/TileMap.js';
import { ROOF_DECOR } from '../data/roofs.js';

// well-mixed integer hash of a cell (no visible lattice, unlike a plain x*a ^ y*b)
function cellHash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// texture variants: _v1 (subtle wear) on ~1 cell in 7, _v2 (a landmark: manhole, drain...) on ~1 in 40
function floorTile(name, x, y) {
  const r = cellHash(x, y);
  if (r < 0.025) return spriteOpt(`tiles/${name}_v2`) || sprite('tiles/' + name);
  if (r < 0.17) return spriteOpt(`tiles/${name}_v1`) || sprite('tiles/' + name);
  return sprite('tiles/' + name);
}

// Pre-rendered floor / wall layers of a TileMap and everything painted on them for good
// (blood, bullet holes, scorch marks, baked corpses and debris).
export default class MapRenderer {
  constructor(map) {
    this.map = map;
    this.render();
  }

  // ---------- rendering ----------
  render() {
    const m = this.map;
    const W = m.widthPx, H = m.heightPx;
    this.floorCanvas = document.createElement('canvas');
    this.floorCanvas.width = W; this.floorCanvas.height = H;
    const g = this.floorCanvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const f = m.floor[y * m.w + x];
        if (f) g.drawImage(floorTile(f, x, y), x * TILE, y * TILE, TILE, TILE);
      }
    }
    this.grime(g, W, H);
    // soft drop shadow of walls on the floor
    const sh = document.createElement('canvas');
    sh.width = W; sh.height = H;
    const sg = sh.getContext('2d');
    sg.fillStyle = '#000';
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) if (m.isWallChar(x, y)) sg.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    g.globalAlpha = 0.18; g.drawImage(sh, 9, 9);
    g.globalAlpha = 0.3; g.drawImage(sh, 5, 5);
    g.globalAlpha = 1;
    this.floorCtx = g;

    this.wallCanvas = document.createElement('canvas');
    this.wallCanvas.width = W; this.wallCanvas.height = H;
    this.roof = new Uint8Array(m.w * m.h); // wall tiles drawn as the flat roof of a neighbouring building
    const w = this.wallCanvas.getContext('2d');
    w.imageSmoothingEnabled = false;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const ch = m.at(x, y);
        if (!WALLS[ch]) continue;
        const roof = m.isRoof(x, y) && spriteOpt('tiles/roof');
        this.roof[y * m.w + x] = roof ? 1 : 0;
        w.drawImage(roof || sprite('tiles/' + WALLS[ch]), x * TILE, y * TILE, TILE, TILE);
      }
    }
    this.shadeRoofs(w, W, H);
    // edges: dark outline where a wall meets something that isn't a wall, light bevel inside
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.isWallChar(x, y)) continue;
        const px = x * TILE, py = y * TILE;
        const open = (dx, dy) => !m.isWallChar(x + dx, y + dy) && m.at(x + dx, y + dy) !== ' ';
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

  // flat roofs: weathering in large soft patches, and the parapet's shadow along the inside of the brick ring
  shadeRoofs(w, W, H) {
    const m = this.map;
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const mg = mask.getContext('2d');
    for (let i = 0; i < this.roof.length; i++) if (this.roof[i]) mg.fillRect((i % m.w) * TILE, Math.floor(i / m.w) * TILE, TILE, TILE);
    this.grime(w, W, H, mask, 0.75);
    const rim = (x, y) => m.isWallChar(x, y) && !this.roof[y * m.w + x];
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!this.roof[y * m.w + x]) continue;
        const px = x * TILE, py = y * TILE;
        // the light comes from the top left: a wide soft shadow under the north and west parapets, a thin line elsewhere
        for (const [d, a] of [[9, 0.12], [5, 0.16], [2, 0.3]]) {
          w.fillStyle = `rgba(10,6,20,${a})`;
          if (rim(x, y - 1)) w.fillRect(px, py, TILE, d);
          if (rim(x - 1, y)) w.fillRect(px, py, d, TILE);
        }
        w.fillStyle = 'rgba(10,6,20,0.4)';
        if (rim(x, y + 1)) w.fillRect(px, py + TILE - 1, TILE, 1);
        if (rim(x + 1, y)) w.fillRect(px + TILE - 1, py, 1, TILE);
      }
    }
  }

  // rooftop dressing (`level.roof`, data/roofs.js): every piece painted for good, over the shadows they all cast
  dressRoofs(list) {
    const g = this.wallCtx;
    const each = (fn) => {
      for (const [kind, col, row, deg = 0] of list) {
        const img = spriteOpt('roof/' + kind);
        if (img) fn(img, col * TILE, row * TILE, (deg * Math.PI) / 180, ROOF_DECOR[kind].h);
      }
    };
    const put = (img, x, y, a) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.drawImage(img, -img.width / 2, -img.height / 2);
      g.restore();
    };
    g.globalAlpha = 0.28;
    each((img, x, y, a, h) => { put(silhouette(img), x + h, y + h, a); put(silhouette(img), x + h / 2, y + h / 2, a); });
    g.globalAlpha = 1;
    each((img, x, y, a) => put(img, x, y, a));
  }

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

  // visuals of a wall tile giving way: rubble floor, broken edges on the neighbours
  destroyTile(cx, cy, tex) {
    const m = this.map;
    const px = cx * TILE, py = cy * TILE;
    const g = this.floorCtx;
    g.drawImage(floorTile('concrete', cx, cy), px, py, TILE, TILE);
    for (let k = 0; k < 26; k++) {
      g.fillStyle = chance(0.5) ? 'rgba(20,12,20,0.55)' : (tex === 'brick' ? '#7a3424' : '#b8ae98');
      const s = rand(1, 4);
      g.fillRect(px + rand(0, TILE - s), py + rand(0, TILE - s), s, s * rand(0.5, 1));
    }
    const w = this.wallCtx;
    w.clearRect(px, py, TILE, TILE);
    // the roof behind a breached parapet shows its brick edge
    for (let ny = cy - 1; ny <= cy + 1; ny++) {
      for (let nx = cx - 1; nx <= cx + 1; nx++) {
        const j = ny * m.w + nx;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || !this.roof[j]) continue;
        this.roof[j] = 0;
        if (m.isWallChar(nx, ny)) w.drawImage(sprite('tiles/' + WALLS[m.at(nx, ny)]), nx * TILE, ny * TILE, TILE, TILE);
      }
    }
    // broken edges on the neighbouring walls
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!m.isWallChar(nx, ny)) continue;
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

  // large soft light/dirt patches over a layer (two octaves of smoothed value noise) so tiles never read as a grid;
  // only where `mask` is painted
  grime(g, W, H, mask = g.canvas, strength = 0.5) {
    const layer = document.createElement('canvas');
    layer.width = W; layer.height = H;
    const lg = layer.getContext('2d');
    for (const [cell, alpha, seed] of [[7, 0.55, 11], [2.5, 0.35, 97]]) {
      const cw = Math.ceil(W / (TILE * cell)) + 2, ch = Math.ceil(H / (TILE * cell)) + 2;
      const n = document.createElement('canvas');
      n.width = cw; n.height = ch;
      const ng = n.getContext('2d');
      const img = ng.createImageData(cw, ch);
      for (let i = 0; i < cw * ch; i++) {
        const v = Math.round(cellHash(i % cw + seed, Math.floor(i / cw) - seed) * 255);
        img.data.set([v, v, v, 255], i * 4);
      }
      ng.putImageData(img, 0, 0);
      lg.globalAlpha = alpha;
      lg.imageSmoothingEnabled = true;
      lg.imageSmoothingQuality = 'high';
      lg.drawImage(n, -TILE * cell, -TILE * cell, cw * TILE * cell, ch * TILE * cell);
    }
    lg.globalAlpha = 1;
    lg.globalCompositeOperation = 'destination-in';
    lg.drawImage(mask, 0, 0);
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = strength;
    g.drawImage(layer, 0, 0);
    g.restore();
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

  // size 1 = entry hole; exits are wider (spalling), ricochets just scuff
  bulletHole(x, y, size = 1) {
    const g = this.wallCtx;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(x, y, 3 * size, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d0710';
    const r = Math.max(1, Math.round(size * 1.2));
    g.fillRect(Math.round(x) - r, Math.round(y) - r, r * 2, r * 2);
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

  // liquid stain (water, spirits, milk): a soft ellipse in the given rgba colour
  spill(x, y, r, color) {
    const g = this.floorCtx;
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, r, r * rand(0.6, 1), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }

  // one wet shoe print, toe toward `angle` (~24 cm long)
  footprint(x, y, angle, color, alpha) {
    const g = this.floorCtx;
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath(); g.ellipse(1.5, 0, 2.3, 1.5, 0, 0, Math.PI * 2); g.fill();  // sole
    g.beginPath(); g.ellipse(-2.5, 0, 1.3, 1.2, 0, 0, Math.PI * 2); g.fill(); // heel
    g.restore();
  }

  // a wet body dragged over the floor: a wide soft stroke ending at (x, y)
  smear(x, y, angle, len, color, alpha) {
    const g = this.floorCtx;
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(-len, -3.5 + rand(-0.6, 0.6), len, 2.4);
    g.fillRect(-len, 0.6 + rand(-0.6, 0.6), len, 3);
    g.restore();
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
