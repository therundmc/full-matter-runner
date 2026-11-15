import { PLAYER, TAKEDOWN } from '../Config.js';
import { WEAPONS, AMMO } from '../data/weapons.js';
import { rand, chance, clamp, angDiff } from '../../engine/math.js';
import { chunk, spriteOpt } from '../../engine/Assets.js';
import Debris from './Debris.js';
import { PLANTED } from './Ragdoll.js';
import { impulse, kgOf } from '../../engine/physics/Body.js';
import Character from './Character.js';
import WeaponItem from './WeaponItem.js';
import { findVault } from '../systems/Cover.js';
import { Slide, canSlide, recover, ducked } from '../systems/Slide.js';
import { behind } from '../systems/Takedown.js';
import { finisherFor, TAKEDOWNS, EXEC } from '../data/finishers.js';
import { MOMENTS, GESTURE } from '../data/feel.js';
import { blowFx } from '../fx/Blows.js';
import { landMoment } from '../fx/Impact.js';
import { muzzleFlash } from '../fx/CombatFx.js';
import { smooth } from './CharacterAnim.js';

const { Body, Query } = Matter;
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
    this.nearTrunk = null;  // a parked car's closed trunk within reach, with something in it (E opens it)
    this.trunkOpen = null;  // { car, t, took } while he opens it (updateTrunk)
    this.safe = { x, y };   // the last spot we stood on that was not inside something solid (see unstick)
    this.sit = 0;           // 1 sitting on the ground (how a level starts) .. 0 up; see updateSit
    this.swig = null;       // the bottle he finishes first, sat there (level intro 'swig'): { t, thrown, go }
    this.rising = false;
    this.takedown = null;   // { target, t, done, blade, side } while we have him by the neck
    this.grab = null;       // what CharacterAnim plays of it: { k, d, side, blade }
    this.slide = null;      // Slide kinematics while sliding
    this.slideCd = 0;
    this.stamina = 1;       // 0..1: what slides cost (PLAYER.slide.cost), back with time
    this.winded = 0;        // s left of the HUD flash after a slide refused for lack of it
    this.slideHits = new Set(); // loose bodies already shoved by the current slide
    this.shootDown = null;  // the corpse under the crosshair when firing (rounds fly over the others)
    // spare rounds per caliber
    this.ammo = { '9mm': 0, '12g': 0, '762': 0, rocket: 0 };
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
    this.winded = Math.max(0, this.winded - dt);
    if (!this.slide) this.stamina = recover(this.stamina, dt, PLAYER.slide);
    this.updateSlideAnim(dt);

    this.unstick();
    if (this.sit > 0 && !this.updateSit(dt, input)) return;
    if (this.execution) { this.updateExecution(dt); return; }
    if (this.takedown) { this.updateTakedown(dt); return; }
    if (this.trunkOpen) { this.updateTrunk(dt); return; }
    this.angle = Math.atan2(aim.y - this.y, aim.x - this.x);
    if (this.updateVault(dt)) return;

    // movement (KeyW/A/S/D are physical positions: ZQSD on AZERTY)
    let dx = 0, dy = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) dy -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) dy += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) dx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) dx += 1;
    // a gamepad's left stick, when no key moves him: its direction, and its push for the pace (a light push walks)
    const stick = !dx && !dy ? input.move?.() : null;
    if (stick) { dx = stick.x; dy = stick.y; }
    const moving = !!(dx || dy);
    const moveA = moving ? Math.atan2(dy, dx) : this.angle;
    if (this.slide) {
      this.updateSlide(dt);
      if (this.vaulting) return; // chained into a vault
    }
    const sliding = !!this.slide;
    if (!sliding) this.steer(dx, dy, PLAYER.speed * (stick ? Math.min(1, 0.25 + stick.mag) : 1), PLAYER.accel);

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
    // a weapon planted in a body that can be pulled out again (a blade he threw)
    this.nearPlanted = null;
    if (!this.nearItem) {
      for (const c of w.corpses) {
        if (c.dead || !c.stuck?.item) continue;
        const s = c.stuckAt();
        if (Math.hypot(s.x - this.x, s.y - this.y) < PLANTED.reach) { this.nearPlanted = c; c.stuck.hot = w.time; break; }
      }
    }
    // the nearest man down within reach: any attack on him, or Space, finishes him (data/finishers.js)
    this.nearDowned = null;
    let down = EXEC.near;
    for (const e of w.enemies) {
      const de = Math.hypot(e.x - this.x, e.y - this.y);
      if (e.alive && e.knocked > 0 && de < down) { down = de; this.nearDowned = e; }
    }
    this.nearTrunk = w.props.find((p) => p.trunk && !p.trunk.open && !p.dead && p.nearTrunk(this.x, this.y)) || null;
    this.nearBack = (!this.nearDowned && w.enemies.find((e) => behind(this, e) && w.lineOfSight(this.x, this.y, e.x, e.y))) || null;

    // attack
    const d = this.def;
    if (d.kind === 'gun' ? (d.auto ? input.mouseDown(0) : input.mouseHit(0)) : input.mouseDown(0)) {
      // on a man who is down, at our feet and under the cursor: his execution, whatever is in the hand
      const nd = this.nearDowned;
      if (nd && (down < 14 || Math.abs(angDiff(this.angle, Math.atan2(nd.y - this.y, nd.x - this.x))) < EXEC.aim)
        && (input.mouseHit(0) || d.kind !== 'gun')) this.startExecution(nd);
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
      : this.nearBack ? TAKEDOWNS[this.takedownKind()].action
        : this.vaultHint ? (this.vaultHint.kind === 'climb' ? 'CLIMB' : this.vaultHint.over.intact ? 'DIVE THROUGH' : 'VAULT') : null;
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
    if (input.hit('KeyE')) {
      if (this.nearTrunk) this.startTrunk(this.nearTrunk);
      else this.pickUp();
    }
  }

  // Last resort against being squeezed into something solid (a car creeping onto us against another one, a wreck
  // thrown at us in a doorway): whenever our centre ends up inside a wall or a vehicle, we are put back where we
  // last stood clear. Vaults go over things on purpose.
  unstick() {
    if (this.vaulting) return;
    const w = this.world, at = { x: this.x, y: this.y };
    const stuck = w.map.solidAt(at.x, at.y) || w.props.some((p) => p.isVehicle && !p.dead
      && Math.abs(p.x - at.x) < 90 && Math.abs(p.y - at.y) < 90 && Query.point([p.body], at).length);
    if (!stuck) { this.safe.x = at.x; this.safe.y = at.y; return; }
    Body.setPosition(this.body, this.safe);
    this.vel = { x: 0, y: 0 };
    Body.setVelocity(this.body, this.vel);
    this.slide = null;
  }

  // sitting against the wall when a level starts: the first key or click gets him up (PLAYER.rise s), and he has
  // his legs back a little before he is quite upright. Returns whether he can act.
  updateSit(dt, input) {
    if (!this.rising) {
      this.steer(0, 0, 0, 1);
      const key = input.anyPressed || input.mouseDown(0);
      if (this.swig && !this.updateSwig(dt, key)) return false;
      if (!key && !this.swig?.go) return false;
      this.swig = null;
      this.rising = true;
      this.world.sound('getUp', this.x, this.y, 0.7);
    }
    this.sit = Math.max(0, this.sit - dt / PLAYER.rise);
    if (this.sit <= 0.3) return true;
    this.steer(0, 0, 0, 1);
    return false;
  }

  // The level opens on him sat against the wall, the last of a bottle of rum in his hand (GESTURE.swig): he drinks
  // it off, looks at it and smashes it on the wall across, then waits for the first key. A key before that hurries
  // the throw and has him up right after it. Nobody hears it. Returns whether it is over.
  updateSwig(dt, key) {
    const g = this.swig, T = GESTURE.swig, w = this.world;
    if (key) { g.go = true; g.t = Math.max(g.t, T.back[0]); }
    g.t += dt;
    if (!g.thrown && g.t >= T.throw) {
      g.thrown = true;
      // out of his hand, straight ahead, to the first wall (or the floor, where there is none)
      const a = this.angle, c = Math.cos(a), s = Math.sin(a), x0 = this.x + c * 14, y0 = this.y + s * 14;
      let d = 0;
      while (d < T.reach && !w.map.solidAt(x0 + c * (d + 6), y0 + s * (d + 6))) d += 4;
      const dur = d / T.speed, img = spriteOpt('items/bottle');
      const bottle = img && new Debris(w, img, x0, y0, a, c * T.speed, s * T.speed, 0.5, { material: 'glass', kg: 0.5, fly: dur + 0.1 });
      if (bottle) w.addDebris(bottle);
      w.sound('throw', this.x, this.y, 0.6);
      w.after(dur, () => {
        const x = x0 + c * d, y = y0 + s * d;
        if (bottle) w.removeDebris(bottle);
        w.particles.glass(x, y, a + Math.PI, 1.2, 16, 220);
        w.decals.smear(x, y, a + Math.PI / 2, 9, '#3a2410', 0.35); // what was left of the rum, down the wall
        w.sound('glass', x, y, 0.7);
        w.critters?.scare(x, y, 220, 280); // the cat on the dumpster is off, the pigeons with it
      });
    }
    return g.t >= T.end;
  }

  // E at the tail of a parked car (GESTURE.trunk): he bends over it, lifts the lid with both hands and takes what is
  // inside; he cannot strike meanwhile
  startTrunk(car) {
    this.trunkOpen = { car, t: 0, took: false };
    car.trunk.open = true;
    car.liftTrunk(0);
    this.nearTrunk = null;
    this.swing = 0;
    this.world.sound('trunk', car.x, car.y, 0.8);
  }

  updateTrunk(dt) {
    const o = this.trunkOpen, car = o.car, T = GESTURE.trunk;
    if (car.dead || car.exploded) { this.trunkOpen = null; return; }
    o.t += dt;
    const k = o.t / T.dur, at = car.trunkSpot(), dx = at.x - this.x, dy = at.y - this.y;
    // squared up to the lid's edge, a step in if he is not quite there
    this.angle = Math.atan2(dy, dx);
    this.steer(dx, dy, Math.hypot(dx, dy) > 7 ? 1.5 : 0, 0.5);
    car.liftTrunk(smooth((k - T.lift[0]) / (T.lift[1] - T.lift[0])));
    if (!o.took && k >= T.take) {
      o.took = true;
      const type = car.takeFromTrunk();
      if (type) this.take(type);
    }
    if (k >= 1) this.trunkOpen = null;
  }

  pickUp() {
    const it = this.nearItem;
    if (!it && this.nearPlanted?.stuck?.item) {
      const got = this.nearPlanted.pullStuck();
      this.nearPlanted = null;
      this.take(got.type, got.mag, got.wear);
      return;
    }
    if (!it) return;
    this.world.removeItem(it);
    this.take(it.type, it.mag, it.wear);
  }

  // a weapon into the hand (what was in it falls behind him): mag = rounds in it, wear = kills left in a melee one
  take(type, mag, wear) {
    if (this.armed) this.dropWeapon(this.angle + Math.PI + rand(-0.5, 0.5), 1.5);
    this.setWeapon(type, mag);
    this.weapon.wear = wear ?? this.def.wear;
    this.world.sound('pickup', this.x, this.y, 1, { weapon: type });
    this.world.events.emit('pickup', { ch: this, type });
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
    it.wear = this.weapon.wear;
    w.addItem(it);
    this.weapon = null;
    this.reloading = 0;
    this.cooldown = 0.15;
    this.throwT = this.throwDur;
    w.sound('throw', this.x, this.y, power ? 1 : 0.8, { weapon: it.type });
    if (power) { w.slowmo(...MOMENTS.throw.slowmo); w.shake(MOMENTS.throw.shake); }
  }

  // ---------------- slide ----------------
  startSlide(a) {
    const cfg = PLAYER.slide, w = this.world;
    if (this.vaulting || !canSlide(this.slideCd, this.moving, PLAYER.speed, cfg)) return false;
    if (this.stamina < cfg.cost) { this.winded = 0.35; return false; }
    this.stamina -= cfg.cost;
    this.slide = new Slide(a, PLAYER.speed, cfg);
    w.slowmo(...MOMENTS.slideTime.slowmo); // bullet time
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

  // low on the floor at the heart of a slide: rounds pass over us (Projectile)
  get ducking() { return !!this.slide && ducked(this.slide.k, PLAYER.slide); }

  // a round just did: a breath of slow motion, once per slide
  dodge() {
    const sl = this.slide, w = this.world;
    if (!sl || sl.dodged) return;
    sl.dodged = true;
    w.slowmo(...PLAYER.slide.bulletTime);
    w.events.emit('dodge', { ch: this, x: this.x, y: this.y });
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
        landMoment(w, e, sl.angle, null, MOMENTS.slide, false);
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

  // ground finisher on a knocked-out enemy (data/finishers.js): the player is taken over until it is done. He sets
  // himself on the man (ex.at, facing ex.face; standing over him where there is no room for it), the beats land one
  // after the other, the last one kills, and he stays a moment (ex.done). The poses: CharacterAnim execPose.
  startExecution(target) {
    const f = finisherFor(this.def, this.weapon), w = this.world;
    const dir = target.downAngle, c = Math.cos(dir), s = Math.sin(dir); // the way his head lies
    const on = (k) => ({ x: target.x + c * k, y: target.y + s * k });
    const head = on(EXEC.head);
    let at = null, face = dir;
    if (f.mount === 'astride') at = on(EXEC.astride);
    else if (f.mount === 'over') at = on(EXEC.over);
    else if (f.mount === 'side') {
      const side = (this.x - head.x) * -s + (this.y - head.y) * c >= 0 ? 1 : -1; // the side he is already on
      at = { x: target.x + c * EXEC.side[0] - s * side * EXEC.side[1], y: target.y + s * EXEC.side[0] + c * side * EXEC.side[1] };
      face = Math.atan2(head.y - at.y, head.x - at.x);
    }
    if (at && w.map.solidAt(at.x, at.y)) at = null;
    // t: s into the beat (it starts once he is in place), hit: s since the last beat landed, age: s since it began
    this.execution = { target, f, at, face, head, hits: at ? (f.at === 'chest' ? on(EXEC.chest) : head) : target,
      t: at ? -EXEC.mount : 0, i: 0, age: 0, hit: 9, done: false };
    target.executing = true;
    this.swing = 0;
    this.steer(0, 0, 0, 1);
    if (f.beats[0][1] === 'windup') this.windup();
  }

  // the weapon brought back and held: the stroke clock all but stopped just past its anticipation
  windup() {
    this.strike = 0;
    this.swingDur = 20;
    this.swing = 18.2;
    this.world.sound('swing', this.x, this.y, 0.5, { pitch: 0.7, weapon: this.weapon?.type });
  }

  updateExecution(dt) {
    const ex = this.execution, tg = ex.target, w = this.world, f = ex.f, d = this.def;
    dt *= EXEC.rate;
    ex.age += dt;
    ex.hit += dt;
    if (ex.at) {
      // held in place on him: nothing moves him, he looks where the finisher has him look
      const k = 1 - Math.exp(-dt * 20);
      Body.setPosition(this.body, { x: this.x + (ex.at.x - this.x) * k, y: this.y + (ex.at.y - this.y) * k });
      this.vel = { x: 0, y: 0 };
      Body.setVelocity(this.body, this.vel);
      this.angle += angDiff(this.angle, ex.face) * Math.min(1, dt * 16);
    } else {
      const dx = tg.x - this.x, dy = tg.y - this.y;
      this.angle = Math.atan2(dy, dx);
      this.steer(dx, dy, Math.hypot(dx, dy) > 12 ? 1.5 : 0, 0.5);
    }
    if (ex.done) {
      if ((ex.t += dt) >= (f.after ?? 0)) { this.execution = null; this.cooldown = 0.25; }
      return;
    }
    if (!tg.alive) { this.execution = null; this.swing = 0; return; }
    ex.t += dt;
    const [wait, what] = f.beats[ex.i];
    if (ex.t < wait) return;
    ex.t = 0;
    ex.hit = 0;
    const last = ex.i === f.beats.length - 1, { x, y } = ex.hits;
    if (what === 'windup') {
      // let go: the swing comes round in slow motion
      if (f.slowmo) w.slowmo(...f.slowmo);
    } else if (what === 'grab' || what === 'pin') w.sound('swing', this.x, this.y, 0.4, { pitch: 1.3 }); // his hands on him
    else {
      if (!f.pose) {
        this.swingDur = this.swing = 0.22;
        this.strike = typeof what === 'number' ? what : 2;
        // a weapon's stroke comes from its own side (as in attack), fists alternate
        this.punchSide = d.hold === 'melee' ? (this.strike === 1 ? -1 : 1) : -this.punchSide;
      }
      const light = what === 'press';
      w.particles.blood(x, y, rand(0, 6.28), Math.PI, light ? 6 : 14, light ? 90 : 160);
      w.decals.stampBlood(x, y, light ? 3 : 6, light ? 2 : 4);
      if (what === 'shot') {
        this.weapon.mag--;
        this.recoil = 1;
        const m = this.muzzlePos();
        muzzleFlash(w, m.x, m.y, m.a, d, this);
        w.sound(d.sound, this.x, this.y);
        if (d.noise) w.noise(this.x, this.y, d.noise, this, 'gunshot');
      } else if (light) w.sound('punch', x, y, 0.5, { pitch: 0.8 });
      else if (what === 'stab') w.sound('slash', x, y, 0.8, { pitch: rand(0.95, 1.15) });
      else {
        w.sound(d.hold === 'none' ? 'punch' : d.swing === 'blade' ? 'slash' : 'splat', x, y);
        if (d.swing === 'club') blowFx(w, d, tg, this.angle, { heavy: true, from: 'side' });
        if (what === 'stomp' || what === 'slam') {
          w.particles.dust(x, y, 8, 12, '#6a6272', { speed: 50, size: 4, life: 0.7, alpha: 0.2 });
          w.shake(MOMENTS.stomp.shake);
          w.sound('bodyFall', x, y, 1);
        }
      }
      // every beat but the last lands as a blow of its own (the last one lands as the finisher, once he is dead)
      if (!last) landMoment(w, tg, this.angle, d, MOMENTS.beat, false);
    }
    if (++ex.i < f.beats.length) {
      if (f.beats[ex.i][1] === 'windup') this.windup();
      return;
    }
    // the last beat kills
    let by, angle = this.angle;
    if (f.plant) {
      // it goes through him and stays: a cue snaps (its other half left in the hand), a stake is let go
      by = { gore: 0, wound: 'slash', stuck: d.snaps ? WEAPONS[d.snaps].sprite : d.sprite };
    } else if (f.launch) {
      // the head flies off across the swing (it runs toward the side opposite the one it came from)
      by = { gore: 99, wound: 'blunt', launch: f.launch };
      angle = this.angle - this.punchSide * 1.2;
    } else if (f.cause === 'slash') by = { gore: 0, wound: 'slash' };
    tg.kill(angle, f.cause, this, by, { finisher: true, label: f.label });
    landMoment(w, tg, angle, d, MOMENTS.finisher, !tg.alive);
    if (f.flight) w.slowmo(...f.flight);
    if (f.plant) this.breakWeapon(this.angle, true);
    ex.done = true;
    ex.i = f.beats.length - 1;
  }

  // seize a guard from behind: he can do nothing until it is over (Enemy.held), nobody hears it
  startTakedown(target) {
    const kind = this.takedownKind(), blade = kind === 'blade';
    // bare hands wrench either way; with something in the right hand the left arm pulls his chin round
    const side = this.def.hold === 'none' && chance(0.5) ? 1 : -1;
    this.takedown = { target, t: 0, done: false, blade, side, kind };
    this.grab = { k: 0, d: 17, side, blade };
    this.contextAction = null;
    this.swing = 0;
    target.held = this;
    target.swing = target.tell = 0;
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
        const how = { label: TAKEDOWNS[td.kind].label };
        if (td.blade) tg.kill(this.angle, 'slash', this, this.def, how);
        else if (td.kind === 'club') {
          // the back of his skull: one blow, no cry
          blowFx(w, this.def, tg, this.angle, { heavy: true, from: 'behind' });
          tg.kill(this.angle, 'melee', this, { gore: 0, wound: 'crush' }, how);
        } else tg.kill(this.angle + td.side * 1.5, 'snap', this, undefined, how);
        landMoment(w, tg, this.angle + td.side * 1.5, this.def, MOMENTS.takedown, !tg.alive);
      }
    }
    if (k >= 1) {
      this.takedown = this.grab = null;
      this.cooldown = 0.15;
    }
  }

  // how a guard seized from behind is put down with what is in the hand (data/finishers.js TAKEDOWNS)
  takedownKind() {
    const d = this.def;
    return d.swing === 'blade' ? 'blade' : d.finisher === 'cue' ? 'choke' : d.swing === 'club' ? 'club' : 'neck';
  }

  knock(angle) { this.kill(angle, 'melee'); }

  get ammoText() {
    if (!this.weapon) return '';
    const d = WEAPONS[this.weapon.type], n = this.weapon.wear;
    if (d.kind === 'gun') return `${Math.max(0, this.weapon.mag)} | ${this.reserveCount()} ${AMMO[d.ammo].name}`;
    return d.wear ? `${n} BLOW${n === 1 ? '' : 'S'} LEFT` : '';
  }
}
