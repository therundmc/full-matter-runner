// What a guard sees and hears (entities/Enemy.js composes it): his view of the player and of points, the detection
// meter, noises heard, what he makes of them ('?' then '!'), a mate killed in front of him, the evidence he comes
// upon, footprints. The maths of it in ai/Perception.js. Functions of the guard (`me`), DOM-free.
import { ENEMY, AI, PALETTE } from '../../Config.js';
import { BOSS } from '../../data/barks.js';
import { rand, angDiff, chance } from '../../../engine/math.js';
import { dice } from '../../systems/Rng.js';
import { detectionRate, inView, hearingError } from '../../ai/Perception.js';
import { ALARMS } from '../../ai/Director.js';
import { ABSORBING, WATCHFUL, S } from './States.js';

const TRACKERS = new Set([S.IDLE, S.PATROL, S.RETURN, S.SEARCH]); // states a guard leaves to follow footprints

// what he says on coming upon each kind of incident (Director incidents; the rest: 'damage')
const FOUND = { missing: 'sight', window: 'window', door: 'door', power: 'fuse' };

export function canSee(me, p) {
  if (!p.alive || p.hidden) return false; // hidden: under the street (systems/Passage.js), in the getaway van
  const dx = p.x - me.x, dy = p.y - me.y;
  if (!inView(Math.hypot(dx, dy), Math.abs(angDiff(me.angle, Math.atan2(dy, dx))), me.aware)) return false;
  return me.world.sightLine(me.x, me.y, p.x, p.y);
}

// rangeMul: fraction of the view distance; close: radius seen all around
export function canSeePoint(me, x, y, rangeMul = 1, close = 0) {
  const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy);
  if (d > ENEMY.viewDist * rangeMul) return false;
  if (d > close && Math.abs(angDiff(me.angle, Math.atan2(dy, dx))) > ENEMY.fov / 2) return false;
  return me.world.sightLine(me.x, me.y, x, y);
}

export function distracted(me) {
  return (me.state === S.IDLE || (me.state === S.PATROL && me.pauseT > 0))
    && (ABSORBING.has(me.activity) || (me.activity === me.job && !WATCHFUL.has(me.job)));
}

// standing at ease: at his post or pausing on his round, nothing on his mind
export function atEase(me) {
  return me.aware === 0 && (me.state === S.IDLE ? me.atPost : me.state === S.PATROL && me.pauseT > 0);
}

// nothing has reached him: the squad is calm, or he is a tutorial man waiting for his turn or a lab dummy (passive),
// who knows nothing of it
export function quiet(me) { return me.dormant || me.passive || me.director.phase === 'normal'; }

// sight check: every step once alert, staggered ticks before (the meter integrates the elapsed time)
export function perceive(me, dt) {
  me.visAcc += dt;
  if (me.aware < 2 && (me.visT -= dt) > 0) return;
  me.visT = ENEMY.visionTick;
  const step = me.visAcc;
  me.visAcc = 0;
  const p = me.world.player;
  const recent = me.world.time - me.seenAt < 3;
  me.sees = !!p && me.canSee(p);
  // A stranger minding his own business on public ground is none of a guard's concern, however long he stands
  // there (the user: the men at the bar's door getting worked up at a man standing about was a nuisance); one who
  // walked into the premises unarmed, or does something odd, gets a word first (Director.conduct)
  const d = me.director, stranger = me.sees && me.aware < 2 && (!d.isThreat(p) || d.isIntruder(p));
  if (stranger) {
    me.sees = false;
    if (Math.hypot(p.x - me.x, p.y - me.y) < AI.gaze.range) me.turnHead(p.x, p.y, ENEMY.visionTick + 0.25); // his eyes on him
  }
  if (me.sees) {
    if (me.aware < 2) {
      const dx = p.x - me.x, dy = p.y - me.y;
      me.meter = Math.min(1, me.meter + step * detectionRate({
        dist: Math.hypot(dx, dy),
        off: Math.abs(angDiff(me.angle, Math.atan2(dy, dx))),
        moving: p.moving,
        light: me.world.lighting?.levelAt?.(p.x, p.y) ?? 0.6,
        vigilance: me.director.vigilance,
        focus: me.state === S.DIZZY ? 0.3 : me.distracted ? 0.45 : 1,
      }));
      if (me.meter >= 1) me.spot(recent);
      else if (me.meter >= ENEMY.suspicious) me.suspect(p.x, p.y, 'sight');
    } else if (me.state === S.HUNT) me.spot(recent);
    if (me.aware === 2) {
      me.lastKnown = { x: p.x, y: p.y };
      me.seenAt = me.world.time;
      me.director.sighted(p.x, p.y);
      if (me.state === S.COMBAT && me.shoutT <= 0) me.director.report(me);
    }
  } else if (me.aware < 2) me.meter = Math.max(0, me.meter - step * ENEMY.meterDecay[me.aware]);
}

// meter full: combat ('!'), then call it in
export function spot(me, recent) {
  if (me.state === S.COMBAT || me.state === S.FETCH || me.state === S.FLEE || me.state === S.DIZZY || me.state === S.BACKUP) return;
  me.setState(S.COMBAT);
  me.react = dice(me.world).rand(...(recent ? ENEMY.reacquire : ENEMY.reaction)) * me.slack;
  me.settle = 0;
  me.showIcon('!', 1);
  me.world.sound('shout', me.x, me.y, 1, { pitch: me.voice });
  me.shoutT = 0.35;
  me.thinkT = 0;
  if (me.boss && !me.director.bossSpoke) me.bossLine();
}

// The boss lays eyes on the player for the first time: his word to him, big over his head in a bubble
// (data/barks.js BOSS, WorldRenderer.drawBubble), the game slowed down a moment, his fire held while he says it.
export function bossLine(me) {
  const w = me.world;
  me.director.bossSpoke = true;
  const str = BOSS.lines[Math.floor(Math.random() * BOSS.lines.length)];
  w.texts.push({ who: me, x: me.x, y: me.y, str, t: BOSS.dur, dur: BOSS.dur, color: PALETTE.pink, bubble: true });
  w.slowmo(...BOSS.slowmo);
  me.react = Math.max(me.react, BOSS.hold);
  me.barkT = BOSS.hold + 0.5;
  me.speak('threat');
  w.sound('mutter', me.x, me.y, 1, { pitch: me.voice * 0.9 });
}

// noise heard (types: see ENEMY.hear); localisation gets worse with distance
export function hear(me, type, x, y, source = null) {
  if (me.passive || me.dormant || me.yielded || !me.alive || me.knocked > 0 || me.state === S.DIZZY) return;
  // a bartender at the first shots: down behind his counter for a moment
  if (me.job === 'wipe' && !me.ducked && me.atPost && me.aware < 2 && (type === 'gunshot' || type === 'explosion')) {
    me.ducked = true;
    me.duckT = dice(me.world).rand(...AI.duck);
  }
  if (me.aware === 2) {
    if ((type === 'gunshot' || type === 'explosion') && !me.sees) me.lastKnown = { x, y };
    return;
  }
  // having a word with the stranger: a small noise gets a glance, no more
  if (me.state === S.CHALLENGE && (type === 'footsteps' || !ALARMS.has(type))) { me.glanceAt(x, y, AI.listen.glance); return; }
  const err = hearingError(Math.hypot(x - me.x, y - me.y));
  const D = dice(me.world), sx = x + D.rand(-err, err), sy = y + D.rand(-err, err);
  if (type === 'footsteps') {
    me.meter = Math.min(0.55, me.meter + ENEMY.hear.footsteps);
    if (me.meter >= ENEMY.suspicious) me.suspect(sx, sy, type);
    return;
  }
  // a mate is shooting: go and help while the squad is on alert, otherwise check it out
  const d = me.director, lk = d.lastKnown;
  if (type === 'allyFire' && source && d.phase === 'alert' && lk) {
    if (d.hunters() < AI.maxHunters) me.joinHunt(lk.x, lk.y); else me.guard(source.x, source.y);
    me.say('shots');
    return;
  }
  const lvl = ENEMY.hear[type] ?? ENEMY.hear.noise;
  me.meter = Math.max(me.meter, lvl);
  me.suspect(sx, sy, type, lvl >= 0.6);
}

// '?': stop, turn the head, then go and look
export function suspect(me, x, y, kind, urgent = false) {
  if (me.aware === 2 || me.state === S.DIZZY) return;
  if (urgent) me.director.raise();
  if (me.state === S.SUSPICIOUS || me.state === S.INVESTIGATE) {
    me.stim = { x, y, kind };
    if (urgent && !me.urgent) me.investigate(x, y, kind, true);
    return;
  }
  if (me.state === S.CHECK) me.checkTarget?.seen?.delete(me);
  me.setState(S.SUSPICIOUS);
  me.stim = { x, y, kind };
  me.urgent = urgent;
  me.susT = urgent ? dice(me.world).rand(0.35, 0.55) : dice(me.world).rand(0.7, 1.1);
  me.showIcon('?', 1.5);
  me.say(kind === 'sight' ? 'sight' : kind === 'gunshot' ? 'shots' : 'noise');
}

export function investigate(me, x, y, kind, urgent) {
  if (me.aware === 2 || me.knocked > 0) return;
  me.setState(S.INVESTIGATE);
  me.nearT = 0;
  me.stim = { x, y, kind };
  me.urgent = urgent;
  me.meter = Math.max(me.meter, ENEMY.suspicious);
  me.showIcon('?', 1.2);
}

// a mate died in front of us
export function witnessKill(me, victim) {
  const now = me.world.time;
  me.witnessed = me.witnessed.filter((t) => now - t < 5);
  me.witnessed.push(now);
  const named = victim.boss && !victim.traits ? 'chief' : 'down', who = { N: victim.nick }; // (a boss with a name: by it)
  if (me.witnessed.length >= 2 && me.panicT <= 0 && chance(me.kind === 'brute' ? 0.3 : 0.6)) {
    me.panicT = rand(3, 5);
    me.say('panic');
    me.thinkT = 0;
  } else if (me.aware === 2 && chance(0.7)) {
    me.barkT = 0; // the cry cuts short whatever he was saying
    if (!(chance(0.5) && me.say(named, who))) me.say('revenge');
  }
  if (me.aware === 2) return;
  me.director.callIn(me, victim.x, victim.y);
  me.meter = Math.max(me.meter, 0.8);
  // he saw where it came from only if the killer is in view too
  const p = me.world.player;
  const src = p.alive && me.canSeePoint(p.x, p.y) ? p : victim;
  // his cry for the man who fell comes before anything else he would say
  me.barkT = 0;
  if (!me.say(named, who)) me.say('body');
  me.suspect(src.x + rand(-24, 24), src.y + rand(-24, 24), 'witness', true);
}

// look for evidence: knocked-out mates, bodies, wrecked walls/doors/windows, empty posts
export function scanWorld(me) {
  if (me.aware === 2 || me.state === S.CHECK || me.state === S.DIZZY) return;
  const w = me.world;
  for (const e of w.enemies) {
    if (e === me || !e.alive || e.knocked < 0.5 || e.executing) continue;
    if (w.enemies.some((o) => o.checkTarget?.friend === e && o.state === S.CHECK)) continue;
    if (me.canSeePoint(e.x, e.y, 0.8)) { me.check({ kind: 'friend', x: e.x, y: e.y, friend: e }); return; }
  }
  for (const inc of me.director.incidents) {
    if (inc.reported || inc.seen.has(me) || (inc.after && w.time < inc.after)) continue;
    if (!me.canSeePoint(inc.x, inc.y, inc.kind === 'body' || inc.kind === 'missing' ? 0.75 : 0.85)) continue;
    inc.seen.add(me);
    me.check(inc);
    return;
  }
  // the player's footprints: blood alarms anyone, wet soles only mean something to a guard already looking
  const d = me.director;
  if (!TRACKERS.has(me.state) || d.tracker) return;
  const looking = me.aware > 0 || d.phase !== 'normal', R = AI.trail;
  const print = d.trail.find((q) => me.canSeePoint(q.x, q.y, R.sight, R.close), (q) => looking || q.kind === 'blood');
  if (print) me.track(print);
}

// '?': follow the footprints from that one on
export function track(me, print) {
  me.setState(S.TRACK);
  me.nearT = 0;
  me.trackAt = print;
  me.meter = Math.max(me.meter, ENEMY.suspicious);
  me.showIcon('?', 1.5);
  me.say(print.kind === 'blood' ? 'blood' : 'tracks');
  if (print.kind === 'blood') me.director.raise();
}

export function check(me, inc) {
  me.setState(S.CHECK);
  me.checkTarget = inc;
  me.meter = Math.max(me.meter, 0.5);
  me.showIcon('?', 1.5);
  me.say(FOUND[inc.kind] ?? 'damage');
}
