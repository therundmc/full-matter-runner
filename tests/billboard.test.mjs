// A billboard (prop mount 'billboard': entities/Board.js, data/billboards.js): the rounds that cross its face punch
// holes there and fly on, its lamps are shot out one by one, and as it takes more it goes through its stages (the
// paper peeling, the lettering ripped and the frame showing, the face gone); its frame never moves, never falls,
// never stops a round or the aim's line. The freeway's signs take holes and lose their lamps, nothing more.
import { load } from './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctx } from './helpers.mjs';

// no DOM under Node: entities only need canvases to exist, nothing is looked at here
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { clipT } = await load('game/entities/Board.js');
const { default: Projectile } = await load('game/entities/Projectile.js');
const { traceBullet } = await load('game/systems/Ballistics.js');
const { explode } = await load('game/systems/Explosions.js');
const { lineOfFire } = await load('game/systems/AimCue.js');
const { BOARD, BOARDS, CELL } = await load('game/data/billboards.js');
const { WEAPONS } = await load('game/data/weapons.js');

const ROWS = ['X'.repeat(30), ...Array(16).fill('X' + '.'.repeat(28) + 'X'), 'X'.repeat(30)];
function world() {
  const quiet = new Proxy({}, { get: () => () => {} });
  const w = {
    map: new TileMap(ROWS), events: new EventBus(), time: 0, particles: quiet, decals: quiet, smoke: quiet, papers: quiet,
    props: [], debris: [], chars: [], enemies: [], doors: [], windows: [], items: [], corpses: [], fences: [], rings: [], timers: [],
    hits: [], sounds: [], bodies: new Set(),
    physics: { freezeIfHeavy() {}, bodies: () => [...w.bodies] },
    game: { flash() {} },
    addBody(b) { this.bodies.add(b); }, removeBody(b) { this.bodies.delete(b); },
    addDebris(d) { this.debris.push(d); }, removeDebris(d) { this.debris = this.debris.filter((o) => o !== d); },
    shake() {}, hitstop() {}, light() {}, emit() {}, flashGlass() {}, noise() {}, damageWall() {},
    sound(name) { this.sounds.push(name); },
    after(sec, fn) { this.timers.push(fn); },
    traceBullet(x0, y0, x1, y1, team, ignore, floor) { return traceBullet(this, x0, y0, x1, y1, team, ignore, floor); },
  };
  w.events.on('propHit', ({ prop }) => w.hits.push(prop.type));
  return w;
}
const put = (w, type, x, y, deg = 0) => {
  const p = new Prop(w, type, x, y, (deg * Math.PI) / 180);
  w.props.push(p);
  return p;
};
function fire(w, x0, y0, a = 0) {
  const r = new Projectile(w, x0, y0, a, WEAPONS.pistol.speed, { team: 'player', owner: null, weapon: WEAPONS.pistol, pen: WEAPONS.pistol.pen, life: 1.5 });
  for (let i = 0; i < 100 && !r.dead; i++) r.update(1 / 60);
  return r;
}
// the billboard_tan at (400, 280): its sprite px (sx, sy) are world (400 - 128 + sx, 280 - 56 + sy)
const AT = [400, 280];
const wx = (sx) => AT[0] - 128 + sx, wy = (sy) => AT[1] - 56 + sy;
const still = (p) => [p.body.position.x, p.body.position.y, p.body.angle, p.kick.vx, p.kick.vy, p.kick.vr, p.kick.x, p.kick.y,
  p.dead, p.dying, p.body.isStatic, p.body.collisionFilter.mask];

test('billboard: the stretch of a line inside a rect', () => {
  assert.deepEqual(clipT({ x: 0, y: 5 }, { x: 10, y: 5 }, [2, 0, 4, 10]), [0.2, 0.4]);
  assert.equal(clipT({ x: 0, y: 5 }, { x: 10, y: 5 }, [2, 6, 4, 10]), null);
  assert.deepEqual(clipT({ x: 3, y: 5 }, { x: 10, y: 5 }, [2, 0, 4, 10]).map((t) => Math.round(t * 70) / 10), [0, 1]);
});

test('billboard: a round through its face punches a hole where its line crosses it and flies on to what is beyond', () => {
  const w = world(), b = put(w, 'billboard_tan', ...AT), safe = put(w, 'safe', 860, wy(30));
  assert.equal(traceBullet(w, 60, wy(30), 900, wy(30), 'player', new Set()).kind, 'overhead', 'the face is traced, as overhead');
  fire(w, 60, wy(30));
  const B = b.board;
  assert.equal(B.holes, 1, 'one hole');
  const [sx, sy] = B.hits[0];
  assert.ok(Math.abs(sy - 30) < 1 && sx >= 6 && sx <= 250, `on its line, on the face: ${sx}, ${sy}`);
  assert.equal(B.hp, BOARD.hp - 1);
  assert.deepEqual(w.hits, ['safe'], 'the safe behind it took the round (a billboard is never in the way)');
  assert.ok(w.sounds.includes(BOARD.sound.hole));
  assert.ok(safe.def.lasting);
  // a round under its catwalk, off the face: nothing
  fire(w, 60, wy(104));
  assert.equal(B.holes, 1, 'its frame takes nothing');
});

test('billboard: the aim\'s line goes through it', () => {
  const w = world();
  put(w, 'billboard_tan', ...AT);
  const l = lineOfFire(w, 'player', 60, wy(30), 0, [], 800);
  assert.equal(l.hit, false);
});

test('billboard: its lamps are shot out one by one, the first one on the line, and their lights go', () => {
  const w = world(), b = put(w, 'billboard_tan', ...AT), B = b.board;
  assert.deepEqual(b.lamps, [true, true, true, true]);
  // along the row of the lamps, from the west: the westmost first, then the next
  fire(w, 60, wy(78));
  assert.deepEqual(B.up, [false, true, true, true]);
  assert.deepEqual(b.lamps, [false, true, true, true], 'its light is out');
  assert.ok(w.sounds.includes(BOARD.sound.lamp));
  fire(w, 60, wy(78));
  assert.deepEqual(B.up, [false, false, true, true]);
  // straight down through the fourth
  fire(w, wx(218), 40, Math.PI / 2);
  assert.deepEqual(B.up, [false, false, true, false]);
  // the motel's: two lamps to a light, out once both are
  const m = put(w, 'billboard_motel', 400, 420).board;
  m.lampOut(0, 0);
  assert.deepEqual(m.prop.lamps, [true, true], 'one of its two lamps still lights it');
  m.lampOut(1, 0);
  assert.deepEqual(m.prop.lamps, [false, true]);
});

test('billboard: shot again and again it peels, rips, then its face is gone, the frame standing; it never moves', () => {
  const w = world(), b = put(w, 'billboard_tan', ...AT), B = b.board, was = still(b);
  const seen = [];
  for (let i = 0; i < 40 && B.stage < 3; i++) {
    fire(w, 60, wy(8 + (i * 3) % 60));
    if (seen[seen.length - 1] !== B.stage) seen.push(B.stage);
    if (B.stage === 1 && !seen.peeled) { seen.peeled = true; assert.ok(B.share(CELL.BARE) > 0 && B.share(CELL.GONE) === 0, 'stage 1: the paper peeled off, no sheet out'); }
    if (B.stage === 2 && !seen.ripped) { seen.ripped = true; assert.ok(B.share(CELL.GONE) > 0 && B.share(CELL.GONE) < 0.5, 'stage 2: sheets torn out'); }
  }
  assert.deepEqual([...seen], [0, 1, 2, 3], 'every stage, in order');
  assert.ok(B.share(CELL.GONE) > 0.99, 'the face gone');
  assert.ok(w.sounds.includes(BOARD.sound.tear) && w.sounds.includes(BOARD.sound.gone));
  // more rounds and a blast: nothing left to tear, still nothing moves, it never falls
  const n = B.holes;
  fire(w, 60, wy(30));
  assert.equal(B.holes, n, 'no face left to hole');
  explode(w, AT[0], AT[1] + 70, { radius: 100 });
  b.hit(5, b.x, b.y, 0, 2.5, 'blunt');
  b.break(0, 3);
  assert.deepEqual(still(b), was, 'never moved, never fell, never a body in the way');
  assert.deepEqual(w.hits, [], 'Prop.hit takes nothing: its face is its Board\'s');
});

test('billboard: a blast under it tears the face and puts its lamps out, and moves nothing', () => {
  const w = world(), b = put(w, 'billboard_tan', ...AT), B = b.board, was = still(b);
  explode(w, wx(40), wy(100), { radius: 90 });
  assert.ok(B.hp < BOARD.hp, 'damaged');
  assert.ok(B.share(CELL.BARE) > 0, 'torn');
  assert.equal(B.up[0], false, 'the lamp over the blast is out');
  assert.equal(B.up[3], true, 'the far one still lit');
  assert.deepEqual(still(b), was);
  // far away: nothing
  const far = put(w, 'billboard_radio', 400, 460).board;
  explode(w, 60, 60, { radius: 60 });
  assert.equal(far.hp, BOARD.hp);
});

test('billboard: the freeway\'s signs take holes in their plates and lose their lamps, no stages', () => {
  // (its sprite px (sx, sy) are world (400 - 155 + sx, 200 - 20 + sy))
  const w = world(), g = put(w, 'gantry_sign', 400, 200), G = g.board;
  assert.ok(!BOARDS.gantry_sign.layers);
  // across its plates, again and again
  for (let i = 0; i < 40; i++) fire(w, 60, 198 + (i % 5));
  assert.deepEqual([G.stage, G.holes, G.hp], [0, 40, BOARD.hp], 'holed, no stages');
  // its truss: a round along it, over the plates, holes nothing
  fire(w, 60, 200 - 20 + 4.5);
  assert.equal(G.holes, 40, 'the truss takes nothing');
  // straight down through its first lamp
  fire(w, 400 - 155 + 52, 40, Math.PI / 2);
  assert.deepEqual([G.up[0], G.up[1], g.lamps[0]], [false, true, true], 'one lamp out, the plate still lit by the others');
});
