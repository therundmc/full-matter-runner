// WebAudio sound system: sample playback for guns + procedural SFX.
import { rand, clamp } from '../engine/math.js';

const SAMPLES = {
  pistol: 'assets/sound/shots/pistol.wav',
  rifle: 'assets/sound/shots/rifle.wav',
  shotgun: 'assets/sound/shots/shotgun.wav',
  uzi: 'assets/sound/shots/cg1.wav',
};
const MAX_VOICES = 4;
// one clean shot cut out of each recording: [offset s, duration s]. The rifle file is a whole burst,
// playing it per bullet stacked a dozen bursts on top of each other.
const SLICES = {
  pistol: [0, 0.5],
  rifle: [0, 0.27],
  shotgun: [0, 0.4],
  uzi: [0, 0.22],
};
const FADE = 0.06;

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.voices = {};
    this.chokes = new WeakMap(); // emitter -> its last sample voice (a new shot cuts the previous tail)
    this.listener = { x: 0, y: 0 };
    this.muted = false;
  }

  // must be called from a user gesture
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.music = ctx.createGain();
    this.music.gain.value = 0.42;
    this.sfx.connect(this.filter);
    this.music.connect(this.filter);
    this.filter.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    await Promise.all(Object.entries(SAMPLES).map(async ([k, url]) => {
      try {
        const res = await fetch(url);
        this.buffers[k] = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { console.warn('sound load failed', k, e); }
    }));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // 0 = clear, 1 = heavily muffled (death / slow motion)
  setMuffle(amount) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(1 - clamp(amount, 0, 0.97), 3) + 300;
    this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  }

  _out(opts) {
    const ctx = this.ctx;
    let vol = opts.vol ?? 1;
    const g = ctx.createGain();
    let pan = 0;
    if (opts.x !== undefined) {
      const dx = opts.x - this.listener.x, dy = opts.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      vol *= clamp(1 - d / 1500, 0.08, 1);
      pan = clamp(dx / 700, -0.8, 0.8);
    }
    g.gain.value = vol;
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(opts.dest || this.sfx);
    } else g.connect(opts.dest || this.sfx);
    return g;
  }

  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.buffers[name]) return this._sample(name, opts);
    const fn = this['_' + name];
    if (fn) fn.call(this, this._out(opts), opts);
  }

  // one-shot sample playback: sliced, faded out, choked per emitter (opts.choke) and voice-limited per sound
  _sample(name, opts) {
    const ctx = this.ctx, now = ctx.currentTime;
    const buf = this.buffers[name];
    const [offset, len] = SLICES[name] || [0, buf.duration];
    const rate = (opts.rate ?? 1) * rand(0.94, 1.06);
    const dur = len / rate;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const out = this._out({ ...opts, vol: (opts.vol ?? 1) * 0.75 });
    const env = ctx.createGain();
    env.gain.setValueAtTime(1, now);
    env.gain.setValueAtTime(1, now + Math.max(0, dur - FADE));
    env.gain.linearRampToValueAtTime(0, now + dur);
    src.connect(env);
    env.connect(out);
    src.start(now, offset, len + 0.02);
    const voice = { src, env };
    const kill = (v) => {
      v.env.gain.cancelScheduledValues(now);
      v.env.gain.setTargetAtTime(0, now, 0.008);
      try { v.src.stop(now + 0.05); } catch (e) { /* already stopped */ }
    };
    if (opts.choke) {
      const prev = this.chokes.get(opts.choke);
      if (prev) kill(prev);
      this.chokes.set(opts.choke, voice);
    }
    const list = this.voices[name] || (this.voices[name] = []);
    list.push(voice);
    while (list.length > MAX_VOICES) kill(list.shift());
    src.onended = () => {
      const i = list.indexOf(voice);
      if (i >= 0) list.splice(i, 1);
      src.disconnect();
      env.disconnect();
    };
  }

  // ---- synthesis primitives ----
  _noiseBurst(out, { dur = 0.2, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, vol = 1, delay = 0, attack = 0.002 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(out);
    src.start(t, Math.random() * Math.max(0, 1.9 - dur));
    src.stop(t + dur + 0.05);
  }

  _tone(out, { type = 'sine', f0 = 440, f1 = f0, dur = 0.2, vol = 0.5, delay = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- procedural SFX ----
  _punch(o) {
    this._tone(o, { f0: 170, f1: 45, dur: 0.14, vol: 0.9 });
    this._noiseBurst(o, { type: 'lowpass', f0: 2200, f1: 300, dur: 0.07, vol: 0.6 });
  }
  _splat(o) {
    this._noiseBurst(o, { f0: 1100, f1: 250, q: 1.4, dur: 0.28, vol: 0.9 });
    this._tone(o, { f0: 110, f1: 40, dur: 0.18, vol: 0.6 });
    this._noiseBurst(o, { f0: 500, f1: 180, q: 2, dur: 0.2, vol: 0.5, delay: 0.05 });
  }
  _gore(o) {
    this._splat(o);
    this._noiseBurst(o, { type: 'lowpass', f0: 700, f1: 90, dur: 0.6, vol: 0.9, delay: 0.02 });
    this._noiseBurst(o, { f0: 1600, f1: 400, q: 3, dur: 0.15, vol: 0.4, delay: 0.12 });
    this._tone(o, { type: 'triangle', f0: 70, f1: 30, dur: 0.35, vol: 0.5 });
  }
  _slash(o) {
    this._noiseBurst(o, { f0: 3500, f1: 900, q: 2, dur: 0.12, vol: 0.5 });
    this._splat(o);
  }
  _glass(o) {
    for (let i = 0; i < 7; i++) {
      this._noiseBurst(o, { type: 'highpass', f0: rand(2500, 5000), q: 1, dur: rand(0.04, 0.14), vol: rand(0.2, 0.5), delay: rand(0, 0.2) });
    }
    for (let i = 0; i < 4; i++) this._tone(o, { f0: rand(2500, 6500), dur: rand(0.1, 0.3), vol: 0.07, delay: rand(0, 0.18) });
  }
  _explosion(o) {
    this._noiseBurst(o, { type: 'lowpass', f0: 1600, f1: 60, q: 0.7, dur: 1.6, vol: 1.4, attack: 0.005 });
    this._tone(o, { f0: 95, f1: 22, dur: 1.0, vol: 1.1 });
    this._noiseBurst(o, { type: 'highpass', f0: 3000, f1: 1200, dur: 0.25, vol: 0.5 });
    for (let i = 0; i < 6; i++) this._noiseBurst(o, { type: 'bandpass', f0: rand(800, 2500), q: 4, dur: 0.05, vol: 0.3, delay: rand(0.1, 0.7) });
  }
  _crumble(o) {
    this._noiseBurst(o, { type: 'lowpass', f0: 900, f1: 80, q: 0.8, dur: 1.1, vol: 1.1, attack: 0.01 });
    this._tone(o, { f0: 70, f1: 30, dur: 0.6, vol: 0.8 });
    for (let i = 0; i < 10; i++) {
      this._noiseBurst(o, { type: 'bandpass', f0: rand(400, 1800), q: 3, dur: rand(0.03, 0.08), vol: rand(0.2, 0.5), delay: rand(0, 0.6) });
    }
  }
  _vault(o) {
    this._noiseBurst(o, { f0: 500, f1: 1600, q: 1.5, dur: 0.22, vol: 0.45, attack: 0.04 });
    this._noiseBurst(o, { type: 'lowpass', f0: 900, f1: 200, dur: 0.12, vol: 0.5, delay: 0.3 });
    this._tone(o, { f0: 110, f1: 50, dur: 0.12, vol: 0.6, delay: 0.3 });
  }
  _slide(o) {
    this._noiseBurst(o, { f0: 900, f1: 2200, q: 2.5, dur: 0.4, vol: 0.4, attack: 0.03 });
    this._noiseBurst(o, { type: 'lowpass', f0: 600, f1: 200, dur: 0.15, vol: 0.4, delay: 0.42 });
  }
  _door(o) {
    this._tone(o, { type: 'triangle', f0: 210, f1: 95, dur: 0.12, vol: 0.7 });
    this._noiseBurst(o, { f0: 600, f1: 250, q: 1.5, dur: 0.09, vol: 0.6 });
  }
  _doorSlam(o) {
    this._door(o);
    this._tone(o, { f0: 90, f1: 40, dur: 0.25, vol: 0.9 });
    this._noiseBurst(o, { type: 'lowpass', f0: 900, f1: 120, dur: 0.3, vol: 0.7 });
  }
  _wood(o) {
    this._noiseBurst(o, { f0: 900, f1: 400, q: 2.5, dur: 0.12, vol: 0.6 });
    this._tone(o, { type: 'triangle', f0: 300, f1: 120, dur: 0.08, vol: 0.4 });
  }
  _metal(o) {
    this._tone(o, { type: 'square', f0: rand(900, 1300), f1: 600, dur: 0.12, vol: 0.12 });
    this._tone(o, { f0: rand(2500, 3500), dur: 0.25, vol: 0.12 });
    this._noiseBurst(o, { type: 'highpass', f0: 2500, dur: 0.05, vol: 0.4 });
  }
  _impact(o) {
    this._noiseBurst(o, { type: 'highpass', f0: 1800, f1: 900, dur: 0.05, vol: 0.35 });
    this._tone(o, { type: 'square', f0: rand(700, 1100), f1: 250, dur: 0.035, vol: 0.06 });
  }
  _silenced(o) {
    this._noiseBurst(o, { type: 'lowpass', f0: 1400, f1: 300, dur: 0.09, vol: 0.9 });
    this._tone(o, { f0: 220, f1: 70, dur: 0.07, vol: 0.4 });
    this._tone(o, { type: 'square', f0: 1500, f1: 900, dur: 0.03, vol: 0.05, delay: 0.03 });
  }
  _click(o) { this._tone(o, { type: 'square', f0: 1500, f1: 1200, dur: 0.03, vol: 0.18 }); }
  _magOut(o) {
    this._tone(o, { type: 'square', f0: 1900, f1: 1400, dur: 0.025, vol: 0.12 });
    this._noiseBurst(o, { type: 'bandpass', f0: 3200, f1: 1800, q: 2, dur: 0.07, vol: 0.4, delay: 0.02 });
  }
  _magIn(o) {
    this._tone(o, { f0: 520, f1: 260, dur: 0.05, vol: 0.5 });
    this._noiseBurst(o, { type: 'bandpass', f0: 1600, f1: 900, q: 1.5, dur: 0.06, vol: 0.7 });
    this._tone(o, { type: 'square', f0: 2400, dur: 0.02, vol: 0.08, delay: 0.03 });
  }
  _rack(o) {
    this._noiseBurst(o, { type: 'highpass', f0: 4000, dur: 0.03, vol: 0.6 });
    this._tone(o, { type: 'square', f0: 900, f1: 700, dur: 0.03, vol: 0.12 });
    this._noiseBurst(o, { type: 'highpass', f0: 3000, dur: 0.04, vol: 0.7, delay: 0.09 });
    this._tone(o, { type: 'square', f0: 1300, f1: 800, dur: 0.035, vol: 0.14, delay: 0.09 });
  }
  _shellIn(o) {
    this._tone(o, { f0: 1100, f1: 650, dur: 0.04, vol: 0.3 });
    this._noiseBurst(o, { type: 'bandpass', f0: 2200, q: 2, dur: 0.04, vol: 0.4 });
  }
  _ammo(o) {
    this._tone(o, { type: 'square', f0: 700, dur: 0.04, vol: 0.1 });
    this._tone(o, { type: 'square', f0: 1400, dur: 0.06, vol: 0.1, delay: 0.04 });
    for (let i = 0; i < 4; i++) this._tone(o, { f0: rand(3000, 5000), dur: 0.03, vol: 0.05, delay: rand(0, 0.12) });
  }
  _tirePop(o) {
    this._noiseBurst(o, { type: 'lowpass', f0: 2500, f1: 150, dur: 0.22, vol: 1.3, attack: 0.002 });
    this._tone(o, { f0: 140, f1: 40, dur: 0.2, vol: 0.9 });
    this._noiseBurst(o, { type: 'highpass', f0: 3500, f1: 2000, dur: 1.4, vol: 0.35, delay: 0.05, attack: 0.05 });
  }
  _alarm(o) {
    this._tone(o, { type: 'square', f0: 950, dur: 0.17, vol: 0.12 });
    this._tone(o, { type: 'square', f0: 1250, dur: 0.17, vol: 0.12, delay: 0.2 });
  }
  _carHit(o) {
    this._tone(o, { type: 'triangle', f0: rand(500, 700), f1: 260, dur: 0.12, vol: 0.4 });
    this._noiseBurst(o, { type: 'bandpass', f0: 2600, q: 3, dur: 0.06, vol: 0.5 });
  }
  _crackle(o) {
    for (let i = 0; i < 3; i++) this._noiseBurst(o, { type: 'bandpass', f0: rand(1500, 4000), q: 5, dur: 0.02, vol: rand(0.1, 0.3), delay: rand(0, 0.2) });
  }
  _ignite(o) {
    this._noiseBurst(o, { type: 'lowpass', f0: 300, f1: 2500, dur: 0.6, vol: 0.9, attack: 0.15 });
    this._tone(o, { f0: 60, f1: 90, dur: 0.5, vol: 0.4 });
  }
  _pickup(o) {
    this._tone(o, { type: 'square', f0: 520, dur: 0.05, vol: 0.12 });
    this._tone(o, { type: 'square', f0: 1040, dur: 0.07, vol: 0.12, delay: 0.05 });
    this._noiseBurst(o, { type: 'highpass', f0: 3000, dur: 0.04, vol: 0.2 });
  }
  _throw(o) { this._noiseBurst(o, { f0: 500, f1: 2400, q: 2, dur: 0.22, vol: 0.45, attack: 0.05 }); }
  _swing(o) { this._noiseBurst(o, { f0: 1800, f1: 500, q: 2, dur: 0.16, vol: 0.5, attack: 0.03 }); }
  _shell(o) {
    this._tone(o, { f0: rand(4200, 6000), dur: 0.05, vol: 0.05 });
    this._tone(o, { f0: rand(3000, 4000), dur: 0.06, vol: 0.04, delay: rand(0.05, 0.12) });
  }
  _rocket(o) {
    this._noiseBurst(o, { f0: 600, f1: 2500, q: 1, dur: 0.6, vol: 0.8, attack: 0.02 });
    this._tone(o, { type: 'sawtooth', f0: 120, f1: 60, dur: 0.3, vol: 0.2 });
  }
  _death(o) {
    this._tone(o, { type: 'sawtooth', f0: 140, f1: 30, dur: 1.4, vol: 0.5 });
    this._noiseBurst(o, { type: 'lowpass', f0: 600, f1: 60, dur: 1.0, vol: 0.9 });
    this._gore(o);
  }
  _alert(o) { this._tone(o, { type: 'square', f0: 1320, f1: 1500, dur: 0.06, vol: 0.06 }); }
  _combo(o, opts) {
    const base = 440 * Math.pow(2, Math.min(opts.n || 1, 12) / 12);
    this._tone(o, { type: 'square', f0: base, dur: 0.06, vol: 0.08 });
    this._tone(o, { type: 'square', f0: base * 1.5, dur: 0.1, vol: 0.08, delay: 0.05 });
  }
  _clear(o) {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(o, { type: 'square', f0: f, dur: 0.18, vol: 0.12, delay: i * 0.09 }));
  }
  _ui(o) { this._tone(o, { type: 'square', f0: 880, f1: 660, dur: 0.06, vol: 0.1 }); }
}

const Audio = new AudioSystem();
export default Audio;
