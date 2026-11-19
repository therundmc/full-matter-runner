import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TileMap } = await load('game/world/TileMap.js');
const { PROPS } = await load('game/data/props.js');
const { TILE, CAT, PLAYER } = await load('game/Config.js');
const { default: Character } = await load('game/entities/Character.js');
const { default: Player } = await load('game/entities/Player.js');
const { rollRoom } = await load('game/systems/Cover.js');
const { default: level } = await load('game/data/levels/level1.js');

const { Bodies, Body } = Matter;
const px = (t) => t * TILE;
const noop = () => {};
const sink = new Proxy({}, { get: () => noop });

// level 1's walls and furniture (tiles: changes to the map, [col, row, char]), everything else a no-op
function world(tiles = [], extra = []) {
  const rows = level.tiles.map((r) => r.split(''));
  for (const [c, r, ch] of tiles) rows[r][c] = ch;
  const map = new TileMap(rows.map((r) => r.join('')));
  const props = [...level.props, ...extra].filter(([type]) => PROPS[type] && !PROPS[type].hung).map(([type, col, row, deg]) => {
    const def = PROPS[type];
    const opts = { isStatic: true, angle: (deg * Math.PI) / 180, collisionFilter: { category: CAT.PROP } };
    const body = def.r ? Bodies.circle(px(col), px(row), def.r, opts) : Bodies.rectangle(px(col), px(row), def.w, def.h, opts);
    return { type, def, body, dead: false, x: px(col), y: px(row) };
  });
  return {
    map, props, windows: [], particles: sink, camera: sink, sound: noop, noise: noop, shake: noop, floorAt: () => 'concrete',
    physics: { bodies: () => props.map((p) => p.body) },
  };
}

// the player (or a guard) standing at tile (col, row), with a body that is moved by hand (no physics engine here)
function man(w, col, row, isPlayer = true) {
  const ch = Object.create((isPlayer ? Player : Character).prototype);
  const body = Bodies.circle(px(col), px(row), PLAYER.radius, { collisionFilter: { category: CAT.CHAR, mask: 0xffff } });
  Object.assign(ch, { world: w, body, isPlayer, alive: true, knocked: 0, angle: 0, radius: PLAYER.radius, vaulting: null, vel: { x: 0, y: 0 } });
  return ch;
}

// run the move to its end, integrating the velocity the roll drives the body with; returns what it went through
function play(ch) {
  const seen = { rolled: false, frames: 0, angles: [], path: [] };
  while (ch.vaulting && seen.frames < 300) {
    seen.rolled ||= !!ch.vaulting.rolling;
    ch.updateVault(1 / 60);
    const v = Body.getVelocity(ch.body);
    Body.setPosition(ch.body, { x: ch.x + v.x, y: ch.y + v.y });
    seen.frames++;
    seen.angles.push(ch.angle);
    seen.path.push({ x: ch.x, y: ch.y });
  }
  return seen;
}
const tileAt = (w, ch) => w.map.at(Math.floor(ch.x / TILE), Math.floor(ch.y / TILE));

test('traversal: over the parapet from the roof he drops and rolls on; climbing back up over it he does not', () => {
  const w = world(), p = man(w, 9.6, 12.5);
  assert.ok(p.tryVault(0));
  assert.ok(p.vaulting.hoist && p.vaulting.roll, 'hands on the parapet, a roll to come');
  const x0 = p.vaulting.to.x, seen = play(p);
  assert.ok(seen.rolled);
  const rolled = p.x - x0;
  assert.ok(rolled > 30 && rolled <= PLAYER.roll.dist + 2, `${rolled} px rolled`);
  assert.equal(tileAt(w, p), '_', 'down in the service alley');
  const dur = seen.frames / 60;
  assert.ok(dur > 0.8 && dur < 1.2, `${dur} s from the roof to his feet`);

  const q = man(w, 11.4, 12.5);
  assert.ok(q.tryVault(Math.PI));
  assert.ok(q.vaulting.hoist && !q.vaulting.roll);
  assert.ok(!play(q).rolled);
  assert.equal(tileAt(w, q), '^', 'up on the roof');
});

test('traversal: the roll is cut short by a wall ahead and never ends in anything solid', () => {
  // a wall right behind the gate, in the service alley
  const w = world([[11, 19, 'X'], [12, 19, 'X'], [13, 19, 'X']]), p = man(w, 12.5, 21.4);
  assert.ok(p.tryVault(-Math.PI / 2));
  const y0 = p.vaulting.to.y;
  play(p);
  assert.ok(y0 - p.y < PLAYER.roll.dist - 10, `${y0 - p.y} px only`);
  assert.ok(!w.map.solidAt(p.x, p.y) && !w.map.solidAt(p.x, p.y - p.radius), 'clear of the wall');
  // and furniture in the way counts as much as a wall
  const free = rollRoom(world(), p, px(12.5), px(20), -Math.PI / 2, PLAYER.roll.dist);
  const crate = rollRoom(world([], [['crate', 12.5, 19.2, 0]]), p, px(12.5), px(20), -Math.PI / 2, PLAYER.roll.dist);
  assert.equal(free, PLAYER.roll.dist);
  assert.ok(crate < 16, `${crate} px before the crate`);
});

test('traversal: the gate is climbed both ways and each time he rolls on landing', () => {
  for (const [row, a, side] of [[20.35, Math.PI / 2, 's'], [21.4, -Math.PI / 2, '_']]) {
    const w = world(), p = man(w, 12.5, row);
    assert.ok(p.tryVault(a));
    assert.equal(p.vaulting.kind, 'climb');
    assert.ok(p.vaulting.roll);
    assert.ok(play(p).rolled);
    assert.equal(tileAt(w, p), side);
  }
});

test('traversal: up the ladder facing it, down it backwards, never a roll', () => {
  const w = world(), up = man(w, 3.5, 17.35);   // the liquor store's own ladder, from the aisle
  assert.ok(up.tryVault(-Math.PI / 2));
  const L = up.vaulting.ladder;
  assert.ok(L && L.up && up.vaulting.kind === 'climb');
  let seen = play(up);
  assert.ok(!seen.rolled);
  assert.equal(tileAt(w, up), '^', 'on the roof');
  assert.ok(seen.frames / 60 >= 1 && seen.frames / 60 <= 1.2);
  const mid = seen.angles[Math.floor(seen.frames / 2)];
  assert.ok(Math.abs(mid + Math.PI / 2) < 0.05, 'facing the ladder, up it');
  // in small steps: the body stops between rungs
  const still = seen.path.filter((q, i) => i && Math.abs(q.y - seen.path[i - 1].y) < 0.15).length;
  assert.ok(still > 10, `${still} frames at rest on a rung`);

  const down = man(w, 3.5, 15.65);
  assert.ok(down.tryVault(Math.PI / 2));
  assert.ok(!down.vaulting.ladder.up);
  seen = play(down);
  assert.equal(tileAt(w, down), ',', 'down in the shop');
  const back = seen.angles[Math.floor(seen.frames / 2)];
  assert.ok(Math.abs(back + Math.PI / 2) < 0.05, 'his back to the way he goes, facing the ladder');
});

test('traversal: a guard drops over the parapet without rolling', () => {
  const w = world(), g = man(w, 9.6, 12.5, false);
  assert.ok(g.tryVault(0));
  assert.ok(!g.vaulting.roll);
  assert.ok(!play(g).rolled);
});

test('traversal: the roll is still part of the vault (kills made in it count as airborne)', () => {
  const w = world(), p = man(w, 9.6, 12.5);
  p.tryVault(0);
  while (p.vaulting && !p.vaulting.rolling) p.updateVault(1 / 60);
  assert.ok(p.vaulting?.rolling);
});

test('traversal: he dives through the liquor store\'s window only once its bars are gone', async () => {
  const { findVault } = await load('game/systems/Cover.js');
  const w = world(), p = man(w, 6.5, 21.3);
  const pane = { cx: 6, cy: 20, x: px(6.5), y: px(20.5), vertical: false, intact: true, barred: false };
  w.windows.push(pane);
  assert.equal(findVault(w, p, -Math.PI / 2)?.kind, 'window', 'a bare pane: a dive');
  pane.barred = true;
  assert.notEqual(findVault(w, p, -Math.PI / 2)?.kind, 'window', 'barred: no way through');
  assert.ok(level.bars.some(([c, r]) => c === 6 && r === 20), "level 1's liquor store is barred");
});

test('a curtain across a doorway is walked through but never seen through', async () => {
  const { default: Curtains } = await load('game/systems/Curtains.js');
  const curtain = { def: PROPS.curtain, dead: false, x: px(24.5), y: px(18.5), body: { angle: 0 } };
  const curtains = new Curtains({ props: [curtain], events: { on: noop } });
  const seen = (x0, y0, x1, y1) => !curtains.blocks(px(x0), px(y0), px(x1), px(y1));
  assert.ok(PROPS.curtain.hung, 'no body in the way');
  assert.equal(seen(23, 18.5, 26, 18.5), false, 'across the doorway');
  assert.equal(seen(23, 16.5, 26, 16.5), true, 'beside it');
  assert.ok(level.props.some(([t]) => t === 'curtain'), "level 1's VIP room has one");
});
