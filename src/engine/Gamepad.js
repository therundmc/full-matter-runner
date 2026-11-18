// Gamepads read through the browser's Gamepad API, "standard" mapping (Xbox layout names). DOM-free: the source of
// the pads is injected (`navigator.getGamepads` by default), so the reading is unit-tested with fake pads.
// Every connected pad counts (buttons are OR-ed, the strongest stick wins): plugging a second one in, or swapping
// one for another, needs nothing. update(dt) once a frame gives what the pads hold and what was just pressed.

// standard mapping: button index -> name
export const BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right', 'Home'];
// the four directions menus are walked with, from the d-pad or the left stick
const NAV = ['Up', 'Down', 'Left', 'Right'];

export const PAD = {
  dead: 0.22,       // stick dead zone (radial), the rest rescaled to 0..1
  trigger: 0.35,    // an analog trigger counts as pressed past this ...
  release: 0.22,    // ... and as released under this (no chatter around one threshold)
  navAt: 0.55,      // the left stick walks a menu past this, on its dominant axis
  navDelay: 0.38,   // s a held direction waits before it repeats ...
  navRepeat: 0.11,  // ... and s between two repeats
};

const defaultPads = () => {
  try { return globalThis.navigator?.getGamepads?.() || []; } catch { return []; }
};

// radial dead zone: { x, y, mag } with mag 0..1 (0 inside the dead zone)
export function deadZone(x = 0, y = 0, dead = PAD.dead) {
  const m = Math.hypot(x, y);
  if (!(m > dead)) return { x: 0, y: 0, mag: 0 };
  const k = Math.min(1, (m - dead) / (1 - dead));
  return { x: (x / m) * k, y: (y / m) * k, mag: k };
}

// the menu direction a stick points at (null in the middle)
export function stickDir(x, y, at = PAD.navAt) {
  if (Math.max(Math.abs(x), Math.abs(y)) < at) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'Right' : 'Left') : (y > 0 ? 'Down' : 'Up');
}

const value = (b) => (typeof b === 'number' ? b : b ? (b.value || (b.pressed ? 1 : 0)) : 0);

export default class Gamepad {
  constructor(getPads = defaultPads, tuning = PAD) {
    this.getPads = getPads;
    this.T = tuning;
    this.held = new Set();     // button names held now
    this.connected = false;
    this.navT = {};            // direction -> s it has been held (for the repeat)
  }

  // reads the pads. Returns { connected, held, pressed: Set of names pressed since the last update, nav: Set of
  // menu directions to step (first press and repeats), left, right: sticks after the dead zone, active: the pads
  // were touched this frame (a press or a stick out of its dead zone) }
  update(dt) {
    const T = this.T, held = new Set();
    let left = { x: 0, y: 0, mag: 0 }, right = left, any = false;
    let list = [];
    try { list = Array.from(this.getPads() || []); } catch { list = []; }
    for (const p of list) {
      if (!p || p.connected === false) continue;
      any = true;
      const b = p.buttons || [];
      BUTTONS.forEach((name, i) => {
        const v = value(b[i]);
        const analog = name === 'LT' || name === 'RT';
        const on = analog ? v > (this.held.has(name) ? T.release : T.trigger) : v > 0.5 || !!b[i]?.pressed;
        if (on) held.add(name);
      });
      const a = p.axes || [];
      const l = deadZone(a[0], a[1], T.dead), r = deadZone(a[2], a[3], T.dead);
      if (l.mag > left.mag) left = l;
      if (r.mag > right.mag) right = r;
    }
    const pressed = new Set([...held].filter((n) => !this.held.has(n)));
    this.held = held;
    this.connected = any;

    // menu directions: the d-pad or the stick, a step on the press then repeats while held
    const nav = new Set(), sd = stickDir(left.x, left.y, T.navAt);
    for (const d of NAV) {
      if (!held.has(d) && sd !== d) { delete this.navT[d]; continue; }
      const was = this.navT[d];
      if (was === undefined) { this.navT[d] = 0; nav.add(d); continue; }
      const t = was + dt;
      this.navT[d] = t;
      // a repeat each time the hold crosses delay + k * repeat
      const steps = (s) => (s < T.navDelay ? 0 : 1 + Math.floor((s - T.navDelay) / T.navRepeat));
      if (steps(t) > steps(was)) nav.add(d);
    }
    const active = pressed.size > 0 || left.mag > 0 || right.mag > 0;
    return { connected: any, held, pressed, nav, left, right, active };
  }
}
