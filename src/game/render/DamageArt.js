// Canvas side of destruction: paints marks into a prop's own damage canvas (so they stay attached when it moves),
// cuts pieces out of it along polygons, and draws the small loose bits (balls, books, records...).
// Shapes and sizes are decided by systems/Fracture.js.
import { rand, chance } from '../../engine/math.js';

const INK = '#0d0710';
const TAU = Math.PI * 2;
// rim colour of a fresh hole / torn edge, per material
const RIM = { wood: '#d8a870', metal: '#eef2fa', glass: '#f0fcff', ceramic: '#ffffff', plastic: '#8a8490', fabric: '#f2ece0', stone: '#d8d0c4' };
// what shows through a hole: the dark inside of a box, the shade under a top (fabric: the stuffing)
const VOID = 'rgba(10,5,9,0.66)';
const STUFFING = ['#ece4d4', '#d8ccb8', '#f6f0e4'];
// materials with no inside to show: a bite is a chip out of the surface, not a hole
const SOLID = new Set(['stone', 'ceramic']);

// Damage canvases live in CPU memory (willReadFrequently): pieces are cut from them and tested for opacity on every
// hit, and a GPU canvas would be read back each time.
// w, h in sprite px (= world px); k: world px per pixel of a sprite painted finer than the world (engine/Assets.js
// `density`). A fine canvas keeps its sprite's pixels and carries its k: its context is scaled so that everything is
// still painted in sprite px.
export function canvas(w, h, k = 1) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w / k)); c.height = Math.max(1, Math.ceil(h / k));
  const g = c.getContext('2d', { willReadFrequently: true });
  if (k !== 1) { c.k = k; g.setTransform(1 / k, 0, 0, 1 / k, 0, 0); }
  return c;
}

// a canvas's size in sprite px
const lw = (c) => c.width * (c.k || 1), lh = (c) => c.height * (c.k || 1);

// draw img (whatever its density) with its top-left corner at (x, y) sprite px
export function put(g, img, x = 0, y = 0) { g.drawImage(img, x, y, lw(img), lh(img)); }

// irregular blob path of radius r around (x, y)
function blobPath(g, x, y, r, n = 7, j = 0.45) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), rr = r * rand(1 - j, 1 + j * 0.4);
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function polyPath(g, poly, ox = 0, oy = 0) {
  g.beginPath();
  poly.forEach(([x, y], i) => (i ? g.lineTo(x - ox, y - oy) : g.moveTo(x - ox, y - oy)));
  g.closePath();
}

// does a canvas hold at least `min` fairly opaque pixels? (pieces fully shot away are skipped)
function opaqueEnough(c, min = 6) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  min = Math.ceil(min / (c.k || 1) ** 2);
  for (let i = 3; i < d.length; i += 4) if (d[i] > 40 && ++n >= min) return true;
  return false;
}

// crack lines wandering out of (x, y): n cracks, each `len` px long
export function cracks(g, x, y, n, len, color = 'rgba(16,8,12,0.75)', a0 = null, spread = Math.PI) {
  if (n <= 0) return;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = color;
  g.lineWidth = 0.7;
  for (let k = 0; k < n; k++) {
    let cx = x, cy = y, a = a0 === null ? rand(0, Math.PI * 2) : a0 + rand(-spread, spread);
    g.beginPath(); g.moveTo(cx, cy);
    const steps = Math.max(2, Math.round(len / 2.5));
    for (let i = 0; i < steps; i++) {
      a += rand(-0.55, 0.55);
      const s = rand(1.5, 3.2);
      cx += Math.cos(a) * s; cy += Math.sin(a) * s;
      g.lineTo(cx, cy);
      // a fork now and then
      if (chance(0.15)) { g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a + 0.8) * 2, cy + Math.sin(a + 0.8) * 2); g.moveTo(cx, cy); }
    }
    g.stroke();
  }
  g.restore();
}

// Paint a mark (Fracture.markShape / exitShape) at sprite point (x, y). a = shot direction in sprite space,
// mat = material name, side = 'entry' | 'exit'.
export function paintMark(g, x, y, m, a, mat) {
  const rim = RIM[mat] || RIM.wood;
  const hard = mat === 'metal';
  g.save();
  switch (m.shape) {
    case 'hole':
    case 'pock': {
      // dark ring of torn / burnt material, a punched core, a bright rim on metal
      const ex = m.len > m.r ? m.len : m.r;
      g.globalCompositeOperation = 'source-atop';
      g.translate(x, y); g.rotate(a);
      g.fillStyle = 'rgba(10,4,8,0.45)';
      g.beginPath(); g.ellipse(0, 0, ex + 1.1, m.r + 1.1, 0, 0, Math.PI * 2); g.fill();
      if (hard) { g.fillStyle = rim; g.beginPath(); g.ellipse(0, 0, ex + 0.6, m.r + 0.6, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = INK;
      g.beginPath(); g.ellipse(0, 0, ex, m.r, 0, 0, Math.PI * 2); g.fill();
      // the core goes through, but what is under it is in the shade: it reads as a hole, not as a light dot
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse(0, 0, ex * 0.7, m.r * 0.7, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'furrow':
    case 'scrape': {
      // gouge along the surface, deeper at the far end; metal gets a bright scrape with a dark core
      g.globalCompositeOperation = 'source-atop';
      g.translate(x, y); g.rotate(a);
      const L = Math.max(2, m.len);
      g.fillStyle = m.shape === 'scrape' ? rim : 'rgba(12,5,8,0.8)';
      g.beginPath(); g.moveTo(-1, 0); g.lineTo(L * 0.5, -m.r - 0.3); g.lineTo(L, 0); g.lineTo(L * 0.5, m.r + 0.3); g.closePath(); g.fill();
      if (m.shape === 'furrow') {
        g.fillStyle = rim;
        g.globalAlpha = 0.7;
        g.fillRect(0, m.r + 0.2, L * 0.8, 0.6); // splintered lip
      } else {
        g.fillStyle = 'rgba(20,20,30,0.6)';
        g.fillRect(L * 0.2, -0.3, L * 0.6, 0.6);
      }
      break;
    }
    case 'dent': {
      // a crushed patch: shaded bowl (dark on the far side, light on the near side), torn edges if brittle
      g.globalCompositeOperation = 'source-atop';
      // crushed wood or plaster only darkens, a dent in sheet metal is a deep shadow
      const grad = g.createRadialGradient(x + Math.cos(a) * m.r * 0.35, y + Math.sin(a) * m.r * 0.35, 0, x, y, m.r * 1.3);
      grad.addColorStop(0, hard ? 'rgba(8,4,8,0.7)' : 'rgba(8,4,8,0.42)');
      grad.addColorStop(0.7, hard ? 'rgba(8,4,8,0.25)' : 'rgba(8,4,8,0.15)');
      grad.addColorStop(1, 'rgba(8,4,8,0)');
      g.fillStyle = grad;
      g.fillRect(x - m.r * 1.4, y - m.r * 1.4, m.r * 2.8, m.r * 2.8);
      g.strokeStyle = hard ? 'rgba(240,244,255,0.75)' : 'rgba(255,240,220,0.25)';
      g.lineWidth = 0.7;
      g.beginPath(); g.arc(x, y, m.r * 0.9, a + Math.PI - 1.1, a + Math.PI + 1.1); g.stroke();
      break;
    }
    case 'slash': {
      // a straight cut across the swing; fabric opens up and shows the stuffing
      g.globalCompositeOperation = 'source-atop';
      g.translate(x, y); g.rotate(a);
      const L = m.len / 2;
      if (mat === 'fabric') {
        g.fillStyle = INK;
        g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -2.6, L, 0); g.quadraticCurveTo(0, 2.6, -L, 0); g.fill();
        g.fillStyle = rim;
        g.fillRect(-L * 0.5, -0.6, L, 1.2); // stuffing showing through
      } else {
        g.strokeStyle = 'rgba(10,4,8,0.85)';
        g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(-L, rand(-0.5, 0.5)); g.lineTo(L, rand(-0.5, 0.5)); g.stroke();
        g.strokeStyle = rim;
        g.globalAlpha = 0.6;
        g.lineWidth = 0.5;
        g.beginPath(); g.moveTo(-L * 0.8, 0.8); g.lineTo(L * 0.8, 0.8); g.stroke();
      }
      break;
    }
    case 'scuff':
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(10,4,8,0.3)';
      blobPath(g, x, y, m.r); g.fill();
      break;
    case 'scorch': {
      g.globalCompositeOperation = 'source-atop';
      const grad = g.createRadialGradient(x, y, 0, x, y, m.scorch);
      grad.addColorStop(0, 'rgba(8,4,4,0.85)');
      grad.addColorStop(0.5, 'rgba(20,8,6,0.5)');
      grad.addColorStop(1, 'rgba(20,8,6,0)');
      g.fillStyle = grad;
      g.fillRect(x - m.scorch, y - m.scorch, m.scorch * 2, m.scorch * 2);
      // glowing embers left in the char
      g.fillStyle = 'rgba(255,120,40,0.7)';
      for (let i = 0; i < 3; i++) g.fillRect(x + rand(-m.scorch, m.scorch) * 0.4, y + rand(-m.scorch, m.scorch) * 0.4, 1, 1);
      break;
    }
    case 'blowout': {
      // ragged crater, petals curled outward on metal, a splintered halo on wood
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(10,4,8,0.55)';
      blobPath(g, x, y, m.r + 1.4, 9, 0.5); g.fill();
      if (hard || mat === 'wood') {
        g.strokeStyle = rim;
        g.lineWidth = 0.6;
        for (let i = 0; i < 5; i++) {
          const pa = a + rand(-1.6, 1.6);
          g.beginPath(); g.moveTo(x + Math.cos(pa) * m.r, y + Math.sin(pa) * m.r);
          g.lineTo(x + Math.cos(pa) * (m.r + rand(1, 2.5)), y + Math.sin(pa) * (m.r + rand(1, 2.5))); g.stroke();
        }
      }
      g.globalCompositeOperation = 'destination-out';
      blobPath(g, x, y, m.r * 0.8, 8, 0.5); g.fill();
      break;
    }
    default: break;
  }
  g.restore();
  if (m.cracks) cracks(g, x, y, m.cracks, mat === 'glass' ? 9 : 5 + m.r * 2, mat === 'glass' ? 'rgba(235,250,255,0.85)' : undefined);
  if (m.pocks) pocks(g, x, y, m.pocks, Math.max(4, (m.scorch || 6) * 0.9), hard ? rim : null);
}

// the channel a round dug through the object (seen from above): a dark groove with a torn, lighter lip
export function paintTrack(g, x0, y0, x1, y1, width, mat) {
  if (Math.hypot(x1 - x0, y1 - y0) < 1) return;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.lineCap = 'round';
  if (mat === 'glass') {
    g.strokeStyle = 'rgba(235,250,255,0.75)';
    g.lineWidth = 0.6;
  } else {
    const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny), ox = (nx / l) * width * 0.7, oy = (ny / l) * width * 0.7;
    g.strokeStyle = RIM[mat] || RIM.wood;
    g.globalAlpha = 0.45;
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.lineTo(x1 + ox, y1 + oy); g.stroke();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(10,4,8,0.6)';
    g.lineWidth = width;
  }
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.restore();
}

// shrapnel peppering around a point: dark pits; on metal (rim) one in four is a bright nick in the paint
function pocks(g, x, y, n, spread, rim) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < n; i++) {
    g.fillStyle = rim && i % 4 === 0 ? rim : INK;
    g.globalAlpha = rim && i % 4 === 0 ? 0.6 : 0.8;
    g.fillRect(Math.round(x + rand(-spread, spread)), Math.round(y + rand(-spread, spread)), 1, 1);
  }
  g.restore();
}

// a ragged outline of radius r: most points inside, every third one a spike (what breaks is splintered, not round),
// stretched along a (the way the blow went, the grain)
function ragged(r, a, stretch = 1.25) {
  const pts = [], n = 10, c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU + rand(-0.2, 0.2), rr = r * (i % 3 ? rand(0.5, 0.85) : rand(1, 1.4));
    const u = Math.cos(t) * rr * stretch, v = Math.sin(t) * rr / stretch;
    pts.push([u * c - v * s, u * s + v * c]);
  }
  return pts;
}

// Tear a jagged piece of radius r out of `src` around (x, y), the blow going along a: returns the piece canvas
// (centred on the hole), or null when there was (almost) nothing left there. What the hole shows is the material's:
// the dark inside (a box, the shade under a top) with fresh splinters / bright torn lips / chipped edges around it,
// or the stuffing of upholstery.
export function bite(src, x, y, r, mat, a = rand(0, TAU)) {
  const size = Math.ceil(r * 3.6) + 2;
  const piece = canvas(size, size, src.k);
  const pg = piece.getContext('2d');
  const g = src.getContext('2d');
  // the same outline for the piece and the hole
  const pts = ragged(r, a);
  polyPath(pg, pts.map(([px, py]) => [px + size / 2, py + size / 2]));
  pg.clip();
  put(pg, src, size / 2 - x, size / 2 - y);
  const at = (k) => pts.map(([px, py]) => [px * k + x, py * k + y]);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  if (mat === 'fabric') {
    // the cover is torn open on the stuffing, a few tufts poking out over the edge
    g.fillStyle = STUFFING[0];
    polyPath(g, at(1)); g.fill();
    g.fillStyle = STUFFING[1];
    polyPath(g, at(0.55)); g.fill();
    g.strokeStyle = 'rgba(20,10,14,0.6)';
    g.lineWidth = 0.7;
    polyPath(g, at(1.05)); g.stroke();
    tufts(g, at(1.15), 3);
  } else if (SOLID.has(mat)) {
    // stone and china are solid: a chip shows the paler body under the glaze or the grime, with a shaded pit
    g.fillStyle = RIM[mat];
    g.globalAlpha = 0.55;
    polyPath(g, at(1)); g.fill();
    g.fillStyle = 'rgba(20,12,14,0.35)';
    g.globalAlpha = 1;
    polyPath(g, at(0.45)); g.fill();
    lips(g, at(1.05), mat, a);
  } else {
    // the dark inside, and through the middle of it the floor in the shade
    g.fillStyle = VOID;
    polyPath(g, at(1)); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = mat === 'glass' ? 0.9 : 0.5;
    polyPath(g, at(0.6)); g.fill();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-atop';
    lips(g, at(1.08), mat, a);
  }
  g.restore();
  return opaqueEnough(piece, 4) ? piece : null;
}

// the edge of a fresh tear in that material: splinters of pale wood thrown out along the blow, a bright torn lip on
// metal, white crazing on glass, pale chips on the rest; a dark line where it broke
function lips(g, pts, mat, a) {
  g.strokeStyle = 'rgba(14,6,10,0.5)';
  g.lineWidth = 0.8;
  polyPath(g, pts); g.stroke();
  g.fillStyle = RIM[mat] || RIM.wood;
  g.strokeStyle = g.fillStyle;
  g.lineWidth = mat === 'wood' ? 1 : 0.6;
  for (let i = 0; i < pts.length; i++) {
    if (chance(0.3)) continue;
    const [x, y] = pts[i];
    if (mat === 'wood') {
      // a splinter: a short pale line out of the edge along the blow
      const l = rand(1, 2.5), da = a + rand(-0.5, 0.5);
      g.globalAlpha = 0.65;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(da) * l, y + Math.sin(da) * l); g.stroke();
    } else if (mat === 'metal') {
      // a lip of torn sheet bent out, catching the light
      g.globalAlpha = 0.85;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
      if (chance(0.5)) g.fillRect(Math.round(x + rand(-1, 1)), Math.round(y + rand(-1, 1)), 1, 1);
    } else {
      g.globalAlpha = mat === 'glass' ? 0.8 : 0.55;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  g.globalAlpha = 1;
}

// the edge left by a piece that broke away (poly, sprite px), in its material, the blow going along a
export function brokenEdge(src, poly, mat, a) {
  const g = src.getContext('2d');
  g.save();
  g.globalCompositeOperation = 'source-atop';
  lips(g, poly, mat, a);
  g.restore();
}

// fluffs of stuffing poking out of a tear (pts: its edge)
function tufts(g, pts, n) {
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[Math.floor(rand(0, pts.length))];
    g.fillStyle = STUFFING[i % 3];
    g.fillRect(Math.round(x - 1), Math.round(y - 0.5), 2, 1);
    g.fillRect(Math.round(x - 0.5), Math.round(y - 1), 1, 2);
  }
}

// A damage zone of sheet metal worn through (poly, sprite px): torn open on the dark inside, its lips bright and bent
// out, a dent shading the panel around it. The outline stays: a box does not lose its corners to a few rounds.
export function gash(src, poly) {
  const g = src.getContext('2d');
  let cx = 0, cy = 0;
  for (const [x, y] of poly) { cx += x / poly.length; cy += y / poly.length; }
  const inner = poly.map(([x, y]) => [cx + (x - cx) * 0.62, cy + (y - cy) * 0.62]);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  // the panel caved in around the tear
  g.fillStyle = 'rgba(8,4,10,0.3)';
  polyPath(g, poly); g.fill();
  g.fillStyle = VOID;
  polyPath(g, inner); g.fill();
  // what is inside: a wire, a bracket, dimly
  g.fillStyle = 'rgba(70,72,84,0.7)';
  for (let i = 0; i < 2; i++) g.fillRect(Math.round(cx + rand(-2, 2)), Math.round(cy + rand(-2, 2)), chance(0.5) ? 2 : 1, 1);
  lips(g, inner, 'metal', 0);
  // the petals of the tear bent outward
  g.strokeStyle = 'rgba(235,240,250,0.7)';
  g.lineWidth = 0.6;
  for (const [x, y] of inner) {
    if (chance(0.5)) continue;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x - cx) * 0.35, y + (y - cy) * 0.35); g.stroke();
  }
  g.restore();
}

// A damage zone of upholstery worn through (poly): the cover hangs open on the stuffing. Nothing falls off.
export function rip(src, poly) {
  const g = src.getContext('2d');
  let cx = 0, cy = 0;
  for (const [x, y] of poly) { cx += x / poly.length; cy += y / poly.length; }
  const at = (k) => poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = STUFFING[1];
  polyPath(g, at(0.7)); g.fill();
  g.fillStyle = STUFFING[0];
  polyPath(g, at(0.45)); g.fill();
  g.fillStyle = 'rgba(40,24,20,0.35)'; // springs, the frame, the dirt of years
  for (let i = 0; i < 3; i++) g.fillRect(Math.round(cx + rand(-3, 3)), Math.round(cy + rand(-3, 3)), 1, 1);
  g.strokeStyle = 'rgba(20,8,12,0.7)';
  g.lineWidth = 0.8;
  polyPath(g, at(0.72)); g.stroke();
  tufts(g, at(0.8), 4);
  g.restore();
}

// What a damage state does to the surface around (x, y), n marks about len px long: cracks in wood, ceramic, stone
// and plastic (white crazing in glass), rips on the stuffing in upholstery, dents with bright creases in sheet metal.
export function wear(g, mat, x, y, n, len, W, H) {
  if (mat === 'fabric') {
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      paintMark(g, x + rand(-len, len) * 0.5, y + rand(-len, len) * 0.3, { shape: 'slash', len: Math.min(len, Math.max(4, W * 0.3)) }, rand(-0.5, 0.5) + (W >= H ? 0 : Math.PI / 2), 'fabric');
    }
  } else if (mat === 'metal') {
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      const dx = x + rand(-len, len) * 0.4, dy = y + rand(-len, len) * 0.4, a = rand(0, TAU);
      paintMark(g, dx, dy, { shape: 'dent', r: Math.min(5, Math.max(2, len * 0.25)) }, a, 'metal');
      crease(g, dx, dy, a + Math.PI / 2, Math.min(len, 8));
    }
  } else cracks(g, x, y, n, len, mat === 'glass' ? 'rgba(235,250,255,0.85)' : undefined);
}

// a fold in a panel: a dark line under a bright one
function crease(g, x, y, a, len) {
  const c = Math.cos(a) * len / 2, s = Math.sin(a) * len / 2;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.lineWidth = 0.7;
  g.strokeStyle = 'rgba(10,6,12,0.55)';
  g.beginPath(); g.moveTo(x - c, y - s + 0.7); g.lineTo(x + c, y + s + 0.7); g.stroke();
  g.strokeStyle = 'rgba(235,240,250,0.55)';
  g.beginPath(); g.moveTo(x - c, y - s); g.lineTo(x + c, y + s); g.stroke();
  g.restore();
}

// Cut polygon `poly` (sprite px) out of `src`: returns { img, cx, cy } (piece centre in sprite px) or null if empty.
// erase: also remove it from src (collapse: each cut only takes what the previous ones left).
// wreck: a part of a thing that has fallen apart: its edges are bitten (broken, not sawn) and it looks dull and
// dusty, so that wreckage never reads as furniture still standing.
export function cutPiece(src, poly, { erase = true, min = 8, wreck = false } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.floor(Math.max(0, x0)); y0 = Math.floor(Math.max(0, y0));
  x1 = Math.ceil(Math.min(lw(src), x1)); y1 = Math.ceil(Math.min(lh(src), y1));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  const piece = canvas(x1 - x0, y1 - y0, src.k);
  const pg = piece.getContext('2d');
  pg.save();
  polyPath(pg, poly, x0, y0);
  pg.clip();
  put(pg, src, -x0, -y0);
  pg.restore();
  // a dark broken edge
  pg.save();
  pg.globalCompositeOperation = 'source-atop';
  pg.strokeStyle = 'rgba(16,8,14,0.4)';
  pg.lineWidth = 0.8;
  polyPath(pg, poly, x0, y0);
  pg.stroke();
  if (wreck) {
    pg.fillStyle = 'rgba(14,8,14,0.22)';
    pg.fillRect(0, 0, x1 - x0, y1 - y0);
    pg.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, by - ay);
      for (let d = rand(0, 3); d < len; d += rand(2, 5)) {
        const s = chance(0.3) ? 2 : 1;
        pg.fillRect(Math.round(ax + ((bx - ax) * d) / len - x0 - s / 2), Math.round(ay + ((by - ay) * d) / len - y0 - s / 2), s, s);
      }
    }
  }
  pg.restore();
  if (erase) {
    const g = src.getContext('2d');
    g.save();
    g.globalCompositeOperation = 'destination-out';
    polyPath(g, poly);
    g.fill();
    g.lineWidth = 0.6;
    g.stroke();
    g.restore();
  }
  if (!opaqueEnough(piece, min)) return null;
  return { img: piece, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// A jagged crack right across the object (split stage): wood along the grain, the rest anywhere. It opens a little:
// a dark gap, a pale lip of fresh material on one side, a hairline of light through it here and there.
export function splitLine(src, along, mat = 'wood') {
  const g = src.getContext('2d');
  const W = lw(src), H = lh(src), pts = [];
  if (along === 'x') {
    let y = H * rand(0.35, 0.65);
    for (let x = 0; x <= W; x += 2) { y += rand(-0.8, 0.8); pts.push([x, y]); }
  } else {
    let x = W * rand(0.35, 0.65);
    for (let y = 0; y <= H; y += 2) { x += rand(-1.2, 1.2); pts.push([x, y]); }
  }
  const line = (ox, oy) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy))); g.stroke(); };
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.lineJoin = 'round';
  g.strokeStyle = RIM[mat] || RIM.wood;
  g.globalAlpha = mat === 'metal' ? 0.6 : 0.45;
  g.lineWidth = 0.7;
  line(along === 'x' ? 0 : 1, along === 'x' ? 1 : 0);
  g.globalAlpha = 1;
  g.strokeStyle = mat === 'glass' ? 'rgba(235,250,255,0.9)' : 'rgba(10,4,8,0.85)';
  g.lineWidth = 1;
  line(0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.35;
  g.lineWidth = 0.6;
  line(0, 0);
  g.restore();
}

// a CRT / screen caved in: dark glass, a white star of cracks, shards around the edge
export function smashScreen(src, rect) {
  const g = src.getContext('2d');
  const [x0, y0, x1, y1] = rect;
  const cx = (x0 + x1) / 2 + rand(-1, 1), cy = (y0 + y1) / 2 + rand(-1, 1);
  g.save();
  g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
  g.fillStyle = '#07060a';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.strokeStyle = 'rgba(200,230,255,0.55)';
  g.lineWidth = 0.6;
  for (let i = 0; i < 9; i++) {
    const a = rand(0, Math.PI * 2), l = rand(3, 12);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke();
  }
  g.fillStyle = 'rgba(160,200,230,0.35)';
  for (let i = 0; i < 4; i++) g.fillRect(x0 + rand(0, x1 - x0 - 2), y0 + rand(0, y1 - y0 - 1), 2, 1);
  g.restore();
}

// The bottles or glasses of a rack (DESTRUCTION rack) as slots { x, y, s, color, bg, up } in sprite pixels. A grid
// rack is read off the pristine sprite (a slot the colour of the gap beside it is empty); a scatter rack is set
// out here on the bare top, the same way every time for a given seed.
export function rackSlots(src, rack, seed) {
  const g = src.getContext('2d'), slots = [];
  if (rack.scatter) {
    let s = (Math.floor(seed) * 2654435761) >>> 0;
    const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const [x0, y0, x1, y1] = rack.rect, [lo, hi] = rack.scatter;
    for (let n = lo + Math.floor(r() * (hi - lo + 1)); n > 0; n--) {
      const b = { x: Math.round(x0 + r() * (x1 - x0)), y: Math.round(y0 + r() * (y1 - y0)), s: 4,
        color: rack.colors[Math.floor(r() * rack.colors.length)], bg: null, up: true };
      if (slots.some((o) => Math.abs(o.x - b.x) < 7 && Math.abs(o.y - b.y) < 6)) continue;
      // a glass from above: its shadow, its rim, what is left in it, a glint
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(b.x + 1, b.y + 4, 3, 1); g.fillRect(b.x + 4, b.y + 1, 1, 3);
      g.fillStyle = '#cfdfe8';
      g.fillRect(b.x + 1, b.y, 2, 4); g.fillRect(b.x, b.y + 1, 4, 2);
      g.fillStyle = b.color;
      g.fillRect(b.x + 1, b.y + 1, 2, 2);
      g.fillStyle = '#ffffff';
      g.fillRect(b.x + 1, b.y, 1, 1);
      slots.push(b);
    }
    return slots;
  }
  const k = src.k || 1, at = (x, y) => g.getImageData(Math.floor(x / k), Math.floor(y / k), 1, 1).data;
  for (const y of rack.ys) {
    for (let i = 0; i < rack.n; i++) {
      const x = rack.x + i * rack.dx, c = at(x + 1, y), o = at(x + rack.s, y);
      if (Math.abs(c[0] - o[0]) + Math.abs(c[1] - o[1]) + Math.abs(c[2] - o[2]) < 24) continue;
      slots.push({ x, y, s: rack.s, color: `rgb(${c[0]},${c[1]},${c[2]})`, bg: `rgb(${o[0]},${o[1]},${o[2]})`, up: true });
    }
  }
  return slots;
}

// a slot of the rack once its bottle burst: the bare shelf (or the top of the pristine sprite img), a bit of
// glass left standing, and what it held (wet: its colour) running toward the front
export function popSlot(src, img, b, wet) {
  const g = src.getContext('2d');
  const k = img.k || 1;
  if (b.bg) { g.fillStyle = b.bg; g.fillRect(b.x, b.y, b.s, b.s); }
  else g.drawImage(img, b.x / k, b.y / k, (b.s + 1) / k, (b.s + 1) / k, b.x, b.y, b.s + 1, b.s + 1);
  g.fillStyle = 'rgba(214,236,244,0.7)';
  g.fillRect(b.x + (chance(0.5) ? 0 : b.s - 1), b.y + (chance(0.5) ? 0 : b.s - 1), 1, 1);
  g.fillStyle = wet.replace(/[\d.]+\)$/, '0.55)');
  g.fillRect(b.x + Math.floor(rand(0, b.s)), b.y + b.s - 1, 1, Math.min(lh(src) - b.y - b.s, Math.round(rand(2, 4))));
}

// two halves of a long piece (a door leaf), cut across with a splintered edge
export function splitInTwo(src) {
  const W = src.width, H = src.height, cut = W * rand(0.4, 0.6);
  return [0, 1].map((k) => {
    const c = canvas(k ? W - cut + 3 : cut + 3, H);
    const g = c.getContext('2d');
    const ox = k ? cut - 3 : 0, seamX = k ? 3 : cut, outer = k ? c.width : 0;
    g.beginPath();
    g.moveTo(outer, 0); g.lineTo(outer, H);
    for (let y = H; y >= 0; y--) g.lineTo(seamX + rand(-3, 3), y);
    g.closePath();
    g.clip();
    g.drawImage(src, -ox, 0);
    return c;
  });
}

// what stays on the floor where a thing (W x H px) stood and fell apart: a ragged patch of grime, thicker in the
// middle, and crumbs of its material. It grounds the wreckage lying on it.
export function remains(W, H, color) {
  const pad = 3, c = canvas(W + pad * 2, H + pad * 2), g = c.getContext('2d');
  // two draws averaged: more of it toward the middle
  const mid = (size) => pad + ((Math.random() + Math.random()) / 2) * size;
  for (let i = Math.min(420, Math.round((W * H) / 9)); i > 0; i--) {
    const crumb = chance(0.12), s = crumb || chance(0.5) ? 1 : 2;
    g.fillStyle = crumb ? color : INK;
    g.globalAlpha = crumb ? 0.55 : rand(0.1, 0.3);
    g.fillRect(Math.round(mid(W) - s / 2), Math.round(mid(H) - s / 2), s, s);
  }
  return c;
}

// what a potted plant leaves where it stood (W x H its sprite): the soil spilled in a heap, thinning out, leaves torn
// off and lying in it, a crumb of the pot here and there
export function soilSpill(W, H) {
  const pad = 4, c = canvas(W + pad * 2, H + pad * 2), g = c.getContext('2d');
  const cx = c.width / 2, cy = c.height / 2, R = Math.min(W, H) * 0.42;
  const soil = ['#2a1a10', '#3a2416', '#4a301c', '#5a3a22'];
  for (let i = Math.round(R * R * 1.6); i > 0; i--) {
    // thick in the middle, a few crumbs flung further
    const a = rand(0, TAU), d = R * Math.pow(Math.random(), 0.7) * (chance(0.1) ? 1.6 : 1);
    g.globalAlpha = d < R * 0.6 ? 0.95 : rand(0.4, 0.8);
    g.fillStyle = soil[Math.floor(rand(0, soil.length))];
    const s = d < R * 0.5 && chance(0.4) ? 2 : 1;
    g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.85), s, s);
  }
  g.globalAlpha = 1;
  const leaf = ['#2f8f3a', '#3aa048', '#25702c'];
  for (let i = 0; i < 5; i++) {
    const a = rand(0, TAU), d = R * rand(0.2, 1.3), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    g.fillStyle = leaf[i % 3];
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(rand(0, TAU));
    g.fillRect(-2, -0.5, 4, 1.5); g.fillStyle = '#1c4a20'; g.fillRect(-2, 0, 4, 0.5);
    g.restore();
  }
  g.fillStyle = '#9a4a26';
  for (let i = 0; i < 3; i++) g.fillRect(Math.round(cx + rand(-R, R)), Math.round(cy + rand(-R, R)), 2, 1);
  return c;
}

// what a roof vent torn off its duct leaves (size px): the dark open duct in its galvanised flange, four bolts
export function ductStump(size) {
  const c = canvas(size, size), g = c.getContext('2d'), m = size / 2;
  const disc = (r, color) => { g.fillStyle = color; g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill(); };
  disc(m * 0.95, INK);
  disc(m * 0.85, '#6a6e78');
  disc(m * 0.62, '#2a2a30');
  disc(m * 0.52, '#050508');
  // the sheared edge of the duct catches the light on one side
  g.strokeStyle = '#c8ccd4';
  g.lineWidth = 0.8;
  g.beginPath(); g.arc(m, m, m * 0.57, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  g.fillStyle = '#1a1a20';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    g.fillRect(Math.round(m + Math.cos(a) * m * 0.74 - 0.5), Math.round(m + Math.sin(a) * m * 0.74 - 0.5), 1, 1);
  }
  return c;
}

// what a hydrant blown off its pipe leaves bolted to the pavement (seen from above): the flange, its sheared bright
// edge and the open main in the middle
export function stump(size) {
  const c = canvas(size, size), g = c.getContext('2d'), m = size / 2;
  const disc = (r, color) => { g.fillStyle = color; g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill(); };
  disc(m * 0.78, INK);
  disc(m * 0.66, '#5a1216');
  disc(m * 0.46, '#b8bcc8');
  disc(m * 0.34, '#05060a');
  g.fillStyle = '#2a0a0c';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    g.fillRect(Math.round(m + Math.cos(a) * m * 0.56 - 0.5), Math.round(m + Math.sin(a) * m * 0.56 - 0.5), 1, 1);
  }
  return c;
}

// ---- loose bits (cached per kind / colour / size) ----
const bitCache = new Map();

// w, h in px (long side first for elongated bits)
export function bitSprite(kind, color, w, h) {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  const key = `${kind}${color}${w}x${h}`;
  let c = bitCache.get(key);
  if (c) return c;
  c = canvas(w, h);
  const g = c.getContext('2d');
  const r = Math.min(w, h) / 2;
  switch (kind) {
    case 'ball':
    case 'chip':
    case 'coin':
    case 'can':
    case 'pan':
      g.fillStyle = kind === 'pan' ? '#141418' : '#140c1c';
      g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = color;
      g.beginPath(); g.arc(w / 2, h / 2, Math.max(0.8, r - 0.5), 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(Math.floor(w / 2 - r / 2), Math.floor(h / 2 - r / 2), 1, 1);
      break;
    case 'disc':
      g.fillStyle = '#0a0a0e';
      g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(120,120,140,0.35)';
      g.lineWidth = 0.5;
      g.beginPath(); g.arc(w / 2, h / 2, r * 0.7, 0, Math.PI * 2); g.stroke();
      g.fillStyle = color;
      g.beginPath(); g.arc(w / 2, h / 2, r * 0.35, 0, Math.PI * 2); g.fill();
      break;
    case 'book':
      g.fillStyle = '#140c1c'; g.fillRect(0, 0, w, h);
      g.fillStyle = color; g.fillRect(0.5, 0.5, w - 1, h - 1);
      g.fillStyle = '#efe8d8'; g.fillRect(w - 1.5, 1, 1, h - 2); // pages
      break;
    case 'bottle':
      g.fillStyle = color; g.fillRect(0, h * 0.3, w, h * 0.7); g.fillRect(w * 0.3, 0, Math.max(1, w * 0.4), h * 0.35);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, h * 0.4, 1, h * 0.4);
      break;
    case 'bag':
      g.fillStyle = color;
      blobPath(g, w / 2, h / 2, r, 8, 0.25); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(w * 0.3, h * 0.3, 2, 1);
      break;
    case 'soil':
      g.fillStyle = color;
      blobPath(g, w / 2, h / 2, r, 9, 0.5); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < 4; i++) g.fillRect(rand(1, w - 2), rand(1, h - 2), 1, 1);
      break;
    default: // slats, cue, food: plain chunk with an outline
      g.fillStyle = '#140c1c'; g.fillRect(0, 0, w, h);
      g.fillStyle = color; g.fillRect(w > 2 ? 0.5 : 0, h > 2 ? 0.5 : 0, w > 2 ? w - 1 : w, h > 2 ? h - 1 : h);
  }
  bitCache.set(key, c);
  return c;
}
