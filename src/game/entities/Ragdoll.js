import { CAT, MASK, PALETTE } from '../Config.js';
import { sprite, spriteOpt, drawSprite, silhouette } from '../../engine/Assets.js';
import { rand, randi, chance, local, angDiff, clamp } from '../../engine/math.js';
import { setMaterial, impulse, kgOf } from '../../engine/physics/Body.js';
import { woundFor, CRAWL, THROES } from '../data/wounds.js';
import { startBleeding, bleedOut, wipe } from '../fx/Bleeding.js';
import { poolArt } from '../render/BloodArt.js';
import { crawlPose, giveUpPose, travelAt, stepOf, escapeDir, smooth } from '../fx/CrawlPose.js';

const { Bodies, Body, Constraint, Composite, Query } = Matter;
const JOINT = 0.75; // stiffness of the pin joints
// what a crawling man cannot go through: walls, doors, glass, the map's edge and furniture that does not budge
const BLOCKERS = CAT.WALL | CAT.DOOR | CAT.GLASS | CAT.EDGE | CAT.PROP;
const ZERO = { x: 0, y: 0 };

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
    startBleeding(this, opts);
    this.settle = 0;
    this.age = 0;
    this.dead = false;
    // not quite dead (opts.crawl): he rolls onto his back and pushes himself away from his killer (opts.killer: { x, y },
    // read live), along dir; a scripted sequence (script()), phase by phase, t = s into the phase
    this.crawl = opts.crawl ? { phase: 'fall', t: 0, dir, killer: opts.killer || { x: x - Math.cos(dir) * 60, y: y - Math.sin(dir) * 60 },
      pulls: randi(...CRAWL.pulls), first: randi(0, 1) } : null;
    // or his limbs jerk a moment (opts.throes): s left of it, s to the next jerk
    this.throes = opts.throes ? { t: rand(...THROES.dur), next: rand(...THROES.every) } : null;
    // the weapon left planted in him (opts.stuck: its sprite), at an angle off the line of his body
    this.stuck = opts.stuck ? { img: sprite(opts.stuck), a: rand(-0.6, 0.6) } : null;
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
      head.root = { x: 0, y: 4 };
      head.jt = neck;
      this.join(head, neck, head.root);
      this.head = head;
    }
    const limb = (name, jx, jy, ang) => {
      const im = img(name);
      const half = im.width / 2;
      // limb image points +x (hand/shoe); its root is the -x end
      const c = at(jx + Math.cos(ang) * half, jy + Math.sin(ang) * half);
      const part = this.addPart(name, im, Bodies.rectangle(c.x, c.y, im.width - 1, Math.max(3, im.height - 1), { ...opt(), angle: th + ang }), ang, name === 'leg' ? 11 : 4);
      part.root = { x: -half + 1, y: 0 };
      part.jt = { x: jx, y: jy }; // its joint on the torso, torso-local
      part.len = im.width - 2;    // root to tip
      this.join(part, part.jt, part.root);
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
      length: 0, stiffness: JOINT, damping: 0.08, render: { visible: false },
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
    this.release(false);
    this.throes = null;
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
    this.release(); // that finishes him
    this.throes = null;
    impulse(part.body, a, weaponDef?.pellets > 1 ? 20 : 14, rand(-0.15, 0.15), 4);
    const p = part.body.position;
    const [n, v, cone] = woundFor('bullet', weaponDef).spray;
    w.particles.blood(p.x, p.y, a, cone + 0.2, Math.ceil(n * 0.5), v * 0.7);
    w.decals.stampBlood(p.x, p.y, 3, 3);
    this.pool = Math.min(this.poolMax + 4, this.pool + 1.5);
    this.dry = false;
    const heavy = weaponDef && (weaponDef.pellets > 1 || weaponDef.heavy || weaponDef.rocket);
    if (heavy && part !== this.torso && chance(0.5)) this.detach(part, a, 260);
    else w.sound('splat', p.x, p.y, 0.35);
  }

  update(dt) {
    this.age += dt;
    const w = this.world;
    if (this.crawl) this.script(dt);
    if (this.throes) this.twitch(dt);
    let moving = false;
    for (const part of this.parts) {
      const sp = Body.getSpeed(part.body);
      if (sp > 0.06 || Math.abs(Body.getAngularVelocity(part.body)) > 0.01) moving = true;
      const pos = part.body.position;
      if (sp > 0.6 && !this.dry && (part === this.head || part === this.torso || part.bleed > 0)) wipe(w, part, pos.x, pos.y, part === this.torso ? 5 : 2);
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
    const t = this.torso.body, n = this.neckPos(), src = this.source();
    bleedOut(this, dt, { x: n.x, y: n.y, angle: t.angle - Math.PI / 2 }, { x: t.position.x, y: t.position.y, angle: t.angle },
      src.position, !this.crawl && Body.getSpeed(src) < 0.3); // the pool forms where he ends up
    this.settle = moving ? 0 : this.settle + dt;
    if (this.settle > 2 && !this.crawl && !this.throes && this.pool >= this.poolMax && this.fountain <= 0 && this.spurt <= 0) this.bake();
  }

  // Not quite dead: the scripted crawl (fx/CrawlPose.js). After a moment of plain physics (fall) every part is posed
  // straight into its body each step, roots on their joints (the joints go slack meanwhile): he rolls onto his back
  // (turn), pushes himself away on his heels and elbows (crawl), reaches out to his killer and lies still (giveUp).
  script(dt) {
    const c = this.crawl, t = this.torso.body;
    // something shoved him (a swing, a slide): physics has him back
    if (c.at && Math.hypot(t.position.x - c.at.x, t.position.y - c.at.y) > 2) { this.release(false); return; }
    c.t += dt;
    if (c.phase === 'fall') {
      // he lands first: still sliding, he gets a little longer
      if (c.t < CRAWL.fall || (Body.getSpeed(t) > 0.4 && c.t < CRAWL.fall + 0.6)) return;
      if (!this.startTurn()) { this.crawl = null; return; }
    }
    if (c.phase === 'turn') this.turnOver(c);
    if (c.phase === 'crawl') this.push(c);
    if (c.phase === 'giveUp') this.giveUp(c);
  }

  // which way he goes: away from his killer, or turned off it by a wall; false when every way is shut
  startTurn() {
    const c = this.crawl, t = this.torso.body, half = this.torso.img.height / 2;
    const esc = escapeDir(c.dir, (a) => !this.clear(t.position.x, t.position.y, a, half, half + 28));
    if (esc === null) return false;
    const rel = (p) => ({ a: angDiff(t.angle, p.body.angle), s: 1 });
    Object.assign(c, {
      phase: 'turn', t: 0, esc, A: esc + Math.PI / 2, // A: torso angle, head (-y) along esc
      from: { x: t.position.x, y: t.position.y, a: t.angle, limbs: this.limbs.map(rel), head: this.head && rel(this.head) },
    });
    const g = (p) => ({ x: p.jt.x, y: p.jt.y, len: p.len });
    this.geom = { arms: this.limbs.slice(0, 2).map(g), legs: this.limbs.slice(2).map(g) };
    for (const j of this.joints) j.c.stiffness = 0;
    return true;
  }

  // he rolls onto his back: from how he fell to the first pose of the crawl, squeezed edge-on halfway
  turnOver(c) {
    const k = Math.min(1, c.t / CRAWL.turn), b = smooth(k), f = c.from;
    const a = f.a + angDiff(f.a, c.A) * b;
    const to = crawlPose(0, 0, this.geom, c.first, this.look(f.x, f.y, a));
    const blend = (p, q) => ({ a: p.a + angDiff(p.a, q.a) * b, s: p.s + (q.s - p.s) * b });
    const P = { arms: to.arms.map((q, i) => blend(f.limbs[i], q)), legs: to.legs.map((q, i) => blend(f.limbs[i + 2], q)),
      head: this.head && blend(f.head, to.head) };
    if (k >= 0.5 && !c.flipped) this.flip();
    this.pose(f.x, f.y, a, P, k > 0.2 && k < 0.8 ? 1 - 0.8 * Math.sin(Math.PI * (k - 0.2) / 0.6) : 1);
    if (k >= 1) Object.assign(c, { phase: 'crawl', t: 0, cycle: -1 });
  }

  // halfway through the roll: his front comes up, a puff of dust off the floor
  flip() {
    const t = this.torso.body.position, w = this.world;
    this.crawl.flipped = true;
    this.torso.img = spriteOpt(`characters/${this.kind}_rag_torso_up`) || this.torso.img;
    if (this.head) this.head.img = spriteOpt(`characters/${this.kind}_rag_head_up`) || this.head.img;
    w.particles.dust(t.x, t.y, 4, 6, '#6a6272', { speed: 25, size: 4, life: 0.6, alpha: 0.18 });
    w.sound('soft', t.x, t.y, 0.5);
  }

  // he pushes on his heels and elbows, a little less far each time
  push(c) {
    const i = Math.floor(c.t / CRAWL.cycle), p = c.t / CRAWL.cycle - i, f = c.from;
    if (i !== c.cycle) {
      // before each push: is there floor for it?
      if (i >= c.pulls || !this.canPush(c, i)) { this.stop(c, i); this.giveUp(c); return; }
      c.cycle = i;
    }
    if (!c.groaned) { c.groaned = true; this.world.sound('whimper', f.x, f.y, 0.5, { pitch: 0.85 }); }
    const d = travelAt(i, p), x = f.x + Math.cos(c.esc) * d, y = f.y + Math.sin(c.esc) * d;
    const P = crawlPose(i, p, this.geom, c.first, this.look(x, y, c.A));
    this.pose(x, y, c.A + P.rock, P);
    // posed by hand, it is never seen moving: the smear follows the torso here
    if (!this.dry) wipe(this.world, this.torso, x, y, 5);
  }

  canPush(c, i) {
    const half = this.torso.img.height / 2, d = travelAt(i, 0), f = c.from;
    return this.clear(f.x + Math.cos(c.esc) * d, f.y + Math.sin(c.esc) * d, c.esc, half, half + 10 + stepOf(i));
  }

  // he stops before push i: where he lies, how, and the arm on his killer's side
  stop(c, i) {
    const d = travelAt(i, 0), x = c.from.x + Math.cos(c.esc) * d, y = c.from.y + Math.sin(c.esc) * d;
    const k = this.toLocal(x, y, c.A, c.killer);
    Object.assign(c, { phase: 'giveUp', t: 0, x, y, still: crawlPose(i, 0, this.geom, c.first, this.look(x, y, c.A)), reach: k.x < 0 ? 0 : 1 });
    this.limbs[c.reach].top = true;
  }

  // one arm comes up toward his killer and holds, a last whimper, then it drops and the head rolls aside
  giveUp(c) {
    const u = Math.min(c.t, CRAWL.giveUp), j = this.limbs[c.reach].jt, k = this.toLocal(c.x, c.y, c.A, c.killer);
    this.pose(c.x, c.y, c.A, giveUpPose(u, c.still, this.geom, c.reach, Math.atan2(k.y - j.y, k.x - j.x), this.look(c.x, c.y, c.A)));
    if (u > 0.3 && !c.sighed) { c.sighed = true; this.world.sound('whimper', c.x, c.y, 0.4, { pitch: 0.8 }); }
    if (c.t >= CRAWL.giveUp) this.release();
  }

  // point pt in the frame of a torso at (x, y), angle a
  toLocal(x, y, a, pt) {
    const dx = pt.x - x, dy = pt.y - y, cs = Math.cos(a), sn = Math.sin(a);
    return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs };
  }

  // how far his head turns toward his killer, the torso at (x, y), angle a
  look(x, y, a) {
    const k = this.toLocal(x, y, a, this.crawl.killer);
    return clamp(Math.atan2(-k.x, k.y + this.torso.img.height / 2), -0.5, 0.5);
  }

  // the torso at (x, y), angle a, every attached part on its joint (P: fx/CrawlPose.js); roll = squeeze across
  pose(x, y, a, P, roll = 1) {
    const set = (b, px, py, ang) => {
      Body.setAngle(b, ang);
      Body.setPosition(b, { x: px, y: py });
      Body.setVelocity(b, ZERO);
      Body.setAngularVelocity(b, 0);
    };
    const place = (part, q) => {
      const j = local(x, y, a, part.jt.x * roll, part.jt.y), ang = a + q.a, r = part.root;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      set(part.body, j.x - (r.x * cs - r.y * sn), j.y - (r.x * sn + r.y * cs), ang);
    };
    set(this.torso.body, x, y, a);
    this.torso.sx = roll;
    this.limbs.forEach((part, i) => {
      const q = i < 2 ? P.arms[i] : P.legs[i - 2];
      place(part, q);
      part.sx = q.s;
    });
    if (this.head) {
      place(this.head, P.head);
      this.head.sx = roll;
      this.head.sy = P.head.s;
    }
    this.crawl.at = { x, y };
  }

  // is there floor for him d0 to d1 px along a from (x, y): for his head, and his elbows either side?
  clear(x, y, a, d0, d1) {
    const m = this.world.map, cs = Math.cos(a), sn = Math.sin(a), pts = [];
    for (let d = d0; ; d = Math.min(d1, d + 4)) {
      pts.push({ x: x + cs * d, y: y + sn * d });
      if (d <= d1 - 6) for (const s of [-10, 10]) pts.push({ x: x + cs * d - sn * s, y: y + sn * d + cs * s });
      if (d >= d1) break; // the far end too
    }
    if (pts.some((p) => m.solidAt(p.x, p.y))) return false;
    const r = d1 + 12;
    const near = this.world.physics.bodies().filter((b) => (b.collisionFilter.category & BLOCKERS) && b.collisionFilter.mask
      && (!(b.collisionFilter.category & CAT.PROP) || b.isStatic || b.entity?.def?.blocksPath || b.entity?.isVehicle)
      && b.bounds.min.x < x + r && b.bounds.max.x > x - r && b.bounds.min.y < y + r && b.bounds.max.y > y - r);
    return !pts.some((p) => Query.point(near, p).length);
  }

  // the script lets go (over, or he was shot, torn or shoved): physics has him where he is, face up if he had
  // turned; still = stopped dead (else a shove keeps its momentum)
  release(still = true) {
    const c = this.crawl;
    if (!c) return;
    this.crawl = null;
    if (c.phase === 'fall') return;
    for (const part of this.parts) {
      part.sx = part.sy = 1;
      part.top = false;
      if (still) { Body.setVelocity(part.body, ZERO); Body.setAngularVelocity(part.body, 0); }
    }
    for (const j of this.joints) j.c.stiffness = JOINT;
  }

  // death throes: now and then one of his limbs jerks, for a moment
  twitch(dt) {
    const th = this.throes;
    if ((th.t -= dt) <= 0) { this.throes = null; return; }
    if ((th.next -= dt) > 0) return;
    th.next = rand(...THROES.every);
    const limbs = this.limbs.filter((p) => p.attached);
    if (!limbs.length) return;
    const b = limbs[Math.floor(Math.random() * limbs.length)].body;
    impulse(b, b.angle + (chance(0.5) ? 1 : -1) * Math.PI / 2, kgOf(b) * THROES.kick);
  }

  // where the planted weapon is drawn: out of the torso, its centre some way along the direction it points
  stuckAt() {
    const t = this.torso.body, a = t.angle - Math.PI / 2 + this.stuck.a, r = this.stuck.img.width * 0.3;
    return { x: t.position.x + Math.cos(a) * r, y: t.position.y + Math.sin(a) * r, a };
  }

  // the part the blood seeps from: the head while it is on, else the torso (its pool forms at the neck)
  source() { return this.head?.attached ? this.head.body : this.torso.body; }

  // centre of the blood pool: where it started, or under the wound while the body still slides
  poolAt() { return this.poolPos || (this.head?.attached ? this.head.body.position : this.neckPos()); }

  bake() {
    const w = this.world;
    const n = this.poolAt();
    w.decals.bakePool(this, n.x, n.y, this.pool);
    for (const part of this.order()) w.decals.bake(part.img, part.body.position.x, part.body.position.y, part.body.angle, 1, true);
    if (this.stuck) { const s = this.stuckAt(); w.decals.bake(this.stuck.img, s.x, s.y, s.a, 1, true); }
    for (const j of this.joints) Composite.remove(w.engine.world, j.c);
    for (const part of this.parts) w.removeBody(part.body);
    this.dead = true;
  }

  // an arm raised over him (top) is drawn above the torso
  order() {
    const arms = this.limbs.filter((p) => p.name === 'arm');
    return [...this.limbs.filter((p) => p.name === 'leg'), ...arms.filter((p) => !p.top), this.torso, ...arms.filter((p) => p.top),
      ...(this.head ? [this.head] : [])];
  }

  drawPool(ctx) {
    if (this.pool < 1) return;
    const n = this.poolAt();
    poolArt(this).draw(ctx, n.x, n.y, this.pool);
  }

  draw(ctx) {
    for (const part of this.order()) {
      const b = part.body, draw = part.len && part.sx < 1 ? drawBent : drawPart;
      // a part raised off the floor (top) casts its shadow further
      draw(ctx, silhouette(part.img), part, part.top ? 3 : 1, 0.3, this.torso.body.position);
      draw(ctx, part.img, part, 0, 1, this.torso.body.position);
      // bloody stump at the root of a torn part
      if (!part.attached) stump(ctx, local(b.position.x, b.position.y, b.angle, part.root.x, part.root.y), 3);
    }
    if (this.stuck) {
      const s = this.stuckAt();
      drawSprite(ctx, silhouette(this.stuck.img), s.x + 1, s.y + 1, s.a, 0.3);
      drawSprite(ctx, this.stuck.img, s.x, s.y, s.a);
    }
    if (this.headless) stump(ctx, this.neckPos(), 4);
  }
}

// a part as it lies, or scaled about its root (part.sx along it, part.sy across: the head lifted, rolling over)
function drawPart(ctx, img, part, off, alpha) {
  const b = part.body, sx = part.sx ?? 1, sy = part.sy ?? 1;
  if (sx === 1 && sy === 1) { drawSprite(ctx, img, b.position.x + off, b.position.y + off, b.angle, alpha); return; }
  const o = part.root || ZERO, p = local(b.position.x, b.position.y, b.angle, o.x, o.y);
  ctx.save();
  ctx.translate(p.x + off, p.y + off);
  ctx.rotate(b.angle);
  ctx.scale(sx, sy);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(img, -o.x - img.width / 2, -o.y - img.height / 2);
  ctx.restore();
}

// a limb bent (part.sx < 1: its end that much nearer its root): its two halves drawn from the root to the knee or
// elbow, that comes up and out away from the body (from), and on to the shoe or hand, which keep their size
function drawBent(ctx, img, part, off, alpha, from) {
  const b = part.body, ang = b.angle, w = img.width, m = Math.floor(w / 2), h = img.height;
  const R = local(b.position.x, b.position.y, ang, part.root.x, part.root.y);
  const p = m - 1, q = w - 1 - m, d = part.sx * part.len;
  const F = { x: R.x + Math.cos(ang) * d, y: R.y + Math.sin(ang) * d };
  // the joint where the halves meet, seen from above (the bend rises off the floor: its offset shows shorter)
  const along = (p * p - q * q + d * d) / (2 * d), rise = Math.sqrt(Math.max(0, p * p - along * along)) * 0.85;
  let nx = -Math.sin(ang), ny = Math.cos(ang);
  if (nx * (R.x + F.x - 2 * from.x) + ny * (R.y + F.y - 2 * from.y) < 0) { nx = -nx; ny = -ny; }
  const K = { x: R.x + Math.cos(ang) * along + nx * rise, y: R.y + Math.sin(ang) * along + ny * rise };
  const half = (P, Q, sx, sw, x0, len) => {
    ctx.save();
    ctx.translate(P.x + off, P.y + off);
    ctx.rotate(Math.atan2(Q.y - P.y, Q.x - P.x));
    ctx.scale(Math.hypot(Q.x - P.x, Q.y - P.y) / len, 1);
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    ctx.drawImage(img, sx, 0, sw, h, x0, -h / 2, sw, h);
    ctx.restore();
  };
  half(R, K, 0, m, -1, p);
  half(K, F, m, w - m, 0, q);
}

// raw flesh where something was torn off: dark meat, a wet centre
function stump(ctx, p, s) {
  const x = Math.round(p.x - s / 2), y = Math.round(p.y - s / 2);
  ctx.fillStyle = PALETTE.blood[3];
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = PALETTE.blood[4];
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
}
