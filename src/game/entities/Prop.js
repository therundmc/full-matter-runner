import { CAT, MASK, MAX_DEBRIS, DESTRUCTION, WALL_RIM } from '../Config.js';
import { LIQUIDS } from '../data/liquids.js';
import { PROPS } from '../data/props.js';
import { recipeFor, BITS, FLOATS } from '../data/destruction.js';
import { PX_PER_M } from '../../engine/physics/Units.js';
import { sprite, spriteOpt, chunk, drawSprite, silhouette, sw, sh } from '../../engine/Assets.js';
import { segPoly } from '../../engine/physics/Raycast.js';
import { TAU, rand, chance, clamp, pick } from '../../engine/math.js';
import { incidence, markShape, exitShape, ejecta, track, ZoneGrid, cutPolys, launch, crumble, tearShape } from '../systems/Fracture.js';
import { RESIST } from '../systems/Penetration.js';
import { canvas, put, paintMark, paintTrack, bite, cutPiece, cracks, splitLine, smashScreen, bitSprite, stump, remains, rackSlots, popSlot,
  gash, rip, wear, brokenEdge, soilSpill, ductStump, bloodOn } from '../render/DamageArt.js';
import Debris from './Debris.js';
import { wallBehind, run } from '../fx/Spatter.js';
import { setMaterial, setShapeInertia, impulseAt } from '../../engine/physics/Body.js';
import { MATERIALS } from '../data/materials.js';
import { BLOW } from '../data/physics.js';
import { ignite } from '../systems/Gas.js';
import { tipOver } from '../systems/Tipping.js';

const { Bodies } = Matter;

// damage states, by fraction of hit points left: cracked, split, giving way
const STAGES = [0.7, 0.45, 0.2];
// how hard each kind of hit wears the damage zone it lands in
const ZONE_WEAR = { pellet: 0.6, bullet: 1, rifle: 1.4, graze: 0.4, blunt: 1.7, blast: 2.2, cut: 0.5, punch: 0.3, shrapnel: 0.3 };
// penetration energy assumed when the caller does not give one
const ENERGY = { pellet: 4, bullet: 10, rifle: 34, graze: 6, blunt: 14, blast: 24, cut: 3, punch: 2, shrapnel: 3 };
// what reaches a light fitting up high (def `high`)
const BLASTS = new Set(['blast', 'shrapnel']);
// what holes a gas bottle or a stove (see gasHit)
const PIERCING = new Set(['bullet', 'rifle', 'pellet', 'graze', 'shrapnel']);
const COAST = 1.6; // s a fan takes to run down once the power is cut
const d0 = (d) => d.w * d.h; // area of a prop's whole box (none for a round one)
const INK_DOOR = '#141018'; // outline of a cabinet's open doors

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
    this.img = spriteOpt(this.def.sprite || 'props/' + type) || sprite(type.startsWith('neon') ? 'props/tv' : 'props/trash_can');
    this.rec = recipeFor(type, this.def);
    this.hp = this.def.hp;
    const d = this.def;
    this.opts = {
      isStatic: !!d.static, angle, label: 'prop',
      frictionAir: 0, friction: 0.4, restitution: 0.1, // the floor brakes it (Friction.groundFriction), not the air
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
    this.rack = null;   // the bottles standing in plain sight (rec.rack), see bottles()
    this.doors = null;  // a cabinet's doors once they sprang open (rec.doors): [{ a, v, rest }], see openDoors()
    world.addBody(this.body);
  }

  // kg: its mass (what is left of it once sawn: its share of the whole by area)
  makeBody(x, y, w, h, kg = this.def.kg * (d0(this.def) ? (w * h) / d0(this.def) : 1)) {
    const d = this.def;
    this.body = d.r ? Bodies.circle(x, y, d.r, this.opts) : Bodies.rectangle(x, y, w, h, this.opts);
    this.body.entity = this;
    this.body.material = d.material;
    if (!d.static) {
      this.loosen(kg, d.mu);
      this.world.physics.freezeIfHeavy(this.body);
    }
  }

  // a loose body: its mass, its friction on the floor (by what it stands on: `feet`, or its material) and the moment
  // of inertia of its shape
  loosen(kg, mu) {
    const b = this.body, feet = this.def.feet ?? this.def.material;
    setMaterial(b, kg, mu);
    b.feet = feet;
    b.stick = MATERIALS[feet]?.stick;
    setShapeInertia(b);
  }

  get look() { return this.canvas || this.img; }
  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  // the sprite's size in world px: sprite space (marks, zones, pieces) is in world px whatever its density
  get W() { return sw(this.img); }
  get H() { return sh(this.img); }

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
      this.canvas = canvas(this.W, this.H, this.img.k);
      put(this.canvas.getContext('2d'), this.img);
    }
    this.shadow = null;
    return this.canvas.getContext('2d');
  }

  // ------------------------------------------------------------------ hits

  // damage: hit points, (px, py): where it landed, dirA: direction of the blow, power: shove / violence,
  // kind: see the header. info (bullets): { nx, ny } surface normal, energy left when it arrived,
  // exit: { x, y, energy } if the round went through, ricochet: it glanced off; (blades): swing direction.
  hit(damage, px, py, dirA, power = 0.6, kind = 'bullet', info = {}) {
    const d = this.def, w = this.world, rec = this.rec, fx = rec.fx;
    if (this.dead || this.dying || (d.high && !BLASTS.has(kind))) return; // up high: only a blast reaches it
    w.events.emit('propHit', { prop: this, x: px, y: py, dirA, kind, power });
    // a street bin goes over instead (systems/Tipping.js), sent along by the blow; it then lands on the can lying there
    const fell = d.tips && kind !== 'graze' && tipOver(this, dirA, power * 0.6);
    if (d.handset) this.offHook ??= w.time; // the receiver jumps off its hook
    if (d.bends) this.lean(dirA, power);
    const swing = info.swing ?? dirA + Math.PI / 2; // a blade's stroke runs across the blow
    if (kind === 'blunt' || kind === 'cut' || kind === 'punch' || kind === 'blast' || kind === 'shrapnel') {
      const s = this.surface(px, py, dirA);
      px = s.x; py = s.y;
      if (info.nx === undefined && kind !== 'blast') { info = { ...info, nx: s.nx, ny: s.ny }; }
    }
    const energy = info.energy ?? ENERGY[kind] ?? 10;
    const inc = kind === 'blast' || kind === 'shrapnel' ? 1 : incidence(dirA, info.nx, info.ny);
    const g = this.ensureCanvas();
    if (rec.rack) this.bottles(); // read off the sprite before anything marks it
    const { sx, sy } = this.spritePoint(px, py, dirA, kind === 'cut' ? Math.min(4, Math.min(this.W, this.H) * 0.3) : 1.2);
    this.lastHit = [sx, sy];
    // (kept for a staged moment, systems/Tutorial.js: a round marks it and no more, nothing sets it off before)
    if (d.gas) damage = this.staged ? 0 : this.gasHit(damage, kind, sx, sy, dirA);
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
      if (chance(0.3)) w.smoke?.burst('short', px, py);
    }
    this.spillOnHit(px, py, dirA);
    if (rec.rack) this.burstRack(sx, sy, tr ? tr.x : sx, tr ? tr.y : sy, dirA, kind);
    if (rec.powder) w.particles.dust(px, py, 4, 5, rec.powder, { speed: 35, size: 4, life: 1.8, alpha: 0.35 });
    if (rec.leak?.on === 'hit' || d.water) this.leak(sx, sy, dirA);
    w.sound(fx.glass || (d.glass && this.inRect(rec.screen, sx, sy)) ? 'glassHit' : fx.hit, px, py, kind === 'pellet' ? 0.35 : 0.55);
    this.recoil(dirA, power);
    if (!d.static && !fell) {
      // the blow's momentum where it landed (data/physics.js BLOW): off its centre it spins it
      const J = (BLOW.per[kind] ?? BLOW.per.bullet) * power * (BLOW.heft[info.heft] ?? 1) * (this.tipped ? d.tips.give : 1);
      impulseAt(this.body, px, py, dirA, J * PX_PER_M / 60);
    }

    if (this.doors) this.swingDoors(power);
    // a way through a wall (data/props.js `lasting`) takes the marks, never gives: no zone of it is torn, it never breaks;
    // nor does a knocked-over bin, but to a blast
    if (d.lasting || (this.tipped && kind !== 'blast')) return;
    // the zone it landed in wears down: corners come off, a line of torn zones saws it in two
    if (!this.zones) this.zones = new ZoneGrid(this.W, this.H, d.hp);
    const torn = this.zones.damage(sx, sy, damage * (ZONE_WEAR[kind] ?? 1), kind === 'blast' ? 0.5 : 0.15);
    if (tr) torn.push(...this.zones.wearLine(sx, sy, tr.x, tr.y, damage * 0.35));
    for (const i of torn) this.tearZone(i, dirA, power);
    if (torn.length && rec.saw) { const cut = this.zones.cut(); if (cut) this.sawOff(cut, dirA); }

    this.hp -= damage;
    // only a blast throws the wreck about; a blow (whose power is the shove it gives) or a round lets it give way
    if (this.hp <= 0) { this.break(dirA, kind === 'blast' ? Math.max(2, power) : Math.min(power, 1.6)); return; }
    const frac = this.hp / d.hp;
    while (this.stage < STAGES.length && frac <= STAGES[this.stage]) this.enterStage(++this.stage, px, py, dirA);
  }

  // blood on it at (px, py), r px (a head slammed on it: Player.landTakedown)
  bloody(px, py, r) {
    if (this.dead || this.dying) return;
    const { sx, sy } = this.toSprite(px, py);
    bloodOn(this.ensureCanvas(), sx, sy, r);
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
    // splinters are torn the way the material leaves: back out of an entry, on along the blow out of an exit
    const piece = bite(this.canvas, sx, sy, r, this.rec.material, dirA - this.body.angle + (side === 'entry' ? Math.PI : 0));
    if (!piece) return;
    const e = ejecta(side, dirA, energy, info.nx, info.ny);
    const a = e.a + rand(-e.spread, e.spread), v = rand(e.vmin, e.vmax);
    const p = this.toWorld(sx, sy);
    this.throwPiece(piece, p.x, p.y, a, v, { z: this.lift() * 0.6, vz: rand(30, 90), physical: !this.def.static && sw(piece) > 6 });
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
    if (this.rec.sheds) P.floaters(px, py, FLOATS[this.rec.sheds], 7, e.a, 1.3, 80, 8);
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
    const k = this.kick, amt = clamp(power, 0.3, 2.5) * (this.def.hung ? 60 : this.def.static ? 40 : 20);
    k.vx += Math.cos(dirA) * amt; k.vy += Math.sin(dirA) * amt;
    k.vr += rand(-1, 1) * 0.6 * clamp(power, 0.3, 2) * (this.def.static ? 0.5 : 1);
    this.flash = 0.06;
  }

  // how far round a ceiling fan has turned
  // blades that turn; once the power is cut (`unpowered` = when, systems/Power.js) they coast to a stop
  spun() {
    const t = this.world.time, u = this.unpowered;
    return (this.def.spin || 0) * (u === undefined ? t : u + COAST * (1 - Math.exp(-(t - u) / COAST)));
  }

  update(dt) {
    const k = this.kick;
    if (k.x || k.y || k.vx || k.vy || k.r || k.vr) {
      // stiff damped spring back to rest; what hangs from the ceiling swings on like a pendulum
      const hung = this.def.hung, ks = hung ? 45 : 700, cs = hung ? 1.1 : 24, kr = hung ? 60 : 500, cr = hung ? 2.5 : 20;
      k.vx += (-ks * k.x - cs * k.vx) * dt; k.vy += (-ks * k.y - cs * k.vy) * dt; k.vr += (-kr * k.r - cr * k.vr) * dt;
      k.x += k.vx * dt; k.y += k.vy * dt; k.r += k.vr * dt;
      if (Math.abs(k.x) + Math.abs(k.y) + Math.abs(k.vx) + Math.abs(k.vy) + Math.abs(k.r) * 50 + Math.abs(k.vr) < 0.02) {
        k.x = k.y = k.vx = k.vy = k.r = k.vr = 0;
      }
    }
    if (this.flash > 0) this.flash -= dt;
    // hanging doors: a loose pendulum about the angle they hang at
    if (this.doors) for (const d of this.doors) { d.v += (-(d.a - d.rest) * 30 - d.v * 2.2) * dt; d.a += d.v * dt; }
    if (this.parts) this.shed(dt);
  }

  // ------------------------------------------------------------------ zones: corners off, sawn in two

  // A worn-out zone gives, the way its material does (MATERIAL_FX `tear`): a ragged chunk breaks off and is blown
  // along the hit, sheet metal is torn open on the dark inside, upholstery opens on its stuffing.
  tearZone(i, dirA, power) {
    const rect = this.zones.rect(i), fx = this.rec.fx, w = this.world;
    const poly = tearShape(rect, this.W, this.H);
    const p = this.toWorld((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
    this.ensureCanvas();
    if (fx.tear === 'gash') {
      gash(this.canvas, poly);
      w.particles.sparks(p.x, p.y, dirA + Math.PI, 1, 5, 220);
      w.sound('metalBreak', p.x, p.y, 0.5);
      return;
    }
    if (fx.tear === 'rip') {
      rip(this.canvas, poly);
      w.particles.floaters(p.x, p.y, FLOATS[fx.float], 8, dirA + Math.PI, 1.2, 50, 8);
      w.sound(fx.hit, p.x, p.y, 0.5);
      return;
    }
    const pc = cutPiece(this.canvas, poly, { min: 6 });
    brokenEdge(this.canvas, poly, this.rec.material, dirA - this.body.angle);
    if (pc) {
      const L = launch(dirA, 0, 0, Math.max(1, power), 1);
      this.throwPiece(pc.img, p.x, p.y, L.a, L.v, { z: this.lift() * 0.7, vz: L.vz, spin: L.spin, physical: sw(pc.img) * sh(pc.img) > 60 });
    }
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
    w.smoke?.burst('screen', q.x, q.y);
    w.sound('glass', q.x, q.y, 0.8);
    this.lightsOut = true;
  }

  // a thin post gives a little more at every blow, the way it was sent (its head is drawn that far off its foot)
  lean(dirA, power) {
    const b = this.bend ||= { x: 0, y: 0 }, k = 2 * Math.min(power, 2), max = this.def.bends;
    b.x += Math.cos(dirA) * k;
    b.y += Math.sin(dirA) * k;
    const l = Math.hypot(b.x, b.y);
    if (l > max) { b.x *= max / l; b.y *= max / l; }
  }

  // something inside falls out of the hole (a book, a ball)
  spillOnHit(px, py, dirA) {
    for (const c of this.rec.contents) {
      if (c.on !== 'hit' || this.spilled >= 6 || !chance(c.perHit ?? 1)) continue;
      this.spilled++;
      this.throwBits(BITS[c.bit], c, 1, px, py, dirA + Math.PI + rand(-0.8, 0.8), 0.8);
    }
  }

  // the bottles or glasses standing on it (rec.rack): found, or set out, the first time they are needed
  bottles() {
    if (!this.rack) {
      this.ensureCanvas();
      this.rack = rackSlots(this.canvas, this.rec.rack, this.x * 7 + this.y * 13);
    }
    return this.rack;
  }

  // what a hit bursts on the rack: the bottles on a bullet's way (sprite points, entry to end of its channel), those
  // under a blow, a whole stretch in a blast
  burstRack(sx, sy, ex, ey, dirA, kind) {
    const shot = kind === 'bullet' || kind === 'rifle' || kind === 'pellet';
    const reach = shot ? 2.4 : kind === 'blast' ? 16 : 6;
    const most = kind === 'pellet' ? 1 : kind === 'bullet' ? 2 : kind === 'rifle' ? 3 : kind === 'blast' ? 8 : 4;
    const dx = ex - sx, dy = ey - sy, l2 = dx * dx + dy * dy;
    const off = (b) => { // from the middle of the bottle to the segment
      const qx = b.x + b.s / 2 - sx, qy = b.y + b.s / 2 - sy, t = l2 ? clamp((qx * dx + qy * dy) / l2, 0, 1) : 0;
      return Math.hypot(qx - dx * t, qy - dy * t);
    };
    this.rack.filter((b) => b.up).map((b) => [off(b), b]).filter(([d]) => d <= reach)
      .sort((p, q) => p[0] - q[0]).slice(0, most).forEach(([, b]) => this.popBottle(b, dirA + Math.PI));
  }

  // one bottle of the rack bursts where it stands: glass in its colour, a splash thrown back toward dirA, and what
  // it held running off the front of the shelf to stand at the foot of it
  popBottle(b, dirA) {
    const w = this.world, P = w.particles, rack = this.rec.rack, smash = BITS[rack.bit].smash;
    const wet = LIQUIDS.kinds[smash.kind].splash;
    b.up = false;
    popSlot(this.canvas, this.img, b, wet);
    const p = this.toWorld(b.x + b.s / 2, b.y + b.s / 2), foot = this.toWorld(b.x + b.s / 2, this.H + 2);
    const front = this.body.angle + Math.PI / 2;
    P.glass(p.x, p.y, dirA, 1.6, smash.glass, 120);
    P.chips(p.x, p.y, dirA, 1.5, 5, b.color, 110);
    P.drops(p.x, p.y, dirA, 1.4, smash.drops, wet, 110, 5, false);
    // what it held, thrown on the wall it stands against, runs down it
    const back = wallBehind(w.map, p.x, p.y, dirA + Math.PI, smash.wall[0]);
    if (back) {
      const [, r, color] = smash.wall;
      const deep = WALL_RIM + 2 + r * 0.5; // behind the wall's outline
      w.decals.wetWall(back.x - back.nx * deep, back.y - back.ny * deep, r, color, back.nx, back.ny);
      run(w, back.x - back.ny * rand(-r, r), back.y + back.nx * rand(-r, r), back.nx, back.ny, rand(2, r * 1.5), color);
    }
    w.flashGlass(p.x, p.y);
    w.emit(foot.x, foot.y, 0.9, () => {
      if (chance(0.45)) P.drops(foot.x + rand(-1.5, 1.5), foot.y, front, 0.6, 1, wet, 22, 9, false);
    });
    w.events.emit('spill', { x: foot.x, y: foot.y, kind: smash.kind, area: smash.area * (rack.share ?? 1) * rand(0.6, 1.3), dur: 0.9 });
    w.sound('glassHit', p.x, p.y, 0.45, { pitch: rand(0.9, 1.25) });
  }

  // what stood on it or in it goes flying (it breaks up, or it is tipped over)
  empty(x, y, dirA, power, z0 = this.lift()) {
    if (this.tipped) return; // what a knocked-over bin held spilled when it went over
    const rec = this.rec;
    let bits = DESTRUCTION.maxBits;
    for (const c of rec.contents) {
      if (c.on !== 'break') continue;
      // of a rack, only the bottles still standing are left to fall
      const n = Math.min(c.n, bits, c.bit === rec.rack?.bit && this.rack ? this.rack.filter((b) => b.up).length : c.n);
      bits -= n;
      this.throwBits(BITS[c.bit], c, n, x, y, dirA, Math.max(0.8, power * 0.8));
    }
    if (rec.floats) this.world.particles.floaters(x, y, FLOATS[rec.floats[0]], rec.floats[1], dirA, Math.PI, 70 * Math.min(power, 2), z0);
  }

  // Tipped over on its side, its top toward dirA (a guard making himself a shield): what stood on it goes flying and
  // the upended table (def.flips) takes its place, as worn as this one was. Returns it, or null when this is not
  // something one tips over (any more).
  flip(dirA) {
    const d = this.def, w = this.world;
    if (!d.flips || this.dead || this.parts) return null;
    const { x, y } = this.centre();
    w.removeBody(this.body);
    this.dead = true;
    const p = new Prop(w, d.flips, x, y, dirA + Math.PI / 2);
    p.hp = Math.max(2, p.hp * this.hp / d.hp);
    // it lands on its edge and rocks
    p.kick.x = -Math.cos(dirA) * 7; p.kick.y = -Math.sin(dirA) * 7; p.kick.vr = rand(-2, 2);
    w.props.push(p);
    this.empty(x, y, dirA, 1);
    w.particles.dust(x, y, 6, this.W * 0.4, this.rec.fx.dust || '#5a5462', { speed: 30, size: 4, life: 2, alpha: 0.16 });
    w.sound('flip', x, y);
    w.events.emit('propFlipped', { prop: this, to: p, x, y, dirA });
    return p;
  }

  // loose bits: real-size little physical things (pool balls roll, records skid, books tumble, bottles smash)
  throwBits(bit, c, n, x, y, dirA, power) {
    const w = this.world;
    const [mw, mh] = bit.size;
    const round = !!bit.round;
    for (let i = 0; i < n; i++) {
      const pw = Math.max(round ? 2.6 : 2, mw * PX_PER_M), ph = Math.max(2, mh * PX_PER_M);
      const color = pick(c.colors || bit.colors), img = bitSprite(c.bit, color, pw, round ? pw : ph);
      const a = dirA + rand(-1.2, 1.2), v = rand(40, 140) * power;
      const z = this.lift() * rand(0.5, 1), vz = rand(30, 110);
      const smash = bit.smash && chance(bit.smash.share) ? (qx, qy) => this.smashBit(bit.smash, color, qx, qy, a) : null;
      if (this.physicalOk()) {
        w.addDebris(new Debris(w, img, x + rand(-3, 3), y + rand(-3, 3), rand(0, TAU), Math.cos(a) * v, Math.sin(a) * v, rand(-0.3, 0.3), {
          circle: round, bounce: bit.bounce ?? 0.25, mu: bit.mu, material: bit.material, z, vz,
          kg: Math.max(0.1, mw * mh * 40), land: round ? 'plastic' : null,
          onLand: smash && ((d) => { smash(d.body.position.x, d.body.position.y); w.removeDebris(d); }),
        }));
      } else w.particles.shard(img, x, y, a, v, { z, vz, onLand: smash && ((p) => smash(p.x, p.y)) });
    }
  }

  // a bottle (smash: its BITS entry) shattering at (x, y): glass in its colour, a splash thrown on toward dirA, and
  // what it held, standing on the floor
  smashBit(smash, color, x, y, dirA) {
    const w = this.world, P = w.particles;
    P.glass(x, y, dirA, 1.5, Math.round(smash.glass * 0.6), 90);
    P.chips(x, y, dirA, 1.5, 4, color, 90);
    P.drops(x, y, dirA, 1.3, Math.round(smash.drops * 0.6), LIQUIDS.kinds[smash.kind].splash, 80, 3, false);
    w.events.emit('spill', { x, y, kind: smash.kind, area: smash.area * rand(0.6, 1.3) });
    w.sound('glassHit', x, y, 0.45, { pitch: rand(0.9, 1.25) });
  }

  // a jet of liquid out of a hole, weakening, and the puddle it makes at the foot of the object
  leak(sx, sy, dirA) {
    if (this.leaks >= DESTRUCTION.maxLeaks) return;
    this.leaks++;
    // rate (px2/s): what a tank under pressure pours out of one hole (a keg floods the floor); jet: drops a step
    const w = this.world, { color = 'rgba(110,160,200,0.16)', dur = 3, kind, rate = LIQUIDS.leak, jet = 2 } = this.rec.leak || { kind: 'water' };
    const out = dirA + Math.PI + rand(-0.4, 0.4); // the jet comes back out of the hole
    let pos = this.toWorld(sx, sy);
    w.emit(pos.x, pos.y, dur, (e) => {
      if (!this.dead) pos = this.toWorld(sx, sy);
      const k = e.t / dur; // pressure falls
      w.particles.drops(pos.x, pos.y, out + rand(-0.1, 0.1), 0.15, k > 0.3 ? jet : 1, color, 40 + 120 * k * (jet > 2 ? 1.6 : 1), 5, kind !== 'water');
    });
    if (kind) w.events.emit('spill', { x: pos.x + Math.cos(out) * 14, y: pos.y + Math.sin(out) * 14, kind, area: rate * dur, dur, a: out });
    w.sound('soft', pos.x, pos.y, 0.4);
  }

  // the pipe it was plumbed to, torn open: water wells up from the floor for a few seconds and floods around it
  flood(x, y, area) {
    const w = this.world, dur = 5;
    w.events.emit('spill', { x, y, kind: this.rec.leak.kind, area, dur });
    w.emit(x, y, dur, (e) => {
      const k = e.t / dur;
      if (chance(0.3 + 0.6 * k)) w.particles.jet(x, y, 1, { vz: 60 + 110 * k, speed: 26, size: 1.7, alpha: 0.7 });
    });
    w.sound('splash', x, y, 0.5, { pitch: rand(0.75, 0.9) });
  }

  // A tank giving way: what it held bursts out all around it at once, a ring of spray thrown wide that weakens, and
  // stands in one big pool (systems/Liquids.js).
  gush(x, y, area) {
    const w = this.world, P = w.particles, R = Math.max(this.W, this.H) / 2, dur = 1.8;
    const { color = 'rgba(110,160,200,0.16)', kind = 'water' } = this.rec.leak || {};
    w.events.emit('spill', { x, y, kind, area, dur });
    P.drops(x, y, 0, Math.PI, 50, color, 240, 12, false);
    w.emit(x, y, dur, (e) => {
      const k = e.t / dur; // time left: the pressure falls
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU);
        P.drops(x + Math.cos(a) * R * 0.8, y + Math.sin(a) * R * 0.8, a, 0.25, 1, color, 50 + 170 * k, 8, false);
      }
    });
    w.sound('splash', x, y, 1, { pitch: 0.55 });
    w.after(0.25, () => w.sound('splash', x, y, 0.7, { pitch: 0.7 }));
  }

  // ------------------------------------------------------------------ doors, wires

  // the doors of a cabinet (rec.doors) spring open on their hinges and swing to where they hang
  openDoors() {
    const n = this.rec.doors.n;
    this.doors = Array.from({ length: n }, () => ({ a: 0, v: rand(9, 14), rest: rand(1.2, 2.1) }));
    const p = this.toWorld(this.W / 2, this.H);
    this.world.particles.sparks(p.x, p.y, this.body.angle + Math.PI / 2, 0.9, 8, 200, '#bff');
    this.world.sound('metal', p.x, p.y, 0.5, { pitch: 1.3 });
  }

  // a blow sets the hanging doors swinging
  swingDoors(power) { for (const d of this.doors) d.v += rand(-1, 1) * 6 * clamp(power, 0.3, 2); }

  // the doors come off with the rest: thin steel plates thrown along the blow
  dropDoors(x, y, dirA) {
    const len = this.W / this.doors.length;
    const img = chunk(this.def.chips, Math.max(2, Math.round(len)), 1);
    for (let i = this.doors.length; i > 0; i--) this.throwPiece(img, x + rand(-3, 3), y + rand(-3, 3), dirA + rand(-0.8, 0.8), rand(40, 90), { z: this.lift(), vz: rand(20, 60) });
    this.doors = null;
  }

  // the wires it was torn from spit sparks for a while where it hung (rec.live)
  liveWires(x, y, dur) {
    const w = this.world;
    w.emit(x, y, dur, (e) => {
      if (!chance(0.05 + 0.1 * (e.t / dur))) return;
      w.particles.sparks(x + rand(-2, 2), y + rand(-2, 2), rand(0, TAU), 1.2, 4, 180, '#bff');
      if (chance(0.3)) w.light(x, y, 30, '#bff6ff', 0.05);
    });
  }

  // ------------------------------------------------------------------ damage states, collapse

  enterStage(stage, px, py, dirA) {
    const w = this.world, d = this.def, rec = this.rec, fx = rec.fx, mat = rec.material;
    const [sx, sy] = this.lastHit || [this.W / 2, this.H / 2];
    if (rec.doors && stage === rec.doors.at) this.openDoors();
    if (stage === 1) {
      wear(this.ensureCanvas(), mat, sx, sy, Math.max(3, fx.cracks + 2), Math.max(this.W, this.H) * 0.3, this.W, this.H);
      w.sound(fx.crush, px, py, 0.5);
    } else if (stage === 2) {
      // it splits right across (wood along its grain); sheet metal buckles and upholstery tears open instead
      const g = this.ensureCanvas();
      if (fx.tear === 'chunk') splitLine(this.canvas, mat === 'wood' ? (this.W >= this.H ? 'x' : 'y') : chance(0.5) ? 'x' : 'y', mat);
      else wear(g, mat, this.W / 2, this.H / 2, 6, Math.max(this.W, this.H) * 0.4, this.W, this.H);
      w.particles.chips(this.x, this.y, dirA, Math.PI, 10, d.chips, 140);
      if (fx.dust) w.particles.dust(this.x, this.y, 4, 4, fx.dust, { speed: 20, size: 5 });
      w.sound(fx.crush, this.x, this.y, 0.8);
    } else if (stage === 3) {
      // a big piece gives way, it sags
      this.ensureCanvas();
      this.tear(clamp(sx + rand(-3, 3), 0, this.W), clamp(sy + rand(-3, 3), 0, this.H), clamp(Math.min(this.W, this.H) * 0.22, 2.5, 6), 'exit', dirA, 15, {});
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
    w.emit(this.x, this.y, dur, (e, dt) => {
      if (this.dead) return;
      if (chance(0.06)) w.particles.sparks(this.x + rand(-4, 4), this.y + rand(-4, 4), rand(0, TAU), 1, 3, 160, '#bff');
      w.smoke?.burn(this.x, this.y, 'short', dt);
    });
  }

  // Gas inside (bottle, stove): whatever holes it lights a jet at the hole and a fuse (systems/Gas.js) and does
  // no other damage; a blow only knocks a bottle about. Returns the damage left to apply.
  gasHit(damage, kind, sx, sy, dirA) {
    const holed = PIERCING.has(kind);
    if (holed && !this.gasLeak) ignite(this, sx, sy, dirA);
    return holed || (this.def.explosive && kind !== 'blast') ? 0 : damage;
  }

  // Gives way: it cracks, sags, then falls apart into its own parts (staged over a few frames; blasts are faster).
  // force: even what never gives (`lasting`): the wall it hung on is gone (systems/Destruction.js watchOpenings)
  break(dirA = rand(0, TAU), power = 1, force = false) {
    if (this.dead || this.dying || (this.def.lasting && !force)) return;
    const d = this.def, w = this.world, fx = this.rec.fx;
    this.hp = Math.min(this.hp, 0);
    // explosives, leaking gas, and gas torn open by a blast
    if (d.explosive || this.gasLeak || (d.gas && power >= 2)) {
      const { x, y } = this.body.position;
      this.collapse(dirA, power);
      w.after(0.06, () => w.explode(x, y, { radius: d.blast ?? 92, source: this.type }));
      return;
    }
    if (d.fountain) { this.collapse(dirA, power); return; } // under pressure: it pops at once
    this.dying = true;
    const [t1, t2] = power >= 2 ? [0.015, 0.03] : DESTRUCTION.stageDelay;
    // 1. crack: lines through it, a crack of the material, lamps and screens pop
    const [sx, sy] = this.lastHit || [this.W / 2, this.H / 2];
    wear(this.ensureCanvas(), this.rec.material, sx, sy, 6, Math.max(this.W, this.H) * 0.5, this.W, this.H);
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

  // Falls apart into its own parts, cut along the recipe's seams. They do not all leave at once: the collapse runs
  // through the object from the blow to its far end (Fracture.crumble), each part staying in place (draw) until its
  // turn (shed). A blast, a lamp or anything overhead goes in one go. What it held spills with the first part.
  collapse(dirA, power) {
    if (this.dead || this.parts) return;
    const d = this.def, w = this.world, rec = this.rec, fx = rec.fx, P = w.particles;
    const { x, y } = this.centre();
    const ang = this.body.angle, ca = Math.cos(ang), sa = Math.sin(ang);
    w.removeBody(this.body);
    if (d.fountain) {
      this.dead = true;
      this.burst(x, y, dirA);
      w.events.emit('propDestroyed', { prop: this, x, y, dirA, power });
      return;
    }
    this.dying = true;
    this.sag = 0;
    // cut the (damaged) sprite along the recipe's seams
    const work = canvas(this.W, this.H, this.img.k);
    put(work.getContext('2d'), this.look);
    const pieces = [];
    // (whole pieces painted as such, where they were in it: what is left is cut as usual)
    for (const [name, x0, x1, fly = 1] of rec.pieces || []) {
      const img = spriteOpt(`props/${name}`);
      work.getContext('2d').clearRect(x0 * this.W, 0, (x1 - x0) * this.W, this.H);
      if (img) pieces.push({ img, cx: ((x0 + x1) / 2) * this.W, cy: this.H / 2, name, fly });
    }
    for (const g of [...rec.parts, { cut: 'grid', cols: 2, rows: 2 }]) {
      for (const c of cutPolys(g, this.W, this.H, Math.random, this.lastHit)) {
        const pc = cutPiece(work, c.poly, { min: 8, wreck: true });
        if (pc) pieces.push({ ...pc, name: c.name, fly: c.fly ?? 1 });
      }
    }
    pieces.sort((p, q) => sw(q.img) * sh(q.img) - sw(p.img) * sh(p.img));
    // heavy furniture gives way where it stands: its big parts slump and slide a little, the crumbs are only chips.
    // Only a blast throws it around.
    const heavy = power < 2 && this.W * this.H > DESTRUCTION.heavyArea;
    if (heavy) pieces.length = Math.min(pieces.length, DESTRUCTION.heavyParts);
    let physical = d.static ? Math.min(DESTRUCTION.maxPhysicalParts, 3) : DESTRUCTION.maxPhysicalParts;
    for (const pc of pieces) pc.physical = sw(pc.img) * sh(pc.img) > 50 && physical-- > 0;
    // parts the top view hid (table legs)
    if (rec.legs) {
      const s = Math.max(2, rec.legs.size * PX_PER_M), n = rec.legs.n;
      for (let i = 0; i < n; i++) {
        const lx = n === 1 ? 0 : (i % 2 ? 0.4 : -0.4) * this.W, ly = n <= 2 ? 0 : (i < 2 ? -0.4 : 0.4) * this.H;
        const img = chunk(rec.legs.color, Math.round(s), Math.round(Math.max(s, rec.height * PX_PER_M * 0.5)));
        pieces.push({ img, cx: this.W / 2 + lx, cy: this.H / 2 + ly, fly: 1, leg: true });
      }
    }
    const grounded = !d.fixture && !d.overhead && !d.hung;
    const wave = crumble(pieces, this.lastHit || [this.W / 2, this.H / 2], grounded && power < 2 && !d.explosive ? DESTRUCTION.crumble : 0);
    pieces.forEach((pc, i) => { pc.t = wave[i]; });
    const z0 = this.lift();
    this.parts = pieces;
    this.fall = { x, y, ca, sa, dirA, power, heavy, z0, t: 0, harm: power >= 1.5 ? { kind: 'blunt', knock: 3.5, lethal: 8.5 } : null };
    if (rec.spill === 'soil') w.decals.bake(soilSpill(this.W, this.H), x, y, ang);
    else if (grounded) w.decals.bake(remains(this.W, this.H, d.chips), x, y, ang);
    if (rec.stump === 'duct') w.decals.bake(ductStump(Math.round(Math.min(this.W, this.H) * 0.8)), x, y, ang);
    if (this.doors) this.dropDoors(x, y, dirA);
    this.shed(0);
    this.empty(x, y, dirA, power, z0);
    const R = Math.max(this.W, this.H) * 0.4;
    if (rec.powder) P.dust(x, y, 26, R, rec.powder, { speed: 60 * power, size: 9, life: 4.5, alpha: 0.4 });
    // dust that hangs, then settles
    P.dust(x, y, Math.round(4 + R / 3), R, fx.dust || '#5a5462', { speed: 25 * power, size: 5, life: 3.5, alpha: fx.dust ? 0.2 : 0.14 });
    P.chips(x, y, dirA, Math.PI, heavy ? 8 : 14, d.chips, heavy ? 90 : 160);
    if (fx.glass || d.glass) { P.glass(x, y, dirA, 1.5, 18); w.sound('glass', x, y, 0.6); }
    if (rec.electric) { P.sparks(x, y, 0, Math.PI, 16, 260, '#bff'); w.smoke?.burst('short', x, y, 2); }
    // a motor dying: a black puff that rolls out of it and hangs
    if (rec.puff) w.smoke?.burst('motor', x, y, rec.puff);
    if (rec.live) this.liveWires(x, y, rec.live);
    if (rec.gush) this.gush(x, y, rec.gush);
    if (d.dirt || rec.contents.some((c) => c.bit === 'soil')) P.chips(x, y, 0, Math.PI, 18, '#4a2e1a', 120);
    if (d.water || rec.leak?.on === 'break') {
      P.drops(x, y, 0, Math.PI, 18, rec.leak?.color || 'rgba(110,160,200,0.16)', 140, 6, rec.leak?.kind !== 'water');
      // what stands as a puddle keeps running out of it a while; the rest (a fridge's cartons) only splashes
      if (rec.leak?.on === 'break' && rec.leak.kind) this.leak(this.W / 2, this.H / 2, dirA);
    }
    if (rec.leak?.flood) this.flood(x, y, rec.leak.flood);
    w.events.emit('propDestroyed', { prop: this, x, y, dirA, power });
    if (d.explosive) return;
    w.sound(fx.crush, x, y);
    // the heavy thud of the remains hitting the floor
    if (this.W * this.H > 300) w.after(0.18, () => w.sound('bodyFall', x, y, 0.6));
    w.shake(0.08 + Math.min(0.15, (this.W * this.H) / 8000));
  }

  // the collapse goes on: the parts whose turn has come let go; once the last one has, the object is gone
  shed(dt) {
    const f = this.fall;
    f.t += dt;
    this.parts = this.parts.filter((pc) => pc.t > f.t || this.release(pc));
    if (this.parts.length) return;
    this.parts = null;
    this.dying = false;
    this.dead = true;
  }

  // one part comes loose where it was: big furniture slumps, the rest is thrown along the blow; crumbs at the tear
  release(pc) {
    const f = this.fall, lx = pc.cx - this.W / 2, ly = pc.cy - this.H / 2;
    const ox = lx * f.ca - ly * f.sa, oy = lx * f.sa + ly * f.ca;
    const L = launch(f.dirA, ox, oy, f.power, pc.fly), calm = f.heavy ? 0.3 : 1;
    if (pc.leg) this.throwPiece(pc.img, f.x + ox, f.y + oy, L.a, L.v * 0.7 * calm, { z: f.z0 * 0.4, vz: L.vz * 0.6, spin: L.spin });
    else {
      this.throwPiece(pc.img, f.x + ox, f.y + oy, L.a, L.v * calm, {
        z: f.z0 * rand(0.6, 1), vz: this.rec.drop || f.heavy ? rand(-10, 20) : L.vz, spin: L.spin * calm,
        physical: pc.physical, harm: f.harm && { ...f.harm },
      });
      if (pc.t > 0) this.world.particles.chips(f.x + ox, f.y + oy, L.a, 1.4, 2, this.def.chips, 80);
    }
  }

  // A hydrant gives way in one piece: the main blows the whole body off its flange, straight up (toward the camera,
  // see Particles HIGH), and it comes down a few metres away while the water keeps gushing out of the stump:
  // a white column, its crown falling back as rain all around, mist. The flood is systems/Liquids.js.
  burst(x, y, dirA) {
    const w = this.world, P = w.particles, dur = LIQUIDS.hydrant.dur;
    w.decals.bake(stump(Math.max(this.W, this.H)), x, y, this.body.angle);
    P.shard(this.look, x, y, dirA + rand(-0.6, 0.6), rand(30, 60), {
      high: true, z: 8, vz: rand(400, 450), rot: this.body.angle, spin: rand(4, 8) * pick([-1, 1]), drag: 0.4,
      onLand: (p) => this.thump(p),
    });
    // the first slug of water, the paint and rust it tears off
    P.jet(x, y, 50, { vz: 470, speed: 50, size: 3.4, alpha: 0.95 });
    P.jet(x, y, 40, { vz: 260, speed: 210, size: 2.2, alpha: 0.7 });
    P.chips(x, y, 0, Math.PI, 16, this.def.chips, 220);
    P.sparks(x, y, 0, Math.PI, 8, 260);
    w.rings.push({ x, y, r: 3, max: 40, t: 0, dur: 0.3 });
    w.light(x, y, 70, '#cfe6ff', 0.15);
    w.shake(0.35);
    w.sound(this.rec.fx.crush, x, y);
    w.sound('tirePop', x, y, 0.9);
    w.sound('splash', x, y, 1, { pitch: 0.55 });
    w.noise(x, y, 300);
    let hiss = 0;
    w.emit(x, y, dur, (e) => {
      // pressure: throbbing, falling to a dribble over the last third
      const k = Math.min(1, e.t / (dur * 0.33)) * (0.86 + 0.14 * Math.sin(e.t * 9));
      P.jet(e.x, e.y, 6, { vz: 440 * k, speed: 20, size: 2.5, alpha: 0.95 });   // the column
      P.jet(e.x, e.y, 3, { vz: 370 * k, speed: 115 * k, size: 1.8, alpha: 0.6 }); // its crown, falling back all around
      if (chance(0.3)) w.smoke?.burst('spray', e.x, e.y, k); // the mist off it
      if (w.time >= hiss) {
        hiss = w.time + rand(0.4, 0.7);
        w.sound('splash', e.x, e.y, 0.3 * k, { pitch: rand(0.5, 0.7) });
      }
    });
  }

  // the hydrant body coming back down (p: its airborne shard): it dents the floor, floors whoever stands under it
  // and stays there as a heavy loose piece
  thump(p) {
    const w = this.world;
    w.sound('metalBreak', p.x, p.y, 0.9);
    w.shake(0.3);
    w.particles.sparks(p.x, p.y, 0, Math.PI, 10, 220);
    w.particles.dust(p.x, p.y, 5, 4, '#7a7078', { speed: 40, size: 5, life: 1.6 });
    for (const c of w.enemies) {
      if (c.alive && !c.knocked && Math.hypot(c.x - p.x, c.y - p.y) < c.radius + 7) c.knock(Math.atan2(c.y - p.y, c.x - p.x), 'debris');
    }
    w.addDebris(new Debris(w, p.img, p.x, p.y, p.rot, p.vx * 0.6, p.vy * 0.6, rand(-0.25, 0.25),
      { material: 'metal', kg: 30, vz: 150, land: 'metal', bounce: 0.2 }));
  }

  // ------------------------------------------------------------------ drawing

  shadowImg() {
    if (!this.canvas) return silhouette(this.img);
    if (!this.shadow) {
      const s = this.shadow = canvas(this.W, this.H, this.canvas.k);
      const g = s.getContext('2d');
      put(g, this.canvas);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.W, this.H);
    }
    return this.shadow;
  }

  draw(ctx) {
    if (this.parts) { this.drawParts(ctx); return; }
    const o = this.centre(), k = this.kick;
    const x = o.x + k.x, y = o.y + k.y, a = this.body.angle + this.sag + k.r;
    if (this.def.overhead) {
      // drawn later, above characters; what stands on the ground casts a shadow at its foot
      if (!this.def.hung) drawSprite(ctx, this.shadowImg(), o.x + 5, o.y + 7, a, 0.28);
      else if (this.def.spin) drawSprite(ctx, this.shadowImg(), x + 4, y + 9, a + this.spun(), 0.2); // blades over the floor
      return;
    }
    if (this.rec.rack?.scatter && !this.rack) this.bottles(); // the glasses on a counter are set out when first seen
    drawSprite(ctx, this.shadowImg(), x + 3, y + 3, a, this.canvas ? 0.3 : 0.35);
    drawSprite(ctx, this.look, x, y, a, 1, this.squash);
    if (this.doors) this.drawDoors(ctx, x, y, a);
    if (this.flash > 0) {
      // hit flash: the object brightens for a frame or two
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, this.look, x, y, a, clamp(this.flash / 0.06, 0, 1) * 0.35, this.squash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // the open doors of a cabinet, seen edge on from above: thin plates out of its front corners (local +y edge)
  drawDoors(ctx, x, y, a) {
    const n = this.doors.length, len = this.W / n, c = Math.cos(a), s = Math.sin(a);
    ctx.save();
    ctx.transform(c, s, -s, c, x, y);
    this.doors.forEach((d, i) => {
      // left door hinged on the left corner, right one on the right, both swinging out into the room
      const side = n === 1 || i === 0 ? -1 : 1, hx = (side * this.W) / 2, an = side < 0 ? d.a : Math.PI - d.a;
      ctx.save();
      ctx.translate(hx, this.H / 2);
      ctx.rotate(an);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(1, 1.5, len, 2);
      ctx.fillStyle = INK_DOOR;
      ctx.fillRect(0, -0.5, len, 3);
      ctx.fillStyle = this.def.chips;
      ctx.fillRect(0.5, 0, len - 1, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; // its edge catches the light
      ctx.fillRect(0.5, 0, len - 1, 0.7);
      ctx.restore();
    });
    ctx.restore();
  }

  // falling apart: the parts that have not let go yet, still in place; one about to go shudders
  drawParts(ctx) {
    const f = this.fall, a = this.body.angle;
    for (const pc of this.parts) {
      if (pc.leg) continue; // still hidden under the top
      const lx = pc.cx - this.W / 2, ly = pc.cy - this.H / 2, loose = pc.t - f.t < 0.07 ? 0.8 : 0;
      const x = f.x + lx * f.ca - ly * f.sa + rand(-loose, loose), y = f.y + lx * f.sa + ly * f.ca + rand(-loose, loose);
      drawSprite(ctx, silhouette(pc.img), x + 2, y + 2, a, 0.3);
      drawSprite(ctx, pc.img, x, y, a);
    }
  }

  // canopies and lamp heads: above everyone, see-through when the player is under
  drawOverhead(ctx, player, cam) {
    const o = this.centre(), k = this.kick, d = this.def;
    // parallax: what sits up high leans away from the centre of the view
    this.ox = (o.x - cam.x) * (d.height || 0);
    this.oy = (o.y - cam.y) * (d.height || 0);
    const b = this.bend || { x: 0, y: 0 }; // a bent post keeps its lean
    const x = o.x + this.ox + k.x + b.x, y = o.y + this.oy + k.y + b.y, a = this.body.angle + this.sag + k.r + this.spun();
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
