// Drawing between two steps of the simulation. The world is stepped at a fixed rate (60 a second) and drawn at the
// screen's (120, 144...): drawn as stepped, a thing that moves advances on some frames and not on others. So what is
// drawn is the state a share `alpha` of the way from the step before to the last one (alpha: how much of a step
// the clock holds that has not been simulated yet). The picture is then up to one step late, and even.
//   StepClock  the accumulator: how many steps a frame runs, and alpha
//   Interp     keeps where things were before the last step; `apply` writes the in-between places into the things
//              themselves for the time of a draw, `restore` puts the real ones back. Nothing may step in between:
//              the simulation never sees a drawn place.

// px in one step past which a thing was put somewhere, not moved (a respawn, a seat taken): it is not smeared
// (the fastest bullet goes 47 px a step)
export const JUMP = 64;

export class StepClock {
  // step: s of real time a step is worth; most: steps a frame may run (a long frame is not caught up: time is lost)
  constructor(step, most = 5) {
    this.step = step;
    this.most = most;
    this.acc = 0;
  }

  // dt s of real time went by: fn() once per step due (false from it: no more this frame, the time left is kept: a
  // hit-stop began). Returns the steps run. A time scale is fn's business: the clock counts real time, each step
  // moving the world by less, so alpha is right whatever the scale.
  run(dt, fn) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.step && n < this.most) {
      this.acc -= this.step;
      n++;
      if (fn() === false) break;
    }
    if (n >= this.most) this.acc = 0;
    return n;
  }

  reset() { this.acc = 0; }

  // 0 .. 1: the share of a step the clock holds. While nothing runs it (a hit-stop, a pause) it does not move, and
  // the picture stands still
  get alpha() { return Math.min(1, Math.max(0, this.acc / this.step)); }
}

export default class Interp {
  constructor() {
    this.n = 0;        // the last capture's stamp: what does not carry it has no place to come from (new, or still)
    this.bodies = [];  // Matter bodies taken at the last capture
    this.points = [];  // plain things with x, y (z)
    this.saved = [];   // the real places while applied: [thing, x, y, angle or z] in a row
    this.nb = 0;       // how many of `saved`'s rows are bodies (the others are points)
    this.on = false;
  }

  // Before a step: where everything that may move is. bodies: Matter bodies (static and sleeping ones are left
  // out); lists: arrays of things with x, y and maybe z (particles, bullets)
  capture(bodies, lists = []) {
    const n = ++this.n, B = this.bodies, P = this.points;
    B.length = 0;
    P.length = 0;
    for (const b of bodies) {
      if (b.isStatic || b.isSleeping) continue; // (asleep: it does not move; woken in the step, it is drawn where it is)
      b.ipx = b.position.x; b.ipy = b.position.y; b.ipa = b.angle; b.ipn = n;
      B.push(b);
    }
    for (const list of lists) {
      for (const p of list) {
        p.ipx = p.x; p.ipy = p.y; p.ipz = p.z; p.ipn = n;
        P.push(p);
      }
    }
  }

  // nothing has a place to come from any more: the state is drawn as it is (a new level, a world held still)
  still() {
    this.n++;
    this.bodies.length = 0;
    this.points.length = 0;
  }

  // Put everything a share alpha of the way from where it was before the last step to where it is. A thing made
  // during the step, or moved by more than JUMP, is left where it is.
  apply(alpha) {
    if (this.on) return;
    this.on = true;
    const S = this.saved, n = this.n, k = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    S.length = 0;
    this.nb = 0;
    if (k >= 1) return;
    for (const b of this.bodies) {
      if (b.ipn !== n) continue;
      const q = b.position, dx = q.x - b.ipx, dy = q.y - b.ipy, da = b.angle - b.ipa;
      if ((dx === 0 && dy === 0 && da === 0) || dx * dx + dy * dy > JUMP * JUMP) continue;
      S.push(b, q.x, q.y, b.angle);
      q.x = b.ipx + dx * k;
      q.y = b.ipy + dy * k;
      b.angle = b.ipa + da * k;
    }
    this.nb = S.length;
    for (const p of this.points) {
      if (p.ipn !== n) continue;
      const dx = p.x - p.ipx, dy = p.y - p.ipy, z = p.z, dz = z !== undefined && p.ipz !== undefined ? z - p.ipz : 0;
      if ((dx === 0 && dy === 0 && dz === 0) || dx * dx + dy * dy > JUMP * JUMP) continue;
      S.push(p, p.x, p.y, z);
      p.x = p.ipx + dx * k;
      p.y = p.ipy + dy * k;
      if (dz !== 0) p.z = p.ipz + dz * k;
    }
  }

  // the real places back
  restore() {
    if (!this.on) return;
    this.on = false;
    const S = this.saved, nb = this.nb;
    for (let i = 0; i < nb; i += 4) {
      const b = S[i];
      b.position.x = S[i + 1]; b.position.y = S[i + 2]; b.angle = S[i + 3];
    }
    for (let i = nb; i < S.length; i += 4) {
      const p = S[i];
      p.x = S[i + 1]; p.y = S[i + 2];
      if (S[i + 3] !== undefined) p.z = S[i + 3];
    }
    S.length = 0;
  }
}
