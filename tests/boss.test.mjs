import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
const { TILE, ENEMY, AI } = await load('game/Config.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { BOSSES } = await load('game/data/bosses.js');
const { SCORING } = await load('game/data/scoring.js');
const { SHOTS } = await load('game/data/staging.js');
const { KILLFEED } = await load('game/data/feel.js');
const { POSTS } = await load('game/data/posts.js');
const { BARKS } = await load('game/data/barks.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { findPath } = await load('engine/nav/Pathfinding.js');
const { default: Enemy } = await load('game/entities/Enemy.js');
const { default: Boss, struckSide } = await load('game/entities/Boss.js');
const { default: Director } = await load('game/ai/Director.js');
const { default: Player } = await load('game/entities/Player.js');
const { default: BossStage } = await load('game/systems/BossStage.js');
const { default: KillFeed } = await load('game/ui/KillFeed.js');
const { killTags } = await load('game/systems/Scoring.js');
const { default: level1 } = await load('game/data/levels/level1.js');

const { default: lab } = await load('game/data/levels/lab.js');
const C = BOSSES.cueball;
const sink = new Proxy({}, { get: () => () => {} });

// CUEBALL in a bare room, the player in front of him; no physics engine: velocities are applied by hand
function room() {
  const rows = ['##################################'];
  for (let i = 0; i < 6; i++) rows.push('#' + '.'.repeat(32) + '#');
  rows.push(rows[0]);
  const map = new TileMap(rows), events = new EventBus();
  const log = { slow: [], scored: [], beats: [], sounds: [], kills: [], debris: [], items: [], corpses: [] };
  const world = {
    map, props: [], windows: [], fences: [], enemies: [], chars: [], doors: [], items: [], texts: [], time: 0, level: {}, events, cleared: false, tutorial: null,
    totalEnemies: 1, corpses: [],
    player: { alive: true, isPlayer: true, x: 5 * TILE, y: 3.5 * TILE, angle: 0, moving: 0, armed: true, def: WEAPONS.pistol, radius: 10,
      shoved(a, v) { this.thrown = { a, v }; } },
    particles: sink, decals: sink, camera: { x: 0, y: 0, viewRadius: () => ({ x: 1e4, y: 1e4 }), push() {} },
    scoring: { combo: 0 },
    sound: (name) => log.sounds.push(name), light() {}, emit() {}, addBody() {}, removeBody() {}, after() {}, floorAt: () => 'wood', noise() {},
    shake() {}, hitstop() {}, slowmo: (k, s) => log.slow.push([k, s]),
    addScore: (points, x, y, label) => log.scored.push([points, label]),
    addItem: (it) => log.items.push(it), removeItem(it) { it.dead = true; }, addDebris: (d) => log.debris.push(d), addCorpse: (c) => log.corpses.push(c),
    onKill: (ch, cause, killer, how) => log.kills.push({ ch, cause, how }),
    sightLine: () => true, lineOfSight: () => true, pathForGuard: (a, b, c, d) => findPath(map, a, b, c, d),
    get enemiesLeft() { return this.enemies.filter((e) => e.alive && !e.yielded).length; },
  };
  events.on('boss', (e) => log.beats.push(e.beat));
  const b = new Boss(world, 12.5 * TILE, 3.5 * TILE, Math.PI, 'cueball', 'shotgun');
  world.enemies.push(b); world.chars.push(b);
  world.director = new Director(world);
  // in the fight, his gun in his hands, the player in his sights
  b.perceive = function () { this.sees = true; this.aware = 2; };
  b.scanWorld = () => {};
  b.updateCarry = function () { this.stow = 0; this.lower = 0; };
  b.stow = 0; b.lower = 0;
  const shots = [];
  b.fire = function () { shots.push(world.time); this.weapon.mag--; };
  const step = (s, each) => {
    for (let t = 0; t < s; t += 1 / 60) {
      world.time += 1 / 60;
      b.update(1 / 60);
      const v = Matter.Body.getVelocity(b.body);
      Matter.Body.setPosition(b.body, { x: b.x + v.x, y: b.y + v.y });
      each?.();
    }
  };
  return { world, b, log, shots, step };
}

test('level 1: the boss of the back room is CUEBALL, his own kind at the boss post, with the pump-action', () => {
  assert.equal(level1.looks['28,9'], 'cueball');
  assert.equal(level1.jobs['28,9'], 'cueball');
  assert.ok(BOSSES[level1.looks['28,9']] && POSTS.cueball && BARKS.cueball.length >= 3);
  assert.equal(level1.actors[9][28].toLowerCase(), 'h', 'the actor that carries the shotgun');
  assert.equal(Object.values(level1.looks).filter((k) => BOSSES[k]).length, 1, 'one boss');
  const { b } = room();
  assert.ok(b instanceof Enemy && b.boss && b.kind === 'cueball' && b.weapon.type === 'shotgun');
  assert.equal(b.nick, 'CUEBALL');
  b.takeJob('cueball');
  assert.ok(b.boss && b.job === 'cueball' && !b.ashtray, 'at his desk, and no cigar');
});

test('cueball: the first hit wounds him and does not kill, the second kills', () => {
  const { world, b, log, step } = room();
  b.spot(false);
  const pace = b.pace;
  b.kill(0, 'bullet', world.player, WEAPONS.pistol, {});
  assert.ok(b.alive && b.wounded, 'still standing');
  assert.ok(b.weapon, 'his gun still in his hands');
  assert.deepEqual(log.scored, [[C.wound.points, 'WOUNDED']]);
  assert.deepEqual(log.slow.at(-1), C.wound.slowmo, 'a slow-motion beat');
  assert.ok(log.sounds.includes('bossHowl') && log.beats.includes('wounded'));
  assert.ok(world.texts.some((t) => t.bubble && t.who === b && C.lines.wounded.includes(t.str)));
  assert.equal(b.hurtAt, C.spots.front, 'the round came from in front of him');
  assert.ok(Math.hypot(b.vel.x, b.vel.y) >= C.wound.back - 1e-6, 'thrown back');
  // the other pellets of the same blast do nothing more
  b.kill(0, 'blast', world.player, WEAPONS.shotgun, {});
  assert.ok(b.alive && log.kills.length === 0);
  // he reels, roars, then comes on faster
  step(C.wound.stagger + C.berserk.roar + 0.1);
  assert.ok(b.alive && b.reel <= 0 && log.beats.includes('berserk') && log.sounds.includes('bossRoar'));
  assert.ok(Math.abs(b.pace - pace * C.berserk.speed) < 1e-9);
  // the second one
  b.kill(0, 'bullet', world.player, WEAPONS.pistol, {});
  assert.ok(!b.alive);
  assert.equal(log.kills.length, 1);
  assert.equal(log.kills[0].how.boss, 'cueball');
  assert.equal(log.kills[0].how.dying, 'kneel', 'onto his knees, then onto his face');
  assert.deepEqual(log.slow.at(-1), C.death.slowmo, 'a lingering slow motion');
  assert.ok(log.items.length === 1 && Math.hypot(log.items[0].body.velocity.x, log.items[0].body.velocity.y) > 0, 'his shotgun flies');
  assert.equal(log.debris.length, 1, 'his shades come off');
  assert.ok(log.beats.includes('down') && log.sounds.includes('bossDeath'));
});

test('cueball: where the blow struck him is where the wound shows', () => {
  assert.equal(struckSide(0, Math.PI), 'front');
  assert.equal(struckSide(0, 0), 'behind');
  assert.equal(struckSide(0, -Math.PI / 2), 'right', 'a blow going up the screen comes from below: his right, facing east');
  assert.equal(struckSide(0, Math.PI / 2), 'left');
  for (const s of Object.values(C.spots)) assert.ok(Math.hypot(s.at[0] - 0.9, s.at[1]) > 5.2, 'clear of his head');
  assert.ok(C.spots.left.limp && C.spots.behind.hand);
});

test('cueball: his kill is named and pays big', () => {
  assert.equal(SCORING.tags.cueball.label, 'CUEBALL');
  assert.ok(SCORING.tags.cueball.points >= Math.max(...Object.entries(SCORING.tags).filter(([k]) => k !== 'cueball').map(([, t]) => t.points)) * 2);
  const ctx = { now: 10, dodgeT: -9, pickT: -9, streak: 1 };
  assert.deepEqual(killTags({ killer: {}, how: { boss: 'cueball' } }, ctx), ['cueball']);
  assert.deepEqual(killTags({ killer: {}, how: {} }, ctx), []);
});

test('cueball: his pump-action fires every 0.45 to 0.55 s, each shot told by the pump and a glint; berserk, faster', () => {
  const gaps = (wounded) => {
    const { world, b, shots, step } = room();
    if (wounded) { b.kill(0, 'bullet', world.player, WEAPONS.pistol, {}); step(C.wound.stagger + C.berserk.roar + 0.05); }
    b.spot(false);
    let told = 0, racks = 0;
    const s0 = b.world.sound;
    b.world.sound = (name, ...r) => { if (name === 'rack') racks++; s0(name, ...r); };
    step(5, () => { b.weapon.mag = Math.max(b.weapon.mag, 3); if (b.tellK > 0) told++; });
    const out = [];
    for (let i = 1; i < shots.length; i++) out.push(shots[i] - shots[i - 1]);
    assert.ok(out.length >= 6, `shots: ${shots.length}`);
    assert.ok(racks >= out.length, 'the pump is heard after every shot');
    assert.ok(told >= shots.length * 6, 'the glint shows before every shot');
    return out;
  };
  const calm = gaps(false), mad = gaps(true);
  for (const g of [...calm, ...mad]) assert.ok(g >= 0.45 - 1e-6 && g <= 0.55 + 1 / 60 + 1e-6, `gap ${g.toFixed(3)}`);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(mad) < mean(calm), `berserk ${mean(mad).toFixed(3)} < ${mean(calm).toFixed(3)}`);
  assert.ok(C.fire.interval[0] >= 0.45 && C.fire.interval[1] <= 0.55 && C.berserk.interval[0] >= 0.45 && C.berserk.interval[1] <= C.fire.interval[0]);
  assert.ok(C.fire.tell >= 0.15 && C.fire.pump + C.fire.rack + C.fire.tell <= C.berserk.interval[0], 'the pump, then the glint, inside one cycle');
  // a plain guard with the same gun is three times slower
  assert.ok(WEAPONS.shotgun.enemyRate * ENEMY.fireRateMul * 0.85 > 2 * C.fire.interval[1]);
});

test('cueball: quicker on the trigger than a guard, his word and his card first; he walks at the player firing', () => {
  const { world, b, log, shots, step } = room();
  b.spot(false);
  assert.ok(log.beats.includes('intro') && log.sounds.includes('bossCard'));
  assert.ok(world.texts.some((t) => t.bubble && C.lines.intro.includes(t.str)));
  assert.deepEqual(log.slow.at(-1), C.intro.slowmo);
  assert.ok(b.react >= C.intro.hold && b.react <= Math.max(C.intro.hold, ENEMY.reaction[1] * C.react) + 1e-9);
  const x0 = b.x, t0 = world.time;
  step(3, () => { b.weapon.mag = Math.max(b.weapon.mag, 3); });
  assert.ok(shots[0] - t0 <= C.intro.hold + C.fire.tell + 0.3, `first shot after ${(shots[0] - t0).toFixed(2)} s`);
  assert.equal(b.tactic, 'advance');
  assert.ok(x0 - b.x > 40, 'he came on');
  // seen again later: half a guard's reaction
  b.setState('hunt');
  b.spot(false);
  assert.ok(b.react <= ENEMY.reaction[1] * C.react + 1e-9);
  assert.equal(log.beats.filter((x) => x === 'intro').length, 1, 'the card once');
});

test('cueball: berserk he is faster on his feet', () => {
  const run = (wounded) => {
    const { world, b, step } = room();
    b.pace = 1;
    if (wounded) { b.kill(0, 'bullet', world.player, WEAPONS.pistol, {}); step(C.wound.stagger + C.berserk.roar + 0.05); }
    b.spot(false);
    b.react = 0;
    Matter.Body.setPosition(b.body, { x: 28 * TILE, y: 3.5 * TILE });
    const x0 = b.x;
    step(1.5, () => { b.weapon.mag = 6; });
    return x0 - b.x;
  };
  const calm = run(false), mad = run(true);
  assert.ok(mad > calm * 1.25, `${mad.toFixed(0)} px against ${calm.toFixed(0)}`);
});

test('cueball: he reloads on his feet with a word, and it is the opening', () => {
  const { world, b, step } = room();
  b.spot(false);
  b.react = 0;
  b.weapon.mag = 0;
  step(0.6);
  assert.equal(b.tactic, 'reload');
  assert.ok(b.reloading > 0 && !b.kneel, 'standing');
  assert.ok(world.texts.some((t) => t.bubble && C.lines.reload.includes(t.str)));
});

test('cueball: bare blows he shrugs off, until one too many wounds him; wounded, a knock floors him', () => {
  const { world, b, log, step } = room();
  for (let i = 0; i < C.wound.fists; i++) {
    b.knock(0, 'punch');
    assert.ok(!b.wounded && !(b.knocked > 0) && b.weapon, 'on his feet, whole');
  }
  assert.ok(world.texts.some((t) => C.lines.shrug.includes(t.str)));
  assert.equal(b.aware, 2, 'and he is on to him');
  b.knock(0, 'punch');
  assert.ok(b.wounded && b.alive && !(b.knocked > 0), 'the one too many: wounded, still up');
  b.slip(0);
  assert.ok(!(b.knocked > 0));
  step(C.wound.stagger + C.berserk.roar + 0.1);
  b.knock(0, 'punch');
  assert.ok(b.knocked > 0 && b.knocked <= C.wound.down, 'floored');
  // finished on the floor: any finisher's kill does it, his own way down left to the finisher
  b.kill(0, 'execute', world.player, undefined, { finisher: true, label: 'CURB STOMP', still: true });
  assert.ok(!b.alive);
  assert.equal(log.kills[0].how.dying, undefined);
  assert.equal(log.kills[0].how.boss, 'cueball');
});

test('cueball: seized from behind while whole he throws the player off; wounded he can be taken', () => {
  const { world, b, log } = room();
  const p = Object.create(Player.prototype);
  Object.assign(p, { world, isPlayer: true, alive: true, angle: Math.PI, body: Matter.Bodies.circle(b.x + 18, b.y, 10), takedown: null });
  p.shoved = (a, v) => { p.thrown = { a, v }; };
  b.aware = 0;
  p.startTakedown(b, { f: { beats: [[0.3, 'seize']], after: 0.2 }, front: false });
  assert.equal(p.takedown, null, 'no takedown');
  assert.equal(b.held, null);
  assert.ok(p.thrown && p.thrown.v === C.shake.throw && Math.abs(p.thrown.a) < 1e-6, 'thrown back, away from him');
  assert.ok(b.alive && !b.wounded && b.aware === 2 && b.react >= C.shake.react, 'he comes round, with a beat before he can fire');
  assert.ok(log.sounds.includes('bossShake') && world.texts.some((t) => C.lines.shake.includes(t.str)));
  // again at once: still off, and he is not thrown twice
  p.thrown = null;
  p.startTakedown(b, { f: { beats: [[0.3, 'seize']], after: 0.2 }, front: false });
  assert.ok(p.takedown === null && p.thrown === null);
  // wounded: taken like anyone
  b.kill(0, 'bullet', world.player, WEAPONS.pistol, {});
  b.shakeT = 0;
  p.startTakedown(b, { f: { beats: [[0.3, 'seize']], after: 0.2 }, front: false });
  assert.ok(p.takedown && p.takedown.target === b && b.held === p);
});

test('cueball: the card and the camera on his beats, the soundtrack pushed up', () => {
  const events = new EventBus(), feed = new KillFeed(events), stage = new BossStage({ events });
  const boss = { traits: C, alive: true, x: 100, y: 50 };
  assert.equal(stage.shot(), null);
  events.emit('boss', { boss, beat: 'intro' });
  assert.equal(feed.banner.label, 'CUEBALL');
  assert.equal(feed.banner.size, KILLFEED.banner.card.size);
  feed.update(KILLFEED.banner.life + 0.1);
  assert.ok(feed.bannerView(), 'held longer than a multi-kill');
  feed.update(KILLFEED.banner.card.life);
  assert.equal(feed.bannerView(), null);
  assert.deepEqual(stage.shot(), { name: C.shot.intro[0], at: { x: 100, y: 50 } });
  boss.x = 120;
  stage.update(0.5);
  assert.equal(stage.shot().at.x, 120, 'it follows him');
  stage.update(C.shot.intro[1]);
  assert.equal(stage.shot(), null, 'then the usual view');
  events.emit('boss', { boss, beat: 'berserk' });
  assert.equal(stage.shot(), null, 'no shot of its own');
  events.emit('boss', { boss, beat: 'down' });
  boss.alive = false; boss.x = 999;
  stage.update(0.1);
  assert.equal(stage.shot().at.x, 120, 'it stays where he fell');
  for (const [name, hold] of Object.values(C.shot)) assert.ok(SHOTS[name] && SHOTS[name].zoom > 1 && hold > 0, name);
  assert.ok(AI.heat.boss >= AI.heat.kill);
});

test('lab: a CUEBALL station, the boss awake in his room, what to hit him with at his door, its stencil', () => {
  const [key] = Object.entries(lab.looks).find(([, k]) => k === 'cueball');
  const [col, row] = key.split(',').map(Number);
  assert.ok(lab.passive && lab.awake.includes(key), 'he fights among the dummies');
  assert.equal(lab.actors[row][col], 'h', 'with the pump-action');
  assert.ok(lab.floor.some(([name]) => name === 'label_cueball'));
  for (const kind of ['pistol', 'bat', 'knife']) {
    assert.ok(lab.drops.some(([k, x, y]) => k === kind && x > 60 && x < 63 && y > 8 && y < 11), `${kind} at his door`);
  }
  assert.ok(lab.props.some(([t, x, y]) => t === 'table' && x > 64 && x < 74 && y > 7 && y < 12), 'a table to tip over');
  assert.ok(lab.props.filter(([t, x, y]) => t === 'crate' && x > 64 && x < 74 && y > 7 && y < 12).length >= 2, 'cover');
  assert.equal(lab.tiles[9][63], 'D', 'behind a door at the concourse\'s east end');
});
