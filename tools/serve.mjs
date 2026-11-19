// Local server for the game: `npm start` (or `node tools/serve.mjs [port]`).
// Serves the repository on the first free port from 8000 up (so a server left running elsewhere is not a problem),
// answers several requests at once and never lets the browser cache anything: a plain reload always shows the
// latest sprites, sounds and code.
// Also a module: `startServer({ port, quiet, root, onPage })` (tools/qa, tools/shot.mjs, tools/play.mjs) resolves to
// { server, port, url, close }. root: the folder served (default: the repository); onPage: called before a page (a
// URL ending with /) is served.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

const handler = (root, onPage) => (req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end('bad request'); return; }
  if (onPage && url.endsWith('/')) { try { onPage(); } catch (e) { console.error(e.message); } }
  const file = path.join(root, url.endsWith('/') ? url + 'index.html' : url);
  // nothing outside the served folder (a sibling folder whose name starts like it neither)
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
};

// does anything answer on that port, over IPv4 or IPv6? (binding alone does not tell: on Windows a server bound to
// the IPv6 side leaves the IPv4 side free, and the browser would then reach the other one through `localhost`)
const answers = (port, host) => new Promise((done) => {
  const s = net.connect({ port, host });
  s.setTimeout(400);
  s.on('connect', () => { s.destroy(); done(true); });
  for (const ev of ['error', 'timeout']) s.on(ev, () => { s.destroy(); done(false); });
});
const taken = async (port) => (await Promise.all([answers(port, '127.0.0.1'), answers(port, '::1')])).some(Boolean);

// first free port in [port, port + 20)
export async function freePort(port = 8000, quiet = false) {
  const last = port + 20;
  while (port < last && await taken(port)) {
    if (!quiet) console.log(`port ${port} is taken (another server is still running there), trying ${port + 1}`);
    port++;
  }
  return port;
}

export async function startServer({ port = 8000, quiet = false, root = ROOT, onPage = null } = {}) {
  port = await freePort(port, quiet);
  const server = http.createServer(handler(path.resolve(root), onPage));
  await new Promise((done, fail) => {
    server.once('error', fail);
    // 127.0.0.1 in the address, not `localhost`: nothing else can be reached by mistake
    server.listen(port, '127.0.0.1', done);
  });
  // keep-alive sockets would hold close() open: drop them
  const close = () => new Promise((done) => { server.closeAllConnections?.(); server.close(() => done()); });
  return { server, port, url: `http://127.0.0.1:${port}/`, close };
}

// run directly: `npm start`
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const { port } = await startServer({ port: +process.argv[2] || 8000 });
    console.log(`FULL MATTER RUNNER: http://127.0.0.1:${port}  (Ctrl+C to stop)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
