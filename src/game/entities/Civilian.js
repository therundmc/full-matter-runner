// A passer-by (ambient life): unarmed, light varied clothes, walks a path, panics and runs off the map (some
// trip on the way), curls up shaking in a corner or freezes hands up, each his own way and with his own voice.
// Or a patron posted indoors (sit): at a pastime on his seat (ai/Pastimes.js) until he panics like the others
// ('patronLeft' { civilian, activity } when he runs off it). Or a sleeper (sleep) lying there until he is woken.
// Moved by a Walker brain (ai/Civilians.js) that systems/Ambient.js ticks. Same body, death and gore as anyone;
// team 'civilian' so both sides' bullets hit him, but he is never a level target and guards ignore him.
import { CAT, MASK, TILE } from '../Config.js';
import { rand, approachAngle, angDiff, clamp, bump } from '../../engine/math.js';
import { GESTURE, DANCE } from '../data/feel.js';
import { WALKER } from '../ai/Civilians.js';
import { talks, arcadeAt, laundryAt } from '../ai/Pastimes.js';
import { Dance, beatAt } from '../ai/Dance.js';
import { pastimeHands, drawPastime, pastimeLean } from '../render/PastimeArt.js';
import Character from './Character.js';
import { bodyFrame, dancePose, postPose } from './CharacterAnim.js';
import { dice } from '../systems/Rng.js';

const { Body, Bounds } = Matter;

// arm (sleeve) and hand colours of each civilian sprite (tools/sprites/characters.py CIVILIANS)
export const CIVILIAN_LOOKS = {
  civ1: { arm: '#d9a441', skin: '#eab08a', pants: '#4f6a98', shoe: '#e8e4da' },
  civ2: { arm: '#f0a08a', skin: '#d99a76', pants: '#3a2c4a', shoe: '#7a1f2a' },
  civ3: { arm: '#bfae86', skin: '#e2b08e', pants: '#55555f', shoe: '#3a2a20' },
  civ4: { arm: '#8fbf6a', skin: '#c88a60', pants: '#4a4a3a', shoe: '#ecebf2' },
  civ5: { arm: '#4a4e5a', skin: '#e6ae8a', cuff: '#f4f2ec', pants: '#3e424c', shoe: '#2a1a14' },
  civ6: { arm: '#2a46a8', skin: '#b8805a', cuff: '#f4f2ec', pants: '#2a46a8', shoe: '#ecebf2' },
  civ7: { arm: '#1f8a5a', skin: '#efc2a0', pants: '#22202a', shoe: '#b8202a' },
  civ8: { arm: '#6a8ab8', skin: '#e2b08e', pants: '#2e3a52', shoe: '#5a3a22' },
  // the dancers of a VIP room (bare arms and legs), a tramp in his old coat: posted only, never picked for a passer-by
  dancer1: { arm: '#eab08a', skin: '#eab08a', pants: '#eab08a', shoe: '#ff3d8a', posted: true },
  dancer2: { arm: '#b9774f', skin: '#b9774f', pants: '#b9774f', shoe: '#f4f2ec', posted: true },
  tramp: { arm: '#6f7350', skin: '#c8906c', pants: '#3e3a34', shoe: '#2a2420', posted: true },
};
export const CIVILIAN_KINDS = Object.keys(CIVILIAN_LOOKS).filter((k) => !CIVILIAN_LOOKS[k].posted);
// passers-by walk out of the map: the edge barriers are not for them
const MASK_CIV = MASK.CHAR & ~CAT.EDGE;
const MASK_SEATED = MASK_CIV & ~CAT.PROP;
const OVER_HEAD = { hl: { x: 1, y: -4 }, hr: { x: 1, y: 4 } }; // arms over the head
const MOOD = { hunch: 0, duck: 0, lift: 0, lean: 0, look: 0, twist: 0, shake: 0 };
const BALL = 1.6;      // how far down a curled-up one is (1 = ducking)
const TREMBLE = 46;    // rad/s of the shakes
const COVER = 0.5;     // how far down one running with his arms over his head goes
// what being down that far takes off his drawn size (a share per unit, at most BALL's): curled up he still reads as a
// man his size, the crouch is in his pose (mood: hunch, duck); 0.14 drew him a fifth smaller, back to the world's 1x
const SINK = 0.04;
export const crouchScale = (crouch) => 1 - Math.min(Math.max(0, crouch), BALL) * SINK;

// the machines a posted man works at, from where he stands: the arcade cabinet ahead of him; the washer ahead (the
// one he empties) and the one beside it at his right (the pile on its lid). Searched once, within MACHINE px.
const MACHINE = 44;
function findMachines(ch, kind) {
  const c = Math.cos(ch.post.face), s = Math.sin(ch.post.face), near = (use, fwd, side) => {
    const x = ch.post.x + c * fwd - s * side, y = ch.post.y + s * fwd + c * side;
    let best = null, bd = MACHINE;
    for (const p of ch.world.props) {
      const d = p.def?.use === use && !p.dead ? Math.hypot(p.x - x, p.y - y) : Infinity;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  if (kind === 'arcade') return { cab: near('arcade', 16, 0) };
  const drum = near('washer', 22, 0);
  const pile = ch.world.props.find((p) => p.def?.use === 'washer' && p !== drum && !p.dead && Math.hypot(p.x - (ch.post.x + c * 22 - s * 23), p.y - (ch.post.y + s * 22 + c * 23)) < 14) || null;
  return { drum, pile };
}

export default class Civilian extends Character {
  constructor(world, x, y, angle, kind, brain) {
    super(world, x, y, angle, kind, 'civilian');
    this.look = CIVILIAN_LOOKS[kind];
    this.isCivilian = true;
    // higher and more varied than the guards': each his own, the dancers' higher still
    this.voice = kind.startsWith('dancer') ? rand(1.3, 1.45) : rand(0.92, 1.3);
    this.brain = brain;
    this.mate = null;      // the other half of a couple
    this.crouch = 0;
    this.seed = rand(0, 100);
    // how a passer-by carries his hands on a walk: in the pockets, on a bag, or swinging
    this.habit = this.seed < 22 ? 'pockets' : this.seed < 42 ? 'bag' : null;
    this.stuckT = 0;
    this.blocks = 0;       // sidesteps on the way (see update)
    this.dodge = 0;
    this.dodgeSide = dice(this.world).next() < 0.5 ? -1 : 1; // the side of his next sidestep (they alternate)
    this.post = null;      // a patron's spot { x, y, face } (see sit)
    this.seated = false;   // on his seat: furniture is not in his way
    this.left = false;     // a patron has run off his spot
    this.asleep = false;   // lying down until something wakes him (see sleep)
    this.dance = null;     // a dancer's routine at her pole (ai/Dance.js), how far she is into it (0 .. 1)
    this.danceW = 0;
    this.lead = null;      // what moves her body, feet and layers while she dances (Facing.js lead)
    // how he runs for it once scared, each his own way: arms over his head and ducked, a stumbling start, or flat
    // out, looking back over his shoulder now and then
    this.runStyle = this.seed < 30 ? 'cover' : this.seed < 60 ? 'stumble' : 'flail';
    this.startle = 0;      // s left of the jump at his fright (mood)
    this.scared = false;   // panicked at the last step
    this.fleeT = 0;        // s he has been running for it
    this.backT = rand(...GESTURE.panic.look.every); // s to his next look back
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
    this.lead = null;
    const danceW = this.danceW;
    this.danceW = Math.max(0, danceW - dt / DANCE.out); // out of it unless she dances on (danceOn)
    if (!this.alive) return;
    if (this.knocked > 0) {
      if (this.asleep && this.knocked === Infinity && this.brain.panicked) {
        // woken with a start: up and off, whatever his temper
        const d = this.brain.danger;
        this.knocked = dice(this.world).rand(0.5, 0.8);
        this.brain.bolt(d.x, d.y);
      }
      this.knocked -= dt;
      this.steer(0, 0, 0, 0.08);
      if (!this.asleep) this.layClear(dt);
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
    if (b.panicked && !this.scared) this.startle = GESTURE.panic.startle.dur; // (scared whenever: by Ambient, a blow)
    this.scared = b.panicked;
    this.startle = Math.max(0, this.startle - dt);
    const fleeing = b.state === WALKER.FLEE || b.state === WALKER.HIDE;
    this.fleeT = fleeing ? this.fleeT + dt : 0;
    if (fleeing && (this.backT -= dt) < -GESTURE.panic.look.dur) this.backT = rand(...GESTURE.panic.look.every);
    if (b.fall) { b.fall = false; if (!this.seated) { this.trip(); return; } }
    const ducking = b.state === WALKER.PANIC && b.pose === 'duck' || b.state === WALKER.COWER;
    const cover = fleeing && this.runStyle === 'cover';
    this.crouch += ((b.pose === 'ball' ? BALL : ducking ? 1 : cover ? COVER : 0) - this.crouch) * Math.min(1, dt * 10);
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
      if (this.post && b.state === WALKER.STOP && b.activity === 'dance') { this.danceOn(dt, danceW); this.stuckT = 0; return; }
      let face = it.face, hx = 0, hy = 0;
      if (this.post && b.state === WALKER.STOP) {
        // shoved off his seat, he gets back on it
        hx = this.post.x - this.x;
        hy = this.post.y - this.y;
      }
      if (Math.hypot(hx, hy) > 1.5) this.steer(hx, hy, 0.4, 0.2); else this.steer(0, 0, 0, 0.25);
      if (b.activity === 'chat' && this.mate?.alive) face = Math.atan2(this.mate.y - this.y, this.mate.x - this.x);
      if (this.post && b.state === WALKER.STOP) this.atMachine();
      if (face !== null && face !== undefined) this.angle = approachAngle(this.angle, face, dt * 5);
      this.stuckT = 0;
      return;
    }
    let dx = it.x - this.x, dy = it.y - this.y;
    // giving way to the people around (ai/Nav.js): stepping aside, falling in behind one going his way
    const len = Math.hypot(dx, dy) || 1, gw = sense.giveWay?.(this, dx / len, dy / len);
    if (gw) { dx = dx / len + gw.x; dy = dy / len + gw.y; }
    // walked into something (a parked car on the sidewalk, a crowd): sidestep for a moment, one side then the other;
    // a runner still held up finds another way out (a hider another corner), round that spot (Ambient notes it)
    const want = (it.speed / 60) * (gw ? gw.slow : 1);
    if (this.moving < want * 0.3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.8) {
      this.dodge = dice(this.world).rand(0.5, 0.9) * (this.dodgeSide = -this.dodgeSide);
      this.stuckT = 0;
      if (++this.blocks >= 2 && (b.state === WALKER.FLEE || b.state === WALKER.HIDE)) { this.blocks = 0; sense.jam?.(this, dx, dy); b.blocked(); }
    }
    if (this.dodge) {
      const s = Math.sign(this.dodge);
      [dx, dy] = [dx - dy * s * 1.5, dy + dx * s * 1.5];
      this.dodge -= s * dt;
      if (this.dodge * s <= 0) this.dodge = 0;
    }
    const running = b.state === WALKER.FLEE || b.state === WALKER.HIDE;
    this.steer(dx, dy, want, running ? 0.3 : 0.15);
    const ma = Math.atan2(dy, dx);
    // strollers look around a little, or half round at something going on; runners look where they go
    const look = it.look !== undefined ? angDiff(ma, it.look) * 0.5 : b.state === WALKER.WALK ? Math.sin(this.world.time * 0.7 + this.seed) * 0.35 : 0;
    this.angle = approachAngle(this.angle, ma + look, dt * (running ? 10 : 3));
  }

  // A dancer at her pole (her post): the routine moves her (ai/Dance.js), her feet and her layers with it (lead).
  // Shoved off her place in it, she walks back there and comes into it again (DANCE.in).
  danceOn(dt, w) {
    const p = this.post, fresh = !this.dance;
    const D = (this.dance ??= new Dance(p.x, p.y, p.face, this.seed));
    const f = D.at(beatAt(this.world.time, this.seed)), dx = f.x - this.x, dy = f.y - this.y;
    if (fresh && Math.hypot(this.x - p.x, this.y - p.y) < DANCE.join) w = 1; // at it from the start
    else if (w <= 0 && Math.hypot(dx, dy) > DANCE.join) {
      this.steer(dx, dy, 0.6, 0.2);
      this.angle = approachAngle(this.angle, Math.atan2(dy, dx), dt * 5);
      return;
    }
    this.danceW = Math.min(1, w + dt / DANCE.in);
    const k = this.danceW < 1 ? Math.min(1, dt * 12) : 1;
    Body.setPosition(this.body, { x: this.x + dx * k, y: this.y + dy * k });
    this.vel.x = this.vel.y = 0;
    Body.setVelocity(this.body, this.vel);
    this.angle = f.face;
    f.w = this.danceW;
    this.lead = f;
  }

  // a dancer's moves over her stance (Character.draw); a man at the arcade or at his washing leant into it
  ownPose(P) {
    if (this.dance && this.danceW > 0) dancePose(this, P, this.dance, this.danceW * this.danceW * (3 - 2 * this.danceW));
    else if (this.brain.state === WALKER.STOP && this.post) {
      const B = pastimeLean(this.pastime, this.world.time, this.seed);
      if (B) postPose(this, P, null, B);
    }
  }

  // What a posted man at a machine does to it (once a step, at his spot): the arcade he plays (its screen in play,
  // render/PropLife.js; a slap on its side between two games, the coin and the game's bleeps); the washer he empties
  // (its lid open) and the one he piles his folded washing on (`pile`, drawn on its lid); a piece shaken out
  atMachine() {
    const w = this.world, t = w.time, kind = this.brain.activity;
    if (kind !== 'arcade' && kind !== 'laundry') return;
    if (this.machines === undefined) this.machines = findMachines(this, kind);
    const m = this.machines;
    if (kind === 'arcade') {
      if (!m.cab || m.cab.dead) return;
      m.cab.player = this;
      const f = arcadeAt(t, this.seed), was = this.machineWas;
      this.machineWas = f;
      if (!was || m.cab.unpowered || m.cab.lightsOut) return;
      if (f.slap && !was.slap) w.sound('ding', m.cab.x, m.cab.y, 0.45); // the cabinet rings under the slap (systems/Gadgets.js)
      if (f.coin && !was.coin) w.sound('arcadeCoin', m.cab.x, m.cab.y, 0.6);
      if (f.play && Math.floor(t / 2.3 + this.seed) !== Math.floor((t - 1 / 60) / 2.3 + this.seed)) w.sound('arcadePlay', m.cab.x, m.cab.y, 0.5);
      return;
    }
    const f = laundryAt(t, this.seed), was = this.machineWas;
    this.machineWas = f;
    if (m.drum && !m.drum.dead) m.drum.lidOpen = true;
    if (m.pile && !m.pile.dead) m.pile.washing = { n: f.pile, seed: this.seed };
    if (was && f.phase === 'shake' && was.phase !== 'shake') w.sound('cloth', this.x, this.y, 0.5);
  }

  // a runner's feet go from under him: flat out for a moment, sliding, then up and off again
  trip() {
    const v = Body.getVelocity(this.body), a = Math.hypot(v.x, v.y) > 0.3 ? Math.atan2(v.y, v.x) : this.angle;
    this.knocked = dice(this.world).rand(0.8, 1.3);
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
    this.knocked = dice(this.world).rand(1.2, 2);
    this.downAngle = angle; // on his back, his head away from the blow
    this.body.collisionFilter = { category: CAT.CORPSE, mask: MASK.CORPSE & ~CAT.EDGE, group: 0 };
    this.vel = { x: Math.cos(angle) * 3.5, y: Math.sin(angle) * 3.5 };
    Body.setVelocity(this.body, this.vel);
    this.world.particles.blood(this.x, this.y, angle, 0.6, 5, 110);
    this.brain.alarm(this.x - Math.cos(angle) * TILE, this.y - Math.sin(angle) * TILE, 'hit');
  }

  draw(ctx) {
    const b = this.brain, t = this.world.time;
    const k = crouchScale(this.crouch);
    // (curled up or frozen stiff, he shakes: his mood, over feet that stay put)
    if (k < 1) { ctx.save(); ctx.translate(this.x, this.y); ctx.scale(k, k); ctx.translate(-this.x, -this.y); }
    super.draw(ctx);
    if (k < 1) ctx.restore();
    if (!this.alive || this.knocked > 0) return;
    ctx.save();
    bodyFrame(ctx, this); // what he holds is drawn from his pose
    if (b.state === WALKER.STOP) drawPastime(ctx, this, this.pastime, t);
    else if (b.state === WALKER.WALK && this.habit === 'bag') drawPastime(ctx, this, 'bag', t);
    ctx.restore();
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
    // the fright: his arms fly up and out
    const st = this.startle / GESTURE.panic.startle.dur;
    if (st > 0.45) return { hl: { x: 4, y: -9.5 }, hr: { x: 4, y: 9.5 } };
    if (b.state === WALKER.STOP) return pastimeHands(this.pastime, t, this.seed);
    if ((b.state === WALKER.FLEE || b.state === WALKER.HIDE) && this.runStyle === 'cover') {
      const k = Math.sin(this.walk) * 0.6; // arms over his head, bounced by his stride
      return { hl: { x: 2 + k, y: -4.5 }, hr: { x: 2 - k, y: 4.5 } };
    }
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

  // CharacterAnim hook, how fright bends him (GESTURE.panic): the jump at his fright, the shoulders up and the head
  // drawn in, frozen or curled up shaking, a lurching start, a look back over his shoulder as he runs
  mood() {
    const b = this.brain, G = GESTURE.panic, S = G.startle;
    if (!b.panicked && !this.startle) return null;
    const m = MOOD;
    m.hunch = m.duck = m.lift = m.lean = m.look = m.twist = m.shake = 0;
    const k = 1 - this.startle / S.dur;
    if (this.startle > 0) { m.lift = S.hop * bump(k / 0.5); m.hunch = S.hunch * bump(k); m.duck = S.duck * bump(k); }
    if (b.frozen || (b.state === WALKER.PANIC && b.pose === 'hands')) { m.hunch = Math.max(m.hunch, 0.14); m.duck = Math.max(m.duck, 0.16); m.shake = G.tremble.px; }
    else if (b.pose === 'ball') { m.hunch = Math.max(m.hunch, 0.3); m.duck = Math.max(m.duck, 0.5); m.shake = G.tremble.px; }
    else if (b.state === WALKER.COWER || b.pose === 'duck') { m.hunch = Math.max(m.hunch, 0.2); m.duck = Math.max(m.duck, 0.35); }
    if (b.state === WALKER.FLEE || b.state === WALKER.HIDE) {
      if (this.runStyle === 'cover') { m.hunch = Math.max(m.hunch, 0.18); m.duck = Math.max(m.duck, 0.3); }
      else if (this.runStyle === 'stumble' && this.fleeT < G.stumble.dur) {
        // the first strides lurch, the body ahead of the feet, thrown from side to side
        const u = 1 - this.fleeT / G.stumble.dur;
        m.lean = G.stumble.lurch * u * (0.6 + 0.4 * Math.sin(this.fleeT * 14));
        m.twist = 0.3 * u * Math.sin(this.fleeT * 9 + this.seed);
      }
      // a look back over the shoulder, toward where the danger is
      const L = G.look, w = this.backT < 0 ? bump(-this.backT / L.dur) : 0, d = b.danger;
      if (w > 0 && d) {
        const side = angDiff(this.angle, Math.atan2(d.y - this.y, d.x - this.x)) >= 0 ? 1 : -1;
        m.look = side * w; m.twist += side * L.turn * w;
      }
    }
    m.twist = clamp(m.twist, -0.6, 0.6);
    return m;
  }
}
