// Canvas side of destruction: paints marks into a prop's own damage canvas (so they stay attached when it moves),
// cuts pieces out of it along polygons, and draws the small loose bits (balls, books, records...).
// Shapes and sizes are decided by systems/Fracture.js.
import { rand, chance } from '../../engine/math.js';

const INK = '#0d0710';
// rim colour of a fresh hole / torn edge, per material
const RIM = { wood: '#d8a870', metal: '#eef2fa', glass: '#f0fcff', ceramic: '#ffffff', plastic: '#8a8490', fabric: '#f2ece0' };

// Damage canvases live in CPU memory (willReadFrequently): pieces are cut from them and tested for opacity on every
// hit, and a GPU canvas would be read back each time.
export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

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
      g.globalCompositeOperation = 'destination-out';
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
      const grad = g.createRadialGradient(x + Math.cos(a) * m.r * 0.35, y + Math.sin(a) * m.r * 0.35, 0, x, y, m.r * 1.3);
      grad.addColorStop(0, 'rgba(8,4,8,0.7)');
      grad.addColorStop(0.7, 'rgba(8,4,8,0.25)');
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
  if (m.pocks) pocks(g, x, y, m.pocks, Math.max(4, (m.scorch || 6) * 0.9), hard ? rim : INK);
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

// shrapnel peppering around a point
function pocks(g, x, y, n, spread, color) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(Math.round(x + rand(-spread, spread)), Math.round(y + rand(-spread, spread)), 1, 1);
  g.restore();
}

// Tear a jagged blob of radius r out of `src` around (x, y): returns the piece canvas (centred on the hole), or null
// when there was (almost) nothing left there. The hole gets a dark torn rim.
export function bite(src, x, y, r, mat) {
  const size = Math.ceil(r * 2.6) + 2;
  const piece = canvas(size, size);
  const pg = piece.getContext('2d');
  const g = src.getContext('2d');
  // the same blob for the piece and the hole
  const pts = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), rr = r * rand(0.55, 1.15);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  polyPath(pg, pts.map(([px, py]) => [px + size / 2, py + size / 2]));
  pg.clip();
  pg.drawImage(src, size / 2 - x, size / 2 - y);
  g.save();
  g.globalCompositeOperation = 'destination-out';
  polyPath(g, pts.map(([px, py]) => [px + x, py + y]));
  g.fill();
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = mat === 'metal' ? 'rgba(235,240,255,0.7)' : 'rgba(20,10,14,0.7)';
  g.lineWidth = 1.1;
  polyPath(g, pts.map(([px, py]) => [px * 1.15 + x, py * 1.15 + y]));
  g.stroke();
  g.restore();
  return opaqueEnough(piece, 4) ? piece : null;
}

// Cut polygon `poly` (sprite px) out of `src`: returns { img, cx, cy } (piece centre in sprite px) or null if empty.
// erase: also remove it from src (collapse: each cut only takes what the previous ones left).
// wreck: a part of a thing that has fallen apart: its edges are bitten (broken, not sawn) and it looks dull and
// dusty, so that wreckage never reads as furniture still standing.
export function cutPiece(src, poly, { erase = true, min = 8, wreck = false } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.floor(Math.max(0, x0)); y0 = Math.floor(Math.max(0, y0));
  x1 = Math.ceil(Math.min(src.width, x1)); y1 = Math.ceil(Math.min(src.height, y1));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  const piece = canvas(x1 - x0, y1 - y0);
  const pg = piece.getContext('2d');
  pg.save();
  polyPath(pg, poly, x0, y0);
  pg.clip();
  pg.drawImage(src, -x0, -y0);
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
    pg.fillRect(0, 0, piece.width, piece.height);
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

// a jagged crack right across the object (split stage): wood along the grain, the rest anywhere
export function splitLine(src, along) {
  const g = src.getContext('2d');
  const W = src.width, H = src.height;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 1.3;
  g.beginPath();
  if (along === 'x') {
    let y = H * rand(0.35, 0.65);
    for (let x = 0; x <= W; x += 2) { y += rand(-0.8, 0.8); g.lineTo(x, y); }
  } else {
    let x = W * rand(0.35, 0.65);
    for (let y = 0; y <= H; y += 2) { x += rand(-1.2, 1.2); g.lineTo(x, y); }
  }
  g.stroke();
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
  const at = (x, y) => g.getImageData(x, y, 1, 1).data;
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
  if (b.bg) { g.fillStyle = b.bg; g.fillRect(b.x, b.y, b.s, b.s); }
  else g.drawImage(img, b.x, b.y, b.s + 1, b.s + 1, b.x, b.y, b.s + 1, b.s + 1);
  g.fillStyle = 'rgba(214,236,244,0.7)';
  g.fillRect(b.x + (chance(0.5) ? 0 : b.s - 1), b.y + (chance(0.5) ? 0 : b.s - 1), 1, 1);
  g.fillStyle = wet.replace(/[\d.]+\)$/, '0.55)');
  g.fillRect(b.x + Math.floor(rand(0, b.s)), b.y + b.s - 1, 1, Math.min(src.height - b.y - b.s, Math.round(rand(2, 4))));
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
