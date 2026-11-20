// Level 2A's sprites, second pass (tools/generate_assets.py; docs/LEVEL2.md): a house number a mailbox, the houses'
// own windows and doors, the stucco wall tops in many draws, royal palms of a believable crown, the rails' ends either
// side of the road, a one-arm lamp where only the road wants light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const { OPTIONAL_LIST } = await load('engine/Assets.js');
const { PROPS, ON_WALL } = await load('game/data/props.js');
const { DESTRUCTION } = await load('game/data/destruction.js');
const { default: level2a } = await load('game/data/levels/level2a.js');

const file = (p) => fileURLToPath(new URL(`../assets/sprites/${p}.png`, import.meta.url));
const size = (p) => { const b = readFileSync(file(p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const NEW = ['mailbox_post_b', 'mailbox_post_c', 'mailbox_post_d', 'house_window', 'house_window_lit', 'house_door',
  'guardrail_end_r', 'guardrail_end_trail', 'guardrail_end_trail_r', 'highway_lamp_single'];
const GLOWING = ['house_window_lit', 'house_door', 'highway_lamp_single'];
const placed = (kind) => level2a.props.filter(([k]) => k === kind);

test('sprites 2A: every new sprite is on disk, listed, with its def and its recipe; the lit ones glow and light', () => {
  for (const n of NEW) {
    assert.ok(existsSync(file('props/' + n)) && OPTIONAL_LIST.includes('props/' + n), `${n}: its sprite, listed`);
    assert.ok(PROPS[n] && DESTRUCTION[n], `${n}: its def and its recipe`);
  }
  for (const n of GLOWING) {
    assert.ok(existsSync(file(`props/${n}_glow`)) && OPTIONAL_LIST.includes(`props/${n}_glow`), `${n}: its emissive map`);
    assert.ok(PROPS[n].light, `${n}: its light`);
  }
  assert.equal(PROPS.highway_lamp_single.light.length, 1, 'one head, one pool');
  for (const t of ['pink', 'mint', 'peach', 'lilac']) {
    for (const k of [1, 2, 3, 4, 5]) {
      assert.ok(OPTIONAL_LIST.includes(`tiles/stucco_${t}_v${k}`), `stucco_${t}_v${k} listed`);
      assert.deepEqual(size(`tiles/stucco_${t}_v${k}`), [32, 32], 'a wall top: at the world\'s density');
    }
  }
});

test('sprites 2A: the houses have their own fronts, a number each, nothing on them to catch a car run along them', () => {
  const front = level2a.tiles[7].slice(277, 312);
  assert.ok(![...front].some((t) => t === 'G' || t === 'L'), 'no shop glass, no shop door in the houses\' fronts');
  const boxes = ['mailbox_post', 'mailbox_post_b', 'mailbox_post_c', 'mailbox_post_d'].map(placed);
  assert.ok(boxes.every((b) => b.length === 1 && b[0][1] > 277 && b[0][1] < 312), 'four mailboxes, four numbers');
  assert.equal(placed('house_door').length, 4);
  assert.ok(placed('house_window').length + placed('house_window_lit').length >= 7);
  assert.ok(placed('house_window_lit').length >= 3, 'lamps on in some of them');
  for (const n of ['house_window', 'house_window_lit', 'house_door']) assert.ok(PROPS[n].hung && !ON_WALL.has(n), `${n}: set in the wall`);
});

test('sprites 2A: royal palms 5 m across at the most; the rails\' ends face the right way; the ramp\'s lamps light the road', () => {
  for (const n of ['royal_palm', 'royal_palm_b']) assert.ok(size('props/' + n)[0] <= 2 * 160, `${n}: a crown of 5 m at the most`);
  const MID = 43.0;
  const ends = level2a.props.filter(([k]) => k.startsWith('guardrail_end'));
  assert.ok(ends.length >= 10 && ends.every(([, c]) => c >= 498), 'the ramp\'s and the toll\'s');
  for (const [k, , r, deg] of ends) {
    const south = r > MID, trailing = k.includes('trail');
    assert.ok(!trailing || deg === 180, `${k} at row ${r}: a trailing end is turned round`);
    if (!trailing) assert.equal(k === 'guardrail_end_r', south, `${k} at row ${r}: its posts away from the road`);
    else assert.equal(k === 'guardrail_end_trail', south, `${k} at row ${r}: its posts away from the road`);
  }
  assert.ok(ends.some(([k]) => k === 'guardrail_end_trail') && ends.some(([k]) => k === 'guardrail_end_trail_r'));
  assert.ok(!ends.some(([k, , , deg]) => k === 'guardrail_end' && deg === 180), 'never a striped terminal at the end traffic leaves');
  assert.equal(placed('highway_lamp_single').length, 2, 'the ramp\'s south side');
});
