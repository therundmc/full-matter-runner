// The suburb going to Miami (tools/generate_assets.py SUBURB_PROPS / SUBURB_PAINT): every new sprite on disk, listed
// (unlisted, it is drawn as a bin), a prop that comes apart its own way; the three ways round the lorry on the sidewalk
// (a fruit market, a car wash, a tyre yard) are torn or flung, never `lasting`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const { OPTIONAL_LIST } = await load('engine/Assets.js');
const { PROPS } = await load('game/data/props.js');
const { DESTRUCTION, BITS } = await load('game/data/destruction.js');
const { CHASE } = await load('game/data/chase.js');

const png = (name) => existsSync(fileURLToPath(new URL(`../assets/sprites/props/${name}.png`, import.meta.url)));
const PROPS_NEW = ['sabal_palm', 'sabal_palm_b', 'sabal_palm_ragged', 'coconut_palm_lean', 'palm_young', 'palm_stump',
  'bus_bench_bail', 'bus_bench_abogado', 'payphone_pastel', 'news_box_yellow', 'news_box_red', 'mailbox_blue', 'mailbox_post',
  'pole_sign_strip', 'yard_fence', 'yard_fence_gate', 'garden_wall_pink', 'garden_wall_mint', 'garden_wall_cream', 'carport',
  'tv_antenna', 'lawn_flamingos', 'oleander_pink', 'oleander_white', 'cart_loaded', 'bedroll', 'bags_pile', 'doorway_camp'];
const DODGE = {
  market: ['market_stall', 'market_stall_coco', 'fruit_crate_orange', 'fruit_crate_mango', 'fruit_crate_coconut', 'market_sign'],
  carwash: ['carwash_sign', 'carwash_board', 'wash_bucket', 'hose_reel'],
  tyres: ['tyre_stack', 'tyre_pile', 'tyre_loose', 'tyre_rack', 'tyre_sign'],
};
const PAINT = ['palm_frond_fallen', 'sabal_frond_fallen', 'coconuts_fallen', 'driveway', 'lawn_dry_a', 'lawn_dry_b',
  'cardboard_bed_blanket', 'cardboard_sign', 'litter_bottles', 'soap_puddle'];
const GLOWING = ['payphone_pastel', 'pole_sign_strip', 'market_stall', 'market_stall_coco'];

test('suburb: every new prop and floor paint has its sprite, listed, and every prop its def and its recipe', () => {
  for (const name of [...PROPS_NEW, ...Object.values(DODGE).flat(), ...PAINT]) {
    assert.ok(png(name) && OPTIONAL_LIST.includes(`props/${name}`), `${name}: its sprite, listed`);
  }
  for (const name of [...PROPS_NEW, ...Object.values(DODGE).flat()]) assert.ok(PROPS[name] && DESTRUCTION[name], name);
  for (const name of PAINT) assert.ok(!PROPS[name], `${name} is floor paint, no body`);
  for (const name of GLOWING) {
    assert.ok(png(`${name}_glow`) && OPTIONAL_LIST.includes(`props/${name}_glow`), `${name}: its emissive map`);
    assert.ok(PROPS[name].light, `${name}: its light`);
  }
  assert.ok(BITS.coconut.round, 'coconuts roll');
});

test('suburb: what the car goes round the lorry through is torn or flung, nothing lasting', () => {
  for (const [set, names] of Object.entries(DODGE)) {
    for (const name of names) {
      const d = PROPS[name];
      assert.ok(!d.lasting, `${set}: ${name} gives`);
      if (!d.static) assert.ok(d.kg > 0 && d.kg <= CHASE.hit.fling.kg, `${set}: ${name} is flung (${d.kg} kg)`);
    }
  }
  for (const name of DODGE.tyres.filter((n) => !PROPS[n].static && n.startsWith('tyre_') && n !== 'tyre_sign')) {
    assert.equal(PROPS[name].material, 'rubber', `${name} bounces away`);
  }
});
