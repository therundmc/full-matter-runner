// `npm run play`: serves the game as of the last commit, not the files being worked on.
// While agents are editing the repository its working tree is broken half of the time (a module asks for an export
// the next file does not have yet): playing from it fails at random. This exports the committed files to a folder of
// the system's temp directory and serves that; every time the page is loaded it looks whether a new commit came in
// and exports again, so a reload always shows the latest finished work and never work in progress.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(os.tmpdir(), 'full-matter-runner-play');
const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

let shown = null;
// the committed files, written over the last export (HEAD's own tree, whatever is staged or modified)
function refresh() {
  const head = git('rev-parse', 'HEAD');
  if (head === shown) return;
  fs.mkdirSync(OUT, { recursive: true });
  const index = path.join(OUT, '.export-index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  execFileSync('git', ['read-tree', 'HEAD'], { cwd: REPO, env });
  execFileSync('git', ['checkout-index', '-a', '-f', `--prefix=${OUT.replace(/\\/g, '/')}/`], { cwd: REPO, env });
  shown = head;
  console.log(`playing commit ${head.slice(0, 7)}: ${git('log', '-1', '--format=%s').slice(0, 90)}`);
}

refresh();
const { port } = await startServer({ port: +process.argv[2] || 8100, root: OUT, onPage: refresh });
console.log(`FULL MATTER RUNNER (last commit): http://127.0.0.1:${port}  (Ctrl+C to stop)`);
