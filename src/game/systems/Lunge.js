// A melee swing of the player's drawn to the guard in front of him (PLAYER.lunge in Config.js): the aim turns a
// little onto him and the player closes in a step; onto the man the LOCK aim cue holds, it turns all the way and the
// step is longer. Rules only, DOM-free, unit-tested; Player.startLunge applies it.
import { angDiff, clamp } from '../../engine/math.js';

// a man a swing can be drawn to: alive, on his feet, not in someone's hands
const standing = (e) => e.alive && !(e.knocked > 0) && !e.held;

// p: the player { x, y, radius }; d: the weapon definition in hand (fists included); aim: rad; cfg: PLAYER.lunge;
// sees(e): a line from the player to e; solid(x, y): a wall there; lock: the man LOCK holds (systems/AimCue.js
// lockTarget) or null.
// The man LOCK holds, standing, in sight, within the weapon's reach + cfg.lock.margin px -> { target, a (the way to
// him, whole), dir, push (at most cfg.lock.push), lock: true }. Otherwise the nearest guard standing within the
// weapon's reach + cfg.extra px and cfg.cone rad of the aim, in sight -> { target, a (the aim turned at most cfg.turn
// rad onto him), dir (the way to him), push (px to close in: at most cfg.push) }; null: a gun, or nobody.
// A push stops cfg.gap short of contact and short of any wall; nobody is closed in on with a guard already at contact range.
export function lungeTarget(p, d, enemies, aim, cfg, sees, solid, lock = null) {
  if (!d || d.kind === 'gun') return null;
  let best = null, bd = Infinity, close = false;
  for (const e of enemies) {
    if (!standing(e)) continue;
    const dx = e.x - p.x, dy = e.y - p.y, dd = Math.hypot(dx, dy);
    if (dd <= p.radius + e.radius + cfg.gap) close = true;
    if (dd >= bd || dd > d.range + e.radius + cfg.extra) continue;
    if (Math.abs(angDiff(aim, Math.atan2(dy, dx))) > cfg.cone || !sees(e)) continue;
    best = e; bd = dd;
  }
  const step = (e, dd, most) => close ? 0 : clamp(dd - (p.radius + e.radius + cfg.gap), 0, most);
  if (lock && standing(lock) && sees(lock)) {
    const ld = Math.hypot(lock.x - p.x, lock.y - p.y);
    if (ld <= d.range + lock.radius + cfg.lock.margin) {
      const dir = Math.atan2(lock.y - p.y, lock.x - p.x);
      return { target: lock, a: dir, dir, push: clear(p, dir, step(lock, ld, cfg.lock.push), solid), lock: true };
    }
  }
  if (!best) return null;
  const dir = Math.atan2(best.y - p.y, best.x - p.x);
  const a = aim + clamp(angDiff(aim, dir), -cfg.turn, cfg.turn);
  return { target: best, a, dir, push: clear(p, dir, step(best, bd, cfg.push), solid) };
}

// how far (px) the body can go along `dir`, up to `want`, before its front or shoulders meet a wall
function clear(p, dir, want, solid) {
  const r = p.radius;
  let go = 0;
  for (let s = Math.min(1, want); go < want; s = Math.min(s + 1, want)) {
    const x = p.x + Math.cos(dir) * s, y = p.y + Math.sin(dir) * s;
    if ([0, 0.7, -0.7].some((o) => solid(x + Math.cos(dir + o) * r, y + Math.sin(dir + o) * r))) break;
    go = s;
  }
  return go;
}
