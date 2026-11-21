// The night around the player, heard place by place (what each sounds like: data/soundscape.js).
//   - Places: every floor tile of the level belongs to a kind of place (its `soundscape.zones`, else street / roof /
//     room by its floor). Where he stands, its beds play openly; the places around bleed in through the walls, quieter
//     and muffled the further they lie (a distance field per kind, through walls), from their side. Moving from one
//     to the next crossfades them (AMBIENCE.ease), and the reverb follows the room he is in.
//   - Beds come alive with the place: the talk of a bar only while its customers sit at ease (it dies down when they
//     panic), the radio and what hums only while the power is on.
//   - Props with a bed of their own (data/soundscape.js PROP_BEDS: neon, fridges, tubes, fans, a TV's snow): the
//     nearest that still works, from its side, muffled through a wall; and the level's spots (SPOTS: a radio behind
//     a window).
//   - The traffic car by car (systems/Ambient.js): each of the nearest cars drives two voices of its own (its engine
//     and its tyres on the road), their level by distance and speed, its side, its engine's speed and tone, and the
//     Doppler shift as it goes by.
//   - One-shots on top, each on its own random clock while its place is heard (glasses, ice, a laugh, a chair, the
//     bartender, a drip, the cistern); the far city everywhere (CITY: the elevated train, a police car, horns, a car
//     alarm, a dog), dull from indoors; a gust of wind (systems/Papers.js 'gust'); drops off a leaking pipe.
// DOM-free: the mix is handed to the world (World.atmosphere -> audio/Audio.js setAmbience) every AMBIENCE.send s;
// the one-shots go through World.sound like any other sound, so walls muffle them.
import { AMBIENCE, TILE } from '../Config.js';
import { ZONES, PROP_BEDS, CARS, CITY, SPOTS } from '../data/soundscape.js';
import { rand, clamp } from '../../engine/math.js';
import { WALKER } from '../ai/Civilians.js';
import { OPENINGS } from '../world/TileMap.js';

const SOUND = 343 * 32;                          // px/s: the speed of sound (1 m = 32 px)
const ROOMS = [...new Set(Object.values(ZONES).map((z) => z.room))];
const CAR_BEDS = new Set(['engine', 'road']); // the traffic's voices follow their cars at once (the mixer glides them)

// tiles from every tile to the nearest tile of kind k (8 neighbours, through walls), capped at 255
function spread(kinds, k, w, h) {
  const d = new Uint8Array(w * h).fill(255), q = [];
  kinds.forEach((v, i) => { if (v === k) { d[i] = 0; q.push(i); } });
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w, y = (i - x) / w, nd = d[i] + 1;
    if (nd >= 255) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && d[j] > nd) { d[j] = nd; q.push(j); }
      }
    }
  }
  return d;
}

// The places of a level: kinds[tile] (a ZONES key; null for walls, doors and windows), and per kind the distance in
// tiles from every tile to it. def: the level's `soundscape`.
export function zoneMap(map, def = {}, cfg = AMBIENCE) {
  const { w, h } = map, kinds = new Array(w * h).fill(null), rects = (def.zones || []).filter(([k]) => ZONES[k]);
  const indoors = new Set(cfg.indoors);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, ch = map.at(x, y);
      if (map.solid[i] || OPENINGS.has(ch)) continue; // (between two places: they keep the last one)
      const z = rects.find(([, c0, r0, c1, r1]) => x >= c0 && x <= c1 && y >= r0 && y <= r1);
      kinds[i] = z ? z[0] : ch === '^' ? 'roof' : indoors.has(map.floor[i]) ? 'room' : 'street';
    }
  }
  const dist = {};
  for (const k of new Set(kinds)) if (k) dist[k] = spread(kinds, k, w, h);
  return { w, h, kinds, dist, rects };
}

// What is heard from tile (cx, cy): `at`, the place he stands in (an opening keeps `here`, the last one), and per
// place within earshot { p: presence 1 where he is, AMBIENCE.through and less with the distance beyond its walls;
// pan: toward where it lies; inside }
export function hearing(zm, cx, cy, here, cfg = AMBIENCE) {
  cx = clamp(cx, 0, zm.w - 1);
  cy = clamp(cy, 0, zm.h - 1);
  const i = cy * zm.w + cx, at = zm.kinds[i] ?? here ?? 'street', heard = {};
  for (const k in zm.dist) {
    if (k === at) { heard[k] = { p: 1, pan: 0, inside: true }; continue; }
    const d = zm.dist[k], di = d[i], carry = ZONES[k].carry ?? 3;
    if (di > carry) continue;
    const dl = cx > 0 ? d[i - 1] : di, dr = cx < zm.w - 1 ? d[i + 1] : di;
    heard[k] = { p: cfg.through * (1 - di / (carry + 1)) ** 2, pan: clamp((dl - dr) * 0.3, -0.6, 0.6), inside: false };
  }
  return { at, heard };
}

// does a prop answer a PROP_BEDS entry
function matches(q, pb) {
  if (pb.hum) return q.def?.hum === pb.hum;
  if (pb.types) return pb.types.includes(q.type);
  if (pb.screen) return !q.isVehicle && !!q.rec?.snow;
  return false;
}

// one key of { key: weight }
function weighted(table) {
  const keys = Object.keys(table);
  let x = Math.random() * keys.reduce((s, k) => s + table[k], 0);
  for (const k of keys) if ((x -= table[k]) <= 0) return k;
  return keys[keys.length - 1];
}

export default class Ambience {
  constructor(world, cfg = AMBIENCE) {
    this.world = world;
    this.cfg = cfg;
    const def = world.level?.soundscape || {};
    this.zones = zoneMap(world.map, def, cfg);
    this.spots = (world.level?.soundSpots || []).filter(([bed]) => SPOTS[bed]).map(([bed, c, r]) => ({ ...SPOTS[bed], x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }));
    this.here = null;          // the place he is in
    this.out = 1;              // 0 under a roof .. 1 out of doors, eased (gusts)
    this.mix = {};             // bed voice -> { gain, lp, pan, bed?, rate? } as last handed over (eased)
    this.room = null;          // reverb class -> weight, eased
    this.clocks = new Map();   // place + event (or 'city.' + i) -> s to its next one
    this.slots = new Array(CARS.slots).fill(null); // the car each traffic voice follows
    this.sendT = 0;
    this.dripT = rand(...cfg.drip.every);
    this.wired = {};           // place -> whether the house's power feeds it (looked up once)
    world.events.on('gust', (g) => world.sound('gust', undefined, undefined, cfg.gust * (1 - cfg.muffled * (1 - this.out)), { pan: g.dx, amb: true }));
  }

  // the place of a point (null in a wall or an opening)
  kindAt(x, y) {
    const z = this.zones, cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    return cx < 0 || cy < 0 || cx >= z.w || cy >= z.h ? null : z.kinds[cy * z.w + cx];
  }

  update(dt) {
    const w = this.world, p = w.player, c = this.cfg;
    if (!p) return;
    const { at, heard } = hearing(this.zones, Math.floor(p.x / TILE), Math.floor(p.y / TILE), this.here, c);
    this.here = at;
    this.out += ((ZONES[at].out ? 1 : 0) - this.out) * Math.min(1, dt * c.ease);
    this.events(dt, heard);
    this.city(dt);
    if ((this.dripT -= dt) <= 0) { this.dripT = rand(...c.drip.every); this.drip(p); }
    if ((this.sendT -= dt) > 0) return;
    this.sendT = c.send;
    this.blend(this.targets(heard, p), ZONES[at].room, 1 - Math.exp(-c.send * c.ease));
    w.atmosphere?.({ beds: this.mix, room: this.room });
  }

  // eases the mix toward the targets (k: share of the way this time); the cars' voices follow at once (the mixer
  // glides them), a voice gone silent is dropped
  blend(t, room, k) {
    const mix = {};
    for (const name of new Set([...Object.keys(t), ...Object.keys(this.mix)])) {
      const to = t[name], was = this.mix[name];
      const car = CAR_BEDS.has(to?.bed);
      if (car || !was) { if (to) mix[name] = { ...to, gain: car ? to.gain : to.gain * k }; continue; }
      const gain = was.gain + ((to?.gain ?? 0) - was.gain) * k;
      if (!to && gain < 1e-4) continue;
      mix[name] = {
        ...was, ...to, gain,
        lp: to ? was.lp * (to.lp / was.lp) ** k : was.lp,
        pan: to ? was.pan + (to.pan - was.pan) * k : was.pan,
      };
    }
    this.mix = mix;
    if (!this.room) this.room = Object.fromEntries(ROOMS.map((r) => [r, r === room ? 1 : 0]));
    else for (const r of ROOMS) this.room[r] += ((r === room ? 1 : 0) - this.room[r]) * k;
  }

  // the target of every bed voice: the loudest place that has it (where he stands: open; next door: muffled), the
  // props that sound near him, the cars going by
  targets(heard, p) {
    const c = this.cfg, t = {}, calm = this.customers();
    const put = (name, gain, lp, pan, more) => { if (gain > (t[name]?.gain ?? 1e-4)) t[name] = { gain, lp, pan, ...more }; };
    for (const k in heard) {
      const h = heard[k];
      for (const [bed, v] of Object.entries(ZONES[k].beds)) {
        const b = typeof v === 'number' ? { level: v } : v;
        let g = b.level * h.p;
        if (b.crowd) g *= clamp((calm.filter((m) => m.kind === k).length - b.crowd[0] + 1) / (b.crowd[1] - b.crowd[0] + 1), 0, 1);
        if (b.mains && this.dark(k)) g = 0;
        put(bed, g, Math.min(b.lp ?? c.open, h.inside ? c.open : c.muffle), h.pan);
      }
    }
    this.propBeds(put, p);
    this.cars(put, p);
    return t;
  }

  // has the house's power been cut where place k lies
  dark(k) {
    const pw = this.world.power;
    if (!pw || pw.on) return false;
    if (!(k in this.wired)) {
      this.wired[k] = this.zones.rects.some(([z, c0, r0, c1, r1]) => z === k && pw.inside(((c0 + c1 + 1) / 2) * TILE, ((r0 + r1 + 1) / 2) * TILE));
    }
    return this.wired[k];
  }

  // a prop that makes no more sound: broken, its lights out, or on a house whose power is cut
  silent(q) {
    const pw = this.world.power;
    return q.dead || (q.lightsOut && !q.isVehicle) || q.unpowered !== undefined || (!q.isVehicle && pw && !pw.on && pw.inside(q.x, q.y));
  }

  propBeds(put, p) {
    const w = this.world, P = this.cfg.props;
    for (const pb of PROP_BEDS) {
      let best = null, bd = pb.reach;
      for (const q of w.props) {
        if (!matches(q, pb) || this.silent(q)) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) { bd = d; best = q; }
      }
      if (!best) continue;
      const walled = w.walledOff(best.x, best.y);
      const g = pb.level * (1 - bd / pb.reach) ** 2 * (walled ? P.through : 1);
      put(pb.bed, g, walled ? P.muffle : this.cfg.open, clamp((best.x - p.x) / P.pan, -0.8, 0.8));
    }
    for (const s of this.spots) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d >= s.reach) continue;
      const walled = w.walledOff(s.x, s.y);
      put(s.bed, s.level * (1 - d / s.reach) ** 2 * (walled ? P.through : 1), walled ? P.muffle : s.lp, clamp((s.x - p.x) / P.pan, -0.8, 0.8));
    }
  }

  // the nearest moving cars keep a voice each while they stay among the nearest; a new one takes a free voice
  cars(put, p) {
    const w = this.world, C = CARS, c = this.cfg, list = w.ambient?.cars || [];
    const near = list.filter((car) => !car.v.exploded && Math.hypot(car.v.x - p.x, car.v.y - p.y) < C.reach)
      .sort((a, b) => Math.hypot(a.v.x - p.x, a.v.y - p.y) - Math.hypot(b.v.x - p.x, b.v.y - p.y)).slice(0, C.slots);
    this.slots = this.slots.map((car) => (near.includes(car) ? car : null));
    for (const car of near) {
      const i = this.slots.indexOf(null);
      if (!this.slots.includes(car) && i >= 0) this.slots[i] = car;
    }
    this.slots.forEach((car, i) => {
      if (!car) return;
      const v = car.v, dx = v.x - p.x, dy = v.y - p.y, d = Math.hypot(dx, dy) || 1, sp = Math.max(0, car.d.speed);
      const a = v.body?.angle ?? v.angle ?? 0, closing = -(dx * Math.cos(a) + dy * Math.sin(a)) * sp / d;
      const pace = clamp(sp / C.cruise, 0, 1.3), walled = w.walledOff(v.x, v.y), dop = 1 + (C.doppler * closing) / SOUND;
      const rate = (C.rate[v.type] ?? 1) * (C.idle + (1 - C.idle) * pace) * dop, pan = clamp(dx / 400, -0.9, 0.9);
      const near = (1 - d / C.reach) ** 2 * (walled ? c.through * C.walled : 1), on = Math.min(1, pace);
      const tone = C.tone[0] + (C.tone[1] - C.tone[0]) * on;
      put('car' + i, C.level * near * (C.quiet + (1 - C.quiet) * on), walled ? Math.min(c.muffle, tone) : tone, pan, { bed: 'engine', rate });
      put('road' + i, C.road * near * on ** 1.5, walled ? c.muffle : c.open, pan, { bed: 'road', rate: dop });
    });
  }

  // customers still at ease at their places: { civ, kind }
  customers() {
    const out = [];
    for (const civ of this.world.civilians) {
      if (!civ.alive || !civ.post || civ.asleep || civ.left || civ.brain?.state !== WALKER.STOP) continue;
      out.push({ civ, kind: this.kindAt(civ.x, civ.y) });
    }
    return out;
  }

  // the one-shots of every place within earshot, each on its own clock (the first one comes sooner)
  events(dt, heard) {
    for (const k in heard) {
      ZONES[k].events.forEach((e, j) => {
        const key = `${k}.${j}`;
        let t = this.clocks.get(key) ?? rand(...e.every) * rand(0.15, 0.8);
        if ((t -= dt) <= 0) t = this.fire(k, e);
        this.clocks.set(key, t);
      });
    }
  }

  // plays event e of place k from where it comes; returns the s to the next one
  fire(k, e) {
    const w = this.world, src = this.source(k, e);
    let next = rand(...e.every);
    if (!src) return next;
    if (e.crowd) next /= Math.max(1, src.n / 2);
    const name = typeof e.sound === 'string' ? e.sound : weighted(e.sound), vol = rand(...(e.vol || [1, 1]));
    w.sound(name, src.x, src.y, vol, { amb: true, ...(e.voice && { pitch: src.pitch }) });
    return next;
  }

  // the far city (CITY), each sound on its own clock (the first one comes sooner): from a side and a distance, lower
  // and dull from under a roof
  city(dt) {
    const c = this.cfg.city, inside = 1 - this.out;
    CITY.forEach((e, i) => {
      const key = 'city.' + i;
      let t = this.clocks.get(key) ?? rand(...e.every) * rand(0.1, 0.6);
      if ((t -= dt) <= 0) {
        t = rand(...e.every);
        const opts = { amb: true, occ: inside > 0.5, distant: rand(...e.distant), side: rand(-0.8, 0.8) };
        for (const [k, v] of Object.entries(e.opts || {})) opts[k] = v === true ? (Math.random() < 0.5 ? -1 : 1) : Array.isArray(v) ? rand(...v) : v;
        this.world.sound(e.sound, undefined, undefined, rand(...e.vol) * (1 - (1 - c.inside) * inside), opts);
      }
      this.clocks.set(key, t);
    });
  }

  // where event e of place k comes from: { x, y, n (how many could have made it), pitch } | null
  source(k, e) {
    const w = this.world, pick = (list) => list[Math.floor(Math.random() * list.length)];
    if (e.at === 'zone') {
      const rects = this.zones.rects.filter(([z]) => z === k);
      if (!rects.length) return null;
      const [, c0, r0, c1, r1] = pick(rects);
      return { x: (c0 + Math.random() * (c1 + 1 - c0)) * TILE, y: (r0 + Math.random() * (r1 + 1 - r0)) * TILE, n: 1 };
    }
    if (e.at === 'patron') {
      const them = this.customers().filter((m) => m.kind === k && (!e.busy || e.busy.includes(m.civ.brain.activity)));
      if (!them.length) return null;
      const { civ } = pick(them), f = civ.post.face ?? 0;
      return { x: civ.x + Math.cos(f) * 10, y: civ.y + Math.sin(f) * 10, n: them.length, pitch: civ.voice };
    }
    if (e.at.startsWith('job:')) {
      const job = e.at.slice(4), g = w.enemies.find((m) => m.alive && m.job === job && m.atEase && this.kindAt(m.x, m.y) === k);
      return g ? { x: g.x, y: g.y, n: 1 } : null;
    }
    const props = w.props.filter((q) => q.type === e.at && !q.dead && this.kindAt(q.x, q.y) === k);
    if (!props.length) return null;
    const q = pick(props);
    return { x: q.x, y: q.y, n: 1 };
  }

  // a drop off the nearest thing that leaks, somewhere along it
  drip(p) {
    const c = this.cfg.drip;
    let best = null, bd = c.reach;
    for (const q of this.world.props) {
      if (!q.def?.drip || q.dead) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = q; }
    }
    if (best) this.world.sound('drip', best.x + rand(-c.spread, c.spread), best.y + rand(-c.spread, c.spread), rand(0.6, 1), { amb: true });
  }
}
