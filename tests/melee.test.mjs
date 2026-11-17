import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { WEAPONS } = await load('game/data/weapons.js');
const { default: Character } = await load('game/entities/Character.js');
const { default: Player } = await load('game/entities/Player.js');

// a world that only knows what a blow needs: every effect is a no-op
const noop = () => {};
const sink = new Proxy({}, { get: () => noop });
const world = (victims) => ({
  particles: sink, decals: sink, camera: sink, sound: noop, slowmo: noop, hitstop: noop, shake: noop, events: sink, time: 0,
  characters: () => victims, lineOfSight: () => true, props: [], windows: [], doors: [], corpses: [], debris: [], items: [],
  map: { isWallChar: () => false },
});
// a man with a weapon in hand, without a body in a physics world
function fighter(type, isPlayer = true) {
  const ch = Object.create((isPlayer ? Player : Character).prototype);
  Object.assign(ch, { isPlayer, team: isPlayer ? 'player' : 'enemy', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1,
    body: { position: { x: 0, y: 0 } } });
  ch.setWeapon(type);
  return ch;
}
const guard = (x = 12, y = 0, team = 'enemy') => ({
  alive: true, team, x, y, angle: Math.PI, radius: 8,
  kill(a, cause, killer, by, how) { this.alive = false; Object.assign(this, { a, cause, by, how }); },
});
// one blow of `ch` at whoever stands in `victims`
function swing(ch, victims, strike = 0) {
  ch.world = world(victims);
  ch.strike = strike;
  ch.meleeStrike(ch.def);
  return victims;
}

// (the player's weapon wearing out and breaking: tests/weaponbreak.test.mjs)
test('melee: the cue snaps into a weapon of its own, no other wears out into nothing', () => {
  assert.equal(WEAPONS.cue.snapOdds, undefined);
  assert.ok(WEAPONS[WEAPONS.cue.snaps].kind === 'melee');
  assert.equal(fighter('pistol').weapon.wear, undefined);
});

test('melee: guards never wear their weapons out', () => {
  const e = fighter('knife', false);
  for (let i = 0; i < 10; i++) swing(e, [guard(12, 0, 'player')]);
  assert.equal(e.weapon.type, 'knife');
  assert.equal(e.weapon.wear, WEAPONS.knife.wear);
});

test('melee: a spin takes whoever stands round him, a blade comes down overhead as a heavy blow', () => {
  const [g] = swing(fighter('tire_iron'), [guard(-20, 0)], 3); // behind him
  assert.ok(!g.alive && g.how.spin && !g.how.heavy);
  assert.ok(Math.abs(Math.abs(g.a) - Math.PI) < 1e-9, 'thrown the way the spin found him');
  const [h] = swing(fighter('tire_iron'), [guard(-20, 0)], 0);
  assert.ok(h.alive, 'a sweep does not reach behind');
  const [k] = swing(fighter('knife'), [guard()], 3);
  assert.ok(k.how.heavy && !k.how.spin);
});

// a flying weapon thrown by the player, `v` px/step towards a guard facing it
const { default: WeaponItem } = await load('game/entities/WeaponItem.js');
function flight(type, v) {
  const removed = [];
  const it = Object.create(WeaponItem.prototype);
  const w = { ...world([]), removeItem: (i) => removed.push(i), noise: noop };
  const g = { ...guard(10, 0), knocked: 0, knock(a, cause) { this.knockedBy = cause; } };
  w.characters = () => [g];
  const body = Matter.Bodies.rectangle(0, 0, 10, 4);
  Matter.Body.setVelocity(body, { x: v, y: 0 });
  Object.assign(it, { world: w, type, def: WEAPONS[type], thrower: fighter('pistol'), body });
  it.update(1 / 60);
  return { g, removed, it };
}

test('melee: a knife thrown fast plants itself in the man; a slow one or a bat only knocks him down', () => {
  const k = flight('knife', 12);
  assert.ok(!k.g.alive && k.g.cause === 'slash' && k.g.how.thrown && k.g.how.from);
  assert.equal(k.g.by.stuck, WEAPONS.knife.sprite);
  assert.equal(k.removed.length, 1);
  const slow = flight('knife', 4);
  assert.ok(slow.g.alive && slow.g.knockedBy === 'throw' && slow.removed.length === 0);
  const bat = flight('bat', 12);
  assert.ok(bat.g.alive && bat.g.knockedBy === 'throw' && bat.removed.length === 0);
});
