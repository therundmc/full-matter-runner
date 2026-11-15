// Stealth kill from behind: the rules only (DOM-free). The move itself is played by Player.updateTakedown, its
// sequence is data (data/finishers.js TAKEDOWNS).
import { TAKEDOWN } from '../Config.js';
import { angDiff } from '../../engine/math.js';

// Whether `p` stands right behind the standing guard `e`, facing his back, close enough to seize him.
export function behind(p, e, T = TAKEDOWN) {
  if (!e.alive || e.knocked > 0 || e.vaulting || e.held) return false;
  const dx = e.x - p.x, dy = e.y - p.y;
  if (Math.hypot(dx, dy) > T.reach) return false;
  const a = Math.atan2(dy, dx);
  return Math.abs(angDiff(p.angle, a)) <= T.facing && Math.abs(angDiff(e.angle, a)) <= T.rear;
}

// A takedown under way: f = its TAKEDOWNS entry. i = the beat coming, t = s into its wait (into `after` once done),
// hit = s since a beat last landed, age = s since it began, downAt = age at which he went down on his knees (-1:
// on his feet; 0 from the start for a man already kneeling), done = the kill has landed, over = the move is over.
export function newTakedown(f, kneeling = false) {
  return { f, i: 0, t: 0, hit: 9, age: 0, downAt: kneeling ? 0 : -1, done: false, over: false };
}

// One step of its clock: the beats whose wait ran out land, returned in order (most steps none, at most a few on a
// long step); the last one is the kill (td.done), then `after` s go by until td.over.
export function advance(td, dt) {
  const f = td.f, landed = [];
  td.age += dt;
  td.hit += dt;
  td.t += dt;
  while (!td.done && td.t >= f.beats[td.i][0]) {
    td.t -= f.beats[td.i][0];
    td.hit = td.t;
    landed.push(f.beats[td.i][1]);
    if (td.i === f.drop && td.downAt < 0) td.downAt = td.age - td.t;
    if (td.i === f.beats.length - 1) td.done = true;
    else td.i++;
  }
  if (td.done && td.t >= f.after) td.over = true;
  return landed;
}

// s the player is locked in it, start to end
export const lockedFor = (f) => f.beats.reduce((s, [wait]) => s + wait, 0) + f.after;
