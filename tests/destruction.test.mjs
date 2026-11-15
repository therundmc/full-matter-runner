import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const F = await load('game/systems/Fracture.js');
const { recipeFor, DESTRUCTION, BITS, FLOATS, MATERIAL_FX } = await load('game/data/destruction.js');
const { PROPS } = await load('game/data/props.js');
const { LIQUIDS } = await load('game/data/liquids.js');

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

test('liquids in things: what runs on the floor names a kind the floor knows how to draw', () => {
  const kinds = [];
  for (const [type, def] of Object.entries(PROPS)) {
    const { leak } = recipeFor(type, def);
    if (leak?.kind) kinds.push(leak.kind);
    if (leak?.flood) assert.ok(leak.kind && leak.flood > 1000, `${type}: a flood stands on the floor`);
  }
  for (const bit of Object.values(BITS)) if (bit.smash) kinds.push(bit.smash.kind);
  assert.ok(kinds.includes('booze') && kinds.includes('water'));
  for (const kind of kinds) {
    const k = LIQUIDS.kinds[kind], look = LIQUIDS.look.kinds[kind];
    assert.ok(look && (look.blood || look.ramp.length === 5) && look.ring, `${kind}: drawn`);
    assert.ok(k.prints > 0 && k.film > 0 && k.age > 0);
  }
  assert.ok(BITS.bottle.smash.share > 0.5 && BITS.bottle.smash.area > 100);
  for (const type of ['toilet', 'sink']) assert.ok(recipeFor(type, PROPS[type]).leak.flood, type);
});

test('racks: bottles in plain sight are something that smashes into a liquid, on a grid inside the sprite', () => {
  let grids = 0;
  for (const [type, def] of Object.entries(PROPS)) {
    const { rack } = recipeFor(type, def);
    if (!rack) continue;
    assert.ok(LIQUIDS.kinds[BITS[rack.bit].smash.kind], `${type}: ${rack.bit}`);
    if (rack.scatter) {
      assert.ok(rack.scatter[0] <= rack.scatter[1] && rack.colors.length > 0, type);
      assert.ok(rack.rect[2] + 5 <= def.w && rack.rect[3] + 5 <= def.h, `${type}: glasses stand on the top`);
    } else {
      grids++;
      // sprites carry a 1 px outline around the body: the last bottle and the last rank stay inside it
      assert.ok(rack.x + (rack.n - 1) * rack.dx + rack.s <= def.w + 1, `${type}: across`);
      assert.ok(Math.max(...rack.ys) + rack.s <= def.h + 1, `${type}: ranks`);
    }
  }
  assert.ok(grids >= 2 && recipeFor('bar_counter', PROPS.bar_counter).rack.scatter, 'shelves and the counter');
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

test('collapse wave: parts let go from the blow outward, all of them within the time it takes', () => {
  const parts = [{ cx: 2, cy: 5 }, { cx: 20, cy: 5 }, { cx: 38, cy: 5 }, { cx: 20, cy: 18 }];
  const t = F.crumble(parts, [0, 5], 0.3, seeded(9));
  assert.ok(t[0] < t[1] && t[1] < t[2], `${t}`);
  assert.ok(t[0] < 0.08 && t[2] > 0.2, 'the near end at once, the far end last');
  assert.ok(t.every((v) => v >= 0 && v <= 0.3));
  assert.deepEqual(F.crumble(parts, [0, 5], 0), [0, 0, 0, 0], 'a blast takes it all at once');
  assert.deepEqual(F.crumble([], [0, 0], 0.3), []);
});

const area = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]; return s + x * v - u * y; }, 0)) / 2;

test('round things: the rim breaks in arcs inside the outline, a lid comes apart along its own seams', () => {
  const rim = F.cutPolys({ cut: 'ring', n: 6, t: 0.2 }, 40, 40, seeded(4));
  assert.equal(rim.length, 6);
  for (const { poly } of rim) assert.ok(poly.every(([x, y]) => Math.hypot(x - 20, y - 20) <= 20 + 1e-6), 'on the disc');
  const band = rim.reduce((s, { poly }) => s + area(poly), 0), want = Math.PI * (400 - 256);
  assert.ok(Math.abs(band - want) < want * 0.12, `band ${band} vs ${want}`);
  // a lid's plates meet in its middle, wherever it was hit
  const lid = F.cutPolys({ cut: 'wedges', n: 6, centre: true }, 40, 40, seeded(2), [3, 3]);
  for (const { poly } of lid) assert.ok(poly.some(([x, y]) => Math.hypot(x - 20, y - 20) < 1e-6));
});

test('torn zones: a bite out of the object, never a quarter of it, opening on the edge it is on', () => {
  // a round table: its zones are small enough that one torn off is not a pie wedge
  const z = new F.ZoneGrid(28, 28, 10);
  assert.ok(z.cols >= 3 && z.rows >= 3);
  for (let i = 0; i < z.cols * z.rows; i++) {
    const poly = F.tearShape(z.rect(i), 28, 28, seeded(i + 1));
    assert.ok(inside(poly, 28, 28) && poly.length >= 8);
    assert.ok(area(poly) < 28 * 28 * 0.15, `zone ${i}: ${area(poly)}`);
  }
  // a corner zone reaches the corner
  const corner = F.tearShape(z.rect(0), 28, 28, seeded(5));
  assert.ok(corner.some(([x, y]) => x < 1 || y < 1));
});

test('materials give way their own way: wood breaks off and saws through, sheet metal gashes, upholstery rips', () => {
  for (const [name, fx] of Object.entries(MATERIAL_FX)) {
    assert.ok(['chunk', 'gash', 'rip'].includes(fx.tear), name);
    assert.equal(typeof fx.saw, 'boolean', name);
  }
  assert.equal(MATERIAL_FX.metal.tear, 'gash');
  assert.equal(MATERIAL_FX.fabric.tear, 'rip');
  assert.ok(MATERIAL_FX.wood.saw && !MATERIAL_FX.metal.saw);
  // a box is never sawn in two, a pipe is
  assert.ok(!recipeFor('ac_unit', PROPS.ac_unit).saw && recipeFor('pipe_water', PROPS.pipe_water).saw);
  // ways up and over are marked, never torn: their recipes name real materials
  for (const type of ['ladder', 'parapet']) {
    assert.ok(PROPS[type].lasting && DESTRUCTION[type], type);
    assert.ok(MATERIAL_FX[recipeFor(type, PROPS[type]).material], type);
  }
  assert.equal(recipeFor('ladder', PROPS.ladder).material, 'metal');
});

test('recent props have a recipe of their own', () => {
  for (const type of ['water_tank', 'ac_unit', 'roof_vent', 'fuse_box', 'emergency_light', 'dance_stage', 'string_lights']) {
    assert.ok(DESTRUCTION[type], type);
  }
  const tank = recipeFor('water_tank', PROPS.water_tank);
  assert.equal(tank.leak.kind, 'water');
  assert.equal(tank.leak.on, 'hit');
  assert.ok(tank.gush > 5000, 'it bursts into a big pool');
  assert.ok(tank.parts.some((c) => c.cut === 'ring') && tank.parts.some((c) => c.cut === 'wedges' && c.centre));
  const ac = recipeFor('ac_unit', PROPS.ac_unit);
  assert.ok(ac.electric && ac.puff > 0 && ac.parts.some((c) => c.name === 'grille'));
  const fuse = recipeFor('fuse_box', PROPS.fuse_box);
  assert.ok(fuse.electric && fuse.doors.n >= 1 && fuse.doors.at >= 1 && fuse.live > 0);
  assert.equal(recipeFor('roof_vent', PROPS.roof_vent).stump, 'duct');
  // round tops lose their rim in arcs first
  for (const type of ['table_round', 'card_table', 'dance_stage']) assert.equal(recipeFor(type, PROPS[type]).parts[0].cut, 'ring', type);
});

test('a broken plant leaves its soil spilled where it stood and the shards of its pot', () => {
  const r = recipeFor('plant', PROPS.plant);
  assert.equal(r.spill, 'soil');
  const pot = r.contents.find((c) => c.bit === 'pot');
  assert.ok(pot && pot.on === 'break' && pot.n >= 4 && BITS.pot.material === 'ceramic');
  assert.ok(r.floats[0] === 'leaf');
});
