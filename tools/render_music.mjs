// Renders the soundtrack's tracks offline on the game's real music engine (audition.html's renderTrack, an
// OfflineAudioContext in headless Edge) and measures them.
//   node tools/render_music.mjs [--wav] [--layers] [--only id,id] [--port n]
// Each level track climbs the way the audition's CLIMB does: calm 4 bars, tense 4, the fight 4, then a kill every 2
// bars up to a chain of 5 (about 45 to 50 s); the menu track plays its first 25 bars. Printed per part (calm, tense,
// fight, chain 5): RMS and peak (dBFS), the share of the energy per band; with --layers, each layer's RMS and the
// kick's onsets against the grid.
// --wav writes audition/<id>.wav (mono, 22.05 kHz, 16-bit, the same gain for every track); --layers also renders
// each layer alone at the top of a chain (its RMS); 'synthwave' (the current score) is measured for reference.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launchBrowser, sleep, CDP } from './qa/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const WAV_GAIN = 2; // the extracts are the engine's output at +6 dB: the same for all, comparable, under 0 dBFS
const BARS = 23;    // bars of a level track's extract
const MENU_BARS = 25;

// ---------------------------------------------------------------- analysis
const dbfs = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity).toFixed(1);
function rmsPeak(x, a = 0, b = x.length) {
  let s = 0, p = 0;
  for (let i = a; i < b; i++) { s += x[i] * x[i]; p = Math.max(p, Math.abs(x[i])); }
  return { rms: Math.sqrt(s / Math.max(1, b - a)), peak: p };
}
// radix-2 FFT magnitudes squared of a Hann-windowed frame
function power(frame) {
  const n = frame.length, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const w = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(w * k), s = Math.sin(w * k), a = i + k, b = a + len / 2;
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  const out = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = re[i] * re[i] + im[i] * im[i];
  return out;
}
const BANDS = [['sub', 0, 60], ['bass', 60, 250], ['lowmid', 250, 1000], ['mid', 1000, 4000], ['high', 4000, 22050]];
function bands(x, sr, a, b) {
  const N = 4096, acc = new Float64Array(N / 2);
  for (let i = a; i + N <= b; i += N) { const p = power(x.subarray(i, i + N)); for (let k = 0; k < N / 2; k++) acc[k] += p[k]; }
  const tot = acc.reduce((s, v) => s + v, 0) || 1;
  return Object.fromEntries(BANDS.map(([name, lo, hi]) => {
    let s = 0;
    for (let k = Math.ceil((lo * N) / sr); k < Math.min(N / 2, (hi * N) / sr); k++) s += acc[k];
    return [name, Math.round((100 * s) / tot)];
  }));
}
// the onsets of a part played alone (its peak-held envelope rising through half its peak) against the 16th grid
// that starts at t0: how many, mean / max ms off
function onsets(x, sr, t0, step) {
  const peak = rmsPeak(x).peak, rel = Math.exp(-1 / (0.03 * sr));
  let env = 0, armed = true, n = 0, sum = 0, max = 0;
  for (let i = 0; i < x.length; i++) {
    env = Math.max(Math.abs(x[i]), env * rel);
    if (armed && env > 0.5 * peak) {
      const t = i / sr - t0, off = Math.abs(t / step - Math.round(t / step)) * step * 1000;
      n++; sum += off; max = Math.max(max, off);
      armed = false;
    } else if (!armed && env < 0.3 * peak) armed = true;
  }
  return { onsets: n, meanMs: +(sum / Math.max(1, n)).toFixed(2), maxMs: +max.toFixed(2) };
}

// 44.1 kHz -> 22.05 kHz: a windowed-sinc lowpass at 10 kHz, then every other sample
function decimate(x) {
  const taps = 63, h = new Float64Array(taps), fc = 10000 / 44100;
  let s = 0;
  for (let i = 0; i < taps; i++) {
    const m = i - (taps - 1) / 2;
    h[i] = (m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m)) * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)));
    s += h[i];
  }
  const out = new Float32Array(Math.floor(x.length / 2));
  for (let o = 0; o < out.length; o++) {
    let acc = 0;
    for (let i = 0; i < taps; i++) { const j = 2 * o + i - (taps - 1) / 2; if (j >= 0 && j < x.length) acc += h[i] * x[j]; }
    out[o] = acc / s;
  }
  return out;
}
function wav(x, sr, gain) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(x.length * 2, 40);
  const n = x.length, fade = Math.floor(sr * 0.6);
  for (let i = 0; i < n; i++) {
    const f = i > n - fade ? (n - i) / fade : 1;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * gain * f * 32767))), 44 + i * 2);
  }
  return buf;
}

// ---------------------------------------------------------------- run
let server = null, browser = null;
try {
  server = await startServer({ port: +opt('--port', 8240), quiet: true });
  browser = await launchBrowser({ width: 900, height: 700 });
  const page = browser.page;
  page.on('Runtime.exceptionThrown', (p) => console.log('[EXCEPTION]', CDP.exceptionText(p.exceptionDetails)));
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Page.navigate', { url: server.url + 'audition.html' });
  for (let i = 0; i < 50 && !(await page.eval('typeof window.renderTrack === "function"').catch(() => false)); i++) await sleep(200);
  const tracks = await page.eval('window.auditionTracks()');
  const only = opt('--only', null)?.split(',');
  const render = async (id, o) => {
    const r = await page.eval(`window.renderTrack(${JSON.stringify(id)}, ${JSON.stringify(o)})`, { timeout: 300000 });
    const b = Buffer.from(r.data, 'base64');
    return { x: new Float32Array(b.buffer, b.byteOffset, b.length / 4), sr: r.sampleRate, width: r.width };
  };
  const report = {};
  for (const t of tracks) {
    if (only && !only.includes(t.id)) continue;
    const bar = 240 / t.bpm, seconds = (t.menu ? MENU_BARS : BARS) * bar;
    const script = t.menu ? [] : [[0, 0], [4 * bar - 0.4, 1], [7.5 * bar, 2], [12 * bar - 0.4, 3], [14 * bar - 0.4, 4],
      [16 * bar - 0.4, 5], [18 * bar - 0.4, 6], [20 * bar - 0.4, 7]];
    const t0 = Date.now();
    const { x, sr, width } = await render(t.id, { seconds, script });
    const parts = t.menu ? { intro: [0.5, 8], groove: [8.5, 16], hook: [16.5, 25] }
      : { calm: [0.5, 4], tense: [4.5, 7.5], fight: [8.2, 12], 'chain 5': [20.2, 23] };
    const R = { seconds: +seconds.toFixed(1), width: +width.toFixed(2), renderS: (Date.now() - t0) / 1000, parts: {} };
    const all = rmsPeak(x);
    R.peak = dbfs(all.peak);
    for (const [name, [a, b]] of Object.entries(parts)) {
      const i0 = Math.floor(a * bar * sr), i1 = Math.floor(b * bar * sr), m = rmsPeak(x, i0, i1);
      R.parts[name] = { rms: dbfs(m.rms), peak: dbfs(m.peak), bands: bands(x, sr, i0, i1) };
    }
    if (flag('--layers') && !t.menu && t.engine === 'groove') {
      R.layers = {};
      for (const id of t.layers) {
        const l = await render(t.id, { seconds: 4 * bar + 0.5, script: [[0, 7]], only: [id] });
        const m = rmsPeak(l.x, Math.floor(0.2 * l.sr));
        R.layers[id] = { rms: dbfs(m.rms), peak: dbfs(m.peak) };
        if (id === 'kick') R.kickTiming = onsets(l.x, l.sr, 0.1, bar / 16);
      }
    }
    if (flag('--wav') && t.engine === 'groove') {
      const out = path.join(ROOT, 'audition', t.id + '.wav');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const data = wav(decimate(x), sr / 2, WAV_GAIN);
      fs.writeFileSync(out, data);
      R.wav = `${path.relative(ROOT, out)} (${(data.length / 1e6).toFixed(2)} MB)`;
    }
    report[t.id] = R;
    console.log(JSON.stringify({ [t.id]: R }));
  }
} catch (e) {
  console.error(e.stack || e.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
