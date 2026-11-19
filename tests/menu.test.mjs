import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './setup.mjs';

const { default: Menu, STEP, selectable } = await load('game/ui/Menu.js');
const { KBM_CONTROLS, PAD_CONTROLS, PAD_BINDINGS } = await load('game/data/controls.js');
const { complete } = await load('game/systems/Progress.js');

const FRESH = { unlocked: ['tutorial'], done: [] };
// a context made of plain objects; `set` actions are written back into it as Game.js does
function ctx(more = {}) {
  return {
    settings: { master: 1, music: 0.5, sfx: 0.02, ambience: 0.5, quality: 'auto', autoQuality: 'high', shake: 1, rumble: 1, fullscreen: false, aim: 'lock', aimMark: false },
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

test('menu: no sub-page of OPTIONS has a BACK line (ESC / B / the right button go back); the cap stays on OPTIONS', () => {
  const m = new Menu('main', ctx());
  choose(m, 'OPTIONS');
  assert.deepEqual(labels(m), ['AUDIO', 'VIDEO', 'CONTROLS', 'GAME', 'BACK']);
  for (const id of ['audio', 'video', 'controls', 'game']) {
    assert.ok(!m.pageOf(id).items.some((it) => it.back || it.label === 'BACK'), `${id} has no BACK`);
  }
});

test('menu: on OPTIONS the chosen thing shows its sheet at once; RIGHT / ENTER take the focus onto it, LEFT and back bring it out', () => {
  const c = ctx(), m = new Menu('main', c);
  choose(m, 'OPTIONS');
  assert.equal(m.page.sheets, true);
  assert.equal(m.sheet, 'audio', 'AUDIO chosen: its sheet is shown without a press');
  m.down();
  assert.equal(m.sheet, 'video', 'moving onto a thing is enough');
  m.down(); m.down(); m.down();
  assert.equal(selected(m), 'BACK');
  assert.equal(m.sheet, null, 'the cap has no sheet');
  m.down();
  // RIGHT: onto the sheet's first line
  assert.equal(m.right(), null);
  assert.equal(m.page.id, 'audio');
  assert.equal(selected(m), 'MASTER');
  assert.ok(m.holder && m.holder.id === 'options');
  m.down();
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'music', value: 0.45 }, 'LEFT on a slider moves it');
  assert.equal(m.page.id, 'audio', '... and keeps the focus');
  assert.equal(m.back(), null);
  assert.equal(m.page.id, 'options');
  assert.equal(selected(m), 'AUDIO', 'back on the thing it came from');
  // ENTER: the same; LEFT on a line that is no slider nor toggle comes out
  m.down(); m.down(); m.down();
  assert.equal(selected(m), 'GAME');
  m.activate();
  assert.equal(m.page.id, 'game');
  assert.equal(selected(m), 'REPLAY THE TUTORIAL');
  assert.equal(m.right(), null);
  assert.equal(m.page.id, 'game', 'RIGHT on an action line does nothing');
  assert.equal(m.left(), null);
  assert.equal(m.page.id, 'options', 'LEFT on an action line goes back to the things');
  assert.equal(selected(m), 'GAME');
  // LEFT on the things does nothing; CONTROLS has nothing to rest on: RIGHT / ENTER leave the focus on the things
  assert.equal(m.left(), null);
  assert.equal(m.page.id, 'options');
  m.up();
  assert.equal(m.sheet, 'controls');
  m.right(); m.activate();
  assert.equal(m.page.id, 'options');
  assert.equal(selected(m), 'CONTROLS');
});

test('menu: the mouse moves the focus where it points: a line of the sheet shown, back onto a thing', () => {
  const m = new Menu('main', ctx());
  choose(m, 'OPTIONS');
  m.point('options', 1);
  assert.equal(selected(m), 'VIDEO');
  assert.equal(m.page.id, 'options', 'pointing at a thing only chooses it');
  m.point('audio', 2);
  assert.equal(m.page.id, 'options', 'a sheet that is not shown cannot be pointed at');
  m.point('video', 2);
  assert.equal(m.page.id, 'video');
  assert.equal(selected(m), 'FULLSCREEN', 'pointing at a line of the sheet takes the focus there');
  assert.deepEqual(m.click(2), { type: 'set', key: 'fullscreen', value: true });
  m.point('video', 1);
  assert.equal(selected(m), 'SCREEN SHAKE');
  m.point('options', 3);
  assert.equal(m.page.id, 'options');
  assert.equal(selected(m), 'GAME', 'pointing at another thing brings the focus back to the things');
  m.point('game', 1);
  assert.equal(selected(m), 'RESET PROGRESSION');
  m.activate();
  assert.equal(m.page.id, 'confirm');
  m.point('options', 0);
  assert.equal(m.page.id, 'confirm', 'the confirm keeps the focus until it is answered');
  m.point('controls', 0);
  assert.equal(m.page.id, 'confirm');
  m.point('confirm', 1);
  assert.equal(selected(m), 'YES');
  // a page that is no sheet (the pause) is pointed at as before
  const p = new Menu('pause', ctx());
  p.point('pause', 2);
  assert.equal(selected(p), 'RESTART');
});

test('menu: sliders move by a step and clamp, a set is only sent when the value changes', () => {
  const c = ctx(), m = new Menu('main', c);
  choose(m, 'OPTIONS'); choose(m, 'AUDIO');
  assert.deepEqual(labels(m), ['MASTER', 'MUSIC', 'EFFECTS', 'AMBIENCE']);
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
  assert.equal(selected(m), 'MASTER', 'down wraps round the sheet');
});

test('menu: toggles flip with Enter, a click and left / right; a greyed line cannot be chosen', () => {
  const c = ctx(), m = new Menu('main', c);
  choose(m, 'OPTIONS'); choose(m, 'VIDEO');
  assert.deepEqual(labels(m), ['QUALITY', 'SCREEN SHAKE', 'FULLSCREEN', 'AIM MARK'], 'no LENS row: it is the developer\'s F6');
  m.down();
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'shake', value: 0.95 });
  assert.deepEqual(m.click(2), { type: 'set', key: 'fullscreen', value: true });
  assert.deepEqual(apply(c, m.activate()), { type: 'set', key: 'fullscreen', value: true });
  assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'fullscreen', value: false });
  // (selectable: what the selection may rest on)
  assert.ok(!selectable({ label: 'X', disabled: true }) && !selectable({ info: ['A', 'b'] }) && selectable({ label: 'X' }));
});

test('menu: VIDEO has a QUALITY row of four values, walked by left / right / Enter / a click, AUTO showing its level', () => {
  const c = ctx(), m = new Menu('main', c);
  choose(m, 'OPTIONS'); choose(m, 'VIDEO');
  const row = () => m.page.items[0];
  assert.equal(selected(m), 'QUALITY');
  assert.deepEqual(row().options, ['auto', 'low', 'medium', 'high']);
  assert.deepEqual([row().choice, row().value, row().show], ['quality', 'auto', 'AUTO (HIGH)']);
  c.settings.autoQuality = 'medium';
  assert.equal(row().show, 'AUTO (MEDIUM)', 'the level AUTO chose is said beside it');
  assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'quality', value: 'low' });
  assert.equal(row().show, 'LOW');
  assert.deepEqual(apply(c, m.activate()), { type: 'set', key: 'quality', value: 'medium' });
  assert.deepEqual(apply(c, m.click(0)), { type: 'set', key: 'quality', value: 'high' });
  assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'quality', value: 'auto' }, 'round again');
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'quality', value: 'high' }, 'and the other way');
  assert.equal(m.page.id, 'video', 'LEFT changes the row: the focus stays on the sheet');
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

test('menu: 2A (the chase) is on the levels page, shut until level 1 is done', () => {
  const levels = [...ctx().levels, { id: 'level2a', name: 'THE CHASE' }];
  const m = new Menu('main', ctx({ levels, progress: complete(FRESH, 'tutorial') }));
  choose(m, 'LEVELS');
  assert.deepEqual(m.page.items.map((it) => [it.level, it.locked]), [['tutorial', false], ['level1', false], ['level2a', true], [undefined, undefined]]);
  assert.equal(m.click(2), null);
  const n = new Menu('main', ctx({ levels, progress: complete(complete(FRESH, 'tutorial'), 'level1') }));
  choose(n, 'LEVELS');
  assert.deepEqual(n.click(2), { type: 'start', level: 'level2a' });
});

test('menu: without the tutorial, the first level there is stays open', () => {
  const m = new Menu('main', ctx({ levels: [{ id: 'level1', name: 'NEON NIGHTS' }] }));
  choose(m, 'LEVELS');
  assert.equal(m.page.items[0].locked, false);
  assert.deepEqual(m.activate(), { type: 'start', level: 'level1' });
  // and nothing offers to replay a tutorial that is not there
  m.back();
  choose(m, 'OPTIONS'); choose(m, 'GAME');
  assert.deepEqual(labels(m), ['RESET PROGRESSION', 'VIBRATION']);
});

test('menu: the controls page is read-only, grouped, for the device in use; nothing on it can be chosen', () => {
  for (const [device, cols] of [['kbm', KBM_CONTROLS], ['pad', PAD_CONTROLS]]) {
    const m = new Menu('main', ctx({ device }));
    choose(m, 'OPTIONS');
    m.down(); m.down();
    assert.equal(m.sheet, 'controls');
    const pg = m.pageOf('controls'), items = pg.items;
    assert.ok(items.every((it) => it.info && it.group), 'only lines, each in a group');
    assert.equal(items.length, cols.flat().reduce((n, [, list]) => n + list.length, 0));
    assert.deepEqual([...new Set(items.map((it) => it.group))], ['MOVE', 'FIGHT', 'WORLD', 'AT THE WHEEL', 'GAME']);
    assert.equal(pg.title, device === 'pad' ? 'CONTROLS - GAMEPAD' : 'CONTROLS');
    assert.equal(m.enter(), false);
    assert.equal(m.page.id, 'options');
  }
});

test('controls: no debug key, and every cap the page names is one the game reads', () => {
  const caps = (cols) => cols.flatMap((col) => col.flatMap(([, list]) => list.flatMap(([keys]) => keys.split(' ').filter((k) => k !== '/'))));
  const kbm = caps(KBM_CONTROLS), pad = caps(PAD_CONTROLS);
  assert.ok(!kbm.concat(pad).some((k) => /^F\d/.test(k)), 'no F-key');
  // the keyboard's caps, as the codes the game reads (entities/Player.js, systems/Drive.js, CarGun.js, Game.js)
  const read = {
    ZQSD: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], WASD: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], 'Z/W': ['KeyW'], S: ['KeyS'], 'Q/A': ['KeyA'], D: ['KeyD'],
    SHIFT: ['ShiftLeft'], SPACE: ['Space'], E: ['KeyE'], R: ['KeyR'], ESC: ['Escape'], BKSP: ['Backspace'],
    MOUSE: [], LMB: ['Mouse0'], RMB: ['Mouse2'],
  };
  const src = ['game/entities/Player.js', 'game/systems/Drive.js', 'game/systems/CarGun.js', 'game/Game.js']
    .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
  const mouse = (b) => new RegExp(`mouse(Hit|Down)(\\?\\.)?\\(${b}\\)`).test(src);
  const reads = (code) => (code === 'Mouse0' ? mouse(0) : code === 'Mouse2' ? mouse(2) : src.includes(`'${code}'`));
  for (const k of kbm) {
    assert.ok(read[k], `${k}: a key the test knows`);
    for (const code of read[k]) assert.ok(reads(code), `${k} -> ${code} is read`);
  }
  // the pad's caps: a bound button, or one read by its own name (sticks, d-pad, B)
  const own = { LS: true, RS: true, DPAD: true, B: src.includes("'PadB'") };
  for (const k of pad) assert.ok(PAD_BINDINGS[k === 'START' ? 'Start' : k] || own[k], `${k} is a button the game uses`);
  // and a pad's line names the button bound to the keyboard's key for that line
  const said = (cols) => new Map(cols.flatMap((col) => col.flatMap(([g, list]) => list.map(([keys, what]) => [`${g}:${what}`, keys]))));
  const K = said(KBM_CONTROLS), P = said(PAD_CONTROLS);
  const key = { A: 'SPACE', X: 'E', Y: 'R', RB: 'LMB', LB: 'RMB', LT: 'SHIFT', START: 'ESC' };
  let checked = 0;
  for (const [line, keys] of P) {
    const k = K.get(line), bound = keys.split(' ').filter((b) => key[b]);
    if (!k || !bound.length) continue;
    assert.ok(bound.some((b) => k.split(' ').includes(key[b])), `${line}: ${keys} on the pad, ${k} on the keyboard`);
    checked++;
  }
  assert.ok(checked >= 10, `${checked} lines checked against the bindings`);
});

test('menu: RESET PROGRESSION asks first: NO goes back, YES resets and goes back', () => {
  const m = new Menu('main', ctx());
  choose(m, 'OPTIONS'); choose(m, 'GAME');
  assert.deepEqual(labels(m), ['REPLAY THE TUTORIAL', 'RESET PROGRESSION', 'VIBRATION']);
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

test('menu: no AIM style line anywhere (F7 alone cycles it); AIM MARK is a toggle on the VIDEO page, off until turned on; the pause reaches it too', () => {
  for (const root of ['main', 'pause']) {
    const c = ctx(), m = new Menu(root, c);
    choose(m, 'OPTIONS');
    for (const id of ['audio', 'video', 'controls', 'game']) assert.ok(!m.pageOf(id).items.some((it) => it.label === 'AIM' || it.choice === 'aim'), `${id}: no AIM`);
    choose(m, 'VIDEO');
    const i = m.page.items.findIndex((it) => it.label === 'AIM MARK');
    assert.equal(m.page.items[i].toggle, 'aimMark');
    assert.equal(m.page.items[i].value, false);
    m.hover(i);
    assert.deepEqual(apply(c, m.activate()), { type: 'set', key: 'aimMark', value: true });
    assert.equal(m.page.items[i].value, true);
    assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'aimMark', value: false });
  }
});

test('menu: VIBRATION is a slider on the GAME page (the controls page stays read-only): steps down to off and back', () => {
  const c = ctx(), m = new Menu('main', c);
  choose(m, 'OPTIONS'); choose(m, 'GAME');
  const i = m.page.items.findIndex((it) => it.label === 'VIBRATION');
  assert.equal(m.page.items[i].slider, 'rumble');
  m.hover(i);
  assert.deepEqual(m.right(), null, 'already full');
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'rumble', value: 1 - STEP });
  c.settings.rumble = 0.02;
  assert.deepEqual(apply(c, m.left()), { type: 'set', key: 'rumble', value: 0 }, 'off');
  assert.deepEqual(apply(c, m.right()), { type: 'set', key: 'rumble', value: STEP });
});

test('menu: VIBRATION says so when a pad is there that this browser cannot rumble', () => {
  const at = (c) => new Menu('main', c).pageOf('game').items.find((it) => it.label === 'VIBRATION');
  assert.equal(at(ctx()).note, undefined);
  assert.equal(at(ctx({ rumbleOk: true })).note, undefined);
  assert.match(at(ctx({ rumbleOk: false })).note, /CANNOT RUMBLE/);
});
