// The pieces a weapon leaves when it gives out (data/weapons.js `breaks`, BREAK in data/feel.js), whoever had it: in
// a hand (Character.breakWeapon) or thrown full at a man (WeaponItem.shatter). They are loose debris, never picked up.
import { BODY_SCALE } from '../Config.js';
import { BREAK } from '../data/feel.js';
import { rand } from '../../engine/math.js';
import Debris from '../entities/Debris.js';

// the far end of a weapon snapped at `at`: sent on along the way `a` the blow went (toward the side opposite the one
// it came from, `side` +-1) at `fly` [from, to] px/s, turning over, up and down onto the floor where it clatters
export function flyPiece(world, pic, at, a, side, material, fly = BREAK.fly) {
  const B = BREAK, fa = a - side * rand(...B.turn), v = rand(...fly);
  world.addDebris(new Debris(world, pic, at.x, at.y, a - side * 0.4, Math.cos(fa) * v, Math.sin(fa) * v,
    -side * rand(0.25, 0.45), { material, kg: 0.5, bounce: 0.3, z: B.z, vz: B.vz, scale: BODY_SCALE, land: material }));
}

// a piece let fall at (x, y), facing about `a`, going at (vx, vy) px/s: from hand height (BREAK.fall), or tossed up
export function dropPiece(world, pic, x, y, a, vx, vy, material, kg, toss = false) {
  const F = BREAK.fall;
  world.addDebris(new Debris(world, pic, x, y, a + rand(-0.5, 0.5), vx, vy, rand(-0.3, 0.3),
    { material, kg, bounce: 0.3, z: F.z, vz: toss ? 60 : 0, scale: BODY_SCALE, land: material }));
}
