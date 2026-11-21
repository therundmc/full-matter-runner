// The developer's perf overlay (F8, systems/Perf.js): COMPACT, a few lines in the top right corner; FULL, two
// columns (the frame and the CPU's sections with the frame-time graph; the card, the memory, the world, the
// quality). Drawn last, over the lens (on the HUD's canvas), in the game's pixel font on a dark backing. The section
// that spent the most of the last frame is red.
import { SECTIONS, PARENTS } from '../systems/Perf.js';
import { PALETTE } from '../Config.js';
import { pixelFont } from './Text.js';

const INK = 'rgba(8, 4, 14, 0.82)', BONE = '#e8e0d0', DIM = '#8a8494', HEAD = PALETTE.cyan, HOT = '#ff2a3a';
const OK = '#3cff7a', WARN = '#ffd23c';
const FPS60 = 1000 / 60, FPS30 = 1000 / 30;

const f1 = (v) => (v == null || !Number.isFinite(v) ? '-' : v.toFixed(1));
const f2 = (v) => (v == null || !Number.isFinite(v) ? '-' : v.toFixed(2));
const n0 = (v) => (v == null || !Number.isFinite(v) ? '-' : String(Math.round(v)));
const r = (s, n) => String(s).padStart(n);
const l = (s, n) => String(s).padEnd(n);
const up = (s) => String(s ?? '-').toUpperCase().replace(/[^\x20-\x7e]/g, '?');
const refresh = (F) => (F.refreshSure ? `${F.refreshHz} HZ` : `? (${F.refreshHz} FPS)`);
const label = (id) => (id?.endsWith('.other') ? `${SECTIONS.find((s) => s.id === id.slice(0, -6))?.label} OTHER` : SECTIONS.find((s) => s.id === id)?.label ?? '-');
// a section's depth (UPDATE 0, SIMULATION 1, PHYSICS 2)
const depth = (s) => { let d = 0; for (let p = s; p?.in; p = SECTIONS.find((q) => q.id === p.in)) d++; return d; };

// a row: text, colour
const row = (t, c = BONE) => ({ t, c });
const head = (t) => row(`-- ${t} --`, HEAD);

function frameRows(s) {
  const F = s.frame;
  return [
    head('FRAME'),
    row(`FPS ${r(F.fps, 3)}  AVG ${f1(F.ms)} MS  MIN ${f1(F.min)}`, F.ms > FPS30 ? HOT : F.ms > FPS60 * 1.05 ? WARN : OK),
    row(`P95 ${f1(F.p95)} MS  WORST ${f1(F.worst)} MS (2 S)`),
    row(`IN JS ${f1(F.js)} MS  OUTSIDE (BROWSER, CARD) ${f1(F.outside)} MS`),
    row(`DISPLAY ${refresh(F)}  STEPS ${F.steps.last}/FRAME (MEAN ${f2(F.steps.mean)} MAX ${F.steps.max})`),
    row(`TIME SCALE x${f2(F.timeScale)}${F.hitstop > 0 ? `  HIT-STOP ${f2(F.hitstop)} S` : ''}`),
  ];
}

function cpuRows(s, top) {
  const C = s.cpu, out = [head('CPU MS / FRAME'), row(`${l('', 17)}${r('MEAN', 7)}${r('P95', 7)}${r('MAX', 7)}`, DIM)];
  if (!C.profiling) return [...out, row('PROFILER OFF', DIM)];
  const line = (id, name, d) => {
    const v = C.sections[id];
    out.push(row(`${l(' '.repeat(d) + name, 17)}${r(f2(v.mean), 7)}${r(f2(v.p95), 7)}${r(f2(v.max), 7)}`, id === top ? HOT : d ? BONE : HEAD));
  };
  const walk = (sec) => {
    const d = depth(sec);
    line(sec.id, sec.label, d);
    const kids = SECTIONS.filter((k) => k.in === sec.id);
    for (const k of kids) walk(k);
    if (PARENTS.includes(sec.id)) line(`${sec.id}.other`, 'OTHER', d + 1);
  };
  for (const sec of SECTIONS.filter((k) => !k.in)) walk(sec);
  return out;
}

function gpuRows(s) {
  const G = s.gpu, U = G.uploads;
  return [
    head('GPU'),
    row(up(G.renderer).slice(0, 44), DIM),
    row(up(G.vendor).slice(0, 44), DIM),
    row(`SCENE ${G.scene?.join('x') ?? '-'}  LENS ${G.lens?.join('x') ?? 'OFF'}`),
    row(`DPR ${f2(G.dpr)}  ZOOM ${G.zoom} (x${f2(G.z)})  VIEW ${n0(G.view)} PX`),
    row(`LENS ON CARD ${G.lensMs == null ? 'N/A' : `${f2(G.lensMs)} MS`}${G.timer ? '' : ' (NO TIMER)'}`),
    row(`UPLOADS GL ${f1(U.gl.n)}/F ${f1(U.gl.bytes / 1048576)} MB  2D ${f1(U.put.n)}/F ${f1(U.put.bytes / 1048576)} MB`),
  ];
}

function memoryRows(s, full) {
  const M = s.memory, H = M.heap, out = [head('MEMORY MB')];
  out.push(row(H ? `JS HEAP ${n0(H.used)} / ${n0(H.total)}  LIMIT ${n0(H.limit)}` : 'JS HEAP N/A'));
  if (!full || !M.owners) return out;
  out.push(row(`${l('ESTIMATE', 18)}${r('ARRAYS', 8)}${r('CANVAS', 8)}`, DIM));
  for (const o of M.owners) {
    if (o.arr + o.cvs < 0.05) continue;
    out.push(row(`${l(up(o.name), 18)}${r(f1(o.arr), 8)}${r(f1(o.cvs), 8)}`));
  }
  out.push(row(`${l('TOTAL', 18)}${r(f1(M.arr), 8)}${r(f1(M.cvs), 8)}`, HEAD));
  return out;
}

function worldRows(s) {
  const w = s.world;
  if (!w) return [head('WORLD'), row('NO WORLD', DIM)];
  return [
    head('WORLD'),
    row(`BODIES ${w.bodies} (DYN ${w.dynamic} ASLEEP ${w.sleeping} STATIC ${w.static})`),
    row(`CONTACTS ${w.contacts}  CHARS ${w.alive}/${w.chars}  CIVILIANS ${w.civilians}`),
    row(`PROPS ${w.props}  CARS ${w.vehicles}  PURSUERS ${w.pursuers}  ITEMS ${w.items}`),
    row(`PARTICLES ${w.particles}  ROUNDS ${w.projectiles}  DEBRIS ${w.debris}`),
    row(`CORPSES ${w.corpses}  STAINS AGEING ${w.stains}`),
    row(`LIGHTS ${w.lights}  IN VIEW ${w.lit}  FLASHES ${w.flashes}  FIRES ${w.fires}`),
    row(`SMOKE CELLS ${w.smokeCells}${w.smokeIdle ? ' (IDLE)' : ' (STEPPED)'}  VOICES ${w.voices}  MUSIC ${w.musicVoices}`),
  ];
}

const qualityRow = (s) => row(`QUALITY ${up(s.quality.setting)}${s.quality.setting === 'auto' ? ` (${up(s.quality.level)})` : ''}  LENS ${s.quality.lens ? 'ON' : 'OFF'}`);

// a panel of rows, its bottom right corner at (x, y), u: px a unit; extraH: px under the rows; returns its box
function panel(ctx, rows, x, y, u, fs, extraH = 0) {
  const lh = Math.round(fs * 1.3), pad = Math.round(4 * u);
  let w = 0;
  for (const q of rows) w = Math.max(w, ctx.measureText(q.t).width);
  const bw = Math.ceil(w) + pad * 2, bh = rows.length * lh + pad * 2 + extraH, x0 = x - bw;
  y -= bh;
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y, bw, bh);
  rows.forEach((q, i) => { ctx.fillStyle = q.c; ctx.fillText(q.t, x0 + pad, y + pad + i * lh); });
  return { x: x0, y, w: bw, h: bh, pad, bottom: y + pad + rows.length * lh };
}

// the last frames' lengths as bars, a line at 16.7 ms and one at 33.3 ms
function graph(ctx, ms, x, y, w, h, u) {
  const top = 50, n = Math.min(ms.length, 240), bw = w / 240;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < n; i++) {
    const v = ms[ms.length - n + i], bh = Math.max(1, Math.min(1, v / top) * h);
    ctx.fillStyle = v > FPS30 ? HOT : v > FPS60 * 1.05 ? WARN : OK;
    ctx.fillRect(x + (240 - n + i) * bw, y + h - bh, Math.max(1, bw), bh);
  }
  const t = Math.max(1, Math.round(u));
  for (const [v, c] of [[FPS60, BONE], [FPS30, HOT]]) {
    ctx.fillStyle = c;
    ctx.fillRect(x, Math.round(y + h - (v / top) * h), w, t);
  }
}

// mode: 'compact' | 'full'; view: Perf.view()
export function drawPerf(ctx, W, H, mode, view) {
  const s = view.snap;
  if (!s) return;
  const u = H / 720, fs = Math.max(8, Math.round(8 * u)), m = Math.round(8 * u);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = pixelFont(fs);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const top = view.top, F = s.frame, C = s.cpu.sections;
  if (mode === 'compact') {
    const H2 = s.memory.heap, mean = (id) => f1(C[id]?.mean);
    const rows = [
      row(`FPS ${F.fps}  ${f1(F.ms)} MS  P95 ${f1(F.p95)}  WORST ${f1(F.worst)}  DISPLAY ${refresh(F)}`, F.ms > FPS30 ? HOT : F.ms > FPS60 * 1.05 ? WARN : OK),
      row(`STEPS ${F.steps.last}/F (MAX ${F.steps.max})  TIME x${f2(F.timeScale)}  ${up(s.quality.level)}${s.quality.lens ? '' : ' NO LENS'}`),
      row(`CPU UPDATE ${mean('update')}  SIM ${mean('sim')}  RENDER ${mean('render')}  LENS ${mean('lens')}`),
      row(`OUTSIDE JS ${f1(F.outside)}  GPU LENS ${s.gpu.lensMs == null ? 'N/A' : f2(s.gpu.lensMs)}  HEAP ${H2 ? `${n0(H2.used)}/${n0(H2.total)} MB` : 'N/A'}`),
      row(`TOP ${label(top.id)} ${f2(top.ms)} MS`, HOT),
    ];
    panel(ctx, rows, W - m, H - m, u, fs);
  } else {
    const left = [...frameRows(s), ...cpuRows(s, top.id)], gh = Math.round(48 * u), gap = Math.round(4 * u);
    const right = [...gpuRows(s), ...memoryRows(s, true), ...worldRows(s), qualityRow(s)];
    const b = panel(ctx, right, W - m, H - m, u, fs);
    const a = panel(ctx, left, b.x - m, H - m, u, fs, gh + gap);
    graph(ctx, view.graph, a.x + a.pad, a.bottom + gap, a.w - a.pad * 2, gh, u);
  }
  ctx.restore();
}
