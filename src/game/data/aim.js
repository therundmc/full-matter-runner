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
  // LOCK: no line of fire (where the rounds go is the player's to judge); a worn chevron on the floor at the notch's
  // distance, pointing out along the aim, only with the AIM MARK option (Settings `aimMark`, off by default; the mark on
  // the man stays); the man nearest the line within `cone` gets a
  // mark (`mark`, one of `marks`: the user kept the corner ticks; the others are kept to compare, `?mark=ring` in the address
  // picks one for a session), and on a gamepad the aim is pulled onto him within `assist` (Game.padAim): leaving that
  // angle with the stick lets go. Pairs are [at rest / a man near the line, the line on a man].
  lock: {
    cone: 0.3, assist: 0.2, reach: 280, melee: 80,
    mark: 'corners',
    marks: ['ring', 'tick', 'point', 'corners'],
    chevron: { size: 4, alpha: [0.6, 0.9], seed: 7 }, // the floor chevron: arm px, alpha, which wear
    // ring: a stencilled circle on the floor round his feet: four short arcs, which close in and lengthen on him.
    // r: px; span: rad an arc; turn: where the first arc is (the bridges stay on the axes); snap: s to close in
    ring: { r: [17, 14], arcs: 4, span: [0.5, 1.22], turn: Math.PI / 4, width: [1, 1], snap: 0.12, alpha: [0.6, 0.9] },
    // tick: one strip of tape at his feet on the player's side, longer and thicker on him
    tick: { r: [16, 14], span: [0.55, 1.5], width: [1, 2], snap: 0.12, alpha: [0.6, 0.9] },
    // point: a chevron at the edge of his body, pointing at him from the player's side. gap: px between its tip and
    // his body; size: arm px
    point: { gap: [7, 3], size: [3, 5], alpha: [0.5, 0.9] },
    // corners: the old corner ticks (a box of `box` px half-side, `corner` px a tick, breathing `pulse` px at `rate`)
    corners: { box: 14, corner: 3, pulse: 0.8, rate: 6, alpha: [0.3, 0.6] },
  },
  // the worn look of LOCK's marks and of the vault's (systems/AimMark.js): the paint goes in flakes of `run` px; of
  // them `chip` are gone and `thin` are left at `fade` of their alpha; `flecks` stray specks of spray round a ring at
  // `speck` of its alpha, `stray` px [from, to] outside it
  worn: { chip: 0.13, thin: 0.22, fade: 0.5, run: 2, flecks: 3, speck: 0.3, stray: [2, 4] },
  // the vault's mark (Player.vaultHint; AimArt drawVaultMark), the same paint: a bar of `edge` px, `thick` px thick,
  // on the obstacle's edge and two arcs bowed the way he would go, the near one white (radii `r` about a point `back`
  // px before the edge, `span` rad and `width` px each), which hop `rise` px out and back in whole px, `rate` rad/s
  hop: { edge: 13, thick: 2, r: [7, 12], span: [1.5, 1.05], width: [2, 2], back: 2, rise: 2, rate: 8, alpha: [0.95, 0.85], seed: 3 },
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
