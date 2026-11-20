// Where a frame's time goes. Sections are timed with begin(name) / end(name) (performance.now(), added up when a
// section runs several times in a frame: one per simulation step), counters with count(name, n, bytes); frame(ms)
// closes the frame and keeps its totals in rings of the last `size` frames, read back as rolling stats (stats: mean,
// min, max, p95 over the last `span` ms of frames). DOM-free, no allocation per call.
// Off by default: every call site is guarded (`if (PROF.on) PROF.begin('x')`), so that it costs nothing until the
// perf overlay turns it on (F8, systems/Perf.js).

// q (0..1) of a list of numbers, nearest rank (the list is not changed)
export function percentile(values, q) {
  const n = values.length;
  if (!n) return 0;
  const s = Array.from(values).sort((a, b) => a - b);
  return s[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
}

export default class Profiler {
  // size: frames kept; now: the clock (ms)
  constructor(size = 240, now = () => performance.now()) {
    this.on = false;
    this.size = size;
    this.now = now;
    this.slots = new Map();  // section -> { t0, acc, ring }
    this.counts = new Map(); // counter -> { n, bytes, rn, rb }
    this.ms = new Float32Array(size); // each kept frame's length, ms
    this.head = 0;           // the ring's next frame
    this.filled = 0;
    this.scratch = [];
  }

  slot(name) {
    let s = this.slots.get(name);
    if (!s) this.slots.set(name, (s = { t0: -1, acc: 0, ring: new Float32Array(this.size) }));
    return s;
  }

  begin(name) { this.slot(name).t0 = this.now(); }

  // (an end with no begin, the profiler turned on in between, is ignored)
  end(name) {
    const s = this.slots.get(name);
    if (!s || s.t0 < 0) return;
    s.acc += this.now() - s.t0;
    s.t0 = -1;
  }

  // ms measured elsewhere, put on a section
  add(name, ms) { this.slot(name).acc += ms; }

  count(name, n = 1, bytes = 0) {
    let c = this.counts.get(name);
    if (!c) this.counts.set(name, (c = { n: 0, bytes: 0, rn: new Float32Array(this.size), rb: new Float32Array(this.size) }));
    c.n += n;
    c.bytes += bytes;
  }

  // the frame is over: it lasted ms; its totals go into the rings
  frame(ms) {
    const h = this.head;
    this.ms[h] = ms;
    for (const s of this.slots.values()) { s.ring[h] = s.acc; s.acc = 0; }
    for (const c of this.counts.values()) { c.rn[h] = c.n; c.rb[h] = c.bytes; c.n = c.bytes = 0; }
    this.head = (h + 1) % this.size;
    this.filled = Math.min(this.size, this.filled + 1);
  }

  // forget every frame (turned on again: no stale numbers)
  reset() {
    this.head = this.filled = 0;
    this.ms.fill(0);
    for (const s of this.slots.values()) { s.ring.fill(0); s.acc = 0; s.t0 = -1; }
    for (const c of this.counts.values()) { c.rn.fill(0); c.rb.fill(0); c.n = c.bytes = 0; }
  }

  // how many of the last frames make up span ms (at least one when there is one)
  frames(span) {
    let n = 0, t = 0;
    while (n < this.filled && (n === 0 || t < span)) { t += this.ms[(this.head - 1 - n + this.size) % this.size]; n++; }
    return n;
  }

  // a ring's last n frames: { mean, min, max, p95, last }
  over(ring, n) {
    const out = { mean: 0, min: 0, max: 0, p95: 0, last: 0 };
    if (!n) return out;
    const v = this.scratch;
    v.length = n;
    let sum = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = ring[(this.head - 1 - i + this.size) % this.size];
      v[i] = x; sum += x;
      if (x < min) min = x;
      if (x > max) max = x;
    }
    out.mean = sum / n; out.min = min; out.max = max; out.p95 = percentile(v, 0.95); out.last = v[0];
    return out;
  }

  // a section's ms a frame over the last span ms
  stats(name, span = 500) { return this.over(this.slot(name).ring, this.frames(span)); }

  // the frames' own lengths over the last span ms
  frameStats(span = 500) { return this.over(this.ms, this.frames(span)); }

  // a counter a frame over the last span ms: { n, bytes } (means)
  countStats(name, span = 500) {
    const c = this.counts.get(name), n = this.frames(span);
    if (!c || !n) return { n: 0, bytes: 0 };
    return { n: this.over(c.rn, n).mean, bytes: this.over(c.rb, n).mean };
  }

  // a section's ms in the last frame
  last(name) { const s = this.slots.get(name); return s && this.filled ? s.ring[(this.head - 1 + this.size) % this.size] : 0; }
}

// the game's one profiler
export const PROF = new Profiler();
