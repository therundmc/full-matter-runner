// A boss (data/bosses.js BOSSES, by the kind he is drawn as: level `looks`): a guard who is his own man.
// - He is on the player faster, and works his pump-action as fast as it goes, walking at him with the gun at his
//   hip; every shot is told: the pump racked (heard, the forend worked), then a glint growing at the muzzle.
// - Furniture in his way goes over or is sent off; he reloads on his feet, with a word.
// - He takes TWO hits. The first one, whatever it is, wounds him: he reels back, bleeds where it struck, his shades
//   knocked askew, a hand on the wound; then he roars and goes berserk (faster, wilder), bleeding as he goes. The
//   second one kills him, big. Bare blows (a punch, a kick, a door) he shrugs off, until one too many wounds him;
//   wounded, they floor him like anyone and he can be finished on the floor.
// - Seized from behind while he is whole, he throws the player off (shakeOff, asked by Player.startTakedown).
// What the screen makes of it (the name card, the camera) is systems/BossStage.js's, off the 'boss' event:
// { boss, beat: 'intro' | 'wounded' | 'berserk' | 'down' }.
import Enemy from './Enemy.js';
import Debris from './Debris.js';
import { BOSSES } from '../data/bosses.js';
import { ENEMY, PALETTE } from '../Config.js';
import { rand, angDiff, pick, clamp, lerp } from '../../engine/math.js';
import { impulse } from '../../engine/physics/Body.js';
import { sprite, spriteOpt } from '../../engine/Assets.js';
import { inHand } from '../ai/Carry.js';
import { bodyFrame, smooth } from './CharacterAnim.js';
import { drawWound, drawClutch, drawGlint } from '../render/BossArt.js';

const { Body } = Matter;
const bump = (k) => (k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k));

// The side of him a blow going along `a` struck, for a man facing `facing`: 'front' | 'behind' | 'left' | 'right'
// (BOSSES spots).
export function struckSide(facing, a) {
  const from = angDiff(facing, a + Math.PI); // where it came from, off his nose (+ = his right)
  const off = Math.abs(from);
  return off < 0.8 ? 'front' : off > 2.3 ? 'behind' : from > 0 ? 'right' : 'left';
}

export default class Boss extends Enemy {
  constructor(world, x, y, angle, kind, weapon, roam = false) {
    super(world, x, y, angle, kind, weapon, roam);
    const T = (this.traits = BOSSES[kind]);
    this.boss = true;
    this.nick = T.name;
    this.slack = T.react;
    this.wounded = false;
    this.woundT = -99;     // world time of the first hit
    this.hurtAt = null;    // where it shows: a BOSSES spots entry
    this.reel = 0;         // s left of reeling from it, then of the roar that ends it
    this.reelA = 0;        // the way it threw him, and the side his shoulders went
    this.reelSide = 1;
    this.shrugs = 0;       // bare blows shrugged off so far
    this.shotAt = -99;     // world time of his last shot; racked: its pump has been worked
    this.racked = true;
    this.shoveT = 0;       // s before he sends another piece of furniture off
    this.shakeT = 0;       // s before he can throw the player off again
    this.trail = 0;        // px walked since the last drop of blood
    this.wordT = 0;        // s to his next roared line, once berserk
  }

  takeJob(job) {
    super.takeJob(job);
    this.boss = true;
  }

  // a line of his (BOSSES lines), big in a bubble over his head (WorldRenderer.drawBubble): one at a time
  shout(kind, dur = 1.6) {
    const w = this.world;
    for (const t of w.texts) if (t.bubble && t.who === this) t.t = 0;
    w.texts.push({ who: this, x: this.x, y: this.y, str: pick(this.traits.lines[kind]), t: dur, dur, color: PALETTE.pink, bubble: true });
    this.barkT = dur;
    this.speak('threat');
  }

  // his eyes on the player for the first time: the card, the camera, his word; his fire held while he says it
  bossLine() {
    const w = this.world, I = this.traits.intro;
    this.director.bossSpoke = true;
    this.shout('intro', I.dur);
    w.slowmo(...I.slowmo);
    this.react = Math.max(this.react, I.hold);
    w.sound('bossCard', this.x, this.y, 1);
    w.events.emit('boss', { boss: this, beat: 'intro' });
  }

  // ---------------- two hits ----------------
  kill(angle, cause, killer, by, how) {
    if (!this.alive || this.invulnerable) return;
    const w = this.world, T = this.traits, D = T.death;
    if (!this.wounded) { this.wound(angle, cause); return; }
    if (w.time - this.woundT < T.wound.grace) return; // the rest of the blast that wounded him
    const { x, y } = this, face = this.angle, standing = !(this.knocked > 0) && !this.held;
    // his gun flies (unless the player's hand is about to close on it: Character.kill), the shades come off and
    // skitter away
    if (!killer?.snatches?.(this, how)) this.dropWeapon(angle + rand(-0.6, 0.6), rand(...D.gun));
    const sa = angle + rand(-0.7, 0.7), sv = rand(...D.shades);
    w.addDebris(new Debris(w, sprite('items/shades'), x + Math.cos(face) * 6, y + Math.sin(face) * 6, face + Math.PI / 2,
      Math.cos(sa) * sv, Math.sin(sa) * sv, rand(-0.5, 0.5), { material: 'plastic', kg: 0.05, mu: 0.3, bounce: 0.5, z: 12, vz: 40, fly: 0.5,
        tick: { name: 'shadesDrop', opts: {} } }));
    w.particles.blood(x, y, angle, 0.7, D.blood[0], D.blood[1], { big: true });
    // a big man goes down big: onto his knees where he stood, a breath there, then onto his face (unless the blow
    // has its own way with him: a finisher, a takedown, a blast)
    const own = standing && !how?.dying && !how?.finisher && cause !== 'explosion' ? { dying: 'kneel' } : null;
    super.kill(angle, cause, killer, by, { ...how, ...own, boss: this.kind });
    w.slowmo(...D.slowmo);
    w.shake(0.5);
    w.sound('bossDeath', x, y, 1, { pitch: this.voice });
    w.events.emit('boss', { boss: this, beat: 'down' });
  }

  // The first hit: he does not die of it. Thrown back, bleeding where it struck, his shades askew; berserk after.
  wound(angle, cause) {
    const w = this.world, T = this.traits, W = T.wound, { x, y } = this;
    this.wounded = true;
    this.woundT = w.time;
    this.hurtAt = T.spots[struckSide(this.angle, angle)];
    this.head = spriteOpt(`characters/${this.kind}_head_hurt`) || this.head;
    this.reel = W.stagger + T.berserk.roar;
    this.reelA = angle;
    this.reelSide = angDiff(this.angle, angle) >= 0 ? 1 : -1;
    if (this.holding) this.dropHeld();
    this.reloading = 0; this.swing = this.tell = 0;
    this.slack = T.react * T.berserk.react;
    this.pace *= T.berserk.speed;
    this.vel = { x: Math.cos(angle) * W.back, y: Math.sin(angle) * W.back };
    Body.setVelocity(this.body, this.vel);
    w.particles.blood(x, y, angle, 0.55, W.blood[0], W.blood[1], { big: true });
    w.particles.blood(x, y, angle + Math.PI, 0.7, Math.ceil(W.blood[0] / 3), W.blood[1] * 0.5);
    w.decals?.stampBlood(x, y, 5, 5, angle);
    w.sound('bossHowl', x, y, 1, { pitch: this.voice });
    w.slowmo(...W.slowmo);
    w.shake(0.4);
    w.hitstop(0.08);
    w.addScore(W.points, x, y, W.label);
    this.shout('wounded', W.stagger);
    this.director.provoked = true;
    const p = w.player;
    if (p?.alive) this.lastKnown = { x: p.x, y: p.y };
    this.spot(true);
    w.events.emit('boss', { boss: this, beat: 'wounded', cause });
  }

  // the reel is over: head back, he roars, and comes on
  goBerserk() {
    const w = this.world;
    this.shout('berserk', 1.5);
    w.sound('bossRoar', this.x, this.y, 1, { pitch: this.voice });
    w.shake(0.3);
    this.wordT = rand(...this.traits.berserk.taunt);
    w.events.emit('boss', { boss: this, beat: 'berserk' });
  }

  // whole, a bare blow does not take him off his feet: he shrugs it off, until one too many wounds him
  knock(angle, cause, opt = {}) {
    if (!this.alive || this.knocked > 0) return;
    const w = this.world, W = this.traits.wound;
    if (this.wounded) {
      if (w.time - this.woundT >= W.grace) super.knock(angle, cause, { ...opt, time: opt.time ?? W.down });
      return;
    }
    if (opt.dazed) return; // a slick floor: he keeps his feet
    if (++this.shrugs > W.fists) { this.wound(angle, cause); return; }
    this.director.provoked = true;
    this.shout('shrug', 1.2);
    w.sound('punch', this.x, this.y, 0.6, { pitch: 0.7 });
    this.flinchFrom(0.6, angle, 1);
    this.spot(true);
  }

  // Seized from behind (Player.startTakedown asks): whole, he throws the player off and comes round on him; true
  // when the takedown is off. Wounded, he can be taken like anyone.
  shakeOff(p) {
    if (this.wounded || !this.alive) return false;
    if (this.shakeT > 0) return true; // he has just done it: still off
    const w = this.world, K = this.traits.shake, a = Math.atan2(p.y - this.y, p.x - this.x);
    this.shakeT = K.cd;
    p.shoved?.(a, K.throw);
    w.sound('bossShake', this.x, this.y, 1, { pitch: this.voice });
    w.shake(0.25);
    this.director.provoked = true;
    this.lastKnown = { x: p.x, y: p.y };
    this.spot(false);
    this.shout('shake', 1.4);
    this.react = Math.max(this.react, K.react);
    return true;
  }

  // ---------------- his fight ----------------
  update(dt) {
    const w = this.world, T = this.traits;
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.alive && this.reel > 0 && !(this.knocked > 0) && !this.held) {
      // reeling: he does nothing but take it, sliding to a stop; then the roar
      const roar = T.berserk.roar, was = this.reel;
      this.reel -= dt;
      this.baseUpdate(dt);
      this.iconT = Math.max(0, this.iconT - dt);
      this.barkT = Math.max(0, this.barkT - dt);
      this.updateCarry(dt);
      this.steer(0, 0, 0, 0.07);
      this.react = Math.max(0, this.reel); // his fire held until he has roared
      this.bleed();
      if (was > roar && this.reel <= roar) this.goBerserk();
      this.probeT = 0; this.probeX = this.x; this.probeY = this.y;
      return;
    }
    super.update(dt);
    if (!this.alive || this.knocked > 0) return;
    // the pump, a beat after the shot
    if (!this.racked && w.time - this.shotAt >= T.fire.pump) {
      this.racked = true;
      if (this.weapon) w.sound('rack', this.x, this.y, 0.9, { weapon: this.weapon.type });
    }
    if (this.wounded) {
      this.bleed();
      if (this.aware === 2 && (this.wordT -= dt) <= 0 && this.reloading <= 0) {
        this.wordT = rand(...T.berserk.taunt);
        this.shout('berserk', 1.3);
        w.sound('bossRoar', this.x, this.y, 0.7, { pitch: this.voice });
      }
    }
    if ((this.shoveT -= dt) <= 0 && this.aware === 2 && this.moving > 0.3) this.clearWay();
  }

  // wounded, he leaves his blood behind him as he goes
  bleed() {
    const R = this.traits.trail, w = this.world;
    if ((this.trail += this.moving) < R.every) return;
    this.trail = 0;
    const x = this.x + rand(-R.spread, R.spread), y = this.y + rand(-R.spread, R.spread);
    w.particles.blood(x, y, rand(0, 6.28), 0.3, 1, rand(5, 30), { z: 6 });
    w.decals?.stampBlood(x, y, rand(1, 2.2));
  }

  // furniture in the way he walks: a table goes over, the rest is sent off
  clearWay() {
    const S = this.traits.shove, w = this.world, a = this.moveAngle;
    for (const p of w.props) {
      if (p.dead || p.isVehicle || p.def.high || !p.body || p.body.isStatic && !p.body.frozen && !p.def.flips) continue;
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
      if (d > S.reach + Math.min(p.def.w ?? 0, p.def.h ?? 0) / 2 || Math.abs(angDiff(a, Math.atan2(dy, dx))) > S.cone) continue;
      this.shoveT = S.every;
      if (!p.flip?.(a)) {
        p.hit(1, this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius, a, S.power, 'blunt', { heft: 2 });
        if (!p.dead) impulse(p.body, a, S.J, rand(-0.1, 0.1));
      }
      return;
    }
  }

  // a gun in his hands: he walks at the player and fires; thumbing shells in, he keeps coming. Anything else (bare
  // hands, a club, a gun run dry): a guard's ways.
  plan(p) {
    const gun = this.def.kind === 'gun';
    if (!gun || this.panicT > 0 || (this.weapon.mag <= 0 && this.reloading <= 0 && this.reserveCount() <= 0)) return super.plan(p);
    if (this.reloading > 0 || this.needsReload()) return this.setTactic('reload');
    return this.setTactic(this.sees || this.lostT < 0.4 || !this.lastKnown ? 'advance' : 'hunt');
  }

  // stood still on purpose: the ground he has not covered meanwhile is no jam (Enemy.follow's probe)
  stand() {
    this.halt();
    this.probeT = 0; this.probeX = this.x; this.probeY = this.y;
  }

  tAdvance(dt, p) {
    const A = this.traits.advance, d = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.sees && d <= A.near) this.stand();
    else this.travel(dt, p.x, p.y, ENEMY.runSpeed * A.pace * this.pace, { look: !this.sees, near: A.near - 10 });
    if (this.sees) { this.aimAt(p.x, p.y, dt); this.tryFire(p); }
  }

  tReload(dt) {
    const A = this.traits.advance, lk = this.sees ? this.world.player : this.lastKnown;
    if (lk) this.aimAt(lk.x, lk.y, dt, 0.6);
    if (this.reloading <= 0) {
      if (!this.needsReload()) { this.thinkT = 0; return; }
      if (this.reload()) this.shout('reload', 1.6);
    }
    if (lk && Math.hypot(lk.x - this.x, lk.y - this.y) > A.near) this.travel(dt, lk.x, lk.y, ENEMY.runSpeed * A.reload * this.pace, { look: false, near: A.near - 10 });
    else this.stand();
  }

  // his pump-action goes as fast as he can work it (BOSSES fire / berserk interval)
  tryFire(tg, wild = 0) {
    const T = this.traits, B = this.wounded ? T.berserk : T.fire;
    if (!super.tryFire(tg, wild + B.wild)) return false;
    if (!this.def.shellReload) return true;
    this.cooldown = rand(...B.interval);
    this.shotAt = this.world.time;
    this.racked = false;
    return true;
  }

  // 0..1: how far the forend is drawn back, working the pump after a shot
  get pumpK() {
    const F = this.traits.fire;
    return bump((this.world.time - this.shotAt - F.pump) / F.rack);
  }

  // 0..1: the glint at the muzzle before a shot (the telegraph), growing over the last `tell` s
  get tellK() {
    if (!this.alive || this.knocked > 0 || this.aware !== 2 || !this.sees || this.def.kind !== 'gun' || !inHand(this)) return 0;
    if (this.reloading > 0 || this.weapon.mag <= 0 || this.reel > 0) return 0;
    const left = Math.max(this.cooldown, this.react), tell = this.traits.fire.tell;
    return left > 0 && left <= tell ? 1 - left / tell : 0;
  }

  // ---------------- how he is drawn ----------------
  // over the stance (Character.draw): the gun at his hip, the pump worked, a hand on the wound, the reel, the roar
  ownPose(P) {
    if (this.vaulting) return;
    const T = this.traits, t = this.world.time;
    const two = P.wpnOn && this.def.hold === 'two' && inHand(this);
    if (two) {
      const [f, r] = T.advance.hip, k = (1 - smooth(this.lower)) * P.s, c = Math.cos(this.angle), s = Math.sin(this.angle);
      const dx = (c * f - s * r) * k, dy = (s * f + c * r) * k;
      for (const q of [P.wpn, P.hr, P.hl]) { q.x += dx; q.y += dy; }
    }
    const pump = two ? this.pumpK : 0;
    const H = this.hurtAt;
    this.clutch = false;
    if (H && this.reloading <= 0 && !(this.racking > 0)) {
      // his free hand on the wound (an arm that was struck hangs); it comes to the forend only to work the pump
      const [hx, hy] = H.limp ? [-1.2, -9.6] : H.hand || H.at, c = Math.cos(P.ta) * P.s, s = Math.sin(P.ta) * P.s;
      const on = 1 - pump;
      P.hl.x = lerp(P.hl.x, P.tx + hx * c - hy * s, on); P.hl.y = lerp(P.hl.y, P.ty + hx * s + hy * c, on);
      P.elb[0] = 0.85;
      P.hand[0] = H.limp ? 'loose' : 'flat';
      this.clutch = !H.limp && on > 0.6;
    }
    if (pump > 0) { P.hl.x -= Math.cos(P.wpn.a) * 3.2 * pump * P.s; P.hl.y -= Math.sin(P.wpn.a) * 3.2 * pump * P.s; }
    if (this.reel > 0) {
      const roar = T.berserk.roar;
      if (this.reel > roar) {
        // thrown along the blow, the head snapped back; then doubled over it, shaking
        const u = 1 - (this.reel - roar) / T.wound.stagger;
        const thrown = smooth(u / 0.15) * (1 - smooth((u - 0.45) / 0.55)), over = smooth((u - 0.3) / 0.2) * (1 - smooth((u - 0.85) / 0.15));
        P.tx += Math.cos(this.reelA) * 4.5 * thrown; P.ty += Math.sin(this.reelA) * 4.5 * thrown;
        P.ta += this.reelSide * 0.6 * thrown;
        P.bow = u < 0.3 ? -0.6 * bump(u / 0.3) : 0.6 * over;
        P.hunch = 0.3 * over;
        P.ha = P.ta + Math.sin(t * 34) * 0.22 * over;
      } else {
        const k = bump(1 - this.reel / roar);
        P.bow = -0.6 * k;
        P.s *= 1 + 0.08 * k;
        P.ta += Math.sin(t * 70) * 0.05 * k;
      }
    } else if (this.wounded) P.ta += Math.sin(t * 38 + this.seed) * 0.02; // shaking with rage
  }

  draw(ctx) {
    super.draw(ctx);
    const H = this.hurtAt;
    if (!H || !this.alive || this.knocked > 0) return;
    const P = this.pose;
    ctx.save();
    bodyFrame(ctx, this);
    drawWound(ctx, this.x + P.tx, this.y + P.ty, P.ta, P.s, H.at, this.seed);
    if (H.hand) drawWound(ctx, this.x + P.tx, this.y + P.ty, P.ta, P.s, H.hand, this.seed + 3);
    if (this.clutch) drawClutch(ctx, this.look, this.x + P.hl.x, this.y + P.hl.y, P.ta + Math.PI / 2, P.s);
    ctx.restore();
  }

  drawMarks(ctx) {
    super.drawMarks(ctx);
    const k = this.tellK;
    if (k <= 0) return;
    const m = this.muzzlePos();
    drawGlint(ctx, m.x, m.y, clamp(k, 0, 1), this.world.time);
  }
}
