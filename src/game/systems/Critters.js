// Street fauna (level `critters`: { pigeons: [[col, row, n]], cats: [[col, row]] }; the rest needs no data).
//   rats     nest under every dumpster: a blow or a shot on it sends a few running, jinking along the walls to a hole;
//            they make passers-by jump
//   pigeons  peck about in flocks, all up at a shot, at anyone running at them, at the cat
//   cat      sits watching the player; bolts when he moves close or at a shot, over a bin on its way (a noise guards
//            may come and look at)
//   flies    hang over dumpsters and bodies gone cold; moths round the street lamps and signs (anchors only: the
//            insects themselves are drawn from the clock, render/CritterArt.js)
// Bullets, swings and blasts kill the ones on the ground. No bodies: a few numbers each. DOM-free.
import { TILE, CRITTERS as C } from '../Config.js';
import { rand, randi, chance, angDiff, TAU } from '../../engine/math.js';

const { Body } = Matter;
const SHUT = 'GDLF'; // windows, doors and fences stop them like walls

export default class Critters {
  constructor(world, def = {}) {
    this.world = world;
    this.list = [];                 // rats, pigeons and cats: { kind, x, y, a, state: idle | run | fly | dead, ... }
    this.nests = new Map();         // dumpster -> rats still under it
    this.startled = new WeakSet();  // passers-by a rat already made jump
    this.senseT = 0;
    for (const [col, row, n] of def.pigeons || []) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = rand(0.1, 0.7) * TILE, x = col * TILE + Math.cos(a) * d, y = row * TILE + Math.sin(a) * d;
        this.add('pigeon', x, y, rand(0, TAU), { hx: col * TILE, hy: row * TILE, tx: x, ty: y, t: rand(0.3, 3), z: 0, wait: 0 });
      }
    }
    for (const [col, row] of def.cats || []) this.add('cat', col * TILE, row * TILE, Math.PI / 2);
    const ev = world.events;
    ev.on('propHit', (e) => { if (e.prop.type === 'dumpster') this.flush(e.prop, e.x, e.y, randi(...C.rat.out)); });
    ev.on('propDestroyed', (e) => { if (e.prop.type === 'dumpster') this.flush(e.prop, e.x, e.y, Infinity); });
    ev.on('noise', (e) => {
      if (e.type === 'gunshot' || e.type === 'explosion') this.scare(e.x, e.y, Math.min(e.radius, C.pigeon.hear * TILE), Math.min(e.radius, C.cat.hear * TILE));
    });
    ev.on('explosion', (e) => this.blast(e.x, e.y, e.radius));
  }

  add(kind, x, y, a, more = {}) {
    const c = { kind, x, y, a, state: 'idle', ph: rand(0, TAU), ...more };
    this.list.push(c);
    return c;
  }

  // rats out from under a dumpster struck at (hx, hy)
  flush(prop, hx, hy, n) {
    const left = this.nests.get(prop) ?? randi(...C.rat.nest);
    n = Math.min(n, left);
    this.nests.set(prop, left - n);
    const b = prop.body.bounds;
    for (let i = 0; i < n; i++) {
      const x = rand(b.min.x, b.max.x), y = rand(b.min.y, b.max.y);
      this.add('rat', x, y, Math.atan2(y - hy, x - hx) + rand(-0.8, 0.8),
        { state: 'run', speed: rand(...C.rat.speed), life: rand(...C.rat.life), turn: 0, wait: 0.05 + i * rand(0.04, 0.16) });
    }
  }

  // a fright at (x, y): the pigeons within `birds` px go up one after the other, the cat within `cats` px bolts
  scare(x, y, birds, cats = 0) {
    let first = null;
    for (const c of this.list) {
      if (c.state !== 'idle') continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (c.kind === 'cat' && d < cats) this.bolt(c, x, y);
      if (c.kind !== 'pigeon' || c.wait > 0 || d > birds) continue;
      c.wait = rand(0.02, 0.35);
      c.from = Math.atan2(c.y - y, c.x - x);
      first = first || c;
    }
    if (first) this.world.sound('flutter', first.x, first.y, 0.8);
  }

  // off the cat goes, away from (x, y), by way of a bin if one stands on its way
  bolt(c, x, y) {
    const w = this.world;
    c.state = 'run';
    c.life = rand(...C.cat.life);
    c.turn = 0.3;
    c.a = Math.atan2(c.y - y, c.x - x);
    c.bin = null;
    let best = C.cat.bin * TILE;
    for (const b of w.props) {
      if (b.type !== 'trash_can' || b.dead) continue;
      const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy);
      // not one that lies back towards the fright
      if (d < best && dx * Math.cos(c.a) + dy * Math.sin(c.a) > -0.3 * d && w.lineOfSight(c.x, c.y, b.x, b.y)) { c.bin = b; best = d; }
    }
    c.binT = 1.5; // s to get there
  }

  blast(x, y, radius) {
    for (const c of this.list) {
      if (c.state !== 'dead' && c.state !== 'fly' && Math.hypot(c.x - x, c.y - y) < radius) this.kill(c, Math.atan2(c.y - y, c.x - x));
    }
    this.scare(x, y, C.pigeon.hear * TILE, C.cat.hear * TILE);
  }

  kill(c, a) {
    const w = this.world, small = c.kind === 'rat';
    c.state = 'dead';
    c.a = a + rand(-0.7, 0.7);
    w.particles.blood(c.x, c.y, a, 0.9, small ? 4 : 7, 110);
    w.decals.stampBlood(c.x, c.y, small ? 1.5 : 2.5);
    if (c.kind === 'pigeon') {
      w.particles.chips(c.x, c.y, a, 2.5, 8, '#c8ccd4', 80); // feathers
      this.scare(c.x, c.y, C.pigeon.flock * TILE);
    }
    // only so many left lying
    const dead = this.list.filter((o) => o.state === 'dead');
    if (dead.length > C.dead) dead[0].gone = true;
  }

  wall(x, y) {
    const m = this.world.map, cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    return m.isSolid(cx, cy) || SHUT.includes(m.at(cx, cy));
  }

  // run on along its heading, jinking, turning along the walls; true when one is right ahead
  scurry(c, dt, speed, jink) {
    if ((c.turn -= dt) <= 0) { c.turn = rand(0.12, 0.45); c.a += rand(-jink, jink); }
    const look = 9, ahead = (a) => this.wall(c.x + Math.cos(a) * look, c.y + Math.sin(a) * look);
    const hit = ahead(c.a);
    if (hit) {
      const side = chance(0.5) ? 1 : -1;
      for (const k of [side, -side, 2]) {
        if (!ahead(c.a + k * Math.PI / 2)) { c.a += k * Math.PI / 2; break; }
      }
    }
    const nx = c.x + Math.cos(c.a) * speed * dt, ny = c.y + Math.sin(c.a) * speed * dt;
    if (!this.wall(nx, ny)) { c.x = nx; c.y = ny; }
    return hit;
  }

  rat(c, dt) {
    if ((c.wait -= dt) > 0) return;
    c.life -= dt;
    const p = this.world.player;
    if (p.alive && Math.hypot(p.x - c.x, p.y - c.y) < C.rat.fear * TILE) {
      c.a += angDiff(c.a, Math.atan2(c.y - p.y, c.x - p.x)) * Math.min(1, dt * 6);
    }
    const atWall = this.scurry(c, dt, c.speed, 0.7);
    if ((c.life <= 0 && atWall) || c.life < -4) c.gone = true; // a hole in a wall, sooner or later
  }

  cat(c, dt) {
    const w = this.world, p = w.player;
    if (c.state === 'idle') {
      if (!p.alive) return;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < 7 * TILE) c.a += angDiff(c.a, Math.atan2(p.y - c.y, p.x - c.x)) * Math.min(1, dt * 4); // it watches him
      if (d < C.cat.shy * TILE && Body.getSpeed(p.body) > C.cat.still) this.bolt(c, p.x, p.y);
      return;
    }
    c.life -= dt;
    const b = c.bin;
    if (b) {
      const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy);
      if (b.dead || (c.binT -= dt) <= 0) c.bin = null;
      else if (d > 13) {
        c.a = Math.atan2(dy, dx);
        c.x += (dx / d) * C.cat.speed * dt;
        c.y += (dy / d) * C.cat.speed * dt;
        return;
      } else {
        // over it goes
        b.kick.x = Math.cos(c.a) * 3; b.kick.y = Math.sin(c.a) * 3; b.kick.vr = rand(-3, 3);
        w.sound('metal', b.x, b.y, 0.9);
        w.particles.chips(b.x, b.y, c.a, 1.4, 7, '#b8b0a0', 70);
        w.noise(b.x, b.y, C.cat.noise * TILE);
        c.bin = null;
        c.a += rand(0.5, 0.9) * (chance(0.5) ? 1 : -1);
      }
    }
    const atWall = this.scurry(c, dt, C.cat.speed, 0.25);
    if ((c.life <= 0 && atWall) || c.life < -4) c.gone = true;
  }

  pigeon(c, dt) {
    const P = C.pigeon;
    if (c.state === 'fly') {
      c.t += dt;
      c.z = Math.min(1, c.z + dt / P.climb);
      const v = P.fly * (0.35 + 0.65 * c.z) * c.pace, m = this.world.map;
      c.a += c.bank * dt;
      c.x += Math.cos(c.a) * v * dt;
      c.y += Math.sin(c.a) * v * dt;
      if (c.t > P.away || c.x < -40 || c.y < -40 || c.x > m.widthPx + 40 || c.y > m.heightPx + 40) c.gone = true;
      return;
    }
    if (c.wait > 0) {
      if ((c.wait -= dt) > 0) return;
      c.state = 'fly';
      c.t = 0;
      c.a = c.from + rand(-0.6, 0.6);
      c.bank = rand(-0.5, 0.5);
      c.pace = rand(0.85, 1.15);
      return;
    }
    // pecking about: a few steps now and then
    if ((c.t -= dt) <= 0) {
      c.t = rand(0.8, 3);
      const a = rand(0, TAU), d = rand(0, 0.6) * TILE;
      c.tx = c.hx + Math.cos(a) * d;
      c.ty = c.hy + Math.sin(a) * d;
      if (this.wall(c.tx, c.ty)) { c.tx = c.x; c.ty = c.y; }
    }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    c.walking = d > 1;
    if (c.walking) {
      c.a = Math.atan2(dy, dx);
      c.x += (dx / d) * P.walk * dt;
      c.y += (dy / d) * P.walk * dt;
    }
  }

  // bullets passing, the player's swing
  hits(dt) {
    const w = this.world, p = w.player;
    for (const c of this.list) {
      if (c.state === 'dead' || c.state === 'fly' || (c.kind === 'rat' && c.wait > 0)) continue;
      for (const b of w.projectiles) {
        if (b.dead || segDist(c.x, c.y, b.x - b.vx * dt, b.y - b.vy * dt, b.x, b.y) > C.hit) continue;
        this.kill(c, Math.atan2(b.vy, b.vx));
        break;
      }
      if (c.state === 'dead' || !p.alive || !(p.swing > 0)) continue;
      const dx = c.x - p.x, dy = c.y - p.y;
      if (Math.hypot(dx, dy) < C.reach && Math.abs(angDiff(p.angle, Math.atan2(dy, dx))) < 1) this.kill(c, p.angle);
    }
  }

  // who frightens whom, ten times a second
  sense() {
    const w = this.world, P = C.pigeon;
    const movers = [w.player, ...w.enemies, ...w.civilians].filter((m) => m.alive);
    const cats = this.list.filter((c) => c.kind === 'cat' && c.state === 'run');
    for (const c of this.list) {
      if (c.kind === 'pigeon' && c.state === 'idle' && !(c.wait > 0)) {
        // someone on top of them, someone running at them, the cat
        const m = movers.find((o) => {
          const d = Math.hypot(o.x - c.x, o.y - c.y);
          return d < P.near * TILE || (d < P.shy * TILE && o === w.player) || (d < P.run * TILE && Body.getSpeed(o.body) > P.fast);
        }) || cats.find((o) => Math.hypot(o.x - c.x, o.y - c.y) < P.run * TILE);
        if (m) this.scare(m.x, m.y, Math.hypot(m.x - c.x, m.y - c.y) + P.flock * TILE);
      } else if (c.kind === 'rat' && c.state === 'run') {
        for (const civ of w.civilians) {
          if (!civ.alive || this.startled.has(civ) || civ.brain.panicked || Math.hypot(civ.x - c.x, civ.y - c.y) > C.rat.scare * TILE) continue;
          this.startled.add(civ);
          civ.brain.hurry(3);
          civ.brain.bark = 'scream';
        }
      }
    }
  }

  update(dt) {
    for (const c of this.list) if (c.state !== 'dead') this[c.kind](c, dt);
    this.hits(dt);
    if ((this.senseT -= dt) <= 0) { this.senseT = 0.1; this.sense(); }
    if (this.list.some((c) => c.gone)) this.list = this.list.filter((c) => !c.gone);
  }

  // where the flies hang: [{ x, y, r, n, seed }] over the dumpsters still standing and a few bodies gone cold
  swarms() {
    const w = this.world, F = C.flies, out = [];
    this.bins ??= w.props.filter((p) => p.type === 'dumpster');
    for (const p of this.bins) if (!p.dead) out.push({ x: p.x, y: p.y, r: F.wide, n: F.dumpster, seed: p.x * 7 + p.y * 13 });
    let n = 0;
    for (const b of w.corpses) {
      if (b.age < F.cold) continue;
      out.push({ x: b.x, y: b.y, r: F.close, n: F.body, seed: n * 31 });
      if (++n >= F.bodies) break;
    }
    return out;
  }

  // where the moths turn: [{ x, y, n, seed }] at the street lamps and signs still lit
  lamps() {
    const M = C.moths;
    this.lit ??= this.world.props.filter((p) => p.type in M.at);
    return this.lit.filter((p) => !p.dead).map((p) => {
      const off = M.at[p.type], a = p.body.angle;
      return { x: p.x + Math.cos(a) * off, y: p.y + Math.sin(a) * off, n: M.n, seed: p.x * 7 + p.y * 13 };
    });
  }
}

// distance from (px, py) to the segment (x0, y0)-(x1, y1)
function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const k = l2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)) : 0;
  return Math.hypot(px - x0 - dx * k, py - y0 - dy * k);
}
