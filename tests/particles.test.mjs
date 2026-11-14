import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Particles, P } = await load('game/fx/Particles.js');
const { PROPS } = await load('game/data/props.js');
const { LIQUIDS, LITTER } = await load('game/Config.js');
const { FLOATS } = await load('game/data/destruction.js');

// a world reduced to what the particles touch: an open floor, decal calls recorded by name
function stub() {
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const world = {
    map: { solidAt: () => false },
    camera: { x: 0, y: 0 },
    decals: {
      floorCtx: { fillRect: rec('rect'), set fillStyle(v) {}, set globalAlpha(v) {} },
      spill: rec('spill'), wreck: rec('bake'), stampBlood: rec('blood'), speck: rec('blood'), stampStreak: rec('blood'),
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

test('fire: the heart of a burst stays hotter and burns longer than its rim', () => {
  const { particles } = stub();
  particles.fire(0, 0, 400, 300, { heat: 0 });
  const mean = (list, f) => list.reduce((s, p) => s + f(p), 0) / list.length;
  const slow = particles.list.filter((p) => Math.hypot(p.vx, p.vy) < 120), fast = particles.list.filter((p) => Math.hypot(p.vx, p.vy) > 240);
  assert.ok(slow.length > 20 && fast.length > 20);
  assert.ok(mean(slow, (p) => p.heat) > mean(fast, (p) => p.heat) + 0.15);
  assert.ok(mean(slow, (p) => p.maxLife) > mean(fast, (p) => p.maxLife));
  run(particles, 1);
  assert.equal(particles.list.length, 0, 'a burst is over within a second');
});

test('cinders: burning scraps trail flames high in the air and report where they fall', () => {
  const { particles } = stub();
  const fell = [];
  particles.cinders(0, 0, 6, 200, (x, y) => fell.push(Math.hypot(x, y)));
  run(particles, 0.25);
  const flames = particles.list.filter((p) => p.type === P.FIRE);
  assert.ok(flames.length > 10 && flames.some((p) => p.h > 15), 'flames left behind at the height of the scrap');
  assert.equal(fell.length, 0);
  run(particles, 3);
  assert.equal(fell.length, 6);
  assert.ok(fell.every((d) => d > 30), 'thrown well away');
  assert.equal(particles.list.length, 0);
});

test('litter: every crumb flies but only a share stays on the floor, big pieces and blood always do', () => {
  const marks = (emit, name = 'rect') => {
    const { particles, calls } = stub();
    emit(particles);
    const flying = particles.list.length;
    run(particles, 16);
    assert.equal(particles.list.length, 0, 'all of it came down');
    return { flying, left: calls.filter(([n]) => n === name).length };
  };
  const share = (r) => r.left / r.flying;
  const near = (v) => Math.abs(v - LITTER.keep) < 0.12;
  const chips = marks((p) => p.chips(0, 0, 0, 3, 400, '#864'));
  assert.equal(chips.flying, 400, 'the spectacle in the air is whole');
  assert.ok(near(share(chips)), `chips ${share(chips)}`);
  assert.ok(near(share(marks((p) => p.glass(0, 0, 0, 3, 400)))), 'glass');
  assert.ok(near(share(marks((p) => p.floaters(0, 0, FLOATS.stuffing, 200)))), 'fluff');
  assert.ok(near(share(marks((p) => { for (let i = 0; i < 300; i++) p.shard({ width: 4, height: 1 }, 0, 0, i, 60); }, 'bake'))), 'splinters');
  const big = marks((p) => { for (let i = 0; i < 40; i++) p.shard({ width: 9, height: 6 }, 0, 0, i, 60); }, 'bake');
  assert.equal(big.left, 40, 'a real piece of the thing always stays');
  const blood = marks((p) => p.blood(0, 0, 0, 3, 200, 120), 'blood');
  assert.ok(blood.left >= blood.flying, 'every drop of blood marks the floor');
});
