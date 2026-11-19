import { CAT, MASK, AI, BODY_SCALE } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { sprite, spriteOpt, drawSprite, drawUpright, silhouette, dulled, sw, sh } from '../../engine/Assets.js';
import { setMaterial } from '../../engine/physics/Body.js';
import { blowFrom, blowFx } from '../fx/Blows.js';
import { THROW, BREAK } from '../data/feel.js';
import { landBlow } from '../fx/Impact.js';
import { flyPiece, dropPiece } from '../fx/Breakage.js';
import Debris from './Debris.js';

const WEAPON_KG = { pistol: 1, uzi: 3, uzi_silenced: 3.4, shotgun: 3.6, rifle: 4.2, sniper: 6, bazooka: 7, bat: 1, knife: 0.3, cue: 0.6, cue_half: 0.3, tire_iron: 1.3, tire_iron_bent: 1.3 };

const { Bodies, Body } = Matter;

// a thrown blade at least this fast (px/step) plants itself in the man instead of knocking him down
const STICK_SPEED = 6;
const LEAN = 0.5; // how short a weapon stood against a wall looks from above
const BUTT = { swing: 'club', material: 'metal', heft: 2 }; // a gun thrown full into a man: what the blow is (fx/Blows.js)

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
    this.charge = 0;       // how far the player's throw was wound up, 0..1 (Player.throwWeapon): a full one plants a blade
    this.trail = [];       // where it was the last steps of its flight, newest first (draw: its ghosts)
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

  // a dead man's, the player's hand about to close on it (Player.snatchFrom): still and out of the physics' way (a
  // falling body or a blow does not knock it off), until it is taken or let go (free)
  reserve() {
    Body.setStatic(this.body, true);
    this.body.isSensor = true;
    this.reserved = true;
    return this;
  }

  free() {
    if (!this.reserved) return;
    this.reserved = false;
    this.body.isSensor = false;
    Body.setStatic(this.body, false);
    setMaterial(this.body, WEAPON_KG[this.type] ?? 2, 0.7, 0);
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
    if (!this.thrower) { this.trail.length = 0; return; }
    const T = THROW.trail;
    this.trail.unshift({ x: this.x, y: this.y, a: this.body.angle });
    if (this.trail.length > T.gap * T.alpha.length + 1) this.trail.pop();
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
        const blade = this.def.swing === 'blade', full = this.charge >= 1;
        const stick = blade && (sp >= STICK_SPEED || full), smash = !blade && full;
        if (smash) this.smash(c, a);
        else if (stick) {
          // like a blade blow: it stays in the body (along the way it flew, its handle shuddering) and is gone from
          // the floor
          const by = { ...this.def, wound: 'slash', gore: 0, stuck: this.def.sprite, stuckItem: { type: this.type, mag: this.mag, wear: this.wear },
            stuckA: a, stuckJolt: true };
          c.kill(a, 'slash', this.thrower, by, { thrown: true, from: blowFrom(c.angle, a) });
        } else c.knock(a, 'throw');
        if (!smash) w.sound(stick ? this.def.sound : 'punch', c.x, c.y); // (a smash: its own, fx/Blows.js)
        w.particles.blood(c.x, c.y, a, 0.5, 8, 120);
        if (stick) {
          w.particles.blood(c.x, c.y, a, 0.8, ...THROW.planted.spurt);
          w.sound('bladeThunk', c.x, c.y); // placeholder (assets/sound/PLACEHOLDERS.md)
        }
        w.shake(0.15);
        // the beat of it (systems/ThrowBeat.js, systems/Rumble.js), if it put him down
        if (!c.alive || c.knocked > 0) {
          w.events.emit('thrownHit', { thrower: this.thrower, victim: c, x: c.x, y: c.y, angle: a, kill: !c.alive, planted: stick, smashed: smash, charge: this.charge });
        }
        if (smash) this.shatter(c, a);
        if (stick || smash) { w.removeItem(this); return; }
        Body.setVelocity(this.body, { x: -v.x * 0.3, y: -v.y * 0.3 });
        this.thrower = null;
        return;
      }
    }
  }

  // A full throw of anything that is no blade (THROW.smash) kills the man it reaches: a club crushes, as its heavy
  // stroke does; a gun is a blunt blow. The flash, the star and the screen's share of a heavy blow (fx/Impact.js).
  smash(c, a) {
    const d = this.def, w = this.world, S = THROW.smash, gun = d.kind === 'gun', hit = gun ? BUTT : d;
    const by = gun ? { ...d, wound: 'blunt', gore: S.gunGore } : { ...d, wound: 'crush', gore: (d.gore || 0.3) * S.gore };
    const how = { thrown: true, heavy: true, broke: true, from: blowFrom(c.angle, a) };
    blowFx(w, hit, c, a, how);
    c.kill(a, 'melee', this.thrower, by, how);
    landBlow(w, c, c.x - Math.cos(a) * c.radius * 0.5, c.y - Math.sin(a) * c.radius * 0.5, a, hit, { lethal: !c.alive, byPlayer: !!this.thrower.isPlayer, heavy: true });
  }

  // ... and gives out on man c, flying along a, as it would in a hand (data/weapons.js `breaks`): a bat or a cue
  // snaps (the far end flies on past him, the near one falls back off him: a cue's butt half as a weapon to pick up),
  // an iron bends (the bent one falls, to pick up); a gun, or an iron bent past use, is wrecked (chips, sparks, a
  // crunch; it lies there dull, as debris nobody picks up)
  shatter(c, a) {
    const d = this.def, w = this.world, S = THROW.smash, side = Math.random() < 0.5 ? -1 : 1, [far, near] = d.parts ?? [];
    const ca = Math.cos(a), sa = Math.sin(a), r = c.radius + S.clear;
    const at = { x: c.x - ca * r, y: c.y - sa * r }, past = { x: c.x + ca * r, y: c.y + sa * r }; // his near side, his far one
    const back = { x: -ca * S.back, y: -sa * S.back }; // px/s what falls of it comes back off him at
    if (d.breaks === 'snap') {
      flyPiece(w, spriteOpt(far ?? (d.snaps ? WEAPONS[d.snaps].sprite : d.sprite)) || this.img, past, a, side, d.material, S.fly);
      w.particles.chips(at.x, at.y, a, 1.6, S.chips[0], BREAK.wood, S.chips[1]);
      w.sound('batSnap', at.x, at.y, 1, { material: d.material });
      if (d.snaps) this.leave(d.snaps, at, a + Math.PI, back);
      else if (near) dropPiece(w, spriteOpt(near) || this.img, at.x, at.y, a + Math.PI, back.x, back.y, d.material, 0.4);
    } else if (d.breaks === 'bend') {
      w.particles.sparks(at.x, at.y, a + Math.PI, 1.2, ...S.sparks);
      w.sound('metal', at.x, at.y, 1, { pitch: 0.7 });
      this.leave(d.bends, at, a, back);
    } else {
      w.particles.sparks(at.x, at.y, a + Math.PI, 1.4, ...S.sparks);
      w.particles.chips(at.x, at.y, a, 1.4, S.chips[0] / 2, '#5a5662', S.chips[1]);
      w.sound('gunWreck', at.x, at.y); // placeholder (assets/sound/PLACEHOLDERS.md)
      w.addDebris(new Debris(w, dulled(this.img, S.dull), at.x, at.y, this.body.angle, back.x * 2, back.y * 2, 0.3 * side,
        { material: 'metal', kg: WEAPON_KG[this.type] ?? 2, bounce: 0.25, z: BREAK.fall.z, vz: 60, scale: BODY_SCALE, land: 'metal' }));
    }
  }

  // what is left of it, a weapon of its own (a cue's butt half, a bent iron), falls at `at` to be picked up
  leave(type, at, a, v) {
    this.world.addItem(new WeaponItem(this.world, type, 0, at.x, at.y, a, v.x / 60, v.y / 60, 0.2));
  }

  onCollide(other) {
    const e = other.entity;
    if (!e || !this.thrower) return;
    if (e.def?.explosive && this.speed > 2) e.break(0, 1);
    else if (e.hit && e.def && this.speed > 4 && e.def.hp <= 1) e.hit(1, this.x, this.y, Math.atan2(this.body.velocity.y, this.body.velocity.x));
  }

  // in flight: ghosts of its own sprite where it was a few steps ago (THROW.trail), and behind a full throw a faint
  // white streak of whole pixels
  drawFlight(ctx) {
    const T = THROW.trail;
    T.alpha.forEach((al, i) => {
      const g = this.trail[(i + 1) * T.gap];
      if (g) drawSprite(ctx, this.img, g.x, g.y, g.a, al, BODY_SCALE);
    });
    if (this.charge < 1) return;
    const v = Body.getVelocity(this.body), s = Math.hypot(v.x, v.y) || 1, S = T.streak;
    ctx.fillStyle = '#ffffff';
    for (let d = 4; d < S.len; d++) {
      ctx.globalAlpha = S.alpha * (1 - d / S.len);
      ctx.fillRect(Math.round(this.x - (v.x / s) * d), Math.round(this.y - (v.y / s) * d), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // how long it looks from above along its length (stood against a wall: shorter)
  get stretch() { return this.lean ? LEAN : 1; }

  // its catch-light and the in-reach outline are drawn over the lit scene (render/Readability.js)
  draw(ctx) {
    const p = this.body.position;
    if (this.thrower && this.speed >= 3) this.drawFlight(ctx);
    if (this.lean) {
      drawUpright(ctx, silhouette(this.img), p.x + 2.5, p.y + 2.5, this.body.angle, LEAN, { alpha: 0.35, scale: BODY_SCALE });
      drawUpright(ctx, this.img, p.x, p.y, this.body.angle, LEAN, { scale: BODY_SCALE });
    } else {
      drawSprite(ctx, silhouette(this.img), p.x + 1.5, p.y + 1.5, this.body.angle, 0.35, BODY_SCALE);
      drawSprite(ctx, this.img, p.x, p.y, this.body.angle, 1, BODY_SCALE);
    }
  }
}

