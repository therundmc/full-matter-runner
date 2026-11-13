import { CAT, MASK, ENEMY } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { sprite, spriteOpt, chunk } from '../../engine/Assets.js';
import { rand, chance, spread, angDiff, local, lerp, clamp } from '../../engine/math.js';
import { gore } from '../fx/Gore.js';
import Projectile from './Projectile.js';
import { setKg, impulse } from '../../engine/physics/Body.js';
import { findVault } from '../systems/Cover.js';
import { segPoly } from '../../engine/physics/Raycast.js';
import Debris from './Debris.js';
import WeaponItem from './WeaponItem.js';
import AmmoItem from './AmmoItem.js';
import { newPose, standPose, vaultPose, slidePose, drawPose, drawDown } from './CharacterAnim.js';

const { Bodies, Body } = Matter;

export const KINDS = {
  player: { arm: '#1fb5b5', skin: '#f2c493' },
  thug: { arm: '#e6e0cf', skin: '#e0a878' },
  heavy: { arm: '#4b2470', skin: '#c88a60' },
  brute: { arm: '#d89a70', skin: '#d89a70' },
};

const VAULT_DUR = 0.5; // s, windows and furniture alike
const GAIT_SPEED = 1.6; // px/step at which the walk cycle reaches its full stride

// Shared body / weapon / animation logic for the player and enemies.
export default class Character {
  constructor(world, x, y, angle, kind, team) {
    this.world = world;
    this.kind = kind;
    this.team = team;
    this.look = KINDS[kind];
    this.voice = rand(0.92, 1.1) * (kind === 'brute' || kind === 'heavy' ? 0.88 : 1); // pitch of his shouts and cries
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
    this.body.material = 'clothed';
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
    this.strike = 0;        // gesture of the current melee blow: 0 forehand, 1 backhand, 2 smash / stab
    this.recoil = 0;
    this.reloading = 0;
    this.reloadDur = 1;
    this.reloadStage = 0;
    this.pickAnim = 0;
    this.throwT = 0;        // follow-through of a throw
    this.throwDur = 0.28;
    this.recoilRate = 9;    // recoil recovery per second (heavy guns recover slower)
    this.vaulting = null;   // { from, to, t, dur, kind, dir, ... } while jumping over something
    this.slideAnim = null;  // { dir, side, k, w } while sliding (driven by Player)
    // animation state (see CharacterAnim.js)
    this.gait = 0;          // 0 standing .. 1 full stride, smoothed
    this.footA = angle;     // smoothed feet direction
    this.lean = { x: 0, y: 0 };
    this.prevVel = { x: 0, y: 0 };
    this.breath = rand(0, 6.28);
    this.downT = 0;         // time since knocked down
    this.pose = newPose();
    this.pose2 = newPose();
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
  get hasGun() { return this.def.kind === 'gun'; }

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
    this.world.sound(d.shellReload ? 'handle' : 'magOut', this.x, this.y, 0.7, { weapon: this.weapon.type, dur: d.reload });
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
        this.world.sound('shellIn', this.x, this.y, 0.6, { weapon: this.weapon.type });
        if (this.weapon.mag < d.mag && this.reserveCount() > 0) this.reloadDur = this.reloading = d.reload;
        else { this.reloading = 0; this.world.sound('rack', this.x, this.y, 0.8, { weapon: this.weapon.type }); this.recoil = 0.8; }
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
      this.world.sound('magIn', this.x, this.y, 0.8, { weapon: this.weapon.type });
    }
    if (this.reloadStage === 2 && p > 0.86) {
      this.reloadStage = 3;
      this.world.sound('rack', this.x, this.y, 0.8, { weapon: this.weapon.type });
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
    this.throwT = Math.max(0, this.throwT - dt);
    this.recoil = Math.max(0, this.recoil - dt * this.recoilRate);
    const v = Body.getVelocity(this.body);
    const sp = Math.hypot(v.x, v.y);
    this.moving = sp;
    if (sp > 0.25) { this.walk += sp * dt * 6; this.moveAngle = Math.atan2(v.y, v.x); }
    // knocked down: a puff of dust when the body hits the floor
    const wasDown = this.downT;
    this.downT = this.knocked > 0 ? this.downT + dt : 0;
    if (wasDown < 0.18 && this.downT >= 0.18) this.world.particles.smoke(this.x, this.y, 3, 5, { speed: 25, size: 4, life: 0.5 });
    // smoothed gait / feet direction / lean into acceleration (frozen while vaulting, so the run resumes on landing)
    if (!this.vaulting) {
      const kg = 1 - Math.exp(-dt * 12), kf = 1 - Math.exp(-dt * 14), kl = 1 - Math.exp(-dt * 10);
      this.gait += (Math.min(1, sp / GAIT_SPEED) - this.gait) * kg;
      this.footA += angDiff(this.footA, sp > 0.25 ? this.moveAngle : this.angle) * kf;
      this.lean.x += (clamp((v.x - this.prevVel.x) * 4, -1.6, 1.6) - this.lean.x) * kl;
      this.lean.y += (clamp((v.y - this.prevVel.y) * 4, -1.6, 1.6) - this.lean.y) * kl;
    }
    this.prevVel.x = v.x; this.prevVel.y = v.y;
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
        this.world.sound('click', this.x, this.y, 1, { weapon: this.weapon.type });
        return 'empty';
      }
      this.fire(d);
      this.cooldown = d.rate;
      return true;
    }
    this.strike = this.pickStrike(d);
    this.cooldown = d.rate;
    this.swingDur = this.swing = d.rate * 0.85;
    // side the stroke comes from (it runs toward the other one)
    this.punchSide = d.hold === 'melee' ? (this.strike === 1 ? -1 : 1) : -this.punchSide;
    this.world.sound('swing', this.x, this.y, 0.6);
    this.world.after(d.windup, () => this.meleeStrike(d));
    return true;
  }

  // gesture of a blow with a bat or a knife (see CharacterAnim): blows chained without a pause alternate forehand
  // and backhand; now and then comes the heavy one, an overhead smash or a straight stab
  pickStrike(d) {
    if (d.hold !== 'melee') return 0;
    const chained = this.cooldown > -0.25;
    if (this.strike !== 2 && chance(chained ? 0.25 : 0.3)) return 2;
    return chained && this.strike === 0 ? 1 : 0;
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
        team: this.team, owner: this, weapon: d, life: d.range ?? 1.1, pen: d.pen ?? 10, rocket: d.rocket, floor: this.shootDown,
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
    this.recoilRate = d.kick >= 6 ? 4.5 : 9;
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
      // the blow lands: a spark across it (along it for a stab or a smash), the camera takes some of it
      const heavy = d.hold === 'melee' && this.strike === 2;
      w.hitSpark((x + c.x * 2) / 3, (y + c.y * 2) / 3, heavy || d.hold === 'none' ? a : a - (Math.PI / 2) * this.punchSide, d.lethal ? 1.4 : 1);
      if (this.isPlayer) { w.camera.push(Math.cos(a) * 2, Math.sin(a) * 2); w.hitstop(d === WEAPONS.bat ? 0.06 : 0.045); }
      if (d.lethal || c.isPlayer) c.kill(a, d === WEAPONS.knife ? 'slash' : 'melee', this, d);
      else c.knock(a, 'punch');
    }
    for (const p of w.props) {
      if (p.dead) continue;
      let hx = x + Math.cos(a) * d.range * 0.8, hy = y + Math.sin(a) * d.range * 0.8;
      if (p.isVehicle) {
        // a long body: what counts is the panel in front of the blow, not how far its centre is
        const reach = d.range + 6;
        const r = segPoly(x, y, x + Math.cos(a) * reach, y + Math.sin(a) * reach, p.body.vertices);
        if (!r) continue;
        hx = x + Math.cos(a) * reach * r.t; hy = y + Math.sin(a) * reach * r.t;
      } else {
        const dx = p.x - x, dy = p.y - y, dd = Math.hypot(dx, dy);
        if (dd > d.range + 12 || Math.abs(angDiff(a, Math.atan2(dy, dx))) > d.arc / 2) continue;
      }
      // a blade cuts across the swing, bare hands only scuff, a bat dents
      const kind = d.bleed ? 'cut' : d.hold === 'none' ? 'punch' : 'blunt';
      p.hit(d.lethal ? 2 : 1, hx, hy, a, 2.5, kind, { swing: a - (Math.PI / 2) * this.punchSide });
      hit = true;
    }
    for (const win of w.windows) {
      if (Math.hypot(win.x - x, win.y - y) < d.range + 12 && win.blow(x, y, a, this, d === WEAPONS.bat ? 2 : 0)) hit = true;
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
    this.kill(angle, cause, shooter, weaponDef || {});
  }

  // by: what did it (a weapon definition, or { gore, wound }): sets the dismemberment odds and the bleeding
  kill(angle, cause, killer, by) {
    if (!this.alive || this.invulnerable) return; // invulnerable: sandbox god mode
    this.alive = false;
    this.lastAmmo = this.weapon && WEAPONS[this.weapon.type].ammo;
    this.dropWeapon(angle + rand(-1, 1), rand(1.5, 3.5));
    this.world.removeBody(this.body);
    const left = gore(this.world, this, angle, cause, by);
    // most of them go down with a cry, when there is still a throat to cry with
    if (left === 'corpse' && !this.held && chance(0.75)) this.world.sound('cry', this.x, this.y, 1, { pitch: this.voice });
    this.world.onKill(this, cause, killer);
  }

  knock() { /* overridden by Enemy */ }

  // ---------------- traversal ----------------
  // jump through a broken window / over a low obstacle in direction a, if there is one
  tryVault(a) {
    if (this.vaulting || this.knocked || !this.alive) return false;
    const v = findVault(this.world, this, a);
    if (!v) return false;
    const dx = v.to.x - this.x, dy = v.to.y - this.y, dist = Math.hypot(dx, dy) || 1;
    const dir = Math.atan2(dy, dx);
    // hands planted on the ledge (world positions), a little apart: [left, right] relative to the move
    const L = v.ledge;
    const h0 = { x: L.x - L.tx * 9, y: L.y - L.ty * 9 }, h1 = { x: L.x + L.tx * 9, y: L.y + L.ty * 9 };
    const flip = -L.tx * Math.sin(dir) + L.ty * Math.cos(dir) < 0;
    // the run-up carries into the move: Hermite tangents normalized to the vault distance and duration
    const vel = Body.getVelocity(this.body);
    const along = Math.max(0, (vel.x * dx + vel.y * dy) / dist);
    const win = v.kind === 'window';
    const side = angDiff(dir, this.angle) >= 0 ? 1 : -1; // hip slides roll the chest toward the aim
    this.vaulting = {
      from: { x: this.x, y: this.y }, to: v.to, t: 0, dur: VAULT_DUR, kind: v.kind, over: v.over, dir, dist,
      hands: flip ? [h1, h0] : [h0, h1], side, legSide: win ? (Math.random() < 0.5 ? -1 : 1) : -side,
      m0: clamp((along * 60 * VAULT_DUR) / dist, 0, win ? 0.6 : 1.1), m1: win ? 0.8 : 1.2, landed: false,
    };
    // glide over glass frames and furniture, walls still block
    this.body.collisionFilter = { ...this.body.collisionFilter, mask: CAT.WALL };
    this.vel = { x: 0, y: 0 };
    this.world.sound(win ? 'vault' : 'slide', this.x, this.y, 0.8);
    if (win) this.world.particles.glass(v.over.x, v.over.y, a, 0.8, 6, 60);
    return true;
  }

  // returns true while the vault is still running
  updateVault(dt) {
    const v = this.vaulting;
    if (!v) return false;
    const w = this.world;
    v.t += dt;
    const k = Math.min(1, v.t / v.dur);
    // cubic Hermite: leaves with the run-up speed, lands with the exit speed, no jerk in between
    const k2 = k * k, k3 = k2 * k;
    const e = (k3 - 2 * k2 + k) * v.m0 + (3 * k2 - 2 * k3) + (k3 - k2) * v.m1;
    const c = Math.cos(v.dir), s = Math.sin(v.dir);
    // skidding over a hood throws sparks, over wood a bit of dust
    if (v.kind === 'prop' && k > 0.25 && k < 0.75 && Math.random() < 0.35) {
      const metal = v.over?.isVehicle || v.over?.def?.material === 'metal';
      if (metal) w.particles.sparks(this.x, this.y, v.dir + Math.PI, 0.6, 1, 140);
      else w.particles.smoke(this.x, this.y, 1, 3, { speed: 15, size: 3, life: 0.5 });
    }
    Body.setPosition(this.body, { x: lerp(v.from.x, v.to.x, e), y: lerp(v.from.y, v.to.y, e) });
    Body.setVelocity(this.body, { x: 0, y: 0 });
    // touch-down: dust, noise, a small camera kick for the player
    if (!v.landed && k >= (v.kind === 'window' ? 0.78 : 0.84)) {
      v.landed = true;
      for (const sd of [-1, 1]) w.particles.smoke(this.x - s * sd * 6, this.y + c * sd * 6, 1, 2, { speed: 22, size: 3, life: 0.45 });
      w.noise(this.x, this.y, this.isPlayer ? 120 : 0, this);
      if (this.isPlayer) { w.shake(0.05); w.camera.push(c * 1.5, s * 1.5); }
    }
    if (k < 1) return true;
    this.vaulting = null;
    this.body.collisionFilter = { ...this.body.collisionFilter, mask: MASK.CHAR };
    // hand the exit speed back to the run
    const sp = (v.m1 * v.dist) / (v.dur * 60);
    this.vel = { x: c * sp, y: s * sp };
    Body.setVelocity(this.body, this.vel);
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
    if (this.knocked > 0) { drawDown(ctx, this, this.pose); return; }
    const P = standPose(this, this.pose);
    // a slide can chain into a vault: the vault blends out of whatever the slide pose was
    if (this.slideAnim) slidePose(this, P, this.pose2);
    if (this.vaulting) vaultPose(this, P, this.pose2);
    drawPose(ctx, this, P);
  }
}
