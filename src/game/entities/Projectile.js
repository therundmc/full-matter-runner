import { sprite, drawSprite } from '../../engine/Assets.js';
import { impulse } from '../../engine/physics/Body.js';

// Fast bullet traced as a segment each step (no tunnelling), or a slow rocket.
export default class Projectile {
  constructor(world, x, y, angle, speed, opts) {
    this.world = world;
    this.x = x; this.y = y;
    this.ox = x; this.oy = y; // trail origin
    this.angle = angle;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.team = opts.team;
    this.owner = opts.owner;
    this.weapon = opts.weapon;
    this.life = opts.life ?? 1.2;
    this.pierce = opts.pierce ?? 0;
    this.rocket = !!opts.rocket;
    this.dead = false;
    this.ignore = new Set();
    if (this.rocket) this.img = sprite('weapons/rocket');
  }

  update(dt) {
    const w = this.world;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    let x0 = this.x, y0 = this.y;
    const x1 = x0 + this.vx * dt, y1 = y0 + this.vy * dt;
    for (let guard = 0; guard < 6; guard++) {
      const hit = w.traceBullet(x0, y0, x1, y1, this.team, this.ignore);
      if (!hit) break;
      const stop = this.onHit(hit);
      if (stop) { this.x = hit.x; this.y = hit.y; this.dead = true; return; }
      x0 = hit.x + Math.cos(this.angle) * 0.5;
      y0 = hit.y + Math.sin(this.angle) * 0.5;
    }
    this.x = x1; this.y = y1;
    if (this.rocket) {
      w.particles.smoke(this.x - this.vx * 0.02, this.y - this.vy * 0.02, 1, 2, { speed: 15, size: 4, life: 0.9 });
      w.particles.fire(this.x - this.vx * 0.03, this.y - this.vy * 0.03, 1, 30);
    }
  }

  // returns true if the projectile stops
  onHit(h) {
    const w = this.world;
    const a = this.angle;
    if (this.rocket) {
      w.explode(h.x - Math.cos(a) * 4, h.y - Math.sin(a) * 4, { radius: 100, source: 'rocket' });
      return true;
    }
    switch (h.kind) {
      case 'wall':
        w.decals.bulletHole(h.x - h.nx * 1.5, h.y - h.ny * 1.5);
        w.particles.sparks(h.x, h.y, Math.atan2(h.ny, h.nx), 0.9, 5, 260);
        w.particles.chips(h.x + h.nx, h.y + h.ny, Math.atan2(h.ny, h.nx), 0.8, 3, '#b8ae9c', 90);
        w.particles.smoke(h.x + h.nx * 2, h.y + h.ny * 2, 1, 1, { speed: 20, size: 3, life: 0.5 });
        w.sound('impact', h.x, h.y, 0.6);
        w.damageWall(h.cx, h.cy, this.weapon?.pierce ? 3 : 1, h.x - h.nx * 2, h.y - h.ny * 2, a);
        return true;
      case 'glass':
        h.target.shatter(a, this.owner?.isEnemy ? this.owner : null, this.weapon?.pellets > 1 ? 1.3 : 1);
        this.ignore.add(h.target);
        return false;
      case 'prop':
        h.target.hit(1, h.x, h.y, a, this.weapon?.pellets > 1 ? 0.6 : 1);
        if (this.pierce > 0) { this.pierce--; this.ignore.add(h.target); return false; }
        return true;
      case 'door':
        h.target.hit(h.x, h.y, a, this.weapon?.pierce ? 3 : 1);
        if (this.pierce > 0) { this.pierce--; this.ignore.add(h.target); return false; }
        return true;
      case 'char': {
        const c = h.target;
        const d = Math.hypot(c.x - this.owner?.x, c.y - this.owner?.y) || 999;
        c.shot(a, this.weapon, d, this.owner);
        this.ignore.add(c);
        if (this.pierce > 0) { this.pierce--; return false; }
        return true;
      }
      case 'corpse': {
        // desecration: the body jerks, more blood
        const c = h.target;
        if (h.part) { c.shotPart(h.part, a, this.weapon); return true; }
        impulse(c.body, a, 30, (Math.random() - 0.5) * 0.2, 4);
        w.particles.blood(h.x, h.y, a, 0.5, 10, 220);
        w.particles.blood(h.x, h.y, a + Math.PI, 0.6, 3, 80);
        w.decals.stampBlood(h.x, h.y, 3, 3);
        c.pool = Math.min(c.poolMax + 4, c.pool + 1.5);
        w.sound('splat', h.x, h.y, 0.35);
        return true;
      }
      case 'item':
        impulse(h.target.body, a, 14, (Math.random() - 0.5) * 0.8, 6);
        w.particles.sparks(h.x, h.y, a + Math.PI, 0.8, 4, 240);
        w.sound('metal', h.x, h.y, 0.4);
        this.ignore.add(h.target);
        return false;
      case 'debris':
        impulse(h.target.body, a, 8, (Math.random() - 0.5) * 0.8, 6);
        this.ignore.add(h.target);
        return false;
      default:
        return true;
    }
  }

  draw(ctx) {
    if (this.rocket) {
      drawSprite(ctx, this.img, this.x, this.y, this.angle);
      return;
    }
    const tl = 0.022;
    let tx = this.x - this.vx * tl, ty = this.y - this.vy * tl;
    // do not draw the trail behind the muzzle
    if ((tx - this.ox) * this.vx + (ty - this.oy) * this.vy < 0) { tx = this.ox; ty = this.oy; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,200,90,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.strokeStyle = '#fff6d0';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

