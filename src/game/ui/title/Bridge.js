// The elevated line's bridge across the lower part of the picture: heavy riveted steel, a deep deck girder the train
// runs on, a truss under it (posts, big X bracing, curved knee brackets, gusset plates at every joint), the bottom
// chord carrying the lower deck, a street name plate on it, two floodlights on its posts. The far truss shows dark
// through the near one; the patrol car runs along the lower deck between the two.
// Painted once as maps of colour indices, one per lighting: by night (lit from below by the street's sodium and by the
// floodlights: undersides lit, tops dark) and by day (the sun from above and from one side: tops lit, undersides in
// shade). When the palette steps, each pixel takes its colour from both: the day's rust lit by the light of the hour,
// the night's oxblood, mixed as the city's lamps come up (paintBridge). Also kept: `rim` (its lit edges, tinted red
// and blue for the patrol car's light) and `sil` (its silhouette, for the shadow it casts on the towers).
import { LW, M, MY, layer, canvas, rand, px, poly, pixText, centre } from './Draw.js';
import { EL, DECK } from './Layout.js';
import { lightBands, mix } from './Cycle.js';

const X0 = -M, X1 = LW + M;
// the colours of the steel and its fittings: [by day (lit by the hour), by night (as it is)]. 0..9: the steel from
// its darkest to its most lit (rust by day, oxblood at night); then the track, the floodlights, the name plate, the
// lower deck's road
const DAY_STEEL = ['#1c0c0a', '#2a110d', '#3a1711', '#4a1d14', '#5c2518', '#702d1c', '#863821', '#9c4527', '#b2552e', '#c66a38'];
const NIGHT_STEEL = ['#140808', '#1d0b0b', '#28100f', '#341412', '#401915', '#4e1e17', '#60261a', '#76301d', '#904022', '#ac5429'];
const K = { tie: 10, rail: 11, shine: 12, housing: 13, bracket: 14, lens: 15, plateRim: 16, plate: 17, letters: 18, road: 19 };
const FITTINGS = [
  ['#3a2e28', '#16100e'], ['#8a8890', '#5a5866'], ['#c8c6d0', '#9a98b0'], ['#3a3a40', '#141418'], ['#4a3a36', '#1c0c0c'],
  ['#c8ccd0', '#ffe2a8'], ['#9a7a48', '#6a5030'], ['#1e1612', '#140e0a'], ['#e8c070', '#d0a250'], ['#2a2224', '#120a0a'],
];
const rgbOf = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const DAYC = [...DAY_STEEL, ...FITTINGS.map((f) => f[0])].map(rgbOf), NIGHTC = [...NIGHT_STEEL, ...FITTINGS.map((f) => f[1])].map(rgbOf);
const N = DAYC.length, EMPTY = 255;
export const LAMP_AT = 0.3;                      // the floodlights come on when the city's lamps reach this

const panels = () => EL.posts.slice(0, -1).map((p, i) => [p + EL.post, EL.posts[i + 1]]);

// a truss in one colour, shifted by dx: chords, posts, X bracing, knee brackets, gussets
function truss(g, col, dx = 0, chord = true) {
  const [ct, cb] = EL.chord, [bt, bb] = EL.bottom, P = EL.post, R = 10, d = 7;
  if (chord) px(g, col, X0, ct, X1 - X0, cb - ct);
  px(g, col, X0, bt, X1 - X0, bb - bt);
  for (const p of EL.posts) {
    px(g, col, p + dx, cb, P, bt - cb);
    px(g, col, p + dx - 4, cb, P + 8, 6);                                            // gussets at the joints
    px(g, col, p + dx - 5, bt - 8, P + 10, 8);
  }
  for (const [a0, q0] of panels()) {
    const a = a0 + dx, q = q0 + dx, cx = (a + q) / 2, cy = (cb + bt) / 2;
    poly(g, col, [[a, cb], [a + d, cb], [q, bt], [q - d, bt]]);
    poly(g, col, [[q - d, cb], [q, cb], [a + d, bt], [a, bt]]);
    px(g, col, cx - 6, cy - 5, 12, 10);
    for (let y = 0; y < R; y++) {                                                    // the curved knee brackets
      const w = Math.round(R - Math.sqrt(R * R - (R - y) * (R - y)));
      if (w > 0) { px(g, col, a, cb + y, w, 1); px(g, col, q - w, cb + y, w, 1); }
    }
  }
}
// what `paint` puts on a layer canvas, read back: its alpha per pixel
function alphaOf(paint) {
  const L = layer();
  paint(L.g);
  return { w: L.c.width, h: L.c.height, a: L.g.getImageData(0, 0, L.c.width, L.c.height).data };
}

export function buildBridge() {
  const [ct, cb] = EL.chord, [bt, bb] = EL.bottom;
  // the far truss and what is seen of the decks between the two: by night as it was, by day in its own shade
  const back = alphaOf((g) => truss(g, '#fff', 18, false)), w = back.w, h = back.h, size = w * h;
  const backNight = new Uint8Array(size).fill(EMPTY), backDay = new Uint8Array(size).fill(EMPTY);
  for (let i = 0; i < size; i++) if (back.a[i * 4 + 3]) { backNight[i] = 1; backDay[i] = 3; }
  // fill a rectangle (logical px) of each map with its index (or k)
  const fill = (maps, k, x, y, ww, hh) => {
    for (let yy = Math.round(y) + MY; yy < Math.round(y + hh) + MY; yy++) for (let xx = Math.round(x) + M; xx < Math.round(x + ww) + M; xx++) {
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      for (const [m, v] of maps) m[yy * w + xx] = v ?? k;
    }
  };
  fill([[backNight, 0], [backDay, 1]], 0, X0, cb, X1 - X0, 3);                         // the floor beams under the track
  fill([[backNight], [backDay]], K.road, X0, bt - 3, X1 - X0, 3);                     // the lower deck's road
  fill([[backNight, 1], [backDay, 3]], 0, X0, bt - 4, X1 - X0, 1);

  // the near truss: its shape, then each pixel shaded by what is around it, for each lighting
  const src = alphaOf((g) => truss(g, '#fff')).a;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  const night = new Uint8Array(size).fill(EMPTY), sunL = new Uint8Array(size).fill(EMPTY), sunR = new Uint8Array(size).fill(EMPTY);
  const rim = canvas(w, h), rimData = rim.g.createImageData(w, h), rd = rimData.data;
  const lamps = EL.lamps.map((p) => [p + EL.post + 2 + M, 157 + MY]);
  const r = rand(17), clampK = (k) => Math.max(0, Math.min(9, k));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const ly = y - MY, i = y * w + x;
    const down = !on(x, y + 1), up = !on(x, y - 1), left = !on(x - 1, y), right = !on(x + 1, y);
    // by night: lit from below, brighter by the lamps
    let k = ly < 170 ? 3 : ly < 184 ? 4 : 5;
    if (down) k += 3; else if (up) k -= 2;
    if (left && !down) k += 1; else if (right && !down) k -= 1;
    for (const [lx, lyy] of lamps) { const q = Math.hypot(x - lx, (y - lyy) * 1.3); if (q < 30) k += q < 15 ? 2 : 1; }
    if (ly === ct || ly === ct + 1) k = 6;                                           // the wet top of the girder
    night[i] = clampK(k);
    // by day: lit from above and from the sun's side, the girder's shade under the deck
    let d = ly < cb ? 5 : 4;
    if (up) d += 3; else if (down) d -= 2;
    if (ly >= cb && ly < cb + 5 && !up) d -= 1;
    sunL[i] = clampK(d + (left && !up ? 1 : right && !up ? -1 : 0));
    sunR[i] = clampK(d + (right && !up ? 1 : left && !up ? -1 : 0));
    if (ly > 156 && (down || ((left || right) && r() < 0.6))) { const j = i * 4; rd[j] = rd[j + 1] = rd[j + 2] = 255; rd[j + 3] = 255; }
  }
  rim.g.putImageData(rimData, 0, 0);

  // the details, in logical px, the same in every lighting: the girder's flanges, rivets in rows, rust run down from
  // them, the rails on top, the floodlights, the name plate
  const maps = [[night], [sunL], [sunR]], ip = (k, x, y, ww = 1, hh = 1) => fill(maps, k, x, y, ww, hh);
  ip(2, X0, ct + 2, X1 - X0, 1);
  ip(2, X0, cb - 3, X1 - X0, 1);
  const rivet = (x, y) => ip(5, x, y);
  for (let x = X0; x < X1; x += 4) { rivet(x, ct + 4); rivet(x + 2, cb - 2); rivet(x, bt + 1); rivet(x + 2, bb - 2); }
  for (const p of EL.posts) {
    for (let y = cb + 2; y < bt - 1; y += 4) { rivet(p + 1, y); rivet(p + EL.post - 2, y); }
    for (let y = bt - 6; y < bt; y += 3) for (let x = p - 3; x < p + EL.post + 4; x += 3) rivet(x, y);
  }
  for (const [a, q] of panels()) {
    const cx = Math.round((a + q) / 2), cy = Math.round((cb + bt) / 2);
    for (let y = cy - 3; y < cy + 5; y += 3) for (let x = cx - 4; x < cx + 5; x += 3) rivet(x, y);
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.round(X0 + r() * (X1 - X0)), y = r() < 0.6 ? ct + 5 : bt + 2;
    ip(1, x, y, 1, 2 + Math.floor(r() * 4));
  }
  // the track on the girder: ties, the rail and its shine
  for (let x = X0; x < X1; x += 4) ip(K.tie, x, ct - 2, 3, 2);
  ip(K.rail, X0, ct - 1, X1 - X0, 1);
  for (let i = 0; i < 30; i++) ip(K.shine, X0 + r() * (X1 - X0), ct - 1, 2 + r() * 6, 1);
  // the floodlights on their posts
  for (const p of EL.lamps) {
    const x = p + EL.post;
    ip(K.bracket, x, 154, 3, 1);
    ip(K.housing, x + 1, 154, 4, 3);
    ip(K.lens, x + 2, 157, 3, 1);
  }
  // the name plate on the bottom chord
  const Pl = EL.plate, pw = Pl.text.length * 4 + 5;
  ip(K.plateRim, Pl.x - 1, Pl.y - 1, pw + 2, 9);
  ip(K.plate, Pl.x, Pl.y, pw, 7);
  const la = alphaOf((g) => pixText(g, Pl.text, Pl.x + 3, Pl.y + 1, '#fff')).a;
  for (let i = 0; i < size; i++) if (la[i * 4 + 3]) for (const [m] of maps) m[i] = K.letters;

  // the rim's lit edges, tinted for the patrol car's two colours
  const tint = (col) => {
    const t = canvas(w, h);
    t.g.drawImage(rim.c, 0, 0);
    t.g.globalCompositeOperation = 'source-in';
    t.g.fillStyle = col;
    t.g.fillRect(0, 0, w, h);
    return t.c;
  };
  // the silhouette of the near truss and its track, for its shadow
  const sil = canvas(w, h), sd = sil.g.createImageData(w, h);
  for (let i = 0; i < size; i++) if (night[i] !== EMPTY) sd.data[i * 4 + 3] = 255;
  sil.g.putImageData(sd, 0, 0);
  // each row's band of light (Cycle.lightBands' rows stay where they are)
  const bands = lightBands({ light: [0, 0, 0], low: [0, 0, 0] }), rowBand = new Uint8Array(h);
  for (let y = 0; y < h; y++) rowBand[y] = Math.max(0, bands.findIndex((b) => y - MY >= b.y0 && y - MY < b.y1));
  return {
    w, h, rowBand, maps: { back: [backDay, backNight], sunL: [sunL, night], sunR: [sunR, night] },
    back: canvas(w, h), front: canvas(w, h), rim: { red: tint('#ff3a2e'), blue: tint('#3a6aff') }, sil: sil.c,
  };
}

// how far the night's look has taken over the day's, by the city's lamps
const nightK = (P) => Math.max(0, Math.min(1, (P.lamps - 0.2) / 0.6));

// The bridge at the hour P (Cycle.lookAt); sunX: where the sun stands (its side lights the steel), or null.
// Every pixel takes its day colour lit by its row's band of light, mixed toward its night colour: a table of every
// (band, day index, night index) built per step.
export function paintBridge(B, P, sunX) {
  const bands = lightBands(P), k = nightK(P), lit = P.lamps >= LAMP_AT, nb = bands.length;
  const lut = new Uint32Array(nb * N * N);
  for (let b = 0; b < nb; b++) for (let d = 0; d < N; d++) {
    const day = DAYC[d].map((v, j) => (v * bands[b].c[j]) / 255);
    for (let n = 0; n < N; n++) {
      const c = n === K.lens ? (lit ? NIGHTC[K.lens] : day) : mix(day, NIGHTC[n], k);
      lut[(b * N + d) * N + n] = ((255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
    }
  }
  const put = (target, [dm, nm]) => {
    const img = target.g.createImageData(B.w, B.h), out = new Uint32Array(img.data.buffer);
    for (let y = 0, i = 0; y < B.h; y++) {
      const base = B.rowBand[y] * N;
      for (let x = 0; x < B.w; x++, i++) if (dm[i] !== EMPTY) out[i] = lut[(base + dm[i]) * N + nm[i]];
    }
    target.g.putImageData(img, 0, 0);
  };
  put(B.back, B.maps.back);
  put(B.front, sunX != null && sunX < 230 ? B.maps.sunL : B.maps.sunR);
}

// the floodlights' glow and their light falling to the lower deck ('lighter'); H: halo sprites
export function drawLamps(ctx, H, ox, oy) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of EL.lamps) {
    const x = p + EL.post + 3 + ox, y = 157 + oy;
    poly(ctx, 'rgba(255,170,80,0.035)', [[x - 2, y], [x + 3, y], [x + 22, EL.bottom[0] + oy], [x - 20, EL.bottom[0] + oy]]);
    poly(ctx, 'rgba(255,180,90,0.04)', [[x - 1, y], [x + 2, y], [x + 10, EL.bottom[0] + oy], [x - 8, EL.bottom[0] + oy]]);
    centre(ctx, H.lamp, x + 0.5, y);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- the patrol car on the lower deck
// its red and blue on the towers' low floors behind the bridge (drawn before it)
export function drawPatrolGlow(ctx, P, H, ox, oy) {
  if (!P || !(P.red || P.blue)) return;
  ctx.globalCompositeOperation = 'lighter';
  centre(ctx, P.red ? H.redWall : H.blueWall, P.x + ox, DECK - 16 + oy);
  ctx.globalCompositeOperation = 'source-over';
}
// the car itself between the two trusses: black and white, its bar, its headlight and tail light (lit: the lamps of
// the hour are on)
export function drawPatrol(ctx, P, H, ox, oy, lit) {
  if (!P) return;
  const x = Math.round(P.x + ox), y = DECK + oy, d = P.dir;
  ctx.fillStyle = '#0c0c10'; ctx.fillRect(x - 15, y - 8, 30, 6);
  ctx.fillStyle = '#c4c4cc'; ctx.fillRect(x - 6, y - 7, 12, 4);
  ctx.fillStyle = '#0c0c10'; ctx.fillRect(x - 8, y - 12, 15, 4);
  ctx.fillStyle = '#1e2636'; ctx.fillRect(x - 6, y - 11, 5, 3); ctx.fillRect(x + 1, y - 11, 5, 3);
  ctx.fillStyle = '#060608'; ctx.fillRect(x - 11, y - 2, 6, 2); ctx.fillRect(x + 5, y - 2, 6, 2);
  ctx.fillStyle = P.red ? '#ff3a2e' : '#4a1410'; ctx.fillRect(x - 4, y - 13, 4, 1);
  ctx.fillStyle = P.blue ? '#5a8aff' : '#141a40'; ctx.fillRect(x, y - 13, 4, 1);
  ctx.fillStyle = '#fff2c8'; ctx.fillRect(d > 0 ? x + 14 : x - 15, y - 6, 1, 1);
  ctx.fillStyle = '#ff3020'; ctx.fillRect(d > 0 ? x - 15 : x + 14, y - 6, 1, 1);
  ctx.globalCompositeOperation = 'lighter';
  if (P.red || P.blue) centre(ctx, P.red ? H.redCar : H.blueCar, x, y - 13);
  if (lit) centre(ctx, H.head, x + d * 22, y - 5);
  ctx.globalCompositeOperation = 'source-over';
}
// its light on the near truss's lit edges, in steps fading with the distance from the car
export function drawPatrolRim(ctx, B, P, ox, oy) {
  if (!P || !(P.red || P.blue)) return;
  const img = P.red ? B.rim.red : B.rim.blue;
  ctx.globalCompositeOperation = 'lighter';
  for (const [half, a] of [[90, 0.18], [55, 0.2], [25, 0.25]]) {
    const sx = Math.max(0, Math.round(P.x - half + M)), ex = Math.min(img.width, Math.round(P.x + half + M));
    if (ex <= sx) continue;
    ctx.globalAlpha = a;
    ctx.drawImage(img, sx, 0, ex - sx, img.height, sx - M + ox, -MY + oy, ex - sx, img.height);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
