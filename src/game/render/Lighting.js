import { TILE, LIGHTING as L } from '../Config.js';
import { spriteOpt } from '../../engine/Assets.js';
import { clamp } from '../../engine/math.js';
import { P } from '../fx/Particles.js';
import { puddleShape } from '../systems/Liquids.js';
import { ROOF_DECOR } from '../data/roofs.js';

// 2D lighting: a low-res light map (night ambient + coloured lights with wall shadows from visibility polygons)
// multiplied over the scene, then additive bloom, anamorphic flares and wet-floor reflections.
// Level lights: `level.lights` = [[x, y, radius, '#color', intensity, flicker?, {dir, cone, bulb}?], ...] in tile units.
// They are indirect fill (sky glow, light spilling from off-screen): no visible source is drawn unless `bulb` is set.
// Visible sources are props (lamps, tubes, signs, screens, headlights): shoot the lamp and its light dies.
// Prop lights: `def.light` (or LIGHTING.propLights[type]) = { r, color, intensity, flicker, x, y, dir, cone } or an array,
// r/x/y in px in the prop's local frame (sprites face +x), dir/cone in radians. Flicker: true|'buzz', 'broken', 'pulse',
// 'tv', 'disco' (moving unshadowed spot). `spots: n` makes it a mirror ball: instead of one pool of light, n small
// ones sweep the room round it within r, cut by the walls (drawSpots).
// Rooftop glows: pieces of `level.roof` with a `light` (data/roofs.js) shine on their roof, unshadowed.

const STREET = new Set(['asphalt', 'asphalt_line', 'sidewalk', 'grass', 'dirt']);
const LIT_GRID = 16; // px per cell of the brightness grid (levelAt)

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return hex.length === 4
    ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
    : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = (c) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const toByte = (c) => c.map((v) => Math.round(clamp(v, 0, 1) * 255));

// light i of a prop is on unless that lamp was smashed (vehicles keep one flag per lamp)
const lampOn = (p, i) => !p.lamps || p.lamps[i];
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }

// brightness multiplier of a flickering light at time t
function flicker(kind, seed, t) {
  switch (kind) {
    case true: case 'buzz': {
      const dip = hash(Math.floor(t * 9 + seed * 13)) > 0.965 ? 0.45 : 1;
      return (0.9 + 0.1 * noise(t * 22 + seed)) * dip;
    }
    case 'broken': {
      const cyc = 2.2 + (seed % 1) * 2.5, ph = (t + seed * 7) % cyc;
      if (ph < 0.7) return hash(Math.floor((t + seed) * 26)) > 0.55 ? 0.95 : 0.06;
      if (ph < 0.9) return 0.05;
      return 0.9 + 0.1 * noise(t * 30 + seed);
    }
    case 'pulse': {
      const b = ((t * L.bpm) / 60 + seed * 0.25) % 1;
      return 0.55 + 0.45 * (1 - b) * (1 - b);
    }
    case 'tv': return 0.55 + 0.45 * noise(t * 7 + seed * 5) * (hash(Math.floor(t * 5 + seed)) > 0.15 ? 1 : 0.4);
    case 'disco': return 0.7 + 0.3 * Math.sin(t * 5 + seed * 3);
    default: return 1;
  }
}

// Animated sign (`def.sign`): how bright letter i of n is. The letters come on one by one, hold, blink, go dark
// for a beat; the faulty one never quite settles.
function signLevel(sign, i, seed, t) {
  const n = sign.letters.length, ph = (t + seed) % 7.5;
  let a = ph < n * 0.22 ? (ph >= i * 0.22 ? 1 : 0)
    : ph < 4.8 ? 1
    : ph < 5.7 ? Math.floor((ph - 4.8) / 0.15) % 2
    : ph < 7 ? 1 : 0;
  if (i === sign.faulty) a *= flicker('broken', seed, t);
  return a;
}

// ---------- visibility polygon from a point against wall segments ----------
// segs: flat [ax, ay, bx, by, ...]; returns { pts: [x, y, ...], seg: [segment index or -1 per point] }
function visibility(px, py, R, segs) {
  const x0 = px - R, x1 = px + R, y0 = py - R, y1 = py + R;
  const loc = [];
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if ((ax > bx ? ax : bx) < x0 || (ax < bx ? ax : bx) > x1 || (ay > by ? ay : by) < y0 || (ay < by ? ay : by) > y1) continue;
    loc.push(ax, ay, bx, by);
  }
  const nWall = loc.length;
  loc.push(x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0);
  const angles = [];
  for (let i = 0; i < loc.length; i += 2) {
    const a = Math.atan2(loc[i + 1] - py, loc[i] - px);
    angles.push(a - 2e-4, a, a + 2e-4);
  }
  angles.sort((a, b) => a - b);
  const pts = [], seg = [];
  let last = -10;
  for (const a of angles) {
    if (a - last < 1e-6) continue;
    last = a;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = Infinity, bi = -1;
    for (let i = 0; i < loc.length; i += 4) {
      const ax = loc[i], ay = loc[i + 1], ex = loc[i + 2] - ax, ey = loc[i + 3] - ay;
      const den = dx * ey - dy * ex;
      if (den > -1e-9 && den < 1e-9) continue;
      const qx = ax - px, qy = ay - py;
      const t = (qx * ey - qy * ex) / den;
      if (t <= 0 || t >= best) continue;
      const u = (qx * dy - qy * dx) / den;
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      best = t; bi = i;
    }
    if (bi < 0) continue;
    pts.push(px + dx * best, py + dy * best);
    seg.push(bi < nWall ? bi : -1);
  }
  return { pts, seg };
}

export default class Lighting {
  constructor(world) {
    this.world = world;
    this.map = world.map;
    this.version = this.map.version ?? 0;
    this.solidCopy = this.map.solid.slice();
    this.blobs = new Map();
    this.propEntries = new WeakMap();
    this.gradStops = L.falloff;
    this.buildSegments();
    this.lights = (world.level.lights || []).map((d, i) => this.makeLevelLight(d, i));
    for (const d of world.level.roof || []) this.addRoofLight(d);
    this.buildAmbient();
    this.buildLevelLayers();
    this.gridDirty = true;
    this.tmp = canvas(64, 64);
    this.view = { x0: 0, y0: 0, w: 0, h: 0 };
  }

  // ---------------- setup ----------------
  makeLevelLight([x, y, r, color, intensity = 1, fl = false, opt = {}], i) {
    const l = this.makeLight(x * TILE + 0.013, y * TILE + 0.017, r * TILE, color, intensity, fl, i * 1.618 + 0.37);
    if (opt.cone) { l.cone = (opt.cone * Math.PI) / 180; l.dir = ((opt.dir ?? 0) * Math.PI) / 180; }
    l.bare = !opt.bulb;
    return l;
  }

  // a skylight or a door lamp up on a roof: lights the roof around it, never the street below
  addRoofLight([kind, col, row, deg = 0]) {
    const d = ROOF_DECOR[kind]?.light;
    if (!d) return;
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), x = col * TILE, y = row * TILE;
    const lx = d.x || 0, ly = d.y || 0;
    const l = this.makeLight(x + lx * c - ly * s, y + lx * s + ly * c, d.r, d.color, d.intensity, d.flicker ?? false,
      this.lights.length * 1.618 + 0.37);
    l.shadows = false;
    l.bare = true;
    l.glow = { img: spriteOpt(`roof/${kind}_glow`), x, y, a }; // the piece's emissive map
    this.lights.push(l);
  }

  makeLight(x, y, r, color, intensity, fl, seed) {
    const c = rgb(color);
    return {
      x, y, r, color, rgb: c, lum: lum(c), intensity, flicker: fl, seed, cone: 0, dir: 0,
      shadows: fl !== 'disco', cache: null, dirty: true, bare: false,
    };
  }

  // wall edges between solid and open tiles, merged along rows / columns. Outside the map counts as the border
  // tile next to it, so an open border (a street running off the map) casts no shadow edge.
  buildSegments() {
    const m = this.map, T = TILE, segs = [];
    const S = (x, y) => m.isSolid(clamp(x, 0, m.w - 1), clamp(y, 0, m.h - 1));
    for (let y = 0; y <= m.h; y++) {
      let start = 0, kind = 0;
      for (let x = 0; x <= m.w; x++) {
        let k = 0;
        if (x < m.w) { const a = S(x, y - 1), b = S(x, y); if (a !== b) k = a ? 1 : 2; }
        if (k !== kind) { if (kind) segs.push(start * T, y * T, x * T, y * T); start = x; kind = k; }
      }
    }
    for (let x = 0; x <= m.w; x++) {
      let start = 0, kind = 0;
      for (let y = 0; y <= m.h; y++) {
        let k = 0;
        if (y < m.h) { const a = S(x - 1, y), b = S(x, y); if (a !== b) k = a ? 1 : 2; }
        if (k !== kind) { if (kind) segs.push(x * T, start * T, x * T, y * T); start = y; kind = k; }
      }
    }
    this.segs = segs;
  }

  areaOf(x, y) {
    const m = this.map;
    const f = m.floor[y * m.w + x];
    if (m.isWallChar(x, y)) {
      // walls bordering a room take the indoor tint
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const g = m.floor[(y + dy) * m.w + x + dx];
        if (x + dx >= 0 && y + dy >= 0 && x + dx < m.w && y + dy < m.h && g && !STREET.has(g)) return 'wall';
      }
      return m.isRoof(x, y) ? 'roof' : 'street';
    }
    if (!f) return m.isSolid(x, y) ? 'void' : 'street';
    if (f === 'neon_floor') return 'neon';
    return STREET.has(f) ? 'street' : 'inside';
  }

  // night tint per tile, softened (1 texel = 1/4 tile)
  buildAmbient() {
    const m = this.map, k = 4;
    const raw = canvas(m.w * k, m.h * k), g = raw.getContext('2d');
    const amb = {};
    for (const key in L.ambient) amb[key] = css(toByte(L.ambient[key]));
    this.ambGrid = new Float32Array(m.w * m.h);
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const a = this.areaOf(x, y);
        g.fillStyle = amb[a];
        g.fillRect(x * k, y * k, k, k);
        this.ambGrid[y * m.w + x] = lum(toByte(L.ambient[a]));
      }
    }
    if (!this.ambient) this.ambient = canvas(raw.width, raw.height);
    const a = this.ambient.getContext('2d');
    a.globalCompositeOperation = 'copy';
    a.filter = 'blur(1.5px)';
    a.drawImage(raw, 0, 0);
    a.filter = 'none';
    a.globalCompositeOperation = 'source-over';
    this.ambScale = k / TILE;
  }

  // reflective floor mask + static emissive (neon floor) at bloom resolution
  buildLevelLayers() {
    const m = this.map, b = L.bloomScale, T = TILE * b;
    this.reflMask = canvas(Math.ceil(m.widthPx * b), Math.ceil(m.heightPx * b));
    this.emissive = canvas(this.reflMask.width, this.reflMask.height);
    const rg = this.reflMask.getContext('2d'), eg = this.emissive.getContext('2d');
    const refl = new Set(L.reflectFloors);
    const glow = spriteOpt('tiles/neon_floor_glow');
    eg.imageSmoothingEnabled = true;
    rg.fillStyle = '#fff';
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const f = m.floor[y * m.w + x];
        if (!f || m.isSolid(x, y)) continue;
        if (refl.has(f)) rg.fillRect(x * T, y * T, T, T);
        if (f === 'neon_floor') {
          if (glow) eg.drawImage(glow, x * T, y * T, T, T);
          else { eg.globalAlpha = 0.8; eg.drawImage(spriteOpt('tiles/neon_floor') || glow, x * T, y * T, T, T); eg.globalAlpha = 1; }
        }
      }
    }
  }

  // ---------------- walls changed (destructible tiles) ----------------
  sync() {
    const m = this.map;
    if ((m.version ?? 0) === this.version) return;
    this.version = m.version ?? 0;
    const changed = [];
    for (let i = 0; i < m.solid.length; i++) {
      if (m.solid[i] !== this.solidCopy[i]) changed.push(((i % m.w) + 0.5) * TILE, (Math.floor(i / m.w) + 0.5) * TILE);
    }
    this.solidCopy = m.solid.slice();
    if (!changed.length) return;
    this.buildSegments();
    this.buildAmbient();
    // a rooftop piece that went down with its roof no longer glows
    this.lights = this.lights.filter((l) => !l.glow || m.isWallChar(Math.floor(l.glow.x / TILE), Math.floor(l.glow.y / TILE)));
    const touch = (l) => {
      for (let i = 0; i < changed.length; i += 2) {
        if (Math.abs(changed[i] - l.x) < l.r + TILE && Math.abs(changed[i + 1] - l.y) < l.r + TILE) { l.dirty = true; return; }
      }
    };
    for (const l of this.lights) touch(l);
    for (const p of this.world.props) for (const l of this.propEntries.get(p) || []) touch(l);
    this.gridDirty = true;
  }

  propLights(p) {
    let list = this.propEntries.get(p);
    if (list) return list;
    const def = p.def.light ?? L.propLights[p.type];
    const glow = !!spriteOpt(`props/${p.type}_glow`);
    list = [];
    for (const d of def ? (Array.isArray(def) ? def : [def]) : []) {
      const l = this.makeLight(0, 0, d.r, d.color, d.intensity ?? 1, d.flicker ?? false, hash(p.x * 0.37 + p.y * 0.11) * 10 + list.length);
      l.lx = d.x || 0; l.ly = d.y || 0; l.ldir = d.dir || 0; l.cone = d.cone || 0;
      l.spots = d.spots || 0;
      l.drawn = glow; // the sprite's emissive map already shows the source
      list.push(l);
    }
    this.propEntries.set(p, list);
    if (list.length) this.gridDirty = true;
    return list;
  }

  // follow the prop; shadows rebuilt when it moved
  placePropLight(p, l) {
    const a = p.body.angle, c = Math.cos(a), s = Math.sin(a);
    const k = p.def.hung ? p.kick : null; // a hanging lamp takes its light along as it swings
    const x = p.x + l.lx * c - l.ly * s + (k ? k.x : 0), y = p.y + l.lx * s + l.ly * c + (k ? k.y : 0);
    if (Math.abs(x - l.x) > 1.5 || Math.abs(y - l.y) > 1.5 || Math.abs(a + l.ldir - l.dir) > 0.03) {
      l.x = x; l.y = y; l.dir = a + l.ldir; l.dirty = true;
    }
  }

  // ---------------- per light shadow caches ----------------
  gradient(g, x, y, r, c, a = 1) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [pos, al] of this.gradStops) gr.addColorStop(pos, css(c, al * a));
    return gr;
  }

  // light position pushed out of walls (signs mounted on a wall)
  openPoint(x, y) {
    const m = this.map;
    if (!m.solidAt(x, y)) return [x, y];
    for (let d = 2; d <= 24; d += 2) {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (!m.solidAt(x + dx * d, y + dy * d)) return [x + dx * d, y + dy * d];
    }
    return null;
  }

  buildCache(l) {
    l.dirty = false;
    const s = L.scale, R = l.r;
    const size = Math.ceil(2 * R * s) + 2;
    if (!l.cache || l.cache.width !== size) l.cache = canvas(size, size);
    if (this.tmp.width < size) this.tmp = canvas(size, size);
    const tmp = this.tmp, g = tmp.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    const o = l.shadows ? this.openPoint(l.x, l.y) : [l.x, l.y];
    l.poly = null;
    if (o) {
      g.setTransform(s, 0, 0, s, -(l.x - R) * s, -(l.y - R) * s);
      g.globalCompositeOperation = 'lighter';
      const n = l.shadows ? Math.max(1, L.softSamples) : 1;
      const grad = this.gradient(g, l.x, l.y, R, l.rgb, 1 / n);
      for (let k = 0; k < n; k++) {
        const ja = (k / n) * Math.PI * 2 + l.seed, jr = k ? L.softRadius : 0;
        let px = o[0] + Math.cos(ja) * jr, py = o[1] + Math.sin(ja) * jr;
        if (this.map.solidAt(px, py)) { px = o[0]; py = o[1]; }
        g.save();
        if (l.shadows) {
          const v = visibility(px, py, R, this.segs);
          if (!k) l.poly = v;
          this.tracePoly(g, v.pts);
          g.clip();
        }
        if (l.cone) this.clipCone(g, l);
        g.fillStyle = grad;
        g.fillRect(l.x - R, l.y - R, R * 2, R * 2);
        g.restore();
      }
      // lit wall faces along the visible edges
      if (l.poly && L.rimAlpha > 0) {
        g.save();
        if (l.cone) this.clipCone(g, l);
        g.globalAlpha = L.rimAlpha;
        g.strokeStyle = this.gradient(g, l.x, l.y, R, l.rgb);
        g.lineWidth = L.rimWidth;
        g.beginPath();
        const { pts, seg } = l.poly, n2 = seg.length;
        for (let i = 0; i < n2; i++) {
          const j = (i + 1) % n2;
          if (seg[i] < 0 || seg[i] !== seg[j]) continue;
          g.moveTo(pts[i * 2], pts[i * 2 + 1]);
          g.lineTo(pts[j * 2], pts[j * 2 + 1]);
        }
        g.stroke();
        g.restore();
      }
      g.globalCompositeOperation = 'source-over';
    }
    const cg = l.cache.getContext('2d');
    cg.globalCompositeOperation = 'copy';
    cg.filter = L.shadowBlur ? `blur(${L.shadowBlur}px)` : 'none';
    cg.drawImage(tmp, 0, 0, size, size, 0, 0, size, size);
    cg.filter = 'none';
    l.cx = l.x - R; l.cy = l.y - R; l.cs = size / s;
  }

  tracePoly(g, pts) {
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  }

  clipCone(g, l) {
    g.beginPath();
    g.moveTo(l.x, l.y);
    g.arc(l.x, l.y, l.r, l.dir - l.cone, l.dir + l.cone);
    g.closePath();
    g.clip();
  }

  // a mirror ball's light: `spots` small pools turning round it, all the same way and each on its own ring, some
  // tinted by the room's lamps; whatever a wall hides from the ball stays dark
  drawSpots(g, l, k, t) {
    if (!l.poly || l.dirty) { l.poly = visibility(l.x, l.y, l.r, this.segs); l.dirty = false; }
    g.save();
    this.tracePoly(g, l.poly.pts);
    g.clip();
    for (let i = 0; i < l.spots; i++) {
      const ring = 0.25 + 0.75 * hash(i * 7.3 + l.seed), a = t * L.ball.turn + (i / l.spots) * Math.PI * 2 + hash(i * 3.1) * 0.8;
      const r = l.r * ring, size = L.ball.size * (0.6 + 0.6 * ring);
      g.globalAlpha = clamp(k * (0.6 + 0.4 * Math.sin(t * 2.1 + i * 1.7)), 0, 1);
      g.drawImage(this.blob(L.ball.tints[i % L.ball.tints.length], true), l.x + Math.cos(a) * r - size, l.y + Math.sin(a) * r * 0.85 - size * 0.8, size * 2, size * 1.6);
    }
    g.restore();
  }

  // soft radial sprite of a colour (unshadowed lights, glows, reflections); spot = flat disc with a soft rim
  blob(color, spot = false) {
    const key = spot ? color + 's' : color;
    let b = this.blobs.get(key);
    if (b) return b;
    b = canvas(64, 64);
    const g = b.getContext('2d'), c = rgb(color);
    if (spot) {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      for (const [p, a] of [[0, 1], [0.5, 0.85], [0.78, 0.4], [1, 0]]) gr.addColorStop(p, css(c, a));
      g.fillStyle = gr;
    } else g.fillStyle = this.gradient(g, 32, 32, 32, c);
    g.fillRect(0, 0, 64, 64);
    this.blobs.set(key, b);
    return b;
  }

  // ---------------- brightness grid for stealth ----------------
  buildGrid() {
    this.gridDirty = false;
    const m = this.map, gs = LIT_GRID, gw = Math.ceil(m.widthPx / gs), gh = Math.ceil(m.heightPx / gs);
    const grid = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) grid[y * gw + x] = this.ambGrid[Math.floor((y * gs) / TILE) * m.w + Math.floor((x * gs) / TILE)];
    }
    const add = (l) => {
      if (!l.shadows) return; // disco spots wander, rooftop glows are above the street
      const c0 = Math.max(0, Math.floor((l.x - l.r) / gs)), c1 = Math.min(gw - 1, Math.floor((l.x + l.r) / gs));
      const r0 = Math.max(0, Math.floor((l.y - l.r) / gs)), r1 = Math.min(gh - 1, Math.floor((l.y + l.r) / gs));
      const o = this.openPoint(l.x, l.y);
      if (!o) return;
      for (let y = r0; y <= r1; y++) {
        for (let x = c0; x <= c1; x++) {
          const px = (x + 0.5) * gs, py = (y + 0.5) * gs;
          const d = Math.hypot(px - l.x, py - l.y) / l.r;
          if (d >= 1) continue;
          if (l.cone) {
            let da = Math.atan2(py - l.y, px - l.x) - l.dir;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) > l.cone) continue;
          }
          if (m.raycast(o[0], o[1], px, py)) continue;
          grid[y * gw + x] += l.lum * l.intensity * (1 - d) * (1 - d) * 1.2;
        }
      }
    };
    for (const l of this.lights) add(l);
    for (const p of this.world.props) {
      if (p.dead || p.lightsOut || p.moving) continue;
      this.propLights(p).forEach((l, i) => { if (lampOn(p, i)) add(l); });
    }
    this.grid = grid; this.gw = gw; this.gh = gh;
  }

  // 0..1 brightness at a world position (AI stealth: darker = harder to see)
  levelAt(x, y) {
    if (this.gridDirty || !this.grid) this.buildGrid();
    const gx = clamp(Math.floor(x / LIT_GRID), 0, this.gw - 1), gy = clamp(Math.floor(y / LIT_GRID), 0, this.gh - 1);
    let v = this.grid[gy * this.gw + gx];
    for (const l of this.world.lights) {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < l.r) v += (1 - d / l.r) * clamp(l.t / l.dur, 0, 1);
    }
    return clamp(v, 0, 1);
  }

  // ---------------- per frame ----------------
  active(cam) { return L.enabled && cam === this.world.camera; }

  setView(cam) {
    const v = cam.viewRadius(), q = 16;
    const cx = cam.x + cam.kick.x, cy = cam.y + cam.kick.y;
    const x0 = Math.floor((cx - v.x) / q) * q, y0 = Math.floor((cy - v.y) / q) * q;
    const w = Math.ceil((v.x * 2) / q) * q + q, h = Math.ceil((v.y * 2) / q) * q + q;
    this.view = { x0, y0, w, h };
    const s = L.scale, b = L.bloomScale;
    const need = (c, cw, ch) => (c && c.width === cw && c.height === ch ? c : canvas(cw, ch));
    this.lm = need(this.lm, w * s, h * s);
    this.em = need(this.em, w * b, h * b);
    this.bl = need(this.bl, w * b, h * b);
    this.rf = need(this.rf, w * b, h * b);
    this.pd = need(this.pd, w * b, h * b);
    this.fl = need(this.fl, Math.ceil((w * b) / 6), h * b);
  }

  inView(x, y, r) {
    const v = this.view;
    return x + r > v.x0 && x - r < v.x0 + v.w && y + r > v.y0 && y - r < v.y0 + v.h;
  }

  // every light this frame with its current strength: [light, strength]
  collect(t) {
    const out = [];
    for (const l of this.lights) {
      if (l.flicker === 'disco') {
        l.mx = l.x + Math.cos(t * 0.9 + l.seed * 2) * l.r * 1.1;
        l.my = l.y + Math.sin(t * 1.3 + l.seed) * l.r * 0.8;
        if (this.inView(l.mx, l.my, l.r)) out.push([l, l.intensity * flicker('disco', l.seed, t)]);
        continue;
      }
      if (this.inView(l.x, l.y, l.r)) out.push([l, l.intensity * flicker(l.flicker, l.seed, t)]);
    }
    let still = 0, lamps = 0;
    for (const p of this.world.props) {
      if (!p.moving) still++;
      if ((p.dead || p.lightsOut)) continue;
      // a lamp that took a hit sputters, a machine on its way out too (systems/Gadgets.js)
      const hurt = (p.def.fixture && p.hp < p.def.hp) || p.sputter;
      const lights = this.propLights(p);
      if (!lights.length) continue;
      // the emissive map follows the light: tubes buzz, screens flicker, signs spell themselves out
      const seed = lights[0].seed, sign = p.def.sign;
      p.glowK = flicker(hurt ? 'broken' : lights[0].flicker, seed, t);
      let lit = 1;
      if (sign) {
        lit = 0;
        for (let i = 0; i < sign.letters.length; i++) lit += signLevel(sign, i, seed, t) / sign.letters.length;
      }
      // driving vehicles: unshadowed lights that follow the car every frame, tail lights flare when braking
      const brake = p.brake || 0;
      for (let i = 0; i < lights.length; i++) {
        if (!lampOn(p, i)) continue;
        const l = lights[i];
        if (!p.moving) lamps++;
        this.placePropLight(p, l);
        l.moving = !!p.moving;
        const k = l.cone ? 1 : 1 + brake * 1.6;
        if (this.inView(l.x, l.y, l.r)) out.push([l, l.intensity * lit * k * flicker(hurt ? 'broken' : l.flicker, l.seed, t)]);
      }
    }
    // a prop appeared, died, lost a lamp or a car pulled up: the brightness grid is stale (passing traffic does not count)
    if (this.propCount !== still || this.lampCount !== lamps) { this.propCount = still; this.lampCount = lamps; this.gridDirty = true; }
    return out;
  }

  // multiply the light map over the scene (camera transform active on ctx)
  apply(ctx, cam, t) {
    this.sync();
    this.setView(cam);
    const { x0, y0, w: vw, h: vh } = this.view, s = L.scale;
    const g = this.lm.getContext('2d');
    const lit = this.collect(t);
    this.frameLights = lit;

    // ambient
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = css(toByte(L.ambient.void));
    g.fillRect(0, 0, this.lm.width, this.lm.height);
    g.imageSmoothingEnabled = true;
    const as = this.ambScale;
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    g.drawImage(this.ambient, 0, 0, this.ambient.width, this.ambient.height, 0, 0, this.ambient.width / as, this.ambient.height / as);

    // static + prop lights (cached shadows)
    g.globalCompositeOperation = 'lighter';
    let rebuilt = 0;
    for (const [l, k] of lit) {
      if (k <= 0.01) continue;
      if (l.flicker === 'disco') {
        g.globalAlpha = clamp(k, 0, 1);
        g.drawImage(this.blob(l.color, true), l.mx - l.r, l.my - l.r, l.r * 2, l.r * 2);
        continue;
      }
      if (l.spots) { this.drawSpots(g, l, k, t); continue; }
      if (l.moving) {
        g.save();
        if (l.cone) this.clipCone(g, l);
        g.globalAlpha = clamp(k, 0, 1);
        g.drawImage(this.blob(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
        g.restore();
        continue;
      }
      if ((l.dirty || !l.cache) && (rebuilt++ < 6 || !l.cache)) this.buildCache(l);
      for (let a = k; a > 0.01; a -= 1) {
        g.globalAlpha = Math.min(1, a);
        g.drawImage(l.cache, l.cx, l.cy, l.cs, l.cs);
      }
    }

    // dynamic lights (muzzle flashes, explosions) with shadows
    const w = this.world;
    for (const l of w.lights) {
      if (!this.inView(l.x, l.y, l.r)) continue;
      const a = clamp(l.t / l.dur, 0, 1) * L.dynamicGain * (l.r > 150 ? 1.7 : 1);
      if (L.dynamicShadows) {
        if (!l.poly) {
          const o = this.openPoint(l.x, l.y);
          l.poly = o ? visibility(o[0], o[1], l.r, this.segs).pts : [];
        }
        if (!l.poly.length) continue;
        g.save();
        this.tracePoly(g, l.poly);
        g.clip();
      }
      if (!l.rgb) l.rgb = rgb(l.color);
      g.globalAlpha = 1;
      for (let k = a; k > 0.01; k -= 1) {
        g.fillStyle = this.gradient(g, l.x, l.y, l.r, l.rgb, Math.min(1, k));
        g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      if (L.dynamicShadows) g.restore();
    }

    // fire, rockets, characters
    const fire = this.blob('#ff7a1e');
    let nf = 0;
    for (const p of w.particles.list) {
      if (p.type !== P.FIRE || nf++ > 90) continue;
      const r = p.size * 4 + 10;
      g.globalAlpha = Math.max(0, p.life / p.maxLife) * L.fireLight;
      g.drawImage(fire, p.x - r, p.y - r, r * 2, r * 2);
    }
    for (const pr of w.projectiles) {
      if (!pr.rocket) continue;
      g.globalAlpha = 0.8;
      g.drawImage(fire, pr.x - 60, pr.y - 60, 120, 120);
    }
    const cl = L.charLight, cb = this.blob(cl.color);
    for (const c of w.chars) {
      if (!c.alive) continue;
      const [r, a] = c.isPlayer ? cl.player : cl.enemy;
      g.globalAlpha = a;
      g.drawImage(cb, c.x - r, c.y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    // composite
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lm, x0, y0, vw, vh);
    if (L.overbright > 0) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = L.overbright;
      ctx.drawImage(this.lm, x0, y0, vw, vh);
    }
    if (L.haze > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = L.haze;
      ctx.drawImage(this.lm, x0, y0, vw, vh);
    }
    ctx.restore();
  }

  // a prop's emissive map, where the prop is drawn (overhead ones shift with parallax)
  drawGlow(g, p, t) {
    const gl = spriteOpt(`props/${p.type}_glow`);
    if (!gl || p.dead || p.lightsOut || !this.inView(p.x, p.y, 60)) return;
    const k = clamp(p.glowK ?? 1, 0, 1), sign = p.def.sign, x0 = -gl.width / 2, y0 = -gl.height / 2;
    g.save();
    g.translate(p.x + (p.ox || 0) + (p.def.hung ? p.kick.x : 0), p.y + (p.oy || 0) + (p.def.hung ? p.kick.y : 0));
    g.rotate(p.body.angle);
    if (p.drawLamps) {
      g.globalAlpha = k;
      p.drawLamps(g, gl, x0, y0);
    } else if (!sign) {
      g.globalAlpha = k;
      g.drawImage(gl, x0, y0);
    } else {
      const seed = this.propLights(p)[0]?.seed ?? 0;
      sign.letters.forEach(([sx, sw], i) => {
        const a = k * signLevel(sign, i, seed, t);
        if (a < 0.03) return;
        g.globalAlpha = a;
        g.drawImage(gl, sx, 0, sw, gl.height, x0 + sx, y0, sw, gl.height);
      });
    }
    g.restore();
  }

  // emissive map of a lit rooftop piece (skylight panes, a door lamp), k = its light's strength this frame
  drawRoofGlow(g, l, k) {
    const { img, x, y, a } = l.glow;
    if (!img) return;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.globalAlpha = clamp(k / l.intensity, 0, 1);
    g.drawImage(img, -img.width / 2, -img.height / 2);
    g.restore();
  }

  // additive layers after the scene: emissive maps, bloom, flares, reflections
  post(ctx, cam, t) {
    if (!this.lm) return;
    const w = this.world, { x0, y0, w: vw, h: vh } = this.view, b = L.bloomScale;
    const lit = this.frameLights || [];

    // crisp emissive overlays (glow maps drawn by the art pass) and light bulbs
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    for (const [l, k] of lit) {
      if (l.glow) this.drawRoofGlow(ctx, l, k);
      if (l.cone || l.bare || l.drawn) continue;
      const rc = 4 + l.r * 0.03;
      ctx.globalAlpha = clamp(k * L.bulb, 0, 1);
      ctx.drawImage(this.blob(l.color), l.x - rc, l.y - rc, rc * 2, rc * 2);
    }
    ctx.globalAlpha = 1;
    for (const p of w.props) this.drawGlow(ctx, p, t);
    ctx.restore();

    // ---- emissive buffer (bloom source) + flare buffer
    const e = this.em.getContext('2d'), f = this.fl.getContext('2d');
    for (const g of [e, f]) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, g.canvas.width, g.canvas.height); }
    e.setTransform(b, 0, 0, b, -x0 * b, -y0 * b);
    const fb = this.fl.width / vw;
    f.setTransform(fb, 0, 0, b, -x0 * fb, -y0 * b);
    e.globalCompositeOperation = f.globalCompositeOperation = 'lighter';
    e.imageSmoothingEnabled = true;
    const beat = flicker('pulse', 0, t);
    e.globalAlpha = L.neonGlow * (0.75 + 0.25 * beat);
    e.drawImage(this.emissive, x0 * b, y0 * b, vw * b, vh * b, x0, y0, vw, vh);
    e.globalAlpha = 1;
    for (const p of w.props) this.drawGlow(e, p, t);
    for (const [l, k] of lit) {
      if (l.glow) this.drawRoofGlow(e, l, k);
      if (l.bare) continue;
      const x = l.x, y = l.y;
      const r = 6 + l.r * 0.07, a = clamp(k * L.coreGlow * (l.drawn ? 0.6 : 1), 0, 1);
      e.globalAlpha = a;
      e.drawImage(this.blob(l.color), x - r, y - r, r * 2, r * 2);
      if (k * l.lum > 0.55 && !l.cone) {
        f.globalAlpha = clamp((k * l.lum - 0.45) * L.flare, 0, 1);
        f.drawImage(this.blob(l.color), x - r * 5, y - r * 0.5, r * 10, r);
      }
    }
    for (const l of w.lights) {
      const a = clamp(l.t / l.dur, 0, 1) * 0.85, r = Math.min(40, l.r * 0.2);
      e.globalAlpha = a;
      e.drawImage(this.blob(l.color), l.x - r, l.y - r, r * 2, r * 2);
      f.globalAlpha = a * L.flare;
      f.drawImage(this.blob(l.color), l.x - r * 6, l.y - r * 0.35, r * 12, r * 0.7);
    }
    const hot = this.blob('#ffd890');
    for (const fl of w.flashes) {
      const r = fl.big ? 26 : 16;
      e.globalAlpha = 1;
      e.drawImage(hot, fl.x - r, fl.y - r, r * 2, r * 2);
      f.globalAlpha = L.flare;
      f.drawImage(hot, fl.x - r * 6, fl.y - r * 0.3, r * 12, r * 0.6);
    }
    const fire = this.blob('#ff8a2a'), spark = this.blob('#fff0b0');
    for (const p of w.particles.list) {
      if (p.type === P.FIRE) {
        const a = Math.max(0, p.life / p.maxLife), r = p.size * 1.6;
        e.globalAlpha = a;
        e.drawImage(fire, p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.type === P.SPARK) {
        e.globalAlpha = Math.max(0, p.life / p.maxLife);
        e.drawImage(spark, p.x - 4, p.y - 4, 8, 8);
      } else if (p.type === P.EMBER) {
        e.globalAlpha = Math.max(0, p.life / p.maxLife) * 0.6;
        e.drawImage(fire, p.x - 3, p.y - 3 - p.z * 0.3, 6, 6);
      }
    }
    e.globalAlpha = 1;
    e.lineCap = 'round';
    for (const pr of w.projectiles) {
      if (pr.rocket) { e.drawImage(fire, pr.x - 14, pr.y - 14, 28, 28); continue; }
      const tx = pr.x - pr.vx * 0.03, ty = pr.y - pr.vy * 0.03;
      e.strokeStyle = 'rgba(255,190,110,0.9)';
      e.lineWidth = 4;
      e.beginPath(); e.moveTo(tx, ty); e.lineTo(pr.x, pr.y); e.stroke();
    }

    // ---- blur the emissive buffer twice into the bloom buffer
    const bg = this.bl.getContext('2d');
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = 'copy';
    bg.filter = `blur(${L.bloomBlur[0]}px)`;
    bg.drawImage(this.em, 0, 0);
    bg.globalCompositeOperation = 'lighter';
    bg.filter = `blur(${L.bloomBlur[1]}px)`;
    bg.drawImage(this.em, 0, 0);
    bg.filter = 'none';

    // ---- reflections: vertical streaks under the lights, on wet floors only
    const r = this.rf.getContext('2d');
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.globalAlpha = 1;
    r.globalCompositeOperation = 'source-over';
    r.clearRect(0, 0, this.rf.width, this.rf.height);
    r.setTransform(b, 0, 0, b, -x0 * b, -y0 * b);
    r.globalCompositeOperation = 'lighter';
    const streak = (g, color, x, y, rad, a, far = 1) => {
      if (a <= 0.01) return;
      const bl = this.blob(color), sw = Math.max(5, rad * 0.11) * far, len = Math.min(rad * 0.85, 150) * far;
      g.globalAlpha = clamp(a, 0, 1);
      g.drawImage(bl, x - sw, y - len * 0.25, sw * 2, len * 1.6);
      g.globalAlpha = clamp(a * 0.45, 0, 1);
      g.drawImage(bl, x - sw * 3, y - len * 0.1, sw * 6, len);
    };
    const streaks = (g, gain, far) => {
      for (const [l, k] of lit) {
        if (!l.bare && !l.cone) streak(g, l.color, l.x, l.y, l.r, k * gain, far);
      }
      for (const l of w.lights) streak(g, l.color, l.x, l.y, l.r, clamp(l.t / l.dur, 0, 1) * gain * 1.3, far);
    };
    streaks(r, L.reflect, 1);
    r.globalAlpha = 1;
    r.globalCompositeOperation = 'destination-in';
    r.drawImage(this.reflMask, x0 * b, y0 * b, vw * b, vh * b, x0, y0, vw, vh);

    // ---- standing water (systems/Liquids.js) mirrors the lights harder than a damp floor, and from further away
    const puddles = w.liquids ? w.liquids.puddles.filter((q) => this.inView(q.x, q.y, q.r * 1.5)) : [];
    if (puddles.length) {
      const g = this.pd.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, this.pd.width, this.pd.height);
      g.setTransform(b, 0, 0, b, -x0 * b, -y0 * b);
      // the water itself in black (adds nothing), then the streaks only where there is water
      g.fillStyle = '#000';
      for (const q of puddles) {
        g.globalAlpha = q.alpha;
        g.beginPath();
        for (const [x, y, rx, ry] of puddleShape(q)) { g.moveTo(x + rx, y); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
        g.fill();
      }
      g.globalCompositeOperation = 'source-atop';
      streaks(g, L.puddle, 1.6);
    }

    // ---- composite everything additively (smooth upscale)
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = L.bloom;
    ctx.drawImage(this.bl, x0, y0, vw, vh);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.rf, x0, y0, vw, vh);
    if (puddles.length) ctx.drawImage(this.pd, x0, y0, vw, vh);
    ctx.drawImage(this.fl, x0, y0, vw, vh);
    ctx.restore();
    void cam;
  }
}
