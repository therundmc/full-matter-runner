import { CAT, MASK, MAX_DEBRIS } from '../Config.js';
import { PROPS } from '../data/props.js';
import { sprite, spriteOpt, slices, chunk, drawSprite, silhouette } from '../../engine/Assets.js';
import { rand, chance, angDiff, clamp } from '../../engine/math.js';
import Debris from './Debris.js';
import { setMaterial, impulse, scaleInertia } from '../../engine/physics/Body.js';

const { Bodies } = Matter;

// a canvas with an irregular blob path of radius r around (x, y)
function jagged(g, x, y, r) {
  g.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), rr = r * rand(0.55, 1.15);
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function opaqueEnough(c, min = 6) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 40 && ++n >= min) return true;
  return false;
}

// how big a bite each kind of hit takes, relative to the object
const BITE = { pellet: 0.6, bullet: 1, rifle: 0.8, blunt: 1.7, blast: 1.4 };
// damage states, by fraction of hit points left: cracked, split, giving way
const STAGES = [0.7, 0.45, 0.2];

// Furniture and street dressing. Every hit bites a piece out where it landed (the piece flies off), and the object
// goes through damage states (cracked -> split -> giving way) before what is left falls apart.
export default class Prop {
  constructor(world, type, x, y, angle = 0) {
    this.world = world;
    this.type = type;
    this.def = PROPS[type];
    if (!this.def) throw new Error('unknown prop ' + type);
    this.img = spriteOpt('props/' + type) || sprite(type.startsWith('neon') ? 'props/tv' : 'props/trash_can');
    this.hp = this.def.hp;
    const d = this.def;
    const opts = {
      isStatic: !!d.static, angle, label: 'prop',
      frictionAir: 0.02, friction: 0.4, restitution: 0.1,
      collisionFilter: { category: CAT.PROP, mask: MASK.PROP },
    };
    this.body = d.r ? Bodies.circle(x, y, d.r, opts) : Bodies.rectangle(x, y, d.w, d.h, opts);
    if (!d.static) {
      setMaterial(this.body, d.kg, d.mu);
      scaleInertia(this.body, 4);
      world.physics.freezeIfHeavy(this.body);
    }
    this.body.entity = this;
    this.body.material = d.material;
    this.dead = false;
    this.flash = 0;
    this.canvas = null; // per-instance copy of the sprite, created on the first bite
    this.stage = 0;     // damage states reached
    this.sag = 0;       // slight tilt once it is giving way
    world.addBody(this.body);
  }

  get look() { return this.canvas || this.img; }

  // world point -> sprite pixel
  toSprite(px, py) {
    const a = -this.body.angle, dx = px - this.x, dy = py - this.y;
    return { sx: dx * Math.cos(a) - dy * Math.sin(a) + this.img.width / 2, sy: dx * Math.sin(a) + dy * Math.cos(a) + this.img.height / 2 };
  }

  ensureCanvas() {
    if (this.canvas) return this.canvas.getContext('2d');
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.img.width; this.canvas.height = this.img.height;
    const g = this.canvas.getContext('2d');
    g.drawImage(this.img, 0, 0);
    return g;
  }

  // tear a piece out of the object around a hit point; the piece flies off
  bite(px, py, dirA, scale) {
    const img = this.img;
    this.ensureCanvas();
    // bite slightly inside the edge the bullet entered through
    const { sx, sy } = this.toSprite(px + Math.cos(dirA) * 2.5, py + Math.sin(dirA) * 2.5);
    const r = clamp(Math.sqrt((img.width * img.height * 0.5) / (Math.PI * this.def.hp)), 2, 8) * scale;
    const size = Math.ceil(r * 2.4) + 2;
    const piece = document.createElement('canvas');
    piece.width = piece.height = size;
    const pg = piece.getContext('2d');
    jagged(pg, size / 2, size / 2, r);
    pg.clip();
    pg.drawImage(this.canvas, size / 2 - sx, size / 2 - sy);
    const g = this.canvas.getContext('2d');
    g.save();
    g.globalCompositeOperation = 'destination-out';
    jagged(g, sx, sy, r);
    g.fill();
    // splintered dark rim and a couple of cracks around the hole
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = 'rgba(20,10,14,0.65)';
    g.lineWidth = 1.2;
    jagged(g, sx, sy, r + 0.8);
    g.stroke();
    g.lineWidth = 0.7;
    for (let k = 0; k < 2; k++) {
      const a = rand(0, Math.PI * 2);
      g.beginPath(); g.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
      g.lineTo(sx + Math.cos(a) * (r + rand(3, 7)), sy + Math.sin(a) * (r + rand(3, 7)));
      g.stroke();
    }
    g.restore();
    if (opaqueEnough(piece)) {
      const back = dirA + Math.PI + rand(-1, 1);
      const a = chance(0.6) ? back : dirA + rand(-0.6, 0.6), v = rand(40, 120) * scale;
      if (this.def.static || this.world.debris.length > MAX_DEBRIS * 0.6) {
        this.world.particles.shard(piece, px, py, a, v);
      } else {
        this.world.addDebris(new Debris(this.world, piece, px, py, this.body.angle, Math.cos(a) * v, Math.sin(a) * v, rand(-0.5, 0.5),
          { air: 0.06, material: this.def.material, fly: 0.15 }));
      }
    }
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  // a round that went right through blows a piece out of the far side (exit at (px, py), flying along dirA)
  exitWound(px, py, dirA, scale) {
    this.bite(px, py, dirA + Math.PI, scale);
  }

  // kind: pellet | bullet | rifle | blunt | blast
  hit(damage, px, py, dirA, power = 0.6, kind = 'bullet') {
    if (this.dead) return;
    const d = this.def, w = this.world;
    this.flash = 0.06;
    if (this.hp - damage > 0) {
      this.bite(px, py, dirA, BITE[kind] ?? 1);
      if (kind === 'blunt') this.cracks(px, py, 3);
      if (kind === 'blast') this.scorch(px, py);
    }
    w.particles.chips(px, py, dirA + Math.PI, 1.2, 3, d.chips);
    if (d.sparks || d.sound === 'metal') w.particles.sparks(px, py, dirA + Math.PI, 1, 4, 220);
    w.sound(d.sound === 'glass' ? 'impact' : d.sound, px, py, 0.5);
    if (!d.static) impulse(this.body, dirA, 25 * power, (Math.random() - 0.5) * 0.05);
    this.hp -= damage;
    if (this.hp <= 0) { this.break(dirA, power); return; }
    // damage states
    const frac = this.hp / d.hp;
    while (this.stage < STAGES.length && frac <= STAGES[this.stage]) this.enterStage(++this.stage, px, py, dirA);
  }

  enterStage(stage, px, py, dirA) {
    const w = this.world, d = this.def;
    if (stage === 1) {
      this.cracks(this.x, this.y, 6);
    } else if (stage === 2) {
      this.split();
      w.particles.chips(this.x, this.y, dirA, Math.PI, 10, d.chips, 140);
      w.sound(d.sound === 'metal' ? 'metal' : 'wood', this.x, this.y, 0.8);
    } else if (stage === 3) {
      // a big piece gives way
      this.bite(px + rand(-6, 6), py + rand(-6, 6), dirA, 2.2);
      this.sag = rand(-0.06, 0.06);
      w.particles.smoke(this.x, this.y, 6, 10, { speed: 25, size: 6, life: 1.2 });
      w.sound('creak', this.x, this.y, 0.8);
    }
  }

  // dark cracks spreading through the object from a point
  cracks(px, py, n) {
    const g = this.ensureCanvas();
    const { sx, sy } = this.toSprite(px, py);
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = 'rgba(16,8,12,0.75)';
    g.lineWidth = 0.8;
    for (let k = 0; k < n; k++) {
      let x = sx, y = sy, a = rand(0, Math.PI * 2);
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 6; i++) {
        a += rand(-0.6, 0.6);
        x += Math.cos(a) * rand(2, 5); y += Math.sin(a) * rand(2, 5);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }

  // a jagged gap right across the object
  split() {
    const g = this.ensureCanvas();
    const W = this.canvas.width, H = this.canvas.height;
    const across = W >= H;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 1.6;
    g.beginPath();
    let t = (across ? W : H) * rand(0.35, 0.65);
    for (let u = 0; u <= (across ? H : W); u += 2) {
      t += rand(-1.5, 1.5);
      if (across) g.lineTo(t, u); else g.lineTo(u, t);
    }
    g.stroke();
    g.restore();
  }

  // blackened side facing a blast
  scorch(px, py) {
    const g = this.ensureCanvas();
    const { sx, sy } = this.toSprite(px, py);
    const grad = g.createRadialGradient(sx, sy, 0, sx, sy, 14);
    grad.addColorStop(0, 'rgba(10,6,6,0.7)');
    grad.addColorStop(1, 'rgba(10,6,6,0)');
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = grad;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.restore();
  }

  break(dirA = rand(0, Math.PI * 2), power = 1) {
    if (this.dead) return;
    this.dead = true;
    const d = this.def, w = this.world;
    const { x, y } = this.body.position;
    w.removeBody(this.body);
    if (d.explosive) w.after(0.06, () => w.explode(x, y, { radius: d.blast ?? 92, source: this.type }));
    // what is left falls apart in a few big chunks
    const cols = Math.min(3, Math.max(2, Math.round(this.img.width / 16)));
    const rows = Math.min(2, Math.max(1, Math.round(this.img.height / 16)));
    const pieces = slices(this.look, cols, rows);
    const harm = power >= 1.5 ? { kind: 'blunt', knock: 3.5, lethal: 8.5 } : null;
    const ca = Math.cos(this.body.angle), sa = Math.sin(this.body.angle);
    const pw = this.img.width / cols, ph = this.img.height / rows;
    const physical = !d.static && this.world.debris.length < MAX_DEBRIS * 0.6;
    pieces.forEach((pc, k) => {
      if (this.canvas && !opaqueEnough(pc, 10)) return; // already shot away
      // start each piece where it was in the object
      const lx = ((k % cols) + 0.5) * pw - this.img.width / 2, ly = (Math.floor(k / cols) + 0.5) * ph - this.img.height / 2;
      const px = x + lx * ca - ly * sa, py = y + lx * sa + ly * ca;
      const out = Math.atan2(py - y, px - x);
      const a = dirA + (Math.hypot(lx, ly) > 2 ? angDiff(dirA, out) * 0.5 : 0) + rand(-0.6, 0.6), v = rand(40, 150) * power;
      if (physical) {
        w.addDebris(new Debris(w, pc, px, py, this.body.angle, Math.cos(a) * v, Math.sin(a) * v, rand(-0.4, 0.4),
          { air: 0.07, material: d.material, harm: harm && { ...harm } }));
      } else w.particles.shard(pc, px, py, a, v * 1.2, { rot: this.body.angle, vz: rand(60, 160) });
    });
    // splinters: visual only
    for (let k = 0; k < 6 + cols * rows * 2; k++) {
      const a = dirA + rand(-1.4, 1.4), v = rand(50, 180) * power;
      w.particles.shard(chunk(d.chips, Math.floor(rand(2, 6)), Math.floor(rand(1, 3)) + 1), x + rand(-8, 8), y + rand(-8, 8), a, v);
    }
    if (d.explosive) return;
    w.particles.chips(x, y, dirA, Math.PI, 18, d.chips, 180);
    w.particles.smoke(x, y, 5, 8, { speed: 30, size: 6, life: 0.8 });
    if (d.glass) { w.particles.glass(x, y, dirA, 1.5, 14); w.sound('glass', x, y, 0.6); }
    if (d.sparks) { w.particles.sparks(x, y, 0, Math.PI, 18, 260); w.light(x, y, 50, '#9ff', 0.08); }
    if (d.dirt) w.particles.chips(x, y, 0, Math.PI, 14, '#4a2e1a', 120);
    if (d.fountain) {
      // broken hydrant: a geyser for a while
      w.emit(x, y, 9, (e) => {
        for (let i = 0; i < 3; i++) w.particles.chips(e.x, e.y, rand(0, 6.28), 0.3, 1, chance(0.5) ? '#9fdcff' : '#e8fbff', rand(60, 240));
        if (chance(0.3)) w.particles.smoke(e.x, e.y, 1, 3, { speed: 30, size: 4, life: 0.6 });
      });
      w.sound('tirePop', x, y, 0.5);
    }
    if (d.water) {
      for (let i = 0; i < 30; i++) w.particles.chips(x, y, rand(0, 7), 0.3, 1, chance(0.5) ? '#9fdcff' : '#d8f4ff', rand(40, 200));
    }
    w.sound(d.sound === 'metal' ? 'metal' : 'wood', x, y);
    w.shake(0.08);
  }

  draw(ctx) {
    const p = this.body.position;
    // jitter briefly when hit
    let jx = 0, jy = 0;
    if (this.flash > 0) { this.flash -= 1 / 60; jx = rand(-1.5, 1.5); jy = rand(-1.5, 1.5); }
    if (this.def.overhead) return; // drawn later, above characters
    drawSprite(ctx, silhouette(this.img), p.x + jx + 3, p.y + jy + 3, this.body.angle, this.canvas ? 0.25 : 0.35);
    drawSprite(ctx, this.look, p.x + jx, p.y + jy, this.body.angle + this.sag);
  }

  // canopies and lamp heads: above everyone, see-through when the player is under
  drawOverhead(ctx, player) {
    const p = this.body.position;
    const under = player && Math.hypot(player.x - p.x, player.y - p.y) < this.img.width * 0.45;
    drawSprite(ctx, this.img, p.x + 5, p.y + 7, this.body.angle, 0.3);
    drawSprite(ctx, this.look, p.x, p.y, this.body.angle, under ? 0.45 : 1);
  }
}
