// The level's devices (data/devices.js): what E reaches, the slick floor, the fire alarm, the falling lamp, the passage,
// the phones, the jukebox, the gas tap, the camera. Each on a stub world (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { USE, SLIP, SPRINKLERS, JUKEBOX, GAS_VALVE, PASSAGE, PHONES, CAMERA } = await load('game/data/devices.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Uses } = await load('game/systems/Uses.js');
const { default: Slips, slips } = await load('game/systems/Slips.js');
const { default: Sprinklers, heads } = await load('game/systems/Sprinklers.js');
const { default: LampDrop, under } = await load('game/systems/LampDrop.js');
const { default: Passage, darkAt } = await load('game/systems/Passage.js');
const { default: Phones, answerer } = await load('game/systems/Phones.js');
const { default: Jukebox, masked } = await load('game/systems/Jukebox.js');
const { default: GasValve, reach } = await load('game/systems/GasValve.js');
const { default: Camera, inPicture } = await load('game/systems/Camera.js');
const { default: Liquids } = await load('game/systems/Liquids.js');
const { default: Director } = await load('game/ai/Director.js');
const { default: level1 } = await load('game/data/levels/level1.js');
const { PROPS } = await load('game/data/props.js');

// a world that records what it is asked to do
function world(more = {}) {
  const log = { sound: [], noise: [], light: 0, explode: [], said: [] };
  const w = {
    time: 0, timers: [], events: new EventBus(), props: [], enemies: [], chars: [], uses: new Uses(),
    player: { isPlayer: true, alive: true, x: 0, y: 0 },
    particles: { drops() {}, sparks() {}, glass() {}, smoke() {}, fire() {}, dust() {} },
    sound: (name, x, y, v, o) => log.sound.push(name), noise: (x, y, r, s, t) => log.noise.push({ r, t }), light: () => log.light++,
    shake() {}, explode: (x, y, o) => log.explode.push({ x, y, ...o }), lineOfSight: () => true,
    after(s, fn) { this.timers.push({ t: this.time + s, fn }); }, log, ...more,
  };
  return w;
}
const prop = (type, col, row, more = {}) => ({ type, def: PROPS[type], x: col * TILE, y: row * TILE, dead: false, kick: { vr: 0 }, ...more });
const step = (w, systems, sec) => {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    w.time += 1 / 60;
    for (const s of systems) s.update(1 / 60);
    for (const t of w.timers.splice(0)) (t.t <= w.time ? t.fn() : w.timers.push(t));
  }
};

test('uses: the nearest spot in reach that can be used now, its label; a prop\'s spot goes with it', () => {
  const u = new Uses(), ch = { x: 100, y: 100 };
  const juke = { x: 110, y: 100, dead: false };
  u.add({ kind: 'a', x: 100 + USE.reach + 5, y: 100, label: 'FAR', use() {} });
  const b = u.add({ kind: 'b', x: 112, y: 100, label: () => 'NEAR', ok: () => true, use() {} });
  assert.equal(u.near(ch), b);
  assert.equal(u.label(b), 'NEAR');
  const j = u.add({ kind: 'j', prop: juke, r: 20, label: 'TURN IT UP', use() {} });
  assert.equal(u.near(ch), j, 'the jukebox is closer');
  juke.dead = true;
  assert.equal(u.near(ch), b, 'gone with its prop');
  b.ok = () => false;
  assert.equal(u.near(ch), null);
});

test('slips: running on a slick floor, a fall at the odds every stride; walking never', () => {
  const t = { d: 0 };
  assert.equal(slips(t, 1, 1, 1, 0), false, 'walking');
  assert.equal(t.d, 0);
  let fell = 0;
  for (let i = 0; i < 20; i++) if (slips(t, 2.5, 2.5, 1, 0)) fell++;
  assert.equal(fell, Math.floor((20 * 2.5) / SLIP.stride), 'one roll per stride, sure odds: down every time');
  assert.equal(slips({ d: 99 }, 2.5, 2.5, 0.2, 0.5), false, 'odds missed');
});

test('slips: a guard running across beer goes down dazed, one walking does not, a customer trips, the player slides', () => {
  const w = world({ map: null });
  w.liquids = new Liquids(w);
  w.liquids.feed(200, 200, 30000, 'beer', 90);
  const runner = { isEnemy: true, alive: true, x: 120, y: 200, moving: 2.4, fell: null, slip(a) { this.fell = a; } };
  const walker = { isEnemy: true, alive: true, x: 200, y: 240, moving: 1, slip() { assert.fail('walking'); } };
  const civ = { isCivilian: true, alive: true, x: 200, y: 170, moving: 2, trip() { this.tripped = true; } };
  const pl = { isPlayer: true, alive: true, x: 230, y: 230, moving: 2.95, slip(a) { this.fell = a; } };
  w.chars = [runner, walker, civ, pl];
  const s = new Slips(w, { ...SLIP, odds: { player: 1, enemy: 1, civilian: 1 } });
  for (let i = 0; i < 30; i++) {
    runner.x += 2.4; walker.y += 1; civ.x += 2; pl.x -= 2.95;
    s.update();
  }
  assert.ok(Math.abs(runner.fell) < 0.01, 'down along his run (east)');
  assert.ok(civ.tripped);
  assert.ok(Math.abs(Math.abs(pl.fell) - Math.PI) < 0.01, 'the player, running west');
  assert.ok(w.log.noise.length >= 3, 'a fall is heard');
  // water is not slick enough to fall on
  const w2 = world({ map: null });
  w2.liquids = new Liquids(w2);
  w2.liquids.feed(200, 200, 30000, 'water', 90);
  const r2 = { isEnemy: true, alive: true, x: 120, y: 200, moving: 2.4, slip() { assert.fail('water'); } };
  w2.chars = [r2];
  const s2 = new Slips(w2, { ...SLIP, odds: { enemy: 1 } });
  for (let i = 0; i < 30; i++) { r2.x += 2.4; s2.update(); }
});

test('sprinklers: heads over the rooms; pulled: the bell, rain, a slick floor, fires out, customers run; once', () => {
  assert.equal(heads([[15, 12, 28, 19]], 3.2).length, 4 * 3);
  const box = prop('fire_alarm', 24, 12.07);
  const panics = [];
  const fires = [{ x: 20 * TILE, y: 15 * TILE }, { x: 40 * TILE, y: 15 * TILE }];
  const w = world({
    props: [box], ambient: { panicAround: (x, y, r) => panics.push(r) },
    fires: { lit: () => fires, douse(where) { for (let i = fires.length - 1; i >= 0; i--) if (where(fires[i].x, fires[i].y)) fires.splice(i, 1); } },
    liquids: { fed: 0, feed(x, y, a, kind) { this.fed += a; assert.equal(kind, 'water'); } },
  });
  // a fire already in the rooms would set it off: none at first
  fires.shift();
  const sp = new Sprinklers(w, { pull: [24, 12.07], rooms: [[15, 12, 28, 19]] });
  step(w, [sp], 1);
  assert.equal(sp.on, false);
  assert.equal(sp.grip(20 * TILE, 15 * TILE), 1);
  const spot = w.uses.near({ x: 24 * TILE, y: 12.5 * TILE });
  assert.equal(spot?.kind, 'fire_alarm');
  fires.push({ x: 20 * TILE, y: 15 * TILE });
  spot.use(w.player);
  assert.equal(sp.on, true);
  assert.equal(panics.length, 1, 'the customers run');
  step(w, [sp], 3);
  assert.ok(w.log.sound.filter((n) => n === 'fireBell').length >= 5, 'the bell');
  assert.ok(w.log.noise.length >= 1, 'heard by the guards');
  assert.ok(w.liquids.fed > 0, 'water on the floor');
  assert.equal(sp.grip(20 * TILE, 15 * TILE), SPRINKLERS.grip, 'slick in the rooms');
  assert.equal(sp.grip(40 * TILE, 15 * TILE), 1, 'not outside them');
  assert.deepEqual(fires.map((f) => f.x), [40 * TILE], 'the fire inside is out, the one outside burns on');
  assert.equal(w.uses.near({ x: 24 * TILE, y: 12.5 * TILE }), null, 'pulled once');
  // the station shot off: the bell stops, the rain does not
  box.dead = true;
  const bells = w.log.sound.filter((n) => n === 'fireBell').length;
  step(w, [sp], 2);
  assert.equal(w.log.sound.filter((n) => n === 'fireBell').length, bells);
  step(w, [sp], SPRINKLERS.spray + SPRINKLERS.dry + 1);
  assert.equal(sp.grip(20 * TILE, 15 * TILE), 1, 'dry again');
});

test('sprinklers: a blast in the rooms sets them off, a fire in them too', () => {
  const w = world({ props: [prop('fire_alarm', 24, 12.07)], fires: { lit: () => [], douse() {} }, liquids: { feed() {} } });
  const sp = new Sprinklers(w, { pull: [24, 12.07], rooms: [[15, 12, 28, 19]] });
  w.events.emit('explosion', { x: 40 * TILE, y: 15 * TILE, radius: 90 });
  assert.equal(sp.on, false);
  w.events.emit('explosion', { x: 18 * TILE, y: 15 * TILE, radius: 90 });
  assert.equal(sp.on, true);
  const w2 = world({ props: [prop('fire_alarm', 24, 12.07)], fires: { lit: () => [{ x: 18 * TILE, y: 13 * TILE }], douse() {} }, liquids: { feed() {} } });
  const sp2 = new Sprinklers(w2, { pull: [24, 12.07], rooms: [[15, 12, 28, 19]] });
  step(w2, [sp2], 0.1);
  assert.equal(sp2.on, true);
});

test('lamp drop: a round through its chains brings it down on whoever is under it, a kill for the shooter', () => {
  assert.ok(under(10, 30, 0, 0, 0, 44, 10, [12, 28]));
  assert.ok(!under(10, 40, 0, 0, 0, 44, 10, [12, 28]));
  assert.ok(under(30, 10, 0, 0, Math.PI / 2, 44, 10, [12, 28]), 'turned with it');
  const shooter = { isPlayer: true };
  const kills = [];
  const man = (x, y) => ({ alive: true, x, y, kill(a, cause, killer, by, how) { this.alive = false; kills.push({ cause, killer, how }); } });
  const under1 = man(800, 420), away = man(800, 500);
  const table = { x: 800, y: 400, dead: false, def: {}, hits: 0, hit() { this.hits++; } };
  const body = globalThis.Matter.Bodies.rectangle(800, 400, 44, 10, { isStatic: true });
  const lamp = { get x() { return body.position.x; }, get y() { return body.position.y; }, W: 44, H: 10, def: PROPS.pool_lamp, kick: { vr: 0 }, rec: {}, body,
    broke: 0, break() { this.broke++; } };
  const w = world({ chars: [under1, away], props: [lamp, table], lastShot: { owner: shooter } });
  const ld = new LampDrop(w);
  w.events.emit('propHit', { prop: table, dirA: 0, kind: 'bullet' });
  assert.equal(ld.falls.length, 0, 'only what hangs by chains');
  w.events.emit('propHit', { prop: lamp, dirA: Math.PI / 2, kind: 'blunt' });
  assert.equal(ld.falls.length, 0, 'a blow swings it');
  w.events.emit('propHit', { prop: lamp, dirA: Math.PI / 2, kind: 'bullet' });
  assert.ok(lamp.falling && lamp.sputter);
  step(w, [ld], 0.5);
  assert.equal(lamp.falling, null);
  assert.equal(lamp.lightsOut, true);
  assert.equal(lamp.broke, 1);
  assert.equal(table.hits, 1, 'the table takes the blow');
  assert.equal(under1.alive, false);
  assert.equal(away.alive, true);
  assert.deepEqual(kills, [{ cause: 'melee', killer: shooter, how: { crushed: true } }]);
});

test('passage: E at one trapdoor, dark, hidden, out of the other one', () => {
  assert.equal(darkAt(0), 0);
  assert.equal(darkAt(PASSAGE.down + PASSAGE.under / 2), 1);
  assert.equal(darkAt(PASSAGE.down + PASSAGE.under + PASSAGE.up), 0);
  const w = world({ camera: { snap() {} } });
  const body = globalThis.Matter.Bodies.circle(35.5 * TILE, 18 * TILE, 10);
  const p = { isPlayer: true, alive: true, body, get x() { return body.position.x; }, get y() { return body.position.y; }, steer() {} };
  new Passage(w, [[35.55, 17.95], [25.75, 10.35]]);
  const spot = w.uses.near(p);
  assert.equal(spot.kind, 'trapdoor');
  spot.use(p);
  assert.ok(p.passage);
  let hidden = false;
  for (let i = 0; i < 60 * 3 && p.passage; i++) { p.passage.step(1 / 60); hidden ||= p.hidden; }
  assert.equal(p.passage, null);
  assert.ok(hidden, 'unseen while down there');
  assert.equal(p.hidden, false);
  assert.ok(Math.hypot(p.x - 25.75 * TILE, p.y - 10.35 * TILE) < 1, 'out under the rug');
});

test('phones: the booth calls, the nearest calm guard leaves his post to answer, then goes back; it rings out alone', () => {
  const booth = prop('phone_booth', 32.6, 31.61), phone = prop('wall_phone', 20.5, 12.07);
  const guard = (x, y, more = {}) => ({
    alive: true, x: x * TILE, y: y * TILE, sendable: true, aware: 0, said: [],
    errandTo(spot, act, t) { this.errand = spot; this.activity = act; this.t = t; },
    say(k) { this.said.push(k); }, ...more,
  });
  const near = guard(17, 12.5), far = guard(17, 12.5 + PHONES.near + 1), boss = guard(19, 12.5, { sendable: false });
  const w = world({ props: [booth, phone], enemies: [far, near, boss] });
  assert.equal(answerer(w.enemies, phone.x, phone.y, PHONES.near * TILE), near);
  const ph = new Phones(w, { booth: [32.6, 31.61], rings: [[20.5, 12.07, 0]] });
  const spot = w.uses.near({ x: 32.6 * TILE, y: 31 * TILE });
  assert.equal(spot.kind, 'phone_booth');
  spot.use(w.player);
  assert.equal(w.uses.near({ x: 32.6 * TILE, y: 31 * TILE }), null, 'no second call at once');
  step(w, [ph], PHONES.dial + 0.5);
  assert.ok(w.log.sound.includes('phoneRing'));
  assert.equal(near.errand?.face, -Math.PI / 2, 'facing the phone on its wall');
  assert.ok(Math.abs(near.errand.y - (12.07 * TILE + 15)) < 0.01, 'in front of it');
  assert.equal(far.errand, undefined);
  near.atPost = true;
  step(w, [ph], 0.1);
  assert.deepEqual(near.said, ['phone']);
  near.errand = null; // done with it: back to his post
  step(w, [ph], 0.1);
  assert.equal(ph.call, null);
  assert.deepEqual(near.said, ['phone', 'hangup']);
  // nobody free to go: it rings out
  w.time += PHONES.again;
  near.sendable = false;
  w.uses.near({ x: 32.6 * TILE, y: 31 * TILE }).use(w.player);
  step(w, [ph], PHONES.dial + PHONES.ring + 1);
  assert.equal(ph.call, null);
});

test('jukebox: turned up it drowns the small noises around it for a while, never a gunshot; the Director listens to it', () => {
  assert.equal(masked(100, 'footsteps', 50), 100 * JUKEBOX.mask);
  assert.equal(masked(100, 'gunshot', 50), 100);
  assert.equal(masked(100, 'footsteps', JUKEBOX.cover + 1), 100);
  const juke = prop('jukebox', 22.6, 19.6);
  const heard = [];
  const g = { alive: true, aware: 0, x: juke.x + 150, y: juke.y, hear: (t) => heard.push(t), say() {} };
  const w = world({ props: [juke], enemies: [g], gadgets: { tune: () => 1 } });
  const j = new Jukebox(w);
  w.jukebox = j;
  step(w, [j], 0.1);
  const spot = w.uses.near({ x: juke.x, y: juke.y - 18 });
  assert.equal(spot.kind, 'jukebox');
  const d = new Director(w);
  d.emit('footsteps', juke.x + 20, juke.y, 200);
  assert.deepEqual(heard, ['footsteps'], 'heard while it plays its murmur');
  spot.use(w.player);
  step(w, [j], 1);
  assert.ok(j.level() > 0.5);
  d.emit('footsteps', juke.x + 20, juke.y, 200);
  d.emit('gunshot', juke.x + 20, juke.y, 200);
  assert.deepEqual(heard, ['footsteps', 'gunshot'], 'his steps are lost in it, a shot is not');
  step(w, [j], JUKEBOX.dur);
  assert.equal(j.level(), 0);
  assert.equal(w.uses.near({ x: juke.x, y: juke.y - 18 }), null, 'not again at once');
  step(w, [j], JUKEBOX.again + 0.1);
  juke.sputter = true; // knocked off its record
  assert.equal(w.uses.near({ x: juke.x, y: juke.y - 18 }), null);
});

test('gas tap: open, the room fills; a shot in the cloud blows it, bigger the fuller; outside it, nothing', () => {
  const oven = prop('oven', 17.1, 6.38);
  const w = world({ props: [oven] });
  const g = new GasValve(w);
  step(w, [g], 0.1);
  const spot = w.uses.near({ x: oven.x, y: oven.y + 20 });
  assert.equal(w.uses.label(spot), 'OPEN THE GAS');
  spot.use(w.player);
  assert.equal(w.uses.label(spot), 'SHUT THE GAS');
  w.events.emit('shot', { shooter: { x: oven.x, y: oven.y + 30 } });
  assert.equal(w.log.explode.length, 0, 'nothing out yet');
  step(w, [g], GAS_VALVE.fill / 2);
  const tap = g.taps[0], R = reach(tap.gas);
  assert.ok(tap.gas > 0.45 && tap.gas < 0.55 && R > 60);
  assert.ok(w.log.sound.includes('hiss'));
  assert.equal(g.heat().length, 1, 'the air shimmers over it');
  w.events.emit('shot', { shooter: { x: oven.x + R + 20, y: oven.y } });
  assert.equal(w.log.explode.length, 0, 'a shot outside the cloud');
  w.events.emit('shot', { shooter: { x: oven.x + R - 10, y: oven.y } });
  assert.equal(w.log.explode.length, 1);
  assert.ok(Math.abs(w.log.explode[0].radius - (GAS_VALVE.blast + GAS_VALVE.extra * tap.gas)) < 1e-9 || w.log.explode[0].radius > GAS_VALVE.blast);
  assert.equal(tap.blown, true);
  w.events.emit('explosion', { x: oven.x, y: oven.y, radius: 100 });
  assert.equal(w.log.explode.length, 1, 'once');
  // shut again before anything: it thins away
  const w2 = world({ props: [prop('oven', 17.1, 6.38)] });
  const g2 = new GasValve(w2);
  step(w2, [g2], 0.1);
  const s2 = w2.uses.spots[0];
  s2.use(w2.player);
  step(w2, [g2], 5);
  s2.use(w2.player);
  step(w2, [g2], GAS_VALVE.fill * 2);
  assert.equal(g2.taps[0].gas, 0);
});

test('camera: the guard at the monitor sees an armed stranger in the room and raises the alert; blind, it is snow', () => {
  assert.deepEqual(inPicture(15, 25, { x0: 10, y0: 20, x1: 30, y1: 30 }), { u: 0.25, v: 0.5 });
  assert.equal(inPicture(5, 25, { x0: 10, y0: 20, x1: 30, y1: 30 }), null);
  const cam = prop('cctv', 27.6, 12.12), mon = prop('monitor', 26.7, 6.4);
  const boss = { alive: true, aware: 0, x: mon.x + 50, y: mon.y, said: [], say(k) { this.said.push(k); } };
  const calls = [];
  const w = world({ props: [cam, mon], enemies: [boss], player: { alive: true, x: 20 * TILE, y: 15 * TILE, armed: false } });
  w.director = { isThreat: (p) => p.armed, sighted: (x, y) => calls.push('sighted'), shout: () => calls.push('shout') };
  const c = new Camera(w, { cam: [27.6, 12.12, 45], view: [15, 12, 28, 19], monitor: [26.7, 6.4] });
  step(w, [c], 3);
  assert.ok(mon.feed && mon.feed.u > 0 && mon.feed.u < 1, 'he is on the screen');
  assert.ok(cam.pan !== undefined);
  assert.deepEqual(calls, [], 'a customer: nothing to say');
  w.player.armed = true;
  step(w, [c], CAMERA.spot + 0.2);
  assert.deepEqual(calls, ['sighted', 'shout']);
  assert.deepEqual(boss.said, ['camera']);
  cam.dead = true;
  step(w, [c], 0.1);
  assert.equal(mon.blind, true);
  assert.equal(mon.feed, null);
});

test('level 1: its devices are where they work (a prop at each spot, the passage across the street)', () => {
  const near = (type, [c, r]) => level1.props.some(([t, x, y]) => t === type && Math.hypot(x - c, y - r) < 1);
  assert.ok(near('fire_alarm', level1.sprinklers.pull));
  assert.ok(level1.phones.rings.every(([c, r]) => near('wall_phone', [c, r])));
  assert.ok(near('phone_booth', level1.phones.booth));
  assert.ok(near('cctv', level1.camera.cam) && near('monitor', level1.camera.monitor));
  assert.equal(level1.passage.length, 2);
  assert.ok(level1.props.filter(([t]) => t === 'keg').length >= 2);
  assert.ok(level1.props.some(([t]) => t === 'oven') && PROPS.oven.valve);
});
