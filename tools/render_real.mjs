// Renders the recorded-instrument music extracts (tools/music-real/songs.js) offline in headless Edge, masters them
// (a look-ahead true-peak limiter to -1.2 dBTP, gain to a target loudness) and writes audition/real/<id>.wav
// (44.1 kHz stereo 16-bit) with an index.html to listen. Samples: node tools/fetch_music_samples.mjs first.
//   node tools/render_real.mjs [--only id,id] [--port n] [--lufs -11.5] [--opus: also a small .webm of each, in real time]
//   --balance id,id [--list stem,stem] [--rounds 2]: measure each stem alone and move tools/music-real/mix.json toward
//     the aimed balance; --probe lib,lib: the parsed note of some samples against their measured pitch
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launchBrowser, sleep, CDP } from './qa/cdp.mjs';
import { master, measure, wav16, bands } from './music-real/master.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const OUT = path.join(ROOT, 'audition', 'real');

let server = null, browser = null;
try {
  server = await startServer({ port: +opt('--port', 8270), quiet: true, root: ROOT });
  browser = await launchBrowser({ width: 600, height: 400, extraArgs: ['--js-flags=--max-old-space-size=8192', '--autoplay-policy=no-user-gesture-required'] });
  const page = browser.page;
  page.on('Runtime.exceptionThrown', (p) => console.log('[EXCEPTION]', CDP.exceptionText(p.exceptionDetails)));
  page.on('Runtime.consoleAPICalled', (p) => console.log('[page]', CDP.consoleText(p)));
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  const open = async () => {
    await page.send('Page.navigate', { url: server.url + 'tools/music-real/render.html' });
    for (let i = 0; i < 100 && !(await page.eval('window.ready === true').catch(() => false)); i++) await sleep(100);
  };
  await open();
  if (opt('--balance')) {
    // each stem of a song alone (active RMS: where it plays), against the kick; the strip gains are moved toward
    // the aimed balance (AIM, a song's own `aim` over it) and kept in tools/music-real/mix.json. Two rounds.
    const MIXF = path.join(ROOT, 'tools', 'music-real', 'mix.json');
    const songs = await page.eval('window.songs()');
    for (const id of opt('--balance').split(',')) {
      const song = songs.find((s) => s.id === id);
      const AIM = { bass: -1.5, synthbass: -1.5, snare: -8, clap: -9, hat: -14, perc: -14, cym: -22, rhodes: -9, piano: -6, gtr: -10, lead: -8, arp: -16, strings: -13, sax: -8, horns: -7, ...song.aim };
      for (let round = 0; round < +opt('--rounds', 2); round++) {
        const mixAll = fs.existsSync(MIXF) ? JSON.parse(fs.readFileSync(MIXF, 'utf8')) : {};
        const mix = mixAll[id] || {};
        const lv = {};
        const list = opt('--list') ? opt('--list').split(',') : Object.keys(AIM);
        for (const st of ['kick', ...list]) {
          await open();
          await page.eval(`window.renderSong(${JSON.stringify(id)}, ${JSON.stringify([st])}, ${JSON.stringify(mix)})`, { timeout: 900000 });
          const r = await page.eval('window.level()');
          if (r.peak !== 0) lv[st] = r;
        }
        const line = [];
        for (const [st, r] of Object.entries(lv)) {
          if (st === 'kick') continue;
          const f = Math.pow(10, (lv.kick.rms + AIM[st] - r.rms) / 20);
          mix[st] = +((mix[st] ?? 1) * f).toFixed(3);
          line.push(`${st} ${(r.rms - lv.kick.rms).toFixed(1)}dB x${f.toFixed(2)}`);
        }
        mixAll[id] = mix;
        fs.writeFileSync(MIXF, JSON.stringify(mixAll, null, 1) + '\n');
        console.log(id, 'round', round, 'kick', lv.kick.rms, '|', line.join(', '));
      }
    }
  } else if (opt('--probe')) {
    console.log(JSON.stringify(await page.eval(`window.probe(${JSON.stringify(opt('--probe').split(','))})`, { timeout: 600000 }), null, 1));
  } else {
    const songs = await page.eval('window.songs()');
    const only = opt('--only', null)?.split(',');
    fs.mkdirSync(OUT, { recursive: true });
    const done = [];
    for (const s of songs) {
      if (only && !only.includes(s.id)) continue;
      await open(); // a fresh page per song: the decoded samples of the last one are freed
      const r = await page.eval(`window.renderSong(${JSON.stringify(s.id)})`, { timeout: 900000 });
      const ch = [];
      for (let i = 0; i < 2; i++) {
        const b = Buffer.from(await page.eval(`window.channel(${i})`, { timeout: 300000 }), 'base64');
        ch.push(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)));
      }
      const raw = measure(ch);
      const m = master(ch, { lufs: +opt('--lufs', -11.5), ceiling: -1.2 });
      const fin = measure(m.out);
      fs.writeFileSync(path.join(OUT, s.id + '.wav'), wav16(m.out));
      // loudness bar by bar (short-term RMS, dB): the build should show under the groove
      const barN = Math.round((240 / s.bpm) * 44100), bars = [];
      for (let i = Math.round(0.05 * 44100); i + barN <= m.out[0].length; i += barN) {
        let e = 0; for (const c of m.out) for (let j = i; j < i + barN; j++) e += c[j] * c[j];
        bars.push(Math.round(10 * Math.log10(e / (2 * barN))));
      }
      const info = { ...s, bands: bands(m.out), bars: bars.join(' '), renderMs: r.ms, rawPeak: raw.peak, rawLufs: raw.lufs, gainDb: m.gainDb, maxGrDb: m.maxGr, limitedPct: m.limitedShare, lufs: fin.lufs, truePeak: fin.truePeak, peak: fin.peak, lra: fin.lra };
      const { hook, key, style, aim, ...short } = info;
      console.log(JSON.stringify(short));
      done.push(info);
    }
    if (args.includes('--opus')) { // real time: about the length of each extract
      for (const d of done) {
        const b = Buffer.from(await page.eval(`window.encodeOpus('/audition/real/${d.id}.wav')`, { timeout: 300000 }), 'base64');
        fs.writeFileSync(path.join(OUT, d.id + '.webm'), b);
        d.webm = true;
        console.log(d.id + '.webm', (b.length / 1e6).toFixed(2), 'MB');
      }
    }
    const old = fs.existsSync(path.join(OUT, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'), 'utf8')) : [];
    const all = [...old.filter((o) => !done.some((d) => d.id === o.id)), ...done].sort((a, b) => songs.findIndex((s) => s.id === a.id) - songs.findIndex((s) => s.id === b.id));
    fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(all, null, 1));
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Real instruments - extracts</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#111;color:#ddd;max-width:820px;margin:24px auto;padding:0 16px}h2{margin:28px 0 4px;color:#fff}p{margin:4px 0 8px;color:#aaa}audio{width:100%}small{color:#777}</style>
<h1>Recorded instruments - extracts</h1><p>Original compositions played with recorded samples (drums, bass guitar, electric guitar, Rhodes, piano, strings, brass, sax; sources in tools/music_sources.json).</p>
${all.map((s) => `<h2>${esc(s.title)}</h2><p>${esc(s.style)} - ${s.bpm} BPM - ${esc(s.key)}. ${esc(s.hook)}</p><audio controls preload="none" src="${s.id}.wav"></audio><small>${s.lufs} LUFS, true peak ${s.truePeak} dBTP. <a href="${s.id}.wav">WAV</a>${s.webm ? ` - <a href="${s.id}.webm">Opus/WebM</a>` : ''}</small>`).join('\n')}
`);
  }
} catch (e) {
  console.error(e.stack || e.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
