// A guard in the fight: the tactic picked (plan: rush, stalk, hold, advance, back off, cover, ambush, flank,
// suppress, reload, panic) and played, his aim and his trigger, holding his fire (a comrade in the line, a hostage).
// Geometry in ai/Tactics.js. Functions of the guard (`me`), DOM-free.
import { ENEMY, AI } from '../../Config.js';
import { rand, angDiff, chance, spread } from '../../../engine/math.js';
import { dice } from '../../systems/Rng.js';
import { findCover, findFlank, isCovered, randomPoint, tableToFlip } from '../../ai/Tactics.js';
import { aimError } from '../../ai/Perception.js';
import { inHand } from '../../ai/Carry.js';
import { TELL, SHIELD } from '../../data/feel.js';
import { hesitation, flankSide } from '../../systems/Shield.js';

const { Body } = Matter;

const RANGES = ENEMY.ranges;

export function doCombat(me, dt) {
  const p = me.world.player;
  if (!p.alive) { me.halt(); return; }
  // the last man standing, face to face with the armed killer of all the others, or a man on his own with nothing
  // left to fight with: he may lose his nerve
  if (me.react <= 0 && me.loseNerve(dt)) return;
  me.suppressCD -= dt; me.dodgeCD -= dt; me.stalkCD -= dt; me.standT -= dt;
  if (me.sees) {
    // re-acquiring after losing sight takes a moment, and the aim has to settle again
    if (me.lostT > 0.4) { me.react = Math.max(me.react, dice(me.world).rand(...ENEMY.reacquire)); me.settle *= 0.4; }
    me.lostT = 0;
    me.react -= dt;
    if (me.react <= 0) me.settle = Math.min(1, me.settle + dt / ENEMY.aimSettle);
    me.ambushed = false;
  } else me.lostT += dt;
  if (me.shoutT > 0 && (me.shoutT -= dt) <= 0 && me.callOut()) return;
  // curses: at the man in his sights, or at the corner he vanished behind
  if ((me.tauntT -= dt) <= 0) {
    me.tauntT = rand(...AI.tauntGap);
    if (me.panicT <= 0) me.say(me.sees ? (me.def.kind === 'gun' ? 'threat' : 'brawl') : me.lostT > 1.2 ? 'flush' : 'hunt');
  }
  if ((me.thinkT -= dt) <= 0) { me.thinkT = dice(me.world).rand(0.3, 0.5); me.plan(p); }
  me.target = me.sees ? p : me.lastKnown;
  switch (me.tactic) {
    case 'rush': tRush(me, dt, p); break;
    case 'stalk': tStalk(me, dt, p); break;
    case 'hold': tHold(me, dt, p); break;
    case 'advance': me.tAdvance(dt, p); break;
    case 'backoff': tBackoff(me, dt, p); break;
    case 'cover': tCover(me, dt, p); break;
    case 'ambush': tAmbush(me, dt, p); break;
    case 'flank': tFlank(me, dt, p); break;
    case 'hunt': me.doHunt(dt); break;
    case 'suppress': tSuppress(me, dt); break;
    case 'reload': me.tReload(dt); break;
    case 'panic': tPanic(me, dt, p); break;
    default: me.halt(); if (me.sees) me.aimAt(p.x, p.y, dt);
  }
}

export function setTactic(me, t) {
  if (t === me.tactic) return;
  me.tactic = t;
  me.sub = ''; me.t = 0;
  me.path = null; me.dest = null; me.repath = 0; me.goal = null;
  if (t !== 'cover' && t !== 'ambush' && t !== 'stalk') { me.cover = null; me.director.release(me); }
}

// pick a tactic (every 0.3-0.5 s): weapon state first, then distance and squad role
export function plan(me, p) {
  const dist = Math.hypot(p.x - me.x, p.y - me.y), prev = me.tactic;
  if (me.standT > 0 && me.def.kind === 'gun' && me.weapon.mag > 0) return me.setTactic('hold');
  if (me.def.kind === 'gun' && me.weapon.mag <= 0 && me.reloading <= 0 && me.reserveCount() <= 0) {
    // dry: hurl the empty gun at him (or drop it) and go on with fists
    me.dropWeapon(me.sees ? Math.atan2(p.y - me.y, p.x - me.x) : me.angle + rand(-1, 1), me.sees ? 6 : 2);
    me.say('dry');
  }
  if (!me.armed) {
    if (me.sees && dist < 90) return me.setTactic('rush');
    if (me.lookForWeapon() || me.fleeToFriend()) return;
    return me.setTactic(me.sees ? 'rush' : 'hunt');
  }
  if (me.panicT > 0) return me.setTactic('panic');
  if (me.def.kind === 'melee') return planMelee(me, p, dist);
  if (me.reloading > 0 || me.needsReload()) return me.setTactic('reload');
  if (me.sees && meleeThreat(me, p, dist)) return me.setTactic('backoff');
  const shotgun = me.def.pellets > 1;
  if (!me.sees) {
    if ((prev === 'flank' && me.goal) || ((prev === 'cover' || prev === 'ambush') && me.lostT < 2.5) || (prev === 'suppress' && me.burstLeft > 0)) return;
    if (prev === 'ambush' && me.ambushT > 0) return;
    // shotguns hold a corner near where he vanished instead of chasing him
    if (shotgun && me.lostT > 0.4 && !me.ambushed && me.lastKnown && planCover(me, me.lastKnown, 70, 4, true)) {
      me.setTactic('ambush');
      me.ambushed = true;
      me.ambushT = rand(4, 7);
      return;
    }
    if (!shotgun && me.lostT > 0.5 && me.lostT < 3 && me.suppressCD <= 0 && canSuppress(me)) {
      me.setTactic('suppress');
      me.burstLeft = me.def.burst ? 3 : 2;
      return;
    }
    if (me.lostT > 0.4) {
      if (me.director.wantsFlank(me) && planFlank(me)) return;
      me.setTactic('hunt');
    }
    return;
  }
  const [rMin, rMax] = RANGES[me.weapon.type] ?? [100, 220];
  if (!shotgun) {
    if (prev === 'cover' && me.cover && isCovered(me.world, me.cover.x, me.cover.y, p.x, p.y) && me.volleys < 3) return;
    if (me.world.time > me.coverT && planCover(me, p, (rMin + rMax) / 2, 5, false)) {
      me.coverT = me.world.time + 1.2;
      me.setTactic('cover');
      me.volleys = 0;
      return;
    }
  }
  if (dist > rMax) return me.setTactic('advance');
  if (dist < rMin) return me.setTactic('backoff');
  if (prev === 'hold' && chance(0.2) && me.director.wantsFlank(me) && planFlank(me)) return;
  me.setTactic('hold');
}

// melee: rush, but get closer from cover to cover while a gun is pointed at us from afar
function planMelee(me, p, dist) {
  if (!me.sees) return me.setTactic(me.lostT < 0.6 ? 'rush' : 'hunt');
  if (me.tactic === 'stalk' && me.cover) return;
  const aimed = p.def.kind === 'gun' && Math.abs(angDiff(p.angle, Math.atan2(me.y - p.y, me.x - p.x))) < 0.35;
  if (aimed && dist > 150 && me.stalkCD <= 0 && planCover(me, p, 60, 4, true)) {
    me.setTactic('stalk');
    me.hideT = 0;
    return;
  }
  me.setTactic('rush');
}

// a cover spot (hidden from the threat, with a peek cell) claimed for this guard; false when none / no budget
function planCover(me, threat, prefDist, radius, approach) {
  const d = me.director;
  if (!d.budget(3)) return false;
  // a table to tip over in front of a spot is worth a detour; he does it once there (tCover)
  const tables = approach ? [] : me.world.props.filter((p) => p.def.flips && !p.dead);
  const flip = (x, y) => tableToFlip(tables, x, y, threat.x, threat.y, AI.flip.reach);
  const c = findCover(me.world, me, threat.x, threat.y, prefDist, (x, y) => d.isClaimed(x, y, me), radius, approach,
    tables.length ? (x, y) => (flip(x, y) ? AI.flip.pull : 0) : null);
  if (!c) return false;
  if (tables.length) c.flip = flip(c.x, c.y);
  me.cover = c;
  d.claim(me, c.x, c.y);
  return true;
}

function planFlank(me) {
  const lk = me.lastKnown;
  if (!lk || !me.director.budget(3)) return false;
  const f = findFlank(me.world, me, lk.x, lk.y, me.director.coverage(lk, me), (RANGES[me.weapon?.type]?.[1] ?? 200) * 0.75);
  if (!f) return false;
  me.setTactic('flank');
  me.goal = f;
  me.director.claim(me, f.x, f.y);
  return true;
}

// melee rush: weaving, dodging sideways when a gun points at us
function tRush(me, dt, p) {
  const d = me.def, dx = p.x - me.x, dy = p.y - me.y, dist = Math.hypot(dx, dy);
  if (!me.sees) {
    const lk = me.lastKnown || p;
    me.travel(dt, lk.x, lk.y, ENEMY.runSpeed * me.pace, { near: 16 });
    return;
  }
  me.aimAt(p.x, p.y, dt, 1.4);
  const aimed = p.def.kind === 'gun' && dist > 40 && Math.abs(angDiff(p.angle, Math.atan2(-dy, -dx))) < 0.25;
  if (aimed && me.dodgeCD <= 0) { me.dodge = chance(0.5) ? 0.28 : -0.28; me.dodgeCD = rand(0.9, 1.6); }
  // a comrade held in front of him as a shield: round to his open side, not straight at the hostage
  const round = p.shield ? flankSide(p, me, me.seed > 50 ? 1 : -1) : 0;
  const side = round ? -round / SHIELD.flank.in : me.dodge !== 0 ? Math.sign(me.dodge) * 1.6 : Math.sin(me.world.time * 4 + me.seed) * 0.35;
  if (me.dodge !== 0) me.dodge = Math.sign(me.dodge) * Math.max(0, Math.abs(me.dodge) - dt) || 0;
  const ux = dx / (dist || 1), uy = dy / (dist || 1);
  // straight at him while the way is open; held up there (a mate in a doorway) he takes the path, which goes round
  const sp = ENEMY.runSpeed * me.pace;
  me.rushHeld = me.moving < sp * 0.25 && dist > 40 ? me.rushHeld + dt : Math.max(0, me.rushHeld - dt);
  if (me.rushHeld < 0.6 && me.world.map.walkLine(me.x, me.y, p.x, p.y, 6)) {
    const gw = me.giveWay(ux, uy);
    const k = dist < 50 && !round ? 0 : 1, planted = me.tell > 0 ? TELL.pace : 1; // winding up, he plants his feet
    me.steer(ux - uy * side * k + gw.x, uy + ux * side * k + gw.y, sp * gw.slow * planted * (me.dodge ? 1.25 : 1), 0.3);
  } else if (me.travel(dt, p.x, p.y, ENEMY.runSpeed * me.pace, { look: false, near: 4 }) && dist > 30 && me.jamTries < AI.nav.jam.tries) {
    // no way round on foot (he stands behind a counter, on a roof edge): straight at him, over what is in the way
    if (!me.tryVault(Math.atan2(dy, dx))) me.steer(ux, uy, ENEMY.runSpeed * me.pace, 0.3);
  }
  // in reach (or about to be): he winds his blow up, it comes a moment later (Character.windUp)
  if (dist < d.range + p.radius + TELL.reach && me.react <= 0) me.windUp();
}

// melee: sprint to the next cover closer to him, catch breath a beat, then go again
function tStalk(me, dt, p) {
  const c = me.cover;
  if (!c || me.t > 3) { me.stalkCD = 1.5; me.thinkT = 0; me.setTactic('rush'); return; }
  if (me.travel(dt, c.x, c.y, ENEMY.runSpeed * me.pace, { near: 8 })) {
    me.halt();
    me.kneel = true;
    if (me.sees) me.aimAt(p.x, p.y, dt);
    if ((me.hideT += dt) > 0.5) { me.hideT = 0; me.stalkCD = rand(1.2, 2.2); me.thinkT = 0; me.setTactic('rush'); }
  }
}

function tHold(me, dt, p) {
  if ((me.strafeT -= dt) <= 0) { me.strafeT = rand(1.2, 2.6); me.strafe = chance(0.5) ? 0 : chance(0.5) ? 0.5 : -0.5; }
  if (me.strafe) {
    const a = Math.atan2(p.y - me.y, p.x - me.x) + Math.PI / 2 * Math.sign(me.strafe);
    me.steer(Math.cos(a), Math.sin(a), ENEMY.walkSpeed * 0.9, 0.12);
    me.strafe = Math.sign(me.strafe) * Math.max(0, Math.abs(me.strafe) - dt) || 0;
  } else me.halt();
  if (me.sees) { me.aimAt(p.x, p.y, dt); me.tryFire(p); }
}

export function tAdvance(me, dt, p) {
  const shotgun = me.def.pellets > 1;
  me.travel(dt, p.x, p.y, ENEMY.runSpeed * (shotgun ? 0.75 : 0.6), { look: !me.sees, near: 30 });
  if (me.sees) { me.aimAt(p.x, p.y, dt); me.tryFire(p); }
}

// keep distance, especially from a player charging with a melee weapon
function tBackoff(me, dt, p) {
  const dx = me.x - p.x, dy = me.y - p.y, d = Math.hypot(dx, dy) || 1;
  const sep = me.separation();
  let ax = dx / d, ay = dy / d;
  if (me.moving < 0.4 && me.t > 0.3) { const s = me.seed > 50 ? 1 : -1; ax = -dy / d * s + ax * 0.3; ay = dx / d * s + ay * 0.3; }
  me.steer(ax + sep.x, ay + sep.y, ENEMY.walkSpeed * 1.7, 0.15);
  if (me.sees) { me.aimAt(p.x, p.y, dt); me.tryFire(p); }
}

// run to cover, duck, peek out to fire a volley, duck back
function tCover(me, dt, p) {
  const c = me.cover;
  if (!c) { me.thinkT = 0; me.halt(); return; }
  const lk = me.sees ? p : me.lastKnown || p;
  if (me.sub === '') {
    const arrived = me.travel(dt, c.x, c.y, ENEMY.runSpeed * 0.95, { look: false, near: 6 });
    me.aimAt(lk.x, lk.y, dt);
    if (arrived) {
      me.sub = c.flip && Math.hypot(c.x - me.x, c.y - me.y) < 16 ? 'flip' : 'hide';
      me.t = 0; me.hideT = rand(0.6, 1.2);
    }
    return;
  }
  if (me.sub === 'flip') {
    // a step up to the table in front of his spot and over it goes, its top toward the threat; then back behind it
    const f = c.flip, F = AI.flip;
    const dx = f ? f.x - me.x : 0, dy = f ? f.y - me.y : 0, d = Math.hypot(dx, dy);
    if (f && !f.prop.dead && d > F.near && me.t < F.time) {
      me.steer(dx, dy, ENEMY.runSpeed * 0.8);
      me.faceAngle(f.a, ENEMY.turnRate, dt);
      return;
    }
    if (f && d < F.near * 3) f.prop.flip(f.a);
    c.flip = null;
    me.sub = 'hide'; me.t = 0;
    return;
  }
  if (me.sub === 'hide') {
    me.travel(dt, c.x, c.y, ENEMY.walkSpeed * 1.4, { look: false, near: 5 });
    me.kneel = true;
    me.aimAt(lk.x, lk.y, dt, 0.6);
    if (me.t > me.hideT && !(me.reloading > 0)) { me.sub = 'peek'; me.t = 0; me.shots = 0; }
    return;
  }
  me.travel(dt, c.peek.x, c.peek.y, ENEMY.walkSpeed * 1.5, { look: false, near: 5 });
  me.aimAt(lk.x, lk.y, dt);
  if (me.sees && me.tryFire(p)) me.shots++;
  const done = me.def.burst ? me.shots > 0 && me.burst === 0 : me.shots >= 2;
  if (done || me.t > 1.8) {
    me.sub = 'hide'; me.t = 0; me.hideT = rand(0.8, 1.6);
    me.volleys++;
    if (me.needsReload()) me.thinkT = 0;
  }
}

// shotgun: crouch behind a corner, gun on the way he will come through
function tAmbush(me, dt, p) {
  const c = me.cover;
  me.ambushT -= dt;
  if (!c || me.ambushT <= 0) { me.thinkT = 0; me.setTactic('hunt'); return; }
  const lk = me.sees ? p : me.lastKnown || p;
  if (me.sub === '') {
    if (me.travel(dt, c.x, c.y, ENEMY.runSpeed * 0.8, { near: 6 })) me.sub = 'wait';
    return;
  }
  me.halt();
  me.kneel = true;
  me.aimAt(c.peek.x + (lk.x - c.peek.x) * 0.5, c.peek.y + (lk.y - c.peek.y) * 0.5, dt, 0.8);
  if (me.sees) { me.aimAt(p.x, p.y, dt); me.tryFire(p); }
}

function tFlank(me, dt, p) {
  const g = me.goal;
  if (!g) { me.thinkT = 0; me.halt(); return; }
  if (me.travel(dt, g.x, g.y, ENEMY.runSpeed * 0.9, { near: 10 })) { me.goal = null; me.thinkT = 0; }
  if (me.sees) { me.aimAt(p.x, p.y, dt); me.tryFire(p); }
}

// a short burst at the last known position when he ducks out of sight
function tSuppress(me, dt) {
  const lk = me.lastKnown;
  me.halt();
  if (!lk) { me.thinkT = 0; return; }
  me.aimAt(lk.x, lk.y, dt);
  if (me.tryFire(lk, ENEMY.suppressWild)) me.burstLeft--;
  if (me.burstLeft <= 0 || me.t > 2) { me.burstLeft = 0; me.suppressCD = rand(3, 5); me.thinkT = 0; me.setTactic('hold'); }
}

// get to nearby cover if any, then reload and shout it
export function tReload(me, dt) {
  const lk = me.lastKnown;
  if (lk) me.aimAt(lk.x, lk.y, dt, 0.6);
  if (me.reloading > 0) { me.kneel = true; me.halt(); return; }
  if (!me.needsReload()) { me.thinkT = 0; me.halt(); return; }
  if (me.sub === '' && lk) me.sub = planCover(me, lk, 150, 3, false) ? 'go' : 'now';
  if (me.sub === 'go' && me.cover && !me.travel(dt, me.cover.x, me.cover.y, ENEMY.runSpeed, { look: false, near: 6 }) && me.t < 2) return;
  me.halt();
  if (me.reload()) me.say('reload');
}

function tPanic(me, dt, p) {
  if (!me.goal) {
    const a = Math.atan2(me.y - p.y, me.x - p.x) + rand(-0.8, 0.8);
    me.goal = randomPoint(me.world.map, me.x + Math.cos(a) * 160, me.y + Math.sin(a) * 160, 2) || { x: me.x, y: me.y };
  }
  if (me.travel(dt, me.goal.x, me.goal.y, ENEMY.runSpeed, { near: 12 })) me.halt();
  if (me.sees && chance(0.5)) { me.aimAt(p.x, p.y, dt, 0.7); me.tryFire(p, 0.35); }
  if (me.panicT <= 0) me.thinkT = 0;
}

export function aimAt(me, x, y, dt, k = 1) { me.faceTo(x, y, ENEMY.turnRate * k, dt); }

// pull the trigger if the gun is ready and on target; the shot goes off with an error that shrinks
// with steady sight (settle). wild = extra error (suppressive / panic fire)
export function tryFire(me, tg, wild = 0) {
  const d = me.def;
  if (d.kind !== 'gun' || !inHand(me) || me.react > 0 || me.cooldown > 0 || me.reloading > 0 || me.weapon.mag <= 0) return false;
  if (me.holdsFire(tg)) return false;
  const dist = Math.hypot(tg.x - me.x, tg.y - me.y);
  if (dist > ENEMY.fireRange || Math.abs(angDiff(me.angle, Math.atan2(tg.y - me.y, tg.x - me.x))) > ENEMY.aimTolerance + wild) return false;
  // fairness: never fire from outside the player's screen
  if (!me.onScreen()) return false;
  if (me.friendInLine(tg.x, tg.y, dist)) { me.strafe = me.seed > 50 ? 0.5 : -0.5; me.strafeT = 0.6; return false; }
  const a = me.angle;
  me.angle += spread() * (aimError(me.settle, me.world.player.moving) + wild);
  const r = me.attack();
  me.angle = a;
  if (r !== true) return false;
  if (d.burst) {
    me.burst++;
    me.cooldown = me.burst >= d.burst ? rand(0.7, 1.1) : d.rate * ENEMY.fireRateMul;
    if (me.burst >= d.burst) me.burst = 0;
  } else me.cooldown = d.enemyRate * ENEMY.fireRateMul * rand(0.85, 1.25) * me.rate;
  return true;
}

// The man in his sights holds one of his own as a shield (Player.shield): he holds his fire SHIELD.hesitate s from
// the moment he sees it (a brute far less), shouting at him to let the man go while the man begs; then he fires
// anyway. A man dead in those arms holds nobody's fire.
export function holdsFire(me, tg) {
  const sh = tg.shield;
  if (!sh || sh.dead) { me.hostage = null; return false; }
  if (me.hostage?.who !== sh.target) {
    me.hostage = { who: sh.target, t: me.world.time };
    me.barkT = 0;
    me.say('release');
    sh.target.barkT = 0;
    sh.target.say('hostage');
  }
  return me.world.time - me.hostage.t < hesitation(me.kind);
}

// the player has just seized a comrade before his eyes (Player.startShield): he is on him at once
export function seeHostage(me, p) {
  if (!me.alive || me.passive || me.dormant || me.yielded || me.knocked > 0 || me.held || me.aware === 2) return;
  if (!me.canSee(p)) return;
  me.meter = 1;
  me.spot(false);
}

// let go by the man who held him as a shield (killed, or taken over by the getaway): on him at once
export function freed(me, p) {
  me.lastKnown = { x: p.x, y: p.y };
  me.meter = 1;
  if (!me.passive) me.spot(false);
}

export function onScreen(me) {
  const cam = me.world.camera, v = cam.viewRadius();
  return Math.abs(me.x - cam.x) < v.x - 52 && Math.abs(me.y - cam.y) < v.y - 52;
}

export function friendInLine(me, tx, ty, dist) {
  const ux = (tx - me.x) / dist, uy = (ty - me.y) / dist;
  for (const e of me.world.enemies) {
    if (e === me || !e.alive || e.knocked > 0 || e.held?.shield) continue; // (a hostage is not spared: holdsFire)
    const rx = e.x - me.x, ry = e.y - me.y, along = rx * ux + ry * uy;
    if (along > 0 && along < dist && Math.abs(rx * uy - ry * ux) < 10) return true;
  }
  return false;
}

function meleeThreat(me, p, dist) {
  if (p.def.kind !== 'melee' || dist > 130) return false;
  const v = Body.getVelocity(p.body);
  return ((me.x - p.x) * v.x + (me.y - p.y) * v.y) / dist > 1.2;
}

function canSuppress(me) {
  const lk = me.lastKnown, d = me.def;
  if (!lk || d.kind !== 'gun' || d.pellets > 1 || d.rocket || me.weapon.mag <= 0) return false;
  return Math.hypot(lk.x - me.x, lk.y - me.y) < 300 && me.onScreen() && me.world.lineOfSight(me.x, me.y, lk.x, lk.y);
}

// empty, or low while out of sight (and there is something to reload with)
export function needsReload(me) {
  const w = me.weapon;
  if (!w || me.def.kind !== 'gun' || me.reloading > 0 || me.reserveCount() <= 0) return false;
  return w.mag <= 0 || (!me.sees && w.mag < me.def.mag * 0.35);
}
