import { TILE } from './Units.js';

// Amanatides & Woo grid traversal. Returns first solid cell hit along the segment, or null.
export function gridRaycast(x0, y0, x1, y1, isSolid) {
  let cx = Math.floor(x0 / TILE), cy = Math.floor(y0 / TILE);
  if (isSolid(cx, cy)) return { t: 0, x: x0, y: y0, nx: 0, ny: 0, cx, cy };
  const dx = x1 - x0, dy = y1 - y0;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tMaxX = dx !== 0 ? (stepX > 0 ? (cx + 1) * TILE - x0 : x0 - cx * TILE) / Math.abs(dx) : Infinity;
  let tMaxY = dy !== 0 ? (stepY > 0 ? (cy + 1) * TILE - y0 : y0 - cy * TILE) / Math.abs(dy) : Infinity;
  for (let i = 0; i < 1000; i++) {
    let t, nx = 0, ny = 0;
    if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; nx = -stepX; }
    else { t = tMaxY; tMaxY += tDeltaY; cy += stepY; ny = -stepY; }
    if (t > 1) return null;
    if (isSolid(cx, cy)) return { t, x: x0 + dx * t, y: y0 + dy * t, nx, ny, cx, cy };
  }
  return null;
}

// Segment vs convex polygon (Cyrus-Beck). Returns { t, nx, ny } of entry, or null.
export function segPoly(x0, y0, x1, y1, verts) {
  const n = verts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area > 0 ? 1 : -1;
  const dx = x1 - x0, dy = y1 - y0;
  let tE = 0, tL = 1, nX = 0, nY = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    // outward normal
    const Nx = sign * ey, Ny = -sign * ex;
    const num = Nx * (a.x - x0) + Ny * (a.y - y0);
    const den = Nx * dx + Ny * dy;
    if (den === 0) { if (num < 0) return null; continue; }
    const t = num / den;
    if (den < 0) { if (t > tE) { tE = t; nX = Nx; nY = Ny; } }
    else if (t < tL) tL = t;
    if (tE > tL) return null;
  }
  const len = Math.hypot(nX, nY) || 1;
  return { t: tE, nx: nX / len, ny: nY / len };
}

// Segment vs circle. Returns entry t in [0,1] or null.
export function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - cx, fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c < 0) return 0;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

// Segment vs segment intersection param on the first segment, or null.
export function segSeg(x0, y0, x1, y1, x2, y2, x3, y3) {
  const rx = x1 - x0, ry = y1 - y0, sx = x3 - x2, sy = y3 - y2;
  const den = rx * sy - ry * sx;
  if (den === 0) return null;
  const qx = x2 - x0, qy = y2 - y0;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
