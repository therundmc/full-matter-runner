// The aim cue, LOCK (data/aim.js), painted in the world over the lighting (WorldRenderer, after the laser sights);
// the cursor stays the mouse's dot (FrameRenderer.drawCursor). Plain pixel art: every mark is whole world pixels in a flat ink
// (cyan at rest, white with a man in the line) over a dark edge, so that it reads on a lit floor as in the dark; no
// gradient, nothing drawn over the man it points at but its mark round him. What it tells comes from
// systems/AimCue.js. The floor's marks (LOCK's chevron, the throw's, the vault's) are worn stencil paint
// (systems/AimMark.js).
import { AIM } from '../data/aim.js';
import { aimCue, lockTarget, meleeLock, throwCue } from '../systems/AimCue.js';
import { ringBits, chevronBits, barBits } from '../systems/AimMark.js';

// ---- the marks of a frame: whole pixels, the brightest ink kept where two fall on the same one (the mark objects
// kept from frame to frame: `pool`, `used` of them taken this frame)
const marks = new Map(), pool = [];
let used = 0;
function dot(x, y, col, alpha) {
  const ix = Math.floor(x), iy = Math.floor(y), k = ix * 8192 + iy;
  let m = marks.get(k);
  if (m && m.alpha >= alpha) return;
  if (!m) {
    m = pool[used] || (pool[used] = { x: 0, y: 0, col: '', alpha: 0 });
    used++;
    marks.set(k, m);
  }
  m.x = ix; m.y = iy; m.col = col; m.alpha = alpha;
}
// a pixel line from (x, y) along a, from d0 to d1 px; dash: [on, off, phase] or null for a solid one
function ray(x, y, a, d0, d1, col, alpha, dash = null) {
  const c = Math.cos(a), s = Math.sin(a), n = dash ? dash[0] + dash[1] : 0;
  for (let d = d0; d <= d1; d++) {
    if (dash && ((((d - dash[2]) % n) + n) % n) >= dash[0]) continue;
    dot(x + c * d, y + s * d, col, alpha);
  }
}
// the dark edge first, then the inks
function flush(ctx) {
  ctx.fillStyle = AIM.ink;
  for (const m of marks.values()) {
    ctx.globalAlpha = m.alpha * AIM.under;
    ctx.fillRect(m.x - 1, m.y - 1, 3, 3);
  }
  for (const m of marks.values()) {
    ctx.globalAlpha = m.alpha;
    ctx.fillStyle = m.col;
    ctx.fillRect(m.x, m.y, 1, 1);
  }
  ctx.globalAlpha = 1;
  marks.clear();
  used = 0;
}

// how far from him the floor chevron may stand: C.at, nearer when a wall is nearer
function standOff(p, q, C) {
  if (q.kind !== 'gun' || !q.hit || q.target) return C.at;
  const d = Math.hypot(q.x + Math.cos(q.a) * q.len - p.x, q.y + Math.sin(q.a) * q.len - p.y);
  return Math.max(p.radius + 8, Math.min(C.at, d - C.wall));
}

// ---- the worn floor marks (systems/AimMark.js gives their pixels and their wear)
// a worn chevron pointing along a, its tip `at` px from (x, y)
function wornChevron(x, y, a, at, size, col, alpha, seed) {
  const c = Math.cos(a), s = Math.sin(a), tx = x + c * at, ty = y + s * at;
  for (const b of chevronBits(seed, size)) dot(tx + c * b.u - s * b.v, ty + s * b.u + c * b.v, col, alpha * b.k);
}

// LOCK: the corner ticks on the man nearest the line (AIM.lock.corners), white once the line is on him (on a gamepad
// the aim is pulled onto him: CameraDirector.padAim); with the AIM MARK option (World.aimMark, Settings `aimMark`) a worn
// chevron on the floor too, pointing out along the aim, white once the line is on a man
function lock(world, p, q, t) {
  const L = AIM.lock, C = L.chevron;
  // with a melee weapon, the man meleeLock gives from the aim (what a click strikes), white when close: a swing lands
  const ml = q.kind === 'melee' ? meleeLock(world, p, p.def, p.aimA ?? q.a) : null;
  const near = q.kind === 'melee' ? ml?.man ?? null : q.target || lockTarget(world, q.team, p.x, p.y, q.a, L.cone, L.reach);
  const on = !!near && (q.target === near || !!ml?.close);
  const col = on ? AIM.hot : AIM.rest, i = on ? 1 : 0;
  if (world.aimMark) wornChevron(p.x, p.y, q.a, standOff(p, q, C) + C.size, C.size, col, C.alpha[i], C.seed);
  if (near) corners(near, t, on);
}

// the car gun out of its arc: a short grey stub out of his seat and a cross at its end (his hand cannot point there)
function offArc(q) {
  const O = AIM.offArc, ex = q.x + Math.cos(q.a) * O.len, ey = q.y + Math.sin(q.a) * O.len;
  ray(q.x, q.y, q.a, 4, O.len - O.cross - 2, AIM.off, O.alpha, [O.on, O.off, 0]);
  for (let k = -O.cross; k <= O.cross; k++) {
    dot(ex + k, ey + k, AIM.off, O.alpha);
    dot(ex + k, ey - k, AIM.off, O.alpha);
  }
}

// The vault's mark (Player.vaultHint: Space would vault here), LOCK's paint: a worn bar on the obstacle's edge and two
// arcs bowed the way he would go, hopping over it
export function drawVaultMark(ctx, v, t) {
  const H = AIM.hop, x = Math.floor(v.ledge.x), y = Math.floor(v.ledge.y), a = Math.atan2(v.to.y - v.ledge.y, v.to.x - v.ledge.x);
  const c = Math.cos(a), s = Math.sin(a), o = Math.round(H.rise * (0.5 + 0.5 * Math.sin(t * H.rate)));
  for (const b of barBits(H.seed, H.edge)) for (let k = 0; k < H.thick; k++) dot(x - s * b.u - c * k, y + c * b.u - s * k, AIM.rest, H.alpha[0] * b.k);
  const cx = Math.round(x - c * H.back), cy = Math.round(y - s * H.back);
  H.r.forEach((r, n) => {
    for (const b of ringBits(H.seed + 1 + n, r + o, 1, H.span[n], a, H.width[n])) dot(cx + b.x, cy + b.y, n ? AIM.rest : AIM.hot, H.alpha[n] * b.k);
  });
  flush(ctx);
}

// LOCK's corner ticks round a man, white on him
function corners(c, t, on) {
  const B = AIM.lock.corners, r = Math.round(B.box + (on ? Math.sin(t * B.rate) * B.pulse : 2)), col = on ? AIM.hot : AIM.rest, i = on ? 1 : 0;
  const cx = Math.floor(c.x), cy = Math.floor(c.y);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (let k = 0; k < B.corner; k++) {
        dot(cx + sx * (r - k), cy + sy * r, col, B.alpha[i]);
        dot(cx + sx * r, cy + sy * (r - k), col, B.alpha[i]);
      }
    }
  }
}

// THE THROW being wound up (systems/AimCue.js throwCue): a dotted line on the floor from his hand
// to where it would stop or what it meets, longer as it charges and solid once it is full; white with a man on it,
// the corner ticks on him; a worn chevron at its end on open floor
function drawThrow(q, t) {
  const T = AIM.throw, man = q.target || q.lock, hot = !!q.target, col = hot ? AIM.hot : AIM.rest, full = q.k >= 1;
  const end = q.len - (hot ? q.target.radius - 2 : 0);
  const band = (d) => T.bands[Math.min(T.bands.length - 1, Math.floor(d / Math.max(1, q.len) * T.bands.length))];
  for (let d = T.start; d <= end; d += full ? 1 : T.every) dot(q.x + Math.cos(q.a) * d, q.y + Math.sin(q.a) * d, col, hot ? 0.95 : band(d));
  if (man) corners(man, t, hot);
  else if (!q.hit) wornChevron(q.x, q.y, q.a, q.len, T.chevron, col, band(q.len), T.seed);
}

// LOCK's marks; a throw being wound up shows its own mark instead
export function drawAim(ctx, world, t) {
  const tq = throwCue(world);
  if (tq) { drawThrow(tq, t); flush(ctx); return; }
  const q = aimCue(world), p = world.player;
  if (!q) return;
  // at the wheel the marks stand round his hand, not round the seat
  const c = p.riding ? { x: q.x, y: q.y, radius: p.radius, def: p.def } : p;
  ctx.save();
  if (q.off) offArc(q);
  else lock(world, c, q, t);
  flush(ctx);
  ctx.restore();
}
