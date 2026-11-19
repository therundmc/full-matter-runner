import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { load } from './setup.mjs';

const { logoDead, posterBeats, CROSS, crossK, crossBeats } = await load('game/ui/title/Beats.js');
const { deadCount, noteAt, noteSize, lines, BACK, BACK_AT, NOTE, SCRAP, ROWS } = await load('game/ui/title/HitList.js');
const { frame } = await load('game/ui/title/Paper.js');
const { CAMPAIGN_LEVELS, TARGETS } = await load('game/data/campaign.js');
const { CAMPAIGN } = await load('game/systems/Progress.js');
const { default: LEVELS } = await load('game/data/levels/index.js');
const { posterUp } = await load('game/ui/title/Title.js');
const { optionsUp } = await load('game/ui/title/Options.js');
const { POSTER, BOARD, OPTIONS } = await load('game/data/titleart.js');
const { OPTIONAL_LIST } = await load('engine/Assets.js');
const { META } = await load('audio/Audio.js');
const { loadCrossed, saveCrossed, resetProgress } = await load('game/systems/Progress.js');
const { default: Menu, levelNotes } = await load('game/ui/Menu.js');

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

// the campaign's stages made today, as the menu is told
const MADE = CAMPAIGN.filter((id) => LEVELS[id]).map((id) => ({ id, name: LEVELS[id].name }));
const notesOf = (progress) => levelNotes({ progress, best: () => null, levels: MADE });

// how far two boxes go into each other (0: clear), along the axis where it is least
const into = (a, b) => Math.max(0, Math.min(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)));
const slot = (col, row, size = NOTE) => { const [x, y, deg] = noteAt(col, row); return box(x, y, ...size, deg); };

test('hit list: a note a level, in a bunch under its man: 02 and 03 under JITTERS, then LUCKY, then THE BOSS', () => {
  const notes = notesOf({ unlocked: ['tutorial'], done: [] });
  assert.equal(notes.length, CAMPAIGN_LEVELS.length);
  assert.ok(!LEVELS.level2b, '2B is not made yet: 02 is the chase alone for now');
  assert.deepEqual(notes.map((it) => it.tag).slice(0, 4), ['00', '01', '02', '03']);
  assert.ok(notes.every((it) => !/\d[AB]$/.test(it.tag)), 'no 2A / 2B on the board');
  assert.deepEqual(notes.filter((it) => it.soon).map((it) => it.tag), notes.slice(3).map((it) => it.tag), '03 and after are SOON');
  assert.equal(BOARD.cards.length, TARGETS.length);
  notes.forEach((it, i) => {
    const lv = CAMPAIGN_LEVELS[i], [x, y] = noteAt(it.col, it.row);
    assert.equal(it.col, TARGETS.indexOf(lv.target) + 1);
    assert.deepEqual(noteSize(it), it.soon ? SCRAP : NOTE, 'a level not made yet is a smaller scrap');
    if (!it.col) { assert.ok(Math.abs(x - BOARD.photo[0]) < 30 && y > BOARD.photo[1] + 107, 'the tutorial under the photo of his flat'); return; }
    const [cx, cy] = BOARD.cards[it.col - 1];
    assert.ok(Math.abs(x - cx) < 30 && y > cy + BOARD.card[1] / 2, `${it.tag} pinned under ${lv.target}'s card`);
  });
  const rows = (who) => notes.filter((it) => it.col === TARGETS.indexOf(who) + 1).map((it) => `${it.tag}.${it.row}`);
  assert.deepEqual(rows('cueball'), ['01.0']);
  assert.deepEqual(rows('jitters'), ['02.0', '03.1']);
  assert.deepEqual(rows('lucky'), ['04.0', '05.1']);
  assert.equal(rows('boss')[0], '06.0');
});

test('hit list: the board is pinned by hand: cards at their own heights and leans, bunches askew, the string along their tops', () => {
  const cards = BOARD.cards;
  // read left to right in the story's order, no two neighbours level or leaning the same way
  assert.deepEqual(cards.map((c) => c[0]), [...cards.map((c) => c[0])].sort((a, b) => a - b));
  assert.ok(BOARD.photo[0] < cards[0][0] - BOARD.card[0], 'his flat first, at the left');
  for (let i = 1; i < cards.length; i++) {
    assert.ok(Math.abs(cards[i][1] - cards[i - 1][1]) >= 20, `cards ${i - 1} and ${i} are not in a row`);
    assert.ok(cards[i][2] * cards[i - 1][2] < 0, `cards ${i - 1} and ${i} lean each its way`);
  }
  // a bunch: each note off the one above and leaning the other way
  for (let col = 1; col <= TARGETS.length; col++) {
    for (let row = 1; row < ROWS; row++) {
      const a = noteAt(col, row - 1), b = noteAt(col, row);
      assert.ok(a[0] !== b[0] && a[2] * b[2] < 0 && Math.abs(b[2]) <= 3, `column ${col}: note ${row} askew`);
    }
  }
  // the string goes from his flat to each man in turn, pin to pin, and over no card but a corner of its top
  const pins = [BOARD.photoPin, ...BOARD.pins];
  for (let i = 1; i < pins.length; i++) {
    const [ax, ay] = pins[i - 1], [bx, by] = pins[i];
    assert.ok(bx > ax, 'in the story\'s order');
    for (let q = 0; q <= 1; q += 0.02) {
      const x = ax + (bx - ax) * q, y = ay + (by - ay) * q;
      cards.forEach(([cx, cy, deg], c) => {
        const r = (-deg * Math.PI) / 180, lx = (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), ly = (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r);
        const on = Math.abs(lx) < BOARD.card[0] / 2 && Math.abs(ly) < BOARD.card[1] / 2;
        assert.ok(!on || ly < -BOARD.card[1] / 2 + 36, `the string ${i - 1} > ${i} keeps off card ${c}'s face (${Math.round(lx)}, ${Math.round(ly)})`);
      });
    }
  }
});

test('hit list: every place a note can be pinned is on the board and clear of the other bunches, at 1280 x 720 and 1920 x 1080', () => {
  // every place at a made level's size: three rows under each card (an eighth level fits), the tutorial's, and BACK
  const places = [{ id: '00', col: 0, row: 0, b: slot(0, 0) }, { id: 'BACK', col: -1, row: 0, b: box(BACK_AT[0], BACK_AT[1], ...BACK, BACK_AT[2]) }];
  for (let col = 1; col <= TARGETS.length; col++) for (let row = 0; row < ROWS; row++) places.push({ id: `${col}.${row}`, col, row, b: slot(col, row) });
  const cards = BOARD.cards.map(([x, y, deg]) => box(x, y, ...BOARD.card, deg));
  const photo = box(BOARD.photo[0], BOARD.photo[1], 196, 214, BOARD.photo[2]);
  places.forEach((p, i) => {
    for (const q of places.slice(i + 1)) {
      // in a bunch a note may lie a little over the one above; bunches keep clear of each other
      const most = p.col === q.col && Math.abs(p.row - q.row) === 1 ? 10 : 0;
      assert.ok(into(p.b, q.b) <= most, `${p.id} and ${q.id}: ${into(p.b, q.b)}`);
    }
    // tucked against the foot of its own card (or of the photo), clear of the others
    cards.forEach((c, k) => assert.ok(into(p.b, c) <= (p.col === k + 1 && p.row === 0 ? 14 : 0), `${p.id} and card ${k}: ${into(p.b, c)}`));
    assert.ok(into(p.b, photo) <= (p.col === 0 ? 14 : 0), `${p.id} and the photo`);
    // on the board (tools/comic/title_art.py board_bg: 22..1130 x 18..604, cut by hand), its shadow too
    assert.ok(p.b.x0 > 26 && p.b.x1 + 6 < 1130 && p.b.y0 > 26 && p.b.y1 + 8 < 598, `${p.id} on the board (${p.b.x0}, ${p.b.y0}, ${p.b.x1}, ${p.b.y1})`);
  });
  for (const c of [...cards, photo]) assert.ok(c.x0 > 26 && c.x1 + 7 < 1130 && c.y0 > 26, 'a card on the board');
  // CUEBALL's matchbook (about 84 x 124 on the still) lies in the open foot of the board: clear of every note there is
  // today, of BACK, of the cards
  const [mx, my, mdeg] = BOARD.matchbook, match = box(mx, my, 84, 124, mdeg);
  const today = notesOf({ unlocked: ['tutorial'], done: [] }).map((it) => [it.tag, slot(it.col, it.row, noteSize(it))]);
  for (const [id, b] of [...today, ['BACK', places[1].b], ...cards.map((c, k) => [`card ${k}`, c]), ['photo', photo]]) assert.equal(into(b, match), 0, `${id} clear of the matchbook`);
  assert.ok(match.y1 + 8 < 598 && match.x0 > 30, 'the matchbook on the board');
  // on a 16:9 screen the whole sheet shows, and a note's lettering is a readable size at 1280 x 720
  for (const [W, H] of [[1280, 720], [1920, 1080], [3840, 2160]]) {
    const f = frame(W, H);
    assert.ok(Math.abs(f.ox) < 1e-6 && Math.abs(f.oy) < 1e-6 && Math.abs(1152 * f.k - W) < 1e-6 && Math.abs(648 * f.k - H) < 1e-6, `${W} x ${H}: the sheet is the screen`);
    for (const { id, b } of places) assert.ok(b.x0 * f.k > 0 && b.x1 * f.k < W && b.y0 * f.k > 0 && b.y1 * f.k < H, `${id} on screen at ${W} x ${H}`);
  }
  assert.ok(14 * frame(1280, 720).k >= 15 && 10 * frame(1280, 720).k >= 11, 'a level\'s title 15 px and its result 11 px high at 720');
});

test('hit list: a title is cut in two lines when it is long; each fits beside the number', () => {
  assert.deepEqual(lines('NO LOOSE ENDS'), ['NO LOOSE', 'ENDS']);
  assert.deepEqual(lines('THE FLAMINGO MOTEL'), ['THE FLAMINGO', 'MOTEL']);
  assert.deepEqual(lines('THE CHASE'), ['THE CHASE']);
  // joystix is 0.83 em a letter: 12 letters at 14 px beside a note's number, at 12 px beside a scrap's
  const fits = (title, size, room) => { const rows = lines(title); assert.ok(rows.length <= 2 && rows.every((r) => r.length * size * 0.83 <= room), `${title}: ${rows.join(' / ')}`); };
  for (const title of [...CAMPAIGN_LEVELS.map((l) => l.title).filter(Boolean), ...MADE.map((l) => l.name)]) { fits(title, 14, NOTE[0] - 58); fits(title, 12, SCRAP[0] - 52); }
});

test('hit list: a man dies at the end of his last level: 02 done leaves JITTERS standing', () => {
  assert.equal(deadCount({ unlocked: CAMPAIGN, done: ['tutorial', 'level1', 'level2a'] }), 1);
  assert.equal(deadCount({ unlocked: CAMPAIGN, done: ['tutorial', 'level1', 'level2a', 'level2b'] }), 1);
  assert.equal(deadCount({ unlocked: CAMPAIGN, done: ['tutorial', 'level1', 'level2a', 'level2b', 'level3'] }), 2, 'JITTERS at the motel');
  assert.equal(deadCount({ unlocked: CAMPAIGN, done: ['level3'] }), 0, 'in their order: not before CUEBALL');
});
