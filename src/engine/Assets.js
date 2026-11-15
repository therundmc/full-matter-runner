// Sprite loading + derived caches (silhouettes for drop shadows, slices for debris).
// civN: ambient passers-by and customers; dancerN: the dancers of a VIP room
const CHARACTERS = ['player', 'thug', 'heavy', 'brute', 'boss', 'civ1', 'civ2', 'civ3', 'civ4', 'civ5', 'civ6', 'civ7', 'civ8',
  'dancer1', 'dancer2', 'tramp'];
const CHAR_PARTS = ['torso', 'head', 'down', 'dead0', 'dead1', 'gib_head', 'gib_arm', 'gib_leg', 'gib_torso'];

export const SPRITE_LIST = [
  ...CHARACTERS.flatMap((c) => CHAR_PARTS.map((p) => `characters/${c}_${p}`)),
  'characters/gib_chunk0', 'characters/gib_chunk1', 'characters/gib_chunk2', 'characters/gib_eye',
  ...['pistol', 'uzi', 'uzi_silenced', 'shotgun', 'rifle', 'sniper', 'bazooka', 'bat', 'knife', 'cue', 'cue_half', 'tire_iron', 'rocket', 'casing', 'shell']
    .map((n) => `weapons/${n}`),
  ...['table', 'table_round', 'desk', 'chair', 'armchair', 'sofa', 'plant', 'tv', 'fridge', 'oven', 'sink', 'toilet',
    'bed', 'pool_table', 'arcade', 'crate', 'barrel', 'bookshelf', 'speaker', 'dj_booth', 'bar_counter', 'car',
    'dumpster', 'trash_can'].map((n) => `props/${n}`),
  ...['wood', 'checker', 'tile_blue', 'carpet_red', 'carpet_purple', 'concrete', 'grass', 'asphalt', 'asphalt_line',
    'dirt', 'sidewalk', 'neon_floor', 'wall', 'brick'].map((n) => `tiles/${n}`),
  ...['door', 'door_locked', 'door_jamb', 'door_jamb_steel', 'threshold', 'window', 'window_broken', 'window_sill', 'fence']
    .map((n) => `structure/${n}`),
];

// Sprites that may not exist (yet): loaded when present, `spriteOpt()` returns null otherwise.
const FLOOR_TILES = ['wood', 'checker', 'tile_blue', 'carpet_red', 'carpet_purple', 'concrete', 'grass', 'asphalt',
  'asphalt_line', 'dirt', 'sidewalk', 'neon_floor'];
const GLOWING = ['arcade', 'tv', 'dj_booth', 'jukebox', 'palm_planter', 'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow', 'streetlight',
  'car', 'car2', 'van'];
// lamps: sprite + emissive map
const FIXTURES = ['floor_lamp', 'table_lamp', 'wall_lamp', 'tube_light', 'neon_tube_pink', 'neon_tube_cyan', 'ceiling_lamp', 'pool_lamp',
  'string_lights', 'emergency_light'];
export const OPTIONAL_LIST = [
  ...FIXTURES.flatMap((n) => [`props/${n}`, `props/${n}_glow`]),
  ...FLOOR_TILES.flatMap((t) => [`tiles/${t}_v1`, `tiles/${t}_v2`]),
  'tiles/neon_floor_glow',
  ...['palm_tree', 'streetlight', 'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow', 'jukebox', 'car2', 'van',
    'car_tire', 'car_hood', 'car_door', 'car2_hood', 'car2_door', 'van_hood', 'van_door', 'hydrant', 'bench'].map((n) => `props/${n}`),
  ...GLOWING.map((n) => `props/${n}_glow`),
  ...['chain_fence', 'bottle_shelf', 'washer', 'card_table', 'dance_stage', 'dope_table', 'gas_bottle', 'back_bar', 'alarm_box', 'cash_case', 'ceiling_fan', 'mirror_ball', 'extinguisher',
    'vending', 'phone_booth', 'parking_meter', 'news_box', 'pipe_steam', 'pipe_water', 'wall_vent', 'manhole', 'cardboard_bed', 'ladder', 'parapet', 'fuse_box',
    'table_flipped', 'table_round_flipped', 'card_table_flipped', 'urinal', 'stall', 'apt_door', 'doormat', 'stairs', 'floor_hole', 'jerrycan',
    'runner', 'road_edge', 'parking_bay', 'palm_planter', 'velvet_rope', 'entry_carpet', 'radiator', 'bike', 'bin_bag', 'newspaper', 'shoes'].map((n) => `props/${n}`),
  ...['neon_sign_liquor', 'neon_sign_video', 'neon_sign_wash', 'neon_sign_girls'].flatMap((n) => [`props/${n}`, `props/${n}_glow`]),
  ...['mag_pistol', 'mag_uzi', 'mag_rifle', 'mag_sniper', 'shells_box', 'ammo_9mm', 'ammo_12g', 'ammo_762', 'ammo_rocket']
    .map((n) => `weapons/${n}`),
  // rag_*_up: torso and head of a body lying on its back; rag_torso_down: its back, when it lies on its belly (Ragdoll)
  ...CHARACTERS.flatMap((c) => ['rag_torso', 'rag_head', 'rag_arm', 'rag_leg', 'rag_torso_up', 'rag_head_up', 'rag_torso_down'].map((p) => `characters/${c}_${p}`)),
  // small things in a guard's hands at his post, dropped or left about
  ...['butt', 'cigar', 'can', 'magazine', 'ashtray', 'bottle'].map((n) => `items/${n}`),
  // rooftops of the neighbouring buildings (painted on the wall layer)
  'tiles/roof',
  // the comic panels of the opening, of the leap's card and of level 1's ending (tools/generate_comic.py), painted
  // finer than the title they are drawn on
  ...['sleep', 'door', 'pry', 'box', 'count', 'pour', 'match_dark', 'match', 'fire', 'wake_shut', 'wake',
    'alley', 'drive', 'office', 'office_phone', 'matchbook'].map((n) => `comic/${n}`),
  ...['ac_unit', 'vent', 'duct', 'hatch', 'chimney', 'tank', 'antenna', 'bulkhead', 'skylight', 'skylight_tv', 'skylight_dark',
    'bulkhead_glow', 'skylight_glow', 'skylight_tv_glow'].map((n) => `roof/${n}`),
];

// Sprites painted finer than the world (1 sprite px = 1 world px everywhere else): world px per sprite px, by name.
// The standing characters and the weapons are painted at twice the density (tools/generate_assets.py FINE), still
// plain pixel art. An image carries its
// own (`img.k`); drawSprite and the derived canvases honour it, raw drawImage callers must scale by it.
// (a kind's name has no underscore: `thug_torso` and `thug_head` are fine, `thug_rag_torso` and `thug_gib_head` are not)
const FINE = /^(characters\/[a-z0-9]+_(torso|head)|weapons\/(pistol|uzi|uzi_silenced|shotgun|rifle|sniper|bazooka|bat|knife|cue|cue_half|tire_iron))$/;
// the furniture, the street's dressing and the vehicles (and their emissive maps), painted at the same density
// (generate_assets.py FINE_PROPS), the lamps' fittings too; the neon signs, neon tubes and party bulbs stay at the world's
const FINE_PROPS = new Set(['alarm_box', 'apt_door', 'arcade', 'armchair', 'back_bar', 'bar_counter', 'barrel', 'bed', 'bench',
  'bike', 'bin_bag', 'bookshelf', 'bottle_shelf', 'car', 'car2', 'van', 'car_tire', 'car_hood', 'car_door', 'car2_hood',
  'car2_door', 'van_hood', 'van_door', 'card_table', 'card_table_flipped', 'cardboard_bed', 'cash_case', 'ceiling_fan',
  'chain_fence', 'chair', 'crate', 'dance_stage', 'desk', 'dj_booth', 'doormat', 'dope_table', 'dumpster', 'extinguisher',
  'floor_hole', 'fridge', 'fuse_box', 'gas_bottle', 'hydrant', 'jerrycan', 'jukebox', 'ladder', 'manhole', 'mirror_ball',
  'news_box', 'newspaper', 'oven', 'palm_tree', 'parapet', 'parking_meter', 'phone_booth', 'pipe_steam', 'pipe_water', 'plant',
  'parking_bay', 'palm_planter', 'velvet_rope', 'entry_carpet', 'pool_table', 'radiator', 'road_edge', 'runner', 'shoes', 'sink', 'sofa', 'speaker', 'stairs', 'stall', 'streetlight', 'table',
  'table_flipped', 'table_round', 'table_round_flipped', 'toilet', 'trash_can', 'tv', 'urinal', 'vending', 'wall_vent', 'washer',
  'floor_lamp', 'table_lamp', 'wall_lamp', 'tube_light', 'ceiling_lamp', 'pool_lamp', 'emergency_light']);
// the plant on the neighbouring roofs too (generate_assets.py ROOF_FINE; the lit pieces stay at the world's)
const ROOF_FINE = new Set(['ac_unit', 'vent', 'duct', 'hatch', 'chimney', 'tank', 'antenna']);
// the floor tiles too (64 x 64 pixels a tile); the wall tops stay at the world's
const fine = (name) => FINE.test(name) || (name.startsWith('props/') && FINE_PROPS.has(name.slice(6).replace(/_glow$/, '')))
  || (name.startsWith('roof/') && ROOF_FINE.has(name.slice(5)))
  || (name.startsWith('tiles/') && FLOOR_TILES.includes(name.slice(6).replace(/_(v1|v2|glow)$/, '')));
const density = (name) => (fine(name) ? 0.5 : 1);

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

// sprite + offset drop shadow
export function drawSpriteShadowed(ctx, img, x, y, angle = 0, shadow = 2, alpha = 1) {
  drawSprite(ctx, silhouette(img), x + shadow, y + shadow, angle, 0.35 * alpha);
  drawSprite(ctx, img, x, y, angle, alpha);
}
