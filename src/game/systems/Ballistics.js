// Hit-scan queries: what a bullet segment hits first, and who can see whom.
import { segPoly, segCircle, segSeg } from '../../engine/physics/Raycast.js';

const LAMP_LOOK = 96; // px past a step's end a lamp hung over the table it struck is looked for

// Nearest thing hit by the segment (x0,y0)->(x1,y1).
// Returns { t, kind, x, y, target?, part?, nx?, ny?, cx?, cy? } or null.
// kind: wall | char | prop | door | glass | corpse | item | debris
// Rounds fly over the dead lying on the floor; only `floor`, the corpse the shooter aimed down at, can be hit.
export function traceBullet(world, x0, y0, x1, y1, team, ignore, floor = null) {
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
  // a lamp hung over a table (def `drops`: the pool table's) lies wholly over it, so the table's edge would always take
  // the round first: one that strikes the table where the lamp hangs over it flies over into the lamp (systems/LampDrop.js).
  // The lamp may lie past the end of this step's segment (k: how far it is looked along, in segments)
  if (best?.kind === 'prop' && !best.target.def.hung) {
    const k = 1 + LAMP_LOOK / Math.max(1, Math.hypot(x1 - x0, y1 - y0)), ex = x0 + (x1 - x0) * k, ey = y0 + (y1 - y0) * k;
    for (const q of world.props) {
      if (q.dead || !q.def.drops || ignore.has(q)) continue;
      const r = segPoly(x0, y0, ex, ey, q.body.vertices);
      const at = r && { x: x0 + (ex - x0) * r.t, y: y0 + (ey - y0) * r.t };
      if (at && Matter.Vertices.contains(best.target.body.vertices, at)) best = { t: r.t * k, kind: 'prop', target: q, nx: r.nx, ny: r.ny };
    }
  }
  test(world.doors, 'door', () => true);
  test(world.windows, 'glass', (g) => g.intact);
  // the body shot at on purpose: every ragdoll part can be hit
  if (floor && !floor.dead && !ignore.has(floor)) {
    for (const part of floor.parts || [{ body: floor.body }]) {
      const r = hitBody(part.body);
      if (r) best = { t: r.t, kind: 'corpse', target: floor, part: floor.parts ? part : null };
    }
  }
  test(world.items, 'item', (it) => !it.dead);
  test(world.debris, 'debris', (d) => !d.dead && d.size > 4);
  if (best) { best.x = x0 + (x1 - x0) * best.t; best.y = y0 + (y1 - y0) * best.t; }
  return best;
}

// can `viewer` see character `ch`? (walls and closed doors block)
export function canSeeCharacter(world, viewer, ch) {
  return lineOfSight(world, viewer.x, viewer.y, ch.x, ch.y);
}

// walls and closed doors block sight
export function lineOfSight(world, x0, y0, x1, y1) {
  if (world.map.raycast(x0, y0, x1, y1)) return false;
  for (const d of world.doors) {
    const s = d.span();
    if (segSeg(x0, y0, x1, y1, s.x0, s.y0, s.x1, s.y1) !== null) return false;
  }
  return true;
}

// How much of a blast travels from (x0,y0) to (x1,y1): 0 = fully blocked, 1 = open air.
// Walls block everything, closed doors and heavy furniture soak most of it, intact glass a little.
// `target` (an entity or { cx, cy } wall tile) and `origin` (what blew up) never count as obstacles.
export function occlusion(world, x0, y0, x1, y1, target = null, origin = null) {
  const wall = world.map.raycast(x0, y0, x1, y1);
  if (wall && !(target && wall.cx === target.cx && wall.cy === target.cy)) return 0;
  let f = 1;
  for (const d of world.doors) {
    if (d === target) continue;
    const s = d.span();
    if (segSeg(x0, y0, x1, y1, s.x0, s.y0, s.x1, s.y1) !== null) f *= 0.3;
  }
  for (const p of world.props) {
    if (p === target || p === origin || p.dead || p.def.hung || !(p.isVehicle || p.def.static || p.def.blocksPath)) continue;
    if (segPoly(x0, y0, x1, y1, p.body.vertices)) f *= 0.4;
  }
  for (const g of world.windows) {
    if (g === target || !g.intact) continue;
    if (segPoly(x0, y0, x1, y1, g.body.vertices)) f *= 0.7;
  }
  return f;
}
