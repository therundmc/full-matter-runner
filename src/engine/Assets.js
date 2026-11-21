// Sprite loading + derived caches (silhouettes for drop shadows, slices for debris).
// What is loaded comes from the sprite registry (tools/sprites/registry.py, generated into ./spritelist.js by
// tools/generate_assets.py): REQUIRED up front (a placeholder if one is missing), the OPTIONAL ones when they are on
// disk (`spriteOpt()` returns null otherwise), each at its density (FINE).
import { REQUIRED, OPTIONAL, FINE } from './spritelist.js';

const SPRITE_LIST = REQUIRED;
export const OPTIONAL_LIST = [
  ...OPTIONAL,
  // the comic panels of the opening, of the leap's card and of level 1's ending (tools/generate_comic.py), painted
  // finer than the title they are drawn on
  ...['sleep', 'door', 'pry', 'box', 'count', 'pour', 'match_dark', 'match', 'fire', 'wake_shut', 'wake',
    'alley', 'drive', 'office', 'office_phone', 'matchbook'].map((n) => `comic/${n}`),
  // (tools/comic's full-screen cards, target_* and card_runner, are painted but not loaded: nothing draws them since
  // the hit list took the screen between levels, ui/title/HitList.js)
  // the title's stills (tools/comic/title.py): the poster's three layers and the logo (ui/title/Poster.js), the hit
  // list's board and what is pinned to it, one per number of targets dead (ui/title/HitList.js)
  // and the options' table and what lies on it (ui/title/Options.js)
  ...['poster_sky', 'poster_city', 'poster_front', 'logo', 'logo_off', 'board_bg', 'board_0', 'board_1', 'board_2', 'board_3', 'board_4',
    'options_bg', 'options_things']
    .map((n) => `title/${n}`),
];

// Sprites painted finer than the world (1 sprite px = 1 world px everywhere else): world px per sprite px, by name.
// The standing characters, the weapons, the furniture, the street's dressing, the vehicles, the floors, the clutter
// and the fauna are painted at twice the density (tools/sprites/core.py FINE), still plain pixel art; the neon signs,
// the wall tops and the bodies on the floor are not. An image carries its own (`img.k`); drawSprite and the derived
// canvases honour it, raw drawImage callers must scale by it.
const density = (name) => (FINE.has(name) ? 0.5 : 1);

// size of a sprite in world px (a finer sprite is smaller than its pixels)
export const sw = (img) => img.width * (img.k || 1);
export const sh = (img) => img.height * (img.k || 1);

const images = new Map();
// weak caches: per-instance canvases (eroded props, bitten pieces) can be garbage-collected
const silhouettes = new WeakMap();
const sliceCache = new WeakMap();

function placeholder() {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#ff00ff';
  g.fillRect(0, 0, 8, 8);
  return c;
}

export async function loadAssets(onProgress) {
  let done = 0;
  await Promise.all(SPRITE_LIST.map((name) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { img.k = density(name); images.set(name, img); onProgress?.(++done / SPRITE_LIST.length); resolve(); };
    img.onerror = () => { console.warn('missing sprite', name); images.set(name, placeholder()); onProgress?.(++done / SPRITE_LIST.length); resolve(); };
    img.src = `assets/sprites/${name}.png`;
  })));
  await Promise.all(OPTIONAL_LIST.map((name) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { img.k = density(name); images.set(name, img); resolve(); };
    img.onerror = () => resolve();
    img.src = `assets/sprites/${name}.png`;
  })));
  try { await document.fonts.load('16px joystix'); } catch (e) { /* font optional */ }
}

// the sprites loaded: how many, and their pixels in bytes (the perf overlay)
export function spriteBytes() {
  let bytes = 0;
  for (const img of images.values()) bytes += (img.width || 0) * (img.height || 0) * 4;
  return { n: images.size, bytes };
}

export function sprite(name) {
  let img = images.get(name);
  if (!img) { img = placeholder(); images.set(name, img); }
  return img;
}

export function spriteOpt(name) { return images.get(name) || null; }

// black silhouette of a sprite (used for cheap drop shadows)
export function silhouette(img) {
  let s = silhouettes.get(img);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = img.width; s.height = img.height;
  const g = s.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#000';
  g.fillRect(0, 0, s.width, s.height);
  s.k = img.k;
  silhouettes.set(img, s);
  return s;
}

// a sprite gone dull: its own pixels darkened by `k` (0..1) toward `ink` (a wrecked thing on the floor); cached per
// sprite and k
const dulls = new WeakMap();
export function dulled(img, k = 0.5, ink = '#1a1620') {
  let m = dulls.get(img);
  if (!m) { m = new Map(); dulls.set(img, m); }
  if (m.has(k)) return m.get(k);
  const s = document.createElement('canvas');
  s.width = img.width; s.height = img.height;
  const g = s.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = k;
  g.fillStyle = ink;
  g.fillRect(0, 0, s.width, s.height);
  s.k = img.k;
  m.set(k, s);
  return s;
}

// split a sprite into a grid of pieces (debris); returns array of canvases
export function slices(img, cols = 2, rows = 2) {
  let perImg = sliceCache.get(img);
  if (!perImg) { perImg = new Map(); sliceCache.set(img, perImg); }
  const key = cols + 'x' + rows;
  let cached = perImg.get(key);
  if (cached) return cached;
  cached = [];
  const pw = Math.ceil(img.width / cols), ph = Math.ceil(img.height / rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.min(pw, img.width - c * pw));
      cv.height = Math.max(2, Math.min(ph, img.height - r * ph));
      const g = cv.getContext('2d');
      // jagged edges: clip with a random polygon
      g.beginPath();
      const j = () => Math.random() * 3;
      g.moveTo(j(), j());
      g.lineTo(cv.width - j(), j());
      g.lineTo(cv.width - j(), cv.height - j());
      g.lineTo(j(), cv.height - j());
      g.closePath();
      g.clip();
      g.drawImage(img, c * pw, r * ph, cv.width, cv.height, 0, 0, cv.width, cv.height);
      if (img.k) cv.k = img.k; // a piece of a finer sprite is as fine
      cached.push(cv);
    }
  }
  perImg.set(key, cached);
  return cached;
}

const procCache = new Map();
function cached(key, make) {
  let v = procCache.get(key);
  if (!v) { v = make(); procCache.set(key, v); }
  return v;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// sharp glass shards, 8 variants per size: 'small' crumbs (3-8 px), 'mid' (6-10 px), 'big' daggers (11-18 px)
export function glassShards(size = 'small') {
  if (size !== 'small') {
    const big = size === 'big';
    return cached('glass-' + size, () => Array.from({ length: 8 }, (_, i) => {
      const w = big ? 11 + i : 6 + (i % 5), h = big ? 4 + (i % 3) : 3 + (i % 2);
      const c = canvas(w + 2, h + 2);
      const g = c.getContext('2d');
      g.translate(1, 1);
      // a long splinter: broad broken base on the left, the point on the right
      const top = w * (0.2 + (i % 3) * 0.12), low = w * (0.3 + ((i + 1) % 3) * 0.1), tip = h * (0.35 + (i % 4) * 0.1);
      g.beginPath();
      g.moveTo(0, h * 0.25); g.lineTo(top, 0); g.lineTo(w, tip); g.lineTo(low, h); g.lineTo(0, h * 0.8);
      g.closePath();
      g.fillStyle = 'rgba(176,236,252,0.9)';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = big ? 'rgba(24,64,96,0.95)' : 'rgba(40,90,124,0.7)';
      g.stroke();
      // the bevel catching the light, from the base to the point
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.moveTo(top * 0.6, h * 0.35); g.lineTo(w - 2, tip); g.stroke();
      return c;
    }));
  }
  return cached('glass', () => Array.from({ length: 8 }, (_, i) => {
    const w = 3 + (i % 4) * 1.5, h = 2 + (i % 3);
    const c = canvas(Math.ceil(w) + 1, Math.ceil(h) + 1);
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(170,235,255,0.85)';
    g.beginPath(); g.moveTo(0, h); g.lineTo(w * (0.3 + (i % 3) * 0.2), 0); g.lineTo(w, h * 0.7); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillRect(Math.floor(w * 0.4), Math.floor(h * 0.4), 1, 1);
    return c;
  }));
}

// small solid chunk of a given colour (splinters, rubble, metal bits)
export function chunk(color, w, h) {
  return cached(`chunk${color}${w}x${h}`, () => {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#140c1c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    g.fillRect(w > 2 ? 1 : 0, h > 2 ? 1 : 0, Math.max(1, w - 2), Math.max(1, h - 2));
    return c;
  });
}

// jagged rubble cut from a wall texture
export function rubble(texture) {
  return cached('rubble' + texture, () => {
    const img = sprite('tiles/' + texture);
    return Array.from({ length: 10 }, (_, i) => {
      const w = 4 + (i % 5) * 2, h = 4 + ((i * 3) % 4) * 2;
      const c = canvas(w, h);
      const g = c.getContext('2d');
      g.beginPath();
      g.moveTo(Math.random() * 2, 0); g.lineTo(w, Math.random() * 2); g.lineTo(w - Math.random() * 2, h); g.lineTo(0, h - Math.random() * 2);
      g.closePath(); g.clip();
      g.drawImage(img, (i * 7) % (32 - w), (i * 5) % (32 - h), w, h, 0, 0, w, h);
      g.strokeStyle = 'rgba(20,12,28,0.9)';
      g.stroke();
      return c;
    });
  });
}


// draw an image centered at (x, y) with rotation
export function drawSprite(ctx, img, x, y, angle = 0, alpha = 1, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  const sc = scale * (img.k || 1); // a finer sprite is drawn smaller (see `density`)
  if (sc !== 1) ctx.scale(sc, sc);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// A long thing stood on end, seen from above: its sprite squashed to `len` of its length, `scale` bigger because it
// comes up toward the eye. part < 1: only that share of the sprite from its -x end (the rest is in what it is
// planted in), the cut end on (x, y); part 1: the whole of it, centred on (x, y).
export function drawUpright(ctx, img, x, y, angle, len, { alpha = 1, scale = 1, part = 1 } = {}) {
  const k = scale * (img.k || 1), w = Math.round(img.width * part);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(k * len, k);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(img, 0, 0, w, img.height, part < 1 ? -w : -w / 2, -img.height / 2, w, img.height);
  ctx.restore();
}
