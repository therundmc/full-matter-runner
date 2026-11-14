// The balls on a pool table really roll. Each table keeps its own set, in table-local px (the sprite's centre at
// 0,0): they roll, slow down, bounce off the cushions and off each other with a clack, drop into the pockets.
// A round or a blow in the table ('propHit') throws them about, a body bumping into it ('impact') shakes them, and
// the guard at his game strikes the cue ball ('poolStroke'). Once the table gives way its recipe spills balls of
// its own (data/destruction.js) and the set is dropped. DOM-free: drawn by render/PropLife.js.
import { POOL } from '../Config.js';
import { rand, clamp } from '../../engine/math.js';

const NEAR = 90;   // px from a table within which a stroke is played on it
const SHAKE = 1.5; // px/step under which a bump does not move them

export default class PoolBalls {
  constructor(world, cfg = POOL) {
    this.world = world;
    this.cfg = cfg;
    this.sets = new Map(); // table -> its balls
    this.clackT = 0;
    const ev = world.events;
    ev.on('propHit', ({ prop, x, y, dirA, kind }) => {
      if (prop.type === 'pool_table') this.jolt(prop, x, y, dirA, cfg.jolt * (kind === 'blast' ? 2 : 1));
    });
    ev.on('impact', ({ a, b, speed, x, y }) => {
      const table = a.entity?.type === 'pool_table' ? a.entity : b.entity?.type === 'pool_table' ? b.entity : null;
      if (!table || speed < SHAKE) return;
      const o = (a.entity === table ? b : a).position;
      this.jolt(table, x, y, Math.atan2(table.y - o.y, table.x - o.x), Math.min(cfg.jolt, speed * cfg.bump));
    });
    ev.on('poolStroke', ({ x, y }) => this.stroke(x, y));
  }

  // the set of a table, racked the first time it is asked for
  balls(table) {
    let set = this.sets.get(table);
    if (!set) this.sets.set(table, set = this.rack());
    return set;
  }

  rack() {
    return this.cfg.rack.map(([x, y, color, stripe]) => ({ x, y, vx: 0, vy: 0, color, stripe: !!stripe, in: false }));
  }

  // every ball is thrown along dirA (world), the ones near the blow hardest
  jolt(table, x, y, dirA, v) {
    if (table.dead) return;
    const t = -table.body.angle, c = Math.cos(t), s = Math.sin(t), dx = x - table.x, dy = y - table.y;
    const ax = dx * c - dy * s, ay = dx * s + dy * c, a = dirA + t;
    for (const b of this.balls(table)) {
      if (b.in) continue;
      const k = clamp(1.3 - Math.hypot(b.x - ax, b.y - ay) / 50, 0.3, 1);
      b.vx += (Math.cos(a) + rand(-0.5, 0.5)) * v * k;
      b.vy += (Math.sin(a) + rand(-0.5, 0.5)) * v * k;
    }
  }

  // the player at (x, y) shoots the cue ball at one of the others; a table that is nearly cleared is racked again
  stroke(x, y) {
    const table = this.world.props.find((p) => p.type === 'pool_table' && !p.dead && Math.hypot(p.x - x, p.y - y) < NEAR);
    if (!table) return;
    let set = this.balls(table);
    if (set.some((b) => b.vx || b.vy)) return; // still rolling
    if (set.filter((b) => !b.in).length < 4) this.sets.set(table, set = this.rack());
    const cue = set[0], [x0, y0] = this.cfg.rack[0];
    if (cue.in) Object.assign(cue, { x: x0, y: y0, in: false });
    const left = set.filter((b) => b !== cue && !b.in), aim = left[Math.floor(Math.random() * left.length)];
    const a = Math.atan2(aim.y - cue.y, aim.x - cue.x) + rand(-0.07, 0.07), v = rand(...this.cfg.stroke);
    cue.vx = Math.cos(a) * v;
    cue.vy = Math.sin(a) * v;
  }

  update(dt) {
    this.clackT -= dt;
    for (const [table, set] of this.sets) {
      if (table.dead) { this.sets.delete(table); continue; }
      let top = 0;
      for (const b of set) if (!b.in) top = Math.max(top, Math.hypot(b.vx, b.vy));
      if (!top) continue;
      // never more than a pixel a step: a ball is three across
      const n = clamp(Math.ceil(top * dt), 1, 8);
      for (let i = 0; i < n; i++) this.step(table, set, dt / n);
    }
  }

  step(table, set, h) {
    const c = this.cfg, lx = c.half[0] - c.r, ly = c.half[1] - c.r, slow = Math.exp(-c.drag * h);
    for (const b of set) {
      if (b.in || !(b.vx || b.vy)) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.vx *= slow;
      b.vy *= slow;
      if (Math.hypot(b.vx, b.vy) < c.stop) b.vx = b.vy = 0;
      if (c.pockets.some(([px, py]) => Math.hypot(b.x - px, b.y - py) < c.mouth)) {
        b.in = true;
        b.vx = b.vy = 0;
        this.sound('pocket', table, b, 0.7);
        continue;
      }
      if (b.x > lx) { b.x = lx; if (b.vx > 0) b.vx *= -c.cushion; }
      if (b.x < -lx) { b.x = -lx; if (b.vx < 0) b.vx *= -c.cushion; }
      if (b.y > ly) { b.y = ly; if (b.vy > 0) b.vy *= -c.cushion; }
      if (b.y < -ly) { b.y = -ly; if (b.vy < 0) b.vy *= -c.cushion; }
    }
    // two balls that touch swap what they carry along the line between them (same weight)
    for (let i = 0; i < set.length; i++) {
      const p = set[i];
      if (p.in) continue;
      for (let j = i + 1; j < set.length; j++) {
        const q = set[j];
        if (q.in) continue;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d >= c.r * 2) continue;
        const nx = d ? dx / d : 1, ny = d ? dy / d : 0, push = (c.r * 2 - d) / 2;
        p.x -= nx * push; p.y -= ny * push;
        q.x += nx * push; q.y += ny * push;
        const rel = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
        if (rel >= 0) continue; // already parting
        const k = -rel * 0.97;
        p.vx -= nx * k; p.vy -= ny * k;
        q.vx += nx * k; q.vy += ny * k;
        if (-rel > c.clack && this.clackT <= 0) {
          this.clackT = 0.05;
          this.sound('clack', table, p, clamp(-rel / 110, 0.25, 1));
        }
      }
    }
  }

  sound(name, table, b, vol) {
    const a = table.body.angle, c = Math.cos(a), s = Math.sin(a);
    this.world.sound(name, table.x + b.x * c - b.y * s, table.y + b.x * s + b.y * c, vol);
  }
}
