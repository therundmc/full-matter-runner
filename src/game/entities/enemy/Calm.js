// A guard while all is calm: waiting for his turn (the tutorial, the lab), at ease at his post or on his round, his
// pastimes (ai/Pastimes.js: a chat with a colleague, a leak, a cigarette...), what his hands are at (CharacterAnim
// hooks), his weapon put away (ai/Carry.js). Functions of the guard (`me`), DOM-free.
import { ENEMY, AI } from '../../Config.js';
import { rand, chance } from '../../../engine/math.js';
import { randomPoint } from '../../ai/Tactics.js';
import { talks, pours, reliefSpot, gazeAt, STRETCH } from '../../ai/Pastimes.js';
import { carry } from '../../ai/Carry.js';
import { STAGE } from '../../ai/Conduct.js';
import { pastimeHands } from '../../render/PastimeArt.js';
import { GESTURE } from '../../data/feel.js';
import { ABSORBING, ONE_GO, S } from './States.js';

// at ease (see pickActivity): what takes his hands, what a round is broken by, and the states in which a weapon
// stays put away
const HANDS = new Set(['smoke', 'phone', 'piss', 'stretch', 'wrist', 'cross']);
const PAUSES = ['smoke', 'phone', 'stretch', 'wrist'];
const CALM = new Set([S.IDLE, S.PATROL, S.RETURN]);

// what his hands are at while at ease (a kind of render/PastimeArt.js), or null: free, or on his weapon
export function pastime(me) {
  if (!me.atEase || me.stow < 0.6 || (me.routine && me.activity === me.job)) return null;
  const a = me.activity;
  if (a === 'chat') return talks(me.world.time, me.turn) ? 'talk' : 'listen';
  return HANDS.has(a) || a === me.job ? a : null;
}

// a doorman's eyes: on the player when he comes near in front of him, else the way he stands
export function gaze(me, base) {
  const p = me.world.player, G = AI.gaze;
  if (!p.alive) return base;
  const a = gazeAt(base, p.x - me.x, p.y - me.y, G.range, G.arc);
  return a !== base && me.world.lineOfSight(me.x, me.y, p.x, p.y) ? a : base;
}

export function pouring(me) { return me.pastime === 'piss' && pours(me.actT, me.activityT); }

// CharacterAnim hook
export function busyHands(me) {
  const ph = me.gestureOn;
  if (ph) return me.gestureHands(ph);
  if (me.script?.walk && me.state === S.PATROL && me.pauseT <= 0 && me.aware === 0 && me.stow >= 0.6) {
    return pastimeHands(me.script.walk, me.world.time, me.seed);
  }
  const k = me.pastime;
  return k && pastimeHands(k, ONE_GO.has(k) ? me.actT : me.world.time, me.seed);
}

// CharacterAnim hook: on his knees, his shoulders up, his head drawn in, shaking
export function mood(me) {
  if (!me.yielded) return null;
  const Y = GESTURE.panic.yield;
  return { hunch: Y.hunch, duck: Y.duck, shake: Y.px };
}

// weapon put away while all is calm, in hand and lowered once something is up, raised on a target
export function updateCarry(me, dt) {
  // (a word with a stranger over a trifle: his weapon stays put away until he warns him)
  const c = me.case, word = !!c && c.stage < STAGE.WARNED && !c.rules.lasting && me.quiet;
  const calm = word || (me.aware === 0 && me.quiet && CALM.has(me.state));
  const was = me.stow, long = me.def.hold === 'two' || me.def.swing === 'club';
  carry(me, calm, me.aware >= 2 || me.recoil > 0, me.def.hold === 'two', dt);
  if (!me.weapon) return;
  // the hand on it, out of the holster (or off the back: swung round), put back (placeholders: PLACEHOLDERS.md)
  if (was >= 1 && me.stow < 1) me.world.sound(long ? 'sling' : 'holster', me.x, me.y, 0.6, { weapon: me.weapon.type });
  if (was >= 0.5 && me.stow < 0.5) me.world.sound('pickup', me.x, me.y, 0.5);
  if (was < 0.9 && me.stow >= 0.9) me.world.sound(long ? 'sling' : 'holster', me.x, me.y, 0.45, { weapon: me.weapon.type });
}

// a tutorial man waiting for his wave (systems/Tutorial.js), a lab dummy (passive): he sees and hears nothing, but
// goes on at his job
export function waitTurn(me, dt) {
  me.t += dt;
  // a script sends him somewhere at a run, straight there (systems/Tutorial.js: the man with the match makes for
  // the door)
  if (me.bolt) {
    const dx = me.bolt.x - me.x, dy = me.bolt.y - me.y;
    me.steer(dx, dy, ENEMY.runSpeed, 0.3);
    me.faceAngle(Math.atan2(dy, dx), 10, dt);
    return;
  }
  if (me.updatePosture(dt) || !(me.routine && me.activity === me.job)) { me.halt(); return; }
  me.work(dt);
}

export function doIdle(me, dt) {
  if (me.routine && me.activity === me.job) { me.work(dt); return; }
  const h = me.errand ?? me.home;
  me.atPost = Math.hypot(h.x - me.x, h.y - me.y) <= 14 || (!me.errand && me.world.time < me.restUntil);
  if (!me.atPost) {
    // a spot he cannot get to (something in the way) is forgotten
    if (me.errand && (me.errandT += dt) > AI.relief.giveUp) { me.errand = null; me.activityT = 0; }
    // no way there, or held up on the way too often (a mate standing in the only way, ai/Nav.js jams): an errand
    // is dropped, his post waits a while and he idles where he stands
    if (me.travel(dt, h.x, h.y, ENEMY.walkSpeed, { doors: true })) {
      if (me.errand) { me.errand = null; me.activityT = 0; } else me.restUntil = me.world.time + rand(...AI.nav.jam.rest);
    }
    return;
  }
  me.halt();
  me.actT += dt;
  const busy = me.distracted || HANDS.has(me.activity); // dropped as soon as the squad is on edge
  if ((me.activityT -= dt) <= 0 || (busy && me.director.phase !== 'normal')) me.pickActivity();
  easeTick(me, dt);
  const base = h.angle ?? h.face ?? me.home.angle; // (an errand's spot may only say which way to face)
  if (me.distracted) me.faceAngle(me.idleFace, 2, dt);
  else if (me.activity === 'turn') me.faceAngle(me.turnTo, 2.2, dt);
  else if (me.activity === 'scan') me.faceAngle(base + Math.sin(me.t * 0.8 + me.seed) * 1.2, 2.2, dt);
  else me.sweep(dt, base, 0.7, 1.8);
}

// what a bored guard does at his post: his pastime if he has one; else a word with a colleague, a leak, a
// cigarette, his pager, a stretch, a look at his watch, arms folded; or (the only ones left once the squad is
// on edge) watch, scan, look behind
export function pickActivity(me) {
  const calm = me.director.phase === 'normal', r = Math.random(), q = Math.random();
  const set = (activity, t, face = me.idleFace) => { me.activity = activity; me.activityT = t; me.idleFace = face; };
  me.actT = 0; me.errand = null; me.errandT = 0;
  if (me.routine) { me.routine.act = null; me.routine.cued = null; me.workSpot = null; me.onSpot = false; }
  if (calm && me.job && (me.script?.stay || chance(0.8))) { set(me.job, rand(8, 14), me.home.angle); return; }
  if (calm) {
    const mate = me.chatCd <= 0 && findMate(me, AI.chat.near);
    if (mate) { chatWith(me, mate); return; }
    const spot = r < AI.relief.odds && me.reliefCd <= 0 && reliefSpot(me.world.map, me.world.props, me.x, me.y);
    if (spot) {
      me.errand = spot;
      me.reliefCd = rand(...AI.relief.every);
      set('piss', rand(...AI.relief.time), spot.face);
      return;
    }
    const ahead = me.home.angle + rand(-0.6, 0.6);
    // about half the time something to do with his hands, the other half his job: watching
    const u = r - AI.relief.odds;
    if (u >= 0 && u < 0.12) { set('smoke', rand(6, 10), ahead); return; }
    if (u >= 0 && u < 0.19) { set('phone', rand(4, 7), ahead); return; }
    if (u >= 0 && u < 0.26) { set('stretch', STRETCH); return; }
    if (u >= 0 && u < 0.33) { set('wrist', STRETCH); return; }
    if (u >= 0 && u < 0.45) { set('cross', rand(4, 8)); return; }
  }
  if (q < 0.25) { set('turn', rand(1.5, 2.6)); me.turnTo = me.home.angle + rand(2.3, 4); }
  else if (q < 0.55) set('scan', rand(3, 5));
  else set('watch', rand(3, 6));
}

// calm, on his feet, at his post or on his round, with nothing going on
export function idle(me) {
  return me.aware === 0 && me.knocked <= 0 && !me.held && !me.passive
    && (me.state === S.PATROL || (me.state === S.IDLE && me.atPost))
    && me.activity !== me.job && me.activity !== 'chat' && me.activity !== 'piss';
}

// a colleague within `reach` px, in sight, who has a minute
function findMate(me, reach) {
  for (const e of me.world.enemies) {
    if (e === me || !e.alive || e.chatCd > 0 || !e.idle) continue;
    const d = Math.hypot(e.x - me.x, e.y - me.y);
    if (d > 20 && d < reach && me.world.lineOfSight(me.x, me.y, e.x, e.y)) return e;
  }
  return null;
}

// stop for a word: both turn to each other and talk turn about, until the time is up or one is called away
function chatWith(me, mate) {
  const t = rand(...AI.chat.time), first = chance(0.5) ? 0 : 1;
  me.joinChat(mate, t, first);
  mate.joinChat(me, t, 1 - first);
}

export function joinChat(me, mate, t, turn) {
  me.mate = mate; me.turn = turn; me.spoke = false;
  me.activity = 'chat'; me.actT = 0; me.errand = null;
  me.chatCd = t + rand(...AI.chat.every);
  me.idleFace = Math.atan2(mate.y - me.y, mate.x - me.x);
  if (me.state === S.PATROL) me.pauseT = t; else me.activityT = t;
}

// upkeep of what he is at: a chat (facing the other, a line when his turn comes, over as soon as the other is
// called away), a leak (it runs down the wall onto the floor)
function easeTick(me, dt) {
  if (me.activity === 'chat') {
    const m = me.mate;
    if (!m || !m.alive || m.mate !== me || m.activity !== 'chat' || !m.distracted) {
      me.mate = null;
      me.activity = 'watch';
      if (me.state === S.PATROL) me.pauseT = Math.min(me.pauseT, 0.6); else me.activityT = Math.min(me.activityT, 0.6);
      return;
    }
    me.idleFace = Math.atan2(m.y - me.y, m.x - me.x);
    const mine = talks(me.world.time, me.turn);
    if (mine && !me.spoke && chance(AI.chat.line)) me.say('chat');
    me.spoke = mine;
  } else if (me.errand?.wall && me.pouring && (me.dripT -= dt) <= 0) {
    me.dripT = 0.5;
    me.world.events.emit('spill', { x: me.x + Math.cos(me.angle) * 12, y: me.y + Math.sin(me.angle) * 12, kind: 'water', area: 12 });
  }
}

export function doPatrol(me, dt) {
  const calm = me.director.phase === 'normal';
  if (me.pauseT > 0) {
    if (me.routine && me.activity === me.job) {
      if (calm) me.work(dt); else { me.pauseT = 0; me.routine.act = null; }
      return;
    }
    me.pauseT -= dt;
    me.actT += dt;
    me.halt();
    easeTick(me, dt);
    if (me.distracted) me.faceAngle(me.idleFace, 2, dt);
    else me.sweep(dt, me.lookBase, 1, 1.8);
    return;
  }
  me.activity = 'walk';
  // walking past a colleague who has a minute: stop for a word
  if (calm && me.chatCd <= 0 && (me.chatScan -= dt) <= 0) {
    me.chatScan = 0.5;
    const mate = findMate(me, AI.chat.pass);
    if (mate) { chatWith(me, mate); return; }
  }
  if (!me.goal) me.goal = me.route ? me.route[me.routeIdx] : randomPoint(me.world.map, me.home.x, me.home.y, 7);
  if (!me.goal) { me.pauseT = 1; return; }
  if (me.travel(dt, me.goal.x, me.goal.y, ENEMY.walkSpeed * (calm ? 1 : 1.25), { doors: true, glance: true })) {
    me.goal = null;
    if (me.route) me.routeIdx = (me.routeIdx + 1) % me.route.length;
    me.pauseT = rand(0.8, 2.4);
    me.lookBase = me.angle;
    if (calm && me.routine && chance(0.6)) {
      // a halt at what his job does on his round (data/posts.js)
      const R = me.routine, name = R.pick((n) => me.canPlay(n));
      if (name) {
        me.activity = me.job; me.pauseT = Infinity;
        R.begin(name);
        me.startPhase();
      }
    } else if (calm && chance(0.3)) {
      // a longer halt: a cigarette, his pager, a stretch, a look at his watch
      const k = PAUSES[Math.floor(rand(0, PAUSES.length))];
      me.activity = k; me.actT = 0;
      me.pauseT = ABSORBING.has(k) ? rand(4, 7) : STRETCH;
      me.idleFace = me.angle + rand(-0.8, 0.8);
    }
  }
}

export function doReturn(me, dt) {
  if (me.roam) {
    if (me.route) {
      let bi = 0, bd = Infinity;
      me.route.forEach((p, i) => { const d = Math.hypot(p.x - me.x, p.y - me.y); if (d < bd) { bd = d; bi = i; } });
      me.routeIdx = bi;
    }
    me.setState(S.PATROL);
    me.pauseT = rand(0.5, 1.5);
    return;
  }
  const h = me.home;
  if (me.travel(dt, h.x, h.y, ENEMY.walkSpeed * 1.1, { doors: true, glance: true })) {
    me.setState(S.IDLE);
    me.activity = 'watch';
    me.activityT = rand(2, 4);
  }
}
