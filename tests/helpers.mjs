// Stand-ins shared by the tests (import what you need; tests/setup.mjs loads the game's modules).
//   noop   a function that does nothing
//   quiet  an object every method of which does nothing (audio, a recorder, fx): `sink` is the same one
//   ctx    a canvas 2D context that draws nothing: every method returns it, every property set is kept
export const noop = () => {};
export const quiet = new Proxy({}, { get: () => noop });
export const sink = quiet;
export const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
