// A guard taken down unseen (data/finishers.js TAKEDOWNS, the rules: systems/Takedown.js, the poses: CharacterAnim
// takedownPose / heldPose): the move picked from where he stands to him and what is at hand (a wall, a table to slam
// his head on), pulled to it, its beats landed, the kill. Functions of the player (`me`), DOM-free.
import { TAKEDOWN, BODY_SCALE, TILE } from '../../Config.js';
import { WEAR, plantedOf } from '../../data/weapons.js';
import { chance, angDiff } from '../../../engine/math.js';
import { behind, newTakedown, advance, slamAt } from '../../systems/Takedown.js';
import { spotFor } from '../../systems/TakedownSpot.js';
import { takedownFor, takedownChoice, freeHand, shotCause, SLAM_SOUND } from '../../data/finishers.js';
import { MARKS } from '../../data/wounds.js';
import { MOMENTS } from '../../data/feel.js';
import { WALL_IMPACT } from '../../data/materials.js';
import { LIQUIDS } from '../../data/liquids.js';
import { splashWall } from '../../fx/Spatter.js';
import { blowFx } from '../../fx/Blows.js';
import { landMoment } from '../../fx/Impact.js';
import { muzzleFlash } from '../../fx/CombatFx.js';
import { WORN } from './Hands.js';

const { Body } = Matter;

// a takedown's beats that land on his head, and those of them done with our own body whatever is in the hand
const HEAD_BLOWS = new Set(['nape', 'butt', 'knee', 'headbutt', 'throat', 'sweep', 'temple']), BODY_BLOWS = new Set(['knee', 'headbutt', 'throat', 'sweep']);

// The takedown he will do to the next guard he takes from behind (data/finishers.js takedownChoice: a variant of
// his weapon's, not the one he did last; front: face to face), kept until it is done or the weapon changes: the
// hint names it.
export function pickTakedown(me, front = false) {
  const own = takedownFor(me.def, me.weapon), n = me.nextTakedown;
  if (!n || n.own !== own || n.front !== front || (n.f.rounds ?? 0) > (me.weapon?.mag ?? 0)) {
    me.nextTakedown = { own, front, f: takedownChoice({ d: me.def, weapon: me.weapon, front, last: me.lastTakedown }) };
  }
  return me.nextTakedown.f;
}

// Seize a guard who has not spotted us (data/finishers.js TAKEDOWNS, by what is in the hand, by what stands in front
// of him, from behind or face to face): he can do nothing until it is over (Enemy.held) and we are locked in it;
// the beats land on the clock of systems/Takedown.js (advance). The two bodies stop pushing each other apart for
// the length of it: pressed against him. The poses: CharacterAnim takedownPose (ours), heldPose (his).
// move: { f, spot, front } (takedownMove; a given one: the tests).
export function startTakedown(me, target, move = me.takedownMove(target)) {
  if (target.shakeOff?.(me)) return; // a boss still whole throws him off (entities/Boss.js)
  const { f, spot = null, front = false } = move, group = Body.nextGroup(true);
  me.lastTakedown = f;
  me.nextTakedown = null;
  // wounds: what the beats before the kill did to him, shown on his body after ([where, what])
  // wears: done with the weapon in hand (not a hand in his hair), it takes a blow out of it on the kill
  // def: the weapon it is played with to the end (CharacterAnim takedownPose), even one that breaks on the kill
  me.takedown = Object.assign(newTakedown(f, !!target.yielded), {
    target, spot, front, side: chance(0.5) ? 1 : -1, d: Math.hypot(target.x - me.x, target.y - me.y) / BODY_SCALE, wounds: [],
    wears: !spot && !!me.weapon && !!me.def.wear, def: me.def,
  });
  me.contextAction = null;
  me.swing = 0;
  target.held = me;
  target.swing = target.tell = 0;
  for (const b of [me.body, target.body]) b.collisionFilter = { ...b.collisionFilter, group };
}

// the takedown he would play on `target`: by the weapon in hand, or, with a hand free for it, by what stands in
// front of the man (systems/TakedownSpot.js): { f (its TAKEDOWNS entry), spot }
export function takedownMove(me, target) {
  const w = me.world, d = me.def, front = !behind(me, target);
  // what his head can go into: what he is turned to; from the front we stand there ourselves, so what is on his
  // far side from us (he is spun round to it, pullTo)
  const from = front ? { x: target.x, y: target.y, angle: Math.atan2(target.y - me.y, target.x - me.x) } : target;
  const spot = freeHand(d) ? spotFor(from, w.map, w.props) : null;
  if (spot) return { f: takedownChoice({ d, weapon: me.weapon, spot }), spot, front: false };
  return { f: me.pickTakedown(front), spot: null, front };
}

export function updateTakedown(me, dt) {
  const td = me.takedown, tg = td.target, w = me.world, f = td.f;
  if (!td.done) {
    if (!tg.alive) { me.endTakedown(); return; } // somebody got him first
    if (td.spot) pullTo(me, td, dt);
    // face to face: he is turned to us, and we stand in front of him
    else if (td.front) tg.angle += angDiff(tg.angle, Math.atan2(me.y - tg.y, me.x - tg.x)) * (1 - Math.exp(-dt * 3 / TAKEDOWN.set));
    // set at the sequence's gap behind him (a little to one side), looking at him
    // (his head driven into something: we go in with each blow, drawn back with the pull: f.lunge)
    const sl = td.spot ? slamAt(td) : null, gap = sl ? f.gap - f.lunge[0] * sl.drive + f.lunge[1] * sl.back : f.gap;
    const side = td.front ? -1 : 1, c = Math.cos(tg.angle) * side, s = Math.sin(tg.angle) * side, lat = f.lat ?? 0;
    const at = { x: tg.x - c * gap - s * lat, y: tg.y - s * gap + c * lat };
    if (!w.map.solidAt(at.x, at.y)) {
      const k = 1 - Math.exp(-dt * 3 / TAKEDOWN.set);
      Body.setPosition(me.body, { x: me.x + (at.x - me.x) * k, y: me.y + (at.y - me.y) * k });
    }
    me.angle = Math.atan2(tg.y - me.y, tg.x - me.x);
    td.d = Math.hypot(tg.x - me.x, tg.y - me.y) / BODY_SCALE;
  }
  me.vel = { x: 0, y: 0 };
  Body.setVelocity(me.body, me.vel);
  const landed = advance(td, dt);
  landed.forEach((what, i) => landTakedown(me, what, td.done && i === landed.length - 1));
  if (td.over) me.endTakedown();
}

// a takedown with a spot: he is pulled to it (f.stand px off its surface) and turned square to it
function pullTo(me, td, dt) {
  const tg = td.target, sp = td.spot, k = 1 - Math.exp(-dt * 3 / TAKEDOWN.set);
  const at = { x: sp.x + sp.nx * td.f.stand, y: sp.y + sp.ny * td.f.stand };
  if (!me.world.map.solidAt(at.x, at.y)) Body.setPosition(tg.body, { x: tg.x + (at.x - tg.x) * k, y: tg.y + (at.y - tg.y) * k });
  tg.vel = { x: 0, y: 0 };
  Body.setVelocity(tg.body, tg.vel);
  tg.angle += angDiff(tg.angle, Math.atan2(-sp.ny, -sp.nx)) * k;
}

// His head meets what is in front of him (a takedown's spot) `into` px past its surface: his blood thrown back out
// of it, the surface marked (a dent in a wall, a crack in porcelain, his blood on it), what it is made of flying
// (Prop.hit: splinters, chips, the water of a toilet; what stands on it knocked off: systems/Clutter.js), the blow
// heard; the last one harder.
function slamFx(me, td, last) {
  const w = me.world, sp = td.spot, P = w.particles, k = last ? 1.4 : 1;
  const x = sp.x - sp.nx * td.f.into, y = sp.y - sp.ny * td.f.into, out = Math.atan2(sp.ny, sp.nx), into = out + Math.PI;
  P.blood(x, y, out, 1.3, Math.round(9 * k), 150 * k);
  P.blood(x, y, into, 0.9, Math.round(4 * k), 90);
  const p = sp.prop;
  if (p) {
    p.hit(last ? 1 : 0.6, sp.x - sp.nx, sp.y - sp.ny, into, last ? 1.7 : 1.3, 'blunt', { heft: 1 });
    p.bloody?.(x, y, last ? 3.5 : 2.2);
    if (p.def.water) {
      // the water of the bowl thrown up and out over the floor
      const wet = LIQUIDS.kinds.water;
      P.drops(x, y, out, 1.5, Math.round(14 * k), wet.splash, 150, 8);
      P.jet(x, y, Math.round(6 * k), { vz: 160, speed: 50, size: 2.2, alpha: 0.5 });
      w.events.emit('spill', { x: sp.x + sp.nx * 8, y: sp.y + sp.ny * 8, kind: 'water', area: 60 * k, a: out });
    }
  } else {
    // a wall: dented and cracked, its dust, his blood splashed on its face and running down
    const cx = Math.floor((sp.x - sp.nx * 3) / TILE), cy = Math.floor((sp.y - sp.ny * 3) / TILE);
    const s = WALL_IMPACT[w.map.at(cx, cy)] || WALL_IMPACT.X;
    w.damageWall(cx, cy, 1, sp.x - sp.nx * 4, sp.y - sp.ny * 4, into);
    w.decals.wallHit(sp.x, sp.y, sp.nx, sp.ny, 'blow', last ? 1.1 : 0.8);
    P.chips(sp.x, sp.y, out, 0.9, Math.round(5 * k), s.chips, 90);
    P.dust(sp.x + sp.nx * 2, sp.y + sp.ny * 2, Math.round(3 * k), 2, s.dust, { speed: 16, size: 3.5, life: 1.6, alpha: 0.25, vx: sp.nx * 18, vy: sp.ny * 18 });
    splashWall(w, { x: sp.x, y: sp.y, nx: sp.nx, ny: sp.ny }, into, last ? 3.4 : 2.4, last ? 2 : 1);
  }
  w.decals.stampBlood(sp.x + sp.nx * 4, sp.y + sp.ny * 4, last ? 2.2 : 1.4, 2);
  w.sound(SLAM_SOUND[sp.kind] || SLAM_SOUND[p?.def.material] || 'headSlamWood', x, y, last ? 1 : 0.85);
  w.sound('punch', x, y, 0.7, { pitch: 0.7 });
}

// a beat of the takedown lands (last: the one that kills)
function landTakedown(me, what, last) {
  const td = me.takedown, tg = td.target, w = me.world, f = td.f, d = me.def, a = me.angle;
  const k = td.front ? 3 : -3, nape = { x: tg.x + Math.cos(tg.angle) * k, y: tg.y + Math.sin(tg.angle) * k }; // his nape, or his face
  if (what === 'seize') w.sound('grab', tg.x, tg.y, f.grip === 'mouth' ? 0.45 : 0.9, { pitch: tg.voice }); // a muffled cry
  else if (what === 'struggle') w.sound('soft', tg.x, tg.y, 0.5);
  else if (what === 'windup') w.sound('swing', me.x, me.y, 0.5, { pitch: 0.7, weapon: me.weapon?.type });
  else if (what === 'limp') w.sound('soft', tg.x, tg.y, 0.6, { pitch: 0.8 });
  else if (what === 'stab' || what === 'wrench') {
    // the blade in his side, then turned there: little shows, he arches
    const side = { x: tg.x - Math.cos(tg.angle) * 2 + Math.sin(tg.angle) * -4, y: tg.y - Math.sin(tg.angle) * 2 + Math.cos(tg.angle) * 4 };
    w.sound(what === 'stab' ? 'slash' : 'bladeTwist', side.x, side.y, 0.8);
    w.particles.blood(side.x, side.y, a + Math.PI, 0.5, what === 'stab' ? 5 : 8, 140);
  } else if (what === 'kneeHit' || what === 'kneeShot' || what === 'backShot') {
    // his knee from behind (a club swung low, a round), or a round in his back: he cries out and gives
    const o = what === 'backShot' ? 0 : (td.wounds.length % 2 ? -1 : 1) * 3.5;
    const at = { x: tg.x - Math.cos(tg.angle) * 3 - Math.sin(tg.angle) * o, y: tg.y - Math.sin(tg.angle) * 3 + Math.cos(tg.angle) * o };
    if (what === 'kneeHit') {
      w.sound('clubHit', at.x, at.y, 0.8, { material: d.material });
      w.sound('boneCrack', at.x, at.y, 0.9);
    } else {
      fireInto(me, d);
      if (what === 'kneeShot') w.sound('kneeShot', at.x, at.y, 0.9);
    }
    w.particles.blood(at.x, at.y, a, 0.5, 8, 200);
    w.decals.stampBlood(at.x, at.y, 3, 2);
    w.sound('cry', tg.x, tg.y, 0.9, { pitch: tg.voice });
    td.wounds.push([what === 'backShot' ? 'chest' : `knee${td.wounds.length % 2}`, what]);
  } else if (HEAD_BLOWS.has(what)) {
    // a blow on his head: what it is made of rings over it, a few drops thrown on
    if (d.hold === 'none' || BODY_BLOWS.has(what)) w.particles.blood(nape.x, nape.y, a, 0.35, what === 'knee' ? 6 : 2, 220);
    else if (d.swing === 'club') blowFx(w, d, tg, a, { heavy: true, from: td.front ? 'front' : 'behind' });
    else {
      w.sound('clubHit', nape.x, nape.y, 0.9, { material: d.hold === 'two' ? 'wood' : 'metal' });
      w.particles.blood(nape.x, nape.y, a, 0.35, 4, 220);
    }
    w.sound('punch', nape.x, nape.y, 0.8, { pitch: 0.75 });
  } else if (what === 'shot') fireInto(me, d);
  const slam = what === 'smash' || what === 'dunk';
  if (slam) slamFx(me, td, last);
  const blow = HEAD_BLOWS.has(what) || what === 'kneeHit', round = what === 'shot' || what === 'kneeShot' || what === 'backShot';
  if (f.noise && (blow || slam || (last && !round))) w.noise(tg.x, tg.y, f.noise, me);
  if (!last) {
    if (blow || what === 'stab' || what === 'kneeShot' || what === 'backShot') landMoment(w, tg, a, d, MOMENTS.beat, false);
    else if (slam) landMoment(w, tg, a, d, MOMENTS.slam, false);
    return;
  }
  // the kill: he goes down the sequence's way (data/wounds.js KNEELS), from his knees if he is on them already
  // (driven into a piece of furniture: he stays against it, folded over it or sat against its side); one without
  // a way of its own (face to face) is thrown back like any man killed
  const sp = td.spot, against = sp?.prop ? { prop: sp.prop, x: sp.x, y: sp.y, nx: sp.nx, ny: sp.ny } : null;
  // the blow it takes out of the weapon it was done with (td.wears): the one that uses it up breaks it on this beat,
  // a blade left in him
  const breaks = td.wears && !!me.weapon && (me.weapon.wear -= WEAR.man) <= WORN, lodge = breaks && d.breaks === 'lodge';
  const how = { label: f.label, from: td.front ? 'front' : 'behind', dying: sp?.rest === 'sit' ? 'sit' : f.dying,
    kneeling: td.downAt >= 0, last: what === 'shot' && me.weapon.mag === 0, limp: !!f.limp, env: sp?.kind, against, close: true };
  if (breaks) how.broke = true;
  const cause = f.cause === 'shot' ? shotCause(d) : f.cause;
  let by = f.wound ? { gore: 0, wound: f.wound } : f.cause === 'snap' ? undefined : d;
  if (lodge) by = { ...by, stuck: plantedOf(d) };
  const n = w.corpses.length;
  tg.kill(a, cause, me, by, how);
  if (breaks) me.breakWeapon(a, lodge, nape);
  // what was done to him on the way shows on his body
  const body = w.corpses.length > n ? w.corpses[w.corpses.length - 1] : null;
  if (body?.struck) for (const [where, did] of td.wounds) body.struck(where, a, did === 'kneeHit' ? MARKS.blunt : MARKS[d.wound]);
  landMoment(w, tg, a, d, td.spot ? MOMENTS.slamKill : MOMENTS.takedown, !tg.alive);
}

// one round of the gun in hand let off into a man held (a takedown's beat)
function fireInto(me, d) {
  const w = me.world, m = me.muzzlePos();
  me.weapon.mag--;
  me.recoil = 1;
  muzzleFlash(w, m.x, m.y, m.a, d, me);
  w.sound(d.sound, me.x, me.y);
  if (d.noise) w.noise(me.x, me.y, d.noise, me, 'gunshot');
}

export function endTakedown(me) {
  const tg = me.takedown.target;
  me.takedown = null;
  me.cooldown = 0.15;
  me.body.collisionFilter = { ...me.body.collisionFilter, group: 0 };
  if (tg.held === me) {
    tg.held = null;
    tg.body.collisionFilter = { ...tg.body.collisionFilter, group: 0 };
  }
}
