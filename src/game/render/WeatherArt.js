// Canvas side of the rain (systems/Weather.js, RAIN in data/atmosphere.js). Nothing is stored per drop: the sky is
// cut into cells, each cell has a few slots, and a slot's drop (where it lands, how long it falls) is hashed from
// the cell, the slot and the cycle it is on. A drop is a short pale streak crossing the picture with the wind, then
// a crown of a few pixels where it lands; in standing water, a ring spreading. Water drips off the eaves on its own
// spots. All of it is drawn before the lighting, so it is the lamps that make it show: the rain glitters in the
// light of a streetlight; the drops in the air are drawn again over the lit scene, faintly (`gain` RAIN.after), so
// that the dark is not quite dry (not what lies on the ground: it would go over the people standing in it).
import { RAIN } from '../data/atmosphere.js';
import { hash, lerpRange } from '../../engine/math.js';

const h3 = (a, b, c) => hash(a * 12.9898 + b * 78.233 + c * 37.719);
const SHADES = 3, LENGTHS = 3; // streak sprites: opacities x lengths
let streaks = null;

// the streaks, drawn once each on a little canvas at one world px a pixel (the camera's zoom keeps them crisp):
// [shade][length] = { img, ox, oy } with (ox, oy) the head of the streak in it
function streakSprites() {
  const c = RAIN, st = c.streak, dx = Math.cos(c.wind), dy = Math.sin(c.wind);
  return Array.from({ length: SHADES }, (_, s) => Array.from({ length: LENGTHS }, (_, l) => {
    const len = lerpRange(c.len, l / (LENGTHS - 1)), w = Math.ceil(Math.abs(dx) * len) + 3, h = Math.ceil(Math.abs(dy) * len) + 3;
    const img = document.createElement('canvas');
    img.width = w; img.height = h;
    // the head at the end it falls toward, the tail running back up the wind
    const g = img.getContext('2d'), hx = dx > 0 ? w - 1.5 : 1.5, hy = dy > 0 ? h - 1.5 : 1.5;
    g.strokeStyle = st.color;
    g.lineWidth = st.width;
    g.globalAlpha = lerpRange(st.alpha, (s + 0.5) / SHADES);
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - dx * len, hy - dy * len); g.stroke();
    return { img, ox: hx, oy: hy };
  }));
}

// the part of the world worth drawing: the camera's view, padded, inside the map
export function viewRect(cam, map, pad = 1.15) {
  const v = cam.viewRadius(), cx = cam.x, cy = cam.y;
  return {
    x0: Math.max(0, cx - v.x * pad), y0: Math.max(0, cy - v.y * pad),
    x1: Math.min(map.widthPx, cx + v.x * pad), y1: Math.min(map.heightPx, cy + v.y * pad),
  };
}

// the drops of this frame, worked out once and handed to every pass: [landX, landY, fallen, landed, seed, ...]
const frame = { t: NaN, weather: null, x0: 0, y0: 0, list: [] };

// every live drop in the rect: fn(landX, landY, fallen 0..1 or -1 once landed, landed 0..1 or -1, seed)
function eachDrop(weather, r, t, fn) {
  if (frame.t !== t || frame.weather !== weather || frame.x0 !== r.x0 || frame.y0 !== r.y0) {
    Object.assign(frame, { t, weather, x0: r.x0, y0: r.y0 });
    frame.list.length = 0;
    findDrops(weather, r, t, frame.list);
  }
  const l = frame.list;
  for (let i = 0; i < l.length; i += 5) fn(l[i], l[i + 1], l[i + 2], l[i + 3], l[i + 4]);
}

function findDrops(weather, r, t, out) {
  const c = RAIN, C = c.cell, n = c.drops * weather.k, whole = Math.ceil(n);
  for (let cy = Math.floor(r.y0 / C); cy * C < r.y1; cy++) {
    for (let cx = Math.floor(r.x0 / C); cx * C < r.x1; cx++) {
      for (let s = 0; s < whole; s++) {
        const sd = h3(cx, cy, s), fall = lerpRange(c.fall, sd), period = fall + c.splash.life;
        const u = t / period + sd * 7.1, cyc = Math.floor(u), ph = (u - cyc) * period;
        const lx = (cx + h3(cyc, sd * 100, 1.7)) * C, ly = (cy + h3(cyc, sd * 100, 4.3)) * C;
        if (!weather.open(lx, ly)) continue;
        // the last slot is only partly there: the rain's strength between two whole numbers of drops
        const keep = s < Math.floor(n) ? 1 : n - Math.floor(n);
        if (h3(cyc, s, sd) > keep) continue;
        if (ph < fall) out.push(lx, ly, ph / fall, -1, sd);
        else out.push(lx, ly, -1, (ph - fall) / c.splash.life, sd);
      }
    }
  }
}

// a crown: a dot where it struck, then two or three droplets thrown out from it, uneven
function crown(ctx, x, y, k, size, seed) {
  if (k < 0.35) { ctx.fillRect(Math.round(x), Math.round(y), 1, 1); return; }
  const r = size * k, n = seed < 0.4 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const a = seed * 40 + i * (6.28 / n) + h3(seed, i, 0.3);
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.8), 1, 1);
  }
}

// what lies on the ground: crowns where drops land, rings in the puddles, the drips' splashes (under everything)
export function drawRainGround(ctx, weather, r, t, gain = 1) {
  if (!weather?.k || !RAIN.falls) return;
  const c = RAIN, sp = c.splash;
  ctx.fillStyle = sp.color;
  eachDrop(weather, r, t, (x, y, f, k, sd) => {
    if (k < 0 || sd > sp.odds) return;
    ctx.globalAlpha = sp.alpha * (1 - k) * gain;
    crown(ctx, x, y, k, sp.size, sd);
  });
  // rings in standing water: the rain's puddles
  const rp = c.ripple;
  ctx.strokeStyle = rp.color;
  ctx.lineWidth = rp.width;
  const ring = (p) => {
    if (p.x + p.r < r.x0 || p.x - p.r > r.x1 || p.y + p.r < r.y0 || p.y - p.r > r.y1) return;
    const n = Math.max(1, Math.round(((Math.PI * p.r * p.r) / rp.per) * weather.k)), seed = p.seed ?? p.x * 0.13 + p.y * 0.07;
    for (let i = 0; i < n; i++) {
      const s = h3(seed, i, 0.5), period = rp.life * (0.7 + s * 0.6), u = t / period + s * 5, cyc = Math.floor(u), q = u - cyc;
      const a = h3(cyc, i, seed) * 6.28, d = Math.sqrt(h3(cyc, seed, i)) * p.r * 0.62;
      const rad = lerpRange(rp.size, h3(i, cyc, 2.2)) * (0.2 + q);
      ctx.globalAlpha = rp.alpha * (1 - q) * p.alpha * gain;
      ctx.beginPath();
      ctx.ellipse(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.85, rad, rad * 0.8, 0, 0, 6.2832);
      ctx.stroke();
    }
  };
  for (const p of weather.puddles) ring(p);
  // the drips' splashes
  const dr = c.drips;
  ctx.fillStyle = dr.color;
  for (const d of weather.drips) {
    if (d.x < r.x0 || d.x > r.x1 || d.y < r.y0 || d.y > r.y1) continue;
    const u = t / d.period + d.seed, ph = (u - Math.floor(u)) * d.period - dr.fall;
    if (ph < 0 || ph > sp.life * 1.4) continue;
    const k = ph / (sp.life * 1.4);
    ctx.globalAlpha = dr.alpha * (1 - k) * gain;
    crown(ctx, d.x, d.y, k, sp.size * 1.2, d.seed);
  }
  ctx.globalAlpha = 1;
}

// what is in the air: the falling streaks, the drops coming off the eaves (over everything, under the light)
export function drawRainAir(ctx, weather, r, t, gain = 1) {
  if (!weather?.k || !RAIN.falls) return;
  const c = RAIN, dx = Math.cos(c.wind), dy = Math.sin(c.wind), set = streaks ||= streakSprites();
  ctx.globalAlpha = gain;
  eachDrop(weather, r, t, (x, y, f, k, sd) => {
    if (f < 0) return;
    const s = set[Math.floor(h3(sd, 1.1, 2.9) * SHADES)][Math.floor(h3(sd, 3.3, 9.1) * LENGTHS)];
    const hx = x - dx * c.run * (1 - f), hy = y - dy * c.run * (1 - f);
    if (!weather.open(hx - dx * c.len[1], hy - dy * c.len[1])) return; // it would fall through a roof
    ctx.drawImage(s.img, Math.round(hx - s.ox), Math.round(hy - s.oy));
  });
  // a drop gathering and letting go off the edge above, seen coming down onto its spot
  const dr = c.drips;
  ctx.fillStyle = dr.color;
  for (const d of weather.drips) {
    if (d.x < r.x0 || d.x > r.x1 || d.y < r.y0 || d.y > r.y1) continue;
    const u = t / d.period + d.seed, ph = (u - Math.floor(u)) * d.period;
    if (ph >= dr.fall) continue;
    const q = ph / dr.fall, s = Math.max(1, Math.round(dr.size * (0.6 + q * 0.6)));
    ctx.globalAlpha = dr.alpha * (0.4 + q * 0.6) * gain;
    ctx.fillRect(Math.round(d.x - s / 2), Math.round(d.y - (1 - q) * 7 - s / 2), s, s);
  }
  ctx.globalAlpha = 1;
}
