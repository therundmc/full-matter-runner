// Small things lying loose on a floor (LITTER in data/litter.js): the banknotes thrown at the dancer, a boa's
// feathers, a flute knocked over, corks, a garter, an ashtray. Laid by the level (`litter`: [kind, col, row, deg,
// look]); the bills knocked off the furniture land among them (Clutter.knock -> drop()). No body of their own:
//  - someone running through them kicks them along (the light ones fly up), someone walking scuffs them a little;
//  - a round passing close lifts the light ones along its way ('round'), the blast at a muzzle blows them ('shot'),
//    an explosion throws everything ('explosion'), a curtain swinging over them fans them (systems/Curtains.js);
//  - a flute on the floor that a round goes straight through bursts.
// Lifted, a light thing floats down swaying and turning over, then slides to a stop. Bounded (LITTER_AIR.max) and
// cheap: only what moves is stepped, and nothing is looked at unless something comes within the box they lie in.
// DOM-free; drawn by render/ClutterArt.js.
import { LITTER, LITTER_AIR } from '../data/litter.js';
import { LIQUIDS } from '../data/liquids.js';
import { TILE } from '../Config.js';
import { rand, chance, clamp } from '../../engine/math.js';

const { Body } = Matter;
const FLUTTER = 'cashFlutter'; // a placeholder (assets/sound/PLACEHOLDERS.md)

export default class Litter {
  constructor(world, laid = [], kinds = LITTER, cfg = LITTER_AIR) {
    this.world = world;
    this.kinds = kinds;
    this.cfg = cfg;
    this.list = [];   // { kind, def, sprite, x, y, a, z, vx, vy, vz, spin, ph, moving, kicked, scuffed (when), dead }
    this.moving = 0;  // how many of them move
    this.box = null;  // { x0, y0, x1, y1 }: round every one of them (it only grows)
    this.dirty = false; // some were shot to pieces: let go of them at the next step
    for (const [kind, col, row, deg = 0, look = 0] of laid) this.add(kind, col * TILE, row * TILE, (deg * Math.PI) / 180, look);
    const ev = world.events;
    ev.on('round', (e) => this.round(e));
    ev.on('shot', (e) => this.muzzle(e));
    ev.on('explosion', (e) => this.blast(e));
  }

  // a piece lying at (x, y) turned a; null when there are enough of them already
  add(kind, x, y, a = 0, look = 0) {
    const def = this.kinds[kind];
    if (!def) throw new Error('unknown litter ' + kind);
    if (this.list.length >= this.cfg.max) return null;
    const p = { kind, def, sprite: def.sprites[look % def.sprites.length], x, y, a, z: 0, vx: 0, vy: 0, vz: 0, spin: 0,
      ph: rand(0, 6.28), moving: false, kicked: -9, scuffed: -9, dead: false };
    this.list.push(p);
    this.grow(x, y);
    return p;
  }

  grow(x, y) {
    const b = this.box;
    if (!b) { this.box = { x0: x, y0: y, x1: x, y1: y }; return; }
    if (x < b.x0) b.x0 = x; else if (x > b.x1) b.x1 = x;
    if (y < b.y0) b.y0 = y; else if (y > b.y1) b.y1 = y;
  }

  // is (x, y) within r of the box they lie in?
  near(x, y, r) {
    const b = this.box;
    return !!b && x > b.x0 - r && x < b.x1 + r && y > b.y0 - r && y < b.y1 + r;
  }

  // n of `kind` fallen off something at (x, y) z px up, thrown along a at up to v px/s: how many there was room for
  drop(kind, x, y, n, a, v, z = 7) {
    let k = 0;
    for (; k < n; k++) {
      const p = this.add(kind, x + rand(-2, 2), y + rand(-2, 2), rand(0, 6.28), Math.floor(rand(0, 3)));
      if (!p) break;
      p.z = z * rand(0.7, 1.2);
      this.fling(p, a + rand(-0.9, 0.9), v * rand(0.3, 1), 0.6);
    }
    return k;
  }

  // set it going along a at v px/s; lift: share of its own lift it is thrown up with (the light ones)
  fling(p, a, v, lift = 0) {
    const d = p.def;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v;
    if (d.flutter && lift > 0) {
      p.vz = Math.max(p.vz, rand(...d.lift) * lift);
      p.spin = rand(-7, 7);
    } else p.spin = rand(-5, 5) * clamp(v / 80, 0.2, 1.5);
    if (!p.moving) { p.moving = true; this.moving++; }
  }

  // the flutter of bills heard once for a handful of them
  hear(x, y, n) {
    if (n) this.world.sound(FLUTTER, x, y, clamp(0.2 + n * 0.06, 0.2, 0.6));
  }

  // a round's way over one step: the light things close to it are lifted along it, a flute straight in it bursts, a
  // cork or an ashtray in its way is knocked
  round({ x0, y0, x1, y1 }) {
    const c = this.cfg, R = c.round + 3, b = this.box;
    if (!b || Math.max(x0, x1) < b.x0 - R || Math.min(x0, x1) > b.x1 + R || Math.max(y0, y1) < b.y0 - R || Math.min(y0, y1) > b.y1 + R) return;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, a = Math.atan2(dy, dx);
    let n = 0;
    for (const p of this.list) {
      if (p.dead) continue;
      const t = clamp(((p.x - x0) * dx + (p.y - y0) * dy) / L2, 0, 1), ex = p.x - (x0 + dx * t), ey = p.y - (y0 + dy * t);
      const d = Math.hypot(ex, ey), r = p.def.r;
      if (d > c.round + r) continue;
      if (p.def.glass && d <= r + c.pad) { this.burst(p, a); continue; }
      const off = Math.sign(ex * dy - ey * dx) || 1, k = 1 - d / (c.round + r);
      if (p.def.flutter) {
        // drawn along in its wake and thrown off its line
        this.fling(p, a + off * rand(0.2, 0.9), c.roundV * (0.4 + 0.6 * k), 0.35 + 0.65 * k);
        n++;
      } else if (d <= r + c.pad) this.fling(p, a + off * rand(0.2, 0.6), p.def.kick * 1.4);
    }
    this.hear(x1, y1, n);
  }

  // the blast at the muzzle of a gun fired over them
  muzzle({ shooter }) {
    const c = this.cfg;
    if (!shooter || !this.near(shooter.x, shooter.y, c.muzzle + c.ahead)) return;
    const a = shooter.angle || 0, mx = shooter.x + Math.cos(a) * c.ahead, my = shooter.y + Math.sin(a) * c.ahead;
    let n = 0;
    for (const p of this.list) {
      if (p.dead || !p.def.flutter) continue;
      const dx = p.x - mx, dy = p.y - my, d = Math.hypot(dx, dy);
      if (d > c.muzzle) continue;
      const k = 1 - d / c.muzzle;
      this.fling(p, Math.atan2(dy + Math.sin(a) * 8, dx + Math.cos(a) * 8), c.muzzleV * (0.5 + k), 0.4 + 0.6 * k);
      n++;
    }
    this.hear(mx, my, n);
  }

  // an explosion throws everything round it away from it
  blast({ x, y, radius }) {
    const c = this.cfg, reach = radius * c.blast;
    if (!this.near(x, y, reach)) return;
    let n = 0;
    for (const p of this.list) {
      if (p.dead) continue;
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
      if (d > reach) continue;
      if (p.def.glass && d < radius) { this.burst(p, Math.atan2(dy, dx)); continue; }
      const k = 1 - d / reach;
      this.fling(p, Math.atan2(dy, dx) + rand(-0.4, 0.4), c.blastV * k * (p.def.flutter ? 1 : 0.6), 1);
      if (p.def.flutter) n++;
    }
    this.hear(x, y, n);
  }

  // a flute on the floor shot: glass, the last of its champagne
  burst(p, a) {
    const w = this.world, g = p.def.glass;
    p.dead = this.dirty = true;
    if (p.moving) { p.moving = false; this.moving--; }
    w.particles.glass(p.x, p.y, a, 1.5, 7, 90);
    if (g.area) w.events.emit('spill', { x: p.x, y: p.y, kind: g.kind, area: g.area * rand(0.7, 1.2) });
    if (g.area && LIQUIDS.kinds[g.kind]) w.particles.drops(p.x, p.y, a, 1.2, 3, LIQUIDS.kinds[g.kind].splash, 70, 2, false);
    w.sound('fluteShatter', p.x, p.y, 0.5, { pitch: rand(1, 1.2) });
  }

  // people's feet: running through, a kick (the light things fly up); walking, a scuff now and then
  feet(m, now) {
    const c = this.cfg;
    if (!m?.alive || !m.body || !this.near(m.x, m.y, c.feet + 4)) return 0;
    const v = Body.getVelocity(m.body), s = Math.hypot(v.x, v.y);
    if (s < c.walk) return 0;
    const ux = v.x / s, uy = v.y / s, run = s > c.runFast;
    let n = 0;
    for (const p of this.list) {
      if (p.dead || p.z > 0) continue;
      const dx = p.x - m.x, dy = p.y - m.y, R = c.feet + p.def.r;
      if (dx * dx + dy * dy > R * R) continue;
      const d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy / d + uy * 1.3, dx / d + ux * 1.3);
      if (run) {
        if (now - p.kicked < 0.15) continue;
        p.kicked = now;
        this.fling(p, a + rand(-0.3, 0.3), p.def.kick * rand(0.6, 1.1) * clamp(s / c.runFast, 1, 1.8), rand(0.3, 0.8));
        if (p.def.flutter) n++;
        else if (p.def.sound) this.world.sound(p.def.sound, p.x, p.y, 0.35, { pitch: rand(0.9, 1.15) });
      } else if (!p.moving && now - p.scuffed > c.rest) {
        p.scuffed = now;
        this.fling(p, a + rand(-0.5, 0.5), c.scuff * rand(0.5, 1));
      }
    }
    if (n) this.hear(m.x, m.y, n);
    return n;
  }

  // a curtain swinging over them: the hem of an awake one fans what lies under it (systems/Curtains.js)
  curtains() {
    const c = this.cfg, cs = this.world.curtains?.list;
    if (!cs) return;
    for (const k of cs) {
      if (!k.awake || !this.near(k.x, k.y, c.curtain + k.prop.def.h)) continue;
      const cl = k.cloth, h = cl.cfg.sub, last = (cl.R - 1) * cl.C;
      for (let i = last; i < last + cl.C; i++) {
        const vs = (cl.s[i] - cl.ps[i]) / h, vn = (cl.n[i] - cl.pn[i]) / h;
        if (vs * vs + vn * vn < c.swing * c.swing) continue;
        // its frame back to the world's (Curtains.local, inverted)
        const x = k.x + cl.s[i] * k.ux + cl.n[i] * k.uy, y = k.y + cl.s[i] * k.uy - cl.n[i] * k.ux;
        const vx = vs * k.ux + vn * k.uy, vy = vs * k.uy - vn * k.ux, v = Math.hypot(vx, vy);
        for (const p of this.list) {
          if (p.dead || !p.def.flutter || p.moving) continue;
          if (Math.abs(p.x - x) > c.curtain || Math.abs(p.y - y) > c.curtain) continue;
          this.fling(p, Math.atan2(vy, vx) + rand(-0.5, 0.5), Math.min(v, c.roundV) * rand(0.4, 0.8), 0.3);
        }
      }
    }
  }

  update(dt) {
    if (this.dirty) { this.list = this.list.filter((p) => !p.dead); this.dirty = false; }
    if (!this.list.length) return;
    const w = this.world, c = this.cfg, now = w.time ?? 0;
    this.feet(w.player, now);
    for (const e of w.enemies) this.feet(e, now);
    for (const m of w.civilians) this.feet(m, now);
    this.curtains();
    if (!this.moving) return;
    const map = w.map, solid = (x, y) => map.isSolid(Math.floor(x / TILE), Math.floor(y / TILE));
    for (const p of this.list) {
      if (!p.moving) continue;
      const d = p.def;
      if (p.z > 0 || p.vz > 0) {
        // in the air: it sinks no faster than its fall, sways, turns over
        p.vz = Math.max(-(d.fall ?? 60), p.vz - c.gravity * dt);
        p.z += p.vz * dt;
        p.ph += c.flip * dt;
        const f = Math.exp(-c.drag * dt);
        p.vx = p.vx * f + Math.cos(p.ph * 0.7) * c.sway * dt;
        p.vy = p.vy * f + Math.sin(p.ph * 0.5) * c.sway * dt;
        if (p.z <= 0) { p.z = 0; p.vz = 0; p.vx *= 0.35; p.vy *= 0.35; p.spin *= 0.3; }
      } else {
        const f = Math.exp(-c.friction * dt);
        p.vx *= f; p.vy *= f; p.spin *= f;
        if (p.vx * p.vx + p.vy * p.vy < c.still * c.still) {
          p.vx = p.vy = p.spin = 0;
          p.moving = false;
          this.moving--;
          continue;
        }
      }
      p.a += p.spin * dt;
      // a wall stops it (a light thing in the air drops along it)
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (solid(nx, p.y)) p.vx *= -0.2; else p.x = nx;
      if (solid(p.x, ny)) p.vy *= -0.2; else p.y = ny;
      this.grow(p.x, p.y);
    }
  }
}
