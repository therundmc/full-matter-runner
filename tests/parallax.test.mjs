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

test('wobble: a round or a blast never sets a rigid structure swinging; a ceiling lamp still swings, an awning only shudders', async () => {
  const { default: Prop } = await load('game/entities/Prop.js');
  const fake = (def) => Object.assign(Object.create(Prop.prototype), { def, kick: { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 }, flash: 0 });
  const bridge = fake(PROPS.overpass), gantry = fake(PROPS.sign_gantry), board = fake(PROPS.billboard_tan);
  for (const p of [bridge, gantry, board]) { p.recoil(0.3, 2); assert.deepEqual([p.kick.vx, p.kick.vy, p.kick.vr], [0, 0, 0], 'still'); }
  const lamp = fake(PROPS.ceiling_lamp), awning = fake(PROPS.awning);
  lamp.recoil(0, 1); awning.recoil(0, 1);
  assert.ok(lamp.kick.vx > awning.kick.vx, 'the lamp swings harder than the awning shudders');
});
