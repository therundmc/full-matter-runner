// Out of the tutorial's window, told as a comic page (ui/cine/Page.js, painters in ui/cine/Panels.js): he comes
// through the corridor's window in a burst of glass, falls, hits the alley and rolls, and on one knee looks back up
// at his flat burning. The page goes, "THE NEXT DAY." is typed on black, and level 1 opens. leapView(t) is the timeline
// as plain numbers (unit-tested), drawLeap() the picture, leapBeats() what is heard; t: s since the scene began.
import { text } from '../Text.js';
import { drawPage } from './Page.js';
import { paintCrash, paintFall, paintRoll, paintKneel } from './Panels.js';
import { clamp } from './Ink.js';

export const LEAP = {
  panels: [0, 1.5, 3.0, 4.5],   // s each panel drops in
  out: 6.6,                     // the page goes
  later: 7.0,                   // "THE NEXT DAY." typed on black
  end: 8.8,
  skipAfter: 0.4,
  line: 'THE NEXT DAY.',
};

const L = LEAP;
const PAGE = { end: L.out, panels: [
  { r: { x: 12, y: 10, w: 360, h: 96 }, at: L.panels[0], paint: (g, w, h, t) => paintCrash(g, w, h, t, clamp(t / 1.2, 0, 1)),
    sfx: [{ text: 'KRASSH!', at: 0.05, dur: 1.1, x: 290, y: 40, size: 16, col: '#e8f0ff', rot: -0.12 }] },
  { r: { x: 12, y: 112, w: 116, h: 94 }, at: L.panels[1], paint: paintFall },
  { r: { x: 134, y: 112, w: 116, h: 94 }, at: L.panels[2], paint: paintRoll,
    sfx: [{ text: 'THUD', at: 0.05, dur: 0.9, x: 58, y: 24, size: 12, col: '#f2d04a', rot: 0.1 }] },
  { r: { x: 256, y: 112, w: 116, h: 94 }, at: L.panels[3], paint: paintKneel },
] };

// { page (the comic page is up), words (letters of the line shown), over }
export function leapView(t) {
  return { page: t < L.out, words: t >= L.later ? Math.floor((t - L.later) * 14) : 0, over: t >= L.end };
}

// what is heard between t0 and t1 (s into the scene): [{ name, vol, opts }] for Audio.play
export function leapBeats(t0, t1) {
  const cues = [
    [L.panels[0] + 0.02, 'glass', 1], [L.panels[0] + 0.6, 'crackle', 1], [L.panels[1] + 0.1, 'gust', 0.8],
    [L.panels[2] + 0.05, 'bodyFall', 1], [L.panels[2] + 0.4, 'rollUp', 1], [L.panels[3] + 0.3, 'crackle', 0.8],
  ];
  return cues.filter(([at]) => t0 < at && t1 >= at).map(([, name, vol, opts]) => ({ name, vol, opts: opts || {} }));
}

export function drawLeap(ctx, W, H, t) {
  const v = leapView(t);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  if (v.page) drawPage(ctx, W, H, t, PAGE);
  if (v.words > 0) {
    const a = 1 - clamp((t - L.end + 0.4) / 0.4, 0, 1);
    text(ctx, L.line.slice(0, v.words), W / 2, H / 2, 30 * (H / 720), '#f4f0e8', { alpha: a });
  }
  ctx.restore();
}
