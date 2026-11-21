// The pursuers' attacks, one at a time and told (systems/Pursuit.js P: its state; CHASE.pursuit.attack / ram /
// block): whose turn (nextAttack: a told shot, a ram, a told shot, a brake...), a RAM from abreast (its lamps flash
// and it draws away, then swipes at his flank), a BRAKE from ahead in his lane (its brake lights, then it drops back
// onto his nose); the told shot is the gunman's (pursuit/gunman.js). DOM-free.
import { dice } from '../Rng.js';
import { CHASE } from '../../data/chase.js';

// WHOSE TURN (C.attack): the attacks come one at a time, in a rhythm: a told shot, a ram, a told shot, a brake in his
// lane... `turn`: how many have been made; can: { shot, ram, brake } which of them somebody could make now. The kind
// due if it can be made, else the next one in the round that can; null: nobody can
export function nextAttack(turn, can, C = CHASE.pursuit) {
  const R = C.attack.round;
  for (let i = 0; i < R.length; i++) { const k = R[(turn + i) % R.length]; if (can[k]) return k; }
  return null;
}

// A ram or a brake under way, t s in: 'wind' (told: C.ram.wind / C.block.wind s of it), 'go', or null (over)
export function attackPhase(kind, t, C = CHASE.pursuit) {
  const A = kind === 'ram' ? C.ram : C.block;
  return t < A.wind ? 'wind' : t < A.wind + A.dur ? 'go' : null;
}

// in the chase, driven, on the picture, in its slot `settle` s, not keeping its distance, nothing else told
function ready(P, car, tg, slot, settle) {
  return !!tg?.car && car.state === 'chase' && !car.dummy && !car.bend && car.driver && car.slot === slot && car.hurt <= 0 && car.stun <= 0
    && car.settled >= settle && car.chaseT >= P.G.grace && P.onScreen(car.v) && !P.busy(tg);
}

// abreast of him: a swipe at his flank (a blocker keeps to his lane; a gunner rams less readily: `shy` s more)
export function canRam(P, car, tg) { return car.style !== 'blocker' && ready(P, car, tg, 'abreast', P.C.ram.settle + (car.style === 'gunner' ? P.C.ram.shy : 0)); }

// ahead of him in his own lane: it brakes onto his nose
export function canBlock(P, car, tg) { return ready(P, car, tg, 'ahead', P.C.block.settle) && Math.abs(car.v.y - tg.y) < P.C.settle * 2; }

// It starts, told first: the ram by its lamps flashing and the car drawn away from him (stepAttack, want), the
// brake by its brake lights; `side`: the way the swipe goes (-1: -y)
export function startAttack(P, car, kind, tg) {
  const w = P.world, v = car.v;
  P.attack = { car, kind, t: 0, side: Math.sign(tg.y - v.y) || 1, hit: false, flash: 0, from: Math.max(0, tg.vel.x) };
  w.sound('tellClick', v.x, v.y, 0.8);
  w.sound(kind === 'ram' ? 'tyreSkid' : 'lorryBrake', v.x, v.y, 0.5);
  w.events.emit('pursuerTell', { car: v, kind });
}

// the attack over (made, or the car thrown off it): the next one after C.attack.cool s
export function endAttack(P) {
  const A = P.attack;
  if (!A) return;
  const v = A.car.v;
  v.brake = 0;
  v.roll = 0;
  if (A.car.state !== 'wrecked' && !v.exploded) v.lightsOut = false;
  A.car.ram = 0;
  A.car.settled = 0;
  P.attack = null;
  P.cool = dice(P.world).rand(...P.C.attack.cool);
}

// its clock, and how it is told: winding up a ram, its lamps flash (off `flash` s in every two) and its body leans
// away from him, then into the swipe; over (attackPhase), thrown off it or out of the chase: the next one's turn
export function stepAttack(P, dt, tg) {
  const A = P.attack;
  if (!A) return;
  const car = A.car, v = car.v, C = P.C;
  A.t += dt;
  const phase = attackPhase(A.kind, A.t, C);
  if (!phase || !tg || car.state !== 'chase' || car.stun > 0 || car.bend || P.world.drive?.bend || v.exploded || car.toll) { endAttack(P); return; }
  if (A.kind !== 'ram') return;
  v.lightsOut = phase === 'wind' && Math.floor(A.t / C.ram.flash) % 2 === 1;
  v.roll = (phase === 'wind' ? -1 : 1) * A.side * C.ram.lean;
  if (phase === 'go' && !A.went) { A.went = true; P.world.sound('vanShove', v.x, v.y, 0.7); }
}
