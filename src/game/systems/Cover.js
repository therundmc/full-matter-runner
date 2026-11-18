// Vaulting geometry: a broken window or a low obstacle (def.vault) to get over, with a free landing spot on the far side,
// and the room there is to roll on after a drop.
import { TILE, CAT } from '../Config.js';
import { segPoly } from '../../engine/physics/Raycast.js';
import { standing } from './Kick.js';

const { Query } = Matter;

const VAULT_REACH = 18;
const FACING = 0.3; // min cosine between the direction and the way to the obstacle
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

// is a character-sized spot free of walls, furniture, glass and people? (but ignore, and the bodies pass(b) lets by)
function spotIsFree(world, x, y, r, ignore, pass = null) {
  const m = world.map;
  for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    if (m.solidAt(x + ox, y + oy)) return false;
  }
  const near = world.physics.bodies().filter((b) => (b.collisionFilter.category & BLOCKERS) && b !== ignore?.body && !pass?.(b)
    && b.bounds.min.x < x + r && b.bounds.max.x > x - r && b.bounds.min.y < y + r && b.bounds.max.y > y - r);
  for (const [ox, oy] of [[0, 0], [r * 0.8, 0], [-r * 0.8, 0], [0, r * 0.8], [0, -r * 0.8]]) {
    if (Query.point(near, { x: x + ox, y: y + oy }).length) return false;
  }
  return true;
}

// is (x, y) on a walkable roof (floor tile '^')?
export const onRoof = (world, x, y) => world.map.at(Math.floor(x / TILE), Math.floor(y / TILE)) === '^';

// how far (px, up to max) a character can roll from (x, y) along angle a before something solid is in the way:
// walls, doors, furniture, glass and people; probed in small steps so the roll never ends inside anything
export function rollRoom(world, ch, x, y, a, max, step = 3) {
  const ux = Math.cos(a), uy = Math.sin(a);
  let d = 0;
  for (let n = Math.min(max, step); d < max && spotIsFree(world, x + ux * n, y + uy * n, ch.radius, ch); n = Math.min(max, n + step)) d = n;
  return d;
}

// first free spot beyond (x, y) along (ux, uy): a chair or a body right behind the obstacle must not cancel the vault
function landing(world, ch, x, y, ux, uy, gaps, pass) {
  for (const g of gaps) {
    const to = { x: x + ux * (ch.radius + g), y: y + uy * (ch.radius + g) };
    if (spotIsFree(world, to.x, to.y, ch.radius, ch, pass)) return to;
  }
  return null;
}

// over a car's hood the player comes down on a standing guard as on free ground: his legs take him (Player.vaultStrike)
const struck = (b) => b.entity?.isEnemy && standing(b.entity);

// over prop p from its closest point c, along (ux, uy): cast back from beyond the object to find where we come out
function crossProp(world, ch, p, c, ux, uy) {
  const far = { x: c.x + ux * 120, y: c.y + uy * 120 };
  const exit = segPoly(far.x, far.y, c.x, c.y, p.body.vertices);
  if (!exit) return null;
  const ex = far.x + (c.x - far.x) * exit.t, ey = far.y + (c.y - far.y) * exit.t;
  // vehicles: across the hood only (never over the roof or end to end)
  if (p.isVehicle ? !p.canSlide(c.x, c.y, ex, ey) : Math.hypot(ex - c.x, ey - c.y) > MAX_VAULT_DEPTH) return null;
  const to = landing(world, ch, ex, ey, ux, uy, [3, 10, 18], p.isVehicle && ch.isPlayer ? struck : null);
  return to && { kind: p.def.climb ? 'climb' : 'prop', over: p, to, ledge: { x: c.x, y: c.y, tx: -uy, ty: ux } };
}

// what can be vaulted in direction a (the move, or the aim when standing still):
// { kind: 'window' | 'prop' | 'climb' (def.climb: hoisted over, not slid across), over, to: {x, y},
//   ledge: {x, y, tx, ty} (where the hands go, its tangent) } or null.
export function findVault(world, ch, a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const r = ch.radius;
  for (const w of world.windows) {
    if (w.barred || (w.intact && !ch.isPlayer)) continue; // only the player dives through a whole pane, nobody through bars
    const nx = w.vertical ? 1 : 0, ny = w.vertical ? 0 : 1;
    const rx = ch.x - w.x, ry = ch.y - w.y;
    const side = rx * nx + ry * ny, along = rx * ny - ry * nx;
    if (Math.abs(side) > r + VAULT_REACH || Math.abs(along) > TILE / 2 + 3) continue;
    if ((dx * nx + dy * ny) * -Math.sign(side) < FACING) continue;
    const s = -Math.sign(side) || 1;
    const k = Math.max(-8, Math.min(8, along));
    // hands on the sill, either side of where we go through
    const ledge = { x: w.x + ny * k, y: w.y - nx * k, tx: ny, ty: -nx };
    const to = landing(world, ch, ledge.x, ledge.y, nx * s, ny * s, [7, 13, 20]);
    if (to) return { kind: 'window', over: w, to, ledge };
  }
  // the nearest first: in front of a gate made of several panels, the one he stands at
  const near = [];
  for (const p of world.props) {
    if (p.dead || !p.def.vault) continue;
    if (Math.abs(p.x - ch.x) > 110 || Math.abs(p.y - ch.y) > 110) continue;
    const c = closestOnPolygon(ch.x, ch.y, p.body.vertices);
    if (c.d <= r + VAULT_REACH) near.push([p, c]);
  }
  near.sort((a, b) => a[1].d - b[1].d);
  for (const [p, c] of near) {
    const nx = (c.x - ch.x) / (c.d || 1), ny = (c.y - ch.y) / (c.d || 1);
    if (dx * nx + dy * ny < FACING) continue;
    // along the move if that gets across, else straight over (running into it at an angle)
    const v = crossProp(world, ch, p, c, dx, dy) || crossProp(world, ch, p, c, nx, ny);
    if (v) return v;
  }
  return null;
}
