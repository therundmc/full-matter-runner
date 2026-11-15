// The street's phone booth and the bar's phones (level `phones`: { booth: [col, row], rings: [[col, row, deg], ...] }:
// each phone hangs on a wall, deg the way it faces into the room). E at the booth calls the bar: a moment of dialling,
// then one of its phones rings (they take turns, a call each). The calm guard nearest to it leaves what he is at,
// walks over and answers, his back to the room, a few seconds on the line with nobody, then goes back to his post:
// a lure. Nobody near enough, or the house on its guard: it rings out. DOM-free.
import { TILE } from '../Config.js';
import { PHONES } from '../data/devices.js';
import { rand } from '../../engine/math.js';

const STAND = 15; // px in front of the phone he answers it from

// the guard who answers a phone at (x, y): the nearest one free to go (Enemy.sendable) within `near` px, or null
export function answerer(guards, x, y, near) {
  let best = null, bd = near;
  for (const e of guards) {
    if (!e.sendable) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export default class Phones {
  constructor(world, def = null, cfg = PHONES) {
    this.world = world;
    this.cfg = cfg;
    this.call = null;  // { phone, t, guard, picked } while it rings / is answered
    this.calls = 0;
    this.next = 0;     // world time the booth can call again
    this.dialT = -1;   // s left of the dialling
    if (!def) return;
    this.booth = { x: def.booth[0] * TILE, y: def.booth[1] * TILE };
    this.phones = def.rings.map(([c, r, deg = 0]) => {
      const a = (deg * Math.PI) / 180, x = c * TILE, y = r * TILE;
      // he stands in front of it, facing it
      return { x, y, spot: { x: x - Math.sin(a) * STAND, y: y + Math.cos(a) * STAND, face: a - Math.PI / 2 }, prop: undefined };
    });
    world.uses?.add({ kind: 'phone_booth', x: this.booth.x, y: this.booth.y, r: 32, label: 'CALL THE BAR',
      ok: () => !this.call && this.dialT < 0 && world.time >= this.next && this.boothLive(), use: () => this.dial() });
  }

  boothLive() {
    if (this.boothProp === undefined) {
      this.boothProp = this.world.props.find((p) => p.type === 'phone_booth' && Math.hypot(p.x - this.booth.x, p.y - this.booth.y) < TILE) || null;
    }
    return !!this.boothProp && !this.boothProp.dead && !this.boothProp.offHook;
  }

  // a phone of the bar still on its wall
  live(ph) {
    if (ph.prop === undefined) ph.prop = this.world.props.find((p) => p.type === 'wall_phone' && Math.hypot(p.x - ph.x, p.y - ph.y) < TILE) || null;
    return !!ph.prop && !ph.prop.dead && !ph.prop.dying;
  }

  // is guard g on his way to the phone, or at it?
  onIt(g, ph) { return !!g.errand && g.errand.x === ph.spot.x && g.errand.y === ph.spot.y; }

  // the player feeds a coin and dials
  dial() {
    this.dialT = this.cfg.dial;
    this.next = this.world.time + this.cfg.again;
    this.world.sound('dial', this.booth.x, this.booth.y, 1);
  }

  update(dt) {
    if (!this.phones) return;
    const w = this.world, c = this.cfg;
    if (this.dialT >= 0 && (this.dialT -= dt) < 0) {
      const live = this.phones.filter((ph) => this.live(ph));
      if (live.length) this.call = { phone: live[this.calls++ % live.length], t: 0, ring: 0, guard: null, picked: false };
    }
    const k = this.call;
    if (!k) return;
    k.t += dt;
    const ph = k.phone, g = k.guard;
    if (!this.live(ph)) { this.call = null; return; }
    if (!k.picked) {
      if ((k.ring -= dt) <= 0) {
        k.ring += c.period;
        w.sound('phoneRing', ph.x, ph.y, 1);
      }
      // the nearest calm guard goes to it; one who was called away leaves it to the next
      if (!g || !g.alive || !this.onIt(g, ph)) {
        k.guard = answerer(w.enemies, ph.x, ph.y, c.near * TILE);
        if (k.guard) k.guard.errandTo(ph.spot, 'phone', rand(...c.talk));
      } else if (g.atPost) {
        k.picked = true;
        w.sound('handle', ph.x, ph.y, 0.5);
        g.barkT = 0;
        g.say('phone');
      }
      if (k.t > c.ring) this.call = null; // it rang out
      return;
    }
    // on the line until he is done (his errand over) or called away
    if (!g.alive || !this.onIt(g, ph)) {
      if (g.alive && g.aware === 0) g.say('hangup');
      w.sound('handle', ph.x, ph.y, 0.4);
      this.call = null;
    }
  }
}
