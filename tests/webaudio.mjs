// Minimal strict WebAudio stand-in for the audio tests: records every node and rejects what a browser would throw on
// (non-finite values, exponential ramps to <= 0, a source stopped before it started) and counts sources started.
// With `noPast` set, anything scheduled before currentTime fails too.
import assert from 'node:assert/strict';

export function mockContext() {
  const ctx = { currentTime: 0, sampleRate: 8000, state: 'running', started: 0, stopped: 0, noPast: false };
  const when = (t) => Number.isFinite(t) && t >= (ctx.noPast ? ctx.currentTime : 0);
  const param = (v = 0) => ({
    value: v,
    setValueAtTime(x, t) { assert.ok(Number.isFinite(x) && when(t)); },
    linearRampToValueAtTime(x, t) { assert.ok(Number.isFinite(x) && when(t)); },
    exponentialRampToValueAtTime(x, t) { assert.ok(x > 0 && when(t), `exp ramp to ${x}`); },
    setTargetAtTime(x, t, tau) { assert.ok(Number.isFinite(x) && when(t) && tau > 0, `target at ${t}, now ${ctx.currentTime}`); },
    setValueCurveAtTime(c, t, d) { assert.ok(c.length > 1 && c.every(Number.isFinite) && when(t) && d > 0, 'value curve'); },
    cancelScheduledValues() {},
  });
  const node = (extra = {}) => ({ connect: (n) => n, disconnect() {}, ...extra });
  const source = (extra) => {
    let on = false;
    return node({
      ...extra,
      start(t = ctx.currentTime) { assert.ok(when(t), `start at ${t}, now ${ctx.currentTime}`); on = true; ctx.started++; },
      stop(t = ctx.currentTime) { assert.ok(on, 'stop before start'); assert.ok(Number.isFinite(t)); ctx.stopped++; },
    });
  };
  Object.assign(ctx, {
    destination: node(),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(350), Q: param(1), gain: param(0) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createWaveShaper: () => node(),
    createConvolver: () => node(),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createOscillator: () => source({ frequency: param(440), detune: param(0) }),
    createDelay: () => node({ delayTime: param(0) }),
    createChannelMerger: () => node(),
    createBufferSource: () => source({ playbackRate: param(1) }),
    createBuffer: (ch, len, rate = ctx.sampleRate) => {
      assert.ok(ch >= 1 && len > 0 && rate > 0, 'buffer size');
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate, getChannelData: (i) => data[i] };
    },
  });
  return ctx;
}
