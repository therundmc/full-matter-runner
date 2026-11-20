import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { loadSettings, saveSettings } = await load('game/systems/Settings.js');

const D = { master: 1, music: 1, sfx: 1, ambience: 1, quality: 'auto', autoQuality: 'high', shake: 1, rumble: 1, fullscreen: false, aimMark: false };

const fakeStorage = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
};

test('settings: full volume, the quality on AUTO, full shake and no fullscreen when nothing is stored', () => {
  assert.deepEqual(loadSettings(fakeStorage()), D);
});

test('settings: a saved set comes back as it was', () => {
  const st = fakeStorage();
  const set = { master: 0.5, music: 0.25, sfx: 0, ambience: 0.3, quality: 'medium', autoQuality: 'low', shake: 0.35, rumble: 0.6, fullscreen: true, aimMark: true };
  saveSettings(set, st);
  assert.deepEqual(loadSettings(st), set);
});

test('settings: what an older version stored (volumes only) is still read, the new keys at their default', () => {
  const st = fakeStorage();
  st.setItem('fmr.settings.v1', JSON.stringify({ master: 0.4, music: 0.6, sfx: 0.8 }));
  assert.deepEqual(loadSettings(st), { ...D, master: 0.4, music: 0.6, sfx: 0.8 });
  // a set saved from it keeps every key
  saveSettings(loadSettings(st), st);
  assert.deepEqual(JSON.parse(st.getItem('fmr.settings.v1')), { ...D, master: 0.4, music: 0.6, sfx: 0.8 });
});

test('settings: LOCK\'s floor chevron (aimMark) is off by default, kept once turned on, a boolean only', () => {
  const st = fakeStorage();
  assert.equal(loadSettings(st).aimMark, false);
  saveSettings({ ...D, aimMark: true }, st);
  assert.equal(loadSettings(st).aimMark, true);
  st.setItem('fmr.settings.v1', JSON.stringify({ aimMark: 'yes' }));
  assert.equal(loadSettings(st).aimMark, false);
});

test('settings: booleans must be booleans, the shake is clamped like a volume', () => {
  const st = fakeStorage();
  st.setItem('fmr.settings.v1', JSON.stringify({ aimMark: 'no', fullscreen: 1, shake: 4 }));
  assert.deepEqual(loadSettings(st), D);
  st.setItem('fmr.settings.v1', JSON.stringify({ aimMark: true, fullscreen: true, shake: -1 }));
  assert.deepEqual(loadSettings(st), { ...D, aimMark: true, fullscreen: true, shake: 0 });
});

test('settings: an old save that turned the lens off no longer does: the key is not read, nor written back', () => {
  const st = fakeStorage();
  st.setItem('fmr.settings.v1', JSON.stringify({ lens: false, master: 0.5 }));
  const s = loadSettings(st);
  assert.deepEqual(s, { ...D, master: 0.5 });
  assert.ok(!('lens' in s));
  saveSettings({ ...s, lens: false }, st);
  assert.ok(!('lens' in JSON.parse(st.getItem('fmr.settings.v1'))));
});

test('settings: the quality is AUTO by default and one of its four values; what AUTO settled on is a level', () => {
  const st = fakeStorage();
  assert.deepEqual([loadSettings(st).quality, loadSettings(st).autoQuality], ['auto', 'high']);
  for (const q of ['auto', 'low', 'medium', 'high']) {
    saveSettings({ ...D, quality: q, autoQuality: 'medium' }, st);
    assert.deepEqual([loadSettings(st).quality, loadSettings(st).autoQuality], [q, 'medium']);
  }
  st.setItem('fmr.settings.v1', JSON.stringify({ quality: 'ultra', autoQuality: 'auto' }));
  assert.deepEqual([loadSettings(st).quality, loadSettings(st).autoQuality], ['auto', 'high']);
});

test('settings: out-of-range values are clamped, garbage falls back to the default', () => {
  const st = fakeStorage();
  st.setItem('fmr.settings.v1', JSON.stringify({ master: 7, music: -3, sfx: 'loud' }));
  assert.deepEqual(loadSettings(st), { ...D, master: 1, music: 0, sfx: 1 });
  st.setItem('fmr.settings.v1', '{not json');
  assert.deepEqual(loadSettings(st), D);
  st.setItem('fmr.settings.v1', 'null');
  assert.deepEqual(loadSettings(st), D);
  st.setItem('fmr.settings.v1', JSON.stringify({ master: null, music: NaN }));
  assert.deepEqual(loadSettings(st), D);
});

test('settings: a storage that throws (or is missing) never throws out', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadSettings(bad), D);
  assert.doesNotThrow(() => saveSettings({ master: 1, music: 1, sfx: 1 }, bad));
  assert.deepEqual(loadSettings(null), D);
  assert.doesNotThrow(() => saveSettings({ master: 1, music: 1, sfx: 1 }, null));
});

test('settings: an old save\'s aim style (`aim`, gone: the aim is LOCK) loads fine, is ignored and not saved again', () => {
  const st = fakeStorage();
  for (const stored of ['wedge', 'cross', 'lock', 3, null]) {
    st.setItem('fmr.settings.v1', JSON.stringify({ master: 0.5, aim: stored, aimMark: true }));
    const s = loadSettings(st);
    assert.deepEqual(s, { ...D, master: 0.5, aimMark: true }, String(stored));
    saveSettings(s, st);
    assert.ok(!('aim' in JSON.parse(st.getItem('fmr.settings.v1'))));
  }
});

test('settings: VIBRATION (rumble) is a share like a volume: kept, clamped, garbage back to full', () => {
  const st = fakeStorage();
  for (const [stored, read] of [[0, 0], [0.4, 0.4], [3, 1], [-2, 0], ['off', 1], [null, 1], [false, 1]]) {
    st.setItem('fmr.settings.v1', JSON.stringify({ rumble: stored }));
    assert.equal(loadSettings(st).rumble, read, String(stored));
  }
});
