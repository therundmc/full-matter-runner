// Sprite loading + derived caches (silhouettes for drop shadows, slices for debris).
const CHARACTERS = ['player', 'thug', 'heavy', 'brute'];
const CHAR_PARTS = ['torso', 'down', 'dead0', 'dead1', 'gib_head', 'gib_arm', 'gib_leg', 'gib_torso'];

export const SPRITE_LIST = [
  ...CHARACTERS.flatMap((c) => CHAR_PARTS.map((p) => `characters/${c}_${p}`)),
  'characters/gib_chunk0', 'characters/gib_chunk1', 'characters/gib_chunk2', 'characters/gib_eye',
  ...['pistol', 'uzi', 'uzi_silenced', 'shotgun', 'rifle', 'sniper', 'bazooka', 'bat', 'knife', 'rocket', 'casing', 'shell']
    .map((n) => `weapons/${n}`),
  ...['table', 'table_round', 'desk', 'chair', 'armchair', 'sofa', 'plant', 'tv', 'fridge', 'oven', 'sink', 'toilet',
    'bed', 'pool_table', 'arcade', 'crate', 'barrel', 'bookshelf', 'speaker', 'dj_booth', 'bar_counter', 'car',
    'dumpster', 'trash_can'].map((n) => `props/${n}`),
  ...['wood', 'checker', 'tile_blue', 'carpet_red', 'carpet_purple', 'concrete', 'grass', 'asphalt', 'asphalt_line',
    'dirt', 'sidewalk', 'neon_floor', 'wall', 'brick'].map((n) => `tiles/${n}`),
  'structure/door', 'structure/window', 'structure/fence',
];

const images = new Map();
const silhouettes = new Map();
const sliceCache = new Map();

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
    img.onload = () => { images.set(name, img); onProgress?.(++done / SPRITE_LIST.length); resolve(); };
    img.onerror = () => { console.warn('missing sprite', name); images.set(name, placeholder()); onProgress?.(++done / SPRITE_LIST.length); resolve(); };
    img.src = `assets/sprites/${name}.png`;
  })));
  try { await document.fonts.load('16px joystix'); } catch (e) { /* font optional */ }
}

export function sprite(name) {
  let img = images.get(name);
  if (!img) { img = placeholder(); images.set(name, img); }
  return img;
}

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
  silhouettes.set(img, s);
  return s;
}

// split a sprite into a grid of pieces (debris); returns array of canvases
export function slices(img, cols = 2, rows = 2) {
  const key = img;
  let cached = sliceCache.get(key);
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
      cached.push(cv);
    }
  }
  sliceCache.set(key, cached);
  return cached;
}

// draw an image centered at (x, y) with rotation
export function drawSprite(ctx, img, x, y, angle = 0, alpha = 1, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  if (scale !== 1) ctx.scale(scale, scale);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// sprite + offset drop shadow
export function drawSpriteShadowed(ctx, img, x, y, angle = 0, shadow = 2, alpha = 1) {
  drawSprite(ctx, silhouette(img), x + shadow, y + shadow, angle, 0.35 * alpha);
  drawSprite(ctx, img, x, y, angle, alpha);
}
