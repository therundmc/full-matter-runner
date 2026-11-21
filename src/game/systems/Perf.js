// The game's performance, told: the developer's perf overlay (F8: OFF -> COMPACT -> FULL, ui/PerfOverlay.js draws
// it) and `game.perf.snapshot()` for the console and the QA robot. DOM-free: it reads the game's objects and what
// they say of themselves (the lens' card: PostGL.gpu, the owners' bytes()), the sections the profiler timed
// (engine/Profiler.js PROF, on while the overlay is) and its own ring of frame lengths, always kept (a few numbers a
// frame), so the graph is full the moment it shows.
// Its public fields (fps, frame, worst, update, render: ms, refreshed twice a second) are what the F4 overlay and the
// QA robot have always read (`{ ...game.perf }`): everything else stays private.
import Profiler, { PROF, percentile } from '../../engine/Profiler.js';
import { bytesOf } from '../../engine/Bytes.js';
import { quality } from './Quality.js';

export const PERF_MODES = ['off', 'compact', 'full'];
export const nextMode = (m) => PERF_MODES[(PERF_MODES.indexOf(m) + 1) % PERF_MODES.length];

// The sections timed (PROF.begin / end), in the overlay's order; `in`: the section it is part of (what a parent
// spent outside its timed parts is its OTHER). update / render: the whole of game.update / game.render (Game.loop).
export const SECTIONS = [
  { id: 'update', label: 'UPDATE' },
  { id: 'input', in: 'update', label: 'INPUT' },
  { id: 'sim', in: 'update', label: 'SIMULATION' },
  { id: 'player', in: 'sim', label: 'PLAYER/CAR' },
  { id: 'ai', in: 'sim', label: 'AI' },
  { id: 'chase', in: 'sim', label: 'PURSUERS' },
  { id: 'phys', in: 'sim', label: 'PHYSICS' },
  { id: 'fx', in: 'sim', label: 'PARTICLES/FX' },
  { id: 'liquid', in: 'sim', label: 'LIQUIDS' },
  { id: 'fire', in: 'sim', label: 'FIRE' },
  { id: 'smoke', in: 'sim', label: 'SMOKE FLUID' },
  { id: 'render', label: 'RENDER' },
  { id: 'draw', in: 'render', label: 'WORLD DRAW' },
  { id: 'map', in: 'draw', label: 'MAP LAYERS' },
  { id: 'wet', in: 'draw', label: 'WET FLOOR' },
  { id: 'light', in: 'draw', label: 'LIGHTING' },
  { id: 'haze', in: 'draw', label: 'SMOKE ART' },
  { id: 'lens', in: 'render', label: 'LENS (CPU)' },
  { id: 'replay', in: 'render', label: 'REPLAY COPY' },
  { id: 'hud', in: 'render', label: 'HUD' },
  { id: 'overlay', in: 'render', label: 'THIS OVERLAY' },
];
// the parents: what is timed inside them is shown under them, the rest as their OTHER
export const PARENTS = SECTIONS.filter((s) => SECTIONS.some((c) => c.in === s.id)).map((s) => s.id);
// what can spend the most of a frame (the overlay's red line): the leaves and the parents' remainders
export const LEAVES = SECTIONS.filter((s) => !PARENTS.includes(s.id)).map((s) => s.id).concat(PARENTS.map((p) => `${p}.other`));

// the refresh rates screens have: an estimate within 4 % of one is that one
const RATES = [30, 50, 60, 75, 90, 100, 120, 144, 165, 180, 240];
const MB = 1048576;
const mb = (b) => b / MB;
const SPAN = 500;     // ms the stats are taken over
const WORST = 2000;   // ms the worst frame is taken over
const REFRESH = 0.5;  // s between two refreshes of the numbers shown
const MEMORY = 1;     // s between two estimates of the buffers (FULL only)

// The display's refresh rate from the frames' lengths (ms): { hz, sure }. Their median, snapped to a rate screens
// have (sure); a game slower than its screen gives its own rate, not the screen's (not sure)
export function refreshOf(ms) {
  const m = percentile(ms, 0.5);
  if (!(m > 0)) return { hz: 0, sure: false };
  const hz = 1000 / m, near = RATES.find((r) => Math.abs(hz - r) / r < 0.04);
  return { hz: near ?? Math.round(hz), sure: near !== undefined };
}

// The leaf that spent the most of the last frame: { id, ms } (id: a section, or `<parent>.other`)
export function topOf(last) {
  let id = null, ms = -1;
  for (const k of LEAVES) {
    const v = k.endsWith('.other') ? other(last, k.slice(0, -6)) : last(k);
    if (v > ms) { ms = v; id = k; }
  }
  return { id, ms: Math.max(0, ms) };
}
// what a parent spent outside its timed parts
function other(read, parent) {
  let v = read(parent);
  for (const s of SECTIONS) if (s.in === parent) v -= read(s.id);
  return Math.max(0, v);
}

export default class Perf {
  // what the F4 overlay and the QA robot read (ms; fps a second), refreshed twice a second
  fps = 0;
  frame = 0;
  worst = 0;
  update = 0;
  render = 0;

  #game; #prof; #src; #mode = 'off';
  #frames = new Profiler(240); // every frame's length and simulation steps, always kept (cheap)
  #acc = { t: 0, n: 0, worst: 0, up: 0, dr: 0 };
  #shown = null; #shownT = 0; #memory = null; #memoryT = -Infinity; #clock = 0;
  #refresh = []; #graph = [];

  // game: the Game (or a stand-in with the same fields); prof: the profiler (PROF); src: what Perf cannot reach
  // without the DOM, as functions: voices() (sound voices playing), music() (the track's one-shots in flight:
  // Music.liveVoices), extra() ({ name: { arr, cvs } } bytes of the module-level caches: the sprites, the retry's
  // kept painting, the car clouds)
  constructor(game, { prof = PROF, voices = () => 0, music = () => 0, extra = () => ({}) } = {}) {
    this.#game = game;
    this.#prof = prof;
    this.#src = { voices, music, extra };
  }

  get mode() { return this.#mode; }
  get on() { return this.#mode !== 'off'; }

  // F8: OFF -> COMPACT -> FULL -> OFF. The profiler times while the overlay shows, from a clean slate
  cycle() { return this.setMode(nextMode(this.#mode)); }
  setMode(m) {
    this.#mode = PERF_MODES.includes(m) ? m : 'off';
    const was = this.#prof.on;
    this.#prof.on = this.on;
    if (this.#prof.on && !was) this.#prof.reset();
    this.#shown = null;
    this.#memoryT = -Infinity;
    return this.#mode;
  }

  // A frame is over (Game.loop): dt s it advanced (capped), real s since the last one, upMs / drMs the update's and
  // the render's ms, steps the simulation steps it ran
  tick(dt, real, upMs, drMs, steps) {
    const A = this.#acc, F = this.#frames;
    A.t += dt; A.n++; A.up += upMs; A.dr += drMs;
    A.worst = Math.max(A.worst, dt * 1000);
    if (A.t >= 0.5) {
      this.fps = Math.round(A.n / A.t);
      this.frame = (A.t * 1000) / A.n;
      this.worst = A.worst;
      this.update = A.up / A.n;
      this.render = A.dr / A.n;
      A.t = A.n = A.worst = A.up = A.dr = 0;
    }
    F.add('steps', steps);
    F.frame(real * 1000);
    this.#clock += real;
    if (!this.on) return;
    const P = this.#prof;
    P.add('update', upMs);
    P.add('render', drMs);
    P.frame(real * 1000);
    if (!this.#shown || this.#clock - this.#shownT >= REFRESH) {
      this.#shownT = this.#clock;
      this.#shown = this.snapshot({ memory: this.#mode === 'full' });
    }
  }

  // what the overlay shows: the last refreshed snapshot (null before the first), the frame lengths for the graph
  // (ms, oldest first) and the leaf that spent the most of the very last frame
  view() {
    const F = this.#frames, n = F.filled, ms = this.#graph;
    ms.length = n;
    for (let i = 0; i < n; i++) ms[i] = F.ms[(F.head - n + i + F.size) % F.size];
    return { snap: this.#shown, graph: ms, top: topOf((k) => this.#prof.last(k)) };
  }

  // Everything measured, as a plain object (the console, the QA robot). memory: estimate the buffers (a walk of the
  // owners: cheap, but not for every frame; the overlay does it once a second in FULL)
  snapshot({ memory = true } = {}) {
    const g = this.#game;
    return {
      t: +this.#clock.toFixed(2),
      mode: this.#mode,
      state: g.state,
      level: g.levelId ?? null,
      frame: this.frameStats(),
      cpu: this.cpu(),
      gpu: this.gpu(),
      memory: this.memory(memory),
      world: this.world(),
      quality: { setting: g.settings?.quality ?? null, level: quality().level, lens: !!(g.post?.ok && g.lensOn) },
    };
  }

  frameStats() {
    const F = this.#frames, s = F.frameStats(SPAN), w = F.frameStats(WORST), steps = F.stats('steps', SPAN);
    const n = F.frames(1000), r = this.#refresh;
    r.length = n;
    for (let i = 0; i < n; i++) r[i] = F.ms[(F.head - 1 - i + F.size) % F.size];
    const g = this.#game, P = this.#prof, rate = refreshOf(r);
    // (what the frame spent outside game.update and game.render: the browser, its compositing, the card, waiting)
    const js = P.on ? P.stats('update', SPAN).mean + P.stats('render', SPAN).mean : null;
    return {
      fps: s.mean > 0 ? Math.round(1000 / s.mean) : 0,
      ms: s.mean, min: s.min, p95: w.p95, worst: w.max,
      js, outside: js === null ? null : Math.max(0, s.mean - js),
      refreshHz: rate.hz, refreshSure: rate.sure,
      steps: { last: steps.last, mean: steps.mean, max: steps.max },
      timeScale: g.timeScale ?? 1,
      hitstop: Math.max(0, g.hitstop ?? 0),
    };
  }

  // each section's ms a frame (mean, p95, max over SPAN; last: the last frame), the parents' OTHER, the leaf that
  // spent the most of the last frame. Zeros while the profiler is off (profiling: false)
  cpu() {
    const P = this.#prof, out = { profiling: P.on, sections: {} };
    const pick = (s) => ({ mean: s.mean, p95: s.p95, max: s.max, last: s.last });
    for (const s of SECTIONS) out.sections[s.id] = pick(P.stats(s.id, SPAN));
    for (const p of PARENTS) {
      const mean = other((k) => out.sections[k].mean, p), last = other((k) => out.sections[k].last, p);
      out.sections[`${p}.other`] = { mean, p95: mean, max: mean, last };
    }
    out.top = topOf((k) => P.last(k)).id;
    return out;
  }

  // the card and the picture's sizes; the lens' own GPU time where the browser can time it (null: n/a); the texture
  // uploads a frame (gl: the scene sent to the lens; put: putImageData of the smoke and the wet floor)
  gpu() {
    const g = this.#game, post = g.post?.ok ? g.post : null, info = post?.gpu?.() ?? null, P = this.#prof;
    const c = g.canvas, cam = g.camera;
    return {
      renderer: info?.renderer ?? null, vendor: info?.vendor ?? null, timer: !!info?.timer, lensMs: info?.ms ?? null,
      scene: c ? [c.width, c.height] : null, lens: post ? [post.canvas.width, post.canvas.height] : null,
      dpr: globalThis.devicePixelRatio ?? 1, zoom: cam?.zoom ?? null, z: cam ? +cam.z.toFixed(3) : null, view: g.view ?? null,
      uploads: { gl: P.countStats('gl', SPAN), put: P.countStats('put', SPAN) },
    };
  }

  // The JS heap (performance.memory, Chromium; null elsewhere) and, when asked, an estimate of the game's own big
  // buffers by owner, MB ({ arr: typed arrays, in the JS heap; cvs: canvases, raster / graphics memory }). The
  // estimate is kept a second (MEMORY) for the overlay.
  memory(full = true) {
    const pm = globalThis.performance?.memory;
    const heap = pm ? { used: mb(pm.usedJSHeapSize), total: mb(pm.totalJSHeapSize), limit: mb(pm.jsHeapSizeLimit) } : null;
    if (!full) return { heap, owners: null };
    if (!this.#memory || this.#clock - this.#memoryT >= MEMORY || !this.on) {
      this.#memoryT = this.#clock;
      this.#memory = this.owners();
    }
    return { heap, ...this.#memory };
  }

  // each owner's buffers, MB, the biggest first; arr / cvs: their sums
  owners() {
    const g = this.#game, w = g.world, R = w?.renderer, seen = new Set(), post = g.post;
    const list = {
      'map layers': w?.decals?.bytes?.(),
      lighting: w?.lighting?.bytes?.(seen),
      liquids: w?.liquids?.bytes?.(seen),
      'wet floor art': R?.liquid?.bytes?.(seen),
      smoke: w?.smoke?.bytes?.(seen),
      'smoke art': R?.smoke?.bytes?.(seen),
      fire: w?.fireSpread?.bytes?.(seen),
      props: w ? bytesOf(w.props, seen, 2) : null,
      replay: g.recorder?.bytes?.(seen),
      frame: bytesOf([g.canvas, post?.canvas, post?.overlay, R?.layer, g.vignette].filter(Boolean), seen),
      'lens textures': post?.ok ? { arr: 0, cvs: post.textureBytes?.() ?? 0 } : null,
      ...this.#src.extra(),
    };
    const owners = Object.entries(list).filter(([, b]) => b).map(([name, b]) => ({ name, arr: mb(b.arr || 0), cvs: mb(b.cvs || 0) }));
    owners.sort((a, b) => b.arr + b.cvs - a.arr - a.cvs);
    return { owners, arr: owners.reduce((n, o) => n + o.arr, 0), cvs: owners.reduce((n, o) => n + o.cvs, 0) };
  }

  // what the world holds and does (null out of a level)
  world() {
    const w = this.#game.world;
    if (!w) return null;
    let dynamic = 0, statics = 0, sleeping = 0;
    const bodies = w.physics.bodies();
    for (const b of bodies) {
      if (b.isStatic) statics++;
      else { dynamic++; if (b.isSleeping) sleeping++; }
    }
    const D = w.decals, F = w.smoke?.fluid, r = F?.region, S = w.smoke;
    return {
      bodies: bodies.length, dynamic, static: statics, sleeping, contacts: w.physics.activePairs().length,
      chars: w.chars.length, alive: w.chars.filter((c) => c.alive).length, civilians: w.civilians.length,
      props: w.props.length, vehicles: w.props.filter((p) => p.isVehicle).length, pursuers: w.pursuit?.cars?.length ?? 0,
      particles: w.particles.list.length, debris: w.debris.length, corpses: w.corpses.length, items: w.items.length,
      projectiles: w.projectiles.length,
      stains: D?.ageing ? D.ageing.reduce((n, q, i) => n + q.length - (D.heads[i] || 0), 0) : 0,
      lights: w.lighting?.lights?.length ?? 0, lit: w.lighting?.lit?.length ?? 0, flashes: w.lights.length,
      fires: w.fires?.lit?.()?.length ?? 0,
      smokeCells: r ? (r.x1 - r.x0) * (r.y1 - r.y0) : 0,
      smokeIdle: !!S && S.quietT > 4 && F.peak < 0.002 && !S.rib?.n,
      voices: this.#src.voices(), musicVoices: this.#src.music(),
    };
  }
}
