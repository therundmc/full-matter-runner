// Stealth kill from behind: the rule only (DOM-free). The move itself is played by Player.updateTakedown.
import { TAKEDOWN } from '../Config.js';
import { angDiff } from '../../engine/math.js';

// Whether `p` stands right behind the standing guard `e`, facing his back, close enough to seize him.
export function behind(p, e, T = TAKEDOWN) {
  if (!e.alive || e.knocked > 0 || e.vaulting || e.held) return false;
  const dx = e.x - p.x, dy = e.y - p.y;
  if (Math.hypot(dx, dy) > T.reach) return false;
  const a = Math.atan2(dy, dx);
  return Math.abs(angDiff(p.angle, a)) <= T.facing && Math.abs(angDiff(e.angle, a)) <= T.rear;
}
