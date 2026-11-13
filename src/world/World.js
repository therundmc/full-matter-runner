import { TILE, MAX_DEBRIS, COMBO_WINDOW, PALETTE } from '../core/Config.js';
import { segPoly, segCircle, segSeg } from '../core/Raycast.js';
import { rand, chance, clamp } from '../core/math.js';
import Audio from '../core/Audio.js';
import TileMap from './TileMap.js';
import Particles from '../fx/Particles.js';
import { buildLevel } from './Level.js';

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
    this.addBody(this.map.buildBodies());
    this.particles = new Particles(this);

    this.player = null;
    this.enemies = [];
    this.chars = [];
    this.props = [];
    this.doors = [];
    this.windows = [];
    this.items = [];
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
    if (w) best = { t: w.t, kind: 'wall', nx: w.nx, ny: w.ny };
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
      if (p.def.hp === Infinity) continue;
      if (d < R * (p.def.static ? 0.55 : 0.85)) p.break(Math.atan2(p.y - y, p.x - x), 2);
    }
    for (const g of this.windows) if (g.intact && Math.hypot(g.x - x, g.y - y) < R * 1.4) g.shatter(Math.atan2(g.y - y, g.x - x));

    // shockwave on every loose body
    for (const b of Composite.allBodies(this.engine.world)) {
      if (b.isStatic || b.entity?.isPlayer || b.entity?.isEnemy) continue;
      const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy);
      if (d > R * 2.2 || d < 0.01) continue;
      const f = (1 - d / (R * 2.2)) * 16 / Math.sqrt(Math.max(1, b.mass * 6));
      const v = Body.getVelocity(b);
      if (b.label === 'door') {
        const door = b.entity;
        const torque = ((b.position.x - door.hx) * dy - (b.position.y - door.hy) * dx) / (d * door.len);
        Body.setAngularVelocity(b, Body.getAngularVelocity(b) + torque * f * 0.15);
        continue;
      }
      Body.setVelocity(b, { x: v.x + (dx / d) * f, y: v.y + (dy / d) * f });
      Body.setAngularVelocity(b, Body.getAngularVelocity(b) + rand(-0.4, 0.4) * f * 0.1);
      if (b.entity?.isItem) b.entity.thrower = null;
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
    for (const d of this.doors) d.constrain(dt);

    for (const it of this.items) if (!it.dead) it.update(dt);
    for (const p of this.projectiles) p.update(dt);
    for (const d of this.debris) if (!d.dead) d.update(dt);
    for (const c of this.corpses) if (!c.dead) c.update(dt);
    this.particles.update(dt);

    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.items = this.items.filter((i) => !i.dead);
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
    for (const p of this.props) if (vis(p.x, p.y)) p.draw(ctx);
    if (this.showVision) for (const e of this.enemies) e.drawVision(ctx);
    for (const e of this.enemies) if (e.alive && vis(e.x, e.y)) e.draw(ctx);
    if (this.player.alive) this.player.draw(ctx);
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
