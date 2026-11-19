// Level 2A's opening, what is not on him (systems/LastDrag.js): the end of his cigarette alight in the dark cab, the
// smoke he breathes out over the door, the butt he flicks out of the car, turning in the air over its shadow, and its
// end glowing on the road afterwards (the butt itself is painted on the floor once it lies there: LastDrag.fly).
// Drawn after the lighting: an ember and pale smoke are seen in the dark. Plain squares on the world's px.
import { spriteOpt, drawSprite } from '../../engine/Assets.js';

const EMBER = '255,138,42', HOT = '255,214,150', SMOKE = '206,200,214';

// an ember at (x, y): its hot heart (k: how bright, 0..1 and over), a square of glow round it (wide: a second,
// larger one: the cigarette in his fingers, in the drag; the butt's own would hide the butt)
function ember(ctx, x, y, k, wide = false) {
  x = Math.round(x); y = Math.round(y);
  if (wide) {
    ctx.fillStyle = `rgba(${EMBER},${Math.min(0.5, 0.2 * k)})`;
    ctx.fillRect(x - 2, y - 2, 5, 5);
  }
  ctx.fillStyle = `rgba(${EMBER},${Math.min(wide ? 1 : 0.55, (wide ? 0.45 : 0.2) + 0.4 * k)})`;
  ctx.fillRect(x - 1, y - 1, 3, 3);
  ctx.fillStyle = `rgba(${HOT},${Math.min(1, 0.5 + 0.5 * k)})`;
  ctx.fillRect(x, y, 1, 1);
}

export function drawDrag(ctx, w) {
  const d = w.drive?.drag;
  if (!d) return;
  const I = d.I, B = I.butt, b = d.butt;
  // his smoke: squares that grow and thin as they drift off
  for (const q of d.smoke) {
    const u = q.t / q.life, s = Math.round((I.size[0] + (I.size[1] - I.size[0]) * Math.sqrt(u)) * q.k);
    ctx.fillStyle = `rgba(${SMOKE},${0.42 * (1 - u) * (1 - u) * Math.min(1, q.t * 12)})`;
    ctx.fillRect(Math.round(q.x - s / 2), Math.round(q.y - s / 2), s, s);
  }
  // the cigarette's end in his fingers, flaring with the drag
  if (d.on && d.ph.held) { const tip = d.tip(); ember(ctx, tip.x, tip.y, 0.35 + 1.4 * d.ph.flare, true); }
  if (!b) return;
  if (!b.rest) {
    const img = spriteOpt('items/cig_butt'), y = b.y - b.z * 0.7;
    ctx.fillStyle = 'rgba(8,6,12,0.4)';
    ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y), 3, 1);
    if (img) drawSprite(ctx, img, b.x, y, b.a);
    ember(ctx, b.x + Math.cos(b.a) * 2, y + Math.sin(b.a) * 2, 1);
    return;
  }
  // on the road: the ember breathing, dying away
  const k = Math.max(0, b.glow / B.glow);
  if (k > 0) ember(ctx, b.x + Math.cos(b.a) * 2, b.y + Math.sin(b.a) * 2, Math.sqrt(k) * (0.6 + 0.4 * Math.sin(w.time * 5.3)));
}
