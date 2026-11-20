// End-of-level replay. ReplayRecorder keeps a rolling buffer of small copies of the game canvas and saves it as a
// clip a moment after each kill; ReplayPlayer plays the clips back behind the results, slowed down around the kills.
// Cheap by construction: one downscaled canvas-to-canvas copy every 1 / fps s, no pixel read-back, no allocation
// while playing. A buffer or a clip is ONE atlas canvas holding all its frames as tiles, so saving a clip is a single
// drawImage and the memory is bounded by (clips + 1) atlases, reused from one run to the next.
// Driven by 'kill' events only (independent from the scoring). Canvas creation is injectable (tests run in Node).
import { REPLAY, PALETTE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { bytesOf } from '../../engine/Bytes.js';
import { text } from '../ui/Text.js';

const domCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

// how much a kill is worth seeing again, by cause (Character.kill)
const WEIGHT = { execute: 3, explosion: 3, glass: 3, slash: 2, melee: 2, vehicle: 2, blast: 2, heavy: 1.5, bullet: 1 };

// interest of a clip: its kills by weight, multi-kills first
export function clipScore(kills) {
  return kills.reduce((sum, k) => sum + k.w, 0) + 2 * (kills.length - 1);
}

// Playback speed at clip time t: `slow` from slowBefore s before to slowAfter s after each kill, eased over 0.15 s.
export function playbackSpeed(t, kills, cfg = REPLAY) {
  let near = 0; // 1 inside a slow window, 0 away from every kill
  for (const kt of kills) {
    const d = t - kt;
    const out = d < 0 ? -d - cfg.slowBefore : d - cfg.slowAfter; // s outside the window
    near = Math.max(near, clamp(1 - out / 0.15, 0, 1));
  }
  return 1 + (cfg.slow - 1) * near;
}

// The two recorded frames around clip time t and the cross-fade between them, written into `out` { a, b, k }.
// times: capture time of each tile; the clip is the `len` tiles from `start` on (wrapping at times.length).
export function framePair(times, start, len, t, out) {
  const n = times.length, t0 = times[start];
  let i = 0;
  while (i < len - 2 && times[(start + i + 1) % n] - t0 <= t) i++;
  const a = (start + i) % n, b = len > 1 ? (start + i + 1) % n : a;
  const span = times[b] - times[a];
  out.a = a; out.b = b;
  out.k = span > 0 ? clamp((t - (times[a] - t0)) / span, 0, 1) : 0;
  return out;
}

export class ReplayRecorder {
  constructor(cfg = REPLAY, createCanvas = domCanvas) {
    this.cfg = cfg;
    this.createCanvas = createCanvas;
    this.cols = Math.ceil(Math.sqrt(cfg.frames));
    this.rows = Math.ceil(cfg.frames / this.cols);
    this.ring = null;                 // rolling buffer { canvas, ctx }, created on first use
    this.times = new Float64Array(cfg.frames);
    this.clips = [];                  // saved: { canvas, ctx, times, start, len, kills: [clip time], score, t }
    this.spare = [];                  // clip atlases waiting to be reused
    this.reset();
  }

  // new run: forget everything, keep the canvases
  reset() {
    this.spare.push(...this.clips);
    this.clips.length = 0;
    this.head = 0;                    // next tile of the ring
    this.count = 0;                   // tiles filled
    this.lastT = -99;
    this.now = 0;
    this.pending = null;              // clip in the making: { kills: [{ t, w }], end }
  }

  // what its atlases hold, bytes (engine/Bytes.js; the perf overlay)
  bytes(seen) { return bytesOf(this, seen); }

  // give the memory back (leaving the game for the title)
  release() {
    this.reset();
    for (const a of [this.ring, ...this.spare]) if (a) a.canvas.width = a.canvas.height = 0;
    this.ring = null;
    this.spare.length = 0;
  }

  // follow a world's kills (and let go of the previous world)
  attach(events) {
    if (this.detach) this.detach();
    this.detach = events.on('kill', (e) => this.onKill(e));
  }

  atlas() {
    const canvas = this.createCanvas(this.cols * this.cfg.w, this.rows * this.cfg.h);
    const ctx = canvas.getContext('2d', { alpha: false });
    return { canvas, ctx, times: new Float64Array(this.cfg.frames), start: 0, len: 0, kills: [], score: 0, t: 0 };
  }

  tileX(i) { return (i % this.cols) * this.cfg.w; }
  tileY(i) { return Math.floor(i / this.cols) * this.cfg.h; }

  // Called every rendered frame with the game canvas; copies it at most `fps` times a second. true = frame taken.
  capture(source, now) {
    this.now = now;
    const c = this.cfg;
    if (now - this.lastT < 1 / c.fps) return false;
    this.lastT = now;
    if (!this.ring) this.ring = this.atlas();
    const g = this.ring.ctx;
    g.imageSmoothingEnabled = true;
    g.drawImage(source, 0, 0, source.width, source.height, this.tileX(this.head), this.tileY(this.head), c.w, c.h);
    this.times[this.head] = now;
    this.head = (this.head + 1) % c.frames;
    this.count = Math.min(this.count + 1, c.frames);
    if (this.pending && now >= this.pending.end) this.save();
    return true;
  }

  onKill({ victim, cause }) {
    if (victim.isPlayer || victim.isCivilian) return;
    const c = this.cfg, t = this.now, k = { t, w: WEIGHT[cause] ?? 1 };
    const p = this.pending;
    if (p && t <= p.end) {
      // another kill before the clip closed: stretch it, as long as the first kill keeps its lead-in
      p.kills.push(k);
      p.end = Math.min(t + c.post, p.kills[0].t + (c.frames - 1) / c.fps - c.lead);
      return;
    }
    if (p) this.save();
    this.pending = { kills: [k], end: t + c.post };
  }

  // close the clip in the making now (level over)
  flush() { if (this.pending) this.save(); }

  // the ring becomes a clip if there is room, or if it beats the weakest one kept (the newer wins a tie)
  save() {
    const p = this.pending;
    this.pending = null;
    if (!this.count) return;
    const score = clipScore(p.kills);
    let clip;
    if (this.clips.length < this.cfg.clips) {
      clip = this.spare.pop() || this.atlas();
      this.clips.push(clip);
    } else {
      clip = this.clips.reduce((worst, c) => (c.score < worst.score || (c.score === worst.score && c.t < worst.t) ? c : worst));
      if (score < clip.score) return;
    }
    clip.ctx.drawImage(this.ring.canvas, 0, 0);
    clip.times.set(this.times);
    clip.start = this.count < this.cfg.frames ? 0 : this.head;
    clip.len = this.count;
    const t0 = this.times[clip.start];
    clip.kills = p.kills.map((k) => k.t - t0);
    clip.score = score;
    clip.t = p.kills[0].t;
  }

  // saved clips in the order they happened
  ordered() { return [...this.clips].sort((a, b) => a.t - b.t); }
}

export class ReplayPlayer {
  constructor(recorder) {
    this.rec = recorder;
    this.clips = [];
    this.pair = { a: 0, b: 0, k: 0 };
    this.i = 0;      // clip playing
    this.t = 0;      // s into it (clip time)
    this.age = 0;    // real s since it started (fade in)
    this.speed = 1;
  }

  // (re)start from the recorder's clips
  start() {
    this.rec.flush();
    this.clips = this.rec.ordered();
    this.i = 0; this.t = 0; this.age = 0;
  }

  stop() { this.clips = []; }

  get ready() { return this.clips.length > 0; }

  update(dt) {
    const clip = this.clips[this.i];
    if (!clip) return;
    this.speed = playbackSpeed(this.t, clip.kills, this.rec.cfg);
    this.t += dt * this.speed;
    this.age += dt;
    const n = clip.times.length;
    const dur = clip.times[(clip.start + clip.len - 1) % n] - clip.times[clip.start];
    if (this.t >= dur) { this.i = (this.i + 1) % this.clips.length; this.t = 0; this.age = 0; }
  }

  // full-screen backdrop: soft upscale, slow push-in, darkened so that the text drawn over it stays readable
  draw(ctx, W, H, time) {
    const clip = this.clips[this.i];
    if (!clip) return;
    const rec = this.rec, c = rec.cfg, s = H / 720;
    const { a, b, k } = framePair(clip.times, clip.start, clip.len, this.t, this.pair);
    const slow = clamp((1 - this.speed) / (1 - c.slow), 0, 1);
    // the middle of the footage (the player) sits at `focus`, left of the score column: zoomed just enough
    // to still cover the screen, then it creeps in and leans in on the kill
    const off = 0.5 - c.focus;
    const z = 1.02 + 2 * off + 0.02 * this.t + 0.05 * slow;
    const dw = W * z, dh = H * z, dx = (W - dw) / 2 - W * off, dy = (H - dh) / 2;
    ctx.fillStyle = '#07030c';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(clip.canvas, rec.tileX(a), rec.tileY(a), c.w, c.h, dx, dy, dw, dh);
    if (k > 0 && b !== a) {
      ctx.globalAlpha = k;
      ctx.drawImage(clip.canvas, rec.tileX(b), rec.tileY(b), c.w, c.h, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = false;
    // night tint, lighter and warmer while it runs slow; each clip fades in from black
    ctx.fillStyle = `rgba(14,4,26,${0.4 - 0.14 * slow})`;
    ctx.fillRect(0, 0, W, H);
    if (slow > 0) {
      ctx.fillStyle = `rgba(255,42,109,${0.07 * slow})`;
      ctx.fillRect(0, 0, W, H);
    }
    const fade = 1 - clamp(this.age / 0.25, 0, 1);
    if (fade > 0) {
      ctx.fillStyle = `rgba(7,3,12,${fade})`;
      ctx.fillRect(0, 0, W, H);
    }
    // tape tag
    const x = 26 * s, y = 30 * s, r = 5 * s;
    ctx.globalAlpha = 0.75;
    if (Math.floor(time * 2) % 2 === 0) {
      ctx.fillStyle = PALETTE.pink;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 1.7, y); ctx.lineTo(x, y + r); ctx.fill();
    }
    ctx.globalAlpha = 1;
    text(ctx, 'REPLAY', x + 16 * s, y, 13 * s, PALETTE.white, { align: 'left', alpha: 0.75 });
    text(ctx, `${this.i + 1}/${this.clips.length}${slow > 0.5 ? '  SLOW' : ''}`, x + 16 * s, y + 18 * s, 10 * s, PALETTE.cyan, { align: 'left', alpha: 0.6 });
  }
}
