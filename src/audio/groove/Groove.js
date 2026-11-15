// The player of the groove tracks (audio/tracks/*.js: disco, house, Italo, funk; original material). A track is data:
// its tempo and swing, its chords (progressions of 8 bars), its phrases, its layers (each an instrument and what it
// plays at each level of intensity) and its sections and forms. Here a bar planner turns it into notes, one bar at a
// time (pure: the same bar plans the same way), and a lookahead scheduler plays each bar on the AudioContext clock,
// every note a one-shot of an instrument synthesized once (groove/voices.js) and cached.
//
// The levels of intensity (LEVELS): 0 calm, 1 tense, 2 fight, 3..7 fight with a kill chain of 1..5 (the stage). A
// layer's part is a step map { level: pattern }: it comes in at its lowest key and changes at the others (null: out).
// The level is picked on a bar line from what the game says (setIntensity: calm under TENSE; setCombat: the fight;
// setCombo: the chain, one stage up at once, down one a bar). Calm and tense share the bar clock (the harmony goes on,
// the layers come and go); a fight starts its own form on the next bar line, announced at once (a riser, a reversed
// cymbal and a snare run over what is left of the bar), plays at least MIN_FIGHT_BARS, and hands back through a bar
// that ends on a fill. The whole mix is lowpassed in the calm (the record heard from the next room), opens with the
// tension and is wide open in a fight; it pumps under the kick, harder as the fight grows, and is driven a little
// into a saturation at the top of a chain.
// Public API (as audio/Synthwave.js): start(), stop(), setIntensity(0..1), setCombat(on), setCombo(n),
// setJukebox(v) (no band of its own: kept for the interface), release() (drops the cached instruments).
// The constructor takes the track and an optional (context, destination) so that it can be rendered offline.
import Audio from '../Audio.js';
import { render, INSTRUMENTS } from './voices.js';
import { chord, voicing, tokens, hits, mel, bassNote, degree, atLevel } from './theory.js';

export const LEVELS = ['calm', 'tense', 'fight', 'chain 1', 'chain 2', 'chain 3', 'chain 4', 'chain 5'];
const STAGES = 5;          // kill chain stages over the fight
const SECTION_BARS = 8;
const LOOKAHEAD = 0.3;     // s: a bar is scheduled once its downbeat is this close
const TENSE = 0.45;        // intensity from which the calm turns tense
const OPEN_AT = 0.85;      // ... and at which the tense mix is as open as it gets
const MIN_FIGHT_BARS = 2;  // the fight plays at least this long
const STINGS = [3, STAGES]; // stages whose arrival lands a stinger on the next bar line
const WARM_MS = 4;         // ms of instrument rendering per tick while the track warms up
const OPEN = 20000;        // Hz: the mix's tone filter wide open

// the mix by level (a track may give its own in `mix`): tone = the lowpass on the whole mix (calm; tense goes from
// tense[0] to tense[1] with the intensity), pump = the floor of the sidechain dip under each kick (1: none),
// gain = loudness, grit = the drive into the saturation
const MIX = {
  calm: 1500, tense: [2600, 9000], pump: [0.8, 0.62, 0.5, 0.48, 0.45, 0.42, 0.4, 0.38],
  gain: [0.36, 0.72, 0.76, 0.8, 0.83, 0.86, 0.9, 0.94], grit: [0, 0, 0.08, 0.1, 0.13, 0.16, 0.2, 0.26],
};
// each instrument's level (dB) before the layer's own `db`
const BASE = {
  kick: -6.5, snare: -10, clap: -9, hat: -9, shaker: -8, tamb: -11, conga: -11, cowbell: -19, clave: -16, rim: -13,
  tom: -10, bass: -8, guitar: -8, pluck: -14, rhodes: -12, poly: -14, strings: -16, brass: -12, chop: -11, vox: -12,
  lead: -12, talk: -11,
};
// the default range and size of each chord instrument's voicings
const VOICING = {
  guitar: { n: 3, lo: 60, hi: 76 }, chop: { n: 4, lo: 57, hi: 79 }, strings: { n: 4, lo: 60, hi: 84 }, brass: { n: 3, lo: 62, hi: 81 },
  rhodes: { n: 4, lo: 55, hi: 76 }, poly: { n: 4, lo: 57, hi: 79 }, vox: { n: 3, lo: 60, hi: 79 },
};
// how long each instrument takes to let go of a note (s), unless its layer says (`release`)
const RELEASE = { strings: 0.3, vox: 0.25, poly: 0.12, rhodes: 0.15, brass: 0.1, lead: 0.08, talk: 0.06 };
const FX = { crash: -21, swell: -22, riser: -30, boom: -8, fill: -11 };
const OUT = 0.7;           // the session's output into the music bus
// fills (the last bar of a fight's section, every fourth bar at the top of a chain): drums from that step on
const FILLS = {
  roll: { snare: '........5.5.6.79', from: 8 }, flam: { snare: '............6.79', from: 12 },
  toms: { tom: '........H.H.M.LL', from: 8 }, run: { snare: '........4.5.', tom: '............HMLL', from: 8 },
};
const MASKED = new Set(['snare', 'clap', 'hat', 'tamb']); // drums that give way to a fill

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const db = (x) => Math.pow(10, x / 20);
function rng(seed) { // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
const keyOf = (spec) => JSON.stringify(spec);

// a track checked and compiled once: chords parsed, phrases read, layer defaults filled
const COMPILED = new WeakMap();
export function compile(track) {
  let T = COMPILED.get(track);
  if (T) return T;
  const prog = {};
  for (const [name, bars] of Object.entries(track.prog)) {
    if (bars.length !== SECTION_BARS) throw new Error(`groove ${track.id}: progression ${name} is not ${SECTION_BARS} bars`);
    prog[name] = bars.map((e) => (Array.isArray(e) ? [{ s: 0, ch: chord(e[0]) }, { s: 8, ch: chord(e[1]) }] : [{ s: 0, ch: chord(e) }]));
  }
  const phrases = {};
  for (const [name, bars] of Object.entries(track.phrases || {})) phrases[name] = bars.map(mel);
  const layers = track.layers.map((L) => {
    const kind = L.mel ? 'mel' : INSTRUMENTS[L.inst];
    if (!kind) throw new Error(`groove ${track.id}: layer ${L.id} plays an unknown instrument ${L.inst}`);
    return { ...L, kind, gain: db((BASE[L.inst] ?? -15) + (L.db || 0)), voicing: L.voicing || VOICING[L.inst], release: L.release ?? RELEASE[L.inst] ?? 0.04 };
  });
  for (const [name, s] of Object.entries(track.sections)) {
    if (!prog[s.prog]) throw new Error(`groove ${track.id}: section ${name} has no progression ${s.prog}`);
  }
  for (const [form, list] of Object.entries(track.forms)) {
    for (const n of list) if (!track.sections[n]) throw new Error(`groove ${track.id}: form ${form} names no section ${n}`);
  }
  const bpm = track.bpm;
  T = {
    track, prog, phrases, layers, bpm, bar: 240 / bpm, step: 15 / bpm, swing: track.swing || 0,
    mix: { ...MIX, ...track.mix }, fills: track.fills || ['roll', 'toms', 'flam', 'run'], voiced: new Map(),
  };
  COMPILED.set(track, T);
  return T;
}

// the chords of each bar of a section, voiced for a layer, each led from the one before it (the same every time)
function voicings(T, L, prog) {
  const key = L.id + '|' + prog;
  let v = T.voiced.get(key);
  if (v) return v;
  let prev = null;
  v = T.prog[prog].map((slots) => slots.map(({ ch }) => (prev = voicing(ch, L.voicing, prev))));
  T.voiced.set(key, v);
  return v;
}

// A pure plan of one bar. at: { sec (section name), next (the next bar's section name and bar), b (bar 0..7), pass
// (times the section played before), level (0..7), open (0..1: how open the tense mix is), heat (0..1), state
// ('calm' | 'tense' | 'fight' | 'menu'), out (the fight's closing bar), fresh (first bar of a new state), sting }.
// Returns { name, bar, pass, level, state, chords, parts: { layer: [{ s, len, v, spec, gate }] }, mix, fx }.
export function planBar(T, at) {
  const { sec: name, b, pass, level } = at;
  const sec = T.track.sections[name];
  const fight = at.state === 'fight';
  const r = rng(hashStr(`${T.track.id}|${name}|${b}`) ^ Math.imul(pass + 1, 7919));
  const slots = T.prog[sec.prog][b];
  const chordAt = (s) => (s >= 8 && slots.length > 1 ? slots[1] : slots[0]).ch;
  const nextChord = T.prog[T.track.sections[at.next.sec].prog][at.next.b][0].ch;
  const last = at.out || b === SECTION_BARS - 1;
  const parts = {};

  // the fill: on the last bar of a fight's section, and every fourth bar at the top of a chain
  let fill = null;
  if (fight && sec.fill !== false && (last || (level >= 6 && b % 4 === 3))) fill = FILLS[T.fills[Math.floor(r() * T.fills.length)]];

  for (const L of T.layers) {
    if (sec.mute?.includes(L.id)) continue;
    const own = sec.parts && L.id in sec.parts ? sec.parts[L.id] : undefined;
    let v = own !== undefined && (own === null || typeof own !== 'object' || Array.isArray(own))
      ? (atLevel(L.mel || L.pat, level) == null ? null : own) // a section's plain part stands in where the layer plays
      : atLevel(own ?? L.mel ?? L.pat, level);
    if (sec.bars?.[L.id]) v = atLevel(L.mel || L.pat, level) == null ? null : sec.bars[L.id][b];
    if (v == null) continue;
    const events = L.kind === 'mel' ? melody(T, L, v, b) : layerBar(T, L, v, b, sec, chordAt, nextChord, r);
    let out = events;
    if (fill && L.kind === 'drum' && MASKED.has(L.inst)) out = events.filter((e) => e.s < fill.from);
    // the closing bar of a fight drops out on its last beat, but for the fill
    if (at.out && L.inst !== 'kick') out = out.filter((e) => e.s < 12 || L.kind === 'drum');
    for (const e of out) e.v *= L.vel ? atLevel(L.vel, level) : 1;
    if (out.length) parts[L.id] = out;
  }
  if (fill) {
    const ev = [];
    for (const [inst, pat] of Object.entries(fill)) {
      if (inst === 'from') continue;
      for (const h of hits(pat)) ev.push({ s: h.s, v: h.v, spec: { voice: inst, kit: T.track.kit, ...(inst === 'tom' ? { kind: h.ch } : {}) } });
    }
    parts.fill = ev;
  }

  const M = T.mix;
  const tone = sec.tone ?? (at.state === 'calm' ? M.calm : at.state === 'tense' ? M.tense[0] * Math.pow(M.tense[1] / M.tense[0], at.open) : OPEN);
  // the filter sweeps (a layer's `sweep`: [lo, hi] Hz by level, a sine over the section: low on its first bar, high
  // half way): this bar's start and end
  const sweeps = {};
  for (const L of T.layers) {
    const range = L.sweep && atLevel(L.sweep, level);
    if (!range || !parts[L.id]) continue;
    const f = (x) => range[0] * Math.pow(range[1] / range[0], 0.5 - 0.5 * Math.cos((Math.PI * 2 * x) / SECTION_BARS));
    sweeps[L.id] = [f(b), f(b + 1)];
  }
  const nextSec = T.track.sections[at.next.sec];
  return {
    name, bar: b, pass, level, state: at.state, chords: slots.map(({ s, ch }) => ({ s, sym: ch.sym })), parts, sweeps,
    mix: {
      tone, toneGlide: fight && at.fresh ? 0.01 : T.bar * 0.35, pump: T.layers.some((L) => L.inst === 'kick' && parts[L.id]) ? M.pump[level] : 1,
      gain: M.gain[level] * (sec.gain ?? 1), grit: Math.min(0.4, M.grit[level] + (fight ? 0.1 * at.heat : 0)),
    },
    fx: {
      crash: fight && !at.out && ((b === 0 && sec.crash !== false) || (level >= 7 && b % 4 === 0)),
      swell: fight && last && !at.out && at.next.b === 0 && nextSec.crash !== false,
      riser: (sec.riser && b === SECTION_BARS - sec.riser ? sec.riser : 0) || (at.state === 'tense' && b === SECTION_BARS - 2 ? 2 : 0),
      sting: !!at.sting,
    },
  };
}

// a melody layer's notes this bar: its phrase (by name), transposed by its `oct` semitones
function melody(T, L, name, b) {
  const phrase = T.phrases[name];
  if (!phrase) throw new Error(`groove ${T.track.id}: no phrase ${name}`);
  const voice = L.inst === 'lead' ? { voice: 'lead', tone: L.tone || 'square' } : L.inst === 'guitar' ? { voice: 'guitar', art: L.art || 'open' } : { voice: L.inst };
  return phrase[b % phrase.length].map(([s, m, len]) => {
    const n = m + (L.oct || 0);
    return { s, len, v: 1, gate: len * (L.gate ?? 0.92), spec: voice.voice === 'guitar' ? { ...voice, notes: [n] } : { ...voice, m: n } };
  });
}

// the notes of a pattern layer this bar
function layerBar(T, L, v, b, sec, chordAt, nextChord, r) {
  const pat = Array.isArray(v) ? v[b % v.length] : v;
  if (pat.length !== 16) throw new Error(`groove ${T.track.id}: ${L.id} pattern ${pat} is not 16 steps`);
  const human = () => 0.94 + 0.12 * r();
  const out = [];
  if (L.kind === 'drum') {
    const list = hits(pat);
    list.forEach((h, i) => {
      const open = L.inst === 'hat' && h.ch === 'o';
      const spec = { voice: open ? 'ohat' : L.inst, kit: T.track.kit };
      if (L.inst === 'conga') spec.kind = h.ch;
      else if (L.inst === 'tom') spec.kind = h.ch.toUpperCase();
      // an open hat is choked by the next hat of its line
      const len = open ? (list[i + 1] ? list[i + 1].s - h.s : 16 - h.s + 2) : 0;
      out.push({ s: h.s, len, gate: len, v: h.v * human(), spec });
    });
    return out;
  }
  const lo = L.lo ?? (L.inst === 'bass' ? 33 : 52);
  const voiced = L.kind === 'keys' || L.inst === 'guitar' ? voicings(T, L, sec.prog)[b] : null;
  const notesAt = (s) => (s >= 8 && voiced.length > 1 ? voiced[1] : voiced[0]);
  for (const t of tokens(pat)) {
    const c = chordAt(t.s), root = bassNote(c, lo), gate = t.len * (L.gate ?? 0.85);
    const v = (t.accent ? 1 : 0.62) * human();
    if (L.kind === 'keys') {
      if (t.tok !== 'C' && t.tok !== 'c') continue;
      const notes = notesAt(t.s);
      if (L.inst === 'chop') out.push({ s: t.s, len: t.len, gate, v, spec: { voice: 'chop', notes } });
      else for (const m of notes) out.push({ s: t.s, len: t.len, gate, v, spec: { voice: L.inst, m, ...(L.inst === 'rhodes' ? { soft: !t.accent } : L.inst === 'poly' ? { stab: !!L.stab } : {}) } });
      continue;
    }
    if (L.inst === 'guitar' && 'CcXx'.includes(t.tok)) {
      const dead = t.tok === 'X' || t.tok === 'x';
      out.push({ s: t.s, len: t.len, gate: dead ? 0.6 : gate, v, spec: { voice: 'guitar', notes: notesAt(t.s), art: dead ? 'dead' : L.chordArt || 'open',
        dir: t.tok === 'c' || t.tok === 'x' ? 'up' : 'down', wah: L.wah || null, accent: t.accent } });
      continue;
    }
    let m;
    if (t.tok === 'A') { const nb = bassNote(nextChord, lo); m = nb > root ? nb - 1 : nb + 1; }
    else if (t.tok === 'x') m = root;
    else m = degree(t.tok, c, root);
    if (m == null) throw new Error(`groove ${T.track.id}: ${L.id} token ${t.tok}`);
    let spec;
    if (L.inst === 'bass') {
      spec = { voice: 'bass', tone: L.tone || 'finger', m, ghost: !t.accent && t.tok !== 'x', dead: t.tok === 'x',
        pop: L.tone === 'slap' && (t.tok === 'O' || t.tok === 'o') };
    } else if (L.inst === 'guitar') spec = { voice: 'guitar', notes: [m], art: L.art || 'mute', wah: L.wah || null, accent: t.accent };
    else spec = { voice: 'poly', m, stab: true };
    out.push({ s: t.s, len: t.len, gate: t.tok === 'x' ? 0.5 : gate, v, spec });
  }
  return out;
}

// ---------------------------------------------------------------- the audio graph of one playing session
class Session {
  constructor(ctx, dest, T, buffer) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.live = 0;
    this.lfos = [];
    const gain = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const filt = (type, f, Q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = Q; return n; };
    const chain = (...n) => { for (let i = 1; i < n.length; i++) n[i - 1].connect(n[i]); return n[n.length - 1]; };
    this.gain = gain;

    // drums (dry) + duck (pumped) -> mix -> highpass -> tone -> clean + saturated -> glue compressor -> clip -> out
    this.out = gain(OUT);
    this.out.connect(dest);
    this.mix = gain(0);
    this.tone = filt('lowpass', OPEN, 0.7);
    const comp = ctx.createDynamicsCompressor();
    for (const [k, v] of Object.entries({ threshold: -14, knee: 9, ratio: 3, attack: 0.006, release: 0.16 })) comp[k].value = v;
    chain(this.mix, filt('highpass', 30), this.tone);
    this.dry = gain(1);
    this.wet = gain(0);
    const sat = ctx.createWaveShaper();
    sat.curve = curve((x) => Math.tanh(2 * x) / Math.tanh(2));
    sat.oversample = '2x';
    chain(this.tone, this.dry, comp);
    chain(this.tone, sat, filt('lowpass', 6000), this.wet, comp);
    const clip = ctx.createWaveShaper();
    clip.curve = curve((x) => Math.sign(x) * (Math.abs(x) < 0.5 ? Math.abs(x) : 0.5 + 0.2 * Math.tanh((Math.abs(x) - 0.5) / 0.2)));
    chain(comp, clip, this.out);
    this.drums = gain(1); this.drums.connect(this.mix);
    this.duck = gain(1); this.duck.connect(this.mix);

    // a room (the record's plate) and a dotted-eighth ping-pong delay, both returned into the pumped bus
    this.verb = gain(1);
    const conv = ctx.createConvolver();
    conv.buffer = buffer({ voice: 'room' });
    chain(this.verb, filt('highpass', 220), conv, filt('lowpass', 6500), gain(0.45), this.duck);
    this.delay = gain(1);
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2), fb = gain(0.32), merge = ctx.createChannelMerger(2);
    dl.delayTime.value = dr.delayTime.value = T.step * 3;
    chain(this.delay, filt('highpass', 400), filt('lowpass', 3500), dl, dr, fb, dl);
    dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
    chain(merge, gain(0.3), this.duck);

    // a bus per layer: level -> its filter (when it sweeps) -> its place in the stereo -> drums or the pumped bus,
    // with its sends; keys with `trem` swing from side to side (a Rhodes' tremolo)
    this.bus = {};
    const mk = (id, { gain: g = 1, sweep, q = 1, pan = 0, verb = 0, delay = 0, duck, trem }) => {
      const head = gain(g);
      let n = head;
      const b = { head };
      if (sweep) { b.filter = filt('lowpass', 800, q); n = chain(n, b.filter); }
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      if (trem) {
        const o = ctx.createOscillator();
        o.frequency.value = trem; o.start();
        this.lfos.push(o);
        chain(o, gain(0.45), p.pan);
      }
      chain(n, p, duck ? this.duck : this.drums);
      if (verb) chain(p, gain(verb), this.verb);
      if (delay) chain(p, gain(delay), this.delay);
      this.bus[id] = b;
    };
    for (const L of T.layers) mk(L.id, { ...L, duck: L.duck ?? L.kind !== 'drum' });
    mk('fill', { gain: db(FX.fill), verb: 0.25 });
    mk('fx', { gain: 1, verb: 0.5 });
  }

  // a one-shot of `spec` on a bus at t, velocity v, held `gate` s then let go over `release` s (0: plays out)
  note(bus, spec, t, v, gate = 0, release = 0.05, rate = 1) {
    const ctx = this.ctx, src = ctx.createBufferSource(), g = this.gain(v);
    src.buffer = this.buffer(spec);
    if (rate !== 1) src.playbackRate.value = rate;
    src.connect(g);
    g.connect(this.bus[bus].head);
    this.live++;
    src.onended = () => { g.disconnect(); this.live--; };
    src.start(t);
    if (gate > 0) {
      g.gain.setValueAtTime(v, t + gate);
      g.gain.setTargetAtTime(0, t + gate, release / 3);
      src.stop(t + gate + release * 2.5);
    }
  }

  // a band-passed noise sweep up to the next downbeat (a riser) or the cymbal swelling backwards into it
  riser(t, dur) {
    const ctx = this.ctx, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.buffer({ voice: 'noise' }); src.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7500, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(db(FX.riser), t + dur * 0.97);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.bus.fx.head);
    this.live++;
    src.onended = () => { g.disconnect(); this.live--; };
    src.start(t); src.stop(t + dur + 0.02);
  }

  // the swell ends on `t` (cut short when that is too soon)
  swell(t, now) {
    const spec = { voice: 'swell' }, len = this.buffer(spec).duration || 1.4;
    const t0 = Math.max(now, t - len), src = this.ctx.createBufferSource(), g = this.gain(db(FX.swell));
    src.buffer = this.buffer(spec);
    src.connect(g); g.connect(this.bus.fx.head);
    this.live++;
    src.onended = () => { g.disconnect(); this.live--; };
    src.start(t0, Math.max(0, len - (t - t0)));
  }

  pump(t, floor, beat) {
    const g = this.duck.gain;
    g.setTargetAtTime(floor, t, 0.004);
    g.setTargetAtTime(1, t + 0.03, beat * 0.22);
  }

  sweep(bus, t0, t1, f0, f1) {
    const f = this.bus[bus].filter.frequency;
    f.setValueAtTime(f0, t0);
    f.exponentialRampToValueAtTime(f1, t1);
  }

  mixTo(t, { tone, toneGlide, gain, grit }, glide) {
    this.mix.gain.setTargetAtTime(gain, t, glide);
    this.tone.frequency.setTargetAtTime(tone, t, toneGlide);
    this.wet.gain.setTargetAtTime(grit * 0.6, t, 0.3);
    this.dry.gain.setTargetAtTime(1 - grit * 0.4, t, 0.3);
  }

  fadeOut() { this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12); }

  dispose() {
    for (const o of this.lfos) o.stop();
    this.out.disconnect();
  }
}

function curve(fn, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}

// ---------------------------------------------------------------- the conductor of a track
export default class Groove {
  constructor(track, ctx = null, dest = null) {
    this.T = compile(track);
    this.ctx = ctx;
    this.dest = dest;
    this.playing = false;
    this.target = 0;      // requested intensity
    this.smooth = 0;      // the intensity, smoothed bar by bar
    this.combat = false;
    this.combo = 0;
    this.jukebox = 0;
    this.stage = 0;
    this.passes = {};
    this.cache = new Map(); // render key -> AudioBuffer
    this.cacheCtx = null;   // the context the cached buffers belong to
    this.warm = [];         // specs still to render while it warms up
    this.S = null;
    this.idle = false;      // an idle callback is pending (see _warmSome)
    this.onBar = null;      // debug hook (plan, time)
    this.only = null;       // debug / audition: a Set of the layer ids to play (null: all)
  }

  get id() { return this.T.track.id; }
  get liveVoices() { return this.S ? this.S.live : 0; }

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
    setTimeout(() => S.dispose(), 800);
    this.S = null;
  }

  release() { this.cache.clear(); this.warm = []; }

  setIntensity(v) { this.target = clamp(v, 0, 1); }
  setCombat(on) { this.combat = !!on; }
  setCombo(n) { this.combo = n || 0; }
  setJukebox(v) { this.jukebox = clamp(v || 0, 0, 1); }

  // the instrument for a spec, rendered on first use
  buffer(spec) {
    const key = keyOf(spec);
    let b = this.cache.get(key);
    if (!b) {
      const { ch, rate } = render(spec, this.cacheCtx.sampleRate);
      b = this.cacheCtx.createBuffer(ch.length, ch[0].length, rate);
      ch.forEach((d, i) => b.getChannelData(i).set(d));
      this.cache.set(key, b);
    }
    return b;
  }

  _open(ctx) {
    if (this.cacheCtx !== ctx) { this.cache.clear(); this.cacheCtx = ctx; }
    this.S = new Session(ctx, this.dest || Audio.music, this.T, (spec) => this.buffer(spec));
    this.playing = true;
    this.state = null;
    this.smooth = this.target;
    this.nextBar = ctx.currentTime + 0.1;
    this.cued = false;
    this.out = false;
    this.fightBars = 0;
    this.stage = 0;
    this.pos = 0;
    this.bar = 0;
    this.warm = this._specs();
  }

  // the state the game asks for (see the top of the file)
  _want() {
    const forms = this.T.track.forms;
    if (forms.menu && !forms.calm) return 'menu';
    if (this.target <= 0) return forms.menu ? 'menu' : 'calm';
    if (this.combat || this.cued || (this.state === 'fight' && this.fightBars < MIN_FIGHT_BARS)) return 'fight';
    return this.target >= TENSE ? 'tense' : 'calm';
  }

  _tick(until) {
    const now = this.S.ctx.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.05; // the timer was throttled (a background tab): resync
    // a fight breaks out: announced over what is left of the bar, its form takes over on the next bar line
    if (this.combat && this.target > 0 && this.T.track.forms.fight && this.state && this.state !== 'fight' && this.state !== 'menu' && !this.cued) {
      this.cued = true;
      this._cue(now);
    }
    while (this.nextBar < until) {
      const fight = this.state === 'fight';
      let want = this._want();
      this.out = fight && want !== 'fight' && want !== 'menu' && !this.out;
      if (this.out) want = 'fight';
      const fresh = this.state !== want;
      if (fresh) {
        const keep = (this.state === 'calm' || this.state === 'tense') && (want === 'calm' || want === 'tense');
        if (!keep) { this.pos = 0; this.bar = 0; }
        this.pos %= this.T.track.forms[want].length;
        this.state = want; this.fightBars = 0;
      }
      this.cued = false;
      this.smooth += (this.target - this.smooth) * 0.5;
      const top = Math.min(STAGES, this.combo), was = this.stage;
      this.stage = this.state !== 'fight' ? 0 : top >= this.stage ? top : this.stage - 1;
      const level = this.state === 'fight' ? 2 + this.stage : this.state === 'tense' ? 1 : 0;
      const form = this.T.track.forms[this.state];
      const sec = form[this.pos];
      const pass = this.passes[sec] || 0;
      const nextB = this.out ? 0 : (this.bar + 1) % SECTION_BARS;
      const next = { sec: this.out ? (this.T.track.forms.tense || form)[0] : nextB ? sec : form[(this.pos + 1) % form.length], b: nextB };
      const p = planBar(this.T, {
        sec, next, b: this.bar, pass, level, state: this.state, out: this.out, fresh,
        open: clamp((this.smooth - TENSE) / (OPEN_AT - TENSE), 0, 1), heat: clamp((this.smooth - 0.85) / 0.15, 0, 1),
        sting: this.state === 'fight' && !this.out && STINGS.some((n) => was < n && this.stage >= n),
      });
      // the bar's instruments not rendered yet are rendered now: if that took the bar past its time, it starts late
      for (const events of Object.values(p.parts)) for (const e of events) this.buffer(e.spec);
      const late = this.S.ctx.currentTime + 0.02;
      if (this.nextBar < late) this.nextBar = late;
      this._play(this.nextBar, p, fresh);
      if (this.onBar) this.onBar(p, this.nextBar);
      if (++this.bar >= SECTION_BARS) {
        this.passes[sec] = pass + 1;
        this.bar = 0;
        this.pos = (this.pos + 1) % form.length;
      }
      this.fightBars++;
      this.nextBar += this.T.bar;
    }
    this._warmSome();
  }

  // what is left of the bar before a fight's first downbeat: a riser, the reversed cymbal and a snare run
  _cue(now) {
    const S = this.S, t0 = now + 0.03, t1 = this.nextBar, step = this.T.step, n = Math.min(8, Math.floor((t1 - t0) / step));
    if (n < 1) return;
    S.riser(t0, t1 - t0);
    S.swell(t1, t0);
    for (let k = n; k >= 1; k--) S.note('fill', { voice: 'snare', kit: this.T.track.kit }, t1 - k * step, 0.35 + 0.6 * (1 - k / 9));
  }

  _play(t0, p, fresh) {
    const S = this.S, T = this.T, step = T.step;
    const at = (s) => t0 + s * step + (s % 2 === 1 ? T.swing * step : 0);
    S.mixTo(t0, p.mix, fresh && p.state !== 'fight' ? T.bar * 0.6 : 0.25);
    for (const [id, [f0, f1]] of Object.entries(p.sweeps)) S.sweep(id, t0, t0 + T.bar, f0, f1);
    for (const [id, events] of Object.entries(p.parts)) {
      if (this.only && !this.only.has(id)) continue;
      const L = T.layers.find((l) => l.id === id);
      const release = L?.release ?? 0.04;  // the fills
      for (const e of events) S.note(id, e.spec, at(e.s), e.v, e.gate * step, release);
      if (L?.inst === 'kick' && p.mix.pump < 1) for (const e of events) S.pump(at(e.s), p.mix.pump, step * 4);
    }
    if (this.only && !this.only.has('fx')) return;
    if (p.fx.crash) S.note('fx', { voice: 'crash' }, t0, db(FX.crash));
    if (p.fx.riser) S.riser(t0, p.fx.riser * T.bar);
    if (p.fx.swell) S.swell(t0 + T.bar, t0);
    if (p.fx.sting) { // a chain gets big: a boom and a crash on the downbeat
      S.note('fx', { voice: 'kick', kit: T.track.kit }, t0, db(FX.boom), 0, 0.05, 0.5);
      if (!p.fx.crash) S.note('fx', { voice: 'crash' }, t0, db(FX.crash) * 1.2);
    }
  }

  // every instrument the track can ask for: each bar of each section of each form at each level it is heard at
  _specs() {
    const seen = new Set(), out = [];
    const forms = this.T.track.forms;
    for (const [state, form] of Object.entries(forms)) {
      const levels = state === 'fight' ? [2, 3, 4, 5, 6, 7] : state === 'tense' ? [1] : [0];
      for (const sec of new Set(form)) {
        for (const level of levels) {
          for (let b = 0; b < SECTION_BARS; b++) {
            const p = planBar(this.T, { sec, next: { sec, b: (b + 1) % SECTION_BARS }, b, pass: 0, level, state, open: 0.5, heat: 0 });
            for (const events of Object.values(p.parts)) {
              for (const e of events) { const k = keyOf(e.spec); if (!seen.has(k)) { seen.add(k); out.push(e.spec); } }
            }
          }
        }
      }
    }
    return out;
  }

  // renders a few of the instruments still missing: in the browser's idle time when it has some, else WARM_MS a tick
  // (a bar renders what it needs at once, see _tick)
  _warmSome() {
    if (!this.warm.length || this.idle) return;
    const idle = globalThis.requestIdleCallback;
    if (idle) {
      this.idle = true;
      idle((d) => {
        this.idle = false;
        if (this.playing) while (this.warm.length && d.timeRemaining() > 3) this.buffer(this.warm.shift());
      }, { timeout: 500 });
      return;
    }
    const t = performance.now();
    while (this.warm.length && performance.now() - t < WARM_MS) this.buffer(this.warm.shift());
  }

  // all of them at once (an offline render, the audition)
  warmAll() { while (this.warm.length) this.buffer(this.warm.shift()); }
}
