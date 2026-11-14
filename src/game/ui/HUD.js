import { PALETTE, TILE, AI, PLAYER } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { text, neon, thousands } from './Text.js';
import { drawIndicators } from './Indicators.js';
import { clamp } from '../../engine/math.js';

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function drawHUD(ctx, game, t) {
  const w = game.world, p = w.player;
  const W = game.canvas.width, H = game.canvas.height;
  const s = H / 720;
  const pad = 26 * s;

  // weapon + ammo
  const def = WEAPONS[p.weapon ? p.weapon.type : 'fists'];
  text(ctx, def.name, pad, pad + 14 * s, 30 * s, neon(t, 1.5), { align: 'left', rot: Math.sin(t * 2) * 0.03 });
  const ammo = p.ammoText;
  if (ammo) {
    // a melee weapon shows the kills left in it, in the warning colour on its last one
    const gun = def.kind === 'gun';
    const dry = gun && p.weapon.mag <= 0 && p.reloading <= 0;
    const noReserve = p.reserveCount() <= 0;
    let label = ammo, col = PALETTE.white;
    if (!gun) col = p.weapon.wear <= 1 ? PALETTE.pink : PALETTE.white;
    else if (p.reloading > 0) { label = 'RELOADING'; col = PALETTE.cyan; }
    else if (dry && noReserve) { label = 'EMPTY - THROW IT!'; col = PALETTE.pink; }
    else if (dry) { label = 'RELOAD [R]'; col = PALETTE.yellow; }
    const blink = dry && Math.floor(t * 6) % 2 === 0 ? 0.45 : 1;
    text(ctx, label, pad, pad + 50 * s, 20 * s, col, { align: 'left', alpha: blink });
    if (p.reloading > 0) {
      const k = clamp(1 - p.reloading / p.reloadDur, 0, 1);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(pad, pad + 64 * s, 150 * s, 6 * s);
      ctx.fillStyle = PALETTE.cyan;
      ctx.fillRect(pad, pad + 64 * s, 150 * s * k, 6 * s);
    }
  }
  text(ctx, `TARGETS ${w.enemiesLeft}/${w.totalEnemies}`, pad, pad + 84 * s, 14 * s, PALETTE.yellow, { align: 'left' });
  // stamina: only while it is coming back; pink = not enough for a slide, blinking when one was just refused
  if (p.stamina < 1) {
    const y = pad + 96 * s, bw = 150 * s, short = p.stamina < PLAYER.slide.cost;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(pad, y, bw, 5 * s);
    ctx.globalAlpha = p.winded > 0 && Math.floor(t * 14) % 2 ? 0.35 : 1;
    ctx.fillStyle = short ? PALETTE.pink : PALETTE.yellow;
    ctx.fillRect(pad, y, bw * p.stamina, 5 * s);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(pad + bw * PLAYER.slide.cost - s, y, 2 * s, 5 * s); // what one slide takes
  }

  drawScore(ctx, w, W - pad, pad, s);
  if (p.alive && game.state === 'play' && !game.overview) drawIndicators(ctx, game, t);

  if (!w.cleared) drawAlertPhase(ctx, w.director, W, s, t);

  // context hints
  let hint = '';
  if (p.alive) {
    if (p.contextAction && (p.contextAction !== 'VAULT' || !p.nearItem)) hint = `SPACE : ${p.contextAction}`;
    else if (p.nearTrunk) hint = 'E : OPEN TRUNK';
    else if (p.nearItem) hint = `${p.armed ? 'E : SWAP FOR' : 'RMB / E : PICK UP'} ${p.nearItem.def.name}`;
  }
  if (hint) text(ctx, hint, W / 2, H - 50 * s, 16 * s, PALETTE.white, { alpha: 0.75 + Math.sin(t * 8) * 0.25 });

  // level cleared
  // levels without an exit (the lab) have nothing to point at
  if (w.cleared && !w.exited && game.state === 'play' && w.level.exit) {
    const ct = game.clearedT;
    if (ct < 2.4) {
      const sc = 1 + Math.max(0, 0.4 - ct) * 2;
      text(ctx, 'LEVEL CLEARED', W / 2, H * 0.3, 54 * s * sc, neon(t, 8), { rot: Math.sin(t * 3) * 0.04 });
    } else {
      text(ctx, 'GET BACK TO THE CAR', W / 2, 52 * s, 22 * s, PALETTE.yellow, { alpha: 0.7 + Math.sin(t * 6) * 0.3 });
    }
    drawExitArrow(ctx, game, t, s);
  }
}

// Top right corner, kept small: score, run time, and the chain multiplier with the time left to keep it going.
function drawScore(ctx, w, x, y, s) {
  const sc = w.scoring;
  const pop = Math.max(0, 0.25 - (w.time - sc.lastT)); // swells for a moment when points come in
  text(ctx, thousands(sc.score), x, y + 10 * s, 22 * s * (1 + pop * 0.6), PALETTE.white, { align: 'right' });
  text(ctx, clock(w.runTime), x, y + 32 * s, 11 * s, PALETTE.white, { align: 'right', alpha: 0.5 });
  if (sc.combo < 1) return;
  const left = sc.comboLeft, bw = 84 * s, by = y + 60 * s;
  // the first kill of a chain only lights the fuse; the multiplier shows once it is worth something
  if (sc.combo > 1) text(ctx, `x${sc.multiplier.toFixed(1)}`, x, y + 49 * s, 15 * s, PALETTE.pink, { align: 'right' });
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(x - bw, by, bw, 3 * s);
  ctx.fillStyle = left < 0.3 ? PALETTE.yellow : PALETTE.pink;
  ctx.fillRect(x - bw * left, by, bw * left, 3 * s);
  ctx.globalAlpha = 1;
}

const PHASES = { caution: ['CAUTION', PALETTE.yellow], alert: ['ALERT', PALETTE.pink], evasion: ['EVASION', PALETTE.orange] };

// small squad alert label at the top centre, with the time left before the guards calm down
function drawAlertPhase(ctx, dir, W, s, t) {
  const ph = PHASES[dir.phase];
  if (!ph) return;
  const [label, color] = ph;
  const alert = dir.phase === 'alert';
  text(ctx, label, W / 2, 26 * s, 13 * s, color, { alpha: alert ? 0.7 + Math.sin(t * 9) * 0.3 : 0.8 });
  if (alert) return;
  const k = clamp(dir.phaseT / (dir.phase === 'caution' ? AI.caution : AI.evasion), 0, 1);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(W / 2 - 46 * s, 37 * s, 92 * s, 3 * s);
  ctx.fillStyle = color;
  ctx.fillRect(W / 2 - 46 * s, 37 * s, 92 * s * k, 3 * s);
}

function drawExitArrow(ctx, game, t, s) {
  const ex = game.world.level.exit;
  const sp = game.camera.worldToScreen(ex.x * TILE, ex.y * TILE);
  const W = game.canvas.width, H = game.canvas.height, m = 60 * s;
  if (sp.x > m && sp.x < W - m && sp.y > m && sp.y < H - m) return;
  const cx = W / 2, cy = H / 2;
  const a = Math.atan2(sp.y - cy, sp.x - cx);
  const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
  const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const z = s * (1 + Math.sin(t * 8) * 0.15);
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath(); ctx.moveTo(24 * z, 3 * z); ctx.lineTo(-12 * z, -15 * z); ctx.lineTo(-4 * z, 3 * z); ctx.lineTo(-12 * z, 21 * z); ctx.fill();
  ctx.fillStyle = PALETTE.yellow;
  ctx.beginPath(); ctx.moveTo(22 * z, 0); ctx.lineTo(-14 * z, -18 * z); ctx.lineTo(-6 * z, 0); ctx.lineTo(-14 * z, 18 * z); ctx.fill();
  ctx.restore();
}
