// Procedural synthwave loop (kick / snare / hats / pumping bass / arp / pad).
import Audio from './Audio.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BPM = 116;
const PROG = [
  { root: 45, tones: [69, 72, 76] }, // Am
  { root: 41, tones: [65, 69, 72] }, // F
  { root: 48, tones: [64, 67, 72] }, // C
  { root: 43, tones: [62, 67, 71] }, // G
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 3, 2, 1, 0, 2];

class Music {
  constructor() {
    this.playing = false;
    this.step = 0;
    this.intensity = 0; // 0 menu, 1 game
  }

  _setup() {
    const ctx = Audio.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(Audio.music);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / BPM) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2200;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay);
    dl.connect(this.out);
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

  setIntensity(v) { this.intensity = v; }

  _schedule() {
    const ctx = Audio.ctx;
    const stepDur = 60 / BPM / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this._play(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  _play(step, t, sd) {
    const s = step % 16;
    const chord = PROG[Math.floor(step / 16)];
    const game = this.intensity >= 1;
    if (s % 4 === 0 && (game || s === 0 || s === 8)) this._kick(t, game ? 1 : 0.5);
    if (game && (s === 4 || s === 12)) this._snare(t);
    if (game && s % 2 === 0) this._hat(t, s % 4 === 2 ? 0.16 : 0.07);
    if (game && s % 2 === 1) this._hat(t, 0.04);
    if (game || step >= 32) this._bass(t, chord.root + (s % 4 === 2 ? 12 : 0), sd * 1.8, game ? 1 : 0.5);
    const tones = [...chord.tones, chord.tones[0] + 12];
    this._arp(t, tones[ARP[s]] + (step % 32 >= 16 && game ? 12 : 0), sd * 0.9);
    if (s === 0) this._pad(t, chord.tones, sd * 16);
  }

  _env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  _kick(t, v) {
    const ctx = Audio.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    this._env(g, t, 0.002, 0.9 * v, 0.32);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + 0.35);
  }

  _snare(t) {
    const ctx = Audio.ctx;
    const n = ctx.createBufferSource(); n.buffer = Audio.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1300;
    const g = ctx.createGain(); this._env(g, t, 0.002, 0.45, 0.22);
    n.connect(f); f.connect(g); g.connect(this.out); g.connect(this.delay);
    n.start(t, Math.random()); n.stop(t + 0.25);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    this._env(og, t, 0.002, 0.3, 0.12);
    o.connect(og); og.connect(this.out); o.start(t); o.stop(t + 0.15);
  }

  _hat(t, v) {
    const ctx = Audio.ctx;
    const n = ctx.createBufferSource(); n.buffer = Audio.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); this._env(g, t, 0.001, v, 0.05);
    n.connect(f); f.connect(g); g.connect(this.out);
    n.start(t, Math.random()); n.stop(t + 0.06);
  }

  _bass(t, m, dur, v) {
    const ctx = Audio.ctx;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(180, t + dur);
    // pumping (sidechain-like) envelope
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _arp(t, m, dur) {
    const ctx = Audio.ctx;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.frequency.value = 2600;
    this._env(g, t, 0.004, 0.07, dur);
    o.connect(f); f.connect(g); g.connect(this.out); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _pad(t, tones, dur) {
    const ctx = Audio.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.6);
    g.gain.setValueAtTime(0.06, t + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(this.out);
    for (const m of tones) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mtof(m - 12); o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }
}

export default new Music();
