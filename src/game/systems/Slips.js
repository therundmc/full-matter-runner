// Feet that go on a slick floor (a liquid kind with `slip`: the beer of a holed keg). Whoever runs across it may go
// down: a guard falls on his back and lies there dazed a few seconds (Enemy.slip: a free kill), a customer trips
// (Civilian.trip), the player slides on his back and gets up (Player.slip). Walking is safe, and so is the player's
// own slide. DOM-free: the falls are the characters' own.
import { LIQUIDS } from '../data/liquids.js';
import { SLIP } from '../data/devices.js';

// who a character is for the odds
const slipper = (ch) => (ch.isPlayer ? 'player' : ch.isEnemy ? 'enemy' : ch.isCivilian ? 'civilian' : null);

// One step of one runner on the slick: t = { d } the px run on it since the last roll; returns whether he goes down.
// d: px covered this step, speed: px/step, r: a random number in [0, 1).
export function slips(t, d, speed, odds, r, cfg = SLIP) {
  if (speed < cfg.speed) { t.d = 0; return false; }
  t.d += d;
  if (t.d < cfg.stride) return false;
  t.d -= cfg.stride;
  return r < odds;
}

export default class Slips {
  constructor(world, cfg = SLIP) {
    this.world = world;
    this.cfg = cfg;
    this.runs = new Map(); // character -> { d, x, y }
  }

  // can he lose his feet now? (on them, not in the middle of a move of his own)
  standing(ch) {
    return ch.alive && !(ch.knocked > 0) && !ch.vaulting && !ch.slide && !ch.slipped && !ch.held && !ch.offstage
      && !ch.execution && !ch.takedown && !(ch.slipGrace > this.world.time);
  }

  update() {
    const w = this.world, liq = w.liquids;
    for (const ch of w.chars) {
      const who = slipper(ch);
      if (!who || !this.standing(ch)) { this.runs.delete(ch); continue; }
      const z = liq.at(ch.x, ch.y);
      if (!z?.slip) { this.runs.delete(ch); continue; }
      let t = this.runs.get(ch);
      if (!t) this.runs.set(ch, t = { d: 0, x: ch.x, y: ch.y });
      const dx = ch.x - t.x, dy = ch.y - t.y, d = Math.hypot(dx, dy);
      t.x = ch.x; t.y = ch.y;
      if (!slips(t, d, ch.moving ?? d, this.cfg.odds[who], Math.random(), this.cfg)) continue;
      const a = Math.atan2(dy, dx);
      this.runs.delete(ch);
      if (who === 'civilian') ch.trip();
      else ch.slip(a);
      w.sound('splash', ch.x, ch.y, 0.9);
      w.sound('bodyFall', ch.x, ch.y, 0.8);
      w.particles.drops(ch.x, ch.y, a, 1.4, 8, LIQUIDS.kinds[z.kind].splash, 150, 4, false);
      w.noise(ch.x, ch.y, this.cfg.noise, ch);
    }
  }
}
