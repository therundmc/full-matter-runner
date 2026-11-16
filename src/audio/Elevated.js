// The elevated train of the title screen, heard from a window across the street: a voice rendered piece by piece
// (ui/title/Timeline.js trainSound gives each piece its curves and its events) in plain JS on Float32Arrays, DOM-free
// and seeded. What is in it, each part as loud as the piece's curves say:
//   - the rumble: brown noise, duller the farther the train (lowpass from `rumble.lp[0]` far to `[1]` near), no sub
//   - the steel truss answering low: a few resonant modes of the bridge driven by that rumble and by every knock
//   - the wheels' roar on the rails: a soft band of noise (no hiss over it), opening with nearness and speed
//   - the knocks on the rail joints, axle by axle, each where its joint is: a dull thump, the knock of the wheel, a
//     small tick of steel only when near (`knock`; a few baked variations, one per knock, so no two sound the same)
//   - the motors' whine climbing with the speed as it pulls away, falling as it brakes; standing, the compressor's hum
//     and the fans; the shoes singing softly at the end of a stop, then the air brakes letting go (a sigh)
//   - now and then the flanges singing far off on the bend past the right tower: two soft wavering tones, never shrill
// A piece is `len` s and runs on `tail` s into the next one: the voice keeps its whole state (noise, filters, phases)
// across pieces, so the next piece, started where this one hands over, renders the same samples in the overlap and
// the two crossfade into one unbroken sound. A piece that does not follow another (the first, or after a gap) fades
// in instead; the last one heard fades out over its tail.

const TAU = Math.PI * 2;

// Hz, s, levels (linear, on the scale of the effects bus before the sound's META gain)
const ELEVATED = {
  sr: 16000,                                               // all of it lies under 5 kHz
  // level = near ** curve (heard from far, swelling), down to `idle` of it while it stands
  rumble: { lp: [60, 240], hp: 42, gain: 0.6, curve: 0.6, idle: 0.12 },
  // [Hz, Q, level] of each mode, driven by `load` x the rumble and `knock` x each knock's low part
  truss: { modes: [[48, 7, 1], [73, 9, 0.6], [112, 11, 0.35]], gain: 0.5, load: 1.1, knock: 3 },
  roar: { band: [[260, 140], [1400, 380]], gain: 0.6 },    // [far: lowpass, highpass], [near]
  knock: { ring: 0.3, variants: 8, thump: [78, 0.04], body: [290, 0.017], tick: [1150, 0.005], gain: 0.42, curve: 0.8 },
  whine: { f: [140, 620], gain: 0.02 },
  idle: { hum: 118, vent: 650, gain: 0.025 },
  squeal: { f: 1650, gain: 0.014, pan: 0.8 },             // Hz of its lower tone (the other about a fourth up)
  brake: { f: [980, 1250], gain: 0.014 },
  sigh: { attack: 0.06, decay: 0.45, lp: 2600, gain: 0.07 },
  fade: 0.12,                                              // s a piece that starts afresh fades in
};
const E = ELEVATED;

// seeded generator (mulberry32) over a state field, so it can be snapshot with the rest
function next(S) {
  S.r = (S.r + 0x6d2b79f5) >>> 0;
  let t = Math.imul(S.r ^ (S.r >>> 15), S.r | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}
// RBJ bandpass coefficients (0 dB at its peak)
function bandpass(f, q, sr) {
  const w = (TAU * f) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return [al / a0, 0, -al / a0, (-2 * Math.cos(w)) / a0, (1 - al) / a0];
}
const onePole = (fc, sr) => 1 - Math.exp((-TAU * fc) / sr);

// the knock of one wheel on a joint, baked once per sample rate: variations of [low part (thump and knock: also what
// drives the truss), tick]
const BAKED = new Map();
function bakeKnocks(sr) {
  if (BAKED.has(sr)) return BAKED.get(sr);
  const K = E.knock, n = Math.round(K.ring * sr), out = [];
  BAKED.set(sr, out);
  for (let v = 0; v < K.variants; v++) {
    const dt = 1 + ((v * 0.618) % 1 - 0.5) * 0.12, low = new Float32Array(n), tick = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr, a = Math.min(1, t / 0.0025), end = Math.min(1, (n - i) / (0.02 * sr));
      const thump = Math.sin(TAU * K.thump[0] * dt * t * (1 - 0.8 * t)) * Math.exp(-t / K.thump[1]);
      const body = 0.55 * Math.sin(TAU * K.body[0] * dt * t + 0.7) * Math.exp(-t / K.body[1]);
      low[i] = (thump + body) * a * end;
      tick[i] = 0.35 * Math.sin(TAU * K.tick[0] * dt * t) * Math.exp(-t / K.tick[1]) * a;
    }
    out.push([low, tick]);
  }
  return out;
}

// the piece's curves at t s into it (linear between their samples), turned into what the loop needs: into B
function block(B, C, el, t, sr) {
  const last = C.near.length - 1, f = Math.min(last, t * el.rate), j = Math.min(last - 1, Math.floor(f)), u = f - j, a = el.a0 + t;
  const at = (key) => C[key][j] + (C[key][j + 1] - C[key][j]) * u;
  const near = at('near'), bright = at('bright'), pace = at('pace'), pan = at('pan'), brake = at('brake');
  B.kRum = onePole(E.rumble.lp[0] + (E.rumble.lp[1] - E.rumble.lp[0]) * bright, sr);
  B.kLo = onePole(E.roar.band[0][0] + (E.roar.band[1][0] - E.roar.band[0][0]) * bright, sr);
  B.kHi = onePole(E.roar.band[0][1] + (E.roar.band[1][1] - E.roar.band[0][1]) * bright * pace, sr);
  B.rumble = near ** E.rumble.curve * (E.rumble.idle + (1 - E.rumble.idle) * pace) * E.rumble.gain;
  B.roar = at('roll') * E.roar.gain;
  B.pl = Math.cos(((pan + 1) * Math.PI) / 4); B.pr = Math.sin(((pan + 1) * Math.PI) / 4);
  B.drive = at('drive') * E.whine.gain;
  B.fw = (E.whine.f[0] + (E.whine.f[1] - E.whine.f[0]) * pace) / sr;
  B.stand = at('stand') * E.idle.gain;
  B.brake = brake * (0.7 + 0.3 * Math.sin(TAU * 1.7 * a)) * E.brake.gain;
  B.fb = ((E.brake.f[0] + (E.brake.f[1] - E.brake.f[0]) * brake) * (1 + 0.006 * Math.sin(TAU * 4.3 * a))) / sr;
  // the flanges: wavering in pitch, coming and going
  const wob = 1 + 0.012 * Math.sin(TAU * 3.1 * a) + 0.03 * Math.sin(TAU * 0.37 * a + el.k);
  const come = 0.6 + 0.25 * Math.sin(TAU * 0.45 * a + el.k * 1.7) + 0.15 * Math.sin(TAU * 1.3 * a + el.k);
  B.squeal = at('squeal') * come * E.squeal.gain;
  B.fs = (E.squeal.f * wob) / sr;
}

export class ElevatedVoice {
  constructor(seed = 1, sr = E.sr) {
    this.sr = sr;
    this.knocks = bakeKnocks(sr);
    this.modes = E.truss.modes.map(([f, q]) => bandpass(f, q, sr));
    // all that runs on from one sample to the next
    this.S = {
      r: seed >>> 0, brown: 0, rum: 0, rumLo: 0, roarIn: 0, roarLo: 0, roarHi: 0, sigh: 0, vent: 0,
      m: E.truss.modes.map(() => [0, 0, 0, 0]), pw: 0, ph: 0, ps: [0, 0], pb: 0,
    };
  }

  // The samples of one piece (Timeline.trainSound): { sr, data: [left, right] }, (len + tail) s long. fresh: it does
  // not follow the last piece rendered (it fades in)
  render(el, fresh) {
    const sr = this.sr, n0 = Math.round(el.a0 * sr), main = Math.round(el.len * sr), n = main + Math.round(el.tail * sr);
    const L = new Float32Array(n), R = new Float32Array(n), C = el.curve, last = C.near.length - 1;
    const knocks = el.knocks.map(([at, g, pan, bright]) => {
      const k0 = Math.round((el.a0 + at) * sr), v = this.knocks[Math.abs(k0 * 7 + 3) % this.knocks.length];
      return { k0, v, g: g ** E.knock.curve * E.knock.gain, l: Math.cos(((pan + 1) * Math.PI) / 4), r: Math.sin(((pan + 1) * Math.PI) / 4), b: bright * bright };
    });
    // the knocks ringing in this piece, each on its side, and their low part that drives the truss
    const kl = new Float32Array(n), kr = new Float32Array(n), kd = new Float32Array(n);
    for (const k of knocks) {
      const [low, tick] = k.v;
      for (let i = Math.max(0, k.k0 - n0), q = i + n0 - k.k0; i < n && q < low.length; i++, q++) {
        const s = (low[q] + tick[q] * k.b) * k.g;
        kl[i] += s * k.l; kr[i] += s * k.r; kd[i] += low[q] * k.g;
      }
    }
    const sighs = el.sighs.map(([at, g]) => ({ k0: Math.round((el.a0 + at) * sr), g: g * E.sigh.gain }));
    const kSigh = onePole(E.sigh.lp, sr), kVent = onePole(E.idle.vent, sr), kRumHp = onePole(E.rumble.hp, sr), T = E.truss, B = {};
    const sl = Math.cos(((E.squeal.pan + 1) * Math.PI) / 4), sr2 = Math.sin(((E.squeal.pan + 1) * Math.PI) / 4);
    let snap = null;
    for (let i = 0; i < n; i++) {
      if (i === main) snap = structuredClone(this.S);      // where the next piece takes over
      if ((i & 15) === 0) block(B, C, el, i / sr, sr);    // the curves, read every 16 samples (the same grid in every piece)
      const S = this.S;
      const w = next(S);
      S.brown = (S.brown + 0.04 * w) / 1.04;
      S.rum += B.kRum * (S.brown * 6 - S.rum);
      S.rumLo += kRumHp * (S.rum - S.rumLo);
      const rumble = (S.rum - S.rumLo) * B.rumble;
      S.roarIn += B.kLo * (w - S.roarIn);
      S.roarLo += B.kLo * (S.roarIn - S.roarLo);
      S.roarHi += B.kHi * (S.roarLo - S.roarHi);
      const roar = (S.roarLo - S.roarHi) * B.roar;
      // the truss: its modes driven by the rumble and the knocks
      let truss = 0;
      const x = rumble * T.load + kd[i] * T.knock;
      for (let m = 0; m < this.modes.length; m++) {
        const [b0, , b2, a1, a2] = this.modes[m], st = S.m[m];
        const y = b0 * x + b2 * st[1] - a1 * st[2] - a2 * st[3];
        st[1] = st[0]; st[0] = x; st[3] = st[2]; st[2] = y;
        truss += y * T.modes[m][2];
      }
      // the tones: the motors, the idle, the shoes and the flanges (phases run on through the pieces)
      let tone = 0, side = 0;
      if (B.drive > 1e-3) {
        S.pw = (S.pw + B.fw) % 1;
        tone += (Math.sin(TAU * S.pw) + 0.4 * Math.sin(2 * TAU * S.pw)) * B.drive;
      }
      if (B.stand > 1e-3) {
        S.ph = (S.ph + E.idle.hum / sr) % 1;
        S.vent += kVent * (w - S.vent);
        tone += (Math.sin(TAU * S.ph) * 0.6 + Math.sin(2 * TAU * S.ph) * 0.3 + S.vent * 2.5) * B.stand;
      }
      if (B.brake > 1e-3) {
        S.pb = (S.pb + B.fb) % 1;
        tone += Math.sin(TAU * S.pb) * B.brake;
      }
      if (B.squeal > 1e-3) {
        S.ps[0] = (S.ps[0] + B.fs) % 1;
        S.ps[1] = (S.ps[1] + B.fs * 1.29) % 1;
        side += (Math.sin(TAU * S.ps[0]) + 0.5 * Math.sin(TAU * S.ps[1])) * B.squeal;
      }
      // the air brakes letting go
      let sigh = 0;
      for (const h of sighs) {
        const q = (n0 + i - h.k0) / sr;
        if (q < 0 || q > E.sigh.attack + 6 * E.sigh.decay) continue;
        S.sigh += kSigh * (w - S.sigh);
        sigh += S.sigh * h.g * Math.min(1, q / E.sigh.attack) * Math.exp(-Math.max(0, q - E.sigh.attack) / E.sigh.decay);
      }
      // mixed and set on their sides: the train's noise where the train is, the bend far right
      const body = rumble + roar + truss * T.gain + tone + sigh;
      L[i] = body * B.pl + kl[i] + side * sl;
      R[i] = body * B.pr + kr[i] + side * sr2;
    }
    this.S = snap || this.S;
    // the hand-over: in over the overlap (or a longer fade from nothing), out over the tail
    const tail = n - main, fin = fresh ? Math.round(E.fade * sr) : tail;
    for (let i = 0; i < n; i++) {
      const g = Math.min(1, i / fin, i >= main ? (n - i) / tail : 1);
      L[i] *= g; R[i] *= g;
    }
    return { sr, data: [L, R] };
  }
}
