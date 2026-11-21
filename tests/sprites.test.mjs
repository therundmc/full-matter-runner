// The sprite folders against what uses them: every PNG is one engine/Assets.js loads or one kept in STOCK
// (the registry's `stock` flag, tools/sprites/registry.py, listed in engine/spritelist.js; none left over by a renamed
// or dropped sprite: the generators prune their folders), and every prop sprite is placed by a level, spawned by the
// code or kept in STOCK for a level to come.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPRITES = ROOT + 'assets/sprites/';
// STOCK's paths (group/name)
const STOCK = new Set((await load('engine/spritelist.js')).STOCK);
const onDisk = readdirSync(SPRITES).flatMap((g) => readdirSync(SPRITES + g).filter((f) => f.endsWith('.png')).map((f) => `${g}/${f.slice(0, -4)}`));

// what loadAssets asks for: a stub Image records each src and answers at once
async function loaded() {
  const asked = [], saved = { Image: globalThis.Image, document: globalThis.document };
  globalThis.Image = class { set src(s) { asked.push(s.replace(/^assets\/sprites\//, '').replace(/\.png$/, '')); queueMicrotask(() => this.onload?.()); } };
  globalThis.document = { fonts: { load: async () => {} } };
  try { await (await load('engine/Assets.js')).loadAssets(); } finally { Object.assign(globalThis, saved); }
  return new Set(asked);
}

test('sprites: the PNGs on disk are exactly the sprites the game loads, and what is kept in STOCK', async () => {
  const listed = await loaded(), disk = new Set(onDisk);
  assert.deepEqual(onDisk.filter((n) => !listed.has(n) && !STOCK.has(n)), [], 'on disk, never loaded (stale: the generator prunes it)');
  for (const n of STOCK) assert.ok(disk.has(n), `STOCK names ${n}, which is not on disk`);
  assert.deepEqual([...listed].filter((n) => !disk.has(n)), [], 'loaded, not on disk');
});

test('sprites: every prop sprite is placed by a level, spawned by the code, or kept in STOCK', async () => {
  const { default: LEVELS } = await load('game/data/levels/index.js');
  const placed = new Set();
  const walk = (v) => {
    if (typeof v === 'string') placed.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  Object.values(LEVELS).forEach(walk);
  // the code's own strings ('name' or 'props/name'), not the levels' nor the load lists' (engine/Assets.js, spritelist.js)
  const code = [];
  const scan = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${f.name}`;
      if (f.isDirectory()) { if (!p.endsWith('/levels')) scan(p); } else if (p.endsWith('.js') && !/engine\/(Assets|spritelist)\.js$/.test(p)) code.push(readFileSync(p, 'utf8'));
    }
  };
  scan(ROOT + 'src');
  const src = code.join('\n'), spawned = (n) => new RegExp(`['"\`/]${n}['"\`]`).test(src);
  const props = onDisk.filter((n) => n.startsWith('props/')).map((n) => n.slice(6));
  // a family's sprites go with their base: its light map, a car's hood and door, a table flipped, a gun or a billboard
  // stripped, a billboard's frame
  const base = (n) => n.replace(/_(glow|hood|door|flipped|bare|frame)$/, '');
  const orphans = props.filter((n) => !placed.has(n) && !placed.has(base(n)) && !spawned(n) && !spawned(base(n)) && !STOCK.has(`props/${base(n)}`));
  assert.deepEqual(orphans, [], 'prop sprites nothing uses: place them, delete them, or add them to STOCK');
  for (const n of [...STOCK].filter((s) => s.startsWith('props/')).map((s) => s.slice(6))) {
    assert.ok(!placed.has(n), `${n} is placed by a level now: take it out of STOCK`);
  }
});
