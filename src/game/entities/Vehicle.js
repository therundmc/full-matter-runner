import { CAT, MASK } from '../Config.js';

// parts thrown out of the car must not collide with the car body they spawn inside
const FREE = MASK.DEBRIS & ~CAT.PROP;
import { sprite, spriteOpt, silhouette, chunk, glassShards, slices } from '../../engine/Assets.js';
import { rand, chance, clamp, local } from '../../engine/math.js';
import Debris from './Debris.js';
import { setMaterial, impulse, scaleInertia } from '../../engine/physics/Body.js';

const { Bodies } = Matter;

// Sprite-space layout of each model (facing +x). Regions: [x0, x1, y0, y1].
export const VEHICLES = {
  car: {
    sprite: 'props/car', hp: 28, kg: 1250, color: '#ff2a6d',
    wind: [46, 54, 5, 31], rear: [14, 20, 7, 29], tank: [0, 13, 0, 36], hood: [54, 75],
    wheels: [[15, 1], [15, 35], [60, 1], [60, 35]],
  },
  car2: {
    sprite: 'props/car2', hp: 28, kg: 1200, color: '#05d9e8',
    wind: [46, 54, 5, 31], rear: [14, 20, 7, 29], tank: [0, 13, 0, 36], hood: [54, 75],
    wheels: [[15, 1], [15, 35], [60, 1], [60, 35]],
  },
  van: {
    sprite: 'props/van', hp: 36, kg: 1900, color: '#e6e0cf',
    wind: [62, 70, 5, 33], rear: null, tank: [0, 13, 0, 38], hood: [70, 83],
    wheels: [[16, 1], [16, 37], [66, 1], [66, 37]],
  },
};

// A car you can wreck piece by piece: tyres, windows, fuel tank, alarm, smoke, fire, explosion.
export default class Vehicle {
  constructor(world, model, x, y, angle) {
    this.world = world;
    this.type = model;
    this.m = VEHICLES[model];
    this.isVehicle = true;
    const base = spriteOpt(this.m.sprite) || sprite('props/car');
    this.base = base;
    this.w = base.width; this.h = base.height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w; this.canvas.height = this.h;
    this.g = this.canvas.getContext('2d');
    this.g.drawImage(base, 0, 0);
    this.glow = spriteOpt(this.m.sprite + '_glow');
    this.def = { static: true, hp: this.m.hp, chips: this.m.color, sound: 'metal', blocksPath: true, vault: true };
    this.body = Bodies.rectangle(x, y, this.w - 4, this.h - 4, {
      angle, frictionAir: 0.02, friction: 0.6, restitution: 0.05, label: 'vehicle',
      collisionFilter: { category: CAT.PROP, mask: MASK.PROP },
    });
    // rubber on asphalt; a ton of metal nobody can push by hand
    setMaterial(this.body, this.m.kg, 0.9);
    scaleInertia(this.body, 3);
    this.body.material = 'metal';
    world.physics.freezeIfHeavy(this.body);
    this.body.entity = this;
    this.hp = this.m.hp;
    this.windows = { wind: 0, rear: 0 }; // 0 intact, 1 cracked, 2 gone
    this.tires = [true, true, true, true];
    this.fuel = 0;      // fuel leak level
    this.puddle = 0;    // fuel puddle radius
    this.fuse = 0;      // burning: seconds before it blows
    this.burning = false;
    this.exploded = false;
    this.wreckFire = 0;
    this.alarm = 0;
    this.alarmBeep = 0;
    this.lightsOut = false;
    this.flash = 0;
    this.dead = false; // vehicles stay in the world as wrecks
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  // world point -> sprite coordinates
  toSprite(px, py) {
    const a = -this.body.angle, dx = px - this.x, dy = py - this.y;
    return { sx: dx * Math.cos(a) - dy * Math.sin(a) + this.w / 2, sy: dx * Math.sin(a) + dy * Math.cos(a) + this.h / 2 };
  }

  // sprite coordinates -> world point
  toWorld(sx, sy) { return local(this.x, this.y, this.body.angle, sx - this.w / 2, sy - this.h / 2); }

  inside(r, sx, sy) { return r && sx >= r[0] && sx <= r[1] && sy >= r[2] && sy <= r[3]; }

  // bullets, melee, debris
  hit(dmg, px, py, dirA) {
    const w = this.world;
    this.flash = 0.06;
    if (this.exploded) {
      w.particles.sparks(px, py, dirA + Math.PI, 0.8, 4, 200);
      w.sound('carHit', px, py, 0.4);
      return;
    }
    const { sx, sy } = this.toSprite(px, py);
    this.startAlarm();
    // seen from above the bullet lands on the edge: follow it a few px inside to find what it really hits
    const da = dirA - this.body.angle, ddx = Math.cos(da), ddy = Math.sin(da);
    let tank = false;
    for (let k = 0; k <= 24; k += 1.5) {
      const qx = sx + ddx * k, qy = sy + ddy * k;
      if (k <= 10 && this.inside(this.m.tank, qx, qy)) tank = true;
      if (k <= 7) {
        for (let i = 0; i < 4; i++) {
          const [wx, wy] = this.m.wheels[i];
          if (this.tires[i] && Math.hypot(qx - wx, qy - wy) < 7) { this.popTire(i, dirA); return; }
        }
      }
      if (this.windows.wind < 2 && this.inside(this.m.wind, qx, qy)) { this.hitWindow('wind', qx, qy, dirA); return; }
      if (this.m.rear && this.windows.rear < 2 && this.inside(this.m.rear, qx, qy)) { this.hitWindow('rear', qx, qy, dirA); return; }
    }
    // body panel: bullet hole, sparks
    this.hole(sx, sy);
    w.particles.sparks(px, py, dirA + Math.PI, 0.9, 6, 260);
    w.particles.chips(px, py, dirA + Math.PI, 0.9, 3, this.m.color, 120);
    w.sound('carHit', px, py, 0.6);
    if (sx > this.w - 4 || sx < 4) this.breakLights(px, py);
    if (tank) {
      this.fuel++;
      w.particles.chips(px, py, dirA + Math.PI, 0.6, 5, '#6a5a2a', 90);
      this.damage(dmg * 2);
    } else this.damage(dmg);
  }

  // a round that went right through: torn metal and sparks on the far side
  exitWound(px, py, dirA) {
    if (this.exploded) return;
    const { sx, sy } = this.toSprite(px, py);
    this.hole(sx, sy);
    this.world.particles.sparks(px, py, dirA, 0.7, 4, 220);
  }

  hole(sx, sy) {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(200,200,220,0.7)';
    g.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
    g.fillStyle = '#0d0710';
    g.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    g.restore();
  }

  hitWindow(which, sx, sy, dirA) {
    const w = this.world;
    const r = this.m[which];
    const state = ++this.windows[which];
    const g = this.g;
    if (state === 1) {
      // spider-web crack around the impact
      g.save();
      g.beginPath(); g.rect(r[0], r[2], r[1] - r[0] + 1, r[3] - r[2] + 1); g.clip();
      g.strokeStyle = 'rgba(230,250,255,0.85)';
      g.lineWidth = 0.6;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + rand(-0.3, 0.3);
        g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(a) * rand(4, 12), sy + Math.sin(a) * rand(4, 12));
        g.stroke();
      }
      g.beginPath(); g.arc(sx, sy, 3, 0, Math.PI * 2); g.stroke();
      g.restore();
      w.particles.glass(...this.wpos(sx, sy), dirA, 0.6, 6, 120);
      w.sound('impact', this.x, this.y, 0.7);
      return;
    }
    if (state > 2) return;
    // window explodes into the car / out the other side
    g.save();
    g.fillStyle = '#140c1c';
    g.fillRect(r[0], r[2], r[1] - r[0] + 1, r[3] - r[2] + 1);
    g.fillStyle = 'rgba(190,240,255,0.6)';
    for (let k = 0; k < 10; k++) g.fillRect(r[0] + rand(0, r[1] - r[0]), chance(0.5) ? r[2] : r[3] - 1, 1, 1);
    g.fillStyle = '#3a2a3a';
    g.fillRect(r[0] + 1, (r[2] + r[3]) / 2 - 5, 3, 4); // seat headrests
    g.fillRect(r[0] + 1, (r[2] + r[3]) / 2 + 1, 3, 4);
    g.restore();
    const [cx, cy] = this.wpos((r[0] + r[1]) / 2, (r[2] + r[3]) / 2);
    w.particles.glass(cx, cy, dirA, 1, 40, 220);
    const shards = glassShards();
    for (let k = 0; k < 10; k++) {
      const a = dirA + rand(-0.6, 0.6), v = rand(140, 380);
      w.addDebris(new Debris(w, shards[k % shards.length], cx + rand(-6, 6), cy + rand(-6, 6), rand(0, 6), Math.cos(a) * v, Math.sin(a) * v,
        rand(-0.8, 0.8), { mask: FREE, material: 'glass', air: 0.05, kg: 0.1, mu: 0.35, fly: 0.3, shadow: 0, harm: { kind: 'cut', knock: 2.4, lethal: 5.2 } }));
    }
    w.sound('glass', cx, cy);
    w.flashGlass(cx, cy);
    this.damage(2);
  }

  wpos(sx, sy) { const p = this.toWorld(sx, sy); return [p.x, p.y]; }

  popTire(i, dirA) {
    if (!this.tires[i]) return;
    this.tires[i] = false;
    const w = this.world;
    const [px, py] = this.wpos(...this.m.wheels[i]);
    w.sound('tirePop', px, py);
    w.particles.chips(px, py, dirA, Math.PI, 16, '#141418', 200);
    w.particles.smoke(px, py, 8, 3, { speed: 90, size: 5, life: 1.2 });
    w.shake(0.15);
    w.noise(px, py, 300);
    this.damage(2);
  }

  breakLights(px, py) {
    if (this.lightsOut) return;
    this.lightsOut = true;
    this.world.particles.glass(px, py, 0, Math.PI, 10, 100);
  }

  startAlarm() {
    if (this.alarm <= 0 && !this.exploded) this.alarm = 9;
  }

  damage(n) {
    if (this.exploded) return;
    this.hp -= n;
    if (this.hp <= this.m.hp * 0.45 || this.fuel >= 3) this.ignite();
    if (this.hp <= 0) this.explode();
  }

  ignite() {
    if (this.burning || this.exploded) return;
    this.burning = true;
    this.fuse = rand(3.5, 5.5);
    this.world.sound('ignite', this.x, this.y);
  }

  // blast from a nearby explosion
  onBlast(d, R, a) {
    if (this.exploded) return;
    const k = 1 - d / R;
    if (k <= 0) return;
    for (const key of ['wind', 'rear']) if (this.m[key] && chance(0.4 + k)) { this.windows[key] = 1; this.hitWindow(key, (this.m[key][0] + this.m[key][1]) / 2, this.h / 2, a); }
    for (let i = 0; i < 4; i++) if (chance(k * 0.7)) this.popTire(i, a);
    this.damage(Math.ceil(40 * k));
  }

  // called when World.explode decides this "prop" is destroyed
  break() { this.explode(); }

  explode() {
    if (this.exploded) return;
    this.exploded = true;
    this.burning = false;
    this.alarm = 0;
    this.lightsOut = true;
    const w = this.world;
    const { x, y } = this;
    w.explode(x, y, { radius: 140, source: 'car', origin: this });
    w.camera.punch(0.12);
    w.slowmo(0.3, 0.6);
    // charred wreck
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(22,12,14,0.72)';
    g.fillRect(0, 0, this.w, this.h);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = chance(0.15) ? 'rgba(255,120,40,0.7)' : 'rgba(0,0,0,0.5)';
      g.fillRect(rand(0, this.w), rand(0, this.h), rand(1, 5), rand(1, 4));
    }
    g.restore();
    for (const key of ['wind', 'rear']) if (this.m[key]) { const r = this.m[key]; g.fillStyle = '#0a0608'; g.fillRect(r[0], r[2], r[1] - r[0] + 1, r[3] - r[2] + 1); }
    // the whole car jumps
    impulse(this.body, rand(0, Math.PI * 2), 1800, rand(-0.03, 0.03), 2);
    // parts fly
    const tire = spriteOpt('props/car_tire') || chunk('#141418', 9, 5);
    const harm = { kind: 'blunt', knock: 3, lethal: 8 };
    this.m.wheels.forEach(([wx, wy], i) => {
      const [px, py] = this.wpos(wx, wy);
      const a = Math.atan2(py - y, px - x) + rand(-0.4, 0.4), v = rand(200, 420);
      if (this.tires[i] || chance(0.6)) w.addDebris(new Debris(w, tire, px, py, rand(0, 6), Math.cos(a) * v, Math.sin(a) * v, rand(-0.6, 0.6), { mask: FREE, material: 'rubber', kg: 15, mu: 0.15, fly: 0.35, air: 0.03, bounce: 0.5, harm: { ...harm } }));
    });
    const hood = spriteOpt('props/car_hood') || slices(this.base, 4, 1)[3];
    const [hx, hy] = this.wpos((this.m.hood[0] + this.m.hood[1]) / 2, this.h / 2);
    const ha = Math.atan2(hy - y, hx - x) + rand(-0.5, 0.5);
    w.addDebris(new Debris(w, hood, hx, hy, this.body.angle, Math.cos(ha) * 340, Math.sin(ha) * 340, rand(-0.5, 0.5), { mask: FREE, material: 'metal', kg: 20, mu: 0.5, fly: 0.4, air: 0.03, harm: { ...harm } }));
    const door = spriteOpt('props/car_door') || chunk(this.m.color, 18, 4);
    for (const side of [-1, 1]) {
      const [dx, dy] = this.wpos(this.w * 0.5, side < 0 ? 0 : this.h);
      const a = Math.atan2(dy - y, dx - x) + rand(-0.3, 0.3), v = rand(220, 380);
      w.addDebris(new Debris(w, door, dx, dy, this.body.angle, Math.cos(a) * v, Math.sin(a) * v, rand(-0.5, 0.5), { mask: FREE, material: 'metal', kg: 25, mu: 0.55, fly: 0.35, harm: { ...harm } }));
    }
    for (let k = 0; k < 16; k++) {
      const a = rand(0, Math.PI * 2), v = rand(150, 450);
      w.addDebris(new Debris(w, chunk(chance(0.5) ? this.m.color : '#2a2a33', Math.floor(rand(2, 6)), Math.floor(rand(2, 4))), x + rand(-20, 20), y + rand(-10, 10),
        rand(0, 6), Math.cos(a) * v, Math.sin(a) * v, rand(-0.9, 0.9), { mask: FREE, material: 'metal', kg: 1 }));
    }
    // the tank goes a beat later
    const [tx, ty] = this.wpos((this.m.tank[0] + this.m.tank[1]) / 2, this.h / 2);
    w.after(0.35, () => {
      w.explode(tx, ty, { radius: 70, source: 'fuel', origin: this });
      w.particles.fire(tx, ty, 60, 260);
    });
    this.puddle = Math.max(this.puddle, 22);
    this.wreckFire = rand(9, 13);
  }

  update(dt) {
    const w = this.world;
    this.flash = Math.max(0, this.flash - dt);
    const hood = this.toWorld((this.m.hood[0] + this.m.hood[1]) / 2, this.h / 2);
    const tank = this.toWorld((this.m.tank[0] + this.m.tank[1]) / 2, this.h / 2);
    // alarm: blinking lights and a wailing that draws the guards
    if (this.alarm > 0) {
      this.alarm -= dt;
      this.alarmBeep -= dt;
      if (this.alarmBeep <= 0) {
        this.alarmBeep = 0.42;
        w.sound('alarm', this.x, this.y, 0.8);
        w.noise(this.x, this.y, 520);
        if (!this.lightsOut) {
          for (const sx of [2, this.w - 2]) {
            const p = this.toWorld(sx, this.h / 2);
            w.light(p.x, p.y, 60, '#ffb040', 0.2);
          }
        }
      }
    }
    // engine smoke once badly damaged
    const dmg = 1 - clamp(this.hp / this.m.hp, 0, 1);
    if (!this.exploded && dmg > 0.4 && chance(dmg * 0.5)) {
      w.particles.smoke(hood.x, hood.y, 1, 4, { speed: 18, size: 4 + dmg * 4, life: 1.6, dark: this.burning });
    }
    // fuel leak puddle
    if (this.fuel > 0 && this.puddle < 8 + this.fuel * 5) this.puddle += dt * 2.5;
    if (this.burning) {
      this.fuse -= dt;
      w.particles.fire(hood.x + rand(-6, 6), hood.y + rand(-6, 6), 2, 40);
      if (chance(0.3)) w.particles.embers(hood.x, hood.y, 1, 80);
      if (chance(0.08)) w.sound('crackle', hood.x, hood.y, 0.6);
      if (chance(0.5)) w.light(hood.x, hood.y, 70 + rand(0, 20), '#ff7a20', 0.05);
      if (this.puddle > 2) w.particles.fire(tank.x + rand(-this.puddle, this.puddle) * 0.6, tank.y + rand(-this.puddle, this.puddle) * 0.6, 1, 20);
      if (this.fuse <= 0) this.explode();
    }
    // burning wreck
    if (this.wreckFire > 0) {
      this.wreckFire -= dt;
      const p = this.toWorld(rand(8, this.w - 8), rand(6, this.h - 6));
      w.particles.fire(p.x, p.y, 2, 50);
      if (chance(0.4)) w.particles.smoke(p.x, p.y, 1, 4, { speed: 25, size: 7, life: 2.4, dark: true });
      if (chance(0.15)) w.particles.embers(p.x, p.y, 1, 90);
      if (chance(0.06)) w.sound('crackle', p.x, p.y, 0.5);
      if (chance(0.5)) w.light(this.x, this.y, 110 + rand(0, 30), '#ff6a18', 0.05);
      if (this.wreckFire <= 0) w.decals.scorch(this.x, this.y, 46);
    }
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    const ox = -this.w / 2, oy = -this.h / 2;
    // fuel puddle (rainbow sheen)
    if (this.puddle > 0) {
      const [tx, ty] = [(this.m.tank[0] + this.m.tank[1]) / 2 + ox, oy + this.h / 2];
      ctx.fillStyle = 'rgba(20,14,30,0.75)';
      ctx.beginPath(); ctx.ellipse(tx - 4, ty, this.puddle * 1.2, this.puddle * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,80,200,0.25)';
      ctx.beginPath(); ctx.ellipse(tx - 6, ty - 2, this.puddle * 0.6, this.puddle * 0.3, 0.4, 0, Math.PI * 2); ctx.fill();
    }
    // tyres under the body: flat ones squash and the body sags toward them
    let sagX = 0, sagY = 0;
    const tire = spriteOpt('props/car_tire');
    this.m.wheels.forEach(([wx, wy], i) => {
      const flat = !this.tires[i] || this.exploded;
      if (flat) { sagX += (wx < this.w / 2 ? -0.5 : 0.5); sagY += (wy < this.h / 2 ? -0.5 : 0.5); }
      ctx.save();
      ctx.translate(ox + wx, oy + wy + (wy < this.h / 2 ? 1 : -1));
      if (flat) ctx.scale(1.15, 0.6);
      if (tire) ctx.drawImage(tire, -tire.width / 2, -tire.height / 2);
      else { ctx.fillStyle = '#141418'; ctx.fillRect(-4.5, -2.5, 9, 5); }
      ctx.restore();
    });
    const jx = this.flash > 0 ? rand(-1, 1) : 0;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(silhouette(this.base), ox + 3, oy + 3);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.canvas, ox + sagX + jx, oy + sagY);
    if (this.glow && !this.lightsOut) {
      const blink = this.alarm > 0 ? (Math.floor(this.alarm * 2.4) % 2 === 0 ? 1 : 0.15) : 0.85;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = blink;
      ctx.drawImage(this.glow, ox + sagX, oy + sagY);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
}
