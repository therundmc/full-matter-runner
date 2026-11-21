// THE TOLL (level 2A's event 3, docs/LEVEL2.md; the lab's station 37). The road opens to a plaza of lanes, each one
// shut at its end by a gate: a wooden arm (prop `gate_arm_wood`: a car tears it off and goes on at a small cost, it
// flies in its own lengths) or a steel boom (`gate_steel`: `lasting`, nose-on it is the crash), each told by its
// lane's signal over the island (props lane_signal_go / _stop) and, from `tell` s before the gates at his speed, by
// the chase: bone arrows running down the wooden lanes toward their arms, each lane's own signal big over its mouth
// (a green arrow, a red X), the same on the screen's edge while its mouth is not on the picture yet
// (render/PursuitArt.js drawToll, ui/HUD.js); its slow motion as he chooses (systems/ChaseCam.js 'choose'). A pursuer
// (systems/Pursuit.js steers by `steer`) chooses its gate `decide` s out: a wooden lane, the one he is not heading for
// when there are two; one sent the wrong way (the level's event `gate: 'steel'`) takes the steel lane beside his and
// wrecks on its boom. A car through an arm: 'tollGate' ({ kind: 'wood', car, his, x, y }: the breath of slow
// motion, systems/ChaseCam.js; the arm's splinters, systems/TollFx.js). One of theirs stopped on a steel boom: THE
// CRASH ('tollCrash' { car, gate, x, y, side }): thrown back off it spinning, its nose folded, its lamps and
// windscreen gone, the boom bent (`gate_steel_bent`); its fire-ball and the kill's strong beat are the looks'
// (systems/TollFx.js, ChaseCam).
// Data: the level's `chase.toll` or a route's (the lab's: `routes.<name>.toll`): { at: col of the gates, lanes:
// [rows] north first (the plaza's), from: [rows] (the same lanes on the approach), fan: [col, col] (where they spread
// from one to the other: the way told and driven; straight on past it), nose: col of the islands' noses (the lanes'
// mouths), gates: ['wood' | 'steel', ...] }. Numbers: CHASE.toll. DOM-free.
import { TILE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { CHASE } from '../data/chase.js';
import { spriteOpt } from '../../engine/Assets.js';

const { Body } = Matter;

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

// the world px along the road of plaza T's lanes' mouths (its islands' noses: where a lane is one for good)
export const mouthX = (T) => (T.nose ?? T.fan[1]) * TILE;

// Is plaza T's steel lane k where a car at (x, y) is stopped (by its boom: its middle within `reach` px before the
// gate and inside the lane's 3 m)? x, y world px; gx: the gates' x
export function onBoom(T, k, x, y, reach) {
  const gx = T.at * TILE;
  return T.gates[k] === 'steel' && x <= gx + 8 && x >= gx - reach && Math.abs(y - laneY(T, k, gx)) < 1.5 * TILE;
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
    // (chosen: its slow motion has been, systems/ChaseCam.js; crashed: the cars stopped on its booms)
    this.plazas = list.map((T) => ({ ...T, x: T.at * TILE, props: [], k: 0, through: false, chosen: false }));
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

  // A wreck of theirs at (x, y) coming at a plaza (Pursuit.exit; C.wreck): { stop }: the x it is braked to a stand
  // before, `short` px short of the islands' noses (from `from` px out); nearer than `room` px to that, and to `past`
  // px beyond the gates, { lane, run }: its lane's line across, kept, and the least speed it runs on through at;
  // else null
  wreckWay(x, y) {
    const K = this.C.wreck;
    for (const P of this.plazas) {
      const stop = mouthX(P) - K.short;
      if (x < stop - K.room) { if (x > stop - K.from) return { stop }; continue; }
      if (x < P.x + K.past) return { lane: laneY(P, nearestLane(P, y, x), x), run: K.run };
    }
    return null;
  }

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

  // the steel boom car v stands on, stopped there: { P (its plaza), k (its lane) }, or null (once a car: one that
  // crashed already, or blew up, has none)
  boomOf(v) {
    if (!v || v.tollCrash || v.exploded) return null;
    for (const P of this.plazas) {
      const k = P.gates.findIndex((_, i) => onBoom(P, i, v.x + v.w / 2, v.y, v.w));
      if (k >= 0) return { P, k };
    }
    return null;
  }

  // One of theirs stopped for good on a steel boom (Pursuit.wreck, from the physics' blow, before it tells
  // 'pursuerWreck': at: boomOf's): THE CRASH, once a car. Thrown back off the boom (`back` px/step) and out to the
  // side its nose was (`across`), spinning (`spin` rad/step), its nose folded (`dents` blows to its front), its front
  // lamps and windscreen gone, `parts` of it lost; the boom bent (its sprite gate_steel_bent, still across the lane).
  // Marked `tollCrash` (so that the kill's strong beat, systems/ChaseCam.js, and its looks, CarFx / TollFx, are the
  // toll's whoever hears 'pursuerWreck' first) and told on 'tollCrash' (systems/TollFx.js)
  crash(v, at = this.boomOf(v)) {
    const K = this.C.crash, w = this.world;
    if (!at) return;
    const { P, k } = at, gate = P.props[k], gy = laneY(P, k, P.x), side = v.y < gy ? -1 : 1, b = v.body;
    v.tollCrash = true;
    Body.setVelocity(b, { x: -K.back, y: side * K.across });
    Body.setAngularVelocity(b, side * K.spin);
    b.flyUntil = w.time + K.fly;
    // (the nose folded on the boom: blows across its front, both lamps, the windscreen)
    for (let i = 0; i < K.dents; i++) v.scar?.(v.w - 2 - Math.random() * 18, 3 + Math.random() * (v.h - 6), Math.PI, 'blunt');
    v.breakLamp?.(0, 0);
    v.breakLamp?.(1, 0);
    v.hitWindow?.('wind', v.w * 0.7, v.h / 2, 0);
    for (let i = 0; i < K.parts; i++) v.shed?.(v.x + v.w / 2, v.y, Math.PI + side * (0.3 + Math.random()), 140 + Math.random() * 160, true);
    if (gate && !gate.bent) {
      gate.bent = true;
      gate.img = spriteOpt('props/gate_steel_bent') || gate.img;
    }
    w.shake?.(K.shake);
    w.events.emit('tollCrash', { car: v, gate, x: P.x - 4, y: v.y, side, lane: k });
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
