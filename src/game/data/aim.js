// How the aim is shown (the AIM option, systems/Settings.js `aim`, LOCK by default; F7 cycles it in play): with a
// mouse the old cross sits on a point, with a gamepad the right stick only gives a WAY, so every cue but the cross
// starts at the gun and tells that way (systems/AimCue.js works it out, render/AimArt.js paints it, in the world,
// over the lighting; the mouse keeps a small dot where it is). Lengths in world px, angles in rad, alphas 0..1.
// The player's inks only (cyan, white): a guard's told shot is a red line and nothing here may look like one.
export const AIM_STYLES = ['cross', 'line', 'wedge', 'notch', 'lock'];

export const AIM = {
  // what the option and the F7 label call each
  names: { cross: 'CROSS', line: 'LINE', wedge: 'WEDGE', notch: 'NOTCH', lock: 'LOCK' },
  ink: '#140c1c',        // the dark edge under every mark (it reads on a lit floor)
  bone: '#efe6d0',       // the mouse's dot
  rest: '#05d9e8',       // the cue at rest: his cyan
  hot: '#f6fffa',        // a man in the line: white
  off: '#8a8494',        // the car gun out of its arc
  reach: 300,            // how far the line of fire is looked along (a little past the screen's edge)
  clear: ['glass', 'item', 'debris'], // what a round goes through or over: the line does too
  melee: 6,              // px past a blade's or a fist's range the cue of a melee weapon ends
  under: 0.55,           // alpha of the dark edge
  // LINE: dashes out of the muzzle, marching away, paler by bands with the distance, a pip on what stops them
  line: { len: 150, on: 4, off: 3, bands: [0.95, 0.7, 0.45, 0.25], march: 16, pip: 3, hot: 0.95, start: 3 },
  // WEDGE: the weapon's spread on the floor (its swing for a blade), flat, brighter with a man in it
  wedge: { len: 120, min: 0.045, fill: 0.12, hot: 0.2, edge: 0.6, edgeHot: 0.95, rays: 7, start: 4 },
  // NOTCH: a chevron at a fixed distance on the aim line, on a faint dotted arc of the ring round him
  notch: { at: 46, size: 5, arc: 0.7, dot: 0.09, ring: 0.3, alpha: 0.95, wall: 8 },
  // LOCK: the chevron on the floor (no line of fire: where the rounds go is the player's to judge); the man nearest
  // the line within `cone` gets faint corner ticks (`alpha`: [near the line, the line on him]), and on a gamepad the
  // aim is pulled onto him within `assist` (Game.padAim): leaving that angle with the stick lets go
  lock: { cone: 0.3, assist: 0.2, reach: 280, melee: 80, box: 14, corner: 3, pulse: 0.8, rate: 6, alpha: [0.3, 0.6] },
  // the car gun out of its arc: a short grey stub and a cross at its end
  offArc: { len: 30, on: 2, off: 3, cross: 3, alpha: 0.9 },
  // the mouse's dot (ui px at 720p), and the F7 label's time on screen
  dot: { r: 2, edge: 1.5 },
  note: 1.8,
};

// the style after `style` (F7, the option's right) or before it (dir -1)
export function nextStyle(style, dir = 1) {
  const n = AIM_STYLES.length, i = Math.max(0, AIM_STYLES.indexOf(style));
  return AIM_STYLES[(i + dir + n) % n];
}
