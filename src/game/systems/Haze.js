// The smoke hanging under a ceiling (HAZE in data/atmosphere.js). A place of the level's soundscape whose kind has a
// density (the bar, the VIP room, the boss's office...) is filled with it: an even veil plus soft puffs drifting
// slowly round the room, turning. People running push the puffs about and set them turning, rounds drag them
// along their line, a blast throws them off; every shot fired in the room thickens it a little (gun smoke, fading
// in the long run), and once the house's power is cut it thins to almost nothing (no lamp left to show it).
// The smokers feed it: a thread of smoke curls off each cigarette, a breath is let out after each drag.
// DOM-free: positions and densities only; render/HazeArt.js lights it with the light map, so the dark stays clear.
import { TILE, BODY_SCALE } from '../Config.js';
import { HAZE } from '../data/atmosphere.js';
import { GESTURES, exhale } from '../ai/Pastimes.js';
import { seeded } from './Weather.js';

const { Body } = Matter;
const mix = (r, k) => r[0] + (r[1] - r[0]) * k;

// what a character is smoking right now: 'cig', 'cigar' or null
export function smoking(ch) {
  if (!ch.alive) return null;
  if (ch.pastime === 'smoke') return 'cig';
  const g = ch.gestureOn, item = g && GESTURES[g.g]?.item;
  return item === 'cig' || item === 'cigar' ? item : null;
}

// distance from (px, py) to the segment (ax, ay)-(bx, by), and which side of it the point is (+1 / -1)
function toSegment(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2));
  const dx = px - (ax + ex * u), dy = py - (ay + ey * u);
  return [Math.hypot(dx, dy), ex * (py - ay) - ey * (px - ax) >= 0 ? 1 : -1];
}

export default class Haze {
  constructor(world, level = {}, cfg = HAZE) {
    this.world = world;
    this.cfg = cfg;
    this.wisps = [];
    const R = this.rand = seeded(7331 + (level.name || '').length);
    this.zones = [];
    for (const [kind, c0, r0, c1, r1] of level.soundscape?.zones || []) {
      const base = cfg.zones[kind];
      if (!base) continue;
      const z = { kind, x0: c0 * TILE, y0: r0 * TILE, x1: (c1 + 1) * TILE, y1: (r1 + 1) * TILE, base, k: base, smoke: 0, puffs: [], extra: [] };
      z.cx = (z.x0 + z.x1) / 2; z.cy = (z.y0 + z.y1) / 2;
      const n = Math.max(2, Math.round(((c1 - c0 + 1) * (r1 - r0 + 1)) / cfg.puff.per));
      for (let i = 0; i < n; i++) z.puffs.push(this.puff(z, z.x0 + R() * (z.x1 - z.x0), z.y0 + R() * (z.y1 - z.y0)));
      this.zones.push(z);
    }
    if (!this.zones.length) return;
    world.events.on('shot', ({ shooter }) => shooter && this.gunsmoke(shooter.x, shooter.y));
    world.events.on('explosion', ({ x, y, radius }) => this.blast(x, y, radius));
  }

  puff(z, x, y, a = null) {
    const P = this.cfg.puff, R = this.rand;
    const spin = (R() - 0.5) * P.spin; // its own slow turn, which it settles back to once stirred
    return { x, y, hx: x, hy: y, vx: 0, vy: 0, r: mix(P.r, R()), rot: R() * 6.28, spin, spin0: spin, a: a ?? mix(P.alpha, R()), ph: R() * 100, shape: Math.floor(R() * 3) };
  }

  zoneAt(x, y) { return this.zones.find((z) => x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1) || null; }

  // a shot fired in a smoky room: a little more smoke in it, a puff at the muzzle
  gunsmoke(x, y) {
    const z = this.zoneAt(x, y), g = this.cfg.gunsmoke;
    if (!z) return;
    z.smoke = Math.min(g.max, z.smoke + g.add);
    if (z.extra.length < 12) z.extra.push({ ...this.puff(z, x, y, g.puff), life: 6, max: 6, r: 18 });
  }

  blast(x, y, radius) {
    const B = this.cfg.stir.blast;
    for (const z of this.zones) {
      for (const p of z.puffs.concat(z.extra)) {
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
        if (d > radius * 1.5) continue;
        const f = 1 - d / (radius * 1.5);
        p.vx += (dx / d) * B * f; p.vy += (dy / d) * B * f;
        p.spin += (this.rand() < 0.5 ? -1 : 1) * f * 2;
      }
    }
  }

  near(z) {
    const p = this.world.player, r = this.cfg.range;
    return p.x > z.x0 - r && p.x < z.x1 + r && p.y > z.y0 - r && p.y < z.y1 + r;
  }

  update(dt) {
    if (!this.zones.length) return;
    const w = this.world, c = this.cfg, t = w.time, P = c.puff, S = c.stir;
    const movers = [];
    for (const ch of w.chars) {
      if (!ch.alive) continue;
      const v = Body.getVelocity(ch.body);
      if (v.x * v.x + v.y * v.y > S.speed * S.speed) movers.push({ x: ch.x, y: ch.y, vx: v.x * 60, vy: v.y * 60 });
    }
    for (const z of this.zones) {
      // the power cut takes the haze down with the lamps; gun smoke fades slowly
      const dark = w.power && !w.power.on && w.power.inside(z.cx, z.cy);
      z.smoke = Math.max(0, z.smoke - c.gunsmoke.fade * dt);
      const want = z.base * (dark ? c.dark : 1) + z.smoke;
      z.k += (want - z.k) * Math.min(1, c.ease * dt);
      if (!this.near(z)) continue;
      for (const e of z.extra) e.life -= dt;
      if (z.extra.length) z.extra = z.extra.filter((e) => e.life > 0);
      for (const p of z.puffs) this.move(p, z, dt, t, movers, w.projectiles, P, S);
      for (const p of z.extra) this.move(p, z, dt, t, movers, w.projectiles, P, S);
    }
    this.smokers(dt, t);
  }

  move(p, z, dt, t, movers, rounds, P, S) {
    // a slow current of its own and a weak pull back home, so the room stays filled
    p.vx += (Math.cos(p.ph + t * 0.11) * P.drift + (p.hx - p.x) * P.home) * dt;
    p.vy += (Math.sin(p.ph * 1.3 + t * 0.09) * P.drift + (p.hy - p.y) * P.home) * dt;
    for (const m of movers) {
      const dx = p.x - m.x, dy = p.y - m.y, reach = S.r + p.r * 0.4, d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      const f = 1 - Math.sqrt(d2) / reach;
      p.vx += m.vx * S.push * f * dt * 4; p.vy += m.vy * S.push * f * dt * 4;
      p.spin += Math.sign(m.vx * dy - m.vy * dx || 1) * S.spin * f * dt;
    }
    for (const r of rounds) {
      if (r.dead) continue;
      const [d, side] = toSegment(p.x, p.y, r.x - r.vx * dt, r.y - r.vy * dt, r.x, r.y);
      const reach = p.r * 0.5 + S.round;
      if (d > reach) continue;
      const sp = Math.hypot(r.vx, r.vy) || 1, f = 1 - d / reach;
      p.vx += (r.vx / sp) * S.roundPush * f; p.vy += (r.vy / sp) * S.roundPush * f;
      p.spin += side * S.spin * f * 0.6;
    }
    const k = Math.exp(-P.drag * dt);
    p.vx *= k; p.vy *= k;
    p.spin += (p.spin0 - p.spin) * Math.min(1, 0.3 * dt);
    p.x = Math.max(z.x0, Math.min(z.x1, p.x + p.vx * dt));
    p.y = Math.max(z.y0, Math.min(z.y1, p.y + p.vy * dt));
    p.rot += p.spin * dt;
  }

  // the cigarettes in view: a thread of smoke off the ember, a breath let out after a drag
  smokers(dt, t) {
    const w = this.world, S = this.cfg.smoke, R = this.rand, pl = w.player, range = this.cfg.range;
    for (const ch of w.chars) {
      if (Math.abs(ch.x - pl.x) > range || Math.abs(ch.y - pl.y) > range) continue;
      const item = smoking(ch);
      if (!item) { ch.smokeT = 0; continue; }
      const h = ch.busyHands?.(), a = ch.angle ?? 0, c = Math.cos(a), s = Math.sin(a);
      const lx = h?.hr ? h.hr.x + 3 : 7, ly = h?.hr ? h.hr.y - 1 : 0;
      const ex = ch.x + (lx * c - ly * s) * BODY_SCALE, ey = ch.y + (lx * s + ly * c) * BODY_SCALE;
      if ((ch.smokeT = (ch.smokeT || 0) - dt) <= 0) {
        ch.smokeT = S.every * (item === 'cigar' ? 0.7 : 1);
        this.wisp(ex, ey, 0, -mix(S.rise, R()), mix(S.size, R()), mix(S.life, R()), S.alpha);
      }
      // the breath: when the exhale of a drag starts, a few puffs out of the mouth, ahead of the face
      const e = item === 'cig' ? exhale(t, ch.seed) : -1;
      if (e >= 0 && !(ch.exhaled >= 0)) {
        const X = S.exhale, mx = ch.x + c * 6 * BODY_SCALE, my = ch.y + s * 6 * BODY_SCALE;
        for (let i = 0; i < X.puffs; i++) {
          const sp = X.speed * (0.5 + R() * 0.7), b = a + (R() - 0.5) * 0.7;
          this.wisp(mx, my, Math.cos(b) * sp, Math.sin(b) * sp, X.size * (0.6 + R() * 0.6), X.life * (0.7 + R() * 0.5), X.alpha);
        }
        const z = this.zoneAt(ch.x, ch.y);
        if (z) z.smoke = Math.min(this.cfg.gunsmoke.max, z.smoke + 0.004);
      }
      ch.exhaled = e;
    }
    for (const p of this.wisps) {
      p.life -= dt;
      p.ph += dt;
      const k = Math.exp(-1.2 * dt);
      p.vx = p.vx * k + Math.sin(p.ph * 1.7 + p.seed) * S.sway * dt;
      p.vy *= k;
      p.vy -= 1.5 * dt; // it keeps climbing
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += S.grow * dt;
    }
    if (this.wisps.length) this.wisps = this.wisps.filter((p) => p.life > 0);
  }

  wisp(x, y, vx, vy, size, life, alpha) {
    if (this.wisps.length >= this.cfg.smoke.max) return;
    this.wisps.push({ x, y, vx, vy, size, life, max: life, alpha, ph: 0, seed: this.rand() * 10 });
  }
}
