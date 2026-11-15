// The smoke in the air (SMOKE in data/atmosphere.js). The level's air is a coarse fluid (engine/physics/Fluid.js):
// seen from above, the layer under the ceilings. Walls hold it, a shut door or an intact pane too; an open door, a
// smashed window let it through, and one between a room and the open air draws the room's smoke out.
// What makes smoke: the smokers (a thread off each cigarette, carried by the air, that spreads into the layer as it
// fades; a breath let out after a drag), every shot (a puff thrown out of the muzzle), blasts (a billow pushed out
// with eddies round it), fires. What moves it: a slow convection under the ceilings, the wind and its gusts outdoors,
// people walking (they drag the air), rounds (along their line), the ceiling fans (they turn it and thin it). What
// takes it: its loss, slow in a room (a gunfight's smoke hangs 10-20 s), fast in the open air. A smoky place of the
// soundscape keeps a faint patchy layer at rest, which the power cut thins.
// Only the air about the view is stepped. DOM-free: render/SmokeArt.js lights it with the light map.
import { TILE, BODY_SCALE, AMBIENCE } from '../Config.js';
import { SMOKE } from '../data/atmosphere.js';
import { GESTURES, exhale } from '../ai/Pastimes.js';
import { seeded } from './Weather.js';
import { angDiff } from '../../engine/math.js';
import Fluid from '../../engine/physics/Fluid.js';

const { Body } = Matter;
const mix = (r, k) => r[0] + (r[1] - r[0]) * k;
const tmp = { x: 0, y: 0 };

// what a character is smoking right now: 'cig', 'cigar' or null
export function smoking(ch) {
  if (!ch.alive) return null;
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
    const m = world.map, C = cfg.cell, F = (this.fluid = new Fluid(Math.ceil(m.widthPx / C), Math.ceil(m.heightPx / C), C, cfg.sub));
    Object.assign(F, { drag: cfg.drag, vorticity: cfg.vorticity, spread: cfg.spread, sweeps: cfg.sweeps, recover: cfg.recover });
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
        F.setLoss(j, indoor ? cfg.loss.room : cfg.loss.open);
        if (indoor) this.inside[Math.floor(gy / cfg.sub) * F.w + Math.floor(gx / cfg.sub)] = 1;
        const z = zones.find((q) => tx >= q.c0 && tx <= q.c1 && ty >= q.r0 && ty <= q.r1); // the first wins
        if (z?.base && indoor) F.rest[j] = F.d[j] = z.base * (1 - R.patchy + R.patchy * 2 * Math.max(0, noise(x, y) - 0.25));
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
    // the cigarettes' threads: a pool of points (x, y, age, life, alpha, seed of the thread)
    const n = cfg.cig.max;
    this.rib = { n: 0, x: new Float32Array(n), y: new Float32Array(n), age: new Float32Array(n), life: new Float32Array(n), a: new Float32Array(n), seed: new Float32Array(n) };
    world.events.on('shot', ({ shooter, weapon }) => shooter && this.shot(shooter, weapon));
    world.events.on('explosion', ({ x, y, radius }) => this.blast(x, y, radius));
    world.events.on('gust', (g) => { this.gust = { dx: g.dx, dy: g.dy, t: g.t ?? 2 }; });
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

  // ---- what makes smoke

  shot(shooter, weapon) {
    const M = this.cfg.muzzle, F = this.fluid, m = shooter.muzzlePos ? shooter.muzzlePos() : { x: shooter.x, y: shooter.y, a: shooter.angle };
    const a = m.a ?? shooter.angle ?? 0, c = Math.cos(a), s = Math.sin(a), k = M.by[weapon?.sound] ?? 1, rk = Math.sqrt(k);
    // the puff, drawn out along the first stretch of the shot, and the blast of air that throws it on
    for (let i = 1; i <= 3; i++) F.addDensity(m.x + c * M.ahead * i * 0.5, m.y + s * M.ahead * i * 0.5, M.r * rk * (0.6 + i * 0.2), M.amount * Math.min(1.5, k) * (1.2 - i * 0.2));
    F.push(m.x + c * M.reach * 0.5, m.y + s * M.reach * 0.5, M.reach * 0.5, c * M.jet * rk, s * M.jet * rk, M.k);
    this.quietT = 0;
  }

  blast(x, y, radius) {
    const B = this.cfg.blast, F = this.fluid, R = this.rand;
    // the billow: lumps of smoke thrown about its heart (never one smooth disc), pushed out of it
    for (let i = 0; i < B.lumps; i++) {
      const a = R() * 6.28, d = radius * B.r * Math.sqrt(R()) * 0.7;
      F.addDensity(x + Math.cos(a) * d, y + Math.sin(a) * d, radius * B.r * (0.3 + R() * 0.25), B.amount * (0.6 + R() * 0.6));
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

  // people walking drag the air with them, rounds along their line
  stir(dt) {
    const w = this.world, F = this.fluid, S = this.cfg.stir, Rd = this.cfg.round, C = F.cell;
    for (const ch of w.chars) {
      if (!ch.alive || !this.within(ch.x, ch.y)) continue;
      const v = Body.getVelocity(ch.body), vx = v.x * 60, vy = v.y * 60;
      if (vx * vx + vy * vy < S.speed * S.speed) continue;
      F.push(ch.x, ch.y, S.r, vx, vy, S.k);
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
    if (w.fires?.fires.length) {
      for (const f of w.fires.lit()) if (this.within(f.x, f.y)) { F.addDensity(f.x, f.y, c.fire.r, c.fire.amount * dt); this.quietT = 0; }
    }
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
    let out = 0;
    for (let t = 0; t < 2; t++) {
      const x0 = Math.floor((o.x - TILE / 2 - o.out.x * TILE * t) / f), y0 = Math.floor((o.y - TILE / 2 - o.out.y * TILE * t) / f);
      for (let gy = y0; gy < y0 + n; gy++) {
        for (let gx = x0; gx < x0 + n; gx++) {
          const j = gy * F.W + gx, over = F.d[j] - F.rest[j] * F.restK;
          if (F.fsolid[j] || over <= 0) continue;
          F.d[j] -= over * k;
          out += over * k;
        }
      }
    }
    if (out > 0) F.addDensity(o.x + o.out.x * TILE * 0.9, o.y + o.out.y * TILE * 0.9, TILE * 0.5, out / (n * n * 0.6));
  }

  // a fan mixes the layer down into the room: what is over the rest level goes faster under it
  thin(x, y, rr, rate, dt) {
    const F = this.fluid, f = F.fcell, keep = Math.exp(-rate * dt);
    const gx0 = Math.max(0, Math.floor((x - rr) / f)), gx1 = Math.min(F.W - 1, Math.floor((x + rr) / f));
    const gy0 = Math.max(0, Math.floor((y - rr) / f)), gy1 = Math.min(F.H - 1, Math.floor((y + rr) / f));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = (gx + 0.5) * f - x, dy = (gy + 0.5) * f - y;
        if (dx * dx + dy * dy > rr * rr) continue;
        const j = gy * F.W + gx, rs = F.rest[j] * F.restK;
        if (F.d[j] > rs) F.d[j] = rs + (F.d[j] - rs) * keep;
      }
    }
  }

  // the cigarettes about the view: a thread off the ember, a breath let out after a drag
  smokers(dt, t) {
    const w = this.world, S = this.cfg.cig, F = this.fluid;
    for (const ch of w.chars) {
      if (!this.within(ch.x, ch.y)) continue;
      const item = smoking(ch);
      if (!item) { ch.smokeT = 0; continue; }
      const h = ch.busyHands?.(), a = ch.angle ?? 0, c = Math.cos(a), s = Math.sin(a);
      const lx = h?.hr ? h.hr.x + 3 : 7, ly = h?.hr ? h.hr.y - 1 : 0;
      const ex = ch.x + (lx * c - ly * s) * BODY_SCALE, ey = ch.y + (lx * s + ly * c) * BODY_SCALE;
      if ((ch.smokeT = (ch.smokeT || 0) - dt) <= 0) {
        ch.smokeT = S.every * (item === 'cigar' ? 0.7 : 1);
        if (!ch.smokeSeed) ch.smokeSeed = 1 + this.rand() * 50;
        this.thread(ex, ey, ch.smokeSeed);
      }
      // the breath: when the exhale of a drag starts, a puff out of the mouth, ahead of the face
      const e = item === 'cig' ? exhale(t, ch.seed) : -1;
      if (e >= 0 && !(ch.exhaled >= 0)) {
        const X = S.exhale, mx = ch.x + c * 6 * BODY_SCALE, my = ch.y + s * 6 * BODY_SCALE;
        F.addDensity(mx + c * 4, my + s * 4, X.r, X.amount);
        F.push(mx + c * X.reach * 0.5, my + s * X.reach * 0.5, X.reach * 0.5, c * X.jet, s * X.jet, 0.5);
      }
      ch.exhaled = e;
    }
  }

  thread(x, y, seed) {
    const T = this.rib, S = this.cfg.cig;
    if (T.n >= S.max) return;
    const i = T.n++;
    T.x[i] = x; T.y[i] = y; T.age[i] = 0; T.life[i] = mix(S.life, this.rand()); T.a[i] = S.alpha; T.seed[i] = seed;
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
