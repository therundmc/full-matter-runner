// Procedural darksynth soundtrack (original composition), F minor with excursions to C minor and Bb minor.
// Data first (chords, progressions, patterns, sections, song form); a seeded bar planner turns it into note
// events (every return of a section varies), then a lookahead scheduler plays each bar on long-lived synth
// voices (mono bass/arp/lead, 5-voice pad: no nodes per note) and on drum one-shots synthesized once into
// AudioBuffers. Public API: start(), stop(), setIntensity(0..1), setCombat(on). The intensity picks the form on
// a bar line: beatless calm (pad and a few notes), tense (a heartbeat), then the song and its beat (BEAT); the
// combat variant (FORMS.combat: same key, tempo and motif, angrier) takes over while the game fights.
// The constructor takes an optional (context, destination) so the song can be rendered offline for analysis.
import Audio from './Audio.js';

const BPM = 108;
const BAR = 240 / BPM;
const STEP = BAR / 16;
const LOOKAHEAD = 0.3;   // s: a bar is scheduled once its downbeat is this close
const SWING = 0.1;       // hats: odd 16ths are late by this fraction of a 16th
const GATE_HOLD = 0.22;  // s: gated reverb stays open this long after a snare/clap
const MIN_FIGHT_BARS = 2; // the combat variant plays at least this long before it may wind down
const TENSE = 0.45;       // intensity from which the calm gets a heartbeat
const BEAT = 0.7;         // ... and from which the song proper, with its beat, plays
const HOT = 0.9;          // ... and under which a fight stays on its first section (no double-time chase)

// ---------------------------------------------------------------- harmony
const PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const QUALITY = {
  'm(add9)': [0, 3, 7, 14], m9: [0, 3, 7, 10, 14], m6: [0, 3, 7, 9], maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14],
  'maj7#11': [0, 4, 7, 11, 18], 6: [0, 4, 7, 9], '7sus4': [0, 5, 7, 10], '7b9': [0, 4, 7, 10, 13], dim7: [0, 3, 6, 9],
};

// one chord per bar, [a, b] = two chords (half bar each); '/X' = bass note
const PROGRESSIONS = {
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
  // the fight's chase: phrygian bII over an F pedal, then iv - bII and the dominant with its leading-tone dim7
  chase: ['Fm(add9)', 'Gbmaj7/F', 'Fm(add9)', ['Dbmaj7', 'C7b9'], 'Bbm9', 'Gbmaj7#11', 'C7sus4', ['C7b9', 'Edim7']],
};

const CHORDS = new Map();
function chord(sym) {
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

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const bassMidi = (pc) => 28 + ((pc + 8) % 12); // E1..Eb2: sub stays under ~80 Hz

// nearest chord tone at or above `target` (fifths/sevenths of slash chords stay in the chord)
function chordTone(c, target) {
  for (let n = target; ; n++) if (c.pcs.includes(n % 12)) return n;
}

// 5-note pad voicing that covers every pitch class with the smallest motion from the previous voicing
const VOICINGS = new Map();
function voiceLead(c, prev) {
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
function arpPool(c, base) {
  const out = [];
  for (let n = base; out.length < 6; n++) if (c.pcs.includes(n % 12)) out.push(n);
  return out;
}

// ---------------------------------------------------------------- patterns (16 steps)
// drums: digit = velocity /9, 'o' open hat, H/M/L toms
const KICK = {
  heart: '9.........7.....', four: '9...9...9...9...', broken: '9.....7.9.....7.', drive: '9...9...9...9..6',
  build8: '8.8.8.8.9.9.9.9.', gallop: '9..69..69..69.6.',
};
const SNARE = {
  back: '....9.......9...', ghost: '....9..2....9.2.', half: '........9.......',
  roll8: '5.5.5.5.6.6.6.6.', roll8b: '6.6.6.6.7.7.7.7.', roll16: '6666777788889999', breakRoll: '........55667789',
  skank: '..6.9.6...6.9.6.', // offbeat pushes around the backbeat: reads as double time
};
const HATS = { off8: '..5...5...5...5.', eights: '6.3.6.3.6.3.6.3.', sixteen: '6243624362436245', drive: '73o373o373o373o3' };
const FILLS = {
  small: { snare: '.............4.6' }, flam: { snare: '............6.79' }, roll: { snare: '........45667789' },
  toms: { tom: '........H.HMM.LL' }, toms2: { tom: '............HMLL', snare: '........7.......' },
};
// bass: R root (accent) r root (ghost) O octave F fifth 7 seventh A chromatic approach to the next bar, '-' tie
const BASS = {
  pedal: 'R---------------', halftime: 'R-----r.R---F-r.', pulse8: 'R.r.R.r.R.r.R.rA', octave: 'R.O.r.O.R.O.rOrA',
  syncop: 'R..rR.r.R..rO.rA', gallop: 'R.rrR.rrR.rrR.rO', drive: 'RrrORrrrRrrORrr7',
  rush: 'RrOrRrOrRrOrRO7A', tresillo: 'RrrOrrOrRrrOrrOA', // fight: 16ths with rolling / 3-3-2 octave accents
};
// arp: index into the 6-note pool
const ARP = {
  lone: '0.........2.....', far: '....1.......3...', sparse: '0...2...1...3...', pulse8: '0.2.1.3.0.2.4.3.', broken: '0213243102132435', updown: '0123454321012345',
  up: '0123450123452345', cascade: '5432105432104321', pedal: '0102030401020305',
};
// pad stabs (fight): the sustained chord is chopped open on these steps
const STABS = { tresillo: '9..9..9.9..9..9.', eights: '9.6.9.6.9.6.9.6.' };
// lead phrases: per bar, [step, midi, length in 16ths]; null = rest
const LEADS = {
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
// chase: the head of the motif (C Eb F, then G Ab) as a 16th ostinato that follows the chords, a dim7 run to end
LEADS.chase = [
  [[0, 72, 1], [1, 75, 1], [2, 77, 2], [4, 72, 1], [5, 75, 1], [6, 77, 2], [8, 79, 1], [9, 80, 1], [10, 84, 3], [14, 80, 2]],
  [[0, 73, 1], [1, 77, 1], [2, 78, 2], [4, 73, 1], [5, 77, 1], [6, 78, 2], [8, 82, 1], [9, 80, 1], [10, 78, 3], [14, 77, 2]],
  [[0, 72, 1], [1, 75, 1], [2, 77, 2], [4, 72, 1], [5, 75, 1], [6, 77, 2], [8, 84, 2], [10, 80, 2], [12, 79, 2], [14, 77, 2]],
  [[0, 80, 3], [3, 77, 3], [6, 73, 2], [8, 76, 3], [11, 79, 3], [14, 82, 2]],
  [[0, 77, 1], [1, 73, 1], [2, 77, 2], [4, 77, 1], [5, 73, 1], [6, 77, 2], [8, 80, 1], [9, 82, 1], [10, 85, 3], [14, 82, 2]],
  [[0, 78, 1], [1, 73, 1], [2, 78, 2], [4, 78, 1], [5, 73, 1], [6, 78, 2], [8, 82, 1], [9, 84, 1], [10, 85, 3], [14, 84, 2]],
  [[0, 79, 3], [3, 77, 3], [6, 79, 2], [8, 82, 3], [11, 79, 3], [14, 77, 2]],
  [[0, 76, 2], [2, 79, 2], [4, 82, 2], [6, 85, 2], [8, 88, 2], [10, 85, 2], [12, 82, 2], [14, 79, 2]],
];

const parseHits = (pat) => [...pat].flatMap((ch, s) => (ch === '.' ? [] : [{ s, ch, v: ch >= '1' && ch <= '9' ? ch / 9 : 0.75 }]));
const HITS = new Map();
const hits = (pat) => { if (!pat) return []; let h = HITS.get(pat); if (!h) HITS.set(pat, h = parseHits(pat)); return h; };

// ---------------------------------------------------------------- arrangement
// energy 0..1 picks layers in the lists (calm -> busy) and opens filters; `enter` delays a layer to a bar;
// kickBars/snareBars override per bar; level compensates loudness; duck = sidechain floor (1 = no pump);
// fillRate = chance of a small fill every 4th bar; bite opens the bass and arp filters further; stab chops the
// pad on a STABS pattern; leadVol scales the lead
const DROP = {
  prog: 'drop', energy: 1, level: 0.86, pad: 0.75, kick: 'drive', snare: 'back', clap: true, hats: ['eights', 'sixteen', 'drive'],
  bass: ['gallop', 'drive'], arp: ['up', 'cascade'], lead: 'drop', leadMin: 0.85, fills: true, crash: true, impact: true, duck: 0.25,
};
// the fight is the drop getting angry: galloping kick, 16th octave bass, chopped pad, a fill every 4 bars and the
// motif re-struck; the chase answers it in double time
const FIGHT = { ...DROP, pad: 1.3, hats: ['drive'], leadMin: 0, fillRate: 1, bite: 1.5, duck: 0.45 };
const SECTIONS = {
  // nothing is happening: no drums, a held chord, a low drone, two plucked notes a bar and an answer now and then
  calm: { prog: 'verseA', energy: 0.3, level: 0.9, pad: 1, bass: ['pedal'], arp: ['lone', 'far'], lead: 'answers',
    leadVol: 0.5, duck: 1 },
  // someone is wondering: a heartbeat and off-beat hats under the same chords
  tense: { prog: 'verseA', energy: 0.4, level: 0.95, pad: 1, kick: 'heart', hats: ['off8'], enter: { hats: 2 },
    bass: ['halftime'], arp: ['sparse', 'pulse8'], duck: 0.6 },
  intro: { prog: 'intro', energy: 0.25, level: 0.9, pad: 1, sweep: true, kick: 'heart', enter: { kick: 4 }, bass: ['pedal'],
    arp: ['sparse', 'pulse8'], duck: 0.6 },
  ambient: { prog: 'verseA', energy: 0.35, level: 0.95, pad: 1, kick: 'heart', hats: ['off8'], bass: ['halftime'],
    arp: ['pulse8', 'broken'], duck: 0.55 },
  verseA: { prog: 'verseA', energy: 0.6, level: 1, pad: 0.8, kick: 'four', snare: 'back', hats: ['off8', 'eights'],
    bass: ['pulse8', 'octave'], arp: ['sparse', 'broken'], fills: true, crash: true, duck: 0.35 },
  verseB: { prog: 'verseB', energy: 0.68, level: 1, pad: 0.8, kick: 'broken', snare: 'ghost', hats: ['eights', 'sixteen'],
    bass: ['syncop', 'octave'], arp: ['broken', 'updown'], lead: 'answers', leadPass: 1, fills: true, duck: 0.35 },
  build: { prog: 'build', energy: 0.75, level: 0.95, pad: 0.9, sweep: true, hats: ['eights', 'sixteen'], bass: ['pulse8', 'drive'],
    arp: ['up', 'updown'], kickBars: ['four', 'four', 'four', 'four', 'four', 'four', 'build8', 'build8'],
    snareBars: ['back', 'back', 'back', 'ghost', 'roll8', 'roll8b', 'roll16', 'roll16'], riser: 4, breath: true, duck: 0.35 },
  dropA: DROP,
  dropA2: { ...DROP, impact: false, crash: false, leadMin: 0.4, arp: ['cascade', 'broken'] },
  break: { prog: 'break', energy: 0.4, level: 0.85, pad: 1.3, padCut: 1.4, hats: ['off8'], enter: { hats: 4 }, bass: ['pedal', 'halftime'],
    arp: ['pulse8', 'sparse'], snareBars: [null, null, null, null, 'half', 'half', 'half', 'breakRoll'], riser: 2, down: true,
    crash: true, duck: 1 },
  dropB: { ...DROP, prog: 'dropB', lead: 'dropB', leadMin: 0.5 },
  dropB2: { ...DROP, prog: 'dropB', lead: 'dropB', leadMin: 0.4, impact: false, crash: false, arp: ['broken', 'cascade'] },
  fight: { ...FIGHT, kick: 'gallop', snare: 'ghost', stab: 'tresillo', bass: ['rush', 'tresillo'], arp: ['pedal', 'cascade'],
    lead: 'fight', leadVol: 1.25 },
  chase: { ...FIGHT, prog: 'chase', snare: 'skank', stab: 'eights', bass: ['tresillo', 'rush'], arp: ['up', 'pedal'],
    lead: 'chase', impact: false, riser: 2 },
};
const FORMS = {
  menu: ['intro', 'ambient'],
  calm: ['calm'],
  tense: ['tense'],
  game: ['verseA', 'verseB', 'build', 'dropA', 'dropA2', 'break', 'verseA', 'verseB', 'build', 'dropB', 'dropB2'],
  combat: ['fight', 'chase'],
};
const SECTION_BARS = 8;
const AFTERMATH = FORMS.game.indexOf('break'); // where the song resumes once a fight is over

// ---------------------------------------------------------------- mix levels
const MIX = {
  bus: 0.7, out: 0.9, kick: 0.27, snare: 0.18, clap: 0.1, hat: 0.055, ohat: 0.035, tom: 0.12, crash: 0.05, impact: 0.16, riser: 0.02,
  bass: 0.3, bassOut: 0.3, sub: 0.1, pad: 0.12, arp: 0.11, lead: 0.075,
  gateSend: 0.7, gateRet: 0.9, verbRet: 0.5, delayRet: 0.32, delayFb: 0.38,
};

// ---------------------------------------------------------------- small helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

function curve(fn, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}
const TAPE = curve((x) => Math.tanh(1.6 * x) / Math.tanh(1.6));
const DRIVE = curve((x) => Math.tanh(3 * x) / Math.tanh(3)); // bass: fattens and flattens the attack spikes
// bus safety clip: linear below 0.45, soft knee up to a 0.68 ceiling (-3.3 dBFS)
const CLIP = curve((x) => Math.sign(x) * (Math.abs(x) < 0.45 ? Math.abs(x) : 0.45 + 0.23 * Math.tanh((Math.abs(x) - 0.45) / 0.23)));

// ---------------------------------------------------------------- one-shot samples (built once per context)
function makeBuffers(ctx) {
  const sr = ctx.sampleRate, r = rng(1234);
  const noise = () => r() * 2 - 1;
  const lpK = (f) => 1 - Math.exp((-2 * Math.PI * f) / sr);
  const mono = (secs, fn) => {
    const b = ctx.createBuffer(1, Math.ceil(secs * sr), sr), d = b.getChannelData(0);
    fn(d);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < d.length; i++) d[i] /= peak;
    return b;
  };
  // 808-style metallic square cluster, highpassed and softened
  const metal = (d, decay, ratio) => {
    const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * ratio);
    let lp1 = 0, lp2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let x = 0;
      for (const f of fr) x += (f * t) % 1 < 0.5 ? 1 : -1;
      x = x / 6 + noise() * 0.5;
      lp1 += lpK(6500) * (x - lp1);
      const hp = x - lp1;
      lp2 += lpK(10000) * (hp - lp2);
      d[i] = lp2 * Math.exp(-t / decay) * Math.min(1, t / 0.0015);
    }
  };
  const B = {};
  B.kick = mono(0.5, (d) => {
    let ph = 0, lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * (48 + 116 * Math.exp(-t / 0.03) + 70 * Math.exp(-t / 0.005))) / sr;
      lp += lpK(4000) * (noise() - lp);
      const body = Math.sin(ph) * Math.exp(-Math.max(0, t - 0.015) / 0.2);
      d[i] = Math.tanh(1.8 * (body + lp * Math.exp(-t / 0.003) * 1.2));
    }
  });
  B.snare = mono(0.4, (d) => {
    let lpA = 0, lpB = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, x = noise();
      lpA += lpK(900) * (x - lpA);
      lpB += lpK(7000) * ((x - lpA) - lpB);
      const body = Math.sin(2 * Math.PI * (180 * t + 3 * Math.exp(-t / 0.02))) * Math.exp(-t / 0.07) * 0.9
        + Math.sin(2 * Math.PI * 290 * t) * Math.exp(-t / 0.04) * 0.4;
      d[i] = Math.tanh(1.5 * (lpB * Math.exp(-t / 0.11) * 1.1 + body));
    }
  });
  B.clap = mono(0.35, (d) => {
    let low = 0, band = 0;
    const f = 2 * Math.sin((Math.PI * 1300) / sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let env = Math.exp(-Math.max(0, t - 0.03) / 0.09) * (t >= 0.03 ? 1 : 0);
      for (const o of [0, 0.009, 0.019]) if (t >= o && t < 0.03) env = Math.max(env, Math.exp(-(t - o) / 0.005));
      low += f * band; band += f * (noise() - low - 0.5 * band);
      d[i] = band * env;
    }
  });
  B.hat = mono(0.12, (d) => metal(d, 0.022, 1.6));
  B.ohat = mono(0.7, (d) => metal(d, 0.2, 1.6));
  B.crash = mono(2.6, (d) => metal(d, 0.85, 2.3));
  B.tom = mono(0.7, (d) => {
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * 92 * (1 + 0.6 * Math.exp(-t / 0.05))) / sr;
      d[i] = Math.tanh(1.4 * (Math.sin(ph) * Math.exp(-t / 0.28) + noise() * Math.exp(-t / 0.008) * 0.3));
    }
  });
  B.noise = mono(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = noise(); });
  // stereo reverb impulses: a dark hall and a dense plate for the gated snare
  const ir = (secs, decay, damp) => {
    const b = ctx.createBuffer(2, Math.ceil(secs * sr), sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = Math.floor(0.012 * sr); i < d.length; i++) {
        const t = i / sr;
        lp += lpK(damp * Math.exp(-t * 1.5) + 300) * (noise() - lp);
        d[i] = lp * Math.exp(-t / decay);
      }
    }
    return b;
  };
  B.hall = ir(2.6, 0.45, 7000);
  B.plate = ir(1, 0.5, 9000);
  return B;
}

// ---------------------------------------------------------------- audio graph + voices for one playing session
class Session {
  constructor(ctx, buf, dest) {
    this.ctx = ctx;
    this.buf = buf;
    this.oscs = [];
    this.live = 0;      // one-shot sources currently scheduled or playing
    this.leadEnd = -1;
    const gain = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const filt = (type, f, Q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = Q; return n; };
    const shaper = (c) => { const n = ctx.createWaveShaper(); n.curve = c; return n; };
    const osc = (type, detune = 0, f = 110) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = detune; o.start();
      this.oscs.push(o);
      return o;
    };
    const chain = (...n) => { for (let i = 1; i < n.length; i++) n[i - 1].connect(n[i]); return n[n.length - 1]; };
    this.gainNode = gain;

    // buses: drums (dry) + duck (sidechained synths) -> mix -> safety clip -> out
    this.out = gain(MIX.out);
    this.out.connect(dest);
    this.mix = gain(MIX.bus);
    chain(this.mix, filt('highpass', 28), shaper(CLIP), this.out);
    this.drums = gain(1); this.drums.connect(this.mix);
    this.duck = gain(1); this.duck.connect(this.mix);

    // dark hall (pads, lead, crash): returns into the ducked bus so the tail pumps too
    this.verb = gain(1);
    const hall = ctx.createConvolver(); hall.buffer = buf.hall;
    chain(this.verb, filt('highpass', 260), hall, filt('lowpass', 4500), gain(MIX.verbRet), this.duck);
    // gated reverb: dense plate whose return is opened by each snare and slammed shut GATE_HOLD later
    this.gateIn = gain(MIX.gateSend);
    const plate = ctx.createConvolver(); plate.buffer = buf.plate;
    this.gate = gain(0);
    chain(this.gateIn, filt('highpass', 200), plate, filt('lowpass', 6500), this.gate, gain(MIX.gateRet), this.drums);
    // dotted-eighth ping-pong delay
    this.delay = gain(1);
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2), fb = gain(MIX.delayFb), merge = ctx.createChannelMerger(2);
    dl.delayTime.value = dr.delayTime.value = STEP * 3;
    chain(this.delay, filt('highpass', 350), filt('lowpass', 2600), dl, dr, fb, dl);
    dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
    chain(merge, gain(MIX.delayRet), this.duck);

    // bass: two detuned saws -> resonant lowpass -> VCA -> drive; mono sine sub on its own VCA
    this.bassF = filt('lowpass', 200, 4);
    this.bassV = gain(0);
    this.bassO = [osc('sawtooth', -9), osc('sawtooth', 9)];
    for (const o of this.bassO) o.connect(this.bassF);
    chain(this.bassF, this.bassV, shaper(DRIVE), filt('highpass', 32), gain(MIX.bassOut), this.duck);
    this.subO = osc('sine');
    this.subV = gain(0);
    chain(this.subO, this.subV, this.duck);

    // pad: 5 voices x 2 detuned saws -> slow-LFO lowpass -> highpass -> tape -> VCA -> chorus + hall
    this.padF = filt('lowpass', 800, 0.9);
    this.padO = [];
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const o = osc('sawtooth', s * (5 + i * 2.5)); o.connect(this.padF); this.padO.push(o); }
    this.padLfo = gain(0);
    chain(osc('sine', 0, 0.07), this.padLfo, this.padF.frequency);
    this.padV = gain(0);
    chain(this.padF, filt('highpass', 190), shaper(TAPE), this.padV);
    const cl = ctx.createDelay(0.05), cr = ctx.createDelay(0.05), cm = ctx.createChannelMerger(2), clfo = osc('sine', 0, 0.33);
    cl.delayTime.value = 0.011; cr.delayTime.value = 0.017;
    chain(clfo, gain(0.0025), cl.delayTime); chain(clfo, gain(-0.0025), cr.delayTime);
    this.padV.connect(cl); this.padV.connect(cr);
    cl.connect(cm, 0, 0); cr.connect(cm, 0, 1);
    chain(cm, gain(0.7), this.duck);
    chain(this.padV, gain(0.55), this.duck);
    chain(this.padV, gain(0.6), this.verb);

    // arp pluck: saw + square -> enveloped resonant lowpass -> VCA -> highpass -> dry + ping-pong
    this.arpF = filt('lowpass', 1500, 3);
    this.arpV = gain(0);
    this.arpO = [osc('sawtooth', -4), osc('square', 4)];
    for (const o of this.arpO) o.connect(this.arpF);
    const arpOut = chain(this.arpF, this.arpV, filt('highpass', 300));
    arpOut.connect(this.duck);
    chain(arpOut, gain(0.6), this.delay);

    // lead: 2 saws + sub-octave triangle, delayed vibrato, portamento on legato notes
    this.leadF = filt('lowpass', 2400, 1.2);
    this.leadV = gain(0);
    this.leadO = [osc('sawtooth', -6), osc('sawtooth', 6), osc('triangle')];
    for (const o of this.leadO) o.connect(this.leadF);
    this.vib = gain(0);
    osc('sine', 0, 5.2).connect(this.vib);
    for (const o of this.leadO) this.vib.connect(o.detune);
    const leadOut = chain(this.leadF, this.leadV, filt('highpass', 220));
    leadOut.connect(this.duck);
    chain(leadOut, gain(0.4), this.verb);
    chain(leadOut, gain(0.3), this.delay);
  }

  // ---- synth voices (automation only, no new nodes)
  bass(t, m, dur, v, cutBase, cutPeak) {
    const f = mtof(m);
    for (const o of this.bassO) o.frequency.setValueAtTime(f, t);
    this.subO.frequency.setValueAtTime(mtof(m > 40 ? m - 12 : m), t);
    env(this.bassV.gain, t, dur, MIX.bass * v, 0.002, 0.012);
    env(this.subV.gain, t, dur, MIX.sub * v, 0.003, 0.015);
    const q = this.bassF.frequency;
    q.setTargetAtTime(cutPeak * v, t, 0.002);
    q.setTargetAtTime(cutBase, t + 0.01, 0.045);
  }

  chord(t, voicing) {
    voicing.forEach((m, i) => {
      for (const o of [this.padO[2 * i], this.padO[2 * i + 1]]) o.frequency.setTargetAtTime(mtof(m), t, 0.03);
    });
  }

  padLevel(t, level, cut) {
    this.padV.gain.setTargetAtTime(MIX.pad * level, t, 0.4);
    this.padF.frequency.setTargetAtTime(cut, t, 0.8);
    this.padLfo.gain.setTargetAtTime(cut * 0.4, t, 0.8);
  }

  // chopped pad: opens on the stab and falls back to a murmur one 16th later
  padStab(t, level) {
    const g = this.padV.gain;
    g.setTargetAtTime(MIX.pad * level, t, 0.004);
    g.setTargetAtTime(MIX.pad * level * 0.12, t + STEP, 0.03);
  }

  arp(t, m, v, decay, cut) {
    const f = mtof(m);
    for (const o of this.arpO) o.frequency.setValueAtTime(f, t);
    const g = this.arpV.gain;
    g.setTargetAtTime(MIX.arp * v, t, 0.002);
    g.setTargetAtTime(0, t + 0.012, decay);
    const q = this.arpF.frequency;
    q.setTargetAtTime(cut, t, 0.002);
    q.setTargetAtTime(cut * 0.25, t + 0.01, decay * 0.8);
  }

  lead(t, m, dur, v = 1) {
    const f = mtof(m), glide = Math.abs(t - this.leadEnd) < 0.02;
    this.leadO.forEach((o, i) => {
      const fi = i === 2 ? f / 2 : f;
      if (glide) o.frequency.setTargetAtTime(fi, t, 0.035); else o.frequency.setValueAtTime(fi, t);
    });
    env(this.leadV.gain, t, dur * 0.92, MIX.lead * v, 0.012, 0.06);
    this.vib.gain.setTargetAtTime(0, t, 0.01);
    if (dur > 0.4) this.vib.gain.setTargetAtTime(14, t + 0.25, 0.15);
    this.leadEnd = t + dur;
  }

  // ---- one-shots (a buffer source + a gain each)
  hit(name, t, v, { rate = 1, gate = false, verb = false } = {}) {
    const src = this.ctx.createBufferSource(), g = this.gainNode(v);
    src.buffer = this.buf[name];
    src.playbackRate.value = rate;
    src.connect(g);
    g.connect(this.drums);
    if (gate) g.connect(this.gateIn);
    if (verb) g.connect(this.verb);
    this.live++;
    src.onended = () => { g.disconnect(); this.live--; };
    src.start(t);
  }

  // filtered noise sweep: riser (f0 < f1) or downlifter
  sweep(t, dur, f0, f1) {
    const ctx = this.ctx, up = f1 > f0;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.buf.noise; src.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(up ? 0.0001 : MIX.riser, t);
    g.gain.exponentialRampToValueAtTime(up ? MIX.riser : 0.0001, t + dur * (up ? 0.97 : 1));
    if (up) g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.drums); g.connect(this.verb);
    this.live++;
    src.onended = () => { g.disconnect(); this.live--; };
    src.start(t, 0); src.stop(t + dur + 0.02);
  }

  pump(t, floor) {
    const g = this.duck.gain;
    g.setTargetAtTime(floor, t, 0.003);
    g.setTargetAtTime(1, t + 0.04, 0.075);
  }

  gateOpen(t0, t1) {
    this.gate.gain.setTargetAtTime(1, t0, 0.001);
    this.gate.gain.setTargetAtTime(0, t1, 0.006);
  }

  setLevel(t, v) { this.mix.gain.setTargetAtTime(v * MIX.bus, t, 0.3); }

  fadeOut() { this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); }

  dispose() {
    for (const o of this.oscs) o.stop();
    this.out.disconnect();
  }
}

function env(p, t, dur, peak, a, r) {
  p.setTargetAtTime(peak, t, a);
  p.setTargetAtTime(0, t + dur, r);
}

// ---------------------------------------------------------------- conductor
class Music {
  // ctx/dest default to the game's Audio context and its music bus (resolved on start)
  constructor(ctx = null, dest = null) {
    this.ctx = ctx;
    this.dest = dest;
    this.playing = false;
    this.target = 0;    // requested intensity
    this.level = 0;     // smoothed intensity, moves once per bar
    this.combat = false; // the game is fighting: the combat variant plays (see _tick)
    this.passes = {};   // times each section has played: drives the variations
    this.form = null;
    this.voicing = null;
    this.S = null;
    this.onBar = null;  // debug hook (plan, time)
  }

  get liveVoices() { return this.S ? this.S.live : 0; } // debug: one-shots in flight

  start() {
    const ctx = this.ctx || Audio.ctx;
    if (!ctx || this.playing) return;
    this._open(ctx);
    this.timer = setInterval(() => this._tick(ctx.currentTime + LOOKAHEAD), 100);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const S = this.S;
    S.fadeOut();
    setTimeout(() => S.dispose(), 600);
    this.S = null;
  }

  // 0 = menu (intro/ambient loop); > 0 = the game: calm, tense, then (BEAT) the song, thickening with the value
  setIntensity(v) { this.target = clamp(v, 0, 1); }

  // true while the game fights: the song (not the menu) hands over to its combat variant, and back afterwards
  setCombat(on) { this.combat = !!on; }

  _open(ctx) {
    if (this.bufCtx !== ctx) { this.buf = makeBuffers(ctx); this.bufCtx = ctx; }
    this.S = new Session(ctx, this.buf, this.dest || Audio.music);
    this.playing = true;
    this.form = null;
    this.level = this.target;
    this.nextBar = ctx.currentTime + 0.1;
    this.cued = false;   // the fight cue played: the variant is due on the next bar line
    this.out = false;    // the bar being planned is the last of a fight
    this.fightBars = 0;  // bars of the combat variant played in a row
  }

  _tick(until) {
    const now = this.S.ctx.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.05; // timer was throttled (background tab): resync, don't burst
    // a fight breaks out: announce it over the bars already scheduled, the variant takes over on the next bar line
    if (this.combat && this.target > 0 && this.form && this.form !== FORMS.menu && this.form !== FORMS.combat && !this.cued) {
      this.cued = true;
      this._cue(now);
    }
    while (this.nextBar < until) {
      const fight = this.form === FORMS.combat;
      let want = this.target <= 0 ? FORMS.menu
        : this.combat || this.cued || (fight && this.fightBars < MIN_FIGHT_BARS) ? FORMS.combat
          : this.target >= BEAT ? FORMS.game : this.target >= TENSE ? FORMS.tense : FORMS.calm;
      // the fight is over: one more bar of it, ending on a fill, then the song resumes at its break
      this.out = fight && want !== FORMS.combat && want !== FORMS.menu && !this.out;
      if (this.out) want = FORMS.combat;
      if (this.form !== want) {
        this.pos = fight && want === FORMS.game ? AFTERMATH : 0;
        this.form = want; this.bar = 0; this.fightBars = 0;
      }
      this.cued = false;
      this.level += (this.target - this.level) * 0.5;
      const p = this._plan();
      this._play(this.nextBar, p);
      if (this.onBar) this.onBar(p, this.nextBar);
      if (++this.bar >= SECTION_BARS) {
        this.passes[p.name] = p.pass + 1;
        this.bar = 0;
        this.pos = this._after();
      }
      this.fightBars++;
      this.nextBar += BAR;
    }
  }

  // index of the section after the current one: a fight only breaks into its double-time chase while it is hot
  _after() {
    const n = (this.pos + 1) % this.form.length;
    return this.form === FORMS.combat && this.form[n] === 'chase' && this.level < HOT ? this.pos : n;
  }

  // fight cue, laid over what is left of the bars already scheduled: a riser and a snare roll into the downbeat
  _cue(now) {
    const t0 = now + 0.03, t1 = this.nextBar, n = Math.min(8, Math.floor((t1 - t0) / STEP));
    if (n < 1) return;
    this.S.sweep(t0, t1 - t0, 400, 7000);
    for (let k = n; k >= 1; k--) this.S.hit('snare', t1 - k * STEP, MIX.snare * (1 - k / 10));
  }

  _chordsAt(name, b) {
    const e = PROGRESSIONS[SECTIONS[name].prog][b];
    return Array.isArray(e) ? [{ s: 0, ch: chord(e[0]) }, { s: 8, ch: chord(e[1]) }] : [{ s: 0, ch: chord(e) }];
  }

  // pure description of the current bar: chords, notes and hits (step-based), fx, mix targets
  _plan() {
    const name = this.form[this.pos], sec = SECTIONS[name], b = this.bar, pass = this.passes[name] || 0;
    const r = rng(hashStr(name) ^ Math.imul(pass + 1, 7919) ^ Math.imul(b + 1, 104729));
    const game = this.form === FORMS.game;
    const e = sec.energy * (game ? 0.55 + 0.45 * this.level : 1);
    const last = this.out || b === SECTION_BARS - 1; // last bar before another section
    const after = this.out ? FORMS.game[AFTERMATH] : this.form[this._after()];
    const on = (layer) => b >= (sec.enter?.[layer] ?? 0);
    const pick = (list, bias = 0) => (list?.length ? list[clamp(Math.floor(e * list.length) + bias, 0, list.length - 1)] : null);
    const vary = (pass + (b >> 2)) % 2; // alternates every 4 bars and every pass

    const chords = this._chordsAt(name, b);
    for (const c of chords) c.voicing = this.voicing = voiceLead(c.ch, this.voicing);
    const chordAt = (s) => (s >= 8 ? chords[chords.length - 1] : chords[0]).ch;
    const next = this._chordsAt(last ? after : name, last ? 0 : b + 1)[0].ch;

    // ---- drums
    const kick = on('kick') ? hits(KICK[sec.kickBars ? sec.kickBars[b] : sec.kick]) : [];
    let snare = on('snare') ? hits(SNARE[sec.snareBars ? sec.snareBars[b] : sec.snare]) : [];
    let hat = on('hats') ? hits(HATS[pick(sec.hats, b < 2 ? -1 : 0)]) : [];
    let tom = [];
    let fill = null;
    if (sec.fills && last) fill = FILLS[['roll', 'toms', 'toms2', 'flam'][Math.floor(r() * 4)]];
    else if (sec.fills && b % 4 === 3 && r() < (sec.fillRate ?? 0.6)) fill = FILLS[r() < 0.5 ? 'small' : 'flam'];
    if (fill) {
      const from = Math.min(...[fill.snare, fill.tom].filter(Boolean).map((p) => p.search(/[^.]/)));
      snare = snare.filter((h) => h.s < from).concat(hits(fill.snare));
      hat = hat.filter((h) => h.s < from);
      tom = hits(fill.tom);
    }
    const clap = sec.clap ? snare.filter((h) => h.v > 0.8) : [];

    // ---- bass
    const bass = [];
    const bpat = BASS[pick(sec.bass, -vary)];
    for (let s = 0; s < 16; s++) {
      const tok = bpat[s];
      if (tok === '.' || tok === '-') continue;
      let len = 1;
      while (bpat[s + len] === '-') len++;
      const c = chordAt(s), root = bassMidi(c.bass);
      let m = root;
      if (tok === 'O') m = root + 12;
      else if (tok === 'F') m = chordTone(c, root + 7);
      else if (tok === '7') m = chordTone(c, root + 9);
      else if (tok === 'A') {
        const nb = bassMidi(next.bass);
        m = nb === root ? root : nb > root ? nb - 1 : nb + 1;
      }
      const v = (tok === 'R' ? 1 : tok === 'r' ? 0.72 : 0.85) * (len >= 4 ? 0.6 : 1); // drones sit lower than pulses
      bass.push({ s, m, len, gate: len > 1 ? len * 0.92 : 0.55, v });
    }

    // ---- arp: pattern and inversion rotate every 4 bars / pass, octave answer at phrase ends
    const arp = [];
    if (sec.arp && e >= 0.2) {
      const apat = ARP[sec.arp[(pass + (b >> 2)) % sec.arp.length]];
      const base = [60, 63, 58][(pass * 2 + (b >> 2)) % 3];
      for (let s = 0; s < 16; s++) {
        if (apat[s] === '.') continue;
        const pool = arpPool(chordAt(s), base);
        const up = b % 4 === 3 && s >= 8 && e > 0.5 ? 12 : 0;
        arp.push({ s, m: pool[+apat[s]] + up, v: (s % 4 === 0 ? 1 : 0.7) * (0.9 + 0.2 * r()) });
      }
    }

    // ---- lead (restrained: only when the section allows it and intensity is high enough)
    let lead = [];
    const phrase = sec.lead && LEADS[sec.lead][b];
    if (phrase && this.level >= (sec.leadMin ?? 0) && pass >= (sec.leadPass ?? 0)) {
      const oct = sec.lead !== 'answers' && pass % 2 === 1 && b < 4 ? -12 : sec.lead === 'answers' && vary ? -12 : 0;
      lead = phrase.map(([s, m, len]) => ({ s, m: m + oct, len }));
    }

    const bite = sec.bite ?? 1;
    const plan = {
      name, pass, bar: b, e, chords, kick, snare, clap, hat, tom, bass, arp, lead, stab: hits(STABS[sec.stab]),
      level: sec.level, duck: sec.duck, pad: sec.pad, leadVol: sec.leadVol ?? 1,
      padCut: (300 + 2400 * e) * (sec.padCut ?? 1) * (sec.sweep ? 0.35 + 0.65 * (b / 7) : 1),
      bassCut: [(90 + 260 * e) * bite, (500 + 2200 * e) * bite], arpDecay: 0.05 + 0.1 * e, arpCut: (1200 + 3200 * e) * bite,
      crash: b === 0 && sec.crash, impact: b === 0 && sec.impact, down: b === 0 && sec.down,
      riser: sec.riser && b === SECTION_BARS - sec.riser ? sec.riser : 0,
    };
    if (sec.breath && b === SECTION_BARS - 1) for (const k of ['kick', 'snare', 'clap', 'hat', 'tom', 'bass', 'arp', 'lead']) plan[k] = plan[k].filter((h) => h.s < 12);
    return plan;
  }

  _play(t0, p) {
    const S = this.S, at = (s) => t0 + s * STEP;
    S.setLevel(t0, p.level);
    S.padLevel(t0, p.pad, p.padCut);
    for (const h of p.stab) S.padStab(at(h.s), p.pad * h.v);
    for (const c of p.chords) S.chord(at(c.s), c.voicing);
    for (const n of p.bass) S.bass(at(n.s), n.m, n.gate * STEP, n.v, p.bassCut[0], p.bassCut[1]);
    for (const n of p.arp) S.arp(at(n.s), n.m, n.v, p.arpDecay, p.arpCut);
    for (const n of p.lead) S.lead(at(n.s), n.m, n.len * STEP, p.leadVol);

    for (const h of p.kick) {
      S.hit('kick', at(h.s), MIX.kick * h.v);
      if (p.duck < 1) S.pump(at(h.s), p.duck);
    }
    const r = rng(Math.floor(t0 * 1000));
    for (const h of p.hat) {
      const t = at(h.s) + (h.s % 2 ? SWING * STEP : 0), v = h.v * (0.85 + 0.3 * r());
      if (h.ch === 'o') S.hit('ohat', t, MIX.ohat * v); else S.hit('hat', t, MIX.hat * v);
    }
    for (const h of p.snare) S.hit('snare', at(h.s), MIX.snare * h.v, { gate: true });
    for (const h of p.clap) S.hit('clap', at(h.s) + 0.006, MIX.clap * h.v, { gate: true });
    for (const h of p.tom) S.hit('tom', at(h.s), MIX.tom, { rate: { H: 1.35, M: 1, L: 0.74 }[h.ch], verb: true });
    // gated reverb: one open window per cluster of snare hits
    let g0 = -1, g1 = -1;
    for (const h of p.snare) {
      const t = at(h.s);
      if (t > g1) { if (g1 > 0) S.gateOpen(g0, g1); g0 = t; }
      g1 = t + GATE_HOLD;
    }
    if (g1 > 0) S.gateOpen(g0, g1);

    if (p.crash) S.hit('crash', t0, MIX.crash, { verb: true });
    if (p.impact) S.hit('kick', t0, MIX.impact, { rate: 0.5, verb: true });
    if (p.down) S.sweep(t0, BAR, 6000, 150);
    if (p.riser) S.sweep(t0, p.riser * BAR, 250, 7000);
  }
}

export default new Music();
