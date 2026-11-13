import { PLAYER } from '../core/Config.js';
import { WEAPONS, CALIBERS } from '../data/weapons.js';
import { rand } from '../core/math.js';
import Character from './Character.js';
import WeaponItem from './WeaponItem.js';

export default class Player extends Character {
  constructor(world, x, y, angle) {
    super(world, x, y, angle, 'player', 'player');
    this.isPlayer = true;
    this.radius = PLAYER.radius;
    this.execution = null;
    this.nearItem = null;
    this.nearDowned = null;
    // spare rounds per caliber
    this.ammo = { '9mm': 24, '12g': 0, '762': 0, rocket: 0 };
  }

  reserveCount() {
    const c = this.def.caliber;
    return c ? this.ammo[c] : 0;
  }
  takeReserve(n) { this.ammo[this.def.caliber] -= n; }
  giveReserve(n) {
    const c = this.def.caliber;
    this.ammo[c] = Math.min(CALIBERS[c].max, this.ammo[c] + n);
  }

  update(dt, input, aim) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    const w = this.world;

    if (this.execution) { this.updateExecution(dt); return; }

    // movement (KeyW/A/S/D are physical positions: ZQSD on AZERTY)
    let dx = 0, dy = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) dy -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) dy += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) dx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) dx += 1;
    this.steer(dx, dy, PLAYER.speed, PLAYER.accel);

    this.angle = Math.atan2(aim.y - this.y, aim.x - this.x);

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

    // attack
    const d = this.def;
    if (d.kind === 'gun' ? (d.auto ? input.mouseDown(0) : input.mouseHit(0)) : input.mouseDown(0)) {
      if (input.mouseHit(0) && !this.armed && this.nearDowned) this.startExecution(this.nearDowned);
      else if (this.attack() === 'empty' && input.mouseHit(0)) {
        // dry: reload if we can, otherwise hurl the useless gun at them
        if (!this.reload()) this.throwWeapon(true);
      }
    }
    if (input.hit('KeyR')) this.reload();
    if (input.hit('Space') && this.nearDowned) this.startExecution(this.nearDowned);

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
    if (this.def.kind === 'gun') this.world.sound('rack', this.x, this.y, 0.7);
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
    this.swingDur = this.swing = 0.2;
    w.sound('throw', this.x, this.y, power ? 1 : 0.8);
    if (power) { w.slowmo(0.45, 0.25); w.shake(0.15); }
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
      w.particles.blood(tg.x, tg.y, rand(0, 6.28), Math.PI, 14, 160);
      w.map.stampBlood(tg.x, tg.y, 6, 4);
      w.shake(0.18);
      if (d.kind === 'gun') {
        if (this.weapon.mag > 0) { this.weapon.mag--; w.muzzleFlash(tg.x, tg.y, this.angle, d); w.sound(d.sound, this.x, this.y); if (d.noise) w.noise(this.x, this.y, d.noise, this); }
        else w.sound('punch', tg.x, tg.y);
      } else w.sound(d.hold === 'none' ? 'punch' : 'splat', tg.x, tg.y);
      if (ex.done >= ex.hits) {
        tg.kill(this.angle, 'execute', this);
        this.execution = null;
        this.cooldown = 0.2;
      }
    }
  }

  knock(angle) { this.kill(angle, 'melee'); }

  get ammoText() {
    if (!this.weapon) return '';
    const d = WEAPONS[this.weapon.type];
    return d.kind === 'gun' ? `${Math.max(0, this.weapon.mag)} | ${this.reserveCount()}` : '';
  }
}
