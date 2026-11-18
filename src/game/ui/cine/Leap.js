// Out of the tutorial's window: the jump itself is not shown (the user found the comic page of it ugly), it is heard
// in the dark: the glass, the wind of the fall, him hitting the alley and rolling. Then a title card: one wide comic
// panel drops in, the alley in the rain where he came down (tools/generate_comic.py 'alley': him sat against the
// wall, the street's neon at the far end), and "THE NEXT DAY." is typed in its caption box; level 1 opens on him
// waking there. leapView(t) is the timeline as plain numbers (unit-tested), drawLeap() the picture, leapBeats() what
// is heard; t: s since the scene began.
import { LW, LH } from '../title/Draw.js';
import { text } from '../Text.js';
import { drawPanel, caption, still, fine } from './Panels.js';
import { clamp, hash, px, line } from './Ink.js';

export const LEAP = {
  land: 1.0,              // s: he hits the ground
  later: 1.7,             // the card drops in ...
  type: 2.05,             // ... and "THE NEXT DAY." is typed in its caption
  end: 4.4,
  skipAfter: 0.4,
  line: 'THE NEXT DAY.',
};

const L = LEAP;
const CARD = { x: 24, y: 40, w: 336, h: 136 };   // the panel, in the title's logical px (its still is 3 x that)
const SIZE = 8, PER = 14;                        // the caption's lettering (logical px), letters typed a second

// { card (0..1: how far the panel is in, the way out included), words (letters of the line shown), over }
export function leapView(t) {
  return {
    card: clamp((t - L.later) / 0.3, 0, 1) * clamp((L.end - t) / 0.35, 0, 1),
    words: t >= L.type ? Math.min(L.line.length, Math.floor((t - L.type) * PER)) : 0,
    over: t >= L.end,
  };
}

// what is heard between t0 and t1 (s into the scene): [{ name, vol, opts }] for Audio.play
export function leapBeats(t0, t1) {
  const cues = [
    [0.02, 'glass', 1], [0.2, 'gust', 0.8], [L.land, 'bodyFall', 1], [L.land + 0.35, 'rollUp', 1],
  ];
  return cues.filter(([at]) => t0 < at && t1 >= at).map(([, name, vol, opts]) => ({ name, vol, opts: opts || {} }));
}

// the alley's still and what moves in it (its px, generate_comic.py ALLEY_END / ALLEY_PUDDLES): the rain coming
// down, rings on the puddles, the far sign's flicker
const SIGN = [604, 134, 62, 10];
const PUDDLES = [[540, 360, 90, 12], [250, 392, 120, 10], [820, 390, 70, 8]];
function paintAlley(g, w, h, t) {
  still(g, 'alley', w, h);
  fine(g, () => {
    if (hash(Math.floor(t * 14)) < 0.07) px(g, '#8a1d5c', ...SIGN);
    if (hash(Math.floor(t * 9) + 40) < 0.05) px(g, '#8a1d5c', 648, 150, 36, 12);        // the cyan one too, less often
    const dk = (t % 1.6) / 0.5;                                                         // a drip off the fire escape
    if (dk < 1) px(g, '#5a5e96', 846, 170 + dk * dk * 76, 2, 7);
    else if (dk < 1.3) px(g, '#5a5e96', 842, 246, 10, 2);
    g.lineWidth = 2;
    PUDDLES.forEach(([cx, cy, rx], j) => {
      for (let r = 0; r < 2; r++) {
        const p = (t + j * 0.37 + r * 0.45) / 0.9, u = p % 1, n = Math.floor(p);
        g.strokeStyle = `rgba(150, 70, 140, ${(0.7 * (1 - u)).toFixed(3)})`;
        g.beginPath();
        g.ellipse(cx + (hash(n * 7 + j + r * 3) - 0.5) * rx * 1.4, cy, 4 + 26 * u, 1 + 4 * u, 0, 0, Math.PI * 2);
        g.stroke();
      }
    });
    for (let i = 0; i < 80; i++) {
      const u = (t * (1.3 + hash(i) * 0.7) + hash(i + 1)) % 1, x = hash(i + 2) * 1100 - u * 60, y = -24 + u * 450, l = 12 + hash(i + 3) * 16;
      line(g, i % 4 ? '#262840' : '#4e5076', x, y, x - l * 0.16, y + l, 2);
    }
  });
}

export function drawLeap(ctx, W, H, t) {
  const v = leapView(t);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  if (v.card > 0) {
    const sc = Math.max(W / LW, H / LH), ox = (W - LW * sc) / 2, oy = (H - LH * sc) / 2;
    ctx.setTransform(sc, 0, 0, sc, ox, oy);
    ctx.imageSmoothingEnabled = false;
    drawPanel(ctx, CARD, v.card, (g, w, h) => paintAlley(g, w, h, t - L.later));
    if (t >= L.type) {
      // the caption box, the size of the whole line from the start, the words typed into it
      ctx.font = `${Math.round(SIZE * sc)}px joystix, monospace`;
      const bw = ctx.measureText(L.line).width / sc + 8, bh = SIZE + 6, x = CARD.x + 4, y = CARD.y + 4;
      ctx.globalAlpha = clamp(v.card * 4 - 3, 0, 1);
      caption(ctx, x, y, bw, bh);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      text(ctx, L.line.slice(0, v.words), ox + (x + 4) * sc, oy + (y + bh / 2 + 0.5) * sc, SIZE * sc, '#140c10',
        { align: 'left', outline: false, shadow: null });
    }
  }
  ctx.restore();
}
