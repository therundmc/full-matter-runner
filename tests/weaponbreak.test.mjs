// The player's melee weapons wearing out blow by blow, how they break (data/weapons.js wear / breaks / parts,
// Character.meleeStrike, breakWeapon, Player.updateBroke), and a dead man's weapon snatched into the hand
// (Player.snatches, grab; data/feel.js SNATCH; the SNATCHED tag).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { load } from './setup.mjs';
import { noop, sink } from './helpers.mjs';

// the sprites, loaded as the browser does (sizes from the files)
const ROOT = new URL('../', import.meta.url);
globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
globalThis.Image = class {
  set src(v) {
    const f = new URL(v, ROOT);
    if (!existsSync(f)) { queueMicrotask(() => this.onerror?.()); return; }
    const b = readFileSync(f);
    this.width = b.readUInt32BE(16); this.height = b.readUInt32BE(20);
    queueMicrotask(() => this.onload?.());
  }
};
const { loadAssets, spriteOpt } = await load('engine/Assets.js');
await loadAssets();
const { WEAPONS, WEAR, plantedOf } = await load('game/data/weapons.js');
const { BREAK, SNATCH, DROP } = await load('game/data/feel.js');
const { FINISHERS, TAKEDOWNS } = await load('game/data/finishers.js');
const { SCORING } = await load('game/data/scoring.js');
const { default: Scoring, killTags } = await load('game/systems/Scoring.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Character } = await load('game/entities/Character.js');
const { default: Player } = await load('game/entities/Player.js');
const { newPose, takedownPose } = await load('game/entities/CharacterAnim.js');

const { Body } = Matter;
const WORN = Object.entries(WEAPONS).filter(([, d]) => d.wear);

// a world that keeps what flies off, falls and is painted; victims: who stands in reach
function world(victims = []) {
  const w = {
    particles: sink, camera: sink, events: { emit: noop, on: noop }, time: 0, slowmo: noop, hitstop: noop, shake: noop, light: noop,
    sound: (name) => w.sounds.push(name), noise: noop, pickupFlash: noop, game: null,
    characters: () => victims, lineOfSight: () => true, props: [], windows: [], doors: [], corpses: [], debris: [], items: [],
    map: { isWallChar: () => false, solidAt: () => false, raycast: () => null, at: () => '.' }, enemies: [],
    sounds: [], painted: [],
    decals: new Proxy({ paint: (fn) => w.painted.push(fn) }, { get: (o, k) => o[k] ?? noop }),
    addBody: noop, removeBody: noop, addDebris: (d) => w.debris.push(d), removeDebris: (d) => { d.dead = true; },
    addItem: (it) => w.items.push(it), removeItem: (it) => { it.dead = true; },
    addCorpse: (c) => w.corpses.push(c), onKill: noop, damageWall: noop, physics: { bodies: () => [], add: noop, remove: noop },
  };
  return w;
}
// the player, a weapon in hand, facing east at the origin
function fighter(type, w = world()) {
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, recoil: 0,
    vel: { x: 0, y: 0 }, body: Matter.Bodies.circle(0, 0, 10), broke: null, brokeAt: null, snatch: null, execution: null, takedown: null,
    ammo: { '9mm': 0, '12g': 0, '762': 0, rocket: 0 } });
  p.setWeapon(type);
  return p;
}
// a guard in reach whose death is only noted
const guard = (x = 14, y = 0) => ({
  alive: true, team: 'enemy', x, y, angle: Math.PI, radius: 8,
  kill(a, cause, killer, by, how) { this.alive = false; Object.assign(this, { a, cause, by, how }); },
});
// one blow of the player's at whoever (and whatever) stands in his world
function swing(p, victims = [guard()], strike = 0) {
  p.world.characters = () => victims;
  p.strike = strike;
  p.meleeStrike(p.def);
  return victims;
}
const square = (x, y, r) => [{ x: x - r, y: y - r }, { x: x + r, y: y - r }, { x: x + r, y: y + r }, { x: x - r, y: y + r }];
const prop = (x = 20, y = 0) => ({ x, y, dead: false, def: {}, hits: 0, body: { vertices: square(x, y, 6) }, hit() { this.hits++; } });

test('wear: the weapons that wear out, in blows, and how each breaks', () => {
  const table = Object.fromEntries(WORN.map(([id, d]) => [id, d.wear]));
  assert.deepEqual(table, { bat: 3, tire_iron: 3, tire_iron_bent: 2, cue: 2, cue_half: 2, knife: 3 });
  for (const [id, d] of WORN) {
    assert.ok(d.kind === 'melee' && ['snap', 'lodge', 'bend', 'toss'].includes(d.breaks), id);
    for (const part of d.parts ?? []) assert.ok(spriteOpt(part), `${id}: no sprite ${part}`);
    if (d.bends) assert.ok(WEAPONS[d.bends].kind === 'melee' && WEAPONS[d.bends].wear, id);
  }
  assert.equal(plantedOf(WEAPONS.knife), 'weapons/knife_blade');
  assert.equal(plantedOf(WEAPONS.cue_half), WEAPONS.cue_half.sprite);
  assert.equal(plantedOf(WEAPONS.bat), undefined);
});

test('wear: every weapon breaks on the blow that uses it up, on a man, and not before', () => {
  for (const [id, d] of WORN) {
    const p = fighter(id);
    for (let i = 1; i < d.wear; i++) {
      const [g] = swing(p);
      assert.ok(!g.alive && !g.how.broke, `${id}: blow ${i}`);
      assert.equal(p.weapon?.type, id, `${id}: still whole after blow ${i}`);
    }
    const [g] = swing(p);
    assert.ok(g.how.broke && g.how.heavy, `${id}: blow ${d.wear} breaks it`);
    assert.notEqual(p.weapon?.type, id, `${id}: gone from the hand`);
    assert.equal(p.weapon?.type ?? null, d.snaps ?? d.bends ?? null, `${id}: what is left in the hand`);
    assert.equal(p.brokeAt.name, d.name, `${id}: the HUD flashes it`);
  }
});

test('wear: a thing struck takes a share of a blow, the air nothing, two men in a swing one', () => {
  const p = fighter('bat'), d = WEAPONS.bat;
  swing(p, []);
  assert.equal(p.weapon.wear, d.wear, 'a whiff');
  const table = prop();
  p.world.props = [table];
  swing(p, []);
  assert.equal(table.hits, 1);
  assert.ok(Math.abs(p.weapon.wear - (d.wear - WEAR.thing)) < 1e-9, 'the furniture takes a share');
  assert.ok(WEAR.thing > 0 && WEAR.thing < WEAR.man);
  swing(p, [guard()]);
  assert.ok(Math.abs(p.weapon.wear - (d.wear - WEAR.thing - WEAR.man)) < 1e-9, 'a man and the table: the man counts');
  p.world.props = [];
  p.weapon.wear = 1;
  const [a, b] = swing(p, [guard(12, 0), guard(15, 4)]);
  assert.ok(!a.alive && !b.alive && a.how.broke && !b.how.broke, 'two men: one break');
  // a weapon worn to its last share breaks on the furniture
  const q = fighter('bat');
  q.weapon.wear = WEAR.thing;
  q.world.props = [prop()];
  swing(q, []);
  assert.equal(q.weapon, null);
  assert.equal(q.world.debris.length, 1, 'its head flew off the table');
});

test('break: a bat snaps in two, its head sent on along the swing, the handle looked at a beat and let fall', () => {
  const p = fighter('bat'), w = p.world;
  p.weapon.wear = 1;
  swing(p);
  assert.equal(p.weapon, null);
  assert.equal(w.debris.length, 1, 'the head');
  const head = w.debris[0], v = Body.getVelocity(head.body);
  assert.equal(head.img, spriteOpt('weapons/bat_head'));
  assert.ok(head.z > 0 && head.vz > 0, 'up in the air');
  assert.equal(head.body.material, 'wood');
  // forward, and across to the side the stroke runs to (from punchSide 1: toward -y)
  assert.ok(v.x > 0 && v.y < 0, `along the swing: ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);
  assert.ok(Math.hypot(v.x, v.y) * 60 >= BREAK.fly[0] - 1);
  assert.ok(w.sounds.includes('batSnap'));
  assert.equal(p.broke.stub, spriteOpt('weapons/bat_handle'), 'the handle stays in the hand');
  let t = 0;
  while (p.broke && t < 2) { p.updateBroke(1 / 60); t += 1 / 60; }
  assert.equal(w.debris.length, 2, 'then it falls');
  assert.equal(w.debris[1].img, spriteOpt('weapons/bat_handle'));
  assert.ok(Math.abs(t - BREAK.beat) < 0.05, 'the beat is over');
});

test('break: a knife leaves its blade in the man, its handle falls; in a wall the blade stays in the wall', () => {
  const p = fighter('knife'), w = p.world;
  p.weapon.wear = 1;
  const [g] = swing(p);
  assert.equal(g.by.stuck, 'weapons/knife_blade', 'the blade in him');
  assert.equal(g.by.wound, 'slash');
  assert.equal(p.weapon, null);
  assert.equal(p.broke.stub, null, 'the hand opens: nothing left in it');
  assert.equal(w.debris.length, 1);
  assert.equal(w.debris[0].img, spriteOpt('weapons/knife_handle'), 'the handle on its way down');
  assert.ok(w.debris[0].z > 0);
  assert.ok(w.sounds.includes('knifeSnap'));
  // against a wall: the blade painted standing out of its face, the handle falls
  const q = fighter('knife'), v = q.world;
  q.weapon.wear = WEAR.thing;
  v.map = { isWallChar: () => true, raycast: () => ({ t: 0.5, x: 14, y: 0, nx: -1, ny: 0, cx: 0, cy: 0 }) };
  swing(q, []);
  assert.equal(q.weapon, null);
  assert.equal(v.painted.length, 1, 'the blade in the wall');
  assert.deepEqual(v.debris.map((o) => o.img), [spriteOpt('weapons/knife_handle')]);
});

test('break: a tire iron bends into a worse one, which is thrown away once it is used up', () => {
  const p = fighter('tire_iron'), w = p.world;
  p.weapon.wear = 1;
  swing(p);
  assert.equal(p.weapon.type, 'tire_iron_bent');
  assert.equal(p.weapon.wear, WEAPONS.tire_iron_bent.wear, 'fresh');
  const [a, b] = [WEAPONS.tire_iron, WEAPONS.tire_iron_bent];
  assert.ok(b.rate > a.rate && b.range < a.range, 'slower and shorter');
  assert.equal(w.debris.length, 0, 'nothing flies off');
  p.updateBroke(BREAK.beat + 0.01);
  p.weapon.wear = 1;
  swing(p);
  assert.equal(p.weapon, null);
  assert.equal(p.broke.stub, spriteOpt('weapons/tire_iron_bent'));
  for (let t = 0; t < BREAK.beat; t += 1 / 60) p.updateBroke(1 / 60);
  assert.equal(w.debris.length, 1, 'thrown away');
  assert.ok(Math.hypot(...Object.values(Body.getVelocity(w.debris[0].body))) * 60 > BREAK.fall.toss * 0.6);
});

test('break: a finisher uses the weapon up on the kill and breaks it on its last beat; a takedown on its kill', () => {
  const p = fighter('bat'), w = p.world;
  p.weapon.wear = 1;
  const g = { alive: true, x: 30, y: 0, downAngle: 0, voice: 1, knocked: 2, executing: false,
    kill(a, cause, killer, by, how) { this.alive = false; Object.assign(this, { how, killedAt: w.time, weapon: killer.weapon?.type }); } };
  Object.assign(p, { steer: noop, eject: noop, lastFinisher: null, execOut: null });
  p.startExecution(g, FINISHERS.club);
  const dt = 1 / 120;
  while (p.execution && w.time < 4) { w.time += dt; p.updateExecution(dt, null); }
  assert.ok(g.how.broke && g.how.close, 'the kill used it up');
  assert.equal(g.weapon, 'bat', 'still whole when he died (the kill is its first beat)');
  assert.equal(p.weapon, null, 'broken by the end');
  assert.equal(w.debris[0]?.img, spriteOpt('weapons/bat_head'));
  // a knife, the man held: the blade stays in him on the kill
  const q = fighter('knife'), v = q.world;
  q.weapon.wear = 1;
  const h = { alive: true, x: 14, y: 0, angle: 0, voice: 1, held: null, knocked: 0, yielded: false, body: Matter.Bodies.circle(14, 0, 10),
    kill(a, cause, killer, by, how) { this.alive = false; Object.assign(this, { by, how }); } };
  q.startTakedown(h, { f: TAKEDOWNS.blade });
  while (q.takedown && v.time < 3) { v.time += 1 / 60; q.updateTakedown(1 / 60); }
  assert.ok(h.how.broke && h.how.close);
  assert.equal(h.by.stuck, 'weapons/knife_blade');
  assert.equal(q.weapon, null);
  assert.deepEqual(v.debris.map((o) => o.img), [spriteOpt('weapons/knife_handle')]);
  // one that leaves it whole takes a blow out of it
  const r = fighter('knife');
  const k = { ...h, alive: true, held: null, body: Matter.Bodies.circle(14, 0, 10) };
  r.startTakedown(k, { f: TAKEDOWNS.blade });
  while (r.takedown && r.world.time < 3) { r.world.time += 1 / 60; r.updateTakedown(1 / 60); }
  assert.equal(r.weapon.wear, WEAPONS.knife.wear - WEAR.man);
});

test('break: a club that breaks on a takedown\'s kill leaves the pose whole through the rest of the move', () => {
  // (QA lab 61043: CRACK SKULL with a bat on its last blow; the hands went NaN through `after`, fists in hand)
  for (const f of [TAKEDOWNS.club, TAKEDOWNS.hobble]) {
    const p = fighter('bat'), w = p.world;
    p.weapon.wear = 1;
    const g = { alive: true, x: 14, y: 0, angle: 0, voice: 1, held: null, knocked: 0, yielded: false, body: Matter.Bodies.circle(14, 0, 10),
      kill(a, cause, killer, by, how) { this.alive = false; Object.assign(this, { how }); } };
    p.startTakedown(g, { f });
    let after = 0;
    while (p.takedown && w.time < 3) {
      w.time += 1 / 60;
      p.updateTakedown(1 / 60);
      if (!p.takedown) break;
      const P = takedownPose(p, newPose(), newPose());
      for (const k of ['hl', 'hr', 'wpn']) assert.ok(Number.isFinite(P[k].x) && Number.isFinite(P[k].y), `${f.action} ${k} at ${w.time.toFixed(2)} s`);
      if (p.takedown.done && !p.weapon) after++;
    }
    assert.ok(g.how.broke && after > 0, `${f.action}: broken on the kill, the move played on after it`);
  }
});

// a guard of no particular look with a pistol, killed through Character.kill
function gunman(w, x = 14, mag = 5) {
  const g = Object.create(Character.prototype);
  Object.assign(g, { world: w, kind: 'nobody', team: 'enemy', alive: true, knocked: 0, angle: Math.PI, radius: 8, voice: 1,
    body: Matter.Bodies.circle(x, 0, 10) });
  g.setWeapon('pistol', mag);
  return g;
}
// time going by for the hand (as Player.update: not while it is busy with a finisher or a takedown)
const after = (p, s) => { for (let t = 0; t < s; t += 1 / 60) { p.world.time += 1 / 60; if (p.snatch && !p.execution && !p.takedown && p.world.time >= p.snatch.at) p.grab(); } };

test('snatch: who can take the man\'s weapon as he dies: free hands, or a weapon that broke on him', () => {
  const free = fighter(null), man = { x: 14, y: 0, weapon: { type: 'pistol', mag: 5 } };
  assert.ok(free.snatches(man, { close: true }));
  assert.ok(!free.snatches(man, {}), 'not up close by his hand (a round, a thrown blade, wreckage)');
  assert.ok(!free.snatches({ ...man, x: SNATCH.reach + 10 }, { close: true }), 'out of reach');
  assert.ok(!free.snatches({ ...man, weapon: null }, { close: true }), 'nothing in his hands');
  assert.ok(!fighter('knife').snatches(man, { close: true }), 'a working weapon in hand');
  assert.ok(fighter('knife').snatches(man, { close: true, broke: true }), 'the knife broke on him');
  assert.ok(!fighter('cue').snatches(man, { close: true, broke: true }), 'a cue snaps into a stake: the hand is not free');
  const dropped = { x: 30, y: 0, dead: false };
  assert.ok(free.snatches({ x: 14, y: 0, weapon: null, lastDrop: dropped }, { close: true }), 'what he let fall as he was floored');
  assert.ok(!free.snatches({ x: 14, y: 0, weapon: null, lastDrop: { ...dropped, dead: true } }, { close: true }));
  assert.ok(SNATCH.on);
});

test('snatch: a man killed bare handed drops his gun into the player\'s hand, with the rounds left in it', () => {
  const w = world(), p = fighter(null, w), g = gunman(w);
  g.kill(0, 'melee', p, { gore: 0, wound: 'punch' }, { close: true, from: 'front' });
  assert.equal(w.items.length, 1, 'it falls first');
  assert.ok(p.snatch && !p.weapon);
  // it waits for the hand where his hand was: still, out of the physics' way (a falling body does not knock it off)
  const it = w.items[0];
  assert.ok(it.reserved && it.body.isStatic && it.body.isSensor);
  assert.ok(Math.hypot(it.x - g.x, it.y - g.y) < 1, 'not thrown anywhere');
  after(p, SNATCH.delay + 0.05);
  assert.equal(p.weapon?.type, 'pistol');
  assert.equal(p.weapon.mag, 5, 'the rounds left in it');
  assert.equal(p.ammo['9mm'], 0, 'no spare magazine');
  assert.ok(w.items[0].dead && p.pickFrom, 'taken from where it fell');
  assert.ok(p.pickAnim > 0, 'the twirl into his grip');
  assert.ok(w.sounds.includes('snatch'));
  // with a gun of his own in hand, it falls as before
  const v = world(), q = fighter('pistol', v), h = gunman(v);
  h.kill(0, 'melee', q, { gore: 0, wound: 'punch' }, { close: true });
  after(q, 0.5);
  assert.equal(q.snatch, null);
  assert.ok(v.items.length === 1 && !v.items[0].dead);
  // ... by his body (DROP), and free for anyone to knock about
  const fell = v.items[0], sp = Matter.Body.getSpeed(fell.body);
  assert.ok(!fell.reserved && !fell.body.isStatic && sp >= DROP.speed[0] - 1e-6 && sp <= DROP.speed[1] + 1e-6, `let go at ${sp}`);
  // a bat that breaks on the kill: the stub let fall, the gun taken
  const u = world(), r = fighter('bat', u), k = gunman(u);
  r.weapon.wear = 1;
  swing(r, [k]);
  assert.equal(r.weapon, null);
  assert.ok(r.broke.stub && r.snatch);
  after(r, SNATCH.delay + 0.05);
  assert.equal(r.weapon?.type, 'pistol');
  assert.equal(r.broke?.stub ?? null, null, 'the stub fell');
  assert.equal(u.debris.filter((o) => o.img === spriteOpt('weapons/bat_handle')).length, 1);
});

test('snatch: a man who yields his gun (the prologue\'s corridor gunman) puts it in the hand whatever kills him', () => {
  const taken = (p, w, mag = 5) => {
    after(p, SNATCH.delay + 0.05);
    assert.equal(p.weapon?.type, 'pistol');
    assert.equal(p.weapon.mag, mag);
    assert.ok(w.items.some((it) => it.type === 'pistol' && it.dead), 'out of the world, into the hand');
  };
  const speed = (it) => Math.hypot(it.body.velocity.x, it.body.velocity.y);
  // not up close (a round, a thrown blade, a blast), bare handed: it does not fly, it is his
  for (const how of [{}, { thrown: true }, { close: true, from: 'back' }]) {
    const w = world(), p = fighter(null, w), g = gunman(w);
    g.yields = true;
    g.kill(2.5, 'bullet', p, { gore: 0 }, how);
    assert.ok(speed(w.items[0]) <= 1.01, 'it falls at his feet, toward the player');
    taken(p, w);
  }
  // a working weapon still in hand (the bat did not break): it is let go for the gun
  const v = world(), q = fighter('knife', v), h = gunman(v);
  h.yields = true;
  h.kill(0, 'melee', q, { gore: 0 }, { close: true });
  taken(q, v);
  assert.ok(v.items.some((it) => it.type === 'knife' && !it.dead), 'the knife on the floor');
  // floored first, his gun gone far across the floor, then finished: still his, however far it went
  const u = world(), r = fighter(null, u), k = gunman(u);
  k.yields = true;
  k.dropWeapon(0, 4);
  Body.setPosition(k.lastDrop.body, { x: 14 + SNATCH.far * 2, y: 0 });
  r.execution = { t: 0 };
  k.kill(0, 'melee', r, { gore: 0 }, { finisher: true, close: true });
  after(r, 0.5);
  assert.equal(r.weapon?.type ?? null, null, 'not while his hands are in the finisher');
  r.execution = null;
  taken(r, u);
  // a man who does not yield it keeps to the rules (SNATCH.reach / far)
  const s = world(), o = fighter(null, s), m = gunman(s);
  m.kill(0, 'bullet', o, { gore: 0 }, {});
  after(o, 0.5);
  assert.equal(o.weapon, null);
});

test('snatch: SNATCHED is a tag of the kill that pays', () => {
  const quiet = { now: 50, dodgeT: -99, pickT: -99, streak: 1 }, p = { isPlayer: true, weapon: null };
  assert.deepEqual(killTags({ killer: p, how: { disarm: true } }, quiet), ['disarm']);
  assert.deepEqual(killTags({ killer: p, how: { broke: true, disarm: true } }, quiet), ['broke', 'disarm']);
  const T = SCORING.tags.disarm;
  assert.ok(T.points > 0 && T.label === 'SNATCHED');
  const w = { events: new EventBus(), time: 0, texts: [], totalEnemies: 3, enemies: [] }, sc = new Scoring(w), log = [];
  w.events.on('scored', (e) => log.push(e));
  w.events.emit('kill', { victim: { isEnemy: true, x: 0, y: 0, aware: 2, knocked: 0 }, cause: 'melee', killer: { ...p, swing: 0 }, how: { disarm: true } });
  assert.deepEqual(sc.tags, ['disarm']);
  assert.equal(sc.points, SCORING.styles.debris.points + T.points);
  assert.ok(log[0].labels.includes('SNATCHED'));
});
