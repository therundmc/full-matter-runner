// The QA background runner's pure parts: finding dedupe, the database merge, the run schedule, the commit search.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normSig, entryKey, emptyDb, merge, load, save, markdownLine } from '../tools/qa/findings-db.mjs';
import { schedule, firstBad, reproMatch, parseArgs } from '../tools/qa/watch.mjs';

const f = (kind, sig, severity = 'error', extra = {}) => ({ key: `${kind}|${sig}`, kind, sig, severity, count: 1, ...extra });
const run = (findings, extra = {}) => ({ at: '2026-11-18T10:00:00.000Z', level: 'level1', seed: 7, chaos: false, commit: 'abc1234567',
  dirty: false, dir: 'qa-report/watch/x', result: 'PASS', findings, ...extra });

test('qawatch: the same bug at two positions is one key', () => {
  assert.equal(entryKey('in-wall', 'guard@12,7'), entryKey('in-wall', 'guard@3,40'));
  assert.equal(normSig('in-wall', 'guard@12,7'), 'guard');
  assert.equal(entryKey('guard-stuck', 'idle@14,22'), entryKey('guard-stuck', 'idle@1,2'));
  assert.equal(entryKey('lasting-dead', 'prop-in-wall: chair@31,9'), entryKey('lasting-dead', 'prop-in-wall: chair@2,90'));
  assert.equal(normSig('plan-failed', 'roof 3: go 12,7: no path'), 'roof 3: go #,#: no path');
  assert.equal(entryKey('plan-failed', 'roof 3: go 12,7: no path'), entryKey('plan-failed', 'roof 3: go 4,18: no path'));
  assert.equal(normSig('nan', 'enemy12 body'), 'enemy# body');
  assert.equal(normSig('slow', 'worst-step 61.5 ms'), 'worst-step # ms');
});

test('qawatch: what differs stays apart', () => {
  assert.notEqual(entryKey('in-wall', 'guard@12,7'), entryKey('in-wall', 'player@12,7'));
  assert.notEqual(entryKey('in-wall', 'guard@12,7'), entryKey('out-of-map', 'guard@12,7'));
  // a plan's step index is not a position
  assert.notEqual(entryKey('plan-failed', 'roof 3: ladder: timeout'), entryKey('plan-failed', 'roof 4: ladder: timeout'));
  assert.notEqual(entryKey('not-covered', 'ladderUp'), entryKey('not-covered', 'ladderDown'));
});

test('qawatch: exception signatures keep their first line, numbers become #', () => {
  const a = 'uncaught: TypeError: Cannot read properties of undefined (reading \'x\') at http://127.0.0.1:8123/src/game/World.js:120:17\n    at more';
  const b = 'uncaught: TypeError: Cannot read properties of undefined (reading \'x\') at http://127.0.0.1:8124/src/game/World.js:131:5';
  assert.equal(entryKey('exception', a), entryKey('exception', b));
  assert.equal(normSig('exception', 'update: index 42 out of 0x1f range'), 'update: index # out of # range');
  assert.ok(!normSig('exception', a).includes('more'));
  assert.notEqual(entryKey('exception', 'update: a is null'), entryKey('exception', 'update: b is null'));
});

test('qawatch: merge sorts fresh from known and counts', () => {
  const db = emptyDb();
  const one = merge(db, run([f('in-wall', 'guard@12,7', 'error', { count: 3, screenshot: '01_in-wall.png', plan: 'roof', replay: 'npm run qa -- x' }),
    f('slow', 'worst-step', 'warn')]));
  assert.equal(one.fresh.length, 2);
  assert.equal(one.known.length, 0);
  const e = db.entries['in-wall|guard'];
  assert.equal(e.hits, 3);
  assert.equal(e.firstRun.screenshot, 'qa-report/watch/x/01_in-wall.png');
  assert.equal(e.firstRun.plan, 'roof');
  const two = merge(db, run([f('in-wall', 'guard@3,4'), f('in-wall', 'guard@5,6'), f('nan', 'player')], { at: '2026-11-18T11:00:00.000Z', level: 'lab' }));
  assert.deepEqual(two.fresh.map((x) => x.key), ['nan|player']);
  assert.deepEqual(two.known.map((x) => x.key), ['in-wall|guard']);
  assert.equal(e.runs, 2);
  assert.equal(e.hits, 5);
  assert.deepEqual(e.levels, { level1: 1, lab: 1 });
  assert.equal(e.firstSeen, '2026-11-18T10:00:00.000Z');
  assert.equal(e.lastSeen, '2026-11-18T11:00:00.000Z');
  assert.equal(db.runs.length, 2);
  assert.ok(markdownLine(e, { at: e.firstSeen }).includes('`in-wall`'));
});

test('qawatch: a level is marked good only by a complete, error-free run', () => {
  const db = emptyDb();
  merge(db, run([f('in-wall', 'guard@1,1')], { commit: 'bad1' }));
  assert.equal(db.good.level1, undefined);
  merge(db, run([f('slow', 'worst-step', 'warn')], { commit: 'ok1' }));
  assert.equal(db.good.level1, 'ok1');
  merge(db, run([], { commit: 'cut1', interrupted: true }));
  merge(db, run([], { commit: 'tool1', result: 'TOOL FAILURE' }));
  merge(db, run([f('nan', 'player')], { commit: 'bad2' }));
  assert.equal(db.good.level1, 'ok1');
  assert.equal(db.goodDirty.level1, false);
  merge(db, run([], { commit: 'dirty1', dirty: true }));
  assert.equal(db.good.level1, 'dirty1');
  assert.equal(db.goodDirty.level1, true);
  merge(db, run([], { commit: 'ok2', level: 'lab' }));
  assert.deepEqual(db.good, { level1: 'dirty1', lab: 'ok2' });
});

test('qawatch: the database survives a save and a load, a broken file starts afresh', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmr-qawatch-'));
  try {
    const file = path.join(dir, 'db.json');
    assert.deepEqual(load(file), emptyDb());
    const db = emptyDb();
    merge(db, run([f('nan', 'player')]));
    save(file, db);
    assert.deepEqual(load(file), db);
    assert.deepEqual(fs.readdirSync(dir), ['db.json']);   // no temp file left
    fs.writeFileSync(file, '{ not json');
    assert.deepEqual(load(file), emptyDb());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('qawatch: the schedule rotates levels and seeds, chaos takes turns on every level', () => {
  const o = { levels: ['tutorial', 'level1', 'lab'], seed: 100, chaosEvery: 2 };
  const runs = Array.from({ length: 6 }, (_, i) => schedule(i, o));
  assert.deepEqual(runs.map((r) => r.level), ['tutorial', 'level1', 'lab', 'tutorial', 'level1', 'lab']);
  assert.deepEqual(runs.map((r) => r.seed), [100, 101, 102, 103, 104, 105]);
  assert.deepEqual(runs.map((r) => r.god), [true, false, false, true, false, false]);
  assert.equal(runs.filter((r) => r.chaos).length, 3);
  for (const level of o.levels) assert.deepEqual(runs.filter((r) => r.level === level).map((r) => r.chaos).sort(), [false, true]);
  // two levels, every second run: each level gets both
  const two = Array.from({ length: 4 }, (_, i) => schedule(i, { levels: ['a', 'b'], seed: 0, chaosEvery: 2 }));
  assert.deepEqual(two.map((r) => `${r.level}${r.chaos ? '+' : ''}`), ['a', 'b+', 'a+', 'b']);
  assert.ok(Array.from({ length: 9 }, (_, i) => schedule(i, { ...o, chaosEvery: 0 })).every((r) => !r.chaos));
});

test('qawatch: options', () => {
  const o = parseArgs(['--levels', 'level1', '--runs', '3', '--chaos-every', '0', '--bisect', '--good', 'HEAD~2']);
  assert.deepEqual(o.levels, ['level1']);
  assert.equal(o.runs, 3);
  assert.equal(o.chaosEvery, 0);
  assert.equal(o.minutes, 2.5);
  assert.equal(o.bisectMax, 8);
  assert.ok(o.bisect && o.good === 'HEAD~2');
  assert.throws(() => parseArgs(['--nope']));
});

test('qawatch: the binary search finds the first bad commit', async () => {
  const commits = Array.from({ length: 13 }, (_, i) => `c${i}`);
  for (const bad of [0, 1, 6, 11, 12]) {
    const asked = [];
    const res = await firstBad(commits, async (sha) => { asked.push(sha); return +sha.slice(1) >= bad; });
    assert.equal(res.first, `c${bad}`);
    assert.ok(asked.length <= 4, `${asked.length} tests for 13 commits`);
    assert.ok(!asked.includes('c12'));   // the last one is known bad
  }
  assert.equal((await firstBad(['only'], async () => { throw new Error('never asked'); })).first, 'only');
});

test('qawatch: the search stops on an untestable commit and gives the range', async () => {
  const commits = Array.from({ length: 8 }, (_, i) => `c${i}`);
  let budget = 2;
  const res = await firstBad(commits, async (sha) => (budget-- > 0 ? +sha.slice(1) >= 5 : null));
  assert.equal(res.first, null);
  assert.ok(res.stopped);
  const range = commits.slice(res.lo + 1, res.hi + 1);
  assert.ok(range.includes('c5') && range.length < commits.length);
});

test('qawatch: a reproduction matches the signature, or the kind only', () => {
  const rep = { findings: [f('in-wall', 'guard@9,9'), f('nan', 'item')] };
  assert.equal(reproMatch(rep, 'in-wall', normSig('in-wall', 'guard@1,2')), 'exact');
  assert.equal(reproMatch(rep, 'nan', 'player'), 'kind');
  assert.equal(reproMatch(rep, 'softlock', 'hang'), null);
  assert.equal(reproMatch(null, 'nan', 'player'), null);
});
