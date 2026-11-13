import { sprite } from '../../engine/Assets.js';
import { rand, chance } from '../../engine/math.js';
import Debris from '../entities/Debris.js';
import Corpse from '../entities/Corpse.js';
import Ragdoll, { hasRagdoll } from '../entities/Ragdoll.js';

// Turns a living character into a mess. cause: bullet | heavy | blast | explosion | melee | slash | execute
export function gore(world, ch, angle, cause, goreMul = 1) {
  const P = world.particles;
  const { x, y } = ch;
  const k = ch.kind;

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

  // base spray
  const sprayN = cause === 'slash' || cause === 'glass' ? 45 : 28;
  if (cause === 'glass') P.blood(x, y, 0, Math.PI, 30, 160);
  P.blood(x, y, angle, 0.45, sprayN, 340);
  P.blood(x, y, angle + Math.PI, 0.7, 7, 110);
  P.mist(x, y, 10);
  world.decals.stampBlood(x, y, 7, 7);

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
    return;
  }

  const slide = cause === 'blast' ? rand(280, 380) : cause === 'heavy' ? 300 : rand(140, 230);
  if (hasRagdoll(k)) {
    // physical body; close shotgun blasts tear limbs off
    const detach = cause === 'blast' ? [0, 1, 2, 3].filter(() => chance(0.4)) : cause === 'heavy' && chance(0.4) ? [Math.floor(rand(0, 4))] : [];
    world.addCorpse(new Ragdoll(world, k, x, y, angle, slide, { headless: mode === 'headless', detach }));
  } else {
    const corpseImg = sprite(`characters/${k}_${mode === 'headless' ? 'dead1' : 'dead0'}`);
    world.addCorpse(new Corpse(world, corpseImg, x, y, angle, slide, { headless: mode === 'headless' }));
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
    world.sound(cause === 'slash' ? 'slash' : 'splat', x, y);
  }
}

function throwGib(world, img, x, y, angle, radial, bleed, spurt, speedMul = 1) {
  const a = radial ? rand(0, Math.PI * 2) : angle + rand(-0.9, 0.9);
  const v = rand(110, 330) * speedMul;
  world.addDebris(new Debris(world, img, x + rand(-4, 4), y + rand(-4, 4), rand(0, 6.28), Math.cos(a) * v, Math.sin(a) * v,
    rand(-0.6, 0.6), { bleed: bleed * rand(0.7, 1.3), spurt, bounce: 0.3, air: 0.035, material: 'flesh' }));
}

