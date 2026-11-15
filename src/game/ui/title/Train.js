// The train on the bridge, the scene's hero: stainless cars seen nearly level, lit windows with the late passengers
// in them, double doors, the fluted skirt, the trucks on the rail; the cab with its route board and headlight, the tail
// lamps. As it runs the lights stutter where the shoes cross a gap in the third rail and it spits sparks there (and at
// its wheels while it brakes), its headlight rakes the rails ahead; the glass of the towers behind gives back its
// windows, wavy, pane by pane.
import { LW, canvas, rand, px, oval, poly, centre } from './Draw.js';
import { hash, TRAIN } from './Timeline.js';
import { EL, EYE, GAP, TOWERS } from './Layout.js';

const CAR = TRAIN.car, TOP = EL.roof - 3;                 // a car's sprite starts over its roof's humps
const SIDE = EL.side - TOP, BODY = EL.body - TOP, RAIL = EL.rail - TOP, CH = RAIL + 2;
const WIN = SIDE + 4, WH = 12;                            // the window band
const DOORS = [30, 104];                                  // each door's left edge (two leaves, 16 px)
// the windows' left edges, 11 px wide, between the doors (going right; the cab's own at the nose)
export const WINDOWS = [6, 18, 49, 63, 77, 91, 123];

function passenger(g, x, r) {
  const q = r(), sx = x + 2 + Math.floor(r() * 5), a = '#3c302c', b = '#2c2220';
  if (q < 0.3) { px(g, a, sx, WIN + 3, 3, 3); px(g, a, sx - 1, WIN + 6, 5, 4); }                       // sitting
  else if (q < 0.45) { px(g, a, x + 1, WIN + 4, 3, 3); px(g, a, x, WIN + 7, 5, 3); px(g, b, x + 6, WIN + 3, 3, 3); px(g, b, x + 5, WIN + 6, 5, 4); }
  else if (q < 0.6) { px(g, b, sx, WIN + 1, 3, 3); px(g, b, sx - 1, WIN + 4, 5, 6); px(g, b, sx + 3, WIN - 1, 1, 3); }   // at the strap
  else if (q < 0.66) { px(g, a, sx, WIN + 5, 3, 2); px(g, a, sx - 1, WIN + 7, 6, 3); }                 // asleep, head down
}

// part: 'lead' | 'mid' | 'tail'; drawn going right (the nose at the right), flipped for the other way
function paintCar(part, seed) {
  const { c, g } = canvas(CAR, CH), r = rand(seed);
  // the roof's air-conditioning humps against the night, the roof's edge catching the sky
  for (const hx of [16, 66, 112]) { px(g, '#22242c', hx, 0, 22, 3); px(g, '#3a3e4c', hx + 1, 0, 20, 1); }
  px(g, '#2a2c36', 0, 3, CAR, SIDE - 3);
  px(g, '#545868', 0, 3, CAR, 1);
  px(g, '#1c1e26', 0, SIDE - 1, CAR, 1);
  // the flank: stainless at night, the letter board, the windows, a thin red line, the fluted skirt
  px(g, '#5c606e', 0, SIDE, CAR, BODY - SIDE);
  px(g, '#80849a', 0, SIDE, CAR, 1);
  px(g, '#6a6e7e', 0, SIDE + 1, CAR, 1);
  px(g, '#9a2a36', 0, WIN + WH + 2, CAR, 1);
  const flute = WIN + WH + 4;
  for (let x = 0; x < CAR; x += 2) px(g, '#4e5260', x, flute, 1, BODY - 3 - flute);
  px(g, '#6e7282', 0, flute - 1, CAR, 1);
  px(g, '#24262e', 0, BODY - 3, CAR, 3);
  for (const x of WINDOWS) {
    if (part === 'lead' && x > CAR - 20) continue;
    px(g, '#202228', x - 1, WIN - 1, 13, WH + 2);
    px(g, '#e4dcc0', x, WIN, 11, WH);
    px(g, '#fffaea', x, WIN, 11, 1);                                                // the ceiling's tubes
    px(g, '#b4a684', x, WIN + 8, 11, 4);                                            // the seats' backs
    if (r() < 0.5) px(g, '#9a8a68', x + 2 + Math.floor(r() * 7), WIN + 1, 1, 7);    // a pole
    passenger(g, x, r);
  }
  for (const d of DOORS) {
    for (const lx of [d, d + 9]) {
      px(g, '#4c505e', lx, SIDE + 2, 7, BODY - SIDE - 5);
      px(g, '#e0d6b8', lx + 2, WIN - 1, 3, WH);
      px(g, '#fffaea', lx + 2, WIN - 1, 3, 1);
    }
    px(g, '#24262e', d + 7, SIDE + 2, 2, BODY - SIDE - 5);
    px(g, '#24262e', d - 1, SIDE + 2, 1, BODY - SIDE - 5); px(g, '#24262e', d + 16, SIDE + 2, 1, BODY - SIDE - 5);
  }
  // the trucks, the shoes, what hangs under the floor
  px(g, '#121216', 42, BODY, 62, 3);
  for (const bx of [8, 110]) {
    px(g, '#0c0c0e', bx, BODY, 32, 5);
    for (const wx of [bx + 7, bx + 24]) { oval(g, '#1e1e26', wx, RAIL - 3, 4, 3.6); px(g, '#4a4a54', wx, RAIL - 4, 1, 1); }
    px(g, '#26262c', bx + 13, RAIL - 2, 5, 2);
  }
  if (part === 'lead') {
    // the cab: its end, the driver's window with the night in it and the route board, the headlight, a marker
    px(g, '#4a4e5c', CAR - 14, SIDE, 14, BODY - SIDE - 3);
    px(g, '#202228', CAR - 12, WIN - 1, 10, WH + 2);
    px(g, '#141a28', CAR - 11, WIN, 8, WH);
    px(g, '#3a4a6a', CAR - 11, WIN, 1, 6);
    px(g, '#e88a2a', CAR - 10, WIN + 1, 6, 3);
    px(g, '#2a1a10', CAR - 9, WIN + 2, 1, 1); px(g, '#2a1a10', CAR - 7, WIN + 2, 2, 1);
    px(g, '#2a1c18', CAR - 8, WIN + 6, 3, 3); px(g, '#2a1c18', CAR - 9, WIN + 9, 5, 3);   // the driver
    px(g, '#24262e', CAR - 1, SIDE, 1, BODY - SIDE - 3);
    px(g, '#fff8e0', CAR - 2, BODY - 9, 2, 2);
    px(g, '#ffd080', CAR - 2, SIDE + 2, 1, 1);
  }
  if (part === 'tail') { px(g, '#24262e', 0, SIDE, 1, BODY - SIDE - 3); px(g, '#ff3020', 0, BODY - 9, 2, 2); px(g, '#ff3020', 0, SIDE + 2, 1, 1); }
  return c;
}
function flip(c) {
  const { c: o, g } = canvas(c.width, c.height);
  g.scale(-1, 1);
  g.drawImage(c, -c.width, 0);
  return o;
}
export function buildTrain() {
  const parts = ['lead', 'mid', 'mid', 'tail'].map((p, i) => paintCar(p, 300 + i * 17));
  return { right: parts, left: parts.map(flip) };
}

// where each car is: [{ x: its left edge (logical), i }]
export function carsOf(tr) {
  const out = [];
  for (let i = 0; i < TRAIN.cars; i++) out.push({ i, x: tr.dir > 0 ? tr.x - (i + 1) * CAR - i * TRAIN.gap : tr.x + i * (CAR + TRAIN.gap) });
  return out;
}
// the windows' left edges of a car in the picture, whichever way it runs
const windowsOf = (tr, c) => WINDOWS.map((w) => (tr.dir > 0 ? c.x + w : c.x + CAR - w - 11));

// a car's lights stutter while its shoes cross a gap in the third rail, only when it runs (true: dark at this instant)
const blink = (tr, i, t) => tr.v > 40 && hash(Math.floor(t * 7) * 1.7 + i * 3.1 + tr.k) < 0.05 * tr.sparks && hash(Math.floor(t * 30) + i) > 0.4;

// The train's windows given back by the towers' glass, between his eye level and the train's roof: a warm run per
// window, broken pane by pane (each pane a pixel up or down); (ex, ey) the line's offset, (tx, ty) the towers'.
export function drawTrainMirror(ctx, tr, cars, t, ex, ey, tx, ty) {
  for (const c of cars) {
    if (blink(tr, c.i, t)) continue;
    for (const wx of windowsOf(tr, c)) {
      for (let x = Math.round(wx + ex), end = x + 11; x < end;) {
        const T = x - tx < GAP.x0 ? TOWERS[0] : TOWERS[1], n = Math.floor((x - tx - T.x0) / T.cell);
        const step = Math.max(1, Math.min(end, tx + T.x0 + (n + 1) * T.cell) - x);
        const inGap = x - tx >= GAP.x0 && x - tx < GAP.x1;
        if (!inGap && x > -2 && x < LW + 2) {
          const dy = Math.round(Math.sin(n * 1.3 + T.seed) * 1.4);
          ctx.fillStyle = '#4a3e3a'; ctx.fillRect(x, EYE - 3 + dy + ty, step, 4);
          ctx.fillStyle = '#7a6448'; ctx.fillRect(x, EYE - 2 + dy + ty, step, 2);
        }
        x += step;
      }
    }
  }
}

// the train itself at the line's offset (ex, ey); H: halo sprites
export function drawTrain(ctx, tr, cars, set, t, ex, ey, H) {
  const sprites = tr.dir > 0 ? set.right : set.left;
  for (const c of cars) {
    const x = Math.round(c.x + ex), y = TOP + ey;
    if (x > LW + 30 || x + CAR < -30) continue;
    ctx.drawImage(sprites[c.i], x, y);
    if (c.i < TRAIN.cars - 1) { ctx.fillStyle = '#16161a'; ctx.fillRect(tr.dir > 0 ? x - TRAIN.gap : x + CAR, EL.side + 2 + ey, TRAIN.gap, BODY - SIDE - 4); }
    if (blink(tr, c.i, t)) { ctx.fillStyle = 'rgba(10,8,16,0.72)'; ctx.fillRect(x, EL.side + 3 + ey, CAR, WH + 2); }
  }
  // the headlight on the rails ahead, the tail lamps' red
  const nose = Math.round(tr.x + ex), tail = Math.round(tr.tail + ex), d = tr.dir, hy = EL.body - 8 + ey;
  ctx.globalCompositeOperation = 'lighter';
  poly(ctx, 'rgba(255,240,200,0.06)', [[nose, hy - 2], [nose + d * 90, EL.rail - 6 + ey], [nose + d * 90, EL.rail + 4 + ey], [nose, hy + 3]]);
  poly(ctx, 'rgba(255,240,200,0.07)', [[nose, hy - 1], [nose + d * 44, EL.rail - 3 + ey], [nose + d * 44, EL.rail + 2 + ey], [nose, hy + 2]]);
  for (let k = 0; k < 60; k += 3) { ctx.fillStyle = `rgba(255,250,230,${(0.5 - k / 130).toFixed(3)})`; ctx.fillRect(nose + d * (3 + k), EL.rail - 1 + ey, 2, 1); }
  centre(ctx, H.white, nose, hy);
  centre(ctx, H.redSmall, tail, hy);
  ctx.globalCompositeOperation = 'source-over';
  // sparks where the shoes ride the third rail (or the wheels bite while it brakes): a white-blue spit, beads of it
  // thrown back and down, a flash
  for (const s of sparksOf(tr, cars, t)) {
    const X = Math.round(s.x + ex), Y = EL.rail - 1 + ey;
    ctx.globalCompositeOperation = 'lighter';
    centre(ctx, s.brake ? H.brake : s.a < 0.4 ? H.spark : H.sparkDim, X, Y - 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = s.brake ? '#ffe6b0' : '#f4faff'; ctx.fillRect(X, Y - 1, 2, 2);
    for (let j = 0; j < 7; j++) {
      const r = s.a * (8 + hash(s.seed + j) * 20), bx = X - d * Math.round(r * (0.5 + hash(s.seed + j * 2.1))), by = Y + Math.round(r * r * 0.04 + r * (hash(s.seed + j * 3.7) - 0.3));
      ctx.fillStyle = s.brake ? (j % 2 ? '#ffb050' : '#ffe0a0') : j % 3 ? '#bfe6ff' : '#ffd890';
      ctx.fillRect(bx, by, 1, 1);
    }
  }
}

// the sparks at t: [{ x: the shoe's or the wheel's x (logical), a: 0..1 through its life, seed, brake }]
function sparksOf(tr, cars, t) {
  const out = [], slot = Math.floor(t * 9), a = t * 9 - slot, pace = Math.min(1, tr.v / TRAIN.speed);
  if (pace < 0.25) return out;
  for (const c of cars) for (const sx of tr.braking ? [15, 32, 117, 134] : [21, 123]) {
    const x = c.x + sx, seed = slot * 1.31 + c.i * 7.7 + sx * 0.13 + tr.k * 3.3;
    const odds = tr.braking ? 0.16 : 0.07 * tr.sparks * pace;
    if (hash(seed) <= odds && x > -10 && x < LW + 10) out.push({ x, a, seed, brake: tr.braking });
  }
  return out;
}

// the train's lights, for the rain falling through them: its windows (unless they are out), the headlight, the sparks
export function trainLights(tr, cars, t, lights) {
  for (const c of cars) if (!blink(tr, c.i, t)) lights.push({ x: c.x + CAR / 2, y: EL.side + 10, r: 70, type: 1, k: 0.5 });
  lights.push({ x: tr.x + tr.dir * 40, y: EL.rail - 6, r: 50, type: 1, k: 1 });
  for (const s of sparksOf(tr, cars, t)) lights.push({ x: s.x, y: EL.rail, r: 40, type: 2, k: 1.4 });
}
