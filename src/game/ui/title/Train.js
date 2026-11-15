// The elevated line across the foreground: its rail bed seen from above (ties, the running rails shining wet, the
// third rail on its insulators), the riveted plate girder under it with rust run down from its rivets, the columns
// going down to the street, a signal. And the train: stainless cars with a red band, lit windows with the
// late passengers in them, the lights stuttering as the shoes cross a gap in the third rail, the sparks there, the
// headlight raking the rails ahead, the window light sliding over the fronts across the avenue and the street below.
import { LW, LH, layer, canvas, rand, px, line, poly, oval, centre } from './Draw.js';
import { hash, trainSlot, TRAIN, TRAIN_LEN } from './Timeline.js';
import { EL, BLOCK, FOOT } from './Layout.js';

const CAR = TRAIN.car, CH = EL.bed + 6 - EL.roof;   // a car's sprite: roof to the bottom of its wheels

export function buildEl() {
  const L = layer(), g = L.g, r = rand(9), x0 = -60, x1 = LW + 60, w = x1 - x0;
  // the rail bed: ties across, two running rails, the third rail on the near side
  px(g, '#191513', x0, EL.bed, w, EL.girder[0] - EL.bed);
  for (let x = x0; x < x1; x += 3) px(g, '#2a221e', x, EL.bed, 2, EL.girder[0] - EL.bed);
  for (const y of EL.rail) {
    px(g, '#6c6a78', x0, y, w, 1);
    px(g, '#0e0c0e', x0, y + 1, w, 1);
    for (let i = 0; i < 50; i++) px(g, '#a8a6c0', x0 + r() * w, y, 2 + r() * 6, 1);   // the sky's glow on the wet steel
  }
  px(g, '#3a3842', x0, EL.third, w, 1);
  for (let x = x0; x < x1; x += 12) px(g, '#8a7e6a', x, EL.third, 1, 1);
  // the girder: riveted plate, its flanges catching the wet, stiffeners, rust run down from the rivets
  const [gt, gb] = EL.girder;
  px(g, '#182120', x0, gt, w, gb - gt + 1);
  px(g, '#2c3634', x0, gt, w, 2); px(g, '#4e5a56', x0, gt, w, 1);
  px(g, '#222a28', x0, gb - 2, w, 3); px(g, '#36423e', x0, gb - 2, w, 1);
  for (let i = 0; i < 60; i++) px(g, '#6e7a76', x0 + r() * w, gt, 1 + r() * 4, 1);
  for (let x = x0; x < x1; x += 3) { px(g, '#3a4642', x, gt + 2, 1, 1); px(g, '#3a4642', x + 1, gb - 3, 1, 1); }
  for (let x = x0 + 4; x < x1; x += 12) {
    px(g, '#26302e', x, gt + 2, 2, gb - gt - 4); px(g, '#323e3a', x, gt + 2, 1, gb - gt - 4);
    if (r() < 0.5) px(g, '#3a2a22', x + 2, gt + 3, 1, 2 + Math.floor(r() * 4));
    if (r() < 0.3) px(g, '#33251e', x + 6, gb, 1, 1 + Math.floor(r() * 3));
  }
  // the columns, their caps, the knee braces
  for (const cx of EL.cols) {
    px(g, '#1a2220', cx, gb + 1, 7, LH + 20 - gb);
    px(g, '#34403e', cx, gb + 1, 1, LH + 20 - gb); px(g, '#0e1412', cx + 6, gb + 1, 1, LH + 20 - gb);
    px(g, '#2a3432', cx - 2, gb + 1, 11, 2);
    line(g, '#1a2220', cx - 1, gb + 6, cx - 9, gb + 1); line(g, '#1a2220', cx + 7, gb + 6, cx + 15, gb + 1);
  }
  // the signal on its mast at the side of the track
  px(g, '#232a28', EL.signal, EL.bed - 14, 1, 14);
  px(g, '#101614', EL.signal - 1, EL.bed - 21, 3, 8);
  px(g, '#2a3230', EL.signal - 1, EL.bed - 21, 3, 1);
  return L.c;
}

// ---------------------------------------------------------------- the cars
// part: 'lead' | 'mid' | 'tail'; drawn going right (the nose at the right), flipped for the other way
function paintCar(part, seed) {
  const { c, g } = canvas(CAR, CH), r = rand(seed), side = EL.side - EL.roof, win = side + 3, bed = EL.bed - EL.roof;
  // the roof seen from above: the air-conditioning humps, the sky's glow lying on it
  px(g, '#3e424e', 0, 0, CAR, side);
  px(g, '#4a4e5c', 0, 2, CAR, 1);
  for (const vx of [12, 38, 64]) { px(g, '#2c2f3a', vx - 1, 2, 12, 3); px(g, '#4e5262', vx, 1, 10, 3); px(g, '#666a7e', vx, 1, 10, 1); }
  for (let i = 0; i < 8; i++) px(g, '#5e6276', r() * CAR, r() < 0.5 ? 0 : 3, 2 + r() * 5, 1);
  px(g, '#24262e', 0, side - 1, CAR, 1);
  // the flank: stainless at night, the city's colours sliding on it; letter board, windows, the red band, the fluted
  // panel, the skirt
  px(g, '#5c606e', 0, side, CAR, bed - side - 3);
  px(g, '#868a9c', 0, side, CAR, 1);
  px(g, '#6a6e7e', 0, side + 1, CAR, 1);
  for (let x = 0; x < CAR; x += 2) px(g, '#525664', x, win + 9, 1, 5);
  for (let i = 0; i < 6; i++) px(g, r() < 0.5 ? '#8a5a7a' : '#5a8494', Math.floor(r() * CAR), win + 9 + Math.floor(r() * 3), 1, 2);
  px(g, '#a02434', 0, win + 7, CAR, 1); px(g, '#6a1824', 0, win + 8, CAR, 1);
  px(g, '#30323c', 0, bed - 3, CAR, 2);
  const doors = [18, 62];
  for (let x = 3; x + 7 < CAR - 2; x += 9) {
    if (doors.some((d) => x + 7 > d && x < d + 8)) continue;
    px(g, '#24262e', x - 1, win - 1, 9, 8);
    px(g, '#e8d8a8', x, win, 7, 6);
    px(g, '#fffbe8', x, win, 7, 1);                                                  // the ceiling's tubes
    px(g, '#b8a478', x, win + 4, 7, 2);                                              // the seats' backs
    if (r() < 0.6) px(g, '#8a7a5a', x + 1 + Math.floor(r() * 5), win + 1, 1, 1);     // a hand strap
    // who is in the window, dark against the light: one sitting, two, one standing at the strap, nobody
    const q = r(), sx = x + 1 + Math.floor(r() * 3), sil = '#3a2c28', sil2 = '#2c2220';
    if (q < 0.28) { px(g, sil, sx, win + 2, 2, 2); px(g, sil, sx - 1, win + 4, 4, 2); }
    else if (q < 0.42) { px(g, sil, x + 1, win + 2, 2, 2); px(g, sil, x, win + 4, 3, 2); px(g, sil2, x + 4, win + 3, 2, 2); px(g, sil2, x + 4, win + 5, 3, 1); }
    else if (q < 0.58) { px(g, sil2, sx, win, 2, 2); px(g, sil2, sx - 1, win + 2, 4, 4); px(g, sil2, sx + 2, win, 1, 2); }
  }
  for (const d of doors) {
    px(g, '#4a4e5c', d, side + 1, 8, bed - side - 4);
    px(g, '#2a2c36', d + 3, side + 1, 2, bed - side - 4);
    px(g, '#e0d0a0', d + 1, win - 1, 2, 8); px(g, '#e0d0a0', d + 5, win - 1, 2, 8);
    px(g, '#fffbe8', d + 1, win - 1, 2, 1); px(g, '#fffbe8', d + 5, win - 1, 2, 1);
  }
  if (part !== 'mid') for (const x of [72, 76, 80]) px(g, '#30323c', x, win + 11, 2, 2);   // the car's number
  // the trucks, the shoes on the third rail, what hangs between them
  px(g, '#121216', 20, bed - 1, 48, 3);
  for (const bx of [6, 62]) {
    px(g, '#0c0c0e', bx, bed - 1, 20, 4);
    for (const wx of [bx + 4, bx + 15]) { oval(g, '#22222a', wx, bed + 2, 3, 2.6); px(g, '#4a4a52', wx, bed + 1, 1, 1); }
    px(g, '#2a2a30', bx + 8, bed + 4, 4, 2);
  }
  if (part === 'lead') {
    // the cab: its slanted end, the driver's window with the night in it, the route board, the headlight
    px(g, '#4a4e5c', CAR - 5, side, 5, bed - side - 3);
    px(g, '#1a2230', CAR - 4, win - 1, 4, 7); px(g, '#4a5a78', CAR - 4, win - 1, 1, 3);
    px(g, '#2a1c18', CAR - 3, win + 2, 2, 2);                                       // the driver
    px(g, '#e88a2a', CAR - 12, win + 1, 5, 6); px(g, '#2a1a10', CAR - 11, win + 2, 1, 4); px(g, '#2a1a10', CAR - 10, win + 2, 2, 1); px(g, '#2a1a10', CAR - 10, win + 4, 1, 1); px(g, '#2a1a10', CAR - 10, win + 6, 2, 1);
    px(g, '#fff8e0', CAR - 1, win + 10, 1, 2);
  }
  if (part === 'tail') { px(g, '#4a4e5c', 0, side, 3, bed - side - 3); px(g, '#ff3020', 0, win + 9, 1, 2); px(g, '#ff3020', 0, win + 1, 1, 1); }
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

// a car's interior lights stutter while its shoes cross a gap in the third rail (true: dark at this instant)
const blink = (tr, i, t) => hash(Math.floor(t * 7) * 1.7 + i * 3.1 + tr.k) < 0.05 * tr.sparks && hash(Math.floor(t * 30) + i) > 0.4;

// the train's window light thrown on the fronts across the avenue (near layer offset nx, ny) and down onto the street
// under the line (drawn before the line, so its girders cut it)
export function drawTrainSpill(ctx, tr, cars, nx, ny, ex, ey, t) {
  ctx.globalCompositeOperation = 'lighter';
  for (const c of cars) {
    if (blink(tr, c.i, t)) continue;
    for (let wx = 3; wx + 7 < CAR - 2; wx += 9) {
      const x = c.x + wx;
      if (x < -20 || x > LW + 20) continue;
      const b = BLOCK.find((q) => x >= q.x0 && x < q.x1);
      if (b && b.kind !== 'alley') {
        ctx.fillStyle = 'rgba(255,236,190,0.045)'; ctx.fillRect(Math.round(x + nx), FOOT - 15 + ny, 7, 14);
        ctx.fillStyle = 'rgba(255,236,190,0.045)'; ctx.fillRect(Math.round(x + 1 + nx), FOOT - 12 + ny, 5, 8);
      }
      ctx.fillStyle = 'rgba(255,236,190,0.09)'; ctx.fillRect(Math.round(x + ex), EL.girder[1] + 1 + ey, 7, 6);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// the train itself at the line's offset (ex, ey); H: halo sprites
export function drawTrain(ctx, tr, cars, set, t, ex, ey, H) {
  const sprites = tr.dir > 0 ? set.right : set.left;
  for (const c of cars) {
    const sp = sprites[c.i], x = Math.round(c.x + ex), y = EL.roof + ey;
    if (x > LW + 4 || x + CAR < -4) continue;
    ctx.drawImage(sp, x, y);
    if (c.i < TRAIN.cars - 1) { ctx.fillStyle = '#18181c'; ctx.fillRect(tr.dir > 0 ? x - TRAIN.gap : x + CAR, y + 6, TRAIN.gap, CH - 12); }
    if (blink(tr, c.i, t)) { ctx.fillStyle = 'rgba(10,8,16,0.72)'; ctx.fillRect(x, EL.side + 2 + ey, CAR, 8); }
  }
  // the headlight on the rails ahead, the tail lamps' red
  const nose = Math.round(tr.x + ex), tail = Math.round(tr.tail + ex), d = tr.dir;
  ctx.globalCompositeOperation = 'lighter';
  poly(ctx, 'rgba(255,240,200,0.07)', [[nose, EL.side + 10 + ey], [nose + d * 64, EL.bed - 1 + ey], [nose + d * 64, EL.bed + 7 + ey], [nose, EL.side + 13 + ey]]);
  poly(ctx, 'rgba(255,240,200,0.08)', [[nose, EL.side + 11 + ey], [nose + d * 32, EL.bed + ey], [nose + d * 32, EL.bed + 5 + ey], [nose, EL.side + 12 + ey]]);
  for (let k = 0; k < 40; k += 3) { ctx.fillStyle = `rgba(255,250,230,${(0.5 - k / 90).toFixed(3)})`; ctx.fillRect(nose + d * (4 + k), EL.rail[0] + ey, 2, 1); ctx.fillRect(nose + d * (2 + k), EL.rail[1] + ey, 2, 1); }
  centre(ctx, H.white, nose, EL.side + 11 + ey);
  centre(ctx, H.redSmall, tail, EL.side + 8 + ey);
  ctx.globalCompositeOperation = 'source-over';
  // sparks where the shoes ride the third rail: a white-blue spit, beads of it thrown back and down, a flash
  for (const s of sparksOf(tr, cars, t)) {
    const X = Math.round(s.x + ex), Y = EL.third + ey;
    ctx.globalCompositeOperation = 'lighter';
    centre(ctx, s.a < 0.4 ? H.spark : H.sparkDim, X, Y - 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#f4faff'; ctx.fillRect(X, Y - 1, 2, 2);
    for (let j = 0; j < 6; j++) {
      const r = s.a * (8 + hash(s.seed + j) * 18), bx = X - d * Math.round(r * (0.5 + hash(s.seed + j * 2.1))), by = Y + Math.round(r * r * 0.04 + r * (hash(s.seed + j * 3.7) - 0.3));
      ctx.fillStyle = j % 3 ? '#bfe6ff' : '#ffd890';
      ctx.fillRect(bx, by, 1, 1);
    }
  }
}

// the sparks at t: [{ x: the shoe's x (logical), a: 0..1 through its life, seed }]
function sparksOf(tr, cars, t) {
  const out = [], slot = Math.floor(t * 9), a = t * 9 - slot;
  for (const c of cars) for (const sx of [16, 72]) {
    const x = c.x + sx, seed = slot * 1.31 + c.i * 7.7 + sx * 0.13 + tr.k * 3.3;
    if (hash(seed) <= 0.07 * tr.sparks && x > -10 && x < LW + 10) out.push({ x, a, seed });
  }
  return out;
}

// the train's lights, for the rain falling through them: its windows (unless they are out), the headlight, the sparks
export function trainLights(tr, cars, t, lights) {
  for (const c of cars) if (!blink(tr, c.i, t)) lights.push({ x: c.x + CAR / 2, y: EL.side + 6, r: 52, type: 5, k: 0.55 });
  lights.push({ x: tr.x + tr.dir * 30, y: EL.bed - 4, r: 44, type: 5, k: 1 });
  for (const s of sparksOf(tr, cars, t)) lights.push({ x: s.x, y: EL.third, r: 40, type: 8, k: 1.4 });
}

// the signal: green for the next train, red once one has passed it, amber a while after
export function drawSignal(ctx, t, ex, ey) {
  let since = Infinity;
  const k = Math.floor(t / TRAIN.slot);
  for (const j of [k, k - 1, k - 2]) {
    const s = trainSlot(j), pass = s.start + ((s.dir > 0 ? EL.signal : LW - EL.signal) + TRAIN_LEN + TRAIN.pad) / TRAIN.speed;
    if (t >= pass) since = Math.min(since, t - pass);
  }
  const col = since < 8 ? '#ff3a30' : since < 14 ? '#ffb030' : '#40ff90';
  const y = since < 8 ? EL.bed - 20 : since < 14 ? EL.bed - 18 : EL.bed - 16;
  ctx.fillStyle = col;
  ctx.fillRect(EL.signal + ex, y + ey, 1, 1);
}
