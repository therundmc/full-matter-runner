// The player's slide (systems/Slide.js, PLAYER.slide) and the kick out of it (systems/Kick.js, TRAVERSE.kick),
// and the blow of a vault into a man. Functions of the player (`me`), DOM-free.
import { PLAYER, ENEMY } from '../../Config.js';
import { rand } from '../../../engine/math.js';
import { impulse, kgOf } from '../../../engine/physics/Body.js';
import { findVault } from '../../systems/Cover.js';
import { Slide, canSlide, ducked } from '../../systems/Slide.js';
import { kickReady, kickTarget, standing, throwSpeed } from '../../systems/Kick.js';
import { MOMENTS, TRAVERSE, TRAVERSE_FX } from '../../data/feel.js';
import { SLIP } from '../../data/devices.js';
import { landMoment } from '../../fx/Impact.js';
import { slideFx, landFx } from '../../fx/TraversalFx.js';
import { combatFx } from '../../fx/CombatFx.js';

const { Body } = Matter;

export function startSlide(me, a) {
  const cfg = PLAYER.slide, w = me.world;
  if (me.vaulting || !canSlide(me.slideCd, me.moving, PLAYER.speed, cfg)) return false;
  if (me.stamina < cfg.cost) { me.winded = 0.35; return false; }
  me.stamina -= cfg.cost;
  me.slide = new Slide(a, PLAYER.speed, cfg);
  w.slowmo(...MOMENTS.slideTime.slowmo); // bullet time
  me.slideHits.clear();
  // the trailing palm goes on the side of the free (left) hand
  me.slideAnim = { dir: a, side: Math.cos(me.angle - a) >= 0 ? -1 : 1, k: 0, w: me.slideAnim?.w ?? 0 };
  setSlideVelocity(me);
  w.sound('slide', me.x, me.y, 0.9);
  w.sound('slideScrape', me.x, me.y, 0.7, { floor: w.floorAt(me.x, me.y) }); // placeholder (PLACEHOLDERS.md)
  w.noise(me.x, me.y, 110, me);
  w.events.emit('slide', { ch: me, x: me.x, y: me.y, angle: a });
  w.camera.push(Math.cos(a) * 2.5, Math.sin(a) * 2.5);
  w.shake(0.04);
  return true;
}

// low on the floor at the heart of a slide: rounds pass over us (Projectile)
export function ducking(me) { return !!me.slide && ducked(me.slide.k, PLAYER.slide); }

// a round just did: a breath of slow motion, once per slide
export function dodge(me) {
  const sl = me.slide, w = me.world;
  if (!sl || sl.dodged) return;
  sl.dodged = true;
  w.slowmo(...PLAYER.slide.bulletTime);
  w.events.emit('dodge', { ch: me, x: me.x, y: me.y });
}

function setSlideVelocity(me) {
  const sl = me.slide;
  me.vel = { x: sl.dx * sl.speed, y: sl.dy * sl.speed };
  Body.setVelocity(me.body, me.vel);
}

// physical slide: walls stop it, loose props take our momentum, standing enemies get swept off their feet
export function updateSlide(me, dt) {
  const sl = me.slide, w = me.world, cfg = PLAYER.slide;
  // a broken window or a low obstacle right ahead: chain into the vault
  if (findVault(w, me, sl.angle)) {
    endSlide(me);
    me.tryVault(sl.angle);
    return;
  }
  // the end of it, a standing guard just ahead: up into a kick
  if (me.tryKick(sl.angle, sl.k)) return;
  if (sl.speed >= cfg.knockSpeed * sl.run) {
    for (const e of w.enemies) {
      if (!e.alive || e.knocked > 0) continue;
      const ex = e.x - me.x, ey = e.y - me.y;
      if (Math.hypot(ex, ey) > me.radius + e.radius + sl.speed + 2 || ex * sl.dx + ey * sl.dy <= 0) continue;
      e.knock(sl.angle, 'slide');
      w.sound('punch', e.x, e.y);
      landMoment(w, e, sl.angle, null, MOMENTS.slide, false);
    }
  }
  const v = Body.getVelocity(me.body);
  sl.step(dt, v.x * sl.dx + v.y * sl.dy);
  if (sl.done) {
    if (me.tryKick(sl.angle, sl.k, 0, sl.stalled)) return; // stopped short by him, or at its very end
    if (sl.stalled) w.shake(0.08);
    endSlide(me);
    return;
  }
  for (const pair of w.physics.activePairs()) {
    const o = pair.bodyA === me.body ? pair.bodyB : pair.bodyB === me.body ? pair.bodyA : null;
    if (!o || o.mu === undefined || (o.isStatic && !o.frozen) || me.slideHits.has(o)) continue;
    me.slideHits.add(o);
    // a light thing is sent off no faster than the feet that hit it
    impulse(o, sl.angle, kgOf(me.body) * sl.speed * cfg.hitMomentum, rand(-0.3, 0.3), sl.speed);
  }
  setSlideVelocity(me);
  // friction: dust off the trailing hand and the lead foot, streaks of light, a faint skid mark (fx/TraversalFx.js)
  slideFx(me, sl, me.slideAnim, dt);
}

// hand the remaining speed back to the run
function endSlide(me) {
  const sl = me.slide;
  me.slide = null;
  me.slideEnd.t = me.world.time; me.slideEnd.a = sl.angle;
  me.slideCd = PLAYER.slide.cooldown;
  me.vel = { x: sl.dx * sl.speed, y: sl.dy * sl.speed };
  Body.setVelocity(me.body, me.vel);
}

// blend weight of the slide pose: quick drop into it, then up off the floor in one motion (`out`: the push back
// up once the slide is over, TRAVERSE.slide.rec s, CharacterAnim.slidePose)
export function updateSlideAnim(me, dt) {
  const a = me.slideAnim;
  if (!a) return;
  const down = me.slipped && me.slipped.t < SLIP.player.slide; // flat on his back on a slick floor (slip)
  if (me.slide || down) { if (me.slide) a.k = me.slide.k; a.w = Math.min(1, a.w + dt / (down ? 0.08 : 0.07)); a.out = 0; }
  else if ((a.out = Math.min(1, (a.out ?? 0) + dt / TRAVERSE.slide.rec)) >= 1) me.slideAnim = null;
}

// At the end of a slide (k: its progress, null once it is over, `since` s ago; stalled: stopped short), a standing
// guard just ahead along a: up into the kick. Whether it started.
export function tryKick(me, a, k, since = 0, stalled = false) {
  const K = PLAYER.slide.kick, w = me.world;
  if (!kickReady(k, since, K, stalled)) return false;
  const e = kickTarget(me.x, me.y, a, w.enemies, K, (g) => w.lineOfSight(me.x, me.y, g.x, g.y));
  if (!e) return false;
  startKick(me, e);
  return true;
}

// up out of the slide, the lead knee drawn up, the leg driven out at his head: the slide's way carried on up to him,
// planted at the contact (landKick), then a step on (the pose: CharacterAnim kickPose)
function startKick(me, target) {
  const sl = me.slide, w = me.world;
  const v = sl ? sl.speed : Math.hypot(me.vel.x, me.vel.y);
  if (sl) {
    me.slide = null;
    me.slideEnd.t = w.time; me.slideEnd.a = sl.angle;
    me.slideCd = PLAYER.slide.cooldown;
  }
  // side: the slide's (its palm's side: the lead leg, the one that kicks, is on the other)
  me.kick = { target, a: Math.atan2(target.y - me.y, target.x - me.x), t: 0, v, side: me.slideAnim?.side ?? 1,
    landed: false, planted: false, hitAt: null };
  me.swing = 0;
  me.reloading = 0;
  w.sound('kickWhoosh', me.x, me.y, 0.8); // placeholder (PLACEHOLDERS.md)
}

export function updateKick(me, dt) {
  const k = me.kick, T = TRAVERSE.kick, K = PLAYER.slide.kick, w = me.world, tg = k.target;
  k.t += dt;
  const u = Math.min(1, k.t / T.dur), hitT = T.hit * T.dur;
  let sp = 0;
  if (!k.landed) {
    // on toward him, square to him, to the kick's distance by the contact
    if (standing(tg)) k.a = Math.atan2(tg.y - me.y, tg.x - me.x);
    const left = Math.max(1 / 60, hitT - k.t), d = Math.hypot(tg.x - me.x, tg.y - me.y) - K.gap;
    sp = Math.max(0, Math.min(k.v, d / (left * 60)));
  } else if (u > T.hold) sp = k.v * 0.35 * Math.sin(Math.PI * Math.min(1, (u - T.hold) / (1 - T.hold))); // the step on
  me.vel = { x: Math.cos(k.a) * sp, y: Math.sin(k.a) * sp };
  Body.setVelocity(me.body, me.vel);
  if (!k.landed && k.t >= hitT) landKick(me);
  if (!k.planted && u >= T.plant) {
    // the kicking foot set down a step ahead
    k.planted = true;
    w.sound('landThud', me.x, me.y, 0.5, { floor: w.floorAt(me.x, me.y) });
    landFx(me, k.a, TRAVERSE_FX.kick.land);
  }
  if (u >= 1) { me.kick = null; me.cooldown = 0.1; }
}

// the foot on his head: floored, thrown back along the kick (a whiff when he is no longer there to take it)
function landKick(me) {
  const k = me.kick, K = PLAYER.slide.kick, tg = k.target;
  k.landed = true;
  if (!standing(tg) || Math.hypot(tg.x - me.x, tg.y - me.y) > K.range + 6) return;
  k.hitAt = { x: tg.x, y: tg.y }; // the foot stays out where it met him (CharacterAnim kickPose)
  footOn(me, tg, k.a, 'kick', K.back, K.noise);
}

// A foot (or both) driven into a standing guard along a: knocked down (cause 'kick' | 'hood', data/scoring.js),
// thrown `back` px; the hit-stop and the star on his head, the crack of it heard `noise` px
function footOn(me, tg, a, cause, back, noise) {
  const w = me.world, F = TRAVERSE_FX.kick;
  tg.knock(a, cause, { speed: throwSpeed(back, ENEMY.knockBrake) });
  landMoment(w, tg, a, null, MOMENTS.slideKick, false);
  const hx = tg.x - Math.cos(a) * 3, hy = tg.y - Math.sin(a) * 3;
  combatFx(w).burst(hx, hy, a, F.burst, 1);
  w.particles.drops(hx, hy, a, 0.6, F.drops, F.color, F.speed, 3, false);
  w.sound('kickHit', hx, hy, 1); // placeholder (PLACEHOLDERS.md)
  w.noise(tg.x, tg.y, noise, me);
}

// over a car's hood (Character.updateVault, style 'hip', TRAVERSE.vault.hip.strike): the legs coming off it take
// the standing guard on the far side, the one Character.tryVault found in the way (v.strike)
export function vaultStrike(me, v, k) {
  const S = TRAVERSE.vault.hip.strike, st = v.strike;
  if (!st || st.done || k < S.from) return;
  const tg = st.target;
  if (!standing(tg)) { st.done = true; return; }
  if (Math.hypot(tg.x - me.x, tg.y - me.y) > S.reach) return;
  st.done = st.hit = true;
  footOn(me, tg, v.dir, 'hood', S.back, PLAYER.slide.kick.noise);
}
