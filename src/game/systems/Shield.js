// The human shield: the rules only (DOM-free, unit-tested). The hold itself is the player's (entities/Player.js
// startShield .. endShield), the numbers SHIELD in data/feel.js.
import { TAKEDOWN } from '../Config.js';
import { SHIELD } from '../data/feel.js';
import { angDiff } from '../../engine/math.js';
import { behind } from './Takedown.js';

// Whether guard `e` can be taken as a shield by `p` (who has a hand for it: data/weapons.js oneHanded): never a boss, a man giving up, one already held or being
// finished; standing, from behind him (the takedown's arc, SHIELD.reach); down, from wherever, turned to him.
export function offers(p, e, S = SHIELD, T = TAKEDOWN) {
  if (!e.alive || !e.isEnemy || e.boss || e.traits || e.held || e.executing || e.vaulting || e.yielded || e.offstage) return false;
  if (e.knocked > 0) {
    const dx = e.x - p.x, dy = e.y - p.y;
    return Math.hypot(dx, dy) <= S.reach && Math.abs(angDiff(p.angle, Math.atan2(dy, dx))) <= T.facing;
  }
  return behind(p, e, { ...T, reach: S.reach });
}

// Whether something flying along `a` at a holder facing `facing` comes at him from the front arc, where the hostage is
export const covers = (facing, a, S = SHIELD) => Math.abs(angDiff(facing, a + Math.PI)) <= S.arc;

// s a guard of that kind holds his fire at a comrade held
export const hesitation = (kind, S = SHIELD) => (kind === 'brute' ? S.brute : S.hesitate);

// A guard with a blade or a club coming at a man who holds a shield: the side he goes round by (1: to the holder's
// right, -1: to his left; `tie`: the side taken dead ahead), 0 when he is out of the arc or of the range for it
export function flankSide(p, g, tie = 1, S = SHIELD) {
  const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
  if (d < S.flank.near || d > S.flank.far) return 0;
  const off = angDiff(p.angle, Math.atan2(dy, dx));
  if (Math.abs(off) > S.arc) return 0;
  return Math.abs(off) < 0.05 ? tie : Math.sign(off);
}

// The standing men a thrown hostage `flyer` runs into this step (within r px of him)
export function bodyHits(flyer, enemies, r = SHIELD.throw.hit.r) {
  return enemies.filter((e) => e !== flyer && e.alive && !(e.knocked > 0) && !e.held && !e.vaulting && !e.offstage
    && Math.hypot(e.x - flyer.x, e.y - flyer.y) <= r);
}
