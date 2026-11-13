import { CAT, MASK, PALETTE } from '../core/Config.js';
import { WEAPONS } from '../data/weapons.js';
import { sprite, drawSprite, silhouette } from '../core/Assets.js';
import { rand, spread, angDiff, local, lerp, clamp } from '../core/math.js';
import { gore } from '../fx/Gore.js';
import Projectile from './Projectile.js';
import Debris from './Debris.js';
import WeaponItem from './WeaponItem.js';

const { Bodies, Body } = Matter;

export const KINDS = {
  player: { arm: '#1fb5b5', skin: '#f2c493' },
  thug: { arm: '#e6e0cf', skin: '#e0a878' },
  heavy: { arm: '#4b2470', skin: '#c88a60' },
  brute: { arm: '#d89a70', skin: '#d89a70' },
};

const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// Shared body / weapon / animation logic for the player and enemies.
export default class Character {
  constructor(world, x, y, angle, kind, team) {
    this.world = world;
    this.kind = kind;
    this.team = team;
    this.look = KINDS[kind];
    this.radius = 8.5;
    this.body = Bodies.circle(x, y, this.radius, {
      frictionAir: 0, friction: 0, frictionStatic: 0, restitution: 0, label: kind,
      collisionFilter: { category: CAT.CHAR, mask: MASK.CHAR },
    });
    Body.setDensity(this.body, 0.002);
    Body.setInertia(this.body, Infinity);
    this.body.sleepThreshold = Infinity;
    this.body.entity = this;
    this.angle = angle;
    this.moveAngle = angle;
    this.vel = { x: 0, y: 0 };
    this.walk = 0;
    this.moving = 0;
    this.weapon = null;
    this.cooldown = 0;
    this.swing = 0;
    this.swingDur = 1;
    this.punchSide = 1;
    this.recoil = 0;
    this.alive = true;
    this.knocked = 0;
    this.downAngle = 0;
    this.torso = sprite(`characters/${kind}_torso`);
    this.downImg = sprite(`characters/${kind}_down`);
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; }
  get armed() { return !!this.weapon; }

  setWeapon(type, ammo) {
    this.weapon = type ? { type, ammo: ammo ?? WEAPONS[type].ammo ?? Infinity } : null;
  }

  // desired direction (dx, dy), speed in px/step
  steer(dx, dy, speed, accel = 0.35) {
    const len = Math.hypot(dx, dy);
    const tx = len > 0.001 ? (dx / len) * speed : 0;
    const ty = len > 0.001 ? (dy / len) * speed : 0;
    this.vel.x += (tx - this.vel.x) * accel;
    this.vel.y += (ty - this.vel.y) * accel;
    Body.setVelocity(this.body, this.vel);
  }

  baseUpdate(dt) {
    this.cooldown -= dt;
    this.swing = Math.max(0, this.swing - dt);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const v = Body.getVelocity(this.body);
    const sp = Math.hypot(v.x, v.y);
    this.moving = sp;
    if (sp > 0.25) { this.walk += sp * dt * 6; this.moveAngle = Math.atan2(v.y, v.x); }
  }

  // ---------------- combat ----------------
  attack() {
    if (this.cooldown > 0 || !this.alive || this.knocked) return false;
    const d = this.def;
    if (d.kind === 'gun') {
      if (this.weapon.ammo <= 0) {
        this.cooldown = 0.25;
        this.world.sound('click', this.x, this.y);
        return 'empty';
      }
      this.fire(d);
      this.cooldown = d.rate;
      return true;
    }
    this.cooldown = d.rate;
    this.swingDur = this.swing = d.rate * 0.85;
    this.punchSide *= -1;
    this.world.sound('swing', this.x, this.y, 0.6);
    this.world.after(d.windup, () => this.meleeStrike(d));
    return true;
  }

  muzzlePos() {
    const d = this.def;
    const img = sprite(d.sprite);
    const lx = (d.hold === 'two' ? 5 : 10) + img.width - d.grip;
    return local(this.x, this.y, this.angle, lx, d.hold === 'two' ? 2 : 1);
  }

  fire(d) {
    const w = this.world;
    const a = this.angle;
    const enemy = this.team === 'enemy';
    for (let i = 0; i < d.pellets; i++) {
      const sp = d.spread * spread() + (enemy ? rand(-0.035, 0.035) : 0);
      const speed = d.speed * (1 + (d.speedVar || 0) * rand(-1, 1));
      w.addProjectile(new Projectile(w, this.x + Math.cos(a) * 4, this.y + Math.sin(a) * 4, a + sp, speed, {
        team: this.team, owner: this, weapon: d, life: d.range ?? 1.1, pierce: d.pierce || 0, rocket: d.rocket,
      }));
    }
    const m = this.muzzlePos();
    w.muzzleFlash(m.x, m.y, a, d);
    if (d.casing) {
      const ca = a + Math.PI / 2 + rand(-0.4, 0.3);
      const v = rand(70, 140);
      w.addDebris(new Debris(w, sprite('weapons/' + d.casing), this.x + Math.cos(a) * 6, this.y + Math.sin(a) * 6, a,
        Math.cos(ca) * v, Math.sin(ca) * v, rand(-0.9, 0.9), { metal: true, air: 0.08, shadow: 0, density: 0.001, bounce: 0.5 }));
    }
    w.sound(d.sound, this.x, this.y);
    // only the player's gunfire draws the guards in
    if (d.noise && this.isPlayer) w.noise(this.x, this.y, d.noise, this);
    this.recoil = 1;
    this.weapon.ammo--;
    this.vel.x -= Math.cos(a) * d.kick * 0.12;
    this.vel.y -= Math.sin(a) * d.kick * 0.12;
    if (this.isPlayer) {
      w.shake(d.shake);
      w.camera.push(-Math.cos(a) * d.kick, -Math.sin(a) * d.kick);
    }
  }

  meleeStrike(d) {
    if (!this.alive || this.knocked) return;
    const w = this.world, a = this.angle, x = this.x, y = this.y;
    let hit = false;
    for (const c of w.characters()) {
      if (c === this || !c.alive || c.team === this.team) continue;
      const dx = c.x - x, dy = c.y - y, dd = Math.hypot(dx, dy);
      if (dd > d.range + c.radius) continue;
      if (Math.abs(angDiff(a, Math.atan2(dy, dx))) > d.arc / 2 && dd > c.radius + 5) continue;
      if (!w.lineOfSight(x, y, c.x, c.y)) continue;
      hit = true;
      if (d.lethal || c.isPlayer) c.kill(a, d === WEAPONS.knife ? 'slash' : 'melee', this, d.gore ?? 0.3);
      else c.knock(a, 'punch');
    }
    for (const p of w.props) {
      if (p.dead) continue;
      const dx = p.x - x, dy = p.y - y, dd = Math.hypot(dx, dy);
      if (dd > d.range + 12 || Math.abs(angDiff(a, Math.atan2(dy, dx))) > d.arc / 2) continue;
      p.hit(d.lethal ? 2 : 1, x + Math.cos(a) * d.range * 0.8, y + Math.sin(a) * d.range * 0.8, a, 2.5);
      hit = true;
    }
    for (const win of w.windows) {
      if (win.intact && Math.hypot(win.x - x, win.y - y) < d.range + 12) { win.shatter(a); hit = true; }
    }
    for (const door of w.doors) {
      const t = door.tip();
      const mx = (door.hx + t.x) / 2, my = (door.hy + t.y) / 2;
      if (Math.hypot(mx - x, my - y) < d.range + 14) {
        Body.applyForce(door.body, { x: mx, y: my }, { x: Math.cos(a) * 0.004, y: Math.sin(a) * 0.004 });
        if (this.isPlayer) door.pushedByPlayer = 0.8;
      }
    }
    if (hit) w.sound(d.sound, x, y);
  }

  // hit by a projectile
  shot(angle, weaponDef, distance, shooter) {
    let cause = 'bullet';
    if (weaponDef?.pellets > 1) cause = distance < 120 ? 'blast' : 'bullet';
    else if (weaponDef?.pierce) cause = 'heavy';
    this.kill(angle, cause, shooter, weaponDef?.gore ?? 0.3);
  }

  kill(angle, cause, killer, goreMul = 1) {
    if (!this.alive) return;
    this.alive = false;
    this.dropWeapon(angle + rand(-1, 1), rand(1.5, 3.5));
    this.world.removeBody(this.body);
    gore(this.world, this, angle, cause, goreMul);
    this.world.onKill(this, cause, killer);
  }

  knock() { /* overridden by Enemy */ }

  dropWeapon(angle, speed = 2) {
    if (!this.weapon) return;
    const w = this.world;
    w.addItem(new WeaponItem(w, this.weapon.type, this.weapon.ammo === Infinity ? (this.def.ammo ?? Infinity) : this.weapon.ammo,
      this.x, this.y, rand(0, 6.28), Math.cos(angle) * speed, Math.sin(angle) * speed, rand(-0.3, 0.3)));
    this.weapon = null;
  }

  // ---------------- rendering ----------------
  draw(ctx) {
    const x = this.x, y = this.y;
    if (this.knocked > 0) {
      drawSprite(ctx, silhouette(this.downImg), x + 2, y + 2, this.downAngle, 0.35);
      drawSprite(ctx, this.downImg, x, y, this.downAngle);
      // dizzy stars
      const t = this.world.time * 6;
      ctx.fillStyle = PALETTE.yellow;
      for (let i = 0; i < 3; i++) {
        const sa = t + (i * Math.PI * 2) / 3;
        const h = local(x, y, this.downAngle, 9, 0);
        ctx.fillRect(h.x + Math.cos(sa) * 6 - 1, h.y + Math.sin(sa) * 3 - 4, 2, 2);
      }
      return;
    }
    // feet
    ctx.fillStyle = '#1a1214';
    const stride = this.moving > 0.25 ? Math.sin(this.walk) * 5 : 0;
    const fa = this.moving > 0.25 ? this.moveAngle : this.angle;
    for (const side of [-1, 1]) {
      const f = local(x, y, fa, stride * side + 1, side * 3.6);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(fa);
      ctx.fillRect(-3, -1.8, 6, 3.6);
      ctx.restore();
    }
    drawSprite(ctx, silhouette(this.torso), x + 2, y + 2, this.angle, 0.35);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.angle);
    this.drawArms(ctx);
    ctx.restore();
    drawSprite(ctx, this.torso, x, y, this.angle);
  }

  drawArms(ctx) {
    const d = this.def;
    const rc = this.recoil * 3;
    const swingP = this.swing > 0 ? 1 - this.swing / this.swingDur : 1;
    let hl, hr, wpn = null;
    if (d.hold === 'none') {
      const ext = this.swing > 0 ? Math.sin(Math.PI * swingP) : 0;
      hl = { x: 6 + (this.punchSide < 0 ? ext * 9 : 0), y: -6 + (this.punchSide < 0 ? ext * 4 : 0) };
      hr = { x: 6 + (this.punchSide > 0 ? ext * 9 : 0), y: 6 - (this.punchSide > 0 ? ext * 4 : 0) };
    } else if (d.hold === 'one') {
      hr = { x: 10 - rc, y: 1.5 };
      hl = { x: 9 - rc, y: -0.5 };
      wpn = { x: hr.x, y: 1, a: 0 };
    } else if (d.hold === 'two') {
      hr = { x: 5 - rc, y: 3 };
      wpn = { x: hr.x, y: 2, a: 0 };
      hl = { x: hr.x + sprite(d.sprite).width * 0.5, y: 1 };
    } else {
      const rest = d === WEAPONS.bat ? 2.1 : 0.9;
      let wa = rest;
      if (this.swing > 0) {
        const p = swingP;
        wa = p < 0.55 ? lerp(1.8, -1.7, easeOut(p / 0.55)) : lerp(-1.7, rest, easeOut((p - 0.55) / 0.45));
      }
      hr = { x: 3 + Math.cos(wa) * 7, y: 2 + Math.sin(wa) * 7 };
      wpn = { x: hr.x, y: hr.y, a: wa };
      hl = { x: 6, y: -6 };
      if (this.swing > 0 && swingP < 0.6) {
        // swing trail
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(3, 2, d.range * 0.85, Math.max(-1.7, wa), 1.8);
        ctx.stroke();
        ctx.restore();
      }
    }
    const arm = (h, sy) => {
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(h.x, h.y); ctx.stroke();
      ctx.strokeStyle = this.look.arm;
      ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(h.x, h.y); ctx.stroke();
    };
    ctx.lineCap = 'round';
    arm(hl, -6);
    arm(hr, 6);
    if (wpn) {
      const img = sprite(d.sprite);
      ctx.save();
      ctx.translate(wpn.x, wpn.y);
      ctx.rotate(wpn.a);
      ctx.drawImage(img, -d.grip, -img.height / 2);
      ctx.restore();
    }
    for (const h of [hl, hr]) {
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(h.x - 2.2, h.y - 2.2, 4.4, 4.4);
      ctx.fillStyle = this.look.skin;
      ctx.fillRect(h.x - 1.4, h.y - 1.4, 2.8, 2.8);
    }
  }
}
