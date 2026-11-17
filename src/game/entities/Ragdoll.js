import { CAT, MASK, PALETTE, BODY_SCALE, TILE } from '../Config.js';
import { sprite, spriteOpt, drawSprite, drawUpright, silhouette, sw, sh } from '../../engine/Assets.js';
import { rand, randi, chance, local, angDiff } from '../../engine/math.js';
import { setMaterial, impulse, kgOf } from '../../engine/physics/Body.js';
import { woundFor, markOf, BODY, CRAWL, SPASM, CURL, THROES, KNEELS } from '../data/wounds.js';
import { startBleeding, bleedOut, wipe, squirt } from '../fx/Bleeding.js';
import { smear } from '../fx/Spatter.js';
import { crawlPlan, crawlPose, lastPose, pullAt, travelAt, escapeDir, smooth } from '../fx/CrawlPose.js';
import { spasmPlan, spasmPose, curlPlan, curlPose, throatPlan, throatPose } from '../fx/DyingPose.js';
import { jointAngle, clampJoint, partAngle } from '../fx/Joints.js';
import { bodyMarks, markAt } from '../fx/BodyMarks.js';
import { drawMark } from '../render/BodyMarkArt.js';

const { Bodies, Body, Constraint, Composite, Query } = Matter;
const JOINT = 0.75; // stiffness of the pin joints
// what a crawling man cannot go through: walls, doors, glass, the map's edge and furniture that does not budge
const BLOCKERS = CAT.WALL | CAT.DOOR | CAT.GLASS | CAT.EDGE | CAT.PROP;
const ZERO = { x: 0, y: 0 };
const GLANCE = 0.6; // rad his head turns as he glances back at his killer before he crawls
const RANGE = { arm: BODY.joints.shoulder, leg: BODY.joints.hip, head: BODY.joints.neck };
const FALL = { crawl: CRAWL.fall, spasm: SPASM.fall, curl: CURL.fall }; // s of plain physics first (none for KNEELS)
// turns tried, off the way he falls, when he is laid out across a wall or a bolted prop
const TURNS = [0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI];
// thrown toward a wall, he ends up sitting against it (the user's wish). speed: px/s he must be thrown at; reach: px of
// floor his slide crosses to get there, [fixed, x his speed]; fast, near, early: a body sent flying later (a blast)
// that hits a wall going faster than `fast` px/step with the wall `near` px ahead of his torso, within `early` s of
// his death; back: px of his torso's centre off the wall; arch: how short his torso shows seen from above, sat up;
// slump: px his head comes down over his chest; slam: s he takes to be thrown against it
const SIT = { speed: 35, reach: [14, 0.4], fast: 2.2, near: 20, early: 1.0, back: 11, arch: 0.55, slump: 3, slam: 0.16 };
const MARKS_MAX = 12; // wounds shown on one body (a corpse can be shot again and again)
// the stump of a torn limb pumps: s it lasts, beats per s (rad/s of the beat), how hard it throws at first (0 to 1)
const STUMP = { dur: 2.6, rate: 11, jet: 0.75 };
const HEAD_R = 4.5;   // the head's radius, for what marks it
// a weapon planted in him, seen from above: the share of it that shows (from its grip), how short it looks, how
// much bigger (it comes up toward the eye), px within which the player can pull it out
export const PLANTED = { part: 0.65, len: 0.75, size: 1.1, reach: 28 };

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
    // how he dies on the floor (opts.dying, fx/Gore.js): 'crawl' (not quite dead, he drags himself away from his
    // killer, opts.killer: { x, y }, along dir), 'spasm', 'curl', 'throat' (his throat cut, he sinks onto his knees
    // where he stood, at { x, y }, and pitches forward along dir), 'behead' (the same without a head: the neck
    // throws blood up while he kneels), 'kneel' / 'slump' (struck down from behind: onto his knees, onto his face;
    // opts.kneeling: he was on his knees already), each a scripted sequence (script()), phase by
    // phase, t = s into the phase, seed = its moves; or 'throes': his limbs jerk a moment (s left of it, s to the next)
    // (opts.against: the furniture his head was driven into, { prop, x, y, nx, ny } its face struck, sit: he sits
    // against its side; with no floor there for his legs he is left folded over it instead)
    this.against = opts.against?.prop || null;
    const sit = !!opts.against?.sit && this.clear(opts.against.x + opts.against.nx * SIT.back, opts.against.y + opts.against.ny * SIT.back,
      Math.atan2(opts.against.ny, opts.against.nx), 4, 30);
    const how = opts.against?.sit && !sit ? 'ledge' : opts.dying;
    this.dying = how && how !== 'throes' ? { kind: how, phase: 'fall', t: 0, dir, seed: randi(1, 2 ** 30), fall: FALL[how] ?? 0,
      hip: { x, y }, kneeling: !!opts.kneeling, killer: opts.killer || { x: x - Math.cos(dir) * 60, y: y - Math.sin(dir) * 60 } } : null;
    this.throes = how === 'throes' ? { t: rand(...THROES.dur), next: rand(...THROES.every) } : null;
    this.up = false; // lying on his back (opts.back: he went over backwards)
    // the weapon left planted in him (opts.stuck: its sprite): where on his torso (px off its centre), the way its
    // handle leans; item = { type, mag, wear } when it can be pulled out again (a weapon thrown at him)
    this.stuck = opts.stuck ? { img: sprite(opts.stuck), a: rand(0, 6.28), x: rand(-2.5, 2.5), y: rand(-4, 2), item: opts.stuckItem || null, hot: -1 } : null;
    const group = Body.nextGroup(true);
    const img = (p) => spriteOpt(`characters/${kind}_rag_${p}`) || sprite(`characters/${kind}_gib_${p}`);
    const th = dir + Math.PI / 2; // head (torso -y) ends up along the travel direction
    const opt = () => ({
      frictionAir: 0.01, friction: 0.3, restitution: 0.1, label: 'ragdoll',
      collisionFilter: { group, category: CAT.CORPSE, mask: MASK.CORPSE },
    });

    const tImg = img('torso');
    const tw = sw(tImg), tht = sh(tImg); // world px: the parts are finer sprites (engine/Assets.js `density`)
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
    // limb image points +x (hand/shoe); its root is the -x end. ang: its turn off the torso as for the +x side
    // (BODY: the -x side mirrored)
    const limb = (name, jx, jy, ang) => {
      const im = img(name), a = jx < 0 ? Math.PI - ang : ang;
      const half = sw(im) / 2;
      const c = at(jx + Math.cos(a) * half, jy + Math.sin(a) * half);
      const part = this.addPart(name, im, Bodies.rectangle(c.x, c.y, sw(im) - 1, Math.max(3, sh(im) - 1), { ...opt(), angle: th + a }), a, name === 'leg' ? 11 : 4);
      part.root = { x: -half + 1, y: 0 };
      part.jt = { x: jx, y: jy }; // its joint on the torso, torso-local
      part.len = sw(im) - 2;      // root to tip
      this.join(part, part.jt, part.root);
      return part;
    };
    this.limbs = [
      limb('arm', -tw / 2 + 1, -tht / 2 + 3, rand(...BODY.arms)),
      limb('arm', tw / 2 - 1, -tht / 2 + 3, rand(...BODY.arms)),
      limb('leg', -tw * 0.24, tht / 2 - 1, rand(...BODY.legs)),
      limb('leg', tw * 0.24, tht / 2 - 1, rand(...BODY.legs)),
    ];
    this.fit(x, y);
    // what the wound left on him (opts.mark: its data/wounds.js MARKS entry): holes, a cut, the blood of a blow
    this.build = { tw, th: tht, head: this.head ? HEAD_R : 0 };
    this.marks = bodyMarks(opts.mark, this.build);

    // thrown as one body, turning a little as a whole; the limbs trail behind the torso
    const spin = rand(...BODY.spin) * (speed / 100) * (chance(0.5) ? 1 : -1) / 60;
    for (const p of this.parts) {
      const k = p.len ? 1 - BODY.lag : 1, r = p.body.position;
      Body.setVelocity(p.body, { x: Math.cos(dir) * k * speed / 60 - spin * (r.y - y), y: Math.sin(dir) * k * speed / 60 + spin * (r.x - x) });
      Body.setAngularVelocity(p.body, spin);
      world.addBody(p.body);
    }
    for (const j of this.joints) world.addBody(j.c);
    this.lastV = { x: Math.cos(dir) * speed / 60, y: Math.sin(dir) * speed / 60 }; // for propUp(): how he was thrown
    for (const i of opts.detach || []) this.detach(this.limbs[i], dir, speed * 1.4);
    // a body that will move on the floor shows the side it lies on; the others keep the plain sprites
    this.lie(opts.dying && opts.dying !== 'throes' ? !!opts.back : true);
    if (how === 'behead') this.fountain = 0; // the script throws the blood of his neck
    // on his feet (or his knees) from the first frame, not laid out first; any other thrown toward a wall close
    // enough for his slide to reach it is slammed against it and stays sat there
    // (opts.sit: px of floor to a wall he was put against: a takedown's WALL SMASH)
    if (KNEELS[how]) this.script(0);
    else if (sit) this.sitAgainst(opts.against);
    else if (opts.sit) this.propUp(Math.cos(dir), Math.sin(dir), opts.sit);
    else if (speed >= SIT.speed) this.propUp(Math.cos(dir), Math.sin(dir), SIT.reach[0] + speed * SIT.reach[1]);
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

  // laid out across a wall or a bolted prop (he went down against it): turned about his middle (x, y) until every
  // part is clear of it, or left as he is when no turn is
  fit(x, y) {
    const near = this.blockers(x, y, 40), m = this.world.map;
    const ends = (p) => (p.len ? [-1, 0, 1].map((k) => local(p.body.position.x, p.body.position.y, p.body.angle, k * p.len / 2, 0)) : [p.body.position]);
    const pts = this.parts.flatMap(ends).map((q) => ({ x: q.x - x, y: q.y - y }));
    const clear = (d) => pts.every((q) => {
      const r = local(x, y, d, q.x, q.y);
      return !m.solidAt(r.x, r.y) && !Query.point(near, r).length;
    });
    if (clear(0)) return;
    const d = TURNS.find(clear);
    if (d === undefined) return;
    for (const p of this.parts) {
      const b = p.body, r = local(0, 0, d, b.position.x - x, b.position.y - y);
      Body.setPosition(b, { x: x + r.x, y: y + r.y });
      Body.setAngle(b, b.angle + d);
    }
  }

  // what a body cannot go through (BLOCKERS) within r of (x, y): walls, doors, glass and furniture that does not budge
  blockers(x, y, r) {
    return this.world.physics.bodies().filter((b) => (b.collisionFilter.category & BLOCKERS) && b.collisionFilter.mask
      && (!(b.collisionFilter.category & CAT.PROP) || b.isStatic || b.entity?.def?.blocksPath || b.entity?.isVehicle)
      && b.bounds.min.x < x + r && b.bounds.max.x > x - r && b.bounds.min.y < y + r && b.bounds.max.y > y - r);
  }

  // A limp body, after each physics step: every part held within what its joint allows (BODY.joints; a part that
  // reaches the end of it stops there and goes on with the torso), and what is left of a swing taken out of him
  // (BODY.damp): the parts turn and move more and more as one, so he drops and stays instead of flailing.
  limp(dt) {
    const t = this.torso.body, ta = t.angle, wt = Body.getAngularVelocity(t), vt = Body.getVelocity(t);
    const ks = 1 - Math.exp(-BODY.damp.spin * dt), kv = 1 - Math.exp(-BODY.damp.slide * dt);
    const on = this.parts.filter((p) => p.attached);
    let m = 0, vx = 0, vy = 0;
    for (const p of on) {
      const v = Body.getVelocity(p.body);
      m += p.body.mass; vx += v.x * p.body.mass; vy += v.y * p.body.mass;
    }
    vx /= m; vy /= m;
    for (const p of on) {
      const b = p.body;
      if (p !== this.torso) {
        const left = p.jt.x < 0 && p !== this.head, a = jointAngle(ta, b.angle, left), c = clampJoint(a, RANGE[p.name]);
        if (c !== a && this.hold(p, partAngle(ta, c, left))) {
          Body.setVelocity(b, { x: vt.x - wt * (b.position.y - t.position.y), y: vt.y + wt * (b.position.x - t.position.x) });
          Body.setAngularVelocity(b, wt);
        } else Body.setAngularVelocity(b, Body.getAngularVelocity(b) + (wt - Body.getAngularVelocity(b)) * ks);
      }
      const v = Body.getVelocity(b);
      Body.setVelocity(b, { x: v.x + (vx - v.x) * kv, y: v.y + (vy - v.y) * kv });
    }
  }

  // part p held at the end of its joint's range, at angle a; not into a wall (forced into it, it would be thrown back
  // out step after step): false, the wall has it
  hold(p, a) {
    const t = this.torso.body, j = local(t.position.x, t.position.y, t.angle, p.jt.x, p.jt.y);
    const end = local(j.x, j.y, a, p.len ? p.len / 2 : 0, p.len ? 0 : -4);
    if (this.world.map.solidAt(end.x, end.y)) return false;
    seat(p.body, j, p.root, a);
    return true;
  }

  get x() { return this.torso.body.position.x; }
  get y() { return this.torso.body.position.y; }

  neckPos() { return local(this.x, this.y, this.torso.body.angle, 0, -sh(this.torso.img) / 2); }

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
    const heavy = weaponDef && (weaponDef.pellets > 1 || weaponDef.heavy || weaponDef.rocket);
    impulse(part.body, a, BODY.jolt[weaponDef?.pellets > 1 ? 1 : heavy ? 2 : 0], rand(-0.15, 0.15), 4);
    const p = part.body.position;
    const [n, v, cone] = woundFor('bullet', weaponDef).spray;
    w.particles.blood(p.x, p.y, a, cone + 0.2, Math.ceil(n * 0.5), v * 0.7);
    w.decals.stampBlood(p.x, p.y, 3, 3);
    this.pool = Math.min(this.poolMax + 4, this.pool + 1.5);
    this.dry = false;
    // the round shows where it went in
    const spec = markOf(woundFor('bullet', weaponDef));
    if (spec?.kind === 'hole' && (part === this.torso || part === this.head) && this.marks.length < MARKS_MAX) {
      const m = markAt({ ...spec, where: part === this.head ? 'head' : 'torso' }, this.build);
      if (m) this.marks.push(m);
    }
    if (heavy && part !== this.torso && chance(0.5)) this.detach(part, a, 260);
    else w.sound('splat', p.x, p.y, 0.35);
  }

  update(dt) {
    this.age += dt;
    const w = this.world;
    if (this.age < SIT.early && !this.dying?.sat) this.slammed();
    if (this.dying) this.script(dt);
    if (this.throes) this.twitch(dt);
    if (!this.dying || this.dying.phase === 'fall') this.limp(dt);
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
    // stumps of torn limbs pump blood out of the shoulder or the hip, beat by beat, weaker each time
    if (this.age < STUMP.dur) {
      const t = this.torso.body, beat = Math.sin(this.age * STUMP.rate);
      for (const part of this.limbs) {
        if (part.attached || beat < 0.2) continue;
        const j = local(t.position.x, t.position.y, t.angle, part.jt.x, part.jt.y);
        squirt(w, j.x, j.y, t.angle + Math.atan2(part.jt.y, part.jt.x) + rand(-0.3, 0.3), STUMP.jet * beat * (1 - this.age / STUMP.dur), 3);
      }
    }
    // the pool forms where he ends up: not under a man crawling, nor before a cut throat is down on the floor
    const t = this.torso.body, n = this.neckPos(), src = this.source(), s = this.dying;
    const going = s && (s.kind === 'crawl' || (KNEELS[s.kind] && !s.down));
    bleedOut(this, dt, { x: n.x, y: n.y, angle: t.angle - Math.PI / 2 }, { x: t.position.x, y: t.position.y, angle: t.angle },
      src.position, !going && Body.getSpeed(src) < 0.3);
    this.settle = moving ? 0 : this.settle + dt;
    if (this.settle > 2 && !this.dying && !this.throes && this.pool >= this.poolMax && this.fountain <= 0 && this.spurt <= 0
      && !this.stuck?.item) this.bake(); // with a weapon to pull out he stays a body: baked, it would be lost
  }

  // How he dies on the floor, a scripted sequence (fx/CrawlPose.js, fx/DyingPose.js). After a moment of plain physics
  // (fall) every part is posed straight into its body each step, roots on their joints (the joints go slack
  // meanwhile). crawl: he turns onto his belly (turn), drags himself away pull after pull (crawl), reaches out a last
  // time and lies still (last); spasm, curl: he writhes where he fell (writhe); throat: from his knees to the floor,
  // bleeding out (throat).
  script(dt) {
    const s = this.dying, t = this.torso.body;
    // what he was left against is gone (tipped over, broken): he drops where he is
    if (this.against && (this.against.dead || this.against.dying)) { this.against = null; this.release(false); return; }
    // something shoved him (a swing, a slide): physics has him back
    if (s.at && Math.hypot(t.position.x - s.at.x, t.position.y - s.at.y) > 2) { this.release(false); return; }
    s.t += dt;
    if (s.phase === 'fall') {
      // he lands first: still sliding, he gets a little longer
      if (!KNEELS[s.kind] && (s.t < s.fall || (Body.getSpeed(t) > 0.4 && s.t < s.fall + 0.6))) return;
      if (!this.begin(s)) { this.dying = null; return; }
    }
    if (s.phase === 'turn') this.turnOver(s);
    if (s.phase === 'crawl') this.drag(s);
    if (s.phase === 'last') this.last(s);
    if (s.phase === 'writhe') this.writhe(s);
    if (s.phase === 'throat') this.throat(s);
    if (s.phase === 'sit') this.slump(s);
  }

  // sent flying after his death (a blast) and hitting a wall fast: the same, against that wall
  slammed() {
    const s = this.dying, last = this.lastV;
    this.lastV = Body.getVelocity(this.torso.body);
    if (s && s.phase !== 'fall') return;
    if (last && Math.hypot(last.x, last.y) >= SIT.fast) this.propUp(last.x, last.y, SIT.near);
  }

  // Thrown into a wall: he does not bounce off it, he slides down it and stays sat against it, his back to the wall,
  // his legs out on the floor, his arms hanging, his head dropped. (dx, dy): the way he goes; a wall (along the nearer
  // grid axis) within `reach` px of floor ahead of his torso, and floor for his legs in front of it.
  propUp(dx, dy, reach) {
    if (this.headless) return;
    const t = this.torso.body, half = sh(this.torso.img) / 2, ax = Math.abs(dx) > Math.abs(dy);
    const sx = ax ? Math.sign(dx) : 0, sy = ax ? 0 : Math.sign(dy);
    let probe = null;
    for (let d = half; d <= half + reach && !probe; d += 2) {
      const q = { x: t.position.x + sx * d, y: t.position.y + sy * d };
      if (this.world.map.solidAt(q.x, q.y)) probe = q;
    }
    if (!probe) return;
    // the wall's face, and his torso's centre that far off it
    const cell = (v, d) => (Math.floor(v / TILE) + (d < 0 ? 1 : 0)) * TILE;
    const x = ax ? cell(probe.x, sx) - sx * SIT.back : t.position.x, y = ax ? t.position.y : cell(probe.y, sy) - sy * SIT.back;
    const out = Math.atan2(-sy, -sx); // from the wall into the room
    if (!this.clear(x, y, out, 4, 30)) return;
    this.sitDown(x, y, out + 1.5 * Math.PI, { x: x - sx * (SIT.back - 2), y: y - sy * (SIT.back - 2) });
  }

  // Slammed face first into something low (a crate, a keg): he slides down it and sits on the floor, his back against
  // its side (a: the face struck and its normal), his head lolled; out of its way for good (its body would shove him)
  sitAgainst(a) {
    this.sitDown(a.x + a.nx * SIT.back, a.y + a.ny * SIT.back, Math.atan2(a.ny, a.nx) + 1.5 * Math.PI, { x: a.x, y: a.y }, a.prop);
    this.ghost(this.dying.ghost = true);
  }

  // to be sat at (x, y), torso angle A (his head toward the wall), the wall's face at w (or the side of `prop`):
  // thrown there from where he is
  sitDown(x, y, A, w, prop = null) {
    const r = () => rand(-0.12, 0.12), knee = chance(0.5) ? randi(0, 1) : -1, side = chance(0.5) ? 1 : -1;
    const P = {
      arch: SIT.arch,
      arms: [{ a: Math.PI / 2 + 0.42 + r(), s: rand(0.5, 0.62) }, { a: Math.PI / 2 - 0.42 + r(), s: rand(0.5, 0.62) }],  // by his hips
      legs: [{ a: Math.PI / 2 + 0.16 + r(), s: knee === 0 ? 0.62 : 1 }, { a: Math.PI / 2 - 0.16 + r(), s: knee === 1 ? 0.62 : 1 }],
      head: { a: side * rand(0.25, 0.55), s: 0.8, dy: SIT.slump },
    };
    const t = this.torso.body;
    for (const j of this.joints) j.c.stiffness = 0;
    this.throes = null;
    this.lie(true);
    // his head dropped onto his chest: seen from above, the crown of it and his hair, never his eyes
    if (this.head) this.head.img = spriteOpt(`characters/${this.kind}_rag_head`) || this.head.img;
    this.dying = { kind: 'sit', phase: 'sit', sat: true, t: 0, x, y, A, P, w, prop, from: { x: t.position.x, y: t.position.y, a: t.angle } };
    this.slump(this.dying);
  }

  // on his way into the wall (slam), then sat against it
  slump(s) {
    const k = Math.min(1, s.t / SIT.slam), e = 1 - (1 - k) ** 2, f = s.from;
    this.pose(f.x + (s.x - f.x) * e, f.y + (s.y - f.y) * e, f.a + angDiff(f.a, s.A) * e, s.P);
    if (k < 1 || s.hit) return;
    s.hit = true;
    // his back leaves its blood on the wall, and it runs down (on a piece of furniture: a stain on its side)
    const ox = s.x - s.w.x, oy = s.y - s.w.y, ol = Math.hypot(ox, oy) || 1;
    this.world.decals.stampBlood(s.w.x + (s.prop ? ox / ol * 4 : 0), s.w.y + (s.prop ? oy / ol * 4 : 0), 4, 3);
    if (!this.dry && s.prop) s.prop.bloody?.(s.w.x - ox / ol, s.w.y - oy / ol, 3);
    else if (!this.dry) smear(this.world, s.w.x, s.w.y, ox / ol, oy / ol);
    this.world.sound('bodyFall', s.x, s.y, 0.9);
    this.world.shake?.(0.08);
  }

  // he has landed: his pose as he fell (limb angles off the torso's), and for a crawl the way he goes (away from his
  // killer, or turned off it by a wall); false when every way is shut
  begin(s) {
    const t = this.torso.body, x = t.position.x, y = t.position.y, half = sh(this.torso.img) / 2;
    const rel = (p) => ({ a: angDiff(t.angle, p.body.angle), s: 1 });
    const g = (p) => ({ x: p.jt.x, y: p.jt.y, len: p.len });
    this.geom = { arms: this.limbs.slice(0, 2).map(g), legs: this.limbs.slice(2).map(g), half };
    s.from = { x, y, a: t.angle, arms: this.limbs.slice(0, 2).map(rel), legs: this.limbs.slice(2).map(rel),
      head: this.head ? rel(this.head) : { a: 0, s: 1 } };
    s.t = 0;
    if (s.kind === 'crawl') {
      const esc = escapeDir(s.dir, (a) => !this.clear(x, y, a, half, half + 28));
      if (esc === null) return false;
      const A = esc + Math.PI / 2; // torso angle, head (-y) along esc
      const k = this.toLocal(x, y, A, s.killer);
      Object.assign(s, { phase: 'turn', esc, A, over: this.up, look: k.x < 0 ? -GLANCE : GLANCE, pull: -1, planted: -1,
        plan: crawlPlan(s.seed, this.geom.arms[0].len) });
    } else if (KNEELS[s.kind]) {
      // he pitches forward, or off to a side when there is no floor for him ahead (backwards, over the heels of
      // whoever stood behind him, when he stood at a counter or a wall); one left folded over something stays the
      // way he faced it
      const T = KNEELS[s.kind], shut = (a) => !this.clear(s.hip.x, s.hip.y, a, 4, 2 * half + 8);
      const esc = T.stay ? s.dir : escapeDir(s.dir, shut) ?? escapeDir(s.dir + Math.PI, shut);
      if (esc === null) return false;
      Object.assign(s, { phase: 'throat', A: esc + Math.PI / 2, T, plan: throatPlan(s.seed, T), t: s.kneeling ? T.kneel : 0 });
    } else Object.assign(s, { phase: 'writhe', plan: s.kind === 'spasm' ? spasmPlan(s.seed) : curlPlan(s.seed) });
    for (const j of this.joints) j.c.stiffness = 0;
    return true;
  }

  // onto his belly: from how he fell to the first pose of the crawl, rolled over from his back (squeezed edge-on
  // halfway), or only gathered under him when he fell on his face
  turnOver(s) {
    const k = Math.min(1, s.t / (s.over ? CRAWL.turn : CRAWL.gather)), b = smooth(k), f = s.from;
    const to = crawlPose(s.plan, 0, 0, this.geom, s.look);
    const blend = (p, q) => ({ a: p.a + angDiff(p.a, q.a) * b, s: p.s + (q.s - p.s) * b });
    const P = { arms: to.arms.map((q, i) => blend(f.arms[i], q)), legs: to.legs.map((q, i) => blend(f.legs[i], q)),
      head: blend(f.head, to.head) };
    const a = f.a + angDiff(f.a, s.A) * b;
    if (s.over && k >= 0.5 && this.up) this.flip();
    this.pose(f.x, f.y, a, P, s.over && k > 0.2 && k < 0.8 ? 1 - 0.8 * Math.sin(Math.PI * (k - 0.2) / 0.6) : 1);
    this.shove(f.x, f.y, a);
    if (k >= 1) Object.assign(s, { phase: 'crawl', t: 0 });
  }

  // halfway through the roll: his back comes up, a puff of dust off the floor
  flip() {
    const t = this.torso.body.position, w = this.world;
    this.lie(false);
    w.particles.dust(t.x, t.y, 3, 6, '#6a6272', { speed: 20, size: 3, life: 1, alpha: 0.1 });
    w.sound('soft', t.x, t.y, 0.5);
  }

  // face up (the _up sprites: his front, his face) or face down (his back, _rag_torso_down, and the crown of his head)
  lie(up) {
    const s = up ? '_up' : '';
    this.up = up;
    this.torso.img = spriteOpt(`characters/${this.kind}_rag_torso${up ? '_up' : '_down'}`) || this.torso.img;
    if (this.head) this.head.img = spriteOpt(`characters/${this.kind}_rag_head${s}`) || this.head.img;
  }

  // he drags himself along on his forearms, pull after pull
  drag(s) {
    const { i, u } = pullAt(s.plan, s.t), p = s.plan.pulls[i];
    if (i !== s.pull) {
      // before each pull: is there floor for it?
      if (!p || !this.canPull(s, i)) { this.stop(s, i); this.last(s); return; }
      if (s.pull < 0) this.world.sound('whimper', s.from.x, s.from.y, 0.5, { pitch: 0.85 });
      s.pull = i;
    }
    const d = travelAt(s.plan, i, u), x = s.from.x + Math.cos(s.esc) * d, y = s.from.y + Math.sin(s.esc) * d;
    const P = crawlPose(s.plan, i, u, this.geom, s.look);
    this.pose(x, y, s.A + P.rock, P);
    // the hand comes down: a print of his blood under the fingers
    if (s.planted !== i && u >= p.t[0]) {
      s.planted = i;
      const h = this.handAt(this.limbs[p.arm]);
      if (!this.dry) this.world.decals.stampBlood(h.x, h.y, 1);
    }
    // posed by hand, it is never seen moving: the smear follows the torso here
    if (!this.dry) wipe(this.world, this.torso, x, y, 5);
    this.shove(x, y, s.A);
  }

  canPull(s, i) {
    const half = sh(this.torso.img) / 2, d = travelAt(s.plan, i, 0), f = s.from;
    return this.clear(f.x + Math.cos(s.esc) * d, f.y + Math.sin(s.esc) * d, s.esc, half, half + 10 + s.plan.pulls[i].d);
  }

  // he stops before pull i, where he lies
  stop(s, i) {
    const d = travelAt(s.plan, i, 0);
    Object.assign(s, { phase: 'last', t: 0, i, x: s.from.x + Math.cos(s.esc) * d, y: s.from.y + Math.sin(s.esc) * d });
  }

  // a last reach, the hand claws, the arm drops, the head goes down to one side, a shudder, a last whimper, still
  last(s) {
    const P = lastPose(s.plan, s.i, s.t, this.geom, s.look);
    this.pose(s.x, s.y, s.A + P.rock, P);
    if (s.t > 0.3 && !s.sighed) { s.sighed = true; this.world.sound('whimper', s.x, s.y, 0.4, { pitch: 0.8 }); }
    if (s.t >= CRAWL.last) this.release();
  }

  // a spasm or a curl, where he fell
  writhe(s) {
    const f = s.from, spasm = s.kind === 'spasm';
    const P = spasm ? spasmPose(s.plan, s.t, f, this.geom) : curlPose(s.plan, s.t, f, this.geom, this.up);
    this.limbs[0].top = this.limbs[1].top = P.top;
    this.pose(f.x, f.y, f.a + P.rock, P, P.roll);
    if (!s.cried && s.t > (spasm ? s.plan.kicks[0].t0 : s.plan.dur * 0.2)) {
      s.cried = true;
      if (spasm) this.world.sound('soft', f.x, f.y, 0.35); // a heel on the floor
      else this.world.sound('whimper', f.x, f.y, 0.45, { pitch: 0.75 });
    }
    if (s.t >= s.plan.dur) this.release();
  }

  // the throat cut: on his knees where he stood (s.hip), his length foreshortened (P.arch), then forward onto the
  // floor; every spurt of the artery thrown from his neck the way it points
  throat(s) {
    const P = throatPose(s.plan, s.t, this.geom, s.T), half = this.geom.half, a = s.A + P.rock;
    const c = local(s.hip.x, s.hip.y, s.A, 0, -half * P.arch);
    this.limbs[0].top = this.limbs[1].top = P.top;
    this.pose(c.x, c.y, a, P);
    s.down = P.down;
    // folded over what he was driven into, he stays out of its way for good (its body would shove him off it)
    const ghost = !P.down || !!s.T.stay;
    if (s.ghost !== ghost) this.ghost(s.ghost = ghost);
    if (P.jet > 0 && !this.dry) {
      const n = local(c.x, c.y, a, 0, -half * P.arch);
      // without a head, on his knees: thrown straight up, it comes down all round him
      if (s.kind === 'behead' && !P.down) for (let i = 0; i < 2; i++) squirt(this.world, n.x, n.y, rand(0, 6.28), P.jet * rand(0.12, 0.45), P.z);
      else squirt(this.world, n.x, n.y, a - Math.PI / 2 + P.jetA, P.jet, P.z);
    }
    if (s.t >= s.plan.dur && !s.T.stay) this.release();
  }

  // upright on his knees, his body's flat footprint must not catch on what stands round him (the bar he stood at:
  // it would shove him out of his script) until he is down on the floor
  ghost(on) {
    for (const p of this.parts) p.body.collisionFilter = { ...p.body.collisionFilter, mask: on ? 0 : MASK.CORPSE };
  }

  // where the hand of an arm is, as posed
  handAt(part) {
    const b = part.body, r = local(b.position.x, b.position.y, b.angle, part.root.x, part.root.y), d = (part.sx ?? 1) * part.len;
    return { x: r.x + Math.cos(b.angle) * d, y: r.y + Math.sin(b.angle) * d };
  }

  // whatever lies under the torso at (x, y), angle a (his own gun), is nudged out from under him: drawn above the
  // bodies, it would lie on top of him
  shove(x, y, a) {
    const half = sh(this.torso.img) / 2;
    for (const it of this.world.items) {
      if (it.dead || !it.body || Body.getSpeed(it.body) > 0.3) continue;
      const k = this.toLocal(x, y, a, it.body.position);
      if (Math.abs(k.x) > 10 || k.y < -half - 12 || k.y > half + 14) continue;
      impulse(it.body, a + (k.x < 0 ? Math.PI : 0), kgOf(it.body) * 1.5);
    }
  }

  // point pt in the frame of a torso at (x, y), angle a
  toLocal(x, y, a, pt) {
    const dx = pt.x - x, dy = pt.y - y, cs = Math.cos(a), sn = Math.sin(a);
    return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs };
  }

  // the torso at (x, y), angle a, every attached part on its joint (P: fx/CrawlPose.js, fx/DyingPose.js); roll =
  // squeeze across, P.arch = squeeze along (the joints come in with it)
  pose(x, y, a, P, roll = 1) {
    const along = P.arch ?? 1;
    const still = (b) => { Body.setVelocity(b, ZERO); Body.setAngularVelocity(b, 0); };
    const place = (part, q) => {
      seat(part.body, local(x, y, a, part.jt.x * roll, part.jt.y * along + (q.dy || 0)), part.root, a + q.a);
      still(part.body);
    };
    Body.setAngle(this.torso.body, a);
    Body.setPosition(this.torso.body, { x, y });
    still(this.torso.body);
    this.torso.sx = roll;
    this.torso.sy = along;
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
    this.dying.at = { x, y };
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
    const near = this.blockers(x, y, d1 + 12);
    return !pts.some((p) => Query.point(near, p).length);
  }

  // the script lets go (over, or he was shot, torn or shoved): physics has him where and as he lies;
  // still = stopped dead (else a shove keeps its momentum)
  release(still = true) {
    const s = this.dying;
    if (!s) return;
    this.dying = null;
    if (s.ghost) this.ghost(false);
    if (s.phase === 'fall') return;
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

  // where the planted weapon goes into him, and the way its handle leans (the sprite's grip end is its -x end)
  stuckAt() {
    const t = this.torso.body, p = local(t.position.x, t.position.y, t.angle, this.stuck.x, this.stuck.y);
    return { x: p.x, y: p.y, a: t.angle + this.stuck.a };
  }

  // standing in him: short, mostly its handle, its shadow on his clothes; outlined while it can be pulled out
  drawStuck(ctx) {
    const s = this.stuckAt(), k = this.stuck, o = { scale: BODY_SCALE * PLANTED.size, part: PLANTED.part };
    drawUpright(ctx, silhouette(k.img), s.x + 1.5, s.y + 1.5, s.a, PLANTED.len, { ...o, alpha: 0.3 });
    drawUpright(ctx, k.img, s.x, s.y, s.a, PLANTED.len, o);
    if (this.world.time - k.hot > 0.1) return;
    const len = sw(k.img) * PLANTED.part * PLANTED.len * o.scale, h = sh(k.img) * o.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + Math.sin(this.world.time * 10) * 0.2;
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 1;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    ctx.strokeRect(-len - 2, -h / 2 - 2, len + 4, h + 4);
    ctx.restore();
  }

  // pulled out of him: what it was (to go into a hand), a little blood with it
  pullStuck() {
    const s = this.stuckAt(), item = this.stuck.item;
    this.stuck = null;
    if (!this.dry) this.world.particles.blood(s.x, s.y, s.a + Math.PI, 0.6, 5, 90);
    return item;
  }

  // the part the blood seeps from: the head while it is on, else the torso (its pool forms at the neck)
  source() { return this.head?.attached ? this.head.body : this.torso.body; }

  // centre of the blood pool: where it started, or under the wound while the body still slides
  poolAt() { return this.poolPos || (this.head?.attached ? this.head.body.position : this.neckPos()); }

  bake() {
    const w = this.world;
    for (const part of this.order()) w.decals.bake(part.img, part.body.position.x, part.body.position.y, part.body.angle, 1, true);
    w.decals.paint?.((g) => { for (const part of [this.torso, this.head]) this.drawMarks(g, part); }, true);
    if (this.stuck) w.decals.paint?.((g) => this.drawStuck(g), true);
    for (const j of this.joints) Composite.remove(w.engine.world, j.c);
    for (const part of this.parts) w.removeBody(part.body);
    this.dead = true;
  }

  // the wounds a part carries, in its frame (the one drawPart draws it in: scaled about its root when it is)
  drawMarks(ctx, part) {
    const name = part === this.torso ? 'torso' : part === this.head ? 'head' : null;
    if (!name || !part?.attached || !this.marks.some((m) => m.part === name)) return;
    const b = part.body, o = part.root || ZERO, p = local(b.position.x, b.position.y, b.angle, o.x, o.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(b.angle);
    ctx.scale(part.sx ?? 1, part.sy ?? 1);
    ctx.translate(-o.x, -o.y);
    const grid = ((sw(part.img) / (part.img.k || 1)) % 2) / 2; // the part's pixel grid, off its centre or not
    for (const m of this.marks) if (m.part === name) drawMark(ctx, m, grid);
    ctx.restore();
  }

  // an arm raised over him (top) is drawn above the torso
  order() {
    const arms = this.limbs.filter((p) => p.name === 'arm');
    return [...this.limbs.filter((p) => p.name === 'leg'), ...arms.filter((p) => !p.top), this.torso, ...arms.filter((p) => p.top),
      ...(this.head ? [this.head] : [])];
  }

  draw(ctx) {
    for (const part of this.order()) {
      const b = part.body, draw = part.len && part.sx < 1 ? drawBent : drawPart;
      // a part raised off the floor (top) casts its shadow further
      draw(ctx, silhouette(part.img), part, part.top ? 3 : 1, 0.3, this.torso.body.position);
      draw(ctx, part.img, part, 0, 1, this.torso.body.position);
      this.drawMarks(ctx, part);
      // bloody stump at the root of a torn part
      if (!part.attached) stump(ctx, local(b.position.x, b.position.y, b.angle, part.root.x, part.root.y), 3);
    }
    if (this.stuck) this.drawStuck(ctx);
    if (this.headless) stump(ctx, this.neckPos(), 4);
  }
}

// a part at angle a with its root r (part-local) on the point j
function seat(b, j, r, a) {
  const cs = Math.cos(a), sn = Math.sin(a);
  Body.setAngle(b, a);
  Body.setPosition(b, { x: j.x - (r.x * cs - r.y * sn), y: j.y - (r.x * sn + r.y * cs) });
}

// a part as it lies, or scaled about its root (part.sx along it, part.sy across: the head lifted, rolling over)
function drawPart(ctx, img, part, off, alpha) {
  const b = part.body, sx = part.sx ?? 1, sy = part.sy ?? 1;
  if (sx === 1 && sy === 1) { drawSprite(ctx, img, b.position.x + off, b.position.y + off, b.angle, alpha); return; }
  const o = part.root || ZERO, p = local(b.position.x, b.position.y, b.angle, o.x, o.y);
  ctx.save();
  ctx.translate(p.x + off, p.y + off);
  ctx.rotate(b.angle);
  const k = img.k || 1; // a finer sprite: o is in world px
  ctx.scale(sx * k, sy * k);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(img, -o.x / k - img.width / 2, -o.y / k - img.height / 2);
  ctx.restore();
}

// a limb bent (part.sx < 1: its end that much nearer its root): its two halves drawn from the root to the knee or
// elbow, that comes up and out away from the body (from), and on to the shoe or hand, which keep their size
function drawBent(ctx, img, part, off, alpha, from) {
  const b = part.body, ang = b.angle, k = img.k || 1, wp = img.width, mp = Math.floor(wp / 2), hp = img.height;
  const w = wp * k, m = mp * k, h = hp * k; // the same in world px (a finer sprite)
  const R = local(b.position.x, b.position.y, ang, part.root.x, part.root.y);
  const p = m - 1, q = w - 1 - m, d = part.sx * part.len;
  const F = { x: R.x + Math.cos(ang) * d, y: R.y + Math.sin(ang) * d };
  // the joint where the halves meet, seen from above (the bend rises off the floor: its offset shows shorter)
  const along = (p * p - q * q + d * d) / (2 * d), rise = Math.sqrt(Math.max(0, p * p - along * along)) * 0.85;
  let nx = -Math.sin(ang), ny = Math.cos(ang);
  if (nx * (R.x + F.x - 2 * from.x) + ny * (R.y + F.y - 2 * from.y) < 0) { nx = -nx; ny = -ny; }
  const K = { x: R.x + Math.cos(ang) * along + nx * rise, y: R.y + Math.sin(ang) * along + ny * rise };
  const half = (P, Q, sx, n, x0, len) => { // sx, n: the slice of the sprite, in its own px
    ctx.save();
    ctx.translate(P.x + off, P.y + off);
    ctx.rotate(Math.atan2(Q.y - P.y, Q.x - P.x));
    ctx.scale(Math.hypot(Q.x - P.x, Q.y - P.y) / len, 1);
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    ctx.drawImage(img, sx, 0, n, hp, x0, -h / 2, n * k, h);
    ctx.restore();
  };
  half(R, K, 0, mp, -1, p);
  half(K, F, mp, wp - mp, 0, q);
}

// raw flesh where something was torn off: dark meat, a wet centre
function stump(ctx, p, s) {
  const x = Math.round(p.x - s / 2), y = Math.round(p.y - s / 2);
  ctx.fillStyle = PALETTE.blood[3];
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = PALETTE.blood[4];
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
}
