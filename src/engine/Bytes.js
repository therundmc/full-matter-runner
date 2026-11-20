// An estimate of the memory a thing's buffers hold, for the perf overlay (F8, systems/Perf.js): { arr, cvs } bytes.
//   arr  typed arrays and ImageData: ArrayBuffers, counted in the JS heap (performance.memory)
//   cvs  canvases: width x height x 4, held by the browser's raster / graphics memory, not the JS heap
// The walk starts at the roots' own fields and goes into arrays, Maps, Sets and plain objects only (never into
// another class instance: a system's world, its entities; pass those as roots of their own), `depth` levels down.
// `seen` is shared by the calls of one estimate: a buffer is counted once, by the first owner that reaches it.
// DOM-free: a canvas is anything with a numeric width and a getContext.

// fields that lead back into the world rather than to what a thing owns
const SKIP = new Set(['world', 'game', 'body', 'parent', 'parts', 'vertices', 'events', 'map', 'level', 'camera', 'entity', 'owner']);

// a list longer than LONG is only followed when one of its first SAMPLE items is, or directly holds, a buffer (long
// lists of small records: wall segments, paths, stains hold none, and walking them is what an estimate costs)
const LONG = 256, SAMPLE = 8;
const isCanvas = (v) => typeof v.getContext === 'function' && typeof v.width === 'number';
const plain = (v) => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };

const buffer = (x) => x !== null && typeof x === 'object' && (ArrayBuffer.isView(x) || x instanceof ArrayBuffer || isCanvas(x) || ArrayBuffer.isView(x.data));
function holds(list) {
  let i = 0;
  for (const x of list.values()) {
    if (i++ >= SAMPLE) break;
    if (buffer(x) || (x !== null && typeof x === 'object' && plain(x) && Object.values(x).some(buffer))) return true;
  }
  return false;
}

export function bytesOf(roots, seen = new Set(), depth = 3) {
  const out = { arr: 0, cvs: 0 };
  let budget = 50000; // things looked at, at most: an estimate never costs a frame
  const visit = (v, d, root) => {
    if (v === null || typeof v !== 'object' || seen.has(v) || --budget < 0) return;
    if (ArrayBuffer.isView(v)) { visit(v.buffer, 0); return; }
    if (v instanceof ArrayBuffer) { seen.add(v); out.arr += v.byteLength; return; }
    if (isCanvas(v)) { seen.add(v); out.cvs += v.width * v.height * 4; return; }
    if (ArrayBuffer.isView(v.data) && typeof v.width === 'number') { visit(v.data, 0); return; } // ImageData
    const list = Array.isArray(v) || v instanceof Map || v instanceof Set;
    if (d <= 0 || (!root && !list && !plain(v))) return; // (another class instance: left for its owner to count)
    seen.add(v);
    if (list && (v.length ?? v.size) > LONG && !holds(v)) return;
    if (list) { for (const x of v.values()) visit(x, d - 1); return; }
    for (const k of Object.keys(v)) if (!SKIP.has(k)) visit(v[k], d - 1);
  };
  for (const r of [].concat(roots)) visit(r, depth, true);
  return out;
}

