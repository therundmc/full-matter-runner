// What a round throws past the man it hits (fx/Gore.js), and blood on walls: the exit spray landing in long streaks on
// the floor behind him, the splash on a wall close behind him and the blood that runs down it to its foot over a few
// seconds (data/wounds.js `fling`, `wall`, RUNS). DOM-free: it only calls world.decals and world.emit.
import { rand, randi, chance, spread } from '../../engine/math.js';
import { RUNS } from '../data/wounds.js';
import { WALL_RIM } from '../Config.js';

// the first wall along `angle` from (x, y) within `reach` px: { x, y } the last free point before its face, (nx, ny)
// the face's normal (out of the wall), d the distance; or null
export function wallBehind(map, x, y, angle, reach) {
  const c = Math.cos(angle), s = Math.sin(angle);
  let px = x, py = y;
  for (let d = 2; d <= reach; d += 2) {
    const qx = x + c * d, qy = y + s * d;
    if (map.solidAt(qx, qy)) {
      const [nx, ny] = faceNormal(map, px, py, qx, qy);
      return { x: px, y: py, nx, ny, d };
    }
    px = qx; py = qy;
  }
  return null;
}

// the normal (out of the wall) of the face crossed going from the free point p to the solid point q
export function faceNormal(map, px, py, qx, qy) {
  const sx = Math.sign(px - qx) || 1, sy = Math.sign(py - qy) || 1;
  const col = map.solidAt(qx, py), row = map.solidAt(px, qy);
  if (col && !row) return [sx, 0];
  if (row && !col) return [0, sy];
  return Math.abs(qx - px) > Math.abs(qy - py) ? [sx, 0] : [0, sy];
}

// how many runs are going on in a world (RUNS.max)
const running = new WeakMap();
export const runsOf = (world) => running.get(world) || 0;

// Blood (or any liquid: color) running down a wall from (x, y), `deep` px into its top, along (nx, ny) (the face's
// normal: toward the floor below it): it slows as it thins, wavers a pixel now and then, crosses the face and gathers
// in a drop at its foot.
export function run(world, x, y, nx, ny, deep, color) {
  const n = runsOf(world);
  if (n >= RUNS.max) return false;
  running.set(world, n + 1);
  const sx = x - nx * deep, sy = y - ny * deep, len = deep + rand(1, 3);
  const v0 = rand(...RUNS.speed), dur = (2 * len) / v0, acc = v0 / dur;
  const w = chance(0.3) ? 2 : 1, foot = rand(...RUNS.foot);
  let done = 0, side = 0;
  world.emit(sx, sy, dur, (e) => {
    const t = dur - e.t, at = e.t <= 0 ? len : Math.min(len, v0 * t - (acc * t * t) / 2);
    for (; done < at; done++) {
      if (chance(RUNS.wobble)) side = Math.max(-1, Math.min(1, side + (chance(0.5) ? 1 : -1)));
      world.decals.runDot(sx + nx * done - ny * side, sy + ny * done + nx * side, w, color);
    }
    if (e.t > 0) return;
    running.set(world, Math.max(0, runsOf(world) - 1));
    const fx = sx + nx * (done + foot * 0.5) - ny * side, fy = sy + ny * (done + foot * 0.5) + nx * side;
    if (color) world.decals.runDot(fx, fy, 2, color);
    else if (!world.map.solidAt(fx, fy)) world.decals.stampBlood(fx, fy, foot);
  });
  return true;
}

// A splash of radius r thrown along `angle` against the wall found behind (hit: wallBehind's), and `runs` drips
// running down from it to the floor; the foot of the wall takes what falls straight down.
export function splashWall(world, hit, angle, r, runs) {
  const D = world.decals, { nx, ny } = hit;
  // into the wall top, behind its outline, so that its spines reach the face (hit is the last free point before it)
  const deep = WALL_RIM + 2 + r * 0.3, sx = hit.x - nx * deep, sy = hit.y - ny * deep;
  D.splashWall(sx, sy, r, angle);
  D.stampBlood(hit.x + nx * 2, hit.y + ny * 2, Math.max(1.5, r * 0.45), 3, Math.atan2(ny, nx));
  for (let i = 0; i < runs; i++) {
    const t = rand(-1.1, 1.1) * r;
    run(world, hit.x - ny * t, hit.y + nx * t, nx, ny, rand(...RUNS.len) * (0.5 + r * 0.08));
  }
}

// The spray out of the far side of him (wound profile wd, k = x of it): long streaks landing on the floor behind
// him along the shot (spreadA: half-cone, rad), and the wall close behind him, if one is, takes a splash and runs.
export function fling(world, x, y, angle, wd, k = 1, spreadA = 0.12) {
  const D = world.decals, map = world.map;
  const wall = wd.wall ? wallBehind(map, x, y, angle, wd.wall[0]) : null;
  if (wd.fling) {
    const [n, near, far] = wd.fling, top = wall ? Math.min(far, wall.d - 2) : far;
    for (let i = Math.round(n * k); i > 0; i--) {
      const u = Math.random() ** 0.7, d = near + (far - near) * u;
      if (d > top) continue; // the wall took it
      const a = angle + spread() * spreadA * (1.3 - u), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (map.solidAt(px, py)) continue;
      // the farther, the flatter it came down: a longer, thinner streak
      if (chance(0.25)) D.stampBlood(px, py, rand(1.2, 2.6));
      else D.stampStreak(px, py, Math.cos(a), Math.sin(a), rand(5, 9) + u * 10, rand(1.4, 2.4) * (1.2 - u * 0.5));
    }
  }
  if (wall) splashWall(world, wall, angle, wd.wall[1] * Math.sqrt(k) * rand(0.8, 1.15), randi(wd.wall[2], wd.wall[3]));
  return wall;
}

// a body slammed against a wall at (x, y) on its face (nx, ny out of it): his blood on it and a run or two down it
export function smear(world, x, y, nx, ny) {
  const deep = WALL_RIM + 3;
  world.decals.splashWall(x - nx * deep, y - ny * deep, rand(2.5, 3.5), Math.atan2(-ny, -nx));
  for (let i = randi(1, 3); i > 0; i--) {
    const t = rand(-5, 5);
    run(world, x - ny * t, y + nx * t, nx, ny, rand(...RUNS.len) * 0.7);
  }
}
