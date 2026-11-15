// What a shot does to the man holding the gun, from his recoil clock r (1 at the shot, falling to 0 at the family's
// `rate` a second: Character.fire / baseUpdate) and the family's `recoil` profile (data/feel.js). The hands snap back
// on r^ease and the muzzle jumps (a pistol's flips and dips a little past rest on its way back: `over`); the body
// takes the shove on the slower linear clock, the gun shoulder driven back, the body giving under a heavy round; a
// machine pistol chatters in the hands while it runs. Pure numbers in pose px / rad, DOM-free (tests/recoil.test.mjs).
const OUT = { hands: 0, flip: 0, rise: 0, torso: 0, rock: 0, sink: 0, elbow: 0, bx: 0, by: 0 };

// spec: a FEEL recoil entry, r: the clock, t: the world's time (s), seed: a per-man phase -> OUT (reused)
export function recoilAt(spec, r, t = 0, seed = 0, out = OUT) {
  r = Math.max(0, Math.min(1, r));
  const k = r ** spec.ease, u = 1 - r;
  // the way back carries the muzzle a little past rest before it settles (0 at the shot and at rest)
  const dip = spec.over * Math.sin(Math.PI * u) * u;
  out.hands = spec.hands * k;
  out.flip = spec.flip * (k - dip);
  out.rise = spec.rise * k;
  out.torso = spec.torso * r;
  out.rock = spec.rock * r;
  out.sink = spec.sink * r;
  out.elbow = spec.elbow * k;
  const b = spec.buzz * r;
  out.bx = b ? b * Math.sin(t * spec.hz + seed) : 0;
  out.by = b ? b * Math.sin(t * spec.hz * 1.37 + seed * 2.1) * 0.8 : 0;
  return out;
}
