// The player's throw (THROW in data/feel.js): wound up while the button is held (its charge, its aim, LOCK's pull
// onto a man), let go, or the quick throw of a tap; the weapon in hand sent flying (entities/WeaponItem.js).
// Functions of the player (`me`), DOM-free.
import { rand, clamp, lerp } from '../../../engine/math.js';
import WeaponItem from '../WeaponItem.js';
import { lockTarget } from '../../systems/AimCue.js';
import { AIM } from '../../data/aim.js';
import { MOMENTS, THROW } from '../../data/feel.js';

// The right click held: the arm drawn back, the throw aimed (the mark: systems/AimCue.js throwCue), charged over
// THROW.charge s; let go, it flies (release). Let go within THROW.tap s it is the quick throw. A wind-up the game
// was paused under goes only if the button is still down when play comes back (interrupt).
export function updateThrowHold(me, dt, input) {
  const W = me.throwHold;
  if (!me.armed && !me.shield) { me.throwHold = null; return; }
  if (input.mouseDown(2)) { W.t += dt; W.paused = false; return; }
  if (W.paused) { me.throwHold = null; return; }
  me.release();
}

// the game paused (Game): a throw wound up waits to see whether the button is still held
export function interrupt(me) { if (me.throwHold) me.throwHold.paused = true; }

// 0..1: how far the throw wound up is charged (0 within the tap)
export function throwCharge(me, W = me.throwHold) {
  return W ? clamp((W.t - THROW.tap) / (THROW.charge - THROW.tap), 0, 1) : 0;
}

// the way the throw goes { a, lock }: straight at the man LOCK holds (within its cone and THROW.lock px), else
// along his aim
export function throwAim(me) {
  const w = me.world;
  const lock = lockTarget(w, me.team, me.x, me.y, me.angle, AIM.lock.cone, THROW.lock);
  return { a: lock ? Math.atan2(lock.y - me.y, lock.x - me.x) : me.angle, lock };
}

export function release(me) {
  const k = me.throwCharge(), { a } = me.throwAim();
  me.throwHold = null;
  me.angle = a;
  if (me.shield) me.throwShield(k);
  else me.throwWeapon(false, k);
}

// power = true: the angry "out of bullets" John Wick throw (faster, spinning, a beat of slow motion); k: the charge
// of a throw wound up (0: the quick throw)
export function throwWeapon(me, power = false, k = 0) {
  const w = me.world, a = me.angle, blade = me.def.swing === 'blade';
  const sp = power ? THROW.angry.speed : lerp(THROW.speed[0], THROW.speed[1], k);
  const spin = blade && !power ? lerp(THROW.spin[0], THROW.spin[1], k) : power ? THROW.angry.spin : rand(0.4, 0.7);
  const it = new WeaponItem(w, me.weapon.type, me.weapon.mag, me.x + Math.cos(a) * THROW.hand, me.y + Math.sin(a) * THROW.hand,
    a, Math.cos(a) * sp + me.vel.x, Math.sin(a) * sp + me.vel.y, spin * (Math.random() < 0.5 ? -1 : 1), me);
  it.wear = me.weapon.wear;
  it.charge = k;
  it.setBare(me.weapon.bare);
  w.addItem(it);
  me.weapon = null;
  me.reloading = 0;
  me.cooldown = 0.15;
  me.throwT = me.throwDur;
  w.sound('throw', me.x, me.y, power ? 1 : 0.8 + 0.2 * k, { weapon: it.type });
  // the man on its line, if any (systems/ThrowBeat.js follows it to him)
  const target = lockTarget(w, me.team, me.x, me.y, a, THROW.line, THROW.lock);
  w.events.emit('throw', { thrower: me, item: it, target, charge: k });
  if (power) { w.slowmo(...MOMENTS.throw.slowmo); w.shake(MOMENTS.throw.shake); }
}
