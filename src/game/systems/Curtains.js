// The curtains hung across doorways (props with def `curtain`, CURTAIN in data/cloth.js): each one a cloth
// (engine/physics/Cloth.js) on the prop's rod, pushed by whoever goes through it (people, the dead, debris), nudged
// by the rounds that pass ('round'), thrown by blasts ('explosion'). It sleeps once still with nobody near and wakes
// at the first touch, so a curtain nobody goes near costs nothing. What it hides from the guards follows the cloth
// (blocks(), World.sightLine): parted wide enough, a man is seen through the gap. Placeholder sounds (brush, rings,
// whoosh). DOM-free; drawn by render/ClothArt.js.
import Cloth from '../../engine/physics/Cloth.js';
import { CURTAIN } from '../data/cloth.js';
import { clamp } from '../../engine/math.js';

const { Body } = Matter;

export default class Curtains {
  constructor(world, cfg = CURTAIN) {
    this.world = world;
    this.cfg = cfg;
    this.list = [];  // { prop, cloth, x, y, ux, uy (along the rod), awake, still, box, heard }
    this.seen = -1;  // how many props there were at the last look (a sandbox may add one)
    world.events.on('round', (e) => this.round(e));
    world.events.on('explosion', (e) => this.blast(e));
    this.scan();
  }

  scan() {
    const props = this.world.props;
    if (props.length === this.seen) return;
    this.seen = props.length;
    for (const p of props) if (p.def.curtain && !p.dead && !this.list.some((c) => c.prop === p)) this.attach(p);
  }

  attach(prop) {
    const cloth = new Cloth({ ...this.cfg.cloth, len: prop.def.h });
    const c = { prop, cloth, x: 0, y: 0, ux: 0, uy: 1, awake: false, still: 0, box: null, heard: { brush: -9, rings: -9, whoosh: -9 } };
    this.place(c);
    c.box = this.box(c);
    this.list.push(c);
    return c;
  }

  // its frame from the prop: (x, y) the rod's middle, u along the rod (the prop's length, local y)
  place(c) {
    const p = c.prop, a = p.body.angle;
    c.x = p.x; c.y = p.y; c.ux = -Math.sin(a); c.uy = Math.cos(a);
  }

  // world -> its frame (s along the rod, n out of the cloth: u turned a quarter back)
  local(c, x, y) {
    const dx = x - c.x, dy = y - c.y;
    return { s: dx * c.ux + dy * c.uy, n: dx * c.uy - dy * c.ux };
  }

  // the local box the cloth's points lie in
  box(c) {
    const { s, n } = c.cloth;
    let s0 = Infinity, s1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    for (let i = 0; i < s.length; i++) {
      if (s[i] < s0) s0 = s[i]; if (s[i] > s1) s1 = s[i];
      if (n[i] < n0) n0 = n[i]; if (n[i] > n1) n1 = n[i];
    }
    return { s0, s1, n0, n1 };
  }

  // what may push it, in its frame: people, the dead (each part of a ragdoll), debris on the floor
  colliders(c) {
    const w = this.world, cfg = this.cfg, out = [], far = c.prop.def.h / 2 + cfg.cloth.drop + cfg.person.r;
    const add = (body, r, top, person) => {
      const p = body.position, q = this.local(c, p.x, p.y);
      if (Math.abs(q.s) > far || Math.abs(q.n) > far) return;
      const v = Body.getVelocity(body), vx = v.x * 60, vy = v.y * 60;
      q.vs = vx * c.ux + vy * c.uy; q.vn = vx * c.uy - vy * c.ux;
      q.r = r; q.top = top; q.speed = Math.hypot(vx, vy); q.person = person;
      out.push(q);
    };
    for (const m of [w.player, ...w.enemies, ...(w.civilians || [])]) {
      if (m && m.alive && !m.hidden && m.body) add(m.body, cfg.person.r, cfg.person.top, true);
    }
    for (const d of w.corpses) {
      if (d.dead) continue;
      if (d.parts) for (const pt of d.parts) add(pt.body, halfSize(pt.body), cfg.body.top, false);
      else if (d.body) add(d.body, halfSize(d.body), cfg.body.top, false);
    }
    for (const d of w.debris) {
      if (!d.dead && d.body && d.size >= cfg.debris.min) add(d.body, d.size / 2, (d.z || 0) + cfg.debris.top, false);
    }
    return out;
  }

  update(dt) {
    this.scan();
    this.list = this.list.filter((c) => !c.prop.dead);
    const cfg = this.cfg;
    for (const c of this.list) {
      this.place(c);
      const cols = this.colliders(c);
      if (!c.awake) {
        const b = c.box, t = cfg.cloth.thick;
        if (!cols.some((q) => q.s > b.s0 - q.r && q.s < b.s1 + q.r && q.n > b.n0 - q.r - t && q.n < b.n1 + q.r + t)) continue;
        c.awake = true;
        c.still = 0;
      }
      c.cloth.step(dt, cols);
      this.hear(c);
      // asleep once still, with nobody about and nothing moving near it
      const half = c.prop.def.h / 2, R = cfg.reach;
      const near = cols.some((q) => Math.abs(q.s) < half + R && Math.abs(q.n) < R && (q.person || q.speed > 10));
      if (near || c.cloth.energy() > cfg.still) c.still = 0;
      else if ((c.still += dt) > cfg.nap) { c.awake = false; c.box = this.box(c); }
    }
  }

  // placeholder sounds: brushed going in, the rings running along the rod, the whoosh of something thrown through
  hear(c) {
    const w = this.world, S = this.cfg.sound, t = w.time, cl = c.cloth, q = cl.touched, h = cl.cfg.sub;
    const play = (k, vol) => {
      if (t - c.heard[k] < S.gap) return;
      c.heard[k] = t;
      w.sound(S[k], c.x, c.y, vol);
    };
    if (q && q.speed > 30) play('brush', clamp(q.speed / 250, 0.25, 1));
    if (q && q.speed > S.fast) play('whoosh', clamp(q.speed / 600, 0.4, 1));
    let ring = 0;
    for (let i = 0; i < cl.C; i++) ring = Math.max(ring, Math.abs(cl.s[i] - cl.ps[i]) / h);
    if (ring > S.ringV) play('rings', clamp(ring / 80, 0.2, 0.8));
  }

  // a round passing through: the cloth where it crossed the rod's line is flicked along
  round(e) {
    const R = this.cfg.round;
    for (const c of this.list) {
      const a = this.local(c, e.x0, e.y0), b = this.local(c, e.x1, e.y1);
      if ((a.n > 0) === (b.n > 0)) continue;
      const k = a.n / (a.n - b.n), s = a.s + (b.s - a.s) * k;
      if (Math.abs(s) > c.prop.def.h / 2) continue;
      const len = Math.hypot(b.s - a.s, b.n - a.n) || 1;
      c.cloth.push(s, 0, ((b.s - a.s) / len) * R.v, ((b.n - a.n) / len) * R.v, R.r + this.cfg.cloth.fold);
      c.awake = true; c.still = 0;
    }
  }

  // a blast throws the whole cloth away from it, harder the closer
  blast(e) {
    const B = this.cfg.blast;
    for (const c of this.list) {
      const q = this.local(c, e.x, e.y), d = Math.hypot(q.s, q.n), reach = e.radius * B.reach;
      if (d >= reach) continue;
      const v = B.v * (1 - d / reach), dd = d || 1;
      c.cloth.push(0, 0, (-q.s / dd) * v, (-q.n / dd) * v, Infinity);
      c.awake = true; c.still = 0;
    }
  }

  // does a curtain hide the line from (x0, y0) to (x1, y1)?
  blocks(x0, y0, x1, y1) {
    for (const c of this.list) {
      const a = this.local(c, x0, y0), b = this.local(c, x1, y1), lim = c.cloth.cfg.drop, half = c.prop.def.h / 2 + lim;
      if ((a.n > lim && b.n > lim) || (a.n < -lim && b.n < -lim)) continue;
      if ((a.s > half && b.s > half) || (a.s < -half && b.s < -half)) continue;
      if (c.cloth.blocks(a.s, a.n, b.s, b.n)) return true;
    }
    return false;
  }
}

// half the width of a body's bounds: the radius it pushes with
const halfSize = (b) => Math.min(9, Math.max(2, (b.bounds.max.x - b.bounds.min.x + b.bounds.max.y - b.bounds.min.y) / 4));
