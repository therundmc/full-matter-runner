// A prop hit (entities/Prop.js composes it; data/destruction.js says how each one comes apart, systems/Fracture.js
// the geometry): the mark where it landed, the material torn out and thrown back or through, a splash of what is in
// it, the kick it takes; its damage zones worn down, a corner torn off, the object sawn in two. Functions of the
// prop (`me`).
import { MAX_DEBRIS, DESTRUCTION } from '../../Config.js';
import { FLOATS } from '../../data/destruction.js';
import { PX_PER_M } from '../../../engine/physics/Units.js';
import { chunk, sw, sh } from '../../../engine/Assets.js';
import { segPoly } from '../../../engine/physics/Raycast.js';
import { rand, chance, clamp } from '../../../engine/math.js';
import { incidence, markShape, exitShape, ejecta, track, ZoneGrid, launch, tearShape } from '../../systems/Fracture.js';
import { RESIST } from '../../systems/Penetration.js';
import { paintMark, paintTrack, bite, cutPiece, cracks, gash, rip, brokenEdge, bloodOn } from '../../render/DamageArt.js';
import Debris from '../Debris.js';
import { impulseAt } from '../../../engine/physics/Body.js';
import { BLOW } from '../../data/physics.js';
import { tipOver } from '../../systems/Tipping.js';
import { mountOf, SWING } from '../../data/mounts.js';

// damage states, by fraction of hit points left: cracked, split, giving way
const STAGES = [0.7, 0.45, 0.2];

// how hard each kind of hit wears the damage zone it lands in
const ZONE_WEAR = { pellet: 0.6, bullet: 1, rifle: 1.4, graze: 0.4, blunt: 1.7, blast: 2.2, cut: 0.5, punch: 0.3, shrapnel: 0.3 };

// penetration energy assumed when the caller does not give one
const ENERGY = { pellet: 4, bullet: 10, rifle: 34, graze: 6, blunt: 14, blast: 24, cut: 3, punch: 2, shrapnel: 3 };

// what reaches a fitting up on a ceiling (mount 'ceiling': hits 'blast')
const BLASTS = new Set(['blast', 'shrapnel']);

const COAST = 1.6; // s a fan takes to run down once the power is cut

// damage: hit points, (px, py): where it landed, dirA: direction of the blow, power: shove / violence,
// kind: see the header. info (bullets): { nx, ny } surface normal, energy left when it arrived,
// exit: { x, y, energy } if the round went through, ricochet: it glanced off; (blades): swing direction.
export function hit(me, damage, px, py, dirA, power = 0.6, kind = 'bullet', info = {}) {
  const d = me.def, w = me.world, rec = me.rec, fx = rec.fx, takes = mountOf(d).hits;
  // a structure takes nothing, ever (a billboard's face is its Board's); up on a ceiling: only a blast reaches it
  if (me.dead || me.dying || takes === 'none' || (takes === 'blast' && !BLASTS.has(kind))) return;
  w.events.emit('propHit', { prop: me, x: px, y: py, dirA, kind, power });
  // a street bin goes over instead (systems/Tipping.js), sent along by the blow; it then lands on the can lying there
  const fell = d.tips && kind !== 'graze' && tipOver(me, dirA, power * 0.6);
  if (d.handset) me.offHook ??= w.time; // the receiver jumps off its hook
  if (d.bends) me.lean(dirA, power);
  const swing = info.swing ?? dirA + Math.PI / 2; // a blade's stroke runs across the blow
  if (kind === 'blunt' || kind === 'cut' || kind === 'punch' || kind === 'blast' || kind === 'shrapnel') {
    const s = me.surface(px, py, dirA);
    px = s.x; py = s.y;
    if (info.nx === undefined && kind !== 'blast') { info = { ...info, nx: s.nx, ny: s.ny }; }
  }
  const energy = info.energy ?? ENERGY[kind] ?? 10;
  const inc = kind === 'blast' || kind === 'shrapnel' ? 1 : incidence(dirA, info.nx, info.ny);
  const g = me.ensureCanvas();
  if (rec.rack) me.bottles(); // read off the sprite before anything marks it
  const { sx, sy } = spritePoint(me, px, py, dirA, kind === 'cut' ? Math.min(4, Math.min(me.W, me.H) * 0.3) : 1.2);
  me.lastHit = [sx, sy];
  // (kept for a staged moment, systems/Tutorial.js: a round marks it and no more, nothing sets it off before)
  if (d.gas) damage = me.staged ? 0 : me.gasHit(damage, kind, sx, sy, dirA);
  const la = dirA - me.body.angle; // shot direction in sprite space
  const size = Math.min(me.W, me.H);
  const m = markShape(kind, { energy, inc, size, hard: fx.hard, cracks: fx.cracks, glass: fx.glass, ricochet: info.ricochet });
  paintMark(g, sx, sy, m, kind === 'cut' ? swing - me.body.angle : la, rec.material);
  // the channel it dug on its way through (or until it stopped)
  let tr = null;
  if ((kind === 'bullet' || kind === 'rifle' || kind === 'pellet') && !fx.hard) {
    const ex = info.exit && me.toSprite(info.exit.x, info.exit.y);
    tr = track(sx, sy, la, energy, RESIST[rec.material] ?? 1, me.W, me.H, ex && [ex.sx, ex.sy]);
    paintTrack(g, sx, sy, tr.x, tr.y, kind === 'rifle' ? 1.1 : kind === 'pellet' ? 0.6 : 0.8, rec.material);
  }
  if (m.bite > 0.6) me.tear(sx, sy, m.bite, info.ricochet ? 'entry' : kind === 'blunt' || kind === 'blast' ? 'exit' : 'entry', dirA, energy, info);
  me.splash('entry', px, py, dirA, energy, info, kind);
  if (info.exit) me.exitWound(info.exit.x, info.exit.y, dirA, info.exit.energy);

  if (rec.screen && (kind === 'blunt' || inRect(me, rec.screen, sx, sy))) me.hitScreen(sx, sy, kind === 'blunt' || kind === 'blast' ? 2 : 1);
  if (rec.electric && kind !== 'punch') {
    w.particles.sparks(px, py, dirA + Math.PI, 0.9, chance(0.5) ? 6 : 2, 240, chance(0.5) ? '#9ff' : undefined);
    if (chance(0.3)) w.smoke?.burst('short', px, py);
  }
  me.spillOnHit(px, py, dirA);
  if (rec.rack) me.burstRack(sx, sy, tr ? tr.x : sx, tr ? tr.y : sy, dirA, kind);
  if (rec.powder) w.particles.dust(px, py, 4, 5, rec.powder, { speed: 35, size: 4, life: 1.8, alpha: 0.35 });
  if (rec.leak?.on === 'hit' || d.water) me.leak(sx, sy, dirA);
  w.sound(fx.glass || (d.glass && inRect(me, rec.screen, sx, sy)) ? 'glassHit' : fx.hit, px, py, kind === 'pellet' ? 0.35 : 0.55);
  me.recoil(dirA, power);
  if (!d.static && !fell) {
    // the blow's momentum where it landed (data/physics.js BLOW): off its centre it spins it
    const J = (BLOW.per[kind] ?? BLOW.per.bullet) * power * (BLOW.heft[info.heft] ?? 1) * (me.tipped ? d.tips.give : 1);
    impulseAt(me.body, px, py, dirA, J * PX_PER_M / 60);
  }

  if (me.doors) me.swingDoors(power);
  // a way through a wall (data/props.js `lasting`) takes the marks, never gives: no zone of it is torn, it never breaks;
  // nor does a knocked-over bin, but to a blast
  if (d.lasting || (me.tipped && kind !== 'blast')) return;
  // the zone it landed in wears down: corners come off, a line of torn zones saws it in two
  if (!me.zones) me.zones = new ZoneGrid(me.W, me.H, d.hp);
  const torn = me.zones.damage(sx, sy, damage * (ZONE_WEAR[kind] ?? 1), kind === 'blast' ? 0.5 : 0.15);
  if (tr) torn.push(...me.zones.wearLine(sx, sy, tr.x, tr.y, damage * 0.35));
  for (const i of torn) tearZone(me, i, dirA, power);
  if (torn.length && rec.saw) { const cut = me.zones.cut(); if (cut) sawOff(me, cut, dirA); }

  me.hp -= damage;
  // only a blast throws the wreck about; a blow (whose power is the shove it gives) or a round lets it give way
  if (me.hp <= 0) { me.break(dirA, kind === 'blast' ? Math.max(2, power) : Math.min(power, 1.6)); return; }
  const frac = me.hp / d.hp;
  while (me.stage < STAGES.length && frac <= STAGES[me.stage]) me.enterStage(++me.stage, px, py, dirA);
}

// blood on it at (px, py), r px (a head slammed on it: Player.landTakedown)
export function bloody(me, px, py, r) {
  if (me.dead || me.dying) return;
  const { sx, sy } = me.toSprite(px, py);
  bloodOn(me.ensureCanvas(), sx, sy, r);
}

// where a blow along dirA through (px, py) meets the object's outline (and the surface normal there)
export function surface(me, px, py, dirA) {
  const c = Math.cos(dirA), s = Math.sin(dirA), R = Math.max(me.W, me.H) + 30;
  const r = segPoly(px - c * R, py - s * R, px + c * R, py + s * R, me.body.vertices);
  if (!r) return { x: px, y: py };
  return { x: px - c * R + c * 2 * R * r.t, y: py - s * R + s * 2 * R * r.t, nx: r.nx, ny: r.ny };
}

// sprite pixel just inside the hit point, kept on the sprite
function spritePoint(me, px, py, dirA, depth = 1.2) {
  const p = me.toSprite(px + Math.cos(dirA) * depth, py + Math.sin(dirA) * depth);
  return { sx: clamp(p.sx, 0.5, me.W - 0.5), sy: clamp(p.sy, 0.5, me.H - 0.5) };
}

function inRect(me, fr, sx, sy) {
  return !!fr && sx >= fr[0] * me.W - 1 && sx <= fr[2] * me.W + 1 && sy >= fr[1] * me.H - 1 && sy <= fr[3] * me.H + 1;
}

// can we afford one more physical piece?
export function physicalOk(me) { return me.world.debris.length < MAX_DEBRIS * DESTRUCTION.physicalShare; }

// throw a piece of this object (canvas img at world x, y)
export function throwPiece(me, img, x, y, a, v, { z = 4, vz = 60, spin = rand(-0.4, 0.4), physical = false, harm = null, kg } = {}) {
  const w = me.world;
  if (physical && me.physicalOk()) {
    w.addDebris(new Debris(w, img, x, y, me.body.angle, Math.cos(a) * v, Math.sin(a) * v, spin,
      { air: 0.06, material: me.def.material, z, vz, land: me.rec.fx.hit, harm, kg }));
  } else {
    w.particles.shard(img, x, y, a, v, { rot: me.body.angle + rand(-0.3, 0.3), z, vz, spin: spin * 30 });
  }
}

// material torn out around a hit: flies back out of the entry, or forward when blown through
export function tear(me, sx, sy, r, side, dirA, energy, info) {
  // splinters are torn the way the material leaves: back out of an entry, on along the blow out of an exit
  const piece = bite(me.canvas, sx, sy, r, me.rec.material, dirA - me.body.angle + (side === 'entry' ? Math.PI : 0));
  if (!piece) return;
  const e = ejecta(side, dirA, energy, info.nx, info.ny);
  const a = e.a + rand(-e.spread, e.spread), v = rand(e.vmin, e.vmax);
  const p = me.toWorld(sx, sy);
  me.throwPiece(piece, p.x, p.y, a, v, { z: me.lift() * 0.6, vz: rand(30, 90), physical: !me.def.static && sw(piece) > 6 });
}

// how high (fake px) pieces start from: the object's height
export function lift(me) { return clamp(me.rec.height * PX_PER_M * 0.35, 2, me.rec.drop ? 60 : 22); }

// the spray of material out of a hole: back-splash at the entry, a cone along the shot at the exit
export function splash(me, side, px, py, dirA, energy, info, kind) {
  const w = me.world, fx = me.rec.fx, d = me.def, P = w.particles;
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
  if (me.rec.sheds) P.floaters(px, py, FLOATS[me.rec.sheds], 7, e.a, 1.3, 80, 8);
  if (fx.dust) P.dust(px, py, side === 'exit' ? 2 : 1, 1.5, fx.dust, { speed: 20, size: 3, life: 1.6, vx: Math.cos(e.a) * 15, vy: Math.sin(e.a) * 15 });
}

// a round came out of the far side at (px, py) with `energy` left: blow-out, debris blown forward along dirA
export function exitWound(me, px, py, dirA, energy = 10) {
  if (me.dead || me.dying) return;
  const fx = me.rec.fx;
  const g = me.ensureCanvas();
  const p = me.toSprite(px - Math.cos(dirA) * 1.2, py - Math.sin(dirA) * 1.2);
  const sx = clamp(p.sx, 0.5, me.W - 0.5), sy = clamp(p.sy, 0.5, me.H - 0.5);
  const m = exitShape(energy, { hard: fx.hard, glass: fx.glass });
  paintMark(g, sx, sy, m, dirA - me.body.angle, me.rec.material);
  if (m.bite > 0.6) me.tear(sx, sy, m.bite, 'exit', dirA, energy, {});
  me.splash('exit', px, py, dirA, energy, {}, 'rifle');
}

// little recoil of the struck object, by its mount (data/mounts.js SWING): what hangs from a ceiling swings on like
// a pendulum, a structure never moves, anything else gives a stiff shudder (bolted harder than loose)
export function recoil(me, dirA, power) {
  const d = me.def, S = SWING[mountOf(d).swing];
  if (!S) return;
  const k = me.kick, amt = clamp(power, 0.3, 2.5) * (d.static || d.hung ? S.kick : S.loose);
  k.vx += Math.cos(dirA) * amt; k.vy += Math.sin(dirA) * amt;
  k.vr += rand(-1, 1) * 0.6 * clamp(power, 0.3, 2) * (me.def.static ? 0.5 : 1);
  me.flash = 0.06;
}

// how far round a ceiling fan has turned
// blades that turn; once the power is cut (`unpowered` = when, systems/Power.js) they coast to a stop
export function spun(me) {
  const t = me.world.time, u = me.unpowered;
  return (me.def.spin || 0) * (u === undefined ? t : u + COAST * (1 - Math.exp(-(t - u) / COAST)));
}

// A worn-out zone gives, the way its material does (MATERIAL_FX `tear`): a ragged chunk breaks off and is blown
// along the hit, sheet metal is torn open on the dark inside, upholstery opens on its stuffing.
function tearZone(me, i, dirA, power) {
  const rect = me.zones.rect(i), fx = me.rec.fx, w = me.world;
  const poly = tearShape(rect, me.W, me.H);
  const p = me.toWorld((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
  me.ensureCanvas();
  if (fx.tear === 'gash') {
    gash(me.canvas, poly);
    w.particles.sparks(p.x, p.y, dirA + Math.PI, 1, 5, 220);
    w.sound('metalBreak', p.x, p.y, 0.5);
    return;
  }
  if (fx.tear === 'rip') {
    rip(me.canvas, poly);
    w.particles.floaters(p.x, p.y, FLOATS[fx.float], 8, dirA + Math.PI, 1.2, 50, 8);
    w.sound(fx.hit, p.x, p.y, 0.5);
    return;
  }
  const pc = cutPiece(me.canvas, poly, { min: 6 });
  brokenEdge(me.canvas, poly, me.rec.material, dirA - me.body.angle);
  if (pc) {
    const L = launch(dirA, 0, 0, Math.max(1, power), 1);
    me.throwPiece(pc.img, p.x, p.y, L.a, L.v, { z: me.lift() * 0.7, vz: L.vz, spin: L.spin, physical: sw(pc.img) * sh(pc.img) > 60 });
  }
  if (fx.dust) w.particles.dust(p.x, p.y, 3, 2, fx.dust, { speed: 25, size: 4, vx: Math.cos(dirA) * 20, vy: Math.sin(dirA) * 20 });
  w.particles.chips(p.x, p.y, dirA, 1, 6, me.def.chips, 120);
  w.sound(fx.crush, p.x, p.y, 0.6);
}

// a line of torn zones cut right across: the smaller side falls off, what is left stays up
function sawOff(me, cut, dirA) {
  const z = me.zones;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of cut.cells) {
    const [a, b, c, d] = z.rect(i);
    x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
  }
  z.detach(cut.cells);
  const pc = cutPiece(me.canvas, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { min: 10 });
  me.shadow = null;
  const w = me.world;
  const p = me.toWorld((x0 + x1) / 2, (y0 + y1) / 2);
  if (pc) {
    // it sags off and drops: slow, heavy
    me.throwPiece(pc.img, p.x, p.y, dirA + rand(-0.4, 0.4), rand(15, 45), { z: me.lift() * 0.5, vz: 20, spin: rand(-0.12, 0.12), physical: true });
  }
  w.particles.dust(p.x, p.y, 6, 4, me.rec.fx.dust || '#7a7078', { speed: 30, size: 6 });
  w.sound('creak', p.x, p.y, 0.8);
  w.sound(me.rec.fx.crush, p.x, p.y, 0.8);
  // a bolted object keeps standing on what is left: its body shrinks to it
  const b = z.bounds();
  if (b && me.def.static && !me.def.r) shrink(me, b);
  me.hp = Math.min(me.hp, me.def.hp * (z.intactCount() / z.state.length) + 1);
}

function shrink(me, [x0, y0, x1, y1]) {
  const d = me.def, w = me.world;
  const o = me.centre(), a = me.body.angle;
  const kx = d.w / me.W, ky = d.h / me.H;
  const cx = (x0 + x1) / 2 - me.W / 2, cy = (y0 + y1) / 2 - me.H / 2;
  w.removeBody(me.body);
  me.opts.angle = a;
  me.makeBody(o.x + cx * Math.cos(a) - cy * Math.sin(a), o.y + cx * Math.sin(a) + cy * Math.cos(a),
    Math.max(3, (x1 - x0) * kx), Math.max(3, (y1 - y0) * ky));
  me.off = { x: -cx, y: -cy };
  w.addBody(me.body);
}
