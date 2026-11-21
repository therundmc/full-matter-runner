// What happens by distance along the road (systems/Pursuit.js P: its state; the level's `chase.events`: { at: col,
// kind, ... }): the alley car waiting in its mouth (alleyCar), its red lane told CHASE.alley.red s before it is in his
// lane, one joining from behind (trigger: where, spawnX; the cap CHASE.pursuit.most, dropOut); the lorry's is
// systems/Lorries.js'. DOM-free.
import { TILE } from '../../Config.js';
import { CHASE } from '../../data/chase.js';
import { endAttack } from './attacks.js';
import { endTell } from './gunman.js';
import { sides } from './slots.js';
import { DRIVEN } from './steering.js';

const { Body } = Matter;

// the events due once his car is at x (world px), not fired yet
export function dueEvents(events, fired, x) {
  return (events || []).filter((e) => !fired.has(e) && x >= e.at * TILE);
}

// event 1: the car waiting in the alley mouth (facing north, its lamps on: they are told first)
export function alleyCar(P, e) {
  const [c, r] = e.car;
  const car = P.spawn(c * TILE, r * TILE, -Math.PI / 2, 'wait', 0, e.style);
  car.event = e;
  P.waiting.set(e, car); // (never written onto the event: the level's data is shared by every run)
}

// an event of the level's `chase.events` due (dueEvents): the alley car's red lane and its launch, or one more
// joining from behind (`behind`: its style, a toll's `gate`)
export function trigger(P, e, tg) {
  const C = P.C, w = P.world;
  P.fired.add(e);
  if (e.kind === 'alley' && P.waiting.get(e)?.state === 'wait') {
    // the red lane now; the car comes out so as to be in his lane CHASE.alley.red s later
    const car = P.waiting.get(e), v = car.v, A = CHASE.alley, R = P.roadAt(v.x);
    const edge = (R.band ? R.band[1] : tg.y) + R.half; // his lane's near edge (the lanes' band + half a lane)
    const nose = v.y - v.w / 2;
    car.launch = Math.max(0, A.red - Math.max(0, nose - edge) / (C.spawn.cross * 60));
    const half = v.h / 2 + A.pad, y0 = (R.band ? R.band[0] : tg.y) - R.half;
    P.lanes.push({ car, x: v.x, w: half * 2, y0, y1: v.y - v.w / 2 + 8, t: 0, on: true });
    w.sound('tellClick', v.x, v.y, 0.5);
  } else if (e.kind === 'behind') {
    // (C.most of them on him at once at the most: with that many still driving, one more does not join; a toll's
    // wrong-gate car is its event: the rearmost of the others, off the picture, drops out for it; none can: it
    // joins all the same, one over the cap. Intended (the user's call): the toll's beat is that car on the boom, it
    // is never lost to the cap; tests/toll.test.mjs)
    const live = P.cars.filter((c) => !c.dummy && DRIVEN.has(c.state));
    if (live.length >= C.most) {
      if (!e.gate) return;
      const last = live.filter((c) => !P.onScreen(c.v) && c.v.x < tg.x).sort((a, b) => a.v.x - b.v.x)[0];
      if (last) dropOut(P, last);
    }
    const x = spawnX(P, tg);
    if (x === null) return;
    const car = P.spawn(x, sides(P, tg).other, 0, 'chase', Math.hypot(tg.vel.x, tg.vel.y) + C.spawn.over, e.style);
    car.gate0 = e.gate ?? null; // (a toll's gate it will take whatever he does: 'steel', the wrong one: systems/Toll.js)
  }
}

// Where one joining from behind starts (x, world px; null: nowhere on his leg): just off the picture behind him, in
// the lane he is not in (it comes up alongside); past the last wreck lying on the road back there when there is
// room (a wreck across a narrow street holds a car up a long while); taken back C.spawn.back px at a time while
// the place is shut (C.spawn.tries times), never back off the start of the leg the bend he came out of last took
// him onto (there it would be on the leg before it, and come into that bend from the wrong side)
export function spawnX(P, tg) {
  const S = P.C.spawn, y = sides(P, tg).other, back = tg.x - S.behind, R = P.route;
  let k = P.legOf(tg.x);
  while (k > 0 && !R.bends.some((b) => b.to === k)) k--; // (legs joined by no bend are one road)
  const floor = k > 0 ? R.legs[k].from * TILE : -Infinity, half = P.C.size[0] / 2, onLeg = (at) => at - half >= floor;
  let x = back;
  for (const o of P.cars) {
    if (o.state === 'wrecked' && o.v.x > x - S.clear && o.v.x < tg.x - S.near - S.clear) x = Math.max(x, o.v.x + S.clear);
  }
  // (room for it: a car abreast of him already is no reason to start further back)
  const full = (at) => P.blockedAt(null, at + S.room[0], y, S.room[1]);
  if (full(x)) x = back;
  if (!onLeg(x)) return null;
  for (let k = 0; k < S.tries && full(x) && onLeg(x - S.back); k++) x -= S.back;
  return x;
}

// one of them gives up (left behind for good: Pursuit.after's `lost`)
export function dropOut(P, car) {
  if (P.tell?.car === car) endTell(P);
  if (P.attack?.car === car) endAttack(P);
  car.state = 'lost';
  Body.setVelocity(car.v.body, { x: 0, y: 0 });
  car.v.body.flyUntil = 0;
}

// the alley car's red lane: on until the car is through his lane (or out of its run), then fading
export function stepLanes(P, dt) {
  const A = CHASE.alley;
  for (const L of P.lanes) {
    L.t += dt;
    const v = L.car.v, band = P.roadAt(v.x).band, through = band ? v.y + v.w / 2 < band[1] - TILE * A.through : L.t > A.after;
    if (L.on && (through || !['wait', 'cross'].includes(L.car.state))) L.on = false;
    if (!L.on) L.fade = (L.fade ?? 0) + dt;
  }
  P.lanes = P.lanes.filter((L) => (L.fade ?? 0) < A.fade);
}
