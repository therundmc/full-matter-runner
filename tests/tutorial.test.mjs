import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, PLAYER, ENEMY } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Tutorial, HINTS } = await load('game/systems/Tutorial.js');
const { default: Direction } = await load('game/systems/Direction.js');
const { default: level } = await load('game/data/levels/tutorial.js');
const { ENEMIES } = await load('game/world/Level.js');
const { unsaid } = await load('game/ui/HUD.js');
const { LESSONS, BEAT, RELOAD, OPENING, BLAST, LEAP, SHOTS, FRAME, FORCE, STAIRS } = await load('game/data/staging.js');
const { POSTS } = await load('game/data/posts.js');
const { MATCH_FALLS } = await load('game/ai/Pastimes.js');
const { default: Input } = await load('engine/Input.js');
const { default: Game } = await load('game/Game.js');

const px = (v) => v * TILE;
// a lesson's slow motion played to its end, nothing pressed (its cap at the latest)
const through = (t) => { for (let k = 0; k < 400 && t.lesson; k++) t.pace(0.02, () => false); };
// the living room's table: its mark, its north edge (tiles), its size in px
const TABLE = level.tutorial.stages[1].marks.vault, TABLE_W = 44, TABLE_H = 26, TABLE_TOP = TABLE[1] - TABLE_H / 2 / TILE;
const W = level.tiles[0].length;
// the level's guards as plain objects where its actors layer has them, a player, what the tutorial touches
function stub(from = 0, game = {}) {
  const enemies = [];
  level.actors.forEach((row, r) => [...row].forEach((ch, c) => {
    if (!ENEMIES[ch]) return;
    const g = { tile: `${c},${r}`, x: px(c + 0.5), y: px(r + 0.5), angle: ((level.facing[`${c},${r}`] || 0) * Math.PI) / 180,
      alive: true, knocked: 0, aware: 0, body: {}, heard: 0, said: [], cued: [], hear() { this.heard++; }, spot() { this.heard++; },
      say(kind) { this.said.push(kind); }, speak(kind) { this.said.push(kind); } };
    g.home = { x: g.x, y: g.y, angle: g.angle };
    g.routine = { cue: (act) => g.cued.push(act) };
    enemies.push(g);
  }));
  const body = Matter.Bodies.circle(px(4.5), px(2.5), 10);
  const player = { body, radius: PLAYER.radius, alive: true, isPlayer: true, armed: false, weapon: null, def: { kind: 'none' }, sit: 0, pinned: false, ammo: 0, died: null,
    reserveCount() { return this.ammo; }, addAmmo(c, n) { this.ammo += n; }, kill(a, cause) { if (!this.invulnerable) { this.alive = false; this.died = cause; } },
    get x() { return body.position.x; }, get y() { return body.position.y; } };
  const sounds = [], log = { slow: [], blasts: [], later: [], shakes: 0, restored: null };
  const door = (c, r) => ({ cells: [r * W + c], body: Matter.Bodies.rectangle(px(c), px(r), 4, 30), a0: 0, hx: px(c), hy: px(r), locked: false, lock() { this.locked = true; } });
  const table = { type: 'table', def: {}, x: px(TABLE[0]), y: px(TABLE[1]), body: Matter.Bodies.rectangle(px(TABLE[0]), px(TABLE[1]), TABLE_W, TABLE_H, { isStatic: true }) };
  const stove = { type: 'oven', def: { gas: { fuse: [1, 2] } }, x: px(14.6), y: px(12.68), broke: 0, break() { this.broke++; } };
  const world = { events: new EventBus(), enemies, offstage: [], chars: [], player, items: [], level, game, removed: [], time: 0, texts: [],
    map: { w: W }, doors: [door(20, 2), door(13, 7)], windows: [{ cx: 3, cy: 14 }, { cx: 3, cy: 15 }, { cx: 6, cy: 0 }],
    props: [stove, { type: 'gas_bottle', def: { explosive: true, gas: { fuse: [1, 2] } }, x: px(15.5), y: px(12.7), broke: 0, break() { this.broke++; } }, table],
    noise() {}, emit() {},
    fireSpread: { burning: [], restore(i, x, y) { log.restored = [i, x, y]; }, nearest: () => null },
    removeBody(b) { this.removed.push(b); }, sound(name) { sounds.push(name); },
    slowmo(scale, dur) { log.slow.push([scale, dur]); }, shake() { log.shakes++; },
    after(s, fn) { log.later.push({ t: this.time + s, fn }); }, explode(x, y, o) { log.blasts.push([x, y, o.radius]); },
    leave(e) { this.enemies = this.enemies.filter((o) => o !== e); this.left = e; },
    holdBack(e) { e.offstage = true; this.enemies = this.enemies.filter((o) => o !== e); this.offstage.push(e); },
    bringOn(e, x, y) { e.offstage = false; this.offstage = this.offstage.filter((o) => o !== e); Object.assign(e, { x, y }); this.enemies.push(e); } };
  // the gas bottle of the end, by the fire door (its valve is lit by systems/Gas.js: it needs its world)
  const [bc, br] = level.tutorial.blast.at;
  const bottle = { type: 'propane', def: { explosive: true, gas: { fuse: [1, 2] } }, x: px(bc), y: px(br), W: 18, H: 18, body: { angle: 0 }, world, broke: 0,
    break() { this.broke++; this.dead = true; } };
  world.props.push(bottle);
  const t = new Tutorial(world, level.tutorial, from);
  const tick = () => {
    t.update();
    for (const a of log.later.filter((q) => q.t <= world.time)) a.fn();
    log.later = log.later.filter((q) => q.t > world.time);
  };
  const go = (col, row) => { Matter.Body.setPosition(body, { x: px(col), y: px(row) }); tick(); };
  // his velocity (px a step)
  const vel = (x, y) => Matter.Body.setVelocity(body, { x, y });
  const wait = (s) => { for (let k = 0; k < s * 20; k++) { world.time += 0.05; tick(); } };
  // the guard of that tile of the actors layer, on the level or still to come up the stairs
  const guardAt = (c, r) => [...world.enemies, ...world.offstage].find((e) => e.tile === `${c},${r}`);
  // the opening played to its end (the match falls when the man's acts say it does)
  const opened = () => { wait(OPENING.light); world.events.emit('matchDrop', { x: px(17.6), y: px(2.35) }); wait(OPENING.gone + OPENING.shot + 0.2); };
  return { world, t, player, go, vel, wait, tick, sounds, guardAt, log, stove, bottle, opened };
}

test('tutorial: the level holds together (every guard in a wave, zones and spawns on the floor, hints that exist)', () => {
  const floor = (c, r) => !' #X'.includes(level.tiles[Math.floor(r)][Math.floor(c)]);
  const inside = ([c0, r0, c1, r1], c, r) => c >= c0 && c < c1 + 1 && r >= r0 && r < r1 + 1;
  const guards = level.actors.join('').split('').filter((ch) => ENEMIES[ch]).length;
  const waved = new Set();
  for (const s of level.tutorial.stages) {
    assert.ok(floor(s.spawn[0], s.spawn[1]), 'a spawn in a wall');
    const k = level.tutorial.stages.indexOf(s), rooms = [s.zone, ...(k ? [level.tutorial.stages[k - 1].zone] : [])];
    assert.ok(rooms.some((z) => inside(z, s.spawn[0], s.spawn[1])), 'a retry starts in its room, or at the door of it: further back it burns');
    for (const [width, ...pts] of level.petrol) {
      for (const [c, r] of pts) assert.ok(Math.hypot(c - s.spawn[0], r - s.spawn[1]) * TILE > width / 2 + 24, `a retry starts on petrol (${s.spawn})`);
    }
    assert.ok(SHOTS[s.cam], `no shot ${s.cam}`);
    for (const h of s.hints) assert.ok(HINTS[h], `no hint ${h}`);
    for (const w of s.waves || []) {
      for (const [c, r] of w.at) {
        assert.ok(ENEMIES[level.actors[r][c]], `no guard at ${c},${r}`);
        waved.add(`${c},${r}`);
      }
    }
    for (const m of Object.values(s.marks || {})) assert.ok(floor(m[0], m[1]));
  }
  const O = level.tutorial.opening, B = level.tutorial.blast;
  assert.ok(ENEMIES[level.actors[O.man[1]][O.man[0]]], 'the man with the match');
  assert.equal(level.tiles[O.door[1]][O.door[0]], 'D', 'the door he slams');
  assert.ok(floor(...O.out) && floor(...O.match));
  assert.ok(waved.has(`${O.man[0]},${O.man[1]}`), 'who sleeps like the others until then');
  assert.equal(waved.size, guards, 'every guard belongs to a wave');
  assert.ok(level.petrol.some(([, ...pts]) => pts.some(([c, r]) => Math.hypot(c - O.match[0], r - O.match[1]) < 0.3)), 'the match falls on petrol');
  for (const [, ...pts] of level.petrol) for (const [c, r] of pts) assert.ok(floor(c, r), `petrol poured in a wall at ${c},${r}`);
  assert.ok(level.props.some(([type, c, r]) => type === 'propane' && Math.hypot(c - B.at[0], r - B.at[1]) < 0.2), 'a gas bottle where it blows');
  assert.ok(floor(...B.breach) && B.chain.every(([c, r]) => floor(c, r)), 'the fire comes down the corridor');
  // his bedroom's door is one door (nothing shoved across it); one door on the way out of the back hall, to the corridor
  assert.deepEqual([level.tiles[2][9], level.tiles[3][9]], ['D', '#'], 'the bedroom door: a single one');
  assert.ok(level.doors['9,2'] && !level.props.some(([type, c, r]) => c >= 8.5 && c <= 10.5 && r >= 1.5 && r <= 4.5 && type === 'table'));
  assert.ok(level.tiles[10][17] !== 'D' && level.tiles[10][20] === 'D', 'the back hall: an open doorway from the kitchen, the back door');
  // the living room's big table, right in front of the kitchen door, across the way to it: the vault
  const room = level.tutorial.stages[1], mark = room.marks.vault, door = [13, 7];
  const tables = level.props.filter(([type, c, r]) => type === 'table' && inside(room.zone, c, r));
  assert.equal(tables.length, 1, 'one table');
  assert.ok(Math.hypot(tables[0][1] - mark[0], tables[0][2] - mark[1]) < 0.01, 'the mark in its middle');
  assert.equal(level.tiles[door[1]][door[0]], 'D', 'the kitchen door');
  assert.ok(Math.abs(mark[0] - (door[0] + 0.5)) < 0.01 && mark[1] > door[1] - 2, 'in the door\'s column, right before it');
  assert.ok(door[1] - (mark[1] + TABLE_H / 2 / TILE) > 0.7, 'room to land between it and the door (and for the leaf)');
  assert.ok(!level.props.some(([type, c, r]) => type === 'chair' && inside(room.zone, c, r)), 'no chair at its head: the fire closes its ends');
  assert.ok(room.hints.includes('vault') && !level.tutorial.stages[0].hints.includes('vault'));
  assert.ok(!level.props.some(([type, c, r]) => type === 'table_round' && inside(room.zone, c, r)), 'no small table off to the side');
  // the forced way: a lane from the bedroom door to the table and on to the kitchen door that the fire is kept out
  // of (the stages' `keep`), petrol on both its sides and at both ends of the table
  const kept = (c, r) => level.tutorial.stages.slice(1, 3).some((q) => q.keep.some(([a, b, d, e]) => c >= a && c < d + 1 && r >= b && r < e + 1));
  const wet = (c, r) => level.petrol.some(([width, ...pts]) => pts.some((q, k) => {
    if (!k) return false;
    const [x0, y0] = pts[k - 1], dx = q[0] - x0, dy = q[1] - y0, t = Math.max(0, Math.min(1, ((c - x0) * dx + (r - y0) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(c - x0 - dx * t, r - y0 - dy * t) * TILE <= width / 2;
  }));
  const lane = [[10.6, 3.1], [12, 3.1], [13.6, 3.1], [13.6, 4.5], [13.6, TABLE_TOP - 0.1], mark, [13.6, 6.5]];
  for (const [c, r] of lane) assert.ok(floor(c, r) && kept(c, r), `the lane is kept clear at ${c},${r}`);
  const half = TABLE_W / 2 / TILE;
  const sides = [[12, 2.2], [13.6, 2.2], [12, 4], [12.75, 4.6], [14.5, 3.1], [14.5, 4.6], [mark[0] - half - 0.06, mark[1]], [mark[0] + half + 0.3, mark[1]]];
  for (const [c, r] of sides) assert.ok(wet(c, r) && !kept(c, r), `petrol burning beside the lane at ${c},${r}`);
  assert.ok(room.spawn[1] > 2.5 && room.spawn[1] < 3.75 && kept(room.spawn[0], room.spawn[1]), 'a retry of the room starts in the lane');
  assert.deepEqual(level.tutorial.stages.flatMap((q) => Object.keys(q.marks || {})), ['vault', 'dive'], 'no mark for advice: the vault, the dive');
  const [c0, r0, c1, r1] = level.tutorial.fall;
  assert.ok(floor(c0, r0) && floor(c1, r1), 'there is something to land on past the window');
  assert.ok(level.tiles.some((row) => row[c1 + 1] === 'G'), 'and a window to get there by');
  assert.deepEqual(level.drops.map((d) => [d[0], d[4]]), [['bat', null]], 'a bat; the only gun is the one a dead man leaves');
  assert.equal(guards, 7, 'seven men');
  assert.deepEqual(level.tutorial.stages.at(-1).waves.filter((w) => w.up).map((w) => w.at.length), [2], 'two men come up the stairs, no more');
  assert.equal(level.tutorial.stages.find((s) => s.leaves !== undefined).leaves, 0, 'and he has emptied it: the next man cannot be shot');
  assert.ok(level.grime.length > 10 && level.worn.length > 3, 'its floors are lived on');
});

test('tutorial: every guard sleeps until his wave is called, place after place', () => {
  const s = stub();
  assert.ok([...s.world.enemies, ...s.world.offstage].every((e) => e.dormant));
  assert.equal(s.t.stage, -1);
  s.opened();
  assert.equal(s.t.stage, 0);
  s.go(12.5, 4.5); // the living room: nobody, the fire
  assert.equal(s.t.stage, 1);
  assert.equal(s.world.game.tutorialAt.stage, 1);
  s.go(13.5, 9.5); // the kitchen
  const cook = s.guardAt(11, 11), second = s.guardAt(19, 10);
  assert.ok(cook.dormant && second.dormant);
  s.go(11.5, 10.6);
  assert.ok(cook.dormant, 'walked up to, he still sleeps: he is there to be seized');
  cook.alive = false;
  s.world.events.emit('kill', { victim: cook });
  s.tick();
  assert.ok(!second.dormant && second.heard === 1, 'the man in the back hall comes once the first is dead');
  s.go(21.5, 10.5); // out of the back door: the man at the far end of the corridor is only pointed at
  assert.equal(s.t.stage, 3);
  const shooter = s.guardAt(17, 14);
  assert.ok(shooter.dormant);
  s.go(21.5, 14.5); // the corner
  assert.equal(s.t.stage, 4);
  assert.ok(!shooter.dormant, 'the shooter wakes as he turns into the long corridor');
  s.go(11.5, 14.5); // by the landing
  const two = [s.guardAt(7, 19), s.guardAt(9, 19)];
  assert.equal(s.guardAt(8, 20), undefined, 'no third man');
  assert.ok(two.every((g) => g.dormant && g.offstage), 'the men of the landing are still down the stairs');
  const hostage = s.guardAt(9, 14);
  assert.ok(hostage.dormant && !hostage.offstage, 'the man past the fire door stands there, his back to it');
  s.world.events.emit('pickup', { ch: s.player, type: 'pistol' });
  s.wait(1);
  assert.ok(two.every((g) => g.dormant && g.offstage), 'the gun in his hand calls nobody');
  s.world.events.emit('shield', { holder: s.player, target: hostage });
  s.tick();
  assert.ok(two.every((g) => g.offstage), 'heard before they are seen');
  s.wait(0.5);
  assert.ok(s.sounds.filter((n) => n === 'step').length >= 2, 'their steps on the stairs');
  s.wait(2);
  assert.ok(two.every((g) => !g.dormant && !g.offstage && g.heard === 1), 'the man taken as a shield calls two of them up the stairs');
  assert.ok(two.every((g) => Math.abs(g.y - px(20.65)) < 1), 'at the top of the stairs');
  assert.equal(two.filter((g) => g.said.includes('stairs')).length, 1, 'the first of them shouts');
  // the last of them down: the stove goes
  assert.equal(s.t.blast.t, null);
  for (const g of [hostage, ...two]) {
    g.alive = false;
    s.world.events.emit('kill', { victim: g });
  }
  s.tick();
  assert.ok(s.t.blast.t !== null, 'and the flat goes up as the second falls');
});

test('tutorial: the opening - he is kept down, the man laughs, lights it and is gone; nothing stops him', () => {
  const s = stub(), man = s.guardAt(18, 2), door = s.world.doors[0];
  assert.ok(s.t.scene && man.invulnerable && s.player.sit === 1 && s.player.pinned, 'on his mattress, the man out of harm');
  assert.equal(s.t.shot().name, 'wake');
  s.wait(OPENING.laugh + 0.1);
  assert.deepEqual(man.cued, ['laugh'], 'his laugh leads on to the match (data/posts.js)');
  assert.equal(POSTS.arson.acts.laugh.next, 'light');
  assert.ok(s.world.texts.some((t) => t.str === OPENING.line && t.bubble && t.who === man), 'HA HA HA in a bubble');
  assert.ok(s.sounds.includes('arsonLaugh'));
  assert.ok(Math.abs(man.home.angle) > 3, 'turned to the man on the mattress');
  assert.deepEqual([s.t.shot().name, s.t.shot().at], ['laugh', man], 'the camera on him');
  assert.deepEqual(s.t.hints(), [], 'nothing is asked of the player meanwhile');
  // the match falls when his acts say so: the laugh, the strike, the flame shielded, the fall
  const A = POSTS.arson.acts, acts = A.laugh.phases[0].dur[1] + A.light.phases[0].dur[1] + A.light.phases[1].dur[1] + A.light.phases[2].dur[1] * MATCH_FALLS;
  s.wait(acts);
  assert.ok(s.player.pinned, 'still down while the match burns');
  s.world.events.emit('matchDrop', { x: px(17.6), y: px(2.35) });
  assert.ok(!s.player.pinned, 'the match on the floor: he may get up');
  assert.deepEqual(s.log.slow, [OPENING.slow], 'a breath of slow motion as it catches');
  assert.equal(s.t.shot().name, 'catch');
  // the fastest he can be on the man: up, then a straight run; the man is gone long before
  const reach = 40, dist = Math.hypot(man.x - s.player.x, man.y - s.player.y);
  const soonest = PLAYER.rise + (dist - reach) / (PLAYER.speed * 60);
  assert.ok(OPENING.gone < soonest - 0.5, `gone ${OPENING.gone} s after the match, reached ${soonest.toFixed(2)} s after it at the soonest`);
  // he runs for the door (Enemy.waitTurn `bolt`); played here at his running speed
  let t = 0;
  while (!man.gone && t < 5) {
    s.world.time += 1 / 60; t += 1 / 60;
    if (man.bolt) { const d = Math.hypot(man.bolt.x - man.x, man.bolt.y - man.y), v = ENEMY.runSpeed; man.x += ((man.bolt.x - man.x) / d) * Math.min(v, d); man.y += ((man.bolt.y - man.y) / d) * Math.min(v, d); }
    assert.ok(man.invulnerable, 'out of harm to the end');
    s.tick();
  }
  assert.ok(man.gone && t <= OPENING.gone + 0.05 && s.world.left === man, `out of the level ${t.toFixed(2)} s after the match`);
  assert.ok(t < soonest, 'before the player could have been on him');
  assert.ok(door.locked && s.sounds.includes('doorSlam') && s.log.shakes === 1, 'the front door slammed behind him');
  s.wait(OPENING.shot + 0.1);
  assert.equal(s.t.scene, null);
  assert.deepEqual(s.t.hints().map((h) => h.text), ['MOVE']);
  assert.equal(s.t.shot().name, 'bedroom');
});

test('tutorial: no match after all, and he is let up anyway; a retry of the first room skips the laugh', () => {
  const s = stub();
  s.wait(OPENING.down + 0.1);
  assert.ok(!s.player.pinned);
  const again = stub(0, { tutorialAt: { name: level.name, stage: 0 } });
  again.wait(0.1);
  assert.deepEqual(again.guardAt(18, 2).cued, ['light'], 'straight to the match');
  assert.ok(!again.sounds.includes('arsonLaugh'));
});

test('tutorial: a room without a shot of its own leaves the camera free, and a throw\'s beat goes over the room\'s', () => {
  const s = stub(), none = () => false;
  s.opened();
  s.t.pace(0.016, none);
  through(s.t);
  assert.equal(s.t.shot().name, 'bedroom');
  const hit = { name: 'throwHit', at: { x: 1, y: 2 } };
  s.world.throwBeat = { shot: () => hit };
  assert.equal(s.t.shot(), hit, 'the throw\'s beat');
  s.world.throwBeat = { shot: () => null };
  delete s.t.stages[Math.max(0, s.t.stage)].cam;
  assert.equal(s.t.shot(), null, 'no shot: null, so that Game asks the others');
});

test('tutorial: a lesson is a slow motion that starts when its action is due, lasts until he does it, and never stops time', () => {
  const s = stub(), T = s.t, none = () => false, space = (k) => k === 'action', V = LESSONS.vault;
  s.opened();
  assert.equal(T.pace(0.016, none), 1, 'MOVE is said; nothing slows for it');
  assert.equal(T.lesson, null);
  // the living room: VAULT shows over the table from his door, small; time is his until he runs at it
  s.go(10.8, 3.1);
  s.vel(PLAYER.speed, 0);
  assert.deepEqual(T.hints().map((h) => [h.id, h.key, h.text, h.focus]), [['vault', 'action', 'VAULT', undefined]]);
  assert.equal(T.pace(0.016, none), 1, 'far from the table');
  s.go(13.6, TABLE_TOP - 2);
  s.vel(0, PLAYER.speed);
  assert.equal(T.pace(0.016, none), 1, 'running at it, two metres short: not yet');
  s.go(13.6, TABLE_TOP - 1.2);
  s.vel(0, -PLAYER.speed);
  assert.equal(T.pace(0.016, none), 1, 'near enough but walking away from it');
  s.vel(0, 0);
  assert.equal(T.pace(0.016, none), 1, 'or standing there');
  s.vel(PLAYER.speed, 0);
  assert.equal(T.pace(0.016, none), 1, 'or walking along it');
  assert.ok(!T.taught.has('vault') && T.lesson === null);
  // closing on it within a metre of its edge: now. It eases in, no snap
  s.vel(0, PLAYER.speed);
  const first = T.pace(0.01, none);
  assert.ok(first < 1 && first > 0.9, `the first frame: ${first}`);
  assert.ok(T.taught.has('vault') && T.lesson.id === 'vault');
  const down = [first];
  for (let t = 0.01; t < BEAT.in + 0.05; t += 0.01) down.push(T.pace(0.01, none));
  assert.ok(down.every((k, i) => i === 0 || k <= down[i - 1]), 'a ramp down');
  assert.equal(down.at(-1), V.slow, `at ${V.slow} in ${BEAT.in} s`);
  assert.ok(V.slow >= 0.25 && V.slow <= 0.35 && BEAT.in <= 0.12);
  // the camera stays on him and on the room's framing, pushed in a little; the hint big over the table
  assert.deepEqual(T.shot(), { name: 'flat', at: null });
  assert.equal(T.push(), BEAT.push);
  assert.ok(BEAT.push > 0 && BEAT.push <= 0.08, 'a few per cent');
  assert.equal(T.hints()[0].focus, 1);
  // it holds while he comes on, the hand his; a key that is not its own changes nothing
  for (let t = 0; t < 1; t += 0.05) assert.equal(T.pace(0.05, (k) => k === 'use'), V.slow);
  // SPACE: time eases back to 1
  const up = [T.pace(0.01, space)];
  let n = 0;
  while (T.lesson && n++ < 100) up.push(T.pace(0.01, none));
  assert.ok(up.every((k, i) => i === 0 || k >= up[i - 1]) && up.at(-1) === 1, 'a ramp up');
  assert.ok(Math.abs(n * 0.01 - BEAT.out) < 0.03, `back in ${(n * 0.01).toFixed(2)} s (${BEAT.out})`);
  assert.ok([...down, ...up].every((k) => k > 0), 'never a time scale of 0');
  assert.equal(T.push(), 0);
  assert.equal(T.hints()[0].focus, undefined, 'the hint back to its size');
  assert.equal(T.pace(0.016, none), 1, 'once: still running at the table, no second slow motion');
  // nothing pressed: its cap, then back
  T.taught.delete('vault');
  let t = 0;
  for (; t < 10 && (t === 0 || T.lesson); t += 0.01) assert.ok(T.pace(0.01, none) > 0);
  assert.ok(Math.abs(t - (BEAT.cap + BEAT.out)) < 0.05, `over in ${t.toFixed(2)} s`);
  assert.ok(BEAT.cap >= 2 && BEAT.cap <= 3);
  // he leaves the trigger (turns away): it lets go
  T.taught.delete('vault');
  T.pace(BEAT.in, none);
  T.pace(0.2, none);
  assert.ok(!T.lesson.out);
  s.vel(0, -PLAYER.speed);
  T.pace(BEAT.grace / 2, none);
  assert.ok(!T.lesson.out, 'a flicker is not leaving');
  T.pace(BEAT.grace, none);
  assert.ok(T.lesson.out, 'gone for good: time comes back');
  through(T);
  // a key already down as it starts is not the action: let go, then pressed
  T.taught.delete('vault');
  s.vel(0, PLAYER.speed);
  T.pace(0.05, space);
  T.pace(0.2, space);
  assert.ok(T.lesson && !T.lesson.out, 'held since before');
  T.pace(0.016, none);
  T.pace(0.016, space);
  assert.ok(T.lesson.out, 'a fresh press');
  through(T);
  // a retry does not slow for it again
  const again = stub(1, s.world.game);
  again.world.game.taught = T.taught;
  const t2 = new Tutorial(again.world, level.tutorial, 1);
  Matter.Body.setPosition(again.player.body, { x: px(13.6), y: px(TABLE_TOP - 1) });
  again.vel(0, PLAYER.speed);
  t2.update();
  assert.deepEqual(t2.hints().map((h) => h.id), ['vault'], 'the hint is still there');
  assert.equal(t2.pace(0.016, none), 1, 'taught on the run before');
  // every lesson is a hint's id (but the end's), slowed to a quarter / a third, capped
  const ids = new Set(['neck', 'run', ...Object.keys(HINTS)]);
  for (const [id, L] of Object.entries(LESSONS)) {
    const D = { ...BEAT, ...L };
    assert.ok(ids.has(id) && D.slow > 0.1 && D.slow <= 0.35 && D.cap >= 0.7 && D.cap <= 2.5, `lesson ${id}`);
  }
  assert.ok(SHOTS[LESSONS.run.shot] && Object.values(LESSONS).filter((L) => L.shot).length === 1, 'only the end moves the camera');
});

test('tutorial: every hint is a key and its action, never advice', () => {
  for (const from of [0, 1, 2, 3, 4, 5]) {
    const s = stub(from);
    if (!from) s.opened(); else s.tick();
    const p = s.player, st = s.t.stages[s.t.stage];
    // whatever the situation: hands empty, a bat, a loaded gun, a dry one; the men unaware, alert, down, gone
    const hands = [{ armed: false, weapon: null, def: { kind: 'none' } }, { armed: true, weapon: { type: 'bat' }, def: { kind: 'melee' } },
      { armed: true, weapon: { type: 'pistol', mag: 2 }, def: { kind: 'gun' } }, { armed: true, weapon: { type: 'pistol', mag: 0 }, def: { kind: 'gun' } }];
    for (const w of st.waves) w.awake = true;
    for (const hand of hands) {
      for (const men of [{ aware: 0 }, { aware: 2 }, { knocked: 2 }, { alive: false }]) {
        Object.assign(p, hand, { nearTakedown: men.aware === 0 ? s.t.guards(st)[0] : null, nearShield: men.aware === 0 ? s.t.guards(st)[0] : null, contextAction: 'DIVE THROUGH' });
        for (const g of s.t.guards(st)) Object.assign(g, { aware: 0, knocked: 0, alive: true, offstage: false }, men);
        for (const h of s.t.hints()) {
          assert.ok(h.key, `"${h.text}" has no key (stage ${from})`);
          assert.ok(!/BEHIND|GET OUT|RUN|GO /.test(h.text), `"${h.text}" is advice`);
        }
      }
    }
  }
  assert.ok(!HINTS.flee && !LESSONS.behind && !LESSONS.flee && !LESSONS.move);
});

test('tutorial: each lesson has its trigger - the moment its action is due, not before', () => {
  const none = () => false;
  // lesson `id` is not on, then `fn` and it starts; played out
  const starts = (s, id, why) => { const k = s.t.pace(0.016, none); assert.ok(s.t.lesson?.id === id && k < 1 && k > 0, `${id}: ${why}`); through(s.t); assert.equal(s.t.lesson, null); };
  const quiet = (s, why) => { assert.equal(s.t.pace(0.016, none), 1, why); assert.equal(s.t.lesson, null, why); };
  // ---- the kitchen: the man at the worktop, his back to the door; the bat
  const k = stub(2), p = k.player, cook = k.guardAt(11, 11), second = k.guardAt(19, 10);
  k.tick();
  assert.deepEqual(k.t.hints(), [], 'nothing is said about a man across the room');
  quiet(k, 'walking in');
  p.nearTakedown = cook; // behind him, within reach, unseen (Player.nearTakedown)
  assert.deepEqual(k.t.hints().map((h) => [h.key, h.text, h.ax, h.ay]), [['attack', 'BREAK HIS NECK', cook.x, cook.y]], 'the click, on him');
  starts(k, 'neck', 'in his back, within reach');
  p.nearTakedown = null;
  k.world.items.push({ type: 'bat', x: px(12.5), y: px(10.7), dead: false });
  k.go(12.5, 9.6);
  assert.deepEqual(k.t.hints().map((h) => h.text), ['TAKE IT'], 'shown from afar');
  quiet(k, 'a metre from the bat');
  k.go(12.5, 10.3);
  starts(k, 'take', 'standing over it');
  // the second man: called, he comes; PUNCH when he is in reach
  cook.alive = false;
  k.world.events.emit('kill', { victim: cook });
  k.tick();
  k.world.items.length = 0;
  Object.assign(second, { x: p.x + LESSONS.punch.reach + 30, y: p.y });
  assert.deepEqual(k.t.hints(), [], 'he has not seen him: not a man to punch');
  second.aware = 2;
  assert.deepEqual(k.t.hints().map((h) => h.text), ['PUNCH HIM']);
  quiet(k, 'still out of reach');
  second.x = p.x + LESSONS.punch.reach - 4;
  starts(k, 'punch', 'in reach, facing him');
  // floored: FINISH at his feet
  second.knocked = 2;
  assert.deepEqual(k.t.hints().map((h) => h.text), ['FINISH HIM']);
  quiet(k, 'down, but two steps away');
  second.x = p.x + LESSONS.finish.reach - 4;
  starts(k, 'finish', 'down at his feet');
  // the bat in hand: STRIKE in reach
  second.knocked = 0;
  Object.assign(p, { armed: true, weapon: { type: 'bat' }, def: { kind: 'melee' } });
  second.x = p.x + LESSONS.strike.reach + 30;
  quiet(k, 'out of the bat\'s reach');
  second.x = p.x + LESSONS.strike.reach - 4;
  starts(k, 'strike', 'in reach');
  // two due at once: one at a time, the other after it if it is still due
  for (const id of ['strike', 'finish']) k.t.taught.delete(id);
  const down = k.guardAt(11, 11);
  Object.assign(down, { alive: true, knocked: 2, x: p.x, y: p.y + 10 });
  k.t.stages[2].waves[0].guards.includes(down) || k.t.stages[2].waves[0].guards.push(down);
  k.t.pace(0.016, none);
  assert.equal(k.t.lesson.id, 'finish', 'the first said');
  assert.ok(!k.t.taught.has('strike'), 'the other is not burned meanwhile');
  through(k.t);
  starts(k, 'strike', 'then the other');
  // ---- the corridor: SLIDE as the gunman's shot comes
  const c = stub(4), gunman = c.guardAt(17, 14);
  c.tick();
  assert.deepEqual(c.t.hints(), [], 'short of the corner: nothing');
  c.go(21.5, 14.5);
  assert.ok(!gunman.dormant);
  gunman.react = LESSONS.slide.lead + 0.3;
  assert.deepEqual(c.t.hints().map((h) => [h.key, h.text]), [['action', 'SLIDE']]);
  quiet(c, 'he has seen him, his shot is not told yet');
  c.world.lineOfSight = () => false;
  gunman.react = LESSONS.slide.lead - 0.05;
  quiet(c, 'not in his sights');
  c.world.lineOfSight = () => true;
  starts(c, 'slide', 'his shot is coming');
  c.player.slide = { t: 0 };
  assert.deepEqual(c.t.hints(), [], 'not said while he slides');
  c.player.slide = null;
  c.go(17.5 + (LESSONS.slide.near - 10) / TILE, 14.5);
  assert.ok(!c.t.hints().some((h) => h.text === 'SLIDE'), 'nor on top of him');
  // ---- the landing: SHIELD behind the man past the fire door
  const l = stub(5), q = l.player, hostage = l.guardAt(9, 14);
  l.go(11.5, 14.6);
  assert.deepEqual(l.t.hints().map((h) => [h.key, h.text, h.ax]), [['use', 'SHIELD', hostage.x]], 'said on him from as far as he is seen: he is there for that');
  assert.ok(hostage.shieldOnly && hostage.invulnerable, 'and for nothing else: no takedown on him, nothing hurts him before');
  quiet(l, 'at the fire door');
  q.nearShield = hostage; // behind him, within reach, a hand free (Player.nearShield)
  assert.deepEqual(l.t.hints().map((h) => [h.key, h.text, h.ax]), [['use', 'SHIELD', hostage.x]]);
  starts(l, 'shield', 'behind him, in reach');
  q.nearShield = null;
  // SHOOT: a gun with rounds, a man who knows him in his line of fire at range
  l.world.events.emit('shield', { holder: q, target: hostage });
  hostage.alive = false;
  l.wait(2);
  const [a, b] = [l.guardAt(7, 19), l.guardAt(9, 19)];
  Object.assign(q, { armed: true, weapon: { type: 'pistol', mag: 2 }, def: { kind: 'gun', ammo: '9mm', mag: 7 }, ammo: 7 });
  for (const g of [a, b]) Object.assign(g, { aware: 2, x: q.x - LESSONS.shoot.range - 40, y: q.y });
  assert.deepEqual(l.t.hints().map((h) => h.text), ['SHOOT']);
  quiet(l, 'too far to ask for a shot');
  a.x = q.x - LESSONS.shoot.range + 20;
  l.world.lineOfSight = () => false;
  quiet(l, 'behind a wall');
  l.world.lineOfSight = () => true;
  starts(l, 'shoot', 'in his line of fire');
  // RELOAD: the gun runs dry
  quiet(l, 'rounds left');
  q.weapon.mag = 0;
  starts(l, 'reload', 'dry, a magazine left');
  // THROW: dry for good, a man in range
  q.ammo = 0;
  a.x = b.x;
  assert.deepEqual(l.t.hints().map((h) => [h.key, h.text]), [['throw', 'THROW IT']]);
  quiet(l, 'nobody near enough to throw it at');
  a.x = q.x - LESSONS.throw.range + 20;
  starts(l, 'throw', 'a man in range');
  // DIVE: at the window, when SPACE takes him through
  for (const g of [a, b]) g.alive = false;
  l.tick();
  through(l.t);
  l.go(4.6, 14.6);
  assert.deepEqual(l.t.hints(), [], 'the way out is marked on the floor, not said');
  assert.ok(l.t.exit());
  quiet(l, 'at the window, not yet where SPACE is a dive');
  q.contextAction = 'DIVE THROUGH';
  assert.deepEqual(l.t.hints().map((h) => [h.key, h.text]), [['action', 'DIVE']]);
  const dive = l.t.pace(0.016, none);
  assert.ok(l.t.lesson.id === 'dive' && dive < 1);
});

test('tutorial: a man walked up to, in front of him, wakes whatever was or was not taught (no lesson holds the room asleep)', () => {
  const s = stub(2);
  s.tick();
  const second = s.guardAt(19, 10);
  second.angle = Math.PI;
  s.go(17.9, 10.5);
  assert.equal(s.t.stage, 2);
  assert.ok(!second.dormant && !s.t.taught.size);
});

test('game: a lesson slows the game on its own ramp and takes nothing from his hands', () => {
  const s = stub(1), inp = new Input(null, { pads: () => [] });
  s.tick();
  s.world.tutorial = s.t;
  const g = { state: 'play', world: s.world };
  const teach = (dt) => Game.prototype.teach.call(g, dt, inp);
  s.go(13.6, TABLE_TOP - 2);
  assert.deepEqual(teach(0.016), { scale: 1, beat: false });
  // running at the table, a click held, E down, SPACE not
  s.go(13.6, TABLE_TOP - 1);
  s.vel(0, PLAYER.speed);
  inp.press(0);
  inp.keys.add('KeyE');
  inp.pressed.add('KeyE');
  let r = teach(0.05);
  assert.ok(r.beat && r.scale > 0 && r.scale < 1, 'the lesson\'s own ramp');
  assert.ok(inp.mouseDown(0) && inp.mouseHit(0) && inp.down('KeyE') && inp.hit('KeyE'), 'his keys and clicks are his');
  assert.equal(g.stopped, undefined, 'the world is never held');
  r = teach(BEAT.in);
  assert.deepEqual(r, { scale: LESSONS.vault.slow, beat: true });
  inp.keys.add('Space');
  teach(0.016);
  assert.ok(s.t.lesson.out, 'SPACE: he vaults, time comes back');
  for (let k = 0; k < 100 && s.t.lesson; k++) r = teach(0.02);
  assert.deepEqual(r, { scale: 1, beat: true });
  assert.deepEqual(teach(0.016), { scale: 1, beat: false });
  assert.equal(inp.holdKeys, undefined, 'no latch left in the input');
  g.state = 'dead';
  assert.deepEqual(teach(0.016), { scale: 1, beat: false });
});

test('tutorial: walked up to the stairs, those coming up them are there', () => {
  const s = stub();
  s.go(8.5, 16.5); // onto the landing, no gun in hand
  const man = s.guardAt(7, 19);
  s.wait(1);
  assert.ok(man.dormant && man.offstage);
  s.go(8, 19.4);
  s.wait(2);
  assert.ok(!man.dormant && !man.offstage);
});

test('tutorial: the gun the shooter drops is left empty', () => {
  const s = stub();
  s.go(18.5, 14.5);
  const shooter = s.guardAt(17, 14), gun = { type: 'pistol', def: { kind: 'gun' }, mag: 5, x: shooter.x + 10, y: shooter.y, dead: false };
  const far = { type: 'pistol', def: { kind: 'gun' }, mag: 7, x: px(5), y: px(4), dead: false };
  shooter.alive = false;
  s.world.events.emit('kill', { victim: shooter });
  s.world.items.push(gun, far);
  s.tick();
  assert.equal(gun.mag, 0);
  assert.equal(far.mag, 7, 'another gun, elsewhere, is not his');
  // his own, wherever it went (knocked out of his hand across the corridor, or on its way into the player's)
  const t = stub(4), man = t.guardAt(17, 14), flown = { type: 'pistol', mag: 6, x: px(12), y: px(14.5), dead: false };
  t.go(18.5, 14.5);
  Object.assign(man, { alive: false, lastDrop: flown });
  t.world.events.emit('kill', { victim: man });
  assert.equal(flown.mag, 0);
});

test('tutorial: the hints say one thing at a time, next to what it is about', () => {
  const s = stub(), names = () => s.t.hints().map((h) => h.text);
  s.opened();
  assert.deepEqual(names(), ['MOVE']);
  s.go(7.5, 3.5);
  assert.deepEqual(names(), [], 'he has walked: out by his door');
  s.go(10.5, 3.5);
  assert.deepEqual(s.t.hints().map((q) => `${q.key} ${q.text} ${q.id}`), ['action VAULT vault'], 'the living room: the big table across his way');
  assert.deepEqual([s.t.hints()[0].ax, s.t.hints()[0].ay], level.tutorial.stages[1].marks.vault.map(px));
  s.world.fireSpread.burning.push(1);
  assert.deepEqual(names(), ['VAULT'], 'the fire says the rest');
  s.player.vaulting = { t: 0 };
  assert.deepEqual(names(), [], 'not while he is over it');
  s.player.vaulting = null;
  s.go(13.5, 9.5);
  s.world.items.push({ type: 'bat', x: px(12.5), y: px(10.7), dead: false });
  assert.deepEqual(names(), ['TAKE IT'], 'the bat; nothing about the man until he is behind him');
  s.player.nearTakedown = s.guardAt(11, 11);
  assert.deepEqual(s.t.hints().map((h) => `${h.key} ${h.text}`), ['attack BREAK HIS NECK'], 'behind the man: his neck, and the bat waits (never two at once)');
  s.player.nearTakedown = null;
  s.guardAt(11, 11).aware = 2;
  assert.deepEqual(names(), ['PUNCH HIM'], 'he turned round: a punch');
  s.guardAt(11, 11).knocked = 2;
  assert.deepEqual(s.t.hints().map((h) => `${h.key} ${h.text}`), ['attack FINISH HIM'], 'a man on the floor comes first: the left click');
  Object.assign(s.player, { armed: true, weapon: { type: 'bat' }, def: { kind: 'melee' } });
  s.guardAt(11, 11).alive = false;
  assert.deepEqual(names(), [], 'the man behind the door is not pointed at before he is called');
  s.world.events.emit('kill', { victim: s.guardAt(11, 11) });
  s.tick();
  s.guardAt(19, 10).aware = 2; // he heard it
  assert.deepEqual(names(), ['STRIKE HIM'], 'he comes in: the bat');
  const h = s.t.hints()[0], man = s.guardAt(19, 10);
  assert.deepEqual([h.ax, h.ay], [man.x, man.y], 'it says where what it is about is (an arrow points there when it is off the picture)');
  assert.ok(h.y < man.y - 30, 'and floats clear of what he says');
  s.go(21.5, 10.5);
  assert.deepEqual(names(), [], 'the corridor: nothing until its man is on him');
  s.go(21.5, 14.5);
  s.guardAt(17, 14).aware = 2;
  assert.deepEqual(names(), ['SLIDE'], 'the gunman: under his fire; the bat for him waits (never two at once, the one due wins)');
  s.go(11.5, 14.5);
  Object.assign(s.player, { weapon: { type: 'pistol', mag: 2 }, def: { kind: 'gun' } });
  const hostage = s.guardAt(9, 14);
  assert.deepEqual(names(), ['SHIELD'], 'the man past the fire door, his back to it: not one to shoot, one to take');
  s.player.nearShield = hostage;
  assert.equal(s.t.hints().map((q) => `${q.key} ${q.text}`)[0], 'use SHIELD', 'behind him: E takes him as a shield');
  s.player.nearShield = null;
  s.player.shield = { target: hostage };
  assert.equal(s.t.hints().map((q) => `${q.key} ${q.text}`)[0], 'throw THROW HIM', 'held: the right click lets him go');
  s.world.events.emit('shield', { holder: s.player, target: hostage });
  s.player.shield = null;
  hostage.alive = false;
  s.wait(2.5);
  for (const at of [[7, 19], [9, 19]]) s.guardAt(...at).aware = 2;
  assert.deepEqual(names(), ['SHOOT']);
  s.player.weapon.mag = 0;
  s.player.ammo = 7;
  assert.deepEqual(s.t.hints().map((q) => `${q.key} ${q.text}`), ['reload RELOAD'], 'dry, a magazine left: R');
  s.player.reloading = 0.5;
  assert.deepEqual(names(), [], 'said until he does it');
  Object.assign(s.player, { reloading: 0, ammo: 0 });
  assert.deepEqual(names(), ['THROW IT'], 'dry for good: thrown. The window is not pointed at while they stand');
  s.guardAt(7, 19).alive = false;
  s.player.contextAction = 'DIVE THROUGH';
  assert.ok(!names().includes('DIVE'), 'no dive while one still stands');
  s.guardAt(9, 19).alive = false;
  s.player.contextAction = null;
  assert.deepEqual(names(), [], 'nobody left: the way out is marked on the floor, nothing is said');
  s.go(4.6, 14.6);
  assert.deepEqual(names(), [], 'at the window, not yet where SPACE takes him through');
  s.player.contextAction = 'DIVE THROUGH';
  assert.deepEqual(s.t.hints().map((q) => `${q.key} ${q.text} ${q.id}`), ['action DIVE dive'], 'the jump, when SPACE is a dive and no sooner');
});

test('tutorial: the last man down - the gas bottle\'s valve is lit, it goes, then the fire comes down the corridor after him', () => {
  const s = stub(5), B = level.tutorial.blast, C = BLAST.chain, none = () => false;
  assert.ok(s.bottle.staged && s.stove.staged, 'kept for the end: neither the fire nor a round sets the gas off');
  assert.equal(s.t.bottle, s.bottle, 'the bottle by the fire door is the one');
  s.go(11.5, 14.6);
  assert.equal(s.t.blast.t, null, 'not while they are still to come');
  assert.equal(s.t.exit(), null, 'and the way out is not marked yet');
  for (const g of [...s.world.offstage, ...s.world.enemies]) g.alive = false;
  s.tick();
  assert.ok(s.t.blast.t !== null && s.player.invulnerable, 'the last man is down: it is set off, wherever he stands; its debris does not kill him');
  assert.deepEqual(s.t.exit(), { zone: [px(4), px(14), px(6), px(16)], window: [px(3), px(14), px(4), px(16)] }, 'the floor before the window and the window are marked');
  assert.ok(s.bottle.gasLeak && s.sounds.includes('ignite'), 'its valve lit: the jet, the hiss (systems/Gas.js)');
  // slow motion, the camera on it; nothing is said (the way out is marked)
  const k0 = s.t.pace(0.016, none);
  assert.ok(s.t.lesson.id === 'run' && k0 < 1 && k0 > 0);
  assert.equal(s.t.pace(BEAT.in, none), LESSONS.run.slow);
  assert.deepEqual([s.t.shot().name, s.t.shot().at, s.t.hints()], ['beatWide', { x: px(B.breach[0]), y: px(B.breach[1]) }, []]);
  assert.equal(s.t.push(), 0, 'no push on him: the camera is on the bottle');
  assert.ok(LESSONS.run.slow * LESSONS.run.cap > BLAST.fuse + BLAST.breach[0], 'the bottle and the breach go inside it');
  s.wait(BLAST.fuse - 0.1);
  assert.equal(s.bottle.broke, 0, 'the fuse: not yet');
  s.wait(0.16);
  assert.deepEqual([s.bottle.broke, s.stove.broke], [1, 0], 'the bottle goes');
  s.wait(BLAST.breach[0] + 0.05);
  assert.equal(s.stove.broke, 1, 'the stove behind the wall with it');
  assert.deepEqual(s.log.blasts, [[px(B.breach[0]), px(B.breach[1]), BLAST.breach[1]]], 'then the ball of fire through the fire doors');
  s.t.pace(LESSONS.run.cap, none);
  assert.equal(s.t.pace(BEAT.out + 0.01, none), 1, 'and time is back');
  assert.equal(s.t.shot().name, 'run');
  // the chain: each ball nearer the window and bigger, quicker and quicker; he runs ahead of it all the way, even
  // from the far end of the landing's stretch, half a second late
  assert.ok(B.chain.every(([c, , r], k) => k === 0 || (c < B.chain[k - 1][0] && r >= B.chain[k - 1][2])), 'nearer and bigger');
  assert.ok(C.gap[1] < C.gap[0], 'quicker and quicker');
  let t = BLAST.fuse + BLAST.breach[0];
  const window = px(4.4), speed = PLAYER.speed * 60, late = LESSONS.run.slow * LESSONS.run.cap + 0.5;
  B.chain.forEach(([c, , r], k) => {
    t += k ? C.gap[0] + ((C.gap[1] - C.gap[0]) * k) / (B.chain.length - 1) : C.first;
    const runner = Math.max(window, px(12.9) - speed * Math.max(0, t - late));
    assert.ok(runner < px(c) - r * C.kill - 16 || runner === window, `ball ${k} at ${t.toFixed(2)} s: he is ${Math.round(px(c) - runner)} px ahead of it`);
  });
  const last = B.chain.at(-1);
  assert.ok(px(12.9) - speed * (t - late) < window - 60, 'and has had time to be through the window before the last');
  assert.ok(px(last[0]) - last[2] * C.kill < px(4.6), 'which reaches the foot of the window: no standing there');
  // standing still, he is caught by it
  s.wait(t - BLAST.fuse - BLAST.breach[0] + 0.1);
  assert.ok(!s.player.alive && s.player.died === 'explosion', 'the fire kills who waits for it');
  assert.ok(s.log.blasts.length >= 3 && s.log.blasts.length <= 1 + B.chain.length);
  // through the window in time: what is left of the chain goes off right behind him
  const d = stub(5);
  for (const e of [...d.world.offstage, ...d.world.enemies]) e.alive = false;
  d.go(5.5, 14.6);
  d.wait(BLAST.fuse + BLAST.breach[0] + C.first + 0.1);
  const before = d.log.blasts.length;
  assert.ok(before < 1 + B.chain.length);
  d.go(1.5, 14.5);
  assert.ok(d.t.over);
  d.wait(C.rush * B.chain.length + 0.1);
  assert.equal(d.log.blasts.length, 2 + B.chain.length, 'all of it, at once, and the window going up behind him (LEAP)');
  assert.ok(d.player.alive && d.player.invulnerable, 'and none of it on him');
  // with a god's shield he is left alone, and it is handed back as it was
  const g = stub(5);
  g.player.invulnerable = true;
  for (const e of g.world.offstage) e.alive = false;
  g.go(8.5, 14.5);
  g.wait(t + C.tail + 0.2);
  assert.ok(g.player.alive && g.player.invulnerable);
});

test('tutorial: the gunman waits past the corner; the kitchen\'s second man is framed by the camera as he comes', () => {
  const s = stub(3);
  s.tick();
  // the gunman stands 1.5 to 2.5 m further down than one slide from the corner (50 px between them): his first
  // round comes as he turns it, the slide goes under it, a step or two more and he is on him
  const gunman = s.guardAt(17, 14), corner = { x: px(21.5), y: px(14.5) }, gap = corner.x - gunman.x - 2 * PLAYER.radius;
  assert.ok(Math.abs(gunman.y - corner.y) < 1 && gap > 50 + 1.5 * TILE && gap < 50 + 2.5 * TILE, `he stands ${corner.x - gunman.x} px from the corner`);
  const k = stub(2);
  k.tick();
  const cook = k.guardAt(11, 11), second = k.guardAt(19, 10);
  assert.equal(k.t.shot().name, 'flat');
  cook.alive = false;
  k.world.events.emit('kill', { victim: cook });
  k.tick();
  second.aware = 2;
  assert.deepEqual([k.t.shot().name, k.t.shot().at], ['threat', second], 'the camera frames him with the player');
  assert.ok(LESSONS.punch.reach < FRAME.near && SHOTS.threat.pull > 0 && SHOTS.threat.pull < 1, 'the punch is asked for once he is on him');
});

test('tutorial: the reload - the world all but stops while his hands work, and nobody fires until it is done and a beat', () => {
  const s = stub(5), p = s.player, none = () => false;
  s.world.game.timeScale = 1;
  Object.assign(p, { armed: true, weapon: { type: 'pistol', mag: 1 }, def: { kind: 'gun', ammo: '9mm', mag: 7 }, ammo: 7, reloading: 0 });
  s.go(11.5, 14.6);
  s.world.events.emit('shield', { holder: p, target: s.guardAt(9, 14) });
  s.wait(1);
  const men = s.world.enemies.filter((e) => !e.dormant);
  assert.ok(men.length >= 2 && men.every((g) => !g.react), 'the men up the stairs, free to fire');
  for (const id of ['shoot', 'take']) s.t.taught.add(id);
  assert.equal(s.t.pace(0.016, none), 1);
  p.weapon.mag = 0;
  s.tick();
  assert.ok(men.every((g) => g.react > 0), 'dry, a magazine left: they hold their fire');
  const dry = s.t.pace(0.016, none);
  assert.ok(s.t.lesson.id === 'reload' && dry > 0 && dry < 1, 'the RELOAD lesson: slow as it runs dry');
  through(s.t);
  assert.equal(s.t.pace(0.016, none), 1);
  p.reloading = 1.1; // R
  s.world.game.timeScale = RELOAD.slow;
  s.tick();
  assert.equal(s.t.pace(0.016, none), RELOAD.slow, 'reloading: the world all but stops');
  assert.equal(p.haste, 1 / RELOAD.slow, 'and his hands go at their real pace');
  Object.assign(p, { reloading: 0, ammo: 0 });
  p.weapon.mag = 7;
  s.world.game.timeScale = 1;
  for (const g of men) g.react = 0;
  s.tick();
  assert.equal(p.haste, 1);
  assert.equal(s.t.pace(0.016, none), 1);
  assert.ok(men.every((g) => g.react > 0), 'loaded: still a beat of grace');
  s.wait(RELOAD.grace + 0.1);
  for (const g of men) g.react = 0;
  s.tick();
  assert.ok(men.every((g) => !g.react), 'then they are on him again');
});

test('tutorial: the bat holds until the corridor\'s gunman and breaks on him; his gun is empty, the magazine comes with the shield', () => {
  const s = stub(4);
  s.tick();
  Object.assign(s.player, { armed: true, weapon: { type: 'bat', wear: 1 }, def: { kind: 'melee', wear: 3 } });
  s.tick();
  assert.equal(s.player.weapon.wear, FORCE.keep, 'worn as it was, it will not break on anything before him');
  const gunman = s.guardAt(17, 14);
  assert.ok(gunman.dormant && s.player.weapon.wear >= FORCE.keep, 'short of the corner, still far from him');
  s.go(21.5, 14.5);
  assert.ok(!gunman.dormant);
  assert.equal(s.player.weapon.wear, FORCE.keep, 'round it, still out of reach');
  s.go(19.5, 14.5);
  assert.equal(s.player.weapon.wear, FORCE.last, 'on him: the next blow on a man uses it up (WEAR.man)');
  gunman.knocked = 2;
  s.tick();
  assert.equal(s.player.weapon.wear, FORCE.last, 'swept off his feet by the slide: it breaks on the blow that finishes him too');
  gunman.knocked = 0;
  s.go(21.5, 12.6);
  assert.equal(s.player.weapon.wear, FORCE.keep, 'backed off: it holds again');
  assert.ok(level.tutorial.stages[4].snatch && !level.tutorial.stages[2].snatch);
  assert.ok(gunman.yields && !s.guardAt(7, 19).yields, 'his gun is the player\'s whatever kills him (Character.yields), the others\' not');
  // the gun in his hand (snatched, or picked up) is empty and comes with nothing: the man past the fire door cannot
  // be shot. The magazine is that man's, handed as he is taken as a shield, once: then RELOAD
  Object.assign(s.player, { weapon: { type: 'pistol', mag: 0 }, def: { kind: 'gun', ammo: '9mm', mag: 7 } });
  s.world.events.emit('pickup', { ch: s.player, type: 'pistol' });
  assert.equal(s.player.ammo, 0, 'nothing to load it with');
  assert.deepEqual([level.tutorial.stages[4].leaves, level.tutorial.stages[4].spare], [0, undefined]);
  s.go(11.5, 14.6);
  const hostage = s.guardAt(9, 14);
  assert.ok(hostage.shieldOnly && hostage.invulnerable);
  assert.ok(!s.t.hints().some((h) => h.text === 'THROW IT'), 'nor is the empty gun to be thrown at him');
  assert.ok(s.t.mutes('throw'), 'and the HUD keeps its EMPTY - THROW IT to itself (ui/HUD.js)');
  // the prompt at the foot of the screen never repeats the key the hint gives on the man
  assert.deepEqual(unsaid([['use', 'SHIELD']], s.t.hints()), []);
  assert.deepEqual(unsaid([['attack', 'PUNCH'], ['use', 'SHIELD']], s.t.hints()), [['attack', 'PUNCH']]);
  assert.deepEqual(unsaid([['use', 'PICK UP 1911']], []), [['use', 'PICK UP 1911']], 'no hint: the prompt is said');
  s.world.events.emit('shield', { holder: s.player, target: hostage });
  assert.equal(s.player.ammo, 7, 'the magazine off his belt');
  assert.ok(!hostage.shieldOnly && !hostage.invulnerable, 'held, he is a man like any other: he takes the rounds, he can be killed');
  assert.ok(!s.t.mutes('throw'));
  s.world.events.emit('shield', { holder: s.player, target: hostage });
  assert.equal(s.player.ammo, 7, 'once');
  assert.deepEqual(s.t.hints().map((h) => h.text), ['RELOAD']);
  assert.ok(STAIRS.steps[0] * STAIRS.steps[1] + STAIRS.steps[2] < 0.7, 'and the men on the stairs are up in well under a second');
});

test('tutorial: a retry starts again at the last place reached, the rooms before it empty, the fire where it would be', () => {
  const s = stub(3);
  assert.equal(s.world.enemies.length + s.world.offstage.length, 7 - 3, 'the flat is behind him');
  assert.equal(s.world.removed.length, 3);
  assert.deepEqual([s.player.x, s.player.y], [px(18.6), px(10.5)]);
  assert.equal(s.t.owed, null);
  assert.equal(s.t.scene, null, 'no opening');
  assert.ok(s.world.doors[0].locked, 'his front door shut behind the man with the match');
  assert.deepEqual(s.log.restored, [3, px(17.6), px(2.35)], 'the fire played forward from where the match fell');
  s.tick();
  assert.equal(s.t.stage, 3, 'he stands in the back hall');
  assert.deepEqual(s.t.hints(), []);
});

test('tutorial: the shooter, pointed at from one stage and fought in the next, is still there on a retry of the second', () => {
  const s = stub(4);
  assert.equal(s.world.enemies.length + s.world.offstage.length, 4);
  assert.ok(s.guardAt(17, 14)?.dormant);
  s.tick();
  assert.ok(s.t.stage === 3 && s.guardAt(17, 14).dormant, 'he starts short of the corner');
  s.go(21.5, 14.5);
  assert.ok(!s.guardAt(17, 14).dormant, 'and is shot at as soon as he turns it');
});

test('tutorial: a retry at the landing finds the shooter gone and his gun, empty, at its feet', () => {
  const s = stub(5);
  assert.equal(s.world.offstage.length, 2);
  assert.equal(s.guardAt(17, 14), undefined);
  assert.deepEqual([s.t.owed.type, s.t.owed.mag], ['pistol', 0]);
  assert.ok(Math.hypot(s.t.owed.x - s.player.x, s.t.owed.y - s.player.y) < TILE * 1.2);
});

test('tutorial: past the window it is over, once; its panes are landed from in a roll', () => {
  const s = stub();
  let n = 0;
  s.world.events.on('tutorialEnd', () => n++);
  assert.deepEqual(s.world.windows.map((g) => g.def?.land), ['roll', 'roll', undefined], 'the corridor\'s window, not the bedroom\'s');
  s.go(4.5, 14.5);
  assert.equal(s.t.over, false);
  s.go(2.5, 14.5);
  s.go(1.5, 14.5);
  assert.ok(s.t.over && s.player.invulnerable);
  assert.equal(n, 1);
  // the jump is staged (LEAP): time all but stopped as the window goes up behind him, his roll, then his again
  assert.ok(s.t.leap);
  assert.deepEqual(s.t.hints(), []);
  assert.equal(s.t.pace(0.05, () => false), LEAP.blast.slow);
  assert.deepEqual([s.t.shot().name, s.t.shot().at], ['leapBlast', { x: px(3.5), y: px(15) }]);
  s.wait(LEAP.blast.at + 0.06);
  assert.deepEqual(s.log.blasts.at(-1).map(Math.round), [px(3.5) + LEAP.blast.inside, px(15), LEAP.blast.radius], 'a ball of fire in the window\'s frame, just inside it: he is seen against it');
  assert.ok(SHOTS.leapRoll.zoom === SHOTS.leapAir.zoom, 'held as close on his roll');
  assert.equal(s.t.exit(), null, 'no mark on the floor any more: it is a shot');
  assert.equal(s.t.pace(LEAP.blast.hold, () => false), LEAP.roll.slow);
  assert.equal(s.t.shot().name, 'leapRoll');
  assert.equal(s.t.pace(LEAP.roll.hold, () => false), 1);
  assert.equal(s.t.shot().name, 'leapOut');
  for (const name of ['leapAir', 'leapBlast', 'leapRoll', 'leapOut']) assert.ok(SHOTS[name], name);
  assert.ok(SHOTS.leapAir.zoom >= 1.5 && SHOTS.leapAir.ease >= 10 && SHOTS.leapOut.ease >= 8, 'a punch in, a snap back');
  // it starts as he goes through the window, in the air
  const j = stub(5);
  for (const e of [...j.world.offstage, ...j.world.enemies]) e.alive = false;
  j.go(4.5, 14.5);
  assert.equal(j.t.leap, null);
  j.player.vaulting = { kind: 'window', to: { x: px(2.6), y: px(14.5) } };
  j.tick();
  assert.ok(j.t.leap && !j.t.over);
  assert.equal(j.t.pace(0.05, () => false), LEAP.air.slow);
  assert.equal(j.t.shot().name, 'leapAir');
  // a window that does not give on the alley is a window like any other
  const k = stub();
  k.player.vaulting = { kind: 'window', to: { x: px(6.5), y: px(-0.5) } };
  k.tick();
  assert.equal(k.t.leap, null);
});

test('direction: a shot is eased toward, its zoom settling on a whole number of pixels; the view is drawn to what it looks at', () => {
  const d = new Direction();
  assert.equal(d.zoom, 1);
  d.set('wake', null, true, 4);
  assert.equal(d.zoom, Math.round(4 * SHOTS.wake.zoom) / 4, 'a cut: there at once, on a whole zoom');
  d.set('flat');
  const seen = [d.zoom];
  for (let i = 0; i < 30; i++) { d.update(1 / 60, 4); seen.push(d.zoom); }
  assert.ok(seen.every((z, i) => i === 0 || z <= seen[i - 1]), 'it eases out, never jumps back');
  assert.ok(seen[30] < seen[0] - 0.1 && seen[30] > 1.25, `half a second on: ${seen[30].toFixed(2)}`);
  for (let i = 0; i < 600; i++) d.update(1 / 60, 4);
  assert.equal(d.zoom, 1.25, 'at rest: 5 px a world px on a 4 px camera');
  assert.equal((d.zoom * 4) % 1, 0);
  d.set('flat');
  for (let i = 0; i < 600; i++) d.update(1 / 60, 3);
  assert.equal((Math.round(d.zoom * 3 * 1e6) / 1e6) % 1, 0, 'whole on a 3 px camera too');
  // looking at something: the view goes there and comes back
  d.set('laugh', { x: 500, y: 100 });
  for (let i = 0; i < 20; i++) d.update(1 / 60, 4);
  const mid = d.aim(100, 100).x;
  assert.ok(mid > 150 && mid < 480, `on its way: ${mid.toFixed(0)}`);
  for (let i = 0; i < 300; i++) d.update(1 / 60, 4);
  assert.ok(Math.abs(d.aim(100, 100).x - 500) < 2, 'all the way (pull 1)');
  d.set('bedroom');
  for (let i = 0; i < 300; i++) d.update(1 / 60, 4);
  assert.deepEqual(d.aim(100, 100), { x: 100, y: 100 }, 'back on the player');
  d.set(null);
  for (let i = 0; i < 600; i++) d.update(1 / 60, 4);
  assert.equal(d.zoom, 1, 'no shot: the usual view');
  d.set('run');
  for (let i = 0; i < 900; i++) d.update(1 / 60, 4);
  assert.equal(d.zoom, 0.75, 'wide for the run');
  for (const s of Object.values(SHOTS)) assert.ok(s.zoom >= 0.5 && s.zoom <= (s.even ? 4 : 2.5) && s.ease > 0) // (a close-up at the wheel: 2A's butt);
  assert.ok(SHOTS.wake.zoom > SHOTS.bedroom.zoom && SHOTS.bedroom.zoom > SHOTS.flat.zoom && SHOTS.flat.zoom > SHOTS.corridor.zoom && SHOTS.corridor.zoom > SHOTS.run.zoom,
    'very close on waking, closer than usual in the flat, wider and wider to the end');
});
