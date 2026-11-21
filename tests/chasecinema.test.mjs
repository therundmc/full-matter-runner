// Level 2A's cinema (docs/LEVEL2.md): the close-up at the start held sharp (an even whole zoom, the view locked on
// the car as drawn), the opening on his cigarette (systems/LastDrag.js), the chase's own slow motions and cuts
// (systems/ChaseCam.js: a pursuer stopped, the lorry across the road).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { ctx, quiet } from './helpers.mjs';

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Direction, whole } = await load('game/systems/Direction.js');
const { SHOTS } = await load('game/data/staging.js');
const { default: Camera, fitView } = await load('engine/Camera.js');
const { default: Drive } = await load('game/systems/Drive.js');
const { seatOf } = await load('game/systems/drive/rules.js');
const { default: LastDrag, dragPhases, buttStep } = await load('game/systems/LastDrag.js');
const { default: ChaseCam, killBeat, lorryCourse, lorryBox, beatScale } = await load('game/systems/ChaseCam.js');
const { CHASE } = await load('game/data/chase.js');
const { SEAT } = await load('game/data/feel.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial } = await load('engine/physics/Body.js');
// (the QA robot's stall detector knows the car stands on purpose)
const BOT = (await import('node:fs')).readFileSync(new URL('../tools/qa/bot.js', import.meta.url), 'utf8');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: level2a } = await load('game/data/levels/level2a.js');

const { Bodies, Body } = Matter;
const DT = 1 / 60;
const keys = () => ({ down: () => false, hit: () => false, mouseHit: () => false, mouseDown: () => false });

// ---------------------------------------------------------------- the close-up stays sharp
test('view: the close-up at the wheel rests on a whole and EVEN zoom at 720, 1080 and 1440 (a texel of a sprite painted twice as fine is whole px)', () => {
  for (const [h, want] of [[720, 6], [1080, 8], [1440, 10], [900, 8], [2160, 16]]) {
    const base = fitView(CHASE.camera.view, h, false, true).zoom;
    for (const name of ['grab', 'drag']) {
      const D = new Direction(), cam = new Camera();
      cam.resize(Math.round((h * 16) / 9), h, base);
      cam.pixel = true;
      D.set(name, { x: 0, y: 0 }, true, base);
      cam.scale = D.zoom;
      assert.equal(cam.z, want, `${name} at ${h}`);
      assert.ok(Number.isInteger(cam.z) && cam.z % 2 === 0 && Number.isInteger(cam.z / 2), 'whole, even: 2 texels a world px, each whole');
      // and from its very first frame, with no easing through in-between zooms
      for (let i = 0; i < 30; i++) { D.set(name, { x: 0, y: 0 }); D.update(DT, base, true); cam.scale = D.zoom; assert.equal(cam.z, want); }
    }
    // the cut back out, and the chase's own cut in: whole (any whole one: the drive's own view is the base)
    for (const name of ['grabOut', 'chaseKill', 'lorryGap']) {
      const D = new Direction();
      D.set(name, { x: 0, y: 0 }, true, base);
      assert.ok(Number.isInteger(Math.round(D.zoom * base * 1e6) / 1e6), `${name} at ${h}: ${D.zoom * base}`);
    }
    assert.equal(new Direction().rest(base), 1, 'no shot: the drive\'s own zoom');
  }
  assert.equal(whole(2.5, 2), 2.5, 'as it was: 5 px a world px at 720, 2.5 a texel');
  assert.equal(whole(2.5, 2, 2), 3, 'even: 6');
  assert.ok(SHOTS.grab.even && SHOTS.drag.even && !SHOTS.grabOut.even);
});

// ---------------------------------------------------------------- a small world for his car
function vehicle(w, model, x, y) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model], W = 172, H = 64;
  const body = Bodies.rectangle(x, y, W - 4, H - 4, { frictionAir: 0.02, friction: 0.6, label: 'vehicle', collisionFilter: { category: CAT.PROP, mask: MASK.PROP } });
  setMaterial(body, m.kg, 0.9);
  body.material = 'metal';
  body.entity = v;
  Object.assign(v, {
    world: w, type: model, m, k: 1, w: W, h: H, body, isVehicle: true, g: ctx, glassPx: { wind: [], rear: [] },
    windows: { wind: 0, rear: 0 }, tires: [true, true, true, true], lamps: [true, true, true, true], hp: m.hp, fuel: 0,
    puddle: 0, alarm: 0, lit: true, flash: 0, moving: false, dead: false, exploded: false, burning: false, rider: null,
    hat: !!m.hat, gun: !!m.gun, drawn: null, def: { static: true, hp: m.hp },
  });
  w.physics.add(body);
  w.props.push(v);
  return v;
}

function world() {
  const events = new EventBus(), physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const sounds = [], lights = [];
  const player = {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, weapon: null, ammo: { '9mm': 0 }, riding: null,
    get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; },
  };
  const w = {
    physics, events, player, chars: [player], props: [], corpses: [], projectiles: [], time: 0, particles: quiet, sounds, lights,
    exited: false, drive: null, game: { onExit() {} }, endT: null, clockFrom: 0,
    get runTime() { return Math.max(0, (w.endT ?? w.time) - (w.clockFrom || 0)); }, // (World.runTime)
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), shake() {}, noise() {}, addDebris() {}, addProjectile() {},
    sound(name) { sounds.push(name); }, light(x, y, r, color) { lights.push({ x, y, r, color }); },
  };
  return w;
}

// level 2A's start: his car where the level puts it, the Uzi on its seat; `intro`: opening on his cigarette
function start(intro = level2a.chase.intro) {
  const w = world(), at = level2a.chase.van, v = vehicle(w, CHASE.vehicle, at[0] * TILE, at[1] * TILE);
  w.drive = new Drive(w, { ...level2a.chase, events: [], water: [], across: [], lanes: null, mid: null, legs: null, bends: null, end: null, intro }, v);
  return { w, v, d: w.drive, input: keys() };
}
function run(s, sec) {
  for (let t = 0; t < sec - 1e-9; t += DT) {
    s.w.time += DT;
    s.d.step(DT, s.input, null);
    s.w.physics.step(DT, s.w.time);
    s.d.after(DT);
  }
}

test('grab: its shot looks at his seat in the car as it is drawn, and the view is locked a whole number of picture px from the car', () => {
  const s = start(null), { v, d } = s;
  run(s, 0.2);
  assert.equal(d.shot().name, 'grab');
  // (his own body is out of the world's bodies while he rides: it is not drawn between two steps. The car is)
  const real = { ...v.body.position }, seat = seatOf(v);
  Body.setPosition(v.body, { x: real.x - 5.3, y: real.y }); // the car drawn 5.3 px back, between its last two steps
  const at = d.shot().at;
  assert.ok(Math.abs(at.x - v.toWorld(...seat).x) < 1e-9 && Math.abs(at.x - (s.w.player.x - 5.3)) < 0.01, 'the seat of the car as drawn, not his body a step ahead');
  Body.setPosition(v.body, real);
  for (const z of [3, 6, 8, 10]) {
    for (const dx of [0, 0.31, 2.77, 5.3, 8.9]) {
      Body.setPosition(v.body, { x: real.x - dx, y: real.y });
      const snap = (n) => Math.round(n * z) / z, shot = d.shot().at, view = d.lock({ x: v.x + 0.85 * (shot.x - v.x) + 61.37, y: 416.4 }, z);
      const off = (snap(v.x) - view.x) * z; // the car's place in the picture (Vehicle.pose draws it at snap(x)), px
      assert.ok(Math.abs(off - Math.round(off)) < 1e-6, `z ${z}, ${dx} px into the step: ${off}`);
      assert.ok(Math.abs(off - Math.round((-0.85 * (shot.x - v.x) - 61.37) * z)) <= 1, 'the same place whatever the share of the step');
      assert.ok(Math.abs(view.y * z - Math.round(view.y * z)) < 1e-6, 'across: on the grid');
    }
  }
  Body.setPosition(v.body, real);
});

// ---------------------------------------------------------------- the cigarette
test('intro: level 2A opens on his cigarette; its phases in order (pure)', () => {
  const I = CHASE.intro;
  assert.equal(level2a.chase.intro, 'drag');
  assert.ok(I.go >= 4 && I.go <= 6, 'four to six seconds');
  assert.ok(I.lift[0] < I.lift[1] && I.lift[1] <= I.drag[0] && I.drag[1] <= I.lower[0] && I.lower[0] <= I.breath[0] && I.breath[1] < I.flick && I.flick < I.go);
  const at = (t) => dragPhases(t, I);
  assert.deepEqual([at(0).mouth, at(0).flare, at(0).held, at(0).done], [0, 0, true, false], 'the hand over the door, the cigarette in it');
  const mid = (I.drag[0] + I.drag[1]) / 2;
  assert.ok(at(mid).mouth === 1 && at(mid).flare > 0.99, 'the drag: at his mouth, the ember at its brightest');
  assert.ok(at(I.breath[0] + 0.1).breath && !at(I.breath[1]).breath && at(I.breath[0] + 0.1).mouth < 1, 'the smoke let out, the hand back down');
  assert.ok(at(I.flick - 0.01).held && at(I.flick - 0.01).flick > 0.9 && !at(I.flick).held, 'the arm snapped out, then it leaves his fingers');
  assert.ok(!at(I.go - 0.01).done && at(I.go).done);
});

test('intro: the butt flies out, bounces twice and lies there, losing speed each time (pure)', () => {
  const B = CHASE.intro.butt, b = { x: 0, y: 0, z: B.z, vx: 0, vy: -B.out, vz: B.up, a: 0, spin: B.spin, n: 0, rest: false };
  const hits = [];
  let top = 0, t = 0;
  for (; t < 3 && !b.rest; t += DT) { const h = buttStep(b, DT, B); if (h) hits.push([h, +t.toFixed(2), Math.round(-b.y)]); top = Math.max(top, b.z); }
  assert.deepEqual(hits.map((h) => h[0]), ['bounce', 'bounce', 'rest']);
  assert.ok(top > B.z && t < 1.5, 'up, then down, in under a second and a half');
  assert.ok(hits[0][2] > 25 && hits[2][2] < 90 && hits[2][2] > hits[0][2], `well clear of the car, not across the street (${hits[2][2]} px)`);
  assert.ok(b.z === 0 && b.vx === 0 && b.vy === 0 && buttStep(b, DT, B) === null, 'still');
});

test('intro: the first time the car stands, lamps off, while he smokes; then the engine and the grab; nothing is his before', () => {
  const s = start(), { w, v, d } = s, p = w.player, I = CHASE.intro, x0 = v.x;
  assert.ok(d.drag instanceof LastDrag && d.drag.on && d.grabbing && d.v === 0 && v.lightsOut, 'standing in the dark');
  assert.equal(d.shot().name, 'drag');
  assert.equal(d.motor(DT), null, 'the engine off');
  assert.ok(d.hud === 0 && w.runTime === 0, 'no HUD, the run\'s clock not started');
  const hood = d.shot().at.x;
  run(s, (I.drag[0] + I.drag[1]) / 2);
  assert.ok(Math.abs(v.x - x0) < 0.01 && d.v === 0 && d.grab.t === 0 && v.gun, 'not moved, the gun still on the seat');
  assert.ok(d.hud === 0 && w.runTime === 0 && w.time > 1, 'still no HUD, the clock still at zero');
  assert.ok(p.riding.drag.mouth === 1 && w.sounds.includes('cigDrag'), 'the drag');
  assert.ok(d.shot().at.x < hood - 20, 'the view come from the hood onto him');
  const lit = w.lights.length;
  assert.ok(lit > 10 && Math.max(...w.lights.map((l) => l.r)) > I.ember.rest[0] * 1.5, 'the ember\'s light, swelling with the drag');
  run(s, I.flick + 0.05 - d.drag.t);
  assert.ok(d.drag.smoke.length > 8 && Math.min(...d.drag.smoke.map((q) => q.y)) < v.y - v.h / 2 - 8, 'his smoke, a plume drifting out over the door');
  assert.ok(d.drag.butt && !d.drag.butt.rest && !p.riding.drag.held && w.sounds.includes('cigFlick'), 'flicked');
  assert.equal(d.shot().name, 'butt', 'the cut in closer on it');
  assert.ok(d.drag.butt.y < v.y - v.h / 2, 'out over his door (-y)');
  run(s, 0.25);
  const seat = v.toWorld(...seatOf(v)), look = d.shot().at;
  assert.ok(look.y < seat.y - 12, 'the camera goes after it');
  w.physics.freezeIfHeavy(v.body); // (as the physics does with a heavy body at rest: Vehicle.update)
  assert.ok(v.body.frozen, 'two tons standing: frozen');
  run(s, I.go - 0.02 - d.drag.t);
  assert.ok(d.drag.on && d.drag.butt.rest && w.sounds.filter((n) => n === 'buttHit').length === 3 && Math.abs(v.x - x0) < 0.01, 'on the road, twice bounced; the car still there');
  run(s, 0.1);
  assert.ok(!d.drag.on && !v.lightsOut && w.sounds.includes('engineRoar') && p.riding.drag === null, 'the engine, the lamps');
  assert.equal(d.shot().name, 'grab', 'the cut back to him: the gun');
  const t0 = w.time;
  assert.ok(w.runTime < 0.1 && d.hud > 0 && d.hud < 0.3, 'the clock starts at the launch, the HUD begins to come in');
  assert.ok(d.grabbing && d.grab.t > 0 && d.grab.t < 0.12 && d.launchT > 0, 'the grab under way as it pulls away, its tyres spinning');
  assert.ok(!v.body.frozen && !v.body.isStatic, 'its body woken: it takes its speed');
  run(s, SEAT.grab.take + 0.1);
  assert.ok(d.v > 3 && d.v < CHASE.cruise && v.x > x0 + 20 && p.weapon?.type === 'uzi' && !v.gun, 'pulling away by itself, the gun in his hand');
  run(s, 2);
  assert.ok(Math.abs(d.v - CHASE.cruise) < 1e-6 && !d.grabbing && d.shot() === null, 'at cruise, his');
  assert.ok(d.hud === 1 && Math.abs(w.runTime - (w.time - t0)) < 0.1 && w.runTime < w.time - 4, 'the HUD in, the clock counting from the launch');
  run(s, CHASE.intro.butt.glow);
  assert.equal(d.drag, null, 'the ember out: nothing of it left');
});

test('intro: the QA robot does not call the opening a stall', () => {
  assert.match(BOT, /const live = !d\.dead && !d\.standing/);
});

test('intro: a retry skips it (rolling, the gun in hand, as before); SPACE held skips to the engine and the grab', () => {
  const a = start(), p = a.w.player;
  a.d.skipGrab(); // (Game.startLevel on a retry)
  assert.ok(!a.d.drag && !a.d.grab && !a.d.grabbing && a.d.v === CHASE.cruise && !a.v.lightsOut && p.weapon.type === 'uzi' && a.d.shot() === null);
  assert.ok(Math.abs(Body.getVelocity(a.v.body).x - CHASE.cruise) < 1e-6);
  a.w.time = 2;
  assert.ok(a.d.hud === 1 && a.w.runTime === 2, 'the HUD and the clock at once');
  const b = start();
  run(b, 1);
  b.d.drag.skip(); // (Game: the hold is full)
  assert.ok(!b.d.drag.on && b.d.drag.gone, 'over, no butt thrown');
  run(b, 2 * DT);
  assert.ok(b.d.drag === null && !b.v.lightsOut && b.d.grab && b.d.grabbing && b.d.shot().name === 'grab', 'the engine, then the grab as ever');
  assert.ok(b.d.hud > 0 && b.w.runTime <= 2 * DT + 1e-9 && b.w.time > 1, 'skipped: the clock starts at once, the HUD comes in');
  b.d.skipGrab();
  assert.ok(b.w.player.weapon.type === 'uzi');
  // a level without it (the lab's cars, an old chase): none
  const c = start(null);
  assert.ok(!c.d.drag && c.d.v === CHASE.cruise && c.d.shot().name === 'grab');
});

// ---------------------------------------------------------------- the chase's beats
// what ChaseCam asks of the world: his car at the wheel, a lorry, the events
function scene({ lorry = true } = {}) {
  const events = new EventBus(), van = { x: 0, y: 464, w: 172, h: 64 }, log = [];
  const L = { p: { def: { w: 276, h: 76 } }, x0: 3000, y0: 214, dx: 0, dy: 1, dist: 160, state: 'wait', gap: { x: 3000, y: 586 } };
  const w = {
    events, player: { alive: true }, exited: false, particles: quiet, camera: { push() {} }, stops: [],
    drive: { on: true, dead: false, grabbing: false, car: van, v: CHASE.cruise },
    lorries: lorry ? { list: [L] } : null,
    shake() {}, sound() {}, hitstop(s) { w.stops.push(s); },
  };
  const cc = new ChaseCam(w);
  events.on('chaseBeat', (e) => log.push(e.kind + ':' + e.tier));
  // real time and game time together, as Game does (the world stepped at the beat's own scale)
  const run = (sec, each = null) => {
    for (let t = 0; t < sec - 1e-9; t += DT) {
      cc.update(DT);
      van.x += w.drive.v * 60 * DT * cc.scale;
      each?.();
      cc.step();
    }
  };
  return { w, cc, van, L, log, run, wreck: (x = van.x + 100, y = 380) => events.emit('pursuerWreck', { car: { x, y } }) };
}

test('lorry: the slow motion starts only on a collision course and close, once a lorry, and ends as he clears it', () => {
  const C = CHASE.cinema.lorry;
  const box = lorryBox({ p: { def: { w: 276, h: 76 } }, x0: 3000, y0: 214, dx: 0, dy: 1, dist: 160 });
  assert.deepEqual(box, { x0: 2962, x1: 3038, y0: 236, y1: 512 }, 'where it stands once out: across both lanes');
  const car = (x, y, v = CHASE.cruise) => ({ x, y, w: 172, h: 64, v });
  assert.ok(Math.abs(lorryCourse(car(2962 - 86 - 534, 464), box) - 1) < 1e-9, 'a second from its flank at 60 km/h');
  assert.equal(lorryCourse(car(2962 - 40, 464), box), 0, 'alongside');
  assert.equal(lorryCourse(car(2000, 512 + C.pad + 32), box), null, 'clear of its tail across: no course');
  assert.equal(lorryCourse(car(3038 + 87, 464), box), null, 'past it');
  // the run: far away, nothing; told and backing but he is still far: nothing; close and in its way: the beat
  const s = scene(), { cc, van, L } = s;
  s.run(1);
  assert.ok(!cc.beat && cc.scale === 1, 'it waits in its yard: nothing');
  L.state = 'tell';
  van.x = 2962 - 86 - CHASE.cruise * 60 * (C.lead + 0.5);
  s.run(0.3);
  assert.ok(!cc.beat, 'told, but more than its lead away');
  s.run(0.3);
  assert.ok(cc.beat?.kind === 'lorry' && L.slowed, 'on course, close: the world slows');
  assert.deepEqual(cc.shot(), { name: 'lorryGap', at: L.gap }, 'the view toward the way round');
  s.run(C.in + 0.05);
  assert.equal(cc.scale, C.slow);
  assert.ok(cc.wheel.most === C.wheel && Math.abs(cc.wheel.rate - 1 / C.slow) < 1e-9, 'the wheel answers in real time, and takes the car further');
  // he steers round its tail: clear across, time comes back, the wheel as usual
  let real = 0;
  s.run(3, () => { real += DT; if (van.y < 512 + C.pad + 40) van.y += 5.8 * C.slow; });
  assert.ok(!cc.beat && cc.scale === 1 && cc.wheel === null && cc.shot() === null, 'over');
  assert.ok(van.x > 3038, 'past it');
  assert.deepEqual(s.log.filter((k) => k.startsWith('lorry')), ['lorry:strong'], 'once');
  // back in its way (it cannot be, but): never a second time for that lorry
  van.x = 2962 - 86 - 100; van.y = 464;
  s.run(0.2);
  assert.ok(!cc.beat, 'once a lorry');
  // the lab's goes back in and may be met again
  L.state = 'wait';
  s.run(0.1);
  assert.ok(!L.slowed);
});

test('lorry: no slow motion for a car that is not in its way, in the opening, or dead; into it, the beat lets go at once', () => {
  const C = CHASE.cinema.lorry, at = 2962 - 86 - CHASE.cruise * 60 * C.lead * 0.5;
  const a = scene();
  a.L.state = 'back'; a.van.x = at; a.van.y = 512 + C.pad + 33;
  a.run(0.5);
  assert.ok(!a.cc.beat && !a.L.slowed, 'on the terrace already: clear of it');
  const b = scene();
  b.L.state = 'back'; b.van.x = at; b.w.drive.grabbing = true;
  b.run(0.1);
  assert.ok(!b.cc.beat, 'not while he takes the gun');
  b.w.drive.grabbing = false;
  b.run(0.1);
  assert.ok(b.cc.beat && b.cc.scale < 1);
  b.w.drive.dead = true; // nose-on into it
  b.run(DT);
  assert.ok(!b.cc.beat && b.cc.scale === 1, 'his death has its own slow motion');
  // held `cap` s at most, whatever he does
  const c = scene();
  c.L.state = 'out'; c.van.x = at; c.w.drive.v = 0.001;
  c.run(C.in + C.cap + C.out + 0.2);
  assert.ok(!c.cc.beat && c.cc.scale === 1);
});

test('car kill: a beat on a pursuer stopped; strong the first time, lighter inside its cooldown, never at full strength twice in a row', () => {
  const K = CHASE.cinema.kill, none = { strong: -Infinity, beat: -Infinity, kill: -Infinity, tier: null, on: false };
  // (pure)
  assert.equal(killBeat(0, none), 'strong', 'the first');
  assert.equal(killBeat(3, { strong: 0, beat: 0, kill: 0, tier: 'strong', on: false }), 'light', 'inside the cooldown');
  assert.equal(killBeat(K.again + 1, { strong: 0, beat: 0, kill: 0, tier: 'strong', on: false }), 'light', 'past it, but the last one was strong');
  assert.equal(killBeat(K.again + 1, { strong: 0, beat: 4, kill: 4, tier: 'light', on: false }), 'strong', 'a light one since, the cooldown over');
  assert.equal(killBeat(5, { strong: 0, beat: 4, kill: 4, tier: 'light', on: false }), 'strong', 'a double after a light one');
  assert.equal(killBeat(0.5, { strong: 0, beat: 0, kill: 0, tier: 'strong', on: true }), 'more', 'a double inside a strong beat: that beat, longer');
  assert.equal(killBeat(1.2, { strong: 0, beat: 0, kill: 0, tier: 'strong', on: false }), 'light', 'a double after it is over');
  assert.equal(killBeat(4.2, { strong: 0, beat: 4, kill: 2, tier: 'light', on: false }), null, 'two light ones in a blink: one');
  assert.equal(beatScale(K.strong, 0), 1);
  assert.equal(beatScale(K.strong, K.strong.in), K.strong.slow, 'down within its `in`');
  assert.equal(beatScale(K.strong, 9, 0), K.strong.slow);
  assert.equal(beatScale(K.strong, 9, K.strong.out), 1, 'and back within its `out`: a whip');
  assert.ok(K.strong.slow < K.light.slow && K.strong.hold > 2 * K.light.hold && K.strong.shot && !K.light.shot, 'the light one: a tick, no cut');

  const s = scene({ lorry: false }), { cc, w } = s, deep = [];
  const watch = () => deep.push(cc.scale);
  s.run(1);
  s.wreck();
  assert.ok(cc.beat?.tier === 'strong' && w.stops.length === 1, 'the first wreck: the strong beat, its hit-stop');
  assert.equal(cc.shot().name, 'chaseKill', 'the cut in toward the wreck');
  s.run(K.strong.in + K.strong.hold + K.strong.out + 0.05, watch);
  assert.ok(Math.min(...deep) === K.strong.slow && !cc.beat && cc.scale === 1 && cc.shot() === null, 'slow motion, then back');
  // the next one, three seconds later: light
  s.run(3);
  deep.length = 0;
  s.wreck();
  assert.ok(cc.beat?.tier === 'light' && cc.shot() === null && w.stops.length === 1, 'light: no cut, no hit-stop');
  s.run(0.5, watch);
  assert.ok(Math.min(...deep) === K.light.slow && !cc.beat);
  // ten more, a second and a half apart... (each within the double's window of the last: none is a third strong in a row)
  const tiers = [];
  for (let i = 0; i < 10; i++) { s.run(K.double + 0.4); s.wreck(); tiers.push(cc.beat?.tier ?? null); }
  assert.ok(tiers.every((t, i) => !(t === 'strong' && tiers[i - 1] === 'strong')), `never twice in a row: ${tiers}`);
  assert.ok(tiers.filter((t) => t === 'strong').length <= 3 && tiers.filter((t) => t === 'light').length >= 7, `ten kills are not ten slow motions alike: ${tiers}`);
  assert.equal(s.log.filter((k) => k === 'kill:strong').length, 1 + tiers.filter((t) => t === 'strong').length);
});

test('car kill: two in a breath are one beat, held longer and deeper; none in the opening, on foot or once he is dead', () => {
  const K = CHASE.cinema.kill, s = scene({ lorry: false }), { cc, w } = s;
  s.run(1);
  s.wreck();
  s.run(0.3);
  const hold = cc.beat.hold;
  s.wreck(s.van.x + 60, 540);
  assert.ok(cc.beat.tier === 'strong' && cc.beat.hold === hold + K.more && cc.beat.slow === K.strong.slow - K.deep, 'the same beat, longer, deeper');
  assert.equal(cc.shot().at.y, 540, 'the camera on the second wreck');
  assert.equal(w.stops.length, 1, 'no second hit-stop');
  s.run(2);
  assert.ok(!cc.beat && cc.scale === 1);
  for (const off of [(d) => { d.grabbing = true; }, (d) => { d.on = false; }, (d) => { d.dead = true; }]) {
    const q = scene({ lorry: false });
    off(q.w.drive);
    q.wreck();
    assert.ok(!q.cc.beat && q.cc.scale === 1 && q.log.length === 0);
  }
  // a swipe landing on him: a kick, short, and not again at once
  const r = scene({ lorry: false }), R = CHASE.cinema.rammed;
  r.w.events.emit('pursuerRam', { x: 0, y: 430, side: -1 });
  assert.equal(r.cc.beat?.kind, 'rammed');
  r.run(R.in + R.hold + R.out + 0.05);
  assert.ok(!r.cc.beat);
  r.w.events.emit('pursuerRam', { x: 0, y: 430, side: -1 });
  assert.ok(!r.cc.beat, 'inside its gap');
});
