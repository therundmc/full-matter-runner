import { PALETTE, TILE, AI, PLAYER } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { text, neon, thousands, tone, glitchText } from './Text.js';
import { tierColor } from './KillFeed.js';
import { KILLFEED } from '../data/feel.js';
import { drawIndicators } from './Indicators.js';
import { drawPrompts } from './Glyphs.js';
import { clamp } from '../../engine/math.js';

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function drawHUD(ctx, game, t) {
  const w = game.world, p = w.player;
  const W = game.canvas.width, H = game.canvas.height;
  const s = H / 720;
  const pad = 26 * s;

  // down a trapdoor (systems/Passage.js): the picture goes dark while he is under the street
  const dark = p.passage?.dark ?? 0;
  if (dark > 0) {
    ctx.fillStyle = `rgba(4, 2, 8, ${dark})`;
    ctx.fillRect(0, 0, W, H);
  }

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
  // guards left: a small head-and-shoulders mark and the count, right under the weapon (or its ammo line)
  const gy = pad + (ammo ? (p.reloading > 0 ? 82 : 70) : 42) * s, u = 2 * s;
  ctx.fillStyle = PALETTE.yellow;
  ctx.fillRect(pad + u, gy - 5 * u, 3 * u, 3 * u);  // head
  ctx.fillRect(pad, gy - 1.5 * u, 5 * u, 2.5 * u);  // shoulders
  text(ctx, `${w.enemiesLeft}/${w.totalEnemies}`, pad + 8 * u, gy - 2 * u, 14 * s, PALETTE.yellow, { align: 'left' });
  // stamina: only while it is coming back; pink = not enough for a slide, blinking when one was just refused
  if (p.stamina < 1) {
    const y = gy + 6 * s, bw = 150 * s, short = p.stamina < PLAYER.slide.cost;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(pad, y, bw, 5 * s);
    ctx.globalAlpha = p.winded > 0 && Math.floor(t * 14) % 2 ? 0.35 : 1;
    ctx.fillStyle = short ? PALETTE.pink : PALETTE.yellow;
    ctx.fillRect(pad, y, bw * p.stamina, 5 * s);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(pad + bw * PLAYER.slide.cost - s, y, 2 * s, 5 * s); // what one slide takes
  }

  drawScore(ctx, w, W - pad, pad, s, t);
  drawBanner(ctx, w.killFeed, W, H, s, t);
  if (p.alive && game.state === 'play' && !game.overview) drawIndicators(ctx, game, t);

  if (!w.cleared) drawAlertPhase(ctx, w.director, W, s, t);

  // context hints: the cap of the device in use (ui/Glyphs.js), then what it does
  let hint = null;
  if (p.alive) {
    if (p.contextAction && (p.contextAction !== 'VAULT' || !p.nearItem)) hint = [p.nearTakedown ? 'attack' : 'action', p.contextAction];
    else if (p.nearTrunk) hint = ['use', 'OPEN TRUNK'];
    else if (p.nearUse) hint = ['use', w.uses.label(p.nearUse)];
    else if (p.nearItem) hint = ['use', `${p.armed ? 'SWAP FOR' : 'PICK UP'} ${p.nearItem.def.name}`];
  }
  if (hint) drawPrompts(ctx, [hint], W / 2, H - 50 * s, 24 * s, game.input.device, { alpha: 0.8 + Math.sin(t * 8) * 0.2, font: 0.66 });

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

// Top right corner: score and run time, kept small, then the chain under them.
function drawScore(ctx, w, x, y, s, t) {
  const sc = w.scoring;
  const pop = Math.max(0, 0.25 - (w.time - sc.lastT)); // swells for a moment when points come in
  text(ctx, thousands(sc.score), x, y + 10 * s, 22 * s * (1 + pop * 0.6), PALETTE.white, { align: 'right' });
  text(ctx, clock(w.runTime), x, y + 32 * s, 11 * s, PALETTE.white, { align: 'right', alpha: 0.5 });
  drawChain(ctx, w.killFeed, sc, x, y + 44 * s, s, t);
}

// Under the score (ui/KillFeed.js, KILLFEED in data/feel.js), right-aligned on x from y down, in the right margin
// (at 720 p within about 200 x 150 px): the chain count from its 2nd kill, or the cash-out of the chain that just ran
// out; the fuse draining over the chain's window (from its 1st kill); the labels of the last kills.
function drawChain(ctx, feed, sc, x, y, s, t) {
  const K = KILLFEED, pv = feed.panelView(), cv = feed.cashView();
  let top = y;
  if (cv) {
    drawCash(ctx, cv, x, top + K.panel.h * s / 2, s);
    top += K.panel.h * s;
  } else if (pv) {
    drawCount(ctx, pv, x, top + K.panel.h * s * pv.open / 2, s, t);
    top += K.panel.h * s * pv.open;
  }
  if (sc.combo >= 1) {
    const F = K.fuse, left = sc.comboLeft, bw = F.w * s, bh = F.h * s, by = top + 4 * s;
    const low = left < F.low, blink = low && Math.floor(t * F.blink * 2) % 2 === 0;
    const tier = pv?.tier ?? 0;
    ctx.fillStyle = PALETTE.ink;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x - bw - s, by - s, bw + 2 * s, bh + 2 * s);
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.fillStyle = left < F.low / 2 ? F.red : low ? PALETTE.yellow : tone(tierColor(tier), t);
    ctx.fillRect(x - bw * left, by, bw * left, bh);
    // a knock-down won some time back: the bar flashes white
    const r = feed.refill();
    if (r > 0) {
      ctx.globalAlpha = r;
      ctx.fillStyle = PALETTE.white;
      ctx.fillRect(x - bw * left, by - s, bw * left, bh + 2 * s);
    }
    ctx.globalAlpha = 1;
    top = by + bh + 8 * s;
  }
  const L = K.feed;
  feed.lineViews().forEach((l, i) => {
    text(ctx, l.str, x + l.x * s, top + (i + 0.5) * L.line * s, L.size * s, tone(l.color, t), { align: 'right', alpha: l.alpha });
  });
}

// the chain count: big digits, KILLS and the multiplier in a column at their right; it slams on each kill
function drawCount(ctx, v, x, cy, s, t) {
  const P = KILLFEED.panel, col = tone(tierColor(v.tier), t), j = v.jolt * s;
  const jx = j * Math.sin(t * 90), jy = j * Math.cos(t * 77);
  ctx.save();
  ctx.translate(Math.round(x + jx), Math.round(cy + jy));
  ctx.scale(1, v.open);
  const mult = `x${v.multiplier.toFixed(1)}`, lw = Math.max(widthAt(ctx, 'KILLS', P.label * s), widthAt(ctx, mult, P.label * 1.4 * s));
  text(ctx, 'KILLS', 0, -9 * s, P.label * s, col, { align: 'right' });
  text(ctx, mult, 0, 8 * s, P.label * 1.4 * s, col, { align: 'right' });
  const dx = -lw - P.gap * s, size = P.size * s * (1 + v.punch), str = String(v.chain);
  text(ctx, str, dx, 0, size, v.flash ? PALETTE.white : col, { align: 'right', shadow: PALETTE.ink });
  // a white ghost of the digits swelling off them as they land
  const g = v.punch / P.punch;
  if (g > 0) text(ctx, str, dx, 0, size * (1 + (1 - g) * 0.5), PALETTE.white, { align: 'right', shadow: null, outline: false, alpha: 0.5 * g });
  ctx.restore();
}

function widthAt(ctx, str, size) {
  ctx.font = `${Math.round(size)}px joystix, monospace`;
  return ctx.measureText(str).width;
}

// a chain of 2+ that just ran out: CHAIN x6 over the points it made, slammed in where the count was
function drawCash(ctx, v, x, cy, s) {
  const C = KILLFEED.cash, k = v.scale, pts = `+${thousands(v.points)}`;
  ctx.save();
  ctx.globalAlpha *= v.alpha;
  text(ctx, `CHAIN x${v.kills}`, x, cy - 12 * s, C.size * s * k, PALETTE.white, { align: 'right' });
  text(ctx, pts, x, cy + 8 * s, C.big * s * k, PALETTE.yellow, { align: 'right' });
  if (v.ghost > 0) text(ctx, pts, x, cy + 8 * s, C.big * s * (1 + (1 - v.ghost) * 0.5), PALETTE.white, { align: 'right', shadow: null, outline: false, alpha: 0.5 * v.ghost });
  ctx.restore();
}

// DOUBLE KILL / TRIPLE KILL / MASSACRE, centred high, stamped like the death screen's title (smaller, gone at once)
function drawBanner(ctx, feed, W, H, s, t) {
  const v = feed.bannerView();
  if (!v) return;
  const B = KILLFEED.banner, size = v.size * s * v.scale, j = v.jolt * s, rot = -0.035;
  const x = W / 2 + j * Math.sin(t * 90), y = H * B.y + j * Math.cos(t * 77);
  ctx.save();
  ctx.globalAlpha *= v.alpha;
  // on a hard black shadow, a white ghost of it where it hit
  text(ctx, v.label, x + size * 0.09, y + size * 0.1, size, '#000', { shadow: null, rot });
  if (v.ghost > 0) text(ctx, v.label, W / 2, H * B.y, v.size * s * (1 + (1 - v.ghost) * 0.6), PALETTE.white, { shadow: null, outline: false, rot, alpha: 0.5 * v.ghost });
  glitchText(ctx, v.label, x, y, size, t, { rot, color: tone(v.color, t) });
  ctx.restore();
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
