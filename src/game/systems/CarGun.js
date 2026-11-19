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
// himself (their owner). DOM-free.
import { CHASE } from '../data/chase.js';
import { angDiff, clamp, spread } from '../../engine/math.js';
import Projectile from '../entities/Projectile.js';
import { muzzleFlash } from '../fx/CombatFx.js';

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
  // drive: the drive he is at (its van, his seat in it: sprite px)
  constructor(world, van, seat) {
    this.world = world;
    this.van = van;
    this.seat = seat;
    this.arc = arcOf(van.w, seat[0]);
    this.cool = 0;     // s before the next round
    this.aimed = null; // { a, ok }: where the hand points this step, and whether it can (the cursor, ui)
  }

  get player() { return this.world.player; }

  // the gun in his hand fires from the car (a gun, held in one hand)
  get armed() {
    const p = this.player, d = p.weapon && p.def;
    return !!d && d.kind === 'gun' && d.hold !== 'two';
  }

  get open() { return !!this.van.m.cabin; }

  // where the hand turns from (world point): the seat in an open car, out of the driver's window in a closed one
  root() { return this.van.toWorld(this.seat[0], this.open ? this.seat[1] : -CHASE.gun.reach); }

  // the gun's muzzle pointed along a (world point)
  hand(a) {
    const o = this.root(), r = this.open ? CHASE.gun.arm : 4;
    return { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
  }

  // the way from the hand's root to the aim, and whether it is in his arc (an open car: all round but behind him, over
  // its windscreen and across its other seat; a closed one: out of his window)
  aimAt(aim) {
    const v = this.van, o = this.root(), a = Math.atan2(aim.y - o.y, aim.x - o.x);
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
    if (pull && this.aimed?.ok) this.fire(d);
  }

  // a round out of it, at the gun's own rate; none counted
  fire(d) {
    const w = this.world, p = this.player, a = this.aimed.a;
    if (this.cool > 0) return false;
    const m = this.hand(a), from = this.van.toWorld(this.seat[0], this.seat[1]), cv = Body.getVelocity(this.van.body);
    for (let i = 0; i < d.pellets; i++) {
      const pr = new Projectile(w, m.x, m.y, a + (d.spread + CHASE.gun.spread) * spread(), d.speed, {
        team: p.team, owner: p, weapon: d, life: d.range ?? 1.1, pen: d.pen ?? 10, from,
      });
      pr.ignore.add(this.van); // never his own car
      pr.vx += cv.x * 60; // the round carries the car's speed (a car alongside is hit where it is aimed at)
      pr.vy += cv.y * 60;
      w.addProjectile(pr);
    }
    muzzleFlash(w, m.x, m.y, a, d, null);
    w.sound(d.sound, m.x, m.y, 1);
    if (d.noise) w.noise(m.x, m.y, d.noise, p, 'gunshot');
    this.cool = d.rate;
    w.shake(clamp(d.shake ?? 0.15, 0, 0.3));
    return true;
  }
}
