// The game's state table (flow/States.js): every state the game is put in has its entry, and each per-state list
// (rumble, cursor, HUD, Backspace, comic pages, lessons, the world on its own, real time, the hold ring) says what the
// game always did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const { STATES, stateOf, phaseOf, FALLEN } = await load('game/flow/States.js');
const { CHASE } = await load('game/data/chase.js');

// every state and phase, the tutorial's fall seen on both sides of its going black
const ALL = ['loading', 'title', 'hitlist', 'pause', 'results', 'cinematic', 'intro', 'ending', 'play', 'dead', 'fall', 'leap', 'outro', 'continued'];
const at = (phase) => (phase === 'leap' ? { state: 'fall', stateT: FALLEN + 1 } : { state: phase, stateT: 0.1 });
const having = (flag) => ALL.filter((p) => stateOf(at(p)).flags[flag]);

test('states: every state the game is put in has its entry, and all but loading a frame of their own', () => {
  const set = new Set(), walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) for (const m of readFileSync(p, 'utf8').matchAll(/setState\('(\w+)'\)/g)) set.add(m[1]);
    }
  };
  walk(fileURLToPath(new URL('../src', import.meta.url)));
  assert.ok(set.size >= 10, [...set].join(' '));
  for (const s of set) assert.ok(STATES[s], `${s}: in the table`);
  for (const p of ALL) assert.equal(!!STATES[p].update, p !== 'loading', p);
  assert.deepEqual(Object.keys(STATES).sort(), [...ALL].sort());
});

test('states: the tutorial\'s fall is the world until it has gone black, its leap\'s page after', () => {
  assert.equal(phaseOf('fall', 0), 'fall');
  assert.equal(phaseOf('fall', FALLEN - 0.01), 'fall');
  assert.equal(phaseOf('fall', FALLEN), 'leap');
  assert.equal(phaseOf('play', 99), 'play');
});

test('states: the per-state lists', () => {
  // the pad rumbles in play only: not paused, no menu, no page over the world
  assert.deepEqual(having('rumble'), ['play', 'dead', 'fall', 'outro', 'continued']);
  // the cursor: never on the loading screen, a comic page, the fall, the getaway or TO BE CONTINUED
  assert.deepEqual(having('cursor'), ['title', 'hitlist', 'pause', 'results', 'intro', 'play', 'dead']);
  assert.deepEqual(having('hud'), ['play', 'dead'], 'not under the pause: its card says the run so far');
  assert.deepEqual(having('backspace'), ['play', 'dead'], 'never over a level already finished');
  assert.deepEqual(having('page'), ['cinematic', 'ending', 'leap']);
  assert.deepEqual(having('lessons'), ['play', 'fall']);
  assert.deepEqual(having('auto'), ['fall', 'outro', 'continued'], 'no debug keys while the world plays on by itself');
  assert.deepEqual(having('realTime'), ['outro']);
  assert.deepEqual(having('scene'), ALL.filter((p) => !['loading', 'title', 'hitlist'].includes(p)));
});

test('states: the hold ring shows where holding SPACE skips', () => {
  const hold = (p, g = {}) => !!stateOf(at(p)).hold?.({ ...at(p), ...g });
  for (const p of ['cinematic', 'ending', 'leap', 'outro']) assert.ok(hold(p), p);
  for (const p of ['title', 'hitlist', 'pause', 'results', 'intro', 'dead', 'fall', 'loading']) assert.ok(!hold(p), p);
  // in play: the opening on his cigarette only (2A)
  assert.ok(!hold('play', { world: {} }));
  assert.ok(hold('play', { world: { drive: { drag: { on: true } } } }));
  // TO BE CONTINUED: once it can be skipped
  assert.ok(!hold('continued', { stateT: 0 }));
  assert.ok(hold('continued', { stateT: CHASE.finish.skipAfter + 0.05 }));
});

test('states: a comic page and the world drawn in its place', () => {
  for (const p of ALL) assert.equal(!!stateOf(at(p)).picture, ['cinematic', 'ending', 'leap'].includes(p), p);
});
