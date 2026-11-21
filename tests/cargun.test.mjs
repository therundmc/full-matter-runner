// His gun at the wheel (systems/CarGun.js): its rounds, its flash, the start of their streaks and its cases leave the
// muzzle of the gun AS DRAWN (the seat pose's own gun, at people's scale; the car on the picture's px, on one of its
// angles and on its springs), whatever the aim round his arc and the hand that has the gun; a pursuer's gunman's shot
// leaves the pistol drawn in his hand (systems/Pursuit.js pistolOf, render/PursuitArt.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './setup.mjs';
import { quiet } from './helpers.mjs';

// no DOM under Node: a sprite not loaded is an 8 px placeholder, painted nowhere
const nul = new Proxy({}, { get: (t, k) => t[k] ?? (() => nul), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 8, height: 8, getContext: () => nul }) };

const { default: CarGun } = await load('game/systems/CarGun.js');
const { default: Pursuit } = await load('game/systems/Pursuit.js');
const { drawChaseFigures } = await load('game/render/PursuitArt.js');
const { default: Vehicle, VEHICLES } = await load('game/entities/Vehicle.js');
const { default: Player } = await load('game/entities/Player.js');
const { newPose, muzzleIn, boreIn, MUZZLE_IN } = await load('game/entities/CharacterAnim.js');
const { combatFx } = await load('game/fx/CombatFx.js');
const { default: Interp } = await load('engine/Interp.js');
const { sprite, sw } = await load('engine/Assets.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { CHASE } = await load('game/data/chase.js');
const { TILE, PLAYER, BODY_SCALE, CAT } = await load('game/Config.js');
const { seatOf } = await load('game/systems/drive/rules.js');
const { angDiff } = await load('engine/math.js');

const { Bodies } = Matter;
const DT = 1 / 60;

// size in world px of a sprite painted at twice the world's density (IHDR)
function pngSize(name) {
  const b = readFileSync(new URL(`../assets/sprites/${name}.png`, import.meta.url));
  return { w: b.readUInt32BE(16) / 2, h: b.readUInt32BE(20) / 2 };
}

// a vehicle as Vehicle makes it, without its canvas
function car(world, x, y, a, model) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model], size = pngSize(m.sprite);
  const body = Bodies.rectangle(x, y, size.w - 4, size.h - 4, { angle: a, collisionFilter: { category: CAT.PROP, mask: 0 } });
  Object.assign(v, { world, type: model, m, isVehicle: true, w: size.w, h: size.h, k: 0.5, body, def: {}, hat: false, gun: false, rider: null, lit: false,
    lamps: [true, true, true, true], moving: true, steer: 0, bob: 0, squat: 0, exploded: false, tires: [true, true, true, true], sag: [0, 0] });
  body.entity = v;
  return v;
}

// him, as the game makes him enough to be drawn (his pose: CharacterAnim)
function man(world, weapon) {
  const ch = Object.create(Player.prototype);
  const body = Bodies.circle(0, 0, PLAYER.radius, { collisionFilter: { category: CAT.CHAR, mask: 0xffff } });
  Object.assign(ch, { world, body, isPlayer: true, alive: true, knocked: 0, angle: 0, radius: PLAYER.radius, vaulting: null, riding: null, team: 'player',
    vel: { x: 0, y: 0 }, gait: 0, runK: 0, walk: 0, strideV: 0, strideA: 0, footA: 0, backward: false, lean: { x: 0, y: 0 }, swing: 0, tell: 0,
    recoil: 0, lower: 0, stow: 0, reloading: 0, reloadDur: 1, pickAnim: 0, grab: null, held: null, breath: 0, hidden: false,
    weapon: weapon && { type: weapon, mag: 30 }, pose: newPose(), pose2: newPose() });
  return ch;
}

// THE BOSS's convertible at angle a0 (a closed one: model), him sat at its wheel, his car gun; the picture held on
// whole px at 1080 (the camera's `pixel`, zoom 3)
function rig(a0 = 0.3, weapon = 'uzi', model = 'convertible') {
  const w = {
    time: 0, camera: { pixel: true, z: 3 }, projectiles: [], debris: [], chars: [], particles: quiet, game: { time: 0, interp: new Interp() },
    addProjectile(p) { w.projectiles.push(p); }, addDebris(d) { w.debris.push(d); }, addBody() {}, sound() {}, noise() {}, shake() {}, light() {},
  };
  const v = car(w, 20 * TILE, 10 * TILE, a0, model), ch = man(w, weapon);
  w.player = ch;
  v.seatIn(ch);
  if (ch.riding) ch.riding.k = 1;
  if (ch.riding) v.carry(DT);
  return { w, v, ch, gun: new CarGun(w, v, seatOf(v)) };
}

// the aim `off` rad from the nose, 200 px out from his seat
const aimOf = (r, off) => { const o = r.gun.root(), a = r.v.body.angle + off; return { x: o.x + Math.cos(a) * 200, y: o.y + Math.sin(a) * 200 }; };
const mouse = (held, hit = held) => ({ mouseDown: () => held, mouseHit: () => { const h = hit; hit = false; return h; } });

// aimed there for n steps (World: the drive steps the gun, then the car carries him and eases his arm)
function hold(r, off, n = 30, input = mouse(false)) {
  for (let i = 0; i < n; i++) { r.gun.step(DT, input, aimOf(r, off)); if (r.ch.riding) r.v.carry(DT); }
}

// where the muzzle (and the port) of the gun is in the pose he is drawn in: his pose as drawPose paints it, scaled
// BODY_SCALE about him (CharacterAnim bodyFrame), the gun's sprite as drawWeapon puts it (muzzleIn, tests/muzzle)
function drawnGun(ch) {
  const P = ch.livePose(), d = ch.def, w = sw(sprite(d.sprite)), m = muzzleIn(P, d, w, {}), q = boreIn(P, d, d.eject - d.grip, {});
  const at = (p) => ({ x: ch.x + p.x * BODY_SCALE, y: ch.y + p.y * BODY_SCALE });
  return { muzzle: { ...at(m), a: m.a }, port: at(q), fist: P.fist };
}

// a 2D context that keeps its matrix, and what it was asked to draw (drawImage: the image and the matrix then)
function matrixCtx() {
  let M = [1, 0, 0, 1, 0, 0];
  const stack = [], images = [], paths = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const ctx = new Proxy({
    save() { stack.push(M); }, restore() { M = stack.pop(); },
    translate(x, y) { M = mul(M, [1, 0, 0, 1, x, y]); }, rotate(a) { const c = Math.cos(a), s = Math.sin(a); M = mul(M, [c, s, -s, c, 0, 0]); },
    scale(x, y) { M = mul(M, [x, 0, 0, y, 0, 0]); },
    drawImage(img, x, y) { images.push({ img, M, x, y }); },
    moveTo(x, y) { paths.push(apply(M, x, y)); },
  }, { get: (t, k) => t[k] ?? (() => {}), set: (t, k, v) => { t[k] = v; return true; } });
  return { ctx, images, paths, at: () => M };
}
const apply = (M, x, y) => ({ x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] });
const near = (p, q, e = 1e-6) => Math.hypot(p.x - q.x, p.y - q.y) < e;
const ARC = [['out of his door', -1.57], ['ahead-left', -0.6], ['over the windscreen', 0], ['ahead-right', 0.6],
  ['across the passenger seat', 1.57], ['back along his door', -2.1], ['back along the right flank', 2.1]];

test('car gun: the round and its flash leave the muzzle of the Uzi as the seat pose draws it, at every aim round his arc', () => {
  for (const a0 of [0, 0.3, -1.1]) {
    const r = rig(a0);
    for (const [where, off] of ARC) {
      hold(r, off);
      const want = drawnGun(r.ch), n = r.w.projectiles.length;
      r.gun.step(DT, mouse(true), aimOf(r, off));
      assert.equal(r.w.projectiles.length, n + 1, `${where}: a round`);
      const pr = r.w.projectiles[n], a = r.gun.aimed.a, fl = combatFx(r.w).muzzles.at(-1);
      assert.ok(near({ x: pr.ox, y: pr.oy }, want.muzzle), `${where} (car at ${a0}): the round at (${pr.ox.toFixed(2)}, ${pr.oy.toFixed(2)}), the muzzle drawn at (${want.muzzle.x.toFixed(2)}, ${want.muzzle.y.toFixed(2)})`);
      assert.ok(near(fl, want.muzzle) && Math.abs(angDiff(fl.a, want.muzzle.a)) < 1e-9, `${where}: the flash on it, along the barrel`);
      assert.ok(Math.abs(angDiff(want.muzzle.a, a)) < 1e-9, `${where}: the gun drawn along the aim`);
      assert.ok(Math.abs(angDiff(Math.atan2(pr.vy, pr.vx), a)) < 0.4, `${where}: the round along it`);
      r.gun.cool = 0;
    }
  }
});

test('car gun: in the door\'s hand to his left and ahead, in the right one across the passenger seat: the round leaves whichever hand has it', () => {
  const r = rig(0.3), seat = seatOf(r.v)[1];
  for (const [off, hand, fist, side] of [[-1.57, 0, false, -1], [1.57, 1, true, 1], [-1.57, 0, false, -1]]) {
    hold(r, off, 40);
    const want = drawnGun(r.ch), n = r.w.projectiles.length;
    assert.equal(r.ch.riding.hand, hand, `the gun in the ${hand ? 'right' : 'door\'s'} hand`);
    assert.equal(want.fist, fist);
    r.gun.cool = 0;
    r.gun.step(DT, mouse(true), aimOf(r, off));
    const pr = r.w.projectiles[n], sy = r.v.toSprite(pr.ox, pr.oy).sy;
    assert.ok(near({ x: pr.ox, y: pr.oy }, want.muzzle), `the round from that hand's gun (${off})`);
    assert.ok(side * (sy - seat) > 10, `on his ${side < 0 ? 'door\'s' : 'passenger\'s'} side of the seat (${(sy - seat).toFixed(1)} px)`);
  }
});

test('car gun: where it is SEEN is the car\'s frame as it is drawn (64 angles, whole px, on its springs): flash, streak and case start there', () => {
  const r = rig(0.3), { v, gun, w } = r;
  for (const [where, off] of ARC) {
    hold(r, off);
    // the car drawn a little off its body (the picture's px, one of its 64 angles), on its springs
    v.drawn = { x: v.x + 0.21, y: v.y - 0.3, a: v.body.angle + 0.043 };
    v.sag = [1, -1];
    const n = w.projectiles.length;
    r.gun.step(DT, mouse(true), aimOf(r, off));
    const pr = w.projectiles[n];
    // the man in it drawn by the car (Vehicle.draw: carried with its springs), his muzzle in his own drawn pose
    const C = matrixCtx();
    v.carried(C.ctx, () => {}, ...v.sag);
    const M0 = C.at();
    v.carried(C.ctx, () => { C.seen = apply(C.at(), r.ch.muzzlePos().x, r.ch.muzzlePos().y); }, ...v.sag);
    assert.deepEqual(C.at(), M0, 'carried restores the context');
    const seen = gun.drawnMuzzle();
    assert.ok(near(seen, C.seen), `${where}: drawnMuzzle is the drawn muzzle (${seen.x.toFixed(2)}, ${seen.y.toFixed(2)} vs ${C.seen.x.toFixed(2)}, ${C.seen.y.toFixed(2)})`);
    assert.ok(Math.hypot(seen.x - pr.ox, seen.y - pr.oy) > 0.5, `${where}: (and not where the body has it)`);
    // the flash follows it (CombatFx draws it there), the round's streak starts there
    const fx = combatFx(w), fl = fx.muzzles.at(-1);
    fx.draw(matrixCtx().ctx);
    assert.ok(near(fl, seen), `${where}: the flash drawn on the muzzle seen`);
    const S = matrixCtx();
    pr.draw(S.ctx);
    assert.ok(near(S.paths[0], seen), `${where}: the streak from the muzzle seen`);
    gun.cool = 0;
    v.drawn = null;
  }
});

test('car gun: the round is drawn out of the muzzle between two steps, the case born at the port as it is seen, under its height', () => {
  const r = rig(0), { v, w, gun } = r, I = w.game.interp, rnd = Math.random;
  sprite('weapons/' + WEAPONS.uzi.casing); // (its picture there: a case is thrown)
  hold(r, -1.2);
  v.sag = [0, 1];
  I.capture([], []);
  Math.random = () => 0; // (a case every shot)
  try { r.gun.step(DT, mouse(true), aimOf(r, -1.2)); } finally { Math.random = rnd; }
  const pr = w.projectiles.at(-1), c = w.debris.at(-1), port = r.ch.portPos();
  pr.x += 20; pr.y -= 10; // (the step moves it on)
  I.apply(0);
  assert.ok(near(pr, { x: pr.ox, y: pr.oy }), 'drawn as the step began: at the muzzle, not a step ahead of it');
  I.restore();
  const seen = v.carriedAt(port, ...v.sag, v.snapped()), b = c.body.position;
  assert.ok(near({ x: b.x, y: b.y - c.z * c.lift }, seen), `the case drawn at the port seen (${b.x.toFixed(2)}, ${(b.y - c.z * c.lift).toFixed(2)} vs ${seen.x.toFixed(2)}, ${seen.y.toFixed(2)})`);
  assert.ok(I.bodies.includes(c.body) && near({ x: c.body.ipx, y: c.body.ipy }, b), 'and drawn from there between two steps');
  assert.equal(gun.drawnMuzzle() !== null, true);
});

test('car gun: a click while his arm is still coming up waits for the gun to come along the aim, then fires once', () => {
  const r = rig(0.3, 'pistol');
  hold(r, 0, 20);
  r.ch.riding.aim = null;
  for (let i = 0; i < 30; i++) r.v.carry(DT); // the arm down, the gun hanging over the door
  assert.equal(r.ch.riding.up, 0);
  const input = mouse(false, true);
  let first = -1;
  for (let i = 0; i < 20 && first < 0; i++) {
    r.gun.step(DT, input, aimOf(r, -0.8));
    r.v.carry(DT);
    if (r.w.projectiles.length) first = i;
  }
  assert.ok(first > 0 && first * DT < 0.15, `not at once, but as the gun comes up (step ${first})`);
  hold(r, -0.8, 20);
  assert.equal(r.w.projectiles.length, 1, 'one click, one round');
  const pr = r.w.projectiles[0];
  assert.ok(Math.abs(angDiff(combatFx(r.w).muzzles.at(-1).a, r.gun.aimed.a)) <= CHASE.gun.level, 'the gun along the aim as it fired');
  assert.ok(Number.isFinite(pr.ox));
});

test('car gun: a closed car\'s hand out of the window: its round leaves the muzzle of the gun drawn in it', () => {
  const r = rig(0.3, 'uzi', 'van'), { v, w, gun } = r;
  assert.equal(gun.open, false);
  v.drawn = { x: v.x - 0.2, y: v.y + 0.15, a: v.body.angle - 0.03 };
  for (const off of [-1.57, -0.8, -2.2]) {
    const n = w.projectiles.length;
    gun.cool = 0;
    gun.step(DT, mouse(true), aimOf(r, off));
    assert.equal(w.projectiles.length, n + 1);
    const pr = w.projectiles[n], C = matrixCtx(), img = sprite(WEAPONS.uzi.sprite), d = WEAPONS.uzi;
    drawChaseFigures(C.ctx, { drive: { on: true, dead: false, gun }, player: r.ch }, () => true);
    const g = C.images.find((e) => e.img === img), k = img.k || 1;
    // the sprite's muzzle: MUZZLE_IN in from its last column, on its bore line
    const drawn = apply(g.M, g.x + (img.width - MUZZLE_IN / k), g.y + img.height / 2 + d.bore / k);
    assert.ok(near(drawn, gun.drawnMuzzle()), `${off}: drawnMuzzle on the gun as drawn`);
    assert.ok(near(v.carriedAt({ x: pr.ox, y: pr.oy }), drawn), `${off}: the round from it`);
  }
});

test('pursuit: a gunman\'s shot leaves the muzzle of the pistol drawn in his hand', () => {
  const w = { time: 0, camera: { pixel: true, z: 3 } };
  const v = car(w, 30 * TILE, 10 * TILE, 0.1, 'pursuer');
  v.drawn = { x: v.x + 0.3, y: v.y - 0.1, a: 0.12 };
  const P = Object.create(Pursuit.prototype), img = sprite(WEAPONS.pistol.sprite), k = img.k || 1;
  P.G = CHASE.gunman;
  for (const [side, gunA] of [[-1, -1.4], [-1, -0.6], [1, 1.9], [1, 1.2]]) {
    const one = { v, gunSide: side, gunA, gunman: true };
    P.cars = [one];
    const C = matrixCtx();
    drawChaseFigures(C.ctx, { pursuit: P }, () => true);
    const g = C.images.find((e) => e.img === img);
    const drawn = apply(g.M, g.x + (img.width - MUZZLE_IN / k), g.y + img.height / 2 + WEAPONS.pistol.bore / k);
    assert.ok(near(v.carriedAt(P.muzzle(one)), drawn), `side ${side} at ${gunA}: his muzzle where his pistol ends`);
  }
});
