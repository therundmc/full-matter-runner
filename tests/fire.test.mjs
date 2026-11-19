import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: FireSpread } = await load('game/systems/FireSpread.js');
const { default: Fires } = await load('game/systems/Fires.js');
const { FIRE } = await load('game/data/fire.js');

const px = (v) => v * TILE;
// a room of tiles ('+' does not burn, '.' boards, ':' carpet, ',' lino) with what the fire asks of a world
function stub(rows, level = {}, props = []) {
  const log = { scorch: 0, sounds: [] };
  const world = {
    map: new TileMap(rows), events: new EventBus(), level, chars: [], props, time: 0, player: { x: 0, y: 0 },
    decals: { scorch() { log.scorch++; } }, sound(n) { log.sounds.push(n); }, light() {},
    particles: { fire() {}, embers() {}, sparks() {} }, smoke: null,
    emit() {}, after() {}, noise() {},
  };
  world.fires = new Fires(world);
  const fire = (world.fireSpread = new FireSpread(world, level));
  const run = (s) => { for (let t = 0; t < s - 1e-9; t += 1 / 60) fire.update(1 / 60); };
  return { world, fire, run, log };
}
const room = (ch) => ['XXXXXXXXXXXXXXXXXXXX', ...Array.from({ length: 8 }, () => `X${ch.repeat(18)}X`), 'XXXXXXXXXXXXXXXXXXXX'];
const ROOM = room('+');

test('fire: it runs along a trail of petrol at its speed, and no further on a floor that does not burn', () => {
  const s = stub(ROOM, { petrol: [[8, [2, 4.5], [16, 4.5]]] });
  s.world.events.emit('matchDrop', { x: px(2), y: px(4.5) });
  assert.equal(s.fire.count().burning, 1, 'the petrol catches where the match falls');
  const reach = () => { let far = 0; for (const i of s.fire.burning) far = Math.max(far, s.fire.at(i).x); return far; };
  s.run(1);
  const d = reach() - px(2), v = FIRE.fuels.petrol.speed;
  assert.ok(d > v * 0.7 && d < v * 1.35, `a second later the front is ${Math.round(d)} px on (about ${v})`);
  assert.ok(s.log.sounds.includes('fireRun'), 'heard running');
  s.run(2);
  assert.ok(reach() > px(15.5), 'to the end of the trail');
  assert.ok(!s.fire.burns(px(8), px(2.5)) && !s.fire.burns(px(8), px(6.5)), 'tiles beside it do not burn');
  s.run(8);
  assert.equal(s.fire.count().burning, 0, 'petrol on tiles flares off');
  assert.ok(s.log.scorch > 10, 'and leaves the floor charred');
  assert.equal(s.world.fires.lit().length, 0, 'its flames are out with it');
});

test('fire: it forks where the trail forks', () => {
  const s = stub(ROOM, { petrol: [[8, [2, 4.5], [9, 4.5]], [8, [9, 4.5], [16, 2.5]], [8, [9, 4.5], [16, 7.5]]] });
  s.fire.ignite(px(2), px(4.5));
  s.run(4);
  const burning = (c, r) => s.fire.state[s.fire.index(px(c), px(r))] > 0;
  assert.ok(burning(15.5, 2.6) && burning(15.5, 7.4), 'both branches');
  assert.ok(!burning(15.5, 4.5), 'not between them');
});

test('fire: a dry floor burns far slower than petrol, carpet quicker than boards, tiles not at all', () => {
  const rows = ['XXXXXXXXXXXXXXXXXXXX', ...Array.from({ length: 8 }, (_, r) => `X${(r < 3 ? ':' : r < 6 ? '.' : '+').repeat(18)}X`), 'XXXXXXXXXXXXXXXXXXXX'];
  const s = stub(rows);
  // how far along a row the fire has got, both ways
  const span = (row) => {
    let lo = Infinity, hi = -Infinity;
    s.fire.state.forEach((st, i) => { const p = s.fire.at(i); if (st > 0 && Math.abs(p.y - px(row)) < 5) { lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); } });
    return hi - lo;
  };
  assert.ok(s.fire.ignite(px(10), px(2.5)) && s.fire.ignite(px(10), px(5.5)));
  assert.equal(s.fire.ignite(px(10), px(8.2)), false, 'nothing to light on tiles');
  s.run(10);
  const carpet = span(2.5), wood = span(5.5), v = FIRE.fuels.carpet.speed;
  assert.ok(carpet > wood, `carpet ${carpet} px, boards ${wood} px`);
  assert.ok(carpet < FIRE.fuels.petrol.speed, 'ten seconds of carpet: less than a second of petrol');
  assert.ok(carpet > 20 * v * 0.5 && carpet < 20 * v * 1.6 + 16, `both ways at about its speed (${carpet} px)`);
});

test('fire: what lies on the floor burns quicker than the floor (a carpet runner)', () => {
  const s = stub(room(','), { floor: [['runner', 6, 4.5, 0], ['runner', 9, 4.5, 0]] });
  s.fire.ignite(px(4.6), px(4.5));
  s.run(10);
  assert.ok(s.fire.state[s.fire.index(px(8), px(4.5))] > 0, 'along the runner');
  assert.equal(s.fire.state[s.fire.index(px(6), px(7))], 0, 'the lino beside it has hardly started');
});

test('fire: furniture it reaches catches by its material, burns and falls apart; metal does not; gas blows', () => {
  const prop = (type, def, col, row) => ({ type, def, x: px(col), y: px(row), W: 20, H: 20, broke: 0, world: null,
    body: { angle: 0, position: { x: px(col), y: px(row) }, bounds: { min: { x: px(col) - 10, y: px(row) - 10 }, max: { x: px(col) + 10, y: px(row) + 10 } } },
    break() { this.broke++; this.dead = true; }, toWorld() { return { x: this.x, y: this.y }; } });
  const sofa = prop('sofa', { material: 'fabric', static: true }, 6, 4.5), fridge = prop('fridge', { material: 'metal' }, 9, 4.5);
  const lamp = prop('ceiling_lamp', { material: 'wood', hung: true }, 12, 4.5), stove = prop('oven', { material: 'metal', gas: { fuse: [1, 1] } }, 15, 4.5);
  const kept = prop('oven', { material: 'metal', gas: { fuse: [1, 1] } }, 17, 4.5);
  kept.staged = true;
  const s = stub(ROOM, { petrol: [[8, [2, 4.5], [17, 4.5]]] }, [sofa, fridge, lamp, stove, kept]);
  for (const p of s.world.props) p.world = s.world;
  s.fire.ignite(px(2), px(4.5));
  s.run(3);
  assert.equal(s.fire.props.length, 3, 'a sofa and two stoves: the fridge and the lamp on the ceiling are not its business');
  assert.equal(s.fire.props[0].state, 1, 'the sofa burns');
  assert.ok(s.world.fires.lit().some((f) => f.x === sofa.x && f.k > 1), 'with a fire of its own');
  assert.ok(stove.gasLeak, 'the stove is pierced by the heat: its fuse runs');
  assert.ok(!kept.gasLeak, 'the one the lesson keeps waits');
  s.run(40);
  assert.equal(sofa.broke, 1, 'burned through, it falls apart');
  assert.equal(fridge.broke + lamp.broke, 0);
});

test('fire: one touch kills, once the cell has caught; not who jumps over it', () => {
  const s = stub(ROOM, { petrol: [[8, [2, 4.5], [16, 4.5]]] });
  const man = (col, row, more) => ({ x: px(col), y: px(row), angle: 0, alive: true, kill(a, cause) { this.alive = false; this.cause = cause; }, ...more });
  const a = man(5, 4.5), b = man(5, 2.5), c = man(7, 4.5, { vaulting: {} });
  s.world.chars.push(a, b, c);
  s.fire.ignite(px(2), px(4.5));
  s.run(1.5);
  assert.ok(!a.alive && a.cause === 'fire', 'standing in the trail');
  assert.ok(b.alive, 'beside it');
  assert.ok(c.alive, 'in the air over it');
});

test('fire: a stage of the lesson with a hold keeps it out of its room, then lets it in; a retry plays it forward', () => {
  // (the second room also keeps the fire off the last two tiles before its door)
  const level = { petrol: [[8, [2, 4.5], [16, 4.5]]], tutorial: { stages: [{ zone: [1, 1, 6, 8] }, { zone: [9, 1, 18, 8], hold: 3, keep: [[7, 4, 8, 4]] }] } };
  const s = stub(ROOM, level);
  s.world.tutorial = { stage: 0 };
  s.fire.ignite(px(2), px(4.5));
  s.run(2);
  const lit = (c) => s.fire.state[s.fire.index(px(c), px(4.5))] > 0;
  assert.ok(lit(6.5) && !lit(7.5) && !lit(9.5), 'the front waits short of the threshold');
  s.world.tutorial.stage = 1;
  s.run(2.5);
  assert.ok(!lit(9.5), 'he walked in: it still holds');
  s.run(1.5);
  assert.ok(lit(7.5) && lit(9.5) && lit(11), 'then it comes in after him');
  // a retry at the second stage: the first room has burned, the second is still held
  const r = stub(ROOM, level);
  r.world.tutorial = { stage: 0 };
  r.fire.restore(1, px(2), px(4.5));
  const at = (c) => r.fire.state[r.fire.index(px(c), px(4.5))];
  assert.ok(at(4) > 0 && at(6.5) > 0 && at(8.5) === 0 && at(9.5) === 0, 'burning up to the threshold');
  assert.ok(r.fire.hot(4 * 20 + 5) && r.fire.hot(4 * 20 + 12) && !r.fire.hot(6 * 20 + 5), 'tiles to keep off: what burns, and the petrol the fire is coming to');
  assert.ok(!r.log.sounds.includes('fireRun'), 'in silence');
});

test('fire: a blast lights what burns about it; water puts it out', () => {
  const s = stub(room('.'), { petrol: [[8, [2, 2]]] });
  assert.equal(stub(room('.')).fire.blast(320, 144, 80), undefined, 'only in a level set to burn');
  s.world.events.emit('explosion', { x: px(10), y: px(4.5), radius: 80 });
  s.run(0.6);
  assert.ok(s.fire.count().burning > 20, 'the boards about it burn');
  assert.ok(s.world.fires.lit().length > 5);
  s.world.fires.douse(() => true);
  assert.equal(s.fire.count().burning, 0);
  assert.equal(s.world.fires.lit().length, 0);
});

test('fires: the flames are shared out, the lights go to the nearest few', () => {
  const calls = { fire: 0, light: 0, sounds: [] };
  const world = { player: { x: 0, y: 0 }, light() { calls.light++; }, sound(n) { calls.sounds.push(n); },
    particles: { fire() { calls.fire++; }, embers() {} } };
  const f = new Fires(world, [[1, 1]]);
  assert.equal(f.lit().length, 1, 'a level fire burns from the start');
  for (let i = 0; i < 400; i++) f.add(i * 3, 0);
  for (let i = 0; i < 60; i++) f.update(1 / 60);
  assert.ok(calls.fire <= FIRE.budget * 2, `${calls.fire} puffs in a second for 400 fires`);
  assert.ok(calls.light <= FIRE.light.max * 10);
  assert.ok(calls.sounds.includes('crackle') && calls.sounds.includes('fireRoar'));
  assert.equal(f.near(0, 0, 3).length, 3);
});

// ---- the fire that follows him (a lesson's `chase`)

// a corridor of lino 30 tiles long, two wide, the chase down its middle from its west end; the lesson's one stage
function corridor(start = 2) {
  const rows = ['X'.repeat(32), `X${','.repeat(30)}X`, `X${','.repeat(30)}X`, 'X'.repeat(32)];
  const level = { tutorial: { stages: [{ zone: [1, 1, 30, 2], spawn: [3, 2, 0] }], chase: { from: 0, path: [[1, 2], [31, 2]], zones: [[1, 1, 30, 2]], start } } };
  const s = stub(rows, level);
  const C = s.fire.chase, at = (c) => { s.world.player = { x: px(c), y: px(2), alive: true }; };
  s.fire.ignite(px(1.5), px(2));
  s.fire.reached[0] = 0;
  return { ...s, C, at, front: () => 1 + C.front / TILE }; // (the tile the front is at: the path starts at tile 1)
}

test('chase: the corridor burns only behind its front, which follows him - running when far, pressing when near, creeping on him', () => {
  const F = FIRE.chase, s = corridor();
  assert.ok(F.run > 177 && F.pace < 177 && F.creep < F.pace / 4, 'quicker than he runs to catch up, slower to follow, a crawl to press');
  s.at(9.5);
  s.run(1);
  assert.ok(Math.abs(s.C.front - (2 * TILE + F.pace)) < 2, 'within `far` of him: it comes on at its pace');
  // the lino would take a minute to burn that far by itself: here it is alight up to the front, and no further
  assert.ok(s.fire.burns(px(4.2), px(1.5)), 'behind the front: burning');
  assert.ok(!s.fire.burns(px(s.front() + 0.6), px(1.5)), 'ahead of it: not yet, whatever natural fire is about');
  const lit = () => { let far = 0; for (const i of s.fire.burning) far = Math.max(far, s.fire.at(i).x); return far / TILE; };
  assert.ok(Math.abs(lit() - s.front()) < 0.6, `the flames are at the front (${lit().toFixed(1)} / ${s.front().toFixed(1)})`);
  // he runs to the far end: it is let go after him
  s.at(27);
  const f0 = s.front();
  s.run(1);
  assert.ok(Math.abs((s.front() - f0) * TILE - F.run) < 2, 'far behind: it runs');
  s.run(60);
  const gap = (27 - 1) * TILE - s.C.front;
  assert.ok(gap < 2 && !s.fire.burns(px(29), px(2)), `left there a minute it is on him (${gap.toFixed(0)} px), and never past the corridor's own pace`);
  // never unfair: from `far` behind it takes this long to reach a man who stops
  const closing = (F.far - F.near) / F.pace + F.near / F.creep;
  assert.ok(closing > 10 && closing < 20, `${closing.toFixed(1)} s to deal with a man in his way`);
  // while he keeps going (from more than `near` ahead of it) it never closes to less than `near`
  const k = corridor();
  let least = Infinity;
  for (let c = 7; c < 28; c += (177 / 60) / TILE) { k.at(c); k.fire.update(1 / 60); least = Math.min(least, px(c - 1) - k.C.front); }
  assert.ok(least >= F.near - 2, `${least.toFixed(0)} px behind him at the nearest`);
});

test('chase: held until its stage is reached, taken up behind him on a retry', () => {
  const s = corridor(3);
  s.fire.reached.length = 0;
  s.at(20);
  s.run(3);
  assert.equal(s.front(), 4, 'not let go yet: natural fire has its first tiles, no more');
  assert.ok(!s.fire.burns(px(6), px(2)));
  s.fire.reached[0] = s.fire.clock;
  s.run(0.5);
  assert.ok(s.front() > 4);
  // a retry: `far` behind where he starts again
  const r = corridor(3);
  r.at(20);
  r.fire.restore(0, px(1.5), px(2));
  assert.ok(Math.abs(r.C.front - (px(19) - FIRE.chase.far)) < 8 && r.C.on, `${r.C.front}`);
});
