// Out of the tutorial's window: the building seen from across the alley, side on, in the rain. His flat burns on the
// top floor; he comes through the corridor's window in a burst of glass, falls, lands on his feet and rolls, comes up
// on one knee, looks back up at it, and walks out of the picture. Three weeks go by; level 1 opens on him in the alley.
// Pixel art at the title's logical resolution, painted with the opening's tools (Ink.js). leapView(t) is the timeline
// as plain numbers (unit-tested), drawLeap() the picture, leapBeats() what is heard; t: s since the scene began.
import { LW, LH } from '../title/Draw.js';
import { text } from '../Text.js';
import { clamp, smooth, lerp, hash, px, tone, poly, disc, line } from './Ink.js';

export const LEAP = {
  fall: 0.8,              // s from the window to the ground
  roll: [0.8, 1.35],      // the roll that takes the fall
  kneel: [1.35, 2.3],     // on one knee, looking back up at it
  walk: [2.3, 3.7],       // he gets up and goes
  later: 3.0,             // "THREE WEEKS LATER."
  fade: [3.9, 4.5],       // to black
  end: 4.7,
  skipAfter: 0.4,
  from: [168, 64],        // the window he comes out of (its sill), logical px
  land: 238,              // where his feet touch the ground
  line: 'THREE WEEKS LATER.',
};
const GY = 190;           // the alley's ground
const ROLL = 34;          // px the roll carries him
const C = { skin: '#dba274', hair: '#4a2e1c', coat: '#465062', coatD: '#343c4c', lining: '#2a5f6e', cap: '#2e323e', visor: '#22252e',
  jeans: '#3c4a66', jeansD: '#2c3850', boot: '#3a2a22', strap: '#8a5630', bag: '#7a4a28' };
let still = null, live = null, fig = null;

// where he is and how: { x, y (his feet, logical px), pose: 'fall' | 'ball' | 'kneel' | 'stand' | 'walk', spin (rad),
// step (0/1), fade (0..1 to black), words (letters of LEAP.line shown), over }
export function leapView(t, L = LEAP) {
  const [x0, y0] = L.from, out = { fade: clamp((t - L.fade[0]) / (L.fade[1] - L.fade[0]), 0, 1), over: t >= L.end, spin: 0, step: 0,
    words: t >= L.later ? Math.floor((t - L.later) * 22) : 0 };
  if (t < L.fall) {
    const k = t / L.fall;
    return { ...out, pose: 'fall', x: lerp(x0, L.land, k), y: y0 - 14 * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k) + (GY - y0) * k * k, spin: -0.5 + k * 0.6 };
  }
  if (t < L.roll[1]) {
    const k = (t - L.roll[0]) / (L.roll[1] - L.roll[0]);
    return { ...out, pose: 'ball', x: L.land + ROLL * smooth(k), y: GY, spin: k * Math.PI * 2 };
  }
  const x = L.land + ROLL;
  if (t < L.kneel[1]) return { ...out, pose: 'kneel', x, y: GY };
  const k = (t - L.walk[0]) / (L.walk[1] - L.walk[0]);
  if (k < 0.2) return { ...out, pose: 'stand', x, y: GY };
  return { ...out, pose: 'walk', x: x + (k - 0.2) * 150, y: GY, step: Math.floor((k - 0.2) * 9) % 2 };
}

// what is heard between t0 and t1 (s into the scene): [{ name, vol, opts }] for Audio.play
export function leapBeats(t0, t1, L = LEAP) {
  const w = L.walk, cues = [
    [0.02, 'glass', 0.9], [0.3, 'crackle', 1], [L.roll[0], 'bodyFall', 1], [L.roll[1] - 0.05, 'rollUp', 1],
    ...[0.3, 0.5, 0.7, 0.9].map((k) => [lerp(w[0], w[1], k), 'step', 0.8, { floor: 'concrete' }]),
  ];
  return cues.filter(([at]) => t0 < at && t1 >= at).map(([, name, vol, opts]) => ({ name, vol, opts: opts || {} }));
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

// ---------------------------------------------------------------- what never moves
const WINS = [[30, 30], [80, 30], [30, 104], [80, 104], [130, 104]];   // the facade's windows [x, y], 22 x 26
const HIS = [[30, 30], [80, 30]];                                        // his flat's, burning

function paintStill(g) {
  // the sky over the roofs, the far towers
  px(g, '#120c22', 0, 0, LW, LH);
  tone(g, '#1c1232', 0, 0, LW, 90, 0.5);
  for (let i = 0; i < 7; i++) {
    const x = 196 + i * 30 + hash(i) * 10, h = 60 + hash(i + 4) * 70;
    px(g, '#0c0818', x, GY - h - 40, 24 + hash(i + 2) * 10, h + 40);
    for (let j = 0; j < 9; j++) if (hash(i * 9 + j) > 0.6) px(g, '#5a4a30', x + 3 + (j % 3) * 7, GY - h - 34 + Math.floor(j / 3) * 9, 3, 4);
  }
  // the wall across the street at the back, a lamp on a bracket
  px(g, '#1a1426', 196, 120, LW - 196, GY - 120); tone(g, '#0e0a18', 196, 120, LW - 196, GY - 120, 0.5);
  for (let y = 124; y < GY; y += 6) px(g, '#130e20', 196, y, LW - 196, 1);
  px(g, '#3a3644', 330, 118, 2, 18); px(g, '#3a3644', 322, 118, 10, 2); poly(g, '#5a5468', [[318, 120], [328, 120], [326, 124], [320, 124]]);
  // his building: brick, five storeys of it cut by the frame, a cornice, the windows
  px(g, '#3a1e22', 0, 0, 192, GY);
  for (let y = 0; y < GY; y += 4) {
    px(g, '#2a1418', 0, y, 192, 1);
    for (let x = (y / 4) % 2 ? 0 : 6; x < 192; x += 12) px(g, '#2a1418', x, y, 1, 4);
  }
  tone(g, '#24101a', 0, 0, 192, GY, 0.25);
  for (const [x, y] of WINS) {
    px(g, '#1e1016', x - 3, y - 3, 28, 32); px(g, '#5a4a48', x - 4, y + 26, 30, 3); px(g, '#7a6a66', x - 4, y + 26, 30, 1);
    px(g, '#0a0812', x, y, 22, 26); px(g, '#1e1016', x + 10, y, 2, 26); px(g, '#1e1016', x, y + 12, 22, 2);
  }
  for (const [x, y] of WINS.slice(2)) { tone(g, '#2a2440', x, y, 22, 26, 0.25); px(g, '#4a3a5a', x + 2, y + 2, 7, 1); }
  // the corridor's window, smashed: its frame and the teeth of glass left in it
  const [wx, wy] = [146, 30];
  px(g, '#1e1016', wx - 3, wy - 3, 28, 32); px(g, '#5a4a48', wx - 4, wy + 26, 30, 3);
  px(g, '#2a1408', wx, wy, 22, 26);
  for (const [x0, y0, x1, y1] of [[0, 0, 5, 8], [22, 0, 15, 6], [0, 26, 6, 18], [22, 26, 17, 20], [22, 10, 16, 14]]) {
    poly(g, '#9ab8d8', [[wx + x0, wy + y0], [wx + x1, wy + y1], [wx + (x0 ? x0 - 2 : 2), wy + (y0 ? y0 - 1 : 1)]]);
  }
  // a drainpipe, a fire escape's ladder stopping short of the ground
  px(g, '#2a2830', 186, 0, 3, GY); for (let y = 10; y < GY; y += 30) px(g, '#3a3844', 185, y, 5, 2);
  // the alley: wet asphalt, a gutter, a dumpster, bin bags
  px(g, '#151020', 0, GY, LW, LH - GY); px(g, '#2a2236', 0, GY, LW, 1);
  for (let i = 0; i < 26; i++) px(g, '#1e1a2c', hash(i + 40) * LW, GY + 3 + hash(i + 50) * (LH - GY - 4), 6 + hash(i) * 20, 1);
  px(g, '#1f4a3a', 288, GY - 26, 52, 26); px(g, '#2c6a52', 288, GY - 26, 52, 2); px(g, '#163428', 288, GY - 18, 52, 1);
  px(g, '#1a1a20', 292, GY, 4, 2); px(g, '#1a1a20', 332, GY, 4, 2); px(g, '#c8c0a4', 300, GY - 16, 12, 6);
  for (const [x, r] of [[200, 8], [212, 7], [270, 9]]) { disc(g, '#24262e', x, GY - r + 1, r + 2, r); px(g, '#4a4c58', x - 2, GY - r * 2 + 3, 3, 1); }
}

// ---------------------------------------------------------------- the man, side on, facing right (feet at 16, 40)
function figure(pose, step) {
  if (!fig) fig = canvas(32, 44);
  const g = fig.g;
  g.clearRect(0, 0, 32, 44);
  if (pose === 'ball') {
    disc(g, C.coat, 16, 28, 9, 9); disc(g, C.coatD, 18, 30, 5, 5, 0.5);
    px(g, C.lining, 8, 26, 1, 6); disc(g, C.cap, 12, 21, 4, 4); px(g, C.boot, 22, 33, 5, 4); px(g, C.jeans, 18, 30, 5, 3); px(g, C.bag, 7, 30, 4, 4);
    return fig.c;
  }
  if (pose === 'fall') {
    poly(g, C.coat, [[10, 12], [20, 12], [24, 26], [30, 34], [6, 30]]);    // the coat flaring up behind
    px(g, C.lining, 26, 30, 4, 2); px(g, C.coatD, 12, 14, 3, 14);
    px(g, C.jeans, 10, 26, 5, 12); px(g, C.jeansD, 16, 27, 5, 8); px(g, C.jeans, 20, 34, 6, 4);
    px(g, C.boot, 9, 37, 7, 3); px(g, C.boot, 25, 33, 4, 5);
    line(g, C.coat, 18, 14, 28, 4, 3); line(g, C.coat, 12, 14, 4, 6, 3); px(g, C.skin, 28, 2, 3, 3); px(g, C.skin, 2, 4, 3, 3);
    px(g, C.skin, 14, 4, 7, 7); px(g, C.cap, 13, 2, 8, 4); px(g, C.visor, 20, 4, 4, 1); px(g, C.hair, 12, 5, 3, 6); px(g, C.cap, 15, 9, 6, 2);
    return fig.c;
  }
  if (pose === 'kneel') {
    px(g, C.boot, 6, 37, 8, 3); px(g, C.jeans, 7, 30, 6, 8); px(g, C.jeansD, 10, 28, 12, 4);   // the knee down, the other foot planted
    px(g, C.jeans, 19, 28, 5, 10); px(g, C.boot, 19, 37, 8, 3);
    poly(g, C.coat, [[8, 12], [18, 12], [22, 30], [4, 32]]); px(g, C.coatD, 8, 14, 3, 16); px(g, C.lining, 4, 31, 16, 1);
    px(g, C.bag, 4, 22, 6, 6); line(g, C.strap, 17, 13, 7, 22);
    line(g, C.coat, 16, 16, 21, 26, 3); px(g, C.skin, 21, 26, 3, 3);
    px(g, C.skin, 12, 4, 7, 8); px(g, C.cap, 11, 1, 8, 4); px(g, C.visor, 17, 1, 5, 2);           // his head tipped back
    px(g, C.hair, 10, 4, 3, 7); px(g, C.cap, 13, 9, 6, 3);
    return fig.c;
  }
  // standing, or a step of a walk
  const a = pose === 'walk' ? (step ? 3 : -3) : 0;
  px(g, C.jeansD, 12 - a, 26, 5, 12); px(g, C.boot, 11 - a, 37, 7, 3);
  px(g, C.jeans, 14 + a, 26, 5, 12); px(g, C.boot, 14 + a, 37, 8, 3);
  poly(g, C.coat, [[10, 10], [20, 10], [22, 32], [8, 32]]); px(g, C.coatD, 10, 12, 3, 20); px(g, C.lining, 8, 31, 14, 1);
  px(g, C.bag, 6, 22, 6, 6); line(g, C.strap, 19, 11, 9, 22);
  px(g, C.coat, 16 + a / 2, 13, 3, 13); px(g, C.skin, 16 + a / 2, 25, 3, 3);
  px(g, C.skin, 12, 2, 7, 8); px(g, C.cap, 11, 0, 8, 3); px(g, C.visor, 18, 2, 5, 1);
  px(g, C.hair, 10, 2, 3, 8); px(g, C.cap, 13, 7, 6, 3);
  return fig.c;
}

// ---------------------------------------------------------------- the picture
export function drawLeap(ctx, W, H, t) {
  if (!still) { still = canvas(LW, LH); paintStill(still.g); live = canvas(LW, LH); }
  const v = leapView(t), L = LEAP, g = live.g;
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, LW, LH);
  g.drawImage(still.c, 0, 0);
  // his flat burning: flames licking out of the top of its windows, the glow on the bricks, smoke going up into the rain
  for (const [x, y] of [...HIS, [146, 30]]) {
    const f = 0.7 + 0.3 * hash(Math.floor(t * 12) + x);
    px(g, '#ff8a2a', x, y, 22, 26); tone(g, '#ffd060', x + 2, y + 8, 18, 18, f * 0.5);
    for (let i = 0; i < 5; i++) {
      const fx = x + 2 + i * 4, fh = 6 + 8 * hash(i + Math.floor(t * 14) * 3 + x);
      poly(g, '#ff6a1a', [[fx, y + 2], [fx + 4, y + 2], [fx + 2 + Math.sin(t * 9 + i) * 2, y - fh]]);
    }
    disc(g, 'rgba(255,120,40,0.5)', x + 11, y + 6, 30 * f, 24 * f, 0.25);
    for (let i = 0; i < 8; i++) {
      const life = (t * 0.35 + hash(i + x)) % 1;
      disc(g, '#2a2232', x + 11 + Math.sin(life * 4 + i) * 6 + life * 10, y - 4 - life * 70, 4 + life * 10, 3 + life * 8, 0.5 * (1 - life * 0.6));
    }
  }
  // its reflection in the wet ground, broken by the rain
  for (let y = GY + 2; y < LH; y += 2) {
    const k = (y - GY) / (LH - GY);
    px(g, `rgba(255,120,40,${(0.3 * (1 - k)).toFixed(3)})`, 40 + Math.sin(y * 0.7 + t * 6) * 3, y, 120, 1);
  }
  // the glass he came through, falling with him
  if (t < 1.1) {
    for (let i = 0; i < 18; i++) {
      const vx = (hash(i) - 0.2) * 70, vy = -20 + hash(i + 7) * 30, gx = L.from[0] - 10 + vx * t, gy = L.from[1] - 10 + vy * t + 160 * t * t;
      if (gy < GY) px(g, i % 3 ? '#cfe4ff' : '#ffffff', gx, gy, 1 + (i % 2), 1);
    }
  }
  // him
  const img = figure(v.pose, v.step);
  if (!v.over && v.x < LW + 20) {
    g.save();
    g.translate(Math.round(v.x), Math.round(v.y) - (v.pose === 'ball' ? 9 : 0));
    if (v.spin) g.rotate(v.spin);
    g.drawImage(img, -16, v.pose === 'ball' ? -31 : -40);
    g.restore();
    // a rim of firelight on his back
    if (v.pose !== 'ball' && v.pose !== 'fall') px(g, 'rgba(255,140,50,0.7)', Math.round(v.x) - 8, Math.round(v.y) - 30, 1, 22);
  }
  // the dust and spray of the landing
  if (t >= L.roll[0] && t < L.roll[0] + 0.6) {
    const k = (t - L.roll[0]) / 0.6;
    for (let i = 0; i < 12; i++) px(g, '#8a8498', L.land + (hash(i) - 0.5) * 50 * k, GY - 2 - hash(i + 3) * 10 * Math.sin(k * Math.PI), 1, 1);
  }
  // the rain, slanting, over everything
  for (let i = 0; i < 90; i++) {
    const x = (hash(i) * (LW + 40) + t * 40) % (LW + 40) - 20, y = (hash(i + 11) * LH + t * 260 * (0.8 + hash(i + 5) * 0.4)) % LH;
    line(g, 'rgba(150,170,220,0.35)', x, y, x - 2, y + 6);
  }
  if (v.fade > 0) { g.fillStyle = `rgba(5,3,10,${v.fade.toFixed(3)})`; g.fillRect(0, 0, LW, LH); }
  const sc = Math.max(W / LW, H / LH), ox = (W - LW * sc) / 2, oy = (H - LH * sc) / 2;
  const jolt = t >= L.roll[0] && t < L.roll[0] + 0.25 ? (1 - (t - L.roll[0]) / 0.25) * 4 * (H / 720) : 0;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(live.c, ox + (hash(Math.floor(t * 60)) - 0.5) * jolt, oy + (hash(Math.floor(t * 60) + 3) - 0.5) * jolt, LW * sc, LH * sc);
  if (v.words > 0) text(ctx, L.line.slice(0, v.words), W / 2, H * 0.84, 22 * (H / 720), '#f4f0e8', { alpha: 1 - clamp((t - L.end + 0.3) / 0.3, 0, 1) });
  ctx.restore();
}
