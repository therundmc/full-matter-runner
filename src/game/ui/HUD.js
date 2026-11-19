import { PALETTE, TILE, AI, PLAYER } from '../Config.js';
import { edgeMarker } from '../systems/Threats.js';
import { WEAPONS } from '../data/weapons.js';
import { text, neon, thousands, tone, glitchText, clock, widthOf } from './Text.js';
import { tierColor } from './KillFeed.js';
import { KILLFEED, BREAK } from '../data/feel.js';
import { drawIndicators } from './Indicators.js';
import { drawPrompts } from './Glyphs.js';
import { clamp } from '../../engine/math.js';

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

  // weapon + ammo; the weapon that just gave out flashes BROKEN in its place (Character.breakWeapon, BREAK.hud)
  const def = WEAPONS[p.weapon ? p.weapon.type : 'fists'];
  const bk = p.brokeAt && w.time - p.brokeAt.t < BREAK.hud ? w.time - p.brokeAt.t : -1;
  if (bk >= 0) text(ctx, Math.floor(bk * 7) % 2 ? p.brokeAt.name : 'BROKEN', pad, pad + 14 * s, 30 * s, PALETTE.pink, { align: 'left', rot: -0.04 });
  // (nothing while the gun on the car's seat is still to be taken: systems/Drive.js grab)
  else if (!(w.drive?.grab && !w.drive.grab.took)) text(ctx, def.name, pad, pad + 14 * s, 30 * s, neon(t, 1.5), { align: 'left', rot: Math.sin(t * 2) * 0.03 });
  // (no count at the wheel: his gun never runs dry there, systems/CarGun.js)
  const ammo = w.drive?.on ? '' : p.ammoText, worn = def.wear && p.weapon ? drawWear(ctx, def.wear, p.weapon.wear, pad, pad + 38 * s, s) : false;
  if (ammo) {
    const dry = p.weapon.mag <= 0 && p.reloading <= 0;
    const noReserve = p.reserveCount() <= 0;
    let label = ammo, col = PALETTE.white;
    if (p.reloading > 0) { label = 'RELOADING'; col = PALETTE.cyan; }
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
  // guards left: a small head-and-shoulders mark and the count, right under the weapon (or its ammo line); none at
  // the wheel (the chase counts no guards)
  const gy = pad + (ammo ? (p.reloading > 0 ? 82 : 70) : worn ? 56 : 42) * s, u = 2 * s;
  if (!w.drive?.on) {
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillRect(pad + u, gy - 5 * u, 3 * u, 3 * u);  // head
    ctx.fillRect(pad, gy - 1.5 * u, 5 * u, 2.5 * u);  // shoulders
    text(ctx, `${w.enemiesLeft}/${w.totalEnemies}`, pad + 8 * u, gy - 2 * u, 14 * s, PALETTE.yellow, { align: 'left' });
  }
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
  if (w.drive?.on) {
    drawDrive(ctx, w.drive, pad, H - pad, s, t);
    drawRoad(ctx, w, W, pad, s);
    if (p.alive && game.state === 'play') { drawHunters(ctx, game, s, t); drawWarnings(ctx, game, s, t); }
  }
  if (p.alive && game.state === 'play' && !game.overview) drawIndicators(ctx, game, t);

  if (!w.cleared) drawAlertPhase(ctx, w.director, W, s, t);

  // context hints: the cap of the device in use (ui/Glyphs.js), then what it does
  let hint = null;
  if (p.alive && !p.hidden && !p.driving) { // (not in the getaway, nor at the wheel: systems/Drive.js)
    if (p.contextAction && (p.contextAction !== 'VAULT' || !p.nearItem)) hint = [p.nearTakedown || p.nearDowned ? 'attack' : 'action', p.contextAction];
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

// At the wheel (systems/Drive.js), bottom left: the shove's bar (SPACE; full and bright when it is ready, filling
// back after one) over the speed in km/h; (x, y) its bottom left corner
function drawDrive(ctx, d, x, y, s, t) {
  const ready = d.ready >= 1, bw = 120 * s, bh = 7 * s, by = y - 62 * s;
  text(ctx, 'SHOVE', x, by + bh / 2, 13 * s, ready ? PALETTE.white : PALETTE.pink, { align: 'left', alpha: 0.85 });
  const bx = x + 66 * s;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(bx - s, by - s, bw + 2 * s, bh + 2 * s);
  ctx.fillStyle = ready ? PALETTE.white : PALETTE.pink;
  ctx.globalAlpha = ready ? 0.85 + Math.sin(t * 6) * 0.15 : 0.7;
  ctx.fillRect(bx, by, bw * clamp(d.ready, 0, 1), bh);
  ctx.globalAlpha = 1;
  const v = String(d.kmh);
  text(ctx, v, x, y - 16 * s, 40 * s, PALETTE.white, { align: 'left' });
  text(ctx, 'KM/H', x + widthOf(ctx, v, 40 * s) + 14 * s, y - 12 * s, 14 * s, PALETTE.white, { align: 'left', alpha: 0.8 });
}

// At the wheel in the chase, top middle: how much road is left (level `chase`: from its start to its `end`), a line
// with his mark on it and the metres to go under it
function drawRoad(ctx, w, W, pad, s) {
  const c = w.level.chase;
  if (!c?.end) return;
  const x0 = c.van[0] * TILE, x1 = c.end * TILE, k = clamp((w.drive.van.x - x0) / (x1 - x0), 0, 1);
  const bw = 400 * s, bx = W / 2 - bw / 2, by = pad + 8 * s;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(bx - s, by - s, bw + 2 * s, 4 * s);
  ctx.fillStyle = PALETTE.white;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(bx, by, bw * k, 2 * s);
  ctx.globalAlpha = 0.3;
  ctx.fillRect(bx + bw * k, by, bw * (1 - k), 2 * s);
  ctx.globalAlpha = 1;
  const mx = bx + bw * k; // his mark: a small triangle pointing down at the line
  ctx.beginPath(); ctx.moveTo(mx - 6 * s, by - 10 * s); ctx.lineTo(mx + 6 * s, by - 10 * s); ctx.lineTo(mx, by - 2 * s); ctx.fill();
  const left = Math.max(0, Math.round((x1 - w.drive.van.x) / TILE));
  text(ctx, `${left} M`, W / 2, by + 16 * s, 12 * s, PALETTE.white, { alpha: 0.75 });
}

// Pursuers behind him or beside him off the picture: a small red chevron on the screen's edge toward each
function drawHunters(ctx, game, s, t) {
  const P = game.world.pursuit;
  if (!P) return;
  const W = game.canvas.width, H = game.canvas.height, cam = game.camera;
  for (const car of P.hunters()) {
    const sp = cam.worldToScreen(car.v.x, car.v.y), m = edgeMarker(sp.x, sp.y, W, H, 20 * s);
    if (!m) continue;
    const z = s * 1.4;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.beginPath();
    ctx.moveTo(-5 * z, -7 * z); ctx.lineTo(3 * z, 0); ctx.lineTo(-5 * z, 7 * z);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4.5 * z;
    ctx.stroke();
    ctx.strokeStyle = '#ff2a4a'; // the telegraphs' red (render/PursuitArt.js)
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 9);
    ctx.lineWidth = 2.2 * z;
    ctx.stroke();
    ctx.restore();
  }
}

// What is about to shut the road ahead, off the picture (a lorry backing out: systems/Lorries.js): three red
// chevrons on the screen's edge toward where its tail will be, beating with its beeper, and two bone ones toward the
// way round it
function drawWarnings(ctx, game, s, t) {
  const S = game.world.lorries;
  if (!S) return;
  const W = game.canvas.width, H = game.canvas.height, cam = game.camera;
  for (const T of S.told()) {
    const at = S.tail(T.L, true), sp = cam.worldToScreen((T.x + at.x) / 2, (T.y + at.y) / 2), m = edgeMarker(sp.x, sp.y, W, H, 34 * s);
    if (!m) continue;
    const z = s * 2.2, on = S.blink(T.L);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [col, lw, alpha] of [[PALETTE.ink, 4.5 * z, 1], ['#ff2a4a', 2.2 * z, on ? 1 : 0.45]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const x = -i * 9 * z;
        ctx.moveTo(x - 5 * z, -8 * z); ctx.lineTo(x + 3 * z, 0); ctx.lineTo(x - 5 * z, 8 * z);
      }
      ctx.stroke();
    }
    ctx.restore();
    // the way round it, off the picture too: bone arrows on the edge at its height (a safe gap: docs/LEVEL2.md)
    const g = T.L.gap && cam.worldToScreen(T.L.gap.x, T.L.gap.y), gm = g && edgeMarker(g.x, g.y, W, H, 34 * s);
    if (!gm) continue;
    ctx.save();
    ctx.translate(gm.x, gm.y);
    ctx.rotate(gm.angle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [col, lw] of [[PALETTE.ink, 4.5 * z], ['#efe6d2', 2.2 * z]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const x = -i * 9 * z;
        ctx.moveTo(x - 5 * z, -8 * z); ctx.lineTo(x + 3 * z, 0); ctx.lineTo(x - 5 * z, 8 * z);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// What is left of a melee weapon that wears (data/weapons.js wear, in blows: a thing struck takes a share of one): a
// small notch a blow, emptied as it goes, pink on its last; at (x, y) top left. Returns true.
function drawWear(ctx, of, left, x, y, s) {
  const nw = 12 * s, nh = 4 * s, gap = 3 * s, last = left <= 1;
  for (let i = 0; i < of; i++) {
    const nx = x + i * (nw + gap), k = clamp(left - i, 0, 1);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(nx - s, y - s, nw + 2 * s, nh + 2 * s);
    if (k <= 0) continue;
    ctx.fillStyle = last ? PALETTE.pink : PALETTE.white;
    ctx.fillRect(nx, y, nw * k, nh);
  }
  return true;
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
  const m = v.multiplier, mult = `x${m.toFixed(Number.isInteger(m * 10) ? 1 : 2)}`, lw = Math.max(widthOf(ctx, 'KILLS', P.label * s), widthOf(ctx, mult, P.label * 1.4 * s));
  text(ctx, 'KILLS', 0, -9 * s, P.label * s, col, { align: 'right' });
  text(ctx, mult, 0, 8 * s, P.label * 1.4 * s, col, { align: 'right' });
  const dx = -lw - P.gap * s, size = P.size * s * (1 + v.punch), str = String(v.chain);
  text(ctx, str, dx, 0, size, v.flash ? PALETTE.white : col, { align: 'right', shadow: PALETTE.ink });
  // a white ghost of the digits swelling off them as they land
  const g = v.punch / P.punch;
  if (g > 0) text(ctx, str, dx, 0, size * (1 + (1 - g) * 0.5), PALETTE.white, { align: 'right', shadow: null, outline: false, alpha: 0.5 * g });
  ctx.restore();
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

// DOUBLE KILL / TRIPLE KILL / MASSACRE, centred high, stamped like the death screen's title (smaller, gone at once);
// a boss's name card the same, low on the screen (KILLFEED.banner.card)
function drawBanner(ctx, feed, W, H, s, t) {
  const v = feed.bannerView();
  if (!v) return;
  const size = v.size * s * v.scale, j = v.jolt * s, rot = -0.035;
  const x = W / 2 + j * Math.sin(t * 90), y = H * v.y + j * Math.cos(t * 77);
  ctx.save();
  ctx.globalAlpha *= v.alpha;
  // on a hard black shadow, a white ghost of it where it hit
  text(ctx, v.label, x + size * 0.09, y + size * 0.1, size, '#000', { shadow: null, rot });
  if (v.ghost > 0) text(ctx, v.label, W / 2, H * v.y, v.size * s * (1 + (1 - v.ghost) * 0.6), PALETTE.white, { shadow: null, outline: false, rot, alpha: 0.5 * v.ghost });
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
