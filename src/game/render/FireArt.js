// The flames of what burns (systems/Fires.js lit()): on each fire a bed of embers on the floor and a few tongues of
// flame over it, flat squares in the colours of the fire particles (fx/Particles.js), flickering in steps: pixel
// art, no gradient, nothing stored (a tongue's place and its height at each beat are hashed from where its fire is).
// The loose puffs and embers that rise off them are particles (Fires.update); this is what makes a floor burning
// read as a sheet of fire and not as confetti.
const BED = '#7e1a0c', LOW = '#d8401a', MID = '#ff8a1e', TOP = '#ffd040', HOT = '#fff6cf';
const BEAT = 11;         // flickers a second
const TONGUES = 3;       // a fire (5 on a piece of furniture burning)
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// vis(x, y): is that point in view; t: the world's time
export function drawFlames(ctx, fires, t, vis) {
  if (!fires.length) return;
  const beat = Math.floor(t * BEAT), seen = [];
  for (const f of fires) if (vis(f.x, f.y)) seen.push(f);
  if (!seen.length) return;
  const sq = (x, y, s) => ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  const grow = (f) => Math.min(1, 0.3 + f.age / 1.2) * Math.sqrt(f.k);
  ctx.save();
  // the bed: what burns, glowing through
  ctx.fillStyle = BED;
  ctx.globalAlpha = 0.5;
  for (const f of seen) { const s = Math.round(15 * grow(f)); ctx.fillRect(Math.round(f.x - s / 2), Math.round(f.y - s / 2), s, s); }
  ctx.globalAlpha = 1;
  // the tongues, colour by colour from their foot up (they lean and rise toward the top of the picture)
  for (let layer = 0; layer < 4; layer++) {
    ctx.fillStyle = [LOW, MID, TOP, HOT][layer];
    for (const f of seen) {
      const g = grow(f), n = f.k > 1 ? TONGUES + 2 : TONGUES;
      for (let j = 0; j < n; j++) {
        const seed = hash(f.x + j * 17.3, f.y - j * 5.1), ph = hash(seed * 91.7 + j, beat + Math.floor(seed * 7));
        const ox = f.x + (hash(seed, 1) - 0.5) * 15 * g, oy = f.y + (hash(seed, 2) - 0.5) * 11 * g;
        const h = (4 + 9 * ph) * g, lean = (hash(seed, beat) - 0.5) * 3;
        if (layer === 0) sq(ox, oy, Math.max(3, Math.round(7 * g)));
        else if (layer === 1) sq(ox + lean * 0.5, oy - h * 0.45, Math.max(2, Math.round(5 * g)));
        else if (layer === 2) { if (ph > 0.25) sq(ox + lean, oy - h, Math.max(2, Math.round(3 * g))); }
        else if (ph > 0.7) sq(ox, oy - h * 0.2, 2);
      }
    }
  }
  ctx.restore();
}
