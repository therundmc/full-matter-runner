// The small leaks and vapours of a lived-in room (SEEPS in data/seeps.js): a prop that drips to the floor (a washer,
// a keg on tap, an ice bin: drops poured into systems/Liquids.js, held back once the puddle at its foot is deep
// enough, done once it is empty), one that fumes (a simmering pot, a dryer's vent: steam into the air of
// systems/Smoke.js; a soldering iron: a cigarette's thread), a loose vessel that slops over when it is shoved (a mop
// bucket). A prop has one by its def (`seep`) or by the level (prop option `seep`, world/Level.js); it stops for good
// when its prop is destroyed. Looks and a little wet floor: no sound of its own but the bucket's splash. DOM-free.
import { SEEPS } from '../data/seeps.js';

const { Body } = Matter;

export default class Seeps {
  constructor(world, cfg = SEEPS, rand = Math.random) {
    this.world = world;
    this.cfg = cfg;
    this.rand = rand;
    this.list = null; // [{ prop, def, t, left, on, wait }], found at the first step (props are built after the systems)
  }

  between([a, b]) { return a + (b - a) * this.rand(); }

  // the props that seep, each with its own clock (never two dripping in step)
  find() {
    this.list = [];
    for (const p of this.world.props) {
      const def = this.cfg[p.seep || p.def.seep];
      if (!def) continue;
      const s = { prop: p, def, t: 0, left: Infinity, on: 0, wait: 0 };
      if (def.drip) { s.t = this.between(def.drip.every) * this.rand(); s.left = def.drip.most ?? Infinity; }
      if (def.slosh) s.left = def.slosh.hold;
      if (def.fume?.puff) s.on = this.between(def.fume.puff) * this.rand();
      this.list.push(s);
    }
  }

  // a point of the prop (px from its centre, its own axes) in the world
  at(p, [lx, ly]) {
    const o = p.centre ? p.centre() : p, a = p.body?.angle || 0, c = Math.cos(a), s = Math.sin(a);
    return { x: o.x + lx * c - ly * s, y: o.y + lx * s + ly * c };
  }

  // what is left in the thing a prop drips or slops from (px2; Infinity: plumbed), null: it does not seep
  left(prop) {
    const s = this.list?.find((q) => q.prop === prop);
    return s ? s.left : null;
  }

  update(dt) {
    if (!this.list) this.find();
    for (const s of this.list) {
      if (s.prop.dead) continue;
      if (s.def.drip) this.drip(s, dt);
      if (s.def.fume) this.fume(s, dt);
      if (s.def.slosh) this.slosh(s, dt);
    }
  }

  // one drop when it is due, unless the puddle at its foot is already as deep as it gets or the thing is empty
  drip(s, dt) {
    const d = s.def.drip, L = this.world.liquids;
    if ((s.t -= dt) > 0) return;
    s.t = this.between(d.every);
    if (!L || s.left <= 0) return;
    const q = this.at(s.prop, d.at), wet = L.at(q.x, q.y);
    if (wet && wet.depth >= d.cap) return;
    const out = Math.min(d.drop, s.left);
    L.feed(q.x, q.y, out, d.kind, d.r);
    L.ripple(q.x, q.y);
    s.left -= out;
  }

  // steam in breaths (or steady), or the thread off something left burning
  fume(s, dt) {
    const f = s.def.fume, air = this.world.smoke;
    if (!air) return;
    const q = this.at(s.prop, f.at);
    if (f.kind === 'thread') { air.wisp(s, q.x, q.y, dt, f.every); return; }
    if (f.puff) {
      s.on -= dt;
      if (s.on < -f.puff[1]) s.on = f.puff[0];
      if (s.on <= 0) return;
    }
    air.emit('steam', q.x, q.y, f.rate, dt, f.r);
  }

  // shoved hard enough, it slops a share of what it holds the way it goes
  slosh(s, dt) {
    const d = s.def.slosh, b = s.prop.body;
    if ((s.wait -= dt) > 0 || s.left < 1 || !b || Body.getSpeed(b) < d.speed) return;
    const v = Body.getVelocity(b), a = Math.atan2(v.y, v.x), out = Math.max(s.left * d.share, Math.min(s.left, 40));
    const x = s.prop.x + Math.cos(a) * d.r, y = s.prop.y + Math.sin(a) * d.r;
    s.left -= out;
    s.wait = d.gap;
    this.world.events.emit('spill', { x, y, kind: d.kind, area: out, a });
    this.world.particles?.drops?.(x, y, a, 0.6, 6, 'rgba(110,160,200,0.16)', 70, 4, false);
    this.world.sound?.('splash', x, y, 0.35, { pitch: 1.2 });
  }
}
