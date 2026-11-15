import { TILE, PALETTE, LITTER, WALL_RIM } from '../Config.js';
import { sprite, spriteOpt, silhouette, sw, sh } from '../../engine/Assets.js';
import { rand, randi, pick, chance, TAU } from '../../engine/math.js';
import { WALLS } from '../world/TileMap.js';
import { ROOF_DECOR } from '../data/roofs.js';
import { scorchArt } from './BlastArt.js';
import { SPECK, stampImage, spotStamp, streakStamp, splatStamp, warmStamps } from './BloodArt.js';
import { matterStain } from './GoreArt.js';
import WallScars from './WallScars.js';

// seconds after which a stain turns tacky, then dry (the pools are liquid on the floor: systems/Liquids.js)
const STAIN_AGES = [9, 30];
const MAX_AGEING = 1500; // stains waiting for an age: beyond that the oldest dry early
const AGE_BUDGET = 24;   // stains re-tinted per step at most
// blood running down a wall: on the wall top (bright, wet, it must read on dark brick), then on the floor
const RUN = '#6c0a0e', RUN_WALL = '#a0161a';

// sole (toe toward +x) and heel of a shoe print, in px
const SHOE = [[0, -1], [1, -1], [2, -1], [3, -1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1],
  [-3, -1], [-2, -1], [-3, 0], [-2, 0], [-3, 1], [-2, 1]];

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

// Pre-rendered layers of a TileMap and everything painted on them for good, bottom to top:
//   floor   tiles, scuffs, spills, footprints, baked debris (at its tiles' density, see render())
//   blood   stains, spatter and pools (BloodArt stamps), drying in place: over the debris, under the bodies
//   flesh   baked corpses and gibs
//   walls   wall tops and roofs, holes dug into them (WallScars), splashes; every mark is clipped to the wall tiles
export default class MapRenderer {
  constructor(map) {
    this.map = map;
    this.clock = 0;
    this.ageing = [[], []]; // stains waiting to turn tacky / dry, oldest first: { s, x, y, rot, at }
    this.heads = [0, 0];
    this.scars = new WallScars(map);
    this.render();
    warmStamps();
  }

  // ---------- rendering ----------
  render() {
    const m = this.map;
    const W = m.widthPx, H = m.heightPx;
    // the floor keeps the pixels of its tiles, painted finer than the world (Assets.js `density`): it is that many
    // times larger, its context scaled so that everything is still drawn on it in world px
    const fs = this.floorScale = Math.round(1 / (sprite('tiles/concrete').k || 1));
    this.floorCanvas = document.createElement('canvas');
    this.floorCanvas.width = W * fs; this.floorCanvas.height = H * fs;
    const g = this.floorCanvas.getContext('2d');
    g.setTransform(fs, 0, 0, fs, 0, 0);
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
    [this.bloodCanvas, this.bloodCtx] = this.layer(W, H);
    [this.fleshCanvas, this.fleshCtx] = this.layer(W, H);

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
        const R = WALL_RIM;
        w.fillStyle = PALETTE.ink;
        if (open(0, -1)) w.fillRect(px, py, TILE, R);
        if (open(0, 1)) w.fillRect(px, py + TILE - R, TILE, R);
        if (open(-1, 0)) w.fillRect(px, py, R, TILE);
        if (open(1, 0)) w.fillRect(px + TILE - R, py, R, TILE);
        w.fillStyle = 'rgba(255,255,255,0.18)';
        if (open(0, -1)) w.fillRect(px, py + R, TILE, 1);
        if (open(-1, 0)) w.fillRect(px + R, py, 1, TILE);
        w.fillStyle = 'rgba(0,0,0,0.25)';
        if (open(0, 1)) w.fillRect(px, py + TILE - 5, TILE, 2);
        if (open(1, 0)) w.fillRect(px + TILE - 5, py, 2, TILE);
      }
    }
    this.wallCtx = w;
  }

  // an empty map-sized layer
  layer(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
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
      g.drawImage(img, -sw(img) / 2, -sh(img) / 2, sw(img), sh(img)); // a finer piece: its size in world px
      g.restore();
    };
    g.globalAlpha = 0.28;
    each((img, x, y, a, h) => { put(silhouette(img), x + h, y + h, a); put(silhouette(img), x + h / 2, y + h / 2, a); });
    g.globalAlpha = 1;
    each((img, x, y, a) => put(img, x, y, a));
  }

  // ---------- openings ----------
  // a doorway (run of `n` door tiles from tile x, y): the threshold on the floor, and a jamb let into the end of
  // the wall on each side (wood casing in plaster, steel in brick). The jambs go when their wall tile does.
  doorway(x, y, n, horizontal) {
    const m = this.map;
    const put = (g, img, px, py, flip = 1) => {
      g.save();
      g.translate(px, py);
      if (!horizontal) g.rotate(Math.PI / 2);
      g.scale(flip, 1);
      g.drawImage(img, -img.width / 2, -img.height / 2);
      g.restore();
    };
    const at = (k) => (horizontal ? [(x + k) * TILE, (y + 0.5) * TILE] : [(x + 0.5) * TILE, (y + k) * TILE]);
    for (let k = 0; k < n; k++) put(this.floorCtx, sprite('structure/threshold'), ...at(k + 0.5));
    for (const [k, flip] of [[-1, 1], [n, -1]]) {
      const tx = horizontal ? x + k : x, ty = horizontal ? y : y + k;
      if (!m.isWallChar(tx, ty)) continue;
      const img = sprite(m.at(tx, ty) === 'X' ? 'structure/door_jamb_steel' : 'structure/door_jamb');
      put(this.wallCtx, img, ...at(k < 0 ? -img.width / 2 / TILE : n + img.width / 2 / TILE), flip);
    }
  }

  // the sill of a window, as deep as the wall it is set in
  windowSill(cx, cy, vertical) {
    const g = this.floorCtx, img = sprite('structure/window_sill');
    g.save();
    g.translate((cx + 0.5) * TILE, (cy + 0.5) * TILE);
    if (vertical) g.rotate(Math.PI / 2);
    g.drawImage(img, -img.width / 2, -img.height / 2);
    g.restore();
  }

  // dark jagged cracks around an impact, more as the tile weakens (inside the wall's outline)
  crack(x, y, severity) {
    const g = this.wallCtx;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    this.scars.clip(g, x, y, 32, true);
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
    for (let k = 0; k < LITTER.rubble; k++) {
      g.fillStyle = chance(0.5) ? 'rgba(20,12,20,0.55)' : (tex === 'brick' ? '#7a3424' : '#b8ae98');
      const s = rand(1, 4);
      g.fillRect(px + rand(0, TILE - s), py + rand(0, TILE - s), s, s * rand(0.5, 1));
    }
    const w = this.wallCtx;
    w.clearRect(px, py, TILE, TILE);
    this.scars.forget(cx, cy);
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
    lg.drawImage(mask, 0, 0, W, H);
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = strength;
    g.drawImage(layer, 0, 0);
    g.restore();
  }

  // ---------- blood ----------
  // one stamp on the blood layer, on whole pixels, rotated without smoothing; it will age where it lies
  put(s, x, y, rot) {
    const d = { s, x: Math.round(x), y: Math.round(y), rot, at: this.clock + STAIN_AGES[0] };
    this.blit(this.bloodCtx, stampImage(s), d);
    this.ageing[0].push(d);
  }

  blit(g, img, d) {
    const c = Math.cos(d.rot), s = Math.sin(d.rot);
    g.setTransform(c, s, -s, c, d.x, d.y);
    g.drawImage(img, -d.s.cx, -d.s.cy);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // blood on the floor. n = 1: one drop of radius r. n > 1: what a wound leaves, a ragged stain of radius r with
  // spines and satellites (thrown toward `angle` if given) and a few separate drops around it
  stampBlood(x, y, r = 3, n = 1, angle = rand(0, TAU)) {
    if (n <= 1) {
      if (r < 1.1) this.speck(x, y, r);
      else this.put(spotStamp(r), x, y, Math.floor(rand(0, 4)) * (TAU / 4));
      return;
    }
    this.put(splatStamp(r), x, y, angle);
    for (let i = 0; i < n * 0.6; i++) {
      const a = rand(0, TAU), d = r * (1 + 1.8 * Math.random() ** 2);
      this.stampBlood(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(0.8, 1 + r * 0.2));
    }
  }

  // a droplet too fine to stand wet: one or two pixels
  speck(x, y, r = 0.6) {
    const g = this.bloodCtx;
    g.fillStyle = pick(SPECK);
    g.globalAlpha = rand(0.55, 0.95);
    g.fillRect(Math.round(x), Math.round(y), r > 0.85 && chance(0.5) ? 2 : 1, r > 0.85 && chance(0.4) ? 2 : 1);
    g.globalAlpha = 1;
  }

  // a drop that landed at an angle, travelling along (dx, dy): an elongated stain, its tail and satellites ahead
  stampStreak(x, y, dx, dy, len, width) {
    const a = Math.atan2(dy, dx);
    if (width >= 1.3) { this.put(streakStamp(width, len), x, y, a); return; }
    // a fine one: a short dash and a dot thrown ahead of it
    const g = this.bloodCtx, c = Math.cos(a), s = Math.sin(a);
    g.fillStyle = pick(SPECK);
    g.globalAlpha = rand(0.55, 0.95);
    for (let i = 0; i < len; i++) g.fillRect(Math.round(x + c * i), Math.round(y + s * i), 1, 1);
    if (chance(0.5)) g.fillRect(Math.round(x + c * (len + 2)), Math.round(y + s * (len + 2)), 1, 1);
    g.globalAlpha = 1;
  }

  // something bleeding wiped over the floor from (x0, y0) to (x1, y1): w px of thin broken streaks, never a band
  drag(x0, y0, x1, y1, w) {
    this.streaks(this.bloodCtx, x0, y0, x1, y1, w, SPECK, 0.8);
  }

  streaks(g, x0, y0, x1, y1, w, colors, alpha) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 0.5) return;
    const ux = (x1 - x0) / d, uy = (y1 - y0) / d, lanes = Math.max(1, Math.round(w));
    for (let j = 0; j < lanes; j++) {
      const off = j - (lanes - 1) / 2;
      // each lane comes and goes every few pixels, the outer ones more often
      const k = cellHash(Math.floor(x0 / 6) * 31 + j, Math.floor(y0 / 6));
      if (k < 0.22 + (0.3 * Math.abs(off)) / (lanes / 2 + 0.5)) continue;
      g.fillStyle = colors[j % colors.length];
      g.globalAlpha = alpha * (0.45 + 0.55 * k);
      for (let t = 1; t <= d; t++) g.fillRect(Math.round(x0 + ux * t - uy * off), Math.round(y0 + uy * t + ux * off), 1, 1);
    }
    g.globalAlpha = 1;
  }

  // blood dries where it lies: the stamps that reached an age are re-tinted in place (a bounded few per step)
  update(dt) {
    this.clock += dt;
    const g = this.bloodCtx;
    g.globalCompositeOperation = 'source-atop';
    let budget = AGE_BUDGET;
    for (let a = 0; a < 2; a++) {
      const q = this.ageing[a];
      let h = this.heads[a];
      while (h < q.length && budget > 0 && (q[h].at <= this.clock || q.length - h > MAX_AGEING)) {
        const d = q[h++];
        budget--;
        this.blit(g, stampImage(d.s, a + 1), d);
        if (a === 0) { d.at = this.clock + STAIN_AGES[1] - STAIN_AGES[0]; this.ageing[1].push(d); }
      }
      if (h > 256) { q.splice(0, h); h = 0; }
      this.heads[a] = h;
    }
    g.globalCompositeOperation = 'source-over';
  }

  // blood thrown on a wall top: drawn only on the wall tiles
  stampWall(x, y, r) {
    const g = this.wallCtx, st = spotStamp(Math.max(1.3, r));
    g.save();
    g.globalCompositeOperation = 'source-atop';
    this.scars.clip(g, x, y, st.cx + st.cy + 2, true);
    g.drawImage(stampImage(st, 1), Math.round(x) - st.cx, Math.round(y) - st.cy);
    g.restore();
  }

  // ---------- on walls (fx/Spatter.js) ----------
  // blood thrown hard against a wall: a ragged splash with its spines toward `angle`, on the wall tops only
  splashWall(x, y, r, angle) {
    const g = this.wallCtx, st = splatStamp(r), c = Math.cos(angle), s = Math.sin(angle);
    g.save();
    g.globalCompositeOperation = 'source-atop';
    this.scars.clip(g, x, y, st.cx + st.cy + 2, true);
    g.setTransform(c, s, -s, c, Math.round(x), Math.round(y));
    g.drawImage(stampImage(st, 0), -st.cx, -st.cy);
    g.restore();
  }

  // one step of something running down a wall: w px of it, on the wall top while it is on the wall, then on the floor
  runDot(x, y, w = 1, color = RUN) {
    const px = Math.round(x), py = Math.round(y), wall = this.map.solidAt(px + 0.5, py + 0.5);
    const g = wall ? this.wallCtx : color === RUN ? this.bloodCtx : this.floorCtx;
    if (wall) g.globalCompositeOperation = 'source-atop';
    g.fillStyle = wall && color === RUN ? RUN_WALL : color;
    g.fillRect(px, py, w, w);
    g.globalCompositeOperation = 'source-over';
  }

  // a liquid (not blood) thrown on a wall: a wet stipple in its colour, wall tops only
  wetWall(x, y, r, color) {
    const g = this.wallCtx;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    this.scars.clip(g, x, y, r + 1, true);
    g.fillStyle = color;
    for (let i = 0, n = Math.round(r * r * 1.2); i < n; i++) {
      const a = rand(0, TAU), d = r * Math.sqrt(Math.random());
      g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
    }
    g.restore();
  }

  // what was inside a burst skull, thrown toward `angle`: on the floor (over the blood, under the bodies) or on a wall
  matter(x, y, r, angle, wall = false) {
    const img = matterStain(r), c = Math.cos(angle), s = Math.sin(angle);
    const g = wall ? this.wallCtx : this.fleshCtx;
    g.save();
    if (wall) {
      g.globalCompositeOperation = 'source-atop';
      this.scars.clip(g, x, y, img.width + img.height, true);
    }
    g.setTransform(c, s, -s, c, Math.round(x), Math.round(y));
    g.drawImage(img, -img.width / 2, -img.height / 2);
    g.restore();
  }

  // ---------- other persistent decals ----------
  // a blow on a wall's face at (x, y), (nx, ny) its normal out of the wall: the hole it digs into the wall top
  // (kind: entry | exit | graze | blow, data/materials.js WALL_SCAR), or the older one it digs out further
  wallHit(x, y, nx, ny, kind, size = 1) {
    const s = this.scars.place(x, y, nx, ny, kind, size);
    if (s) this.scars.paint(this.wallCtx, s);
  }

  // what a hole in a wall drops at its foot and keeps there: a few crumbs of the material (x, y: on the floor)
  crumbs(x, y, color, n, spread = 3) {
    const g = this.floorCtx;
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      g.globalAlpha = rand(0.5, 0.9);
      g.fillRect(Math.round(x + rand(-spread, spread)), Math.round(y + rand(-spread, spread)), chance(0.3) ? 2 : 1, 1);
    }
    g.globalAlpha = 1;
  }

  // the burn of a blast or a fire (ragged soot, see BlastArt)
  scorch(x, y, r) {
    const art = scorchArt(r), ox = Math.round(x - art.width / 2), oy = Math.round(y - art.height / 2);
    this.floorCtx.drawImage(art, ox, oy);
    // what lies there chars with it: blood, remains, wall tops
    for (const wg of [this.bloodCtx, this.fleshCtx, this.wallCtx]) {
      wg.globalCompositeOperation = 'source-atop';
      wg.drawImage(art, ox, oy);
      wg.globalCompositeOperation = 'source-over';
    }
  }

  // liquid stain (water, spirits, milk): a soft ellipse in the given rgba colour
  spill(x, y, r, color) {
    const g = this.floorCtx;
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, r, r * rand(0.6, 1), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }

  // one wet shoe print, toe toward `angle` (~24 cm long): the pixels of a sole and a heel, never all of them
  footprint(x, y, angle, color, alpha) {
    const g = this.floorCtx, c = Math.cos(angle), s = Math.sin(angle);
    g.fillStyle = color;
    for (const [lx, ly] of SHOE) {
      if (chance(0.18)) continue;
      g.globalAlpha = alpha * rand(0.55, 1);
      g.fillRect(Math.round(x + lx * c - ly * s), Math.round(y + lx * s + ly * c), 1, 1);
    }
    g.globalAlpha = 1;
  }

  // a wet body dragged over the floor: a wide streaky stroke ending at (x, y)
  smear(x, y, angle, len, color, alpha) {
    this.streaks(this.floorCtx, x - Math.cos(angle) * len, y - Math.sin(angle) * len, x, y, 7, [color], alpha);
  }

  // permanently paint an image onto the floor (debris), or over the blood (flesh: a corpse, a gib)
  bake(img, x, y, angle, alpha = 1, flesh = false, scale = 1) {
    const g = flesh ? this.fleshCtx : this.floorCtx;
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.globalAlpha = alpha;
    const k = (img.k || 1) * scale; // a finer sprite (Assets.js `density`) baked at the floor's scale
    if (k !== 1) g.scale(k, k);
    g.drawImage(img, -img.width / 2, -img.height / 2);
    g.restore();
  }

  // anything else drawn straight into the floor (or the flesh layer): fn(g), in world px
  paint(fn, flesh = false) {
    const g = flesh ? this.fleshCtx : this.floorCtx;
    g.save();
    fn(g);
    g.restore();
  }

  // a loose piece come to rest becomes part of the floor, with the shadow it cast while loose: nothing pops
  wreck(img, x, y, angle, shadow = true, scale = 1) {
    if (shadow) this.bake(silhouette(img), x + 1, y + 1, angle, 0.3, false, scale);
    this.bake(img, x, y, angle, 1, false, scale);
  }
}
