import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, PLAYER, ENEMY } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Tutorial, HINTS } = await load('game/systems/Tutorial.js');
const { default: Direction } = await load('game/systems/Direction.js');
const { default: level } = await load('game/data/levels/tutorial.js');
const { ENEMIES } = await load('game/world/Level.js');
const { LESSONS, BEAT, RELOAD, OPENING, BLAST, SHOTS, FRAME, FORCE, STAIRS } = await load('game/data/staging.js');
const { POSTS } = await load('game/data/posts.js');
const { MATCH_FALLS } = await load('game/ai/Pastimes.js');

const px = (v) => v * TILE;
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
  const player = { body, alive: true, isPlayer: true, armed: false, weapon: null, def: { kind: 'none' }, sit: 0, pinned: false, ammo: 0, died: null,
    reserveCount() { return this.ammo; }, addAmmo(c, n) { this.ammo += n; }, kill(a, cause) { if (!this.invulnerable) { this.alive = false; this.died = cause; } },
    get x() { return body.position.x; }, get y() { return body.position.y; } };
  const sounds = [], log = { slow: [], blasts: [], later: [], shakes: 0, restored: null };
  const door = (c, r) => ({ cells: [r * W + c], body: Matter.Bodies.rectangle(px(c), px(r), 4, 30), a0: 0, hx: px(c), hy: px(r), locked: false, lock() { this.locked = true; } });
  const stove = { type: 'oven', def: { gas: { fuse: [1, 2] } }, x: px(14.6), y: px(12.68), broke: 0, break() { this.broke++; } };
  const world = { events: new EventBus(), enemies, offstage: [], chars: [], player, items: [], level, game, removed: [], time: 0, texts: [],
    map: { w: W }, doors: [door(20, 2), door(13, 7)], windows: [{ cx: 3, cy: 14 }, { cx: 3, cy: 15 }, { cx: 6, cy: 0 }],
    props: [stove, { type: 'gas_bottle', def: { explosive: true, gas: { fuse: [1, 2] } }, x: px(15.5), y: px(12.7) }],
    fireSpread: { burning: [], restore(i, x, y) { log.restored = [i, x, y]; }, nearest: () => null },
    removeBody(b) { this.removed.push(b); }, sound(name) { sounds.push(name); },
    slowmo(scale, dur) { log.slow.push([scale, dur]); }, shake() { log.shakes++; },
    after(s, fn) { log.later.push({ t: this.time + s, fn }); }, explode(x, y, o) { log.blasts.push([x, y, o.radius]); },
    leave(e) { this.enemies = this.enemies.filter((o) => o !== e); this.left = e; },
    holdBack(e) { e.offstage = true; this.enemies = this.enemies.filter((o) => o !== e); this.offstage.push(e); },
    bringOn(e, x, y) { e.offstage = false; this.offstage = this.offstage.filter((o) => o !== e); Object.assign(e, { x, y }); this.enemies.push(e); } };
  const t = new Tutorial(world, level.tutorial, from);
  const tick = () => {
    t.update();
    for (const a of log.later.filter((q) => q.t <= world.time)) a.fn();
    log.later = log.later.filter((q) => q.t > world.time);
  };
  const go = (col, row) => { Matter.Body.setPosition(body, { x: px(col), y: px(row) }); tick(); };
  const wait = (s) => { for (let k = 0; k < s * 20; k++) { world.time += 0.05; tick(); } };
  // the guard of that tile of the actors layer, on the level or still to come up the stairs
  const guardAt = (c, r) => [...world.enemies, ...world.offstage].find((e) => e.tile === `${c},${r}`);
  // the opening played to its end (the match falls when the man's acts say it does)
  const opened = () => { wait(OPENING.light); world.events.emit('matchDrop', { x: px(17.6), y: px(2.35) }); wait(OPENING.gone + OPENING.shot + 0.2); };
  return { world, t, player, go, wait, tick, sounds, guardAt, log, stove, opened };
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
  assert.ok(level.props.some(([type, c, r]) => type === 'oven' && Math.hypot(c - B.at[0], r - B.at[1]) < 0.2), 'a stove where it blows');
  assert.ok(floor(...B.breach) && B.chain.every(([c, r]) => floor(c, r)), 'the fire comes down the corridor');
  assert.ok(level.props.some(([type, c, r]) => type === 'table' && Math.hypot(c - 9.5, r - 3.3) < 0.1), 'a table across his doorway');
  const [c0, r0, c1, r1] = level.tutorial.fall;
  assert.ok(floor(c0, r0) && floor(c1, r1), 'there is something to land on past the window');
  assert.ok(level.tiles.some((row) => row[c1 + 1] === 'G'), 'and a window to get there by');
  assert.deepEqual(level.drops.map((d) => [d[0], d[4]]), [['bat', null]], 'a bat; the only gun is the one a dead man leaves');
  assert.equal(level.tutorial.stages.find((s) => s.leaves !== undefined).leaves, 2, 'with two rounds in it');
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
  const shooter = s.guardAt(19, 14);
  assert.ok(shooter.dormant);
  s.go(21.5, 14.5); // the corner
  assert.equal(s.t.stage, 4);
  assert.ok(!shooter.dormant, 'the shooter wakes as he turns into the long corridor');
  s.go(11.5, 14.5); // by the landing
  const two = [s.guardAt(7, 19), s.guardAt(9, 19)], third = s.guardAt(8, 20);
  assert.ok([...two, third].every((g) => g.dormant && g.offstage), 'the men of the landing are still down the stairs');
  s.world.events.emit('pickup', { ch: s.player, type: 'pistol' });
  s.tick();
  assert.ok(two.every((g) => g.offstage), 'heard before they are seen');
  s.wait(0.5);
  assert.ok(s.sounds.filter((n) => n === 'step').length >= 2, 'their steps on the stairs');
  s.wait(2);
  assert.ok(two.every((g) => !g.dormant && !g.offstage && g.heard === 1), 'the gun in his hand calls two of them up the stairs');
  assert.ok(two.every((g) => Math.abs(g.y - px(20.65)) < 1), 'at the top of the stairs');
  assert.equal(two.filter((g) => g.said.includes('stairs')).length, 1, 'the first of them shouts');
  assert.ok(third.dormant && third.offstage);
  for (const g of two) {
    g.alive = false;
    s.world.events.emit('kill', { victim: g });
  }
  s.tick();
  s.wait(2.5);
  assert.ok(!third.dormant && !third.offstage, 'and the third when they are dead');
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

test('tutorial: a lesson is one short beat - slow, the camera punched in on it, then the hand given back', () => {
  const s = stub(), none = () => false;
  s.opened();
  // MOVE: the beat starts, the camera on him; it is NOT held until he acts
  assert.equal(s.t.pace(0.016, none), BEAT.slow, 'time crawls');
  assert.deepEqual([s.t.shot().name, s.t.shot().at], ['beat', { x: s.player.x, y: s.player.y }], 'punched in on what it is about');
  assert.equal(s.t.pace(0.5, none), BEAT.slow);
  assert.equal(s.t.pace(LESSONS.move.dur, none), 1, 'its time is up: normal speed, whatever he did');
  assert.equal(s.t.shot().name, 'bedroom', 'and the camera eases back');
  assert.deepEqual(s.t.hints().map((h) => h.text), ['MOVE'], 'the hint stays until it is done');
  assert.equal(s.t.pace(0.016, none), 1, 'said once');
  // his key cuts a beat short, once it has had time to register
  s.go(7.5, 3.3);
  assert.equal(s.t.pace(0.016, none), BEAT.slow, 'VAULT, near the table');
  assert.equal(s.t.pace(BEAT.min - 0.1, (k) => k === 'action'), BEAT.slow, 'too soon to cut');
  assert.equal(s.t.pace(0.2, (k) => k === 'move'), BEAT.slow, 'another key is not it');
  assert.equal(s.t.pace(0.016, (k) => k === 'action'), 1, 'SPACE: he has the hand at once');
  // what comes up together shares one beat, the camera between the two
  s.go(13.5, 9.5);
  s.world.items.push({ type: 'bat', x: px(12.5), y: px(10.7), dead: false });
  const cook = s.guardAt(11, 11);
  assert.equal(s.t.pace(0.016, none, (x) => x === px(12.5)), BEAT.slow, 'the bat is on screen: the beat, and the man with it');
  assert.deepEqual(s.t.lesson.ids, ['behind', 'take']);
  assert.deepEqual(s.t.shot().at, { x: (cook.x + px(12.5)) / 2, y: (cook.y + px(10.7)) / 2 });
  assert.equal(s.t.pace(BEAT.dur + 0.01, none), 1);
  assert.equal(s.t.pace(0.016, none), 1, 'neither is said again');
  // behind him: its own short beat
  s.player.nearTakedown = cook;
  assert.equal(s.t.pace(0.016, none), BEAT.slow);
  assert.equal(s.t.pace(LESSONS.neck.dur + 0.01, none), 1);
  // a retry does not say it all again
  const again = stub(2, s.world.game);
  again.world.game.taught = s.t.taught;
  const t2 = new Tutorial(again.world, level.tutorial, 2);
  Matter.Body.setPosition(again.player.body, { x: px(13.5), y: px(9.5) });
  t2.update();
  assert.equal(t2.pace(0.016, none), 1);
  // every lesson is a hint's id, short, and slow
  const ids = new Set(['behind', 'neck', 'run', ...Object.keys(HINTS)]);
  for (const [id, L] of Object.entries(LESSONS)) {
    const D = { ...BEAT, ...L };
    assert.ok(ids.has(id) && D.slow <= 0.3 && D.dur >= 0.7 && D.dur <= 1.6 && SHOTS[D.shot], `lesson ${id}`);
  }
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

test('tutorial: the gun the shooter drops is left with two rounds', () => {
  const s = stub();
  s.go(18.5, 14.5);
  const shooter = s.guardAt(19, 14), gun = { type: 'pistol', def: { kind: 'gun' }, mag: 5, x: shooter.x + 10, y: shooter.y, dead: false };
  const far = { type: 'pistol', def: { kind: 'gun' }, mag: 7, x: px(5), y: px(4), dead: false };
  shooter.alive = false;
  s.world.events.emit('kill', { victim: shooter });
  s.world.items.push(gun, far);
  s.tick();
  assert.equal(gun.mag, 2);
  assert.equal(far.mag, 7, 'another gun, elsewhere, is not his');
});

test('tutorial: the hints say one thing at a time, next to what it is about', () => {
  const s = stub(), names = () => s.t.hints().map((h) => h.text);
  s.opened();
  assert.deepEqual(names(), ['MOVE']);
  s.go(7.5, 3.5);
  assert.deepEqual(s.t.hints().map((q) => `${q.key} ${q.text} ${q.id}`), ['action VAULT vault'], 'he has walked: the table across his doorway');
  assert.deepEqual([s.t.hints()[0].ax, s.t.hints()[0].ay], [px(9.5), px(3.3)]);
  s.go(10.5, 3.5);
  assert.deepEqual(names(), [], 'the living room, nothing burning yet');
  s.world.fireSpread.burning.push(1);
  assert.deepEqual(s.t.hints().map((h) => `${h.key}|${h.text}`), ['|GET OUT'], 'pointed at the way out');
  s.go(13.5, 9.5);
  s.world.items.push({ type: 'bat', x: px(12.5), y: px(10.7), dead: false });
  assert.deepEqual(names(), ['GET BEHIND HIM', 'TAKE IT'], 'one thing about the man, one about the bat');
  s.player.nearTakedown = s.guardAt(11, 11);
  assert.deepEqual(s.t.hints().map((h) => `${h.key} ${h.text}`).slice(0, 1), ['attack BREAK HIS NECK']);
  s.player.nearTakedown = null;
  s.guardAt(11, 11).aware = 2;
  assert.deepEqual(names(), ['PUNCH HIM', 'TAKE IT'], 'he turned round: a punch');
  s.guardAt(11, 11).knocked = 2;
  assert.deepEqual(s.t.hints().map((h) => `${h.key} ${h.text}`), ['attack FINISH HIM', 'use TAKE IT'], 'a man on the floor comes first: the left click');
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
  assert.deepEqual(names(), ['RUN AND SLIDE UNDER HIS FIRE']);
  s.go(21.5, 14.5);
  assert.deepEqual(names(), ['RUN AND SLIDE UNDER HIS FIRE', 'STRIKE HIM'], 'and the man to hit, the bat in his hand');
  s.go(11.5, 14.5);
  Object.assign(s.player, { weapon: { type: 'pistol', mag: 2 }, def: { kind: 'gun' } });
  assert.deepEqual(names(), [], 'nobody to point at till they come up the stairs');
  s.wait(2.5);
  assert.deepEqual(names(), ['SHOOT']);
  s.player.weapon.mag = 0;
  s.player.ammo = 7;
  assert.deepEqual(s.t.hints().map((q) => `${q.key} ${q.text}`), ['reload RELOAD'], 'dry, a magazine left: R');
  s.player.reloading = 0.5;
  assert.deepEqual(names(), [], 'said until he does it');
  Object.assign(s.player, { reloading: 0, ammo: 0 });
  assert.deepEqual(names(), ['THROW IT'], 'dry for good: thrown. The window is not pointed at while they stand');
  for (const at of [[7, 19], [9, 19]]) s.guardAt(...at).alive = false;
  assert.deepEqual(names(), [], 'the window is not pointed at while one is still to come');
  s.guardAt(8, 20).alive = false;
  assert.deepEqual(s.t.hints().map((q) => `${q.key} ${q.text} ${q.id}`), [' GET OUT run'], 'nobody left: out, by the window');
  s.go(4.6, 14.6);
  assert.equal(s.t.hints()[0].text, 'GET OUT', 'at the window, not yet where SPACE takes him through');
  s.player.contextAction = 'DIVE THROUGH';
  assert.deepEqual(s.t.hints().map((q) => `${q.key} ${q.text} ${q.id}`), ['action DIVE dive'], 'the jump, when SPACE is a dive and no sooner');
});

test('tutorial: the last man down - the stove goes at once, then the fire comes down the corridor after him', () => {
  const s = stub(5), B = level.tutorial.blast, C = BLAST.chain, none = () => false;
  assert.ok(s.stove.staged, 'kept for the end: the fire does not set it off');
  s.go(11.5, 14.6);
  assert.equal(s.t.blast.t, null, 'not while they are still to come');
  assert.equal(s.t.exit(), null, 'and the way out is not marked yet');
  for (const g of s.world.offstage) g.alive = false;
  s.tick();
  assert.ok(s.t.blast.t !== null && s.player.invulnerable, 'the last man is down: it is set off, wherever he stands; its debris does not kill him');
  assert.deepEqual(s.t.exit(), { zone: [px(4), px(14), px(6), px(16)], window: [px(3), px(14), px(4), px(16)] }, 'the floor before the window and the window are marked');
  // the beat: slow, the camera on the stove going, GET OUT
  assert.equal(s.t.pace(0.016, none, () => false), LESSONS.run.slow, 'no need for the window to be on screen');
  assert.deepEqual([s.t.shot().name, s.t.shot().at, s.t.hints()[0].text], ['beatWide', { x: px(14.6), y: px(14.3) }, 'GET OUT']);
  assert.ok(LESSONS.run.slow * LESSONS.run.dur > BLAST.after + BLAST.breach[0], 'the stove and the breach go inside the beat');
  s.wait(BLAST.after + 0.06);
  assert.equal(s.stove.broke, 1, 'the stove torn open');
  s.wait(BLAST.breach[0] + 0.05);
  assert.deepEqual(s.log.blasts, [[px(14.6), px(14.3), BLAST.breach[1]]], 'then the ball of fire out of the breach');
  assert.equal(s.t.pace(LESSONS.run.dur, none), 1, 'and he has the hand');
  // the chain: each ball nearer the window and bigger, quicker and quicker; he runs ahead of it all the way, even
  // from the far end of the landing's stretch, half a second late
  assert.ok(B.chain.every(([c, , r], k) => k === 0 || (c < B.chain[k - 1][0] && r >= B.chain[k - 1][2])), 'nearer and bigger');
  assert.ok(C.gap[1] < C.gap[0], 'quicker and quicker');
  let t = BLAST.after + BLAST.breach[0];
  const window = px(4.4), speed = PLAYER.speed * 60, late = LESSONS.run.slow * LESSONS.run.dur + 0.5;
  B.chain.forEach(([c, , r], k) => {
    t += k ? C.gap[0] + ((C.gap[1] - C.gap[0]) * k) / (B.chain.length - 1) : C.first;
    const runner = Math.max(window, px(12.9) - speed * Math.max(0, t - late));
    assert.ok(runner < px(c) - r * C.kill - 16 || runner === window, `ball ${k} at ${t.toFixed(2)} s: he is ${Math.round(px(c) - runner)} px ahead of it`);
  });
  const last = B.chain.at(-1);
  assert.ok(px(12.9) - speed * (t - late) < window - 60, 'and has had time to be through the window before the last');
  assert.ok(px(last[0]) - last[2] * C.kill < px(4.6), 'which reaches the foot of the window: no standing there');
  // standing still, he is caught by it
  s.wait(t - BLAST.after - BLAST.breach[0] + 0.1);
  assert.ok(!s.player.alive && s.player.died === 'explosion', 'the fire kills who waits for it');
  assert.ok(s.log.blasts.length >= 3 && s.log.blasts.length <= 1 + B.chain.length);
  // through the window in time: what is left of the chain goes off right behind him
  const d = stub(5);
  for (const e of d.world.offstage) e.alive = false;
  d.go(5.5, 14.6);
  d.wait(BLAST.after + BLAST.breach[0] + C.first + 0.1);
  const before = d.log.blasts.length;
  assert.ok(before < 1 + B.chain.length);
  d.go(1.5, 14.5);
  assert.ok(d.t.over);
  d.wait(C.rush * B.chain.length + 0.1);
  assert.equal(d.log.blasts.length, 1 + B.chain.length, 'all of it, at once');
  assert.ok(d.player.alive && d.player.invulnerable, 'and none of it on him');
  // with a god's shield he is left alone, and it is handed back as it was
  const g = stub(5);
  g.player.invulnerable = true;
  for (const e of g.world.offstage) e.alive = false;
  g.go(8.5, 14.5);
  g.wait(t + C.tail + 0.2);
  assert.ok(g.player.alive && g.player.invulnerable);
});

test('tutorial: a lesson waits until what it is about is on screen and he is near enough to do it', () => {
  const s = stub(3), none = () => false;
  s.world.game.taught?.clear?.();
  s.tick();
  assert.deepEqual(s.t.hints().map((h) => h.text), ['RUN AND SLIDE UNDER HIS FIRE'], 'said from the back hall');
  assert.equal(s.t.pace(0.016, none), 1, 'but no slow motion there');
  s.go(21.5, 12.4);
  assert.equal(s.t.pace(0.016, none), 1, 'nor down the corridor');
  s.go(21.5, 13.4);
  assert.equal(s.t.pace(0.016, none), BEAT.slow, 'at the corner');
  // one slide from the corner sweeps the gunman off his feet (while the slide is still faster than a run)
  const gunman = s.guardAt(19, 14), corner = { x: px(21.5), y: px(14.5) };
  assert.ok(Math.abs(gunman.y - corner.y) < 1 && corner.x - gunman.x - 2 * PLAYER.radius < 50, `he stands ${corner.x - gunman.x} px from the corner`);
  // the second man of the kitchen: called from behind his door, framed by the camera, the beat when he is on him
  const k = stub(2);
  k.tick();
  const cook = k.guardAt(11, 11), second = k.guardAt(19, 10);
  assert.equal(k.t.shot().name, 'flat');
  cook.alive = false;
  k.world.events.emit('kill', { victim: cook });
  k.tick();
  second.aware = 2;
  assert.deepEqual([k.t.shot().name, k.t.shot().at], ['threat', second], 'the camera frames him with the player');
  assert.equal(k.t.hints()[0].text, 'PUNCH HIM');
  for (const id of ['behind', 'take']) k.t.taught.add(id);
  assert.equal(k.t.pace(0.016, none, () => false), 1, 'off the picture: time is not slowed for him');
  assert.equal(k.t.pace(0.016, none, () => true), 1, 'on it but across the room: not yet');
  Object.assign(second, { x: k.player.x + 80, y: k.player.y });
  assert.equal(k.t.pace(0.016, none, () => true), BEAT.slow, 'near enough to hit: now');
  assert.deepEqual([k.t.shot().name, k.t.shot().at], ['beat', { x: second.x, y: second.y }], 'the camera punched in on him');
  assert.ok(LESSONS.punch.within < FRAME.near + 40 && SHOTS.threat.pull > 0 && SHOTS.threat.pull < 1);
});

test('tutorial: the reload - the world all but stops while his hands work, and nobody fires until it is done and a beat', () => {
  const s = stub(5), p = s.player, none = () => false;
  s.world.game.timeScale = 1;
  Object.assign(p, { armed: true, weapon: { type: 'pistol', mag: 1 }, def: { kind: 'gun', ammo: '9mm', mag: 7 }, ammo: 7, reloading: 0 });
  s.go(11.5, 14.6);
  s.wait(1);
  const men = s.world.enemies.filter((e) => !e.dormant);
  assert.ok(men.length >= 2 && men.every((g) => !g.react), 'the men up the stairs, free to fire');
  for (const id of ['shoot', 'take']) s.t.taught.add(id);
  assert.equal(s.t.pace(0.016, none), 1);
  p.weapon.mag = 0;
  s.tick();
  assert.ok(men.every((g) => g.react > 0), 'dry, a magazine left: they hold their fire');
  assert.equal(s.t.pace(0.016, none), BEAT.slow, 'the RELOAD beat');
  assert.equal(s.t.pace(LESSONS.reload.dur + 0.01, none), 1);
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

test('tutorial: the bat holds until the corridor\'s gunman and breaks on him; his gun comes with a magazine to spare', () => {
  const s = stub(4);
  s.tick();
  Object.assign(s.player, { armed: true, weapon: { type: 'bat', wear: 1 }, def: { kind: 'melee', wear: 3 } });
  s.tick();
  assert.equal(s.player.weapon.wear, FORCE.keep, 'worn as it was, it will not break on anything before him');
  const gunman = s.guardAt(19, 14);
  assert.ok(gunman.dormant && s.player.weapon.wear >= FORCE.keep, 'short of the corner, still far from him');
  s.go(21.5, 14.5);
  assert.ok(!gunman.dormant);
  assert.equal(s.player.weapon.wear, FORCE.last, 'round it, on him: the next blow on a man uses it up (WEAR.man)');
  gunman.knocked = 2;
  s.tick();
  assert.equal(s.player.weapon.wear, FORCE.last, 'swept off his feet by the slide: it breaks on the blow that finishes him too');
  gunman.knocked = 0;
  s.go(21.5, 12.6);
  assert.equal(s.player.weapon.wear, FORCE.keep, 'backed off: it holds again');
  assert.ok(level.tutorial.stages[4].snatch && !level.tutorial.stages[2].snatch);
  // the gun in his hand (snatched, or picked up): one magazine in his pocket, once
  Object.assign(s.player, { weapon: { type: 'pistol', mag: 2 }, def: { kind: 'gun', ammo: '9mm', mag: 7 } });
  s.world.events.emit('pickup', { ch: s.player, type: 'pistol' });
  assert.equal(s.player.ammo, 7);
  s.world.events.emit('pickup', { ch: s.player, type: 'pistol' });
  assert.equal(s.player.ammo, 7, 'once');
  assert.equal(level.tutorial.stages[4].leaves, 2, 'two rounds in it: he will have to reload');
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
  assert.deepEqual(s.t.hints().map((h) => h.text), ['RUN AND SLIDE UNDER HIS FIRE']);
});

test('tutorial: the shooter, pointed at from one stage and fought in the next, is still there on a retry of the second', () => {
  const s = stub(4);
  assert.equal(s.world.enemies.length + s.world.offstage.length, 4);
  assert.ok(s.guardAt(19, 14)?.dormant);
  s.tick();
  assert.ok(s.t.stage === 3 && s.guardAt(19, 14).dormant, 'he starts short of the corner');
  s.go(21.5, 14.5);
  assert.ok(!s.guardAt(19, 14).dormant, 'and is shot at as soon as he turns it');
});

test('tutorial: a retry at the landing finds the shooter gone and his gun, two rounds in it, at its feet', () => {
  const s = stub(5);
  assert.equal(s.world.offstage.length, 3);
  assert.equal(s.guardAt(19, 14), undefined);
  assert.deepEqual([s.t.owed.type, s.t.owed.mag], ['pistol', 2]);
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
  assert.equal(s.t.shot().name, 'dive');
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
  for (const s of Object.values(SHOTS)) assert.ok(s.zoom >= 0.5 && s.zoom <= 2.5 && s.ease > 0);
  assert.ok(SHOTS.wake.zoom > SHOTS.bedroom.zoom && SHOTS.bedroom.zoom > SHOTS.flat.zoom && SHOTS.flat.zoom > SHOTS.corridor.zoom && SHOTS.corridor.zoom > SHOTS.run.zoom,
    'very close on waking, closer than usual in the flat, wider and wider to the end');
});
