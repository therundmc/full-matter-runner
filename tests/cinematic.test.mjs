import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './setup.mjs';

const { CINE, CINE_END, PAGES, cineView, cineBeats } = await load('game/ui/Cinematic.js');
const { OPTIONAL_LIST } = await load('engine/Assets.js');
const { ENDINGS } = await load('game/ui/cine/Ending.js');

test('cinematic: three comic pages in order, black between them, then the level card', () => {
  assert.equal(PAGES.length, 3);
  assert.equal(cineView(0).page, null, 'black for a moment out of the title');
  for (let i = 0; i < PAGES.length; i++) {
    const p = PAGES[i];
    assert.ok(p.start < p.end);
    if (i) assert.ok(p.start - PAGES[i - 1].end >= 0.3, 'a moment of black between two pages');
    assert.equal(cineView((p.start + p.end) / 2).page, p);
    assert.equal(cineView(p.end).page === p, false);
  }
  assert.equal(cineView(CINE_END - 0.01).over, false);
  assert.ok(cineView(CINE_END).over && cineView(CINE_END).page === null);
  assert.ok(CINE_END - PAGES.at(-1).end >= 0.3, 'black before the card');
  const last = PAGES.at(-1).panels;
  assert.ok(CINE.strike > last[0].at && CINE.strike < last[1].at, 'the match is struck in its panel');
  assert.ok(CINE.wake > last[2].at && CINE.wake < PAGES.at(-1).end - 1.5, 'his eye opens, and is seen open');
});

test('cinematic: every panel has time to be read before the next drops in, and is down before its page goes', () => {
  for (const page of PAGES) {
    const at = page.panels.map((p) => p.at);
    assert.equal(at[0], page.start);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 1.8, 'about two seconds a panel at least');
    assert.ok(page.end - at.at(-1) >= 2.5, 'the last one stays a while');
    for (const p of page.panels) {
      if (p.say) assert.ok(p.at + p.say.at < page.end - 1.5, 'what is said can be read');
      const { x, y, w, h } = p.r;
      assert.ok(x >= 0 && y >= 0 && x + w <= 384 && y + h <= 216, 'the panel is on the page');
    }
  }
});

test('cinematic: each sound once, in the order of the story, the match among them', () => {
  const heard = [];
  for (let t = 0; t < CINE_END; t += 1 / 60) heard.push(...cineBeats(t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard.filter((n) => n !== 'air'), ['door', 'woodBreak', 'splash', 'match', 'ignite', 'crackle']);
  assert.ok(heard.filter((n) => n === 'air').length >= 4, 'the night outside all along');
});

test('cinematic: every comic still is painted at 3 px per title px of a panel it fills', () => {
  // the panels' sizes in title px: the opening's pages', the leap's card (cine/Leap.js CARD) and the levels' closing
  // pages (cine/Ending.js), and the full-screen cards (384 x 216)
  const ends = Object.values(ENDINGS).flatMap((e) => e.page.panels.map((q) => `${q.r.w}x${q.r.h}`));
  const sizes = new Set([...PAGES.flatMap((p) => p.panels.map((q) => `${q.r.w}x${q.r.h}`)), '336x136', '384x216', ...ends]);
  const stills = OPTIONAL_LIST.filter((n) => n.startsWith('comic/'));
  assert.ok(stills.length >= 12);
  for (const name of stills) {
    const b = readFileSync(new URL(`../assets/sprites/${name}.png`, import.meta.url));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.ok(w % 3 === 0 && h % 3 === 0 && sizes.has(`${w / 3}x${h / 3}`), `${name} is ${w}x${h}`);
  }
});
