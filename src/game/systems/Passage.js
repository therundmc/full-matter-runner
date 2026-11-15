// A way under the street (level `passage`: [[col, row], [col, row]]: two trapdoors, painted on the floor). E at one:
// he squats, lifts the hatch and goes down (the picture goes dark), the passage is heard under him (rungs, his steps
// on wet concrete), then he comes up out of the other one. Nobody sees him while he is down there (`hidden`), the
// guards know nothing of it (it is not in their grid). DOM-free: the dark is the HUD's (Passage.dark), the trip
// is driven by the player (Player.updatePassage).
import { TILE } from '../Config.js';
import { PASSAGE } from '../data/devices.js';
import { clamp } from '../../engine/math.js';

const { Body } = Matter;

// how dark the picture is at t s into a trip (0 .. 1): it closes over the climb down, stays shut, opens on the way up
export function darkAt(t, cfg = PASSAGE) {
  const { down, under, up } = cfg;
  if (t < down) return clamp((t - down * 0.35) / (down * 0.65), 0, 1);
  if (t < down + under) return 1;
  return clamp(1 - (t - down - under) / (up * 0.8), 0, 1);
}

// One trip: from hatch a to hatch b (px), the player taken over until it is done
class Trip {
  constructor(world, p, a, b, cfg) {
    Object.assign(this, { world, p, a, b, cfg, t: 0, moved: false, steps: 0 });
    world.sound('trunk', a.x, a.y, 0.6); // the hatch lifted on its hinges
  }

  step(dt) {
    const c = this.cfg, w = this.world, p = this.p, t0 = this.t, t = (this.t += dt);
    if (t < c.down) {
      // squared up over the hatch, down the rungs
      const dx = this.a.x - p.x, dy = this.a.y - p.y;
      p.steer(dx, dy, Math.hypot(dx, dy) > 3 ? 1.2 : 0, 0.5);
      p.angle = Math.atan2(this.b.y - this.a.y, this.b.x - this.a.x);
      if (t >= c.down * 0.5) p.hidden = true;
    } else if (!this.moved) {
      // under the street: he is taken to the other end in the dark
      this.moved = true;
      p.hidden = true;
      Body.setPosition(p.body, { x: this.b.x, y: this.b.y });
      Body.setVelocity(p.body, { x: 0, y: 0 });
      p.vel = { x: 0, y: 0 };
      p.safe = { x: this.b.x, y: this.b.y };
      w.camera?.snap?.(this.b.x, this.b.y);
    }
    // the passage heard: the rungs going down and up, his steps along it
    const ring = (at) => t0 < at && t >= at;
    if (ring(c.down * 0.4) || ring(c.down * 0.75)) w.sound('rung', this.a.x, this.a.y, 0.7);
    if (t > c.down && t < c.down + c.under && Math.floor(t * 3.2) !== Math.floor(t0 * 3.2)) w.sound('step', this.b.x, this.b.y, 0.5, { floor: 'concrete', run: true });
    if (ring(c.down + c.under) || ring(c.down + c.under + c.up * 0.35)) w.sound('rung', this.b.x, this.b.y, 0.7);
    if (ring(c.down + c.under + c.up * 0.5)) { p.hidden = false; w.sound('trunk', this.b.x, this.b.y, 0.5); }
    if (t >= c.down + c.under + c.up) { p.hidden = false; p.passage = null; }
  }

  get dark() { return darkAt(this.t, this.cfg); }
}

export default class Passage {
  constructor(world, def = null, cfg = PASSAGE) {
    this.world = world;
    this.cfg = cfg;
    this.hatches = (def || []).map(([c, r]) => ({ x: c * TILE, y: r * TILE }));
    if (this.hatches.length !== 2) return;
    this.hatches.forEach((h, i) => {
      const to = this.hatches[1 - i];
      world.uses?.add({ kind: 'trapdoor', x: h.x, y: h.y, r: cfg.reach, label: 'CLIMB DOWN', ok: (ch) => ch.isPlayer, use: (ch) => this.go(ch, h, to) });
    });
  }

  go(p, a, b) {
    if (p.passage) return;
    p.passage = new Trip(this.world, p, a, b, this.cfg);
    p.slide = null;
    p.swing = 0;
    p.reloading = 0;
  }
}
