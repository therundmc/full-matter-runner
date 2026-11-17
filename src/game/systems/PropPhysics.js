// Loose furniture with its weight (data/physics.js). Each step:
//  - prePush (after the intentions, before the physics): every character walking into a loose prop pushes it with a
//    limited force (engine/physics/Push.js) and is held to the speed it really goes; a slide, a vault, a man knocked
//    flying are left to the physics (they are blows, not pushes);
//  - update (after it): what it leaves on the floor where it is dragged (faint scuffs from its feet on a hard floor,
//    a wiped smear out of a wet one) and the sound of it scraping or rolling along.
// DOM-free: it paints through world.decals.paint / smear.
import { PHYSICS, PLAYER } from '../Config.js';
import { MATERIALS, SURFACE } from '../data/materials.js';
import { LIQUIDS } from '../data/liquids.js';
import { PUSH, SCUFF, SCRAPE } from '../data/physics.js';
import { contactOf, push } from '../../engine/physics/Push.js';
import { kgOf } from '../../engine/physics/Body.js';
import { toMps } from '../../engine/physics/Units.js';
import { clamp } from '../../engine/math.js';

const { Body } = Matter;

// a prop the characters push and that marks the floor: loose, on the floor, not a vehicle
const loose = (p) => !p.dead && !p.isVehicle && !p.def?.hung && p.body && !p.body.isStatic && p.body.mu !== undefined;

// a character walking (not sliding, vaulting, flying, sitting, gone)
const walking = (c) => c.alive && c.body && !c.slide && !c.vaulting && !(c.knocked > 0) && !c.hidden && !c.slipped && !c.passage;

export default class PropPhysics {
  constructor(world) {
    this.world = world;
    this.trails = new Map(); // prop -> { feet: [{x, y}] last marked, d: px since, wet, left, t: next sound }
    this.cells = new Map();  // floor cell -> marks laid in it
    this.budget = SCUFF.budget;
    this.touching = new Map(); // character -> the prop bodies he leaned on last step (a new one is a bump)
  }

  // ---- pushing
  prePush(dt) {
    const w = this.world, props = w.props.filter(loose), was = this.touching;
    this.touching = new Map();
    if (!props.length) return;
    for (const c of w.chars) {
      if (!walking(c)) continue;
      const b = c.body, v = Body.getVelocity(b), sp = Math.hypot(v.x, v.y);
      if (sp < 0.05) continue;
      // where he will be at the end of this step, and what he runs into there
      const x = b.position.x + v.x, y = b.position.y + v.y, r = c.radius ?? PLAYER.radius, hits = [];
      for (const p of props) {
        const o = p.body.position;
        if (Math.abs(o.x - x) > PUSH.reach || Math.abs(o.y - y) > PUSH.reach) continue;
        const k = contactOf(x, y, r, p.body);
        if (k && v.x * k.nx + v.y * k.ny > 0) hits.push([p, k]);
      }
      if (!hits.length) continue;
      const before = was.get(c), now = new Set();
      this.touching.set(c, now);
      const force = (PHYSICS.pushForce * (PUSH.walk + (1 - PUSH.walk) * Math.min(1, sp / PLAYER.speed))) / hits.length;
      for (const [p, k] of hits) {
        const o = p.body, vn = v.x * k.nx + v.y * k.ny, ov = Body.getVelocity(o);
        now.add(o);
        // meeting it is a bump (sounds, a bin knocked over): the push is about to take that speed out of the contact
        if (!before?.has(o)) w.physics.bump(b, o, vn - ov.x * k.nx - ov.y * k.ny, k.x, k.y);
        const keep = push(o, k, vn, force, dt, o.mu * w.floorGrip(o.position.x, o.position.y, o));
        if (keep >= vn) continue;
        v.x += k.nx * (keep - vn); v.y += k.ny * (keep - vn);
        if (c.vel) { c.vel.x += k.nx * (keep - vn); c.vel.y += k.ny * (keep - vn); }
      }
      Body.setVelocity(b, v);
    }
  }

  // ---- what dragging it leaves and sounds like
  update(dt) {
    const w = this.world;
    this.budget = Math.min(SCUFF.budget, this.budget + SCUFF.budget * dt);
    for (const p of w.props) {
      if (!loose(p) || p.body.isSleeping) continue;
      const b = p.body, s = toMps(Body.getSpeed(b));
      let tr = this.trails.get(p);
      if (s < SCUFF.speed && s < SCRAPE.speed) { if (tr) tr.feet = null; continue; }
      if (b.flyUntil > w.time) continue;
      if (!tr) this.trails.set(p, tr = { feet: null, d: 0, wet: null, left: 0, t: 0 });
      this.sound(p, tr, s);
      if (s >= SCUFF.speed) this.trail(p, tr);
    }
    if (this.trails.size > 64) for (const p of this.trails.keys()) if (p.dead || !w.props.includes(p)) this.trails.delete(p);
  }

  sound(p, tr, s) {
    const w = this.world, b = p.body;
    if (w.time < tr.t) return;
    tr.t = w.time + SCRAPE.every;
    const name = b.roll !== undefined && this.rolling(b) ? SCRAPE.roll : SCRAPE.sounds[b.feet ?? b.material];
    if (!name) return;
    const vol = clamp(s / SCRAPE.full, 0.15, 1) * clamp(Math.sqrt(kgOf(b) / SCRAPE.heavyKg), 0.25, 1);
    w.sound(name, b.position.x, b.position.y, vol);
  }

  // a lying cylinder rolls when it goes across its axis more than along it
  rolling(b) {
    const v = Body.getVelocity(b), c = Math.cos(b.angle), s = Math.sin(b.angle);
    return Math.abs(-v.x * s + v.y * c) > Math.abs(v.x * c + v.y * s);
  }

  // its feet in the world: a box's corners, a round base's rim either side of its way
  feet(p) {
    const b = p.body, i = SCUFF.inset, o = b.position;
    if (b.circleRadius) {
      const v = Body.getVelocity(b), a = Math.atan2(v.y, v.x) + Math.PI / 2, r = b.circleRadius * 0.75;
      return [{ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r }, { x: o.x - Math.cos(a) * r, y: o.y - Math.sin(a) * r }];
    }
    return b.vertices.map((q) => {
      const dx = o.x - q.x, dy = o.y - q.y, l = Math.hypot(dx, dy) || 1;
      return { x: q.x + (dx / l) * i, y: q.y + (dy / l) * i };
    });
  }

  trail(p, tr) {
    const w = this.world, b = p.body, at = b.position;
    if (b.roll !== undefined && this.rolling(b)) { tr.feet = null; return; } // a can rolling leaves nothing
    const feet = this.feet(p);
    if (!tr.feet || tr.feet.length !== feet.length) { tr.feet = feet; tr.d = 0; return; }
    tr.d = Math.hypot(feet[0].x - tr.feet[0].x, feet[0].y - tr.feet[0].y);
    if (tr.d < SCUFF.step) return;
    const wet = w.liquids?.at(at.x, at.y);
    if (wet && LIQUIDS.kinds[wet.kind]?.alpha) { tr.wet = wet.kind; tr.left = SCUFF.wet.strokes; }
    else if (tr.left > 0) this.smear(tr, at, feet);
    else this.scuff(p, tr.feet, feet);
    tr.feet = feet;
  }

  // a wet base wiped along the dry floor: a streak of what it picked up, fading
  smear(tr, at, feet) {
    const k = LIQUIDS.kinds[tr.wet], a = Math.atan2(feet[0].y - tr.feet[0].y, feet[0].x - tr.feet[0].x);
    this.world.decals.smear?.(at.x, at.y, a, SCUFF.step + 2, k.color, k.alpha * SCUFF.wet.alpha * (tr.left / SCUFF.wet.strokes));
    tr.left--;
  }

  // faint thin streaks from each foot over the stretch just dragged
  scuff(p, from, to) {
    const w = this.world, b = p.body, kg = kgOf(b), mat = MATERIALS[b.feet ?? b.material];
    const look = SCUFF.surface[SURFACE[w.floorAt(b.position.x, b.position.y)]];
    if (!look || !mat?.scuffs || kg < SCUFF.kg || this.budget < 1) return;
    const [a0, a1] = SCUFF.alpha, alpha = look * (a0 + (a1 - a0) * clamp((kg - SCUFF.kg) / (SCUFF.heavyKg - SCUFF.kg), 0, 1));
    const lines = [];
    for (let i = 0; i < to.length; i++) {
      const mx = (from[i].x + to[i].x) / 2, my = (from[i].y + to[i].y) / 2;
      const cell = Math.floor(mx / SCUFF.cell) * 100003 + Math.floor(my / SCUFF.cell);
      const n = this.cells.get(cell) ?? 0;
      if (n >= SCUFF.cap) continue;
      this.cells.set(cell, n + 1);
      lines.push([from[i], to[i]]);
    }
    if (!lines.length) return;
    this.budget--;
    w.decals.paint?.((g) => {
      g.strokeStyle = SCUFF.color;
      g.globalAlpha = alpha;
      g.lineWidth = SCUFF.width;
      g.lineCap = 'butt';
      g.beginPath();
      for (const [f, t] of lines) { g.moveTo(f.x, f.y); g.lineTo(t.x, t.y); }
      g.stroke();
    });
  }
}
