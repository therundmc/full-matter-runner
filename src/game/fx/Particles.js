import { MAX_PARTICLES, PALETTE, DESTRUCTION } from '../Config.js';
import { rand, pick, chance } from '../../engine/math.js';
import { silhouette } from '../../engine/Assets.js';

// Lightweight non-physics particles. Particles with a height (z) fall and stamp decals when they land.
// FLOAT: stuffing / feathers / paper drifting down slowly; DUST: clouds that hang and settle; DROP: liquid.
export const P = { BLOOD: 0, SPARK: 1, SMOKE: 2, FIRE: 3, GLASS: 4, CHIP: 5, MIST: 6, EMBER: 7, SHARD: 8, FLOAT: 9, DUST: 10, DROP: 11 };
const SHARD_REST = 0.5; // seconds a landed shard lies still before it is baked into the floor
const GRAVITY = 520;    // px/s² of fake height

export default class Particles {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.floats = 0; // FLOAT particles alive (they live long: capped)
  }

  add(p) {
    if (this.list.length >= MAX_PARTICLES) {
      // land the oldest blood immediately rather than dropping it
      const old = this.list.shift();
      if (old.type === P.BLOOD) this.world.decals.stampBlood(old.x, old.y, old.size * 0.8);
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

  // purely visual piece of an object (img): flies, lands, skids a little, fades away. No physics body.
  // It tumbles, lands, bounces, skids, then is baked into the floor (the remains stay).
  shard(img, x, y, angle, speed, opts = {}) {
    const a = angle;
    this.add({ type: P.SHARD, img, x, y, z: opts.z ?? 6, vz: opts.vz ?? (40 + Math.random() * 90),
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, rot: opts.rot ?? Math.random() * 6.28,
      spin: opts.spin ?? (Math.random() - 0.5) * 14, life: 8, drag: opts.drag ?? 1.2, landed: false,
      bounce: opts.bounce ?? 0.3 });
  }

  // slow floating bits: stuffing, foam, feathers, paper, leaves (kind = a data/destruction.js FLOATS entry)
  floaters(x, y, kind, count, angle = 0, spreadA = Math.PI, speed = 60, z = 10) {
    count = Math.min(count, DESTRUCTION.maxFloats - this.floats);
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.2, 1.1);
      this.floats++;
      this.add({ type: P.FLOAT, x: x + rand(-3, 3), y: y + rand(-3, 3), z: z * rand(0.6, 1.4), vz: rand(20, 70),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, fall: kind.fall * rand(0.7, 1.3), ph: rand(0, 6.28), sway: rand(6, 16),
        size: rand(kind.size[0], kind.size[1]), color: pick(kind.colors), flat: !!kind.flat, life: 14, drag: 3 });
    }
  }

  // a cloud that hangs in the air and slowly settles
  dust(x, y, count, r, color, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = rand(4, opts.speed ?? 30);
      const life = rand(1.4, opts.life ?? 3.4);
      this.add({ type: P.DUST, x: x + rand(-r, r), y: y + rand(-r, r) * 0.7, vx: Math.cos(a) * v + (opts.vx || 0), vy: Math.sin(a) * v + (opts.vy || 0),
        size: rand(1.5, opts.size ?? 5), grow: rand(1, 3.5), life, maxLife: life, drag: 1.6, color, alpha: opts.alpha ?? 0.18 });
    }
  }

  // liquid: droplets that leave a wet stain where they land (many of them make a puddle)
  drops(x, y, angle, spreadA, count, color, speed = 120, z = 6) {
    const fly = color.replace(/[\d.]+\)$/, '0.75)'); // a stain is faint, a flying drop catches the light
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.4, 1.1);
      this.add({ type: P.DROP, x, y, z: z * rand(0.6, 1.2), vz: rand(0, 60), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: rand(0.8, 1.6), color, fly, life: 3, drag: 1 });
    }
  }

  // ---- simulation ----
  update(dt) {
    const map = this.world.map;
    const decals = this.world.decals;
    const list = this.list;
    let w = 0, floats = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      const f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f; p.vy *= f;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      let alive = p.life > 0;

      if (p.type === P.SHARD) {
        // airborne (tumbling), bounces, skids to a stop, then becomes part of the floor
        if (!p.landed) {
          p.vz -= GRAVITY * dt;
          p.z += p.vz * dt;
          p.rot += p.spin * dt;
          if (p.z <= 0) {
            p.z = 0;
            if (p.vz < -70 && p.bounce > 0) { p.vz *= -p.bounce; p.bounce *= 0.5; p.vx *= 0.7; p.vy *= 0.7; p.spin *= 0.6; }
            else { p.landed = true; p.life = SHARD_REST + 1.5; p.vx *= 0.5; p.vy *= 0.5; p.spin *= 0.3; }
          }
        } else {
          const f2 = Math.max(0, 1 - 6 * dt);
          p.vx *= f2; p.vy *= f2; p.spin *= f2;
          p.rot += p.spin * dt;
          if ((p.life < 1.5 && p.vx * p.vx + p.vy * p.vy < 4) || p.life <= 0) { decals.bake(p.img, p.x, p.y, p.rot); alive = false; }
        }
        if (!alive && !p.landed) { p.landed = true; decals.bake(p.img, p.x, p.y, p.rot); }
        if (map.solidAt(nx, ny)) { p.vx *= -0.3; p.vy *= -0.3; p.x += p.vx * dt; p.y += p.vy * dt; if (alive) list[w++] = p; continue; }
      } else if (p.type === P.FLOAT) {
        // pops up, then flutters down, swaying
        p.vz = Math.max(-p.fall, p.vz - 140 * dt);
        p.z += p.vz * dt;
        p.ph += dt * 3;
        p.vx += Math.sin(p.ph) * p.sway * dt * 4;
        if (map.solidAt(nx, ny)) { p.vx = -p.vx * 0.3; p.vy = -p.vy * 0.3; } else { p.x = nx; p.y = ny; }
        if (p.z <= 0 || !alive) { this._land(p, p.x, p.y); alive = false; }
        if (alive) { floats++; list[w++] = p; }
        continue;
      } else if (p.z !== undefined) {
        p.vz -= 520 * dt;
        p.z += p.vz * dt;
        if (map.solidAt(nx, ny)) {
          // hit a wall while airborne
          if (p.type === P.BLOOD) decals.stampWall(nx, ny, p.size * 1.3, p.color);
          alive = false;
        } else if (p.z <= 0) {
          this._land(p, nx, ny);
          alive = false;
        }
      } else if ((p.type === P.SPARK) && map.solidAt(nx, ny)) {
        p.vx *= -0.4; p.vy *= -0.4;
      }
      if (p.type === P.SMOKE || p.type === P.DUST) p.size += p.grow * dt;
      p.x = nx; p.y = ny;
      if (alive) list[w++] = p;
    }
    list.length = w;
    this.floats = floats;
  }

  _land(p, x, y) {
    const decals = this.world.decals;
    const g = decals.floorCtx;
    switch (p.type) {
      case P.BLOOD: {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 60 && chance(0.6)) decals.stampStreak(x, y, p.vx, p.vy, Math.min(14, sp * 0.05) + p.size, p.size * 1.4);
        else decals.stampBlood(x, y, p.size, 1);
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
      case P.FLOAT:
        g.fillStyle = p.color;
        g.globalAlpha = 0.85;
        g.fillRect(x, y, p.size, p.flat ? p.size * 0.6 : p.size);
        g.globalAlpha = 1;
        break;
      case P.DROP:
        decals.spill(x, y, p.size * rand(1.2, 2.2), p.color);
        break;
      default: break;
    }
  }

  // normal-blended particles (drawn before the additive pass)
  draw(ctx) {
    for (const p of this.list) {
      switch (p.type) {
        case P.SHARD: {
          // the shadow stays on the floor while the piece is up in the air
          const hw = p.img.width / 2, hh = p.img.height / 2;
          const c = Math.cos(p.rot), s = Math.sin(p.rot);
          ctx.save();
          ctx.globalAlpha = 0.3 / (1 + p.z * 0.03);
          ctx.transform(c, s, -s, c, p.x + 1, p.y + 1);
          ctx.drawImage(silhouette(p.img), -hw, -hh);
          ctx.restore();
          ctx.save();
          const k = 1 + p.z * 0.006;
          ctx.transform(c * k, s * k, -s * k, c * k, p.x, p.y - p.z * 0.5);
          ctx.drawImage(p.img, -hw, -hh);
          ctx.restore();
          break;
        }
        case P.FLOAT: {
          // paper and leaves flutter (their width flips as they turn)
          const fl = p.flat ? Math.abs(Math.cos(p.ph * 1.7)) * 0.8 + 0.2 : 1;
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(p.x + 1, p.y + 1, p.size * fl, p.size * 0.7);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y - p.z * 0.5, p.size * fl, p.flat ? p.size * 0.7 : p.size);
          break;
        }
        case P.DUST: {
          const k = p.life / p.maxLife;
          ctx.globalAlpha = p.alpha * Math.min(1, k * 2) * Math.min(1, (1 - k) * 8);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case P.DROP:
          ctx.fillStyle = p.fly;
          ctx.fillRect(p.x, p.y - p.z * 0.4, p.size, p.size);
          break;
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
