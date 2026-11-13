import { rand, lerp } from './math.js';

// Follow camera with look-ahead, trauma shake and a slow tilt sway.
export default class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 2;
    this.rot = 0;
    this.trauma = 0;
    this.kick = { x: 0, y: 0 };
    this.sx = 0; this.sy = 0; this.sr = 0;
    this.w = 1; this.h = 1;
    this.time = 0;
    this.sway = true;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    // integer zoom keeps pixel art crisp; aim for ~380 world px of vertical view
    this.zoom = Math.max(1, Math.round(h / 380));
  }

  snap(x, y) { this.x = x; this.y = y; }

  shake(amount) { this.trauma = Math.min(1.2, this.trauma + amount); }

  // directional kick (recoil feel)
  push(dx, dy) { this.kick.x += dx; this.kick.y += dy; }

  update(dt, tx, ty) {
    this.time += dt;
    const k = 1 - Math.pow(0.0008, dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    this.sx = rand(-1, 1) * 16 * s;
    this.sy = rand(-1, 1) * 16 * s;
    this.sr = rand(-1, 1) * 0.05 * s;
    this.kick.x *= Math.pow(0.0001, dt);
    this.kick.y *= Math.pow(0.0001, dt);
    this.rot = (this.sway ? Math.sin(this.time * 0.5) * 0.028 : 0) + this.sr;
  }

  apply(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(Math.round(this.w / 2 + this.sx), Math.round(this.h / 2 + this.sy));
    ctx.rotate(this.rot);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x - this.kick.x, -this.y - this.kick.y);
  }

  screenToWorld(sx, sy) {
    let x = sx - this.w / 2 - this.sx, y = sy - this.h / 2 - this.sy;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    const rx = x * c - y * s, ry = x * s + y * c;
    return { x: rx / this.zoom + this.x + this.kick.x, y: ry / this.zoom + this.y + this.kick.y };
  }

  worldToScreen(wx, wy) {
    const x = (wx - this.x - this.kick.x) * this.zoom, y = (wy - this.y - this.kick.y) * this.zoom;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: x * c - y * s + this.w / 2 + this.sx, y: x * s + y * c + this.h / 2 + this.sy };
  }

  // half-size of the visible world rectangle (with margin for rotation)
  viewRadius() {
    return { x: this.w / this.zoom / 2 + 40, y: this.h / this.zoom / 2 + 40 };
  }
}
