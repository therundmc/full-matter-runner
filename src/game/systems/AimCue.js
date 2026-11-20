// What the aim cue has to tell (data/aim.js; render/AimArt.js paints it): where the weapon in his hand points from,
// which way, how wide it throws, what stops the line and whether that is a man; at the wheel, his gun's line out of
// the car and whether it is in its arc (systems/CarGun.js). And LOCK's man: the one nearest the aim line,
// in sight; with a melee weapon, wide at close range (meleeLock). DOM-free: it reads the world, changes nothing.
import { AIM } from '../data/aim.js';
import { PLAYER } from '../Config.js';
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
//   { x, y, a, kind: 'gun' | 'melee', len, hit, target, off, skip, team }
// x, y, a: the muzzle (the front of his body with a blade or his fists) and the way it points; len: px to what stops
// the line (a blade: its reach); off: the car gun cannot point there.
export function aimCue(world) {
  const p = world.player;
  if (!aiming(p)) return null;
  const d = p.def, drive = world.drive?.on ? world.drive : null;
  if (drive) {
    const g = drive.gun;
    if (!g?.aimed) return null;
    // (in its arc, from the muzzle where it is seen: CarGun.drawnMuzzle)
    const a = g.aimed.a, off = !g.aimed.ok, o = off ? g.root() : g.drawnMuzzle?.() ?? g.hand(a), skip = [p, g.van];
    if (off) return { x: o.x, y: o.y, a, kind: 'gun', len: AIM.offArc.len, hit: false, target: null, off, skip, team: p.team };
    return { x: o.x, y: o.y, a, kind: 'gun', ...lineOfFire(world, p.team, o.x, o.y, a, skip), off, skip, team: p.team };
  }
  if (p.riding || p.hidden) return null; // sat in a car that is not his drive, or out of the picture
  const a = p.angle, skip = p.shield ? [p, p.shield.target] : [p]; // (never the man he holds as a shield)
  if (d.kind !== 'gun') {
    const x = p.x + Math.cos(a) * p.radius, y = p.y + Math.sin(a) * p.radius;
    return { x, y, a, kind: 'melee', len: Math.max(4, d.range - p.radius + AIM.melee), hit: false, target: null, off: false, skip, team: p.team };
  }
  const m = p.muzzlePos();
  // a wall between him and his muzzle (the gun poking into it): the line dies there
  if (!world.lineOfSight(p.x, p.y, m.x, m.y)) return { x: m.x, y: m.y, a, kind: 'gun', len: 0, hit: true, target: null, off: false, skip, team: p.team };
  return { x: m.x, y: m.y, a, kind: 'gun', ...lineOfFire(world, p.team, m.x, m.y, a, skip), off: false, skip, team: p.team };
}

// The throw he is winding up (Player.throwHold), or null: { x, y, a, k, len, hit, target, lock } from his hand along
// the way it will go (onto LOCK's man: Player.throwAim), k: its charge 0..1, len: px to where it stops (AIM.throw.reach,
// longer with the charge) or to what it meets, target: the man it meets, lock: the man LOCK draws it onto
export function throwCue(world) {
  const p = world.player;
  if (!aiming(p) || !p.throwHold || !(p.armed || p.shield) || p.riding || p.hidden) return null;
  const { a, lock } = p.throwAim(), k = p.throwCharge(), R = AIM.throw.reach, x = p.x + Math.cos(a) * p.radius, y = p.y + Math.sin(a) * p.radius;
  const f = lineOfFire(world, p.team, x, y, a, p.shield ? [p, p.shield.target] : [p], R[0] + (R[1] - R[0]) * k); // (a man held is what is thrown)
  return { x, y, a, k, ...f, lock };
}

// The man LOCK marks: the living enemy (a guard: never a bystander) nearest the way `a` out of (x, y),
// within `cone` rad of it and `reach` px, in plain sight (walls, smoke, curtains hide him). null when there is none. A
// man further off the line loses to one nearer it; of two on the same line, the closer one.
export function lockTarget(world, team, x, y, a, cone = AIM.lock.cone, reach = AIM.lock.reach) {
  let best = null, score = Infinity;
  for (const c of world.chars) {
    if (!c.alive || c.isCivilian || c.team === team || c.hidden) continue;
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

// LOCK's man with a melee weapon (fists included) in p's hand d, aiming `aim` (the mouse's or the stick's way, not his
// drawn facing): { man, close } or null (a gun, nobody). Close: a guard (never a bystander: he
// would wheel round onto every patron, nor one on his knees) standing within the weapon's reach + his radius +
// PLAYER.lunge.lock.margin px and AIM.lock.wide rad of the aim, in sight; of several, the one nearest the aim line,
// then the nearest. Else lockTarget's man within AIM.lock.cone and AIM.lock.melee px (close: false). The one place it
// is decided: AimArt marks him, Player turns onto the close one and Player.startLunge swings at him.
export function meleeLock(world, p, d, aim) {
  if (!d || d.kind === 'gun') return null;
  const L = AIM.lock, margin = PLAYER.lunge.lock.margin;
  let best = null, score = Infinity;
  for (const c of world.enemies) {
    if (!c.alive || c.hidden || c.knocked > 0 || c.held || c.yielded) continue;
    const dx = c.x - p.x, dy = c.y - p.y, dist = Math.hypot(dx, dy);
    if (dist > d.range + c.radius + margin || dist < 1) continue;
    const off = Math.abs(angDiff(aim, Math.atan2(dy, dx)));
    if (off > L.wide) continue;
    const s = off + dist / L.melee * 0.05;
    if (s >= score || !world.sightLine(p.x, p.y, c.x, c.y)) continue;
    best = c; score = s;
  }
  if (best) return { man: best, close: true };
  const man = lockTarget(world, p.team, p.x, p.y, aim, L.cone, L.melee);
  return man ? { man, close: false } : null;
}

// The gamepad's soft assist (LOCK only, Game.padAim): the way the right stick points, bent onto the man lockTarget
// finds within AIM.lock.assist of it. Returns { x, y } to aim at (his chest), or null: the stick's own way stands.
export function assistAim(world, angle) {
  const p = world.player;
  if (!aiming(p) || p.def.kind !== 'gun' || world.drive?.on) return null;
  const c = lockTarget(world, p.team, p.x, p.y, angle, AIM.lock.assist);
  return c ? { x: c.x, y: c.y } : null;
}
