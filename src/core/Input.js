// Keyboard + mouse state. "pressed" sets are cleared once a simulation step consumed them.
const BLOCKED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2']);

export default class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: [false, false, false], clicked: [false, false, false] };
    this.anyPressed = false;

    window.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.anyPressed = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = [false, false, false]; });
    canvas.addEventListener('mousemove', (e) => this._move(e));
    canvas.addEventListener('mousedown', (e) => {
      this._move(e);
      this.mouse.down[e.button] = true;
      this.mouse.clicked[e.button] = true;
      this.anyPressed = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse.down[e.button] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _move(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
    this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouseDown(b = 0) { return this.mouse.down[b]; }
  mouseHit(b = 0) { return this.mouse.clicked[b]; }

  consume() {
    this.pressed.clear();
    this.mouse.clicked = [false, false, false];
    this.anyPressed = false;
  }
}
