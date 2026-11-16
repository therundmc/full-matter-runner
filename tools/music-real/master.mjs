// Mastering and metering for the music extracts (Node): BS.1770 loudness (K-weighted, gated), 4x oversampled true
// peak, a look-ahead true-peak limiter, 16-bit WAV with TPDF dither.
const SR = 44100;

function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function kWeight(x) {
  let K = Math.tan((Math.PI * 1681.974450955533) / SR);
  const Q = 0.7071752369554196, Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = biquad(x, (Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  K = Math.tan((Math.PI * 38.13547087602444) / SR);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  return biquad(s1, 1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0);
}
// integrated loudness (LUFS) and a simple loudness range (short-term 3 s, 10th to 95th percentile)
function loudness(ch) {
  const k = ch.map(kWeight), n = k[0].length;
  const blockMs = (len, hop) => {
    const out = [];
    for (let a = 0; a + len <= n; a += hop) {
      let z = 0;
      for (const c of k) { let s = 0; for (let i = a; i < a + len; i++) s += c[i] * c[i]; z += s / len; }
      out.push(z);
    }
    return out;
  };
  const L = (z) => -0.691 + 10 * Math.log10(z);
  const z400 = blockMs(Math.round(0.4 * SR), Math.round(0.1 * SR)).filter((z) => L(z) > -70);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const rel = L(mean(z400)) - 10;
  const lufs = L(mean(z400.filter((z) => L(z) > rel)));
  const st = blockMs(Math.round(3 * SR), Math.round(1 * SR)).map(L).filter((v) => v > -70);
  const stg = st.filter((v) => v > L(mean(st.map((v2) => Math.pow(10, (v2 + 0.691) / 10)))) - 20).sort((a, b) => a - b);
  const pc = (p) => stg[Math.min(stg.length - 1, Math.floor(p * stg.length))] ?? 0;
  return { lufs, lra: pc(0.95) - pc(0.1) };
}

// 4x oversampling by a windowed sinc (12 taps a side per phase): the peak of each input sample's neighbourhood
const PH = 4, TAPS = 12;
const KERN = (() => {
  const k = [];
  for (let p = 0; p < PH; p++) {
    const h = new Float64Array(2 * TAPS);
    for (let j = 0; j < 2 * TAPS; j++) {
      const m = j - TAPS + 1 - p / PH;
      const s = m === 0 ? 1 : Math.sin(Math.PI * m) / (Math.PI * m);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * m) / (TAPS + 1));
      h[j] = s * w;
    }
    k.push(h);
  }
  return k;
})();
function truePeakEnv(x) {
  const n = x.length, env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Math.abs(x[i]);
    for (let p = 1; p < PH; p++) {
      const h = KERN[p];
      let s = 0;
      for (let j = 0; j < 2 * TAPS; j++) { const idx = i + j - TAPS + 1; if (idx >= 0 && idx < n) s += x[idx] * h[j]; }
      if (Math.abs(s) > m) m = Math.abs(s);
    }
    env[i] = m;
  }
  return env;
}
const db = (v) => +(20 * Math.log10(v)).toFixed(2);

export function measure(ch) {
  let peak = 0, tp = 0;
  for (const c of ch) { for (const v of c) peak = Math.max(peak, Math.abs(v)); for (const v of truePeakEnv(c)) tp = Math.max(tp, v); }
  const { lufs, lra } = loudness(ch);
  return { peak: db(peak), truePeak: db(tp), lufs: +lufs.toFixed(2), lra: +lra.toFixed(1) };
}

// gain to the target loudness (limitedShare: % of the time the limiter takes more than 1 dB), then a look-ahead limiter on the true-peak envelope down to the ceiling (dBTP);
// two passes so the loudness lost to limiting is made up
export function master(ch, { lufs = -11, ceiling = -1.2, lookMs = 3, releaseMs = 90 } = {}) {
  const ceil = Math.pow(10, ceiling / 20), L = Math.round((lookMs / 1000) * SR), a = 1 - Math.exp(-1 / ((releaseMs / 1000) * SR));
  const n = ch[0].length;
  let gain = Math.pow(10, (lufs - loudness(ch).lufs) / 20), out = null, maxGr = 0, grOver1 = 0;
  const fade = Math.round(1.2 * SR);
  for (let pass = 0; pass < 3; pass++) {
    const env = new Float32Array(n);
    for (const c of ch) { const e = truePeakEnv(c); for (let i = 0; i < n; i++) env[i] = Math.max(env[i], e[i] * gain); }
    const req = new Float32Array(n);
    for (let i = 0; i < n; i++) req[i] = env[i] > ceil * 0.985 ? (ceil * 0.985) / env[i] : 1;
    // sliding minimum over the look-ahead, release, then a box average over the look-ahead
    const h = new Float32Array(n);
    const dq = [];
    for (let i = n - 1; i >= 0; i--) {
      while (dq.length && req[dq[dq.length - 1]] >= req[i]) dq.pop();
      dq.push(i);
      while (dq[0] >= i + L) dq.shift();
      h[i] = req[dq[0]];
    }
    const r = new Float32Array(n);
    let g = 1;
    for (let i = 0; i < n; i++) { g = Math.min(h[i], g + (1 - g) * a); r[i] = g; }
    const s = new Float32Array(n);
    let acc = L; // the window starts full of unity gain
    for (let i = 0; i < n; i++) { acc += r[i] - (i >= L ? r[i - L] : 1); s[i] = acc / L; }
    out = ch.map((c) => {
      const y = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const f = i > n - fade ? (n - i) / fade : 1;
        y[i] = c[i] * gain * s[i] * f;
      }
      return y;
    });
    maxGr = 1; grOver1 = 0; for (const v of s) { if (v < maxGr) maxGr = v; if (v < 0.891) grOver1++; } grOver1 /= n;
    const got = loudness(out).lufs;
    if (Math.abs(got - lufs) < 0.15) break;
    gain *= Math.pow(10, (lufs - got) / 20);
  }
  return { out, gainDb: db(gain), maxGr: db(maxGr), limitedShare: +(100 * grOver1).toFixed(2) };
}

export function wav16(ch, seed = 12345) {
  const n = ch[0].length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let s = seed;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      const v = ch[c][i] * 32767 + (rnd() - rnd());
      buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v))), 44 + (i * 2 + c) * 2);
    }
  }
  return buf;
}

// the share of the energy per band (%), the two channels summed: a rough look at the tonal balance
const BANDS = [['sub', 0, 60], ['bass', 60, 250], ['lowmid', 250, 1000], ['mid', 1000, 4000], ['high', 4000, 22050]];
export function bands(ch) {
  const N = 4096, acc = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N);
  for (let a = 0; a + N <= ch[0].length; a += N) {
    for (let i = 0; i < N; i++) { re[i] = (ch[0][a + i] + ch[1][a + i]) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))); im[i] = 0; }
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const w = (-2 * Math.PI) / len;
      for (let i = 0; i < N; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const c = Math.cos(w * k), s = Math.sin(w * k), p = i + k, q = p + len / 2;
          const tr = re[q] * c - im[q] * s, ti = re[q] * s + im[q] * c;
          re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        }
      }
    }
    for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  const tot = acc.reduce((s, v) => s + v, 0) || 1;
  return Object.fromEntries(BANDS.map(([name, lo, hi]) => {
    let s = 0;
    for (let k = Math.ceil((lo * N) / SR); k < Math.min(N / 2, (hi * N) / SR); k++) s += acc[k];
    return [name, Math.round((100 * s) / tot)];
  }));
}
