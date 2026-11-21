// The gamepad's rumble (systems/Rumble.js, data/rumble.js): the effects the world's events ask for, how they mix,
// the VIBRATION option, and the gates (play only, the pad in hand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Rumble, fade } = await load('game/systems/Rumble.js');
const { RUMBLE } = await load('game/data/rumble.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { familyOf } = await load('game/data/feel.js');
const { default: EventBus } = await load('engine/EventBus.js');

const DT = 1 / 60;
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);
const valid = (fx, what) => {
  for (const k of ['strong', 'weak']) assert.ok(fx[k] >= 0 && fx[k] <= 1, `${what}.${k}`);
  assert.ok(fx.ms > 0 && fx.ms <= RUMBLE.mix.max * 1000, `${what}.ms`);
};

// a rumble on a fake pad, in play with the pad in hand, bound to a world of events (him at 0, 0)
function rig({ live = true, pad = true, scale = 1 } = {}) {
  const calls = [], pd = { play: (fx) => calls.push(fx), stop: () => calls.push('stop') };
  const r = new Rumble(pd), world = { events: new EventBus(), player: { x: 0, y: 0 } };
  r.setScale(scale);
  r.bind(world);
  r.update(0, live, pad);
  return { r, world, calls, ev: world.events, run: (s, l = live, p = pad) => { for (let t = 0; t < s - 1e-9; t += DT) r.update(DT, l, p); } };
}

test('rumble: every effect of the table is whole, short, and every gun family has its own', () => {
  for (const [k, fx] of Object.entries(RUMBLE.shot)) valid(fx, `shot.${k}`);
  for (const k of ['hit', 'kill', 'finisher', 'death', 'blast', 'door']) valid(RUMBLE[k], k);
  for (const [k, fx] of Object.entries(RUMBLE.ride)) valid(fx, `ride.${k}`);
  for (const [k, fx] of Object.entries(RUMBLE.ui)) valid(fx, `ui.${k}`);
  for (const d of Object.values(WEAPONS)) if (d.kind === 'gun') assert.ok(RUMBLE.shot[familyOf(d)], d.name);
  const S = RUMBLE.shot;
  assert.ok(S.pistol.weak > S.pistol.strong && S.pistol.ms <= 80, 'the pistol: short, sharp, the light motor');
  assert.ok(S.shotgun.strong >= 0.8 && S.shotgun.strong > S.pistol.strong, 'the shotgun: the heavy motor');
  assert.ok(S.smg.ms < WEAPONS.uzi.rate * 1000 && S.smg.weak < S.pistol.weak, 'the UZI: a light buzz that leaves a gap before its next round');
  assert.ok(RUMBLE.death.ms > RUMBLE.kill.ms && RUMBLE.death.strong >= RUMBLE.kill.strong, 'death: the long strong one');
  assert.ok(RUMBLE.kill.strong > RUMBLE.hit.strong, 'a kill punches heavier than a blow');
  assert.ok(RUMBLE.ui.tick.strong === 0 && RUMBLE.ui.tick.weak <= 0.2 && RUMBLE.ui.tick.ms <= 40, 'the menu tick is barely there');
  assert.ok(!('idle' in RUMBLE.ride) && !('engine' in RUMBLE.ride), 'nothing that hums along');
});

test('rumble: his own shot by its gun; anyone else\'s, nothing', () => {
  const { ev, world, calls, run } = rig();
  ev.emit('shot', { shooter: { isEnemy: true }, weapon: WEAPONS.shotgun });
  run(DT);
  assert.equal(calls.length, 0);
  ev.emit('shot', { shooter: world.player, weapon: WEAPONS.shotgun });
  run(DT);
  const S = RUMBLE.shot.shotgun;
  assert.equal(calls.length, 1);
  close(calls[0].strong, S.strong, 'strong'); close(calls[0].weak, S.weak, 'weak');
  assert.ok(Math.abs(calls[0].ms - S.ms) <= 1000 * DT + 1);
});

test('rumble: events into effects: a blow by its power, a kill, a finisher, his death, a blast and a door by distance', () => {
  const at = (emit) => { const s = rig(); emit(s); s.run(DT); return s.calls[0] || null; };
  const hit = at(({ ev }) => ev.emit('blow', { byPlayer: true, kind: 'blunt', power: 1, x: 0, y: 0 }));
  close(hit.strong, RUMBLE.hit.strong, 'a full blow');
  const soft = at(({ ev }) => ev.emit('blow', { byPlayer: true, kind: 'punch', power: 0, x: 0, y: 0 }));
  close(soft.strong, RUMBLE.hit.strong * 0.5, 'a light one: half');
  assert.equal(at(({ ev }) => ev.emit('blow', { byPlayer: false, kind: 'blunt', power: 1 })), null, 'a guard\'s blow');
  assert.equal(at(({ ev }) => ev.emit('blow', { byPlayer: true, kind: 'bullet', power: 1 })), null, 'a round: the shot said it');
  close(at(({ ev }) => ev.emit('blow', { byPlayer: true, kind: 'finisher', power: 1 })).strong, RUMBLE.finisher.strong, 'a takedown');
  close(at(({ ev, world }) => ev.emit('kill', { victim: {}, killer: world.player })).strong, RUMBLE.kill.strong, 'his kill');
  assert.equal(at(({ ev }) => ev.emit('kill', { victim: {}, killer: {} })), null, 'a guard killed by another');
  const death = at(({ ev, world }) => ev.emit('kill', { victim: world.player, killer: {} }));
  close(death.strong, RUMBLE.death.strong, 'his death');
  assert.ok(death.ms >= RUMBLE.death.ms - 20);
  close(at(({ ev, world }) => ev.emit('finisher', { killer: world.player })).weak, RUMBLE.finisher.weak, 'the finisher');
  // a blast: full under him, half at the middle of its fade, nothing far away
  const B = RUMBLE.blast, r = 90;
  close(at(({ ev }) => ev.emit('explosion', { x: 10, y: 0, radius: r })).strong, B.strong, 'a blast on him');
  close(at(({ ev }) => ev.emit('explosion', { x: r * (B.near + B.far) / 2, y: 0, radius: r })).strong, B.strong / 2, 'half way');
  assert.equal(at(({ ev }) => ev.emit('explosion', { x: r * B.far + 1, y: 0, radius: r })), null, 'too far');
  assert.ok(at(({ ev }) => ev.emit('doorBroken', { x: 20, y: 0 })), 'the door he kicked');
  assert.equal(at(({ ev }) => ev.emit('doorBroken', { x: 400, y: 0 })), null, 'a door across the house');
  // the car: its beats, the lorry by distance, an unknown beat nothing
  for (const beat of Object.keys(RUMBLE.ride)) assert.ok(at(({ ev }) => ev.emit('ride', { beat, x: 0, y: 0 })), beat);
  assert.equal(at(({ ev }) => ev.emit('ride', { beat: 'lorry', x: 2000, y: 0 })), null, 'a lorry far up the street');
  assert.equal(at(({ ev }) => ev.emit('ride', { beat: 'idle' })), null);
  assert.equal(fade(5, 10, 20), 1); assert.equal(fade(15, 10, 20), 0.5); assert.equal(fade(25, 10, 20), 0);
});

test('rumble: the strongest of what is under way on each motor, never a sum; a call only when the mix changes', () => {
  const { ev, world, calls, run } = rig(), me = world.player;
  // a pistol shot and the kill it makes, in the same step: the kill's motors, the longer of the two
  ev.emit('shot', { shooter: me, weapon: WEAPONS.pistol });
  ev.emit('kill', { victim: {}, killer: me });
  run(DT);
  assert.equal(calls.length, 1);
  close(calls[0].strong, Math.max(RUMBLE.kill.strong, RUMBLE.shot.pistol.strong), 'strong');
  close(calls[0].weak, Math.max(RUMBLE.kill.weak, RUMBLE.shot.pistol.weak), 'weak');
  // two of the same at once are one
  const s2 = rig();
  s2.ev.emit('shot', { shooter: s2.world.player, weapon: WEAPONS.pistol });
  s2.ev.emit('shot', { shooter: s2.world.player, weapon: WEAPONS.pistol });
  s2.run(DT);
  assert.equal(s2.calls.length, 1);
  close(s2.calls[0].weak, RUMBLE.shot.pistol.weak, 'not doubled');
  // a light one under a long strong one changes nothing; when the strong one ends, so does it all (no call)
  const s3 = rig();
  s3.ev.emit('kill', { victim: s3.world.player, killer: {} });
  s3.run(0.1);
  s3.ev.emit('shot', { shooter: s3.world.player, weapon: WEAPONS.silenced ?? WEAPONS.uzi_silenced });
  s3.run(1.2);
  assert.equal(s3.calls.length, 1, 'one call for the death, the shot under it unheard');
  // a strong one over a light long one: played until it ends, then the light one again for what is left of it
  const s4 = rig();
  s4.r.feel({ strong: 0, weak: 0.3, ms: 400 });
  s4.run(DT);
  s4.r.feel({ strong: 0.9, weak: 0.5, ms: 100 });
  s4.run(0.6);
  assert.equal(s4.calls.length, 3);
  assert.ok(s4.calls[1].strong === 0.9 && s4.calls[1].ms <= 100, 'the strong one, for its own length');
  assert.ok(s4.calls[2].strong === 0 && s4.calls[2].weak === 0.3 && s4.calls[2].ms < 400 - 100 + 40, 'then what is left of the light one');
});

test('rumble: an UZI held down is a buzz per round with gaps, at a capped rate, and it tires instead of droning', () => {
  const { ev, world, r, calls } = rig(), U = WEAPONS.uzi, S = RUMBLE.shot.smg, M = RUMBLE.mix;
  r.log = [];
  let next = 0, on = 0, t = 0;
  for (; t < 2; t += DT) {
    if (t >= next - 1e-9) { ev.emit('shot', { shooter: world.player, weapon: U }); next += U.rate; }
    r.update(DT, true, true);
    if (r.list.length) on++;
  }
  const n = Math.round(2 / U.rate);
  assert.ok(calls.length >= n * 0.8 && calls.length <= 2 / M.gap, `${calls.length} calls in 2 s`);
  for (let i = 1; i < r.log.length; i++) assert.ok(r.log[i].t - r.log[i - 1].t >= M.gap - 1e-6, 'never two calls closer than the gap');
  assert.ok(on / (2 / DT) < 0.9, `on ${Math.round((on / (2 / DT)) * 100)}% of the time: it leaves gaps`);
  // past its duty, what comes is weaker
  const late = calls.filter((c) => c !== 'stop').slice(-5);
  assert.ok(late.every((c) => c.weak <= S.weak * M.tired + 1e-6), 'tired: felt at MIX.tired');
  assert.ok(calls[0].weak === S.weak, 'the first rounds at full');
  assert.ok(S.weak < M.light && S.strong < M.light, 'a round of the UZI is a light effect');
  // a kill at the end of the burst comes whole
  ev.emit('kill', { victim: {}, killer: world.player });
  r.update(DT, true, true);
  close(calls.at(-1).strong, RUMBLE.kill.strong, 'the kill after a burst');
});

test('rumble: scaled by VIBRATION; 0 is off; a motor too weak to feel is left off', () => {
  const half = rig({ scale: 0.5 });
  half.ev.emit('kill', { victim: half.world.player, killer: {} });
  half.run(DT);
  close(half.calls[0].strong, RUMBLE.death.strong * 0.5, 'half');
  const off = rig({ scale: 0 });
  off.ev.emit('kill', { victim: off.world.player, killer: {} });
  off.ev.emit('explosion', { x: 0, y: 0, radius: 90 });
  off.run(0.5);
  assert.equal(off.calls.length, 0);
  // turned off while it plays: stopped at once
  const s = rig();
  s.ev.emit('kill', { victim: s.world.player, killer: {} });
  s.run(DT);
  s.r.setScale(0);
  assert.equal(s.calls.at(-1), 'stop');
  const faint = rig({ scale: 0.05 });
  faint.r.feel({ strong: 0.5, weak: 1, ms: 100 });
  faint.run(DT);
  assert.equal(faint.calls[0].strong, 0, 'under MIX.min: off');
  close(faint.calls[0].weak, 0.05, 'weak');
});

test('rumble: nothing out of play or without the pad in hand; leaving play stops it; the menu tick is the exception', () => {
  const paused = rig({ live: false });
  paused.ev.emit('kill', { victim: paused.world.player, killer: {} });
  paused.run(0.3);
  assert.equal(paused.calls.length, 0, 'paused, a menu, a comic page');
  const mouse = rig({ pad: false });
  mouse.ev.emit('kill', { victim: mouse.world.player, killer: {} });
  mouse.r.tick();
  mouse.run(0.3);
  assert.equal(mouse.calls.length, 0, 'the keyboard and mouse in use');
  // in play, then the pause: stopped at once, and it does not come back on resume
  const s = rig();
  s.ev.emit('kill', { victim: s.world.player, killer: {} });
  s.run(DT);
  s.run(DT, false);
  assert.deepEqual(s.calls.slice(1), ['stop']);
  s.run(0.2, true);
  assert.equal(s.calls.length, 2);
  // the mouse taken up mid-effect: stopped
  const m = rig();
  m.ev.emit('kill', { victim: m.world.player, killer: {} });
  m.run(DT);
  m.run(DT, true, false);
  assert.equal(m.calls.at(-1), 'stop');
  // a menu's tick plays out of play
  const menu = rig({ live: false });
  assert.ok(menu.r.tick());
  menu.run(DT);
  assert.equal(menu.calls.length, 1);
  assert.equal(menu.calls[0].strong, 0);
  // the VIBRATION slider's sample, at the strength just set, told at once to any pad (the mouse may have moved it),
  // and nothing at 0
  for (const pad of [true, false]) {
    const sample = rig({ live: false, pad, scale: 0.5 }), any = [];
    sample.r.pad.play = (fx, a) => { any.push(a); sample.calls.push(fx); return true; };
    assert.ok(sample.r.sample());
    close(sample.calls[0].strong, RUMBLE.ui.sample.strong * 0.5, 'the sample at the new strength');
    assert.equal(sample.calls[0].ms, RUMBLE.ui.sample.ms);
    assert.deepEqual(any, [true]);
    sample.run(0.3);
    assert.equal(sample.calls.length, 1, 'once, and nothing to stop after');
  }
  const off = rig({ live: false, scale: 0 });
  assert.equal(off.r.sample(), false);
  assert.equal(off.calls.length, 0);
  // a new level: the old world's events are not felt any more
  const old = rig(), w2 = { events: new EventBus(), player: { x: 0, y: 0 } };
  old.r.bind(w2);
  old.ev.emit('kill', { victim: old.world.player, killer: {} });
  old.run(DT);
  assert.equal(old.calls.length, 0);
});

test('rumble: Game feels through engine Input: no pad, no actuator, no throw', async () => {
  const { default: Input } = await load('engine/Input.js');
  for (const pads of [() => [], () => { throw new Error('denied'); }, () => [{ connected: true, buttons: [{ pressed: true, value: 1 }], axes: [] }]]) {
    const inp = new Input(null, { pads }), r = new Rumble({ play: (fx) => inp.rumble(fx), stop: () => inp.stopRumble() });
    inp.poll(DT);
    const world = { events: new EventBus(), player: { x: 0, y: 0 } };
    r.bind(world);
    assert.doesNotThrow(() => {
      r.update(DT, true, inp.device === 'pad');
      world.events.emit('kill', { victim: world.player, killer: {} });
      r.update(DT, true, inp.device === 'pad');
      r.update(DT, false, inp.device === 'pad');
    });
  }
});

test('rumble: every beat the world tells on \'ride\' has its effect (a kerb too)', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { RUMBLE: R } = await load('game/data/rumble.js');
  const root = new URL('../src/game/', import.meta.url), beats = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const u = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
      if (e.isDirectory()) walk(u);
      else if (e.name.endsWith('.js')) for (const m of readFileSync(u, 'utf8').matchAll(/emit\('ride', \{ beat: '(\w+)'/g)) beats.add(m[1]);
    }
  };
  walk(root);
  assert.ok(beats.has('kerb') && beats.size >= 5, [...beats].join());
  for (const b of beats) assert.ok(R.ride[b], `ride beat '${b}' has no RUMBLE.ride entry`);
});
