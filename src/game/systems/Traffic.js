// Pure traffic rules (no Matter, no DOM, unit tested): lanes and their spawn schedule / jam detection,
// car following, obstacle search in a lane band, going around a blocked lane, and the driver brain.
// Roads are horizontal: a lane is a row (y) driven toward +x (dir 1) or -x (dir -1). Units: px, px/s, s.
// Obstacles are axis-aligned boxes { x0, x1, y0, y1, ref, speed (px/s along x, signed), moving }.
import { TILE, AMBIENT as A } from '../Config.js';

// small seeded generator (mulberry32): the street plays the same way for a given seed
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (r, [a, b]) => a + r() * (b - a);

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Lane {
  // def: { row, dir, speed (tiles/s), gap: [min, max] s, models }; width: map width in px
  constructor(def, width) {
    this.y = def.row * TILE;
    this.dir = def.dir >= 0 ? 1 : -1;
    this.speed = def.speed * TILE;
    this.gap = def.gap || [6, 14];
    this.models = def.models?.length ? def.models : ['car'];
    this.width = width;
    this.timer = 0;     // s before the next vehicle is due
    this.blockedT = 0;  // s the due vehicle has been waiting for a clear spawn
    this.clearT = 0;    // s the lane has been clear while closed
    this.closed = false;
  }

  get angle() { return this.dir > 0 ? 0 : Math.PI; }

  // where a vehicle of half length hl appears, and whether it has left the street at x
  spawnX(hl) { const m = A.margin * TILE + hl; return this.dir > 0 ? -m : this.width + m; }
  gone(x, hl) { const m = A.margin * TILE + hl + 8; return this.dir > 0 ? x > this.width + m : x < -m; }

  // Spawn schedule. spawnClear: nothing in the spawn box; laneClear: no queue (stopped traffic) on the lane;
  // room: under the global cap. Returns true when a vehicle must spawn now.
  // A lane whose spawn stays blocked for A.jam seconds closes (no endless queue), and reopens once clear.
  tick(dt, { spawnClear, laneClear, room }, r) {
    if (this.closed) {
      this.clearT = laneClear && spawnClear ? this.clearT + dt : 0;
      if (this.clearT < A.reopen) return false;
      this.closed = false;
      this.blockedT = 0;
      this.timer = between(r, this.gap) * 0.5;
    }
    this.timer -= dt;
    if (this.timer > 0) return false;
    if (!spawnClear) {
      this.blockedT += dt;
      if (this.blockedT > A.jam) { this.closed = true; this.clearT = 0; }
      return false;
    }
    this.blockedT = 0;
    if (!room) return false;
    this.timer = between(r, this.gap);
    return true;
  }
}

// nearest obstacle ahead of a car { x, y, hl, hw, dir, ref } in the band of width 2·(hw + pad) centred on bandY.
// Something already beside the car counts as gap 0 as long as its far end is ahead of the car's centre.
export function gapAhead(car, obstacles, bandY = car.y, from = car.x) {
  const pad = A.lanePad * TILE, y0 = bandY - car.hw - pad, y1 = bandY + car.hw + pad;
  const front = from + car.dir * car.hl;
  let gap = Infinity, obstacle = null;
  for (const o of obstacles) {
    if (o.ref === car.ref || o.y1 < y0 || o.y0 > y1) continue;
    const far = car.dir > 0 ? o.x1 : o.x0;
    if ((far - from) * car.dir <= 0) continue;
    const d = Math.max(0, car.dir > 0 ? o.x0 - front : front - o.x1);
    if (d < gap) { gap = d; obstacle = o; }
  }
  return { gap, obstacle };
}

// highest speed (px/s) that still stops A.minGap short of something `gap` px ahead moving at `lead` px/s,
// with A.headway s of reaction and A.brake deceleration
export function safeSpeed(gap, lead = 0) {
  const b = A.brake * TILE, h = A.headway;
  const room = gap - A.minGap * TILE + (lead > 0 ? (lead * lead) / (2 * b) : 0);
  if (room <= 0) return 0;
  return b * (-h + Math.sqrt(h * h + (2 * room) / b));
}

// A free band to go around `blocker`: one of the candidate lane rows (nearest first) with no static obstacle
// over the whole manoeuvre and no oncoming vehicle that could get there first. Returns { y, passX } or null.
export function findBypass(car, blocker, rows, obstacles) {
  const passX = (car.dir > 0 ? blocker.x1 : blocker.x0) + car.dir * (car.hl + A.minGap * TILE);
  const lo = Math.min(car.x, passX + car.dir * car.hl), hi = Math.max(car.x, passX + car.dir * car.hl);
  const pad = A.lanePad * TILE;
  const cands = rows.filter((y) => Math.abs(y - car.y) > car.hw).sort((a, b) => Math.abs(a - car.y) - Math.abs(b - car.y));
  for (const y of cands) {
    const y0 = y - car.hw - pad, y1 = y + car.hw + pad;
    let ok = true;
    for (const o of obstacles) {
      if (o.ref === car.ref || o.y1 < y0 || o.y0 > y1) continue;
      // anything on the way, or coming at us fast enough to meet us during the manoeuvre (~3 s)
      const reach = o.moving && o.speed * car.dir < 0 ? Math.abs(o.speed) * 3 : 0;
      if (o.x1 + (car.dir < 0 ? reach : 0) >= lo && o.x0 - (car.dir > 0 ? reach : 0) <= hi) { ok = false; break; }
    }
    if (ok) return { y, passX };
  }
  return null;
}

// lateral error -> heading: steer toward targetY, limited, the sign depends on the driving direction
export function steerAngle(dir, y, targetY, max = A.maxSteer) {
  const e = (targetY - y) / TILE;
  const a = Math.max(-max, Math.min(max, e * A.steer));
  return (dir > 0 ? 0 : Math.PI) + a * dir;
}

// The driver of one traffic vehicle: cruise speed with a personal spread, car following, late braking for
// people, patience then a detour around a stuck obstacle (a body in the road is gone round, or crept over when
// there is no way round), panic (floor it) under fire, fleeing (stand on the brake, leave the car where it stops)
// when shots ring out, held up at gunpoint (heldUp), coasting to a stop once disabled.
// state: drive | held | coast | stopped (handed over to the world as a parked / wrecked car).
export class Driver {
  constructor(lane, r) {
    this.lane = lane;
    this.r = r;
    this.cruise = lane.speed * (1 + (r() * 2 - 1) * A.speedVar);
    this.speed = this.cruise;
    this.state = 'drive';
    this.targetY = lane.y;
    this.brake = 0;
    this.waitT = 0;
    this.patience = between(r, A.patience);
    this.attention = between(r, A.attention) * TILE;
    this.noticeT = 0;
    this.idleT = 0;
    this.reverseT = 0;
    this.bypass = null;
    this.panic = false;
    this.phase = r() * 100;
    this.wobble = between(r, [0.3, 1]) * A.wobble[0] * TILE;
    this.decel = 0;
    this.coastY = lane.y;
    this.reason = null;
    this.fleeT = null;  // s before the scared driver hits the brake (null: not fleeing)
    this.heldT = 0;     // held up: s the gun has been off him
    this.creep = 0;     // s left he rolls over a body there is no way round (see update)
  }

  // A gun pointed at him from close (Ambient.aimedAt): what he does is his nature's (A.heldUp odds, drawn with r):
  // 'flee' (stop, get out and run: flee), 'duck' (stop dead, hands up, until the gun has been off him A.heldUp.resume
  // s, then away flat out), 'floor' (foot down, through). Returns what he does, or null when he is past caring
  // (already scared off, coasting, held up once already).
  heldUp() {
    if (this.state !== 'drive' || this.fleeT !== null || this.wasHeld) return null;
    this.wasHeld = true; // once: what he does next is up to him
    const H = A.heldUp, k = this.r();
    if (k < H.flee) { this.flee(between(this.r, A.flee.delay) * 0.5); return 'flee'; }
    if (k < H.flee + H.duck) { this.state = 'held'; this.heldT = 0; return 'duck'; }
    this.panic = true;
    return 'floor';
  }

  // gunfire close by: after `delay` s of shock, stop dead and abandon the car (reason 'scared')
  flee(delay) {
    if ((this.state === 'drive' || this.state === 'held') && this.fleeT === null) { this.state = 'drive'; this.fleeT = delay; }
  }

  get moving() { return this.state !== 'stopped'; }
  get steerMax() { return this.bypass ? A.detour.steer : A.maxSteer; }

  // s: { x, y, hw, gap, lead (px/s), leadStatic, person (gap to a person in the band, px), passed, stalled (pushing
  // against something without moving), bypass() -> { y, passX } | null }
  update(dt, s) {
    if (this.state === 'stopped') return;
    this.phase += dt * A.wobble[1] * Math.PI * 2;
    if (this.state === 'held') {
      // stopped dead, hands up, until the gun has been off him a while; then away, foot down
      this.speed = Math.max(0, this.speed - A.emergency * TILE * dt);
      this.brake = 1;
      this.targetY = s.y;
      this.heldT = s.aimed ? 0 : this.heldT + dt;
      if (this.heldT > A.heldUp.resume) { this.state = 'drive'; this.panic = true; }
      return;
    }
    if (this.state === 'coast') {
      this.speed = Math.max(0, this.speed - this.decel * dt);
      // still stops behind whatever is in front (it does not plough through a wreck)
      this.speed = Math.min(this.speed, Math.max(safeSpeed(s.gap, s.lead) * 1.3, this.speed - A.emergency * TILE * dt));
      this.targetY = this.coastY;
      this.brake = 1;
      if (this.speed < 4) { this.speed = 0; this.state = 'stopped'; }
      return;
    }
    if (this.fleeT !== null && (this.fleeT -= dt) <= 0) {
      this.speed = Math.max(0, this.speed - A.emergency * TILE * dt);
      this.brake = 1;
      this.targetY = s.y;
      if (this.speed < 4) { this.speed = 0; this.state = 'stopped'; this.reason = 'scared'; }
      return;
    }
    // jammed for good (every way round blocked): engine off, it stays there as a parked car
    this.idleT = this.speed < 10 ? this.idleT + dt : 0;
    if (this.idleT > A.giveUp) { this.speed = 0; this.state = 'stopped'; this.reason = 'jam'; return; }
    // pulling out but wedged against the obstacle's corner: back up a little with the wheels straight, try again
    if (s.stalled && this.bypass && this.reverseT <= 0) this.reverseT = A.detour.reverse;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      this.speed = -A.detour.speed * TILE * 0.7;
      this.targetY = s.y;
      this.brake = 0;
      return;
    }
    let want = this.cruise * (this.panic ? A.panicBoost : 1);
    // behind something that will not move, stop with room to pull out around it
    want = Math.min(want, safeSpeed(s.gap - (s.leadStatic && !this.bypass ? A.detour.room * TILE : 0), s.lead));
    // pulling out around an obstacle: slowly until the car is in the free band
    if (this.bypass && Math.abs(s.y - this.bypass.y) > s.hw) want = Math.min(want, A.detour.speed * TILE);
    // a person in the way: seen late (attention), then hard braking after a human reaction time
    if (s.person < this.attention + this.speed * 0.25) this.noticeT += dt;
    else this.noticeT = 0;
    let hard = false;
    if (this.noticeT > 0.3) { want = Math.min(want, safeSpeed(s.person, 0)); hard = true; }
    // stuck behind something that will not move: wait a little, then go around it on another lane; a body with no
    // way round it is crept over (s.soft: what is in front is a body)
    const stuck = this.speed < 10 && s.leadStatic && s.gap < (A.minGap + A.detour.room) * TILE * 1.5;
    this.waitT = stuck || (hard && this.speed < 10) ? this.waitT + dt : 0;
    if (this.bypass && s.passed) this.bypass = null;
    if (!this.bypass && this.waitT > this.patience) {
      this.bypass = s.bypass?.() || null;
      if (this.bypass) this.waitT = 0;
      else if (s.soft) { this.creep = A.body.creep; this.waitT = 0; }
    }
    this.creep = Math.max(0, this.creep - dt);
    const b = (hard || want < this.speed - A.brake * TILE * 0.5 ? A.emergency : A.brake) * TILE;
    this.speed = want > this.speed ? Math.min(want, this.speed + A.accel * TILE * dt) : Math.max(want, this.speed - b * dt);
    this.brake = want < this.speed + 2 && (want < this.cruise * 0.9 || this.speed < 5) ? 1 : 0;
    this.targetY = (this.bypass ? this.bypass.y : this.lane.y) + Math.sin(this.phase) * this.wobble;
  }

  // dead driver / burst tyre / fire: let go, drift toward `side` (-1 | 1) and roll to a stop
  disable(reason, side) {
    if (this.state !== 'drive' && this.state !== 'held') return;
    this.state = 'coast';
    this.reason = reason;
    this.decel = between(this.r, A.coast) * TILE;
    this.coastY = this.targetY + side * between(this.r, A.swerve) * TILE;
  }
}
