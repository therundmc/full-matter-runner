// The soundtrack's score (played by audio/Music.js): original material, F minor with excursions to C minor and
// Bb minor, 126 BPM house. Pure data and the small harmony helpers that read it, no WebAudio: chords and
// progressions, 16-step patterns, lead phrases, the sections (which layers, how loud, how they move) and the forms
// (sections in order) of each state of the game.
//
// States and forms:
//   menu   intro, ambient                          the title screen
//   calm   calmA, calmB                             a moody pad, a muted pulse that breathes, a slow arpeggio
//   tense  tense, tenseB                            a heartbeat, the bass comes in, ticking percussion, risers
//   game   verseA ... dropB2 (11 sections)          the song with its beat (after an alert, while they search)
//   combat fightA, fightB, bridge, chase            the fight: house, four on the floor, layers brought in by kills

// ---------------------------------------------------------------- harmony
const PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const QUALITY = {
  '': [0, 4, 7], 'm(add9)': [0, 3, 7, 14], m9: [0, 3, 7, 10, 14], m6: [0, 3, 7, 9], maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14],
  'maj7#11': [0, 4, 7, 11, 18], 6: [0, 4, 7, 9], '7sus4': [0, 5, 7, 10], '7b9': [0, 4, 7, 10, 13], dim7: [0, 3, 6, 9],
};

// one chord per bar, [a, b] = two chords (half bar each); '/X' = bass note
export const PROGRESSIONS = {
  // the calm: two bars a chord, i - VI - iv - bII, then the dominant; its answer through bIII, the borrowed iv (Dbm6)
  calmA: ['Fm9', 'Fm9', 'Dbmaj7', 'Dbmaj7', 'Bbm9', 'Bbm9', 'Gbmaj7#11', 'C7sus4'],
  calmB: ['Abmaj7/Eb', 'Abmaj7/Eb', 'Dbmaj9', 'Dbmaj9', 'Bbm9', 'Gbmaj7', 'Dbm6', 'C7b9'],
  // tense: the F pedal rubbed by its phrygian bII, a diminished chord that will not settle
  tense: ['Fm(add9)', 'Gbmaj7/F', 'Fm(add9)', 'Gbmaj7/F', 'Dbmaj7/F', 'Ddim7', 'Bbm9/F', 'C7b9'],
  tenseB: ['Bbm9/F', 'Gbmaj7/F', 'Fm(add9)', 'Ddim7', 'Bbm9/F', 'Gbmaj7#11', 'C7sus4', 'C7b9'],
  // F pedal under i - VI - iv - bII (Neapolitan colour), then the dominant sus
  intro: ['Fm(add9)', 'Dbmaj7/F', 'Bbm9/F', 'Gbmaj7/F', 'Fm(add9)', 'Dbmaj7/F', 'Bbm9/F', 'C7sus4/F'],
  // descending lament bass in the second half: F Eb Db C
  verseA: ['Fm9', 'Dbmaj9', 'Bbm9', ['C7sus4', 'C7b9'], 'Fm9', 'Abmaj7/Eb', 'Dbmaj7#11', ['C7sus4', 'C7b9']],
  // iv - bII - i - borrowed minor bVI, then V/V (secondary dominant) into V
  verseB: ['Bbm9', 'Gbmaj7', 'Fm9', 'Dbm6', 'Abmaj7/C', 'G7b9', 'C7sus4', 'C7b9'],
  // chromatic rising bass Db D Eb E into the drop's F
  build: ['Dbmaj7', 'Bbm9', 'Gbmaj7#11', 'C7sus4', 'Dbmaj7', 'Ddim7', 'Eb7sus4', 'Edim7'],
  drop: ['Fm9', 'Dbmaj7', 'Bbm9', 'C7b9', 'Fm9', 'Dbmaj7', 'Gbmaj7', ['C7sus4', 'C7b9']],
  // Bb minor / Db major, ending on F7: its deceptive resolution is the next verse's Fm
  break: ['Bbm9', 'Gbmaj7', 'Dbmaj9', 'Ab6', 'Bbm9', 'Gbmaj7#11', 'Bbm9', ['F7sus4', 'F7b9']],
  // same shape in C minor (v), pivoting back through Db - C7 (VI - V of F minor)
  dropB: ['Cm9', 'Abmaj7', 'Fm9', 'G7b9', 'Cm9', 'Abmaj7', 'Dbmaj7', ['C7sus4', 'C7b9']],
  // the fight's second theme: VI - VII - i, the epic minor climb, twice, then bII and the dominant
  fightB: ['Dbmaj7', 'Eb', 'Fm9', 'Fm9', 'Dbmaj7', 'Eb', 'Gbmaj7#11', ['C7sus4', 'C7b9']],
  // the fight's breakdown: Bb minor and its bVI, then the chromatic rising bass Db D Eb E back into F
  bridge: ['Bbm9', 'Gbmaj7', 'Bbm9', 'Gbmaj7#11', 'Dbmaj7', 'Ddim7', 'Eb7sus4', 'Edim7'],
  // the fight's chase: phrygian bII over an F pedal, then iv - bII and the dominant with its leading-tone dim7
  chase: ['Fm(add9)', 'Gbmaj7/F', 'Fm(add9)', ['Dbmaj7', 'C7b9'], 'Bbm9', 'Gbmaj7#11', 'C7sus4', ['C7b9', 'Edim7']],
};

const CHORDS = new Map();
export function chord(sym) {
  let c = CHORDS.get(sym);
  if (c) return c;
  const m = /^([A-G]b?)([^/]*)(?:\/([A-G]b?))?$/.exec(sym);
  const ivs = m && QUALITY[m[2]];
  if (!ivs) throw new Error('Music: unknown chord ' + sym);
  const root = PC[m[1]];
  c = { sym, root, pcs: [...new Set(ivs.map((i) => (root + i) % 12))], bass: m[3] ? PC[m[3]] : root };
  CHORDS.set(sym, c);
  return c;
}
for (const prog of Object.values(PROGRESSIONS)) prog.flat().forEach(chord); // fail fast on typos

export const bassMidi = (pc) => 28 + ((pc + 8) % 12); // E1..Eb2: sub stays under ~80 Hz

// nearest chord tone at or above `target` (fifths/sevenths of slash chords stay in the chord)
export function chordTone(c, target) {
  for (let n = target; ; n++) if (c.pcs.includes(n % 12)) return n;
}

// 5-note pad voicing that covers every pitch class with the smallest motion from the previous voicing
const VOICINGS = new Map();
export function voiceLead(c, prev) {
  const key = (prev ? prev.join() : '') + '|' + c.sym;
  let best = VOICINGS.get(key);
  if (best) return best;
  const cand = [];
  for (let n = 53; n <= 79; n++) if (c.pcs.includes(n % 12)) cand.push(n);
  const cost = (v) => {
    for (const pc of c.pcs) if (!v.some((n) => n % 12 === pc)) return Infinity;
    let k = prev ? v.reduce((s, n, i) => s + Math.abs(n - prev[i]), 0) : Math.abs(v[0] + v[4] - 128);
    for (let i = 1; i < 5; i++) {
      const d = v[i] - v[i - 1];
      if (d === 1) k += 8;               // semitone rub between neighbours
      else if (d === 2 && v[i] < 62) k += 3; // low cluster = mud
    }
    const span = v[4] - v[0];
    if (span > 24) k += (span - 24) * 2;
    if (span < 12) k += (12 - span) * 2;
    if (v[0] < 56) k += (56 - v[0]) * 2;
    return k;
  };
  let bestCost = Infinity;
  const pick = [];
  const rec = (i) => {
    if (pick.length === 5) {
      const k = cost(pick);
      if (k < bestCost) { bestCost = k; best = pick.slice(); }
      return;
    }
    for (let j = i; j <= cand.length - (5 - pick.length); j++) { pick.push(cand[j]); rec(j + 1); pick.pop(); }
  };
  rec(0);
  VOICINGS.set(key, best);
  return best;
}

// arp pool: 6 chord tones ascending from `base`
export function arpPool(c, base) {
  const out = [];
  for (let n = base; out.length < 6; n++) if (c.pcs.includes(n % 12)) out.push(n);
  return out;
}

// ---------------------------------------------------------------- patterns (16 steps)
// drums: digit = velocity /9, 'o' open hat, H/M/L toms
export const KICK = {
  heart: '9.........7.....', four: '9...9...9...9...', broken: '9.....7.9.....7.', drive: '9...9...9...9..6',
  build8: '8.8.8.8.9.9.9.9.', half: '9.........8.....',
};
export const SNARE = {
  back: '....9.......9...', ghost: '....9..2....9.2.', half: '........9.......',
  roll8: '5.5.5.5.6.6.6.6.', roll8b: '6.6.6.6.7.7.7.7.', roll16: '6666777788889999', breakRoll: '........55667789',
  skank: '..6.9.6...6.9.6.', // offbeat pushes around the backbeat: reads as double time
  push: '....9.......9.39', // the backbeat with a kick-drum-like double push into the next bar
};
export const HATS = {
  house: '..o...o...o...o.', house16: '3.o33.o33.o33.o3', // the open hat on every off-beat
  off8: '..5...5...5...5.', eights: '6.3.6.3.6.3.6.3.', sixteen: '6243624362436245', drive: '73o373o373o373o3',
  tick: '..3...3...3...3.',
};
export const FILLS = {
  small: { snare: '.............4.6' }, flam: { snare: '............6.79' }, roll: { snare: '........45667789' },
  toms: { tom: '........H.HMM.LL' }, toms2: { tom: '............HMLL', snare: '........7.......' },
};
// percussion one-shots, by buffer name: [buffer, pattern] in a section's `perc` (H/M/L: high / mid / low tom)
export const PERC = {
  shake16: '2524252425242526', shake8: '..4...4...4...4.', tick: '....3.......3..2',
  rim: '...6..6....6..6.', clank: '......8.......7.', tribal: 'L..M..H.L..ML.HM', tribal2: 'L.L..MH.L..M.HHM',
};
// bass: R root (accent) r root (ghost) O octave F fifth 7 seventh A chromatic approach to the next bar, '-' tie.
// The calm's pulse reads the same letters an octave up
export const BASS = {
  pedal: 'R---------------', held: 'R-------O-------', halftime: 'R-----r.R---F-r.', pulse8: 'R.r.R.r.R.r.R.rA',
  octave: 'R.O.r.O.R.O.rOrA', syncop: 'R..rR.r.R..rO.rA', gallop: 'R.rrR.rrR.rrR.rO', drive: 'RrrORrrrRrrORrr7',
  pump: '..R-..R-..R-..RA', roll: '.rRr.rRr.rRr.rRA', // house: between the kicks, so the bass pumps
  rush: 'RrOrRrOrRrOrRO7A', tresillo: 'RrrOrrOrRrrOrrOA', // fight: 16ths with rolling / 3-3-2 octave accents
};
export const PULSE = {
  breathe: 'R.r.R.r.R.r.R.r.', lift: 'R.r.F.r.O.r.F.r.', tick: 'RrrrRrrrRrrrRrrr', climb: 'RrFrOrFrRrFrOrFr',
};
// arp: index into the 6-note pool
export const ARP = {
  rest: '................', sparse: '0...2...1...3...', pulse8: '0.2.1.3.0.2.4.3.', broken: '0213243102132435',
  updown: '0123454321012345', up: '0123450123452345', cascade: '5432105432104321', pedal: '0102030401020305',
  breath: '0.1.2.4.3.2.1.2.', sigh: '4.3.1.0.2.1.0.1.',
};
// stabs (the rave-stab voice, fights and drops): the chord struck on these steps
export const STABS = { tresillo: '9..9..9.9..9..9.', eights: '9.6.9.6.9.6.9.6.', offbeat: '..9...9...9...9.' };

// lead phrases: per bar, [step, midi, length in 16ths]; null = rest
export const LEADS = {
  drop: [
    [[0, 72, 3], [3, 75, 3], [6, 77, 6], [12, 79, 2], [14, 80, 2]],
    [[0, 80, 6], [6, 77, 2], [8, 72, 8]],
    [[0, 77, 3], [3, 73, 3], [6, 77, 4], [10, 80, 6]],
    [[0, 79, 6], [6, 76, 4], [10, 73, 6]],
    [[0, 72, 3], [3, 75, 3], [6, 77, 6], [12, 84, 4]],
    [[0, 84, 6], [6, 80, 2], [8, 77, 8]],
    [[0, 78, 6], [6, 77, 2], [8, 73, 8]],
    [[0, 77, 8], [8, 76, 8]],
  ],
  // short octave answers at the end of verse phrases
  answers: [null, null, null, [[8, 80, 2], [10, 76, 2], [12, 73, 4]], null, null, null,
    [[8, 79, 2], [10, 76, 2], [12, 73, 2], [14, 72, 2]]],
  // the fight's second hook, over VI - VII - i: a 3-3-2 call that climbs a step each time
  hook: [
    [[0, 77, 3], [3, 77, 3], [6, 80, 2], [8, 77, 2], [10, 75, 2], [12, 73, 4]],
    [[0, 75, 3], [3, 75, 3], [6, 79, 2], [8, 82, 4], [12, 79, 2], [14, 75, 2]],
    [[0, 77, 3], [3, 80, 3], [6, 84, 6], [12, 82, 2], [14, 80, 2]],
    [[0, 79, 3], [3, 79, 3], [6, 77, 2], [8, 72, 3], [11, 72, 3], [14, 75, 2]],
    [[0, 77, 3], [3, 77, 3], [6, 80, 2], [8, 84, 2], [10, 80, 2], [12, 77, 4]],
    [[0, 75, 3], [3, 79, 3], [6, 82, 2], [8, 87, 4], [12, 85, 2], [14, 84, 2]],
    [[0, 85, 3], [3, 84, 3], [6, 82, 2], [8, 78, 4], [12, 77, 4]],
    [[0, 77, 3], [3, 79, 3], [6, 82, 2], [8, 85, 2], [10, 84, 2], [12, 79, 2], [14, 76, 2]],
  ],
  // the breakdown: long notes that cry over the half-time, then a climb on the rising bass
  bridge: [
    [[0, 77, 6], [6, 80, 2], [8, 82, 8]],
    [[0, 85, 8], [8, 82, 4], [12, 78, 4]],
    [[0, 80, 6], [6, 82, 2], [8, 84, 8]],
    [[0, 85, 6], [6, 84, 2], [8, 82, 8]],
    [[0, 80, 4], [4, 77, 4], [8, 84, 8]],
    [[0, 86, 4], [4, 83, 4], [8, 80, 4], [12, 77, 4]],
    [[0, 80, 4], [4, 82, 4], [8, 85, 4], [12, 87, 4]],
    [[0, 88, 6], [6, 85, 2], [8, 82, 2], [10, 79, 2]],
  ],
  // chase: the head of the motif (C Eb F, then G Ab) as a 16th ostinato that follows the chords, a dim7 run to end
  chase: [
    [[0, 72, 1], [1, 75, 1], [2, 77, 2], [4, 72, 1], [5, 75, 1], [6, 77, 2], [8, 79, 1], [9, 80, 1], [10, 84, 3], [14, 80, 2]],
    [[0, 73, 1], [1, 77, 1], [2, 78, 2], [4, 73, 1], [5, 77, 1], [6, 78, 2], [8, 82, 1], [9, 80, 1], [10, 78, 3], [14, 77, 2]],
    [[0, 72, 1], [1, 75, 1], [2, 77, 2], [4, 72, 1], [5, 75, 1], [6, 77, 2], [8, 84, 2], [10, 80, 2], [12, 79, 2], [14, 77, 2]],
    [[0, 80, 3], [3, 77, 3], [6, 73, 2], [8, 76, 3], [11, 79, 3], [14, 82, 2]],
    [[0, 77, 1], [1, 73, 1], [2, 77, 2], [4, 77, 1], [5, 73, 1], [6, 77, 2], [8, 80, 1], [9, 82, 1], [10, 85, 3], [14, 82, 2]],
    [[0, 78, 1], [1, 73, 1], [2, 78, 2], [4, 78, 1], [5, 73, 1], [6, 78, 2], [8, 82, 1], [9, 84, 1], [10, 85, 3], [14, 84, 2]],
    [[0, 79, 3], [3, 77, 3], [6, 79, 2], [8, 82, 3], [11, 79, 3], [14, 77, 2]],
    [[0, 76, 2], [2, 79, 2], [4, 82, 2], [6, 85, 2], [8, 88, 2], [10, 85, 2], [12, 82, 2], [14, 79, 2]],
  ],
};
LEADS.dropB = LEADS.drop.map((bar, i) => (i < 6 ? bar.map(([s, m, l]) => [s, m - 5, l])
  : i === 6 ? [[0, 77, 6], [6, 75, 2], [8, 72, 8]] : bar));
// fight: the drop motif re-struck, every held note broken into detached 3-3-2 cells of the same pitch
const restrike = ([s, m, len]) => {
  const out = [];
  for (const cell of len >= 8 ? [3, 3] : len >= 6 ? [3] : len >= 4 ? [2] : []) {
    out.push([s, m, cell * 0.7]);
    s += cell; len -= cell;
  }
  out.push([s, m, len]);
  return out;
};
LEADS.fight = LEADS.drop.map((bar) => bar.flatMap(restrike));

// ---------------------------------------------------------------- arrangement
// A section names its progression (`prog`) and its layers. A layer is a pattern name, or a list of them: in a fight
// the list is read by stage (the kill chain, see Music.setCombo: entry n at stage n, lists of STAGES + 1), elsewhere
// by energy (calm -> busy); `arp` is a list taken in turn (every 4 bars, or every bar with arpEach).
//   bars: { layer: [one entry per bar] } overrides a layer bar by bar (null: out); enter: { layer: first bar };
//   from: { layer: first stage } (lead, arp, stab, hook: the octave-up double of the lead);
//   perc: [[buffer, pattern, first stage]]; pulse: the calm's muted pulse; growl: the bass's distorted mid (0..1);
//   energy 0..1 opens filters; level compensates loudness; pad: pad level; duck = sidechain floor (1 = no pump);
//   fills (a fill on the last bar, a small one every 4th at fillRate), crash / impact / down (downlifter) on bar 0;
//   riser: bars of noise riser before the next section; breath: the last quarter of the last bar drops out;
//   bite: brighter bass and arp; sweep: the pad's filter opens over the section; hot: only while the fight is hot;
//   breathe: the pulse and the arp swell and sink over every two bars, the arp muted;
//   grit: how hard the whole mix is driven into its saturation (0..1, see GRIT), the heat of the fight adding to it.

const DROP = {
  prog: 'drop', energy: 1, level: 0.86, pad: 0.75, kick: 'drive', snare: 'back', clap: true, hats: ['eights', 'sixteen', 'drive'],
  bass: ['gallop', 'drive'], arp: ['up', 'cascade'], lead: 'drop', leadMin: 0.85, fills: true, crash: true, impact: true, duck: 0.25,
  stab: 'offbeat', growl: 0.4, perc: [['shaker', 'shake16', 0]], grit: 0.12,
};
// the fight: house, four on the floor, the open hat off the beat, a driven bass that pumps between the kicks, the
// clap: it kicks from its first bar. Each kill of a chain adds: 1 the arp and a rolling bass; 2 the stabs, rim and
// metal; 3 the lead's hook; 4 the 16th bass, the driving kick and hats, crashes and rolls every 4 bars; 5 the lead
// doubled an octave up, tribal toms, every filter open. And the mix gets dirtier with each (grit)
const FIGHT = {
  ...DROP, level: 0.85, pad: 0.6, leadMin: 0, fillRate: 1, duck: 0.3, stab: 'tresillo',
  kick: ['four', 'four', 'four', 'four', 'drive', 'drive'], hats: ['house16', 'house16', 'house16', 'house16', 'drive', 'drive'],
  bass: ['pump', 'roll', 'roll', 'roll', 'rush', 'rush'], growl: [0.55, 0.65, 0.75, 0.85, 1, 1], grit: [0.18, 0.28, 0.4, 0.52, 0.64, 0.75],
  bite: [1.3, 1.4, 1.5, 1.6, 1.8, 2.1],
  perc: [['shaker', 'shake16', 0], ['rim', 'rim', 2], ['clank', 'clank', 2], ['tom', 'tribal', 5]],
  from: { arp: 1, stab: 2, lead: 3, hook: 5 },
};
const CALM = { energy: 0.3, level: 0.35, pad: 1.1, padCut: 0.8, duck: 1, breathe: true, arpEach: true, arpDecay: 0.32 };
export const SECTIONS = {
  // nothing is happening: a dark pad, a muted pulse that swells and sinks every two bars, a slow arpeggio in B
  calmA: { ...CALM, prog: 'calmA', pulse: 'breathe' },
  calmB: { ...CALM, prog: 'calmB', pulse: 'lift', arp: ['breath', 'sigh'] },
  // someone is wondering: a heartbeat, the bass comes in, ticking hats and rim, a riser into each return
  tense: { prog: 'tense', energy: 0.42, level: 0.85, pad: 1, kick: 'heart', hats: ['tick'], enter: { hats: 2, perc: 4 },
    bass: ['halftime'], pulse: 'tick', perc: [['rim', 'tick', 0]], riser: 2, duck: 0.6 },
  tenseB: { prog: 'tenseB', energy: 0.46, level: 0.85, pad: 1, kick: 'heart', hats: ['off8'], bass: ['pulse8'], pulse: 'climb',
    arp: ['sparse'], perc: [['rim', 'tick', 0], ['shaker', 'shake8', 0]], riser: 2, duck: 0.55 },
  intro: { prog: 'intro', energy: 0.25, level: 0.9, pad: 1, sweep: true, kick: 'heart', enter: { kick: 4 }, bass: ['pedal'],
    arp: ['sparse', 'pulse8'], duck: 0.6 },
  ambient: { prog: 'verseA', energy: 0.35, level: 0.95, pad: 1, kick: 'heart', hats: ['off8'], bass: ['halftime'],
    arp: ['pulse8', 'broken'], duck: 0.55 },
  verseA: { prog: 'verseA', energy: 0.6, level: 1, pad: 0.8, kick: 'four', snare: 'back', hats: ['house', 'eights'],
    bass: ['pulse8', 'octave'], arp: ['sparse', 'broken'], fills: true, crash: true, duck: 0.35, perc: [['shaker', 'shake8', 0]] },
  verseB: { prog: 'verseB', energy: 0.68, level: 1, pad: 0.8, kick: 'broken', snare: 'ghost', hats: ['eights', 'sixteen'],
    bass: ['syncop', 'octave'], arp: ['broken', 'updown'], lead: 'answers', leadPass: 1, fills: true, duck: 0.35,
    perc: [['shaker', 'shake16', 0], ['rim', 'rim', 0]] },
  build: { prog: 'build', energy: 0.75, level: 0.95, pad: 0.9, sweep: true, hats: ['eights', 'sixteen'], bass: ['pulse8', 'drive'],
    arp: ['up', 'updown'], riser: 4, breath: true, duck: 0.35, perc: [['shaker', 'shake16', 0]],
    bars: { kick: ['four', 'four', 'four', 'four', 'four', 'four', 'build8', 'build8'],
      snare: ['back', 'back', 'back', 'ghost', 'roll8', 'roll8b', 'roll16', 'roll16'] } },
  dropA: DROP,
  dropA2: { ...DROP, impact: false, crash: false, leadMin: 0.4, arp: ['cascade', 'broken'], perc: [['shaker', 'shake16', 0], ['rim', 'rim', 0]] },
  break: { prog: 'break', energy: 0.4, level: 0.85, pad: 1.3, padCut: 1.4, hats: ['off8'], enter: { hats: 4 }, bass: ['pedal', 'halftime'],
    arp: ['pulse8', 'sparse'], riser: 2, down: true, crash: true, duck: 1,
    bars: { snare: [null, null, null, null, 'half', 'half', 'half', 'breakRoll'] } },
  dropB: { ...DROP, prog: 'dropB', lead: 'dropB', leadMin: 0.5 },
  dropB2: { ...DROP, prog: 'dropB', lead: 'dropB', leadMin: 0.4, impact: false, crash: false, arp: ['broken', 'cascade'] },
  // the fight: A on the drop's chords and its re-struck motif, B on its own hook, a breakdown, the double-time chase
  fightA: { ...FIGHT, arp: ['pedal', 'cascade'], lead: 'fight', leadVol: 1.25 },
  fightB: { ...FIGHT, prog: 'fightB', snare: 'push', stab: 'offbeat', arp: ['broken', 'up'], lead: 'hook', leadVol: 1.2,
    impact: false, perc: [['shaker', 'shake16', 0], ['rim', 'rim', 2], ['clank', 'clank', 2], ['tom', 'tribal2', 5]] },
  // half time over a held, growling bass and the crying lead, then a build on the rising bass into the next theme
  bridge: { ...FIGHT, prog: 'bridge', energy: 0.9, pad: 1.1, impact: false, down: true, lead: 'bridge', leadVol: 1.1, riser: 4,
    breath: true, fills: false, from: { arp: 1, stab: 2, lead: 0, hook: 5 },
    bars: {
      kick: ['half', 'half', 'half', 'half', 'four', 'four', 'build8', 'build8'],
      snare: [null, null, null, 'half', 'roll8', 'roll8b', 'roll16', 'roll16'],
      hats: ['off8', 'off8', 'off8', 'off8', 'house16', 'house16', 'drive', 'drive'],
      bass: ['held', 'held', 'held', 'held', 'pump', 'roll', 'rush', 'rush'],
      arp: [null, null, null, null, 'up', 'up', 'cascade', 'cascade'],
      stab: [null, null, null, null, 'offbeat', 'offbeat', 'eights', 'eights'],
    } },
  chase: { ...FIGHT, prog: 'chase', snare: 'skank', stab: 'eights', bass: ['roll', 'tresillo', 'tresillo', 'tresillo', 'rush', 'rush'],
    arp: ['up', 'pedal'], lead: 'chase', riser: 2, hot: true },
};
export const FORMS = {
  menu: ['intro', 'ambient'],
  calm: ['calmA', 'calmB'],
  tense: ['tense', 'tenseB'],
  game: ['verseA', 'verseB', 'build', 'dropA', 'dropA2', 'break', 'verseA', 'verseB', 'build', 'dropB', 'dropB2'],
  combat: ['fightA', 'fightB', 'bridge', 'chase'],
};
for (const [name, s] of Object.entries(SECTIONS)) if (!PROGRESSIONS[s.prog]) throw new Error('Music: no progression for ' + name);

// The saturation of the whole music mix (Music.js Session.setGrit), set per bar from the section's `grit` plus the
// heat of the fight (`heat`, at the hottest), never over `max`; it glides to its new value over `glide` s.
//   pre: the drive into the shaper at 0 and at 1 (a tanh: grit, never a hard clip); wet: share of the driven signal
//   at 1 (the dry mix keeps the rest: the kick and the transients stay whole); tone: Hz the driven signal is cut at,
//   at 0 and at 1 (the fizz taken off); shelf: [Hz, dB] the lows are lowered by before the shaper and given back
//   after it (the bass and the kick are driven less: no mud); ref: the amplitude the level is matched at (a typical
//   peak of the mix there)
export const GRIT = { heat: 0.2, max: 0.9, glide: 0.5, pre: [1, 9], wet: 0.6, tone: [7000, 3800], shelf: [150, 6], ref: 0.35 };
export const GRIT_RANGE = 8; // the shaper's curve spans +-GRIT_RANGE: the drive comes from the gain before it
export const gritCurve = (x) => Math.tanh(x); // the shaper's transfer (input already multiplied by the drive)

// the settings of the saturation for grit g (0..1): { pre (drive), wet, dry, makeup (of the wet, so that its level
// matches the dry at GRIT.ref), tone (Hz) }
export function gritDrive(g, G = GRIT) {
  g = Math.max(0, Math.min(G.max, g || 0));
  const pre = G.pre[0] + (G.pre[1] - G.pre[0]) * g ** 1.3, wet = G.wet * Math.min(1, g / 0.5) ** 0.7;
  const rms = (f) => { let s = 0; for (let i = 0; i < 64; i++) { const v = f(G.ref * Math.sin((2 * Math.PI * (i + 0.5)) / 64)); s += v * v; } return Math.sqrt(s / 64); };
  const makeup = rms((x) => x) / rms((x) => gritCurve(pre * x));
  return { pre, wet, dry: 1 - wet, makeup, tone: G.tone[0] + (G.tone[1] - G.tone[0]) * g };
}

// the jukebox's band (an old slow rock): bass (R root, F fifth, O octave), two tune lines taken in turn (digits:
// chord tones upward), drums
export const JUKE = {
  bass: 'R.....F.R...F.O.', tunes: ['3...2.3.4...2...', '4.3.2...3.4.5...', '2...3.4.3...1...', '5...4.3.2.3.4...'],
  drums: [['kick', '9.......7.9.....'], ['snare', '....8.......8...'], ['hat', '5.3.5.3.5.3.5.3.']],
};
