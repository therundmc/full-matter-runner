// The player's feet on a standing guard (rules only, DOM-free, unit-tested): the kick out of a slide's end
// (PLAYER.slide.kick, Player.startKick) and the legs coming off a car's hood (TRAVERSE.vault.hip.strike,
// Player.vaultStrike). Both floor him (Enemy.knock) and throw him back along the blow.
import { angDiff } from '../../engine/math.js';

// a man on his feet and free: not down, held, on his knees, being finished, vaulting or dead
export const standing = (e) => !!e && e.alive && !(e.knocked > 0) && !e.held && !e.yielded && !e.executing && !e.vaulting;

// may the slide kick now? k: progress of the slide under way (null once it is over), since: s since it ended;
// stalled: it has just been stopped short (by him)
export function kickReady(k, since, cfg, stalled = false) {
  return k === null ? since <= cfg.late : stalled || k >= cfg.from;
}

// the guard a kick from (x, y) along `angle` lands on: the nearest standing one within cfg.range px and cfg.cone rad
// of the way, that sees(e) allows (a line to him); null when there is none
export function kickTarget(x, y, angle, enemies, cfg, sees = () => true) {
  let best = null, bd = cfg.range;
  for (const e of enemies) {
    if (!standing(e)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > bd || Math.abs(angDiff(angle, Math.atan2(e.y - y, e.x - x))) > cfg.cone || !sees(e)) continue;
    bd = d; best = e;
  }
  return best;
}

// distance (px) from (px, py) to the segment (x0, y0) - (x1, y1)
function toSegment(px, py, x0, y0, x1, y1) {
  const ex = x1 - x0, ey = y1 - y0, l2 = ex * ex + ey * ey;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x0) * ex + (py - y0) * ey) / l2)) : 0;
  return Math.hypot(px - x0 - ex * t, py - y0 - ey * t);
}

// the standing guard in the way of a move from `from` to `to`: his body within `reach` px of its line, past its start;
// the nearest to the start, or null
export function inPath(from, to, enemies, reach) {
  const dx = to.x - from.x, dy = to.y - from.y;
  let best = null, bd = Infinity;
  for (const e of enemies) {
    if (!standing(e) || (e.x - from.x) * dx + (e.y - from.y) * dy <= 0) continue;
    if (toSegment(e.x, e.y, from.x, from.y, to.x, to.y) > reach) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// px per step to throw a man `dist` px along the floor, his slide losing `brake` of its speed each step after the
// first (Enemy.updateKnocked): dist = v (1 - brake) / brake
export const throwSpeed = (dist, brake) => (dist * brake) / (1 - brake);
