// Lamps that take turns (systems/Signals.js), by the `signal` of a prop's def (data/props.js). cycle: its steps in
// order, [the lights lit (their index in the def's `light`), s]; a prop's `phase` (level prop option, s) is how far
// into the cycle it starts.
export const SIGNALS = {
  // traffic lights (lights: 0 red, 1 amber, 2 green): green, amber, red. Red lasts as long as green and amber
  // together, so the lights of the street that crosses run the same cycle half of it later (`cross`)
  traffic: { cycle: [[[2], 7], [[1], 2], [[0], 9]], cross: 9 },
  // the works' arrow board: its three chevrons come on one after the other, hold, go dark
  arrow: { cycle: [[[0], 0.3], [[0, 1], 0.3], [[0, 1, 2], 0.5], [[], 0.4]] },
  // a barricade's two flashers
  flash: { cycle: [[[0, 1], 0.45], [[], 0.55]] },
};
