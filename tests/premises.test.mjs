import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Director } = await load('game/ai/Director.js');
const { TILE } = await load('game/Config.js');
const { default: LEVELS } = await load('game/data/levels/index.js');

const world = (level) => ({ level, time: 0, enemies: [], events: { on() {}, emit() {} } });
const at = (col, row, armed = false) => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE, armed });

test('guards leave an unarmed stranger alone outside the premises, until he gives himself away', () => {
  const d = new Director(world({ premises: [[11, 0, 30, 19]] }));
  assert.equal(d.isThreat(at(21, 22)), false, 'on the sidewalk');
  assert.equal(d.isThreat(at(21, 22, true)), true, 'a weapon in hand');
  assert.equal(d.isThreat(at(21, 19)), true, 'through the door');
  d.sighted(0, 0);
  assert.equal(d.isThreat(at(21, 22)), true, 'once made, there is no going back');
});

test('a level without premises is hostile everywhere; level 1 starts the player on public ground', () => {
  assert.equal(new Director(world({})).isThreat(at(1, 1)), true);
  const d = new Director(world(LEVELS.level1));
  assert.equal(d.isThreat(at(21, 35)), false, 'the start alley');
  assert.equal(d.isThreat(at(21, 22)), false, 'the sidewalk in front of the bar');
  assert.equal(d.isThreat(at(22, 15)), false, 'the bar room is open to customers');
});

test('level 1: the bar room and its toilets are open, the private rooms are not, and customers are left alone', () => {
  const d = new Director(world(LEVELS.level1));
  for (const [col, row, what] of [[22, 13, 'by the door'], [27, 14, 'the pool table'], [20, 17, 'the card table'], [22, 8, 'the toilets']]) {
    assert.equal(d.isThreat(at(col, row)), false, what);
    assert.equal(d.isGuest(at(col, row)), true, `${what}: a customer`);
  }
  for (const [col, row, what] of [[27, 18, 'the VIP room'], [25, 18, 'its doorway'], [27, 8, 'the back room'], [17, 8, 'the storeroom'],
    [17, 12, 'behind the counter'], [12, 10, 'the service alley'], [20, 2, 'the back lot']]) {
    assert.equal(d.isThreat(at(col, row)), true, what);
  }
  assert.equal(d.isThreat(at(24, 18)), false, 'in front of the VIP door');
  assert.equal(d.isGuest(at(24, 18)), false, 'the bouncer does not let anyone hang about at his door');
  assert.equal(d.isGuest(at(21, 22)), false, 'nor does anyone on the sidewalk');
  assert.equal(new Director(world({})).isGuest(at(1, 1)), false);
  // walking into the VIP room unarmed: an intruder a guard goes after, not yet a man to shoot on sight from afar
  assert.equal(d.isIntruder(at(27, 18)), true);
  assert.equal(d.isIntruder(at(27, 18, true)), false, 'armed: a plain threat');
  assert.equal(d.isIntruder(at(22, 15)), false, 'a customer');
  d.provoked = true;
  assert.equal(d.isIntruder(at(27, 18)), false);
});
