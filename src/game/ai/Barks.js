// What a guard says, worked out (no DOM, no world state of its own): the blanks of a line filled ({N} a name, {AT} /
// {P} a place), the line picked among an occasion's, the names handed out, and the place a point lies in, by the
// level's soundscape zones and the landmarks around it (lines and names: data/barks.js; used by Director.bark).
import { TILE, AMBIENCE } from '../Config.js';
import { NAMES, PLACES, LANDMARKS } from '../data/barks.js';

const BLANK = /\{(\w+)\}/g;
// doors, windows and walls (a wall blown open is a way through): between two places, named neither
const BETWEEN = new Set(['D', 'L', 'G', 'F', 'X', '#', 'P', 'M', 'Y', 'V']);

// `line` with its blanks filled from vars, or null when one of them has nothing to fill it
export function fill(line, vars = {}) {
  let ok = true;
  const out = line.replace(BLANK, (_, k) => {
    const v = vars[k];
    if (v == null || v === '') ok = false;
    return v ?? '';
  });
  return ok ? out : null;
}

// A line of `lines` for these vars: the lines that use a blank given win over the plain ones (a name said beats
// "MAN DOWN!"), a line the squad has just said (`recent`, oldest first) is passed over while another one is left,
// and once they all have been, the one said the longest ago comes back. null if none can be filled.
export function lineFor(lines, vars = {}, recent = [], rnd = Math.random) {
  const filled = [];
  for (const l of lines) {
    const s = fill(l, vars);
    if (s !== null) filled.push({ s, telling: s !== l });
  }
  if (!filled.length) return null;
  const telling = filled.filter((f) => f.telling);
  const pool = (telling.length ? telling : filled).map((f) => f.s);
  const fresh = pool.filter((s) => !recent.includes(s));
  if (fresh.length) return fresh[Math.floor(rnd() * fresh.length)];
  return pool.reduce((a, b) => (recent.lastIndexOf(b) < recent.lastIndexOf(a) ? b : a));
}

// a name nobody in `taken` has yet (the list over again, numbered, once it is used up)
export function freeName(taken, rnd = Math.random) {
  const free = NAMES.filter((n) => !taken.has(n));
  if (free.length) return free[Math.floor(rnd() * free.length)];
  let i = 2;
  while (taken.has(`${NAMES[0]} ${i}`)) i++;
  return `${NAMES[0]} ${i}`;
}

// the place key of (x, y): its soundscape zone's (the 6th element, else the kind), 'roof' on a roof tile, 'street' on
// open ground of a level with zones, else null (a doorway, a wall, a room of a level without zones). The level's own
// tiles tell what stood there before anything was broken.
function placeKey(level, map, x, y) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  const zones = level?.soundscape?.zones;
  const z = zones?.find(([, c0, r0, c1, r1]) => cx >= c0 && cx <= c1 && cy >= r0 && cy <= r1);
  if (z) return z[5] ?? z[0];
  if (!map || BETWEEN.has(level?.tiles?.[cy]?.[cx] ?? map.at(cx, cy))) return null;
  if (map.at(cx, cy) === '^') return 'roof';
  return zones?.length && !AMBIENCE.indoors.includes(map.floor?.[cy * map.w + cx]) ? 'street' : null;
}

// Where (x, y) lies, { key, at, the } (data/barks.js PLACES / LANDMARKS), or null when it has no name (a room of a
// level without zones). A landmark of the same place within `reach` px of its box wins. level: its
// `soundscape.zones` [kind, col0, row0, col1, row1, place?] (the first wins); map: TileMap; props: the world's.
export function placeOf(level, map, props, x, y, reach = 24) {
  const key = placeKey(level, map, x, y);
  let best = null, bd = reach;
  for (const p of props || []) {
    const names = LANDMARKS[p.type];
    if (!names || p.dead) continue;
    const half = Math.max(p.def?.w ?? p.w ?? 0, p.def?.h ?? p.h ?? 0) / 2;
    const d = Math.hypot(p.x - x, p.y - y) - half;
    if (d < bd && placeKey(level, map, p.x, p.y) === key) { bd = d; best = { key: p.type, at: names[0], the: names[1] }; }
  }
  if (best) return best;
  const names = key && PLACES[key];
  return names ? { key, at: names[0], the: names[1] } : null;
}
