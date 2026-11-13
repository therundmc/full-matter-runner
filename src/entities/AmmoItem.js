import { CAT, MASK } from '../core/Config.js';
import { AMMO } from '../data/weapons.js';
import { spriteOpt, chunk, drawSprite, silhouette } from '../core/Assets.js';
import { setMaterial } from '../core/Physics.js';

const { Bodies, Body } = Matter;

// A magazine (with its own round count) or a box of loose rounds on the floor.
// Pulled toward the player when close, collected on contact. delay: seconds before it can be picked up.
export default class AmmoItem {
  constructor(world, type, rounds, x, y, vx = 0, vy = 0, delay = 0) {
    this.world = world;
    this.type = type;
    this.cal = AMMO[type];
    this.rounds = rounds ?? this.cal.rounds;
    this.delay = delay;
    this.img = spriteOpt(this.cal.sprite) || chunk(this.cal.color, 5, 8);
    this.body = Bodies.rectangle(x, y, this.img.width, this.img.height, {
      angle: Math.random() * 6.28, frictionAir: 0.02, restitution: 0.3, label: 'ammo',
      collisionFilter: { category: CAT.ITEM, mask: MASK.ITEM },
    });
    setMaterial(this.body, 1.2, 0.5, world.time + 0.15);
    Body.setVelocity(this.body, { x: vx, y: vy });
    Body.setAngularVelocity(this.body, (Math.random() - 0.5) * 0.4);
    this.body.entity = this;
    this.dead = false;
    this.t = Math.random() * 6;
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  update(dt) {
    this.t += dt;
    this.delay -= dt;
    const p = this.world.player;
    if (!p || !p.alive || this.delay > 0) return;
    const full = this.cal.mag ? p.mags[this.type].length >= this.cal.max : p.loose[this.type] >= this.cal.max;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    if (full) return;
    if (d < 48) {
      // magnet
      const a = Math.atan2(dy, dx), v = 1.5 + (48 - d) * 0.12;
      Body.setVelocity(this.body, { x: Math.cos(a) * v, y: Math.sin(a) * v });
    }
    if (d < 15) {
      p.addAmmo(this.type, this.rounds);
      this.dead = true;
      this.world.removeBody(this.body);
      this.world.sound('ammo', this.x, this.y);
      this.world.pickupFlash(this.x, this.y, this.cal.color);
      const label = this.cal.mag ? `+${this.cal.name} (${this.rounds})` : `+${this.rounds} ${this.cal.name}`;
      this.world.texts.push({ x: this.x, y: this.y - 8, str: label, t: 0.9, dur: 0.9, color: this.cal.color });
    }
  }

  draw(ctx) {
    const p = this.body.position;
    drawSprite(ctx, silhouette(this.img), p.x + 1, p.y + 1, this.body.angle, 0.35);
    drawSprite(ctx, this.img, p.x, p.y, this.body.angle);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 + Math.sin(this.t * 6) * 0.15;
    ctx.strokeStyle = this.cal.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8 + Math.sin(this.t * 6) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
