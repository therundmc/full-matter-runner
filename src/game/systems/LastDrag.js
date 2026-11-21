// How level 2A opens, the first time only (the level's `chase.intro: 'drag'`; numbers: CHASE.intro in data/chase.js).
// The car stands in its lane in the dark, engine and lamps off. He has the end of a cigarette in the door's hand: a
// last long drag (its ember flares and lights the cab), the smoke let out, then the butt flicked out over the door:
// it turns in the air, lands on the road, bounces twice in a few sparks and lies there, its end still glowing a
// while. Then the engine (systems/Drive.js launch) and the gun off the passenger seat (Drive.grab).
// The camera's point (`shot`, SHOTS `drag`): from the hood onto him, after the butt out onto the road, back on him
// in one cut as the engine starts.
// What draws it: CharacterAnim dragPose (his hand, the cigarette in it: `riding.drag`), render/DragArt.js (the butt
// in the air and its ember on the road). The butt is no body: nothing meets it.
// DOM-free but for the butt left on the road (painted through the world's decals).
import { CHASE } from '../data/chase.js';
import { clamp, rand, smooth } from '../../engine/math.js';
import { spriteOpt, drawSprite } from '../../engine/Assets.js';


// ---------------------------------------------------------------- pure
// The beat t s in: { mouth: 0..1 the hand at his mouth, flare: 0..1 the ember in the drag, breath: he lets the smoke
// out, flick: 0..1 the arm snapped out, held: the cigarette still in his fingers, done: the engine }
export function dragPhases(t, I = CHASE.intro, out = {}) {
  const span = (a, b) => smooth((t - a) / (b - a));
  out.mouth = span(...I.lift) * (1 - span(...I.lower));
  out.flare = t > I.drag[0] && t < I.drag[1] ? Math.sin((Math.PI * (t - I.drag[0])) / (I.drag[1] - I.drag[0])) : 0;
  out.breath = t >= I.breath[0] && t < I.breath[1];
  out.flick = clamp((t - (I.flick - I.snap)) / I.snap, 0, 1);
  out.held = t < I.flick;
  out.done = t >= I.go;
  return out;
}

// The butt a step later: b = { x, y, z (px off the road), vx, vy, vz (px/s), a, spin (rad/s), n (bounces done),
// rest }. Returns 'bounce' when it meets the road and goes up again, 'rest' when it lies there, else null
export function buttStep(b, dt, B = CHASE.intro.butt) {
  if (b.rest) return null;
  b.vz -= B.g * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.a += b.spin * dt;
  if (b.z > 0) return null;
  b.z = 0;
  if (b.n >= B.bounces) { b.rest = true; b.vx = b.vy = b.vz = 0; return 'rest'; }
  b.n++;
  b.vz = -b.vz * B.lift;
  b.vx *= B.keep; b.vy *= B.keep; b.spin *= -B.keep;
  return 'bounce';
}

export default class LastDrag {
  // van: his car; seat: his seat in it (sprite px)
  constructor(world, van, seat, cfg = CHASE.intro) {
    this.world = world;
    this.van = van;
    this.seat = seat;
    this.I = cfg;
    this.t = 0;
    this.on = true;       // the beat is playing: the car stands, nothing is his yet
    this.gone = false;    // nothing of it left (the ember out): Drive lets go of it
    this.butt = null;     // the butt once flicked (buttStep), glow: s its end still glows
    this.ph = dragPhases(0, cfg);
    this.at = this.local(cfg.hood, 0); // the camera's point
    this.emberT = 0;
    this.puffs = 0;       // the smoke owed (a share of a puff)
    this.smoke = [];      // what he breathes out: { x, y, vx, vy, t, life, k (its size's share) }
    this.wispT = 0;
    this.said = new Set(); // the sounds played
  }

  // a point [ahead, across] px from his seat, in the world
  local(ahead, across) {
    const v = this.van, a = v.body.angle, c = Math.cos(a), s = Math.sin(a), o = v.toWorld(this.seat[0], this.seat[1]);
    return { x: o.x + ahead * c - across * s, y: o.y + ahead * s + across * c };
  }

  // where the cigarette's end is (the light's place): between out over the door and his mouth
  tip() {
    const T = this.I.tip, k = this.ph.mouth;
    return this.local(T.out[0] + (T.mouth[0] - T.out[0]) * k, T.out[1] + (T.mouth[1] - T.out[1]) * k);
  }

  once(name, x, y, vol) {
    if (this.said.has(name)) return;
    this.said.add(name);
    this.world.sound?.(name, x, y, vol); // placeholders (assets/sound/PLACEHOLDERS.md)
  }

  step(dt) {
    const I = this.I, w = this.world, rider = this.van.rider;
    this.t += dt;
    const ph = dragPhases(this.t, I, this.ph), t = this.t;
    if (this.on) {
      if (rider?.riding) rider.riding.drag = ph;
      const tip = this.tip();
      if (t >= I.drag[0]) this.once('cigDrag', tip.x, tip.y, 0.7);
      // the ember's light in the cab, swelling with the drag
      if (ph.held && (this.emberT -= dt) <= 0) {
        const E = I.ember, k = ph.flare, f = 1 - E.flicker * Math.random();
        this.emberT = E.every;
        w.light?.(tip.x, tip.y, (E.rest[0] + (E.flare[0] - E.rest[0]) * k) * f, k > 0.5 ? E.flare[1] : E.rest[1], E.life);
      }
      // the smoke let out: ahead of his face, thinning as it goes
      if (ph.breath) {
        this.puffs += I.puffs * dt;
        const u = (t - I.breath[0]) / (I.breath[1] - I.breath[0]);
        while (this.puffs >= 1) {
          this.puffs--;
          const q = this.local(I.hand.mouth[0] + 3, I.hand.mouth[1] - 1), v = this.local(I.drift[0] * rand(1, 1.5), I.drift[1] * rand(0.7, 1.5) + rand(-6, 6)), o = this.local(0, 0);
          this.smoke.push({ x: q.x, y: q.y, vx: (v.x - o.x) * (1.2 - 0.5 * u), vy: (v.y - o.y) * (1.2 - 0.5 * u), t: 0, life: rand(...I.life), k: rand(0.6, 1) });
        }
      }
      if (!ph.held && !this.butt) this.flick();
      // the camera's point: the hood, then him, then the butt
      const him = this.local(0, 0), to = t < I.pan ? this.at : this.butt ? this.butt : him, k = 1 - Math.exp(-I.follow * dt);
      this.at.x += (to.x - this.at.x) * k; // (one point, moved in place: drawn between two steps, World.movesOwn)
      this.at.y += (to.y - this.at.y) * k;
      if (ph.done) this.end();
    }
    this.fly(dt);
    // his smoke drifting off, slowing
    const slow = Math.exp(-I.slow * dt);
    for (const q of this.smoke) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= slow; q.vy *= slow; }
    if (this.smoke.length && this.smoke.some((q) => q.t >= q.life)) this.smoke = this.smoke.filter((q) => q.t < q.life);
    if (!this.on && !this.butt && !this.smoke.length) this.gone = true; // (skipped before the flick)
  }

  // the butt leaves his fingers: out to his left and a little ahead, turning
  flick() {
    const B = this.I.butt, T = this.I.tip, at = this.local(T.out[0], T.out[1]), a = this.van.body.angle, c = Math.cos(a), s = Math.sin(a);
    this.butt = { x: at.x, y: at.y, z: B.z, vx: B.fwd * c + B.out * s, vy: B.fwd * s - B.out * c, vz: B.up, a: a - Math.PI / 2, spin: B.spin, n: 0, rest: false, glow: B.glow };
    this.once('cigFlick', at.x, at.y, 0.6);
  }

  // the butt in the air, on the road, its end going out
  fly(dt) {
    const b = this.butt, B = this.I.butt, w = this.world;
    if (!b) return;
    const hit = buttStep(b, dt, B);
    if (hit) {
      w.particles?.sparks(b.x, b.y, Math.atan2(b.vy, b.vx), 1.6, Math.max(1, B.sparks[0] - B.sparks[1] * (b.n - 1)), B.sparks[2], '#ffb060');
      w.light?.(b.x, b.y, B.flash[0], '#ffb060', B.flash[1]);
      w.sound?.('buttHit', b.x, b.y, hit === 'rest' ? 0.3 : 0.5);
    }
    if (hit === 'rest') {
      // it stays on the road
      const img = spriteOpt('items/cig_butt');
      if (img) w.decals?.paint?.((g) => drawSprite(g, img, b.x, b.y, b.a), 'floor', b.x - 6, b.x + 6);
    }
    if (!b.rest) return;
    b.glow -= dt;
    // its end lights a little of the road, breathing, dying away
    if (b.glow > 0 && (this.emberT -= dt) <= 0) {
      this.emberT = this.I.ember.every;
      w.light?.(b.x, b.y, B.lamp[0] * (0.75 + 0.25 * Math.sin(this.t * 5.3)) * Math.sqrt(b.glow / B.glow), B.lamp[1], this.I.ember.life);
    }
    if ((this.wispT -= dt) <= 0 && b.glow > 0) {
      this.wispT = B.wisp;
      w.particles?.smoke(b.x, b.y, 1, 0.5, { speed: 6, size: 2.5, life: 1.2 });
    }
    if (b.glow <= 0 && !this.on && !this.smoke.length) this.gone = true;

  }

  // the beat is over: the hand is his (Drive: the engine, then the gun)
  end() {
    this.on = false;
    const rider = this.van.rider;
    if (rider?.riding) rider.riding.drag = null;
    if (!this.butt && !this.smoke.length) this.gone = true;
  }

  // SPACE / pad A held: straight to the engine (a butt already in the air goes on by itself)
  skip() {
    if (!this.on) return;
    this.t = Math.max(this.t, this.I.go);
    this.end();
  }

  // the camera's shot (Game.stagedShot; SHOTS `drag`)
  shot() { return this.on ? { name: this.butt ? 'butt' : 'drag', at: this.at } : null; }
}
