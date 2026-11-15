// What a burst skull leaves (canvas side of fx/Gore.js burstSkull): tiny pixel pieces of bone, scalp and brain thrown
// about, and the stains of what was inside on the floor or a wall. Drawn at the world's pixel size (a sprite px =
// a world px), built once per variant and cached.
const BITS = {
  bone: { tones: ['#ece2cc', '#d2c3a6', '#b8a688'], edge: '#7a1014' },
  scalp: { tones: ['#3a281c', '#2a1c14', '#4a3424'], edge: '#8c1418' },
  brain: { tones: ['#d6a2a0', '#c08886', '#a86e6e'], edge: '#781014' },
};
export const BIT_KINDS = Object.keys(BITS);
const VARIANTS = 4;
const bits = new Map();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a ragged little piece (2 to 5 px across) in its tones, bloodied along one side
export function skullBit(kind, variant = Math.floor(Math.random() * VARIANTS)) {
  const key = kind + (variant % VARIANTS);
  let c = bits.get(key);
  if (c) return c;
  const B = BITS[kind], rnd = rng(variant * 977 + kind.length * 131 + 5);
  const w = 2 + Math.floor(rnd() * 3), h = 2 + Math.floor(rnd() * 2);
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      if (corner && rnd() < 0.6) continue;
      g.fillStyle = y === h - 1 && rnd() < 0.7 ? B.edge : B.tones[Math.floor(rnd() * B.tones.length)];
      g.fillRect(x, y, 1, 1);
    }
  }
  bits.set(key, c);
  return c;
}

// What was inside, splashed: a few clumps of grey-pink matter in dark blood, flecks of bone, thrown toward +x.
// r = size class (px), cached per size class and variant.
const stains = new Map();
export function matterStain(r, variant = Math.floor(Math.random() * VARIANTS)) {
  const rr = Math.max(2, Math.round(r)), key = rr * 10 + (variant % VARIANTS);
  let c = stains.get(key);
  if (c) return c;
  const rnd = rng(key * 7919 + 3), n = rr * 4 + 4;
  c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), m = n / 2;
  const blot = (x, y, s, color) => {
    g.fillStyle = color;
    for (let i = 0; i < s * s * 1.6; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * s;
      g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.8), 1, 1);
    }
  };
  // the blood it came in, smeared along +x, then the clumps on it, then a few flecks of bone
  for (let i = 0; i < 5; i++) blot(m - rr * 0.3 + rnd() * rr * 1.6, m + (rnd() - 0.5) * rr * 1.2, rr * (0.5 + rnd() * 0.5), rnd() < 0.5 ? '#5a070b' : '#780b0f');
  for (let i = 0, k = 2 + Math.floor(rr / 2); i < k; i++) {
    const x = m - rr * 0.5 + rnd() * rr * 2.2, y = m + (rnd() - 0.5) * rr * 1.4, s = 0.8 + rnd() * rr * 0.28;
    blot(x, y, s, '#9a6464');
    blot(x - 0.4, y - 0.4, s * 0.6, rnd() < 0.5 ? '#c99090' : '#b47c7a');
  }
  g.fillStyle = '#e4d8c0';
  for (let i = 0; i < rr; i++) g.fillRect(Math.round(m - rr + rnd() * rr * 3), Math.round(m + (rnd() - 0.5) * rr * 1.6), 1, 1);
  stains.set(key, c);
  return c;
}
