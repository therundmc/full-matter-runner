// How a prop is held up (its def's `mount`, data/mounts.js) says, in one place, how it is drawn and what a round, a
// blow or a blast does to it. A structure (a bridge, a gantry's truss, the toll's roof) is drawn where it stands (no
// parallax: it would slide over its abutments like a lamp on a wire) and nothing ever touches it; what hangs from a
// ceiling swings like a pendulum and only a blast reaches it; things on a pole keep their parallax; the rest shudders.
import { load } from './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctx } from './helpers.mjs';

// no DOM under Node: entities only need canvases to exist, nothing is looked at here
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { PROPS, ON_WALL } = await load('game/data/props.js');
const { MOUNTS, SWING, mountName, mountOf, parallaxOf } = await load('game/data/mounts.js');
const { BOARDS } = await load('game/data/billboards.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: Projectile } = await load('game/entities/Projectile.js');
const { traceBullet, brushFittings } = await load('game/systems/Ballistics.js');
const { explode } = await load('game/systems/Explosions.js');
const { WEAPONS } = await load('game/data/weapons.js');

const STRUCTURES = ['viaduct', 'overpass', 'toll_canopy', 'fire_escape', 'tv_antenna', 'deco_canopy_pink', 'deco_canopy_mint',
  'deco_canopy_peach', 'deco_canopy_lavender'];
const BILLBOARDS = ['billboard_tan', 'billboard_radio', 'billboard_motel', 'gantry_sign', 'sign_gantry'];

test('mounts: every overhead or hung prop names its mount, and a known one; the wall ones are ON_WALL', () => {
  for (const [k, d] of Object.entries(PROPS)) {
    if (d.overhead || d.hung) assert.ok(d.mount, `${k}: no mount`);
    if (d.mount) assert.ok(MOUNTS[d.mount], `${k}: unknown mount ${d.mount}`);
    // what hangs or stands overhead with no body is never a 'floor' or 'pole' thing in the way
    if (['ceiling', 'structure', 'billboard', 'awning'].includes(d.mount)) assert.ok(d.hung && d.overhead, `${k}: hung overhead`);
    if (d.mount === 'billboard') assert.ok(BOARDS[k], `${k}: its layout in data/billboards.js`);
    assert.equal(ON_WALL.has(k), d.mount === 'wall', k);
  }
  for (const k of STRUCTURES) assert.equal(mountName(PROPS[k]), 'structure', k);
  for (const k of BILLBOARDS) assert.equal(mountName(PROPS[k]), 'billboard', k);
  for (const k of ['ceiling_lamp', 'pool_lamp', 'mirror_ball', 'ceiling_fan', 'string_lights']) assert.equal(mountName(PROPS[k]), 'ceiling', k);
  for (const k of ['palm_tree', 'streetlight', 'royal_palm', 'sign_stop', 'traffic_light', 'highway_lamp']) assert.equal(mountName(PROPS[k]), 'pole', k);
  assert.equal(mountName(PROPS.table), 'floor', 'the default');
});

test('mounts: what each one does (parallax, swing, rounds, blows, blasts)', () => {
  const row = (m) => { const r = MOUNTS[m]; return [r.hits, r.rounds, r.blows, r.blasts, r.swing, r.parallax]; };
  assert.deepEqual(row('structure'), ['none', 'pass', false, 'none', 'none', false]);
  assert.deepEqual(row('billboard'), ['none', 'face', false, 'face', 'none', false]);
  assert.deepEqual(row('ceiling'), ['blast', 'under', false, 'swing', 'pendulum', true]);
  for (const m of ['floor', 'wall', 'inset', 'pole', 'awning']) assert.deepEqual(row(m).slice(0, 5), ['all', 'hit', true, 'hit', 'shudder'], m);
  assert.ok(MOUNTS.pole.parallax && !MOUNTS.awning.parallax && !MOUNTS.floor.parallax);
  // parallax: a pole's or a ceiling's height, none for the rest whatever height it is given
  assert.equal(parallaxOf({ mount: 'pole', height: 0.06 }), 0.06);
  assert.equal(parallaxOf({ mount: 'ceiling', height: 0.05 }), 0.05);
  for (const m of ['structure', 'billboard', 'awning', 'wall', 'floor']) assert.equal(parallaxOf({ mount: m, height: 0.05 }), 0, m);
  assert.equal(mountOf({}), MOUNTS.floor);
  for (const s of Object.values(MOUNTS)) assert.ok(s.swing === 'none' || SWING[s.swing], s.swing);
});

test('mounts: rigid overhead structures are drawn where they stand; poles and ceiling lamps keep their parallax', () => {
  for (const k of [...STRUCTURES, ...BILLBOARDS, 'awning', 'awning_pink', 'carport', 'laundry_line', 'pennant_string', 'string_lights']) {
    assert.equal(parallaxOf(PROPS[k]), 0, k);
  }
  for (const k of ['palm_tree', 'royal_palm', 'ceiling_lamp', 'ceiling_fan', 'palm_fronds', 'pole_sign_motel']) assert.ok(parallaxOf(PROPS[k]) > 0, k);
});

test('mounts: a round or a blast never moves a structure or a billboard; a ceiling lamp swings, an awning shudders', async () => {
  const fake = (def) => Object.assign(Object.create(Prop.prototype), { def, kick: { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 }, flash: 0 });
  for (const k of [...STRUCTURES, ...BILLBOARDS]) {
    const p = fake(PROPS[k]);
    p.recoil(0.3, 2);
    assert.deepEqual([p.kick.vx, p.kick.vy, p.kick.vr, p.flash], [0, 0, 0, 0], k);
  }
  const lamp = fake(PROPS.ceiling_lamp), awning = fake(PROPS.awning), chair = fake(PROPS.chair);
  lamp.recoil(0, 1); awning.recoil(0, 1); chair.recoil(0, 1);
  assert.ok(lamp.kick.vx > awning.kick.vx && awning.kick.vx > chair.kick.vx && chair.kick.vx > 0, 'pendulum > bolted > loose');
  // the lamp swings on, the awning is still again in a moment
  for (let i = 0; i < 30; i++) { lamp.update(1 / 60); awning.update(1 / 60); }
  assert.ok(Math.abs(lamp.kick.x) > 0.2, 'still swinging');
  assert.ok(Math.abs(awning.kick.x) < 0.05, 'stiff');
});

// ---- a structure is immune: rounds fly under it, blows and blasts do nothing to it

const ROWS = ['X'.repeat(40), ...Array(22).fill('X' + '.'.repeat(38) + 'X'), 'X'.repeat(40)];
function world() {
  const quiet = new Proxy({}, { get: () => () => {} });
  const w = {
    map: new TileMap(ROWS), events: new EventBus(), time: 0, particles: quiet, decals: quiet, smoke: quiet, papers: quiet,
    props: [], debris: [], chars: [], enemies: [], doors: [], windows: [], items: [], corpses: [], fences: [], rings: [], timers: [],
    hits: [], sounds: [], bodies: new Set(),
    physics: { freezeIfHeavy() {}, bodies: () => [...w.bodies] },
    game: { flash() {} },
    addBody(b) { this.bodies.add(b); }, removeBody(b) { this.bodies.delete(b); },
    addDebris(d) { this.debris.push(d); }, removeDebris(d) { this.debris = this.debris.filter((o) => o !== d); },
    shake() {}, hitstop() {}, light() {}, emit() {}, flashGlass() {}, noise() {}, damageWall() {},
    sound(name) { this.sounds.push(name); },
    after(sec, fn) { this.timers.push(fn); },
    traceBullet(x0, y0, x1, y1, team, ignore, floor) { return traceBullet(this, x0, y0, x1, y1, team, ignore, floor); },
  };
  w.events.on('propHit', ({ prop, kind }) => w.hits.push([prop.type, kind]));
  w.events.on('round', (e) => brushFittings(w, e.x0, e.y0, e.x1, e.y1));
  return w;
}
const put = (w, type, x, y, deg = 0) => {
  const p = new Prop(w, type, x, y, (deg * Math.PI) / 180);
  w.props.push(p);
  return p;
};
function fire(w, x0, y0, a = 0) {
  const r = new Projectile(w, x0, y0, a, WEAPONS.pistol.speed, { team: 'player', owner: null, weapon: WEAPONS.pistol, pen: WEAPONS.pistol.pen, life: 1.5 });
  for (let i = 0; i < 100 && !r.dead; i++) r.update(1 / 60);
  return r;
}
const still = (p) => [p.body.position.x, p.body.position.y, p.body.angle, p.kick.vx, p.kick.vy, p.kick.vr, p.kick.x, p.kick.y, p.flash];

test('mounts: a structure is immune - a round flies under it to what is beyond, a hit of any kind or a blast does nothing', () => {
  for (const k of STRUCTURES) {
    const w = world(), s = put(w, k, 640, 380), safe = put(w, 'safe', 1200, 380);
    const was = still(s);
    // the trace never meets it: the round goes on into the safe beyond
    assert.equal(traceBullet(w, 60, 380, 1230, 380, 'player', new Set())?.target, safe, `${k}: traced through`);
    fire(w, 60, 380);
    assert.deepEqual([...new Set(w.hits.map(([t]) => t))], ['safe'], `${k}: only the safe struck`);
    w.hits.length = 0; w.sounds.length = 0;
    for (const kind of ['bullet', 'rifle', 'pellet', 'graze', 'blunt', 'cut', 'punch', 'blast', 'shrapnel']) s.hit(5, s.x, s.y, 0.4, 2.5, kind);
    s.break(0.4, 3);
    assert.deepEqual([w.hits, w.sounds, s.canvas, s.hp, s.dead, s.dying], [[], [], null, s.def.hp, false, false], `${k}: untouched`);
    explode(w, s.x + 20, s.y + 10, { radius: 120 });
    assert.deepEqual(w.hits, [], `${k}: the blast takes nothing off it`);
    assert.deepEqual([s.canvas, s.hp, s.dead, s.dying], [null, s.def.hp, false, false], `${k}: whole after the blast`);
    assert.deepEqual(still(s), was, `${k}: never moved`);
  }
});
