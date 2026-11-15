// The jukebox turned up (E at a `jukebox` prop that is powered and on its record): for JUKEBOX.dur s it plays loud
// (level(); its own band stays off, the user found it horrible), its lights flash on the beat, and what is quieter than a
// door (footsteps, a body let down, a thing knocked over) is lost in it for the guards within `cover` px (Director:
// mask). Then it is back to its murmur. A blow knocks it off its record (systems/Gadgets.js), and that ends it.
// DOM-free.
import { JUKEBOX } from '../data/devices.js';
import { clamp } from '../../engine/math.js';

const playing = (p) => p && !p.dead && !p.dying && !p.sputter && !p.lightsOut && !p.unpowered;

// the radius a noise of `type` made at distance d from a loud jukebox is heard at
export function masked(radius, type, d, cfg = JUKEBOX) {
  return cfg.masked.includes(type) && d < cfg.cover ? radius * cfg.mask : radius;
}

export default class Jukebox {
  constructor(world, cfg = JUKEBOX) {
    this.world = world;
    this.cfg = cfg;
    this.loud = null; // { prop, t } while it is turned up
    this.next = 0;
    this.added = false;
  }

  // its spot, once the props are there (World, after the level is built; else at the first step)
  wire() {
    if (this.added) return;
    this.added = true;
    for (const p of this.world.props) {
      if (p.type !== 'jukebox') continue;
      this.world.uses?.add({ kind: 'jukebox', prop: p, r: 28, label: 'TURN IT UP',
        ok: () => !this.loud && this.world.time >= this.next && playing(p), use: () => this.crank(p) });
    }
  }

  crank(p) {
    const w = this.world;
    this.loud = { prop: p, t: 0, beat: 0 };
    w.sound('handle', p.x, p.y, 0.6);
    w.light(p.x, p.y, 90, '#ff5a9a', 0.2);
    // a guard close by does not like it, but nobody goes and turns it down
    const e = w.enemies.find((g) => g.alive && g.aware === 0 && Math.hypot(g.x - p.x, g.y - p.y) < this.cfg.cover);
    if (e) w.after(1.5, () => { if (e.alive) e.say('loud'); });
  }

  // how loud it is, 0..1 (0 when it plays its murmur)
  level() {
    const L = this.loud;
    if (!L) return 0;
    const fade = clamp(L.t / 0.6, 0, 1) * clamp((this.cfg.dur - L.t) / 1.5, 0, 1);
    return fade * (0.35 + 0.65 * this.world.gadgets.tune());
  }

  // the radius a noise is heard at, once the jukebox has had its say (Director.emit)
  mask(x, y, radius, type) {
    const L = this.loud;
    if (!L) return radius;
    return masked(radius, type, Math.hypot(x - L.prop.x, y - L.prop.y), this.cfg);
  }

  update(dt) {
    if (!this.added) this.wire();
    const L = this.loud;
    if (!L) return;
    const w = this.world;
    L.t += dt;
    if (!playing(L.prop) || L.t >= this.cfg.dur) {
      this.loud = null;
      this.next = w.time + this.cfg.again;
      return;
    }
    // its lights on the beat
    if ((L.beat -= dt) <= 0) {
      L.beat += this.cfg.beat;
      w.light(L.prop.x, L.prop.y + 6, 70, '#ff3a9a', this.cfg.beat * 0.5);
    }
  }
}
