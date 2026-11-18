// The doors' part of a step (entities/Door.js is the leaf; numbers in data/doors.js):
//  - prePush (after the intentions, before the physics): a man walking into a leaf leans on it with a limited force
//    (Door.pushed, engine/physics/Hinge.js pushLeaf) and is held to the speed it really goes, as with furniture
//    (systems/PropPhysics.js): a heavy leaf takes a moment, a run bursts it open harder. A slide, a vault, a man
//    knocked flying are left to the physics (they are blows, not pushes);
//  - a doorbell (level `buzzers`, the lab): E rings it, the man posted inside comes to the locked door, turns his key
//    in it (the lamp amber, then green: Door.unlatch) and goes back to his post.
// DOM-free.
import { PLAYER, TILE } from '../Config.js';
import { DOORS } from '../data/doors.js';
import { contactOf } from '../../engine/physics/Push.js';
import { clamp } from '../../engine/math.js';
import { walking } from './PropPhysics.js';

const { Body } = Matter;

export default class Doors {
  constructor(world) {
    this.world = world;
    // the doorbells: { at: [col, row], door: [col, row] of a tile of the door, guard: [col, row] of his post }
    this.buzzers = [];
    for (const b of world.level?.buzzers || []) {
      const door = world.doors.find((d) => d.cells.includes(b.door[1] * world.map.w + b.door[0]));
      const guard = world.enemies?.find((e) => Math.floor(e.home.x / TILE) === b.guard[0] && Math.floor(e.home.y / TILE) === b.guard[1]);
      if (!door || !guard) continue;
      const bz = { x: b.at[0] * TILE, y: b.at[1] * TILE, door, guard, call: null };
      this.buzzers.push(bz);
      world.uses?.add({ x: bz.x, y: bz.y, label: 'RING', ok: () => door.locked && !bz.call && guard.alive && !(guard.knocked > 0), use: () => this.ring(bz) });
    }
  }

  // rung: he comes to the door, inside it
  ring(bz) {
    const d = bz.door, side = d.sideOf(bz.guard.home.x, bz.guard.home.y), m = d.mid();
    const n = { x: -Math.sin(d.a0) * side, y: Math.cos(d.a0) * side };
    bz.call = { to: { x: m.x + n.x * DOORS.buzzer.stand, y: m.y + n.y * DOORS.buzzer.stand }, t: 0, phase: 'go' };
    bz.guard.bolt = bz.call.to;
    this.world.sound('lockBeep', bz.x, bz.y, 0.8);
  }

  // the man rung for: at the door he turns his key, waits a moment, goes back to his post
  answer(bz, dt) {
    const c = bz.call, g = bz.guard;
    if (!g.alive || g.knocked > 0) { g.bolt = null; bz.call = null; return; }
    const at = (p, r) => Math.hypot(p.x - g.x, p.y - g.y) < r;
    if (c.phase === 'go' && at(c.to, 8)) {
      g.bolt = null;
      if (bz.door.locked) { bz.door.unlatch(); g.turnKey?.(bz.door); }
      c.phase = 'open';
    } else if (c.phase === 'open' && (c.t += dt) >= DOORS.buzzer.wait) {
      c.phase = 'back';
      g.bolt = { x: g.home.x, y: g.home.y };
    } else if (c.phase === 'back' && at(g.home, 6)) {
      g.bolt = null;
      bz.call = null;
    }
  }

  prePush(dt) {
    for (const bz of this.buzzers) if (bz.call) this.answer(bz, dt);
    const w = this.world, P = DOORS.push, doors = w.doors;
    if (!doors.length) return;
    for (const c of w.chars) {
      if (!walking(c)) continue;
      const b = c.body, v = Body.getVelocity(b), sp = Math.hypot(v.x, v.y);
      if (sp < 0.05) continue;
      // where he will be at the end of this step, and the leaves he runs into there
      const x = b.position.x + v.x, y = b.position.y + v.y, r = c.radius ?? PLAYER.radius;
      const force = P.walk + (P.run - P.walk) * clamp(sp / PLAYER.speed, 0, 1);
      let held = false;
      for (const d of doors) {
        if (d.locked) continue;
        const far = d.len + d.back + r + 2;
        if ((x - d.hx) ** 2 + (y - d.hy) ** 2 > far * far) continue;
        const k = contactOf(x, y, r, d.body);
        if (!k) continue;
        const vn = v.x * k.nx + v.y * k.ny;
        if (vn <= 0) continue;
        if (c.isPlayer) d.pushedByPlayer = 0.8;
        const keep = d.pushed(k, vn, force, dt);
        if (keep >= vn) continue;
        v.x += k.nx * (keep - vn); v.y += k.ny * (keep - vn);
        if (c.vel) { c.vel.x += k.nx * (keep - vn); c.vel.y += k.ny * (keep - vn); }
        held = true;
      }
      if (held) Body.setVelocity(b, v);
    }
  }
}
