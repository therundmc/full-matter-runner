// A guard's word with a stranger caught at something odd (ai/Conduct.js the rules): seen at it, over to him, told,
// warned, shoved, and the fight unless he does as he is told. Functions of the guard (`me`), DOM-free.
import { ENEMY, AI } from '../../Config.js';
import { Case, STAGE, judge, complies } from '../../ai/Conduct.js';
import { GESTURE } from '../../data/feel.js';
import { S } from './States.js';

// Could he have seen the stranger at it (Director.conduct): on his feet and free (not in a fight, not on his knees,
// not down behind a counter), the stranger in sight within AI.challenge.sight px (close by, if his mind is on his
// game); a noise (heard) turns his head to it, so no view cone then.
export function witness(me, p, heard = false) {
  if (me.passive || me.dormant || me.yielded || me.knocked > 0 || me.held || me.aware === 2 || me.vaulting) return false;
  if (me.state === S.DIZZY || me.state === S.BACKUP || me.duckT > 0) return false;
  const d = Math.hypot(p.x - me.x, p.y - me.y);
  if (d > (me.distracted ? AI.challenge.near : AI.challenge.sight)) return false;
  return heard ? me.world.sightLine(me.x, me.y, p.x, p.y) : me.canSee(p);
}

// a look at (x, y) for dur s, whatever he is at
export function glanceAt(me, x, y, dur) { me.eyes = { x, y, until: me.world.time + dur }; }

// He saw the stranger do something odd (act, data/conduct.js ACTS) at (x, y): over to him to have a word. open: the
// stage the word starts at once there (ai/Conduct.js opening: warned at once, a man let off not long ago).
export function challenge(me, act, x, y, open = STAGE.TOLD) {
  const p = me.world.player;
  me.setState(S.CHALLENGE);
  me.case = new Case(act, { x, y }, me.world.time, open);
  me.director.challenger = me;
  me.barkT = 0;
  if (Math.hypot(p.x - me.x, p.y - me.y) > AI.challenge.talk * 2) me.say('hey');
  me.world.events.emit('challenge', { guard: me, act, stage: STAGE.GO });
}

// the word is over (letOff: let off, or the stranger got away from it): the Director remembers him a while
export function endCase(me, letOff) {
  if (!me.case) return;
  me.case = null;
  me.director?.closeCase(me, letOff);
}

// Over to him, then talk: told, warned, shoved, and the fight is on unless he does as he is told (ai/Conduct.js
// judge); out of sight too long, he lets it go.
export function doChallenge(me, dt) {
  const w = me.world, p = w.player, c = me.case, C = AI.challenge, now = w.time;
  if (!c || !p.alive || p.hidden) { me.endCase(false); me.setState(S.RETURN); return; }
  const dist = Math.hypot(p.x - me.x, p.y - me.y);
  const seen = dist <= ENEMY.viewDist && w.sightLine(me.x, me.y, p.x, p.y);
  c.lost = seen ? 0 : c.lost + dt;
  if (seen) c.seen = { x: p.x, y: p.y };
  const tg = seen ? p : c.seen ?? c.at;
  if (c.stage === STAGE.GO) {
    if (c.lost > C.lost) { me.letGo(); return; }
    if (!seen || dist > C.talk + 8) {
      // a man he cannot get to (over a counter, up on a roof) is called from where he stands
      const stuck = me.travel(dt, tg.x, tg.y, ENEMY.walkSpeed * C.pace, { near: C.talk, look: !(seen && dist < 200) });
      if (seen && dist < 200) me.faceTo(p.x, p.y, 5, dt);
      if (!(stuck && seen && dist < 160)) return;
    }
    stageUp(me, c);
  }
  if (c.stage === STAGE.SHOVED && !c.shoved) {
    // up to him, and a flat hand in his chest
    if (dist > C.reach && now - c.t < 2.5) {
      me.travel(dt, p.x, p.y, ENEMY.walkSpeed * C.pace * 1.3, { near: C.reach - 4, look: false });
      me.faceTo(p.x, p.y, 6, dt);
      return;
    }
    c.shoved = true;
    c.t = now;
    if (dist <= C.reach + 8) me.shove(p);
  }
  // talking: a word's distance off, his eyes on him
  if (seen && dist > C.talk + 40) me.travel(dt, p.x, p.y, ENEMY.walkSpeed * C.pace, { near: C.talk, look: false });
  else me.halt();
  me.faceTo(tg.x, tg.y, 5, dt);
  const out = !me.director.inPremises(p);
  const v = judge(c, { complied: complies(c, p, !out) || (out && dist > C.gone), lost: c.lost }, now, dt);
  if (v === 'settle') me.letOff('settle');
  else if (v === 'drop') me.letGo();
  else if (v === 'escalate') stageUp(me, c);
}

// the next stage of the word: told (what he did), warned, shoved, the fight
function stageUp(me, c) {
  const from = c.stage, s = c.next(me.world.time);
  me.barkT = 0;
  me.world.events.emit('challenge', { guard: me, act: c.act, stage: s });
  if (s === STAGE.TOLD || (from === STAGE.GO && s === STAGE.WARNED)) me.say(c.rules.order);
  else if (s === STAGE.WARNED) me.say('press');
  if (s === STAGE.WARNED) me.showIcon('!', 1.2);
  else if (s === STAGE.SHOVED) c.shoved = false;
  else if (s === STAGE.FIGHT) snapAt(me);
}

// a flat hand in his chest (the hand comes up as on a door leaf: CharacterAnim doorHandPose), thrown back a step
export function shove(me, p) {
  const a = Math.atan2(p.y - me.y, p.x - me.x);
  // a whole door hand (Character.updateDoorHand lets it down after GESTURE.door.follow): pushing, the free hand
  const side = me.armed && !(me.stow >= 0.6) ? -1 : 1;
  me.doorHand = { x: p.x - Math.cos(a) * p.radius, y: p.y - Math.sin(a) * p.radius, a: a + Math.PI, w: 1, push: 1,
    hold: GESTURE.door.follow, side, door: null };
  p.shoved?.(a, AI.challenge.shove);
  me.say('shove');
  me.world.sound('punch', p.x, p.y, 0.35, { pitch: 1.3 });
}

// he would not listen: the fight is on, and the squad takes him for a threat for good
function snapAt(me) {
  const p = me.world.player;
  me.endCase(false);
  me.director.provoked = true;
  me.barkT = 0;
  me.say('snap');
  me.sees = true;
  me.lastKnown = { x: p.x, y: p.y };
  me.spot(false);
}

// he did as he was told: a last word, and back to what he was at
export function letOff(me, line) {
  me.barkT = 0;
  me.say(line);
  me.endCase(true);
  me.meter = 0;
  me.setState(S.RETURN);
}

// gone out of sight before a word could be had: let it go
export function letGo(me) { me.letOff('letgo'); }
