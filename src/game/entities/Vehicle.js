import { CAT, MASK, LIGHTING, BODY_SCALE } from '../Config.js';

// parts thrown out of the car must not collide with the car body they spawn inside
const FREE = MASK.DEBRIS & ~CAT.PROP;
import { sprite, spriteOpt, silhouette, chunk, glassShards, slices, sw, sh } from '../../engine/Assets.js';
import { rand, chance, clamp, local } from '../../engine/math.js';
import Debris from './Debris.js';
import { WEAPONS } from '../data/weapons.js';
import { setMaterial, impulse, scaleInertia, wake } from '../../engine/physics/Body.js';

const { Bodies, Body, Sleeping, Query } = Matter;

// Sprite-space layout of each model (real size, facing +x; must match tools/generate_assets.py).
// Regions: [x0, x1, y0, y1]; hood: [x0, x1]; wheels: tyre centres (they stick out a little past the sides).
// Sprites: car (sedan) 140x58, car2 (coupe) 134x56, van 160x64; the hitbox is the sprite minus 2 px all round.
export const VEHICLES = {
  car: {
    sprite: 'props/car', hp: 28, kg: 1200, color: '#ff2a6d',
    wind: [82, 96, 11, 46], rear: [35, 44, 11, 46], tank: [0, 26, 0, 58], hood: [98, 134],
    wheels: [[30, 2], [30, 56], [112, 2], [112, 56]],
  },
  car2: {
    sprite: 'props/car2', hp: 28, kg: 1150, color: '#05d9e8',
    wind: [79, 97, 11, 44], rear: [24, 48, 14, 41], tank: [0, 24, 0, 56], hood: [99, 128],
    wheels: [[28, 2], [28, 54], [106, 2], [106, 54]],
  },
  van: {
    sprite: 'props/van', hp: 36, kg: 1900, color: '#e6e0cf',
    wind: [124, 136, 9, 54], rear: null, tank: [0, 30, 0, 64], hood: [138, 154],
    wheels: [[38, 2], [38, 62], [140, 2], [140, 62]],
  },
};

const TYRE_HIT = [11, 5]; // half extents of a tyre's hit box (sprite px)
const LAMP_END = 10;      // a hit this close to the nose / tail (sprite px) lands on a lamp

// glass pixels (tinted blue-black) of a window region of the sprite's ImageData, so a shattered window keeps its shape:
// sprite px, k = sprite px per pixel (a sprite painted finer than the world, Assets.js `density`)
function glassPixels(img, r, k) {
  const px = [];
  for (let y = Math.round(r[2] / k); y < Math.round((r[3] + 1) / k); y++) {
    for (let x = Math.round(r[0] / k); x < Math.round((r[1] + 1) / k); x++) {
      const i = (y * img.width + x) * 4, d = img.data, R = d[i], G = d[i + 1], B = d[i + 2];
      if (d[i + 3] > 200 && B - R >= 14 && B >= G && R + G + B < 520) px.push([x * k, y * k]);
    }
  }
  return px;
}

// A car you can wreck piece by piece: tyres, windows, fuel tank, alarm, smoke, fire, explosion.
export default class Vehicle {
  constructor(world, model, x, y, angle) {
    this.world = world;
    this.type = model;
    this.m = VEHICLES[model];
    this.isVehicle = true;
    const base = spriteOpt(this.m.sprite) || sprite('props/car');
    this.base = base;
    // sprite space is in world px whatever the sprite's density; the canvas keeps its pixels (k: world px per pixel)
    this.k = base.k || 1;
    this.w = sw(base); this.h = sh(base);
    this.canvas = document.createElement('canvas');
    this.canvas.width = base.width; this.canvas.height = base.height;
    this.g = this.canvas.getContext('2d');
    this.g.drawImage(base, 0, 0);
    const img = this.g.getImageData(0, 0, base.width, base.height);
    this.g.setTransform(1 / this.k, 0, 0, 1 / this.k, 0, 0);
    this.glassPx = {};
    for (const key of ['wind', 'rear']) if (this.m[key]) this.glassPx[key] = glassPixels(img, this.m[key], this.k);
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
    this.lit = true;                       // lights switched on (a parked car: off)
    this.lamps = [true, true, true, true]; // whole: head lamps left / right, tail lamps left / right (order of LIGHTING.propLights)
    this.flash = 0;
    this.dead = false; // vehicles stay in the world as wrecks
    // set while driven as through-traffic (systems/Ambient): front wheel angle, brake lights 0..1, body bounce px
    this.moving = false;
    this.steer = 0;
    this.brake = 0;
    this.bob = 0;
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get lightsOut() { return !this.lit || !this.lamps.some(Boolean); }
  set lightsOut(out) { this.lit = !out; }

  // world point -> sprite coordinates
  toSprite(px, py) {
    const a = -this.body.angle, dx = px - this.x, dy = py - this.y;
    return { sx: dx * Math.cos(a) - dy * Math.sin(a) + this.w / 2, sy: dx * Math.sin(a) + dy * Math.cos(a) + this.h / 2 };
  }

  // sprite coordinates -> world point
  toWorld(sx, sy) { return local(this.x, this.y, this.body.angle, sx - this.w / 2, sy - this.h / 2); }

  // The trunk (level prop option `trunk`: { item: the weapon lying in it, open, lift }), opened by the player
  // (Player.startTrunk): where one stands to open it (anywhere round the tail: behind the bumper or by either rear
  // corner), where his hands go (the lid's edge, behind the bumper), the lid coming up, what is inside taken out
  nearTrunk(px, py) {
    const { sx, sy } = this.toSprite(px, py);
    return sx > -36 && sx < 36 && sy > -28 && sy < this.h + 28;
  }

  trunkSpot() { return this.toWorld(-9, this.h / 2); }

  // 0 shut .. 1 up against the rear window
  liftTrunk(k) { this.trunk.lift = k; }

  takeFromTrunk() {
    const t = this.trunk, item = t.item;
    t.item = null;
    return item;
  }

  inside(r, sx, sy) { return r && sx >= r[0] && sx <= r[1] && sy >= r[2] && sy <= r[3]; }

  // bullets, blasts, debris, and melee (kind punch | blunt | cut: a bat smashes glass and lamps and dents the panels,
  // a blade slashes tyres and scores the paint, fists only set the alarm off; none of them hurts the car itself)
  hit(dmg, px, py, dirA, force = 1, kind = 'bullet') {
    const w = this.world;
    this.flash = 0.06;
    if (this.exploded) {
      w.particles.sparks(px, py, dirA + Math.PI, 0.8, 4, 200);
      w.sound('carHit', px, py, 0.4);
      return;
    }
    const { sx, sy } = this.toSprite(px, py);
    this.startAlarm();
    const melee = kind === 'punch' || kind === 'blunt' || kind === 'cut';
    if (kind === 'punch') { w.sound('carHit', px, py, 0.35); return; }
    // seen from above the bullet lands on the edge: follow it a few px inside to find what it really hits
    const da = dirA - this.body.angle, ddx = Math.cos(da), ddy = Math.sin(da);
    let tank = false;
    for (let k = 0; k <= 30; k += 1.5) {
      const qx = sx + ddx * k, qy = sy + ddy * k;
      if (k <= 14 && this.inside(this.m.tank, qx, qy)) tank = true;
      if (k <= 8 && kind !== 'blunt') {
        for (let i = 0; i < 4; i++) {
          const [wx, wy] = this.m.wheels[i];
          if (this.tires[i] && Math.abs(qx - wx) < TYRE_HIT[0] && Math.abs(qy - wy) < TYRE_HIT[1]) { this.popTire(i, dirA); return; }
        }
      }
      if (kind === 'cut') continue;
      if (this.windows.wind < 2 && this.inside(this.m.wind, qx, qy)) { this.hitWindow('wind', qx, qy, dirA); return; }
      if (this.m.rear && this.windows.rear < 2 && this.inside(this.m.rear, qx, qy)) { this.hitWindow('rear', qx, qy, dirA); return; }
    }
    if (kind !== 'cut') this.breakLamp(this.lampAt(sx, sy), dirA);
    w.particles.chips(px, py, dirA + Math.PI, 0.9, 3, this.m.color, 120);
    w.sound('carHit', px, py, 0.6);
    if (melee) { this.scar(sx, sy, da, kind); return; }
    // body panel: bullet hole, sparks
    this.hole(sx, sy);
    w.particles.sparks(px, py, dirA + Math.PI, 0.9, 6, 260);
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

  // a dent pushed in by a bat, or the bright score of a blade (da: the blow's direction in sprite space)
  scar(sx, sy, da, kind) {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    if (kind === 'cut') {
      const a = da + Math.PI / 2 + rand(-0.4, 0.4), l = rand(3, 6);
      g.strokeStyle = 'rgba(225,225,235,0.6)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(sx - Math.cos(a) * l, sy - Math.sin(a) * l);
      g.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
      g.stroke();
    } else {
      const cx = sx + Math.cos(da) * 4, cy = sy + Math.sin(da) * 4;
      g.fillStyle = 'rgba(0,0,0,0.26)';
      g.beginPath(); g.ellipse(cx, cy, rand(4, 6.5), rand(3, 4.5), rand(0, Math.PI), 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(Math.round(cx - Math.cos(da) * 3) - 1, Math.round(cy - Math.sin(da) * 3), 3, 1);
    }
    g.restore();
  }

  // the lamp a hit on the nose or the tail lands on: the nearest one still whole at that end, or -1
  lampAt(sx, sy) {
    const end = sx > this.w - LAMP_END ? 0 : sx < LAMP_END ? 2 : -1;
    if (end < 0) return -1;
    const i = end + (sy < this.h / 2 ? 0 : 1);
    return this.lamps[i] ? i : this.lamps[i ^ 1] ? i ^ 1 : -1;
  }

  // smash one lamp: its light goes out for good, the socket stays dark with a few splinters of lens
  breakLamp(i, dirA) {
    const l = LIGHTING.propLights[this.type]?.[i];
    if (!l || !this.lamps[i]) return;
    this.lamps[i] = false;
    const sx = Math.round(l.x + this.w / 2), sy = Math.round(l.y + this.h / 2), g = this.g, w = this.world;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#120a14';
    g.fillRect(sx - 3, sy - 4, 6, 8);
    g.fillStyle = 'rgba(220,230,240,0.55)';
    for (let k = 0; k < 3; k++) g.fillRect(sx + Math.floor(rand(-3, 3)), sy + Math.floor(rand(-4, 4)), 1, 1);
    g.restore();
    const [px, py] = this.wpos(sx, sy);
    w.particles.glass(px, py, dirA + Math.PI, 1.2, 12, 140);
    w.sound('glass', px, py, 0.45);
  }

  // the emissive map, one quarter of the sprite per lamp still alive (x, y and the quarters in the map's own pixels)
  drawLamps(ctx, img, x, y) {
    if (this.lamps.every(Boolean)) { ctx.drawImage(img, x, y); return; }
    const hw = img.width / 2, hh = img.height / 2;
    this.lamps.forEach((on, i) => {
      if (!on) return;
      const sx = i < 2 ? hw : 0, sy = i % 2 ? hh : 0;
      ctx.drawImage(img, sx, sy, hw, hh, x + sx, y + sy, hw, hh);
    });
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
    // window explodes into the car / out the other side: the cabin shows through the hole
    this.clearGlass(which, '#140c1c');
    const px = this.glassPx[which], my = (r[2] + r[3]) / 2;
    g.save();
    g.fillStyle = 'rgba(190,240,255,0.6)';
    for (let k = 0; k < 14 && px.length; k++) g.fillRect(...px[Math.floor(rand(0, px.length))], this.k, this.k);
    g.fillStyle = '#3a2a3a';
    const hx = which === 'wind' ? r[0] + 1 : r[1] - 4; // seat headrests, next to the roof
    g.fillRect(hx, my - 11, 4, 7);
    g.fillRect(hx, my + 4, 4, 7);
    g.restore();
    const [cx, cy] = this.wpos((r[0] + r[1]) / 2, my);
    w.particles.glass(cx, cy, dirA, 1, 40, 220);
    const shards = glassShards();
    for (let k = 0; k < 12; k++) {
      const a = dirA + rand(-0.6, 0.6), v = rand(140, 380);
      w.addDebris(new Debris(w, shards[k % shards.length], cx + rand(-4, 4), cy + rand(-12, 12), rand(0, 6), Math.cos(a) * v, Math.sin(a) * v,
        rand(-0.8, 0.8), { mask: FREE, material: 'glass', air: 0.05, kg: 0.1, mu: 0.35, fly: 0.3, shadow: 0, harm: { kind: 'cut', knock: 2.4, lethal: 5.2 } }));
    }
    w.sound('glass', cx, cy);
    w.flashGlass(cx, cy);
    this.damage(2);
  }

  wpos(sx, sy) { const p = this.toWorld(sx, sy); return [p.x, p.y]; }

  clearGlass(which, color) {
    this.g.fillStyle = color;
    for (const [x, y] of this.glassPx[which]) this.g.fillRect(x, y, this.k, this.k);
  }

  // a slide across this vehicle (entry and exit points, world) is only allowed over the hood
  canSlide(ax, ay, bx, by) {
    const [h0, h1] = this.m.hood;
    return [this.toSprite(ax, ay), this.toSprite(bx, by)].every(({ sx }) => sx >= h0 - 2 && sx <= h1 + 2);
  }

  popTire(i, dirA) {
    if (!this.tires[i] || this.armoured) return;
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

  startAlarm() {
    if (this.alarm <= 0 && !this.exploded) this.alarm = 9;
  }

  damage(n) {
    if (this.exploded || this.armoured) return; // armoured: the getaway van (World)
    this.hp -= n;
    if (this.hp <= this.m.hp * 0.45 || this.fuel >= 3) this.ignite();
    if (this.hp <= 0) this.explode();
  }

  ignite() {
    if (this.burning || this.exploded || this.armoured) return;
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
    if (this.exploded || this.armoured) return;
    this.exploded = true;
    this.burning = false;
    this.alarm = 0;
    this.lamps.fill(false);
    const w = this.world;
    const { x, y } = this;
    w.explode(x, y, { radius: 160, source: 'car', origin: this });
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
    for (const key of ['wind', 'rear']) if (this.m[key]) this.clearGlass(key, '#0a0608');
    // the whole car jumps
    impulse(this.body, rand(0, Math.PI * 2), 1800, rand(-0.03, 0.03), 2);
    // parts fly
    const tire = spriteOpt('props/car_tire') || chunk('#141418', 20, 7);
    const harm = { kind: 'blunt', knock: 3, lethal: 8 };
    this.m.wheels.forEach(([wx, wy], i) => {
      const [px, py] = this.wpos(wx, wy);
      const a = Math.atan2(py - y, px - x) + rand(-0.4, 0.4), v = rand(200, 420);
      if (this.tires[i] || chance(0.6)) w.addDebris(new Debris(w, tire, px, py, rand(0, 6), Math.cos(a) * v, Math.sin(a) * v, rand(-0.6, 0.6), { mask: FREE, material: 'rubber', kg: 15, mu: 0.15, fly: 0.35, air: 0.03, bounce: 0.5, harm: { ...harm } }));
    });
    const hood = spriteOpt(this.m.sprite + '_hood') || slices(this.base, 4, 1)[3];
    const [hx, hy] = this.wpos((this.m.hood[0] + this.m.hood[1]) / 2, this.h / 2);
    const ha = Math.atan2(hy - y, hx - x) + rand(-0.5, 0.5);
    w.addDebris(new Debris(w, hood, hx, hy, this.body.angle, Math.cos(ha) * 340, Math.sin(ha) * 340, rand(-0.5, 0.5), { mask: FREE, material: 'metal', kg: 20, mu: 0.5, fly: 0.4, air: 0.03, harm: { ...harm } }));
    const door = spriteOpt(this.m.sprite + '_door') || chunk(this.m.color, 32, 5);
    for (const side of [-1, 1]) {
      const [dx, dy] = this.wpos(this.w * 0.5, side < 0 ? 0 : this.h);
      const a = Math.atan2(dy - y, dx - x) + rand(-0.3, 0.3), v = rand(220, 380);
      w.addDebris(new Debris(w, door, dx, dy, this.body.angle, Math.cos(a) * v, Math.sin(a) * v, rand(-0.5, 0.5), { mask: FREE, material: 'metal', kg: 25, mu: 0.55, fly: 0.35, harm: { ...harm } }));
    }
    for (let k = 0; k < 16; k++) {
      const a = rand(0, Math.PI * 2), v = rand(150, 450);
      w.addDebris(new Debris(w, chunk(chance(0.5) ? this.m.color : '#2a2a33', Math.floor(rand(2, 6)), Math.floor(rand(2, 4))), x + rand(-0.3, 0.3) * this.w, y + rand(-0.3, 0.3) * this.h,
        rand(0, 6), Math.cos(a) * v, Math.sin(a) * v, rand(-0.9, 0.9), { mask: FREE, material: 'metal', kg: 1 }));
    }
    // the tank goes a beat later
    const [tx, ty] = this.wpos((this.m.tank[0] + this.m.tank[1]) / 2, this.h / 2);
    w.after(0.35, () => {
      w.explode(tx, ty, { radius: 80, source: 'fuel', origin: this });
      w.particles.fire(tx, ty, 60, 260, { size: [4, 11], heat: 0 });
    });
    this.puddle = Math.max(this.puddle, 30);
    this.wreckFire = rand(9, 13);
  }

  // driven by a script (the getaway, systems/Outro.js): put where its route says. Nothing pushes it or stops it: its
  // hull no longer collides with anything, what it runs into is dealt with by ram()
  driveTo(x, y, angle) {
    const b = this.body;
    if (!this.moving) {
      this.moving = true;
      wake(b);
      b.sleepThreshold = Infinity;
      b.collisionFilter = { ...b.collisionFilter, mask: 0 };
    }
    if (b.isSleeping) Sleeping.set(b, false);
    Body.setPosition(b, { x, y });
    Body.setAngle(b, angle);
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
  }

  // What its hull runs into while it is driven along `heading`: a loose thing takes the blow and, if it holds, is
  // thrown to the side it was on; a bolted one is torn off; a parked car is shoved round, its alarm set off; anyone
  // standing there is run down. Things that never give (`lasting`), what hangs or sits on a wall are left alone.
  // seen: Map of what was hit -> when (a thing still under the wheels is hit again after R.again s); R: OUTRO.ram.
  // Returns how many things were hit this step.
  ram(heading, seen, R) {
    const w = this.world, b = this.body, t = w.time, bodies = [];
    for (const p of w.props) {
      const d = p.def || {};
      if (p !== this && !p.dead && !p.dying && p.body && !d.lasting && !d.fixture && !d.hung) bodies.push(p.body);
    }
    for (const c of w.characters()) if (c.alive && !c.hidden) bodies.push(c.body);
    let hits = 0;
    for (const col of Query.collides(b, bodies)) {
      const ob = col.parentA === b ? col.parentB : col.parentA, e = ob.entity;
      if (!e || e === this || t - (seen.get(e) ?? -Infinity) < R.again) continue;
      seen.set(e, t);
      hits++;
      const side = this.toSprite(e.x, e.y).sy < this.h / 2 ? -1 : 1, dir = heading + side * rand(...R.aside);
      const cx = e.x, cy = e.y;
      if (e.isVehicle) {
        wake(ob);
        Body.setVelocity(ob, { x: Math.cos(dir) * R.car, y: Math.sin(dir) * R.car });
        Body.setAngularVelocity(ob, side * R.carSpin);
        ob.flyUntil = t + R.fly;
        e.hit(0, cx, cy, heading, 1, 'blunt');
        w.sound('carHit', cx, cy, 1);
        w.particles.sparks(cx, cy, dir, 1, 10, 320);
      } else if (e.isPlayer || e.isEnemy || e.isCivilian) e.kill(heading, 'vehicle', this);
      else if (e.def.static) e.break(heading, R.tear);
      else {
        e.hit(R.crush, cx, cy, heading, 1.5, 'blunt');
        if (e.dead || e.dying) continue;
        wake(ob);
        const sp = rand(...R.fling);
        Body.setVelocity(ob, { x: Math.cos(dir) * sp, y: Math.sin(dir) * sp });
        Body.setAngularVelocity(ob, rand(-R.spin, R.spin));
        ob.flyUntil = t + R.fly;
      }
    }
    return hits;
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
        // the lamps still whole flash at each end
        for (const [sx, i] of [[this.w - 2, 0], [2, 2]]) {
          if (!this.lit || !(this.lamps[i] || this.lamps[i + 1])) continue;
          const p = this.toWorld(sx, this.h / 2);
          w.light(p.x, p.y, 60, '#ffb040', 0.2);
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
      w.particles.fire(hood.x + rand(-10, 10), hood.y + rand(-10, 10), 2, 40);
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
      if (chance(0.5)) w.light(this.x, this.y, 130 + rand(0, 30), '#ff6a18', 0.05);
      if (this.wreckFire <= 0) w.decals.scorch(this.x, this.y, 72);
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
      ctx.translate(ox + wx, oy + wy);
      if (wx > this.w / 2 && this.steer) ctx.rotate(this.steer);
      if (flat) ctx.scale(1.15, 0.6);
      if (tire) ctx.drawImage(tire, -sw(tire) / 2, -sh(tire) / 2, sw(tire), sh(tire));
      else { ctx.fillStyle = '#141418'; ctx.fillRect(-10, -3.5, 20, 7); }
      ctx.restore();
    });
    const jx = this.flash > 0 ? rand(-1, 1) : 0;
    sagY += this.bob;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(silhouette(this.base), ox + 3, oy + 3, this.w, this.h);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.canvas, ox + sagX + jx, oy + sagY, this.w, this.h);
    if (this.trunk?.open && !this.exploded) {
      // the open trunk: its dark well (with what is still in it), the lid standing up against the rear window; seen
      // from above, its edge runs from the bumper to the window as it comes up
      const t = this.trunk, x0 = ox + 5 + sagX, y0 = oy + 9 + sagY, n = this.m.tank[1] - 9, k = t.lift ?? 1, e = Math.round(n * k);
      ctx.fillStyle = '#08080e'; ctx.fillRect(x0, y0, e, this.h - 18);
      if (t.item && e > 4) {
        const img = sprite(WEAPONS[t.item].sprite);
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, e, this.h - 18); ctx.clip();
        ctx.translate(x0 + n / 2, y0 + (this.h - 18) / 2);
        ctx.rotate(Math.PI / 2 - 0.3);
        ctx.scale((img.k || 1) * BODY_SCALE, (img.k || 1) * BODY_SCALE); // a finer sprite (Assets.js `density`), at people's scale
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
      }
      ctx.fillStyle = this.m.color; ctx.fillRect(x0 + e, y0 - 1, 3, this.h - 16);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x0 + e + 2, y0 - 1, 1, this.h - 16);
    }
    if (this.glow && !this.lightsOut) {
      const blink = this.alarm > 0 ? (Math.floor(this.alarm * 2.4) % 2 === 0 ? 1 : 0.15) : 0.85;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = blink;
      ctx.save();
      ctx.translate(ox + sagX, oy + sagY);
      ctx.scale(this.glow.k || 1, this.glow.k || 1);
      this.drawLamps(ctx, this.glow, 0, 0);
      ctx.restore();
      // brake lights: the tail lamps flare up
      if (this.brake > 0.05) {
        ctx.fillStyle = '#ff2040';
        ctx.globalAlpha = this.brake * 0.9;
        (LIGHTING.propLights[this.type] || []).forEach((l, i) => {
          if (!l.cone && this.lamps[i]) ctx.fillRect(l.x - 2 + sagX, l.y - 3 + sagY, 4, 6);
        });
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
}
