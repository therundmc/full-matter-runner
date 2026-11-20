// The aim's cue, LOCK (data/aim.js, systems/AimCue.js): what it tells for a gun, a blade, the car gun; LOCK's man
// and the gamepad's soft assist; the lab's station.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { AIM } = await load('game/data/aim.js');
const { aimCue, lineOfFire, lockTarget, assistAim, meleeLock } = await load('game/systems/AimCue.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { default: lab } = await load('game/data/levels/lab.js');

const man = (x, y, more = {}) => ({ alive: true, team: 'enemy', x, y, radius: 10, ...more });
function player(type, more = {}) {
  return {
    alive: true, team: 'player', x: 0, y: 0, angle: 0, radius: 10, weapon: type ? { type } : null, knocked: 0, vaulting: null,
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    muzzlePos() { return { x: 20, y: 0, a: 0 }; }, ...more,
  };
}
// hits: what the line meets, nearest first: { kind, target, at } (at: px along +x from the muzzle)
function world(p, hits = [], more = {}) {
  return {
    player: p, chars: [p, ...hits.filter((h) => h.kind === 'char').map((h) => h.target)], enemies: [],
    lineOfSight: () => true, sightLine: () => true,
    traceBullet: (x0, y0, x1, y1, team, skip) => {
      const h = hits.find((q) => !skip.has(q.target));
      return h ? { ...h, t: h.at / Math.hypot(x1 - x0, y1 - y0) } : null;
    },
    ...more,
  };
}

test('aim: the cue never wears a guard\'s red', () => {
  for (const k of ['rest', 'hot', 'off', 'bone']) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(AIM[k].slice(i, i + 2), 16));
    assert.ok(!(r > 180 && g < 110 && b < 110), `${k} ${AIM[k]} is not red`);
  }
});

test('aim: a gun\'s line starts at the muzzle, stops on the first solid thing, and knows a man from a wall', () => {
  const p = player('pistol'), guard = man(140, 0), pane = {}, crate = {};
  const onMan = aimCue(world(p, [{ kind: 'glass', target: pane, at: 40 }, { kind: 'char', target: guard, at: 110 }]));
  assert.deepEqual([onMan.x, onMan.kind, onMan.hit, onMan.target, Math.round(onMan.len)], [20, 'gun', true, guard, 110]);
  const onCrate = aimCue(world(p, [{ kind: 'prop', target: crate, at: 60 }, { kind: 'char', target: guard, at: 110 }]));
  assert.deepEqual([onCrate.hit, onCrate.target, Math.round(onCrate.len)], [true, null, 60]);
  const open = aimCue(world(p));
  assert.deepEqual([open.hit, open.target, open.len], [false, null, AIM.reach]);
  // the muzzle poked into a wall: the line dies there
  const poked = aimCue(world(p, [], { lineOfSight: () => false }));
  assert.deepEqual([poked.len, poked.hit], [0, true]);
});

test('aim: a blade or his fists: a short cue from his front, no line traced', () => {
  for (const type of ['bat', 'knife', null]) {
    const p = player(type), d = p.def;
    const q = aimCue(world(p, [], { traceBullet() { throw new Error('traced'); } }));
    assert.deepEqual([q.kind, q.x, q.target], ['melee', p.radius, null]);
    assert.ok(q.len > 0 && q.len <= d.range, `${d.name}: ${q.len}`);
  }
});

test('aim: no cue for a man who cannot aim', () => {
  for (const more of [{ alive: false }, { knocked: 0.4 }, { vaulting: {} }, { passage: {} }, { hidden: true }, { rising: true }, { riding: {} }]) {
    assert.equal(aimCue(world(player('pistol', more))), null, JSON.stringify(more));
  }
  assert.equal(aimCue({ player: null }), null);
});

test('aim: at the wheel the cue is his car gun\'s: from his hand in its arc, a grey stub from his seat out of it, none with no gun out', () => {
  const van = {}, p = player('uzi', { riding: {}, hidden: true });
  const gun = { van, aimed: { a: -1, ok: true }, hand: () => ({ x: 50, y: -8 }), root: () => ({ x: 44, y: 0 }) };
  let skipped = null;
  const w = world(p, [], { drive: { on: true, gun }, traceBullet: (x0, y0, x1, y1, team, skip) => { skipped = skip; return null; } });
  const q = aimCue(w);
  assert.deepEqual([q.x, q.y, q.a, q.off, q.len], [50, -8, -1, false, AIM.reach]);
  assert.ok(skipped.has(van) && skipped.has(p), 'never his own car');
  gun.aimed = { a: 2, ok: false };
  const off = aimCue(w);
  assert.deepEqual([off.x, off.y, off.off, off.len, off.target], [44, 0, true, AIM.offArc.len, null]);
  gun.aimed = null;
  assert.equal(aimCue(w), null);
});

test('aim: lineOfFire goes through what a round goes through, a few times at most', () => {
  const things = AIM.clear.map((kind, i) => ({ kind, target: {}, at: 10 + i }));
  const wall = { kind: 'wall', at: 90 };
  const f = lineOfFire(world(player('pistol'), [...things, wall]), 'player', 0, 0, 0, []);
  assert.deepEqual([Math.round(f.len), f.hit, f.target], [90, true, null]);
});

test('lock: the man nearest the aim line within the cone, in reach and in sight', () => {
  const p = player('pistol'), a = man(100, 10), b = man(100, -40), far = man(900, 0), dead = man(60, 0, { alive: false });
  const w = { player: p, chars: [p, a, b, far, dead], sightLine: () => true };
  assert.equal(lockTarget(w, 'player', 0, 0, 0), a);
  assert.equal(lockTarget(w, 'player', 0, 0, -0.38), b);
  assert.equal(lockTarget(w, 'player', 0, 0, Math.PI), null, 'nobody behind him');
  assert.equal(lockTarget({ ...w, sightLine: (x0, y0, x1, y1) => y1 !== 10 }, 'player', 0, 0, 0, 0.5), b, 'a man behind a wall is not it');
  assert.equal(lockTarget({ ...w, chars: [p, far] }, 'player', 0, 0, 0), null, 'too far');
  // of two on the same line, the nearer
  const near = man(50, 0), back = man(150, 0);
  assert.equal(lockTarget({ ...w, chars: [p, back, near] }, 'player', 0, 0, 0), near);
});

test('lock: the gamepad\'s assist bends the aim onto a man close to the stick\'s way, with a gun, on foot only', () => {
  const p = player('pistol'), a = man(100, 10);
  const w = { player: p, chars: [p, a], sightLine: () => true };
  assert.deepEqual(assistAim(w, 0), { x: 100, y: 10 });
  assert.equal(assistAim(w, AIM.lock.assist + 0.15), null, 'the stick turned away lets go');
  assert.ok(AIM.lock.assist <= AIM.lock.cone, 'it brackets before it pulls');
  p.weapon = { type: 'bat' };
  assert.equal(assistAim(w, 0), null, 'a blade has its own lunge');
  p.weapon = { type: 'pistol' };
  assert.equal(assistAim({ ...w, drive: { on: true } }, 0), null);
  p.alive = false;
  assert.equal(assistAim(w, 0), null);
});

test('lab: an AIM station, men at four distances (one behind a wall\'s end), a thin gun, a wide one, a fast one, a blade', () => {
  const at = lab.floor.find(([name]) => name === 'label_aim');
  assert.ok(at, 'its stencil');
  const inRoom = (x, y) => x >= 64 && x < 74 && y >= 1 && y < 6;
  for (const kind of ['pistol', 'shotgun', 'uzi', 'bat']) assert.ok(lab.drops.some(([k, x, y]) => k === kind && inRoom(x, y)), kind);
  const men = [];
  lab.actors.forEach((row, y) => [...row].forEach((ch, x) => { if ('mkjb'.includes(ch) && inRoom(x, y)) men.push([x, y]); }));
  assert.equal(men.length, 4);
  assert.ok(new Set(men.map(([x]) => x)).size === 4, 'each at his own distance');
  assert.equal(lab.tiles[3][63] !== '#' && lab.tiles[3][63] !== 'X', true, 'a way in from the takedowns room');
  assert.equal(lab.tiles[2][70], '#', 'the wall\'s end');
  assert.ok(lab.passive);
});

// ---- LOCK's worn marks (systems/AimMark.js)
const { grit, wear, ringBits, barBits, chevronBits, flecks, ringRadius } = await load('game/systems/AimMark.js');

test('worn: the wear is a hash of the mark\'s own bits: the same every frame, another for another man', () => {
  for (let i = 0; i < 200; i++) assert.ok(grit(3, i) >= 0 && grit(3, i) < 1);
  assert.equal(grit(5, 12), grit(5, 12));
  assert.notEqual(grit(5, 12), grit(6, 12));
  const kinds = new Set();
  let gone = 0;
  for (let i = 0; i < 2000; i++) { const k = wear(9, i); kinds.add(k); if (!k) gone++; }
  assert.deepEqual([...kinds].sort(), [0, AIM.worn.fade, 1].sort());
  assert.ok(Math.abs(gone / 2000 - AIM.worn.chip) < 0.04, 'about `chip` of the paint is gone');
  assert.ok(AIM.worn.chip + AIM.worn.thin < 0.5, 'most of a mark is whole: it still reads');
});

test('worn: a stencil circle is whole px on its radius, in arcs with bare bridges, and never flickers', () => {
  const R = AIM.lock.ring, clean = { ...AIM.worn, chip: 0, thin: 0 };
  for (const i of [0, 1]) {
    const bits = ringBits(4, R.r[i], R.arcs, R.span[i], R.turn, R.width[i]);
    assert.deepEqual(bits, ringBits(4, R.r[i], R.arcs, R.span[i], R.turn, R.width[i]), 'the same twice');
    assert.ok(bits.length > 8, 'something left of it');
    for (const b of bits) {
      assert.ok(Number.isInteger(b.x) && Number.isInteger(b.y) && b.k > 0 && b.k <= 1);
      assert.ok(Math.abs(Math.hypot(b.x, b.y) - R.r[i]) <= R.width[i]);
      // the bridges are on the axes: nothing within a px or two of them
      assert.ok(Math.min(Math.abs(b.x), Math.abs(b.y)) >= 2, `${b.x},${b.y} is on an arc`);
    }
    assert.ok(bits.length < ringBits(4, R.r[i], R.arcs, R.span[i], R.turn, R.width[i], clean).length, 'chipped');
  }
  assert.notDeepEqual(ringBits(4, 14, 4, 1.2, R.turn), ringBits(5, 14, 4, 1.2, R.turn), 'each man his own wear');
  assert.ok(ringBits(1, R.r[1], R.arcs, R.span[1], R.turn, 1, clean).length > ringBits(1, R.r[0], R.arcs, R.span[0], R.turn, 1, clean).length, 'more of a circle once locked');
  // one arc turned to an angle stays round that angle (the tick)
  const at = 2.1, span = AIM.lock.tick.span[0];
  for (const b of ringBits(7, 46, 1, span, at, 1, clean)) assert.ok(Math.abs(Math.atan2(b.y, b.x) - at) <= span / 2 + 0.03);
});

test('worn: the circle closes in on the man it locks, in whole px', () => {
  const R = AIM.lock.ring;
  assert.equal(ringRadius(false, 5, R), R.r[0]);
  assert.equal(ringRadius(true, 0, R), R.r[0]);
  assert.equal(ringRadius(true, R.snap, R), R.r[1]);
  assert.equal(ringRadius(true, 9, R), R.r[1]);
  assert.ok(Number.isInteger(ringRadius(true, R.snap / 3, R)));
  assert.ok(R.r[1] < R.r[0] && R.r[1] >= 13, 'outside his body (10 px drawn 1.3 x)');
});

test('worn: a chevron keeps its tip, a bar its length, the specks stay outside the mark', () => {
  for (let seed = 1; seed < 30; seed++) {
    const bits = chevronBits(seed, 5);
    assert.ok(bits.some((b) => b.u === 0 && b.v === 0 && b.k === 1), 'the tip');
    assert.ok(bits.length >= 8);
    assert.deepEqual(bits, chevronBits(seed, 5));
  }
  const bar = barBits(3, AIM.hop.edge);
  assert.deepEqual(bar, barBits(3, AIM.hop.edge));
  assert.ok(bar.length > AIM.hop.edge / 2 && bar.every((b) => Math.abs(b.u) <= AIM.hop.edge / 2));
  const f = flecks(8, 14);
  assert.equal(f.length, AIM.worn.flecks);
  assert.deepEqual(f, flecks(8, 14));
  for (const q of f) assert.ok(Math.hypot(q.x, q.y) >= 14 + AIM.worn.stray[0] - 1);
});

test('lock: its mark is one of the marks kept to compare, each with its numbers', () => {
  const L = AIM.lock;
  assert.ok(L.marks.includes(L.mark));
  for (const m of L.marks) assert.ok(L[m] && L[m].alpha.length === 2 && L[m].alpha[0] < L[m].alpha[1], m);
  assert.ok(L.chevron.alpha[0] < L.chevron.alpha[1] && L.chevron.at > L.chevron.wall, 'the floor chevron is light, brighter on a man');
});

const { drawAim } = await load('game/render/AimArt.js');
// the pixels LOCK paints in a frame (its inks only: the dark edge under them left out), on a canvas that counts them
function painted(w) {
  const px = [];
  const ctx = { save() {}, restore() {}, globalAlpha: 1, fillStyle: '', fillRect(x, y, sw) { if (sw === 1) px.push([x, y, this.fillStyle]); } };
  drawAim(ctx, w, 0);
  return px;
}

test('lock: the floor chevron is drawn only with the AIM MARK option; the ticks on the man always', () => {
  const p = player('bat');
  const w = { ...world(p), aimMark: false };
  assert.equal(painted(w).length, 0, 'nobody near the line, the option off: nothing');
  const mark = painted({ ...w, aimMark: true });
  assert.ok(mark.length > 6 && mark.every(([x, , col]) => x > AIM.lock.chevron.at - 8 && x <= AIM.lock.chevron.at + AIM.lock.chevron.size + 1 && col === AIM.rest),
    'a cyan chevron out along the aim, at its distance');
  // a man held: his corner ticks, with or without the option
  const g = man(60, 0), held = { ...w, chars: [p, g] };
  const ticks = painted(held);
  assert.ok(ticks.length > 0 && ticks.every(([x]) => Math.abs(x - 60) >= AIM.lock.corners.box - AIM.lock.corners.corner));
  assert.ok(painted({ ...held, aimMark: true }).length > ticks.length);
});

const { loadSettings } = await load('game/systems/Settings.js');

test('lock: an old save holding an aim style (`aim: \'wedge\'`) loads fine, and the aim is still LOCK', () => {
  const data = { 'fmr.settings.v1': JSON.stringify({ aim: 'wedge', aimMark: false }) };
  const s = loadSettings({ getItem: (k) => data[k] ?? null, setItem() {} });
  assert.ok(!('aim' in s), 'the old key is dropped');
  // the world as Game.aimTo sets it from those settings: LOCK's corner ticks on the man near the line, its melee lock
  const p = player('bat'), g = man(30, 4, { isEnemy: true, knocked: 0 });
  const w = { ...world(p), chars: [p, g], enemies: [g], aimMark: s.aimMark };
  const ticks = painted(w);
  assert.ok(ticks.length > 0 && ticks.every(([x]) => Math.abs(x - 30) >= AIM.lock.corners.box - AIM.lock.corners.corner), 'his corner ticks');
  assert.equal(meleeLock(w, p, p.def, 0)?.man, g, 'the bat held onto him');
});
