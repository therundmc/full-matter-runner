// The static layers of the title scene, painted once: sky, clouds, haze, the far skyline, the mid row, the bar row
// (albedo, lit later per light group by shade()), the ground and its reflections, the props at the kerb, the
// foreground car and street lamp. Everything that moves is drawn live on top (Life, Water, Rain, Sign).
import { LW, LH, M, MY, CW, CH, GY, KERB, ROAD, canvas, rand, px, line, poly, crisp, grain, blur, cropTo } from './Draw.js';
import { clamp, smooth } from './Timeline.js';
import { LAMP, ROOF, TUBE, WIN, HYD, BOOTH, METER, DRAIN, MAN, PUDDLES } from './Layout.js';
import { paintSignAlbedo } from './Sign.js';

// below this row the bar row hides the sky, the far skyline and the mid row (but for the alley)
export const HIDDEN = 82;

export function buildSky() {
  const { c, g } = canvas(LW, LH);
  const gr = g.createLinearGradient(0, 0, 0, LH);
  for (const [y, col] of [[0, '#030108'], [30, '#090314'], [52, '#17052a'], [68, '#2e0a3e'], [84, '#4e1249'], [104, '#6e1c50'], [130, '#7c2453'], [LH, '#7c2453']]) gr.addColorStop(y / LH, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, LW, LH);
  grain(c, 0.06, 3);
  const r = rand(11);
  for (let i = 0; i < 80; i++) {
    const x = r() * LW, y = r() * r() * 70, b = r();
    px(g, `rgba(255,236,250,${0.12 + b * 0.5})`, x, y);
    if (b > 0.94) { px(g, 'rgba(255,236,250,0.22)', x - 1, y); px(g, 'rgba(255,236,250,0.22)', x + 1, y); px(g, 'rgba(255,236,250,0.15)', x, y - 1); px(g, 'rgba(255,236,250,0.15)', x, y + 1); }
  }
  haze(g);
  return c;
}
// thin wisps lit from below by the city, two screens wide for a seamless drift
export function buildClouds() {
  const w = LW * 2, { c, g } = canvas(w, 100), r = rand(21);
  for (let i = 0; i < 30; i++) {
    const x = r() * w, y = 10 + r() * 76, len = 30 + r() * 100, h = 1 + Math.round(r() * 2);
    const a = 0.04 + r() * 0.12 * (y / 80);
    for (const o of [-w, 0, w]) {
      px(g, `rgba(160,56,128,${a})`, x + o, y, len, h);
      px(g, `rgba(210,90,150,${a * 0.7})`, x + o + len * 0.2, y + h, len * 0.6, 1);
      px(g, `rgba(110,36,100,${a * 0.7})`, x + o + len * 0.1, y - 1, len * 0.5, 1);
    }
  }
  return c;
}
// haze of the city between the far skyline and the nearer rows (painted over the sky and the far skyline)
function haze(g) {
  const gr = g.createLinearGradient(0, 50, 0, 140);
  gr.addColorStop(0, 'rgba(150,40,110,0)'); gr.addColorStop(1, 'rgba(150,40,110,0.3)');
  g.fillStyle = gr; g.fillRect(-M, 50, CW, LH - 50);
}
// the sky lit from behind the skyline by sheet lightning (drawn additive, scaled by the flash)
export function buildFlash() {
  const { c, g } = canvas(LW, LH);
  const gr = g.createLinearGradient(0, 0, 0, 130);
  gr.addColorStop(0, 'rgba(120,90,190,0.25)'); gr.addColorStop(0.6, 'rgba(200,170,255,0.7)'); gr.addColorStop(1, 'rgba(230,200,255,0.9)');
  g.fillStyle = gr; g.fillRect(0, 0, LW, 130);
  return c;
}

export function buildFar(wins) {
  const { c, g } = canvas(), r = rand(7);
  g.translate(M, MY);
  const gr = g.createLinearGradient(0, 10, 0, 120);
  gr.addColorStop(0, '#170822'); gr.addColorStop(1, '#2a0e34');
  let x = -M;
  while (x < LW + M) {
    const w = 8 + Math.floor(r() * 18);
    const d = Math.abs(x + w / 2 - 192) / 192;      // 0 centre .. 1 edge
    const top = Math.round(60 + r() * 10 - 48 * smooth(0.42, 1.05, d) - (r() < 0.25 ? r() * 12 : 0));
    g.fillStyle = gr;
    g.fillRect(x, top, w, GY - top);
    const k = r();
    if (k < 0.3) g.fillRect(x + 2, top - 3, w - 4, 3);
    else if (k < 0.45) { g.fillRect(x + w / 2 - 2, top - 5, 4, 5); g.fillRect(x + w / 2, top - 10, 1, 5); }
    for (let wy = top + 4; wy < 110; wy += 3) {
      for (let wx = x + 2; wx < x + w - 2; wx += 3) {
        const q = r();
        if (q < 0.045) px(g, `rgba(${r() < 0.75 ? '235,170,90' : '150,200,255'},${0.3 + r() * 0.45})`, wx, wy);
        else if (q < 0.052) wins.push([wx, wy]);
      }
    }
    x += w + (r() < 0.2 ? 2 : 0);
  }
  // radio mast, left: lattice (its red light is live)
  g.fillStyle = '#170822';
  g.fillRect(14, 30, 17, GY);
  for (let y = 8; y < 30; y++) px(g, '#1e0b2a', 22 - Math.floor((y - 8) / 8), y, 1 + 2 * Math.floor((y - 8) / 8), 1);
  for (let y = 10; y < 30; y += 3) px(g, '#170822', 21 - Math.floor((y - 8) / 8), y, 3 + 2 * Math.floor((y - 8) / 8), 1);
  g.globalCompositeOperation = 'source-atop';
  haze(g);
  return cropTo(c, 0, 0, CW, HIDDEN + MY);
}

export function buildMid() {
  const { c, g } = canvas(), r = rand(5);
  g.translate(M, MY);
  const body = '#120818', rim = '#3a1442', win = '#5a3422';
  const block = (x, w, top, wins = 0.05) => {
    px(g, body, x, top, w, GY - top);
    px(g, rim, x, top, w, 1);
    px(g, '#0c0512', x + w - 1, top, 1, GY - top);
    for (let y = top + 4; y < 116; y += 5) {
      for (let wx = x + 2; wx < x + w - 3; wx += 4) {
        const q = r();
        if (q < wins) px(g, q < wins * 0.3 ? '#b07038' : win, wx, y, 2, 2);
      }
    }
  };
  block(-M, 40, 24); block(-8, 26, 32); block(16, 34, 30, 0.08); block(48, 34, 34); block(80, 30, 48);
  block(106, 50, 66); block(156, 40, 69); block(194, 50, 65); block(244, 50, 68);
  block(296, 30, 40, 0.08); block(330, 30, 30); block(358, 40, 26); block(398, 40, 34);
  for (const [x, y, w, h] of [[116, 62, 6, 4], [126, 64, 3, 2], [170, 66, 5, 3], [210, 61, 8, 4], [226, 63, 2, 2], [256, 64, 7, 4], [340, 27, 5, 3]]) px(g, body, x, y, w, h);
  // water tower on a roof, left
  const tx = 56, tt = 16;
  px(g, body, tx, tt + 5, 18, 12);
  for (let y = tt + 7; y < tt + 17; y += 4) px(g, '#22102c', tx, y, 18, 1);
  poly(g, body, [[tx - 1, tt + 6], [tx + 9, tt - 1], [tx + 19, tt + 6]]);
  px(g, rim, tx + 8, tt - 1, 2, 1); px(g, rim, tx, tt + 5, 18, 1);
  for (const lx of [tx + 1, tx + 16]) px(g, body, lx, tt + 17, 1, 34 - tt - 17);
  line(g, body, tx + 1, tt + 18, tx + 16, 33); line(g, body, tx + 16, tt + 18, tx + 1, 33);
  // the alley seen through the gap right of the bar: back wall, a door, a weak lamp
  px(g, '#24121f', 290, 64, 34, GY - 64);
  px(g, '#170a16', 302, 118, 9, 28);
  px(g, '#0e060e', 314, 132, 10, 14);
  const lg = g.createRadialGradient(307, 108, 0, 307, 108, 26);
  lg.addColorStop(0, 'rgba(255,170,90,0.4)'); lg.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = lg; g.fillRect(281, 82, 52, 64);
  // the palm's trunk rising from the alley (its fronds are live)
  for (let y = 38; y < GY; y++) {
    const xx = 304 + Math.round(Math.sin((y - 38) / 40) * 4);
    px(g, '#0b0412', xx, y, 2, 1);
    if (y % 5 === 0) px(g, '#1e0c26', xx, y, 1, 1);
  }
  crisp(c);
  // below the bar row's roofs only the alley shows: keep the top, and the alley as its own piece
  return { top: cropTo(c, 0, 0, CW, HIDDEN + MY), alley: cropTo(c, 284 + M, HIDDEN + MY - 2, 330 + M, GY + MY + 1) };
}

// the bar row: left neighbour, the bar and its sign, the alley gap, right neighbour (albedo; lit in TitleScene)
export function buildBarAlbedo(signGeometry) {
  const { c, g } = canvas(), r = rand(31);
  g.translate(M, MY);
  // ---- left neighbour: a three-storey stucco block, pawn shop shuttered at street level
  const L = 104;
  px(g, '#4e4860', -M, 38, L + M, GY - 38);
  px(g, '#6a6480', -M, 38, L + M, 1); px(g, '#5a546c', -M, 39, L + M, 2); px(g, '#2e2a3a', -M, 41, L + M, 1);
  px(g, '#5a546c', -M, 100, L + M, 2); px(g, '#34303e', -M, 102, L + M, 1);
  for (let i = 0; i < 30; i++) px(g, 'rgba(20,10,24,0.25)', -M + r() * (L + M), 42, 1, 6 + r() * 30);
  for (const wy of [50, 74]) {
    for (const wx of [-30, -6, 18, 42, 66, 88]) {
      if (wx + 12 > L) continue;
      px(g, '#24202e', wx - 1, wy - 1, 12, 16);
      px(g, '#0e0c16', wx, wy, 10, 14);
      px(g, '#181424', wx, wy + 6, 10, 1);
      px(g, '#6a647c', wx - 2, wy + 15, 14, 1);
    }
  }
  px(g, '#3a2430', -6, 74, 4, 14);
  for (const fy of [66, 92]) {
    px(g, '#1e1a26', 12, fy, 70, 2);
    px(g, '#1e1a26', 12, fy - 6, 70, 1);
    for (let x = 12; x <= 82; x += 5) px(g, '#1e1a26', x, fy - 6, 1, 6);
    for (let x = 14; x < 82; x += 7) px(g, '#16121c', x, fy + 2, 1, 2);
  }
  line(g, '#1e1a26', 70, 67, 50, 91); line(g, '#1e1a26', 73, 67, 53, 91);
  for (let k = 0; k < 6; k++) line(g, '#1e1a26', 70 - k * 3.4, 67 + k * 4, 73 - k * 3.4, 67 + k * 4);
  px(g, '#1e1a26', 30, 94, 1, 10); px(g, '#1e1a26', 34, 94, 1, 10);
  for (let y = 96; y < 104; y += 2) px(g, '#1e1a26', 30, y, 5, 1);
  // an air conditioner under a window, its drip is live; rust where it has run for years
  px(g, '#2a2832', 86, 65, 12, 8); px(g, '#6a6676', 87, 66, 10, 6); px(g, '#86828e', 87, 66, 10, 1);
  for (let x = 88; x < 96; x += 2) px(g, '#4a4656', x, 68, 1, 3);
  px(g, '#2a2832', 88, 73, 1, 2); px(g, '#2a2832', 95, 73, 1, 2);
  px(g, 'rgba(70,40,30,0.35)', 88, 74, 1, 26);
  px(g, '#3e3a48', 6, 104, 90, 8);
  px(g, '#2a2830', TUBE.x - 2, TUBE.y - 1, TUBE.w + 4, 1); px(g, '#4a4854', TUBE.x - 2, TUBE.y, 2, 2); px(g, '#4a4854', TUBE.x + TUBE.w, TUBE.y, 2, 2);
  px(g, '#4e4a5a', 10, 106, 30, 1); px(g, '#4e4a5a', 46, 106, 20, 1);
  px(g, '#64626e', 8, 113, 86, GY - 113);
  for (let y = 114; y < GY; y += 2) px(g, '#5a5864', 8, y, 86, 1);
  px(g, '#34323e', 8, 112, 86, 1); px(g, '#3e3c48', 8, GY - 3, 86, 3); px(g, '#8a8070', 50, GY - 4, 2, 2);
  g.globalAlpha = 0.5;
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 4.6;
    px(g, i < 26 ? '#c04a8a' : '#4aa0b0', 20 + i * 1.1 + Math.cos(a) * 3, 128 + Math.sin(a) * 4 - i * 0.12, 1, 1);
  }
  g.globalAlpha = 1;
  // ---- the bar: painted brick, peeling, a concrete plinth
  const B0 = 104, B1 = 300;
  px(g, '#5a4a54', B0, ROOF, B1 - B0, 3); px(g, '#7a6a74', B0, ROOF, B1 - B0, 1); px(g, '#241a20', B0, ROOF + 3, B1 - B0, 1);
  px(g, '#682c36', B0, ROOF + 4, B1 - B0, GY - ROOF - 4);
  for (let y = ROOF + 6; y < 138; y += 3) {
    if (r() < 0.55) continue;
    px(g, '#5c2630', B0 + r() * 150, y, 8 + r() * 40, 1);
  }
  // paint flaked off in jagged blobs, raw brick showing through, a few bricks picked out
  const patch = (cx, cy, rx, ry) => {
    for (let y = cy - ry; y <= cy + ry; y++) {
      const span = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) * (0.7 + r() * 0.5);
      if (span < 1) continue;
      const a = Math.round(cx - span + (r() - 0.5) * 3), b = Math.round(cx + span + (r() - 0.5) * 3);
      px(g, '#743e34', a, y, b - a, 1);
      for (let x = a + 1; x < b - 1; x++) if (r() < 0.18) px(g, '#82493c', x, y, 2, 1);
    }
  };
  patch(112, 86, 6, 4); patch(282, 96, 5, 5); patch(111, 128, 3, 5); patch(270, 104, 3, 2);
  px(g, '#504a54', B0, 138, B1 - B0, GY - 138); px(g, '#3e3a44', B0, 138, B1 - B0, 1);
  for (let i = 0; i < 30; i++) px(g, 'rgba(20,6,12,0.28)', B0 + r() * (B1 - B0), ROOF + 4, 1, 4 + r() * 24);
  const foot = g.createLinearGradient(0, 124, 0, GY);
  foot.addColorStop(0, 'rgba(10,4,10,0)'); foot.addColorStop(1, 'rgba(10,4,10,0.5)');
  g.fillStyle = foot; g.fillRect(B0, 124, B1 - B0, GY - 124);
  // window frame + sill (the glass is live)
  px(g, '#30222a', WIN.x - 2, WIN.y - 2, WIN.w + 4, WIN.h + 4);
  px(g, '#000000', WIN.x, WIN.y, WIN.w, WIN.h);
  px(g, '#8a848e', WIN.x - 3, WIN.y + WIN.h + 1, WIN.w + 6, 2); px(g, '#4a4450', WIN.x - 3, WIN.y + WIN.h + 3, WIN.w + 6, 1);
  px(g, 'rgba(10,4,10,0.35)', WIN.x + 2, WIN.y + WIN.h + 4, 3, 8);
  // the sign, its arrow and its electrics
  paintSignAlbedo(g, signGeometry);
  // canopy over the door (its valance is live)
  poly(g, '#3e1428', [[174, 102], [218, 102], [221, 107], [171, 107]]);
  px(g, '#5a2240', 174, 102, 44, 1);
  // double door: padded leaves, portholes, push plates, kick plates, step
  px(g, '#221816', 181, 110, 30, GY - 110);
  px(g, '#42141c', 183, 112, 13, GY - 112); px(g, '#42141c', 197, 112, 12, GY - 112);
  px(g, '#100608', 196, 112, 1, GY - 112);
  for (let y = 115; y < 140; y += 5) for (let x = 185; x < 209; x += 4) if (x !== 197) px(g, '#5a2830', x + ((y / 5) % 2 ? 2 : 0), y);
  for (const cx of [189, 202]) {
    g.fillStyle = '#9a94a2'; g.beginPath(); g.arc(cx + 0.5, 121.5, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(cx + 0.5, 121.5, 3, 0, Math.PI * 2); g.fill();
  }
  px(g, '#b09050', 193, 128, 2, 4); px(g, '#b09050', 198, 128, 2, 4);
  px(g, '#7a7480', 183, 140, 26, 4);
  px(g, '#7a7480', 178, GY - 2, 36, 2);
  // posters, dirty and peeling, below the arrow; old scraps and staples around
  const P = 240;
  px(g, 'rgba(200,190,170,0.3)', P - 2, 124, 3, 6); px(g, 'rgba(200,190,170,0.25)', P + 27, 136, 3, 3);
  px(g, '#9a6874', P, 121, 13, 16);
  px(g, '#4a2430', P + 2, 123, 9, 6); px(g, '#4a2430', P + 2, 131, 9, 1); px(g, '#4a2430', P + 2, 133, 6, 1);
  poly(g, '#b8aca4', [[P + 13, 132], [P + 13, 137], [P + 8, 137]]);
  px(g, '#9a8e70', P + 14, 119, 12, 13);
  g.fillStyle = '#7a2428'; g.beginPath(); g.arc(P + 20, 124, 3, 0, Math.PI * 2); g.fill();
  px(g, '#3a3226', P + 16, 128, 8, 1); px(g, '#3a3226', P + 16, 130, 6, 1);
  for (let x = P + 14; x < P + 26; x++) px(g, '#9a8e70', x, 132, 1, 1 + Math.round(r() * 2));
  px(g, '#5e7a82', P + 5, 138, 12, 6);
  px(g, '#22303a', P + 6, 139, 3, 4); px(g, '#22303a', P + 10, 139, 5, 1); px(g, '#22303a', P + 10, 141, 4, 1);
  for (const [x, y] of [[P, 121], [P + 12, 121], [P + 14, 119], [P + 25, 119], [P + 5, 138], [P + 16, 138]]) px(g, '#c8c0c0', x, y);
  // side door, steel, with a caged lamp over it
  px(g, '#201e26', 268, 114, 18, GY - 114);
  px(g, '#4e4e5a', 270, 116, 14, GY - 116);
  px(g, '#42424e', 270, 124, 14, 1); px(g, '#42424e', 270, 136, 14, 1);
  px(g, '#7a7a86', 272, 129, 10, 1); px(g, '#26262e', 282, 127, 1, 4);
  px(g, '#24222a', 276, 106, 3, 2); px(g, '#42404a', 275, 108, 5, 1); px(g, '#42404a', 275, 111, 5, 1);
  // drainpipe with brackets, gutter, shoe; rust run beside it
  px(g, '#34343c', 288, ROOF + 4, 12, 2);
  px(g, '#5a5a66', 293, ROOF + 6, 3, GY - ROOF - 8); px(g, '#70707c', 293, ROOF + 6, 1, GY - ROOF - 8);
  for (let y = ROOF + 12; y < GY; y += 14) px(g, '#2e2e36', 292, y, 5, 2);
  px(g, '#5a5a66', 293, GY - 3, 6, 3); px(g, '#2a2a32', 298, GY - 3, 1, 3);
  px(g, 'rgba(60,34,16,0.4)', 296, ROOF + 10, 2, 56);
  // dustbin, bin bags piled in the alley's mouth, bottles
  px(g, '#16161c', 287, 129, 7, 6);
  px(g, '#5e5e68', 286, 134, 9, GY - 134);
  for (let y = 137; y < GY; y += 3) px(g, '#4c4c56', 286, y, 9, 1);
  px(g, '#7a7a84', 285, 133, 11, 1);
  for (const [x, y, w, h] of [[301, 137, 8, 9], [307, 140, 7, 6], [303, 134, 5, 4]]) {
    g.fillStyle = '#121218'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
    px(g, '#3a3a4a', x + 2, y + 1, 2, 1); px(g, '#2a2a36', x + 1, y + 2, 1, 2);
  }
  px(g, '#121218', 304, 132, 2, 2);
  px(g, '#2a5a3a', 262, GY - 4, 2, 4); px(g, '#2a5a3a', 262, GY - 6, 1, 2);
  px(g, '#5a3a1a', 299, GY - 3, 1, 3); px(g, '#7a5a2a', 297, GY - 1, 3, 1);
  // ---- right neighbour: darker brick, three storeys, a shuttered launderette
  const R0 = 314, RW = LW + M - R0;
  px(g, '#5a3230', R0, 46, RW, GY - 46);
  px(g, '#7a6a70', R0, 46, RW, 2); px(g, '#241618', R0, 48, RW, 1);
  for (let y = 52; y < 104; y += 3) if (r() < 0.4) px(g, '#4e2a28', R0 + r() * 60, y, 10 + r() * 30, 1);
  for (const wy of [56, 80]) {
    for (const wx of [320, 344, 368, 392]) {
      px(g, '#322222', wx - 1, wy - 1, 12, 16);
      px(g, '#100c16', wx, wy, 10, 14);
      px(g, '#8a7c80', wx - 2, wy + 15, 14, 1);
    }
  }
  px(g, '#000000', 368, 56, 10, 14);
  px(g, '#3e2424', R0, 102, RW, 4);
  px(g, '#16141c', 320, 110, 60, 36);
  px(g, '#5a5864', 320, 110, 60, 18);
  for (let y = 111; y < 128; y += 2) px(g, '#4e4c58', 320, y, 60, 1);
  px(g, '#2e2c38', 320, 128, 60, 1);
  px(g, '#24222a', 386, 108, 14, GY - 108);
  // the bar's roof: an AC unit and a vent stack behind the parapet
  px(g, '#2a2228', 274, ROOF - 6, 12, 6); px(g, '#3a3036', 274, ROOF - 6, 12, 1); px(g, '#1a1418', 277, ROOF - 4, 6, 3);
  px(g, '#2a2228', 289, ROOF - 12, 3, 12); px(g, '#2a2228', 288, ROOF - 13, 5, 2);
  px(g, '#2a2228', 112, ROOF - 3, 6, 3);
  grain(c, 0.16, 41);
  return c;
}

export function buildGround() {
  const { c, g } = canvas(), r = rand(51);
  g.translate(M, MY);
  // pavement: concrete, a few slab joints converging a little towards the viewer
  px(g, '#6a6472', -M, GY, CW, KERB - GY);
  for (let i = 0; i < 20; i++) {
    const x0 = -M + i * 31 + r() * 6;
    if (r() < 0.3) continue;
    line(g, '#5a5462', x0, GY, 192 + (x0 - 192) * 1.12, KERB - 1);
  }
  px(g, '#605a68', -M, GY + 5, CW, 1);
  for (let i = 0; i < 26; i++) px(g, 'rgba(30,20,30,0.25)', -M + r() * CW, GY + r() * 10, 3 + r() * 14, 1 + r() * 2);
  px(g, '#9a94a2', -M, KERB, CW, 2);
  px(g, '#4a4654', -M, KERB + 2, CW, 3);
  px(g, '#1e1c26', -M, KERB + 5, CW, 2);
  // the drain grate in the kerb face, where the gutter runs
  px(g, '#08060c', DRAIN.x - 5, KERB + 2, 10, 4);
  for (let x = DRAIN.x - 4; x < DRAIN.x + 5; x += 2) px(g, '#3e3a48', x, KERB + 2, 1, 4);
  px(g, '#5a5664', DRAIN.x - 5, KERB + 1, 10, 1);
  // asphalt: smooth, a few repair patches and cracks
  px(g, '#3a3644', -M, ROAD, CW, CH - ROAD);
  for (let i = 0; i < 9; i++) px(g, '#33303d', -M + r() * CW, ROAD + 3 + r() * 40, 20 + r() * 40, 2 + r() * 4);
  for (let i = 0; i < 6; i++) {
    let x = -M + r() * CW, y = ROAD + 2 + r() * 40;
    for (let k = 0; k < 14; k++) { px(g, '#2a2632', x, y); x += 1; y += r() < 0.4 ? (r() < 0.5 ? -1 : 1) : 0; }
  }
  for (let x = -M; x < LW + M; x += 34) px(g, '#6a645a', x, 204, 18, 1);
  for (const [x, y, w, h] of PUDDLES) {
    for (let k = 0; k < h; k++) {
      const s = Math.round(Math.abs(k - (h - 1) / 2) * (w / h) * 0.35);
      px(g, '#1c1824', x + s, y + k, w - 2 * s, 1);
    }
  }
  for (let k = 0; k < 5; k++) {
    const s = [6, 2, 0, 2, 6][k];
    px(g, '#76728a', MAN.x - 9 + s, MAN.y - 2 + k, 18 - 2 * s, 1);
  }
  px(g, '#26222e', MAN.x - 7, MAN.y - 1, 14, 3);
  for (let x = MAN.x - 5; x < MAN.x + 6; x += 3) px(g, '#45414f', x, MAN.y);
  grain(c, 0.12, 52);
  return c;
}
// how wet the ground is: puddles (soft edged) shine most, the gutter too, the pavement little
function wetness(x, y) {
  let w = y < KERB ? 0.2 : y < ROAD ? 0.6 : 0.45;
  for (const [x0, y0, pw, ph] of PUDDLES) {
    const cx = x0 + pw / 2, cy = y0 + ph / 2, d = ((x - cx) / (pw / 2 + 3)) ** 2 + ((y - cy) / (ph / 2 + 1.5)) ** 2;
    if (d < 1) w = Math.max(w, 0.45 + 0.8 * (1 - d * d));
  }
  return w;
}
// reflections in the wet ground: long vertical smears under the bright things of the facade, running to the bottom
// of the picture (additive). item { x0, x1, y0, yc (centre of the smear), s (its length), c, k, soft, w (column weight) }
export function buildRefl(items) {
  const { c, g } = canvas();
  const id = g.createImageData(CW, CH), d = id.data, r = rand(61);
  const rows = new Float32Array(CH).map(() => (r() < 0.12 ? 0.35 : 0.65 + r() * 0.35));    // broken by ripples
  for (const it of items) {
    let j = 0.7;
    const soft = it.soft || 2;
    for (let x = it.x0 - soft; x <= it.x1 + soft; x++) {
      j = clamp(j + (r() - 0.5) * 0.5, 0.35, 1);                     // streaky columns
      const wc = it.w ? it.w(x) : 1;
      const e = x < it.x0 ? 1 - (it.x0 - x) / (soft + 1) : x > it.x1 ? 1 - (x - it.x1) / (soft + 1) : 1;
      for (let y = it.y0; y <= LH + MY - 1; y++) {
        const dy = y - it.yc, s = dy < 0 ? it.s * 0.4 : it.s;
        const k = Math.exp(-((dy / s) ** 2)) * it.k * j * wc * e * e * wetness(x, y) * rows[y + MY];
        if (k < 0.004) continue;
        const i = ((y + MY) * CW + x + M) * 4;
        d[i] = Math.min(255, d[i] + 255 * it.c[0] * k);
        d[i + 1] = Math.min(255, d[i + 1] + 255 * it.c[1] * k);
        d[i + 2] = Math.min(255, d[i + 2] + 255 * it.c[2] * k);
        d[i + 3] = 255;
      }
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

// street-level props in front of the facades: fire hydrant, phone booth, parking meter (lit like the ground)
export function buildProps() {
  const { c, g } = canvas();
  g.translate(M, MY);
  const { x, y: b } = HYD;
  px(g, '#8a2a26', x + 1, b - 9, 5, 9);
  px(g, '#a0322c', x, b - 7, 7, 2);
  px(g, '#8a2a26', x + 2, b - 11, 3, 2);
  px(g, '#6a2020', x - 1, b - 6, 2, 2); px(g, '#6a2020', x + 6, b - 6, 2, 2);
  px(g, '#b04a40', x + 1, b - 9, 1, 9);
  px(g, '#5a1a18', x, b - 1, 7, 1);
  // the booth: steel frame, roof with its lamp box, glass (lit from inside, live), the phone, a kick plate
  const { x: bx, y: by, w, h } = BOOTH, top = by - h;
  px(g, '#24262e', bx, top, w, h);
  px(g, '#3a3c46', bx - 1, top, w + 2, 3); px(g, '#5a5c66', bx - 1, top, w + 2, 1);
  px(g, '#2e3038', bx, by - 6, w, 6); px(g, '#4a4c56', bx, by - 6, w, 1);
  px(g, '#44464e', bx, top + 3, 1, h - 3); px(g, '#44464e', bx + w - 1, top + 3, 1, h - 3); px(g, '#44464e', bx + 6, top + 3, 1, h - 9);
  px(g, '#5a5e68', bx + 2, top + 12, 3, 6); px(g, '#2a2c34', bx + 2, top + 13, 1, 3); px(g, '#7a7e88', bx + 3, top + 12, 1, 1);
  line(g, '#16181e', bx + 3, top + 18, bx + 4, top + 22);
  px(g, '#1a1c22', bx, by, w, 1);
  // parking meter at the kerb
  px(g, '#3a3a44', METER.x, METER.y - 9, 1, 9);
  px(g, '#5a5a66', METER.x - 1, METER.y - 13, 3, 4); px(g, '#8a9a90', METER.x, METER.y - 12, 1, 1); px(g, '#2a2a32', METER.x - 1, METER.y - 10, 3, 1);
  grain(c, 0.1, 71);
  return cropTo(c, BOOTH.x - 2 + M, BOOTH.y - BOOTH.h - 2 + MY, HYD.x + 10 + M, HYD.y + 2 + MY);
}
// what glows on the booth (final colours, drawn over the lit props): the lamp box, the glass lit from inside
export function buildBoothGlow() {
  const { c, g } = canvas();
  g.translate(M, MY);
  const { x: bx, y: by, w, h } = BOOTH, top = by - h;
  px(g, '#e8f6ff', bx + 1, top + 1, w - 2, 1);
  for (const [x0, x1] of [[bx + 1, bx + 6], [bx + 7, bx + w - 1]]) {
    for (let y = top + 3; y < by - 6; y++) {
      const k = 1 - (y - top) / h * 0.6;
      g.fillStyle = `rgba(185,225,245,${(0.62 * k).toFixed(3)})`;
      g.fillRect(x0, y, x1 - x0, 1);
    }
  }
  px(g, 'rgba(230,250,255,0.5)', bx + 1, top + 3, 1, h - 9);
  px(g, '#c8d0d8', bx + 3, top + 12, 1, 1);
  return cropTo(c, bx - 1 + M, top + MY, bx + w + 1 + M, by + MY);
}

// foreground: the rear of a parked sedan (left) and a street lamp (right); painted in final colours, cut in two
export function buildFg() {
  const { c, g } = canvas();
  g.translate(M, MY);
  px(g, 'rgba(4,2,8,0.75)', -M, 199, 160, 8);          // the car's shadow on the road
  // body, glossy maroon, lighter on top where it takes the sky
  const bg = g.createLinearGradient(0, 136, 0, 202);
  bg.addColorStop(0, '#3a1a2e'); bg.addColorStop(0.35, '#2a0e1e'); bg.addColorStop(0.6, '#1e0a16'); bg.addColorStop(1, '#0e050c');
  poly(g, bg, [[-M - 4, 137], [24, 137], [29, 138], [47, 157], [94, 159], [99, 162], [101, 168], [101, 196], [98, 200], [-M - 4, 200]]);
  // side window, chrome frame, the C pillar
  poly(g, '#0c0816', [[-M, 140], [22, 140], [37, 156], [-M, 156]]);
  poly(g, '#1a1026', [[-M, 140], [-30, 140], [-30, 156], [-M, 156]]);
  line(g, '#5a5070', -M, 139, 23, 139); line(g, '#5a5070', 23, 139, 38, 155);
  px(g, '#8a80a0', -M, 157, 86, 1);
  // B pillar / rear door edge, handle, fuel flap
  px(g, '#0c040a', -24, 140, 3, 58); px(g, '#06020a', -24, 157, 1, 41);
  px(g, '#7a7090', -16, 162, 5, 1); px(g, '#140810', 20, 164, 6, 5);
  // trunk lid edge, body crease, rubbing strip
  px(g, '#4a2a3e', 47, 157, 47, 1);
  px(g, '#3a1c2e', -M, 170, 146, 1); px(g, '#12060e', -M, 171, 146, 1);
  px(g, '#4a4458', -M, 182, 146, 2); px(g, '#8a80a0', -M, 182, 146, 1);
  // tail lamp wrapping the corner
  px(g, '#3a0610', 92, 161, 9, 19); px(g, '#62101c', 93, 162, 7, 17);
  for (let y = 164; y < 179; y += 3) px(g, '#420812', 93, y, 7, 1);
  px(g, '#d0a070', 93, 179, 7, 1);
  // bumper, exhaust
  px(g, '#5e566e', 62, 186, 40, 5); px(g, '#b0a6c0', 62, 186, 40, 1); px(g, '#1e1826', 62, 191, 40, 1);
  px(g, '#2a2430', 86, 197, 6, 2);
  // wheel arch, tyre, rim
  g.fillStyle = '#05020a'; g.beginPath(); g.arc(40, 202, 18, Math.PI, 0); g.fill();
  g.fillStyle = '#0c080e'; g.beginPath(); g.arc(40, 205, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2e2836'; g.beginPath(); g.arc(40, 205, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16121c'; g.beginPath(); g.arc(40, 205, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a5468'; g.beginPath(); g.arc(40, 205, 2, 0, Math.PI * 2); g.fill();
  // street lamp: fluted pole with a pink rim from the sign on its left and the lamp's own warmth on its arm
  const P = LAMP.x + 26, bottom = LH + MY;
  px(g, '#1a131f', P, LAMP.y + 2, 6, bottom - LAMP.y);
  px(g, '#6a2a52', P, LAMP.y + 2, 1, bottom - LAMP.y);
  px(g, '#2e2438', P + 1, LAMP.y + 2, 1, bottom - LAMP.y);
  px(g, '#0e0a12', P + 5, LAMP.y + 2, 1, bottom - LAMP.y);
  for (let y = LAMP.y + 20; y < 176; y += 22) { px(g, '#120e16', P, y, 6, 1); px(g, '#3a3044', P, y + 1, 6, 1); }
  px(g, '#16101c', P - 3, 180, 12, bottom - 180); px(g, '#16101c', P - 2, 175, 10, 5); px(g, '#16101c', P - 1, 172, 8, 3);
  px(g, '#7a3a5e', P - 3, 180, 1, bottom - 180); px(g, '#4a3a54', P - 3, 180, 12, 1); px(g, '#3a3044', P - 2, 175, 10, 1);
  px(g, '#5a5060', P - 1, 186, 1, 1); px(g, '#5a5060', P + 7, 186, 1, 1);
  for (let k = 0; k <= 26; k++) {
    const a = k / 26, x = P + 2 - a * 24, y = LAMP.y + 4 - Math.sin(a * Math.PI * 0.75) * 5;
    px(g, '#1a131f', x, y, 2, 2);
    px(g, k < 18 ? '#5a3a3a' : '#8a5a3a', x, y, 2, 1);
  }
  poly(g, '#1e1824', [[LAMP.x - 12, LAMP.y - 3], [LAMP.x + 8, LAMP.y - 5], [LAMP.x + 10, LAMP.y], [LAMP.x - 10, LAMP.y]]);
  px(g, '#4a3e52', LAMP.x - 11, LAMP.y - 3, 18, 1); px(g, '#2a2232', LAMP.x - 10, LAMP.y - 1, 20, 1);
  // bills and stickers on the pole
  px(g, '#4e4440', P + 1, 120, 5, 7); px(g, '#2c3440', P + 1, 129, 5, 4); px(g, '#5a4a2e', P + 1, 150, 5, 5); px(g, '#3a3640', P + 1, 160, 5, 3);
  crisp(c);
  return { car: cropTo(c, 0, 130 + MY, 104 + M, CH), lamp: cropTo(c, LAMP.x - 14 + M, LAMP.y - 8 + MY, CW, CH) };
}
// what the neon lays on the car: rims, a smear in the glass, the glossy flank, sparks on the chrome
export function buildFgNeon(rgb, k) {
  const { c, g } = canvas();
  g.translate(M, MY);
  const col = (a) => `rgba(${rgb},${a * k})`;
  for (let x = -M; x < 24; x++) px(g, col(clamp((x + 40) / 64, 0, 1) * 0.6), x, 137);
  line(g, col(0.8), 25, 137, 46, 157);
  for (let x = 47; x < 93; x++) px(g, col(0.9), x, 158);
  px(g, col(1), 93, 159, 6, 1); px(g, col(0.75), 100, 163, 1, 12);
  poly(g, col(0.24), [[0, 140], [12, 140], [27, 155], [15, 155]]);
  poly(g, col(0.13), [[-22, 140], [-16, 140], [-1, 155], [-7, 155]]);
  for (let x = -M; x < 92; x++) {
    const a = clamp((x + 30) / 120, 0, 1);
    px(g, col(0.22 * a), x, 172, 1, 1); px(g, col(0.12 * a), x, 173, 1, 2); px(g, col(0.35 * a), x, 170, 1, 1);
  }
  for (const x of [10, 40, 66, 88]) px(g, col(1), x, 182, 2, 1);
  px(g, col(0.7), 62, 186, 40, 1);
  px(g, col(0.5), 93, 162, 2, 16);
  return cropTo(c, 0, 130 + MY, 104 + M, CH);
}
// cone of the street lamp in the damp air
export function buildCone() {
  const { c, g } = canvas(LW / 2, LH / 2);
  g.imageSmoothingEnabled = true;
  const x = LAMP.x / 2, y = (LAMP.y + 1) / 2;
  const gr = g.createLinearGradient(0, y, 0, LH / 2);
  gr.addColorStop(0, 'rgba(255,190,110,0.6)');
  gr.addColorStop(0.5, 'rgba(255,170,90,0.2)');
  gr.addColorStop(1, 'rgba(255,160,80,0.07)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.lineTo(x + 36, LH / 2); g.lineTo(x - 42, LH / 2); g.closePath(); g.fill();
  const x0 = Math.floor(x - 50);
  return cropTo(blur(c, 2), x0, 0, LW / 2, LH / 2);
}
// the bar's window: warm light behind blinds (people and rain are live)
export function buildWinBase() {
  const { c, g } = canvas(WIN.w, WIN.h);
  const gr = g.createRadialGradient(WIN.w * 0.55, WIN.h * 0.6, 2, WIN.w * 0.55, WIN.h * 0.6, WIN.w * 0.7);
  gr.addColorStop(0, '#f0a858'); gr.addColorStop(0.5, '#c86a2e'); gr.addColorStop(1, '#6a2a14');
  g.fillStyle = gr; g.fillRect(0, 0, WIN.w, WIN.h);
  g.fillStyle = 'rgba(80,240,255,0.5)'; g.fillRect(30, 4, 8, 1); g.fillRect(30, 7, 8, 1); g.fillRect(29, 5, 1, 2); g.fillRect(38, 5, 1, 2);
  g.fillStyle = 'rgba(255,80,60,0.45)'; g.fillRect(6, 3, 5, 3);
  return c;
}
