// A guard taken from behind with a hand free has his head driven into what stands in front of him: a toilet, a
// urinal, a sink, a table or a counter, a wall (systems/TakedownSpot.js, data/finishers.js, Player.updateTakedown).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { spotFor } = await load('game/systems/TakedownSpot.js');
const { newTakedown, advance, lockedFor, slamAt } = await load('game/systems/Takedown.js');
const { TAKEDOWNS, SLAMS, SPOT, freeHand, hintOf, takedownFor } = await load('game/data/finishers.js');
const { KNEELS, LEDGE, BOWL } = await load('game/data/wounds.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { PROPS } = await load('game/data/props.js');
const { SCORING } = await load('game/data/scoring.js');
const { MOMENTS } = await load('game/data/feel.js');
const { TILE } = await load('game/Config.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Player } = await load('game/entities/Player.js');
const { default: Clutter } = await load('game/systems/Clutter.js');
const { default: Scoring, killTags } = await load('game/systems/Scoring.js');
const { throatPlan, throatPose } = await load('game/fx/DyingPose.js');

// a room 6 x 5 tiles inside a wall; a doorway in the east wall (row 2)
const ROOM = ['########', '#......#', '#......D', '#......#', '#......#', '########'];
const map = () => new TileMap(ROOM);
// a prop of `type` at (x, y) as the level makes it (only what the pick reads: its type, def and body)
const prop = (type, x, y, deg = 0) => {
  const d = PROPS[type], angle = (deg * Math.PI) / 180;
  const body = d.r ? Matter.Bodies.circle(x, y, d.r, { angle }) : Matter.Bodies.rectangle(x, y, d.w, d.h, { angle });
  return { type, def: d, body, dead: false };
};
const guard = (x, y, angle) => ({ x, y, angle });

test('env takedown: every prop it names exists, every kind has its move, a reach and a rank', () => {
  for (const [type, s] of Object.entries(SLAMS)) {
    assert.ok(PROPS[type], type);
    assert.ok(TAKEDOWNS[s.kind]?.context === s.kind, `${type}: ${s.kind}`);
    assert.ok(s.kind !== 'ledge' || s.name, `${type}: a ledge has a name for the hint`);
  }
  for (const f of Object.values(TAKEDOWNS).filter((t) => t.context)) {
    assert.ok(SPOT.reach[f.context] > 0 && SPOT.order.includes(f.context), f.context);
    assert.ok(f.grip === 'hair' && f.stand >= 10 && f.into >= 0, f.context);
    assert.ok(f.noise > TAKEDOWNS.neck.noise, `${f.context}: the slam is heard, louder than a neck snap`);
    assert.ok(f.wound === 'crush' && f.cause === 'melee', f.context);
  }
  // within about 0.7 to 0.9 m of him (1 m = 32 px)
  assert.ok(SPOT.reach.wall <= 0.75 * 32 && SPOT.reach.ledge <= 0.95 * 32 && SPOT.reach.bowl <= 0.85 * 32);
  assert.equal(hintOf(TAKEDOWNS.ledge, { name: 'BAR' }), 'SLAM ON BAR');
  assert.equal(hintOf(TAKEDOWNS.wall, {}), 'WALL SMASH');
  assert.equal(hintOf(TAKEDOWNS.bowl, {}), 'TOILET');
});

test('env takedown: a hand free means bare hands, a handgun, a blade or a short club', () => {
  for (const t of ['fists', 'pistol', 'uzi', 'uzi_silenced', 'knife', 'cue_half', 'tire_iron']) assert.ok(freeHand(WEAPONS[t]), t);
  for (const t of ['rifle', 'shotgun', 'sniper', 'bazooka', 'bat', 'cue']) assert.ok(!freeHand(WEAPONS[t]), t);
  const spot = { kind: 'wall' };
  assert.equal(takedownFor(WEAPONS.fists, null, spot), TAKEDOWNS.wall);
  assert.equal(takedownFor(WEAPONS.knife, { type: 'knife' }, spot), TAKEDOWNS.wall);
  assert.equal(takedownFor(WEAPONS.rifle, { type: 'rifle', mag: 5 }, spot), TAKEDOWNS.long, 'two hands on a rifle: its own');
  assert.equal(takedownFor(WEAPONS.bat, { type: 'bat' }, spot), TAKEDOWNS.club);
  assert.equal(takedownFor(WEAPONS.fists, null, null), TAKEDOWNS.neck, 'nothing in front of him: the neck');
});

test('env takedown: the pick - toilet over table over wall, the nearest of a kind, only within reach', () => {
  const m = map(), x = 100, y = 64 + 16;
  // he faces the west wall (x = 32) from 22 px off it: a wall
  let s = spotFor(guard(32 + 20, y, Math.PI), m, []);
  assert.equal(s?.kind, 'wall');
  assert.ok(Math.abs(s.x - 33) < 1.5 && s.nx === 1 && s.ny === 0 && s.prop === null, JSON.stringify(s));
  assert.equal(spotFor(guard(32 + 30, y, Math.PI), m, []), null, 'a step too far from the wall');
  // a table just ahead of him (east), the wall further: the table
  const table = prop('table', x + 14 + 13, y, 90);
  s = spotFor(guard(x, y, 0), m, [table]);
  assert.equal(s?.kind, 'ledge');
  assert.equal(s.prop, table);
  assert.equal(s.name, 'TABLE');
  assert.ok(s.nx < -0.99 && Math.abs(s.d - 14) < 1.5, `${s.nx} ${s.d}`);
  // a toilet off to his side within the fan beats the table straight ahead
  const toilet = prop('toilet', x + 18, y + 14, 90);
  s = spotFor(guard(x, y, 0), m, [table, toilet]);
  assert.equal(s?.kind, 'bowl');
  assert.equal(s.prop, toilet);
  // ... and a table beats a wall
  const crate = prop('crate', 32 + 10, y - 17);
  s = spotFor(guard(32 + 20, y, Math.PI), m, [crate]);
  assert.equal(s?.kind, 'ledge', 'a crate off to his side, the wall right ahead');
  assert.equal(s.name, 'CRATE');
  // something he cannot be slammed on stands in the way: it hides the wall behind it
  const arcade = prop('arcade', 32 + 8, y);
  assert.equal(spotFor(guard(32 + 30, y, Math.PI), m, [arcade]), null);
  // behind him, nothing counts
  assert.equal(spotFor(guard(x, y, Math.PI), m, [prop('table', x + 27, y, 90)]), null);
  // hung overhead (a lamp over the table) does not hide the table
  const lamp = { ...prop('pool_lamp', x + 20, y), def: PROPS.pool_lamp };
  assert.equal(spotFor(guard(x, y, 0), m, [lamp, table])?.kind, 'ledge');
});

test('env takedown: a wall behind a doorway does not count, the jamb beside it does', () => {
  // facing east toward the doorway (col 7, row 2) from inside the room: beyond it is the void, never a wall to slam on
  const m = new TileMap(['##########', '#......#.#', '#.........', '#......#.#', '##########']);
  // a wall beyond the doorway at col 9 rows 1 and 3 only; along row 2 the ray goes through the doorway (col 7)
  const y = 2 * TILE + 16;
  assert.equal(spotFor(guard(7 * TILE - 4, y, 0), m, []), null, 'the doorway itself');
  const m2 = new TileMap(['#####', '#..D#', '#####']);
  // he stands at the doorway's mouth facing it: what is beyond the door tile is a wall 32 px on: never in front of him
  assert.equal(spotFor(guard(3 * TILE - 6, TILE + 16, 0), m2, []), null);
  // the jamb: the wall tile beside the doorway, right in front of him
  const s = spotFor(guard(3 * TILE - 14, 16, 0), new TileMap(['...#', '...D', '...#']), []);
  assert.equal(s?.kind, 'wall', 'the jamb');
});

// ---- the move, played by the player on a world that only knows what it needs ----
const noop = () => {};
const sink = new Proxy({}, { get: () => noop });
const only = (fns) => new Proxy(fns, { get: (t, k) => t[k] || noop }); // these counted, anything else a no-op
function scene(type, spotProps = []) {
  const heard = [], sounds = [], fx = { drops: 0, chips: 0, walls: 0, splashes: 0, blood: 0, spills: [] };
  const events = new EventBus();
  events.on('spill', (s) => fx.spills.push(s));
  const w = {
    particles: only({ drops: () => fx.drops++, chips: () => fx.chips++, blood: () => fx.blood++ }),
    decals: only({ wallHit: () => fx.walls++, splashWall: () => fx.splashes++ }),
    camera: sink, events, time: 0, slowmo: noop, hitstop: noop, shake: noop, light: noop, emit: noop,
    sound: (name) => sounds.push(name), noise: (x, y, r, src, kind) => heard.push([r, kind]), damageWall: () => fx.walls++,
    map: map(), lineOfSight: () => true, enemies: [], props: spotProps, items: [], corpses: [],
  };
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: Math.PI, strike: 0, punchSide: 1, recoil: 0,
    body: Matter.Bodies.circle(32 + 40, 80, 10) });
  p.setWeapon(type === 'fists' ? null : type);
  p.muzzleNote = { def: p.def, x: 14, y: 2, da: 0 };
  // he stands 20 px off the west wall, facing it; the player behind him
  const g = {
    alive: true, angle: Math.PI, voice: 1, held: null, knocked: 0, yielded: false, body: Matter.Bodies.circle(32 + 20, 80, 10), vel: { x: 0, y: 0 },
    get x() { return this.body.position.x; }, get y() { return this.body.position.y; },
    kill(a, cause, killer, by, how) { this.alive = false; Object.assign(this, { a, cause, killer, by, how, killedAt: w.time }); },
  };
  return { w, p, g, heard, sounds, fx };
}
function play(s, until = 3) {
  const { w, p, g } = s, dt = 1 / 60, start = w.time, track = { held: [], stand: [] };
  p.startTakedown(g);
  while (p.takedown && w.time - start < until) {
    w.time += dt;
    p.updateTakedown(dt);
    track.held.push(g.held === p || !p.takedown);
    track.stand.push(g.x - 33);
  }
  return track;
}

test('env takedown: against a wall, the slams land on their beats, the last kills, the player is locked in for its length', () => {
  for (const type of ['fists', 'pistol', 'knife', 'tire_iron']) {
    const s = scene(type), f = TAKEDOWNS.wall;
    assert.equal(s.p.takedownMove(s.g).f, f, type);
    const tr = play(s);
    assert.ok(!s.p.takedown && tr.held.every(Boolean), `${type}: held throughout, then let go`);
    assert.ok(Math.abs(s.w.time - lockedFor(f)) < 0.05, `${type}: ${s.w.time.toFixed(2)} s`);
    assert.ok(Math.abs(s.g.killedAt - (lockedFor(f) - f.after)) < 0.05, `${type}: killed on the last beat`);
    assert.deepEqual([s.g.cause, s.g.by.wound, s.g.how.dying, s.g.how.env, s.g.how.from], ['melee', 'crush', 'wall', 'wall', 'behind']);
    // pulled to the wall, square to it, and the wall takes every blow
    assert.ok(Math.abs(tr.stand[30] - f.stand) < 1.5, `${type}: ${tr.stand[30].toFixed(1)} px off the wall`);
    assert.ok(Math.abs(Math.cos(s.g.angle) + 1) < 0.01, 'facing it');
    const blows = f.beats.filter(([, w]) => w === 'smash').length;
    assert.equal(s.sounds.filter((n) => n === 'headSlamWall').length, blows);
    assert.ok(s.fx.walls >= blows * 2 && s.fx.splashes >= blows, 'dented and splashed each time');
    assert.equal(s.heard.length, blows, 'every slam is heard');
    assert.ok(s.heard.every(([r]) => r === f.noise));
    if (type === 'pistol') assert.equal(s.p.weapon.mag, WEAPONS.pistol.mag, 'no round fired');
  }
  // a rifle keeps both hands on it: its own takedown, the wall or not
  const s = scene('rifle');
  assert.equal(s.p.takedownMove(s.g).f, TAKEDOWNS.long);
  assert.equal(s.p.takedownMove(s.g).spot, null);
});

test('env takedown: each move lands every beat on time and the kill on the last one', () => {
  for (const f of Object.values(TAKEDOWNS).filter((t) => t.context)) {
    const td = newTakedown(f), dt = 1 / 240, times = [];
    let t = 0;
    while (!td.over && t < 3) {
      t += dt;
      for (const what of advance(td, dt)) times.push([t, what, td.done]);
    }
    let at = 0;
    f.beats.forEach(([wait, what], i) => {
      at += wait;
      assert.ok(Math.abs(times[i][0] - at) < 2 * dt && times[i][1] === what, `${f.context}: ${what}`);
      assert.equal(times[i][2], i === f.beats.length - 1, `${f.context}: only the last kills`);
    });
    assert.ok(Math.abs(t - lockedFor(f)) < 2 * dt, f.context);
    assert.ok(f.beats.filter(([, w]) => w === 'smash' || w === 'dunk').length >= 2, `${f.context}: two blows at least`);
  }
  assert.equal(TAKEDOWNS.bowl.beats.filter(([, w]) => w === 'struggle').length, 2, 'two beats of struggle at the toilet');
});

test('env takedown: the head is pulled back before each blow and lands in it on the beat', () => {
  for (const f of Object.values(TAKEDOWNS).filter((t) => t.context)) {
    const td = newTakedown(f), dt = 1 / 240;
    let peakBack = 0, lastDrive = 0;
    while (!td.done) {
      const before = td.i, landed = advance(td, dt);
      if (td.done) break;
      const sl = slamAt(td);
      assert.ok(sl.drive >= 0 && sl.drive <= 1 && sl.back >= 0 && sl.back <= 1, f.context);
      const what = f.beats[td.i][1];
      if ((what === 'smash' || what === 'dunk') && td.i === before) peakBack = Math.max(peakBack, sl.back);
      if (landed.some((w) => w === 'smash' || w === 'dunk')) {
        assert.ok(lastDrive > 0.85, `${f.context}: in contact as it lands (${lastDrive.toFixed(2)})`);
        assert.ok(peakBack > 0.9, `${f.context}: pulled right back first`);
        peakBack = 0;
      }
      lastDrive = sl.drive;
    }
  }
});

test('env takedown: at a toilet he is dunked, the water thrown out; at a table what stands on it is knocked off', () => {
  // the toilet against the west wall, he faces it
  const toilet = { ...prop('toilet', 32 + 1, 80, 90), hits: [], hit(d, x, y, a, power, kind) { this.hits.push([power, kind]); } };
  let s = scene('fists', [toilet]);
  assert.equal(s.p.takedownMove(s.g).spot.kind, 'bowl');
  play(s);
  assert.equal(s.g.how.env, 'bowl');
  assert.equal(s.g.how.dying, 'bowl');
  assert.equal(toilet.hits.length, 2, 'two dunks');
  assert.ok(toilet.hits.every(([pw, k]) => k === 'blunt' && pw > 1));
  assert.ok(s.fx.drops > 0 && s.fx.spills.some((p) => p.kind === 'water'), 'the bowl splashes over the floor');
  assert.equal(s.sounds.filter((n) => n === 'toiletDunk').length, 2);
  // a table with its glasses: the slam knocks them off (the same propHit a blow fires)
  const table = { ...prop('table', 29, 80, 90), W: 26, H: 44, centre() { return this.body.position; } };
  s = scene('fists', [table]);
  table.hit = function (d, x, y, a, power, kind) { s.w.events.emit('propHit', { prop: this, x, y, dirA: a, kind, power }); };
  const clutter = new Clutter({ ...s.w, debris: [], addDebris: noop, smoke: sink });
  clutter.attach(table, 'booth');
  const before = clutter.items(table).filter((i) => i.state === 'on').length;
  assert.equal(s.p.takedownMove(s.g).spot.kind, 'ledge');
  play(s);
  const after = clutter.items(table).filter((i) => i.state === 'on').length;
  assert.ok(after < before, `${before} -> ${after} left standing`);
  assert.equal(s.sounds.filter((n) => n === 'headSlamWood').length, 2);
});

test('env takedown: the kill is scored as a takedown, ENVIRONMENTAL or FLUSHED on top', () => {
  const p = { isPlayer: true }, quiet = { now: 10, dodgeT: -99, pickT: -99, streak: 1 };
  assert.deepEqual(killTags({ killer: p, how: { from: 'behind', env: 'wall' } }, quiet), ['behind', 'slammed']);
  assert.deepEqual(killTags({ killer: p, how: { from: 'behind', env: 'ledge' } }, quiet), ['behind', 'slammed']);
  assert.deepEqual(killTags({ killer: p, how: { from: 'behind', env: 'bowl' } }, quiet), ['behind', 'flushed']);
  assert.deepEqual(killTags({ killer: p, how: { from: 'behind', env: 'urinal' } }, quiet), ['behind', 'flushed']);
  const w = { events: new EventBus(), time: 0, totalEnemies: 3, enemies: [] }, sc = new Scoring(w);
  const said = [];
  w.events.on('scored', (e) => said.push(e));
  const victim = { isEnemy: true, aware: 1, x: 0, y: 0 };
  victim.held = p;
  w.events.emit('kill', { victim, cause: 'melee', killer: p, how: { label: 'TOILET DUNK', from: 'behind', env: 'bowl' } });
  const T = SCORING.tags, st = SCORING.styles.takedown;
  assert.equal(sc.points, st.points + T.behind.points + T.flushed.points);
  assert.deepEqual(said[0].labels, ['TOILET DUNK', 'FLUSHED', 'FROM BEHIND']);
  assert.equal(sc.styled.flushed, 1);
  assert.ok(T.slammed.label === 'ENVIRONMENTAL' && T.flushed.points > T.slammed.points);
  assert.ok(MOMENTS.slam.stop > 0 && MOMENTS.slamKill.stop > MOMENTS.slam.stop, 'each blow held a moment, the last longer');
});

test('env takedown: folded over the bowl or a table he stays on his knees, his head on it, for good', () => {
  const G = { arms: [{ x: -6, y: -5, len: 8 }, { x: 6, y: -5, len: 8 }], legs: [{ x: -3, y: 6, len: 10 }, { x: 3, y: 6, len: 10 }], half: 7 };
  for (const T of [LEDGE, BOWL]) {
    // he starts bent over what his head was driven into (his length long from above, the head not sat back)
    const plan = throatPlan(3, T), p0 = throatPose(plan, 0, G, T), end = throatPose(plan, plan.dur, G, T);
    assert.ok(p0.arch > 0.8 && Math.abs(p0.head.dy) < 1e-9, `starts bent over: ${p0.arch}`);
    assert.ok(T.stay && end.fall <= T.over + 1e-9 && end.arch < 0.95, 'still folded over it, for good');
    for (const l of end.legs) assert.ok(l.s < 0.8, 'still on his knees');
  }
  assert.ok(KNEELS.ledge === LEDGE && KNEELS.bowl === BOWL);
  // a crate or a keg is too low to be folded over: he is sat against it
  assert.equal(SLAMS.crate.rest, 'sit');
  assert.equal(SLAMS.keg.rest, 'sit');
  for (const t of ['table', 'pool_table', 'bar_counter', 'desk']) assert.equal(SLAMS[t].rest, undefined, t);
});

// a dead body made by fx/Gore.js in a world that only knows what it needs (no DOM in Node: the sprites are 8 px
// placeholders on a canvas that draws nothing)
async function deadWorld() {
  globalThis.document ??= { createElement: () => ({ width: 8, height: 8, getContext: () => sink }) };
  const { sprite } = await load('engine/Assets.js');
  const { gore } = await load('game/fx/Gore.js');
  sprite('characters/thug_gib_torso'); // a body for him (fx/Gore.js hasRagdoll)
  const corpses = [], bodies = [];
  const w = {
    particles: sink, decals: sink, events: new EventBus(), sound: noop, shake: noop, hitstop: noop, emit: noop, time: 0,
    map: map(), addBody: (b) => b.collisionFilter && bodies.push(b), physics: { bodies: () => bodies }, addCorpse: (c) => corpses.push(c),
    items: [], windows: [], doors: [], engine: { world: Matter.Composite.create() }, removeBody: noop,
  };
  return { w, corpses, gore };
}

test('env takedown: slammed on furniture he stays against it, square to it, and does not move', async () => {
  const { w, corpses, gore } = await deadWorld();
  // the furniture's face at x = 120, facing west (the room); he stood 10 px off it, facing it (east)
  const face = { x: 119, y: 96, nx: -1, ny: 0 };
  for (const [rest, dying] of [['fold', 'ledge'], ['sit', 'sit']]) {
    const prop = { dead: false, dying: false, bloody: noop };
    const ch = { x: face.x - 10, y: 96, angle: 0, kind: 'thug', held: {}, knocked: 0, isEnemy: true };
    gore(w, ch, 0, 'melee', { gore: 0, wound: 'crush' }, { dying, env: 'ledge', from: 'behind', against: { prop, ...face } });
    const r = corpses.at(-1), t = r.torso.body;
    for (let i = 0; i < 90; i++) r.update(1 / 60);
    const at = { x: t.position.x, y: t.position.y, a: t.angle };
    // the head (the torso's -y) toward the furniture: along his facing whether folded over it or sat against it
    const head = t.angle - Math.PI / 2;
    assert.ok(Math.abs(Math.atan2(Math.sin(head), Math.cos(head))) < 0.5, `${rest}: square to it (${head.toFixed(2)})`);
    assert.ok(Math.abs(at.y - 96) < 1.5 && at.x < 120 && at.x > 120 - 14, `${rest}: against its edge: ${at.x.toFixed(1)}`);
    assert.ok(rest === 'sit' ? r.dying.sat : r.dying.T.stay, rest);
    for (let i = 0; i < 180; i++) r.update(1 / 60);
    assert.ok(Math.hypot(t.position.x - at.x, t.position.y - at.y) < 0.01 && Math.abs(t.angle - at.a) < 0.01, `${rest}: still 3 s on`);
    // the table tipped over or broken: he drops where he is
    prop.dead = true;
    r.update(1 / 60);
    assert.equal(r.dying, null, `${rest}: let go`);
  }
});

test('env takedown: smashed into a wall he slumps down it and stays sat against it, head lolled', async () => {
  const { w, corpses, gore } = await deadWorld();
  // he stood 11 px off the west wall (its face at x = 32), facing it; the blow along his facing
  const ch = { x: 32 + 11, y: 80, angle: Math.PI, kind: 'thug', held: {}, knocked: 0, isEnemy: true };
  gore(w, ch, Math.PI, 'melee', { gore: 0, wound: 'crush' }, { dying: 'wall', env: 'wall', from: 'behind' });
  const [r] = corpses;
  assert.ok(r?.dying?.sat, 'sat against it');
  for (let i = 0; i < 60; i++) r.update(1 / 60);
  const t = r.torso.body.position;
  assert.ok(r.dying?.sat && r.dying.phase === 'sit', 'and stays there');
  assert.ok(t.x > 32 && t.x < 32 + 14 && Math.abs(t.y - 80) < 1, `his back to the wall: ${t.x.toFixed(1)}, ${t.y.toFixed(1)}`);
  assert.ok(r.dying.P.head.a !== 0, 'his head lolled to a side');
});
