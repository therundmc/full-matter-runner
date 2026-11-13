import { MAX_PARTICLES, PALETTE } from '../core/Config.js';
import { rand, pick, chance } from '../core/math.js';

// Lightweight non-physics particles. Particles with a height (z) fall and stamp decals when they land.
export const P = { BLOOD: 0, SPARK: 1, SMOKE: 2, FIRE: 3, GLASS: 4, CHIP: 5, MIST: 6, EMBER: 7 };

export default class Particles {
  constructor(world) {
    this.world = world;
    this.list = [];
  }

  add(p) {
    if (this.list.length >= MAX_PARTICLES) {
      // land the oldest blood immediately rather than dropping it
      const old = this.list.shift();
      if (old.type === P.BLOOD) this.world.map.stampBlood(old.x, old.y, old.size * 0.8);
    }
    this.list.push(p);
    return p;
  }

  // ---- emitters ----
  blood(x, y, angle, spreadA, count, speed, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA);
      const v = speed * rand(0.25, 1.15);
      this.add({
        type: P.BLOOD, x, y, z: opts.z ?? rand(8, 16), vz: rand(-20, 120),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: rand(0.8, opts.big ? 3.6 : 2.4), color: pick(PALETTE.blood), life: 3, drag: 1.2,
      });
    }
  }

  mist(x, y, count, r = 10) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = rand(10, 70);
      this.add({ type: P.MIST, x: x + rand(-r, r) * 0.3, y: y + rand(-r, r) * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: rand(1.5, 4.5), life: rand(0.2, 0.5), maxLife: 0.5, drag: 4, color: pick(PALETTE.blood) });
    }
  }

  sparks(x, y, angle, spreadA, count, speed = 300, color) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.3, 1.2);
      const life = rand(0.08, 0.3);
      this.add({ type: P.SPARK, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, maxLife: life, drag: 5,
        color: color || (chance(0.5) ? '#fff6b0' : PALETTE.yellow) });
    }
  }

  smoke(x, y, count, r = 6, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = rand(5, opts.speed ?? 40);
      const life = rand(0.6, opts.life ?? 1.6);
      this.add({ type: P.SMOKE, x: x + rand(-r, r), y: y + rand(-r, r), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: rand(3, opts.size ?? 9), grow: rand(6, 16), life, maxLife: life, drag: 2.5,
        shade: opts.dark ? rand(25, 50) : rand(90, 160) });
    }
  }

  fire(x, y, count, speed = 160) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = speed * Math.sqrt(Math.random());
      const life = rand(0.15, 0.55);
      this.add({ type: P.FIRE, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rand(4, 12), life, maxLife: life, drag: 3.5 });
    }
  }

  embers(x, y, count, speed = 220) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = speed * rand(0.3, 1.3);
      const life = rand(0.5, 1.4);
      this.add({ type: P.EMBER, x, y, z: rand(2, 10), vz: rand(40, 160), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life, maxLife: life, drag: 1.5 });
    }
  }

  glass(x, y, angle, spreadA, count, speed = 160) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.2, 1.2);
      this.add({ type: P.GLASS, x: x + rand(-8, 8), y: y + rand(-8, 8), z: rand(4, 12), vz: rand(0, 80),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rand(1, 2.5), life: 3, drag: 1.5, rot: rand(0, 6) });
    }
  }

  chips(x, y, angle, spreadA, count, color, speed = 140) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.2, 1.2);
      this.add({ type: P.CHIP, x, y, z: rand(3, 10), vz: rand(10, 90), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: rand(1, 2.2), color, life: 3, drag: 1.8 });
    }
  }

  // ---- simulation ----
  update(dt) {
    const map = this.world.map;
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      const f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f; p.vy *= f;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      let alive = p.life > 0;

      if (p.z !== undefined) {
        p.vz -= 520 * dt;
        p.z += p.vz * dt;
        if (map.solidAt(nx, ny)) {
          // hit a wall while airborne
          if (p.type === P.BLOOD) map.stampWall(nx, ny, p.size * 1.3, p.color);
          alive = false;
        } else if (p.z <= 0) {
          this._land(p, nx, ny);
          alive = false;
        }
      } else if ((p.type === P.SPARK) && map.solidAt(nx, ny)) {
        p.vx *= -0.4; p.vy *= -0.4;
      }
      if (p.type === P.SMOKE) p.size += p.grow * dt;
      p.x = nx; p.y = ny;
      if (alive) list[w++] = p;
    }
    list.length = w;
  }

  _land(p, x, y) {
    const map = this.world.map;
    const g = map.floorCtx;
    switch (p.type) {
      case P.BLOOD: {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 60 && chance(0.6)) map.stampStreak(x, y, p.vx, p.vy, Math.min(14, sp * 0.05) + p.size, p.size * 1.4);
        else map.stampBlood(x, y, p.size, 1);
        break;
      }
      case P.GLASS:
        g.fillStyle = chance(0.5) ? 'rgba(200,250,255,0.85)' : 'rgba(120,220,240,0.7)';
        g.fillRect(Math.round(x), Math.round(y), Math.ceil(p.size), 1);
        break;
      case P.CHIP:
        g.fillStyle = p.color;
        g.fillRect(Math.round(x), Math.round(y), Math.ceil(p.size), Math.ceil(p.size * 0.6));
        break;
      case P.EMBER:
        g.fillStyle = 'rgba(20,10,10,0.6)';
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
        break;
      default: break;
    }
  }

  // normal-blended particles (drawn before the additive pass)
  draw(ctx) {
    for (const p of this.list) {
      switch (p.type) {
        case P.BLOOD: {
          const s = p.size * (1 + Math.max(0, p.z) * 0.04);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - s / 2, p.y - s / 2 - p.z * 0.25, s, s);
          break;
        }
        case P.MIST:
          ctx.globalAlpha = Math.max(0, p.life / p.maxLife) * 0.35;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case P.SMOKE: {
          const a = Math.max(0, p.life / p.maxLife);
          ctx.globalAlpha = a * 0.45;
          ctx.fillStyle = `rgb(${p.shade},${p.shade},${p.shade + 10})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case P.GLASS:
          ctx.fillStyle = '#c8faff';
          ctx.fillRect(p.x, p.y - p.z * 0.25, p.size, 1);
          break;
        case P.CHIP:
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y - p.z * 0.25, p.size, p.size * 0.7);
          break;
        default: break;
      }
    }
  }

  // additive pass (sparks, fire, embers)
  drawGlow(ctx) {
    for (const p of this.list) {
      if (p.type === P.SPARK) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      } else if (p.type === P.FIRE) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = a > 0.85 ? '#ffe9a0' : a > 0.55 ? '#ff9a20' : a > 0.3 ? '#ff4a10' : '#a01808';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + (1 - a) * 0.8), 0, Math.PI * 2); ctx.fill();
      } else if (p.type === P.EMBER) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = '#ffa030';
        ctx.fillRect(p.x, p.y - p.z * 0.3, 1.5, 1.5);
      }
    }
    ctx.globalAlpha = 1;
  }
}
