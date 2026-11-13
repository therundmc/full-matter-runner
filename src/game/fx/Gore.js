import { sprite } from '../../engine/Assets.js';
import { rand, chance } from '../../engine/math.js';
import Debris from '../entities/Debris.js';
import Corpse from '../entities/Corpse.js';
import Ragdoll, { hasRagdoll } from '../entities/Ragdoll.js';
import { WOUNDS, woundFor } from '../data/wounds.js';

// Turns a living character into a mess. cause: bullet | heavy | blast | explosion | melee | slash | glass | execute,
// or snap (a broken neck: a clean body, no blood at all).
// by: what did it (a weapon definition, or { gore, wound }): its `gore` scales the dismemberment odds, its wound
// profile (data/wounds.js) sets how much blood goes where and how the body bleeds out.
// Returns what is left of him: 'corpse' | 'headless' | 'gibs'.
export function gore(world, ch, angle, cause, by) {
  const P = world.particles;
  const { x, y } = ch;
  const k = ch.kind;
  const goreMul = by ? by.gore ?? 0.3 : 1;
  const wd = woundFor(cause, by);

  let mode = 'corpse';
  switch (cause) {
    case 'explosion': mode = 'gibs'; break;
    case 'blast': mode = chance(0.7) ? 'gibs' : 'headless'; break;
    case 'heavy': mode = chance(0.45) ? 'headless' : chance(0.35) ? 'gibs' : 'corpse'; break;
    case 'bullet': mode = chance(0.18 * goreMul) ? 'headless' : 'corpse'; break;
    case 'melee': mode = chance(0.3 * goreMul) ? 'headless' : 'corpse'; break;
    case 'execute': mode = 'headless'; break;
    case 'glass': mode = chance(0.25) ? 'headless' : 'corpse'; break;
    default: mode = 'corpse';
  }

  // the wound itself: blow-back toward the attacker, spray along the blow, a cloud, a stain under the body
  const [bn, bv, bc] = wd.back, [sn, sv, sc] = wd.spray, opt = wd.big ? { big: true } : undefined;
  if (bn) P.blood(x, y, angle + Math.PI, bc, bn, bv);
  if (wd.sweep) {
    // cast off along the stroke: a thin arc of drops instead of a cone
    const side = chance(0.5) ? 1 : -1, steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1) - 0.5;
      P.blood(x, y, angle + side * t * wd.sweep, sc, Math.ceil(sn / steps), sv * (1 - Math.abs(t) * 0.5), opt);
    }
  } else P.blood(x, y, angle, sc, sn, sv, opt);
  if (wd.mist) P.mist(x, y, wd.mist, 10, angle);
  if (wd.splat[0]) world.decals.stampBlood(x, y, wd.splat[0], wd.splat[1], angle);

  if (mode === 'gibs') {
    const radial = cause === 'explosion';
    P.blood(x, y, angle, radial ? Math.PI : 1.1, 110, 300, { big: true });
    P.mist(x, y, 26, 16);
    world.decals.stampBlood(x, y, 14, 14);
    const parts = [
      ['gib_head', 0.6, 0.8], ['gib_arm', 1.4, 0], ['gib_arm', 1.4, 0], ['gib_leg', 1.2, 0], ['gib_leg', 1.2, 0], ['gib_torso', 1.6, 1.2],
    ];
    for (const [part, bleed, spurt] of parts) {
      throwGib(world, sprite(`characters/${k}_${part}`), x, y, angle, radial, bleed, spurt);
    }
    const chunks = 5 + Math.floor(rand(0, 4));
    for (let i = 0; i < chunks; i++) throwGib(world, sprite('characters/gib_chunk' + (i % 3)), x, y, angle, radial, 0.8, 0);
    if (chance(0.6)) throwGib(world, sprite('characters/gib_eye'), x, y, angle, radial, 0.3, 0);
    world.sound('gore', x, y);
    world.shake(0.35);
    world.hitstop(0.05);
    return mode;
  }

  const slide = rand(wd.throw[0], wd.throw[1]);
  const bleeding = { pool: rand(wd.pool[0], wd.pool[1]), poolRate: wd.rate, spurt: wd.spurt, dry: cause === 'snap' };
  if (hasRagdoll(k)) {
    // physical body; close shotgun blasts tear limbs off
    const detach = cause === 'blast' ? [0, 1, 2, 3].filter(() => chance(0.4)) : cause === 'heavy' && chance(0.4) ? [Math.floor(rand(0, 4))] : [];
    world.addCorpse(new Ragdoll(world, k, x, y, angle, slide, { headless: mode === 'headless', detach, ...bleeding }));
  } else {
    const corpseImg = sprite(`characters/${k}_${mode === 'headless' ? 'dead1' : 'dead0'}`);
    world.addCorpse(new Corpse(world, corpseImg, x, y, angle, slide, { headless: mode === 'headless', ...bleeding }));
  }

  if (mode === 'headless') {
    if (cause === 'execute') {
      // head pulped on the floor
      P.blood(x, y, 0, Math.PI, 60, 200, { big: true });
      world.decals.stampBlood(x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, 10, 12);
      for (let i = 0; i < 4; i++) throwGib(world, sprite('characters/gib_chunk' + (i % 3)), x, y, angle, true, 0.5, 0, 0.5);
      throwGib(world, sprite('characters/gib_eye'), x, y, angle, true, 0.2, 0, 0.6);
    } else {
      throwGib(world, sprite(`characters/${k}_gib_head`), x, y, angle, false, 1.2, 0.6, 1.4);
      P.blood(x, y, angle, 0.25, 30, 420, { big: true });
    }
    world.sound('gore', x, y, 0.8);
    world.shake(0.2);
  } else {
    world.sound(cause === 'slash' ? 'slash' : cause === 'snap' ? 'neck' : 'splat', x, y, wd === WOUNDS.punch ? 0.5 : 1);
  }
  return mode;
}

function throwGib(world, img, x, y, angle, radial, bleed, spurt, speedMul = 1) {
  const a = radial ? rand(0, Math.PI * 2) : angle + rand(-0.9, 0.9);
  const v = rand(110, 330) * speedMul;
  world.addDebris(new Debris(world, img, x + rand(-4, 4), y + rand(-4, 4), rand(0, 6.28), Math.cos(a) * v, Math.sin(a) * v,
    rand(-0.6, 0.6), { bleed: bleed * rand(0.7, 1.3), spurt, bounce: 0.3, air: 0.035, material: 'flesh' }));
}

