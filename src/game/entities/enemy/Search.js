// A guard on edge: the squad's orders (ai/Director.js: the hunt, a spot to guard, a sweep, standing down) and the
// states they put him in, the suspicious ones (the tell, investigate, check, search, track, guard, dizzy) and the
// hunt. Functions of the guard (`me`), DOM-free.
import { ENEMY, AI } from '../../Config.js';
import { rand, chance } from '../../../engine/math.js';
import { searchPoints } from '../../ai/Tactics.js';
import { S } from './States.js';

export function joinHunt(me, x, y) {
  if (me.knocked > 0 || me.aware === 2) return;
  me.setState(S.HUNT);
  me.lastKnown = { x, y };
  me.showIcon('!', 1);
  if (chance(0.5)) me.say('hunt');
}

export function guard(me, x, y) {
  if (me.knocked > 0 || me.aware === 2) return;
  me.setState(S.GUARD);
  me.guardPt = { x, y };
  me.guardT = rand(8, 14);
  me.meter = Math.max(me.meter, ENEMY.suspicious);
  me.showIcon('?', 1);
}

// director-run sweep after losing the target
export function beginSearch(me) {
  if (!me.alive || me.knocked > 0 || me.state === S.BACKUP) return;
  me.setState(S.SEARCH);
  me.localPts = null;
  me.meter = Math.max(me.meter, 0.5);
  if (chance(0.4)) me.say('lost');
}

export function beginLocalSearch(me, x, y, n) {
  me.setState(S.SEARCH);
  me.localPts = searchPoints(me.world.map, x, y, 6, n + 1).slice(1);
}

export function standDown(me) {
  if (!me.alive || me.knocked > 0 || me.sees) return;
  if (me.aware === 2 || me.state === S.SEARCH || me.state === S.GUARD) me.calm();
}

export function calm(me) {
  if (me.state !== S.IDLE && me.state !== S.PATROL) me.say('clear');
  me.setState(S.RETURN);
  me.urgent = false;
  me.meter = Math.min(me.meter, 0.2);
}

// the tell: freeze and turn toward what caught his attention before doing anything
export function doSuspicious(me, dt) {
  me.halt();
  me.faceTo(me.stim.x, me.stim.y, 4.5, dt);
  me.target = me.stim;
  if (me.t < me.susT) return;
  if (me.meter >= 0.15 || me.urgent) me.investigate(me.stim.x, me.stim.y, me.stim.kind, me.urgent);
  else me.calm();
}

export function doInvestigate(me, dt) {
  const st = me.stim;
  if (me.sub === '') {
    const speed = me.urgent ? ENEMY.runSpeed * 0.8 : ENEMY.walkSpeed * 1.2;
    if (me.travel(dt, st.x, st.y, speed, { doors: !me.urgent, near: 14, glance: !me.urgent }) || me.blockedAt(dt, st.x, st.y)) {
      me.sub = 'look'; me.t = 0; me.lookT = rand(1.6, 2.6); me.lookBase = me.angle;
    }
    return;
  }
  me.halt();
  me.sweep(dt, me.lookBase, 1.3);
  if (me.t < me.lookT) return;
  if (me.urgent || me.director.phase !== 'normal') me.beginLocalSearch(st.x, st.y, 2);
  else me.calm();
}

// crouch over a body / wake a mate / look at the damage, then call it in
export function doCheck(me, dt) {
  const c = me.checkTarget, f = c.friend;
  if (f && (!f.alive || f.knocked <= 0)) { me.beginLocalSearch(me.x, me.y, 1); return; }
  const x = f ? f.x : c.x, y = f ? f.y : c.y;
  const kneel = !!f || c.kind === 'body';
  if (me.sub === '') {
    if (me.travel(dt, x, y, ENEMY.walkSpeed * 1.7, { near: kneel ? 18 : 40 })) {
      me.sub = 'look'; me.t = 0; me.lookBase = Math.atan2(y - me.y, x - me.x);
    }
    return;
  }
  me.halt();
  me.kneel = kneel;
  if (me.t < 0.5) me.faceTo(x, y, 4, dt);
  else me.sweep(dt, me.lookBase + Math.PI, 1.6);
  if (me.t < (kneel ? 1.4 : 1.8)) return;
  if (f) { f.knocked = Math.min(f.knocked, 0.2); me.say('wake', { N: f.nick }); }
  else if (c.kind === 'body') { if (!me.say(c.who?.boss && !c.who.traits ? 'chief' : 'found', { N: c.who?.nick })) me.say('body'); }
  else me.say(c.kind === 'missing' ? 'missing' : 'damage');
  me.director.callIn(me, x, y);
  me.beginLocalSearch(x, y, 2);
}

export function doSearch(me, dt) {
  if (me.sub === '' && !me.armed && me.lookForWeapon()) return;
  if (!me.searchPt) {
    me.searchPt = me.localPts ? me.localPts.shift() : me.director.nextSearchPoint(me);
    if (!me.searchPt) {
      const lk = me.director.lastKnown;
      if (!me.localPts && me.director.phase === 'evasion' && lk) me.guard(lk.x, lk.y);
      else me.calm();
      return;
    }
    me.sub = 'go';
    // off to another room: he says which ("CHECK THE STOREROOM!")
    if (me.director.phase !== 'normal' && chance(0.35)) {
      const there = me.director.placeAt(me.searchPt.x, me.searchPt.y);
      if (there && there.key !== me.director.placeAt(me.x, me.y)?.key) me.say('sweep', { P: there.the });
    }
  }
  const pt = me.searchPt;
  const hurry = me.director.phase === 'evasion' || me.director.phase === 'alert';
  if (me.sub === 'go') {
    if (me.travel(dt, pt.x, pt.y, hurry ? ENEMY.runSpeed * 0.7 : ENEMY.walkSpeed * 1.3, { doors: !hurry, near: 12, glance: true })) {
      me.sub = 'look'; me.t = 0; me.lookT = rand(1.3, 2.2); me.lookBase = pt.origin ? me.angle : pt.look;
      if (hurry && chance(0.3)) me.say('search');
    }
    return;
  }
  me.halt();
  me.sweep(dt, me.lookBase, 1.4);
  if (me.t > me.lookT) { pt.done = true; me.searchPt = null; me.sub = 'go'; }
}

// walk the footprints one hop at a time, then go and look where they were heading
export function doTrack(me, dt) {
  const d = me.director, at = me.trackAt, hurry = d.phase !== 'normal';
  const speed = hurry ? ENEMY.runSpeed * 0.7 : ENEMY.walkSpeed * 1.3;
  if (!me.travel(dt, at.x, at.y, speed, { near: 12, glance: true }) && !me.blockedAt(dt, at.x, at.y)) return;
  me.nearT = 0;
  d.trail.close(at);
  const next = d.trail.next(at);
  if (next) { me.trackAt = next; return; }
  const x = at.x + Math.cos(at.angle) * AI.trail.ahead, y = at.y + Math.sin(at.angle) * AI.trail.ahead;
  const open = me.world.lineOfSight(at.x, at.y, x, y);
  me.investigate(open ? x : at.x, open ? y : at.y, 'tracks', hurry || at.kind === 'blood');
}

// hold a position and watch a spot (guards beyond the hunters' quota)
export function doGuard(me, dt) {
  me.halt();
  const g = me.guardPt;
  me.target = g;
  me.sweep(dt, Math.atan2(g.y - me.y, g.x - me.x), 0.6);
  if (me.t > me.guardT && me.director.phase !== 'alert') me.calm();
}

// groggy after a knock-down: staggers, half blind
export function doDizzy(me, dt) {
  const wob = Math.sin(me.world.time * 7 + me.seed);
  me.angle += wob * dt * 2.5;
  const a = me.angle + wob * 1.6;
  me.steer(Math.cos(a), Math.sin(a), 0.35, 0.05);
  if (me.t < me.dizzyT) return;
  if (!me.armed && me.lookForWeapon()) return;
  if (me.sees) { me.meter = 1; me.spot(false); return; }
  me.director.raise();
  me.beginLocalSearch(me.x, me.y, 2);
}

// curses thrown into the dark while hunting him down (not before he has given himself away)
export function taunt(me, dt) {
  if ((me.tauntT -= dt) > 0) return;
  me.tauntT = rand(...AI.tauntGap);
  const d = me.director;
  if (d.provoked && (d.phase === 'alert' || d.phase === 'evasion') && chance(0.6)) me.say('taunt');
}

// after him to where he was last seen; where a mate just fell, carefully: a brisk walk, weapon up on that spot
export function doHunt(me, dt) {
  const lk = me.lastKnown;
  if (!lk) { me.beginSearch(); return; }
  const wary = me.director.wary(lk.x, lk.y) && Math.hypot(lk.x - me.x, lk.y - me.y) < AI.wary.r * 1.5;
  const speed = wary ? ENEMY.walkSpeed * AI.wary.pace : ENEMY.runSpeed * 0.85 * me.pace;
  if (me.travel(dt, lk.x, lk.y, speed, { near: 20, look: !wary })) { me.beginSearch(); return; }
  if (wary) me.aimAt(lk.x, lk.y, dt, 0.7);
}
