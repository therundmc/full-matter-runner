import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { load } from './setup.mjs';

const { logoDead, posterBeats, CROSS, crossK, crossBeats } = await load('game/ui/title/Beats.js');
const { deadCount, LEVEL_AT, BACK_AT, SOON, NOTE } = await load('game/ui/title/HitList.js');
const { CAMPAIGN } = await load('game/systems/Progress.js');
const { default: LEVELS } = await load('game/data/levels/index.js');
const { posterUp } = await load('game/ui/title/Title.js');
const { optionsUp } = await load('game/ui/title/Options.js');
const { POSTER, BOARD, OPTIONS } = await load('game/data/titleart.js');
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

test('title: the poster for the first page, the hit list for LEVELS, his table for OPTIONS and the pages under it', () => {
  const menu = new Menu('main', { settings: {}, progress: { unlocked: ['tutorial'], done: [] }, best: () => null, levels: [{ id: 'tutorial', name: 'BAD NIGHT' }] });
  assert.ok(posterUp(menu));
  menu.open('levels');
  assert.equal(posterUp(menu), false);
  menu.back();
  assert.equal(optionsUp(menu), false);
  menu.open('options');
  assert.ok(!posterUp(menu) && optionsUp(menu));
  assert.equal(menu.page.items.length, OPTIONS.things.length, 'a thing on the table for every section, and the cap for BACK');
  menu.activate();
  assert.ok(menu.page.id === 'audio' && optionsUp(menu), 'a section under it is the same screen');
  const pause = new Menu('pause', menu.context);
  assert.equal(optionsUp(pause), false);
  pause.open('options');
  assert.ok(optionsUp(pause), 'the pause opens the same');
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
  assert.equal(stills.length, 13);
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
  assert.equal(POSTER.windows.length, 8, 'four floors of two');
  assert.ok(POSTER.roofFlames.length >= 2);
  assert.equal(POSTER.letters.length, 6, 'R U N N E R');
  assert.equal(BOARD.cards.length, 4);
  assert.ok(BOARD.pins.length === 4 && BOARD.crosses.length === 4 && BOARD.tags.length === 4);
  for (const [x, y] of [...BOARD.pins, BOARD.photoPin, BOARD.matchPin]) assert.ok(x > 22 && x < 1130 && y > 18 && y < 604, 'a pin is on the board');
});

// the box a w x h rectangle leaning deg about (x, y) covers
const box = (x, y, w, h, deg) => {
  const a = (Math.abs(deg) * Math.PI) / 180, bw = w * Math.cos(a) + h * Math.sin(a), bh = w * Math.sin(a) + h * Math.cos(a);
  return { x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 };
};
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('hit list: level 2 is two notes under JITTERS, 2A a level, 2B a note not made yet; no note on another', () => {
  assert.ok(CAMPAIGN.includes('level2a') && LEVELS.level2a, '2A is a campaign level');
  assert.deepEqual(SOON.map((s) => [s.level, s.after]), [['level2b', 'level2a']]);
  assert.ok(!LEVELS.level2b && !CAMPAIGN.includes('level2b'), '2B is only a picture on the board');
  // under JITTERS' card (the second), side by side with nothing else pinned
  const [jx, jy] = BOARD.cards[1], jitters = box(...BOARD.cards[1].slice(0, 2), ...BOARD.card, BOARD.cards[1][2]);
  for (const id of ['level2a', 'level2b']) {
    const [x, y] = LEVEL_AT[id];
    assert.ok(y > jitters.y1 && Math.abs(x - jx) < 160, `${id} pinned under JITTERS (${x}, ${y} for ${jx}, ${jy})`);
  }
  const notes = Object.entries(LEVEL_AT).map(([id, [x, y, deg]]) => [id, box(x, y, ...NOTE, deg)]);
  const cards = BOARD.cards.map(([x, y, deg], i) => [`card ${i}`, box(x, y, ...BOARD.card, deg)]);
  const back = ['BACK', box(BACK_AT[0], BACK_AT[1], 132, 54, BACK_AT[2])];
  notes.forEach(([id, b], i) => {
    for (const [other, o] of [...notes.slice(i + 1), ...cards, back]) assert.ok(!overlap(b, o), `${id} clear of ${other}`);
  });
  // and clear of CUEBALL's matchbook (about 84 x 124 on the still), pinned beside them once he is dead
  const [mx, my, mdeg] = BOARD.matchbook, match = box(mx, my, 84, 124, mdeg);
  for (const [id, b] of notes.filter(([id]) => id.startsWith('level2'))) assert.ok(!overlap(b, match), `${id} clear of the matchbook`);
  // JITTERS is not dead before his last level: 2A done leaves him standing
  assert.equal(deadCount({ unlocked: CAMPAIGN, done: ['tutorial', 'level1', 'level2a'] }), 1);
});
