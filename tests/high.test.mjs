// Fittings up on the ceiling (prop def `high`): rounds, blows and what is thrown go under them (a round passing under
// shakes them a little), only a blast breaks them; what is on the walls (lamps, neons, the fuse box) breaks as anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: entities only need canvases to exist, nothing is looked at here
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: Projectile } = await load('game/entities/Projectile.js');
const { default: Player } = await load('game/entities/Player.js');
const { traceBullet, brushFittings } = await load('game/systems/Ballistics.js');
const { explode } = await load('game/systems/Explosions.js');
const { PROPS } = await load('game/data/props.js');
const { WEAPONS } = await load('game/data/weapons.js');

const FITTINGS = ['ceiling_lamp', 'pool_lamp', 'mirror_ball', 'ceiling_fan'];
const Y = 96; // the line every round here flies along

// a room 30 x 6 tiles walled round
const ROWS = ['X'.repeat(30), ...Array(4).fill('X' + '.'.repeat(28) + 'X'), 'X'.repeat(30)];

// just enough of World for props, rounds and a blast: real map and event bus, every effect a no-op
function world() {
  const quiet = new Proxy({}, { get: () => () => {} });
  const w = {
    map: new TileMap(ROWS), events: new EventBus(), time: 0, particles: quiet, decals: quiet, smoke: quiet, papers: quiet,
    props: [], debris: [], chars: [], enemies: [], doors: [], windows: [], items: [], corpses: [], fences: [], rings: [], timers: [],
    hits: [], bodies: new Set(),
    physics: { freezeIfHeavy() {}, bodies: () => [...w.bodies] },
    game: { flash() {} },
    addBody(b) { this.bodies.add(b); }, removeBody(b) { this.bodies.delete(b); },
    addDebris(d) { this.debris.push(d); }, removeDebris(d) { this.debris = this.debris.filter((o) => o !== d); },
    shake() {}, hitstop() {}, light() {}, emit() {}, flashGlass() {}, noise() {}, sound() {}, damageWall() {},
    after(sec, fn) { this.timers.push(fn); },
    traceBullet(x0, y0, x1, y1, team, ignore, floor) { return traceBullet(this, x0, y0, x1, y1, team, ignore, floor); },
  };
  w.events.on('propHit', ({ prop, kind }) => w.hits.push([prop.type, kind]));
  w.events.on('round', (e) => brushFittings(w, e.x0, e.y0, e.x1, e.y1)); // as World wires it
  return w;
}
const put = (w, type, x, y = Y, deg = 0) => {
  const p = new Prop(w, type, x, y, (deg * Math.PI) / 180);
  w.props.push(p);
  return p;
};
// a pistol round fired east along y from x0, flown until it stops or runs out
function fire(w, x0 = 40, y = Y) {
  const r = new Projectile(w, x0, y, 0, WEAPONS.pistol.speed, { team: 'player', owner: null, weapon: WEAPONS.pistol, pen: WEAPONS.pistol.pen, life: 0.5 });
  for (let i = 0; i < 40 && !r.dead; i++) r.update(1 / 60);
  return r;
}
const struck = (w) => [...new Set(w.hits.map(([t]) => t))];
const intact = (p) => !p.dead && !p.dying && p.hp === p.def.hp;

test('high: what hangs from the ceiling is flagged, what is on the walls or meant to be shot is not', () => {
  for (const t of [...FITTINGS, 'string_lights']) {
    assert.ok(PROPS[t].high, t);
  }
  for (const t of ['wall_lamp', 'tube_light', 'neon_tube_pink', 'neon_sign_open', 'neon_sign_bar', 'emergency_light', 'streetlight',
    'fuse_box', 'alarm_box', 'fire_alarm', 'extinguisher', 'pipe_steam', 'pipe_water', 'floor_lamp', 'table_lamp', 'curtain', 'beer_tap']) {
    assert.ok(!PROPS[t].high, t);
  }
});

test('high: a round fired under the ceiling lamps, the mirror ball, the fan leaves them whole, shakes them, and goes on into the fuse box', () => {
  const w = world();
  const lamps = FITTINGS.map((t, i) => put(w, t, 110 + i * 60));
  const box = put(w, 'fuse_box', 520);
  assert.equal(traceBullet(w, 40, Y, 600, Y, 'player', new Set()).target, box, 'the trace sees only the box');
  fire(w);
  for (const p of lamps) assert.ok(intact(p), p.type);
  for (const p of lamps) assert.ok(Math.hypot(p.kick.vx, p.kick.vy) > 0, `${p.type} shaken`);
  assert.deepEqual(struck(w), ['fuse_box'], 'no impact on any fitting');
  assert.ok(box.hp < box.def.hp || box.dead || box.dying, 'the fuse box takes the round');
});

test('high: the shop alarm box still takes a round', () => {
  const w = world();
  put(w, 'ceiling_lamp', 200);
  const box = put(w, 'alarm_box', 300);
  fire(w);
  assert.ok(box.hp < box.def.hp || box.dead || box.dying);
  assert.deepEqual(struck(w), ['alarm_box']);
});

test('high: a lamp or a neon on a wall takes a round like anything else', () => {
  for (const t of ['wall_lamp', 'neon_sign_bar', 'tube_light']) {
    const w = world(), p = put(w, t, 200);
    fire(w);
    assert.ok(!intact(p), t);
    assert.deepEqual(struck(w), [t]);
  }
});

test('high: a bat swung at a hung lamp does nothing to it; a chair in its place takes the blow', () => {
  const w = world();
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, body: { position: { x: 200, y: Y } } });
  w.characters = () => [];
  w.camera = { kick() {} };
  w.slowmo = () => {};
  w.lineOfSight = () => true;
  w.map.isWallChar = () => false;
  p.setWeapon('bat');
  const lamp = put(w, 'ceiling_lamp', 214);
  p.meleeStrike(p.def);
  assert.ok(intact(lamp) && lamp.kick.vx === 0 && lamp.kick.vr === 0, 'not even swung');
  assert.deepEqual(w.hits, []);
  // the same blow with the lamp's own hit, on any kind but a blast's
  for (const kind of ['blunt', 'cut', 'punch', 'bullet', 'pellet', 'graze']) lamp.hit(2, lamp.x, lamp.y, 0, 2.5, kind);
  assert.ok(intact(lamp));
  const chair = put(w, 'chair', 214, Y + 1);
  p.meleeStrike(p.def);
  assert.deepEqual(struck(w), ['chair']);
});

test('high: a blast next to the ceiling lamps and the mirror ball breaks them', () => {
  const w = world();
  const lamps = [put(w, 'ceiling_lamp', 300, Y - 10), put(w, 'mirror_ball', 330, Y + 10), put(w, 'pool_lamp', 270, Y + 12)];
  explode(w, 300, Y, { radius: 90 });
  for (const p of lamps) assert.ok(p.dead || p.dying, p.type);
});
