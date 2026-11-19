// The camera's direction (SHOTS in data/staging.js): a shot at a time, named by whoever stages the level
// (systems/Tutorial.js `shot()`): a zoom on top of the usual view and something to look at, both eased. Game puts
// the zoom on the camera (engine/Camera.js `scale`) and the point between the player and what is looked at.
// The scene is drawn at a whole number of px a world px (crisp pixel art): a shot's zoom is eased toward the nearest
// one that keeps it whole (`rest(base)`), so only the move between two shots is drawn at an in-between scale.
// Pure state, DOM-free.
import { SHOTS, DIRECTION } from '../data/staging.js';
import { clamp } from '../../engine/math.js';

// the zoom nearest to `to` that keeps base x zoom whole (and at least 1); base 0: as written
const whole = (to, base) => (base > 0 ? Math.max(1, Math.round(base * to)) / base : to);

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
    this.beat = null;      // a beat steered from outside, over the shot that was on (steered)
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
  // at least 1); base 0: as written
  rest(base = 0) { return whole(this.shot?.zoom ?? 1, base); }

  // dt: real s (the camera does not slow down with the game); base: the camera's pixel zoom; cut: the zoom goes to
  // its shot's at once, only the framing is eased (a picture held on whole px, at the wheel: any zoom between two
  // whole ones resamples every sprite)
  update(dt, base = 0, cut = false) {
    this.beat = null;
    const s = this.shot, c = this.cfg, to = this.rest(base), k = cut ? 1 : 1 - Math.exp(-(s?.ease ?? 2) * dt);
    this.zoom += (to - this.zoom) * k;
    if (Math.abs(to - this.zoom) < c.snap * to) this.zoom = to;
    const f = 1 - Math.exp(-c.focus * dt);
    this.pull += ((this.wants ?? 0) - this.pull) * f;
    if (this.pull < 0.002 && !this.wants) this.pull = 0;
    this.look += ((s?.look ?? 1) - this.look) * f;
  }

  // a beat whose clock is somebody else's (systems/Tutorial.js beatShot: a lesson's, on the real clock), over the
  // shot that was on, which is left as it was for when the beat is over: name (a SHOTS name), at: what it looks at;
  // n: the beat (a new one starts from the zoom and look-ahead as they are); k: 0..1 how far the zoom and the
  // look-ahead have gone from those to the beat's; pull: 0..1 how far the view has gone from the shot that was on to
  // the beat's own framing of `at`. base as in rest. Called instead of update while it lasts
  steered(name, at, { n, k, pull }, base = 0) {
    const s = this.shots[name] || {};
    if (this.beat?.n !== n) this.beat = { n, zoom: this.zoom, look: this.look };
    const B = this.beat, to = whole(s.zoom ?? 1, base);
    Object.assign(B, { at: { x: at.x, y: at.y }, wants: s.pull ?? 0, pull });
    this.zoom = B.zoom + (to - B.zoom) * k;
    this.look = B.look + ((s.look ?? 1) - B.look) * k;
  }

  // where the view goes for a player's point (x, y): toward what is looked at, by how far it has been pulled; frame
  // { x, y, hw, hh }: the player and the half view in world px, for a shot that keeps him in the picture (`keep`).
  // A beat steered: from there toward its own framing
  aim(x, y, frame = null) {
    const v = this.framed(x, y, frame), B = this.beat;
    if (!B) return v;
    const bx = x + (B.at.x - x) * B.wants, by = y + (B.at.y - y) * B.wants;
    return { x: v.x + (bx - v.x) * B.pull, y: v.y + (by - v.y) * B.pull };
  }

  // (the shot's own framing, as aim without a beat)
  framed(x, y, frame) {
    const a = this.at, k = a ? this.pull : 0;
    const v = { x: x + ((a?.x ?? x) - x) * k, y: y + ((a?.y ?? y) - y) * k };
    if (!frame || !this.keep || !k) return v; // the pull gone: his own look-ahead is his again
    const kx = frame.hw * this.keep, ky = frame.hh * this.keep;
    return { x: clamp(v.x, frame.x - kx, frame.x + kx), y: clamp(v.y, frame.y - ky, frame.y + ky) };
  }
}
