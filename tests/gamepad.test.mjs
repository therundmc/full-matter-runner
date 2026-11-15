import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Gamepad, BUTTONS, PAD, deadZone, stickDir } = await load('engine/Gamepad.js');
const { default: Input } = await load('engine/Input.js');
const { PAD_BINDINGS, keyLabel, ACTIONS } = await load('game/data/controls.js');

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
  f.press('A'); f.press('RT'); f.press('LT');
  inp.poll(1 / 60);
  assert.equal(inp.device, 'pad');
  assert.ok(inp.hit('Space') && inp.hit('PadA') && inp.down('Space') && inp.anyPressed);
  assert.ok(inp.mouseHit(0) && inp.mouseDown(0) && inp.mouseHit(2) && inp.mouseDown(2));
  inp.consume();
  inp.poll(1 / 60);
  assert.ok(!inp.hit('Space') && inp.down('Space') && !inp.mouseHit(0) && inp.mouseDown(0), 'held, not pressed again');
  f.release('A'); f.release('RT'); f.release('LT');
  inp.poll(1 / 60);
  assert.ok(!inp.down('Space') && !inp.mouseDown(0) && !inp.mouseDown(2));
  // the other bindings
  for (const [btn, code] of [['X', 'KeyE'], ['Y', 'KeyR'], ['Start', 'Escape'], ['RB', 'ShiftLeft']]) {
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
  assert.equal(keyLabel('attack', 'pad'), 'RT');
  assert.equal(keyLabel('throw', 'pad'), 'LT');
  assert.equal(keyLabel('nothing', 'pad'), 'nothing');
  assert.deepEqual(PAD_BINDINGS, { A: 'Space', X: 'KeyE', Y: 'KeyR', Start: 'Escape', RT: 'Mouse0', LT: 'Mouse2', RB: 'ShiftLeft' });
});
