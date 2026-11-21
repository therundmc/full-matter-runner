// The world's clock against the real one: the time scale a step runs at, the slow motion the world asks for, the
// hit-stop. Everyone who wants the clock is heard here, once a frame, by ONE rule (update):
//   1. the target is the sandbox's speed (1: none); 1 while the world plays on by itself in real time (`auto`: the
//      getaway's outro), which no slow motion touches;
//   2. the world's slow motion (World.slowmo: one at a time; Impact.slowAtLeast never lets a weaker one cut a
//      stronger one short) lowers the target, its time counted on the real clock;
//   3. a tutorial lesson (Tutorial.pace, asked at this point, after 2) lowers it too;
//   4. the scale eases toward the target (`ease`: the share of the gap left after a real s), but for a lesson's beat,
//      which sets it as it is (its own ramp);
//   5. the kill cam's clock (KillCam.clock) drops it at once to its beat, and snaps it back when that is over;
//   6. a chase beat in play (ChaseCam.scale) has the last word: min(target, its scale), its own ramp as it is.
// The hit-stop holds the steps while it lasts (the longest asked wins), counted down on the real clock. DOM-free.
import { lerp } from '../../engine/math.js';
import { GAME } from '../data/game.js';

const NO_LESSON = { scale: 1, beat: false };

export default class TimeScale {
  constructor(ease = GAME.ease) {
    this.ease = ease;
    this.scale = 1;     // the time scale the steps run at
    this.slow = null;   // the world's slow motion: { scale, t: real s left }
    this.hitstop = 0;   // real s the steps are still held
  }

  // a slow motion of `scale` for `dur` real s, in place of the one running (Impact.slowAtLeast weighs them first)
  slowmo(scale, dur) { this.slow = { scale, t: dur }; }

  // a hit-stop of at least `s` real s
  stop(s) { this.hitstop = Math.max(this.hitstop, s); }

  // everything let go: no slow motion, no hit-stop, the clock at 1
  reset() {
    this.hitstop = 0;
    this.scale = 1;
    this.slow = null;
  }

  // dt: real s. auto: the world plays on by itself in real time; base: the sandbox's speed; lesson(): the tutorial's
  // { scale, beat } (asked after the slow motion is counted); clock(scale, target): the kill cam's; chase: a chase
  // beat's time scale, or null. Returns the time scale.
  update(dt, { auto = false, base = 1, lesson = null, clock = null, chase = null } = {}) {
    let target = auto ? 1 : base;
    if (this.slow && !auto) {
      target = Math.min(target, this.slow.scale);
      this.slow.t -= dt;
      if (this.slow.t <= 0) this.slow = null;
    }
    const L = lesson ? lesson() : NO_LESSON;
    target = Math.min(target, L.scale);
    this.scale = L.beat ? target : lerp(this.scale, target, 1 - Math.pow(this.ease, dt));
    if (clock) this.scale = clock(this.scale, target);
    if (chase != null) this.scale = Math.min(target, chase);
    return this.scale;
  }

  // the hit-stop counted down: true while it holds the steps this frame
  held(dt) {
    if (!(this.hitstop > 0)) return false;
    this.hitstop -= dt;
    return true;
  }
}
