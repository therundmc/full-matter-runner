import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { loadSettings, saveSettings } = await load('game/systems/Settings.js');

const D = { master: 1, music: 1, sfx: 1, ambience: 1, lens: true, shake: 1, rumble: 1, fullscreen: false, aim: 'lock' };

const fakeStorage = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
};

test('settings: full volume, the lens on, full shake and no fullscreen when nothing is stored', () => {
  assert.deepEqual(loadSettings(fakeStorage()), D);
});

test('settings: a saved set comes back as it was', () => {
  const st = fakeStorage();
  const set = { master: 0.5, music: 0.25, sfx: 0, ambience: 0.3, lens: false, shake: 0.35, rumble: 0.6, fullscreen: true, aim: 'wedge' };
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

test('settings: booleans must be booleans, the shake is clamped like a volume', () => {
  const st = fakeStorage();
  st.setItem('fmr.settings.v1', JSON.stringify({ lens: 'no', fullscreen: 1, shake: 4 }));
  assert.deepEqual(loadSettings(st), D);
  st.setItem('fmr.settings.v1', JSON.stringify({ lens: false, fullscreen: true, shake: -1 }));
  assert.deepEqual(loadSettings(st), { ...D, lens: false, fullscreen: true, shake: 0 });
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

test('settings: the aim is one of its concepts, anything else is LOCK (the default)', () => {
  const st = fakeStorage();
  for (const [stored, read] of [['notch', 'notch'], ['laser', 'lock'], [3, 'lock'], [true, 'lock']]) {
    st.setItem('fmr.settings.v1', JSON.stringify({ aim: stored }));
    assert.equal(loadSettings(st).aim, read);
  }
});

test('settings: VIBRATION (rumble) is a share like a volume: kept, clamped, garbage back to full', () => {
  const st = fakeStorage();
  for (const [stored, read] of [[0, 0], [0.4, 0.4], [3, 1], [-2, 0], ['off', 1], [null, 1], [false, 1]]) {
    st.setItem('fmr.settings.v1', JSON.stringify({ rumble: stored }));
    assert.equal(loadSettings(st).rumble, read, String(stored));
  }
});
