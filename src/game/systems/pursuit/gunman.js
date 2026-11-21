// The gunman and his TOLD shot (systems/Pursuit.js P: its state; CHASE.gunman): he leans out of his window on the
// runner's side and points (gunPoint, aimGun); one at a time with a cooldown, a tell: a white glint at the muzzle, a
// red line fattening into a wedge toward a bracket on a lane band locked when it starts (his seat's y then, its x led
// by his speed), then the shot: his seat inside the band and reached (a closed car: through a window or the
// windscreen; the open one: across its cabin, Vehicle.crossesSeat) -> dead (killRunner); else a hole in the car or
// sparks on the road. His rounds through a gunman (onRound) kill him. render/PursuitArt.js draws them. DOM-free.
import { TILE } from '../../Config.js';
import { clamp, angDiff } from '../../../engine/math.js';
import { CHASE } from '../../data/chase.js';
import { WEAPONS } from '../../data/weapons.js';
import { MUZZLE_IN, onSprite } from '../../entities/CharacterAnim.js';
import { sprite, sw } from '../../../engine/Assets.js';
import { dice } from '../Rng.js';
import { canBlock, canRam, nextAttack, startAttack } from './attacks.js';
import { credit } from './wreck.js';

const PISTOL = WEAPONS.pistol; // the gunmen's 1911 (pistolOf; render/PursuitArt.js draws it)

// ---------------------------------------------------------------- pure
// the bracket's lock: his seat's y now, its x where his speed takes it in t s (vel: px/step)
export const lockOf = (seat, vel, t) => ({ x: seat.x + vel.x * 60 * t, y: seat.y });

// his seat inside the bracket's box at the shot
export const inBand = (seat, aim, B = CHASE.gunman.band) => Math.abs(seat.x - aim.x) <= B.lead && Math.abs(seat.y - aim.y) <= B.half;

// Does a line from (x0, y0) reach the seat (sprite px) of car v? An open car (a `cabin` in VEHICLES) by its way in
// crossing the cabin by the seat (Vehicle.crossesSeat: anywhere, with him sat there); a closed one through a side
// window (it comes in by a flank within `win` px of the seat's x) or through the windscreen (m.wind, on the first px
// of its way in); never through the panels. A line starting inside its box reaches it.
export function reaches(v, x0, y0, seat, win = CHASE.gunman.window) {
  const a = v.toSprite(x0, y0), dx = seat[0] - a.sx, dy = seat[1] - a.sy, len = Math.hypot(dx, dy) || 1;
  let t0 = 0;
  for (const [p, q] of [[-dx, a.sx], [dx, v.w - a.sx], [-dy, a.sy], [dy, v.h - a.sy]]) if (p < 0) t0 = Math.max(t0, q / p);
  if (t0 <= 0) return true;
  const ex = a.sx + dx * t0, ey = a.sy + dy * t0;
  if (v.m.cabin) return v.crossesSeat(ex, ey, dx / len, dy / len);
  if ((ey <= 1 || ey >= v.h - 1) && Math.abs(ex - seat[0]) <= win) return true;
  for (let k = 0; k <= 30 && t0 + k / len <= 1; k += 2) {
    const f = t0 + k / len;
    if (v.inside(v.m.wind, a.sx + dx * f, a.sy + dy * f)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the pursuit's
// a round's way this step (Projectile 'round'): a gunman on it is shot
export function onRound(P, { x0, y0, x1, y1, owner }) {
  if (!owner?.isPlayer) return;
  const r = P.G.r;
  for (const car of P.cars) {
    if (!car.gunman || car.state === 'wrecked') continue;
    const g = gunPoint(P, car), dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
    const k = clamp(((g.x - x0) * dx + (g.y - y0) * dy) / L, 0, 1);
    if (Math.hypot(x0 + dx * k - g.x, y0 + dy * k - g.y) > r) continue;
    shootGunman(P, car, Math.atan2(dy, dx));
  }
}

// the gunman shot (a: the round's way): out of it, his tell over, a kill of his
function shootGunman(P, car, a) {
  const w = P.world, g = gunPoint(P, car);
  car.gunman = false;
  car.shot = true;
  if (P.tell?.car === car) endTell(P);
  w.particles.blood?.(g.x, g.y, a, 0.7, 10, 160);
  w.sound('gore', g.x, g.y, 0.7);
  credit(P, g, 'gunman', 'bullet');
}

// where the gunman leans out (world px): his seat's x in the car, `lean` px out of the side toward the runner
export function gunPoint(P, car) {
  const v = car.v, G = P.G;
  return v.toWorld(v.w * G.seat, car.gunSide < 0 ? -G.lean : v.h + G.lean);
}

// his pistol as render/PursuitArt.js draws it (world points placed from the body): his hand `out[0]` px from where
// he leans out along where he points, its middle `out[1]` px further, drawn at people's scale; muzzle: the end of
// its barrel (CharacterAnim onSprite), where his shot leaves
export function pistolOf(P, car) {
  const g = gunPoint(P, car), a = car.gunA, c = Math.cos(a), s = Math.sin(a), [h, k] = P.G.out;
  const w = sw(sprite(PISTOL.sprite));
  const hand = { x: g.x + c * h, y: g.y + s * h }, at = { x: hand.x + c * k, y: hand.y + s * k };
  return { hand, at, muzzle: onSprite(PISTOL, w, at, a, w - MUZZLE_IN) };
}

// where his shot leaves
export function muzzle(P, car) { return pistolOf(P, car).muzzle; }

// he leans out on the runner's side and points at him (at the bracket while telling): the side of his own car's
// middle line the runner's SEAT is on (kept until it is G.keep px past it: from a car dead ahead of him he does not
// flutter from one window to the other), up to G.cone off square out of it (back along the flank, from ahead)
export function aimGun(P, car, tg) {
  if (!car.gunman || !tg) return;
  const v = car.v, G = P.G;
  if (!car.telling) {
    const off = v.toSprite(tg.seat.x, tg.seat.y).sy - v.h / 2;
    if (Math.abs(off) > G.keep) car.gunSide = off < 0 ? -1 : 1;
  }
  const g = gunPoint(P, car), at = car.telling ? P.tell.aim : tg.seat;
  const out = v.body.angle + car.gunSide * Math.PI / 2;
  car.gunA = out + clamp(angDiff(out, Math.atan2(at.y - g.y, at.x - g.x)), -G.cone, G.cone);
}

// can this car's gunman start a tell now?
function canTell(P, car, tg) {
  const G = P.G;
  if (!tg || !car.gunman || !car.driver || car.bend || P.tell || P.attack || P.cool > 0 || P.world.drive?.grabbing) return false;
  if (car.style === 'rammer' || car.hurt > 0) return false;
  if (!car.dummy && P.busy(tg)) return false;
  if (car.dummy ? car.state !== 'parked' : car.state !== 'chase' || car.chaseT < G.grace) return false;
  const m = muzzle(P, car), d = Math.hypot(tg.seat.x - m.x, tg.seat.y - m.y);
  if (d > (car.dummy ? G.lab.range : G.range) || !P.onScreen(car.v)) return false;
  // straight on the road, his line out of his own window (never across his car)
  const v = car.v, out = v.body.angle + car.gunSide * Math.PI / 2, g = gunPoint(P, car);
  if (!car.dummy && Math.abs(angDiff(0, v.body.angle)) > G.straight) return false;
  if (Math.abs(angDiff(out, Math.atan2(tg.seat.y - g.y, tg.seat.x - g.x))) > G.cone) return false;
  return !tg.car || reaches(tg.car, m.x, m.y, tg.sseat);
}

// one thing told at a time on the back road: no gunman starts while a red lane is on, a lorry is told or backing,
// nor in the `quiet` px of road before an event that tells something (the level's events go by distance)
export function busy(P, tg) {
  if (P.lanes.some((L) => L.on) || P.world.lorries?.told().length || P.world.drive?.bend) return true; // (nothing round a corner)
  if (P.world.toll?.busy(tg.x, Math.max(1, tg.vel.x))) return true; // (nor through a toll's plaza)
  return (P.chase?.events || []).some((e) => !P.fired.has(e) && e.kind !== 'behind' && tg.x > e.at * TILE - P.G.quiet);
}

// the tell starts: the glint, then the line; the bracket locked where his seat will be when it is over (lockOf)
function startTell(P, car, tg) {
  const G = P.G, dur = G.glint + G.line;
  P.tell = { car, t: 0, dur, aim: lockOf(tg.seat, tg.vel, dur), harmless: car.dummy, shot: false };
  car.telling = true;
  const m = muzzle(P, car);
  P.world.sound('tellClick', m.x, m.y, 0.8);
}

// the tell over (shot, or the car out of it): the next one after G.cool s
export function endTell(P) {
  if (P.tell) P.tell.car.telling = false;
  P.tell = null;
  P.cool = dice(P.world).rand(...P.G.cool);
}

// the shot: his seat in the bracket and reached -> dead; else the round lands where it was told (a hole in his car
// on the way, or sparks off the road)
function shoot(P) {
  const w = P.world, T = P.tell, car = T.car, m = muzzle(P, car), tg = P.target();
  const a = Math.atan2(T.aim.y - m.y, T.aim.x - m.x);
  w.sound('pistol', m.x, m.y, 1); // his 1911 (the recorded shot)
  w.light?.(m.x, m.y, 50, '#fff1d8', 0.06);
  w.particles.sparks(m.x, m.y, a, 0.3, 4, 300);
  let end = { x: T.aim.x + Math.cos(a) * P.G.past, y: T.aim.y + Math.sin(a) * P.G.past };
  const hit = tg && !T.harmless && inBand(tg.seat, T.aim) && (!tg.car || reaches(tg.car, m.x, m.y, tg.sseat));
  if (hit) {
    end = tg.seat;
    killRunner(P, tg, a);
  } else {
    const v = tg?.car, through = v && hullHit(v, m, end);
    if (through) {
      const { sx, sy } = v.toSprite(through.x, through.y);
      v.hole(sx, sy);
      w.particles.sparks(through.x, through.y, a + Math.PI, 0.8, 8, 260);
      w.sound('carHit', through.x, through.y, 0.6);
      end = through;
    } else {
      w.particles.sparks(end.x, end.y, a + Math.PI, 0.9, 6, 220);
      w.particles.dust?.(end.x, end.y, 4, 2, '#5a5260', { speed: 30, size: 2, life: 0.4, alpha: 0.3 });
      w.sound('ricochet', end.x, end.y, 0.5);
    }
  }
  // (drawn in his car's frame: render/PursuitArt.js tracerAt)
  P.tracers.push({ x0: m.x, y0: m.y, x1: end.x, y1: end.y, t: 0, car, s0: car.v.toSprite(m.x, m.y), s1: car.v.toSprite(end.x, end.y) });
  endTell(P);
}

// where the line from m to e first meets car v's box (world px), or null
function hullHit(v, m, e) {
  const a = v.toSprite(m.x, m.y), b = v.toSprite(e.x, e.y), dx = b.sx - a.sx, dy = b.sy - a.sy;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.sx], [dx, v.w - a.sx], [-dy, a.sy], [dy, v.h - a.sy]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
  }
  if (t0 > t1 || t0 <= 0) return null;
  return v.toWorld(a.sx + dx * t0, a.sy + dy * t0);
}

// the told shot reached him at the wheel: dead as any man shot (Character.kill: the death screen, R retries from the
// last checkpoint reached); in an open car he stays at the wheel, slumped over it; nobody driving, the car runs on,
// drifts and stops (Drive.coast)
export function killRunner(P, tg, a) {
  const w = P.world, p = w.player, d = w.drive;
  if (!p.alive || p.invulnerable) return;
  w.shake?.(P.G.shake);
  const before = w.corpses.length;
  p.kill(a, 'bullet', { isEnemy: true, kind: 'gunman', weapon: { type: 'pistol' } }, WEAPONS.pistol, { tell: true });
  if (p.alive) return;
  if (tg.car?.rider === p && tg.car.m.cabin) {
    // an open car: he stays at the wheel, slumped over it (no body left lying on the road under the car)
    for (const c of w.corpses.slice(before)) {
      for (const part of c.parts || [c]) if (part.body) w.removeBody(part.body);
      for (const j of c.joints || []) w.physics.remove(j.c);
      c.dead = true;
    }
    tg.car.slumpIn();
    w.particles.blood?.(tg.seat.x, tg.seat.y, a, 0.9, 12, 150);
  } else if (tg.car?.rider === p) tg.car.unseat();
  if (d) d.coast();
}

// the tell's clock, a step (the shot at its end); none on: whose turn it is (nextAttack) and its start
export function stepTell(P, dt, tg) {
  const T = P.tell;
  if (T) {
    if (!tg && !T.harmless) { endTell(P); return; }
    T.t += dt;
    if (T.t >= T.dur) shoot(P);
    return;
  }
  if (P.cool > 0 || !tg || P.attack) return;
  // whose turn: a told shot, a ram, a told shot, a brake (nextAttack); the lab's dummies only tell
  const teller = P.cars.find((car) => {
    if (car.dummy && (car.every -= dt) > 0) return false;
    return canTell(P, car, tg);
  });
  const rammer = P.cars.find((car) => canRam(P, car, tg)), blocker = P.cars.find((car) => canBlock(P, car, tg));
  const kind = nextAttack(P.turn, { shot: !!teller, ram: !!rammer, brake: !!blocker }, P.C);
  if (!kind) return;
  const R = P.C.attack.round;
  let i = P.turn % R.length;
  while (R[i % R.length] !== kind) i++; // (the kind due, or the next in the round that could be made)
  P.turn = i + 1;
  if (kind === 'shot') {
    if (teller.dummy) teller.every = P.G.lab.every;
    startTell(P, teller, tg);
  } else startAttack(P, kind === 'ram' ? rammer : blocker, kind, tg);
}
