import { PLAYER, TAKEDOWN } from '../Config.js';
import { WEAPONS, AMMO } from '../data/weapons.js';
import { rand, chance, clamp, angDiff } from '../../engine/math.js';
import { chunk } from '../../engine/Assets.js';
import { impulse, kgOf } from '../../engine/physics/Body.js';
import Character from './Character.js';
import WeaponItem from './WeaponItem.js';
import { findVault } from '../systems/Cover.js';
import { Slide, canSlide } from '../systems/Slide.js';
import { behind } from '../systems/Takedown.js';

const { Body } = Matter;
let scuff = null; // floor scuff stamp, made on first use

export default class Player extends Character {
  constructor(world, x, y, angle) {
    super(world, x, y, angle, 'player', 'player');
    this.isPlayer = true;
    this.radius = PLAYER.radius;
    this.execution = null;
    this.nearItem = null;
    this.nearDowned = null;
    this.nearBack = null;   // a guard whose back we stand right behind (Space takes him down)
    this.takedown = null;   // { target, t, done, blade, side } while we have him by the neck
    this.grab = null;       // what CharacterAnim plays of it: { k, d, side, blade }
    this.slide = null;      // Slide kinematics while sliding
    this.slideCd = 0;
    this.slideHits = new Set(); // loose bodies already shoved by the current slide
    this.shootDown = null;  // the corpse under the crosshair when firing (rounds fly over the others)
    // spare rounds per caliber
    this.ammo = { '9mm': 24, '12g': 0, '762': 0, rocket: 0 };
  }

  // the dead body under the crosshair, unless someone alive stands there
  corpseAt(x, y) {
    const w = this.world;
    for (const c of w.chars) if (c !== this && c.alive && Math.hypot(c.x - x, c.y - y) < c.radius + 10) return null;
    for (const c of w.corpses) {
      if (c.dead) continue;
      for (const part of c.parts || [c]) {
        const p = part.body.position;
        if (Math.hypot(p.x - x, p.y - y) < 9) return c;
      }
    }
    return null;
  }

  reserveCount() {
    const c = this.def.ammo;
    return c ? this.ammo[c] : 0;
  }

  // a fresh magazine filled from the caliber pool
  takeMag() {
    const c = this.def.ammo;
    const n = Math.min(this.def.mag, this.ammo[c]);
    this.ammo[c] -= n;
    return n;
  }
  takeRound() { this.ammo[this.def.ammo]--; }

  // returns false when that caliber is already full
  addAmmo(caliber, rounds) {
    const max = AMMO[caliber].max;
    if (this.ammo[caliber] >= max) return false;
    this.ammo[caliber] = Math.min(max, this.ammo[caliber] + rounds);
    return true;
  }

  update(dt, input, aim) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    const w = this.world;
    this.slideCd -= dt;
    this.updateSlideAnim(dt);

    if (this.execution) { this.updateExecution(dt); return; }
    if (this.takedown) { this.updateTakedown(dt); return; }
    this.angle = Math.atan2(aim.y - this.y, aim.x - this.x);
    if (this.updateVault(dt)) return;

    // movement (KeyW/A/S/D are physical positions: ZQSD on AZERTY)
    let dx = 0, dy = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) dy -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) dy += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) dx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) dx += 1;
    const moving = !!(dx || dy);
    const moveA = moving ? Math.atan2(dy, dx) : this.angle;
    if (this.slide) {
      this.updateSlide(dt);
      if (this.vaulting) return; // chained into a vault
    }
    const sliding = !!this.slide;
    if (!sliding) this.steer(dx, dy, PLAYER.speed, PLAYER.accel);

    // what is around us
    this.nearItem = null;
    let best = 26;
    for (const it of w.items) {
      it.hilite = 0;
      if (it.dead || it.speed > 3) continue;
      const d = Math.hypot(it.x - this.x, it.y - this.y);
      if (d < best) { best = d; this.nearItem = it; }
    }
    if (this.nearItem) this.nearItem.hilite = 1;
    this.nearDowned = null;
    for (const e of w.enemies) {
      if (e.alive && e.knocked > 0 && Math.hypot(e.x - this.x, e.y - this.y) < 26) { this.nearDowned = e; break; }
    }
    this.nearBack = (!this.nearDowned && w.enemies.find((e) => behind(this, e) && w.lineOfSight(this.x, this.y, e.x, e.y))) || null;

    // attack
    const d = this.def;
    if (d.kind === 'gun' ? (d.auto ? input.mouseDown(0) : input.mouseHit(0)) : input.mouseDown(0)) {
      if (input.mouseHit(0) && !this.armed && this.nearDowned) this.startExecution(this.nearDowned);
      else {
        this.shootDown = d.kind === 'gun' ? this.corpseAt(aim.x, aim.y) : null;
        // dry: reload if we can, otherwise hurl the useless gun at them
        if (this.attack() === 'empty' && input.mouseHit(0) && !this.reload()) this.throwWeapon(true);
      }
    }
    if (input.hit('KeyR')) this.reload();
    // Space = context action: execute > takedown > vault > slide (the slide needs a running start, no HUD label)
    const busy = sliding || this.nearDowned || this.nearBack;
    this.vaultHint = busy ? null : findVault(w, this, moveA); // marked on the obstacle (WorldRenderer)
    this.contextAction = sliding ? null : this.nearDowned ? 'EXECUTE'
      : this.nearBack ? (d === WEAPONS.knife ? 'SLIT THROAT' : 'BREAK NECK') : this.vaultHint ? 'VAULT' : null;
    if (input.hit('Space') && !sliding) {
      if (this.nearDowned) this.startExecution(this.nearDowned);
      else if (this.nearBack) this.startTakedown(this.nearBack);
      else if (!this.tryVault(moveA) && moving) this.startSlide(moveA);
    }

    // right click: throw when armed, pick up otherwise. E: pick up / swap
    if (input.mouseHit(2)) {
      if (this.armed) this.throwWeapon();
      else this.pickUp();
    }
    if (input.hit('KeyE')) this.pickUp();
  }

  pickUp() {
    const it = this.nearItem;
    if (!it) return;
    if (this.armed) this.dropWeapon(this.angle + Math.PI + rand(-0.5, 0.5), 1.5);
    this.setWeapon(it.type, it.mag);
    this.world.removeItem(it);
    this.world.sound('pickup', this.x, this.y);
    if (this.def.kind === 'gun') this.world.sound('rack', this.x, this.y, 0.7, { weapon: this.weapon.type });
    this.pickAnim = 0.35;
    this.cooldown = 0.2;
    this.world.pickupFlash(this.x + Math.cos(this.angle) * 10, this.y + Math.sin(this.angle) * 10);
  }

  // power = true: the angry "out of bullets" John Wick throw (faster, spinning, a beat of slow motion)
  throwWeapon(power = false) {
    const w = this.world, a = this.angle;
    const sp = power ? 15 : 11;
    const it = new WeaponItem(w, this.weapon.type, this.weapon.mag, this.x + Math.cos(a) * 12, this.y + Math.sin(a) * 12,
      a, Math.cos(a) * sp + this.vel.x, Math.sin(a) * sp + this.vel.y, (power ? 0.9 : rand(0.4, 0.7)) * (Math.random() < 0.5 ? -1 : 1), this);
    w.addItem(it);
    this.weapon = null;
    this.reloading = 0;
    this.cooldown = 0.15;
    this.throwT = this.throwDur;
    w.sound('throw', this.x, this.y, power ? 1 : 0.8);
    if (power) { w.slowmo(0.45, 0.25); w.shake(0.15); }
  }

  // ---------------- slide ----------------
  startSlide(a) {
    const cfg = PLAYER.slide, w = this.world;
    if (this.vaulting || !canSlide(this.slideCd, this.moving, PLAYER.speed, cfg)) return false;
    this.slide = new Slide(a, PLAYER.speed, cfg);
    this.slideHits.clear();
    // the trailing palm goes on the side of the free (left) hand
    this.slideAnim = { dir: a, side: Math.cos(this.angle - a) >= 0 ? -1 : 1, k: 0, w: this.slideAnim?.w ?? 0 };
    this.setSlideVelocity();
    w.sound('slide', this.x, this.y, 0.9);
    w.noise(this.x, this.y, 110, this);
    w.events.emit('slide', { ch: this, x: this.x, y: this.y, angle: a });
    w.camera.push(Math.cos(a) * 2.5, Math.sin(a) * 2.5);
    w.shake(0.04);
    return true;
  }

  setSlideVelocity() {
    const sl = this.slide;
    this.vel = { x: sl.dx * sl.speed, y: sl.dy * sl.speed };
    Body.setVelocity(this.body, this.vel);
  }

  // physical slide: walls stop it, loose props take our momentum, standing enemies get swept off their feet
  updateSlide(dt) {
    const sl = this.slide, w = this.world, cfg = PLAYER.slide;
    // a broken window or a low obstacle right ahead: chain into the vault
    if (findVault(w, this, sl.angle)) {
      this.endSlide();
      this.tryVault(sl.angle);
      return;
    }
    if (sl.speed >= cfg.knockSpeed * sl.run) {
      for (const e of w.enemies) {
        if (!e.alive || e.knocked > 0) continue;
        const ex = e.x - this.x, ey = e.y - this.y;
        if (Math.hypot(ex, ey) > this.radius + e.radius + sl.speed + 2 || ex * sl.dx + ey * sl.dy <= 0) continue;
        e.knock(sl.angle, 'slide');
        w.sound('punch', e.x, e.y);
        w.shake(0.15);
        w.hitstop(0.04);
      }
    }
    const v = Body.getVelocity(this.body);
    sl.step(dt, v.x * sl.dx + v.y * sl.dy);
    if (sl.done) {
      if (sl.stalled) w.shake(0.08);
      this.endSlide();
      return;
    }
    for (const pair of w.physics.activePairs()) {
      const o = pair.bodyA === this.body ? pair.bodyB : pair.bodyB === this.body ? pair.bodyA : null;
      if (!o || o.mu === undefined || (o.isStatic && !o.frozen) || this.slideHits.has(o)) continue;
      this.slideHits.add(o);
      impulse(o, sl.angle, kgOf(this.body) * sl.speed * cfg.hitMomentum, rand(-0.3, 0.3), 10);
    }
    this.setSlideVelocity();
    // friction: dust off the hip and heel, a faint scuff on the floor
    const fx = this.x + sl.dx * 8, fy = this.y + sl.dy * 8;
    if (Math.random() < 0.3) w.particles.smoke(this.x - sl.dx * 3, this.y - sl.dy * 3, 1, 1.5, { speed: 10, size: 1.8, life: 0.3 });
    if (Math.random() < 0.25) w.particles.smoke(fx, fy, 1, 2, { speed: 10, size: 2, life: 0.3 });
    w.decals.bake(scuff ??= chunk('#140c1c', 4, 2), fx, fy, sl.angle, 0.05);
  }

  // hand the remaining speed back to the run
  endSlide() {
    const sl = this.slide;
    this.slide = null;
    this.slideCd = PLAYER.slide.cooldown;
    this.vel = { x: sl.dx * sl.speed, y: sl.dy * sl.speed };
    Body.setVelocity(this.body, this.vel);
  }

  // blend weight of the slide pose: quick drop into it, smooth get-up
  updateSlideAnim(dt) {
    const a = this.slideAnim;
    if (!a) return;
    if (this.slide) { a.k = this.slide.k; a.w = Math.min(1, a.w + dt / 0.07); }
    else if ((a.w -= dt / 0.18) <= 0) this.slideAnim = null;
  }

  // ground finisher on a knocked-out enemy
  startExecution(target) {
    const d = this.def;
    const hits = d.kind === 'gun' ? 1 : d.hold === 'none' ? 3 : 2;
    this.execution = { target, t: 0, hits, done: 0, interval: d.kind === 'gun' ? 0.22 : 0.26 };
    target.executing = true;
    this.steer(0, 0, 0, 1);
  }

  updateExecution(dt) {
    const ex = this.execution;
    const tg = ex.target;
    const w = this.world;
    if (!tg.alive) { this.execution = null; return; }
    // stand over the target
    const dx = tg.x - this.x, dy = tg.y - this.y;
    this.angle = Math.atan2(dy, dx);
    this.steer(dx, dy, Math.hypot(dx, dy) > 12 ? 1.5 : 0, 0.5);
    ex.t += dt;
    if (ex.t >= ex.interval) {
      ex.t = 0;
      ex.done++;
      const d = this.def;
      this.swingDur = this.swing = 0.2;
      this.punchSide *= -1;
      this.strike = 2; // straight down on him
      w.particles.blood(tg.x, tg.y, rand(0, 6.28), Math.PI, 14, 160);
      w.decals.stampBlood(tg.x, tg.y, 6, 4);
      w.shake(0.18);
      if (d.kind === 'gun') {
        if (this.weapon.mag > 0) { this.weapon.mag--; w.muzzleFlash(tg.x, tg.y, this.angle, d); w.sound(d.sound, this.x, this.y); if (d.noise) w.noise(this.x, this.y, d.noise, this, 'gunshot'); }
        else w.sound('punch', tg.x, tg.y);
      } else w.sound(d.hold === 'none' ? 'punch' : 'splat', tg.x, tg.y);
      if (ex.done >= ex.hits) {
        tg.kill(this.angle, 'execute', this);
        this.execution = null;
        this.cooldown = 0.2;
      }
    }
  }

  // seize a guard from behind: he can do nothing until it is over (Enemy.held), nobody hears it
  startTakedown(target) {
    const blade = this.def === WEAPONS.knife;
    // bare hands wrench either way; with something in the right hand the left arm pulls his chin round
    const side = this.def.hold === 'none' && chance(0.5) ? 1 : -1;
    this.takedown = { target, t: 0, done: false, blade, side };
    this.grab = { k: 0, d: 17, side, blade };
    this.contextAction = null;
    this.swing = 0;
    target.held = this;
    target.swing = 0;
    this.world.sound('grab', target.x, target.y, 1, { pitch: target.voice });
  }

  updateTakedown(dt) {
    const td = this.takedown, tg = td.target, w = this.world, T = TAKEDOWN;
    td.t += dt;
    const k = td.t / T.dur;
    this.grab.k = k;
    this.steer(0, 0, 0, 0.5);
    if (!td.done) {
      if (!tg.alive) { this.takedown = this.grab = null; return; } // somebody got him first
      // pressed against his back, looking the same way; his head is wrenched round when it comes
      const dx = tg.x - this.x, dy = tg.y - this.y, dist = Math.hypot(dx, dy);
      this.angle = Math.atan2(dy, dx);
      if (dist > 17) this.steer(dx, dy, 1.5, 0.5);
      this.grab.d = dist;
      const wr = clamp((k - 0.42) / (T.killAt - 0.42), 0, 1);
      tg.angle += angDiff(tg.angle, this.angle + td.side * 0.9 * wr * wr) * Math.min(1, dt * 30);
      if (k >= T.killAt) {
        td.done = true;
        w.hitstop(0.07);
        w.camera.push(Math.cos(this.angle + td.side * 1.5) * 2, Math.sin(this.angle + td.side * 1.5) * 2);
        if (td.blade) tg.kill(this.angle, 'slash', this, this.def);
        else tg.kill(this.angle + td.side * 1.5, 'snap', this);
      }
    }
    if (k >= 1) {
      this.takedown = this.grab = null;
      this.cooldown = 0.15;
    }
  }

  knock(angle) { this.kill(angle, 'melee'); }

  get ammoText() {
    if (!this.weapon) return '';
    const d = WEAPONS[this.weapon.type];
    return d.kind === 'gun' ? `${Math.max(0, this.weapon.mag)} | ${this.reserveCount()} ${AMMO[d.ammo].name}` : '';
  }
}
