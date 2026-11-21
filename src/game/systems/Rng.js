// The world's GAMEPLAY dice (world.rng, made with the world): every roll that decides what happens (which slots the
// pursuers hold, whether a wreck catches fire, how long a guard takes to react, which pastime he picks...) is drawn
// from it; what only looks (sparks, smoke, dents, splinters) keeps Math.random. So a change to the looks never shifts
// the game a QA seed plays: the QA robot seeds Math.random before the world is made, and the world's seed is drawn
// from it once, then left alone. DOM-free.
import { seeded } from '../../engine/math.js';

// dice from a seed: next() 0..1, rand(a, b), chance(p), spread() (-1..1, bunched toward 0: engine/math.js spread's)
export function makeRng(seed) {
  const next = seeded(seed);
  return {
    next,
    rand: (a = 0, b = 1) => a + next() * (b - a),
    chance: (p) => next() < p,
    spread: () => (next() + next() + next() - 1.5) / 1.5,
  };
}

// the dice of a new world: its seed drawn from Math.random (the QA's seed reaches it so)
export const worldRng = () => makeRng((Math.random() * 2 ** 32) >>> 0);

// Math.random's, for a world that has no dice of its own (a test's stub)
const LOOSE = {
  next: () => Math.random(),
  rand: (a = 0, b = 1) => a + Math.random() * (b - a),
  chance: (p) => Math.random() < p,
  spread: () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5,
};

// the gameplay dice of world w
export const dice = (w) => w?.rng ?? LOOSE;
