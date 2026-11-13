import { PALETTE, COMBO_WINDOW, TILE } from '../core/Config.js';
import { WEAPONS } from '../data/weapons.js';
import { text, neon } from './Text.js';
import { clamp } from '../core/math.js';

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
    const empty = p.weapon.ammo <= 0;
    text(ctx, empty ? 'EMPTY - THROW IT!' : ammo, pad, pad + 50 * s, 20 * s, empty ? PALETTE.pink : PALETTE.white, { align: 'left' });
  }
  text(ctx, `TARGETS ${w.enemiesLeft}/${w.totalEnemies}`, pad, pad + 80 * s, 14 * s, PALETTE.yellow, { align: 'left' });

  // score + combo
  text(ctx, `${w.score} PTS`, W - pad, pad + 14 * s, 30 * s, PALETTE.white, { align: 'right', rot: Math.sin(t * 2.2 + 1) * 0.03 });
  if (w.combo > 1) {
    const k = clamp(1 - (w.time - w.lastKill) / COMBO_WINDOW, 0, 1);
    const pulse = 1 + Math.max(0, 0.3 - (w.time - w.lastKill)) * 1.5;
    text(ctx, `${w.combo}X COMBO`, W - pad, pad + 52 * s, 24 * s * pulse, PALETTE.pink, { align: 'right', rot: -0.05 });
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(W - pad - 160 * s, pad + 70 * s, 160 * s, 7 * s);
    ctx.fillStyle = neon(t, 6);
    ctx.fillRect(W - pad - 160 * s, pad + 70 * s, 160 * s * k, 7 * s);
  }

  // context hints
  let hint = '';
  if (p.alive) {
    if (p.nearDowned) hint = 'SPACE : EXECUTE';
    else if (p.nearItem) hint = `${p.armed ? 'E : SWAP FOR' : 'RMB / E : PICK UP'} ${p.nearItem.def.name}`;
  }
  if (hint) text(ctx, hint, W / 2, H - 50 * s, 16 * s, PALETTE.white, { alpha: 0.75 + Math.sin(t * 8) * 0.25 });

  // level cleared
  if (w.cleared && !w.exited && game.state === 'play') {
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
