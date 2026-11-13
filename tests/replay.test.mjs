import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { ReplayRecorder, ReplayPlayer, clipScore, playbackSpeed, framePair } = await load('game/render/Replay.js');

// 8 frames at 10 fps (0.7 s of footage), up to 3 clips
const CFG = { w: 4, h: 2, fps: 10, frames: 8, post: 0.2, lead: 0.2, clips: 3, slow: 0.25, slowBefore: 0.3, slowAfter: 0.4 };

// canvases that only count what is asked of them
function factory() {
  const made = [];
  const create = (w, h) => {
    const c = { width: w, height: h, draws: 0, getContext: () => ({ drawImage() { c.draws++; } }) };
    made.push(c);
    return c;
  };
  return { made, create };
}
const SRC = { width: 64, height: 32 };
const guard = { isEnemy: true };
// runs the recorder from t0 to t1 at 100 Hz
function run(rec, t0, t1) {
  for (let i = Math.round(t0 * 100); i <= Math.round(t1 * 100); i++) rec.capture(SRC, i / 100);
}
const kill = (rec, cause = 'bullet', victim = guard) => rec.onKill({ victim, cause });

test('replay: frames are taken at the recorder rate, whatever the frame rate', () => {
  const f = factory(), rec = new ReplayRecorder(CFG, f.create);
  run(rec, 0, 1);
  assert.equal(f.made.length, 1); // the ring only
  assert.ok(f.made[0].draws >= 10 && f.made[0].draws <= 11, `${f.made[0].draws} frames in 1 s`);
  assert.equal(rec.count, CFG.frames);
  assert.equal(rec.clips.length, 0);
});

test('replay: a kill saves a clip a moment later, with the kill inside it', () => {
  const f = factory(), rec = new ReplayRecorder(CFG, f.create);
  run(rec, 0, 2);
  kill(rec);
  assert.equal(rec.clips.length, 0);
  run(rec, 2.01, 2.5);
  assert.equal(rec.clips.length, 1);
  const c = rec.clips[0];
  assert.equal(c.len, CFG.frames);
  assert.equal(c.canvas.draws, 1); // one copy of the whole ring
  assert.equal(c.kills.length, 1);
  const dur = c.times[(c.start + c.len - 1) % CFG.frames] - c.times[c.start];
  assert.ok(c.kills[0] > 0.3 && c.kills[0] < dur, `kill at ${c.kills[0]} of ${dur}`);
  assert.ok(dur - c.kills[0] >= CFG.post - 0.11);
});

test('replay: kills in quick succession share one clip, which keeps its lead-in', () => {
  const f = factory(), rec = new ReplayRecorder(CFG, f.create);
  run(rec, 0, 2);
  kill(rec);
  run(rec, 2.01, 2.1);
  kill(rec, 'slash');
  run(rec, 2.11, 2.19);
  kill(rec, 'slash');
  run(rec, 2.2, 3);
  assert.equal(rec.clips.length, 1);
  const c = rec.clips[0];
  assert.equal(c.kills.length, 3);
  assert.ok(c.kills[0] >= CFG.lead - 0.11, `first kill ${c.kills[0]} s into the clip`);
  // kills never stop coming: the clip still closes
  const g = factory(), rec2 = new ReplayRecorder(CFG, g.create);
  run(rec2, 0, 1);
  for (let t = 1; t < 3; t += 0.1) { kill(rec2); run(rec2, t + 0.01, t + 0.1); }
  assert.ok(rec2.clips.length >= 2);
});

test('replay: players and passers-by are not highlights', () => {
  const f = factory(), rec = new ReplayRecorder(CFG, f.create);
  run(rec, 0, 1);
  kill(rec, 'bullet', { isPlayer: true });
  kill(rec, 'vehicle', { isCivilian: true });
  run(rec, 1.01, 2);
  assert.equal(rec.clips.length, 0);
});

test('replay: multi-kills and special kills make the better clips', () => {
  const k = (w) => ({ t: 0, w });
  assert.ok(clipScore([k(1), k(1)]) > clipScore([k(3)]));
  assert.ok(clipScore([k(3)]) > clipScore([k(2)]));
  assert.ok(clipScore([k(2)]) > clipScore([k(1)]));
});

test('replay: memory is capped, the weakest clip gives way and canvases are reused', () => {
  const f = factory(), rec = new ReplayRecorder(CFG, f.create);
  const causes = ['bullet', 'execute', 'bullet', 'slash', 'bullet', 'explosion', 'bullet'];
  causes.forEach((cause, i) => {
    run(rec, i * 2, i * 2 + 1);
    kill(rec, cause);
    run(rec, i * 2 + 1.01, i * 2 + 1.9);
  });
  assert.equal(rec.clips.length, CFG.clips);
  assert.equal(f.made.length, CFG.clips + 1); // ring + clips, never more
  assert.deepEqual(rec.clips.map((c) => c.score).sort(), [2, 3, 3]);
  // in the order they happened
  const order = rec.ordered().map((c) => c.t);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // among equals the newest is kept: the last plain shot never got in, the slash did
  assert.ok(rec.ordered().every((c) => c.t < 12));

  // a new run starts empty with the same canvases
  rec.reset();
  assert.equal(rec.clips.length, 0);
  run(rec, 0, 1);
  kill(rec);
  run(rec, 1.01, 2);
  assert.equal(rec.clips.length, 1);
  assert.equal(f.made.length, CFG.clips + 1);

  // leaving the game gives the memory back
  rec.release();
  assert.ok(f.made.every((c) => c.width === 0 && c.height === 0));
  assert.equal(rec.clips.length + rec.spare.length, 0);
  assert.equal(rec.ring, null);
});

test('replay: the recorder follows one world at a time', () => {
  const f = factory(), rec = new ReplayRecorder(CFG, f.create);
  const old = new EventBus(), cur = new EventBus();
  rec.attach(old);
  rec.attach(cur);
  run(rec, 0, 1);
  old.emit('kill', { victim: guard, cause: 'bullet' });
  assert.equal(rec.pending, null);
  cur.emit('kill', { victim: guard, cause: 'bullet' });
  assert.ok(rec.pending);
});

test('replay: playback slows down around every kill and nowhere else', () => {
  const kills = [1, 3];
  const slow = (t) => Math.abs(playbackSpeed(t, kills, CFG) - CFG.slow) < 1e-9;
  assert.equal(playbackSpeed(0, kills, CFG), 1);
  assert.ok(slow(1) && slow(1 - CFG.slowBefore) && slow(1 + CFG.slowAfter) && slow(3.1));
  assert.equal(playbackSpeed(2, kills, CFG), 1);
  const easing = playbackSpeed(1 + CFG.slowAfter + 0.075, kills, CFG);
  assert.ok(easing > CFG.slow && easing < 1);
  assert.equal(playbackSpeed(5, [], CFG), 1);
});

test('replay: playback blends the two frames around the play head, across the ring seam', () => {
  // ring of 4 tiles written in the order 2, 3, 0, 1
  const times = Float64Array.from([10.2, 10.3, 10.0, 10.1]), out = {};
  assert.deepEqual({ ...framePair(times, 2, 4, 0, out) }, { a: 2, b: 3, k: 0 });
  const mid = framePair(times, 2, 4, 0.15, out);
  assert.deepEqual([mid.a, mid.b], [3, 0]);
  assert.ok(Math.abs(mid.k - 0.5) < 1e-6);
  const end = framePair(times, 2, 4, 0.9, out);
  assert.deepEqual([end.a, end.b, end.k], [0, 1, 1]);
  assert.deepEqual({ ...framePair(Float64Array.from([5]), 0, 1, 0, out) }, { a: 0, b: 0, k: 0 });
});

test('replay: the player loops through the clips, spending longer on the slow parts', () => {
  const f = factory(), rec = new ReplayRecorder(CFG, f.create), player = new ReplayPlayer(rec);
  assert.equal(player.ready, false);
  run(rec, 0, 1);
  kill(rec);
  run(rec, 1.01, 2);
  run(rec, 2, 3);
  kill(rec, 'slash'); // still pending when the level ends
  player.start();
  assert.equal(player.ready, true);
  assert.equal(player.clips.length, 2);
  let real = 0;
  while (player.i === 0 && real < 20) { player.update(1 / 60); real += 1 / 60; }
  assert.equal(player.i, 1);
  assert.ok(real > 0.7 * 1.5, `first clip took ${real} s`); // 0.7 s of footage, stretched
  for (let i = 0; i < 2000 && player.i === 1; i++) player.update(1 / 60);
  assert.equal(player.i, 0); // loops
  player.stop();
  assert.equal(player.ready, false);
  player.update(1 / 60); // nothing to play: no throw
});
