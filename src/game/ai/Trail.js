// The prints the player's wet or bloody soles leave on the floor, in the order he made them, and how a guard reads
// them (pure: no world access, unit tested). The Director feeds it from the 'footprint' events and guards follow
// it in Enemy.doTrack. Tuning in AI.trail (Config.js).
import { AI } from '../Config.js';

export default class Trail {
  constructor(rules = AI.trail) {
    this.rules = rules;
    this.prints = []; // { x, y, angle (heading of the walker), kind, t, n (rank in the trail) }, oldest first
    this.n = 0;
    this.done = -1;   // rank of the last print a guard has already read
  }

  add(x, y, angle, kind, time) {
    this.prints.push({ x, y, angle, kind, t: time, n: this.n++ });
    if (this.prints.length > this.rules.max) this.prints.shift();
  }

  // prints dry: too old, they tell nothing any more
  prune(time) {
    while (this.prints.length && time - this.prints[0].t > this.rules.fresh) this.prints.shift();
  }

  // The print a guard picks the trail up at: the freshest one nobody has read yet that he `sees` and that means
  // something to him (`wanted`).
  find(sees, wanted = () => true) {
    for (let i = this.prints.length - 1; i >= 0; i--) {
      const p = this.prints[i];
      if (p.n <= this.done) break;
      if (wanted(p) && sees(p)) return p;
    }
    return null;
  }

  // The print to walk to after `from`: about one `hop` further along the same unbroken run of prints (two prints
  // more than `gap` apart are not the same run), or the last of the run; null when `from` ends it.
  next(from) {
    let last = from, out = null;
    for (const p of this.prints) {
      if (p.n <= from.n) continue;
      if (Math.hypot(p.x - last.x, p.y - last.y) > this.rules.gap) break;
      last = out = p;
      if (Math.hypot(p.x - from.x, p.y - from.y) >= this.rules.hop) break;
    }
    return out;
  }

  // a guard has read the trail up to `print`: nobody picks that part up again
  close(print) { this.done = Math.max(this.done, print.n); }
}
