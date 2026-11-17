// The doors: how heavy a leaf is and how its hinge, its closer, its lock lamp and a hand on it behave
// (entities/Door.js, systems/Doors.js; the numbers of a hinge: engine/physics/Hinge.js). Masses in kg, torques in
// N.m, forces in N, momenta in N.s, angles in rad, angular speeds in rad/s, times in s, lengths in px (1 m = 32 px).

export const DOORS = {
  // the leaf by its sprite: its mass, the hinge's dry friction (a torque that brakes it to a stop, and that a push
  // must beat to get it going) and its drag (share of its speed lost a second): it swings when pushed and slows to
  // a stop, it never flaps on by itself
  kinds: {
    wood: { kg: 30, friction: 9, drag: 1.2 },     // a solid wooden door
    reinforced: { kg: 55, friction: 14, drag: 1.4 }, // the leaf of a door that locks: steel straps, a lock case
    stall: { kg: 9, friction: 1.6, drag: 1.6 },   // a toilet stall's laminate door
  },
  sprites: { 'structure/door': 'wood', 'structure/door_locked': 'reinforced', 'structure/stall_door': 'stall' },

  // leaning into it (systems/Doors.js, like furniture: PropPhysics): the force a man puts into it, `walk` from a
  // stroll up to `run` at the player's run (PLAYER.speed); he is held to the speed the leaf really goes, so a heavy
  // leaf takes a moment and a run bursts it open harder. stick: x its dry friction to get it going from rest
  push: { walk: 260, run: 1800, stick: 1.5 },

  // its end stops: how far it opens either side of shut, what is left of its speed bouncing off one, the slow-down
  // the last `cushion` rad before it; a warped door opens `warp` less at worst. stopped: what is left of its speed
  // when it stops against a man in its way
  stop: { swing: 1.75, bounce: 0.15, cushion: 0.25, warp: 0.25, stopped: 0.1 },

  // shutting: crossing shut slower than `catch` it latches (a click); faster it swings through. A latched leaf
  // stays shut against knocks under `hold` N.m (a push on it beats that at once)
  latch: { catch: 2.4, hold: 20 },

  // blows on it (Door.hit), N.s along the blow where it lands: a round (per point of damage: a 7.62 counts 3), a
  // melee blow, a kick. A round barely turns it, a heavy one a little; a kick or a bat slams it open
  hits: { bullet: 2.5, melee: 45, kick: 80 },
  burst: 0.32,       // rad/step the lock giving throws it open at (x the blow's power)

  // a hydraulic closer (level option `closer`): it swings it back shut on its own, a spring of `preload` + `k` N.m a
  // rad open, never faster shut than `sweep` (its valve) but for the last `latchZone` rad at `latchSpeed` (it
  // snaps the latch); opened past `back` rad fast it brakes (`backcheck`, share a second). It stops against a man,
  // a body or a heavy thing in its arc and holds there. hiss: rad/s of closing over which it is heard
  closer: { preload: 18, k: 10, sweep: 0.9, latchZone: 0.14, latchSpeed: 1.5, back: 1.25, backcheck: 3, hiss: 0.35 },

  // E at a door (systems/Uses.js spot at the leaf's middle, within `reach`): shut (under `shut` rad off), it is
  // swung `open` rad away from him; open, it is pulled to. The hand on it drives it at most `speed`, with `force`
  // at most, for `dur` at most, and lets go once the leaf is further than `hand` from him (it goes on by itself);
  // pulled to, it comes at `latch` at least till it latches; in its way, he steps back `back` px a step, away from
  // the hinge
  use: { reach: 26, shut: 0.2, open: 1.45, speed: 3.2, gain: 5, latch: 0.9, force: 320, dur: 1.2, hand: 30, back: 1.2 },

  // a doorbell (level `buzzers`, the lab): the man rung for stands `stand` px inside the door to turn his key, and
  // waits `wait` s there before he goes back to his post
  buzzer: { stand: 16, wait: 1.5 },

  // the lamp by the lock of a door that locks: red locked, amber the moment a guard turns his key (`turn` s), green
  // unlocked (stuttering once the lock was burst). glow: px of light it throws (render/Lighting.js), k: how strong
  lamp: { colors: { locked: '#ff2a4a', turning: '#ffb02a', open: '#3dff7a' }, turn: 0.5, glow: 14, k: 0.5, core: 3 },
};
