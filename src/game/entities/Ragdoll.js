import { CAT, MASK, PALETTE } from '../Config.js';
import { sprite, spriteOpt, drawSprite, silhouette } from '../../engine/Assets.js';
import { rand, chance, local } from '../../engine/math.js';
import { setMaterial, impulse } from '../../engine/physics/Body.js';
import { woundFor } from '../data/wounds.js';

const { Bodies, Body, Constraint, Composite } = Matter;

// rag_* sprites are intact limbs; the gib sprites stand in when they are missing
export function hasRagdoll(kind) { return !!(spriteOpt(`characters/${kind}_rag_torso`) || spriteOpt(`characters/${kind}_gib_torso`)); }

// Physical dead body: torso + head + 2 arms + 2 legs held by pin joints.
// Limbs can be torn off (constraint removed). Baked into the floor once everything settles.
export default class Ragdoll {
  constructor(world, kind, x, y, dir, speed, opts = {}) {
    this.world = world;
    this.kind = kind;
    this.parts = [];
    this.joints = [];
    this.headless = !!opts.headless;
    this.fountain = this.headless ? rand(1.4, 2.4) : 0;
    this.pool = 0;
    this.poolMax = opts.pool ?? rand(11, 17);
    this.poolRate = (opts.poolRate ?? 4) * (this.headless ? 1.75 : 1); // px/s
    this.spurt = this.spurt0 = opts.spurt || 0; // seconds an opened artery keeps pumping
    this.spurtA = rand(0, Math.PI * 2);
    this.settle = 0;
    this.age = 0;
    this.dead = false;
    const group = Body.nextGroup(true);
    const img = (p) => spriteOpt(`characters/${kind}_rag_${p}`) || sprite(`characters/${kind}_gib_${p}`);
    const th = dir + Math.PI / 2; // head (torso -y) ends up along the travel direction
    const opt = () => ({
      frictionAir: 0.01, friction: 0.3, restitution: 0.1, label: 'ragdoll',
      collisionFilter: { group, category: CAT.CORPSE, mask: MASK.CORPSE },
    });

    const tImg = img('torso');
    const tw = tImg.width, tht = tImg.height;
    this.torso = this.addPart('torso', tImg, Bodies.rectangle(x, y, tw - 2, tht - 2, { ...opt(), angle: th }), 0, 36);
    this.body = this.torso.body;

    const at = (lx, ly) => local(x, y, th, lx, ly);
    if (!this.headless) {
      const hImg = img('head');
      const neck = { x: 0, y: -tht / 2 };
      const hp = at(0, neck.y - 4);
      const head = this.addPart('head', hImg, Bodies.circle(hp.x, hp.y, 4, { ...opt(), angle: th }), 0, 5);
      this.join(head, neck, { x: 0, y: 4 });
      this.head = head;
    }
    const limb = (name, jx, jy, ang) => {
      const im = img(name);
      const half = im.width / 2;
      // limb image points +x (hand/shoe); its root is the -x end
      const c = at(jx + Math.cos(ang) * half, jy + Math.sin(ang) * half);
      const part = this.addPart(name, im, Bodies.rectangle(c.x, c.y, im.width - 1, Math.max(3, im.height - 1), { ...opt(), angle: th + ang }), ang, name === 'leg' ? 11 : 4);
      part.root = { x: -half + 1, y: 0 };
      this.join(part, { x: jx, y: jy }, part.root);
      return part;
    };
    this.limbs = [
      limb('arm', -tw / 2 + 1, -tht / 2 + 3, Math.PI + rand(-0.6, 0.3)),
      limb('arm', tw / 2 - 1, -tht / 2 + 3, rand(-0.3, 0.6)),
      limb('leg', -3, tht / 2 - 1, Math.PI / 2 + rand(0, 0.5)),
      limb('leg', 3, tht / 2 - 1, Math.PI / 2 - rand(0, 0.5)),
    ];

    for (const p of this.parts) {
      Body.setVelocity(p.body, { x: Math.cos(dir) * speed / 60 + rand(-0.6, 0.6), y: Math.sin(dir) * speed / 60 + rand(-0.6, 0.6) });
      Body.setAngularVelocity(p.body, rand(-0.15, 0.15));
      world.addBody(p.body);
    }
    if (this.head) Body.setVelocity(this.head.body, { x: Math.cos(dir) * speed / 50, y: Math.sin(dir) * speed / 50 });
    for (const j of this.joints) world.addBody(j.c);
    for (const i of opts.detach || []) this.detach(this.limbs[i], dir, speed * 1.4);
  }

  addPart(name, img, body, rest, kg) {
    // a falling body slides a bit then the cloth and skin grip the floor
    setMaterial(body, kg, 1.1, this.world.time + 0.18);
    body.material = 'flesh';
    const part = { name, img, body, rest, attached: true, bleed: 0 };
    body.entity = this;
    body.ragPart = part;
    this.parts.push(part);
    return part;
  }

  // pin joint between a torso-local point and a point on the part (both given in their own frames)
  join(part, torsoPt, partPt) {
    const ta = this.torso.body.angle, pa = part.body.angle;
    const rot = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
    const c = Constraint.create({
      bodyA: this.torso.body, pointA: rot(torsoPt, ta), bodyB: part.body, pointB: rot(partPt, pa),
      length: 0, stiffness: 0.75, damping: 0.08, render: { visible: false },
    });
    this.joints.push({ c, part });
  }

  get x() { return this.torso.body.position.x; }
  get y() { return this.torso.body.position.y; }

  neckPos() { return local(this.x, this.y, this.torso.body.angle, 0, -this.torso.img.height / 2); }

  // tear a limb off (shotgun blast, sniper round, explosion)
  detach(part, dir, speed = 250) {
    if (!part || !part.attached) return;
    part.attached = false;
    const j = this.joints.find((k) => k.part === part);
    if (j) Composite.remove(this.world.engine.world, j.c);
    part.bleed = rand(1.2, 2);
    const a = dir + rand(-0.8, 0.8);
    Body.setVelocity(part.body, { x: Math.cos(a) * speed / 60, y: Math.sin(a) * speed / 60 });
    Body.setAngularVelocity(part.body, rand(-0.5, 0.5));
    const p = part.body.position;
    this.world.particles.blood(p.x, p.y, a, 0.6, 24, 260, { big: true });
    this.world.decals.stampBlood(p.x, p.y, 5, 6);
    this.world.sound('gore', p.x, p.y, 0.7);
  }

  // a bullet hits one of the parts
  shotPart(part, a, weaponDef) {
    const w = this.world;
    impulse(part.body, a, weaponDef?.pellets > 1 ? 20 : 14, rand(-0.15, 0.15), 4);
    const p = part.body.position;
    const [n, v, cone] = woundFor('bullet', weaponDef).spray;
    w.particles.blood(p.x, p.y, a, cone + 0.2, Math.ceil(n * 0.5), v * 0.7);
    w.decals.stampBlood(p.x, p.y, 3, 3);
    this.pool = Math.min(this.poolMax + 4, this.pool + 1.5);
    const heavy = weaponDef && (weaponDef.pellets > 1 || weaponDef.heavy || weaponDef.rocket);
    if (heavy && part !== this.torso && chance(0.5)) this.detach(part, a, 260);
    else w.sound('splat', p.x, p.y, 0.35);
  }

  update(dt) {
    this.age += dt;
    const w = this.world;
    let moving = false;
    for (const part of this.parts) {
      const sp = Body.getSpeed(part.body);
      if (sp > 0.06 || Math.abs(Body.getAngularVelocity(part.body)) > 0.01) moving = true;
      const pos = part.body.position;
      if (sp > 0.6 && (part === this.head || part === this.torso || part.bleed > 0)) w.decals.stampBlood(pos.x, pos.y, rand(0.8, 2), 1);
      if (part.bleed > 0) {
        part.bleed -= dt;
        if (chance(0.5)) w.particles.blood(pos.x, pos.y, rand(0, 6.28), 0.3, 1, rand(40, 120), { z: 3 });
      }
    }
    // stumps of torn limbs keep bleeding on the torso side
    for (const part of this.limbs) {
      if (part.attached || !chance(0.15) || this.age > 3) continue;
      const pos = this.torso.body.position;
      w.particles.blood(pos.x, pos.y, rand(0, 6.28), 0.4, 1, rand(60, 140), { z: 3 });
    }
    if (this.fountain > 0) {
      this.fountain -= dt;
      const n = this.neckPos();
      const a = this.torso.body.angle - Math.PI / 2;
      if (Math.sin(this.age * 14) > 0.2) w.particles.blood(n.x, n.y, a + rand(-0.5, 0.5), 0.25, 2, rand(90, 200), { z: 3 });
    }
    if (this.spurt > 0) {
      // an opened artery: weaker and weaker pulses
      this.spurt -= dt;
      if (Math.sin(this.age * 9) > 0.35) {
        const t = this.torso.body;
        w.particles.blood(t.position.x, t.position.y, t.angle + this.spurtA + rand(-0.12, 0.12), 0.1, 2, 50 + 190 * (this.spurt / this.spurt0), { z: 3 });
      }
    }
    if (this.pool < this.poolMax && this.age > 0.3) this.pool += dt * this.poolRate;
    this.settle = moving ? 0 : this.settle + dt;
    if (this.settle > 2 && this.pool >= this.poolMax && this.fountain <= 0 && this.spurt <= 0) this.bake();
  }

  bake() {
    const w = this.world;
    const n = this.headless ? this.neckPos() : this.head.body.position;
    w.decals.stampPool(n.x, n.y, this.pool);
    for (const part of this.order()) w.decals.bake(part.img, part.body.position.x, part.body.position.y, part.body.angle);
    for (const j of this.joints) Composite.remove(w.engine.world, j.c);
    for (const part of this.parts) w.removeBody(part.body);
    this.dead = true;
  }

  order() { return [...this.limbs.filter((p) => p.name === 'leg'), ...this.limbs.filter((p) => p.name === 'arm'), this.torso, ...(this.head ? [this.head] : [])]; }

  drawPool(ctx) {
    if (this.pool <= 0) return;
    const n = this.headless ? this.neckPos() : this.head.body.position;
    ctx.fillStyle = PALETTE.blood[3];
    ctx.beginPath();
    ctx.ellipse(n.x, n.y, this.pool, this.pool * 0.8, this.torso.body.angle, 0, Math.PI * 2);
    ctx.fill();
  }

  draw(ctx) {
    for (const part of this.order()) {
      const b = part.body;
      drawSprite(ctx, silhouette(part.img), b.position.x + 1, b.position.y + 1, b.angle, 0.3);
      drawSprite(ctx, part.img, b.position.x, b.position.y, b.angle);
      if (!part.attached) {
        // bloody stump at the root
        const r = local(b.position.x, b.position.y, b.angle, part.root.x, part.root.y);
        ctx.fillStyle = PALETTE.blood[4];
        ctx.fillRect(r.x - 1.5, r.y - 1.5, 3, 3);
      }
    }
    if (this.headless) {
      const n = this.neckPos();
      ctx.fillStyle = PALETTE.blood[4];
      ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}
