// Geometry for the two traversal mechanics:
//  - cover: the nearest surface a character can crouch behind (walls, furniture with def.cover = 'low' | 'high')
//  - vault: a broken window or a low obstacle (def.vault) to jump over, with a free landing spot on the far side
import { TILE, CAT } from '../Config.js';
import { segPoly } from '../../engine/physics/Raycast.js';
import { WALLS } from '../world/TileMap.js';

const { Query } = Matter;

const COVER_REACH = 20;   // px from the body edge to the surface
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

// nearest cover surface: { x, y, nx, ny, low, target, dist } (n points from the surface toward the character)
export function findCover(world, ch, onlyTarget) {
  const x = ch.x, y = ch.y, reach = ch.radius + COVER_REACH;
  let best = null;
  const consider = (c) => { if (c.d < reach && (!best || c.d < best.d)) best = c; };
  for (const p of world.props) {
    if (p.dead || !p.def.cover) continue;
    if (onlyTarget !== undefined && p !== onlyTarget) continue;
    if (Math.abs(p.x - x) > 90 || Math.abs(p.y - y) > 90) continue;
    const c = closestOnPolygon(x, y, p.body.vertices);
    if (c.d < 0.5) continue;
    consider({ x: c.x, y: c.y, d: c.d, nx: (x - c.x) / c.d, ny: (y - c.y) / c.d, low: p.def.cover === 'low', target: p });
  }
  if (onlyTarget === undefined || onlyTarget === null) {
    const m = world.map, cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let ty = cy - 1; ty <= cy + 1; ty++) {
      for (let tx = cx - 1; tx <= cx + 1; tx++) {
        if (!WALLS[m.at(tx, ty)]) continue;
        const qx = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE)), qy = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
        const d = Math.hypot(x - qx, y - qy);
        if (d < 0.5) continue;
        consider({ x: qx, y: qy, d, nx: (x - qx) / d, ny: (y - qy) / d, low: false, target: null });
      }
    }
  }
  if (best) { best.dist = best.d; delete best.d; }
  return best;
}

// is a character-sized spot free of walls, furniture, glass and people?
export function spotIsFree(world, x, y, r, ignore) {
  const m = world.map;
  for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    if (m.solidAt(x + ox, y + oy)) return false;
  }
  const near = world.physics.bodies().filter((b) => (b.collisionFilter.category & BLOCKERS) && b !== ignore?.body
    && Math.abs(b.position.x - x) < 80 && Math.abs(b.position.y - y) < 80);
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
    if (spotIsFree(world, to.x, to.y, r, ch)) return { kind: 'window', over: w, to };
  }
  for (const p of world.props) {
    if (!moving || p.dead || !p.def.vault) continue;
    if (Math.abs(p.x - ch.x) > 90 || Math.abs(p.y - ch.y) > 90) continue;
    const c = closestOnPolygon(ch.x, ch.y, p.body.vertices);
    if (c.d > r + VAULT_REACH) continue;
    if ((dx * (c.x - ch.x) + dy * (c.y - ch.y)) / (c.d || 1) < 0.5) continue;
    // cast back from beyond the object to find where we come out
    const far = { x: c.x + dx * 120, y: c.y + dy * 120 };
    const exit = segPoly(far.x, far.y, c.x, c.y, p.body.vertices);
    if (!exit) continue;
    const ex = far.x + (c.x - far.x) * exit.t, ey = far.y + (c.y - far.y) * exit.t;
    if (Math.hypot(ex - c.x, ey - c.y) > MAX_VAULT_DEPTH) continue;
    const to = { x: ex + dx * (r + 3), y: ey + dy * (r + 3) };
    if (spotIsFree(world, to.x, to.y, r, ch)) return { kind: 'prop', over: p, to };
  }
  return null;
}
