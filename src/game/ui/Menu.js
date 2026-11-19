// The menu as data, and the navigator that walks it (DOM-free: no canvas, no Audio, no Game). Pages are built from a
// context each time they are read, so they always show the current settings and progression:
//   { settings, progress, best: (id) => { total, grade, time } | null, levels: [{ id, name }] (campaign levels that
//     exist, in order), device: 'kbm' | 'pad' (the
//     controls page lists that one's; optional), rumbleOk: false when a pad is connected that this browser cannot
//     rumble (optional), dead: the pause opened from the death screen (optional) }
// The navigator answers with plain actions that Game.js applies:
//   { type: 'start', level } | 'newGame' | 'continue' | { type: 'set', key, value } | 'resume' | 'restart' | 'quit'
//   | 'reset' | 'replayTutorial'
// Items: { label, page } opens a sub-page, { label, act } fires an action, { label, slider: key, value },
// { label, toggle: key, value }, { label, choice: key, value, options, show } one of a few values (`show`: what is
// written for it), { level, label, n, locked, best } a level to start, { info: [caps, what], col, group }
// a read-only line, { label, back: true } goes back (an `act` may come with it); `disabled` greys an item out, `note`
// is a short line said under it.
// A page with `sheets` (OPTIONS) shows the page of its chosen item beside it at once, its sheet: choosing an item is
// enough to see its settings (ui/title/Options.js). RIGHT / ENTER take the focus onto the sheet's first line (enter),
// LEFT on a line that is not a slider or a toggle, ESC and BACK bring it back to the items; the mouse moves the focus
// to whatever it points at (point).
import { isUnlocked } from '../systems/Progress.js';
import { KBM_CONTROLS, PAD_CONTROLS } from '../data/controls.js';
import { QUALITY_CHOICES } from '../data/quality.js';
import { qualityLabel } from '../systems/Quality.js';

export const STEP = 0.05; // how far a slider moves on a key press

// the controls page's lines (data/controls.js), for the device in use
const lines = (cols) => cols.flatMap((col, k) => col.flatMap(([group, list]) => list.map((info) => ({ info, col: k, group }))));

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
  // the first campaign level there is stays open whatever the save says: NEW GAME plays it anyway; its notes are
  // pinned left to right on the board (ui/title/HitList.js): left / right walk them too
  levels: (c) => ({
    title: 'LEVELS',
    row: true,
    items: [...c.levels.map(({ id, name }, i) => ({
      level: id, label: name, n: i + 1, best: c.best(id) || null,
      locked: i > 0 && !isUnlocked(c.progress, id), act: { type: 'start', level: id },
    })), BACK],
  }),
  // his cap (BACK) is the mouse's way out; the sub-pages have none: ESC / B / the right button, or another thing
  options: () => ({
    title: 'OPTIONS',
    sheets: true,
    items: [{ label: 'AUDIO', page: 'audio' }, { label: 'VIDEO', page: 'video' }, { label: 'CONTROLS', page: 'controls' },
      { label: 'GAME', page: 'game' }, BACK],
  }),
  audio: (c) => ({
    title: 'AUDIO',
    items: [['master', 'MASTER'], ['music', 'MUSIC'], ['sfx', 'EFFECTS'], ['ambience', 'AMBIENCE']]
      .map(([key, label]) => ({ label, slider: key, value: c.settings[key] })),
  }),
  video: (c) => ({
    title: 'VIDEO',
    items: [
      // what the picture draws (data/quality.js); AUTO shows the level it chose beside it
      { label: 'QUALITY', choice: 'quality', value: c.settings.quality, options: QUALITY_CHOICES, show: qualityLabel(c.settings) },
      { label: 'SCREEN SHAKE', slider: 'shake', value: c.settings.shake },
      { label: 'FULLSCREEN', toggle: 'fullscreen', value: !!c.settings.fullscreen },
      { label: 'AIM MARK', toggle: 'aimMark', value: !!c.settings.aimMark }, // LOCK's chevron on the floor (render/AimArt.js)
    ],
  }),
  controls: (c) => ({
    title: c.device === 'pad' ? 'CONTROLS - GAMEPAD' : 'CONTROLS',
    items: lines(c.device === 'pad' ? PAD_CONTROLS : KBM_CONTROLS),
  }),
  game: (c) => ({
    title: 'GAME',
    items: [
      ...(c.levels.some((l) => l.id === 'tutorial') ? [{ label: 'REPLAY THE TUTORIAL', act: { type: 'replayTutorial' } }] : []),
      { label: 'RESET PROGRESSION', page: 'confirm' },
      { label: 'VIBRATION', slider: 'rumble', value: c.settings.rumble ?? 1, // the gamepad's rumble (systems/Rumble.js)
        ...(c.rumbleOk === false ? { note: 'THIS BROWSER CANNOT RUMBLE THIS PAD' } : {}) },
    ],
  }),
  confirm: () => ({
    title: 'RESET PROGRESSION',
    note: 'ERASE EVERY LEVEL OPENED AND EVERY BEST SCORE?',
    items: [{ label: 'NO', back: true }, { label: 'YES', act: { type: 'reset' }, back: true }],
  }),
  // opened from the death screen there is nothing to resume: RETRY first (going back returns to the death screen)
  pause: (c) => ({
    title: 'PAUSED',
    items: c.dead ? [{ label: 'RETRY', act: { type: 'restart' } }, { label: 'OPTIONS', page: 'options' }, { label: 'QUIT TO MENU', act: { type: 'quit' } }]
      : [{ label: 'RESUME', act: { type: 'resume' } }, { label: 'OPTIONS', page: 'options' },
        { label: 'RESTART', act: { type: 'restart' } }, { label: 'QUIT TO MENU', act: { type: 'quit' } }],
  }),
};

// an item the selection can rest on (a locked level can: it is there to be seen, it only does not start)
export const selectable = (it) => !!it && !it.disabled && !it.info;

// a line that left / right change (anything else: LEFT goes back to the items beside its sheet)
const adjustable = (it) => selectable(it) && (!!it.slider || !!it.toggle || !!it.choice);

// the value dir steps on from a choice's (wrapping round)
function stepChoice(it, dir) {
  const n = it.options.length, i = Math.max(0, it.options.indexOf(it.value));
  return { type: 'set', key: it.choice, value: it.options[(i + dir + n) % n] };
}

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
  get page() { return this.pageOf(this.top.id); }
  get item() { return this.page.items[this.top.sel] || null; }
  // any page, read now
  pageOf(id) { return { id, ...PAGES[id](this.context()) }; }

  // the page under the top one when the top one is its sheet (the focus is on the sheet), else null
  get holder() {
    const e = this.stack[this.stack.length - 2];
    return e && PAGES[e.id](this.context()).sheets ? e : null;
  }
  // on a page with sheets: the id of the page its chosen item shows beside it (null: the chosen one has none)
  get sheet() {
    return this.page.sheets ? this.item?.page ?? null : null;
  }

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

  // dir +1 / -1 on the selected item: a slider by a step, a toggle flips, a choice goes to its next value; on a row page the selection moves. On a
  // page with sheets RIGHT takes the focus onto the sheet; on a sheet, LEFT on a line it does not change brings the
  // focus back to the items.
  nudge(dir) {
    if (this.page.row) return this.move(dir);
    if (this.page.sheets) { if (dir > 0) this.enter(); return null; }
    this.fix();
    const it = this.item;
    if (!adjustable(it)) { if (dir < 0 && this.holder) this.back(); return null; }
    if (it.slider) {
      const value = round(it.value + dir * STEP);
      return value === it.value ? null : { type: 'set', key: it.slider, value };
    }
    if (it.choice) return stepChoice(it, dir);
    return { type: 'set', key: it.toggle, value: !it.value };
  }
  left() { return this.nudge(-1); }
  right() { return this.nudge(1); }

  open(id) {
    this.stack.push({ id, sel: 0 });
    this.fix();
  }

  // on a page with sheets: the focus onto the chosen item's sheet, on its line i (default: its first line that can
  // be chosen). False when it has no line to rest on (CONTROLS: it is only read), and the focus stays.
  enter(i) {
    const id = this.sheet;
    if (!id) return false;
    const items = this.pageOf(id).items, at = i ?? items.findIndex(selectable);
    if (!selectable(items[at])) return false;
    this.stack.push({ id, sel: at });
    return true;
  }

  activate() {
    this.fix();
    const it = this.item;
    if (!selectable(it) || it.locked) return null;
    if (it.page) { if (this.page.sheets) this.enter(); else this.open(it.page); return null; }
    if (it.toggle) return { type: 'set', key: it.toggle, value: !it.value };
    if (it.choice) return stepChoice(it, 1);
    const act = it.act ? { ...it.act } : null;
    if (it.back) return this.back() || act;
    return act;
  }

  // pops a page (the one under it finds its selection again); at the root of the pause it resumes (Game: back to what
  // it was opened from)
  back() {
    if (this.stack.length > 1) { this.stack.pop(); this.fix(); return null; }
    return this.top.id === 'pause' ? { type: 'resume' } : null;
  }

  hover(i) {
    if (selectable(this.page.items[i])) this.top.sel = i;
  }

  // The mouse on item i of page `id` (ui/title/Options.js says which page each rect is on): the selection goes to
  // it, and the focus with it between a page with sheets and the sheet beside it (pointing at a thing brings the
  // focus back to the things; pointing at a line of the sheet shown takes it onto that line). A page further in (the
  // reset's confirm) keeps the focus until it is answered.
  point(id, i) {
    if (id === this.top.id) { this.hover(i); return; }
    const h = this.holder;
    if (h && h.id === id) {
      if (!selectable(this.pageOf(id).items[i])) return;
      this.back();
      this.hover(i);
    } else if (this.sheet === id) this.enter(i);
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
