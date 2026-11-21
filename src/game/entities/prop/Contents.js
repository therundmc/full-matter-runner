// What a prop holds and has (entities/Prop.js composes it): a screen that breaks, the bottles of a rack, what
// spills out of it or leaks, a table tipped over, its doors, its live wires. Functions of the prop (`me`).
import { DESTRUCTION, WALL_RIM } from '../../Config.js';
import { LIQUIDS } from '../../data/liquids.js';
import { BITS, FLOATS } from '../../data/destruction.js';
import { PX_PER_M } from '../../../engine/physics/Units.js';
import { chunk } from '../../../engine/Assets.js';
import { TAU, rand, chance, clamp, pick } from '../../../engine/math.js';
import { cracks, smashScreen, bitSprite, rackSlots, popSlot } from '../../render/DamageArt.js';
import Debris from '../Debris.js';
import { wallBehind, run } from '../../fx/Spatter.js';
// (a cycle, and a safe one: Prop is only used at call time, for the tipped-over table flip puts in its place)
import Prop from '../Prop.js';

export function hitScreen(me, sx, sy, dmg) {
  if (me.screenHp <= 0) return;
  const w = me.world, p = me.toWorld(sx, sy);
  me.screenHp -= dmg;
  cracks(me.canvas.getContext('2d'), sx, sy, 6, 6, 'rgba(225,245,255,0.8)');
  w.particles.glass(p.x, p.y, 0, Math.PI, 6, 70);
  if (me.screenHp > 0) return;
  // the tube caves in: flash, glass sucked in then thrown out, smoke, the glow dies
  const [a, b, c, d] = me.rec.screen;
  smashScreen(me.canvas, [a * me.W, b * me.H, c * me.W, d * me.H]);
  const q = me.toWorld(((a + c) / 2) * me.W, ((b + d) / 2) * me.H);
  w.light(q.x, q.y, 70, '#d8f0ff', 0.12);
  w.particles.glass(q.x, q.y, 0, Math.PI, 26, 150);
  w.particles.sparks(q.x, q.y, 0, Math.PI, 14, 260, '#bff');
  w.smoke?.burst('screen', q.x, q.y);
  w.sound('glass', q.x, q.y, 0.8);
  me.lightsOut = true;
}

// a thin post gives a little more at every blow, the way it was sent (its head is drawn that far off its foot)
export function lean(me, dirA, power) {
  const b = me.bend ||= { x: 0, y: 0 }, k = 2 * Math.min(power, 2), max = me.def.bends;
  b.x += Math.cos(dirA) * k;
  b.y += Math.sin(dirA) * k;
  const l = Math.hypot(b.x, b.y);
  if (l > max) { b.x *= max / l; b.y *= max / l; }
}

// something inside falls out of the hole (a book, a ball)
export function spillOnHit(me, px, py, dirA) {
  for (const c of me.rec.contents) {
    if (c.on !== 'hit' || me.spilled >= 6 || !chance(c.perHit ?? 1)) continue;
    me.spilled++;
    me.throwBits(BITS[c.bit], c, 1, px, py, dirA + Math.PI + rand(-0.8, 0.8), 0.8);
  }
}

// the bottles or glasses standing on it (rec.rack): found, or set out, the first time they are needed
export function bottles(me) {
  if (!me.rack) {
    me.ensureCanvas();
    me.rack = rackSlots(me.canvas, me.rec.rack, me.x * 7 + me.y * 13);
  }
  return me.rack;
}

// what a hit bursts on the rack: the bottles on a bullet's way (sprite points, entry to end of its channel), those
// under a blow, a whole stretch in a blast
export function burstRack(me, sx, sy, ex, ey, dirA, kind) {
  const shot = kind === 'bullet' || kind === 'rifle' || kind === 'pellet';
  const reach = shot ? 2.4 : kind === 'blast' ? 16 : 6;
  const most = kind === 'pellet' ? 1 : kind === 'bullet' ? 2 : kind === 'rifle' ? 3 : kind === 'blast' ? 8 : 4;
  const dx = ex - sx, dy = ey - sy, l2 = dx * dx + dy * dy;
  const off = (b) => { // from the middle of the bottle to the segment
    const qx = b.x + b.s / 2 - sx, qy = b.y + b.s / 2 - sy, t = l2 ? clamp((qx * dx + qy * dy) / l2, 0, 1) : 0;
    return Math.hypot(qx - dx * t, qy - dy * t);
  };
  me.rack.filter((b) => b.up).map((b) => [off(b), b]).filter(([d]) => d <= reach)
    .sort((p, q) => p[0] - q[0]).slice(0, most).forEach(([, b]) => popBottle(me, b, dirA + Math.PI));
}

// one bottle of the rack bursts where it stands: glass in its colour, a splash thrown back toward dirA, and what
// it held running off the front of the shelf to stand at the foot of it
function popBottle(me, b, dirA) {
  const w = me.world, P = w.particles, rack = me.rec.rack, smash = BITS[rack.bit].smash;
  const wet = LIQUIDS.kinds[smash.kind].splash;
  b.up = false;
  popSlot(me.canvas, me.img, b, wet);
  const p = me.toWorld(b.x + b.s / 2, b.y + b.s / 2), foot = me.toWorld(b.x + b.s / 2, me.H + 2);
  const front = me.body.angle + Math.PI / 2;
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
export function empty(me, x, y, dirA, power, z0 = me.lift()) {
  if (me.tipped) return; // what a knocked-over bin held spilled when it went over
  const rec = me.rec;
  let bits = DESTRUCTION.maxBits;
  for (const c of rec.contents) {
    if (c.on !== 'break') continue;
    // of a rack, only the bottles still standing are left to fall
    const n = Math.min(c.n, bits, c.bit === rec.rack?.bit && me.rack ? me.rack.filter((b) => b.up).length : c.n);
    bits -= n;
    me.throwBits(BITS[c.bit], c, n, x, y, dirA, Math.max(0.8, power * 0.8));
  }
  if (rec.floats) me.world.particles.floaters(x, y, FLOATS[rec.floats[0]], rec.floats[1], dirA, Math.PI, 70 * Math.min(power, 2), z0);
}

// Tipped over on its side, its top toward dirA (a guard making himself a shield): what stood on it goes flying and
// the upended table (def.flips) takes its place, as worn as this one was. Returns it, or null when this is not
// something one tips over (any more).
export function flip(me, dirA) {
  const d = me.def, w = me.world;
  if (!d.flips || me.dead || me.parts) return null;
  const { x, y } = me.centre();
  w.removeBody(me.body);
  me.dead = true;
  const p = new Prop(w, d.flips, x, y, dirA + Math.PI / 2);
  p.hp = Math.max(2, p.hp * me.hp / d.hp);
  // it lands on its edge and rocks
  p.kick.x = -Math.cos(dirA) * 7; p.kick.y = -Math.sin(dirA) * 7; p.kick.vr = rand(-2, 2);
  w.props.push(p);
  me.empty(x, y, dirA, 1);
  w.particles.dust(x, y, 6, me.W * 0.4, me.rec.fx.dust || '#5a5462', { speed: 30, size: 4, life: 2, alpha: 0.16 });
  w.sound('flip', x, y);
  w.events.emit('propFlipped', { prop: me, to: p, x, y, dirA });
  return p;
}

// loose bits: real-size little physical things (pool balls roll, records skid, books tumble, bottles smash)
export function throwBits(me, bit, c, n, x, y, dirA, power) {
  const w = me.world;
  const [mw, mh] = bit.size;
  const round = !!bit.round;
  for (let i = 0; i < n; i++) {
    const pw = Math.max(round ? 2.6 : 2, mw * PX_PER_M), ph = Math.max(2, mh * PX_PER_M);
    const color = pick(c.colors || bit.colors), img = bitSprite(c.bit, color, pw, round ? pw : ph);
    const a = dirA + rand(-1.2, 1.2), v = rand(40, 140) * power;
    const z = me.lift() * rand(0.5, 1), vz = rand(30, 110);
    const smash = bit.smash && chance(bit.smash.share) ? (qx, qy) => smashBit(me, bit.smash, color, qx, qy, a) : null;
    if (me.physicalOk()) {
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
function smashBit(me, smash, color, x, y, dirA) {
  const w = me.world, P = w.particles;
  P.glass(x, y, dirA, 1.5, Math.round(smash.glass * 0.6), 90);
  P.chips(x, y, dirA, 1.5, 4, color, 90);
  P.drops(x, y, dirA, 1.3, Math.round(smash.drops * 0.6), LIQUIDS.kinds[smash.kind].splash, 80, 3, false);
  w.events.emit('spill', { x, y, kind: smash.kind, area: smash.area * rand(0.6, 1.3) });
  w.sound('glassHit', x, y, 0.45, { pitch: rand(0.9, 1.25) });
}

// a jet of liquid out of a hole, weakening, and the puddle it makes at the foot of the object
export function leak(me, sx, sy, dirA) {
  if (me.leaks >= DESTRUCTION.maxLeaks) return;
  me.leaks++;
  // rate (px2/s): what a tank under pressure pours out of one hole (a keg floods the floor); jet: drops a step
  const w = me.world, { color = 'rgba(110,160,200,0.16)', dur = 3, kind, rate = LIQUIDS.leak, jet = 2 } = me.rec.leak || { kind: 'water' };
  const out = dirA + Math.PI + rand(-0.4, 0.4); // the jet comes back out of the hole
  let pos = me.toWorld(sx, sy);
  w.emit(pos.x, pos.y, dur, (e) => {
    if (!me.dead) pos = me.toWorld(sx, sy);
    const k = e.t / dur; // pressure falls
    w.particles.drops(pos.x, pos.y, out + rand(-0.1, 0.1), 0.15, k > 0.3 ? jet : 1, color, 40 + 120 * k * (jet > 2 ? 1.6 : 1), 5, kind !== 'water');
  });
  if (kind) w.events.emit('spill', { x: pos.x + Math.cos(out) * 14, y: pos.y + Math.sin(out) * 14, kind, area: rate * dur, dur, a: out });
  w.sound('soft', pos.x, pos.y, 0.4);
}

// the pipe it was plumbed to, torn open: water wells up from the floor for a few seconds and floods around it
export function flood(me, x, y, area) {
  const w = me.world, dur = 5;
  w.events.emit('spill', { x, y, kind: me.rec.leak.kind, area, dur });
  w.emit(x, y, dur, (e) => {
    const k = e.t / dur;
    if (chance(0.3 + 0.6 * k)) w.particles.jet(x, y, 1, { vz: 60 + 110 * k, speed: 26, size: 1.7, alpha: 0.7 });
  });
  w.sound('splash', x, y, 0.5, { pitch: rand(0.75, 0.9) });
}

// A tank giving way: what it held bursts out all around it at once, a ring of spray thrown wide that weakens, and
// stands in one big pool (systems/Liquids.js).
export function gush(me, x, y, area) {
  const w = me.world, P = w.particles, R = Math.max(me.W, me.H) / 2, dur = 1.8;
  const { color = 'rgba(110,160,200,0.16)', kind = 'water' } = me.rec.leak || {};
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

// the doors of a cabinet (rec.doors) spring open on their hinges and swing to where they hang
export function openDoors(me) {
  const n = me.rec.doors.n;
  me.doors = Array.from({ length: n }, () => ({ a: 0, v: rand(9, 14), rest: rand(1.2, 2.1) }));
  const p = me.toWorld(me.W / 2, me.H);
  me.world.particles.sparks(p.x, p.y, me.body.angle + Math.PI / 2, 0.9, 8, 200, '#bff');
  me.world.sound('metal', p.x, p.y, 0.5, { pitch: 1.3 });
}

// a blow sets the hanging doors swinging
export function swingDoors(me, power) { for (const d of me.doors) d.v += rand(-1, 1) * 6 * clamp(power, 0.3, 2); }

// the doors come off with the rest: thin steel plates thrown along the blow
export function dropDoors(me, x, y, dirA) {
  const len = me.W / me.doors.length;
  const img = chunk(me.def.chips, Math.max(2, Math.round(len)), 1);
  for (let i = me.doors.length; i > 0; i--) me.throwPiece(img, x + rand(-3, 3), y + rand(-3, 3), dirA + rand(-0.8, 0.8), rand(40, 90), { z: me.lift(), vz: rand(20, 60) });
  me.doors = null;
}

// the wires it was torn from spit sparks for a while where it hung (rec.live)
export function liveWires(me, x, y, dur) {
  const w = me.world;
  w.emit(x, y, dur, (e) => {
    if (!chance(0.05 + 0.1 * (e.t / dur))) return;
    w.particles.sparks(x + rand(-2, 2), y + rand(-2, 2), rand(0, TAU), 1.2, 4, 180, '#bff');
    if (chance(0.3)) w.light(x, y, 30, '#bff6ff', 0.05);
  });
}
