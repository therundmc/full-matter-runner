import { CAT, MASK, ENEMY, BARREL, PLAYER, BODY_SCALE } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { sprite, spriteOpt, chunk, sw } from '../../engine/Assets.js';
import { rand, chance, spread, angDiff, local, lerp, clamp } from '../../engine/math.js';
import { gore } from '../fx/Gore.js';
import Projectile from './Projectile.js';
import { setKg, impulse } from '../../engine/physics/Body.js';
import { findVault, onRoof, rollRoom } from '../systems/Cover.js';
import { segPoly } from '../../engine/physics/Raycast.js';
import Debris from './Debris.js';
import WeaponItem from './WeaponItem.js';
import AmmoItem from './AmmoItem.js';
import { blowFrom, blowFx } from '../fx/Blows.js';
import { landBlow, jolt, killBeat } from '../fx/Impact.js';
import { muzzleFlash, sampleSmear } from '../fx/CombatFx.js';
import { feelOf, MOMENTS, TELL, GESTURE } from '../data/feel.js';
import { newPose, standPose, vaultPose, slidePose, sitPose, trunkPose, execPose, doorHandPose, drawPose, drawDown, ladderAt, ladderGrip, riseDurAt, muzzleAt, muzzleIn }
  from './CharacterAnim.js';
import { advanceGait } from './Gait.js';

const { Bodies, Body } = Matter;

// How each kind's limbs are painted (render/LimbArt.js): sleeve, skin, the cuff showing at the wrist, gloves,
// trousers, shoes (the same colours as their sprites, tools/generate_assets.py CHARS)
export const KINDS = {
  // the sleeves of his charcoal coat over the grey knit, a Mediterranean tan, jeans, brown boots
  player: { arm: '#465062', skin: '#dba274', cuff: '#868c98', pants: '#3c4a66', shoe: '#3a2a22' },
  thug: { arm: '#e6e0cf', skin: '#e0a878', cuff: '#2a2236', pants: '#2a2632', shoe: '#1e1820' },
  heavy: { arm: '#4b2470', skin: '#c88a60', glove: '#24202a', pants: '#4b2470', shoe: '#ecebf2' },
  brute: { arm: '#d89a70', skin: '#d89a70', pants: '#4c4a2c', shoe: '#5a3a22' },
};

const VAULT_DUR = 0.5;  // s, windows and furniture alike
const CLIMB_DUR = 0.72; // s, over a chain-link gate
const LADDER_DUR = 1.1; // s, up or down a ladder
const CLIMB_NOISE = 230; // px the rattling mesh is heard at when the player climbs
const RUNG_NOISE = 150;  // px each of his steps on a steel ladder is heard at
const LAND_NOISE = 120;  // px a flat landing is heard at

// cubic Hermite from 0 to 1, leaving with slope m0 and arriving with slope m1
const hermite = (k, m0, m1) => { const k2 = k * k, k3 = k2 * k; return (k3 - 2 * k2 + k) * m0 + (3 * k2 - 2 * k3) + (k3 - k2) * m1; };
const GAIT_SPEED = 1.6; // px/step at which the walk cycle reaches its full stride
// the torso's spring on the hips (Character.carryTorso): px of lean per px/step of speed change per step, its cap, how
// much of a stop carries it on forward, its natural frequency (rad/s) and damping ratio (under 1: it swings back)
const SETTLE = { gain: 3.2, max: 1.8, carry: 0.85, freq: 12, damp: 0.42 };
// a man lying knocked down (layClear): where along his sprite's length he is checked against walls (his head, his
// chest, his feet; the sprite sits a little ahead of the body's centre), the turns tried, rad/s he is turned at
const LIE_AT = [0.6, 0.32, -0.44], LIE_TURNS = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1, 2.6, -2.6, Math.PI], LIE_RATE = 9;
const TOUCH = { x: 0, y: 0, a: 0 }; // where a door leaf is touched (Door.touch)
const MUZZLE_AT = { x: 0, y: 0, a: 0 };

// Shared body / weapon / animation logic for the player and enemies.
export default class Character {
  constructor(world, x, y, angle, kind, team) {
    this.world = world;
    this.kind = kind;
    this.team = team;
    this.look = KINDS[kind];
    this.voice = rand(0.92, 1.1) * (kind === 'brute' || kind === 'heavy' ? 0.88 : 1); // pitch of his shouts and cries
    this.radius = PLAYER.radius; // everyone has the same build
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
    this.strike = 0;        // gesture of the current melee blow: 0 forehand, 1 backhand, 2 smash / stab, 3 spin / overhead stab
    this.tell = 0;          // s left of a guard's wind-up before his blow comes (windUp)
    this.tellDur = 1;
    this.recoil = 0;
    this.barrel = 0;        // heat of the barrel, in rounds: it smokes after a burst (BARREL)
    this.fumeT = 0;
    this.reloading = 0;
    this.reloadDur = 1;
    this.reloadStage = 0;
    this.pickAnim = 0;
    this.throwT = 0;        // follow-through of a throw
    this.throwDur = 0.28;
    this.recoilRate = 9;    // recoil recovery per second (heavy guns recover slower)
    this.glassSafe = 0;     // seconds of immunity to flying shards left after a window vault
    this.vaulting = null;   // { from, to, t, dur, kind, dir, ... } while jumping over something
    this.slideAnim = null;  // { dir, side, k, w } while sliding (driven by Player)
    // animation state (see CharacterAnim.js)
    this.gait = 0;          // 0 standing .. 1 full stride, smoothed
    this.strideV = 0;       // smoothed speed of the drawn body (m/s), and how much of a run it is (0 .. 1): Gait.js
    this.runK = 0;
    this.footA = angle;     // smoothed direction of the hips and the toes
    this.strideA = angle;   // smoothed direction the feet stride along
    this.hipsGoal = angle;
    this.backward = false;  // walking backwards, facing on
    this.lean = { x: 0, y: 0 };  // the torso carried off the hips by a change of speed: a damped spring
    this.leanV = { x: 0, y: 0 };
    this.prevVel = { x: 0, y: 0 };
    this.breath = rand(0, 6.28);
    this.stow = 0;          // weapon put away 1 .. in hand 0 (ai/Carry.js; only the guards ever put theirs away)
    this.lower = 0;         // gun held low 1 .. raised on a target 0
    this.downT = 0;         // time since knocked down
    this.riseDur = 0;       // s the getting up takes, once it has started (CharacterAnim.riseDurAt)
    this.doorHand = null;   // { x, y, a, w }: a hand flat on the door leaf he pushes (updateDoorHand)
    this.pose = newPose();
    this.pose2 = newPose();
    this.alive = true;
    this.knocked = 0;
    this.downAngle = 0;
    this.torso = sprite(`characters/${kind}_torso`);
    this.head = sprite(`characters/${kind}_head`);
    this.downImg = sprite(`characters/${kind}_down`);
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; }
  get armed() { return !!this.weapon; }
  get hasGun() { return this.def.kind === 'gun'; }

  // weapon instance: { type, mag (rounds in the gun), reserve (enemies: spare mags, or loose rounds for shotguns),
  // wear (melee: kills left in it; only the player's ever wears out) }
  setWeapon(type, mag, reserve = 0) {
    this.weapon = type ? { type, mag: mag ?? WEAPONS[type].mag ?? 0, reserve, wear: WEAPONS[type].wear } : null;
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
    this.glassSafe = Math.max(0, this.glassSafe - dt);
    this.pickAnim = Math.max(0, this.pickAnim - dt);
    this.updateReload(dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.recoil = Math.max(0, this.recoil - dt * this.recoilRate);
    if (this.barrel > 0) this.fume(dt);
    const v = Body.getVelocity(this.body);
    const sp = Math.hypot(v.x, v.y);
    this.moving = sp;
    if (sp > 0.25) this.moveAngle = Math.atan2(v.y, v.x);
    const steps = advanceGait(this, sp, dt, this.moveAngle);
    // knocked down: a puff of dust when the body hits the floor
    const wasDown = this.downT;
    this.downT = this.knocked > 0 ? this.downT + dt : 0;
    if (wasDown < 0.18 && this.downT >= 0.18) this.world.particles.smoke(this.x, this.y, 3, 5, { speed: 25, size: 4, life: 0.5 });
    this.riseDur = riseDurAt(this.riseDur, this.knocked, GESTURE.getup.dur);
    this.updateDoorHand(dt, sp, v);
    // smoothed gait / feet direction / lean into acceleration (frozen while vaulting, so the run resumes on landing)
    if (!this.vaulting) {
      const kg = 1 - Math.exp(-dt * 12), kf = 1 - Math.exp(-dt * 9);
      this.gait += (Math.min(1, sp / GAIT_SPEED) - this.gait) * kg;
      this.footA += angDiff(this.footA, this.hipsGoal) * kf; // the hips come round a little after the shoulders
      if (sp > 0.25) this.strideA += angDiff(this.strideA, this.moveAngle) * kf;
      this.carryTorso(dt, v);
      // a foot coming down is heard, by the floor (quiet: audio STEP_LEVEL): under two a second walking, three running
      if (steps && sp > 0.3 && !this.slideAnim && this.alive) {
        const run = sp > 1.8;
        this.world.sound('step', this.x, this.y, run ? 0.9 : 0.6, { floor: this.world.floorAt(this.x, this.y), run });
      }
    }
    this.prevVel.x = v.x; this.prevVel.y = v.y;
  }

  // The torso on the hips, as a damped spring: it leans into a start and into a turn, is carried on past the feet
  // when he stops short and swings back a little before it settles (pose px, world orientation).
  carryTorso(dt, v) {
    const ax = (v.x - this.prevVel.x) / (dt * 60), ay = (v.y - this.prevVel.y) / (dt * 60); // px/step per step
    const pv = Math.hypot(this.prevVel.x, this.prevVel.y);
    let tx = ax, ty = ay;
    if (pv > 0.2) {
      // the share of the change along the way he was going: a start or a stop both throw the torso forward
      const ux = this.prevVel.x / pv, uy = this.prevVel.y / pv, along = ax * ux + ay * uy;
      tx += (Math.abs(along) - along) * ux * SETTLE.carry; ty += (Math.abs(along) - along) * uy * SETTLE.carry;
    }
    const m = Math.hypot(tx, ty) * SETTLE.gain, k = m > SETTLE.max ? SETTLE.max / m : 1;
    tx *= SETTLE.gain * k; ty *= SETTLE.gain * k;
    const w = SETTLE.freq, z = SETTLE.damp, L = this.lean, V = this.leanV;
    V.x += (w * w * (tx - L.x) - 2 * z * w * V.x) * dt; V.y += (w * w * (ty - L.y) - 2 * z * w * V.y) * dt;
    L.x += V.x * dt; L.y += V.y * dt;
  }

  // walking into a door leaf: a hand comes up flat against it for as long as he pushes (GESTURE.door)
  updateDoorHand(dt, sp, v) {
    const G = GESTURE.door, doors = this.world.doors;
    let on = false;
    if (sp > G.speed && !this.vaulting && !(this.knocked > 0) && doors?.length) {
      for (const door of doors) {
        const t = door.touch(this.x, this.y, this.radius + G.gap, TOUCH);
        if (t && (t.x - this.x) * v.x + (t.y - this.y) * v.y > 0) { on = true; break; }
      }
    }
    const H = this.doorHand;
    if (on) {
      const h = (this.doorHand = H || { x: 0, y: 0, a: 0, w: 0 });
      h.x = TOUCH.x; h.y = TOUCH.y; h.a = TOUCH.a;
      h.w = Math.min(1, h.w + dt / G.on);
    } else if (H && (H.w -= dt / G.off) <= 0) this.doorHand = null;
  }

  // ---------------- combat ----------------
  // fromTell: the blow a guard has been winding up (windUp): it goes on from its held anticipation
  attack(fromTell = false) {
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
    if (!fromTell) this.pickBlow(d);
    this.cooldown = d.rate;
    this.swingDur = d.rate * 0.85;
    this.swing = this.swingDur * (fromTell ? 1 - TELL.hold : 1);
    this.world.sound('swing', this.x, this.y, 0.6, { weapon: this.weapon?.type });
    this.world.after(d.windup, () => this.meleeStrike(d));
    return true;
  }

  // the gesture of the next blow, and the side its stroke comes from (it runs toward the other one)
  pickBlow(d) {
    this.strike = this.pickStrike(d);
    this.punchSide = d.hold === 'melee' ? (this.strike === 1 ? -1 : 1) : -this.punchSide;
  }

  // a guard's blow does not come out of nowhere: he picks it and holds its anticipation (the weapon drawn back, a
  // glint on it: Enemy.drawMarks) for the weapon's FEEL tell, then lets it go (Enemy.update calls attack(true))
  windUp() {
    if (this.cooldown > 0 || this.tell > 0 || this.def.kind === 'gun') return false;
    this.pickBlow(this.def);
    this.tell = this.tellDur = feelOf(this.def).tell;
    return true;
  }

  // gesture of a blow with a bat or a knife (see CharacterAnim): blows chained without a pause alternate forehand
  // and backhand; now and then comes the heavy one, an overhead smash or a straight stab (a blade's is as often an
  // overhead stab, 3); in the middle of a chain a club sometimes goes all the way round (a spin, 3)
  pickStrike(d) {
    if (d.hold !== 'melee') return 0;
    const chained = this.cooldown > -0.25;
    if (d.swing === 'club' && chained && this.strike !== 3 && chance(0.2)) return 3;
    if (this.strike < 2 && chance(chained ? 0.25 : 0.3)) return d.swing === 'blade' && chance(0.5) ? 3 : 2;
    return chained && this.strike === 0 ? 1 : 0;
  }

  // Lying knocked down (his sprite: head toward downAngle), thrown against a wall: he crumples along it instead of
  // lying with his head or his feet in it. Turned a little each step toward the nearest way he fits.
  layClear(dt) {
    const m = this.world.map, len = sw(this.downImg);
    const fits = (a) => LIE_AT.every((k) => !m.solidAt(this.x + Math.cos(a) * len * k, this.y + Math.sin(a) * len * k));
    if (fits(this.downAngle)) return;
    const turn = LIE_TURNS.find((t) => fits(this.downAngle + t));
    if (turn !== undefined) this.downAngle += Math.sign(turn) * Math.min(Math.abs(turn), dt * LIE_RATE);
  }

  // { x, y, a }: the end of the barrel and the way it points, as last drawn (kept in the aim's frame, so that it turns
  // with him until he is drawn again); a gun not drawn yet: where it is when raised on a target
  muzzlePos() {
    const d = this.def, n = this.muzzleNote;
    if (n?.def === d) {
      const p = local(this.x, this.y, this.angle, n.x, n.y);
      p.a = this.angle + n.da;
      return p;
    }
    const m = muzzleAt(d, sw(sprite(d.sprite)));
    const p = local(this.x, this.y, this.angle, m.x * BODY_SCALE, m.y * BODY_SCALE);
    p.a = this.angle;
    return p;
  }

  // the muzzle in the pose he is drawn in (CharacterAnim.muzzleIn), into the aim's frame
  noteMuzzle(P) {
    const d = this.def;
    if (!P.wpnOn || d.kind !== 'gun') return;
    const m = muzzleIn(P, d, sw(sprite(d.sprite)), MUZZLE_AT), c = Math.cos(this.angle), s = Math.sin(this.angle);
    const n = this.muzzleNote ??= { def: d, x: 0, y: 0, da: 0 };
    n.def = d;
    n.x = (m.x * c + m.y * s) * BODY_SCALE; n.y = (m.y * c - m.x * s) * BODY_SCALE;
    n.da = angDiff(this.angle, m.a);
  }

  // the barrel that just fired a burst smokes once it falls silent, a thin wisp that rises until it has cooled
  fume(dt) {
    this.barrel = Math.max(0, this.barrel - dt * BARREL.cool);
    if ((this.fumeT -= dt) > 0 || this.barrel < BARREL.from || !this.hasGun) return;
    this.fumeT = BARREL.every;
    const m = this.muzzlePos();
    this.world.particles.smoke(m.x, m.y, 1, 0.5, { speed: 7, size: 3, life: 1, puff: true, h: 4 });
  }

  fire(d) {
    const w = this.world;
    const a = this.angle;
    const enemy = this.team === 'enemy', m = this.muzzlePos();
    for (let i = 0; i < d.pellets; i++) {
      const sp = d.spread * spread() + (enemy ? rand(-ENEMY.aimError, ENEMY.aimError) : 0);
      const speed = d.speed * (1 + (d.speedVar || 0) * rand(-1, 1));
      // out of the muzzle, its first step traced from his chest: nothing between the two is missed (a man at point
      // blank, the wall the barrel pokes into)
      const pr = new Projectile(w, m.x, m.y, a + sp, speed, {
        team: this.team, owner: this, weapon: d, life: d.range ?? 1.1, pen: d.pen ?? 10, rocket: d.rocket, floor: this.shootDown,
        from: { x: this.x + Math.cos(a) * 4, y: this.y + Math.sin(a) * 4 },
      });
      w.addProjectile(pr);
    }
    muzzleFlash(w, m.x, m.y, m.a, d, this);
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
    this.barrel = Math.min(BARREL.max, this.barrel + (d.pellets > 1 || d.rocket ? BARREL.big : 1));
    this.fumeT = BARREL.wait;
    this.recoilRate = d.kick >= 6 ? 4.5 : 9;
    this.weapon.mag--;
    this.vel.x -= Math.cos(a) * d.kick * 0.12;
    this.vel.y -= Math.sin(a) * d.kick * 0.12;
    if (this.isPlayer) { const f = feelOf(d).fire; jolt(w, a + Math.PI, 0, f.shake, f.push); }
  }

  meleeStrike(d) {
    if (!this.alive || this.knocked) return;
    const w = this.world, a = this.angle, x = this.x, y = this.y, weapon = this.weapon;
    // a club swung all the way round reaches everyone about him
    const spin = this.strike === 3 && d.swing === 'club', arc = spin ? Math.PI * 2 : d.arc;
    let hit = false;
    for (const c of w.characters()) {
      if (c === this || !c.alive || c.team === this.team) continue;
      const dx = c.x - x, dy = c.y - y, dd = Math.hypot(dx, dy);
      if (dd > d.range + c.radius) continue;
      if (Math.abs(angDiff(a, Math.atan2(dy, dx))) > arc / 2 && dd > c.radius + 5) continue;
      if (!w.lineOfSight(x, y, c.x, c.y)) continue;
      hit = true;
      const heavy = d.hold === 'melee' && (this.strike === 2 || (this.strike === 3 && d.swing === 'blade'));
      // a spin takes him the way it found him, wherever he stood round us
      const ba = spin ? Math.atan2(dy, dx) : a;
      let hard = heavy;
      if (d.lethal || c.isPlayer) {
        // how it landed: the heavy stroke, a spin or a sweep, and from which side of him (fx/Blows.js, Scoring)
        const how = { from: blowFrom(c.angle, ba), heavy };
        if (spin) how.spin = true;
        // the player's weapon wears out: the kill that uses it up breaks it over him (once, even through two men)
        const wears = this.isPlayer && d.wear && weapon && this.weapon === weapon;
        const last = wears && weapon.wear <= 1;
        if (last) { how.broke = true; how.heavy = hard = true; }
        if (d.lethal) blowFx(w, d, c, ba, how);
        // a club brought straight down crushes, and drops him where he stood
        let by = heavy && d.swing === 'club' && !d.thrust ? { ...d, wound: 'crush', gore: (d.gore || 0.3) * 2.5 } : d;
        if (last) {
          // what stays in him: the whole weapon, or the half it snapped into (a bat just snaps)
          const stuck = d.breaks === 'lodge' ? d.sprite : d.snaps ? WEAPONS[d.snaps].sprite : undefined;
          const blade = d.swing === 'blade';
          by = { ...d, wound: blade ? 'slash' : 'crush', gore: blade ? 0 : (d.gore || 0.3) * 2.5, stuck };
        }
        c.kill(ba, d.swing === 'blade' ? 'slash' : 'melee', this, by, how);
        if (wears && --weapon.wear <= 0) this.breakWeapon(a, !!by.stuck);
      } else c.knock(a, 'punch');
      // what the eye and the screen take of it (fx/Impact.js), at the point of contact
      landBlow(w, c, (x + c.x * 2) / 3, (y + c.y * 2) / 3, ba, d, { lethal: !c.alive, byPlayer: this.isPlayer, heavy: hard });
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
        const dx = p.x - x, dy = p.y - y, dd = Math.hypot(dx, dy), pa = Math.atan2(dy, dx);
        if (dd > d.range + 12 || Math.abs(angDiff(a, pa)) > arc / 2) continue;
        if (spin) { hx = x + Math.cos(pa) * d.range * 0.8; hy = y + Math.sin(pa) * d.range * 0.8; }
      }
      // a blade cuts across the swing, bare hands only scuff, a bat dents
      const kind = d.bleed ? 'cut' : d.hold === 'none' ? 'punch' : 'blunt';
      p.hit(d.lethal ? 2 : 1, hx, hy, a, 2.5, kind, { swing: a - (Math.PI / 2) * this.punchSide });
      hit = true;
    }
    for (const win of w.windows) {
      if (Math.hypot(win.x - x, win.y - y) < d.range + 12 && win.blow(x, y, a, this, d.heft === 2 ? 2 : 0)) hit = true;
    }
    for (const door of [...w.doors]) {
      const t = door.tip();
      const mx = (door.hx + t.x) / 2, my = (door.hy + t.y) / 2;
      if (Math.hypot(mx - x, my - y) < d.range + 14) {
        // bare hands = a kick, otherwise a blow with the weapon
        door.hit(mx, my, a, d.heft === 2 ? 2 : 1, d.hold === 'none' ? 'kick' : 'melee');
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
        if (o.dead || o.age === 0) continue; // not the body this very blow just made: it was thrown as it should
        const p = o.body.position, dd = Math.hypot(p.x - x, p.y - y);
        if (dd > d.range + 8 || Math.abs(angDiff(a, Math.atan2(p.y - y, p.x - x))) > d.arc / 2) continue;
        impulse(o.body, a, d.lethal ? 90 : 50, rand(-0.2, 0.2), 6);
        if (o.pool !== undefined) { w.particles.blood(p.x, p.y, a, 0.5, 6, 140); hit = true; }
      }
    }
    if (hit) w.sound(d.sound, x, y);
  }

  // the weapon gives out over someone (def.breaks): 'snap' = it breaks in two, the far end flies off unless it stayed
  // planted in him, and what is left in the hand is def.snaps (fresh), or nothing; 'lodge' = it stays in the body
  breakWeapon(a, planted = false) {
    const d = this.def, w = this.world, tip = local(this.x, this.y, a, d.range * 0.8, 0);
    if (d.breaks === 'snap') {
      if (!planted) {
        const fa = a + rand(0.4, 0.9) * this.punchSide;
        w.addDebris(new Debris(w, sprite(d.snaps ? WEAPONS[d.snaps].sprite : d.sprite), tip.x, tip.y, a + rand(-1, 1),
          Math.cos(fa) * 170, Math.sin(fa) * 170, rand(-0.8, 0.8), { material: d.material, kg: 0.3, mu: 0.6, fly: 0.35, bounce: 0.3 }));
      }
      w.particles.chips(tip.x, tip.y, a, 1.2, 6, '#d8c090', 160);
      w.sound('woodBreak', tip.x, tip.y, 0.6, { pitch: 1.5 });
      this.setWeapon(d.snaps, 0);
    } else {
      const metal = d.material === 'metal';
      w.sound(metal ? 'metal' : 'wood', tip.x, tip.y, 1, metal ? { pitch: 0.7 } : undefined);
      this.weapon = null;
    }
    const B = MOMENTS.break;
    w.slowmo(...B.slowmo);
    jolt(w, a, B.stop, B.shake, 0);
  }

  // hit by a projectile; how: what the round did on its way (Projectile: pierced, through, bounced, dist, last)
  shot(angle, weaponDef, distance, shooter, how) {
    let cause = 'bullet';
    if (weaponDef?.pellets > 1) cause = distance < 120 ? 'blast' : 'bullet';
    else if (weaponDef?.heavy) cause = 'heavy';
    this.kill(angle, cause, shooter, weaponDef || {}, how);
    // a few pellets from afar land as a share of the whole charge
    if (weaponDef?.kind === 'gun') {
      landBlow(this.world, this, this.x - Math.cos(angle) * this.radius, this.y - Math.sin(angle) * this.radius, angle, weaponDef,
        { lethal: !this.alive, byPlayer: !!shooter?.isPlayer, share: cause === 'bullet' && weaponDef.pellets > 1 ? 0.6 : 1 });
    }
  }

  // by: what did it (a weapon definition, or { gore, wound }): sets the dismemberment odds and the bleeding;
  // how: the circumstances of it, for the score (see Scoring.killTags)
  kill(angle, cause, killer, by, how) {
    if (!this.alive || this.invulnerable) return; // invulnerable: sandbox god mode
    this.alive = false;
    this.dropWeapon(angle + rand(-1, 1), rand(1.5, 3.5));
    this.world.removeBody(this.body);
    const left = gore(this.world, this, angle, cause, by, how); // how: the blow decides how much he bleeds
    // most of them go down with a cry, when there is still a throat to cry with
    if (left === 'corpse' && !this.held && chance(0.75)) this.world.sound('cry', this.x, this.y, 1, { pitch: this.voice });
    this.world.onKill(this, cause, killer, how);
    killBeat(this.world, this, killer);
  }

  knock() { /* overridden by Enemy */ }

  // ---------------- traversal ----------------
  // jump through a window (the player: broken or not) / over a low obstacle in direction a, if there is one; up or
  // down a ladder (def.climb 'rungs'); a drop from a height (def.land 'roll', down to the ground) ends in a roll
  tryVault(a) {
    if (this.vaulting || this.knocked || !this.alive) return false;
    const w = this.world, v = findVault(w, this, a);
    if (!v) return false;
    const dx = v.to.x - this.x, dy = v.to.y - this.y, dist = Math.hypot(dx, dy) || 1;
    const dir = Math.atan2(dy, dx), def = v.over.def || {};
    // hands planted on the ledge (world positions), a little apart: [left, right] relative to the move
    const L = v.ledge;
    const h0 = { x: L.x - L.tx * 9, y: L.y - L.ty * 9 }, h1 = { x: L.x + L.tx * 9, y: L.y + L.ty * 9 };
    const flip = -L.tx * Math.sin(dir) + L.ty * Math.cos(dir) < 0;
    // the run-up carries into the move: Hermite tangents normalized to the vault distance and duration
    const vel = Body.getVelocity(this.body);
    const along = Math.max(0, (vel.x * dx + vel.y * dy) / dist);
    // hoisted over on the hands (a sill, a gate, a parapet), or slid across (furniture, a hood)
    const hoist = v.kind !== 'prop' || !!def.land, climb = v.kind === 'climb';
    const ladder = def.climb === 'rungs' ? this.ladderPlan(v, dir) : null;
    const dur = ladder ? LADDER_DUR : climb ? CLIMB_DUR : VAULT_DUR;
    const side = angDiff(dir, this.angle) >= 0 ? 1 : -1; // hip slides roll the chest toward the aim
    this.vaulting = {
      from: { x: this.x, y: this.y }, to: v.to, t: 0, dur, kind: v.kind, over: v.over, dir, dist, hoist, ladder,
      roll: this.isPlayer && def.land === 'roll' && !onRoof(w, v.to.x, v.to.y), rolling: null,
      hands: flip ? [h1, h0] : [h0, h1], side, legSide: hoist ? (Math.random() < 0.5 ? -1 : 1) : -side,
      m0: clamp((along * 60 * dur) / dist, 0, hoist ? 0.6 : 1.1), m1: ladder ? 0.5 : hoist ? 0.8 : 1.2, landed: false,
    };
    // glide over glass frames and furniture, walls still block
    this.body.collisionFilter = { ...this.body.collisionFilter, mask: CAT.WALL };
    this.vel = { x: 0, y: 0 };
    if (ladder) return true; // each rung is heard as it is climbed (climbLadder)
    w.sound(climb ? 'climb' : v.kind === 'window' && v.over.intact ? 'dive' : hoist ? 'vault' : 'hipSlide', this.x, this.y, 0.8, { land: !this.vaulting.roll, material: v.over.isVehicle ? 'metal' : def.material });
    if (climb) w.noise(this.x, this.y, this.isPlayer ? CLIMB_NOISE : 0, this);
    else if (v.kind === 'window' && !v.over.intact) w.particles.glass(v.over.x, v.over.y, a, 0.8, 6, 60); // a whole pane shatters in updateVault
    return true;
  }

  // a ladder about to be climbed (see ladderAt): up when the far side is a roof; its axis (unit, toward the top) and
  // centre, the facing (always toward the top: one comes down it backwards), where the move starts and ends along it
  ladderPlan(v, dir) {
    const p = v.over, up = onRoof(this.world, v.to.x, v.to.y);
    const tx = Math.cos(dir) * (up ? 1 : -1), ty = Math.sin(dir) * (up ? 1 : -1);
    const lx = -Math.sin(p.body.angle), ly = Math.cos(p.body.angle); // the rails run along the sprite's y
    const sgn = lx * tx + ly * ty >= 0 ? 1 : -1, ax = lx * sgn, ay = ly * sgn;
    const q = (x, y) => (x - p.x) * ax + (y - p.y) * ay;
    return { up, ax, ay, cx: p.x, cy: p.y, sgn, face: Math.atan2(ay, ax), q0: q(this.x, this.y), q1: q(v.to.x, v.to.y), i: -2 };
  }

  // returns true while the vault (or the roll after it) is still running
  updateVault(dt) {
    const v = this.vaulting;
    if (!v) return false;
    if (v.rolling) return this.updateRoll(dt, v);
    const w = this.world;
    v.t += dt;
    const k = Math.min(1, v.t / v.dur);
    const c = Math.cos(v.dir), s = Math.sin(v.dir);
    let e;
    if (v.ladder) e = this.climbLadder(v, k);
    else {
      // leaves with the run-up speed, lands with the exit speed, no jerk in between
      e = hermite(k, v.m0, v.m1);
      // skidding over a hood throws sparks, over wood a bit of dust
      if (!v.hoist && k > 0.25 && k < 0.75 && Math.random() < 0.35) {
        const metal = v.over?.isVehicle || v.over?.def?.material === 'metal';
        if (metal) w.particles.sparks(this.x, this.y, v.dir + Math.PI, 0.6, 1, 140);
        else w.particles.smoke(this.x, this.y, 1, 3, { speed: 15, size: 3, life: 0.5 });
      }
    }
    Body.setPosition(this.body, { x: lerp(v.from.x, v.to.x, e), y: lerp(v.from.y, v.to.y, e) });
    Body.setVelocity(this.body, { x: 0, y: 0 });
    // a whole pane bursts as the body goes through (its own noise and glass; the diver is never cut by it)
    if (k >= 0.3 && v.kind === 'window' && v.over.intact) v.over.shatter(v.dir, this, 1);
    // touch-down: dust, noise (less of it when he rolls), a small camera kick for the player
    if (!v.ladder && !v.landed && k >= (v.roll ? 1 : v.hoist ? 0.78 : 0.84)) {
      v.landed = true;
      for (const sd of [-1, 1]) w.particles.smoke(this.x - s * sd * 6, this.y + c * sd * 6, 1, 2, { speed: 22, size: 3, life: 0.45 });
      w.noise(this.x, this.y, this.isPlayer ? (v.roll ? PLAYER.roll.noise : LAND_NOISE) : 0, this);
      if (this.isPlayer) { w.shake(0.05); w.camera.push(c * 1.5, s * 1.5); }
    }
    if (k < 1) return true;
    if (v.roll) { this.startRoll(v); return this.updateRoll(dt, v); }
    this.endVault(v, (v.m1 * v.dist) / (v.dur * 60));
    return false;
  }

  // one frame up or down a ladder: returns how far along the move the body is. Both hands are on it: the facing is
  // held on the ladder. Each step on a rung rings a little and is heard a little way.
  climbLadder(v, k) {
    const L = v.ladder, at = ladderAt(L, k), w = this.world;
    this.angle += angDiff(this.angle, L.face) * ladderGrip(at.u);
    if (at.i !== L.i) {
      const first = L.i === -2;
      L.i = at.i;
      if (at.top && (L.up || first)) w.sound('ledge', this.x, this.y, 0.6); // over the edge of the roof
      else if (at.i >= 0 && !at.top) {
        w.sound('rung', this.x, this.y, 0.7);
        w.noise(this.x, this.y, this.isPlayer ? RUNG_NOISE : 0, this);
      }
    }
    return (at.q - L.q0) / (L.q1 - L.q0 || 1);
  }

  // the feet touch the ground after a drop: a shoulder roll on along the move, as far as there is room for
  startRoll(v) {
    const R = PLAYER.roll, w = this.world;
    const len = rollRoom(w, this, this.x, this.y, v.dir, R.dist);
    const dur = R.dur * (0.7 + (0.3 * len) / R.dist);
    v.rolling = { t: 0, dur, len, from: { x: this.x, y: this.y }, m0: 1.25, m1: R.exit, side: Math.random() < 0.5 ? -1 : 1, up: false };
    // back on the ground: bodies, furniture and doors stop him again
    this.body.collisionFilter = { ...this.body.collisionFilter, mask: MASK.CHAR };
    w.sound('roll', this.x, this.y, 0.8);
  }

  // the roll is driven by velocity: the physics still stops it at whatever moved into the way since it was probed
  updateRoll(dt, v) {
    const r = v.rolling, w = this.world;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur), e = hermite(k, r.m0, r.m1);
    const c = Math.cos(v.dir), s = Math.sin(v.dir), n = Math.max(dt * 60, 1e-3);
    const vx = clamp((r.from.x + c * r.len * e - this.x) / n, -4, 4), vy = clamp((r.from.y + s * r.len * e - this.y) / n, -4, 4);
    this.vel = { x: vx, y: vy };
    Body.setVelocity(this.body, this.vel);
    // the feet find the floor again: a second puff where he comes up
    if (!r.up && k >= 0.7) {
      r.up = true;
      w.particles.smoke(this.x + c * 5, this.y + s * 5, 2, 2, { speed: 18, size: 3, life: 0.4 });
      w.sound('rollUp', this.x, this.y, 0.7);
    }
    if (k < 1) return true;
    this.endVault(v, (r.m1 * r.len) / (r.dur * 60));
    return false;
  }

  // back on his feet: collisions as usual, the exit speed (px/step along the move) handed back to the run
  endVault(v, sp) {
    this.vaulting = null;
    if (v.kind === 'window') this.glassSafe = 0.4;
    this.body.collisionFilter = { ...this.body.collisionFilter, mask: MASK.CHAR };
    this.vel = { x: Math.cos(v.dir) * sp, y: Math.sin(v.dir) * sp };
    Body.setVelocity(this.body, this.vel);
  }

  dropWeapon(angle, speed = 2) {
    if (!this.weapon) return;
    const w = this.world;
    const it = new WeaponItem(w, this.weapon.type, this.weapon.mag,
      this.x, this.y, rand(0, 6.28), Math.cos(angle) * speed, Math.sin(angle) * speed, rand(-0.3, 0.3));
    it.wear = this.weapon.wear;
    w.addItem(it);
    this.weapon = null;
  }

  // ---------------- rendering ----------------
  draw(ctx) {
    if (this.knocked > 0) { drawDown(ctx, this, this.pose); return; }
    const P = standPose(this, this.pose);
    // a slide can chain into a vault: the vault blends out of whatever the slide pose was
    if (this.slideAnim) slidePose(this, P, this.pose2);
    if (this.vaulting) vaultPose(this, P, this.pose2);
    if (this.sit > 0) sitPose(this, P, this.pose2);
    if (this.trunkOpen) trunkPose(this, P, this.pose2);
    if (this.execution) execPose(this, P, this.pose2);
    if (this.doorHand) doorHandPose(this, P);
    // the weapon's trail through a blow, drawn over the lighting (fx/CombatFx.js)
    if (this.swing > 0) sampleSmear(this, P, this.def, feelOf(this.def).smear, this.strike >= 2 && this.def.hold === 'melee');
    this.noteMuzzle(P);
    drawPose(ctx, this, P);
  }
}
