import { TILE } from './Config.js';

// A* on the tile grid (8-neighbour, no corner cutting) + string pulling.
export function findPath(map, sx, sy, tx, ty, maxNodes = 4000) {
  const W = map.w, H = map.h;
  const start = cellOf(map, sx, sy), goal = cellOf(map, tx, ty);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [{ x: tx, y: ty }];
  const blocked = map.blocked;
  const g = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const heap = new Heap();
  const gx = goal % W, gy = (goal / W) | 0;
  const h = (i) => {
    const dx = Math.abs((i % W) - gx), dy = Math.abs(((i / W) | 0) - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  g[start] = 0;
  heap.push(start, h(start));
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (blocked[ni] && ni !== goal) continue;
        if (dx && dy && (blocked[cy * W + nx] || blocked[ny * W + cx])) continue;
        const cost = g[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (cost < g[ni]) {
          g[ni] = cost;
          came[ni] = cur;
          heap.push(ni, cost + h(ni));
        }
      }
    }
  }
  if (came[goal] < 0) return null;
  const cells = [];
  for (let c = goal; c !== start && c >= 0; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: (c % W + 0.5) * TILE, y: (((c / W) | 0) + 0.5) * TILE }));
  pts[pts.length - 1] = { x: tx, y: ty };
  return smooth(map, sx, sy, pts);
}

function cellOf(map, x, y) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return -1;
  return cy * map.w + cx;
}

// drop intermediate points when a straight walkable line exists
function smooth(map, sx, sy, pts) {
  const out = [];
  let ax = sx, ay = sy, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !map.walkLine(ax, ay, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    ax = pts[j].x; ay = pts[j].y;
    i = j + 1;
  }
  return out;
}

class Heap {
  constructor() { this.items = []; this.prios = []; }
  get size() { return this.items.length; }
  push(item, prio) {
    const it = this.items, pr = this.prios;
    let i = it.length;
    it.push(item); pr.push(prio);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (pr[p] <= prio) break;
      it[i] = it[p]; pr[i] = pr[p];
      i = p;
    }
    it[i] = item; pr[i] = prio;
  }
  pop() {
    const it = this.items, pr = this.prios;
    const top = it[0];
    const last = it.pop(), lp = pr.pop();
    if (it.length) {
      let i = 0;
      const n = it.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mp = lp;
        if (l < n && pr[l] < mp) { m = l; mp = pr[l]; }
        if (r < n && pr[r] < mp) { m = r; mp = pr[r]; }
        if (m === i) break;
        it[i] = it[m]; pr[i] = pr[m];
        i = m;
      }
      it[i] = last; pr[i] = lp;
    }
    return top;
  }
}
