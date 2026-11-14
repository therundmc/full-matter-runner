import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { loadSettings, saveSettings } = await load('game/systems/Settings.js');

const fakeStorage = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
};

test('settings: full volume when nothing is stored', () => {
  assert.deepEqual(loadSettings(fakeStorage()), { master: 1, music: 1, sfx: 1 });
});

test('settings: a saved set comes back as it was', () => {
  const st = fakeStorage();
  saveSettings({ master: 0.5, music: 0.25, sfx: 0 }, st);
  assert.deepEqual(loadSettings(st), { master: 0.5, music: 0.25, sfx: 0 });
});

test('settings: out-of-range values are clamped, garbage falls back to the default', () => {
  const st = fakeStorage();
  st.setItem('fmr.settings.v1', JSON.stringify({ master: 7, music: -3, sfx: 'loud' }));
  assert.deepEqual(loadSettings(st), { master: 1, music: 0, sfx: 1 });
  st.setItem('fmr.settings.v1', '{not json');
  assert.deepEqual(loadSettings(st), { master: 1, music: 1, sfx: 1 });
  st.setItem('fmr.settings.v1', 'null');
  assert.deepEqual(loadSettings(st), { master: 1, music: 1, sfx: 1 });
  st.setItem('fmr.settings.v1', JSON.stringify({ master: null, music: NaN }));
  assert.deepEqual(loadSettings(st), { master: 1, music: 1, sfx: 1 });
});

test('settings: a storage that throws (or is missing) never throws out', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadSettings(bad), { master: 1, music: 1, sfx: 1 });
  assert.doesNotThrow(() => saveSettings({ master: 1, music: 1, sfx: 1 }, bad));
  assert.deepEqual(loadSettings(null), { master: 1, music: 1, sfx: 1 });
  assert.doesNotThrow(() => saveSettings({ master: 1, music: 1, sfx: 1 }, null));
});

test('pause sliders: three rows in order, inside the screen, never overlapping', async (t) => {
  let pauseSliders;
  try { ({ pauseSliders } = await load('game/ui/Screens.js')); } catch (e) { t.skip(`Screens.js not loadable in Node: ${e.message}`); return; }
  for (const [W, H] of [[1280, 720], [1920, 1080]]) {
    const rows = pauseSliders(W, H);
    assert.deepEqual(rows.map((r) => r.key), ['master', 'music', 'sfx']);
    rows.forEach((r, i) => {
      assert.ok(r.x >= 0 && r.x + r.w <= W && r.y >= 0 && r.y + r.h <= H, `${r.key} inside ${W}x${H}`);
      if (i) assert.ok(r.y >= rows[i - 1].y + rows[i - 1].h, 'rows do not overlap');
    });
  }
});
