// Builds the recorded foley bank the game plays its non-gun sounds from:
//   assets/sound/foley.wav  every cut end to end (16-bit mono), and
//   src/audio/bank.js       where each cut sits in it, per set.
// usage: node tools/build_sounds.mjs <packs-dir> [chromium-or-edge-binary]
// <packs-dir> holds the packs listed in tools/sounds.json, each extracted in a folder named after its
// opengameart.org slug. Decoding (ogg / flac / mp3 / wav) is done by a headless Chromium, the only decoder at hand.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [,, packsDir, browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'] = process.argv;
if (!packsDir) { console.error('usage: node tools/build_sounds.mjs <packs-dir> [browser]'); process.exit(1); }
const PORT = 8771, CDP = 9344;
const AUDIO = /(\.(wav|ogg|mp3|flac))+$/i;
const RANK = ['flac', 'wav', 'ogg', 'mp3']; // the same sound often ships in several formats: keep the best

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sounds.json'), 'utf8'));

// stem -> best file, searched in the listed packs only
const byStem = new Map();
function walk(dir, pack) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, pack); continue; }
    if (!AUDIO.test(e.name) || e.name.startsWith('._')) continue;
    const stem = e.name.replace(AUDIO, ''), ext = e.name.split('.').pop().toLowerCase();
    const had = byStem.get(stem);
    if (had && had.pack !== pack) had.clash = pack;
    else if (!had || RANK.indexOf(ext) < RANK.indexOf(had.ext)) byStem.set(stem, { file: p, pack, ext });
  }
}
for (const pack of Object.keys(manifest.packs)) walk(path.join(packsDir, pack), pack);

const clips = [];
for (const [set, sources] of Object.entries(manifest.sets)) {
  for (const src of sources) {
    const [stem, a, b] = Array.isArray(src) ? src : [src];
    const hit = byStem.get(stem);
    if (!hit) throw new Error(`${set}: no file named '${stem}' in the packs`);
    if (hit.clash) throw new Error(`${set}: '${stem}' exists in both ${hit.pack} and ${hit.clash}`);
    clips.push({ set, stem, file: hit.file, cut: a === undefined ? null : [a, b] });
  }
}

// Runs in the page: decode, cut, clean, level and join every clip; posts the wav and returns the layout.
async function page() {
  const R = 32000, GAP = 0.03;
  const job = await (await fetch('/job.json')).json();
  const ctx = new OfflineAudioContext(1, 1, R);
  const out = [], layout = [];
  let at = Math.round(GAP * R);
  for (let k = 0; k < job.length; k++) {
    const c = job[k];
    const buf = await ctx.decodeAudioData(await (await fetch('/clip/' + k)).arrayBuffer());
    const n = buf.length, mono = new Float32Array(n);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels;
    }
    let a, b;
    if (c.cut) { a = Math.round(c.cut[0] * R); b = Math.min(n, Math.round(c.cut[1] * R)); }
    else {
      // trim the silence: from just before the first sample above 2% of the peak to where the 10 ms level dies
      let top = 0;
      for (let i = 0; i < n; i++) top = Math.max(top, Math.abs(mono[i]));
      a = 0;
      while (a < n && Math.abs(mono[a]) < top * 0.02) a++;
      a = Math.max(0, a - Math.round(0.003 * R));
      const w = Math.round(0.01 * R);
      b = n;
      while (b - w > a) {
        let s = 0;
        for (let i = b - w; i < b; i++) s += mono[i] * mono[i];
        if (Math.sqrt(s / w) > top * 0.008) break;
        b -= w;
      }
      b = Math.min(n, b + Math.round(0.02 * R));
    }
    const len = b - a, x = new Float32Array(len);
    // 30 Hz high-pass (rumble and DC), then short fades so no cut ever clicks
    const r = 1 - 2 * Math.PI * 30 / R;
    let px = 0, py = 0;
    for (let i = 0; i < len; i++) { const v = mono[a + i]; py = v - px + r * py; px = v; x[i] = py; }
    const fin = Math.round(0.002 * R), fout = Math.round(Math.min(0.04, len / R * 0.3) * R);
    for (let i = 0; i < fin; i++) x[i] *= i / fin;
    for (let i = 0; i < fout; i++) x[len - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fout);
    // level: loudest 50 ms at -14 dBFS RMS, peaks held under -1 dBFS
    const w = Math.round(0.05 * R);
    let acc = 0, best = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      acc += x[i] * x[i];
      if (i >= w) acc -= x[i - w] * x[i - w];
      best = Math.max(best, acc);
      peak = Math.max(peak, Math.abs(x[i]));
    }
    const rms = Math.sqrt(best / Math.min(w, len));
    const gain = Math.min(0.2 / rms, 0.89 / peak);
    for (let i = 0; i < len; i++) x[i] *= gain;
    out.push({ at, x });
    layout.push({ set: c.set, stem: c.stem, offset: at / R, len: len / R, gain, peak: peak * gain, rms: rms * gain });
    at += len + Math.round(GAP * R);
  }
  const pcm = new Int16Array(at);
  for (const { at: o, x } of out) for (let i = 0; i < x.length; i++) pcm[o + i] = Math.round(Math.max(-1, Math.min(1, x[i])) * 32767);
  const head = new DataView(new ArrayBuffer(44));
  const str = (p, s) => { for (let i = 0; i < s.length; i++) head.setUint8(p + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); head.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVEfmt ');
  head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
  head.setUint32(24, R, true); head.setUint32(28, R * 2, true); head.setUint16(32, 2, true); head.setUint16(34, 16, true);
  str(36, 'data'); head.setUint32(40, pcm.byteLength, true);
  await fetch('/wav', { method: 'POST', body: new Blob([head, pcm]) });
  return JSON.stringify(layout);
}

let wav = null;
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (req.method === 'POST' && u === '/wav') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { wav = Buffer.concat(chunks); res.writeHead(200); res.end('ok'); });
  } else if (u === '/page') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>foley</title>'); }
  else if (u === '/job.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(clips.map(({ set, stem, cut }) => ({ set, stem, cut })))); }
  else if (u.startsWith('/clip/') && clips[+u.slice(6)]) { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(fs.readFileSync(clips[+u.slice(6)].file)); }
  else { res.writeHead(404); res.end(); }
}).listen(PORT, '127.0.0.1');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foley-'));
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 100 && !targets.length; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/page` });
await sleep(800);
const reply = await send('Runtime.evaluate', { expression: `(${page.toString()})()`, awaitPromise: true, returnByValue: true });
ws.close(); proc.kill(); server.close();
const failed = reply.result?.exceptionDetails;
if (failed || !wav) { console.error('build failed: ' + (failed ? failed.exception?.description || failed.text : 'no wav')); process.exit(1); }

const layout = JSON.parse(reply.result.result.value);
const bank = {};
for (const c of layout) (bank[c.set] ||= []).push([+c.offset.toFixed(4), +c.len.toFixed(4)]);
const lines = Object.entries(bank).map(([set, cuts]) => `  ${set}: [${cuts.map((c) => `[${c[0]}, ${c[1]}]`).join(', ')}],`);
fs.writeFileSync(path.join(ROOT, 'assets/sound/foley.wav'), wav);
fs.writeFileSync(path.join(ROOT, 'src/audio/bank.js'),
  '// Generated by tools/build_sounds.mjs from tools/sounds.json: do not edit.\n'
  + '// Where each recorded cut sits in the foley bank, per set: [offset, length] in seconds.\n'
  + `export const BANK_URL = 'assets/sound/foley.wav';\n\nexport const BANK = {\n${lines.join('\n')}\n};\n`);
const db = (v) => (20 * Math.log10(v)).toFixed(1).padStart(6);
for (const c of layout) console.log(`${c.set.padEnd(11)} ${c.stem.padEnd(26)} ${c.len.toFixed(2)}s  peak ${db(c.peak)}  rms ${db(c.rms)}  gain ${db(c.gain)}`);
console.log(`${layout.length} cuts, ${(wav.length / 1e6).toFixed(2)} MB, ${(wav.length / 64000).toFixed(1)} s`);
process.exit(0);
