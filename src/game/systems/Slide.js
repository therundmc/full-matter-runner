// Slide (Space while running, nothing to vault): pure kinematics, no DOM and no Matter, so it is unit-testable.
// Speeds are px per base step like Character.steer; time is game seconds. Tuning lives in PLAYER.slide (Config.js).
import { clamp } from '../../engine/math.js';

// speed at progress k (0..1): a burst well above run speed that decays (ease-out) back toward a jog
export function slideSpeed(k, run, cfg) {
  const u = 1 - clamp(k, 0, 1);
  return run * (cfg.end + (cfg.boost - cfg.end) * u * u);
}

// distance covered by an unobstructed slide (px)
export function slideDistance(run, cfg, dt = 1 / 60) {
  const s = new Slide(0, run, cfg);
  let d = 0;
  while (!s.done) d += s.step(dt) * dt * 60;
  return d;
}

// only while actually running, and not right after another slide
export function canSlide(cooldown, speed, run, cfg) {
  return cooldown <= 0 && speed >= run * cfg.minSpeed;
}

export class Slide {
  constructor(angle, run, cfg) {
    this.angle = angle;
    this.dx = Math.cos(angle);
    this.dy = Math.sin(angle);
    this.run = run;
    this.cfg = cfg;
    this.t = 0;
    this.speed = slideSpeed(0, run, cfg);
    this.done = false;
    this.stalled = false;
  }

  get k() { return clamp(this.t / this.cfg.dur, 0, 1); }

  // advance by dt and return the speed to apply. `along` = measured speed along the slide direction after the
  // last physics step: far below what was asked means something solid stopped us (wall, bolted furniture).
  step(dt, along) {
    if (along !== undefined && this.t > 0 && along < this.speed * this.cfg.stall) {
      this.done = this.stalled = true;
      this.speed = Math.max(0, along);
      return this.speed;
    }
    this.t += dt;
    if (this.t >= this.cfg.dur) this.done = true;
    this.speed = slideSpeed(this.k, this.run, this.cfg);
    return this.speed;
  }
}
