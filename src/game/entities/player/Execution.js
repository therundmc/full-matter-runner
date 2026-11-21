// Finishing a man on the floor (data/finishers.js FINISHERS, the pose: CharacterAnim execPose): the finisher
// picked for what is in the hand, its wind-up, its beats landed one by one (blood, marks, sounds, the hit-stop), the
// weapon breaking on it, the end. Functions of the player (`me`), DOM-free.
import { WEAPONS, WEAR, plantedOf } from '../../data/weapons.js';
import { rand, angDiff } from '../../../engine/math.js';
import { finisherChoice, killBeat, EXEC } from '../../data/finishers.js';
import { MARKS } from '../../data/wounds.js';
import { MOMENTS } from '../../data/feel.js';
import { blowFx } from '../../fx/Blows.js';
import { landOnBody } from '../../fx/Impact.js';
import { pulp } from '../../fx/Gore.js';
import { squirt } from '../../fx/Bleeding.js';
import { muzzleFlash } from '../../fx/CombatFx.js';
import { WORN } from './Hands.js';

const { Body } = Matter;

const GUN_BUTT = { swing: 'club', material: 'metal' }; // an empty gun brought down on a man: what rings (fx/Blows.js)
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// what a beat of a finisher leaves on a body already dead (data/wounds.js MARKS): a round's hole, a blade's, a blow's
const beatMark = (what, d) => (what === 'shot' ? MARKS[d.wound] : what === 'stab' || what === 'rip' ? MARKS.stab : what === 'cut' ? MARKS.throat
  : what === 'twist' || what === 'press' ? null : MARKS.blunt);

// Ground finisher on a knocked-out enemy (data/finishers.js): with somebody on him (systems/Danger.js) the weapon's
// quick kill, else one of its long executions, not the one he did last. He sets himself on the man (ex.at, facing
// ex.face; from where he stands when there is no room for it), the beats land one after the other, the man dies
// on the beat `kill` (ex.dead; ex.corpse: his body, when it is a ragdoll) and the rest lands on the body. From the
// kill on he can walk out of it (leaving); watched to the end it tells the score ('finisher'). The poses:
// CharacterAnim execPose. f: a given one (the sandbox, the tests) instead of the choice.
export function startExecution(me, target, f) {
  const w = me.world;
  f ??= finisherChoice({ d: me.def, weapon: me.weapon, threatened: !!w.danger?.threatened(me), last: me.lastFinisher });
  if (!f.quick) me.lastFinisher = f;
  const dir = target.downAngle, c = Math.cos(dir), s = Math.sin(dir); // the way his head lies
  const on = (k, l = 0) => ({ x: target.x + c * k + s * l, y: target.y + s * k - c * l }); // k along him, l to his left
  const pts = {};
  for (const [name, [k, l]] of Object.entries(EXEC.spots)) pts[name] = on(k, l);
  const side = (me.x - target.x) * s - (me.y - target.y) * c >= 0 ? 1 : -1; // the side of him he is already on
  let at = null;
  if (f.mount === 'astride' || f.mount === 'over') at = on(f.on ?? EXEC[f.mount]);
  else if (f.mount === 'side' || f.mount === 'beside') at = on(EXEC[f.mount][0], EXEC[f.mount][1] * side);
  // no room there (a wall), or a kill from where he stands: he stays put and turns to what he strikes
  const loose = !at || w.map.solidAt(at.x, at.y);
  if (loose) at = { x: me.x, y: me.y };
  // t: s into the beat (it starts once he is in place), hit: s since the last beat landed, age: s since it began
  // wears: it takes a blow out of the weapon in hand (one that does not break it by design: snap, plant), on the kill;
  // breaks: that blow used it up, it gives out on the last beat (execBreak)
  const wears = !!me.def.wear && !!me.weapon && f.snap === undefined && f.plant === undefined;
  me.execution = { target, f, at, pts, dir, turns: loose || f.mount === 'side' || f.mount === 'beside', face: dir,
    t: -(f.quick ? EXEC.quickMount : EXEC.mount), i: 0, age: 0, hit: 9, done: false, dead: false, corpse: null, wounds: [], held: false,
    wears, breaks: false, broken: false };
  me.execOut = null;
  me.contextAction = null;
  target.executing = true;
  me.swing = 0;
  me.steer(0, 0, 0, 1);
  if (f.beats[0][1] === 'windup') me.windup();
}

// the weapon brought back and held: the stroke clock all but stopped just past its anticipation
export function windup(me) {
  me.strike = 0;
  me.swingDur = 20;
  me.swing = 18.2;
  me.world.sound('swing', me.x, me.y, 0.5, { pitch: 0.7, weapon: me.weapon?.type });
}

// Does he want out of the finisher (it lets him once the man is dead)? A fresh push on a movement key or the stick (one held since
// before the kill does not count until it is let go), a right click, Space.
function leaving(me, ex, input) {
  const stick = !!input.move?.();
  const out = input.hit('Space') || input.mouseHit(2) || MOVE_KEYS.some((k) => input.hit(k)) || (stick && !ex.held);
  ex.held = stick;
  return out;
}

export function updateExecution(me, dt, input) {
  const ex = me.execution, tg = ex.target, f = ex.f;
  dt *= EXEC.rate;
  ex.age += dt;
  ex.hit += dt;
  if (input && leaving(me, ex, input) && ex.dead) { endExecution(me, false); return; }
  // held in place on him: nothing moves him, he looks where the finisher has him look
  if (ex.turns) {
    const p = ex.pts[f.beats[ex.i][2] ?? f.at];
    if (Math.hypot(p.x - ex.at.x, p.y - ex.at.y) > 4) ex.face = Math.atan2(p.y - ex.at.y, p.x - ex.at.x);
  }
  const k = 1 - Math.exp(-dt * 20);
  Body.setPosition(me.body, { x: me.x + (ex.at.x - me.x) * k, y: me.y + (ex.at.y - me.y) * k });
  me.vel = { x: 0, y: 0 };
  Body.setVelocity(me.body, me.vel);
  me.angle += angDiff(me.angle, ex.face) * Math.min(1, dt * 16);
  if (me.facing) me.facing.feet = null; // carried onto him: his feet are under him when the pose lets go
  if (ex.done) {
    if ((ex.t += dt) >= (f.after ?? 0)) endExecution(me, true);
    return;
  }
  if (!ex.dead && !tg.alive) { endExecution(me, false); return; } // somebody else got him first
  ex.t += dt;
  const [wait, what] = f.beats[ex.i];
  if (what === 'bleed' && ex.t > 0) bleedThroat(me, ex, ex.t / wait);
  if (ex.t < wait) return;
  ex.t -= wait;
  landBeat(me, ex);
  // the next one; a gun run dry drops the rounds it had left to fire into the body
  let n = ex.i + 1;
  while (n < f.beats.length && f.beats[n][1] === 'shot' && !(me.weapon?.mag > 0)) n++;
  if (n >= f.beats.length) { ex.done = true; execBreak(me, ex); return; }
  ex.i = n;
  if (f.beats[n][1] === 'windup') me.windup();
}

// the opened throat pumps while he holds the head back (k: 0..1 through the beat): a spurt, a pause, a weaker one
function bleedThroat(me, ex, k) {
  const beat = Math.sin(k * Math.PI * 5);
  if (beat < 0.3) return;
  const p = ex.pts.throat;
  squirt(me.world, p.x, p.y, ex.dir + Math.PI / 2 * (me.punchSide || 1) + rand(-0.25, 0.25), beat * (1 - 0.7 * k), 2);
}

// one beat of the finisher lands: on the man while he lives, on his body after
function landBeat(me, ex) {
  const w = me.world, f = ex.f, d = me.def, tg = ex.target, [, what, where = f.at] = f.beats[ex.i];
  const { x, y } = ex.pts[where], knee = where === 'knee0' || where === 'knee1';
  ex.hit = 0;
  ex.last = what;
  if (ex.dead && f.back) { ex.at.x -= Math.cos(ex.dir) * f.back; ex.at.y -= Math.sin(ex.dir) * f.back; } // walking off
  if (what === 'windup' || what === 'hold') return;
  if (what === 'grab' || what === 'pin' || what === 'aim' || what === 'lean' || what === 'bleed') {
    w.sound(what === 'lean' ? 'soft' : 'swing', me.x, me.y, 0.4, { pitch: 1.3 }); // his hands on him
    return;
  }
  if (!f.pose) {
    me.swingDur = me.swing = 0.22;
    me.strike = typeof what === 'number' ? what : 2;
    // a weapon's stroke comes from its own side (as in attack), fists alternate
    me.punchSide = d.hold === 'melee' ? (me.strike === 1 ? -1 : 1) : -me.punchSide;
  }
  const light = what === 'press' || what === 'twist' || what === 'punch';
  w.particles.blood(x, y, rand(0, 6.28), Math.PI, light ? 6 : 14, light ? 90 : 160);
  w.decals.stampBlood(x, y, light ? 3 : 6, light ? 2 : 4);
  if (what === 'shot') {
    me.weapon.mag--;
    me.recoil = 1;
    const m = me.muzzlePos();
    muzzleFlash(w, m.x, m.y, m.a, d, me);
    me.eject(d);
    w.sound(d.sound, me.x, me.y);
    if (knee) w.sound('kneeShot', x, y, 0.9);
    if (d.noise) w.noise(me.x, me.y, d.noise, me, 'gunshot');
  } else if (what === 'press') w.sound('punch', x, y, 0.5, { pitch: 0.8 });
  else if (what === 'punch' || what === 'elbow') w.sound('punch', x, y, what === 'elbow' ? 1 : 0.7, { pitch: rand(0.85, 1.05) });
  else if (what === 'stab') w.sound('slash', x, y, 0.8, { pitch: rand(0.95, 1.15) });
  else if (what === 'cut') w.sound('throatCut', x, y, 0.9);
  else if (what === 'twist' || what === 'rip') w.sound('bladeTwist', x, y, 0.8, { pitch: what === 'rip' ? 1.15 : 0.9 });
  else {
    w.sound(d.hold === 'none' ? 'punch' : d.swing === 'blade' ? 'slash' : 'splat', x, y);
    const club = d.swing === 'club' ? d : d.kind === 'gun' ? GUN_BUTT : null;
    if (club) blowFx(w, club, { x, y }, me.angle, { heavy: true, from: 'side' });
    if (knee) w.sound('boneCrack', x, y, 0.9);
    if (what === 'stomp' || what === 'slam' || what === 'pile') {
      w.particles.dust(x, y, 8, 12, '#6a6272', { speed: 50, size: 4, life: 0.7, alpha: 0.2 });
      w.shake(MOMENTS.stomp.shake);
      w.sound(what === 'stomp' ? 'stomp' : 'skullSlam', x, y, 1);
    }
  }
  if (what === 'rip') w.particles.blood(x, y, ex.dir + Math.PI / 2 * me.punchSide, 0.3, 14, 260); // torn out sideways
  if (ex.i === f.snap) me.breakWeapon(me.angle, false);
  if (ex.i === killBeat(f)) { me.finish(ex, x, y); return; }
  if (!ex.dead) {
    // a man alive takes it: he jerks where he lies, a knee gone he cries out (the wound shows on his body after)
    landOnBody(w, x, y, me.angle, d, MOMENTS.beat);
    tg.jerk = { t: w.time, side: ex.i % 2 ? 1 : -1, k: knee ? 1 : 0.6 };
    if (knee) { ex.wounds.push([where, what]); w.sound('cry', tg.x, tg.y, 0.9, { pitch: tg.voice }); }
    return;
  }
  // on his body: the part struck jerks, the wound shows; the last of it may leave nothing of his head, or stay in him
  const body = ex.corpse, last = ex.i === f.pulp || ex.i === f.plant;
  body?.struck(where, ex.dir + Math.PI / 2 * (ex.i % 2 ? 1 : -1), beatMark(what, d), EXEC.jerk[where === 'head' || knee ? 0 : 1]);
  landOnBody(w, x, y, me.angle, d, last ? MOMENTS.finisher : MOMENTS.beat);
  if (ex.i === f.pulp) {
    const at = body?.loseHead();
    if (at) pulp(w, at.x, at.y, me.angle);
  }
  if (ex.i === f.plant && me.weapon) {
    body?.plant(d.snaps ? WEAPONS[d.snaps].sprite : d.sprite);
    me.breakWeapon(me.angle, true);
  }
}

// the beat that kills: how the body is left is the finisher's (cause, wound; a head sent off, a weapon left in him)
export function finish(me, ex, x, y) {
  const w = me.world, f = ex.f, d = me.def, tg = ex.target, n = w.corpses.length;
  let by = f.cause === 'execute' ? undefined : { gore: 0, wound: f.wound }, angle = me.angle;
  if (f.plant === ex.i) by.stuck = d.snaps ? WEAPONS[d.snaps].sprite : d.sprite; // a cue snaps: its other half stays in the hand
  else if (f.launch) {
    // the head flies off across the swing (it runs toward the side opposite the one it came from)
    by = { gore: 99, wound: 'blunt', launch: f.launch };
    angle = me.angle - me.punchSide * 1.2;
  }
  // the blow it takes out of the weapon (startExecution: wears); the one that uses it up breaks it on the last beat
  if (ex.wears && me.weapon) ex.breaks = (me.weapon.wear -= WEAR.man) <= WORN;
  tg.kill(angle, f.cause, me, by, { finisher: true, label: f.label, quick: !!f.quick, still: true, close: true, broke: ex.breaks || undefined });
  ex.dead = true;
  const body = w.corpses.length > n ? w.corpses[w.corpses.length - 1] : null;
  ex.corpse = body?.struck ? body : null;
  for (const [where, what] of ex.wounds) ex.corpse?.struck(where, angle, beatMark(what, d));
  landOnBody(w, x, y, angle, d, f.quick ? MOMENTS.quick : MOMENTS.finisher, !tg.alive);
  if (f.quick) w.particles.dust(x, y, 6, 10, '#6a6272', { speed: 45, size: 3.5, life: 0.5, alpha: 0.18 });
  if (f.flight) w.slowmo(...f.flight);
  if (f.plant === ex.i) me.breakWeapon(me.angle, true);
}

// a finisher that used the weapon up (ex.breaks) breaks it, once, where its last beat landed: a blade stays in the
// body, a bat snaps over him
function execBreak(me, ex) {
  if (!ex.breaks || ex.broken || !me.weapon) return;
  ex.broken = true;
  const d = me.def, where = ex.f.beats[ex.i][2] ?? ex.f.at, p = ex.pts[where], lodge = d.breaks === 'lodge' && !!ex.corpse;
  if (lodge) ex.corpse.plant(plantedOf(d));
  me.breakWeapon(me.angle, lodge, { x: p.x, y: p.y });
}

// out of the finisher. watched: played to its end (a long one watched to the end is told to the score); else he
// walked out of it, or somebody else killed the man: the pose lets go over EXEC.blend s
function endExecution(me, watched) {
  const ex = me.execution, tg = ex.target;
  execBreak(me, ex); // walked out of it before its last beat: it gives out now
  me.execution = null;
  tg.executing = false;
  me.swing = 0;
  me.cooldown = watched ? 0.25 : 0.1;
  if (!watched) me.execOut = { ex, t: EXEC.blend };
  else if (ex.dead && !ex.f.quick) me.world.events.emit('finisher', { killer: me, x: tg.x, y: tg.y, label: ex.f.label });
}
