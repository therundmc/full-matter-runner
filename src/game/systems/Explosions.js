// Blasts: kill/knock characters, break things, crush walls and push every loose body with momentum shared
// out by mass (a chair flies, a car barely rocks). Everything is scaled by occlusion(): walls stop the blast,
// doors / heavy furniture / glass soak part of it.
import { TILE } from '../Config.js';
import { rand } from '../../engine/math.js';
import { impulse, kgOf } from '../../engine/physics/Body.js';
import { damageWall, destroyWall, detachDoor, destroyFence } from './Destruction.js';
import { occlusion } from './Ballistics.js';

const { Body } = Matter;

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
    if (d > R * 2) continue;
    const f = occ(p.x, p.y, p);
    if (f <= 0) continue;
    const de = d / f;
    if (p.onBlast) { p.onBlast(de, R, Math.atan2(p.y - y, p.x - x)); continue; }
    if (de < R * (p.def.static ? 0.55 : 0.85)) p.break(Math.atan2(p.y - y, p.x - x), 2);
  }
  for (const g of world.windows) {
    if (!g.intact) continue;
    const d = Math.hypot(g.x - x, g.y - y), f = d < R * 1.4 ? occ(g.x, g.y, g) : 0;
    if (f > 0 && d / f < R * 1.4) g.shatter(Math.atan2(g.y - y, g.x - x), null, 1.6 * f);
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

  // walls: crushed near the blast, cracked further away
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
      else damageWall(world, tx, ty, Math.ceil(10 * (1 - d / (R * 1.05))), wx - Math.cos(a) * 14, wy - Math.sin(a) * 14, a, 1.3);
    }
  }

  // shockwave
  for (const b of world.physics.bodies()) {
    if ((b.isStatic && !b.frozen) || b.entity?.isPlayer || b.entity?.isEnemy) continue;
    const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy);
    if (d > R * 2.2 || d < 0.01) continue;
    const f = occ(b.position.x, b.position.y, b.entity);
    if (f <= 0) continue;
    const J = (1 - d / (R * 2.2)) * 200 * f;
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
