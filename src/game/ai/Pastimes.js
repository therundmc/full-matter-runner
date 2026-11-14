// What people do with themselves while all is calm. Guards with a job (level.jobs) and posted civilians
// (level.ambient.patrons) share the bar ones; bored guards and passers-by pick the others. Timing and spots only:
// the drawing is in render/PastimeArt.js.
//   pool   lining up shots over the table, one stroke per cycle     cue     waiting for his turn, cue upright
//   cards  a hand of cards held up                                  drink   a glass, raised now and then
//   watch  sitting back, hands on the knees, clapping now and then  dance   arms waving, steps around her spot
//   smoke  a cigarette, a drag now and then                         phone   his pager read
//   talk / listen  the two halves of a chat, turn about             cross   arms folded
//   stretch, wrist  a stretch, a look at his watch (one go)         piss    against a wall or at a toilet
//   pockets, bag   how a passer-by carries his hands                count   bills peeled off a wad, one by one
//   door   a doorman: arms folded, his eyes on whoever comes near   wipe    a bartender polishing a glass
//   sleep  lying on his cardboard until something wakes him
import { TILE } from '../Config.js';
import { clamp, angDiff } from '../../engine/math.js';

const CYCLE = 5;     // s between two pool strokes
const STRIKE = 0.8;  // share of the cycle at which the cue hits the ball
const SIP = 7;       // s between two sips
const DRAG = 6.5;    // s between two drags on a cigarette
const TURN = 2.8;    // s each one talks in a chat
const CLAP = 11;     // s between two rounds of applause
export const STRETCH = 2.6; // s a stretch (or a look at his watch) takes
const OPEN_AIR = '_"~';     // floors a man relieves himself on, against a wall: concrete, grass, dirt
const REACH = 3 * TILE;     // how far he walks for it

const frac = (v) => v - Math.floor(v);

// where a doorman standing toward `base` looks: at someone (dx, dy) px away if he is within `range` px and
// `arc` rad of that way, else straight ahead
export function gazeAt(base, dx, dy, range, arc) {
  const a = Math.atan2(dy, dx);
  return Math.hypot(dx, dy) <= range && Math.abs(angDiff(base, a)) <= arc ? a : base;
}

// true when a pool stroke lands between t0 and t1 (s); seed shifts each player's rhythm
export function struck(t0, t1, seed) {
  return Math.floor(t0 / CYCLE + seed - STRIKE) !== Math.floor(t1 / CYCLE + seed - STRIKE);
}

// px the cue is pushed along its line: small aiming strokes, drawn back, shot through, held, back in place
export function cueShift(t, seed) {
  const u = frac(t / CYCLE + seed);
  if (u < 0.62) return Math.sin(u * CYCLE * 4.5) * 1.6 * Math.min(1, (0.62 - u) * 8) - 1;
  if (u < 0.77) return -1 - 4 * (u - 0.62) / 0.15;
  if (u < STRIKE) return -5 + 12 * (u - 0.77) / 0.03;
  if (u < 0.9) return 7;
  return 7 - 8 * (u - 0.9) / 0.1;
}

// 0..1: how far the glass is raised to the lips
export function sip(t, seed) {
  const u = frac(t / SIP + seed);
  return u < 0.2 ? Math.sin((Math.PI * u) / 0.2) : 0;
}

// 0..1: how far the cigarette is raised to the lips
export function drag(t, seed) {
  const u = frac(t / DRAG + seed);
  return u < 0.22 ? Math.sin((Math.PI * u) / 0.22) : 0;
}

// 0..1 through the breath of smoke let out after a drag, -1 the rest of the time
export function exhale(t, seed) {
  const u = frac(t / DRAG + seed);
  return u > 0.2 && u < 0.5 ? (u - 0.2) / 0.3 : -1;
}

// whose turn it is to talk in a chat of two (turn: 0 | 1)
export const talks = (t, turn) => Math.floor(t / TURN) % 2 === turn;

// 0..1: arms thrown out, t s into a stretch
export const stretch = (t) => Math.sin(Math.PI * clamp(t / STRETCH, 0, 1));

// px between the hands of someone clapping (0: not clapping)
export function clap(t, seed) {
  return frac(t / CLAP + seed) < 0.12 ? 0.4 + Math.abs(Math.sin(t * 16)) * 2.2 : 0;
}

// relieving himself: t s at it, `left` s to go; a moment to get ready, a moment to shake off
export const pours = (t, left) => t > 0.9 && left > 1.3;

// where a guard standing at (x, y) goes to relieve himself: { x, y, face, wall } or null. Out in a yard or an alley,
// against the nearest wall; on bathroom tiles, in front of the nearest toilet; nowhere else.
export function reliefSpot(map, props, x, y) {
  const c = map.at(Math.floor(x / TILE), Math.floor(y / TILE));
  if (c === '+') {
    let best = null, bd = REACH * 1.2;
    for (const p of props) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (p.type === 'toilet' && !p.dead && d < bd) { bd = d; best = p; }
    }
    if (!best) return null;
    const a = Math.round(Math.atan2(y - best.y, x - best.x) / (Math.PI / 2)) * (Math.PI / 2);
    return { x: best.x + Math.cos(a) * 21, y: best.y + Math.sin(a) * 21, face: a + Math.PI, wall: false };
  }
  if (!OPEN_AIR.includes(c)) return null;
  let face = null, bd = REACH;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const hit = map.raycast(x, y, x + Math.cos(a) * REACH, y + Math.sin(a) * REACH);
    if (hit && hit.t * REACH < bd) { bd = hit.t * REACH; face = a; }
  }
  if (face === null) return null;
  const d = Math.max(0, bd - 14);
  return { x: x + Math.cos(face) * d, y: y + Math.sin(face) * d, face, wall: true };
}
