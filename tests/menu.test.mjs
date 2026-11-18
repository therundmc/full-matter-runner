import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Menu, CONTROLS, STEP } = await load('game/ui/Menu.js');
const { complete } = await load('game/systems/Progress.js');

const FRESH = { unlocked: ['tutorial'], done: [] };
// a context made of plain objects; `set` actions are written back into it as Game.js does
function ctx(more = {}) {
  return {
    settings: { master: 1, music: 0.5, sfx: 0.02, ambience: 0.5, lens: true, shake: 1, fullscreen: false, aim: 'cross' },
    progress: FRESH,
    best: (id) => (id === 'tutorial' ? { total: 4200, grade: 'B', time: 95 } : null),
    levels: [{ id: 'tutorial', name: 'FIRST NIGHT' }, { id: 'level1', name: 'NEON NIGHTS' }],
    ...more,
  };
}
const apply = (c, a) => { if (a?.type === 'set') c.settings[a.key] = a.value; return a; };
const labels = (m) => m.page.items.map((it) => it.label ?? it.info?.[1]);
const selected = (m) => m.item?.label;
// opens a page from where the menu stands by choosing the item with that label
function choose(m, label) {
  const i = m.page.items.findIndex((it) => it.label === label);
  assert.ok(i >= 0, `${label} on ${m.page.id}`);
  return m.click(i);
}

test('menu: a fresh save has no CONTINUE and starts on NEW GAME', () => {
  const m = new Menu('main', ctx());
  assert.deepEqual(labels(m), ['NEW GAME', 'LEVELS', 'OPTIONS']);
  assert.equal(selected(m), 'NEW GAME');
  assert.deepEqual(m.activate(), { type: 'newGame' });
  assert.deepEqual(m.primary(), { type: 'newGame' });
});

test('menu: CONTINUE comes first once something was played, and is the default', () => {
  for (const progress of [complete(FRESH, 'tutorial'), { unlocked: ['tutorial'], done: ['level1'] }]) {
    const m = new Menu('main', ctx({ progress }));
    assert.deepEqual(labels(m), ['CONTINUE', 'NEW GAME', 'LEVELS', 'OPTIONS']);
    assert.equal(selected(m), 'CONTINUE');
    assert.deepEqual(m.activate(), { type: 'continue' });
    assert.deepEqual(m.primary(), { type: 'continue' });
  }
});

test('menu: up / down wrap around, the main row walks with left / right too', () => {
  const m = new Menu('main', ctx());
  m.up();
  assert.equal(selected(m), 'OPTIONS');
  m.down();
  assert.equal(selected(m), 'NEW GAME');
  assert.equal(m.right(), null);
  assert.equal(selected(m), 'LEVELS');
  m.left(); m.left();
  assert.equal(selected(m), 'OPTIONS');
});

test('menu: sub-pages open and back returns to the line it left; back at the title root does nothing', () => {
  const m = new Menu('main', ctx());
  m.down(); m.down();
  assert.equal(m.activate(), null);
  assert.equal(m.page.id, 'options');
  assert.equal(m.depth, 1);
  m.down();
  m.activate();
  assert.equal(m.page.id, 'video');
  assert.equal(m.back(), null);
  assert.equal(m.page.id, 'options');
  assert.equal(selected(m), 'VIDEO');
  choose(m, 'BACK');
  assert.equal(m.page.id, 'main');
  assert.equal(selected(m), 'OPTIONS');
  assert.equal(m.back(), null);
  assert.equal(m.page.id, 'main');
  assert.deepEqual(m.primary(), { type: 'newGame' });
  m.open('options');
  assert.equal(m.primary(), null, 'a click beside the menu starts nothing on a sub-page');
});

test('menu: sliders move by a step and clamp, a set is only sent when the value changes', () => {
  const c = ctx(), m = new Menu('main', c);
  choose(m, 'OPTIONS'); choose(m, 'AUDIO');
  assert.deepEqual(labels(m), ['MASTER', 'MUSIC', 'EFFECTS', 'AMBIENCE', 'BACK']);
  assert.equal(selected(m), 'MASTER');
  assert.equal(m.right(), null, 'already full');
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'master', value: 1 - STEP });
  m.down();
  assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'music', value: 0.55 });
  m.down();
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'sfx', value: 0 }, 'clamped at 0');
  assert.equal(m.left(), null);
  m.down();
  assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'ambience', value: 0.55 });
  assert.equal(m.activate(), null, 'Enter on a slider does nothing');
  assert.equal(m.click(3), null, 'a click on a slider is a drag, for the caller');
  m.down();
  assert.equal(selected(m), 'BACK');
  assert.equal(m.right(), null);
});

test('menu: toggles flip with Enter, a click and left / right; a lens that cannot be had is skipped', () => {
  const c = ctx(), m = new Menu('main', c);
  choose(m, 'OPTIONS'); choose(m, 'VIDEO');
  assert.deepEqual(labels(m), ['LENS', 'SCREEN SHAKE', 'FULLSCREEN', 'BACK']);
  assert.deepEqual(apply(c, m.activate()), { type: 'set', key: 'lens', value: false });
  assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'lens', value: true });
  m.down();
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'shake', value: 0.95 });
  assert.deepEqual(m.click(2), { type: 'set', key: 'fullscreen', value: true });

  const n = new Menu('main', ctx({ lensOk: false }));
  choose(n, 'OPTIONS'); choose(n, 'VIDEO');
  assert.equal(selected(n), 'SCREEN SHAKE', 'the disabled lens is not the default');
  n.up();
  assert.equal(selected(n), 'BACK', 'up skips it and wraps');
  n.hover(0);
  assert.equal(selected(n), 'BACK', 'nor can the mouse select it');
  assert.equal(n.click(0), null);
});

test('menu: the levels page lists the campaign with best results; a locked level is seen, never started', () => {
  const m = new Menu('main', ctx());
  choose(m, 'LEVELS');
  const [tut, l1] = m.page.items;
  assert.deepEqual([tut.label, tut.locked, tut.best.grade, tut.n], ['FIRST NIGHT', false, 'B', 1]);
  assert.deepEqual([l1.label, l1.locked, l1.best, l1.n], ['NEON NIGHTS', true, null, 2]);
  assert.deepEqual(m.activate(), { type: 'start', level: 'tutorial' });
  m.down();
  assert.equal(selected(m), 'NEON NIGHTS', 'the locked level can be selected');
  assert.equal(m.activate(), null);
  assert.equal(m.click(1), null);
  // opened once the tutorial is done
  const n = new Menu('main', ctx({ progress: complete(FRESH, 'tutorial') }));
  choose(n, 'LEVELS');
  assert.deepEqual(n.click(1), { type: 'start', level: 'level1' });
});

test('menu: without the tutorial, the first level there is stays open', () => {
  const m = new Menu('main', ctx({ levels: [{ id: 'level1', name: 'NEON NIGHTS' }] }));
  choose(m, 'LEVELS');
  assert.equal(m.page.items[0].locked, false);
  assert.deepEqual(m.activate(), { type: 'start', level: 'level1' });
  // and nothing offers to replay a tutorial that is not there
  m.back();
  choose(m, 'OPTIONS'); choose(m, 'GAME');
  assert.deepEqual(labels(m), ['RESET PROGRESSION', 'AIM', 'BACK']);
});

test('menu: the controls page is read-only: only BACK can be selected', () => {
  const m = new Menu('main', ctx());
  choose(m, 'OPTIONS'); choose(m, 'CONTROLS');
  const items = m.page.items;
  assert.equal(items.filter((it) => it.info).length, CONTROLS.flat().length);
  assert.equal(selected(m), 'BACK');
  m.up(); m.down();
  assert.equal(selected(m), 'BACK');
  m.hover(0);
  assert.equal(selected(m), 'BACK');
  assert.equal(m.activate(), null);
  assert.equal(m.page.id, 'options');
});

test('menu: RESET PROGRESSION asks first: NO goes back, YES resets and goes back', () => {
  const m = new Menu('main', ctx());
  choose(m, 'OPTIONS'); choose(m, 'GAME');
  assert.deepEqual(labels(m), ['REPLAY THE TUTORIAL', 'RESET PROGRESSION', 'AIM', 'BACK']);
  assert.deepEqual(m.activate(), { type: 'replayTutorial' });
  m.down();
  m.activate();
  assert.equal(m.page.id, 'confirm');
  assert.ok(m.page.note);
  assert.equal(selected(m), 'NO', 'NO is the default');
  assert.equal(m.activate(), null);
  assert.equal(m.page.id, 'game');
  assert.equal(selected(m), 'RESET PROGRESSION');
  m.activate();
  m.down();
  assert.deepEqual(m.activate(), { type: 'reset' });
  assert.equal(m.page.id, 'game');
});

test('menu: the pause resumes from its root, its actions are plain', () => {
  const m = new Menu('pause', ctx());
  assert.deepEqual(labels(m), ['RESUME', 'OPTIONS', 'RESTART', 'QUIT TO MENU']);
  assert.deepEqual(m.activate(), { type: 'resume' });
  assert.deepEqual(m.back(), { type: 'resume' });
  assert.deepEqual(m.click(2), { type: 'restart' });
  assert.deepEqual(m.click(3), { type: 'quit' });
  assert.equal(m.primary(), null);
  m.click(1);
  assert.equal(m.page.id, 'options');
  assert.equal(m.back(), null, 'a sub-page goes back first');
  assert.equal(m.page.id, 'pause');
  assert.deepEqual(m.back(), { type: 'resume' });
});

test('menu: a page that changes under the selection puts it back on a selectable item', () => {
  const c = ctx({ progress: complete(FRESH, 'tutorial') }), m = new Menu('main', c);
  m.left();
  assert.equal(selected(m), 'OPTIONS');
  c.progress = FRESH; // reset while the menu was up: CONTINUE is gone, the row is one shorter
  m.reset('main');
  assert.equal(selected(m), 'NEW GAME');
  const n = new Menu('main', () => c);
  n.hover(5);
  assert.equal(selected(n), 'NEW GAME', 'hovering nothing changes nothing');
});

test('menu: AIM is a choice: left / right and ENTER walk the concepts round, a click too', () => {
  const c = ctx(), m = new Menu('main', c);
  choose(m, 'OPTIONS'); choose(m, 'GAME');
  const i = m.page.items.findIndex((it) => it.label === 'AIM'), it = m.page.items[i];
  assert.deepEqual(it.options, ['cross', 'line', 'wedge', 'notch', 'lock']);
  for (const v of it.options) assert.ok(it.names[v], `${v} has a name`);
  m.hover(i);
  assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'aim', value: 'line' });
  assert.deepEqual(apply(c, m.activate()), { type: 'set', key: 'aim', value: 'wedge' });
  assert.deepEqual(apply(c, m.click(i)), { type: 'set', key: 'aim', value: 'notch' });
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'aim', value: 'wedge' });
  c.settings.aim = 'cross';
  assert.deepEqual(m.left(), { type: 'set', key: 'aim', value: 'lock' }, 'round the list');
  assert.equal(m.page.id, 'game', 'it stays on its page');
});
