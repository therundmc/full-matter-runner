import { sprite } from '../../engine/Assets.js';
import { rand, randi, chance, angDiff, pick } from '../../engine/math.js';
import Debris from '../entities/Debris.js';
import Corpse from '../entities/Corpse.js';
import Ragdoll, { hasRagdoll } from '../entities/Ragdoll.js';
import { blowFrom } from './Blows.js';
import { WOUNDS, BODY, THROAT, BEHEAD, THROES, SPASM, TEAR, SKULL, woundFor, blowScale, markOf } from '../data/wounds.js';
import { fling, wallBehind, splashWall } from './Spatter.js';
import { skullBit, BIT_KINDS } from '../render/GoreArt.js';

// px from the centre of a man lying knocked down to his head (data/finishers.js EXEC.head) and to the middle of
// his torso, as his sprite is drawn (CharacterAnim drawDown)
const HEAD_AT = 24, TORSO_AT = 10;
// what a round does: the causes whose spray goes on past the body (fx/Spatter.js)
const GUNSHOT = new Set(['bullet', 'heavy', 'blast']);

// Turns a living character into a mess. cause: bullet | heavy | blast | explosion | melee | slash | glass | execute,
// or snap (a broken neck: a clean body, no blood at all).
// by: what did it (a weapon definition, or { gore, wound }): its `gore` scales the dismemberment odds, its wound
// profile (data/wounds.js) sets how much blood goes where and how the body bleeds out; stuck = sprite of what is left
// planted in the body (stuckItem = { type, mag, wear }: it can be pulled out again), launch = speed of a head
// knocked off (x the usual).
// how: the blow (Character.kill: heavy, spin, finisher, thrown...) scales the blood and the throw. A man held from
// behind (ch.held: a takedown) is let down where he stood; one already down (ch.knocked) is finished where he lies.
// Returns what is left of him: 'corpse' | 'headless' | 'gibs'.
export function gore(world, ch, angle, cause, by, how) {
  const P = world.particles;
  const { x, y } = ch;
  const k = ch.kind;
  const goreMul = by ? by.gore ?? 0.3 : 1;
  const blow = ch.knocked > 0 ? { ...how, finisher: true } : how;
  const throat = cutThroat(ch, angle, cause, by, blow);
  const wd = throat ? WOUNDS.throat : woundFor(cause, by, blow);
  const more = blowScale(wd, by, blow), many = (n) => Math.round(n * more);

  const tear = TEAR[cause];
  let mode = 'corpse';
  switch (cause) {
    case 'explosion': case 'blast': case 'heavy': mode = chance(tear.gibs) ? 'gibs' : chance(tear.headless ?? 0) ? 'headless' : 'corpse'; break;
    case 'bullet': mode = chance(0.18 * goreMul) ? 'headless' : 'corpse'; break;
    case 'melee': mode = chance(0.3 * goreMul) ? 'headless' : 'corpse'; break;
    case 'execute': mode = 'headless'; break;
    case 'glass': mode = chance(0.25) ? 'headless' : 'corpse'; break;
    default: mode = 'corpse';
  }
  // a round to the head from close enough bursts the skull (a 9 mm never takes a head off whole: it bursts it too)
  let burst = false;
  if (mode !== 'gibs' && wd.skull && GUNSHOT.has(cause)) {
    if ((how?.dist ?? 0) <= wd.skull[1] && chance(wd.skull[0])) { mode = 'headless'; burst = true; }
    else burst = mode === 'headless' && cause === 'bullet';
  }

  // the wound itself: blow-back toward the attacker, spray along the blow, a cloud, a stain under the body
  const [bn, bv, bc] = wd.back, [sn, sv, sc] = wd.spray, opt = wd.big ? { big: true } : undefined;
  if (bn) P.blood(x, y, angle + Math.PI, bc, many(bn), bv);
  if (wd.sweep) {
    // cast off along the stroke: a thin arc of drops instead of a cone
    const side = chance(0.5) ? 1 : -1, steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1) - 0.5;
      P.blood(x, y, angle + side * t * wd.sweep, sc, Math.ceil(many(sn) / steps), sv * (1 - Math.abs(t) * 0.5), opt);
    }
  } else if (sn) P.blood(x, y, angle, sc, many(sn), sv, opt);
  if (wd.mist) P.mist(x, y, many(wd.mist), 10, angle);
  if (wd.splat[0]) world.decals.stampBlood(x, y, wd.splat[0] * Math.sqrt(more), many(wd.splat[1]), angle);
  // what goes on out of the far side of him: streaks on the floor behind him, a wall close behind splashed and running
  if (GUNSHOT.has(cause)) fling(world, x, y, angle, wd, more * (mode === 'gibs' ? 1.6 : 1), sc * 0.6 + 0.08);

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

  const slide = rand(wd.throw[0], wd.throw[1]) * throwScale(ch, blow);
  // an opened artery (a wound's `artery`) spurts a while once he is down
  const artery = wd.artery && chance(wd.artery[0]) ? wd.artery[1] * rand(0.8, 1.2) : 0;
  const bleeding = { pool: rand(wd.pool[0], wd.pool[1]) * Math.sqrt(more), poolRate: wd.rate, spurt: wd.spurt || artery, dry: cause === 'snap' };
  if (hasRagdoll(k)) {
    // physical body; close shotgun blasts tear limbs off
    const detach = tornLimbs(tear);
    const whole = mode === 'corpse' && !detach.length;
    // his head taken off as he stood: the body goes down on its knees first (BEHEAD)
    const behead = mode === 'headless' && !burst && cause !== 'execute' && !detach.length && !ch.held && !(ch.knocked > 0) && chance(BEHEAD.odds);
    const dying = cause === 'snap' ? null : behead ? 'behead' : throat && whole ? 'throat' : lastMoves(ch, wd, whole);
    const kneels = dying === 'throat' || dying === 'behead'; // where he stood, pitching forward the way he faced
    // a man finished on the floor stays as he lay: his body where his sprite was, head the same way
    const lay = ch.knocked > 0 ? ch.downAngle : null;
    const bx = lay === null ? x : x + Math.cos(lay) * TORSO_AT, by0 = lay === null ? y : y + Math.sin(lay) * TORSO_AT;
    world.addCorpse(new Ragdoll(world, k, bx, by0, kneels ? ch.angle + rand(-0.3, 0.3) : lay ?? angle, behead || lay !== null ? 0 : slide, {
      headless: mode === 'headless', detach, ...bleeding, stuck: by?.stuck, stuckItem: by?.stuckItem, dying, mark: markOf(wd),
      // he faced his killer: he goes over backwards (a cut throat pitches forward)
      back: !!dying && dying !== 'throes' && dying !== 'throat' && Math.abs(angDiff(ch.angle, angle)) > Math.PI / 2,
      killer: dying === 'crawl' ? killerOf(world, x, y, angle) : null,
    }));
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
    } else if (burst) {
      const down = ch.knocked > 0;
      burstSkull(world, down ? x + Math.cos(ch.downAngle) * HEAD_AT : x, down ? y + Math.sin(ch.downAngle) * HEAD_AT : y, angle);
    } else {
      // a head knocked off flies somewhere along the blow; sent off on purpose (by.launch: the bat's home run) it
      // leaves from where it lay, straight along the swing, trailing blood
      const down = ch.knocked > 0, hx = down ? x + Math.cos(ch.downAngle) * HEAD_AT : x, hy = down ? y + Math.sin(ch.downAngle) * HEAD_AT : y;
      if (by?.launch) throwGib(world, sprite(`characters/${k}_gib_head`), hx, hy, angle, false, 2.2, 1, by.launch, 0.12, true);
      else throwGib(world, sprite(`characters/${k}_gib_head`), hx, hy, angle, false, 1.2, 0.6, 1.4);
      P.blood(hx, hy, angle, 0.25, 30, 420, { big: true });
    }
    world.sound('gore', x, y, 0.8);
    world.shake(0.2);
  } else {
    world.sound(cause === 'slash' ? 'slash' : cause === 'snap' ? 'neck' : 'splat', x, y, wd === WOUNDS.punch ? 0.5 : 1);
  }
  return mode;
}

// a blade across his throat: always when he is held from behind (a takedown), now and then on a slash from the front
// or the side (THROAT.odds); never a thrust, nor a man already down
function cutThroat(ch, angle, cause, by, how) {
  if (cause !== 'slash' || how?.finisher || woundFor(cause, by, how) === WOUNDS.stab) return false;
  return !!ch.held || (blowFrom(ch.angle, angle) !== 'behind' && chance(THROAT.odds));
}

// the throw x what the blow was (BODY.how)
function throwScale(ch, how) {
  const H = BODY.how;
  if (ch.held) return H.held;
  if (how?.finisher) return H.finisher;
  return (how?.heavy ? H.heavy : 1) * (how?.spin ? H.spin : 1);
}

// how he dies on the floor (entities/Ragdoll.js): not quite dead, a guard crawls a little way; else a whole body may
// spasm or curl up round its wound, any body may jerk a moment (throes); or he lies still (null)
function lastMoves(ch, wd, whole) {
  if (whole && ch.isEnemy && chance(wd.crawl || 0)) return 'crawl';
  const r = Math.random(), curl = whole ? wd.curl || 0 : 0;
  if (r < curl) return 'curl';
  if (whole && r < curl + SPASM.odds) return 'spasm';
  return r < THROES.odds ? 'throes' : null;
}

// who a crawling man glances back at: the player when he stands on the side the blow came from (read live), else a
// point back that way
function killerOf(world, x, y, angle) {
  const p = world.player, cx = Math.cos(angle), cy = Math.sin(angle);
  if (p && (p.x - x) * cx + (p.y - y) * cy < 0) return p;
  return { x: x - cx * 60, y: y - cy * 60 };
}

// the limbs a blow tears off (TEAR: each at its odds, at most `most`; a .50 takes one, now and then a second)
function tornLimbs(tear) {
  if (!tear?.limb) return [];
  const all = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  if (tear.second !== undefined) return chance(tear.limb) ? all.slice(0, chance(tear.second) ? 2 : 1) : [];
  return all.filter(() => chance(tear.limb)).slice(0, tear.most);
}

// A skull burst by a round going along `angle` at (x, y) (SKULL): bone, scalp and brain thrown along the shot, a
// red cloud, what was inside spread on the floor behind him, and on the wall if one is that close.
function burstSkull(world, x, y, angle) {
  const P = world.particles, D = world.decals, S = SKULL;
  P.blood(x, y, angle, S.drops[2], S.drops[0], S.drops[1], { big: true });
  P.blood(x, y, angle + Math.PI, 0.9, Math.round(S.drops[0] / 5), 140);
  P.mist(x, y, S.mist, 8, angle);
  const wall = wallBehind(world.map, x, y, angle, S.reach);
  const far = wall ? Math.min(S.matter[2], wall.d) : S.matter[2];
  for (let i = randi(S.bits[0], S.bits[1]); i > 0; i--) {
    const a = angle + rand(-0.55, 0.55), v = rand(...S.speed) * (far / S.matter[2] * 0.7 + 0.3);
    P.shard(skullBit(pick(BIT_KINDS)), x, y, a, v, { z: rand(6, 12), vz: rand(20, 110), bounce: 0.15, drag: 2.2,
      onLand: (p) => { D.bake(p.img, p.x, p.y, p.rot, 1, true); if (chance(0.5)) D.stampBlood(p.x, p.y, rand(1, 1.8)); } });
  }
  for (let i = randi(S.chunks[0], S.chunks[1]); i > 0; i--) throwGib(world, sprite('characters/gib_chunk' + (i % 3)), x, y, angle, false, 0.6, 0, 0.8, 0.4);
  for (let i = S.matter[0]; i > 0; i--) {
    const d = rand(S.matter[1], far), a = angle + rand(-0.3, 0.3) * (1 - d / (S.matter[2] * 1.5));
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (!world.map.solidAt(px, py)) D.matter(px, py, rand(2.5, 4.5) * (1.2 - d / S.matter[2] * 0.5), a);
  }
  if (chance(0.5)) throwGib(world, sprite('characters/gib_eye'), x, y, angle, false, 0.3, 0, 0.7, 0.5);
  if (wall) {
    splashWall(world, wall, angle, S.wall, randi(S.runs[0], S.runs[1]));
    D.matter(wall.x - wall.nx * 3, wall.y - wall.ny * 3, rand(3, 4.5), angle, true);
  }
}

// spread: rad either side of angle; sure: thrown at the top of the speed range (a head sent off with a bat)
function throwGib(world, img, x, y, angle, radial, bleed, spurt, speedMul = 1, spread = 0.9, sure = false) {
  const a = radial ? rand(0, Math.PI * 2) : angle + rand(-spread, spread);
  const v = (sure ? rand(170, 200) : rand(110, 330)) * speedMul;
  world.addDebris(new Debris(world, img, x + rand(-4, 4), y + rand(-4, 4), rand(0, 6.28), Math.cos(a) * v, Math.sin(a) * v,
    rand(-0.6, 0.6), { bleed: bleed * rand(0.7, 1.3), spurt, bounce: 0.3, air: 0.035, material: 'flesh' }));
}

