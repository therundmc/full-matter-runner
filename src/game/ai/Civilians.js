// Passers-by brains, DOM-free and unit tested: a stroll along a path (with an optional stop: cigarette, shop
// window, phone, a chat for couples), then panic (hands up / duck for a beat) and a sprint off the map along a
// route that keeps away from the danger (escapeRoute). Units: px, px/s, s.
import { TILE, AMBIENT as A } from '../Config.js';
import { between } from '../systems/Traffic.js';

export const WALKER = { WALK: 'walk', STOP: 'stop', PANIC: 'panic', FLEE: 'flee', COWER: 'cower', DONE: 'done' };
const ACTIVITIES = ['smoke', 'window', 'phone'];
const REACH = 6; // px: a waypoint counts as reached

export class Walker {
  // path: [{x, y}] (first point = spawn); opts: { r, speed, run, partner, post }
  // post { activity, face }: a patron who stays at his spot, busy, until something scares him off
  constructor(path, { r, speed, run, partner = null, post = null }) {
    this.r = r;
    this.path = path;
    this.i = 1;
    this.speed = speed;
    this.run = run;
    this.partner = partner;   // the leader of a couple: the follower stops and chats when he does
    this.state = WALKER.WALK;
    this.t = 0;
    this.activity = null;
    this.pose = null;          // hands | duck while panicking
    this.danger = null;
    this.route = null;
    this.bark = null;          // set when he has something to scream (read and cleared by Ambient)
    // one stop somewhere along the way, at a distance from the start
    this.walked = 0;
    this.stopAt = !partner && !post && r() < A.stopChance ? between(r, [0.25, 0.75]) * pathLength(path) : -1;
    if (post) { this.state = WALKER.STOP; this.activity = post.activity; this.face = post.face; this.t = Infinity; }
  }

  get panicked() { return this.state === WALKER.PANIC || this.state === WALKER.FLEE || this.state === WALKER.COWER; }

  // Something scary at (x, y). kind: gunshot | explosion | kill | corpse | armed (a gun) | weapon (a bat, a knife) | scream | hit.
  // Returns true when this makes him panic (first time, or a much closer danger while fleeing).
  alarm(x, y, kind, from) {
    if (this.state === WALKER.DONE) return false;
    if (this.panicked) {
      if (this.state !== WALKER.FLEE || !from) return false;
      const d = Math.hypot(x - from.x, y - from.y);
      if (!this.danger || d > Math.hypot(this.danger.x - from.x, this.danger.y - from.y) * 0.5) return false;
      this.danger = { x, y };
      this.route = null; // re-route away from the new threat
      return false;
    }
    this.state = WALKER.PANIC;
    this.danger = { x, y };
    this.pose = kind === 'armed' || (kind === 'gunshot' && this.r() < 0.4) ? 'hands' : 'duck';
    this.t = kind === 'scream' ? between(this.r, A.panic.freeze) * 0.5 : between(this.r, A.panic.freeze);
    this.bark = kind === 'armed' ? 'beg' : kind === 'weapon' ? 'back' : 'scream';
    return true;
  }

  // sense: { escape(x, y, danger) -> [{x, y}] | null } (only called when a route is needed)
  // returns the intent { x, y (target or null), speed (px/s), face (angle or null) }
  update(dt, x, y, sense) {
    this.t -= dt;
    switch (this.state) {
      case WALKER.WALK: return this.walk(dt, x, y);
      case WALKER.STOP: {
        const p = this.partner;
        const done = p ? p.state !== WALKER.STOP : this.t <= 0;
        if (done) { this.state = WALKER.WALK; this.activity = null; return this.walk(dt, x, y); }
        return { x: null, y: null, speed: 0, face: this.face };
      }
      case WALKER.PANIC:
        if (this.t > 0) return { x: null, y: null, speed: 0, face: Math.atan2(this.danger.y - y, this.danger.x - x) };
        this.state = WALKER.FLEE;
        this.pose = null;
        this.route = null;
        return this.update(0, x, y, sense);
      case WALKER.FLEE: {
        if (!this.route) {
          this.route = sense.escape(x, y, this.danger);
          this.ri = 0;
          if (!this.route) { this.state = WALKER.COWER; this.pose = 'duck'; this.t = between(this.r, [6, 10]); return this.update(0, x, y, sense); }
        }
        while (this.ri < this.route.length && Math.hypot(this.route[this.ri].x - x, this.route[this.ri].y - y) < REACH * 2) this.ri++;
        if (this.ri >= this.route.length) { this.state = WALKER.DONE; return { x: null, y: null, speed: 0, face: null }; }
        if (this.t <= 0) { this.t = between(this.r, [1.2, 2.6]); this.bark = 'scream'; }
        const p = this.route[this.ri];
        return { x: p.x, y: p.y, speed: this.run, face: null };
      }
      case WALKER.COWER:
        if (this.t <= 0) { this.state = WALKER.FLEE; this.pose = null; this.route = null; }
        return { x: null, y: null, speed: 0, face: this.danger ? Math.atan2(this.danger.y - y, this.danger.x - x) : null };
      default:
        return { x: null, y: null, speed: 0, face: null };
    }
  }

  walk(dt, x, y) {
    const p = this.partner;
    if (p && p.state === WALKER.STOP) {
      // the couple stops together, facing each other
      this.state = WALKER.STOP;
      this.activity = 'chat';
      return { x: null, y: null, speed: 0, face: this.face };
    }
    let tg = this.path[this.i];
    while (tg && Math.hypot(tg.x - x, tg.y - y) < REACH) tg = this.path[++this.i];
    if (!tg) { this.state = WALKER.DONE; return { x: null, y: null, speed: 0, face: null }; }
    this.walked += this.speed * dt;
    if (this.stopAt >= 0 && this.walked >= this.stopAt) {
      this.stopAt = -1;
      this.state = WALKER.STOP;
      this.activity = ACTIVITIES[Math.floor(this.r() * ACTIVITIES.length)];
      this.t = between(this.r, A.stop);
      const a = Math.atan2(tg.y - y, tg.x - x);
      // a shop window is to one side of the sidewalk; the others turn a little toward the street
      this.face = this.activity === 'window' ? a - Math.PI / 2 : a + (this.r() - 0.5) * 1.6;
      return { x: null, y: null, speed: 0, face: this.face };
    }
    return { x: tg.x, y: tg.y, speed: this.speed, face: null };
  }
}

export function pathLength(path) {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return n;
}

// point at distance d along a path, with the index of the next waypoint
export function pointAlong(path, d) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= l || i === path.length - 1) {
      const k = l > 0 ? Math.min(1, d / l) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, i };
    }
    d -= l;
  }
  return { x: path[0].x, y: path[0].y, i: 1 };
}

// Shortest way off the map from (sx, sy) that keeps away from `danger` {x, y}: Dijkstra on the tile grid
// (8-neighbour, no corner cutting) to any open border cell, where cells near the danger cost more and every step
// taken in the danger's direction costs extra (nobody runs past the gunman); the route ends `margin` px outside.
// map: TileMap-like { w, h, blocked, walkLine? }. Returns [{x, y}] or null.
export function escapeRoute(map, sx, sy, danger, { fear = 7 * TILE, weight = 10, closing = 10, margin = 2 * TILE } = {}) {
  const W = map.w, H = map.h, T = TILE;
  const out = (cx, cy) => {
    // push the border cell centre straight out of the nearest side
    const px = (cx + 0.5) * T, py = (cy + 0.5) * T;
    const dl = cx, dr = W - 1 - cx, dt = cy, db = H - 1 - cy, m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: -margin, y: py };
    if (m === dr) return { x: W * T + margin, y: py };
    if (m === dt) return { x: px, y: -margin };
    return { x: px, y: H * T + margin };
  };
  // already off the map: keep going the same way
  if (sx < 0 || sy < 0 || sx >= W * T || sy >= H * T) {
    const cx = Math.max(0, Math.min(W - 1, Math.floor(sx / T))), cy = Math.max(0, Math.min(H - 1, Math.floor(sy / T)));
    return [out(cx, cy)];
  }
  const start = Math.floor(sy / T) * W + Math.floor(sx / T);
  const blocked = map.blocked;
  const fearAt = (i) => {
    if (!danger) return 0;
    const d = Math.hypot(((i % W) + 0.5) * T - danger.x, (((i / W) | 0) + 0.5) * T - danger.y);
    return d < fear ? weight * (1 - d / fear) ** 2 : 0;
  };
  // unit vector from the start toward the danger: steps along it are penalised
  const ul = danger ? Math.hypot(danger.x - sx, danger.y - sy) || 1 : 1;
  const ux = danger ? (danger.x - sx) / ul : 0, uy = danger ? (danger.y - sy) / ul : 0;
  const g = new Float64Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(start, 0);
  if (blocked[start]) {
    // inside furniture (a patron on his seat, boxed in by a table): he slides off it, so the search also opens
    // from the free cells up to two steps away, never through a wall
    let ring = [start];
    for (let step = 1; step <= 2; step++) {
      const next = [];
      for (const c of ring) {
        for (const d of [-W, W, -1, 1]) {
          const n = c + d;
          if (n < 0 || n >= W * H || (d * d === 1 && ((n / W) | 0) !== ((c / W) | 0)) || map.solid?.[n] || g[n] < Infinity) continue;
          g[n] = step; came[n] = start;
          if (blocked[n]) next.push(n); else heap.push(n, step);
        }
      }
      ring = next;
    }
  }
  let best = -1, bestScore = Infinity;
  while (heap.size) {
    const [cur, cost] = heap.pop();
    if (cost > g[cur]) continue;
    if (cost >= bestScore) break;
    const cx = cur % W, cy = (cur / W) | 0;
    if ((cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) && (!blocked[cur] || cur === start)) {
      // exits close to the danger are worth less
      const score = cost + fearAt(cur) * 2;
      if (score < bestScore) { bestScore = score; best = cur; }
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (blocked[ni]) continue;
        if (dx && dy && (blocked[cy * W + nx] || blocked[ny * W + cx])) continue;
        const c = cost + (dx && dy ? Math.SQRT2 : 1) * (1 + fearAt(ni)) + closing * Math.max(0, dx * ux + dy * uy);
        if (c < g[ni]) { g[ni] = c; came[ni] = cur; heap.push(ni, c); }
      }
    }
  }
  if (best < 0) return null;
  const cells = [];
  for (let c = best; c !== start && c >= 0; c = came[c]) cells.push(c);
  cells.reverse();
  let pts = cells.map((c) => ({ x: ((c % W) + 0.5) * T, y: (((c / W) | 0) + 0.5) * T }));
  if (map.walkLine) pts = pull(map, sx, sy, pts);
  pts.push(out(best % W, (best / W) | 0));
  return pts;
}

// string pulling: skip waypoints while a straight walk is clear
function pull(map, sx, sy, pts) {
  const res = [];
  let ax = sx, ay = sy, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !map.walkLine(ax, ay, pts[j].x, pts[j].y, 7)) j--;
    res.push(pts[j]);
    ax = pts[j].x; ay = pts[j].y;
    i = j + 1;
  }
  return res;
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v, p) {
    const a = this.a;
    a.push([v, p]);
    let i = a.length - 1;
    while (i > 0) {
      const q = (i - 1) >> 1;
      if (a[q][1] <= p) break;
      [a[i], a[q]] = [a[q], a[i]];
      i = q;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][1] < a[m][1]) m = l;
        if (r < a.length && a[r][1] < a[m][1]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
