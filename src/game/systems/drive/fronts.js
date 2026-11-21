// The building fronts and the stalls (systems/Drive.js d: its state): where the fronts either side of the street are
// (frontsAt, fronts), his flank held off them as he steers into them (offFronts: `grind`), and never stalled for good
// (unstick: crawling, the car eases itself out sideways; boxed: its nose on the lorry with the way round shut is the
// crash). Numbers: CHASE.front / frontAhead / stall. DOM-free.
import { TILE } from '../../Config.js';
import { otherOf } from '../chase/shared.js';
import { crash, tearHeld } from './contacts.js';

// The building fronts either side of a car in column c, row r (a street running along +x): [world px y of the face
// above it (the bottom of the first wall, window or door tile up), of the one below it (the top of the first one
// down)], none within `most` tiles: -+Infinity; null when r itself is one. A window or a door is set back in its wall
// (its pane, its leaves in the middle of the tile): it counts as the front. A fence does not (it is gone through),
// nor an opening (an alley, a yard: the face is its back wall)
const isFront = (map, c, k) => map.isSolid(c, k) || 'GDL'.includes(map.at(c, k));
export function frontsAt(map, c, r, most = 8) {
  const front = (k) => isFront(map, c, k);
  if (front(r)) return null;
  let up = r, down = r;
  while (up > r - most && !front(up - 1)) up--;
  while (down < r + most && !front(down + 1)) down++;
  return [up > r - most ? up * TILE : -Infinity, down < r + most ? (down + 1) * TILE : Infinity];
}

// Never stalled for good (C.stall): crawling under `under` of its cruise speed for `after` s (a car shoved into its
// lane, a wreck, a thing pinned against it), it eases itself sideways out of it until it runs again, at `steer` of
// the full sideways speed however slow it is and whatever it rubs on (at a crawl the wheel alone could not drag it
// off what its nose leans on): the way he steers (own: never fought), else the way what holds it pushes it, else
// toward the street's middle, else toward the lane it is farthest from; the other way if it has not got anywhere
// after `after` s more. -1..1 the way it goes, or null: the wheel as usual (the lab has no street)
export function unstick(d, dt, own) {
  const S = d.C.stall, mid = d.street, y = d.car.y;
  d.stallT = d.v < S.under * d.cruise ? d.stallT + dt : 0;
  if (!d.stallT) d.nosing = null;
  else if (mid !== null && boxed(d, dt)) return null;
  if (d.v >= S.until * d.cruise) d.freeing = null;
  else if (d.stallT > S.after && !d.freeing) d.freeing = { side: wayOut(d, mid), y, t: 0 };
  const F = d.freeing;
  if (!F || mid === null) return null;
  if (own) return own;
  tearHeld(d);
  if ((F.t += dt) > S.after) {
    if (Math.abs(y - F.y) < S.moved) F.side = -F.side; // (held that way too)
    F.y = y;
    F.t = 0;
  }
  return F.side;
}

// Crawling with its nose on what never gives (a `lasting` thing: the lorry), it has to get round one of its ends: not
// `moved` px nearer to one than it ever was in each `after` s for `boxed` s (the way round shut: a car shoved in
// there and pinned, the street's front; a car pushed against it creeps a few px; going back and forth gains
// nothing) and it is the crash he was told about: the street is his to get round, not to wait in. True: it crashed
function boxed(d, dt) {
  const S = d.C.stall, wall = nosedOn(d);
  if (!wall) return false;
  const left = roundOf(d, wall)?.left ?? Infinity, B = (d.nosing ??= { t: 0, held: 0, best: left });
  if ((B.t += dt) >= S.after - 1e-9) {
    B.held = left < B.best - S.moved ? 0 : B.held + B.t;
    B.t = 0;
    B.best = Math.min(B.best, left);
  }
  if (B.held < S.boxed - 1e-9 || d.world.player.invulnerable) return false;
  crash(d, { a: d.car.body.angle });
  return true;
}

// the `lasting` body its nose leans on (within crash.cone of square on), or null
function nosedOn(d) {
  const b = d.car.body, ca = Math.cos(b.angle), sa = Math.sin(b.angle), cone = Math.cos(d.C.crash.cone);
  for (const pair of d.world.physics.activePairs()) {
    const o = otherOf(pair, b);
    if (!o?.entity?.def?.lasting || pair.isSensor) continue;
    const n = pair.collision.normal, into = pair.bodyA === b ? -1 : 1; // (Matter's normal points from B to A)
    if ((ca * n.x + sa * n.y) * into >= cone) return o;
  }
  return null;
}

// the way round body o across the street: its end with room for the car short of the building fronts, the nearest
// { side: -1 (-y) | 1, left: px across still to go to clear it }, or null (it shuts the street)
function roundOf(d, o) {
  const [lo, hi] = fronts(d), y = d.car.y, h = d.car.h, ob = o.bounds, ends = [];
  if (ob.min.y - lo >= h) ends.push({ side: -1, left: y + h / 2 - ob.min.y });
  if (hi - ob.max.y >= h) ends.push({ side: 1, left: ob.max.y - (y - h / 2) });
  return ends.sort((a, c) => a.left - c.left)[0] ?? null;
}

// which way out of what holds it (-1: -y): round the end of what its nose leans on, else the way the solid contacts
// push it, else the street's middle, else the lane it is farthest from
function wayOut(d, mid) {
  const wall = nosedOn(d), round = wall && roundOf(d, wall);
  if (round) return round.side;
  const S = d.C.stall, b = d.car.body, y = d.car.y;
  let push = 0;
  for (const pair of d.world.physics.activePairs()) {
    if (pair.isSensor || (pair.bodyA !== b && pair.bodyB !== b)) continue;
    push += pair.collision.normal.y * (pair.bodyA === b ? 1 : -1); // (Matter's normal points from B to A: away from it)
  }
  if (Math.abs(push) > S.push) return Math.sign(push);
  if (mid !== null && Math.abs(mid - y) >= TILE) return Math.sign(mid - y);
  const far = (d.leg.lanes || []).map((r) => r * TILE).sort((a, c) => Math.abs(c - y) - Math.abs(a - y))[0];
  return far !== undefined && far !== y ? Math.sign(far - y) : 1;
}

// u (px/step across) kept from carrying its flank into the building fronts (frontsAt, C.front px short of them):
// their windows and doors are set back in them and a corner sliding along caught in one and held the car there.
// Held off them as it goes into them: `grind`, its flank there (the scrape's sparks and grind: scrape)
// (a street only: the chase; the lab has none)
export function offFronts(d, u) {
  d.grind = null;
  if (!d.leg.lanes || !d.world.map) return u;
  const b = d.car.body.bounds, m = d.C.front, [lo, hi] = fronts(d);
  // already past them: the fronts step in ahead of him (a block set forward, the end of a terrace, of a yard): the
  // car is brought back inside their line before it gets there, however he steers
  const over = Math.max(b.max.y - (hi - m), lo + m - b.min.y);
  if (over > 1) { d.grind = null; return (b.max.y > hi - m ? -1 : 1) * Math.min(d.C.steer, over); }
  const held = u > 0 ? Math.min(u, Math.max(0, hi - m - b.max.y)) : Math.max(u, Math.min(0, lo + m - b.min.y));
  if (Math.abs(held) < Math.abs(u) - 0.05) d.grind = { x: d.car.x, y: u > 0 ? hi : lo };
  return held;
}

// the building fronts either side of the car, over the columns it covers (frontsAt): [world px y above, below]
// and over the C.frontAhead tiles ahead of its nose (no map: -+Infinity). Where a street runs across his (the level's `chase.across`: [[col0, col1, row above, row
// below], ...]) there is no front: the line of the fronts is held across it (those rows), so the wheel never takes
// him down a side street, nose-on into the corner of the next block
export function fronts(d) {
  const map = d.world.map, b = d.car.body.bounds, r = Math.floor(d.car.y / TILE);
  const nose = Math.floor(b.max.x / TILE), mid = d.street;
  let lo = -Infinity, hi = Infinity;
  for (let c = Math.floor(b.min.x / TILE); map && c <= nose + d.C.frontAhead; c++) {
    const f = frontsAt(map, c, r), x = d.leg.across.find((a) => c >= a[0] && c <= a[1]);
    if (f) { lo = Math.max(lo, f[0]); hi = Math.min(hi, f[1]); }
    else if (c > nose && c < map.w && mid !== null) {
      // a front in his own row, ahead: its face toward the street's middle is the line
      const south = (r + 0.5) * TILE > mid, step = south ? -1 : 1;
      let k = r;
      while ((k + step + 0.5) * TILE > mid === south && isFront(map, c, k + step)) k += step;
      if (south) hi = Math.min(hi, k * TILE); else lo = Math.max(lo, (k + 1) * TILE);
    }
    if (x) { lo = Math.max(lo, x[2] * TILE); hi = Math.min(hi, x[3] * TILE); }
  }
  return [lo, hi];
}
