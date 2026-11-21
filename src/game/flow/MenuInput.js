// The menu's input (the title and the pause; ui/Menu.js holds its pages, ui/MenuArt.js and ui/title/Title.js draw
// them): keyboard: arrows / ZQSD move, Enter / Space activate, Escape / Backspace go back; gamepad: d-pad / left stick
// move, A activates, B / START go back (data/controls.js); mouse: pointing selects (and moves the focus between
// OPTIONS' things and the sheet beside them: Menu.point), a click activates, a slider is dragged (saved on release),
// right click goes back. On the title's first page a click beside the items starts the game, as the title always did
// (CONTINUE or NEW GAME). On OPTIONS, the things and their sheet: Menu.js `sheets`.
// It owns where the items were drawn last frame (rects) and the mouse's own state (a slider held, its last place, the
// thing it rests on); what an action does goes through the Game's verbs.
import { clamp } from '../../engine/math.js';
import Audio from '../../audio/Audio.js';
import { loadBest } from '../systems/Records.js';
import { resetProgress } from '../systems/Progress.js';
import { selectable } from '../ui/Menu.js';
import { GAME } from '../data/game.js';
import { campaign } from './LevelFlow.js';

export default class MenuInput {
  constructor(game) {
    this.game = game;
    this.rects = [];                // where the menu's items were drawn last frame (MenuArt), for the mouse
    this.titleRects = [];           // where the title drew the menu's items (ui/title/Title.js)
    this.grab = null;               // index of the slider held by the mouse
    this.lastMouse = { x: 0, y: 0 };
    this.dwell = null;              // the thing of OPTIONS the mouse is on (pointed)
  }

  // a new state: no slider held, no rect of the last one's picture
  reset() {
    this.grab = null;
    this.rects = [];
  }

  // what the menu's pages are built from (ui/Menu.js)
  context() {
    const g = this.game;
    return { settings: g.settings, progress: g.progress, best: (id) => loadBest(id), levels: campaign(), device: g.input.device,
      rumbleOk: !g.input.padConnected || g.input.canRumble, dead: g.pausedFrom?.state === 'dead' };
  }

  update(inp) {
    const g = this.game, nav = g.menu, before = `${nav.top.id}:${nav.sel}`, acts = [];
    const { x, y } = inp.mouse, dx = x - this.lastMouse.x, moved = dx !== 0 || y !== this.lastMouse.y;
    this.lastMouse = { x, y };
    const rects = this.rects, at = rects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    const on = (r) => r.page;   // the page a rect's item is on (drawn: one drawn for a page no longer on top is not the new one's)
    const key = (...codes) => codes.some((c) => inp.hit(c));
    // a gamepad's RB / RT play the left button: they do not click in a menu (A does)
    const click = inp.device !== 'pad' && inp.mouseHit(0);
    // on the pause's own page a confirm is a beat first (ui/Pause.js Pick): the line pressed, its action after
    const confirm = () => {
      if (g.state !== 'pause' || nav.depth > 0 || !selectable(nav.item)) return nav.activate();
      g.pick.press();
      Audio.play('ui', { pitch: 0.7 });
      return null;
    };
    if (this.grab === null && click && at?.track) {
      nav.point(on(at), at.i);
      if (nav.top.id === on(at) && nav.page.items[at.i]?.slider) this.grab = at.i;
    }
    if (this.grab !== null) {
      const r = rects.find((q) => q.i === this.grab && on(q) === nav.top.id), it = nav.page.items[this.grab];
      if (!r?.track || !it?.slider) this.grab = null;
      else if (inp.mouseDown(0)) g.prefs.set(it.slider, Math.round(clamp((x - r.track.x) / r.track.w, 0, 1) * 100) / 100, false);
      else { g.prefs.save(); this.audible(it.slider); if (it.slider === 'rumble') g.rumble.sample(); this.grab = null; }
    } else {
      if (this.pointed(at, moved, dx)) nav.point(on(at), at.i);
      if (click) {
        if (at) nav.point(on(at), at.i);
        acts.push(at ? (nav.top.id === on(at) ? (g.state === 'pause' && nav.depth === 0 ? (nav.hover(at.i), confirm()) : nav.click(at.i)) : null) : g.state === 'title' ? nav.primary() : null);
      } else if (inp.device !== 'pad' && inp.mouseHit(2)) acts.push(nav.back());
      if (key('ArrowUp', 'KeyW', 'NavUp')) acts.push(nav.up());
      if (key('ArrowDown', 'KeyS', 'NavDown')) acts.push(nav.down());
      if (key('ArrowLeft', 'KeyA', 'NavLeft')) acts.push(nav.left());
      if (key('ArrowRight', 'KeyD', 'NavRight')) acts.push(nav.right());
      if (key('Enter', 'Space', 'NumpadEnter')) { acts.push(confirm()); if (inp.hit('PadA')) g.rumble.tick(); }
      if (key('Escape', 'Backspace', 'PadB')) acts.push(nav.back());
    }
    const done = acts.filter(Boolean), turned = `${nav.top.id}:${nav.sel}` !== before;
    for (const a of done) { if (this.apply(a)) break; }
    if (done.some((a) => a.type === 'set' && a.key === 'rumble')) g.rumble.sample(); // felt at its new strength
    // a tick for every move and action, after it: a volume set is heard at its new level (the music speaks for itself)
    if (turned || done.some((a) => a.type !== 'set' || a.key !== 'music')) Audio.play('ui');
  }

  // Is the mouse on `at` to be taken as pointing at it this frame: when it moved onto it, but one of OPTIONS' things
  // crossed on the way right, to the sheet, takes the sheet over only once the mouse has stayed on it GAME.dwell s
  // (the sheet of the one he left stays to be reached).
  pointed(at, moved, dx) {
    if (!at) { this.dwell = null; return false; }
    const id = `${at.page}:${at.i}`, now = this.game.time;
    if (!at.thing) { this.dwell = null; return moved; }
    // (a thing that came under a mouse at rest is not pointed at until the mouse moves)
    if (this.dwell?.id !== id) { this.dwell = { id, t: now, wait: dx > 0, done: !moved }; if (!moved) return false; }
    const d = this.dwell;
    if (d.done) return moved;
    if (d.wait && now - d.t < GAME.dwell) return false;
    d.done = true;
    return true;
  }

  // a menu action (ui/Menu.js); true when it left the menu
  apply(a) {
    const g = this.game;
    switch (a.type) {
      case 'set': g.prefs.set(a.key, a.value); return false;
      case 'reset': g.progress = resetProgress(); g.best = null; g.crossed = 0; return false;
      case 'newGame': g.flow.startNewGame(); return true;
      case 'continue': g.flow.continueGame(); return true;
      case 'start': g.startLevel(a.level); return true;
      case 'replayTutorial': g.startLevel('tutorial'); return true;
      case 'resume': g.resume(); return true;
      case 'restart': g.restart(); return true;
      case 'retry': g.retry(); return true;
      case 'quit': g.toTitle(); return true;
      default: return false;
    }
  }

  // The rects of the menu's items as drawn (ui/MenuArt.js, ui/title/Title.js), each told the page it was drawn for
  // (OPTIONS' sheets say theirs, the rest are the top page's): the next frame's update never takes a rect of a page
  // that has left the top for an item of the new one
  drawn(rects) {
    const top = this.game.menu.top.id;
    return (rects || []).map((r) => (r.page ? r : { ...r, page: top }));
  }

  // a volume changed: heard at its new level (the music speaks for itself)
  audible(key) { if (key === 'master' || key === 'sfx') Audio.play('ui'); }
}
