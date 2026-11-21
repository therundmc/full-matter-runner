// How a guard gets about: paths (engine/nav), a jam remembered and gone round (ai/Nav.js), giving way, doorways
// held and waited for, keeping apart from the others, turning and sweeping his eyes. Functions of the guard (`me`),
// DOM-free.
import { ENEMY, AI, TILE } from '../../Config.js';
import { angDiff, approachAngle } from '../../../engine/math.js';
import { throughDoor, pastDoor } from '../../ai/Tactics.js';
import { cellAhead, giveWay as wayFor } from '../../ai/Nav.js';
import { S } from './States.js';
import { dice } from '../../systems/Rng.js';

const { Body } = Matter;

// true = path found, false = unreachable, null = no path budget left this step (retry next one)
function goTo(me, x, y) {
  if (!me.director.budget(1)) return null;
  me.dest = { x, y };
  const path = me.world.pathForGuard(me.x, me.y, x, y, me.director.pathCost(me));
  if (!path || !path.length) { me.path = null; return false; }
  me.path = path;
  me.pathIdx = 0;
  me.director.shareRoute(me, path);
  return true;
}

// Pushed in vain at something on his way: the tile in it is noted (ai/Nav.js) and his next path goes round it while
// he remembers (a thing from the second time it holds him there, people from AI.nav.jam.people: they move on).
// True once he has been held up AI.nav.jam.tries times on his way to the same spot: he gives it up.
function jammed(me, ux, uy) {
  const J = AI.nav.jam, w = me.world;
  const cell = cellAhead(w.map, me.x, me.y, ux, uy);
  if (cell === null) return false;
  me.blockN = cell === me.blockCell ? me.blockN + 1 : 1;
  me.blockCell = cell;
  const people = w.chars.some((c) => c !== me && c.alive && !(c.knocked > 0) && Math.hypot(c.x - me.x - ux * 16, c.y - me.y - uy * 16) < 20);
  if (me.blockN < (people ? J.people : 2)) return false;
  return noteJam(me, cell);
}

// the tile `cell` is in the way: his paths go round it while he remembers (ai/Nav.js); true once that has happened
// AI.nav.jam.tries times on his way to the same spot (he gives it up)
function noteJam(me, cell) {
  const J = AI.nav.jam, to = me.dest;
  if (to && (!me.jamTo || Math.hypot(me.jamTo.x - to.x, me.jamTo.y - to.y) > 20)) { me.jamTo = { x: to.x, y: to.y }; me.jamTries = 0; }
  me.jams.mark(cell, J.cost, me.world.time + J.forget);
  return ++me.jamTries >= J.tries;
}

// how he gives way to the people around him, heading (ux, uy) (ai/Nav.js giveWay): in a fight the player is not
// among them, he goes for him
export function giveWay(me, ux, uy) {
  const near = me.near;
  near.length = 0;
  for (const c of me.world.chars) {
    if (c === me || !c.alive || c.knocked > 0 || c.hidden || c.seated || c.vaulting || (c.isPlayer && me.aware === 2)) continue;
    if (Math.abs(c.x - me.x) < 60 && Math.abs(c.y - me.y) < 60) near.push(c);
  }
  return wayFor(me, ux, uy, near);
}

// True when we have been a few steps from (x, y) for too long without getting there: something stands on the
// spot (a car, a pile of wreckage) and close enough is good enough.
export function blockedAt(me, dt, x, y) {
  if (Math.hypot(x - me.x, y - me.y) > 80) { me.nearT = 0; return false; }
  return (me.nearT += dt) > 2;
}

// walk/run to (x, y), path-finding as needed; true once there (or unreachable)
export function travel(me, dt, x, y, speed, opts = {}) {
  if (!me.target || me.state !== S.COMBAT) me.target = { x, y };
  const near = opts.near ?? 8;
  if (Math.hypot(x - me.x, y - me.y) < near) { me.path = null; me.halt(); return true; }
  me.repath -= dt;
  const moved = !me.dest || Math.hypot(me.dest.x - x, me.dest.y - y) > 20;
  if ((!me.path || moved) && me.repath <= 0) {
    const r = goTo(me, x, y);
    if (r === false) { me.repath = 0.4; return true; }
    if (r === true) me.repath = 0.4;
  }
  if (!me.path) { me.halt(); return false; }
  return me.follow(dt, speed, opts);
}

export function follow(me, dt, speed, opts = {}) {
  if (!me.path) return true;
  let t = me.path[me.pathIdx];
  let dx = t.x - me.x, dy = t.y - me.y, d = Math.hypot(dx, dy);
  if (d < 8) {
    me.pathIdx++;
    if (me.pathIdx >= me.path.length) { me.path = null; me.halt(); return true; }
    t = me.path[me.pathIdx];
    dx = t.x - me.x; dy = t.y - me.y; d = Math.hypot(dx, dy) || 1;
  }
  const ux = dx / d, uy = dy / d, heading = Math.atan2(dy, dx);
  // the keys of the house: a locked door on his way opens for him
  for (const door of me.world.doors) {
    if (!door.locked || !me.world.isHouseDoor(door)) continue;
    const tip = door.tip();
    if (Math.hypot((door.hx + tip.x) / 2 - me.x - ux * 14, (door.hy + tip.y) / 2 - me.y - uy * 14) < 22) { door.unlatch(); me.turnKey(door); }
  }
  const map = me.world.map;
  const cx = Math.floor((me.x + ux * 20) / TILE), cy = Math.floor((me.y + uy * 20) / TILE), key = cy * map.w + cx;
  const mx = Math.floor(me.x / TILE), my = Math.floor(me.y / TILE);
  // a door frame, locked or not (a locked door of the house opens for him like any other)
  const frame = (x, y) => map.at(x, y) === 'D' || map.at(x, y) === 'L';
  const ahead = frame(cx, cy), inside = frame(mx, my);
  // one at a time through a doorway: whoever is in the frame, or was first to it, goes; the others stand back
  const want = inside ? my * map.w + mx : ahead ? key : me.gateWait > 0 ? me.gateFor : -1;
  if (want < 0) me.gate = -1;
  else if (!inside && gateTaken(me, want)) {
    if (me.gateWait >= (speed > 1.6 ? AI.gate.rush : AI.gate.calm)) {
      // the doorway is not clearing (a man stuck in it, coming the other way): another way round, if there is one
      me.gateWait = 0;
      if (noteJam(me, want)) { me.path = null; me.halt(); return true; }
      me.repath = 0; me.dest = null;
      me.halt();
      return false;
    }
    me.gate = -1;
    me.gateFor = want;
    me.gateWait += dt;
    if (!standBack(me, dt, want)) me.gateWait = 0; // sent somewhere else meanwhile
    return false;
  } else {
    me.gate = want;
    me.gateT = me.world.time;
    if (inside) me.gateWait = 0;
  }
  // calm guards pause a beat before stepping through a doorway
  if (opts.doors) {
    if (ahead && key !== me.doorKey) { me.doorKey = key; me.doorT = dice(me.world).rand(0.35, 0.8); }
    else if (!inside && !ahead) me.doorKey = -1;
  }
  if (me.doorT > 0) {
    me.doorT -= dt;
    me.halt();
    me.sweep(dt, heading, 0.9);
    return false;
  }
  // organic gait: slight sway, pace drift, giving way to the people around (stepping aside, falling in behind one
  // going his way), smooth acceleration
  const sway = Math.sin(me.world.time * 1.7 + me.seed) * (speed > 1.6 ? 0.08 : 0.16);
  const gw = me.giveWay(ux, uy);
  const sp = speed * me.pace * (1 + Math.sin(me.world.time * 0.6 + me.seed) * 0.06) * gw.slow;
  // a doorway is taken down its middle, not across the corner where the leaf hangs, and left straight on for a
  // tile before turning (a leaf swung open stands beside it)
  let way = (inside || ahead) && throughDoor(map, inside ? mx : cx, inside ? my : cy, me.x, me.y, ux, uy);
  if (inside) {
    const vert = !map.isBlocked(mx, my - 1) && !map.isBlocked(mx, my + 1);
    me.doorOut = { cx: mx, cy: my, s: Math.sign(vert ? uy : ux) || 1 };
  } else if (!way && me.doorOut) {
    const o = me.doorOut;
    way = pastDoor(map, o.cx, o.cy, o.s, me.x, me.y);
    if (!way) me.doorOut = null;
  }
  if (way) me.steer(way.x + gw.x * 0.4, way.y + gw.y * 0.4, sp, 0.16);
  else me.steer(ux - uy * sway + gw.x, uy + ux * sway + gw.y, sp, speed > 1.6 ? 0.16 : 0.09);
  if (opts.look !== false) {
    // the head leads: look into the next leg of the path before the feet turn
    const n = me.path[me.pathIdx + 1];
    const la = n && d < 40 ? Math.atan2(n.y - me.y, n.x - me.x) : heading;
    me.faceAngle(la + (opts.glance ? walkGlance(me, dt) : 0), speed > 1.6 ? 7 : 4, dt);
  }
  // pushing at something that will not give: his legs go, the ground does not
  me.probeT += dt;
  let held = false;
  if (me.probeT >= 0.5) {
    held = Math.hypot(me.x - me.probeX, me.y - me.probeY) < sp * 6; // a fifth of half a second's walk
    me.probeT = 0; me.probeX = me.x; me.probeY = me.y;
  }
  // stuck on furniture or bodies: vault it, else note what is in the way, sidestep and re-plan round it
  if (held || me.moving < sp * 0.25) {
    me.stuck += held ? 1 : dt;
    if (me.stuck > 0.25 && me.tryVault(heading)) { me.stuck = 0; return false; }
    if (me.stuck > 0.7) {
      me.stuck = 0;
      if (jammed(me, ux, uy)) { me.path = null; me.halt(); return true; } // no way through: he gives it up
      // in a door frame there is no room at the sides: back out of it
      const side = heading + (inside ? Math.PI : dice(me.world).chance(0.5) ? 1.4 : -1.4);
      Body.setVelocity(me.body, { x: Math.cos(side) * speed, y: Math.sin(side) * speed });
      me.repath = 0;
      me.dest = null;
    }
  } else me.stuck = 0;
  return false;
}

// is the doorway (cell key) another guard's: he stands in it, or claimed it a moment ago (see follow)
function gateTaken(me, key) {
  const w = me.world.map.w, now = me.world.time;
  return me.world.enemies.some((e) => e !== me && e.alive && !(e.knocked > 0)
    && ((e.gate === key && now - e.gateT < 0.3) || Math.floor(e.y / TILE) * w + Math.floor(e.x / TILE) === key));
}

// Wait for a doorway: clear of its mouth (a tile out from it and a tile and a bit to one side, out of the way of
// whoever comes through), eyes on it; false when it is no longer on his way.
function standBack(me, dt, key) {
  const map = me.world.map, w = map.w, cx = key % w, cy = Math.floor(key / w);
  const dcx = (cx + 0.5) * TILE, dcy = (cy + 0.5) * TILE, dx = me.x - dcx, dy = me.y - dcy;
  if (Math.hypot(dx, dy) > AI.gate.far) return false;
  const vert = !map.isBlocked(cx, cy - 1) && !map.isBlocked(cx, cy + 1);
  const out = (vert ? Math.sign(dy) : Math.sign(dx)) || 1; // the side of the doorway he is on
  let spot = null;
  for (const side of me.seed < 50 ? [1, -1, 0] : [-1, 1, 0]) {
    const along = side ? 1.1 : 1.6, across = side * 1.25;
    const x = vert ? dcx + across * TILE : dcx + out * along * TILE, y = vert ? dcy + out * along * TILE : dcy + across * TILE;
    if (!map.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE))) { spot = { x, y }; break; }
  }
  const d = spot ? Math.hypot(spot.x - me.x, spot.y - me.y) : 0;
  if (d > 4) {
    const s = me.separation();
    me.steer((spot.x - me.x) / d + s.x, (spot.y - me.y) / d + s.y, Math.min(1.3, d / 8), 0.2);
  } else me.halt();
  me.faceTo(dcx, dcy, 4, dt);
  return true;
}

// stand still, only nudged apart from mates
export function halt(me) {
  if (outOfDoorway(me)) return;
  const s = me.separation(), m = Math.hypot(s.x, s.y);
  me.steer(s.x, s.y, m > 0.01 ? Math.min(1, m) * 1.2 : 0, 0.2);
}

// Standing still in a door frame with somebody close by: he steps out of it along the passage, away from them
// (a doorway is everyone's way through). True while he does.
function outOfDoorway(me) {
  const map = me.world.map, cx = Math.floor(me.x / TILE), cy = Math.floor(me.y / TILE), c = map.at(cx, cy);
  if ((c !== 'D' && c !== 'L') || me.vaulting || me.held) return false;
  const vert = !map.isBlocked(cx, cy - 1) && !map.isBlocked(cx, cy + 1);
  if (!vert && (map.isBlocked(cx - 1, cy) || map.isBlocked(cx + 1, cy))) return false;
  let other = null, od = 40;
  for (const o of me.world.chars) {
    const d = o !== me && o.alive && !(o.knocked > 0) ? Math.hypot(o.x - me.x, o.y - me.y) : Infinity;
    if (d < od) { od = d; other = o; }
  }
  if (!other) return false;
  const side = vert ? Math.sign(me.y - other.y) || 1 : Math.sign(me.x - other.x) || 1;
  const tx = vert ? (cx + 0.5) * TILE : (cx + 0.5 + side) * TILE, ty = vert ? (cy + 0.5 + side) * TILE : (cy + 0.5) * TILE;
  me.steer(tx - me.x, ty - me.y, ENEMY.walkSpeed, 0.2);
  return true;
}

// push away from mates closer than 26 px (reused vector)
export function separation(me) {
  let sx = 0, sy = 0;
  for (const e of me.world.enemies) {
    if (e === me || !e.alive || e.knocked > 0) continue;
    const dx = me.x - e.x, dy = me.y - e.y, d2 = dx * dx + dy * dy;
    if (d2 > 26 * 26 || d2 < 0.01) continue;
    const d = Math.sqrt(d2), k = (26 - d) / 26;
    sx += (dx / d) * k; sy += (dy / d) * k;
  }
  me.sep.x = sx; me.sep.y = sy;
  return me.sep;
}

// turn towards a: at a steady rate on a target, easing into it otherwise (a head that settles, not a turret)
export function faceAngle(me, a, rate, dt) {
  const k = me.aware >= 2 ? 1 : Math.min(1, Math.abs(angDiff(me.angle, a)) / 0.6 + 0.15);
  me.angle = approachAngle(me.angle, a, rate * dt * k);
}

export function faceTo(me, x, y, rate, dt) { me.faceAngle(Math.atan2(y - me.y, x - me.x), rate, dt); }

// look around a base direction with pauses between glances
export function sweep(me, dt, base, amp = 1.1, rate = 3.2) {
  if ((me.glanceT -= dt) <= 0) { me.glanceT = dice(me.world).rand(0.5, 1.3); me.glance = dice(me.world).rand(-amp, amp); }
  me.faceAngle(base + me.glance, rate, dt);
}

function walkGlance(me, dt) {
  if ((me.glanceT -= dt) <= 0) { me.glanceT = dice(me.world).rand(1.2, 3.5); me.glance = dice(me.world).chance(0.55) ? 0 : dice(me.world).rand(-0.9, 0.9); }
  return me.glance;
}
