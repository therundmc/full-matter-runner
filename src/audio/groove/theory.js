// Harmony and notation for the groove tracks (audio/tracks/*.js, played by audio/groove/Groove.js). Pure data
// helpers, no WebAudio: chord symbols, voicings, note names, the 16-step token lines (bass, guitar, keys) and the
// melodies. Every pattern is a string of 16 sixteenths.
//
// Token lines (bass, guitar and the pitched one-note parts), read against the chord sounding on each step:
//   R r root   O o octave   F f fifth   T t third   S s seventh   N n ninth   Q q fourth (all from the chord's root,
//   upper case = accented, lower case = ghost)   A approach: a semitone off the next bar's root   x dead note (a
//   muted thump on the root)   C chord strummed down (accent)   c chord strummed up (soft)   X x  a dead strum when
//   the line is a guitar's chord part   '-' tie (the note before goes on)   '.' rest
// Drum lines: '1'..'9' a hit at that velocity / 9, a letter a variant of the instrument (open hat 'o', conga
// 'H' 'h' 'S' 'L' 'B', toms 'H' 'M' 'L') at velocity 0.75 (upper case) or 0.5 (lower case, except the hat's 'o').

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// intervals of each chord quality over its root
const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], 13: [0, 4, 10, 14, 21], m11: [0, 3, 7, 10, 17],
  '7sus4': [0, 5, 7, 10], '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], 'm(add9)': [0, 3, 7, 14], 'maj7#11': [0, 4, 7, 11, 18],
  m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], sus2: [0, 2, 7], '6/9': [0, 4, 7, 9, 14],
};
// the degrees the token letters name, in semitones over the root, per chord family (minor / major / dominant...)
const DEGREE = { T: (c) => c.third, F: (c) => c.fifth, S: (c) => c.seventh, N: () => 14, Q: () => 5, O: () => 12, R: () => 0 };

const CHORDS = new Map();
// a chord symbol ('Dm9', 'G13', 'A7sus4', 'Gmaj7/F#'): { sym, root (pitch class), pcs (pitch classes, root first),
// bass (pitch class), third / fifth / seventh (semitones over the root) }
export function chord(sym) {
  let c = CHORDS.get(sym);
  if (c) return c;
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(sym);
  const ivs = m && QUALITY[m[3]];
  if (!ivs) throw new Error('groove: unknown chord ' + sym);
  const pc = (l, acc) => (PC[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
  const root = pc(m[1], m[2]);
  const has = (i) => ivs.includes(i);
  c = {
    sym, root, pcs: [...new Set(ivs.map((i) => (root + i) % 12))], bass: m[4] ? pc(m[4], m[5]) : root,
    third: has(3) ? 3 : has(4) ? 4 : has(5) ? 5 : 2, fifth: has(6) ? 6 : 7, seventh: has(10) || has(21) ? 10 : has(11) ? 11 : has(9) ? 9 : 10,
  };
  CHORDS.set(sym, c);
  return c;
}

// 'A4', 'C#5', 'Bb3' -> MIDI number (A4 = 69)
export function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('groove: bad note ' + name);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// a melody bar written 'step:note[:length]' separated by spaces ('0:A4:3 3:D5:2 6:F5'), length in sixteenths
// (default 1) -> [[step, midi, length]]; '' or '-' = a bar of rest
export const mel = (s) => (!s || s === '-' ? [] : s.trim().split(/\s+/).map((tok) => {
  const [st, n, len = '1'] = tok.split(':');
  return [+st, midi(n), +len];
}));

// the note of a chord's bass in the register [lo, lo + 11]
export const bassNote = (c, lo) => lo + ((c.bass - lo) % 12 + 12) % 12;

// one token of a line on chord `c` with its bass at `root` (MIDI); null when the token is not a note
export function degree(tok, c, root) {
  const d = DEGREE[tok.toUpperCase()];
  return d ? root + d(c) : null;
}

// the notes of a token line: [{ s, tok, len (sixteenths, ties included), accent }] ('.' and '-' skipped)
const LINES = new Map();
export function tokens(pat) {
  let out = LINES.get(pat);
  if (out) return out;
  out = [];
  for (let s = 0; s < pat.length; s++) {
    const tok = pat[s];
    if (tok === '.' || tok === '-') continue;
    let len = 1;
    while (pat[s + len] === '-') len++;
    out.push({ s, tok, len, accent: tok === tok.toUpperCase() });
  }
  LINES.set(pat, out);
  return out;
}

// the hits of a drum line: [{ s, ch, v }]
const HITS = new Map();
export function hits(pat) {
  let out = HITS.get(pat);
  if (out) return out;
  out = [...pat].flatMap((ch, s) => (ch === '.' ? [] : [{
    s, ch, v: ch >= '1' && ch <= '9' ? ch / 9 : ch === 'o' || ch === ch.toUpperCase() ? 0.75 : 0.5,
  }]));
  HITS.set(pat, out);
  return out;
}

// A voicing of `n` notes of chord `c` within [lo, hi], led from `prev` (the voicing before it) with the least motion.
// The third and the seventh come first, then the ninth / extension, the fifth, the root last (rootless voicings: the
// bass has the root). No semitone between neighbours, no clusters down low.
const VOICED = new Map();
export function voicing(c, { n = 4, lo = 55, hi = 79 } = {}, prev = null) {
  const key = `${c.sym}|${n}|${lo}|${hi}|${prev ? prev.join() : ''}`;
  let best = VOICED.get(key);
  if (best) return best;
  const want = new Map(); // pitch class -> weight of having it
  const rel = (pc) => (pc - c.root + 12) % 12;
  for (const pc of c.pcs) {
    const r = rel(pc);
    want.set(pc, r === c.third || r === c.seventh ? 10 : r === 0 ? 2 : r === 7 ? 3 : 6);
  }
  const cand = [];
  for (let m = lo; m <= hi; m++) if (want.has(m % 12)) cand.push(m);
  const cost = (v) => {
    let k = 0;
    const got = new Set(v.map((m) => m % 12));
    for (const [pc, w] of want) if (!got.has(pc)) k += w * 3;
    if (got.size < v.length) k += 6 * (v.length - got.size); // doubled notes
    for (let i = 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      if (d === 1) k += 12;
      else if (d === 2 && v[i] < 60) k += 4;
    }
    const span = v[v.length - 1] - v[0];
    if (span > 19) k += (span - 19) * 2;
    k += prev ? v.reduce((s, m, i) => s + Math.abs(m - (prev[i] ?? prev[prev.length - 1])), 0) * 0.6
      : Math.abs((v[0] + v[v.length - 1]) / 2 - (lo + hi) / 2) * 0.8;
    return k;
  };
  let bestCost = Infinity;
  const pick = [];
  const rec = (i) => {
    if (pick.length === n) {
      const k = cost(pick);
      if (k < bestCost) { bestCost = k; best = pick.slice(); }
      return;
    }
    for (let j = i; j <= cand.length - (n - pick.length); j++) { pick.push(cand[j]); rec(j + 1); pick.pop(); }
  };
  rec(0);
  if (!best) throw new Error(`groove: no voicing of ${c.sym} in ${lo}..${hi}`);
  VOICED.set(key, best);
  return best;
}

// a value that steps with the level: { 0: a, 2: b } is a at levels 0 and 1, b from 2 on, undefined under 0's key;
// a plain value holds at every level
export function atLevel(map, level) {
  if (map === null || typeof map !== 'object' || Array.isArray(map)) return map;
  let v, best = -1;
  for (const k in map) if (+k <= level && +k > best) { best = +k; v = map[k]; }
  return v;
}
