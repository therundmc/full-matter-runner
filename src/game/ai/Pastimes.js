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
import { clamp, angDiff, lerp, rand } from '../../engine/math.js';

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
// against the nearest wall; on bathroom tiles, at the nearest urinal (squarely in front of it), else in front of the
// nearest toilet; nowhere else.
export function reliefSpot(map, props, x, y) {
  const c = map.at(Math.floor(x / TILE), Math.floor(y / TILE));
  if (c === '+') {
    let best = null, bd = REACH * 1.2;
    for (const p of props) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (p.type === 'urinal' && !p.dead && d < bd) { bd = d; best = p; }
    }
    if (best) {
      const f = best.body.angle + Math.PI / 2; // the way it faces, off its wall
      return { x: best.x + Math.cos(f) * 17, y: best.y + Math.sin(f) * 17, face: f + Math.PI, wall: false };
    }
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

// ---------------- a guard's post (data/posts.js) ----------------
// the clock of the pool pastime at time k (0..1) of one stroke: the shot lands at k = STRIKE
export { STRIKE };
const poolClock = (k, seed) => CYCLE * (k - frac(seed));

// The life at a post, played from its script: acts picked at random by weight (never twice in a row unless alone),
// each a run of phases of random length. Time only: Enemy.work takes him to each phase's spot and steps it there.
export class Routine {
  // slot: which of the men sharing the post he is (weights may differ per man)
  constructor(script, slot = 0) {
    this.script = script;
    this.slot = slot;
    this.act = null; this.name = ''; this.last = '';
    this.i = 0; this.t = 0; this.dur = 1;
    this.cued = null; this.cueT = 0;
  }

  get phase() { return this.act ? this.act.phases[this.i] : null; }
  get k() { return clamp(this.t / this.dur, 0, 1); }

  weight(name) {
    const a = this.script.acts[name];
    if (a.cue) return 0;
    return Array.isArray(a.w) ? a.w[this.slot] ?? a.w[0] : a.w ?? 1;
  }

  // an act at random by weight among those ok(name) allows, the last one played only if it is the only one left
  pick(ok = () => true) {
    const names = Object.keys(this.script.acts).filter((n) => this.weight(n) > 0 && ok(n));
    const pool = names.length > 1 ? names.filter((n) => n !== this.last) : names;
    let r = Math.random() * pool.reduce((s, n) => s + this.weight(n), 0);
    for (const n of pool) if ((r -= this.weight(n)) <= 0) return n;
    return pool[pool.length - 1] ?? null;
  }

  // start act `name`; late: somewhere into its first phase (two men posted alike never start in step)
  begin(name, late = false) {
    this.act = name ? this.script.acts[name] : null;
    this.name = this.last = name || '';
    this.i = 0;
    if (this.act) this.enter();
    if (late) this.t = rand(0, this.dur);
  }

  enter() { this.t = 0; this.dur = rand(...this.phase.dur); }

  // on to the next phase: 'phase', or 'act' once the act is over
  advance() {
    if (this.act && ++this.i < this.act.phases.length) { this.enter(); return 'phase'; }
    this.act = null;
    return 'act';
  }

  // play act `name` in `delay` s, cutting short whatever is going on then (a nod, a laugh)
  cue(name, delay = 0) { this.cued = name; this.cueT = delay; }

  // dt s of work at the phase's spot: null, 'phase' (a new phase begins) or 'act' (the act is over)
  step(dt) {
    if (this.cued && (this.cueT -= dt) <= 0) { this.begin(this.cued); this.cued = null; return 'phase'; }
    if (!this.act) return 'act';
    this.t += dt;
    return this.t >= this.dur ? this.advance() : null;
  }
}

// ---- gestures: where the hands go (his own frame: +x ahead, +y his right; lips about 4.5 ahead), how the body leans
// (body: fwd px, side px, twist rad, dip share of height lost, foot [which, x, y] a foot lifted) and what is in the
// hands (data/posts.js HELD). `pastime`: the hands (and drawing) of that render/PastimeArt.js pastime, `clock`: what
// drives it ('stroke': one pool stroke over the phase, 'once': a one-go move over the phase, else the world's time).
// hands(k, pt, t, seed, tool): k 0..1 through the phase, pt s into it, t the world's time, tool his weapon's swing.
const H = (lx, ly, rx, ry) => ({ hl: { x: lx, y: ly }, hr: { x: rx, y: ry } });
const bump = (k, a, b) => (k <= a || k >= b ? 0 : Math.sin((Math.PI * (k - a)) / (b - a)));
const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const BACK = [-4, -13.5]; // an arm stretched along the back of the couch
const CROSSED = H(5.5, 2.2, 5.5, -2.2);
const OVER = { fwd: 2.5, dip: 0.02 }; // bent over a table, his hands on it

export const GESTURES = {
  // standing at his post
  cross: { pastime: 'cross' },
  wrist: { pastime: 'wrist', clock: 'once' },
  smoke: { pastime: 'smoke', item: 'cig' },
  phone: { pastime: 'phone' },
  cue: { pastime: 'cue' },
  cards: { pastime: 'cards', item: 'cards', body: () => OVER },
  count: { pastime: 'count', item: 'wad', body: () => OVER },
  wipe: { pastime: 'wipe', item: 'glass' },
  aim: { pastime: 'pool', clock: 'stroke', body: () => ({ fwd: 2.5, dip: 0.03 }) },
  clasp: { hands: (k, pt) => H(4.6, -1.3 + Math.sin(pt * 1.3) * 0.2, 4.8, 1.3) },
  shift: {
    hands: () => CROSSED,
    body: (k, pt, seed) => { const s = Math.sin(pt * 1.4 + seed); return { side: s * 2.4, twist: s * 0.07 }; },
  },
  neck: {
    // a hand on the back of the neck, the head rolled to one side then the other: the crack
    hands: (k) => { const on = ease(k / 0.15) * (1 - ease((k - 0.85) / 0.15)); return H(0.5, -7, lerp(6, -3, on), lerp(6, 1.5, on)); },
    body: (k) => ({ twist: 0.3 * bump(k, 0.2, 0.45) - 0.3 * bump(k, 0.45, 0.75), dip: 0.02 * bump(k, 0.2, 0.8) }),
  },
  nod: { hands: () => CROSSED, body: (k) => ({ fwd: 2.2 * bump(k, 0.1, 0.55), dip: 0.05 * bump(k, 0.1, 0.55) }) },
  // the flame cupped in both hands at the lips
  light: { hands: (k, pt) => H(5.2, -1.5, 5.4 + Math.sin(pt * 3) * 0.2, 1.3), body: () => ({ fwd: 0.8, dip: 0.02 }), item: 'cig' },
  // the end of a cigarette flicked away: wound back, snapped out
  flick: { hands: (k) => { const o = bump(k, 0.3, 0.75); return H(5.5, -6, lerp(6.5, 12, o) - 1.5 * bump(k, 0, 0.3), lerp(5.5, 3, o)); }, item: 'cig' },
  ash: { hands: (k) => H(5.5, -6, 7.5 + 1.6 * bump(k, 0.3, 0.55), 5.5 - 1.2 * bump(k, 0.3, 0.55)), item: 'cig' },
  // bent to a car window, hands cupped against the glass
  peer: { hands: (k, pt) => H(11.5, -3.5, 11.5, 3.5 + Math.sin(pt) * 0.3), body: (k) => ({ fwd: 4 * ease(k / 0.15), dip: 0.05 }) },
  // a can sent down the pavement by the right foot
  kick: {
    hands: () => H(0.5, -6.6, 0.5, 6.6),
    body: (k) => ({ foot: [1, 1 + 10 * bump(k, 0.2, 0.55) - 2 * bump(k, 0, 0.2), 3.6], twist: -0.12 * bump(k, 0.1, 0.6) }),
  },
  // down on a knee, both hands at the shoe
  tie: {
    hands: (k, pt) => H(9.5, 1.5 + Math.sin(pt * 9) * 0.8, 10, 4.5 - Math.sin(pt * 9) * 0.8),
    body: (k) => { const d = ease(k / 0.2) * (1 - ease((k - 0.85) / 0.15)); return { fwd: 3 * d, dip: 0.16 * d }; },
  },
  // the bar: a bottle off the shelf behind him, the pour, the glass slid along the counter, the rag, leaning on it
  fetch: { hands: (k) => H(5, -5.5, 6 + 5 * bump(k, 0.1, 0.9), 4 - 1.5 * bump(k, 0.1, 0.9)), item: 'bottle' },
  pour: { hands: (k) => H(8, -2.5, 6.5 + 0.5 * bump(k, 0.1, 0.9), 2.2), item: 'bottle' },
  serve: { hands: (k) => H(9, -6, lerp(7.5, 12.5, ease(k / 0.45)) - 5 * ease((k - 0.55) / 0.45), lerp(1.5, 4.5, ease((k - 0.55) / 0.45))) },
  rag: { hands: (k, pt) => H(9.5, -6, 11 + Math.cos(pt * 7) * 2.2, 2 + Math.sin(pt * 7) * 2.5), body: () => ({ fwd: 2.5, dip: 0.02 }) },
  lean: { hands: () => H(10, -7, 10, 7), body: (k, pt) => ({ fwd: 3, dip: 0.03, side: Math.sin(pt * 0.6) * 0.8 }) },
  // the pool player chalking his cue
  chalk: { hands: (k, pt) => H(6.5 + Math.sin(pt * 13) * 0.5, 2.5 + Math.cos(pt * 13) * 0.5, 5, 5) },
  // the dealer
  shuffle: { hands: (k, pt) => { const g = 1.4 + 1.3 * Math.abs(Math.sin(pt * 5)); return H(7, -g, 7, g); }, body: () => OVER, item: 'cards' },
  deal: {
    // one card a beat round the table, from his right to his left
    hands: (k) => {
      const b = Math.min(DEAL - 1, Math.floor(k * DEAL)), a = dealAngle(b), r = 5 * bump(k * DEAL - b, 0, 0.7);
      return H(6.5, -2.5, 6.5 + Math.cos(a) * r, 2 + Math.sin(a) * r);
    },
    body: () => OVER,
    item: 'cards',
  },
  chip: { hands: (k) => H(6.5, -2.2, 6.5 + 6 * bump(k, 0.1, 0.9), 2.2 - 2 * bump(k, 0.1, 0.9)), item: 'cards' },
  rake: { hands: (k) => { const e = ease(k); return H(lerp(13, 7, e), lerp(-7, -3, e), lerp(13, 7, e), lerp(7, 3, e)); }, body: (k) => ({ fwd: 2 * (1 - k) }) },
  // the pimp: a pinch from the pile onto the scale, a bag twisted shut, a finger licked
  weigh: { hands: (k, pt) => H(10.5, lerp(-5, 2.5, ease((frac(pt / 1.4) - 0.2) / 0.5)), 9, 4.5), body: () => OVER },
  bag: { hands: (k, pt) => { const s = Math.sin(pt * 8) * 0.7; return H(8, -1.5 + s, 8, 1.5 + s); }, body: () => OVER, item: 'bag' },
  lick: { hands: (k) => { const m = bump(k, 0.1, 0.8); return H(8.5, -3.5, lerp(9, 4.7, m), lerp(3, 1, m)); } },
  // the takings: a thumb wetted, a wad banded, laid in the case
  thumb: { hands: (k) => { const m = bump(k, 0.1, 0.8); return H(7, -2, lerp(8, 4.7, m), lerp(1, 0.8, m)); }, item: 'wad' },
  band: { hands: (k) => H(7.5, -1.6 - 0.8 * bump(k, 0.4, 0.6), 7.5, 1.6 + 0.8 * bump(k, 0.4, 0.6)), body: () => OVER, item: 'wad' },
  stack: { hands: (k) => { const m = bump(k, 0, 1); return H(7, -2, lerp(7.5, 12.5, m), lerp(1, 5, m)); }, item: 'wad' },
  // the toilets: at the bowl, shaken off, zipped up, hands washed, a look in the mirror
  pee: { hands: (k, pt) => { const j = Math.sin(pt * 2) * 0.3; return H(5.5, -1.4 + j, 5.5, 1.4 + j); } },
  shake: { hands: (k, pt) => { const j = Math.sin(pt * 34) * 0.9; return H(5.5, -1.4 + j, 5.5, 1.4 + j); } },
  zip: {
    hands: (k) => { const u = ease(k / 0.5), d = ease((k - 0.6) / 0.4); return H(lerp(5.5, 6, d), lerp(-1.4, -6, d), lerp(5.5, 4, u) + 2 * d, lerp(1.4, 0.5, u) + 5.5 * d); },
  },
  wash: { hands: (k, pt) => { const s = Math.sin(pt * 12) * 1.2; return H(10, -2 + s, 10, 2 - s); }, body: () => ({ fwd: 1.5, dip: 0.02 }) },
  mirror: {
    hands: (k) => { const m = bump(k, 0.15, 0.7); return H(4, -6.5, lerp(6, 0, m), lerp(6, 4, m)); },
    body: (k, pt) => ({ fwd: 1.5, twist: Math.sin(pt * 2.2) * 0.25 * bump(k, 0.1, 1) }),
  },
  // the boss's cigar: held on the armrest, drawn on, the smoke let out, the ash tapped, rolled between the fingers
  cigar: { hands: (k, pt) => H(5.5, -2, 5, 7.5 + Math.sin(pt * 1.1) * 0.3), item: 'cigar' },
  draw: { hands: (k) => { const m = drawn(k); return H(5.5, -2, lerp(5, 4.6, m), lerp(7.5, 1.4, m)); }, item: 'cigar' },
  blow: { hands: () => H(5.5, -2, 5, 7.5), body: (k) => ({ fwd: -0.8 * bump(k, 0, 1) }), item: 'cigar' },
  tap: {
    hands: (k) => { const m = ease(k / 0.3) * (1 - ease((k - 0.75) / 0.25)); return H(5.5, -2, lerp(5, 11, m), lerp(7.5, 6, m) - 0.8 * bump(k, 0.4, 0.5)); },
    item: 'cigar',
  },
  roll: { hands: (k, pt) => H(6.8, -0.8, 6.8, 1.6 + Math.sin(pt * 6) * 0.6), item: 'cigar' },
  // the couch: slumped, an arm along the backrest
  slump: { hands: (k, pt) => H(BACK[0], BACK[1], 8, 4 + Math.sin(pt * 0.8) * 0.3) },
  read: {
    // the magazine on his right knee; every few seconds a page turned over
    hands: (k, pt, t, seed) => { const f = pageTurn(pt, seed); return H(BACK[0], BACK[1], 10 - f, 3.5 - 4.5 * f); },
    item: 'magazine',
  },
  fiddle: {
    // his weapon: a blade's point under his nails, a club tossed up turning over and caught
    hands: (k, pt, t, seed, tool) => {
      if (tool === 'blade') return H(7.5, -1, 8 + Math.sin(pt * 9) * 0.7, 2.8);
      const u = frac(pt / TOSS);
      return H(BACK[0], BACK[1], 7, 4 - 1.5 * bump(u, 0, 0.2) + bump(u, 0.75, 0.9));
    },
  },
  talk: { hands: (k, pt) => H(BACK[0], BACK[1], 8 + Math.sin(pt * 4) * 2, 3 + Math.cos(pt * 3.3) * 2) },
  laugh: {
    hands: (k, pt) => H(BACK[0], BACK[1], 5 + Math.sin(pt * 15) * 0.4, 1.5),
    body: (k, pt) => ({ dip: 0.03 * Math.abs(Math.sin(pt * 14)), twist: 0.1 * Math.sin(pt * 7), fwd: 1.2 * bump(k, 0, 1) }),
  },
};

// the dealer's cards: DEAL a hand, beat b goes this way (rad from his front, + to his right)
export const DEAL = 4;
export const dealAngle = (b) => 0.9 - (1.8 * b) / (DEAL - 1);
// 0..1 how far the cigar is brought to the lips at time k of a draw
export const drawn = (k) => ease(k / 0.25) * (1 - ease((k - 0.75) / 0.25));
// 0..1 a page of the magazine being turned over, pt s into the read
export const pageTurn = (pt, seed) => bump(frac(pt / 2.8 + seed), 0.78, 1);
// s between two throws of a club tossed up and caught
export const TOSS = 1.7;

// what drives the render/PastimeArt.js pastime of gesture G at time k of its phase (t: the world's time)
export function gestureClock(G, k, t, seed) {
  if (G.clock === 'stroke') return poolClock(k * 0.999, seed);
  if (G.clock === 'once') return k * STRETCH;
  return t;
}

// ---- spots (px, rad): { x, y, face }
const ang = (p) => (p.body ? p.body.angle : p.angle || 0); // a prop's or a vehicle's angle (a plain { angle } in tests)
// a place on a piece of furniture: `place` [x, y] in its own frame, facing `face` deg in it
export function seatPlace(prop, place, face) {
  const c = Math.cos(ang(prop)), s = Math.sin(ang(prop));
  return { x: prop.x + place[0] * c - place[1] * s, y: prop.y + place[0] * s + place[1] * c, face: ang(prop) + (face * Math.PI) / 180 };
}

// standing in front of a fixture (its front is its +y), `gap` px off it, facing it
export function frontOf(prop, gap) {
  const a = ang(prop) + Math.PI / 2, d = (prop.def.h ?? prop.def.r ?? 10) / 2 + gap;
  return { x: prop.x + Math.cos(a) * d, y: prop.y + Math.sin(a) * d, face: a + Math.PI };
}

// his back against the wall behind (x, y) as seen facing `face`, on a plain stretch of it: never a door or a window
// (the next tile along when it is one). { x, y, face }: 9 px off the wall, facing away from it; or null
export function wallBehind(map, x, y, face) {
  const a = Math.round((face + Math.PI) / (Math.PI / 2)) * (Math.PI / 2);
  const dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (const s of [0, 1, -1]) {
    let tx = cx - dy * s, ty = cy + dx * s;
    for (let i = 0; i < 2 && !map.isBlocked(tx, ty); i++) {
      if (map.isWallChar(tx + dx, ty + dy)) {
        return { x: (tx + 0.5) * TILE + dx * (TILE / 2 - 9), y: (ty + 0.5) * TILE + dy * (TILE / 2 - 9), face: a + Math.PI };
      }
      if (map.isBlocked(tx + dx, ty + dy)) break;
      tx += dx; ty += dy;
    }
  }
  return null;
}

// the sides of a pool table one plays from: both ends and two places on each long side, `gap` px off the cushion
export function poolSpots(table, gap = 9) {
  const c = Math.cos(ang(table)), s = Math.sin(ang(table)), w = table.def.w / 2, h = table.def.h / 2;
  return [[-w - gap, 0, 0], [w + gap, 0, Math.PI], [-w / 2.5, -h - gap, Math.PI / 2], [w / 2.5, -h - gap, Math.PI / 2],
    [-w / 2.5, h + gap, -Math.PI / 2], [w / 2.5, h + gap, -Math.PI / 2]]
    .map(([lx, ly, f]) => ({ x: table.x + lx * c - ly * s, y: table.y + lx * s + ly * c, face: ang(table) + f }));
}

// beside a car (its long side nearer to (x, y), toward the middle), `gap` px off its body, facing it
export function besideCar(car, x, y, gap = 13) {
  const c = Math.cos(ang(car)), s = Math.sin(ang(car)), w = car.w, h = car.h;
  const lx = clamp((x - car.x) * c + (y - car.y) * s, -w * 0.3, w * 0.3);
  const side = (y - car.y) * c - (x - car.x) * s >= 0 ? 1 : -1, ly = side * (h / 2 + gap);
  return { x: car.x + lx * c - ly * s, y: car.y + lx * s + ly * c, face: ang(car) - side * Math.PI / 2 };
}
