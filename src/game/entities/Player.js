import { PLAYER, TAKEDOWN, BODY_SCALE, TILE, ENEMY } from '../Config.js';
import { WEAPONS, AMMO, WEAR, plantedOf, keepsOne } from '../data/weapons.js';
import { rand, chance, angDiff } from '../../engine/math.js';
import { spriteOpt } from '../../engine/Assets.js';
import Debris from './Debris.js';
import { PLANTED } from './Ragdoll.js';
import { impulse, kgOf } from '../../engine/physics/Body.js';
import Character from './Character.js';
import WeaponItem from './WeaponItem.js';
import { findVault } from '../systems/Cover.js';
import { Slide, canSlide, recover, ducked } from '../systems/Slide.js';
import { kickReady, kickTarget, standing, throwSpeed } from '../systems/Kick.js';
import { behind, within, unspotted, newTakedown, advance, slamAt } from '../systems/Takedown.js';
import { lungeTarget } from '../systems/Lunge.js';
import { spotFor } from '../systems/TakedownSpot.js';
import { finisherChoice, killBeat, takedownFor, takedownChoice, freeHand, hintOf, shotCause, SLAM_SOUND, EXEC } from '../data/finishers.js';
import { MARKS } from '../data/wounds.js';
import { MOMENTS, GESTURE, TRAVERSE, TRAVERSE_FX, BREAK, SNATCH } from '../data/feel.js';
import { WALL_IMPACT } from '../data/materials.js';
import { LIQUIDS } from '../data/liquids.js';
import { splashWall } from '../fx/Spatter.js';
import { SLIP } from '../data/devices.js';
import { blowFx } from '../fx/Blows.js';
import { landMoment, landOnBody, slowAtLeast } from '../fx/Impact.js';
import { pulp } from '../fx/Gore.js';
import { squirt } from '../fx/Bleeding.js';
import { muzzleFlash } from '../fx/CombatFx.js';
import { slideFx, landFx } from '../fx/TraversalFx.js';
import { combatFx } from '../fx/CombatFx.js';
import { smooth } from './CharacterAnim.js';

const { Body, Query } = Matter;
const SHOVE_T = 0.28; // s a guard's shove carries him back (Enemy.shove)
let scuff = null; // floor scuff stamp, made on first use
const GUN_BUTT = { swing: 'club', material: 'metal' }; // an empty gun brought down on a man: what rings (fx/Blows.js)
// a takedown's beats that land on his head, and those of them done with our own body whatever is in the hand
const HEAD_BLOWS = new Set(['nape', 'butt', 'knee', 'headbutt', 'throat', 'sweep', 'temple']), BODY_BLOWS = new Set(['knee', 'headbutt', 'throat', 'sweep']);
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const WORN = 1e-6; // what is left of a weapon's wear (in blows) once it is used up
// what a beat of a finisher leaves on a body already dead (data/wounds.js MARKS): a round's hole, a blade's, a blow's
const beatMark = (what, d) => (what === 'shot' ? MARKS[d.wound] : what === 'stab' || what === 'rip' ? MARKS.stab : what === 'cut' ? MARKS.throat
  : what === 'twist' || what === 'press' ? null : MARKS.blunt);

export default class Player extends Character {
  constructor(world, x, y, angle) {
    super(world, x, y, angle, 'player', 'player');
    this.isPlayer = true;
    this.radius = PLAYER.radius;
    this.execution = null;
    this.execOut = null;    // { ex, t } the finisher he walked out of, while its pose lets go (endExecution)
    this.lastFinisher = null; // the long execution he did last (never the same twice running)
    this.nearItem = null;
    this.nearDowned = null;
    this.nearTakedown = null; // a guard within reach who has not spotted us (left click takes him down)
    this.takeMove = null;   // ... and what that takedown would be: { f, spot, front } (takedownMove)
    this.nextTakedown = null; // { own, front, f } the weapon's takedown picked for the next one (pickTakedown)
    this.lastTakedown = null; // the one he did last (never the same twice running)
    this.nearTrunk = null;  // a parked car's closed trunk within reach, with something in it (E opens it)
    this.trunkOpen = null;  // { car, t, took } while he opens it (updateTrunk)
    this.nearUse = null;    // a device of the level within reach (systems/Uses.js): E uses it
    this.slipped = null;    // { t, a, v } while down on a slick floor (slip)
    this.passage = null;    // the trip through a passage under the street while it lasts (systems/Passage.js)
    this.lunge = null;      // { a, dir, v, stop, until } a swing drawn to a guard (startLunge)
    this.safe = { x, y };   // the last spot we stood on that was not inside something solid (see unstick)
    this.sit = 0;           // 1 sitting on the ground (how a level starts) .. 0 up; see updateSit
    this.pinned = false;    // sat there, no key gets him up yet
    this.swig = null;       // the bottle he finishes first, sat there (level intro 'swig'): { t, thrown, go }
    this.rising = false;
    this.takedown = null;   // a guard taken from behind (startTakedown): systems/Takedown.js newTakedown + { target, side, d }
    this.slide = null;      // Slide kinematics while sliding
    this.shove = null;      // a guard's shove carrying him back { a, v, t } (see shoved)
    this.slideCd = 0;
    this.stamina = 1;       // 0..1: what slides cost (PLAYER.slide.cost), back with time
    this.winded = 0;        // s left of the HUD flash after a slide refused for lack of it
    this.slideHits = new Set(); // loose bodies already shoved by the current slide
    this.slideEnd = { t: -9, a: 0 }; // when the last slide ended and its way (a kick may still come out of it)
    this.kick = null;       // the kick out of a slide's end (startKick): { target, a, t, v, side, landed, planted, hitAt }
    this.shootDown = null;  // the corpse under the crosshair when firing (rounds fly over the others)
    this.broke = null;      // { t, d, stub, toss } the beat after his weapon gave out (Character.breakWeapon)
    this.brokeAt = null;    // { name, t } when it did, for the HUD
    this.snatch = null;     // { item, at } a dead man's weapon his hand is going to (snatches)
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
    if (this.broke) this.updateBroke(dt);
    if (this.snatch && !this.execution && !this.takedown && w.time >= this.snatch.at) this.grab();
    this.slideCd -= dt;
    this.winded = Math.max(0, this.winded - dt);
    if (!this.slide) this.stamina = recover(this.stamina, dt, PLAYER.slide);
    this.updateSlideAnim(dt);

    this.unstick();
    if (this.sit > 0 && !this.updateSit(dt, input)) return;
    if (this.execOut && (this.execOut.t -= dt) <= 0) this.execOut = null;
    if (this.execution) { this.updateExecution(dt, input); return; }
    if (this.takedown) { this.updateTakedown(dt); return; }
    if (this.trunkOpen) { this.updateTrunk(dt); return; }
    if (this.slipped) { this.updateSlip(dt); return; }
    if (this.passage) { this.updatePassage(dt); return; }
    this.angle = Math.atan2(aim.y - this.y, aim.x - this.x);
    // a swing drawn to a guard keeps its aim on him until the blow is struck (Character.meleeStrike reads the angle)
    const lg = this.lunge;
    if (lg && w.time >= lg.until) this.lunge = null;
    else if (lg) this.angle = lg.a;
    if (this.updateVault(dt)) return;
    if (this.kick) { this.updateKick(dt); return; }
    // a guard just ahead as the slide's get-up begins: the kick still comes
    if (!this.slide && this.slideAnim && this.tryKick(this.slideEnd.a, null, w.time - this.slideEnd.t)) return;

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
    const sh = this.shove;
    if (sh) {
      // a guard's flat hand in his chest (Enemy.shove): thrown back a step or two, then his legs are his own again
      sh.t -= dt;
      this.steer(Math.cos(sh.a), Math.sin(sh.a), sh.v * Math.max(0, sh.t / SHOVE_T), 0.6);
      if (sh.t <= 0) this.shove = null;
    } else if (!sliding) this.steer(dx, dy, PLAYER.speed * (stick ? Math.min(1, 0.25 + stick.mag) : 1), PLAYER.accel);
    if (this.lunge && !sliding && !sh && w.time < this.lunge.stop) {
      const L = this.lunge;
      this.vel = { x: Math.cos(L.dir) * L.v, y: Math.sin(L.dir) * L.v };
      Body.setVelocity(this.body, this.vel);
    }

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
    this.nearUse = this.nearTrunk ? null : w.uses.near(this); // a device of the level (systems/Uses.js)
    if (this.nearUse) { // ... unless a weapon lies closer at his feet: E picks that up
      const u = w.uses.at(this.nearUse), it = this.nearItem;
      if (it && Math.hypot(it.x - this.x, it.y - this.y) < Math.hypot(u.x - this.x, u.y - this.y)) this.nearUse = null;
    }
    // a guard within reach who has not spotted us (systems/Takedown.js within, unspotted), from whatever side: the
    // left click takes him down; spotted, a click at him is an ordinary attack
    const phase = w.director?.phase;
    this.nearTakedown = (!this.nearDowned && w.enemies.find((e) => within(this, e) && unspotted(e, phase) && w.lineOfSight(this.x, this.y, e.x, e.y))) || null;
    this.takeMove = this.nearTakedown ? this.takedownMove(this.nearTakedown) : null;

    // attack (a stub of a broken weapon still in the hand is let fall first)
    if (this.broke?.stub && (input.mouseDown(0) || input.mouseHit(2))) this.dropStub();
    const d = this.def;
    const nb = this.nearTakedown;
    if (nb) { if (input.mouseHit(0)) this.startTakedown(nb, this.takeMove); } // never swing or fire at him then
    else if (d.kind === 'gun' ? (d.auto ? input.mouseDown(0) : input.mouseHit(0)) : input.mouseDown(0)) {
      // on a man who is down, at our feet and under the cursor: his execution, whatever is in the hand
      const nd = this.nearDowned;
      if (nd && (down < 14 || Math.abs(angDiff(this.angle, Math.atan2(nd.y - this.y, nd.x - this.x))) < EXEC.aim)
        && (input.mouseHit(0) || d.kind !== 'gun')) this.startExecution(nd);
      else {
        this.shootDown = d.kind === 'gun' ? this.corpseAt(aim.x, aim.y) : null;
        // dry: reload if we can, otherwise hurl the useless gun at them
        const did = this.attack();
        if (did === 'empty' && input.mouseHit(0) && !this.reload()) this.throwWeapon(true);
        else if (did === true && d.kind !== 'gun' && !sliding) this.startLunge(d);
      }
    }
    if (input.hit('KeyR')) this.reload();
    // Space = context action: execute > vault > slide (the slide needs a running start, no HUD label); the takedown
    // from behind is the left click
    const busy = sliding || this.nearDowned || this.nearTakedown;
    this.vaultHint = busy ? null : findVault(w, this, moveA); // marked on the obstacle (WorldRenderer)
    this.contextAction = sliding ? null : this.nearDowned ? 'EXECUTE'
      : this.nearTakedown ? hintOf(this.takeMove.f, this.takeMove.spot)
        : this.vaultHint ? (this.vaultHint.kind === 'climb' ? 'CLIMB' : this.vaultHint.over.intact ? 'DIVE THROUGH' : 'VAULT') : null;
    if (input.hit('Space') && !sliding) {
      if (this.nearDowned) this.startExecution(this.nearDowned);
      else if (!this.tryVault(moveA) && moving) this.startSlide(moveA);
    }

    // right click: throw when armed, pick up otherwise. E: pick up / swap
    if (input.mouseHit(2)) {
      if (this.armed) this.throwWeapon();
      else this.pickUp();
    }
    if (input.hit('KeyE')) {
      if (this.nearTrunk) this.startTrunk(this.nearTrunk);
      else if (this.nearUse) this.nearUse.use(this);
      else this.pickUp();
    }
  }

  // a melee swing just started: drawn to the guard in front of him, if one stands close (systems/Lunge.js): the aim
  // turned onto him until the blow is struck, a step toward him over PLAYER.lunge.dur
  startLunge(d) {
    const w = this.world, L = PLAYER.lunge;
    const r = lungeTarget(this, d, w.enemies, this.angle, L, (e) => w.lineOfSight(this.x, this.y, e.x, e.y), (x, y) => w.map.solidAt(x, y));
    if (!r) return;
    this.angle = r.a;
    // px per base step that covers `push` over `dur` s
    this.lunge = { a: r.a, dir: r.dir, v: r.push / (L.dur * 60), stop: w.time + L.dur, until: w.time + Math.max(L.dur, d.windup) };
  }

  // shoved along a at `speed` px/step (a guard telling him to get out: Enemy.shove)
  shoved(a, speed) {
    if (this.slide || this.vaulting || this.sit > 0) return;
    this.shove = { a, v: speed, t: SHOVE_T };
  }

  // ---------------- a slick floor, a trapdoor ----------------
  // his feet went running along a on a slick floor (systems/Slips.js): on his back, sliding on and slowing (the slide's
  // own pose), then up again; he can do nothing meanwhile, and the same floor spares him a moment after
  slip(a) {
    const S = SLIP.player;
    this.slipped = { t: 0, a, v: PLAYER.speed * S.speed };
    this.slide = null;
    this.swing = 0;
    this.reloading = 0;
    this.slideAnim = { dir: a, side: Math.cos(this.angle - a) >= 0 ? -1 : 1, k: 0.45, w: this.slideAnim?.w ?? 0 };
    this.world.shake(0.06);
  }

  updateSlip(dt) {
    const s = this.slipped, S = SLIP.player;
    s.t += dt;
    if (s.t < S.slide) {
      s.v *= Math.pow(S.brake, dt);
      this.vel = { x: Math.cos(s.a) * s.v, y: Math.sin(s.a) * s.v };
      Body.setVelocity(this.body, this.vel);
      return;
    }
    this.steer(0, 0, 0, 0.3);
    if (s.t < S.slide + S.up) return;
    this.slipped = null;
    this.slipGrace = this.world.time + S.grace;
    this.world.sound('getUp', this.x, this.y, 0.6);
  }

  // E at a trapdoor (systems/Passage.js): it runs him down, along and up; nothing he does meanwhile
  updatePassage(dt) {
    this.steer(0, 0, 0, 1);
    this.passage.step(dt);
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
      if (this.pinned) return false; // a scene keeps him down (systems/Tutorial.js: the opening)
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
      const at = this.nearPlanted.stuckAt(), got = this.nearPlanted.pullStuck();
      this.nearPlanted = null;
      this.take(got.type, got.mag, got.wear);
      this.pickFrom = at; // the hand goes down to it (CharacterAnim)
      return;
    }
    if (!it) return;
    this.world.removeItem(it);
    this.take(it.type, it.mag, it.wear, it.bare);
    this.pickFrom = { x: it.x, y: it.y }; // the hand goes down to where it lay (CharacterAnim)
  }

  // a weapon into the hand (what was in it falls behind him): mag = rounds in it, wear = blows left in a melee one,
  // bare: a gun with its magazine out
  take(type, mag, wear, bare = false) {
    if (this.broke?.stub) this.dropStub();
    if (this.armed) this.dropWeapon(this.angle + Math.PI + rand(-0.5, 0.5), 1.5);
    this.setWeapon(type, mag);
    this.weapon.wear = wear ?? this.def.wear;
    this.weapon.bare = !!bare;
    this.world.sound('pickup', this.x, this.y, 1, { weapon: type });
    this.world.events.emit('pickup', { ch: this, type });
    if (this.def.kind === 'gun') this.world.sound('rack', this.x, this.y, 0.7, { weapon: this.weapon.type });
    this.pickAnim = 0.35;
    this.pickFrom = null;
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
    it.setBare(this.weapon.bare);
    w.addItem(it);
    this.weapon = null;
    this.reloading = 0;
    this.cooldown = 0.15;
    this.throwT = this.throwDur;
    w.sound('throw', this.x, this.y, power ? 1 : 0.8, { weapon: it.type });
    if (power) { w.slowmo(...MOMENTS.throw.slowmo); w.shake(MOMENTS.throw.shake); }
  }

  // ---------------- a weapon given out, a dead man's taken ----------------
  // the beat after his weapon broke (Character.breakWeapon, BREAK; the pose: CharacterAnim brokePose): the stub of it
  // let fall (or thrown away) on its cue
  updateBroke(dt) {
    const b = this.broke;
    b.t += dt;
    if (b.stub && b.t >= BREAK.beat * BREAK.drop) this.dropStub();
    if (b.t >= BREAK.beat) this.broke = null;
  }

  // the stub out of his hand: it falls by him, a bent iron is thrown away
  dropStub() {
    const b = this.broke;
    this.letGo(b.stub, b.d.material, b.toss ? 1.3 : 0.3, b.toss);
    if (b.toss) this.world.sound('throw', this.x, this.y, 0.6);
    b.stub = null;
  }

  // Is the weapon of the man he just killed (victim) his for the taking (SNATCH)? The man was killed by his hand up
  // close (how.close: a blow, a takedown, a finisher), his own hands are free, or his weapon broke on that kill with
  // nothing left in the hand; what the man had is in his hand, or lies where it fell as he was floored (lastDrop).
  snatches(victim, how) {
    if (!SNATCH.on || !how?.close || this.snatch) return false;
    if (this.weapon && !(how.broke && !keepsOne(this.def))) return false;
    if (victim.weapon) return Math.hypot(victim.x - this.x, victim.y - this.y) <= SNATCH.reach;
    const it = victim.lastDrop;
    return !!it && !it.dead && Math.hypot(it.x - this.x, it.y - this.y) <= SNATCH.far;
  }

  // the weapon he will take (Character.kill), as soon as his hands are his own again (not in a takedown or a
  // finisher) and it has fallen (SNATCH.delay)
  snatchFrom(item) {
    if (item) this.snatch = { item, at: this.world.time + SNATCH.delay };
  }

  // his hand closes on it: the pick-up's reach and twirl into his grip (CharacterAnim, pickAnim), with the rounds left
  // in it, a breath of slow motion (MOMENTS.snatch)
  grab() {
    const it = this.snatch.item, w = this.world;
    this.snatch = null;
    if (it.dead || this.weapon || Math.hypot(it.x - this.x, it.y - this.y) > SNATCH.far) return;
    w.removeItem(it);
    this.take(it.type, it.mag, it.wear, it.bare);
    this.pickFrom = { x: it.x, y: it.y };
    slowAtLeast(w, ...MOMENTS.snatch.slowmo);
    w.sound('snatch', this.x, this.y, 1, { weapon: it.type });
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
    w.sound('slideScrape', this.x, this.y, 0.7, { floor: w.floorAt(this.x, this.y) }); // placeholder (PLACEHOLDERS.md)
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
    // the end of it, a standing guard just ahead: up into a kick
    if (this.tryKick(sl.angle, sl.k)) return;
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
      if (this.tryKick(sl.angle, sl.k, 0, sl.stalled)) return; // stopped short by him, or at its very end
      if (sl.stalled) w.shake(0.08);
      this.endSlide();
      return;
    }
    for (const pair of w.physics.activePairs()) {
      const o = pair.bodyA === this.body ? pair.bodyB : pair.bodyB === this.body ? pair.bodyA : null;
      if (!o || o.mu === undefined || (o.isStatic && !o.frozen) || this.slideHits.has(o)) continue;
      this.slideHits.add(o);
      // a light thing is sent off no faster than the feet that hit it
      impulse(o, sl.angle, kgOf(this.body) * sl.speed * cfg.hitMomentum, rand(-0.3, 0.3), sl.speed);
    }
    this.setSlideVelocity();
    // friction: dust off the trailing hand and the lead foot, streaks of light, a faint skid mark (fx/TraversalFx.js)
    slideFx(this, sl, this.slideAnim, dt);
  }

  // hand the remaining speed back to the run
  endSlide() {
    const sl = this.slide;
    this.slide = null;
    this.slideEnd.t = this.world.time; this.slideEnd.a = sl.angle;
    this.slideCd = PLAYER.slide.cooldown;
    this.vel = { x: sl.dx * sl.speed, y: sl.dy * sl.speed };
    Body.setVelocity(this.body, this.vel);
  }

  // blend weight of the slide pose: quick drop into it, then up off the floor in one motion (`out`: the push back
  // up once the slide is over, TRAVERSE.slide.rec s, CharacterAnim.slidePose)
  updateSlideAnim(dt) {
    const a = this.slideAnim;
    if (!a) return;
    const down = this.slipped && this.slipped.t < SLIP.player.slide; // flat on his back on a slick floor (slip)
    if (this.slide || down) { if (this.slide) a.k = this.slide.k; a.w = Math.min(1, a.w + dt / (down ? 0.08 : 0.07)); a.out = 0; }
    else if ((a.out = Math.min(1, (a.out ?? 0) + dt / TRAVERSE.slide.rec)) >= 1) this.slideAnim = null;
  }

  // ---------------- the kick out of a slide (systems/Kick.js, PLAYER.slide.kick, TRAVERSE.kick) ----------------
  // At the end of a slide (k: its progress, null once it is over, `since` s ago; stalled: stopped short), a standing
  // guard just ahead along a: up into the kick. Whether it started.
  tryKick(a, k, since = 0, stalled = false) {
    const K = PLAYER.slide.kick, w = this.world;
    if (!kickReady(k, since, K, stalled)) return false;
    const e = kickTarget(this.x, this.y, a, w.enemies, K, (g) => w.lineOfSight(this.x, this.y, g.x, g.y));
    if (!e) return false;
    this.startKick(e);
    return true;
  }

  // up out of the slide, the lead knee drawn up, the leg driven out at his head: the slide's way carried on up to him,
  // planted at the contact (landKick), then a step on (the pose: CharacterAnim kickPose)
  startKick(target) {
    const sl = this.slide, w = this.world;
    const v = sl ? sl.speed : Math.hypot(this.vel.x, this.vel.y);
    if (sl) {
      this.slide = null;
      this.slideEnd.t = w.time; this.slideEnd.a = sl.angle;
      this.slideCd = PLAYER.slide.cooldown;
    }
    // side: the slide's (its palm's side: the lead leg, the one that kicks, is on the other)
    this.kick = { target, a: Math.atan2(target.y - this.y, target.x - this.x), t: 0, v, side: this.slideAnim?.side ?? 1,
      landed: false, planted: false, hitAt: null };
    this.swing = 0;
    this.reloading = 0;
    w.sound('kickWhoosh', this.x, this.y, 0.8); // placeholder (PLACEHOLDERS.md)
  }

  updateKick(dt) {
    const k = this.kick, T = TRAVERSE.kick, K = PLAYER.slide.kick, w = this.world, tg = k.target;
    k.t += dt;
    const u = Math.min(1, k.t / T.dur), hitT = T.hit * T.dur;
    let sp = 0;
    if (!k.landed) {
      // on toward him, square to him, to the kick's distance by the contact
      if (standing(tg)) k.a = Math.atan2(tg.y - this.y, tg.x - this.x);
      const left = Math.max(1 / 60, hitT - k.t), d = Math.hypot(tg.x - this.x, tg.y - this.y) - K.gap;
      sp = Math.max(0, Math.min(k.v, d / (left * 60)));
    } else if (u > T.hold) sp = k.v * 0.35 * Math.sin(Math.PI * Math.min(1, (u - T.hold) / (1 - T.hold))); // the step on
    this.vel = { x: Math.cos(k.a) * sp, y: Math.sin(k.a) * sp };
    Body.setVelocity(this.body, this.vel);
    if (!k.landed && k.t >= hitT) this.landKick();
    if (!k.planted && u >= T.plant) {
      // the kicking foot set down a step ahead
      k.planted = true;
      w.sound('landThud', this.x, this.y, 0.5, { floor: w.floorAt(this.x, this.y) });
      landFx(this, k.a, TRAVERSE_FX.kick.land);
    }
    if (u >= 1) { this.kick = null; this.cooldown = 0.1; }
  }

  // the foot on his head: floored, thrown back along the kick (a whiff when he is no longer there to take it)
  landKick() {
    const k = this.kick, K = PLAYER.slide.kick, tg = k.target, w = this.world;
    k.landed = true;
    if (!standing(tg) || Math.hypot(tg.x - this.x, tg.y - this.y) > K.range + 6) return;
    k.hitAt = { x: tg.x, y: tg.y }; // the foot stays out where it met him (CharacterAnim kickPose)
    this.footOn(tg, k.a, 'kick', K.back, K.noise);
  }

  // A foot (or both) driven into a standing guard along a: knocked down (cause 'kick' | 'hood', data/scoring.js),
  // thrown `back` px; the hit-stop and the star on his head, the crack of it heard `noise` px
  footOn(tg, a, cause, back, noise) {
    const w = this.world, F = TRAVERSE_FX.kick;
    tg.knock(a, cause, { speed: throwSpeed(back, ENEMY.knockBrake) });
    landMoment(w, tg, a, null, MOMENTS.slideKick, false);
    const hx = tg.x - Math.cos(a) * 3, hy = tg.y - Math.sin(a) * 3;
    combatFx(w).burst(hx, hy, a, F.burst, 1);
    w.particles.drops(hx, hy, a, 0.6, F.drops, F.color, F.speed, 3, false);
    w.sound('kickHit', hx, hy, 1); // placeholder (PLACEHOLDERS.md)
    w.noise(tg.x, tg.y, noise, this);
  }

  // over a car's hood (Character.updateVault, style 'hip', TRAVERSE.vault.hip.strike): the legs coming off it take
  // the standing guard on the far side, the one Character.tryVault found in the way (v.strike)
  vaultStrike(v, k) {
    const S = TRAVERSE.vault.hip.strike, st = v.strike;
    if (!st || st.done || k < S.from) return;
    const tg = st.target;
    if (!standing(tg)) { st.done = true; return; }
    if (Math.hypot(tg.x - this.x, tg.y - this.y) > S.reach) return;
    st.done = st.hit = true;
    this.footOn(tg, v.dir, 'hood', S.back, PLAYER.slide.kick.noise);
  }

  // Ground finisher on a knocked-out enemy (data/finishers.js): with somebody on him (systems/Danger.js) the weapon's
  // quick kill, else one of its long executions, not the one he did last. He sets himself on the man (ex.at, facing
  // ex.face; from where he stands when there is no room for it), the beats land one after the other, the man dies
  // on the beat `kill` (ex.dead; ex.corpse: his body, when it is a ragdoll) and the rest lands on the body. From the
  // kill on he can walk out of it (leaving); watched to the end it tells the score ('finisher'). The poses:
  // CharacterAnim execPose. f: a given one (the sandbox, the tests) instead of the choice.
  startExecution(target, f) {
    const w = this.world;
    f ??= finisherChoice({ d: this.def, weapon: this.weapon, threatened: !!w.danger?.threatened(this), last: this.lastFinisher });
    if (!f.quick) this.lastFinisher = f;
    const dir = target.downAngle, c = Math.cos(dir), s = Math.sin(dir); // the way his head lies
    const on = (k, l = 0) => ({ x: target.x + c * k + s * l, y: target.y + s * k - c * l }); // k along him, l to his left
    const pts = {};
    for (const [name, [k, l]] of Object.entries(EXEC.spots)) pts[name] = on(k, l);
    const side = (this.x - target.x) * s - (this.y - target.y) * c >= 0 ? 1 : -1; // the side of him he is already on
    let at = null;
    if (f.mount === 'astride' || f.mount === 'over') at = on(f.on ?? EXEC[f.mount]);
    else if (f.mount === 'side' || f.mount === 'beside') at = on(EXEC[f.mount][0], EXEC[f.mount][1] * side);
    // no room there (a wall), or a kill from where he stands: he stays put and turns to what he strikes
    const loose = !at || w.map.solidAt(at.x, at.y);
    if (loose) at = { x: this.x, y: this.y };
    // t: s into the beat (it starts once he is in place), hit: s since the last beat landed, age: s since it began
    // wears: it takes a blow out of the weapon in hand (one that does not break it by design: snap, plant), on the kill;
    // breaks: that blow used it up, it gives out on the last beat (execBreak)
    const wears = !!this.def.wear && !!this.weapon && f.snap === undefined && f.plant === undefined;
    this.execution = { target, f, at, pts, dir, turns: loose || f.mount === 'side' || f.mount === 'beside', face: dir,
      t: -(f.quick ? EXEC.quickMount : EXEC.mount), i: 0, age: 0, hit: 9, done: false, dead: false, corpse: null, wounds: [], held: false,
      wears, breaks: false, broken: false };
    this.execOut = null;
    this.contextAction = null;
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

  // Does he want out of the finisher (it lets him once the man is dead)? A fresh push on a movement key or the stick (one held since
  // before the kill does not count until it is let go), a right click, Space.
  leaving(ex, input) {
    const stick = !!input.move?.();
    const out = input.hit('Space') || input.mouseHit(2) || MOVE_KEYS.some((k) => input.hit(k)) || (stick && !ex.held);
    ex.held = stick;
    return out;
  }

  updateExecution(dt, input) {
    const ex = this.execution, tg = ex.target, f = ex.f;
    dt *= EXEC.rate;
    ex.age += dt;
    ex.hit += dt;
    if (input && this.leaving(ex, input) && ex.dead) { this.endExecution(false); return; }
    // held in place on him: nothing moves him, he looks where the finisher has him look
    if (ex.turns) {
      const p = ex.pts[f.beats[ex.i][2] ?? f.at];
      if (Math.hypot(p.x - ex.at.x, p.y - ex.at.y) > 4) ex.face = Math.atan2(p.y - ex.at.y, p.x - ex.at.x);
    }
    const k = 1 - Math.exp(-dt * 20);
    Body.setPosition(this.body, { x: this.x + (ex.at.x - this.x) * k, y: this.y + (ex.at.y - this.y) * k });
    this.vel = { x: 0, y: 0 };
    Body.setVelocity(this.body, this.vel);
    this.angle += angDiff(this.angle, ex.face) * Math.min(1, dt * 16);
    if (this.facing) this.facing.feet = null; // carried onto him: his feet are under him when the pose lets go
    if (ex.done) {
      if ((ex.t += dt) >= (f.after ?? 0)) this.endExecution(true);
      return;
    }
    if (!ex.dead && !tg.alive) { this.endExecution(false); return; } // somebody else got him first
    ex.t += dt;
    const [wait, what] = f.beats[ex.i];
    if (what === 'bleed' && ex.t > 0) this.bleedThroat(ex, ex.t / wait);
    if (ex.t < wait) return;
    ex.t -= wait;
    this.landBeat(ex);
    // the next one; a gun run dry drops the rounds it had left to fire into the body
    let n = ex.i + 1;
    while (n < f.beats.length && f.beats[n][1] === 'shot' && !(this.weapon?.mag > 0)) n++;
    if (n >= f.beats.length) { ex.done = true; this.execBreak(ex); return; }
    ex.i = n;
    if (f.beats[n][1] === 'windup') this.windup();
  }

  // the opened throat pumps while he holds the head back (k: 0..1 through the beat): a spurt, a pause, a weaker one
  bleedThroat(ex, k) {
    const beat = Math.sin(k * Math.PI * 5);
    if (beat < 0.3) return;
    const p = ex.pts.throat;
    squirt(this.world, p.x, p.y, ex.dir + Math.PI / 2 * (this.punchSide || 1) + rand(-0.25, 0.25), beat * (1 - 0.7 * k), 2);
  }

  // one beat of the finisher lands: on the man while he lives, on his body after
  landBeat(ex) {
    const w = this.world, f = ex.f, d = this.def, tg = ex.target, [, what, where = f.at] = f.beats[ex.i];
    const { x, y } = ex.pts[where], knee = where === 'knee0' || where === 'knee1';
    ex.hit = 0;
    ex.last = what;
    if (ex.dead && f.back) { ex.at.x -= Math.cos(ex.dir) * f.back; ex.at.y -= Math.sin(ex.dir) * f.back; } // walking off
    if (what === 'windup' || what === 'hold') return;
    if (what === 'grab' || what === 'pin' || what === 'aim' || what === 'lean' || what === 'bleed') {
      w.sound(what === 'lean' ? 'soft' : 'swing', this.x, this.y, 0.4, { pitch: 1.3 }); // his hands on him
      return;
    }
    if (!f.pose) {
      this.swingDur = this.swing = 0.22;
      this.strike = typeof what === 'number' ? what : 2;
      // a weapon's stroke comes from its own side (as in attack), fists alternate
      this.punchSide = d.hold === 'melee' ? (this.strike === 1 ? -1 : 1) : -this.punchSide;
    }
    const light = what === 'press' || what === 'twist' || what === 'punch';
    w.particles.blood(x, y, rand(0, 6.28), Math.PI, light ? 6 : 14, light ? 90 : 160);
    w.decals.stampBlood(x, y, light ? 3 : 6, light ? 2 : 4);
    if (what === 'shot') {
      this.weapon.mag--;
      this.recoil = 1;
      const m = this.muzzlePos();
      muzzleFlash(w, m.x, m.y, m.a, d, this);
      this.eject(d);
      w.sound(d.sound, this.x, this.y);
      if (knee) w.sound('kneeShot', x, y, 0.9);
      if (d.noise) w.noise(this.x, this.y, d.noise, this, 'gunshot');
    } else if (what === 'press') w.sound('punch', x, y, 0.5, { pitch: 0.8 });
    else if (what === 'punch' || what === 'elbow') w.sound('punch', x, y, what === 'elbow' ? 1 : 0.7, { pitch: rand(0.85, 1.05) });
    else if (what === 'stab') w.sound('slash', x, y, 0.8, { pitch: rand(0.95, 1.15) });
    else if (what === 'cut') w.sound('throatCut', x, y, 0.9);
    else if (what === 'twist' || what === 'rip') w.sound('bladeTwist', x, y, 0.8, { pitch: what === 'rip' ? 1.15 : 0.9 });
    else {
      w.sound(d.hold === 'none' ? 'punch' : d.swing === 'blade' ? 'slash' : 'splat', x, y);
      const club = d.swing === 'club' ? d : d.kind === 'gun' ? GUN_BUTT : null;
      if (club) blowFx(w, club, { x, y }, this.angle, { heavy: true, from: 'side' });
      if (knee) w.sound('boneCrack', x, y, 0.9);
      if (what === 'stomp' || what === 'slam' || what === 'pile') {
        w.particles.dust(x, y, 8, 12, '#6a6272', { speed: 50, size: 4, life: 0.7, alpha: 0.2 });
        w.shake(MOMENTS.stomp.shake);
        w.sound(what === 'stomp' ? 'stomp' : 'skullSlam', x, y, 1);
      }
    }
    if (what === 'rip') w.particles.blood(x, y, ex.dir + Math.PI / 2 * this.punchSide, 0.3, 14, 260); // torn out sideways
    if (ex.i === f.snap) this.breakWeapon(this.angle, false);
    if (ex.i === killBeat(f)) { this.finish(ex, x, y); return; }
    if (!ex.dead) {
      // a man alive takes it: he jerks where he lies, a knee gone he cries out (the wound shows on his body after)
      landOnBody(w, x, y, this.angle, d, MOMENTS.beat);
      tg.jerk = { t: w.time, side: ex.i % 2 ? 1 : -1, k: knee ? 1 : 0.6 };
      if (knee) { ex.wounds.push([where, what]); w.sound('cry', tg.x, tg.y, 0.9, { pitch: tg.voice }); }
      return;
    }
    // on his body: the part struck jerks, the wound shows; the last of it may leave nothing of his head, or stay in him
    const body = ex.corpse, last = ex.i === f.pulp || ex.i === f.plant;
    body?.struck(where, ex.dir + Math.PI / 2 * (ex.i % 2 ? 1 : -1), beatMark(what, d), EXEC.jerk[where === 'head' || knee ? 0 : 1]);
    landOnBody(w, x, y, this.angle, d, last ? MOMENTS.finisher : MOMENTS.beat);
    if (ex.i === f.pulp) {
      const at = body?.loseHead();
      if (at) pulp(w, at.x, at.y, this.angle);
    }
    if (ex.i === f.plant && this.weapon) {
      body?.plant(d.snaps ? WEAPONS[d.snaps].sprite : d.sprite);
      this.breakWeapon(this.angle, true);
    }
  }

  // the beat that kills: how the body is left is the finisher's (cause, wound; a head sent off, a weapon left in him)
  finish(ex, x, y) {
    const w = this.world, f = ex.f, d = this.def, tg = ex.target, n = w.corpses.length;
    let by = f.cause === 'execute' ? undefined : { gore: 0, wound: f.wound }, angle = this.angle;
    if (f.plant === ex.i) by.stuck = d.snaps ? WEAPONS[d.snaps].sprite : d.sprite; // a cue snaps: its other half stays in the hand
    else if (f.launch) {
      // the head flies off across the swing (it runs toward the side opposite the one it came from)
      by = { gore: 99, wound: 'blunt', launch: f.launch };
      angle = this.angle - this.punchSide * 1.2;
    }
    // the blow it takes out of the weapon (startExecution: wears); the one that uses it up breaks it on the last beat
    if (ex.wears && this.weapon) ex.breaks = (this.weapon.wear -= WEAR.man) <= WORN;
    tg.kill(angle, f.cause, this, by, { finisher: true, label: f.label, quick: !!f.quick, still: true, close: true, broke: ex.breaks || undefined });
    ex.dead = true;
    const body = w.corpses.length > n ? w.corpses[w.corpses.length - 1] : null;
    ex.corpse = body?.struck ? body : null;
    for (const [where, what] of ex.wounds) ex.corpse?.struck(where, angle, beatMark(what, d));
    landOnBody(w, x, y, angle, d, f.quick ? MOMENTS.quick : MOMENTS.finisher, !tg.alive);
    if (f.quick) w.particles.dust(x, y, 6, 10, '#6a6272', { speed: 45, size: 3.5, life: 0.5, alpha: 0.18 });
    if (f.flight) w.slowmo(...f.flight);
    if (f.plant === ex.i) this.breakWeapon(this.angle, true);
  }

  // a finisher that used the weapon up (ex.breaks) breaks it, once, where its last beat landed: a blade stays in the
  // body, a bat snaps over him
  execBreak(ex) {
    if (!ex.breaks || ex.broken || !this.weapon) return;
    ex.broken = true;
    const d = this.def, where = ex.f.beats[ex.i][2] ?? ex.f.at, p = ex.pts[where], lodge = d.breaks === 'lodge' && !!ex.corpse;
    if (lodge) ex.corpse.plant(plantedOf(d));
    this.breakWeapon(this.angle, lodge, { x: p.x, y: p.y });
  }

  // out of the finisher. watched: played to its end (a long one watched to the end is told to the score); else he
  // walked out of it, or somebody else killed the man: the pose lets go over EXEC.blend s
  endExecution(watched) {
    const ex = this.execution, tg = ex.target;
    this.execBreak(ex); // walked out of it before its last beat: it gives out now
    this.execution = null;
    tg.executing = false;
    this.swing = 0;
    this.cooldown = watched ? 0.25 : 0.1;
    if (!watched) this.execOut = { ex, t: EXEC.blend };
    else if (ex.dead && !ex.f.quick) this.world.events.emit('finisher', { killer: this, x: tg.x, y: tg.y, label: ex.f.label });
  }

  // The takedown he will do to the next guard he takes from behind (data/finishers.js takedownChoice: a variant of
  // his weapon's, not the one he did last; front: face to face), kept until it is done or the weapon changes: the
  // hint names it.
  pickTakedown(front = false) {
    const own = takedownFor(this.def, this.weapon), n = this.nextTakedown;
    if (!n || n.own !== own || n.front !== front || (n.f.rounds ?? 0) > (this.weapon?.mag ?? 0)) {
      this.nextTakedown = { own, front, f: takedownChoice({ d: this.def, weapon: this.weapon, front, last: this.lastTakedown }) };
    }
    return this.nextTakedown.f;
  }

  // Seize a guard who has not spotted us (data/finishers.js TAKEDOWNS, by what is in the hand, by what stands in front
  // of him, from behind or face to face): he can do nothing until it is over (Enemy.held) and we are locked in it;
  // the beats land on the clock of systems/Takedown.js (advance). The two bodies stop pushing each other apart for
  // the length of it: pressed against him. The poses: CharacterAnim takedownPose (ours), heldPose (his).
  // move: { f, spot, front } (takedownMove; a given one: the tests).
  startTakedown(target, move = this.takedownMove(target)) {
    if (target.shakeOff?.(this)) return; // a boss still whole throws him off (entities/Boss.js)
    const { f, spot = null, front = false } = move, group = Body.nextGroup(true);
    this.lastTakedown = f;
    this.nextTakedown = null;
    // wounds: what the beats before the kill did to him, shown on his body after ([where, what])
    // wears: done with the weapon in hand (not a hand in his hair), it takes a blow out of it on the kill
    this.takedown = Object.assign(newTakedown(f, !!target.yielded), {
      target, spot, front, side: chance(0.5) ? 1 : -1, d: Math.hypot(target.x - this.x, target.y - this.y) / BODY_SCALE, wounds: [],
      wears: !spot && !!this.weapon && !!this.def.wear,
    });
    this.contextAction = null;
    this.swing = 0;
    target.held = this;
    target.swing = target.tell = 0;
    for (const b of [this.body, target.body]) b.collisionFilter = { ...b.collisionFilter, group };
  }

  // the takedown he would play on `target`: by the weapon in hand, or, with a hand free for it, by what stands in
  // front of the man (systems/TakedownSpot.js): { f (its TAKEDOWNS entry), spot }
  takedownMove(target) {
    const w = this.world, d = this.def, front = !behind(this, target);
    // what his head can go into: what he is turned to; from the front we stand there ourselves, so what is on his
    // far side from us (he is spun round to it, pullTo)
    const from = front ? { x: target.x, y: target.y, angle: Math.atan2(target.y - this.y, target.x - this.x) } : target;
    const spot = freeHand(d) ? spotFor(from, w.map, w.props) : null;
    if (spot) return { f: takedownChoice({ d, weapon: this.weapon, spot }), spot, front: false };
    return { f: this.pickTakedown(front), spot: null, front };
  }

  updateTakedown(dt) {
    const td = this.takedown, tg = td.target, w = this.world, f = td.f;
    if (!td.done) {
      if (!tg.alive) { this.endTakedown(); return; } // somebody got him first
      if (td.spot) this.pullTo(td, dt);
      // face to face: he is turned to us, and we stand in front of him
      else if (td.front) tg.angle += angDiff(tg.angle, Math.atan2(this.y - tg.y, this.x - tg.x)) * (1 - Math.exp(-dt * 3 / TAKEDOWN.set));
      // set at the sequence's gap behind him (a little to one side), looking at him
      // (his head driven into something: we go in with each blow, drawn back with the pull: f.lunge)
      const sl = td.spot ? slamAt(td) : null, gap = sl ? f.gap - f.lunge[0] * sl.drive + f.lunge[1] * sl.back : f.gap;
      const side = td.front ? -1 : 1, c = Math.cos(tg.angle) * side, s = Math.sin(tg.angle) * side, lat = f.lat ?? 0;
      const at = { x: tg.x - c * gap - s * lat, y: tg.y - s * gap + c * lat };
      if (!w.map.solidAt(at.x, at.y)) {
        const k = 1 - Math.exp(-dt * 3 / TAKEDOWN.set);
        Body.setPosition(this.body, { x: this.x + (at.x - this.x) * k, y: this.y + (at.y - this.y) * k });
      }
      this.angle = Math.atan2(tg.y - this.y, tg.x - this.x);
      td.d = Math.hypot(tg.x - this.x, tg.y - this.y) / BODY_SCALE;
    }
    this.vel = { x: 0, y: 0 };
    Body.setVelocity(this.body, this.vel);
    const landed = advance(td, dt);
    landed.forEach((what, i) => this.landTakedown(what, td.done && i === landed.length - 1));
    if (td.over) this.endTakedown();
  }

  // a takedown with a spot: he is pulled to it (f.stand px off its surface) and turned square to it
  pullTo(td, dt) {
    const tg = td.target, sp = td.spot, k = 1 - Math.exp(-dt * 3 / TAKEDOWN.set);
    const at = { x: sp.x + sp.nx * td.f.stand, y: sp.y + sp.ny * td.f.stand };
    if (!this.world.map.solidAt(at.x, at.y)) Body.setPosition(tg.body, { x: tg.x + (at.x - tg.x) * k, y: tg.y + (at.y - tg.y) * k });
    tg.vel = { x: 0, y: 0 };
    Body.setVelocity(tg.body, tg.vel);
    tg.angle += angDiff(tg.angle, Math.atan2(-sp.ny, -sp.nx)) * k;
  }

  // His head meets what is in front of him (a takedown's spot) `into` px past its surface: his blood thrown back out
  // of it, the surface marked (a dent in a wall, a crack in porcelain, his blood on it), what it is made of flying
  // (Prop.hit: splinters, chips, the water of a toilet; what stands on it knocked off: systems/Clutter.js), the blow
  // heard; the last one harder.
  slamFx(td, last) {
    const w = this.world, sp = td.spot, P = w.particles, k = last ? 1.4 : 1;
    const x = sp.x - sp.nx * td.f.into, y = sp.y - sp.ny * td.f.into, out = Math.atan2(sp.ny, sp.nx), into = out + Math.PI;
    P.blood(x, y, out, 1.3, Math.round(9 * k), 150 * k);
    P.blood(x, y, into, 0.9, Math.round(4 * k), 90);
    const p = sp.prop;
    if (p) {
      p.hit(last ? 1 : 0.6, sp.x - sp.nx, sp.y - sp.ny, into, last ? 1.7 : 1.3, 'blunt', { heft: 1 });
      p.bloody?.(x, y, last ? 3.5 : 2.2);
      if (p.def.water) {
        // the water of the bowl thrown up and out over the floor
        const wet = LIQUIDS.kinds.water;
        P.drops(x, y, out, 1.5, Math.round(14 * k), wet.splash, 150, 8);
        P.jet(x, y, Math.round(6 * k), { vz: 160, speed: 50, size: 2.2, alpha: 0.5 });
        w.events.emit('spill', { x: sp.x + sp.nx * 8, y: sp.y + sp.ny * 8, kind: 'water', area: 60 * k, a: out });
      }
    } else {
      // a wall: dented and cracked, its dust, his blood splashed on its face and running down
      const cx = Math.floor((sp.x - sp.nx * 3) / TILE), cy = Math.floor((sp.y - sp.ny * 3) / TILE);
      const s = WALL_IMPACT[w.map.at(cx, cy)] || WALL_IMPACT.X;
      w.damageWall(cx, cy, 1, sp.x - sp.nx * 4, sp.y - sp.ny * 4, into);
      w.decals.wallHit(sp.x, sp.y, sp.nx, sp.ny, 'blow', last ? 1.1 : 0.8);
      P.chips(sp.x, sp.y, out, 0.9, Math.round(5 * k), s.chips, 90);
      P.dust(sp.x + sp.nx * 2, sp.y + sp.ny * 2, Math.round(3 * k), 2, s.dust, { speed: 16, size: 3.5, life: 1.6, alpha: 0.25, vx: sp.nx * 18, vy: sp.ny * 18 });
      splashWall(w, { x: sp.x, y: sp.y, nx: sp.nx, ny: sp.ny }, into, last ? 3.4 : 2.4, last ? 2 : 1);
    }
    w.decals.stampBlood(sp.x + sp.nx * 4, sp.y + sp.ny * 4, last ? 2.2 : 1.4, 2);
    w.sound(SLAM_SOUND[sp.kind] || SLAM_SOUND[p?.def.material] || 'headSlamWood', x, y, last ? 1 : 0.85);
    w.sound('punch', x, y, 0.7, { pitch: 0.7 });
  }

  // a beat of the takedown lands (last: the one that kills)
  landTakedown(what, last) {
    const td = this.takedown, tg = td.target, w = this.world, f = td.f, d = this.def, a = this.angle;
    const k = td.front ? 3 : -3, nape = { x: tg.x + Math.cos(tg.angle) * k, y: tg.y + Math.sin(tg.angle) * k }; // his nape, or his face
    if (what === 'seize') w.sound('grab', tg.x, tg.y, f.grip === 'mouth' ? 0.45 : 0.9, { pitch: tg.voice }); // a muffled cry
    else if (what === 'struggle') w.sound('soft', tg.x, tg.y, 0.5);
    else if (what === 'windup') w.sound('swing', this.x, this.y, 0.5, { pitch: 0.7, weapon: this.weapon?.type });
    else if (what === 'limp') w.sound('soft', tg.x, tg.y, 0.6, { pitch: 0.8 });
    else if (what === 'stab' || what === 'wrench') {
      // the blade in his side, then turned there: little shows, he arches
      const side = { x: tg.x - Math.cos(tg.angle) * 2 + Math.sin(tg.angle) * -4, y: tg.y - Math.sin(tg.angle) * 2 + Math.cos(tg.angle) * 4 };
      w.sound(what === 'stab' ? 'slash' : 'bladeTwist', side.x, side.y, 0.8);
      w.particles.blood(side.x, side.y, a + Math.PI, 0.5, what === 'stab' ? 5 : 8, 140);
    } else if (what === 'kneeHit' || what === 'kneeShot' || what === 'backShot') {
      // his knee from behind (a club swung low, a round), or a round in his back: he cries out and gives
      const o = what === 'backShot' ? 0 : (td.wounds.length % 2 ? -1 : 1) * 3.5;
      const at = { x: tg.x - Math.cos(tg.angle) * 3 - Math.sin(tg.angle) * o, y: tg.y - Math.sin(tg.angle) * 3 + Math.cos(tg.angle) * o };
      if (what === 'kneeHit') {
        w.sound('clubHit', at.x, at.y, 0.8, { material: d.material });
        w.sound('boneCrack', at.x, at.y, 0.9);
      } else {
        this.fireInto(d);
        if (what === 'kneeShot') w.sound('kneeShot', at.x, at.y, 0.9);
      }
      w.particles.blood(at.x, at.y, a, 0.5, 8, 200);
      w.decals.stampBlood(at.x, at.y, 3, 2);
      w.sound('cry', tg.x, tg.y, 0.9, { pitch: tg.voice });
      td.wounds.push([what === 'backShot' ? 'chest' : `knee${td.wounds.length % 2}`, what]);
    } else if (HEAD_BLOWS.has(what)) {
      // a blow on his head: what it is made of rings over it, a few drops thrown on
      if (d.hold === 'none' || BODY_BLOWS.has(what)) w.particles.blood(nape.x, nape.y, a, 0.35, what === 'knee' ? 6 : 2, 220);
      else if (d.swing === 'club') blowFx(w, d, tg, a, { heavy: true, from: td.front ? 'front' : 'behind' });
      else {
        w.sound('clubHit', nape.x, nape.y, 0.9, { material: d.hold === 'two' ? 'wood' : 'metal' });
        w.particles.blood(nape.x, nape.y, a, 0.35, 4, 220);
      }
      w.sound('punch', nape.x, nape.y, 0.8, { pitch: 0.75 });
    } else if (what === 'shot') this.fireInto(d);
    const slam = what === 'smash' || what === 'dunk';
    if (slam) this.slamFx(td, last);
    const blow = HEAD_BLOWS.has(what) || what === 'kneeHit', round = what === 'shot' || what === 'kneeShot' || what === 'backShot';
    if (f.noise && (blow || slam || (last && !round))) w.noise(tg.x, tg.y, f.noise, this);
    if (!last) {
      if (blow || what === 'stab' || what === 'kneeShot' || what === 'backShot') landMoment(w, tg, a, d, MOMENTS.beat, false);
      else if (slam) landMoment(w, tg, a, d, MOMENTS.slam, false);
      return;
    }
    // the kill: he goes down the sequence's way (data/wounds.js KNEELS), from his knees if he is on them already
    // (driven into a piece of furniture: he stays against it, folded over it or sat against its side); one without
    // a way of its own (face to face) is thrown back like any man killed
    const sp = td.spot, against = sp?.prop ? { prop: sp.prop, x: sp.x, y: sp.y, nx: sp.nx, ny: sp.ny } : null;
    // the blow it takes out of the weapon it was done with (td.wears): the one that uses it up breaks it on this beat,
    // a blade left in him
    const breaks = td.wears && !!this.weapon && (this.weapon.wear -= WEAR.man) <= WORN, lodge = breaks && d.breaks === 'lodge';
    const how = { label: f.label, from: td.front ? 'front' : 'behind', dying: sp?.rest === 'sit' ? 'sit' : f.dying,
      kneeling: td.downAt >= 0, last: what === 'shot' && this.weapon.mag === 0, limp: !!f.limp, env: sp?.kind, against, close: true };
    if (breaks) how.broke = true;
    const cause = f.cause === 'shot' ? shotCause(d) : f.cause;
    let by = f.wound ? { gore: 0, wound: f.wound } : f.cause === 'snap' ? undefined : d;
    if (lodge) by = { ...by, stuck: plantedOf(d) };
    const n = w.corpses.length;
    tg.kill(a, cause, this, by, how);
    if (breaks) this.breakWeapon(a, lodge, nape);
    // what was done to him on the way shows on his body
    const body = w.corpses.length > n ? w.corpses[w.corpses.length - 1] : null;
    if (body?.struck) for (const [where, did] of td.wounds) body.struck(where, a, did === 'kneeHit' ? MARKS.blunt : MARKS[d.wound]);
    landMoment(w, tg, a, d, td.spot ? MOMENTS.slamKill : MOMENTS.takedown, !tg.alive);
  }

  // one round of the gun in hand let off into a man held (a takedown's beat)
  fireInto(d) {
    const w = this.world, m = this.muzzlePos();
    this.weapon.mag--;
    this.recoil = 1;
    muzzleFlash(w, m.x, m.y, m.a, d, this);
    w.sound(d.sound, this.x, this.y);
    if (d.noise) w.noise(this.x, this.y, d.noise, this, 'gunshot');
  }

  endTakedown() {
    const tg = this.takedown.target;
    this.takedown = null;
    this.cooldown = 0.15;
    this.body.collisionFilter = { ...this.body.collisionFilter, group: 0 };
    if (tg.held === this) {
      tg.held = null;
      tg.body.collisionFilter = { ...tg.body.collisionFilter, group: 0 };
    }
  }

  knock(angle) { this.kill(angle, 'melee'); }

  get ammoText() {
    if (!this.weapon) return '';
    const d = WEAPONS[this.weapon.type];
    // (a melee weapon's wear is shown as notches: ui/HUD.js)
    return d.kind === 'gun' ? `${Math.max(0, this.weapon.mag)} | ${this.reserveCount()} ${AMMO[d.ammo].name}` : '';
  }
}
