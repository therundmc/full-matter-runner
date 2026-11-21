// A scripted 20 s fight in level 1, played on the whole world (World.step at 60 Hz, a canvas that draws nothing) with
// Math.random seeded: a takedown from behind in the back lot, then the poker dealer's room walked into with a pistol,
// a guard alerted, shooting, the squad called. Every step's state of every man (place, facing, state, tactic,
// awareness, life) is hashed and compared with tests/fixtures/fight1.json, recorded before the actors were split into
// modules: any change of behaviour in the guards, the player or their animation shows as the first step that differs.
// A change of behaviour that is MEANT re-records it: RECORD=1 node --test tests/fight.test.mjs (say why in the commit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { load } from './setup.mjs';

// a canvas that draws nothing, but whose pixels can be read and written (the map's grime is baked through them)
const pixels = (w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) });
const readsPixels = (k) => k === 'getImageData' || k === 'createImageData';
const ctx = new Proxy({}, {
  get: (t, k) => t[k] ?? (readsPixels(k) ? (a, b, c, d) => (typeof a === 'object' ? pixels(a.width, a.height) : pixels(c ?? a, d ?? b))
    : k === 'measureText' ? () => ({ width: 1 }) : () => ctx),
  set: (t, k, v) => { t[k] = v; return true; },
});
// a context that writes down every call made on it and every property set (the drawing of the men, compared too)
function recorder() {
  const log = [];
  const arg = (a) => (typeof a === 'number' || typeof a === 'string' || typeof a === 'boolean' ? a : a == null ? null : typeof a);
  const rec = new Proxy({}, {
    get: (t, k) => (k === 'log' ? log : t[k] ?? (readsPixels(k) ? ctx[k] : k === 'measureText' ? () => ({ width: 1 })
      : (...a) => { log.push(`${String(k)}(${a.map(arg).join(',')})`); return rec; })),
    set: (t, k, v) => { log.push(`${String(k)}=${arg(v)}`); return true; },
  });
  return rec;
}
const canvas = () => ({ width: 1, height: 1, getContext: () => ctx, style: {} });
globalThis.document ??= { createElement: canvas, fonts: { load: async () => {} }, addEventListener() {}, body: { appendChild() {} } };
globalThis.Image ??= function Image() { return canvas(); };

const { default: World } = await load('game/world/World.js');
const { default: level } = await load('game/data/levels/level1.js');
const { seeded } = await load('engine/math.js');
const { default: Camera } = await load('engine/Camera.js');

const FIXTURE = new URL('./fixtures/fight1.json', import.meta.url);
const STEPS = 20 * 60, DT = 1 / 60;
const stub = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => {}) });

// the keys held, the clicks and the aim of step i: the script of the fight
function script(i, w) {
  const p = w.player, keys = new Set(), clicks = [false, false, false];
  let aim = { x: p.x + 50, y: p.y };
  const t = i * DT;
  if (t < 3) {
    // behind the tire iron's man in the back lot: the takedown
    const e = w.enemies[0];
    aim = { x: e.x, y: e.y };
    if (i === 20) clicks[0] = true;
  } else if (t < 14) {
    // the dealer's room: walk in along its wall, the pistol on the dealer, fire now and then, strafe
    const e = w.enemies[6];
    aim = { x: e.x, y: e.y };
    if (t < 6) keys.add('KeyW');
    else if (t < 9) keys.add(Math.floor(t * 2) % 2 ? 'KeyA' : 'KeyD');
    else keys.add('KeyS');
    if (i % 45 === 0) clicks[0] = true;
    if (i === 700) keys.add('KeyR');
  } else {
    // behind a man on his feet: taken as a shield, walked back, killed over his shoulder
    const e = p.shield?.target ?? hostage(w);
    if (e) aim = p.shield ? { x: p.x + Math.cos(p.angle) * 50, y: p.y + Math.sin(p.angle) * 50 } : { x: e.x, y: e.y };
    if (i === 841) keys.add('KeyE');
    if (t > 14.2 && t < 16) keys.add('KeyS');
    if (i === 1000) clicks[0] = true;
  }
  return { keys, clicks, aim };
}

// the man the shield is taken on: the nearest standing guard (never the boss) to the dealer's room
const hostage = (w) => w.enemies.filter((e) => e.alive && !e.knocked && !e.boss)
  .sort((a, b) => Math.hypot(a.x - 884, a.y - 420) - Math.hypot(b.x - 884, b.y - 420))[0];

function input(keys, clicks, hits) {
  return {
    keys, mouse: { x: 0, y: 0, clicked: clicks, down: [false, false, false] }, anyPressed: false,
    down: (c) => keys.has(c), hit: (c) => hits.has(c), mouseDown: (b = 0) => clicks[b], mouseHit: (b = 0) => clicks[b],
    move: () => null, aimStick: () => null,
  };
}

// one man's state this step, at full precision
const man = (c) => [c.x, c.y, c.angle, c.alive, c.knocked ?? 0, c.state ?? '', c.tactic ?? '', c.aware ?? 0, c.meter ?? 0,
  c.weapon?.type ?? '', c.weapon?.mag ?? -1];

// a short hash of a string (FNV-1a, 32 bits)
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

function play() {
  const random = Math.random;
  Math.random = seeded(20261121);
  try {
    const cam = new Camera();
    cam.resize(1280, 720);
    const w = new World(stub({ camera: cam, input: null }), level);
    const p = w.player;
    const told = [];
    for (const ev of ['kill', 'shot', 'alertPhase', 'knock']) w.events.on(ev, (e) => told.push([ev, !!(e.victim ?? e.shooter)?.isPlayer, e.cause ?? e.how ?? e.phase]));
    p.sit = 0;
    p.invulnerable = true;
    // behind the back lot's tire iron, facing his back
    const e0 = w.enemies[0];
    Matter.Body.setPosition(p.body, { x: e0.x - Math.cos(e0.angle) * 16, y: e0.y - Math.sin(e0.angle) * 16 });
    const trace = [], frames = [], drawn = [];
    let held = new Set();
    for (let i = 0; i < STEPS; i++) {
      if (i === 180) {
        // into the dealer's room with a full pistol
        p.setWeapon('pistol');
        Matter.Body.setPosition(p.body, { x: 884, y: 420 });
        Matter.Body.setVelocity(p.body, { x: 0, y: 0 });
      }
      if (i === 840) {
        const e = hostage(w);
        Matter.Body.setPosition(p.body, { x: e.x - Math.cos(e.angle) * 14, y: e.y - Math.sin(e.angle) * 14 });
        Matter.Body.setVelocity(p.body, { x: 0, y: 0 });
      }
      const s = script(i, w);
      const hits = new Set([...s.keys].filter((k) => !held.has(k)));
      held = s.keys;
      w.step(DT, input(s.keys, s.clicks, hits), s.aim);
      cam.snap(p.x, p.y); // the view on him, as Game keeps it (its lag and shake left out)
      if (p.shield) told.push(['shield']);
      const state = [man(p), w.director.phase, ...w.enemies.map(man)];
      const json = JSON.stringify(state);
      trace.push(fnv(json));
      if (i % 6 === 5) {
        const r = recorder();
        for (const c of w.chars) if (c.alive) c.draw(r);
        for (const c of w.corpses) if (!c.dead) c.draw(r);
        drawn.push(fnv(r.log.join(';')));
      }
      if (i % 60 === 59) frames.push({ i, state: JSON.parse(json) });
    }
    return { trace, frames, drawn, told, w };
  } finally {
    Math.random = random;
  }
}

let played = null;
const fight = () => (played ??= play());

test('fight: a scripted level 1 fight plays step for step as it was recorded', () => {
  const run = fight();
  if (process.env.RECORD) {
    writeFileSync(FIXTURE, JSON.stringify({ trace: run.trace, drawn: run.drawn, frames: run.frames }) + '\n');
    return;
  }
  const rec = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const at = run.trace.findIndex((h, i) => h !== rec.trace[i]);
  if (at >= 0) {
    const near = (f) => f.find((x) => x.i >= at);
    assert.deepEqual(near(run.frames)?.state, near(rec.frames)?.state, `the fight differs from step ${at} (${(at / 60).toFixed(2)} s)`);
    assert.fail(`the fight differs from step ${at} (${(at / 60).toFixed(2)} s)`);
  }
  assert.equal(run.trace.length, rec.trace.length);
  const drew = run.drawn.findIndex((h, i) => h !== rec.drawn[i]);
  assert.equal(drew, -1, `the men are drawn otherwise from step ${drew * 6 + 5} (${((drew * 6 + 5) / 60).toFixed(2)} s)`);
  assert.equal(run.drawn.length, rec.drawn.length);
});

test('fight: the script does what it says (a takedown, the house up, rounds fired at him, a shield taken and killed)', () => {
  const { told } = fight();
  const has = (ev, them, how) => told.some(([e, p, h]) => e === ev && (them === undefined || p === them) && (how === undefined || h === how));
  assert.ok(has('kill', false, 'melee'), 'the tire iron is taken down');
  assert.ok(has('alertPhase', undefined, 'alert'), 'the house is up');
  assert.ok(has('shot', false), 'a guard fires at him');
  assert.ok(has('knock', false), 'a man is floored');
  assert.ok(has('shield'), 'a man is taken as a shield');
  assert.ok(has('kill', false, 'snap'), 'and his neck broken');
});
