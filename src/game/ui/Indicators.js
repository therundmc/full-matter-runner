// Faint chevrons on the screen border toward the guards the player can know about (systems/Threats.js) that are just
// outside the view. No icon, no distance, nothing for far or unknown guards: a hint, not a radar.
import { INDICATORS, PALETTE } from '../Config.js';
import { edgeMarker } from '../systems/Threats.js';

const CALM = '#ffe3dc';

export function drawIndicators(ctx, game, t) {
  const w = game.world, cam = game.camera, R = INDICATORS;
  const W = game.canvas.width, H = game.canvas.height, s = H / 720;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const e of w.enemies) {
    const k = w.threats.strength(e);
    if (k <= 0) continue;
    const sp = cam.worldToScreen(e.x, e.y);
    const m = edgeMarker(sp.x, sp.y, W, H, 15 * s);
    if (!m) continue;
    const far = m.beyond / cam.z / R.reach; // 0 at the edge of the screen, 1 at the limit
    if (far >= 1) continue;
    const near = 1 - far;
    let alpha = R.alpha * k * near, color = CALM;
    if (w.threats.aiming(e)) {
      // he has us in his sights: a slow heartbeat, a little brighter
      const beat = 0.5 + 0.5 * Math.sin(t * 7);
      alpha = (R.alpha + (R.aimAlpha - R.alpha) * beat) * Math.sqrt(near);
      color = PALETTE.pink;
    }
    const z = s * (0.75 + 0.25 * near);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.beginPath();
    ctx.moveTo(-4 * z, -6 * z);
    ctx.lineTo(2 * z, 0);
    ctx.lineTo(-4 * z, 6 * z);
    // a dark under-stroke keeps it legible over a lit floor without making it any louder
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3.4 * z;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * z;
    ctx.stroke();
    ctx.restore();
  }
}
