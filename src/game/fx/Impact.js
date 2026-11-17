// What a blow or a round that lands on a man does beyond the wound: the 'blow' event (the post-processing pass and
// anything else listen to it), the hit-stop, shake and camera kick when the player dealt it, the victim's white
// flash and the star where it struck. Every number comes from data/feel.js. DOM-free.
import { FEEL, HEAVY, MOMENTS, familyOf } from '../data/feel.js';
import { combatFx } from './CombatFx.js';

// 'blow' payload: { x, y, angle, power 0..1, kind 'punch' | 'blunt' | 'cut' | 'bullet' | 'finisher', lethal, byPlayer }
function emit(world, x, y, angle, power, kind, lethal, byPlayer) {
  world.events.emit('blow', { x, y, angle, power: Math.min(1, power), kind, lethal: !!lethal, byPlayer: !!byPlayer });
}

// the screen takes it: hit-stop (s), shake (trauma), a kick of the camera along the blow (px)
export function jolt(world, angle, stop, shake, push) {
  if (stop) world.hitstop(stop);
  if (shake) world.shake(shake);
  if (push) world.camera.push(Math.cos(angle) * push, Math.sin(angle) * push);
}

// A blow of weapon `d` (a definition; null: bare hands) or one of its rounds lands on `victim` at (x, y), going along
// `angle`. o: { lethal, byPlayer, heavy (the heavy stroke), share (of the power: a few pellets from afar) }
export function landBlow(world, victim, x, y, angle, d, o) {
  const f = FEEL[familyOf(d)], i = o.lethal ? 1 : 0, h = !!o.heavy;
  emit(world, x, y, angle, f.power[i] * (o.share ?? 1) + (h ? HEAVY.power : 0), f.kind, o.lethal, o.byPlayer);
  if (o.byPlayer) jolt(world, angle, f.stop[i] * (h ? HEAVY.stop : 1), f.shake[i] * (h ? HEAVY.shake : 1), f.push[i]);
  const fx = combatFx(world);
  fx.flash(victim, angle, f, o.lethal);
  fx.burst(x, y, angle, f.burst, h ? 1.35 : o.share ?? 1);
}

// A moment of the player's that is not a plain blow (MOMENTS: a finisher's beat, a takedown, a slide) lands on
// `victim` with weapon `d`: its own power, kind (or the weapon's), hit-stop, shake and push; the weapon's look.
export function landMoment(world, victim, angle, d, m, lethal) {
  const f = FEEL[familyOf(d)];
  emit(world, victim.x, victim.y, angle, m.power, m.kind || f.kind, lethal, true);
  jolt(world, angle, m.stop, m.shake, m.push);
  const fx = combatFx(world);
  fx.flash(victim, angle, f, lethal);
  fx.burst(victim.x - Math.cos(angle) * 4, victim.y - Math.sin(angle) * 4, angle, f.burst, 1.2);
}

// Of the guards still in the fight, is none left in the player's sight within `radius` once `victim` is down?
// sees(e): whether the player has a line to e
export function lastInSight(player, victim, enemies, radius, sees) {
  for (const e of enemies) {
    if (e === victim || !e.alive || e.yielded) continue;
    if (Math.hypot(e.x - player.x, e.y - player.y) < radius && sees(e)) return false;
  }
  return true;
}

// the player has just put down the last guard in sight after a real fight, others still about the level: a breath
// of slow motion (the last one of all has its own, World.checkCleared)
export function killBeat(world, victim, killer) {
  const R = MOMENTS.lastInRoom, p = world.player;
  if (!killer?.isPlayer || !victim.isEnemy || world.cleared || world.scoring.combo < R.chain) return false;
  if (!lastInSight(p, victim, world.enemies, R.radius, (e) => world.lineOfSight(p.x, p.y, e.x, e.y))) return false;
  slowAtLeast(world, ...R.slowmo);
  return true;
}

// Is a slow motion (scale, dur s) weaker than the one running (Game.slow: { scale, t s left })? Measured by the time it
// takes away: (1 - scale) x seconds.
export const weakerSlow = (cur, scale, dur) => !!cur && (1 - cur.scale) * cur.t > (1 - scale) * dur;

// slow motion that never cuts short a stronger one already running (a multi-kill and the last guard in sight, the
// same instant: the stronger stays)
function slowAtLeast(world, scale, dur) {
  if (weakerSlow(world.game?.slow, scale, dur)) return false;
  world.slowmo(scale, dur);
  return true;
}

// several kills in a breath (Scoring's 'multiKill'): MOMENTS.multi of its tag. World, once.
export function listenMoments(world) {
  world.events.on('multiKill', ({ tag }) => {
    const m = MOMENTS.multi[tag];
    if (!m) return;
    slowAtLeast(world, ...m.slowmo);
    if (m.stop) world.hitstop(m.stop);
  });
}
