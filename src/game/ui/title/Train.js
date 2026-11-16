// The train on the bridge, the scene's hero: stainless cars seen nearly level, lit windows with the late passengers
// in them, double doors, the fluted skirt, the trucks on the rail; the cab with its route board and headlight, the tail
// lamps. As it runs the lights stutter where the shoes cross a gap in the third rail and it spits sparks there (and at
// its wheels while it brakes), its headlight rakes the rails ahead; the glass of the towers behind gives back its
// windows, wavy, pane by pane.
import { LW, canvas, rand, px, oval, poly, centre, tone } from './Draw.js';
import { lightBands } from './Cycle.js';
import { hash, TRAIN } from './Timeline.js';
import { EL, EYE, GAP, TOWERS } from './Layout.js';

const CAR = TRAIN.car, TOP = EL.roof - 3;                 // a car's sprite starts over its roof's humps
const SIDE = EL.side - TOP, BODY = EL.body - TOP, RAIL = EL.rail - TOP, CH = RAIL + 2;
const WIN = SIDE + 4, WH = 12;                            // the window band
const DOORS = [30, 104];                                  // each door's left edge (two leaves, 16 px)
// the windows' left edges, 11 px wide, between the doors (going right; the cab's own at the nose)
export const WINDOWS = [6, 18, 49, 63, 77, 91, 123];

function passenger(g, x, r, a = '#3c302c', b = '#2c2220') {
  const q = r(), sx = x + 2 + Math.floor(r() * 5);
  if (q < 0.3) { px(g, a, sx, WIN + 3, 3, 3); px(g, a, sx - 1, WIN + 6, 5, 4); }                       // sitting
  else if (q < 0.45) { px(g, a, x + 1, WIN + 4, 3, 3); px(g, a, x, WIN + 7, 5, 3); px(g, b, x + 6, WIN + 3, 3, 3); px(g, b, x + 5, WIN + 6, 5, 4); }
  else if (q < 0.6) { px(g, b, sx, WIN + 1, 3, 3); px(g, b, sx - 1, WIN + 4, 5, 6); px(g, b, sx + 3, WIN - 1, 1, 3); }   // at the strap
  else if (q < 0.66) { px(g, a, sx, WIN + 5, 3, 2); px(g, a, sx - 1, WIN + 7, 6, 3); }                 // asleep, head down
}

// part: 'lead' | 'mid' | 'tail'; drawn going right (the nose at the right), flipped for the other way. Two pictures:
// the car by day (its stainless lit by the hour when the palette steps) and its lit windows alone (over it at night)
function paintCar(part, seed) {
  const { c, g } = canvas(CAR, CH), L = canvas(CAR, CH), l = L.g;
  // the roof's air-conditioning humps against the sky, the roof's edge catching it
  for (const hx of [16, 66, 112]) { px(g, '#5a5e6a', hx, 0, 22, 3); px(g, '#8a8e9c', hx + 1, 0, 20, 1); }
  px(g, '#6a6e7a', 0, 3, CAR, SIDE - 3);
  px(g, '#a8acba', 0, 3, CAR, 1);
  px(g, '#4a4e58', 0, SIDE - 1, CAR, 1);
  // the flank: stainless, the letter board, the windows, a thin red line, the fluted skirt
  px(g, '#aeb2be', 0, SIDE, CAR, BODY - SIDE);
  px(g, '#dadee8', 0, SIDE, CAR, 1);
  px(g, '#c0c4d0', 0, SIDE + 1, CAR, 1);
  px(g, '#b0303e', 0, WIN + WH + 2, CAR, 1);
  const flute = WIN + WH + 4;
  for (let x = 0; x < CAR; x += 2) px(g, '#949aa8', x, flute, 1, BODY - 3 - flute);
  px(g, '#c8ccd8', 0, flute - 1, CAR, 1);
  px(g, '#3a3c44', 0, BODY - 3, CAR, 3);
  // its windows: dark glass with the sky in it and the people dim behind it by day; lit, the tubes, the seats, a pole,
  // the late passengers
  const day = rand(seed), lit = rand(seed), pole = rand(seed + 1);
  for (const x of WINDOWS) {
    if (part === 'lead' && x > CAR - 20) continue;
    px(g, '#3a3c44', x - 1, WIN - 1, 13, WH + 2);
    px(g, '#46505e', x, WIN, 11, WH);
    px(g, '#6a7a92', x + 7, WIN, 3, 1); px(g, '#6a7a92', x + 6, WIN + 1, 2, 1);      // the sky in the glass
    passenger(g, x, day, '#343a46', '#2c323e');
    px(l, '#e4dcc0', x, WIN, 11, WH);
    px(l, '#fffaea', x, WIN, 11, 1);
    px(l, '#b4a684', x, WIN + 8, 11, 4);
    if (pole() < 0.5) px(l, '#9a8a68', x + 2 + Math.floor(pole() * 7), WIN + 1, 1, 7);
    passenger(l, x, lit);
  }
  for (const d of DOORS) {
    for (const lx of [d, d + 9]) {
      px(g, '#9ca0ae', lx, SIDE + 2, 7, BODY - SIDE - 5);
      px(g, '#46505e', lx + 2, WIN - 1, 3, WH);
      px(l, '#e0d6b8', lx + 2, WIN - 1, 3, WH);
      px(l, '#fffaea', lx + 2, WIN - 1, 3, 1);
    }
    px(g, '#3a3c44', d + 7, SIDE + 2, 2, BODY - SIDE - 5);
    px(g, '#3a3c44', d - 1, SIDE + 2, 1, BODY - SIDE - 5); px(g, '#3a3c44', d + 16, SIDE + 2, 1, BODY - SIDE - 5);
  }
  // the trucks, the shoes, what hangs under the floor
  px(g, '#24242a', 42, BODY, 62, 3);
  const W = TRAIN.wheels;                                  // the axles: what knocks on the joints (Timeline.RAIL)
  for (const [w0, w1] of [[W[0], W[1]], [W[2], W[3]]]) {
    const bx = w0 - 7;
    px(g, '#1c1c20', bx, BODY, 32, 5);
    for (const wx of [w0, w1]) { oval(g, '#34343c', wx, RAIL - 3, 4, 3.6); px(g, '#7a7a84', wx, RAIL - 4, 1, 1); }
    px(g, '#44444c', bx + 13, RAIL - 2, 5, 2);
  }
  if (part === 'lead') {
    // the cab: its end, the driver's window and the route board, the headlight, a marker
    px(g, '#9a9eac', CAR - 14, SIDE, 14, BODY - SIDE - 3);
    px(g, '#3a3c44', CAR - 12, WIN - 1, 10, WH + 2);
    px(g, '#2a3446', CAR - 11, WIN, 8, WH);
    px(g, '#5a6a8a', CAR - 11, WIN, 1, 6);
    px(g, '#e88a2a', CAR - 10, WIN + 1, 6, 3);
    px(g, '#2a1a10', CAR - 9, WIN + 2, 1, 1); px(g, '#2a1a10', CAR - 7, WIN + 2, 2, 1);
    px(g, '#1e2230', CAR - 8, WIN + 6, 3, 3); px(g, '#1e2230', CAR - 9, WIN + 9, 5, 3);   // the driver
    px(g, '#3a3c44', CAR - 1, SIDE, 1, BODY - SIDE - 3);
    px(l, '#fff8e0', CAR - 2, BODY - 9, 2, 2);
    px(l, '#ffd080', CAR - 2, SIDE + 2, 1, 1);
  }
  if (part === 'tail') { px(g, '#3a3c44', 0, SIDE, 1, BODY - SIDE - 3); px(l, '#ff3020', 0, BODY - 9, 2, 2); px(l, '#ff3020', 0, SIDE + 2, 1, 1); }
  return { body: c, lit: L.c };
}
function flip(c) {
  const { c: o, g } = canvas(c.width, c.height);
  g.scale(-1, 1);
  g.drawImage(c, -c.width, 0);
  return o;
}
export function buildTrain() {
  const parts = ['lead', 'mid', 'mid', 'tail'].map((p, i) => paintCar(p, 300 + i * 17));
  const set = (pick, f) => parts.map((p) => f(pick(p)));
  const blank = () => parts.map(() => canvas(CAR, CH).c);
  return {
    body: { right: set((p) => p.body, (c) => c), left: set((p) => p.body, flip) },
    lit: { right: set((p) => p.lit, (c) => c), left: set((p) => p.lit, flip) },
    right: blank(), left: blank(), lamps: 0,
  };
}
// the cars at the hour: their stainless in the light of the line's height, a little more lit at night by the line's
// own lamps; their windows' light as strong as the city's lamps
export function paintTrain(set, P) {
  const b = lightBands(P).find((q) => 110 >= q.y0 && 110 < q.y1).c, c = b.map((v) => v + (255 - v) * 0.25 * P.lamps);
  for (const side of ['right', 'left']) set[side].forEach((dst, i) => tone(dst, set.body[side][i], [{ y0: -40, y1: 260, c }], 0));
  set.lamps = P.lamps;
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

// The train's lit windows given back by the towers' glass at night, between the eye level and the train's roof: a
// warm run per window, broken pane by pane (each pane a pixel up or down); (ex, ey) the line's offset, (tx, ty) the
// towers'; lamps: the city's lamps of the hour (the cars' lights with them).
export function drawTrainMirror(ctx, tr, cars, t, ex, ey, tx, ty, lamps) {
  if (lamps < 0.3) return;
  ctx.globalAlpha = Math.min(1, lamps);
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
  ctx.globalAlpha = 1;
}

// the train itself at the line's offset (ex, ey): the cars lit by the hour (paintTrain), their windows' light over
// them as strong as the city's lamps (out a moment where the shoes cross a gap); H: halo sprites
export function drawTrain(ctx, tr, cars, set, t, ex, ey, H) {
  const side = tr.dir > 0 ? 'right' : 'left', sprites = set[side], lit = set.lit[side];
  for (const c of cars) {
    const x = Math.round(c.x + ex), y = TOP + ey;
    if (x > LW + 30 || x + CAR < -30) continue;
    ctx.drawImage(sprites[c.i], x, y);
    if (c.i < TRAIN.cars - 1) { ctx.fillStyle = '#16161a'; ctx.fillRect(tr.dir > 0 ? x - TRAIN.gap : x + CAR, EL.side + 2 + ey, TRAIN.gap, BODY - SIDE - 4); }
    if (set.lamps > 0.05 && !blink(tr, c.i, t)) {
      ctx.globalAlpha = Math.min(1, set.lamps * 1.2);
      ctx.drawImage(lit[c.i], x, y);
      ctx.globalAlpha = 1;
    }
  }
  // the headlight on the rails ahead, the tail lamps' red (barely seen by day)
  const nose = Math.round(tr.x + ex), tail = Math.round(tr.tail + ex), d = tr.dir, hy = EL.body - 8 + ey;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.25 + 0.75 * set.lamps;
  poly(ctx, 'rgba(255,240,200,0.06)', [[nose, hy - 2], [nose + d * 90, EL.rail - 6 + ey], [nose + d * 90, EL.rail + 4 + ey], [nose, hy + 3]]);
  poly(ctx, 'rgba(255,240,200,0.07)', [[nose, hy - 1], [nose + d * 44, EL.rail - 3 + ey], [nose + d * 44, EL.rail + 2 + ey], [nose, hy + 2]]);
  for (let k = 0; k < 60; k += 3) { ctx.fillStyle = `rgba(255,250,230,${(0.5 - k / 130).toFixed(3)})`; ctx.fillRect(nose + d * (3 + k), EL.rail - 1 + ey, 2, 1); }
  centre(ctx, H.white, nose, hy);
  centre(ctx, H.redSmall, tail, hy);
  ctx.globalAlpha = 1;
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
  for (const c of cars) for (const sx of tr.braking ? TRAIN.wheels : [21, 123]) {
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
