// Street life for levels with an `ambient` field: through-traffic on the lanes and passers-by on the walker
// paths, alive from the first frame (pre-warmed). Owned by World, stepped with the intentions (before physics).
//
// level.ambient = {
//   seed?: number,                                             // optional, else derived from the level name
//   traffic: [{ row, dir, speed, gap: [min, max], models }],  // row in tiles, speed tiles/s, gap s
//   walkers: [{ path: [[col, row], ...], gap: [min, max], max }],
// }
//
// Traffic vehicles are ordinary Vehicles (same wrecking, lights, explosion) driven by a Driver brain
// (systems/Traffic.js); once disabled they coast to a stop and stay as parked wrecks. Passers-by are
// Civilians with a Walker brain (ai/Civilians.js). Rules and numbers: Config AMBIENT.
// Events emitted: 'trafficSpawn' { vehicle }, 'trafficStopped' { vehicle, reason }, 'runOver' { victim, vehicle, speed },
// 'civilianPanic' { civilian, x, y, kind }. Listens to 'noise' (gunshots, explosions) and 'kill'.
import { TILE, CAT, MASK, AMBIENT as A } from '../Config.js';
import { angDiff } from '../../engine/math.js';
import { wake, impulse, kgOf } from '../../engine/physics/Body.js';
import Vehicle, { VEHICLES } from '../entities/Vehicle.js';
import Civilian, { CIVILIAN_KINDS } from '../entities/Civilian.js';
import { Lane, Driver, gapAhead, findBypass, steerAngle, seeded, between, hashString } from './Traffic.js';
import { Walker, WALKER, escapeRoute, pathLength, pointAlong } from '../ai/Civilians.js';
import { markBlocked } from '../world/Level.js';

const { Body } = Matter;

// through-traffic leaves the map and drives over dead bodies (no ragdoll snagged on a bumper)
const MASK_DRIVING = MASK.PROP & ~CAT.EDGE & ~CAT.CORPSE;
const SLEEP = 60; // Matter's default sleepThreshold, given back once the car is parked
const MAX_HALF = 80; // half length of the longest model (van, 160 px): the spawn box fits any of them
const BARKS = {
  scream: ['AAAH!', 'HELP!', 'RUN!', 'OH MY GOD!', 'POLICE!', 'NO NO NO!'],
  beg: ["DON'T SHOOT!", 'PLEASE!', 'TAKE IT!'],
  back: ['STAY BACK!', "HE'S ARMED!", 'LEAVE ME ALONE!', 'GET AWAY FROM ME!'],
};
const BARK_COLOR = '#ffe6f0';

export default class Ambient {
  constructor(world, def) {
    this.world = world;
    this.r = seeded(def.seed ?? hashString(world.level.name || 'street'));
    const W = world.map.widthPx;
    this.lanes = (def.traffic || []).map((l) => new Lane(l, W));
    this.rows = this.lanes.map((l) => l.y);
    this.paths = (def.walkers || []).map((w) => ({
      pts: w.path.map(([c, r]) => ({ x: c * TILE, y: r * TILE })), gap: w.gap || [5, 12], max: w.max ?? 3, timer: 0, alive: 0,
    }));
    for (const p of this.paths) p.len = pathLength(p.pts);
    // band of rows where vehicles look for obstacles (everything else is skipped)
    const pad = 2 * TILE;
    this.bandY0 = Math.min(...this.rows) - pad;
    this.bandY1 = Math.max(...this.rows) + pad;
    this.cars = [];        // driven vehicles: { v: Vehicle, d: Driver, lane, hl, hw, heard, hitT, hp, stall }
    this.civilians = world.civilians;
    this.barkT = 0;
    this.checkT = 0;
    this.scaredUntil = -1; // no new passers-by until then (after gunfire / explosions)
    this.obstacles = [];
    world.events.on('noise', (e) => this.onNoise(e));
    world.events.on('kill', (e) => this.onKill(e));
    this.prewarm();
  }

  // ---------------- start: the street is already busy ----------------
  prewarm() {
    const r = this.r;
    for (const lane of this.lanes) {
      // vehicles spaced like a steady flow (one every mean gap at lane speed), a share A.prewarm of them kept,
      // at least one per lane so the street is never empty when the level opens
      const step = lane.speed * (lane.gap[0] + lane.gap[1]) / 2;
      let first = true;
      for (let x = between(r, [0.15, 0.85]) * Math.min(step, lane.width); x < lane.width; x += step * between(r, [0.7, 1.3])) {
        if (this.cars.length >= A.maxCars || (!first && r() > A.prewarm)) continue;
        first = false;
        this.spawnCar(lane, lane.dir > 0 ? x : lane.width - x);
      }
      lane.timer = between(r, lane.gap) * 0.5;
    }
    for (const p of this.paths) {
      const n = Math.round(p.max * A.prewarm);
      for (let k = 0; k < n && this.civilians.length < A.maxWalkers; k++) this.spawnWalker(p, between(r, [0.08, 0.85]) * p.len);
      p.timer = between(r, p.gap) * 0.6;
    }
  }

  // ---------------- per step ----------------
  update(dt) {
    this.barkT -= dt;
    if (this.lanes.length) this.updateTraffic(dt);
    if (this.paths.length || this.civilians.length) this.updateWalkers(dt);
  }

  updateTraffic(dt) {
    const r = this.r;
    this.obstacles = this.collectObstacles();
    const moving = this.cars.length;
    for (const lane of this.lanes) {
      const sx = lane.spawnX(MAX_HALF);
      const spawnClear = !this.occupied(lane.y, sx - MAX_HALF - A.minGap * TILE * 2, sx + MAX_HALF + A.minGap * TILE * 2);
      const laneClear = !this.cars.some((c) => c.lane === lane && c.d.speed < 8);
      if (lane.tick(dt, { spawnClear, laneClear, room: moving < A.maxCars }, r)) this.spawnCar(lane, sx);
    }
    for (const c of [...this.cars]) this.drive(c, dt);
  }

  // boxes of everything a driver must not hit: other vehicles, props, wrecks
  collectObstacles() {
    const out = [];
    const traffic = new Map(this.cars.map((c) => [c.v, c]));
    for (const p of this.world.props) {
      if (p.dead || p.def.hung || p.def.overhead) continue;
      const b = p.body.bounds;
      if (b.max.y < this.bandY0 || b.min.y > this.bandY1 || b.max.x - b.min.x < 6) continue;
      const c = traffic.get(p);
      out.push({ x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, ref: p, moving: !!c, speed: c ? c.d.speed * c.lane.dir : 0 });
    }
    return out;
  }

  // anything in the lane band between x0 and x1
  occupied(y, x0, x1) {
    const h = 34; // half width of the widest model (van) + a little
    return this.obstacles.some((o) => o.y0 < y + h && o.y1 > y - h && o.x1 > x0 && o.x0 < x1);
  }

  spawnCar(lane, x) {
    const r = this.r, w = this.world;
    const model = lane.models[Math.floor(r() * lane.models.length)];
    if (!VEHICLES[model]) return null;
    const v = new Vehicle(w, model, x, lane.y, lane.angle);
    const d = new Driver(lane, r);
    v.moving = true;
    wake(v.body);
    v.body.sleepThreshold = Infinity; // a driven body must never doze off between two velocity commands
    v.body.collisionFilter = { ...v.body.collisionFilter, mask: MASK_DRIVING };
    Body.setVelocity(v.body, { x: (Math.cos(lane.angle) * d.speed) / 60, y: 0 });
    const c = { v, d, lane, hl: (v.w - 4) / 2, hw: (v.h - 4) / 2, heard: false, hitT: 0, hp: v.hp, stall: 0 };
    this.cars.push(c);
    w.props.push(v);
    w.events.emit('trafficSpawn', { vehicle: v });
    return c;
  }

  drive(c, dt) {
    const w = this.world, v = c.v, d = c.d, b = v.body, lane = c.lane;
    // gone off the far side: removed for good
    if (lane.gone(v.x, c.hl) || v.y < -400 || v.y > w.map.heightPx + 400) { this.removeCar(c); return; }
    this.checkDamage(c);
    if (v.exploded) { this.park(c, 'exploded'); return; }
    // what the physics did: a crash or a shove slows the car down for real
    const vel = Body.getVelocity(b);
    const fwd = (vel.x * Math.cos(b.angle) + vel.y * Math.sin(b.angle)) * 60;
    if (!b.isStatic) d.speed = Math.min(d.speed, Math.max(0, fwd) + 25);
    c.stall = !b.isStatic && d.speed > 40 && fwd < 12 ? c.stall + dt : 0;
    const car = { x: v.x, y: v.y, hl: c.hl, hw: c.hw, dir: lane.dir, ref: v };
    const band = d.bypass ? d.bypass.y : v.y;
    const ahead = gapAhead(car, this.obstacles, band);
    const o = ahead.obstacle;
    c.hitT = Math.max(0, c.hitT - dt);
    d.update(dt, {
      x: v.x, y: v.y, hw: c.hw, gap: ahead.gap,
      lead: o ? Math.max(0, o.speed * lane.dir) : 0,
      leadStatic: !!o && !o.moving,
      person: this.personAhead(car, band),
      passed: !!d.bypass && (v.x - d.bypass.passX) * lane.dir > 0,
      stalled: c.stall > 0.6,
      bypass: () => (o ? findBypass(car, o, this.rows, this.obstacles) : null),
    });
    if (c.hitT > 0) d.speed = Math.max(0, d.speed - A.emergency * TILE * dt);
    if (d.state === 'stopped') { this.park(c, d.reason); return; }
    // drive: heading toward the target row, velocity along the heading
    const want = steerAngle(lane.dir, v.y, d.targetY, d.steerMax);
    const err = angDiff(b.angle, want);
    const moving = Math.abs(d.speed) > 1;
    if (moving && b.isStatic) wake(b);
    if (!b.isStatic) {
      Body.setAngularVelocity(b, err * 0.12 * Math.min(1, Math.abs(d.speed) / 60));
      Body.setVelocity(b, { x: (Math.cos(b.angle) * d.speed) / 60, y: (Math.sin(b.angle) * d.speed) / 60 });
      if (moving) b.flyUntil = w.time + 0.05; // driven: no floor friction fighting the engine
    }
    v.steer = Math.max(-0.5, Math.min(0.5, err * 3));
    v.brake += ((d.brake ? 1 : 0) - v.brake) * Math.min(1, dt * 12);
    v.bob = Math.sin(w.time * 9 + c.hl) * 0.35 * Math.min(1, Math.abs(d.speed) / 200);
    this.runOver(c);
    this.passBy(c);
    // exhaust
    if (this.r() < 0.06 && d.speed > 30) {
      const p = v.toWorld(1, v.h * 0.7);
      w.particles.smoke(p.x, p.y, 1, 2, { speed: 10, size: 3, life: 0.9 });
    }
  }

  // nearest living person in front of the car, in its band (px), Infinity if none
  personAhead(car, bandY) {
    let best = Infinity;
    const y0 = bandY - car.hw - 10, y1 = bandY + car.hw + 10, front = car.x + car.dir * car.hl;
    for (const ch of this.world.chars) {
      if (!ch.alive || ch.y < y0 || ch.y > y1) continue;
      const d = (ch.x - front) * car.dir - ch.radius;
      if (d > -car.hl && d < best) best = Math.max(0, d);
    }
    return best;
  }

  // shot-up vehicles: a hit driver floors it, a dead driver / burst tyre / fire makes the car coast and stop
  checkDamage(c) {
    const v = c.v, d = c.d;
    if (v.hp < c.hp) { d.panic = true; c.hp = v.hp; }
    const side = this.r() < 0.5 ? -1 : 1;
    const tyre = v.tires.findIndex((t) => !t);
    if (tyre >= 0) {
      // drifts toward the burst tyre (local +y is the car's right)
      const right = v.m.wheels[tyre][1] > v.h / 2 ? 1 : -1;
      d.disable('tyre', right * c.lane.dir);
    } else if (v.windows.wind >= 2 || v.hp <= v.m.hp * 0.55) d.disable('driver', side);
    else if (v.burning) d.disable('fire', side);
  }

  // the car is out of the traffic: an ordinary parked vehicle / wreck from now on
  park(c, reason) {
    const v = c.v, w = this.world;
    this.cars.splice(this.cars.indexOf(c), 1);
    c.d.state = 'stopped';
    v.moving = false;
    v.brake = reason === 'exploded' ? 0 : 1;
    v.steer = 0; v.bob = 0;
    v.body.sleepThreshold = SLEEP;
    const inside = w.map.inside(v.x, v.y) && v.body.bounds.min.x > 0 && v.body.bounds.max.x < w.map.widthPx;
    if (inside) {
      v.body.collisionFilter = { ...v.body.collisionFilter, mask: MASK.PROP };
      markBlocked(w.map, v);
    }
    // the driver gets out: running from a shot-up / burning car, walking away from a hopeless jam
    const out = reason === 'fire' || reason === 'tyre' || reason === 'jam';
    if (out && this.r() < A.bailOut && this.civilians.length < A.maxWalkers + 2 && inside) this.bailOut(v, reason !== 'jam');
    w.events.emit('trafficStopped', { vehicle: v, reason });
  }

  // the driver's door is on the car's left (-y in sprite space)
  bailOut(v, panic) {
    const w = this.world, p = v.toWorld(v.w * 0.55, -10);
    if (w.map.solidAt(p.x, p.y)) return;
    const route = panic ? [p] : escapeRoute(w.map, p.x, p.y, null);
    if (!route) return;
    const civ = this.spawnCivilian([p, ...route], p.x, p.y, v.body.angle - Math.PI / 2);
    if (!panic) return;
    civ.brain.alarm(v.x, v.y, 'explosion');
    this.onPanic(civ, 'scream');
  }

  removeCar(c) {
    this.cars.splice(this.cars.indexOf(c), 1);
    c.v.dead = true;
    this.world.removeBody(c.v.body);
  }

  // a fast car kills whoever it hits (one hit kills) and throws the body; slower ones just shove (physics)
  runOver(c) {
    const v = c.v, d = c.d, w = this.world, b = v.body;
    if (d.speed < A.lethal * TILE) return;
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    const reach = c.hl + 12;
    for (const ch of [...w.chars]) {
      if (!ch.alive) continue;
      const dx = ch.x - v.x, dy = ch.y - v.y;
      if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > c.hl + ch.radius || Math.abs(ly) > c.hw + ch.radius) continue;
      // thrown forward and off to the side he was hit on
      const side = Math.sign(ly) || 1;
      const a = b.angle + side * (lx > c.hl * 0.5 ? 0.35 : 0.9);
      const speed = d.speed;
      const before = w.corpses.length;
      ch.kill(a, 'vehicle', v);
      for (const corpse of w.corpses.slice(before)) {
        for (const part of corpse.parts || [{ body: corpse.body }]) {
          const pb = part.body;
          impulse(pb, a, kgOf(pb) * (speed * A.shove) / 60 * (0.8 + this.r() * 0.4), (this.r() - 0.5) * 0.6, 14);
          pb.flyUntil = w.time + 0.25;
        }
      }
      w.decals.stampBlood(ch.x, ch.y, 6, 8);
      w.sound('carHit', ch.x, ch.y, 1);
      w.sound('bodyFall', ch.x, ch.y, 0.9);
      w.shake(0.3);
      w.events.emit('runOver', { victim: ch, vehicle: v, speed });
      // the driver stomps on the brake, then runs for it (hit and run)
      c.hitT = 0.9;
      d.panic = true;
    }
  }

  // engine pass-by: one swept sound per car, started a moment before it passes the camera
  passBy(c) {
    if (c.heard) return;
    const w = this.world, cam = w.camera, d = c.d, dir = c.lane.dir;
    const dy = Math.abs(c.v.y - cam.y) / TILE;
    if (dy > A.passby.range) return;
    const t = ((cam.x - c.v.x) * dir) / Math.max(30, d.speed);
    if (t < 0 || t > A.passby.lead) return;
    c.heard = true;
    const k = 1 - dy / A.passby.range;
    const model = c.v.type;
    w.sound('passby', undefined, undefined, A.passby.vol * k * k, {
      lead: t, dur: t + 1.6, dir, side: Math.min(1, dy / 6),
      f: (model === 'van' ? 38 : model === 'car2' ? 58 : 47) * (0.8 + d.speed / (12 * TILE)),
    });
  }

  // ---------------- passers-by ----------------
  updateWalkers(dt) {
    const w = this.world, r = this.r;
    for (const p of this.paths) {
      p.timer -= dt;
      if (p.timer > 0) continue;
      p.timer = between(r, p.gap);
      if (p.alive >= p.max || this.civilians.length >= A.maxWalkers || w.time < this.scaredUntil) continue;
      const s = p.pts[0];
      if (this.civilians.some((c) => Math.hypot(c.x - s.x, c.y - s.y) < 20)) continue;
      this.spawnWalker(p, 0);
    }
    // sight checks (staggered): an armed player close by, a corpse in view
    this.checkT -= dt;
    const look = this.checkT <= 0;
    if (look) this.checkT = A.panic.check;
    const sense = { escape: (x, y, danger) => escapeRoute(w.map, x, y, danger) };
    for (const civ of [...this.civilians]) {
      if (!civ.alive) { this.removeCivilian(civ); continue; }
      if (look && !civ.brain.panicked) this.lookAround(civ);
      civ.update(dt, sense);
      const b = civ.brain;
      if (b.bark) { this.bark(civ, b.bark); b.bark = null; }
      const off = !w.map.inside(civ.x, civ.y);
      const far = civ.x < -A.margin * TILE * 2 || civ.y < -A.margin * TILE * 2
        || civ.x > w.map.widthPx + A.margin * TILE * 2 || civ.y > w.map.heightPx + A.margin * TILE * 2;
      if ((b.state === WALKER.DONE && (off || !b.panicked)) || far) this.removeCivilian(civ);
    }
  }

  spawnWalker(p, at) {
    const r = this.r;
    const start = pointAlong(p.pts, at);
    const path = [{ x: start.x, y: start.y }, ...p.pts.slice(start.i)];
    const a = Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x);
    const lead = this.spawnCivilian(path, start.x, start.y, a, p);
    if (r() < A.coupleChance && this.civilians.length < A.maxWalkers) {
      // a couple: side by side, a shoulder apart, same pace
      const ox = -Math.sin(a) * 15, oy = Math.cos(a) * 15;
      const path2 = path.map((q) => ({ x: q.x + ox, y: q.y + oy }));
      const mate = this.spawnCivilian(path2, start.x + ox, start.y + oy, a, p, lead.brain);
      mate.brain.speed = lead.brain.speed;
      lead.mate = mate; mate.mate = lead;
    }
  }

  spawnCivilian(path, x, y, angle, src = null, partner = null) {
    const r = this.r, w = this.world;
    const kind = CIVILIAN_KINDS[Math.floor(r() * CIVILIAN_KINDS.length)];
    const brain = new Walker(path, { r, speed: between(r, A.walk) * TILE, run: between(r, A.run) * TILE, partner });
    const civ = new Civilian(w, x, y, angle, kind, brain);
    civ.src = src;
    if (src) src.alive++;
    this.civilians.push(civ);
    w.chars.push(civ);
    return civ;
  }

  removeCivilian(civ) {
    const w = this.world;
    const i = this.civilians.indexOf(civ);
    if (i < 0) return;
    this.civilians.splice(i, 1);
    const j = w.chars.indexOf(civ);
    if (j >= 0) w.chars.splice(j, 1);
    if (civ.src) civ.src.alive--;
    if (civ.alive) { civ.alive = false; w.removeBody(civ.body); }
  }

  // what a passer-by can see: the player with a weapon in hand at close range (only a gun makes them beg), a body
  lookAround(civ) {
    const w = this.world, p = w.player, P = A.panic;
    if (p.alive && p.armed && Math.hypot(p.x - civ.x, p.y - civ.y) < P.armed * TILE && w.lineOfSight(civ.x, civ.y, p.x, p.y)) {
      this.alarm(civ, p.x, p.y, p.hasGun ? 'armed' : 'weapon');
      return;
    }
    for (const c of w.corpses) {
      if (c.dead || Math.hypot(c.x - civ.x, c.y - civ.y) > P.corpse * TILE) continue;
      if (w.lineOfSight(civ.x, civ.y, c.x, c.y)) { this.alarm(civ, c.x, c.y, 'corpse'); return; }
    }
  }

  alarm(civ, x, y, kind) {
    if (civ.alive && civ.brain.alarm(x, y, kind, civ)) this.onPanic(civ, kind);
  }

  // a screaming passer-by sets off the others around him
  onPanic(civ, kind) {
    this.world.events.emit('civilianPanic', { civilian: civ, x: civ.x, y: civ.y, kind });
    const R = A.panic.spread * TILE;
    for (const o of this.civilians) {
      if (o === civ || o.brain.panicked || Math.hypot(o.x - civ.x, o.y - civ.y) > R) continue;
      if (this.world.lineOfSight(civ.x, civ.y, o.x, o.y)) this.alarm(o, civ.brain.danger.x, civ.brain.danger.y, 'scream');
    }
  }

  panicAround(x, y, radius, kind) {
    for (const civ of [...this.civilians]) {
      if (Math.hypot(civ.x - x, civ.y - y) < radius) this.alarm(civ, x, y, kind);
    }
  }

  onNoise({ x, y, radius, type }) {
    if (type !== 'gunshot' && type !== 'explosion') return;
    this.panicAround(x, y, radius * A.panic.hear, type);
    this.scaredUntil = this.world.time + A.panic.calm;
  }

  onKill({ victim }) {
    const R = A.panic.witness * TILE, w = this.world;
    for (const civ of [...this.civilians]) {
      if (civ === victim || Math.hypot(civ.x - victim.x, civ.y - victim.y) > R) continue;
      if (w.lineOfSight(civ.x, civ.y, victim.x, victim.y)) this.alarm(civ, victim.x, victim.y, 'kill');
    }
  }

  // floating scream over a passer-by (world texts) and his voice, rate limited so the screen stays readable
  bark(civ, kind) {
    if (this.barkT > 0) return;
    const lines = BARKS[kind] || BARKS.scream;
    this.barkT = A.barkGap;
    this.world.texts.push({ x: civ.x, y: civ.y - 16, str: lines[Math.floor(this.r() * lines.length)], t: 1.1, dur: 1.1, color: BARK_COLOR });
    this.world.sound(kind === 'beg' ? 'whimper' : 'scream', civ.x, civ.y, 1, { pitch: civ.voice });
  }
}
