// Keyboard + mouse + gamepad state. "pressed" sets are cleared once a simulation step consumed them.
// The keyboard and the mouse fill `keys` / `pressed` / `mouse` (the QA robot writes into them directly too). A gamepad
// (engine/Gamepad.js) is read by poll() once a frame: its buttons come as their own codes ('PadA', 'PadStart'...,
// 'NavUp'... for a menu step from the d-pad or the left stick) and, through bindPad(), as the key or mouse button
// they stand for (A -> 'Space', RB -> 'Mouse0'...). The sticks are read with move() and aimStick(). `device` says
// which was used last ('kbm' | 'pad'), for the prompts on screen. rumble() shakes the pad in hand, and only while the
// pad is the device in use (a mouse taken up stops it). holdMouse() makes the buttons held now read as up until they
// are let go (play entered from a menu or a screen with a click: that click is no shot).
import Gamepad from './Gamepad.js';

// keys whose browser default is never wanted: scrolling, focus, going back, and the F keys the game's developer
// reads (data/build.js DEV_KEYS: help, find, address bar...); F7 is read by nothing, it is blocked so that the
// browser's caret browsing does not ask to turn itself on mid-fight
const BLOCKED = new Set(['Space', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8']);
// px the mouse must travel to take over from a gamepad, and px a second its travel is forgotten: a mouse on the desk
// drifts or is brushed (a few px now and then never adds up), a mouse taken up crosses this in a moment
const MOUSE_WAKE = 24, WAKE_FADE = 60;

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
    this.focusLost = false;                // the window lost the focus or was hidden (likewise)
    this.held = [false, false, false];     // buttons read as up until let go (holdMouse)
    this.wake = 0;                         // px the mouse moved lately (fading) since the pad was last touched
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
    window.addEventListener('blur', () => this.unfocus());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.unfocus(); });
    canvas.addEventListener('mousemove', (e) => {
      const c = this.lastClient;
      if (c) this.travel(Math.abs(e.clientX - c.x) + Math.abs(e.clientY - c.y));
      this.lastClient = { x: e.clientX, y: e.clientY };
      if (this.device === 'kbm') this._move(e);
    });
    canvas.addEventListener('mousedown', (e) => {
      this._move(e);
      this.press(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => this.release(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // some browsers only list a pad once this was heard; poll() does the rest
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
    window.addEventListener('gamepaddisconnected', () => this.poll(0));
  }

  // a mouse button goes down / up (the DOM's events, the tests)
  press(b) {
    this.mouse.down[b] = true;
    this.mouse.clicked[b] = true;
    this.held[b] = false;
    this.anyPressed = true;
    this.device = 'kbm';
  }
  release(b) {
    this.mouse.down[b] = false;
    this.held[b] = false;
  }

  // the window went to the background: nothing stays held, and whoever plays is told (focusLost)
  unfocus() {
    this.keys.clear();
    this.mouse.down = [false, false, false];
    this.focusLost = true;
  }

  // the buttons down now (the mouse's or the pad's) read as up until they are let go
  holdMouse() {
    for (let b = 0; b < 3; b++) this.held[b] = this.mouse.down[b] || this.padMouse[b];
  }

  // the mouse moved px: once it adds up to MOUSE_WAKE (fading), the mouse is the device again
  travel(px) {
    this.wake += px;
    if (this.wake > MOUSE_WAKE) this.device = 'kbm';
  }

  _move(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
    this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
  }

  // what each pad button stands for: { A: 'Space', RB: 'Mouse0', ... } (the game's data/controls.js)
  bindPad(map) { this.padBinds = { ...map }; }

  // reads the gamepads (once a frame, before anything reads the input)
  poll(dt) {
    const s = this.gamepad.update(dt);
    this.wake = Math.max(0, this.wake - WAKE_FADE * dt);
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
    // a button held through holdMouse() and let go since (the pad's, or one written straight in: the QA robot)
    for (let b = 0; b < 3; b++) if (this.held[b] && !this.mouse.down[b] && !this.padMouse[b]) this.held[b] = false;
  }

  // fx: { strong, weak, ms } (engine/Gamepad.js rumble); false when the pad is not the device in use (any: it need
  // not be, a sample asked from the menu) or cannot
  rumble(fx, any = false) { return (any || this.device === 'pad') && this.gamepad.rumble(fx); }
  stopRumble() { return this.gamepad.stopRumble(); }
  // a connected pad can be rumbled by this browser (engine/Gamepad.js canRumble)
  get canRumble() { return this.gamepad.canRumble; }

  down(code) { return this.keys.has(code) || this.padKeys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouseDown(b = 0) { return !this.held[b] && (this.mouse.down[b] || this.padMouse[b]); }
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
