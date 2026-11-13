// The sandbox panel (debug/Sandbox.js): tools and cheats listed under the HUD, top left.
import { PALETTE } from '../Config.js';
import { text } from './Text.js';

const COLORS = { title: PALETTE.pink, sel: PALETTE.yellow, on: PALETTE.cyan, dim: 'rgba(255,255,255,0.5)', '': PALETTE.white };

export function drawSandbox(ctx, H, sandbox, now) {
  const s = H / 720, x = 26 * s, y = 150 * s, step = 17 * s;
  const lines = sandbox.lines(now);
  ctx.fillStyle = 'rgba(8,2,16,0.6)';
  ctx.fillRect(x - 10 * s, y - 14 * s, 330 * s, lines.length * step + 12 * s);
  lines.forEach(([str, style], i) => text(ctx, str, x, y + i * step, (style === 'title' ? 14 : 11) * s, COLORS[style], { align: 'left', shadow: null }));
}
