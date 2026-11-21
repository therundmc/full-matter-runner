// The human shield (SHIELD in data/feel.js, the rules: systems/Shield.js): a standing guard taken from behind in a
// choke hold, carried in front of the player, rounds and thrown things stopped from the front arc, killed over his
// shoulder or thrown. Functions of the player (`me`), DOM-free.
import { ENEMY, CAT, MASK } from '../../Config.js';
import { WEAPONS, oneHanded } from '../../data/weapons.js';
import { rand, angDiff, lerp } from '../../../engine/math.js';
import { throwSpeed } from '../../systems/Kick.js';
import { covers, dragFeet } from '../../systems/Shield.js';
import { MOMENTS, SHIELD } from '../../data/feel.js';
import { landMoment } from '../../fx/Impact.js';
import { pulls } from './Hands.js';

const { Body } = Matter;

// E on a standing guard who offers it (from behind only), a hand free for it: he is held in front of us in a choke
// hold, his back to our chest, and goes where we turn (updateShield); he can do nothing (Enemy.held). What comes at
// us from the front hits him (shieldStops). The guards who see it are on us at once. The poses: CharacterAnim
// shieldPose (ours), hostagePose (his), painted as one pair (drawPair, Character.draw); shieldOutPose once he is
// let go (me.shieldOut: the shove of a throw, the arms opening after a kill).
export function startShield(me, target) {
  const w = me.world, group = Body.nextGroup(true);
  // (at: where he was put last step; kill: the click's beat { kind, K, t }; drag: a dead man's trailing feet)
  me.shield = { target, t: 0, hp: SHIELD.hp, dead: null, cover: SHIELD.corpse, volley: null, hit: -9, at: null, kill: null, drag: null };
  me.shieldOut = null;
  me.nearShield = me.nearTakedown = me.nearDowned = me.lunge = me.facingLock = null;
  me.swing = 0;
  target.held = me;
  target.dormant = false;
  target.swing = target.tell = target.reloading = 0;
  // bare hands on a man with a gun he can hold over him: it is in his hand (the user's call), its rounds with it,
  // never his spare magazines
  const gun = target.weapon, gd = gun && WEAPONS[gun.type];
  if (me.def.hold === 'none' && gd?.kind === 'gun' && oneHanded(gd)) {
    target.weapon = me.weapon = null;
    me.take(gun.type, gun.mag, gun.wear, gun.bare);
    me.pickFrom = { x: target.x, y: target.y };
  }
  if (w.director) { w.director.release(target); w.director.provoked = true; } // nobody seizes a guard by accident
  me.body.collisionFilter = { ...me.body.collisionFilter, group };
  target.body.collisionFilter = { category: CAT.CHAR, mask: MASK.CHAR, group };
  w.sound('shieldGrab', target.x, target.y, 0.9, { pitch: target.voice }); // placeholder (PLACEHOLDERS.md)
  w.events.emit('shield', { holder: me, target });
  for (const e of w.enemies) if (e !== target) e.seeHostage?.(me);
}

// He is kept in front of us, this side of a wall, turned as we are, and goes at the speed we take him at (our
// steps and our turns): his legs walk it (Gait.js), and he is where we are after the physics step, not a step
// late. (Put there dead still, he "stood" while his body was carried off his planted feet: the legs stretched,
// then snapped back under him.)
export function updateShield(me, dt) {
  const sh = me.shield, tg = sh.target, w = me.world;
  if (!tg.alive) { me.endShield(); return; } // a blast, a fire: something else got him
  sh.t += dt;
  if (sh.kill && (sh.kill.t += dt) >= sh.kill.K.at) { shieldKilled(me); return; }
  const a = me.angle, c = Math.cos(a), s = Math.sin(a), k = Math.min(1, sh.t / SHIELD.set);
  let gap = SHIELD.gap;
  while (gap > 2 && w.map.solidAt(me.x + c * gap, me.y + s * gap)) gap -= 3;
  // (hauled in from where he was put last step, not from where the speed he was given has since taken him)
  const at = sh.at, from = at || tg, n = Math.max(dt * 60, 1e-3);
  const x = lerp(from.x, me.x + c * gap, k), y = lerp(from.y, me.y + s * gap, k);
  let vx = at ? (x - at.x) / n : 0, vy = at ? (y - at.y) / n : 0;
  const sp = Math.hypot(vx, vy);
  if (sp > SHIELD.carry) { vx *= SHIELD.carry / sp; vy *= SHIELD.carry / sp; }
  if (sh.dead) dragFeet(sh, at ? x - at.x : 0, at ? y - at.y : 0, a, dt);
  sh.at = { x, y };
  Body.setPosition(tg.body, sh.at);
  tg.vel = { x: vx, y: vy };
  Body.setVelocity(tg.body, tg.vel);
  tg.angle += angDiff(tg.angle, a) * k;
}

// what the left click would do to him, for the HUD (null: it fires the gun)
export function shieldHint(me) {
  const d = me.def;
  if (d.kind === 'gun' && me.weapon.mag > 0) return null;
  return me.shield.dead ? 'DROP HIM' : d.swing === 'blade' ? 'CUT HIS THROAT' : 'BREAK HIS NECK';
}

// the left click with a man held: a loaded gun fires past him; else it kills him (shieldKill), a dry gun
// reloaded first if there is a magazine left; a man already dead is let fall
export function shieldAttack(me, input, d) {
  if (d.kind === 'gun' && me.weapon.mag > 0) {
    me.shootDown = null;
    if (pulls(d, input)) me.attack();
    return;
  }
  if (!input.mouseHit(0) || me.cooldown > 0 || me.reloading > 0 || me.shield.kill) return;
  if (d.kind === 'gun' && me.reload()) return;
  if (me.shield.dead) me.endShield();
  else shieldKill(me);
}

// His neck broken with the arm that holds him, or his throat opened by the blade in the other hand: the click
// starts the motion (SHIELD.kill `at` s of it: the wrench, the blade drawn across), he dies at its end (shieldKilled)
function shieldKill(me) {
  const kind = me.def.swing === 'blade' ? 'throat' : 'neck', K = SHIELD.kill[kind];
  me.shield.kill = { kind, K, t: 0 };
  me.throwHold = null;
  me.cooldown = K.at + K.cool;
}

function shieldKilled(me) {
  const sh = me.shield, tg = sh.target, w = me.world, d = me.def, a = me.angle, K = sh.kill.K;
  w.sound(K.sound, tg.x, tg.y, 1, { pitch: tg.voice }); // shieldNeck: placeholder (PLACEHOLDERS.md)
  if (K.wound) w.particles.blood(tg.x + Math.cos(a) * 3, tg.y + Math.sin(a) * 3, a + Math.PI / 2 * me.punchSide, 0.8, 12, 180);
  w.noise(tg.x, tg.y, K.noise, me);
  tg.kill(a, K.cause, me, K.wound ? { gore: 0, wound: K.wound } : undefined, { label: K.label, from: 'behind', dying: 'slump', close: true });
  landMoment(w, tg, a, d, MOMENTS.takedown, !tg.alive);
  w.events.emit('shieldKill', { holder: me, victim: tg });
  me.endShield();
  me.shieldOut = { kind: sh.kill.kind, t: 0, dur: K.out };
  me.cooldown = K.cool;
}

// Something comes at us along a from `shooter` (a round of weapon `by`; a thing thrown: no `by`). From the front
// arc the man we hold takes it: SHIELD.hp rounds (a shotgun's blast is one hit worth SHIELD.blast) and he dies in
// our arms; his body stops SHIELD.corpse more, then slips to the floor. A heavy round goes through the two.
// Whether it was stopped.
export function shieldStops(me, a, by, shooter) {
  const sh = me.shield, S = SHIELD, w = me.world;
  if (!sh || !covers(me.angle, a)) return false;
  const tg = sh.target, pellets = by?.pellets > 1;
  w.particles.blood(tg.x, tg.y, a, 0.6, pellets ? 4 : 10, 160);
  w.particles.blood(tg.x, tg.y, a + Math.PI, 0.7, 3, 90);
  if (pellets) {
    const v = sh.volley;
    if (v && v.owner === shooter && w.time - v.t < S.volley) return true;
    sh.volley = { owner: shooter, t: w.time };
  }
  w.sound('splat', tg.x, tg.y, 0.5);
  w.decals.stampBlood(tg.x, tg.y, 2.5, 3);
  sh.hit = w.time;
  if (sh.dead) {
    if (--sh.cover <= 0) me.endShield();
    return !by?.heavy;
  }
  sh.hp -= by?.heavy ? S.hp : !by ? S.thrown : pellets ? S.blast : 1;
  if (sh.hp <= 0) {
    sh.dead = { a, by: by || {}, killer: shooter, t: w.time };
    sh.kill = null; // (a wrench under way: there is nobody left to kill)
    tg.dropWeapon(a + rand(-1, 1), 1.5);
    w.sound('cry', tg.x, tg.y, 1, { pitch: tg.voice });
    w.shake(0.12);
  }
  return !by?.heavy;
}

// the right click let go: he is thrown along the aim (k: the charge), floored where he lands, and floors whoever
// he runs into on the way (Enemy.updateFlung); a man dead in our arms is thrown as the body he is
export function throwShield(me, k) {
  const sh = me.shield, tg = sh.target, w = me.world, T = SHIELD.throw, a = me.angle;
  if (sh.kill) return; // his neck is in the arm: that goes to its end
  if (sh.dead) sh.flingA = a;
  else {
    tg.knock(a, 'thrown', { speed: throwSpeed(lerp(T.dist[0], T.dist[1], k), ENEMY.knockBrake) });
    tg.flung = { by: me, a };
  }
  me.endShield();
  me.cooldown = T.cool;
  me.shieldOut = { kind: 'throw', t: 0, dur: T.out };
  w.sound('shieldThrow', me.x, me.y, 0.8 + 0.2 * k); // placeholder (PLACEHOLDERS.md)
}

// The hold is over: a man who died in our arms falls now (his death is told now: killed by his own, `hostage`),
// one thrown or killed is gone already, one still on his feet is free and turns on us (Enemy.freed)
export function endShield(me) {
  const sh = me.shield, tg = sh.target, D = sh.dead;
  me.shield = me.throwHold = null;
  me.body.collisionFilter = { ...me.body.collisionFilter, group: 0 };
  if (tg.held !== me) return;
  if (D && tg.alive) {
    const flung = sh.flingA !== undefined;
    if (flung) tg.held = null; // thrown: he falls the way he was sent
    tg.kill(flung ? sh.flingA : D.a, 'bullet', D.killer, D.by, { hostage: true, still: !flung });
  }
  tg.held = null;
  if (!tg.alive || tg.knocked > 0) return;
  tg.body.collisionFilter = { ...tg.body.collisionFilter, group: 0 };
  tg.freed?.(me);
}
