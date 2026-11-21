// His gun out of the car at the wheel (level 2A, docs/LEVEL2.md; systems/Drive.js steps it). The mouse aims, the left
// click fires the gun in his hand (a one-handed gun: a long one stays down). AT THE WHEEL IT NEVER RUNS DRY (the
// user's call, 2026-11-19): no round is counted, nothing is reloaded, R does nothing; its magazine is as he got in
// with it when he gets out (ui/HUD.js shows no count). In an open car (a
// `cabin`: THE BOSS's convertible) the gun is at the end of his arm from the seat (`arm` px), the arm drawn by the car
// (his `riding.aim`, CharacterAnim.seatPose); in a closed one it is out of the driver's window, `reach` px out.
// His arc in an open car (inCone, CHASE.gun.cone): 125 degrees either side of the nose, 250 in all: out of his door,
// ahead over the low windscreen, across the passenger seat to his right, back along both flanks; the 110 degrees
// behind him stay out. In a closed car (arcOf / inArc): what a hand held CHASE.gun.reach px out of the driver's side
// (-y) can point at without his own car in the way: the driver's side and ahead, about 200 degrees.
// A click outside it does nothing (the cursor says so). His rounds never touch his own car (Projectile `ignore`) nor
// himself (their owner). They leave the muzzle of the gun AS DRAWN (hand: his seat pose's own gun, at people's
// scale), along it (a click while the arm is still coming up waits for it: `level`); the flash and the start of their
// streaks follow the muzzle where it is SEEN (drawnMuzzle: the car drawn on the picture's px, on one of its angles and
// on its springs, him with it), and the case is born at the port as drawn. DOM-free.
import { CAT } from '../Config.js';
import { CHASE } from '../data/chase.js';
import { CARFX } from '../data/carfx.js';
import { angDiff, clamp, spread, chance } from '../../engine/math.js';
import { sprite, spriteOpt, sw } from '../../engine/Assets.js';
import { MUZZLE_IN, onSprite } from '../entities/CharacterAnim.js';
import Projectile from '../entities/Projectile.js';
import Debris from '../entities/Debris.js';
import { muzzleFlash } from '../fx/CombatFx.js';
import { ejection, spentSound } from '../fx/Casings.js';
import { quality } from './Quality.js';

const { Body } = Matter;

// ---------------------------------------------------------------- pure
// [ahead, back]: rad past square out of the driver's side (-y) the hand can turn toward the nose and toward the tail
// with the car's body still clear of the line: the car w long, the seat sx from the tail, the hand `reach` px out
export function arcOf(w, sx, reach = CHASE.gun.reach, margin = CHASE.gun.margin) {
  return [Math.PI / 2 + Math.atan2(reach, w - sx) - margin, Math.PI / 2 + Math.atan2(reach, sx) - margin];
}

// is the way a (world) within the arc of a car at angle `car`? arc: arcOf's [ahead, back]
export function inArc(a, car, arc) {
  const off = angDiff(car - Math.PI / 2, a); // from square out of the driver's side: + toward the nose
  return off <= arc[0] && off >= -arc[1];
}

// an open car: is the way a (world) within `cone` ([left, right] rad) of the nose of a car at angle `car`?
export function inCone(a, car, cone = CHASE.gun.cone) {
  const off = angDiff(car, a); // from the nose: - toward the driver's side (-y), + across the passenger seat
  return off >= -cone[0] && off <= cone[1];
}

export default class CarGun {
  // drive: the drive he is at (its car, his seat in it: sprite px)
  constructor(world, car, seat) {
    this.world = world;
    this.car = car;
    this.seat = seat;
    this.arc = arcOf(car.w, seat[0]);
    this.cool = 0;     // s before the next round
    this.aimed = null; // { a, ok }: where the hand points this step, and whether it can (the cursor, ui)
  }

  get player() { return this.world.player; }

  // the gun in his hand fires from the car (a gun, held in one hand)
  get armed() {
    const p = this.player, d = p.weapon && p.def;
    return !!d && d.kind === 'gun' && d.hold !== 'two';
  }

  get open() { return !!this.car.m.cabin; }

  // where the hand turns from (world point): the seat in an open car, out of the driver's window in a closed one
  root() { return this.car.toWorld(this.seat[0], this.open ? this.seat[1] : -CHASE.gun.reach); }

  // The gun pointed along a, where the simulation has it (world points placed from the car's body): { x, y, a } its
  // muzzle and the way the barrel points, `port` its ejection port. In an open car it is the gun in his hand as the
  // car draws him (his seat pose taken now: CharacterAnim.seatPose, Character.muzzlePos / portPos); in a closed one
  // the hand out of the window (outOf). A man with no pose to take (a test's) fires from the end of an arm `arm` px.
  hand(a) {
    const p = this.player;
    if (!this.open) { const o = this.outOf(a); return { ...o.muzzle, port: o.port }; }
    if (!p.livePose) {
      const o = this.root(), r = CHASE.gun.arm, m = { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r, a };
      return { ...m, port: m };
    }
    p.livePose();
    const m = p.muzzlePos();
    m.port = p.portPos();
    return m;
  }

  // A closed car: his hand out of the window pointed along a and the gun in it, as render/PursuitArt.js draws them
  // (world points placed from the body): sh his shoulder in the window, hand, at: the gun's middle (CHASE.gun.out),
  // muzzle and port: the end of its barrel and its ejection port (weapons.js `bore`, `eject`), drawn at people's scale
  outOf(a) {
    const d = this.player.def, w = d.sprite ? sw(sprite(d.sprite)) : 0, [h, g] = CHASE.gun.out;
    const o = this.root(), c = Math.cos(a), s = Math.sin(a);
    const hand = { x: o.x + c * h, y: o.y + s * h }, at = { x: hand.x + c * g, y: hand.y + s * g };
    return { sh: this.car.toWorld(this.seat[0], 1), hand, at, muzzle: onSprite(d, w, at, a, w - MUZZLE_IN), port: onSprite(d, w, at, a, d.eject ?? d.grip ?? 0) };
  }

  // Where the muzzle is SEEN now, for what is drawn from it (its flash: fx/CombatFx.js; the start of a round's streak:
  // entities/Projectile.js `src`): the car is drawn on the picture's px, on one of its angles and on its springs, and
  // what is in it with it (Vehicle.carried / carriedAt). A draw's, never the simulation's; null with no gun out
  drawnMuzzle() {
    const p = this.player, v = this.car;
    if (!p.alive || !this.armed) return null;
    if (!this.open) return this.aimed?.ok ? v.carriedAt(this.outOf(this.aimed.a).muzzle) : null;
    // (his gun as it was drawn last, Character.muzzlePos, with him in the car's frame on its springs)
    if (p.riding?.v !== v) return null;
    return v.carriedAt(p.muzzlePos ? p.muzzlePos() : this.hand(this.aimed?.a ?? v.body.angle), ...(v.sag ?? [0, 0]));
  }

  // the way from the hand's root to the aim, and whether it is in his arc (an open car: all round but behind him, over
  // its windscreen and across its other seat; a closed one: out of his window)
  aimAt(aim) {
    const v = this.car, o = this.root(), a = Math.atan2(aim.y - o.y, aim.x - o.x);
    return { a, ok: this.open ? inCone(a, v.body.angle) : inArc(a, v.body.angle, this.arc) };
  }

  step(dt, input, aim) {
    const p = this.player;
    this.cool = Math.max(0, this.cool - dt);
    this.aimed = aim && this.armed ? this.aimAt(aim) : null;
    if (p.riding) p.riding.aim = this.aimed?.ok ? this.aimed.a : null; // his arm out with it (the car draws him)
    if (!this.armed) return;
    const d = p.def;
    const pull = d.auto ? input.mouseDown?.(0) : input.mouseHit?.(0);
    // (a click while his arm is still coming up is kept for it, until it fires or the aim leaves his arc)
    this.pull = !!this.aimed?.ok && (!!pull || (this.pull && !d.auto));
    if (this.pull && this.fire(d) !== null) this.pull = false;
  }

  // a round out of it, at the gun's own rate; none counted. Returns whether it fired, null while the gun is not yet
  // along the aim (the arm coming up: `level` rad off it at most), when it waits
  fire(d) {
    const w = this.world, p = this.player, a = this.aimed.a;
    if (this.cool > 0) return false;
    const m = this.hand(a);
    if (Math.abs(angDiff(m.a, a)) > CHASE.gun.level) return null;
    const from = this.car.toWorld(this.seat[0], this.seat[1]), cv = Body.getVelocity(this.car.body);
    for (let i = 0; i < d.pellets; i++) {
      const pr = new Projectile(w, m.x, m.y, a + (d.spread + CHASE.gun.spread) * spread(), d.speed, {
        team: p.team, owner: p, weapon: d, life: d.range ?? 1.1, pen: d.pen ?? 10, from, src: this,
      });
      pr.ignore.add(this.car); // never his own car
      pr.vx += cv.x * 60; // the round carries the car's speed (a car alongside is hit where it is aimed at)
      pr.vy += cv.y * 60;
      w.addProjectile(pr);
      w.game?.interp?.born(pr, m.x, m.y); // (drawn out of the muzzle, not a step ahead of it)
    }
    muzzleFlash(w, m.x, m.y, m.a, d, this);
    this.eject(d, m.port, m.a, cv);
    w.sound(d.sound, m.x, m.y, 1);
    if (d.noise) w.noise(m.x, m.y, d.noise, p, 'gunshot');
    this.cool = d.rate;
    w.shake(clamp(d.shake ?? 0.15, 0, 0.3));
    return true;
  }

  // the spent case out of the gun's port, to its right, carried with the car (fx/Casings.js): it arcs out over the
  // door or the bonnet, rings on the road and is left behind. A look: it meets walls only (never his own car, which
  // it leaves from inside), and the QUALITY option thins them (CARFX.casings of them at HIGH). It is born where the
  // port is SEEN, as the car will be drawn from where it is now (Vehicle.snapped, on its springs), under it by its
  // height (Debris draws it `lift` of that up the picture), and drawn from there (Interp.born)
  eject(d, port, a, cv) {
    const img = d.casing && spriteOpt('weapons/' + d.casing);
    if (!img || !chance(CARFX.casings * (quality().fx ?? 1))) return;
    const v = this.car, seen = this.open ? v.carriedAt(port, ...(v.sag ?? [0, 0]), v.snapped()) : v.carriedAt(port, 0, 0, v.snapped());
    const e = ejection(d, seen, a, { x: cv.x * 60, y: cv.y * 60 });
    const c = new Debris(this.world, img, e.x, e.y + e.z * e.spec.lift, e.angle, e.vx, e.vy, e.spin, {
      mask: CAT.WALL | CAT.EDGE, material: 'brass', air: 0.08, shadow: 0, kg: e.spec.kg, mu: e.spec.mu, bounce: 0.5, z: e.z, vz: e.vz, tumble: e.tumble,
      lift: e.spec.lift, hop: e.spec, tick: { name: 'shell', opts: { kind: spentSound(d), bounces: 1 } },
    });
    this.world.addDebris(c);
    this.world.game?.interp?.born(c.body, c.body.position.x, c.body.position.y, c.body.angle);
  }
}
