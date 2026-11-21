// Stand-ins shared by the tests (import what you need; tests/setup.mjs loads the game's modules).
//   noop   a function that does nothing
//   quiet  an object every method of which does nothing (audio, a recorder, fx): `sink` is the same one
//   ctx    a canvas 2D context that draws nothing: every method returns it, every property set is kept
//   makePlayer(Player, w, type, more, enlist)  the player built by hand on a stub world w (no constructor: no
//          assets, no input): standing at the origin facing east, `type` in hand, his own update's helpers stubbed
//          (baseUpdate, unstick, updateVault); `more` over it; enlist: he is w.player and one of w.chars
export const noop = () => {};
export const quiet = new Proxy({}, { get: () => noop });
export const sink = quiet;
export const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });

export function makePlayer(Player, w, type, more = {}, enlist = false) {
  const p = Object.create(Player.prototype);
  Object.assign(p, {
    world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, recoil: 0,
    body: Matter.Bodies.circle(0, 0, 10), radius: 10, nearItem: null, slideCd: 0, winded: 0, stamina: 1, safe: { x: 0, y: 0 }, sit: 0,
    vel: { x: 0, y: 0 }, cooldown: 0, swing: 0, throwT: 0, throwDur: 0.28, throwHold: null, ammo: { '9mm': 0 }, held: null,
    lunge: null, facingLock: null, snatch: null, baseUpdate() {}, unstick() {}, updateVault: () => false,
  }, more);
  p.setWeapon(type);
  if (enlist) { w.player = p; w.chars.push(p); }
  return p;
}
