import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { AMBIENCE, TILE } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: Ambience, zoneMap, hearing } = await load('game/systems/Ambience.js');
const { ZONES, PROP_BEDS, CARS } = await load('game/data/soundscape.js');
const { PROPS } = await load('game/data/props.js');
const { default: level1 } = await load('game/data/levels/level1.js');
const { BEDS, renderBed, finish, renderLaugh } = await load('audio/Beds.js');
const { META } = await load('audio/Audio.js');

// a bar (with its front door on the street), toilets and an office behind it; the street and a road below
const ROWS = [
  'XXXXXXXXXXXX',
  'X....X++X;;X',
  'X....D++X;;X',
  'X....X++X;;X',
  'XXDXXXXXXXXX',
  'ssssssssssss',
  '============',
  '============',
];
const ZONED = [['bar', 1, 1, 4, 3], ['toilets', 6, 1, 7, 3], ['office', 9, 1, 10, 3]];
const at = (c, r) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE });

// a world on that map: every sound and every mix handed over is recorded
function stub({ rain = 0.5, where = at(2, 2) } = {}) {
  const heard = [], mixes = [];
  const world = {
    events: new EventBus(), map: new TileMap(ROWS), level: { soundscape: { rain, zones: ZONED } },
    player: { ...where }, props: [], civilians: [], enemies: [], power: null, ambient: null, walled: false,
    walledOff() { return this.walled; },
    sound: (name, x, y, vol, opts) => heard.push({ name, x, y, vol, ...opts }),
    atmosphere: (m) => mixes.push(JSON.parse(JSON.stringify(m))),
  };
  const amb = new Ambience(world);
  const run = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) amb.update(1 / 60); };
  const bed = (name) => mixes.at(-1)?.beds[name];
  return { world, amb, heard, mixes, run, bed, of: (name) => heard.filter((h) => h.name === name) };
}
const prop = (type, x, y, more = {}) => ({ type, def: PROPS[type], x, y, dead: false, ...more });
const patron = (x, y, activity = 'drink', state = 'stop') => ({ alive: true, post: { x, y, face: 0 }, x, y, voice: 1.1, brain: { state, activity } });

test('soundscape: every place a level names is known, with beds that exist and events that can play', () => {
  for (const [, def] of [['level1', level1.soundscape]]) for (const [kind] of def.zones) assert.ok(ZONES[kind], kind);
  for (const [kind, z] of Object.entries(ZONES)) {
    assert.ok(['open', 'warm', 'small', 'tiled'].includes(z.room), kind);
    for (const b of Object.keys(z.beds)) assert.ok(BEDS[b], `${kind}: bed ${b}`);
    for (const e of z.events) {
      for (const name of typeof e.sound === 'string' ? [e.sound] : Object.keys(e.sound)) assert.ok(META[name], `${kind}: ${name}`);
      assert.ok(e.every[0] > 0 && e.every[1] >= e.every[0], `${kind}: ${e.sound}`);
    }
  }
  for (const pb of PROP_BEDS) assert.ok(BEDS[pb.bed], pb.bed);
  assert.ok(BEDS.engine && CARS.slots >= 1);
});

test('ambience: the places of level 1 come from its data, the rest by the floor (street, roof, room)', () => {
  const zm = zoneMap(new TileMap(level1.tiles), level1.soundscape);
  const kind = (c, r) => zm.kinds[r * zm.w + c];
  assert.deepEqual([kind(20, 15), kind(26, 18), kind(21, 8), kind(26, 8), kind(16, 8)], ['bar', 'vip', 'toilets', 'office', 'kitchen']);
  assert.deepEqual([kind(20, 2), kind(12, 10), kind(20, 34), kind(5, 18), kind(27, 34)], ['lot', 'lot', 'alley', 'shop', 'shop']);
  assert.deepEqual([kind(10, 25), kind(5, 10)], ['street', 'roof']);
  assert.equal(kind(21, 20), null, 'a doorway belongs to neither side');
  assert.equal(kind(0, 0), null, 'nor does a wall');
});

test('ambience: where he stands is heard in full, the places around through their walls, muffled the further', () => {
  const zm = zoneMap(new TileMap(ROWS), { zones: ZONED });
  const inBar = hearing(zm, 3, 2, null);
  assert.equal(inBar.at, 'bar');
  assert.deepEqual(inBar.heard.bar, { p: 1, pan: 0, inside: true });
  assert.ok(inBar.heard.street.p > 0 && inBar.heard.street.p < AMBIENCE.through, 'the street through the facade');
  const nextDoor = hearing(zm, 4, 2, null);
  assert.equal(inBar.heard.toilets, undefined, 'the toilets are too far to hear');
  assert.ok(nextDoor.heard.toilets.p > 0, 'next to them, they are heard');
  assert.ok(nextDoor.heard.toilets.pan > 0, 'from their side');
  assert.equal(hearing(zm, 5, 2, 'bar').at, 'bar', 'in the doorway he is still where he was');
  const far = hearing(zm, 11, 7, null);
  assert.equal(far.heard.bar, undefined, 'out of earshot');
});

test('ambience: walking in from the street crossfades the beds and the room, no jump', () => {
  const s = stub({ where: at(2, 6) });
  s.run(3);
  assert.ok(s.bed('city').gain > 0.4 * ZONES.street.beds.city && s.bed('rain').gain > 0);
  assert.equal(s.mixes.at(-1).room.open, 1);
  Object.assign(s.world.player, at(2, 2));
  s.run(0.2);
  const mid = s.bed('city').gain;
  assert.ok(mid < ZONES.street.beds.city && mid > ZONES.street.beds.city * 0.2, 'not cut off at the door: ' + mid);
  assert.ok(s.mixes.at(-1).room.warm > 0 && s.mixes.at(-1).room.warm < 1);
  s.run(4);
  const city = s.bed('city');
  assert.ok(city.gain < ZONES.street.beds.city * AMBIENCE.through, 'the street is behind the facade now');
  assert.ok(Math.abs(city.lp - AMBIENCE.muffle) < 30, 'muffled: ' + city.lp);
  assert.ok(s.mixes.at(-1).room.warm > 0.95);
  assert.ok(s.bed('rain').lp < ZONES.bar.beds.rain.lp + 10, 'the rain on the roof, dull');
});

test('ambience: the bar talks while its customers sit at ease, louder the more of them, and falls silent when they panic', () => {
  const s = stub();
  s.run(3);
  assert.equal(s.bed('talkA'), undefined, 'an empty bar');
  s.world.civilians.push(patron(...Object.values(at(2, 2))));
  s.run(3);
  const one = s.bed('talkA').gain;
  assert.ok(one > 0 && s.bed('talkB') === undefined);
  for (let i = 0; i < 5; i++) s.world.civilians.push(patron(...Object.values(at(1 + (i % 4), 1 + (i % 3)))));
  s.run(3);
  assert.ok(s.bed('talkA').gain > one * 2 && s.bed('talkB').gain > 0, 'a full room');
  for (const c of s.world.civilians) c.brain.state = 'panic';
  s.run(0.3);
  assert.ok(s.bed('talkA').gain > 0, 'it dies down, it is not cut');
  s.run(4);
  assert.ok(!s.bed('talkA') || s.bed('talkA').gain < 0.01, 'silence');
});

test('ambience: the bar life comes from its customers and its bartender, and stops with them', () => {
  const s = stub();
  const p = at(2, 2);
  s.world.civilians.push(patron(p.x, p.y, 'drink'), patron(p.x + 30, p.y, 'cards'));
  const barman = { alive: true, job: 'wipe', atEase: true, x: at(1, 1).x, y: at(1, 1).y };
  s.world.enemies.push(barman);
  s.run(60);
  const names = new Set(s.heard.map((h) => h.name));
  for (const n of ['clink', 'laugh', 'ice']) assert.ok(names.has(n), n);
  assert.ok(['bottle', 'pour', 'till'].some((n) => names.has(n)), 'the bartender at work');
  const laugh = s.of('laugh')[0];
  assert.ok(Math.abs(laugh.x - p.x) < 50 && laugh.pitch === 1.1, 'from a customer, in his voice');
  for (const c of s.world.civilians) c.brain.state = 'flee';
  barman.atEase = false;
  const before = s.heard.length;
  s.run(60);
  assert.equal(s.heard.slice(before).filter((h) => ['clink', 'laugh', 'ice', 'bottle', 'pour', 'till'].includes(h.name)).length, 0);
});

test('ambience: the radio and what hums die with the power, broken or dark props are silent', () => {
  const s = stub({ where: at(9, 2) });
  s.world.power = { on: true, inside: (x, y) => y < 4 * TILE };
  s.world.props.push(prop('fridge', at(10, 1).x, at(10, 1).y), prop('neon_sign_bar', at(9, 3).x, at(9, 3).y, { lightsOut: true }));
  s.run(3);
  assert.ok(s.bed('radio').gain > 0 && s.bed('fridge').gain > 0);
  assert.equal(s.bed('neon'), undefined, 'a dark sign');
  s.world.power.on = false;
  s.run(5);
  assert.ok(!s.bed('radio') || s.bed('radio').gain < 0.01);
  assert.ok(!s.bed('fridge') || s.bed('fridge').gain < 0.01);
});

test('ambience: a prop is heard from its side, nearest first, muffled through a wall; rain drums on a parked car', () => {
  const s = stub({ where: at(2, 6) });
  s.world.props.push(prop('neon_sign_bar', at(5, 5).x, at(5, 5).y), prop('neon_sign_palm', at(9, 5).x, at(9, 5).y));
  s.world.props.push({ type: 'car', isVehicle: true, moving: false, x: at(0, 7).x, y: at(0, 7).y, dead: false });
  s.run(3);
  const neon = s.bed('neon');
  assert.ok(neon.gain > 0 && neon.pan > 0 && neon.lp === AMBIENCE.open);
  assert.ok(s.bed('rainMetal').gain > 0 && s.bed('rainMetal').pan < 0);
  s.world.walled = true;
  s.run(3);
  assert.ok(s.bed('neon').gain < neon.gain && Math.abs(s.bed('neon').lp - AMBIENCE.props.muffle) < 50);
  const dry = stub({ rain: 0, where: at(2, 6) });
  dry.world.props.push({ type: 'car', isVehicle: true, x: at(0, 7).x, y: at(0, 7).y, dead: false });
  dry.run(2);
  assert.equal(dry.bed('rainMetal'), undefined, 'no rain, no drumming');
});

test('ambience: the traffic car by car: a voice each, kept while it passes, higher coming than going', () => {
  const s = stub({ where: at(6, 5) });
  const car = (x, dir, type = 'car') => ({ v: { x, y: at(0, 6).y, type, body: { angle: dir > 0 ? 0 : Math.PI } }, d: { speed: 300 } });
  const coming = car(at(0, 6).x, 1), going = car(at(11, 6).x, 1, 'van'), far = car(-5000, 1);
  s.world.ambient = { cars: [coming, going, far] };
  s.run(0.5);
  const voices = Object.entries(s.mixes.at(-1).beds).filter(([, b]) => b.bed === 'engine');
  assert.equal(voices.length, 2, 'the far one is not heard');
  const voiceOf = (c) => s.amb.slots.indexOf(c);
  const a = s.bed('car' + voiceOf(coming)), b = s.bed('car' + voiceOf(going));
  assert.ok(a.rate > CARS.rate.car * 1.0001, 'coming: pitched up ' + a.rate);
  assert.ok(b.rate < CARS.rate.van, 'going: pitched down');
  assert.ok(a.pan < 0 && b.pan > 0);
  const slot = voiceOf(coming);
  coming.v.x = at(8, 6).x;
  s.run(0.5);
  assert.equal(voiceOf(coming), slot, 'it keeps its voice');
  assert.ok(s.bed('car' + slot).rate < CARS.rate.car, 'past him now');
});

test('ambience: far sirens and horns from across the city, muffled from indoors', () => {
  const s = stub({ where: at(6, 6) });
  s.run(400);
  const far = s.heard.filter((h) => h.name === 'siren' || h.name === 'horn');
  assert.ok(far.length >= 3, 'now and then: ' + far.length);
  assert.ok(far.every((h) => h.x === undefined && h.distant > 0 && !h.occ));
  const t = stub();
  t.run(400);
  const muffled = t.heard.filter((h) => h.name === 'horn' || h.name === 'siren');
  assert.ok(muffled.every((h) => h.occ), 'through the walls of the bar');
});

test('ambience: a leaking pipe drips, and only close by', () => {
  const s = stub({ where: at(6, 6) });
  s.world.props.push(prop('pipe_water', at(6, 6).x + 100, at(6, 6).y));
  s.run(12);
  const n = s.of('drip').length;
  assert.ok(n >= 3 && n <= 16, 'a drop every second or three: ' + n);
  const t = stub({ where: at(6, 6) });
  t.world.props.push(prop('pipe_water', 5000, 0));
  t.run(12);
  assert.equal(t.of('drip').length, 0);
});

test('ambience: a gust of wind is heard, less from indoors', () => {
  const s = stub({ where: at(6, 6) });
  s.run(3);
  s.world.events.emit('gust', { dx: 1, dy: 0, f: 1 });
  Object.assign(s.world.player, at(2, 2));
  s.run(10);
  s.world.events.emit('gust', { dx: -1, dy: 0, f: 1 });
  const g = s.of('gust');
  assert.equal(g.length, 2);
  assert.ok(g[1].vol < g[0].vol * 0.5);
  assert.deepEqual([g[0].pan, g[1].pan], [1, -1]);
});

test('beds: every bed renders a clean seamless loop at one loudness, in small slices', () => {
  for (const name of Object.keys(BEDS)) {
    const gen = renderBed(name, 3);
    let slices = 0, s;
    while (!(s = gen.next()).done) slices++;
    const { sr, data } = s.value;
    assert.ok(slices >= 1, name);
    assert.equal(data.length, BEDS[name].ch || 1);
    let sum = 0, n = 0, jump = 0, step = 0;
    for (const c of data) {
      assert.equal(c.length, Math.round(BEDS[name].len * sr), name);
      for (let i = 0; i < c.length; i++) { assert.ok(Number.isFinite(c[i]), name); sum += c[i] * c[i]; n++; if (i) step += Math.abs(c[i] - c[i - 1]); }
      jump = Math.max(jump, Math.abs(c[0] - c[c.length - 1]));
    }
    const rms = Math.sqrt(sum / n);
    assert.ok(Math.abs(rms - 0.1) < 0.002, `${name}: rms ${rms}`);
    assert.ok(jump < 8 * (step / n) + 0.02, `${name}: a click at the seam (${jump})`);
  }
  assert.deepEqual(finish(renderBed('mains', 9)).data[0].slice(0, 50), finish(renderBed('mains', 9)).data[0].slice(0, 50), 'seeded');
  const laugh = renderLaugh(5, true);
  assert.ok(laugh.length > 0.3 * 22050 && laugh.every(Number.isFinite));
});
