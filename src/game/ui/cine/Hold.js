// A comic page (Game states 'cinematic', 'ending', the leap in 'fall') is skipped by HOLDING a key, never by a stray
// key or click: SPACE (a pad's A) held SKIP.hold s goes on; let go before, the fill drains back. A key already down
// when the page opened (the press that started it) must be let go first. HoldSkip is the plain state (unit-tested);
// drawHold() the small hint bottom right: the key's cap, HOLD TO SKIP, a thin bar filling.
import { PALETTE } from '../../Config.js';
import { SKIP } from '../../data/staging.js';
import { keyLabel } from '../../data/controls.js';
import { capWidth, drawCap } from '../Glyphs.js';
import { text } from '../Text.js';
import { clamp } from './Ink.js';

export default class HoldSkip {
  constructor(cfg = SKIP) {
    this.cfg = cfg;
    this.reset();
  }

  // a new page
  reset() {
    this.t = 0;          // s since the page opened
    this.fill = 0;       // 0..1 of the hold
    this.held = false;   // the hold counts this frame
    this.armed = null;   // the key was seen up since the page opened (null: not looked at yet)
    this.done = false;
  }

  // dt: real s; down: the key held. True once, on the frame the hold is full.
  update(dt, down) {
    const c = this.cfg;
    this.t += dt;
    this.armed = this.armed === null ? !down : this.armed || !down;
    this.held = down && this.armed;
    this.fill = this.held ? this.fill + dt / c.hold : Math.max(0, this.fill - (dt * c.drain) / c.hold);
    if (this.done || this.fill < 1) return false;
    this.fill = 1;
    this.done = true;
    return true;
  }

  get k() { return Math.min(1, this.fill); }
  // 0..1: how far the hint is in (it waits SKIP.hint s, then fades in)
  get shown() { return clamp((this.t - this.cfg.hint) / this.cfg.fade, 0, 1); }
}

const BONE = '#e8dcc4';

// the hint, bottom right of a W x H screen: faint at rest, bright while held
export function drawHold(ctx, W, H, hold, device) {
  const a = hold.shown;
  if (a <= 0) return;
  const s = H / 720, h = Math.round(20 * s), size = Math.round(12 * s), m = Math.round(26 * s);
  const label = keyLabel('action', device), words = 'HOLD TO SKIP';
  ctx.save();
  ctx.font = `${size}px joystix, monospace`;
  const ww = ctx.measureText(words).width, cw = capWidth(ctx, label, h), gap = Math.round(8 * s);
  ctx.restore();
  const w = cw + gap + ww, x = W - m - w, y = H - m - h, alpha = a * (hold.held ? 1 : 0.45 + 0.55 * hold.k);
  drawCap(ctx, label, x, y, h, alpha);
  text(ctx, words, x + cw + gap, y, size, BONE, { align: 'left', alpha });
  // the bar under the row: a dark track, the pink fill
  const by = Math.round(y + h / 2 + 6 * s), bh = Math.max(2, Math.round(3 * s));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(Math.round(x) - 1, by - 1, Math.round(w) + 2, bh + 2);
  ctx.fillStyle = '#3a2f48';
  ctx.fillRect(Math.round(x), by, Math.round(w), bh);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(Math.round(x), by, Math.round(w * hold.k), bh);
  ctx.restore();
}
