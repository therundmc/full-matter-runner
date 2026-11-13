import { CAT, MASK, PALETTE, AI } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { sprite, drawSprite, silhouette } from '../../engine/Assets.js';
import { setMaterial } from '../../engine/physics/Body.js';

const WEAPON_KG = { pistol: 1, uzi: 3, uzi_silenced: 3.4, shotgun: 3.6, rifle: 4.2, sniper: 6, bazooka: 7, bat: 1, knife: 0.3 };

const { Bodies, Body } = Matter;

// A weapon lying on the floor or flying through the air after a throw.
export default class WeaponItem {
  constructor(world, type, mag, x, y, angle, vx = 0, vy = 0, spin = 0, thrower = null) {
    this.world = world;
    this.type = type;
    this.def = WEAPONS[type];
    this.mag = mag ?? this.def.mag ?? 0;
    this.img = sprite(this.def.sprite);
    this.body = Bodies.rectangle(x, y, this.img.width, Math.max(4, this.img.height), {
      angle, frictionAir: 0.01, friction: 0.05, restitution: 0.45, label: 'item',
      collisionFilter: { category: CAT.ITEM, mask: MASK.ITEM },
    });
    // thrown weapons fly before they hit the floor and slide
    setMaterial(this.body, WEAPON_KG[type] ?? 2, 0.7, thrower ? world.time + 0.25 : 0);
    this.body.material = type === 'bat' ? 'wood' : 'metal';
    Body.setVelocity(this.body, { x: vx, y: vy });
    Body.setAngularVelocity(this.body, spin);
    this.body.entity = this;
    this.isItem = true;
    this.thrower = thrower;
    this.dead = false;
    this.hilite = 0;
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get speed() { return Body.getSpeed(this.body); }

  update(dt) {
    const sp = this.speed;
    if (!this.thrower) return;
    if (sp < 3) {
      // a thrown gun clattering on the floor is a lure
      if (this.thrower.isPlayer) this.world.noise(this.x, this.y, AI.thrownRadius, null, 'thrown');
      this.thrower = null;
      return;
    }
    const w = this.world;
    for (const c of w.characters()) {
      if (!c.alive || c === this.thrower || c.team === this.thrower.team || c.knocked) continue;
      if (Math.hypot(c.x - this.x, c.y - this.y) < c.radius + 6) {
        const v = Body.getVelocity(this.body);
        const a = Math.atan2(v.y, v.x);
        c.knock(a, 'throw');
        w.sound('punch', c.x, c.y);
        w.particles.blood(c.x, c.y, a, 0.5, 8, 120);
        w.shake(0.15);
        Body.setVelocity(this.body, { x: -v.x * 0.3, y: -v.y * 0.3 });
        this.thrower = null;
        return;
      }
    }
  }

  onCollide(other) {
    const e = other.entity;
    if (!e || !this.thrower) return;
    if (e.def?.explosive && this.speed > 2) e.break(0, 1);
    else if (e.hit && e.def && this.speed > 4 && e.def.hp <= 1) e.hit(1, this.x, this.y, Math.atan2(this.body.velocity.y, this.body.velocity.x));
  }

  draw(ctx, t) {
    const p = this.body.position;
    drawSprite(ctx, silhouette(this.img), p.x + 1.5, p.y + 1.5, this.body.angle, 0.35);
    drawSprite(ctx, this.img, p.x, p.y, this.body.angle);
    if (this.hilite > 0) {
      // pulsing outline to show it can be picked up
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(t * 10) * 0.2;
      ctx.strokeStyle = PALETTE.cyan;
      ctx.lineWidth = 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(this.body.angle);
      ctx.strokeRect(-this.img.width / 2 - 2, -this.img.height / 2 - 2, this.img.width + 4, this.img.height + 4);
      ctx.restore();
    }
  }
}

