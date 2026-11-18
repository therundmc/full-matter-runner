// The aim's cue (data/aim.js, systems/AimCue.js): what it tells for a gun, a blade, the car gun; the LOCK concept's
// man and the gamepad's soft assist; the lab's station.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { AIM, AIM_STYLES, nextStyle } = await load('game/data/aim.js');
const { aimCue, lineOfFire, lockTarget, assistAim } = await load('game/systems/AimCue.js');
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
    player: p, chars: [p, ...hits.filter((h) => h.kind === 'char').map((h) => h.target)],
    lineOfSight: () => true, sightLine: () => true,
    traceBullet: (x0, y0, x1, y1, team, skip) => {
      const h = hits.find((q) => !skip.has(q.target));
      return h ? { ...h, t: h.at / Math.hypot(x1 - x0, y1 - y0) } : null;
    },
    ...more,
  };
}

test('aim: the concepts are named, the cross first (the default), and F7 walks them round', () => {
  assert.equal(AIM_STYLES[0], 'cross');
  assert.ok(AIM_STYLES.length >= 4 && AIM_STYLES.length <= 6);
  for (const s of AIM_STYLES) assert.ok(/^[A-Z]+$/.test(AIM.names[s]), s);
  let s = 'cross';
  const seen = [];
  for (let i = 0; i < AIM_STYLES.length; i++) { seen.push(s); s = nextStyle(s); }
  assert.deepEqual(seen, AIM_STYLES);
  assert.equal(s, 'cross');
  assert.equal(nextStyle('cross', -1), AIM_STYLES.at(-1));
  assert.equal(nextStyle('garbage'), AIM_STYLES[1]);
});

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
  assert.equal(onMan.half, WEAPONS.pistol.spread);
  const onCrate = aimCue(world(p, [{ kind: 'prop', target: crate, at: 60 }, { kind: 'char', target: guard, at: 110 }]));
  assert.deepEqual([onCrate.hit, onCrate.target, Math.round(onCrate.len)], [true, null, 60]);
  const open = aimCue(world(p));
  assert.deepEqual([open.hit, open.target, open.len], [false, null, AIM.reach]);
  // the muzzle poked into a wall: the line dies there
  const poked = aimCue(world(p, [], { lineOfSight: () => false }));
  assert.deepEqual([poked.len, poked.hit], [0, true]);
  assert.ok(aimCue(world(player('shotgun'))).half > onMan.half * 4, 'a shotgun throws wider');
});

test('aim: a blade or his fists: a short cue from his front, as wide as the swing, no line traced', () => {
  for (const type of ['bat', 'knife', null]) {
    const p = player(type), d = p.def;
    const q = aimCue(world(p, [], { traceBullet() { throw new Error('traced'); } }));
    assert.deepEqual([q.kind, q.x, q.half, q.target], ['melee', p.radius, d.arc / 2, null]);
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
