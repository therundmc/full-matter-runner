// Blasts: kill/knock characters, break things, crush walls and push every loose body with momentum shared
// out by mass (a chair flies, a car barely rocks). Everything is scaled by occlusion(): walls stop the blast,
// doors / heavy furniture / glass soak part of it.
import { TILE } from '../Config.js';
import { rand, chance, TAU } from '../../engine/math.js';
import { impulse, kgOf } from '../../engine/physics/Body.js';
import { damageWall, destroyWall, destroyWindow, detachDoor, destroyFence } from './Destruction.js';
import { occlusion } from './Ballistics.js';

const { Body } = Matter;

// What a blast looks like: a torn shock front and the dust it lifts, a fireball in a few lobes (never one disc)
// that cools from its rim inward, burning scraps thrown in arcs that go on burning where they fall, flames dying on
// the ground, and a ragged burn. Its black smoke is the air's (systems/Smoke.js, on 'explosion'), and so is what
// rises off the small fires it leaves.
function fireball(world, x, y, R) {
  const P = world.particles;
  world.rings.push({ x, y, r: 6, max: R * 1.7, t: 0, dur: 0.35, blast: true });
  P.fire(x, y, 46, R * 2.5, { size: [5, 13], life: [0.3, 0.75], heat: 0, rise: 24 });
  for (let i = 0, a0 = rand(0, TAU); i < 3; i++) {
    const a = a0 + (i * TAU) / 3 + rand(-0.5, 0.5), d = R * rand(0.2, 0.38);
    P.fire(x + Math.cos(a) * d, y + Math.sin(a) * d, 12, R * rand(1.2, 1.9), { size: [4, 10], life: [0.3, 0.7], heat: 0, rise: 24 });
  }
  P.fire(x, y, 22, R * 4.2, { size: [2, 5], life: [0.15, 0.4], heat: 0 }); // tongues thrown past it
  P.sparks(x, y, 0, Math.PI, 60, 620);
  P.embers(x, y, 40, 260);
  P.chips(x, y, 0, Math.PI, 30, '#2a2020', 260);
  for (let i = 0; i < 18; i++) {
    const a = rand(0, TAU), c = Math.cos(a), s = Math.sin(a), v = rand(110, 230);
    P.dust(x + c * R * 0.4, y + s * R * 0.4, 1, 4, 'rgb(150,135,120)', { vx: c * v, vy: s * v, size: 6, life: 1.6, alpha: 0.2 });
  }
  // a small fire on the floor: flames licking up from one spot, dying down over dur seconds
  const burn = (bx, by, dur) => world.emit(bx, by, dur, (e, dt) => {
    const k = e.t / dur;
    if (chance(0.35 + 0.5 * k)) P.fire(bx + rand(-2.5, 2.5), by + rand(-2, 2), 1, 10, { size: [2, 3 + 3 * k], life: [0.2, 0.5], rise: 50 });
    world.smoke?.burn(bx, by, 'spot', dt);
  });
  for (let i = 0; i < 6; i++) {
    const a = rand(0, TAU), d = R * 0.5 * Math.sqrt(Math.random());
    burn(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(0.9, 2.4));
  }
  P.cinders(x, y, 8, 250, (cx, cy) => burn(cx, cy, rand(0.8, 2.2)));
  world.after(0.3, () => world.sound('crackle', x, y, 0.6));
  world.decals.scorch(x, y, R * 0.75);
}

// origin: the entity that blew up (ignored as an obstacle: a car's blast starts inside its own body)
export function explode(world, x, y, { radius = 90, source = null, origin = null } = {}) {
  const R = radius;
  const occ = (x1, y1, target) => occlusion(world, x, y, x1, y1, target, origin);
  world.events.emit('explosion', { x, y, radius: R, source });
  world.sound('explosion', x, y);
  world.shake(1.0);
  world.hitstop(0.07);
  world.game.flash('#fff2d0', 0.55);
  world.light(x, y, R * 2.8, '#ffa040', 0.45);
  fireball(world, x, y, R);
  world.noise(x, y, 1100, null, 'explosion');

  for (const c of world.chars) {
    if (!c.alive) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d > R * 1.5) continue;
    const f = occ(c.x, c.y, c);
    const a = Math.atan2(c.y - y, c.x - x);
    // effective distance grows when the blast has to go through something
    const de = f > 0 ? d / f : Infinity;
    if (de < R) c.kill(a, 'explosion', world.player);
    else if (de < R * 1.5 && c.isEnemy && !c.knocked) c.knock(a, 'blast');
  }
  for (const p of world.props) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    // what hangs from the ceiling swings well beyond the reach of the damage
    if (p.def.hung && d < R * 3.5) p.recoil(Math.atan2(p.y - y, p.x - x), 2.2 * (1 - d / (R * 3.5)));
    if (d > R * 2) continue;
    const f = occ(p.x, p.y, p);
    if (f <= 0) continue;
    const de = d / f;
    if (p.onBlast) { p.onBlast(de, R, Math.atan2(p.y - y, p.x - x)); continue; }
    const a = Math.atan2(p.y - y, p.x - x);
    // the closer, the more violently it is thrown apart
    if (de < R * (p.def.static ? 0.55 : 0.85)) p.break(a, 2 + (1 - de / R) * 1.5);
    else if (p.hit) {
      // survived the blast: the side facing it is scorched and shredded (Prop.hit finds that side), or just peppered
      if (de < R) for (let k = 0; k < 3; k++) p.hit(1, p.x + rand(-4, 4), p.y + rand(-4, 4), a + rand(-0.3, 0.3), 1.4, 'blast');
      else if (de < R * 1.6) p.hit(0.5, p.x + rand(-4, 4), p.y + rand(-4, 4), a + rand(-0.4, 0.4), 0.8, 'shrapnel');
    }
  }
  // windows: torn out of the wall near the blast, further away the glass goes and the frame is battered
  for (const g of [...world.windows]) {
    const d = Math.hypot(g.x - x, g.y - y), f = d < R * 1.4 ? occ(g.x, g.y, g) : 0;
    if (f <= 0 || d / f > R * 1.4) continue;
    const a = Math.atan2(g.y - y, g.x - x), de = d / f;
    if (de < R * 0.6) { destroyWindow(world, g, a, 1.6 * f); continue; }
    g.shatter(a, null, 1.6 * f);
    if (de < R * 1.05) g.damageFrame(Math.ceil(5 * (1 - de / (R * 1.05))), a, 1.3);
  }
  for (const door of [...world.doors]) {
    const b = door.body.position;
    const d = Math.hypot(b.x - x, b.y - y), f = d < R * 1.2 ? occ(b.x, b.y, door) : 0;
    const de = f > 0 ? d / f : Infinity;
    if (de < R * 1.2) detachDoor(world, door, Math.atan2(b.y - y, b.x - x), (1.5 * (1 - de / (R * 1.4)) + 0.6) * f);
  }
  for (const fe of world.fences) {
    if (fe.dead) continue;
    const d = Math.hypot(fe.x - x, fe.y - y);
    if (d < R && occ(fe.x, fe.y) > 0.3) destroyFence(world, fe, Math.atan2(fe.y - y, fe.x - x));
  }

  // walls: crushed near the blast, cracked further away (the only thing that brings a wall down)
  const rr = Math.ceil(R / TILE) + 1, ccx = Math.floor(x / TILE), ccy = Math.floor(y / TILE);
  for (let ty = ccy - rr; ty <= ccy + rr; ty++) {
    for (let tx = ccx - rr; tx <= ccx + rr; tx++) {
      if (!world.map.canBreak(tx, ty)) continue;
      const wx = (tx + 0.5) * TILE, wy = (ty + 0.5) * TILE;
      const d = Math.hypot(wx - x, wy - y);
      if (d > R * 1.05) continue;
      // only the wall faces the blast actually reaches (a wall shields the ones behind it)
      if (occ(wx, wy, { cx: tx, cy: ty }) <= 0) continue;
      const a = Math.atan2(wy - y, wx - x);
      if (d < R * 0.6) destroyWall(world, tx, ty, a, 1.6);
      else damageWall(world, tx, ty, Math.ceil(10 * (1 - d / (R * 1.05))), wx - Math.cos(a) * 14, wy - Math.sin(a) * 14, a, 1.3, true);
    }
  }

  // shockwave
  for (const b of world.physics.bodies()) {
    if ((b.isStatic && !b.frozen) || b.entity?.isPlayer || b.entity?.isEnemy) continue;
    const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy);
    if (d > R * 2.2 || d < 0.01) continue;
    const f = occ(b.position.x, b.position.y, b.entity);
    if (f <= 0) continue;
    const J = (1 - d / (R * 2.2)) * 140 * f;
    if (b.label === 'door') {
      const door = b.entity;
      const torque = ((b.position.x - door.hx) * dy - (b.position.y - door.hy) * dx) / (d * door.len);
      Body.setAngularVelocity(b, Body.getAngularVelocity(b) + (torque * J) / kgOf(b) * 0.15);
      continue;
    }
    const dv = impulse(b, Math.atan2(dy, dx), J, rand(-0.3, 0.3), 14);
    b.flyUntil = world.time + 0.1 + dv * 0.02;
    if (b.entity?.isItem) b.entity.thrower = null;
    if (b.entity?.isDebris && dv > 4 && !b.entity.harm) b.entity.harm = { kind: 'blunt', knock: 3.5, lethal: 9 };
  }
}
