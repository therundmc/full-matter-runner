// A guard's weapon: the one kept somewhere until the fight (level `arms`), fetched; one picked up off the floor;
// running to a friend when he has none. Functions of the guard (`me`), DOM-free.
import { ENEMY, AI, TILE } from '../../Config.js';
import { rand } from '../../../engine/math.js';
import { findPath } from '../../../engine/nav/Pathfinding.js';
import { S } from './States.js';

// the weapon kept at `at` { x, y } px: the one lying or leaning nearest it, within a tile and a half (null: taken)
export function keptAt(items, at) {
  let best = null, bd = TILE * 1.5;
  for (const it of items) {
    const d = it.dead ? Infinity : Math.hypot(it.x - at.x, it.y - at.y);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

// what a guard hears that tells him it has come to a fight (see armsDue)
const FIGHT = new Set(['gunshot', 'explosion', 'allyFire']);

// level `arms` (by his tile): 'fists', a brawler who never picks a weapon up; or [col, row], where his own weapon is
// kept (the weapon lying or leaning nearest that point): he starts bare-handed and runs for it once the fight is on
export function takeArms(me, a) {
  if (!a) return;
  me.setWeapon(null);
  me.arms = a === 'fists' ? { fists: true } : { at: { x: a[0] * TILE, y: a[1] * TILE }, done: false };
}

// his weapon is kept somewhere, he has none in hand, and it has come to a fight (he is after the player, shots or a
// blast have him on his way to see, or the house is up in arms and he is out looking); not while he keeps his head
// down behind a counter, nor with the player on top of him: his fists then
export function armsDue(me) {
  const a = me.arms;
  if (!a || a.fists || a.done || me.weapon || me.duckT > 0) return false;
  if (me.state === S.FETCH || me.state === S.CHALLENGE || me.state === S.BACKUP) return false;
  const shots = me.aware === 1 && me.urgent && FIGHT.has(me.stim?.kind);
  if (!(me.aware === 2 || shots || (me.state === S.SEARCH && me.director.phase === 'alert'))) return false;
  const p = me.world.player;
  return !(me.sees && Math.hypot(p.x - me.x, p.y - me.y) < AI.arms.close);
}

// off at a run for his own weapon; gone (the player took it), or no way to it: what there is at hand, or his fists
export function armUp(me) {
  const a = me.arms;
  a.done = true;
  const it = keptAt(me.world.items, a.at);
  if (!it || !findPath(me.world.map, me.x, me.y, it.x, it.y)) { if (!me.lookForWeapon() && me.state !== S.COMBAT && me.lastKnown) me.setState(S.COMBAT); return; }
  const went = me.lastKnown ? null : me.stim; // (on his way to see about shots: he goes on there, armed)
  me.setState(S.FETCH);
  me.fetchTarget = it;
  a.then = went && { ...went };
  me.react = 0.15;
  me.say('arm');
}

// nearest loaded gun / melee weapon on the floor within reach
export function lookForWeapon(me) {
  if (me.arms?.fists) return false;
  let best = null, bd = 260;
  for (const it of me.world.items) {
    if (it.dead || it.speed > 2 || (it.def.kind === 'gun' && it.mag <= 0)) continue;
    const d = Math.hypot(it.x - me.x, it.y - me.y);
    if (d < bd) { bd = d; best = it; }
  }
  if (!best || !me.director.budget(1) || !findPath(me.world.map, me.x, me.y, best.x, best.y)) return false;
  me.setState(S.FETCH);
  me.fetchTarget = best;
  return true;
}

export function doFetch(me, dt) {
  if (!me.turncoat && me.loseNerve(dt)) return;
  const it = me.fetchTarget;
  // gone from under his nose, or out of reach: on with what he has (in a fight), else a look round
  if (!it || it.dead || me.t > AI.arms.giveUp) {
    if (me.lastKnown && me.aware === 2) { me.setState(S.COMBAT); me.thinkT = 0; } else me.beginLocalSearch(me.x, me.y, 2);
    return;
  }
  if (Math.hypot(it.x - me.x, it.y - me.y) < 14) {
    me.setWeapon(it.type, it.mag, it.def.shellReload ? 6 : 1);
    me.weapon.bare = !!it.bare;
    me.world.removeItem(it);
    me.world.sound('pickup', me.x, me.y, 0.5);
    me.pickAnim = 0.35;
    if (me.turncoat) { me.turncoat = false; me.barkT = 0; me.say('turn'); }
    const then = me.arms?.then;
    if (me.arms) me.arms.then = null;
    if (me.lastKnown) { me.setState(S.COMBAT); me.thinkT = 0; me.react = Math.max(me.react, 0.3); }
    else if (then) { me.setState(S.SUSPICIOUS); me.investigate(then.x, then.y, then.kind, true); }
    else me.beginLocalSearch(me.x, me.y, 2);
    return;
  }
  me.travel(dt, it.x, it.y, ENEMY.runSpeed, { near: 0 });
}

// unarmed and nothing to pick up: run to the nearest armed mate and send him in
export function fleeToFriend(me) {
  if (me.kind === 'brute') return false; // brutes charge with their fists
  let best = null, bd = 600;
  for (const e of me.world.enemies) {
    if (e === me || !e.alive || e.knocked > 0 || e.def.kind !== 'gun') continue;
    const d = Math.hypot(e.x - me.x, e.y - me.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return false;
  me.setState(S.FLEE);
  me.friend = best;
  me.say('help', { N: me.director.nickOf(best) });
  return true;
}

export function doFlee(me, dt) {
  if (me.loseNerve(dt)) return;
  const f = me.friend, lk = me.lastKnown;
  if (!f || !f.alive) { me.setState(S.COMBAT); return; }
  if (me.t > 1.5 && me.lookForWeapon()) return;
  if (me.travel(dt, f.x, f.y, ENEMY.runSpeed, { near: 40 })) {
    if (lk) f.joinHunt(lk.x, lk.y);
    me.setState(S.GUARD);
    me.guardPt = lk || { x: f.x, y: f.y };
    me.guardT = rand(6, 10);
  }
}
