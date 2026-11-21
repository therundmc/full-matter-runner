import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Lens } = await load('game/render/Lens.js');
const { POST } = await load('game/data/post.js');
const { default: EventBus } = await load('engine/EventBus.js');

// a 1920 x 1080 picture looking at the world from (0, 0), two picture px per world px
const view = (more = {}) => ({
  W: 1920, H: 1080, scale: 2, toScreen: (x, y) => ({ x: 960 + x * 2, y: 540 + y * 2 }),
  state: 'play', phase: 'normal', powerOn: true, trauma: 0,
  player: { x: 0, y: 0 }, heat: [], lights: [], ...more,
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
  assert.ok(Math.abs(u.grade.sat - POST.grades.calm.sat) < 0.01 && u.blur < 0.01);
  // the user's rule: at rest the lens is hardly there
  assert.ok(POST.fringe.rest <= 1 && POST.tube.curve <= 0.008 && POST.glow.strength <= 0.2 && POST.rays.strength <= 0.2);
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

test('lens: the tape tears at death and at a start, the results soften the whole picture, nothing else does', () => {
  const lens = new Lens();
  run(lens, 1);
  lens.update(1 / 60, view({ state: 'dead' }));
  assert.ok(lens.glitch > 0.9);
  run(lens, POST.tube.glitch.life + 0.1, view({ state: 'dead' }));
  assert.equal(lens.glitch, 0);
  lens.update(1 / 60, view({ state: 'play' }));
  assert.ok(lens.glitch > 0.5, 'back on his feet');
  run(lens, 2, view({ state: 'results' }));
  assert.ok(lens.blur > POST.focus.results - 0.05);
  // the pause is no blur: the picture sharp and drained at once, the world's look back at once on the way out
  lens.update(1 / 60, view({ state: 'play' }));
  lens.update(1 / 60, view({ state: 'pause' }));
  assert.equal(lens.grade.sat, POST.grades.paused.sat, 'a cut, not a fade');
  run(lens, 2, view({ state: 'pause' }));
  assert.ok(lens.blur < 0.02);
  lens.update(1 / 60, view({ state: 'play' }));
  assert.equal(lens.grade.sat, POST.grades.calm.sat);
  run(lens, 2, view({ state: 'title', player: null }));
  assert.ok(lens.blur < 0.02, 'the title is sharp');
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

test('lens: the title has the menu grade', () => {
  const lens = new Lens();
  run(lens, 4, view({ state: 'title', player: null }));
  assert.ok(Math.abs(lens.grade.tintK - POST.grades.menu.tintK) < 0.005 && Math.abs(lens.grade.lift[2] - POST.grades.menu.lift[2]) < 0.005);
});

test('lens: a comic page over the world (the leap after the blast) shows clean, whatever the world left behind', () => {
  // the regression: out of the tutorial's window as the fire-balls go off, the leap was drawn under the shake's
  // fringe, the blasts' heat and rings and the fires' shimmer, held there as the world stood still behind the page
  const lens = new Lens(), bus = new EventBus(), player = { isPlayer: true };
  lens.bind(bus);
  const hot = { trauma: 0.9, heat: [{ x: 20, y: 0, kind: 'fire' }], lights: [{ x: 50, y: 50, k: 1 }] };
  run(lens, 4, view({ ...hot, phase: 'alert', combo: POST.rampage.full }));
  bus.emit('explosion', { x: 10, y: 0 });
  bus.emit('kill', { victim: { x: 0, y: 0 }, killer: player, cause: 'explosion' });
  lens.update(1 / 60, view(hot));
  const fall = view({ ...hot, state: 'fall', page: true, player: null });
  lens.update(1 / 60, fall);
  const u = lens.uniforms(fall);
  assert.ok(Math.abs(u.fringe - POST.fringe.rest) < 1e-6, 'no fringe from the shake, the kicks or a chain of kills');
  assert.ok([...u.heat, ...u.waves, ...u.lights].every((n) => n === 0), 'no shimmer, no ring, no rays');
  assert.equal(u.zoom, 0);
  assert.equal(u.frame, 0);
  assert.deepEqual(u.focus, [0.5, 0.5]);
  assert.ok(Math.abs(u.grade.sat - POST.grades.menu.sat) < 1e-6 && u.grade.tintK === POST.grades.menu.tintK, 'the grade of a page, at once');
});

test('lens: at the wheel the picture is drawn 1:1 and the lens leaves the road as drawn: no barrel, no scan lines, no zoom kick; the speed stays on the edges', () => {
  const lens = new Lens(), bus = new EventBus(), player = { isPlayer: true };
  lens.bind(bus);
  const drive = { k: 0.8, angle: 0, x: 40, y: 20 }, wheel = view({ drive });
  run(lens, 2, wheel);
  let u = lens.uniforms(wheel);
  assert.equal(u.curve, 0, 'no barrel: every px of the scene sampled at its own centre');
  assert.equal(u.scan, 0, 'no scan lines: a car changing lanes under them flickers');
  assert.equal(u.rush.flat, 1, 'the lens told to keep its own fringe to the band');
  assert.ok(u.rush.k > 0.3 && u.rush.band[0] >= 0.2, 'the speed is shown, on the edges only');
  assert.ok(u.rush.car[0] > 0.2 && u.rush.car[1] > u.rush.car[0], 'and never round his car');
  assert.deepEqual(u.rush.at.map((n) => +n.toFixed(4)), [(960 + 80) / 1920, 1 - (540 + 40) / 1080].map((n) => +n.toFixed(4)), 'his car, in the picture');
  // a shove, a kill: the edges kick, nothing zooms (a zoom resamples the whole picture)
  bus.emit('ride', { beat: 'shove', x: 40, y: 20 });
  bus.emit('kill', { victim: { x: 0, y: 0 }, killer: player, cause: 'bullet' });
  u = lens.uniforms(wheel);
  assert.equal(u.zoom, 0);
  assert.ok(u.rush.k > 1, 'the kick is there, in the band: its streaks and its darkening, harder');
  // NOTHING at the wheel moves a px of the picture (the user: "the cars are deformed at the edges of the screen"),
  // even kicked: no fringe, no zoom, no barrel, no wave; what is left is added over it or dims it
  assert.equal(u.fringe, 0, 'no fringe at the wheel');
  assert.ok(u.zoom === 0 && u.curve === 0 && u.scan === 0 && u.waveWidth === 0);
  assert.ok(u.rush.dark > 0 && u.rush.lines.glow > 0 && u.rush.lines.share > 0, 'the streaks of air and the band dimmed: added, not resampled');
  assert.equal(POST.speed.drive.kick.zoom, undefined);
  // on foot: as it was
  const foot = new Lens();
  foot.bind(bus);
  run(foot, 2);
  bus.emit('kill', { victim: { x: 0, y: 0 }, killer: player, cause: 'bullet' });
  u = foot.uniforms(view());
  assert.ok(u.curve === POST.tube.curve && u.scan === POST.tube.scan && u.rush.flat === 0 && u.rush.k === 0 && u.zoom > 0);
});

test('lens: without WebGL the 2D stand-in shifts the red channel on a hard shake, never at the wheel', async () => {
  const { default: PostFX } = await load('game/render/PostFX.js');
  // a 2D context that records what is drawn onto it (a canvas of its own for the shifted copy, the grain's)
  const ctx2d = () => new Proxy({ draws: [] }, {
    get: (o, k) => (k in o ? o[k] : k === 'drawImage' ? (...a) => o.draws.push(a) : k === 'getContext' ? () => ctx2d() : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => ({})),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  globalThis.document = { createElement: () => ctx2d() };
  try {
    const shifted = (wheel) => {
      const ctx = ctx2d();
      ctx.canvas = { width: 1280, height: 720 };
      new PostFX().apply(ctx, 1280, 720, 1.2, wheel);
      return ctx.draws.some((a) => a[1] > 0); // (the shifted copy is drawn ca px to the right)
    };
    assert.equal(shifted(false), true, 'on foot: the red channel parts');
    assert.equal(shifted(true), false, 'at the wheel: nothing moves a px of the picture');
  } finally {
    delete globalThis.document;
  }
});

// A WebGL context that compiles nothing: it reads the uniforms each shader declares and records what is set
function fakeGL() {
  const progs = [], sets = [];
  const decl = (src) => [...src.matchAll(/uniform\s+\w+\s+([^;]+);/g)].flatMap((m) => m[1].split(',').map((n) => n.trim().replace(/\[\d+\]$/, '')));
  const own = {
    createShader: () => ({}), shaderSource: (sh, src) => { sh.src = src; }, getShaderParameter: () => true,
    createProgram: () => { const p = { shaders: [], names: [] }; progs.push(p); return p; },
    attachShader: (p, sh) => p.shaders.push(sh),
    getProgramParameter: (p, k) => (k === 'ACTIVE_UNIFORMS' ? (p.names = p.shaders.flatMap((sh) => decl(sh.src))).length : true),
    getActiveUniform: (p, i) => ({ name: p.names[i] }),
    getUniformLocation: (p, name) => ({ p, name }),
    getExtension: () => null,
  };
  const gl = new Proxy(own, {
    get: (o, k) => {
      if (k in o) return o[k];
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (/^uniform/.test(k)) return (loc, ...v) => sets.push({ loc, v: v.flatMap((x) => (typeof x === 'object' ? [...x] : [x])) });
      return () => ({});
    },
  });
  return { gl, progs, sets };
}

test("lens: every uniform PostGL's shaders declare is set by render, with a number, and nothing set is undeclared", async () => {
  // the class of bug: a uniform left out of render() stays 0 on the card (a look silently gone), a misspelt one is
  // swallowed by WebGL (uniform1f on a null location does nothing)
  const { createPost } = await load('game/render/PostGL.js');
  const { gl, progs, sets } = fakeGL(), el = () => ({ width: 0, height: 0, style: {}, addEventListener() {}, getContext: (k) => (k === 'webgl' ? gl : {}) });
  globalThis.document = { createElement: el };
  try {
    const post = createPost({ width: 1280, height: 720, after() {} });
    assert.ok(post, 'the lens is made on the fake card');
    assert.equal(progs.length, 4);
    const check = (u, what) => {
      sets.length = 0;
      post.render(u, 1.5);
      for (const s of sets) {
        assert.ok(s.loc, `${what}: a uniform set that no shader declares`);
        assert.ok(s.v.every((n) => Number.isFinite(n)), `${what}: ${s.loc.name} set to ${s.v}`);
      }
      for (const p of progs) for (const name of p.names) assert.ok(sets.some((s) => s.loc?.p === p && s.loc.name === name), `${what}: ${name} never set`);
    };
    // every pass on: the glow, the shafts, the soft picture (the results)
    const lens = new Lens(), all = (u) => ({ ...u, glow: { ...POST.glow, strength: 0.1 }, rays: { ...POST.rays, strength: 0.1 }, blur: 0.5 });
    run(lens, 1);
    check(all(lens.uniforms(view({ lights: [{ x: 10, y: 10, k: 1 }] }))), 'on foot');
    const wheel = view({ drive: { k: 0.9, angle: 0.3, x: 40, y: 20 } });
    run(lens, 1, wheel);
    check(all(lens.uniforms(wheel)), 'at the wheel');
  } finally {
    delete globalThis.document;
  }
});

test('lens: at the wheel no hot air bends the picture (it moves no px there), on foot it does', () => {
  const lens = new Lens(), hot = [{ x: 10, y: 10, kind: 'fire' }];
  const foot = lens.uniforms(view({ heat: hot }));
  assert.ok([...foot.heat].some((n) => n !== 0), 'a fire shimmers on foot');
  const wheel = lens.uniforms(view({ heat: hot, drive: { k: 0.5, angle: 0, x: 0, y: 0 } }));
  assert.ok([...wheel.heat].every((n) => n === 0), 'none at the wheel');
});
