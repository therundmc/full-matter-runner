// THE TOLL (level 2A's event 3, docs/LEVEL2.md; the lab's station 37). The road opens to a plaza of lanes, each one
// shut at its end by a gate: a wooden arm (prop `gate_arm_wood`: a car tears it off and goes on at a small cost, it
// flies in its own lengths) or a steel boom (`gate_steel`: `lasting`, nose-on it is the crash), each told by its
// lane's signal over the island (props lane_signal_go / _stop) and, from `tell` s before the gates at his speed, by
// the chase: bone arrows running down the wooden lanes toward their arms, red brackets closing on the steel booms,
// chevrons at the screen's edge for those not on it yet (render/PursuitArt.js drawToll, ui/HUD.js). A pursuer
// (systems/Pursuit.js steers by `steer`) chooses its gate `decide` s out: a wooden lane, the one he is not heading for
// when there are two; one sent the wrong way (the level's event `gate: 'steel'`) takes the steel lane beside his and
// wrecks on its boom. His car through an arm: 'tollGate' ({ kind: 'wood', car, his, x, y }: the breath of slow
// motion, systems/ChaseCam.js).
// Data: the level's `chase.toll` or a route's (the lab's: `routes.<name>.toll`): { at: col of the gates, lanes:
// [rows] north first (the plaza's), from: [rows] (the same lanes on the approach), fan: [col, col] (where they spread
// from one to the other: the way told and driven; straight on past it), gates: ['wood' | 'steel', ...] }. Numbers:
// CHASE.toll. DOM-free.
import { TILE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { CHASE } from '../data/chase.js';

const KINDS = { gate_arm_wood: 'wood', gate_steel: 'steel' };

// ---------------------------------------------------------------- pure
// world px across of lane k of plaza T at x (world px): its row on the approach before the fan, the plaza's past it,
// the straight line between them in it
export function laneY(T, k, x) {
  const a = T.fan[0] * TILE, b = T.fan[1] * TILE, u = clamp((x - a) / Math.max(1, b - a), 0, 1);
  return (T.from[k] + (T.lanes[k] - T.from[k]) * u) * TILE;
}

// the lane whose line at x is nearest y (world px), among those of kind `want` ('wood' | 'steel'; none: any), by its
// index; -1: none of that kind
export function nearestLane(T, y, x, want = null) {
  let best = -1, bd = Infinity;
  T.lanes.forEach((_, k) => {
    if (want && T.gates[k] !== want) return;
    const d = Math.abs(laneY(T, k, x) - y);
    if (d < bd - 1e-6) { bd = d; best = k; }
  });
  return best;
}

// px of road before the gates something is told / decided at, s seconds out at v px/step (`least` px at least)
export const reach = (s, v, least = 0) => Math.max(least, s * Math.max(0, v) * 60);

// does a car at y going down lane i cross one at o.y going down lane o.k (on the other side of it, toward its lane)?
const crosses = (y, i, o) => (y - o.y) * (i - o.k) < 0;

// THE WAY THROUGH for a car at (x, y) going to plaza T: the wooden lane nearest it (his: the one the bone arrows send
// him down). A pursuer's (`his`: the index of the one he is heading for, hisY his place across): a wooden lane that
// takes it across neither his way nor the way of the others already going for theirs (`others`: [{ y, k }]), another
// than his when there is one, else his (it follows him through)
export function woodFor(T, x, y, his = -1, hisY = y, others = []) {
  if (his < 0) return nearestLane(T, y, x, 'wood');
  const fences = [{ y: hisY, k: his }, ...others];
  let best = -1, bd = Infinity;
  T.gates.forEach((g, i) => {
    if (g !== 'wood') return;
    const d = (i === his ? 1e6 : 0) + fences.filter((o) => crosses(y, i, o)).length * 1e7 + Math.abs(laneY(T, i, x) - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best >= 0 ? best : his;
}

// the steel lane for the one sent the wrong way: one beside the lane he is heading for (`his`, an index), the one on
// its own side of him (hisY) and across nobody's way (`others`) if it can; else the steel one nearest his
export function steelFor(T, x, y, his, hisY = y, others = []) {
  let best = -1, bd = Infinity;
  T.gates.forEach((g, i) => {
    if (g !== 'steel') return;
    const d = Math.abs(i - his) * 1000 + (crosses(y, i, { y: hisY, k: his }) ? 500 : 0) + others.filter((o) => crosses(y, i, o)).length * 300
      + Math.abs(laneY(T, i, x) - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export default class Toll {
  // the plazas of a level: its chase's, its routes' (the lab)
  static of(world, level) {
    const list = [level?.chase?.toll, ...Object.values(level?.routes || {}).map((r) => r.toll)].filter(Boolean);
    return list.length ? new Toll(world, list) : null;
  }

  constructor(world, list, C = CHASE.toll) {
    this.world = world;
    this.C = C;
    // each plaza: its data, its gates' column (px), its gates' props lane by lane, how far it is told now (k 0..1)
    this.plazas = list.map((T) => ({ ...T, x: T.at * TILE, props: [], k: 0, through: false }));
    for (const P of this.plazas) {
      P.props = P.lanes.map((r) => world.props.find((p) => KINDS[p.type] && Math.abs(p.x - P.x) < TILE && Math.abs(p.y - r * TILE) < TILE) || null);
    }
    this.seen = new Set(); // the arms already told torn
  }

  // his car (the drive's, alive), or null
  car() {
    const d = this.world.drive;
    return d?.on && !d.dead ? d : null;
  }

  // the plaza whose gates are within `s` s ahead of x at v px/step (or `past` px behind it), or null
  near(x, v, s) {
    const C = this.C;
    return this.plazas.find((P) => x < P.x + C.past && x >= P.x - reach(s, v, C.least)) || null;
  }

  // nothing else is told while a plaza is (Pursuit.busy: no shot, no ram, no brake), a breath before it too
  busy(x, v) { return !!this.near(x, v, this.C.tell + 0.5); }

  // the told plaza for his car, its arrows and brackets: [{ P, k (0..1: faded in), d: his drive }]
  told() {
    return this.plazas.filter((P) => P.k > 0).map((P) => ({ P, k: P.k, d: this.world.drive }));
  }

  // the wooden lane he is sent down (the nearest to him), and its line ahead of him: { k, y } at x, or null (no told
  // plaza): the QA robot's way through
  guide(x, y) {
    const P = this.plazas.find((q) => q.k > 0 && x < q.x);
    if (!P) return null;
    const k = woodFor(P, x, y);
    return { k, y: laneY(P, k, x + reach(this.C.lead, this.world.drive?.v ?? 0)) };
  }

  // A pursuer's line across the road while it goes through a plaza (Pursuit.want): its gate chosen `decide` s out
  // (car.toll: { P, k }), chosen again as he changes his mind until it is in the fan, then kept to the gates and
  // `past` px beyond: a wooden lane, the one he is not heading for if there are two, never across his way nor the
  // others' (woodFor); one with `gate0` 'steel' the steel one beside his (steelFor). The line `lead` s ahead of it;
  // null: no plaza (its slot's line as usual)
  steer(car, x, y, tg) {
    const C = this.C, was = car.toll;
    if (was && x < was.P.x + C.past && x >= was.P.fan[0] * TILE) return laneY(was.P, was.k, x + reach(C.lead, car.s));
    const P = this.near(x, Math.max(this.world.drive?.v ?? car.s, 1), C.decide); // (all of them at once: by his speed)
    if (!P || x >= P.x) { car.toll = null; return null; }
    const his = tg ? woodFor(P, x, tg.y) : -1, hy = tg?.y ?? y, cy = car.v?.y ?? y;
    const others = (this.world.pursuit?.cars || []).filter((c) => c !== car && c.toll?.P === P).map((c) => ({ y: c.v.y, k: c.toll.k }));
    const k = car.gate0 === 'steel' ? steelFor(P, x, cy, Math.max(0, his), hy, others) : woodFor(P, x, cy, his, hy, others);
    car.toll = { P, k: k >= 0 ? k : nearestLane(P, y, x), his };
    return laneY(P, car.toll.k, x + reach(C.lead, car.s));
  }

  // the px along the road a car going through holds its middle at (Pursuit.want), or null (its slot's): one sent the
  // wrong way `wrong` px off his (a car's length behind him: it hits the boom a moment after he is through), one
  // following him down his own lane `follow` px off it (behind him, never side by side in it); either keeps its slot
  // while still ahead of him in his lane (it would brake onto his nose)
  holdX(car, tg) {
    const T = car.toll;
    if (!T || !tg?.car) return null;
    const inHis = Math.abs(car.v.y - tg.y) < (car.v.h + tg.car.h) / 2 + 8;
    if (inHis && car.v.x > tg.x) return null;
    if (car.gate0 === 'steel') return tg.x + this.C.wrong;
    return T.k === T.his ? tg.x + this.C.follow : null;
  }

  // A step: how far each plaza is told (his car `tell` s from its gates, until he is `past` them; faded in over
  // `fade` s), and its wooden arms torn this step told on 'tollGate' (by the car nearest it: his, or one of theirs)
  step(dt) {
    const C = this.C, d = this.car(), w = this.world;
    for (const P of this.plazas) {
      const on = !!d && !w.exited && d.van.x < P.x + C.past && d.van.x >= P.x - reach(C.tell, d.v, C.least);
      P.k = on ? Math.min(1, P.k + dt / C.fade) : Math.max(0, P.k - dt / C.fade);
      P.props.forEach((p, k) => {
        if (!p || P.gates[k] !== 'wood' || this.seen.has(p) || !(p.dying || p.dead)) return;
        this.seen.add(p);
        const cars = [d?.van, ...(w.pursuit?.cars || []).map((c) => c.v)].filter(Boolean);
        const by = cars.reduce((a, c) => (!a || Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? c : a), null);
        const his = !!by && by === d?.van && Math.hypot(by.x - p.x, by.y - p.y) < by.w;
        w.events.emit('tollGate', { kind: 'wood', car: by, his, x: p.x, y: p.y, lane: k });
      });
    }
  }
}
