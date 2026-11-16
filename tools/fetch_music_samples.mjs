// Downloads the recorded instrument samples listed in tools/music_sources.json into tools/music-samples/files/<id>/
// (git-ignored), skipping the files already there. node tools/fetch_music_samples.mjs [--jobs n]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'tools', 'music-samples', 'files');
const jobsAt = process.argv.indexOf('--jobs');
const JOBS = jobsAt > 0 ? +process.argv[jobsAt + 1] : 8;
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'music_sources.json'), 'utf8'));

const queue = [];
for (const s of manifest.sources) {
  for (const f of s.files) queue.push({ url: s.base + f.split('/').map(encodeURIComponent).join('/'), out: path.join(DEST, s.id, f) });
}
let done = 0, fetched = 0, bytes = 0, failed = 0;
async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    if (!fs.existsSync(job.out)) {
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await fetch(job.url);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const b = Buffer.from(await r.arrayBuffer());
          fs.mkdirSync(path.dirname(job.out), { recursive: true });
          fs.writeFileSync(job.out, b);
          fetched++; bytes += b.length;
          break;
        } catch (e) {
          if (attempt >= 3) { failed++; console.error('FAILED', job.url, e.message); break; }
        }
      }
    }
    if (++done % 100 === 0) console.log(`${done} files (${fetched} fetched, ${(bytes / 1e6).toFixed(1)} MB)`);
  }
}
await Promise.all(Array.from({ length: JOBS }, worker));
console.log(`done: ${done} files, ${fetched} fetched (${(bytes / 1e6).toFixed(1)} MB), ${failed} failed`);
if (failed) process.exitCode = 1;
