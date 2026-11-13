// Hit-scan queries: what a bullet segment hits first, and who can see whom.
import { segPoly, segCircle, segSeg } from '../../engine/physics/Raycast.js';

// Nearest thing hit by the segment (x0,y0)->(x1,y1).
// Returns { t, kind, x, y, target?, part?, nx?, ny?, cx?, cy? } or null.
// kind: wall | char | prop | door | glass | corpse | item | debris
export function traceBullet(world, x0, y0, x1, y1, team, ignore) {
  let best = null;
  const w = world.map.raycast(x0, y0, x1, y1);
  if (w) best = { t: w.t, kind: 'wall', nx: w.nx, ny: w.ny, cx: w.cx, cy: w.cy };
  const bt = () => (best ? best.t : 1);
  for (const c of world.chars) {
    if (!c.alive || c.team === team || ignore.has(c)) continue;
    const t = segCircle(x0, y0, x1, y1, c.x, c.y, c.radius + 1);
    if (t !== null && t < bt()) best = { t, kind: 'char', target: c };
  }
  const minX = Math.min(x0, x1) - 1, maxX = Math.max(x0, x1) + 1, minY = Math.min(y0, y1) - 1, maxY = Math.max(y0, y1) + 1;
  const hitBody = (body) => {
    const bd = body.bounds;
    if (bd.max.x < minX || bd.min.x > maxX || bd.max.y < minY || bd.min.y > maxY) return null;
    const r = segPoly(x0, y0, x1, y1, body.vertices);
    return r && r.t < bt() ? r : null;
  };
  const test = (list, kind, filter) => {
    for (const o of list) {
      if (!filter(o) || ignore.has(o)) continue;
      const r = hitBody(o.body);
      if (r) best = { t: r.t, kind, target: o, nx: r.nx, ny: r.ny };
    }
  };
  test(world.props, 'prop', (p) => !p.dead);
  test(world.doors, 'door', () => true);
  test(world.windows, 'glass', (g) => g.intact);
  // dead bodies: every ragdoll part can be hit
  for (const c of world.corpses) {
    if (c.dead) continue;
    for (const part of c.parts || [{ body: c.body }]) {
      const r = hitBody(part.body);
      if (r) best = { t: r.t, kind: 'corpse', target: c, part: c.parts ? part : null };
    }
  }
  test(world.items, 'item', (it) => !it.dead);
  test(world.debris, 'debris', (d) => !d.dead && d.size > 4);
  if (best) { best.x = x0 + (x1 - x0) * best.t; best.y = y0 + (y1 - y0) * best.t; }
  return best;
}

// walls and closed doors block sight
export function lineOfSight(world, x0, y0, x1, y1) {
  if (world.map.raycast(x0, y0, x1, y1)) return false;
  for (const d of world.doors) {
    const t = d.tip();
    if (segSeg(x0, y0, x1, y1, d.hx, d.hy, t.x, t.y) !== null) return false;
  }
  return true;
}
