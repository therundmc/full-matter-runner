// One playthrough of a level. Owns the entity lists and runs the simulation step in a fixed order;
// the actual rules live in systems (Ballistics, Explosions, Destruction, Scoring, Impacts) and the
// drawing in WorldRenderer. Systems talk through `world.events` (EventBus):
//   'impact'        physics contact            { a, b, speed, x, y }
//   'kill'          a character died           { victim, cause, killer }
//   'explosion'     a blast went off           { x, y, radius, source }
//   'wallDestroyed' a wall tile collapsed      { cx, cy, x, y }
import { TILE, MAX_DEBRIS, PALETTE, PHYSICS } from '../Config.js';
import { rand, chance } from '../../engine/math.js';
import EventBus from '../../engine/EventBus.js';
import PhysicsWorld from '../../engine/physics/PhysicsWorld.js';
import { FLOOR_GRIP } from '../data/materials.js';
import Audio from '../../audio/Audio.js';
import TileMap from './TileMap.js';
import { buildLevel } from './Level.js';
import MapRenderer from '../render/MapRenderer.js';
import WorldRenderer from '../render/WorldRenderer.js';
import Particles from '../fx/Particles.js';
import AmmoItem from '../entities/AmmoItem.js';
import { traceBullet, lineOfSight } from '../systems/Ballistics.js';
import { explode } from '../systems/Explosions.js';
import { damageWall, destroyWall, detachDoor, destroyFence } from '../systems/Destruction.js';
import Scoring from '../systems/Scoring.js';
import Impacts from '../systems/Impacts.js';

const { Body } = Matter;

export default class World {
  constructor(game, level) {
    this.game = game;
    this.camera = game.camera;
    this.level = level;
    this.time = 0;
    this.timers = [];
    this.events = new EventBus();

    this.map = new TileMap(level.tiles);
    this.physics = new PhysicsWorld({
      events: this.events,
      muAt: (x, y) => this.floorGrip(x, y),
      pushForce: PHYSICS.pushForce,
      substeps: PHYSICS.substeps,
    });
    this.decals = new MapRenderer(this.map);
    this.renderer = new WorldRenderer(this);
    this.wallBodies = this.map.buildBodies();
    this.addBody(this.wallBodies);
    this.wallsDirty = false;
    this.particles = new Particles(this);

    this.player = null;
    this.enemies = [];
    this.chars = [];
    this.props = [];
    this.doors = [];
    this.windows = [];
    this.fences = [];
    this.items = [];
    this.ammoItems = [];
    this.emitters = [];
    this.projectiles = [];
    this.debris = [];
    this.corpses = [];
    this.lights = [];
    this.flashes = [];
    this.rings = [];
    this.texts = [];

    this.cleared = false;
    this.exited = false;
    this.showVision = false;
    this.debugPhysics = false;

    this.scoring = new Scoring(this);
    this.impacts = new Impacts(this);

    buildLevel(this, level);
    this.chars = [this.player, ...this.enemies];
    this.totalEnemies = this.enemies.length;
  }

  get engine() { return this.physics.engine; }
  get score() { return this.scoring.score; }
  get kills() { return this.scoring.kills; }
  get combo() { return this.scoring.combo; }
  get maxCombo() { return this.scoring.maxCombo; }
  get lastKill() { return this.scoring.lastKill; }
  get enemiesLeft() { return this.enemies.filter((e) => e.alive).length; }

  floorGrip(x, y) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE), m = this.map;
    if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return 1;
    return FLOOR_GRIP[m.floor[cy * m.w + cx]] ?? 1;
  }

  // ---------------- registry ----------------
  addBody(b) { this.physics.add(b); }
  removeBody(b) { this.physics.remove(b); }
  characters() { return this.chars; }
  addProjectile(p) { this.projectiles.push(p); }
  addItem(it) { this.items.push(it); }
  removeItem(it) { it.dead = true; this.removeBody(it.body); }
  addCorpse(c) { this.corpses.push(c); }
  addDebris(d) {
    this.debris.push(d);
    if (this.debris.length > MAX_DEBRIS) {
      const old = this.debris.find((x) => !x.dead);
      if (old) this.bakeDebris(old);
    }
  }
  bakeDebris(d) {
    if (d.dead) return;
    d.dead = true;
    this.decals.bake(d.img, d.body.position.x, d.body.position.y, d.body.angle);
    this.removeBody(d.body);
  }

  // ---------------- services used by entities ----------------
  after(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }
  sound(name, x, y, vol = 1) { Audio.play(name, { x, y, vol }); }
  shake(a) { this.camera.shake(a); }
  hitstop(s) { this.game.hitstop = Math.max(this.game.hitstop, s); }
  slowmo(scale, dur) { this.game.slowmo(scale, dur); }
  light(x, y, r, color, dur) { this.lights.push({ x, y, r, color, t: dur, dur }); }
  // run fn(e) every step for dur seconds (fountains, fires...)
  emit(x, y, dur, fn) { this.emitters.push({ x, y, t: dur, fn }); }
  flashGlass(x, y) { this.light(x, y, 45, '#bff6ff', 0.08); }
  pickupFlash(x, y, color = PALETTE.cyan) {
    this.rings.push({ x, y, r: 2, max: 18, t: 0, dur: 0.25 });
    this.particles.sparks(x, y, 0, Math.PI, 8, 160, color);
    this.light(x, y, 40, color, 0.12);
  }
  muzzleFlash(x, y, a, d) {
    this.flashes.push({ x, y, a, t: 0.05, big: d.pellets > 1 || d.rocket });
    this.light(x, y, d.pellets > 1 ? 110 : 75, '#ffb347', 0.06);
    this.particles.sparks(x, y, a, 0.35, d.pellets > 1 ? 10 : 3, 380);
    this.particles.smoke(x, y, d.pellets > 1 ? 5 : 2, 2, { speed: 30, size: 4, life: 0.6 });
  }
  // raw velocity kick (px/step), ignoring mass: only for scripted motion (magnets...)
  pushBody(b, a, dv, spin = 0) {
    const v = Body.getVelocity(b);
    Body.setVelocity(b, { x: v.x + Math.cos(a) * dv, y: v.y + Math.sin(a) * dv });
    if (spin) Body.setAngularVelocity(b, Body.getAngularVelocity(b) + spin);
  }
  noise(x, y, radius, source = null) {
    for (const e of this.enemies) {
      if (!e.alive || e === source) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius) e.hear(x, y, !!source?.isPlayer);
    }
  }
  addScore(points, x, y, label) { this.scoring.add(points, x, y, label); }

  // facades over the systems
  lineOfSight(x0, y0, x1, y1) { return lineOfSight(this, x0, y0, x1, y1); }
  traceBullet(x0, y0, x1, y1, team, ignore) { return traceBullet(this, x0, y0, x1, y1, team, ignore); }
  explode(x, y, opts) { explode(this, x, y, opts); }
  damageWall(cx, cy, dmg, x, y, dirA, power) { damageWall(this, cx, cy, dmg, x, y, dirA, power); }
  destroyWall(cx, cy, dirA, power) { destroyWall(this, cx, cy, dirA, power); }
  detachDoor(door, dirA, power) { detachDoor(this, door, dirA, power); }
  destroyFence(f, dirA) { destroyFence(this, f, dirA); }

  // ---------------- deaths & level flow ----------------
  onKill(ch, cause, killer) {
    this.events.emit('kill', { victim: ch, cause, killer });
    if (ch.isPlayer) { this.game.onPlayerDeath(); return; }
    // guards drop a spare magazine (or a few shells) for the gun they carried
    const type = ch.lastAmmo;
    if (type && chance(0.8)) {
      const a = rand(0, Math.PI * 2);
      this.ammoItems.push(new AmmoItem(this, type, undefined, ch.x, ch.y, Math.cos(a) * 1.5, Math.sin(a) * 1.5));
    }
    this.hitstop(0.035);
    if (this.enemiesLeft === 0 && !this.cleared) {
      this.cleared = true;
      this.slowmo(0.22, 1.3);
      this.after(0.4, () => Audio.play('clear'));
      this.game.onCleared();
    } else if (chance(0.15)) this.slowmo(0.3, 0.45);
  }

  // characters leaning into a movable object slow down with its weight and grip
  updatePushContacts() {
    for (const pair of this.physics.activePairs()) {
      let c = pair.bodyA.entity, o = pair.bodyB;
      if (!(c && (c.isPlayer || c.isEnemy))) { c = pair.bodyB.entity; o = pair.bodyA; }
      if (!(c && (c.isPlayer || c.isEnemy)) || o.isStatic || o.mu === undefined || o.label === 'debris') continue;
      const dx = o.position.x - c.x, dy = o.position.y - c.y;
      if (dx * c.vel.x + dy * c.vel.y <= 0) continue;
      const f = Math.max(0.12, 1 - this.physics.breakaway(o) / this.physics.pushForce);
      c.pushFactor = Math.min(c.pushFactor, f);
    }
  }

  // ---------------- simulation ----------------
  step(dt, input, aim) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.t <= this.time);
      this.timers = this.timers.filter((t) => t.t > this.time);
      for (const t of due) t.fn();
    }
    // 1. intentions (input, AI)
    if (this.player.alive) this.player.update(dt, input, aim);
    else this.player.baseUpdate(dt);
    for (const e of this.enemies) e.update(dt);

    // 2. physics
    this.physics.step(dt, this.time);
    this.updatePushContacts();
    for (const d of this.doors) d.constrain(dt);
    if (this.wallsDirty) {
      this.wallsDirty = false;
      this.physics.remove(this.wallBodies);
      this.wallBodies = this.map.buildBodies();
      this.addBody(this.wallBodies);
    }

    // 3. entities reacting to the new state
    for (const it of this.items) if (!it.dead) it.update(dt);
    for (const a of this.ammoItems) if (!a.dead) a.update(dt);
    for (const p of this.projectiles) p.update(dt);
    for (const d of this.debris) if (!d.dead) d.update(dt);
    for (const c of this.corpses) if (!c.dead) c.update(dt);
    for (const p of this.props) if (p.update) p.update(dt);
    for (const e of this.emitters) { e.t -= dt; e.fn(e); }
    this.particles.update(dt);
    this.scoring.update(dt);
    this.impacts.update(dt);

    // 4. cleanup
    this.emitters = this.emitters.filter((e) => e.t > 0);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.items = this.items.filter((i) => !i.dead);
    this.ammoItems = this.ammoItems.filter((a) => !a.dead);
    this.debris = this.debris.filter((d) => !d.dead);
    this.corpses = this.corpses.filter((c) => !c.dead);
    this.props = this.props.filter((p) => !p.dead);
    for (const l of this.lights) l.t -= dt;
    this.lights = this.lights.filter((l) => l.t > 0);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const t of this.texts) { t.t -= dt; t.y -= dt * 18; }
    this.texts = this.texts.filter((t) => t.t > 0);

    // 5. level flow
    if (this.cleared && !this.exited && this.player.alive && this.level.exit) {
      const ex = this.level.exit;
      if (Math.hypot(this.player.x - ex.x * TILE, this.player.y - ex.y * TILE) < ex.r * TILE) {
        this.exited = true;
        this.game.onExit();
      }
    }
  }

  draw(ctx, cam, t) { this.renderer.draw(ctx, cam, t); }
}
