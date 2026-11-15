import { sprite, drawSprite } from '../../engine/Assets.js';
import { impulse } from '../../engine/physics/Body.js';
import { TILE } from '../Config.js';
import { rand, randi, clamp } from '../../engine/math.js';
import { RESIST, COST, HARDNESS, wallExit, bodyExit, afterCost, ricochet } from '../systems/Penetration.js';
import { woundFor } from '../data/wounds.js';
import { WALL_IMPACT } from '../data/materials.js';
import { feelOf, SURFACE } from '../data/feel.js';
import { combatFx } from '../fx/CombatFx.js';
import { faceNormal } from '../fx/Spatter.js';

// Fast bullet traced as a segment each step (no tunnelling), or a slow rocket.
// A bullet carries penetration energy (`pen`): every obstacle eats some of it (systems/Penetration.js); if any is
// left it comes out the far side (exit hole, debris blown forward, slightly deflected), slower. Grazing hits on hard
// surfaces ricochet. Its streak in flight and the pop where it stops on anything but a man go by its weapon's family
// (data/feel.js `round`); a heavy round leaves the line of its way hanging a moment (fx/CombatFx.js wake).
export default class Projectile {
  constructor(world, x, y, angle, speed, opts) {
    this.world = world;
    this.x = x; this.y = y;
    this.ox = x; this.oy = y; // trail origin
    this.from = opts.from || null; // where its first step is traced from (the shooter's chest: see Character.fire)
    this.angle = angle;
    this.speed0 = speed;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.team = opts.team;
    this.owner = opts.owner;
    this.weapon = opts.weapon;
    this.life = opts.life ?? 1.2;
    this.energy0 = this.energy = opts.pen ?? 10;
    this.rocket = !!opts.rocket;
    this.floor = opts.floor || null; // the corpse aimed down at (rounds fly over every other one)
    this.dead = false;
    this.ignore = new Set();
    // its way so far, for the score: people killed, a wall or a door gone through, a ricochet
    this.kills = 0; this.through = false; this.bounced = false;
    if (this.rocket) this.img = sprite('weapons/rocket');
    this.look = feelOf(this.weapon).round;
    this.wake = this.look.wake ? combatFx(world).wake(x, y, this.look.wake, this.look.width) : null;
  }

  update(dt) {
    const w = this.world;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    let x0 = this.x, y0 = this.y;
    let x1 = x0 + this.vx * dt, y1 = y0 + this.vy * dt;
    if (this.from) { x0 = this.from.x; y0 = this.from.y; this.from = null; }
    for (let guard = 0; guard < 8; guard++) {
      const hit = w.traceBullet(x0, y0, x1, y1, this.team, this.ignore, this.floor);
      if (!hit) break;
      const skipped = this.bounced;
      const r = this.onHit(hit);
      if (r !== true && this.bounced === skipped && (hit.kind === 'wall' || hit.kind === 'door')) this.through = true;
      if (r === true) { this.x = hit.x; this.y = hit.y; this.dead = true; if (this.wake) this.trace(hit.x, hit.y); return; }
      if (r === false) {
        x0 = hit.x + Math.cos(this.angle) * 0.5;
        y0 = hit.y + Math.sin(this.angle) * 0.5;
        continue;
      }
      // came out somewhere else (exit side, ricochet): carry on from there with what is left of this step
      const left = Math.max(0, Math.hypot(x1 - hit.x, y1 - hit.y) - Math.hypot(r.x - hit.x, r.y - hit.y));
      this.steer(r.a);
      this.ox = r.x; this.oy = r.y;
      if (this.wake) this.trace(hit.x, hit.y, r.x, r.y);
      x0 = r.x + Math.cos(r.a) * 0.5; y0 = r.y + Math.sin(r.a) * 0.5;
      x1 = x0 + Math.cos(r.a) * left; y1 = y0 + Math.sin(r.a) * left;
    }
    this.x = x1; this.y = y1;
    if (this.wake) this.trace(x1, y1);
    if (this.rocket) {
      w.particles.smoke(this.x - this.vx * 0.02, this.y - this.vy * 0.02, 1, 2, { speed: 15, size: 4, life: 0.9 });
      w.particles.fire(this.x - this.vx * 0.03, this.y - this.vy * 0.03, 1, 30);
    }
  }

  // the wake reaches (x, y) and stays fresh; a new leg of it starts at (nx, ny) when the round turns there
  trace(x, y, nx, ny) {
    const wk = this.wake;
    wk.x1 = x; wk.y1 = y; wk.t0 = this.world.time;
    if (nx !== undefined) this.wake = combatFx(this.world).wake(nx, ny, this.look.wake, this.look.width);
  }

  // new heading; speed follows the energy left (kinetic: v ~ sqrt(E))
  steer(a) {
    this.angle = a;
    const v = this.speed0 * Math.max(0.35, Math.sqrt(this.energy / this.energy0));
    this.vx = Math.cos(a) * v;
    this.vy = Math.sin(a) * v;
  }

  // pay `cost` to cross something; true if the round is stopped
  spend(cost) {
    this.energy = afterCost(this.energy, cost);
    return this.energy <= 0;
  }

  // a small random yaw picked up crossing something, bigger the more it cost
  deflect(cost) { return this.angle + rand(-1, 1) * clamp(cost / this.energy0, 0, 1) * 0.12; }

  // grazing hit on a hard surface: the round skips off with part of its energy
  glance(h, hardness) {
    if (h.nx === undefined) return null;
    const na = ricochet(this.angle, h.nx, h.ny, hardness, Math.random());
    if (na === null) return null;
    const w = this.world;
    this.energy *= 0.45;
    this.bounced = true;
    w.particles.sparks(h.x, h.y, na, 0.5, 7, 320);
    w.sound('ricochet', h.x, h.y, 0.7);
    return { x: h.x + h.nx * 0.8, y: h.y + h.ny * 0.8, a: na + rand(-0.08, 0.08) };
  }

  // returns true if the projectile stops, false to go on through the same point, or { x, y, a } to go on from there
  onHit(h) {
    const w = this.world;
    const a = this.angle;
    const heavy = !!this.weapon?.heavy;
    if (this.rocket) {
      w.explode(h.x - Math.cos(a) * 4, h.y - Math.sin(a) * 4, { radius: 100, source: 'rocket' });
      return true;
    }
    switch (h.kind) {
      case 'wall': {
        const s = WALL_IMPACT[w.map.at(h.cx, h.cy)] || WALL_IMPACT.X;
        const g = this.glance(h, HARDNESS[w.map.at(h.cx, h.cy)]);
        if (g) { w.decals.wallHit(h.x, h.y, h.nx, h.ny, 'graze'); return g; }
        const na = Math.atan2(h.ny, h.nx), big = clamp(this.energy0 / 30, 0.6, 2);
        combatFx(w).burst(h.x + h.nx, h.y + h.ny, na, SURFACE);
        // dug into the wall top where it went in (a second round on the same spot digs it out)
        w.decals.wallHit(h.x, h.y, h.nx, h.ny, 'entry', Math.max(1, big * 0.8));
        w.decals.crumbs(h.x + h.nx * 2.5, h.y + h.ny * 2.5, s.chips, randi(s.crumbs[0], s.crumbs[1]), 2.5);
        if (s.sparks) w.particles.sparks(h.x, h.y, na, 0.9, s.sparks, 260);
        w.particles.chips(h.x + h.nx, h.y + h.ny, na, 0.8, Math.round(s.n * big), s.chips, 110);
        // the plaster or brick dust: a jet blown back out of the hole, then a cloud that hangs and settles
        w.particles.dust(h.x + h.nx * 2, h.y + h.ny * 2, s.burst, 1, s.dust, { speed: 12, size: 2.5, life: 0.7, alpha: 0.4, vx: h.nx * 70, vy: h.ny * 70 });
        w.particles.dust(h.x + h.nx * 3, h.y + h.ny * 3, Math.round(s.puff * big), 2.5, s.dust, { speed: 20, size: 4, life: 2.2, alpha: 0.22, vx: h.nx * 16, vy: h.ny * 16 });
        w.sound('impact', h.x, h.y, 0.6);
        const ex = wallExit(w.map, h.x, h.y, a, this.energy);
        // the energy left in the wall wears it, tile by tile (only a blast brings one down: Destruction.damageWall)
        ex.cells.forEach((c, i) => {
          const entry = i === 0 || ex.stopped;
          const px = entry ? h.x - h.nx * 2 : ex.x - Math.cos(a) * 2;
          const py = entry ? h.y - h.ny * 2 : ex.y - Math.sin(a) * 2;
          w.damageWall(c.cx, c.cy, Math.max(0.4, c.cost / 10), px, py, a);
        });
        if (ex.stopped || this.spend(ex.cost)) return true;
        this.exitWall(ex.x, ex.y, a);
        return { x: ex.x, y: ex.y, a: this.deflect(ex.cost) };
      }
      case 'glass':
        h.target.shatter(a, this.owner, this.weapon?.pellets > 1 ? 1.3 : 1);
        if (heavy) h.target.damageFrame(3, a); // a heavy round tears at the frame too
        this.ignore.add(h.target);
        return this.spend(COST.glass);
      case 'prop': {
        const p = h.target;
        const mat = p.isVehicle ? 'metal' : p.def.material;
        const dmg = heavy ? 2 : 1;
        const g = this.glance(h, HARDNESS[mat]);
        if (g) {
          if (p.isVehicle) p.hit(dmg, h.x, h.y, a, 0.3, 'pellet');
          else p.hit(dmg, h.x, h.y, a, 0.3, 'graze', { nx: h.nx, ny: h.ny, energy: this.energy, ricochet: true });
          return g;
        }
        const kind = this.weapon?.pellets > 1 ? 'pellet' : this.weapon?.ammo === '762' ? 'rifle' : 'bullet';
        this.ignore.add(p);
        combatFx(w).burst(h.x, h.y, a + Math.PI, SURFACE);
        const out = bodyExit(p.body.vertices, h.x, h.y, a);
        const cost = !out ? Infinity : p.isVehicle ? COST.vehicle : (RESIST[mat] ?? 1) * out.len;
        if (p.isVehicle) p.hit(dmg, h.x, h.y, a, this.weapon?.pellets > 1 ? 0.6 : 1, kind);
        else {
          // the prop paints the entry, and the exit blow-out with what energy the round still has there
          const left = out ? afterCost(this.energy, cost) : 0;
          p.hit(dmg, h.x, h.y, a, this.weapon?.pellets > 1 ? 0.6 : 1, kind,
            { nx: h.nx, ny: h.ny, energy: this.energy, exit: left > 0 ? { x: out.x, y: out.y, energy: left } : null });
        }
        if (!out || this.spend(cost)) return true;
        if (p.isVehicle && !p.dead) p.exitWound(out.x, out.y, a, clamp(0.7 + this.energy0 / 60, 0.8, 2.2));
        return { x: out.x, y: out.y, a: this.deflect(cost) };
      }
      case 'door': {
        const d = h.target;
        d.hit(h.x, h.y, a, heavy ? 3 : 1, 'bullet');
        combatFx(w).burst(h.x, h.y, a + Math.PI, SURFACE);
        this.ignore.add(d);
        const out = bodyExit(d.body.vertices, h.x, h.y, a);
        if (!out) return true;
        const cost = RESIST.wood * Math.max(4, out.len);
        if (this.spend(cost)) return true;
        return { x: out.x, y: out.y, a: this.deflect(cost) };
      }
      case 'char': {
        const c = h.target;
        if (c.ducking) { // sliding under the line of fire: the round carries on over him
          this.ignore.add(c);
          c.dodge();
          return { x: h.x, y: h.y, a };
        }
        const d = Math.hypot(c.x - this.owner?.x, c.y - this.owner?.y) || 999;
        c.shot(a, this.weapon, d, this.owner, {
          dist: d, pierced: this.kills, through: this.through, bounced: this.bounced, last: this.owner?.weapon?.mag === 0,
        });
        if (!c.alive) this.kills++;
        this.ignore.add(c);
        if (this.spend(COST.flesh)) return true;
        // through and through: the exit wound sprays forward
        const ex = c.x + Math.cos(a) * (c.radius + 1), ey = c.y + Math.sin(a) * (c.radius + 1);
        const exit = woundFor('bullet', this.weapon).exit;
        if (exit) {
          w.particles.blood(ex, ey, a, exit[2], exit[0], exit[1]);
          w.decals.stampBlood(ex + Math.cos(a) * rand(10, 30), ey + Math.sin(a) * rand(10, 30), 2 + exit[0] / 8, 4);
        }
        return { x: ex, y: ey, a: this.deflect(COST.flesh) };
      }
      case 'corpse': {
        // desecration: the body jerks, more blood
        const c = h.target;
        this.ignore.add(c);
        if (h.part) c.shotPart(h.part, a, this.weapon);
        else {
          impulse(c.body, a, 18, (Math.random() - 0.5) * 0.15, 3);
          w.particles.blood(h.x, h.y, a, 0.5, 10, 220);
          w.particles.blood(h.x, h.y, a + Math.PI, 0.6, 3, 80);
          w.decals.stampBlood(h.x, h.y, 3, 3);
          c.pool = Math.min(c.poolMax + 4, c.pool + 1.5);
          w.sound('splat', h.x, h.y, 0.35);
        }
        return true; // shot down into the body: the round ends in the floor
      }
      case 'item':
        impulse(h.target.body, a, 8, (Math.random() - 0.5) * 0.5, 4);
        w.particles.sparks(h.x, h.y, a + Math.PI, 0.8, 4, 240);
        w.sound('metal', h.x, h.y, 0.4);
        this.ignore.add(h.target);
        return false;
      case 'debris':
        impulse(h.target.body, a, 4, (Math.random() - 0.5) * 0.5, 4);
        this.ignore.add(h.target);
        return false;
      default:
        return true;
    }
  }

  // the far side of a wall a round went through: a wider spalled hole, plaster and dust blown forward
  exitWall(x, y, a) {
    const w = this.world;
    const k = clamp(this.energy0 / 40, 0.6, 2);
    const c = Math.cos(a), s = Math.sin(a);
    const back = (v, d) => Math.floor((v - d * 3) / TILE);
    const col = w.map.chipColor(back(x, c), back(y, s));
    const [nx, ny] = faceNormal(w.map, x + c * 1.5, y + s * 1.5, x - c * 1.5, y - s * 1.5);
    w.decals.wallHit(x, y, nx, ny, 'exit', 1 + k * 0.6);
    w.decals.crumbs(x + c * 3, y + s * 3, col, Math.round(2 + k * 2), 4);
    w.particles.chips(x, y, a, 0.7, Math.round(4 + k * 4), col, 160 + k * 60);
    w.particles.smoke(x, y, 1 + Math.round(k), 2, { speed: 40, size: 3 + k * 2, life: 0.8 });
  }

  draw(ctx) {
    if (this.rocket) {
      drawSprite(ctx, this.img, this.x, this.y, this.angle);
      return;
    }
    const R = this.look;
    let tx = this.x - this.vx * R.len, ty = this.y - this.vy * R.len;
    // do not draw the trail behind the muzzle
    if ((tx - this.ox) * this.vx + (ty - this.oy) * this.vy < 0) { tx = this.ox; ty = this.oy; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,200,90,0.35)';
    ctx.lineWidth = R.width;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.strokeStyle = '#fff6d0';
    ctx.lineWidth = R.core;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

