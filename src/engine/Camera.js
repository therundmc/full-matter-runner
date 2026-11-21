import { rand, lerp } from './math.js';

// Follow camera with look-ahead, trauma shake and a slow tilt sway. `zoom` is the whole number of picture px to a
// world px that suits the window (crisp pixel art); `scale` is a director's zoom on top of it, eased by whoever sets
// it and left on a value that keeps zoom x scale whole when it rests.
// World px of vertical view. It was 380; the user wanted the camera closer to see the detail (300), then "a tiny bit"
// further out (330), then closer again to make it more visceral (2026-11-16: 290; a zoom that follows the action may come).
export const VIEW = 290;

// How it moves. Rates are what is left after a second (0.01: a hundredth of it), so they hold at any frame rate.
const FEEL = {
  follow: 0.0008,      // of the way to its target left after a second (a soft lag)
  trauma: 1.6,         // shake lost a second
  shake: 16,           // picture px either way at full shake
  shakeTurn: 0.05,     // rad either way at full shake
  punch: 0.01,         // of a zoom punch left after a second
  kick: 0.0001,        // of a recoil kick left after a second
  swayIn: 2.5,         // 1/s: the tilt eased in or out
  swayRate: 0.5,       // rad/s of its slow swing
  swayAmp: 0.028,      // rad either way
  edge: 10,            // world px kept past the world's edges (the corners a tilt would show)
  margin: 40,          // world px added round the view for what is drawn (viewRadius: a tilt, a sprite's reach)
};

// The picture for a view `view` world px high in a window h device px high: { ss: scene px a window px, zoom: scene
// px a world px }.
//   pixel (at a wheel: Camera `pixel`): the scene is drawn 1:1, its canvas the window (ss 1), at the whole zoom
//   nearest to that view (which is then h / zoom world px high): nothing scales it afterwards, every px of a sprite
//   lands on px of the screen
//   lens (a last pass that can bring the picture down to the window): the scene at the whole zoom of the usual view
//   (a sprite always the same number of px) on a canvas as large as that takes: the view is `view` world px high
//   whatever the window's size. `cap` draws fewer px (the QUALITY option): { ss: the most the scene may be larger
//   than the window (over it: one whole zoom less, the scene then smaller than the window and brought UP to it),
//   zoom: the largest whole zoom }
//   neither: the canvas is the window and the zoom the nearest whole one (a taller view than the usual one: the
//   largest that shows all of it)
export function fitView(view, h, lens = false, pixel = false, cap = null) {
  if (pixel) return { ss: 1, zoom: Math.max(1, Math.round(h / view)) };
  if (lens) {
    let zoom = Math.max(1, Math.ceil(h / VIEW));
    if (cap && (VIEW * zoom) / h > cap.ss + 1e-9) zoom--;
    zoom = Math.max(1, Math.min(zoom, cap ? cap.zoom : Infinity));
    return { ss: (view * zoom) / h, zoom };
  }
  return { ss: 1, zoom: view === VIEW ? Math.max(1, Math.round(h / VIEW)) : Math.max(1, Math.floor(h / view)) };
}

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
    this.sway = true;          // the slow tilt; false: it eases out
    // the picture held on whole px (set by whoever wants every sprite drawn the same from one frame to the next: at
    // a wheel): no tilt and no turn at all, no zoom punch, the view following its target with no lag (update) and
    // put on the grid of the picture's px (apply)
    this.pixel = false;
    this.swayK = 1;            // 0..1: how much of it is on
    this.bounds = null;        // { w, h } of the world in px: the view never leaves it
    this.shakeScale = 1;       // the player's screen shake setting, 0..1: scales every shake and recoil kick
  }

  // zoom: the whole zoom to draw at, when the caller knows it (the game's resize: a view of another height than VIEW)
  resize(w, h, zoom = 0) {
    this.w = w; this.h = h;
    // a whole zoom keeps pixel art crisp: the nearest to VIEW world px of vertical view (the game's resize sizes the
    // canvas so that it is exactly that when the lens is there to bring the picture down to the window)
    this.zoom = zoom > 0 ? Math.round(zoom) : Math.max(1, Math.round(h / VIEW));
  }

  snap(x, y) { this.x = x; this.y = y; this.clamp(); }

  // keep the view inside the world (a world smaller than the view is centred); the margin hides the sway's corners
  clamp() {
    if (!this.bounds) return;
    const z = this.z, hw = this.w / z / 2 + FEEL.edge, hh = this.h / z / 2 + FEEL.edge, { w, h } = this.bounds;
    this.x = w < hw * 2 ? w / 2 : Math.min(Math.max(this.x, hw), w - hw);
    this.y = h < hh * 2 ? h / 2 : Math.min(Math.max(this.y, hh), h - hh);
  }

  shake(amount) { this.trauma = Math.min(1.2, this.trauma + amount * this.shakeScale); }

  // still: no shake, kick or zoom punch left (a new level, a page over the picture)
  settle() {
    this.trauma = 0; this.punchZ = 0;
    this.kick.x = this.kick.y = 0;
    this.sx = this.sy = this.sr = 0;
  }

  // brief zoom kick on big impacts
  punch(amount) { this.punchZ = Math.max(this.punchZ, amount); }
  // (held on whole px: a whole number of picture px a world px, whatever the scale on top)
  get z() { return this.pixel ? Math.max(1, Math.round(this.zoom * this.scale)) : this.zoom * this.scale * (1 + this.punchZ); }

  // directional kick (recoil feel)
  push(dx, dy) { this.kick.x += dx * this.shakeScale; this.kick.y += dy * this.shakeScale; }

  update(dt, tx, ty) {
    this.time += dt;
    const k = 1 - Math.pow(FEEL.follow, dt);
    this.x = this.pixel ? tx : lerp(this.x, tx, k);
    this.y = this.pixel ? ty : lerp(this.y, ty, k);
    this.clamp();
    this.trauma = Math.max(0, this.trauma - dt * FEEL.trauma);
    this.punchZ *= Math.pow(FEEL.punch, dt);
    const s = this.trauma * this.trauma;
    this.sx = rand(-1, 1) * FEEL.shake * s;
    this.sy = rand(-1, 1) * FEEL.shake * s;
    this.sr = rand(-1, 1) * FEEL.shakeTurn * s;
    this.swayK = Math.max(0, Math.min(1, this.swayK + (this.sway ? dt : -dt) * FEEL.swayIn));
    this.kick.x *= Math.pow(FEEL.kick, dt);
    this.kick.y *= Math.pow(FEEL.kick, dt);
    if (this.pixel) { this.sr = 0; this.swayK = 0; }
    this.rot = Math.sin(this.time * FEEL.swayRate) * FEEL.swayAmp * this.swayK + this.sr;
  }

  // where the view is drawn from (world px): held on whole px, the nearest point that lands on the picture's grid
  // (the shake is whole px already: apply)
  at() {
    const x = this.x + this.kick.x, y = this.y + this.kick.y, z = this.z;
    return this.pixel ? { x: Math.round(x * z) / z, y: Math.round(y * z) / z } : { x, y };
  }

  apply(ctx) {
    const at = this.at();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(Math.round(this.w / 2 + this.sx), Math.round(this.h / 2 + this.sy));
    ctx.rotate(this.rot);
    ctx.scale(this.z, this.z);
    ctx.translate(-at.x, -at.y);
  }

  screenToWorld(sx, sy) {
    let x = sx - this.w / 2 - this.sx, y = sy - this.h / 2 - this.sy;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    const rx = x * c - y * s, ry = x * s + y * c, at = this.at();
    return { x: rx / this.z + at.x, y: ry / this.z + at.y };
  }

  worldToScreen(wx, wy) {
    const at = this.at(), x = (wx - at.x) * this.z, y = (wy - at.y) * this.z;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: x * c - y * s + this.w / 2 + this.sx, y: x * s + y * c + this.h / 2 + this.sy };
  }

  // half-size of the visible world rectangle (with margin for rotation), at the zoom it is drawn at (z)
  viewRadius() {
    const z = this.z;
    return { x: this.w / z / 2 + FEEL.margin, y: this.h / z / 2 + FEEL.margin };
  }
}
