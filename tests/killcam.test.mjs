import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { default: KillCam, killTier } = await load('game/systems/KillCam.js');
const { default: Lens } = await load('game/render/Lens.js');
const { KILLCAM, killcamOn } = await load('game/data/killcam.js');
const { POST } = await load('game/data/post.js');
const { MOMENTS } = await load('game/data/feel.js');
const { killBeat } = await load('game/fx/Impact.js');

const T = KILLCAM.tiers, C = KILLCAM.chain, DT = 1 / 60;
const VIEW = { x: 0, y: 0, hw: 258, hh: 145 };
const guard = (over = {}) => ({ isEnemy: true, alive: true, x: 40, y: 0, aware: 2, knocked: 0, def: { kind: 'melee' }, ...over });

// a world as far as the kill cam goes: the player at the middle of the view, `others` still standing in his sight
function world(on = true, others = [guard({ x: 100, y: 60 })]) {
  const w = { events: new EventBus(), player: { isPlayer: true, alive: true, x: 0, y: 0 }, enemies: [...others],
    scoring: { combo: 0 }, slows: [], stops: [], beats: [], outs: [], sounds: [], pushes: [], punches: [], shakes: [], blood: [], lineOfSight: () => true };
  w.game = { slow: null };
  w.slowmo = (scale, dur) => { w.slows.push([scale, dur]); w.game.slow = { scale, t: dur }; };
  w.hitstop = (s) => w.stops.push(s);
  w.shake = (a) => w.shakes.push(a);
  w.sound = (name) => w.sounds.push(name);
  w.camera = { push: (x, y) => w.pushes.push([x, y]), punch: (a) => w.punches.push(a) };
  w.particles = { blood: (...a) => w.blood.push(a) };
  w.cam = new KillCam(w, on);
  w.killCam = w.cam;
  w.events.on('killcam', (e) => w.beats.push(e.tier));
  w.events.on('killcamOut', (e) => w.outs.push(e.tier));
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
// the real clock, as Game runs it (the slow motion's own timer, then the kill cam's clock on the time scale);
// returns the largest and the smallest zoom seen
function pass(w, sec, ctx = {}) {
  let top = 1, low = 9;
  w.ts ??= 1;
  for (let t = 0; t < sec; t += DT) {
    let target = 1;
    if (w.game.slow) { target = w.game.slow.scale; if ((w.game.slow.t -= DT) <= 0) w.game.slow = null; }
    w.ts += (target - w.ts) * (1 - Math.pow(0.001, DT));
    w.ts = w.cam.clock(w.ts, target);
    w.cam.update(DT, { view: VIEW, ...ctx });
    top = Math.max(top, w.cam.scale);
    low = Math.min(low, w.cam.scale);
  }
  w.low = low;
  return top;
}

test('killcam: on by default, off by the address only', () => {
  assert.equal(killcamOn(null), true);
  assert.equal(killcamOn('zoom'), true);
  assert.equal(killcamOn('off'), false);
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
  kill(w, {}, 2);
  assert.equal(w.cam.beat, null);
  assert.equal(pass(w, 0.5), 1);
  assert.equal(w.ts, 1);
  assert.deepEqual([w.slows, w.stops, w.beats, w.pushes, w.blood, w.sounds], [[], [], [], [], [], []]);
});

test('killcam: a violent kill: in within a few frames, kicked along the blow, more blood, and back to exactly 1', () => {
  const w = world();
  kill(w, { left: 'headless' });
  assert.equal(w.cam.beat.tier, 'violent');
  assert.deepEqual(w.slows, [T.violent.slow]);
  assert.deepEqual(w.stops, [T.violent.stop]);
  assert.deepEqual(w.pushes, [[T.violent.push, 0]], 'along the blow: from him to the man');
  assert.deepEqual(w.shakes, [T.violent.shake]);
  assert.deepEqual(w.blood.map((b) => [b[0], b[1], b[2], b[4]]), [[40, 0, 0, T.violent.blood[0]]]);
  assert.deepEqual(w.sounds, [KILLCAM.sounds.in]);
  pass(w, 0.07);
  assert.ok(w.cam.scale > 1 + (T.violent.zoom - 1) * 0.9, `snapped in (${w.cam.scale})`);
  assert.ok(w.cam.pull > 0, 'the view drawn toward the kill');
  pass(w, 1.2);
  assert.equal(w.cam.beat, null);
  assert.equal(w.cam.scale, 1);
  assert.equal(w.cam.pull, 0);
  assert.equal(w.cam.out, null);
  const at = w.cam.aim(5, 6);
  assert.deepEqual([at.x, at.y], [5, 6]);
});

test('killcam: the time ramp: the clock drops at once, holds, snaps back, and the zoom whips past 1 before it settles', () => {
  const w = world(true, []);
  w.enemies.push(guard({ x: 900, y: 900 }));
  w.lineOfSight = () => false;
  kill(w, {}, 2); // the last in sight: the end beat
  assert.equal(w.cam.beat.tier, 'end');
  pass(w, DT);
  assert.equal(w.ts, T.end.slow[0], 'down at once, no fade in');
  pass(w, T.end.slow[1] - 3 * DT);
  assert.ok(Math.abs(w.ts - T.end.slow[0]) < 1e-6, 'held');
  assert.ok(w.cam.beat, 'the camera in as long as the slow lasts');
  assert.deepEqual(w.outs, []);
  pass(w, 3 * DT);
  assert.equal(w.ts, 1, 'snapped back, no fade out');
  assert.deepEqual(w.outs, ['end']);
  assert.deepEqual(w.sounds, [KILLCAM.sounds.in, KILLCAM.sounds.out]);
  assert.equal(w.cam.beat, null);
  // the release: the zoom swings once past the usual view, then is exactly on it
  pass(w, 0.6);
  assert.ok(w.low < 1 && w.low > 0.95, `a short overshoot (${w.low})`);
  assert.equal(w.cam.scale, 1);
  assert.equal(w.cam.out, null);
  // a slow motion of somebody else's still running is left alone by the snap
  const v = world();
  kill(v, { left: 'headless' });
  pass(v, 0.1);
  v.game.slow = { scale: 0.4, t: 2 };
  pass(v, 0.4);
  assert.ok(v.ts <= 0.5, `back to what the game asks, not to 1 (${v.ts})`);
});

test('killcam: an execution is pushed in from its start, every blow held, the last the heaviest, let go as he stands', () => {
  const w = world(), man = guard({ x: 20, y: 0, knocked: 2 });
  w.enemies.push(man);
  w.player.execution = { target: man, dead: false, f: { quick: false } };
  pass(w, 0.3);
  assert.equal(w.cam.beat.tier, 'exec');
  assert.ok(Math.abs(w.cam.scale - T.exec.zoom) < 1e-9, 'in on the pair before the blow');
  assert.deepEqual([w.slows, w.beats], [[], []], 'no slow motion before the blow');
  // two blows that do not kill: each held an instant, the camera kicked in
  w.events.emit('blow', { byPlayer: true, lethal: false, power: 0.6 });
  w.events.emit('blow', { byPlayer: true, lethal: false, power: 0.6 });
  w.events.emit('blow', { byPlayer: false, lethal: false, power: 0.6 }); // not his
  assert.deepEqual(w.stops, [T.exec.blow.stop, T.exec.blow.stop]);
  assert.deepEqual(w.punches, [T.exec.blow.punch, T.exec.blow.punch]);
  pass(w, 1.6); // a long finisher: held all along, a heartbeat under it
  assert.ok(Math.abs(w.cam.scale - T.exec.zoom) < 1e-9);
  assert.ok(w.sounds.filter((s) => s === KILLCAM.sounds.heart).length >= 2);
  // the killing blow
  w.player.execution.dead = true;
  kill(w, { cause: 'melee', how: { finisher: true, label: 'CURB' } }, 1, man);
  w.events.emit('blow', { byPlayer: true, lethal: true, power: 1 });
  assert.deepEqual(w.slows, [T.exec.slow]);
  assert.deepEqual(w.stops.slice(2), [T.exec.stop]);
  assert.ok(T.exec.stop > T.exec.blow.stop && T.exec.stop > MOMENTS.finisher.stop, 'the heaviest');
  assert.equal(w.cam.beat.pair, man);
  pass(w, 1);
  assert.ok(w.cam.scale > 1.3, 'held on the pair through the rest of it');
  assert.deepEqual(w.outs, ['exec']);
  // a blow on the body afterwards is held too
  w.events.emit('blow', { byPlayer: true, lethal: false, power: 0.6 });
  assert.equal(w.stops.length, 4);
  w.player.execution = null;
  pass(w, T.exec.hold - 0.05);
  assert.ok(w.cam.scale > 1.3, 'its hold');
  pass(w, 1.2);
  assert.equal(w.cam.scale, 1);
  assert.deepEqual(w.beats, ['exec']);
  // a blow outside a finisher is nobody's business here
  w.events.emit('blow', { byPlayer: true, lethal: false, power: 0.6 });
  assert.equal(w.stops.length, 4);
});

test('killcam: an execution walked out of lets the camera go', () => {
  const w = world(), man = guard({ x: 20, knocked: 2 });
  w.enemies.push(man);
  w.player.takedown = { target: man };
  pass(w, 0.3);
  assert.ok(w.cam.scale > 1.2);
  w.player.takedown = null;
  pass(w, 1.2);
  assert.equal(w.cam.scale, 1);
});

test('killcam: the chain is a crescendo from its third kill, and its end the big release', () => {
  const w = world();
  const tops = [], ks = [];
  w.events.on('killcam', (e) => ks.push(e.k));
  for (let n = 1; n <= 6; n++) {
    kill(w, {}, n);
    tops.push(pass(w, 0.8));
  }
  assert.equal(tops[0], 1);
  assert.equal(tops[1], 1);
  assert.ok(tops[2] > 1 && tops[3] > tops[2] && tops[4] > tops[3] && tops[5] > tops[4], `more with the chain (${tops})`);
  assert.ok(tops[5] < T.violent.zoom + C.zoom * 4, 'a nudge');
  // each a tick of slow, deeper and longer than the last; the lens hit harder
  assert.equal(w.slows.length, 4);
  assert.ok(Math.abs(w.slows[0][0] - (T.combo.slow[0] - C.slow)) < 1e-9 && Math.abs(w.slows[0][1] - (T.combo.slow[1] + C.hold)) < 1e-9);
  for (let i = 1; i < 4; i++) assert.ok(w.slows[i][0] < w.slows[i - 1][0] && w.slows[i][1] > w.slows[i - 1][1]);
  for (let i = 1; i < 4; i++) assert.ok(ks[i] > ks[i - 1] && ks[0] > 1);
  assert.equal(w.cam.steps(40), C.steps, 'capped');
  assert.equal(w.cam.scale, 1);
  // a violent kill late in a chain hits harder than one that opens it
  const a = world(), b = world();
  kill(a, { left: 'headless' }, 1);
  kill(b, { left: 'headless' }, 6);
  assert.ok(b.cam.beat.zoom > a.cam.beat.zoom && b.slows[0][0] < a.slows[0][0] && b.slows[0][1] > a.slows[0][1]);
  assert.ok(b.slows[0][0] >= C.floor);
  // the chain runs out: its last body, the strongest beat of all
  pass(w, 3);
  w.events.emit('chainEnd', { kills: 6, points: 4000 });
  assert.equal(w.cam.beat.tier, 'end');
  const end = w.slows.at(-1);
  assert.ok(end[0] < T.end.slow[0] && end[1] > T.end.slow[1], 'the crescendo is in it too');
  assert.equal(w.stops.at(-1), T.end.stop);
  const top = pass(w, 0.5);
  assert.ok(top > Math.max(...tops) && top > T.exec.zoom, `the strongest (${top})`);
  pass(w, 2);
  assert.equal(w.cam.scale, 1);
  // a short chain cashes in without one
  const v = world();
  kill(v, {}, 2);
  pass(v, 4);
  v.events.emit('chainEnd', { kills: 2, points: 900 });
  assert.equal(v.cam.beat, null);
});

test('killcam: the tiers go up: zoom, slow motion, hit-stop', () => {
  const order = ['combo', 'violent', 'exec', 'end'].map((k) => T[k]);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].rank > order[i - 1].rank && order[i].zoom > order[i - 1].zoom);
    assert.ok(order[i].slow[0] < order[i - 1].slow[0] && order[i].slow[1] > order[i - 1].slow[1]);
    assert.ok((order[i].stop ?? 0) >= (order[i - 1].stop ?? 0) || order[i] === T.end);
  }
});

test('killcam: the last man in sight of a chain, a triple kill: the end beat, once', () => {
  const w = world(true, []);
  w.enemies.push(guard({ x: 900, y: 900 })); // one left, far out of sight
  w.lineOfSight = () => false;
  const g = kill(w, {}, 2);
  assert.equal(w.cam.beat.tier, 'end');
  // MOMENTS' own last-in-sight breath is weaker: never on top of it
  killBeat(w, g, w.player);
  assert.equal(w.slows.length, 1);
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
  assert.equal(v.slows.length, 2);
  assert.deepEqual(v.beats, ['violent', 'end']);
});

test('killcam: a gap after a beat, so that a fight is not a slideshow', () => {
  const w = world();
  kill(w, { left: 'headless' });
  pass(w, 0.7); // the beat is over, its gap is not
  assert.equal(w.cam.beat, null);
  kill(w, { left: 'headless' }, 2);
  assert.equal(w.cam.beat, null);
  assert.equal(w.slows.length, 1);
  pass(w, T.violent.gap);
  kill(w, { left: 'headless' }, 2);
  assert.equal(w.cam.beat.tier, 'violent');
  assert.equal(w.slows.length, 2);
  assert.ok(T.violent.gap >= 1 && T.end.gap >= 2);
});

test('killcam: off, nothing at all', () => {
  const w = world(false), man = guard({ x: 20, knocked: 2 });
  w.enemies.push(man);
  w.player.execution = { target: man, dead: false, f: { quick: false } };
  pass(w, 0.5);
  w.events.emit('blow', { byPlayer: true, lethal: false, power: 0.6 });
  kill(w, { cause: 'melee', how: { finisher: true } }, 1, man);
  kill(w, { left: 'gibs' }, 2);
  w.events.emit('chainEnd', { kills: 6, points: 1 });
  assert.equal(pass(w, 1), 1);
  assert.equal(w.ts, 1);
  assert.deepEqual([w.slows, w.stops, w.beats, w.pushes, w.sounds, w.cam.beat], [[], [], [], [], [], null]);
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
  // he dies: nothing from this, what was under way goes, and the clock is the death's own
  const d = world();
  kill(d, { left: 'gibs' });
  assert.ok(d.cam.beat);
  d.player.alive = false;
  d.events.emit('kill', { victim: d.player, cause: 'bullet', killer: guard() });
  assert.equal(d.cam.beat, null);
  assert.equal(d.cam.clock(0.9, 0.18), 0.9, 'no drop, no snap');
  kill(d, { left: 'gibs' }, 2);
  assert.equal(d.cam.beat, null);
  assert.deepEqual(d.beats, ['violent']);
});

test('killcam: a gunman after him is never zoomed out of the picture', () => {
  // by the edge of the usual view: the zoom would cut him out, so there is none; the slow motion stays
  const w = world(true, [guard({ x: 250, y: 0, def: { kind: 'gun' } })]);
  kill(w, { left: 'headless' });
  assert.equal(pass(w, 0.3), 1);
  assert.equal(w.slows.length, 1);
  // further in: a smaller zoom that keeps him in, with its margin
  const m = world(true, [guard({ x: 215, y: 0, def: { kind: 'gun' } })]);
  kill(m, { left: 'headless' });
  const top = pass(m, 0.15);
  assert.ok(top > 1 && top < T.violent.zoom - 0.02, `held back (${top})`);
  const cx = m.cam.at.x * T.violent.pull;
  assert.ok(Math.abs(215 - cx) + KILLCAM.guard.margin <= VIEW.hw / top + 1e-6, 'still in the picture');
  // one who has not seen him, or with no gun, or outside the usual view anyway, does not count
  for (const g of [guard({ x: 240, aware: 0, def: { kind: 'gun' } }), guard({ x: 240 }), guard({ x: 400, def: { kind: 'gun' } })]) {
    const f = world(true, [g]);
    kill(f, { left: 'headless' });
    assert.ok(pass(f, 0.3) > 1.15);
  }
});

test('killcam: a thrown kill is the throw\'s own beat: it only counts for the chain', () => {
  const w = world();
  kill(w, { cause: 'slash', how: { thrown: true } }, 1);
  kill(w, { cause: 'melee', how: { thrown: true, heavy: true, broke: true } }, 2);
  kill(w, { cause: 'slash', how: { thrown: true } }, 3);
  assert.equal(w.cam.beat, null);
  assert.deepEqual([w.slows, w.stops, w.beats], [[], [], []]);
  assert.equal(w.cam.lastKill.n, 3, 'counted');
  pass(w, 4);
  w.events.emit('chainEnd', { kills: 3, points: 1 });
  assert.equal(w.cam.beat.tier, 'end', 'the chain\'s end still comes back to it');
  // a beat under way lets go when a throw lands
  const z = world();
  kill(z, { left: 'headless' });
  assert.ok(z.cam.beat);
  z.events.emit('thrownHit', { thrower: z.player, kill: false });
  assert.equal(z.cam.beat, null);
});

test('killcam: the view is drawn toward the kill but keeps him in the picture', () => {
  const w = world(true, []);
  kill(w, {}, 3, guard({ x: 240, y: 0 })); // the last of all: the end beat, onto the body
  pass(w, 0.3);
  assert.ok(w.cam.pull > 0.9);
  const frame = { x: 0, y: 0, hw: VIEW.hw / w.cam.scale, hh: VIEW.hh / w.cam.scale };
  const at = w.cam.aim(0, 0, frame);
  assert.ok(at.x > 60 && at.x <= frame.hw * KILLCAM.keep + 1e-9, `toward the body, him still in (${at.x})`);
});

test('killcam: the lens takes a beat: fringe, the colours pushed, the vignette in while it lasts, a frame for the heaviest', () => {
  const ev = new EventBus(), lens = new Lens(), K = POST.killcam;
  const view = { W: 1280, H: 720, scale: 3, toScreen: (x, y) => ({ x, y }), state: 'play', phase: 'normal', timeScale: 1, trauma: 0, combo: 0 };
  lens.bind(ev);
  ev.emit('killcam', { tier: 'combo', k: 1, hold: 0.1 });
  assert.equal(lens.frame, 0);
  assert.ok(Math.abs(lens.fringe - K.combo.fringe) < 1e-9);
  ev.emit('killcam', { tier: 'end', k: 1.3, hold: 0.7 });
  assert.equal(lens.frame, K.end.frame);
  assert.ok(lens.kick >= Math.min(1.6, K.end.kick * 1.3) - 1e-9);
  const rest = lens.uniforms(view).vignette;
  for (let i = 0; i < 20; i++) lens.update(DT, view);
  const inV = lens.uniforms(view).vignette;
  assert.ok(inV > rest + K.end.close * 0.9 && inV <= rest + K.max + 1e-9, 'pulled in, capped');
  assert.equal(lens.frame, 0, 'a frame or five, no more');
  // the clock snaps back: a flick of fringe, the vignette opens again
  const f = lens.fringe;
  ev.emit('killcamOut', { tier: 'end' });
  assert.ok(lens.fringe > f);
  for (let i = 0; i < 60; i++) lens.update(DT, view);
  assert.ok(Math.abs(lens.uniforms(view).vignette - rest) < 1e-3);
});

test('killcam: the kill that opens a boss\'s own shot is his: no beat, now or at the chain\'s end', () => {
  // the last man: a plain guard would have the end beat
  const w = world(true, []), boss = guard({ boss: true, traits: { shot: { down: ['bossDown', 2.6] } } });
  kill(w, { cause: 'melee', how: { boss: 'cueball', heavy: true } }, 4, boss);
  assert.equal(w.cam.beat, null);
  w.events.emit('chainEnd', { kills: 6 });
  assert.deepEqual(w.beats, []);
  // a boss's shot under way (asked as it is, not a frame late): nothing either
  const s = world();
  s.bossStage = { shot: () => ({ name: 'bossHurt', at: { x: 0, y: 0 } }) };
  kill(s, { left: 'gibs' });
  assert.deepEqual(s.beats, []);
});

test('killcam: never in the tutorial', () => {
  const w = world();
  w.tutorial = {};
  kill(w, { left: 'gibs' });
  assert.equal(w.cam.beat, null);
  assert.deepEqual(w.beats, []);
});

test('killcam: a beat cut short in its slow motion tells the lens, which lets its vignette go', () => {
  const w = world(), cuts = [];
  w.events.on('killcamCut', (e) => cuts.push(e.tier));
  kill(w, { left: 'gibs' });
  pass(w, DT);
  assert.ok(w.cam.beat?.slow > 0);
  w.cam.cancel();
  assert.deepEqual(cuts, ['violent']);
  // its slow motion over and let go: the out, no cut
  const o = world(), oc = [];
  o.events.on('killcamCut', (e) => oc.push(e.tier));
  kill(o, { left: 'gibs' });
  pass(o, 2);
  assert.deepEqual([o.outs, oc], [['violent'], []]);
  // the lens
  const ev = new EventBus(), lens = new Lens();
  lens.bind(ev);
  ev.emit('killcam', { tier: 'end', k: 1, hold: 0.7 });
  assert.ok(lens.closeT > 0);
  ev.emit('killcamCut', { tier: 'end' });
  assert.equal(lens.closeT, 0);
});
