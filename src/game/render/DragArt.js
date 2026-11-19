// Level 2A's opening, what is not on him (systems/LastDrag.js): the butt he flicks out of the car, turning in the
// air over its shadow, and its end glowing on the road afterwards (the butt itself is painted on the floor once it
// lies there: LastDrag.fly). Drawn after the lighting: an ember is seen in the dark.
import { spriteOpt, drawSprite } from '../../engine/Assets.js';

const EMBER = '255,138,42';

export function drawDrag(ctx, w) {
  const b = w.drive?.drag?.butt;
  if (!b) return;
  const B = w.drive.drag.I.butt;
  if (!b.rest) {
    const img = spriteOpt('items/cig_butt'), y = b.y - b.z * 0.7;
    ctx.fillStyle = 'rgba(8,6,12,0.4)';
    ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y), 3, 1);
    if (img) drawSprite(ctx, img, b.x, y, b.a);
    // its end, bright as it turns
    ctx.fillStyle = `rgba(${EMBER},0.9)`;
    ctx.fillRect(Math.round(b.x + Math.cos(b.a) * 1.5), Math.round(y + Math.sin(b.a) * 1.5), 1, 1);
    return;
  }
  // on the road: the ember breathing, dying away
  const k = Math.max(0, b.glow / B.glow);
  if (k <= 0) return;
  const pulse = 0.55 + 0.45 * Math.sin(w.time * 5.3), x = Math.round(b.x + Math.cos(b.a) * 1.5), y = Math.round(b.y + Math.sin(b.a) * 1.5);
  ctx.fillStyle = `rgba(${EMBER},${0.16 * k * pulse})`;
  ctx.fillRect(x - 1, y - 1, 3, 3);
  ctx.fillStyle = `rgba(${EMBER},${Math.min(1, 0.5 + 0.5 * pulse) * Math.sqrt(k)})`;
  ctx.fillRect(x, y, 1, 1);
}
