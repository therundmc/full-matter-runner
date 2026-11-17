// The curtains' cloth (systems/Curtains.js) in plain pixel art at the furniture's density (two pixels to a world
// px), on whole pixels of the world's grid: each cell of the mesh is a flat patch of velvet seen from above (the
// cell taken off its pleats and thickened by them, so the cloth reads as a band of folds), its tone by the way it
// faces the light (a fold's two sides) and how low it hangs, the lowest drawn first; the deepest tone where a fold
// lies over a lower one, a dark ink round the whole, then the brass rod and its rings on top. Painted again only
// when the cloth moved.
import { CURTAIN } from '../data/cloth.js';

const K = 2;            // pixels to a world px
const arts = new WeakMap(); // curtain -> { version, x, y, canvas, ox, oy }
let buf = new Uint32Array(0), ids = new Uint8Array(0);

const rgba = (hex, a = 255) => {
  const v = parseInt(hex.slice(1), 16);
  return ((a << 24) | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0; // ImageData's bytes, little-endian
};
const LOOK = CURTAIN.look;
const VELVET = LOOK.velvet.map((c) => rgba(c)), INK = rgba(LOOK.ink), BRASS = LOOK.brass.map((c) => rgba(c));
const L = (() => { const [x, y, z] = LOOK.light, d = Math.hypot(x, y, z); return [x / d, y / d, z / d]; })();

export function drawCurtains(ctx, curtains, player, vis) {
  for (const c of curtains.list) {
    if (!vis(c.x, c.y)) continue;
    let art = arts.get(c);
    if (!art) arts.set(c, (art = { version: -1 }));
    if (art.version !== c.cloth.version || art.x !== c.x || art.y !== c.y) paint(c, art);
    // the player in it sees himself through it
    const under = player?.alive && inside(c, player.x, player.y, CURTAIN.person.r);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = under ? LOOK.under : 1;
    ctx.drawImage(art.canvas, art.ox, art.oy, art.canvas.width / K, art.canvas.height / K);
    ctx.restore();
  }
}

// whether (x, y) is within r of any of the cloth's points
function inside(c, x, y, r) {
  const { s, n } = c.cloth;
  for (let i = 0; i < s.length; i++) {
    const px = c.x + s[i] * c.ux + n[i] * c.uy, py = c.y + s[i] * c.uy - n[i] * c.ux;
    if ((px - x) ** 2 + (py - y) ** 2 < r * r) return true;
  }
  return false;
}

function paint(c, art) {
  const cl = c.cloth, { C, R } = cl, N = cl.s.length, half = cl.cfg.len / 2 + 0.5, top = cl.cfg.top;
  const X = new Float64Array(N), Y = new Float64Array(N);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (let i = 0; i < N; i++) {
    X[i] = c.x + cl.s[i] * c.ux + cl.n[i] * c.uy; Y[i] = c.y + cl.s[i] * c.uy - cl.n[i] * c.ux;
    grow(X[i], Y[i]);
  }
  const ra = [c.x - half * c.ux, c.y - half * c.uy], rb = [c.x + half * c.ux, c.y + half * c.uy];
  grow(...ra); grow(...rb);
  const m = cl.cfg.fold + 2, ox = Math.floor(x0 - m), oy = Math.floor(y0 - m), W = (Math.ceil(x1 + m) - ox) * K, H = (Math.ceil(y1 + m) - oy) * K;
  if (buf.length < W * H) { buf = new Uint32Array(W * H * 2); ids = new Uint8Array(W * H * 2); }
  buf.fill(0, 0, W * H); ids.fill(0, 0, W * H);

  // fills a convex-ish polygon (world points), and whatever lies within `thick` world px of its edges
  const fill = (px, py, color, thick, id) => {
    let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (let k = 0; k < px.length; k++) {
      a0 = Math.min(a0, px[k]); a1 = Math.max(a1, px[k]); b0 = Math.min(b0, py[k]); b1 = Math.max(b1, py[k]);
    }
    const i0 = Math.max(0, Math.floor((a0 - thick - ox) * K)), i1 = Math.min(W - 1, Math.ceil((a1 + thick - ox) * K));
    const j0 = Math.max(0, Math.floor((b0 - thick - oy) * K)), j1 = Math.min(H - 1, Math.ceil((b1 + thick - oy) * K));
    const t2 = thick * thick, m = px.length;
    for (let j = j0; j <= j1; j++) {
      const wy = oy + (j + 0.5) / K;
      for (let i = i0; i <= i1; i++) {
        const wx = ox + (i + 0.5) / K;
        let inPoly = false, near = false;
        for (let k = 0, l = m - 1; k < m; l = k++) {
          const xa = px[l], ya = py[l], xb = px[k], yb = py[k];
          if ((ya > wy) !== (yb > wy) && wx < ((xb - xa) * (wy - ya)) / (yb - ya) + xa) inPoly = !inPoly;
          if (!near) {
            const dx = xb - xa, dy = yb - ya, ll = dx * dx + dy * dy;
            const t = ll ? Math.max(0, Math.min(1, ((wx - xa) * dx + (wy - ya) * dy) / ll)) : 0;
            const ex = xa + dx * t - wx, ey = ya + dy * t - wy;
            near = ex * ex + ey * ey <= t2;
          }
        }
        if (inPoly || near) { buf[j * W + i] = color; ids[j * W + i] = id; }
      }
    }
  };

  // the cells of the mesh, lowest first; each one's tone by its facing (from the real pleated points) and its
  // height, its shape the cell taken off its pleats and thickened by them: a solid band of folds seen from above
  const f = cl.cfg.fold, MX = new Float64Array(N), MY = new Float64Array(N);
  for (let i = 0; i < N; i++) { const p = cl.nr[i % C]; MX[i] = X[i] - p * c.uy; MY[i] = Y[i] + p * c.ux; }
  const quads = [];
  for (let r = 0; r + 1 < R; r++) {
    for (let k = 0; k + 1 < C; k++) {
      if (cl.open(r + 1, k)) continue;
      const a = r * C + k, b = a + 1, cc = a + C + 1, d = a + C;
      const z = (cl.z[a] + cl.z[b] + cl.z[cc] + cl.z[d]) / 4;
      // the cell's normal in the world (x, y, up), turned to the side seen from above when it leans enough
      const e1 = [X[cc] - X[a], Y[cc] - Y[a], cl.z[cc] - cl.z[a]], e2 = [X[d] - X[b], Y[d] - Y[b], cl.z[d] - cl.z[b]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (nz < -0.2) { nx = -nx; ny = -ny; nz = -nz; }
      const lit = nx * L[0] + ny * L[1] + nz * L[2];
      let tone = lit < -0.6 ? 1 : lit < -0.15 ? 2 : lit < 0.3 ? 3 : 4;
      if (z < top * 0.45 && nz < 0.5) tone--; // hanging low, in the shadow of the rest
      quads.push({ z, tone: Math.max(0, tone), pts: [a, b, cc, d], id: r + 1 });
    }
  }
  quads.sort((p, q) => p.z - q.z);
  for (const q of quads) fill(q.pts.map((i) => MX[i]), q.pts.map((i) => MY[i]), VELVET[q.tone], f, q.id);
  // a fold lying over a lower part of the cloth: a line of the deepest tone where it ends over it
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const p = j * W + i, id = ids[p];
      if (!id) continue;
      const lower = (q) => ids[q] > id;
      if ((i > 0 && lower(p - 1)) || (i + 1 < W && lower(p + 1)) || (j > 0 && lower(p - W)) || (j + 1 < H && lower(p + W))) buf[p] = VELVET[0];
    }
  }
  // the rod, its ends and its rings
  fill([ra[0], rb[0]], [ra[1], rb[1]], BRASS[1], 0.5, 0);
  for (const e of [ra, rb]) fill([e[0] - 0.75, e[0] + 0.75, e[0] + 0.75, e[0] - 0.75], [e[1] - 0.75, e[1] - 0.75, e[1] + 0.75, e[1] + 0.75], BRASS[0], 0, 0);
  for (let k = 0; k < C; k++) {
    // a ring round the rod where it has slid to: a short bar across it
    const rx = c.x + cl.s[k] * c.ux, ry = c.y + cl.s[k] * c.uy, ex = c.uy * 0.9, ey = -c.ux * 0.9;
    fill([rx - ex, rx + ex], [ry - ey, ry + ey], BRASS[k % 2 ? 2 : 0], 0.3, 0);
  }
  // ink round the whole
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const p = j * W + i;
      if (buf[p]) continue;
      if ((i > 0 && buf[p - 1] && buf[p - 1] !== INK) || (i + 1 < W && buf[p + 1] && buf[p + 1] !== INK) ||
          (j > 0 && buf[p - W] && buf[p - W] !== INK) || (j + 1 < H && buf[p + W] && buf[p + W] !== INK)) buf[p] = INK;
    }
  }

  let cv = art.canvas;
  if (!cv || cv.width !== W || cv.height !== H) {
    cv = art.canvas = document.createElement('canvas');
    cv.width = W; cv.height = H;
  }
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  new Uint32Array(img.data.buffer).set(buf.subarray(0, W * H));
  g.putImageData(img, 0, 0);
  art.ox = ox; art.oy = oy; art.x = c.x; art.y = c.y; art.version = cl.version;
}
