// Out of the tutorial's window: nothing is shown (the user found the comic page of the jump ugly), it is heard in the
// dark: the glass, the wind of the fall, him hitting the alley and rolling; then "THE NEXT DAY." is typed and level 1
// opens. leapView(t) is the timeline as plain numbers (unit-tested), drawLeap() the picture, leapBeats() what is
// heard; t: s since the scene began.
import { text } from '../Text.js';
import { clamp } from './Ink.js';

export const LEAP = {
  land: 1.0,              // s: he hits the ground
  later: 1.7,             // "THE NEXT DAY." typed on black
  end: 3.6,
  skipAfter: 0.4,
  line: 'THE NEXT DAY.',
};

const L = LEAP;

// { words (letters of the line shown), over }
export function leapView(t) {
  return { words: t >= L.later ? Math.floor((t - L.later) * 14) : 0, over: t >= L.end };
}

// what is heard between t0 and t1 (s into the scene): [{ name, vol, opts }] for Audio.play
export function leapBeats(t0, t1) {
  const cues = [
    [0.02, 'glass', 1], [0.2, 'gust', 0.8], [L.land, 'bodyFall', 1], [L.land + 0.35, 'rollUp', 1],
  ];
  return cues.filter(([at]) => t0 < at && t1 >= at).map(([, name, vol, opts]) => ({ name, vol, opts: opts || {} }));
}

export function drawLeap(ctx, W, H, t) {
  const v = leapView(t);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  if (v.words > 0) {
    const a = 1 - clamp((t - L.end + 0.4) / 0.4, 0, 1);
    text(ctx, L.line.slice(0, v.words), W / 2, H / 2, 30 * (H / 720), '#f4f0e8', { alpha: a });
  }
  ctx.restore();
}
