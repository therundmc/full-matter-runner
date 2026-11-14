import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { WEAPONS } = await load('game/data/weapons.js');
const { FEEL, MOMENTS, GESTURE, TELL, STROKE, HEAVY, familyOf } = await load('game/data/feel.js');
const { lastInSight } = await load('game/fx/Impact.js');
const { riseDurAt } = await load('game/entities/CharacterAnim.js');
const { default: Character } = await load('game/entities/Character.js');
const { default: Player } = await load('game/entities/Player.js');
const { default: Door } = await load('game/entities/Door.js');

const noop = () => {};
const sink = new Proxy({}, { get: () => noop });
const KINDS = ['punch', 'blunt', 'cut', 'bullet', 'finisher'];
const MUZZLES = ['star', 'burst', 'puff', 'tongue', 'spear', 'brake', 'blast'];
const inRange = (v, a, b, what) => assert.ok(typeof v === 'number' && v >= a && v <= b, `${what} = ${v}`);

test('feel: every weapon has a family, and every family is complete with values in range', () => {
  const used = new Set(Object.values(WEAPONS).map(familyOf));
  for (const f of used) assert.ok(FEEL[f], `no FEEL entry for ${f}`);
  assert.deepEqual([...used].sort(), Object.keys(FEEL).sort(), 'no family left without a weapon');
  for (const [name, f] of Object.entries(FEEL)) {
    assert.ok(KINDS.includes(f.kind), name);
    for (const k of ['power', 'stop', 'shake', 'push']) {
      assert.equal(f[k].length, 2, `${name}.${k}`);
      assert.ok(f[k][1] >= f[k][0], `${name}.${k}: a kill hits at least as hard`);
    }
    f.power.forEach((v) => inRange(v, 0, 1, `${name}.power`));
    f.stop.forEach((v) => inRange(v, 0, 0.12, `${name}.stop`));
    f.shake.forEach((v) => inRange(v, 0, 0.5, `${name}.shake`));
    f.push.forEach((v) => inRange(v, 0, 6, `${name}.push`));
    inRange(f.flash, 0, 0.05, `${name}.flash`);
    inRange(f.burst.rays, 0, 12, `${name}.burst.rays`);
    assert.ok(['star', 'slash', 'pop'].includes(f.burst.shape), name);
    if (f.kind === 'bullet') {
      inRange(f.fire.shake, 0, 1, `${name}.fire.shake`);
      inRange(f.fire.push, 0, 12, `${name}.fire.push`);
      assert.ok(MUZZLES.includes(f.muzzle.shape), name);
      inRange(f.muzzle.dur, 0.005, 0.07, `${name}.muzzle.dur`);
      inRange(f.muzzle.light, 0, 160, `${name}.muzzle.light`);
      inRange(f.round.wake, 0, 0.5, `${name}.round.wake`);
    } else {
      inRange(f.smear.life, 0.02, 0.2, `${name}.smear.life`);
      inRange(f.tell, 0.12, 0.4, `${name}.tell`);
    }
  }
  // heavier hits harder: a club over a stick over a blade, buckshot over a pistol
  assert.ok(FEEL.club.stop[1] > FEEL.stick.stop[1] && FEEL.stick.stop[1] > FEEL.blade.stop[1]);
  assert.ok(FEEL.shotgun.power[1] > FEEL.pistol.power[1] && FEEL.club.smear.width > FEEL.blade.smear.width);
  assert.ok(STROKE[0] < STROKE[1] && TELL.hold < STROKE[1] && HEAVY.stop > 1);
  for (const m of Object.values(MOMENTS)) if (m.power !== undefined) inRange(m.power, 0, 1, 'moment power');
});

test('feel: families come from the data (bat and tire iron are clubs, the cue a stick, buckshot a shotgun)', () => {
  assert.equal(familyOf(WEAPONS.fists), 'fists');
  assert.equal(familyOf(null), 'fists');
  assert.equal(familyOf(WEAPONS.bat), 'club');
  assert.equal(familyOf(WEAPONS.tire_iron), 'club');
  assert.equal(familyOf(WEAPONS.cue), 'stick');
  assert.equal(familyOf(WEAPONS.knife), 'blade');
  assert.equal(familyOf(WEAPONS.cue_half), 'blade');
  assert.equal(familyOf(WEAPONS.uzi_silenced), 'silenced');
  assert.equal(familyOf(WEAPONS.shotgun), 'shotgun');
  assert.equal(familyOf(WEAPONS.sniper), 'sniper');
});

// ---------------- the 'blow' event ----------------
function world(victims) {
  const blows = [], jolts = { stop: 0, shake: 0 };
  return {
    blows, jolts, particles: sink, decals: sink, camera: sink, sound: noop, slowmo: noop, time: 0, light: noop,
    hitstop: (s) => { jolts.stop = Math.max(jolts.stop, s); }, shake: (s) => { jolts.shake += s; },
    events: { emit: (name, e) => { if (name === 'blow') blows.push(e); } },
    characters: () => victims, lineOfSight: () => true, props: [], windows: [], doors: [], corpses: [], debris: [], items: [],
    map: { isWallChar: () => false },
  };
}
function fighter(type, isPlayer = true) {
  const ch = Object.create((isPlayer ? Player : Character).prototype);
  Object.assign(ch, { isPlayer, team: isPlayer ? 'player' : 'enemy', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1,
    radius: 8, cooldown: 0, swing: 0, tell: 0, body: { position: { x: 0, y: 0 } } });
  ch.setWeapon(type);
  return ch;
}
const man = (x = 12, y = 0, team = 'enemy') => ({
  alive: true, team, x, y, angle: Math.PI, radius: 8,
  kill() { this.alive = false; }, knock() { this.knocked = 1; },
});
function blow(ch, victims, strike = 0) {
  ch.world = world(victims);
  ch.strike = strike;
  ch.meleeStrike(ch.def);
  return ch.world;
}

test('blow event: once per man a blow lands on, with its kind, power, lethality and author', () => {
  const w = blow(fighter('bat'), [man(12, 0), man(14, 4)]);
  assert.equal(w.blows.length, 2);
  for (const b of w.blows) {
    assert.deepEqual(Object.keys(b).sort(), ['angle', 'byPlayer', 'kind', 'lethal', 'power', 'x', 'y']);
    assert.ok(b.kind === 'blunt' && b.lethal && b.byPlayer);
    assert.equal(b.power, FEEL.club.power[1]);
    assert.ok(b.x > 0 && b.x < 14, 'between the two of them');
  }
  assert.ok(w.jolts.stop >= FEEL.club.stop[1], 'the player\'s kill stops time');
  assert.equal(blow(fighter('bat'), [man(80, 0)]).blows.length, 0, 'a whiff lands on nobody');
  const k = blow(fighter('knife'), [man()], 2).blows[0];
  assert.ok(k.kind === 'cut' && k.power > FEEL.blade.power[1], 'the heavy stroke hits harder');
  const p = blow(fighter(null), [man()]).blows[0];
  assert.ok(p.kind === 'punch' && !p.lethal && p.power === FEEL.fists.power[0], 'a punch floors him, it does not kill');
});

test('blow event: a guard\'s blow on the player is not the player\'s, and does not stop time', () => {
  const pl = { ...man(12, 0, 'player'), isPlayer: true };
  const w = blow(fighter('knife', false), [pl]);
  assert.equal(w.blows.length, 1);
  assert.ok(!w.blows[0].byPlayer && w.blows[0].lethal);
  assert.equal(w.jolts.stop, 0);
});

test('blow event: a round that lands is a bullet, full power at close range, a share of it in pellets from afar', () => {
  const shoot = (type, dist) => {
    const v = fighter(null, false), w = world([]);
    v.world = w; v.x0 = 0;
    Object.defineProperty(v, 'x', { value: 100 }); Object.defineProperty(v, 'y', { value: 0 });
    v.kill = function () { this.alive = false; };
    v.shot(Math.PI, WEAPONS[type], dist, { isPlayer: true }, {});
    return w.blows;
  };
  const [s] = shoot('shotgun', 60);
  assert.ok(s.kind === 'bullet' && s.lethal && s.byPlayer && s.power === 1);
  assert.equal(s.x, 108, 'where it went in, on the side it came from');
  assert.ok(shoot('shotgun', 300)[0].power < s.power);
  assert.equal(shoot('pistol', 100).length, 1);
});

test('the last guard in sight: a breath of slow motion only when none is left in the player\'s sight close by', () => {
  const p = { x: 0, y: 0 }, v = { x: 10, y: 0, alive: false };
  const far = { x: 900, y: 0, alive: true }, near = { x: 100, y: 0, alive: true }, gone = { x: 50, y: 0, alive: true, yielded: true };
  assert.ok(lastInSight(p, v, [v, far, gone], 420, () => true));
  assert.ok(!lastInSight(p, v, [v, near], 420, () => true));
  assert.ok(lastInSight(p, v, [v, near], 420, () => false), 'behind a wall he does not count');
});

// ---------------- gestures ----------------
test('wind-up: a guard holds his blow for his weapon\'s tell, then it goes on from its anticipation', () => {
  const g = fighter('bat', false);
  g.world = world([]);
  assert.ok(g.windUp());
  assert.equal(g.tell, FEEL.club.tell);
  assert.ok(!g.windUp(), 'one at a time');
  assert.ok([0, 1, 2, 3].includes(g.strike));
  const strike = g.strike;
  g.world.after = noop;
  g.tell = 0;
  assert.ok(g.attack(true));
  assert.equal(g.strike, strike, 'the blow he wound up');
  assert.ok(Math.abs(1 - g.swing / g.swingDur - TELL.hold) < 1e-9);
  const gun = fighter('pistol', false);
  assert.ok(!gun.windUp(), 'a gun is not wound up');
});

test('getting up: it starts when the time left on the floor comes under its length, sooner if he is shaken awake', () => {
  const D = GESTURE.getup.dur;
  let r = 0;
  for (const k of [2.8, 1.5, D + 0.01]) { r = riseDurAt(r, k, D); assert.equal(r, 0); }
  r = riseDurAt(r, D - 0.01, D);
  assert.ok(Math.abs(r - (D - 0.01)) < 1e-9);
  assert.equal(riseDurAt(r, 0.3, D), r, 'it keeps its length once started');
  assert.equal(riseDurAt(r, 0, D), 0, 'up: over');
  assert.equal(riseDurAt(0, Infinity, D), 0, 'asleep: not yet');
  assert.equal(riseDurAt(0, 0.2, D), 0.2, 'woken by a mate: up in what is left');
});

test('trunk: he lifts the lid over the gesture, takes what is inside at its moment, and is busy until the end', () => {
  const p = fighter(null);
  const events = [];
  p.world = { ...world([]), events: { emit: (n) => events.push(n) }, pickupFlash: noop };
  p.steer = noop;
  const lifts = [];
  const car = {
    trunk: { item: 'tire_iron', open: false }, trunkSpot: () => ({ x: 10, y: 0 }),
    liftTrunk(k) { lifts.push(k); this.trunk.lift = k; }, takeFromTrunk() { const i = this.trunk.item; this.trunk.item = null; return i; },
  };
  p.nearTrunk = car;
  p.startTrunk(car);
  assert.ok(car.trunk.open && p.trunkOpen && !p.nearTrunk);
  const T = GESTURE.trunk, dt = 1 / 60;
  let steps = 0;
  while (p.trunkOpen && steps < 200) {
    p.updateTrunk(dt);
    steps++;
    if (steps * dt < T.take * T.dur - dt) assert.equal(p.weapon, null, 'not in his hand yet');
  }
  assert.ok(Math.abs(steps * dt - T.dur) < 2 * dt, 'about half a second');
  assert.equal(p.weapon.type, 'tire_iron');
  assert.equal(car.trunk.item, null);
  assert.ok(events.includes('pickup'));
  assert.equal(lifts[0], 0);
  assert.equal(lifts.at(-1), 1);
  for (let i = 1; i < lifts.length; i++) assert.ok(lifts[i] >= lifts[i - 1], 'the lid only comes up');
});

test('door hand: up while he pushes into the leaf, down once he lets go', () => {
  const door = Object.create(Door.prototype);
  Object.assign(door, { hx: 0, hy: 0, len: 30, back: 2, body: { angle: 0 } }); // a leaf along x from the hinge
  const out = { x: 0, y: 0, a: 0 };
  assert.ok(door.touch(15, 11, 12.5, out));
  assert.ok(Math.abs(out.x - 15) < 1e-9 && out.y === 3, 'on its face, on his side');
  assert.equal(door.touch(15, 40, 12.5, out), null, 'too far');
  assert.equal(door.touch(80, 0, 12.5, out), null, 'past its end');
  const ch = fighter(null);
  ch.radius = 8.5;
  ch.world = { doors: [door] };
  Object.defineProperty(ch, 'x', { value: 15 }); Object.defineProperty(ch, 'y', { value: 12 });
  const dt = 1 / 60, G = GESTURE.door;
  ch.updateDoorHand(dt, 1, { x: 0, y: -1 });
  assert.ok(ch.doorHand && ch.doorHand.w > 0 && ch.doorHand.y === 3);
  for (let i = 0; i < 20; i++) ch.updateDoorHand(dt, 1, { x: 0, y: -1 });
  assert.equal(ch.doorHand.w, 1);
  ch.updateDoorHand(dt, 1, { x: 0, y: 1 }); // walking away from it
  assert.ok(ch.doorHand.w < 1);
  for (let i = 0; i < Math.ceil(G.off / dt) + 1; i++) ch.updateDoorHand(dt, 0, { x: 0, y: 0 });
  assert.equal(ch.doorHand, null);
});
