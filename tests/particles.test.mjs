import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Particles, P } = await load('game/fx/Particles.js');
const { PROPS } = await load('game/data/props.js');
const { LIQUIDS } = await load('game/Config.js');

// a world reduced to what the particles touch: an open floor, decal calls recorded by name
function stub() {
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const world = {
    map: { solidAt: () => false },
    camera: { x: 0, y: 0 },
    decals: {
      floorCtx: { fillRect: rec('rect'), set fillStyle(v) {}, set globalAlpha(v) {} },
      spill: rec('spill'), bake: rec('bake'), stampBlood: rec('blood'), speck: rec('speck'),
    },
  };
  return { world, particles: new Particles(world), calls };
}
const run = (particles, sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) particles.update(dt); };

test('hydrant: one hit pops it and the geyser lasts as long as the flood', () => {
  assert.ok(PROPS.hydrant.fountain && PROPS.hydrant.hp <= 1);
  assert.ok(LIQUIDS.hydrant.dur >= 8 && LIQUIDS.hydrant.cap > 80);
});

test('jet: water thrown up climbs metres high, falls back around and leaves no permanent stain', () => {
  const { particles, calls } = stub();
  particles.jet(100, 100, 60, { vz: 440, speed: 100 });
  let top = 0;
  for (let t = 0; t < 0.9; t += 1 / 60) {
    particles.update(1 / 60);
    for (const p of particles.list) if (p.type === P.JET) top = Math.max(top, p.z);
  }
  assert.ok(top > 110 && top < 220, `apex ${top}`);
  run(particles, 3);
  assert.equal(particles.list.length, 0, 'all of it came down');
  assert.equal(calls.length, 0, 'nothing painted on the floor');
});

test('shards: a piece with onLand is handed over when it touches the floor instead of being baked', () => {
  const { particles, calls } = stub();
  let landed = null;
  particles.shard({ width: 10, height: 10 }, 0, 0, 0, 40, { high: true, z: 8, vz: 420, onLand: (p) => { landed = { x: p.x, z: p.z }; } });
  run(particles, 1);
  assert.equal(landed, null, 'still up there');
  assert.ok(particles.list[0].z > 40);
  run(particles, 1.5);
  assert.ok(landed && landed.z === 0 && landed.x > 20);
  assert.equal(particles.list.length, 0);
  assert.ok(!calls.some(([n]) => n === 'bake'));
});
