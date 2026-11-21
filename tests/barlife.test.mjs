// Level 1's bar life (2026-11-18): the customer at the arcade, the man doing his laundry, the guards who start
// bare-handed and run for their weapon once the fight is on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { sink } from './helpers.mjs';

const { arcadeAt, ARCADE, laundryAt, LAUNDRY } = await load('game/ai/Pastimes.js');
const { pastimeHands } = await load('game/render/PastimeArt.js');

test('arcade: games of about half a minute, the stick worked and the button hammered, a slap and a coin between two', () => {
  const seen = { play: 0, idle: 0, slap: 0, coin: 0, left: 0, right: 0, press: 0 };
  let games = new Set();
  for (let t = 0; t < 200; t += 1 / 30) {
    const f = arcadeAt(t, 0.31);
    games.add(f.n);
    if (f.play) {
      seen.play++;
      if (f.stick < -0.5) seen.left++;
      if (f.stick > 0.5) seen.right++;
      seen.press += f.press;
      assert.ok(f.stick >= -1 && f.stick <= 1);
    } else {
      seen.idle++;
      seen.slap += f.slap; seen.coin += f.coin;
      assert.equal(f.press, 0, 'no button between two games');
    }
  }
  assert.ok(games.size >= 6 && games.size <= 8, `${games.size} games in 200 s`);
  const share = seen.idle / (seen.play + seen.idle);
  assert.ok(Math.abs(share - ARCADE.between / ARCADE.round) < 0.03, `between two games ${share.toFixed(2)} of the time`);
  assert.ok(seen.left > 100 && seen.right > 100, 'the stick goes both ways');
  assert.ok(seen.press > seen.play * 0.2, 'the button hammered');
  assert.ok(seen.slap > 0 && seen.coin > 0, 'a slap and a coin');
  // two cabinets are not played in step
  assert.notDeepEqual([0, 5, 10].map((t) => arcadeAt(t, 0.31).stick), [0, 5, 10].map((t) => arcadeAt(t, 0.77).stick));
});

test('arcade: his hands on the stick (left) and the buttons (right), in front of him; a coin, a slap', () => {
  for (let t = 0; t < 40; t += 0.25) {
    const h = pastimeHands('arcade', t, 0.31), f = arcadeAt(t, 0.31);
    assert.ok(h.hl.x > 3 && h.hr.x > 3, 'reaching forward');
    if (f.play) assert.ok(h.hl.y < -2 && h.hr.y > 0, 'stick in the left hand, buttons under the right');
  }
});

test('laundry: piece after piece out of the drum, shaken out, folded, laid on the pile, carried to the basket when it is high', () => {
  const phases = new Set(), seed = 0.37;
  let last = -1, carried = 0, maxPile = 0, prev = null;
  for (let t = 0; t < 400; t += 1 / 20) {
    const f = laundryAt(t, seed);
    phases.add(f.phase);
    assert.ok(f.n >= last, 'turns only go forward');
    if (f.n !== last && prev) {
      // a turn ends: the pile has one more piece, or none after a carry, or as many after a look at the watch
      if (prev.phase === 'watch') assert.equal(f.pile, prev.pile);
    }
    if (f.phase === 'carry' && prev?.phase !== 'carry') carried++;
    maxPile = Math.max(maxPile, f.pile);
    assert.ok(f.pile >= 0 && f.pile <= LAUNDRY.pile);
    assert.ok(f.piece >= 0 && f.piece < 5);
    last = f.n; prev = f;
  }
  for (const p of ['reach', 'pull', 'shake', 'fold', 'lay', 'back', 'watch', 'carry']) assert.ok(phases.has(p), `phase ${p}`);
  assert.equal(maxPile, LAUNDRY.pile);
  assert.ok(carried >= 3, `${carried} piles carried over in 400 s`);
  // turns of their own length: the same seed the same, another seed another
  assert.deepEqual(laundryAt(123.4, seed), laundryAt(123.4, seed));
  assert.notEqual(laundryAt(50, 0.12).phase + laundryAt(51, 0.12).phase + laundryAt(53, 0.12).phase,
    laundryAt(50, seed).phase + laundryAt(51, seed).phase + laundryAt(53, seed).phase);
});

test('laundry: his hands into the drum ahead, apart to shake a piece out, to his right onto the pile, to his left to the basket', () => {
  const at = (phase) => {
    for (let t = 0; t < 400; t += 1 / 20) {
      const f = laundryAt(t, 0.37);
      if (f.phase === phase && f.u > 0.6 && f.u < 0.8) return t;
    }
    return null;
  };
  const hands = (phase) => pastimeHands('laundry', at(phase), 0.37);
  assert.ok(hands('reach').hl.x > 9 && hands('reach').hr.x > 9, 'into the drum');
  const sh = hands('shake');
  assert.ok(sh.hr.y - sh.hl.y > 10, 'a piece held out by its shoulders');
  assert.ok(hands('lay').hr.y > 5, 'onto the pile at his right');
  assert.ok(hands('watch').hl.x > 2, 'his watch up before his eyes');
});

// ---------------- guards who start bare-handed (level `arms`, Enemy.takeArms / armUp) ----------------
globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
const { TILE, AI } = await load('game/Config.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { findPath } = await load('engine/nav/Pathfinding.js');
const { default: Enemy } = await load('game/entities/Enemy.js');
const { keptAt } = await load('game/entities/enemy/Arms.js');
const { default: Director } = await load('game/ai/Director.js');
const { Body } = Matter;

// a bare room, a guard at one end, his bat stood against the wall at the other, the player in a corner far off
function room(arms = [14.5, 3.5]) {
  const rows = ['##################'];
  for (let i = 0; i < 6; i++) rows.push('#' + '.'.repeat(16) + '#');
  rows.push(rows[0]);
  const map = new TileMap(rows), events = new EventBus(), sounds = [];
  const bat = { type: 'bat', def: WEAPONS.bat, mag: 0, x: 14.5 * TILE, y: 3.5 * TILE, speed: 0, dead: false };
  const world = {
    map, props: [], windows: [], fences: [], enemies: [], chars: [], doors: [], items: [bat], texts: [], time: 0, level: {}, events,
    cleared: false, tutorial: null, totalEnemies: 1, corpses: [],
    player: { alive: true, isPlayer: true, x: 1.5 * TILE, y: 1.5 * TILE, angle: 0, moving: 0, armed: false, def: WEAPONS.fists, radius: 10 },
    particles: sink, decals: sink, camera: { x: 0, y: 0, viewRadius: () => ({ x: 1e4, y: 1e4 }), push() {} }, scoring: { combo: 0 },
    sound: (name) => sounds.push(name), light() {}, emit() {}, addBody() {}, removeBody() {}, after() {}, floorAt: () => 'wood', noise() {},
    shake() {}, hitstop() {}, addItem() {}, removeItem(it) { it.dead = true; }, sightLine: () => true, lineOfSight: () => true,
    pathForGuard: (a, b, c, d) => findPath(map, a, b, c, d),
    get enemiesLeft() { return this.enemies.filter((e) => e.alive).length; },
  };
  const g = new Enemy(world, 3.5 * TILE, 4.5 * TILE, 0, 'brute', 'bat');
  g.takeArms(arms);
  world.enemies.push(g); world.chars.push(g);
  world.director = new Director(world);
  g.scanWorld = () => {};
  return { world, g, bat, sounds };
}
const fight = (r) => { r.g.lastKnown = { x: r.world.player.x, y: r.world.player.y }; r.g.spot(false); };

test('arms: a guard whose bat is kept somewhere starts bare-handed and stays so while all is calm', () => {
  const { g, world, bat } = room();
  assert.equal(g.weapon, null, 'his fists');
  assert.deepEqual(g.arms, { at: { x: 14.5 * TILE, y: 3.5 * TILE }, done: false });
  assert.equal(keptAt(world.items, g.arms.at), bat, 'the bat stood there is his');
  assert.equal(g.armsDue(), false, 'nothing is up');
});

test('arms: once the fight is on he runs for his bat, snatches it up and comes with it', () => {
  const r = room(), { g, bat, sounds } = r;
  fight(r);
  assert.ok(g.armsDue(), 'in a fight, his hands empty, the player far off');
  g.armUp();
  assert.equal(g.state, 'fetch');
  assert.equal(g.fetchTarget, bat);
  assert.equal(g.armsDue(), false, 'once');
  // he gets there (no physics engine here: put him by it) and takes it
  Body.setPosition(g.body, { x: bat.x - 8, y: bat.y });
  g.doFetch(1 / 60);
  assert.equal(g.weapon?.type, 'bat');
  assert.ok(bat.dead, 'off the wall');
  assert.equal(g.state, 'combat', 'and back at him');
  assert.ok(sounds.includes('pickup'));
});

test('arms: shots heard, he goes for his bat before he goes to see, then on there with it', () => {
  const r = room(), { g, bat } = r;
  g.hear('gunshot', 8 * TILE, 1.5 * TILE);
  assert.ok(g.aware === 1 && g.urgent, 'off to see about it');
  assert.ok(g.armsDue());
  g.armUp();
  assert.equal(g.state, 'fetch');
  Body.setPosition(g.body, { x: bat.x - 8, y: bat.y });
  g.doFetch(1 / 60);
  assert.equal(g.weapon?.type, 'bat');
  assert.equal(g.state, 'investigate', 'the bat in his hands, on to where the shots came from');
  assert.equal(g.stim.kind, 'gunshot');
});

test('arms: the player on him, he uses his fists; his bat gone, he fights on with what there is; a brawler never looks for one', () => {
  const close = room();
  fight(close);
  close.g.sees = true;
  close.world.player.x = close.g.x + AI.arms.close - 10; close.world.player.y = close.g.y;
  assert.equal(close.g.armsDue(), false, 'no time to turn his back on him');

  const gone = room();
  gone.bat.dead = true; // the player took it
  fight(gone);
  gone.g.armUp();
  assert.notEqual(gone.g.state, 'fetch');
  assert.equal(gone.g.weapon, null);
  assert.ok(gone.g.arms.done);

  // on his way, the bat goes from under his nose: he gives it up and is back in the fight
  const late = room();
  fight(late);
  late.g.armUp();
  late.bat.dead = true;
  late.g.doFetch(1 / 60);
  assert.equal(late.g.state, 'combat');

  const fists = room('fists');
  assert.deepEqual(fists.g.arms, { fists: true });
  fight(fists);
  assert.equal(fists.g.armsDue(), false);
  assert.equal(fists.g.lookForWeapon(), false, 'a brawler: his fists, whatever lies about');
});
