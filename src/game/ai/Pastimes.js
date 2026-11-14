// What people do at their spot in a bar while all is calm. Guards with a job (level.jobs) and posted civilians
// (level.ambient.patrons) share them. Timing only: the drawing is in render/PastimeArt.js.
//   pool   lining up shots over the table, one stroke per cycle     cue     waiting for his turn, cue upright
//   cards  a hand of cards held up                                  drink   a glass, raised now and then
//   watch  sitting back, hands on the knees                         dance   arms waving, steps around her spot
const CYCLE = 5;     // s between two pool strokes
const STRIKE = 0.8;  // share of the cycle at which the cue hits the ball
const SIP = 7;       // s between two sips

const frac = (v) => v - Math.floor(v);

// true when a pool stroke lands between t0 and t1 (s); seed shifts each player's rhythm
export function struck(t0, t1, seed) {
  return Math.floor(t0 / CYCLE + seed - STRIKE) !== Math.floor(t1 / CYCLE + seed - STRIKE);
}

// px the cue is pushed along its line: small aiming strokes, drawn back, shot through, held, back in place
export function cueShift(t, seed) {
  const u = frac(t / CYCLE + seed);
  if (u < 0.62) return Math.sin(u * CYCLE * 4.5) * 1.6 * Math.min(1, (0.62 - u) * 8) - 1;
  if (u < 0.77) return -1 - 4 * (u - 0.62) / 0.15;
  if (u < STRIKE) return -5 + 12 * (u - 0.77) / 0.03;
  if (u < 0.9) return 7;
  return 7 - 8 * (u - 0.9) / 0.1;
}

// 0..1: how far the glass is raised to the lips
export function sip(t, seed) {
  const u = frac(t / SIP + seed);
  return u < 0.2 ? Math.sin((Math.PI * u) / 0.2) : 0;
}
