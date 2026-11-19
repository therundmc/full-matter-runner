// Pierced gas: a bottle or a stove holed by a round blows a jet of flame out of the hole, hisses higher and higher
// as the pressure builds, then goes off (Prop.break -> explosion). A loose bottle may take off on its own jet
// first, corkscrewing across the floor like a rocket.
import { rand, chance, clamp, pick } from '../../engine/math.js';
import { wake } from '../../engine/physics/Body.js';

const JET = 30;       // px: length of the flame
const THRUST = 0.5;   // px/step gained at every step by a bottle that took off
const TOP = 8.5;      // px/step: its top speed
const SPIN = 0.13;    // rad/step: how hard it may corkscrew

// prop: a Prop whose def has `gas: { fuse: [s, s], rocket: odds }`; (sx, sy): the hole, in sprite space;
// dirA: direction of the round; after: s to the blast, when it is not its own fuse's. Sets prop.gasLeak (Prop.break then explodes whatever breaks it).
export function ignite(prop, sx, sy, dirA, after = null) {
  const w = prop.world, P = w.particles, g = prop.def.gas, B = Matter.Body;
  const fuse = after ?? rand(g.fuse[0], g.fuse[1]); // (after: a fuse somebody staged, systems/Tutorial.js)
  const jet = dirA + Math.PI - prop.body.angle; // the flame comes back out of the hole, in the prop's frame
  const rocket = !prop.def.static && chance(g.rocket ?? 0);
  const drift = rand(0.5, 1) * pick([-1, 1]);
  prop.gasLeak = { rocket };
  w.sound('ignite', prop.x, prop.y, 0.7);
  w.noise(prop.x, prop.y, 260);
  let hiss = 0, glow = 0;
  w.emit(prop.x, prop.y, fuse, (e, dt) => {
    if (prop.dead || prop.dying) { e.t = 0; return; }
    const k = clamp(1 - e.t / fuse, 0, 1); // pressure building
    const a = prop.body.angle + jet, o = prop.toWorld(sx, sy), ca = Math.cos(a), sa = Math.sin(a);
    const len = JET * (0.7 + 0.5 * k) * rand(0.85, 1.1);
    for (let i = 0; i < 3; i++) {
      const u = rand(0.1, 1);
      P.fire(o.x + ca * len * u, o.y + sa * len * u, 1, 16, { size: [2 + 3 * u, 3 + 6 * u], life: [0.08, 0.2], heat: 0.25 - 0.3 * u, rise: 10 });
    }
    if (chance(0.25)) P.sparks(o.x, o.y, a, 0.35, 2, 260, '#ffd9a0');
    w.smoke?.burn(o.x + ca * len, o.y + sa * len, 'flame', dt);
    if (w.time >= glow) {
      glow = w.time + 0.08;
      w.light(o.x + ca * len * 0.5, o.y + sa * len * 0.5, 70 + 30 * k, '#ffb060', 0.13);
    }
    if (w.time >= hiss) {
      hiss = w.time + 0.22;
      w.sound('hiss', o.x, o.y, 0.5 + 0.5 * k, { pitch: 0.8 + 0.7 * k });
    }
    if (rocket && k > 0.12) {
      // it rides its jet: thrust opposite the flame, the hole off-centre makes it spin and wander
      const b = prop.body, v = B.getVelocity(b);
      wake(b);
      b.flyUntil = w.time + 0.15;
      const vx = v.x - ca * THRUST, vy = v.y - sa * THRUST, m = Math.min(1, TOP / (Math.hypot(vx, vy) || 1));
      B.setVelocity(b, { x: vx * m, y: vy * m });
      B.setAngularVelocity(b, clamp(B.getAngularVelocity(b) + drift * 0.012, -SPIN, SPIN));
    }
  });
  w.after(fuse, () => prop.break(prop.body.angle + jet + Math.PI, 2));
}
