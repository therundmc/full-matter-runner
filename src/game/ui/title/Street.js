// The avenue seen from above: the far pavement under its sodium lamps, the kerb and its running gutter, the wet
// asphalt with the lamps lying in it in long broken streaks, the lane marks; and per frame the traffic (headlights
// raking the wet road ahead of the cars, their lights doubled in it) and now and then a patrol car, no siren, its
// bar throwing red and blue over the fronts across the street, the road and the rain.
import { LW, LH, MY, layer, rand, px, oval, poly, centre } from './Draw.js';
import { AVE, FOOT, LAMPS, EL, rowF, RGB } from './Layout.js';

// paint, glass and roof of the cars that pass (kind: Timeline.CARS)
const PAINT = [['#3c2a2c', '#5a3e3c'], ['#24303e', '#3a4a5a'], ['#4a4852', '#6a6874'], ['#5a1c20', '#7e2c2e'], ['#26362a', '#3c5040'], ['#3e3628', '#5a4e38'], ['#b08a24', '#e0b848']];
const TAXI = 6;
// cars parked along the far kerb (x of their middle) and the bus shelter on the pavement
const PARKED = [[44, 1], [70, 4], [158, 2], [236, 0], [318, 3], [344, 5]];
const SHELTER = { x: 120, w: 14 };
export const MANHOLE = { x: 232, y: 168 };

export function buildAvenue() {
  const L = layer(), g = L.g, r = rand(23), bottom = LH + MY;
  // the far pavement, wet, and the lamps' pools on it
  px(g, '#1e1826', -60, FOOT, LW + 120, AVE.kerb - FOOT);
  for (let i = 0; i < 40; i++) px(g, '#272032', -60 + r() * (LW + 120), FOOT + 1 + Math.floor(r() * 3), 2 + r() * 8, 1);
  px(g, '#3e3646', -60, AVE.kerb - 1, LW + 120, 1);                                 // the kerb's lit edge
  px(g, '#08060c', -60, AVE.kerb, LW + 120, 1);                                     // the gutter
  // the road
  px(g, '#0f0c16', -60, AVE.kerb + 1, LW + 120, bottom - AVE.kerb - 1);
  for (let i = 0; i < 60; i++) {
    const y = AVE.kerb + 2 + Math.floor(r() * (bottom - AVE.kerb - 2)), w = 3 + r() * 14;
    px(g, r() < 0.6 ? '#13101b' : '#0b0911', -60 + r() * (LW + 120), y, w, 1);
  }
  for (let i = 0; i < 6; i++) { const cx = -40 + r() * (LW + 80), cy = AVE.kerb + 6 + r() * 30; oval(g, '#181424', cx, cy, 5 + r() * 9, 1.3); px(g, '#2a2438', cx - 2, cy - 1, 2, 1); }
  for (let x = -60; x < LW + 60; x += 15) px(g, '#433e4c', x, 169, 6, 1);           // the lane's dashes
  px(g, '#2a2418', -60, AVE.kerb + 3, LW + 120, 1);                                // the faded yellow line along the far side
  // the manhole the steam comes out of
  oval(g, '#1e1a26', MANHOLE.x, MANHOLE.y, 4, 1.2); px(g, '#2e2838', MANHOLE.x - 3, MANHOLE.y - 1, 6, 1);
  // under the elevated line: its shadow on the road, the gaps of light between its columns
  px(g, '#07060a', -60, EL.girder[1], LW + 120, bottom - EL.girder[1]);
  for (const cx of EL.cols) px(g, '#121018', cx + 10, EL.girder[1] + 1, 80, 3);
  // the lamps: a pool on the pavement and the road under each head, its reflection running toward us in the wet
  for (const x of LAMPS) {
    const hx = x + 4;
    for (const [rx, ry, a] of [[26, 6, 0.06], [17, 4, 0.07], [9, 2.4, 0.08]]) oval(g, `rgba(${RGB.sodium},${a})`, hx, AVE.kerb + 4, rx, ry);
    for (let y = AVE.kerb + 2, k = 0; y < EL.bed; y += 1, k++) {
      if (r() < 0.3) continue;                                                       // broken by the rain
      const a = k < 8 ? 0.2 : k < 18 ? 0.12 : 0.06, w = k < 8 ? 3 : k < 18 ? 2 : 1;
      px(g, `rgba(255,180,90,${a})`, hx - Math.floor(w / 2), y, w, 1);
    }
    // the pole on the pavement, its arm out over the road, the head
    px(g, '#251f2c', x, 131, 1, FOOT + 3 - 131);
    px(g, '#251f2c', x + 1, 131, 3, 1); px(g, '#251f2c', x + 3, 132, 2, 1);
    px(g, '#3a3440', x + 2, 133, 4, 1);
    px(g, '#ffe4a8', x + 3, 134, 2, 1);
    px(g, '#0c0a10', x - 1, FOOT + 3, 3, 1);
  }
  // the cars parked at the kerb, dark, the lamps' light on their roofs and rain on their glass
  for (const [x, k] of PARKED) {
    const y = AVE.kerb + 4, [p0, p1] = PAINT[k], l = x - 8;
    px(g, '#060508', l, y + 3, 17, 1);
    px(g, p0, l, y - 1, 17, 4); px(g, p1, l, y - 1, 17, 1);
    px(g, '#0c0c14', l + 4, y - 3, 8, 2); px(g, p1, l + 5, y - 3, 6, 1);
    px(g, '#5a5468', l + 5 + Math.floor(r() * 5), y - 2, 1, 1);
    px(g, '#0a080c', l + 2, y + 2, 3, 1); px(g, '#0a080c', l + 12, y + 2, 3, 1);
    for (let i = 0; i < 4; i++) px(g, `rgba(${RGB.sodium},0.18)`, l + Math.floor(r() * 17), y - 1, 1, 1);
  }
  // the bus shelter: its roof, the glass, a lit poster at its end
  const S = SHELTER;
  px(g, '#2a2632', S.x, 135, S.w, 1); px(g, '#3e3a48', S.x, 135, S.w, 1);
  px(g, 'rgba(120,150,170,0.25)', S.x, 136, S.w - 4, 11);
  px(g, '#1a1820', S.x, 136, 1, 11); px(g, '#1a1820', S.x + S.w - 5, 136, 1, 11);
  px(g, '#d8e4ec', S.x + S.w - 4, 137, 4, 8); px(g, '#a83a4a', S.x + S.w - 3, 138, 2, 3); px(g, '#2a2a3a', S.x + S.w - 3, 142, 2, 2);
  px(g, '#3a3644', S.x + 2, 143, S.w - 7, 1);                                       // its bench
  return L.c;
}

// the lamp heads' little glow: steady, drawn over the rain
export function drawLampGlow(ctx, halo, sx, sy) {
  ctx.globalCompositeOperation = 'lighter';
  const f = rowF(134);
  for (const x of LAMPS) centre(ctx, halo, x + 4 + sx(f), 134 + sy(f));
  ctx.globalCompositeOperation = 'source-over';
}

// the avenue blitted row by row, each with its own parallax (the far pavement moves with the block, the bottom of
// the picture nearly with the elevated line)
export function drawAvenue(ctx, c, sx, sy) {
  const f0 = rowF(0);
  ctx.drawImage(c, 0, AVE.top + MY, c.width, FOOT - AVE.top, Math.round(sx(f0)) - (c.width - LW) / 2, AVE.top + Math.round(sy(f0)), c.width, FOOT - AVE.top);
  for (let y = FOOT; y < LH; y++) {
    const f = rowF(y);
    ctx.drawImage(c, 0, y + MY, c.width, 1, Math.round(sx(f)) - (c.width - LW) / 2, y + Math.round(sy(f)), c.width, 1);
  }
}

// one car, its middle at (x, y) on the road, going dir; lights: where its own lights are pushed for the rain
function car(ctx, x, y, dir, paint, lights, police) {
  x = Math.round(x); y = Math.round(y);
  const l = x - 8, nose = dir > 0 ? x + 8 : x - 9, tail = dir > 0 ? x - 9 : x + 8;
  // the headlights raking the wet road ahead
  ctx.globalCompositeOperation = 'lighter';
  const ahead = dir * 26;
  poly(ctx, 'rgba(255,230,170,0.045)', [[nose, y + 1], [nose, y + 3], [nose + ahead, y + 5], [nose + ahead, y - 1]]);
  poly(ctx, 'rgba(255,230,170,0.05)', [[nose, y + 1], [nose, y + 3], [nose + ahead * 0.55, y + 4], [nose + ahead * 0.55, y]]);
  // their reflections, and the tail lights', toward us in the wet
  for (let k = 0; k < 12; k++) {
    const a = k < 4 ? 0.3 : k < 8 ? 0.16 : 0.08;
    ctx.fillStyle = `rgba(255,236,190,${a})`; ctx.fillRect(nose, y + 4 + k, 1, 1);
    ctx.fillStyle = `rgba(255,40,30,${a * 0.8})`; ctx.fillRect(tail, y + 4 + k, 1, 1);
  }
  ctx.globalCompositeOperation = 'source-over';
  // the body seen from above and the side: its flank, the roof and the glass, the lights
  ctx.fillStyle = '#060508'; ctx.fillRect(l, y + 3, 17, 1);                         // its shadow on the road
  ctx.fillStyle = paint[0]; ctx.fillRect(l, y - 1, 17, 4);
  ctx.fillStyle = paint[1]; ctx.fillRect(l, y - 1, 17, 1);
  const cab = dir > 0 ? l + 3 : l + 6;
  ctx.fillStyle = '#0a0a12'; ctx.fillRect(cab, y - 3, 8, 2);
  ctx.fillStyle = paint[1]; ctx.fillRect(cab + 1, y - 3, 6, 1);
  ctx.fillStyle = '#4a5468'; ctx.fillRect(dir > 0 ? cab + 7 : cab, y - 2, 1, 1);    // the windscreen's glint
  ctx.fillStyle = '#0a080c'; ctx.fillRect(l + 2, y + 2, 3, 1); ctx.fillRect(l + 12, y + 2, 3, 1);   // wheels
  if (paint === PAINT[TAXI]) { ctx.fillStyle = '#fff2b0'; ctx.fillRect(cab + 3, y - 4, 2, 1); }   // the cab's roof light
  if (police) {
    ctx.fillStyle = '#d8d8e0'; ctx.fillRect(l + 5, y, 7, 2);                         // the white doors
    ctx.fillStyle = '#1a1a3a'; ctx.fillRect(l + 7, y, 3, 1);                         // the badge
  }
  ctx.fillStyle = '#fff6d8'; ctx.fillRect(nose, y, 1, 2);
  ctx.fillStyle = '#ff3020'; ctx.fillRect(tail, y, 1, 2);
  lights.push({ x: nose + dir * 6, y: y - 2, r: 22, type: 5, k: 0.8 }, { x: tail, y, r: 10, type: 6, k: 0.5 });
}

// people on the far pavement under their umbrellas, walking their way (deterministic loops)
const WALKERS = [{ v: 7, off: 30, dir: 1, brolly: '#14121a' }, { v: 5.5, off: 210, dir: -1, brolly: '#8a1e2a' }, { v: 6.5, off: 330, dir: 1, brolly: '#2a3a5a' }];
export function drawWalkers(ctx, t, sx, sy) {
  const y = 149, f = rowF(y);
  WALKERS.forEach((w, i) => {
    const d = (t * w.v + w.off) % (LW + 120) - 60, x = Math.round((w.dir > 0 ? d : LW - d) + sx(f)), yy = y + sy(f);
    const step = Math.floor(t * 3 + i) % 2;
    ctx.fillStyle = '#100c12'; ctx.fillRect(x, yy - 1, 1, 1 + step); ctx.fillRect(x + 1, yy - 1, 1, 2 - step);   // legs
    ctx.fillStyle = '#2a2026'; ctx.fillRect(x, yy - 4, 2, 3);                        // coat
    ctx.fillStyle = w.brolly; ctx.fillRect(x - 2, yy - 6, 6, 1); ctx.fillRect(x - 1, yy - 7, 4, 1);
    ctx.fillStyle = 'rgba(255,190,120,0.35)'; ctx.fillRect(x - 1, yy - 7, 3, 1);     // the lamps on its wet top
  });
}

// the traffic and the patrol car at t; sx, sy: parallax offset of a factor; H: the halo sprites; lights: the rain's
export function drawTraffic(ctx, cars, police, sx, sy, H, lights) {
  for (const c of cars) {
    const y = AVE.lanes[c.lane], f = rowF(y);
    car(ctx, c.x + sx(f), y + sy(f), c.dir, PAINT[c.kind], lights, false);
  }
  if (!police) return;
  const y = AVE.lanes[police.lane], f = rowF(y), x = police.x + sx(f), yy = y + sy(f);
  car(ctx, x, yy, police.dir, ['#121218', '#2a2a34'], lights, true);
  // the bar: red on one half, blue on the other, its flash thrown on the road around and on the fronts across
  const bx = Math.round(x) - 2, by = Math.round(yy) - 4, fn = rowF(FOOT - 9), nx = sx(fn) - sx(f), ny = sy(fn) - sy(f);
  ctx.fillStyle = police.red ? '#ff3a30' : '#4a1010'; ctx.fillRect(bx, by, 2, 1);
  ctx.fillStyle = police.blue ? '#5a8aff' : '#101a4a'; ctx.fillRect(bx + 2, by, 2, 1);
  ctx.globalCompositeOperation = 'lighter';
  if (police.red) {
    centre(ctx, H.redRoad, bx - 4, yy);
    centre(ctx, H.redWall, bx - 16 + nx, FOOT - 9 + ny + sy(f));
    lights.push({ x: police.x - 4, y: y - 6, r: 46, type: 6, k: 1.2 });
  }
  if (police.blue) {
    centre(ctx, H.blueRoad, bx + 6, yy);
    centre(ctx, H.blueWall, bx + 18 + nx, FOOT - 9 + ny + sy(f));
    lights.push({ x: police.x + 4, y: y - 6, r: 46, type: 7, k: 1.2 });
  }
  ctx.globalCompositeOperation = 'source-over';
}
