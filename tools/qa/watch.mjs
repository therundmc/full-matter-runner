// `npm run qa:watch -- [--minutes 2.5] [--levels tutorial,level1,lab] [--seed n] [--chaos-every 2] [--runs n]
//   [--for minutes] [--keep-all] [--db file] [--bisect [--good sha] [--bisect-max 8]]`
// The QA robot in the background: short runs of tools/qa/run.mjs one after the other (one browser at a time, at low
// CPU priority), rotating levels, seeds and normal / chaos play. Every finding goes into qa-report/watch-db.json
// (deduped, tools/qa/findings-db.mjs); only the ones never seen before are printed and appended to
// qa-report/watch.md. --bisect replays a new error and looks for the commit that brought it in a temporary git
// worktree (the main checkout is only read). Ctrl+C stops cleanly. See "Background runner" in tools/qa/README.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load, save, merge, noteFailure, markdownLine, localTime, normSig, WATCH_HEADER } from './findings-db.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const RUN = path.join(HERE, 'run.mjs');
const OUT = path.join(ROOT, 'qa-report');
const WATCH_MD = path.join(OUT, 'watch.md');
const RUNS_DIR = path.join(OUT, 'watch');
const STOP_WAIT = 20000;   // ms a run gets to write its report after a Ctrl+C
const BACKOFF = 30000;     // ms after a tool failure

// ---------------------------------------------------------------- pure parts (unit-tested)

// Run i of the session: levels in turn, a seed counter, and chaos about one run in `chaosEvery`, each level taking
// its turn at it (a plain `i % n` would pin chaos to the same levels when n divides the level count).
export function schedule(i, { levels, seed, chaosEvery }) {
  const level = levels[i % levels.length], round = Math.floor(i / levels.length);
  const chaos = chaosEvery > 0 && (round + (i % levels.length)) % chaosEvery === chaosEvery - 1;
  return { level, seed: seed + i, chaos, god: level === 'tutorial' };
}

// First bad commit by binary search. commits: oldest first, the last one known bad, the one before the first known
// good. isBad(sha) resolves true / false, or null when the commit cannot be tested (budget spent, interrupted, the
// tool failed): the search then stops and the culprit is somewhere in commits[lo + 1 .. hi].
export async function firstBad(commits, isBad) {
  let lo = -1, hi = commits.length - 1;
  const tested = [];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const bad = await isBad(commits[mid]);
    if (bad === null || bad === undefined) return { first: null, lo, hi, tested, stopped: true };
    tested.push({ sha: commits[mid], bad });
    if (bad) hi = mid; else lo = mid;
  }
  return { first: commits[hi] ?? null, lo, hi, tested, stopped: false };
}

// does a report show that finding again? 'exact' (same kind and normalised signature), 'kind' (the kind only), null
export function reproMatch(report, kind, nsig) {
  const list = report?.findings || [];
  if (list.some((f) => f.kind === kind && normSig(f.kind, f.sig) === nsig)) return 'exact';
  return list.some((f) => f.kind === kind) ? 'kind' : null;
}

export function parseArgs(argv) {
  const o = { minutes: 2.5, levels: ['tutorial', 'level1', 'lab'], seed: null, chaosEvery: 2, runs: 0, forMinutes: 0,
    keepAll: false, db: path.join(OUT, 'watch-db.json'), bisect: false, good: null, bisectMax: 8 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--minutes') o.minutes = +next();
    else if (a === '--levels') o.levels = String(next()).split(',').filter(Boolean);
    else if (a === '--seed') o.seed = Math.trunc(+next());
    else if (a === '--chaos-every') o.chaosEvery = Math.max(0, Math.trunc(+next()));
    else if (a === '--runs') o.runs = Math.max(0, Math.trunc(+next()));
    else if (a === '--for') o.forMinutes = +next();
    else if (a === '--keep-all') o.keepAll = true;
    else if (a === '--db') o.db = path.resolve(next());
    else if (a === '--bisect') o.bisect = true;
    else if (a === '--good') o.good = next();
    else if (a === '--bisect-max') o.bisectMax = Math.max(1, Math.trunc(+next()));
    else if (a === '--help' || a === '-h') return { help: true };
    else throw new Error(`unknown option ${a} (see tools/qa/README.md, "Background runner")`);
  }
  if (!(o.minutes > 0) || !o.levels.length || (o.seed !== null && !Number.isFinite(o.seed)) || !Number.isFinite(o.chaosEvery)
    || !(o.forMinutes >= 0) || !Number.isFinite(o.bisectMax)) throw new Error('bad --minutes, --levels, --seed, --chaos-every, --for or --bisect-max');
  return o;
}

// ---------------------------------------------------------------- the loop

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`[watch] ${e.message}`); process.exit(2); }
  if (opts.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 2).map((l) => l.slice(3)).join('\n')); return; }
  if (opts.seed === null) opts.seed = Math.floor(Date.now() / 1000) % 100000;

  const say = (s) => console.log(`[watch] ${s}`);
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
  const append = (text) => {
    fs.mkdirSync(OUT, { recursive: true });
    if (!fs.existsSync(WATCH_MD)) fs.writeFileSync(WATCH_MD, WATCH_HEADER);
    fs.appendFileSync(WATCH_MD, text.endsWith('\n') ? text : text + '\n');
  };
  // read-only git in the checkout under test
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const head = () => {
    try { return { commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain') !== '' }; } catch { return { commit: null, dirty: false }; }
  };
  const subject = (sha) => { try { return git('log', '-1', '--format=%s', sha); } catch { return ''; } };

  // the child: run.mjs under the same node, --experimental-websocket below Node 22 (global WebSocket), niced
  const nodeFlags = +process.versions.node.split('.')[0] < 22 && !/--experimental-websocket/.test(process.env.NODE_OPTIONS || '')
    && !process.execArgv.includes('--experimental-websocket') ? ['--experimental-websocket'] : [];
  const posix = process.platform !== 'win32';
  const nice = posix && spawnSync('nice', ['-n', '15', 'true'], { stdio: 'ignore' }).status === 0;

  let child = null, stopping = false, signals = 0, wake = null, tmpTree = null;
  const db = load(opts.db);
  const started = Date.now(), deadline = opts.forMinutes ? started + opts.forMinutes * 60000 : 0;
  const session = { runs: 0, fresh: [], toolFailures: 0, bisects: 0 };

  const killGroup = (c, sig) => { try { if (posix) process.kill(-c.pid, sig); else c.kill(sig); } catch { /* gone */ } };
  const pause = (ms) => new Promise((done) => { const t = setTimeout(done, ms); wake = () => { clearTimeout(t); done(); }; });

  function runQa(args, outDir) {
    return new Promise((done) => {
      const argv = [...nodeFlags, RUN, ...args, '--quiet', '--shots', '4', '--out', outDir];
      const [cmd, cargs] = nice ? ['nice', ['-n', '15', process.execPath, ...argv]] : [process.execPath, argv];
      const c = spawn(cmd, cargs, { cwd: ROOT, detached: posix, stdio: ['ignore', 'pipe', 'pipe'] });
      child = c;
      let out = '', timer = null;
      c.stdout.on('data', (d) => { out += d; });
      c.stderr.on('data', (d) => { out += d; });
      c.stop = () => {   // run.mjs finishes its report on a SIGINT; its whole group goes if it takes too long
        try { c.kill('SIGINT'); } catch { /* gone */ }
        timer ??= setTimeout(() => killGroup(c, 'SIGKILL'), STOP_WAIT);
      };
      if (stopping) c.stop();
      let ended = false;
      const end = (code, signal) => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        if (c.pid) killGroup(c, 'SIGKILL');   // anything of that run still around (a browser helper)
        child = null;
        let report = null;
        try { report = JSON.parse(fs.readFileSync(path.join(outDir, 'report.json'), 'utf8')); } catch { /* none */ }
        try { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, 'run.log'), out); } catch { /* best effort */ }
        done({ code, signal, out, report });
      };
      c.on('exit', end);
      c.on('error', (e) => { out += `\n${e.message}`; if (!c.pid) end(null, null); });   // could not start: no 'exit' comes
    });
  }
  const isToolFailure = (r) => !r.report || r.report.result === 'TOOL FAILURE' || r.code === 2;
  const failureText = (r) => (r.report?.toolError?.split('\n')[0] || r.out.trim().split('\n').slice(-3).join(' / ') || `exit ${r.code ?? r.signal}`).slice(0, 300);
  const stampOf = (d = new Date()) => localTime(d).replace(/[-:]/g, '').replace(' ', '-');
  const runArgs = (s) => ['--minutes', String(opts.minutes), '--level', s.level, '--seed', String(s.seed), ...(s.chaos ? ['--chaos'] : []), ...(s.god ? ['--god'] : [])];
  const drop = (dir) => { if (!opts.keepAll) fs.rmSync(dir, { recursive: true, force: true }); };

  function removeTree() {
    if (!tmpTree) return;
    try { execFileSync('git', ['worktree', 'remove', '--force', tmpTree], { cwd: ROOT, stdio: 'ignore' }); } catch { /* pruned below */ }
    try { fs.rmSync(tmpTree, { recursive: true, force: true }); } catch { /* best effort */ }
    try { execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' }); } catch { /* best effort */ }
    tmpTree = null;
  }

  function onSignal(sig) {
    if (++signals === 1) {
      stopping = true;
      say(`${sig}: stopping after the current run writes its report (again to quit at once)`);
      child?.stop();
      wake?.();
      return;
    }
    if (child) killGroup(child, 'SIGKILL');
    removeTree();
    try { save(opts.db, db); } catch { /* best effort */ }
    process.exit(130);
  }
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  // --bisect: replay a new error, then find the commit that brought it (in a temporary worktree)
  async function bisect(entry, s) {
    const note = [];
    const finish = (text) => {
      note.push(text);
      const line = `  - bisect: ${note.join('; ')}`;
      console.log(line);
      append(line);
      entry.bisect = { at: new Date().toISOString(), result: note.join('; ') };
      save(opts.db, db);
    };
    const tryRun = async (extra, tag) => {
      const dir = path.join(RUNS_DIR, `${stampOf()}-bisect-${tag}`);
      const r = await runQa([...runArgs(s), ...extra], dir);
      drop(dir);
      return r;
    };
    // a. reproduce, twice, at the code under test
    let exact = 0, kindOnly = 0;
    for (let k = 0; k < 2 && !stopping; k++) {
      const m = reproMatch((await tryRun([], `repro${k + 1}`)).report, entry.kind, entry.normSig);
      if (m === 'exact') exact++; else if (m === 'kind') kindOnly++;
    }
    if (stopping) return finish('interrupted');
    if (!exact && !kindOnly) return finish('not reproduced 0/2 (flaky, or tied to real time): no search');
    const want = exact ? ['exact'] : ['exact', 'kind'];
    note.push(exact ? `reproduced ${exact}/2` : `reproduced ${kindOnly}/2 by kind only (another signature)`);

    // b. the range: last known good for the level .. HEAD
    const goodRef = opts.good || db.good[s.level];
    if (!goodRef) return finish(`no known-good commit for ${s.level} (pass --good <sha>)`);
    let good, list;
    try {
      good = git('rev-parse', '--verify', `${goodRef}^{commit}`);
      list = git('rev-list', '--first-parent', '--reverse', `${good}..HEAD`).split('\n').filter(Boolean);
    } catch { return finish(`bad good commit ${goodRef}`); }
    if (!list.length) return finish(`good ${good.slice(0, 8)} is HEAD: nothing to search (the bug is in uncommitted changes, or flaky)`);
    const { dirty } = head();
    if (!opts.good && db.goodDirty[s.level]) note.push(`good ${good.slice(0, 8)} passed with uncommitted changes on top`);

    let budget = opts.bisectMax, runs = 0;
    const isBad = async (sha) => {
      if (stopping || budget <= 0) return null;
      execFileSync('git', ['-C', tmpTree, 'checkout', '--detach', '--force', sha], { stdio: 'ignore' });
      for (let k = 0; k < 2; k++) {
        if (stopping || budget <= 0) return null;
        budget--; runs++;
        const r = await tryRun(['--root', tmpTree], `${sha.slice(0, 8)}-${k + 1}`);
        if (isToolFailure(r)) { note.push(`${sha.slice(0, 8)} could not be tested (${failureText(r)})`); return null; }
        if (want.includes(reproMatch(r.report, entry.kind, entry.normSig))) return true;
      }
      return false;   // 2 clean tries: called good (flaky findings exist)
    };
    try {
      tmpTree = fs.mkdtempSync(path.join(os.tmpdir(), 'fmr-bisect-'));
      execFileSync('git', ['worktree', 'add', '--detach', tmpTree, list[list.length - 1]], { cwd: ROOT, stdio: 'ignore' });
      if (dirty) {
        const h = await isBad(list[list.length - 1]);
        if (h === false) return finish('not at HEAD in a clean worktree: the bug is in the uncommitted changes (uncommitted)');
        if (h === null) return finish(stopping ? 'interrupted' : `HEAD could not be tested, ${runs} runs`);
      }
      const res = await firstBad(list, isBad);
      const span = `good ${good.slice(0, 8)}, ${list.length} commits, ${res.tested.length} tested, ${runs} runs; a commit is bad if it shows the finding in any of 2 tries`;
      if (res.first) return finish(`first bad commit ${res.first.slice(0, 8)} "${subject(res.first)}" (${span})`);
      const range = list.slice(res.lo + 1, res.hi + 1);
      return finish(`${stopping ? 'interrupted' : `stopped (--bisect-max ${opts.bisectMax})`}: first bad commit among ${range.length}: `
        + `${range[0].slice(0, 8)}..${range[range.length - 1].slice(0, 8)} (${span})`);
    } catch (e) {
      return finish(`failed: ${e.message.split('\n')[0]}`);
    } finally {
      removeTree();
      session.bisects++;
    }
  }

  const first = head();
  say(`levels ${opts.levels.join(',')}, ${opts.minutes} game min a run, seeds from ${opts.seed}, chaos ${opts.chaosEvery ? `1 run in ${opts.chaosEvery}` : 'never'}`
    + `${opts.runs ? `, ${opts.runs} runs` : ''}${opts.forMinutes ? `, for ${opts.forMinutes} min` : ''}${opts.bisect ? ', bisect on' : ''}`);
  say(`commit ${first.commit ? first.commit.slice(0, 8) : '?'}${first.dirty ? ' (dirty)' : ''}, ${nice ? 'nice 15' : 'normal priority'}, log ${rel(WATCH_MD)}, db ${rel(opts.db)}`);

  for (let i = 0; !stopping; i++) {
    if (opts.runs && i >= opts.runs) break;
    if (deadline && Date.now() >= deadline) break;
    const s = schedule(i, opts), at = new Date().toISOString(), { commit, dirty } = head();
    const dir = path.join(RUNS_DIR, `${stampOf()}-${s.level}-${s.seed}${s.chaos ? '-chaos' : ''}`);
    const t0 = Date.now();
    const r = await runQa(runArgs(s), dir);
    const secs = Math.round((Date.now() - t0) / 1000);
    session.runs++;
    const label = `run ${i + 1} ${s.level} seed ${s.seed}${s.chaos ? ' chaos' : ''}`;

    if (isToolFailure(r)) {
      if (stopping && !r.report) { drop(dir); say(`${label}: stopped`); break; }
      session.toolFailures++;
      const why = failureText(r);
      say(`${label}: TOOL FAILURE, ${secs} s: ${why}`);
      if (noteFailure(db, why, at)) {   // each message logged once, ever
        append(`- ${localTime(at)} **TOOL FAILURE** ${s.level} seed ${s.seed}${s.chaos ? ' chaos' : ''} (${commit ? commit.slice(0, 8) : '?'}${dirty ? ' dirty' : ''}): ${why.replace(/`/g, "'")}\n  - run folder: ${rel(dir)}`);
      } else drop(dir);
      save(opts.db, db);
      const more = !(opts.runs && i + 1 >= opts.runs) && !(deadline && Date.now() + BACKOFF >= deadline);
      if (!stopping && more) { say(`backing off ${BACKOFF / 1000} s`); await pause(BACKOFF); }
      continue;
    }
    const rep = r.report;
    const { fresh, known } = merge(db, { at, level: s.level, seed: s.seed, chaos: s.chaos, commit, dirty, dir: rel(dir),
      result: rep.result, interrupted: !!rep.interrupted, realSeconds: rep.realSeconds, findings: rep.findings || [] });
    if (!fresh.length && !opts.keepAll) {
      drop(dir);
      for (const e of known) e.lastRun.dir = e.lastRun.screenshot = null;   // that folder is gone
      db.runs[db.runs.length - 1].dir = null;
    }
    save(opts.db, db);
    say(`${label}: ${rep.result}${rep.interrupted ? ' (interrupted)' : ''}, ${(rep.findings || []).length} findings (${fresh.length} new), ${secs} s`);
    for (const e of fresh) {
      const text = markdownLine(e, { at });
      console.log(text);
      append(text);
      session.fresh.push(e);
    }
    if (opts.bisect) for (const e of fresh) if (e.severity === 'error' && !stopping) await bisect(e, s);
  }

  try { save(opts.db, db); } catch (e) { console.error(`[watch] could not save the database: ${e.message}`); }
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  say(`done: ${session.runs} runs in ${mins} min, ${session.fresh.length} new findings`
    + `${session.toolFailures ? `, ${session.toolFailures} tool failures` : ''}${session.bisects ? `, ${session.bisects} bisects` : ''}`);
  for (const e of session.fresh) say(`  new ${e.severity} ${e.kind}: ${e.sig.slice(0, 120)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
  process.exit(0);
}
