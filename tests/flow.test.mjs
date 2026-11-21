// The game's state flow and its release layer: the mouse latch into play, the lens' canvas size, the developer's
// switches of a release build, records never stored as an array, a run helped by a cheat never ranked, the pause of
// the death screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const { default: Input } = await load('engine/Input.js');
const { fitView } = await load('engine/Camera.js');
const { devMode, devParam, BUILD } = await load('game/data/build.js');
const { saveBest, loadBest } = await load('game/systems/Records.js');
const { default: Sandbox } = await load('game/debug/Sandbox.js');
const { default: Menu } = await load('game/ui/Menu.js');
const { default: Game } = await load('game/Game.js');
const { default: FrameRenderer } = await load('game/render/FrameRenderer.js');
const { default: MenuInput } = await load('game/flow/MenuInput.js');
const { default: SettingsController } = await load('game/flow/SettingsController.js');
const { default: TimeScale } = await load('game/systems/TimeScale.js');

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
  const fit = (ok, lensOn) => new FrameRenderer({ post: ok ? { ok: true } : null, lensOn, wheel: false }).fit(290, 1080);
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
  assert.deepEqual(dead.activate(), { type: 'retry' }, 'a retry: at the last checkpoint where the level has them');
  assert.deepEqual(dead.back(), { type: 'resume' });
});

test('menu: the LEVELS board walks its notes by columns', () => {
  const m = new Menu('main', {
    settings: {}, progress: { done: ['tutorial'], unlocked: ['tutorial', 'level1'] }, best: () => null,
    levels: [{ id: 'tutorial', name: 'FIRST NIGHT' }, { id: 'level1', name: 'NO LOOSE ENDS' }],
  });
  m.open('levels');
  assert.equal(m.item.level, 'level1', 'it opens on the furthest level he can play');
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
    menu: { reset: (id) => calls.push(`menu ${id}`) }, pick: { reset() {} }, skip: { reset() {} }, menuInput: { reset() {} }, world: { player: {} },
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

// ---------------------------------------------------------------- Game.advance, state by state, on a fake input
// A game with only what advance reads before the world's step: the actions it takes are recorded, and reaching the
// step (CameraDirector.padAim, its first call there) ends the frame ('sim').
const { default: HoldSkip } = await load('game/ui/cine/Hold.js');
const { CHASE } = await load('game/data/chase.js');
const { SKIP } = await load('game/data/staging.js');
const { DEV_KEYS } = await load('game/data/build.js');
const SIM = new Error('the world steps');
function harness(state, stateT = 0) {
  const g = Object.create(Game.prototype), calls = [];
  Object.assign(g, {
    input: new Input(null, { pads: () => [] }), state, stateT, dev: true, skip: new HoldSkip(), paged: false, time: 0,
    levelId: 'tutorial', world: { level: { chase: { next: 'THE GAS STATION' } }, outro: { car: { exploded: false } } }, calls,
    prefs: { gesture() {} }, cameraDirector: { padAim() { throw SIM; } },
  });
  for (const m of ['restart', 'retry', 'showResults', 'endOutro', 'startLevel', 'completeLevel', 'pause', 'clearScreen']) g[m] = () => calls.push(m);
  return g;
}
// one frame of dt s: keys pressed this frame, keys held, a click; 'sim' when it went on to the world's step
function frame(g, { hit = [], held = [], click = false, dt = 1 / 60 } = {}) {
  const inp = g.input;
  inp.keys = new Set(held);
  for (const k of hit) inp.pressed.add(k);
  if (click) inp.mouse.clicked[0] = true;
  let out = 'done';
  try { g.advance(dt); } catch (e) { if (e !== SIM) throw e; out = 'sim'; }
  inp.consume();
  g.stateT += dt;
  return out;
}

test('game: Backspace restarts in play and dead only, never over a level already finished', () => {
  for (const s of ['play', 'dead']) {
    const g = harness(s, 1);
    frame(g, { hit: ['Backspace'] });
    assert.deepEqual(g.calls, ['restart'], s);
  }
  for (const [s, t] of [['outro', 0.5], ['continued', 0.5], ['fall', 0.1]]) {
    const g = harness(s, t);
    assert.equal(frame(g, { hit: ['Backspace'] }), 'sim', `${s}: the world plays on`);
    assert.ok(!g.calls.includes('restart'), s);
  }
  // the tutorial's leap, on its page: it still goes on to the next level, finished
  const g = harness('fall', 60);
  frame(g, { hit: ['Backspace'] });
  assert.deepEqual(g.calls.filter((c) => c !== 'clearScreen'), ['completeLevel', 'startLevel']);
});

test('game: TO BE CONTINUED is skipped by holding SPACE once it is up, never by a key, a stick\'s step or a click', () => {
  const F = CHASE.finish, g = harness('continued', F.skipAfter + 0.05);
  for (const hit of [['NavDown'], ['KeyD'], ['Enter'], ['PadA']]) assert.equal(frame(g, { hit, held: ['KeyD'], click: true }), 'sim', hit[0]);
  assert.ok(!g.calls.includes('showResults'));
  // SPACE still down from the drive (a shove) when it came up: let go first
  const h = harness('continued', F.skipAfter - 0.5);
  while (h.stateT < F.skipAfter + SKIP.hold * 2) frame(h, { held: ['Space'] });
  assert.ok(!h.calls.includes('showResults'), 'a SPACE still down from the drive');
  frame(h);
  let n = 0;
  while (!h.calls.includes('showResults') && n++ < 200) frame(h, { held: ['Space'] });
  assert.ok(h.calls.includes('showResults'), 'held: on to the results');
  assert.ok(n / 60 >= SKIP.hold - 0.02 && h.stateT < F.hold, 'after the hold, before it ends by itself');
  // left alone, the results follow by themselves
  const k = harness('continued', F.hold);
  frame(k);
  assert.deepEqual(k.calls, ['showResults']);
});

test('game: the hit list between two levels plays the menu\'s music, calm, not the last level\'s', async () => {
  const { default: Music } = await load('audio/Music.js');
  const { MENU_TRACK, TRACKS } = await load('audio/tracks/index.js');
  const other = Object.keys(TRACKS).find((id) => id !== MENU_TRACK);
  Music.setTrack(other);
  Music.setIntensity(0.8);
  const g = harness('hitlist', 0.2);
  assert.equal(frame(g), 'done');
  assert.equal(Music.track, MENU_TRACK);
  assert.equal(Music.game.intensity, 0);
});

test('game: the pause\'s page reads what it was opened from (RETRY over the death screen)', () => {
  const seen = [];
  const g = Object.assign(Object.create(Game.prototype), {
    state: 'dead', stateT: 2, input: { padLost: false, focusLost: false, holdMouse() {} }, pick: { reset() {} }, skip: { reset() {} }, menuInput: { reset() {} },
    world: { player: {} },
  });
  g.menu = new Menu('main', () => {
    seen.push(g.pausedFrom?.state);
    return { settings: {}, progress: { done: [], unlocked: ['tutorial'] }, best: () => null, levels: [], dead: g.pausedFrom?.state === 'dead' };
  });
  seen.length = 0;
  g.pause();
  assert.ok(seen.length > 0 && seen.every((s) => s === 'dead'), 'the page was built knowing it');
  assert.equal(g.menu.item.label, 'RETRY');
});

// a game with what the menu's input reads, on a real menu (its actions recorded, not applied)
function menuGame(root, settings = {}) {
  const g = {
    input: new Input(null, { pads: () => [] }), state: 'title', time: 0,
    settings: { master: 1, music: 1, sfx: 1, ambience: 1, shake: 1, rumble: 1, ...settings },
    pick: { press() {} }, rumble: { sample() {}, tick() {} }, applied: [],
  };
  g.prefs = Object.assign(new SettingsController(g), { fullChoice: false });
  g.menuInput = new MenuInput(g);
  g.menuInput.apply = (a) => { g.applied.push(a); return false; };
  g.menu = new Menu(root, () => ({ settings: g.settings, progress: { done: [], unlocked: ['tutorial'] }, best: () => null, levels: [] }));
  return g;
}

test('game: a slider let go saves the player\'s fullscreen choice, never the browser\'s state', () => {
  const was = globalThis.localStorage;
  globalThis.localStorage = memory();
  try {
    const g = menuGame('audio', { master: 0.4, fullscreen: true }); // in fullscreen now, never chosen: the browser's
    const mi = g.menuInput;
    mi.grab = 0;
    mi.rects = [{ i: 0, page: 'audio', x: 0, y: 0, w: 100, h: 10, track: { x: 0, w: 100 } }];
    mi.update(g.input); // the button is up: the drag is over
    assert.equal(mi.grab, null);
    const kept = JSON.parse(globalThis.localStorage.getItem('fmr.settings.v1'));
    assert.equal(kept.master, 0.4);
    assert.equal(kept.fullscreen, false, 'fullChoice, as SettingsController.save keeps it');
  } finally {
    if (was === undefined) delete globalThis.localStorage; else globalThis.localStorage = was;
  }
});

test('game: a menu rect drawn for a page that has left the top is never taken for an item of the new one', () => {
  const g = menuGame('main'), mi = g.menuInput;
  // drawn for the title's first page (untagged: MenuInput.drawn says which); OPTIONS' own rects keep their page
  const rects = mi.drawn([{ i: 1, x: 0, y: 0, w: 50, h: 20 }, { i: 0, page: 'audio', x: 0, y: 40, w: 50, h: 20 }]);
  assert.deepEqual(rects.map((r) => r.page), ['main', 'audio']);
  mi.rects = rects;
  g.menu.open('options'); // the page changed after that draw
  const before = JSON.stringify(g.menu.stack);
  g.input.mouse.x = 10; g.input.mouse.y = 10; g.input.mouse.clicked[0] = true;
  mi.update(g.input);
  assert.equal(JSON.stringify(g.menu.stack), before, 'OPTIONS\' item 1 not clicked through a rect of the first page');
  assert.deepEqual(g.applied, []);
  // drawn again for OPTIONS, the same spot clicks its item
  mi.rects = mi.drawn([{ i: 1, x: 0, y: 0, w: 50, h: 20 }]);
  g.input.consume();
  g.input.mouse.clicked[0] = true;
  mi.update(g.input);
  assert.equal(g.menu.top.id, 'video', 'VIDEO\'s sheet entered');
});

test('build: DEV_KEYS holds every function key the game reads, so that a release build ignores them all', () => {
  const read = new Set(), walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) for (const m of readFileSync(p, 'utf8').matchAll(/(?:hit|down)\('(F\d+)'\)/g)) read.add(m[1]);
    }
  };
  walk(fileURLToPath(new URL('../src', import.meta.url)));
  assert.ok(read.size >= 5, [...read].join(' '));
  for (const k of read) assert.ok(DEV_KEYS.includes(k), `${k} is read but not a developer's key`);
});

test('game: its clock members are the time scale\'s (World.hitstop, Impact.slowAtLeast, the QA robot, the perf overlay)', () => {
  const g = Object.create(Game.prototype);
  g.tempo = new TimeScale();
  g.slowmo(0.3, 2);
  assert.deepEqual(g.slow, { scale: 0.3, t: 2 });
  g.hitstop = Math.max(g.hitstop, 0.1); // World.hitstop
  assert.equal(g.tempo.hitstop, 0.1);
  g.tempo.scale = 0.5;
  assert.equal(g.timeScale, 0.5);
  g.slow = null;
  assert.equal(g.tempo.slow, null);
});
