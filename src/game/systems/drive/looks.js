// What his car's speed does around it, LOOKS ONLY (systems/Drive.js d: its state; systems/CarFx.js does the smoke,
// the sparks and the fire of a car in trouble): tyres letting go (white smoke, rubber on the road: 'tyres'), spray
// out of standing water, what is ahead frightened, awnings and parasols (`canopy`) torn down as it passes under,
// dust off its rear wheels, something light whipped up in its wake, the streaks of air past it (`wind`, drawn by
// render/PursuitArt.js), the grind of a flank along a wall (scrape), the body on its springs (springs: Vehicle squat /
// roll / lift / bob). Numbers: CHASE.fx / scrape / body. DOM-free.
import { TILE } from '../../Config.js';
import { clamp, rand, chance } from '../../../engine/math.js';
import { FLOATS } from '../../data/destruction.js';
import { layRubber, otherOf, wheelsOf } from '../chase/shared.js';
import { surgeStep } from './camera.js';
import { bodyLean, skidOf, springStep, tearPower } from './rules.js';

// what its speed does around it: tyres letting go (white smoke, rubber left on the road) on a shove or hard
// steering; spray out of standing water; pigeons, cats and people ahead frightened; an awning or a parasol it
// drives under torn down
export function fx(d, dt) {
  const w = d.world, C = d.C, F = C.fx, v = d.car, b = v.body, back = b.angle + Math.PI;
  const wheels = wheelsOf(v), rear = wheels.slice(0, 2);
  // (pulling away from the opening: the rear tyres spin)
  if (d.launchT > 0) { d.launchT -= dt; for (const r of rear) w.particles.smoke(r.x, r.y, C.intro.launch.smoke, 3, { speed: F.smokeV.launch, size: F.smoke[1], life: F.smoke[2] }); }
  const skid = d.launchT > 0 ? 1 : skidOf(d.u, d.v, d.shoveT > 0, C, d.slip);
  const on = skid > 0 ? rear : null;
  if (on) {
    // (their rubber smoke in the air: systems/CarFx.js; all four in a shove)
    w.events.emit('tyres', { car: v, at: d.shoveT > 0 ? wheels : on, k: skid, dt });
    for (const r of on) if (chance(F.smoke[0] * skid)) w.particles.smoke(r.x, r.y, 1, 3, { speed: F.smokeV.tyre, size: F.smoke[1], life: F.smoke[2] });
    if (d.ruts?.length === on.length) layRubber(w, d.ruts, on, skid);
    else w.sound('tyreSkid', v.x, v.y, 0.6 * skid);
  }
  d.ruts = on;
  // standing water under a wheel: spray thrown out to the side and back, a ring left on it
  if (w.liquids && d.v > F.from) {
    for (const r of wheels) {
      const wet = chance(F.spray[0]) && w.liquids.at(r.x, r.y), splash = wet && w.liquids.cfg.kinds[wet.kind]?.splash;
      if (!splash) continue;
      w.particles.drops(r.x, r.y, back + (chance(0.5) ? 1 : -1) * 0.9, 0.7, F.spray[1], splash, F.spray[2] * (d.v / C.cruise), 5, false);
      w.liquids.ripple(r.x, r.y);
      if (chance(0.15)) w.sound('waterSpray', r.x, r.y, 0.5);
    }
  }
  if ((d.fxT -= dt) <= 0 && d.v > F.from) {
    d.fxT = F.scare.every;
    const ahead = d.v * 60 * F.scare.lead, x = v.x + Math.cos(b.angle) * ahead, y = v.y + Math.sin(b.angle) * ahead;
    w.critters?.scare(x, y, F.scare.r, F.scare.r);
    w.ambient?.panicAround(x, y, F.scare.people, 'scream');
  }
  air(d, dt, rear);
  // awnings and parasols: under one, fast, it goes
  d.canopies ??= w.props.filter((p) => p.def?.canopy);
  if (d.v > C.hit.tear) {
    for (const p of d.canopies) {
      if (p.dead || p.dying || Math.abs(p.x - v.x) > F.canopy || Math.abs(p.y - v.y) > F.canopy) continue;
      const s = v.toSprite(p.x, p.y), hw = (p.def.w ?? p.W) / 2, hh = (p.def.h ?? p.H) / 2;
      const far = Math.abs(Math.sin(p.body.angle)) > 0.7 ? [hh, hw] : [hw, hh];
      if (s.sx < -far[0] || s.sx > v.w + far[0] || s.sy < -far[1] || s.sy > v.h + far[1]) continue;
      p.break(b.angle + rand(-0.4, 0.4), tearPower(d.v, C));
      w.sound('awningRip', p.x, p.y, 0.8);
      w.shake(C.hit.shake * 0.4);
    }
  }
}

// the air it moves at speed: dust off the rear wheels, something light whipped up in its wake now and then, and
// the streaks of air past it (kept here, drawn by render/PursuitArt.js)
function air(d, dt, rear) {
  const w = d.world, C = d.C, F = C.fx, v = d.car, W = F.wind;
  if (d.v > F.dust.from) {
    for (const r of rear) {
      if (chance(F.dust.chance)) w.particles.dust(r.x, r.y, 1, 3, F.dust.color, { speed: F.dust.speed, size: F.dust.puff[0], alpha: F.dust.puff[1], life: F.dust.puff[2], vx: -d.v * F.dust.back });
    }
  }
  if (d.v > F.wake.from && (d.wakeT -= dt) <= 0) {
    d.wakeT = rand(...F.wake.every);
    const [x0, x1, m] = F.wake.at, q = v.toWorld(rand(x0, x1), rand(m, v.h - m)), sp = d.v * 60 * F.wake.v;
    if (chance(F.wake.paper) && w.papers) w.papers.drop(q.x, q.y, 1, v.body.angle + rand(-0.5, 0.5), sp);
    else w.particles.floaters(q.x, q.y, FLOATS.leaf, F.wake.leaves, v.body.angle, 0.9, sp * 0.6, 7);
  }
  const k = clamp((d.v - W.from) / (C.max - W.from), 0, 1), L = d.wind;
  for (let i = L.length - 1; i >= 0; i--) {
    const s = L[i];
    s.t += dt;
    s.x += s.vx * dt;
    if (s.t >= s.life) L.splice(i, 1);
  }
  if (k > 0 && !d.bend && L.length < W.n * k && chance(k * 0.9)) { // (streaks along +x: none round a corner)
    const side = chance(0.5) ? -1 : 1;
    L.push({
      x: v.x + rand(-W.back, W.ahead), y: Math.round(v.y + side * rand(...W.band)) + 0.5, len: Math.round(W.len[0] + (W.len[1] - W.len[0]) * k * rand(0.4, 1)),
      vx: -d.v * 60 * rand(...W.v), t: 0, life: rand(...W.life), a: W.alpha * rand(0.5, 1) * (0.4 + 0.6 * k),
    });
  }
}

// a flank grinding along a wall or a car (or held off the building fronts as he steers into them: grind): sparks and
// the grind, every so often while it lasts
export function scrape(d, dt) {
  const w = d.world, C = d.C.scrape, b = d.car.body;
  if ((d.scrapeT -= dt) > 0) return;
  const g = d.grind;
  // (the sparks are a shower for as long as it rubs: systems/CarFx.js)
  if (g && d.v >= C.from) {
    w.sound('vanScrape', g.x, g.y, C.vol);
    w.events.emit('ride', { beat: 'scrape', x: g.x, y: g.y });
    d.scrapeT = C.every;
    return;
  }
  for (const pair of w.physics.activePairs()) {
    const o = otherOf(pair, b);
    if (!o || !(o.isStatic || o.entity?.isVehicle) || o.entity?.def?.hung) continue;
    const c = pair.collision.supports?.[0];
    if (!c || d.v < C.from) continue;
    w.sound('vanScrape', c.x, c.y, C.vol);
    w.events.emit('ride', { beat: 'scrape', x: c.x, y: c.y });
    d.scrapeT = C.every;
    return;
  }
}

// The body on its springs this step (looks only): what the speeds did since the last one pushes it (a hit that
// took its speed dives it), the road throws it up now and then, a front wheel onto or off the sidewalk too
export function springs(d, dt) {
  const w = d.world, C = d.C, B = C.body, L = B.lift, v = d.car, S = d.body, was = d.was2;
  const [squat, lean] = bodyLean((d.v - was.v) / dt, (d.u - was.u) / dt, d.u, C);
  const roll = clamp(lean - d.slip * C.slide.lean, -B.most, B.most); // (sliding, it leans out over its outer wheels)
  was.v = d.v; was.u = d.u;
  [v.squat, S.pitch] = springStep(v.squat || 0, S.pitch, squat, B.k, B.d, dt);
  [v.roll, S.roll] = springStep(v.roll || 0, S.roll, roll, B.k, B.d, dt);
  if ((d.roadT -= dt) <= 0) {
    d.roadT = rand(L.road[0], L.road[1]);
    if (d.v > C.fx.from) S.lift += L.road[2] * (d.v / C.max) * rand(0.4, 1);
  }
  // the kerb: a front wheel on another ground than a step ago (the road, or not)
  const map = w.map;
  if (map?.floor && d.v > C.hit.tear) {
    const on = [2, 3].map((i) => {
      const q = v.toWorld(...v.m.wheels[i]), f = map.floor[Math.floor(q.y / TILE) * map.w + Math.floor(q.x / TILE)];
      return !!f && f.startsWith('asphalt');
    });
    if (d.ground && (on[0] !== d.ground[0] || on[1] !== d.ground[1])) {
      d.bump('kerb');
      w.events.emit('ride', { beat: 'kerb', x: v.x, y: v.y });
    }
    d.ground = on;
  }
  [v.lift, S.lift] = springStep(v.lift || 0, S.lift, 0, L.k, L.d, dt);
  v.lift = clamp(v.lift, -L.most, L.most);
  // at speed the shell shivers on its wheels: a blip across, one step long
  v.bob = 0;
  if (d.v >= B.buzz.from && (d.buzzT -= dt) <= 0) {
    d.buzzT = rand(...B.buzz.every);
    v.bob = (chance(0.5) ? 1 : -1) * B.buzz.px;
  }
  surgeStep(d, dt);
}
