// The title: THE NEON POSTER, the comic's cover in its cut paper (tools/comic/STYLE.md, The title). Three stills
// one over the other (tools/comic/title_art.py), shifted against each other with the mouse in whole px: the sky
// with the four he is after, shadows over the city, each with his sign; the city black before the glow of his
// burning building; the wet street with THE RUNNER black on it, his back to the fire. Cut live over them, flat, in
// steps like stop motion: the fire taking the building floor by floor (its lit windows blink out, then burn), the
// flames in three inks, two columns of smoke bent by the wind, embers, ash; a thin rain behind him, lit where it
// passes the fire or the sign; the four's signs each with its own life (a glint along the shades, the scarf and the
// crest failing like tubes, the cigar drawn on); a patrol car's light far off; and the logo, a neon sign in cut
// paper (Beats.js logoDead). The menu's first page is the poster's bottom line.
import { POSTER as P } from '../../data/titleart.js';
import { hash, px, poly } from '../cine/Ink.js';
import { logoDead } from './Beats.js';
import { FW, FH, INK, NIGHT_L, NIGHT_LL, BONE, BONE_D, PINK, PINK_D, CYAN_D, FIRE, FIRE_D, FIRE_L, open, put, frame, show, steps, slab,
  moved, lump, tongue, glint, letter, widthOf } from './Paper.js';

const SHIFT = { sky: 6, city: 12, front: 20 };      // how far each layer moves with the mouse, px (the near ones more)
const MENU_Y = 612;
const WIND = 14;                                    // how far a flame leans
// when a floor catches (s on the title; floor 0, the top one, burns from the start), and how long before it its
// lights go out; the ground floor never burns: its lights go last
const CATCH = [-9, 8, 30, Infinity], OUT = 5, LAST_OUT = 52;

// ---------------------------------------------------------------- the fire
// a window at t: 'fire' | 'lit' | 'dark', and how long it has burned
function windowAt(i, floor, t) {
  const at = CATCH[floor] + (i % 2) * 7, home = hash(i * 7.7 + 2) > 0.3, out = at === Infinity ? LAST_OUT + (i % 2) * 4 : at - OUT;
  if (t >= at) return { state: 'fire', age: t - at };
  if (!home || t >= out) return { state: 'dark' };
  return { state: t > out - 0.8 && hash(steps(t, 12) * 1.9 + i) < 0.5 ? 'dark' : 'lit' };       // it stutters before it goes
}

// a polygon in one ink before the glow and another over the night (smoke: black on fire, violet on violet)
function polyOnGlow(g, pts, inside, outside, ox) {
  const [gx, gy, gr] = P.glow;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    const d = gr ** 2 - (y - gy) ** 2, half = d > 0 ? Math.sqrt(d) : -1, g0 = Math.round(gx + ox - half), g1 = Math.round(gx + ox + half);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
      g.fillStyle = outside;
      g.fillRect(xa, y, xb - xa, 1);
      const ia = Math.max(xa, g0), ib = Math.min(xb, g1);
      if (half > 0 && ib > ia) { g.fillStyle = inside; g.fillRect(ia, y, ib - ia, 1); }
    }
  }
}

function smoke(g, t, ox) {
  const { x0, roof } = P.building;
  for (const [dx, dy, reach, rise, n, seed] of [[30, -60, 150, 250, 6, 0], [70, -70, 110, 170, 4, 50]]) {
    for (let i = 0; i < n; i++) {
      const k = (t * 0.055 + i / n) % 1, r = (15 + 40 * k) * Math.min(1, k / 0.06, (1 - k) / 0.14);
      polyOnGlow(g, lump(x0 + dx + ox + reach * k * k + Math.sin(k * 7 + i) * 5, roof + dy - rise * k, r, seed + i * 13), INK, NIGHT_L, ox);
    }
  }
}

function fire(g, t, ox) {
  const { x0, roof } = P.building, n = steps(t, 9), wob = (i) => 0.7 + 0.6 * hash(i * 3.1 + n * 7.7);
  P.windows.forEach(([x, y, w, h, floor], i) => {
    const s = windowAt(i, floor, t), burst = s.state === 'fire' && s.age < 0.5 ? 1.7 : 1;    // it blows as it catches
    poly(g, s.state === 'lit' ? FIRE_L : s.state === 'fire' ? FIRE : NIGHT_L, slab(x + ox, y, x + ox + w, y + h, 60 + i, 2.5));
    if (s.state === 'fire') tongue(g, x + ox + w / 2, y + 6, w * burst, (30 + 8 * (i % 3)) * wob(i) * burst, 6, i + n, null, 2);
  });
  const grown = Math.min(1, 0.75 + t / 80);                                  // the roof's fire, a little higher as it spreads
  P.roofFlames.forEach(([dx, w, h], k) => {
    tongue(g, x0 + ox + dx, roof - 6, w, h * wob(k + 40) * grown, WIND * (0.7 + 0.6 * hash(k + n * 1.3)), k + n);
  });
}

// embers: thrown up from the roof and the windows, carried off by the wind, dying from yellow to red
function embers(g, t, ox) {
  const { x0, roof } = P.building;
  for (let i = 0; i < 22; i++) {
    const k = (t * 0.2 * (0.6 + hash(i)) + hash(i + 5)) % 1, big = i % 4 === 0, s = k > 0.7 ? 3 : big ? 6 : 4;
    if (hash(i * 3 + steps(t, 8)) < 0.18) continue;                          // they wink
    const x = x0 + ox + 8 + hash(i + 9) * 84 + k * k * 190 * (0.3 + hash(i + 2)) + Math.sin(k * 9 + i) * 6;
    px(g, k < 0.35 ? FIRE_L : k < 0.7 ? FIRE : FIRE_D, x, roof - 10 + hash(i + 3) * 60 - k * 300, s, s);
  }
}

// ---------------------------------------------------------------- the rain, the ash
// A thin rain, behind him and behind the sign: a few long cuts, steep, in the night's violet; one that passes before
// the fire is cut in its orange, one by the sign in its pink. Where it lands: a tick on his shoulders, dashes on the
// street.
const box = (pts, m = 10) => [Math.min(...pts.map((p) => p[0])) - m, Math.min(...pts.map((p) => p[1])) - m, Math.max(...pts.map((p) => p[0])) + m, Math.max(...pts.map((p) => p[1])) + m];
const SIGNS = [box(P.shades), box(P.crest), box(P.scarf.flat())];
function rain(g, t, ox) {
  const [gx, gy, gr] = P.glow, tq = steps(t, 20) / 20;
  for (let i = 0; i < 18; i++) {
    const u = (tq * (1.1 + hash(i) * 0.5) + hash(i + 1)) % 1, len = 60 + hash(i + 3) * 60;
    const x = Math.round(hash(i + 2) * (FW + 300) - 260 + u * (FH + 160) * 0.3), y = Math.round(-140 + u * (FH + 160)), dx = len * 0.3;
    const mx = x + dx / 2, my = y + len / 2, lit = (mx - gx - ox) ** 2 + (my - gy) ** 2 < gr ** 2;
    if (SIGNS.some(([x0, y0, x1, y1]) => x + dx > x0 && x < x1 && y + len > y0 && y < y1)) continue;       // never across a sign
    const ink = lit ? FIRE : my < 210 && mx > P.logo[0] - 30 && mx < P.logo[0] + 570 ? PINK_D : NIGHT_LL;
    poly(g, ink, [[x, y], [x + 3, y], [x + 3 + dx, y + len], [x + dx, y + len]]);
  }
}
function splashes(g, t, ox) {
  const [sx0, sx1, sy] = P.shoulders;
  for (let i = 0; i < 3; i++) {                               // on his shoulders: two short cuts thrown up, a moment
    const slot = Math.floor(t * 3 + i * 0.37), k = (t * 3 + i * 0.37) % 1;
    if (k > 0.3) continue;
    const x = Math.round(sx0 + ox + hash(slot * 1.7 + i) * (sx1 - sx0)), y = Math.round(sy + 2 - k * 14);
    px(g, FIRE_L, x - 5, y, 3, 3); px(g, FIRE_L, x + 4, y - 2, 3, 3);
  }
  for (let i = 0; i < 9; i++) {                               // on the street
    const slot = Math.floor(t * 4 + hash(i) * 7);
    if ((t * 4 + hash(i) * 7) % 1 < 0.3) px(g, NIGHT_LL, hash(slot * 1.3 + i) * FW, 536 + hash(slot * 2.1 + i) * 58, 10, 2);
  }
}
// ash: a few flakes coming down slowly with the wind, in front of everything but his head
function ash(g, t) {
  const [hx0, hy0, hx1, hy1] = P.head;
  for (let i = 0; i < 14; i++) {
    const u = (t * 0.035 * (0.6 + hash(i + 40)) + hash(i + 41)) % 1;
    const x = hash(i + 42) * (FW + 200) - 200 + u * 260 + Math.sin(t * 0.7 + i) * 10, y = -10 + u * (FH - 40);
    if (x > hx0 - 6 && x < hx1 + 6 && y > hy0 - 6 && y < hy1 + 6) continue;
    px(g, i % 3 ? NIGHT_LL : BONE_D, x, y, 3, 3);
  }
}

// ---------------------------------------------------------------- the four's signs, each its own life
function signs(g, t, ox) {
  // CUEBALL's shades: a glint slides along them, and ends in a star at their corner
  const [a, b, c, d] = moved(P.shades, ox), k = ((t + 2.2) % 5.3) / 0.55, at = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  if (k < 1) poly(g, BONE, [at(a, b, k * 0.8 + 0.08), at(a, b, k * 0.8 + 0.2), at(d, c, k * 0.8 + 0.12), at(d, c, k * 0.8)]);
  else if (k < 1.5) glint(g, b[0] - 4, b[1] + 6, (k - 1) / 0.5, 14);
  // LUCKY's scarf: a tube that fails twice in a row, now and then
  const ks = (t + 4) % 7.1, ns = steps(t, 12);
  if (ks < 0.5 && ns % 3 === 0) for (const q of P.scarf) poly(g, PINK_D, moved(q, ox));
  // JITTERS' crest: never still: three quick failures, more often
  const kc = t % 3.7;
  if (kc < 0.45 && steps(t, 16) % 2 === 0) poly(g, CYAN_D, moved(P.crest, ox));
  // THE BOSS's cigar: he draws on it (its tip goes yellow, then white), and its smoke goes up thicker after
  const [ex, ey] = P.ember, kd = (t + 1) % 6, draw = kd < 0.9;
  if (draw) px(g, kd > 0.25 && kd < 0.6 ? BONE : FIRE_L, ex + ox - 7, ey - 7, 13, 13);
  for (let i = 0; i < 4; i++) {
    const kk = (t * 0.2 + i / 4) % 1, thick = kd > 0.9 && kd < 3 ? 1.5 : 1, r = (3 + 8 * kk) * thick * Math.min(1, (1 - kk) / 0.2);
    poly(g, NIGHT_LL, lump(ex + ox - 8 - 26 * kk + Math.sin(kk * 5 + i) * 4, ey - 10 - 62 * kk, r, i * 7 + 40));
  }
}

// a patrol car's light far off, low between the blocks on the left, now and then: red, blue, red, blue
function patrol(g, t) {
  const k = (t + 6) % 26;
  if (k > 5) return;
  const x = 150 + k * 22, n = steps(t, 5);
  px(g, n % 2 ? CYAN_D : PINK_D, x, 486, 34, 10);
  px(g, n % 2 ? PINK_D : CYAN_D, x + 40, 490, 22, 8);
}

// The logo: it lights letter by letter, then buzzes. false when its sheet is missing.
function logo(g, t) {
  if (!put(g, 'title/logo', P.logo[0], P.logo[1])) return false;
  P.letters.forEach(([x0, y0, x1, y1], i) => {
    if (!logoDead(i, t)) return;
    g.save();
    g.beginPath();
    g.rect(P.logo[0] + x0 + 6, P.logo[1] + y0, x1 - x0 - 12, y1 - y0);        // whole px: the cut stays hard
    g.clip();
    put(g, 'title/logo_off', P.logo[0], P.logo[1]);
    g.restore();
  });
  return true;
}

// The poster on the sheet (Paper.js), at t; cam -1..1: where the eye is (the mouse, eased). Returns false when the
// logo's sheet is missing (the caller letters the title).
function layPoster(t, cam = 0) {
  const g = open(), m = P.margin, ox = { sky: Math.round(-cam * SHIFT.sky), city: Math.round(-cam * SHIFT.city), front: Math.round(-cam * SHIFT.front) };
  put(g, 'title/poster_sky', ox.sky - m);
  signs(g, t, ox.sky);
  patrol(g, t);
  put(g, 'title/poster_city', ox.city - m);
  smoke(g, t, ox.city);
  fire(g, t, ox.city);
  embers(g, t, ox.city);
  rain(g, t, ox.city);
  put(g, 'title/poster_front', ox.front - m);
  splashes(g, t, ox.front);
  ash(g, t);
  return { g, lit: logo(g, t) };
}

// The title's first page: the poster, and the menu's line across its foot, the chosen item on a pink slab cut again
// three times a second. view: { menu }. Returns where the items are, in canvas px, for the mouse.
export function drawPoster(ctx, W, H, t, cam, view) {
  const { g, lit } = layPoster(t, cam), f = frame(W, H), menu = view.menu, items = menu.page.items;
  let size = 21 * f.k, gap = 50 * f.k;
  let ws = items.map((it) => widthOf(ctx, it.label, size)), total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
  if (total > W * 0.9) { const k = (W * 0.9) / total; size *= k; gap *= k; ws = ws.map((w) => w * k); }
  let x = W / 2 - (ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1)) / 2;
  const at = ws.map((w) => { const cx = x + w / 2; x += w + gap; return { cx, w }; }), on = at[menu.sel], y = f.oy + MENU_Y * f.k;
  if (on) {
    const x0 = (on.cx - on.w / 2 - f.ox) / f.k, x1 = (on.cx + on.w / 2 - f.ox) / f.k, q = slab(x0 - 16, MENU_Y - 21, x1 + 16, MENU_Y + 19, (steps(t, 3) % 3) * 11, 3);
    poly(g, PINK_D, moved(q, 5, 6));
    poly(g, PINK, q);
  }
  show(ctx, W, H);
  if (!lit) letter(ctx, 'FULL MATTER RUNNER', W / 2, f.oy + 110 * f.k, 44 * f.k, BONE);
  at.forEach((a, i) => letter(ctx, items[i].label, a.cx, y, size, i === menu.sel ? INK : BONE));
  return at.map((a, i) => ({ i, x: a.cx - a.w / 2 - gap * 0.4, y: y - size, w: a.w + gap * 0.8, h: size * 2 }));
}
