// The camera's direction (SHOTS in data/staging.js): a shot at a time, named by whoever stages the level
// (systems/Tutorial.js `shot()`): a zoom on top of the usual view and something to look at, both eased. Game puts
// the zoom on the camera (engine/Camera.js `scale`) and the point between the player and what is looked at.
// The scene is drawn at a whole number of px a world px (crisp pixel art): a shot's zoom is eased toward the nearest
// one that keeps it whole (`rest(base)`), so only the move between two shots is drawn at an in-between scale.
// Pure state, DOM-free.
import { SHOTS, DIRECTION } from '../data/staging.js';
import { clamp } from '../../engine/math.js';

// the zoom nearest to `to` that keeps base x zoom whole (and at least 1); base 0: as written. step 2: an EVEN number
// of px a world px (a shot's `even`: a close-up, where the sprites painted at twice the world's density, FINE in
// tools/generate_assets.py, must get whole px a texel: at 5 px a world px theirs are 2.5, drawn 2 and 3 in turn)
export const whole = (to, base, step = 1) => (base > 0 ? Math.max(step, Math.round((base * to) / step) * step) / base : to);

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
    this.keep = 0;         // share of the half view the player stays inside (0: anywhere; kept while easing back)
  }

  // the shot from now on (a SHOTS name, or null) and what it looks at ({ x, y }, or null); cut: no easing (the
  // level opens on it; base: the camera's pixel zoom, as in rest)
  set(name, at = null, cut = false, base = 0) {
    this.shot = this.shots[name] || null;
    if (this.shot) this.keep = this.shot.keep ?? 0;
    if (at) this.at = { x: at.x, y: at.y };
    this.wants = at && this.shot ? this.shot.pull : 0;
    if (cut) {
      this.zoom = this.rest(base);
      this.pull = this.wants;
      this.look = this.shot?.look ?? 1;
    }
  }

  // the zoom a shot ends on for a pixel zoom of `base` px a world px: the nearest that keeps base x zoom whole (and
  // at least 1; a shot marked `even`: the nearest even one); base 0: as written
  rest(base = 0) { return whole(this.shot?.zoom ?? 1, base, this.shot?.even ? 2 : 1); }

  // dt: real s (the camera does not slow down with the game); base: the camera's pixel zoom; cut: the zoom goes to
  // its shot's at once, only the framing is eased (a picture held on whole px, at the wheel: any zoom between two
  // whole ones resamples every sprite)
  update(dt, base = 0, cut = false) {
    const s = this.shot, c = this.cfg, to = this.rest(base), k = cut ? 1 : 1 - Math.exp(-(s?.ease ?? 2) * dt);
    this.zoom += (to - this.zoom) * k;
    if (Math.abs(to - this.zoom) < c.snap * to) this.zoom = to;
    const f = 1 - Math.exp(-c.focus * dt);
    this.pull += ((this.wants ?? 0) - this.pull) * f;
    if (this.pull < 0.002 && !this.wants) this.pull = 0;
    this.look += ((s?.look ?? 1) - this.look) * f;
  }

  // where the view goes for a player's point (x, y): toward what is looked at, by how far it has been pulled; frame
  // { x, y, hw, hh }: the player and the half view in world px, for a shot that keeps him in the picture (`keep`)
  aim(x, y, frame = null) {
    const a = this.at, k = a ? this.pull : 0;
    const v = { x: x + ((a?.x ?? x) - x) * k, y: y + ((a?.y ?? y) - y) * k };
    if (!frame || !this.keep || !k) return v; // the pull gone: his own look-ahead is his again
    const kx = frame.hw * this.keep, ky = frame.hh * this.keep;
    return { x: clamp(v.x, frame.x - kx, frame.x + kx), y: clamp(v.y, frame.y - ky, frame.y + ky) };
  }
}
