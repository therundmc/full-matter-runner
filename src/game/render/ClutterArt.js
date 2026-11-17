// What stands on the furniture (systems/Clutter.js), drawn over its prop with the prop's own shudder and sag: each
// piece with a faint shadow on the top it stands on; a glass shot to pieces leaves its shards in a wet ring.
import { spriteOpt, drawSprite, silhouette } from '../../engine/Assets.js';

const STILL = { x: 0, y: 0, r: 0 };
const SHADOW = { x: 0.6, y: 0.8 }; // world px

export function drawClutter(ctx, clutter, vis) {
  if (!clutter) return;
  for (const [p, set] of clutter.on) {
    if (p.dead || p.parts || !vis(p.x, p.y)) continue;
    const o = p.centre(), k = p.kick || STILL, a = p.body.angle + (p.sag || 0) + k.r;
    // the shadow falls to the lower right of the picture whatever way the prop is turned
    const sx = SHADOW.x * Math.cos(a) + SHADOW.y * Math.sin(a), sy = SHADOW.y * Math.cos(a) - SHADOW.x * Math.sin(a);
    ctx.save();
    ctx.translate(o.x + k.x, o.y + k.y);
    ctx.rotate(a);
    for (const i of set) {
      const name = i.state === 'on' ? i.def.sprite : i.state === 'broken' ? i.def.broken : null;
      const img = name && spriteOpt('clutter/' + name);
      if (!img) continue;
      if (i.state === 'on') drawSprite(ctx, silhouette(img), i.x + sx, i.y + sy, i.a, 0.28);
      drawSprite(ctx, img, i.x, i.y, i.a);
    }
    ctx.restore();
  }
}

// The litter on the floor (systems/Litter.js): what lies flat drawn with the floor's things (air false), what flies
// over the furniture (air true): lifted off its shadow by its height, its width flipping as it turns over.
export function drawLitter(ctx, litter, vis, air) {
  if (!litter) return;
  for (const p of litter.list) {
    if (p.dead || (p.z > 0) !== air || !vis(p.x, p.y)) continue;
    const img = spriteOpt('clutter/' + p.sprite);
    if (!img) continue;
    if (!air) {
      if (p.def.shadow) drawSprite(ctx, silhouette(img), p.x + SHADOW.x, p.y + SHADOW.y, p.a, 0.28);
      drawSprite(ctx, img, p.x, p.y, p.a);
      continue;
    }
    drawSprite(ctx, silhouette(img), p.x + 1, p.y + 1, p.a, 0.22);
    const k = img.k || 1, flip = Math.max(0.15, Math.abs(Math.cos(p.ph)));
    ctx.save();
    ctx.translate(p.x, p.y - p.z * 0.5);
    ctx.rotate(p.a);
    ctx.scale(k * flip, k);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}
