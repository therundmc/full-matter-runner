// A route's line (pure geometry, DOM-free): straight lines through points, each inner corner rounded off by an arc.
// Level 1's getaway (systems/Outro.js getawayPath) and the chase's scripted bends (systems/Route.js) are laid with it.
import { clamp } from '../../engine/math.js';
import { OUTRO } from '../data/outro.js';

// A route: straight lines through pts ([x, y] px), each inner point rounded off by a bend of radius radii[i - 1]
// (r0 when missing; shortened when the lines are too short for it). { length, at(s) } where at gives the point s px
// along it: { x, y, a: the way it runs, turn: -1 | 0 | 1 in a bend (1: a grows, clockwise on screen), slide: the
// turn times the share of the full slide that bend is taken with (slides[i - 1], 1 when missing; 0: a bend too
// tight to slide through) }.
export function routePath(pts, radii = [], r0 = OUTRO.radius, slides = []) {
  const segs = [];
  let cur = pts[0], length = 0;
  const line = (to) => {
    const len = Math.hypot(to[0] - cur[0], to[1] - cur[1]);
    if (len > 1e-6) { segs.push({ s0: length, len, from: cur, a: Math.atan2(to[1] - cur[1], to[0] - cur[0]) }); length += len; }
    cur = to;
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const P = pts[i], B = pts[i + 1];
    const l1 = Math.hypot(P[0] - cur[0], P[1] - cur[1]), l2 = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const d1 = [(P[0] - cur[0]) / l1, (P[1] - cur[1]) / l1], d2 = [(B[0] - P[0]) / l2, (B[1] - P[1]) / l2];
    const cross = d1[0] * d2[1] - d1[1] * d2[0], phi = Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1));
    if (phi < 0.02) continue; // no bend to speak of
    const half = Math.tan(phi / 2), sign = cross >= 0 ? 1 : -1;
    const r = Math.min(radii[i - 1] ?? r0, (l1 * 0.98) / half, (l2 * 0.49) / half), tl = r * half;
    line([P[0] - d1[0] * tl, P[1] - d1[1] * tl]);
    const c = [cur[0] - d1[1] * sign * r, cur[1] + d1[0] * sign * r];
    segs.push({ s0: length, len: r * phi, c, r, sign, k: slides[i - 1] ?? 1, a0: Math.atan2(cur[1] - c[1], cur[0] - c[0]) });
    length += r * phi;
    cur = [P[0] + d2[0] * tl, P[1] + d2[1] * tl];
  }
  line(pts[pts.length - 1]);
  const at = (s) => {
    s = clamp(s, 0, length);
    let g = segs[segs.length - 1];
    for (const k of segs) if (s <= k.s0 + k.len) { g = k; break; }
    const u = s - g.s0;
    if (!g.c) return { x: g.from[0] + Math.cos(g.a) * u, y: g.from[1] + Math.sin(g.a) * u, a: g.a, turn: 0, slide: 0 };
    const th = g.a0 + (g.sign * u) / g.r;
    return { x: g.c[0] + Math.cos(th) * g.r, y: g.c[1] + Math.sin(th) * g.r, a: th + (g.sign * Math.PI) / 2, turn: g.sign, slide: g.sign * g.k };
  };
  return { length, at };
}
