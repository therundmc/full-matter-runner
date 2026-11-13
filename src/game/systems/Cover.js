// Vaulting geometry: a broken window or a low obstacle (def.vault) to get over, with a free landing spot on the far side.
import { TILE, CAT } from '../Config.js';
import { segPoly } from '../../engine/physics/Raycast.js';

const { Query } = Matter;

const VAULT_REACH = 14;
const MAX_VAULT_DEPTH = 46;
const BLOCKERS = CAT.WALL | CAT.PROP | CAT.GLASS | CAT.DOOR | CAT.CHAR;

function closestOnPolygon(px, py, verts) {
  let best = null;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / (ex * ex + ey * ey || 1)));
    const x = a.x + ex * t, y = a.y + ey * t;
    const d = Math.hypot(px - x, py - y);
    if (!best || d < best.d) best = { x, y, d };
  }
  return best;
}

// is a character-sized spot free of walls, furniture, glass and people?
export function spotIsFree(world, x, y, r, ignore) {
  const m = world.map;
  for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    if (m.solidAt(x + ox, y + oy)) return false;
  }
  const near = world.physics.bodies().filter((b) => (b.collisionFilter.category & BLOCKERS) && b !== ignore?.body
    && b.bounds.min.x < x + r && b.bounds.max.x > x - r && b.bounds.min.y < y + r && b.bounds.max.y > y - r);
  for (const [ox, oy] of [[0, 0], [r * 0.8, 0], [-r * 0.8, 0], [0, r * 0.8], [0, -r * 0.8]]) {
    if (Query.point(near, { x: x + ox, y: y + oy }).length) return false;
  }
  return true;
}

// what can be vaulted in direction a: { kind: 'window' | 'prop', over, to: {x, y} } or null.
// Furniture is only vaulted when running into it (standing still next to it means taking cover).
export function findVault(world, ch, a, moving = true) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const r = ch.radius;
  for (const w of world.windows) {
    if (w.intact) continue;
    const nx = w.vertical ? 1 : 0, ny = w.vertical ? 0 : 1;
    const rx = ch.x - w.x, ry = ch.y - w.y;
    const side = rx * nx + ry * ny, along = rx * ny - ry * nx;
    if (Math.abs(side) > r + VAULT_REACH || Math.abs(along) > TILE / 2) continue;
    if ((dx * nx + dy * ny) * -Math.sign(side) < 0.35) continue;
    const s = -Math.sign(side) || 1;
    const k = Math.max(-8, Math.min(8, along));
    const to = { x: w.x + ny * k + nx * s * (r + 7), y: w.y - nx * k + ny * s * (r + 7) };
    // hands on the sill, either side of where we go through
    const ledge = { x: w.x + ny * k, y: w.y - nx * k, tx: ny, ty: -nx };
    if (spotIsFree(world, to.x, to.y, r, ch)) return { kind: 'window', over: w, to, ledge };
  }
  for (const p of world.props) {
    if (!moving || p.dead || !p.def.vault) continue;
    if (Math.abs(p.x - ch.x) > 110 || Math.abs(p.y - ch.y) > 110) continue;
    const c = closestOnPolygon(ch.x, ch.y, p.body.vertices);
    if (c.d > r + VAULT_REACH) continue;
    if ((dx * (c.x - ch.x) + dy * (c.y - ch.y)) / (c.d || 1) < 0.5) continue;
    // cast back from beyond the object to find where we come out
    const far = { x: c.x + dx * 120, y: c.y + dy * 120 };
    const exit = segPoly(far.x, far.y, c.x, c.y, p.body.vertices);
    if (!exit) continue;
    const ex = far.x + (c.x - far.x) * exit.t, ey = far.y + (c.y - far.y) * exit.t;
    // vehicles: across the hood only (never over the roof or end to end)
    if (p.isVehicle ? !p.canSlide(c.x, c.y, ex, ey) : Math.hypot(ex - c.x, ey - c.y) > MAX_VAULT_DEPTH) continue;
    const to = { x: ex + dx * (r + 3), y: ey + dy * (r + 3) };
    const ledge = { x: c.x, y: c.y, tx: -dy, ty: dx };
    if (spotIsFree(world, to.x, to.y, r, ch)) return { kind: 'prop', over: p, to, ledge };
  }
  return null;
}
