import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { default: KillCam, killTier } = await load('game/systems/KillCam.js');
const { default: KillPanel, tileAt } = await load('game/render/KillPanel.js');
const { KILLCAM, killcamMode } = await load('game/data/killcam.js');
const { MOMENTS } = await load('game/data/feel.js');
const { killBeat, listenMoments } = await load('game/fx/Impact.js');

const T = KILLCAM.tiers, DT = 1 / 60;
const VIEW = { x: 0, y: 0, hw: 258, hh: 145 };
const guard = (over = {}) => ({ isEnemy: true, alive: true, x: 40, y: 0, aware: 2, knocked: 0, def: { kind: 'melee' }, ...over });

// a world as far as the kill cam goes: the player at the middle of the view, `others` still standing in his sight
function world(mode = 'zoom', others = [guard({ x: 100, y: 60 })]) {
  const w = { events: new EventBus(), player: { isPlayer: true, alive: true, x: 0, y: 0 }, enemies: [...others],
    scoring: { combo: 0 }, slows: [], stops: [], beats: [], lineOfSight: () => true };
  w.game = { slow: null };
  w.slowmo = (scale, dur) => { w.slows.push([scale, dur]); w.game.slow = { scale, t: dur }; };
  w.hitstop = (s) => w.stops.push(s);
  w.cam = new KillCam(w, mode);
  w.killCam = w.cam;
  w.events.on('killcam', (e) => w.beats.push(e.tier));
  return w;
}
// a kill of the player's on a guard, the n-th of its chain
function kill(w, e = {}, n = 1, victim = guard()) {
  victim.alive = false;
  if (!w.enemies.includes(victim)) w.enemies.push(victim);
  w.scoring.combo = n;
  w.events.emit('kill', { victim, cause: 'bullet', killer: w.player, left: 'corpse', ...e });
  return victim;
}
// the real clock; returns the largest zoom seen
function pass(w, sec, ctx = {}) {
  let top = 1;
  for (let t = 0; t < sec; t += DT) {
    w.cam.update(DT, { view: VIEW, ...ctx });
    if (w.game.slow && (w.game.slow.t -= DT) <= 0) w.game.slow = null;
    top = Math.max(top, w.cam.scale);
  }
  return top;
}

test('killcam: the address picks the version, zoom without it', () => {
  assert.equal(killcamMode(null), 'zoom');
  assert.equal(killcamMode('panel'), 'panel');
  assert.equal(killcamMode('off'), 'off');
  assert.equal(killcamMode('1'), 'zoom');
});

test('killcam: what a kill is by itself', () => {
  const p = { isPlayer: true }, v = guard();
  assert.equal(killTier({ victim: v, cause: 'bullet', killer: p, how: { dist: 200 }, left: 'corpse' }), null);
  assert.equal(killTier({ victim: v, cause: 'melee', killer: p, how: { close: true }, left: 'corpse' }), null, 'a plain punch');
  assert.equal(killTier({ victim: v, cause: 'bullet', killer: p, left: 'headless' }), 'violent');
  assert.equal(killTier({ victim: v, cause: 'blast', killer: p, left: 'corpse' }), 'violent', 'buckshot at arm\'s length');
  assert.equal(killTier({ victim: v, cause: 'melee', killer: p, how: { heavy: true }, left: 'corpse' }), 'violent');
  assert.equal(killTier({ victim: v, cause: 'bullet', killer: p, how: { through: true }, left: 'corpse' }), 'violent');
  assert.equal(killTier({ victim: v, cause: 'melee', killer: p, how: { finisher: true, quick: true }, left: 'corpse' }), 'violent', 'a quick kill');
  assert.equal(killTier({ victim: v, cause: 'melee', killer: p, how: { finisher: true }, left: 'corpse' }), 'exec');
  assert.equal(killTier({ victim: guard({ held: p }), cause: 'snap', killer: p, how: {}, left: 'corpse' }), 'exec', 'a takedown');
  assert.equal(killTier({ victim: v, cause: 'bullet', killer: guard(), left: 'headless' }), null, 'not his');
});

test('killcam: an ordinary kill gets no beat', () => {
  const w = world();
  kill(w);
  assert.equal(w.cam.beat, null);
  assert.equal(pass(w, 0.5), 1);
  assert.deepEqual([w.slows, w.stops, w.beats], [[], [], []]);
});

test('killcam: a violent kill is a light beat, and the zoom is back to exactly 1', () => {
  const w = world();
  kill(w, { left: 'headless' });
  assert.equal(w.cam.beat.tier, 'violent');
  assert.deepEqual(w.slows, [T.violent.slow]);
  const top = pass(w, 0.25);
  assert.ok(top > 1.08 && top <= T.violent.zoom + 1e-9, `punched in (${top})`);
  assert.ok(w.cam.pull > 0, 'the view drawn toward the kill');
  pass(w, 1);
  assert.equal(w.cam.beat, null);
  assert.equal(w.cam.scale, 1);
  assert.equal(w.cam.pull, 0);
  const at = w.cam.aim(5, 6);
  assert.deepEqual([at.x, at.y], [5, 6]);
});

test('killcam: an execution is pushed in from its start, held to the blow, slowed on it, let go as he stands', () => {
  const w = world(), man = guard({ x: 20, y: 0, knocked: 2 });
  w.enemies.push(man);
  w.player.execution = { target: man, dead: false, f: { quick: false } };
  pass(w, 0.3);
  assert.equal(w.cam.beat.tier, 'exec');
  assert.ok(w.cam.scale > 1.25, 'in on the pair before the blow');
  pass(w, 1.5); // a long finisher: held all along
  assert.ok(Math.abs(w.cam.scale - T.exec.zoom) < 1e-9);
  assert.deepEqual(w.slows, [], 'no slow motion before the blow');
  // the killing blow
  w.player.execution.dead = true;
  kill(w, { cause: 'melee', how: { finisher: true, label: 'CURB' } }, 1, man);
  assert.deepEqual(w.slows, [T.exec.slow]);
  assert.deepEqual(w.stops, [T.exec.stop]);
  assert.equal(w.cam.beat.tier, 'exec');
  pass(w, T.exec.hold - 0.05);
  assert.ok(w.cam.scale > 1.25, 'held through the killing beat');
  w.player.execution = null;
  pass(w, 1.2);
  assert.equal(w.cam.scale, 1);
  assert.deepEqual(w.beats, ['exec', 'exec']);
});

test('killcam: an execution walked out of lets the camera go', () => {
  const w = world(), man = guard({ x: 20, knocked: 2 });
  w.enemies.push(man);
  w.player.takedown = { target: man };
  pass(w, 0.3);
  assert.ok(w.cam.scale > 1.2);
  w.player.takedown = null;
  pass(w, 1);
  assert.equal(w.cam.scale, 1);
});

test('killcam: the kills of a chain add from the third, and its end is the strongest beat', () => {
  const w = world();
  const tops = [];
  for (let n = 1; n <= 5; n++) {
    kill(w, {}, n);
    tops.push(pass(w, 0.8));
  }
  assert.equal(tops[0], 1);
  assert.equal(tops[1], 1);
  assert.ok(tops[2] > 1 && tops[3] > tops[2] && tops[4] > tops[3], `more with the chain (${tops})`);
  assert.ok(tops[4] < T.violent.zoom, 'a nudge, less than a violent kill');
  assert.deepEqual(w.slows, [], 'no slow motion for a plain kill of a chain');
  assert.equal(w.cam.scale, 1);
  // the chain runs out: its last body, the strongest beat
  pass(w, 3);
  w.events.emit('chainEnd', { kills: 5, points: 4000 });
  assert.equal(w.cam.beat.tier, 'end');
  assert.deepEqual(w.slows, [T.end.slow]);
  assert.deepEqual(w.stops, [T.end.stop]);
  const top = pass(w, 0.5);
  assert.ok(top > Math.max(...tops) && top > T.exec.zoom, `the strongest (${top})`);
  pass(w, 1.5);
  assert.equal(w.cam.scale, 1);
  // a short chain cashes in without one
  const v = world();
  kill(v, {}, 2);
  pass(v, 4);
  v.events.emit('chainEnd', { kills: 2, points: 900 });
  assert.equal(v.cam.beat, null);
});

test('killcam: the last man in sight of a chain, a triple kill: the end beat, once', () => {
  const w = world('zoom', []);
  w.enemies.push(guard({ x: 900, y: 900 })); // one left, far out of sight
  w.lineOfSight = () => false;
  kill(w, {}, 2);
  assert.equal(w.cam.beat.tier, 'end');
  pass(w, 4);
  w.events.emit('chainEnd', { kills: 3, points: 1 });
  assert.equal(w.cam.beat, null, 'not shown twice');
  const v = world();
  v.events.emit('multiKill', { n: 3, tag: 'triple', x: 40, y: 0 });
  kill(v, {}, 3);
  assert.equal(v.cam.beat.tier, 'end');
  const d = world();
  d.events.emit('multiKill', { n: 2, tag: 'double', x: 40, y: 0 });
  kill(d, {}, 2);
  assert.equal(d.cam.beat, null, 'a double kill is not one');
});

test('killcam: two beats at once, the stronger wins', () => {
  const w = world(), man = guard({ x: 20, knocked: 2 });
  w.enemies.push(man);
  kill(w, { cause: 'melee', how: { finisher: true } }, 1, man);
  assert.equal(w.cam.beat.tier, 'exec');
  kill(w, { left: 'gibs' }, 2); // a weaker one in its shadow: dropped
  assert.equal(w.cam.beat.tier, 'exec');
  assert.deepEqual(w.slows, [T.exec.slow]);
  // a stronger one takes over
  const v = world();
  kill(v, { left: 'headless' });
  assert.equal(v.cam.beat.tier, 'violent');
  v.events.emit('multiKill', { n: 3, tag: 'triple' });
  kill(v, { left: 'headless' }, 3);
  assert.equal(v.cam.beat.tier, 'end');
  assert.deepEqual(v.slows, [T.violent.slow, T.end.slow]);
  assert.deepEqual(v.beats, ['violent', 'end']);
});

test('killcam: a gap after a beat, so that a fight is not a slideshow', () => {
  const w = world();
  kill(w, { left: 'headless' });
  pass(w, 0.6); // the beat is over, its gap is not
  assert.equal(w.cam.beat, null);
  kill(w, { left: 'headless' }, 2);
  assert.equal(w.cam.beat, null);
  assert.equal(w.slows.length, 1);
  pass(w, T.violent.gap);
  kill(w, { left: 'headless' }, 3);
  assert.equal(w.cam.beat.tier, 'violent');
  assert.equal(w.slows.length, 2);
});

test('killcam: off, nothing at all', () => {
  const w = world('off'), man = guard({ x: 20, knocked: 2 });
  w.enemies.push(man);
  w.player.execution = { target: man, dead: false, f: { quick: false } };
  pass(w, 0.5);
  kill(w, { cause: 'melee', how: { finisher: true } }, 1, man);
  kill(w, { left: 'gibs' }, 2);
  w.events.emit('chainEnd', { kills: 6, points: 1 });
  assert.equal(pass(w, 1), 1);
  assert.deepEqual([w.slows, w.stops, w.beats, w.cam.beat, w.cam.panelView()], [[], [], [], null, null]);
});

test('killcam: never at the wheel, in a staged shot, nor on his own death', () => {
  const w = world();
  w.drive = { on: true };
  kill(w, { left: 'gibs' });
  assert.equal(w.cam.beat, null);
  assert.equal(pass(w, 0.5), 1);
  // a staged shot has the camera: skipped, and one under way is let go
  const s = world();
  pass(s, 0.1, { staged: true });
  kill(s, { left: 'gibs' });
  assert.equal(s.cam.beat, null);
  pass(s, 0.1);
  kill(s, { left: 'gibs' }, 2);
  assert.ok(s.cam.beat);
  pass(s, DT, { staged: true });
  assert.equal(s.cam.beat, null);
  pass(s, 1, { staged: true });
  assert.equal(s.cam.scale, 1);
  // he dies: nothing from this, and what was under way goes
  const d = world();
  kill(d, { left: 'gibs' });
  assert.ok(d.cam.beat);
  d.player.alive = false;
  d.events.emit('kill', { victim: d.player, cause: 'bullet', killer: guard() });
  assert.equal(d.cam.beat, null);
  kill(d, { left: 'gibs' }, 2);
  assert.equal(d.cam.beat, null);
  assert.deepEqual(d.beats, ['violent']);
});

test('killcam: a gunman after him is never zoomed out of the picture', () => {
  // by the edge of the usual view: the zoom would cut him out, so there is none; the slow motion stays
  const w = world('zoom', [guard({ x: 250, y: 0, def: { kind: 'gun' } })]);
  kill(w, { left: 'headless' });
  assert.equal(pass(w, 0.3), 1);
  assert.deepEqual(w.slows, [T.violent.slow]);
  // further in: a smaller zoom that keeps him in, with its margin
  const m = world('zoom', [guard({ x: 200, y: 0, def: { kind: 'gun' } })]);
  kill(m, { left: 'headless' });
  const top = pass(m, 0.08);
  assert.ok(top > 1 && top < T.violent.zoom - 0.02, `held back (${top})`);
  const cx = m.cam.at.x * T.violent.pull;
  assert.ok(Math.abs(200 - cx) + KILLCAM.guard.margin <= VIEW.hw / top + 1e-6, 'still in the picture');
  // one who has not seen him, or with no gun, or outside the usual view anyway, does not count
  for (const g of [guard({ x: 240, aware: 0, def: { kind: 'gun' } }), guard({ x: 240 }), guard({ x: 400, def: { kind: 'gun' } })]) {
    const f = world('zoom', [g]);
    kill(f, { left: 'headless' });
    assert.ok(pass(f, 0.3) > 1.1);
  }
});

test('killcam: the view is drawn toward the kill but keeps him in the picture', () => {
  const w = world('zoom', []);
  kill(w, {}, 3, guard({ x: 240, y: 0 })); // the last of all: the end beat, onto the body
  pass(w, 0.3);
  assert.ok(w.cam.pull > 0.9);
  const frame = { x: 0, y: 0, hw: VIEW.hw / w.cam.scale, hh: VIEW.hh / w.cam.scale };
  const at = w.cam.aim(0, 0, frame);
  assert.ok(at.x > 60 && at.x <= frame.hw * 0.7 + 1e-9, `toward the body, him still in (${at.x})`);
});

test('killcam panel: a violent kill opens one panel, slowed, then it is cut; no zoom, no slow motion', () => {
  const w = world('panel');
  kill(w);
  assert.equal(w.cam.panelView(), null, 'an ordinary kill: none');
  kill(w, { cause: 'blast' }, 2);
  let v = w.cam.panelView();
  assert.equal(v.kind, 'single');
  assert.equal(v.frames.length, 1);
  assert.equal(v.word, KILLCAM.panel.words.blast);
  assert.ok(v.frames[0].pop > 1, 'popped in from bigger');
  assert.ok(Math.abs(v.frames[0].clip - KILLCAM.panel.single.frames[0].span[0]) < 1e-9, 'from before the blow');
  const P = KILLCAM.panel.single;
  assert.equal(pass(w, P.dur / 2), 1);
  v = w.cam.panelView();
  assert.equal(v.frames[0].pop, 1);
  const span = P.frames[0].span;
  assert.ok(v.frames[0].clip > span[0] && v.frames[0].clip < span[1], 'replayed slowed');
  assert.ok((span[1] - span[0]) / (P.dur - KILLCAM.panel.hold) < 0.45, 'well under real speed');
  pass(w, P.dur / 2 + 0.05);
  assert.equal(w.cam.panelView(), null, 'cut');
  assert.deepEqual([w.slows, w.stops], [[], []]);
  assert.equal(w.cam.scale, 1);
  assert.ok(P.dur >= 1 && P.dur <= 1.6 && KILLCAM.panel.strip.dur <= 1.6, 'never long enough to distract');
});

test('killcam panel: an execution is a strip of three popping in one after the other, named after it', () => {
  const w = world('panel'), man = guard({ x: 20, knocked: 2 });
  w.enemies.push(man);
  w.player.execution = { target: man, dead: false, f: { quick: false } };
  pass(w, 0.5);
  assert.equal(w.cam.panelView(), null, 'nothing before the blow');
  assert.equal(w.cam.scale, 1);
  kill(w, { cause: 'melee', how: { finisher: true, label: 'HOME RUN' } }, 1, man);
  const S = KILLCAM.panel.strip;
  let v = w.cam.panelView();
  assert.deepEqual([v.kind, v.n, v.frames.length, v.word], ['strip', 3, 1, 'HOME RUN']);
  pass(w, S.frames[1].at + 0.02);
  assert.equal(w.cam.panelView().frames.length, 2);
  pass(w, S.frames[2].at - S.frames[1].at);
  v = w.cam.panelView();
  assert.equal(v.frames.length, 3);
  assert.ok(v.frames[0].clip < 0 && v.frames[2].clip > 0, 'the blow, then the body');
  pass(w, S.dur);
  assert.equal(w.cam.panelView(), null);
  assert.deepEqual(w.slows, []);
});

test('killcam panel: the stronger wins, the gap holds, a chain has its milestones and its end', () => {
  const w = world('panel'), man = guard({ x: 20, knocked: 2 });
  w.enemies.push(man);
  kill(w, { cause: 'melee', how: { finisher: true, label: 'CURB' } }, 1, man);
  const id = w.cam.panelView().id;
  kill(w, { left: 'gibs' }, 2);
  assert.equal(w.cam.panelView().id, id, 'the strip is not replaced by a lighter panel');
  pass(w, 3);
  kill(w, {}, 3);
  kill(w, {}, 4);
  assert.equal(w.cam.panelView(), null, 'plain kills of a chain: none');
  kill(w, {}, 5);
  assert.deepEqual([w.cam.panelView().kind, w.cam.panelView().word], ['single', 'x5!']);
  pass(w, 3);
  w.events.emit('chainEnd', { kills: 5, points: 1 });
  assert.deepEqual([w.cam.panelView().kind, w.cam.panelView().word], ['strip', 'CHAIN x5']);
});

test('killcam panel: zoom and off never open a panel; in panel the kills\' own slow motions stay off', () => {
  for (const mode of ['zoom', 'off']) {
    const w = world(mode);
    kill(w, { cause: 'blast' });
    assert.equal(w.cam.panelView(), null, mode);
    assert.equal(w.cam.mutes, false);
  }
  const w = world('panel', []);
  w.enemies.push(guard({ x: 900, y: 900 }));
  w.lineOfSight = () => false;
  listenMoments(w);
  const v = kill(w, {}, MOMENTS.lastInRoom.chain);
  assert.equal(killBeat(w, v, w.player), false);
  w.events.emit('multiKill', { n: 3, tag: 'triple' });
  assert.deepEqual([w.slows, w.stops], [[], []]);
  // in zoom the same moments go through slowAtLeast: the stronger stays, never one on top of the other
  const z = world('zoom', []);
  z.enemies.push(guard({ x: 900, y: 900 }));
  z.lineOfSight = () => false;
  const g = kill(z, {}, MOMENTS.lastInRoom.chain);
  assert.deepEqual(z.slows, [T.end.slow]);
  killBeat(z, g, z.player);
  assert.equal(z.slows.length, 1, 'the last-in-sight breath is weaker: dropped');
});

// a canvas as far as the panels go: it notes what is drawn on it
function fakeCanvas(w, h) {
  const calls = [];
  const ctx = new Proxy({ calls }, { get: (o, k) => (k in o ? o[k] : (...a) => { calls.push([k, ...a]); }), set: (o, k, v) => { o[k] = v; return true; } });
  return { width: w, height: h, getContext: () => ctx, calls };
}

test('killcam panel: the footage rolls about him, a kill keeps it and goes on about the kill; three strips at most', () => {
  const C = KILLCAM.panel, made = [];
  const kp = new KillPanel(C, (w, h) => { const c = fakeCanvas(w, h); made.push(c); return c; });
  const ev = new EventBus();
  kp.attach(ev);
  const cam = { zoom: 3, z: 3, worldToScreen: (x, y) => ({ x: x * 3, y: y * 3 }) }, p = { isPlayer: true, x: 100, y: 100 }, scene = {};
  let now = 0;
  const world = { player: p, corpses: [] };
  const roll = (sec) => { for (let t = 0; t < sec; t += 1 / 60) { now += 1 / 60; kp.capture(scene, cam, world, now); } };
  roll(1);
  assert.equal(made.length, 1);
  assert.equal(made[0].width, kp.cols * C.tile[0] * 3);
  assert.equal(kp.ring.count, C.frames, 'full, rolling');
  ev.emit('kill', { victim: { isEnemy: true, x: 120, y: 100 }, killer: p, cause: 'melee' });
  const clip = kp.last;
  assert.deepEqual([clip.focus.x, clip.focus.y], [110, 100]);
  assert.notEqual(kp.ring, clip);
  roll(1);
  const after = [...clip.times].filter((t) => t > clip.killT), before = [...clip.times].filter((t) => t <= clip.killT);
  assert.ok(after.length >= C.post * C.fps - 1 && after.length <= C.post * C.fps + 1, `it went on a moment (${after.length})`);
  assert.ok(before.length >= 5, 'what led to it is still there');
  assert.ok(Math.max(...after) <= clip.killT + C.post + 1e-9);
  assert.deepEqual([clip.cx[(clip.head + C.frames - 1) % C.frames], clip.body], [110, null], 'about the kill');
  // the picture a panel shows: the latest taken by then
  const i = tileAt(clip.times, clip.count, clip.killT + 0.1);
  assert.ok(clip.times[i] <= clip.killT + 0.1 && clip.times[i] > clip.killT);
  assert.equal(tileAt(clip.times, clip.count, -5), tileAt(clip.times, clip.count, Math.min(...clip.times)));
  // a panel shows it; more kills never make more than three strips
  const out = fakeCanvas(1547, 870).getContext();
  kp.draw(out, 1547, 870, { id: 1, kind: 'single', word: 'KRAK!', x: 120, y: 100, n: 1, frames: [{ i: 0, pop: 1, clip: 0.1 }] });
  assert.equal(kp.shown, clip);
  const blit = out.calls.find((c) => c[0] === 'drawImage');
  assert.equal(blit[1], clip.canvas);
  assert.deepEqual([blit[4], blit[5], blit[8], blit[9]], [C.view.single[0] * 3, C.view.single[1] * 3, C.view.single[0] * 3 * C.mag, C.view.single[1] * 3 * C.mag], 'a whole magnification');
  const body = { x: 404, y: 100 };
  world.corpses.push(body);
  for (let k = 0; k < 6; k++) { ev.emit('kill', { victim: { isEnemy: true, x: 400, y: 100 }, killer: p, cause: 'bullet' }); roll(0.2); }
  body.x = 440; // thrown on: the footage follows it
  roll(0.1);
  assert.equal(kp.last.cx[(kp.last.head + C.frames - 1) % C.frames], 440);
  assert.equal(made.length, 3);
  assert.equal(kp.shown, clip, 'the one on show is never taken back');
  assert.deepEqual([kp.last.focus.x, kp.last.focus.y], [400, 100], 'too far for one picture: about the man');
  kp.draw(out, 1547, 870, null);
  assert.equal(kp.shown, null);
});
