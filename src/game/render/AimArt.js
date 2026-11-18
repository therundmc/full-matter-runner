// The aim cue, painted in the world over the lighting (WorldRenderer, after the laser sights): the concepts of
// data/aim.js but the cross, which stays the cursor's (Game.drawCursor). Plain pixel art: every mark is whole world
// pixels in a flat ink (cyan at rest, white with a man in the line) over a dark edge, so that it reads on a lit floor
// as in the dark; no gradient (a line pales by bands), nothing drawn over the man it points at but a pip or brackets
// round him. What it tells comes from systems/AimCue.js.
import { AIM } from '../data/aim.js';
import { aimCue, lineOfFire, lockTarget } from '../systems/AimCue.js';
import { angDiff } from '../../engine/math.js';

// ---- the marks of a frame: whole pixels, the brightest ink kept where two fall on the same one
let marks = new Map();
function dot(x, y, col, alpha) {
  const ix = Math.floor(x), iy = Math.floor(y), k = ix * 8192 + iy, m = marks.get(k);
  if (!m || m.alpha < alpha) marks.set(k, { x: ix, y: iy, col, alpha });
}
// a pixel line from (x, y) along a, from d0 to d1 px; dash: [on, off, phase] or null for a solid one
function ray(x, y, a, d0, d1, col, alpha, dash = null) {
  const c = Math.cos(a), s = Math.sin(a), n = dash ? dash[0] + dash[1] : 0;
  for (let d = d0; d <= d1; d++) {
    if (dash && ((((d - dash[2]) % n) + n) % n) >= dash[0]) continue;
    dot(x + c * d, y + s * d, col, typeof alpha === 'function' ? alpha(d) : alpha);
  }
}
function segment(x0, y0, x1, y1, col, alpha) {
  ray(x0, y0, Math.atan2(y1 - y0, x1 - x0), 0, Math.hypot(x1 - x0, y1 - y0), col, alpha);
}
function square(x, y, r, col, alpha) {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) dot(x + i, y + j, col, alpha);
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
  marks = new Map();
}

// a chevron pointing along a, its tip `at` px from (x, y), two px thick; `n` of them one behind the other
function chevron(x, y, a, at, size, col, alpha, n = 1) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let j = 0; j < n; j++) {
    const tx = x + c * (at - j * (size + 2)), ty = y + s * (at - j * (size + 2));
    for (let k = 0; k <= size; k++) {
      for (const side of [-1, 1]) {
        for (const back of [0, 1]) dot(tx - c * (k + back) - s * k * side, ty - s * (k + back) + c * k * side, col, alpha);
      }
    }
  }
}

// ---- the concepts
// LINE: dashes marching out of the muzzle, paler band by band; a pip on the wall that stops them; a man in the line
// turns it white and solid all the way to him
function line(q, t) {
  const L = AIM.line, hot = !!q.target, col = hot ? AIM.hot : AIM.rest;
  const end = hot ? q.len : Math.min(q.len, L.len), dash = [L.on, L.off, q.kind === 'melee' ? 0 : t * L.march];
  const band = (d) => L.bands[Math.min(L.bands.length - 1, Math.floor(d / L.len * L.bands.length))];
  ray(q.x, q.y, q.a, Math.min(L.start, end), end - (hot ? 3 : 0), col, hot ? L.hot : band, q.kind === 'melee' || hot ? null : dash);
  const ex = q.x + Math.cos(q.a) * end, ey = q.y + Math.sin(q.a) * end;
  if (hot) square(ex, ey, 1, AIM.hot, 1);
  else if (q.kind === 'melee') segment(ex + Math.sin(q.a) * 3, ey - Math.cos(q.a) * 3, ex - Math.sin(q.a) * 3, ey + Math.cos(q.a) * 3, col, L.bands[0]);
  else if (q.hit && q.len <= L.len) square(ex, ey, (L.pip - 1) / 2, col, band(end));
}

// WEDGE: what the weapon throws, on the floor: a gun's spread stopped by the walls, a blade's swing; flat, brighter
// with a man in it
function wedge(ctx, world, q) {
  const W = AIM.wedge, half = Math.max(q.half, q.kind === 'gun' ? W.min : 0), n = W.rays, ends = [];
  let hot = !!q.target;
  for (let i = 0; i < n; i++) {
    const a = q.a + half * (i / (n - 1) * 2 - 1);
    let len = q.len;
    if (q.kind === 'gun') {
      const f = i === (n - 1) / 2 ? q : lineOfFire(world, q.team, q.x, q.y, a, q.skip, W.len);
      hot = hot || (!!f.target && f.len <= W.len);
      len = Math.min(f.len, W.len);
    }
    ends.push({ a, len, x: q.x + Math.cos(a) * len, y: q.y + Math.sin(a) * len });
  }
  if (q.kind === 'melee') {
    const p = world.player;
    hot = world.chars.some((c) => c.alive && c.team !== q.team && Math.hypot(c.x - p.x, c.y - p.y) < p.def.range + c.radius
      && Math.abs(angDiff(q.a, Math.atan2(c.y - p.y, c.x - p.x))) < half);
  }
  const col = hot ? AIM.hot : AIM.rest;
  ctx.globalAlpha = hot ? W.hot : W.fill;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(Math.round(q.x), Math.round(q.y));
  for (const e of ends) ctx.lineTo(Math.round(e.x), Math.round(e.y));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  const edge = hot ? W.edgeHot : W.edge;
  for (const e of [ends[0], ends[n - 1]]) ray(q.x, q.y, e.a, Math.min(W.start, e.len), e.len, col, edge);
  // its far edge, where the floor is open (not across a wall's corner)
  for (let i = 1; i < n; i++) {
    const a = ends[i - 1], b = ends[i];
    if (Math.abs(a.len - b.len) < 6 && (q.kind === 'melee' || a.len >= W.len - 1)) segment(a.x, a.y, b.x, b.y, col, edge * 0.7);
  }
}

// how far from him a mark on the aim line may stand: N.at, nearer when a wall is nearer
function standOff(p, q, at) {
  if (q.kind !== 'gun' || !q.hit || q.target) return at;
  const d = Math.hypot(q.x + Math.cos(q.a) * q.len - p.x, q.y + Math.sin(q.a) * q.len - p.y);
  return Math.max(p.radius + 8, Math.min(at, d - AIM.notch.wall));
}

// NOTCH: a chevron at a fixed distance on the aim line, on a faint dotted arc of the ring round him; two chevrons,
// white, with a man in the line
function notch(p, q) {
  const N = AIM.notch, hot = !!q.target, at = standOff(p, q, N.at), col = hot ? AIM.hot : AIM.rest;
  for (let da = -N.arc; da <= N.arc + 1e-6; da += N.dot) {
    if (Math.abs(da) < N.dot * 1.5) continue;
    dot(p.x + Math.cos(q.a + da) * (at - 2), p.y + Math.sin(q.a + da) * (at - 2), AIM.rest, N.ring);
  }
  chevron(p.x, p.y, q.a, at + N.size, N.size, col, N.alpha, hot ? 2 : 1);
}

// LOCK: the chevron on the floor, white once the line is on a man; faint corner ticks round the man nearest the line
// (on a gamepad the aim is pulled onto him: Game.padAim)
function lock(world, p, q, t) {
  const L = AIM.lock, N = AIM.notch;
  const near = q.target || lockTarget(world, q.team, p.x, p.y, q.a, L.cone, q.kind === 'melee' ? L.melee : L.reach);
  const on = !!near && (q.target === near || (q.kind === 'melee' && Math.hypot(near.x - p.x, near.y - p.y) < p.def.range + near.radius));
  const col = on ? AIM.hot : AIM.rest;
  chevron(p.x, p.y, q.a, standOff(p, q, N.at) + N.size - 1, N.size - 1, col, N.alpha);
  if (!near) return;
  const r = Math.round(L.box + (on ? Math.sin(t * L.rate) * L.pulse : 2)), alpha = L.alpha[on ? 1 : 0], cx = Math.floor(near.x), cy = Math.floor(near.y);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (let k = 0; k < L.corner; k++) {
        dot(cx + sx * (r - k), cy + sy * r, col, alpha);
        dot(cx + sx * r, cy + sy * (r - k), col, alpha);
      }
    }
  }
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

// style: one of data/aim.js AIM_STYLES ('cross' draws nothing here)
export function drawAim(ctx, world, style, t) {
  if (!style || style === 'cross') return;
  const q = aimCue(world), p = world.player;
  if (!q) return;
  // at the wheel the marks stand round his hand, not round the seat
  const c = p.riding ? { x: q.x, y: q.y, radius: p.radius, def: p.def } : p;
  ctx.save();
  if (q.off) offArc(q);
  else if (style === 'line') line(q, t);
  else if (style === 'wedge') wedge(ctx, world, q);
  else if (style === 'notch') notch(c, q);
  else if (style === 'lock') lock(world, c, q, t);
  flush(ctx);
  ctx.restore();
}
