// The human shield: the rules only (DOM-free, unit-tested). The hold itself is the player's (entities/Player.js
// startShield .. endShield), the numbers SHIELD in data/feel.js.
import { TAKEDOWN, BODY_SCALE } from '../Config.js';
import { SHIELD } from '../data/feel.js';
import { angDiff } from '../../engine/math.js';
import { behind } from './Takedown.js';

// Whether guard `e` can be taken as a shield by `p` (who has a hand for it: data/weapons.js oneHanded): a standing man,
// from behind him only (the takedown's arc, SHIELD.reach); never one who is down, a boss, a man giving up, one already
// held or being finished.
export function offers(p, e, S = SHIELD, T = TAKEDOWN) {
  if (!e.alive || !e.isEnemy || e.boss || e.traits || e.held || e.executing || e.vaulting || e.yielded || e.offstage || e.knocked > 0) return false;
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

// A dead hostage's feet trail after him (sh.drag: each foot's place off his centre, world px): left behind by the way
// he was moved this step (dx, dy), they come back toward where they hang in front of him (SHIELD.pose.limp.feet, along
// a) at SHIELD.drag[0] a second, never further off than SHIELD.drag[1] pose px. scale: world px per pose px.
export function dragFeet(sh, dx, dy, a, dt, scale = BODY_SCALE, S = SHIELD) {
  const c = Math.cos(a), s = Math.sin(a), k = 1 - Math.exp(-dt * S.drag[0]), max = S.drag[1] * scale;
  const rest = S.pose.limp.feet.map(([lx, ly]) => ({ x: (lx * c - ly * s) * scale, y: (lx * s + ly * c) * scale }));
  sh.drag ??= rest.map((r) => ({ ...r }));
  sh.drag.forEach((f, i) => {
    f.x += (rest[i].x - (f.x - dx)) * k - dx; f.y += (rest[i].y - (f.y - dy)) * k - dy;
    const d = Math.hypot(f.x, f.y);
    if (d > max) { f.x *= max / d; f.y *= max / d; }
  });
  return sh.drag;
}
