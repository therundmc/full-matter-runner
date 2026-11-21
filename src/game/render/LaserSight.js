// Laser sight of the weapons that have one (weapon `laser` = its colour): a thin beam from the muzzle to the first
// solid thing in the line of fire and a dot on it, drawn over the lighting so that it glows in the dark.
// The player's is on whenever the gun is ready; a guard's only once he is on his target (it gives him away).
import { WEAPONS } from '../data/weapons.js';

const REACH = 1400;                          // px
const CLEAR = ['glass', 'item', 'debris', 'overhead'];   // what the beam goes through or over (a billboard's face)

// colour of the beam `ch` is pointing right now, or null
export function laserOf(ch) {
  if (!ch.alive || !ch.weapon || ch.reloading > 0 || ch.knocked > 0 || ch.vaulting) return null;
  if (!ch.isPlayer && ch.aware !== 2) return null;
  return WEAPONS[ch.weapon.type].laser ?? null;
}

// { x0, y0, x1, y1, hit }: the beam of `ch`, from his muzzle to what stops it (hit = false: lost in the distance)
export function laserBeam(world, ch) {
  const m = ch.muzzlePos(), a = ch.angle;
  const x1 = m.x + Math.cos(a) * REACH, y1 = m.y + Math.sin(a) * REACH;
  const skip = new Set([ch]);
  // a wall between the body and the muzzle (gun poking into it): the beam dies there
  if (!world.lineOfSight(ch.x, ch.y, m.x, m.y)) return { x0: m.x, y0: m.y, x1: m.x, y1: m.y, hit: true };
  for (let i = 0; i < 6; i++) {
    const h = world.traceBullet(m.x, m.y, x1, y1, null, skip);
    if (!h) break;
    if (!CLEAR.includes(h.kind)) return { x0: m.x, y0: m.y, x1: h.x, y1: h.y, hit: true };
    skip.add(h.target);
  }
  return { x0: m.x, y0: m.y, x1, y1, hit: false };
}

export function drawLasers(ctx, world) {
  for (const ch of world.chars) {
    const color = laserOf(ch);
    if (!color) continue;
    const b = laserBeam(world, ch);
    const k = 0.8 + 0.2 * Math.sin(world.time * 47 + ch.x); // the diode shimmers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = ctx.fillStyle = color;
    for (const [width, alpha] of [[3.5, 0.1], [1, 0.7]]) {
      ctx.globalAlpha = alpha * k;
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
    }
    if (b.hit) {
      ctx.globalAlpha = 0.3 * k; ctx.fillRect(b.x1 - 3.5, b.y1 - 3.5, 7, 7);
      ctx.globalAlpha = 1; ctx.fillRect(b.x1 - 1.5, b.y1 - 1.5, 3, 3);
    }
    ctx.restore();
  }
}
