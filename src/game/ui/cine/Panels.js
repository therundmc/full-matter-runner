// The opening's comic panels: pixel art in the title's logical px, inked like a comic book. A black frame with a
// white gutter and a hard shadow; inside, each panel keeps to a few colours of its own (its "plate") and shades with
// screentone (Ink.tone), never a gradient. Each painter gets the context clipped to its panel and translated to its
// top-left corner, its size, and t (s) for what still moves in it (smoke, a flame, a drop).
import { clamp, hash, px, tone, poly, disc, line } from './Ink.js';

const INK = '#07050c';

// r: { x, y, w, h }; k 0..1: how far it has come in (it drops into place from a little above, and settles)
export function drawPanel(g, r, k, paint) {
  if (k <= 0) return;
  const e = 1 - (1 - k) ** 3, y = Math.round(r.y - (1 - e) * 18 + Math.sin(clamp(k, 0, 1) * Math.PI) * 2);
  g.save();
  g.globalAlpha = clamp(k * 4, 0, 1);
  px(g, INK, r.x + 4, y + 4, r.w, r.h);                     // the hard shadow
  px(g, '#efe8d8', r.x - 2, y - 2, r.w + 4, r.h + 4);       // the gutter
  px(g, INK, r.x - 1, y - 1, r.w + 2, r.h + 2);             // the ink line
  g.beginPath(); g.rect(r.x, y, r.w, r.h); g.clip();
  g.translate(r.x, y);
  paint(g, r.w, r.h);
  g.restore();
}

// a caption box, top left of a panel (the words are written over it by the caller, ui/Cinematic.js)
export function caption(g, x, y, w, h) {
  px(g, INK, x + 2, y + 2, w, h);
  px(g, INK, x - 1, y - 1, w + 2, h + 2);
  px(g, '#f2d04a', x, y, w, h);
  tone(g, '#d8b030', x, y + h - 2, w, 2, 0.5);
}

// a speech balloon whose tail points at (tx, ty)
export function balloon(g, x, y, w, h, tx, ty) {
  const cx = x + w / 2, cy = y + h / 2;
  poly(g, INK, [[cx - 7, cy], [cx + 3, cy], [tx, ty]]);
  disc(g, INK, cx, cy, w / 2 + 1, h / 2 + 1);
  poly(g, '#f6f2ea', [[cx - 5, cy], [cx + 1, cy], [tx + 1, ty - 2]]);
  disc(g, '#f6f2ea', cx, cy, w / 2, h / 2);
}

// ---------------------------------------------------------------- his eye in the dark
// shut, then open all at once (open 0..1), looking to the side the noise came from (look -1..1)
export function paintEye(g, w, h, open, look, t) {
  px(g, '#2c1e26', 0, 0, w, h);
  tone(g, '#3c2a30', 0, 8, w, h - 18, 0.5);
  px(g, '#4e3632', 0, 12, w, h - 26);                                     // the skin, what the window lights of it
  tone(g, '#2c1e26', 0, h - 22, w, 10, 0.5);
  px(g, '#3a2418', 0, 0, w, 9); tone(g, '#24160e', 0, 6, w, 4, 0.5);      // his brown hair, low on the brow
  for (let i = 0; i < 10; i++) line(g, '#5a3a24', 4 + i * 15 + hash(i) * 6, 0, 8 + i * 15 + hash(i) * 6, 7 + hash(i + 3) * 5);
  const cx = Math.round(w / 2), cy = Math.round(h / 2) + 3, rows = [18, 30, 38, 42, 44, 42, 38, 30, 18];
  const n = Math.round(clamp(open, 0, 1) * rows.length);
  px(g, '#1a0e10', cx - 26, cy - 10, 52, 3);                              // the brow's shadow
  if (n <= 0) {
    px(g, '#140a0c', cx - 22, cy, 44, 2);                                 // shut: the lashes
    for (let i = 0; i < 6; i++) px(g, '#140a0c', cx - 20 + i * 8, cy + 2, 1, 2);
  } else {
    const first = Math.floor((rows.length - n) / 2);
    for (let j = 0; j < n; j++) px(g, '#e4dcd0', cx - rows[first + j] / 2, cy - n / 2 + j, rows[first + j], 1);
    const ix = cx + Math.round(look * 9), r = Math.min(6, Math.ceil(n / 2) + 1);
    px(g, '#3a2414', ix - r, cy - r + 1, r * 2, r * 2 - 2); px(g, '#5a3a1c', ix - r + 1, cy - r + 2, r * 2 - 2, r * 2 - 4);   // brown
    px(g, '#05030a', ix - 2, cy - 2, 4, 4);
    px(g, '#ffffff', ix - 3, cy - 3, 2, 2);
    px(g, '#140a0c', cx - 23, cy - n / 2 - 1, 46, 1); px(g, '#2a1a1c', cx - 21, cy + n / 2, 42, 1);
    for (let i = 0; i < 5; i++) px(g, '#c85a5a', cx - 20 + i * 9 + hash(i) * 3, cy - n / 2 + 1 + hash(i + 2) * (n - 2), 3, 1); // bloodshot
  }
  // the neon through the window, on the side of his face it is on
  for (let y = 10; y < h - 10; y++) if (y % 2) px(g, '#b0306a', w - 3 - (y % 4 ? 1 : 0), y, 1, 1);
  const drop = (t * 9) % 40;
  px(g, '#9ab0c8', 22, 12 + drop, 2, 3); px(g, '#ffffff', 22, 12 + drop, 1, 1);  // sweat
}

// ---------------------------------------------------------------- 1. what they came for
// His living room, from the floor: the boards torn up, a man on his knees lifting the tin box out of the hole by the
// light of a torch left on the floor; the boots of another, the crowbar. Plate: night blue, torch yellow.
export function paintHole(g, w, h, t) {
  px(g, '#141428', 0, 0, w, h);
  tone(g, '#1e1e3a', 0, 0, w, h * 0.55, 0.5);
  px(g, '#24203a', 0, h * 0.55, w, h);                                       // the floor, coming at us
  for (let i = 0; i < 9; i++) line(g, '#141428', w / 2 + (i - 4) * 6, h * 0.55, w / 2 + (i - 4) * 46, h);
  for (const y of [0.62, 0.71, 0.84]) px(g, '#141428', 0, h * y, w, 1);
  // the hole: boards snapped, their ends pale, and the dark under them
  poly(g, INK, [[56, 60], [112, 58], [124, 74], [48, 78]]);
  for (const [x0, y0, x1, y1] of [[54, 59, 64, 52], [70, 58, 76, 49], [96, 58, 104, 50], [110, 58, 116, 52], [50, 77, 42, 84], [120, 74, 130, 80]]) {
    line(g, '#6a4a2a', x0, y0, x1, y1, 2); px(g, '#e8c890', x1, y1, 2, 1);
  }
  // the torch on the floor, its beam across the boards and over the hole
  poly(g, '#e8c84a', [[150, 80], [154, 76], [96, 54], [60, 70]], 0.25);
  poly(g, '#e8c84a', [[150, 80], [154, 76], [110, 60], [86, 68]], 0.5);
  px(g, '#3a3a44', 148, 76, 10, 5); px(g, '#fff4c0', 147, 77, 2, 3);
  // the man on his knees: black, edged with the torch's yellow, the box in his hands
  poly(g, INK, [[70, 66], [74, 40], [84, 32], [96, 32], [100, 44], [104, 62], [100, 70]]);
  disc(g, INK, 90, 26, 7, 8);
  px(g, '#e8c84a', 96, 22, 1, 9); line(g, '#e8c84a', 100, 44, 104, 62); line(g, '#e8c84a', 96, 32, 100, 44);
  poly(g, '#8a94a0', [[84, 50], [104, 48], [106, 58], [86, 60]]); poly(g, '#c8d0d8', [[84, 50], [104, 48], [105, 51], [85, 53]]);
  px(g, '#3fa66a', 92, 52, 6, 3);                                            // a corner of a note, at the lid
  px(g, INK, 80, 54, 6, 5); px(g, INK, 104, 52, 5, 5);                       // his gloves on it
  // the other one: his legs, his boots, the crowbar hanging from his hand
  px(g, INK, w - 34, 0, 10, 70); px(g, INK, w - 20, 0, 10, 72);
  px(g, INK, w - 38, 68, 16, 6); px(g, INK, w - 22, 70, 16, 6);
  line(g, '#5a2028', w - 40, 18, w - 52, 64, 2); line(g, '#8a3a40', w - 52, 64, w - 46, 66, 2);
  line(g, '#e8c84a', w - 24, 30, w - 24, 70);
  // dust in the beam
  for (let i = 0; i < 12; i++) px(g, '#fff4c0', 80 + ((hash(i) * 60 + t * 6 * (hash(i + 1) + 0.3)) % 64), 56 + hash(i + 2) * 18, 1, 1);
}

// ---------------------------------------------------------------- 2. every dollar
// Close: gloved hands fanning the notes out of his tin, bundles in their rubber bands, a cigarette burning in a
// mouth we do not see. Plate: banknote green, black leather, the tin's grey.
export function paintCash(g, w, h, t) {
  px(g, '#0c140e', 0, 0, w, h);
  tone(g, '#16241a', 0, 0, w, h, 0.25);
  // the tin, open, full
  poly(g, '#5a6470', [[20, 58], [134, 52], [140, h], [14, h]]);
  poly(g, '#2a3038', [[26, 60], [130, 55], [134, h], [20, h]]);
  line(g, '#aab4c0', 20, 58, 134, 52, 2);
  for (let i = 0; i < 6; i++) {
    const x = 30 + i * 17, y = 62 - i;
    poly(g, '#4a7a52', [[x, y], [x + 15, y - 1], [x + 16, y + 14], [x + 1, y + 15]]);
    px(g, '#6a9a6a', x + 1, y + 1, 14, 1); px(g, '#b88a48', x + 6, y, 3, 15);   // the band round it
  }
  // the hands, fanning a wad: the notes spread like a hand of cards
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + i * 0.16, cx = 98, cy = 50;
    const ex = cx + Math.cos(a) * 44, ey = cy + Math.sin(a) * 44;
    poly(g, i % 2 ? '#5e9060' : '#6aa070', [[cx, cy], [ex - Math.sin(a) * 6, ey + Math.cos(a) * 6], [ex + Math.sin(a) * 6, ey - Math.cos(a) * 6]]);
    line(g, '#2e4a32', cx, cy, ex + Math.sin(a) * 6, ey - Math.cos(a) * 6);
    disc(g, '#3e6a44', cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 2);
  }
  poly(g, INK, [[78, 52], [100, 40], [112, 50], [104, 64], [84, 66]]);        // the leather glove holding them
  px(g, '#3a3a48', 90, 46, 12, 1); px(g, '#3a3a48', 94, 50, 10, 1);
  poly(g, INK, [[118, 28], [140, 22], [150, 34], [134, 44], [120, 40]]);      // the other, thumbing through
  px(g, '#3a3a48', 126, 30, 10, 1);
  // the cigarette's smoke, coming down from the top of the panel
  const ember = 0.6 + 0.4 * Math.sin(t * 3);
  px(g, '#d8d2c4', w - 30, 4, 12, 2); px(g, `rgba(255,${Math.round(90 + 80 * ember)},40,1)`, w - 31, 4, 2, 2);
  for (let i = 0; i < 14; i++) px(g, '#5a6a5c', w - 32 - i * 2 + Math.sin(t * 1.5 + i * 0.6) * 3, 6 + i * 3, 2, 2);
}

// ---------------------------------------------------------------- 3. the super
// His entrance hall from the floor: the front door open on the landing's light, the building's super lying on his
// face in his cardigan and slippers, his torch rolled away still lit, the blood coming out from under him (k 0..1).
// Plate: the landing's warm yellow, blood red, black.
export function paintSuper(g, w, h, t, k = 1) {
  px(g, '#1c140e', 0, 0, w, h);
  // the open door: the landing behind, its light
  px(g, '#e8b860', 66, 0, 46, 62); tone(g, '#c8903a', 66, 0, 46, 62, 0.25);
  px(g, '#a87030', 66, 46, 46, 16);
  px(g, INK, 60, 0, 6, 64); px(g, INK, 112, 0, 4, 64);
  poly(g, '#4a301c', [[112, 0], [142, 0], [140, 66], [112, 62]]); px(g, '#c8a040', 134, 34, 3, 3);
  poly(g, '#e8b860', [[66, 62], [112, 62], [150, h], [20, h]], 0.25);         // its light on the floor of the hall
  for (const y of [70, 78, 88]) px(g, '#2a1e14', 0, y, w, 1);
  // him: on his face across the threshold, an arm out, a slipper off
  poly(g, '#6a5a48', [[30, 74], [70, 68], [96, 72], [98, 82], [64, 86], [28, 84]]);    // the cardigan
  tone(g, '#4a3e30', 30, 78, 66, 8, 0.5);
  poly(g, '#2c2c3a', [[96, 72], [136, 72], [140, 80], [98, 82]]);                      // his trousers
  px(g, '#5a2a24', 136, 72, 10, 4); px(g, '#c8c0b0', 140, 78, 4, 3);                    // a slipper, a bare heel
  disc(g, '#8a8a90', 24, 76, 7, 6); disc(g, '#b0a898', 22, 74, 5, 3);                   // grey hair
  line(g, '#6a5a48', 30, 72, 10, 60, 3); px(g, '#d8a888', 6, 57, 5, 4);               // the arm out, the hand open
  px(g, '#5a2a24', 160, 82, 10, 4);                                                    // the other slipper
  // the blood, black at its heart, red where the light catches it
  const r = 6 + 34 * clamp(k, 0, 1);
  disc(g, '#3a0508', 50, 84, r, r * 0.3);
  disc(g, '#8a0c12', 50 + r * 0.2, 83, r * 0.75, r * 0.2, 0.5);
  px(g, '#e04048', 50 + r * 0.5, 82, 3, 1);
  // his torch, rolled to the wall, still on
  px(g, '#3a3a44', 4, 86, 10, 4); poly(g, '#fff4c0', [[2, 86], [-30, 70], [-30, 100]], 0.25);
  px(g, '#fff4c0', 2, 87, 2, 2);
  // the shadow of the one who shot him, long on the floor of the landing
  poly(g, INK, [[82, 62], [96, 62], [92, 30], [86, 30]], 0.75);
  disc(g, INK, 89, 26, 5, 6, 0.75);
  line(g, INK, 96, 40, 108, 36, 2);
  if ((t * 2) % 1 < 0.06) tone(g, '#fff4c0', 0, 0, w, h, 0.12);   // the bulb on the landing, failing
}

// ---------------------------------------------------------------- 4. the match
// A face lit from under by a match held up, the jerrycan's spout pouring behind. Plate: black and match orange.
export function paintMatch(g, w, h, t) {
  px(g, '#08050a', 0, 0, w, h);
  const fl = 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7);
  // the glow of it, in two screens of tone
  disc(g, '#5a2008', 120, 64, 64 * fl, 46 * fl, 0.25);
  disc(g, '#8a3810', 120, 64, 40 * fl, 30 * fl, 0.5);
  // the jerrycan, high on the left, the petrol falling in a twisted stream and splashing
  poly(g, '#7a1810', [[8, 4], [46, 0], [52, 22], [14, 28]]); px(g, '#c8281e', 10, 6, 34, 2);
  poly(g, '#3a3a44', [[46, 14], [60, 22], [58, 26], [44, 20]]);
  for (let y = 26; y < h - 6; y += 2) px(g, '#c89a50', 58 + Math.sin(y * 0.4 + t * 18) * 1.5, y, 2, 2);
  for (let i = 0; i < 6; i++) px(g, '#e8c070', 50 + hash(i + Math.floor(t * 12)) * 18, h - 8 - hash(i + 3) * 6, 1, 1);
  // the face, in profile, looking down at the match: brow, nose, a moustache, the jaw, lit from under
  const sk = '#c87838', lt = '#ffb060';
  poly(g, INK, [[150, 0], [182, 0], [182, h], [138, h], [140, 74], [132, 66]]);
  poly(g, sk, [[136, 30], [146, 24], [152, 36], [150, 44], [156, 52], [150, 56], [152, 62], [146, 70], [138, 72], [132, 64]]);
  px(g, lt, 140, 58, 6, 2); px(g, lt, 150, 50, 4, 2); px(g, lt, 144, 66, 4, 2);   // where the flame catches it
  px(g, INK, 138, 38, 8, 2); px(g, '#ffd080', 140, 40, 3, 1);                      // the eye, a glint
  px(g, '#2a1408', 136, 30, 14, 4);                                                // the brow
  px(g, '#1a0c08', 140, 56, 10, 3);                                                // the moustache
  poly(g, '#1a1410', [[134, 30], [140, 14], [160, 10], [166, 26], [148, 24]]);      // his hair, slicked
  // the hand, the match, its flame
  poly(g, sk, [[118, 82], [130, 74], [138, 80], [128, 92]]); px(g, lt, 126, 74, 6, 2);
  line(g, '#e8d8b0', 124, 76, 120, 64); px(g, '#4a2010', 119, 63, 2, 2);
  const fh = 7 + 3 * fl;
  poly(g, '#ff8a20', [[116, 64], [124, 64], [121 + Math.sin(t * 20), 64 - fh]]);
  poly(g, '#fff0a0', [[118, 64], [122, 64], [120 + Math.sin(t * 20) * 0.5, 64 - fh * 0.55]]);
}
