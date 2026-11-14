// How a guard carries his weapon. `stow` 1 = put away (a pistol or a knife on the hip, anything long across the
// back, both hands free) .. 0 = in hand; `lower` 1 = held low, not pointing at anyone .. 0 = raised on a target.
// Numbers only: entities/CharacterAnim.js turns them into a pose.
import { AI } from '../Config.js';

const toward = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

// calm: nothing is up (put it away); aiming: he has a target (raise it); long: a two-handed gun, slower to bring round
export function carry(ch, calm, aiming, long, dt, cfg = AI.carry) {
  ch.stow = toward(ch.stow, calm ? 1 : 0, dt / (calm ? cfg.holster : long ? cfg.unsling : cfg.draw));
  ch.lower = toward(ch.lower, aiming ? 0 : 1, dt / cfg.raise);
}

// far enough out of its holster to be fired
export const inHand = (ch, cfg = AI.carry) => ch.stow <= cfg.ready;
