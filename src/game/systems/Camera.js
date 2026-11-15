// The bar's security camera (level `camera`: { cam: [col, row, deg], view: [col0, row0, col1, row1], monitor:
// [col, row] }): a `cctv` prop high on a wall, panning, feeding a `monitor` prop in the back room. A guard sitting by
// the monitor (within CAMERA.watch px) sees on it whoever is in the view rectangle and in the camera's line of sight;
// a stranger who is a threat (armed, off limits, or made: Director.isThreat) fills his meter, and he raises the alert
// as if he had seen him himself (the squad sent to where the picture shows him). Shot out, the camera leaves the
// monitor to its snow; the power cut blinds it too. DOM-free: what the art needs is left on the props (`pan` on the
// camera, `feed` on the monitor: null, or the player's place in the picture 0..1).
import { TILE } from '../Config.js';
import { CAMERA } from '../data/devices.js';

// the point (x, y) inside the view rectangle, as a place in the picture (0..1 each way), or null outside
export function inPicture(x, y, v) {
  if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) return null;
  return { u: (x - v.x0) / (v.x1 - v.x0), v: (y - v.y0) / (v.y1 - v.y0) };
}

export default class Camera {
  constructor(world, def = null, cfg = CAMERA) {
    this.world = world;
    this.cfg = cfg;
    this.meter = 0;
    this.quiet = 0; // s before the watcher may raise it again
    if (!def) return;
    const [c, r, deg = 0] = def.cam, [c0, r0, c1, r1] = def.view;
    this.cam = { x: c * TILE, y: r * TILE, a: (deg * Math.PI) / 180 };
    this.view = { x0: c0 * TILE, y0: r0 * TILE, x1: (c1 + 1) * TILE, y1: (r1 + 1) * TILE };
    this.mon = { x: def.monitor[0] * TILE, y: def.monitor[1] * TILE };
  }

  find(type, at) {
    return this.world.props.find((p) => p.type === type && Math.hypot(p.x - at.x, p.y - at.y) < TILE) || null;
  }

  // the picture is there: the camera on its wall, the monitor whole, the power on where it hangs
  get live() {
    const w = this.world, c = this.camProp, m = this.monProp;
    return !!c && !c.dead && !c.dying && !!m && !m.dead && !m.dying && !(w.power && !w.power.on && w.power.inside(m.x, m.y));
  }

  // the guard watching the monitor (close to it, in the same room), or null
  watcher() {
    const m = this.monProp;
    const w = this.world;
    return w.enemies.find((e) => e.alive && !(e.knocked > 0) && !e.dormant && e.aware < 2 && Math.hypot(e.x - m.x, e.y - m.y) < this.cfg.watch
      && w.lineOfSight(e.x, e.y, m.x, m.y)) || null;
  }

  update(dt) {
    if (!this.cam) return;
    const w = this.world, c = this.cfg;
    if (this.camProp === undefined) { this.camProp = this.find('cctv', this.cam); this.monProp = this.find('monitor', this.mon); }
    const cam = this.camProp, mon = this.monProp;
    if (cam) cam.pan = c.pan * Math.sin((w.time / c.period) * Math.PI * 2);
    if (!this.live) {
      if (mon && !mon.dead) { mon.feed = null; mon.blind = true; }
      this.meter = 0;
      return;
    }
    this.quiet = Math.max(0, this.quiet - dt);
    const p = w.player;
    const seen = p.alive && !p.hidden && w.lineOfSight(cam.x, cam.y, p.x, p.y) ? inPicture(p.x, p.y, this.view) : null;
    mon.feed = seen;
    const e = this.watcher();
    if (!e || !seen || !w.director.isThreat(p) || this.quiet > 0) { this.meter = Math.max(0, this.meter - dt * 0.5); return; }
    this.meter += dt / c.spot;
    if (this.meter < 1) return;
    // there he is, on the screen: the squad is told where
    this.meter = 0;
    this.quiet = 8;
    const d = w.director;
    d.sighted(p.x, p.y);
    e.barkT = 0;
    e.say('camera');
    d.shout(e);
  }
}
