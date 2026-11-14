import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Lens } = await load('game/render/Lens.js');
const { POST } = await load('game/data/post.js');
const { default: EventBus } = await load('engine/EventBus.js');

// a 1920 x 1080 picture looking at the world from (0, 0), two picture px per world px
const view = (more = {}) => ({
  W: 1920, H: 1080, scale: 2, toScreen: (x, y) => ({ x: 960 + x * 2, y: 540 + y * 2 }),
  state: 'play', phase: 'normal', powerOn: true, timeScale: 1, trauma: 0, look: false,
  player: { x: 0, y: 0, angle: 0, move: null }, heat: [], lights: [], ...more,
});
const run = (lens, sec, v = view()) => { for (let i = 0; i < sec * 60; i++) lens.update(1 / 60, v); };

test('lens: at rest the fringe is the resting one, nothing bends, the grading is the calm one', () => {
  const lens = new Lens();
  run(lens, 4);
  const u = lens.uniforms(view());
  assert.ok(Math.abs(u.fringe - POST.fringe.rest) < 1e-6);
  assert.equal(u.zoom, 0);
  assert.equal(u.frame, 0);
  assert.equal(u.glitch, 0);
  assert.ok([...u.waves].every((n) => n === 0) && [...u.heat].every((n) => n === 0));
  assert.ok(Math.abs(u.grade.sat - POST.grades.calm.sat) < 0.01 && Math.abs(u.edge - POST.focus.edge) < 0.01 && u.blur < 0.01);
  // the user's rule: at rest the lens is hardly there
  assert.ok(POST.fringe.rest <= 1 && POST.tube.curve <= 0.008 && POST.focus.edge <= 0.15 && POST.glow.strength <= 0.2 && POST.rays.strength <= 0.2);
  assert.deepEqual(u.smear, [0, 0]);
});

test("lens: a kill of the player's kicks the fringe, the colours and the zoom toward the victim, then all of it dies", () => {
  const lens = new Lens(), bus = new EventBus(), player = { isPlayer: true };
  lens.bind(bus);
  run(lens, 4);
  const rest = lens.uniforms(view());
  bus.emit('kill', { victim: { x: 100, y: -50 }, killer: player, cause: 'melee', how: { finisher: true } });
  let u = lens.uniforms(view());
  assert.ok(u.fringe > POST.fringe.rest + POST.fringe.kill * 0.9);
  assert.ok(Math.abs(u.zoom - POST.punch.zoom) < 1e-9);
  assert.deepEqual(u.focus.map((n) => +n.toFixed(4)), [(960 + 200) / 1920, 1 - (540 - 100) / 1080].map((n) => +n.toFixed(4)));
  assert.ok(Math.abs(u.grade.sat - rest.grade.sat - POST.punch.sat) < 1e-6 && u.grade.con > rest.grade.con, 'the colours are pushed');
  assert.equal(u.frame, 1, 'a heavy kill earns its impact frame');
  run(lens, POST.punch.frame + 0.05);
  assert.equal(lens.uniforms(view()).frame, 0);
  run(lens, 2.5);
  u = lens.uniforms(view());
  assert.ok(u.fringe < POST.fringe.rest + 0.05 && u.zoom < 0.0001 && Math.abs(u.grade.sat - rest.grade.sat) < 0.001);
});

test('lens: a plain kill gets no impact frame, a kill by somebody else nothing, a blow only makes the lens shiver', () => {
  const player = { isPlayer: true }, victim = { x: 0, y: 0 };
  let lens = new Lens();
  lens.kill({ victim, killer: player, cause: 'bullet' });
  let u = lens.uniforms(view());
  assert.equal(u.frame, 0);
  assert.ok(u.zoom > 0 && u.zoom < POST.punch.zoom);
  lens = new Lens();
  lens.kill({ victim, killer: { isEnemy: true }, cause: 'bullet' });
  lens.kill({ victim: { isPlayer: true, x: 0, y: 0 }, killer: player, cause: 'explosion' });
  u = lens.uniforms(view());
  assert.ok(u.zoom === 0 && u.frame === 0 && Math.abs(u.fringe - POST.fringe.rest) < 1e-6);
  lens.blow({ x: 0, y: 0, power: 1, lethal: true, byPlayer: true });
  u = lens.uniforms(view());
  assert.ok(u.fringe > POST.fringe.rest && u.zoom === 0 && u.frame === 0);
  // heavier kills hit harder, and never two impact frames on top of each other
  const P = POST.punch.power;
  assert.ok(P.finisher >= P.heavy && P.heavy > P.blow && P.blow > P.round && P.round > 0 && P.finisher <= 1);
  lens = new Lens();
  lens.kill({ victim, killer: player, cause: 'explosion' });
  run(lens, POST.punch.frame + 0.02);
  lens.kill({ victim, killer: player, cause: 'explosion' });
  assert.equal(lens.uniforms(view()).frame, 0);
});

test('lens: a blast sends a ring out, leaves the air hot for a moment, and the fringe never passes its cap', () => {
  const lens = new Lens(), bus = new EventBus();
  lens.bind(bus);
  for (let i = 0; i < 6; i++) bus.emit('explosion', { x: 50 * i, y: 0, radius: 90 });
  let u = lens.uniforms(view());
  assert.ok(u.fringe <= POST.fringe.rest + POST.fringe.max + 1e-6);
  assert.equal(lens.waves.length, POST.wave.max, 'the oldest rings give way');
  run(lens, 0.2);
  u = lens.uniforms(view());
  const [, , radius, bend] = u.waves;
  assert.ok(Math.abs(radius - 0.2 * POST.wave.blast.speed) < 0.02 && bend > 0 && bend < POST.wave.blast.bend);
  assert.ok(u.heat[3] > 0 && Math.abs(u.heat[2] - (POST.heat.blast.r * 2) / 1080) < 1e-6, 'hot air where it blew');
  run(lens, POST.heat.blast.life + 0.2);
  u = lens.uniforms(view());
  assert.ok([...u.waves].every((n) => n === 0) && [...u.heat].every((n) => n === 0));
});

test('lens: only the player\'s big guns throw a ring off the muzzle, once per shot', () => {
  const lens = new Lens(), player = { isPlayer: true, x: 0, y: 0, angle: 0 };
  lens.shot({ shooter: player, weapon: { shake: 0.18 } });
  assert.equal(lens.waves.length, 0);
  run(lens, 0.1);
  for (let i = 0; i < 9; i++) lens.shot({ shooter: player, weapon: { shake: 0.5 } }); // nine pellets, one blast
  assert.equal(lens.waves.length, 1);
  lens.shot({ shooter: { isPlayer: false, x: 0, y: 0, angle: 0 }, weapon: { shake: 0.5 } });
  assert.equal(lens.waves.length, 1);
});

test('lens: the grading follows the situation and eases there', () => {
  const lens = new Lens();
  run(lens, 4);
  lens.update(1 / 60, view({ phase: 'alert' }));
  const sat = lens.uniforms(view()).grade.sat;
  assert.ok(sat > POST.grades.calm.sat && sat < POST.grades.calm.sat + 0.02, 'no jump');
  run(lens, 4, view({ phase: 'alert' }));
  assert.ok(Math.abs(lens.grade.sat - POST.grades.combat.sat) < 0.01);
  run(lens, 4, view({ phase: 'alert', powerOn: false }));
  assert.ok(Math.abs(lens.grade.con - POST.grades.dark.con) < 0.01, 'lights out wins over the alert');
  run(lens, 4, view({ state: 'dead' }));
  assert.ok(Math.abs(lens.grade.sat - POST.grades.dead.sat) < 0.01);
  for (const g of Object.values(POST.grades)) {
    assert.ok(g.sat > 0 && g.con > 0 && g.gain.length === 3 && g.lift.length === 3 && g.tint.length === 3 && g.tintK >= 0 && g.tintK <= 1);
  }
});

test('lens: the tape tears at death and at a start, a menu softens the whole picture, looking far softens the edges', () => {
  const lens = new Lens();
  run(lens, 1);
  lens.update(1 / 60, view({ state: 'dead' }));
  assert.ok(lens.glitch > 0.9);
  run(lens, POST.tube.glitch.life + 0.1, view({ state: 'dead' }));
  assert.equal(lens.glitch, 0);
  lens.update(1 / 60, view({ state: 'play' }));
  assert.ok(lens.glitch > 0.5, 'back on his feet');
  run(lens, 2, view({ state: 'pause' }));
  assert.ok(lens.blur > 0.95);
  run(lens, 2, view({ look: true }));
  assert.ok(lens.blur < 0.02 && Math.abs(lens.edge - POST.focus.look) < 0.01);
});

test('lens: a slide smears the picture along the move, slow motion streams it from the player', () => {
  const lens = new Lens();
  run(lens, 1, view({ player: { x: 0, y: 0, angle: Math.PI / 2, move: 'slide' } }));
  let u = lens.uniforms(view());
  assert.ok(Math.abs(u.smear[0]) < 1e-4 && Math.abs(u.smear[1] + POST.speed.slide) < 1e-3, 'downward on screen is -y for the lens');
  run(lens, 1);
  u = lens.uniforms(view());
  assert.ok(Math.hypot(...u.smear) < 1e-4);
  run(lens, 1, view({ timeScale: 0.2 }));
  assert.ok(Math.abs(lens.uniforms(view()).radial - 0.8 * POST.speed.slow) < 1e-3);
});

test('lens: hot spots and lamps are handed over in the picture frame, capped', () => {
  const lens = new Lens();
  const heat = Array.from({ length: 9 }, (_, i) => ({ x: i * 10, y: 0, kind: i % 2 ? 'steam' : 'fire' }));
  const lights = Array.from({ length: 5 }, (_, i) => ({ x: -100, y: 100, k: 2 - i * 0.3 }));
  const u = lens.uniforms(view({ heat, lights }));
  assert.equal(u.heat.length, POST.heat.max * 4);
  assert.ok(Math.abs(u.heat[2] - (POST.heat.fire.r * 2) / 1080) < 1e-6 && Math.abs(u.heat[3] - POST.heat.fire.k) < 1e-6);
  assert.equal(u.lights.length, POST.rays.max * 4);
  assert.deepEqual([...u.lights.slice(0, 3)].map((n) => +n.toFixed(4)), [(960 - 200) / 1920, 1 - (540 + 200) / 1080, 1].map((n) => +n.toFixed(4)));
});

test('lens: every kill of a chain hits harder, and a running chain heats the whole picture up', () => {
  const player = { isPlayer: true }, victim = { x: 0, y: 0 };
  const zoomAt = (combo) => { const lens = new Lens(); lens.update(1 / 60, view({ combo })); lens.kill({ victim, killer: player, cause: 'bullet' }); return lens.uniforms(view({ combo })).zoom; };
  assert.ok(zoomAt(4) > zoomAt(1) && zoomAt(1) > zoomAt(0));
  assert.ok(Math.abs(zoomAt(30) - POST.punch.zoom * Math.min(1.6, POST.punch.power.round * POST.punch.combo.max)) < 1e-9, 'capped');
  // at a high chain even a plain kill earns its impact frame
  const lens = new Lens();
  lens.update(1 / 60, view({ combo: 6 }));
  lens.kill({ victim, killer: player, cause: 'bullet' });
  assert.equal(lens.uniforms(view({ combo: 6 })).frame, 1);
  // the rampage: nothing for a first kill, full at `full`, gone when the chain breaks
  const cold = new Lens(), hot = new Lens();
  run(cold, 4, view({ combo: 1 }));
  run(hot, 4, view({ combo: POST.rampage.full }));
  const a = cold.uniforms(view()), b = hot.uniforms(view());
  assert.ok(cold.rampage < 0.01 && hot.rampage > 0.99);
  assert.ok(b.grade.sat > a.grade.sat + POST.rampage.sat * 0.9 && b.fringe > a.fringe + POST.rampage.fringe * 0.9 && b.vignette > a.vignette && b.glow.strength > a.glow.strength);
  run(hot, 4, view({ combo: 0 }));
  assert.ok(hot.rampage < 0.01);
});
