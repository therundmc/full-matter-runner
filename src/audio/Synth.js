// Building blocks of the synthesized foley (audio/Foley.js holds the recipes), plain JS on Float32Arrays, DOM-free:
//   knock   what is struck: a short shaped noise burst (the contact) ringing a handful of decaying modes (the object)
//   rub     friction and cloth: noise through a band that moves with the speed, shaken by a random flutter, and
//           optionally ringing what it rubs on (a car hood)
//   grains  many tiny impacts: grit under a shoe, the wires of a chain-link mesh, embers popping
//   whoosh  air torn by something swung or thrown: a band that rises and falls with its speed (spun: pulsing)
// render(recipe, sr, seed) draws every number given as a range [lo, hi] once per variation (seeded), sums the
// layers and normalizes the result to the recipe's level.

const TAU = Math.PI * 2;

// seeded generator (mulberry32): a variation is the same sound every time it is baked
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a number, or one drawn from [lo, hi] (frequencies, times and levels of a variation)
const pick = (r, v) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * r() : v);
const logPick = (r, [lo, hi]) => lo * (hi / lo) ** r();

// breakpoints [[t 0..1, value], ...] read at u (linear between them)
function curve(pts, u) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (u <= t1) {
      const [t0, v0] = pts[i - 1];
      return v0 + ((v1 - v0) * (u - t0)) / (t1 - t0 || 1);
    }
  }
  return pts[pts.length - 1][1];
}

// one decaying mode (two-pole resonator, f Hz, tau s) excited by x, added into out from `at` (samples), peak `amp`
function ring(out, x, at, sr, f, tau, amp) {
  if (f >= sr * 0.45 || amp <= 0) return;
  const r = Math.exp(-1 / (tau * sr)), a1 = 2 * r * Math.cos((TAU * f) / sr), a2 = r * r;
  const n = Math.min(out.length - at, Math.ceil(tau * sr * 7) + x.length);
  const y = new Float32Array(Math.max(0, n));
  let y1 = 0, y2 = 0, peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const v = (i < x.length ? x[i] : 0) + a1 * y1 - a2 * y2;
    y2 = y1; y1 = v; y[i] = v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  const k = amp / peak;
  for (let i = 0; i < n; i++) out[at + i] += y[i] * k;
}

// the contact: white noise under a half sine of `len` s, softened by a one-pole lowpass at `lp` Hz (a boot, a
// palm) or left sharp (steel on steel)
function burst(r, sr, len, lp) {
  const n = Math.max(2, Math.round(len * sr)), x = new Float32Array(n);
  const k = lp ? 1 - Math.exp((-TAU * lp) / sr) : 1;
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += k * (r() * 2 - 1 - s);
    x[i] = s * Math.sin((Math.PI * (i + 0.5)) / n);
  }
  return x;
}

const peakOf = (x) => { let p = 1e-9; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };

// state-variable filter (topology preserving: stable while its frequency moves); returns a stepper. Bands are run
// through two of them: a single stage lets so much white noise through its skirts that every band sounds bright
function svf() {
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0, k = 1;
  return {
    set(f, q, sr) {
      const g = Math.tan((Math.PI * Math.min(f, sr * 0.45)) / sr);
      k = 1 / q; a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    },
    bp(x) {
      const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      return v1;
    },
  };
}

// a slow random wobble around 1 (rate Hz, depth 0..1): cloth catching, a body rolling over its bumps
function flutter(r, sr, n, rate, depth) {
  const m = new Float32Array(n), step = Math.max(1, Math.round(sr / rate));
  let a = r(), b = r();
  for (let i = 0; i < n; i++) {
    if (i % step === 0) { a = b; b = r(); }
    const u = (i % step) / step, s = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    m[i] = 1 - depth + depth * 2 * s * s;
  }
  return m;
}

// ---- layers: (out, sr, r, p) with the variation's numbers already drawn (p.at s from the start) ----
const LAYERS = {
  // modes: [[f, tau, amp], ...] (each detuned by up to +-jit), contact s, lp Hz, click: share of the bare contact
  knock(out, sr, r, p) {
    const at = Math.round(p.at * sr), x = burst(r, sr, p.contact ?? 0.003, p.lp);
    const tmp = new Float32Array(out.length - at);
    for (const [f, tau, amp] of p.modes || []) {
      ring(tmp, x, 0, sr, pick(r, f) * (1 + (p.jit ?? 0.04) * (r() * 2 - 1)), pick(r, tau), pick(r, amp));
    }
    const px = peakOf(x), click = p.click ?? 0.3;
    for (let i = 0; i < x.length && i < tmp.length; i++) tmp[i] += (x[i] / px) * click;
    mixIn(out, tmp, at, p.amp);
  },
  // f: Hz or breakpoints over the layer, q, env: breakpoints of level over the layer, flutter: [rate, depth],
  // ring: modes the rubbing makes sing (fed the rubbed noise), wet: their share
  rub(out, sr, r, p) {
    const at = Math.round(p.at * sr), n = Math.min(out.length - at, Math.round(p.dur * sr));
    if (n <= 0) return;
    const tmp = new Float32Array(n), F = svf(), F2 = svf(), fl = p.flutter ? flutter(r, sr, n, p.flutter[0], p.flutter[1]) : null;
    const env = p.env || [[0, 0], [0.15, 1], [1, 0]], fc = Array.isArray(p.f) ? p.f : [[0, p.f], [1, p.f]];
    for (let i = 0; i < n; i++) {
      if (i % 16 === 0) { const f = curve(fc, i / n), q = 0.65 * (p.q ?? 0.7); F.set(f, q, sr); F2.set(f, q, sr); }
      tmp[i] = F2.bp(F.bp(r() * 2 - 1)) * curve(env, i / n) * (fl ? fl[i] : 1);
    }
    if (p.ring) {
      const wet = new Float32Array(n + Math.round(sr * 0.3));
      for (const [f, tau, amp] of p.ring) ring(wet, tmp, 0, sr, pick(r, f) * (1 + 0.03 * (r() * 2 - 1)), tau, amp);
      const k = (p.wet ?? 0.5) * peakOf(tmp) / peakOf(wet);
      const all = new Float32Array(wet.length);
      for (let i = 0; i < all.length; i++) all[i] = (tmp[i] || 0) * (1 - (p.wet ?? 0.5)) + wet[i] * k;
      mixIn(out, all, at, p.amp);
      return;
    }
    mixIn(out, tmp, at, p.amp);
  },
  // n grains spread over dur (shape 'decay' crowds them at the start, 'flat' evenly), each a tiny contact ringing
  // one mode drawn in f [lo, hi] (log) with tau [lo, hi], amp [lo, hi]
  grains(out, sr, r, p) {
    const at = Math.round(p.at * sr), n = Math.round(pick(r, p.n)), tmp = new Float32Array(out.length - at);
    for (let g = 0; g < n; g++) {
      const u = p.shape === 'flat' ? r() : r() ** 2;
      const t0 = Math.round(u * p.dur * sr);
      if (t0 >= tmp.length) continue;
      const fade = p.shape === 'flat' ? 1 : 1 - 0.7 * u;
      const x = burst(r, sr, p.len ?? 0.0006, 0);
      ring(tmp, x, t0, sr, logPick(r, p.f), pick(r, p.tau), pick(r, p.a) * fade);
    }
    mixIn(out, tmp, at, p.amp);
  },
  // air: the object's speed is a bell over dur peaking at `peak` (0..1); the band climbs from f[0] to f[1] with it,
  // the level goes as the speed cubed; edge: level of the thin whistle an octave and more over it; spinHz, spinDepth:
// a thrown thing turning over and over
  whoosh(out, sr, r, p) {
    const at = Math.round(p.at * sr), n = Math.min(out.length - at, Math.round(p.dur * sr));
    if (n <= 0) return;
    const tmp = new Float32Array(n), F = svf(), F2 = svf(), G = svf(), pk = p.peak ?? 0.55, [f0, f1] = p.f;
    const spin = p.spinHz ? [p.spinHz, p.spinDepth ?? 0.7] : null, ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const u = i / n, s = u < pk ? Math.sin((Math.PI / 2) * (u / pk)) : Math.cos((Math.PI / 2) * ((u - pk) / (1 - pk)));
      if (i % 16 === 0) {
        F.set(f0 + (f1 - f0) * s, 0.65 * (p.q ?? 1), sr);
        F2.set(f0 + (f1 - f0) * s, 0.65 * (p.q ?? 1), sr);
        G.set((f0 + (f1 - f0) * s) * 2.3, (p.q ?? 1) * 1.5, sr);
      }
      const w = r() * 2 - 1, sp = spin ? 1 - spin[1] + spin[1] * (0.5 + 0.5 * Math.cos(TAU * spin[0] * (i / sr) + ph)) ** 2 : 1;
      tmp[i] = (F2.bp(F.bp(w)) + (p.edge ?? 0.2) * G.bp(w)) * s * s * s * sp;
    }
    mixIn(out, tmp, at, p.amp);
  },
};

// add `src` scaled to peak `amp` into out at sample `at`
function mixIn(out, src, at, amp = 1) {
  const k = amp / peakOf(src);
  for (let i = 0; i < src.length && at + i < out.length; i++) out[at + i] += src[i] * k;
}

// draws a variation of the layer: every [lo, hi] number becomes one value; mode lists, grain ranges and envelopes
// keep theirs (each mode, each grain draws its own); f of a rub may be breakpoints [[t, Hz or [lo, hi]], ...]
const KEEP = new Set(['modes', 'ring', 'env', 'flutter', 'n', 'tau', 'a', 'f']);
function draw(r, layer) {
  const p = {};
  for (const k in layer) p[k] = KEEP.has(k) ? layer[k] : pick(r, layer[k]);
  if (layer.k === 'whoosh') p.f = layer.f.map((v) => pick(r, v));
  if (layer.k === 'rub') p.f = Array.isArray(layer.f) && Array.isArray(layer.f[0]) ? layer.f.map(([t, v]) => [t, pick(r, v)]) : pick(r, layer.f);
  return p;
}

// one variation of a recipe { level, dur, layers }: mono samples at sr, peak = level, faded in and out, trimmed
export function render(recipe, sr, seed) {
  const r = rng(seed), len = Math.round((recipe.dur + 0.4) * sr), out = new Float32Array(len);
  for (const layer of recipe.layers) {
    if (layer.odds !== undefined && r() > layer.odds) continue;
    LAYERS[layer.k](out, sr, r, draw(r, layer));
  }
  let end = len;
  const floor = peakOf(out) * 0.0015;
  while (end > 1 && Math.abs(out[end - 1]) < floor) end--;
  const res = out.slice(0, Math.max(end, 2)), fadeOut = Math.min(res.length, Math.round(sr * 0.008));
  for (let i = 0; i < Math.min(res.length, 8); i++) res[i] *= i / 8;
  for (let i = 0; i < fadeOut; i++) res[res.length - 1 - i] *= i / fadeOut;
  const k = recipe.level / peakOf(res);
  for (let i = 0; i < res.length; i++) res[i] *= k;
  return res;
}

export const LAYER_KINDS = Object.keys(LAYERS);
