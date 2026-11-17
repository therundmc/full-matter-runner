// Wrapper around a Matter engine: fixed sub-stepping, floor friction, collision dispatch and impact events.
//
// Events emitted on the bus:
//   'impact' { a, b, speed, x, y }  first contact of two bodies, speed = closing speed along the normal (px/step);
//                                   a push (Push.js) takes the speed out of a contact before the step: it reports
//                                   the bump itself (`bump`), and Matter's own start of that contact is not told twice
// Entities attached as body.entity also receive entity.onCollide(otherBody, pair).
import { G } from './Units.js';
import { groundFriction, STICK } from './Friction.js';
import { kgOf, freeze } from './Body.js';

const { Engine, Events, Composite, Body } = Matter;

const BUMPED = 0.3; // s a bump reported by a push (bump) stands for the contact Matter then starts
const pushed = (b, by, time) => b.bumped?.by === by && time - b.bumped.t < BUMPED;

export default class PhysicsWorld {
  // muAt(x, y, body): floor grip multiplier (for that body's feet); pushForce: N a character can push with
  constructor({ events, muAt = () => 1, pushForce = 520, substeps = 2 } = {}) {
    this.events = events;
    this.muAt = muAt;
    this.pushForce = pushForce;
    this.substeps = substeps;
    this.time = 0;
    this.stepMs = 0;
    this.engine = Engine.create({ enableSleeping: true });
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    this.engine.gravity.scale = 0;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    Events.on(this.engine, 'collisionStart', (e) => this.onCollisionStart(e));
  }

  get world() { return this.engine.world; }
  add(b) { Composite.add(this.engine.world, b); }
  remove(b) { Composite.remove(this.engine.world, b); }
  bodies() { return Composite.allBodies(this.engine.world); }
  activePairs() { return this.engine.pairs.list.filter((p) => p.isActive); }

  // dt: seconds of game time; time: current game clock (used for "airborne until" checks)
  step(dt, time = this.time + dt) {
    const t0 = performance.now();
    this.time = time;
    const sub = dt / this.substeps;
    for (let i = 0; i < this.substeps; i++) Engine.update(this.engine, sub * 1000);
    const bodies = this.bodies();
    groundFriction(bodies, dt, this.time, this.muAt);
    for (const b of bodies) if (b.knock) b.knock = null; // a frozen body's knocks only add up within a step
    this.stepMs = performance.now() - t0;
  }

  // force (N) needed to get a resting body sliding: static friction
  breakaway(body) {
    return (body.stick ?? STICK) * (body.mu ?? 0.6) * this.muAt(body.position.x, body.position.y, body) * kgOf(body) * G;
  }

  // a pusher meeting b at `speed` px/step, found before the step (its push will take that speed out of the contact)
  bump(pusher, b, speed, x, y) {
    b.bumped = { by: pusher, t: this.time };
    this.events?.emit('impact', { a: pusher, b, speed, x, y });
  }

  // too heavy for a person: static while at rest, woken by big impulses only
  freezeIfHeavy(body) {
    if (this.breakaway(body) > this.pushForce) freeze(body);
  }

  onCollisionStart(e) {
    for (const pair of e.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      a.entity?.onCollide?.(b, pair);
      b.entity?.onCollide?.(a, pair);
      if (!this.events || pushed(a, b, this.time) || pushed(b, a, this.time)) continue;
      const va = Body.getVelocity(a), vb = Body.getVelocity(b);
      const n = pair.collision.normal;
      const speed = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
      const c = pair.collision.supports[0] || a.position;
      this.events.emit('impact', { a, b, speed, x: c.x, y: c.y });
    }
  }
}
