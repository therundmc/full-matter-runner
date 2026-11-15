// Breaking the level itself: wall tiles crack then collapse (to a blast only), windows are torn out of them, doors
// get ripped off, fences flattened.
import { TILE, WALL_HP, WALL_WEAR } from '../Config.js';
import { rand, chance, clamp } from '../../engine/math.js';
import { rubble, chunk } from '../../engine/Assets.js';
import Debris from '../entities/Debris.js';
import { splitInTwo } from '../render/DamageArt.js';
import { heldBy } from '../world/Openings.js';

// A blow on wall tile (cx, cy) at (x, y) (in the wall), coming along dirA. Only a blast (`blast`) can bring the wall
// down, its cracks spreading as it weakens; anything else (rounds, clubs, impacts) only wears it, WALL_WEAR of its hit
// points at most, and digs its own mark into it (MapRenderer.wallHit).
export function damageWall(world, cx, cy, dmg, x, y, dirA, power = 1, blast = false) {
  const m = world.map;
  if (!m.canBreak(cx, cy)) return;
  const i = cy * m.w + cx;
  const max = WALL_HP[m.at(cx, cy)];
  const col = m.chipColor(cx, cy);
  const worn = max * (1 - WALL_WEAR);
  if (blast) m.hp[i] -= dmg;
  else if (m.hp[i] > worn) m.hp[i] = Math.max(worn, m.hp[i] - dmg);
  if (blast) world.decals.crack(x, y, clamp(1 - m.hp[i] / max, 0, 1));
  // what flies off it starts at its face, never inside it
  let fx = x, fy = y;
  for (let k = 0; k < 12 && m.solidAt(fx, fy); k++) { fx -= Math.cos(dirA) * 1.5; fy -= Math.sin(dirA) * 1.5; }
  world.particles.chips(fx, fy, dirA + Math.PI, 1.1, 3 + dmg * 3, col, 150);
  world.particles.smoke(fx, fy, 1 + Math.min(4, dmg), 2, { speed: 28, size: 4, life: 0.9 });
  if (chance(0.3 * dmg) && !m.solidAt(fx, fy)) {
    const pcs = rubble(m.at(cx, cy) === 'X' ? 'brick' : 'wall');
    const a = dirA + Math.PI + rand(-0.8, 0.8), v = rand(40, 120);
    world.addDebris(new Debris(world, pcs[Math.floor(rand(0, 5))], fx, fy, rand(0, 6), Math.cos(a) * v, Math.sin(a) * v,
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
  world.smoke?.burst('wall', x, y);
  world.sound('crumble', x, y);
  world.shake(0.3);
  world.noise(x, y, 420, null, 'wall');
  world.events.emit('wallDestroyed', { cx, cy, x, y, dirA, power });
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

const FRAME_BITS = [[15, 4], [12, 4], [8, 4], [6, 3], [4, 3]]; // twisted rails and posts of a window frame (px)

// a window torn out of its wall, glass, frame and sill: what is left is a breach like any other
export function destroyWindow(world, win, dirA = 0, power = 1) {
  const i = world.windows.indexOf(win);
  if (i < 0) return;
  if (win.intact) win.shatter(dirA, null, power);
  world.windows.splice(i, 1);
  world.removeBody(win.body);
  world.map.destroyTile(win.cx, win.cy);
  world.decals.destroyTile(win.cx, win.cy, win.wall);
  const { x, y } = win;
  const spot = () => [x + rand(-10, 10) * (win.vertical ? 0.3 : 1), y + rand(-10, 10) * (win.vertical ? 1 : 0.3)];
  const fling = (img, opts) => {
    const a = dirA + rand(-0.9, 0.9), v = rand(70, 230) * power;
    world.addDebris(new Debris(world, img, ...spot(), rand(0, 6), Math.cos(a) * v, Math.sin(a) * v, rand(-0.6, 0.6), opts));
  };
  for (const [w, h] of FRAME_BITS) {
    fling(chunk('#9aa0b0', w, h), { air: 0.06, bounce: 0.3, material: 'metal', z: rand(4, 10), vz: rand(20, 80), land: 'metal',
      harm: { kind: 'blunt', knock: 3.2, lethal: 8 } });
  }
  const lumps = rubble(win.wall);
  for (let k = 0; k < 4; k++) fling(lumps[Math.floor(rand(0, 6))], { air: 0.07, bounce: 0.2, material: 'concrete' });
  world.particles.chips(x, y, dirA, Math.PI, 14, '#9aa0b0', 200);
  world.smoke?.burst('window', x, y);
  world.sound('metalBreak', x, y, 0.8);
  world.sound('crumble', x, y, 0.6);
  world.shake(0.2);
  world.noise(x, y, 380, null, 'wall');
  world.events.emit('windowDestroyed', { x, y, cx: win.cx, cy: win.cy, dirA, power });
}

const DOMINO = 0.12; // s between a window going and the next one of a glazed front following it

// Openings go with what holds them. When a wall tile collapses, the windows built into it are torn out, the door
// hinged on it falls and a bolt shot into it is free; a window going takes the next one of a glazed run with it.
export function watchOpenings(world) {
  const collapse = ({ cx, cy, dirA = 0, power = 1 }, delay = 0) => {
    const held = heldBy(world, cx, cy);
    for (const g of held.windows) {
      if (delay) world.after(delay, () => destroyWindow(world, g, dirA, power));
      else destroyWindow(world, g, dirA, power);
    }
    for (const d of held.doors) detachDoor(world, d, dirA, power);
    for (const d of held.unbolted) { const t = d.tip(); d.unlock(t.x, t.y, dirA, 0.6); }
  };
  world.events.on('wallDestroyed', (e) => collapse(e));
  world.events.on('windowDestroyed', (e) => collapse(e, DOMINO));
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
