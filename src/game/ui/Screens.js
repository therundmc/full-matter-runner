import { PALETTE } from '../Config.js';
import { text, neon, glitchText, thousands } from './Text.js';
import { clamp } from '../../engine/math.js';
import { OUTRO, fadeAlpha, barsK } from '../systems/Outro.js';

const TAUNTS = [
  'ONE BULLET. THAT IS ALL IT TAKES.',
  'TOO SLOW.',
  'THEY HEARD YOU COMING.',
  'TRY THE DOOR NEXT TIME.',
  'THROW SOMETHING AT THEM.',
  'DID YOU THINK THEY WOULD MISS?',
  'PRESS R. AGAIN. AND AGAIN.',
];
// deaths that deserve their own line, by cause (Character.kill)
const CAUSE_TAUNTS = {
  vehicle: ['LOOK BOTH WAYS.', 'THE STREET DOES NOT STOP FOR YOU.', 'ROADKILL.'],
  explosion: ['TOO CLOSE TO THE BLAST.', 'MIND WHAT YOU SHOOT AT.'],
  melee: ['NEVER LET THEM GET CLOSE.', 'TOO SLOW. TOO CLOSE.'],
  slash: ['NEVER LET THEM GET CLOSE.', 'A BLADE IS QUIET. SO WERE YOU.'],
};

// ---------- synthwave backdrop for the title ----------
export function drawTitle(ctx, W, H, t) {
  const s = H / 720;
  const horizon = H * 0.58;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#0b0418');
  sky.addColorStop(0.55, '#2a0a45');
  sky.addColorStop(1, '#b0186a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  // stars
  for (let i = 0; i < 80; i++) {
    const x = (i * 9301 + 49297) % 233280 / 233280 * W;
    const y = (i * 4021 + 7919) % 1000 / 1000 * horizon * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + i))})`;
    ctx.fillRect(x, y, 2 * s, 2 * s);
  }
  // striped sun
  const sr = 150 * s, sx = W / 2, sy = horizon - 30 * s;
  const sun = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
  sun.addColorStop(0, '#ffe46b');
  sun.addColorStop(0.5, '#ff7a3d');
  sun.addColorStop(1, '#ff2a6d');
  ctx.save();
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = sun;
  ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  ctx.fillStyle = '#2a0a45';
  for (let i = 0; i < 7; i++) {
    const yy = sy + i * 16 * s - ((t * 12 * s) % (16 * s));
    ctx.fillRect(sx - sr, yy, sr * 2, (2 + i * 1.3) * s);
  }
  ctx.restore();
  // mountains
  ctx.fillStyle = '#16052a';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= W; x += 40 * s) ctx.lineTo(x, horizon - (Math.abs(Math.sin(x * 0.004 + 1)) * 70 + Math.abs(Math.sin(x * 0.013)) * 30) * s);
  ctx.lineTo(W, horizon);
  ctx.fill();
  // floor grid
  ctx.fillStyle = '#0d0318';
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.strokeStyle = PALETTE.pink;
  ctx.lineWidth = 2 * s;
  ctx.shadowColor = PALETTE.pink;
  ctx.shadowBlur = 10 * s;
  const off = (t * 0.6) % 1;
  for (let i = 0; i < 18; i++) {
    const z = (i + 1 - off) / 18;
    const y = horizon + (H - horizon) * Math.pow(z, 2.2);
    ctx.globalAlpha = z;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = -16; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 14 * s, horizon);
    ctx.lineTo(W / 2 + i * 170 * s, H);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  const bob = Math.sin(t * 2) * 6 * s;
  glitchText(ctx, 'FULL MATTER', W / 2, H * 0.2 + bob, 84 * s, t, { rot: Math.sin(t * 1.3) * 0.025, color: PALETTE.white });
  glitchText(ctx, 'RUNNER', W / 2, H * 0.33 + bob, 96 * s, t + 1, { rot: Math.sin(t * 1.3 + 1) * 0.025, color: PALETTE.yellow });
  if (Math.floor(t * 2.5) % 2 === 0) text(ctx, 'CLICK TO START', W / 2, H * 0.66, 30 * s, neon(t, 3));
  const lines = [
    'WASD / ZQSD  MOVE        MOUSE  AIM        SHIFT  LOOK FURTHER',
    'LMB  ATTACK        RMB  THROW / PICK UP        E  PICK UP / SWAP',
    'R  RELOAD        SPACE  EXECUTE A KNOCKED-OUT ENEMY        BACKSPACE  RESTART        M  MUSIC',
  ];
  lines.forEach((l, i) => text(ctx, l, W / 2, H * 0.78 + i * 26 * s, 13 * s, PALETTE.white, { alpha: 0.85 }));
  text(ctx, 'ONE HIT AND YOU ARE DEAD. SO ARE THEY.', W / 2, H * 0.94, 14 * s, PALETTE.pink);
}

export function drawLoading(ctx, W, H, p) {
  const s = H / 720;
  ctx.fillStyle = '#0b0612';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'LOADING', W / 2, H / 2 - 30 * s, 28 * s, PALETTE.pink);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(W / 2 - 200 * s, H / 2, 400 * s, 14 * s);
  ctx.fillStyle = PALETTE.cyan;
  ctx.fillRect(W / 2 - 200 * s, H / 2, 400 * s * p, 14 * s);
}

// best: the level's best result so far ({ total, grade }), if any
export function drawIntro(ctx, W, H, t, level, best) {
  const s = H / 720;
  const a = clamp(Math.min(t * 3, (2.6 - t) * 2.5), 0, 1);
  ctx.globalAlpha = a;
  const band = 186 * s;
  ctx.fillStyle = 'rgba(8,2,16,0.85)';
  ctx.fillRect(0, H / 2 - band / 2, W, band);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(0, H / 2 - band / 2, W, 3 * s);
  ctx.fillRect(0, H / 2 + band / 2 - 3 * s, W, 3 * s);
  ctx.globalAlpha = 1;
  const slide = (1 - clamp(t * 2.5, 0, 1)) * W * 0.3;
  text(ctx, 'LEVEL 1', W / 2 - slide, H / 2 - 38 * s, 18 * s, PALETTE.yellow, { alpha: a });
  glitchText(ctx, level.name, W / 2 + slide, H / 2 + 2 * s, 50 * s, t, { alpha: a });
  text(ctx, level.subtitle, W / 2, H / 2 + 42 * s, 13 * s, PALETTE.white, { alpha: a * 0.85 });
  if (level.objective) text(ctx, level.objective[0], W / 2, H / 2 + 68 * s, 16 * s, PALETTE.yellow, { alpha: a });
  if (best) text(ctx, `BEST ${thousands(best.total)}  ${best.grade}`, W / 2, H / 2 + 92 * s, 11 * s, PALETTE.cyan, { alpha: a * 0.8 });
}

export function drawDead(ctx, W, H, t, seed, cause) {
  const s = H / 720;
  const a = clamp(t * 1.5, 0, 1);
  ctx.fillStyle = `rgba(90,0,10,${0.35 * a})`;
  ctx.fillRect(0, 0, W, H);
  if (t < 0.35) return;
  const sc = 1 + Math.max(0, 0.6 - t) * 0.8;
  glitchText(ctx, "YOU'RE DEAD", W / 2, H * 0.4, 80 * s * sc, t, { rot: Math.sin(t * 2) * 0.04, color: PALETTE.pink });
  const lines = CAUSE_TAUNTS[cause] || TAUNTS;
  text(ctx, lines[seed % lines.length], W / 2, H * 0.52, 16 * s, PALETTE.white, { alpha: a });
  if (t > 0.6 && Math.floor(t * 2.5) % 2 === 0) text(ctx, 'PRESS R TO RESTART', W / 2, H * 0.62, 24 * s, PALETTE.yellow);
}

// the getaway (systems/Outro): the picture fades to black, letterbox bars slide in over it
export function drawOutro(ctx, W, H, t) {
  const fade = fadeAlpha(t), bar = Math.ceil(H * OUTRO.bars * barsK(t));
  ctx.fillStyle = '#000';
  if (fade > 0) {
    ctx.globalAlpha = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
}

// volume sliders of the pause screen: track rectangles in canvas pixels (shared by drawing and mouse input)
export function pauseSliders(W, H) {
  const s = H / 720, w = 260 * s, h = 8 * s;
  return [['master', 'MASTER'], ['music', 'MUSIC'], ['sfx', 'EFFECTS']]
    .map(([key, label], i) => ({ key, label, x: W / 2 - w / 2, y: H * 0.43 + i * 34 * s, w, h }));
}

export function drawPause(ctx, W, H, t, settings, selected) {
  const s = H / 720;
  ctx.fillStyle = 'rgba(8,2,16,0.7)';
  ctx.fillRect(0, 0, W, H);
  glitchText(ctx, 'PAUSED', W / 2, H * 0.27, 70 * s, t);
  pauseSliders(W, H).forEach((r, i) => {
    const v = settings[r.key], col = i === selected ? PALETTE.yellow : PALETTE.white, my = r.y + r.h / 2;
    text(ctx, r.label, r.x - 24 * s, my, 16 * s, col, { align: 'right' });
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = col;
    ctx.fillRect(r.x, r.y, r.w * v, r.h);
    ctx.fillRect(r.x + r.w * v - 4 * s, my - 11 * s, 8 * s, 22 * s);
    text(ctx, `${Math.round(v * 100)}%`, r.x + r.w + 24 * s, my, 16 * s, col, { align: 'left' });
  });
  ['ESC  RESUME', 'R  RESTART LEVEL', 'F1  SANDBOX', 'F2  SHOW ENEMY VISION', 'Q  QUIT TO TITLE']
    .forEach((l, i) => text(ctx, l, W / 2, H * 0.64 + i * 26 * s, 15 * s, i === 0 ? PALETTE.yellow : PALETTE.white));
}

const LINE_EVERY = 0.38, COUNT = 0.3; // s between two lines of the breakdown, s a figure takes to count up

// Level-clear breakdown. r: Scoring.tally() + { best: previous best | null, record, ranked }.
// `replay`: the replay is playing behind: the breakdown then stands in a column on the right, clear of the action.
export function drawResults(ctx, W, H, t, r, replay) {
  const s = H / 720, half = 222 * s, edge = half + 26 * s;
  const cx = replay ? W - edge - 36 * s : W / 2;
  if (!replay) {
    ctx.fillStyle = `rgba(8,2,16,${clamp(t * 2, 0, 0.85)})`;
    ctx.fillRect(0, 0, W, H);
  }
  const top = 44 * s, bottom = 676 * s;
  ctx.fillStyle = `rgba(8,2,16,${clamp(t * 3, 0, replay ? 0.82 : 0.4)})`;
  ctx.fillRect(cx - edge, top, edge * 2, bottom - top);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(cx - edge, top, edge * 2, 2 * s);
  ctx.fillRect(cx - edge, bottom - 2 * s, edge * 2, 2 * s);
  glitchText(ctx, 'LEVEL COMPLETE', cx, top + 46 * s, 32 * s, t, { color: PALETTE.white });

  // one line after the other, each figure counting up
  let y = top + 108 * s;
  r.lines.forEach((l, i) => {
    const k = clamp((t - 0.5 - i * LINE_EVERY) / COUNT, 0, 1);
    if (k > 0) {
      const a = Math.min(1, k * 3), neg = l.points < 0;
      text(ctx, l.label, cx - half, y, 17 * s, PALETTE.cyan, { align: 'left', alpha: a });
      text(ctx, l.detail, cx + 44 * s, y, 11 * s, PALETTE.white, { alpha: a * 0.7 });
      text(ctx, thousands(Math.round(l.points * k)), cx + half, y, 17 * s,
        neg ? PALETTE.pink : l.points ? PALETTE.white : '#8a7f96', { align: 'right', alpha: a });
    }
    y += 33 * s;
  });
  const tt = t - 0.5 - r.lines.length * LINE_EVERY;
  if (tt <= 0) return;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(cx - half, y - 10 * s, half * 2, s);
  y += 16 * s;
  const kt = 1 - (1 - clamp(tt / 0.7, 0, 1)) ** 3;
  text(ctx, 'TOTAL', cx - half, y, 24 * s, PALETTE.yellow, { align: 'left' });
  text(ctx, thousands(Math.round(r.total * kt)), cx + half, y, 24 * s, PALETTE.yellow, { align: 'right' });

  const gt = tt - 0.95;
  if (gt <= 0) return;
  const sc = 1 + Math.max(0, 0.3 - gt) * 4;
  text(ctx, 'GRADE', cx, y + 44 * s, 13 * s, PALETTE.white, { alpha: 0.8 });
  glitchText(ctx, r.grade, cx, y + 106 * s, 96 * s * sc, t, { color: r.grade === 'S' ? PALETTE.yellow : PALETTE.pink, rot: Math.sin(t * 3) * 0.05 });
  if (gt > 0.5) {
    const hint = r.next ? `${r.next.grade} FROM ${thousands(r.next.at)}` : 'TOP GRADE';
    text(ctx, hint, cx, y + 172 * s, 12 * s, PALETTE.white, { alpha: 0.6 });
    const by = y + 194 * s;
    if (!r.ranked) text(ctx, 'SANDBOX RUN - NOT RANKED', cx, by, 12 * s, PALETTE.cyan, { alpha: 0.8 });
    else if (r.record) text(ctx, r.best ? `NEW RECORD   WAS ${thousands(r.best.total)}` : 'NEW RECORD', cx, by, 13 * s, PALETTE.yellow, { alpha: 0.65 + 0.35 * Math.sin(t * 7) });
    else text(ctx, `BEST ${thousands(r.best.total)}  ${r.best.grade}`, cx, by, 12 * s, PALETTE.cyan, { alpha: 0.8 });
  }
  if (gt > 1 && Math.floor(t * 2.5) % 2 === 0) text(ctx, 'R  RETRY        CLICK  TITLE', cx, bottom - 26 * s, 13 * s, PALETTE.white);
}
