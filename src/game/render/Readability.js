// Readability cues (data/readability.js): a catch-light running along each weapon lying on the floor, the outline of
// the one within reach (both over the lit scene, so they read in the dark), and a ring at the player's feet when the
// level gets under way and each time he is back up (on the floor, under everybody). Off unless the game is in play
// (World.cues, set by Game: cuesOn); faded with the distance from the player, never drawn where he cannot see.
// The numbers (alphas, phases, the light floor) are pure functions, unit-tested.
import { BODY_SCALE } from '../Config.js';
import { READABILITY } from '../data/readability.js';
import { clamp } from '../../engine/math.js';

const R = READABILITY;
const smooth = (x) => x * x * (3 - 2 * x);

// cues show in play only: not in a cinematic, the title, the pause menu or the intro banner, nor while a level's
// staged scene plays (systems/Tutorial.js `scene`)
export const cuesOn = (state, staged = false) => state === 'play' && !staged;

// 1 within `near` px of the player .. 0 from `far` on
export const fadeAt = (d, F = R.fade) => 1 - smooth(clamp((d - F.near) / (F.far - F.near), 0, 1));

// the catch-light on a floor weapon of phase `seed` (0..1) at time t: null between two runs, else where it is along
// the weapon (s 0..1) and how bright (a)
export function glintAt(t, seed, G = R.glint) {
  const u = ((((t / G.period + seed) % 1) + 1) % 1) * G.period;
  if (u >= G.run) return null;
  const s = u / G.run;
  return { s, a: G.alpha * Math.sin(Math.PI * s) };
}

// the in-reach outline's strength at time t
export const reachAlpha = (t, C = R.reach) => C.alpha * (1 + C.pulse * Math.sin(t * C.rate));

// the ring at the player's feet `since` s after he was up: { r, a } or null once it is over
export function markAt(since, M = R.mark) {
  if (!(since >= 0) || since >= M.close + M.hold + M.fade) return null;
  const c = clamp(since / M.close, 0, 1), e = 1 - (1 - c) * (1 - c);
  const out = clamp((since - M.close - M.hold) / M.fade, 0, 1);
  return { r: M.r * (M.from + (1 - M.from) * e), a: M.alpha * c * (1 - out) };
}

// the light to add (0..max, on the brightness grid's scale: Lighting.levelAt) under something lit `level` so that it
// is lit at least the floor's level: only ever added (never darker), nothing where it is lit enough already
export const floorLift = (level, F = R.floor) => clamp(F.level - level, 0, F.max);

// ---- canvas side
const rims = new WeakMap(), rings = new WeakMap();

// the sprite's pixels lifted onto a canvas of its size + pad on every side, painted by keep(opaque, x, y) -> bool
function paintOver(img, pad, rgb, keep) {
  const w = img.width, h = img.height, W = w + pad * 2, H = h + pad * 2;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sg = src.getContext('2d');
  sg.drawImage(img, 0, 0);
  const a = sg.getImageData(0, 0, w, h).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 40;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const og = out.getContext('2d'), d = og.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!keep(on, x - pad, y - pad)) continue;
      const i = (y * W + x) * 4;
      d.data[i] = rgb[0]; d.data[i + 1] = rgb[1]; d.data[i + 2] = rgb[2]; d.data[i + 3] = 255;
    }
  }
  og.putImageData(d, 0, 0);
  out.pad = pad;
  return out;
}

// its edge: the opaque pixels next to a clear one (where light catches on a thing's rim)
function rimOf(img) {
  let c = rims.get(img);
  if (!c) {
    c = paintOver(img, 0, R.glint.color, (on, x, y) => on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)));
    rims.set(img, c);
  }
  return c;
}

// a line about one world px wide round it, outside it
function ringOf(img) {
  let c = rings.get(img);
  if (!c) {
    const p = Math.max(1, Math.round(1 / (img.k || 1)));
    c = paintOver(img, p, R.reach.color, (on, x, y) => {
      if (on(x, y)) return false;
      for (let dy = -p; dy <= p; dy++) for (let dx = -p; dx <= p; dx++) if (Math.abs(dx) + Math.abs(dy) <= p && on(x + dx, y + dy)) return true;
      return false;
    });
    rings.set(img, c);
  }
  return c;
}

// the frame a floor weapon is drawn in (WeaponItem.draw): its sprite's px about its centre
function itemFrame(ctx, it) {
  const p = it.body.position, k = (it.img.k || 1) * BODY_SCALE;
  ctx.translate(p.x, p.y);
  ctx.rotate(it.body.angle);
  ctx.scale(k * it.stretch, k);
}

export default class Cues {
  constructor(world) {
    this.world = world;
    this.seeds = new WeakMap(); // each weapon's glint phase
    this.n = 0;
    this.down = false;          // the player off his feet last frame
    this.upAt = null;           // world time he was last up (the ring's clock)
  }

  // his feet: on the ground (the level's start, a slip, a knock) or up again
  watch(on) {
    const w = this.world, p = w.player;
    if (!p) return;
    const down = !p.alive || p.sit > 0.3 || !!p.slipped || p.knocked > 0;
    if (this.down && !down) this.upAt = w.time;
    this.down = down;
    if (on && this.upAt === null && !down) this.upAt = w.time; // the level under way, him already up
  }

  // the ring at his feet, on the floor under everybody (lit with the scene)
  drawMark(ctx) {
    const w = this.world, p = w.player;
    this.watch(!!w.cues);
    if (!w.cues || !p?.alive || p.hidden || p.passage || this.upAt === null) return;
    const m = markAt(w.time - this.upAt);
    if (!m || m.a <= 0.01) return;
    const c = R.mark.color;
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = `rgba(8,4,16,${0.5 * m.a})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, m.r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${m.a})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, m.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // the floor weapons' glints and the in-reach outline, over the lit scene
  drawItems(ctx, vis) {
    const w = this.world, p = w.player;
    if (!w.cues || !p?.alive || p.hidden) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = false;
    for (const it of w.items) {
      if (it.dead || it.thrower || !vis(it.x, it.y)) continue;
      const f = fadeAt(Math.hypot(it.x - p.x, it.y - p.y));
      if (f <= 0.01 || !w.sightLine(p.x, p.y, it.x, it.y)) continue;
      if (it.hilite > 0) {
        const ring = ringOf(it.img);
        ctx.save();
        itemFrame(ctx, it);
        ctx.globalAlpha = clamp(reachAlpha(w.time), 0, 1);
        ctx.drawImage(ring, -ring.width / 2, -ring.height / 2);
        ctx.restore();
      }
      if (it.speed > 1) continue; // still sliding: no catch-light yet
      let seed = this.seeds.get(it);
      if (seed === undefined) { seed = (this.n++ * 0.618034) % 1; this.seeds.set(it, seed); }
      const g = glintAt(w.time, seed);
      if (!g || g.a * f <= 0.01) continue;
      const rim = rimOf(it.img), W = rim.width, bw = Math.max(2, R.glint.band * W);
      const x = -W / 2 - bw + g.s * (W + bw); // the band's left edge, sweeping from off one end to off the other
      ctx.save();
      itemFrame(ctx, it);
      ctx.beginPath(); ctx.rect(x, -rim.height / 2, bw, rim.height); ctx.clip();
      ctx.globalAlpha = g.a * f;
      ctx.drawImage(rim, -W / 2, -rim.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }
}
