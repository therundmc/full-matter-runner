// What lives and moves in the title scene, besides the rain and the sign: the doorman and his cigarette, the cable
// across the street with its sneakers, the canopy's valance, the palm's fronds, a cat on a sill, a rat, a pigeon,
// a plastic bag caught on the fire escape, a newspaper the gusts tumble down the street, smoke and steam in the wind.
// Painters into the bar row's layer canvas take layer coords (+M, +MY); the others draw on the screen context with
// the offset of their parallax layer.
import { M, MY, GY, ROAD, LW, canvas, rowF } from './Draw.js';
import { hash, clamp, smooth } from './Timeline.js';
import { DOORMAN, CAT, ROOF } from './Layout.js';

// ---------------------------------------------------------------- the doorman
// a big man in a dark jacket against the wall, a foot up on it, smoking. Lit from above by the bulbs of the arrow
// (amber), from the left by the letters (pink), a touch of the glass on his right (cyan). Poses: hand down / at the
// mouth, standing / hunched into his collar with his face turned from a strong gust.
const INK = {
  k: '#0b070b', d: '#1b111a', m: '#2c1a28', p: '#d04884', q: '#7a2a5a', a: '#f0aa58', b: '#8a5a30', c: '#3a8696',
  h: '#120a0c', s: '#3a2420', S: '#7a4a36', j: '#1a1c2c', J: '#2e3046', B: '#060406', w: '#e8e0d8', o: '#5a5a66',
};
const BODY = [
  '......abba......',
  '.....ahhhhb.....',
  '.....qhhhhh.....',
  '.....qSsssh.....',
  '.....qSsss......',
  '......Sss.......',
  '......ksk.......',
  '...abbdddddba...',
  '..pqddmdddmddc..',
  '..pdddmdddmdddc.',
  '.pqdddmdddmdddc.',
  '.pqddddddddddd..',
  '.pqddmdoddddmd..',
  '.pqddmdddddddd..',
  '.pqddmmmmmmmdd..',
  '.pq.dkjjjjjjkd..',
  '.pq.jjjjjjjjjj..',
  '.qSSjjjjjjjjjj..',
  '....jJjjj.jjJj..',
  '....jJjj..jjJjj.',
  '....jJjj..jjJjj.',
  '....jJjj...jJjj.',
  '....jJjj...jjJj.',
  '....jJjj...jjj..',
  '....jJjj..BBB...',
  '....jJjj..BB....',
  '....jJjj........',
  '....jJjj........',
  '...BBBBBB.......',
  '..kkkkkkkk......',
];
// the right arm, hand down with the cigarette / up at the mouth; [x, y, ink]
const ARM_DOWN = [[13, 8, 'd'], [14, 9, 'c'], [13, 9, 'd'], [13, 10, 'd'], [14, 10, 'c'], [13, 11, 'd'], [14, 11, 'c'], [13, 12, 'd'],
  [14, 12, 'c'], [13, 13, 'd'], [14, 13, 'c'], [13, 14, 'd'], [14, 14, 'd'], [13, 15, 'd'], [14, 15, 'd'], [13, 16, 'd'], [14, 16, 'd'],
  [13, 17, 'S'], [14, 17, 'S'], [14, 18, 'w']];
const ARM_UP = [[13, 8, 'd'], [13, 9, 'd'], [14, 9, 'c'], [13, 10, 'd'], [14, 10, 'c'], [13, 11, 'd'], [13, 12, 'd'], [12, 11, 'd'], [12, 10, 'm'], [11, 9, 'd'], [11, 8, 'm'], [10, 7, 'd'], [10, 6, 'S'], [9, 6, 'S'], [10, 5, 'S'], [11, 5, 'w']];
const EMBER = { down: [15, 18], up: [12, 5] };
function sprite(up, hunch) {
  const { c, g } = canvas(16, 30);
  const at = (x, y, k) => { if (k !== '.') { g.fillStyle = INK[k]; g.fillRect(x, y, 1, 1); } };
  BODY.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      // hunched: the head sunk one pixel into the collar
      at(x, y, hunch && y < 7 ? (y === 0 ? '.' : BODY[y - 1][x]) : row[x]);
    }
  });
  if (hunch) { at(5, 6, 'd'); at(9, 6, 'd'); at(5, 5, 'b'); at(9, 5, 'm'); }
  for (const [x, y, k] of (up ? ARM_UP : ARM_DOWN)) at(x, y + (hunch && up && y < 8 ? 1 : 0), k);
  return c;
}
export function buildDoorman() {
  return { down: sprite(false, false), up: sprite(true, false), downH: sprite(false, true), upH: sprite(true, true) };
}
// into the bar row: he draws on his cigarette every few seconds; returns where the ember is and if it glows hot
export function drawDoorman(g, sprites, t, wind) {
  const cyc = t % 7.5, up = cyc > 5 && cyc < 6.6, draw = cyc > 5.3 && cyc < 6.4, hunch = wind.gust > 0.6;
  g.drawImage(sprites[(up ? 'up' : 'down') + (hunch ? 'H' : '')], DOORMAN.x + M, DOORMAN.y + MY);
  const [ex, ey] = up ? EMBER.up : EMBER.down;
  const ember = { x: DOORMAN.x + ex, y: DOORMAN.y + ey + (hunch && up ? 1 : 0), draw, up };
  g.fillStyle = draw ? '#ffd27a' : '#ff5a2a';
  g.fillRect(ember.x + M, ember.y + MY, 1, 1);
  if (draw) {    // the ember lights his face from below
    g.fillStyle = 'rgba(255,120,50,0.55)';
    g.fillRect(DOORMAN.x + 7 + M, DOORMAN.y + 4 + MY, 3, 2); g.fillRect(DOORMAN.x + 9 + M, DOORMAN.y + 6 + MY, 2, 1);
  }
  return ember;
}

// ---------------------------------------------------------------- bar row, live
// the cable across the street sags and sways; the sneakers thrown over it swing (pushed left by the gusts)
export function drawCable(g, t, wind) {
  const sway = Math.sin(t * 1.3) * (0.4 + wind.gust * 1.4) + wind.gust * 1.5;
  g.fillStyle = '#0a0610';
  let shoe = null;
  for (let x = 102; x <= 316; x++) {
    const k = (x - 102) / 214, wave = Math.sin(k * Math.PI) * (sway + Math.sin(t * 3.1 - k * 6) * wind.gust * 0.8);
    const y = Math.round(52 + k * 6 + Math.sin(k * Math.PI) * 7 + wave);
    g.fillRect(x + M, y + MY, 1, 1);
    if (x === 138) shoe = y;
  }
  const a = -0.35 * wind.gust - 0.12 * wind.breeze + Math.sin(t * 2.2) * (0.08 + 0.2 * wind.gust);
  const ex = 138 + Math.sin(a) * 5, ey = shoe + Math.cos(a) * 5;
  g.fillStyle = '#0a0610';
  for (let i = 1; i < 5; i++) { g.fillRect(Math.round(138 + Math.sin(a) * i) - 1 + M, Math.round(shoe + Math.cos(a) * i) + MY, 1, 1); g.fillRect(Math.round(138 + Math.sin(a + 0.25) * i) + 1 + M, Math.round(shoe + Math.cos(a + 0.25) * i) + MY, 1, 1); }
  g.fillStyle = '#b8b0b8'; g.fillRect(Math.round(ex) - 3 + M, Math.round(ey) + MY, 3, 2);
  g.fillStyle = '#a8a0a8'; g.fillRect(Math.round(ex) + 1 + M, Math.round(ey) + 1 + MY, 3, 2);
  g.fillStyle = '#802040'; g.fillRect(Math.round(ex) - 3 + M, Math.round(ey) + 1 + MY, 1, 1);
}
// the canopy's scalloped valance flapping
export function drawValance(g, t, wind) {
  const k = 0.25 * wind.breeze + wind.gust;
  for (let x = 171; x < 221; x++) {
    const j = Math.floor((x - 171) / 3), lift = Math.round(clamp(Math.sin(t * 13 + j * 0.9) * k * 1.3 + Math.sin(t * 4 + j * 0.5) * k * 0.6, -1, 1));
    g.fillStyle = '#2e0e1e'; g.fillRect(x + M, 107 + MY, 1, 2);
    if ((x - 171) % 3 < 2) { g.fillRect(x + M, 109 + lift + MY, 1, 1); if (lift < 0) g.fillRect(x + M, 109 + MY, 1, 1); }
    g.fillStyle = '#5a2232'; if ((x - 171) % 3 < 2) g.fillRect(x + M, 110 + Math.min(0, lift) + MY, 1, 1);
  }
}
// a cat on the sill of the lit window next door, its tail hanging and flicking; it turns its head now and then
export function drawCat(g, t) {
  const x = CAT.x + M, y = CAT.y + MY, look = Math.sin(t * 0.23) > 0.75 ? 1 : 0;
  g.fillStyle = '#07050a';
  g.fillRect(x + 1, y - 6, 4, 6); g.fillRect(x, y - 4, 6, 4); g.fillRect(x + 1 + look, y - 9, 3, 3);
  g.fillRect(x + 1 + look, y - 10, 1, 1); g.fillRect(x + 3 + look, y - 10, 1, 1);
  if (Math.sin(t * 1.7) > 0.96) g.fillRect(x + 2 + look, y - 11, 1, 1);          // an ear twitch
  const flick = t % 3.7 < 0.5 ? Math.sin((t % 3.7) / 0.5 * Math.PI * 2) : 0;
  for (let i = 0; i < 6; i++) g.fillRect(x + Math.round(Math.sin(i * 0.5) * 1.5 + flick * i * 0.5), y + i, 1, 1);
  g.fillStyle = '#c8a050'; g.fillRect(x + 2 + look * 2, y - 8, 1, 1);             // an eye catching the window
}
// a rat runs along the foot of the wall into the alley now and then, with a stop to sniff
export function drawRat(g, t) {
  const per = 17, a = t % per - 8;
  if (a < 0 || a > 1.8) return;
  const x = a < 0.5 ? 230 + a * 48 : a < 0.9 ? 254 : 254 + (a - 0.9) * 56;
  if (x > 304) return;
  const run = a < 0.5 || a > 0.9, step = Math.floor(t * 20) % 2, X = Math.round(x) + M, Y = GY - 2 + MY;
  g.fillStyle = '#2a1e20'; g.fillRect(X, Y, 4, 2); g.fillRect(X + 4, Y + (run ? 0 : 1), 1, 1);
  g.fillStyle = '#7a5a5e'; g.fillRect(X + 1, Y, 3, 1);                        // wet fur catching the light
  g.fillStyle = '#ff9a7a'; g.fillRect(X + 4, Y + (run ? 0 : 1), 1, 1);        // an eye
  g.fillStyle = '#5a3a40'; g.fillRect(X - 3, Y + 1, 3, 1);
  if (run) { g.fillStyle = '#1a1214'; g.fillRect(X + (step ? 0 : 3), Y + 2, 1, 1); }
}
// a pigeon huddled on the ledge under the fire escape: it turns its head, ruffles in the gusts
export function drawPigeon(g, t, wind) {
  const x = 74 + M, y = 97 + MY, puff = wind.gust > 0.5 ? 1 : 0, turn = Math.sin(t * 0.6) > 0.3 ? 1 : 0;
  g.fillStyle = '#4a4656'; g.fillRect(x - puff, y - puff, 5 + puff, 3 + puff);
  g.fillStyle = '#6a6676'; g.fillRect(x + 1, y - puff, 3, 1);
  g.fillStyle = '#3a3646'; g.fillRect(x + (turn ? 4 : 0), y - 2, 2, 2);
  g.fillStyle = '#3a6a5a'; g.fillRect(x + (turn ? 4 : 1), y, 1, 1);
  g.fillStyle = '#2a2632'; g.fillRect(x + 1, y + 3, 3, 1);
}
// a white plastic bag caught on the lower fire escape, streaming and snapping in the wind
export function drawBag(g, t, wind) {
  const k = 0.3 + wind.speed, f = Math.floor(t * (4 + 10 * k)) % 3, lift = Math.round(wind.gust * 2);
  const x = 30 + M, y = 86 + MY;
  g.fillStyle = '#7a7488'; g.fillRect(x, y, 1, 2);
  g.fillStyle = '#b8b0c4';
  if (f === 0) { g.fillRect(x - 4, y - lift, 4, 3); g.fillRect(x - 6, y + 1 - lift, 2, 2); }
  else if (f === 1) { g.fillRect(x - 5, y - lift, 5, 2); g.fillRect(x - 7, y - 1 - lift, 2, 2); }
  else { g.fillRect(x - 4, y + 1 - lift, 4, 3); g.fillRect(x - 5, y - lift, 2, 1); }
  g.fillStyle = '#8a8498'; g.fillRect(x - 3, y + 2 - lift, 3, 1);
}

// ---------------------------------------------------------------- mid row, live: the palm's fronds whip
const FRONDS = [-168, -140, -112, -84, -58, -30, -6, 186, 150];
export function drawFronds(ctx, t, wind, ox, oy) {
  const push = 0.25 * wind.breeze + wind.gust, dot = (x, y, h = 1) => ctx.fillRect(Math.round(x) + ox, Math.round(y) + oy, 1, h);
  FRONDS.forEach((deg, f) => {
    const a = deg * Math.PI / 180, L = 15 + Math.abs(Math.cos(a)) * 4, n = 16;
    const flut = Math.sin(t * (6 + f * 0.7) + f * 2) * (0.25 + 0.75 * push);
    for (let i = 1; i <= n; i++) {
      const k = i / n, bend = k * k;
      const x = 305 + Math.cos(a) * L * k - push * 9 * bend + flut * 1.2 * bend;
      const y = 38 + Math.sin(a) * L * k + 9 * bend * (1 - 0.5 * push) + flut * bend + push * 2 * bend * Math.cos(a);
      ctx.fillStyle = '#0b0412';
      dot(x, y);
      if (i > 2) dot(x, y + 1, Math.max(1, Math.round(3 * (1 - k))));
      if (i < n - 3 && Math.sin(a) < 0.3) { ctx.fillStyle = '#3a1442'; dot(x, y - 1); }
    }
  });
  ctx.fillStyle = '#0b0412'; ctx.fillRect(303 + ox, 37 + oy, 4, 3);
}

// ---------------------------------------------------------------- screen, live
// cigarette smoke, curling up, bent and torn by the wind
export function drawSmoke(ctx, t, wind, bx, by) {
  const torn = 1 - 0.65 * wind.gust;
  for (let i = 0; i < 14; i++) {
    const age = (t % 0.32) + i * 0.32, birth = t - age, ph = ((birth % 7.5) + 7.5) % 7.5;
    const wasUp = ph > 5 && ph < 6.6, puff = ph > 6.6 && ph < 7.2 ? 1 : 0;
    const x0 = DOORMAN.x + (wasUp ? EMBER.up[0] : EMBER.down[0]), y0 = DOORMAN.y + (wasUp ? EMBER.up[1] : EMBER.down[1]) - 1;
    const x = x0 + Math.sin(age * 2.2 + i) * age * 2.2 * torn - wind.speed * age * age * 5 - age * 2, y = y0 - age * 7 * torn - puff * age * 2;
    const a = Math.max(0, 1 - age / (4.4 * torn)) * (0.14 + puff * 0.14);
    if (a <= 0.005) continue;
    ctx.fillStyle = `rgba(214,190,226,${a.toFixed(3)})`;
    ctx.fillRect(Math.round(x) + bx, Math.round(y) + by, 1 + (age > 2 ? 1 : 0) + puff, 1 + puff);
  }
}
// soft puffs (steam) from the vent stack on the bar's roof, blown left
export function drawSteam(ctx, puffSprite, t, wind, bx, by) {
  ctx.imageSmoothingEnabled = true;
  const torn = 1 - 0.45 * wind.gust;
  for (let i = 0; i < 8; i++) {
    const life = 3, age = (t + i * life / 8) % life, k = age / life, s = 3 + k * 12;
    const x = 290 - wind.speed * age * 16 - age * 2 + Math.sin(age * 2 + i) * k * 2, y = ROOF - 13 - age * 5;
    ctx.globalAlpha = (1 - k) * Math.min(1, k * 6) * 0.45 * torn;
    ctx.drawImage(puffSprite, x - s / 2 + bx, y - s / 2 + by, s * 1.3, s * 0.8);
  }
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
}
// a newspaper sheet tumbling down the street in most gusts, a few scraps behind it; loose papers on the ground
export function drawPapers(ctx, t, wind, sx, sy) {
  const g = wind.last, age = t - g.start - 0.3;
  if (age > 0 && hash(g.k + 0.77) < 0.85) {
    const road = hash(g.k + 0.31) < 0.5, y0 = road ? ROAD + 16 + hash(g.k) * 20 : GY + 5 + hash(g.k) * 5;
    const speed = 130 + 50 * hash(g.k + 1.1), env = smooth(0, 0.4, age) * (1 - smooth(g.end - g.start - 0.6, g.end - g.start + 1.2, age + 0.3));
    [[0, 1], [12, 0.4], [-9, 0.3], [20, 0.25]].forEach(([lag, size], i) => {
      const a = age - Math.abs(lag) * 0.012, x = LW + 30 + lag - a * speed * (0.9 + 0.1 * i);
      if (x < -30 || x > LW + 30 || a < 0) return;
      const hop = Math.abs(Math.sin(a * (4 + i) + i)) * (5 + 6 * size) * env, y = y0 + i * 2 - hop, f = rowF(y0);
      const X = x + sx(f), Y = y + sy(f), turn = Math.cos(a * (8 + i * 3) + i);
      if (size < 1) { ctx.fillStyle = turn > 0 ? '#b8b0a8' : '#7a7470'; ctx.fillRect(Math.round(X), Math.round(Y), 2, 1); return; }
      // the sheet flips over as it tumbles: its width follows the turn, it bends when it lifts
      const w = 2 + Math.round(Math.abs(turn) * 9), h = 4 + Math.round(Math.abs(Math.sin(a * 5)) * 2), bend = hop > 3 ? 1 : 0;
      const px = Math.round(X), py = Math.round(Y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, Math.round(y0 + sy(f)) + 1, w + 1, 1);
      ctx.fillStyle = turn > 0 ? '#cfc6b8' : '#8a8478'; ctx.fillRect(px, py + bend, w, h - bend); ctx.fillRect(px + 1, py, w - 2, 1);
      if (w > 4) { ctx.fillStyle = '#5a5650'; ctx.fillRect(px + 1, py + 2, w - 3, 1); ctx.fillRect(px + 1, py + 4, w - 4, 1); }
      ctx.fillStyle = '#e8e0d4'; ctx.fillRect(px + (turn > 0 ? 0 : w - 1), py + bend, 1, h - bend);
    });
  }
  // the loose papers that stay: nudged, lifted a little in gusts
  [[124, 186, 0], [270, 174, 1.7]].forEach(([x0, y0, ph], i) => {
    const f = rowF(y0), push = (Math.sin(t * 0.5 + ph) * 0.5 + 0.5) * 3 - wind.gust * 6;
    const lift = wind.gust > 0.5 ? Math.round(Math.abs(Math.sin(t * 9 + ph)) * 1.5) : 0;
    const x = Math.round(x0 + push + sx(f)), y = Math.round(y0 - lift + sy(f));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 1, Math.round(y0 + 1 + sy(f)), 6, 1);
    ctx.fillStyle = i ? '#6e6878' : '#7c7482'; ctx.fillRect(x, y, 6, 2); ctx.fillRect(x + 1, y - 1, 4, 1);
    ctx.fillStyle = '#4e4858'; ctx.fillRect(x + (lift ? 4 : 1), y + (lift ? 0 : 1), 2, 1);
  });
}
