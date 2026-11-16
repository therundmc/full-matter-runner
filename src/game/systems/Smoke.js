// The air and what is in it (SMOKE in data/atmosphere.js). The level's air is a coarse fluid (engine/physics/Fluid.js):
// seen from above, the layer under the ceilings. Walls hold it, a shut door or an intact pane too; an open door, a
// smashed window let it through, and one between a room and the open air draws the room's air out.
// Four kinds ride it: grey smoke, black soot, white powder, steam (SMOKE.kinds: each its own loss, spread, look and
// weight in hiding what is behind it).
// What puts them there: every shot (a puff thrown out of the muzzle, a small one out of the ejection port with the
// case), blasts (a billow of soot pushed out with eddies round it), what burns (soot rising for as long as it burns:
// the fires, a car, a short), jets out of a hole (an extinguisher's powder, a pierced steam pipe), the street's steam
// (systems/Steam.js), the smokers (a thread off each cigarette, carried by the air, that spreads into the layer as it
// fades; a breath let out after a drag), butts and hot barrels (a thread too), dust and the rest (puffs).
// What moves them: a slow convection under the ceilings, the wind and its gusts outdoors, people walking and cars
// going by (they drag the air), rounds (along their line), the ceiling fans (they turn it and thin it), sprinklers
// (they bring it down). What takes them: their loss, slow in a room, fast in the open air. A smoky place of the
// soundscape keeps a faint patchy grey layer at rest, which the power cut thins. A guard does not see through air
// thick enough (blocks()).
// Only the air about the view is stepped. DOM-free: render/SmokeArt.js lights it with the light map.
import { TILE, BODY_SCALE, AMBIENCE } from '../Config.js';
import { SMOKE } from '../data/atmosphere.js';
import { GESTURES, exhale } from '../ai/Pastimes.js';
import { WALKER } from '../ai/Civilians.js';
import { seeded } from './Weather.js';
import { angDiff } from '../../engine/math.js';
import Fluid from '../../engine/physics/Fluid.js';

const { Body } = Matter;
const mix = (r, k) => r[0] + (r[1] - r[0]) * k;
const tmp = { x: 0, y: 0 };
const ROOM = 0, OPEN = 1; // the fluid's places

// what a character is smoking right now: 'cig', 'cigar' or null
export function smoking(ch) {
  if (!ch.alive) return null;
  if (ch.mouth) return 'cigar'; // left clamped in his teeth
  if (ch.isCivilian && ch.brain?.state !== WALKER.STOP) return null; // up and running: it is gone
  if (ch.pastime === 'smoke') return 'cig';
  const g = ch.gestureOn, item = g && GESTURES[g.g]?.item;
  return item === 'cig' || item === 'cigar' ? item : null;
}

// smooth value noise 0..1 on a seeded lattice of `size` px, two octaves (the patches of the resting layer)
function patches(R, size) {
  const N = 64, lat = Float32Array.from({ length: N * N }, R);
  const at = (x, y) => lat[(y & (N - 1)) * N + (x & (N - 1))];
  const vn = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
  return (x, y) => (vn(x / size, y / size) * 2 + vn(x / size * 2.1 + 17, y / size * 2.1 + 31)) / 3;
}

export default class Smoke {
  constructor(world, level = {}, cfg = SMOKE) {
    this.world = world;
    this.cfg = cfg;
    const names = Object.keys(cfg.kinds);
    this.kind = Object.fromEntries(names.map((n, k) => [n, k])); // name -> index in the fluid
    const m = world.map, C = cfg.cell;
    const F = (this.fluid = new Fluid(Math.ceil(m.widthPx / C), Math.ceil(m.heightPx / C), C, cfg.sub, names.length, 2));
    Object.assign(F, { drag: cfg.drag, vorticity: cfg.vorticity, sweeps: cfg.sweeps });
    names.forEach((n, k) => {
      const K = cfg.kinds[n];
      F.setLoss(k, ROOM, K.loss.room);
      F.setLoss(k, OPEN, K.loss.open);
      F.kinds[k].spread = K.spread;
      F.kinds[k].recover = K.recover ?? 0;
    });
    this.sight = names.map((n) => cfg.kinds[n].sight || 0); // what each kind counts for in hiding
    this.per = TILE / C;      // flow cells to a tile side
    this.rand = seeded(9157 + (level.name || '').length);
    // indoor floors (a ceiling over them: convection, the slow loss) and the resting layer of the smoky places
    const roofed = new Set(AMBIENCE.indoors);
    this.inside = new Uint8Array(F.w * F.h);
    const zones = [];
    for (const [kind, c0, r0, c1, r1] of level.soundscape?.zones || []) zones.push({ base: cfg.rest.zones[kind] || 0, c0, r0, c1, r1 });
    const noise = patches(this.rand, cfg.rest.patch), R = cfg.rest;
    for (let gy = 0; gy < F.H; gy++) {
      for (let gx = 0; gx < F.W; gx++) {
        const x = (gx + 0.5) * F.fcell, y = (gy + 0.5) * F.fcell, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        const j = gy * F.W + gx, indoor = roofed.has(m.floor[ty * m.w + tx]);
        F.place[j] = indoor ? ROOM : OPEN;
        if (indoor) this.inside[Math.floor(gy / cfg.sub) * F.w + Math.floor(gx / cfg.sub)] = 1;
        const z = zones.find((q) => tx >= q.c0 && tx <= q.c1 && ty >= q.r0 && ty <= q.r1); // the first wins
        if (z?.base && indoor) {
          const v = z.base * (1 - R.patchy + R.patchy * 2 * Math.max(0, noise(x, y) - 0.25));
          F.setRest(0, j, v);
          F.d[j] = v;
        }
      }
    }
    this.version = -1;
    this.openings = null;     // doors and windows, linked at the first step (they are built after the systems)
    this.fans = new Map();    // ceiling fan -> how far round it had turned
    this.gust = null;
    this.clock = 0;
    this.phase = 0;
    this.quietT = 0;          // s since anything stirred or fed the air where nothing hangs
    this.wave = { sx: new Float32Array(F.w), cx: new Float32Array(F.w), sy: new Float32Array(F.h), cy: new Float32Array(F.h) };
    this.jets = [];           // jets going on: { S (SMOKE.jets entry), k (kind), x, y, a (way), ph (of its thrashing), t, hiss }
    // the threads (cigarettes, butts, hot barrels): a pool of points (x, y, age, life, alpha, seed of the thread)
    const n = cfg.cig.max;
    this.rib = { n: 0, x: new Float32Array(n), y: new Float32Array(n), age: new Float32Array(n), life: new Float32Array(n), a: new Float32Array(n), seed: new Float32Array(n) };
    world.events.on('shot', ({ shooter, weapon }) => shooter && this.shot(shooter, weapon));
    world.events.on('explosion', ({ x, y, radius }) => this.blast(x, y, radius));
    world.events.on('gust', (g) => { this.gust = { dx: g.dx, dy: g.dy, t: g.t ?? 2 }; });
    // a pierced wall extinguisher empties itself away from its wall (a wall prop faces the room along its local +y)
    world.events.on('propDestroyed', ({ prop }) => prop.def.cloud && this.jet('powder', prop.x, prop.y, prop.body.angle + Math.PI / 2));
  }

  // ---- the house: walls, doors, windows

  walls() {
    const m = this.world.map, F = this.fluid, k = this.per;
    this.version = m.version ?? 0;
    for (let cy = 0; cy < F.h; cy++) {
      for (let cx = 0; cx < F.w; cx++) F.setSolid(cy * F.w + cx, m.isSolid(Math.floor(cx / k), Math.floor(cy / k)) ? 1 : 0);
    }
    if (this.openings) this.doorways(true);
  }

  // the flow cells of a tile, and the way out of it toward the open air when it lies between a room and the street
  opening(i) {
    const m = this.world.map, tx = i % m.w, ty = Math.floor(i / m.w), F = this.fluid, k = this.per, cells = [];
    for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) cells.push((ty * k + y) * F.w + tx * k + x);
    const roofed = new Set(AMBIENCE.indoors), kind = (x, y) => (m.isSolid(x, y) || !m.floor[y * m.w + x] ? 0 : roofed.has(m.floor[y * m.w + x]) ? 1 : 2);
    let out = null;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const a = kind(tx - dx, ty - dy), b = kind(tx + dx, ty + dy);
      if (a === 1 && b === 2) out = { x: dx, y: dy };
      if (a === 2 && b === 1) out = { x: -dx, y: -dy };
    }
    return { doors: [], pane: null, cells, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, out, open: false };
  }

  // the doorways (each tile of a run with the leaves over it: a double door has two) and the windows
  link() {
    const w = this.world, m = w.map, at = new Map();
    const tile = (i) => at.get(i) || at.set(i, this.opening(i)).get(i);
    for (const d of w.doors) for (const i of d.cells) tile(i).doors.push(d);
    for (const g of w.windows) tile(g.cy * m.w + g.cx).pane = g;
    this.openings = [...at.values()];
    this.doorways(true);
  }

  // a doorway is closed while every leaf of it is shut on its frame (and still there), a window while its pane is in
  doorways(force = false) {
    const w = this.world, F = this.fluid, shut = this.cfg.shut;
    const leafShut = (d) => w.doors.includes(d) && (d.locked || Math.abs(angDiff(d.body.angle, d.a0)) < shut);
    for (const o of this.openings) {
      const closed = o.pane ? w.windows.includes(o.pane) && o.pane.intact : o.doors.every(leafShut);
      if (!force && o.open === !closed) continue;
      o.open = !closed;
      for (const i of o.cells) F.setSolid(i, closed ? 1 : 0);
    }
  }

  // ---- what puts something in the air (kinds by name: 'smoke', 'soot', 'powder', 'steam')

  // one of SMOKE.puffs at (x, y), in its lumps thrown about (times `scale`, in amount and size)
  burst(name, x, y, scale = 1) {
    const P = this.cfg.puffs[name], R = this.rand, k = this.kind[P.kind], r = P.r * Math.sqrt(scale);
    for (let i = 0; i < P.lumps; i++) {
      const a = R() * 6.28, d = P.lumps > 1 ? r * 0.6 * Math.sqrt(R()) : 0;
      this.fluid.addDensity(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.6 + R() * 0.4), P.amount * scale * (0.7 + R() * 0.6), k);
    }
    this.quietT = 0;
  }

  // a steady source, to be called every step it goes on: `rate` per s of a kind over r px at (x, y), never over
  // `cap`, welling out of it at `swell` (volume 1/s per s); nothing where the air waits
  emit(kind, x, y, rate, dt, r, cap = 2, swell = 0) {
    if (!this.within(x, y, r)) return;
    this.fluid.addDensity(x, y, r, rate * dt, this.kind[kind], cap);
    if (swell) this.fluid.addExpand(x, y, r + 6, swell * dt);
    this.quietT = 0;
  }

  // something burning at (x, y), `what` its size (SMOKE.burn.size): soot rising off it, the hot air welling out
  burn(x, y, what, dt) {
    const B = this.cfg.burn, k = B.size[what];
    this.emit('soot', x, y, B.rate * k, dt, B.r * Math.sqrt(k), B.cap, B.swell * Math.sqrt(k));
  }

  // one of SMOKE.fumes going on at (x, y), at k of its rate
  fume(name, x, y, dt, k = 1) {
    const S = this.cfg.fumes[name];
    this.emit(S.kind, x, y, S.rate * k, dt, S.r);
  }

  // the air in a disc of radius r pulled toward (vx, vy) px/s, k of the way at its heart (a vent, a fan...)
  blow(x, y, r, vx, vy, k) {
    if (this.within(x, y, r)) this.fluid.push(x, y, r, vx, vy, k);
  }

  // a jet of SMOKE.jets[name] out of a hole at (x, y), along a
  jet(name, x, y, a) {
    const S = this.cfg.jets[name];
    this.jets.push({ S, k: this.kind[S.kind], x, y, a, ph: this.rand() * 6.28, t: 0, hiss: 0 });
    this.quietT = 0;
  }

  // a thread off a smouldering point (a butt on the floor, a hot barrel): call it every step it smokes; `o` keeps
  // its pace (o.wispT) and the seed of its thread
  wisp(o, x, y, dt, every = this.cfg.cig.wisp.every) {
    if ((o.wispT = (o.wispT || 0) - dt) > 0 || !this.within(x, y)) return;
    o.wispT = every;
    o.wispSeed ||= 1 + this.rand() * 50;
    this.thread(x, y, o.wispSeed, this.cfg.cig.wisp.alpha);
  }

  // a breath of smoke let out by ch ahead of his face: SMOKE.cig.exhale (after a drag) or .cloud (a cigar's)
  breath(ch, name) {
    const X = this.cfg.cig[name], F = this.fluid, a = ch.angle ?? 0, c = Math.cos(a), s = Math.sin(a), mx = ch.x + c * 6 * BODY_SCALE, my = ch.y + s * 6 * BODY_SCALE;
    F.addDensity(mx + c * 4, my + s * 4, X.r, X.amount);
    F.push(mx + c * X.reach * 0.5, my + s * X.reach * 0.5, X.reach * 0.5, c * X.jet, s * X.jet, 0.5);
    this.quietT = 0;
  }

  shot(shooter, weapon) {
    const M = this.cfg.muzzle, F = this.fluid, m = shooter.muzzlePos ? shooter.muzzlePos() : { x: shooter.x, y: shooter.y, a: shooter.angle };
    const a = m.a ?? shooter.angle ?? 0, c = Math.cos(a), s = Math.sin(a), k = M.by[weapon?.sound] ?? 1, rk = Math.sqrt(k);
    // the puff, strung along the first stretch of the shot, and the blast of air that throws it on along the bore
    for (let i = 1; i <= M.lumps; i++) {
      const u = i / M.lumps;
      F.addDensity(m.x + c * M.ahead * u, m.y + s * M.ahead * u, M.r * rk * (0.7 + 0.5 * u), M.amount * Math.min(1.5, k) * (1.15 - 0.35 * u));
    }
    for (let j = 1; j <= 2; j++) F.push(m.x + (c * M.reach * j) / 3, m.y + (s * M.reach * j) / 3, M.width * rk, c * M.jet * rk, s * M.jet * rk, M.k);
    // the spent case leaves the port with a breath of it, to the gun's right (fx/Casings.js)
    if (weapon?.eject && weapon.casing && shooter.portPos) {
      const P = M.port, q = shooter.portPos(), sc = Math.cos(a + Math.PI / 2), ss = Math.sin(a + Math.PI / 2);
      F.addDensity(q.x + sc * P.off, q.y + ss * P.off, P.r * rk, P.amount * Math.min(1.5, k));
      F.push(q.x + sc * P.reach * 0.5, q.y + ss * P.reach * 0.5, P.reach * 0.5, sc * P.side, ss * P.side, P.k);
    }
    this.quietT = 0;
  }

  blast(x, y, radius) {
    const B = this.cfg.blast, F = this.fluid, R = this.rand, soot = this.kind.soot;
    // the billow: lumps of soot thrown about its heart (never one smooth disc), pushed out of it
    for (let i = 0; i < B.lumps; i++) {
      const a = R() * 6.28, d = radius * B.r * Math.sqrt(R()) * 0.7;
      F.addDensity(x + Math.cos(a) * d, y + Math.sin(a) * d, radius * B.r * (0.3 + R() * 0.25), B.amount * (0.6 + R() * 0.6), soot);
    }
    F.addExpand(x, y, radius * 0.35, B.expand);
    // the billow rolls: eddies turning either way round its rim
    const a0 = R() * 6.28;
    for (let i = 0; i < B.eddies; i++) {
      const a = a0 + (i / B.eddies) * 6.28, d = radius * (0.45 + R() * 0.25);
      F.swirl(x + Math.cos(a) * d, y + Math.sin(a) * d, radius * 0.3, (i % 2 ? 1 : -1) * B.spin, B.vmax, 0.8);
    }
    this.quietT = 0;
  }

  // what heats the air for the lens (Game.lensView): the steam jets
  heat() { return this.jets.filter((j) => j.S.kind === 'steam').map((j) => ({ x: j.x, y: j.y, kind: 'steam' })); }

  // water sprayed at (x, y) (a sprinkler head) brings down what is in the air under it (SMOKE.wash)
  wash(x, y, dt) {
    const W = this.cfg.wash;
    if (this.within(x, y, W.r)) this.thin(x, y, W.r, W.rate, dt);
  }

  // ---- what the air hides

  // is the segment hidden by thick air (powder, soot, steam: never the grey of gunfire)?
  blocks(x0, y0, x1, y1) {
    const F = this.fluid, S = this.cfg.sight, wts = this.sight;
    let most = 0;
    for (let k = 0; k < wts.length; k++) most += F.kinds[k].peak * wts[k];
    if (most < S.thick) return false;
    return F.thickAlong(x0, y0, x1, y1, wts, S.thick, S.len) >= S.len;
  }

  // ---- stepping

  update(dt) {
    const w = this.world, F = this.fluid, c = this.cfg;
    if (!this.openings) this.link();
    if ((w.map.version ?? 0) !== this.version) this.walls();
    // the air about the view only (the whole map when there is no camera: tests)
    if (w.camera) {
      const v = w.view(), r = c.reach;
      F.setRegion(v.x - v.hw - r, v.y - v.hh - r, v.x + v.hw + r, v.y + v.hh + r);
    }
    // the power cut: the resting layer thins
    const dark = w.power && !w.power.on;
    F.restK += ((dark ? c.rest.dark : 1) - F.restK) * Math.min(1, c.rest.ease * dt);
    if (this.gust && (this.gust.t -= dt) <= 0) this.gust = null;
    this.stir(dt);
    this.spray(dt);
    this.smokers(dt, w.time);
    this.threads(dt);
    // nothing in the air and nothing stirring it: no need to step it
    this.quietT += dt;
    if (F.peak < 0.002 && !this.rib.n && this.quietT > 4) return;
    const P = 1 / c.rate;
    this.clock = Math.min(this.clock + dt, P * 2);
    while (this.clock >= P / 2) {
      this.clock -= P / 2;
      this.phase ^= 1;
      if (this.phase) {
        this.doorways();
        this.currents(P);
        this.machines(P);
        F.flow(P);
      } else F.carry(P);
    }
  }

  // is (x, y) within the air being stepped (or m px of it)?
  within(x, y, m = 0) {
    const r = this.fluid.region, C = this.fluid.cell;
    return x > r.x0 * C - m && x < r.x1 * C + m && y > r.y0 * C - m && y < r.y1 * C + m;
  }

  // the jets going on: their kind laid at the hole, the air thrown along them, the pressure falling, a hiss
  spray(dt) {
    if (!this.jets.length) return;
    const F = this.fluid, w = this.world;
    for (const j of this.jets) {
      const S = j.S, f = 1 - (1 - S.fall) * Math.min(1, j.t / S.dur);
      // the hole thrashes it about (`wobble` rad either way, `hz` times a s)
      const a = j.a + S.wobble * Math.sin(j.t * S.hz * 6.28 + j.ph), dx = Math.cos(a), dy = Math.sin(a), R = S.reach;
      j.t += dt;
      // laid at the hole and further out along it, the air thrown along it, swelling out at its end
      F.addDensity(j.x + dx * 4, j.y + dy * 4, S.r, S.rate * f * dt * 0.5, j.k, S.cap);
      F.addDensity(j.x + dx * R * 0.6, j.y + dy * R * 0.6, S.r * 1.6, S.rate * f * dt * 0.5, j.k, S.cap);
      F.push(j.x + dx * R * 0.5, j.y + dy * R * 0.5, R * 0.5, dx * S.speed * f, dy * S.speed * f, S.k);
      if (S.swell) F.addExpand(j.x + dx * R, j.y + dy * R, R * 0.6, S.swell * f * dt);
      if ((j.hiss -= dt) <= 0) {
        j.hiss = S.hiss;
        w.sound?.('hiss', j.x, j.y, S.vol * f, { pitch: S.pitch });
      }
    }
    this.jets = this.jets.filter((j) => j.t < j.S.dur);
    this.quietT = 0;
  }

  // people walking and cars going by drag the air with them, rounds along their line
  stir(dt) {
    const w = this.world, F = this.fluid, S = this.cfg.stir, Rd = this.cfg.round, Cr = this.cfg.car, C = F.cell;
    for (const ch of w.chars) {
      if (!ch.alive || !this.within(ch.x, ch.y)) continue;
      const v = Body.getVelocity(ch.body), vx = v.x * 60, vy = v.y * 60;
      if (vx * vx + vy * vy < S.speed * S.speed) continue;
      F.push(ch.x, ch.y, S.r, vx, vy, S.k);
      this.quietT = 0;
    }
    for (const p of w.props) {
      if (!p.moving || p.dead || !this.within(p.x, p.y, Cr.r)) continue;
      const v = Body.getVelocity(p.body), vx = v.x * 60, vy = v.y * 60;
      if (vx * vx + vy * vy < Cr.speed * Cr.speed) continue;
      F.push(p.x, p.y, Cr.r, vx, vy, Cr.k);
      this.quietT = 0;
    }
    for (const p of w.projectiles) {
      if (p.dead || !this.within(p.x, p.y)) continue;
      const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = Math.min(sp * dt, 80);
      for (let s = 0; s < len; s += C * 0.75) F.push(p.x - ux * s, p.y - uy * s, Rd.r, ux * Rd.speed, uy * Rd.speed, Rd.k);
      this.quietT = 0;
    }
  }

  // the air eased toward its own slow motion: convection under a ceiling (a divergence-free current made of two
  // drifting waves of a stream function), the wind and its gusts outdoors
  currents(dt) {
    const F = this.fluid, c = this.cfg, t = this.world.time, { x0, y0, x1, y1 } = F.region, Wv = this.wave;
    const K = (2 * Math.PI) / c.convect.size, om = (2 * Math.PI) / c.convect.period, A = c.convect.speed / K;
    for (let x = x0; x < x1; x++) { const p = (x + 0.5) * F.cell * K + t * om; Wv.sx[x] = Math.sin(p); Wv.cx[x] = Math.cos(p); }
    for (let y = y0; y < y1; y++) { const p = (y + 0.5) * F.cell * K * 0.83 - t * om * 0.7 + 1.3; Wv.sy[y] = Math.sin(p); Wv.cy[y] = Math.cos(p); }
    const W = c.wind, g = this.gust, wa = W.a + Math.sin(t * 0.05) * 0.4;
    const wx = Math.cos(wa) * W.speed + (g ? g.dx * W.gust : 0), wy = Math.sin(wa) * W.speed + (g ? g.dy * W.gust : 0);
    const ki = Math.min(1, c.convect.k * dt), ko = Math.min(1, W.k * dt), { u, v, solid, w } = F;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        if (this.inside[i]) {
          // psi = A sin(Kx + ..) sin(0.83 Ky + ..): u = dpsi/dy, v = -dpsi/dx
          const tu = A * K * 0.83 * Wv.sx[x] * Wv.cy[y], tv = -A * K * Wv.cx[x] * Wv.sy[y];
          u[i] += (tu - u[i]) * ki; v[i] += (tv - v[i]) * ki;
        } else {
          u[i] += (wx - u[i]) * ko; v[i] += (wy - v[i]) * ko;
        }
      }
    }
  }

  // ceiling fans, fires, the drafts of the openings to the open air
  machines(dt) {
    const w = this.world, F = this.fluid, c = this.cfg;
    for (const p of w.props) {
      if (!p.def.spin || p.dead || !this.within(p.x, p.y, c.fan.r)) continue;
      const turned = p.spun(), last = this.fans.get(p) ?? turned;
      this.fans.set(p, turned);
      const omega = (turned - last) / dt;
      if (Math.abs(omega) < 0.05) continue;
      const k = Math.min(1, Math.abs(omega) / (p.def.spin || 1));
      F.swirl(p.x, p.y, c.fan.r, omega * c.fan.turn, c.fan.vmax * k, c.fan.k);
      this.thin(p.x, p.y, c.fan.r, c.fan.mix * k, dt);
    }
    if (w.fires?.fires.length) for (const f of w.fires.lit()) this.burn(f.x, f.y, 'fire', dt);
    const D = c.draft;
    for (const o of this.openings) {
      if (!o.open || !o.out || !this.within(o.x, o.y)) continue;
      F.push(o.x, o.y, TILE * 0.75, o.out.x * D.speed, o.out.y * D.speed, D.k);
      this.spill(o, D.spill, dt);
    }
  }

  // the warm smoky air under a ceiling goes out over the lintel of an opening to the open air: what is over the rest
  // level in the opening and in the tile before it leaves at `rate` 1/s and comes out on the other side
  spill(o, rate, dt) {
    const F = this.fluid, f = F.fcell, k = 1 - Math.exp(-rate * dt), n = TILE / f;
    for (let q = 0; q < F.kinds.length; q++) {
      const K = F.kinds[q], d = K.d, rest = K.rest;
      if (K.peak < 1e-3) continue;
      let out = 0;
      for (let t = 0; t < 2; t++) {
        const x0 = Math.floor((o.x - TILE / 2 - o.out.x * TILE * t) / f), y0 = Math.floor((o.y - TILE / 2 - o.out.y * TILE * t) / f);
        for (let gy = y0; gy < y0 + n; gy++) {
          for (let gx = x0; gx < x0 + n; gx++) {
            const j = gy * F.W + gx, over = d[j] - (rest ? rest[j] * F.restK : 0);
            if (F.fsolid[j] || over <= 0) continue;
            d[j] -= over * k;
            out += over * k;
          }
        }
      }
      if (out > 0) F.addDensity(o.x + o.out.x * TILE * 0.9, o.y + o.out.y * TILE * 0.9, TILE * 0.5, out / (n * n * 0.6), q);
    }
  }

  // the air in a disc thinned down to its rest level at `rate` 1/s (a fan mixes it down, sprinklers bring it down)
  thin(x, y, rr, rate, dt) {
    const F = this.fluid, f = F.fcell, keep = Math.exp(-rate * dt);
    const gx0 = Math.max(0, Math.floor((x - rr) / f)), gx1 = Math.min(F.W - 1, Math.floor((x + rr) / f));
    const gy0 = Math.max(0, Math.floor((y - rr) / f)), gy1 = Math.min(F.H - 1, Math.floor((y + rr) / f));
    for (const K of F.kinds) {
      if (K.peak < 1e-3) continue;
      const d = K.d, rest = K.rest;
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const dx = (gx + 0.5) * f - x, dy = (gy + 0.5) * f - y;
          if (dx * dx + dy * dy > rr * rr) continue;
          const j = gy * F.W + gx, rs = rest ? rest[j] * F.restK : 0;
          if (d[j] > rs) d[j] = rs + (d[j] - rs) * keep;
        }
      }
    }
  }

  // the smokers about the view: a thread off the ember, a breath let out after a drag
  smokers(dt, t) {
    const w = this.world, S = this.cfg.cig;
    for (const ch of w.chars) {
      if (!this.within(ch.x, ch.y)) continue;
      const item = smoking(ch);
      if (!item) { ch.smokeT = 0; continue; }
      const h = ch.mouth ? null : ch.busyHands?.(), a = ch.angle ?? 0, c = Math.cos(a), s = Math.sin(a);
      // the ember: in his hand, or at his lips for a cigar clamped in his teeth
      const lx = h?.hr ? h.hr.x + 3 : ch.mouth ? 8 : 7, ly = h?.hr ? h.hr.y - 1 : ch.mouth ? 1.5 : 0;
      const ex = ch.x + (lx * c - ly * s) * BODY_SCALE, ey = ch.y + (lx * s + ly * c) * BODY_SCALE;
      if ((ch.smokeT = (ch.smokeT || 0) - dt) <= 0) {
        ch.smokeT = S.every * (item === 'cigar' ? 0.7 : 1);
        if (!ch.smokeSeed) ch.smokeSeed = 1 + this.rand() * 50;
        this.thread(ex, ey, ch.smokeSeed);
      }
      // the breath: when the exhale of a drag starts, a puff out of the mouth, ahead of the face
      const e = item === 'cig' ? exhale(t, ch.seed) : -1;
      if (e >= 0 && !(ch.exhaled >= 0)) this.breath(ch, 'exhale');
      ch.exhaled = e;
    }
  }

  thread(x, y, seed, alpha = this.cfg.cig.alpha) {
    const T = this.rib, S = this.cfg.cig;
    if (T.n >= S.max) return;
    const i = T.n++;
    T.x[i] = x; T.y[i] = y; T.age[i] = 0; T.life[i] = mix(S.life, this.rand()); T.a[i] = alpha; T.seed[i] = seed;
  }

  // the points of the threads ride the air and sway; what they lose as they fade goes into the layer
  threads(dt) {
    const T = this.rib, S = this.cfg.cig, F = this.fluid, t = this.world.time;
    for (let i = 0; i < T.n; i++) {
      const age = (T.age[i] += dt), life = T.life[i], k = age / life;
      F.deposit(T.x[i], T.y[i], T.a[i] * S.toGrid * (dt / life));
      if (age >= life) {
        const j = --T.n;
        T.x[i] = T.x[j]; T.y[i] = T.y[j]; T.age[i] = T.age[j]; T.life[i] = T.life[j]; T.a[i] = T.a[j]; T.seed[i] = T.seed[j];
        i--;
        continue;
      }
      // the whole thread sways together (the same phase along it: it waves), each point wanders more as it ages
      F.velocityAt(T.x[i], T.y[i], tmp);
      const sd = T.seed[i], ph = t * S.curl + sd, jt = S.jitter * k;
      tmp.x += Math.cos(ph) * S.sway * k + Math.sin(age * 3.1 + sd * 7) * jt;
      tmp.y += Math.sin(ph * 1.3 + sd) * S.sway * k + Math.cos(age * 2.7 + sd * 5) * jt;
      T.x[i] += tmp.x * dt; T.y[i] += tmp.y * dt;
    }
  }
}
