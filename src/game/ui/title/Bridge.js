// The elevated line's bridge across the lower part of the picture: heavy riveted steel painted oxblood, a deep deck
// girder the train runs on, a truss under it (posts, big X bracing, curved knee brackets, gusset plates at every
// joint), the bottom chord carrying the lower deck, a street name plate on it. It is lit from below by the street's
// sodium and by two floodlights on its posts. The far truss shows dark through the near one; the patrol car runs
// along the lower deck between the two. Painted once: `back` (the far truss), `front` (the near one, shaded by a
// pass over its shape: undersides lit, tops dark, brighter by the lamps), and `rim` (its lit edges, tinted red and
// blue for the patrol car's light).
import { LW, M, MY, layer, canvas, rand, px, poly, pixText, centre } from './Draw.js';
import { EL, DECK } from './Layout.js';

const X0 = -M, X1 = LW + M;
// the steel from its darkest to its most lit
const RAMP = ['#140808', '#1d0b0b', '#28100f', '#341412', '#401915', '#4e1e17', '#60261a', '#76301d', '#904022', '#ac5429'];

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

export function buildBridge() {
  // the far truss and what is seen of the decks between the two
  const back = layer(), b = back.g, [ct, cb] = EL.chord, [bt, bb] = EL.bottom;
  truss(b, '#1a0c0c', 18, false);
  px(b, '#150909', X0, cb, X1 - X0, 3);                                              // the floor beams under the track
  px(b, '#120a0a', X0, bt - 3, X1 - X0, 3);                                          // the lower deck's road
  px(b, '#1e1010', X0, bt - 4, X1 - X0, 1);

  // the near truss: its shape, then each pixel shaded by what is around it
  const shape = layer();
  truss(shape.g, '#fff');
  const w = shape.c.width, h = shape.c.height, src = shape.g.getImageData(0, 0, w, h).data;
  const front = canvas(w, h), out = front.g.createImageData(w, h), o = out.data;
  const rim = canvas(w, h), rimData = rim.g.createImageData(w, h), rd = rimData.data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  const lamps = EL.lamps.map((p) => [p + EL.post + 2 + M, 157 + MY]);
  const rgb = RAMP.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  const r = rand(17);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const ly = y - MY;
    let k = ly < cb ? 3 : ly < 170 ? 3 : ly < 184 ? 4 : 5;
    const down = !on(x, y + 1), up = !on(x, y - 1), left = !on(x - 1, y), right = !on(x + 1, y);
    if (down) k += 3; else if (up) k -= 2;
    if (left && !down) k += 1; else if (right && !down) k -= 1;
    for (const [lx, lyy] of lamps) { const q = Math.hypot(x - lx, (y - lyy) * 1.3); if (q < 30) k += q < 15 ? 2 : 1; }
    if (ly === ct || ly === ct + 1) k = 6;                                           // the wet top of the girder
    const c = rgb[Math.max(0, Math.min(RAMP.length - 1, k))], i = (y * w + x) * 4;
    o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = 255;
    if (ly > 156 && (down || ((left || right) && r() < 0.6))) { rd[i] = rd[i + 1] = rd[i + 2] = 255; rd[i + 3] = 255; }
  }
  front.g.putImageData(out, 0, 0);
  rim.g.putImageData(rimData, 0, 0);

  // the details, in logical px: the girder's flanges, rivets in rows, rust run down from them, the rails on top, the
  // floodlights, the name plate
  const g = front.g;
  g.translate(M, MY);
  px(g, RAMP[2], X0, ct + 2, X1 - X0, 1);
  px(g, RAMP[2], X0, cb - 3, X1 - X0, 1);
  const rivet = (x, y) => px(g, RAMP[5], x, y, 1, 1);
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
    px(g, RAMP[1], x, y, 1, 2 + Math.floor(r() * 4));
  }
  // the track on the girder: ties, the rail and its wet shine
  for (let x = X0; x < X1; x += 4) px(g, '#16100e', x, ct - 2, 3, 2);
  px(g, '#5a5866', X0, ct - 1, X1 - X0, 1);
  for (let i = 0; i < 30; i++) px(g, '#9a98b0', X0 + r() * (X1 - X0), ct - 1, 2 + r() * 6, 1);
  // the floodlights on their posts
  for (const p of EL.lamps) {
    const x = p + EL.post;
    px(g, '#1c0c0c', x, 154, 3, 1);
    px(g, '#141418', x + 1, 154, 4, 3);
    px(g, '#ffe2a8', x + 2, 157, 3, 1);
  }
  // the name plate on the bottom chord
  const P = EL.plate, pw = P.text.length * 4 + 5;
  px(g, '#6a5030', P.x - 1, P.y - 1, pw + 2, 9);
  px(g, '#140e0a', P.x, P.y, pw, 7);
  pixText(g, P.text, P.x + 3, P.y + 1, '#d0a250');

  // the rim's lit edges, tinted for the patrol car's two colours
  const tint = (col) => {
    const t = canvas(w, h);
    t.g.drawImage(rim.c, 0, 0);
    t.g.globalCompositeOperation = 'source-in';
    t.g.fillStyle = col;
    t.g.fillRect(0, 0, w, h);
    return t.c;
  };
  return { back: back.c, front: front.c, rim: { red: tint('#ff3a2e'), blue: tint('#3a6aff') } };
}

// the floodlights' glow and their light falling through the rain to the lower deck ('lighter'); H: halo sprites
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
// the car itself between the two trusses: black and white, its bar, its headlight and tail light
export function drawPatrol(ctx, P, H, ox, oy) {
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
  centre(ctx, H.head, x + d * 22, y - 5);
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
