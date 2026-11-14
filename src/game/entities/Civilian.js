// A passer-by (ambient life): unarmed, light varied clothes, walks a path, panics and runs off the map (some
// trip on the way), curls up shaking in a corner or freezes hands up, each his own way and with his own voice.
// Or a patron posted indoors (sit): at a pastime on his seat (ai/Pastimes.js) until he panics like the others
// ('patronLeft' { civilian, activity } when he runs off it). Or a sleeper (sleep) lying there until he is woken.
// Moved by a Walker brain (ai/Civilians.js) that systems/Ambient.js ticks. Same body, death and gore as anyone;
// team 'civilian' so both sides' bullets hit him, but he is never a level target and guards ignore him.
import { CAT, MASK, TILE } from '../Config.js';
import { rand, approachAngle } from '../../engine/math.js';
import { WALKER } from '../ai/Civilians.js';
import { talks } from '../ai/Pastimes.js';
import { pastimeHands, drawPastime } from '../render/PastimeArt.js';
import Character from './Character.js';

const { Body, Bounds } = Matter;

// arm (sleeve) and hand colours of each civilian sprite (tools/generate_assets.py, CIVILIANS)
export const CIVILIAN_LOOKS = {
  civ1: { arm: '#d9a441', skin: '#eab08a' },
  civ2: { arm: '#f0a08a', skin: '#d99a76' },
  civ3: { arm: '#bfae86', skin: '#e2b08e' },
  civ4: { arm: '#8fbf6a', skin: '#c88a60' },
  // the dancers of a VIP room (bare arms), a tramp in his old coat: posted only, never picked for a passer-by
  dancer1: { arm: '#eab08a', skin: '#eab08a', posted: true },
  dancer2: { arm: '#b9774f', skin: '#b9774f', posted: true },
  tramp: { arm: '#6f7350', skin: '#c8906c', posted: true },
};
export const CIVILIAN_KINDS = Object.keys(CIVILIAN_LOOKS).filter((k) => !CIVILIAN_LOOKS[k].posted);
// passers-by walk out of the map: the edge barriers are not for them
const MASK_CIV = MASK.CHAR & ~CAT.EDGE;
const MASK_SEATED = MASK_CIV & ~CAT.PROP;
const OVER_HEAD = { hl: { x: 1, y: -4 }, hr: { x: 1, y: 4 } }; // arms over the head
const BALL = 1.6;      // how far down a curled-up one is (1 = ducking)
const TREMBLE = 46;    // rad/s of the shakes

export default class Civilian extends Character {
  constructor(world, x, y, angle, kind, brain) {
    super(world, x, y, angle, kind, 'civilian');
    this.look = CIVILIAN_LOOKS[kind];
    this.isCivilian = true;
    this.voice = rand(0.92, 1.3); // higher and more varied than the guards': each his own
    this.brain = brain;
    this.mate = null;      // the other half of a couple
    this.crouch = 0;
    this.seed = rand(0, 100);
    // how a passer-by carries his hands on a walk: in the pockets, on a bag, or swinging
    this.habit = this.seed < 22 ? 'pockets' : this.seed < 42 ? 'bag' : null;
    this.stuckT = 0;
    this.dodge = 0;
    this.post = null;      // a patron's spot { x, y, face } (see sit)
    this.seated = false;   // on his seat: furniture is not in his way
    this.left = false;     // a patron has run off his spot
    this.asleep = false;   // lying down until something wakes him (see sleep)
    this.solid();
  }

  solid() { this.body.collisionFilter = { category: CAT.CHAR, mask: this.seated ? MASK_SEATED : MASK_CIV, group: 0 }; }

  // a patron posted at (x, y): on a stool, in a booth, on a stage. He goes through the furniture he sits on until
  // he has run clear of it.
  sit(x, y, face) {
    this.post = { x, y, face };
    this.seated = true;
    this.solid();
  }

  // a sleeper lying at (x, y), his head toward `angle`: down, stepped over like a body, until a shot, a scream, a
  // blow or feet running over him wake him (systems/Ambient.js)
  sleep(x, y, angle) {
    this.post = { x, y, face: angle };
    this.asleep = true;
    this.knocked = Infinity;
    this.downT = 1; // already down: no fall
    this.downAngle = angle;
    this.body.collisionFilter = { category: CAT.CORPSE, mask: MASK.CORPSE & ~CAT.EDGE, group: 0 };
  }

  // called by Ambient (step 1, before physics)
  update(dt, sense) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    if (this.knocked > 0) {
      if (this.asleep && this.knocked === Infinity && this.brain.panicked) {
        // woken with a start: up and off, whatever his temper
        const d = this.brain.danger;
        this.knocked = rand(0.5, 0.8);
        this.brain.bolt(d.x, d.y);
      }
      this.knocked -= dt;
      this.steer(0, 0, 0, 0.08);
      if (this.knocked <= 0) {
        this.knocked = 0;
        this.asleep = false;
        this.solid();
        this.angle = this.downAngle + Math.PI;
      }
      return;
    }
    const b = this.brain;
    const it = b.update(dt, this.x, this.y, sense);
    if (b.fall) { b.fall = false; if (!this.seated) { this.trip(); return; } }
    const ducking = b.state === WALKER.PANIC && b.pose === 'duck' || b.state === WALKER.COWER;
    this.crouch += ((b.pose === 'ball' ? BALL : ducking ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    if (this.seated && (b.state === WALKER.FLEE || b.state === WALKER.HIDE)
      && !this.world.props.some((p) => p.body && !p.dead && !p.def?.fixture && Bounds.overlaps(p.body.bounds, this.body.bounds))) {
      this.seated = false;
      this.solid();
    }
    if (this.post && !this.left && (b.state === WALKER.FLEE || b.state === WALKER.HIDE)) {
      this.left = true;
      this.world.events.emit('patronLeft', { civilian: this, activity: b.activity });
    }
    if (it.x === null) {
      let face = it.face, hx = 0, hy = 0;
      if (this.post && b.state === WALKER.STOP) {
        // shoved off his seat, he gets back on it; a dancer steps around her spot and sways
        const d = b.activity === 'dance', t = this.world.time + this.seed;
        hx = this.post.x + (d ? Math.cos(t * 1.3) * 5 : 0) - this.x;
        hy = this.post.y + (d ? Math.sin(t * 1.9) * 4 : 0) - this.y;
        if (d) face += Math.sin(t * 2.6) * 0.7;
      }
      if (Math.hypot(hx, hy) > 1.5) this.steer(hx, hy, 0.4, 0.2); else this.steer(0, 0, 0, 0.25);
      if (b.activity === 'chat' && this.mate?.alive) face = Math.atan2(this.mate.y - this.y, this.mate.x - this.x);
      if (face !== null && face !== undefined) this.angle = approachAngle(this.angle, face, dt * 5);
      this.stuckT = 0;
      return;
    }
    let dx = it.x - this.x, dy = it.y - this.y;
    // walked into something (a parked car on the sidewalk, a crowd): sidestep for a moment
    const want = it.speed / 60;
    if (this.moving < want * 0.3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.8) { this.dodge = rand(0.5, 0.9) * (Math.random() < 0.5 ? -1 : 1); this.stuckT = 0; }
    if (this.dodge) {
      const s = Math.sign(this.dodge);
      [dx, dy] = [dx - dy * s * 1.5, dy + dx * s * 1.5];
      this.dodge -= s * dt;
      if (this.dodge * s <= 0) this.dodge = 0;
    }
    const running = b.state === WALKER.FLEE || b.state === WALKER.HIDE;
    this.steer(dx, dy, want, running ? 0.3 : 0.15);
    const ma = Math.atan2(dy, dx);
    // strollers look around a little; runners look where they go
    const look = b.state === WALKER.WALK ? Math.sin(this.world.time * 0.7 + this.seed) * 0.35 : 0;
    this.angle = approachAngle(this.angle, ma + look, dt * (running ? 10 : 3));
  }

  // a runner's feet go from under him: flat out for a moment, sliding, then up and off again
  trip() {
    const v = Body.getVelocity(this.body), a = Math.hypot(v.x, v.y) > 0.3 ? Math.atan2(v.y, v.x) : this.angle;
    this.knocked = rand(0.8, 1.3);
    this.downAngle = a + Math.PI;
    this.body.collisionFilter = { category: CAT.CORPSE, mask: MASK.CORPSE & ~CAT.EDGE, group: 0 };
    this.vel = { x: Math.cos(a) * 3, y: Math.sin(a) * 3 };
    Body.setVelocity(this.body, this.vel);
    this.brain.bark = 'trip';
    this.world.sound('bodyFall', this.x, this.y, 0.8);
  }

  // thrown gun, shove, punch: down for a moment, then he runs
  knock(angle) {
    if (!this.alive || (this.knocked > 0 && !this.asleep)) return;
    this.asleep = false;
    this.knocked = rand(1.2, 2);
    this.downAngle = angle + Math.PI;
    this.body.collisionFilter = { category: CAT.CORPSE, mask: MASK.CORPSE & ~CAT.EDGE, group: 0 };
    this.vel = { x: Math.cos(angle) * 3.5, y: Math.sin(angle) * 3.5 };
    Body.setVelocity(this.body, this.vel);
    this.world.particles.blood(this.x, this.y, angle, 0.6, 5, 110);
    this.brain.alarm(this.x - Math.cos(angle) * TILE, this.y - Math.sin(angle) * TILE, 'hit');
  }

  draw(ctx) {
    const b = this.brain, t = this.world.time;
    const k = 1 - this.crouch * 0.14;
    // curled up or frozen stiff, he shakes
    const shake = this.alive && !this.knocked && (b.pose === 'ball' || b.frozen) ? Math.sin(t * TREMBLE + this.seed) * 0.4 : 0;
    if (k < 1 || shake) { ctx.save(); ctx.translate(this.x + shake, this.y); ctx.scale(k, k); ctx.translate(-this.x, -this.y); }
    super.draw(ctx);
    if (k < 1 || shake) ctx.restore();
    if (!this.alive || this.knocked > 0) return;
    if (b.state === WALKER.STOP) drawPastime(ctx, this, this.pastime, t);
    else if (b.state === WALKER.WALK && this.habit === 'bag') drawPastime(ctx, this, 'bag', t);
  }

  // what he is at, as a kind of render/PastimeArt.js: a couple chats turn about, a window is looked at hands in
  // the pockets
  get pastime() {
    const a = this.brain.activity;
    if (a === 'chat') return talks(this.world.time, this.mate && this.seed > this.mate.seed ? 1 : 0) ? 'talk' : 'listen';
    return a === 'window' ? 'pockets' : a;
  }

  // CharacterAnim hook, where the hands are: at a pastime on his spot, up or over the head in a panic, in the
  // pockets or on a bag on a walk; null lets the arms swing
  busyHands() {
    const b = this.brain, t = this.world.time;
    if (b.state === WALKER.STOP) return pastimeHands(this.pastime, t, this.seed);
    if (b.state === WALKER.PANIC && b.pose === 'hands') {
      const sh = Math.sin(t * 30) * 0.6; // trembling
      return { hl: { x: 3 + sh, y: -9 }, hr: { x: 3 - sh, y: 9 } };
    }
    if (b.pose === 'ball') {
      const sh = Math.sin(t * TREMBLE + this.seed) * 0.5; // hands clasped on the back of the head
      return { hl: { x: 2 + sh, y: -3 }, hr: { x: 2 - sh, y: 3 } };
    }
    if (b.state === WALKER.COWER || (b.state === WALKER.PANIC && b.pose === 'duck')) return OVER_HEAD;
    if (b.state !== WALKER.WALK || !this.habit) return null;
    const h = pastimeHands(this.habit, t, this.seed);
    if (this.habit === 'bag') h.hl.x -= Math.sin(this.walk) * 2.6 * Math.min(1, this.gait); // the free arm swings
    return h;
  }
}
