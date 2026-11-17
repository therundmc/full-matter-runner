import { CAT, MASK, PALETTE, AI, BODY_SCALE } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { sprite, spriteOpt, drawSprite, drawUpright, silhouette, sw, sh } from '../../engine/Assets.js';
import { setMaterial } from '../../engine/physics/Body.js';
import { blowFrom } from '../fx/Blows.js';

const WEAPON_KG = { pistol: 1, uzi: 3, uzi_silenced: 3.4, shotgun: 3.6, rifle: 4.2, sniper: 6, bazooka: 7, bat: 1, knife: 0.3, cue: 0.6, cue_half: 0.3, tire_iron: 1.3, tire_iron_bent: 1.3 };

const { Bodies, Body } = Matter;

// a thrown blade at least this fast (px/step) plants itself in the man instead of knocking him down
const STICK_SPEED = 6;
const LEAN = 0.5; // how short a weapon stood against a wall looks from above

// A weapon lying on the floor or flying through the air after a throw.
export default class WeaponItem {
  constructor(world, type, mag, x, y, angle, vx = 0, vy = 0, spin = 0, thrower = null) {
    this.world = world;
    this.type = type;
    this.def = WEAPONS[type];
    this.mag = mag ?? this.def.mag ?? 0;
    this.wear = this.def.wear; // melee: blows left in it (whoever drops a worn one sets it)
    this.img = sprite(this.def.sprite);
    // as big on the floor as in a hand (people and what they hold are drawn BODY_SCALE bigger)
    this.w = sw(this.img) * BODY_SCALE; this.h = sh(this.img) * BODY_SCALE;
    this.body = Bodies.rectangle(x, y, this.w, Math.max(4, this.h), {
      angle, frictionAir: 0.01, friction: 0.05, restitution: 0.45, label: 'item',
      collisionFilter: { category: CAT.ITEM, mask: MASK.ITEM },
    });
    // thrown weapons fly before they hit the floor and slide
    setMaterial(this.body, WEAPON_KG[type] ?? 2, 0.7, thrower ? world.time + 0.25 : 0);
    this.body.material = this.def.material || 'metal';
    Body.setVelocity(this.body, { x: vx, y: vy });
    Body.setAngularVelocity(this.body, spin);
    this.body.entity = this;
    this.isItem = true;
    this.thrower = thrower;
    this.dead = false;
    this.hilite = 0;
    world.addBody(this.body);
  }

  // its magazine out (a reload cut short): drawn without it, and whoever takes it has none to drop
  setBare(bare) {
    this.bare = !!bare;
    if (bare) this.img = spriteOpt(this.def.sprite + '_bare') || this.img;
    return this;
  }

  // stood against a wall (a level's `lean`), its tip up on it: it stays there until somebody takes it
  leanOn() {
    this.lean = true;
    Body.setStatic(this.body, true);
    return this;
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
        const stick = this.def.swing === 'blade' && sp >= STICK_SPEED;
        if (stick) {
          // like a blade blow: it stays in the body and is gone from the floor
          const by = { ...this.def, wound: 'slash', gore: 0, stuck: this.def.sprite, stuckItem: { type: this.type, mag: this.mag, wear: this.wear } };
          c.kill(a, 'slash', this.thrower, by, { thrown: true, from: blowFrom(c.angle, a) });
        } else c.knock(a, 'throw');
        w.sound(stick ? this.def.sound : 'punch', c.x, c.y);
        w.particles.blood(c.x, c.y, a, 0.5, 8, 120);
        w.shake(0.15);
        if (stick) { w.removeItem(this); return; }
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
    const p = this.body.position, k = this.lean ? LEAN : 1;
    if (this.lean) {
      drawUpright(ctx, silhouette(this.img), p.x + 2.5, p.y + 2.5, this.body.angle, LEAN, { alpha: 0.35, scale: BODY_SCALE });
      drawUpright(ctx, this.img, p.x, p.y, this.body.angle, LEAN, { scale: BODY_SCALE });
    } else {
      drawSprite(ctx, silhouette(this.img), p.x + 1.5, p.y + 1.5, this.body.angle, 0.35, BODY_SCALE);
      drawSprite(ctx, this.img, p.x, p.y, this.body.angle, 1, BODY_SCALE);
    }
    if (this.hilite > 0) {
      // pulsing outline to show it can be picked up
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(t * 10) * 0.2;
      ctx.strokeStyle = PALETTE.cyan;
      ctx.lineWidth = 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(this.body.angle);
      ctx.strokeRect(-this.w * k / 2 - 2, -this.h / 2 - 2, this.w * k + 4, this.h + 4);
      ctx.restore();
    }
  }
}

