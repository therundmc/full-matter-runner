// Passers-by brains, DOM-free and unit tested: a stroll along a path (with an optional stop: cigarette, shop
// window, phone, a chat for couples), then panic (hands up / duck for a beat) and, by temperament, a sprint off
// the map along a route that keeps away from the danger (escapeRoute; a few trip on the way), a corner to curl
// up in out of sight (hideRoute), or a long freeze on the spot, hands up. Short of a fright, a commotion (a guard
// telling somebody off, a smash) gets a look (notice), and a fist fight close by sends him off like a weapon would.
// Units: px, px/s, s.
import { TILE, AMBIENT as A } from '../Config.js';
import { between } from '../systems/Traffic.js';

export const WALKER = { WALK: 'walk', STOP: 'stop', PANIC: 'panic', FLEE: 'flee', HIDE: 'hide', COWER: 'cower', DONE: 'done' };
const BOLTS = ['armed', 'weapon', 'fight', 'gunshot', 'explosion']; // what sets a frozen one running, from close
const ACTIVITIES = ['smoke', 'window', 'phone'];
const REACH = 6; // px: a waypoint counts as reached

export class Walker {
  // path: [{x, y}] (first point = spawn); opts: { r, speed, run, partner, post, temper }
  // post { activity, face }: a patron who stays at his spot, busy, until something scares him off
  // temper: 'run' | 'hide' | 'stay', how he panics (drawn at his first fright when not given)
  constructor(path, { r, speed, run, partner = null, post = null, temper = null }) {
    this.r = r;
    this.path = path;
    this.i = 1;
    this.speed = speed;
    this.run = run;
    this.partner = partner;   // the leader of a couple: the follower stops and chats when he does
    this.posted = !!post;
    this.rush = 0;             // s he still hurries on (see hurry)
    this.state = WALKER.WALK;
    this.t = 0;
    this.activity = null;
    this.pose = null;          // hands | duck while panicking, ball once curled up
    this.temper = temper;
    this.tripIn = null;        // s of running left before he trips
    this.fall = false;         // set when he trips (read and cleared by the Civilian)
    this.air = 0;              // s to his next breath
    this.danger = null;
    this.route = null;
    this.bark = null;          // set when he has something to voice: scream, beg, pant, sob... (read and cleared by Ambient)
    this.look = null;          // something going on he looks at { x, y } for lookT s (see notice)
    this.lookT = 0;
    this.stuck = 0;            // times his run was blocked on the way (see blocked)
    // one stop somewhere along the way, at a distance from the start
    this.walked = 0;
    this.stopAt = !partner && !post && r() < A.stopChance ? between(r, [0.25, 0.75]) * pathLength(path) : -1;
    if (post) { this.state = WALKER.STOP; this.activity = post.activity; this.face = post.face; this.t = Infinity; }
  }

  get panicked() { return [WALKER.PANIC, WALKER.FLEE, WALKER.HIDE, WALKER.COWER].includes(this.state); }
  get frozen() { return this.state === WALKER.PANIC && this.temper === 'stay'; }

  // something going on at (x, y) worth a look for t s (a guard telling somebody off, a smash, a door banged): he looks
  // at it; a stroller slows down to
  notice(x, y, t) {
    if (this.panicked || this.state === WALKER.DONE) return;
    this.look = { x, y };
    this.lookT = Math.max(this.lookT, t);
  }

  // his run blocked on the way (Civilian: pushed in vain): a new way out is found, round it (the caller notes the spot)
  blocked() {
    this.stuck++;
    if (this.state === WALKER.FLEE) this.route = null;
  }

  // Something scary at (x, y). kind: gunshot | explosion | kill | corpse | armed (a gun) | weapon (a bat, a knife) |
  // fight (a man floored close by) | scream | hit.
  // Returns true when this makes him panic (first time, or a much closer danger while fleeing).
  alarm(x, y, kind, from) {
    if (this.state === WALKER.DONE) return false;
    if (this.panicked) {
      const d = from ? Math.hypot(x - from.x, y - from.y) : 0;
      if (this.state !== WALKER.FLEE) {
        // a blow, or a weapon right on top of the one frozen there, sets him running
        if (kind === 'hit' || (this.frozen && from && BOLTS.includes(kind) && d < A.panic.bolt * TILE)) this.bolt(x, y);
        return false;
      }
      if (!from) return false;
      if (!this.danger || d > Math.hypot(this.danger.x - from.x, this.danger.y - from.y) * 0.5) return false;
      this.danger = { x, y };
      this.route = null; // re-route away from the new threat
      return false;
    }
    this.state = WALKER.PANIC;
    this.danger = { x, y };
    this.pose = kind === 'armed' || (kind === 'gunshot' && this.r() < 0.4) ? 'hands' : 'duck';
    this.t = kind === 'scream' ? between(this.r, A.panic.freeze) * 0.5 : between(this.r, A.panic.freeze);
    this.bark = kind === 'armed' ? 'beg' : kind === 'weapon' || kind === 'fight' ? 'back' : 'scream';
    this.look = null;
    if (!this.temper) {
      const k = this.r();
      this.temper = k < A.panic.hide ? 'hide' : k < A.panic.hide + A.panic.stay ? 'stay' : 'run';
    }
    if (this.r() < A.panic.trip) this.tripIn = between(this.r, A.panic.tripAfter);
    if (this.temper === 'stay' && kind !== 'hit') { this.pose = 'hands'; this.t = between(this.r, A.panic.stayFor); }
    return true;
  }

  // a nuisance, not a fright (an alarm ringing): a passer-by cuts his stop short and walks on faster for `sec`
  hurry(sec) {
    if (!this.posted && !this.panicked) this.rush = Math.max(this.rush, sec);
  }

  // off he goes, away from (x, y), whatever he was at
  bolt(x, y) {
    this.danger = { x, y };
    this.temper = 'run';
    this.state = WALKER.FLEE;
    this.pose = null;
    this.route = null;
    this.t = 0;
  }

  // sense: { escape(x, y, danger) -> [{x, y}] | null, hide(x, y, danger) -> [{x, y}] | null } (only called when
  // a route is needed; hide is optional)
  // returns the intent { x, y (target or null), speed (px/s), face (angle or null) }
  update(dt, x, y, sense) {
    this.t -= dt;
    this.rush -= dt;
    if ((this.lookT -= dt) <= 0) this.look = null;
    const eyes = this.look && Math.atan2(this.look.y - y, this.look.x - x);
    switch (this.state) {
      case WALKER.WALK: {
        const it = this.walk(dt, x, y);
        if (eyes !== null && it.x !== null) { it.speed *= A.look.slow; it.look = eyes; }
        else if (eyes !== null) it.face = eyes;
        return it;
      }
      case WALKER.STOP: {
        const p = this.partner;
        const done = p ? p.state !== WALKER.STOP : this.t <= 0 || this.rush > 0;
        if (done) { this.state = WALKER.WALK; this.activity = null; return this.walk(dt, x, y); }
        return { x: null, y: null, speed: 0, face: eyes ?? this.face };
      }
      case WALKER.PANIC:
        if (this.t > 0) return { x: null, y: null, speed: 0, face: Math.atan2(this.danger.y - y, this.danger.x - x) };
        this.pose = null;
        this.route = this.temper === 'hide' ? sense.hide?.(x, y, this.danger) ?? null : null;
        this.ri = 0;
        this.state = this.route ? WALKER.HIDE : WALKER.FLEE;
        // a corner he cannot reach in time: he drops where he is; a runner's next cry comes one wait after his fright's
        this.t = this.route ? 5 : between(this.r, A.panic.cry);
        return this.update(0, x, y, sense);
      case WALKER.HIDE: {
        while (this.ri < this.route.length && Math.hypot(this.route[this.ri].x - x, this.route[this.ri].y - y) < REACH * 1.5) this.ri++;
        if (this.ri >= this.route.length || this.t <= 0) {
          this.state = WALKER.COWER;
          this.pose = 'ball';
          this.t = between(this.r, A.panic.hideFor);
          this.air = 0.6;
          return { x: null, y: null, speed: 0, face: null };
        }
        const p = this.route[this.ri];
        return { x: p.x, y: p.y, speed: this.run, face: null };
      }
      case WALKER.FLEE: {
        if (!this.route) {
          this.route = sense.escape(x, y, this.danger, this.stuck > 0);
          this.ri = 0;
          if (!this.route) { this.state = WALKER.COWER; this.pose = 'duck'; this.t = between(this.r, [6, 10]); return this.update(0, x, y, sense); }
        }
        while (this.ri < this.route.length && Math.hypot(this.route[this.ri].x - x, this.route[this.ri].y - y) < REACH * 2) this.ri++;
        if (this.ri >= this.route.length) { this.state = WALKER.DONE; return { x: null, y: null, speed: 0, face: null }; }
        if (this.tripIn !== null && (this.tripIn -= dt) <= 0) { this.tripIn = null; this.fall = true; }
        // a scream or a whine now and then, his breath in between
        if (this.t <= 0) { this.t = between(this.r, A.panic.cry); this.bark = this.r() < A.panic.scream ? 'scream' : 'whine'; }
        else if ((this.air -= dt) <= 0) { this.air = between(this.r, [0.5, 0.85]); this.bark = 'pant'; }
        const p = this.route[this.ri];
        return { x: p.x, y: p.y, speed: this.run, face: null };
      }
      case WALKER.COWER:
        if (this.t <= 0) { this.bolt(this.danger.x, this.danger.y); return { x: null, y: null, speed: 0, face: null }; }
        if (this.pose === 'ball') {
          // curled up facing his corner, sobbing under his breath
          if ((this.air -= dt) <= 0) { this.air = between(this.r, [1.6, 3.6]); this.bark = 'sob'; }
          return { x: null, y: null, speed: 0, face: null };
        }
        return { x: null, y: null, speed: 0, face: Math.atan2(this.danger.y - y, this.danger.x - x) };
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
    const speed = this.rush > 0 ? this.speed * A.hurry : this.speed;
    this.walked += speed * dt;
    if (this.stopAt >= 0 && this.walked >= this.stopAt && !(this.rush > 0)) {
      this.stopAt = -1;
      this.state = WALKER.STOP;
      this.activity = ACTIVITIES[Math.floor(this.r() * ACTIVITIES.length)];
      this.t = between(this.r, A.stop);
      const a = Math.atan2(tg.y - y, tg.x - x);
      // a shop window is to one side of the sidewalk; the others turn a little toward the street
      this.face = this.activity === 'window' ? a - Math.PI / 2 : a + (this.r() - 0.5) * 1.6;
      return { x: null, y: null, speed: 0, face: this.face };
    }
    return { x: tg.x, y: tg.y, speed, face: null };
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
// cost(i): optional extra cost of cell i (spots found blocked on the way).
export function escapeRoute(map, sx, sy, danger, { fear = 7 * TILE, weight = 10, closing = 10, margin = 2 * TILE, cost = null } = {}) {
  const W = map.w, H = map.h, T = TILE, extra = cost;
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
  if (blocked[start]) slideOff(map, start, (n, step) => { g[n] = step; came[n] = start; heap.push(n, step); });
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
        const c = cost + (dx && dy ? Math.SQRT2 : 1) * (1 + fearAt(ni) + (extra ? extra(ni) : 0)) + closing * Math.max(0, dx * ux + dy * uy);
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

// A start cell inside furniture (a patron on his seat, boxed in by a table): he slides off it, so a search also
// opens from the free cells up to two steps away, never through a wall. Calls visit(cell, steps) for each.
function slideOff(map, start, visit) {
  const W = map.w, seen = new Set([start]);
  let ring = [start];
  for (let step = 1; step <= 2; step++) {
    const next = [];
    for (const c of ring) {
      for (const d of [-W, W, -1, 1]) {
        const n = c + d;
        if (n < 0 || n >= W * map.h || (d * d === 1 && ((n / W) | 0) !== ((c / W) | 0)) || map.solid?.[n] || seen.has(n)) continue;
        seen.add(n);
        if (map.blocked[n]) next.push(n); else visit(n, step);
      }
    }
    ring = next;
  }
}

// A corner to curl up in near (sx, sy): breadth-first over the free cells within `reach` steps, to one that has
// walls or furniture around it and is hidden from the danger, either out of its sight (seen(x, y) is false) or
// right behind something; the closest, most tucked-in one wins. `taken` (a Set of cells, filled here) keeps two
// people out of the same corner. Returns [{x, y}] or null.
export function hideRoute(map, sx, sy, danger, seen, taken = new Set(), reach = A.panic.nook) {
  const W = map.w, H = map.h, T = TILE, blocked = map.blocked;
  if (!danger || sx < 0 || sy < 0 || sx >= W * T || sy >= H * T) return null;
  const start = Math.floor(sy / T) * W + Math.floor(sx / T);
  const came = new Map([[start, -1]]);
  let ring = [start];
  if (blocked[start]) { ring = []; slideOff(map, start, (n) => { came.set(n, start); ring.push(n); }); }
  const wall = (x, y) => x >= 0 && y >= 0 && x < W && y < H && blocked[y * W + x];
  let best = -1, bestScore = Infinity;
  for (let depth = 1; depth <= reach && ring.length; depth++) {
    const next = [];
    for (const c of ring) {
      const cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy, ni = ny * W + nx;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || blocked[ni] || came.has(ni)) continue;
          if (dx && dy && (blocked[cy * W + nx] || blocked[ny * W + cx])) continue;
          came.set(ni, c);
          next.push(ni);
          let walls = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (wall(nx + i, ny + j)) walls++;
          const px = (nx + 0.5) * T, py = (ny + 0.5) * T, dl = Math.hypot(danger.x - px, danger.y - py);
          if (dl < 2 * T || taken.has(ni)) continue;
          const score = depth - walls * 1.5 - Math.min(8, dl / T) * 0.5;
          if (score >= bestScore) continue;
          const cover = wall(nx + Math.round((danger.x - px) / dl), ny + Math.round((danger.y - py) / dl));
          if (cover || (walls >= 3 && !seen(px, py))) { bestScore = score; best = ni; }
        }
      }
    }
    ring = next;
  }
  if (best < 0) return null;
  taken.add(best);
  const cells = [];
  for (let c = best; c !== start && c >= 0; c = came.get(c)) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: ((c % W) + 0.5) * T, y: (((c / W) | 0) + 0.5) * T }));
  return map.walkLine ? pull(map, sx, sy, pts) : pts;
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
