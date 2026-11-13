// Procedural futurewave track: supersaw pads with sidechain pumping, rolling bass, ping-pong arps,
// gated-reverb snare, supersaw lead, risers. Song form: intro / verse / chorus / break / build, looped.
import Audio from './Audio.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BPM = 116;

const CHORDS = {
  Fm9: { root: 41, pad: [53, 56, 60, 63, 67], arp: [65, 68, 72, 75, 79] },
  Dbmaj7: { root: 37, pad: [49, 53, 56, 60, 65], arp: [61, 65, 68, 72, 77] },
  Abmaj7: { root: 44, pad: [51, 56, 60, 63, 67], arp: [63, 68, 72, 75, 79] },
  Eb6: { root: 39, pad: [51, 55, 58, 60, 63], arp: [63, 67, 70, 72, 75] },
  Bbm9: { root: 46, pad: [53, 58, 61, 65, 68], arp: [65, 70, 73, 77, 80] },
  C7sus: { root: 36, pad: [52, 55, 58, 60, 65], arp: [64, 67, 70, 72, 77] },
};
const P1 = ['Fm9', 'Dbmaj7', 'Abmaj7', 'Eb6'];
const P2 = ['Fm9', 'Bbm9', 'Dbmaj7', 'C7sus'];

// [section, progression] for each 4-bar block of the 32-bar song
const FORM = [
  ['intro', P1], ['intro', P1],
  ['verse', P1], ['verse', P2],
  ['chorus', P1], ['chorus', P1],
  ['break', P2], ['build', P1],
];

// chorus lead: per bar, [step, midi, length in 16ths]
const MELODY = [
  [[0, 72, 2], [2, 75, 2], [4, 79, 4], [8, 77, 2], [10, 75, 2], [12, 72, 4]],
  [[0, 77, 3], [3, 80, 3], [6, 77, 2], [8, 75, 4], [12, 72, 2], [14, 73, 2]],
  [[0, 75, 4], [4, 72, 2], [6, 75, 2], [8, 79, 4], [12, 80, 4]],
  [[0, 79, 6], [6, 77, 2], [8, 75, 8]],
  [[0, 72, 2], [2, 75, 2], [4, 79, 4], [8, 77, 2], [10, 75, 2], [12, 84, 4]],
  [[0, 82, 3], [3, 80, 3], [6, 77, 2], [8, 80, 4], [12, 77, 4]],
  [[0, 75, 2], [2, 77, 2], [4, 79, 2], [6, 80, 2], [8, 84, 6], [14, 82, 2]],
  [[0, 79, 8], [8, 77, 4], [12, 75, 4]],
];
const ARP = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 4, 3, 1, 3, 2, 4];
const HAT_VEL = [0.5, 0.15, 0.3, 0.15, 0.5, 0.15, 0.3, 0.2, 0.5, 0.15, 0.3, 0.15, 0.5, 0.15, 0.35, 0.25];

function impulse(ctx, seconds, decay, gated = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = gated ? (t < 0.85 ? 1 - t * 0.3 : (1 - t) * 4) : Math.pow(1 - t, decay);
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

class Music {
  constructor() {
    this.playing = false;
    this.intensity = 0;
    this.pending = null;
    this.bar = 0;
    this.step = 0;
  }

  _setup() {
    const ctx = Audio.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(Audio.music);

    // synth bus with sidechain ducking
    this.duck = ctx.createGain();
    this.duck.connect(this.out);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 3.2, 2.6);
    const rvGain = ctx.createGain();
    rvGain.gain.value = 0.55;
    this.reverb.connect(rvGain);
    rvGain.connect(this.duck);

    this.gated = ctx.createConvolver();
    this.gated.buffer = impulse(ctx, 0.42, 1, true);
    const gGain = ctx.createGain();
    gGain.gain.value = 0.5;
    this.gated.connect(gGain);
    gGain.connect(this.out);

    // stereo ping-pong delay (dotted eighth)
    const dt = (60 / BPM) * 0.75;
    this.delayIn = ctx.createGain();
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2);
    dl.delayTime.value = dt; dr.delayTime.value = dt;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3200;
    const merger = ctx.createChannelMerger(2);
    this.delayIn.connect(tone); tone.connect(dl);
    dl.connect(dr); dr.connect(fb); fb.connect(dl);
    dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
    const dGain = ctx.createGain(); dGain.gain.value = 0.45;
    merger.connect(dGain); dGain.connect(this.duck);

    // slow filter sweep shared by pads
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 1800;
    this.padFilter.Q.value = 2;
    this.padFilter.connect(this.duck);
    this.padFilter.connect(this.reverb);
    this.ready = true;
  }

  start() {
    if (!Audio.ctx || this.playing) return;
    if (!this.ready) this._setup();
    this.playing = true;
    this.nextTime = Audio.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
  }

  // 0 = menu (intro loop), 1 = in game (full song). Applied on the next bar.
  setIntensity(v) {
    this.pending = v === this.intensity ? null : v;
  }

  _schedule() {
    const ctx = Audio.ctx;
    const sd = 60 / BPM / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      if (this.step === 0 && this.pending !== null) {
        this.intensity = this.pending;
        this.pending = null;
        this.bar = this.intensity ? 8 : 0; // jump straight into the verse when a run starts
      }
      this._play(this.nextTime, sd);
      this.nextTime += sd;
      this.step++;
      if (this.step === 16) {
        this.step = 0;
        this.bar++;
        if (this.intensity === 0 && this.bar >= 8) this.bar = 0;
        if (this.bar >= 32) this.bar = 8;
      }
    }
  }

  _play(t, sd) {
    const s = this.step;
    const [section, prog] = FORM[Math.floor(this.bar / 4)];
    const bi = this.bar % 4;
    const chord = CHORDS[prog[bi]];
    const full = section === 'verse' || section === 'chorus';
    const chorus = section === 'chorus';

    // ---- drums
    if (section !== 'break') {
      const kick = section === 'intro' ? s === 0 || s === 8 : s % 4 === 0;
      if (kick) { this._kick(t, section === 'intro' ? 0.6 : 1); this._pump(t); }
    }
    if (full || section === 'build') {
      if (s === 4 || s === 12) this._snare(t, chorus);
      if (section !== 'build') this._hat(t, HAT_VEL[s] * (chorus ? 1.1 : 0.85), chorus && s % 4 === 2);
    }
    if (section === 'build') {
      // snare roll that accelerates through the 4 bars
      const div = bi < 2 ? 4 : bi === 2 ? 2 : 1;
      if (s % div === 0) this._snare(t, false, 0.25 + (bi * 16 + s) / 64 * 0.6);
      if (bi === 0 && s === 0) this._riser(t, sd * 64);
    }
    if (s === 0 && (this.bar === 16 || this.bar === 8 || this.bar === 24)) this._crash(t);

    // ---- bass: rolling 16ths with octave jumps
    if (section !== 'intro' && section !== 'break') {
      const oct = s % 4 === 2 ? 12 : 0;
      this._bass(t, chord.root + oct, sd * 0.9, s % 4 === 0 ? 1 : 0.7);
    } else if (section === 'break' && s % 8 === 0) {
      this._bass(t, chord.root, sd * 7, 0.6);
    }

    // ---- pads
    if (s === 0) {
      this._pad(t, chord.pad, sd * 16, section === 'break' ? 0.07 : 0.05);
      const f = this.padFilter.frequency;
      f.cancelScheduledValues(t);
      if (section === 'break' || section === 'build') {
        f.setValueAtTime(500 + bi * 600, t);
        f.linearRampToValueAtTime(900 + bi * 900, t + sd * 16);
      } else f.setTargetAtTime(chorus ? 3200 : 1700, t, 0.4);
    }

    // ---- arp
    const arpNote = chord.arp[ARP[s]] + (chorus && s % 8 >= 4 ? 12 : 0);
    if (section !== 'build' || s % 2 === 0) this._arp(t, arpNote, sd * 0.8, section === 'intro' ? 0.045 : 0.06);

    // ---- chorus: stabs + lead
    if (chorus) {
      if (s === 6 || s === 14) this._stab(t, chord.pad, sd * 1.5);
      const mbar = (this.bar - 16) % 8;
      for (const [st, m, len] of MELODY[mbar]) if (st === s) this._lead(t, m, sd * len);
    }
  }

  // ---------- instruments ----------
  _env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  _pump(t) {
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.22, t);
    g.linearRampToValueAtTime(1, t + 0.24);
  }

  _kick(t, v) {
    const ctx = Audio.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    this._env(g, t, 0.002, 1.1 * v, 0.38);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + 0.4);
    const c = ctx.createOscillator(), cg = ctx.createGain();
    c.type = 'square'; c.frequency.value = 900;
    this._env(cg, t, 0.001, 0.15 * v, 0.015);
    c.connect(cg); cg.connect(this.out); c.start(t); c.stop(t + 0.03);
  }

  _snare(t, clap, v = 1) {
    const ctx = Audio.ctx;
    const n = ctx.createBufferSource(); n.buffer = Audio.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    const g = ctx.createGain(); this._env(g, t, 0.002, 0.5 * v, 0.2);
    n.connect(f); f.connect(g); g.connect(this.out); g.connect(this.gated);
    n.start(t, Math.random()); n.stop(t + 0.25);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    this._env(og, t, 0.002, 0.35 * v, 0.12);
    o.connect(og); og.connect(this.out); og.connect(this.gated); o.start(t); o.stop(t + 0.15);
    if (clap) {
      for (let i = 0; i < 3; i++) {
        const cn = ctx.createBufferSource(); cn.buffer = Audio.noise;
        const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 1200;
        const cg = ctx.createGain(); this._env(cg, t + i * 0.012, 0.001, 0.25, 0.05 + i * 0.03);
        cn.connect(cf); cf.connect(cg); cg.connect(this.out); cg.connect(this.gated);
        cn.start(t + i * 0.012, Math.random()); cn.stop(t + 0.2);
      }
    }
  }

  _hat(t, v, open) {
    const ctx = Audio.ctx;
    const n = ctx.createBufferSource(); n.buffer = Audio.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
    const g = ctx.createGain(); this._env(g, t, 0.001, 0.22 * v, open ? 0.22 : 0.045);
    n.connect(f); f.connect(g); g.connect(this.out);
    n.start(t, Math.random()); n.stop(t + 0.3);
  }

  _crash(t) {
    const ctx = Audio.ctx;
    const n = ctx.createBufferSource(); n.buffer = Audio.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
    const g = ctx.createGain(); this._env(g, t, 0.002, 0.2, 1.8);
    n.connect(f); f.connect(g); g.connect(this.out); g.connect(this.reverb);
    n.start(t); n.stop(t + 1.9);
  }

  _riser(t, dur) {
    const ctx = Audio.ctx;
    const n = ctx.createBufferSource(); n.buffer = Audio.noise; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.95); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(f); f.connect(g); g.connect(this.out); g.connect(this.reverb);
    n.start(t); n.stop(t + dur + 0.05);
  }

  _bass(t, m, dur, v) {
    const ctx = Audio.ctx;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 8;
    f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(160, t + Math.min(dur, 0.18));
    this._env(g, t, 0.004, 0.3 * v, dur);
    f.connect(g); g.connect(this.duck);
    for (const [type, det] of [['sawtooth', -7], ['square', 7]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.02);
    }
    const sub = ctx.createOscillator(), sg = ctx.createGain();
    sub.frequency.value = mtof(m - 12);
    this._env(sg, t, 0.004, 0.25 * v, dur);
    sub.connect(sg); sg.connect(this.duck); sub.start(t); sub.stop(t + dur + 0.02);
  }

  _supersaw(t, m, dur, out, { voices = 6, spread = 22, attack = 0.01, release = 0.1, peak = 0.05 } = {}) {
    const ctx = Audio.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    const oscs = [];
    for (let i = 0; i < voices; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = (i / (voices - 1) - 0.5) * 2 * spread;
      o.connect(g);
      o.start(t); o.stop(t + dur + 0.05);
      oscs.push(o);
    }
    return { g, oscs };
  }

  _pad(t, notes, dur, peak) {
    for (const m of notes) this._supersaw(t, m, dur, this.padFilter, { voices: 4, spread: 18, attack: 0.5, release: 0.6, peak: peak / notes.length * 2.2 });
  }

  _stab(t, notes, dur) {
    const ctx = Audio.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(600, t + dur);
    f.connect(this.duck); f.connect(this.delayIn);
    for (const m of notes) this._supersaw(t, m + 12, dur, f, { voices: 3, spread: 15, attack: 0.005, release: dur * 0.8, peak: 0.022 });
  }

  _arp(t, m, dur, peak) {
    const ctx = Audio.ctx;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    this._env(g, t, 0.003, peak, dur);
    o.connect(f); f.connect(g); g.connect(this.duck); g.connect(this.delayIn);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _lead(t, m, dur) {
    const ctx = Audio.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3400; f.Q.value = 1.5;
    f.connect(this.duck); f.connect(this.reverb); f.connect(this.delayIn);
    const { oscs } = this._supersaw(t, m, dur, f, { voices: 5, spread: 14, attack: 0.02, release: Math.min(0.25, dur * 0.4), peak: 0.06 });
    // delayed vibrato
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5.6;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(18, t + Math.min(0.35, dur));
    lfo.connect(depth);
    for (const o of oscs) depth.connect(o.detune);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    // little scoop into the note
    for (const o of oscs) {
      o.frequency.setValueAtTime(mtof(m - 1), t);
      o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.04);
    }
  }
}

export default new Music();
