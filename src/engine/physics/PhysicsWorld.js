// Wrapper around a Matter engine: fixed sub-stepping, floor friction, collision dispatch and impact events.
//
// Events emitted on the bus:
//   'impact' { a, b, speed, x, y }  first contact of two bodies, speed = closing speed along the normal (px/step)
// Entities attached as body.entity also receive entity.onCollide(otherBody, pair).
import { G } from './Units.js';
import { groundFriction } from './Friction.js';
import { kgOf, freeze } from './Body.js';

const { Engine, Events, Composite, Body } = Matter;

export default class PhysicsWorld {
  // muAt(x, y): floor grip multiplier; pushForce: N a character can push with
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
    groundFriction(this.bodies(), dt, this.time, this.muAt);
    this.stepMs = performance.now() - t0;
  }

  // force (N) needed to get a resting body sliding
  breakaway(body) {
    return (body.mu ?? 0.6) * this.muAt(body.position.x, body.position.y) * kgOf(body) * G;
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
      if (!this.events) continue;
      const va = Body.getVelocity(a), vb = Body.getVelocity(b);
      const n = pair.collision.normal;
      const speed = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
      const c = pair.collision.supports[0] || a.position;
      this.events.emit('impact', { a, b, speed, x: c.x, y: c.y });
    }
  }
}
