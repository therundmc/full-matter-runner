// The lorry that backs out across the street (level 2A's event 2, docs/LEVEL2.md; the lab's station 21). A box lorry
// (prop `lorry`: `lasting`, it never gives) waits in a yard, its cab away from the road. Set off by distance (the
// level's `chase.events`: { at, kind: 'lorry', lorry: [col, row], back: tiles, gap: [col, row] }), it is TOLD first
// (CHASE.lorry.tell s: its reversing lamps flash and it beeps, red chevrons at the screen's edge toward it, a red
// lane where its tail will sweep, bone arrows on the way round), then backs `back` tiles along its tail and stops
// there: the street is shut. Nose-on into it is the crash (systems/Drive.js: it is `lasting`); a scrape along it is
// only sparks; a pursuer does not see it coming (prop `blind`, systems/Pursuit.js) and wrecks itself on it.
// The lab's lorry (prop option `backs`: tiles) backs out when a driven car comes near, waits, and goes back in.
// Its body is a static one moved a step at a time (it weighs ten cars: nothing in its way stops it).
// DOM-free; render/PursuitArt.js draws its lane, lamps and arrows, ui/HUD.js the chevrons at the edge.
import { TILE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { CHASE } from '../data/chase.js';
import Prop from '../entities/Prop.js';

const { Body } = Matter;

// ---------------------------------------------------------------- pure
// px backed t s after it was set off (the tell first, then C.speed px/s), of `dist` px in all
export const backedAt = (t, dist, C = CHASE.lorry) => clamp((t - C.tell) * C.speed, 0, dist);

// how many beeps have sounded t s after it was set off, while it tells and backs (one every C.beep s)
export function beepsBy(t, dist, C = CHASE.lorry) {
  const end = C.tell + dist / C.speed;
  return t < 0 ? 0 : Math.floor(Math.min(t, end) / C.beep) + 1;
}

export default class Lorries {
  constructor(world, chase = null) {
    this.world = world;
    this.C = CHASE.lorry;
    this.list = [];
    for (const e of chase?.events || []) {
      if (e.kind !== 'lorry') continue;
      const p = new Prop(world, 'lorry', e.lorry[0] * TILE, e.lorry[1] * TILE, -Math.PI / 2);
      world.props.push(p);
      this.add(p, e.back * TILE, { at: e.at * TILE, gap: e.gap ? { x: e.gap[0] * TILE, y: e.gap[1] * TILE } : null });
    }
    for (const p of world.props) if (p.type === 'lorry' && p.backs) this.add(p, p.backs * TILE, { lab: true });
  }

  // a lorry: its prop, the px it backs, where it waits; state: wait | tell | back | out | home (the lab's, going back in)
  add(p, dist, o = {}) {
    const a = p.body.angle;
    const L = { p, dist, state: 'wait', t: 0, done: 0, beeps: 0, x0: p.x, y0: p.y, dx: -Math.cos(a), dy: -Math.sin(a), stay: 0, ...o };
    this.list.push(L);
    return L;
  }

  // the middle of its tail now, and where it will be once out (world px)
  tail(L, out = false) {
    const h = L.p.def.w / 2 + (out ? L.dist - L.done : 0);
    return { x: L.p.x + L.dx * h, y: L.p.y + L.dy * h };
  }

  // what he drives (the chase's car, the lab's van), else null
  car() {
    const d = this.world.drive;
    return d?.on && !d.dead ? d.van : null;
  }

  step(dt) {
    const w = this.world, C = this.C, car = this.car();
    for (const L of this.list) {
      if (L.state === 'wait') {
        const near = car && (L.lab ? Math.hypot(car.x - L.x0, car.y - L.y0) < C.lab.range : car.x >= L.at);
        if (near && !w.exited) { L.state = 'tell'; L.t = 0; L.beeps = 0; }
        continue;
      }
      L.t += dt;
      if (L.state === 'tell' || L.state === 'back') {
        // the beeper and the reversing lamps, on the beat
        const n = beepsBy(L.t, L.dist, C);
        if (n > L.beeps) {
          L.beeps = n;
          const q = this.tail(L);
          w.sound('lorryBeep', q.x, q.y, 1);
          w.light?.(q.x, q.y, C.lamp.r, C.lamp.color, C.beep * 0.5);
        }
        const want = backedAt(L.t, L.dist, C);
        if (want > L.done) {
          if (L.state === 'tell') { L.state = 'back'; w.sound('lorryBrake', L.p.x, L.p.y, 0.7); }
          this.move(L, want);
        }
        if (L.done >= L.dist) {
          L.state = 'out';
          L.stay = 0;
          const q = this.tail(L);
          w.sound('lorryBrake', q.x, q.y, 1);
          w.shake?.(C.shake);
          w.particles?.dust?.(q.x, q.y, 6, 20, '#5a5260', { speed: 30, size: 4, life: 0.6, alpha: 0.3 });
        }
      } else if (L.state === 'out' && L.lab) {
        // the lab: it stays out a while, then goes back in once he is clear of its way
        L.stay += dt;
        const clear = !car || Math.hypot(car.x - L.p.x, car.y - L.p.y) > L.p.def.w * 0.75;
        if (L.stay > C.lab.stay && clear) L.state = 'home';
      } else if (L.state === 'home') {
        this.move(L, Math.max(0, L.done - C.speed * dt));
        if (L.done <= 0) L.state = 'wait';
      }
    }
  }

  // its body `done` px out of where it waits
  move(L, done) {
    L.done = done;
    Body.setPosition(L.p.body, { x: L.x0 + L.dx * done, y: L.y0 + L.dy * done });
  }

  // what is told now: each lorry telling or backing { L, x, y (its tail), t (0..1 of the tell), moving }
  told() {
    return this.list.filter((L) => L.state === 'tell' || L.state === 'back')
      .map((L) => ({ L, ...this.tail(L), k: clamp(L.t / this.C.tell, 0, 1), moving: L.state === 'back' }));
  }

  // is it lit on this beat (the reversing lamps blink with the beeper)
  blink(L) { return (L.state === 'tell' || L.state === 'back') && (L.t % this.C.beep) < this.C.beep * 0.5; }
}
