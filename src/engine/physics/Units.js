// World scale contract. Every gameplay size, speed and mass should be thought of in these units.
//   1 m  = 32 px (one tile)
//   time = seconds; Matter velocities are px per 1/60 s ("px/step")
//   mass = kg, converted to Matter mass with KG
export const PX_PER_M = 32;
export const TILE = PX_PER_M; // grid cell = 1 m
export const KG = 0.0056;   // Matter mass units per kilogram (an 80 kg person = 0.45)
export const G = 9.81;      // m/s²
export const STEP = 1 / 60; // Matter's base step (s)

export const m = (meters) => meters * PX_PER_M;
// px/step <-> m/s
export const toMps = (pxPerStep) => (pxPerStep / STEP) / PX_PER_M;
export const fromMps = (mps) => mps * PX_PER_M * STEP;
