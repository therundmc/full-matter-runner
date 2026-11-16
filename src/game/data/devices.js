// The things of a level that change the situation, used (E) or broken: the bar's fire alarm and its sprinklers,
// the pool table's lamp, the stove's gas tap (a level's option, none in level 1), the jukebox turned up,
// the beer kegs and the floor they leave slippery, the passage under the street.
// Tuning only: the rules are in systems/Uses.js (what E does where), Sprinklers, Slips, LampDrop, Passage,
// Jukebox, GasValve. Distances in px unless noted (1 m = 32 px), times in s.

// what E reaches: a spot is used from within `reach` of it (its own `r` when it has one)
export const USE = { reach: 24 };

// Running on a slippery floor (a liquid kind with `slip`, LIQUIDS.kinds in data/liquids.js): the feet go. speed: px/step from
// which one is running; odds: of going down per `stride` px run on it; the player's fall: `slide` s sliding on his
// back (`speed` x his run speed, `brake` share kept per s), then `up` s getting up (he can do nothing meanwhile);
// a guard: dazed on the floor `daze` s (groggy, trying to get up: no stars), slid on `push` px/step.
export const SLIP = {
  speed: 1.7,
  stride: 14,
  odds: { player: 0.22, enemy: 0.55, civilian: 0.4 },
  player: { slide: 0.55, speed: 1.05, brake: 0.2, up: 0.45, grace: 1.2 },
  enemy: { daze: [3.6, 4.6], push: 3.6 },
  noise: 150,          // px the fall is heard at
};

// The fire alarm (level `sprinklers`: { pull: [col, row], rooms: [[col0, row0, col1, row1], ...] }): pulled (E) or
// set off by a fire or a blast in its rooms. The bell rings `ring` s (a burst every `period`, the guards around hear it
// every `call` bursts, `reach` tiles); the heads (one every `spacing` tiles over its rooms) spray `spray` s, each
// raining water (px2/s, `rate`) on the floor within `cover` px of it (systems/Liquids.js: the rooms are soaked and
// grip less); fires in the rooms die; customers run for it.
export const SPRINKLERS = {
  ring: 34, period: 0.5, call: 4, reach: 14,
  spray: 26, spacing: 3.2, rate: 520, cover: 56,
  drops: 3,            // drops a head throws a step (particles)
  late: [0.3, 1.6],    // s before each head lets go once the alarm is on
};

// The pool table's lamp (prop def `drops`): a round through its chain and it comes down, `fall` s from the ceiling to
// the table; whoever is within its footprint grown by `reach` [along, across] is crushed. It lands `shove` px along
// the round that cut it.
export const LAMP_DROP = { fall: 0.32, reach: [12, 36], shove: 10 }; // 36: it gets the man bent over the table's long side

// The stove's gas tap (prop option `valve`): open (E), the room fills: the cloud reaches `radius` px in `fill` s;
// a spark in it (a shot, a blast, a fire, metal struck by a round) blows it all: `blast` px at the stove plus
// `extra` x how full it was, and a flash of flame through the cloud.
export const GAS_VALVE = { fill: 26, radius: 130, blast: 90, extra: 70, hiss: 0.55, shimmer: 0.12, min: 0.15 };

// The jukebox turned up (E, prop type `jukebox` powered and on its record): `dur` s loud, its band heard (Music),
// the beat flashing its light; what is quieter than a door (footsteps, bodies, things knocked over) is not heard by
// the guards within `cover` px of it (radius x `mask`). Again `again` s after it is back down.
export const JUKEBOX = { dur: 20, cover: 330, mask: 0.15, masked: ['footsteps', 'body', 'noise', 'door', 'thrown', 'clatter'], again: 8, beat: 60 / 126 };

// The passage under the street (level `passage`: [[col, row], [col, row]]): E at one trapdoor, down in `down` s
// (dark from `dark`), along it `under` s, up the other in `up` s.
export const PASSAGE = { down: 0.55, under: 0.9, up: 0.55, reach: 20 };
