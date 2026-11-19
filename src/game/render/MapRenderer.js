import { TILE, PALETTE, LITTER, WALL_RIM, CHUNKS } from '../Config.js';
import { sprite, spriteOpt, silhouette, sw, sh } from '../../engine/Assets.js';
import { rand, pick, chance, TAU, hashString, areaTable, areaCount } from '../../engine/math.js';
import { WALLS } from '../world/TileMap.js';
import { ROOF_DECOR } from '../data/roofs.js';
import { scorchArt } from './BlastArt.js';
import { SPECK, stampImage, spotStamp, streakStamp, splatStamp, warmStamps } from './BloodArt.js';
import { matterStain } from './GoreArt.js';
import WallScars from './WallScars.js';
import { paintWear, planWear } from './FloorWear.js';
import { ChunkedLayer, chunkSpan } from './Chunks.js';
import { BLOOD_EDGE } from '../data/wounds.js';
import { offFloor } from '../fx/Spatter.js';

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

// texture variants: _v1 (subtle wear) on ~1 cell in 7, _v2 (a landmark: manhole, drain...) on ~1 in 40, _v3.._v5 (a
// light detail: a crack, a chip, a stain, a burn...) on ~1 in 14 each
const VARIANTS = [[0.025, 2], [0.17, 1], [0.24, 3], [0.31, 4], [0.38, 5]];
function floorTile(name, x, y) {
  const r = cellHash(x, y);
  for (const [p, k] of VARIANTS) if (r < p) return spriteOpt(`tiles/${name}_v${k}`) || sprite('tiles/' + name);
  return sprite('tiles/' + name);
}

function canvas(w, h, opts) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  if (opts) c.getContext('2d', opts);
  return c;
}

// What the floor's and the walls' chunks hold before the level lays anything on them (tiles, the wear of years, grime,
// the walls' shadow; wall tops, roofs, edges) depends on the level alone: it is kept for a retry, which copies it
// instead of painting it again (the base painting is then laid on as ever). The last BAKED_KEEP levels are kept, by
// level: { sig (its tiles and the floor's density: a level whose map changed is painted again), floor, walls: chunk
// x0 -> canvas, gone (let go: never copied from again) }. Only the chunks baked as the level is sealed are kept (a
// long map's others come and go with the view).
const BAKED = new Map(), BAKED_KEEP = 2;
export function bakedFor(level, fs) {
  const sig = `${fs}:${hashString((level.tiles || []).join('\n'))}`;
  let e = BAKED.get(level);
  BAKED.delete(level);
  if (e && e.sig !== sig) { forget(e); e = null; }
  BAKED.set(level, (e ||= { sig, floor: new Map(), walls: new Map(), gone: false }));
  for (const [k, old] of BAKED) {
    if (BAKED.size <= BAKED_KEEP) break;
    BAKED.delete(k);
    forget(old);
  }
  return e;
}
function forget(e) {
  e.gone = true;
  for (const m of [e.floor, e.walls]) { for (const c of m.values()) c.width = c.height = 0; m.clear(); }
}

// Pre-rendered layers of a TileMap and everything painted on them for good, bottom to top:
//   floor   tiles, scuffs, spills, footprints, baked debris (at its tiles' density, see bakeFloor)
//   blood   stains, spatter and pools (BloodArt stamps), drying in place: over the debris, under the bodies; never
//           within BLOOD_EDGE.floor px of a wall or a window (trim)
//   flesh   baked corpses and gibs
//   walls   wall tops and roofs, holes dug into them (WallScars), splashes; every mark is clipped to the wall tiles,
//           blood to the strip of top by the face it struck (faceBand)
// Each is a ChunkedLayer (render/Chunks.js): a long map is baked near the view in chunks along x, a usual one is a
// single canvas. What the level paints while it is built (thresholds, sills, floor paint, roof dressing, fences) is
// part of the floor's and the walls' base painting, painted again with any chunk it touches; once the level is sealed
// what is drawn on a layer is a mark (drawn on the chunks its x range touches).
export default class MapRenderer {
  constructor(map, level = {}) {
    this.map = map;
    this.level = level;
    this.clock = 0;
    this.ageing = [[], []]; // stains waiting to turn tacky / dry, oldest first: { s, x, y, rot, at }
    this.heads = [0, 0];
    this.scars = new WallScars(map);
    // the floor keeps the pixels of its tiles, painted finer than the world (Assets.js `density`): it is that many
    // times larger, its context scaled so that everything is still drawn on it in world px
    const fs = this.floorScale = Math.round(1 / (sprite('tiles/concrete').k || 1));
    this.baked = bakedFor(level, fs); // this level's chunks as an earlier build left them (BAKED)
    this.sealing = false;
    this.roof = new Uint8Array(map.w * map.h); // wall tiles drawn as the flat roof of a neighbouring building
    const roofed = !!spriteOpt('tiles/roof');
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) this.roof[y * map.w + x] = roofed && map.isRoof(x, y) ? 1 : 0;
    this.base = { floor: [], walls: [] }; // what the level painted while it was built: [{ x0, x1, fn }]
    this.sealed = false;
    const C = CHUNKS, layer = (name, o) => new ChunkedLayer(map.widthPx, map.heightPx, TILE,
      { whole: C.whole, cols: C.cols, pad: C.pad, cache: C.cache, keep: C.keep[name] ?? 0, ...o });
    this.floor = layer('floor', { scale: fs, overlap: true, bake: (g, x0, x1) => this.bakeFloor(g, x0, x1) });
    this.walls = layer('walls', { overlap: true, bake: (g, x0, x1) => this.bakeWalls(g, x0, x1) });
    this.blood = layer('blood', {});
    this.flesh = layer('flesh', {});
    this.off = layer('off', { bake: (g, x0, x1) => this.bakeOff(g, x0, x1), lazy: true, keep: 0 }); // where blood may not lie
    this.layers = { floor: this.floor, walls: this.walls, blood: this.blood, flesh: this.flesh };
    warmStamps();
  }

  // ---------- the chunks ----------
  // the level is built: what is painted from now on is a mark. The chunks round x (the player's start) are baked now
  seal(x = 0) {
    this.sealed = this.sealing = true;
    const r = (CHUNKS.margin + CHUNKS.cols) * TILE;
    for (const L of [this.floor, this.walls]) {
      const [i0, i1] = chunkSpan(x - r, x + r, L.cw, L.n);
      for (let i = i0; i <= i1; i++) L.chunk(i);
    }
    this.sealing = false;
  }

  // the wear of years (FloorWear), planned the first time a chunk is painted (a retry copies them: no need)
  get wear() { return (this.wearPlan ||= planWear(this.map, this.level)); }

  // the level's own painting of the chunk at x0 on layer `name` (BAKED) copied onto its context g: false if there is
  // none to copy (another level kept since, or the walls changed: what is baked then is no longer the level's alone)
  kept(name, g, x0) {
    const c = !this.baked.gone && this.map.version === 0 && this.baked[name].get(x0);
    if (!c || c.width !== g.canvas.width || c.height !== g.canvas.height) return false;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, 0, 0);
    g.restore();
    return true;
  }

  // that painting kept for the next build of the level, as it is now on g (a chunk baked as the level is sealed)
  keep(name, g, x0) {
    if (!this.sealing || this.baked.gone || this.map.version !== 0) return;
    const c = canvas(g.canvas.width, g.canvas.height);
    c.getContext('2d').drawImage(g.canvas, 0, 0);
    this.baked[name].set(x0, c);
  }

  // every canvas of this world's layers let go now (World.dispose); what BAKED keeps is not this world's
  dispose() {
    for (const L of [this.floor, this.walls, this.blood, this.flesh, this.off]) L.reset();
  }

  // the view spans world x [x0, x1]: bake what it is about to show, let go of what it left far behind
  near(x0, x1) {
    const m = CHUNKS.margin * TILE;
    this.floor.near(x0, x1, m, CHUNKS.budget);
    this.walls.near(x0, x1, m, CHUNKS.budget / 2);
    for (const L of [this.blood, this.flesh, this.off]) L.near(x0, x1, m, 0);
  }

  // whether the world rect [x0, x1] x [y0, y1] is all map with a floor or a wall on every tile of it (nothing of what is
  // drawn under the map shows there: Game's backdrop). The tiles with neither never change (a wall that falls leaves
  // a floor)
  covers(x0, y0, x1, y1) {
    const m = this.map;
    if (x0 < 0 || y0 < 0 || x1 > m.widthPx || y1 > m.heightPx) return false;
    this.holes ||= areaTable(m.w, m.h, (x, y) => !m.floor[y * m.w + x] && !m.isWallChar(x, y));
    return areaCount(this.holes, Math.floor(x0 / TILE), Math.floor(y0 / TILE), Math.floor(x1 / TILE), Math.floor(y1 / TILE)) === 0;
  }

  // fn(g) on a layer (floor, walls, blood, flesh) over the world x range [x0, x1], g in world px: before the level is
  // sealed, the floor's and the walls' base painting; after, a mark. make: false on a layer of marks only draws on
  // what is already there (nothing new is made for it)
  on(L, x0, x1, fn, make = true) {
    const base = !this.sealed && (L === this.floor ? this.base.floor : L === this.walls ? this.base.walls : null);
    if (base) { base.push({ x0, x1, fn }); return; }
    const g = L.ctx(x0, x1, make);
    if (g) fn(g);
  }

  // what the level painted on a layer while it was built, again over a chunk [x0, x1] being baked
  *replay(g, list, x0, x1) {
    let n = 0;
    for (const op of list) {
      if (op.x1 < x0 || op.x0 > x1) continue;
      op.fn(g);
      if (++n % 64 === 0) yield;
    }
  }

  // the tiles of a chunk's x range [x0, x1]: [t0, t1] inclusive
  tiles(x0, x1) {
    return [Math.max(0, Math.floor(x0 / TILE)), Math.min(this.map.w - 1, Math.floor((x1 - 1e-6) / TILE))];
  }

  // ---------- baking ----------
  // a chunk of the floor: its tiles, the wear of years over them (FloorWear: cracks over several tiles, potholes,
  // split boards..., free of the tiles' grid), grime, the walls' soft shadow, what the level laid on it
  *bakeFloor(g, x0, x1) {
    if (!this.kept('floor', g, x0)) {
      yield* this.paintFloor(g, x0, x1);
      this.keep('floor', g, x0);
    }
    yield* this.replay(g, this.base.floor, x0, x1);
  }

  // the level's own part of a floor chunk: the tiles and their wear on a scratch canvas kept on the CPU side (the wear
  // is read back and written pixel by pixel: on the chunk's own canvas that would drag it off the graphics card), laid
  // on the chunk; then grime and the walls' shadow
  *paintFloor(g, x0, x1) {
    const m = this.map, fs = this.floorScale, step = CHUNKS.strip, [t0, t1] = this.tiles(x0, x1);
    const c = g.canvas, scratch = canvas(c.width, c.height, { willReadFrequently: true }), s = scratch.getContext('2d');
    s.imageSmoothingEnabled = g.imageSmoothingEnabled;
    s.setTransform(g.getTransform());
    for (let a = t0; a <= t1; a += step) {
      for (let y = 0; y < m.h; y++) {
        for (let x = a; x <= Math.min(t1, a + step - 1); x++) {
          const f = m.floor[y * m.w + x];
          if (f) s.drawImage(floorTile(f, x, y), x * TILE, y * TILE, TILE, TILE);
        }
      }
      yield;
    }
    const sx = Math.round(x0 * fs), w = step * TILE * fs;
    for (let a = 0; a < c.width; a += w) {
      const px = s.getImageData(a, 0, Math.min(w, c.width - a), c.height);
      paintWear(px, fs, m, this.level, undefined, sx + a, this.wear);
      s.putImageData(px, a, 0);
      yield;
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(scratch, 0, 0);
    g.restore();
    scratch.width = scratch.height = 0;
    this.grime(g, x0, x1);
    yield;
    // soft drop shadow of walls on the floor (cast down and right: from the tile before the chunk on)
    const ta = Math.max(0, t0 - 1), sh = canvas((t1 - ta + 1) * TILE, m.heightPx), sg = sh.getContext('2d');
    sg.fillStyle = '#000';
    for (let y = 0; y < m.h; y++) {
      for (let x = ta; x <= t1; x++) if (m.isWallChar(x, y)) sg.fillRect((x - ta) * TILE, y * TILE, TILE, TILE);
    }
    g.globalAlpha = 0.18; g.drawImage(sh, ta * TILE + 9, 9);
    g.globalAlpha = 0.3; g.drawImage(sh, ta * TILE + 5, 5);
    g.globalAlpha = 1;
    sh.width = sh.height = 0;
    yield;
  }

  // a chunk of the walls: wall tops and roofs, the roofs' weathering and shadows, the dark outline and the bevel,
  // what the level put up on them
  *bakeWalls(g, x0, x1) {
    if (!this.kept('walls', g, x0)) {
      yield* this.paintWalls(g, x0, x1);
      this.keep('walls', g, x0);
    }
    yield* this.replay(g, this.base.walls, x0, x1);
  }

  // the level's own part of a chunk of the walls
  *paintWalls(g, x0, x1) {
    const m = this.map, [t0, t1] = this.tiles(x0, x1);
    for (let y = 0; y < m.h; y++) {
      for (let x = t0; x <= t1; x++) {
        const ch = m.at(x, y);
        if (!WALLS[ch]) continue;
        g.drawImage(this.roof[y * m.w + x] ? sprite('tiles/roof') : sprite('tiles/' + WALLS[ch]), x * TILE, y * TILE, TILE, TILE);
      }
    }
    yield;
    this.shadeRoofs(g, x0, x1);
    yield;
    // edges: dark outline where a wall meets something that isn't a wall, light bevel inside
    for (let y = 0; y < m.h; y++) {
      for (let x = t0; x <= t1; x++) {
        if (!m.isWallChar(x, y)) continue;
        const px = x * TILE, py = y * TILE;
        const open = (dx, dy) => !m.isWallChar(x + dx, y + dy) && m.at(x + dx, y + dy) !== ' ';
        const R = WALL_RIM;
        g.fillStyle = PALETTE.ink;
        if (open(0, -1)) g.fillRect(px, py, TILE, R);
        if (open(0, 1)) g.fillRect(px, py + TILE - R, TILE, R);
        if (open(-1, 0)) g.fillRect(px, py, R, TILE);
        if (open(1, 0)) g.fillRect(px + TILE - R, py, R, TILE);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        if (open(0, -1)) g.fillRect(px, py + R, TILE, 1);
        if (open(-1, 0)) g.fillRect(px + R, py, 1, TILE);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        if (open(0, 1)) g.fillRect(px, py + TILE - 5, TILE, 2);
        if (open(1, 0)) g.fillRect(px + TILE - 5, py, 2, TILE);
      }
    }
    yield;
  }

  // flat roofs: weathering in large soft patches, and the parapet's shadow along the inside of the brick ring
  shadeRoofs(g, x0, x1) {
    const m = this.map, [t0, t1] = this.tiles(x0, x1);
    const mask = canvas(x1 - x0, m.heightPx), mg = mask.getContext('2d');
    for (let y = 0; y < m.h; y++) for (let x = t0; x <= t1; x++) if (this.roof[y * m.w + x]) mg.fillRect(x * TILE - x0, y * TILE, TILE, TILE);
    this.grime(g, x0, x1, mask, 0.75);
    mask.width = mask.height = 0;
    const rim = (x, y) => m.isWallChar(x, y) && !this.roof[y * m.w + x];
    for (let y = 0; y < m.h; y++) {
      for (let x = t0; x <= t1; x++) {
        if (!this.roof[y * m.w + x]) continue;
        const px = x * TILE, py = y * TILE;
        // the light comes from the top left: a wide soft shadow under the north and west parapets, a thin line elsewhere
        for (const [d, a] of [[9, 0.12], [5, 0.16], [2, 0.3]]) {
          g.fillStyle = `rgba(10,6,20,${a})`;
          if (rim(x, y - 1)) g.fillRect(px, py, TILE, d);
          if (rim(x - 1, y)) g.fillRect(px, py, d, TILE);
        }
        g.fillStyle = 'rgba(10,6,20,0.4)';
        if (rim(x, y + 1)) g.fillRect(px, py + TILE - 1, TILE, 1);
        if (rim(x + 1, y)) g.fillRect(px + TILE - 1, py, 1, TILE);
      }
    }
  }

  // a chunk of the map's not-floor (opaque where blood may not lie, offFloor), made again when the walls change
  bakeOff(g, x0, x1) {
    g.fillStyle = '#000';
    for (const [x, y, w, h] of this.offRects()) if (x + w >= x0 && x <= x1) g.fillRect(x, y, w, h);
  }

  offRects() {
    const m = this.map;
    if (this.offList && this.offV === m.version) return this.offList;
    if (this.offList) this.off.reset();
    this.offV = m.version;
    return (this.offList = offFloor(m));
  }

  // rooftop dressing (`level.roof`, data/roofs.js): every piece painted for good, over the shadows they all cast
  dressRoofs(list) {
    const each = (fn) => {
      for (const [kind, col, row, deg = 0] of list) {
        const img = spriteOpt('roof/' + kind);
        if (img) fn(img, col * TILE, row * TILE, (deg * Math.PI) / 180, ROOF_DECOR[kind].h);
      }
    };
    const put = (g, img, x, y, a) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.drawImage(img, -sw(img) / 2, -sh(img) / 2, sw(img), sh(img)); // a finer piece: its size in world px
      g.restore();
    };
    // one base op: the shadows of all, then the pieces (the order the roofs were always painted in)
    let x0 = Infinity, x1 = -Infinity;
    each((img, x, y, a, h) => { const r = Math.hypot(sw(img), sh(img)) / 2 + h; x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); });
    if (x1 < x0) return;
    this.on(this.walls, x0, x1, (g) => {
      g.globalAlpha = 0.28;
      each((img, x, y, a, h) => { put(g, silhouette(img), x + h, y + h, a); put(g, silhouette(img), x + h / 2, y + h / 2, a); });
      g.globalAlpha = 1;
      each((img, x, y, a) => put(g, img, x, y, a));
    });
  }

  // ---------- openings ----------
  // a doorway (run of `n` door tiles from tile x, y): the threshold on the floor, and a jamb let into the end of
  // the wall on each side (wood casing in plaster, steel in brick). The jambs go when their wall tile does.
  // jamb: 'steel' / 'wood' (the door's kind, data/doors.js), else steel in brick, wood in plaster
  doorway(x, y, n, horizontal, jamb = null) {
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
    const x0 = (x - 1) * TILE, x1 = (x + (horizontal ? n : 1) + 1) * TILE;
    this.on(this.floor, x0, x1, (g) => { for (let k = 0; k < n; k++) put(g, sprite('structure/threshold'), ...at(k + 0.5)); });
    this.on(this.walls, x0, x1, (g) => {
      for (const [k, flip] of [[-1, 1], [n, -1]]) {
        const tx = horizontal ? x + k : x, ty = horizontal ? y : y + k;
        if (!m.isWallChar(tx, ty)) continue;
        const img = sprite((jamb ?? (m.at(tx, ty) === 'X' ? 'steel' : 'wood')) === 'steel' ? 'structure/door_jamb_steel' : 'structure/door_jamb');
        put(g, img, ...at(k < 0 ? -img.width / 2 / TILE : n + img.width / 2 / TILE), flip);
      }
    });
  }

  // the sill of a window, as deep as the wall it is set in
  windowSill(cx, cy, vertical) {
    const img = sprite('structure/window_sill');
    this.on(this.floor, (cx - 1) * TILE, (cx + 2) * TILE, (g) => {
      g.save();
      g.translate((cx + 0.5) * TILE, (cy + 0.5) * TILE);
      if (vertical) g.rotate(Math.PI / 2);
      g.drawImage(img, -img.width / 2, -img.height / 2);
      g.restore();
    });
  }

  // dark jagged cracks around an impact, more as the tile weakens (inside the wall's outline)
  crack(x, y, severity) {
    this.on(this.walls, x - 40, x + 40, (g) => {
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
    });
  }

  // visuals of a wall tile giving way: rubble floor, broken edges on the neighbours
  destroyTile(cx, cy, tex) {
    const m = this.map;
    const px = cx * TILE, py = cy * TILE;
    this.on(this.floor, px, px + TILE, (g) => {
      g.drawImage(floorTile('concrete', cx, cy), px, py, TILE, TILE);
      for (let k = 0; k < LITTER.rubble; k++) {
        g.fillStyle = chance(0.5) ? 'rgba(20,12,20,0.55)' : (tex === 'brick' ? '#7a3424' : '#b8ae98');
        const s = rand(1, 4);
        g.fillRect(px + rand(0, TILE - s), py + rand(0, TILE - s), s, s * rand(0.5, 1));
      }
    });
    this.scars.forget(cx, cy);
    // the roof behind a breached parapet shows its brick edge
    const bared = [];
    for (let ny = cy - 1; ny <= cy + 1; ny++) {
      for (let nx = cx - 1; nx <= cx + 1; nx++) {
        const j = ny * m.w + nx;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || !this.roof[j]) continue;
        this.roof[j] = 0;
        if (m.isWallChar(nx, ny)) bared.push([nx, ny]);
      }
    }
    this.on(this.walls, px - TILE, px + 2 * TILE, (w) => {
      w.clearRect(px, py, TILE, TILE);
      for (const [nx, ny] of bared) w.drawImage(sprite('tiles/' + WALLS[m.at(nx, ny)]), nx * TILE, ny * TILE, TILE, TILE);
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
    });
  }

  // large soft light/dirt patches over the x range [x0, x1] of a layer (two octaves of smoothed value noise, laid on
  // the whole map's lattice) so tiles never read as a grid; only where `mask` (that range) is painted
  grime(g, x0, x1, mask = g.canvas, strength = 0.5) {
    const W = x1 - x0, H = this.map.heightPx, MW = this.map.widthPx;
    const layer = canvas(W, H), lg = layer.getContext('2d');
    for (const [cell, alpha, seed] of [[7, 0.55, 11], [2.5, 0.35, 97]]) {
      const cw = Math.ceil(MW / (TILE * cell)) + 2, ch = Math.ceil(H / (TILE * cell)) + 2;
      const n = canvas(cw, ch), ng = n.getContext('2d');
      const img = ng.createImageData(cw, ch);
      for (let i = 0; i < cw * ch; i++) {
        const v = Math.round(cellHash(i % cw + seed, Math.floor(i / cw) - seed) * 255);
        img.data.set([v, v, v, 255], i * 4);
      }
      ng.putImageData(img, 0, 0);
      lg.globalAlpha = alpha;
      lg.imageSmoothingEnabled = true;
      lg.imageSmoothingQuality = 'high';
      lg.drawImage(n, -TILE * cell - x0, -TILE * cell, cw * TILE * cell, ch * TILE * cell);
    }
    lg.globalAlpha = 1;
    lg.globalCompositeOperation = 'destination-in';
    lg.drawImage(mask, 0, 0, W, H);
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = strength;
    g.drawImage(layer, x0, 0);
    g.restore();
    layer.width = layer.height = 0;
  }

  // ---------- blood ----------
  // one stamp on the blood layer, on whole pixels, rotated without smoothing; it will age where it lies
  put(s, x, y, rot) {
    const d = { s, x: Math.round(x), y: Math.round(y), rot, at: this.clock + STAIN_AGES[0] };
    const r = Math.hypot(Math.max(s.cx, s.w - s.cx), Math.max(s.cy, s.h - s.cy)) + 1;
    this.on(this.blood, d.x - r, d.x + r, (g) => {
      this.blit(g, stampImage(s), d);
      this.trim(g, d.x - r, d.y - r, d.x + r, d.y + r);
    });
    this.ageing[0].push(d);
  }

  // what was just laid on a floor layer (blood, flesh) through g in the box (x0, y0)-(x1, y1) is taken off wherever
  // it is not floor: on and near the walls and windows (offFloor)
  trim(g, x0, y0, x1, y1) {
    this.offRects();
    const L = this.off, H = this.map.heightPx;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(this.map.widthPx, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    const [i0, i1] = chunkSpan(x0, x1 - 1e-6, L.cw, L.n);
    for (let i = i0; i <= i1; i++) {
      const c = L.chunk(i), a = Math.max(x0, i * L.cw), b = Math.min(x1, (i + 1) * L.cw);
      if (b > a) g.drawImage(c.canvas, a - c.x0, y0, b - a, y1 - y0, a, y0, b - a, y1 - y0);
    }
    g.restore();
  }

  // restrict g to the strip of wall top within BLOOD_EDGE.face px of the face struck at (x, y) (a point inside the
  // wall, just behind the face), (nx, ny) the face's normal out of the wall; no normal: no restriction
  faceBand(g, x, y, nx, ny) {
    if (!nx && !ny) return;
    const T = TILE, b = BLOOD_EDGE.face, big = 1e5;
    let x0 = -big, x1 = big, y0 = -big, y1 = big;
    if (nx > 0) { x1 = (Math.floor(x / T) + 1) * T; x0 = x1 - b; } else if (nx < 0) { x0 = Math.floor(x / T) * T; x1 = x0 + b; }
    if (ny > 0) { y1 = (Math.floor(y / T) + 1) * T; y0 = y1 - b; } else if (ny < 0) { y0 = Math.floor(y / T) * T; y1 = y0 + b; }
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0);
    g.clip();
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
    this.on(this.blood, x - 1, x + 3, (g) => {
      g.fillStyle = pick(SPECK);
      g.globalAlpha = rand(0.55, 0.95);
      g.fillRect(Math.round(x), Math.round(y), r > 0.85 && chance(0.5) ? 2 : 1, r > 0.85 && chance(0.4) ? 2 : 1);
      g.globalAlpha = 1;
      this.trim(g, x - 1, y - 1, x + 3, y + 3);
    });
  }

  // a drop that landed at an angle, travelling along (dx, dy): an elongated stain, its tail and satellites ahead
  stampStreak(x, y, dx, dy, len, width) {
    const a = Math.atan2(dy, dx);
    if (width >= 1.3) { this.put(streakStamp(width, len), x, y, a); return; }
    // a fine one: a short dash and a dot thrown ahead of it
    const c = Math.cos(a), s = Math.sin(a), ex = x + c * (len + 2), ey = y + s * (len + 2);
    this.on(this.blood, Math.min(x, ex) - 2, Math.max(x, ex) + 3, (g) => {
      g.fillStyle = pick(SPECK);
      g.globalAlpha = rand(0.55, 0.95);
      for (let i = 0; i < len; i++) g.fillRect(Math.round(x + c * i), Math.round(y + s * i), 1, 1);
      if (chance(0.5)) g.fillRect(Math.round(ex), Math.round(ey), 1, 1);
      g.globalAlpha = 1;
      this.trim(g, Math.min(x, ex) - 2, Math.min(y, ey) - 2, Math.max(x, ex) + 3, Math.max(y, ey) + 3);
    });
  }

  // something bleeding wiped over the floor from (x0, y0) to (x1, y1): w px of thin broken streaks, never a band
  drag(x0, y0, x1, y1, w) {
    const p = w / 2 + 2;
    this.on(this.blood, Math.min(x0, x1) - p, Math.max(x0, x1) + p, (g) => {
      this.streaks(g, x0, y0, x1, y1, w, SPECK, 0.8);
      this.trim(g, Math.min(x0, x1) - p, Math.min(y0, y1) - p, Math.max(x0, x1) + p, Math.max(y0, y1) + p);
    });
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
    let budget = AGE_BUDGET;
    for (let a = 0; a < 2; a++) {
      const q = this.ageing[a];
      let h = this.heads[a];
      while (h < q.length && budget > 0 && (q[h].at <= this.clock || q.length - h > MAX_AGEING)) {
        const d = q[h++];
        budget--;
        const r = Math.max(d.s.w, d.s.h) + 1;
        this.on(this.blood, d.x - r, d.x + r, (g) => {
          g.globalCompositeOperation = 'source-atop';
          this.blit(g, stampImage(d.s, a + 1), d);
          g.globalCompositeOperation = 'source-over';
        }, false);
        if (a === 0) { d.at = this.clock + STAIN_AGES[1] - STAIN_AGES[0]; this.ageing[1].push(d); }
      }
      if (h > 256) { q.splice(0, h); h = 0; }
      this.heads[a] = h;
    }
  }

  // blood thrown on a wall top: drawn only on the wall tiles
  stampWall(x, y, r, nx = 0, ny = 0) {
    const st = spotStamp(Math.max(1.3, r)), reach = st.cx + st.cy + 2;
    this.on(this.walls, x - reach, x + reach, (g) => {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      this.scars.clip(g, x, y, reach, true);
      this.faceBand(g, x, y, nx, ny);
      g.drawImage(stampImage(st, 1), Math.round(x) - st.cx, Math.round(y) - st.cy);
      g.restore();
    });
  }

  // ---------- on walls (fx/Spatter.js) ----------
  // blood thrown hard against a wall: a ragged splash with its spines toward `angle`, on the wall tops only, by the
  // face (nx, ny) it struck
  splashWall(x, y, r, angle, nx = 0, ny = 0) {
    const st = splatStamp(r), c = Math.cos(angle), s = Math.sin(angle), reach = st.cx + st.cy + 2;
    this.on(this.walls, x - reach, x + reach, (g) => {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      this.scars.clip(g, x, y, reach, true);
      this.faceBand(g, x, y, nx, ny);
      g.setTransform(c, s, -s, c, Math.round(x), Math.round(y));
      g.drawImage(stampImage(st, 0), -st.cx, -st.cy);
      g.restore();
    });
  }

  // one step of something running down a wall: w px of it, on the wall top while it is on the wall, then on the floor
  runDot(x, y, w = 1, color = RUN) {
    const px = Math.round(x), py = Math.round(y), wall = this.map.solidAt(px + 0.5, py + 0.5);
    const L = wall ? this.walls : color === RUN ? this.blood : this.floor;
    this.on(L, px - 1, px + w + 1, (g) => {
      if (wall) g.globalCompositeOperation = 'source-atop';
      g.fillStyle = wall && color === RUN ? RUN_WALL : color;
      g.fillRect(px, py, w, w);
      g.globalCompositeOperation = 'source-over';
      if (L === this.blood) this.trim(g, px, py, px + w, py + w);
    });
  }

  // a liquid (not blood) thrown on a wall: a wet stipple in its colour, wall tops only
  wetWall(x, y, r, color, nx = 0, ny = 0) {
    this.on(this.walls, x - r - 2, x + r + 2, (g) => {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      this.scars.clip(g, x, y, r + 1, true);
      this.faceBand(g, x, y, nx, ny);
      g.fillStyle = color;
      for (let i = 0, n = Math.round(r * r * 1.2); i < n; i++) {
        const a = rand(0, TAU), d = r * Math.sqrt(Math.random());
        g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
      }
      g.restore();
    });
  }

  // what was inside a burst skull, thrown toward `angle`: on the floor (over the blood, under the bodies) or on a wall
  matter(x, y, r, angle, wall = false, nx = 0, ny = 0) {
    const img = matterStain(r), c = Math.cos(angle), s = Math.sin(angle), reach = (img.width + img.height) / 2 + 1;
    this.on(wall ? this.walls : this.flesh, x - reach, x + reach, (g) => {
      g.save();
      if (wall) {
        g.globalCompositeOperation = 'source-atop';
        this.scars.clip(g, x, y, img.width + img.height, true);
        this.faceBand(g, x, y, nx, ny);
      }
      g.setTransform(c, s, -s, c, Math.round(x), Math.round(y));
      g.drawImage(img, -img.width / 2, -img.height / 2);
      g.restore();
      if (!wall) this.trim(g, x - reach, y - reach, x + reach, y + reach);
    });
  }

  // ---------- other persistent decals ----------
  // a blow on a wall's face at (x, y), (nx, ny) its normal out of the wall: the hole it digs into the wall top
  // (kind: entry | exit | graze | blow, data/materials.js WALL_SCAR), or the older one it digs out further
  wallHit(x, y, nx, ny, kind, size = 1) {
    const s = this.scars.place(x, y, nx, ny, kind, size);
    if (s) this.on(this.walls, s.x - s.r - 4, s.x + s.r + 4, (g) => this.scars.paint(g, s));
  }

  // what a hole in a wall drops at its foot and keeps there: a few crumbs of the material (x, y: on the floor)
  crumbs(x, y, color, n, spread = 3) {
    this.on(this.floor, x - spread - 1, x + spread + 2, (g) => {
      g.fillStyle = color;
      for (let i = 0; i < n; i++) {
        g.globalAlpha = rand(0.5, 0.9);
        g.fillRect(Math.round(x + rand(-spread, spread)), Math.round(y + rand(-spread, spread)), chance(0.3) ? 2 : 1, 1);
      }
      g.globalAlpha = 1;
    });
  }

  // the burn of a blast or a fire (ragged soot, see BlastArt)
  scorch(x, y, r) {
    const art = scorchArt(r), ox = Math.round(x - art.width / 2), oy = Math.round(y - art.height / 2);
    const x0 = ox, x1 = ox + art.width;
    this.on(this.floor, x0, x1, (g) => g.drawImage(art, ox, oy));
    // what lies there chars with it: blood, remains, wall tops
    for (const L of [this.blood, this.flesh, this.walls]) {
      this.on(L, x0, x1, (wg) => {
        wg.globalCompositeOperation = 'source-atop';
        wg.drawImage(art, ox, oy);
        wg.globalCompositeOperation = 'source-over';
      }, false);
    }
  }

  // liquid stain (water, spirits, milk): a soft ellipse in the given rgba colour
  spill(x, y, r, color) {
    this.on(this.floor, x - r - 1, x + r + 1, (g) => {
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(x, y, r, r * rand(0.6, 1), rand(0, 3), 0, Math.PI * 2);
      g.fill();
    });
  }

  // one wet shoe print, toe toward `angle` (~24 cm long): the pixels of a sole and a heel, never all of them
  footprint(x, y, angle, color, alpha) {
    const c = Math.cos(angle), s = Math.sin(angle);
    this.on(this.floor, x - 6, x + 6, (g) => {
      g.fillStyle = color;
      for (const [lx, ly] of SHOE) {
        if (chance(0.18)) continue;
        g.globalAlpha = alpha * rand(0.55, 1);
        g.fillRect(Math.round(x + lx * c - ly * s), Math.round(y + lx * s + ly * c), 1, 1);
      }
      g.globalAlpha = 1;
    });
  }

  // a wet body dragged over the floor: a wide streaky stroke ending at (x, y)
  smear(x, y, angle, len, color, alpha) {
    const x0 = x - Math.cos(angle) * len, y0 = y - Math.sin(angle) * len;
    this.on(this.floor, Math.min(x0, x) - 6, Math.max(x0, x) + 6, (g) => this.streaks(g, x0, y0, x, y, 7, [color], alpha));
  }

  // permanently paint an image onto the floor (debris), or over the blood (flesh: a corpse, a gib)
  bake(img, x, y, angle, alpha = 1, flesh = false, scale = 1) {
    const k = (img.k || 1) * scale, r = (Math.hypot(img.width, img.height) * k) / 2 + 1; // a finer sprite (Assets.js `density`) baked at the floor's scale
    this.on(flesh ? this.flesh : this.floor, x - r, x + r, (g) => {
      g.save();
      g.translate(x, y);
      g.rotate(angle);
      g.globalAlpha = alpha;
      if (k !== 1) g.scale(k, k);
      g.drawImage(img, -img.width / 2, -img.height / 2);
      g.restore();
    });
  }

  // anything else drawn straight into a layer ('floor', 'flesh', 'blood', 'walls'; true: 'flesh'): fn(g), in world
  // px, over the world x range [x0, x1] it may reach (none: only on what is already there)
  paint(fn, layer = 'floor', x0 = -Infinity, x1 = Infinity) {
    const L = this.layers[layer === true ? 'flesh' : layer];
    const bound = Number.isFinite(x0) && Number.isFinite(x1);
    this.on(L, bound ? x0 : 0, bound ? x1 : this.map.widthPx, (g) => {
      g.save();
      fn(g);
      g.restore();
    }, bound);
  }

  // a loose piece come to rest becomes part of the floor, with the shadow it cast while loose: nothing pops
  wreck(img, x, y, angle, shadow = true, scale = 1) {
    if (shadow) this.bake(silhouette(img), x + 1, y + 1, angle, 0.3, false, scale);
    this.bake(img, x, y, angle, 1, false, scale);
  }

  // ---------- drawing ----------
  // the layers under what stands on the floor, in the world rect [x0, x1] x [y0, y1]
  drawFloor(ctx, x0, y0, x1, y1) { this.floor.draw(ctx, x0, y0, x1, y1); }
  drawBlood(ctx, x0, y0, x1, y1) { this.blood.draw(ctx, x0, y0, x1, y1); }
  drawFlesh(ctx, x0, y0, x1, y1) { this.flesh.draw(ctx, x0, y0, x1, y1); }
  drawWalls(ctx, x0, y0, x1, y1) { this.walls.draw(ctx, x0, y0, x1, y1); }

  // what the layers hold, MB (the F4 overlay, the measurements)
  get megabytes() {
    return Object.values(this.layers).concat(this.off).reduce((n, L) => n + L.bytes, 0) / 1048576;
  }
}
