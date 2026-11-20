// A rigid structure fixed to the ground or a wall (a bridge, a gantry, the toll's roof, a billboard, an awning, a
// fire escape...) is drawn where it stands: no parallax `height`, else it slides over its abutments and walls as the
// camera moves, like a lamp on a wire. Things on a pole (palms, lamps, signs) keep theirs: the pole ties top to foot.
import { load } from './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { PROPS } = await load('game/data/props.js');

const RIGID = ['viaduct', 'gantry_sign', 'overpass', 'toll_canopy', 'sign_gantry', 'billboard_motel', 'billboard_tan',
  'billboard_radio', 'awning', 'awning_pink', 'deco_canopy_pink', 'carport', 'tv_antenna', 'string_lights', 'laundry_line',
  'fire_escape', 'pennant_string'];

test('parallax: rigid overhead structures stay put over the ground and walls they hang from', () => {
  for (const k of RIGID) assert.equal(PROPS[k].height || 0, 0, k);
  // a hung, lasting, wide overhead thing with no pole is a structure: it never slides (a palm's crown is foliage)
  for (const [k, d] of Object.entries(PROPS)) {
    if (d.overhead && d.hung && d.lasting && !d.pole && (d.w || 0) >= 64 && !/palm/.test(k)) assert.equal(d.height || 0, 0, k);
  }
});
