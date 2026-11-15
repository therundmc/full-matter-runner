// What lives on the roofs across the avenue: the pigeons huddled on a parapet out of the wind (they bob and preen,
// and some trains scare them up: they wheel off and come back a while later), the steam of the roof vents and the
// smoke of the chimneys leaning in the wind, a man who came up on the roof for a smoke by the stair's door.
// All drawn on the screen context at the offset (ox, oy) of the near layer.
import { oval } from './Draw.js';
import { hash, trainSlot, TRAIN } from './Timeline.js';

// ---------------------------------------------------------------- the pigeons
const BIRDS = 5;
// where each sits on the ledge: two huddled together, the others spread out (fractions of the ledge)
const PERCH = [0.08, 0.13, 0.37, 0.71, 0.9];
const perchOf = (ledge, i) => ({ x: Math.round(ledge.x0 + PERCH[i] * (ledge.x1 - ledge.x0)), dir: hash(i * 1.7) < 0.5 ? -1 : 1 });
// where pigeon i is at t, relative to its perch: { dx, dy, fly (0 on the ledge, else the flap frame), hidden }
function pigeonAt(i, t) {
  const k = Math.floor(t / TRAIN.slot);
  for (const j of [k, k - 1]) {
    const s = trainSlot(j);
    if (hash(j * 2.9 + 0.3) > 0.6) continue;                        // not every train scares them
    const off = s.start + 0.3 + hash(i * 1.3 + j) * 0.5, back = off + 9 + i * 0.8, a = t - off;
    if (a < 0 || t > back + 1.8) continue;
    const side = hash(j + i * 0.7) < 0.5 ? -1 : 1, flap = Math.floor(t * 12 + i) % 2 + 1;
    if (a < 2.8) { const p = a / 2.8; return { dx: side * (p * 60 + p * p * 40), dy: -p * 34 + Math.sin(p * 9) * 2, fly: flap }; }
    if (t < back) return { hidden: true };
    const p = 1 - (t - back) / 1.8;                                  // coming back in from the other side, gliding
    return { dx: -side * p * 70, dy: -p * 26, fly: p > 0.15 ? flap : 1 };
  }
  return { dx: 0, dy: 0, fly: 0 };
}
export function drawPigeons(ctx, ledge, t, ox, oy) {
  if (!ledge) return;
  for (let i = 0; i < BIRDS; i++) {
    const p = perchOf(ledge, i), s = pigeonAt(i, t);
    if (s.hidden) continue;
    const x = Math.round(p.x + s.dx + ox), y = Math.round(ledge.y + s.dy + oy), d = p.dir;
    if (s.fly) {
      ctx.fillStyle = '#6a6878'; ctx.fillRect(x - 1, y - 2, 3, 1);
      ctx.fillStyle = '#8a889a';
      if (s.fly === 1) { ctx.fillRect(x - 3, y - 3, 2, 1); ctx.fillRect(x + 2, y - 3, 2, 1); }
      else { ctx.fillRect(x - 3, y - 1, 2, 1); ctx.fillRect(x + 2, y - 1, 2, 1); }
      continue;
    }
    // on the ledge: body, the darker wing, the head (bobbing, or turned into its back to preen), the neck's sheen
    const bob = hash(Math.floor(t * 2.2) + i * 5.3), preen = hash(Math.floor(t / 3) + i * 1.9) < 0.2;
    ctx.fillStyle = '#5c5a6a'; ctx.fillRect(x - 1, y - 2, 4, 2);
    ctx.fillStyle = '#44424f'; ctx.fillRect(x - 1, y - 2, 3, 1);
    ctx.fillStyle = '#3a3846'; ctx.fillRect(d > 0 ? x - 2 : x + 3, y - 2, 1, 1);
    const hx = preen ? x + (d > 0 ? 0 : 1) : d > 0 ? x + 3 + (bob > 0.8 ? 1 : 0) : x - 2 - (bob > 0.8 ? 1 : 0);
    const hy = preen ? y - 3 : y - 3 + (bob > 0.8 ? 1 : 0);
    ctx.fillStyle = '#7c7a8c'; ctx.fillRect(hx, hy, 1, 1);
    ctx.fillStyle = '#4a6a62'; ctx.fillRect(d > 0 ? x + 2 : x - 1, y - 2, 1, 1);
  }
}

// ---------------------------------------------------------------- steam and smoke
// puffs rising from (x, y), growing, leaning with the wind, in flat steps of fading
export function plume(ctx, x, y, t, wind, seed, col, rise, n = 7) {
  for (let j = 0; j < n; j++) {
    const p = (t * 0.32 * (1 + hash(seed) * 0.4) + j / n + hash(seed + j * 0.1) * 0.05) % 1;
    const lean = (0.4 + wind.speed * 1.8) * p * p * 22, wob = Math.sin(t * 1.3 + j + seed) * p * 2;
    const r = 1 + p * 4, a = p < 0.25 ? 0.2 : p < 0.55 ? 0.13 : p < 0.8 ? 0.07 : 0.035;
    oval(ctx, `rgba(${col},${a})`, x - lean + wob, y - p * rise, r * 1.3, r);
  }
}
export function drawVapours(ctx, vents, chimneys, t, wind, ox, oy) {
  vents.forEach((v, i) => plume(ctx, v.x + ox, v.y + oy, t, wind, i * 3.7 + 1, '170,150,190', 16 * v.k));
  chimneys.forEach((c, i) => plume(ctx, c.x + ox, c.y + oy, t * 0.8, wind, i * 5.1 + 9, '90,76,96', 18, 6));
}

// ---------------------------------------------------------------- the smoker
// a man in a dark coat by the stair's door, under its bulb; the cigarette going to his mouth now and then
export function drawSmoker(ctx, x, y, t, wind) {
  const drag = (t % 7.3) / 7.3, up = drag > 0.62 && drag < 0.78;
  ctx.fillStyle = '#120c10'; ctx.fillRect(x, y - 6, 3, 6);                        // coat
  ctx.fillStyle = '#2a1e1e'; ctx.fillRect(x, y - 6, 3, 1);                        // the bulb on his shoulders
  ctx.fillStyle = '#3a2a24'; ctx.fillRect(x + 1, y - 8, 2, 2);                    // head
  ctx.fillStyle = '#6a4a38'; ctx.fillRect(x + 1, y - 8, 1, 1);
  const ex = up ? x + 3 : x + 4, ey = up ? y - 7 : y - 4, glow = up ? 1 : 0.45 + 0.2 * Math.sin(t * 3);
  ctx.fillStyle = '#1a1214'; ctx.fillRect(x + 3, up ? y - 6 : y - 4, 1, up ? 2 : 1);   // his arm
  ctx.fillStyle = `rgba(255,${Math.round(110 + 80 * glow)},40,${(0.6 + 0.4 * glow).toFixed(2)})`; ctx.fillRect(ex, ey, 1, 1);
  // what he breathes out after the drag, and the thread from the tip
  const after = (drag - 0.78) / 0.15;
  if (after > 0 && after < 1) oval(ctx, `rgba(190,180,200,${(0.16 * (1 - after)).toFixed(3)})`, x + 4 - after * 6 * (0.5 + wind.speed), y - 8 - after * 4, 1 + after * 3, 1 + after * 2);
  for (let i = 0; i < 5; i++) {
    const k = i / 5;
    ctx.fillStyle = `rgba(190,180,200,${(0.16 * (1 - k)).toFixed(3)})`;
    ctx.fillRect(Math.round(ex - k * 8 * (0.4 + wind.speed) + Math.sin(t * 2 + i) * k), Math.round(ey - 1 - i * 1.5), 1, 1);
  }
}
