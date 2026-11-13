// A passer-by (ambient life): unarmed, light varied clothes, walks a path, panics and runs off the map.
// Moved by a Walker brain (ai/Civilians.js) that systems/Ambient.js ticks. Same body, death and gore as anyone;
// team 'civilian' so both sides' bullets hit him, but he is never a level target and guards ignore him.
import { CAT, MASK, PALETTE, TILE } from '../Config.js';
import { rand, local, angDiff, approachAngle } from '../../engine/math.js';
import { WALKER } from '../ai/Civilians.js';
import Character from './Character.js';

const { Body } = Matter;

// arm (sleeve) and hand colours of each civilian sprite (tools/generate_assets.py, CIVILIANS)
export const CIVILIAN_LOOKS = {
  civ1: { arm: '#d9a441', skin: '#eab08a' },
  civ2: { arm: '#f0a08a', skin: '#d99a76' },
  civ3: { arm: '#bfae86', skin: '#e2b08e' },
  civ4: { arm: '#8fbf6a', skin: '#c88a60' },
};
export const CIVILIAN_KINDS = Object.keys(CIVILIAN_LOOKS);
// passers-by walk out of the map: the edge barriers are not for them
const MASK_CIV = MASK.CHAR & ~CAT.EDGE;

export default class Civilian extends Character {
  constructor(world, x, y, angle, kind, brain) {
    super(world, x, y, angle, kind, 'civilian');
    this.look = CIVILIAN_LOOKS[kind];
    this.isCivilian = true;
    this.brain = brain;
    this.mate = null;      // the other half of a couple
    this.crouch = 0;
    this.seed = rand(0, 100);
    this.stuckT = 0;
    this.dodge = 0;
    this.body.collisionFilter = { category: CAT.CHAR, mask: MASK_CIV, group: 0 };
  }

  // called by Ambient (step 1, before physics)
  update(dt, sense) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    if (this.knocked > 0) {
      this.knocked -= dt;
      this.steer(0, 0, 0, 0.08);
      if (this.knocked <= 0) {
        this.knocked = 0;
        this.body.collisionFilter = { category: CAT.CHAR, mask: MASK_CIV, group: 0 };
        this.angle = this.downAngle + Math.PI;
      }
      return;
    }
    const b = this.brain;
    const it = b.update(dt, this.x, this.y, sense);
    const ducking = b.state === WALKER.PANIC && b.pose === 'duck' || b.state === WALKER.COWER;
    this.crouch += ((ducking ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    if (it.x === null) {
      this.steer(0, 0, 0, 0.25);
      let face = it.face;
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
    this.steer(dx, dy, want, b.state === WALKER.FLEE ? 0.3 : 0.15);
    const ma = Math.atan2(dy, dx);
    // strollers look around a little; runners look where they go
    const look = b.state === WALKER.WALK ? Math.sin(this.world.time * 0.7 + this.seed) * 0.35 : 0;
    this.angle = approachAngle(this.angle, ma + look, dt * (b.state === WALKER.FLEE ? 10 : 3));
  }

  // thrown gun, shove, punch: down for a moment, then he runs
  knock(angle) {
    if (!this.alive || this.knocked > 0) return;
    this.knocked = rand(1.2, 2);
    this.downAngle = angle + Math.PI;
    this.body.collisionFilter = { category: CAT.CORPSE, mask: MASK.CORPSE & ~CAT.EDGE, group: 0 };
    this.vel = { x: Math.cos(angle) * 3.5, y: Math.sin(angle) * 3.5 };
    Body.setVelocity(this.body, this.vel);
    this.world.particles.blood(this.x, this.y, angle, 0.6, 5, 110);
    this.brain.alarm(this.x - Math.cos(angle) * TILE, this.y - Math.sin(angle) * TILE, 'hit');
  }

  draw(ctx) {
    const k = 1 - this.crouch * 0.14;
    if (k < 1) { ctx.save(); ctx.translate(this.x, this.y); ctx.scale(k, k); ctx.translate(-this.x, -this.y); }
    super.draw(ctx);
    if (k < 1) ctx.restore();
    if (!this.alive || this.knocked > 0) return;
    const b = this.brain, t = this.world.time;
    if (b.state !== WALKER.STOP) return;
    if (b.activity === 'smoke') {
      // cigarette ember at the lips, glowing on each drag, a curl of smoke
      const h = local(this.x, this.y, this.angle, 7, 2);
      const drag = Math.sin(t * 1.3 + this.seed) > 0.75;
      ctx.fillStyle = drag ? '#ffd27a' : PALETTE.orange;
      ctx.fillRect(h.x - 1, h.y - 1, 2, 2);
      const ph = (t * 0.6 + this.seed) % 1;
      ctx.fillStyle = `rgba(200,200,210,${0.3 * (1 - ph)})`;
      ctx.fillRect(h.x + Math.sin(ph * 6) * 2 - 1, h.y - ph * 12 - 1, 2 + ph * 3, 2 + ph * 3);
    } else if (b.activity === 'phone') {
      const h = local(this.x, this.y, this.angle, 6, 3);
      ctx.fillStyle = 'rgba(5,217,232,0.35)';
      ctx.fillRect(h.x - 3, h.y - 3, 6, 6);
      ctx.fillStyle = '#bff6ff';
      ctx.fillRect(h.x - 1.5, h.y - 1, 3, 2);
    }
  }

  // empty hands: an easy arm swing while walking, a cigarette / phone held up, hands up or over the head in panic
  drawArms(ctx) {
    const b = this.brain;
    let hl, hr;
    if (b.state === WALKER.PANIC && b.pose === 'hands') {
      const sh = Math.sin(this.world.time * 30) * 0.6; // trembling
      hl = { x: 3 + sh, y: -9 }; hr = { x: 3 - sh, y: 9 };
    } else if (b.state === WALKER.COWER || (b.state === WALKER.PANIC && b.pose === 'duck')) {
      hl = { x: 1, y: -4 }; hr = { x: 1, y: 4 }; // arms over the head
    } else if (b.state === WALKER.STOP && (b.activity === 'smoke' || b.activity === 'phone')) {
      hl = { x: 5, y: -5 };
      hr = b.activity === 'smoke' ? { x: 6, y: 2 } : { x: 5, y: 3 };
    } else {
      const run = b.state === WALKER.FLEE;
      const s = this.moving > 0.25 ? Math.sin(this.walk) * (run ? 6 : 3.5) : 0;
      hl = { x: 1.5 + s, y: run ? -7 : -7.5 };
      hr = { x: 1.5 - s, y: run ? 7 : 7.5 };
    }
    // the arms swing relative to the body even while the head looks around
    const turn = this.moving > 0.25 && b.state !== WALKER.STOP ? angDiff(this.angle, this.moveAngle) : 0;
    if (Math.abs(turn) > 0.05) {
      const c = Math.cos(turn), sn = Math.sin(turn);
      [hl, hr] = [hl, hr].map((h) => ({ x: h.x * c - h.y * sn, y: h.x * sn + h.y * c }));
    }
    ctx.lineCap = 'round';
    for (const [h, sy] of [[hl, -6], [hr, 6]]) {
      ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(h.x, h.y); ctx.stroke();
      ctx.strokeStyle = this.look.arm; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(h.x, h.y); ctx.stroke();
    }
    for (const h of [hl, hr]) {
      ctx.fillStyle = PALETTE.ink; ctx.fillRect(h.x - 2.2, h.y - 2.2, 4.4, 4.4);
      ctx.fillStyle = this.look.skin; ctx.fillRect(h.x - 1.4, h.y - 1.4, 2.8, 2.8);
    }
  }
}
