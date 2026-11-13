// Breaking the level itself: wall tiles crack then collapse, doors get ripped off, fences flattened.
import { TILE, WALL_HP } from '../Config.js';
import { rand, chance, clamp } from '../../engine/math.js';
import { rubble, chunk } from '../../engine/Assets.js';
import Debris from '../entities/Debris.js';
import { splitInTwo } from '../render/DamageArt.js';

export function damageWall(world, cx, cy, dmg, x, y, dirA, power = 1) {
  const m = world.map;
  if (!m.canBreak(cx, cy)) return;
  const i = cy * m.w + cx;
  const max = WALL_HP[m.at(cx, cy)];
  const col = m.chipColor(cx, cy);
  m.hp[i] -= dmg;
  world.decals.crack(x, y, clamp(1 - m.hp[i] / max, 0, 1));
  world.particles.chips(x, y, dirA + Math.PI, 1.1, 3 + dmg * 3, col, 150);
  world.particles.smoke(x, y, 1 + Math.min(4, dmg), 2, { speed: 28, size: 4, life: 0.9 });
  if (chance(0.3 * dmg)) {
    const pcs = rubble(m.at(cx, cy) === 'X' ? 'brick' : 'wall');
    const a = dirA + Math.PI + rand(-0.8, 0.8), v = rand(40, 120);
    world.addDebris(new Debris(world, pcs[Math.floor(rand(0, 5))], x, y, rand(0, 6), Math.cos(a) * v, Math.sin(a) * v,
      rand(-0.5, 0.5), { air: 0.08, material: 'concrete' }));
  }
  if (m.hp[i] <= 0) destroyWall(world, cx, cy, dirA, power);
}

export function destroyWall(world, cx, cy, dirA, power = 1) {
  const m = world.map;
  if (!m.canBreak(cx, cy)) return;
  const col = m.chipColor(cx, cy);
  const tex = m.destroyTile(cx, cy);
  world.decals.destroyTile(cx, cy, tex);
  world.wallsDirty = true;
  const x = (cx + 0.5) * TILE, y = (cy + 0.5) * TILE;
  const pcs = rubble(tex);
  const n = 9 + Math.floor(rand(0, 6));
  for (let k = 0; k < n; k++) {
    const a = dirA + rand(-1.1, 1.1), v = rand(60, 200) * power;
    world.addDebris(new Debris(world, pcs[k % pcs.length], x + rand(-12, 12), y + rand(-12, 12), rand(0, 6), Math.cos(a) * v, Math.sin(a) * v,
      rand(-0.5, 0.5), { air: 0.07, bounce: 0.2, material: 'concrete', harm: { kind: 'blunt', knock: 3.2, lethal: 7.5 } }));
  }
  world.particles.chips(x, y, dirA, Math.PI, 30, col, 220);
  world.particles.smoke(x, y, 22, 14, { speed: 70, size: 10, life: 2.2 });
  world.sound('crumble', x, y);
  world.shake(0.3);
  world.noise(x, y, 420, null, 'wall');
  world.events.emit('wallDestroyed', { cx, cy, x, y });
}

// door ripped off its hinges; a violent blow (blast) breaks the leaf in two across the grain
export function detachDoor(world, door, dirA, power = 1) {
  const i = world.doors.indexOf(door);
  if (i < 0) return;
  world.doors.splice(i, 1);
  world.removeBody(door.body);
  for (const c of door.cells) world.map.blocked[c] = 0; // a ripped-off locked door no longer blocks paths
  const b = door.body;
  const harm = { kind: 'blunt', knock: 2.5, lethal: 7 };
  const halves = power > 1.2 ? splitInTwo(door.canvas) : [door.canvas];
  const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
  halves.forEach((img, k) => {
    const off = halves.length > 1 ? (k ? 1 : -1) * door.len * 0.25 : 0;
    const v = rand(160, 320) * power, a = dirA + (halves.length > 1 ? rand(-0.4, 0.4) : 0);
    world.addDebris(new Debris(world, img, b.position.x + ca * off, b.position.y + sa * off, b.angle,
      Math.cos(a) * v, Math.sin(a) * v, rand(-0.5, 0.5),
      { kg: 25 / halves.length, mu: 0.5, fly: 0.3, air: 0.05, bounce: 0.3, material: 'wood', z: 8, vz: 60 * power, land: 'wood', harm: { ...harm } }));
  });
  world.particles.chips(b.position.x, b.position.y, dirA, Math.PI, 24, '#8a5a34', 200);
  world.particles.dust(b.position.x, b.position.y, 8, 10, '#9a7a58', { speed: 40, size: 6, life: 2.5 });
  world.sound('doorBreak', b.position.x, b.position.y);
  world.shake(0.2);
  world.noise(b.position.x, b.position.y, 300, null, 'door');
  world.events.emit('doorBroken', { x: door.hx, y: door.hy });
}

export function destroyFence(world, f, dirA) {
  if (f.dead) return;
  f.dead = true;
  world.removeBody(f.body);
  world.decals.wallCtx.clearRect(f.x - 17, f.y - 17, 34, 34);
  for (let k = 0; k < 6; k++) {
    const a = dirA + rand(-1, 1), v = rand(80, 260);
    world.addDebris(new Debris(world, chunk('#6a4a2a', Math.floor(rand(3, 9)), 3), f.x + rand(-10, 10), f.y + rand(-10, 10), rand(0, 6),
      Math.cos(a) * v, Math.sin(a) * v, rand(-0.6, 0.6), { material: 'wood' }));
  }
  world.particles.chips(f.x, f.y, dirA, Math.PI, 12, '#6a4a2a', 160);
}
