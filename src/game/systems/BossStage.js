// What the camera makes of a boss's beats (entities/Boss.js 'boss' events; data/bosses.js `shot`: a SHOTS name of
// data/staging.js and the real seconds it holds): pushed in on him when he first sees the player, when he is
// wounded, lingering on him when he goes down. Game asks `shot()` like a staged level's (systems/Direction.js) and
// advances it on the real clock: slow motion never stretches a shot. Pure state, DOM-free.
export default class BossStage {
  constructor(world) {
    this.cut = null; // { name, who, x, y, left }: the shot held, on whom, where he was, real s left
    world.events.on('boss', ({ boss, beat }) => {
      const s = boss.traits.shot[beat];
      if (s) this.cut = { name: s[0], who: boss, x: boss.x, y: boss.y, left: s[1] };
    });
  }

  // dt: real s
  update(dt) {
    const c = this.cut;
    if (!c) return;
    if (c.who.alive) { c.x = c.who.x; c.y = c.who.y; } // dead, the view stays where he fell
    if ((c.left -= dt) <= 0) this.cut = null;
  }

  // { name, at } for systems/Direction.js, or null: the usual view
  shot() {
    const c = this.cut;
    return c ? { name: c.name, at: { x: c.x, y: c.y } } : null;
  }
}
