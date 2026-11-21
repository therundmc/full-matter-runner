import { CAT, MASK } from '../Config.js';
import { PROPS } from '../data/props.js';
import { recipeFor } from '../data/destruction.js';
import { sprite, spriteOpt, drawSprite, sw, sh } from '../../engine/Assets.js';
import { clamp } from '../../engine/math.js';
import { canvas, put } from '../render/DamageArt.js';
import { setMaterial, setShapeInertia } from '../../engine/physics/Body.js';
import { MATERIALS } from '../data/materials.js';
import { mountOf, mountName, SWING } from '../data/mounts.js';
import Board from './Board.js';
import * as Hits from './prop/Hits.js';
import * as Contents from './prop/Contents.js';
import * as Wreck from './prop/Wreck.js';
import * as Look from './prop/Look.js';

const { Bodies } = Matter;

const d0 = (d) => d.w * d.h; // area of a prop's whole box (none for a round one)

// Furniture and street dressing, destroyed piece by piece (data/destruction.js says how each one comes apart):
//  - every hit leaves a mark where it landed, in the prop's own canvas (holes, furrows, dents, slashes, scorch),
//    tears material out and throws it back out of the entry / forward out of the exit (systems/Fracture.js);
//  - hits wear down the zone they land in: a zone at 0 is torn off (a corner, a hole); a line of torn zones saws
//    the object in two, the far part falls and what is left stays standing (its body shrinks);
//  - states by hit points: cracked -> split -> giving way; at 0 it cracks, sags and falls apart into its own parts.
// Hit kinds: pellet | bullet | rifle | graze | blunt | cut | punch | blast | shrapnel.
// The class holds its body, its canvas, its kick and its drawing; the rest is in entities/prop/, functions of the
// prop (`me`) the class delegates to: Hits (marks, tears, splashes, zones), Contents (screens, bottles, spills,
// doors, wires), Wreck (damage states, collapse, its parts), Look (shadow, doors, parts, what hangs overhead).
export default class Prop {
  constructor(world, type, x, y, angle = 0) {
    this.world = world;
    this.type = type;
    this.def = PROPS[type];
    if (!this.def) throw new Error('unknown prop ' + type);
    this.img = spriteOpt(this.def.sprite || 'props/' + type) || sprite(type.startsWith('neon') ? 'props/tv' : 'props/trash_can');
    this.rec = recipeFor(type, this.def);
    this.hp = this.def.hp;
    const d = this.def;
    this.opts = {
      isStatic: !!d.static, angle, label: 'prop',
      frictionAir: 0, friction: 0.4, restitution: 0.1, // the floor brakes it (Friction.groundFriction), not the air
      // hanging from the ceiling: nothing on the floor bumps into it
      collisionFilter: { category: CAT.PROP, mask: d.hung ? 0 : MASK.PROP },
    };
    this.makeBody(x, y, d.w, d.h, d.kg);
    this.dead = false;
    this.dying = false;
    this.flash = 0;
    this.canvas = null; // per-instance copy of the sprite, created on the first mark
    this.shadow = null; // silhouette of the damaged canvas (rebuilt after damage)
    this.zones = null;  // ZoneGrid, created on the first hit
    this.off = { x: 0, y: 0 }; // sprite centre relative to the body centre (local), once a part fell off
    this.stage = 0;     // damage states reached
    this.sag = 0;       // tilt once it is giving way
    this.squash = 1;
    this.kick = { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 }; // hit recoil wobble (spring)
    this.lastHit = null; // sprite point of the last hit (fractures start there)
    this.screenHp = 2;
    this.leaks = 0;
    this.spilled = 0;
    this.rack = null;   // the bottles standing in plain sight (rec.rack), see bottles()
    this.doors = null;  // a cabinet's doors once they sprang open (rec.doors): [{ a, v, rest }], see openDoors()
    // a billboard's face takes the rounds and the blasts itself (entities/Board.js); its frame, nothing
    this.board = mountName(d) === 'billboard' ? new Board(this) : null;
    world.addBody(this.body);
  }

  // kg: its mass (what is left of it once sawn: its share of the whole by area)
  makeBody(x, y, w, h, kg = this.def.kg * (d0(this.def) ? (w * h) / d0(this.def) : 1)) {
    const d = this.def;
    this.body = d.r ? Bodies.circle(x, y, d.r, this.opts) : Bodies.rectangle(x, y, w, h, this.opts);
    this.body.entity = this;
    this.body.material = d.material;
    if (!d.static) {
      this.loosen(kg, d.mu);
      this.world.physics.freezeIfHeavy(this.body);
    }
  }

  // a loose body: its mass, its friction on the floor (by what it stands on: `feet`, or its material) and the moment
  // of inertia of its shape
  loosen(kg, mu) {
    const b = this.body, feet = this.def.feet ?? this.def.material;
    setMaterial(b, kg, mu);
    b.feet = feet;
    b.stick = MATERIALS[feet]?.stick;
    setShapeInertia(b);
  }

  get look() { return this.canvas || this.img; }
  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  // the sprite's size in world px: sprite space (marks, zones, pieces) is in world px whatever its density
  get W() { return sw(this.img); }
  get H() { return sh(this.img); }

  // world position of the sprite centre
  centre() {
    const a = this.body.angle, c = Math.cos(a), s = Math.sin(a), p = this.body.position;
    return { x: p.x + this.off.x * c - this.off.y * s, y: p.y + this.off.x * s + this.off.y * c };
  }

  // world point -> sprite pixel
  toSprite(px, py) {
    const o = this.centre(), a = -this.body.angle, dx = px - o.x, dy = py - o.y;
    return { sx: dx * Math.cos(a) - dy * Math.sin(a) + this.W / 2, sy: dx * Math.sin(a) + dy * Math.cos(a) + this.H / 2 };
  }

  // sprite pixel -> world point
  toWorld(sx, sy) {
    const o = this.centre(), a = this.body.angle, lx = sx - this.W / 2, ly = sy - this.H / 2;
    return { x: o.x + lx * Math.cos(a) - ly * Math.sin(a), y: o.y + lx * Math.sin(a) + ly * Math.cos(a) };
  }

  ensureCanvas() {
    if (!this.canvas) {
      this.canvas = canvas(this.W, this.H, this.img.k);
      put(this.canvas.getContext('2d'), this.img);
    }
    this.shadow = null;
    return this.canvas.getContext('2d');
  }

  update(dt) {
    const k = this.kick;
    if (k.x || k.y || k.vx || k.vy || k.r || k.vr) {
      // a damped spring back to rest: stiff, or a pendulum for what hangs from a ceiling (data/mounts.js SWING)
      const { ks, cs, kr, cr } = SWING[mountOf(this.def).swing] || SWING.shudder;
      k.vx += (-ks * k.x - cs * k.vx) * dt; k.vy += (-ks * k.y - cs * k.vy) * dt; k.vr += (-kr * k.r - cr * k.vr) * dt;
      k.x += k.vx * dt; k.y += k.vy * dt; k.r += k.vr * dt;
      if (Math.abs(k.x) + Math.abs(k.y) + Math.abs(k.vx) + Math.abs(k.vy) + Math.abs(k.r) * 50 + Math.abs(k.vr) < 0.02) {
        k.x = k.y = k.vx = k.vy = k.r = k.vr = 0;
      }
    }
    if (this.flash > 0) this.flash -= dt;
    // hanging doors: a loose pendulum about the angle they hang at
    if (this.doors) for (const d of this.doors) { d.v += (-(d.a - d.rest) * 30 - d.v * 2.2) * dt; d.a += d.v * dt; }
    if (this.parts) this.shed(dt);
  }

  draw(ctx) {
    if (this.parts) { this.drawParts(ctx); return; }
    const o = this.centre(), k = this.kick;
    const x = o.x + k.x, y = o.y + k.y, a = this.body.angle + this.sag + k.r;
    if (this.def.overhead) {
      // drawn later, above characters; what stands on the ground casts a shadow at its foot
      if (!this.def.hung) drawSprite(ctx, this.shadowImg(), o.x + 5, o.y + 7, a, 0.28);
      else if (this.def.spin) drawSprite(ctx, this.shadowImg(), x + 4, y + 9, a + this.spun(), 0.2); // blades over the floor
      return;
    }
    if (this.rec.rack?.scatter && !this.rack) this.bottles(); // the glasses on a counter are set out when first seen
    drawSprite(ctx, this.shadowImg(), x + 3, y + 3, a, this.canvas ? 0.3 : 0.35);
    drawSprite(ctx, this.look, x, y, a, 1, this.squash);
    if (this.doors) this.drawDoors(ctx, x, y, a);
    if (this.flash > 0) {
      // hit flash: the object brightens for a frame or two
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, this.look, x, y, a, clamp(this.flash / 0.06, 0, 1) * 0.35, this.squash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------------- hits, zones: corners off, sawn in two (prop/Hits.js) ----------------
  hit(damage, px, py, dirA, power, kind, info) { return Hits.hit(this, damage, px, py, dirA, power, kind, info); }
  bloody(px, py, r) { return Hits.bloody(this, px, py, r); }
  surface(px, py, dirA) { return Hits.surface(this, px, py, dirA); }
  physicalOk() { return Hits.physicalOk(this); }
  throwPiece(...a) { return Hits.throwPiece(this, ...a); }
  tear(sx, sy, r, side, dirA, energy, info) { return Hits.tear(this, sx, sy, r, side, dirA, energy, info); }
  lift() { return Hits.lift(this); }
  splash(side, px, py, dirA, energy, info, kind) { return Hits.splash(this, side, px, py, dirA, energy, info, kind); }
  exitWound(px, py, dirA, energy) { return Hits.exitWound(this, px, py, dirA, energy); }
  recoil(dirA, power) { return Hits.recoil(this, dirA, power); }
  spun() { return Hits.spun(this); }

  // ---------------- screens, contents, liquids, doors, wires (prop/Contents.js) ----------------
  hitScreen(sx, sy, dmg) { return Contents.hitScreen(this, sx, sy, dmg); }
  lean(dirA, power) { return Contents.lean(this, dirA, power); }
  spillOnHit(px, py, dirA) { return Contents.spillOnHit(this, px, py, dirA); }
  bottles() { return Contents.bottles(this); }
  burstRack(sx, sy, ex, ey, dirA, kind) { return Contents.burstRack(this, sx, sy, ex, ey, dirA, kind); }
  empty(x, y, dirA, power, z0) { return Contents.empty(this, x, y, dirA, power, z0); }
  flip(dirA) { return Contents.flip(this, dirA); }
  throwBits(bit, c, n, x, y, dirA, power) { return Contents.throwBits(this, bit, c, n, x, y, dirA, power); }
  leak(sx, sy, dirA) { return Contents.leak(this, sx, sy, dirA); }
  flood(x, y, area) { return Contents.flood(this, x, y, area); }
  gush(x, y, area) { return Contents.gush(this, x, y, area); }
  openDoors() { return Contents.openDoors(this); }
  swingDoors(power) { return Contents.swingDoors(this, power); }
  dropDoors(x, y, dirA) { return Contents.dropDoors(this, x, y, dirA); }
  liveWires(x, y, dur) { return Contents.liveWires(this, x, y, dur); }

  // ---------------- damage states, collapse (prop/Wreck.js) ----------------
  enterStage(stage, px, py, dirA) { return Wreck.enterStage(this, stage, px, py, dirA); }
  gasHit(damage, kind, sx, sy, dirA) { return Wreck.gasHit(this, damage, kind, sx, sy, dirA); }
  break(dirA, power, force) { return Wreck.breakUp(this, dirA, power, force); }
  collapse(dirA, power) { return Wreck.collapse(this, dirA, power); }
  shed(dt) { return Wreck.shed(this, dt); }
  release(pc) { return Wreck.release(this, pc); }
  burst(x, y, dirA) { return Wreck.burst(this, x, y, dirA); }
  thump(p) { return Wreck.thump(this, p); }

  // ---------------- drawing (prop/Look.js) ----------------
  shadowImg() { return Look.shadowImg(this); }
  drawDoors(ctx, x, y, a) { return Look.drawDoors(this, ctx, x, y, a); }
  drawParts(ctx) { return Look.drawParts(this, ctx); }
  drawOverhead(ctx, player, cam) { return Look.drawOverhead(this, ctx, player, cam); }
}
