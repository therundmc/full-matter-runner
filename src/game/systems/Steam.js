// Steam in the street (STEAM). Manhole covers (level `street.manholes`: [[col, row]]) breathe it in slow puffs, a
// wall vent (prop `steam: 'vent'`) blows a thin stream of it while it lives, and a steam pipe (prop
// `steam: 'leak'`) that takes a round whistles a white jet out of the hole for a few seconds. DOM-free: all of it
// is dust particles, the whistle is the gas hiss, higher. Between two breaths a manhole still seeps a thread of it,
// the rain thickens it (`wet`, the cold drops on a warm cover), and a car driving through tears it along in its
// wake.
import { TILE, STEAM } from '../Config.js';
import { rand } from '../../engine/math.js';

const { Body } = Matter;

const PIERCING = new Set(['bullet', 'rifle', 'pellet', 'shrapnel']);

export default class Steam {
  constructor(world, manholes = [], cfg = STEAM, rain = 0) {
    this.world = world;
    this.cfg = cfg;
    this.thick = 1 + rain * cfg.wet;
    // t: s to the next breath, left: s of the breath going on
    this.holes = manholes.map(([c, r]) => ({ x: c * TILE, y: r * TILE, t: rand(0, cfg.manhole.rest[1]), left: 0, puff: 0 }));
    this.vents = null; // their props, looked up at the first step (props are built after the systems)
    this.leaks = [];
    world.events.on('propHit', ({ prop, x, y, kind }) => {
      if (prop.def.steam === 'leak' && PIERCING.has(kind)) this.leak(prop, x, y);
    });
  }

  // a hole in a pipe at (x, y): the jet goes out of the wall the pipe runs along (its local +y)
  leak(prop, x, y) {
    if ((prop.pierced || 0) >= this.cfg.leak.max) return;
    prop.pierced = (prop.pierced || 0) + 1;
    const a = prop.body.angle + Math.PI / 2;
    this.leaks.push({ x, y, dx: Math.cos(a), dy: Math.sin(a), t: 0, puff: 0, hiss: 0 });
  }

  update(dt) {
    const w = this.world, c = this.cfg, P = w.particles, [wx, wy] = c.drift;
    this.vents ||= w.props.filter((p) => p.def.steam === 'vent').map((prop) => ({ prop, puff: 0 }));
    const near = (x, y) => Math.abs(x - w.player.x) < c.range && Math.abs(y - w.player.y) < c.range;

    const m = c.manhole, k = this.thick;
    for (const h of this.holes) {
      if ((h.t -= dt) <= 0) { h.left = m.breath; h.t = m.breath + rand(...m.rest); }
      h.left -= dt;
      if ((h.puff -= dt) > 0 || !near(h.x, h.y)) continue;
      const s = h.left > 0 ? m : m.seep; // a breath, or the seep between two
      h.puff = s.every;
      P.dust(h.x + rand(-4, 4), h.y + rand(-4, 4), 1, 2, c.color, { speed: 6, size: s.size * k, life: s.life, alpha: s.alpha * k, vx: wx, vy: wy, tag: 'steam' });
    }

    const v = c.vent;
    for (const o of this.vents) {
      const p = o.prop;
      if (p.dead || (o.puff -= dt) > 0 || !near(p.x, p.y)) continue;
      o.puff = v.every;
      const a = p.body.angle + Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
      P.dust(p.x + dx * 4, p.y + dy * 4, 1, 2, c.color, { speed: 8, size: v.size, life: v.life, alpha: v.alpha, vx: dx * v.speed + wx, vy: dy * v.speed + wy, tag: 'steam' });
    }

    const L = c.leak;
    for (const k of this.leaks) {
      k.t += dt;
      const f = 1 - k.t / L.dur; // the pressure falls
      if ((k.puff -= dt) <= 0) {
        k.puff = L.every;
        P.dust(k.x + k.dx * 3, k.y + k.dy * 3, 1, 1, c.color, { speed: 16, size: 4, life: 1.6, alpha: 0.55, vx: k.dx * L.speed * f, vy: k.dy * L.speed * f });
      }
      if ((k.hiss -= dt) <= 0) {
        k.hiss = 0.25;
        w.sound('hiss', k.x, k.y, 0.6 * f, { pitch: 1.3 });
      }
    }
    if (this.leaks.length) this.leaks = this.leaks.filter((k) => k.t < L.dur);
    this.wake(dt);
  }

  // the cars going by near the player drag the steam they drive through along, and throw it aside
  wake(dt) {
    const w = this.world, c = this.cfg.wake, cars = [];
    for (const p of w.props) {
      if (!p.moving || p.dead || Math.abs(p.x - w.player.x) > this.cfg.range || Math.abs(p.y - w.player.y) > this.cfg.range) continue;
      const v = Body.getVelocity(p.body);
      if (v.x * v.x + v.y * v.y > 1) cars.push({ x: p.x, y: p.y, vx: v.x * 60, vy: v.y * 60 });
    }
    if (!cars.length) return;
    const pull = Math.min(1, dt * 5);
    for (const q of w.particles.list) {
      if (q.tag !== 'steam') continue;
      for (const car of cars) {
        const dx = q.x - car.x, dy = q.y - car.y, d = Math.hypot(dx, dy) || 1;
        if (d > c.r) continue;
        q.vx += (car.vx * c.pull + (dx / d) * c.aside - q.vx) * pull;
        q.vy += (car.vy * c.pull + (dy / d) * c.aside - q.vy) * pull;
      }
    }
  }
}
