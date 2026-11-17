// What E does where (besides picking up and opening a trunk): the spots the level's devices offer (the fire alarm,
// the gas tap, the phone booth, the jukebox, the trapdoors...). A device adds its spot here: { x, y, r?, label, kind,
// prop?, ok?(ch), use(ch), quiet? }; `prop`: the spot is that prop's (it moves with it, it is gone with it); `quiet`:
// no diamond over it until it is the one E would use (the doors: systems/Doors.js). The player asks for the one he
// stands at (near), the HUD shows its label, E calls use. DOM-free.
import { USE } from '../data/devices.js';

export default class Uses {
  constructor(cfg = USE) {
    this.cfg = cfg;
    this.spots = [];
  }

  add(spot) {
    this.spots.push(spot);
    return spot;
  }

  // where the spot is now
  at(s) {
    return s.prop ? { x: s.prop.x + (s.dx || 0), y: s.prop.y + (s.dy || 0) } : s;
  }

  // the spot ch can use from where he stands: the nearest one in reach that can be used now (null: none); a quiet
  // one (a door) only when no device is in reach (the jukebox by the front door is not lost to the door)
  near(ch) {
    let best = null, bd = Infinity;
    for (const s of this.spots) {
      if (s.prop && (s.prop.dead || s.prop.dying)) continue;
      const p = this.at(s), d = Math.hypot(p.x - ch.x, p.y - ch.y) + (s.quiet ? 1e4 : 0);
      if (d > (s.r ?? this.cfg.reach) + (s.quiet ? 1e4 : 0) || d >= bd || (s.ok && !s.ok(ch))) continue;
      best = s; bd = d;
    }
    return best;
  }

  // the label it shows (a spot may say different things: OPEN / CLOSE)
  label(s) { return typeof s.label === 'function' ? s.label() : s.label; }
}
