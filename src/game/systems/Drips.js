// Water that drips on the floor (LIQUIDS.drips in data/liquids.js): the weeping joint of a water heater, a pail that
// has filled under a leak in the ceiling... A prop whose def says `drips: { at: [x, y], as: '<name>' }` (the point in
// its own px, a LIQUIDS.drips entry) lets a drop fall there every few seconds for as long as it stands: each is a
// little liquid poured on the floor (systems/Liquids.js: it spreads, wets soles, is held by walls, dries), a ring
// where it lands in what already lies there, and no more of it once the floor at its foot is `cap` films deep. The
// prop moved, its drops fall where it is now; broken, it drips no more (what it held is its wreck's business:
// data/destruction.js `leak`, `gush`). DOM-free.
import { LIQUIDS } from '../data/liquids.js';

export default class Drips {
  constructor(world, cfg = LIQUIDS.drips, rand = Math.random) {
    this.world = world;
    this.cfg = cfg;
    this.rand = rand;
    this.srcs = null; // { p (the prop), S (its LIQUIDS.drips entry), t (s to its next drop), n (drops fallen) },
                      // looked up at the first step (the props are built after the systems)
  }

  // the world point a prop's drops fall at
  foot(p) {
    const [dx, dy] = p.def.drips.at, o = p.centre ? p.centre() : p, a = p.body?.angle || 0, c = Math.cos(a), s = Math.sin(a);
    return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c };
  }

  update(dt) {
    const w = this.world, L = w.liquids;
    if (!L) return;
    this.srcs ||= w.props.filter((p) => p.def.drips && this.cfg[p.def.drips.as])
      .map((p) => { const S = this.cfg[p.def.drips.as]; return { p, S, t: S.every[0] * this.rand(), n: 0 }; });
    for (const q of this.srcs) {
      if (q.p.dead || q.p.parts) continue;
      if ((q.t -= dt) > 0) continue;
      const S = q.S, f = this.foot(q.p), wet = L.at(f.x, f.y);
      q.t += S.every[0] + (S.every[1] - S.every[0]) * this.rand();
      q.n++;
      L.ripple(f.x, f.y);
      w.sound?.('dripPlink', f.x, f.y, 0.5);
      if (!wet || wet.depth < S.cap) L.feed(f.x, f.y, S.area, S.kind, S.r);
    }
  }
}
