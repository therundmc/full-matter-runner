// A prop's damage states and its end (entities/Prop.js composes it): cracked, split, giving way; smouldering, a gas
// bottle holed; broken, collapsed into its own parts, the pieces shed and let go, a burst. Functions of the prop
// (`me`).
import { DESTRUCTION } from '../../Config.js';
import { LIQUIDS } from '../../data/liquids.js';
import { ROUNDS } from '../../data/weapons.js';
import { FLOATS } from '../../data/destruction.js';
import { PX_PER_M } from '../../../engine/physics/Units.js';
import { spriteOpt, chunk, sw, sh } from '../../../engine/Assets.js';
import { TAU, rand, chance, clamp, pick } from '../../../engine/math.js';
import { cutPolys, launch, crumble } from '../../systems/Fracture.js';
import { canvas, put, cutPiece, splitLine, stump, remains, wear, soilSpill, ductStump } from '../../render/DamageArt.js';
import Debris from '../Debris.js';
import { ignite } from '../../systems/Gas.js';

// what holes a gas bottle or a stove (see gasHit)
const PIERCING = ROUNDS;

export function enterStage(me, stage, px, py, dirA) {
  const w = me.world, d = me.def, rec = me.rec, fx = rec.fx, mat = rec.material;
  const [sx, sy] = me.lastHit || [me.W / 2, me.H / 2];
  if (rec.doors && stage === rec.doors.at) me.openDoors();
  if (stage === 1) {
    wear(me.ensureCanvas(), mat, sx, sy, Math.max(3, fx.cracks + 2), Math.max(me.W, me.H) * 0.3, me.W, me.H);
    w.sound(fx.crush, px, py, 0.5);
  } else if (stage === 2) {
    // it splits right across (wood along its grain); sheet metal buckles and upholstery tears open instead
    const g = me.ensureCanvas();
    if (fx.tear === 'chunk') splitLine(me.canvas, mat === 'wood' ? (me.W >= me.H ? 'x' : 'y') : chance(0.5) ? 'x' : 'y', mat);
    else wear(g, mat, me.W / 2, me.H / 2, 6, Math.max(me.W, me.H) * 0.4, me.W, me.H);
    w.particles.chips(me.x, me.y, dirA, Math.PI, 10, d.chips, 140);
    if (fx.dust) w.particles.dust(me.x, me.y, 4, 4, fx.dust, { speed: 20, size: 5 });
    w.sound(fx.crush, me.x, me.y, 0.8);
  } else if (stage === 3) {
    // a big piece gives way, it sags
    me.ensureCanvas();
    me.tear(clamp(sx + rand(-3, 3), 0, me.W), clamp(sy + rand(-3, 3), 0, me.H), clamp(Math.min(me.W, me.H) * 0.22, 2.5, 6), 'exit', dirA, 15, {});
    me.sag = rand(-0.025, 0.025);
    w.particles.dust(me.x, me.y, 6, 5, fx.dust || '#6a6070', { speed: 22, size: 6, life: 2.5 });
    if (fx.float) w.particles.floaters(me.x, me.y, FLOATS[fx.float], 10, dirA, 1.5, 50, 8);
    if (me.rec.electric) smoulder(me, 3);
    w.sound('creak', me.x, me.y, 0.8);
  }
}

// sparks and smoke for a while (shorted electronics)
function smoulder(me, dur) {
  const w = me.world;
  w.emit(me.x, me.y, dur, (e, dt) => {
    if (me.dead) return;
    if (chance(0.06)) w.particles.sparks(me.x + rand(-4, 4), me.y + rand(-4, 4), rand(0, TAU), 1, 3, 160, '#bff');
    w.smoke?.burn(me.x, me.y, 'short', dt);
  });
}

// Gas inside (bottle, stove): whatever holes it lights a jet at the hole and a fuse (systems/Gas.js) and does
// no other damage; a blow only knocks a bottle about. Returns the damage left to apply.
export function gasHit(me, damage, kind, sx, sy, dirA) {
  const holed = PIERCING.has(kind);
  if (holed && !me.gasLeak) ignite(me, sx, sy, dirA);
  return holed || (me.def.explosive && kind !== 'blast') ? 0 : damage;
}

// Gives way: it cracks, sags, then falls apart into its own parts (staged over a few frames; blasts are faster).
// force: even what never gives (`lasting`): the wall it hung on is gone (systems/Destruction.js watchOpenings)
export function breakUp(me, dirA = rand(0, TAU), power = 1, force = false) {
  if (me.dead || me.dying || (me.def.lasting && !force)) return;
  const d = me.def, w = me.world, fx = me.rec.fx;
  me.hp = Math.min(me.hp, 0);
  // explosives, leaking gas, and gas torn open by a blast
  if (d.explosive || me.gasLeak || (d.gas && power >= 2)) {
    const { x, y } = me.body.position;
    me.collapse(dirA, power);
    w.after(0.06, () => w.explode(x, y, { radius: d.blast ?? 92, source: me.type }));
    return;
  }
  if (d.fountain) { me.collapse(dirA, power); return; } // under pressure: it pops at once
  me.dying = true;
  const [t1, t2] = power >= 2 ? [0.015, 0.03] : DESTRUCTION.stageDelay;
  // 1. crack: lines through it, a crack of the material, lamps and screens pop
  const [sx, sy] = me.lastHit || [me.W / 2, me.H / 2];
  wear(me.ensureCanvas(), me.rec.material, sx, sy, 6, Math.max(me.W, me.H) * 0.5, me.W, me.H);
  me.recoil(dirA, power * 1.5);
  w.sound(fx.crush, me.x, me.y, 0.9);
  if (d.fixture || me.rec.electric) {
    w.light(me.x, me.y, 60, d.light?.color || '#bff6ff', 0.1);
    w.particles.sparks(me.x, me.y, 0, Math.PI, 14, 240, '#bff');
    if (d.glass) w.sound('glass', me.x, me.y, 0.6);
    me.lightsOut = true;
  }
  // 2. sag
  w.after(t1, () => {
    me.sag = rand(-0.04, 0.04); me.squash = 0.94;
    if (fx.dust) w.particles.dust(me.x, me.y, 4, Math.max(me.W, me.H) * 0.3, fx.dust, { speed: 15, size: 5 });
    if (fx.splinters || fx.float) w.sound('creak', me.x, me.y, 0.7);
  });
  // 3. fall apart
  w.after(t2, () => me.collapse(dirA, power));
}

// Falls apart into its own parts, cut along the recipe's seams. They do not all leave at once: the collapse runs
// through the object from the blow to its far end (Fracture.crumble), each part staying in place (draw) until its
// turn (shed). A blast, a lamp or anything overhead goes in one go. What it held spills with the first part.
export function collapse(me, dirA, power) {
  if (me.dead || me.parts) return;
  const d = me.def, w = me.world, rec = me.rec, fx = rec.fx, P = w.particles;
  const { x, y } = me.centre();
  const ang = me.body.angle, ca = Math.cos(ang), sa = Math.sin(ang);
  w.removeBody(me.body);
  if (d.fountain) {
    me.dead = true;
    me.burst(x, y, dirA);
    w.events.emit('propDestroyed', { prop: me, x, y, dirA, power });
    return;
  }
  me.dying = true;
  me.sag = 0;
  // cut the (damaged) sprite along the recipe's seams
  const work = canvas(me.W, me.H, me.img.k);
  put(work.getContext('2d'), me.look);
  const pieces = [];
  // (whole pieces painted as such, where they were in it: what is left is cut as usual)
  for (const [name, x0, x1, fly = 1] of rec.pieces || []) {
    const img = spriteOpt(`props/${name}`);
    work.getContext('2d').clearRect(x0 * me.W, 0, (x1 - x0) * me.W, me.H);
    if (img) pieces.push({ img, cx: ((x0 + x1) / 2) * me.W, cy: me.H / 2, name, fly });
  }
  for (const g of [...rec.parts, { cut: 'grid', cols: 2, rows: 2 }]) {
    for (const c of cutPolys(g, me.W, me.H, Math.random, me.lastHit)) {
      const pc = cutPiece(work, c.poly, { min: 8, wreck: true });
      if (pc) pieces.push({ ...pc, name: c.name, fly: c.fly ?? 1 });
    }
  }
  pieces.sort((p, q) => sw(q.img) * sh(q.img) - sw(p.img) * sh(p.img));
  // heavy furniture gives way where it stands: its big parts slump and slide a little, the crumbs are only chips.
  // Only a blast throws it around.
  const heavy = power < 2 && me.W * me.H > DESTRUCTION.heavyArea;
  if (heavy) pieces.length = Math.min(pieces.length, DESTRUCTION.heavyParts);
  let physical = d.static ? Math.min(DESTRUCTION.maxPhysicalParts, 3) : DESTRUCTION.maxPhysicalParts;
  for (const pc of pieces) pc.physical = sw(pc.img) * sh(pc.img) > 50 && physical-- > 0;
  // parts the top view hid (table legs)
  if (rec.legs) {
    const s = Math.max(2, rec.legs.size * PX_PER_M), n = rec.legs.n;
    for (let i = 0; i < n; i++) {
      const lx = n === 1 ? 0 : (i % 2 ? 0.4 : -0.4) * me.W, ly = n <= 2 ? 0 : (i < 2 ? -0.4 : 0.4) * me.H;
      const img = chunk(rec.legs.color, Math.round(s), Math.round(Math.max(s, rec.height * PX_PER_M * 0.5)));
      pieces.push({ img, cx: me.W / 2 + lx, cy: me.H / 2 + ly, fly: 1, leg: true });
    }
  }
  const grounded = !d.fixture && !d.overhead && !d.hung;
  const wave = crumble(pieces, me.lastHit || [me.W / 2, me.H / 2], grounded && power < 2 && !d.explosive ? DESTRUCTION.crumble : 0);
  pieces.forEach((pc, i) => { pc.t = wave[i]; });
  const z0 = me.lift();
  me.parts = pieces;
  me.fall = { x, y, ca, sa, dirA, power, heavy, z0, t: 0, harm: power >= 1.5 ? { kind: 'blunt', knock: 3.5, lethal: 8.5 } : null };
  if (rec.spill === 'soil') w.decals.bake(soilSpill(me.W, me.H), x, y, ang);
  else if (grounded) w.decals.bake(remains(me.W, me.H, d.chips), x, y, ang);
  if (rec.stump === 'duct') w.decals.bake(ductStump(Math.round(Math.min(me.W, me.H) * 0.8)), x, y, ang);
  if (me.doors) me.dropDoors(x, y, dirA);
  me.shed(0);
  me.empty(x, y, dirA, power, z0);
  const R = Math.max(me.W, me.H) * 0.4;
  if (rec.powder) P.dust(x, y, 26, R, rec.powder, { speed: 60 * power, size: 9, life: 4.5, alpha: 0.4 });
  // dust that hangs, then settles
  P.dust(x, y, Math.round(4 + R / 3), R, fx.dust || '#5a5462', { speed: 25 * power, size: 5, life: 3.5, alpha: fx.dust ? 0.2 : 0.14 });
  P.chips(x, y, dirA, Math.PI, heavy ? 8 : 14, d.chips, heavy ? 90 : 160);
  if (fx.glass || d.glass) { P.glass(x, y, dirA, 1.5, 18); w.sound('glass', x, y, 0.6); }
  if (rec.electric) { P.sparks(x, y, 0, Math.PI, 16, 260, '#bff'); w.smoke?.burst('short', x, y, 2); }
  // a motor dying: a black puff that rolls out of it and hangs
  if (rec.puff) w.smoke?.burst('motor', x, y, rec.puff);
  if (rec.live) me.liveWires(x, y, rec.live);
  if (rec.gush) me.gush(x, y, rec.gush);
  if (d.dirt || rec.contents.some((c) => c.bit === 'soil')) P.chips(x, y, 0, Math.PI, 18, '#4a2e1a', 120);
  if (d.water || rec.leak?.on === 'break') {
    P.drops(x, y, 0, Math.PI, 18, rec.leak?.color || 'rgba(110,160,200,0.16)', 140, 6, rec.leak?.kind !== 'water');
    // what stands as a puddle keeps running out of it a while; the rest (a fridge's cartons) only splashes
    if (rec.leak?.on === 'break' && rec.leak.kind) me.leak(me.W / 2, me.H / 2, dirA);
  }
  if (rec.leak?.flood) me.flood(x, y, rec.leak.flood);
  w.events.emit('propDestroyed', { prop: me, x, y, dirA, power });
  if (d.explosive) return;
  w.sound(fx.crush, x, y);
  // the heavy thud of the remains hitting the floor
  if (me.W * me.H > 300) w.after(0.18, () => w.sound('bodyFall', x, y, 0.6));
  w.shake(0.08 + Math.min(0.15, (me.W * me.H) / 8000));
}

// the collapse goes on: the parts whose turn has come let go; once the last one has, the object is gone
export function shed(me, dt) {
  const f = me.fall;
  f.t += dt;
  me.parts = me.parts.filter((pc) => pc.t > f.t || me.release(pc));
  if (me.parts.length) return;
  me.parts = null;
  me.dying = false;
  me.dead = true;
}

// one part comes loose where it was: big furniture slumps, the rest is thrown along the blow; crumbs at the tear
export function release(me, pc) {
  const f = me.fall, lx = pc.cx - me.W / 2, ly = pc.cy - me.H / 2;
  const ox = lx * f.ca - ly * f.sa, oy = lx * f.sa + ly * f.ca;
  const L = launch(f.dirA, ox, oy, f.power, pc.fly), calm = f.heavy ? 0.3 : 1;
  if (pc.leg) me.throwPiece(pc.img, f.x + ox, f.y + oy, L.a, L.v * 0.7 * calm, { z: f.z0 * 0.4, vz: L.vz * 0.6, spin: L.spin });
  else {
    me.throwPiece(pc.img, f.x + ox, f.y + oy, L.a, L.v * calm, {
      z: f.z0 * rand(0.6, 1), vz: me.rec.drop || f.heavy ? rand(-10, 20) : L.vz, spin: L.spin * calm,
      physical: pc.physical, harm: f.harm && { ...f.harm },
    });
    if (pc.t > 0) me.world.particles.chips(f.x + ox, f.y + oy, L.a, 1.4, 2, me.def.chips, 80);
  }
}

// A hydrant gives way in one piece: the main blows the whole body off its flange, straight up (toward the camera,
// see Particles HIGH), and it comes down a few metres away while the water keeps gushing out of the stump:
// a white column, its crown falling back as rain all around, mist. The flood is systems/Liquids.js.
export function burst(me, x, y, dirA) {
  const w = me.world, P = w.particles, dur = LIQUIDS.hydrant.dur;
  w.decals.bake(stump(Math.max(me.W, me.H)), x, y, me.body.angle);
  P.shard(me.look, x, y, dirA + rand(-0.6, 0.6), rand(30, 60), {
    high: true, z: 8, vz: rand(400, 450), rot: me.body.angle, spin: rand(4, 8) * pick([-1, 1]), drag: 0.4,
    onLand: (p) => me.thump(p),
  });
  // the first slug of water, the paint and rust it tears off
  P.jet(x, y, 50, { vz: 470, speed: 50, size: 3.4, alpha: 0.95 });
  P.jet(x, y, 40, { vz: 260, speed: 210, size: 2.2, alpha: 0.7 });
  P.chips(x, y, 0, Math.PI, 16, me.def.chips, 220);
  P.sparks(x, y, 0, Math.PI, 8, 260);
  w.rings.push({ x, y, r: 3, max: 40, t: 0, dur: 0.3 });
  w.light(x, y, 70, '#cfe6ff', 0.15);
  w.shake(0.35);
  w.sound(me.rec.fx.crush, x, y);
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
export function thump(me, p) {
  const w = me.world;
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
