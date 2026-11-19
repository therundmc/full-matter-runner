// The beat of a throw of the player's (THROW in data/feel.js), fed by the world's events: a thing he threw with a man
// on its line is followed by the camera over its last stretch ('throw', shot `throwFollow`); when it floors or kills
// him ('thrownHit'), a hit-stop, a breath of slow motion, the camera's zoom punched and kicked toward it, and a short
// push-in on where it struck (shot `throwHit`). Game asks `shot()` like a staged level's (systems/Direction.js) and
// advances it on the real clock. DOM-free.
import { THROW } from '../data/feel.js';
import { slowAtLeast } from '../fx/Impact.js';

export default class ThrowBeat {
  constructor(world) {
    this.world = world;
    this.cut = null;  // { name, x, y, left }: the shot held on where it struck, real s left
    this.fly = null;  // { item, target }: a throw of his in the air, the man on its line
    world.events.on('throw', ({ thrower, item, target }) => { if (thrower?.isPlayer) this.fly = target ? { item, target } : null; });
    world.events.on('thrownHit', (e) => this.hit(e));
  }

  // it put a man down: a kill (harder when the thing gave out on him: a smash) or a knock-down, each its own beat
  hit({ thrower, x, y, angle, kill, smashed }) {
    if (!thrower?.isPlayer) return;
    const w = this.world, H = THROW.hit[kill ? (smashed ? 'smash' : 'kill') : 'knock'];
    w.hitstop(H.stop);
    slowAtLeast(w, ...H.slowmo);
    w.camera.punch(H.punch);
    w.camera.push(Math.cos(angle) * H.push, Math.sin(angle) * H.push);
    this.fly = null;
    this.cut = { name: H.shot, x, y, left: H.hold };
  }

  // dt: real s
  update(dt) {
    if (this.cut && (this.cut.left -= dt) <= 0) this.cut = null;
    const f = this.fly;
    if (f && (f.item.dead || !f.item.thrower || !f.target.alive)) this.fly = null;
  }

  // the camera's shot, or null: on where it struck, else on the thing in flight once it is near its man
  shot() {
    const c = this.cut, f = this.fly;
    if (c) return { name: c.name, at: { x: c.x, y: c.y } };
    if (f && Math.hypot(f.item.x - f.target.x, f.item.y - f.target.y) < THROW.follow) return { name: 'throwFollow', at: { x: f.item.x, y: f.item.y } };
    return null;
  }
}
