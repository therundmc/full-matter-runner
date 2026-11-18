// Keyboard + mouse + gamepad state. "pressed" sets are cleared once a simulation step consumed them.
// The keyboard and the mouse fill `keys` / `pressed` / `mouse` (the QA robot writes into them directly too). A gamepad
// (engine/Gamepad.js) is read by poll() once a frame: its buttons come as their own codes ('PadA', 'PadStart'...,
// 'NavUp'... for a menu step from the d-pad or the left stick) and, through bindPad(), as the key or mouse button
// they stand for (A -> 'Space', RT -> 'Mouse0'...). The sticks are read with move() and aimStick(). `device` says
// which was used last ('kbm' | 'pad'), for the prompts on screen.
import Gamepad from './Gamepad.js';

const BLOCKED = new Set(['Space', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2', 'F3', 'F4', 'F6', 'F7']);
const MOUSE_WAKE = 6; // px the mouse must travel to take over from a gamepad (a mouse on the desk drifts)

export default class Input {
  // pads: the source of the gamepads (navigator.getGamepads by default; a fake one in the tests)
  constructor(canvas, { pads } = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: [false, false, false], clicked: [false, false, false] };
    this.anyPressed = false;
    this.wheel = 0; // notches since the last consume (+ = down)
    this.device = 'kbm';
    this.gamepad = new Gamepad(pads);
    this.padBinds = {};                    // pad button name -> key code | 'Mouse0'..'Mouse2'
    this.padKeys = new Set();              // codes the pad holds down
    this.padMouse = [false, false, false]; // mouse buttons the pad holds down
    this.stick = { left: null, right: null };
    this.padConnected = false;
    this.padLost = false;                  // the pad in use went away (cleared by whoever reacts to it)
    this.wake = 0;                         // px the mouse moved since the pad was last touched
    this.lastClient = null;
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.anyPressed = true;
      this.device = 'kbm';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = [false, false, false]; });
    canvas.addEventListener('mousemove', (e) => {
      const c = this.lastClient;
      if (c) this.wake += Math.abs(e.clientX - c.x) + Math.abs(e.clientY - c.y);
      this.lastClient = { x: e.clientX, y: e.clientY };
      if (this.wake > MOUSE_WAKE) this.device = 'kbm';
      if (this.device === 'kbm') this._move(e);
    });
    canvas.addEventListener('mousedown', (e) => {
      this._move(e);
      this.mouse.down[e.button] = true;
      this.mouse.clicked[e.button] = true;
      this.anyPressed = true;
      this.device = 'kbm';
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse.down[e.button] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // some browsers only list a pad once this was heard; poll() does the rest
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
    window.addEventListener('gamepaddisconnected', () => this.poll(0));
  }

  _move(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
    this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
  }

  // what each pad button stands for: { A: 'Space', RT: 'Mouse0', ... } (the game's data/controls.js)
  bindPad(map) { this.padBinds = { ...map }; }

  // reads the gamepads (once a frame, before anything reads the input)
  poll(dt) {
    const s = this.gamepad.update(dt);
    const was = this.padConnected;
    this.padConnected = s.connected;
    if (was && !s.connected && this.device === 'pad') { this.padLost = true; this.device = 'kbm'; }
    this.padKeys.clear();
    this.padMouse = [false, false, false];
    const alias = (name, fn) => {
      const code = this.padBinds[name];
      if (!code) return;
      const m = /^Mouse(\d)$/.exec(code);
      fn(m ? +m[1] : null, code);
    };
    for (const name of s.held) {
      this.padKeys.add(`Pad${name}`);
      alias(name, (b, code) => { if (b !== null) this.padMouse[b] = true; else this.padKeys.add(code); });
    }
    for (const name of s.pressed) {
      this.pressed.add(`Pad${name}`);
      alias(name, (b, code) => { if (b !== null) this.mouse.clicked[b] = true; else this.pressed.add(code); });
    }
    for (const d of s.nav) this.pressed.add(`Nav${d}`);
    if (s.pressed.size || s.nav.size) this.anyPressed = true;
    this.stick.left = s.left.mag > 0 ? s.left : null;
    this.stick.right = s.right.mag > 0 ? s.right : null;
    if (s.active) { this.device = 'pad'; this.wake = 0; }
  }

  down(code) { return this.keys.has(code) || this.padKeys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouseDown(b = 0) { return this.mouse.down[b] || this.padMouse[b]; }
  mouseHit(b = 0) { return this.mouse.clicked[b]; }
  // the left stick, { x, y, mag } (mag 0..1), or null when it rests
  move() { return this.stick.left; }
  // the right stick, likewise
  aimStick() { return this.stick.right; }

  consume() {
    this.pressed.clear();
    this.mouse.clicked = [false, false, false];
    this.anyPressed = false;
    this.wheel = 0;
  }
}
