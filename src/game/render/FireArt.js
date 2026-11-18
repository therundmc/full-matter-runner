// The flames of what burns (systems/Fires.js lit()): on each fire a bed of embers on the floor and a few tongues of
// flame over it, flat squares in the colours of the fire particles (fx/Particles.js), flickering in steps: pixel
// art, no gradient (a tongue's place and its height at each beat are hashed from where its fire is, kept till the
// next beat: tonguesOf).
// The loose puffs and embers that rise off them are particles (Fires.update); this is what makes a floor burning
// read as a sheet of fire and not as confetti.
import { shown } from '../fx/Particles.js';

const BED = '#7e1a0c', LOW = '#d8401a', MID = '#ff8a1e', TOP = '#ffd040', HOT = '#fff6cf';
const BEAT = 11;         // flickers a second
const TONGUES = 3;       // a fire (5 on a piece of furniture burning)
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// A fire's tongues as hashed: where each stands (from where its fire is) and, for the current beat, its height and
// lean. Kept per fire and worked out again only when the beat or the fire's place changes (the hashes are what most
// of the drawing cost, four layers over every tongue of every fire, every frame).
const TONGUE = new WeakMap(); // fire -> { x, y, n, beat, seed, dx, dy, ph, lean }
function tonguesOf(f, beat) {
  const n = f.k > 1 ? TONGUES + 2 : TONGUES;
  let T = TONGUE.get(f);
  if (!T || T.x !== f.x || T.y !== f.y || T.n !== n) {
    T = { x: f.x, y: f.y, n, beat: null, seed: new Float64Array(n), dx: new Float64Array(n), dy: new Float64Array(n), ph: new Float64Array(n), lean: new Float64Array(n) };
    for (let j = 0; j < n; j++) {
      const seed = (T.seed[j] = hash(f.x + j * 17.3, f.y - j * 5.1));
      T.dx[j] = hash(seed, 1) - 0.5; T.dy[j] = hash(seed, 2) - 0.5;
    }
    TONGUE.set(f, T);
  }
  if (T.beat !== beat) {
    T.beat = beat;
    for (let j = 0; j < n; j++) {
      const seed = T.seed[j];
      T.ph[j] = hash(seed * 91.7 + j, beat + Math.floor(seed * 7));
      T.lean[j] = (hash(seed, beat) - 0.5) * 3;
    }
  }
  return T;
}

// vis(x, y): is that point in view; t: the world's time
export function drawFlames(ctx, fires, t, vis) {
  if (!fires.length) return;
  const beat = Math.floor(t * BEAT), seen = [], R = shown(ctx);
  for (const f of fires) {
    // left out when nothing it draws can reach the picture (its tongues stay within 20 px a side at full size)
    const m = 8 + 40 * Math.sqrt(f.k);
    if (vis(f.x, f.y) && f.x > R[0] - m && f.x < R[2] + m && f.y > R[1] - m && f.y < R[3] + m) seen.push(f);
  }
  if (!seen.length) return;
  const sq = (x, y, s) => ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  const grow = (f) => Math.min(1, 0.3 + f.age / 1.2) * Math.sqrt(f.k);
  const gs = seen.map(grow), ts = seen.map((f) => tonguesOf(f, beat));
  ctx.save();
  // the bed: what burns, glowing through
  ctx.fillStyle = BED;
  ctx.globalAlpha = 0.5;
  seen.forEach((f, i) => { const s = Math.round(15 * gs[i]); ctx.fillRect(Math.round(f.x - s / 2), Math.round(f.y - s / 2), s, s); });
  ctx.globalAlpha = 1;
  // the tongues, colour by colour from their foot up (they lean and rise toward the top of the picture)
  for (let layer = 0; layer < 4; layer++) {
    ctx.fillStyle = [LOW, MID, TOP, HOT][layer];
    for (let i = 0; i < seen.length; i++) {
      const f = seen[i], g = gs[i], T = ts[i], n = T.n;
      for (let j = 0; j < n; j++) {
        const ph = T.ph[j];
        const ox = f.x + T.dx[j] * 15 * g, oy = f.y + T.dy[j] * 11 * g;
        const h = (4 + 9 * ph) * g, lean = T.lean[j];
        if (layer === 0) sq(ox, oy, Math.max(3, Math.round(7 * g)));
        else if (layer === 1) sq(ox + lean * 0.5, oy - h * 0.45, Math.max(2, Math.round(5 * g)));
        else if (layer === 2) { if (ph > 0.25) sq(ox + lean, oy - h, Math.max(2, Math.round(3 * g))); }
        else if (ph > 0.7) sq(ox, oy - h * 0.2, 2);
      }
    }
  }
  ctx.restore();
}
