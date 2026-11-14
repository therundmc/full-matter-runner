// Screenshot / scenario harness: `npm run shot -- <scenario.json> <outdir> [--port n]`
// (or `node tools/shot.mjs ...`). Starts its own static server (first free port from --port, default 8124) unless
// the scenario gives a `url`, opens the game in headless Edge (tools/qa/cdp.mjs: own temporary profile, always
// torn down), runs the steps in order, writes NN_name.png screenshots into <outdir>, and prints each eval result
// and the page's console errors / exceptions. Exit code 1 when an eval threw or the page logged an error.
//
// Scenario format (JSON):
//   {
//     "width": 1280, "height": 720,          optional viewport (default 1280 x 720)
//     "url": "http://127.0.0.1:8000/",       optional: an already running server instead of our own
//     "query": "?level=lab",                 optional: appended to our own server's URL
//     "steps": [ ... ]                       each step may hold several of these keys, run in this order:
//   }
//   { "wait": 500 }                          sleep (ms)
//   { "click": [x, y], "button": "left", "holdMs": 30 }   real mouse click at viewport coordinates
//   { "move": [x, y] }                       mouse move
//   { "key": "Space", "hold": 0 }            key press (physical code: KeyW, Space, Backspace...) held `hold` ms
//   { "keydown": "KeyD" } / { "keyup": "KeyD" }
//   { "eval": "game.state" }                 JS run in the page like in the console (wrapped in a block; the value
//                                            of its last expression is printed; `await` allowed, promises awaited)
//   { "shot": "name" }                       screenshot -> <outdir>/NN_name.png
//
// Example: start level 1, skip the intro, get up, and take a picture of the start alley:
//   { "steps": [
//     { "wait": 2500 },
//     { "click": [640, 360] },
//     { "wait": 400, "key": "Space" },
//     { "eval": "game.setState('play'); game.world.player.sit = 0; game.state" },
//     { "wait": 800, "shot": "start" }
//   ] }
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { launchBrowser, click, key, sleep, CDP } from './qa/cdp.mjs';

const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const port = portAt >= 0 ? +args.splice(portAt, 2)[1] : 8124;
const [scenarioFile, outDir] = args;
if (!scenarioFile || !outDir) {
  console.error('usage: node tools/shot.mjs <scenario.json> <outdir> [--port n]   (format: see the top of tools/shot.mjs)');
  process.exit(2);
}
const sc = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const W = sc.width || 1280, H = sc.height || 720;

let server = null, browser = null, failed = false;
const cleanup = async () => { await browser?.close().catch(() => {}); await server?.close().catch(() => {}); browser = server = null; };
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

try {
  let url = sc.url;
  if (!url) {
    server = await startServer({ port, quiet: true });
    url = server.url + (sc.query || '');
  }
  browser = await launchBrowser({ width: W, height: H });
  const page = browser.page;
  const out = (s) => console.log(s);
  page.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error' && p.type !== 'warning' && p.type !== 'assert') return;
    if (p.type !== 'warning') failed = true;
    out(`[console.${p.type}] ${CDP.consoleText(p)}`);
  });
  page.on('Runtime.exceptionThrown', (p) => { failed = true; out(`[EXCEPTION] ${CDP.exceptionText(p.exceptionDetails)}`); });
  page.on('Log.entryAdded', ({ entry }) => {
    if (entry.level !== 'error' || /\/favicon\.ico$/.test(entry.url || '')) return;
    failed = true;
    out(`[log error] ${entry.text} ${entry.url || ''}`);
  });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  await page.send('Page.navigate', { url });
  await sleep(sc.settle ?? 1500);

  let shot = 0;
  for (const a of sc.steps || []) {
    if (a.wait) await sleep(a.wait);
    if (a.move) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.move[0], y: a.move[1] });
    if (a.click) await click(page, a.click[0], a.click[1], a.button || 'left', a.holdMs || 30);
    if (a.key) await key(page, a.key, 'both', a.hold || 0);
    if (a.keydown) await key(page, a.keydown, 'down');
    if (a.keyup) await key(page, a.keyup, 'up');
    if (a.eval) {
      const head = a.eval.replace(/\s+/g, ' ').slice(0, 70);
      try {
        const v = await page.eval(`{${a.eval}}`, { repl: true });
        out(`[eval] ${head} => ${JSON.stringify(v)}`);
      } catch (e) {
        failed = true;
        out(`[eval] ${head} => ERROR ${e.message}`);
      }
    }
    if (a.shot) {
      const f = path.join(outDir, `${String(++shot).padStart(2, '0')}_${a.shot}.png`);
      await page.screenshot(f);
      out(`[shot] ${f}`);
    }
  }
} catch (e) {
  console.error(`[shot] failed: ${e.message}`);
  await cleanup();
  process.exit(2);
}
await cleanup();
process.exit(failed ? 1 : 0);
