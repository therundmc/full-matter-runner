// A guard's job at his post (level.jobs, data/posts.js): the routine played act by act, phase by phase, his seat
// and his posture on it, the spots, the gestures, what the phases give off (a sound, smoke, a match, junk), what
// falls from his hands when it kicks off. The drawing in entities/PostArt.js. Functions of the guard (`me`),
// DOM-free.
import { ENEMY, AI, TILE, CAT, MASK, BODY_SCALE } from '../../Config.js';
import { rand, angDiff, chance, clamp } from '../../../engine/math.js';
import { dice } from '../../systems/Rng.js';
import { reliefSpot, Routine, GESTURES, gestureClock, seatPlace, frontOf, wallBehind, sideOf, poolSpots, besideCar,
  hoodSpot, leanBroken, STRIKE, drawn, TOSS, MATCH_FALLS, TOSSED } from '../../ai/Pastimes.js';
import { pastimeHands } from '../../render/PastimeArt.js';
import { POSTS, HELD, HOOD } from '../../data/posts.js';
import { FLOATS } from '../../data/destruction.js';
import { spriteOpt } from '../../../engine/Assets.js';
import { WATCHFUL, S } from './States.js';

const { Body, Bounds } = Matter;

const STANDOFF = 26; // px off his seat where a seated man stands up
const JUNK = 10;  // things a man turning a place over leaves lying on its floor (the rest he throws are papers)

// a pastime at his post: he is at it when the level opens and goes back to it as long as all is calm
export function takeJob(me, job) {
  if (!job) return;
  me.job = job;
  me.boss = job === 'boss';
  me.activity = job;
  me.activityT = dice(me.world).rand(8, 14);
  const S = POSTS[job];
  if (!S) return;
  me.script = S;
  if (S.seat) {
    // on his seat from the start; he stands up just off it
    const seat = takeSeat(me, S.seat);
    if (seat) {
      me.seat = seat;
      me.home = standOff(me, seat);
      Body.setPosition(me.body, seat);
      me.angle = seat.face;
      me.posture = 1; me.postureOf = S.body; me.onSpot = true;
      me.seatThrough();
    }
  } else if (S.front) {
    // his post: square in the middle of the side he faces of what he works at, his hands on it
    const p = me.nearest(S.front, me, 2 * TILE);
    if (p) {
      const f = sideOf(p, me.home.angle, me.radius + 1);
      me.home = { x: f.x, y: f.y, angle: f.face };
      Body.setPosition(me.body, f);
      me.angle = f.face;
    }
  } else if (S.body === 'wall') {
    // his post: his back against a plain stretch of the wall behind him
    const w = wallBehind(me.world.map, me.x, me.y, me.home.angle);
    if (w) {
      me.home = { x: w.x, y: w.y, angle: w.face };
      Body.setPosition(me.body, w);
      me.angle = w.face;
    }
  }
  if (S.rest === 'desk' && me.seat) {
    // his weapon stood on the floor against the end of the desk, on his left, the barrel on its edge (seen from
    // above it shows short: len); a smoker's ashtray on the arm of his chair (the script's `ash`)
    const desk = me.nearest('desk', me.seat, 3 * TILE), f = me.seat.face;
    if (desk) {
      const lx = Math.cos(f - Math.PI / 2), ly = Math.sin(f - Math.PI / 2), out = desk.def.w / 2 + 8; // his left
      me.rest = { x: desk.x + lx * out - Math.cos(f) * 3, y: desk.y + ly * out - Math.sin(f) * 3, a: f + Math.PI / 2 - 0.15, len: 0.6 };
    }
    if (S.ash) me.ashtray = { x: me.seat.x - Math.sin(f) * 10.5 + Math.cos(f) * 1.5, y: me.seat.y + Math.cos(f) * 10.5 + Math.sin(f) * 1.5 };
  }
  me.routine = new Routine(S, me.seat?.slot ?? 0, dice(me.world));
  if (!S.walk) me.routine.begin(me.routine.pick(), true);
  if (S.open && dice(me.world).chance(S.open.odds)) me.openAt(S.open);
}

// the level opens on him at act O.act, phase O.phase, already in place there (a patrol caught at a halt: on the
// spot of the act's first phase, in its body)
export function openAt(me, O) {
  const act = me.script.acts[O.act], first = act.phases[0], ph = act.phases[Math.min(O.phase, act.phases.length - 1)];
  const spot = spotFor(me, first);
  if (!spot) return;
  me.routine.beginAt(O.act, O.phase);
  me.activity = me.job;
  me.pauseT = Infinity;
  me.workSpot = spot; me.onSpot = me.atPost = true;
  Body.setPosition(me.body, spot);
  me.angle = spot.face;
  const body = ph.body ?? me.script.body;
  if (body && body !== 'stand') { me.posture = 1; me.postureOf = body; me.leanAt = spot; }
}

// the prop of `type` nearest to p within `reach` px
export function nearest(me, type, p, reach) {
  let best = null, bd = reach;
  for (const q of me.world.props) {
    const d = q.type === type && !q.dead ? Math.hypot(q.x - p.x, q.y - p.y) : Infinity;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// the free place nearest him on the nearest piece of furniture his job sits him on
function takeSeat(me, def) {
  const prop = me.nearest(def.prop, me, 3 * TILE);
  if (!prop) return null;
  const taken = me.world.enemies.filter((e) => e.seat);
  const places = def.places.map((pl, slot) => ({ ...seatPlace(prop, pl, def.face), side: pl[2] ?? 1, slot }))
    .filter((s) => !taken.some((e) => Math.hypot(e.seat.x - s.x, e.seat.y - s.y) < 4));
  places.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
  return places[0] ?? null;
}

// where he stands up from his seat: off its front, else off a side (a desk in front of him), else behind
function standOff(me, seat) {
  for (const da of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const a = seat.face + da, x = seat.x + Math.cos(a) * STANDOFF, y = seat.y + Math.sin(a) * STANDOFF;
    if (!me.world.map.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE)) && !furnitureAt(me, x, y, me.radius)) {
      return { x, y, angle: seat.face };
    }
  }
  return { x: seat.x, y: seat.y, angle: seat.face };
}

// a piece of furniture whose box comes within r px of (x, y)
function furnitureAt(me, x, y, r) {
  const box = { min: { x: x - r, y: y - r }, max: { x: x + r, y: y + r } };
  return me.world.props.some((p) => p.body && !p.dead && !p.def.hung && !p.def.fixture && Bounds.overlaps(p.body.bounds, box));
}

// on his seat, on his way onto it or off it, he goes through the furniture (the sofa would shove him off it)
export function seatThrough(me) {
  const st = me.seat;
  if (!st || me.knocked > 0) return;
  const near = me.posture > 0 || (me.activity === me.job && me.aware === 0 && Math.hypot(st.x - me.x, st.y - me.y) < 40);
  const want = near || (me.through && furnitureAt(me, me.x, me.y, me.radius - 2));
  if (want === me.through) return;
  me.through = want;
  me.body.collisionFilter = { category: CAT.CHAR, mask: want ? MASK.CHAR & ~CAT.PROP : MASK.CHAR, group: 0 };
}

// the body the phase under way asks for ('seat' | 'desk' | 'wall'), while all is calm and he is at it
function wantBody(me) {
  const ph = me.routine?.phase;
  if (!ph || me.activity !== me.job || !me.onSpot || !me.atEase || !me.quiet) return null;
  const b = ph.body ?? me.script.body;
  // against a car: once he has turned his back to it (he backs onto it), while it stays put
  if (b === 'hood') {
    const s = me.workSpot;
    if (!s?.car || (me.posture <= 0 && Math.abs(angDiff(me.angle, s.face)) > HOOD.turned)) return null;
  }
  return b && b !== 'stand' ? b : null;
}

// sitting down (leaning back) at the spot, getting up when something is up or the job goes on elsewhere. True
// while a seated man is still getting up: no step, no blow, no shot till he is on his feet.
export function updatePosture(me, dt) {
  if (!me.script) return false;
  const want = wantBody(me), S = me.script;
  if (want && (want === me.postureOf || me.posture <= 0)) {
    if (want === 'hood' && me.posture <= 0) { me.leanAt = me.workSpot; me.world.sound('hoodLean', me.x, me.y, 0.5); }
    me.postureOf = want;
    me.posture = Math.min(1, me.posture + dt / (want === 'wall' ? 0.4 : want === 'hood' ? HOOD.settle : S.sit ?? 0.8));
    return false;
  }
  if (me.posture <= 0) return false;
  // off a wall or a car he pushes himself up and goes on at once; out of a seat he stands up first
  const seated = me.postureOf !== 'wall' && me.postureOf !== 'hood';
  me.posture = Math.max(0, me.posture - dt / (seated ? S.rise ?? 0.5 : me.postureOf === 'hood' ? HOOD.off : 0.35));
  if (!seated || me.posture <= 0) return false;
  // up and off the front of it as he rises, turning to what called him
  const h = me.home, d = Math.hypot(h.x - me.x, h.y - me.y);
  me.steer(h.x - me.x, h.y - me.y, Math.min(1, d / 12), 0.25);
  const tg = me.lastKnown ?? me.stim;
  if (tg) me.faceTo(tg.x, tg.y, 3, dt);
  return true;
}

// the phase under way while he is at it, or null
export function gestureOn(me) {
  const R = me.routine;
  return R && R.act && me.activity === me.job && me.onSpot && me.atEase && me.stow >= 0.6 ? R.phase : null;
}

// where the hands are at phase ph, in the gesture's own frame (render: PostArt mirrors the drawing itself)
export function rawHands(me, ph) {
  const G = GESTURES[ph.g] ?? {}, R = me.routine, t = me.world.time;
  return G.hands ? G.hands(R.k, R.t, t, me.seed, me.def.swing)
    : pastimeHands(G.pastime ?? ph.g, gestureClock(G, R.k, t, me.seed), me.seed);
}

// ... and on his body: mirrored for the man on the other side of a couch (his other arm along the backrest)
export function gestureHands(me, ph) {
  const h = me.rawHands(ph);
  if (!h || (me.seat?.side ?? 1) > 0) return h;
  return { hl: { x: h.hr.x, y: -h.hr.y }, hr: { x: h.hl.x, y: -h.hl.y } };
}

// CharacterAnim.postPose: how his body is at it, or null (his plain stance)
export function postBody(me) {
  if (!me.script || me.vaulting || me.knocked > 0) return null;
  const ph = me.gestureOn, R = me.routine, side = me.seat?.side ?? 1;
  if (!ph && me.posture <= 0) return null;
  const G = ph && GESTURES[ph.g], b = G?.body?.(R.k, R.t, me.seed) ?? {};
  const B = {
    base: me.postureOf, w: me.posture, face: me.postureOf === 'hood' ? me.leanAt?.face : undefined, fwd: b.fwd ?? 0, side: (b.side ?? 0) * side, twist: (b.twist ?? 0) * side,
    dip: b.dip ?? 0, foot: b.foot ? [side > 0 ? b.foot[0] : 1 - b.foot[0], b.foot[1], b.foot[2] * side] : null,
    hands: ph ? me.gestureHands(ph) : null, wpn: null,
    // (a world point, in pose px: he is drawn BODY_SCALE bigger)
    rest: me.rest && me.posture > 0 ? { x: (me.rest.x - me.x) / BODY_SCALE, y: (me.rest.y - me.y) / BODY_SCALE, a: me.rest.a, len: me.rest.len } : null,
  };
  if (G?.wpn && B.hands) B.wpn = G.wpn(B.hands); // his weapon in his hand at it (the corridor's man, his pistol)
  if (ph?.g === 'fiddle' && B.hands) {
    // his own weapon in his hands: a blade pointed at his nails, a club turning over in the air
    const hr = B.hands.hr;
    if (me.def.swing === 'blade') B.wpn = { x: hr.x, y: hr.y, a: -1.75 * side, len: 0.8, s: 1, top: 0 };
    else {
      const u = (R.t / TOSS) % 1, k = clamp((u - 0.15) / 0.6, 0, 1), up = Math.sin(Math.PI * k);
      B.wpn = { x: hr.x + 2 * up, y: hr.y - 2 * up * side, a: (-0.5 + Math.PI * 2 * k) * side, len: 1, s: 1 + 0.35 * up, top: up > 0.1 ? 1 : 0 };
    }
  }
  return B;
}

// can he play act `name` here: all it needs is at hand (a car to look into, a customer to serve, a dancer...)
export function canPlay(me, name) {
  return me.script.acts[name].phases.every((ph) => (!ph.at || ph.at === 'post' || ph.at === 'here' || spotFor(me, ph))
    && (ph.look !== 'dance' || dancer(me)));
}

// the nearest dancer in sight
function dancer(me) {
  let best = null, bd = 7 * TILE;
  for (const c of me.world.chars) {
    if (!c.isCivilian || !c.alive || c.brain?.activity !== 'dance') continue;
    const d = Math.hypot(c.x - me.x, c.y - me.y);
    if (d < bd && me.world.lineOfSight(me.x, me.y, c.x, c.y)) { bd = d; best = c; }
  }
  return best;
}

// where phase ph is done { x, y, face }, or null when there is no such place
function spotFor(me, ph) {
  const w = me.world, h = me.home, R = 4 * TILE;
  switch (ph.at ?? 'post') {
    case 'post': return me.seat ?? { x: h.x, y: h.y, face: h.angle };
    case 'here': return { x: me.x, y: me.y, face: me.angle };
    case 'toilet': { const s = reliefSpot(w.map, w.props, h.x, h.y); return s && !s.wall ? s : null; }
    case 'wall': { const s = reliefSpot(w.map, w.props, me.x, me.y); return s?.wall ? s : null; }
    case 'car': {
      let best = null, bd = R;
      for (const v of w.props) {
        const d = v.isVehicle && !v.moving && !v.dead ? Math.hypot(v.x - me.x, v.y - me.y) - v.w / 2 : Infinity;
        if (d < bd) { bd = d; best = v; }
      }
      return best && besideCar(best, me.x, me.y);
    }
    case 'hood': {
      // his back to the nearest parked car's hood, on the sidewalk side, nobody else leaning there already
      const ok = (x, y) => {
        const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
        return !w.map.isBlocked(cx, cy) && !'=-'.includes(w.map.at(cx, cy));
      };
      let best = null, bd = HOOD.reach;
      for (const v of w.props) {
        if (!v.isVehicle || v.moving || v.dead || v.burning || v.exploded || v.armoured || v === me.shunned) continue;
        if (w.enemies.some((e) => e !== me && e.alive && e.workSpot?.car === v)) continue;
        const s = hoodSpot(v, me.x, me.y, ENEMY.radius + HOOD.gap, ok), d = s ? Math.hypot(s.x - me.x, s.y - me.y) : Infinity;
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    }
    case 'stool': {
      // behind the counter, square in front of a customer having a drink at it
      const ax = -Math.sin(h.angle), ay = Math.cos(h.angle);
      const drinkers = w.chars.filter((c) => c.isCivilian && c.alive && c.brain?.activity === 'drink' && !c.left
        && Math.abs((c.x - h.x) * ax + (c.y - h.y) * ay) < 2.5 * TILE && Math.abs((c.x - h.x) * ay - (c.y - h.y) * ax) < 2 * TILE);
      if (!drinkers.length) return null;
      const c = drinkers[Math.floor(dice(me.world).next() * drinkers.length)], along = (c.x - h.x) * ax + (c.y - h.y) * ay;
      return { x: h.x + ax * along, y: h.y + ay * along, face: h.angle };
    }
    case 'pool': {
      // another side of the table, nobody standing there
      const table = me.nearest('pool_table', h, R);
      if (!table) return null;
      const free = poolSpots(table, me.radius + 1).filter((s) => Math.hypot(s.x - me.x, s.y - me.y) > 24
        && !w.map.isSolid(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) && !furnitureAt(me, s.x, s.y, me.radius - 2)
        && !w.chars.some((c) => c !== me && c.alive && Math.hypot(c.x - s.x, c.y - s.y) < 22));
      return free.length ? free[Math.floor(dice(me.world).next() * free.length)] : null;
    }
    default: { const p = me.nearest(ph.at, h, R); return p && frontOf(p, me.radius + 1); } // a sink, a fridge...
  }
}

// a new act of his job (at a halt on his round only one, then he walks on)
function nextAct(me) {
  const R = me.routine;
  if (me.state === S.PATROL) { me.pauseT = 0; me.activity = 'walk'; return; }
  if (!me.script.stay && me.activityT <= 0) { me.pickActivity(); if (me.activity !== me.job) return; }
  R.begin(R.pick((n) => me.canPlay(n)));
  me.startPhase();
}

// a phase begins: a new spot if it says where, its line
export function startPhase(me) {
  const R = me.routine, ph = R.phase;
  if (!ph) return;
  if (ph.at || R.i === 0) me.workSpot = null;
  me.fxT = 0;
  if (ph.say && chance(ph.say[1]) && me.say(ph.say[0])) {
    me.world.sound('mutter', me.x, me.y, 0.5, { pitch: me.voice });
    // the other man at the same job answers it (a laugh at a joke)
    const mate = ph.answer && me.world.enemies.find((e) => e !== me && e.alive && e.job === me.job && e.atEase
      && Math.hypot(e.x - me.x, e.y - me.y) < 3 * TILE);
    if (mate) mate.routine.cue(ph.answer, R.dur + dice(me.world).rand(0.1, 0.4));
  }
}

// At his post, the routine of his job (data/posts.js): to the spot of each phase, then at it, phase by phase
export function work(me, dt) {
  const R = me.routine;
  if (!me.quiet && !WATCHFUL.has(me.job)) { me.pickActivity(); return; }
  me.activityT -= dt;
  if (!R.act && !R.cued) { nextAct(me); if (me.activity !== me.job || !R.act) return; }
  const ph = R.phase;
  if (ph && !me.workSpot) {
    me.workSpot = spotFor(me, ph);
    me.errandT = 0;
    if (!me.workSpot) { me.onSpot = false; if (R.advance() === 'phase') me.startPhase(); return; }
  }
  // the car he leans on drives off, is struck or catches fire: he is off it and never goes back to it
  if (me.workSpot?.car && leanBroken(me.workSpot.car, me.workSpot.at)) {
    me.shunned = me.workSpot.car;
    R.act = null; me.workSpot = null; me.onSpot = false;
    nextAct(me);
    return;
  }
  const s = me.workSpot ?? { x: me.x, y: me.y, face: me.angle }, d = Math.hypot(s.x - me.x, s.y - me.y);
  me.onSpot = d < 10 || (me.posture > 0 && me.onSpot);
  me.atPost = me.onSpot;
  if (!me.onSpot) {
    // a spot he cannot get to (somebody standing there, something in the way) is given up
    if ((me.errandT += dt) > AI.relief.giveUp) { me.workSpot = null; if (R.advance() === 'phase') me.startPhase(); return; }
    // a few steps in plain sight (along behind a counter the grid takes for furniture): straight there
    if (d < 3 * TILE && me.world.lineOfSight(me.x, me.y, s.x, s.y)) {
      me.steer(s.x - me.x, s.y - me.y, ENEMY.walkSpeed * 0.8, 0.15);
      me.faceAngle(Math.atan2(s.y - me.y, s.x - me.x), 4, dt);
    } else me.travel(dt, s.x, s.y, ENEMY.walkSpeed, { doors: true, near: 6 });
    return;
  }
  if (d > 1) me.steer(s.x - me.x, s.y - me.y, Math.min(0.5, d / 16), 0.2); else me.halt();
  me.faceAngle(lookFor(me, ph, s), ph?.look === 'sweep' ? 1.2 : 2.5, dt);
  const body = ph && (ph.body ?? me.script.body);
  if (body && body !== 'stand' && me.posture < 1) return; // sitting down, his back to the wall first
  me.holding = (ph && GESTURES[ph.g]?.item) || null;
  const k0 = R.k, ev = R.step(dt);
  if (ph) postFx(me, ph, k0, ev ? 1 : R.k, dt);
  if (ev === 'phase') me.startPhase();
  else if (ev === 'act') { me.workSpot = null; nextAct(me); }
}

// where his eyes go at phase ph done at spot s
function lookFor(me, ph, s) {
  switch (ph?.look) {
    case 'sweep': return s.face + Math.sin(me.world.time * 0.42 + me.seed) * 1.05;
    case 'glance': return s.face + Math.sin(me.world.time * 0.5 + me.seed) * 0.4;
    case 'back': return s.face + Math.PI;
    case 'dance': { const c = dancer(me); return c ? Math.atan2(c.y - me.y, c.x - me.x) : s.face; }
    default: break;
  }
  if (!me.script.gaze) return s.face;
  // a doorman: his eyes on whoever comes near, a nod as he first looks at him
  const base = s.face + Math.sin(me.t * 0.5 + me.seed) * 0.25, a = me.gaze(base), on = a !== base;
  if (on && !me.eyeOn && me.nodT <= 0 && me.script.acts.nod) { me.routine.cue('nod', 0.4); me.nodT = 20; }
  me.eyeOn = on;
  return a;
}

// a point of his own frame (px ahead, to his right) in the world
export function ahead(me, fwd, right = 0) {
  const c = Math.cos(me.angle), s = Math.sin(me.angle);
  return { x: me.x + c * fwd - s * right, y: me.y + s * fwd + c * right };
}

// what phase ph gives off between k0 and k1 of it: its sound, a light, smoke, what flies off
function postFx(me, ph, k0, k1, dt) {
  const w = me.world, at = (k) => k0 < k && k1 >= k;
  const every = (s) => { if ((me.fxT -= dt) > 0) return false; me.fxT = s; return true; };
  if (ph.sound && at(ph.sound[1])) w.sound(ph.sound[0], me.x, me.y, ph.sound[2], { pitch: ph.sound[3] });
  switch (ph.fx) {
    case 'ember': if (drawn(k1) > 0.5 && every(0.1)) { const p = me.ahead(4, 2); w.light(p.x, p.y, 34, '#ff7a2a', 0.16); } break;
    case 'flame': if (every(0.08)) { const p = me.ahead(7); w.light(p.x, p.y, 20, '#ff9a40', 0.12); } break;
    case 'cloud':
      // a slow thick cloud rolled out of his mouth, in a few breaths
      for (const k of [0.05, 0.25, 0.45]) {
        if (at(k)) w.smoke?.breath(me, 'cloud');
      }
      break;
    case 'ash': if (at(0.45)) { const p = me.hand(ph); w.particles.dust(p.x, p.y, 3, 1, '#8a8a90', { speed: 5, size: 1.2, life: 1.2, alpha: 0.55 }); } break;
    case 'butt': if (at(0.5)) { const p = me.ahead(9, 3); dropSmoke(me, p.x, p.y, me.angle + rand(-0.3, 0.3), rand(90, 130), 'butt'); } break;
    case 'stream': if (k1 > 0.1 && k1 < 0.93 && every(0.55)) w.sound('splash', me.x, me.y, 0.12, { pitch: rand(1.7, 2) }); break;
    case 'tap': if (every(0.7)) w.sound('splash', me.x, me.y, 0.16, { pitch: 1.2 }); break;
    case 'can': {
      const img = spriteOpt('items/can');
      if (img && at(0.38)) {
        const p = me.ahead(8, 3.6);
        w.particles.shard(img, p.x, p.y, me.angle + rand(-0.25, 0.25), rand(150, 210), { z: 2, vz: 70, bounce: 0.45, spin: rand(-12, 12) });
        w.sound('metal', p.x, p.y, 0.35, { pitch: 1.8 });
      }
      break;
    }
    case 'stroke':
      if (at(STRIKE)) {
        const p = me.ahead(30);
        w.sound('pool', p.x, p.y, 0.8);
        w.events.emit('poolStroke', p);
      }
      break;
    case 'chip': if (at(0.5)) w.sound('clack', me.x, me.y, 0.3, { pitch: 1.5 }); break;
    case 'strike': {
      // the match takes: a flare that lights his face, a few sparks, then its small flame
      const p = me.hand(ph);
      if (at(0.42)) { w.light(p.x, p.y, 72, '#ffd27a', 0.35); w.particles.fire(p.x, p.y, 4, 26, { size: [1, 2.2], life: [0.1, 0.3], rise: 30 }); }
      else if (k1 > 0.42 && every(0.07)) w.light(p.x, p.y, rand(26, 32), '#ffa040', 0.12);
      break;
    }
    case 'match': if (every(0.07)) { const p = me.hand(ph); w.light(p.x, p.y, rand(26, 32), '#ffa040', 0.12); } break;
    case 'drop':
      if (k1 < MATCH_FALLS && every(0.07)) { const p = me.hand(ph); w.light(p.x, p.y, rand(26, 32), '#ffa040', 0.12); }
      if (at(MATCH_FALLS)) dropMatch(me, me.ahead(16, 4));
      break;
    case 'junk': if (at(TOSSED)) junk(me); break;
    case 'cold': if (every(0.12)) { const p = me.ahead(12); w.light(p.x, p.y, 44, '#cfe6ff', 0.2); } break;
    default: break;
  }
}

// a lit match let fall at p: the petrol catches there (systems/FireSpread.js)
function dropMatch(me, p) {
  me.world.particles.fire(p.x, p.y, 3, 18, { size: [1, 2], life: [0.1, 0.25], rise: 20 });
  me.world.events.emit('matchDrop', { x: p.x, y: p.y, by: me });
}

// something out of a drawer or the fridge thrown over his right shoulder, left lying where it lands (JUNK of them,
// then only papers)
function junk(me) {
  const w = me.world, p = me.ahead(2, 7), a = me.angle + 2.2 + rand(-0.4, 0.4);
  me.tossed = (me.tossed ?? 0) + 1;
  const name = me.tossed > JUNK || me.tossed % 3 === 0 ? null : me.tossed % 3 === 1 ? 'can' : 'magazine';
  const img = name && spriteOpt(`items/${name}`);
  if (!img) {
    w.particles.floaters(p.x, p.y, FLOATS.paper, 3, a, 0.5, 70, 10);
    w.sound('flutter', p.x, p.y, 0.3);
    return;
  }
  w.particles.shard(img, p.x, p.y, a, rand(110, 160), { z: 10, vz: 60, bounce: 0.3, spin: rand(-10, 10) });
  w.after(0.35, () => w.sound(name === 'can' ? 'metal' : 'drop', p.x, p.y, 0.3, { pitch: name === 'can' ? 1.8 : 1.3 }));
}

// his right hand at phase ph, in the world
export function hand(me, ph) {
  const h = me.gestureHands(ph);
  return h ? me.ahead(h.hr.x, h.hr.y) : me.ahead(6, 5);
}

// a cigarette end (or a cigar) flying off and smoking a while where it lands
function dropSmoke(me, x, y, a, speed, name) {
  const w = me.world, img = spriteOpt(`items/${name}`);
  if (!img) return;
  w.particles.shard(img, x, y, a, speed, { z: 8, vz: 40, bounce: 0, spin: rand(-8, 8), onLand: (p) => {
    p.life = 0;
    w.decals.bake(img, p.x, p.y, p.rot);
    w.emit(p.x, p.y, rand(4, 7), (e, dt) => w.smoke?.wisp(e, e.x, e.y - 1, dt)); // it smoulders a while
  } });
}

// it kicks off: what was in his hands falls (data/posts.js HELD)
export function dropHeld(me) {
  const name = me.holding, it = HELD[name], w = me.world, a = me.angle, p = me.ahead(7, 3);
  me.holding = null;
  if (!it) return;
  switch (it.drop) {
    case 'glass':
      w.particles.glass(p.x, p.y, a, 2.5, 5, 80);
      w.sound('glass', p.x, p.y, 0.4, { pitch: 1.3 });
      w.events.emit('spill', { x: p.x, y: p.y, kind: 'booze', area: it.spill ?? 70, dur: 1 });
      break;
    case 'butt':
      if (chance(it.keep ?? 0)) me.mouth = true;
      else dropSmoke(me, p.x, p.y, a + rand(-1.2, 1.2), rand(20, 50), name === 'cigar' ? 'cigar' : 'butt');
      break;
    case 'magazine': {
      const img = spriteOpt('items/magazine');
      if (img) w.particles.shard(img, p.x, p.y, a + rand(-0.6, 0.6), rand(30, 60), { z: 5, vz: 10, spin: rand(-3, 3), bounce: 0 });
      break;
    }
    case 'paper': case 'cash': w.particles.floaters(p.x, p.y, FLOATS[it.drop], it.n, a, 1.4, 50, 8); break;
    case 'powder': w.particles.dust(p.x, p.y, 4, 3, '#f2f2ec', { alpha: 0.3 }); break;
    case 'match': dropMatch(me, me.ahead(12, 3)); break;
    case 'box': w.sound('drop', p.x, p.y, 0.2, { pitch: 2.2 }); break;
    default: break;
  }
}
