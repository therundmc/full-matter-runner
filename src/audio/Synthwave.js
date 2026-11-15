// The synthwave track (track 'synthwave' of audio/tracks/index.js, played through audio/Music.js): a procedural
// darksynth / house song (original composition). The score (audio/score.js) holds the data: chords, progressions,
// patterns, sections and the form of each state of the game. Here a seeded bar planner turns it into note events
// (every return of a section varies), then a lookahead scheduler plays each bar on long-lived synth voices (mono bass
// / arp / pulse / lead / hook, a 4-note stab, a 5-voice pad: no nodes per note) and on drum and percussion one-shots
// synthesized once into AudioBuffers.
// Public API (the same as every player, see audio/Music.js): start(), stop(), setIntensity(0..1), setCombat(on),
// setCombo(n), setJukebox(0..1). The intensity picks the form on a bar line: the calm (a dark pad and a muted pulse
// that breathes), tense (a heartbeat, the bass, risers), then the song and its beat (BEAT); the combat form (house,
// four on the floor, same key and motifs) takes over while the game fights, each kill of a chain bringing a layer and
// a little volume (the stage, see setCombo), a stinger on the big ones. setJukebox: the bar's jukebox plays its own
// small band on the same bars and chords.
// The constructor takes an optional (context, destination) so the song can be rendered offline for analysis.
import Audio from './Audio.js';
import {
  PROGRESSIONS, SECTIONS, FORMS, KICK, SNARE, HATS, FILLS, PERC, BASS, PULSE, ARP, STABS, LEADS, JUKE, GRIT, GRIT_RANGE,
  chord, bassMidi, chordTone, voiceLead, arpPool, gritDrive, gritCurve,
} from './score.js';

const BPM = 126;
const BAR = 240 / BPM;
const STEP = BAR / 16;
const SECTION_BARS = 8;
const LOOKAHEAD = 0.3;   // s: a bar is scheduled once its downbeat is this close
const SWING = 0.1;       // hats and shaker: odd 16ths are late by this fraction of a 16th
const GATE_HOLD = 0.22;  // s: gated reverb stays open this long after a snare/clap
const MIN_FIGHT_BARS = 2; // the combat form plays at least this long before it may wind down
const TENSE = 0.45;       // intensity from which the calm turns tense
const BEAT = 0.7;         // ... and from which the song proper, with its beat, plays
const STAGES = 5;         // layers a kill chain can bring in (see setCombo)
const STAGE_GAIN = 0.055; // each of them a little louder
const STINGS = [3, STAGES]; // stages whose arrival in a fight lands a stinger on the next bar line
const HOT = 0.9;          // intensity under which the fight skips its double-time chase
const FADE_BARS = 2;      // bars a new form takes to open up out of the muffled mix
const OPEN = 20000;       // Hz: the mix's tone filter wide open
const SWELL = 1.2;        // s: the reversed cymbal into a downbeat
const AFTERMATH = FORMS.game.indexOf('break'); // where the song resumes once a fight is over

// ---------------------------------------------------------------- mix levels
const MIX = {
  bus: 0.7, out: 0.7, kick: 0.27, snare: 0.18, clap: 0.1, hat: 0.055, ohat: 0.046, tom: 0.12, crash: 0.05, impact: 0.16,
  riser: 0.02, swell: 0.05, shaker: 0.1, rim: 0.1, clank: 0.1,
  bass: 0.3, bassOut: 0.3, sub: 0.1, growl: 0.2, pad: 0.12, arp: 0.11, pulse: 0.17, stab: 0.14, lead: 0.075, hook: 0.05,
  gateSend: 0.7, gateRet: 0.9, verbRet: 0.5, delayRet: 0.32, delayFb: 0.38,
  juke: 0.2, jukeDrums: 0.6, jukeOut: 0.5,
};
const TOM_RATE = { H: 1.35, M: 1, L: 0.74 };

// ---------------------------------------------------------------- small helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

const parseHits = (pat) => [...pat].flatMap((ch, s) => (ch === '.' ? [] : [{ s, ch, v: ch >= '1' && ch <= '9' ? ch / 9 : 0.75 }]));
const HITS = new Map();
const hits = (pat) => { if (!pat) return []; let h = HITS.get(pat); if (!h) HITS.set(pat, h = parseHits(pat)); return h; };

function curve(fn, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}
const TAPE = curve((x) => Math.tanh(1.6 * x) / Math.tanh(1.6));
const DRIVE = curve((x) => Math.tanh(3 * x) / Math.tanh(3)); // bass, stabs: fattens and flattens the attack spikes
const FUZZ = curve((x) => Math.tanh(7 * x) / Math.tanh(7));  // the bass's growl: next to a square
// the saturation that dirties the mix in a fight (score.js GRIT): tanh over +-GRIT_RANGE, the drive set by a gain
const GRIT_CURVE = curve((x) => gritCurve(x * GRIT_RANGE), 4096);
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
    for (let i = 0; i < d.length; i++) d[i] /= peak || 1;
    return b;
  };
  // 808-style metallic square cluster, highpassed and softened
  const metal = (d, decay, ratio, hp = 6500) => {
    const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * ratio);
    let lp1 = 0, lp2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let x = 0;
      for (const f of fr) x += (f * t) % 1 < 0.5 ? 1 : -1;
      x = x / 6 + noise() * 0.5;
      lp1 += lpK(hp) * (x - lp1);
      const h = x - lp1;
      lp2 += lpK(10000) * (h - lp2);
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
  // shaker: a grain of band-passed noise with a soft attack
  B.shaker = mono(0.1, (d) => {
    let lpA = 0, lpB = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, x = noise();
      lpA += lpK(4500) * (x - lpA);
      lpB += lpK(11000) * ((x - lpA) - lpB);
      d[i] = lpB * Math.min(1, t / 0.006) * Math.exp(-t / 0.028);
    }
  });
  // rim: a woody click with a short pitched ring
  B.rim = mono(0.12, (d) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = Math.tanh(2 * (Math.sin(2 * Math.PI * 1720 * t) * Math.exp(-t / 0.011) + Math.sin(2 * Math.PI * 520 * t) * Math.exp(-t / 0.02) * 0.6
        + noise() * Math.exp(-t / 0.0015) * 0.6));
    }
  });
  // clank: an industrial hit, low metal with a ringing partial
  B.clank = mono(0.45, (d) => {
    metal(d, 0.07, 0.9, 1800);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] += (Math.sin(2 * Math.PI * 1130 * t) + 0.6 * Math.sin(2 * Math.PI * 1789 * t)) * Math.exp(-t / 0.12) * 0.05;
    }
  });
  // swell: a cymbal played backwards, into a downbeat
  B.swell = mono(SWELL, (d) => {
    metal(d, 0.5, 2.3);
    d.reverse();
    for (let i = 0; i < 64; i++) d[d.length - 1 - i] *= i / 64;
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
    // a mono voice: oscillators [type, detune] -> lowpass -> VCA
    const voice = (spec, cut, Q) => {
      const F = filt('lowpass', cut, Q), V = gain(0);
      const o = spec.map(([type, det]) => { const x = osc(type, det); x.connect(F); return x; });
      F.connect(V);
      return { o, F, V };
    };
    this.gainNode = gain;

    // buses: drums (dry) + duck (sidechained synths) -> mix -> tone -> grit (dry + driven) -> glue compressor ->
    // safety clip -> out
    this.out = gain(MIX.out);
    this.out.connect(dest);
    this.mix = gain(0); // the first bar fades in (setLevel)
    this.tone = filt('lowpass', OPEN, 0.6); // the fades between parts close and open it (see fade)
    const comp = ctx.createDynamicsCompressor();
    for (const [k, v] of Object.entries({ threshold: -12, knee: 8, ratio: 3, attack: 0.005, release: 0.15 })) comp[k].value = v;
    chain(this.mix, filt('highpass', 28), this.tone);
    // the grit: the mix driven into a tanh (oversampled: no fizz from aliasing), its lows driven less (a shelf down
    // before, the same back up after: the clean part of it stays in phase with the dry), its top cut, its level
    // matched to the dry one, blended in (setGrit)
    const shelf = (g) => { const f = filt('lowshelf', GRIT.shelf[0]); f.gain.value = g; return f; };
    this.gritDry = gain(1);
    this.gritPre = gain(1 / GRIT_RANGE);
    this.gritTone = filt('lowpass', GRIT.tone[0], 0.5);
    this.gritWet = gain(0);
    const drive = shaper(GRIT_CURVE);
    drive.oversample = '4x';
    chain(this.tone, this.gritDry, comp);
    chain(this.tone, shelf(-GRIT.shelf[1]), this.gritPre, drive, shelf(GRIT.shelf[1]), this.gritTone, this.gritWet, comp);
    chain(comp, shaper(CLIP), this.out);
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

    // bass: two detuned saws -> resonant lowpass -> VCA -> drive; mono sine sub on its own VCA; and the growl, a
    // fuzzed, band-passed copy of it (the angry mid of the fights)
    const bass = voice([['sawtooth', -9], ['sawtooth', 9]], 200, 4);
    [this.bassO, this.bassF, this.bassV] = [bass.o, bass.F, bass.V];
    chain(this.bassV, shaper(DRIVE), filt('highpass', 32), gain(MIX.bassOut), this.duck);
    this.subO = osc('sine');
    this.subV = gain(0);
    chain(this.subO, this.subV, this.duck);
    this.growl = gain(0);
    chain(this.bassV, gain(3), shaper(FUZZ), filt('bandpass', 850, 1.1), filt('lowpass', 3200), this.growl, this.duck);

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
    this.arpVc = voice([['sawtooth', -4], ['square', 4]], 1500, 3);
    const arpOut = chain(this.arpVc.V, filt('highpass', 300));
    arpOut.connect(this.duck);
    chain(arpOut, gain(0.6), this.delay);
    // the calm's pulse: a soft saw + triangle, muted by its lowpass, a little of it in the delay
    this.pulseVc = voice([['sawtooth', -5], ['triangle', 5]], 600, 2);
    const pulseOut = chain(this.pulseVc.V, filt('highpass', 70));
    pulseOut.connect(this.duck);
    chain(pulseOut, gain(0.35), this.delay);

    // rave stab: 4 notes x 2 saws -> enveloped lowpass -> VCA -> drive -> highpass, some hall and delay
    this.stabO = [];
    this.stabF = filt('lowpass', 3000, 1.6);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const o = osc('sawtooth', s * 8); o.connect(this.stabF); this.stabO.push(o); }
    this.stabV = gain(0);
    const stabOut = chain(this.stabF, this.stabV, shaper(DRIVE), filt('highpass', 180), gain(MIX.stab));
    stabOut.connect(this.duck);
    chain(stabOut, gain(0.35), this.verb);
    chain(stabOut, gain(0.25), this.delay);

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
    // hook: the lead doubled an octave up at the top of a chain, a hollow square, mostly wet
    this.hookVc = voice([['square', 0], ['sawtooth', 7]], 3200, 0.8);
    const hookOut = chain(this.hookVc.V, filt('highpass', 400));
    hookOut.connect(this.duck);
    chain(hookOut, gain(0.35), this.delay);
    chain(hookOut, gain(0.3), this.verb);

    // the jukebox: a reedy organ and a round bass through a small boxy speaker, outside the song's level and fades
    this.juke = gain(0);
    this.jukeIn = gain(1);
    chain(this.jukeIn, filt('highpass', 320), filt('lowpass', 2800), this.juke, this.out);
    this.jukeV = gain(0);
    this.jukeO = [osc('square', -5), osc('triangle', 5)];
    const jukeF = filt('lowpass', 1900, 2);
    for (const o of this.jukeO) o.connect(jukeF);
    chain(jukeF, this.jukeV, this.jukeIn);
    this.jukeB = osc('triangle');
    this.jukeBV = gain(0);
    chain(this.jukeB, this.jukeBV, this.jukeIn);
  }

  jukeNote(t, m, dur, v) {
    for (const o of this.jukeO) o.frequency.setValueAtTime(mtof(m), t);
    env(this.jukeV.gain, t, dur, MIX.juke * v, 0.004, 0.03);
  }

  jukeBass(t, m, dur) {
    this.jukeB.frequency.setValueAtTime(mtof(m), t);
    env(this.jukeBV.gain, t, dur, MIX.juke * 1.5, 0.004, 0.02);
  }

  setJuke(t, v) { this.juke.gain.setTargetAtTime(v * MIX.jukeOut, t, 0.2); }

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

  setGrowl(t, v) { this.growl.gain.setTargetAtTime(MIX.growl * v, t, 0.05); }

  // the mix driven into its saturation, g 0..1 (score.js gritDrive), gliding there from t
  setGrit(t, g) {
    const d = gritDrive(g), tau = GRIT.glide / 3;
    this.gritPre.gain.setTargetAtTime(d.pre / GRIT_RANGE, t, tau);
    this.gritWet.gain.setTargetAtTime(d.wet * d.makeup, t, tau);
    this.gritDry.gain.setTargetAtTime(d.dry, t, tau);
    this.gritTone.frequency.setTargetAtTime(d.tone, t, tau);
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

  // a struck note on a mono voice: VCA and lowpass snap open, then fall with `decay`
  pluck(vc, t, m, peak, decay, cut, attack = 0.002) {
    const f = mtof(m);
    for (const o of vc.o) o.frequency.setValueAtTime(f, t);
    const g = vc.V.gain;
    g.setTargetAtTime(peak, t, attack);
    g.setTargetAtTime(0, t + attack * 6, decay);
    const q = vc.F.frequency;
    q.setTargetAtTime(cut, t, 0.002);
    q.setTargetAtTime(cut * 0.25, t + 0.01, decay * 0.8);
  }

  arp(t, m, v, decay, cut) { this.pluck(this.arpVc, t, m, MIX.arp * v, decay, cut); }

  pulse(t, m, v, decay, cut) { this.pluck(this.pulseVc, t, m, MIX.pulse * v, decay, cut, 0.006); }

  // the chord struck on the stab voice (4 notes)
  stab(t, notes, v, decay, cut) {
    notes.forEach((m, i) => { for (const o of [this.stabO[2 * i], this.stabO[2 * i + 1]]) o.frequency.setValueAtTime(mtof(m), t); });
    const g = this.stabV.gain;
    g.setTargetAtTime(0.3 * v, t, 0.002);
    g.setTargetAtTime(0, t + 0.015, decay);
    const q = this.stabF.frequency;
    q.setTargetAtTime(cut, t, 0.002);
    q.setTargetAtTime(cut * 0.15, t + 0.01, decay * 0.9);
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

  hook(t, m, dur, v = 1) {
    for (const o of this.hookVc.o) o.frequency.setValueAtTime(mtof(m), t);
    env(this.hookVc.V.gain, t, dur * 0.9, MIX.hook * v, 0.008, 0.05);
  }

  // ---- one-shots (a buffer source + a gain each); offset: start that far into the sample
  hit(name, t, v, { rate = 1, gate = false, verb = false, to = this.drums, offset = 0 } = {}) {
    const src = this.ctx.createBufferSource(), g = this.gainNode(v);
    src.buffer = this.buf[name];
    src.playbackRate.value = rate;
    src.connect(g);
    g.connect(to);
    if (gate) g.connect(this.gateIn);
    if (verb) g.connect(this.verb);
    this.live++;
    src.onended = () => { g.disconnect(); this.live--; };
    src.start(t, offset);
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

  // the reversed cymbal, timed to end on `t` (cut short if that is too soon)
  swell(t, now) {
    const t0 = t - SWELL;
    this.hit('swell', Math.max(t0, now), MIX.swell, { verb: true, offset: Math.max(0, now - t0) });
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

  setLevel(t, v, glide = 0.3) { this.mix.gain.setTargetAtTime(v * MIX.bus, t, glide); }

  // the fades between parts: the whole mix muffled down to `close` Hz from step `at` over `dur` bars, or opened up
  // from `from` Hz over `open` bars (0: at once)
  fade(t0, { from, open, close, at = 0, dur = 1 }) {
    const f = this.tone.frequency;
    if (close) {
      const t = t0 + at * STEP;
      f.setValueAtTime(OPEN, t);
      f.exponentialRampToValueAtTime(close, t + dur * BAR);
    } else if (!open) f.setValueAtTime(OPEN, t0);
    else {
      f.setValueAtTime(from, t0);
      f.exponentialRampToValueAtTime(OPEN, t0 + open * BAR);
    }
  }

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

// a bass-like line on this bar's chords: R root (accent) r root (ghost) O octave F fifth 7 seventh, A chromatic
// approach to the next bar's bass, '-' ties; `oct` semitones over the bass register
function line(pat, chordAt, next, oct = 0) {
  const out = [];
  for (let s = 0; pat && s < 16; s++) {
    const tok = pat[s];
    if (tok === '.' || tok === '-') continue;
    let len = 1;
    while (pat[s + len] === '-') len++;
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
    out.push({ s, m: m + oct, len, gate: len > 1 ? len * 0.92 : 0.55, v });
  }
  return out;
}

// the calm's breathing: a swell and a sink over two bars (bar b, step s), 0.35..1
const breath = (b, s) => 0.35 + 0.65 * Math.sin((Math.PI * ((b % 2) * 16 + s)) / 32);

// ---------------------------------------------------------------- conductor
export default class Synthwave {
  // ctx/dest default to the game's Audio context and its music bus (resolved on start)
  constructor(ctx = null, dest = null) {
    this.ctx = ctx;
    this.dest = dest;
    this.playing = false;
    this.target = 0;    // requested intensity
    this.level = 0;     // smoothed intensity, moves once per bar
    this.combat = false; // the game is fighting: the combat form plays (see _tick)
    this.combo = 0;     // kills in the player's chain
    this.jukebox = 0;   // how well the bar's jukebox is heard (see setJukebox)
    this.stage = 0;     // layers it has brought in: up at once, down a step a bar
    this.sting = false; // the bar being planned lands a stinger
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

  // true while the game fights: the song (not the menu) hands over to its combat form, and back afterwards
  setCombat(on) { this.combat = !!on; }

  // kills in the player's chain: each one brings a layer of the fight in and a little volume, up to STAGES; when
  // the chain breaks they go one by one, a bar apart
  setCombo(n) { this.combo = n || 0; }

  // how well the bar's jukebox is heard from where the player stands (0 = not at all): its band plays along
  setJukebox(v) { this.jukebox = clamp(v || 0, 0, 1); }

  _open(ctx) {
    if (this.bufCtx !== ctx) { this.buf = makeBuffers(ctx); this.bufCtx = ctx; }
    this.S = new Session(ctx, this.buf, this.dest || Audio.music);
    this.playing = true;
    this.form = null;
    this.level = this.target;
    this.nextBar = ctx.currentTime + 0.1;
    this.cued = false;   // the fight cue played: the combat form is due on the next bar line
    this.out = false;    // the bar being planned is the last of a fight
    this.fightBars = 0;  // bars of the combat form played in a row
    this.stage = 0;
    this.fresh = false;  // the bar being planned is the first of a new form
  }

  _tick(until) {
    const now = this.S.ctx.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.05; // timer was throttled (background tab): resync, don't burst
    this.S.setJuke(now, this.target > 0 ? this.jukebox : 0);
    // a fight breaks out: announce it over the bars already scheduled, the combat form takes over on the next bar line
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
        this.fresh = true;
      }
      this.cued = false;
      this.level += (this.target - this.level) * 0.5;
      const top = Math.min(STAGES, this.combo), was = this.stage;
      this.stage = top >= this.stage ? top : this.stage - 1;
      this.sting = this.form === FORMS.combat && !this.out && STINGS.some((n) => was < n && this.stage >= n);
      const p = this._plan();
      this.fresh = false;
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

  // index of the section after the current one: a `hot` section (the fight's chase) only comes while it is hot
  _after() {
    let n = (this.pos + 1) % this.form.length;
    if (SECTIONS[this.form[n]].hot && this.level < HOT) n = (n + 1) % this.form.length;
    return n;
  }

  // fight cue, laid over what is left of the bars already scheduled: a riser, a reversed cymbal and a snare roll
  // into the downbeat
  _cue(now) {
    const t0 = now + 0.03, t1 = this.nextBar, n = Math.min(8, Math.floor((t1 - t0) / STEP));
    if (n < 1) return;
    this.S.sweep(t0, t1 - t0, 400, 7000);
    this.S.swell(t1, t0);
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
    const game = this.form === FORMS.game, fight = this.form === FORMS.combat, st = game || fight ? this.stage : 0;
    const heat = clamp((this.level - 0.85) / 0.15, 0, 1); // how much hotter than a plain alert the fight is
    const e = fight ? sec.energy * (0.55 + 0.37 * st / STAGES + 0.08 * heat)
      : Math.min(1, sec.energy * (game ? 0.55 + 0.45 * this.level + 0.06 * st : 1));
    const last = this.out || b === SECTION_BARS - 1; // last bar before another section
    const after = this.out ? FORMS.game[AFTERMATH] : this.form[this._after()];
    const on = (layer) => b >= (sec.enter?.[layer] ?? 0) && st >= (sec.from?.[layer] ?? 0);
    // a list is read by stage in a fight, by energy elsewhere
    const pick = (list, bias = 0) => (list?.length
      ? list[clamp(Math.floor((fight ? st / (STAGES + 1) : e) * list.length) + bias, 0, list.length - 1)] : null);
    // this bar's pattern (or value) of a layer, null while it is out
    const part = (layer, bias = 0) => {
      if (!on(layer)) return null;
      if (sec.bars && layer in sec.bars) return sec.bars[layer][b] ?? null;
      const v = sec[layer];
      return Array.isArray(v) ? pick(v, bias) : v ?? null;
    };
    const vary = (pass + (b >> 2)) % 2; // alternates every 4 bars and every pass

    const chords = this._chordsAt(name, b);
    for (const c of chords) c.voicing = this.voicing = voiceLead(c.ch, this.voicing);
    const slot = (s) => (s >= 8 ? chords[chords.length - 1] : chords[0]);
    const chordAt = (s) => slot(s).ch;
    const next = this._chordsAt(last ? after : name, last ? 0 : b + 1)[0].ch;

    // ---- drums
    const kick = hits(KICK[part('kick')]);
    let snare = hits(SNARE[part('snare')]);
    let hat = hits(HATS[part('hats', fight || b >= 2 ? 0 : -1)]);
    let tom = [];
    let fill = null;
    // at the top of a chain the fight rolls into every fourth bar: 32nd notes swelling over its second half
    const roll = fight && st >= STAGES - 1 && b % 4 === 3 && !this.out && !sec.bars?.snare;
    if (roll) { snare = snare.filter((h) => h.s < 8); hat = hat.filter((h) => h.s < 8 || h.ch !== 'o'); }
    else if (sec.fills && last) fill = FILLS[['roll', 'toms', 'toms2', 'flam'][Math.floor(r() * 4)]];
    else if (sec.fills && b % 4 === 3 && r() < (sec.fillRate ?? 0.6)) fill = FILLS[r() < 0.5 ? 'small' : 'flam'];
    if (fill) {
      const from = Math.min(...[fill.snare, fill.tom].filter(Boolean).map((p) => p.search(/[^.]/)));
      snare = snare.filter((h) => h.s < from).concat(hits(fill.snare));
      hat = hat.filter((h) => h.s < from);
      tom = hits(fill.tom);
    }
    const clap = sec.clap ? snare.filter((h) => h.v > 0.8) : [];
    const perc = [];
    if (on('perc')) {
      for (const [buf, pat, from = 0] of sec.perc || []) {
        if (st < from) continue;
        for (const h of hits(PERC[pat])) if (!fill || buf !== 'tom' || h.s < 8) perc.push({ buf, s: h.s, v: h.v, ch: h.ch });
      }
    }

    // ---- bass, and the calm's pulse an octave up, breathing
    const bass = line(BASS[part('bass', fight ? 0 : -vary)], chordAt, next);
    const pulse = line(PULSE[part('pulse')], chordAt, next, 12);
    if (sec.breathe) for (const n of pulse) n.v *= breath(b, n.s);

    // ---- arp: pattern and inversion rotate every 4 bars / pass, octave answer at phrase ends
    const arp = [];
    const apat = sec.bars && 'arp' in sec.bars ? (on('arp') ? ARP[sec.bars.arp[b]] : null)
      : sec.arp && on('arp') ? ARP[sec.arp[(pass + (sec.arpEach ? b : b >> 2)) % sec.arp.length]] : null;
    if (apat && e >= 0.2) {
      const base = [60, 63, 58][(pass * 2 + (b >> 2)) % 3];
      for (let s = 0; s < 16; s++) {
        if (apat[s] === '.') continue;
        const pool = arpPool(chordAt(s), base);
        const up = b % 4 === 3 && s >= 8 && e > 0.5 ? 12 : 0;
        const v = (s % 4 === 0 ? 1 : 0.7) * (0.9 + 0.2 * r()) * (sec.breathe ? breath(b, s) : 1);
        arp.push({ s, m: pool[+apat[s]] + up, v });
      }
    }

    // ---- stabs: the bar's chord (the top four notes of the pad's voicing) struck on the pattern
    const stab = hits(STABS[part('stab')]).map((h) => ({ s: h.s, v: h.v, notes: slot(h.s).voicing.slice(1) }));

    // ---- lead (when the section allows it and intensity is high enough), doubled an octave up at the top
    let lead = [];
    const phrase = sec.lead && LEADS[sec.lead][b];
    if (phrase && on('lead') && this.level >= (sec.leadMin ?? 0) && pass >= (sec.leadPass ?? 0)) {
      const oct = sec.lead !== 'answers' && pass % 2 === 1 && b < 4 ? -12 : sec.lead === 'answers' && vary ? -12 : 0;
      lead = phrase.map(([s, m, len]) => ({ s, m: m + oct, len }));
    }
    const hook = on('hook') ? lead.map((n) => ({ ...n, m: n.m + 12 <= 96 ? n.m + 12 : n.m })) : [];

    // fades between parts (Session.fade): a new form comes in muffled and opens up, a fight excepted (it hits at
    // once and closes down over its last bar); a section of the song closes a little over its last half bar and
    // opens again over the next, a drop at once; the fight's breakdown opens up over its whole length
    let fade = null;
    if (this.fresh) fade = fight ? { open: 0 } : { from: 500, open: FADE_BARS };
    else if (this.out) fade = { close: 700 };
    else if (fight && b === 0 && sec.down) fade = { from: 900, open: SECTION_BARS };
    else if (game && b === 0) fade = sec.impact ? { open: 0 } : { from: 2400, open: 1 };
    else if (game && last && !sec.riser && !SECTIONS[after].impact) fade = { close: 2400, at: 8, dur: 0.5 };

    // ---- the jukebox's band, on this bar's chords (only planned while it is heard)
    let juke = null;
    if (this.jukebox > 0.02 && this.target > 0) {
      juke = { tune: [], bass: [] };
      const tune = JUKE.tunes[(pass + b) % JUKE.tunes.length];
      for (let s = 0; s < 16; s++) {
        const c = chordAt(s), root = bassMidi(c.bass) + 12;
        if (tune[s] !== '.') juke.tune.push({ s, m: arpPool(c, 65)[+tune[s]], len: 2, v: s % 8 ? 0.8 : 1 });
        const tok = JUKE.bass[s];
        if (tok !== '.') juke.bass.push({ s, m: tok === 'O' ? root + 12 : tok === 'F' ? chordTone(c, root + 7) : root, len: 2 });
      }
    }

    const bite = part('bite') ?? 1;
    // the grit: the section's, and in a fight the heat on top of it
    const grit = Math.min(GRIT.max, (part('grit') ?? 0) + (fight ? GRIT.heat * heat : 0));
    const nextSec = SECTIONS[after];
    const plan = {
      name, pass, bar: b, e, stage: st, chords, kick, snare, clap, hat, tom, perc, bass, pulse, arp, stab, lead, hook,
      growl: part('growl') ?? 0, grit, level: sec.level * (1 + STAGE_GAIN * st), duck: sec.duck, pad: sec.pad, leadVol: sec.leadVol ?? 1,
      padCut: (300 + 2400 * e) * (sec.padCut ?? 1) * (sec.sweep ? 0.35 + 0.65 * (b / 7) : 1) * (fight ? 0.8 + 0.1 * st : 1),
      bassCut: [(90 + 260 * e) * bite, (500 + 2200 * e) * bite], arpDecay: sec.arpDecay ?? 0.05 + 0.1 * e,
      arpCut: (1200 + 3200 * e) * bite * (sec.breathe ? 0.45 : 1), pulseCut: 380 + 900 * e,
      stabDecay: 0.07 + 0.06 * e, stabCut: (1800 + 3600 * e) * Math.min(bite, 1.6),
      juke, roll, fade, glide: this.fresh && !fight ? BAR : 0.3,
      crash: (b === 0 && sec.crash) || (fight && st >= STAGES - 1 && b % 4 === 0), impact: b === 0 && sec.impact, down: b === 0 && sec.down,
      riser: sec.riser && b === SECTION_BARS - sec.riser ? sec.riser : 0,
      swell: (game || fight) && last && !this.out && !!(nextSec.crash || nextSec.impact),
      stinger: this.sting,
    };
    if (plan.stinger) plan.stab = plan.stab.filter((h) => h.s >= 4); // the stinger owns the stab voice for a beat
    if (sec.breath && b === SECTION_BARS - 1) {
      for (const k of ['kick', 'snare', 'clap', 'hat', 'tom', 'perc', 'bass', 'pulse', 'arp', 'stab', 'lead', 'hook']) plan[k] = plan[k].filter((h) => h.s < 12);
    }
    return plan;
  }

  _play(t0, p) {
    const S = this.S, at = (s) => t0 + s * STEP;
    S.setLevel(t0, p.level, p.glide);
    if (p.fade) S.fade(t0, p.fade);
    S.padLevel(t0, p.pad, p.padCut);
    S.setGrowl(t0, p.growl);
    S.setGrit(t0, p.grit);
    for (const c of p.chords) S.chord(at(c.s), c.voicing);
    for (const n of p.bass) S.bass(at(n.s), n.m, n.gate * STEP, n.v, p.bassCut[0], p.bassCut[1]);
    for (const n of p.pulse) S.pulse(at(n.s), n.m, n.v, 0.09 + 0.08 * p.e, p.pulseCut * (0.6 + 0.6 * n.v));
    for (const n of p.arp) S.arp(at(n.s), n.m, n.v, p.arpDecay, p.arpCut);
    for (const h of p.stab) S.stab(at(h.s), h.notes, h.v, p.stabDecay, p.stabCut);
    for (const n of p.lead) S.lead(at(n.s), n.m, n.len * STEP, p.leadVol);
    for (const n of p.hook) S.hook(at(n.s), n.m, n.len * STEP);

    for (const h of p.kick) {
      S.hit('kick', at(h.s), MIX.kick * h.v);
      if (p.duck < 1) S.pump(at(h.s), p.duck);
    }
    const r = rng(Math.floor(t0 * 1000));
    const swing = (s) => (s % 2 ? SWING * STEP : 0);
    for (const h of p.hat) {
      const t = at(h.s) + swing(h.s), v = h.v * (0.85 + 0.3 * r());
      if (h.ch === 'o') S.hit('ohat', t, MIX.ohat * v); else S.hit('hat', t, MIX.hat * v);
    }
    for (const h of p.perc) {
      const tom = h.buf === 'tom';
      S.hit(h.buf, at(h.s) + (h.buf === 'shaker' ? swing(h.s) : 0), MIX[h.buf] * (tom ? 0.7 : h.v) * (0.9 + 0.2 * r()),
        { rate: tom ? TOM_RATE[h.ch] * 1.2 : 1, verb: tom || h.buf === 'clank' });
    }
    for (const h of p.snare) S.hit('snare', at(h.s), MIX.snare * h.v, { gate: true });
    for (const h of p.clap) S.hit('clap', at(h.s) + 0.006, MIX.clap * h.v, { gate: true });
    for (const h of p.tom) S.hit('tom', at(h.s), MIX.tom, { rate: TOM_RATE[h.ch], verb: true });
    // gated reverb: one open window per cluster of snare hits
    let g0 = -1, g1 = -1;
    for (const h of p.snare) {
      const t = at(h.s);
      if (t > g1) { if (g1 > 0) S.gateOpen(g0, g1); g0 = t; }
      g1 = t + GATE_HOLD;
    }
    if (g1 > 0) S.gateOpen(g0, g1);
    if (p.roll) {
      for (let k = 0; k < 16; k++) S.hit('snare', at(8 + k / 2), MIX.snare * (0.25 + 0.75 * (k / 15) ** 1.6), { gate: true, rate: 1 + k * 0.006 });
      S.gateOpen(at(8), at(16));
    }

    if (p.juke) {
      for (const n of p.juke.tune) S.jukeNote(at(n.s), n.m, n.len * STEP, n.v);
      for (const n of p.juke.bass) S.jukeBass(at(n.s), n.m, n.len * STEP);
      for (const [name, pat] of JUKE.drums) for (const h of hits(pat)) S.hit(name, at(h.s), MIX[name] * h.v * MIX.jukeDrums, { to: S.jukeIn });
    }

    if (p.crash) S.hit('crash', t0, MIX.crash, { verb: true });
    if (p.impact) S.hit('kick', t0, MIX.impact, { rate: 0.5, verb: true });
    if (p.down) S.sweep(t0, BAR, 6000, 150);
    if (p.riser) S.sweep(t0, p.riser * BAR, 250, 7000);
    if (p.swell) S.swell(t0 + BAR, t0);
    // a big kill chain: a boom, a crash and the chord struck wide open, ringing for a beat
    if (p.stinger) {
      S.hit('kick', t0, MIX.impact * 1.2, { rate: 0.45, verb: true });
      if (!p.crash) S.hit('crash', t0, MIX.crash * 1.2, { verb: true });
      S.stab(t0, p.chords[0].voicing.slice(1), 1.5, 0.35, 7000);
    }
  }
}

