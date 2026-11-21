// The world's gameplay dice (systems/Rng.js, world.rng): what decides the game is drawn from them, what only looks
// keeps Math.random, so a cosmetic change never shifts what a QA seed plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }) }) };
const { makeRng, dice } = await load('game/systems/Rng.js');
const { default: Pursuit } = await load('game/systems/Pursuit.js');
const { CHASE } = await load('game/data/chase.js');

test('rng: seeded dice give the same rolls for the same seed, others for another; a world with none rolls Math.random', () => {
  const a = makeRng(42), b = makeRng(42), c = makeRng(43);
  const roll = (r) => [r.next(), r.rand(2, 5), r.chance(0.5), r.spread()];
  const ra = roll(a);
  assert.deepEqual(ra, roll(b));
  assert.notDeepEqual(ra, roll(c));
  assert.ok(ra[1] >= 2 && ra[1] < 5 && Math.abs(ra[3]) <= 1);
  const w = { rng: a };
  assert.equal(dice(w), a);
  assert.equal(typeof dice({}).rand, 'function', 'a test\'s stub world: Math.random');
});

// the pursuers' decisions over a stretch of chase (their slots dealt again and again, the cooldowns after a tell and
// an attack), with `noise` cosmetic Math.random calls between each
function decisions(noise) {
  const world = { rng: makeRng(7), drive: null, time: 0 };
  const cars = [0, 1].map((n) => ({ n, state: 'chase', slot: 'abreast', rank: 0, settled: 0, v: { x: n * 100 }, telling: false, ram: 0 }));
  const P = Object.assign(Object.create(Pursuit.prototype), { world, C: CHASE.pursuit, G: CHASE.gunman, cars, crew: '', shuffleT: 0, road: null, tell: null, attack: null });
  const out = [];
  for (let i = 0; i < 40; i++) {
    for (let k = 0; k < noise; k++) Math.random();
    P.shuffleT = 0;
    P.assign(1 / 60, null);
    P.endTell();
    const t = P.cool;
    P.attack = { car: cars[0] };
    P.endAttack();
    out.push(cars.map((c) => c.slot).join(), P.shuffleT, t, P.cool);
  }
  return out;
}

test('rng: a cosmetic Math.random call does not change what the pursuers decide', () => {
  const quiet = decisions(0);
  assert.deepEqual(decisions(3), quiet);
  assert.deepEqual(decisions(17), quiet);
  assert.ok(new Set(quiet.filter((x) => typeof x === 'string')).size > 1, 'the slots do change from one dealing to the next');
});
