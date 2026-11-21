// A guard's nerve (ai/Squad.js the odds): giving up on his knees and getting up for a gun once the player turns
// his back, calling out for the others, running to fetch them. Functions of the guard (`me`), DOM-free.
import { ENEMY, AI } from '../../Config.js';
import { rand, chance } from '../../../engine/math.js';
import { backupOdds, backupGroup, recruits, yieldOdds, turnedAway, gunAtHand } from '../../ai/Squad.js';
import { S } from './States.js';

// The last man standing gives up: weapon thrown down, on his knees, hands up. He is out of the fight for good
// (the world counts him out: 'surrender' clears the level) and it is the player's call to kill him anyway.
export function surrender(me) {
  me.reloading = 0;
  me.dropWeapon(me.angle + rand(-0.5, 0.5), 2.5);
  me.setState(S.YIELD);
  me.yielded = true;
  me.shaken = false;
  me.sees = false;
  me.begT = rand(...AI.surrender.beg);
  me.barkT = 0;
  me.say('yield');
  me.world.sound('whimper', me.x, me.y, 1, { pitch: me.voice });
  me.world.events.emit('surrender', { who: me });
}

// gives up on the spot: the last man standing who was shaken, or (ai/Squad.js yieldOdds, a roll every few s) a
// man on his own with no weapon or no rounds left, the armed player close in front of him. True if he did.
export function loseNerve(me, dt) {
  const p = me.world.player, R = AI.surrender;
  if (!me.sees || !p.armed || me.world.tutorial) return false; // nobody gives up in the lesson
  const dist = Math.hypot(p.x - me.x, p.y - me.y);
  if (me.shaken && dist < R.range) { me.surrender(); return true; }
  if ((me.nerveT -= dt) > 0) return false;
  me.nerveT = R.every;
  const w = me.weapon, dry = !!w && me.def.kind === 'gun' && w.mag <= 0 && me.reloading <= 0 && me.reserveCount() <= 0;
  const odds = yieldOdds(me.kind, {
    unarmed: !w || dry, alone: !me.director.engagedNear(me, R.alone), playerArmed: p.armed, dist, boss: me.boss,
  });
  if (!chance(odds)) return false;
  me.surrender();
  return true;
}

// On his knees: he begs while the player stands over him. Once the player has had his back to him a moment, and
// a loaded gun lies at hand, he may get up and go for it (ai/Squad.js; never once the level is cleared).
export function updateYield(me, dt) {
  const p = me.world.player, w = me.world, R = AI.surrender;
  me.halt();
  me.crouch = Math.min(1, me.crouch + dt * 5);
  if (!p.alive) return;
  const dx = p.x - me.x, dy = p.y - me.y, d = Math.hypot(dx, dy);
  const seen = d <= ENEMY.viewDist && w.lineOfSight(me.x, me.y, p.x, p.y);
  if (!w.cleared && !w.tutorial) {
    me.turnT = turnedAway(p, me, seen) ? me.turnT + dt : 0;
    if (me.turnT > R.wait && (me.nerveT -= dt) <= 0) {
      me.nerveT = 1;
      const gun = chance(R.treachery[me.kind] ?? 0) && gunAtHand(w.items, me);
      if (gun) { betray(me, gun); return; }
    }
  }
  if (!seen) return;
  me.faceAngle(Math.atan2(dy, dx), 4, dt);
  if (d < AI.surrender.range && (me.begT -= dt) <= 0) {
    me.begT = rand(...AI.surrender.beg);
    me.barkT = 0;
    if (me.say('beg')) me.world.sound('whimper', me.x, me.y, 0.8, { pitch: me.voice });
  }
}

// up off his knees, quiet, for the gun lying at hand; back in the fight (and counted again) once he is up
function betray(me, gun) {
  const p = me.world.player;
  me.yielded = false;
  me.turncoat = true;
  me.setState(S.FETCH);
  me.fetchTarget = gun;
  me.lastKnown = { x: p.x, y: p.y };
  me.react = 0.4;
}

// "contact!" a moment after spotting him: the squad around is sent in (a mate called by name), then, if that left
// him on his own or outgunned, he may run for the others instead (true: he is off)
export function callOut(me) {
  const sent = me.director.shout(me);
  me.barkT = 0; // the call cuts short whatever he was saying
  if (!(sent.length && chance(0.6) && me.say('call', { N: me.director.nickOf(sent[0]) }))) me.say('contact');
  return goForBackup(me, sent);
}

// one roll per guard: alone (the shout reached nobody, nobody of his fighting near) or outgunned, he may go and
// fetch the free guards of another room (ai/Squad.js) rather than take the player on by himself; one at a time
function goForBackup(me, sent) {
  const p = me.world.player, d = me.director, w = me.world;
  if (me.fetched || me.boss || w.tutorial || !p.alive) return false;
  if (w.enemies.some((o) => o.alive && o.state === S.BACKUP)) return false; // one man runs, the others fight
  const alone = !sent.length && !d.engagedNear(me, AI.shoutRadius);
  const outgunned = p.def.kind === 'gun' && me.def.kind !== 'gun';
  if (!alone && !outgunned) return false;
  me.fetched = true;
  const dist = Math.hypot(p.x - me.x, p.y - me.y);
  if (!chance(backupOdds(me.kind, { alone, outgunned, dist, boss: me.boss }))) return false;
  const g = backupGroup(w.enemies, me);
  if (!g) return false;
  me.setState(S.BACKUP);
  me.backupAt = { x: g.to.x, y: g.to.y, to: g.to };
  me.lastKnown = { x: p.x, y: p.y };
  me.showIcon('!', 1);
  return true;
}

// Running for help: off to the others (saying so once his breath allows); the player on top of him = he turns and
// fights. There, he sends the free men around in (one of them answers) and goes back with them.
export function doBackup(me, dt) {
  const p = me.world.player, B = AI.backup, at = me.backupAt, d = me.director;
  if (!p.alive || me.t > B.give || (me.sees && Math.hypot(p.x - me.x, p.y - me.y) < B.near * 0.7)) {
    me.setState(S.COMBAT);
    me.thinkT = 0;
    return;
  }
  if (me.sub === '' && me.t > 0.5 && (me.say('run') || me.t > 3)) me.sub = 'run';
  // the man he runs to may have got up and moved: he goes where he is now
  if (at.to.alive && !at.to.yielded && at.to.knocked <= 0) { at.x = at.to.x; at.y = at.to.y; }
  if (!me.travel(dt, at.x, at.y, ENEMY.runSpeed * 1.05, { near: 40, look: false }) && !me.blockedAt(dt, at.x, at.y)) return;
  const lk = me.lastKnown ?? d.lastKnown ?? { x: p.x, y: p.y };
  const men = recruits(me.world.enemies, me, me.x, me.y);
  if (men.length) {
    const first = men[0];
    me.barkT = 0;
    me.say('backup', { N: d.nickOf(first) });
    for (const e of men) e.joinHunt(lk.x, lk.y);
    first.barkT = 0;
    first.rallyT = 0.7;
  }
  me.setState(S.HUNT);
  me.lastKnown = lk;
}
