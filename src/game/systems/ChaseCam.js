// The chase's own director (level 2A, the lab's stations 19 / 21 / 31; numbers: CHASE.cinema in data/chase.js): what
// the clock and the camera do at the wheel, where systems/KillCam.js never works. One beat at a time:
//   kill    a pursuer stopped for good by him (Pursuit's 'pursuerWreck'): `strong` the first time and once the
//           cooldown is over (slow motion that drops and snaps back, a cut in toward the wreck, a hit-stop, the
//           picture kicked its way), `light` otherwise (a tick of slow motion, the kick); a second car within a
//           breath does not get a beat of its own, it makes the one under way longer and deeper (killBeat)
//   lorry   the lorry across his road (systems/Lorries.js), once a lorry: on a collision course with where it will
//           stand and close (lorryCourse), the world slows, the view shifts toward the way round, the wheel answers
//           in real time and takes the car further (`wheel`, read by systems/Drive.js), until he is clear of it,
//           past it or into it; a tail cleared by a hair is told (sparks, a jolt)
//   rammed  a pursuer's side swipe landing on his car (Pursuit's 'pursuerRam'): a short kick
//   bend    a scripted corner of the route (systems/Drive.js 'chaseBend', each turn as it begins): a breath of slow
//           motion (CHASE.bend.apex), never cutting into another beat
//   choose  a toll's plaza ahead (systems/Toll.js), once a plaza: as its tells are up and its gates `lead` s off, the
//           world slows, the view cuts out to frame the gates, the wooden lanes' arrows pop, the wheel answers in real
//           time and takes the car further (as the lorry's), until he is committed to a wooden lane (tollCommitted),
//           `last` s before the lanes' mouths, past the gates, dead, or the cap
//   smash   the first thing he smashes in a scripted bend (systems/Drive.js 'chaseSmash': the alley's crates going up
//           round him): the world at x0.35 for 0.6 s real, snapping back (CHASE.bend.smash.beat); it takes over a
//           bend's breath, never another beat
//   toll    his car through a toll's wooden arm (systems/Toll.js 'tollGate'): a breath of slow motion, the picture
//           kicked on (CHASE.toll.beat), never cutting into another beat
// A beat is a time scale (`scale`: eased down over its `in`, held, back over its `out`; Game runs the world at it as
// it is, no easing of its own) and maybe a shot (`shot`: a SHOTS name and what it looks at; at the wheel a shot's
// zoom is a cut between whole zooms, the lens stays flat: no blur). It never touches the car: the wheel, the shove
// and the gun stay his all along. Not in the opening (Drive.grabbing), not once he is dead or past the end.
// `step` runs with the world (game time: what starts and ends a beat), `update` on the REAL clock (its ramps).
// DOM-free.
import { CHASE } from '../data/chase.js';
import { TILE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { laneY, nearestLane, mouthX } from './Toll.js';

// ---------------------------------------------------------------- pure
// What a pursuer stopped at `now` (real s) gets. S: { strong, beat, kill: when the last strong beat, the last beat
// and the last such car were (-Infinity: none), tier: the last beat's ('strong' | 'light' | null), on: a kill beat
// is still under way }. 'strong', 'light', 'more' (the beat under way goes on, longer and deeper) or null (nothing)
export function killBeat(now, S, K = CHASE.cinema.kill) {
  if (now - S.kill <= K.double) return S.tier !== 'strong' ? 'strong' : S.on ? 'more' : 'light'; // a double
  if (S.tier !== 'strong' && now - S.strong >= K.again) return 'strong'; // (never twice in a row)
  return now - S.beat < K.gap ? null : 'light';
}

// Is his car on its way into a lorry? car: { x, y (its middle), w, h, v (px/step along the road) }; box: where the
// lorry stands once out { x0, x1, y0, y1 }. Game s before its nose is at the lorry's flank (0: it is alongside),
// or null: clear of it across (by `pad` px), or past it
export function lorryCourse(car, box, C = CHASE.cinema.lorry) {
  if (car.y + car.h / 2 <= box.y0 - C.pad || car.y - car.h / 2 >= box.y1 + C.pad) return null;
  if (car.x - car.w / 2 > box.x1) return null;
  return Math.max(0, box.x0 - (car.x + car.w / 2)) / Math.max(1, car.v * 60);
}

// where a lorry stands once it has backed out (systems/Lorries.js list entry): { x0, x1, y0, y1 } world px
export function lorryBox(L) {
  const cx = L.x0 + L.dx * L.dist, cy = L.y0 + L.dy * L.dist, long = L.p.def.w / 2, wide = L.p.def.h / 2;
  const hx = Math.abs(L.dx) > Math.abs(L.dy) ? long : wide, hy = Math.abs(L.dx) > Math.abs(L.dy) ? wide : long;
  return { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy };
}

// Game s before plaza P's gates for a car at x (world px) going v px/step; null: past them
export function gatesIn(P, x, v) {
  const gx = P.at * TILE;
  return x > gx ? null : (gx - x) / Math.max(1, v * 60);
}

// Has a car ({ x, y: its middle, u: px/step across }) chosen its way through plaza P: in the fan (its lanes apart),
// on a wooden lane's line within `commit` px and no longer going across (`still` px/step at most); or past the gates
export function tollCommitted(P, car, K = CHASE.cinema.choose) {
  if (car.x > P.at * TILE) return true;
  if (car.x < P.fan[0] * TILE) return false;
  const k = nearestLane(P, car.y, car.x, 'wood');
  return k >= 0 && Math.abs(laneY(P, k, car.x) - car.y) <= K.commit && Math.abs(car.u) <= K.still;
}

// A beat's time scale t real s in (b: { slow, in, hold, out }; `left`: the hold over, s since): 1 once it is over
export function beatScale(b, t, left = -1) {
  if (left >= 0) return left >= b.out ? 1 : b.slow + (1 - b.slow) * (left / b.out);
  return t >= b.in ? b.slow : 1 + (b.slow - 1) * (t / b.in);
}

export default class ChaseCam {
  constructor(world, cfg = CHASE.cinema) {
    this.world = world;
    this.C = cfg;
    this.scale = 1;       // the time scale it asks for (1: none)
    // { kind, tier, slow, in, hold, out, t (real s in), left (real s since its hold ended, -1: held), shot, at,
    //   held (a lorry's: until released), L (its lorry) }
    this.beat = null;
    this.now = 0;         // real s
    this.S = { strong: -Infinity, beat: -Infinity, kill: -Infinity, tier: null, on: false };
    this.ramAt = -Infinity;
    world.events.on('pursuerWreck', (e) => this.onWreck(e));
    world.events.on('pursuerRam', (e) => this.onRam(e));
    world.events.on('chaseBend', (e) => this.onBend(e));
    world.events.on('tollGate', (e) => this.onToll(e));
    world.events.on('chaseSmash', (e) => this.onSmash(e));
  }

  // may a beat open, or go on?
  get live() {
    const w = this.world, d = w.drive;
    return !!d?.on && !d.dead && !d.grabbing && !w.exited && !!w.player?.alive;
  }

  get active() { return !!this.beat; }

  // what a slow motion of the lorry's or the toll's choosing gives the wheel (systems/Drive.js): its rate back in real
  // time, `most` times the sideways speed; null: the wheel as usual
  get wheel() {
    const b = this.beat;
    return b?.kind === 'lorry' || b?.kind === 'choose' ? { rate: 1 / clamp(this.scale, 0.1, 1), most: this.C[b.kind].wheel } : null;
  }

  // 0..1: how far the toll's choosing has slowed the world (its tells pop with it: render/PursuitArt.js)
  get choosing() {
    const b = this.beat;
    return b?.kind === 'choose' ? clamp((1 - this.scale) / (1 - b.slow), 0, 1) : 0;
  }

  // ---------------------------------------------------------------- the kills
  // a pursuer is out of the chase: { car (its Vehicle), x, y }
  onWreck({ car }) {
    if (!this.live || !car) return;
    const K = this.C.kill, S = this.S, w = this.world, b = this.beat;
    S.on = b?.kind === 'kill';
    // (a pursuer crashed on a toll's steel boom, systems/Toll.js: the strong beat whatever the cooldown)
    const tier = car.tollCrash && !(b?.kind === 'kill' && S.on) ? 'strong' : killBeat(this.now, S, K);
    S.kill = this.now;
    if (!tier || (b && (b.kind === 'lorry' || b.kind === 'choose'))) return; // (those slow motions are not cut into)
    if (tier === 'more') {
      b.hold += K.more;
      b.slow = Math.max(0.1, b.slow - K.deep);
      b.left = -1;
      b.at = car;
    } else {
      const T = car.tollCrash ? K.toll : K[tier];
      this.open({ kind: 'kill', tier, ...T, at: car });
      S.tier = tier;
      if (tier === 'strong') S.strong = this.now;
      if (T.stop) w.hitstop?.(T.stop);
    }
    S.beat = this.now;
    // the picture kicked toward it, shaken; the lens and the pad feel a hit
    const T = car.tollCrash ? K.toll : K[S.tier], v = w.drive.van, a = Math.atan2(car.y - v.y, car.x - v.x);
    w.camera?.push(Math.cos(a) * T.push, Math.sin(a) * T.push);
    w.shake?.(T.shake);
    w.events.emit('ride', { beat: 'hit', x: car.x, y: car.y });
    w.events.emit('chaseBeat', { kind: 'kill', tier, x: car.x, y: car.y });
  }

  // a pursuer's side swipe lands on his car: { car, x, y, side (-1: it came from -y) }
  onRam({ x, y, side }) {
    const R = this.C.rammed, w = this.world;
    if (!this.live || this.beat || this.now - this.ramAt < R.gap) return;
    this.ramAt = this.now;
    this.open({ kind: 'rammed', tier: 'light', ...R, shot: null, at: null });
    w.camera?.push(0, side * R.push);
    w.shake?.(R.shake);
    w.particles?.sparks(x, y, Math.PI, 1.2, R.sparks, 300);
    w.events.emit('chaseBeat', { kind: 'rammed', tier: 'light', x, y });
  }

  // a turn of a scripted bend begins ({ phase: 'turn' }): the breath of slow motion
  onBend({ phase, x, y }) {
    const A = CHASE.bend.apex;
    if (phase !== 'turn' || !A || !this.live || this.beat) return;
    this.open({ kind: 'bend', tier: 'light', ...A, shot: null, at: null });
    this.world.events.emit('chaseBeat', { kind: 'bend', tier: 'light', x, y });
  }

  // the first thing smashed in a bend ({ x, y }): the slow motion of the alley (over a bend's breath under way)
  onSmash({ x, y }) {
    const B = CHASE.bend.smash.beat, w = this.world, v = w.drive?.van;
    if (!B || !this.live || (this.beat && this.beat.kind !== 'bend')) return;
    this.open({ kind: 'smash', tier: 'strong', ...B, shot: null, at: null });
    if (v) { const a = Math.atan2(y - v.y, x - v.x); w.camera?.push(Math.cos(a) * B.push, Math.sin(a) * B.push); }
    w.shake?.(B.shake);
    w.events.emit('ride', { beat: 'hit', x, y });
    w.events.emit('chaseBeat', { kind: 'smash', tier: 'strong', x, y });
  }

  // his car through a toll's wooden arm ({ his, x, y }): the arm flies, the world slows a breath
  onToll({ his, x, y }) {
    const B = CHASE.toll.beat, w = this.world;
    if (!his || !this.live || this.beat) return;
    this.open({ kind: 'toll', tier: 'light', ...B, shot: null, at: null });
    w.camera?.push(B.push, 0);
    w.shake?.(B.shake);
    w.events.emit('ride', { beat: 'hit', x, y });
    w.events.emit('chaseBeat', { kind: 'toll', tier: 'light', x, y });
  }

  open(b) { this.beat = { t: 0, left: -1, held: false, ...b }; }

  // ---------------------------------------------------------------- with the world (game time)
  step() {
    const w = this.world, d = w.drive;
    if (!d?.on) return;
    if (w.toll) this.choose(d);
    if (w.lorries) this.lorry(d);
  }

  // a toll's plaza ahead: the choosing's slow motion opened `lead` s out, once a plaza (as soon as its tells are up),
  // let go once he is committed to a wooden lane or past the gates
  choose(d) {
    const K = this.C.choose, b = this.beat, v = d.van, car = { x: v.x, y: v.y, u: d.u };
    if (b?.kind === 'choose') {
      // (or `last` s before the lanes' mouths at his speed: from there it is his to make at full speed)
      if (b.held && (tollCommitted(b.P, car, K) || (mouthX(b.P) - v.x) / Math.max(1, d.v * 60) <= K.last)) { b.held = false; b.left = 0; }
      return;
    }
    if (b || !this.live) return;
    for (const P of this.world.toll.plazas) {
      const lead = P.chosen || !P.k ? null : gatesIn(P, v.x, d.v);
      if (lead === null || lead > K.lead) continue;
      P.chosen = true;
      this.open({ kind: 'choose', tier: 'strong', slow: K.slow, in: K.in, hold: K.cap, out: K.out, shot: K.shot, at: null, held: true, P });
      this.world.events.emit('chaseBeat', { kind: 'choose', tier: 'strong', x: P.x, y: v.y });
      return;
    }
  }

  // the lorries across his road
  lorry(d) {
    const w = this.world, C = this.C.lorry, b = this.beat;
    const v = d.van, car = { x: v.x, y: v.y, w: v.w, h: v.h, v: d.v };
    for (const L of w.lorries.list) {
      if (L.state === 'wait') { L.slowed = L.shaved = false; continue; }
      if (L.state === 'home') continue;
      const box = lorryBox(L), lead = lorryCourse(car, box, C);
      if (b?.L === L) {
        // clear of it across, or past it: time comes back
        if (lead === null && b.held) { b.held = false; b.left = 0; }
      } else if (!L.slowed && !b && this.live && lead !== null && lead <= C.lead) {
        L.slowed = true;
        this.open({ kind: 'lorry', tier: 'strong', slow: C.slow, in: C.in, hold: C.cap, out: C.out, shot: L.gap ? C.shot : null, at: L.gap, held: true, L });
        w.events.emit('chaseBeat', { kind: 'lorry', tier: 'strong', x: box.x0, y: (box.y0 + box.y1) / 2 });
      }
      this.shave(L, box, v);
    }
  }

  // its tail (or its cab) cleared by a hair as he goes by: sparks off its corner, a jolt; once a lorry
  shave(L, box, v) {
    const C = this.C.lorry, w = this.world;
    if (L.shaved || !L.slowed || v.x + v.w / 2 < box.x0 || v.x - v.w / 2 > box.x1) return;
    const under = v.y - v.h / 2 - box.y1, over = box.y0 - (v.y + v.h / 2), gap = Math.max(under, over);
    L.shaved = true; // (alongside it: this is the one look)
    if (gap < 0 || gap >= C.shave) return;
    const x = clamp(v.x + v.w / 2, box.x0, box.x1), y = under >= 0 ? box.y1 : box.y0;
    w.particles?.sparks(x, y, Math.PI, 0.9, 12, 280);
    w.shake?.(0.2);
    w.sound?.('vanScrape', x, y, 0.7);
    w.events.emit('ride', { beat: 'scrape', x, y });
    w.events.emit('chaseBeat', { kind: 'shave', tier: 'light', x, y });
  }

  // ---------------------------------------------------------------- on the real clock
  update(dt) {
    this.now += dt;
    const b = this.beat;
    if (!b) { this.scale = 1; return; }
    if (!this.live) { this.cancel(); return; }
    b.t += dt;
    if (b.left >= 0) b.left += dt;
    else if (b.t >= b.in + b.hold) b.left = 0;
    this.scale = beatScale(b, b.t, b.left);
    if (b.left >= b.out) { this.beat = null; this.scale = 1; }
  }

  // let go of everything at once (his death, the end of the road)
  cancel() {
    this.beat = null;
    this.scale = 1;
  }

  // the camera's shot (Game.stagedShot): while the beat holds, not on its way out (the cut back comes as time does)
  shot() {
    const b = this.beat;
    if (b?.kind === 'choose' && b.left < 0) return this.chooseShot(b);
    if (!b?.shot || !b.at || b.left >= 0) return null;
    return { name: b.shot, at: { x: b.at.x, y: b.at.y } };
  }

  // the choosing's view (its shot pulls all the way): along the road the drive's own framing `ahead` of the view's
  // width further on (Drive.frame: the car a third of it from the left; d.viewW, the view's width as it was last
  // framed), across on the plaza's middle
  chooseShot(b) {
    const d = this.world.drive, P = b.P, vw = d.viewW || CHASE.camera.view * 16 / 9;
    const y = P.lanes.reduce((a, r) => a + r, 0) / P.lanes.length * TILE;
    return { name: b.shot, at: { x: d.van.x + vw * (0.5 - CHASE.camera.at + this.C.choose.ahead), y } };
  }
}
