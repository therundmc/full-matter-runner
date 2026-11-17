// Compares two QA runs for the `qa` skill: `node .claude/skills/qa/compare.mjs [new-dir] [old-dir]`
// Default: the newest qa-report/<stamp>/ and the newest earlier one of the same level (and same --god).
// Prints findings that are new / gone, coverage counters that dropped to 0 or by half, kills and clears, speed.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'qa-report';
const load = (dir) => ({ ...JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')), dir });
const runs = () => fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, 'report.json'))).sort().reverse()
  .map((d) => path.join(ROOT, d));

let [a, b] = process.argv.slice(2);
const cur = load(a || runs()[0]);
const o = cur.options;
if (!b) b = runs().find((d) => d < cur.dir && (({ options: p }) => p.level === o.level && !!p.god === !!o.god)(load(d)));
if (!b) { console.log(`no earlier run of ${o.level}${o.god ? ' --god' : ''} to compare ${cur.dir} with`); process.exit(0); }
const old = load(b);
const tag = (r) => `${r.dir} (${r.options.level} seed ${r.options.seed}, ${r.options.minutes} min${r.options.god ? ', god' : ''}): ${r.result}`;
console.log(`new ${tag(cur)}\nold ${tag(old)}`);
if (cur.options.seed !== old.options.seed || cur.options.minutes !== old.options.minutes) {
  console.log('note: seed or minutes differ, counts are only indicative');
}

const keys = (r) => new Map((r.findings || []).map((f) => [f.key, f]));
const kn = keys(cur), ko = keys(old);
const fresh = [...kn.values()].filter((f) => !ko.has(f.key));
const gone = [...ko.values()].filter((f) => !kn.has(f.key));
console.log(`\nfindings: ${kn.size} now, ${ko.size} before`);
for (const f of fresh) console.log(`  NEW  ${f.severity} ${f.kind}: ${String(f.sig).slice(0, 100)} (x${f.count})`);
for (const f of gone) console.log(`  gone ${f.severity} ${f.kind}: ${String(f.sig).slice(0, 100)}`);

const cn = cur.stats?.coverage || {}, co = old.stats?.coverage || {};
const drops = Object.keys(co).filter((k) => co[k] > 0 && (cn[k] || 0) <= co[k] / 2);
console.log(`\ncoverage drops: ${drops.length ? drops.map((k) => `${k} ${co[k]} -> ${cn[k] || 0}`).join(', ') : 'none'}`);

// stats: kills a number, clears a list of clears, deaths a count per cause
const count = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object'
  ? Object.values(v).reduce((s, x) => s + (+x || 0), 0) : v ?? '-');
const n = (r, k) => count(r.stats?.[k]);
console.log(`sessions ${n(old, 'sessions')} -> ${n(cur, 'sessions')}, kills ${n(old, 'kills')} -> ${n(cur, 'kills')}, `
  + `clears ${n(old, 'clears')} -> ${n(cur, 'clears')}, deaths ${n(old, 'deaths')} -> ${n(cur, 'deaths')}`);
console.log(`speed old: ${old.perf}\nspeed new: ${cur.perf}`);
