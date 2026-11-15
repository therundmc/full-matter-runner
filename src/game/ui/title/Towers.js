// The two glass towers behind the elevated line and the buildings far off between them, at the hour of the moment.
// Each layer is painted once as it looks by day (its albedo) and lit by the palette of the hour when it steps
// (Draw.tone with Cycle's bands), the lights added over it:
//   - the towers' curtain walls give back the city behind the viewer (his block, its windows, a pink and a cyan
//     neon), each pane a little out of true so the reflection comes out wavy; the glass takes the colour of the sky
//     of the moment, the high floors catch the first and the last sun; a solid crown on each, a mast on the right one
//     with its red light. At night the reflected windows glow, the neons come on one by one (stuttering as they
//     catch), offices are lit and go dark again; by day the sun glints in a few panes.
//   - far off, through the slit, lower buildings in the haze, their windows lighting one by one at dusk, a water
//     tower, a mast with its red light.
import { LW, LH, M, MY, layer, canvas, rand, px, oval, glyph, tone } from './Draw.js';
import { hash, lampOn } from './Timeline.js';
import { lampLit, officeLit, lightBands, glassBands, mix, css } from './Cycle.js';
import { GAP, TOWERS, EYE } from './Layout.js';

const TOP = -MY, BOT = LH + MY;                  // a layer's full height, in logical px
const RED = '#ff3a2e';

// the shadow the bridge's deck casts on the floors just under it (on whatever is painted on g)
function deckShade(g, x0, x1) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (const [y, h, a] of [[150, 10, 0.4], [160, 8, 0.25]]) { g.fillStyle = `rgba(4,3,10,${a})`; g.fillRect(x0, y, x1 - x0, h); }
  g.restore();
}
// a light on a mast: a red point slow on and off, while the city's lights are on
function beacon(ctx, x, y, P, t, phase) {
  if (P.lamps < 0.2 || (t + phase) % 2.4 > 1.1) return;
  ctx.fillStyle = RED;
  ctx.fillRect(x, y, 1, 1);
}

// ---------------------------------------------------------------- far off, through the slit
// [x, top, width] of each block; the water tower stands on the low one the sun goes down behind
const FAR = [[92, 98, 46], [136, 82, 24], [158, 100, 28], [184, 112, 44], [226, 92, 30], [254, 104, 32]];
export function buildFar() {
  const L = layer(), g = L.g, r = rand(41), wins = [];
  FAR.forEach(([x, top, w], i) => {
    const col = ['#465064', '#4e586c', '#424c60'][i % 3];
    px(g, col, x, top, w, BOT - top);
    px(g, '#5c667a', x, top, w, 1);
    px(g, '#5c667a', x, top, 1, BOT - top);
    px(g, '#384254', x + w - 1, top, 1, BOT - top);
    for (let k = 0; k < w / 12; k++) px(g, col, x + 3 + Math.floor(r() * (w - 8)), top - 2, 3 + Math.floor(r() * 3), 2);   // what stands on its roof
    // its windows in rows: dark glass, a few that light when the lamps come up, one by one
    for (let y = top + 3; y < BOT; y += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) {
      const q = r();
      if (q < 0.1) wins.push({ x: xx, y, col: r() < 0.7 ? '#a8743c' : '#6a7898', at: 0.12 + 0.7 * r() });
      else if (q < 0.7) px(g, '#3a4456', xx, y, 1, 1);
    }
  });
  const wx = 200;                                                                     // the water tower, the mast
  px(g, '#3e485a', wx, 102, 9, 7); oval(g, '#3e485a', wx + 4.5, 102, 5, 2); px(g, '#3e485a', wx + 1, 109, 1, 3); px(g, '#3e485a', wx + 7, 109, 1, 3);
  px(g, '#4e586c', 148, 68, 1, 14); px(g, '#4e586c', 147, 76, 3, 1);
  deckShade(g, -M, LW + M);
  return { albedo: L.c, c: canvas(L.c.width, L.c.height).c, wins, beacon: { x: 148, y: 67 } };
}
// the far layer at the hour: lit, in the haze of the hour, its windows lit as the lamps come up
export function paintFar(Fr, P) {
  tone(Fr.c, Fr.albedo, lightBands(P));
  const g = Fr.c.getContext('2d');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = css(P.haze.c, P.haze.k);
  g.fillRect(0, 0, Fr.c.width, Fr.c.height);
  g.globalCompositeOperation = 'source-over';
  for (const w of Fr.wins) if (P.lamps >= w.at) px(g, w.col, w.x + M, w.y + MY, 1, 1);
}
export const drawFarBeacon = (ctx, Fr, P, t, ox, oy) => beacon(ctx, Fr.beacon.x + ox, Fr.beacon.y + oy, P, t, 0);

// ---------------------------------------------------------------- the city behind the viewer, as the glass sees it
// His block and its neighbours: fronts against the sky, their windows, a neon; painted at the tower's size (w) from a
// list of fronts [x, top, width] (in the tower's px), then turned over as a mirror does. Three pictures of it: by day
// (the albedo), its lit windows alone, each neon lit alone. A neon comes on when the city's lamps reach `at`.
const MIRRORS = {
  3: { fronts: [[-10, 70, 70], [60, 92, 56], [116, 16, 46], [162, 84, 60]], neon: { x: 79, y: 50, text: 'HOTEL', col: ['#2a1028', '#c8448e', '#ff8ac8'], at: 0.1 } },
  8: { fronts: [[-4, 112, 60], [56, 98, 40], [96, 66, 44], [140, 104, 90]], neon: { x: 128, y: 116, text: 'LIQUOR', col: ['#0c2430', '#2a9aae', '#8af0fa'], flat: true, at: 0.32 } },
};
function mirrorOf(T, w) {
  const make = () => canvas(w, BOT - TOP), base = make(), lit = make(), neon = make(), r = rand(T.seed * 31 + 7), y = (v) => v - TOP;
  const spec = MIRRORS[T.seed], g = base.g;
  // the sky in the high panes, a little darker low down
  [['#c6cedc', TOP], ['#bac2d2', 40], ['#aeb6c8', 80], ['#a2aabe', 120]].forEach(([col, y0]) => px(g, col, 0, y(y0), w, BOT - y0));
  for (const [x, top, bw] of spec.fronts) {
    px(g, '#868ea2', x, y(top), bw, BOT);
    px(g, '#98a0b2', x, y(top), bw, 1);
    for (let wy = top + 4; wy < BOT; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
      const q = r();
      if (q < 0.07) px(lit.g, q < 0.015 ? '#56546e' : '#6e5234', wx, y(wy), 2, 3);
      else if (q < 0.3) px(g, '#767e92', wx, y(wy), 2, 3);
    }
  }
  // the neon: its board and dead tube by day; lit, its tube, its letters and a flat step of its light about it
  const N = spec.neon, len = N.text.length;
  const nw = N.flat ? len * 4 + 5 : 9, nh = N.flat ? 11 : len * 6 + 5;
  px(g, '#6a6e7c', N.x, y(N.y), nw, nh);
  const n = neon.g;
  px(n, N.col[0], N.x - 3, y(N.y - 3), nw + 6, nh + 6);
  px(n, '#0c0a14', N.x, y(N.y), nw, nh);
  for (const [gg, col] of [[g, '#7e8290'], [n, N.col[1]]]) {
    px(gg, col, N.x, y(N.y), nw, 1); px(gg, col, N.x, y(N.y + nh - 1), nw, 1);
    px(gg, col, N.x, y(N.y), 1, nh); px(gg, col, N.x + nw - 1, y(N.y), 1, nh);
  }
  [...N.text].forEach((ch, i) => {
    const gx = N.flat ? N.x + 3 + i * 4 : N.x + 3, gy = N.flat ? N.y + 3 : N.y + 3 + i * 6;
    for (const [ax, ay] of glyph(ch)) px(n, N.col[2], gx + ax, y(gy + ay), 1, 1);
  });
  // as a mirror gives it back
  const flip = (src) => { const out = canvas(w, BOT - TOP); out.g.scale(-1, 1); out.g.drawImage(src.c, -w, 0); return out.c; };
  return { base: flip(base), lit: flip(lit), neon: flip(neon), at: N.at };
}

// ---------------------------------------------------------------- the towers
// the mirror src copied onto g pane by pane, each pane a little out of true, the more so low down where it gives back
// the fronts: their edges come out wavy
function wavy(g, T, src) {
  const w = T.x1 - T.x0, { cell, floor } = T;
  for (let fy = T.top, j = 0; fy < BOT; fy += floor, j++) {
    for (let cx = 0, i = 0; cx < w; cx += cell, i++) {
      for (const [dy0, hh] of [[0, 3], [3, floor - 3]]) {
        const yy = fy + dy0, k = 0.8 + Math.min(1, Math.max(0, yy - 40) / 80) * 2.2;
        const dx = Math.round(Math.sin(j * 0.55 + i * 0.27 + T.seed + dy0 * 0.4) * k + (hash(i * 3.1 + j * 7.7 + dy0) - 0.5) * 1.2);
        const dy = Math.round(Math.sin(i * 0.7 + j * 0.31) * 0.8);
        g.drawImage(src, cx + dx, yy - TOP + dy, cell, hh, T.x0 + cx, yy, cell, hh);
      }
    }
  }
}
// The curtain wall: the reflection, then pane by pane two diagonal bands of sheen across the face and a pane here and
// there with its blind down; the grid over it: a thin mullion per pane and a heavier one every fourth, the floor slab
// dark with its sill catching the light under it.
function paintGlass(g, T, src) {
  const w = T.x1 - T.x0, { cell, floor } = T, h = BOT - T.top;
  px(g, '#5e6476', T.x0, T.top, w, h);
  wavy(g, T, src);
  for (let fy = T.top, j = 0; fy < BOT; fy += floor, j++) {
    for (let cx = 0, i = 0; cx < w; cx += cell, i++) {
      const d = (((cx + fy * 0.7 + T.seed * 13) % 96) + 96) % 96, a = d < 14 ? 0.16 : d > 30 && d < 36 ? 0.1 : 0;
      if (a) px(g, `rgba(255,255,255,${a})`, T.x0 + cx, fy, cell, floor);
      if (hash(i * 1.7 + j * 5.3 + T.seed) < 0.1) px(g, 'rgba(24,28,44,0.16)', T.x0 + cx + 1, fy + 1, cell - 1, floor - 1);
    }
  }
  for (let cx = 0, i = 0; cx < w; cx += cell, i++) px(g, i % 4 ? 'rgba(255,255,255,0.07)' : 'rgba(30,34,48,0.3)', T.x0 + cx, T.top, 1, h);
  for (let fy = T.top; fy < BOT; fy += floor) {
    px(g, 'rgba(30,34,52,0.34)', T.x0, fy, w, 1);
    px(g, 'rgba(255,255,255,0.1)', T.x0, fy + 1, w, 1);
  }
  // the corner on the slit's side catches the light
  const left = T.x1 === GAP.x0, edge = left ? T.x1 - 1 : T.x0;
  px(g, '#f0f2f8', edge, T.top, 1, h);
  px(g, '#3a3e4c', left ? edge - 1 : edge + 1, T.top, 1, h);
}
// the crown on the glass (a parapet, louvres of the plant floor), the mast with its rungs
function paintSolid(g, T) {
  const [x0, x1, top] = T.crown;
  px(g, '#6c6e78', x0, top, x1 - x0, T.top - top);
  px(g, '#a4a6b0', x0, top, x1 - x0, 1);
  px(g, '#868892', x0, top + 1, 1, T.top - top - 1);
  px(g, '#4c4e58', x1 - 1, top + 1, 1, T.top - top - 1);
  for (let y = top + 3; y < T.top - 2; y += 2) px(g, '#565862', x0 + 2, y, x1 - x0 - 4, 1);
  for (let x = x0 + 9; x < x1 - 4; x += 14) px(g, '#5e606a', x, top - 2, 5, 2);            // the plant on its roof
  px(g, '#4a4c56', T.x0, T.top - 2, T.x1 - T.x0, 1);                                    // the cornice over the glass
  px(g, '#b8bac4', T.x0, T.top - 1, T.x1 - T.x0, 1);
  if (!T.mast) return;
  const { x, top: mt } = T.mast;
  px(g, '#5c5e66', x, mt, 1, top - mt);
  px(g, '#5c5e66', x - 1, top - 6, 3, 6);
  for (let y = mt + 3; y < top - 6; y += 4) px(g, '#5c5e66', x - 1, y, 3, 1);
}

export function buildTowers() {
  const glass = layer(), solid = layer(), lit = layer(), live = [], neons = [];
  for (const T of TOWERS) {
    const mir = mirrorOf(T, T.x1 - T.x0), N = layer();
    paintGlass(glass.g, T, mir.base);
    paintSolid(solid.g, T);
    wavy(lit.g, T, mir.lit);
    wavy(N.g, T, mir.neon);
    neons.push({ ...crop(N.c), at: mir.at, i: T.seed });
    // the offices: a run of panes on a floor, the warm of a desk lamp (none behind the logo, nor where the glass gives
    // back the train)
    const r = rand(T.seed * 13 + 1);
    for (let n = 0; n < 14; n++) {
      const y = T.top + (1 + Math.floor(r() * 15)) * T.floor + 1;
      const i0 = Math.floor(r() * ((T.x1 - T.x0) / T.cell - 6)), len = 2 + Math.floor(r() * 4), x = T.x0 + i0 * T.cell + 1;
      const x1 = x + len * T.cell, behindLogo = y < 64 && x1 > 80 && x < 304, inMirror = Math.abs(y - EYE) < 10;
      if (x < 8 || x1 > Math.min(T.x1, LW - 8) || y > 136 || (x < GAP.x1 && x1 > GAP.x0) || behindLogo || inMirror) continue;
      live.push({ x, y, w: len * T.cell - 1, h: T.floor - 1, col: r() < 0.7 ? ['#6e5638', '#5e4a32'] : ['#5a4836', '#4c3e30'], cell: T.cell, i: live.length * 3.1 + T.seed });
    }
  }
  deckShade(glass.g, -M, LW + M);
  const blank = () => canvas(glass.c.width, glass.c.height).c;
  return { glass: glass.c, solid: solid.c, lit: lit.c, glassT: blank(), solidT: blank(), c: blank(), live, neons };
}
// the part of a layer canvas that has something on it: { c, x, y } (x, y in logical px)
function crop(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (!d[(y * c.width + x) * 4 + 3]) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return { c: canvas(1, 1).c, x: 0, y: 0 };
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1);
  out.g.drawImage(c, -x0, -y0);
  return { c: out.c, x: x0 - M, y: y0 - MY };
}

// the towers at the hour: the glass in the sky's colour, the crowns lit, the reflected windows glowing with the lamps;
// by day the bridge's silhouette (sil, a layer canvas) cast on them by the sun
export function paintTowers(Tw, P, sil) {
  tone(Tw.glassT, Tw.glass, glassBands(P));
  tone(Tw.solidT, Tw.solid, lightBands(P));
  const g = Tw.c.getContext('2d');
  g.clearRect(0, 0, Tw.c.width, Tw.c.height);
  g.drawImage(Tw.glassT, 0, 0);
  g.drawImage(Tw.solidT, 0, 0);
  if (P.lamps > 0.05) {
    g.globalAlpha = Math.min(1, P.lamps * 1.3);
    g.drawImage(Tw.lit, 0, 0);
    g.globalAlpha = 1;
  }
  if (P.shadow && sil) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = P.shadow.k;
    g.drawImage(sil, P.shadow.dx, P.shadow.dy);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

// what lives on the towers, at their offset (ox, oy): the neons in the glass, the mast's light, the lit offices (pane
// by pane, two tones, the desks' line low in them)
export function drawTowerLights(ctx, Tw, P, t, ox, oy) {
  for (const n of Tw.neons) if (lampLit(P.lamps, n.at, n.i, t)) ctx.drawImage(n.c, n.x + ox, n.y + oy);
  const mast = TOWERS[1].mast;
  beacon(ctx, mast.x + ox, mast.top - 1 + oy, P, t, 0.7);
  for (const o of Tw.live) {
    if (!officeLit(o.i, t, P, lampOn)) continue;
    for (let x = 0, j = 0; x < o.w; x += o.cell, j++) {
      ctx.fillStyle = o.col[hash(o.i + j) < 0.6 ? 0 : 1];
      ctx.fillRect(o.x + x + ox, o.y + oy, Math.min(o.cell - 1, o.w - x), o.h - 1);
    }
    ctx.fillStyle = 'rgba(20,14,12,0.5)';
    ctx.fillRect(o.x + ox, o.y + o.h - 3 + oy, o.w, 1);
  }
}

// The sun caught in the glass (s: Cycle.sunAt): on each tower a pane blazing where it gives the sun back, its
// neighbours a step less, a little star of light on it; the higher the sun, the lower in the glass.
export function drawGlints(ctx, s, P, t, ox, oy) {
  if (!s || P.glint <= 0) return;
  const k = P.glint * Math.min(1, s.up * 5), col = mix([255, 252, 236], [255, 196, 120], 1 - Math.min(1, s.up / 0.35));
  for (const [T, base] of [[TOWERS[0], 44], [TOWERS[1], 326]]) {
    const gx = base + (200 - s.x) * 0.35, i = Math.floor((gx - T.x0) / T.cell), j = Math.round((44 + s.y * 0.7 - T.top) / T.floor);
    const x = T.x0 + i * T.cell + 1, y = T.top + j * T.floor + 1, w = T.cell - 1, h = T.floor - 2;
    if (y < T.top + 2 || y > 132 || x < T.x0 + 2 || x + w > T.x1 - 2) continue;
    for (const [dx, dy, a] of [[0, 0, 0.8], [-1, 0, 0.3], [1, 0, 0.3], [0, -1, 0.35], [0, 1, 0.35], [0, -2, 0.12], [0, 2, 0.12]]) {
      ctx.fillStyle = css(col, (a * k).toFixed(3));
      ctx.fillRect(x + dx * T.cell + ox, y + dy * T.floor + oy, w, h);
    }
    const cx = x + (w >> 1) + ox, cy = y + (h >> 1) + oy, arm = 2 + (Math.sin(t * 2.6 + T.seed) > 0.3 ? 1 : 0);
    ctx.fillStyle = css([255, 255, 250], (0.9 * k).toFixed(3));
    ctx.fillRect(cx - arm, cy, 2 * arm + 1, 1);
    ctx.fillRect(cx, cy - arm, 1, 2 * arm + 1);
  }
}
