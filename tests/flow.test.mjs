// The game's state flow and its release layer: the mouse latch into play, the lens' canvas size, the developer's
// switches of a release build, records never stored as an array, a run helped by a cheat never ranked, the pause of
// the death screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Input } = await load('engine/Input.js');
const { fitView } = await load('engine/Camera.js');
const { devMode, devParam, BUILD } = await load('game/data/build.js');
const { saveBest, loadBest } = await load('game/systems/Records.js');
const { default: Sandbox } = await load('game/debug/Sandbox.js');
const { default: Menu } = await load('game/ui/Menu.js');
const { default: Game } = await load('game/Game.js');

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('input: holdMouse keeps a button still down from reading as down until it is let go and pressed again', () => {
  const inp = new Input(null, { pads: () => [] });
  inp.press(0);
  assert.ok(inp.mouseDown(0));
  inp.holdMouse();             // RESUME clicked: play starts with the button still down
  inp.consume();
  inp.poll(1 / 60);
  assert.equal(inp.mouseDown(0), false, 'the click into play is no swing');
  inp.poll(1 / 60);
  assert.equal(inp.mouseDown(0), false, 'still held: still up');
  inp.release(0);
  assert.equal(inp.mouseDown(0), false);
  inp.press(0);
  assert.ok(inp.mouseDown(0), 'a new press is read');
  // a button written straight in (the QA robot) and let go clears it too; a button up when held is not affected
  inp.mouse.down[2] = true;
  inp.holdMouse();
  assert.equal(inp.mouseDown(2), false);
  inp.mouse.down[2] = false;
  inp.poll(1 / 60);
  inp.mouse.down[2] = true;
  assert.ok(inp.mouseDown(2));
});

test('game: the canvas is oversized for the lens only while the lens is on', () => {
  const fit = (ok, lensOn) => Game.prototype.fit.call({ post: ok ? { ok: true } : null, lensOn, wheel: false }, 290, 1080);
  assert.deepEqual(fit(true, true), fitView(290, 1080, true, false));
  assert.deepEqual(fit(true, false), fitView(290, 1080, false, false), 'F6 (the developer\'s): the window\'s size');
  assert.deepEqual(fit(false, true), fitView(290, 1080, false, false), 'no lens to be had');
  assert.equal(fit(true, false).ss, 1);
});

test('build: a release without ?dev=1 has no developer tools; a dev build and ?dev=1 have them', () => {
  assert.equal(BUILD.release, false, 'the repository builds for the developer (QA and tools/shot.mjs drive window.game)');
  const release = { release: true }, dev = { release: false };
  assert.equal(devMode('', release), false);
  assert.equal(devMode('?level=lab', release), false);
  assert.equal(devMode('?dev=1', release), true);
  assert.equal(devMode('', dev), true);
  assert.equal(devParam('level', '?level=lab', release), null, 'a switch does nothing in a release');
  assert.equal(devParam('level', '?level=lab&dev=1', release), 'lab');
  assert.equal(devParam('killcam', '?killcam=off', dev), 'off');
  assert.equal(devParam('post', '', dev), null);
});

test('records: a store holding an array is started over, never written back as one', () => {
  const s = memory({ 'fmr.best.v1': '[]' });
  assert.equal(loadBest('level1', s), null);
  assert.equal(saveBest('level1', { total: 1200, grade: 'A', time: 61.2 }, s).record, true);
  assert.deepEqual(loadBest('level1', s), { total: 1200, grade: 'A', time: 61 });
});

test('sandbox: any cheat makes the run unranked, and the title takes them all off', () => {
  const sb = new Sandbox();
  sb.attach({ level: {}, player: {} });
  assert.equal(sb.cheats, false);
  for (const set of [(s) => { s.on = true; }, (s) => { s.god = true; }, (s) => { s.frozen = true; }, (s) => { s.speed = 1; }]) {
    set(sb);
    assert.equal(sb.cheats, true);
    sb.reset();
    assert.equal(sb.cheats, false);
  }
  // god mode carried over a restart: the new run is unranked from its start
  sb.god = true;
  const w = { level: {}, player: {} };
  sb.attach(w);
  assert.ok(w.player.invulnerable && sb.cheats);
  sb.detach();
  assert.equal(sb.world, null);
});

test('menu: the pause of the death screen offers RETRY instead of RESUME; going back returns to it', () => {
  const ctx = (dead) => ({ settings: {}, progress: { done: [], unlocked: ['tutorial'] }, best: () => null, levels: [], dead });
  const labels = (m) => m.page.items.map((it) => it.label);
  const live = new Menu('pause', ctx(false)), dead = new Menu('pause', ctx(true));
  assert.deepEqual(labels(live), ['RESUME', 'OPTIONS', 'RESTART', 'QUIT TO MENU']);
  assert.deepEqual(labels(dead), ['RETRY', 'OPTIONS', 'QUIT TO MENU']);
  assert.deepEqual(dead.activate(), { type: 'restart' });
  assert.deepEqual(dead.back(), { type: 'resume' });
});

test('menu: the LEVELS board walks its notes by columns', () => {
  const m = new Menu('main', {
    settings: {}, progress: { done: ['tutorial'], unlocked: ['tutorial', 'level1'] }, best: () => null,
    levels: [{ id: 'tutorial', name: 'FIRST NIGHT' }, { id: 'level1', name: 'NO LOOSE ENDS' }],
  });
  m.open('levels');
  assert.equal(m.item.level, 'tutorial');
  m.right();
  assert.equal(m.item.level, 'level1');
  m.left();
  assert.equal(m.item.level, 'tutorial');
  m.down();
  assert.equal(m.item.label, 'BACK', 'BACK is under the tutorial\'s note');
  m.left();
  assert.ok(m.item.soon, 'round the board: the last column, a level not made yet');
  assert.equal(m.activate(), null);
});

test('game: pause and resume go back to the state the pause was opened from, the death screen where it was', () => {
  const calls = [];
  const g = {
    state: 'dead', stateT: 1.7, input: { padLost: true, focusLost: true, holdMouse: () => calls.push('hold') },
    menu: { reset: (id) => calls.push(`menu ${id}`) }, skip: { reset() {} }, world: { player: {} },
  };
  g.setState = Game.prototype.setState;
  Game.prototype.pause.call(g);
  assert.equal(g.state, 'pause');
  assert.deepEqual(g.pausedFrom, { state: 'dead', t: 1.7 });
  assert.ok(!g.input.padLost && !g.input.focusLost);
  Game.prototype.resume.call(g);
  assert.equal(g.state, 'dead');
  assert.equal(g.stateT, 1.7, 'the death screen is not played again');
  assert.equal(g.pausedFrom, null);
  // from play: back into play, the button that clicked RESUME latched
  g.state = 'play';
  Game.prototype.pause.call(g);
  Game.prototype.resume.call(g);
  assert.equal(g.state, 'play');
  assert.ok(calls.includes('hold'));
});
