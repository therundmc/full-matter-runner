// The house's electricity (level `power`: { box: [col, row], zone: [col0, row0, col1, row1] }). Everything that runs
// on the mains inside the zone (lamps, neon, screens, the jukebox, fans) hangs on one fuse box, a `fuse_box` prop on
// an outside wall. Smash it or shoot it and the lights stutter, go out for good, and the battery lamps over the doors
// (props with `standby`) come on: the house is left in its emergency lighting, where guards see far less
// (ai/Perception reads lighting.levelAt). Those within earshot come and look at the box; the others curse in the dark.
// DOM-free: lamps are switched through the props' own flags (`lightsOut`, `sputter`), which render/Lighting.js reads.
import { TILE, LIGHTING } from '../Config.js';
import { rand } from '../../engine/math.js';

const MARGIN = 0.3;   // tiles around the zone that still count: signs and lamps on the outside faces of its walls
const STUTTER = 0.45; // s the lights flicker before they die
const BACKUP = 1.0;   // s after the cut before the battery lamps catch
const REACH = 13;     // tiles the bang of the box carries to guards (walls muffle it)
const CURSES = 2;     // guards who say something about it

export default class Power {
  constructor(world, def = null) {
    this.world = world;
    this.on = true;
    this.cutAt = -1;   // world time of the cut
    this.wired = null; // props on the mains, looked up at the first step (props are built after the systems)
    if (!def) return;
    const [c0, r0, c1, r1] = def.zone;
    this.zone = { x0: (c0 - MARGIN) * TILE, y0: (r0 - MARGIN) * TILE, x1: (c1 + 1 + MARGIN) * TILE, y1: (r1 + 1 + MARGIN) * TILE };
    this.box = { x: def.box[0] * TILE, y: def.box[1] * TILE };
    world.events.on('propDestroyed', ({ prop }) => {
      if (this.on && prop.type === 'fuse_box' && Math.hypot(prop.x - this.box.x, prop.y - this.box.y) < TILE) this.cut();
    });
  }

  inside(x, y) {
    const z = this.zone;
    return !!z && x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1;
  }

  // what the box feeds: every fixed prop of the zone that glows, turns or plays (cars and battery lamps do not)
  wire() {
    this.wired = [];
    this.standby = [];
    for (const p of this.world.props) {
      if (p.isVehicle || !this.inside(p.x, p.y)) continue;
      if (p.def.standby) { p.lightsOut = true; this.standby.push(p); }
      else if (p.def.light || LIGHTING.propLights[p.type] || p.def.spin || p.rec?.electric || p.rec?.snow) this.wired.push(p);
    }
  }

  cut() {
    const w = this.world;
    this.on = false;
    this.cutAt = w.time;
    for (const p of this.wired || []) {
      if (p.dead || p.lightsOut) continue;
      p.flickered = !p.sputter; // the stutter is ours to take back (a derailed jukebox keeps its own)
      p.sputter = true;
    }
    w.light(this.box.x, this.box.y, 110, '#bfe0ff', 0.25);
    w.noise(this.box.x, this.box.y, REACH * TILE);
  }

  update() {
    if (!this.zone) return;
    if (!this.wired) this.wire();
    if (this.on || this.cutAt < 0) return;
    const w = this.world, age = w.time - this.cutAt;
    if (age >= STUTTER && !this.dark) {
      this.dark = true;
      for (const p of this.wired) {
        if (p.flickered) p.sputter = false;
        p.lightsOut = true;
        p.unpowered = w.time; // fans coast down from here, the jukebox loses its record (Prop.spun, Gadgets)
      }
      w.events.emit('powerCut', { x: this.box.x, y: this.box.y });
      const guards = w.enemies.filter((e) => e.alive && this.inside(e.x, e.y));
      for (const e of guards.slice(0, CURSES)) w.after(rand(0.3, 1.4), () => { if (e.alive) e.say('dark'); });
    }
    if (age >= BACKUP && !this.backup) {
      this.backup = true;
      for (const p of this.standby) if (!p.dead) p.lightsOut = false;
    }
  }
}
