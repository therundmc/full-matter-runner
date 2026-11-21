// What people do with themselves while all is calm. Guards with a job (level.jobs) and posted civilians
// (level.ambient.patrons) share the bar ones; bored guards and passers-by pick the others. Timing and spots only:
// the drawing is in render/PastimeArt.js.
//   pool   lining up shots over the table, one stroke per cycle     cue     waiting for his turn, cue upright
//   cards  a hand of cards held up                                  drink   a glass, raised now and then
//   watch  sitting back, hands on the knees, clapping now and then  dance   at her pole, on the beat (ai/Dance.js)
//   smoke  a cigarette, a drag now and then                         phone   his pager read
//   talk / listen  the two halves of a chat, turn about             cross   arms folded
//   stretch, wrist  a stretch, a look at his watch (one go)         piss    against a wall or at a toilet
//   pockets, bag   how a passer-by carries his hands                count   bills peeled off a wad, one by one
//   door   a doorman: arms folded, his eyes on whoever comes near   wipe    a bartender polishing a glass
//   sleep  lying on his cardboard until something wakes him   hood    leant on a parked car, a hand on its hood, smoking
//   arcade a game at the cabinet: the stick, the buttons; between two a slap on its side and a coin (arcadeAt)
//   laundry  his load out of the machine, shaken out, folded and laid on the pile, now and then a look at his watch
//          (laundryAt)
import { TILE } from '../Config.js';
import { clamp, angDiff, lerp, frac, bump, smooth, hash } from '../../engine/math.js';
import { dice } from '../systems/Rng.js';

const CYCLE = 5;     // s between two pool strokes
const STRIKE = 0.8;  // share of the cycle at which the cue hits the ball
const SIP = 7;       // s between two sips
const DRAG = 6.5;    // s between two drags on a cigarette
const TURN = 2.8;    // s each one talks in a chat
const CLAP = 11;     // s between two rounds of applause
export const STRETCH = 2.6; // s a stretch (or a look at his watch) takes
const OPEN_AIR = '_"~';     // floors a man relieves himself on, against a wall: concrete, grass, dirt
const REACH = 3 * TILE;     // how far he walks for it

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

// ---------------- the arcade ----------------
// A game every `round` s (one cabinet's player from another: seed); its last `between` s are the beat between two:
// lost, a slap on the cabinet's side, a look round, a coin in. In a game the stick is worked in bursts (stick -1 ..
// 1: hard left .. hard right) and the fire button hammered `press` times a second, with lulls.
export const ARCADE = { round: 32, between: 4.5, press: 6.5, slap: [0.05, 0.25], coin: [0.62, 0.9] };
export function arcadeAt(t, seed) {
  const A = ARCADE, u0 = t / A.round + seed, n = Math.floor(u0), u = u0 - n, end = 1 - A.between / A.round;
  if (u >= end) {
    const k = (u - end) / (1 - end);
    return { play: false, n, k, stick: 0, press: 0, slap: k >= A.slap[0] && k < A.slap[1], coin: k >= A.coin[0] && k < A.coin[1] };
  }
  const s = t * 2.3 + n * 1.7 + seed * 5;
  const busy = Math.sin(t * 0.9 + n) > -0.45; // a lull now and then
  const stick = busy ? clamp(Math.sin(s) * 0.75 + Math.sin(s * 3.3) * 0.45, -1, 1) : 0;
  const press = busy && frac(t * A.press + seed) < 0.45 ? 1 : 0;
  return { play: true, n, k: u / end, stick, press, slap: false, coin: false };
}

// ---------------- the laundry ----------------
// A man doing his washing at a top loader: piece after piece out of the drum (reach, pull), shaken out, folded in two
// then in four, laid on the pile on the next machine's lid (lay); every `pile`-th piece he lays on it and carries the
// whole pile over to his basket (carry). Every `pause`-th turn a look at his watch instead. Each turn lasts `each` s,
// a little more or less (by seed and turn); its phases end at these shares of it. Returns the turn n, k (0..1 into
// it), u (0..1 into its phase), the phase, pile (pieces on the pile now: carried off half way through a carry) and
// piece (which of the pieces of washing, render/PastimeArt.js PIECES, is in his hands).
export const LAUNDRY = {
  each: [4.6, 6.2], pause: 5, pile: 5,
  phases: [['reach', 0.16], ['pull', 0.3], ['shake', 0.44], ['fold', 0.8], ['lay', 0.94], ['back', 1]],
};
export function laundryAt(t, seed) {
  const L = LAUNDRY, len = (n) => L.each[0] + (L.each[1] - L.each[0]) * hash(seed * 3.1 + n * 1.7);
  // whole turns gone by (each of its own length), then how far into this one
  let n = 0, at = Math.max(0, t) + frac(seed) * len(0);
  for (let d = len(0); at >= d; d = len(++n)) at -= d;
  const k = at / len(n), piece = Math.floor(hash(n * 2.3 + seed) * 5);
  const laid = n - Math.floor(n / L.pause), held = laid % L.pile; // pieces laid before this turn; on the pile now
  if (n % L.pause === L.pause - 1) return { n, k, u: k, phase: 'watch', pile: held, piece };
  let phase = 'back', from = 0, u = 0;
  for (const [name, upTo] of L.phases) {
    if (k < upTo) { phase = name; u = (k - from) / (upTo - from); break; }
    from = upTo;
  }
  const full = held === L.pile - 1; // this piece tops the pile: the lot goes to the basket
  if (phase === 'lay' && full) phase = 'carry';
  const pile = phase === 'back' ? (full ? 0 : held + 1) : phase === 'carry' ? (u < 0.5 ? L.pile : 0) : held;
  return { n, k, u, phase, pile, piece };
}

// where a guard standing at (x, y) goes to relieve himself: { x, y, face, wall } or null. Out in a yard or an alley,
// against the nearest wall; on bathroom tiles, at the nearest urinal (squarely in front of it), else in front of the
// nearest toilet; nowhere else.
export function reliefSpot(map, props, x, y) {
  const c = map.at(Math.floor(x / TILE), Math.floor(y / TILE));
  if (c === '+') {
    let best = null, bd = REACH * 1.2;
    for (const p of props) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (p.def?.use === 'urinal' && !p.dead && d < bd) { bd = d; best = p; }
    }
    if (best) {
      const f = best.body.angle + Math.PI / 2; // the way it faces, off its wall
      return { x: best.x + Math.cos(f) * 17, y: best.y + Math.sin(f) * 17, face: f + Math.PI, wall: false };
    }
    for (const p of props) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (p.def?.use === 'toilet' && !p.dead && d < bd) { bd = d; best = p; }
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
  // slot: which of the men sharing the post he is (weights may differ per man); roll: the gameplay dice (Rng.dice)
  constructor(script, slot = 0, roll = dice(null)) {
    this.script = script;
    this.slot = slot;
    this.roll = roll;
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
    let r = this.roll.next() * pool.reduce((s, n) => s + this.weight(n), 0);
    for (const n of pool) if ((r -= this.weight(n)) <= 0) return n;
    return pool[pool.length - 1] ?? null;
  }

  // start act `name`; late: somewhere into its first phase (two men posted alike never start in step)
  begin(name, late = false) {
    this.act = name ? this.script.acts[name] : null;
    this.name = this.last = name || '';
    this.i = 0;
    if (this.act) this.enter();
    if (late) this.t = this.roll.rand(0, this.dur);
  }

  enter() { this.t = 0; this.dur = this.roll.rand(...this.phase.dur); }

  // start act `name` at its phase i, somewhere into it (how a level may open on him: a script's `open`)
  beginAt(name, i) {
    this.begin(name);
    this.i = Math.min(i, this.act.phases.length - 1);
    this.enter();
    this.t = this.roll.rand(0, this.dur);
  }

  // on to the next phase: 'phase' (also the first of the act that follows on, `next`), or 'act' once the act is over
  advance() {
    if (this.act && ++this.i < this.act.phases.length) { this.enter(); return 'phase'; }
    const next = this.act?.next;
    if (next) { this.begin(next); return 'phase'; }
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
// (body: fwd px, side px, twist rad, dip share of height lost, foot [which, x, y] a foot lifted), what is in the
// hands (data/posts.js HELD) and, `wpn(hands)`, his own weapon held at it ({ x, y, a, len, s, top, fist }: his
// torso's frame, a rad from straight ahead). `pastime`: the hands (and drawing) of that render/PastimeArt.js pastime, `clock`: what
// drives it ('stroke': one pool stroke over the phase, 'once': a one-go move over the phase, else the world's time).
// hands(k, pt, t, seed, tool): k 0..1 through the phase, pt s into it, t the world's time, tool his weapon's swing.
const H = (lx, ly, rx, ry) => ({ hl: { x: lx, y: ly }, hr: { x: rx, y: ry } });
const BACK = [-4, -13.5]; // an arm stretched along the back of the couch
const CROSSED = H(5.5, 2.2, 5.5, -2.2);
const OVER = { fwd: 2.5, dip: 0.02 }; // bent over a table, his hands on it

export const GESTURES = {
  // standing at his post
  cross: { pastime: 'cross' },
  wrist: { pastime: 'wrist', clock: 'once' },
  smoke: { pastime: 'smoke', item: 'cig' },
  hood: { pastime: 'hood', item: 'cig' }, // leant on a car, a hand on the hood behind him, smoking (body 'hood')
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
    hands: (k) => { const on = smooth(k / 0.15) * (1 - smooth((k - 0.85) / 0.15)); return H(0.5, -7, lerp(6, -3, on), lerp(6, 1.5, on)); },
    body: (k) => ({ twist: 0.3 * bump(k, 0.2, 0.45) - 0.3 * bump(k, 0.45, 0.75), dip: 0.02 * bump(k, 0.2, 0.8) }),
  },
  nod: { hands: () => CROSSED, body: (k) => ({ fwd: 2.2 * bump(k, 0.1, 0.55), dip: 0.05 * bump(k, 0.1, 0.55) }) },
  // the flame cupped in both hands at the lips
  light: { hands: (k, pt) => H(5.2, -1.5, 5.4 + Math.sin(pt * 3) * 0.2, 1.3), body: () => ({ fwd: 0.8, dip: 0.02 }), item: 'cig' },
  // the end of a cigarette flicked away: wound back, snapped out
  flick: { hands: (k) => { const o = bump(k, 0.3, 0.75); return H(5.5, -6, lerp(6.5, 12, o) - 1.5 * bump(k, 0, 0.3), lerp(5.5, 3, o)); }, item: 'cig' },
  ash: { hands: (k) => H(5.5, -6, 7.5 + 1.6 * bump(k, 0.3, 0.55), 5.5 - 1.2 * bump(k, 0.3, 0.55)), item: 'cig' },
  // bent to a car window, hands cupped against the glass
  peer: { hands: (k, pt) => H(11.5, -3.5, 11.5, 3.5 + Math.sin(pt) * 0.3), body: (k) => ({ fwd: 4 * smooth(k / 0.15), dip: 0.05 }) },
  // a can sent down the pavement by the right foot
  kick: {
    hands: () => H(0.5, -6.6, 0.5, 6.6),
    body: (k) => ({ foot: [1, 1 + 10 * bump(k, 0.2, 0.55) - 2 * bump(k, 0, 0.2), 3.6], twist: -0.12 * bump(k, 0.1, 0.6) }),
  },
  // down on a knee, both hands at the shoe
  tie: {
    hands: (k, pt) => H(9.5, 1.5 + Math.sin(pt * 9) * 0.8, 10, 4.5 - Math.sin(pt * 9) * 0.8),
    body: (k) => { const d = smooth(k / 0.2) * (1 - smooth((k - 0.85) / 0.15)); return { fwd: 3 * d, dip: 0.16 * d }; },
  },
  // the bar: a bottle off the shelf behind him, the pour, the glass slid along the counter, the rag, leaning on it
  fetch: { hands: (k) => H(5, -5.5, 6 + 5 * bump(k, 0.1, 0.9), 4 - 1.5 * bump(k, 0.1, 0.9)), item: 'bottle' },
  pour: { hands: (k) => H(8, -2.5, 6.5 + 0.5 * bump(k, 0.1, 0.9), 2.2), item: 'bottle' },
  serve: { hands: (k) => H(9, -6, lerp(7.5, 12.5, smooth(k / 0.45)) - 5 * smooth((k - 0.55) / 0.45), lerp(1.5, 4.5, smooth((k - 0.55) / 0.45))) },
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
  rake: { hands: (k) => { const e = smooth(k); return H(lerp(13, 7, e), lerp(-7, -3, e), lerp(13, 7, e), lerp(7, 3, e)); }, body: (k) => ({ fwd: 2 * (1 - k) }) },
  // the pimp: a pinch from the pile onto the scale, a bag twisted shut, a finger licked
  weigh: { hands: (k, pt) => H(10.5, lerp(-5, 2.5, smooth((frac(pt / 1.4) - 0.2) / 0.5)), 9, 4.5), body: () => OVER },
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
    hands: (k) => { const u = smooth(k / 0.5), d = smooth((k - 0.6) / 0.4); return H(lerp(5.5, 6, d), lerp(-1.4, -6, d), lerp(5.5, 4, u) + 2 * d, lerp(1.4, 0.5, u) + 5.5 * d); },
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
    hands: (k) => { const m = smooth(k / 0.3) * (1 - smooth((k - 0.75) / 0.25)); return H(5.5, -2, lerp(5, 11, m), lerp(7.5, 6, m) - 0.8 * bump(k, 0.4, 0.5)); },
    item: 'cigar',
  },
  roll: { hands: (k, pt) => H(6.8, -0.8, 6.8, 1.6 + Math.sin(pt * 6) * 0.6), item: 'cigar' },
  // CUEBALL at his desk: a fist ground into the other palm, twice; his shades pushed back up his nose
  knuckles: { hands: (k) => { const m = bump(k, 0.1, 0.5) + bump(k, 0.5, 0.9); return H(5.4 + 0.4 * m, -0.8 + 0.3 * m, 5.4, 0.8 - 0.3 * m); } },
  shades: { hands: (k) => { const m = smooth(k / 0.35) * (1 - smooth((k - 0.7) / 0.3)); return H(4.6, -1.3, lerp(4.8, 5.6, m), lerp(1.3, 4.4, m)); } },
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
  // ---- the prologue (data/posts.js arson, rummage, lookout)
  // the matchbox in the left hand, a match pinched in the right, turned over and over
  box: { hands: (k, pt) => H(6.2, -1.6, 6.4 + Math.sin(pt * 2.3) * 0.4, 1.6 + Math.cos(pt * 3.1) * 0.3), item: 'matchbox' },
  // ... shaken by his ear
  rattle: {
    hands: (k, pt) => { const up = bump(k, 0, 1), s = Math.sin(pt * 26) * 0.7 * up; return H(lerp(6.2, 2, up) + s, lerp(-1.6, -7.2, up), 4.5, 6); },
    body: (k) => ({ twist: -0.12 * bump(k, 0, 1) }),
    item: 'matchbox',
  },
  hips: { hands: () => H(1, -7, 1, 7) },
  // the petrol wiped off his hands down his thighs
  smear: {
    hands: (k, pt) => H(lerp(5, 0.5, frac(pt / 0.55)), -5.6, lerp(5, 0.5, frac(pt / 0.55 + 0.5)), 5.6),
    body: () => ({ fwd: 1, dip: 0.02 }),
  },
  // the match drawn along the side of the box: it flares (fx 'strike') ...
  strike: {
    hands: (k) => { const r = smooth((k - 0.2) / 0.22); return H(6.2, -1.6, lerp(6.2, 10, r), lerp(-0.6, 2.2, r)); },
    body: (k) => ({ fwd: 0.8 * bump(k, 0.1, 0.9) }),
    item: 'match',
  },
  // ... the flame cupped in the left hand, in front of his face
  shield: { hands: (k, pt) => H(7.8, -0.6 + Math.sin(pt * 5) * 0.15, 7, 1.4), body: () => ({ fwd: 1, dip: 0.02 }), item: 'match' },
  // ... and let fall on the petrol at his feet (fx 'drop', at MATCH_FALLS), the hands back at his sides
  drop: {
    hands: (k) => {
      const out = smooth(k / 0.3), back = smooth((k - 0.5) / 0.5);
      return H(lerp(7.8, 2, back), lerp(-0.6, -6.5, back), lerp(lerp(7, 11, out), 2, back), lerp(lerp(1.4, 3.6, out), 6.5, back));
    },
    body: (k) => ({ fwd: 1.8 * bump(k, 0, 0.55), dip: 0.03 * bump(k, 0, 0.55) }),
  },
  // the whoosh: an arm thrown up before his face, leaning away from it
  shy: {
    hands: (k) => { const u = smooth(k / 0.15) * (1 - smooth((k - 0.65) / 0.35)); return H(lerp(1, 6.5, u), lerp(-7, -0.5, u), 1, 7); },
    body: (k) => { const u = smooth(k / 0.15) * (1 - smooth((k - 0.65) / 0.35)); return { fwd: -2.5 * u, twist: -0.18 * u }; },
  },
  // bent over a drawer pulled out under the worktop, both hands digging through it
  dig: {
    hands: (k, pt) => H(10.5 + Math.sin(pt * 7) * 1.6, -2.6 + Math.cos(pt * 5) * 0.8, 10.5 + Math.cos(pt * 6.3) * 1.6, 2.6 + Math.sin(pt * 4.7) * 0.8),
    body: () => ({ fwd: 2.5, dip: 0.04 }),
  },
  // something pulled out and flung over his right shoulder (fx 'junk', at TOSSED)
  toss: {
    hands: (k) => {
      const pull = smooth(k / 0.3), fling = smooth((k - 0.3) / 0.25), back = smooth((k - 0.6) / 0.4);
      return H(9, -2.5, lerp(lerp(lerp(10.5, 6, pull), -4, fling), 2, back), lerp(lerp(lerp(2.6, 5, pull), 9, fling), 6.5, back));
    },
    body: (k) => ({ fwd: 1.5 * (1 - bump(k, 0.2, 0.8)), twist: 0.35 * bump(k, 0.2, 0.75) }),
  },
  // the fridge door held open with the left hand, the right one going through the shelves
  fridge: {
    hands: (k, pt) => H(6, -9, 12.5 + Math.sin(pt * 3) * 1.2, 1.5 + Math.cos(pt * 2.2) * 2.5),
    body: () => ({ fwd: 2.5, dip: 0.04 }),
  },
  // waiting with his pistol out, low in his right hand, a cigarette in the left brought up for a drag now and then
  armed: { hands: (k, pt, t, seed) => { const d = drag(t, seed); return H(6.5 - d * 0.5, -5.5 + d * 4, 3, 6.3); }, item: 'cig', wpn: (h) => low(h) },
  armedAsh: { hands: (k) => { const f = bump(k, 0.3, 0.55); return H(7.5 + 1.6 * f, -5.5 + 1.2 * f, 3, 6.3); }, item: 'cig', wpn: (h) => low(h) },
  // the gun brought up in front of him, the slide drawn back an inch by the left hand to see the round
  check: {
    hands: (k) => H(8.6 - 1.6 * bump(k, 0.35, 0.75), -0.4, 7.4, 1.4),
    wpn: (h) => ({ x: h.hr.x, y: h.hr.y, a: -0.12, len: 1, s: 1, top: 0, fist: true }),
  },
};

// a gun held low at his side, pointing at the floor ahead of him
const low = (h) => ({ x: h.hr.x, y: h.hr.y, a: 0.35, len: 1, s: 1, top: 0, fist: true });
// share of the 'drop' phase at which the match leaves his fingers, of the 'toss' one at which the thing flies off
export const MATCH_FALLS = 0.35;
export const TOSSED = 0.55;

// the dealer's cards: DEAL a hand, beat b goes this way (rad from his front, + to his right)
export const DEAL = 4;
export const dealAngle = (b) => 0.9 - (1.8 * b) / (DEAL - 1);
// 0..1 how far the cigar is brought to the lips at time k of a draw
export const drawn = (k) => smooth(k / 0.25) * (1 - smooth((k - 0.75) / 0.25));
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

// standing at the side of a piece of furniture that faces him (he looks along `face`), square in the middle of that
// side, `gap` px off it, facing it
export function sideOf(prop, face, gap) {
  const a = ang(prop), k = Math.round((face + Math.PI - a) / (Math.PI / 2)), n = a + (k * Math.PI) / 2;
  const half = (k % 2 ? prop.def.h ?? 2 * prop.def.r : prop.def.w ?? 2 * prop.def.r) / 2, d = half + gap;
  return { x: prop.x + Math.cos(n) * d, y: prop.y + Math.sin(n) * d, face: n + Math.PI };
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

// Leaning on a parked car's hood (data/posts.js HOOD): his backside against its flank by the hood, or against its
// nose, `gap` px off the bodywork, facing away from it. The place nearest (x, y) that ok(x, y) allows (on the
// sidewalk, never out in the road), or null. { x, y, face, car, at (where the car stood) }
export function hoodSpot(car, x, y, gap, ok = () => true) {
  const a = ang(car), c = Math.cos(a), s = Math.sin(a), [h0, h1] = car.m.hood;
  const mid = (h0 + h1) / 2 - car.w / 2; // the hood's middle along the car, from its centre
  const spots = [[mid, car.h / 2 + gap, Math.PI / 2], [mid, -car.h / 2 - gap, -Math.PI / 2], [car.w / 2 + gap, 0, 0]]
    .map(([lx, ly, f]) => ({ x: car.x + lx * c - ly * s, y: car.y + lx * s + ly * c, face: a + f, car, at: { x: car.x, y: car.y } }))
    .filter((p) => ok(p.x, p.y));
  spots.sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y));
  return spots[0] ?? null;
}

// is a lean on that car over? It drives off or was shoved (it is no longer where it stood, `at`), it was struck a
// moment ago (Vehicle.flash), it burns or blew up
export const leanBroken = (car, at) => !!(car.dead || car.moving || car.burning || car.exploded || car.flash > 0
  || Math.hypot(car.x - at.x, car.y - at.y) > 2);
