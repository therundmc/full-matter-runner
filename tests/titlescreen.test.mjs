import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { load } from './setup.mjs';

const { logoDead, posterBeats, CROSS, crossK, crossBeats } = await load('game/ui/title/Beats.js');
const { deadCount } = await load('game/ui/title/HitList.js');
const { posterUp } = await load('game/ui/title/Title.js');
const { POSTER, BOARD } = await load('game/data/titleart.js');
const { OPTIONAL_LIST } = await load('engine/Assets.js');
const { META } = await load('audio/Audio.js');
const { loadCrossed, saveCrossed, resetProgress } = await load('game/systems/Progress.js');
const { default: Menu } = await load('game/ui/Menu.js');

test('title: the sign lights letter by letter, then stays lit but for a buzz', () => {
  for (let i = 0; i < 6; i++) assert.ok(logoDead(i, 0.1), 'dark as the title comes up');
  let last = 0;
  for (let i = 0; i < 6; i++) {
    let first = 0;
    while (logoDead(i, first)) first += 1 / 60;
    assert.ok(first >= 0.5 + i * 0.24 - 1e-9 && first < 0.5 + i * 0.24 + 0.35, `letter ${i} catches in its turn (${first})`);
    last = Math.max(last, first);
  }
  assert.ok(last < 2.2, 'all of it within two seconds or so');
  let dark = 0, n = 0;
  for (let t = 3; t < 120; t += 1 / 30) for (let i = 0; i < 6; i++) { n++; if (logoDead(i, t)) dark++; }
  assert.ok(dark > 0 && dark / n < 0.03, `it buzzes, hardly (${dark} of ${n})`);
});

test('title: what is heard under the poster: its fire, its rain, a buzz when a letter fails; nothing twice', () => {
  const heard = [];
  for (let t = 0; t < 60; t += 1 / 60) heard.push(...posterBeats(t, t + 1 / 60));
  const count = (name) => heard.filter((b) => b.name === name).length;
  assert.ok(count('titleFire') >= 40 && count('titleFire') <= 50);
  assert.ok(count('titleRain') >= 60 && count('titleRain') <= 70);
  assert.ok(count('neonBuzz') >= 6, 'the letters catching, then a failure now and then');
  assert.deepEqual(posterBeats(5, 5), []);
  for (const name of ['titleFire', 'titleRain', 'neonBuzz', 'markerStroke']) assert.ok(META[name], `${name} has its META entry`);
  const names = readFileSync(new URL('../assets/sound/PLACEHOLDERS.md', import.meta.url), 'utf8');
  for (const name of ['titleFire', 'titleRain', 'neonBuzz', 'markerStroke']) assert.ok(names.includes(`| ${name} |`), `${name} is listed as a placeholder`);
});

test('title: the poster is up for every page but LEVELS, which is the hit list', () => {
  const menu = new Menu('main', { settings: {}, progress: { unlocked: ['tutorial'], done: [] }, best: () => null, levels: [{ id: 'tutorial', name: 'BAD NIGHT' }] });
  assert.ok(posterUp(menu));
  menu.open('levels');
  assert.equal(posterUp(menu), false);
  menu.back();
  menu.open('options');
  assert.ok(posterUp(menu));
});

test('hit list: a target is dead when his level is done; the X is drawn once, in two strokes, each heard', () => {
  assert.equal(deadCount({ unlocked: ['tutorial'], done: [] }), 0);
  assert.equal(deadCount({ unlocked: ['tutorial', 'level1'], done: ['tutorial'] }), 0, 'the tutorial kills none of them');
  assert.equal(deadCount({ unlocked: ['tutorial', 'level1'], done: ['tutorial', 'level1'] }), 1, 'CUEBALL after level 1');
  assert.equal(crossK(0, 0), 0);
  assert.equal(crossK(0, CROSS.at[0] + CROSS.dur), 1);
  assert.equal(crossK(1, CROSS.at[0] + CROSS.dur), 0, 'the second stroke after the first');
  assert.equal(crossK(1, CROSS.done), 1, 'both down when it is over');
  const heard = [];
  for (let c = 0; c < 3; c += 1 / 60) heard.push(...crossBeats(c, c + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard, ['markerStroke', 'markerStroke']);
  // what the board has shown crossed out is kept with the save, and goes with it
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(loadCrossed(storage), 0);
  saveCrossed(1, storage);
  assert.equal(loadCrossed(storage), 1);
  resetProgress(storage);
  assert.equal(loadCrossed(storage), 0);
  assert.equal(loadCrossed(null), 0, 'no storage: nothing shown yet');
});

test('title: its stills are optional sprites at 3 px a title px, and their data matches them', () => {
  const stills = OPTIONAL_LIST.filter((n) => n.startsWith('title/'));
  assert.equal(stills.length, 11);
  const size = (name) => {
    const url = new URL(`../assets/sprites/${name}.png`, import.meta.url);
    assert.ok(existsSync(url), `${name} (python3 tools/comic/title.py)`);
    const b = readFileSync(url);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  for (const name of stills) {
    const [w, h] = size(name);
    assert.ok(w % 3 === 0 && h % 3 === 0, `${name} is ${w}x${h}`);
    if (name.includes('poster_')) assert.deepEqual([w, h], [1152 + 2 * POSTER.margin, 648], `${name}: the sheet and its margins`);
    if (name.includes('board_')) assert.deepEqual([w, h], [1152, 648]);
  }
  assert.equal(POSTER.windows.length, 15, 'five floors of three');
  assert.equal(POSTER.letters.length, 6, 'R U N N E R');
  assert.equal(BOARD.cards.length, 4);
  assert.ok(BOARD.pins.length === 4 && BOARD.crosses.length === 4 && BOARD.tags.length === 4);
  for (const [x, y] of [...BOARD.pins, BOARD.photoPin, BOARD.matchPin]) assert.ok(x > 22 && x < 1130 && y > 18 && y < 604, 'a pin is on the board');
});
