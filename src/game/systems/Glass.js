// How a pane breaks (pure rules, no DOM): the shards it throws and what each of them can do to a body.
// Three sizes: a few 'big' daggers that open a throat while they still fly, 'mid' shards that only knock a guard
// down bleeding, and 'small' crumbs that are harmless. A shard at rest never hurts (Debris drops `harm` once slow).

const BASE_SPEED = 400; // px/s of a shard thrown by a plain bullet (x power: buckshot, blasts)

// n: how many per pane, v: share of BASE_SPEED, cone: half-angle around the hit (rad), kg, z / vz: fake height (px) and
// upward speed (px/s) it leaves the frame with, knock / lethal: speed (px/step) above which it knocks down / kills
export const SHARDS = {
  big: { n: [3, 4], v: [0.75, 1.1], cone: 0.35, kg: 0.45, z: [8, 14], vz: [10, 70], knock: 2.2, lethal: 3.6 },
  mid: { n: [4, 6], v: [0.6, 1.15], cone: 0.5, kg: 0.2, z: [5, 12], vz: [0, 60], knock: 2.6, lethal: Infinity },
  small: { n: [6, 8], v: [0.4, 1.2], cone: 0.6, kg: 0.1, z: [3, 10], vz: [0, 50] },
};

// The shards of one pane hit with `power` (1 = a bullet). `rnd` = random source in [0, 1).
// Returns [{ size, variant, along, spread, speed, z, vz, spin }]: `along` in [-0.5, 0.5] of the pane width,
// `spread` = angle off the hit direction (rad), `speed` in px/s.
export function shardBurst(power = 1, rnd = Math.random) {
  const between = ([a, b]) => a + (b - a) * rnd();
  const out = [];
  for (const [size, s] of Object.entries(SHARDS)) {
    const n = Math.floor(between([s.n[0], s.n[1] + 1]));
    for (let i = 0; i < n; i++) {
      out.push({
        size, variant: Math.floor(rnd() * 8), along: rnd() - 0.5, spread: (rnd() * 2 - 1) * s.cone,
        speed: between(s.v) * BASE_SPEED * power, z: between(s.z), vz: between(s.vz), spin: (rnd() * 2 - 1) * 0.6,
      });
    }
  }
  return out;
}

// Debris `harm` of a flying shard (null = harmless). Big ones cut anyone but whoever broke the pane (`breaker`),
// the player included, and kill like a blade (cause 'slash': arterial wound); mid ones only bother guards.
export function shardHarm(size, breaker = null) {
  const s = SHARDS[size];
  if (!s.knock) return null;
  const harm = { kind: 'cut', knock: s.knock, lethal: s.lethal, ignore: breaker };
  if (size === 'big') Object.assign(harm, { all: true, cause: 'slash', by: { gore: 0.6, wound: 'slash' }, owner: breaker });
  return harm;
}
