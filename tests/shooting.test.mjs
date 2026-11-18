// The feel of shooting: recoil per gun, spent cases out of the port, the reload's timeline, guards flinching from
// rounds that miss, the player's kill mark. Rules and numbers only (no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
const { WEAPONS } = await load('game/data/weapons.js');
const { FEEL, CASING, RELOAD, FLINCH, KILL, familyOf, feelOf } = await load('game/data/feel.js');
const { recoilAt } = await load('game/entities/Recoil.js');
const { ejection, casingShown, spentSound, touchdown } = await load('game/fx/Casings.js');
const { passBy, flinchOf, sideOf, default: Flinch } = await load('game/systems/Flinch.js');
const { newPose, standPose, flinchAt } = await load('game/entities/CharacterAnim.js');
const { default: Character } = await load('game/entities/Character.js');

const GUNS = Object.entries(WEAPONS).filter(([, d]) => d.kind === 'gun');
const inRange = (v, a, b, what) => assert.ok(typeof v === 'number' && v >= a && v <= b, `${what} = ${v}`);

// ---------------- recoil ----------------
test('recoil: every gun family has a complete profile, nothing at rest, all of it at the shot', () => {
  for (const [id, d] of GUNS) {
    const R = feelOf(d).recoil;
    assert.ok(R, `${id}: no recoil profile`);
    for (const k of ['rate', 'ease', 'hands', 'flip', 'rise', 'over', 'torso', 'rock', 'sink', 'elbow', 'buzz', 'hz']) inRange(R[k], 0, 120, `${id}.${k}`);
    inRange(R.rate, 1.5, 15, `${id}.rate`);
    inRange(R.sink, 0, 0.06, `${id}.sink`);
    const rest = recoilAt(R, 0, 1.3, 0.4, {});
    for (const [k, v] of Object.entries(rest)) assert.ok(Math.abs(v) < 1e-9, `${id}: ${k} at rest = ${v}`);
    const shot = recoilAt(R, 1, 0, 0, {});
    assert.equal(shot.hands, R.hands); assert.equal(shot.flip, R.flip); assert.equal(shot.torso, R.torso);
  }
});

test('recoil: each gun kicks its own way', () => {
  const at = (id, r, t = 0) => recoilAt(feelOf(WEAPONS[id]).recoil, r, t, 0, {});
  const P = (id) => feelOf(WEAPONS[id]).recoil;
  // the 1911 flips snappily: the hands are mostly back by half the clock, and the muzzle dips past rest on the way
  assert.ok(at('pistol', 0.5).hands < 0.25 * P('pistol').hands);
  assert.ok(Math.min(...[0.1, 0.2, 0.3, 0.4].map((r) => at('pistol', r).flip)) < 0, 'no dip past rest');
  assert.ok(P('pistol').flip > 2 * P('rifle').flip, 'the pistol flips, the rifle pushes');
  // the Uzi chatters while it fires: its clock never runs out between two rounds, and its hands shake
  assert.ok(P('uzi').rate * WEAPONS.uzi.rate < 1, 'the Uzi settles between rounds');
  const buzz = [0.01, 0.02, 0.03, 0.04].map((t) => at('uzi', 0.6, t).bx);
  assert.ok(Math.max(...buzz) - Math.min(...buzz) > 0.2, 'no chatter');
  assert.equal(at('pistol', 0.6, 0.02).bx, 0);
  // the M16: a short push per round, back on target before the next one
  assert.ok(P('rifle').rate * WEAPONS.rifle.rate >= 1, 'the M16 does not recover between rounds');
  // the SUPER 90 rocks the shoulders, the .50 shoves the body that takes it, and they take longest to recover
  assert.ok(P('shotgun').rock > 3 * P('rifle').rock && P('shotgun').rock > P('sniper').rock);
  assert.ok(P('sniper').torso > P('shotgun').torso && P('sniper').sink > P('shotgun').sink);
  assert.ok(P('sniper').rate < P('pistol').rate && P('shotgun').rate < P('pistol').rate);
  // the body takes the shove slower than the hands snap back
  for (const id of ['shotgun', 'sniper', 'rifle']) assert.ok(at(id, 0.5).torso / P(id).torso > at(id, 0.5).hands / P(id).hands, id);
});

// a man standing still, the gun raised straight ahead (CharacterAnim standPose's inputs)
const standing = (d, o = {}) => ({
  def: d, angle: 0, gait: 0, runK: 0, strideV: 0, walk: 0, strideA: 0, footA: 0, backward: false, lean: { x: 0, y: 0 },
  recoil: 0, lower: 0, stow: 0, reloading: 0, reloadDur: 1, swing: 0, tell: 0, pickAnim: 0, grab: null, held: null,
  isPlayer: true, breath: 0, world: { time: 0 }, ...o,
});
const pose = (ch) => {
  const P = standPose(ch, newPose());
  return { hr: { ...P.hr }, hl: { ...P.hl }, wpn: { ...P.wpn }, ta: P.ta, s: P.s, tx: P.tx, len: P.wpnLen, duck: P.duck, hunch: P.hunch };
};

test('recoil: the shot throws the gun hand back and the body with it, two-handed holds stay two-handed', () => {
  for (const [id, d] of GUNS) {
    const rest = pose(standing(d)), shot = pose(standing(d, { recoil: 1 }));
    assert.ok(shot.hr.x < rest.hr.x - 0.5, `${id}: the gun hand does not come back (${rest.hr.x} -> ${shot.hr.x})`);
    assert.ok(shot.tx < rest.tx, `${id}: the body is not shoved back`);
    if (d.hold === 'two') {
      // the front hand stays on the forend: it moves with the gun
      const gap = (p) => Math.hypot(p.hl.x - p.wpn.x, p.hl.y - p.wpn.y);
      assert.ok(Math.abs(gap(shot) - gap(rest)) < 0.6, `${id}: the front hand leaves the gun`);
    }
  }
  const sg = WEAPONS.shotgun, rest = pose(standing(sg)), shot = pose(standing(sg, { recoil: 1 }));
  assert.ok(shot.ta - rest.ta > 0.15, 'the SUPER 90 does not rock the shoulders');
  assert.ok(pose(standing(WEAPONS.sniper, { recoil: 1 })).s < pose(standing(WEAPONS.sniper)).s, 'the .50 is not absorbed');
});

// ---------------- spent cases ----------------
test('casings: out of the port to the gun\'s right, a little behind square, up in the air, spinning', () => {
  for (const [id, d] of GUNS.filter(([, g]) => g.casing)) {
    assert.ok(CASING[d.casing], `${id}: no CASING entry for ${d.casing}`);
    assert.ok(d.eject > d.grip, `${id}: the port is behind the hand`);
    for (const a of [0, 1.2, -2.5]) {
      for (const r of [0, 0.5, 0.999]) {
        const e = ejection(d, { x: 10, y: 20 }, a, null, () => r), C = e.spec;
        const right = e.vx * -Math.sin(a) + e.vy * Math.cos(a), fwd = e.vx * Math.cos(a) + e.vy * Math.sin(a);
        const sp = Math.hypot(e.vx, e.vy);
        assert.ok(right > 0.8 * sp, `${id}: not to the right (${right} of ${sp})`);
        assert.ok(fwd <= 0, `${id}: thrown forward`);
        inRange(sp, C.speed[0] - 1e-9, C.speed[1] + 1e-9, `${id}: speed`);
        assert.ok(e.x === 10 && e.y === 20 && e.z > 0 && e.vz > 0 && Math.abs(e.spin) > 0 && Math.abs(e.tumble) > 0, id);
      }
    }
  }
  // he walks: the case keeps his way
  const still = ejection(WEAPONS.pistol, { x: 0, y: 0 }, 0, null, () => 0.5), walk = ejection(WEAPONS.pistol, { x: 0, y: 0 }, 0, { x: 90, y: 0 }, () => 0.5);
  assert.ok(Math.abs(walk.vx - still.vx - 90) < 1e-9 && walk.vy === still.vy);
});

test('casings: they hop and ring at each touchdown, then lie still; brass rings, a hull taps', () => {
  for (const [kind, C] of Object.entries(CASING)) {
    // fall from the port as the debris does (fake height, Debris GRAVITY), count the touchdowns
    let z = C.from, vz = C.up[1], hops = 0, vol = Infinity, t = 0;
    for (; t < 3; t += 1 / 240) {
      vz -= 520 / 240; z += vz / 240;
      if (z > 0) continue;
      z = 0;
      const td = touchdown(C, vz);
      assert.ok(td.vol <= vol + 1e-9, `${kind}: louder on a later touchdown`);
      vol = td.vol; hops++;
      if (!td.up) break;
      vz = td.up;
    }
    inRange(hops, 2, 4, `${kind}: touchdowns`);
    assert.ok(t < 1.2, `${kind}: still hopping after ${t} s`);
  }
  assert.equal(spentSound(WEAPONS.pistol), '9mm');
  assert.equal(spentSound(WEAPONS.rifle), '762');
  assert.equal(spentSound(WEAPONS.shotgun), 'hull');
  // the player's gun always shows them, a guard's only now and then; no case without a casing
  assert.ok(casingShown(WEAPONS.uzi, true, () => 0.99) && !casingShown(WEAPONS.uzi, false, () => 0.99));
  assert.ok(casingShown(WEAPONS.uzi, false, () => 0.1) && !casingShown(WEAPONS.bazooka, true));
});

// ---------------- reload ----------------
test('reload: the magazine timeline runs in order, the rounds go in before the action is worked', () => {
  const L = RELOAD.mag;
  const order = [0, L.release, L.drop, L.belt[0], L.belt[1], L.insert, L.seat, L.rack[0], L.rack[1], 1];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `RELOAD.mag out of order at ${i}`);
  assert.ok(L.tilt[0] > L.release && L.tilt[1] > L.rack[1] - 0.15);
  const S = RELOAD.shell;
  assert.ok(S.fetch < S.port && S.port < S.push && S.push < 1 && S.racked > 0);
  for (const [id, d] of GUNS.filter(([, g]) => g.shellReload)) assert.ok(d.load, `${id}: what goes in by hand`);
});

function reloader(type, mag, reserve) {
  const log = [];
  const ch = Object.create(Character.prototype);
  Object.assign(ch, { alive: true, knocked: 0, body: { position: { x: 0, y: 0 } }, recoil: 0, reloading: 0, reloadDur: 1, reloadStage: 0, shellsIn: 0, racking: 0 });
  ch.world = { sound: (name) => log.push(name) };
  ch.setWeapon(type, mag, reserve);
  ch.dropMag = function () { log.push('drop'); this.weapon.mag = 0; };
  return { ch, log };
}

test('reload: a magazine falls, the fresh one is seated, then the action is worked, and the recoil is left alone', () => {
  const { ch, log } = reloader('rifle', 3, 2);
  assert.ok(ch.reload());
  let mags = [];
  for (let t = 0; t < 2; t += 1 / 60) { ch.updateReload(1 / 60); mags.push(ch.weapon.mag); }
  assert.deepEqual(log, ['magOut', 'drop', 'magIn', 'rack']);
  assert.equal(ch.weapon.mag, 30);
  assert.equal(ch.weapon.reserve, 1);
  assert.equal(ch.recoil, 0, 'working the action is a gesture, not a shot');
  assert.ok((mags.indexOf(30) + 1) / 60 >= RELOAD.mag.seat * WEAPONS.rifle.reload - 1e-9, 'loaded before it is seated');
});

test('reload: shells go in one by one, then the action is worked by hand', () => {
  const { ch, log } = reloader('shotgun', 3, 10);
  ch.reload();
  for (let t = 0; t < 3; t += 1 / 60) ch.updateReload(1 / 60);
  assert.equal(ch.weapon.mag, 6);
  assert.equal(ch.shellsIn, 3);
  assert.deepEqual(log, ['handle', 'shellIn', 'shellIn', 'shellIn', 'rack']);
  assert.equal(ch.racking, RELOAD.shell.racked);
  assert.equal(ch.recoil, 0);
});

// ---------------- flinch ----------------
test('flinch: where a round comes closest, on which side, how hard', () => {
  const p = passBy(0, 10, -50, 0, 50, 0, {});
  assert.ok(Math.abs(p.d - 10) < 1e-9 && Math.abs(p.t - 0.5) < 1e-9 && p.qx === 0 && p.qy === 0);
  assert.ok(passBy(0, 10, 20, 0, 50, 0, {}).t < 0, 'not level with him yet');
  assert.equal(flinchOf(0, 26), 1);
  assert.equal(flinchOf(30, 26), 0);
  assert.ok(flinchOf(13, 26) === 0.5);
  // facing east (a = 0), his right is +y (the screen's y goes down)
  assert.equal(sideOf(0, 0, 0, 0, 5), 1);
  assert.equal(sideOf(0, 0, 0, 0, -5), -1);
  assert.equal(sideOf(0, 0, Math.PI / 2, -5, 0), 1);
});

function range() {
  const listeners = {}, nudges = [], shakes = [];
  const guard = (x, y, o = {}) => Object.assign(Object.create(Character.prototype), {
    body: { position: { x, y } }, angle: 0, radius: 8, alive: true, knocked: 0, team: 'enemy', flinch: 0, flinchK: 0, ...o,
  });
  const player = { x: 0, y: 200, radius: 8, alive: true, team: 'player' };
  const world = {
    time: 0, player, enemies: [guard(0, 0), guard(200, 0), guard(0, 60, { team: 'player' })],
    events: { on: (n, f) => { listeners[n] = f; } },
    camera: { push: (x, y) => nudges.push([x, y]) }, shake: (s) => shakes.push(s),
  };
  new Flinch(world);
  return { world, emit: (n, e) => listeners[n](e), nudges, shakes, player };
}

test('flinch: a guard a round goes by flinches away from it, his own side\'s rounds and far ones do not count', () => {
  const { world, emit, player } = range();
  const [g, far, mate] = world.enemies;
  emit('round', { x0: -40, y0: 14, x1: 40, y1: 14, owner: player, team: 'player' });
  assert.ok(g.flinch === FLINCH.dur && g.flinchK > 0.5, 'no flinch');
  assert.equal(g.flinchSide, 1, 'it went by on his right');
  assert.ok(Math.sin(g.flinchA) < -0.9, 'pulled away from it (up the screen)');
  assert.equal(far.flinch, 0);
  assert.equal(mate.flinch, 0, 'a man of the shooter\'s side');
  // a weaker one right after does not start it again; a round through him (a hit) is not a near miss
  g.flinch = FLINCH.dur - 0.05; const k = g.flinchK;
  emit('round', { x0: -40, y0: 30, x1: 40, y1: 30, owner: player, team: 'player' });
  assert.ok(g.flinch === FLINCH.dur - 0.05 && g.flinchK === k);
  far.flinch = 0;
  emit('round', { x0: 160, y0: 0, x1: 240, y1: 0, owner: player, team: 'player' });
  assert.equal(far.flinch, 0);
  // a round striking the wall by him
  emit('strike', { x: 200, y: 20, owner: player, team: 'player' });
  assert.ok(far.flinch > 0 && Math.sin(far.flinchA) < -0.9);
});

test('flinch: rounds striking by the player nudge his view away from them, once in a while, never his own', () => {
  const { world, emit, nudges, shakes, player } = range();
  const guard = world.enemies[0];
  emit('strike', { x: 20, y: 200, owner: guard, team: 'enemy' });
  assert.equal(nudges.length, 1);
  assert.ok(nudges[0][0] < 0 && shakes[0] > 0, 'pushed away from the hole');
  emit('strike', { x: 20, y: 200, owner: guard, team: 'enemy' });
  assert.equal(nudges.length, 1, 'too soon');
  world.time += FLINCH.camera.gap + 0.01;
  emit('strike', { x: 20, y: 200, owner: player, team: 'player' });
  emit('strike', { x: 200, y: 200, owner: guard, team: 'enemy' });
  assert.equal(nudges.length, 1, 'his own round, or one too far off');
  emit('round', { x0: -40, y0: 212, x1: 40, y1: 212, owner: guard, team: 'enemy' });
  assert.equal(nudges.length, 2, 'a round whizzing past');
});

test('flinch: the pose ducks the head, hunches the shoulders, turns them away; then it is over', () => {
  const d = WEAPONS.pistol;
  const rest = pose(standing(d));
  const ch = standing(d, { flinch: FLINCH.dur * 0.85, flinchK: 1, flinchA: Math.PI / 2, flinchSide: 1 });
  const k = flinchAt(ch), P = pose(ch);
  assert.ok(k > 0.5, `flinch ${k}`);
  assert.ok(P.duck > 0 && P.hunch > 0 && P.ta > rest.ta && P.s < rest.s);
  assert.equal(flinchAt({ ...ch, flinch: 0 }), 0);
  assert.ok(flinchAt({ ...ch, flinch: 0.01 }) < 0.1, 'it fades out');
  assert.equal(pose(standing(d)).duck, 0);
  // empty hands come up before the face
  const fists = WEAPONS.fists, open = pose(standing(fists)), up = pose(standing(fists, { flinch: FLINCH.dur * 0.85, flinchK: 1, flinchSide: 1 }));
  assert.ok(up.hl.x > open.hl.x && up.hr.x > open.hr.x);
});

// ---------------- the kill ----------------
test('kill: the mark stays faint and short, the hit-stop of a gun kill a few frames at most', () => {
  inRange(KILL.ring.alpha, 0.1, 0.6, 'ring alpha');
  inRange(KILL.ring.life, 0.1, 0.3, 'ring life');
  assert.ok(KILL.ring.r[1] > KILL.ring.r[0] && KILL.ring.r[1] <= 24 && KILL.ring.arcs >= 2 && KILL.ring.gap < 1);
  inRange(KILL.streak.alpha, 0, 0.6, 'streak alpha');
  for (const [id, d] of GUNS) inRange(FEEL[familyOf(d)].stop[1], 0, 0.1, `${id}: kill hit-stop`);
});
