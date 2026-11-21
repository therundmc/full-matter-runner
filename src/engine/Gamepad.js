// Gamepads read through the browser's Gamepad API, "standard" mapping (Xbox layout names). DOM-free: the source of
// the pads is injected (`navigator.getGamepads` by default), so the reading is unit-tested with fake pads.
// Every connected pad counts (buttons are OR-ed, the strongest stick wins): plugging a second one in, or swapping
// one for another, needs nothing. update(dt) once a frame gives what the pads hold and what was just pressed.
// rumble() shakes the pad last touched (the one in hand), through its vibrationActuator ('dual-rumble') or, failing
// that, its hapticActuators' pulse; feature-detected, it never throws (no pad, no actuator, a browser that refuses).
// The pad is looked up afresh at the call by its index (some browsers hand out snapshots that go stale); with none
// touched yet, the first connected one that can rumble. `canRumble`: a connected pad has an actuator this browser
// drives (Chrome / Edge: vibrationActuator; Firefox has none).

import { clamp01 } from './math.js';

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

// the pad's way to rumble: 'dual' (vibrationActuator.playEffect), 'pulse' (hapticActuators[0].pulse) or null
function actuator(p) {
  try {
    if (typeof p?.vibrationActuator?.playEffect === 'function') return 'dual';
    if (typeof p?.hapticActuators?.[0]?.pulse === 'function') return 'pulse';
  } catch { /* a getter that throws: none */ }
  return null;
}

const value = (b) => (typeof b === 'number' ? b : b ? (b.value || (b.pressed ? 1 : 0)) : 0);

export default class Gamepad {
  constructor(getPads = defaultPads, tuning = PAD) {
    this.getPads = getPads;
    this.T = tuning;
    this.held = new Set();     // button names held now
    this.connected = false;
    this.navT = {};            // direction -> s it has been held (for the repeat)
    this.pad = null;           // the pad last touched (a press or a stick out): the one rumble() shakes
    this.padIndex = -1;        // ... its index, to find it again in a fresh list (some browsers hand out snapshots)
    this.canRumble = false;    // a connected pad (the one in hand when there is one) can be rumbled
  }

  // reads the pads. Returns { connected, held, pressed: Set of names pressed since the last update, nav: Set of
  // menu directions to step (first press and repeats), left, right: sticks after the dead zone, active: the pads
  // were touched this frame (a press or a stick out of its dead zone) }
  update(dt) {
    const T = this.T, held = new Set();
    let left = { x: 0, y: 0, mag: 0 }, right = left, any = false;
    let list = [], touched = null, inUse = null;
    try { list = Array.from(this.getPads() || []); } catch { list = []; }
    list.forEach((p, k) => {
      if (!p || p.connected === false) return;
      any = true;
      const b = p.buttons || [];
      let fresh = false;
      BUTTONS.forEach((name, i) => {
        const v = value(b[i]);
        const analog = name === 'LT' || name === 'RT';
        const on = analog ? v > (this.held.has(name) ? T.release : T.trigger) : v > 0.5 || !!b[i]?.pressed;
        if (on) { held.add(name); if (!this.held.has(name)) fresh = true; }
      });
      const a = p.axes || [];
      const l = deadZone(a[0], a[1], T.dead), r = deadZone(a[2], a[3], T.dead);
      if (l.mag > left.mag) left = l;
      if (r.mag > right.mag) right = r;
      const index = p.index ?? k;
      if (!touched && (fresh || l.mag > 0 || r.mag > 0)) touched = { p, index };
      if (index === this.padIndex) inUse = p;
    });
    // the pad in hand: the one touched now, else the same one as before (its fresh snapshot), else none
    if (touched) { this.pad = touched.p; this.padIndex = touched.index; } else this.pad = inUse;
    this.canRumble = this.pad ? !!actuator(this.pad) : list.some((p) => p && p.connected !== false && actuator(p));
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

  // the pad to shake now: the one in hand, read afresh from the browser's list by its index (its stored snapshot
  // failing that); none touched yet, the first connected one that can rumble
  target() {
    let list = [];
    try { list = Array.from(this.getPads() || []); } catch { list = []; }
    const live = (p) => p && p.connected !== false;
    if (this.padIndex >= 0) {
      const fresh = list.find((p, k) => live(p) && (p.index ?? k) === this.padIndex);
      return fresh || this.pad;
    }
    return list.find((p) => live(p) && actuator(p)) || null;
  }

  // shakes the pad in hand: { strong, weak } 0..1 (the heavy and the light motor), ms. False when nothing could.
  rumble({ strong = 0, weak = 0, ms = 0 } = {}) {
    const p = this.target();
    if (!p) return false;
    const s = clamp01(strong), w = clamp01(weak), duration = Math.max(0, Math.round(ms));
    try {
      const how = actuator(p);
      if (how === 'dual') {
        quiet(p.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration, strongMagnitude: s, weakMagnitude: w }));
        return true;
      }
      if (how === 'pulse') { quiet(p.hapticActuators[0].pulse(Math.max(s, w), duration)); return true; }
    } catch { /* refused: nothing felt */ }
    return false;
  }

  // stops what the pad in hand plays
  stopRumble() {
    const p = this.target();
    if (!p) return false;
    try {
      const act = p.vibrationActuator;
      if (typeof act?.reset === 'function') { quiet(act.reset()); return true; }
      if (typeof act?.playEffect === 'function') {
        quiet(act.playEffect('dual-rumble', { startDelay: 0, duration: 0, strongMagnitude: 0, weakMagnitude: 0 }));
        return true;
      }
      const h = p.hapticActuators?.[0];
      if (typeof h?.pulse === 'function') { quiet(h.pulse(0, 0)); return true; }
    } catch { /* refused */ }
    return false;
  }
}

// a promise the browser may reject (an effect cut short by the next one): never an unhandled rejection
const quiet = (r) => { if (r && typeof r.catch === 'function') r.catch(() => {}); };
