// Local server for the game: `npm start` (or `node tools/serve.mjs [port]`).
// Serves the repository on the first free port from 8000 up (so a server left running elsewhere is not a problem),
// answers several requests at once and never lets the browser cache anything: a plain reload always shows the
// latest sprites, sounds and code.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url.endsWith('/') ? url + 'index.html' : url);
  // nothing outside the repository
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// does anything answer on that port, over IPv4 or IPv6? (binding alone does not tell: on Windows a server bound to
// the IPv6 side leaves the IPv4 side free, and the browser would then reach the other one through `localhost`)
const answers = (port, host) => new Promise((done) => {
  const s = net.connect({ port, host });
  s.setTimeout(400);
  s.on('connect', () => { s.destroy(); done(true); });
  for (const ev of ['error', 'timeout']) s.on(ev, () => { s.destroy(); done(false); });
});
const taken = async (port) => (await Promise.all([answers(port, '127.0.0.1'), answers(port, '::1')])).some(Boolean);

let port = +process.argv[2] || 8000;
const last = port + 20;
while (port < last && await taken(port)) {
  console.log(`port ${port} is taken (another server is still running there), trying ${port + 1}`);
  port++;
}
server.on('error', (e) => { console.error(e.message); process.exit(1); });
// 127.0.0.1 in the address, not `localhost`: nothing else can be reached by mistake
server.listen(port, '127.0.0.1', () => console.log(`FULL MATTER RUNNER: http://127.0.0.1:${port}  (Ctrl+C to stop)`));
