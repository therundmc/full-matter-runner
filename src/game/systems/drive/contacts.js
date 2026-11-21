// What his car runs into (systems/Drive.js d: its state). `contact` is called by the physics before it resolves a
// contact: what gives is made to give now (a frozen car woken, a bolted thing torn off and the contact dropped, a
// light loose thing flung by hand, a parked car shoved aside, in a bend a car scraped along its flank); the rest
// is dealt with after the step (react: a person run down, the crash nose-on into what does not give, a corner
// clipped, what it cost him). clearLanes keeps a car he shoved from shutting his lanes. Numbers: CHASE.hit / aside /
// crash / bend.smash. DOM-free.
import { clamp, rand } from '../../../engine/math.js';
import { wake, kgOf } from '../../../engine/physics/Body.js';
import { bandOf, blocksAll } from '../Route.js';
import { loosen, knockLoose, otherOf, rockOff, runOver, sideOf, tearOff } from '../chase/shared.js';
import { fronts } from './fronts.js';
import { asideKeep, asideThrow, bursts, coverOf, grazes, nosedIn, onNose, smashable, smashCost, smashSpeed, squareOf, tearPower } from './rules.js';

const { Body, Sleeping } = Matter;

// The physics found his car touching o (before resolving it). What gives is made to give now (a frozen car woken,
// its share of the contact's mass put back; a bolted thing torn off and the contact dropped; a pane goes by
// itself); the rest is dealt with after the step (react).
export function contact(d, o, pair) {
  if (!d.on || (d.dead && !d.coasting)) return;
  const v = d.car, b = v.body, e = o.entity, C = d.C, w = d.world;
  const vel = Body.getVelocity(b), ov = o.isStatic ? { x: 0, y: 0 } : Body.getVelocity(o);
  let { x: nx, y: ny } = pair.collision.normal;
  if ((vel.x - ov.x) * nx + (vel.y - ov.y) * ny < 0) { nx = -nx; ny = -ny; }
  const c = pair.collision.supports?.[0] || o.position;
  const h = { o, e, nx, ny, x: c.x, y: c.y, vx: vel.x, vy: vel.y, a: b.angle, kind: 'solid', mid: b.position.y, lo: o.bounds.min.y, hi: o.bounds.max.y };
  const fast = Math.hypot(vel.x - ov.x, vel.y - ov.y);
  if (e?.isVehicle && d.bend && (!e.pursuer || e.pursuer.state === 'wrecked')) {
    h.kind = 'flank'; // (in a bend: scraped along its flank, never thrown nor a wall)
    h.first = flankOn(d, o, pair);
  } else if (e?.isVehicle) {
    h.kind = 'car';
    loosen(o, pair);
    // a parked car, a wreck: shoved aside by hand (one of theirs still driven, or on its way out, is Pursuit's)
    if (!e.pursuer || (e.pursuer.state === 'wrecked' && !e.pursuer.out)) h.aside = aside(d, o, pair, vel, ov, nx, ny);
    if (!e.onCollide) {
      // what it is shoved into goes too (this drive's: leave takes it back, a new drive gives its own)
      e.onCollide = (o2, pair2) => d.knock(o, o2, pair2);
      d.knocked.set(e, e.onCollide);
    }
  } else if (e && (e.isPlayer || e.isEnemy || e.isCivilian)) h.kind = 'person';
  else if (e?.def && (e.dead || e.dying)) {
    // already falling apart (a parasol torn down as he came under it, its pole still standing a moment): it never
    // holds the car up
    h.kind = 'gives';
    if (!e.def.lasting && !e.isVehicle) { pair.isActive = false; pair.isSensor = true; }
  }
  else if (e?.def && !e.def.lasting) {
    h.kind = 'thing';
    if ((e.def.static || o.frozen) && !e.tipped && fast > C.hit.tear) {
      // it goes: the car is not stopped by it, now (this pair) nor while it falls apart (tearOff)
      tearOff(o, pair, Math.atan2(vel.y, vel.x) + rand(-C.hit.aim, C.hit.aim), tearPower(fast, C));
      h.kind = 'torn';
    } else if (d.bend && !o.isStatic && smashable(kgOf(o))) {
      // (in a bend: thrown out of the line whatever its weight up to a dumpster's, and burst as it goes)
      fling(d, o, pair, vel, smashSpeed(kgOf(o), C));
      h.heavy = kgOf(o) > C.hit.fling.kg;
      h.burst = bursts(e.def);
    } else if (!o.isStatic && !o.frozen && kgOf(o) <= C.hit.fling.kg) fling(d, o, pair, vel); // (however slow)
    else loosen(o, pair);
  } else if (e && !e.def) h.kind = 'gives'; // a window, a door: their own business
  d.hits.push(h);
}

// A light loose thing in its way (a bin, a chair, a crate, a bag) is thrown, by hand: on ahead of the car and out
// to the side it was hit on, turning, off the floor a moment. The contact itself is dropped (the physics would
// share the overlap equally between a chair and two tons of car, and hold it up), at any speed: met at a crawl
// and kept, a bag pinned between the car and a wall held it up
// (k: the share of the car's speed it goes at; a bend's smash gives a heavy one less, spun more)
export function fling(d, o, pair, vel, k = rand(...d.C.hit.fling.v)) {
  const F = d.C.hit.fling, v = d.car, side = v.toSprite(o.position.x, o.position.y).sy < v.h / 2 ? -1 : 1;
  const sp = Math.max(F.least, Math.hypot(vel.x, vel.y) * k), a = Math.atan2(vel.y, vel.x) + side * rand(...F.side);
  const spin = d.bend ? d.C.bend.smash.spin : F.spin;
  pair.isActive = false;
  pair.isSensor = true;
  if (o.frozen) wake(o);
  if (o.isSleeping) Sleeping.set(o, false);
  Body.setVelocity(o, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
  Body.setAngularVelocity(o, rand(-spin, spin));
  o.flyUntil = d.world.time + rand(...F.fly);
}

// IN A BEND, a car he meets (parked, a wreck: CHASE.bend.smash.flank) is scraped along its flank: the contact is
// never resolved (the script's line kept; `pair.flank`: a sensor CarFx still showers sparks along, for as long as
// the two overlap: flankStep), the other car rocked off his flank. True the first time this car is met
export function flankOn(d, o, pair) {
  const F = d.C.bend.smash.flank, v = d.car, b = v.body;
  pair.isActive = false;
  pair.isSensor = true;
  pair.flank = true;
  // (away from his flank, across the way he goes: a car loose already (a wreck) is rocked off it; a parked one,
  // frozen, stays where it is parked: he grinds along it)
  const a = b.angle, side = sideOf(b, o.position.x, o.position.y, a);
  if (!o.frozen && !o.isStatic) {
    if (o.isSleeping) Sleeping.set(o, false);
    rockOff(o, a, side, F.push, d.world.time);
    Body.setAngularVelocity(o, -side * F.spin);
  }
  d.flanks ??= new Map();
  if (d.flanks.has(o.entity)) return false;
  d.flanks.set(o.entity, { dentT: 0, dents: 0, side });
  return true;
}

// a step of the cars he is scraping along (flankOn): dents on both flanks every `dent` s, his speed dragged
export function flankStep(d, dt) {
  const F = d.C.bend.smash.flank, w = d.world, v = d.car, b = v.body;
  // (a car already against his when it stopped being driven, a pursuer wrecked on his tail: scraped from now on)
  if (d.bend) {
    for (const pair of w.physics.activePairs()) {
      const o = otherOf(pair, b), e = o?.entity;
      if (e?.isVehicle && !pair.isSensor && e.pursuer?.state === 'wrecked') flankOn(d, o, pair);
    }
  }
  if (!d.flanks?.size) return;
  let rubbing = false;
  for (const pair of w.physics.activePairs()) {
    if (!pair.flank || (pair.bodyA !== b && pair.bodyB !== b)) continue;
    const o = otherOf(pair, b), e = o.entity, s = d.flanks.get(e), c = pair.collision.supports?.[0];
    if (!s || !c) continue;
    rubbing = true;
    if ((s.dentT -= dt) > 0 || s.dents >= F.dents) continue;
    s.dentT = F.dent;
    s.dents++;
    // (each dent pushed in toward the middle of the car it is on)
    const q = e.toSprite?.(c.x, c.y), p = v.toSprite(c.x, c.y), m = F.inset;
    if (q && e.scar) e.scar(clamp(q.sx, m, e.w - m), clamp(q.sy, m, e.h - m), Math.atan2(o.position.y - c.y, o.position.x - c.x) - o.angle, 'blunt');
    v.scar?.(clamp(p.sx, m, v.w - m), clamp(p.sy, m, v.h - m), Math.atan2(b.position.y - c.y, b.position.x - c.x) - b.angle, 'blunt');
  }
  if (rubbing && d.bend) d.bend.v = smashCost(d.bend.v, F.drag * dt, d.bend.b.speed, d.C.bend.smash);
}

// the first touch of a car he scrapes in a bend: its alarm and its hazards, a mirror torn off, the panel crumpled
// there, a burst of sparks and glass, the picture shaken
export function flanked(d, h) {
  const w = d.world, C = d.C, v = d.car, e = h.e, a = Math.atan2(h.vy, h.vx);
  e.hit?.(0, h.x, h.y, a + Math.PI / 2, 1, 'blunt');
  e.startAlarm?.();
  const F = C.bend.smash.flank.fx;
  e.shed?.(h.x, h.y, a + rand(-F.aim, F.aim), rand(...F.mirror), false, 'car_mirror');
  w.particles.sparks(h.x, h.y, a + Math.PI, 1.0, ...F.sparks);
  w.particles.glass(h.x, h.y, a, 0.9, ...F.glass);
  w.sound('carHit', h.x, h.y, 0.9);
  w.shake(C.hit.shake * F.shake);
  d.bump('hit', F.bump);
  w.events.emit('ride', { beat: 'hit', x: h.x, y: h.y });
  smashed(d, h.x, h.y);
}

// the first thing smashed in a bend: told once a bend ('chaseSmash': the slow motion, systems/ChaseCam.js)
export function smashed(d, x, y) {
  const st = d.bend;
  if (!st || st.smashed) return;
  st.smashed = true;
  d.world.events.emit('chaseSmash', { car: d.car, x, y, bend: st.b });
}

// A parked car (or a wreck) he runs into is SHOVED ASIDE, never a wall (C.aside): thrown on ahead of him and out to
// the side it is on (dead ahead: the side with more room before the building fronts), turning, its tyres off the
// floor's friction a moment, by how square the hit is (squareOf); the contact itself is not resolved this step (the
// physics would share the blow between 2 t and 1.3 t and stop him): he only loses the share of his speed asideKeep
// says (shovedAside), is turned a little off it, his tail kicked out. Closing on it slower than `least` px/step,
// or he crawling under `slow`: the physics as it is (it leans on it and pushes). { sq, side, along, again } or null
export function aside(d, o, pair, vel, ov, nx, ny) {
  const C = d.C, A = C.aside, w = d.world, v = d.car, b = v.body, e = o.entity;
  const ca = Math.cos(b.angle), sa = Math.sin(b.angle), along = vel.x * ca + vel.y * sa;
  const closing = (vel.x - ov.x) * nx + (vel.y - ov.y) * ny, was = d.asides.get(e);
  // still on the car he has just shoved (it has not cleared his flank yet, or what it was thrown into sent it
  // back): thrown again for nothing more, the contact never resolved: a car he shoved never holds him up
  const again = !!was && w.time - was.at < A.hold;
  if (o.isStatic || along < A.slow || (!again && closing < A.least)) return null;
  // (a sensor for as long as the two overlap, as a thing flung: the physics tells only the start of a contact)
  pair.isActive = false;
  pair.isSensor = true;
  if (again && w.time - was.last < A.again) return null;
  const cover = coverOf(o.bounds.min.y, o.bounds.max.y, b.position.y, v.h) / v.h, sq = squareOf(cover, ca * nx + sa * ny, C);
  const dy = o.position.y - b.position.y;
  let side = again ? was.side : Math.sign(dy) || 1;
  if (!again && Math.abs(dy) < A.dead && d.leg.lanes && w.map) {
    const [lo, hi] = fronts(d);
    side = hi - o.bounds.max.y >= o.bounds.min.y - lo ? 1 : -1;
  }
  const T = asideThrow(sq, kgOf(o), C), a = Math.atan2(vel.y, vel.x), sp = Math.hypot(vel.x, vel.y);
  Body.setVelocity(o, { x: Math.cos(a) * sp * T.along, y: Math.sin(a) * sp * T.along + side * T.across * clamp(sp / C.cruise, ...A.by) });
  // (hit behind its middle its nose swings in toward him, its tail out; ahead of it, the other way)
  Body.setAngularVelocity(o, side * (o.position.x >= b.position.x ? 1 : -1) * T.spin * rand(...A.jitter));
  o.flyUntil = w.time + A.fly;
  d.asides.set(e, { t: 0, at: again ? was.at : w.time, last: w.time, side, o });
  if (again) return { sq, side, along, again };
  // his own car: turned a little off it, the tail kicked out (a square hit: straight through it)
  d.u -= side * A.deflect * (1 - sq) * clamp(sp / C.cruise, 0, 1);
  d.slipV -= side * C.slide.hit * (1 - sq);
  return { sq, side, along, again };
}

// A car he shoved aside never shuts all the lanes of his leg (blocksAll: neither side of it leaves his car's width
// and A.room of the road): slowing down across them, it is pushed on toward its kerb (the side of the street's
// middle its own is on, else the way it was thrown) at A.push px/step until a way past is clear. Followed A.watch s
export function clearLanes(d, dt) {
  const A = d.C.aside, lanes = d.leg.lanes, b = d.car.body, w = d.world;
  // still over a car he has just shoved (it was thrown into something that held it): out from under him, every
  // `again` s, ahead of him and to its side
  if (d.asides.size && !d.dead) {
    for (const pair of w.physics.activePairs()) {
      const o = otherOf(pair, b), s = o && d.asides.get(o.entity);
      if (!s || !pair.isSensor || w.time - s.at > A.hold || w.time - s.last < A.again) continue;
      const vel = Body.getVelocity(o), T = asideThrow(1, kgOf(o), d.C);
      s.last = w.time;
      Body.setVelocity(o, { x: Math.max(vel.x, d.v * T.along), y: s.side * Math.max(Math.abs(vel.y), T.across) });
      o.flyUntil = w.time + A.fly;
    }
  }
  for (const [e, s] of d.asides) {
    if ((s.t += dt) > A.watch || e.dead) { d.asides.delete(e); continue; }
    if (!lanes || lanes.length < 2 || e.exploded) continue;
    const o = s.o, { band, half } = bandOf(d.leg);
    const vel = Body.getVelocity(o);
    if (Math.abs(vel.y) > A.push || !blocksAll(o.bounds.min.y, o.bounds.max.y, band[0] - half, band[1] + half, d.car.h + A.room)) continue;
    const mid = (band[0] + band[1]) / 2, to = Math.abs(o.position.y - mid) > A.middle ? Math.sign(o.position.y - mid) : s.side;
    if (o.frozen) wake(o);
    if (o.isSleeping) Sleeping.set(o, false);
    Body.setVelocity(o, { x: vel.x * A.keep, y: to * A.push });
    o.flyUntil = d.world.time + d.C.fly;
    s.t = Math.min(s.t, A.watch - A.more); // (still in the way: watched on)
  }
}

// a car he shoved (b) runs into o: a frozen car or thing there is shoved on in its turn
export function knock(d, b, o, pair) {
  if (!d.on || o === d.car.body || !o.frozen) return;
  const v = Body.getVelocity(b);
  if (Math.hypot(v.x, v.y) < d.C.hit.chain) return;
  knockLoose(o, pair, d.world.time);
}

// stalled: a bolted thing it leans on (met at a crawl, it held: a pole it is wedged under against a wall) is torn
// off as if hit fast; a parked car it leans on is woken (frozen again at rest, it held: shoved aside now)
export function tearHeld(d) {
  const b = d.car.body;
  for (const pair of d.world.physics.activePairs()) {
    const o = otherOf(pair, b), e = o?.entity;
    if (e?.isVehicle && o.frozen && !e.exploded) loosen(o, pair);
    if (!e?.def?.static || e.def.lasting || e.isVehicle || e.dead || e.dying || pair.isSensor) continue;
    pair.isSensor = o.isSensor = true;
    e.break(Math.atan2(o.position.y - b.position.y, o.position.x - b.position.x), d.C.hit.power * d.C.hit.least);
  }
}

// after the physics, a thing it ran into this step (contact's record h): what it does to him and to it
export function react(d, h) {
  const w = d.world, C = d.C, v = d.car, e = h.e, t = w.time;
  if (d.dead && !d.coasting) return;
  const square = nosedIn(h.a, h.vx, h.vy, h.nx, h.ny, C);
  if (h.kind === 'solid') {
    // (in a bend the line is the script's: what it brushes is a scrape, never the crash)
    if (!d.bend && square && onNose(h.lo, h.hi, h.mid, v.h, C) && !w.player.invulnerable) { crash(d, h); return; }
    if (!d.bend && square && !grazes(h.lo, h.hi, h.mid, v.h, C)) { d.v = Math.min(d.v, C.crash.clip); w.shake(C.hit.shake); d.bump('hit'); w.events.emit('ride', { beat: 'clip', x: h.x, y: h.y }); } // a corner clipped: most of the speed gone
    w.sound('carHit', h.x, h.y, 0.5);
    w.particles.sparks(h.x, h.y, Math.atan2(-h.ny, -h.nx), 1, 8, 260);
    return;
  }
  if (h.aside) { shovedAside(d, h); return; }
  if (h.kind === 'flank') { if (h.first) flanked(d, h); return; }
  const key = e || h.o;
  if (t - (d.seen.get(key) ?? -Infinity) < C.hit.again) return;
  d.seen.set(key, t);
  const a = Math.atan2(h.vy, h.vx), speed = Math.hypot(h.vx, h.vy);
  if (h.kind === 'car') {
    // shoved for real (the physics); its alarm, a dent, sparks; hit square on and fast, his car loses most of it
    h.o.flyUntil = t + C.hit.fly;
    e.hit(0, h.x, h.y, a, 1, 'blunt');
    w.sound('carHit', h.x, h.y, 1);
    w.particles.sparks(h.x, h.y, Math.atan2(-h.ny, -h.nx), 1, 10, 320);
    w.shake(C.hit.shake);
    d.bump('hit');
    w.events.emit('ride', { beat: 'hit', x: h.x, y: h.y });
    if (square) d.v = Math.min(d.v, (h.vx * Math.cos(h.a) + h.vy * Math.sin(h.a)) * C.hit.keep);
  } else if (h.kind === 'person') {
    if (!e.alive || speed < C.run) return;
    const side = v.toSprite(e.x, e.y).sy < v.h / 2 ? -1 : 1;
    runOver(w, e, a + side * C.runOver.side, speed, v);
    return;
  } else if (h.kind === 'torn') { w.shake(C.hit.shake * 0.5); d.bump('torn'); w.events.emit('ride', { beat: 'torn', x: h.x, y: h.y }); } else if (h.kind === 'thing') d.bump('torn', h.heavy ? 1 : 0.6);
  // (in a bend what it throws bursts as it goes: the alley erupts behind him; the first of it slows the world)
  if (h.burst && e?.break && !e.dead && !e.dying) e.break(a + rand(-0.4, 0.4), tearPower(speed, C));
  if (h.heavy) { w.shake(C.hit.shake * 0.7); w.sound('carHit', h.x, h.y, 0.8); w.particles.sparks(h.x, h.y, a, 1.0, 12, 300); }
  if (d.bend && (h.kind === 'torn' || h.kind === 'thing')) smashed(d, h.x, h.y);
  if (e?.def && (h.kind === 'torn' || h.kind === 'thing')) {
    // what it was made of thrown on ahead, sheets of paper off it, sparks off steel
    const F = C.fx.debris;
    w.particles.chips(h.x, h.y, a, 0.8, F.chips, e.def.chips, speed * F.speed);
    if (e.def.material === 'metal') w.particles.sparks(h.x, h.y, a, 0.9, F.sparks, 300);
    if (e.def.glass) w.particles.glass(h.x, h.y, a, 0.9, F.glass, speed * F.speed);
    w.papers?.drop(h.x, h.y, F.papers[0], a, F.papers[1]);
  }
  // what it cost him: once a step at most (what it was: its `cost`, a toll's arm), and nothing for what was already
  // broken (the bits of it in the air)
  if (h.kind !== 'gives' && !d.lost) {
    d.lost = true;
    // (in a bend the script's speed: a share of it, never under its floor)
    if (d.bend) d.bend.v = d.v = smashCost(d.bend.v, h.heavy ? C.bend.smash.heavyCost : C.bend.smash.cost, d.bend.b.speed, C.bend.smash);
    else d.v *= 1 - (e?.def?.cost ?? C.hit.loss);
  }
}

// He shoved a parked car aside (aside): what it cost him (asideKeep of his speed along his nose, never less), and
// what it looks and sounds like: its alarm and a dent, sparks along the way it went, its glass on a square hit, the
// picture shaken and his body thrown by how square it was. Told on 'carShoved' ({ car, by, x, y, sq, side })
export function shovedAside(d, h) {
  const w = d.world, C = d.C, v = d.car, e = h.e, { sq, side, along, again } = h.aside, hard = 0.4 + 0.6 * sq;
  const a = Math.atan2(h.vy, h.vx);
  if (again) { w.particles.sparks(h.x, h.y, a + side * 0.6, 1.1, 5, 300); return; } // (still pushing it out: nothing more lost)
  d.v = Math.min(d.v, Math.max(along * asideKeep(sq, C), C.aside.floor * d.cruise));
  d.seen.set(e, w.time);
  h.o.flyUntil = w.time + C.aside.fly;
  e.hit(0, h.x, h.y, a, 1, 'blunt');
  w.sound('carHit', h.x, h.y, hard);
  w.particles.sparks(h.x, h.y, a + side * 0.6, 1.1, Math.round(8 + 14 * hard), 340);
  if (sq > 0.35) w.particles.glass(h.x, h.y, a + side * 0.4, 1.1, Math.round(16 * sq), 220);
  w.shake(C.hit.shake * (0.6 + sq));
  d.bump('hit', hard);
  w.events.emit('ride', { beat: 'hit', x: h.x, y: h.y });
  w.events.emit('carShoved', { car: e, by: v, x: h.x, y: h.y, sq, side });
}

// nose-on into what does not give: the front crumples, glass and sparks, it stops dead, and he is dead
export function crash(d, h) {
  const w = d.world, C = d.C, v = d.car, p = w.player, back = h.a + Math.PI;
  d.dead = true;
  for (let i = 0; i < C.crash.dents; i++) {
    const [inset, from, span] = C.crash.dentAt, q = v.toWorld(v.w - inset, v.h * (from + (span * i) / Math.max(1, C.crash.dents - 1)));
    v.hit(0, q.x, q.y, h.a, 1, 'blunt');
  }
  v.breakLamp(0, back);
  v.breakLamp(1, back);
  v.alarm = 0;
  const nose = v.toWorld(v.w, v.h / 2);
  w.particles.sparks(nose.x, nose.y, back, 1.3, 26, 340);
  w.particles.glass(nose.x, nose.y, back, 1.2, 24, 220);
  w.sound('vanCrash', nose.x, nose.y, 1);
  w.shake(C.crash.shake);
  w.events.emit('ride', { beat: 'crash', x: nose.x, y: nose.y });
  d.v = 0; d.u = 0;
  Body.setVelocity(v.body, { x: 0, y: 0 });
  Body.setAngularVelocity(v.body, 0);
  if (!p.alive) return;
  p.alive = false; // inside the car: no body thrown, nothing out of it
  w.onKill(p, 'crash', v, { crash: true });
}
