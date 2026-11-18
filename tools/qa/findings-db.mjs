// The background runner's findings database (tools/qa/watch.mjs): every finding the robot ever reported, deduped
// by kind + a normalised signature, with the run that first showed it. Pure Node (fs only), no browser, no git.
// File shape (qa-report/watch-db.json):
//   { version: 1,
//     entries: { "<kind>|<normSig>": { key, kind, sig, normSig, severity, firstSeen, lastSeen, runs, hits,
//                                      levels: { <level>: runs }, firstRun: RunRef, lastRun: RunRef, bisect? } },
//     runs: [ { at, level, seed, chaos, commit, dirty, dir, result, findings, fresh, realSeconds } ]  (the latest 500),
//     good: { <level>: <commit sha of the latest complete, error-free run> }, goodDirty: { <level>: tree was dirty },
//     failures: { <normalised tool failure message>: { first, last, count } } }
//   RunRef = { at, level, seed, chaos, plan, commit, dirty, dir, screenshot, replay, replayPlan }
import fs from 'node:fs';
import path from 'node:path';

export const DB_VERSION = 1;
const MAX_RUNS = 500;

// The dedupe key's signature. The same bug shows at another spot each run: `guard@12,7`, `idle@14,22`,
// `go 31,9`; ids and sizes glued to words (`enemy12`, `3.5ms`) vary too. Positions are dropped, coordinate pairs,
// decimals, ids and long numbers become `#`; short lone integers stay (a plan's step index: `roof 3: ...`).
// Exceptions are messages: their first line, every number `#` (line:col in a URL, sizes, indices).
export function normSig(kind, sig) {
  let s = String(sig ?? '').split('\n')[0];
  if (kind === 'exception') {
    s = s.replace(/0x[0-9a-f]+/gi, '#').replace(/\d+(\.\d+)?/g, '#');
  } else {
    s = s.replace(/@\s*\[?-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\]?/g, '')   // `@12,7`: where it happened
      .replace(/-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/g, '#,#')            // other coordinate pairs
      .replace(/\b\d+\s+\d+\s*$/, '')                                   // a trailing cell `... 12 7`
      .replace(/([A-Za-z_])\d+/g, '$1#')                               // ids glued to a word: enemy12
      .replace(/\d+\.\d+|\d{3,}/g, '#');                               // decimals and long numbers
  }
  return s.replace(/#(?:[#.]*#)?/g, '#').replace(/\s+/g, ' ').trim();
}

export const entryKey = (kind, sig) => `${kind}|${normSig(kind, sig)}`;

export const emptyDb = () => ({ version: DB_VERSION, entries: {}, runs: [], good: {}, goodDirty: {}, failures: {} });

// a missing or unreadable file starts a fresh database (an unreadable one is kept aside, never overwritten blind)
export function load(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return emptyDb(); }
  try {
    const db = JSON.parse(text);
    if (db && db.version === DB_VERSION && db.entries && typeof db.entries === 'object') {
      return { version: DB_VERSION, entries: db.entries, runs: Array.isArray(db.runs) ? db.runs : [], good: db.good || {},
        goodDirty: db.goodDirty || {}, failures: db.failures || {} };
    }
  } catch { /* fall through */ }
  try { fs.renameSync(file, `${file}.bad-${Date.now()}`); } catch { /* gone */ }
  return emptyDb();
}

// atomic: a temp file in the same folder, then a rename over the old one
export function save(file, db) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1) + '\n');
  fs.renameSync(tmp, file);
}

const runRef = (run, f) => ({
  at: run.at, level: run.level, seed: run.seed, chaos: !!run.chaos, plan: f.plan ?? null, commit: run.commit ?? null,
  dirty: !!run.dirty, dir: run.dir ?? null, screenshot: f.screenshot && run.dir ? `${run.dir}/${f.screenshot}` : null,
  replay: f.replay ?? null, replayPlan: f.replayPlan ?? null,
});

// Folds one run in. run = { at, level, seed, chaos, commit, dirty, dir, result, interrupted, realSeconds, findings }
// (findings as in a report.json; dir relative to the repo). Returns the entries new to the database and the ones
// seen before (their counts bumped). A complete, error-free run marks its commit good for the level.
export function merge(db, run) {
  const fresh = [], known = [], seen = new Set();
  for (const f of run.findings || []) {
    const key = entryKey(f.kind, f.sig);
    if (seen.has(key)) { db.entries[key].hits += f.count || 1; continue; } // two raw sigs, one bug
    seen.add(key);
    let e = db.entries[key];
    if (e) {
      e.runs++; e.hits += f.count || 1; e.lastSeen = run.at; e.severity = f.severity; e.lastRun = runRef(run, f);
      e.levels[run.level] = (e.levels[run.level] || 0) + 1;
      known.push(e);
    } else {
      e = db.entries[key] = { key, kind: f.kind, sig: f.sig, normSig: normSig(f.kind, f.sig), severity: f.severity,
        firstSeen: run.at, lastSeen: run.at, runs: 1, hits: f.count || 1, levels: { [run.level]: 1 },
        firstRun: runRef(run, f), lastRun: runRef(run, f) };
      fresh.push(e);
    }
  }
  const errors = (run.findings || []).some((f) => f.severity === 'error');
  if (!errors && run.commit && !run.interrupted && run.result !== 'TOOL FAILURE') {
    db.good[run.level] = run.commit;
    db.goodDirty[run.level] = !!run.dirty;   // the uncommitted changes passed with it, not the commit alone
  }
  db.runs.push({ at: run.at, level: run.level, seed: run.seed, chaos: !!run.chaos, commit: run.commit ?? null, dirty: !!run.dirty,
    dir: run.dir ?? null, result: run.result ?? null, findings: (run.findings || []).length, fresh: fresh.length,
    realSeconds: run.realSeconds ?? null });
  if (db.runs.length > MAX_RUNS) db.runs.splice(0, db.runs.length - MAX_RUNS);
  return { fresh, known };
}

// a tool failure (the robot could not run): true the first time that message is seen
export function noteFailure(db, message, at) {
  const key = normSig('exception', message);
  const f = db.failures[key];
  if (f) { f.count++; f.last = at; return false; }
  db.failures[key] = { first: at, last: at, count: 1 };
  return true;
}

// local time, `2026-11-18 14:03:22`
export function localTime(at) {
  const d = new Date(at), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const code = (s) => '`' + String(s).replace(/`/g, "'").replace(/\s+/g, ' ') + '`';

// one new finding in watch.md: a bullet line, then its replay and screenshot
export function markdownLine(entry, run) {
  const r = entry.firstRun;
  const where = [r.level, `seed ${r.seed}`, r.plan ? `plan ${r.plan}` : null, r.chaos ? 'chaos' : 'normal',
    r.commit ? r.commit.slice(0, 8) + (r.dirty ? ' dirty' : '') : 'commit ?'].filter(Boolean).join(', ');
  const L = [`- ${localTime(run.at)} **${entry.severity.toUpperCase()}** ${code(entry.kind)} ${code(entry.sig.slice(0, 160))} (${where})`];
  if (r.replay) L.push(`  - replay: ${code(r.replay)}`);
  if (r.replayPlan) L.push(`  - replay its plan only: ${code(r.replayPlan)}`);
  L.push(`  - screenshot: ${r.screenshot || '-'}${r.dir ? `, report: ${r.dir}/report.md` : ''}`);
  return L.join('\n');
}

export const WATCH_HEADER = `# QA watch log

Written by \`npm run qa:watch\` (tools/qa/watch.mjs): the QA robot plays short runs in the background, level after
level, seed after seed, normal and chaos, and this file only gets what was NEVER seen before. A finding is "the same"
when its kind and its signature match once positions, ids and numbers are taken out (tools/qa/findings-db.mjs
\`normSig\`); counts of findings already known are kept in qa-report/watch-db.json, not here.

Each entry: local time, severity, kind, raw signature (level, seed, the bot's plan, chaos or normal, the commit under
test, \`dirty\` when the working tree had uncommitted changes), the command that plays that run again, and the
screenshot / report of the run (its folder in qa-report/watch/ is kept). ERROR is a game bug (or a tool bug when its
stack goes through bot.js), WARN a lead. With \`--bisect\`, an error is replayed and the first bad commit searched:
the result follows the entry. Tool failures (the robot could not run) are logged once each.

`;
