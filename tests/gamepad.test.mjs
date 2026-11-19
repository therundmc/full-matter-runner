import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Gamepad, BUTTONS, PAD, deadZone, stickDir } = await load('engine/Gamepad.js');
const { default: Input } = await load('engine/Input.js');
const { PAD_BINDINGS, PAD_CONTROLS, keyLabel, ACTIONS } = await load('game/data/controls.js');
const { WEAPONS } = await load('game/data/weapons.js');
globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
const { pulls } = await load('game/entities/Player.js');

// a fake standard-mapping pad: press(name, value), stick(axis pair, x, y); `pads` stands for navigator.getGamepads
function fakePad() {
  const pad = { connected: true, mapping: 'standard', buttons: BUTTONS.map(() => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  const list = [pad];
  return {
    pad, list,
    pads: () => list,
    press(name, value = 1) { const b = pad.buttons[BUTTONS.indexOf(name)]; b.value = value; b.pressed = value > 0.5; },
    release(name) { this.press(name, 0); },
    stick(side, x, y) { const i = side === 'left' ? 0 : 2; pad.axes[i] = x; pad.axes[i + 1] = y; },
    unplug() { list.length = 0; },
    plug() { if (!list.length) list.push(pad); },
  };
}

test('gamepad: the dead zone is radial and the rest is rescaled to 0..1', () => {
  assert.deepEqual(deadZone(0.1, 0.1), { x: 0, y: 0, mag: 0 });
  const half = deadZone(0.5 + PAD.dead / 2, 0);
  assert.ok(Math.abs(half.mag - 0.5) < 1e-9 && half.y === 0);
  const full = deadZone(0, -1);
  assert.equal(full.mag, 1);
  assert.equal(full.y, -1);
  assert.equal(deadZone(3, 4).mag, 1); // past the rim: clamped
  assert.equal(stickDir(0.2, 0.1), null);
  assert.equal(stickDir(0.9, 0.3), 'Right');
  assert.equal(stickDir(-0.2, -0.8), 'Up');
});

test('gamepad: a button is pressed on the frame it goes down only; triggers have hysteresis', () => {
  const f = fakePad(), g = new Gamepad(f.pads);
  f.press('A');
  let s = g.update(1 / 60);
  assert.ok(s.connected && s.held.has('A') && s.pressed.has('A') && s.active);
  s = g.update(1 / 60);
  assert.ok(s.held.has('A') && !s.pressed.has('A'));
  f.release('A');
  assert.ok(!g.update(1 / 60).held.has('A'));
  // RT: past `trigger` to press, under `release` to let go, nothing in between
  f.press('RT', PAD.trigger - 0.05);
  assert.ok(!g.update(1 / 60).held.has('RT'));
  f.press('RT', PAD.trigger + 0.05);
  assert.ok(g.update(1 / 60).pressed.has('RT'));
  f.press('RT', (PAD.trigger + PAD.release) / 2);
  assert.ok(g.update(1 / 60).held.has('RT'), 'still held between the two thresholds');
  f.press('RT', PAD.release - 0.05);
  assert.ok(!g.update(1 / 60).held.has('RT'));
});

test('gamepad: a menu direction steps once, then repeats while held, from the d-pad or the stick', () => {
  const f = fakePad(), g = new Gamepad(f.pads), dt = 0.02;
  f.press('Down');
  let steps = 0;
  for (let t = 0; t < 1; t += dt) if (g.update(dt).nav.has('Down')) steps++;
  // the press, then one every navRepeat after navDelay
  const want = 1 + Math.floor((1 - PAD.navDelay) / PAD.navRepeat) + 1;
  assert.ok(Math.abs(steps - want) <= 1, `${steps} steps, about ${want} wanted`);
  f.release('Down');
  assert.equal(g.update(dt).nav.size, 0);
  f.stick('left', 0, 0.3); // under navAt: nothing
  assert.equal(g.update(dt).nav.size, 0);
  f.stick('left', 0.95, 0.1);
  assert.deepEqual([...g.update(dt).nav], ['Right']);
  assert.equal(g.update(dt).nav.size, 0, 'no repeat before the delay');
});

test('gamepad: hot-plug, no pads at all, and a getGamepads that throws', () => {
  const f = fakePad(), g = new Gamepad(f.pads);
  f.unplug();
  assert.equal(g.update(0.016).connected, false);
  f.plug();
  f.press('Start');
  const s = g.update(0.016);
  assert.ok(s.connected && s.pressed.has('Start'));
  assert.equal(new Gamepad(() => [null, null]).update(0.016).connected, false);
  assert.equal(new Gamepad(() => { throw new Error('denied'); }).update(0.016).connected, false);
  assert.equal(new Gamepad(() => undefined).update(0.016).connected, false);
});

test('input: pad buttons play the keys and mouse buttons they are bound to, and their own codes', () => {
  const f = fakePad(), inp = new Input(null, { pads: f.pads });
  inp.bindPad(PAD_BINDINGS);
  assert.equal(inp.device, 'kbm');
  f.press('A'); f.press('RB'); f.press('LB');
  inp.poll(1 / 60);
  assert.equal(inp.device, 'pad');
  assert.ok(inp.hit('Space') && inp.hit('PadA') && inp.down('Space') && inp.anyPressed);
  assert.ok(inp.mouseHit(0) && inp.mouseDown(0) && inp.mouseHit(2) && inp.mouseDown(2));
  inp.consume();
  inp.poll(1 / 60);
  assert.ok(!inp.hit('Space') && inp.down('Space') && !inp.mouseHit(0) && inp.mouseDown(0), 'held, not pressed again');
  f.release('A'); f.release('RB'); f.release('LB');
  inp.poll(1 / 60);
  assert.ok(!inp.down('Space') && !inp.mouseDown(0) && !inp.mouseDown(2));
  // the other bindings
  for (const [btn, code] of [['X', 'KeyE'], ['Y', 'KeyR'], ['Start', 'Escape'], ['LT', 'ShiftLeft']]) {
    inp.consume();
    f.press(btn);
    inp.poll(1 / 60);
    assert.ok(inp.hit(code) && inp.down(code), `${btn} -> ${code}`);
    f.release(btn);
    inp.poll(1 / 60);
  }
  // B has no key of its own: only its code (the menus read it), never Escape / Backspace
  inp.consume();
  f.press('B');
  inp.poll(1 / 60);
  assert.ok(inp.hit('PadB') && !inp.hit('Escape') && !inp.hit('Backspace'));
});

test('input: the keyboard and the pad live side by side; the robot writing keys is not undone by a poll', () => {
  const f = fakePad(), inp = new Input(null, { pads: f.pads });
  inp.bindPad(PAD_BINDINGS);
  inp.keys.add('KeyW');
  inp.pressed.add('KeyR');
  inp.mouse.down[0] = true;
  inp.poll(1 / 60);
  assert.ok(inp.down('KeyW') && inp.hit('KeyR') && inp.mouseDown(0));
  assert.equal(inp.device, 'kbm', 'an idle pad does not take over');
});

test('input: sticks are read as analog move / aim; the pad in use going away is reported once', () => {
  const f = fakePad(), inp = new Input(null, { pads: f.pads });
  inp.bindPad(PAD_BINDINGS);
  assert.equal(inp.move(), null);
  f.stick('left', 0, -1);
  f.stick('right', 0.5, 0);
  inp.poll(1 / 60);
  assert.equal(inp.move().y, -1);
  assert.ok(inp.aimStick().x > 0 && inp.aimStick().mag < 1);
  assert.equal(inp.device, 'pad');
  f.stick('left', 0.05, 0);
  f.stick('right', 0, 0);
  inp.poll(1 / 60);
  assert.equal(inp.move(), null);
  assert.equal(inp.aimStick(), null);
  f.unplug();
  inp.poll(1 / 60);
  assert.ok(inp.padLost && inp.device === 'kbm' && !inp.padConnected);
});

test('controls: every action has a cap for each device; the pad binds what the brief asked', () => {
  for (const [a, caps] of Object.entries(ACTIONS)) assert.ok(caps.kbm && caps.pad, a);
  assert.equal(keyLabel('action', 'kbm'), 'SPACE');
  assert.equal(keyLabel('action', 'pad'), 'A');
  assert.equal(keyLabel('use', 'pad'), 'X');
  assert.equal(keyLabel('reload', 'pad'), 'Y');
  assert.equal(keyLabel('attack', 'pad'), 'RB');
  assert.equal(keyLabel('throw', 'pad'), 'LB');
  assert.equal(keyLabel('look', 'pad'), 'LT');
  assert.equal(keyLabel('attack', 'kbm'), 'LMB');
  assert.equal(keyLabel('nothing', 'pad'), 'nothing');
  assert.deepEqual(PAD_BINDINGS, { A: 'Space', X: 'KeyE', Y: 'KeyR', Start: 'Escape', RB: 'Mouse0', LB: 'Mouse2', RT: 'Mouse0', LT: 'ShiftLeft' });
  // the CONTROLS page says the same
  const said = Object.fromEntries(PAD_CONTROLS.flat().flatMap(([, list]) => list).map(([k, what]) => [what, k]));
  assert.equal(said['ATTACK / SHOOT'], 'RB / RT');
  assert.equal(said['THROW (HOLD: AIM) / PICK UP'], 'LB');
  assert.equal(said['LOOK FURTHER'], 'LT');
  assert.equal(said['TAKE DOWN / FINISH'], 'RB');
});

test('input: RT is an alias of RB (attack), the bumpers are read on the frame they go down, with no threshold', () => {
  const f = fakePad(), inp = new Input(null, { pads: f.pads });
  inp.bindPad(PAD_BINDINGS);
  f.press('RT');
  inp.poll(1 / 60);
  assert.ok(inp.mouseHit(0) && inp.mouseDown(0) && !inp.down('ShiftLeft'), 'RT attacks');
  f.release('RT');
  inp.consume();
  inp.poll(1 / 60);
  assert.ok(!inp.mouseDown(0));
  // a bumper barely pushed (a digital switch reports pressed) counts at once
  const b = f.pad.buttons[BUTTONS.indexOf('RB')];
  b.pressed = true; b.value = 1;
  inp.poll(1 / 60);
  assert.ok(inp.mouseHit(0), 'pressed on its first frame');
});

// frames of play: the pad polled, the step reads the attack button (Player's gate), the presses consumed
function pullsOver(d, frames, hold) {
  const f = fakePad(), inp = new Input(null, { pads: f.pads });
  inp.bindPad(PAD_BINDINGS);
  let n = 0;
  for (let i = 0; i < frames; i++) {
    if (hold(i)) f.press('RB'); else f.release('RB');
    inp.poll(1 / 60);
    if (pulls(d, inp)) n++;
    inp.consume();
  }
  return n;
}

test('input: RB held runs an automatic on, a semi-automatic fires once a press, a melee weapon swings while held', () => {
  assert.equal(pullsOver(WEAPONS.uzi, 30, () => true), 30, 'the UZI asks for a round every step it is held (its rate does the rest)');
  assert.equal(pullsOver(WEAPONS.pistol, 30, () => true), 1, 'the 1911: one round for one press');
  assert.equal(pullsOver(WEAPONS.pistol, 30, (i) => i % 4 < 2), 8, 'a press every 4 frames: a round every press');
  assert.equal(pullsOver(WEAPONS.shotgun, 30, (i) => i === 0), 1);
  assert.equal(pullsOver(WEAPONS.bat, 10, () => true), 10);
  assert.equal(pullsOver(WEAPONS.uzi, 10, () => false), 0);
});

test('gamepad: rumble shakes the pad last touched, dual-rumble first, a pulse failing that; never throws', () => {
  const calls = [];
  const f = fakePad(), other = { ...fakePad().pad, index: 1 };
  f.pad.index = 0;
  f.list.push(other);
  f.pad.vibrationActuator = { playEffect: (type, o) => { calls.push(['pad0', type, o]); return Promise.reject(new Error('preempted')); }, reset: () => { calls.push(['reset0']); } };
  other.hapticActuators = [{ pulse: (v, ms) => { calls.push(['pad1', v, ms]); return Promise.resolve(true); } }];
  const g = new Gamepad(f.pads);
  g.update(1 / 60);
  assert.ok(g.rumble({ strong: 1, weak: 1, ms: 100 }), 'nothing touched yet: the first connected pad that can rumble');
  assert.equal(calls.pop()[0], 'pad0');
  f.press('A');
  g.update(1 / 60);
  assert.ok(g.rumble({ strong: 0.5, weak: 2, ms: 80.4 }));
  assert.deepEqual(calls.pop(), ['pad0', 'dual-rumble', { startDelay: 0, duration: 80, strongMagnitude: 0.5, weakMagnitude: 1 }]);
  assert.ok(g.stopRumble());
  assert.deepEqual(calls.pop(), ['reset0']);
  // the second pad touched: it is the one in hand, through its pulse
  f.release('A');
  other.buttons = BUTTONS.map(() => ({ pressed: false, value: 0 }));
  other.axes = [0, 0, 0, 0];
  g.update(1 / 60);
  assert.ok(g.rumble({ strong: 0.1, weak: 0.1, ms: 10 }) && calls.pop()[0] === 'pad0', 'still the first one, untouched since');
  other.buttons[0] = { pressed: true, value: 1 };
  g.update(1 / 60);
  assert.ok(g.rumble({ strong: 0.3, weak: 0.6, ms: 50 }));
  assert.deepEqual(calls.pop(), ['pad1', 0.6, 50]);
  // nothing to shake, an actuator that throws, no pads at all: false, never a throw
  other.hapticActuators = [];
  assert.equal(g.rumble({ strong: 1, weak: 1, ms: 50 }), false);
  other.vibrationActuator = { playEffect() { throw new Error('nope'); } };
  assert.equal(g.rumble({ strong: 1, weak: 1, ms: 50 }), false);
  f.unplug();
  g.update(1 / 60);
  assert.equal(g.rumble({ strong: 1, weak: 1, ms: 50 }), false);
  assert.equal(g.stopRumble(), false);
});

test('input: the pad rumbles only while it is the device in use', () => {
  const f = fakePad(), inp = new Input(null, { pads: f.pads }), calls = [];
  f.pad.vibrationActuator = { playEffect: (type, o) => { calls.push(o); } };
  inp.bindPad(PAD_BINDINGS);
  inp.poll(1 / 60);
  assert.equal(inp.rumble({ strong: 1, weak: 1, ms: 50 }), false, 'the keyboard is the device');
  f.press('A');
  inp.poll(1 / 60);
  assert.equal(inp.rumble({ strong: 1, weak: 1, ms: 50 }), true);
  inp.device = 'kbm'; // the mouse taken up
  assert.equal(inp.rumble({ strong: 1, weak: 1, ms: 50 }), false);
  assert.equal(calls.length, 1);
});

test('gamepad: rumble reads the pad afresh by its index at the call (a browser handing out snapshots)', () => {
  const calls = [], f = fakePad();
  f.pad.index = 0;
  const snap = (tag) => ({ ...f.pad, buttons: f.pad.buttons.map((b) => ({ ...b })), axes: [...f.pad.axes], vibrationActuator: { playEffect: (type, o) => { calls.push([tag, o.duration]); } } });
  let now = snap('old');
  const g = new Gamepad(() => [now]);
  f.press('A');
  now = snap('old');
  g.update(1 / 60);
  now = snap('fresh'); // the next frame's snapshot, not polled yet
  assert.ok(g.rumble({ strong: 0.5, weak: 0.5, ms: 40 }));
  assert.deepEqual(calls.pop(), ['fresh', 40], 'the snapshot of now, not the stored one');
  now = null; // gone from the list between two polls: the stored one
  assert.ok(g.rumble({ strong: 0.5, weak: 0.5, ms: 30 }));
  assert.deepEqual(calls.pop(), ['old', 30]);
});

test('gamepad: canRumble tells whether a connected pad has an actuator this browser drives', () => {
  const f = fakePad(), g = new Gamepad(f.pads);
  g.update(1 / 60);
  assert.equal(g.canRumble, false, 'a pad without an actuator (Firefox)');
  assert.equal(g.rumble({ strong: 1, weak: 1, ms: 50 }), false);
  f.pad.vibrationActuator = { playEffect() {} };
  g.update(1 / 60);
  assert.equal(g.canRumble, true, 'vibrationActuator (Chrome / Edge)');
  delete f.pad.vibrationActuator;
  f.pad.hapticActuators = [{ pulse() {} }];
  g.update(1 / 60);
  assert.equal(g.canRumble, true, 'a haptic pulse');
  f.unplug();
  g.update(1 / 60);
  assert.equal(g.canRumble, false, 'no pad');
  const inp = new Input(null, { pads: f.pads });
  f.plug();
  inp.poll(1 / 60);
  assert.equal(inp.canRumble, true);
});

test('input: a sample rumbles a connected pad whatever the device; the mouse takes over only past a real move', () => {
  const f = fakePad(), inp = new Input(null, { pads: f.pads }), calls = [];
  f.pad.vibrationActuator = { playEffect: (type, o) => { calls.push(o); } };
  inp.bindPad(PAD_BINDINGS);
  inp.poll(1 / 60);
  assert.equal(inp.rumble({ strong: 1, weak: 1, ms: 50 }), false, 'the keyboard is the device');
  assert.equal(inp.rumble({ strong: 1, weak: 1, ms: 50 }, true), true, 'a sample is felt anyway');
  f.press('A');
  inp.poll(1 / 60);
  assert.equal(inp.device, 'pad');
  // a mouse on the desk: a px now and then, for seconds, never adds up
  for (let i = 0; i < 300; i++) { if (i % 10 === 0) inp.travel(2); inp.poll(1 / 60); }
  assert.equal(inp.device, 'pad', 'drift does not take the pad out of his hands');
  inp.travel(40);
  assert.equal(inp.device, 'kbm', 'a mouse taken up does');
});
