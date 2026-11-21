// The doors: how heavy a leaf is and how its hinge, its closer, its lock lamp and a hand on it behave
// (entities/Door.js, systems/Doors.js; the numbers of a hinge: engine/physics/Hinge.js). Masses in kg, torques in
// N.m, forces in N, momenta in N.s, angles in rad, angular speeds in rad/s, times in s, lengths in px (1 m = 32 px).

export const DOORS = {
  // the kinds of door, one per place (level option `kind`, levelkit door(); a locked door with none is
  // `reinforced`, a free leaf takes the kind of its sprite): its sprite (painted in tools/generate_assets.py; caps:
  // world px kept at its hinge and latch ends, the middle tiled to the leaf's length), its mass, the hinge's dry
  // friction (a torque that brakes it to a stop and that a push must beat to get it going) and its drag (share of its
  // speed lost a second): it swings on a touch after a push and slows to a stop, it never flaps on by itself.
  //   closer: on a hydraulic closer unless the level says otherwise; spring: a double-action spring hinge (a
  //   swinging door: no latch, back to the middle in a few swings, `pair`: two half-leaves in one doorway);
  //   glass: [x0, x1] the sprite's glass strip (world px), shot or struck it breaks (`broken`: the sprite without
  //   it); jamb: the frame painted in the wall's ends ('steel' / 'wood'; none: by the wall); exit: a green EXIT sign
  //   over its inside (level option `inside`); steel: it booms when it slams; bar: a push bar that clacks open
  kinds: {
    wood: { sprite: 'structure/door', kg: 30, friction: 7, drag: 0.95 },          // a plain wooden door
    reinforced: { sprite: 'structure/door_locked', kg: 55, friction: 11, drag: 1.05, jamb: 'wood' }, // straps, a lock case
    stall: { sprite: 'structure/stall_door', kg: 9, friction: 1.3, drag: 1.2 },    // a toilet stall's laminate door
    fire: { sprite: 'structure/door_fire', kg: 65, friction: 12, drag: 1, closer: true, jamb: 'steel', exit: true,
      steel: true, bar: true },                                                     // the emergency exit
    bar: { sprite: 'structure/door_bar', broken: 'structure/door_bar_broken', glass: [10, 13], kg: 40, friction: 9,
      drag: 1, closer: true, jamb: 'wood' },                                        // a bar's front: a porthole
    swing: { sprite: 'structure/door_swing', kg: 6, friction: 0.3, drag: 0.3, spring: true, pair: true, caps: [4, 6],
      jamb: 'wood' },                                                               // the toilets' cafe doors
    staff: { sprite: 'structure/door_staff', kg: 28, friction: 7, drag: 0.95, jamb: 'wood' },   // STAFF ONLY
    office: { sprite: 'structure/door_office', kg: 50, friction: 10, drag: 1.1, jamb: 'wood' }, // the boss's leather
    gaming: { sprite: 'structure/door_gaming', kg: 32, friction: 7, drag: 0.95, jamb: 'wood' }, // green, a peephole
    flat: { sprite: 'structure/door_flat', kg: 20, friction: 5, drag: 0.9, jamb: 'wood' },       // a cheap flat's
    wired: { sprite: 'structure/door_wired', broken: 'structure/door_wired_broken', glass: [8, 20], kg: 45,
      friction: 9, drag: 1, closer: true, steel: true, jamb: 'steel' },             // a corridor's fire door
    shop: { sprite: 'structure/door_shop', broken: 'structure/door_shop_broken', glass: [5, 26], kg: 35,
      friction: 7, drag: 0.95, jamb: 'steel' },                                     // a shop's glass door
  },
  caps: [8, 12],      // world px kept at the hinge and the latch end of a 32 px leaf sprite, by default

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
  jolt: 0.18,        // s the leaf is drawn jittering after a blow or a kick (not a round)
  burst: 0.32,       // rad/step the lock giving throws it open at (x the blow's power)

  // a hydraulic closer (a kind's or the level's option `closer`): it swings it back shut on its own, a spring of
  // `preload` + `k` N.m a rad open, never faster shut than `sweep` (its valve); opened past `back` rad fast it brakes
  // (`backcheck`, share a second). Over the last `zone` rad it is a damped spring about shut (`freq` rad/s, `damp`
  // its damping ratio): it overshoots a few degrees and settles in a swing or two, and only latches once slower than
  // `catch` within `near` rad of shut (its hinge's friction would hold it a hair off). It stops against a man, a body or a heavy thing in its arc and holds there. hiss: rad/s of closing over
  // which it is heard
  closer: { preload: 18, k: 10, sweep: 0.9, zone: 0.22, freq: 7, damp: 0.12, catch: 0.2, near: 0.03, back: 1.25, backcheck: 3, hiss: 0.35 },
  // a swinging door's spring hinge: a damped spring about the middle all the way (`freq`, `damp`), no latch; a
  // flap heard each time it swings through faster than `flap` rad/s
  spring: { freq: 5, damp: 0.2, flap: 1.2 },

  // a doorbell (level `buzzers`, the lab): the man rung for stands `stand` px inside the door to turn his key, and
  // waits `wait` s there before he goes back to his post
  buzzer: { stand: 16, wait: 1.5 },

  // the lamp by the lock of a door that locks: red locked, amber the moment a guard turns his key (`turn` s), green
  // unlocked (stuttering once the lock was burst). glow: px of light it throws (render/Lighting.js), k: how strong
  lamp: { colors: { locked: '#ff2a4a', turning: '#ffb02a', open: '#3dff7a' }, turn: 0.5, glow: 14, k: 0.5, core: 3 },
  // the EXIT sign over an emergency exit (kind `exit`): `size` world px, `out` px into the room from the leaf's line,
  // its green, its glow (px, strength)
  exit: { size: [8, 3], out: 13, color: '#36e070', glow: 22, k: 0.6 },
};
