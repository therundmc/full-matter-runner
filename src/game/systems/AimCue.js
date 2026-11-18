// What the aim cue has to tell (data/aim.js; render/AimArt.js paints it): where the weapon in his hand points from,
// which way, how wide it throws, what stops the line and whether that is a man; at the wheel, his gun's line out of
// the car and whether it is in its arc (systems/CarGun.js). And the LOCK concept's man: the one nearest the aim line,
// in sight. DOM-free: it reads the world, changes nothing.
import { AIM } from '../data/aim.js';
import { angDiff } from '../../engine/math.js';

// is the player in a state where an aim means something
const aiming = (p) => !!p && p.alive && !p.vaulting && !p.passage && !(p.knocked > 0) && !p.rising;

// The line of fire from (x, y) along a: { len, hit, target }: how far it goes (AIM.reach at most), whether something
// stops it, and the living man it ends on (null: a wall, a thing, nothing). `skip`: what it never hits (himself, his car).
export function lineOfFire(world, team, x, y, a, skip, reach = AIM.reach) {
  const x1 = x + Math.cos(a) * reach, y1 = y + Math.sin(a) * reach, ignore = new Set(skip);
  for (let i = 0; i < 6; i++) {
    const h = world.traceBullet(x, y, x1, y1, team, ignore);
    if (!h) break;
    if (!AIM.clear.includes(h.kind)) return { len: h.t * reach, hit: true, target: h.kind === 'char' ? h.target : null };
    ignore.add(h.target);
  }
  return { len: reach, hit: false, target: null };
}

// The cue of this frame, or null when there is none to show (dead, down, vaulting, at the wheel with no gun out):
//   { x, y, a, kind: 'gun' | 'melee', half, len, hit, target, off, skip, team }
// x, y, a: the muzzle (the front of his body with a blade or his fists) and the way it points; half: rad of spread
// either side (half a blade's swing); len: px to what stops the line (a blade: its reach); off: the car gun cannot
// point there.
export function aimCue(world) {
  const p = world.player;
  if (!aiming(p)) return null;
  const d = p.def, drive = world.drive?.on ? world.drive : null;
  if (drive) {
    const g = drive.gun;
    if (!g?.aimed) return null;
    const a = g.aimed.a, off = !g.aimed.ok, o = off ? g.root() : g.hand(a), skip = [p, g.van];
    if (off) return { x: o.x, y: o.y, a, kind: 'gun', half: 0, len: AIM.offArc.len, hit: false, target: null, off, skip, team: p.team };
    return { x: o.x, y: o.y, a, kind: 'gun', half: d.spread || 0, ...lineOfFire(world, p.team, o.x, o.y, a, skip), off, skip, team: p.team };
  }
  if (p.riding || p.hidden) return null; // sat in a car that is not his drive, or out of the picture
  const a = p.angle, skip = [p];
  if (d.kind !== 'gun') {
    const x = p.x + Math.cos(a) * p.radius, y = p.y + Math.sin(a) * p.radius;
    return { x, y, a, kind: 'melee', half: (d.arc || 1) / 2, len: Math.max(4, d.range - p.radius + AIM.melee), hit: false, target: null, off: false, skip, team: p.team };
  }
  const m = p.muzzlePos();
  // a wall between him and his muzzle (the gun poking into it): the line dies there
  if (!world.lineOfSight(p.x, p.y, m.x, m.y)) return { x: m.x, y: m.y, a, kind: 'gun', half: d.spread || 0, len: 0, hit: true, target: null, off: false, skip, team: p.team };
  return { x: m.x, y: m.y, a, kind: 'gun', half: d.spread || 0, ...lineOfFire(world, p.team, m.x, m.y, a, skip), off: false, skip, team: p.team };
}

// The man the LOCK concept brackets: the living enemy nearest the way `a` out of (x, y), within `cone` rad of it and
// `reach` px, in plain sight (walls, smoke, curtains hide him). null when there is none. A man further off the line
// loses to one nearer it; of two on the same line, the closer one.
export function lockTarget(world, team, x, y, a, cone = AIM.lock.cone, reach = AIM.lock.reach) {
  let best = null, score = Infinity;
  for (const c of world.chars) {
    if (!c.alive || c.team === team || c.hidden) continue;
    const dx = c.x - x, dy = c.y - y, dist = Math.hypot(dx, dy);
    if (dist > reach || dist < 1) continue;
    const off = Math.abs(angDiff(a, Math.atan2(dy, dx)));
    if (off > cone) continue;
    const s = off + dist / reach * 0.05;
    if (s >= score || !world.sightLine(x, y, c.x, c.y)) continue;
    best = c; score = s;
  }
  return best;
}

// The gamepad's soft assist (LOCK only, Game.padAim): the way the right stick points, bent onto the man lockTarget
// finds within AIM.lock.assist of it. Returns { x, y } to aim at (his chest), or null: the stick's own way stands.
export function assistAim(world, angle) {
  const p = world.player;
  if (!aiming(p) || p.def.kind !== 'gun' || world.drive?.on) return null;
  const c = lockTarget(world, p.team, p.x, p.y, angle, AIM.lock.assist);
  return c ? { x: c.x, y: c.y } : null;
}
