import { CAT, MASK, LIGHTING, BODY_SCALE } from '../Config.js';
import { SEAT } from '../data/feel.js';
import { CHASE } from '../data/chase.js';
import { READABILITY } from '../data/readability.js';

// parts thrown out of the car must not collide with the car body they spawn inside
const FREE = MASK.DEBRIS & ~CAT.PROP;
import { sprite, spriteOpt, silhouette, chunk, glassShards, slices, sw, sh, drawSprite } from '../../engine/Assets.js';
import { rand, chance, clamp, local, angDiff, stepAngle, TAU } from '../../engine/math.js';
import Debris from './Debris.js';
import { CAR_PARTS } from '../data/destruction.js';
import { WEAPONS } from '../data/weapons.js';
import { setMaterial, impulse, scaleInertia, wake } from '../../engine/physics/Body.js';

const { Bodies, Body, Sleeping, Query } = Matter;

// Sprite-space layout of each model (real size, facing +x; must match tools/sprites/vehicles.py).
// Regions: [x0, x1, y0, y1]; hood: [x0, x1]; wheels: tyre centres (they stick out a little past the sides).
// Sprites: car (sedan) and pursuer 140x58, car2 (coupe) 134x56, van 160x64, convertible 172x64; the hitbox is the
// sprite minus 2 px all round.
// A model may give (systems/Drive.js reads the first two, else its own shares of the size): seat: [x, y] the driver's
// seat (seatIn, CharacterAnim.seatPose), door: [x, y] the ground one stands on outside the driver's door (-y side).
// An open car also has: cabin (the open well: who sits in it is seen, and can be shot), wheel: [x, y, a, b] the
// steering wheel seen from above (a thin ring: a half its width across the car, b half its depth along it), key: [x, y]
// the ignition, pipes: its exhausts' ends, hat: [x, y, sprite] what lies on the rear seat until a hard swing throws it
// out (throwHat), gun: [x, y, angle, weapon] a gun lying on the passenger seat (x, y: its grip, where a hand takes it;
// drawn by the car until it is taken: systems/Drive.js grab; never a pickup).
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
  // THE BOSS's convertible, roof down (5.4 x 2.0 m): the getaway of level 1, the car driven in level 2
  convertible: {
    sprite: 'props/convertible', hp: 36, kg: 2100, color: '#ece2c8',
    wind: [113, 118, 7, 57], rear: null, tank: [0, 30, 0, 64], hood: [120, 166],
    wheels: [[36, 2], [36, 62], [140, 2], [140, 62]],
    seat: [93, 19.5], door: [93, -13], cabin: [55, 113, 7, 57], wheel: [103.6, 19.5, 5.4, 1.6], key: [105.5, 26.5],
    pipes: [[1, 17], [1, 47]], hat: [71.5, 44.5, 'props/boss_hat'],
    gun: [96, 40, 1.22, 'uzi'], // the boss's Uzi on the passenger cushion, over the cigar burn, its muzzle to that door
  },
  // the boss's men (systems/Pursuit.js): the sedan in black with one pink stripe, its layout the sedan's; it takes
  // a long burst to stop (CHASE.pursuit.rounds: its damage in stages)
  pursuer: {
    sprite: 'props/pursuer', hp: 75, kg: 1250, color: '#2a2428',
    wind: [82, 96, 11, 46], rear: [35, 44, 11, 46], tank: [0, 26, 0, 58], hood: [98, 134],
    wheels: [[30, 2], [30, 56], [112, 2], [112, 56]],
  },
};

const GUN_SHADOW = 0.55;  // the gun on the seat: its contact shadow's alpha
const TYRE_HIT = [11, 5]; // half extents of a tyre's hit box (sprite px)
const LAMP_END = 10;      // a hit this close to the nose / tail (sprite px) lands on a lamp
const BURN = 0.45;        // share of its hp left at which it catches fire (damage)
const LEAK = 3;           // rounds in its tank that set the leak alight (damage)

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
    this.puddle = 0;    // radius of the fuel it has leaked (poured on the floor)
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
    this.squat = 0;                        // px the body sits back on its rear wheels (the power going down; -: it dives)
    this.roll = 0;                         // px the body leans across its wheels (+: toward +y; systems/Drive.js springs)
    this.lift = 0;                         // px the body is thrown up off its shadow (a bump, a hit)
    this.rider = null;                     // who sits in the driver's seat (seatIn; `driver` is what drives it: systems/Drive.js)
    this.hat = !!this.m.hat;               // what lies on the rear seat is still there
    this.gun = !!this.m.gun;               // the gun on the passenger seat is still there
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

  // ---- the driver's seat (models with a `seat`). Anyone can be sat in it: from then on the car carries him (his
  // place, the way he faces, his speed: the wind in his coat) and, in an open car, draws him (he is no longer drawn
  // with the others while `riding`); what becomes of his body in the world is the caller's business.
  seatSpot() { return this.toWorld(...this.m.seat); }

  // the top of the driver's door (far: of the other side's, across the car), where a hand goes to vault it (an open
  // car)
  sillSpot(far = false) {
    const y = this.m.cabin[2] * 0.5;
    return this.toWorld(this.m.door[0], far ? this.h - y : y);
  }

  seatIn(ch) {
    if (!this.m.seat) return false;
    this.rider = ch;
    ch.riding = { v: this, k: ch.riding?.v === this ? ch.riding.k : 0, aim: null, key: 0 };
    ch.gait = 0;
    this.carry(0);
    return true;
  }

  // the man at the wheel shot dead where he sits (the chase's told shot): he stays in the seat, slumped over the wheel
  // (CharacterAnim.seatPose), the car carrying him on
  slumpIn() {
    if (this.rider?.riding) { this.rider.riding.slump = 0.01; this.rider.riding.aim = null; }
  }

  unseat() {
    const ch = this.rider;
    if (ch) ch.riding = null;
    this.rider = null;
    return ch;
  }

  // the driver goes with the car (every step, and again as it is drawn)
  carry(dt) {
    const ch = this.rider, q = this.seatSpot();
    if (dt > 0) {
      ch.vel = { x: (q.x - ch.x) / (dt * 60), y: (q.y - ch.y) / (dt * 60) };
      const r = ch.riding;
      r.k = Math.min(1, r.k + dt / SEAT.settle);
      // the arm out with the gun or back (seatPose), the way it last pointed kept for the way back
      const aims = r.aim !== null && r.aim !== undefined;
      if (aims) r.was = r.aim;
      r.up = clamp((r.up ?? 0) + (aims ? dt : -dt) / SEAT.raise, 0, 1);
      // which hand has the gun: the door's (-1) until he aims well past the nose to his right, the right one (1)
      // until he aims well past it to his left (SEAT.aim.swap either way: no flutter dead ahead); r.hand 0 .. 1 is
      // the gun's way from the one to the other, eased; the arm down, it is back in the door's hand
      if (aims) {
        const off = angDiff(this.body.angle, r.aim), sw = SEAT.aim.swap;
        if (!r.side) r.side = off > sw ? 1 : -1;
        else if (r.side * off < -sw) r.side = -r.side;
      } else if (r.up <= 0) r.side = 0;
      r.hand = clamp((r.hand ?? 0) + (aims && r.side > 0 ? dt : -dt) / SEAT.aim.pass, 0, 1);
      if (ch.riding.slump) ch.riding.slump = Math.min(1, ch.riding.slump + dt / SEAT.slump.t); // shot at the wheel (slumpIn)
    }
    Body.setPosition(ch.body, q);
    ch.angle = this.body.angle;
  }

  // a round crossing the open cabin (sprite point and direction) passes within reach of the man at the wheel
  crossesSeat(sx, sy, ddx, ddy) {
    const m = this.m;
    if (!this.rider?.alive || !m.cabin) return false;
    const [x, y] = m.seat, t = (x - sx) * ddx + (y - sy) * ddy;
    return t > 0 && t < this.w && Math.hypot(sx + ddx * t - x, sy + ddy * t - y) < SEAT.hit;
  }

  // what lay on the rear seat thrown out along a at v px/s: it flies, lands and stays where it falls. Returns the
  // piece, or null when there was nothing (left) to throw.
  throwHat(a, v) {
    const m = this.m, img = this.hat && spriteOpt(m.hat[2]);
    if (!this.hat) return null;
    this.hat = false;
    if (!img) return null;
    const [x, y] = this.wpos(m.hat[0], m.hat[1]), w = this.world;
    const d = new Debris(w, img, x, y, rand(0, 6.28), Math.cos(a) * v, Math.sin(a) * v, rand(-0.25, 0.25),
      { mask: FREE, material: 'wood', kg: 0.2, mu: 0.8, air: 0.2, z: 9, vz: 150, bounce: 0.1, lift: 0.6 });
    w.addDebris(d);
    return d;
  }

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
    // an open car: a round that crosses the cabin by the driver's seat is his
    if (!melee && this.crossesSeat(sx, sy, ddx, ddy)) {
      const r = this.rider;
      r.kill(dirA, 'bullet');
      if (!r.alive) this.unseat(); // (his body is the world's from here)
    }
    let tank = false;
    for (let k = 0; k <= 30; k += 1.5) {
      const qx = sx + ddx * k, qy = sy + ddy * k;
      if (k <= 14 && this.inside(this.m.tank, qx, qy)) tank = true;
      if (k <= 8 && kind !== 'blunt') {
        for (let i = 0; i < 4; i++) {
          const [wx, wy] = this.m.wheels[i];
          if (this.tires[i] && Math.abs(qx - wx) < TYRE_HIT[0] && Math.abs(qy - wy) < TYRE_HIT[1] && this.tyreHit(i, px, py, dirA, melee)) return;
        }
      }
      if (kind === 'cut') continue;
      if (this.windows.wind < 2 && this.inside(this.m.wind, qx, qy)) { this.hitWindow('wind', qx, qy, dirA, kind); return; }
      if (this.m.rear && this.windows.rear < 2 && this.inside(this.m.rear, qx, qy)) { this.hitWindow('rear', qx, qy, dirA, kind); return; }
    }
    if (kind !== 'cut') this.breakLamp(this.lampAt(sx, sy), dirA);
    w.particles.chips(px, py, dirA + Math.PI, 0.9, 3, this.m.color, 120);
    w.sound('carHit', px, py, 0.6);
    if (melee) { this.scar(sx, sy, da, kind); return; }
    // body panel: bullet hole, sparks (and the hot ones that bounce: systems/CarFx.js)
    this.hole(sx, sy);
    w.particles.sparks(px, py, dirA + Math.PI, 0.9, 6, 260);
    w.events?.emit('carStruck', { car: this, x: px, y: py, dirA, tank });
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

  // kind: what broke it (a round's kind; none: a blast, a crash)
  hitWindow(which, sx, sy, dirA, kind = null) {
    const w = this.world;
    const r = this.m[which];
    const state = ++this.windows[which];
    const g = this.g;
    if (state <= 2) w.events?.emit('carPart', { car: this, part: which, dirA, kind }); // a round through it? (systems/Pursuit.js)
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

  // A hit on tyre i at (px, py); false: the round goes on into the car. It goes at once, or, with `tread` (a
  // pursuer's, systems/Pursuit.js: { hp, skip }), once `hp` rounds have gone into it, each within `skip` rad of
  // square on its flank: one at more of a slant skips off the rubber (a burst at the body from well behind or ahead
  // lands on the wheel arch, and is the body's), one that counts chews it up (chips, a puff)
  tyreHit(i, px, py, dirA, melee) {
    const T = this.tread;
    if (T && !melee) {
      if (Math.abs(Math.sin(dirA - this.body.angle)) < Math.cos(T.skip)) return false;
      if (((this.tyreWear ||= [0, 0, 0, 0])[i] += 1) < T.hp) {
        this.world.particles.chips(px, py, dirA + Math.PI, 0.9, 4, '#141418', 120);
        this.world.particles.smoke(px, py, 2, 2, { speed: 40, size: 3, life: 0.5 });
        this.world.sound('carHit', px, py, 0.4);
        return true;
      }
    }
    this.popTire(i, dirA);
    return true;
  }

  popTire(i, dirA) {
    if (!this.tires[i] || this.armoured) return;
    this.tires[i] = false;
    const w = this.world;
    w.events?.emit('carPart', { car: this, part: 'tyre', i, dirA });
    const [px, py] = this.wpos(...this.m.wheels[i]);
    w.sound('tirePop', px, py);
    w.particles.chips(px, py, dirA, Math.PI, 16, '#141418', 200);
    w.particles.smoke(px, py, 8, 3, { speed: 90, size: 5, life: 1.2 });
    w.shake(0.15);
    w.noise(px, py, 300);
    this.damage(2);
  }

  // (none in a car somebody is driving at him: systems/Pursuit.js `noAlarm`)
  startAlarm() {
    if (this.alarm <= 0 && !this.exploded && !this.noAlarm) this.alarm = 9;
  }

  // It catches fire with `burnAt` of its hp left, or `leakAt` rounds in its tank (a pursuer sets its own:
  // systems/Pursuit.js); all its hp gone, it blows up, or, `late`, only when its fire's fuse is out (a pursuer: off
  // to the side of the road by then, never by his car)
  damage(n) {
    if (this.exploded || this.armoured) return; // armoured: the getaway car (World)
    this.hp -= n;
    if (this.hp <= this.m.hp * (this.burnAt ?? BURN) || this.fuel >= (this.leakAt ?? LEAK)) this.ignite();
    if (this.hp <= 0 && !this.late) this.explode();
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
    for (const key of ['wind', 'rear']) if (this.m[key] && this.windows[key] < 2 && chance(0.4 + k)) { this.windows[key] = 1; this.hitWindow(key, (this.m[key][0] + this.m[key][1]) / 2, this.h / 2, a); }
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
    if (!w.drive?.on) w.slowmo(0.3, 0.6); // (never at the wheel: the chase has no slow motion)
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
    // parts fly (its tyres burning: systems/CarFx.js, on 'carBlast')
    const tire = spriteOpt('props/car_tire') || chunk('#141418', 20, 7);
    const harm = { kind: 'blunt', knock: 3, lethal: 8 };
    const pieces = [], thrown = (d) => { pieces.push(d); return d; };
    this.m.wheels.forEach(([wx, wy], i) => {
      const [px, py] = this.wpos(wx, wy);
      const a = Math.atan2(py - y, px - x) + rand(-0.4, 0.4), v = rand(200, 420);
      if (this.tires[i] || chance(0.6)) w.addDebris(thrown(new Debris(w, tire, px, py, rand(0, 6), Math.cos(a) * v, Math.sin(a) * v, rand(-0.6, 0.6), { mask: FREE, material: 'rubber', kg: 15, mu: 0.15, fly: 0.35, air: 0.03, bounce: 0.5, harm: { ...harm } })));
    });
    w.events?.emit('carBlast', { car: this, x, y, pieces });
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
    for (let k = 0; k < CAR_PARTS.blast; k++) this.shed(x + rand(-0.3, 0.3) * this.w, y + rand(-0.3, 0.3) * this.h, rand(0, Math.PI * 2), rand(180, 420), true);
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

  // What its hull runs into while it is driven along `heading` at `speed` px/step: a loose thing takes the blow and,
  // if it holds, is thrown to the side it was on; a bolted one is torn off; a parked car is rammed (shove) and never
  // driven through; anyone standing there is run down. Things that never give (`lasting`), what hangs or sits on a
  // wall are left alone. seen: Map of what was hit -> when (a thing still under the wheels is hit again after R.again
  // s; a car once); R: OUTRO.ram. each: called for each thing hit (it, where it was, the way it is sent). Returns how
  // many things were hit this step.
  ram(heading, seen, R, each = null, speed = 0) {
    const w = this.world, b = this.body, t = w.time, bodies = [];
    for (const p of w.props) {
      const d = p.def || {};
      if (p !== this && !p.dead && !p.dying && p.body && !d.lasting && !d.fixture && !d.hung) bodies.push(p.body);
    }
    for (const c of w.characters()) if (c.alive && !c.hidden) bodies.push(c.body);
    let hits = 0;
    for (const col of Query.collides(b, bodies)) {
      const ob = col.parentA === b ? col.parentB : col.parentA, e = ob.entity;
      if (!e || e === this) continue;
      if (e.isVehicle) {
        const first = !seen.has(e);
        seen.set(e, t);
        const at = this.shove(e, col, heading, speed, first, R);
        if (!first) continue;
        hits++;
        each?.(e, at.x, at.y, at.dir);
        continue;
      }
      if (t - (seen.get(e) ?? -Infinity) < R.again) continue;
      seen.set(e, t);
      hits++;
      const side = this.toSprite(e.x, e.y).sy < this.h / 2 ? -1 : 1, dir = heading + side * rand(...R.aside);
      const cx = e.x, cy = e.y;
      each?.(e, cx, cy, dir);
      if (e.isPlayer || e.isEnemy || e.isCivilian) e.kill(heading, 'vehicle', this);
      else if (e.def.static || e.tipped) e.break(heading, R.tear); // a bin already down is flattened
      else {
        e.hit(R.crush, cx, cy, heading, 1.5, 'blunt');
        if (e.dead || e.dying) continue;
        const eb = e.body; // a new one if the blow knocked it over (systems/Tipping.js)
        wake(eb);
        const sp = rand(...R.fling);
        Body.setVelocity(eb, { x: Math.cos(dir) * sp, y: Math.sin(dir) * sp });
        Body.setAngularVelocity(eb, rand(-R.spin, R.spin));
        eb.flyUntil = t + R.fly;
      }
    }
    return hits;
  }

  // A car this one is driven into (ram, col: their contact) is never gone through: every step they touch it is pushed
  // out of the hull (along the contact's normal, by its depth; never back against the hull's way). The first touch is
  // the blow: thrown along the hull's way, off to the side it was on (R.carAside), at
  // R.carK of the hull's speed (R.car at least), spun by where it was struck, both scaled down for a graze (R.bite px
  // of the hull's width in it: the full blow; R.graze at least), crumpled there (crunch). Returns where it was struck
  // and the way it was sent.
  shove(e, col, heading, speed, first, R) {
    const ob = e.body, n = col.normal, k = col.supportCount || 1, h = { x: Math.cos(heading), y: Math.sin(heading) };
    let out = (e.x - this.x) * n.x + (e.y - this.y) * n.y < 0 ? -1 : 1, nx = n.x * out, ny = n.y * out;
    if (nx * h.x + ny * h.y < -0.1) { // never pushed back against the hull's way: aside, to the side it is on
      out = (e.x - this.x) * -h.y + (e.y - this.y) * h.x < 0 ? -1 : 1;
      nx = -h.y * out; ny = h.x * out;
    }
    let x = 0, y = 0;
    for (let i = 0; i < k; i++) { x += col.supports[i].x / k; y += col.supports[i].y / k; }
    wake(ob);
    if (ob.isSleeping) Sleeping.set(ob, false);
    let dir = heading;
    if (first) {
      // how much of the hull's width it is in the way of (a graze: a nudge; a corner taken square: the full blow)
      const lx = -Math.sin(heading), ly = Math.cos(heading), half = this.h / 2 - 2;
      const across = ob.vertices.map((p) => (p.x - this.x) * lx + (p.y - this.y) * ly);
      const bite = Math.min(half, Math.max(...across)) - Math.max(-half, Math.min(...across));
      const blow = clamp(bite / R.bite, R.graze, 1), side = this.toSprite(e.x, e.y).sy < this.h / 2 ? -1 : 1;
      const sp = Math.max(R.car, speed * R.carK) * blow;
      dir = heading + side * rand(...R.carAside);
      Body.setVelocity(ob, { x: Math.cos(dir) * sp, y: Math.sin(dir) * sp });
      const lever = (x - e.x) * Math.sin(dir) - (y - e.y) * Math.cos(dir); // the blow's turn about its middle
      Body.setAngularVelocity(ob, Math.sign(lever) * R.carSpin * blow);
      ob.flyUntil = this.world.time + R.carFly;
      e.crunch(x, y, dir, R);
    }
    Body.translate(ob, { x: nx * col.depth, y: ny * col.depth });
    return { x, y, dir };
  }

  // One of its real pieces torn off at (x, y) and thrown along a at v px/s (CAR_PARTS): a bumper (chrome, or black
  // plastic on the newer models), a mirror, a hubcap, a headlight, its plate, a bit of grille. Blows tear off
  // CAR_PARTS.most at most; a blast (all) takes what it likes. `which`: that piece (a mirror scraped off)
  shed(x, y, a, v, all = false, which = null) {
    const P = CAR_PARTS;
    if (!all && (this.shedN = (this.shedN || 0) + 1) > P.most) return;
    let name = which ?? P.pieces[Math.floor(rand(0, P.pieces.length))];
    if (name === 'car_bumper' && P.black.includes(this.m.sprite)) name = 'car_bumper_black';
    const img = spriteOpt('props/' + name);
    if (!img) return;
    this.world.addDebris(new Debris(this.world, img, x, y, rand(0, 6.28), Math.cos(a) * v, Math.sin(a) * v, rand(-0.7, 0.7),
      { mask: FREE, material: name === 'car_headlight' ? 'glass' : 'metal', kg: P.kg, mu: 0.45, fly: 0.3, air: 0.03 }));
  }

  // Rammed by a car (shove) at (x, y) world, the blow going along dirA: the bodywork crumpled there (a dent and
  // R.dents more round it, the glass cracked if the blow reaches it), the lamp at that end smashed when the point is
  // within R.lamp px of it, paint and trim thrown off, sparks, its alarm; the blow costs it R.carHp.
  crunch(x, y, dirA, R) {
    const w = this.world, { sx, sy } = this.toSprite(x, y), da = dirA - this.body.angle;
    this.hit(0, x, y, dirA, 1, 'blunt');
    for (let i = 0; i < R.dents; i++) this.scar(clamp(sx + rand(-10, 10), 3, this.w - 3), clamp(sy + rand(-6, 6), 3, this.h - 3), da, 'blunt');
    if (Math.min(sx, this.w - sx) < R.lamp) this.breakLamp((sx < this.w / 2 ? 2 : 0) + (sy < this.h / 2 ? 0 : 1), dirA);
    if (chance(CAR_PARTS.crunch)) this.shed(x, y, dirA + rand(-0.8, 0.8), rand(120, 260));
    for (let i = 0; i < R.chunks; i++) {
      const a = dirA + rand(-1, 1), v = rand(90, 260);
      w.addDebris(new Debris(w, chunk(chance(0.6) ? this.m.color : '#2a2a33', Math.floor(rand(2, 5)), Math.floor(rand(1, 3))), x, y,
        rand(0, 6), Math.cos(a) * v, Math.sin(a) * v, rand(-0.9, 0.9), { mask: FREE, material: 'metal', kg: 0.5 }));
    }
    w.particles.sparks(x, y, dirA, 1.1, 16, 340);
    w.particles.chips(x, y, dirA, 1.2, 10, this.m.color, 200);
    w.sound('carRam', x, y, 1); // placeholder (assets/sound/PLACEHOLDERS.md)
    w.noise(x, y, 520);
    this.damage(R.carHp);
  }

  update(dt) {
    const w = this.world;
    if (this.rider) this.carry(dt);
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
    // (its engine's smoke, by how damaged it is, and its soot once it burns: systems/CarFx.js)
    // the fuel leaking under it runs on the floor (systems/Liquids.js), its puddle growing to about that radius
    if (this.fuel > 0 && this.puddle < 8 + this.fuel * 5) {
      const r0 = this.puddle;
      this.puddle += dt * 2.5;
      w.liquids?.feed(tank.x, tank.y, Math.PI * (this.puddle * this.puddle - r0 * r0), 'petrol');
    }
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
      w.smoke?.burn(p.x, p.y, 'wreck', dt);
      if (chance(0.15)) w.particles.embers(p.x, p.y, 1, 90);
      if (chance(0.06)) w.sound('crackle', p.x, p.y, 0.5);
      if (chance(0.5)) w.light(this.x, this.y, 130 + rand(0, 30), '#ff6a18', 0.05);
      if (this.wreckFire <= 0) w.decals.scorch(this.x, this.y, 72);
    }
  }

  // the gun lying on the passenger seat, its grip at (x, y) (car space): drawn as the hand that takes it will hold it
  // (CharacterAnim drawWeapon: at the size of a man sat at the wheel, SEAT.s), a contact shadow under it, the dark rim
  // that makes a weapon read against what it lies on
  drawGun(ctx, x, y) {
    const d = WEAPONS[this.m.gun[3]], img = d && spriteOpt(d.sprite);
    if (!img) return;
    const k = img.k || 1, sc = BODY_SCALE * SEAT.s, x0 = -d.grip / k, y0 = -img.height / 2 - (d.palm ?? 0) / k;
    const at = (ox, oy, alpha) => {
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(this.m.gun[2]);
      ctx.scale(sc * k, sc * k);
      ctx.globalAlpha *= alpha;
    };
    at(1.2, 1.2, GUN_SHADOW);
    ctx.drawImage(silhouette(img), x0, y0);
    ctx.restore();
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      at(ox * READABILITY.held.px, oy * READABILITY.held.px, READABILITY.held.gun);
      ctx.drawImage(silhouette(img), x0, y0);
      ctx.restore();
    }
    at(0, 0, 1);
    ctx.drawImage(img, x0, y0);
    ctx.restore();
  }

  // Where and how it is drawn: { x, y, a }. As its body is; but a DRIVEN car, while the picture is held on whole px
  // (the camera's `pixel`: at the wheel, level 2A), on the picture's px grid and on one of CHASE.pixel.steps angles
  // (stepAngle: kept with a little slack, so it never flickers between two). A sprite turned by a new float angle
  // or put between two px every frame crawls: that was the blur of the car in motion. The body keeps its real place
  // and angle; `drawn` is the pose when it is not the body's (null otherwise)
  pose() {
    const b = this.body;
    return (this.drawn = this.snapped()) ?? { x: b.position.x, y: b.position.y, a: b.angle };
  }

  // the pose it would be drawn at from its body as it is now, or null when that is the body's own (pure: pose keeps it)
  snapped() {
    const b = this.body, cam = this.world.camera, z = this.moving && cam?.pixel ? cam.z : 0;
    if (!z || z % 1) return null;
    const P = CHASE.pixel, snap = (n) => Math.round(n * z) / z;
    return { x: snap(b.position.x), y: snap(b.position.y), a: stepAngle(b.angle, this.drawn?.a, TAU / P.steps, P.slack) };
  }

  // Where its shell is, as drawn: the pose and the body on its springs (`sag`, sprite px). What is laid on the car
  // but drawn elsewhere reads this, never the body: its lamps' light and their glow (render/Lighting.js). Placed from
  // the body, the beams swung on the body's float angle while the sprite stood on one of its 64 (and the lamps' pools
  // sat up to 6 px off the drawn nose in a turn): the lights read as trailing the car
  shell() {
    const at = this.pose(), [gx, gy] = this.sag || [0, 0], c = Math.cos(at.a), s = Math.sin(at.a);
    return { x: at.x + gx * c - gy * s, y: at.y + gx * s + gy * c, a: at.a };
  }

  // What goes with the car but is placed from its body (the man sat in it, one leaning out of its window:
  // render/PursuitArt.js) is drawn in the car's frame as IT is drawn (pose), gx / gy sprite px further (the body on
  // its springs): fn draws it in world px, as ever
  carried(ctx, fn, gx = 0, gy = 0) {
    const b = this.body, at = this.drawn ?? { x: b.position.x, y: b.position.y, a: b.angle };
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(at.a);
    ctx.translate(gx, gy);
    ctx.rotate(-b.angle);
    ctx.translate(-b.position.x, -b.position.y);
    fn();
    ctx.restore();
  }

  // The same for one point p ({ x, y }, a: a way, turned with it) placed from the body: where it is seen. A draw's
  // (the muzzle of a gun in the car as the flash and the tracer start from it), never the simulation's. at: the pose
  // it is drawn at (the last drawn one by default)
  carriedAt(p, gx = 0, gy = 0, at = this.drawn) {
    const b = this.body;
    if (!at) at = { x: b.position.x, y: b.position.y, a: b.angle };
    const ca = Math.cos(at.a), sa = Math.sin(at.a), da = at.a - b.angle, c = Math.cos(da), s = Math.sin(da);
    const dx = p.x - b.position.x, dy = p.y - b.position.y;
    return { x: at.x + gx * ca - gy * sa + dx * c - dy * s, y: at.y + gx * sa + gy * ca + dx * s + dy * c, a: (p.a ?? 0) + da };
  }

  draw(ctx) {
    const at = this.pose();
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(at.a);
    const ox = -this.w / 2, oy = -this.h / 2;
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
    // the body over its wheels, in half px (the sprite's own pixels: it never sits between two of them); thrown up,
    // it leaves its shadow. Held on whole px at an odd zoom (pose), in whole px: half a px is then a px and a half of
    // the picture, and a sprite painted twice as fine would change the width of its pixels each time it rolls
    const per = this.drawn && this.world.camera.z % 2 ? 1 : 2;
    const lift = Math.round(this.lift * per) / per;
    sagY = Math.round((sagY + this.bob + this.roll - lift * 0.5) * per) / per;
    sagX = Math.round((sagX - this.squat - lift * 0.5) * per) / per;
    this.sag = [sagX, sagY];
    ctx.globalAlpha = 0.4;
    ctx.drawImage(silhouette(this.base), ox + 3 + Math.max(-1.5, lift * 0.5), oy + 3 + Math.max(-1.5, lift * 0.5), this.w, this.h);
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
    if (this.gun && !this.exploded) this.drawGun(ctx, ox + this.m.gun[0] + sagX, oy + this.m.gun[1] + sagY);
    if (this.hat && !this.exploded) {
      const hat = spriteOpt(this.m.hat[2]), hx = ox + this.m.hat[0] + sagX, hy = oy + this.m.hat[1] + sagY;
      if (hat) { drawSprite(ctx, silhouette(hat), hx + 1.5, hy + 1.5, 0, 0.4); drawSprite(ctx, hat, hx, hy, 0); }
    }
    ctx.restore();
    // who sits in the open cabin, over the seats (a closed car hides him)
    if (this.rider && this.m.cabin && !this.exploded) {
      this.carry(0);
      // (he goes with the body on its springs, in the car's frame as it is drawn)
      this.carried(ctx, () => this.rider.draw(ctx), ...this.sag);
    }
  }
}
