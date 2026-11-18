// The title's clocks, as pure functions of t (s on the title, or since the board came up): when the logo's letters
// are lit, what is heard under the poster, when the marker crosses a dead man out. DOM-free: the pictures
// (Poster.js, HitList.js) and the sounds (Game.js) read the same numbers, and the tests too.
import { hash } from '../cine/Ink.js';

// The logo is a neon sign in cut paper: its six letters catch one after the other, each stuttering as it does; then
// the second N fails in fits, and once in a while the whole sign blinks. true: letter i of RUNNER is dark at t.
const SIGN = { first: 0.5, each: 0.24, catching: 0.3, fps: 14, every: 11, blink: 0.25 };
export function logoDead(i, t) {
  const n = Math.floor(t * SIGN.fps), start = SIGN.first + i * SIGN.each;
  if (t < start) return true;
  if (t < start + SIGN.catching) return hash(n * 1.3 + i) < 0.5;
  if (i === 3 && Math.sin(t * 0.9) > 0.6 && hash(n * 1.7) < 0.22) return true;
  return t % SIGN.every > SIGN.every - SIGN.blink && hash(n * 2.3) < 0.6;
}

// What is heard under the poster between t0 and t1: [{ name, vol }] for Audio.play (placeholders, mapped to recorded
// cuts: assets/sound/PLACEHOLDERS.md): the fire's roar and the rain in overlapping pieces, a buzz each time a letter
// of the sign goes dark.
const BED = { titleFire: { every: 1.3, vol: 0.5 }, titleRain: { every: 0.9, vol: 0.35 } };
export function posterBeats(t0, t1) {
  const out = [];
  if (!(t1 > t0)) return out;
  for (const [name, b] of Object.entries(BED)) {
    for (let k = Math.ceil(t0 / b.every); k * b.every < t1; k++) if (k * b.every >= t0) out.push({ name, vol: b.vol * (0.8 + 0.4 * hash(k * 3.7)) });
  }
  for (let n = Math.floor(t0 * SIGN.fps) + 1; n <= Math.floor(t1 * SIGN.fps); n++) {
    const t = n / SIGN.fps, before = (n - 1) / SIGN.fps;
    if ([0, 1, 2, 3, 4, 5].some((i) => logoDead(i, t) && !logoDead(i, before))) out.push({ name: 'neonBuzz', vol: 0.5 });
  }
  return out;
}

// The X on a dead man's card, the first time the board shows him dead: two marker strokes, c s after the board came
// up. crossK(stroke, c): how far stroke 0 or 1 has got, 0..1; crossBeats: the marker heard; over at CROSS.done.
export const CROSS = { at: [0.8, 1.35], dur: 0.32, done: 2.1 };
export const crossK = (stroke, c) => Math.max(0, Math.min(1, (c - CROSS.at[stroke]) / CROSS.dur));
export function crossBeats(c0, c1) {
  return CROSS.at.flatMap((s, i) => (c0 < s && c1 >= s ? [{ name: 'markerStroke', vol: 0.9, opts: { pitch: i ? 1.12 : 1 } }] : []));
}
