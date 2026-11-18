// A map-sized picture cut into chunks along x (CHUNKS in Config.js), for maps too long for one canvas (the chase):
// chunks of a baked layer (the floor, the walls) are painted near the view, a few strips a frame, and let go far from
// it; chunks of a layer that only holds marks (blood, flesh) are made where something lands. What is drawn on a layer
// is drawn on every chunk its x range touches, through a context that stands for them all (spread). A map narrower
// than CHUNKS.whole tiles is one chunk with no padding: its context is the canvas's own, as it always was.
// The index arithmetic is pure (unit-tested); canvases are only made when a chunk is.
import { clamp } from '../../engine/math.js';

// the chunks [i0, i1] (inclusive) that the world x range [x0, x1] touches; cw: px across a chunk, n: how many
export function chunkSpan(x0, x1, cw, n) {
  return [clamp(Math.floor(x0 / cw), 0, n - 1), clamp(Math.floor(x1 / cw), 0, n - 1)];
}

// The chunks to let go: alive [{ i, dirty, used }] (used: the frame it was last near the view), near: [i0, i1] the
// span kept for the view. Clean chunks out of it past the `cache` last used; chunks with marks past `keep`, the
// farthest from the view first (never one in the span).
export function toDrop(alive, near, cache, keep) {
  const off = (c) => (c.i < near[0] ? near[0] - c.i : c.i > near[1] ? c.i - near[1] : 0);
  const clean = alive.filter((c) => !c.dirty && off(c) > 0).sort((a, b) => b.used - a.used);
  const marked = alive.filter((c) => c.dirty).sort((a, b) => off(a) - off(b));
  return [...clean.slice(cache), ...marked.slice(keep).filter((c) => off(c) > 0)].map((c) => c.i);
}

// One context standing for several: every call and every setting goes to each of them; a transform given in the
// whole layer's pixels is moved by each chunk's offset (dx, its left edge in those pixels). Reads come from the first.
export function spread(parts) {
  if (parts.length === 1 && parts[0].dx === 0) return parts[0].g;
  const first = parts[0];
  return new Proxy(first.g, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (k === 'setTransform') {
        return (a, b, c, d, e, f) => {
          if (typeof a === 'object') ({ a, b, c, d, e, f } = a);
          for (const p of parts) p.g.setTransform(a, b, c, d, e - p.dx, f);
        };
      }
      if (k === 'resetTransform') return () => { for (const p of parts) p.g.setTransform(1, 0, 0, 1, -p.dx, 0); };
      if (k === 'getTransform') return () => { const m = t.getTransform(); m.e += first.dx; return m; };
      if (k === 'putImageData') return (img, x, y, ...r) => { for (const p of parts) p.g.putImageData(img, x - p.dx, y, ...r); };
      return (...a) => { let r; for (const p of parts) r = p.g[k](...a); return r; };
    },
    set(t, k, v) { for (const p of parts) p.g[k] = v; return true; },
  });
}

// A layer of the map in chunks. w, h: world px of the map; tile: px of a tile; o: { whole, cols: tiles across a chunk
// (a map no wider than `whole` tiles is one chunk), scale: canvas px per world px, bake(g, x0, x1) -> iterator of its
// steps or nothing: the chunk's base painting with g in world px (none: a layer of marks only), lazy (baked where it
// is asked for, not for the view), keep, cache, pad, overlap (drawn over its neighbour by pad px: an opaque layer),
// smooth (imageSmoothingEnabled) }
export class ChunkedLayer {
  constructor(w, h, tile, o) {
    this.w = w; this.h = h;
    const one = w <= o.whole * tile;
    this.cw = one ? w : o.cols * tile;
    this.n = Math.max(1, Math.ceil(w / this.cw));
    this.pad = one ? 0 : o.pad;
    this.scale = o.scale ?? 1;
    this.o = o;
    this.chunks = new Array(this.n).fill(null);
    this.views = new Map(); // spread contexts by span
    this.frame = 0;
  }

  get alive() { return this.chunks.filter(Boolean); }

  // chunk i, made (and wholly baked) if it is not there and `make`
  chunk(i, make = true) {
    let c = this.chunks[i];
    if (c || !make) return c?.steps ? this.finish(c) : c;
    const x0 = i * this.cw - this.pad, x1 = Math.min(this.w, (i + 1) * this.cw) + this.pad, s = this.scale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((x1 - x0) * s); canvas.height = Math.ceil(this.h * s);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = !!this.o.smooth;
    g.setTransform(s, 0, 0, s, -x0 * s, 0);
    c = this.chunks[i] = { i, x0, x1, canvas, g, dx: x0 * s, dirty: false, used: this.frame, steps: null };
    this.views.clear();
    if (this.o.bake) c.steps = this.o.bake(g, x0, x1) || null;
    return make === 'start' ? c : this.finish(c);
  }

  // a chunk's bake carried on until done, or for `ms` (then it is left for the next frame)
  finish(c, ms = Infinity) {
    const t0 = performance.now();
    while (c.steps) {
      if (c.steps.next().done) c.steps = null;
      else if (performance.now() - t0 > ms) break;
    }
    if (!c.steps) c.g.setTransform(this.scale, 0, 0, this.scale, -c.dx, 0);
    return c;
  }

  // a context over the world x range [x0, x1] for a mark: a layer of marks makes its chunks there (unless not `make`),
  // a baked one only takes it on the chunks it has (a mark far out of view on the floor is lost); null when none
  ctx(x0, x1, make = true) {
    const [i0, i1] = chunkSpan(x0 - this.pad, x1 + this.pad, this.cw, this.n);
    const parts = [];
    for (let i = i0; i <= i1; i++) {
      const c = this.o.bake || !make ? this.chunks[i] && this.finish(this.chunks[i]) : this.chunk(i);
      if (c) { c.dirty = true; parts.push(c); }
    }
    if (!parts.length) return null;
    const key = `${parts[0].i}:${parts[parts.length - 1].i}:${parts.length}`;
    let v = this.views.get(key);
    if (!v) this.views.set(key, (v = spread(parts)));
    return v;
  }

  // the view spans world x [x0, x1]: the chunks it shows are baked now, those within `margin` px a little each frame
  // (CHUNKS.budget), the rest let go (toDrop)
  near(x0, x1, margin, budget) {
    this.frame++;
    const see = chunkSpan(x0, x1, this.cw, this.n), span = chunkSpan(x0 - margin, x1 + margin, this.cw, this.n);
    for (let i = span[0]; i <= span[1]; i++) {
      const shown = i >= see[0] && i <= see[1];
      if ((!this.o.bake || this.o.lazy) && !this.chunks[i]) continue; // made where they are needed, not for the view
      const c = this.chunks[i] || this.chunk(i, 'start');
      c.used = this.frame;
      if (shown) this.finish(c);
    }
    let left = budget;
    for (let i = span[0]; i <= span[1] && left > 0; i++) {
      const c = this.chunks[i];
      if (!c?.steps) continue;
      const t0 = performance.now();
      this.finish(c, left);
      left -= performance.now() - t0;
    }
    for (const i of toDrop(this.alive, span, this.o.cache, this.o.keep)) this.drop(i);
  }

  drop(i) {
    const c = this.chunks[i];
    if (!c) return;
    c.canvas.width = c.canvas.height = 0; // its pixels let go now, not when collected
    this.chunks[i] = null;
    this.views.clear();
  }

  // every chunk let go (the map changed under a layer baked from it)
  reset() { for (let i = 0; i < this.n; i++) this.drop(i); }

  // the layer's part in the world rect [x0, x1] x [y0, y1] onto ctx (in world px); a chunk still baking is finished
  draw(ctx, x0, y0, x1, y1) {
    y0 = Math.max(0, y0); y1 = Math.min(this.h, y1);
    if (y1 <= y0) return;
    const [i0, i1] = chunkSpan(Math.max(0, x0), Math.min(this.w, x1) - 1e-6, this.cw, this.n), s = this.scale;
    for (let i = i0; i <= i1; i++) {
      const c = this.chunks[i] && this.finish(this.chunks[i]);
      if (!c) continue;
      const a = Math.max(x0, i * this.cw, 0), b = Math.min(x1, (i + 1) * this.cw + (this.o.overlap ? this.pad : 0), this.w);
      if (b <= a) continue;
      ctx.drawImage(c.canvas, (a - c.x0) * s, y0 * s, (b - a) * s, (y1 - y0) * s, a, y0, b - a, y1 - y0);
    }
  }

  // what its canvases hold, bytes
  get bytes() { return this.alive.reduce((n, c) => n + c.canvas.width * c.canvas.height * 4, 0); }
}
