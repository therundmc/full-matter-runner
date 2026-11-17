// Stealth kill from behind: the rules only (DOM-free). The move itself is played by Player.updateTakedown, its
// sequence is data (data/finishers.js TAKEDOWNS).
import { TAKEDOWN } from '../Config.js';
import { angDiff } from '../../engine/math.js';

// Whether `p` stands close enough to the standing guard `e` to seize him, turned to him: from whatever side.
export function within(p, e, T = TAKEDOWN) {
  if (!e.alive || e.knocked > 0 || e.vaulting || e.held) return false;
  const dx = e.x - p.x, dy = e.y - p.y;
  return Math.hypot(dx, dy) <= T.reach && Math.abs(angDiff(p.angle, Math.atan2(dy, dx))) <= T.facing;
}

// ... and right behind him, facing his back: the takedowns from behind; else it is one done face to face
export function behind(p, e, T = TAKEDOWN) {
  return within(p, e, T) && Math.abs(angDiff(e.angle, Math.atan2(e.y - p.y, e.x - p.x))) <= T.rear;
}

// Whether a takedown is still open on guard `e` with the squad in `phase` (ai/Director.js): it needs a man who is
// not aware of us, not one whose back is turned. Never on a man who is after us (aware 2; one who gave up is no
// longer) or who has just made us out (his detection meter full), never while they have us located (T.spotted:
// 'alert'). Once they have lost us ('evasion') or only suspect something ('caution'), it is open again. Spotted, a
// click at a guard is an ordinary attack.
export function unspotted(e, phase, T = TAKEDOWN) {
  if (e.yielded) return !T.spotted.includes(phase);
  return e.aware !== 2 && !((e.meter ?? 0) >= 1) && !T.spotted.includes(phase);
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

// A head driven into what stands in front of him (a takedown with a spot: data/finishers.js `grip: 'hair'`), read
// off the clock: drive 0..1 (1: his face in it), back 0..1 (his head yanked back by the hair: the anticipation),
// shake 0..1 (he fights the grip), hits = blows landed. Each contact beat stays in a breath (`hold` of its wait: the
// follow-through), pulls back up to `pull` of it, then drives in, faster and faster, to land at its end; a struggle
// after one keeps his head in it (`held`).
export const SLAM = { hold: 0.14, pull: 0.55, held: 0.8, grab: 0.4 };
const CONTACT = new Set(['smash', 'dunk']);
const ease = (k) => k * k * (3 - 2 * k);
// where beat i ends: [drive, back]
function endOf(f, i, C) {
  const what = f.beats[i]?.[1];
  if (CONTACT.has(what)) return [1, 0];
  if (what === 'struggle' && i > 0 && CONTACT.has(f.beats[i - 1][1])) return [C.held, 0];
  return [0, C.grab];
}
export function slamAt(td, C = SLAM) {
  const f = td.f, i = td.i, what = f.beats[i][1], u = td.done ? 1 : Math.min(1, td.t / f.beats[i][0]);
  let hits = 0;
  for (let j = 0; j < (td.done ? f.beats.length : i); j++) if (CONTACT.has(f.beats[j][1])) hits++;
  if (td.done) return { drive: 1, back: 0, shake: 0, hits };
  const [d0, b0] = i > 0 ? endOf(f, i - 1, C) : [0, 0];
  const [d1, b1] = endOf(f, i, C);
  let drive, back, shake = 0;
  if (CONTACT.has(what)) {
    if (u < C.hold) { drive = d0; back = b0; }
    else if (u < C.pull) { const k = ease((u - C.hold) / (C.pull - C.hold)); drive = d0 * (1 - k); back = b0 + (1 - b0) * k; }
    else { const k = ((u - C.pull) / (1 - C.pull)) ** 2; drive = k; back = 1 - k; }
  } else {
    const k = ease(Math.min(1, u / 0.4));
    drive = d0 + (d1 - d0) * k; back = b0 + (b1 - b0) * k;
    if (what === 'struggle') shake = Math.sin(Math.PI * u);
  }
  return { drive, back, shake, hits };
}
