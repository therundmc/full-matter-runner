// Headless browser plumbing shared by tools/qa/run.mjs and tools/shot.mjs: find and launch Edge (or Chrome) with
// its own temporary profile and the DevTools protocol on a free port, talk to the page over a WebSocket, and always
// tear it all down (browser process tree, profile folder). Node 22: global fetch and WebSocket, no dependency.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

// QA_BROWSER (a browser binary) wins when set, else the first known install found
export function findBrowser() {
  return process.env.QA_BROWSER || CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

// A DevTools protocol session on one target (a page). send() resolves with the result or rejects with the protocol
// error; on(method, fn) listens to events.
export class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((ok, fail) => {
      this.ws.addEventListener('open', ok, { once: true });
      this.ws.addEventListener('error', () => fail(new Error('DevTools WebSocket failed to open')), { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { ok, fail } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) fail(new Error(`${m.error.message} (${m.error.code})`)); else ok(m.result);
      } else if (m.method) for (const fn of this.listeners.get(m.method) || []) fn(m.params);
    });
    this.ws.addEventListener('close', () => {
      this.closed = true;
      for (const { fail } of this.pending.values()) fail(new Error('DevTools connection closed'));
      this.pending.clear();
    });
    return this;
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('DevTools connection closed'));
    return new Promise((ok, fail) => {
      const id = ++this.id;
      this.pending.set(id, { ok, fail });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  // evaluate an expression in the page; resolves with its value (returnByValue), rejects with the page's exception.
  // repl: console-like evaluation (top-level await allowed)
  async eval(expression, { timeout = 120000, repl = false } = {}) {
    let timer;
    const r = await Promise.race([
      this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, replMode: repl }),
      new Promise((_, fail) => { timer = setTimeout(() => fail(new Error(`page evaluation timed out after ${timeout} ms`)), timeout); }),
    ]).finally(() => clearTimeout(timer));
    if (r.exceptionDetails) throw new Error(CDP.exceptionText(r.exceptionDetails));
    return r.result.value;
  }

  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }

  // one-line texts of a console call / an exception
  static consoleText(p) { return p.args.map((a) => a.value ?? a.description ?? a.unserializableValue ?? '').join(' '); }
  static exceptionText(d) { return d.exception?.description || d.text || 'exception'; }

  close() { try { this.ws?.close(); } catch { /* already gone */ } }
}

// Launch the browser headless with a fresh profile. Resolves to { proc, port, page (a CDP session on the first tab),
// close() }. width/height: the window and the page viewport. The sound is muted (the page still runs its audio).
export async function launchBrowser({ binary = findBrowser(), width = 1280, height = 720, extraArgs = [] } = {}) {
  if (!binary || !fs.existsSync(binary)) throw new Error(`browser not found (${binary || 'no candidate'}); set QA_BROWSER to its path`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fmr-qa-'));
  const proc = spawn(binary, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-gpu-sandbox', '--mute-audio', '--enable-precise-memory-info', ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' });
  let dead = false;
  proc.on('exit', () => { dead = true; });
  proc.on('error', () => { dead = true; });

  const kill = async () => {
    if (!dead && proc.pid) {
      // the whole tree: renderer and GPU processes too (only ours: everything started from this pid)
      try {
        if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
        else proc.kill('SIGKILL');
      } catch { /* already gone */ }
    }
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(300); }
    }
  };

  try {
    // the browser writes the port it picked into the profile once it listens
    let port = 0;
    for (let i = 0; i < 150 && !port; i++) {
      if (dead) throw new Error('browser exited at start');
      try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(100); }
    }
    if (!port) throw new Error('browser did not open its DevTools port');
    let targets = [];
    for (let i = 0; i < 100; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { /* not yet */ }
      if (targets.some((t) => t.type === 'page')) break;
      await sleep(100);
    }
    const target = targets.find((t) => t.type === 'page');
    if (!target) throw new Error('no page target in the browser');
    const page = await new CDP(target.webSocketDebuggerUrl).open();
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    let closed = false;
    const close = async () => { if (closed) return; closed = true; page.close(); await kill(); };
    return { proc, port, page, profile, close };
  } catch (e) {
    await kill();
    throw e;
  }
}

// mouse click (press + release) at viewport coordinates
export async function click(page, x, y, button = 'left', holdMs = 30) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
  await sleep(holdMs);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
}

// a key by its physical code (KeyW, Space, Backspace...): pressed and released, or only 'down' / 'up'
export async function key(page, code, type = 'both', holdMs = 0) {
  const k = code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code;
  if (type === 'both' || type === 'down') await page.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k });
  if (type === 'both' && holdMs) await sleep(holdMs);
  if (type === 'both' || type === 'up') await page.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k });
}
