import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './setup.mjs';

const { VEHICLES } = await load('game/entities/Vehicle.js');
const { LIGHTING } = await load('game/Config.js');

// size in world px, from the PNG header (IHDR): the vehicles are painted at twice the world's density (FINE)
function pngSize(sprite) {
  const b = readFileSync(new URL(`../assets/sprites/${sprite}.png`, import.meta.url));
  return { w: b.readUInt32BE(16) / 2, h: b.readUInt32BE(20) / 2 };
}

test('vehicles: sprites at real size (1 m = 32 px)', () => {
  for (const [model, len, wid] of [['car', 4.4, 1.8], ['car2', 4.2, 1.75], ['van', 5.0, 2.0], ['convertible', 5.4, 2.0]]) {
    const { w, h } = pngSize(VEHICLES[model].sprite);
    assert.ok(Math.abs(w / 32 - len) < 0.15 && Math.abs(h / 32 - wid) < 0.1, `${model} is ${w}x${h}`);
  }
});

test('vehicles: layout regions, wheels and lights lie inside the sprite', () => {
  for (const [model, m] of Object.entries(VEHICLES)) {
    const { w, h } = pngSize(m.sprite);
    for (const key of ['wind', 'rear', 'tank']) {
      const r = m[key];
      if (!r) continue;
      assert.ok(r[0] >= 0 && r[0] < r[1] && r[1] <= w && r[2] >= 0 && r[2] < r[3] && r[3] <= h, `${model}.${key}`);
    }
    assert.ok(m.hood[0] < m.hood[1] && m.hood[1] <= w, `${model}.hood`);
    assert.ok(m.wind[0] < m.hood[0], `${model}: windshield behind the hood`);
    assert.equal(m.wheels.length, 4);
    for (const [x, y] of m.wheels) assert.ok(x > 0 && x < w && y >= 0 && y <= h, `${model} wheel ${x},${y}`);
    for (const l of LIGHTING.propLights[model]) {
      assert.ok(Math.abs(l.x) <= w / 2 && Math.abs(l.y) <= h / 2, `${model} light ${l.x},${l.y}`);
      assert.equal(!!l.cone, l.x > 0, `${model}: cones in front, glows at the back`);
    }
  }
});
