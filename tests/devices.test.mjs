// The level's devices (data/devices.js): what E reaches, the slick floor, the fire alarm, the passage,
// the jukebox, the gas tap. Each on a stub world (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { USE, SLIP, SPRINKLERS, JUKEBOX, GAS_VALVE, PASSAGE } = await load('game/data/devices.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Uses } = await load('game/systems/Uses.js');
const { default: Slips, slips } = await load('game/systems/Slips.js');
const { default: Sprinklers, heads } = await load('game/systems/Sprinklers.js');
const { default: Passage, darkAt } = await load('game/systems/Passage.js');
const { default: Jukebox, masked } = await load('game/systems/Jukebox.js');
const { default: GasValve, reach } = await load('game/systems/GasValve.js');
const { default: Liquids } = await load('game/systems/Liquids.js');
const { default: TileMap } = await load('game/world/TileMap.js');
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
// an open room of tiled floor, 16 x 12 tiles (for the liquid on the floor)
const room = () => new TileMap(['#'.repeat(16), ...Array(10).fill('#' + ','.repeat(14) + '#'), '#'.repeat(16)]);
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
  const w = world({ map: room(), level: {}, doors: [], corpses: [] });
  w.liquids = new Liquids(w);
  w.liquids.feed(200, 200, 30000, 'beer', 60);
  for (let i = 0; i < 90; i++) w.liquids.sim.step(1 / 30);
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
  const w2 = world({ map: room(), level: {}, doors: [], corpses: [] });
  w2.liquids = new Liquids(w2);
  w2.liquids.feed(200, 200, 30000, 'water', 60);
  for (let i = 0; i < 90; i++) w2.liquids.sim.step(1 / 30);
  const r2 = { isEnemy: true, alive: true, x: 120, y: 200, moving: 2.4, slip() { assert.fail('water'); } };
  w2.chars = [r2];
  const s2 = new Slips(w2, { ...SLIP, odds: { enemy: 1 } });
  for (let i = 0; i < 30; i++) { r2.x += 2.4; s2.update(); }
});

test('sprinklers: heads over the rooms; pulled: the bell, rain on the floor, fires out, customers run; once', () => {
  assert.equal(heads([[15, 12, 28, 19]], 3.2).length, 4 * 3);
  const box = prop('fire_alarm', 24, 12.07);
  const panics = [];
  const fires = [{ x: 20 * TILE, y: 15 * TILE }, { x: 40 * TILE, y: 15 * TILE }];
  const w = world({
    props: [box], ambient: { panicAround: (x, y, r) => panics.push(r) },
    fires: { lit: () => fires, douse(where) { for (let i = fires.length - 1; i >= 0; i--) if (where(fires[i].x, fires[i].y)) fires.splice(i, 1); } },
    liquids: { fed: 0, sprinkle(x, y, r, a) { this.fed += a; assert.ok(r === SPRINKLERS.cover && this.inRoom(x, y)); }, inRoom: (x, y) => x > 15 * TILE && x < 29 * TILE && y > 12 * TILE && y < 20 * TILE },
  });
  // a fire already in the rooms would set it off: none at first
  fires.shift();
  const sp = new Sprinklers(w, { pull: [24, 12.07], rooms: [[15, 12, 28, 19]] });
  step(w, [sp], 1);
  assert.equal(sp.on, false);
  assert.equal(w.liquids.fed, 0);
  const spot = w.uses.near({ x: 24 * TILE, y: 12.5 * TILE });
  assert.equal(spot?.kind, 'fire_alarm');
  fires.push({ x: 20 * TILE, y: 15 * TILE });
  spot.use(w.player);
  assert.equal(sp.on, true);
  assert.equal(panics.length, 1, 'the customers run');
  step(w, [sp], 3);
  assert.ok(w.log.sound.filter((n) => n === 'fireBell').length >= 5, 'the bell');
  assert.ok(w.log.noise.length >= 1, 'heard by the guards');
  assert.ok(w.liquids.fed > 0, 'water on the floor of the rooms');
  assert.deepEqual(fires.map((f) => f.x), [40 * TILE], 'the fire inside is out, the one outside burns on');
  assert.equal(w.uses.near({ x: 24 * TILE, y: 12.5 * TILE }), null, 'pulled once');
  // the station shot off: the bell stops, the rain does not
  box.dead = true;
  const bells = w.log.sound.filter((n) => n === 'fireBell').length;
  step(w, [sp], 2);
  assert.equal(w.log.sound.filter((n) => n === 'fireBell').length, bells);
  step(w, [sp], SPRINKLERS.spray + 1);
  const fed = w.liquids.fed;
  step(w, [sp], 2);
  assert.equal(w.liquids.fed, fed, 'the heads run dry');
});

test('sprinklers: a blast in the rooms sets them off, a fire in them too', () => {
  const w = world({ props: [prop('fire_alarm', 24, 12.07)], fires: { lit: () => [], douse() {} }, liquids: { sprinkle() {} } });
  const sp = new Sprinklers(w, { pull: [24, 12.07], rooms: [[15, 12, 28, 19]] });
  w.events.emit('explosion', { x: 40 * TILE, y: 15 * TILE, radius: 90 });
  assert.equal(sp.on, false);
  w.events.emit('explosion', { x: 18 * TILE, y: 15 * TILE, radius: 90 });
  assert.equal(sp.on, true);
  const w2 = world({ props: [prop('fire_alarm', 24, 12.07)], fires: { lit: () => [{ x: 18 * TILE, y: 13 * TILE }], douse() {} }, liquids: { sprinkle() {} } });
  const sp2 = new Sprinklers(w2, { pull: [24, 12.07], rooms: [[15, 12, 28, 19]] });
  step(w2, [sp2], 0.1);
  assert.equal(sp2.on, true);
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
  const oven = prop('oven', 17.1, 6.38, { valve: true });
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
  const w2 = world({ props: [prop('oven', 17.1, 6.38, { valve: true })] });
  const g2 = new GasValve(w2);
  step(w2, [g2], 0.1);
  const s2 = w2.uses.spots[0];
  s2.use(w2.player);
  step(w2, [g2], 5);
  s2.use(w2.player);
  step(w2, [g2], GAS_VALVE.fill * 2);
  assert.equal(g2.taps[0].gas, 0);
});

test('level 1: its devices are where they work (a prop at each spot, the passage across the street)', () => {
  const near = (type, [c, r]) => level1.props.some(([t, x, y]) => t === type && Math.hypot(x - c, y - r) < 1);
  assert.ok(near('fire_alarm', level1.sprinklers.pull));
  assert.equal(level1.passage.length, 2);
  assert.ok(level1.props.filter(([t]) => t === 'keg').length >= 2);
  // the stove's gas tap is left for later levels: no oven of level 1 has one
  assert.ok(level1.props.some(([t]) => t === 'oven') && level1.props.every(([t, , , , o]) => !o?.valve));
  assert.equal(level1.phones, undefined);
  assert.equal(level1.camera, undefined);
});
