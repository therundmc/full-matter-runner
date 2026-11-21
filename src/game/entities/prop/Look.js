// How a prop is drawn (entities/Prop.js draw): its shadow, its sprite or its damaged canvas, its doors, the parts
// hanging off it, what hangs overhead in front of the player.
import { drawSprite, silhouette } from '../../../engine/Assets.js';
import { rand } from '../../../engine/math.js';
import { canvas, put } from '../../render/DamageArt.js';
import { parallaxOf } from '../../data/mounts.js';

const INK_DOOR = '#141018'; // outline of a cabinet's open doors

export function shadowImg(me) {
  if (!me.canvas) return silhouette(me.img);
  if (!me.shadow) {
    const s = me.shadow = canvas(me.W, me.H, me.canvas.k);
    const g = s.getContext('2d');
    put(g, me.canvas);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, me.W, me.H);
  }
  return me.shadow;
}

// the open doors of a cabinet, seen edge on from above: thin plates out of its front corners (local +y edge)
export function drawDoors(me, ctx, x, y, a) {
  const n = me.doors.length, len = me.W / n, c = Math.cos(a), s = Math.sin(a);
  ctx.save();
  ctx.transform(c, s, -s, c, x, y);
  me.doors.forEach((d, i) => {
    // left door hinged on the left corner, right one on the right, both swinging out into the room
    const side = n === 1 || i === 0 ? -1 : 1, hx = (side * me.W) / 2, an = side < 0 ? d.a : Math.PI - d.a;
    ctx.save();
    ctx.translate(hx, me.H / 2);
    ctx.rotate(an);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(1, 1.5, len, 2);
    ctx.fillStyle = INK_DOOR;
    ctx.fillRect(0, -0.5, len, 3);
    ctx.fillStyle = me.def.chips;
    ctx.fillRect(0.5, 0, len - 1, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; // its edge catches the light
    ctx.fillRect(0.5, 0, len - 1, 0.7);
    ctx.restore();
  });
  ctx.restore();
}

// falling apart: the parts that have not let go yet, still in place; one about to go shudders
export function drawParts(me, ctx) {
  const f = me.fall, a = me.body.angle;
  for (const pc of me.parts) {
    if (pc.leg) continue; // still hidden under the top
    const lx = pc.cx - me.W / 2, ly = pc.cy - me.H / 2, loose = pc.t - f.t < 0.07 ? 0.8 : 0;
    const x = f.x + lx * f.ca - ly * f.sa + rand(-loose, loose), y = f.y + lx * f.sa + ly * f.ca + rand(-loose, loose);
    drawSprite(ctx, silhouette(pc.img), x + 2, y + 2, a, 0.3);
    drawSprite(ctx, pc.img, x, y, a);
  }
}

// canopies and lamp heads: above everyone, see-through when the player is under
export function drawOverhead(me, ctx, player, cam) {
  const o = me.centre(), k = me.kick, d = me.def;
  // parallax: what sits up on a pole or a ceiling leans away from the centre of the view (data/mounts.js)
  const lift = parallaxOf(d);
  me.ox = (o.x - cam.x) * lift;
  me.oy = (o.y - cam.y) * lift;
  const b = me.bend || { x: 0, y: 0 }; // a bent post keeps its lean
  const x = o.x + me.ox + k.x + b.x, y = o.y + me.oy + k.y + b.y, a = me.body.angle + me.sag + k.r + me.spun();
  if (d.pole) {
    ctx.strokeStyle = d.pole[0];
    ctx.lineWidth = d.pole[1];
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(x, y); ctx.stroke();
  }
  // see-through when the player stands under the sprite itself (a lamp arm is long and thin)
  let under = false;
  if (player) {
    const c = Math.cos(a), s = Math.sin(a), dx = player.x - x, dy = player.y - y;
    under = Math.abs(dx * c + dy * s) < me.W * 0.45 && Math.abs(dy * c - dx * s) < me.H * 0.45 + 4;
  }
  // (and while something is to be seen under it: a crash under a toll's roof, systems/TollFx.js `clearUntil`)
  drawSprite(ctx, me.look, x, y, a, under || me.clearUntil > me.world.time ? 0.45 : 1);
}
