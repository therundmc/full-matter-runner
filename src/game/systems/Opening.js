// How the camera stages level 1's opening (level intro 'swig': entities/Player.js updateSwig): close on him while he
// drinks, drawn toward the wall across as the bottle flies and breaks, then the usual view back, fast, as he gets up.
// It only plays where the level opened on the bottle (a retry starts him on his feet: no swig, no shot). Game asks
// `shot()` like a staged level's (systems/Direction.js, SHOTS in data/staging.js). Pure state, DOM-free.
export default class Opening {
  constructor(player) {
    this.player = player;
    this.on = !!player?.swig;
  }

  // { name, at } or null
  shot() {
    if (!this.on) return null;
    const p = this.player, g = p.swig;
    if (g) return g.hit ? { name: 'swigThrow', at: g.hit } : { name: 'swig' };
    if (p.sit > 0) return { name: 'swigUp' };
    this.on = false; // up: the view is his for good
    return null;
  }
}
