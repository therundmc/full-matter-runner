import { CAT, MASK, MAX_DEBRIS, DESTRUCTION } from '../Config.js';
import { PROPS } from '../data/props.js';
import { recipeFor, BITS, FLOATS } from '../data/destruction.js';
import { PX_PER_M } from '../../engine/physics/Units.js';
import { sprite, spriteOpt, chunk, drawSprite, silhouette } from '../../engine/Assets.js';
import { segPoly } from '../../engine/physics/Raycast.js';
import { rand, chance, clamp, pick } from '../../engine/math.js';
import { incidence, markShape, exitShape, ejecta, track, ZoneGrid, cutPolys, launch } from '../systems/Fracture.js';
import { RESIST } from '../systems/Penetration.js';
import { canvas, paintMark, paintTrack, bite, cutPiece, cracks, splitLine, smashScreen, bitSprite } from '../render/DamageArt.js';
import Debris from './Debris.js';
import { setMaterial, impulse, scaleInertia } from '../../engine/physics/Body.js';

const { Bodies } = Matter;

// damage states, by fraction of hit points left: cracked, split, giving way
const STAGES = [0.7, 0.45, 0.2];
// how hard each kind of hit wears the damage zone it lands in
const ZONE_WEAR = { pellet: 0.6, bullet: 1, rifle: 1.4, graze: 0.4, blunt: 1.7, blast: 2.2, cut: 0.5, punch: 0.3, shrapnel: 0.3 };
// penetration energy assumed when the caller does not give one
const ENERGY = { pellet: 4, bullet: 10, rifle: 34, graze: 6, blunt: 14, blast: 24, cut: 3, punch: 2, shrapnel: 3 };
const TAU = Math.PI * 2;

// Furniture and street dressing, destroyed piece by piece (data/destruction.js says how each one comes apart):
//  - every hit leaves a mark where it landed, in the prop's own canvas (holes, furrows, dents, slashes, scorch),
//    tears material out and throws it back out of the entry / forward out of the exit (systems/Fracture.js);
//  - hits wear down the zone they land in: a zone at 0 is torn off (a corner, a hole); a line of torn zones saws
//    the object in two, the far part falls and what is left stays standing (its body shrinks);
//  - states by hit points: cracked -> split -> giving way; at 0 it cracks, sags and falls apart into its own parts.
// Hit kinds: pellet | bullet | rifle | graze | blunt | cut | punch | blast | shrapnel.
export default class Prop {
  constructor(world, type, x, y, angle = 0) {
    this.world = world;
    this.type = type;
    this.def = PROPS[type];
    if (!this.def) throw new Error('unknown prop ' + type);
    this.img = spriteOpt('props/' + type) || sprite(type.startsWith('neon') ? 'props/tv' : 'props/trash_can');
    this.rec = recipeFor(type, this.def);
    this.hp = this.def.hp;
    const d = this.def;
    this.opts = {
      isStatic: !!d.static, angle, label: 'prop',
      frictionAir: 0.02, friction: 0.4, restitution: 0.1,
      // hanging from the ceiling: nothing on the floor bumps into it
      collisionFilter: { category: CAT.PROP, mask: d.hung ? 0 : MASK.PROP },
    };
    this.makeBody(x, y, d.w, d.h, d.kg);
    this.dead = false;
    this.dying = false;
    this.flash = 0;
    this.canvas = null; // per-instance copy of the sprite, created on the first mark
    this.shadow = null; // silhouette of the damaged canvas (rebuilt after damage)
    this.zones = null;  // ZoneGrid, created on the first hit
    this.off = { x: 0, y: 0 }; // sprite centre relative to the body centre (local), once a part fell off
    this.stage = 0;     // damage states reached
    this.sag = 0;       // tilt once it is giving way
    this.squash = 1;
    this.kick = { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 }; // hit recoil wobble (spring)
    this.lastHit = null; // sprite point of the last hit (fractures start there)
    this.screenHp = 2;
    this.leaks = 0;
    this.spilled = 0;
    world.addBody(this.body);
  }

  makeBody(x, y, w, h, kg) {
    const d = this.def;
    this.body = d.r ? Bodies.circle(x, y, d.r, this.opts) : Bodies.rectangle(x, y, w, h, this.opts);
    if (!d.static) {
      setMaterial(this.body, kg, d.mu);
      scaleInertia(this.body, 4);
      this.world.physics.freezeIfHeavy(this.body);
    }
    this.body.entity = this;
    this.body.material = d.material;
  }

  get look() { return this.canvas || this.img; }
  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get W() { return this.img.width; }
  get H() { return this.img.height; }

  // world position of the sprite centre
  centre() {
    const a = this.body.angle, c = Math.cos(a), s = Math.sin(a), p = this.body.position;
    return { x: p.x + this.off.x * c - this.off.y * s, y: p.y + this.off.x * s + this.off.y * c };
  }

  // world point -> sprite pixel
  toSprite(px, py) {
    const o = this.centre(), a = -this.body.angle, dx = px - o.x, dy = py - o.y;
    return { sx: dx * Math.cos(a) - dy * Math.sin(a) + this.W / 2, sy: dx * Math.sin(a) + dy * Math.cos(a) + this.H / 2 };
  }

  // sprite pixel -> world point
  toWorld(sx, sy) {
    const o = this.centre(), a = this.body.angle, lx = sx - this.W / 2, ly = sy - this.H / 2;
    return { x: o.x + lx * Math.cos(a) - ly * Math.sin(a), y: o.y + lx * Math.sin(a) + ly * Math.cos(a) };
  }

  ensureCanvas() {
    if (!this.canvas) {
      this.canvas = canvas(this.W, this.H);
      this.canvas.getContext('2d').drawImage(this.img, 0, 0);
    }
    this.shadow = null;
    return this.canvas.getContext('2d');
  }

  // ------------------------------------------------------------------ hits

  // damage: hit points, (px, py): where it landed, dirA: direction of the blow, power: shove / violence,
  // kind: see the header. info (bullets): { nx, ny } surface normal, energy left when it arrived,
  // exit: { x, y, energy } if the round went through, ricochet: it glanced off; (blades): swing direction.
  hit(damage, px, py, dirA, power = 0.6, kind = 'bullet', info = {}) {
    if (this.dead || this.dying) return;
    const d = this.def, w = this.world, rec = this.rec, fx = rec.fx;
    const swing = info.swing ?? dirA + Math.PI / 2; // a blade's stroke runs across the blow
    if (kind === 'blunt' || kind === 'cut' || kind === 'punch' || kind === 'blast' || kind === 'shrapnel') {
      const s = this.surface(px, py, dirA);
      px = s.x; py = s.y;
      if (info.nx === undefined && kind !== 'blast') { info = { ...info, nx: s.nx, ny: s.ny }; }
    }
    const energy = info.energy ?? ENERGY[kind] ?? 10;
    const inc = kind === 'blast' || kind === 'shrapnel' ? 1 : incidence(dirA, info.nx, info.ny);
    const g = this.ensureCanvas();
    const { sx, sy } = this.spritePoint(px, py, dirA, kind === 'cut' ? Math.min(4, Math.min(this.W, this.H) * 0.3) : 1.2);
    this.lastHit = [sx, sy];
    const la = dirA - this.body.angle; // shot direction in sprite space
    const size = Math.min(this.W, this.H);
    const m = markShape(kind, { energy, inc, size, hard: fx.hard, cracks: fx.cracks, glass: fx.glass, ricochet: info.ricochet });
    paintMark(g, sx, sy, m, kind === 'cut' ? swing - this.body.angle : la, rec.material);
    // the channel it dug on its way through (or until it stopped)
    let tr = null;
    if ((kind === 'bullet' || kind === 'rifle' || kind === 'pellet') && !fx.hard) {
      const ex = info.exit && this.toSprite(info.exit.x, info.exit.y);
      tr = track(sx, sy, la, energy, RESIST[rec.material] ?? 1, this.W, this.H, ex && [ex.sx, ex.sy]);
      paintTrack(g, sx, sy, tr.x, tr.y, kind === 'rifle' ? 1.1 : kind === 'pellet' ? 0.6 : 0.8, rec.material);
    }
    if (m.bite > 0.6) this.tear(sx, sy, m.bite, info.ricochet ? 'entry' : kind === 'blunt' || kind === 'blast' ? 'exit' : 'entry', dirA, energy, info);
    this.splash('entry', px, py, dirA, energy, info, kind);
    if (info.exit) this.exitWound(info.exit.x, info.exit.y, dirA, info.exit.energy);

    if (rec.screen && (kind === 'blunt' || this.inRect(rec.screen, sx, sy))) this.hitScreen(sx, sy, kind === 'blunt' || kind === 'blast' ? 2 : 1);
    if (rec.electric && kind !== 'punch') {
      w.particles.sparks(px, py, dirA + Math.PI, 0.9, chance(0.5) ? 6 : 2, 240, chance(0.5) ? '#9ff' : undefined);
      if (chance(0.3)) w.particles.smoke(px, py, 1, 2, { speed: 15, size: 3, life: 0.8, dark: true });
    }
    this.spillOnHit(px, py, dirA);
    if (rec.leak?.on === 'hit' || d.water) this.leak(sx, sy, dirA);
    w.sound(fx.glass || (d.glass && this.inRect(rec.screen, sx, sy)) ? 'glassHit' : fx.hit, px, py, kind === 'pellet' ? 0.35 : 0.55);
    this.recoil(dirA, power);
    if (!d.static) impulse(this.body, dirA, 25 * power, (Math.random() - 0.5) * 0.05);

    // the zone it landed in wears down: corners come off, a line of torn zones saws it in two
    if (!this.zones) this.zones = new ZoneGrid(this.W, this.H, d.hp);
    const torn = this.zones.damage(sx, sy, damage * (ZONE_WEAR[kind] ?? 1), kind === 'blast' ? 0.5 : 0.15);
    if (tr) torn.push(...this.zones.wearLine(sx, sy, tr.x, tr.y, damage * 0.35));
    for (const i of torn) this.tearZone(i, dirA, power);
    if (torn.length) { const cut = this.zones.cut(); if (cut) this.sawOff(cut, dirA); }

    this.hp -= damage;
    if (this.hp <= 0) { this.break(dirA, power); return; }
    const frac = this.hp / d.hp;
    while (this.stage < STAGES.length && frac <= STAGES[this.stage]) this.enterStage(++this.stage, px, py, dirA);
  }

  // where a blow along dirA through (px, py) meets the object's outline (and the surface normal there)
  surface(px, py, dirA) {
    const c = Math.cos(dirA), s = Math.sin(dirA), R = Math.max(this.W, this.H) + 30;
    const r = segPoly(px - c * R, py - s * R, px + c * R, py + s * R, this.body.vertices);
    if (!r) return { x: px, y: py };
    return { x: px - c * R + c * 2 * R * r.t, y: py - s * R + s * 2 * R * r.t, nx: r.nx, ny: r.ny };
  }

  // sprite pixel just inside the hit point, kept on the sprite
  spritePoint(px, py, dirA, depth = 1.2) {
    const p = this.toSprite(px + Math.cos(dirA) * depth, py + Math.sin(dirA) * depth);
    return { sx: clamp(p.sx, 0.5, this.W - 0.5), sy: clamp(p.sy, 0.5, this.H - 0.5) };
  }

  inRect(fr, sx, sy) {
    return !!fr && sx >= fr[0] * this.W - 1 && sx <= fr[2] * this.W + 1 && sy >= fr[1] * this.H - 1 && sy <= fr[3] * this.H + 1;
  }

  // can we afford one more physical piece?
  physicalOk() { return this.world.debris.length < MAX_DEBRIS * DESTRUCTION.physicalShare; }

  // throw a piece of this object (canvas img at world x, y)
  throwPiece(img, x, y, a, v, { z = 4, vz = 60, spin = rand(-0.4, 0.4), physical = false, harm = null, kg } = {}) {
    const w = this.world;
    if (physical && this.physicalOk()) {
      w.addDebris(new Debris(w, img, x, y, this.body.angle, Math.cos(a) * v, Math.sin(a) * v, spin,
        { air: 0.06, material: this.def.material, z, vz, land: this.rec.fx.hit, harm, kg }));
    } else {
      w.particles.shard(img, x, y, a, v, { rot: this.body.angle + rand(-0.3, 0.3), z, vz, spin: spin * 30 });
    }
  }

  // material torn out around a hit: flies back out of the entry, or forward when blown through
  tear(sx, sy, r, side, dirA, energy, info) {
    const piece = bite(this.canvas, sx, sy, r, this.rec.material);
    if (!piece) return;
    const e = ejecta(side, dirA, energy, info.nx, info.ny);
    const a = e.a + rand(-e.spread, e.spread), v = rand(e.vmin, e.vmax);
    const p = this.toWorld(sx, sy);
    this.throwPiece(piece, p.x, p.y, a, v, { z: this.lift() * 0.6, vz: rand(30, 90), physical: !this.def.static && piece.width > 6 });
  }

  // how high (fake px) pieces start from: the object's height
  lift() { return clamp(this.rec.height * PX_PER_M * 0.35, 2, this.rec.drop ? 60 : 22); }

  // the spray of material out of a hole: back-splash at the entry, a cone along the shot at the exit
  splash(side, px, py, dirA, energy, info, kind) {
    const w = this.world, fx = this.rec.fx, d = this.def, P = w.particles;
    const e = ejecta(side, dirA, energy, info.nx, info.ny);
    const k = side === 'exit' ? fx.exit : fx.backSplash;
    const n = Math.max(1, Math.round(e.n * k * (kind === 'pellet' ? 0.6 : 1) * (kind === 'blunt' ? 2 : 1)));
    const v = (e.vmin + e.vmax) / 2;
    if (fx.glass) P.glass(px, py, e.a, e.spread, n * 3, v);
    else P.chips(px, py, e.a, e.spread, n * 2, d.chips, v);
    if (fx.splinters && kind !== 'punch') {
      // long thin splinters, along the grain
      for (let i = 0; i < Math.ceil(n / 2); i++) {
        P.shard(chunk(d.chips, Math.floor(rand(3, 6)), 1), px, py, e.a + rand(-e.spread, e.spread), rand(e.vmin, e.vmax), { z: 3, vz: rand(30, 90) });
      }
    }
    if (fx.hard) P.sparks(px, py, e.a, e.spread + 0.3, info.ricochet ? 8 : 4, 260);
    if (fx.float && kind !== 'punch') P.floaters(px, py, FLOATS[fx.float], Math.ceil(n * 1.5), e.a, e.spread + 0.4, v * 0.4, 6);
    if (fx.dust) P.dust(px, py, side === 'exit' ? 2 : 1, 1.5, fx.dust, { speed: 20, size: 3, life: 1.6, vx: Math.cos(e.a) * 15, vy: Math.sin(e.a) * 15 });
  }

  // a round came out of the far side at (px, py) with `energy` left: blow-out, debris blown forward along dirA
  exitWound(px, py, dirA, energy = 10) {
    if (this.dead || this.dying) return;
    const fx = this.rec.fx;
    const g = this.ensureCanvas();
    const p = this.toSprite(px - Math.cos(dirA) * 1.2, py - Math.sin(dirA) * 1.2);
    const sx = clamp(p.sx, 0.5, this.W - 0.5), sy = clamp(p.sy, 0.5, this.H - 0.5);
    const m = exitShape(energy, { hard: fx.hard, glass: fx.glass });
    paintMark(g, sx, sy, m, dirA - this.body.angle, this.rec.material);
    if (m.bite > 0.6) this.tear(sx, sy, m.bite, 'exit', dirA, energy, {});
    this.splash('exit', px, py, dirA, energy, {}, 'rifle');
  }

  // little recoil of the struck object (bolted furniture just shudders)
  recoil(dirA, power) {
    const k = this.kick, amt = clamp(power, 0.3, 2.5) * (this.def.static ? 40 : 20);
    k.vx += Math.cos(dirA) * amt; k.vy += Math.sin(dirA) * amt;
    k.vr += rand(-1, 1) * 0.6 * clamp(power, 0.3, 2) * (this.def.static ? 0.5 : 1);
    this.flash = 0.06;
  }

  update(dt) {
    const k = this.kick;
    if (k.x || k.y || k.vx || k.vy || k.r || k.vr) {
      // stiff damped spring back to rest
      k.vx += (-700 * k.x - 24 * k.vx) * dt; k.vy += (-700 * k.y - 24 * k.vy) * dt; k.vr += (-500 * k.r - 20 * k.vr) * dt;
      k.x += k.vx * dt; k.y += k.vy * dt; k.r += k.vr * dt;
      if (Math.abs(k.x) + Math.abs(k.y) + Math.abs(k.vx) + Math.abs(k.vy) + Math.abs(k.r) * 50 + Math.abs(k.vr) < 0.02) {
        k.x = k.y = k.vx = k.vy = k.r = k.vr = 0;
      }
    }
    if (this.flash > 0) this.flash -= dt;
  }

  // ------------------------------------------------------------------ zones: corners off, sawn in two

  // a worn-out zone is torn away (jagged), blown along the hit
  tearZone(i, dirA, power) {
    const [x0, y0, x1, y1] = this.zones.rect(i);
    const jx = (x1 - x0) * 0.25, jy = (y1 - y0) * 0.25;
    const j = (v) => v * rand(-1, 1);
    const poly = [
      [x0 + j(jx), y0 + j(jy)], [(x0 + x1) / 2 + j(jx), y0 + j(jy)], [x1 + j(jx), y0 + j(jy)], [x1 + j(jx), (y0 + y1) / 2 + j(jy)],
      [x1 + j(jx), y1 + j(jy)], [(x0 + x1) / 2 + j(jx), y1 + j(jy)], [x0 + j(jx), y1 + j(jy)], [x0 + j(jx), (y0 + y1) / 2 + j(jy)],
    ];
    this.ensureCanvas();
    const pc = cutPiece(this.canvas, poly, { min: 6 });
    const w = this.world;
    const p = this.toWorld((x0 + x1) / 2, (y0 + y1) / 2);
    if (pc) {
      const L = launch(dirA, 0, 0, Math.max(1, power), 1);
      this.throwPiece(pc.img, p.x, p.y, L.a, L.v, { z: this.lift() * 0.7, vz: L.vz, spin: L.spin, physical: pc.img.width * pc.img.height > 60 });
    }
    const fx = this.rec.fx;
    if (fx.dust) w.particles.dust(p.x, p.y, 3, 2, fx.dust, { speed: 25, size: 4, vx: Math.cos(dirA) * 20, vy: Math.sin(dirA) * 20 });
    w.particles.chips(p.x, p.y, dirA, 1, 6, this.def.chips, 120);
    w.sound(fx.crush, p.x, p.y, 0.6);
  }

  // a line of torn zones cut right across: the smaller side falls off, what is left stays up
  sawOff(cut, dirA) {
    const z = this.zones;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of cut.cells) {
      const [a, b, c, d] = z.rect(i);
      x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
    }
    z.detach(cut.cells);
    const pc = cutPiece(this.canvas, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { min: 10 });
    this.shadow = null;
    const w = this.world;
    const p = this.toWorld((x0 + x1) / 2, (y0 + y1) / 2);
    if (pc) {
      // it sags off and drops: slow, heavy
      this.throwPiece(pc.img, p.x, p.y, dirA + rand(-0.4, 0.4), rand(15, 45), { z: this.lift() * 0.5, vz: 20, spin: rand(-0.12, 0.12), physical: true });
    }
    w.particles.dust(p.x, p.y, 6, 4, this.rec.fx.dust || '#7a7078', { speed: 30, size: 6 });
    w.sound('creak', p.x, p.y, 0.8);
    w.sound(this.rec.fx.crush, p.x, p.y, 0.8);
    // a bolted object keeps standing on what is left: its body shrinks to it
    const b = z.bounds();
    if (b && this.def.static && !this.def.r) this.shrink(b);
    this.hp = Math.min(this.hp, this.def.hp * (z.intactCount() / z.state.length) + 1);
  }

  shrink([x0, y0, x1, y1]) {
    const d = this.def, w = this.world;
    const o = this.centre(), a = this.body.angle;
    const kx = d.w / this.W, ky = d.h / this.H;
    const cx = (x0 + x1) / 2 - this.W / 2, cy = (y0 + y1) / 2 - this.H / 2;
    w.removeBody(this.body);
    this.opts.angle = a;
    this.makeBody(o.x + cx * Math.cos(a) - cy * Math.sin(a), o.y + cx * Math.sin(a) + cy * Math.cos(a),
      Math.max(3, (x1 - x0) * kx), Math.max(3, (y1 - y0) * ky));
    this.off = { x: -cx, y: -cy };
    w.addBody(this.body);
  }

  // ------------------------------------------------------------------ screens, contents, liquids

  hitScreen(sx, sy, dmg) {
    if (this.screenHp <= 0) return;
    const w = this.world, p = this.toWorld(sx, sy);
    this.screenHp -= dmg;
    cracks(this.canvas.getContext('2d'), sx, sy, 6, 6, 'rgba(225,245,255,0.8)');
    w.particles.glass(p.x, p.y, 0, Math.PI, 6, 70);
    if (this.screenHp > 0) return;
    // the tube caves in: flash, glass sucked in then thrown out, smoke, the glow dies
    const [a, b, c, d] = this.rec.screen;
    smashScreen(this.canvas, [a * this.W, b * this.H, c * this.W, d * this.H]);
    const q = this.toWorld(((a + c) / 2) * this.W, ((b + d) / 2) * this.H);
    w.light(q.x, q.y, 70, '#d8f0ff', 0.12);
    w.particles.glass(q.x, q.y, 0, Math.PI, 26, 150);
    w.particles.sparks(q.x, q.y, 0, Math.PI, 14, 260, '#bff');
    w.particles.smoke(q.x, q.y, 6, 3, { speed: 20, size: 5, life: 1.8, dark: true });
    w.sound('glass', q.x, q.y, 0.8);
    this.lightsOut = true;
  }

  // something inside falls out of the hole (a book, a ball) or bursts (a bottle)
  spillOnHit(px, py, dirA) {
    for (const c of this.rec.contents) {
      if (c.on !== 'hit' || this.spilled >= 6 || !chance(c.perHit ?? 1)) continue;
      this.spilled++;
      if (c.bit === 'bottle') {
        // the bottle behind the counter bursts
        const P = this.world.particles;
        P.glass(px, py, dirA, 1.2, 12, 140);
        P.drops(px, py, dirA, 1, 10, this.rec.leak?.color || 'rgba(150,90,20,0.5)', 110);
        this.world.sound('glassHit', px, py, 0.6);
      } else this.throwBits(BITS[c.bit], c, 1, px, py, dirA + Math.PI + rand(-0.8, 0.8), 0.8);
    }
  }

  // loose bits: real-size little physical things (pool balls roll, records skid, books tumble)
  throwBits(bit, c, n, x, y, dirA, power) {
    const w = this.world;
    const [mw, mh] = bit.size;
    const round = !!bit.round;
    for (let i = 0; i < n; i++) {
      const pw = Math.max(round ? 2.6 : 2, mw * PX_PER_M), ph = Math.max(2, mh * PX_PER_M);
      const img = bitSprite(c.bit, pick(c.colors || bit.colors), pw, round ? pw : ph);
      const a = dirA + rand(-1.2, 1.2), v = rand(40, 140) * power;
      const z = this.lift() * rand(0.5, 1), vz = rand(30, 110);
      if (this.physicalOk()) {
        w.addDebris(new Debris(w, img, x + rand(-3, 3), y + rand(-3, 3), rand(0, TAU), Math.cos(a) * v, Math.sin(a) * v, rand(-0.3, 0.3), {
          circle: round, bounce: bit.bounce ?? 0.25, mu: bit.mu, material: bit.material, z, vz,
          kg: Math.max(0.1, mw * mh * 40), land: round ? 'plastic' : null,
        }));
      } else w.particles.shard(img, x, y, a, v, { z, vz });
    }
  }

  // a jet of liquid out of a hole, weakening, and the puddle it makes
  leak(sx, sy, dirA) {
    if (this.leaks >= DESTRUCTION.maxLeaks) return;
    this.leaks++;
    const w = this.world, color = this.rec.leak?.color || 'rgba(110,160,200,0.16)', dur = this.rec.leak?.dur || 3;
    const out = dirA + Math.PI + rand(-0.4, 0.4); // the jet comes back out of the hole
    let pos = this.toWorld(sx, sy);
    w.emit(pos.x, pos.y, dur, (e) => {
      if (!this.dead) pos = this.toWorld(sx, sy);
      const k = e.t / dur; // pressure falls
      w.particles.drops(pos.x, pos.y, out + rand(-0.1, 0.1), 0.15, k > 0.3 ? 2 : 1, color, 40 + 120 * k, 5);
    });
    w.sound('soft', pos.x, pos.y, 0.4);
  }

  // ------------------------------------------------------------------ damage states, collapse

  enterStage(stage, px, py, dirA) {
    const w = this.world, d = this.def, fx = this.rec.fx;
    const [sx, sy] = this.lastHit || [this.W / 2, this.H / 2];
    if (stage === 1) {
      cracks(this.ensureCanvas(), sx, sy, fx.cracks + 2, Math.max(this.W, this.H) * 0.3);
      w.sound(fx.crush, px, py, 0.5);
    } else if (stage === 2) {
      this.ensureCanvas();
      splitLine(this.canvas, this.rec.material === 'wood' ? (this.W >= this.H ? 'x' : 'y') : chance(0.5) ? 'x' : 'y');
      w.particles.chips(this.x, this.y, dirA, Math.PI, 10, d.chips, 140);
      if (fx.dust) w.particles.dust(this.x, this.y, 4, 4, fx.dust, { speed: 20, size: 5 });
      w.sound(fx.crush, this.x, this.y, 0.8);
    } else if (stage === 3) {
      // a big piece gives way, it sags
      this.ensureCanvas();
      this.tear(clamp(sx + rand(-3, 3), 0, this.W), clamp(sy + rand(-3, 3), 0, this.H), clamp(Math.min(this.W, this.H) * 0.3, 2.5, 7), 'exit', dirA, 15, {});
      this.sag = rand(-0.025, 0.025);
      w.particles.dust(this.x, this.y, 6, 5, fx.dust || '#6a6070', { speed: 22, size: 6, life: 2.5 });
      if (fx.float) w.particles.floaters(this.x, this.y, FLOATS[fx.float], 10, dirA, 1.5, 50, 8);
      if (this.rec.electric) this.smoulder(3);
      w.sound('creak', this.x, this.y, 0.8);
    }
  }

  // sparks and smoke for a while (shorted electronics)
  smoulder(dur) {
    const w = this.world;
    w.emit(this.x, this.y, dur, () => {
      if (this.dead) return;
      if (chance(0.06)) w.particles.sparks(this.x + rand(-4, 4), this.y + rand(-4, 4), rand(0, TAU), 1, 3, 160, '#bff');
      if (chance(0.1)) w.particles.smoke(this.x, this.y, 1, 3, { speed: 12, size: 4, life: 1.4, dark: true });
    });
  }

  // Gives way: it cracks, sags, then falls apart into its own parts (staged over a few frames; blasts are faster).
  break(dirA = rand(0, TAU), power = 1) {
    if (this.dead || this.dying) return;
    const d = this.def, w = this.world, fx = this.rec.fx;
    this.hp = Math.min(this.hp, 0);
    if (d.explosive) {
      const { x, y } = this.body.position;
      this.collapse(dirA, power);
      w.after(0.06, () => w.explode(x, y, { radius: d.blast ?? 92, source: this.type }));
      return;
    }
    this.dying = true;
    const [t1, t2] = power >= 2 ? [0.015, 0.03] : DESTRUCTION.stageDelay;
    // 1. crack: lines through it, a crack of the material, lamps and screens pop
    const [sx, sy] = this.lastHit || [this.W / 2, this.H / 2];
    cracks(this.ensureCanvas(), sx, sy, 6, Math.max(this.W, this.H) * 0.5);
    this.recoil(dirA, power * 1.5);
    w.sound(fx.crush, this.x, this.y, 0.9);
    if (d.fixture || this.rec.electric) {
      w.light(this.x, this.y, 60, d.light?.color || '#bff6ff', 0.1);
      w.particles.sparks(this.x, this.y, 0, Math.PI, 14, 240, '#bff');
      if (d.glass) w.sound('glass', this.x, this.y, 0.6);
      this.lightsOut = true;
    }
    // 2. sag
    w.after(t1, () => {
      this.sag = rand(-0.04, 0.04); this.squash = 0.94;
      if (fx.dust) w.particles.dust(this.x, this.y, 4, Math.max(this.W, this.H) * 0.3, fx.dust, { speed: 15, size: 5 });
      if (fx.splinters || fx.float) w.sound('creak', this.x, this.y, 0.7);
    });
    // 3. fall apart
    w.after(t2, () => this.collapse(dirA, power));
  }

  collapse(dirA, power) {
    if (this.dead) return;
    this.dead = true;
    this.dying = false;
    const d = this.def, w = this.world, rec = this.rec, fx = rec.fx, P = w.particles;
    const { x, y } = this.centre();
    const ang = this.body.angle, ca = Math.cos(ang), sa = Math.sin(ang);
    w.removeBody(this.body);
    // cut the (damaged) sprite along the recipe's seams
    const work = canvas(this.W, this.H);
    work.getContext('2d').drawImage(this.look, 0, 0);
    const pieces = [];
    for (const g of [...rec.parts, { cut: 'grid', cols: 2, rows: 2 }]) {
      for (const c of cutPolys(g, this.W, this.H, Math.random, this.lastHit)) {
        const pc = cutPiece(work, c.poly, { min: 8 });
        if (pc) pieces.push({ ...pc, name: c.name, fly: c.fly ?? 1 });
      }
    }
    pieces.sort((p, q) => q.img.width * q.img.height - p.img.width * p.img.height);
    const harm = power >= 1.5 ? { kind: 'blunt', knock: 3.5, lethal: 8.5 } : null;
    const z0 = this.lift();
    // heavy furniture gives way where it stands: its big parts slump and slide a little, the crumbs are only chips.
    // Only a blast throws it around.
    const heavy = power < 2 && this.W * this.H > DESTRUCTION.heavyArea;
    if (heavy) pieces.length = Math.min(pieces.length, DESTRUCTION.heavyParts);
    const calm = heavy ? 0.3 : 1;
    let physical = d.static ? Math.min(DESTRUCTION.maxPhysicalParts, 3) : DESTRUCTION.maxPhysicalParts;
    for (const pc of pieces) {
      const lx = pc.cx - this.W / 2, ly = pc.cy - this.H / 2;
      const ox = lx * ca - ly * sa, oy = lx * sa + ly * ca;
      const L = launch(dirA, ox, oy, power, pc.fly);
      const big = pc.img.width * pc.img.height > 50;
      this.throwPiece(pc.img, x + ox, y + oy, L.a, L.v * calm, {
        z: z0 * rand(0.6, 1), vz: rec.drop || heavy ? rand(-10, 20) : L.vz, spin: L.spin * calm,
        physical: big && physical-- > 0, harm: harm && { ...harm },
      });
    }
    // parts the top view hid (table legs)
    if (rec.legs) {
      const s = Math.max(2, rec.legs.size * PX_PER_M), n = rec.legs.n;
      for (let i = 0; i < n; i++) {
        const lx = n === 1 ? 0 : (i % 2 ? 0.4 : -0.4) * this.W, ly = n <= 2 ? 0 : (i < 2 ? -0.4 : 0.4) * this.H;
        const ox = lx * ca - ly * sa, oy = lx * sa + ly * ca;
        const img = chunk(rec.legs.color, Math.round(s), Math.round(Math.max(s, rec.height * PX_PER_M * 0.5)));
        const L = launch(dirA, ox, oy, power, 1);
        this.throwPiece(img, x + ox, y + oy, L.a, L.v * 0.7 * calm, { z: z0 * 0.4, vz: L.vz * 0.6, spin: L.spin });
      }
    }
    // contents
    let bits = DESTRUCTION.maxBits;
    for (const c of rec.contents) {
      if (c.on !== 'break') continue;
      const n = Math.min(c.n, bits);
      bits -= n;
      this.throwBits(BITS[c.bit], c, n, x, y, dirA, Math.max(0.8, power * 0.8));
    }
    if (rec.floats) P.floaters(x, y, FLOATS[rec.floats[0]], rec.floats[1], dirA, Math.PI, 70 * Math.min(power, 2), z0);
    // dust that hangs, then settles
    const R = Math.max(this.W, this.H) * 0.4;
    P.dust(x, y, Math.round(4 + R / 3), R, fx.dust || '#5a5462', { speed: 25 * power, size: 5, life: 3.5, alpha: fx.dust ? 0.2 : 0.14 });
    P.chips(x, y, dirA, Math.PI, heavy ? 8 : 14, d.chips, heavy ? 90 : 160);
    if (fx.glass || d.glass) { P.glass(x, y, dirA, 1.5, 18); w.sound('glass', x, y, 0.6); }
    if (rec.electric) { P.sparks(x, y, 0, Math.PI, 16, 260, '#bff'); P.smoke(x, y, 6, 4, { speed: 20, size: 5, life: 2, dark: true }); }
    if (d.dirt || rec.contents.some((c) => c.bit === 'soil')) P.chips(x, y, 0, Math.PI, 18, '#4a2e1a', 120);
    if (d.fountain) {
      // broken hydrant: a geyser for a while
      w.emit(x, y, 9, (e) => {
        P.drops(e.x, e.y, rand(0, TAU), Math.PI, 3, 'rgba(110,160,200,0.14)', rand(60, 220), 30);
        // the white column itself, falling back around the stump
        P.drops(e.x, e.y, rand(0, TAU), Math.PI, 2, 'rgba(215,235,255,0.1)', rand(15, 70), 44);
        if (chance(0.5)) P.smoke(e.x, e.y, 1, 3, { speed: 30, size: 5, life: 0.7 });
      });
      w.sound('tirePop', x, y, 0.5);
    }
    if (d.water || rec.leak?.on === 'break') {
      P.drops(x, y, 0, Math.PI, 18, rec.leak?.color || 'rgba(110,160,200,0.16)', 140);
      if (rec.leak?.on === 'break') this.leak(this.W / 2, this.H / 2, dirA);
    }
    w.events.emit('propDestroyed', { prop: this, x, y, dirA, power });
    if (d.explosive) return;
    w.sound(fx.crush, x, y);
    // the heavy thud of the remains hitting the floor
    if (this.W * this.H > 300) w.after(0.18, () => w.sound('bodyFall', x, y, 0.6));
    w.shake(0.08 + Math.min(0.15, (this.W * this.H) / 8000));
  }

  // ------------------------------------------------------------------ drawing

  shadowImg() {
    if (!this.canvas) return silhouette(this.img);
    if (!this.shadow) {
      const s = this.shadow = canvas(this.W, this.H);
      const g = s.getContext('2d');
      g.drawImage(this.canvas, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#000';
      g.fillRect(0, 0, s.width, s.height);
    }
    return this.shadow;
  }

  draw(ctx) {
    const o = this.centre(), k = this.kick;
    const x = o.x + k.x, y = o.y + k.y, a = this.body.angle + this.sag + k.r;
    if (this.def.overhead) {
      // drawn later, above characters; what stands on the ground casts a shadow at its foot
      if (!this.def.hung) drawSprite(ctx, this.shadowImg(), o.x + 5, o.y + 7, a, 0.28);
      return;
    }
    drawSprite(ctx, this.shadowImg(), x + 3, y + 3, a, this.canvas ? 0.3 : 0.35);
    drawSprite(ctx, this.look, x, y, a, 1, this.squash);
    if (this.flash > 0) {
      // hit flash: the object brightens for a frame or two
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, this.look, x, y, a, clamp(this.flash / 0.06, 0, 1) * 0.35, this.squash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // canopies and lamp heads: above everyone, see-through when the player is under
  drawOverhead(ctx, player, cam) {
    const o = this.centre(), k = this.kick, d = this.def;
    // parallax: what sits up high leans away from the centre of the view
    this.ox = (o.x - cam.x) * (d.height || 0);
    this.oy = (o.y - cam.y) * (d.height || 0);
    const x = o.x + this.ox + k.x, y = o.y + this.oy + k.y, a = this.body.angle + this.sag + k.r;
    if (d.pole) {
      ctx.strokeStyle = d.pole[0];
      ctx.lineWidth = d.pole[1];
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(x, y); ctx.stroke();
    }
    // see-through when the player stands under the sprite itself (a lamp arm is long and thin)
    let under = false;
    if (player) {
      const c = Math.cos(a), s = Math.sin(a), dx = player.x - x, dy = player.y - y;
      under = Math.abs(dx * c + dy * s) < this.W * 0.45 && Math.abs(dy * c - dx * s) < this.H * 0.45 + 4;
    }
    drawSprite(ctx, this.look, x, y, a, under ? 0.45 : 1);
  }
}
