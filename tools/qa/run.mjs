// `npm run qa -- [--minutes 10] [--seed 1] [--level level1] [--god] [--realtime] [--plans a,b] [--port 8123] [--keep-open]`
// Plays the game with a robot (tools/qa/bot.js) in a headless browser for a span of GAME time, watches for problems
// and writes qa-report/<yyyymmdd-hhmmss>/ (report.md, report.json, screenshots, browser.log). See tools/qa/README.md.
// Exit code: 0 no error finding, 1 at least one, 2 the tool itself failed (no browser, page did not load...).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../serve.mjs';
import { launchBrowser, click, sleep, CDP } from './cdp.mjs';
import { leakFindings, crossSessionLeak, slowFindings, coverageFindings, writeReport, summaryLines, fmtTime } from './report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const W = 1280, H = 720;
const BATCH = 300;           // steps per page evaluation in fast mode
const BATCH_TIMEOUT = 90000; // ms: a batch that long means the game hangs

// ---------------------------------------------------------------- options
function parseArgs(argv) {
  const o = { minutes: 10, seed: 1, level: 'level1', god: false, mode: 'fast', plans: null, port: 8123, keepOpen: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--minutes') o.minutes = +next();
    else if (a === '--seed') o.seed = Math.trunc(+next());
    else if (a === '--level') o.level = next();
    else if (a === '--god') o.god = true;
    else if (a === '--realtime') o.mode = 'realtime';
    else if (a === '--plans') o.plans = next().split(',').filter(Boolean);
    else if (a === '--port') o.port = +next();
    else if (a === '--keep-open') o.keepOpen = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n')[0].slice(3)); process.exit(0); }
    else { console.error(`unknown option ${a} (see tools/qa/README.md)`); process.exit(2); }
  }
  if (!(o.minutes > 0) || !Number.isFinite(o.seed)) { console.error('bad --minutes or --seed'); process.exit(2); }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const replay = `npm run qa -- --minutes ${opts.minutes} --seed ${opts.seed} --level ${opts.level}${opts.god ? ' --god' : ''}${opts.mode === 'realtime' ? ' --realtime' : ''}${opts.plans ? ' --plans ' + opts.plans.join(',') : ''}`;

function reportDir() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  let dir = path.join(ROOT, 'qa-report', stamp);
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(ROOT, 'qa-report', `${stamp}-${i}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// the game's own randomness, seeded too (a replay is close, not bit-exact: audio admission and the music clock
// depend on real time)
const seedScript = (seed) => `(() => { let s = ${(seed * 2654435761) >>> 0} >>> 0; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0;
  let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

// ---------------------------------------------------------------- run
const dir = reportDir();
const started = Date.now();
const log = [];
const findings = new Map();  // key -> finding (page ones replaced by their latest copy)
const shotKinds = new Set();
const samples = [];
let last = null;             // latest status from the page
let shots = 0;
let server = null, browser = null, interrupted = false, toolError = null, exitCode = 2, final = null;

const stamp = () => ((Date.now() - started) / 1000).toFixed(1).padStart(7);
const say = (s) => console.log(`[qa] ${s}`);

// a finding seen from Node (console, uncaught exception): placed with the bot's latest status
function nodeFinding(kind, severity, sig, detail) {
  const key = `${kind}|${sig}`;
  const f = findings.get(key);
  if (f) { f.count++; f.lastT = last?.clock; return; }
  findings.set(key, { key, kind, severity, sig, t: last ? +last.clock.toFixed(1) : 0, worldT: last?.worldT, session: last?.session ?? 0,
    pos: last?.pos ?? null, detail, lastActions: last?.lastActions || [], count: 1, fromNode: true });
  pendingShots.push({ kind, key, pos: null });
}
const pendingShots = [];

function mergeStatus(st) {
  last = st;
  for (const f of st.findings) {
    const old = findings.get(f.key);
    findings.set(f.key, { ...f, screenshot: old?.screenshot });
  }
  pendingShots.push(...st.freshKinds);
  samples.push(...st.samples);
}

async function takeShots(page) {
  while (pendingShots.length) {
    const { kind, key, pos } = pendingShots.shift();
    if (shotKinds.has(kind)) continue;
    shotKinds.add(kind);
    const name = `${String(++shots).padStart(2, '0')}_${kind}.png`;
    try {
      if (pos && opts.mode === 'fast') await page.eval(`__qa.focus(${pos.x}, ${pos.y})`, { timeout: 5000 });
      await page.screenshot(path.join(dir, name));
      if (pos && opts.mode === 'fast') await page.eval('__qa.focus()', { timeout: 5000 });
      const f = findings.get(key);
      if (f) f.screenshot = name;
    } catch (e) { log.push(`${stamp()} [qa] screenshot failed: ${e.message}`); }
  }
}

async function cleanup() {
  try { await browser?.close(); } catch { /* gone */ }
  try { await server?.close(); } catch { /* gone */ }
  browser = server = null;
}

let sigints = 0;
process.on('SIGINT', async () => {
  if (++sigints === 1 && !opts.keepOpen) { interrupted = true; say('interrupted: finishing the report (Ctrl+C again to quit at once)'); return; }
  await cleanup();
  process.exit(130);
});

async function main() {
  server = await startServer({ port: opts.port, quiet: true });
  const url = server.url + `?level=${encodeURIComponent(opts.level)}`; // always: a new game starts the campaign
  say(`server ${server.url}, report folder ${dir}`);
  browser = await launchBrowser({ width: W, height: H });
  const page = browser.page;

  page.on('Runtime.consoleAPICalled', (p) => {
    const text = CDP.consoleText(p);
    log.push(`${stamp()} [${p.type}] ${text}`);
    // the game logs the first error a draw swallows: the bot reports every one of them itself
    if ((p.type === 'error' || p.type === 'assert') && !text.startsWith('render error')) {
      nodeFinding('exception', 'error', `console.error: ${text.split('\n')[0].slice(0, 200)}`, { where: 'console.error', message: text.slice(0, 2000) });
    }
  });
  page.on('Runtime.exceptionThrown', (p) => {
    const text = CDP.exceptionText(p.exceptionDetails);
    log.push(`${stamp()} [EXCEPTION] ${text}`);
    nodeFinding('exception', 'error', `uncaught: ${text.split('\n')[0].slice(0, 200)}`,
      { where: 'uncaught', message: text.split('\n')[0], stack: text.split('\n').slice(0, 10).join('\n'), url: p.exceptionDetails.url, line: p.exceptionDetails.lineNumber });
  });
  page.on('Log.entryAdded', ({ entry }) => {
    log.push(`${stamp()} [log ${entry.level}] ${entry.text} ${entry.url || ''}`);
    // the page has no favicon: the browser's automatic request for one is not the game's doing
    if (entry.level === 'error' && !/\/favicon\.ico$/.test(entry.url || '')) nodeFinding('exception', 'error', `log: ${entry.text.slice(0, 160)} ${entry.url || ''}`.trim(), { where: 'browser log', message: entry.text, url: entry.url });
  });
  let crashed = false;
  page.on('Inspector.targetCrashed', () => { crashed = true; log.push(`${stamp()} [qa] PAGE CRASHED`); });

  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  await page.send('Inspector.enable').catch(() => {});
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(opts.seed) });
  await page.send('Page.navigate', { url });

  // the title screen once the assets are in
  let state = null;
  for (let i = 0; i < 150 && state !== 'title'; i++) {
    await sleep(200);
    state = await page.eval('window.game ? game.state : null', { timeout: 5000 }).catch(() => null);
  }
  if (state !== 'title') {
    const errs = log.filter((l) => /EXCEPTION|\[error\]|log error/.test(l)).slice(0, 5);
    throw new Error(`the game did not reach its title screen (state ${state})${errs.length ? ':\n  ' + errs.join('\n  ') : ''}`);
  }
  // a real click: the user gesture that unlocks the audio, and it starts the level
  await click(page, W / 2, H / 2);
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    if ((await page.eval('game.state')) !== 'title') break;
  }
  await page.eval(fs.readFileSync(path.join(HERE, 'bot.js'), 'utf8') + '\n;true');
  await page.eval(`__qa.init(${JSON.stringify({ seed: opts.seed, god: opts.god, mode: opts.mode, level: opts.level, plans: opts.plans })})`);
  exitCode = 0;

  const target = opts.minutes * 60;
  let nextPrint = 60;
  const progress = (st) => {
    if (st.clock < nextPrint) return;
    nextPrint += 60;
    const errs = [...findings.values()].filter((f) => f.severity === 'error').length;
    say(`${fmtTime(st.clock)} game / ${fmtTime((Date.now() - started) / 1000)} real: session ${st.sessions}, deaths ${st.deaths}, clears ${st.clears}, kills ${st.kills}, findings ${findings.size} (${errs} error kinds)`);
  };

  if (opts.mode === 'fast') {
    while (!interrupted && !crashed) {
      let st;
      try { st = await page.eval(`__qa.batch(${BATCH})`, { timeout: BATCH_TIMEOUT }); } catch (e) {
        if (crashed) break;
        if (/timed out/.test(e.message)) {
          nodeFinding('softlock', 'error', 'hang', { why: `a batch of ${BATCH} steps did not return in ${BATCH_TIMEOUT / 1000} s: the game loops forever?` });
          break;
        }
        throw e;
      }
      mergeStatus(st);
      await takeShots(page);
      progress(st);
      if (st.clock >= target) break;
    }
  } else {
    while (!interrupted && !crashed) {
      await sleep(250);
      const st = await page.eval('__qa.poll()', { timeout: 20000 });
      mergeStatus(st);
      await takeShots(page);
      progress(st);
      if (st.clock >= target) break;
    }
  }
  if (crashed) nodeFinding('exception', 'error', 'page crashed', { why: 'the renderer process crashed (out of memory?)' });
  else {
    final = await page.eval('__qa.final()', { timeout: 30000 });
    for (const f of final.findings) findings.set(f.key, { ...f, screenshot: findings.get(f.key)?.screenshot });
  }
  await takeShots(page).catch(() => {});
}

try {
  await main();
} catch (e) {
  toolError = e.message;
  exitCode = 2;
  console.error(`[qa] tool failure: ${e.message}`);
}

// ---------------------------------------------------------------- report
const gameSeconds = last?.clock || 0;
const extra = [];
if (final) {
  extra.push(...leakFindings(samples), ...crossSessionLeak(final.sessions), ...slowFindings(opts.mode, final.timing, final.perfSamples));
  if (!interrupted) extra.push(...coverageFindings(final.stats.coverage, gameSeconds, final.stats.notApplicable));
}
for (const f of extra) findings.set(f.key, f);
const order = { error: 0, warn: 1 };
const all = [...findings.values()].sort((a, b) => order[a.severity] - order[b.severity] || a.kind.localeCompare(b.kind) || b.count - a.count);
const errors = new Set(all.filter((f) => f.severity === 'error').map((f) => f.kind));
const warns = new Set(all.filter((f) => f.severity === 'warn').map((f) => f.kind));
if (!toolError) exitCode = errors.size ? 1 : 0;
let perf = null;
if (final?.timing?.n) perf = `mean game.update step ${(final.timing.ms / final.timing.n).toFixed(2)} ms, worst ${final.timing.worst.toFixed(1)} ms, ${Math.round((last?.steps || 0) / ((Date.now() - started) / 1000))} steps per real second`;
else if (final?.perfSamples?.length) {
  const warm = final.perfSamples.filter((p) => p.t > 3), ps = warm.length ? warm : final.perfSamples; // past the level load
  const avg = (k) => (ps.reduce((s, p) => s + p[k], 0) / ps.length).toFixed(1);
  perf = `fps ${avg('fps')}, update ${avg('update')} ms, render ${avg('render')} ms, worst frame ${Math.max(...ps.map((p) => p.worst)).toFixed(0)} ms`;
}
if (final?.stats) {
  const st = final.stats;
  perf = `${perf || '-'}; audio: context ${st.audioState || '?'}, most active voices ${st.maxVoices ?? '-'}${opts.mode === 'fast' ? ' (fast mode squeezes game time: voices are only checked in --realtime)' : ''}`;
}
const rep = {
  tool: 'fmr-qa', dir, options: opts, command: `node tools/qa/run.mjs ${process.argv.slice(2).join(' ')}`.trim(), replay,
  startedAt: new Date(started).toISOString(), realSeconds: (Date.now() - started) / 1000, gameSeconds, steps: last?.steps || 0,
  result: toolError ? 'TOOL FAILURE' : errors.size ? 'FAIL' : 'PASS', exitCode, interrupted, toolError,
  summary: { errors: errors.size, warns: warns.size, errorKinds: [...errors], warnKinds: [...warns] },
  guards: final?.sessions?.[0]?.guards ?? null, perf,
  bot: final?.bot || null, findings: all, stats: final?.stats || null, sessions: final?.sessions || [], samples, perfSamples: final?.perfSamples || [],
};
try {
  writeReport(dir, rep);
  fs.writeFileSync(path.join(dir, 'browser.log'), log.join('\n') + '\n');
} catch (e) { console.error(`[qa] could not write the report: ${e.message}`); }
console.log('');
for (const l of summaryLines(rep)) console.log(l);

if (opts.keepOpen && browser) {
  say(`--keep-open: game at ${server?.url}, DevTools at http://127.0.0.1:${browser.port} (Ctrl+C to quit)`);
  await new Promise(() => {});
}
await cleanup();
process.exit(exitCode);
