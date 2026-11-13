import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const F = await load('game/systems/Fracture.js');
const { recipeFor, DESTRUCTION, BITS, FLOATS, MATERIAL_FX } = await load('game/data/destruction.js');
const { PROPS } = await load('game/data/props.js');
const { LIQUIDS } = await load('game/Config.js');

// deterministic random
const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('incidence: head-on is 1, grazing is ~0, no normal means head-on', () => {
  assert.ok(near(F.incidence(0, -1, 0), 1));
  assert.ok(F.incidence(Math.PI / 2 - 0.05, -1, 0) < 0.06);
  assert.equal(F.incidence(1.2), 1);
});

test('marks: bigger calibres leave bigger holes, grazing shots plough furrows or scrape', () => {
  const pellet = F.markShape('pellet', { energy: 4 });
  const rifle = F.markShape('rifle', { energy: 34 });
  assert.ok(pellet.r < rifle.r);
  const graze = F.markShape('bullet', { energy: 10, inc: 0.1 });
  assert.equal(graze.shape, 'furrow');
  assert.ok(graze.len > F.markShape('bullet', { energy: 10, inc: 1 }).len);
  assert.equal(F.markShape('bullet', { energy: 10, inc: 0.1, hard: true }).shape, 'scrape');
  assert.equal(F.markShape('bullet', { ricochet: true }).bite, 0);
  // metal is punctured and dented, not torn
  assert.equal(F.markShape('bullet', { hard: true }).bite, 0);
  assert.equal(F.markShape('blunt', { hard: true, cracks: 0 }).shape, 'dent');
  assert.ok(F.markShape('blunt', { cracks: 4 }).bite > 0);
  assert.equal(F.markShape('cut', { size: 20 }).shape, 'slash');
  const blast = F.markShape('blast', { size: 20 });
  assert.ok(blast.scorch > 0 && blast.pocks > 0);
});

test('exit blow-outs grow with the energy the round still has', () => {
  assert.ok(F.exitShape(25).r > F.exitShape(3).r);
  assert.ok(F.exitShape(10, { glass: true }).bite > F.exitShape(10, { hard: true }).bite);
});

test('ejecta: the exit cone points along the shot, tighter and faster with more energy', () => {
  const lo = F.ejecta('exit', 0.3, 3), hi = F.ejecta('exit', 0.3, 30);
  assert.equal(hi.a, 0.3);
  assert.ok(hi.spread < lo.spread && hi.vmax > lo.vmax && hi.n >= lo.n);
  // back-splash mirrors the shot about the surface: a shot going +x into a wall facing -x comes back along -x
  const back = F.ejecta('entry', 0, 10, -1, 0);
  assert.ok(near(Math.cos(back.a), -1, 1e-9));
  // an oblique shot splashes off at the mirrored angle
  const ob = F.ejecta('entry', Math.PI / 4, 10, 0, -1);
  assert.ok(near(ob.a, -Math.PI / 4, 1e-9));
});

test('tracks stop where the energy runs out, or run to the exit', () => {
  const t = F.track(0, 5, 0, 6, 0.6, 40, 10);
  assert.ok(near(t.len, 10));
  assert.deepEqual([t.x, t.y], [10, 5]);
  const e = F.track(0, 5, 0, 6, 0.6, 40, 10, [40, 5]);
  assert.equal(e.len, 40);
  // kept on the sprite
  assert.equal(F.track(0, 5, 0, 1000, 0.1, 40, 10).x, 40);
});

test('zones: concentrated fire tears a zone, a torn line saws the object in two', () => {
  const z = new F.ZoneGrid(40, 12, 14);
  assert.ok(z.cols >= 3);
  // hammer one corner: it tears, neighbours only wear
  let torn = [];
  for (let k = 0; k < 10 && !torn.length; k++) torn = z.damage(1, 1, 1, 0.1);
  assert.deepEqual(torn, [0]);
  assert.equal(z.cut(), null);
  // tear the whole second column
  const c = 1;
  for (let r = 0; r < z.rows; r++) while (z.state[r * z.cols + c] === 0) z.damage((c + 0.5) * z.cw, (r + 0.5) * z.ch, 1, 0);
  const cut = z.cut();
  assert.ok(cut);
  assert.equal(cut.axis, 'x');
  // the smaller side (column 0) falls off; what stands keeps its other columns
  assert.ok(cut.cells.every((i) => i % z.cols === 0));
  z.detach(cut.cells);
  const b = z.bounds();
  assert.ok(near(b[0], z.cw) && near(b[2], 40));
});

test('zones: a track wears every zone it crosses', () => {
  const z = new F.ZoneGrid(40, 12, 14);
  const before = Array.from(z.hp);
  z.wearLine(0.5, 6, 39.5, 6, 1);
  const worn = Array.from(z.hp).filter((v, i) => v < before[i]).length;
  assert.equal(worn, z.cols - 1); // all but the entry zone (the hit itself wears that one)
});

function inside(poly, W, H) {
  return poly.every(([x, y]) => x >= -1e-6 && y >= -1e-6 && x <= W + 1e-6 && y <= H + 1e-6);
}

test('cuts: planks, wedges, grid, frame and panel cover the sprite with the right number of pieces', () => {
  const rnd = seeded(7);
  assert.equal(F.cutPolys({ cut: 'planks', n: 3, axis: 'long' }, 40, 24, rnd).length, 3);
  const w = F.cutPolys({ cut: 'wedges', n: 5 }, 20, 20, rnd, [5, 5]);
  assert.equal(w.length, 5);
  for (const { poly } of w) assert.ok(inside(poly, 20, 20) && poly.length >= 3);
  assert.equal(F.cutPolys({ cut: 'grid', cols: 3, rows: 2 }, 30, 20, rnd).length, 6);
  assert.equal(F.cutPolys({ cut: 'frame', t: 0.3, sides: 'tlr' }, 44, 18, rnd).length, 3);
  const [panel] = F.cutPolys({ cut: 'panel', rect: [0, 0.5, 1, 1], name: 'door', fly: 2 }, 20, 20, rnd);
  assert.equal(panel.name, 'door');
  assert.equal(panel.fly, 2);
  assert.deepEqual(panel.poly, [[0, 10], [20, 10], [20, 20], [0, 20]]);
  // wedge areas add up to the whole rect (radial fracture leaves nothing out)
  const area = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]; return s + x * v - u * y; }, 0)) / 2;
  const total = w.reduce((s, { poly }) => s + area(poly), 0);
  assert.ok(Math.abs(total - 400) < 1, `wedges cover ${total}`);
});

test('every prop has a recipe that works at any sprite size', () => {
  for (const [type, def] of Object.entries(PROPS)) {
    const r = recipeFor(type, def);
    assert.ok(r.parts.length, type);
    assert.ok(MATERIAL_FX[r.material], type);
    for (const c of r.contents) {
      assert.ok(BITS[c.bit], `${type}: bit ${c.bit}`);
      assert.ok(['hit', 'break'].includes(c.on), type);
    }
    if (r.floats) assert.ok(FLOATS[r.floats[0]], type);
    for (const [W, H] of [[8, 6], [40, 22], [130, 70]]) {
      for (const g of r.parts) {
        for (const { poly } of F.cutPolys(g, W, H, seeded(3), [W / 3, H / 2])) assert.ok(inside(poly, W, H), `${type} ${g.cut} ${W}x${H}`);
      }
    }
  }
  // recipes only name real props
  for (const type of Object.keys(DESTRUCTION)) assert.ok(PROPS[type], type);
});

test('liquids in things: what stands as a puddle names a kind the floor knows how to draw', () => {
  const kinds = [];
  for (const [type, def] of Object.entries(PROPS)) {
    const { leak } = recipeFor(type, def);
    if (leak?.kind) kinds.push(leak.kind);
    if (leak?.flood) assert.ok(leak.kind && leak.flood > 1000, `${type}: a flood stands on the floor`);
  }
  for (const bit of Object.values(BITS)) if (bit.smash) kinds.push(bit.smash.kind);
  assert.ok(kinds.includes('booze') && kinds.includes('water'));
  for (const kind of kinds) {
    const k = LIQUIDS.kinds[kind];
    for (const part of ['body', 'sheen', 'glint', 'ring']) assert.ok(k.puddle[part], `${kind}.${part}`);
    assert.ok(k.prints > 0 && k.wet > 0);
  }
  assert.equal(recipeFor('bar_counter', PROPS.bar_counter).leak.kind, 'booze');
  assert.ok(BITS.bottle.smash.share > 0.5 && BITS.bottle.smash.area > 100);
  for (const type of ['toilet', 'sink']) assert.ok(recipeFor(type, PROPS[type]).leak.flood, type);
});

test('collapse launch: pieces leave along the blow, pushed out from the centre', () => {
  const rnd = seeded(5);
  for (let k = 0; k < 20; k++) {
    const L = F.launch(0, 10, 0, 1.5, 1, rnd);
    assert.ok(Math.abs(L.a) < 1.2 && L.v > 0 && L.vz > 0);
  }
  // a piece on the left of the centre is pushed left-ish compared to one on the right
  const left = F.launch(-Math.PI / 2, -10, 0, 1, 1, () => 0.5), right = F.launch(-Math.PI / 2, 10, 0, 1, 1, () => 0.5);
  assert.ok(Math.cos(left.a) < Math.cos(right.a));
});
