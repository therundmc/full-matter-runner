// How a drive opens (systems/Drive.js d: its state): the gun he sets off with (arm), the level 2A opening on his
// cigarette (stand, then launch: systems/LastDrag.js), the gun taken off the passenger seat in a short beat (grab:
// take, grabStep; CharacterAnim grabPose), skipped on a retry (skipGrab), and the camera's shot meanwhile (shot:
// SHOTS grab / grabOut in data/staging.js). DOM-free.
import { wake } from '../../../engine/physics/Body.js';
import { SEAT } from '../../data/feel.js';
import { seatOf } from './rules.js';

const { Body, Sleeping } = Matter;

// what he sets off with (the level's `chase.arms`: { weapon, mag, seat }): the gun in his hand and what its
// magazine holds (at the wheel it never runs dry: CarGun; the count is what he gets out of the car with); seat: it
// lies on the car's passenger seat and he takes it in the beat (grab)
export function arm(d, arms) {
  const p = d.world.player;
  if (arms.seat && d.car.gun) {
    if (d.o.exit) d.stash = p.weapon;
    p.weapon = null; // (his hands free for it)
    d.grab = { t: 0, arms, took: false, racked: false };
    if (p.riding) p.riding.grab = 0;
    return;
  }
  p.setWeapon(arms.weapon, arms.mag);
}

// The opening, a step: the car stands (nothing moves it), he smokes; over, it pulls away
export function stand(d, dt) {
  const b = d.car.body;
  d.drag.step(dt);
  Body.setVelocity(b, { x: 0, y: 0 });
  Body.setAngularVelocity(b, 0);
  d.carry();
}

// the engine: its lamps on, the car pulls away by itself (speedStep) on spinning rear tyres, sat back on them
export function launch(d) {
  const w = d.world, v = d.car, b = v.body, L = d.C.intro.launch;
  // (a heavy body at rest is frozen by the physics: it stood for seconds; a frozen one takes no velocity)
  wake(b);
  if (b.isSleeping) Sleeping.set(b, false);
  v.lightsOut = false;
  w.clockFrom = w.time; // the run's clock starts here (World.runTime): the opening is not his time
  d.hudT = 0;
  d.launchT = L.spin;
  d.bump('shove', L.kick);
  w.shake(d.C.shove.shake);
  w.sound('engineRoar', v.x, v.y, 1); // placeholder (assets/sound/PLACEHOLDERS.md)
  w.events.emit('ride', { beat: 'start', x: v.x, y: v.y });
}

// a retry: no beat (no cigarette: the car already rolling), the seat's gun already in his hand
export function skipGrab(d) {
  if (d.drag) {
    const p = d.world.player;
    if (p.riding) p.riding.drag = null;
    d.drag = null;
    d.standing = false;
    d.world.clockFrom = 0;
    d.v = d.lastV = d.was2.v = d.cruise;
    d.car.lightsOut = false;
    Body.setVelocity(d.car.body, { x: d.cruise, y: 0 });
  }
  const g = d.grab;
  if (!g) return;
  d.grab = null;
  if (d.world.player.riding) d.world.player.riding.grab = null;
  if (!g.took) take(d, g);
}

// the gun off the seat and into his hand
function take(d, g) {
  g.took = true;
  d.car.gun = false;
  arm(d, { ...g.arms, seat: false });
}

// the beat, a step: the gun taken, racked, handed over to the door's hand; the camera back out after it
export function grabStep(d, dt) {
  const g = d.grab, G = SEAT.grab, w = d.world, p = w.player;
  g.t += dt;
  if (p.riding) p.riding.grab = g.t < G.dur ? g.t : null;
  if (!g.took && g.t >= G.take) {
    take(d, g);
    w.sound('seatGun', p.x, p.y, 0.7); // placeholder (assets/sound/PLACEHOLDERS.md)
  }
  if (!g.racked && g.t >= G.pull) {
    g.racked = true;
    w.sound('rack', p.x, p.y, 0.8, { weapon: p.weapon?.type });
  }
  if (g.t >= G.dur + G.out) d.grab = null;
}

// the camera's shot (Game.stagedShot; SHOTS in data/staging.js): pushed in on him while he takes the gun, then
// back out
// (it looks at his seat in the car AS DRAWN, between its last two steps: his own body is out of the world while
// he rides and is not drawn in between, so the view pulled onto it ran up to a step ahead of the car, by another
// share of it every frame: the car shook in the close-up, 56 px of the picture at 1080, and read as blurred)
export function shot(d) {
  if (!d.on) return null;
  if (d.drag?.on) return d.drag.shot();
  const g = d.grab, v = d.car;
  if (!g) return null;
  return { name: g.t < SEAT.grab.hand[0] ? 'grab' : 'grabOut', at: v.toWorld(...seatOf(v, d.C)) };
}
