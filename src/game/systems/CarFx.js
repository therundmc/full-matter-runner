// What a car in trouble looks like (numbers: CARFX in data/carfx.js): the smoke of a damaged engine by stage, laid
// in the modelled air (systems/Smoke.js) along the way the car goes so that it trails behind it; rubber smoke where
// tyres let go; a shower of hot sparks for as long as metal rubs (a car on a wall, a pole, another car; a bare rim on
// the road; a wreck sliding), with its light, the paint it scores and its grind; rounds sparking on bodywork, glass
// in the air; and the fire-ball of a car that goes, in stages, with the burning pieces it throws down the road.
// It listens to the world's events ('tyres', 'carPart', 'carStruck', 'ride', 'pursuerWreck', 'pursuerCrash',
// 'explosion', 'carBlast') and looks at the cars and their contacts once a step, after the physics.
// LOOKS ONLY: it never moves a car, nothing it throws can touch one (its burning pieces meet walls only), and what it
// draws is scaled by the QUALITY option (data/quality.js `fx`, `fxLights`) under the budgets of CARFX.budget. DOM-free.
import { CAT, FIXED_DT } from '../Config.js';
import { CARFX } from '../data/carfx.js';
import { quality } from './Quality.js';
import { rand, chance, clamp } from '../../engine/math.js';
import { chunk, spriteOpt } from '../../engine/Assets.js';
import Debris from '../entities/Debris.js';

const { Body } = Matter;
const SOLID = CAT.WALL | CAT.EDGE; // what a burning piece meets: never a car, a man or a thing
const JUMP = 90;                   // px: a car put further than this in one step was moved by hand (no plume across it)
const ZERO = { x: 0, y: 0 };

// The stage of its engine's smoke (one of C.stages, C.fire, or null: nothing): on fire whatever its hp, else the
// worst stage its lost hp has reached. A blown wreck's smoke is its own (Vehicle.update).
export function smokeStage(v, C = CARFX.smoke) {
  if (v.exploded) return null;
  if (v.burning) return C.fire;
  const gone = 1 - clamp(v.hp / v.m.hp, 0, 1);
  let at = null;
  for (const s of C.stages) if (gone >= s.from) at = s;
  return at;
}

// sparks a second off a contact rubbing at `rub` px/step (none under S.from, S.most at most)
export const showerRate = (rub, S = CARFX.scrape) => (rub > S.from ? Math.min(S.most, (rub - S.from) * S.per) : 0);

// How fast two things rub (px/step): what of their relative velocity lies along the contact (n: its normal). Two
// cars going the same way leaning on each other hardly slide, yet their flanks grind: `lean` of the speed they share
// is counted too (cars: both are cars)
export function rubOf(va, vb, n, cars = false, lean = CARFX.scrape.lean) {
  const rx = va.x - vb.x, ry = va.y - vb.y, along = rx * n.x + ry * n.y;
  const slide = Math.hypot(rx - along * n.x, ry - along * n.y);
  if (!cars) return slide;
  const ta = Math.abs(va.x * -n.y + va.y * n.x), tb = Math.abs(vb.x * -n.y + vb.y * n.x);
  return slide + lean * Math.min(ta, tb);
}

// what may be thrown a second at the quality in force: { sparks, burst (the most in one burst), lights, burning }
export function budgetOf(q = quality(), B = CARFX.budget) {
  const k = q.fx ?? 1;
  return { sparks: B.sparks * k, burst: Math.round(B.burst * k), lights: Math.min(B.lights, q.fxLights ?? B.lights), burning: Math.round(B.burning * k) };
}

export default class CarFx {
  constructor(world, cfg = CARFX) {
    this.world = world;
    this.C = cfg;
    this.cars = new Map();   // a car -> what is kept of it (state)
    this.list = null;        // the level's cars (looked up again when the props change: a pursuer joining)
    this.listN = -1;
    this.rubs = new Map();   // a contact that rubs -> { acc, lightT, paintT, soundT, seen }
    this.pieces = [];        // burning pieces: { d (Debris), t (s left), x, y }
    this.puffs = [];         // the billows that are seen: { x, y, vx, vy, t, life, s, tone, c } (render/CarFxArt.js)
    const B = budgetOf(quality(), cfg.budget);
    this.tok = { sparks: B.sparks * 0.5, lights: Math.min(B.lights, Math.max(1, B.lights * 0.15)) }; // what may still go this second
    this.n = 0;              // steps taken
    const on = (name, fn) => world.events?.on(name, fn);
    on('tyres', (e) => this.tyres(e));
    on('carPart', (e) => this.part(e));
    on('carStruck', (e) => this.struck(e));
    on('ride', (e) => this.ride(e));
    // (a toll's crash has the boom's fire-ball instead: TollFx on 'tollCrash'; marked before the event, Pursuit.wreck)
    on('pursuerWreck', ({ car }) => { if (car && !car.exploded && !car.tollCrash) this.boom('engine', this.hood(car), Body.getVelocity(car.body), car); });
    on('pursuerCrash', ({ car, x, y }) => { if (car?.burning && !car.exploded) this.boom('crash', { x, y }, null, car); });
    on('explosion', ({ x, y, source }) => { if (source === 'car') this.boom('car', { x, y }); else if (source === 'fuel') this.pop(x, y); });
    on('carBlast', ({ pieces }) => { for (const d of pieces || []) this.alight(d, rand(2, 4)); });
    // a hydrant torn off: its geyser's mist hangs in the air
    on('propDestroyed', ({ prop, x, y }) => { if (prop?.def?.fountain) world.smoke?.burst('spray', x ?? prop.x, y ?? prop.y, 3); });
  }

  // ---------------------------------------------------------------- the budgets
  // n sparks asked for: how many may go now (the QUALITY's share of them, what is left of this second's budget)
  take(n) {
    const got = Math.min(n, Math.floor(this.tok.sparks));
    this.tok.sparks -= got;
    return got;
  }

  // a burst of n at full quality: its share, never over the budget's `burst`
  share(n) { return Math.min(budgetOf(quality(), this.C.budget).burst, Math.round(n * (quality().fx ?? 1))); }

  // a short point light, if one is left this second (none at QUALITY LOW)
  glow(x, y, r, color, t) {
    if (this.tok.lights < 1) return false;
    this.tok.lights -= 1;
    this.world.light?.(x, y, r, color, t);
    return true;
  }

  // a shower going on at `rate` sparks a s: what is due this step thrown from (x, y) (o: Particles.hot); `at` keeps
  // the fraction owed (at.acc)
  spray(at, rate, dt, x, y, o) {
    at.acc = Math.min(8, (at.acc || 0) + rate * dt * (quality().fx ?? 1));
    const due = Math.floor(at.acc);
    if (due < 1) return 0;
    at.acc -= due;
    const n = this.take(due);
    if (n) this.world.particles.hot?.(x, y, n, o);
    return n;
  }

  // ---------------------------------------------------------------- a step, after the physics
  update(dt) {
    const w = this.world, B = budgetOf(quality(), this.C.budget);
    this.n++;
    this.tok.sparks = Math.min(B.sparks * 0.5, this.tok.sparks + B.sparks * dt);
    this.tok.lights = Math.min(Math.max(1, B.lights * 0.15), this.tok.lights + B.lights * dt);
    if (B.lights <= 0) this.tok.lights = 0;
    if (this.listN !== w.props.length) {
      this.listN = w.props.length;
      this.list = w.props.filter((p) => p.isVehicle);
      for (const v of this.cars.keys()) if (!this.list.includes(v)) this.cars.delete(v); // (a car gone from the world)
    }
    for (const v of this.list) this.car(v, dt);
    this.contacts(dt);
    this.burn(dt);
    this.billow(dt);
  }

  // ---------------------------------------------------------------- the billows that are seen
  // one billow of `tone` at (x, y), thrown by what moves at (vx, vy) px/s: s px across, for `life` s
  puff(tone, x, y, vx, vy, s, life) {
    const U = this.C.puffs, L = this.puffs;
    if (L.length >= Math.round(U.most * (quality().fx ?? 1))) L.shift();
    L.push({ x, y, vx: vx * U.carry + rand(-U.drift, U.drift), vy: vy * U.carry + rand(-U.drift, U.drift), t: 0, life, s, tone, c: Math.floor(rand(0, 3)) });
  }

  // `n` of them due (a fraction: one more with that chance) of a [tone, .., .., px from, to, s from, to] entry,
  // strung from (x0, y0) to (x1, y1)
  string(n, E, x0, y0, x1, y1, vx, vy, spread = 3) {
    const k = quality().fx ?? 1;
    for (let m = Math.floor(n * k) + (chance((n * k) % 1) ? 1 : 0); m > 0; m--) {
      const u = Math.random();
      this.puff(E[0], x0 + (x1 - x0) * u + rand(-spread, spread), y0 + (y1 - y0) * u + rand(-spread, spread), vx, vy, rand(E[3], E[4]), rand(E[5], E[6]));
    }
  }

  // they ride the air (the modelled flow where they are), slow down, age; those left behind the stepped air go
  billow(dt) {
    const L = this.puffs;
    if (!L.length) return;
    const U = this.C.puffs, S = this.world.smoke, F = S?.fluid, damp = Math.max(0, 1 - U.drag * dt), o = this.tmp || (this.tmp = { x: 0, y: 0 });
    let n = 0;
    for (const p of L) {
      p.t += dt;
      if (p.t >= p.life || (S && !S.within(p.x, p.y, 40))) continue;
      if (F) { F.velocityAt(p.x, p.y, o); p.x += o.x * U.ride * dt; p.y += o.y * U.ride * dt; }
      p.x += (p.vx + U.lift[0]) * dt; p.y += (p.vy + U.lift[1]) * dt;
      p.vx *= damp; p.vy *= damp;
      L[n++] = p;
    }
    L.length = n;
  }

  state(v) {
    let s = this.cars.get(v);
    if (!s) this.cars.set(v, (s = { hx: null, hy: 0, sp: 0, curlT: 0, curlS: 1, exT: 0, scores: 0, rimT: 0, slide: { acc: 0 }, rims: [{ acc: 0 }, { acc: 0 }, { acc: 0 }, { acc: 0 }] }));
    return s;
  }

  // the middle of its engine bay, in the world
  hood(v) { return v.toWorld((v.m.hood[0] + v.m.hood[1]) / 2, v.h / 2); }

  // one car: its engine's smoke, its exhausts, a bare rim on the road, a wreck sliding
  car(v, dt) {
    const w = this.world, C = this.C, st = this.state(v), vel = Body.getVelocity(v.body), sp = Math.hypot(vel.x, vel.y);
    const stage = smokeStage(v, C.smoke), near = !w.smoke || w.smoke.within(v.x, v.y, 200);
    if (stage && near) this.plume(v, st, stage, vel, sp, dt);
    else st.hx = null;
    if (near && sp > 0.5) {
      // the exhausts, as it gains speed hard
      const E = C.exhaust, gain = (sp - st.sp) / dt;
      if (v.moving && !v.exploded && gain > E.from && (st.exT -= dt) <= 0) {
        st.exT = E.every;
        for (const [sx, sy] of v.m.pipes || [[1, v.h * E.at], [1, v.h * (1 - E.at)]]) {
          const q = v.toWorld(sx, sy);
          w.smoke?.burst('exhaust', q.x, q.y, E.scale);
          this.puff(E.puff[0], q.x, q.y, vel.x * 60, vel.y * 60, rand(E.puff[1], E.puff[2]), rand(E.puff[3], E.puff[4]));
        }
      }
      // a bare rim on the asphalt
      const R = C.tyres.rim;
      if (sp > R.from && !v.exploded && v.tires.includes(false)) {
        const rate = Math.min(R.most, (sp - R.from) * R.per);
        v.tires.forEach((whole, i) => {
          if (whole) return;
          const q = v.toWorld(...v.m.wheels[i]);
          this.spray(st.rims[i], rate, dt, q.x, q.y, this.thrown(vel, ZERO, C.scrape));
        });
        if ((st.rimT -= dt) <= 0) { st.rimT = R.sound; w.sound?.('rimGrind', v.x, v.y, clamp(sp / C.scrape.sound.full, 0.2, 1) * C.scrape.sound.vol); }
      }
      // a wreck going on its own way: sparks from under it
      const L = C.scrape.slide;
      if (sp > L.from && (v.exploded || v.pursuer?.state === 'wrecked')) {
        const q = v.toWorld(rand(0.15, 0.9) * v.w, rand(0.1, 0.9) * v.h);
        this.spray(st.slide, Math.min(L.most, (sp - L.from) * L.per), dt, q.x, q.y, this.thrown(vel, ZERO, C.scrape));
      }
    }
    st.sp = sp;
  }

  // its engine's smoke at this stage, laid from where the hood was a step ago to where it is; the flames licking out
  // of it (a car on fire); the eddies it leaves behind its tail
  plume(v, st, stage, vel, sp, dt) {
    const w = this.world, S = this.C.smoke, h = this.hood(v);
    let fx = st.hx ?? h.x, fy = st.hy ?? h.y, dist = st.hx === null ? 0 : Math.hypot(h.x - fx, h.y - fy);
    if (dist > JUMP) { fx = h.x; fy = h.y; dist = 0; }
    st.hx = h.x; st.hy = h.y;
    if (w.smoke) {
      for (const [kind, rate, trail] of stage.lay) w.smoke.lay(kind, fx, fy, h.x, h.y, stage.r, rate * dt + trail * dist, stage.cap, stage.jitter, S.most);
      if (stage.swell && sp < 1) w.smoke.emit(stage.lay[0][0], h.x, h.y, 0, dt, stage.r, stage.cap, stage.swell);
      const K = S.curl;
      if (sp > K.from && (st.curlT -= dt) <= 0) {
        st.curlT = K.every;
        st.curlS = -st.curlS;
        const tail = v.toWorld(-K.r * 0.4, v.h / 2 + st.curlS * v.h * 0.3);
        w.smoke.curl(tail.x, tail.y, K.r, st.curlS * K.omega, K.vmax, K.k);
      }
    }
    const P = w.particles, vx = vel.x * 60, vy = vel.y * 60, E = stage.puff;
    if (E) this.string(E[1] * dt + E[2] * dist, E, fx, fy, h.x, h.y, vx, vy, stage.r * 0.5);
    if (stage.flames && chance(stage.flames[0])) {
      const k = stage.carry;
      P.fire?.(h.x + rand(-9, 9), h.y + rand(-9, 9), stage.flames[1], stage.flames[2], { size: [3, 7], life: [0.14, 0.4], vx: vx * k, vy: vy * k });
      if (chance(0.5)) this.glow(h.x, h.y, stage.light[0] + rand(0, 18), stage.light[1], stage.light[2]);
    }
  }

  // how sparks leave a contact (Particles.hot): torn off what moves at va (px/step) against what moves at vb, they
  // keep S.carry of the way between the two, kicked any way, thrown up
  thrown(va, vb, S, a) {
    const k = rand(...S.carry);
    return { vx: (vb.x + (va.x - vb.x) * k) * 60, vy: (vb.y + (va.y - vb.y) * k) * 60, kick: S.kick, up: S.up, hops: S.hops, mark: S.mark, life: S.life, a, spread: 1.1 };
  }

  // ---------------------------------------------------------------- what rubs
  // every contact of a car that slides along a wall, a thing that does not give, or another car: its shower for as
  // long as it lasts, sized by how fast they rub; and his car held off the building fronts (Drive `grind`)
  contacts(dt) {
    const w = this.world, S = this.C.scrape;
    for (const pair of w.physics?.activePairs?.() || []) {
      if (pair.isSensor && !pair.flank) continue; // (a car scraped along in a bend: Drive.flankOn, never resolved)
      const A = pair.bodyA.parent || pair.bodyA, B = pair.bodyB.parent || pair.bodyB;
      const ea = A.entity, eb = B.entity, ca = !!ea?.isVehicle, cb = !!eb?.isVehicle;
      if (!ca && !cb) continue;
      const other = ca ? B : A, eo = ca ? eb : ea;
      if (!(ca && cb)) {
        // against what does not give: a wall, a bolted or lasting thing still standing
        if (!other.isStatic || other.isSensor || eo?.def?.hung || eo?.dead || eo?.dying || eo?.isPlayer || eo?.isEnemy || eo?.isCivilian) continue;
      }
      const va = A.isStatic ? ZERO : Body.getVelocity(A), vb = B.isStatic ? ZERO : Body.getVelocity(B);
      const rub = rubOf(va, vb, pair.collision.normal, ca && cb, S.lean), rate = showerRate(rub, S);
      if (!rate) continue;
      const sup = pair.collision.supports, c = sup?.[pair.collision.supportCount > 1 && chance(0.5) ? 1 : 0];
      if (!c) continue;
      // (thrown back along the way the faster of the two slides)
      const fast = va.x * va.x + va.y * va.y >= vb.x * vb.x + vb.y * vb.y, hi = fast ? va : vb, lo = fast ? vb : va;
      this.rub(pair.id ?? pair, rub, rate, dt, c.x, c.y, hi, lo, [ca ? ea : null, cb ? eb : null]);
    }
    const d = w.drive;
    if (d?.on && !d.dead && d.grind && d.v > S.from) {
      const vel = Body.getVelocity(d.van.body);
      this.rub('fronts', d.v, showerRate(d.v, S), dt, d.grind.x + rand(-0.4, 0.4) * d.van.w, d.grind.y, vel, ZERO, [d.van]);
    }
    for (const [key, r] of this.rubs) if (r.seen !== this.n) this.rubs.delete(key);
  }

  // one contact rubbing this step at (x, y): sparks, a light, the paint scored on the cars in it, its grind
  rub(key, rub, rate, dt, x, y, hi, lo, cars) {
    const w = this.world, S = this.C.scrape;
    let r = this.rubs.get(key);
    if (!r) this.rubs.set(key, (r = { acc: 0, lightT: 0, paintT: 0, soundT: 0, seen: 0 }));
    r.seen = this.n;
    const back = Math.atan2(lo.y - hi.y, lo.x - hi.x), full = clamp(rub / S.sound.full, 0, 1);
    this.spray(r, rate, dt, x, y, this.thrown(hi, lo, S, back));
    if ((r.lightT -= dt) <= 0 && this.glow(x, y, S.light.r[0] + (S.light.r[1] - S.light.r[0]) * full, S.light.color, S.light.t)) r.lightT = S.light.every;
    if ((r.paintT -= dt) <= 0) {
      r.paintT = S.paint.every;
      for (const v of cars) {
        const st = v && this.state(v);
        if (!v || v.exploded || st.scores >= S.paint.most || !v.scar) continue;
        st.scores++;
        const q = v.toSprite(x, y);
        v.scar(clamp(q.sx, 2, v.w - 2), clamp(q.sy, 2, v.h - 2), back - v.body.angle - Math.PI / 2, 'cut');
      }
    }
    // (his own car's grind is the drive's: systems/Drive.js scrape)
    const his = w.drive?.on ? w.drive.van : null;
    if ((r.soundT -= dt) <= 0 && !(his && cars.includes(his))) {
      r.soundT = S.sound.every;
      w.sound?.('carGrind', x, y, Math.max(0.25, full) * S.sound.vol); // placeholder (assets/sound/PLACEHOLDERS.md)
    }
  }

  // ---------------------------------------------------------------- the world's events
  // tyres letting go at the points `at` of `car`, k 0..1 of it: rubber smoke in the air
  tyres({ car, at, k = 1, dt = FIXED_DT }) {
    const w = this.world, T = this.C.tyres;
    if (!w.smoke || !car || !at) return;
    // (told once a step: dt the step's, slowed down with the world; sp: px it covers in it)
    const vel = Body.getVelocity(car.body), sp = Math.hypot(vel.x, vel.y) * dt / FIXED_DT, E = T.puff;
    const hx = Math.cos(car.body.angle), hy = Math.sin(car.body.angle);
    for (const q of at) {
      for (const [kind, rate, trail] of T.lay) w.smoke.lay(kind, q.x, q.y, q.x, q.y, T.r, (rate * dt + trail * sp) * k, T.cap, 0.4);
      if ((q.x - car.x) * hx + (q.y - car.y) * hy < 0) this.string((E[1] * dt + E[2] * sp) * k, E, q.x, q.y, q.x - vel.x, q.y - vel.y, vel.x * 60, vel.y * 60);
    }
  }

  // a window or a tyre of a car taken
  part({ car: v, part, i, dirA = 0 }) {
    const w = this.world, C = this.C, vel = Body.getVelocity(v.body);
    if (part === 'tyre') {
      const q = v.toWorld(...v.m.wheels[i]);
      w.smoke?.burst('tyre', q.x, q.y, C.tyres.pop.scale);
      w.particles.hot?.(q.x, q.y, this.take(this.share(10)), this.thrown(vel, ZERO, C.scrape));
      return;
    }
    const r = v.m[part], state = v.windows?.[part];
    if (!r || !(state >= 1 && state <= 2)) return;
    const q = v.toWorld((r[0] + r[1]) / 2, (r[2] + r[3]) / 2), G = C.glass;
    w.particles.glass?.(q.x, q.y, dirA, 1.1, this.share(G.more[state - 1]), G.speed);
    if (state === 2) this.glow(q.x, q.y, G.light[0], G.light[1], G.light[2]);
  }

  // a round in a body panel: hot sparks back off the metal, a glint
  struck({ car: v, x, y, dirA }) {
    const R = this.C.rounds, vel = Body.getVelocity(v.body);
    this.world.particles.hot?.(x, y, this.take(this.share(R.sparks)), { vx: vel.x * 60 * 0.8, vy: vel.y * 60 * 0.8, a: dirA + Math.PI, spread: 1, kick: R.kick, up: R.up, hops: R.hops, mark: R.mark, life: R.life });
    this.glow(x, y, R.light[0], R.light[1], R.light[2]);
  }

  // a hard knock on the car he drives: steam out of its grille; the crash that kills him: all of it
  ride({ beat }) {
    const w = this.world, v = w.drive?.van, K = this.C.knock[beat];
    if (!K || !v || !w.smoke) return;
    const nose = v.toWorld(v.w - 6, v.h / 2);
    if (beat !== 'crash') { w.smoke.burst(K[0], nose.x, nose.y, K[1]); return; }
    w.smoke.burst('douse', nose.x, nose.y, K.steam);
    w.smoke.burst('wall', nose.x, nose.y, K.smoke);
    w.particles.hot?.(nose.x, nose.y, this.share(K.sparks), { kick: 260, up: [60, 240], hops: 2, mark: 0.4, life: [0.3, 0.9] });
  }

  // ---------------------------------------------------------------- boom
  // the fire-ball `name` (C.boom) at `at`, carried along with what blew (vel: px/step) for a moment; car: the wreck
  // its later pops come from. Looks only
  boom(name, at, vel = null, car = null) {
    const K = this.C.boom[name], w = this.world, P = w.particles, R = K.R, { x, y } = at;
    const vx = (vel?.x || 0) * 60 * K.carry, vy = (vel?.y || 0) * 60 * K.carry, later = (t, fn) => (w.after ? w.after(t, fn) : fn());
    if (K.flash) this.glow(x, y, R * K.flash, '#ffd9a0', K.flashT);
    if (K.front) w.rings?.push({ x, y, r: 6, max: R * K.front, t: 0, dur: 0.3, blast: true });
    const core = this.share(K.core[0]), hot = Math.round(core / 3);
    P.fire?.(x, y, hot, R * K.core[1] * 0.6, { size: [K.core[2], K.core[3]], life: [0.2, 0.45], heat: 0, rise: 24, vx, vy });
    P.fire?.(x, y, core - hot, R * K.core[1], { size: [K.core[2], K.core[3]], life: [0.25, 0.6], heat: -0.1, rise: 24, vx, vy });
    P.hot?.(x, y, this.share(K.sparks), { vx, vy, kick: R * 5, up: [60, 280], hops: 2, mark: 0.4, life: [0.3, 0.9] });
    P.embers?.(x, y, this.share(K.embers), 240);
    P.glass?.(x, y, 0, Math.PI, this.share(K.glass), 240);
    // the orange balls thrown off its heart a moment later
    later(K.lobesT, () => {
      const a0 = rand(0, 6.28), cx = x + vx * K.lobesT, cy = y + vy * K.lobesT;
      for (let i = 0; i < K.lobes; i++) {
        const a = a0 + (i / K.lobes) * 6.28 + rand(-0.4, 0.4), d = R * rand(0.25, 0.5);
        P.fire?.(cx + Math.cos(a) * d, cy + Math.sin(a) * d, this.share(K.lobe[0]), R * K.lobe[1], { size: [4, 10], life: [0.3, 0.7], heat: -0.06, rise: 30, vx, vy });
      }
    });
    // its soot goes into the air, and rolls up
    later(K.sootT, () => {
      const cx = x + vx * K.sootT, cy = y + vy * K.sootT;
      w.smoke?.blast(cx, cy, R * K.soot);
      for (let i = this.share(K.puffs); i > 0; i--) {
        const a = rand(0, 6.28), d = R * 0.45 * Math.sqrt(Math.random()), v = rand(60, 200);
        this.puff('black', cx + Math.cos(a) * d, cy + Math.sin(a) * d, vx + Math.cos(a) * v, vy + Math.sin(a) * v, rand(R * 0.14, R * 0.3), rand(0.9, 1.9));
      }
    });
    // burning pieces down the road, flames left on it, the pops that follow
    const [n, v0, v1, t0, t1] = K.debris;
    for (let i = 0, m = Math.round(n * (quality().fx ?? 1)); i < m; i++) {
      const a = rand(0, 6.28), s = rand(v0, v1) / 60;
      this.piece(x, y, (vel?.x || 0) * K.carry + Math.cos(a) * s, (vel?.y || 0) * K.carry + Math.sin(a) * s, rand(t0, t1), chance(K.tyre));
    }
    for (let i = 0; i < K.pool[0]; i++) {
      const a = rand(0, 6.28), d = R * K.pool[1] * Math.sqrt(Math.random());
      this.spot(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(K.pool[2], K.pool[3]));
    }
    for (let i = 0; i < K.pops[0]; i++) {
      later(rand(K.pops[1], K.pops[2]), () => {
        const q = car ? car.toWorld(rand(0.2, 0.9) * car.w, rand(0.2, 0.8) * car.h) : { x: x + rand(-R, R) * 0.4, y: y + rand(-R, R) * 0.4 };
        this.pop(q.x, q.y, car && Body.getVelocity(car.body));
      });
    }
    if (K.shake) w.shake?.(K.shake);
  }

  // a secondary pop: a small ball of fire, sparks, a light, a lump of soot
  pop(x, y, vel = null) {
    const K = this.C.pop, w = this.world, vx = (vel?.x || 0) * 60 * 0.6, vy = (vel?.y || 0) * 60 * 0.6;
    w.particles.fire?.(x, y, this.share(K.flames[0]), K.flames[1], { size: [3, 9], life: [0.2, 0.5], heat: 0, vx, vy });
    w.particles.hot?.(x, y, this.share(K.sparks), { vx, vy, kick: 230, up: [60, 220], hops: 2, mark: 0.4, life: [0.25, 0.7] });
    this.glow(x, y, K.light[0], K.light[1], K.light[2]);
    w.smoke?.lay('soot', x, y, x, y, K.r, K.soot, 2, 0.5);
    w.sound?.('carPop', x, y, 0.8); // placeholder (assets/sound/PLACEHOLDERS.md)
    w.shake?.(K.shake);
  }

  // flames on one spot of the road for `dur` s, dying down, their soot in the air
  spot(x, y, dur) {
    const w = this.world;
    w.emit?.(x, y, dur, (e, dt) => {
      const k = e.t / dur;
      if (chance(0.3 + 0.5 * k)) w.particles.fire?.(x + rand(-3, 3), y + rand(-2, 2), 1, 12, { size: [2, 3 + 4 * k], life: [0.2, 0.5], rise: 50 });
      w.smoke?.burn(x, y, 'spot', dt);
    });
  }

  // a burning piece thrown from (x, y) at (vx, vy) px/step, alight for `life` s: a tyre or a bit of metal, bouncing
  // and rolling; it meets walls only
  piece(x, y, vx, vy, life, tyre = false) {
    const w = this.world, K = this.C.piece;
    if (this.pieces.length >= budgetOf(quality(), this.C.budget).burning || !w.addDebris) return null;
    const img = tyre ? spriteOpt('props/car_tire') || chunk('#141418', 20, 7) : chunk(chance(0.5) ? '#2a2a33' : '#1a1418', Math.floor(rand(4, 9)), Math.floor(rand(3, 6)));
    const d = new Debris(w, img, x, y, rand(0, 6.28), vx * 60, vy * 60, rand(-0.6, 0.6),
      { mask: SOLID, material: tyre ? 'rubber' : 'metal', kg: K.kg, mu: tyre ? 0.12 : 0.4, air: 0.03, bounce: K.bounce, z: K.z, vz: rand(...K.up) });
    w.addDebris(d);
    return this.alight(d, life);
  }

  // a loose piece set alight for `life` s (a blown car's own tyres: Vehicle.explode)
  alight(d, life) {
    if (!d || this.pieces.length >= budgetOf(quality(), this.C.budget).burning) return null;
    const p = d.body.position, it = { d, t: life, x: p.x, y: p.y };
    this.pieces.push(it);
    return it;
  }

  // the burning pieces, a step: flames and a thread of soot along their way while they move, a little light
  burn(dt) {
    if (!this.pieces.length) return;
    const w = this.world, K = this.C.piece;
    for (const it of this.pieces) {
      const d = it.d, p = d.body.position;
      it.t -= dt;
      if (d.dead || it.t <= 0) { it.t = 0; continue; }
      const moved = Math.hypot(p.x - it.x, p.y - it.y), h = d.z || 0;
      if (moved < JUMP) {
        w.particles.fire?.(p.x, p.y, K.flames[0], K.flames[1], { size: [2, 5], life: [0.15, 0.4], h, rise: 30 });
        if (moved > K.from) w.smoke?.lay('soot', it.x, it.y, p.x, p.y, K.soot[1], K.soot[0] * moved, 0.9, 0.3, 3);
        if (chance(K.light[3])) this.glow(p.x, p.y, K.light[0], K.light[1], K.light[2]);
      }
      it.x = p.x; it.y = p.y;
    }
    this.pieces = this.pieces.filter((it) => it.t > 0);
  }
}
