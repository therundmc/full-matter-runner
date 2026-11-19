// The kill cam's comic panels (KILLCAM.panel in data/killcam.js; systems/KillCam.js says when and what): a small
// insert at the top right that replays a kill, slowed, while play goes on. The footage is taken off the rendered
// scene, like the results' replay (render/Replay.js) but sharp: a rolling strip of tiles cut out of the scene about
// the player at its own pixel size; at a kill of his the strip becomes that kill's clip and goes on a moment, about
// the kill, while a fresh one starts rolling. A panel draws a window of a tile at a whole magnification, nearest
// neighbour. Three strips in all (rolling, the last kill's, a spare), reused; one or two small blits a frame taken.
// The look is the comic's cut paper: a bone border a little crooked, a hard shadow, tilted, popped in and cut out.
// Canvas creation is injectable (tests run in Node).
import { KILLCAM } from '../data/killcam.js';
import { text } from '../ui/Text.js';

const domCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

// Of a strip's tiles (times[i] for the `count` first), the one to show at time t: the latest taken by then, or the
// first there is; -1 with none.
export function tileAt(times, count, t) {
  let best = -1, first = -1;
  for (let i = 0; i < count; i++) {
    if (first < 0 || times[i] < times[first]) first = i;
    if (times[i] <= t && (best < 0 || times[i] > times[best])) best = i;
  }
  return best >= 0 ? best : first;
}

export default class KillPanel {
  constructor(cfg = KILLCAM.panel, createCanvas = domCanvas) {
    this.cfg = cfg;
    this.createCanvas = createCanvas;
    this.cols = Math.ceil(Math.sqrt(cfg.frames));
    this.rows = Math.ceil(cfg.frames / this.cols);
    this.pool = [];        // the strips: { canvas, ctx, times, cx, cy, head, count, killT, focus, body, near }
    this.zoom = 0;         // scene px a world px the strips were made for
    this.reset();
  }

  // a new level: nothing kept but the canvases
  reset() {
    this.ring = null;      // the strip rolling about the player
    this.last = null;      // the last kill's
    this.shown = null;     // the one a panel is showing, and that panel's id
    this.shownId = 0;
    this.lastT = -99;
    this.now = 0;
    this.him = { x: 0, y: 0 };
    this.world = null;
  }

  // follow a world's kills (and let go of the previous world)
  attach(events) {
    if (this.detach) this.detach();
    this.detach = events.on('kill', (e) => this.onKill(e));
  }

  strip(zoom) {
    const [tw, th] = this.cfg.tile, n = this.cfg.frames;
    const canvas = this.createCanvas(this.cols * tw * zoom, this.rows * th * zoom);
    return { canvas, ctx: canvas.getContext('2d', { alpha: false }), times: new Float64Array(n), cx: new Float32Array(n), cy: new Float32Array(n), head: 0, count: 0, killT: 0, focus: null };
  }

  // a strip nobody holds, emptied
  spare(zoom) {
    let s = this.pool.find((q) => q !== this.ring && q !== this.last && q !== this.shown);
    if (!s) this.pool.push(s = this.strip(zoom));
    s.head = s.count = 0;
    s.focus = s.body = null;
    return s;
  }

  // a kill of his: the rolling strip is that kill's clip from now on, about the point between the two (about the
  // man alone when they are too far apart for one picture)
  onKill({ victim, killer, cause }) {
    if (!this.ring || victim.isPlayer || !victim.isEnemy || !(killer?.isPlayer || cause === 'explosion')) return;
    const p = this.him, clip = this.ring, body = this.world?.corpses?.at(-1);
    clip.killT = this.now;
    clip.near = Math.hypot(victim.x - p.x, victim.y - p.y) <= this.cfg.view.strip[0];
    clip.focus = clip.near ? { x: (p.x + victim.x) / 2, y: (p.y + victim.y) / 2 } : { x: victim.x, y: victim.y };
    // what is left of him, to follow as it is thrown (the body this kill just made)
    clip.body = body && Math.hypot(body.x - victim.x, body.y - victim.y) < 48 ? body : null;
    this.last = clip;
    this.ring = this.spare(this.zoom);
  }

  // one tile of strip s: the scene about the world point (x, y)
  take(s, source, cam, x, y) {
    const [tw, th] = this.cfg.tile, z = this.zoom, i = s.head, c = cam.worldToScreen(x, y), k = cam.z;
    const dx = (i % this.cols) * tw * z, dy = Math.floor(i / this.cols) * th * z;
    s.ctx.imageSmoothingEnabled = false;
    s.ctx.fillStyle = this.cfg.ink;
    s.ctx.fillRect(dx, dy, tw * z, th * z);
    // (clipped to its tile: the browser fits a source rectangle that leaves the scene, which would draw outside it)
    s.ctx.save();
    s.ctx.beginPath();
    s.ctx.rect(dx, dy, tw * z, th * z);
    s.ctx.clip();
    s.ctx.drawImage(source, Math.round(c.x - tw * k / 2), Math.round(c.y - th * k / 2), Math.round(tw * k), Math.round(th * k), dx, dy, tw * z, th * z);
    s.ctx.restore();
    s.times[i] = this.now; s.cx[i] = x; s.cy[i] = y;
    s.head = (i + 1) % this.cfg.frames;
    s.count = Math.min(s.count + 1, this.cfg.frames);
  }

  // Every rendered frame of play, with the scene's canvas, its camera and the world. now: real s.
  // True when footage was taken.
  capture(source, cam, world, now) {
    const C = this.cfg, player = world.player;
    this.world = world;
    this.now = now;
    this.him.x = player.x; this.him.y = player.y;
    if (now - this.lastT < 1 / C.fps - 0.004) return false; // (a hair under: a frame's own jitter must not skip one)
    this.lastT = now;
    if (cam.zoom !== this.zoom) {
      // another pixel size (the window resized): start over
      for (const s of this.pool) s.canvas.width = s.canvas.height = 0;
      this.pool.length = 0;
      this.zoom = cam.zoom;
      this.ring = this.last = this.shown = null;
    }
    if (!this.ring) this.ring = this.spare(this.zoom);
    this.take(this.ring, source, cam, player.x, player.y);
    const l = this.last;
    if (l && now <= l.killT + C.post) {
      // about the kill; about his body where it goes (him and it, when they are close enough for one picture)
      const b = l.body, k = l.near ? 0.5 : 1;
      if (b) this.take(l, source, cam, player.x + (b.x - player.x) * k, player.y + (b.y - player.y) * k);
      else this.take(l, source, cam, l.focus.x, l.focus.y);
    }
    return true;
  }

  // The panels of `view` (KillCam.panelView) on a picture W x H px, the scene's size.
  draw(ctx, W, H, view) {
    if (!view) { this.shown = null; return; }
    if (view.id !== this.shownId) { this.shownId = view.id; this.shown = this.last; }
    const C = this.cfg, s = H / 720, clip = this.shown, z = this.zoom, P = z * C.mag;
    const [vw, vh] = C.view[view.kind], pw = vw * P, ph = vh * P, gap = C.gap * s, b = Math.max(2, Math.round(C.border * s)), sh = C.shadow * s;
    const x0 = W - C.right * s - view.n * pw - (view.n - 1) * gap, [tw, th] = C.tile;
    ctx.imageSmoothingEnabled = false;
    for (const f of view.frames) {
      ctx.save();
      ctx.translate(Math.round(x0 + f.i * (pw + gap) + pw / 2), Math.round(C.top * s + ph / 2 + (f.i % 2) * 6 * s));
      ctx.rotate(C.tilt[f.i % C.tilt.length]);
      ctx.scale(f.pop, f.pop);
      // cut paper: a hard shadow, then a bone sheet a little crooked (one corner out, one in)
      const sheet = (ox, oy, g) => {
        ctx.beginPath();
        ctx.moveTo(-pw / 2 - g + ox, -ph / 2 - g + oy - b * 0.6);
        ctx.lineTo(pw / 2 + g + ox + b * 0.5, -ph / 2 - g + oy);
        ctx.lineTo(pw / 2 + g + ox, ph / 2 + g + oy + b * 0.5);
        ctx.lineTo(-pw / 2 - g + ox - b * 0.4, ph / 2 + g + oy);
        ctx.closePath();
        ctx.fill();
      };
      ctx.fillStyle = C.ink;
      sheet(sh, sh, b * 1.5);
      sheet(0, 0, b * 1.5);
      ctx.fillStyle = C.bone;
      sheet(0, 0, b);
      ctx.fillStyle = C.ink;
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      const i = clip ? tileAt(clip.times, clip.count, clip.killT + f.clip) : -1;
      if (i >= 0) {
        // the window inside the tile: its middle once the kill is done (the footage is about it then) and before a
        // kill from afar (him, as he strikes); before one up close, about the two of them
        const mid = clip.times[i] > clip.killT || !clip.focus || !clip.near;
        const fx = mid ? clip.cx[i] : clip.focus.x, fy = mid ? clip.cy[i] : clip.focus.y;
        const ox = Math.min(Math.max(fx - clip.cx[i] + tw / 2 - vw / 2, 0), tw - vw), oy = Math.min(Math.max(fy - clip.cy[i] + th / 2 - vh / 2, 0), th - vh);
        ctx.drawImage(clip.canvas, (i % this.cols) * tw * z + Math.round(ox * z), Math.floor(i / this.cols) * th * z + Math.round(oy * z), vw * z, vh * z, -pw / 2, -ph / 2, pw, ph);
      }
      // the word, small, on a pink tab cut across the corner of the last panel
      if (f.i === view.n - 1 && view.word) {
        const size = 13 * s, w = (view.word.length * 0.92 + 1.2) * size, h = size * 1.9;
        ctx.translate(pw / 2 - w / 2 + b, ph / 2 - h * 0.2);
        ctx.rotate(-0.06);
        ctx.fillStyle = C.ink;
        ctx.fillRect(-w / 2 + sh * 0.6, -h / 2 + sh * 0.6, w, h);
        ctx.fillStyle = C.pink;
        ctx.beginPath();
        ctx.moveTo(-w / 2 - size * 0.3, -h / 2); ctx.lineTo(w / 2, -h / 2 - size * 0.15); ctx.lineTo(w / 2 + size * 0.2, h / 2); ctx.lineTo(-w / 2, h / 2 + size * 0.1);
        ctx.closePath();
        ctx.fill();
        text(ctx, view.word, 0, size * 0.05, size, C.ink, { shadow: null, outline: false });
      }
      ctx.restore();
    }
  }
}
