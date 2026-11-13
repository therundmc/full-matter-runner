import { ENEMY, TILE, CAT, MASK, PALETTE } from '../core/Config.js';
import { rand, angDiff, approachAngle, chance, clamp } from '../core/math.js';
import { findPath } from '../core/Pathfinding.js';
import Character from './Character.js';

const { Body } = Matter;

const S = { IDLE: 'idle', PATROL: 'patrol', COMBAT: 'combat', CHASE: 'chase', SEARCH: 'search', INVESTIGATE: 'investigate', FETCH: 'fetch', RETURN: 'return' };

export default class Enemy extends Character {
  constructor(world, x, y, angle, kind, weapon, roam = false) {
    super(world, x, y, angle, kind, 'enemy');
    this.isEnemy = true;
    this.radius = ENEMY.radius;
    this.setWeapon(weapon, Infinity);
    this.home = { x, y, angle };
    this.roam = roam;
    this.state = roam ? S.PATROL : S.IDLE;
    this.path = null;
    this.pathIdx = 0;
    this.repath = 0;
    this.wait = rand(0.5, 2);
    this.react = 0;
    this.lost = 0;
    this.lastSeen = null;
    this.searchT = 0;
    this.burst = 0;
    this.alertIcon = 0;
    this.icon = '';
    this.stuck = 0;
    this.lookPhase = rand(0, 6);
    this.speedMul = kind === 'brute' ? 1.12 : kind === 'heavy' ? 0.9 : 1;
    this.executing = false;
  }

  // ---------------- perception ----------------
  canSee(p) {
    if (!p.alive) return false;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > ENEMY.viewDist) return false;
    if (d > ENEMY.closeSense && Math.abs(angDiff(this.angle, Math.atan2(dy, dx))) > ENEMY.fov / 2) return false;
    return this.world.lineOfSight(this.x, this.y, p.x, p.y);
  }

  // gunshot / glass / explosion heard
  hear(x, y, isPlayerNoise) {
    if (!this.alive || this.knocked || this.state === S.COMBAT) return;
    this.lastSeen = { x, y };
    this.setState(S.INVESTIGATE);
    this.icon = '?';
    this.alertIcon = 1.2;
    if (isPlayerNoise) this.react = Math.min(this.react, 0.25);
  }

  setState(s) {
    this.state = s;
    this.path = null;
    this.repath = 0;
    this.stuck = 0;
  }

  // ---------------- main update ----------------
  update(dt) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    this.alertIcon = Math.max(0, this.alertIcon - dt);
    const p = this.world.player;

    if (this.knocked > 0) { this.updateKnocked(dt); return; }

    const sees = p && p.alive && this.canSee(p);
    if (sees) {
      this.lastSeen = { x: p.x, y: p.y };
      this.lost = 0;
      if (this.state !== S.COMBAT) {
        const wasAlert = this.state === S.CHASE || this.state === S.SEARCH || this.state === S.INVESTIGATE;
        this.setState(S.COMBAT);
        this.react = wasAlert ? rand(0.15, 0.25) : rand(...ENEMY.reaction);
        this.icon = '!';
        this.alertIcon = 0.8;
        this.world.sound('alert', this.x, this.y);
      }
    }

    switch (this.state) {
      case S.IDLE: this.doIdle(dt); break;
      case S.PATROL: this.doPatrol(dt); break;
      case S.COMBAT: this.doCombat(dt, sees, p); break;
      case S.CHASE: this.doChase(dt); break;
      case S.INVESTIGATE: this.doInvestigate(dt); break;
      case S.SEARCH: this.doSearch(dt); break;
      case S.FETCH: this.doFetch(dt); break;
      case S.RETURN: this.doReturn(dt); break;
      default: break;
    }
  }

  doIdle(dt) {
    this.steer(0, 0, 0, 0.3);
    this.lookPhase += dt * 0.6;
    this.angle = approachAngle(this.angle, this.home.angle + Math.sin(this.lookPhase) * 0.5, dt * 2);
  }

  doPatrol(dt) {
    if (this.wait > 0) {
      this.wait -= dt;
      this.steer(0, 0, 0, 0.3);
      this.lookPhase += dt;
      this.angle = approachAngle(this.angle, this.angle + Math.sin(this.lookPhase * 2) * 0.6, dt * 2);
      return;
    }
    if (!this.path) {
      const t = this.randomPoint(this.home.x, this.home.y, 7);
      if (!t || !this.goTo(t.x, t.y)) { this.wait = rand(0.5, 1.5); return; }
    }
    if (this.follow(dt, ENEMY.walkSpeed)) { this.path = null; this.wait = rand(1, 3); }
  }

  doCombat(dt, sees, p) {
    const d = this.def;
    if (!sees) {
      this.lost += dt;
      if (this.lost > 0.35) {
        this.setState(S.CHASE);
        this.goTo(this.lastSeen.x, this.lastSeen.y);
      } else this.steer(0, 0, 0, 0.2);
      return;
    }
    const dx = p.x - this.x, dy = p.y - this.y, dist = Math.hypot(dx, dy);
    const toP = Math.atan2(dy, dx);
    this.angle = approachAngle(this.angle, toP, ENEMY.turnRate * dt);
    this.react -= dt;

    if (!this.armed && d.kind !== 'melee') { this.lookForWeapon(); return; }

    if (d.kind === 'melee') {
      // rush in
      if (this.world.map.walkLine(this.x, this.y, p.x, p.y, 6)) this.steer(dx, dy, ENEMY.runSpeed * this.speedMul, 0.3);
      else this.chaseTarget(dt, p.x, p.y, ENEMY.runSpeed * this.speedMul);
      if (dist < d.range + p.radius - 2 && this.react <= 0) this.attack();
      return;
    }

    // gunner: keep distance, shoot when aligned
    if (dist > 230) this.steer(dx, dy, ENEMY.runSpeed * 0.55, 0.15);
    else if (dist < 70) this.steer(-dx, -dy, ENEMY.walkSpeed, 0.15);
    else this.steer(0, 0, 0, 0.15);
    if (this.react <= 0 && Math.abs(angDiff(this.angle, toP)) < 0.18 && dist < 420 && this.cooldown <= 0) {
      this.fire(d);
      this.weapon.ammo = Infinity;
      if (d.burst) {
        this.burst++;
        this.cooldown = this.burst >= d.burst ? rand(0.5, 0.8) : d.rate * 1.1;
        if (this.burst >= d.burst) this.burst = 0;
      } else this.cooldown = d.enemyRate * rand(0.85, 1.25);
    }
  }

  doChase(dt) {
    if (!this.lastSeen) { this.setState(S.SEARCH); return; }
    if (!this.path) this.goTo(this.lastSeen.x, this.lastSeen.y);
    if (this.follow(dt, ENEMY.runSpeed * this.speedMul) || !this.path) {
      this.setState(S.SEARCH);
      this.searchT = rand(4, 6);
    }
  }

  doInvestigate(dt) {
    if (!this.path && !this.goTo(this.lastSeen.x, this.lastSeen.y)) { this.setState(S.SEARCH); this.searchT = 3; return; }
    if (this.follow(dt, ENEMY.runSpeed * 0.85 * this.speedMul)) { this.setState(S.SEARCH); this.searchT = rand(3, 5); }
  }

  doSearch(dt) {
    this.searchT -= dt;
    if (this.searchT <= 0) { this.setState(S.RETURN); return; }
    if (!this.armed && this.def.kind !== 'melee' && this.lookForWeapon()) return;
    if (this.wait > 0) {
      this.wait -= dt;
      this.steer(0, 0, 0, 0.3);
      this.angle += dt * 2.5 * (this.lookPhase > 3 ? 1 : -1);
      return;
    }
    if (!this.path) {
      const t = this.randomPoint(this.x, this.y, 5);
      if (!t || !this.goTo(t.x, t.y)) { this.wait = 0.6; return; }
    }
    if (this.follow(dt, ENEMY.walkSpeed * 1.4)) { this.path = null; this.wait = rand(0.4, 1.2); }
  }

  doReturn(dt) {
    if (this.roam) { this.setState(S.PATROL); return; }
    if (!this.path && !this.goTo(this.home.x, this.home.y)) { this.setState(S.IDLE); return; }
    if (this.follow(dt, ENEMY.walkSpeed)) { this.setState(S.IDLE); }
  }

  lookForWeapon() {
    let best = null, bd = 260;
    for (const it of this.world.items) {
      if (it.dead || it.speed > 2) continue;
      const d = Math.hypot(it.x - this.x, it.y - this.y);
      if (d < bd) { bd = d; best = it; }
    }
    if (best && this.goTo(best.x, best.y)) {
      this.fetchTarget = best;
      this.state = S.FETCH;
      return true;
    }
    // nothing around: fight with fists
    this.setWeapon(null);
    return false;
  }

  doFetch(dt) {
    const it = this.fetchTarget;
    if (!it || it.dead) { this.setState(S.SEARCH); this.searchT = 3; return; }
    if (Math.hypot(it.x - this.x, it.y - this.y) < 14) {
      this.setWeapon(it.type, Infinity);
      this.world.removeItem(it);
      this.world.sound('pickup', this.x, this.y, 0.5);
      this.setState(this.lastSeen ? S.CHASE : S.SEARCH);
      this.searchT = 4;
      return;
    }
    this.repath -= dt;
    if (this.repath <= 0) { this.goTo(it.x, it.y); this.repath = 0.5; }
    if (this.follow(dt, ENEMY.runSpeed * this.speedMul)) this.path = null;
  }

  // ---------------- movement helpers ----------------
  goTo(x, y) {
    const path = findPath(this.world.map, this.x, this.y, x, y);
    if (!path || !path.length) { this.path = null; return false; }
    this.path = path;
    this.pathIdx = 0;
    return true;
  }

  chaseTarget(dt, x, y, speed) {
    this.repath -= dt;
    if (this.repath <= 0 || !this.path) { this.goTo(x, y); this.repath = 0.45; }
    this.follow(dt, speed, true);
  }

  // returns true when the path end is reached
  follow(dt, speed, keepAngle = false) {
    if (!this.path) return true;
    const t = this.path[this.pathIdx];
    const dx = t.x - this.x, dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 7) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; this.steer(0, 0, 0, 0.4); return true; }
      return false;
    }
    this.steer(dx, dy, speed, 0.25);
    if (!keepAngle) this.angle = approachAngle(this.angle, Math.atan2(dy, dx), dt * 8);
    // stuck detection (furniture, other bodies)
    if (this.moving < speed * 0.25) {
      this.stuck += dt;
      if (this.stuck > 0.7) {
        this.stuck = 0;
        const side = Math.atan2(dy, dx) + (chance(0.5) ? 1.4 : -1.4);
        Body.setVelocity(this.body, { x: Math.cos(side) * speed, y: Math.sin(side) * speed });
        const end = this.path[this.path.length - 1];
        this.goTo(end.x, end.y);
      }
    } else this.stuck = 0;
    return false;
  }

  randomPoint(cx, cy, radiusTiles) {
    const map = this.world.map;
    for (let i = 0; i < 12; i++) {
      const x = cx + rand(-radiusTiles, radiusTiles) * TILE, y = cy + rand(-radiusTiles, radiusTiles) * TILE;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (map.isBlocked(tx, ty)) continue;
      return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    return null;
  }

  // ---------------- knock-down ----------------
  knock(angle, cause) {
    if (!this.alive || this.knocked > 0) return;
    this.knocked = ENEMY.knockTime * (cause === 'door' ? 1.2 : 1);
    this.downAngle = angle + Math.PI;
    this.dropWeapon(angle + rand(-0.8, 0.8), rand(2, 4));
    this.body.collisionFilter = { category: CAT.CORPSE, mask: MASK.CORPSE, group: 0 };
    const sp = cause === 'punch' ? 3 : 4.5;
    this.vel = { x: Math.cos(angle) * sp, y: Math.sin(angle) * sp };
    Body.setVelocity(this.body, this.vel);
    this.world.particles.blood(this.x, this.y, angle, 0.6, 6, 120);
    this.swing = 0;
  }

  updateKnocked(dt) {
    if (this.executing) { this.steer(0, 0, 0, 0.5); return; }
    this.knocked -= dt;
    this.steer(0, 0, 0, 0.08);
    if (this.knocked <= 0) {
      this.knocked = 0;
      this.body.collisionFilter = { category: CAT.CHAR, mask: MASK.CHAR, group: 0 };
      this.angle = this.downAngle + Math.PI;
      const p = this.world.player;
      this.lastSeen = p ? { x: p.x, y: p.y } : null;
      this.setState(S.SEARCH);
      this.searchT = 4;
      this.react = 0.3;
      if (!this.armed && this.kind !== 'brute') this.lookForWeapon();
    }
  }

  draw(ctx) {
    super.draw(ctx);
    if (this.alertIcon > 0 && this.alive && !this.knocked) {
      const a = clamp(this.alertIcon * 3, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '10px joystix';
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(this.icon, this.x + 1, this.y - 13);
      ctx.fillStyle = this.icon === '!' ? PALETTE.pink : PALETTE.yellow;
      ctx.fillText(this.icon, this.x, this.y - 14);
      ctx.globalAlpha = 1;
    }
  }

  // debug: vision cone
  drawVision(ctx) {
    if (!this.alive || this.knocked) return;
    ctx.fillStyle = this.state === S.COMBAT ? 'rgba(255,40,80,0.08)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, ENEMY.viewDist, this.angle - ENEMY.fov / 2, this.angle + ENEMY.fov / 2);
    ctx.closePath();
    ctx.fill();
  }
}

