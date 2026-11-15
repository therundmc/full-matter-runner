import { PALETTE } from '../Config.js';
import { text, glitchText, thousands } from './Text.js';
import { clamp } from '../../engine/math.js';
import { OUTRO, fadeAlpha, barsK } from '../systems/Outro.js';
import { WEAPONS } from '../data/weapons.js';
import { drawPrompts } from './Glyphs.js';

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
export function drawIntro(ctx, W, H, t, level, best, label = 'LEVEL 1') {
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
  text(ctx, label, W / 2 - slide, H / 2 - 38 * s, 18 * s, PALETTE.yellow, { alpha: a });
  glitchText(ctx, level.name, W / 2 + slide, H / 2 + 2 * s, 50 * s, t, { alpha: a });
  text(ctx, level.subtitle, W / 2, H / 2 + 42 * s, 13 * s, PALETTE.white, { alpha: a * 0.85 });
  if (level.objective) text(ctx, level.objective[0], W / 2, H / 2 + 68 * s, 16 * s, PALETTE.yellow, { alpha: a });
  if (best) text(ctx, `BEST ${thousands(best.total)}  ${best.grade}`, W / 2, H / 2 + 92 * s, 11 * s, PALETTE.cyan, { alpha: a * 0.8 });
}

// What killed him, told on the death screen: { verb, by } ('SHOT', 'BY A THUG  -  UZI'). cause: Character.kill's;
// killer: whoever it was credited to (a guard, a vehicle, himself for his own blast). Pure.
export function describeDeath(cause, killer) {
  const weapon = killer?.weapon && WEAPONS[killer.weapon.type];
  const who = killer?.isEnemy ? `BY A ${String(killer.kind || 'guard').toUpperCase()}` : '';
  const arm = weapon && weapon.name !== 'FISTS' ? weapon.name : '';
  const by = () => [who, arm].filter(Boolean).join('  -  ');
  switch (cause) {
    case 'bullet': case 'heavy': return { verb: 'SHOT', by: by() };
    case 'blast': return { verb: 'BUCKSHOT', by: by() };
    case 'melee': return killer?.isEnemy ? { verb: 'BEATEN TO DEATH', by: by() } : { verb: 'CRUSHED', by: '' };
    case 'slash': return killer?.isEnemy ? { verb: 'CUT DOWN', by: by() } : { verb: 'CUT TO PIECES', by: '' };
    case 'glass': return { verb: 'CUT TO PIECES', by: 'BY FLYING GLASS' };
    case 'explosion': return { verb: 'BLOWN APART', by: killer?.isPlayer ? 'BY YOUR OWN BLAST' : '' };
    case 'vehicle': return { verb: 'RUN OVER', by: `BY A ${killer?.type === 'van' ? 'VAN' : 'CAR'}` };
    default: return { verb: 'KILLED', by: by() };
  }
}

const DEAD = { slam: 0.14, line: 0.24, taunt: 0.38, prompt: 0.3 }; // s: the title lands, the cause, the taunt, the prompt

// The death screen: a red wash, black bars slammed in, YOU'RE DEAD stamped down, what killed him on a red band, a
// taunt and the restart prompt at once (R restarts from the first frame; the prompt only says so).
// death: { cause, by: describeDeath(...), n: deaths so far }; device: whose caps the prompt shows
export function drawDead(ctx, W, H, t, seed, death, device) {
  const s = H / 720, ease = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;
  // the picture goes red and dark, darker at the edges
  const a = ease(t / 0.25);
  ctx.fillStyle = `rgba(110,0,14,${0.38 * a})`;
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${0.75 * a})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  // black bars slam in, a red edge on each
  const bar = H * 0.16 * ease(t / 0.12);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(0, bar, W, 3 * s);
  ctx.fillRect(0, H - bar - 3 * s, W, 3 * s);

  // the title stamped down: big, fast, a jolt when it lands
  const k = clamp(t / DEAD.slam, 0, 1), land = t - DEAD.slam;
  const sc = 1 + (1 - ease(k)) * 1.6, jolt = land > 0 && land < 0.18 ? (1 - land / 0.18) * 9 * s : 0;
  const jx = jolt * Math.sin(t * 90), jy = jolt * Math.cos(t * 77);
  const ty = H * 0.4;
  ctx.save();
  ctx.globalAlpha = clamp(k * 2, 0, 1);
  // red on a hard black shadow, a white ghost of it where it hit
  text(ctx, "YOU'RE DEAD", W / 2 + 9 * s + jx, ty + 10 * s + jy, 96 * s * sc, '#000', { shadow: null, rot: -0.035 });
  if (land > 0 && land < 0.3) text(ctx, "YOU'RE DEAD", W / 2, ty, 96 * s * (1 + land * 0.8), PALETTE.white, { shadow: null, outline: false, rot: -0.035, alpha: 0.5 * (1 - land / 0.3) });
  glitchText(ctx, "YOU'RE DEAD", W / 2 + jx, ty + jy, 96 * s * sc, t, { rot: -0.035, color: '#ff1e3c' });
  ctx.restore();
  if (land > 0 && land < 0.12) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - land / 0.12)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // what killed him, on a red band sliding in from the left
  const lt = t - DEAD.line;
  if (lt > 0 && death?.by) {
    const bw = Math.min(W, 760 * s), bh = 58 * s, by = H * 0.555, slide = (1 - ease(lt / 0.16)) * -W;
    ctx.save();
    ctx.translate(W / 2 + slide, by);
    ctx.rotate(-0.012);
    ctx.fillStyle = '#c4001c';
    ctx.fillRect(-bw / 2 + 6 * s, -bh / 2 + 6 * s, bw, bh);
    ctx.fillStyle = '#050003';
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = '#ff1e3c';
    ctx.fillRect(-bw / 2, -bh / 2, 10 * s, bh);
    ctx.fillRect(bw / 2 - 10 * s, -bh / 2, 10 * s, bh);
    const two = !!death.by.by;
    text(ctx, death.by.verb, 0, two ? -9 * s : 0, 26 * s, PALETTE.white, { shadow: '#7a0010' });
    if (two) text(ctx, death.by.by, 0, 15 * s, 13 * s, '#ff5a70');
    ctx.restore();
  }
  const tt = t - DEAD.taunt;
  if (tt > 0) {
    const lines = CAUSE_TAUNTS[death?.cause] || TAUNTS;
    text(ctx, lines[seed % lines.length], W / 2, H * 0.655, 15 * s, PALETTE.white, { alpha: ease(tt / 0.2) * 0.85 });
  }
  // the way back in, big, in the bottom bar
  const pt = t - DEAD.prompt;
  if (pt > 0) {
    const pulse = 0.82 + 0.18 * Math.sin(t * 9);
    const list = device === 'pad' ? [['restart', 'RESTART']] : [['retry', ''], ['attack', 'RESTART']];
    ctx.save();
    ctx.globalAlpha = ease(pt / 0.15);
    drawPrompts(ctx, list, W / 2, H - bar / 2, 40 * s * pulse ** 0.3, device, { color: PALETTE.yellow, gap: 0.5, font: 0.7 });
    ctx.restore();
    if (death?.n > 1) text(ctx, `DEATH ${death.n}`, W - 30 * s, bar / 2, 13 * s, PALETTE.pink, { align: 'right', alpha: 0.8 * ease(pt / 0.3) });
  }
}

// the getaway (systems/Outro): the picture fades to black, letterbox bars slide in over it
export function drawOutro(ctx, W, H, out) {
  const fade = fadeAlpha(out), bar = Math.ceil(H * OUTRO.bars * barsK(out.t));
  ctx.fillStyle = '#000';
  if (fade > 0) {
    ctx.globalAlpha = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
}
