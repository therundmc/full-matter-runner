// Pre-commit checks for the `check` skill: `node .claude/skills/check/check.mjs`
// 1. every line the working tree adds (git diff HEAD, staged or not) and every untracked text file is ASCII;
// 2. a generated file changed while its generator did not (a hand edit, or a stale regeneration).
// .claude/worktrees/ is skipped. Exit code 1 when anything is reported. Read-only: touches nothing.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sh = (c) => execSync(c, { encoding: 'utf8', maxBuffer: 64 << 20 });
const TEXT = /\.(js|mjs|cjs|py|json|md|html|css|txt|yml|yaml)$/i;
const skip = (f) => !f || f.startsWith('.claude/worktrees/');
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);

const changed = lines(sh('git diff HEAD --name-only')).filter((f) => !skip(f));
const untracked = lines(sh('git ls-files --others --exclude-standard')).filter((f) => !skip(f));
const touched = new Set([...changed, ...untracked]);
const problems = [];

// 1. ASCII: added lines of tracked files, whole untracked text files
let file = null;
for (const l of sh('git diff HEAD -U0 --no-color').split('\n')) {
  if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); continue; }
  if (!file || skip(file) || !TEXT.test(file) || !l.startsWith('+')) continue;
  if (/[^\x00-\x7f]/.test(l)) problems.push(`non-ASCII  ${file}: ${l.slice(1).trim().slice(0, 100)}`);
}
for (const f of untracked) {
  if (!TEXT.test(f) || !fs.existsSync(f)) continue;
  fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (/[^\x00-\x7f]/.test(l)) problems.push(`non-ASCII  ${f}:${i + 1}: ${l.trim().slice(0, 100)}`);
  });
}

// 2. generated outputs and what makes them
const GENERATED = [
  [/^src\/game\/data\/levels\/level1\.js$/, ['tools/build_level1.py', 'tools/levelkit.py']],
  [/^src\/game\/data\/levels\/lab\.js$/, ['tools/build_lab.py', 'tools/levelkit.py']],
  [/^src\/game\/data\/levels\/tutorial\.js$/, ['tools/build_tutorial.py', 'tools/levelkit.py']],
  [/^(src\/audio\/bank\.js|assets\/sound\/foley\.wav)$/, ['tools/build_sounds.mjs', 'tools/sounds.json']],
  [/^assets\/sprites\/comic\//, ['tools/generate_comic.py', 'tools/comic/']],
  [/^assets\/sprites\/title\//, ['tools/comic/']],
  [/^assets\/sprites\//, ['tools/generate_assets.py']],
];
for (const f of touched) {
  const rule = GENERATED.find(([re]) => re.test(f));
  if (rule && !rule[1].some((g) => (g.endsWith('/') ? [...touched].some((t) => t.startsWith(g)) : touched.has(g)))) {
    problems.push(`generated  ${f} changed but not ${rule[1].join(' / ')}: hand edit? regenerate and compare`);
  }
}

console.log(`${changed.length} changed, ${untracked.length} untracked file(s) checked`);
for (const p of problems) console.log(p);
console.log(problems.length ? `KO: ${problems.length} problem(s)` : 'OK: ASCII diff, no hand-edited generated file');
process.exit(problems.length ? 1 : 0);
