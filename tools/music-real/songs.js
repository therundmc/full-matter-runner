// The music extracts: original nu-disco / funk / French touch / Balearic / Italo pieces, about 40 s each, written
// as scores for the recorded instruments of engine.js. Each one: a short build, then the full groove and its hook.
import { Session, grid, N } from './engine.js';

const ns = (str) => str.trim().split(/\s+/).map(N);
// a 16-step pattern: 'X' accent, 'x' normal, 'o' soft, 'g' ghost, '-' dead / very soft, '.' rest
const VEL = { X: 1, x: 0.8, o: 0.6, g: 0.32, '-': 0.2 };
const steps = (str) => [...str.replace(/\s/g, '')].map((c, i) => [i, c]).filter(([, c]) => c !== '.');

// ---------------------------------------------------------------- the drum kit and hand percussion
function kit(S, o = {}) {
  const r = S.r, h = (ms) => r.gauss() * ms / 1000, hv = (v) => Math.max(0.05, Math.min(1, v * (1 + 0.06 * r.gauss())));
  S.reverb('room', { time: 0.7, pre: 0.008, damp: 0.4, hp: 200, lp: 7000 });
  S.reverb('hall', { time: 2.4, pre: 0.025, damp: 0.5, hp: 300, lp: 8000 });
  const bus = S.strip('_drums', { bus: 'master', comp: { th: -15, ratio: 3, att: 0.01, rel: 0.12, makeup: 1.2 }, drive: o.drive ?? 0.3 });
  const st = {
    kick: S.strip('kick', { bus, gain: o.kick ?? 1.2, hp: 35, eq: [['peaking', 60, 3, 1.2], ['peaking', 420, -8, 1], ['peaking', 3800, 6, 1.4]], comp: { th: -14, ratio: 4, att: 0.004, rel: 0.07, makeup: 1.5 } }),
    kroom: S.strip('kick.room', { bus, gain: 0.3, hp: 60, lp: 5000 }),
    ksub: S.strip('kick.sub', { bus, gain: (o.sub ?? 0.55) * 0.7, lp: 160 }),
    snare: S.strip('snare', { bus, gain: o.snare ?? 0.75, hp: 90, eq: [['peaking', 210, 3, 1.2], ['peaking', 1000, -3, 1], ['highshelf', 6000, 3]], comp: { th: -16, ratio: 3.5, att: 0.003, rel: 0.1, makeup: 1.3 }, sends: { room: 0.3, hall: o.snareHall ?? 0.08 } }),
    sroom: S.strip('snare.room', { bus, gain: 0.4, hp: 150 }),
    clap: S.strip('clap', { bus, gain: o.clap ?? 0.8, hp: 280, eq: [['peaking', 1500, 3, 1]], sends: { room: 0.35, hall: o.clapHall ?? 0.15 } }),
    hat: S.strip('hat', { bus, gain: o.hat ?? 0.5, hp: 500, eq: [['highshelf', 9000, 3]], pan: 0.25 }),
    perc: S.strip('perc', { bus, gain: o.perc ?? 0.6, hp: 110, sends: { room: 0.3, hall: 0.05 } }),
    cym: S.strip('cym', { bus, gain: 0.35, hp: 400, pan: -0.25, sends: { hall: 0.12 } }),
  };
  const K = {
    st,
    kick(t, v = 0.95) {
      const tt = t + h(1.2), vv = hv(v);
      S.play('kick', st.kick, tt, { vel: vv });
      S.play('kickRoom', st.kroom, tt, { vel: vv });
      S.thump(st.ksub, tt, { vel: vv, f0: o.subHz ?? 47 });
      S.kicks.push(tt);
    },
    snare(t, v = 0.85, art = 'center') {
      const tt = t + h(2.5), vv = hv(v);
      S.play('snare', st.snare, tt, { art, vel: vv });
      if (v > 0.4) S.play('snareRoom', st.sroom, tt, { art, vel: vv });
    },
    clap(t, v = 0.85) { // two people clapping: a little apart in time and space
      S.play('clap', st.clap, t + h(2), { art: 'handclap', vel: hv(v), pan: -0.15 });
      S.play('clap', st.clap, t + 0.009 + h(2), { art: 'handclap', vel: hv(v * 0.85), pan: 0.2 });
    },
    hat(t, v = 0.6, art = 'closed', dur = null) { S.play('hat', st.hat, t + h(2.5), { art, vel: hv(v), dur, rel: 0.06 }); },
    crash(t, v = 0.8) { S.play('crash', st.cym, t + h(2), { vel: v }); },
    ride(t, v = 0.6, art = 'ride') { S.play('ride', st.cym, t + h(2.5), { art, vel: hv(v) }); },
    conga(t, art, v) { S.play('conga', st.perc, t + h(4), { art, vel: hv(v), pan: -0.4 }); },
    bongo(t, art, v) { S.play('bongo', st.perc, t + h(4), { art, vel: hv(v), pan: 0.45 }); },
    shaker(t, i, v) { S.play('shaker', st.perc, t + h(3), { art: i % 2 ? 'up' : 'down', vel: hv(v), pan: 0.55, gain: 0.8 }); },
    tamb(t, v) { S.play('tamb', st.perc, t + h(3), { vel: hv(v), pan: -0.55, gain: 0.7 }); },
    cowbell(t, v) { S.play('cowbell', st.perc, t + h(3), { vel: hv(v), pan: 0.3, gain: 0.5 }); },
    // a 16-step line of a pattern string through one of the players
    line(fn, T, bar, str, scale = 1) { for (const [i, c] of steps(str)) fn(T(bar, i), VEL[c] * scale, i); },
    // a snare build: 16ths from step `from`, crescendo
    roll(T, bar, from = 8, v0 = 0.3, v1 = 0.95) { for (let i = from; i < 16; i++) K.snare(T(bar, i), v0 + ((v1 - v0) * (i - from)) / (15 - from)); },
  };
  return K;
}

// a strummed guitar chord: down from the low string, up from the high one, a few ms apart. dead: the fretting hand
// lies on the strings (a funk scratch): the recorded noise of damped strings over a very short muted pluck
function strum(S, strip, t, notes, { up = false, vel = 0.7, art = 'stac', dur = null, spread = 0.006, rel = 0.04, gain = 1, lp, dead = false } = {}) {
  const order = up ? [...notes].reverse() : notes;
  order.forEach((n, i) => {
    const tt = t + i * spread * (0.8 + 0.4 * S.r()), v = vel * (1 - i * 0.05) * (0.92 + 0.16 * S.r());
    if (dead) {
      S.play('guitar', strip, tt, { art: 'rel', note: n, vel: v, gain: gain * 5, dur: 0.07, rel: 0.03 });
      S.play('guitar', strip, tt, { art: 'stac', note: n, vel: v, gain: gain * 0.45, dur: 0.018, rel: 0.012, lp: 1600 });
    } else S.play('guitar', strip, tt, { art, note: n, vel: v, dur, rel, gain, lp });
  });
}
// a chord on a keyboard: the notes within a few ms, the top note a touch louder
function chord(S, lib, strip, t, notes, { vel = 0.7, dur = 0.5, rel = 0.3, spread = 0.004, art, att } = {}) {
  notes.forEach((n, i) => S.play(lib, strip, t + S.r() * spread, { art, note: n, vel: vel * (i === notes.length - 1 ? 1.08 : 0.95) * (0.94 + 0.12 * S.r()), dur, rel, att }));
}
// a line of notes: [step, note, length (steps), vel, art] played from bar `bar`
function phrase(S, lib, strip, T, bar, notes, { art, rel = 0.08, h = 4, gain = 1, late = 0, att, detune } = {}) {
  for (const [st, n, len = 1, v = 0.8, a] of notes) {
    const t = T(bar, st) + late + S.r.gauss() * h / 1000;
    S.play(lib, strip, t, { art: a || art, note: typeof n === 'string' ? N(n) : n, vel: v * (0.95 + 0.1 * S.r()), dur: len * T.s16 * 0.92, rel, gain, att, detune });
  }
}

// ======================================================================== 1. MIRADOR (Balearic disco-funk)
async function mirador(solo, mix) {
  const BPM = 112, BARS = 18, T = grid(BPM, { swing: 0.1 });
  const S = new Session(BARS * T.bar + 4, 101, solo, mix);
  await S.load('kick', 'kickRoom', 'snare', 'snareRoom', 'hat', 'crash', 'conga', 'bongo', 'shaker', 'tamb', 'clap', 'bass', 'guitar', 'rhodes', 'violins', 'violas');
  const D = kit(S, { hat: 0.5, perc: 0.85, kick: 1.05, sub: 0.5 });
  const bass = S.strip('bass', { gain: 0.9, hp: 35, eq: [['peaking', 80, 2, 1], ['peaking', 250, -2, 1], ['peaking', 900, 2, 1.2]], comp: { th: -20, ratio: 4, att: 0.01, rel: 0.12, makeup: 1.6 }, drive: 0.3 });
  const rhodes = S.strip('rhodes', { gain: 1.0, hp: 120, eq: [['peaking', 300, -2, 1], ['highshelf', 5000, 2]], comp: { th: -20, ratio: 2.5, att: 0.01, rel: 0.2, makeup: 1.3 }, drive: 0.4, autopan: { rate: 3.2, depth: 0.45 }, sends: { hall: 0.22 } });
  const gtrL = S.strip('gtr', { gain: 1.1, hp: 150, eq: [['peaking', 2500, 3, 1], ['peaking', 400, -3, 1]], comp: { th: -22, ratio: 4, att: 0.004, rel: 0.08, makeup: 1.5 }, pan: -0.45, sends: { room: 0.15 } });
  const lead = S.strip('lead', { gain: 1.4, hp: 180, eq: [['peaking', 1800, 3, 1], ['highshelf', 6000, -2]], comp: { th: -20, ratio: 3, att: 0.006, rel: 0.12, makeup: 1.4 }, drive: 0.6, pan: 0.3, sends: { hall: 0.25, room: 0.1 } });
  const strings = S.strip('strings', { gain: 1.4, hp: 200, eq: [['peaking', 3000, 2, 1]], sends: { hall: 0.45 } });

  const CH = [ns('G3 B3 D4 F#4'), ns('G3 B3 C#4 F#4'), ns('G3 B3 D4 F#4'), ns('E3 G3 B3 D4'), ns('A3 B3 D#4 F#4')]; // Em9 A13 Em9 Cmaj9 B7
  const BASS = [
    [[0, 'E1', 3, 0.95], [3, 'E2', 1, 0.7, 'stac'], [6, 'E1', 1, 0.8, 'stac'], [7, 'G1', 1, 0.7], [8, 'A1', 2, 0.85], [10, 'B1', 1, 0.75, 'stac'], [11, 'D2', 1, 0.7], [12, 'E2', 2, 0.85], [14, 'D2', 1, 0.6, 'stac'], [15, 'B1', 1, 0.65]],
    [[0, 'A1', 3, 0.95], [3, 'A2', 1, 0.7, 'stac'], [6, 'A1', 1, 0.8, 'stac'], [7, 'C#2', 1, 0.7], [8, 'E2', 2, 0.85], [10, 'G2', 1, 0.7, 'stac'], [11, 'F#2', 1, 0.65], [12, 'E2', 2, 0.8], [14, 'C#2', 1, 0.65], [15, 'B1', 1, 0.6]],
    [[0, 'E1', 3, 0.95], [3, 'E2', 1, 0.7, 'stac'], [6, 'E1', 1, 0.8, 'stac'], [7, 'G1', 1, 0.7], [8, 'A1', 2, 0.85], [10, 'B1', 1, 0.75, 'stac'], [11, 'D2', 1, 0.7], [12, 'E2', 2, 0.85], [14, 'G1', 1, 0.7], [15, 'B1', 1, 0.7]],
    [[0, 'C2', 3, 0.95], [3, 'C3', 1, 0.65, 'stac'], [6, 'C2', 1, 0.8, 'stac'], [7, 'G1', 1, 0.65], [8, 'B1', 3, 0.95], [11, 'B2', 1, 0.65, 'stac'], [12, 'A1', 1, 0.7], [13, 'B1', 1, 0.75], [14, 'D2', 1, 0.7], [15, 'D#2', 1, 0.75]],
  ];
  const MUTE = [ // palm-muted 16ths, the notes of each bar
    ns('E3 E3 B3 E3 E3 D4 B3 E3 E3 E3 B3 E3 G3 A3 B3 D4'), ns('A2 A2 E3 A2 A2 G3 E3 A2 A2 A2 E3 A2 C#3 E3 F#3 G3'),
    ns('E3 E3 B3 E3 E3 D4 B3 E3 E3 E3 B3 E3 G3 A3 B3 D4'), ns('C3 C3 G3 C3 C3 B3 G3 C3 B2 B2 F#3 B2 B2 D#3 F#3 A3'),
  ];
  const HOOK = [ // the lead guitar's answer, over bars 2 and 4 of each phrase
    [[10, 'B4', 1, 0.75], [11, 'D5', 1, 0.8], [12, 'E5', 3, 0.95], [15, 'F#5', 1, 0.75]],
    [[0, 'E5', 2, 0.9], [2, 'C#5', 1, 0.75], [3, 'B4', 1, 0.7], [4, 'A4', 4, 0.85], [9, 'B4', 1, 0.6], [10, 'C#5', 2, 0.7]],
    [[10, 'B4', 1, 0.75], [11, 'D5', 1, 0.8], [12, 'G5', 3, 0.95], [15, 'F#5', 1, 0.8]],
    [[0, 'E5', 2, 0.9], [2, 'D5', 1, 0.75], [3, 'B4', 1, 0.7], [4, 'G4', 2, 0.8], [6, 'A4', 2, 0.75], [8, 'B4', 6, 0.9]],
  ];
  const VLN = [['B4', 'G4'], ['C#5', 'A4'], ['D5', 'B4'], ['E5', 'G4']];
  for (let bar = 0; bar < BARS; bar++) {
    const k = bar % 4, full = bar >= 4, B = bar >= 12;
    // keys: an offbeat Rhodes comp
    for (const [st, len, v] of [[0, 3, 0.7], [3, 1, 0.45], [6, 2, 0.65], [10, 4, 0.72], [14, 1, 0.45]]) {
      const c = k === 3 ? CH[st < 8 ? 3 : 4] : CH[k];
      chord(S, 'rhodes', rhodes, T(bar, st) + 0.004, c, { vel: v * (bar < 2 ? 0.8 : 1), dur: len * T.s16 * 0.9, rel: 0.25 });
    }
    // palm-muted guitar from the start, accents on the offbeat 8ths
    MUTE[k].forEach((n, i) => {
      if (!full && i % 4 === 1) return;
      const v = i % 4 === 2 ? 0.8 : i % 2 ? 0.42 : 0.55;
      S.play('guitar', gtrL, T(bar, i) + S.r.gauss() * 0.003, { art: 'stac', note: n, vel: v, dur: T.s16 * 0.8, rel: 0.03 });
    });
    // percussion: congas and bongos from bar 0, shaker 16ths
    for (const st of [0, 4, 8, 12]) D.conga(T(bar, st), 'mute', 0.45);
    for (const [st, v] of [[6, 0.75], [7, 0.6], [14, 0.8], [15, 0.6]]) D.conga(T(bar, st), 'open', v);
    for (const [st, a, v] of [[2, 'hi', 0.5], [3, 'lo', 0.4], [10, 'hi', 0.55], [11, 'lo', 0.45], [13, 'hi', 0.35]]) D.bongo(T(bar, st), a, v);
    for (let i = 0; i < 16; i++) D.shaker(T(bar, i), i, i % 4 === 2 ? 0.7 : i % 2 ? 0.4 : 0.55);
    if (bar >= 2) phrase(S, 'bass', bass, T, bar, BASS[k], { art: 'reg', late: 0.004, rel: 0.05 });
    if (bar >= 2) for (let i = 0; i < 16; i += 2) D.hat(T(bar, i), i % 4 === 2 ? 0.7 : 0.45);
    if (bar === 3) { for (const st of [0, 4, 8]) D.kick(T(bar, st), 0.8); D.roll(T, bar, 10, 0.3, 0.9); }
    if (full) {
      for (const st of [0, 4, 8, 12]) D.kick(T(bar, st), st === 0 ? 0.98 : 0.9);
      for (const st of [4, 12]) D.snare(T(bar, st), 0.85);
      for (const [st, v] of [[7, 0.22], [10, 0.18], [15, 0.25]]) if (S.r() < 0.7) D.snare(T(bar, st), v);
      for (let i = 1; i < 16; i += 2) D.hat(T(bar, i), 0.3);
      if (B) for (const st of [2, 6, 10, 14]) D.hat(T(bar, st), 0.6, 'open', T.s16 * 1.6);
      if (B) for (const st of [4, 12]) D.tamb(T(bar, st), 0.65);
      if (bar === 4 || bar === 12) D.crash(T(bar, 0), 0.8);
      phrase(S, 'guitar', lead, T, bar, HOOK[k], { art: 'ord', h: 6, rel: 0.12 });
    }
    if (B) {
      const [hi, lo] = VLN[k];
      if (k === 3) {
        S.play('violins', strings, T(bar, 0), { art: 'long', note: N('E5'), vel: 0.7, dur: T.beat * 2, att: 0.12, rel: 0.3 });
        S.play('violins', strings, T(bar, 8), { art: 'long', note: N('D#5'), vel: 0.75, dur: T.beat * 2, att: 0.1, rel: 0.4 });
      } else S.play('violins', strings, T(bar, 0), { art: 'long', note: N(hi), vel: 0.7, dur: T.bar, att: 0.2, rel: 0.4 });
      S.play('violas', strings, T(bar, 0), { art: 'long', note: N(lo), vel: 0.6, dur: T.bar, att: 0.25, rel: 0.4 });
    }
  }
  // the last hit: Em9 rings out
  const end = T(BARS, 0);
  D.kick(end, 1); D.crash(end, 0.9);
  chord(S, 'rhodes', rhodes, end, CH[0], { vel: 0.8, dur: 2.5, rel: 1 });
  S.play('bass', bass, end, { art: 'reg', note: N('E1'), vel: 0.9, dur: 2.2, rel: 0.6 });
  S.play('guitar', lead, end + 0.01, { art: 'ord', note: N('E5'), vel: 0.8, dur: 2.5, rel: 0.8 });
  S.sidechain(S.kicks, 0.28, 0.14);
  return S.render();
}

// ======================================================================== 2. BACK ROOM HOURS (piano house)
async function backroom(solo, mix) {
  const BPM = 124, BARS = 20, T = grid(BPM, { swing: 0.06 });
  const S = new Session(BARS * T.bar + 4, 202, solo, mix);
  await S.load('kick', 'kickRoom', 'snare', 'snareRoom', 'hat', 'crash', 'ride', 'conga', 'shaker', 'tamb', 'clap', 'bass', 'piano', 'sax', 'violins', 'violas');
  const D = kit(S, { hat: 0.45, kick: 1.25, sub: 0.7, clap: 0.9, snare: 0.45 });
  const bass = S.strip('bass', { gain: 1.1, hp: 30, lp: 3500, eq: [['peaking', 70, 3, 1], ['peaking', 300, -3, 1], ['peaking', 1100, 2, 1.2]], comp: { th: -20, ratio: 5, att: 0.008, rel: 0.1, makeup: 1.7 }, drive: 0.4 });
  const piano = S.strip('piano', { gain: 1.0, hp: 160, eq: [['peaking', 350, -3, 1], ['peaking', 2800, 4, 0.9], ['highshelf', 8000, 3]], comp: { th: -22, ratio: 4, att: 0.004, rel: 0.12, makeup: 1.8 }, drive: 0.35, sends: { room: 0.2, hall: 0.18 } });
  S.delay('echo', { time: T.beat * 0.75, fb: 0.3, lp: 3500 });
  const sax = S.strip('sax', { gain: 0.8, hp: 220, eq: [['peaking', 800, -2, 1], ['peaking', 2500, 2, 1]], comp: { th: -22, ratio: 3, att: 0.01, rel: 0.15, makeup: 1.5 }, drive: 0.3, pan: 0.15, sends: { hall: 0.35, echo: 0.18 } });
  const strings = S.strip('strings', { gain: 0.55, hp: 250, sends: { hall: 0.5 } });

  const CH = [ns('Ab3 Eb4 G4 C5'), ns('Ab3 C4 F4 Db5'), ns('Ab3 C4 Eb4 F4 C5'), ns('Db4 F4 G4 C5')]; // Fm9 Bbm9 Dbmaj9 Eb13
  const ROOT = ['F1', 'Bb0', 'Db1', 'Eb1'].map(N);
  const RH = [[[0, 2, 0.9], [3, 2, 0.75], [6, 1, 0.7], [8, 2, 0.85], [11, 2, 0.75], [14, 2, 0.8]],
    [[0, 2, 0.9], [3, 1, 0.7], [6, 3, 0.85], [10, 1, 0.7], [12, 1, 0.75], [13, 3, 0.85]]];
  const SAX = [
    [[2, 'C5', 2, 0.8], [4, 'Eb5', 1, 0.75], [5, 'F5', 3, 0.9], [10, 'Ab5', 2, 0.85], [12, 'G5', 1, 0.75], [13, 'F5', 3, 0.85]],
    [[0, 'Eb5', 2, 0.8], [2, 'C5', 5, 0.8], [12, 'Bb4', 1, 0.7], [13, 'C5', 3, 0.8]],
    [[2, 'C5', 2, 0.8], [4, 'Eb5', 1, 0.75], [5, 'F5', 3, 0.9], [10, 'Ab5', 2, 0.85], [12, 'Bb5', 1, 0.8], [13, 'C6', 3, 0.9]],
    [[0, 'Bb5', 2, 0.85], [2, 'Ab5', 2, 0.8], [4, 'G5', 2, 0.75], [6, 'F5', 2, 0.75], [8, 'Eb5', 2, 0.75], [10, 'F5', 6, 0.85]],
  ];
  // the piano opens up over the first 4 bars
  const pf = S.strips.piano.filter.frequency;
  pf.setValueAtTime(700, 0); pf.exponentialRampToValueAtTime(20000, T(4, 0));
  for (let bar = 0; bar < BARS; bar++) {
    const k = bar % 4, drop = bar >= 4, hook = bar >= 8 && bar < 16 || bar >= 18;
    for (const [st, len, v] of RH[bar % 2]) chord(S, 'piano', piano, T(bar, st), CH[k], { vel: v, dur: len * T.s16 * 0.85, rel: 0.15 });
    for (let i = 0; i < 16; i++) D.shaker(T(bar, i), i, i % 4 === 2 ? 0.65 : 0.4);
    for (const st of [2, 6, 10, 14]) D.hat(T(bar, st), bar < 2 ? 0.45 : 0.65, 'open', T.s16 * 1.4);
    if (bar >= 2) for (const st of [0, 4, 8, 12]) D.kick(T(bar, st), 0.95);
    if (bar >= 3) for (const st of [4, 12]) { D.clap(T(bar, st), 0.9); D.snare(T(bar, st), 0.5); }
    if (bar === 3) D.roll(T, bar, 8, 0.25, 0.85);
    if (drop) {
      const R = ROOT[k];
      phrase(S, 'bass', bass, T, bar, [[2, R, 2, 0.95], [5, R, 1, 0.45, 'ghost'], [6, R + 12, 1, 0.7, 'stac'], [7, R, 1, 0.75, 'stac'], [10, R, 2, 0.95], [13, R + 10, 1, 0.7, 'stac'], [14, R + 12, 2, 0.85]], { art: 'reg', late: 0.003, rel: 0.04 });
      for (let i = 1; i < 16; i += 2) D.hat(T(bar, i), 0.3);
      for (const st of [6, 14]) D.tamb(T(bar, st), 0.55);
      if (bar >= 8) for (const st of [0, 4, 8, 12]) D.ride(T(bar, st), 0.35);
      for (const [st, a, v] of [[3, 'open', 0.55], [7, 'mute', 0.5], [11, 'open', 0.6], [14, 'open', 0.5]]) D.conga(T(bar, st), a, v);
      if (k === 0) {
        S.play('violins', strings, T(bar, 0), { art: 'long', note: N('C5'), vel: 0.6, dur: T.bar * 1.9, att: 0.5, rel: 0.6 });
        S.play('violas', strings, T(bar, 0), { art: 'long', note: N('Ab4'), vel: 0.55, dur: T.bar * 1.9, att: 0.5, rel: 0.6 });
      } else if (k === 2) {
        S.play('violins', strings, T(bar, 0), { art: 'long', note: N('C5'), vel: 0.6, dur: T.bar, att: 0.4, rel: 0.5 });
        S.play('violins', strings, T(bar, 0) + T.bar, { art: 'long', note: N('Bb4'), vel: 0.6, dur: T.bar, att: 0.3, rel: 0.6 });
        S.play('violas', strings, T(bar, 0), { art: 'long', note: N('F4'), vel: 0.55, dur: T.bar * 2, att: 0.4, rel: 0.6 });
      }
    }
    if (bar === 4 || bar === 8 || bar === 16) D.crash(T(bar, 0), 0.75);
    if (hook) phrase(S, 'sax', sax, T, bar, SAX[k], { art: 'sus', h: 8, rel: 0.12, att: 0.015 });
  }
  const end = T(BARS, 0);
  D.kick(end, 1); D.crash(end, 0.85); D.clap(end, 0.8);
  chord(S, 'piano', piano, end, CH[0], { vel: 0.9, dur: 2.5, rel: 1.2 });
  S.play('bass', bass, end, { art: 'reg', note: N('F1'), vel: 0.9, dur: 2, rel: 0.5 });
  S.sidechain(S.kicks, 0.35, 0.13);
  return S.render();
}

// ======================================================================== 3. FILTRE BLEU (French touch, filtered disco)
async function filtre(solo, mix) {
  const BPM = 122, BARS = 20, T = grid(BPM, { swing: 0.04 });
  const S = new Session(BARS * T.bar + 4, 303, solo, mix);
  await S.load('kick', 'kickRoom', 'snare', 'snareRoom', 'hat', 'crash', 'clap', 'tamb', 'bass', 'guitar', 'rhodes', 'violins', 'violas', 'trumpet', 'trombone', 'sax');
  const D = kit(S, { hat: 0.5, kick: 1.35, sub: 0.75, clap: 0.95, drive: 0.45 });
  // the sampled-disco loop: everything but the drums and the horns goes through one resonant filter
  const c = S.ctx, loopIn = c.createGain(), lpf = c.createBiquadFilter(), lpf2 = c.createBiquadFilter(), loopOut = c.createGain();
  lpf.type = 'lowpass'; lpf.Q.value = 6; lpf2.type = 'lowpass'; lpf2.Q.value = 0.7;
  loopIn.connect(lpf).connect(lpf2).connect(loopOut).connect(S.music);
  const f = [lpf.frequency, lpf2.frequency];
  for (const p of f) { p.setValueAtTime(320, 0); p.exponentialRampToValueAtTime(900, T(4, 0)); p.exponentialRampToValueAtTime(19000, T(7, 12)); }
  loopOut.gain.setValueAtTime(1, 0); loopOut.gain.setValueAtTime(1, T(7, 12)); loopOut.gain.linearRampToValueAtTime(0.05, T(7, 12) + 0.03); loopOut.gain.setValueAtTime(0.05, T(8, 0) - 0.01); loopOut.gain.linearRampToValueAtTime(1, T(8, 0));
  const loop = { input: loopIn };
  const bass = S.strip('bass', { bus: loop, gain: 1.15, hp: 35, eq: [['peaking', 90, 3, 1], ['peaking', 700, 2, 1]], comp: { th: -20, ratio: 4, att: 0.008, rel: 0.1, makeup: 1.6 }, drive: 0.5 });
  const gtr = S.strip('gtr', { bus: loop, gain: 0.85, hp: 200, eq: [['peaking', 3000, 4, 1], ['peaking', 500, -3, 1]], comp: { th: -24, ratio: 5, att: 0.003, rel: 0.06, makeup: 1.7 }, pan: -0.35, sends: { room: 0.15 } });
  const keys = S.strip('rhodes', { bus: loop, gain: 0.75, hp: 150, drive: 0.5, autopan: { rate: 2.4, depth: 0.35 }, sends: { hall: 0.15 } });
  const str = S.strip('strings', { bus: loop, gain: 0.85, hp: 300, eq: [['peaking', 2500, 3, 1]], pan: 0.25, sends: { hall: 0.3 } });
  const horns = S.strip('horns', { gain: 0.95, hp: 150, eq: [['peaking', 1600, 3, 1]], comp: { th: -20, ratio: 3, att: 0.005, rel: 0.1, makeup: 1.4 }, drive: 0.4, sends: { hall: 0.3, room: 0.15 } });

  const GTR = [ns('F3 Bb3 D4 A4'), ns('E3 Bb3 D4 G4'), ns('E3 A3 C4 G4'), ns('F3 C4 E4 A4')]; // Gm9 C9 Fmaj9 Dm9
  const STR = [ns('Bb4 D5 F5'), ns('Bb4 E5 G5'), ns('A4 C5 E5'), ns('A4 C5 F5')];
  const KEYS = [ns('F3 A3 Bb3 D4'), ns('E3 G3 Bb3 D4'), ns('E3 G3 A3 C4'), ns('E3 F3 A3 C4')];
  const ROOT = ['G1', 'C2', 'F1', 'D1'].map(N);
  const SCR = 'g-X- g-Xg -gX- gXgX'; // the scratch: X a chord, the rest dead strums
  const HORN = [ // [step, steps, top-to-bottom notes for trumpet, sax, trombone]
    [[0, 2, 'D5 Bb4 F4'], [3, 1, 'D5 Bb4 F4'], [6, 3, 'F5 C5 A4']],
    [[2, 1, 'E5 C5 G4'], [4, 2, 'G5 E5 Bb4'], [10, 1, 'E5 C5 G4'], [11, 3, 'D5 Bb4 F4']],
    [[0, 2, 'C5 A4 E4'], [3, 1, 'C5 A4 E4'], [6, 3, 'E5 C5 G4']],
    [[2, 1, 'F5 C5 A4'], [4, 2, 'A5 F5 C5'], [10, 1, 'G5 E5 C5'], [11, 2, 'F5 C5 A4'], [14, 2, 'E5 C5 A4']],
  ];
  for (let bar = 0; bar < BARS; bar++) {
    const k = bar % 4, drop = bar >= 8;
    // the loop
    for (const [i, ch] of steps(SCR)) {
      const dead = ch !== 'X';
      strum(S, gtr, T(bar, i) + S.r.gauss() * 0.002, GTR[k], { up: i % 2 === 1, vel: dead ? 0.5 : 0.85, dead, dur: T.s16 * 0.9, rel: 0.02, spread: 0.005 });
    }
    for (const st of [2, 6, 10, 14]) chord(S, 'violins', str, T(bar, st), STR[k], { art: 'short', vel: st === 14 ? 0.85 : 0.7, dur: T.s16 * 1.5, rel: 0.1 });
    for (const st of [0, 8]) chord(S, 'rhodes', keys, T(bar, st), KEYS[k], { vel: 0.6, dur: T.s16 * 7, rel: 0.3 });
    const R = ROOT[k];
    phrase(S, 'bass', bass, T, bar, [[0, R, 1, 0.95], [2, R + 12, 1, 0.8, 'stac'], [4, R, 1, 0.9], [6, R + 12, 1, 0.8, 'stac'], [8, R, 1, 0.9], [10, R + 12, 1, 0.8, 'stac'], [11, R + 12, 1, 0.6, 'stac'], [12, R, 1, 0.9], [14, R + 12, 1, 0.8, 'stac'], [15, R + 10, 1, 0.7, 'stac']], { art: 'reg', rel: 0.03, late: 0.002 });
    // the drums stay unfiltered
    const brk = bar === 7;
    for (const st of [0, 4, 8, 12]) if (!(brk && st === 12)) D.kick(T(bar, st), 0.97);
    if (bar >= 4 && !(brk)) for (const st of [4, 12]) D.clap(T(bar, st), 0.9);
    if (bar >= 2) for (const st of [2, 6, 10, 14]) if (!(brk && st > 11)) D.hat(T(bar, st), 0.7, 'open', T.s16 * 1.5);
    if (bar >= 4) for (let i = 0; i < 16; i++) if (i % 4 !== 2) D.hat(T(bar, i), i % 2 ? 0.25 : 0.4);
    if (drop) { for (const st of [4, 12]) D.snare(T(bar, st), 0.6); for (const st of [2, 6, 10, 14]) D.tamb(T(bar, st), 0.5); }
    if (brk) { D.snare(T(bar, 12), 0.9); D.clap(T(bar, 12), 0.95); }
    if (bar === 8 || bar === 16) D.crash(T(bar, 0), 0.9);
    // the brass stab riff from the drop
    if (drop) for (const [st, len, v3] of HORN[k]) {
      const [tp, sx, tb] = ns(v3), t = T(bar, st) + S.r.gauss() * 0.004, dur = len * T.s16 * 0.8;
      S.play('trumpet', horns, t, { note: tp, vel: 0.9, dur, rel: 0.08 });
      S.play('sax', horns, t + 0.006, { note: sx, vel: 0.85, dur, rel: 0.06, att: 0.006, gain: 0.7 });
      S.play('trombone', horns, t + 0.003, { note: tb - 12, vel: 0.85, dur, rel: 0.08 });
    }
  }
  const end = T(BARS, 0);
  D.kick(end, 1); D.crash(end, 0.9);
  chord(S, 'rhodes', keys, end, KEYS[0], { vel: 0.7, dur: 2.5, rel: 1 });
  for (const [lib, n] of [['trumpet', 'D5'], ['sax', 'Bb4'], ['trombone', 'G4']]) S.play(lib, horns, end, { note: N(n), vel: 0.95, dur: 0.4, rel: 0.3 });
  S.play('bass', bass, end, { art: 'reg', note: N('G1'), vel: 0.95, dur: 2, rel: 0.5 });
  S.sidechain(S.kicks, 0.55, 0.2); // the French pump
  return S.render();
}

// ======================================================================== 4. CASSETTE NUIT (Italo disco)
async function cassette(solo, mix) {
  const BPM = 118, BARS = 20, T = grid(BPM);
  const S = new Session(BARS * T.bar + 4, 404, solo, mix);
  await S.load('kick', 'kickRoom', 'snare', 'snareRoom', 'hat', 'crash', 'clap', 'tamb', 'guitar', 'violins', 'violas', 'celli');
  const D = kit(S, { hat: 0.5, kick: 1.25, sub: 0.55, snare: 0.85, snareHall: 0.25, clapHall: 0.3 });
  S.delay('echo', { time: T.beat * 0.75, fb: 0.38, lp: 3500 });
  const sbass = S.strip('synthbass', { gain: 0.9, hp: 30, eq: [['peaking', 100, 2, 1]], comp: { th: -18, ratio: 4, att: 0.004, rel: 0.08, makeup: 1.4 }, drive: 0.3 });
  const gL = S.strip('gtr', { gain: 0.75, hp: 180, eq: [['peaking', 2800, 3, 1], ['peaking', 450, -3, 1]], comp: { th: -22, ratio: 4, att: 0.004, rel: 0.08, makeup: 1.5 }, pan: -0.6, sends: { room: 0.12 } });
  const gR = S.strip('gtr.r', { gain: 0.75, hp: 180, eq: [['peaking', 2800, 3, 1], ['peaking', 450, -3, 1]], comp: { th: -22, ratio: 4, att: 0.004, rel: 0.08, makeup: 1.5 }, pan: 0.6, sends: { room: 0.12 } });
  const pad = S.strip('strings', { gain: 0.7, hp: 150, sends: { hall: 0.5 } });
  const lead = S.strip('lead', { gain: 0.6, hp: 250, eq: [['peaking', 2000, 2, 1]], drive: 0.2, sends: { hall: 0.25, echo: 0.3 } });
  const arp = S.strip('arp', { gain: 0.35, hp: 400, pan: 0.2, sends: { echo: 0.35, hall: 0.15 }, autopan: { rate: 0.25, depth: 0.5 } });

  const PROG = [['A1', 'A3 C4 E4'], ['F1', 'A3 C4 E4 F4'], ['C2', 'G3 C4 E4'], ['G1', 'G3 B3 D4'], ['D2', 'A3 C4 F4'], ['A1', 'A3 C4 E4'], ['F1', 'A3 C4 E4'], ['E1', 'A3 B3 E4']].map(([r, c]) => [N(r), ns(c)]);
  const LEAD = [
    [[0, 'E5', 2], [2, 'E5', 1], [3, 'D5', 1], [4, 'C5', 2], [6, 'D5', 2], [8, 'E5', 4], [12, 'G5', 2], [14, 'E5', 2]],
    [[0, 'D5', 2], [2, 'C5', 2], [4, 'A4', 4], [8, 'C5', 2], [10, 'D5', 2], [12, 'C5', 2], [14, 'B4', 2]],
    [[0, 'C5', 2], [2, 'E5', 2], [4, 'G5', 4], [8, 'A5', 2], [10, 'G5', 2], [12, 'E5', 4]],
    [[0, 'D5', 6], [6, 'B4', 2], [8, 'D5', 2], [10, 'G5', 2], [12, 'D5', 4]],
    [[0, 'F5', 2], [2, 'F5', 1], [3, 'E5', 1], [4, 'D5', 2], [6, 'C5', 2], [8, 'D5', 4], [12, 'A5', 2], [14, 'F5', 2]],
    [[0, 'E5', 4], [4, 'C5', 2], [6, 'A4', 2], [8, 'C5', 4], [12, 'E5', 4]],
    [[0, 'A5', 2], [2, 'G5', 2], [4, 'E5', 2], [6, 'C5', 2], [8, 'E5', 4], [12, 'D5', 4]],
    [[0, 'E5', 4], [4, 'D5', 2], [6, 'B4', 2], [8, 'G#4', 8]],
  ];
  for (let bar = 0; bar < BARS; bar++) {
    const k = bar % 8, [R, C] = PROG[k], drop = bar >= 4, top = bar >= 12;
    const chordNow = k === 7 ? [N('G#3'), N('B3'), N('E4')] : C;
    // the arpeggio: 16ths up the chord, two octaves
    const arpNotes = [...C, ...C.map((n) => n + 12)];
    for (let i = 0; i < 16; i++) {
      const n = arpNotes[(i * 3) % arpNotes.length] + 12;
      if (bar < 4 || top) S.synth(arp, T(bar, i), { note: k === 7 && i >= 8 && n % 12 === 9 ? n - 1 : n, dur: T.s16 * 0.5, wave: 'square', voices: 1, cutoff: 1800, envAmt: 2500, q: 2, decay: 0.08, gain: 0.25, vel: i % 4 === 0 ? 1 : 0.6, sustain: 0.3 });
    }
    // strings pad from the start (celli under from the drop)
    if (k % 2 === 0 || bar === 0) {
      const dur = (k === 7 ? 1 : 2) * T.bar;
      chord(S, 'violins', pad, T(bar, 0), C.map((n) => n + 12), { art: 'long', vel: 0.55, dur, rel: 0.6, att: 0.35 });
      if (drop) S.play('celli', pad, T(bar, 0), { art: 'long', note: R + 24, vel: 0.55, dur, rel: 0.6, att: 0.3 });
    }
    if (k === 7) chord(S, 'violins', pad, T(bar, 8), [N('G#4'), N('B4'), N('E5')], { art: 'long', vel: 0.6, dur: T.bar / 2, rel: 0.5, att: 0.1 });
    for (let i = 0; i < 16; i += 2) D.hat(T(bar, i + 1), i % 4 === 2 ? 0.7 : 0.55);
    if (bar >= 2) for (const st of [0, 4, 8, 12]) D.kick(T(bar, st), 0.95);
    if (bar === 3) D.roll(T, bar, 8, 0.3, 0.95);
    if (drop) {
      for (const st of [4, 12]) { D.snare(T(bar, st), 0.9); D.clap(T(bar, st), 0.7); }
      for (let i = 0; i < 16; i += 2) D.hat(T(bar, i), 0.3);
      if (top) for (const st of [4, 12]) D.tamb(T(bar, st + 2), 0.55);
      // the octave gallop of the synth bass
      for (let i = 0; i < 16; i++) {
        const hi = i % 4 === 2, n = (k === 7 && i >= 8 ? N('E1') : R) + (hi ? 12 : 0);
        S.synth(sbass, T(bar, i), { note: n, dur: T.s16 * (hi ? 0.7 : 0.55), wave: 'sawtooth', voices: 2, detune: 7, cutoff: 260, envAmt: hi ? 1900 : 1300, q: 5, decay: 0.09, gain: 0.42, vel: i % 4 === 0 ? 1 : hi ? 0.85 : 0.55, sustain: 0.5, sub: 0.6 });
      }
      // two palm-muted guitars, 8ths on the root and fifth, one each side
      for (let i = 0; i < 16; i += 2) {
        const r0 = (k === 7 && i >= 8 ? N('E2') : R + 12), dy = [r0, r0 + 7];
        strum(S, gL, T(bar, i) + S.r.gauss() * 0.003, dy, { vel: i % 4 === 0 ? 0.75 : 0.6, dur: T.s16 * 1.2, rel: 0.03 });
        strum(S, gR, T(bar, i) + 0.008 + S.r.gauss() * 0.004, dy.map((n) => n + 12), { vel: i % 4 === 0 ? 0.7 : 0.55, dur: T.s16 * 1.1, rel: 0.03 });
      }
      for (const [st, n, len] of LEAD[k]) {
        const nn = N(n) + (top ? 12 : 0) - 12;
        const o = { note: nn, dur: len * T.s16 * 0.9, wave: 'sawtooth', voices: 3, detune: 9, cutoff: 1400, envAmt: 2200, q: 1.5, decay: 0.25, att: 0.008, rel: 0.12, sustain: 0.75, vib: 14, gain: 0.32, vel: 0.9 };
        S.synth(lead, T(bar, st), o);
        S.synth(lead, T(bar, st), { ...o, wave: 'square', voices: 1, note: nn + 12, gain: 0.12 });
      }
    }
    if (bar === 4 || bar === 12) D.crash(T(bar, 0), 0.85);
  }
  const end = T(BARS, 0);
  D.kick(end, 1); D.crash(end, 0.9); D.snare(end, 0.9);
  chord(S, 'violins', pad, end, ns('A4 C5 E5'), { art: 'long', vel: 0.65, dur: 2.5, rel: 1 });
  S.synth(sbass, end, { note: N('A1'), dur: 1.5, cutoff: 300, envAmt: 1500, q: 4, decay: 0.3, gain: 0.45, sub: 0.6, rel: 0.6 });
  S.sidechain(S.kicks, 0.3, 0.12);
  return S.render();
}

// ======================================================================== 5. FIRE ESCAPE (funk with horns)
async function escape(solo, mix) {
  const BPM = 106, BARS = 18, T = grid(BPM, { swing: 0.12 });
  const S = new Session(BARS * T.bar + 4, 505, solo, mix);
  await S.load('kick', 'kickRoom', 'snare', 'snareRoom', 'hat', 'crash', 'conga', 'cowbell', 'bass', 'guitar', 'rhodes', 'trumpet', 'trombone', 'sax');
  const D = kit(S, { hat: 0.55, kick: 1.2, sub: 0.5, snare: 0.85 });
  const bass = S.strip('bass', { gain: 1.1, hp: 32, eq: [['peaking', 85, 3, 1], ['peaking', 280, -3, 1], ['peaking', 1200, 3, 1.2]], comp: { th: -20, ratio: 5, att: 0.006, rel: 0.09, makeup: 1.7 }, drive: 0.4 });
  const scratch = S.strip('gtr', { gain: 0.8, hp: 220, eq: [['peaking', 3200, 4, 1], ['peaking', 500, -4, 1]], comp: { th: -24, ratio: 5, att: 0.002, rel: 0.05, makeup: 1.8 }, pan: -0.5, sends: { room: 0.12 } });
  const single = S.strip('gtr.2', { gain: 0.7, hp: 160, eq: [['peaking', 2200, 3, 1]], comp: { th: -22, ratio: 4, att: 0.003, rel: 0.06, makeup: 1.5 }, pan: 0.5, sends: { room: 0.12 } });
  const keys = S.strip('rhodes', { gain: 0.7, hp: 140, drive: 0.6, autopan: { rate: 4, depth: 0.3 }, sends: { hall: 0.2 } });
  const horns = S.strip('horns', { gain: 1.0, hp: 140, eq: [['peaking', 1500, 3, 1], ['highshelf', 7000, 1]], comp: { th: -20, ratio: 3, att: 0.004, rel: 0.1, makeup: 1.5 }, drive: 0.45, sends: { hall: 0.28, room: 0.18 } });

  const GTR = [ns('G#3 D4 F#4 B4'), ns('G#3 D4 F#4 B4'), ns('G3 C#4 F#4'), ns('G3 C#4 F#4')]; // E9 E9 A13 A13
  const KEYS = [ns('G#3 B3 D4 F#4'), ns('G#3 B3 D4 F#4'), ns('G3 B3 C#4 F#4'), ns('G3 B3 C#4 F#4')];
  const SCR = 'g-X- -X-g X-gX -Xg-';
  const BASS = [
    [[0, 'E1', 2, 0.95], [3, 'E2', 1, 0.75, 'stac'], [4, 'E1', 1, 0.5, 'ghost'], [5, 'E1', 1, 0.7, 'stac'], [6, 'G1', 1, 0.75], [7, 'G#1', 1, 0.8], [8, 'B1', 2, 0.85], [10, 'D2', 1, 0.7, 'stac'], [11, 'E2', 1, 0.85, 'stac'], [12, 'E1', 1, 0.55, 'ghost'], [13, 'D2', 1, 0.7], [14, 'B1', 1, 0.75], [15, 'G1', 1, 0.65]],
    [[0, 'E1', 2, 0.95], [3, 'E2', 1, 0.75, 'stac'], [4, 'E1', 1, 0.5, 'ghost'], [5, 'E1', 1, 0.7, 'stac'], [6, 'G1', 1, 0.75], [7, 'G#1', 1, 0.8], [8, 'B1', 1, 0.85], [9, 'E2', 1, 0.6, 'stac'], [10, 'D2', 1, 0.75], [11, 'B1', 1, 0.7], [12, 'A1', 1, 0.8], [13, 'G#1', 1, 0.75], [14, 'G1', 1, 0.7], [15, 'G#1', 1, 0.75]],
    [[0, 'A1', 2, 0.95], [3, 'A2', 1, 0.75, 'stac'], [4, 'A1', 1, 0.5, 'ghost'], [5, 'A1', 1, 0.7, 'stac'], [6, 'C2', 1, 0.75], [7, 'C#2', 1, 0.8], [8, 'E2', 2, 0.85], [10, 'G2', 1, 0.7, 'stac'], [11, 'A2', 1, 0.85, 'stac'], [12, 'A1', 1, 0.55, 'ghost'], [13, 'G1', 1, 0.7], [14, 'E1', 1, 0.75], [15, 'G1', 1, 0.65]],
    [[0, 'A1', 2, 0.95], [3, 'A2', 1, 0.75, 'stac'], [4, 'A1', 1, 0.5, 'ghost'], [6, 'C#2', 1, 0.75], [7, 'E2', 1, 0.8], [8, 'G1', 2, 0.9], [10, 'A1', 2, 0.9], [12, 'B1', 3, 0.95], [15, 'D#2', 1, 0.75]],
  ];
  const LINE = ns('E3 E3 G3 E3 A3 A#3 B3 E3 E3 D4 E3 B3 D4 B3 A3 G3'); // the second guitar, palm-muted
  const HORN = [ // top line; the sax a fourth under, the trombone an octave under
    [[0, 'E5', 1], [2, 'E5', 1], [3, 'D5', 1], [4, 'E5', 2], [7, 'G5', 1], [8, 'E5', 3]],
    [[14, 'B4', 1], [15, 'D5', 1]],
    [[0, 'E5', 1], [2, 'E5', 1], [3, 'C#5', 1], [4, 'E5', 2], [7, 'F#5', 1], [8, 'E5', 3]],
    [[8, 'G5', 2, 'D5 B4'], [10, 'A5', 2, 'E5 C#5'], [12, 'B5', 4, 'F#5 D#5']],
  ];
  const under = { E5: 'B4', D5: 'A4', G5: 'D5', 'C#5': 'G#4', 'F#5': 'C#5', B4: 'F#4' };
  const horn = (t, top, len, mid, v = 0.9) => {
    const n = N(top), dur = len * T.s16 * 0.85, m = mid ? ns(mid) : [N(under[top])];
    S.play('trumpet', horns, t, { note: n, vel: v, dur, rel: 0.08 });
    S.play('sax', horns, t + 0.007, { note: m[0], vel: v * 0.95, dur, rel: 0.06, att: 0.006, gain: 0.75 });
    S.play('trombone', horns, t + 0.004, { note: (m[1] ?? n) - 12, vel: v * 0.9, dur, rel: 0.08 });
  };
  for (let bar = 0; bar < BARS; bar++) {
    const k = bar % 4, groove = bar >= 4, B = bar >= 12;
    for (const [i, ch] of steps(SCR)) {
      const dead = ch !== 'X';
      strum(S, scratch, T(bar, i) + S.r.gauss() * 0.002, GTR[k], { up: i % 2 === 1, vel: dead ? 0.5 : 0.88, dead, dur: T.s16 * 0.7, rel: 0.02, spread: 0.004 });
    }
    if (bar >= 1) for (let i = 0; i < 16; i++) D.hat(T(bar, i), i % 4 === 0 ? 0.6 : i % 2 ? 0.3 : 0.5);
    if (bar >= 2) {
      phrase(S, 'bass', bass, T, bar, BASS[k], { art: 'reg', rel: 0.04, late: 0.003 });
      for (const st of [0, 4, 8, 12]) D.kick(T(bar, st), 0.95);
      D.kick(T(bar, 10), 0.6);
      for (const st of [4, 12]) D.snare(T(bar, st), 0.95);
      for (const [st, v] of [[7, 0.22], [9, 0.18], [15, 0.28], [2, 0.15]]) if (S.r() < 0.8) D.snare(T(bar, st), v);
      D.hat(T(bar, 14), 0.6, 'open', T.s16 * 1.5);
    }
    if (groove) {
      for (const [i, n] of LINE.entries()) if (i % 4 !== 1 || k % 2) S.play('guitar', single, T(bar, i) + S.r.gauss() * 0.003, { art: 'stac', note: k >= 2 ? n + 5 : n, vel: i % 4 === 0 ? 0.75 : 0.5, dur: T.s16 * 0.7, rel: 0.02 });
      for (const [st, a, v] of [[0, 'mute', 0.5], [3, 'open', 0.65], [6, 'open', 0.7], [8, 'mute', 0.45], [11, 'open', 0.6], [14, 'open', 0.75]]) D.conga(T(bar, st), a, v);
      if (B) for (const st of [0, 4, 8, 12]) D.cowbell(T(bar, st), 0.5);
      if (B) for (const [st, len] of [[2, 2], [7, 1], [10, 3]]) chord(S, 'rhodes', keys, T(bar, st), KEYS[k], { vel: 0.6, dur: len * T.s16, rel: 0.15 });
    }
    if (bar === 3) for (const [st, n] of [[14, 'B4'], [15, 'D5']]) horn(T(bar, st), n, 1);
    if (groove) for (const [st, n, len, mid] of HORN[k]) horn(T(bar, st) + S.r.gauss() * 0.004, n, len, mid, B ? 1 : 0.88);
    if (bar === 4 || bar === 12) D.crash(T(bar, 0), 0.85);
  }
  const end = T(BARS, 0);
  D.kick(end, 1); D.crash(end, 0.9); D.snare(end, 0.95);
  horn(end, 'E5', 6, 'B4 G#4');
  strum(S, scratch, end, GTR[0], { art: 'ord', vel: 0.9, dur: 2, rel: 0.6, spread: 0.015 });
  S.play('bass', bass, end, { art: 'reg', note: N('E1'), vel: 0.95, dur: 2, rel: 0.5 });
  S.sidechain(S.kicks, 0.22, 0.12);
  return S.render();
}

// aim: the balance aimed at, dB under the kick, where it differs from tools/render_real.mjs's default
export const SONGS = {
  mirador: { aim: { perc: -12 }, title: 'Mirador', render: mirador, bpm: 112, key: 'E dorian (Em9 - A13 - Em9 - Cmaj9 / B7)', style: 'Balearic disco-funk', seconds: 42,
    hook: 'A clean lead guitar answering the palm-muted chug with a rising B-D-E phrase, a Rhodes comp swaying left-right, congas and bongos; strings climb from the second half.' },
  backroom: { aim: { snare: -14, clap: -7, piano: -5, sax: -7, strings: -15, perc: -13, bass: -2 }, title: 'Back Room Hours', render: backroom, bpm: 124, key: 'F minor (Fm9 - Bbm9 - Dbmaj9 - Eb13)', style: 'Piano house', seconds: 42,
    hook: 'Syncopated upright-piano stabs whose top notes sing the tune, an offbeat bass guitar under them, and an alto sax line from bar 9.' },
  filtre: { aim: { perc: -20, horns: -6, strings: -11, rhodes: -14, clap: -7, snare: -13 }, title: 'Filtre Bleu', render: filtre, bpm: 122, key: 'F major / D minor (Gm9 - C9 - Fmaj9 - Dm9)', style: 'French touch filter house', seconds: 43,
    hook: 'A disco loop (scratch guitar, string stabs, octave bass, Rhodes) under a resonant filter that opens over 8 bars, one beat of silence, then trumpet-sax-trombone stabs over the pumping kick.' },
  cassette: { aim: { synthbass: -2, lead: -7, gtr: -12, strings: -12, snare: -6, clap: -11 }, title: 'Cassette Nuit', render: cassette, bpm: 118, key: 'A minor (Am - Fmaj7 - C - G - Dm7 - Am - Fmaj7 - E7sus4)', style: 'Italo disco', seconds: 44,
    hook: 'A saw-and-square synth lead with vibrato over a galloping octave synth bass, two palm-muted guitars hard left and right, real strings and drums; the lead jumps an octave for the last 8 bars.' },
  escape: { aim: { horns: -6, gtr: -9, perc: -13, rhodes: -14, snare: -6 }, title: 'Fire Escape', render: escape, bpm: 106, key: 'E (E9 - E9 - A13 - A13)', style: 'Disco-funk with horns', seconds: 44,
    hook: 'A trumpet-sax-trombone riff (E-E-D-E... G-E) answered by a G-A-B climb, over a chicken-scratch guitar, a ghost-note bass and a second guitar line.' },
};
