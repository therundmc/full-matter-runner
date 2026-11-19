// The pause's own page (ui/Menu.js `pause`), DOM-free: its clocks and what its card says; ui/MenuArt.js draws it.
// - Pick: the chosen line's life. The tab that marks it slides in when the choice moves (keys, pad or mouse), a
//   confirm is pressed down like a stamp for a beat before its action, and the whole screen is cut in when it opens.
// - pauseCard: the note pinned beside the items: the level's number and name, whose night it is (the hit list's
//   target, in his ink), the run's time and kills so far.
import { levelTag } from '../systems/Progress.js';

// s: the tab's slide, a confirm's press before its action, the screen coming in; fps: the pictures a second they
// are held on (cut paper moves like stop motion)
export const PICK = { slide: 0.12, press: 0.16, enter: 0.16, fps: 30 };

const held = (k) => Math.max(0, Math.min(1, k));
const stepped = (t, dur) => held((Math.floor(t * PICK.fps) + 1) / Math.round(dur * PICK.fps));

export class Pick {
  constructor() { this.reset(); }

  // the pause opens: nothing has moved yet, the screen comes in
  reset(key = null) {
    this.key = key;          // the line chosen
    this.from = null;        // the one it left
    this.movedT = Infinity;  // s since the choice moved
    this.pressT = -1;        // s since a confirm (-1: none)
    this.age = 0;            // s since the pause opened
  }

  // a confirm: the line is pressed, its action due once the beat is over (update says when)
  press() { if (this.pressT < 0) this.pressT = 0; }
  get busy() { return this.pressT >= 0; }

  // every frame, with the line chosen now; true on the frame a pressed line's action is due
  update(dt, key) {
    this.age += dt;
    if (this.key === null) this.key = key;
    else if (key !== this.key && !this.busy) { this.from = this.key; this.key = key; this.movedT = 0; } else this.movedT += dt;
    if (!this.busy) return false;
    this.pressT += dt;
    if (this.pressT < PICK.press) return false;
    this.pressT = -1;
    return true;
  }

  // how far the tab has slid in under the chosen line, how far a press has gone, how far the screen has come in:
  // 0..1, in steps
  get slide() { return stepped(this.movedT, PICK.slide); }
  get pressed() { return this.busy ? stepped(this.pressT, PICK.press) : 0; }
  get entered() { return stepped(this.age, PICK.enter); }
}

// Whose night a level is: the name on the card's tape and its ink (the comic's: tools/comic/STYLE.md), `sign` the
// mark cut beside it (MenuArt). The tutorial has no target: it is his flat, burning.
export const TARGETS = {
  tutorial: { label: 'PLACE', name: 'HIS FLAT', ink: '#ff8a20', sign: 'fire' },
  level1: { label: 'TARGET', name: 'CUEBALL', ink: '#e6ff1a', sign: 'cueball' },
  level2a: { label: 'TARGET', name: 'JITTERS', ink: '#3ad8e8', sign: 'jitters' },
  level2b: { label: 'TARGET', name: 'JITTERS', ink: '#3ad8e8', sign: 'jitters' },
};

// the number on a level's card: 00 the tutorial, 01, 02A...; '--' a level out of the campaign (the lab)
export function levelNumber(id) {
  if (id === 'tutorial') return '00';
  const tag = levelTag(id);
  return tag ? tag.replace(/^\d+/, (d) => d.padStart(2, '0')) : '--';
}

// { number, name, target: { label, name, ink, sign } | null, time (s), kills, guards (0: not counted, the chase) }
export function pauseCard(id, level, world) {
  return {
    number: levelNumber(id), name: level?.name || String(id || '').toUpperCase(), target: TARGETS[id] || null,
    time: world?.runTime ?? 0, kills: world?.scoring?.kills ?? 0, guards: world?.drive?.on ? 0 : world?.totalEnemies ?? 0,
  };
}
