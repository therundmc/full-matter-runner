// What only the player's traversal throws (TRAVERSE_FX in data/feel.js): the guards vault the same way without the
// flourish. Dust off the floor he slides on (by floor: dust, wood specks, a wet floor's drops), streaks of light along
// the first of the slide, a faint skid mark; a puff and chips where the vault's hand plants, a thin rim of light on
// him through the swing; a ring of dust where he lands, specks, a small camera dip; the roll's dust as he unfolds.
// Particles go through fx/Particles.js (pixel motes, drops, chips), streaks and the rim through fx/CombatFx.js.
// DOM-free.
import { BODY_SCALE } from '../Config.js';
import { TRAVERSE, TRAVERSE_FX } from '../data/feel.js';
import { rand, clamp } from '../../engine/math.js';
import { combatFx } from './CombatFx.js';

const F = TRAVERSE_FX;

// does ch get the flourish? (the player only)
export const fxFor = (ch) => !!ch?.isPlayer;

// what flies off the floor at (x, y): { wet, color, alpha, speck } (a wet floor: its liquid's drops)
export function groundAt(world, x, y) {
  const wet = world.liquids?.at?.(x, y), G = F.ground;
  if (wet && wet.depth >= 0.5) {
    const k = world.liquids.cfg?.kinds?.[wet.kind];
    if (k?.splash) return { wet: true, color: k.splash };
  }
  return { wet: false, ...G[G.floors[world.floorAt?.(x, y)] || 'dust'] };
}

// a spray of floor off (x, y), thrown along a (spread rad), n bits
function spray(world, x, y, a, spread, n, speed) {
  const g = groundAt(world, x, y), P = world.particles;
  if (g.wet) P.drops(x, y, a, spread, n, g.color, speed * 1.4, 3, false);
  else P.motes(x, y, a, spread, n, g.color, speed, g.alpha * 3);
}

// the skid mark and the dust of one frame of a slide (Player.updateSlide): sl the Slide, an its pose state
// (Player.slideAnim: dir, side), dt s
export function slideFx(ch, sl, an, dt) {
  if (!fxFor(ch) || !an) return;
  const w = ch.world, S = F.slide, c = sl.dx, s = sl.dy, side = an.side, B = BODY_SCALE, k = sl.k;
  // the trailing hand (beside the hip, behind) and the lead foot (out ahead), as slidePose has them
  const hx = ch.x + B * (-c * 5 - s * side * 9), hy = ch.y + B * (-s * 5 + c * side * 9);
  const fx = ch.x + B * (c * 12 + s * side * 1.5), fy = ch.y + B * (s * 12 - c * side * 1.5);
  if (k < S.till) {
    const n = S.dust * dt * (1 - k / S.till);
    if (Math.random() < n) spray(w, hx, hy, sl.angle + Math.PI + side * 0.6, 0.7, 2, 40);
    if (Math.random() < n) spray(w, fx, fy, sl.angle + side * 1.2, 0.8, 2, 55);
  }
  // thin lines of light left behind him along the way, over the first of the slide
  if (k < S.streak && Math.random() < S.streaks * dt) {
    const o = rand(-S.spread, S.spread), l = rand(...S.len), x0 = ch.x - c * 6 - s * o, y0 = ch.y - s * 6 + c * o;
    combatFx(w).streak(x0, y0, x0 - c * l, y0 - s * l, S.life, S.alpha * (1 - k / S.streak));
  }
  // a faint mark under the foot, every few px (none on a wet floor: the liquid smears there, systems/Liquids.js)
  sl.skid = (sl.skid ?? 0) + sl.speed * dt * 60;
  if (sl.skid >= S.skid.every) {
    sl.skid = 0;
    if (!groundAt(w, fx, fy).wet) w.decals.smear(fx, fy, sl.angle, S.skid.every, S.skid.color, S.skid.alpha);
  }
}

// the speed vault's hand comes down on the top (v: Character.vaulting): a puff, a few chips of what it is
export function plantFx(ch, v) {
  if (!fxFor(ch)) return;
  const w = ch.world, P = F.plant, x = v.plant.x, y = v.plant.y, chips = v.over?.def?.chips;
  w.particles.motes(x, y, v.dir + Math.PI, Math.PI, P.puff, F.ground.dust.color, 22, 0.5, P.r);
  if (chips) w.particles.chips(x, y, v.dir, 1.2, P.chips, chips, P.speed);
}

// how much rim light he shows at this moment of a vault (0 .. TRAVERSE_FX.rim.alpha): through the speed vault's
// swing
export function rimOf(ch) {
  const v = ch.vaulting;
  if (!fxFor(ch) || !v || v.style !== 'speed' || v.rolling) return 0;
  const T = TRAVERSE.vault, k = v.t / v.dur, a = T.swing[0], b = T.swing[1];
  return k <= a || k >= b ? 0 : F.rim.alpha * Math.sin((Math.PI * (k - a)) / (b - a));
}

// his feet down after a vault or a drop, going on along dir (k: how hard, 0 .. 1): a ring of dust, specks, the
// camera dips along the way
export function landFx(ch, dir, k = 1) {
  if (!fxFor(ch)) return;
  const w = ch.world, L = F.land, g = groundAt(w, ch.x, ch.y);
  if (g.wet) w.particles.drops(ch.x, ch.y, dir, Math.PI, Math.round(L.ring * k), g.color, L.speed * 1.6, 3, false);
  else {
    w.particles.ring(ch.x, ch.y, Math.round(L.ring * k), L.r, L.speed, g.color, g.alpha * 3);
    w.particles.chips(ch.x, ch.y, dir, Math.PI, Math.round(L.specks * k), g.speck, 60);
  }
  w.shake(L.shake * clamp(k, 0.3, 1));
  w.camera.push(Math.cos(dir) * L.dip * k, Math.sin(dir) * L.dip * k);
}

// the roll unfolds back onto his feet: dust thrown back off the floor, a small ring
export function rollFx(ch, dir) {
  if (!fxFor(ch)) return;
  const w = ch.world, R = F.roll, g = groundAt(w, ch.x, ch.y);
  if (g.wet) { w.particles.drops(ch.x, ch.y, dir + Math.PI, 0.9, R.ring, g.color, R.speed * 1.6, 3, false); return; }
  w.particles.ring(ch.x + Math.cos(dir) * 4, ch.y + Math.sin(dir) * 4, R.ring, R.r, R.speed, g.color, g.alpha * 3);
  w.particles.motes(ch.x, ch.y, dir + Math.PI, 0.7, R.puff, g.color, 50, g.alpha * 3);
}
