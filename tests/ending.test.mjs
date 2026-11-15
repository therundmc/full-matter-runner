import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { ENDING, ENDINGS, RING, ringing, endingView, endingBeats } = await load('game/ui/cine/Ending.js');
const { TYPE } = await load('game/ui/cine/Page.js');
const META = (await load('audio/Audio.js')).META;

const E = ENDINGS.level1;

test('ending: level 1 has its closing page, three panels in order, then over', () => {
  assert.ok(E && !ENDINGS.tutorial, 'level 1 closes on a page, the tutorial on its leap');
  assert.equal(E.page.panels.length, 3);
  assert.equal(endingView(E, 0).panels, 0, 'black first, out of the getaway');
  let prev = 0;
  for (let t = 0; t < E.end; t += 0.05) {
    const v = endingView(E, t);
    assert.ok(v.panels >= prev && !v.over, `went back or ended early at ${t.toFixed(2)}`);
    prev = v.panels;
  }
  assert.equal(endingView(E, E.end - 0.01).panels, 3);
  assert.ok(endingView(E, E.end).over);
  assert.equal(E.page.end, E.end);
  assert.ok(ENDING.skipAfter > 0 && ENDING.skipAfter < 1);
});

test('ending: every panel has time to be read, the closing line is typed and stays a while', () => {
  const at = E.page.panels.map((p) => p.at);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 2.5, 'about three seconds a panel at least');
  const last = E.page.panels.at(-1), close = last.close;
  assert.ok(close && close.text.length, 'the page ends on its line');
  const typed = last.at + close.at + close.text.join('').length / TYPE;
  assert.ok(E.end - typed >= 2.5, `the closing line is all out ${(E.end - typed).toFixed(2)} s before the page goes`);
  for (const p of E.page.panels) assert.ok(p.caption && p.caption.every((l) => l.length <= (p.r.w > 200 ? 40 : 24)), 'captions fit their panel');
});

test('ending: the phone rings in bursts, each with its sound word', () => {
  const office = E.page.panels[1], words = office.sfx.filter((f) => f.text === 'RRRING');
  assert.equal(words.length, RING.n);
  for (const f of words) {
    assert.ok(ringing(f.at + 0.01) && ringing(f.at + f.dur - 0.01), 'the receiver rattles while the word is up');
    assert.ok(office.at + f.at + f.dur < E.end, 'each ring is seen');
  }
  assert.ok(!ringing(0) && !ringing(RING.first + RING.dur + 0.05), 'and is still between two rings');
});

test('ending: what is heard, once each, in order, all sounds the game has', () => {
  const heard = [];
  for (let t = -0.01; t < E.end; t += 1 / 60) heard.push(...endingBeats(E, t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard.filter((n) => n !== 'air'), ['passby', 'siren', 'pickup']);
  assert.ok(heard.filter((n) => n === 'air').length >= 3, 'the night all along');
  for (const n of heard) assert.ok(META[n], `${n} is a sound of the game`);
});
