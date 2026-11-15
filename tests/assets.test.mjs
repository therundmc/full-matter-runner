import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// engine/Assets.js needs a DOM to load: its density rule is read from the source and tried on names
const src = readFileSync(fileURLToPath(new URL('../src/engine/Assets.js', import.meta.url)), 'utf8');
const FINE = new RegExp(src.match(/const FINE = \/(.*)\/;/)[1]);

test('assets: only the standing characters and the weapons are finer than the world, never a part of a body', () => {
  for (const n of ['characters/thug_torso', 'characters/player_torso', 'characters/civ3_torso', 'characters/dancer1_torso', 'weapons/pistol', 'weapons/tire_iron']) assert.ok(FINE.test(n), n);
  for (const n of ['characters/thug_rag_torso', 'characters/thug_rag_torso_up', 'characters/brute_gib_torso', 'characters/thug_rag_head', 'characters/thug_down',
    'props/desk', 'weapons/rocket']) assert.ok(!FINE.test(n), n);
});
