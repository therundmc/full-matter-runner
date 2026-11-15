import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { AI, TILE } = await load('game/Config.js');
const { BARKS, NAMES, PLACES, LANDMARKS, BOSS, SHOUTED, MUTTERED } = await load('game/data/barks.js');
const { fill, lineFor, freeName, placeOf } = await load('game/ai/Barks.js');
const { default: Director } = await load('game/ai/Director.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { PROPS } = await load('game/data/props.js');
const { default: level1 } = await load('game/data/levels/level1.js');

const longest = (list) => list.reduce((a, b) => (b.length > a.length ? b : a), '');
const LONG = {
  N: longest(NAMES),
  AT: longest([...Object.values(PLACES), ...Object.values(LANDMARKS)].map((p) => p[0])),
  P: longest([...Object.values(PLACES), ...Object.values(LANDMARKS)].map((p) => p[1])),
};
const quiet = () => ({ time: 0, enemies: [], texts: [], events: { on() {}, emit() {} } });

test('barks: every line fits over a head once filled with the longest name and place, and only known blanks', () => {
  for (const [kind, lines] of Object.entries(BARKS)) {
    for (const l of lines) {
      for (const [, k] of l.matchAll(/\{(\w+)\}/g)) assert.ok(k in LONG, `${kind}: unknown blank {${k}}`);
      const s = fill(l, LONG);
      assert.ok(s && s.length <= 26, `${kind}: "${s}" (${s?.length})`);
      assert.ok(/^[ -~]+$/.test(l), `${kind}: ASCII`);
    }
  }
  for (const kind of MUTTERED) assert.ok(BARKS[kind] && !SHOUTED.has(kind), kind);
  assert.equal(new Set(NAMES).size, NAMES.length);
  assert.ok(BOSS.lines.length >= 3 && BOSS.hold > 0 && BOSS.dur > BOSS.hold && BOSS.slowmo[0] < 1);
});

test('barks: a line is filled from its blanks, the telling ones first, never one just said while another is left', () => {
  assert.equal(fill("{N}'S DOWN!", { N: 'SAL' }), "SAL'S DOWN!");
  assert.equal(fill("{N}'S DOWN!", {}), null, 'a blank with nothing for it');
  const lines = ['MAN DOWN!', "{N}'S DOWN!", 'THEY GOT {N}!'];
  for (let i = 0; i < 20; i++) assert.match(lineFor(lines, { N: 'SAL' }), /SAL/, 'the name said when it is known');
  assert.equal(lineFor(lines, {}), 'MAN DOWN!', 'the plain line without one');
  assert.equal(lineFor(["{N}'S DOWN!"], {}), null, 'nothing to say');
  assert.equal(lineFor(lines, { N: 'SAL' }, ["SAL'S DOWN!"]), 'THEY GOT SAL!', 'not the line just said');
  assert.equal(lineFor(lines, { N: 'SAL' }, ["SAL'S DOWN!", 'THEY GOT SAL!']), "SAL'S DOWN!", 'all said: the oldest one again');
  // names: every guard his own, the list over again numbered once it runs out
  const taken = new Set();
  for (let i = 0; i < NAMES.length + 3; i++) taken.add(freeName(taken));
  assert.equal(taken.size, NAMES.length + 3);
});

test('director: every guard gets a name of his own, the boss is BOSS', () => {
  const w = quiet();
  w.enemies = [...Array(14)].map((_, i) => ({ boss: i === 3 }));
  new Director(w);
  const names = w.enemies.map((e) => e.nick);
  assert.equal(new Set(names).size, 14);
  assert.equal(names[3], 'BOSS');
  assert.ok(names.every((n) => n === 'BOSS' || NAMES.includes(n)));
});

test('director: one bark at a time, one man per occasion, and the squad never says the same line twice running', () => {
  const d = new Director(quiet()), w = d.world, g = { x: 0, y: 0 };
  assert.equal(d.bark(g, 'threat'), true);
  w.time += AI.barkGap / 2;
  assert.equal(d.bark(g, 'brawl'), false, 'the squad is still on the last line');
  w.time += AI.barkGap;
  assert.equal(d.bark(g, 'threat'), false, 'another man saying it at once');
  assert.equal(d.bark(g, 'brawl'), true);
  assert.equal(d.bark(g, 'nothing-of-the-kind'), false);
  // over a long fight: no line comes back while the squad's memory holds it
  const said = [];
  for (let i = 0; i < 40; i++) {
    w.time += AI.barks.same + 0.01;
    if (d.bark(g, 'threat')) said.push(w.texts.at(-1).str);
  }
  const span = Math.min(AI.barkMemory, BARKS.threat.length) - 1;
  for (let i = span; i < said.length; i++) assert.ok(!said.slice(i - span, i).includes(said[i]), `${said[i]} twice within ${span}`);
  // a named line needs its name; the boss's men cry for him with their own lines
  w.time += 5;
  assert.equal(d.bark(g, 'down', { N: 'VINNIE' }), true);
  assert.match(w.texts.at(-1).str, /VINNIE/);
});

// level 1 as the guards see it: its tiles, its zones, its props where they stand
const map1 = new TileMap(level1.tiles);
const props1 = level1.props.map(([type, col, row]) => ({ type, x: col * TILE, y: row * TILE, def: PROPS[type] ?? { w: 140, h: 64 } }));
const place = (col, row) => placeOf(level1, map1, props1, col * TILE, row * TILE, AI.barks.landmark)?.at ?? null;

test('places: where the player is in level 1, as the guards call it', () => {
  const pool = props1.find((p) => p.type === 'pool_table');
  assert.equal(place(pool.x / TILE, pool.y / TILE + 1.1), 'BY THE POOL TABLE');
  assert.equal(place(21.5, 8.5), 'IN THE TOILETS');
  assert.equal(place(25.5, 9.5), 'IN THE BACK ROOM');
  assert.equal(place(16.5, 8.5), 'IN THE STOREROOM');
  assert.equal(place(26.5, 18.5), 'IN THE VIP ROOM');
  assert.equal(place(12.5, 12.5), 'IN THE SIDE ALLEY');
  assert.equal(place(30.5, 12.5), 'IN THE PASSAGE');
  assert.equal(place(20.5, 2.5), 'OUT BACK');
  assert.equal(place(5.5, 18.5), 'IN THE LIQUOR STORE');
  assert.equal(place(19.5, 33.0), 'IN THE ALLEY');
  assert.equal(place(14.5, 25.5), 'OUT FRONT');
  assert.equal(place(3.5, 8.5), 'ON THE ROOF');
  assert.equal(level1.tiles[11][26], 'L');
  assert.equal(place(26.5, 11.5), null, 'a doorway is between two places');
  // a landmark only names the spot from its own room: none through a wall
  const counter = props1.find((p) => p.type === 'bar_counter' && p.y < 15 * TILE);
  assert.equal(place(counter.x / TILE, counter.y / TILE + 0.9), 'AT THE COUNTER');
  // a level without zones names nothing but its landmarks
  assert.equal(placeOf({}, new TileMap(['XXXX', 'X..X', 'XXXX']), [], 1.5 * TILE, 1.5 * TILE), null);
});

test('director: the player\'s place is called out once, by one man, then again only when he shows up somewhere new', () => {
  const w = { ...quiet(), level: level1, map: map1, props: props1, player: { x: 21.5 * TILE, y: 8.5 * TILE } };
  const d = new Director(w), said = [];
  const guard = () => ({ x: 0, y: 0, say: (kind, vars) => { said.push([kind, vars.AT]); return true; } });
  assert.equal(d.report(guard()), true);
  assert.deepEqual(said, [['where', 'IN THE TOILETS']]);
  w.time += AI.barks.where + 1;
  assert.equal(d.report(guard()), false, 'he has not moved: nothing new to say');
  w.player = { x: 25.5 * TILE, y: 9.5 * TILE };
  w.time += AI.barks.place;
  assert.equal(d.report(guard()), true);
  assert.deepEqual(said.at(-1), ['where', 'IN THE BACK ROOM']);
  w.player = { x: 16.5 * TILE, y: 8.5 * TILE };
  w.time += AI.barks.place;
  assert.equal(d.report(guard()), false, 'not twice in a row so soon');
});

test('director: two lines said side by side are stacked, not written across one another', () => {
  const d = new Director(quiet()), w = d.world;
  assert.equal(d.bark({ x: 100, y: 100 }, 'contact'), true);
  assert.equal(d.bark({ x: 110, y: 100 }, 'down', { N: 'SAL' }), true, 'a cry for a mate goes over the turn to speak');
  const [a, b] = w.texts;
  assert.ok(Math.abs(a.y - b.y) >= 9, `${a.y} / ${b.y}`);
});
