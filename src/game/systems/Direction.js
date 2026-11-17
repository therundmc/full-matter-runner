// The camera's direction (SHOTS in data/staging.js): a shot at a time, named by whoever stages the level
// (systems/Tutorial.js `shot()`): a zoom on top of the usual view and something to look at, both eased. Game puts
// the zoom on the camera (engine/Camera.js `scale`) and the point between the player and what is looked at.
// The scene is drawn at a whole number of px a world px (crisp pixel art): a shot's zoom is eased toward the nearest
// one that keeps it whole (`rest(base)`), so only the move between two shots is drawn at an in-between scale.
// Pure state, DOM-free.
import { SHOTS, DIRECTION } from '../data/staging.js';

export default class Direction {
  constructor(shots = SHOTS, cfg = DIRECTION) {
    this.shots = shots;
    this.cfg = cfg;
    this.reset();
  }

  // a new level: the usual view
  reset() {
    this.shot = null;      // the SHOTS entry being eased toward (null: the usual view)
    this.zoom = 1;
    this.pull = 0;         // 0..1: how far the view has gone to what is looked at, and how far it is to go
    this.wants = 0;
    this.look = 1;         // share of the cursor's look-ahead kept
    this.at = null;        // what is looked at: { x, y }
  }

  // the shot from now on (a SHOTS name, or null) and what it looks at ({ x, y }, or null); cut: no easing (the
  // level opens on it; base: the camera's pixel zoom, as in rest)
  set(name, at = null, cut = false, base = 0) {
    this.shot = this.shots[name] || null;
    if (at) this.at = { x: at.x, y: at.y };
    this.wants = at && this.shot ? this.shot.pull : 0;
    if (cut) {
      this.zoom = this.rest(base);
      this.pull = this.wants;
      this.look = this.shot?.look ?? 1;
    }
  }

  // the zoom a shot ends on for a pixel zoom of `base` px a world px: the nearest that keeps base x zoom whole (and
  // at least 1); base 0: as written
  rest(base = 0) {
    const to = this.shot?.zoom ?? 1;
    return base > 0 ? Math.max(1, Math.round(base * to)) / base : to;
  }

  // dt: real s (the camera does not slow down with the game); base: the camera's pixel zoom
  update(dt, base = 0) {
    const s = this.shot, c = this.cfg, to = this.rest(base), k = 1 - Math.exp(-(s?.ease ?? 2) * dt);
    this.zoom += (to - this.zoom) * k;
    if (Math.abs(to - this.zoom) < c.snap * to) this.zoom = to;
    const f = 1 - Math.exp(-c.focus * dt);
    this.pull += ((this.wants ?? 0) - this.pull) * f;
    if (this.pull < 0.002 && !this.wants) this.pull = 0;
    this.look += ((s?.look ?? 1) - this.look) * f;
  }

  // where the view goes for a player's point (x, y): toward what is looked at, by how far it has been pulled
  aim(x, y) {
    const a = this.at, k = a ? this.pull : 0;
    return { x: x + ((a?.x ?? x) - x) * k, y: y + ((a?.y ?? y) - y) * k };
  }
}
