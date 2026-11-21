// Where the pursuers ride (systems/Pursuit.js P: its state): the lane he is in and the other one (lanesOf, sides),
// a slot's point beside him or ahead (slotOf, slot), which slots n cars hold (pickSlots) and who holds which
// (assign), and him as a car on another leg of the route sees him (tgFor). Numbers: CHASE.pursuit. DOM-free.
import { TILE } from '../../Config.js';
import { CHASE } from '../../data/chase.js';
import { legAt, bandOf, nearestLane } from '../Route.js';
import { dice } from '../Rng.js';

const SWAP = { lead: 'ahead', ahead: 'lead' }; // he changed lanes: the two ahead of him keep theirs (assign)

// ---------------------------------------------------------------- pure
// The lane he is in and the other one: { his, other } (y of their middles) for his car at y = py on a road whose
// lanes' middles run from band[0] to band[1] (rows: all of them, sorted, when there are more than two). `was`: what
// it gave last time: he counts as in the next lane only once C.flip px past the middle between the two (no flutter
// as he straddles the line). The other one: the lane beside his (of two inner ones, the one toward the road's
// middle). No lanes (the lab): his own line, and one C.side px out on his driver's side
export function lanesOf(py, band, was = null, C = CHASE.pursuit, rows = null) {
  if (!band || band[1] - band[0] < 1) return { his: py, other: py - C.side };
  const L = rows?.length > 1 ? rows : band;
  let i = was ? L.indexOf(was.his) : -1;
  if (i < 0) {
    i = 0;
    while (i < L.length - 1 && py >= (L[i] + L[i + 1]) / 2) i++;
  } else {
    while (i > 0 && py < (L[i - 1] + L[i]) / 2 - C.flip) i--;
    while (i < L.length - 1 && py > (L[i] + L[i + 1]) / 2 + C.flip) i++;
  }
  const o = i === 0 ? 1 : i === L.length - 1 ? i - 1 : i < (L.length - 1) / 2 ? i + 1 : i - 1;
  return { his: L[i], other: L[o] };
}

// a slot's point { x, y } for his car's middle at x = px: C.slots[slot] px ahead of it (`rank` x C.more further: the
// cars past the fourth), in the lane it names (lanes: lanesOf)
export function slotOf(slot, px, lanes, rank = 0, C = CHASE.pursuit) {
  const [dx, lane] = C.slots[slot];
  return { x: px + dx + rank * C.more, y: lanes[lane] };
}

// The slots n cars hold, rearmost first: [[slot, rank], ...]. Up to three: n of abreast / lead / ahead (roll 0..1
// picks which: the picture changes when it is drawn again); more: those three and `far`, one behind the other
export function pickSlots(n, roll, C = CHASE.pursuit) {
  const near = Object.keys(C.slots).filter((k) => k !== 'far').sort((a, b) => C.slots[a][0] - C.slots[b][0]);
  if (n >= near.length) return [...near.map((k) => [k, 0]), ...Array.from({ length: n - near.length }, (_, i) => ['far', i])];
  const ways = near.flatMap((a, i) => (n === 1 ? [[a]] : near.slice(i + 1).map((b) => [a, b])));
  return ways[Math.min(ways.length - 1, Math.floor(roll * ways.length))].map((k) => [k, 0]);
}

// ---------------------------------------------------------------- the pursuit's
// The slots, all alongside him and ahead (CHASE.pursuit.slots; none behind). They are dealt again when a car joins
// or leaves the chase and every C.shuffle s (pickSlots: which ones are held changes, so the picture does): the
// rearmost car takes the rearmost slot, so nobody has to pass anybody. The 'other' lane follows him: when he
// changes lanes the car abreast comes round to his other side, and the two ahead of him swap their slots rather
// than their lanes (they would cross each other's way)
export function assign(P, dt, tg) {
  const C = P.C, chasing = P.cars.filter((c) => c.state === 'chase');
  if (tg && !P.world.drive?.bend) {
    // (on his leg's lanes; a lane of another leg is not one he changed to)
    const was = P.road, R = bandOf(P.route.legs[P.hisLeg]), same = was && (R.rows || R.band || []).includes(was.his);
    P.road = lanesOf(tg.y, R.band, same ? was : null, C, R.rows);
    if (same && R.band && was.his !== P.road.his) for (const car of chasing) car.slot = SWAP[car.slot] ?? car.slot;
  }
  const crew = chasing.map((c) => c.n).join();
  if ((P.shuffleT -= dt) > 0 && crew === P.crew) return;
  P.crew = crew;
  const D = dice(P.world); // (gameplay rolls: systems/Rng.js)
  P.shuffleT = D.rand(...C.shuffle);
  // (alone, a car takes the slot its style fights from: the rammer abreast, the blocker ahead in his lane)
  const lone = chasing.length === 1 ? C.attack.lone[chasing[0].style] : null;
  const slots = lone ? [[lone, 0]] : pickSlots(chasing.length, D.next(), C);
  chasing.sort((a, b) => a.v.x - b.v.x).forEach((car, i) => {
    const [slot, rank] = slots[i];
    if (car.slot !== slot) car.settled = 0;
    car.slot = slot;
    car.rank = rank;
  });
}

// the lane he is in and the other one, now (tg: as a car on another leg sees him, its own: tgFor)
export function sides(P, tg) { return tg.road ?? P.road ?? lanesOf(tg.y, P.band, null, P.C, bandOf(P.route.legs[P.hisLeg]).rows); }

// a car's slot's point, now
// (hurt by a shove, it keeps its distance a moment: the far slot, ahead in the other lane, smoking)
export function slot(P, car, tg) { return slotOf(car.hurt > 0 && car.state === 'chase' ? 'far' : car.slot, tg.x, sides(P, tg), car.rank, P.C); }

// Him as car `car` sees him: himself on the same leg; from a leg he is not on (he is in a bend, or it went through
// one first, or it was left behind before one), where the route puts him on its own leg (as far along it as he is
// along the route; ahead of him, never under `clear` px past the end of the bend he will come out of), in the lane
// of that leg he is in (the one he will come out in) going his speed along the route, and no car of his to mind
export function tgFor(P, car, tg) {
  const d = P.world.drive, legs = d?.route?.legs; // (his drive's: its distances count from where he started)
  if (!tg || !legs || legs.length < 2 || !d.on) return tg;
  const k = legAt(legs, car.v.x);
  if (k === d.legI && !d.bend) return tg;
  const L = legs[k], s = d.along, his = legs[d.legI], R = bandOf(L);
  let x = L.x0 + (s - L.s0);
  if (s < L.s0) x = Math.max(x, L.x0 + CHASE.bend.clear);
  const row = d.bend ? d.bend.b.end.y / TILE : nearestLane(his.lanes, tg.y / TILE);
  const idx = his.lanes ? his.lanes.indexOf(nearestLane(his.lanes, row)) : 0;
  const y = R.rows ? R.rows[Math.min(idx, R.rows.length - 1)] : tg.y;
  return { ...tg, car: null, x, y, vel: { x: d.v, y: 0 }, road: lanesOf(y, R.band, null, P.C, R.rows), virtual: true };
}
