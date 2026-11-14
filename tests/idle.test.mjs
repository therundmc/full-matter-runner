import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { drag, exhale, talks, stretch, clap, pours, reliefSpot, gazeAt, STRETCH } = await load('game/ai/Pastimes.js');
const { carry, inHand } = await load('game/ai/Carry.js');
const { pastimeHands } = await load('game/render/PastimeArt.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { AI, TILE } = await load('game/Config.js');

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
