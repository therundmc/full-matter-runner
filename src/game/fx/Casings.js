// A spent case thrown out of a gun's ejection port (weapons.js `eject`, data/feel.js CASING): where it leaves, how
// fast, how high, how it spins. Pure numbers, DOM-free (tests/casings.test.mjs); Character.fire turns them into a
// Debris that arcs, tumbles, bounces and skitters, and is heard at each touchdown.
import { CASING } from '../data/feel.js';
import { AMMO } from '../data/weapons.js';

const lerp = (a, b, t) => a + (b - a) * t;

// d: the gun's definition, port: { x, y } its ejection port in the world, a: the way the gun points, carry: { x, y }
// the shooter's own velocity (px/s, the case keeps it), rnd: () => 0..1 (Math.random in the game)
// -> { x, y, vx, vy (px/s), z, vz (fake height px, px/s), angle, spin (rad a step), tumble (rad/s), spec }
export function ejection(d, port, a, carry, rnd = Math.random) {
  const C = CASING[d.casing] || CASING.casing;
  const out = a + Math.PI / 2 + lerp(C.back[0], C.back[1], rnd()); // to the gun's right, a little behind square
  const v = lerp(C.speed[0], C.speed[1], rnd());
  const turn = rnd() < 0.5 ? -1 : 1;
  return {
    x: port.x, y: port.y,
    vx: Math.cos(out) * v + (carry?.x ?? 0), vy: Math.sin(out) * v + (carry?.y ?? 0),
    z: C.from, vz: lerp(C.up[0], C.up[1], rnd()),
    angle: a + Math.PI / 2, // it comes out across the gun
    spin: turn * lerp(C.spin[0], C.spin[1], rnd()), tumble: C.tumble * turn,
    spec: C,
  };
}

// a guard's gun throws its cases only now and then (CASING `guard`): a firefight's floor stays readable
export const casingShown = (d, byPlayer, rnd = Math.random) => !!d.casing && (byPlayer || rnd() < (CASING[d.casing] || CASING.casing).guard);

// what the case is heard as on the floor (Audio CASINGS kind)
export const spentSound = (d) => AMMO[d.ammo]?.spent || '9mm';

// a touchdown at fall speed vz (px/s, < 0): how loud it is heard (0..1) and the case's next upward speed (0: it stays
// down, sliding)
export function touchdown(spec, vz) {
  const fall = -vz;
  return { vol: Math.min(1, fall / spec.loud), up: fall >= spec.hop[1] ? fall * spec.hop[0] : 0 };
}
