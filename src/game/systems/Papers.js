// Loose sheets of paper on the pavement (level `street.papers`: [[col0, row0, col1, row1, n]], n sheets dropped at
// random in each inclusive tile rectangle). They have no body: a gust of wind now and then sends them tumbling
// along the street, a car going by drags them in its wake, someone running through them kicks them aside, a wall
// stops them. DOM-free and silent; drawn by render/StreetArt.js.
import { TILE, PAPERS } from '../Config.js';
import { rand, chance } from '../../engine/math.js';

const { Body } = Matter;

export default class Papers {
  constructor(world, zones = [], cfg = PAPERS) {
    this.world = world;
    this.cfg = cfg;
    this.list = [];
    for (const [c0, r0, c1, r1, n] of zones) {
      for (let i = 0; i < n; i++) {
        // light: how easily the wind takes it; rot: which way up it lies (its shape turns as it tumbles)
        this.list.push({ x: rand(c0, c1 + 1) * TILE, y: rand(r0, r1 + 1) * TILE, vx: 0, vy: 0, rot: rand(0, 8), light: rand(0.5, 1.2), tint: i % 3 });
      }
    }
    this.gust = null;              // { dx, dy, f, t }: the one blowing now
    this.next = rand(...cfg.gust); // s to the next one
  }

  update(dt) {
    if (!this.list.length) return;
    const w = this.world, c = this.cfg, map = w.map;
    if (this.gust && (this.gust.t -= dt) <= 0) this.gust = null;
    if ((this.next -= dt) <= 0) {
      // along the street, one way or the other
      const a = (chance(0.5) ? 0 : Math.PI) + rand(-0.5, 0.5);
      this.gust = { dx: Math.cos(a), dy: Math.sin(a), f: rand(...c.force), t: c.blow };
      w.events.emit('gust', this.gust); // heard (systems/Ambience.js)
      this.next = rand(...c.gust);
    }
    const cars = [];
    for (const p of w.props) {
      if (!p.moving || p.dead) continue;
      const v = Body.getVelocity(p.body);
      if (Math.hypot(v.x, v.y) > c.carFast) cars.push({ x: p.x, y: p.y, vx: v.x * 60, vy: v.y * 60 });
    }
    const runners = [w.player, ...w.enemies, ...w.civilians].filter((m) => m.alive && Body.getSpeed(m.body) > c.runFast);
    const g = this.gust, pull = Math.min(1, dt * 6);
    const stops = (x, y) => { const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE); return map.isSolid(cx, cy) || map.isBlocked(cx, cy); };

    for (const s of this.list) {
      if (g) { s.vx += g.dx * g.f * s.light * dt; s.vy += g.dy * g.f * s.light * dt; }
      for (const car of cars) {
        const dx = s.x - car.x, dy = s.y - car.y, d = Math.hypot(dx, dy) || 1;
        if (d > c.wake) continue;
        // dragged along, and thrown aside
        s.vx += (car.vx * c.pull + (dx / d) * c.aside - s.vx) * pull;
        s.vy += (car.vy * c.pull + (dy / d) * c.aside - s.vy) * pull;
      }
      for (const m of runners) {
        const dx = s.x - m.x, dy = s.y - m.y, d = Math.hypot(dx, dy) || 1;
        if (d < c.kick) { s.vx = (dx / d) * c.kickV; s.vy = (dy / d) * c.kickV; }
      }
      const v = Math.hypot(s.vx, s.vy);
      if (v < 0.5) { s.vx = s.vy = 0; continue; }
      const f = Math.exp(-c.friction * dt);
      s.vx *= f;
      s.vy *= f;
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      if (stops(nx, s.y)) s.vx = 0; else s.x = nx;
      if (stops(s.x, ny)) s.vy = 0; else s.y = ny;
      s.rot += v * dt * c.tumble;
    }
  }
}
