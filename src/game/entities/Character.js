import { CAT, MASK, PALETTE, ENEMY } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { sprite, spriteOpt, chunk, drawSprite, silhouette } from '../../engine/Assets.js';
import { rand, spread, angDiff, local, lerp, clamp } from '../../engine/math.js';
import { gore } from '../fx/Gore.js';
import Projectile from './Projectile.js';
import { setKg, impulse } from '../../engine/physics/Body.js';
import { findVault } from '../systems/Cover.js';
import Debris from './Debris.js';
import WeaponItem from './WeaponItem.js';
import AmmoItem from './AmmoItem.js';

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
    setKg(this.body, kind === 'brute' ? 110 : kind === 'heavy' ? 100 : 80);
    Body.setInertia(this.body, Infinity);
    this.pushFactor = 1; // < 1 while leaning into something heavy (set by World from contacts)
    this.body.sleepThreshold = Infinity;
    this.body.entity = this;
    this.body.material = 'flesh';
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
    this.reloading = 0;
    this.reloadDur = 1;
    this.reloadStage = 0;
    this.pickAnim = 0;
    this.vaulting = null;   // { from, to, t, dur, kind } while jumping over something
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

  // weapon instance: { type, mag (rounds in the gun), reserve (enemies: spare mags, or loose rounds for shotguns) }
  setWeapon(type, mag, reserve = 0) {
    this.weapon = type ? { type, mag: mag ?? WEAPONS[type].mag ?? 0, reserve } : null;
    this.reloading = 0;
  }

  // spare ammo for the current gun: number of mags, or loose rounds (the player overrides these with an inventory)
  reserveCount() { return this.weapon ? this.weapon.reserve : 0; }
  takeMag() { this.weapon.reserve--; return this.def.mag; }
  takeRound() { this.weapon.reserve--; }

  get canReload() {
    const d = this.def;
    return d.kind === 'gun' && this.reloading <= 0 && this.weapon.mag < d.mag && this.reserveCount() > 0;
  }

  // start a reload: magazine weapons swap the whole mag (what is left in it falls with it), shotguns load round by round
  reload() {
    if (!this.canReload || !this.alive || this.knocked) return false;
    const d = this.def;
    this.reloadDur = this.reloading = d.reload;
    this.reloadStage = 0;
    this.world.sound(d.shellReload ? 'shellIn' : 'magOut', this.x, this.y, 0.7);
    return true;
  }

  updateReload(dt) {
    if (this.reloading <= 0 || !this.weapon) return;
    const d = this.def;
    this.reloading -= dt;
    const p = 1 - this.reloading / this.reloadDur;
    if (d.shellReload) {
      if (this.reloading <= 0) {
        this.weapon.mag++;
        this.takeRound();
        this.world.sound('shellIn', this.x, this.y, 0.6);
        if (this.weapon.mag < d.mag && this.reserveCount() > 0) this.reloadDur = this.reloading = d.reload;
        else { this.reloading = 0; this.world.sound('rack', this.x, this.y, 0.8); this.recoil = 0.8; }
      }
      return;
    }
    if (this.reloadStage === 0 && p > 0.08) {
      this.reloadStage = 1;
      this.dropMag();
    }
    if (this.reloadStage === 1 && p > 0.7) {
      this.reloadStage = 2;
      this.weapon.mag = this.takeMag();
      this.world.sound('magIn', this.x, this.y, 0.8);
    }
    if (this.reloadStage === 2 && p > 0.86) {
      this.reloadStage = 3;
      this.world.sound('rack', this.x, this.y, 0.8);
      this.recoil = 0.9;
    }
    if (this.reloading <= 0) this.reloading = 0;
  }

  // the old magazine falls out and clatters on the floor, with whatever rounds were left in it
  dropMag() {
    const d = this.def;
    const left = this.weapon.mag;
    this.weapon.mag = 0;
    const g = local(this.x, this.y, this.angle, d.hold === 'two' ? 9 : 8, 2);
    const a = this.angle + Math.PI / 2 + rand(-0.6, 0.6);
    const v = rand(30, 70);
    if (left > 0) {
      // a partial mag: can be picked up again later
      this.world.ammoItems.push(new AmmoItem(this.world, d.ammo, left, g.x, g.y, Math.cos(a) * v / 60, Math.sin(a) * v / 60, 2.5,
        spriteOpt(d.magSprite)));
      return;
    }
    const img = spriteOpt(d.magSprite) || chunk('#2a2a33', 3, 6);
    this.world.addDebris(new Debris(this.world, img, g.x, g.y, this.angle + Math.PI / 2, Math.cos(a) * v, Math.sin(a) * v,
      rand(-0.4, 0.4), { material: 'metal', air: 0.1, kg: 0.15, mu: 0.4, fly: 0.25, bounce: 0.3 }));
  }

  // desired direction (dx, dy), speed in px/step
  steer(dx, dy, speed, accel = 0.35) {
    speed *= this.pushFactor;
    // contacts flicker between physics sub-steps: let the effort fade out instead of snapping back
    this.pushFactor = Math.min(1, this.pushFactor + 0.06);
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
    this.pickAnim = Math.max(0, this.pickAnim - dt);
    this.updateReload(dt);
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
      // firing interrupts a shell-by-shell reload
      if (this.reloading > 0) {
        if (!d.shellReload || this.weapon.mag <= 0) return false;
        this.reloading = 0;
      }
      if (this.weapon.mag <= 0) {
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
      const sp = d.spread * spread() + (enemy ? rand(-ENEMY.aimError, ENEMY.aimError) : 0);
      const speed = d.speed * (1 + (d.speedVar || 0) * rand(-1, 1));
      const pr = new Projectile(w, this.x + Math.cos(a) * 4, this.y + Math.sin(a) * 4, a + sp, speed, {
        team: this.team, owner: this, weapon: d, life: d.range ?? 1.1, pen: d.pen ?? 10, rocket: d.rocket,
      });
      w.addProjectile(pr);
    }
    const m = this.muzzlePos();
    w.muzzleFlash(m.x, m.y, a, d);
    if (d.casing) {
      const ca = a + Math.PI / 2 + rand(-0.4, 0.3);
      const v = rand(70, 140);
      w.addDebris(new Debris(w, sprite('weapons/' + d.casing), this.x + Math.cos(a) * 6, this.y + Math.sin(a) * 6, a,
        Math.cos(ca) * v, Math.sin(ca) * v, rand(-0.9, 0.9), { material: 'brass', air: 0.08, shadow: 0, kg: 0.05, mu: 0.3, fly: 0.2, bounce: 0.5 }));
    }
    w.sound(d.sound, this.x, this.y, 1, { choke: this });
    // the player's gunfire draws the guards in; a guard firing calls his mates
    if (d.noise) w.noise(this.x, this.y, d.noise, this, 'gunshot');
    this.recoil = 1;
    this.weapon.mag--;
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
      p.hit(d.lethal ? 2 : 1, x + Math.cos(a) * d.range * 0.8, y + Math.sin(a) * d.range * 0.8, a, 2.5, 'blunt');
      hit = true;
    }
    for (const win of w.windows) {
      if (win.intact && Math.hypot(win.x - x, win.y - y) < d.range + 12) { win.shatter(a); hit = true; }
    }
    for (const door of [...w.doors]) {
      const t = door.tip();
      const mx = (door.hx + t.x) / 2, my = (door.hy + t.y) / 2;
      if (Math.hypot(mx - x, my - y) < d.range + 14) {
        // bare hands = a kick, otherwise a blow with the weapon
        door.hit(mx, my, a, d === WEAPONS.bat ? 2 : 1, d.hold === 'none' ? 'kick' : 'melee');
        if (this.isPlayer) door.pushedByPlayer = 0.8;
        hit = true;
      }
    }
    // walls crack under heavy swings
    if (d.lethal) {
      const hx = x + Math.cos(a) * (d.range * 0.9), hy = y + Math.sin(a) * (d.range * 0.9);
      const cx = Math.floor(hx / 32), cy = Math.floor(hy / 32);
      if (w.map.isWallChar(cx, cy)) { w.damageWall(cx, cy, 1, hx, hy, a); w.shake(0.08); hit = true; }
    }
    // shove whatever loose stuff is in the arc
    for (const list of [w.corpses, w.debris, w.items]) {
      for (const o of list) {
        if (o.dead) continue;
        const p = o.body.position, dd = Math.hypot(p.x - x, p.y - y);
        if (dd > d.range + 8 || Math.abs(angDiff(a, Math.atan2(p.y - y, p.x - x))) > d.arc / 2) continue;
        impulse(o.body, a, d.lethal ? 90 : 50, rand(-0.2, 0.2), 6);
        if (o.pool !== undefined) { w.particles.blood(p.x, p.y, a, 0.5, 6, 140); hit = true; }
      }
    }
    if (hit) w.sound(d.sound, x, y);
  }

  // hit by a projectile
  shot(angle, weaponDef, distance, shooter) {
    let cause = 'bullet';
    if (weaponDef?.pellets > 1) cause = distance < 120 ? 'blast' : 'bullet';
    else if (weaponDef?.heavy) cause = 'heavy';
    this.kill(angle, cause, shooter, weaponDef?.gore ?? 0.3);
  }

  kill(angle, cause, killer, goreMul = 1) {
    if (!this.alive) return;
    this.alive = false;
    this.lastAmmo = this.weapon && WEAPONS[this.weapon.type].ammo;
    this.dropWeapon(angle + rand(-1, 1), rand(1.5, 3.5));
    this.world.removeBody(this.body);
    gore(this.world, this, angle, cause, goreMul);
    this.world.onKill(this, cause, killer);
  }

  knock() { /* overridden by Enemy */ }

  // ---------------- traversal ----------------
  // jump through a broken window / over a low obstacle in direction a, if there is one
  tryVault(a, moving = true) {
    if (this.vaulting || this.knocked || !this.alive) return false;
    const v = findVault(this.world, this, a, moving);
    if (!v) return false;
    // hands planted on the ledge (world positions), a little apart
    const L = v.ledge;
    const hands = [{ x: L.x - L.tx * 9, y: L.y - L.ty * 9 }, { x: L.x + L.tx * 9, y: L.y + L.ty * 9 }];
    this.vaulting = {
      from: { x: this.x, y: this.y }, to: v.to, t: 0, dur: 0.5, kind: v.kind, over: v.over,
      hands, dir: Math.atan2(v.to.y - this.y, v.to.x - this.x), legSide: Math.random() < 0.5 ? -1 : 1,
    };
    // glide over glass frames and furniture, walls still block
    this.body.collisionFilter = { ...this.body.collisionFilter, mask: CAT.WALL };
    this.vel = { x: 0, y: 0 };
    this.world.sound(v.kind === 'prop' ? 'slide' : 'vault', this.x, this.y, 0.8);
    if (v.kind === 'window') this.world.particles.glass(v.over.x, v.over.y, a, 0.8, 6, 60);
    return true;
  }

  // returns true while the vault is still running
  updateVault(dt) {
    const v = this.vaulting;
    if (!v) return false;
    v.t += dt;
    const k = Math.min(1, v.t / v.dur);
    // window: slow push-off, fast over the top, settle on landing. slide: one smooth glide
    const e = v.kind === 'prop' ? k * k * (3 - 2 * k)
      : k < 0.25 ? 0.15 * (k / 0.25) : k < 0.75 ? 0.15 + 0.75 * ((k - 0.25) / 0.5) : 0.9 + 0.1 * ((k - 0.75) / 0.25);
    // skidding over a hood throws sparks, over wood a bit of dust
    if (v.kind === 'prop' && k > 0.2 && k < 0.8 && Math.random() < 0.35) {
      const metal = v.over?.isVehicle || v.over?.def?.material === 'metal';
      if (metal) this.world.particles.sparks(this.x, this.y, v.dir + Math.PI, 0.6, 1, 140);
      else this.world.particles.smoke(this.x, this.y, 1, 3, { speed: 15, size: 3, life: 0.5 });
    }
    Body.setPosition(this.body, { x: lerp(v.from.x, v.to.x, e), y: lerp(v.from.y, v.to.y, e) });
    Body.setVelocity(this.body, { x: 0, y: 0 });
    if (k < 1) return true;
    this.vaulting = null;
    this.body.collisionFilter = { ...this.body.collisionFilter, mask: MASK.CHAR };
    this.world.particles.smoke(this.x, this.y, 4, 4, { speed: 30, size: 4, life: 0.6 });
    this.world.noise(this.x, this.y, this.isPlayer ? 120 : 0, this);
    return false;
  }

  dropWeapon(angle, speed = 2) {
    if (!this.weapon) return;
    const w = this.world;
    w.addItem(new WeaponItem(w, this.weapon.type, this.weapon.mag,
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
    // vaulting = a little jump arc
    let s = 1;
    let lift = 0;
    if (this.vaulting) {
      const k = Math.min(1, this.vaulting.t / this.vaulting.dur);
      lift = Math.sin(Math.PI * k);
      s = 1 + lift * 0.16;
    }
    if (this.vaulting) { this.drawVault(ctx, s, lift); return; }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.translate(-x, -y);
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
    drawSprite(ctx, silhouette(this.torso), x + 2 + lift * 4, y + 2 + lift * 5, this.angle, 0.35);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.angle);
    this.drawArms(ctx);
    ctx.restore();
    drawSprite(ctx, this.torso, x, y, this.angle);
    ctx.restore();
  }

  // window: hands on the sill while the body goes through; furniture / car hood: action-movie slide on the hip
  drawVault(ctx, s, lift) {
    const v = this.vaulting;
    const k = Math.min(1, v.t / v.dur);
    const a = v.dir;
    const x = this.x, y = this.y;
    const slide = v.kind === 'prop';
    const side = v.legSide;
    // sliding: the body turns sideways onto its hip in the middle of the move
    const ta = slide ? a + side * 1.15 * Math.sin(Math.PI * Math.min(1, k * 1.15)) : a;
    const toLocal = (p) => {
      const dx = p.x - x, dy = p.y - y, c = Math.cos(-a), sn = Math.sin(-a);
      return { x: (dx * c - dy * sn) / s, y: (dx * sn + dy * c) / s };
    };
    const ARM = 11; // a real arm's reach from the shoulder
    const reach = (h, sy) => {
      const dx = h.x, dy = h.y - sy, len = Math.hypot(dx, dy);
      return len > ARM ? { x: (dx / len) * ARM, y: sy + (dy / len) * ARM } : h;
    };
    let hands;
    if (slide) {
      // one palm skids on the surface right under the body, the other hand keeps the gun up
      const palm = { x: -2, y: -side * 8 };
      const gunA = this.angle - a;
      hands = side > 0 ? [palm, { x: Math.cos(gunA) * 10, y: Math.sin(gunA) * 10 + 4 }]
        : [{ x: Math.cos(gunA) * 10, y: Math.sin(gunA) * 10 - 4 }, palm];
    } else {
      const rest = [{ x: 7, y: -6 }, { x: 7, y: 6 }];
      const planted = v.hands.map(toLocal).sort((h1, h2) => h1.y - h2.y);
      hands = planted.map((h, i) => {
        let p = h;
        if (k < 0.22) p = { x: lerp(rest[i].x, h.x, k / 0.22), y: lerp(rest[i].y, h.y, k / 0.22) };
        else if (k >= 0.72) p = { x: lerp(h.x, rest[i].x, (k - 0.72) / 0.28), y: lerp(h.y, rest[i].y, (k - 0.72) / 0.28) };
        return reach(p, i === 0 ? -6 : 6);
      });
    }
    // legs: tucked and swung over a sill, thrown forward in a slide
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(s, s);
    ctx.fillStyle = '#1a1214';
    const mid = Math.sin(Math.PI * k);
    for (const sd of [-1, 1]) {
      if (slide) ctx.fillRect(2 + mid * 7, sd * 2.6 + side * mid * 3 - 1.8, 6, 3.6);
      else ctx.fillRect(-7 - mid * 3, sd * 3.2 + mid * 6 * side - 1.8, 6, 3.6);
    }
    ctx.restore();
    drawSprite(ctx, silhouette(this.torso), x + 2 + lift * 4, y + 2 + lift * 5, ta, 0.35);
    drawSprite(ctx, this.torso, x, y, ta, 1, s);
    // arms on top: pressing on the ledge / skidding on the hood
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    const shoulders = [-6, 6].map((sy) => ({ x: -Math.sin(ta - a) * sy, y: Math.cos(ta - a) * sy }));
    hands.forEach((h, i) => {
      const o = shoulders[i];
      ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(h.x, h.y); ctx.stroke();
      ctx.strokeStyle = this.look.arm; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(h.x, h.y); ctx.stroke();
    });
    const d = this.def;
    if (d.sprite) {
      const img = sprite(d.sprite);
      const gh = slide ? hands[side > 0 ? 1 : 0] : hands[1];
      ctx.save();
      ctx.translate(gh.x, gh.y);
      ctx.rotate(slide ? this.angle - a : Math.atan2(gh.y - 6, gh.x) + 0.2);
      ctx.drawImage(img, -d.grip, -img.height / 2);
      ctx.restore();
    }
    for (const h of hands) {
      ctx.fillStyle = PALETTE.ink; ctx.fillRect(h.x - 2.2, h.y - 2.2, 4.4, 4.4);
      ctx.fillStyle = this.look.skin; ctx.fillRect(h.x - 1.4, h.y - 1.4, 2.8, 2.8);
    }
    ctx.restore();
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
    }
    let carry = null; // magazine / shell held in the off hand while reloading
    if (wpn && this.reloading > 0) {
      const p = 1 - this.reloading / this.reloadDur;
      const belt = { x: -1, y: -8 };
      if (d.shellReload) {
        // off hand shuttles shells from the belt to the loading port
        const port = { x: wpn.x + 6, y: wpn.y + 3 };
        const k = Math.sin(Math.PI * p);
        hl = { x: lerp(belt.x, port.x, k), y: lerp(belt.y, port.y, k) };
        wpn.a = -0.35;
        carry = { img: sprite('weapons/shell'), pos: hl, a: 0 };
      } else {
        // tilt the gun, fetch a fresh mag from the belt, slam it in, rack
        const tilt = p < 0.12 ? p / 0.12 : p > 0.85 ? (1 - p) / 0.15 : 1;
        wpn.a = -0.55 * tilt;
        const well = { x: wpn.x + 2, y: wpn.y + 3 };
        if (p < 0.15) hl = { x: lerp(hl.x, belt.x, p / 0.15), y: lerp(hl.y, belt.y, p / 0.15) };
        else if (p < 0.4) hl = belt;
        else if (p < 0.7) hl = { x: lerp(belt.x, well.x, easeOut((p - 0.4) / 0.3)), y: lerp(belt.y, well.y, easeOut((p - 0.4) / 0.3)) };
        else hl = well;
        if (p > 0.25 && p < 0.72 && d.magSprite) carry = { img: spriteOpt(d.magSprite), pos: hl, a: Math.PI / 2 };
        if (p > 0.86) wpn.x -= Math.sin((p - 0.86) / 0.14 * Math.PI) * 3;
      }
    }
    if (wpn && this.pickAnim > 0) {
      // flashy pickup: the weapon twirls into the hand
      const k = this.pickAnim / 0.35;
      wpn.a += k * k * Math.PI * 2;
      wpn.x -= k * 3;
    }
    if (d.hold === 'melee') {
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
    if (carry && carry.img) {
      ctx.save();
      ctx.translate(carry.pos.x, carry.pos.y);
      ctx.rotate(carry.a);
      ctx.drawImage(carry.img, -carry.img.width / 2, -carry.img.height / 2);
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
