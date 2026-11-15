import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { drag, exhale, talks, stretch, clap, pours, reliefSpot, gazeAt, STRETCH } = await load('game/ai/Pastimes.js');
const { carry, inHand } = await load('game/ai/Carry.js');
const { pastimeHands } = await load('game/render/PastimeArt.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { AI, TILE, CAT } = await load('game/Config.js');

const run = (ch, calm, aiming, long, s) => { for (let t = 0; t < s; t += 1 / 60) carry(ch, calm, aiming, long, 1 / 60); return ch; };

test('carry: put away while calm, out in a blink when something is up, raised only on a target', () => {
  const g = { stow: 1, lower: 1 };
  assert.equal(inHand(g), false);
  run(g, true, false, false, 2);
  assert.deepEqual([g.stow, g.lower], [1, 1], 'stays on the hip');
  run(g, false, false, false, AI.carry.draw * 0.8);
  assert.ok(inHand(g) && g.stow > 0, 'usable before it is fully out');
  assert.equal(g.lower, 1, 'in hand but low');
  run(g, false, true, false, 0.5);
  assert.deepEqual([g.stow, g.lower], [0, 0], 'up on a target');
  run(g, false, false, false, 0.5);
  assert.equal(g.lower, 1, 'lowered again once the target is lost');
  // a long gun takes longer to bring round
  const time = (long) => {
    const c = { stow: 1, lower: 1 };
    let t = 0;
    while (!inHand(c) && t < 5) { carry(c, false, false, long, 1 / 120); t += 1 / 120; }
    return t;
  };
  assert.ok(time(true) > time(false) * 1.3);
  assert.ok(AI.carry.holster > AI.carry.unsling, 'put away without hurry');
  assert.ok(time(true) < 0.4, 'never a free kill for the player');
});

test('pastimes: a drag then a breath of smoke, a chat turn about, a stretch, a clap, a leak', () => {
  let drags = 0, both = 0, puffs = 0;
  for (let t = 0; t < 13; t += 0.05) {
    const d = drag(t, 0.3), e = exhale(t, 0.3);
    assert.ok(d >= 0 && d <= 1 && e <= 1);
    if (d > 0.9) drags++;
    if (e >= 0) puffs++;
    if (d > 0.5 && e >= 0) both++;
    assert.notEqual(talks(t, 0), talks(t, 1), 'one talks, the other listens');
  }
  assert.ok(drags > 2 && puffs > drags && both === 0, 'the smoke comes out after the drag');
  assert.ok([0, 1].every((turn) => [0, 1, 2, 3, 4, 5, 6].some((t) => talks(t, turn))));
  assert.equal(stretch(0), 0);
  assert.ok(stretch(STRETCH / 2) > 0.99 && stretch(STRETCH) < 1e-9 && stretch(STRETCH * 3) < 1e-9);
  let claps = 0;
  for (let t = 0; t < 22; t += 0.05) if (clap(t, 0.5) > 0) claps++;
  assert.ok(claps > 20 && claps < 120, 'now and then');
  assert.deepEqual([pours(0.5, 6), pours(2, 6), pours(5, 1)], [false, true, false]);
});

test('pastimes: every kind puts both hands somewhere', () => {
  for (const kind of ['pool', 'cue', 'cards', 'count', 'drink', 'watch', 'dance', 'smoke', 'phone', 'talk', 'listen', 'cross',
    'piss', 'stretch', 'wrist', 'pockets', 'bag', 'wipe']) {
    for (const t of [0, 0.7, 3.1, 9.4]) {
      const h = pastimeHands(kind, t, 0.4);
      assert.ok(h && [h.hl.x, h.hl.y, h.hr.x, h.hr.y].every((v) => Number.isFinite(v) && Math.abs(v) < 14), kind);
    }
  }
  assert.equal(pastimeHands('walk', 0, 0), null);
  assert.equal(pastimeHands('sleep', 0, 0), null);
  const open = pastimeHands('stretch', STRETCH / 2, 0), rest = pastimeHands('stretch', 0, 0);
  assert.ok(open.hr.y - open.hl.y > rest.hr.y - rest.hl.y + 6, 'arms thrown out');
});

test('gaze: a doorman looks at whoever comes near in front of him, straight ahead otherwise', () => {
  const south = Math.PI / 2, G = AI.gaze;
  assert.ok(Math.abs(gazeAt(south, 60, 60, G.range, G.arc) - Math.PI / 4) < 1e-9, 'someone to his front left');
  assert.equal(gazeAt(south, 0, G.range + 1, G.range, G.arc), south, 'too far');
  assert.equal(gazeAt(south, 10, -60, G.range, G.arc), south, 'behind his back');
  assert.ok(gazeAt(south, -80, 20, G.range, G.arc) > south, 'well to his side still');
});

test('relief: against the nearest wall out in a yard, at the toilet on bathroom tiles, nowhere else', () => {
  const map = new TileMap([
    '#########',
    '#___#+++#',
    '#___#+++#',
    '#___#...#',
    '#########',
  ]);
  const at = (c, r) => [(c + 0.5) * TILE, (r + 0.5) * TILE];
  // the yard: 1 tile from the west wall
  const y = reliefSpot(map, [], ...at(1, 2));
  assert.ok(y && y.wall);
  assert.ok(Math.abs(Math.abs(y.face) - Math.PI) < 1e-6 || Math.abs(y.face - Math.PI) < 1e-6, 'faces the west wall');
  assert.ok(y.x > TILE && y.x < TILE + 16 && y.y === at(1, 2)[1], 'a step from it');
  // the bathroom: in front of the toilet that still stands, facing it
  const props = [{ type: 'toilet', x: 6.5 * TILE, y: 1.3 * TILE, dead: true }, { type: 'toilet', x: 7.5 * TILE, y: 1.3 * TILE },
    { type: 'sink', x: 5.5 * TILE, y: 1.3 * TILE }];
  const b = reliefSpot(map, props, ...at(7, 2));
  assert.ok(b && !b.wall);
  assert.ok(Math.abs(b.x - 7.5 * TILE) < 1 && b.y > 1.3 * TILE + 15, 'on his side of the bowl');
  assert.ok(Math.abs(Math.sin(b.face) + 1) < 1e-6, 'facing it');
  assert.equal(reliefSpot(map, [props[0]], ...at(7, 2)), null, 'no toilet left');
  assert.equal(reliefSpot(map, props, ...at(6, 3)), null, 'not on the parquet');
});

// ---------------- a guard's life at his post (data/posts.js) ----------------
const { POSTS, HELD } = await load('game/data/posts.js');
const { Routine, GESTURES, seatPlace, frontOf, sideOf, wallBehind, poolSpots } = await load('game/ai/Pastimes.js');
const { BARKS } = await load('game/data/barks.js');

const BODIES = ['stand', 'seat', 'desk', 'wall'];
const SPOTS = ['post', 'here', 'toilet', 'sink', 'wall', 'car', 'stool', 'pool'];
const LOOKS = ['sweep', 'dance', 'back'];
const FX = ['ember', 'cloud', 'ash', 'flame', 'butt', 'stream', 'tap', 'can', 'stroke', 'deal', 'chip', 'slide'];
const handsOf = (g, k, pt) => {
  const G = GESTURES[g];
  return G.hands ? G.hands(k, pt, pt + 3, 0.4, 'club') : pastimeHands(G.pastime, pt, 0.4);
};

test('posts: every job script is well formed, its phases are gestures that put both hands somewhere', () => {
  for (const [job, S] of Object.entries(POSTS)) {
    assert.ok(!S.body || BODIES.includes(S.body), job);
    if (S.body === 'seat' || S.body === 'desk') {
      assert.ok(S.seat && S.seat.places.length && S.rise > 0 && S.rise <= 0.7, `${job}: a seat and a quick get-up`);
    }
    const acts = Object.entries(S.acts);
    assert.ok(acts.some(([, a]) => !a.cue), `${job}: something to do`);
    for (const [name, act] of acts) {
      assert.ok(act.phases.length, `${job}.${name}`);
      for (const ph of act.phases) {
        const id = `${job}.${name}.${ph.g}`;
        assert.ok(GESTURES[ph.g], `${id}: a gesture`);
        assert.ok(ph.dur[0] > 0 && ph.dur[0] <= ph.dur[1] && ph.dur[1] < 30, `${id}: duration`);
        assert.ok(!ph.at || SPOTS.includes(ph.at), id);
        assert.ok(!ph.body || BODIES.includes(ph.body), id);
        assert.ok(!ph.look || LOOKS.includes(ph.look), id);
        assert.ok(!ph.fx || FX.includes(ph.fx), id);
        assert.ok(!ph.say || (BARKS[ph.say[0]] && ph.say[1] > 0 && ph.say[1] <= 1), id);
        assert.ok(!ph.answer || S.acts[ph.answer]?.cue, `${id}: answered by a cued act`);
        if (ph.sound) assert.ok(ph.sound[1] >= 0 && ph.sound[1] <= 1 && ph.sound[2] > 0, id);
        const item = GESTURES[ph.g].item;
        assert.ok(!item || HELD[item], `${id}: what becomes of the ${item}`);
        for (const k of [0, 0.3, 0.5, 0.8, 1]) {
          const h = handsOf(ph.g, k, k * 4 + 0.1);
          assert.ok(h && [h.hl.x, h.hl.y, h.hr.x, h.hr.y].every((v) => Number.isFinite(v) && Math.abs(v) < 16), `${id} at ${k}`);
        }
      }
    }
  }
});

test('posts: two men at the same job drift out of step, a cued act cuts in, an act is never played twice in a row', () => {
  const play = () => {
    const R = new Routine(POSTS.door);
    R.begin(R.pick(), true);
    const seen = [];
    let repeats = 0;
    for (let t = 0; t < 180; t += 1 / 30) {
      const prev = R.name;
      if (R.step(1 / 30) === 'act') {
        R.begin(R.pick());
        if (R.name === prev) repeats++;
      }
      seen.push(`${R.name}.${R.i}`);
    }
    return { seen, repeats };
  };
  const a = play(), b = play();
  assert.equal(a.repeats + b.repeats, 0);
  const apart = a.seen.filter((s, i) => s !== b.seen[i]).length / a.seen.length;
  assert.ok(apart > 0.3, `in step ${Math.round((1 - apart) * 100)}% of the time`);
  const R = new Routine(POSTS.couch, 1);
  R.begin('read');
  R.cue('laugh', 0.5);
  assert.equal(R.step(0.3), null);
  assert.equal(R.step(0.3), 'phase');
  assert.equal(R.name, 'laugh');
  // weights by seat: the man on one side reads, the one on the other plays with his weapon
  const count = (slot, name) => { const r = new Routine(POSTS.couch, slot); let n = 0; for (let i = 0; i < 400; i++) if (r.pick() === name) n++; return n; };
  assert.ok(count(1, 'read') > count(0, 'read') * 3 && count(0, 'fiddle') > count(1, 'fiddle') * 3);
});

test('posts: the spots: a place on a couch, in front of a sink, against a plain wall, round a pool table, at a table', () => {
  const sofa = { x: 100, y: 200, angle: -Math.PI / 2, def: { w: 64, h: 28 } };
  const s = seatPlace(sofa, [16, -1], 90);
  assert.ok(Math.abs(s.x - 99) < 1e-9 && Math.abs(s.y - 184) < 1e-9 && Math.abs(Math.cos(s.face) - 1) < 1e-9, 'north end, facing east');
  const sink = frontOf({ x: 100, y: 100, angle: Math.PI / 2, def: { w: 26, h: 18 } }, 11);
  assert.ok(Math.abs(sink.x - 80) < 1e-9 && Math.abs(Math.cos(sink.face) - 1) < 1e-9, 'west of it, facing it');
  const map = new TileMap([
    '#######',
    '#_____#',
    '#_____#',
    '###D###',
  ]);
  const w = wallBehind(map, 3.5 * TILE, 1.5 * TILE, -Math.PI / 2);
  assert.ok(w && w.x !== 3.5 * TILE && w.y === 2.5 * TILE + TILE / 2 - 9, 'not against the door: the next stretch of wall');
  assert.ok(Math.abs(Math.sin(w.face) + 1) < 1e-9, 'facing away from it');
  const spots = poolSpots({ x: 0, y: 0, angle: 0, def: { w: 80, h: 44 } });
  assert.equal(spots.length, 6);
  for (const p of spots) assert.ok(Math.cos(p.face) * -p.x + Math.sin(p.face) * -p.y > 0, 'each facing the table');
  // at what he works at (posts `front`): square in the middle of the side he faces, a hand's width off it
  const table = { x: 100, y: 100, angle: 0, def: { w: 44, h: 26 } };
  const south = sideOf(table, Math.PI / 2 + 0.3, 11);
  assert.ok(Math.abs(south.x - 100) < 1e-9 && Math.abs(south.y - (100 - 13 - 11)) < 1e-9, 'north of it, centred on it');
  assert.ok(Math.abs(Math.sin(south.face) - 1) < 1e-9, 'facing it');
  const end = sideOf(table, Math.PI, 11);
  assert.ok(Math.abs(end.x - (100 + 22 + 11)) < 1e-9 && Math.abs(end.y - 100) < 1e-9, 'at its east end, facing west');
  const turned = sideOf({ x: 0, y: 0, angle: Math.PI / 2, def: { w: 20, h: 14 } }, 0, 11);
  assert.ok(Math.abs(turned.x + 7 + 11) < 1e-9 && Math.abs(turned.y) < 1e-9, 'a case turned across: its long side to him');
});

// a guard on his seat in a small room, with the bare world he needs (no physics engine: his velocity is applied by hand)
async function seatedGuard(job, seatType, seatAngle, actor) {
  globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  const { default: Enemy } = await load('game/entities/Enemy.js');
  const { default: Director } = await load('game/ai/Director.js');
  const { PROPS } = await load('game/data/props.js');
  const { findPath } = await load('engine/nav/Pathfinding.js');
  const map = new TileMap(['##########', '#;;;;;;;;#', '#;;;;;;;;#', '#;;;;;;;;#', '#;;;;;;;;#', '##########']);
  const def = PROPS[seatType];
  const prop = { type: seatType, def, x: 2 * TILE, y: 3 * TILE, dead: false,
    body: Matter.Bodies.rectangle(2 * TILE, 3 * TILE, def.w, def.h, { isStatic: true, angle: seatAngle }) };
  const events = { on() {}, emit() {} };
  const world = {
    map, props: [prop], enemies: [], chars: [], doors: [], texts: [], time: 0, level: {}, events,
    player: { alive: false, x: 0, y: 0 },
    particles: { smoke() {}, dust() {}, glass() {}, floaters() {}, shard() {}, blood() {} },
    sound() {}, light() {}, emit() {}, addBody() {}, floorAt: () => 'wood', sightLine: () => false, lineOfSight: () => false,
    pathForGuard: (a, b, c, d) => findPath(map, a, b, c, d),
  };
  world.director = new Director(world);
  const [kind, weapon] = actor;
  const e = new Enemy(world, 3.5 * TILE, 3.5 * TILE, 0, kind, weapon);
  e.perceive = () => {}; e.scanWorld = () => {};
  e.takeJob(job);
  world.enemies.push(e); world.chars.push(e);
  const step = (s) => {
    for (let t = 0; t < s; t += 1 / 60) {
      world.time += 1 / 60;
      e.update(1 / 60);
      const v = Matter.Body.getVelocity(e.body);
      Matter.Body.setPosition(e.body, { x: e.x + v.x, y: e.y + v.y });
    }
  };
  return { e, step, prop };
}

test('a seated guard sits on his furniture, and once alerted is up and armed within his get-up time', async () => {
  for (const [job, seat, angle, actor] of [['couch', 'sofa', -Math.PI / 2, ['thug', 'tire_iron']], ['boss', 'armchair', 0, ['heavy', 'shotgun']]]) {
    const { e, step, prop } = await seatedGuard(job, seat, angle, actor);
    const S = POSTS[job];
    assert.ok(e.seat && e.posture === 1, `${job}: on his seat from the start`);
    assert.equal(e.body.collisionFilter.mask & CAT.PROP, 0, `${job}: the furniture does not shove him off it`);
    step(3);
    assert.ok(Math.hypot(e.x - e.seat.x, e.y - e.seat.y) < 3 && e.posture === 1, `${job}: still sat`);
    assert.ok(e.gestureOn, `${job}: at his pastime`);
    e.suspect(e.x + 100, e.y, 'noise');
    step(S.rise * 0.5);
    assert.ok(e.posture > 0 && e.state === 'suspicious', `${job}: a beat to get up`);
    step(S.rise * 0.5 + 0.05);
    assert.equal(e.posture, 0, `${job}: on his feet`);
    assert.ok(inHand(e), `${job}: his weapon in his hand`);
    step(1);
    const b = prop.body.bounds, r = e.radius;
    const clear = e.x + r < b.min.x || e.x - r > b.max.x || e.y + r < b.min.y || e.y - r > b.max.y;
    assert.ok(!clear || e.body.collisionFilter.mask & CAT.PROP, `${job}: solid again once off it`);
  }
});
