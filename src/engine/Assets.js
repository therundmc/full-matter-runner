// Sprite loading + derived caches (silhouettes for drop shadows, slices for debris).
// civN: ambient passers-by and customers; dancerN: the dancers of a VIP room
const CHARACTERS = ['player', 'thug', 'heavy', 'brute', 'boss', 'cueball', 'lucky', 'civ1', 'civ2', 'civ3', 'civ4', 'civ5', 'civ6', 'civ7', 'civ8',
  'dancer1', 'dancer2', 'tramp'];
const CHAR_PARTS = ['torso', 'head', 'down', 'dead0', 'dead1', 'gib_head', 'gib_arm', 'gib_leg', 'gib_torso'];

const SPRITE_LIST = [
  ...CHARACTERS.flatMap((c) => CHAR_PARTS.map((p) => `characters/${c}_${p}`)),
  'characters/gib_chunk0', 'characters/gib_chunk1', 'characters/gib_chunk2', 'characters/gib_eye',
  'characters/lucky_scarf', // the flying end of LUCKY's scarf (entities/Enemy.js)
  // the two halves of the runner's skirt (entities/Skirt.js), and that skirt spread under his body (Ragdoll)
  'characters/player_tail_l', 'characters/player_tail_r', 'characters/player_rag_skirt',
  ...['pistol', 'uzi', 'uzi_silenced', 'shotgun', 'rifle', 'sniper', 'bazooka', 'bat', 'knife', 'cue', 'cue_half', 'tire_iron', 'tire_iron_bent', 'rocket', 'casing', 'shell']
    .map((n) => `weapons/${n}`),
  ...['table', 'table_round', 'desk', 'chair', 'armchair', 'sofa', 'plant', 'tv', 'fridge', 'oven', 'sink', 'toilet',
    'bed', 'pool_table', 'arcade', 'crate', 'barrel', 'bookshelf', 'speaker', 'dj_booth', 'bar_counter', 'car',
    'dumpster', 'trash_can'].map((n) => `props/${n}`),
  ...['wood', 'checker', 'tile_blue', 'carpet_red', 'carpet_purple', 'concrete', 'grass', 'asphalt', 'asphalt_line',
    'dirt', 'sidewalk', 'neon_floor', 'wall', 'brick'].map((n) => `tiles/${n}`),
  ...['door', 'door_locked', 'stall_door', 'door_jamb', 'door_jamb_steel', 'threshold', 'window', 'window_broken', 'window_sill', 'fence']
    .map((n) => `structure/${n}`),
  // the door skins, one kind of door per place (data/doors.js DOORS.kinds), at FINE density (DOOR_SKINS below)
  ...['fire', 'bar', 'bar_broken', 'swing', 'staff', 'office', 'gaming', 'flat', 'wired', 'wired_broken', 'shop', 'shop_broken']
    .map((n) => `structure/door_${n}`),
  // the street fauna, a frame for each step of their gaits (render/CritterArt.js)
  ...['pigeon_idle', 'pigeon_peck', 'pigeon_dead', 'rat_idle', 'rat_dead', 'cat_sit', 'cat_low', 'cat_dead',
    ...[0, 1, 2].flatMap((i) => [`pigeon_walk${i}`, `pigeon_fly${i}`, `rat_run${i}`, `cat_run${i}`]),
    ...[0, 1, 2, 3].map((i) => `cat_walk${i}`)].map((n) => `critters/${n}`),
];

// Sprites that may not exist (yet): loaded when present, `spriteOpt()` returns null otherwise.
const FLOOR_TILES = ['wood', 'checker', 'tile_blue', 'carpet_red', 'carpet_purple', 'concrete', 'grass', 'asphalt',
  'asphalt_line', 'dirt', 'sidewalk', 'neon_floor'];
const GLOWING = ['arcade', 'tv', 'dj_booth', 'jukebox', 'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow', 'streetlight',
  'car', 'car2', 'van', 'convertible', 'pursuer'];
// lamps: sprite + emissive map
const FIXTURES = ['floor_lamp', 'table_lamp', 'wall_lamp', 'tube_light', 'neon_tube_pink', 'neon_tube_cyan', 'ceiling_lamp', 'pool_lamp',
  'string_lights', 'emergency_light'];
const BAR_WALL = ['frame_photo', 'frame_gold', 'poster_fight', 'poster_band', 'dartboard', 'pay_phone', 'coat_hooks', 'towel_dispenser',
  'poster_pinup', 'poster_revue', 'mirror_strip', 'cocktail_table', 'conduit', 'flyers', 'tag'];
const CLUTTER_SPRITES = ['pint_full', 'pint_half', 'pint_empty', 'pitcher', 'shot', 'lowball', 'beer_bottle', 'liquor', 'ashtray', 'cigar',
  'coaster', 'napkin', 'napkin_crumpled', 'peanuts', 'till', 'cards', 'chips', 'bands', 'bill', 'rubber_bands', 'baggies', 'glass_broken',
  'flute', 'flute_down', 'bucket', 'single', 'singles', 'bill_crumpled', 'bill_folded', 'feather', 'feather_curl', 'cork', 'garter', 'sock', 'card', 'chip'];
export const OPTIONAL_LIST = [
  ...FIXTURES.flatMap((n) => [`props/${n}`, `props/${n}_glow`]),
  ...FLOOR_TILES.flatMap((t) => [1, 2, 3, 4, 5].map((k) => `tiles/${t}_v${k}`)),
  'tiles/neon_floor_glow',
  ...['palm_tree', 'streetlight', 'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow', 'jukebox', 'car2', 'van',
    'car_tire', 'car_hood', 'car_door', 'car2_hood', 'car2_door', 'van_hood', 'van_door', 'convertible', 'convertible_hood', 'convertible_door', 'boss_hat', 'hydrant', 'bench',
    'pursuer', 'pursuer_hood', 'pursuer_door'].map((n) => `props/${n}`),
  ...GLOWING.map((n) => `props/${n}_glow`),
  ...['chain_fence', 'bottle_shelf', 'washer', 'card_table', 'dance_stage', 'dope_table', 'gas_bottle', 'back_bar', 'alarm_box', 'cash_case', 'ceiling_fan', 'mirror_ball', 'extinguisher',
    'vending', 'phone_booth', 'parking_meter', 'news_box', 'pipe_steam', 'pipe_water', 'wall_vent', 'manhole', 'cardboard_bed', 'ladder', 'parapet', 'fuse_box',
    'table_flipped', 'table_round_flipped', 'card_table_flipped', 'urinal', 'stall', 'apt_door', 'doormat', 'stairs', 'floor_hole', 'jerrycan', 'laundry_basket',
    'runner', 'road_edge', 'parking_bay', 'velvet_rope', 'entry_carpet', 'radiator', 'bike', 'bin_bag', 'newspaper', 'shoes',
    'keg', 'fire_alarm', 'trapdoor', 'rug', 'beer_tap', 'curtain', 'trash_can_down', 'bin_lid',
    'sandwich_board', 'ash_urn', 'entry_mat'].map((n) => `props/${n}`),
  // the physics lab's stencilled floor labels (tools/build_lab.py)
  ...['range', 'executions', 'soot', 'powder', 'steam', 'liquids', 'curtain', 'bars', 'pool', 'power', 'jukebox', 'trapdoor',
    'vehicles', 'takedowns', 'doors', 'cueball', 'fire', 'coat', 'drive', 'getaway', 'lorry', 'grab', 'aim', 'arcade', 'laundry', 'arms', 'throw'].map((n) => `props/label_${n}`),
  // a bar's walls: pictures, posters, a dartboard, the pay phone, the coat hooks, the towels in the toilets, the VIP
  // room's mirror (and its low table)
  ...BAR_WALL.map((n) => `props/${n}`),
  // what stands on its furniture (systems/Clutter.js)
  ...CLUTTER_SPRITES.map((n) => `clutter/${n}`),
  ...['neon_sign_liquor', 'neon_sign_video', 'neon_sign_wash', 'neon_sign_mirage', 'neon_sign_open', 'neon_sign_beer', 'neon_sign_bay',
    'neon_sign_lips'].flatMap((n) => [`props/${n}`, `props/${n}_glow`]),
  // level 2A's back road: the lorry, the cafe's terrace, two more signs
  ...['lorry', 'neon_sign_diner', 'neon_sign_cafe'].flatMap((n) => [`props/${n}`, `props/${n}_glow`]),
  ...['awning', 'parasol', 'planter'].map((n) => `props/${n}`),
  ...['mag_pistol', 'mag_uzi', 'mag_rifle', 'mag_sniper', 'shells_box', 'ammo_9mm', 'ammo_12g', 'ammo_762', 'ammo_rocket',
    'pistol_bare', 'uzi_bare', 'uzi_silenced_bare', 'rifle_bare', 'sniper_bare',
    // what the player's melee weapons break into (data/weapons.js parts)
    'bat_head', 'bat_handle', 'knife_blade', 'knife_handle'].map((n) => `weapons/${n}`),
  // rag_*_up: torso and head of a body lying on its back; rag_torso_down: its back, when it lies on its belly (Ragdoll)
  ...CHARACTERS.flatMap((c) => ['rag_torso', 'rag_head', 'rag_arm', 'rag_leg', 'rag_torso_up', 'rag_head_up', 'rag_torso_down'].map((p) => `characters/${c}_${p}`)),
  // small things in a guard's hands at his post, dropped or left about
  ...['butt', 'cigar', 'can', 'magazine', 'ashtray', 'bottle'].map((n) => `items/${n}`),
  // CUEBALL (level 1's boss): his head once he has been hit, his shades on the floor
  'characters/cueball_head_hurt', 'items/shades',
  // rooftops of the neighbouring buildings (painted on the wall layer)
  'tiles/roof',
  // the comic panels of the opening, of the leap's card and of level 1's ending (tools/generate_comic.py), painted
  // finer than the title they are drawn on
  ...['sleep', 'door', 'pry', 'box', 'count', 'pour', 'match_dark', 'match', 'fire', 'wake_shut', 'wake',
    'alley', 'drive', 'office', 'office_phone', 'matchbook',
    // one full-screen card a man, front on (the targets, for a screen between levels; the runner's for a menu)
    'target_cueball', 'target_lucky', 'target_jitters', 'target_boss', 'card_runner'].map((n) => `comic/${n}`),
  // the title's stills (tools/comic/title.py): the poster's three layers and the logo (ui/title/Poster.js), the hit
  // list's board and what is pinned to it, one per number of targets dead (ui/title/HitList.js)
  // and the options' table and what lies on it (ui/title/Options.js)
  ...['poster_sky', 'poster_city', 'poster_front', 'logo', 'logo_off', 'board_bg', 'board_0', 'board_1', 'board_2', 'board_3', 'board_4',
    'options_bg', 'options_things']
    .map((n) => `title/${n}`),
  ...['ac_unit', 'vent', 'duct', 'hatch', 'chimney', 'tank', 'antenna', 'bulkhead', 'skylight', 'skylight_tv', 'skylight_dark',
    'bulkhead_glow', 'skylight_glow', 'skylight_tv_glow'].map((n) => `roof/${n}`),
];

// Sprites painted finer than the world (1 sprite px = 1 world px everywhere else): world px per sprite px, by name.
// The standing characters and the weapons are painted at twice the density (tools/generate_assets.py FINE), still
// plain pixel art. An image carries its
// own (`img.k`); drawSprite and the derived canvases honour it, raw drawImage callers must scale by it.
// (a kind's name has no underscore: `thug_torso` and `thug_head` are fine, `thug_rag_torso` and `thug_gib_head` are not)
// (a magazine gun's `_bare` sprite, its magazine out, and the magazines themselves too; the pieces a weapon breaks into)
const FINE = /^(characters\/[a-z0-9]+_(torso|head|head_hurt|scarf|tail_l|tail_r)|weapons\/((pistol|uzi|uzi_silenced|shotgun|rifle|sniper|bazooka|bat|knife|cue|cue_half|tire_iron|tire_iron_bent|bat_head|bat_handle|knife_blade|knife_handle)(_bare)?|mag_(pistol|uzi|rifle|sniper)))$/;
// the furniture, the street's dressing and the vehicles (and their emissive maps), painted at the same density
// (generate_assets.py FINE_PROPS), the lamps' fittings too; the neon signs, neon tubes and party bulbs stay at the world's
const FINE_PROPS = new Set(['alarm_box', 'apt_door', 'arcade', 'armchair', 'back_bar', 'bar_counter', 'barrel', 'bed', 'bench',
  'bike', 'bin_bag', 'bookshelf', 'bottle_shelf', 'car', 'car2', 'van', 'car_tire', 'car_hood', 'car_door', 'car2_hood',
  'car2_door', 'van_hood', 'van_door', 'convertible', 'convertible_hood', 'convertible_door', 'boss_hat', 'pursuer', 'pursuer_hood', 'pursuer_door', 'card_table', 'card_table_flipped', 'cardboard_bed', 'cash_case', 'ceiling_fan',
  'chain_fence', 'chair', 'crate', 'dance_stage', 'desk', 'dj_booth', 'doormat', 'dope_table', 'dumpster', 'extinguisher',
  'floor_hole', 'fridge', 'laundry_basket', 'fuse_box', 'gas_bottle', 'hydrant', 'jerrycan', 'jukebox', 'ladder', 'manhole', 'mirror_ball',
  'news_box', 'newspaper', 'oven', 'palm_tree', 'parapet', 'parking_meter', 'phone_booth', 'pipe_steam', 'pipe_water', 'plant',
  'parking_bay', 'velvet_rope', 'entry_carpet', 'pool_table', 'radiator', 'road_edge', 'runner', 'shoes', 'sink', 'sofa', 'speaker', 'stairs', 'stall', 'streetlight', 'table',
  'table_flipped', 'table_round', 'table_round_flipped', 'toilet', 'trash_can', 'tv', 'urinal', 'vending', 'wall_vent', 'washer',
  'floor_lamp', 'table_lamp', 'wall_lamp', 'tube_light', 'ceiling_lamp', 'pool_lamp', 'emergency_light',
  'keg', 'fire_alarm', 'trapdoor', 'rug', 'beer_tap', 'curtain', 'trash_can_down', 'bin_lid', 'sandwich_board', 'ash_urn', 'entry_mat',
  'frame_photo', 'frame_gold', 'poster_fight', 'poster_band', 'dartboard', 'pay_phone', 'coat_hooks', 'towel_dispenser',
  'poster_pinup', 'poster_revue', 'mirror_strip', 'cocktail_table', 'conduit', 'flyers', 'tag',
  'lorry', 'awning', 'parasol', 'planter']);
// the plant on the neighbouring roofs too (generate_assets.py ROOF_FINE; the lit pieces stay at the world's)
const ROOF_FINE = new Set(['ac_unit', 'vent', 'duct', 'hatch', 'chimney', 'tank', 'antenna']);
// the floor tiles too (64 x 64 pixels a tile), the bar's clutter and the street fauna; the wall tops stay at the world's
// the door skins (generate_assets.py DOOR_SKINS) too; the old plain leaves (door, door_locked, stall_door) stay at the world's
const DOOR_SKINS = /^structure\/door_(fire|bar|bar_broken|swing|staff|office|gaming|flat|wired|wired_broken|shop|shop_broken)$/;
const fine = (name) => FINE.test(name) || DOOR_SKINS.test(name) || name.startsWith('critters/') || name.startsWith('clutter/')
  || (name.startsWith('props/') && FINE_PROPS.has(name.slice(6).replace(/_glow$/, '')))
  || (name.startsWith('roof/') && ROOF_FINE.has(name.slice(5)))
  || (name.startsWith('tiles/') && FLOOR_TILES.includes(name.slice(6).replace(/_(v[1-5]|glow)$/, '')));
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
