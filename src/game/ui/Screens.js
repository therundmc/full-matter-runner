import { PALETTE } from '../Config.js';
import { text, glitchText, thousands, fitSize } from './Text.js';
import { clamp } from '../../engine/math.js';
import { OUTRO, fadeAlpha, barsK } from '../systems/Outro.js';
import { WEAPONS } from '../data/weapons.js';
import { drawPrompts } from './Glyphs.js';
import { keyLabel } from '../data/controls.js';

const TAUNTS = [
  'ONE BULLET. THAT IS ALL IT TAKES.',
  'TOO SLOW.',
  'THEY HEARD YOU COMING.',
  'TRY THE DOOR NEXT TIME.',
  'THROW SOMETHING AT THEM.',
  'DID YOU THINK THEY WOULD MISS?',
  'PRESS {retry}. AGAIN. AND AGAIN.', // ({action}: that action's cap for the device in use, data/controls.js)
];
// deaths that deserve their own line, by cause (Character.kill)
const CAUSE_TAUNTS = {
  vehicle: ['LOOK BOTH WAYS.', 'THE STREET DOES NOT STOP FOR YOU.', 'ROADKILL.'],
  crash: ['STEER. OR SHOVE THEM OFF THE ROAD.', 'WALLS DO NOT MOVE.', 'SHOVE THEM, NOT THE CITY.'],
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

// The card a level opens on, in the death screen's family: black bars slammed in over the level (seen between them),
// the level's label stamped, then its name stamped down big with a jolt and a flash, a black band sliding in where the
// place and the hour are typed, the objective under it, the best result in the top bar and the way in in the bottom
// one. At `leave` s (or at the first key) play starts and the bars open like a shutter over it, the card thrown off
// (Game draws that part over play: `out`). Timeline and sounds are pure (introTimeline, introBeats: unit-tested).
export const INTRO = {
  bars: 0.12,                   // s the bars take to slam in
  label: 0.06, labelFall: 0.08, // the label's stamp: when it starts, how long it falls
  title: 0.16, slam: 0.14,      // the name's stamp: when it starts, how long it falls
  band: 0.44, bandIn: 0.16,     // the band slides in, then the place and the hour are typed at `cps` letters a second
  type: 0.52, cps: 80,
  objective: 0.12,              // s after the typing
  prompt: 0.5,                  // the prompt, early: he can go at once
  leave: 2.3, out: 0.3,         // s the card holds before play starts by itself; s the shutter takes to open
  skipAfter: 0.3,               // a key or a click before that is not taken as a skip
};
// the colours of a level's card: main (title, edges), deep (the band's shadow), wash (r,g,b over the picture)
const INTRO_TINTS = {
  tutorial: { main: PALETTE.cyan, deep: '#004a5c', wash: '0,26,44' },
  level1: { main: PALETTE.pink, deep: '#7a0034', wash: '44,0,30' },
};
export const introTint = (id) => INTRO_TINTS[id] || INTRO_TINTS.level1;
// heard as the shutter opens (flow/States.js leaveIntro), whenever that is
export const SHUTTER_SOUND = { name: 'swing', vol: 0.7, opts: { weapon: 'bat' } };

// when each beat of a level's card comes (s from its start)
export function introTimeline(level, R = INTRO) {
  const land = R.title + R.slam, typed = R.type + (level.subtitle?.length || 0) / R.cps;
  return { label: R.label + R.labelFall, land, band: R.band, typed, objective: typed + R.objective, prompt: R.prompt, leave: R.leave };
}

// what is heard between t0 and t1 (s, t0 excluded): the bars landing, the label's knock, the name's stamp, the band's
// rush, a tick per letter typed (one a frame at most), the objective's click. -> [{ name, vol, opts? }] for Audio.play
export function introBeats(level, t0, t1, R = INTRO) {
  const T = introTimeline(level, R), out = [], crossed = (at) => at > t0 && at <= t1;
  if (crossed(R.bars)) out.push({ name: 'bodyFall', vol: 0.6 });
  if (crossed(T.label)) out.push({ name: 'click', vol: 0.9 });
  if (crossed(T.land)) out.push({ name: 'punch', vol: 1 }, { name: 'bodyFall', vol: 0.8 });
  if (level.subtitle && crossed(R.band)) out.push({ name: 'swing', vol: 0.45, opts: { weapon: 'cue' } });
  const sub = level.subtitle || '';
  for (let i = 0; i < sub.length; i++) {
    if (sub[i] !== ' ' && crossed(R.type + (i + 1) / R.cps)) { out.push({ name: 'click', vol: 0.3 }); break; }
  }
  if (level.objective && crossed(T.objective)) out.push({ name: 'ui', vol: 0.6 });
  return out;
}

// t: s on the card (held where it was once play has started); out: s since play started (the shutter opening).
// card: { level, best ({ total, grade } or null), label ('LEVEL 1'), device, tint: introTint(id) }
export function drawIntro(ctx, W, H, t, card, out = 0) {
  const { level, best, label, device, tint } = card;
  const s = H / 720, R = INTRO, T = introTimeline(level), ease = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;
  // the shutter: everything goes, faster and faster
  const go = clamp(out / R.out, 0, 1) ** 2, stay = 1 - go;
  // the picture darkens in the level's colour, more at the edges
  const a = ease(t / 0.2) * stay;
  ctx.fillStyle = `rgba(${tint.wash},${0.42 * a})`;
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${0.7 * a})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  // black bars slam in, an edge of the level's colour on each; they open like a shutter
  const bar = H * 0.16 * ease(t / R.bars) * stay;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  ctx.fillStyle = tint.main;
  ctx.fillRect(0, bar, W, 3 * s);
  ctx.fillRect(0, H - bar - 3 * s, W, 3 * s);

  // the card keeps above two thirds of the height: level 1 opens on him sat in the alley about there, under it
  const ty = H * 0.37, rot = -0.035, throwX = -go * W * 0.9, fade = clamp(1 - go * 2.5, 0, 1);
  // the label, stamped on a little black plate above the name
  const lk = clamp((t - R.label) / R.labelFall, 0, 1);
  if (t > R.label) {
    const sc = 1 + (1 - ease(lk)) * 1.2, ls = 20 * s * sc;
    ctx.save();
    ctx.globalAlpha = clamp(lk * 3, 0, 1) * fade;
    ctx.translate(W / 2 + throwX * 0.7, ty - 74 * s);
    ctx.rotate(rot);
    ctx.font = `${Math.round(ls)}px joystix, monospace`;
    const pw = ctx.measureText(label).width + 34 * s * sc, ph = 34 * s * sc;
    ctx.fillStyle = tint.deep;
    ctx.fillRect(-pw / 2 + 4 * s, -ph / 2 + 4 * s, pw, ph);
    ctx.fillStyle = '#050003';
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.fillStyle = tint.main;
    ctx.fillRect(-pw / 2, -ph / 2, 5 * s, ph);
    ctx.fillRect(pw / 2 - 5 * s, -ph / 2, 5 * s, ph);
    text(ctx, label, 0, 1 * s, ls, PALETTE.yellow, { shadow: null });
    ctx.restore();
  }

  // the name stamped down: big, fast, a jolt when it lands, a white ghost of it where it hit
  const k = clamp((t - R.title) / R.slam, 0, 1), land = t - T.land;
  if (t > R.title) {
    const size = fitSize(ctx, level.name, 96 * s, W * 0.86);
    const sc = 1 + (1 - ease(k)) * 1.6, jolt = land > 0 && land < 0.18 ? (1 - land / 0.18) * 9 * s : 0;
    const jx = jolt * Math.sin(t * 90) + throwX, jy = jolt * Math.cos(t * 77);
    ctx.save();
    ctx.globalAlpha = clamp(k * 2, 0, 1) * clamp(1 - go * 1.5, 0, 1);
    text(ctx, level.name, W / 2 + 9 * s + jx, ty + 10 * s + jy, size * sc, '#000', { shadow: null, rot });
    if (land > 0 && land < 0.3) text(ctx, level.name, W / 2, ty, size * (1 + land * 0.8), PALETTE.white, { shadow: null, outline: false, rot, alpha: 0.5 * (1 - land / 0.3) });
    glitchText(ctx, level.name, W / 2 + jx, ty + jy, size * sc, t, { rot, color: tint.main });
    ctx.restore();
    if (land > 0 && land < 0.12 && !out) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - land / 0.12)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // the place and the hour, typed on a black band sliding in from the left (and thrown off to the right)
  const bt = t - R.band;
  if (bt > 0 && level.subtitle) {
    const bw = Math.min(W, 800 * s), bh = 50 * s, by = H * 0.525, slide = (1 - ease(bt / R.bandIn)) * -W + go * W;
    ctx.save();
    ctx.translate(W / 2 + slide, by);
    ctx.rotate(-0.012);
    ctx.fillStyle = tint.deep;
    ctx.fillRect(-bw / 2 + 6 * s, -bh / 2 + 6 * s, bw, bh);
    ctx.fillStyle = '#050003';
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = tint.main;
    ctx.fillRect(-bw / 2, -bh / 2, 10 * s, bh);
    ctx.fillRect(bw / 2 - 10 * s, -bh / 2, 10 * s, bh);
    const sub = level.subtitle, n = clamp(Math.floor((t - R.type) * R.cps), 0, sub.length);
    const size = fitSize(ctx, sub, 17 * s, bw - 60 * s);
    ctx.font = `${Math.round(size)}px joystix, monospace`;
    const x0 = -ctx.measureText(sub).width / 2, shown = sub.slice(0, n);
    if (n) text(ctx, shown, x0, 0, size, PALETTE.white, { align: 'left', shadow: tint.deep });
    // the cursor: runs with the letters, then blinks
    if (t > R.type - 0.05 && (n < sub.length || Math.sin(t * 14) > 0)) {
      ctx.font = `${Math.round(size)}px joystix, monospace`;
      const cx = x0 + ctx.measureText(shown).width + 3 * s;
      ctx.fillStyle = tint.main;
      ctx.fillRect(cx, -size * 0.45, size * 0.55, size * 0.9);
    }
    ctx.restore();
  }

  // what he is here for
  const ot = t - T.objective;
  if (ot > 0 && level.objective) {
    const oa = ease(ot / 0.18) * fade, rise = (1 - ease(ot / 0.18)) * 10 * s;
    text(ctx, 'OBJECTIVE', W / 2, H * 0.592 + rise, 13 * s, tint.main, { alpha: oa });
    text(ctx, level.objective[0], W / 2, H * 0.628 + rise, 19 * s, PALETTE.yellow, { alpha: oa });
  }

  // the way in, in the bottom bar; the best result so far, in the top one
  const pt = t - R.prompt;
  if (pt > 0) {
    const pa = ease(pt / 0.15) * fade, pulse = 0.82 + 0.18 * Math.sin(t * 9);
    const list = device === 'pad' ? [['confirm', 'TO START']] : [['confirm', ''], ['attack', 'TO START']];
    ctx.save();
    ctx.globalAlpha = pa;
    drawPrompts(ctx, list, W / 2, H - bar / 2, 34 * s * pulse ** 0.3, device, { color: PALETTE.yellow, gap: 0.5, font: 0.62, lead: 'PRESS' });
    ctx.restore();
    if (best) {
      const y = bar / 2;
      text(ctx, best.grade, W - 30 * s, y, 22 * s, PALETTE.yellow, { align: 'right', alpha: pa });
      text(ctx, `BEST  ${thousands(best.total)}`, W - 62 * s, y, 13 * s, tint.main, { align: 'right', alpha: 0.85 * pa });
    }
  }
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
    case 'fire': return { verb: 'BURNED ALIVE', by: '' };
    case 'explosion': return { verb: 'BLOWN APART', by: killer?.isPlayer ? 'BY YOUR OWN BLAST' : '' };
    case 'vehicle': return { verb: 'RUN OVER', by: `BY A ${killer?.type === 'van' ? 'VAN' : 'CAR'}` };
    case 'crash': return { verb: 'CRASHED', by: 'HEAD ON, AT THE WHEEL' }; // nose-on into a wall (systems/Drive.js)
    default: return { verb: 'KILLED', by: by() };
  }
}

const DEAD = { slam: 0.14, line: 0.24, taunt: 0.38, prompt: 0.3 }; // s: the title lands, the cause, the taunt, the prompt

// The death screen: a red wash, black bars slammed in, YOU'RE DEAD stamped down, what killed him on a red band, a
// taunt and the retry prompt at once (R / a click / the pad's A: Game.retry, at the last checkpoint or room reached).
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
    const line = lines[seed % lines.length].replace(/\{(\w+)\}/g, (_, a) => keyLabel(a, device));
    text(ctx, line, W / 2, H * 0.655, 15 * s, PALETTE.white, { alpha: ease(tt / 0.2) * 0.85 });
  }
  // the way back in, big, in the bottom bar
  const pt = t - DEAD.prompt;
  if (pt > 0) {
    const pulse = 0.82 + 0.18 * Math.sin(t * 9);
    const list = device === 'pad' ? [['retry', 'RETRY']] : [['retry', ''], ['attack', 'RETRY']];
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

// The card that closes a chase not finished yet (Game state 'continued'; view: systems/Drive.js finishView): the
// picture gone black, TO BE CONTINUED stamped a little crooked like the level's card, what comes next under it
export function drawContinued(ctx, W, H, view, next, t) {
  const s = H / 720, ease = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;
  ctx.fillStyle = `rgba(0,0,0,${view.black})`;
  ctx.fillRect(0, 0, W, H);
  if (view.title > 0) {
    const k = ease(view.title), sc = 1 + (1 - k) * 0.6;
    text(ctx, 'TO BE CONTINUED', W / 2, H * 0.44, 46 * s * sc, PALETTE.white, { alpha: clamp(view.title * 2, 0, 1), rot: -0.035 });
    ctx.fillStyle = PALETTE.pink;
    ctx.globalAlpha = k;
    ctx.fillRect(W / 2 - 250 * s * k, H * 0.44 + 38 * s, 500 * s * k, 3 * s);
    ctx.globalAlpha = 1;
  }
  if (view.name > 0) {
    text(ctx, `NEXT: ${next}`, W / 2, H * 0.44 + 74 * s, 24 * s, PALETTE.pink, { alpha: ease(view.name) * (0.85 + 0.15 * Math.sin(t * 5)) });
  }
}
