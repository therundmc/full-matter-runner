// The opening's pixel tools: everything in it is painted with these on canvases at the title's logical resolution,
// so that a pixel is a pixel whatever the window's size. Flat colours, hard edges, and shade as an ordered dither
// (a comic's screentone), never a smooth gradient.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
export const lerp = (a, b, k) => a + (b - a) * k;
export const hash = (n) => { const s = Math.sin(n * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); };

export function px(g, col, x, y, w = 1, h = 1) {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// is the pixel inked at that level of a 4 x 4 ordered dither (0 never, 1 always)?
export const inked = (x, y, level) => level >= 1 || (BAYER[(x & 3) + (y & 3) * 4] + 0.5) / 16 < level;

// screentone: the pixels of the rectangle that the dither inks at that level
export function tone(g, col, x, y, w, h, level = 0.5) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillStyle = col;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (inked(x + i, y + j, level)) g.fillRect(x + i, y + j, 1, 1);
}

// a filled polygon with hard edges (one run of pixels per row), dithered under level 1. pts: [[x, y]...]
export function poly(g, col, pts, level = 1) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  g.fillStyle = col;
  for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
      if (level >= 1) g.fillRect(xa, y, Math.max(1, xb - xa), 1);
      else for (let x = xa; x < xb; x++) if (inked(x, y, level)) g.fillRect(x, y, 1, 1);
    }
  }
}

// a filled ellipse with hard edges
export function disc(g, col, cx, cy, rx, ry = rx, level = 1) {
  g.fillStyle = col;
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)), xa = Math.round(cx - half), xb = Math.round(cx + half);
    if (level >= 1) g.fillRect(xa, y, Math.max(1, xb - xa), 1);
    else for (let x = xa; x < xb; x++) if (inked(x, y, level)) g.fillRect(x, y, 1, 1);
  }
}

// a line of square pixels, w thick
export function line(g, col, x0, y0, x1, y1, w = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  g.fillStyle = col;
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), w, w);
}
