// The menu as data, and the navigator that walks it (DOM-free: no canvas, no Audio, no Game). Pages are built from a
// context each time they are read, so they always show the current settings and progression:
//   { settings, progress, best: (id) => { total, grade, time } | null, levels: [{ id, name }] (campaign levels that
//     exist, in order), lensOk: false when the picture has no lens to turn on (optional), device: 'kbm' | 'pad' (the
//     controls page lists that one's; optional) }
// The navigator answers with plain actions that Game.js applies:
//   { type: 'start', level } | 'newGame' | 'continue' | { type: 'set', key, value } | 'resume' | 'restart' | 'quit'
//   | 'reset' | 'replayTutorial'
// Items: { label, page } opens a sub-page, { label, act } fires an action, { label, slider: key, value },
// { label, toggle: key, value }, { level, label, n, locked, best } a level to start, { info: [key, what], col } a
// read-only line, { label, back: true } goes back (an `act` may come with it); `disabled` greys an item out.
import { isUnlocked } from '../systems/Progress.js';
import { KBM_CONTROLS, PAD_CONTROLS } from '../data/controls.js';

export const STEP = 0.05; // how far a slider moves on a key press

// what the controls page lists (data/controls.js): the keyboard's, or the gamepad's when one is in use
export const CONTROLS = KBM_CONTROLS;

const BACK = { label: 'BACK', back: true };
// something to continue: a level finished, or more than the first one open
const canContinue = (p) => p.done.length > 0 || p.unlocked.length > 1;

const PAGES = {
  main: (c) => ({
    row: true, // laid out in one line on the title: left / right walk it too
    items: [
      ...(canContinue(c.progress) ? [{ label: 'CONTINUE', act: { type: 'continue' } }] : []),
      { label: 'NEW GAME', act: { type: 'newGame' } },
      { label: 'LEVELS', page: 'levels' },
      { label: 'OPTIONS', page: 'options' },
    ],
  }),
  // the first campaign level there is stays open whatever the save says: NEW GAME plays it anyway
  levels: (c) => ({
    title: 'LEVELS',
    items: [...c.levels.map(({ id, name }, i) => ({
      level: id, label: name, n: i + 1, best: c.best(id) || null,
      locked: i > 0 && !isUnlocked(c.progress, id), act: { type: 'start', level: id },
    })), BACK],
  }),
  options: () => ({
    title: 'OPTIONS',
    items: [{ label: 'AUDIO', page: 'audio' }, { label: 'VIDEO', page: 'video' }, { label: 'CONTROLS', page: 'controls' },
      { label: 'GAME', page: 'game' }, BACK],
  }),
  audio: (c) => ({
    title: 'AUDIO',
    items: [['master', 'MASTER'], ['music', 'MUSIC'], ['sfx', 'EFFECTS']]
      .map(([key, label]) => ({ label, slider: key, value: c.settings[key] })).concat(BACK),
  }),
  video: (c) => ({
    title: 'VIDEO',
    items: [
      { label: 'LENS', toggle: 'lens', value: !!c.settings.lens, disabled: c.lensOk === false },
      { label: 'SCREEN SHAKE', slider: 'shake', value: c.settings.shake },
      { label: 'FULLSCREEN', toggle: 'fullscreen', value: !!c.settings.fullscreen },
      BACK,
    ],
  }),
  controls: (c) => ({
    title: c.device === 'pad' ? 'CONTROLS - GAMEPAD' : 'CONTROLS',
    items: [...(c.device === 'pad' ? PAD_CONTROLS : CONTROLS).flatMap((col, k) => col.map((info) => ({ info, col: k }))), BACK],
  }),
  game: (c) => ({
    title: 'GAME',
    items: [
      ...(c.levels.some((l) => l.id === 'tutorial') ? [{ label: 'REPLAY THE TUTORIAL', act: { type: 'replayTutorial' } }] : []),
      { label: 'RESET PROGRESSION', page: 'confirm' },
      BACK,
    ],
  }),
  confirm: () => ({
    title: 'RESET PROGRESSION',
    note: 'ERASE EVERY LEVEL OPENED AND EVERY BEST SCORE?',
    items: [{ label: 'NO', back: true }, { label: 'YES', act: { type: 'reset' }, back: true }],
  }),
  pause: () => ({
    title: 'PAUSED',
    items: [{ label: 'RESUME', act: { type: 'resume' } }, { label: 'OPTIONS', page: 'options' },
      { label: 'RESTART', act: { type: 'restart' } }, { label: 'QUIT TO MENU', act: { type: 'quit' } }],
  }),
};

// an item the selection can rest on (a locked level can: it is there to be seen, it only does not start)
export const selectable = (it) => !!it && !it.disabled && !it.info;

const round = (v) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;

export default class Menu {
  // root: the page at the bottom of the stack ('main' on the title, 'pause' in a level); context: an object or a
  // function returning one (read anew at every look)
  constructor(root, context) {
    this.context = typeof context === 'function' ? context : () => context;
    this.reset(root);
  }

  reset(root) {
    this.stack = [{ id: root, sel: 0 }];
    this.fix();
  }

  get top() { return this.stack[this.stack.length - 1]; }
  get depth() { return this.stack.length - 1; }
  get sel() { return this.top.sel; }
  get page() { return { id: this.top.id, ...PAGES[this.top.id](this.context()) }; }
  get item() { return this.page.items[this.top.sel] || null; }

  // keeps the selection on something selectable: the first such item when it is not (the page changed under it)
  fix() {
    const items = this.page.items;
    if (!selectable(items[this.top.sel])) this.top.sel = items.findIndex(selectable);
  }

  // dir +1 / -1 over the selectable items, wrapping around
  move(dir) {
    this.fix();
    const items = this.page.items, n = items.length;
    for (let k = 1; k <= n && this.top.sel >= 0; k++) {
      const i = (((this.top.sel + dir * k) % n) + n) % n;
      if (selectable(items[i])) { this.top.sel = i; break; }
    }
    return null;
  }
  up() { return this.move(-1); }
  down() { return this.move(1); }

  // dir +1 / -1 on the selected item: a slider by a step, a toggle flips; on a row page the selection moves
  nudge(dir) {
    if (this.page.row) return this.move(dir);
    this.fix();
    const it = this.item;
    if (!selectable(it)) return null;
    if (it.slider) {
      const value = round(it.value + dir * STEP);
      return value === it.value ? null : { type: 'set', key: it.slider, value };
    }
    if (it.toggle) return { type: 'set', key: it.toggle, value: !it.value };
    return null;
  }
  left() { return this.nudge(-1); }
  right() { return this.nudge(1); }

  open(id) {
    this.stack.push({ id, sel: 0 });
    this.fix();
  }

  activate() {
    this.fix();
    const it = this.item;
    if (!selectable(it) || it.locked) return null;
    if (it.page) { this.open(it.page); return null; }
    if (it.toggle) return { type: 'set', key: it.toggle, value: !it.value };
    const act = it.act ? { ...it.act } : null;
    if (it.back) return this.back() || act;
    return act;
  }

  // pops a page (the one under it finds its selection again); at the root of the pause it resumes
  back() {
    if (this.stack.length > 1) { this.stack.pop(); this.fix(); return null; }
    return this.top.id === 'pause' ? { type: 'resume' } : null;
  }

  hover(i) {
    if (selectable(this.page.items[i])) this.top.sel = i;
  }

  // a click on item i selects and activates it (a slider is dragged by the caller instead)
  click(i) {
    const it = this.page.items[i];
    if (!selectable(it)) return null;
    this.top.sel = i;
    return it.slider ? null : this.activate();
  }

  // what a click beside the menu starts on the title's first page, as the old title did on any click: CONTINUE when
  // there is one, else NEW GAME
  primary() {
    if (this.depth > 0 || this.top.id !== 'main') return null;
    return { ...this.page.items[0].act };
  }
}
