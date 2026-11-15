// The city, in three depths painted once each: the far skyline (towers, the radio mast, the deco tower's floodlit
// crown, thousands of tiny windows), the middle row (rooftops at his height: water towers, antennas, a billboard, a
// hotel's vertical neon), and the block across the avenue below him (its wet roofs seen from above with what stands
// on them, its fronts with their windows, a fire escape, the shops at street level). Each painter returns its canvas
// and what lives on it: the windows that change (a lamp going off and on, a television, somebody crossing a room, a
// bad tube), the red lights that blink, the vents that steam, the ledge the pigeons sit on. The live bits and the
// signs are drawn per frame by the functions at the bottom.
import { LW, layer, rand, px, line, poly, oval, pixText, glyph, centre } from './Draw.js';
import { hash, lampOn, tvLight, walker, tubeFlicker } from './Timeline.js';
import { BLOCK, FOOT, LUCKY, HOTEL, BOARD, LOANS, DINER } from './Layout.js';

const WARM = ['#b8783e', '#d08c48', '#e0a45a', '#c89050'], COOL = ['#7890b8', '#90a8c8'], DARKWIN = '#0f0b16';

// a window of a given size: lit (a colour), with a curtain or blinds, or dark with the sky's glint on its glass
function windowPx(g, x, y, w, h, lit, r, style) {
  if (!lit) {
    px(g, DARKWIN, x, y, w, h);
    if (w > 1 && r() < 0.5) px(g, '#221a30', x + w - 1, y, 1, 1);
    return;
  }
  px(g, lit, x, y, w, h);
  if (w >= 3 && h >= 3) {
    px(g, '#f8d8a0', x, y, 1, 1);                                                    // the lamp's hot side
    if (style === 'curtain') { const c = r() < 0.5 ? '#8a3a34' : '#3c4c7a'; px(g, c, x, y, 1, h); px(g, c, x + w - 1, y, 1, h); }
    else if (style === 'blind') { for (let yy = y + 1; yy < y + h; yy += 2) px(g, 'rgba(40,20,10,0.55)', x, yy, w, 1); }
    else if (style === 'plant') px(g, '#1a2a14', x + w - 2, y + h - 2, 2, 2);
  } else if (w === 2 && h === 2 && style === 'curtain') px(g, '#7a3a30', x, y, 1, 2);
}

// ---------------------------------------------------------------- the far skyline
export function buildFar() {
  const L = layer(), g = L.g, r = rand(5), live = [], beacons = [];
  const tower = (x, top, w, col, edge, p, base = 124) => {
    px(g, col, x, top, w, base - top);
    px(g, edge, x, top, 1, base - top);                                              // the side the city lights
    for (let y = top + 2; y < base - 2; y += 3) for (let xx = x + 1; xx < x + w - 1; xx += 2) {
      const q = r();
      if (q > p) continue;
      const col2 = q < p * 0.3 ? COOL[Math.floor(r() * 2)] : WARM[Math.floor(r() * 2)];
      if (r() < 0.12) live.push({ x: xx, y, w: 1, h: 1, kind: 'lamp', col: col2, i: live.length * 3.1 + 0.5 });
      else px(g, col2, xx, y, 1, 1);
    }
  };
  // the back row: tall and dark, the tallest on the sides so the title has its sky
  let x = -58;
  while (x < LW + 58) {
    const w = 10 + Math.floor(r() * 16), cx = x + w / 2, mid = Math.abs(cx - LW / 2) < 95;
    const top = Math.round(mid ? 70 + r() * 12 : 44 + r() * 34);
    tower(x, top, w, '#100b1a', '#16102a', 0.1);
    if (r() < 0.4) px(g, '#100b1a', x + 2 + Math.floor(r() * (w - 6)), top - 3, 3, 3);   // a plant room on the roof
    if (r() < 0.25) { const ax = x + 1 + Math.floor(r() * (w - 2)); px(g, '#16102a', ax, top - 7, 1, 7); }
    x += w - (r() < 0.4 ? 3 : 0);
  }
  // the radio mast: a lattice tapering to a needle, its guys, three red lights
  const mx = 30, mb = 74, mt = 12;
  tower(18, mb, 26, '#110c1c', '#18122c', 0.12);
  for (let y = mt; y < mb; y++) {
    const half = 0.5 + (y - mt) / (mb - mt) * 2.5;
    px(g, '#1c1530', Math.round(mx - half), y, 1, 1); px(g, '#1c1530', Math.round(mx + half), y, 1, 1);
    if ((y - mt) % 5 === 0) px(g, '#1c1530', Math.round(mx - half), y, Math.round(half * 2) + 1, 1);
    else if ((y - mt) % 5 === 2) px(g, '#151026', mx, y, 1, 1);
  }
  line(g, '#140f24', mx, mt + 20, mx - 22, mb); line(g, '#140f24', mx, mt + 20, mx + 20, mb);
  [[mx, mt - 1, 1.6, 0], [mx, mt + 22, 1.6, 0.5], [mx, mt + 44, 1.6, 0.25]].forEach(([bx, by, per, ph]) => beacons.push({ x: bx, y: by, per, ph }));
  px(g, '#1c1530', mx, mt - 4, 1, 4);
  // the deco tower: setbacks, a floodlit crown with its ribs, the spire
  const dx = 336;
  tower(dx - 16, 44, 32, '#120d1e', '#1a1430', 0.14);
  tower(dx - 11, 32, 22, '#130e20', '#1c1532', 0.12, 44);
  tower(dx - 7, 23, 14, '#140f22', '#1d1634', 0.1, 32);
  for (const [w, y0, y1] of [[14, 23, 32], [22, 32, 35], [32, 44, 47]]) {
    px(g, '#7a5a3a', dx - w / 2, y0, w, y1 - y0 - (w === 14 ? 4 : 0));                 // the floodlit bands
    for (let xx = dx - w / 2 + 1; xx < dx + w / 2; xx += 3) px(g, '#4a3424', xx, y0, 1, y1 - y0 - (w === 14 ? 4 : 0));
  }
  px(g, '#a07a4a', dx - 7, 23, 14, 1);
  poly(g, '#3a2c2a', [[dx - 3, 23], [dx + 3, 23], [dx, 12]]);
  px(g, '#1c1532', dx, 3, 1, 10);
  beacons.push({ x: dx, y: 2, per: 2.1, ph: 0.7 });
  // a glass tower on the left, its grid of cold lights
  tower(-26, 30, 30, '#0e0c1c', '#151432', 0.0);
  for (let y = 33; y < 120; y += 3) for (let xx = -24; xx < 2; xx += 2) {
    const q = r();
    if (q < 0.16) px(g, q < 0.05 ? '#8ab0d0' : '#5a7098', xx, y, 1, 1);
    else if (q < 0.19) live.push({ x: xx, y, w: 1, h: 1, kind: 'lamp', col: '#8ab0d0', i: 900 + y + xx });
  }
  px(g, '#1a1a3a', -26, 30, 30, 1);
  beacons.push({ x: -12, y: 28, per: 1.8, ph: 0.2 });
  // the front row of the far city: lower, a shade lighter
  x = -58;
  while (x < LW + 58) {
    const w = 12 + Math.floor(r() * 20), top = Math.round(80 + r() * 16);
    tower(x, top, w, '#140e20', '#1a1328', 0.16);
    x += w;
  }
  return { c: L.c, live, beacons };
}

// ---------------------------------------------------------------- the middle row
// rooftops at about his height: [x0, x1, top, facade colour, what is on the roof]
const MID = [
  [-58, 16, 76, '#1a1424', 'tank'], [16, 78, 85, '#1c1528', 'board'], [78, 122, 70, '#1e1629', 'mast'], [122, 168, 88, '#1a1323', 'tank'],
  [168, 206, 78, '#1d1628', 'vents'], [206, 252, 90, '#1b1424', 'loans'], [252, 300, 74, '#1f172a', 'tank'], [300, 332, 58, '#1c1527', 'hotel'],
  [332, 400, 82, '#1e1628', 'vents'], [400, 442, 68, '#1a1424', 'mast'],
];
// a wooden water tower on legs: barrel with its hoops, a conical hat; w its width, foot the roof
function waterTower(g, x, foot, w, tones) {
  const [leg, wood, dark, roof, rim] = tones, h = Math.round(w * 1.05), top = foot - 4 - h;
  for (const lx of [x + 1, x + w - 2, x + Math.floor(w / 2)]) px(g, leg, lx, foot - 4, 1, 4);
  line(g, leg, x + 1, foot - 1, x + w - 2, foot - 4); line(g, leg, x + 1, foot - 4, x + w - 2, foot - 1);
  px(g, wood, x, top, w, h);
  px(g, dark, x + w - 2, top, 2, h);                                                // its shade side
  for (let yy = top + 2; yy < top + h; yy += 3) px(g, dark, x, yy, w, 1);           // hoops
  poly(g, roof, [[x - 1, top + 0.5], [x + w + 1, top + 0.5], [x + w / 2, top - Math.ceil(w * 0.45)]]);
  px(g, rim, x - 1, top, w + 2, 1);
}
export function buildMid() {
  const L = layer(), g = L.g, r = rand(17), live = [], beacons = [];
  for (const [x0, x1, top, col, what] of MID) {
    const w = x1 - x0;
    px(g, col, x0, top, w, 130 - top);
    px(g, '#251c32', x0, top, w, 1);                                                // the parapet's lit edge
    px(g, '#140f1c', x0, top + 1, w, 1);
    px(g, '#221a2e', x0, top, 1, 130 - top);
    // windows: 2 x 2 on floors 5 px apart, some lit, some alive
    for (let y = top + 4; y < 124; y += 5) for (let x = x0 + 3; x < x1 - 3; x += 4) {
      const q = r();
      if (q < 0.26) {
        const lit = q < 0.06 ? COOL[0] : WARM[Math.floor(r() * 4)];
        if (r() < 0.22) live.push({ x, y, w: 2, h: 2, kind: r() < 0.25 ? 'tv' : r() < 0.4 ? 'walk' : 'lamp', col: lit, i: x * 0.37 + y * 1.13 });
        else windowPx(g, x, y, 2, 2, lit, r, r() < 0.3 ? 'curtain' : '');
      } else windowPx(g, x, y, 2, 2, null, r);
    }
    if (what === 'tank') waterTower(g, x0 + 6 + Math.floor(r() * (w - 20)), top, 8, ['#1a1220', '#2e2026', '#22181e', '#1c1420', '#3a2a30']);
    if (what === 'vents') {
      px(g, '#161020', x0 + 5, top - 5, 8, 5); px(g, '#241a2c', x0 + 5, top - 5, 8, 1);    // a lift room
      px(g, '#161020', x1 - 10, top - 3, 3, 3); px(g, '#161020', x1 - 16, top - 2, 2, 2);
    }
    if (what === 'mast') {
      const ax = x0 + Math.floor(w / 2);
      px(g, '#221a30', ax, top - 22, 1, 22);
      for (let y = top - 18; y < top; y += 4) px(g, '#221a30', ax - 2, y, 5, 1);
      line(g, '#191326', ax, top - 14, ax - 9, top); line(g, '#191326', ax, top - 14, ax + 9, top);
      beacons.push({ x: ax, y: top - 23, per: 1.3 + r(), ph: r() });
    }
  }
  // the billboard on its scaffold: a cola ad lit from below by three lamps on arms
  const B = BOARD, bx = B.x, by = B.y;
  for (let x = bx + 3; x < bx + B.w; x += 9) { px(g, '#120c18', x, by + B.h, 1, 85 - by - B.h); line(g, '#120c18', x, by + B.h + 1, x + 6, 84); }
  px(g, '#2a1218', bx - 1, by - 1, B.w + 2, B.h + 2);
  px(g, '#9a1e2e', bx, by, B.w, B.h);
  px(g, '#80182a', bx, by + B.h - 4, B.w, 4);
  pixText(g, 'KOMET', bx + 3, by + 3, '#4a0c14', 2); pixText(g, 'KOMET', bx + 2, by + 2, '#fff0d8', 2);
  poly(g, '#fff0d8', [[bx + 2, by + 15], [bx + 17, by + 13], [bx + 18, by + 14], [bx + 3, by + 16]]);   // the swoosh under it
  pixText(g, 'COLA', bx + 21, by + 13, '#ffc060');
  px(g, '#2a0c10', bx + 40, by + 6, 5, 11); px(g, '#2a0c10', bx + 41, by + 2, 3, 4); px(g, '#c8c8d0', bx + 41, by + 1, 3, 1);   // the bottle
  px(g, '#e8e0d0', bx + 40, by + 10, 5, 3); px(g, '#c02030', bx + 41, by + 11, 3, 1); px(g, '#7a3a40', bx + 40, by + 6, 1, 4);
  // the lamps' light on it: two flat steps, brighter toward the bottom, where they are
  g.fillStyle = 'rgba(255,220,160,0.10)'; g.fillRect(bx, by + 5, B.w, B.h - 5);
  g.fillStyle = 'rgba(255,220,160,0.10)'; g.fillRect(bx, by + 11, B.w, B.h - 11);
  for (let i = 0; i < 3; i++) { const lx = bx + 6 + i * 17; px(g, '#120c18', lx, by + B.h, 1, 3); px(g, '#120c18', lx - 1, by + B.h + 2, 3, 1); }
  // the hotel's sign: a tall narrow box hung on its bracket
  px(g, '#0c0812', HOTEL.x - 1, HOTEL.y - 2, 9, 34); px(g, '#191226', HOTEL.x, HOTEL.y - 1, 7, 32);
  px(g, '#0c0812', HOTEL.x + 8, HOTEL.y + 2, 3, 1); px(g, '#0c0812', HOTEL.x + 8, HOTEL.y + 26, 3, 1);
  // the loan office's red sign on the roof, on its legs
  px(g, '#0c0812', LOANS.x - 1, LOANS.y - 1, 21, 7);
  for (const lx of [LOANS.x + 2, LOANS.x + 16]) px(g, '#0c0812', lx, LOANS.y + 6, 1, 90 - LOANS.y - 6);
  return { c: L.c, live, beacons };
}

// ---------------------------------------------------------------- the block across the avenue
// roof seen from above: wet tar with the sky's glow lying in streaks and puddles
function roof(g, b, r) {
  const { x0, x1, rb, pp } = b, w = x1 - x0;
  px(g, '#211b2b', x0, rb, w, pp - rb);
  px(g, '#3a3046', x0, rb, w, 1);                                                   // the back parapet's top
  px(g, '#17121f', x0, rb + 1, w, 1);                                               // its inner face
  px(g, '#2e263a', x0, rb, 1, pp - rb); px(g, '#2e263a', x1 - 1, rb, 1, pp - rb);   // the side parapets
  for (let i = 0; i < w / 5; i++) {                                                 // the sky's glow lying in the wet
    const y = rb + 3 + Math.floor(r() * (pp - rb - 4)), x = x0 + 2 + Math.floor(r() * (w - 4)), l = 3 + Math.floor(r() * 12);
    px(g, r() < 0.7 ? '#28212f' : '#2f2840', x, y, Math.min(l, x1 - 2 - x), 1);
  }
  for (let i = 0; i < 2; i++) {                                                      // puddles, a glint in each
    const cx = x0 + 8 + r() * (w - 16), cy = rb + 4 + r() * (pp - rb - 8), pw = 3 + r() * 5;
    oval(g, '#342c46', cx, cy, pw, 1.4);
    px(g, '#4e4664', cx - pw / 2 + 1, cy - 1, 2, 1);
  }
  for (let i = 0; i < w / 30; i++) {                                                 // a hatch, a vent pipe
    const x = x0 + 4 + Math.floor(r() * (w - 10)), y = rb + 4 + Math.floor(r() * (pp - rb - 8));
    if (r() < 0.5) { px(g, '#120e18', x - 1, y + 1, 4, 3); px(g, '#3a3244', x, y, 4, 3); px(g, '#4a4256', x, y, 4, 1); }
    else { px(g, '#120e18', x - 1, y + 1, 1, 2); px(g, '#4a4256', x, y - 2, 1, 3); }
  }
  // the front parapet: its coping lit by the street, its shadow on the roof
  px(g, '#151019', x0, pp - 1, w, 1);
  px(g, '#5a4858', x0, pp, w, 1);
  px(g, '#2c2230', x0, pp + 1, w, 1);
}
// a front going down to the street: windows on its floors, a cornice, rain stains, the shops below
function front(g, b, r, live, n0) {
  const { x0, x1, pp, wall } = b, w = x1 - x0, top = pp + 2;
  px(g, wall[0], x0, top, w, FOOT - top);
  px(g, wall[1], x0, top, w, 2);                                                    // the cornice catching the light
  px(g, '#140c14', x0, top + 2, w, 1);
  for (let i = 0; i < w / 9; i++) {                                                 // rain stains under the cornice
    const x = x0 + Math.floor(r() * w);
    px(g, 'rgba(10,6,12,0.35)', x, top + 3, 1, 3 + Math.floor(r() * 8));
  }
  px(g, '#0c0910', x0, top, 1, FOOT - top);
  let n = n0;
  for (let y = top + 4; y + 4 < FOOT - 8; y += 7) {
    for (let x = x0 + 4; x + 3 < x1 - 2; x += 7) {
      px(g, '#120a12', x - 1, y - 1, 5, 6);                                         // the opening's reveal
      px(g, wall[1], x - 1, y + 4, 5, 1);                                           // its sill
      const q = r();
      if (q < 0.42) {
        const col = q < 0.07 ? COOL[1] : WARM[Math.floor(r() * 4)];
        if (r() < 0.38) live.push({ x, y, w: 3, h: 4, kind: ['lamp', 'tv', 'walk', 'walk', 'tube', 'lamp'][Math.floor(r() * 6)], col, i: n++ * 7.31 });
        else windowPx(g, x, y, 3, 4, col, r, ['curtain', 'blind', 'plant', '', 'curtain'][Math.floor(r() * 5)]);
      } else windowPx(g, x, y, 3, 4, null, r);
    }
  }
  // street level: shopfronts under awnings, or their shutters down
  for (let x = x0 + 3; x + 10 < x1 - 2; x += 16 + Math.floor(r() * 6)) {
    const sw = 10 + Math.floor(r() * 4), open = r() < 0.55;
    if (open) {
      px(g, r() < 0.5 ? '#d8b070' : '#a8c8c0', x, FOOT - 6, sw, 5);
      px(g, '#3a2a20', x, FOOT - 6, sw, 1);
      px(g, 'rgba(20,10,8,0.5)', x + 2, FOOT - 4, 2, 3); px(g, 'rgba(20,10,8,0.5)', x + sw - 4, FOOT - 5, 2, 4);   // shelves, a customer
      const a = r() < 0.5 ? ['#7a1e24', '#c8b8a0'] : ['#1e4a3a', '#c8b8a0'];
      for (let k = 0; k < sw + 2; k += 2) px(g, a[(k / 2) % 2], x - 1 + k, FOOT - 8, 2, 2);   // the awning
    } else {
      px(g, '#2a2630', x, FOOT - 7, sw, 6);
      for (let yy = FOOT - 6; yy < FOOT - 1; yy += 2) px(g, '#363240', x, yy, sw, 1);
    }
  }
  return n;
}
function fireEscape(g, x0, x1, y0, y1) {
  const col = '#4a3a42', dark = '#1a1218';
  for (let y = y0; y < y1; y += 7) {
    px(g, col, x0, y + 5, x1 - x0, 1);                                              // the landing
    for (let x = x0; x <= x1; x += 3) px(g, col, x, y + 3, 1, 2);                    // its railing
    px(g, col, x0, y + 3, x1 - x0, 1);
    px(g, dark, x0, y + 6, x1 - x0, 1);
    if (y + 7 < y1) line(g, col, (y / 7) % 2 ? x0 + 2 : x1 - 2, y + 6, (y / 7) % 2 ? x1 - 4 : x0 + 4, y + 11);   // the stair down
  }
}
export function buildNear() {
  const L = layer(), g = L.g, r = rand(41), live = [], vents = [], chimneys = [];
  let ledge = null, n = 0;
  for (const b of BLOCK) {
    if (b.kind === 'alley') {
      // a narrow side street going back between two buildings: deep shadow, a lamp at its far end, wet glints
      px(g, '#0a0810', b.x0, 100, b.x1 - b.x0, FOOT - 100);
      px(g, '#191420', b.x0 + 3, 128, 4, 18);
      px(g, '#3a2e24', b.x0 + 4, 129, 2, 1);
      px(g, '#ffcc80', b.x0 + 4, 129, 1, 1);
      px(g, '#2a2228', b.x0 + 2, FOOT - 3, 6, 1);
      px(g, '#4a3c34', b.x0 + 3, FOOT - 2, 3, 1);
      continue;
    }
    roof(g, b, r);
    n = front(g, b, r, live, n);
    const { x0, x1, rb, pp } = b;
    if (b.kind === 'tank') {
      // a steel tank on a frame
      const tx = 4, top = rb - 6;
      px(g, '#1e1a24', tx, top + 10, 1, 6); px(g, '#1e1a24', tx + 11, top + 10, 1, 6);
      px(g, '#2c2a36', tx, top, 12, 10); px(g, '#3e3a4a', tx, top, 12, 1); px(g, '#1e1c28', tx + 9, top, 3, 10);
      oval(g, '#34303e', tx + 6, top, 6, 1.5);
      px(g, '#4a4656', tx + 2, top + 3, 1, 5);
      vents.push({ x: 26, y: rb + 6, k: 0.6 });
    }
    if (b.kind === 'sign') {
      // the frame the letters hang on, at the back of the roof
      for (const lx of [LUCKY.x + 2, LUCKY.x + 16, LUCKY.x + 30]) px(g, '#100c16', lx, LUCKY.y + 9, 1, rb - LUCKY.y - 7);
      px(g, '#100c16', LUCKY.x - 1, LUCKY.y + 10, 40, 1);
      px(g, '#1c1622', LUCKY.x + 41, rb - 4, 6, 4);                                  // the transformer box
    }
    if (b.kind === 'stair') {
      // the stair's bulkhead: a hut with its door, a bulb over it
      const hx = 150, hy = rb - 3;
      px(g, '#2a1c20', hx, hy, 14, 9); px(g, '#3a2830', hx, hy, 14, 1); px(g, '#1c1216', hx + 11, hy + 1, 3, 8);
      poly(g, '#221820', [[hx - 1, hy], [hx + 15, hy], [hx + 13, hy - 3], [hx + 1, hy - 3]]);
      px(g, '#120a0c', hx + 3, hy + 3, 4, 6); px(g, '#6a4a30', hx + 3, hy + 3, 1, 6);
      px(g, '#ffd890', hx + 4, hy + 1, 2, 1);
      vents.push({ x: 132, y: rb + 7, k: 1 }, { x: 178, y: rb + 9, k: 0.8 });
      for (const v of [[131, rb + 6], [177, rb + 8]]) { px(g, '#3a3440', v[0], v[1], 3, 2); px(g, '#4e4858', v[0], v[1], 3, 1); }
      ledge = { x0: x0 + 6, x1: x1 - 6, y: pp - 1 };
    }
    if (b.kind === 'skylight') {
      // a glass roof lit from the room under it, and two humming condensers
      poly(g, '#3a3020', [[208, rb + 9], [228, rb + 9], [224, rb + 4], [212, rb + 4]]);
      for (let x = 210; x < 227; x += 4) line(g, '#1a140e', x, rb + 9, x + 1, rb + 4);
      px(g, '#c89a58', 212, rb + 6, 3, 2); px(g, '#c89a58', 220, rb + 6, 3, 2); px(g, '#e8c080', 216, rb + 5, 3, 3);
      for (const ax of [236, 246]) { px(g, '#3a3644', ax, rb + 8, 7, 5); px(g, '#4e4a5a', ax, rb + 8, 7, 1); oval(g, '#1e1c26', ax + 3.5, rb + 10.5, 2.4, 1.6); }
    }
    if (b.kind === 'tower') {
      waterTower(g, 296, rb + 10, 14, ['#1e1418', '#4a3226', '#3a261e', '#2a1e22', '#5a4434']);
      fireEscape(g, 274, 292, pp + 3, FOOT - 10);
      vents.push({ x: 326, y: rb + 8, k: 0.7 });
      px(g, '#3a3440', 325, rb + 7, 3, 2);
    }
    if (b.kind === 'chimney') {
      for (const hx of [362, 370]) { px(g, '#3a2220', hx, rb - 6, 5, 9); px(g, '#4e302a', hx, rb - 6, 5, 1); px(g, '#100808', hx + 1, rb - 6, 3, 1); chimneys.push({ x: hx + 2, y: rb - 7 }); }
      // a television aerial: its mast, the fishbone
      const ax = 404;
      px(g, '#2a2430', ax, rb - 20, 1, 24);
      for (let k = 0; k < 6; k++) px(g, '#2a2430', ax - 3 + (k % 2), rb - 19 + k * 2, 7 - (k % 2) * 2, 1);
    }
    px(g, '#0c0910', x1 - 1, rb, 1, pp - rb);
  }
  return { c: L.c, live, vents, chimneys, ledge };
}

// ---------------------------------------------------------------- per frame
// the windows that change, drawn at the offset of their layer
export function drawLive(ctx, list, t, ox, oy) {
  for (const L of list) {
    const x = L.x + ox, y = L.y + oy;
    if (L.kind === 'tv') {
      const v = tvLight(L.i, t), col = ['#2a3c8a', '#3a52b0', '#4a64c8', '#6a84e8', '#8aa4ff'][Math.floor(v * 5)];
      ctx.fillStyle = '#0c0a1e'; ctx.fillRect(x, y, L.w, L.h);
      ctx.fillStyle = col; ctx.fillRect(x, y + (L.h > 2 ? 1 : 0), L.w, L.h - (L.h > 2 ? 1 : 0));
      continue;
    }
    const on = L.kind === 'tube' ? tubeFlicker(L.i, t) > 0.5 : L.kind === 'walk' || lampOn(L.i, t);
    ctx.fillStyle = on ? L.col : DARKWIN;
    ctx.fillRect(x, y, L.w, L.h);
    if (L.kind === 'walk' && L.w > 1) {
      const p = walker(L.i, t);
      if (p >= 0) {
        ctx.fillStyle = 'rgba(24,12,10,0.85)';
        const wx = x + Math.round(p * (L.w + 1)) - 1;
        if (wx >= x && wx < x + L.w) ctx.fillRect(wx, y + (L.h > 2 ? 1 : 0), 1, L.h - (L.h > 2 ? 1 : 0));
      }
    }
  }
}

// the red lights of the masts: a slow blink, a small stepped halo around when lit
export function drawBeacons(ctx, list, t, ox, oy, halo) {
  for (const b of list) {
    if (Math.sin((t / b.per + b.ph) * Math.PI * 2) < 0.2) continue;
    ctx.globalCompositeOperation = 'lighter';
    centre(ctx, halo, b.x + ox + 0.5, b.y + oy + 0.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(b.x + ox, b.y + oy, 1, 1);
  }
}

// neon letters, tube by tube: each lit pixel of the 3 x 5 glyph a `k` px block, the hot core on its top-left
function neonText(ctx, str, x, y, k, tube, core, lit) {
  [...str].forEach((ch, i) => {
    const a = lit[i] ?? 1;
    if (a <= 0) return;
    for (const [gx, gy] of glyph(ch)) {
      const X = x + i * (3 * k + 1) + gx * k, Y = y + gy * k;
      ctx.fillStyle = a > 0.5 ? tube : 'rgba(120,60,80,0.6)';
      ctx.fillRect(X, Y, k, k);
      if (a > 0.5 && k > 1) { ctx.fillStyle = core; ctx.fillRect(X, Y, 1, 1); }
    }
  });
}
const dead = (t, seed, rate = 0.08) => hash(Math.floor(t * 9) + seed) < rate;
// the signs: per frame their state, the letters, their halos (H: halo sprites by name), the LUCKY sign's
// reflection in the wet roof under it. Returns how bright each sign is (for the rain falling through their light).
export function drawSigns(ctx, t, H, near, mid) {
  const out = {};
  // HOTEL, vertical, cyan: its T is failing, the whole sign stutters now and then
  const hs = hash(Math.floor(t / 7)) < 0.5 && (t % 7) < 0.35 ? (hash(Math.floor(t * 20)) > 0.5 ? 1 : 0) : 1;
  const tOn = tubeFlicker(41, t) > 0.5 ? 1 : 0;
  out.hotel = hs;
  if (hs) { ctx.globalCompositeOperation = 'lighter'; centre(ctx, H.cyan, HOTEL.x + 3.5 + mid.x, HOTEL.y + 15 + mid.y); ctx.globalCompositeOperation = 'source-over'; }
  ['H', 'O', 'T', 'E', 'L'].forEach((ch, i) => neonText(ctx, ch, HOTEL.x + 2 + mid.x, HOTEL.y + i * 6 + mid.y, 1, '#7af4ff', '#e8ffff', [hs * (i === 2 ? tOn : 1)]));
  // LOANS, red, small, its N dead now and then
  const ln = dead(t, 3.3) ? 0 : 1;
  ctx.globalCompositeOperation = 'lighter'; centre(ctx, H.red, LOANS.x + 9.5 + mid.x, LOANS.y + 2.5 + mid.y); ctx.globalCompositeOperation = 'source-over';
  neonText(ctx, 'LOANS', LOANS.x + mid.x, LOANS.y + mid.y, 1, '#ff5048', '#ffd0c8', [1, 1, ln, 1, 1]);
  // the billboard's third lamp is going: when it drops, its third of the board goes dark
  const lamp3 = tubeFlicker(77, t);
  for (let i = 0; i < 3; i++) {
    const on = i < 2 || lamp3 > 0.5;
    ctx.fillStyle = on ? '#fff0c0' : '#4a4038';
    ctx.fillRect(BOARD.x + 5 + i * 17 + mid.x, BOARD.y + BOARD.h + 1 + mid.y, 3, 1);
  }
  if (lamp3 <= 0.5) { ctx.fillStyle = 'rgba(8,4,10,0.45)'; ctx.fillRect(BOARD.x + 32 + mid.x, BOARD.y + mid.y, BOARD.w - 32, BOARD.h); }
  out.board = 0.7 + 0.3 * (lamp3 > 0.5 ? 1 : 0);
  // LUCKY, pink, big, on the near roof: one letter buzzing, the whole of it dropping out on a bad night, a cyan star
  const drop = hash(Math.floor(t / 5.3) + 0.7) < 0.45 && (t % 5.3) > 3.6 && (t % 5.3) < 3.6 + 0.2 + hash(Math.floor(t / 5.3)) * 0.4;
  const main = drop ? (hash(Math.floor(t * 26)) > 0.6 ? 1 : 0) : 1, k1 = dead(t, 9.1, 0.12) ? 0 : 1;
  const lit = [main, main, main * k1, main, main];
  out.lucky = main;
  const lx = LUCKY.x + near.x, ly = LUCKY.y + near.y;
  if (main) {
    ctx.globalCompositeOperation = 'lighter';
    centre(ctx, H.pink, lx + 18, ly + 6);
    ctx.globalCompositeOperation = 'source-over';
  }
  neonText(ctx, 'LUCKY', lx, ly, 2, '#ff3a8c', '#ffd8ec', lit);
  const star = Math.floor(t * 2.5) % 3 !== 2;
  if (star) {
    ctx.fillStyle = '#5af0ff';
    ctx.fillRect(lx + 37, ly + 1, 1, 5); ctx.fillRect(lx + 35, ly + 3, 5, 1);
    ctx.fillStyle = '#e8ffff'; ctx.fillRect(lx + 37, ly + 3, 1, 1);
  }
  // its reflection in the wet roof: upside down, broken by the rain into rows that slide, only near the sign
  if (main) {
    const b = BLOCK[1], top = b.rb + 2, ry = (yy) => 2 * (LUCKY.y + 11) - yy;
    for (let row = top; row < top + 7; row++) {
      const gy = Math.floor((ry(row) - LUCKY.y) / 2);
      if (gy < 0 || gy > 4 || hash(row * 3.3 + Math.floor(t * 6)) < 0.3) continue;
      const shift = Math.round(Math.sin(row * 1.7 + t * 2.3) * 1.3);
      ctx.fillStyle = row - top < 3 ? 'rgba(255,70,150,0.3)' : 'rgba(255,70,150,0.16)';
      [...'LUCKY'].forEach((ch, i) => {
        if (!lit[i]) return;
        for (const [gx, gyy] of glyph(ch)) if (gyy === gy) ctx.fillRect(lx + i * 7 + gx * 2 + shift, row + near.y, 2, 1);
      });
    }
  }
  // the diner's amber letters over its window
  const dn = tubeFlicker(13, t) > 0.5;
  ctx.globalCompositeOperation = 'lighter'; centre(ctx, H.amber, DINER.x + 9.5 + near.x, DINER.y + 2.5 + near.y); ctx.globalCompositeOperation = 'source-over';
  neonText(ctx, 'DINER', DINER.x + near.x, DINER.y + near.y, 1, dn ? '#ffb850' : '#8a5a30', '#fff0c0', [1, 1, 1, 1, 1]);
  return out;
}
