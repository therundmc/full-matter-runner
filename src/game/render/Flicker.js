// How bright a light is at a given time, by the kind of light it is (DOM-free, unit-tested): tubes that buzz,
// a broken lamp, a beat, a screen, a disco spot, the letters of a sign that spell themselves out, and the faults
// of a few neon tubes (data/atmosphere.js NEON): one that stutters now and then, one that is dying.
import { LIGHTING as L } from '../Config.js';
import { NEON } from '../data/atmosphere.js';
import { hash, lerpRange } from '../../engine/math.js';

function noise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }

function buzz(seed, t) {
  const dip = hash(Math.floor(t * 9 + seed * 13)) > 0.965 ? 0.45 : 1;
  return (0.9 + 0.1 * noise(t * 22 + seed)) * dip;
}

// a tube whose starter plays up: it buzzes like the others, and every few seconds it cuts out and back in a burst
function stutter(seed, t) {
  const S = NEON.stutter, period = lerpRange(S.every, hash(seed * 3.7)), u = t / period + hash(seed * 1.9);
  const n = Math.floor(u), into = (u - n) * period;
  if (into < lerpRange(S.burst, hash(n * 1.37 + seed))) return hash(Math.floor(t * S.rate) + seed * 13) > 0.45 ? 1 : S.low;
  return buzz(seed, t);
}

// a tube at the end of its life: dark for a while, a few strikes that do not catch, then it holds, shaky, and dies again
function dying(seed, t) {
  const D = NEON.dying, cycle = lerpRange(D.cycle, hash(seed * 5.1)), u = t / cycle + hash(seed * 2.3);
  const n = Math.floor(u), k = u - n, strike = 1 - D.dark - D.hold;
  if (k < D.dark) return D.low;
  if (k < D.dark + strike) {
    const tries = Math.round(lerpRange(D.tries, hash(n * 0.77 + seed))), s = ((k - D.dark) / strike) * tries;
    return s - Math.floor(s) < 0.22 ? 0.75 + 0.25 * hash(Math.floor(s) + n) : D.low;
  }
  const shaky = hash(Math.floor(t * 12 + seed * 7)) > 0.9 ? 0.55 : 1;
  return (0.82 + 0.18 * noise(t * 28 + seed)) * shaky;
}

// brightness multiplier of a flickering light at time t
export function flicker(kind, seed, t) {
  switch (kind) {
    case true: case 'buzz': return buzz(seed, t);
    case 'stutter': return stutter(seed, t);
    case 'dying': return dying(seed, t);
    case 'broken': {
      const cyc = 2.2 + (seed % 1) * 2.5, ph = (t + seed * 7) % cyc;
      if (ph < 0.7) return hash(Math.floor((t + seed) * 26)) > 0.55 ? 0.95 : 0.06;
      if (ph < 0.9) return 0.05;
      return 0.9 + 0.1 * noise(t * 30 + seed);
    }
    case 'pulse': {
      const b = ((t * L.bpm) / 60 + seed * 0.25) % 1;
      return 0.55 + 0.45 * (1 - b) * (1 - b);
    }
    case 'tv': return 0.55 + 0.45 * noise(t * 7 + seed * 5) * (hash(Math.floor(t * 5 + seed)) > 0.15 ? 1 : 0.4);
    case 'disco': return 0.7 + 0.3 * Math.sin(t * 5 + seed * 3);
    default: return 1;
  }
}

// Animated sign (`def.sign`): how bright letter i of n is. The letters come on one by one, hold, blink, go dark
// for a beat; the faulty one never quite settles.
export function signLevel(sign, i, seed, t) {
  const n = sign.letters.length, ph = (t + seed) % 7.5;
  let a = ph < n * 0.22 ? (ph >= i * 0.22 ? 1 : 0)
    : ph < 4.8 ? 1
    : ph < 5.7 ? Math.floor((ph - 4.8) / 0.15) % 2
    : ph < 7 ? 1 : 0;
  if (i === sign.faulty) a *= flicker('broken', seed, t);
  return a;
}

// which props get a fault (NEON.faults): Map prop -> kind. The same ones every time: candidates of each fault's
// types ranked by a hash of where they stand, a prop taken by one fault left to the next
export function pickFaults(props, faults = NEON.faults) {
  const out = new Map();
  faults.forEach((f, i) => {
    const types = new Set(f.types);
    props.filter((p) => types.has(p.type) && !out.has(p))
      .map((p) => [p, hash(p.x * 0.37 + p.y * 0.11 + i * 3.3)])
      .sort((a, b) => a[1] - b[1])
      .slice(0, f.count)
      .forEach(([p]) => out.set(p, f.kind));
  });
  return out;
}
