import { PLAYER } from '../Config.js';
import { WEAPONS, AMMO, keepsOne, oneHanded } from '../data/weapons.js';
import { rand, angDiff, smooth } from '../../engine/math.js';
import { spriteOpt } from '../../engine/Assets.js';
import Debris, { GRAVITY } from './Debris.js';
import { PLANTED } from './Ragdoll.js';
import Character from './Character.js';
import { findVault } from '../systems/Cover.js';
import { recover } from '../systems/Slide.js';
import { within, unspotted } from '../systems/Takedown.js';
import { lungeTarget } from '../systems/Lunge.js';
import { offers } from '../systems/Shield.js';
import { meleeLock } from '../systems/AimCue.js';
import { snapFacing } from './Facing.js';
import { AIM } from '../data/aim.js';
import { hintOf, EXEC } from '../data/finishers.js';
import { MOMENTS, GESTURE, BREAK, SNATCH, THROW, SHIELD } from '../data/feel.js';
import { SLIP } from '../data/devices.js';
import { slowAtLeast } from '../fx/Impact.js';
import * as Throw from './player/Throw.js';
import * as Shield from './player/Shield.js';
import * as Sliding from './player/Sliding.js';
import * as Execution from './player/Execution.js';
import * as Takedown from './player/Takedown.js';
import { pulls } from './player/Hands.js';

const { Body, Query } = Matter;
const SHOVE_T = 0.28; // s a guard's shove carries him back (Enemy.shove)

// The player. The class holds his state, his step (update: moving, what is around him, the buttons), a slick
// floor, the trunk, picking up and snatching; the rest is in entities/player/, functions of the player (`me`) the
// class delegates to: Throw, Shield (the human shield), Sliding (the slide and its kick), Execution (a man on the
// floor finished), Takedown (a guard taken down unseen); Hands: what they share.
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
    this.aimA = 0;          // the way the mouse / the stick aims, this step (his angle may be turned off it: faceLock)
    this.facingLock = null; // { who, from, t, a, at } turning onto LOCK's close man with a melee weapon (faceLock)
    this.safe = { x, y };   // the last spot we stood on that was not inside something solid (see unstick)
    this.sit = 0;           // 1 sitting on the ground (how a level starts) .. 0 up; see updateSit
    this.pinned = false;    // sat there, no key gets him up yet
    this.swig = null;       // the bottle he finishes first, sat there (level intro 'swig'): { t, thrown, go, hit }
    this.rising = false;
    this.takedown = null;   // a guard taken from behind (startTakedown): systems/Takedown.js newTakedown + { target, side, d, def }
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
    this.throwHold = null;  // { t, paused } a throw wound up while the right click is held (updateThrowHold, THROW)
    this.nearShield = null; // a guard within reach who can be taken as a shield (E: startShield)
    // a guard held in front of him as a shield (startShield, SHIELD): { target, t (s held), hp (rounds he still
    // takes), dead (he died in the arms: { a, by, killer }), cover (hits his body still stops), volley ({ owner, t }
    // the blast whose pellets are one hit) }
    this.shield = null;
    this.shieldOut = null; // { kind: 'throw' | 'neck' | 'throat', t, dur }: the arms after he is let go (shieldOutPose)
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
    // what takes his hands or his body over lets a throw wound up go, unthrown
    if (this.throwHold && (this.sit > 0 || this.execution || this.takedown || this.trunkOpen || this.slipped || this.passage || this.kick)) this.throwHold = null;
    if (this.sit > 0 && !this.updateSit(dt, input)) return;
    if (this.execOut && (this.execOut.t -= dt) <= 0) this.execOut = null;
    if (this.shieldOut && (this.shieldOut.t += dt) >= this.shieldOut.dur) this.shieldOut = null;
    if (this.execution) { this.updateExecution(dt, input); return; }
    if (this.takedown) { this.updateTakedown(dt); return; }
    if (this.trunkOpen) { this.updateTrunk(dt); return; }
    if (this.slipped) { this.updateSlip(dt); return; }
    if (this.passage) { this.updatePassage(dt); return; }
    this.aimA = this.angle = Math.atan2(aim.y - this.y, aim.x - this.x);
    const lockOn = this.faceLock(dt);
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
    } else if (!sliding) this.steer(dx, dy, PLAYER.speed * (stick ? Math.min(1, 0.25 + stick.mag) : 1) * Math.min(this.throwHold ? THROW.move : 1, this.shield ? SHIELD.move : 1), PLAYER.accel);
    if (this.shield) this.updateShield(dt);
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
    // the nearest man down within reach: any attack on him (the left click) finishes him (data/finishers.js)
    this.nearDowned = null;
    let down = EXEC.near;
    for (const e of this.shield ? [] : w.enemies) {
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
    // (never the man a lesson keeps to be taken as a shield: `shieldOnly`, systems/Tutorial.js)
    // left click takes him down; spotted, a click at him is an ordinary attack
    const phase = w.director?.phase;
    this.nearTakedown = (!this.nearDowned && !this.shield && w.enemies.find((e) => !e.shieldOnly && within(this, e) && unspotted(e, phase) && w.lineOfSight(this.x, this.y, e.x, e.y))) || null;
    this.takeMove = this.nearTakedown ? this.takedownMove(this.nearTakedown) : null;
    // ... and one who can be taken as a shield (systems/Shield.js offers): E, with a hand free for it
    this.nearShield = (!this.shield && !this.throwHold && !sliding && oneHanded(this.def)
      && w.enemies.find((e) => offers(this, e) && w.lineOfSight(this.x, this.y, e.x, e.y))) || null;

    // attack (a stub of a broken weapon still in the hand is let fall first)
    if (this.broke?.stub && (input.mouseDown(0) || input.mouseHit(2))) this.dropStub();
    const d = this.def;
    const nb = this.nearTakedown;
    if (this.throwHold) { /* the left click does nothing while a throw is wound up */ }
    else if (this.shield) this.shieldAttack(input, d);
    else if (nb) { if (input.mouseHit(0)) this.startTakedown(nb, this.takeMove); } // never swing or fire at him then
    else if (pulls(d, input)) {
      // on a man who is down, at our feet and under the cursor: his execution, whatever is in the hand
      const nd = this.nearDowned;
      if (nd && (down < 14 || Math.abs(angDiff(this.angle, Math.atan2(nd.y - this.y, nd.x - this.x))) < EXEC.aim)
        && (input.mouseHit(0) || d.kind !== 'gun')) this.startExecution(nd);
      else {
        this.shootDown = d.kind === 'gun' ? this.corpseAt(aim.x, aim.y) : null;
        // dry: reload if we can, otherwise hurl the useless gun at them
        const did = this.attack();
        if (did === 'empty' && input.mouseHit(0) && !this.reload()) this.throwWeapon(true);
        else if (did === true && d.kind !== 'gun' && !sliding) this.startLunge(d, lockOn);
      }
    }
    if (input.hit('KeyR') && !this.throwHold) this.reload();
    // Space = vault > slide (the slide needs a running start, no HUD label); the left click takes a man down from
    // behind and finishes a man on the floor
    const busy = sliding || this.nearDowned || this.nearTakedown || this.shield;
    this.vaultHint = busy ? null : findVault(w, this, moveA); // marked on the obstacle (WorldRenderer)
    this.contextAction = sliding ? null : this.shield ? this.shieldHint() : this.nearDowned ? 'EXECUTE'
      : this.nearTakedown ? hintOf(this.takeMove.f, this.takeMove.spot)
        : this.vaultHint ? (this.vaultHint.kind === 'climb' ? 'CLIMB' : this.vaultHint.over.intact ? 'DIVE THROUGH' : 'VAULT') : null;
    // (a man held as a shield: SPACE does nothing, the user's call)
    if (input.hit('Space') && !sliding && !this.shield && !this.tryVault(moveA) && moving) this.startSlide(moveA);

    // right click: armed, held it winds a throw up (updateThrowHold), a tap throws at once; unarmed, it picks up;
    // a man held as a shield is what is thrown, the weapon stays in the hand.
    // E: a shield if one is offered, else pick up / swap. A throw goes along the aim, not where LOCK's melee turn put him
    if (this.throwHold) this.updateThrowHold(dt, input);
    else if (input.mouseHit(2)) {
      if (!this.armed && !this.shield) this.pickUp();
      else {
        if (this.facingLock) this.angle = this.aimA;
        if (input.mouseDown(2)) this.throwHold = { t: 0, paused: false };
        else if (this.shield) this.throwShield(0);
        else this.throwWeapon(); // down and up within a step
      }
    }
    if (input.hit('KeyE') && !this.shield) {
      if (this.nearShield) this.startShield(this.nearShield);
      else if (this.nearTrunk) this.startTrunk(this.nearTrunk);
      else if (this.nearUse) this.nearUse.use(this);
      else this.pickUp();
    }
  }

  // LOCK with a melee weapon in hand (systems/AimCue.js meleeLock, from the aim): its man this step, returned. The close
  // one turns the player onto him over AIM.lock.face s, eased out from where he faced, before any click; the aim is left
  // alone. Not while he slides, vaults, kicks or rides; the man let go (out of the window, down, dead), he faces the
  // aim again at once.
  faceLock(dt) {
    const w = this.world, free = !this.slide && !this.vaulting && !this.kick && !this.riding && !this.throwHold && !this.shield;
    const m = free ? meleeLock(w, this, this.def, this.aimA) : null, who = m?.close ? m.man : null;
    let f = this.facingLock;
    if (!who) { this.facingLock = null; return m; }
    const on = f && w.time - f.at < 0.05; // turning last step (not cut off by a vault, a takedown...)
    if (!on || f.who !== who) f = this.facingLock = { who, from: on ? f.a : this.aimA, t: 0, a: 0, at: 0 };
    f.t += dt;
    const k = Math.min(1, f.t / AIM.lock.face), dir = Math.atan2(who.y - this.y, who.x - this.x);
    f.a = this.angle = f.from + angDiff(f.from, dir) * (1 - (1 - k) * (1 - k));
    f.at = w.time;
    return m;
  }

  // a melee swing just started: drawn to the guard in front of him, if one stands close (systems/Lunge.js): the aim
  // turned onto him until the blow is struck, a step toward him over PLAYER.lunge.dur. The man LOCK holds close
  // (`lockOn`: faceLock) takes the whole turn, the drawn body snapped onto him on this frame, and the step
  // is taken from this very step and over before the blow lands (World.after(windup)): one base step short of the
  // windup, so that it lands on him
  startLunge(d, lockOn) {
    const w = this.world, L = PLAYER.lunge;
    const r = lungeTarget(this, d, w.enemies, this.aimA, L, (e) => w.lineOfSight(this.x, this.y, e.x, e.y), (x, y) => w.map.solidAt(x, y), lockOn?.man ?? null);
    if (!r) return;
    this.angle = r.a;
    if (r.lock) snapFacing(this, r.a);
    const dur = r.lock ? Math.max(1, Math.ceil(d.windup * 60 - 1e-6) - 1) / 60 : L.dur;
    // px per base step that covers `push` over `dur` s
    this.lunge = { a: r.a, dir: r.dir, v: r.push / (dur * 60), stop: w.time + dur, until: w.time + Math.max(dur, d.windup) };
    if (r.lock) {
      this.lunge.stop -= 0.5 / 60; // the steps after this one that still move him: dur * 60 - 1 of them
      this.vel = { x: Math.cos(r.dir) * this.lunge.v, y: Math.sin(r.dir) * this.lunge.v };
      Body.setVelocity(this.body, this.vel);
    }
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
      g.hit = { x: x0 + c * d, y: y0 + s * d }; // where it breaks (the camera looks there: systems/Opening.js)
      const dur = d / T.speed, img = spriteOpt('items/bottle'), air = dur + 0.1;
      // it spins and turns end over end, off the floor all the way (its shadow under it), and is still up when it hits
      const bottle = img && new Debris(w, img, x0, y0, a, c * T.speed, s * T.speed, T.spin, { material: 'glass', kg: 0.5, fly: air,
        z: T.height, vz: (GRAVITY * air) / 2 - T.height / air, tumble: T.tumble });
      if (bottle) w.addDebris(bottle);
      w.sound('throw', this.x, this.y, 0.6);
      w.after(dur, () => {
        const { x, y } = g.hit;
        if (bottle) w.removeDebris(bottle);
        w.particles.glass(x, y, a + Math.PI, 1.2, ...T.glass);
        // what was left of the rum: thrown back off the wall in drops (they stain the floor), and run down it
        w.particles.drops?.(x, y, a + Math.PI, 1.0, T.drops[0], T.rum[1], T.drops[1], T.height);
        w.decals.smear(x, y, a + Math.PI / 2, T.smear, T.rum[0], 0.35);
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
  // A man who yields his gun (a lesson's: Character.yields) gives it up whatever he was killed with and from where.
  snatches(victim, how) {
    if (victim.yields) return !!victim.weapon || (!!victim.lastDrop && !victim.lastDrop.dead);
    if (!SNATCH.on || !how?.close || this.snatch) return false;
    if (this.weapon && !(how.broke && !keepsOne(this.def))) return false;
    if (victim.weapon) return Math.hypot(victim.x - this.x, victim.y - this.y) <= SNATCH.reach;
    const it = victim.lastDrop;
    return !!it && !it.dead && Math.hypot(it.x - this.x, it.y - this.y) <= SNATCH.far;
  }

  // the weapon he will take (Character.kill), as soon as his hands are his own again (not in a takedown or a
  // finisher) and it has fallen (SNATCH.delay); sure: however far it lies and whatever is in his hand (it is let go).
  // One still waiting for his hand (a lesson's man who yields it, killed meanwhile) is let go for this one.
  snatchFrom(item, sure = false) {
    if (!item) return;
    if (this.snatch && this.snatch.item !== item) this.snatch.item.free?.();
    this.snatch = { item, at: this.world.time + SNATCH.delay, sure };
  }

  // whatever his hands were about is dropped where it stands (the getaway takes him over: World.startOutro): the
  // throw wound up, the swing's step, LOCK's turn, a dead man's weapon his hand was going to (let go on the floor)
  releaseHands() {
    if (this.shield) this.endShield();
    this.throwHold = null;
    this.lunge = null;
    this.facingLock = null;
    this.snatch?.item.free?.();
    this.snatch = null;
  }

  // his hand closes on it: the pick-up's reach and twirl into his grip (CharacterAnim, pickAnim), with the rounds left
  // in it, a breath of slow motion (MOMENTS.snatch)
  grab() {
    const { item: it, sure } = this.snatch, w = this.world;
    this.snatch = null;
    if (it.dead || (!sure && (this.weapon || Math.hypot(it.x - this.x, it.y - this.y) > SNATCH.far))) { it.free?.(); return; }
    w.removeItem(it);
    this.take(it.type, it.mag, it.wear, it.bare);
    this.pickFrom = { x: it.x, y: it.y };
    slowAtLeast(w, ...MOMENTS.snatch.slowmo);
    w.sound('snatch', this.x, this.y, 1, { weapon: it.type });
  }

  // the man he holds is painted with him, as one pair (Character.draw); what is drawn over a guard (Enemy.draw) after
  draw(ctx) {
    super.draw(ctx);
    const tg = this.shield?.target;
    if (!tg?.alive) return;
    this.drawing = true;
    tg.draw(ctx);
    this.drawing = false;
  }

  knock(angle) { this.kill(angle, 'melee'); }

  // killed with a man in his arms: the man is let go (alive, he turns on him); one he was finishing or taking down
  // is let go too (else he stays floored / held for good)
  kill(angle, cause, killer, by, how) {
    if (this.alive && !this.invulnerable) {
      if (this.shield) this.endShield();
      if (this.execution) { this.execution.target.executing = false; this.execution = null; }
      if (this.takedown) this.endTakedown();
    }
    super.kill(angle, cause, killer, by, how);
  }

  get ammoText() {
    if (!this.weapon) return '';
    const d = WEAPONS[this.weapon.type];
    // (a melee weapon's wear is shown as notches: ui/HUD.js)
    return d.kind === 'gun' ? `${Math.max(0, this.weapon.mag)} | ${this.reserveCount()} ${AMMO[d.ammo].name}` : '';
  }

  // ---------------- the throw (player/Throw.js, THROW) ----------------
  updateThrowHold(dt, input) { return Throw.updateThrowHold(this, dt, input); }
  interrupt() { return Throw.interrupt(this); }
  throwCharge(W) { return Throw.throwCharge(this, W); }
  throwAim() { return Throw.throwAim(this); }
  release() { return Throw.release(this); }
  throwWeapon(power, k) { return Throw.throwWeapon(this, power, k); }

  // ---------------- the human shield (player/Shield.js, SHIELD, the rules: systems/Shield.js) ----------------
  startShield(target) { return Shield.startShield(this, target); }
  updateShield(dt) { return Shield.updateShield(this, dt); }
  shieldHint() { return Shield.shieldHint(this); }
  shieldAttack(input, d) { return Shield.shieldAttack(this, input, d); }
  shieldStops(a, by, shooter) { return Shield.shieldStops(this, a, by, shooter); }
  throwShield(k) { return Shield.throwShield(this, k); }
  endShield() { return Shield.endShield(this); }

  // ---------------- the slide, its kick, a vault into a man (player/Sliding.js) ----------------
  startSlide(a) { return Sliding.startSlide(this, a); }
  get ducking() { return Sliding.ducking(this); }
  dodge() { return Sliding.dodge(this); }
  updateSlide(dt) { return Sliding.updateSlide(this, dt); }
  updateSlideAnim(dt) { return Sliding.updateSlideAnim(this, dt); }
  tryKick(a, k, since, stalled) { return Sliding.tryKick(this, a, k, since, stalled); }
  updateKick(dt) { return Sliding.updateKick(this, dt); }
  vaultStrike(v, k) { return Sliding.vaultStrike(this, v, k); }

  // ---------------- finishing a man on the floor (player/Execution.js, data/finishers.js) ----------------
  startExecution(target, f) { return Execution.startExecution(this, target, f); }
  windup() { return Execution.windup(this); }
  updateExecution(dt, input) { return Execution.updateExecution(this, dt, input); }
  finish(ex, x, y) { return Execution.finish(this, ex, x, y); }

  // ---------------- a guard taken down unseen (player/Takedown.js, data/finishers.js TAKEDOWNS) ----------------
  pickTakedown(front) { return Takedown.pickTakedown(this, front); }
  startTakedown(target, move) { return Takedown.startTakedown(this, target, move); }
  takedownMove(target) { return Takedown.takedownMove(this, target); }
  updateTakedown(dt) { return Takedown.updateTakedown(this, dt); }
  endTakedown() { return Takedown.endTakedown(this); }
}
