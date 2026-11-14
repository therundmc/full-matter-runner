// What a fight looks like over the lighting (it has to read in the darkest corner): the victim's white flash, the
// star at the point of contact, each gun family's muzzle flash, the lingering wake of a heavy round, and the trails
// melee weapons leave through their strokes (sampled by Character.draw into a small ring per character). Numbers in
// data/feel.js. What marks an instant (the flash, the star, the muzzle flash) runs on the real clock: a frame or two,
// and the star bursts out while a hit-stop holds the world still; what follows a motion (trails, wakes) runs on world
// time, so it slows down with it.
// The state is plain data; only draw() and the white silhouette cache touch a canvas.
import { SMEAR_TINT, HEAVY, STROKE, feelOf } from '../data/feel.js';
import { sprite } from '../../engine/Assets.js';
import { rand, clamp, lerp, angDiff } from '../../engine/math.js';

const CAP = 24;          // effects of each kind alive at once (the oldest gives way)
const SMEAR_N = 10;      // points kept per character's weapon trail
const SHAPE_TINT = { star: '255,246,224', slash: '240,250,255', pop: '255,214,200' };
// a muzzle flash in flat bands, from its red-hot rim (it outlines the flame even in the glare of its own light) to
// its white heart, and how big each is
const FLAME = ['#d8401a', '#ff8a1e', '#ffd040', '#fff6cf'];
const BANDS = [1.12, 1, 0.62, 0.3];

// spikes [angle off the barrel, share of len (or of wide when `side`)] and the radius between them, per muzzle shape
const SHAPES = {
  star: { spikes: [[0, 1], [0.55, 0.55], [-0.55, 0.55], [1.5, 1, 1], [-1.5, 1, 1]], inner: 2.2 },
  burst: { spikes: [[0, 1], [0.35, 0.7], [-0.4, 0.75], [0.95, 0.9, 1], [-1, 0.8, 1], [1.6, 0.6, 1], [-1.6, 0.6, 1]], inner: 1.8 },
  puff: { spikes: [[0, 1], [1.2, 1, 1], [-1.2, 1, 1]], inner: 1.4, bands: 3 },
  tongue: { spikes: [[0, 1], [0.2, 0.9], [-0.22, 0.88], [0.45, 0.72], [-0.45, 0.7], [0.75, 1, 1], [-0.75, 1, 1]], inner: 3.2 },
  spear: { spikes: [[0, 1], [0.12, 0.5], [-0.12, 0.5], [1.57, 1, 1], [-1.57, 1, 1]], inner: 1.6 },
  brake: { spikes: [[0, 1], [0.1, 0.55], [-0.1, 0.55], [1.45, 2, 1], [-1.45, 2, 1], [1.75, 1.3, 1], [-1.75, 1.3, 1]], inner: 2 },
  blast: { spikes: [[0, 1], [0.6, 0.9], [-0.6, 0.9], [1.3, 1, 1], [-1.3, 1, 1], [2.1, 0.7, 1], [-2.1, 0.7, 1]], inner: 4 },
};

for (const sh of Object.values(SHAPES)) sh.spikes.sort((p, q) => p[0] - q[0]); // drawn round in order

const whites = new WeakMap(); // sprite -> its shape in flat white (made once per sprite)
const real = (world) => world.game?.time ?? world.time; // the clock of the screen (the world's one stops in a hit-stop)

export default class CombatFx {
  constructor(world) {
    this.world = world;
    this.flashes = []; // { ch, img, x, y, a, s, dir, t0, dur, shove, squash, twist, live }
    this.bursts = [];  // { x, y, a, t0, life, rays, len, width, shape, tint, rot, j }
    this.muzzles = []; // { ch, x, y, a, t0, dur, shape, len, wide, j }
    this.wakes = [];   // { x0, y0, x1, y1, t0, life, width }
  }

  // the man shows white for a moment. Alive (knocked down), it follows him; killed, his silhouette as he stood is
  // carried a few px along the blow, flattened and turned by it (f: a FEEL entry), while the body falls under it
  flash(ch, dir, f, lethal) {
    if (!f.flash || !ch.torso) return;
    const P = ch.pose, side = Math.sin((P?.ta ?? ch.angle) - dir) >= 0 ? 1 : -1;
    add(this.flashes, {
      ch, img: ch.torso, x: ch.x, y: ch.y, a: P?.ta ?? ch.angle, s: P?.s ?? 1, dir, t0: real(this.world), dur: f.flash,
      shove: lethal ? f.shove : 0, squash: lethal ? f.squash : 0, twist: lethal ? f.twist * side : 0, live: !lethal,
    });
  }

  // a star where it struck (spec: a FEEL burst or SURFACE), k: how big (1 = as given)
  burst(x, y, a, spec, k = 1) {
    if (!spec.rays) return;
    const j = [];
    for (let i = 0; i < spec.rays; i++) j.push(rand(0.65, 1.15));
    add(this.bursts, { x, y, a, t0: real(this.world), life: spec.life * (0.7 + 0.3 * k), rays: spec.rays, len: spec.len * k,
      width: spec.width * Math.sqrt(k), shape: spec.shape, tint: spec.tint || SHAPE_TINT[spec.shape], rot: rand(0, 6.28), j });
  }

  // a gun goes off at (x, y) along a (m: a FEEL muzzle); the flash stays on the barrel of `ch` as he recoils
  muzzle(x, y, a, m, ch) {
    const j = SHAPES[m.shape].spikes.map(() => rand(0.75, 1.2));
    add(this.muzzles, { ch, x, y, a, t0: real(this.world), dur: m.dur, shape: m.shape, len: m.len, wide: m.wide, j });
  }

  // the line of a heavy round's way, kept fresh while it flies (returned: the caller moves its end), then fading
  wake(x0, y0, life, width) {
    return add(this.wakes, { x0, y0, x1: x0, y1: y0, t0: this.world.time, life, width });
  }

  draw(ctx) {
    const now = this.world.time, t = real(this.world);
    prune(this.flashes, t, 'dur');
    prune(this.bursts, t, 'life');
    prune(this.muzzles, t, 'dur');
    prune(this.wakes, now, 'life');
    const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    for (const ch of this.world.chars) if (ch.smear?.n) drawSmear(ctx, ch.smear, now);
    for (const f of this.flashes) drawFlash(ctx, f, t);
    ctx.globalCompositeOperation = 'lighter';
    for (const w of this.wakes) drawWake(ctx, w, now);
    for (const b of this.bursts) drawBurst(ctx, b, t);
    ctx.globalCompositeOperation = gco;
    for (const m of this.muzzles) drawMuzzle(ctx, m);
    ctx.globalAlpha = ga;
  }
}

function add(list, e) {
  if (list.length >= CAP) list.shift();
  list.push(e);
  return e;
}

// drop what has run its course (in place)
function prune(list, now, key) {
  let w = 0;
  for (const e of list) if (now - e.t0 < e[key]) list[w++] = e;
  list.length = w;
}

const ALL = new WeakMap();
// the effects of a world (made on first use)
export function combatFx(world) {
  let fx = ALL.get(world);
  if (!fx) ALL.set(world, (fx = new CombatFx(world)));
  return fx;
}

// to be called by the renderer once the lighting is on the frame (WorldRenderer, after the projectiles)
export function drawCombat(ctx, world) { combatFx(world).draw(ctx); }

// a gun of definition d goes off at (x, y) along a: its family's flash, the light it throws on the shooter for a
// moment, sparks and smoke out of the barrel
export function muzzleFlash(world, x, y, a, d, ch) {
  const m = feelOf(d).muzzle;
  combatFx(world).muzzle(x, y, a, m, ch);
  world.light(x, y, m.light, '#ffb347', Math.max(0.05, m.dur * 1.2));
  if (m.sparks) world.particles.sparks(x, y, a, 0.35, m.sparks, 380);
  if (m.smoke) world.particles.smoke(x, y, m.smoke, 2, { speed: 30, size: 4, life: 0.6 });
}

// ---------------- weapon trails ----------------
// Called with the pose a character is drawn in: during the stroke of a blow (not its wind-up nor the way back), where
// the weapon's tip and its middle (a fist: the striking hand) are goes into his ring, as angles and distances about
// him, so the trail between two frames can follow the arc they were on. spec: a FEEL smear, heavy: the heavy stroke.
export function sampleSmear(ch, P, d, spec, heavy) {
  const p = 1 - ch.swing / ch.swingDur;
  if (!spec || ch.swing <= 0 || p < STROKE[0] || p > STROKE[1]) return;
  const now = ch.world.time;
  let S = ch.smear;
  if (!S) {
    const f = () => new Float32Array(SMEAR_N);
    S = ch.smear = { n: 0, head: 0, bx: f(), by: f(), ta: f(), tr: f(), ma: f(), mr: f(), t: new Float64Array(SMEAR_N),
      swing: 0, life: 0, width: 0, alpha: 0, color: '' };
  }
  const last = (S.head + SMEAR_N - 1) % SMEAR_N;
  if (S.n && S.t[last] === now) return; // a frozen frame (hit-stop): nothing moved
  if (ch.swing > S.swing) S.n = 0; // a new blow: a new trail
  S.swing = ch.swing;
  let tx, ty, mx, my;
  if (P.wpnOn && d.sprite) {
    const img = sprite(d.sprite), len = (img.width - d.grip) * P.wpnLen * P.s, c = Math.cos(P.wpn.a), s = Math.sin(P.wpn.a);
    mx = P.wpn.x + c * len * 0.35; my = P.wpn.y + s * len * 0.35;
    tx = P.wpn.x + c * len; ty = P.wpn.y + s * len;
  } else {
    const h = ch.punchSide < 0 ? P.hl : P.hr;
    tx = h.x; ty = h.y; mx = h.x * 0.6; my = h.y * 0.6;
  }
  const i = S.head;
  S.bx[i] = ch.x; S.by[i] = ch.y; S.t[i] = now;
  S.ta[i] = Math.atan2(ty, tx); S.tr[i] = Math.hypot(tx, ty);
  S.ma[i] = Math.atan2(my, mx); S.mr[i] = Math.hypot(mx, my);
  S.head = (i + 1) % SMEAR_N;
  S.n = Math.min(SMEAR_N, S.n + 1);
  S.life = spec.life * (heavy ? HEAVY.life : 1);
  S.width = spec.width * (heavy ? HEAVY.smear : 1);
  S.alpha = spec.alpha;
  S.color = `rgb(${SMEAR_TINT[d.material || 'none']})`;
}

// a point of the trail between samples i (u = 0) and j (u = 1), on the arc between them
const A = { tx: 0, ty: 0, mx: 0, my: 0, t: 0 }, B = { tx: 0, ty: 0, mx: 0, my: 0, t: 0 };
function along(S, i, j, u, out) {
  const bx = lerp(S.bx[i], S.bx[j], u), by = lerp(S.by[i], S.by[j], u);
  const ta = S.ta[i] + angDiff(S.ta[i], S.ta[j]) * u, tr = lerp(S.tr[i], S.tr[j], u);
  const ma = S.ma[i] + angDiff(S.ma[i], S.ma[j]) * u, mr = lerp(S.mr[i], S.mr[j], u);
  out.tx = bx + Math.cos(ta) * tr; out.ty = by + Math.sin(ta) * tr;
  out.mx = bx + Math.cos(ma) * mr; out.my = by + Math.sin(ma) * mr;
  out.t = lerp(S.t[i], S.t[j], u);
  return out;
}

// the band the weapon swept (tip to middle), fading with age, and its leading edge, thicker where it is fresh
function drawSmear(ctx, S, now) {
  ctx.fillStyle = ctx.strokeStyle = S.color;
  ctx.lineCap = 'round';
  let j = (S.head + SMEAR_N - 1) % SMEAR_N;
  for (let n = 1; n < S.n; n++) {
    const i = (j + SMEAR_N - 1) % SMEAR_N;
    if (now - S.t[i] >= S.life) break;
    const steps = clamp(Math.ceil(Math.abs(angDiff(S.ta[i], S.ta[j])) / 0.2), 1, 8);
    along(S, i, j, 1, B);
    for (let k = steps - 1; k >= 0; k--) {
      along(S, i, j, k / steps, A);
      const f = clamp(1 - (now - A.t) / S.life, 0, 1), f0 = clamp(1 - (now - B.t) / S.life, 0, 1);
      ctx.globalAlpha = S.alpha * 0.45 * f;
      ctx.beginPath();
      ctx.moveTo(B.tx, B.ty); ctx.lineTo(A.tx, A.ty); ctx.lineTo(A.mx, A.my); ctx.lineTo(B.mx, B.my);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = Math.min(0.85, S.alpha * 1.4 * f0);
      ctx.lineWidth = Math.max(0.6, S.width * f0);
      ctx.beginPath(); ctx.moveTo(B.tx, B.ty); ctx.lineTo(A.tx, A.ty); ctx.stroke();
      Object.assign(B, A);
    }
    j = i;
  }
  ctx.globalAlpha = 1;
}

// ---------------- drawing ----------------
// the sprite's shape in flat white
function white(img) {
  let w = whites.get(img);
  if (w) return w;
  w = document.createElement('canvas');
  w.width = img.width; w.height = img.height;
  const g = w.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w.width, w.height);
  whites.set(img, w);
  return w;
}

function drawFlash(ctx, f, now) {
  const k = clamp((now - f.t0) / f.dur, 0, 1), img = white(f.img);
  const ch = f.ch, live = f.live && ch.alive;
  const x = live ? ch.x + (ch.pose?.tx ?? 0) : f.x, y = live ? ch.y + (ch.pose?.ty ?? 0) : f.y, a = live ? ch.pose?.ta ?? f.a : f.a;
  const e = 1 - (1 - k) * (1 - k); // carried fast, then it settles
  ctx.save();
  ctx.translate(x + Math.cos(f.dir) * f.shove * e, y + Math.sin(f.dir) * f.shove * e);
  ctx.rotate(f.dir);
  ctx.scale(1 - f.squash * e, 1 + f.squash * 0.5 * e); // flattened along the blow
  ctx.rotate(a + f.twist * e - f.dir);
  ctx.scale(f.s, f.s);
  ctx.globalAlpha = k < 0.5 ? 1 : 2 * (1 - k);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

function drawBurst(ctx, b, now) {
  const k = clamp((now - b.t0) / b.life, 0, 1), e = 1 - (1 - k) * (1 - k);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.fillStyle = `rgb(${b.tint})`;
  ctx.globalAlpha = 1 - k * k;
  if (b.shape === 'slash') {
    // a cut: one long thin flash across the stroke, two short ones off it
    ctx.rotate(b.a + Math.PI / 2);
    for (let i = 0; i < b.rays; i++) {
      const l = b.len * (i ? 0.4 : 1) * (0.5 + 0.5 * e) * b.j[i], h = b.width * (1 - 0.7 * k), o = i ? (i === 1 ? 3 : -3) : 0;
      ctx.beginPath(); ctx.moveTo(-l, o); ctx.lineTo(0, o - h); ctx.lineTo(l, o); ctx.lineTo(0, o + h); ctx.closePath(); ctx.fill();
    }
  } else {
    // a star: thin rays out of a hot core, longer along the blow; they shoot out and thin away
    ctx.rotate(b.rot);
    const r0 = 1.5 + 2.5 * e;
    for (let i = 0; i < b.rays; i++) {
      const ra = (i / b.rays) * Math.PI * 2, along = Math.abs(Math.cos(ra + b.rot - b.a));
      const l = b.len * (0.45 + 0.55 * e) * b.j[i] * (0.7 + 0.5 * along), h = b.width * (1 - 0.75 * k);
      const c = Math.cos(ra), s = Math.sin(ra);
      ctx.beginPath();
      ctx.moveTo(c * r0 - s * h, s * r0 + c * h); ctx.lineTo(c * l, s * l); ctx.lineTo(c * r0 + s * h, s * r0 - c * h);
      ctx.closePath(); ctx.fill();
    }
    if (k < 0.4) { const c = b.width * 1.6; ctx.fillRect(-c, -c, c * 2, c * 2); }
  }
  ctx.restore();
}

function drawMuzzle(ctx, m) {
  const sh = SHAPES[m.shape], bands = sh.bands || FLAME.length, ch = m.ch;
  if (ch?.alive && ch.hasGun) { const p = ch.muzzlePos(); m.x = p.x; m.y = p.y; m.a = ch.angle; }
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.a);
  ctx.globalAlpha = 1;
  for (let b = 0; b < bands; b++) {
    const k = BANDS[b];
    ctx.fillStyle = FLAME[b];
    ctx.beginPath();
    ctx.moveTo(-sh.inner * k * 0.6, 0);
    sh.spikes.forEach(([oa, l, side], i) => {
      const r = (side ? m.wide : m.len) * l * k * m.j[i];
      ctx.lineTo(Math.cos(oa - 0.18) * sh.inner * k, Math.sin(oa - 0.18) * sh.inner * k);
      ctx.lineTo(Math.cos(oa) * r, Math.sin(oa) * r);
      ctx.lineTo(Math.cos(oa + 0.18) * sh.inner * k, Math.sin(oa + 0.18) * sh.inner * k);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWake(ctx, w, now) {
  const f = 1 - (now - w.t0) / w.life;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(255,240,200,1)';
  ctx.globalAlpha = 0.12 * f;
  ctx.lineWidth = w.width * 2.5;
  ctx.beginPath(); ctx.moveTo(w.x0, w.y0); ctx.lineTo(w.x1, w.y1); ctx.stroke();
  ctx.globalAlpha = 0.5 * f;
  ctx.lineWidth = Math.max(0.5, w.width * 0.4 * f);
  ctx.beginPath(); ctx.moveTo(w.x0, w.y0); ctx.lineTo(w.x1, w.y1); ctx.stroke();
}
