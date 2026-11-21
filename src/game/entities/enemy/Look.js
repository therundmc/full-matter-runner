// What is drawn of a guard besides his body (entities/Enemy.js draw): LUCKY's scarf, his marks, the tell of a
// blow wound up, his view cone (F2).
import { ENEMY, PALETTE } from '../../Config.js';
import { angDiff, clamp } from '../../../engine/math.js';
import { STAGE } from '../../ai/Conduct.js';
import { bodyFrame } from '../CharacterAnim.js';
import { TAIL } from '../../data/feel.js';
import { sprite, spriteOpt, sw } from '../../../engine/Assets.js';
import { S } from './States.js';

// The end of a scarf flying behind him (KINDS `tail`: LUCKY's): hung from his nape, it trails where he comes from
// when he moves and off one side of his back when he stands, lagging his turns and fluttering (TAIL).
export function drawTail(me, ctx) {
  const img = spriteOpt(me.look.tail);
  if (!img) return;
  const P = me.pose, w = me.world, sp = Math.hypot(me.vel.x, me.vel.y), ha = P.ha ?? me.angle;
  const flutter = Math.sin(w.time * (TAIL.beat + sp * 3) + me.seed) * (TAIL.wave + 0.1 * Math.min(1, sp));
  const want = (sp > TAIL.moving ? Math.atan2(-me.vel.y, -me.vel.x) : ha + Math.PI + TAIL.side) + flutter;
  const dt = Math.min(0.05, w.time - (me.tailT ?? w.time));
  me.tailT = w.time;
  me.tailA = me.tailA === undefined ? want : me.tailA + angDiff(me.tailA, want) * Math.min(1, dt * TAIL.follow);
  ctx.save();
  bodyFrame(ctx, me);
  ctx.translate(Math.round(me.x + P.tx - Math.cos(ha) * TAIL.nape), Math.round(me.y + P.ty - Math.sin(ha) * TAIL.nape));
  ctx.rotate(me.tailA);
  ctx.scale(img.k || 1, img.k || 1);
  ctx.drawImage(img, 0, -img.height / 2);
  ctx.restore();
}

// awareness marks, drawn after the lighting so they stay readable in the dark:
// '!' when spotted or giving a last warning, '?' while suspicious, and the detection meter filling up
export function drawMarks(me, ctx) {
  if (!me.alive || me.knocked > 0 || me.passive || me.yielded) return;
  if (me.tell > 0) drawTell(me, ctx);
  const showQ = me.aware === 1 && me.state !== S.DIZZY;
  if (me.iconT > 0 || showQ) {
    const ch = me.iconT > 0 ? me.icon : '?';
    ctx.font = '10px joystix';
    ctx.textAlign = 'center';
    ctx.globalAlpha = me.iconT > 0 ? clamp(me.iconT * 3, 0, 1) : 0.85;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(ch, me.x + 1, me.y - 13);
    ctx.fillStyle = ch === '!' ? PALETTE.pink : PALETTE.yellow;
    ctx.fillText(ch, me.x, me.y - 14);
    ctx.globalAlpha = 1;
  }
  // the same gauge shows his suspicion, or his patience running out with a stranger he is having a word with (a third of it per stage: told, warned, shoved)
  const c = me.case, word = c && c.stage >= STAGE.TOLD ? Math.min(1, (c.stage - 1 + Math.min(1, (me.world.time - c.t) / c.wait())) / 3) : 0;
  const m = Math.max(me.meter, word);
  if (me.aware < 2 && m > 0.04) {
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(me.x - 7, me.y - 12, 14, 3);
    ctx.fillStyle = m > 0.7 ? PALETTE.orange : PALETTE.yellow;
    ctx.fillRect(me.x - 6, me.y - 11, 12 * m, 1);
  }
}

// a blow wound up: a glint on the weapon's tip (or on the fist), growing as it comes, so it reads in the dark
function drawTell(me, ctx) {
  const P = me.pose, d = me.def, k = 1 - me.tell / me.tellDur;
  let x = me.x + P.hr.x, y = me.y + P.hr.y;
  if (P.wpnOn && d.sprite) {
    const len = (sw(sprite(d.sprite)) - d.grip) * P.wpnLen * P.s;
    x = me.x + P.wpn.x + Math.cos(P.wpn.a) * len; y = me.y + P.wpn.y + Math.sin(P.wpn.a) * len;
  } else if (me.punchSide < 0) { x = me.x + P.hl.x; y = me.y + P.hl.y; }
  const r = 2 + 5 * Math.min(1, k * 1.6), h = 0.9;
  ctx.save();
  bodyFrame(ctx, me);
  ctx.translate(x, y);
  ctx.rotate(me.world.time * 3);
  ctx.globalAlpha = 0.6 + 0.4 * k;
  for (const [col, g] of [[PALETTE.pink, 1.6], ['#fff8f0', 0.8]]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-r * g, 0); ctx.lineTo(0, -h * g); ctx.lineTo(r * g, 0); ctx.lineTo(0, h * g);
    ctx.moveTo(0, -r * g); ctx.lineTo(h * g, 0); ctx.lineTo(0, r * g); ctx.lineTo(-h * g, 0);
    ctx.fill();
  }
  ctx.restore();
}

// debug (F2): view cone (sharp centre brighter), state:tactic + meter, current target, cover, last known position
export function drawVision(me, ctx) {
  if (!me.alive || me.knocked) return;
  const col = ['255,255,255', '249,200,14', '255,40,80'][me.aware];
  ctx.fillStyle = `rgba(${col},0.06)`;
  ctx.beginPath();
  ctx.moveTo(me.x, me.y);
  ctx.arc(me.x, me.y, ENEMY.viewDist, me.angle - ENEMY.fov / 2, me.angle + ENEMY.fov / 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(me.x, me.y);
  ctx.arc(me.x, me.y, ENEMY.viewDist * 0.7, me.angle - ENEMY.focusCone, me.angle + ENEMY.focusCone);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgba(${col},0.35)`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(me.x, me.y, ENEMY.closeSense[me.aware], 0, Math.PI * 2); ctx.stroke();
  const tg = me.target;
  if (tg) {
    ctx.strokeStyle = `rgba(${col},0.7)`;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(tg.x, tg.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeRect(tg.x - 3, tg.y - 3, 6, 6);
  }
  if (me.cover) { ctx.strokeStyle = PALETTE.cyan; ctx.strokeRect(me.cover.x - 4, me.cover.y - 4, 8, 8); }
  const lk = me.lastKnown;
  if (lk && me.aware > 0) {
    ctx.strokeStyle = PALETTE.pink;
    ctx.beginPath(); ctx.moveTo(lk.x - 4, lk.y - 4); ctx.lineTo(lk.x + 4, lk.y + 4); ctx.moveTo(lk.x + 4, lk.y - 4); ctx.lineTo(lk.x - 4, lk.y + 4); ctx.stroke();
  }
  ctx.font = '5px joystix';
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.white;
  const label = me.state + (me.tactic ? ':' + me.tactic : '') + (me.activity !== 'walk' && me.aware === 0 ? ':' + me.activity : '');
  ctx.fillText(`${label} ${Math.round(me.meter * 100)}`, me.x, me.y + 18);
}
