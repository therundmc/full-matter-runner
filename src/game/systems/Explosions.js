// Blasts: kill/knock characters in line of sight, break things, crush walls, and push every loose body
// with momentum shared out by mass (a chair flies, a car barely rocks).
import { TILE } from '../Config.js';
import { rand } from '../../engine/math.js';
import { impulse, kgOf } from '../../engine/physics/Body.js';
import { damageWall, destroyWall, detachDoor, destroyFence } from './Destruction.js';

const { Body } = Matter;

export function explode(world, x, y, { radius = 90, source = null } = {}) {
  const R = radius;
  world.events.emit('explosion', { x, y, radius: R, source });
  world.sound('explosion', x, y);
  world.shake(1.0);
  world.hitstop(0.07);
  world.game.flash('#fff2d0', 0.55);
  world.light(x, y, R * 2.8, '#ffa040', 0.45);
  world.rings.push({ x, y, r: 6, max: R * 1.7, t: 0, dur: 0.35 });
  const P = world.particles;
  P.fire(x, y, 80, R * 2.4);
  P.smoke(x, y, 45, 14, { dark: true, speed: 110, size: 14, life: 2.6 });
  P.sparks(x, y, 0, Math.PI, 60, 620);
  P.embers(x, y, 40, 260);
  P.chips(x, y, 0, Math.PI, 30, '#2a2020', 260);
  world.decals.scorch(x, y, R * 0.75);
  world.noise(x, y, 1100);

  for (const c of world.chars) {
    if (!c.alive) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d > R * 1.5 || world.map.raycast(x, y, c.x, c.y)) continue;
    const a = Math.atan2(c.y - y, c.x - x);
    if (d < R) c.kill(a, 'explosion', world.player);
    else if (c.isEnemy && !c.knocked) c.knock(a, 'blast');
  }
  for (const p of world.props) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (p.onBlast) { p.onBlast(d, R, Math.atan2(p.y - y, p.x - x)); continue; }
    if (d < R * (p.def.static ? 0.55 : 0.85)) p.break(Math.atan2(p.y - y, p.x - x), 2);
  }
  for (const g of world.windows) if (g.intact && Math.hypot(g.x - x, g.y - y) < R * 1.4) g.shatter(Math.atan2(g.y - y, g.x - x), null, 1.6);
  for (const door of [...world.doors]) {
    const b = door.body.position;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < R * 1.2) detachDoor(world, door, Math.atan2(b.y - y, b.x - x), 1.5 * (1 - d / (R * 1.4)) + 0.6);
  }
  for (const f of world.fences) if (!f.dead && Math.hypot(f.x - x, f.y - y) < R) destroyFence(world, f, Math.atan2(f.y - y, f.x - x));

  // walls: crushed near the blast, cracked further away
  const rr = Math.ceil(R / TILE) + 1, ccx = Math.floor(x / TILE), ccy = Math.floor(y / TILE);
  for (let ty = ccy - rr; ty <= ccy + rr; ty++) {
    for (let tx = ccx - rr; tx <= ccx + rr; tx++) {
      if (!world.map.canBreak(tx, ty)) continue;
      const wx = (tx + 0.5) * TILE, wy = (ty + 0.5) * TILE;
      const d = Math.hypot(wx - x, wy - y);
      if (d > R * 1.05) continue;
      const a = Math.atan2(wy - y, wx - x);
      if (d < R * 0.6) destroyWall(world, tx, ty, a, 1.6);
      else damageWall(world, tx, ty, Math.ceil(10 * (1 - d / (R * 1.05))), wx - Math.cos(a) * 14, wy - Math.sin(a) * 14, a, 1.3);
    }
  }

  // shockwave
  for (const b of world.physics.bodies()) {
    if ((b.isStatic && !b.frozen) || b.entity?.isPlayer || b.entity?.isEnemy) continue;
    const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy);
    if (d > R * 2.2 || d < 0.01) continue;
    const J = (1 - d / (R * 2.2)) * 260;
    if (b.label === 'door') {
      const door = b.entity;
      const torque = ((b.position.x - door.hx) * dy - (b.position.y - door.hy) * dx) / (d * door.len);
      Body.setAngularVelocity(b, Body.getAngularVelocity(b) + (torque * J) / kgOf(b) * 0.15);
      continue;
    }
    const dv = impulse(b, Math.atan2(dy, dx), J, rand(-0.4, 0.4), 22);
    b.flyUntil = world.time + 0.1 + dv * 0.02;
    if (b.entity?.isItem) b.entity.thrower = null;
    if (b.entity?.isDebris && dv > 4 && !b.entity.harm) b.entity.harm = { kind: 'blunt', knock: 3.5, lethal: 9 };
  }
}
