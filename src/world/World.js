import { TILE, MAX_DEBRIS, COMBO_WINDOW, PALETTE, WALL_HP } from '../core/Config.js';
import { segPoly, segCircle, segSeg } from '../core/Raycast.js';
import { rand, chance, clamp } from '../core/math.js';
import { rubble, chunk, plank } from '../core/Assets.js';
import Debris from '../entities/Debris.js';
import AmmoItem from '../entities/AmmoItem.js';
import Audio from '../core/Audio.js';
import TileMap from './TileMap.js';
import Particles from '../fx/Particles.js';
import { buildLevel } from './Level.js';
import { impulse, groundFriction, breakawayForce, kgOf, PUSH_FORCE } from '../core/Physics.js';

const { Engine, Events, Composite, Body } = Matter;

// One playthrough of a level: physics, entities, effects, scoring.
export default class World {
  constructor(game, level) {
    this.game = game;
    this.camera = game.camera;
    this.level = level;
    this.engine = Engine.create({ enableSleeping: true });
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    this.engine.gravity.scale = 0;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    this.time = 0;
    this.timers = [];

    this.map = new TileMap(level.tiles);
    this.map.render();
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

    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastKill = -99;
    this.cleared = false;
    this.exited = false;
    this.showVision = false;

    buildLevel(this, level);
    this.chars = [this.player, ...this.enemies];
    this.totalEnemies = this.enemies.length;

    Events.on(this.engine, 'collisionStart', (e) => {
      for (const pair of e.pairs) {
        const a = pair.bodyA, b = pair.bodyB;
        a.entity?.onCollide?.(b, pair);
        b.entity?.onCollide?.(a, pair);
      }
    });
  }

  // ---------------- registry ----------------
  addBody(b) { Composite.add(this.engine.world, b); }
  removeBody(b) { Composite.remove(this.engine.world, b); }
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
    this.map.bake(d.img, d.body.position.x, d.body.position.y, d.body.angle);
    this.removeBody(d.body);
  }
  get enemiesLeft() { return this.enemies.filter((e) => e.alive).length; }

  // ---------------- services ----------------
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

  // raw velocity kick (px/step), ignoring mass: only for scripted motion
  pushBody(b, a, dv, spin = 0) {
    const v = Body.getVelocity(b);
    Body.setVelocity(b, { x: v.x + Math.cos(a) * dv, y: v.y + Math.sin(a) * dv });
    if (spin) Body.setAngularVelocity(b, Body.getAngularVelocity(b) + spin);
  }

  // characters leaning into a movable object slow down with its weight and grip
  updatePushContacts() {
    for (const pair of this.engine.pairs.list) {
      if (!pair.isActive) continue;
      let c = pair.bodyA.entity, o = pair.bodyB;
      if (!(c && (c.isPlayer || c.isEnemy))) { c = pair.bodyB.entity; o = pair.bodyA; }
      if (!(c && (c.isPlayer || c.isEnemy)) || o.isStatic || o.mu === undefined || o.label === 'debris') continue;
      const dx = o.position.x - c.x, dy = o.position.y - c.y;
      if (dx * c.vel.x + dy * c.vel.y <= 0) continue;
      const f = Math.max(0.12, 1 - breakawayForce(this.map, o) / PUSH_FORCE);
      c.pushFactor = Math.min(c.pushFactor, f);
    }
  }

  // ---------------- destruction ----------------
  damageWall(cx, cy, dmg, x, y, dirA, power = 1) {
    const m = this.map;
    if (!m.canBreak(cx, cy)) return;
    const i = cy * m.w + cx;
    const max = WALL_HP[m.at(cx, cy)];
    const col = m.chipColor(cx, cy);
    m.hp[i] -= dmg;
    m.crack(x, y, clamp(1 - m.hp[i] / max, 0, 1));
    this.particles.chips(x, y, dirA + Math.PI, 1.1, 3 + dmg * 3, col, 150);
    this.particles.smoke(x, y, 1 + Math.min(4, dmg), 2, { speed: 28, size: 4, life: 0.9 });
    if (chance(0.3 * dmg)) {
      const pcs = rubble(m.at(cx, cy) === 'X' ? 'brick' : 'wall');
      const a = dirA + Math.PI + rand(-0.8, 0.8), v = rand(60, 180);
      this.addDebris(new Debris(this, pcs[Math.floor(rand(0, 5))], x, y, rand(0, 6), Math.cos(a) * v, Math.sin(a) * v,
        rand(-0.5, 0.5), { density: 0.003, air: 0.08 }));
    }
    if (m.hp[i] <= 0) this.destroyWall(cx, cy, dirA, power);
  }

  destroyWall(cx, cy, dirA, power = 1) {
    const m = this.map;
    if (!m.canBreak(cx, cy)) return;
    const brick = m.at(cx, cy) === 'X';
    const col = m.chipColor(cx, cy);
    m.destroyTile(cx, cy);
    this.wallsDirty = true;
    const x = (cx + 0.5) * TILE, y = (cy + 0.5) * TILE;
    const pcs = rubble(brick ? 'brick' : 'wall');
    const n = 9 + Math.floor(rand(0, 6));
    for (let k = 0; k < n; k++) {
      const a = dirA + rand(-1.1, 1.1), v = rand(90, 330) * power;
      this.addDebris(new Debris(this, pcs[k % pcs.length], x + rand(-12, 12), y + rand(-12, 12), rand(0, 6), Math.cos(a) * v, Math.sin(a) * v,
        rand(-0.5, 0.5), { density: 0.004, air: 0.07, bounce: 0.2, harm: { kind: 'blunt', knock: 3.2, lethal: 7.5 } }));
    }
    this.particles.chips(x, y, dirA, Math.PI, 30, col, 220);
    this.particles.smoke(x, y, 22, 14, { speed: 70, size: 10, life: 2.2 });
    this.sound('crumble', x, y);
    this.shake(0.3);
    this.noise(x, y, 420);
  }

  // door ripped off its hinges
  detachDoor(door, dirA, power = 1) {
    const i = this.doors.indexOf(door);
    if (i < 0) return;
    this.doors.splice(i, 1);
    this.removeBody(door.body);
    const b = door.body;
    const v = rand(160, 320) * power;
    this.addDebris(new Debris(this, plank(door.img, door.len), b.position.x, b.position.y, b.angle,
      Math.cos(dirA) * v, Math.sin(dirA) * v, rand(-0.5, 0.5),
      { kg: 25, mu: 0.5, fly: 0.3, air: 0.05, bounce: 0.3, harm: { kind: 'blunt', knock: 2.5, lethal: 7 } }));
    this.particles.chips(b.position.x, b.position.y, dirA, Math.PI, 24, '#8a5a34', 200);
    this.particles.smoke(b.position.x, b.position.y, 6, 10, { speed: 40, size: 6, life: 1 });
    this.sound('doorSlam', b.position.x, b.position.y);
    this.shake(0.2);
  }

  destroyFence(f, dirA) {
    if (f.dead) return;
    f.dead = true;
    this.removeBody(f.body);
    this.map.wallCtx.clearRect(f.x - 17, f.y - 17, 34, 34);
    for (let k = 0; k < 6; k++) {
      const a = dirA + rand(-1, 1), v = rand(80, 260);
      this.addDebris(new Debris(this, chunk('#6a4a2a', Math.floor(rand(3, 9)), 3), f.x + rand(-10, 10), f.y + rand(-10, 10), rand(0, 6),
        Math.cos(a) * v, Math.sin(a) * v, rand(-0.6, 0.6), { density: 0.002 }));
    }
    this.particles.chips(f.x, f.y, dirA, Math.PI, 12, '#6a4a2a', 160);
  }

  muzzleFlash(x, y, a, d) {
    this.flashes.push({ x, y, a, t: 0.05, big: d.pellets > 1 || d.rocket });
    this.light(x, y, d.pellets > 1 ? 110 : 75, '#ffb347', 0.06);
    this.particles.sparks(x, y, a, 0.35, d.pellets > 1 ? 10 : 3, 380);
    this.particles.smoke(x, y, d.pellets > 1 ? 5 : 2, 2, { speed: 30, size: 4, life: 0.6 });
  }

  noise(x, y, radius, source = null) {
    for (const e of this.enemies) {
      if (!e.alive || e === source) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius) e.hear(x, y, !!source?.isPlayer);
    }
  }

  lineOfSight(x0, y0, x1, y1) {
    if (this.map.raycast(x0, y0, x1, y1)) return false;
    for (const d of this.doors) {
      const t = d.tip();
      if (segSeg(x0, y0, x1, y1, d.hx, d.hy, t.x, t.y) !== null) return false;
    }
    return true;
  }

  // nearest thing a bullet segment hits
  traceBullet(x0, y0, x1, y1, team, ignore) {
    let best = null;
    const w = this.map.raycast(x0, y0, x1, y1);
    if (w) best = { t: w.t, kind: 'wall', nx: w.nx, ny: w.ny, cx: w.cx, cy: w.cy };
    const bt = () => (best ? best.t : 1);
    for (const c of this.chars) {
      if (!c.alive || c.team === team || ignore.has(c)) continue;
      const t = segCircle(x0, y0, x1, y1, c.x, c.y, c.radius + 1);
      if (t !== null && t < bt()) best = { t, kind: 'char', target: c };
    }
    const minX = Math.min(x0, x1) - 1, maxX = Math.max(x0, x1) + 1, minY = Math.min(y0, y1) - 1, maxY = Math.max(y0, y1) + 1;
    const test = (list, kind, filter) => {
      for (const o of list) {
        if (!filter(o) || ignore.has(o)) continue;
        const bd = o.body.bounds;
        if (bd.max.x < minX || bd.min.x > maxX || bd.max.y < minY || bd.min.y > maxY) continue;
        const r = segPoly(x0, y0, x1, y1, o.body.vertices);
        if (r && r.t < bt()) best = { t: r.t, kind, target: o, nx: r.nx, ny: r.ny };
      }
    };
    test(this.props, 'prop', (p) => !p.dead);
    test(this.doors, 'door', () => true);
    test(this.windows, 'glass', (g) => g.intact);
    // dead bodies: every ragdoll part can be hit
    for (const c of this.corpses) {
      if (c.dead) continue;
      for (const part of c.parts || [{ body: c.body }]) {
        const bd = part.body.bounds;
        if (bd.max.x < minX || bd.min.x > maxX || bd.max.y < minY || bd.min.y > maxY) continue;
        const r = segPoly(x0, y0, x1, y1, part.body.vertices);
        if (r && r.t < bt()) best = { t: r.t, kind: 'corpse', target: c, part: c.parts ? part : null };
      }
    }
    test(this.items, 'item', (it) => !it.dead);
    test(this.debris, 'debris', (d) => !d.dead && d.size > 4);
    if (best) { best.x = x0 + (x1 - x0) * best.t; best.y = y0 + (y1 - y0) * best.t; }
    return best;
  }

  explode(x, y, { radius = 90, source = null } = {}) {
    const R = radius;
    this.sound('explosion', x, y);
    this.shake(1.0);
    this.hitstop(0.07);
    this.game.flash('#fff2d0', 0.55);
    this.light(x, y, R * 2.8, '#ffa040', 0.45);
    this.rings.push({ x, y, r: 6, max: R * 1.7, t: 0, dur: 0.35 });
    const P = this.particles;
    P.fire(x, y, 80, R * 2.4);
    P.smoke(x, y, 45, 14, { dark: true, speed: 110, size: 14, life: 2.6 });
    P.sparks(x, y, 0, Math.PI, 60, 620);
    P.embers(x, y, 40, 260);
    P.chips(x, y, 0, Math.PI, 30, '#2a2020', 260);
    this.map.scorch(x, y, R * 0.75);
    this.noise(x, y, 1100);

    for (const c of this.chars) {
      if (!c.alive) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > R * 1.5 || this.map.raycast(x, y, c.x, c.y)) continue;
      const a = Math.atan2(c.y - y, c.x - x);
      if (d < R) c.kill(a, 'explosion', this.player);
      else if (c.isEnemy && !c.knocked) c.knock(a, 'blast');
    }
    for (const p of this.props) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (p.onBlast) { p.onBlast(d, R, Math.atan2(p.y - y, p.x - x)); continue; }
      if (d < R * (p.def.static ? 0.55 : 0.85)) p.break(Math.atan2(p.y - y, p.x - x), 2);
    }
    for (const g of this.windows) if (g.intact && Math.hypot(g.x - x, g.y - y) < R * 1.4) g.shatter(Math.atan2(g.y - y, g.x - x), null, 1.6);
    for (const door of [...this.doors]) {
      const b = door.body.position;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < R * 1.2) this.detachDoor(door, Math.atan2(b.y - y, b.x - x), 1.5 * (1 - d / (R * 1.4)) + 0.6);
    }
    for (const f of this.fences) if (!f.dead && Math.hypot(f.x - x, f.y - y) < R) this.destroyFence(f, Math.atan2(f.y - y, f.x - x));
    // walls: crushed near the blast, cracked further away
    const rr = Math.ceil(R / TILE) + 1, ccx = Math.floor(x / TILE), ccy = Math.floor(y / TILE);
    for (let ty = ccy - rr; ty <= ccy + rr; ty++) {
      for (let tx = ccx - rr; tx <= ccx + rr; tx++) {
        if (!this.map.canBreak(tx, ty)) continue;
        const wx = (tx + 0.5) * TILE, wy = (ty + 0.5) * TILE;
        const d = Math.hypot(wx - x, wy - y);
        if (d > R * 1.05) continue;
        const a = Math.atan2(wy - y, wx - x);
        if (d < R * 0.6) this.destroyWall(tx, ty, a, 1.6);
        else this.damageWall(tx, ty, Math.ceil(10 * (1 - d / (R * 1.05))), wx - Math.cos(a) * 14, wy - Math.sin(a) * 14, a, 1.3);
      }
    }

    // shockwave: momentum falls off with distance and is shared out by mass (a chair flies, a car barely rocks)
    for (const b of Composite.allBodies(this.engine.world)) {
      if ((b.isStatic && !b.frozen) || b.entity?.isPlayer || b.entity?.isEnemy) continue;
      const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy);
      if (d > R * 2.2 || d < 0.01) continue;
      const J = (1 - d / (R * 2.2)) * 260;
      if (b.label === 'door') {
        const door = b.entity;
        const torque = ((b.position.x - door.hx) * dy - (b.position.y - door.hy) * dx) / (d * door.len);
        Body.setAngularVelocity(b, Body.getAngularVelocity(b) + torque * J / kgOf(b) * 0.15);
        continue;
      }
      const dv = impulse(b, Math.atan2(dy, dx), J, rand(-0.4, 0.4), 22);
      b.flyUntil = this.time + 0.1 + dv * 0.02;
      if (b.entity?.isItem) b.entity.thrower = null;
      if (b.entity?.isDebris && dv > 4 && !b.entity.harm) b.entity.harm = { kind: 'blunt', knock: 3.5, lethal: 9 };
    }
    void source;
  }

  // ---------------- scoring ----------------
  addScore(points, x, y, label) {
    this.score += points;
    this.texts.push({ x, y, str: label ? `${label} +${points}` : `+${points}`, t: 1.1, dur: 1.1, color: chance(0.5) ? PALETTE.pink : PALETTE.cyan });
  }

  onKill(ch, cause, killer) {
    if (ch.isPlayer) { this.game.onPlayerDeath(); return; }
    this.kills++;
    // guards drop a spare magazine (or a few shells) for the gun they carried
    const type = ch.lastAmmo;
    if (type && chance(0.8)) {
      const a = rand(0, Math.PI * 2);
      this.ammoItems.push(new AmmoItem(this, type, undefined, ch.x, ch.y, Math.cos(a) * 1.5, Math.sin(a) * 1.5));
    }
    const byPlayer = killer?.isPlayer || cause === 'explosion';
    if (byPlayer) {
      this.combo = this.time - this.lastKill < COMBO_WINDOW ? this.combo + 1 : 1;
      this.lastKill = this.time;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const base = cause === 'execute' ? 1000 : cause === 'explosion' ? 600 : (killer?.def?.points ?? 500);
      this.addScore(base * Math.min(this.combo, 10), ch.x, ch.y - 10, cause === 'execute' ? 'EXECUTION' : null);
      if (this.combo > 1) Audio.play('combo', { n: this.combo });
    }
    this.hitstop(0.035);
    if (this.enemiesLeft === 0 && !this.cleared) {
      this.cleared = true;
      this.slowmo(0.22, 1.3);
      this.after(0.4, () => Audio.play('clear'));
      this.game.onCleared();
    } else if (chance(0.15)) this.slowmo(0.3, 0.45);
  }

  // ---------------- simulation ----------------
  step(dt, input, aim) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.t <= this.time);
      this.timers = this.timers.filter((t) => t.t > this.time);
      for (const t of due) t.fn();
    }
    if (this.player.alive) this.player.update(dt, input, aim);
    else this.player.baseUpdate(dt);
    for (const e of this.enemies) e.update(dt);

    Engine.update(this.engine, dt * 1000);
    groundFriction(this, Composite.allBodies(this.engine.world), dt);
    this.updatePushContacts();
    for (const d of this.doors) d.constrain(dt);
    if (this.wallsDirty) {
      this.wallsDirty = false;
      Composite.remove(this.engine.world, this.wallBodies);
      this.wallBodies = this.map.buildBodies();
      this.addBody(this.wallBodies);
    }

    for (const it of this.items) if (!it.dead) it.update(dt);
    for (const a of this.ammoItems) if (!a.dead) a.update(dt);
    for (const p of this.projectiles) p.update(dt);
    for (const d of this.debris) if (!d.dead) d.update(dt);
    for (const c of this.corpses) if (!c.dead) c.update(dt);
    for (const p of this.props) if (p.update) p.update(dt);
    for (const e of this.emitters) { e.t -= dt; e.fn(e); }
    this.emitters = this.emitters.filter((e) => e.t > 0);
    this.particles.update(dt);

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

    if (this.combo > 0 && this.time - this.lastKill > COMBO_WINDOW) this.combo = 0;

    if (this.cleared && !this.exited && this.player.alive) {
      const ex = this.level.exit;
      if (Math.hypot(this.player.x - ex.x * TILE, this.player.y - ex.y * TILE) < ex.r * TILE) {
        this.exited = true;
        this.game.onExit();
      }
    }
  }

  // ---------------- rendering ----------------
  draw(ctx, cam, t) {
    const v = cam.viewRadius();
    const pad = Math.max(v.x, v.y) * 1.1;
    const vis = (x, y) => Math.abs(x - cam.x) < pad && Math.abs(y - cam.y) < pad;

    ctx.drawImage(this.map.floorCanvas, 0, 0);
    for (const c of this.corpses) if (vis(c.x, c.y)) c.drawPool(ctx);
    for (const d of this.debris) if (!d.dead && vis(d.body.position.x, d.body.position.y)) d.draw(ctx);
    for (const c of this.corpses) if (vis(c.x, c.y)) c.draw(ctx);
    for (const it of this.items) if (!it.dead && vis(it.x, it.y)) it.draw(ctx, t);
    for (const a of this.ammoItems) if (vis(a.x, a.y)) a.draw(ctx);
    for (const p of this.props) if (vis(p.x, p.y)) p.draw(ctx);
    if (this.showVision) for (const e of this.enemies) e.drawVision(ctx);
    for (const e of this.enemies) if (e.alive && vis(e.x, e.y)) e.draw(ctx);
    if (this.player.alive) this.player.draw(ctx);
    for (const p of this.props) if (p.def.overhead && vis(p.x, p.y)) p.drawOverhead(ctx, this.player);
    for (const d of this.doors) d.draw(ctx);
    for (const g of this.windows) if (vis(g.x, g.y)) g.draw(ctx);
    ctx.drawImage(this.map.wallCanvas, 0, 0);

    if (this.cleared) this.drawExit(ctx, t);
    this.particles.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx);

    // additive pass
    ctx.globalCompositeOperation = 'lighter';
    this.particles.drawGlow(ctx);
    for (const l of this.lights) {
      const a = clamp(l.t / l.dur, 0, 1) * 0.55;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, l.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalAlpha = 1;
    for (const f of this.flashes) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      const s = f.big ? 1.6 : 1;
      ctx.fillStyle = '#ffb020';
      ctx.beginPath();
      ctx.moveTo(-1, 0); ctx.lineTo(4 * s, -5 * s); ctx.lineTo(7 * s, -1.5 * s); ctx.lineTo(14 * s * rand(0.8, 1.2), 0);
      ctx.lineTo(7 * s, 1.5 * s); ctx.lineTo(4 * s, 5 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.arc(2, 0, 2.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const r of this.rings) {
      const p = r.t / r.dur;
      ctx.strokeStyle = `rgba(255,240,220,${1 - p})`;
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * Math.sqrt(p), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.font = '8px joystix';
    ctx.textAlign = 'center';
    for (const tx of this.texts) {
      ctx.globalAlpha = clamp(tx.t / tx.dur * 2, 0, 1);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(tx.str, tx.x + 1, tx.y + 1);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }

  drawExit(ctx, t) {
    const ex = this.level.exit;
    const x = ex.x * TILE, y = ex.y * TILE;
    const pulse = (Math.sin(t * 6) + 1) / 2;
    ctx.strokeStyle = pulse > 0.5 ? PALETTE.pink : PALETTE.cyan;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(x, y, ex.r * TILE * (0.9 + pulse * 0.1), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '8px joystix';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText('EXIT', x + 1, y - ex.r * TILE - 5);
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillText('EXIT', x, y - ex.r * TILE - 6 - pulse * 3);
  }
}
