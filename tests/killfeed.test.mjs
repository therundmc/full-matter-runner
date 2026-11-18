import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { default: KillFeed, tierOf, tierColor } = await load('game/ui/KillFeed.js');
const { default: Scoring } = await load('game/systems/Scoring.js');
const { default: Director } = await load('game/ai/Director.js');
const { KILLFEED, MOMENTS } = await load('game/data/feel.js');
const { SCORING } = await load('game/data/scoring.js');
const { listenMoments, weakerSlow } = await load('game/fx/Impact.js');

const K = KILLFEED;
const player = (type) => ({ isPlayer: true, weapon: type ? { type } : null, swing: 0 });
const guard = (over = {}) => ({ isEnemy: true, x: 0, y: 0, aware: 2, knocked: 0, ...over });
// a world as far as Scoring and the feed go
const world = () => {
  const w = { events: new EventBus(), time: 0, texts: [], totalEnemies: 9, enemies: [] };
  w.scoring = new Scoring(w);
  w.feed = new KillFeed(w.events);
  return w;
};
const kill = (w, victim = guard()) => w.events.emit('kill', { victim, cause: 'bullet', killer: player('pistol') });
// both clocks on, the real one first (as in Game.update, before the world steps)
const pass = (w, sec) => { w.feed.update(sec); w.time += sec; w.scoring.update(); };

test('killfeed: a kill is stamped under the body with its points, on the real clock, apart from the barks', () => {
  const w = world();
  w.texts.push({ x: 0, y: -16, str: 'HEY!', t: 1.4, dur: 1.4, color: '#fff' }); // a bark
  kill(w, guard({ x: 100, y: 50 }));
  assert.equal(w.feed.stamps.length, 1);
  const s = w.feed.stamps[0];
  assert.deepEqual([s.x, s.y, s.points, s.kind], [100, 50 + K.stamp.lift, SCORING.styles.shot.points, 'kill']);
  assert.ok(s.y > 50, 'below him: the barks are above heads');
  assert.equal(s.size, K.stamp.size[0]);
  // it slams in from big and turned, lands square
  let v = w.feed.stampView(s);
  assert.ok(Math.abs(v.scale - K.stamp.from) < 1e-9 && v.rot !== 0);
  w.feed.update(K.stamp.slam + 0.01);
  v = w.feed.stampView(s);
  assert.equal(v.scale, 1);
  assert.ok(v.rot === 0);
  assert.ok(v.ghost > 0 && v.alpha === 1);
  // the world held still (a hit-stop): it goes on all the same, and is gone by its life
  w.feed.update(K.stamp.life);
  assert.equal(w.feed.stamps.length, 0);
  assert.equal(w.time, 0);
  // the barks were never touched
  assert.deepEqual(w.texts.map((t) => t.str), ['HEY!']);
});

test('killfeed: stamps grow with the chain; knock-downs and bonuses are small and white, a passer-by red and negative', () => {
  const w = world();
  for (let i = 0; i < 7; i++) { kill(w); pass(w, 0.1); }
  const sizes = w.feed.stamps.map((s) => s.size);
  assert.equal(sizes[0], K.stamp.size[0]);
  assert.equal(sizes.at(-1), K.stamp.size[1]);
  assert.ok(sizes.every((n, i) => i === 0 || n >= sizes[i - 1] && Number.isInteger(n)));
  assert.equal(w.feed.stamps.at(-1).color, 'neon', 'the top multiplier');
  w.events.emit('knock', { victim: guard({ x: 300 }), cause: 'throw', angle: 0 });
  assert.deepEqual([w.feed.stamps.at(-1).size, w.feed.stamps.at(-1).color], [K.stamp.knock, K.stamp.colors.knock]);
  kill(w, { isCivilian: true, x: 500, y: 0 });
  const c = w.feed.stamps.at(-1);
  assert.deepEqual([c.points, c.color], [-SCORING.civilian, K.stamp.colors.civilian]);
  // two stamps on the same spot do not cover each other
  const f = new KillFeed(new EventBus());
  f.scored({ x: 0, y: 0, points: 400, labels: [], combo: 1, multiplier: 1, kind: 'kill' });
  f.scored({ x: 2, y: 0, points: 600, labels: [], combo: 2, multiplier: 1.5, kind: 'kill' });
  assert.ok(f.stamps[1].y - f.stamps[0].y >= f.stamps[0].size);
});

test('killfeed: the chain count shows from the 2nd kill and climbs its tiers', () => {
  const w = world();
  kill(w);
  assert.equal(w.feed.panelView(), null);
  pass(w, 1);
  kill(w);
  const v = w.feed.panelView();
  assert.equal(v.chain, 2);
  assert.equal(v.multiplier, 1 + SCORING.combo.step);
  assert.ok(v.punch > 0 && v.flash === 1, 'it slams in');
  w.feed.update(0.5);
  const calm = w.feed.panelView();
  assert.deepEqual([calm.punch, calm.jolt, calm.flash, calm.open], [0, 0, 0, 1]);
  // white, yellow, orange, pink, then neon at the top multiplier
  assert.deepEqual([2, 3, 4, 5, 6].map((n) => tierColor(tierOf(n, 1 + (n - 1) * SCORING.combo.step))), ['white', 'yellow', 'orange', 'pink', 'pink']);
  assert.equal(tierColor(tierOf(7, SCORING.combo.max)), 'neon');
});

test('killfeed: the labels arrive newest first, a few at a time, at most 4, and fade', () => {
  const f = new KillFeed(new EventBus());
  f.scored({ x: 0, y: 0, points: 1, labels: ['A1', 'A2'], combo: 1, multiplier: 1, kind: 'kill' });
  f.update(0.5);
  f.scored({ x: 0, y: 0, points: 1, labels: ['B1', 'B2', 'B3'], combo: 2, multiplier: 1.5, kind: 'kill' });
  assert.deepEqual(f.lines.map((l) => l.str), ['B1', 'B2', 'B3', 'A1']);
  // staggered: the first one slides in at once, the others after it
  assert.deepEqual(f.lineViews().map((l) => l.str), ['B1', 'A1']);
  assert.ok(f.lineViews()[0].x === K.feed.dist && f.lineViews()[1].x === 0);
  f.update(K.feed.stagger * 3);
  assert.deepEqual(f.lineViews().map((l) => l.str), ['B1', 'B2', 'B3', 'A1']);
  f.update(K.feed.life);
  assert.deepEqual(f.lines, []);
});

test('killfeed: a chain of 2+ that runs out is cashed out with its points, the labels fade and the count folds', () => {
  const w = world(), c = SCORING.combo, S = SCORING.styles.shot.points;
  kill(w);
  pass(w, 1);
  kill(w, guard({ aware: 0 })); // UNSEEN
  pass(w, 0.1);
  assert.ok(w.feed.lines.length > 0);
  pass(w, c.window);
  const v = w.feed.cashView();
  assert.deepEqual([v.kills, v.points], [2, S + (S + SCORING.unseen) * (1 + c.step)]);
  assert.equal(w.feed.panel.endT, w.feed.t, 'the count folds');
  assert.ok(w.feed.lines.every((l) => l.end <= w.feed.t + K.feed.end));
  w.feed.update(K.panel.collapse + 0.01);
  assert.equal(w.feed.panelView(), null);
  assert.ok(w.feed.cashView().alpha === 1, 'it holds');
  w.feed.update(K.cash.slam + K.cash.hold + K.cash.fade);
  assert.equal(w.feed.cashView(), null);
  assert.deepEqual(w.feed.lines, []);
});

test('killfeed: a knock-down that gives the chain some air flashes its fuse', () => {
  const w = world();
  w.events.emit('knock', { victim: guard(), cause: 'throw', angle: 0 });
  assert.equal(w.feed.refill(), 0, 'no chain, nothing to refill');
  kill(w);
  w.events.emit('knock', { victim: guard(), cause: 'throw', angle: 0 });
  assert.equal(w.feed.refill(), 1);
  w.feed.update(K.fuse.refill);
  assert.equal(w.feed.refill(), 0);
});

test('killfeed: a multi-kill puts up its banner for a moment, and a moment of slow motion that never undercuts a stronger one', () => {
  const w = world();
  const slow = [], stops = [];
  w.game = { slow: null };
  w.slowmo = (scale, dur) => { slow.push([scale, dur]); w.game.slow = { scale, t: dur }; };
  w.hitstop = (s) => stops.push(s);
  listenMoments(w);
  kill(w);
  w.time = 0.2;
  kill(w);
  const b = w.feed.bannerView();
  assert.equal(b.label, 'DOUBLE KILL');
  assert.equal(b.size, K.banner.size.double);
  assert.deepEqual(slow, [MOMENTS.multi.double.slowmo]);
  assert.deepEqual(stops, [MOMENTS.multi.double.stop]);
  w.time = 0.4;
  kill(w);
  assert.equal(w.feed.bannerView().label, 'TRIPLE KILL');
  assert.deepEqual(slow.at(-1), MOMENTS.multi.triple.slowmo);
  w.feed.update(K.banner.life);
  assert.equal(w.feed.bannerView(), null);
  // the stronger of two slow motions stays: the last guard in sight's over a double kill, never the other way
  assert.ok(weakerSlow({ scale: MOMENTS.lastInRoom.slowmo[0], t: MOMENTS.lastInRoom.slowmo[1] }, ...MOMENTS.multi.double.slowmo));
  assert.ok(!weakerSlow({ scale: MOMENTS.multi.double.slowmo[0], t: MOMENTS.multi.double.slowmo[1] }, ...MOMENTS.lastInRoom.slowmo));
  w.game.slow = { scale: 0.1, t: 2 };
  w.time = 0.6;
  kill(w);
  assert.deepEqual(slow.at(-1), MOMENTS.multi.triple.slowmo, 'a massacre does not cut short a stronger slow motion');
  assert.deepEqual(stops.at(-1), MOMENTS.multi.massacre.stop);
});

test('killfeed: barks still go to the world texts as before', () => {
  const w = { time: 10, enemies: [], texts: [], events: new EventBus() };
  const feed = new KillFeed(w.events), d = new Director(w);
  assert.ok(d.bark({ x: 0, y: 0 }, 'clear'));
  assert.equal(w.texts.length, 1);
  assert.equal(feed.stamps.length + feed.lines.length, 0);
});
