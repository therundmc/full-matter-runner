import { rand, lerp } from './math.js';

// Follow camera with look-ahead, trauma shake and a slow tilt sway. `zoom` is the whole number of picture px to a
// world px that suits the window (crisp pixel art); `scale` is a director's zoom on top of it, eased by whoever sets
// it and left on a value that keeps zoom x scale whole when it rests.
// World px of vertical view. It was 380; the user wanted the camera closer to see the detail (300), then "a tiny bit"
// further out (330), then closer again to make it more visceral (2026-11-16: 290; a zoom that follows the action may come).
export const VIEW = 290;

export default class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 2;
    this.scale = 1;            // a director's zoom on top of it (1: the usual view; 2: twice as close)
    this.rot = 0;
    this.trauma = 0;
    this.punchZ = 0;
    this.kick = { x: 0, y: 0 };
    this.sx = 0; this.sy = 0; this.sr = 0;
    this.w = 1; this.h = 1;
    this.time = 0;
    this.sway = true;          // the slow tilt; false: it eases out (at a wheel: a turned picture resamples every pixel)
    this.swayK = 1;            // 0..1: how much of it is on
    this.buzz = 0;             // picture px of a road's rumble, up and down (set every frame by whoever drives)
    this.jolt = { t: 0, y: 0 };
    this.bounds = null;        // { w, h } of the world in px: the view never leaves it
    this.shakeScale = 1;       // the player's screen shake setting, 0..1: scales every shake and recoil kick
  }

  // zoom: the whole zoom to draw at, when the caller knows it (Game.resize: a view of another height than VIEW)
  resize(w, h, zoom = 0) {
    this.w = w; this.h = h;
    // a whole zoom keeps pixel art crisp: the nearest to VIEW world px of vertical view (Game.resize sizes the canvas
    // so that it is exactly that when the lens is there to bring the picture down to the window)
    this.zoom = zoom > 0 ? Math.round(zoom) : Math.max(1, Math.round(h / VIEW));
  }

  snap(x, y) { this.x = x; this.y = y; this.clamp(); }

  // keep the view inside the world (a world smaller than the view is centred); the margin hides the sway's corners
  clamp() {
    if (!this.bounds) return;
    const z = this.zoom * this.scale, hw = this.w / z / 2 + 10, hh = this.h / z / 2 + 10, { w, h } = this.bounds;
    this.x = w < hw * 2 ? w / 2 : Math.min(Math.max(this.x, hw), w - hw);
    this.y = h < hh * 2 ? h / 2 : Math.min(Math.max(this.y, hh), h - hh);
  }

  shake(amount) { this.trauma = Math.min(1.2, this.trauma + amount * this.shakeScale); }

  // still: no shake, kick or zoom punch left (a new level, a page over the picture)
  settle() {
    this.trauma = 0; this.punchZ = 0;
    this.kick.x = this.kick.y = 0;
    this.sx = this.sy = this.sr = 0;
    this.buzz = 0; this.jolt.t = 0;
  }

  // brief zoom kick on big impacts
  punch(amount) { this.punchZ = Math.max(this.punchZ, amount); }
  get z() { return this.zoom * this.scale * (1 + this.punchZ); }

  // directional kick (recoil feel)
  push(dx, dy) { this.kick.x += dx * this.shakeScale; this.kick.y += dy * this.shakeScale; }

  update(dt, tx, ty) {
    this.time += dt;
    const k = 1 - Math.pow(0.0008, dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    this.clamp();
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.punchZ *= Math.pow(0.01, dt);
    const s = this.trauma * this.trauma;
    this.sx = rand(-1, 1) * 16 * s;
    // (the rumble: now and then a short jolt up or down, whole px, never a blur; the player's shake setting scales it)
    const J = this.jolt;
    if (J.t > 0) J.t -= dt;
    else if (this.buzz > 0 && Math.random() < dt * 9) { J.t = 0.045; J.y = (Math.random() < 0.5 ? -1 : 1) * Math.round(this.buzz * this.shakeScale); }
    else J.y = 0;
    this.sy = rand(-1, 1) * 16 * s + (J.t > 0 ? J.y : 0);
    this.sr = rand(-1, 1) * 0.05 * s;
    this.swayK = Math.max(0, Math.min(1, this.swayK + (this.sway ? dt : -dt) * 2.5));
    this.kick.x *= Math.pow(0.0001, dt);
    this.kick.y *= Math.pow(0.0001, dt);
    this.rot = Math.sin(this.time * 0.5) * 0.028 * this.swayK + this.sr;
  }

  apply(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(Math.round(this.w / 2 + this.sx), Math.round(this.h / 2 + this.sy));
    ctx.rotate(this.rot);
    ctx.scale(this.z, this.z);
    ctx.translate(-this.x - this.kick.x, -this.y - this.kick.y);
  }

  screenToWorld(sx, sy) {
    let x = sx - this.w / 2 - this.sx, y = sy - this.h / 2 - this.sy;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    const rx = x * c - y * s, ry = x * s + y * c;
    return { x: rx / this.z + this.x + this.kick.x, y: ry / this.z + this.y + this.kick.y };
  }

  worldToScreen(wx, wy) {
    const x = (wx - this.x - this.kick.x) * this.z, y = (wy - this.y - this.kick.y) * this.z;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: x * c - y * s + this.w / 2 + this.sx, y: x * s + y * c + this.h / 2 + this.sy };
  }

  // half-size of the visible world rectangle (with margin for rotation)
  viewRadius() {
    const z = this.zoom * this.scale;
    return { x: this.w / z / 2 + 40, y: this.h / z / 2 + 40 };
  }
}
