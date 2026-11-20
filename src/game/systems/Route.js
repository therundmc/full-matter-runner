// The chase's ROUTE (level 2A, docs/LEVEL2.md "Legs and scripted bends"): the road as straight LEGS along +x, joined
// by scripted BENDS (a corner the wheel is the script's: systems/Drive.js and systems/Pursuit.js drive a car through
// one with bendStep). Pure, DOM-free, Matter-free: the level's `chase` block in, plain numbers out.
//   legs  [{ from, to: cols (the leg holds from <= col < to), lanes: rows (2 or more, any order), mid: row (the
//         camera's middle across; none: the lanes'), cruise: px/step, view: px (the picture's height; none: the
//         chase's, else CHASE.camera.view), kerbs: [row, row] (the roadway's first row, the first sidewalk row),
//         across: [[col0, col1, row above, row below]] (streets across: Drive.fronts) }]. No `legs`: one leg as long
//         as the map, from the chase's own lanes / mid / cruise / view / kerbs (the chase before legs).
//   bends [{ at: col (the car's middle there on its leg: the script takes over), path: [[col, row], ...] (the corner
//         points of its line: straight lines, each inner point rounded off by an arc of `radius` tiles), radius:
//         tiles (one number, or one per inner point; CHASE.bend.radius), speed: px/step in a turn (CHASE.bend.speed),
//         to: the leg it hands the car to }]. Its line ends on the lane of `to` nearest its last point, along +x.
// The route's distance (px) counts from the van's start along every leg and through every bend's line: a leg k is
// anchored at (x0, s0): a point x on it is s0 + (x - x0) along the route; in a bend it is the bend's s0 + p - pivot
// (p: px along its line of the point `pivot` px ahead of the car's middle, the one that keeps to it).
import { TILE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { CHASE } from '../data/chase.js';
import { routePath } from './Outro.js';

// the legs of a `chase` block, as above
export function legsOf(o = {}) {
  const list = o.legs?.length ? o.legs : [{ from: -Infinity, to: Infinity, lanes: o.lanes, mid: o.mid, kerbs: o.kerbs }];
  return list.map((L) => {
    const lanes = L.lanes?.length ? [...L.lanes].sort((a, b) => a - b) : null;
    return {
      from: L.from ?? -Infinity, to: L.to ?? Infinity, lanes,
      mid: L.mid ?? (lanes ? lanes.reduce((s, r) => s + r, 0) / lanes.length : null),
      cruise: L.cruise ?? o.cruise ?? CHASE.cruise, view: L.view ?? o.view ?? null, kerbs: L.kerbs ?? null,
      // (the chase's own `across` holds on every leg: its columns are the map's)
      across: [...(o.legs?.length ? L.across || [] : []), ...(o.across || [])],
    };
  });
}

// the leg a point at x (world px) is on: the last one starting at or before its column
export function legAt(legs, x) {
  const c = x / TILE;
  let i = 0;
  for (let k = 0; k < legs.length; k++) if (legs[k].from <= c) i = k;
  return i;
}

// the lane of rows (tiles) nearest row, or row itself when there are none
export const nearestLane = (rows, row) => (rows?.length ? rows.reduce((b, r) => (Math.abs(r - row) < Math.abs(b - row) ? r : b)) : row);

// The bends of a `chase` block: [{ i, at, x (px), from, to (legs), speed, path (Outro.routePath: { length, at(p) }),
// length, start, end ({ x, y } px: its line's first and last points) }]
export function bendsOf(o = {}, legs = legsOf(o), C = CHASE.bend) {
  return (o.bends || []).map((B, i) => {
    const pts = B.path.map(([c, r]) => [c * TILE, r * TILE]), last = pts[pts.length - 1];
    last[1] = nearestLane(legs[B.to]?.lanes, last[1] / TILE) * TILE; // (ends on a lane of its leg)
    const radii = Array.isArray(B.radius) ? B.radius.map((r) => r * TILE) : pts.slice(2).map(() => (B.radius ?? C.radius) * TILE);
    const path = routePath(pts, radii, C.radius * TILE);
    return {
      i, at: B.at, x: B.at * TILE, from: legAt(legs, B.at * TILE), to: B.to, speed: B.speed ?? C.speed, path,
      length: path.length, start: { x: pts[0][0], y: pts[0][1] }, end: { x: last[0], y: last[1] }, miss: !!B.miss,
    };
  });
}

// The whole route: { legs (each anchored: x0, s0), bends (each with its s0), total: px from the start to the chase's
// `end` (null: none) }. A leg no bend leads into goes on from the one before it
export function routeOf(o = {}, C = CHASE.bend) {
  const legs = legsOf(o), bends = bendsOf(o, legs, C);
  legs[0].x0 = (o.van?.[0] ?? 0) * TILE;
  legs[0].s0 = 0;
  for (let k = 1; k < legs.length; k++) {
    const b = bends.find((q) => q.to === k);
    const prev = legs[k - 1];
    if (b) {
      const L = legs[b.from];
      b.s0 = L.s0 + (b.x - L.x0);
      legs[k].x0 = b.end.x;
      legs[k].s0 = b.s0 + b.length;
    } else {
      legs[k].x0 = legs[k].from * TILE;
      legs[k].s0 = prev.s0 + (legs[k].x0 - prev.x0);
    }
  }
  for (const b of bends) if (b.s0 === undefined) { const L = legs[b.from]; b.s0 = L.s0 + (b.x - L.x0); }
  const end = o.end ? o.end * TILE : null, E = end === null ? null : legs[legAt(legs, end)];
  return { legs, bends, total: E ? E.s0 + (end - E.x0) : null };
}

// px along the route of a car at x (world px) on its leg, or in a bend (b: the bend, p: px along its line)
export function along(route, x, b = null, p = 0, C = CHASE.bend) {
  if (b) return b.s0 + p - C.pivot;
  const L = route.legs[legAt(route.legs, x)];
  return L.s0 + (x - L.x0);
}

// px along a bend's line of the point of it nearest (x, y), looked for within `span` px of p (whole line: span
// Infinity), every `step` px
export function project(path, x, y, p = 0, span = Infinity, step = 4) {
  const a = Math.max(0, p - span), z = Math.min(path.length, p + span);
  let best = a, bd = Infinity;
  for (let s = a; s <= z + 1e-6; s += step) {
    const q = path.at(s), d = (q.x - x) ** 2 + (q.y - y) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// how far across the line at p (px; +: to the right of the way it runs, the +y side going +x) a point is
export function offsetAt(path, p, x, y) {
  const q = path.at(p);
  return -(x - q.x) * Math.sin(q.a) + (y - q.y) * Math.cos(q.a);
}

// A CAR THROUGH A BEND, a step (pure). st: { p: px along the line of the point `pivot` px ahead of its middle, v:
// px/step, slip: rad its nose is turned in past the line (the tail out), slipV, off0: px it was off the line coming
// in, p0: where along it that was }; want: the speed it is held to (px/step; a bend's own: b.speed in a turn,
// C.straight between two). Brakes at `brake` px/step a second into a turn seen `look` px ahead, gains `accel` out of
// it; the tail swung out `slip` rad (by the turn's side, at the bend's speed) on a spring; off the line it came in on,
// brought onto it over `merge` px. Returns its pose { x, y: its middle, a: the way it points, q: the line's point }
export function bendStep(st, b, dt, want = Infinity, C = CHASE.bend) {
  const turning = b.path.at(st.p).turn || b.path.at(st.p + C.look).turn;
  const target = Math.min(want, turning ? b.speed : Math.max(b.speed, C.straight));
  st.v = st.v > target ? Math.max(target, st.v - C.brake * dt) : Math.min(target, st.v + C.accel * dt);
  st.p = Math.min(b.length, st.p + st.v);
  return bendPose(st, b, dt, C);
}

// its pose at st.p, the slide sprung toward the turn's (bendStep without moving it on: dt 0 leaves the slide)
export function bendPose(st, b, dt = 0, C = CHASE.bend) {
  const q = b.path.at(st.p), [k, d] = C.spring, want = (q.turn || 0) * C.slip * clamp(st.v / b.speed, 0, 1);
  st.slipV += ((want - st.slip) * k - st.slipV * d) * dt;
  st.slip += st.slipV * dt;
  const m = clamp((st.p - st.p0) / C.merge, 0, 1), off = st.off0 * (1 - m * m * (3 - 2 * m));
  const a = q.a + st.slip, nx = -Math.sin(q.a), ny = Math.cos(q.a);
  return { x: q.x + nx * off - Math.cos(a) * C.pivot, y: q.y + ny * off - Math.sin(a) * C.pivot, a, q };
}

// a car's state as it comes into bend b, its middle at (x, y) going v px/step, its nose at angle a (the slide it
// already had carried in)
export function enterBend(b, x, y, a, v, slip = 0, slipV = 0, C = CHASE.bend) {
  const fx = x + Math.cos(a) * C.pivot, fy = y + Math.sin(a) * C.pivot, p = project(b.path, fx, fy);
  return { b, p, p0: p, v, slip, slipV, off0: offsetAt(b.path, p, fx, fy) };
}

// Does a car lying from y = min to max shut ALL the lanes of a road from `top` to `bottom` (its lanes' outer edges)?
// Neither side of it leaves `need` px (a car's width and a little): then it is pushed on toward its kerb. However
// many lanes there are, a car across them leaves two ways past it, one either side
export const blocksAll = (min, max, top, bottom, need) => min - top < need && bottom - max < need;

// the road's band across of a leg's lanes (world px): [the first lane's middle, the last one's], half a lane's width
// (none: null, and the lab's default)
export function bandOf(leg) {
  const L = leg?.lanes;
  if (!L?.length) return { band: null, half: TILE * 1.75, rows: null };
  const rows = L.map((r) => r * TILE);
  return { band: [rows[0], rows[rows.length - 1]], half: rows.length > 1 ? (rows[rows.length - 1] - rows[0]) / (rows.length - 1) / 2 : TILE * 1.75, rows };
}
