// Arms, legs, feet and hands of a living character, painted as pixel art at the density of the standing sprites
// (two pixels per pose px, Assets.js `density`), with their outline and their light, so that the limbs CharacterAnim
// moves every frame look like the sprites they hang from and not like strokes of a pen.
// Limbs go through one scratch buffer per character (beginLimbs, then legs and arms, then flushLimbs onto the
// canvas); hands are small cached sprites drawn turned along the forearm (drawHand).
// Colours come from the character's look (Character KINDS, Civilian CIVILIAN_LOOKS): arm (sleeve), skin, and
// optionally cuff, glove, pants, shoe.
import { hexRgb } from '../../engine/math.js';

const D = 2;             // buffer pixels per pose px
const HALF = 30;         // the buffer covers +-HALF pose px round the body's centre
const N = HALF * 2 * D;
const OL = 0.5;          // outline width (pose px): one buffer pixel
const OUTLINE = [20, 12, 28];      // the sprites' outline colour (tools/generate_assets.py OUTLINE)
const DARK_T = [28, 10, 48], LIGHT_T = [255, 248, 226]; // shadows cold purple, highlights warm white (as the sprites)
// light in the torso's frame (x forward, y right): from behind and to the left, as baked into the sprites
const LIGHT = (() => { const l = [-0.5, -0.65, 0.75], n = Math.hypot(...l); return l.map((v) => v / n); })();

// ---------------- colours ----------------
const mix = (c, t, k) => c.map((v, i) => Math.round(v + (t[i] - v) * k));
// 4-step ramp [shadow, dark, base, light], as generate_assets.py ramp()
const rampOf = (hex, d2 = 0.48, d1 = 0.24, l1 = 0.32) => {
  const c = hexRgb(hex);
  return [mix(c, DARK_T, d2), mix(c, DARK_T, d1), c, mix(c, LIGHT_T, l1)];
};
const tidx = (L) => (L < 0.24 ? 0 : L < 0.52 ? 1 : L < 0.88 ? 2 : 3);
const ramps = new WeakMap();
function lookRamps(look) {
  let r = ramps.get(look);
  if (!r) {
    const skin = rampOf(look.skin || '#dba274', 0.46, 0.22, 0.3);
    r = {
      sleeve: rampOf(look.arm || '#5a5a66'),
      cuff: look.cuff ? rampOf(look.cuff) : null,
      skin,
      hand: look.glove ? rampOf(look.glove, 0.5, 0.25, 0.4) : skin,
      pants: rampOf(look.pants || '#3a3148'),
      shoe: rampOf(look.shoe || '#1a1214', 0.42, 0.2, 0.32),
    };
    r.px = { pants: r.pants.map(rgba), shoe: r.shoe.map(rgba), sleeve: r.sleeve.map(rgba), cuff: r.cuff?.map(rgba) }; // as packed pixels
    ramps.set(look, r);
  }
  return r;
}

// ---------------- the scratch buffer ----------------
let cv = null, g = null, img = null, px = null;
let x0 = N, y0 = N, x1 = -1, y1 = -1; // dirty box
let lx = LIGHT[0], ly = LIGHT[1];      // the light turned into the world (beginLimbs)
const rgba = (c) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
const OUT = rgba(OUTLINE);

// start the limbs of a character whose torso is turned ta
export function beginLimbs(ta) {
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = cv.height = N;
    g = cv.getContext('2d');
    img = g.createImageData(N, N);
    px = new Uint32Array(img.data.buffer);
  }
  px.fill(0);
  x0 = y0 = N; x1 = y1 = -1;
  const c = Math.cos(ta), s = Math.sin(ta);
  lx = LIGHT[0] * c - LIGHT[1] * s; ly = LIGHT[0] * s + LIGHT[1] * c;
}

// paint the buffer onto ctx, its centre on (cx, cy) (in the frame the pose is drawn in)
export function flushLimbs(ctx, cx, cy) {
  if (x1 < x0) return;
  g.putImageData(img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  ctx.drawImage(cv, x0, y0, w, h, cx - HALF + x0 / D, cy - HALF + y0 / D, w / D, h / D);
}

function put(i, j, c) {
  px[j * N + i] = c;
  if (i < x0) x0 = i; if (i > x1) x1 = i;
  if (j < y0) y0 = j; if (j > y1) y1 = j;
}

// chain(): per segment ax, ay, dx, dy, length squared, r at a, r's change, reach (the most r plus the outline)
const SEG = new Float64Array(8 * 2);

// A limb: a chain of points {x, y, r} (pose px from the body's centre) swept round, one outline round the whole of
// it. colour(seg, t, L) -> rgba picks the cloth / skin of each pixel from its segment, place along it and light.
function chain(pts, colour) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const p of pts) {
    bx0 = Math.min(bx0, p.x - p.r); bx1 = Math.max(bx1, p.x + p.r);
    by0 = Math.min(by0, p.y - p.r); by1 = Math.max(by1, p.y + p.r);
  }
  const i0 = Math.max(0, Math.floor((bx0 - OL + HALF) * D)), i1 = Math.min(N - 1, Math.ceil((bx1 + OL + HALF) * D));
  const j0 = Math.max(0, Math.floor((by0 - OL + HALF) * D)), j1 = Math.min(N - 1, Math.ceil((by1 + OL + HALF) * D));
  // each segment's numbers once, not at every pixel
  const ns = pts.length - 1;
  for (let k = 0, o = 0; k < ns; k++, o += 8) {
    const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dy = b.y - a.y;
    SEG[o] = a.x; SEG[o + 1] = a.y; SEG[o + 2] = dx; SEG[o + 3] = dy; SEG[o + 4] = dx * dx + dy * dy || 1e-9;
    SEG[o + 5] = a.r; SEG[o + 6] = b.r - a.r; SEG[o + 7] = Math.max(a.r, b.r) + OL;
  }
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) / D - HALF;
    // the span of this row a segment can reach: the part of it whose centre line is within its reach of the row,
    // widened by that reach (a pixel further from every segment than that is never painted), a pixel of slack
    let xl = Infinity, xr = -Infinity;
    for (let k = 0, o = 0; k < ns; k++, o += 8) {
      const ax = SEG[o], ay = SEG[o + 1], dx = SEG[o + 2], dy = SEG[o + 3], R = SEG[o + 7];
      let t0 = 0, t1 = 1;
      if (dy !== 0) {
        const u0 = (y - R - ay) / dy, u1 = (y + R - ay) / dy;
        t0 = Math.max(0, Math.min(u0, u1)); t1 = Math.min(1, Math.max(u0, u1));
      } else if (Math.abs(y - ay) > R) continue;
      if (t0 > t1) continue;
      const xa = ax + dx * t0, xb = ax + dx * t1;
      xl = Math.min(xl, Math.min(xa, xb) - R); xr = Math.max(xr, Math.max(xa, xb) + R);
    }
    if (xl > xr) continue;
    const ia = Math.max(i0, Math.floor((xl + HALF) * D) - 1), ib = Math.min(i1, Math.ceil((xr + HALF) * D) + 1);
    for (let i = ia; i <= ib; i++) {
      const x = (i + 0.5) / D - HALF;
      let best = Infinity, bs = 0, bt = 0, nx = 0, ny = 0, br = 1;
      for (let k = 0, o = 0; k < ns; k++, o += 8) {
        const ax = SEG[o], ay = SEG[o + 1], dx = SEG[o + 2], dy = SEG[o + 3], ll = SEG[o + 4];
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ll));
        const qx = x - ax - dx * t, qy = y - ay - dy * t, r = SEG[o + 5] + SEG[o + 6] * t;
        const d = Math.sqrt(qx * qx + qy * qy) - r;
        if (d < best) { best = d; bs = k; bt = t; nx = qx; ny = qy; br = r; }
      }
      if (best > OL) continue;
      if (best > 0) { put(i, j, OUT); continue; }
      const ux = nx / br, uy = ny / br, nz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
      put(i, j, colour(bs, bt, Math.max(0, ux * lx + uy * ly + nz * LIGHT[2])));
    }
  }
}

// An oval turned a (half lengths hl along, hw across), p: its squareness; colour(u, v, L) with u, v in -1 .. 1
function oval(cx, cy, a, hl, hw, p, colour) {
  const c = Math.cos(a), s = Math.sin(a), R = Math.max(hl, hw) + OL;
  const i0 = Math.max(0, Math.floor((cx - R + HALF) * D)), i1 = Math.min(N - 1, Math.ceil((cx + R + HALF) * D));
  const j0 = Math.max(0, Math.floor((cy - R + HALF) * D)), j1 = Math.min(N - 1, Math.ceil((cy + R + HALF) * D));
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) / D - HALF - cy;
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / D - HALF - cx, u = x * c + y * s, v = -x * s + y * c;
      if (Math.abs(u) > hl + OL || Math.abs(v) > hw + OL) continue; // past its outline's box: no need for the powers
      const e = (Math.abs(u) / hl) ** p + (Math.abs(v) / hw) ** p;
      if (e <= 1) {
        const nu = u / hl, nv = v / hw, nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nu * nu + nv * nv)));
        const wx = nu * c - nv * s, wy = nu * s + nv * c;
        put(i, j, colour(nu, nv, Math.max(0, (wx * lx + wy * ly) * 0.8 + nz * LIGHT[2])));
      } else if ((Math.abs(u) / (hl + OL)) ** p + (Math.abs(v) / (hw + OL)) ** p <= 1) put(i, j, OUT);
    }
  }
}

const P0 = { x: 0, y: 0, r: 0 }, P1 = { x: 0, y: 0, r: 0 }, P2 = { x: 0, y: 0, r: 0 };
const set = (p, x, y, r) => { p.x = x; p.y = y; p.r = r; return p; };

// A leg from the hip (hx, hy) to the foot f {x, y, a}, the shoe on it; lift 0 .. 1 brings the foot nearer the eye
// while it swings, heel 0 .. 1 tips it onto its toes. Pose px from the body's centre.
export function paintLeg(look, hx, hy, f, lift = 0, heel = 0) {
  const R = lookRamps(look), c = Math.cos(f.a), s = Math.sin(f.a);
  const k = 1 + 0.08 * lift, fl = 2.55 * k * (1 - 0.22 * heel), fw = 1.45 * k;
  // the ankle, a little behind the middle of the shoe
  const ax = f.x - c * 0.9, ay = f.y - s * 0.9;
  const pants = R.px.pants;
  chain([set(P0, hx, hy, 1.95), set(P1, ax, ay, 1.4 * k)], (seg, t, L) => pants[tidx(L * (0.85 + 0.15 * t))]);
  const shoe = R.px.shoe;
  oval(f.x + c * 0.35, f.y + s * 0.35, f.a, fl, fw, 2.3, (u, v, L) => {
    if (u > 0.55 && L > 0.5) return shoe[3];          // the toe cap catches the light
    if (u < -0.62) return shoe[Math.max(0, tidx(L) - 1)]; // the heel
    return shoe[Math.min(2, tidx(L))];
  });
}

// An arm: shoulder S, elbow E, wrist W (pose px from the body's centre), the sleeve down to a cuff, bare skin past it;
// k: its girth (1: as it hangs; broader seen flat, round a man's neck)
export function paintArm(look, S, E, W, k = 1) {
  const R = lookRamps(look), sleeve = R.px.sleeve, cuff = R.px.cuff;
  chain([set(P0, S.x, S.y, 1.6 * k), set(P1, E.x, E.y, 1.35 * k), set(P2, W.x, W.y, 1.1 * k)], (seg, t, L) => {
    const i = tidx(L);
    if (seg === 1 && t > 0.84) return (cuff || sleeve)[Math.max(0, i - (cuff ? 0 : 1))]; // the cuff (or the sleeve's hem)
    if (seg === 0 && t > 0.88) return sleeve[Math.max(0, i - 1)];                        // the crease of the elbow
    return sleeve[i];
  });
}

// ---------------- hands ----------------
// Drawn turned along the forearm at their sprite density. kind: 'fist' (holding, clenched), 'loose' (swinging, the
// fingers curled), 'flat' (the palm laid on something, fingers spread). side: -1 left, 1 right (the thumb is on the
// inner side: toward -y for the right hand seen from above).
const HS = 12; // hand sprite size (buffer px)
const hands = new WeakMap();
function handSprite(look, kind, side) {
  let m = hands.get(look);
  if (!m) { m = new Map(); hands.set(look, m); }
  const key = kind + side;
  let c = m.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = HS;
  const h = c.getContext('2d'), im = h.createImageData(HS, HS), p = new Uint32Array(im.data.buffer);
  const R = lookRamps(look), col = R.hand.map(rgba), dark = rgba(mix(R.hand[0], DARK_T, 0.35));
  const flat = kind === 'flat', loose = kind === 'loose';
  const hl = flat ? 2.15 : loose ? 1.85 : 1.6, hw = flat ? 1.5 : loose ? 1.35 : 1.45;
  const th = { x: flat ? -0.3 : 0.35, y: -side * (flat ? 1.75 : 1.3), hl: flat ? 0.95 : 0.8, hw: 0.55, a: -side * (flat ? 0.9 : 0.5) };
  const inside = (x, y, grow) => {
    const e = (Math.abs(x) / (hl + grow)) ** 2.4 + (Math.abs(y) / (hw + grow)) ** 2.4;
    const tx = x - th.x, ty = y - th.y, tc = Math.cos(th.a), ts = Math.sin(th.a);
    const tu = tx * tc + ty * ts, tv = -tx * ts + ty * tc;
    const et = (tu / (th.hl + grow)) ** 2 + (tv / (th.hw + grow)) ** 2;
    return e <= 1 ? 1 : et <= 1 ? 2 : 0;
  };
  for (let j = 0; j < HS; j++) {
    for (let i = 0; i < HS; i++) {
      const x = (i + 0.5 - HS / 2) / D, y = (j + 0.5 - HS / 2) / D, w = inside(x, y, 0);
      if (!w) { if (inside(x, y, OL)) p[j * HS + i] = OUT; continue; }
      if (w === 2) { p[j * HS + i] = col[1]; continue; }       // the thumb, under the hand's back
      const nu = x / hl, nv = y / hw, nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nu * nu + nv * nv)));
      let L = Math.max(0, -0.45 * nu - 0.55 * nv + nz * 0.75);
      const front = x > hl - (flat ? 1.6 : 0.6);
      if (front) {
        // the fingers: a crease between each, knuckles lit (a fist) or the tips (spread on a surface)
        const row = Math.round(y * D + 10);
        if (row % 2 === 1 && Math.abs(y) < hw - 0.3) { p[j * HS + i] = dark; continue; }
        if (!flat) L += 0.25;
      } else if (!flat && x > hl - 1.05) L -= 0.2; // the dip behind the knuckles
      p[j * HS + i] = col[tidx(L)];
    }
  }
  h.putImageData(im, 0, 0);
  m.set(key, c);
  return c;
}

// a hand at (x, y) of the current frame, its fingers toward angle a, k times its size
export function drawHand(ctx, look, kind, side, x, y, a, k = 1) {
  const c = handSprite(look, kind, side);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(k, k);
  ctx.drawImage(c, -HS / (2 * D), -HS / (2 * D), HS / D, HS / D);
  ctx.restore();
}
