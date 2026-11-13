import { PALETTE } from '../Config.js';
import { text, neon, glitchText } from './Text.js';
import { clamp } from '../../engine/math.js';

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

export function drawIntro(ctx, W, H, t, level) {
  const s = H / 720;
  const a = clamp(Math.min(t * 3, (2.6 - t) * 2.5), 0, 1);
  ctx.globalAlpha = a;
  const band = 150 * s;
  ctx.fillStyle = 'rgba(8,2,16,0.85)';
  ctx.fillRect(0, H / 2 - band / 2, W, band);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(0, H / 2 - band / 2, W, 3 * s);
  ctx.fillRect(0, H / 2 + band / 2 - 3 * s, W, 3 * s);
  ctx.globalAlpha = 1;
  const slide = (1 - clamp(t * 2.5, 0, 1)) * W * 0.3;
  text(ctx, 'LEVEL 1', W / 2 - slide, H / 2 - 38 * s, 18 * s, PALETTE.yellow, { alpha: a });
  glitchText(ctx, level.name, W / 2 + slide, H / 2 + 2 * s, 50 * s, t, { alpha: a });
  text(ctx, level.subtitle, W / 2, H / 2 + 46 * s, 13 * s, PALETTE.white, { alpha: a * 0.85 });
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

export function drawPause(ctx, W, H, t) {
  const s = H / 720;
  ctx.fillStyle = 'rgba(8,2,16,0.7)';
  ctx.fillRect(0, 0, W, H);
  glitchText(ctx, 'PAUSED', W / 2, H * 0.35, 70 * s, t);
  ['ESC  RESUME', 'R  RESTART LEVEL', 'M  TOGGLE MUSIC', 'F1  SANDBOX', 'F2  SHOW ENEMY VISION', 'Q  QUIT TO TITLE']
    .forEach((l, i) => text(ctx, l, W / 2, H * 0.5 + i * 32 * s, 18 * s, i === 0 ? PALETTE.yellow : PALETTE.white));
}

export function drawResults(ctx, W, H, t, r) {
  const s = H / 720;
  ctx.fillStyle = `rgba(8,2,16,${clamp(t * 2, 0, 0.85)})`;
  ctx.fillRect(0, 0, W, H);
  glitchText(ctx, 'LEVEL COMPLETE', W / 2, H * 0.14, 54 * s, t, { color: PALETTE.white });
  const rows = [
    ['KILLS', `${r.kills}/${r.total}`],
    ['MAX COMBO', `${r.maxCombo}X`],
    ['TIME', r.timeStr],
    ['KILL POINTS', `${r.score}`],
    ['TIME BONUS', `${r.timeBonus}`],
    ['TOTAL', `${r.total2}`],
  ];
  rows.forEach(([k, v], i) => {
    const appear = clamp((t - 0.4 - i * 0.25) * 4, 0, 1);
    if (appear <= 0) return;
    const y = H * 0.28 + i * 46 * s;
    const col = i === rows.length - 1 ? PALETTE.yellow : PALETTE.white;
    text(ctx, k, W / 2 - 260 * s, y, 22 * s, PALETTE.cyan, { align: 'left', alpha: appear });
    text(ctx, v, W / 2 + 260 * s, y, 22 * s, col, { align: 'right', alpha: appear });
  });
  const gt = t - 0.4 - rows.length * 0.25;
  if (gt > 0) {
    const sc = 1 + Math.max(0, 0.3 - gt) * 4;
    text(ctx, 'GRADE', W / 2, H * 0.6 + 90 * s, 20 * s, PALETTE.white);
    glitchText(ctx, r.grade, W / 2, H * 0.6 + 160 * s, 110 * s * sc, t, { color: r.grade === 'S' ? PALETTE.yellow : PALETTE.pink, rot: Math.sin(t * 3) * 0.05 });
  }
  if (t > 3 && Math.floor(t * 2.5) % 2 === 0) text(ctx, 'R  REPLAY        CLICK  TITLE', W / 2, H * 0.95, 16 * s, PALETTE.white);
}
