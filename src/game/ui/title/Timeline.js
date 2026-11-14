// Timeline of the title scene: everything that changes, as a pure function of t (seconds): the wind and its gusts,
// the moods of the neon sign (each part has its own flicker), the chase of the arrow's bulbs, the car passing behind
// the viewer and the far sheet lightning. DOM-free and stateless, so any instant can be asked on its own (and tested).

export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

// ---------------------------------------------------------------- wind
// One gust per slot, starting 0..jitter s into it (so 7 to 13 s apart), rising, holding, dying; its peak varies.
export const GUST = { slot: 10, jitter: 3, rise: 0.6, hold: [1.5, 3], fall: 1.5 };

function gustOf(k) {
  const start = k * GUST.slot + hash(k * 1.37 + 5.1) * GUST.jitter;
  const hold = GUST.hold[0] + hash(k * 2.11 + 0.7) * (GUST.hold[1] - GUST.hold[0]);
  return { k, start, hold, end: start + GUST.rise + hold + GUST.fall, peak: 0.86 + 0.14 * hash(k * 3.3 + 1.9) };
}
function envelope(g, t) {
  const a = t - g.start;
  if (a <= 0 || t >= g.end) return 0;
  const up = smooth(0, GUST.rise, a), down = 1 - smooth(GUST.rise + g.hold, GUST.rise + g.hold + GUST.fall, a);
  const flutter = 0.9 + 0.1 * Math.sin(a * 5.3 + g.k) * Math.sin(a * 2.1 + 1);     // the gust is not a plateau
  return g.peak * up * down * flutter;
}
// The wind blows toward the left. gust 0..1; breeze 0.06..0.38 (slow turbulence); speed = breeze + gust;
// angle of the falling rain from the vertical (deg): about 8 when calm, 30 to 35 at the top of a gust; slant = tan;
// last = the latest gust begun (start, end, k: its index, for anything that rides it).
export function windState(t) {
  const k = Math.floor(t / GUST.slot);
  let last = gustOf(k);
  if (t < last.start) last = gustOf(k - 1);
  const gust = envelope(last, t);
  const breeze = 0.22 + 0.08 * Math.sin(t * 0.31) + 0.05 * Math.sin(t * 0.77 + 1.3) + 0.03 * Math.sin(t * 1.9 + 0.4);
  const angle = 6 + 9 * breeze + 26 * gust;
  return { gust, breeze, speed: breeze + gust, angle, slant: Math.tan(angle * Math.PI / 180), last };
}

// ---------------------------------------------------------------- the neon sign
// main: B and A, steady with a hum, the whole sign stuttering now and then (mains); R: the faulty letter, dropping out
// for a moment every 9.3 s slot; strike: seconds since the R caught again (sparks fall from its electrode), or -1;
// glass: breathing slowly; bubbles: the three bubbles of the glass lighting in turn; border: the violet frame
// buzzing; corner: its dead corner segment, now and then trying to catch. All in [0, 1].
const R_SLOT = 9.3;
function rEpisode(k) {
  const start = k * R_SLOT + 2 + hash(k + 3.3) * 4, dur = 0.8 + hash(k + 4.4) * 2.2;
  return { start, end: start + dur };
}
export function signState(t) {
  let main = 0.94 + 0.03 * Math.sin(t * 37) * Math.sin(t * 5.3);
  const slot = Math.floor(t / 4.7), st = slot * 4.7 + hash(slot) * 3.6;
  if (hash(slot + 0.5) < 0.6 && t > st && t < st + 0.18 + hash(slot + 0.7) * 0.5) main = hash(Math.floor(t * 22)) > 0.45 ? 0.95 : 0.12;
  let R = 1, strike = -1;
  const k = Math.floor(t / R_SLOT);
  for (const e of [rEpisode(k - 1), rEpisode(k)]) {
    if (t > e.start - 0.5 && t < e.end + 0.4) {
      if (t < e.start || t > e.end) R = hash(Math.floor(t * 30)) > 0.5 ? 1 : 0.15;
      else R = hash(Math.floor(t * 9)) > 0.93 ? 0.5 : 0.04;
    }
    if (t >= e.end && t < e.end + 1.2) strike = t - e.end;
  }
  const up = main > 0.5;
  const glass = up ? 0.8 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.15)) : 0.4;
  const bub = Math.floor(t * 2.2) % 4;
  const bubbles = [0, 1, 2].map((i) => (up && bub === i ? 1 : 0));
  const border = (up ? 0.86 + 0.08 * hash(Math.floor(t * 50)) : 0.2);
  const cs = Math.floor(t / 3.1), ct = t - cs * 3.1;
  const tries = hash(cs + 8.8) < 0.7 && ct < 0.25 + hash(cs + 9.9) * 0.6;
  const corner = up && tries && hash(Math.floor(t * 16)) > 0.45 ? 0.9 : 0.06;
  return { main, R: R * main, strike, glass, bubbles, border, corner };
}

// The arrow's bulbs chase toward its head (higher index): two on, one off, stepping `rate` times a second.
// A filament takes a moment to warm and to cool. Two bulbs are dead, one flickers.
export const BULBS = { n: 11, rate: 5, dead: [3, 8], flick: 6 };
export const chaseOn = (i, step) => ((i - step) % 3 + 3) % 3 !== 0;
export function bulbState(t) {
  const step = Math.floor(t * BULBS.rate), f = t * BULBS.rate - step;
  const out = [];
  for (let i = 0; i < BULBS.n; i++) {
    if (BULBS.dead.includes(i)) { out.push(0); continue; }
    const on = chaseOn(i, step), was = chaseOn(i, step - 1);
    let b = on ? (was ? 1 : 0.45 + 0.55 * Math.min(1, f * 4)) : (was ? Math.max(0.1, 1 - f * 3) : 0.1);
    if (i === BULBS.flick) b *= hash(Math.floor(t * 17) + 0.3) > 0.35 ? 1 : 0.2;
    out.push(b);
  }
  return out;
}

// the pawn shop's fluorescent tube: a buzz in its light, and every 6 s slot or so a short drop-out with stutters
export function tubeState(t) {
  const k = Math.floor(t / 6.2), s = k * 6.2 + 1 + hash(k + 12.1) * 3.5, d = 0.15 + hash(k + 13.3) * 0.5;
  if (hash(k + 14.7) < 0.75 && t > s && t < s + d) return hash(Math.floor(t * 26)) > 0.6 ? 0.7 : 0.08;
  return 0.92 + 0.06 * hash(Math.floor(t * 40));
}

// ---------------------------------------------------------------- events
// a car passing behind the viewer every 8 to 12 s: progress of its sweep, or null
export function sweepState(t) {
  const k = Math.floor(t / 10), start = k * 10 + 2 + hash(k + 9.1) * 2, dur = 2.4;
  if (t < start || t > start + dur) return null;
  const p = (t - start) / dur;
  return { p, dir: hash(k + 2.2) < 0.5 ? 1 : -1, a: Math.sin(p * Math.PI) };
}

// silent sheet lightning far behind the skyline, every 25 to 45 s: two quick flickers and a short afterglow.
// flash 0..1 (0 most of the time); x: where along the skyline (logical px).
export const LIGHTNING = { slot: 35, jitter: 10, len: 0.75 };
export function lightningState(t) {
  const k = Math.floor(t / LIGHTNING.slot), s = k * LIGHTNING.slot + hash(k * 1.91 + 7.7) * LIGHTNING.jitter, a = t - s;
  const x = 40 + hash(k + 4.4) * 300;
  if (a < 0 || a > LIGHTNING.len) return { flash: 0, x };
  const pulse = (c, w) => Math.max(0, 1 - Math.abs(a - c) / w);
  const d2 = 0.17 + hash(k + 2.2) * 0.13;
  const glow = 0.18 * smooth(d2, d2 + 0.05, a) * (1 - smooth(d2 + 0.05, LIGHTNING.len, a));
  const flash = Math.max(pulse(0.04, 0.04), (0.75 + 0.25 * hash(k + 6.6)) * pulse(d2, 0.07), glow);
  return { flash: clamp(flash, 0, 1), x };
}
