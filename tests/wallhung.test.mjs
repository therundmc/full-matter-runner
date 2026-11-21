// What hangs on a wall face (data/props.js ON_WALL) goes with the wall tile it hangs on (world/Openings.js wallMount,
// systems/Destruction.js watchOpenings): it breaks as it would to a blow, its light dies, even what nothing else breaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './setup.mjs';
import { ctx } from './helpers.mjs';

// no DOM under Node: entities only need canvases to exist, nothing is looked at here
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { TILE } = await load('game/Config.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: Window } = await load('game/entities/Window.js');
const { PROPS, ON_WALL } = await load('game/data/props.js');
const { wallMount, hang, heldBy } = await load('game/world/Openings.js');
const { destroyWall, destroyWindow, watchOpenings } = await load('game/systems/Destruction.js');
const { explode } = await load('game/systems/Explosions.js');

// two rooms either side of a partition (row 4), a window in it at (9, 4), a brick wall round them
const ROWS = [
  'XXXXXXXXXXXXXX',
  'X............X',
  'X............X',
  'X............X',
  'X########G###X',
  'X............X',
  'X............X',
  'X............X',
  'XXXXXXXXXXXXXX',
];

// just enough of World for props, walls and a blast: real map and event bus, timers run by hand
function world() {
  const quiet = new Proxy({}, { get: () => () => {} });
  const w = {
    map: new TileMap(ROWS), events: new EventBus(), time: 0, particles: quiet, decals: quiet, smoke: quiet, papers: quiet,
    props: [], debris: [], chars: [], enemies: [], doors: [], windows: [], items: [], corpses: [], fences: [], rings: [], timers: [],
    gone: [], bodies: new Set(),
    physics: { freezeIfHeavy() {}, bodies: () => [...w.bodies] },
    game: { flash() {} },
    addBody(b) { this.bodies.add(b); }, removeBody(b) { this.bodies.delete(b); },
    addDebris(d) { this.debris.push(d); }, removeDebris(d) { this.debris = this.debris.filter((o) => o !== d); },
    shake() {}, hitstop() {}, light() {}, emit() {}, flashGlass() {}, noise() {}, sound() {}, damageWall() {},
    after(sec, fn) { this.timers.push(fn); },
    run() { while (this.timers.length) this.timers.shift()(); },
    destroyWindow(win, dirA, power) { destroyWindow(this, win, dirA, power); },
  };
  w.windows.push(new Window(w, 9, 4, false));
  w.events.on('propDestroyed', ({ prop }) => w.gone.push(prop.type));
  watchOpenings(w);
  return w;
}
// a piece at (col, row) tiles, hung as the level loader hangs it
const put = (w, type, col, row, deg = 0) => {
  const p = new Prop(w, type, col * TILE, row * TILE, (deg * Math.PI) / 180);
  hang(w.map, p);
  w.props.push(p);
  return p;
};
const whole = (p) => !p.dead && !p.dying;

test('wall-hung: the game and the level kit name the same pieces, every one a fixed thing with a box', () => {
  const kit = readFileSync(new URL('../tools/levelkit.py', import.meta.url), 'utf8').match(/ON_WALL = dict\(([\s\S]*?)\)\n/)[1];
  const named = [...kit.matchAll(/(\w+)=\d+/g)].map((m) => m[1]).sort();
  assert.deepEqual([...ON_WALL].sort(), named);
  for (const type of ON_WALL) assert.ok(PROPS[type]?.static && PROPS[type].w && PROPS[type].h && !PROPS[type].hung, type);
});

test('wall-hung: a piece knows the wall tiles at its back, along its whole length, whichever way it is turned', () => {
  const map = new TileMap(ROWS);
  const mount = (type, col, row, deg) => wallMount(map, col * TILE, row * TILE, (deg * Math.PI) / 180, PROPS[type].w, PROPS[type].h);
  assert.deepEqual(mount('wall_lamp', 4.5, 5.09, 0), [[4, 4]], 'lighting south, the wall north of it');
  assert.deepEqual(mount('wall_lamp', 4.5, 3.91, 180), [[4, 4]], 'the other face of the same tile');
  assert.deepEqual(mount('wall_lamp', 1.09, 2.5, 270), [[0, 2]]);
  assert.deepEqual(mount('wall_lamp', 12.91, 2.5, 90), [[13, 2]]);
  assert.deepEqual(mount('pipe_steam', 4, 5.07, 0), [[2, 4], [3, 4], [4, 4], [5, 4]], 'three metres of pipe');
  assert.deepEqual(mount('tube_light', 9.5, 5.07, 0), [[9, 4]], 'on a window');
  // a sign read one way up (never rotated) hangs on the wall in front of it
  assert.deepEqual(mount('neon_sign_beer', 6, 3.91, 0), [[5, 4], [6, 4]]);
  assert.deepEqual(mount('wall_lamp', 6.5, 2.5, 0), [], 'in the middle of the room: on nothing');
});

test('wall-hung: the lamp, the clock and the neon go with their wall tile, the lamp dark at once; the others stay', () => {
  const w = world();
  const lamp = put(w, 'wall_lamp', 4.5, 5.09), clock = put(w, 'wall_clock', 4.2, 3.92, 180), neon = put(w, 'neon_tube_pink', 4.5, 3.93, 180);
  const far = put(w, 'wall_lamp', 7.5, 5.09), table = put(w, 'table', 4.5, 6.5), free = new Prop(w, 'wall_lamp', 4.5 * TILE, 5.09 * TILE);
  w.props.push(free); // not hung by the loader (dropped in by the sandbox): on no wall
  assert.deepEqual(heldBy(w, 4, 4).hung, [lamp, clock, neon]);
  destroyWall(w, 4, 4, Math.PI / 2, 1);
  assert.ok(lamp.dying && lamp.lightsOut && neon.lightsOut, 'cracked and dark the moment the wall goes');
  w.run();
  assert.ok(lamp.dead && clock.dead && neon.dead);
  assert.deepEqual(w.gone.sort(), ['neon_tube_pink', 'wall_clock', 'wall_lamp']);
  assert.ok(whole(far) && whole(table) && whole(free));
  for (const p of [lamp, clock, neon]) assert.ok(!w.bodies.has(p.body), 'no body left hanging there');
});

test('wall-hung: what nothing else breaks (paint on the wall, a radiator) goes with its wall all the same', () => {
  const w = world();
  const tag = put(w, 'graffiti', 3.5, 5.04), rad = put(w, 'radiator', 6.5, 5.1);
  tag.hit(50, tag.x, tag.y, 0, 2, 'blast');
  w.run();
  assert.ok(whole(tag), 'a blast alone leaves it');
  destroyWall(w, 3, 4, 0, 1);
  w.run();
  assert.ok(tag.dead && whole(rad));
  destroyWall(w, 6, 4, 0, 1);
  w.run();
  assert.ok(rad.dead);
});

test('wall-hung: a long pipe goes when any tile under it goes; a piece on a window goes with the window', () => {
  const w = world();
  const pipe = put(w, 'pipe_water', 4, 5.07), tube = put(w, 'tube_light', 9.5, 5.07);
  destroyWall(w, 5, 4, 0, 1);
  w.run();
  assert.ok(pipe.dead && whole(tube));
  destroyWall(w, 8, 4, 0, 1); // the wall the window is built into: the window is torn out, the tube with it
  w.run();
  assert.equal(w.windows.length, 0);
  assert.ok(tube.dead);
});

test('wall-hung: a blast that brings the wall down leaves nothing hanging on either face, far end of a long piece included', () => {
  const w = world();
  w.damageWall = () => {};
  const here = put(w, 'emergency_light', 4.5, 5.09), back = put(w, 'fuse_box', 4.5, 3.92, 180), sign = put(w, 'neon_sign_bar', 5.4, 3.91, 0);
  const cut = [];
  w.events.on('propDestroyed', ({ prop }) => cut.push(prop.type));
  explode(w, 4.5 * TILE, 5.6 * TILE, { radius: 60 });
  for (let i = 0; i < 6; i++) w.run();
  assert.equal(w.map.at(4, 4), '_', 'the tile came down');
  assert.ok(here.dead && back.dead && sign.dead);
  for (const type of ['emergency_light', 'fuse_box', 'neon_sign_bar']) assert.equal(cut.filter((t) => t === type).length, 1, `${type} breaks once`);
});
