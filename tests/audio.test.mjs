import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Audio } = await load('audio/Audio.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { MATERIAL_FX } = await load('game/data/destruction.js');
const { BANK } = await load('audio/bank.js');

// Minimal strict WebAudio stand-in: records every node and rejects what a browser would throw on
// (non-finite values, exponential ramps to <= 0) and counts sources started.
function mockContext() {
  const ctx = { currentTime: 0, sampleRate: 8000, state: 'running', started: 0, stopped: 0 };
  const param = (v = 0) => ({
    value: v,
    setValueAtTime(x, t) { assert.ok(Number.isFinite(x) && Number.isFinite(t)); },
    linearRampToValueAtTime(x, t) { assert.ok(Number.isFinite(x) && Number.isFinite(t)); },
    exponentialRampToValueAtTime(x, t) { assert.ok(x > 0 && Number.isFinite(t), `exp ramp to ${x}`); },
    setTargetAtTime(x, t, tau) { assert.ok(Number.isFinite(x) && t >= 0 && tau > 0); },
    cancelScheduledValues() {},
  });
  const node = (extra = {}) => ({ connect: (n) => n, disconnect() {}, ...extra });
  const source = (extra) => node({
    ...extra,
    start(t) { assert.ok(Number.isFinite(t) && t >= 0); ctx.started++; },
    stop(t) { assert.ok(Number.isFinite(t)); ctx.stopped++; },
  });
  Object.assign(ctx, {
    destination: node(),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(350), Q: param(1), gain: param(0) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createWaveShaper: () => node(),
    createConvolver: () => node(),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createOscillator: () => source({ frequency: param(440) }),
    createBufferSource: () => source({ playbackRate: param(1) }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  });
  return ctx;
}

const FOLEY = { duration: 80 }; // stands for the decoded foley bank

function withContext(fn, buffers = { foley: FOLEY }) {
  const ctx = mockContext();
  Audio.ctx = ctx;
  Audio.active = [];
  Audio.lastPlay = {};
  Audio.buffers = buffers;
  Audio._build(ctx);
  fn(ctx);
  Audio.ctx = null;
  Audio.buffers = {};
}

test('audio: every weapon sound, reload and handling sound builds valid nodes for every weapon', () => {
  withContext((ctx) => {
    for (const [type, d] of Object.entries(WEAPONS)) {
      ctx.currentTime += 2; // past every rate limit and voice
      const before = ctx.started;
      Audio.play(d.sound, { x: 0, y: 0 });
      assert.ok(ctx.started > before, `${type}: '${d.sound}' played nothing`);
      if (d.kind !== 'gun') continue;
      for (const name of ['magOut', 'magIn', 'rack', 'shellIn', 'handle', 'click', 'pickup']) {
        ctx.currentTime += 0.5;
        const n = ctx.started;
        Audio.play(name, { weapon: type, dur: d.reload });
        assert.ok(ctx.started > n, `${type}: ${name} played nothing`);
      }
    }
  });
});

test('audio: full auto from one shooter keeps a single live voice (choke), distant shots still play', () => {
  withContext((ctx) => {
    const shooter = {};
    for (let i = 0; i < 30; i++) {
      Audio.play('uzi', { x: 0, y: 0, choke: shooter });
      ctx.currentTime += 0.065;
    }
    assert.equal(Audio.active.filter((a) => a.name === 'uzi').length, 1);
    const n = ctx.started;
    Audio.play('rifle', { x: 2000, y: 0 });
    assert.ok(ctx.started > n, 'a rifle 2000 px away is still heard');
  });
});

test('audio: with the recordings loaded, every shot and the blast play a cut of them', () => {
  withContext((ctx) => {
    const buf = { duration: 1 }, played = [];
    Audio.buffers = { pistol: buf, rifle: buf, shotgun: buf, uzi: buf, foley: FOLEY };
    const make = ctx.createBufferSource;
    ctx.createBufferSource = () => {
      const s = make(), start = s.start;
      s.start = (...a) => { if (s.buffer === buf) played.push(a); start(...a); };
      return s;
    };
    for (const name of ['pistol', 'uzi', 'shotgun', 'rifle', 'sniper', 'explosion']) {
      ctx.currentTime += 3;
      const n = played.length;
      Audio.play(name, { x: 0, y: 0 });
      assert.ok(played.length > n, `${name}: no recording played`);
    }
  });
});

// every other sound the game asks for (world.sound / Audio.play call sites, material tables)
const GAME_SOUNDS = [
  ...Object.values(MATERIAL_FX).flatMap((fx) => [fx.hit, fx.crush]), 'stone', 'flesh', 'impact', 'shell',
  'punch', 'splat', 'gore', 'slash', 'death', 'bodyFall', 'shout', 'cry', 'glass', 'crumble', 'doorBreak', 'explosion',
  'tirePop', 'carHit', 'door', 'doorSlam', 'creak', 'vault', 'slide', 'splash', 'throw', 'swing', 'ricochet', 'ammo',
  'alarm', 'crackle', 'ignite', 'confirm', 'clear', 'ui', 'passby',
];

test('audio: every sound the game asks for plays, from a cut that lies inside the foley bank', () => {
  const end = Math.max(...Object.values(BANK).flat().map(([at, len]) => at + len));
  withContext((ctx) => {
    const make = ctx.createBufferSource;
    ctx.createBufferSource = () => {
      const s = make(), start = s.start;
      s.start = (t, at = 0, len = 0) => {
        if (s.buffer === FOLEY) assert.ok(at >= 0 && len > 0 && at + len <= end + 0.05, `cut ${at} + ${len} outside the bank`);
        start(t);
      };
      return s;
    };
    for (const name of GAME_SOUNDS) {
      for (let i = 0; i < 12; i++) { // several times: every cut of a set comes up
        ctx.currentTime += 4;
        const n = ctx.started;
        Audio.play(name, { x: 30, y: 0, vol: 0.8, n: i });
        assert.ok(ctx.started > n, `'${name}' played nothing`);
      }
    }
  });
});

test('audio: without the foley bank nothing throws and silent sounds free their voice', () => {
  withContext((ctx) => {
    for (const name of [...GAME_SOUNDS, 'magOut', 'rack', 'click', 'silenced', 'shotgun']) {
      ctx.currentTime += 4;
      Audio.play(name, { x: 30, y: 0 });
    }
    ctx.currentTime += 4;
    Audio.play('wood', { x: 0, y: 0 });
    assert.equal(Audio.active.filter((a) => a.name === 'wood').length, 0);
  }, {});
});
