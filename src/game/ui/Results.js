// The end-of-level results: a panel beside the replay of the run (render/Replay.js plays behind it), filled one beat
// after the other. LEVEL COMPLETE slams in, the three figures of the run count up (kills, best combo, time), the
// breakdown of the score line by line (Scoring.tally), the kill styles done (SCORING.tags and the named styles), the
// total, then the grade is stamped down, a new record flashes, and the prompts come up (retry, next level, menu).
// The timeline and its sounds are pure (resultsTimeline, resultsBeats: unit-tested); drawResults paints a moment of it.
import { PALETTE } from '../Config.js';
import { clamp, hash } from '../../engine/math.js';
import { text, glitchText, thousands, clock, fitSize } from './Text.js';
import { drawPrompts } from './Glyphs.js';

// s: when each beat comes, and how long a figure takes to count up
export const RESULTS = {
  tiles: 0.3, tileEvery: 0.16, tileCount: 0.5,  // the three figures of the run
  lines: 1.0, lineEvery: 0.2, lineCount: 0.24,  // the breakdown
  tagEvery: 0.07, maxTags: 6,                  // the kill styles, chip after chip
  total: 0.7,                                   // the total counting up
  stampAfter: 0.2, stamp: 0.16,                 // the grade: a breath, then it falls for `stamp` s
  record: 0.35, prompts: 0.5,                   // after the stamp: the record flash, the prompts
  tick: 0.05,                                   // s between two ticks of a figure counting
};
const GRADE_COLOR = { S: PALETTE.yellow, A: PALETTE.pink, B: PALETTE.cyan, C: PALETTE.white, D: '#8a7f96' };
const GREY = '#8a7f96';

const ease = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;

// when each beat of the results comes (s from the start of the screen)
export function resultsTimeline(r, R = RESULTS) {
  const tiles = [0, 1, 2].map((i) => R.tiles + i * R.tileEvery);
  const lines = r.lines.map((_, i) => R.lines + i * R.lineEvery);
  const tagsAt = R.lines + r.lines.length * R.lineEvery + 0.05;
  const tags = (r.tags || []).slice(0, R.maxTags).map((_, i) => tagsAt + i * R.tagEvery);
  const total = tagsAt + tags.length * R.tagEvery + 0.15;
  const stamp = total + R.total + R.stampAfter;
  return { tiles, lines, tags, total, stamp, record: stamp + R.record, prompts: stamp + R.prompts, end: stamp + R.prompts };
}

// what is heard between t0 and t1 (s, t0 excluded): a tick while a figure counts, a pop per style chip, the stamp's
// thump, the record's chime. -> [{ name, vol, opts? }] for Audio.play
export function resultsBeats(r, t0, t1, R = RESULTS) {
  const T = resultsTimeline(r, R), out = [];
  const crossed = (at) => at > t0 && at <= t1;
  // the counts that move a figure: [start, length]
  const counts = [
    ...T.tiles.map((at, i) => [at, R.tileCount, [r.run?.kills, r.run?.maxCombo, r.run?.time][i]]),
    ...T.lines.map((at, i) => [at, R.lineCount, r.lines[i].points]),
    [T.total, R.total, r.total],
  ];
  let tick = false;
  for (const [at, len, v] of counts) {
    if (!v) continue;
    for (let k = at; k <= at + len + 1e-9; k += R.tick) if (crossed(k)) tick = true;
  }
  if (tick) out.push({ name: 'click', vol: 0.5 });
  if (T.tags.some(crossed)) out.push({ name: 'ui', vol: 0.6 });
  if (crossed(T.stamp)) out.push({ name: 'punch', vol: 1 }, { name: 'bodyFall', vol: 0.7 });
  if (r.record && r.ranked && crossed(T.record)) out.push({ name: 'confirm', vol: 0.9, opts: { n: 6 } });
  return out;
}

// the line under the stamp: what the next grade up takes (the top one also nobody else killed, when that kept it)
export function gradeHint(r) {
  const n = r.next;
  if (!n) return 'TOP GRADE';
  if (!n.clean) return `${n.grade} FROM ${thousands(n.at)}`;
  return r.total >= n.at ? `${n.grade}: NO CIVILIAN KILLED` : `${n.grade} FROM ${thousands(n.at)}, NO CIVILIAN`;
}

// the grade as a rubber stamp: k 0..1 its fall, since: s since it landed (the ink spatters, a ring goes out)
function drawStamp(ctx, grade, x, y, size, k, since, s) {
  const color = GRADE_COLOR[grade] || PALETTE.white, seed = grade.charCodeAt(0);
  if (since > 0 && since < 0.45) {
    // the shock of it landing
    const q = since / 0.45;
    ctx.save();
    ctx.globalAlpha = (1 - q) * 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4 * s * (1 - q) + s;
    ctx.beginPath();
    ctx.arc(x, y, size * (0.55 + q * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x, y);
  const fall = 1 - ease(k);
  ctx.rotate(-0.13 + fall * 0.35);
  ctx.scale(1 + fall * 2.4, 1 + fall * 2.4);
  ctx.globalAlpha = clamp(k * 1.6, 0, 1);
  const h = size / 2, lw = size * 0.065;
  // ink spatter round the box, once it is down
  if (since > 0) {
    ctx.fillStyle = color;
    for (let i = 0; i < 9; i++) {
      const a = hash(seed + i) * Math.PI * 2, d = h * (1.08 + hash(seed + i * 3) * 0.3), r = size * (0.012 + hash(seed + i * 7) * 0.02);
      ctx.fillRect(Math.cos(a) * d - r, Math.sin(a) * d - r, r * 2, r * 2);
    }
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = 16 * s;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(-h + lw / 2, -h + lw / 2, size - lw, size - lw);
  ctx.lineWidth = lw * 0.35;
  ctx.strokeRect(-h + lw * 1.9, -h + lw * 1.9, size - lw * 3.8, size - lw * 3.8);
  ctx.shadowBlur = 0;
  text(ctx, grade, 0, size * 0.04, size * 0.66, color, { shadow: '#000' });
  // worn ink: bites out of the frame
  ctx.fillStyle = 'rgba(8,2,16,0.92)';
  for (let i = 0; i < 7; i++) {
    const side = Math.floor(hash(seed + i * 11) * 4), along = (hash(seed + i * 13) - 0.5) * size * 0.85;
    const w = size * (0.03 + hash(seed + i * 17) * 0.06), d = h - lw / 2;
    const [px, py] = [[along, -d], [d, along], [along, d], [-d, along]][side];
    ctx.fillRect(px - w / 2, py - w / 2, w, w);
  }
  ctx.restore();
}

// Paints the results at t s. r: Scoring.tally() + { best: previous best | null, record, ranked, level: { label, name },
// nextLevel: id | null }. replay: the replay is playing behind (the panel then stands on the right, clear of it).
// device: whose caps the prompts show.
export function drawResults(ctx, W, H, t, r, replay, device) {
  const s = H / 720, T = resultsTimeline(r);
  const pw = Math.min(W - 32 * s, 540 * s), top = 24 * s, bottom = H - 24 * s;
  if (!replay) {
    ctx.fillStyle = `rgba(8,2,16,${clamp(t * 2, 0, 0.88)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // the panel slides in from the right; it jolts when the grade lands
  const since = t - T.stamp - RESULTS.stamp, jolt = since > 0 && since < 0.2 ? (1 - since / 0.2) * 6 * s : 0;
  const x0 = (replay ? W - pw - 30 * s : (W - pw) / 2) + (1 - ease(t / 0.22)) * pw * 0.7 + jolt * Math.sin(t * 80);
  const y0 = jolt * Math.cos(t * 67);
  const L = x0 + 26 * s, Rx = x0 + pw - 26 * s, inner = Rx - L, cx = x0 + pw / 2;
  ctx.save();
  ctx.translate(0, y0);
  ctx.globalAlpha = clamp(t * 5, 0, 1);
  ctx.fillStyle = 'rgba(8,2,16,0.88)';
  ctx.fillRect(x0, top, pw, bottom - top);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = top; y < bottom; y += 4 * s) ctx.fillRect(x0, y, pw, s);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(x0, top, pw, 3 * s);
  ctx.fillRect(x0, bottom - 3 * s, pw, 3 * s);
  ctx.fillStyle = PALETTE.cyan;
  ctx.fillRect(x0, top, 3 * s, bottom - top);
  ctx.globalAlpha = 1;

  // ---- head: the level, LEVEL COMPLETE slammed in
  let y = top + 24 * s;
  if (r.level) {
    text(ctx, r.level.label || '', L, y, 12 * s, PALETTE.yellow, { align: 'left', alpha: 0.9 });
    text(ctx, r.level.name || '', Rx, y, 12 * s, PALETTE.white, { align: 'right', alpha: 0.7 });
  }
  y += 40 * s;
  const hk = clamp(t / 0.2, 0, 1), hs = fitSize(ctx, 'LEVEL COMPLETE', 36 * s, inner) * (1 + (1 - ease(hk)) * 0.9);
  glitchText(ctx, 'LEVEL COMPLETE', cx, y, hs, t, { color: PALETTE.white, alpha: hk });

  // ---- the three figures of the run
  y += 36 * s;
  const run = r.run || {}, tw = (inner - 16 * s) / 3, th = 74 * s;
  const tiles = [
    ['KILLS', (k) => `${Math.round((run.kills || 0) * k)}/${run.guards ?? 0}`, run.guards && run.kills >= run.guards ? 'ALL DOWN' : '', PALETTE.white],
    ['BEST COMBO', (k) => `x${Math.round((run.maxCombo || 0) * k)}`, run.maxCombo >= 4 ? 'ON FIRE' : run.maxCombo >= 2 ? 'CHAINED' : '', PALETTE.yellow],
    ['TIME', (k) => clock((run.time || 0) * k), run.par ? `PAR ${clock(run.par)}` : '', run.par && run.time <= run.par ? '#3cff7a' : PALETTE.white],
  ];
  tiles.forEach(([label, value, sub, col], i) => {
    const at = T.tiles[i], k = clamp((t - at) / RESULTS.tileCount, 0, 1), a = clamp((t - at) * 6, 0, 1);
    if (a <= 0) return;
    const tx = L + i * (tw + 8 * s), counting = k < 1;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(tx, y, tw, th);
    ctx.fillStyle = i === 1 ? PALETTE.yellow : PALETTE.pink;
    ctx.fillRect(tx, y, tw, 2 * s);
    ctx.globalAlpha = 1;
    text(ctx, label, tx + tw / 2, y + 15 * s, 10 * s, PALETTE.cyan, { alpha: a });
    const str = value(ease(k));
    text(ctx, str, tx + tw / 2, y + 41 * s, fitSize(ctx, str, 26 * s, tw - 12 * s) * (counting ? 1.04 : 1), counting ? PALETTE.white : col, { alpha: a });
    if (sub && !counting) text(ctx, sub, tx + tw / 2, y + 63 * s, 9 * s, col === PALETTE.white ? PALETTE.pink : col, { alpha: 0.85 });
  });

  // ---- the breakdown, line after line, each figure counting up
  y += th + 26 * s;
  const step = 23 * s;
  r.lines.forEach((l, i) => {
    const at = T.lines[i], k = clamp((t - at) / RESULTS.lineCount, 0, 1), a = clamp((t - at) * 7, 0, 1);
    if (a > 0) {
      const dx = (1 - ease(a)) * 24 * s, neg = l.points < 0;
      text(ctx, l.label, L + dx, y, 14 * s, PALETTE.cyan, { align: 'left', alpha: a });
      text(ctx, l.detail, L + inner * 0.6 + dx, y, 10 * s, PALETTE.white, { alpha: a * 0.7 });
      const pts = Math.round(l.points * ease(k));
      text(ctx, `${neg ? '-' : '+'}${thousands(Math.abs(pts))}`, Rx + dx, y, 14 * s,
        neg ? PALETTE.pink : !l.points ? GREY : k < 1 ? PALETTE.yellow : PALETTE.white, { align: 'right', alpha: a });
    }
    y += step;
  });

  // ---- the kill styles done, as chips
  const tags = (r.tags || []).slice(0, RESULTS.maxTags), more = (r.tags || []).length - tags.length;
  y += 2 * s;
  if (t > (T.tags[0] ?? T.total)) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(L, y - 6 * s, inner, s);
  }
  y += 10 * s;
  const ch = 20 * s, cs = 10 * s;
  if (tags.length && t > T.tags[0]) text(ctx, 'STYLE', L, y, 9 * s, GREY, { align: 'left' });
  else if (!tags.length && t > T.total) text(ctx, 'NO STYLE POINTS - TRY A SLIDE KILL', L, y, 9 * s, GREY, { align: 'left' });
  y += 18 * s;
  let cx0 = L, row = 0;
  ctx.font = `${Math.round(cs)}px joystix, monospace`;
  tags.forEach((g, i) => {
    const at = T.tags[i];
    if (t <= at) return;
    const label = `${g.label}${g.n > 1 ? ` x${g.n}` : ''}${i === tags.length - 1 && more > 0 ? `  +${more} MORE` : ''}`;
    const w = ctx.measureText(label).width + 14 * s;
    if (cx0 + w > Rx && cx0 > L) { cx0 = L; row++; }
    if (row > 1) return;
    const cy = y + row * (ch + 6 * s), pop = 1 + (1 - ease((t - at) / 0.12)) * 0.35;
    ctx.save();
    ctx.translate(cx0 + w / 2, cy);
    ctx.scale(pop, pop);
    ctx.fillStyle = i === 0 ? PALETTE.pink : 'rgba(255,42,109,0.22)';
    ctx.fillRect(-w / 2, -ch / 2, w, ch);
    ctx.strokeStyle = PALETTE.pink;
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(-w / 2 + 0.5, -ch / 2 + 0.5, w - 1, ch - 1);
    text(ctx, label, 0, s, cs, PALETTE.white, { shadow: null });
    ctx.restore();
    ctx.font = `${Math.round(cs)}px joystix, monospace`;
    cx0 += w + 6 * s;
  });

  // ---- the total and the grade, stamped
  const bt = bottom - 196 * s, size = 128 * s, sx = L + size / 2 + 6 * s, sy = bt + size / 2 + 20 * s;
  const tt = t - T.total;
  if (tt > 0) {
    const kt = ease(tt / RESULTS.total), done = kt >= 1;
    const right = Rx, ty = bt + 46 * s;
    text(ctx, 'TOTAL', right, bt + 14 * s, 12 * s, PALETTE.white, { align: 'right', alpha: 0.75 });
    const pop = done ? 1 + Math.max(0, 0.12 - (tt - RESULTS.total)) * 2 : 1;
    text(ctx, thousands(Math.round(r.total * kt)), right, ty, fitSize(ctx, '000 000', 40 * s, inner - size - 30 * s) * pop, PALETTE.yellow, { align: 'right' });
  }
  const gt = t - T.stamp;
  if (gt > 0) {
    text(ctx, 'GRADE', sx, bt - 8 * s, 10 * s, PALETTE.white, { alpha: 0.7 });
    drawStamp(ctx, r.grade, sx, sy, size, gt / RESULTS.stamp, since, s);
  }
  if (since > 0) {
    const right = Rx;
    let ly = bt + 86 * s;
    const hint = gradeHint(r);
    text(ctx, hint, right, ly, fitSize(ctx, hint, 11 * s, inner - size - 24 * s), PALETTE.white, { align: 'right', alpha: 0.65 * clamp(since * 4, 0, 1) });
    ly += 26 * s;
    const rt = t - T.record;
    if (rt > 0) {
      const a = clamp(rt * 5, 0, 1);
      if (!r.ranked) text(ctx, 'SANDBOX RUN - NOT RANKED', right, ly, 11 * s, PALETTE.cyan, { align: 'right', alpha: a * 0.85 });
      else if (r.record) {
        const blink = Math.floor(t * 6) % 2 === 0, sc = 1 + Math.max(0, 0.15 - rt) * 3;
        text(ctx, 'NEW RECORD', right, ly, 19 * s * sc, blink ? PALETTE.yellow : PALETTE.pink, { align: 'right', alpha: a, rot: -0.03 });
        if (r.best) text(ctx, `WAS ${thousands(r.best.total)}  ${r.best.grade}`, right, ly + 22 * s, 10 * s, PALETTE.white, { align: 'right', alpha: a * 0.6 });
        // the panel flashes when it lands
        if (rt < 0.18) {
          ctx.fillStyle = `rgba(255,244,200,${0.22 * (1 - rt / 0.18)})`;
          ctx.fillRect(x0, top, pw, bottom - top);
        }
      } else if (r.best) text(ctx, `BEST ${thousands(r.best.total)}  ${r.best.grade}`, right, ly, 11 * s, PALETTE.cyan, { align: 'right', alpha: a * 0.85 });
    }
  }

  // ---- what next
  const pt = t - T.prompts;
  if (pt > 0) {
    ctx.save();
    ctx.globalAlpha = ease(pt / 0.2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x0 + 3 * s, bottom - 46 * s, pw - 3 * s, 43 * s);
    // what Game.updateResults reads: ENTER / A goes on, R / Y retries, ESC / B goes to the menu
    const go = [['confirm', r.nextLevel ? 'NEXT' : 'CONTINUE'], ['retry', 'RETRY'], ['menu', 'MENU']];
    drawPrompts(ctx, go, cx, bottom - 24 * s, 18 * s, device, { font: 0.6, gap: 1.2 });
    ctx.restore();
  }
  ctx.restore();
}
