// The two glass towers behind the elevated line and what is seen far off between them. Each tower's curtain wall is
// painted once: the city behind him (his own block, its lit windows, a pink and a cyan neon) mirrored in the glass,
// each pane of it a little out of true so the reflection comes out wavy, the sky's glow in the high panes, the grid
// of mullions and floor lines over it, the corner catching the light, the street's sodium coming up the lower floors.
// A few offices are still lit and go dark and on again (drawn per frame). Far off, through the slit of sky, a few
// lower buildings, one with a red light on its mast.
import { LW, LH, M, MY, layer, canvas, rand, px, oval, glyph } from './Draw.js';
import { hash, lampOn } from './Timeline.js';
import { GAP, TOWERS, EYE } from './Layout.js';

const TOP = -MY, BOT = LH + MY;                  // a layer's full height, in logical px

// under the bridge's deck: its shadow on the floors just under it, then the sodium of the street coming up the lowest
// ones, in flat steps, over whatever is already painted on g
function streetGlow(g, x0, x1) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (const [y, h, a] of [[150, 10, 0.4], [160, 8, 0.25]]) { g.fillStyle = `rgba(4,3,10,${a})`; g.fillRect(x0, y, x1 - x0, h); }
  for (const [y, a] of [[172, 0.05], [184, 0.06], [194, 0.08], [202, 0.1]]) { g.fillStyle = `rgba(255,140,60,${a})`; g.fillRect(x0, y, x1 - x0, BOT - y); }
  g.restore();
}

// ---------------------------------------------------------------- far off, through the slit
export function buildFar() {
  const L = layer(), g = L.g, r = rand(41);
  const block = (x, top, w, col, edge) => {
    px(g, col, x, top, w, BOT - top);
    px(g, edge, x, top, 1, BOT - top);
    for (let y = top + 3; y < BOT; y += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) {
      if (r() < 0.09) px(g, r() < 0.7 ? '#a8743c' : '#6a7898', xx, y, 1, 1);
    }
  };
  block(GAP.x0 - 30, 108, 58, '#0e0b18', '#16112a');
  block(GAP.x0 + 22, 92, 26, '#100c1b', '#1a142e');
  block(GAP.x0 + 46, 112, 70, '#0d0a16', '#151026');
  // the water tower on the low one's roof, the mast on the tall one
  const wx = GAP.x0 + 62;
  px(g, '#0d0a16', wx, 102, 9, 7); oval(g, '#0d0a16', wx + 4.5, 102, 5, 2); px(g, '#0d0a16', wx + 1, 109, 1, 3); px(g, '#0d0a16', wx + 7, 109, 1, 3);
  px(g, '#100c1b', GAP.x0 + 34, 80, 1, 12);
  streetGlow(g, -M, LW + M);
  return { c: L.c, beacon: { x: GAP.x0 + 34, y: 79 } };
}
// the red light on the far mast, slow on and off
export function drawBeacon(ctx, far, t, ox, oy) {
  if (t % 2.4 > 1.1) return;
  ctx.fillStyle = '#ff3a2e';
  ctx.fillRect(far.beacon.x + ox, far.beacon.y + oy, 1, 1);
}

// ---------------------------------------------------------------- the city behind him, as the glass sees it
// The block he lives in and its neighbours: dark fronts against the glow of the sky, their lit windows, a neon; painted
// at the tower's size (w) from a list of fronts [x, top, width] (in the tower's px), then turned over as a mirror does.
const MIRRORS = {
  3: { fronts: [[-10, 70, 70], [60, 92, 56], [116, 16, 46], [162, 84, 60]], neon: { x: 79, y: 50, text: 'HOTEL', col: ['#2a1028', '#c8448e', '#ff8ac8'] } },
  8: { fronts: [[-4, 112, 60], [56, 98, 40], [96, 66, 44], [140, 104, 90]], neon: { x: 128, y: 116, text: 'LIQUOR', col: ['#0c2430', '#2a9aae', '#8af0fa'], flat: true } },
};
function mirrorOf(T, w) {
  const { c, g } = canvas(w, BOT - TOP), r = rand(T.seed * 31 + 7), y = (v) => v - TOP, spec = MIRRORS[T.seed];
  // the sky in the high panes: the city's glow under the cloud, lighter low down
  [['#111327', TOP], ['#13162c', 40], ['#161931', 80], ['#1a1d37', 120]].forEach(([col, y0]) => px(g, col, 0, y(y0), w, BOT - y0));
  for (const [x, top, bw] of spec.fronts) {
    px(g, '#08091a', x, y(top), bw, BOT);
    px(g, '#111428', x, y(top), bw, 1);
    for (let wy = top + 4; wy < BOT; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
      const q = r();
      if (q < 0.07) px(g, q < 0.015 ? '#4c4a66' : '#5e4630', wx, y(wy), 2, 3);
    }
  }
  // the neon: its tube round the board, its letters, a flat step of its light about it
  const N = spec.neon, len = N.text.length;
  const nw = N.flat ? len * 4 + 5 : 9, nh = N.flat ? 11 : len * 6 + 5;
  px(g, N.col[0], N.x - 3, y(N.y - 3), nw + 6, nh + 6);
  px(g, '#0c0a14', N.x, y(N.y), nw, nh);
  px(g, N.col[1], N.x, y(N.y), nw, 1); px(g, N.col[1], N.x, y(N.y + nh - 1), nw, 1);
  px(g, N.col[1], N.x, y(N.y), 1, nh); px(g, N.col[1], N.x + nw - 1, y(N.y), 1, nh);
  [...N.text].forEach((ch, i) => {
    const gx = N.flat ? N.x + 3 + i * 4 : N.x + 3, gy = N.flat ? N.y + 3 : N.y + 3 + i * 6;
    for (const [ax, ay] of glyph(ch)) px(g, N.col[2], gx + ax, y(gy + ay), 1, 1);
  });
  // as a mirror gives it back
  const out = canvas(w, BOT - TOP);
  out.g.scale(-1, 1);
  out.g.drawImage(c, -w, 0);
  return out.c;
}

// ---------------------------------------------------------------- the towers
function paintTower(g, T) {
  const w = T.x1 - T.x0, src = mirrorOf(T, w), { cell, floor } = T;
  px(g, '#0b0d1c', T.x0, TOP, w, BOT - TOP);
  // the glass: the mirror copied pane by pane, each pane a little out of true, the more so low down where it gives
  // back the fronts: their edges come out wavy
  for (let fy = TOP, j = 0; fy < BOT; fy += floor, j++) {
    for (let cx = 0, i = 0; cx < w; cx += cell, i++) {
      for (const [dy0, hh] of [[0, 3], [3, floor - 3]]) {
        const yy = fy + dy0, k = 0.8 + Math.min(1, Math.max(0, yy - 40) / 80) * 2.2;
        const dx = Math.round(Math.sin(j * 0.55 + i * 0.27 + T.seed + dy0 * 0.4) * k + (hash(i * 3.1 + j * 7.7 + dy0) - 0.5) * 1.2);
        const dy = Math.round(Math.sin(i * 0.7 + j * 0.31) * 0.8);
        g.drawImage(src, cx + dx, yy - TOP + dy, cell, hh, T.x0 + cx, yy, cell, hh);
      }
    }
  }
  // the grid: the mullions barely there, the floor lines a step lighter
  for (let cx = 0; cx < w; cx += cell) px(g, 'rgba(4,5,14,0.2)', T.x0 + cx, TOP, 1, BOT - TOP);
  for (let fy = TOP; fy < BOT; fy += floor) px(g, 'rgba(120,136,190,0.09)', T.x0, fy, w, 1);
  // the corner on the slit's side catches the glow
  const edge = T.x1 === GAP.x0 ? T.x1 - 1 : T.x0;
  px(g, '#343f68', edge, TOP, 1, BOT - TOP);
  px(g, '#080a14', T.x1 === GAP.x0 ? edge - 1 : edge + 1, TOP, 1, BOT - TOP);
}

export function buildTowers() {
  const L = layer(), g = L.g, live = [];
  for (const T of TOWERS) {
    paintTower(g, T);
    // the offices still lit: a run of panes on a floor, the warm of a desk lamp (none behind the logo, nor where
    // the glass gives back the train)
    const r = rand(T.seed * 13 + 1);
    for (let n = 0; n < 8; n++) {
      const fl = 2 + Math.floor(r() * 16), y = TOP + fl * T.floor + 1;
      const i0 = Math.floor(r() * ((T.x1 - T.x0) / T.cell - 6)), len = 2 + Math.floor(r() * 4), x = T.x0 + i0 * T.cell + 1;
      const x1 = x + len * T.cell, behindLogo = y < 64 && x1 > 80 && x < 304, inMirror = Math.abs(y - EYE) < 10;
      if (x < 8 || x1 > Math.min(T.x1, LW - 8) || (x < GAP.x1 && x1 > GAP.x0) || behindLogo || inMirror) continue;
      live.push({ x, y, w: len * T.cell - 1, h: T.floor - 1, col: r() < 0.7 ? ['#6e5638', '#5e4a32'] : ['#5a4836', '#4c3e30'], cell: T.cell, i: live.length * 3.1 + T.seed });
    }
  }
  streetGlow(g, -M, LW + M);
  return { c: L.c, live };
}

// the lit offices at the towers' offset (ox, oy): pane by pane, two tones, the desks' line low in them
export function drawOffices(ctx, towers, t, ox, oy) {
  for (const o of towers.live) {
    if (!lampOn(o.i, t)) continue;
    for (let x = 0, j = 0; x < o.w; x += o.cell, j++) {
      ctx.fillStyle = o.col[hash(o.i + j) < 0.6 ? 0 : 1];
      ctx.fillRect(o.x + x + ox, o.y + oy, Math.min(o.cell - 1, o.w - x), o.h - 1);
    }
    ctx.fillStyle = 'rgba(20,14,12,0.5)';
    ctx.fillRect(o.x + ox, o.y + o.h - 3 + oy, o.w, 1);
  }
}
