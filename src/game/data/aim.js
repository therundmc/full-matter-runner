// How the aim is shown: LOCK (the user's pick), a mark on the man nearest the aim's way. With a gamepad the right
// stick only gives a WAY, so the cue starts at the gun and tells that way (systems/AimCue.js works it out,
// render/AimArt.js paints it, in the world, over the lighting; the mouse keeps a small dot where it is). Lengths in
// world px, angles in rad, alphas 0..1. The player's inks only (cyan, white): a guard's told shot is a red line and
// nothing here may look like one.
export const AIM = {
  ink: '#140c1c',        // the dark edge under every mark (it reads on a lit floor)
  bone: '#efe6d0',       // the mouse's dot
  rest: '#05d9e8',       // the cue at rest: his cyan
  hot: '#f6fffa',        // a man in the line: white
  off: '#8a8494',        // the car gun out of its arc
  reach: 300,            // how far the line of fire is looked along (a little past the screen's edge)
  clear: ['glass', 'item', 'debris', 'overhead'], // what a round goes through or over (a billboard's face): the line does too
  melee: 6,              // px past a blade's or a fist's range the cue of a melee weapon ends
  under: 0.55,           // alpha of the dark edge
  // LOCK: no line of fire (where the rounds go is the player's to judge); a worn chevron on the floor `chevron.at` px
  // out (nearer a wall: `wall` px short of it), pointing out along the aim, only with the AIM MARK option (Settings `aimMark`, off by default; the mark on
  // the man stays); the man nearest the line within `cone` gets the corner ticks (`corners`, the user's pick), and on
  // a gamepad the aim is pulled onto him within `assist` (CameraDirector.padAim): leaving that angle with the stick lets go.
  // Pairs are [at rest / a man near the line, the line on a man].
  // With a melee weapon (systems/AimCue.js meleeLock): out to `melee` px, and within a swing's reach (+ PLAYER.lunge.lock
  // .margin) the man is taken within `wide` rad of the aim, at his side too; that close one turns the player onto him
  // over `face` s before the click (Player.faceLock), the aim itself left where it is, and a click strikes him.
  lock: {
    cone: 0.3, assist: 0.2, reach: 280, melee: 80, wide: 1.9, face: 0.06,
    chevron: { at: 46, wall: 8, size: 4, alpha: [0.6, 0.9], seed: 7 }, // the floor chevron: px out, arm px, alpha, which wear
    // corners: the corner ticks round the man (a box of `box` px half-side, `corner` px a tick, breathing `pulse` px
    // at `rate`)
    corners: { box: 14, corner: 3, pulse: 0.8, rate: 6, alpha: [0.3, 0.6] },
  },
  // the worn look of the floor's marks, LOCK's chevron, the throw's and the vault's (systems/AimMark.js): the paint
  // goes in flakes of `run` px; of them `chip` are gone and `thin` are left at `fade` of their alpha
  worn: { chip: 0.13, thin: 0.22, fade: 0.5, run: 2 },
  // the vault's mark (Player.vaultHint; AimArt drawVaultMark), the same paint: a bar of `edge` px, `thick` px thick,
  // on the obstacle's edge and two arcs bowed the way he would go, the near one white (radii `r` about a point `back`
  // px before the edge, `span` rad and `width` px each), which hop `rise` px out and back in whole px, `rate` rad/s
  hop: { edge: 13, thick: 2, r: [7, 12], span: [1.5, 1.05], width: [2, 2], back: 2, rise: 2, rate: 8, alpha: [0.95, 0.85], seed: 3 },
  // the throw being wound up (Player.throwHold; systems/AimCue.js throwCue, AimArt drawThrow): a
  // dotted line on the floor from his hand to where the throw would stop (reach [quick, full] px, growing with the
  // charge) or to what it meets, a dot every `every` px, paler by bands; white with the man on it (LOCK's corner
  // ticks on him); solid once fully charged; a worn chevron at its end where nothing stops it
  throw: { reach: [170, 260], every: 3, bands: [0.9, 0.7, 0.5, 0.3], start: 3, chevron: 3, seed: 11 },
  // the car gun out of its arc: a short grey stub and a cross at its end
  offArc: { len: 30, on: 2, off: 3, cross: 3, alpha: 0.9 },
  // the mouse's dot (ui px at 720p)
  dot: { r: 2, edge: 1.5 },
};
