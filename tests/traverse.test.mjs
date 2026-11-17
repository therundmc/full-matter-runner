// The traversal moves as poses (CharacterAnim: the speed vault, the slide, the roll) and the player's flourish
// (fx/TraversalFx.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TileMap } = await load('game/world/TileMap.js');
const { PROPS } = await load('game/data/props.js');
const { TILE, CAT, PLAYER, BODY_SCALE } = await load('game/Config.js');
const { TRAVERSE } = await load('game/data/feel.js');
const { default: Character } = await load('game/entities/Character.js');
const { default: Player } = await load('game/entities/Player.js');
const { newPose, vaultPose, vaultPhases, slidePhases, rollPhases } = await load('game/entities/CharacterAnim.js');
const { fxFor, slideFx, plantFx, landFx, rollFx, rimOf } = await load('game/fx/TraversalFx.js');
const { default: level } = await load('game/data/levels/level1.js');

const { Bodies, Body } = Matter;
const px = (t) => t * TILE;
const noop = () => {};

// level 1's walls and furniture, a world that records what is thrown into it
function world() {
  const map = new TileMap(level.tiles);
  const props = level.props.filter(([type]) => PROPS[type] && !PROPS[type].hung).map(([type, col, row, deg]) => {
    const def = PROPS[type];
    const opts = { isStatic: true, angle: (deg * Math.PI) / 180, collisionFilter: { category: CAT.PROP } };
    const body = def.r ? Bodies.circle(px(col), px(row), def.r, opts) : Bodies.rectangle(px(col), px(row), def.w, def.h, opts);
    return { type, def, body, dead: false, x: px(col), y: px(row) };
  });
  const thrown = [];
  const rec = (what) => new Proxy({}, { get: (_, k) => (...a) => thrown.push(`${what}.${String(k)}`) });
  return {
    map, props, windows: [], thrown, particles: rec('particles'), camera: rec('camera'), decals: rec('decals'),
    sound: noop, noise: noop, shake: () => thrown.push('shake'), floorAt: () => 'concrete', time: 0,
    physics: { bodies: () => props.map((p) => p.body) },
  };
}

function man(w, col, row, isPlayer = true) {
  const ch = Object.create((isPlayer ? Player : Character).prototype);
  const body = Bodies.circle(px(col), px(row), PLAYER.radius, { collisionFilter: { category: CAT.CHAR, mask: 0xffff } });
  Object.assign(ch, { world: w, body, isPlayer, alive: true, knocked: 0, angle: 0, radius: PLAYER.radius, vaulting: null, vel: { x: 0, y: 0 } });
  return ch;
}

// the world point of hand i (0 left, 1 right) of pose P drawn on ch
const handAt = (ch, P, i) => { const h = i ? P.hr : P.hl; return { x: ch.x + h.x * BODY_SCALE, y: ch.y + h.y * BODY_SCALE }; };

test('vault: furniture is a one-hand speed vault, the legs going past on the other side of the planted hand', () => {
  for (const [isPlayer, aim] of [[true, 0.8], [true, -0.8], [false, 0]]) {
    const w = world(), ch = man(w, 15.75, 9.2, isPlayer);
    ch.angle = aim;
    assert.ok(ch.tryVault(0), 'over the dope table');
    const v = ch.vaulting;
    assert.equal(v.style, 'speed');
    assert.equal(v.legSide, -v.hand);
    // the hand on the top of the table, on its own side of the way
    const p = w.props.find((o) => o.type === 'dope_table');
    assert.ok(v.plant.x > p.x - PROPS.dope_table.w / 2 && v.plant.x < p.x + PROPS.dope_table.w / 2, `plant ${v.plant.x}`);
    assert.equal(Math.sign(v.plant.y - ch.y), v.hand, 'beside the way, on the hand side');
  }
  // unarmed, the hand on the aim's side; armed, the left one (the right holds the weapon)
  const w = world(), ch = man(w, 15.75, 9.2);
  ch.angle = 0.8; ch.tryVault(0);
  assert.equal(ch.vaulting.hand, 1);
  const g = man(world(), 15.75, 9.2);
  g.weapon = { type: 'pistol', mag: 7 };
  g.angle = 0.8; g.tryVault(0);
  assert.equal(g.vaulting.hand, -1);
});

test('vault: the planted hand stays where it was put while the body passes over it, then lifts off', () => {
  const T = TRAVERSE.vault, w = world(), ch = man(w, 15.75, 9.2);
  ch.angle = -0.8;
  ch.tryVault(0);
  const v = ch.vaulting, i = v.hand > 0 ? 1 : 0, P = newPose(), V = newPose();
  let first = null, worst = 0, feetSide = 0, passed = false, last = null;
  while (ch.vaulting && ch.vaulting === v) {
    ch.updateVault(1 / 60);
    if (!ch.vaulting) break;
    const k = v.t / v.dur;
    Object.assign(P, newPose());
    vaultPose(ch, P, V);
    const h = handAt(ch, P, i);
    if (k >= T.plant && k <= T.lift) {
      first ??= h;
      worst = Math.max(worst, Math.hypot(h.x - first.x, h.y - first.y));
      passed ||= ch.x > first.x;
    }
    if (k > T.swing[0] + 0.1 && k < T.swing[1]) feetSide = Math.sign((P.feet[0].y + P.feet[1].y) / 2);
    if (k > T.lift + 0.12) last = h;
  }
  assert.ok(first, 'planted');
  assert.ok(worst < 0.01, `the hand moved ${worst} px while planted`);
  assert.ok(Math.hypot(first.x - v.plant.x, first.y - v.plant.y) < 0.01, 'on its spot');
  assert.ok(passed, 'the body went past the hand');
  assert.equal(feetSide, v.legSide, 'the legs swung past on the far side');
  assert.ok(Math.hypot(last.x - first.x, last.y - first.y) > 4, 'lifted off');
});

test('vault: the phases come in order and the move starts and ends on the run', () => {
  const T = TRAVERSE.vault, at = (k) => vaultPhases(k, {});
  assert.equal(at(0).up, 0); assert.equal(at(1).up, 0);
  assert.ok(at(T.dip / 2).dip > 0.9, 'the dip before the plant');
  assert.equal(at(T.plant).hand, 1);
  assert.equal(at(T.lift).hand, 1);
  assert.ok(at(T.lift + 0.12).hand < 0.05, 'the hand off');
  assert.ok(at((T.plant + T.land) / 2).up > 0.9, 'up over the top');
  assert.ok(at(T.swing[0]).swing === 0 && at(T.swing[1]).swing === 1);
  assert.ok(at(1).step === 1 && at(T.land).step === 0, 'the step on after the landing');
});

test('slide: the drop, the slide reclined, the push back up', () => {
  const T = TRAVERSE.slide, at = (k, out) => slidePhases(k, out, {});
  assert.ok(at(0).recline === 0 && at(T.drop).drop === 1, 'down fast');
  assert.ok(at(0.5).recline > 0.99, 'reclined through the slide');
  assert.ok(at(1, 0).up > 0 && at(1, 0).up < 0.5, 'starting up at the end of it');
  assert.equal(at(1, 1).up, 1);
  assert.equal(at(1, 1).recline, 0, 'up on his feet');
  let prev = -1;
  for (let o = 0; o <= 1; o += 0.05) { const u = at(1, o).up; assert.ok(u >= prev); prev = u; }
});

test('roll: he curls up, shrinks along the way as he goes over, and grows back onto his feet', () => {
  const R = TRAVERSE.roll, at = (k) => rollPhases(k, {});
  assert.equal(at(0).along, 1); assert.equal(at(1).along, 1); assert.equal(at(1).tuck, 0);
  let least = 1, kLeast = 0, prevTurn = -1;
  for (let k = 0; k <= 1; k += 0.01) {
    const p = at(k);
    assert.ok(p.turn >= prevTurn - 1e-9, 'it only goes forward');
    prevTurn = p.turn;
    assert.ok(p.along >= R.squash[0] - 1e-9 && p.across >= R.squash[1] - 1e-9);
    if (p.along < least) { least = p.along; kLeast = k; }
  }
  assert.ok(least < 0.8, `shrinks to ${least}`);
  assert.ok(kLeast > R.over[0] && kLeast < R.over[1], 'smallest while going over');
  assert.ok(Math.abs(at(1).turn - 2 * Math.PI * R.turns) < 1e-9, 'all the way round');
  assert.ok(at((R.unfold[0] + 1) / 2).pop > 0.5, 'the unfold springs');
});

test('traversal fx: the flourish is the player\'s only', () => {
  for (const isPlayer of [true, false]) {
    const w = world(), ch = man(w, 15.75, 9.2, isPlayer);
    assert.equal(fxFor(ch), isPlayer);
    ch.tryVault(0);
    while (ch.vaulting) ch.updateVault(1 / 60);
    if (!isPlayer) assert.ok(!w.thrown.some((t) => t.startsWith('camera') || t === 'shake' || t.includes('motes') || t.includes('ring')), 'his vault: the plain dust only');
    w.thrown.length = 0;
    const v = { plant: { x: 500, y: 300 }, dir: 0, over: { def: { chips: '#123' } } };
    plantFx(ch, v); landFx(ch, 0); rollFx(ch, 0);
    for (let i = 0; i < 30; i++) slideFx(ch, { dx: 1, dy: 0, angle: 0, k: i / 30, speed: 5 }, { side: -1 }, 1 / 60);
    if (isPlayer) assert.ok(w.thrown.length > 5, 'dust, rings, a skid, the camera');
    else assert.deepEqual(w.thrown, [], 'nothing for a guard');
    ch.vaulting = { style: 'speed', t: 0.2, dur: 0.5 };
    assert.equal(rimOf(ch) > 0, isPlayer);
  }
});
