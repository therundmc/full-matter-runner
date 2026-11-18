// WebAudio sound system: recordings wherever a real thing makes the noise, a little synthesis under them, mixed
// through a small mastering chain.
//   - gunshots: recorded shots (SAMPLES / SHOTS) over synthesized bass and room layers (GUNS, see _gun)
//   - impacts and breaks of props, flesh, reloads, casings, voices, water: cuts of the recorded foley bank (bank.js,
//     built by tools/build_sounds.mjs), layered per sound in FOLEY and / or by a `_<name>` method
//   - the body and its moves, hands and objects, doors, small things: physically modelled foley (Foley.js recipes
//     rendered by Synth.js), a few variations of each baked once into buffers and played with live variations
//   - noise-based synthesis where nothing else fits: blast bodies, the car alarm, the far-off sirens
//   - a vehicle driven live (motor: the getaway van), its engine, gearbox and tyres following it every frame (Motor.js)
//   - the beds of the night (setAmbience, driven by systems/Ambience.js): long loops rendered once by Beds.js (the
//     city, a room talking, a radio, what hums, the traffic's engines...), each voice with its own level, tone, side,
//     speed; and the far city's long one-shots rendered the same way (a train, a dog, a car alarm: _cue)
//
// The mix (LEVELS: one reference level per bus, a close recorded gunshot being the loudest thing there is). Bus chain
// (all created in _build):
//   guns  -> drive (tanh) -> gun level -> sfx              (synthesized shots)
//   voice -> HP 110 Hz -> presence -> sfx                  (shouts, cries, screams: META bus 'voice')
//   shots -> HP 35 Hz -> low shelf -> high shelf ----------+   (recorded shots: no drive, full crack)
//   sfx   -> HP 30 Hz -> low shelf -> low-mid cut -> presence -+-> mix -> glue compressor ---+
//   sfx + shots + ambience -> the rooms (ROOMS: an impulse each, its size, pre-delay, decay and damping; the street's  |
//       slap off the facades; crossfaded by place) -> mix                                                            |
//   per-voice sends -> hall (gunfire, far sounds, the kill's boom) -> mix                                            |
//   amb (the beds: per voice gain -> lowpass -> pan) + ambOne (opts.amb one-shots) -> ambience volume -> EQ ---------+
//       (round the glue: gunfire never pumps the night)                                                             |
//   music -> HP 28 Hz -> duck (held dip while it is loud) -> dip (a vehicle roaring) -> its own compressor ----+-> bus
//   bus -> filter (lowpass: slow motion / death muffle) -> soft clip (linear under its knee, oversampled)
//       -> limiter (peaks only, slow release: never pumps) -> master -> destination
// The music has its own compressor so that gunfire never pumps it: only the duck moves it, slowly.
//
// Space: each positional voice is panned, loses level and highs with distance while more of it goes to the hall,
// and is duller and quieter behind a wall (`occ`, set by World.sound).
//
// META (per sound) drives voice admission: rate limit, per-name cap, global cap with voice stealing, music ducking,
// how far it carries and its place in the mix. Reload / handling sounds take `weapon` (a weapon id) to pick that
// gun's parts (ARMS); voices take `pitch` (one per character).
import { rand, clamp } from '../engine/math.js';
import { BANK, BANK_URL } from './bank.js';
import { RECIPES, formOf } from './Foley.js';
import { render } from './Synth.js';
import { BEDS, renderBed, renderLaugh } from './Beds.js';
import { VOICE, v8Cycle, cycleHz } from './Motor.js';

// The mix: each bus's level (measured headless: the reference loudness of each in the street, the bar and a fight is
// in the report of the 2026-11-15 mix pass). Guns and impacts punch, voices read, the music drives the fights, the
// night sits well under all of it (its beds about 10 dB under the music at rest, its small sounds on top of them).
export const LEVELS = {
  master: 0.8,
  music: 0.6,    // the soundtrack (audio/Music.js), its own compressor after it
  sfx: 0.72,     // the effects: impacts, bodies, foley, the synthesized layers of the guns; under the guns and the music
  guns: 0.37,    // gunfire against everything else: loud, but under the master's clip so that bursts stay clean
  shots: 0.65,   // the recorded shots, times `guns`
  voice: 1.12,   // voices into the effects, after their own presence EQ
  beds: 0.11,    // the beds of the night (Ambience: data/soundscape.js gives each its level on this bus)
  ambOne: 0.3,   // the small sounds of the night and of the far city (opts.amb one-shots, their META gain on top)
};

// kill confirm: the semitones over its lowest note that its tone climbs over a chain, one step per kill (a minor
// pentatonic scale: a run of kills plays a rising line)
const CONFIRM_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const CONFIRM_ROOT = 196; // Hz
// and under it the reward, a deep boom: [start Hz, end Hz, s, level] of its sine, of its upper body (a triangle, for
// small speakers), and [lowpass Hz, s, level] of the low air after it
const CONFIRM_BOOM = { sub: [78, 41, 0.62, 0.4], body: [150, 82, 0.16, 0.15], air: [320, 0.5, 0.12] };
// formants (Hz) of the vowels the synthesized voices speak (m: a closed-mouth hum)
// A 1980s car horn (the old one was "a truck": two low saw notes, kept dark, held long): two disc horns a major third
// apart (`notes` Hz, each a few `cents` off the other's beat), a square's odd harmonics through a soft clip (`drive`,
// a little lopsided by `bias`: the diaphragm's rattle) for the buzz, two highpass stages that thin the fundamentals
// (`hp` Hz), the nasal band of the horn's trumpet (`band`: Hz, Q, dB) and a top cut (`lp`). It speaks in `attack` s and stops in
// `release` s. Beeps: `beep` s each with `space` between them (a driver held up: two or three), or one `held` s
// (opts.honks 1); `level`: its gain.
const HORN = {
  notes: [420, 525], cents: 4, drive: 2.6, bias: 0.12, hp: 620, band: [2200, 0.9, 9], lp: 6000,
  attack: 0.006, release: 0.03, beep: [0.11, 0.16], space: [0.08, 0.12], held: [0.3, 0.45], level: 0.26,
};
const VOWEL = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], m: [250, 1100, 2100] };
const STEP_LEVEL = 0.2; // footsteps, far under everything else (the user: quiet, not too loud; 0: none at all)
const VARIATIONS = 5;   // baked renders of each synthesized foley form
const PREBAKE = [3, 0.03]; // s after the unlock the background baking starts; s between two renders without idle callbacks
// names that map onto another sound
const ALIAS = { impact: 'stone' };

// Voice admission and mix per sound. pri: steal priority; dur: seconds a play stays "active"; gap: min seconds
// between two plays (a louder one may break it); max: simultaneous plays of that name; duck: music gain dip
// (1 = none); reach: px at which it fades out (loud sounds carry further, losing their highs on the way);
// gain: level in the mix (a close gunshot is the reference; handling noises sit far under it).
const DEFAULT_META = { pri: 1, dur: 0.3, gap: 0.025, max: 4, duck: 1, gain: 1 };
export const META = {
  explosion: { pri: 4, dur: 2.6, gap: 0.12, max: 2, duck: 0.45, reach: 3400, gain: 0.5 },
  pistol: { pri: 3, dur: 0.45, gap: 0, duck: 0.75, reach: 2600 },
  uzi: { pri: 3, dur: 0.25, gap: 0, duck: 0.8, reach: 2400 },
  silenced: { pri: 2, dur: 0.2, gap: 0, reach: 1100 },
  shotgun: { pri: 4, dur: 1.0, gap: 0, max: 3, duck: 0.65, reach: 3000 },
  rifle: { pri: 3, dur: 0.7, gap: 0, duck: 0.72, reach: 3000 },
  sniper: { pri: 4, dur: 1.6, gap: 0, max: 2, duck: 0.6, reach: 3400 },
  rocket: { pri: 3, dur: 0.9, gap: 0.1, max: 2, duck: 0.7, reach: 3000 },
  // impacts (one per material) and what gives way
  wood: { gain: 0.6 }, metal: { gain: 0.55 }, stone: { gain: 0.6 }, plastic: { gain: 0.7 }, soft: { gain: 0.6 },
  ceramic: { gain: 0.55 }, glassHit: { gain: 0.5 }, flesh: { gain: 0.7 },
  // the clutter on the furniture (placeholders, assets/sound/PLACEHOLDERS.md): many at once when a table goes over
  clutterClink: { gap: 0.03, max: 3, gain: 0.4 }, clutterShatter: { pri: 2, dur: 0.5, gap: 0.03, max: 3, gain: 0.55 },
  clutterBottle: { gap: 0.05, max: 2, gain: 0.45 }, clutterAshtray: { gap: 0.05, max: 2, gain: 0.45 },
  clutterChips: { gap: 0.08, max: 2, gain: 0.4 }, clutterTill: { pri: 2, dur: 0.5, gap: 0.1, max: 1, gain: 0.7 },
  clutterPaper: { gap: 0.15, max: 1, gain: 0.3 },
  // the VIP room's (placeholders too): the bills on the floor lifted, a flute, the champagne bucket
  cashFlutter: { gap: 0.2, max: 1, gain: 0.25 }, fluteClink: { gap: 0.04, max: 2, gain: 0.35 },
  fluteShatter: { pri: 2, dur: 0.4, gap: 0.04, max: 2, gain: 0.5 }, bucketKnock: { pri: 2, dur: 0.6, gap: 0.1, max: 1, gain: 0.6 },
  woodBreak: { pri: 2, dur: 0.6, gap: 0.05, max: 3, gain: 0.85 },
  flip: { pri: 2, dur: 0.6, gap: 0.2, max: 2, gain: 0.8 },
  binTip: { pri: 2, dur: 0.7, gap: 0.15, max: 2, gain: 0.75 },
  binLid: { pri: 1, dur: 0.4, gap: 0.1, max: 2, gain: 0.6 },
  metalBreak: { pri: 2, dur: 0.6, gap: 0.05, max: 3, gain: 0.8 },
  ceramicBreak: { pri: 2, dur: 0.5, gap: 0.05, max: 3, gain: 0.75 },
  plasticBreak: { pri: 2, dur: 0.4, gap: 0.05, max: 3, gain: 0.7 },
  softBreak: { pri: 2, dur: 0.4, gap: 0.05, max: 3, gain: 0.8 },
  glass: { pri: 2, dur: 0.8, gap: 0.05, max: 3, gain: 0.8 },
  crumble: { pri: 3, dur: 1.0, gap: 0.08, max: 2, duck: 0.75, gain: 0.7 },
  doorBreak: { pri: 3, dur: 0.7, gap: 0.1, max: 2, duck: 0.75, gain: 0.9 },
  tirePop: { pri: 3, dur: 0.8, gap: 0.1, max: 2, duck: 0.8 },
  carHit: { pri: 2, dur: 0.4, gap: 0.04, max: 3, gain: 0.8 },
  vanScrape: { pri: 1, dur: 0.35, gap: 0.1, max: 2, gain: 0.5 }, vanShove: { pri: 2, dur: 0.4, gap: 0.2, max: 1, gain: 0.7 },
  vanCrash: { pri: 3, dur: 1.2, gap: 0.3, max: 1, gain: 1, duck: 0.8 },
  // ... the getaway in an open car (World.stepOutro): placeholders (assets/sound/PLACEHOLDERS.md)
  doorVault: { pri: 1, dur: 0.3, gap: 0.2, max: 1, gain: 0.3 }, seatDrop: { pri: 1, dur: 0.3, gap: 0.2, max: 1, gain: 0.35 },
  hatFly: { pri: 0, dur: 0.3, gap: 0.3, max: 1, gain: 0.2 }, seatGun: { pri: 1, dur: 0.3, gap: 0.3, max: 1, gain: 0.35 },
  lorryBeep: { pri: 3, dur: 0.15, gap: 0.2, max: 1, gain: 0.7 }, lorryBrake: { pri: 2, dur: 0.5, gap: 0.3, max: 1, gain: 0.6 },
  awningRip: { pri: 1, dur: 0.4, gap: 0.15, max: 2, gain: 0.6 }, tyreSkid: { pri: 1, dur: 0.4, gap: 0.35, max: 1, gain: 0.45 },
  waterSpray: { pri: 0, dur: 0.3, gap: 0.25, max: 1, gain: 0.4 },
  tellClick: { pri: 2, dur: 0.2, gap: 0.15, max: 1, gain: 0.6 }, pursuerWreck: { pri: 3, dur: 1, gap: 0.2, max: 2, gain: 0.9 },
  // flesh and voices
  gore: { pri: 3, dur: 0.8, gap: 0.05, max: 3, duck: 0.85 },
  death: { pri: 4, dur: 1.0, gap: 0.3, max: 1, duck: 0.5, gain: 0.8 },
  splat: { pri: 2, dur: 0.3, gap: 0.03, gain: 0.85 },
  slash: { pri: 2, dur: 0.3, gap: 0.04, max: 3, duck: 0.9, gain: 0.95 },
  punch: { pri: 3, dur: 0.35, gap: 0.04, max: 3, duck: 0.85, gain: 1 },
  bodyFall: { pri: 1, dur: 0.4, gap: 0.05, max: 3, gain: 0.55 },
  shout: { pri: 2, dur: 0.5, gap: 0.5, max: 2, gain: 0.75, reach: 1900, bus: 'voice' },
  cry: { pri: 2, dur: 0.6, gap: 0.12, max: 3, gain: 0.65, reach: 1900, bus: 'voice' },
  grab: { pri: 2, dur: 0.4, gain: 0.7 }, neck: { pri: 3, dur: 0.6, gain: 0.95 },
  // a head driven into a wall, an edge, a sink, a urinal, a toilet (placeholders, assets/sound/PLACEHOLDERS.md)
  headSlamWood: { pri: 3, dur: 0.45, gap: 0.05, max: 2, duck: 0.85, gain: 0.95 },
  headSlamWall: { pri: 3, dur: 0.45, gap: 0.05, max: 2, duck: 0.85, gain: 0.95 },
  headSlamMetal: { pri: 3, dur: 0.45, gap: 0.05, max: 2, duck: 0.85, gain: 0.9 },
  headSlamPorcelain: { pri: 3, dur: 0.45, gap: 0.05, max: 2, duck: 0.85, gain: 0.9 },
  toiletDunk: { pri: 3, dur: 0.5, gap: 0.05, max: 2, duck: 0.85, gain: 0.9 },
  whimper: { pri: 1, dur: 0.5, gap: 1.2, max: 1, gain: 0.5, reach: 1200, bus: 'voice' },
  // a crowd: several at once, each his own cry, carried by the room (the user: a bit loud and a bit often: -4.7 dB
  // since 2026-11-16, never more than four at once, a little apart)
  scream: { pri: 3, dur: 1.1, gap: 0.12, max: 4, gain: 0.32, reach: 2000, hall: 0.22, bus: 'voice' },
  mutter: { pri: 1, dur: 0.6, gap: 0.8, max: 1, gain: 0.5, reach: 900, bus: 'voice' },
  pant: { pri: 1, dur: 0.45, gap: 0.1, max: 3, gain: 0.36, reach: 800, bus: 'voice' },
  sob: { pri: 1, dur: 0.8, gap: 0.5, max: 2, gain: 0.42, reach: 700, bus: 'voice' },
  // doors, movement
  door: { dur: 0.3, gap: 0.08, max: 2, gain: 0.34 },
  doorSlam: { pri: 3, dur: 0.5, gap: 0.06, max: 2, duck: 0.85, gain: 0.4 },
  creak: { dur: 0.6, gap: 0.2, max: 2, gain: 0.5 },
  // the body and its moves (synthesized: Foley.js)
  vault: { dur: 0.5, gap: 0.15, max: 3, gain: 0.38 }, dive: { pri: 2, dur: 0.6, gap: 0.2, max: 2, gain: 0.49 },
  climb: { pri: 2, dur: 0.75, gap: 0.2, max: 2, gain: 0.47 }, hipSlide: { dur: 0.5, gap: 0.15, max: 2, gain: 0.41 },
  slide: { pri: 2, dur: 0.55, gap: 0.2, max: 2, gain: 0.47 }, roll: { pri: 2, dur: 0.45, gap: 0.2, max: 2, gain: 0.45 },
  rollUp: { dur: 0.25, gap: 0.15, max: 2, gain: 0.6 }, getUp: { dur: 0.6, gap: 0.5, max: 1, gain: 0.3 },
  rung: { dur: 0.25, gap: 0.06, max: 2, gain: 0.33 }, ledge: { dur: 0.5, gap: 0.3, max: 2, gain: 0.31 },
  step: { pri: 0, dur: 0.12, gap: 0.03, max: 4, gain: STEP_LEVEL, reach: 700 },
  drag: { pri: 0, dur: 0.6, gap: 0.4, max: 2, gain: 0.25 },
  // hands and objects
  swing: { dur: 0.25, gap: 0.05, max: 3, gain: 0.45 }, throw: { dur: 0.4, gap: 0.1, max: 2, gain: 0.25 },
  drop: { pri: 0, dur: 0.4, gap: 0.05, max: 3, gain: 0.5 }, clubHit: { pri: 2, dur: 0.3, gap: 0.04, max: 3, gain: 1 },
  trunk: { dur: 0.45, gap: 0.3, max: 1, gain: 0.32 }, chairScrape: { pri: 0, dur: 0.4, gap: 0.1, max: 2, gain: 0.22 },
  flutter: { pri: 1, dur: 0.5, gap: 0.25, max: 2, gain: 0.45 },
  // loose furniture dragged or rolled along the floor (systems/PropPhysics.js): placeholders, assets/sound/PLACEHOLDERS.md
  scrapeWood: { pri: 0, dur: 0.35, gap: 0.12, max: 3, gain: 0.3 }, scrapeMetal: { pri: 0, dur: 0.35, gap: 0.12, max: 3, gain: 0.3 },
  scrapePlastic: { pri: 0, dur: 0.35, gap: 0.12, max: 3, gain: 0.3 }, scrapeCeramic: { pri: 0, dur: 0.35, gap: 0.12, max: 3, gain: 0.3 },
  dragSoft: { pri: 0, dur: 0.35, gap: 0.12, max: 2, gain: 0.3 }, rollMetal: { pri: 0, dur: 0.4, gap: 0.12, max: 2, gain: 0.3 },
  splash: { pri: 0, dur: 0.3, gap: 0.06, max: 3, gain: 0.6 },
  pool: { pri: 0, dur: 0.3, gap: 0.2, max: 2, gain: 0.33 },
  clack: { pri: 0, dur: 0.12, gap: 0.04, max: 3, gain: 1 }, pocket: { pri: 0, dur: 0.3, gap: 0.1, max: 2, gain: 0.5 },
  coin: { pri: 0, dur: 0.6, gap: 0.1, max: 2, gain: 0.21 },
  ding: { pri: 1, dur: 0.4, gap: 0.3, max: 1, gain: 0.6 }, derail: { pri: 2, dur: 1.2, gap: 1, max: 1, gain: 0.95 },
  // weapons in the hands
  ricochet: { dur: 0.3, gap: 0.05, max: 3, gain: 0.8 },
  shell: { pri: 0, dur: 0.15, gap: 0.02, max: 4, gain: 0.4 }, // a spent case touching down (one play per touchdown)
  magOut: { dur: 0.35, gap: 0.05, max: 3, gain: 0.45 },
  magLand: { pri: 0, dur: 0.4, gap: 0.05, max: 3, gain: 0.45 },
  magIn: { dur: 0.35, gap: 0.05, max: 3, gain: 0.45 },
  rack: { dur: 0.5, gap: 0.05, max: 3, gain: 0.45 },
  shellIn: { dur: 0.5, gap: 0.03, max: 3, gain: 0.42 },
  handle: { dur: 0.5, gap: 0.05, max: 3, gain: 0.35 },
  pickup: { dur: 0.5, gap: 0.05, max: 3, gain: 0.3 },
  // placeholders for a bought library (assets/sound/PLACEHOLDERS.md): bank cuts standing in, kept low
  holster: { pri: 0, dur: 0.3, gap: 0.08, max: 2, gain: 0.22 },
  sling: { pri: 0, dur: 0.4, gap: 0.1, max: 2, gain: 0.22 },
  doorPush: { pri: 0, dur: 0.3, gap: 0.15, max: 2, gain: 0.25 },
  doorLatch: { pri: 0, dur: 0.2, gap: 0.1, max: 2, gain: 0.3 },
  pushBar: { pri: 0, dur: 0.25, gap: 0.15, max: 2, gain: 0.35 },
  doorFlap: { pri: 0, dur: 0.25, gap: 0.12, max: 2, gain: 0.3 },
  doorBoom: { pri: 3, dur: 0.6, gap: 0.08, max: 2, duck: 0.85, gain: 0.45 },
  doorCloserHiss: { pri: 0, dur: 0.6, gap: 0.4, max: 1, gain: 0.12 },
  lockBeep: { pri: 0, dur: 0.15, gap: 0.2, max: 1, gain: 0.25 },
  cloth: { pri: 0, dur: 0.2, gap: 0.12, max: 2, gain: 0.1 },
  scuff: { pri: 0, dur: 0.15, gap: 0.06, max: 2, gain: 0.12 },
  // ... what a finisher or a takedown does to a man (data/finishers.js)
  kneeShot: { pri: 2, dur: 0.3, gap: 0.04, max: 2, gain: 0.8 }, boneCrack: { pri: 2, dur: 0.3, gap: 0.04, max: 2, gain: 0.85 },
  stomp: { pri: 3, dur: 0.35, gap: 0.04, max: 2, duck: 0.85, gain: 0.95 }, skullSlam: { pri: 3, dur: 0.35, gap: 0.04, max: 2, duck: 0.85, gain: 0.95 },
  throatCut: { pri: 2, dur: 0.4, gap: 0.05, max: 2, gain: 0.8 }, bladeTwist: { pri: 2, dur: 0.3, gap: 0.05, max: 2, gain: 0.7 },
  handPlant: { pri: 0, dur: 0.2, gap: 0.1, max: 2, gain: 0.2 },
  vaultSwish: { pri: 0, dur: 0.3, gap: 0.15, max: 2, gain: 0.14 },
  landThud: { pri: 0, dur: 0.3, gap: 0.1, max: 2, gain: 0.22 },
  slideScrape: { pri: 0, dur: 0.5, gap: 0.2, max: 1, gain: 0.12 },
  kickWhoosh: { pri: 1, dur: 0.25, gap: 0.15, max: 2, gain: 0.3 },
  kickHit: { pri: 3, dur: 0.4, gap: 0.08, max: 2, duck: 0.85, gain: 0.95 },
  // the player's weapon giving out, a dead man's weapon snatched (Character.breakWeapon, Player.grab)
  batSnap: { pri: 3, dur: 0.5, gap: 0.05, max: 2, duck: 0.85, gain: 0.95 },
  knifeSnap: { pri: 2, dur: 0.35, gap: 0.05, max: 2, gain: 0.85 },
  snatch: { pri: 1, dur: 0.35, gap: 0.1, max: 2, gain: 0.5 },
  hoodLean: { pri: 0, dur: 0.4, gap: 0.5, max: 1, gain: 0.2 },
  click: { dur: 0.12, gap: 0.05, max: 3, gain: 0.7 },
  ammo: { dur: 0.4, gap: 0.05, max: 2, gain: 0.4 },
  // fire, alarm, UI, street
  alarm: { pri: 1, dur: 0.4, gap: 0.2, max: 2, reach: 1700, gain: 0.2 },
  shopAlarm: { pri: 1, dur: 0.56, gap: 0.3, max: 2, reach: 1500, gain: 0.15 },
  // the level's devices (data/devices.js): the bar's fire bell
  fireBell: { pri: 1, dur: 0.5, gap: 0.3, max: 1, reach: 1600, gain: 0.17 },
  siren: { pri: 0, dur: 4.6, gap: 1.5, max: 2, gain: 0.05, hall: 0.7 },
  crackle: { pri: 0, dur: 0.3, gap: 0.08, max: 2, gain: 0.3 },
  ignite: { pri: 2, dur: 0.6, gap: 0.1, max: 2, gain: 0.6 },
  match: { pri: 2, dur: 0.8, gap: 0.3, max: 1, gain: 0.7 },
  // the flat on fire (placeholders, assets/sound/PLACEHOLDERS.md): the man's laugh, the front running along the
  // petrol, the roar of a room burning, a pane cracking in the heat
  arsonLaugh: { pri: 3, dur: 1.2, gap: 1, max: 1, gain: 0.8, reach: 1900, bus: 'voice' },
  fireRun: { pri: 2, dur: 0.5, gap: 0.3, max: 2, gain: 0.55 },
  fireRoar: { pri: 1, dur: 0.9, gap: 0.6, max: 2, gain: 0.4 },
  heatCrack: { pri: 2, dur: 0.4, gap: 0.2, max: 2, gain: 0.6 },
  // the title (ui/title/Beats.js; placeholders, assets/sound/PLACEHOLDERS.md), under the menu's music: the poster's
  // fire and its rain in overlapping pieces, the sign's buzz as a letter fails, the marker crossing a dead man out
  titleFire: { pri: 0, dur: 1.6, gap: 0.9, max: 3, gain: 0.16, hall: 0.25 },
  titleRain: { pri: 0, dur: 1.2, gap: 0.6, max: 3, gain: 0.1, hall: 0.2 },
  neonBuzz: { pri: 0, dur: 0.2, gap: 0.12, max: 2, gain: 0.12 },
  markerStroke: { pri: 2, dur: 0.4, gap: 0.2, max: 2, gain: 0.6 },
  hiss: { pri: 2, dur: 0.3, gap: 0.12, max: 2, gain: 0.5 },
  // a boss's beats (entities/Boss.js; placeholders, assets/sound/PLACEHOLDERS.md): his name card slammed in, his howl
  // at the first hit, his roar, the player thrown off, his death, his shades on the floor
  bossCard: { pri: 3, dur: 0.6, gap: 1, max: 1, gain: 0.8, reach: 1900 },
  bossHowl: { pri: 3, dur: 0.9, gap: 0.5, max: 1, gain: 0.9, bus: 'voice' },
  bossRoar: { pri: 3, dur: 1, gap: 0.6, max: 1, gain: 0.85, bus: 'voice' },
  bossShake: { pri: 2, dur: 0.4, gap: 0.3, max: 1, gain: 0.7 },
  bossDeath: { pri: 3, dur: 1.2, gap: 1, max: 1, gain: 0.9, bus: 'voice' },
  shadesDrop: { pri: 1, dur: 0.2, gap: 0.05, max: 2, gain: 0.4 },
  // the kill's reward: a new one chokes the boom of the last (a chain never muds), the music dips under it
  confirm: { pri: 4, dur: 0.6, gap: 0.03, max: 2, duck: 0.8, gain: 0.8, hall: 0.06, choke: true },
  clear: { pri: 3, dur: 1.6, gap: 0.5, max: 1, duck: 0.6, gain: 0.4 },
  ui: { pri: 3, dur: 0.15, gap: 0.05, max: 2, gain: 0.7 },
  passby: { pri: 0, dur: 3, gap: 0.15, max: 3 },
  crank: { pri: 3, dur: 0.6, gap: 0.5, max: 1, gain: 0.45, reach: 2000 }, // a starter turning an engine over (the getaway)
  // the night around (systems/Ambience.js; its beds are not voices, see setAmbience): the city's swell of the opening
  // cinematic, the wind, drops, and the life of the bar and its toilets; far under the rest, the first dropped in a fight.
  // The far city (soundscape CITY): a police car crossing it, the elevated train, a car alarm, a dog; long, quiet, wet.
  farSiren: { pri: 0, dur: 15, gap: 20, max: 1, gain: 0.135, hall: 0.45 },
  train: { pri: 0, dur: 22, gap: 30, max: 1, gain: 0.35, hall: 0.3 },
  farAlarm: { pri: 0, dur: 9, gap: 30, max: 1, gain: 0.025, hall: 0.45 },
  dog: { pri: 0, dur: 4, gap: 8, max: 1, gain: 0.1, hall: 0.4 },
  air: { pri: 0, dur: 9, gap: 2, max: 3, gain: 0.1 },
  gust: { pri: 0, dur: 3.6, gap: 2, max: 2, gain: 0.22 },
  drip: { pri: 0, dur: 0.3, gap: 0.2, max: 2, reach: 300, gain: 0.18 },
  clink: { pri: 0, dur: 0.5, gap: 0.6, max: 2, reach: 700, gain: 0.26 },
  ice: { pri: 0, dur: 0.6, gap: 1, max: 1, reach: 600, gain: 0.22 },
  laugh: { pri: 0, dur: 1.2, gap: 3, max: 1, reach: 900, gain: 0.3, hall: 0.06 },
  pour: { pri: 0, dur: 1.6, gap: 1, max: 1, reach: 600, gain: 0.3 },
  bottle: { pri: 0, dur: 0.4, gap: 0.4, max: 1, reach: 700, gain: 0.35 },
  till: { pri: 0, dur: 1.2, gap: 2, max: 1, reach: 700, gain: 0.25 },
  cistern: { pri: 0, dur: 3.5, gap: 3, max: 1, reach: 500, gain: 0.3 },
  horn: { pri: 2, dur: 1, gap: 1.2, max: 2, gain: 0.5, reach: 1400, hall: 0.25 },
};
for (const k in META) META[k] = { ...DEFAULT_META, ...META[k] };
const GLOBAL_SOFT_CAP = 26; // above this, only louder / higher priority sounds get in (stealing the quietest)
const GLOBAL_HARD_CAP = 40;
const NEAR = 520, FAR = 1900; // px: distance muffling starts at NEAR and is full at FAR (whatever the reach)
const PAN = 520;              // px to the side for a sound to sit fully on that side
const GUN_HALL = 0.16;        // share of every gunshot sent to the hall (META `hall` for the other sounds)
const FAR_HALL = 0.3;         // more of it for what is far away: distance is heard as space, not only as level
const OCCLUDED = [0.6, 1100]; // behind a wall: level factor, lowpass (Hz)
const DUCK_HOLD = 0.25, DUCK_RELEASE = 0.3; // s: the music stays down through a burst, then comes back slowly
const CHOKE = 0.05; // s: how fast a shooter's previous shot fades under his next one

// The rooms everything but the music is heard in (systems/Ambience.js crossfades them by place): what each source
// sends into it (sfx: the effects and the voices; shots: recorded gunfire; amb: the night's beds and small sounds) and
// its impulse (see _room): pre-delay s, RT60 s, damping (Hz the tail starts at before its highs die away) and size
// (spacing of the early reflections, 1 = the bar). Out of doors a short dark wash, and the facades across the street
// throw a slap back ([delay s, level], low-passed). Until told otherwise everything is in the warm one.
const ROOMS = {
  open: { sfx: 0.1, shots: 0.09, amb: 0.05, ir: { pre: 0.025, rt: 0.9, damp: 2600, size: 2.4 }, slap: [[0.085, 0.36], [0.155, 0.2], [0.27, 0.09]] },
  warm: { sfx: 0.2, shots: 0.1, amb: 0.24, ir: { pre: 0.012, rt: 1.1, damp: 4200, size: 1 } },
  small: { sfx: 0.15, shots: 0.08, amb: 0.14, ir: { pre: 0.004, rt: 0.45, damp: 5200, size: 0.5 } },
  tiled: { sfx: 0.26, shots: 0.14, amb: 0.22, ir: { pre: 0.003, rt: 1.0, damp: 9000, size: 0.6 } },
};
const HALL = { pre: 0.03, rt: 2.6, damp: 3200, size: 3 }; // the city's space behind gunfire and far sounds
const SLAP_TONE = 2500; // Hz: the facades give back no highs
// The beds (setAmbience)
const BED_TAU = 0.12;   // s: how fast a voice follows its level, tone, side and speed (the mix comes ~10 times a second)
const BED_HOLD = 0.6;   // s a voice keeps its level without a new mix (pause, menu, a level left), then fades out
const BED_IDLE = 6;     // s a silent voice keeps its loop running before it is let go
const BED_FLOOR = 1e-4; // under this a voice is silent

// Recordings. Gunshots: assets/sound/shots, CC BY 3.0 Michel Baradari; foley: the bank (CC0, assets/sound/CREDITS.md).
const SAMPLES = {
  pistol: 'assets/sound/shots/pistol.wav',
  rifle: 'assets/sound/shots/rifle.wav',
  shotgun: 'assets/sound/shots/shotgun.wav',
  uzi: 'assets/sound/shots/cg1.wav',
  foley: BANK_URL,
};
// Per gun sound: recording, one clean shot cut out of it [offset s, length s] (the rifle file is a whole burst),
// playback rate, level, and how much of the synthesized layers stays under it (bass and room only).
const SHOTS = {
  pistol: { key: 'pistol', cut: [0, 0.5], rate: 1, vol: 1.0, under: 0.45 },
  uzi: { key: 'uzi', cut: [0, 0.22], rate: 1, vol: 0.9, under: 0.32 },
  shotgun: { key: 'shotgun', cut: [0, 0.45], rate: 0.94, vol: 1.15, under: 0.55 },
  rifle: { key: 'rifle', cut: [0, 0.27], rate: 1, vol: 1.05, under: 0.45 },
  sniper: { key: 'rifle', cut: [0, 0.32], rate: 0.8, vol: 1.25, under: 0.65 },
};
const FADE = 0.06; // s: fade at the end of a cut gunshot (bank cuts carry their own)

// Gunshots: one close-miked shot = layers, each with its own envelope (see _gun). Hz, seconds, linear volume.
//   crack: muzzle-blast edge [highpass Hz, dur, vol]          body: band-passed noise [f0, f1, q, dur, vol]
//   blast: low boom, low-passed brown noise [f0, f1, dur, vol] thump: the felt bass, sine pitch drop [f0, f1, dur, vol]
//   punch: short low knock (synthesized shot only)             sub: extra deep sine under the big guns
//   bolt: the action clattering right after a quiet shot [delay, vol, rate] (bank 'click')
//   cycle: the action worked by hand after the shot [bank set, delay, vol, rate]
//   whoosh: rocket motor [f0, f1, dur, vol]   tail: the street answering [dur, lowpass Hz, vol, slap echoes, spacing]
//   jit: pitch randomization (default 3 %). (The spent cases are heard where they land: Debris, 'shell'.)
//   bus: 'sfx' keeps a quiet gun out of the gunfire bus (no drive, no gunfire level)
const GUNS = {
  // 9 mm: sharp crack, tight thump, short tail
  pistol: {
    crack: [2600, 0.003, 1.0], body: [2300, 520, 0.8, 0.07, 1.3], blast: [1500, 130, 0.12, 1.2],
    thump: [150, 48, 0.15, 1.1], punch: [270, 115, 0.03, 0.45],
    tail: [0.4, 1700, 0.3, 2, 1],
  },
  // drier and shorter than the pistol so full auto stays readable
  uzi: {
    crack: [3000, 0.002, 0.85], body: [2600, 760, 0.9, 0.042, 1.1], blast: [1600, 160, 0.065, 0.9],
    thump: [165, 62, 0.075, 0.85], punch: [290, 135, 0.022, 0.35],
    tail: [0.2, 1500, 0.18, 1, 0.8], jit: 0.045,
  },
  // suppressed: muffled "pft", almost no crack, audible bolt clatter, a little low thud
  silenced: {
    crack: [5000, 0.0015, 0.05], body: [900, 260, 0.9, 0.05, 0.6], blast: [700, 120, 0.05, 0.3],
    thump: [125, 56, 0.06, 0.3], bolt: [0.012, 0.3, 1.3], bus: 'sfx',
    tail: [0.08, 800, 0.04, 0, 1], jit: 0.04,
  },
  // massive boom, wide low end, long tail, then the pump racked
  shotgun: {
    crack: [1800, 0.004, 1.0], body: [1700, 260, 0.6, 0.12, 1.5], blast: [2200, 80, 0.24, 1.35],
    thump: [112, 36, 0.24, 1.25], punch: [220, 90, 0.04, 0.5], sub: [64, 28, 0.42, 0.85],
    cycle: ['pump', 0.3, 0.3, 1], tail: [1.0, 1500, 0.45, 3, 1.3],
  },
  // 7.62: hard supersonic crack, heavy body, long tail
  rifle: {
    crack: [3600, 0.0028, 1.25], body: [2800, 600, 0.7, 0.07, 1.4], blast: [1800, 110, 0.12, 1.1],
    thump: [136, 44, 0.14, 1.1], punch: [240, 100, 0.03, 0.45],
    tail: [0.75, 1600, 0.36, 3, 1.1],
  },
  // the biggest crack, deep sub, long rolling echo (no bolt worked between shots: the user was sick of hearing it)
  sniper: {
    crack: [3000, 0.0045, 1.45], body: [2400, 340, 0.6, 0.11, 1.5], blast: [2000, 70, 0.28, 1.4],
    thump: [104, 32, 0.28, 1.3], punch: [200, 80, 0.05, 0.5], sub: [55, 24, 0.62, 0.95],
    tail: [1.7, 1300, 0.5, 4, 1.9],
  },
  // launch: back-blast thump + motor whoosh
  rocket: {
    crack: [1200, 0.006, 0.45], body: [900, 300, 0.8, 0.12, 1.0], blast: [1600, 90, 0.3, 1.2],
    thump: [92, 34, 0.3, 1.15], sub: [50, 25, 0.5, 0.7], whoosh: [500, 2600, 0.65, 0.55],
    tail: [0.9, 1200, 0.35, 2, 1.5],
  },
};

// Handling per weapon id. rate: playback rate of its reload recordings (bigger guns sound lower and slower),
// rack: bank set of its action, load: what a shell reload pushes in ('shell' | 'rocket').
const ARMS = {
  pistol: { rate: 1.1, rack: 'rack' },
  uzi: { rate: 1, rack: 'rack' },
  uzi_silenced: { rate: 1, rack: 'rack' },
  shotgun: { rate: 0.95, rack: 'pump', load: 'shell' },
  rifle: { rate: 0.88, rack: 'rack' },
  sniper: { rate: 0.8, rack: 'rack' },
  bazooka: { rate: 0.62, rack: 'magIn', load: 'rocket' },
};

// Casings on the floor: bank set, playback rate (small brass rings higher), bounces (when a play is not one touchdown
// of a case seen landing: opts.bounces), and under the recording a synthesized touch of its own: brass, a tick and two short
// high partials [Hz, ratio of the second, s, level] (a few tens of ms: a glint, never a note); a plastic hull, a dull
// tap [band Hz, s, level]
const CASINGS = {
  '9mm': { set: 'casing', rate: 1.25, n: 3, ring: [6400, 1.47, 0.045, 0.1] },
  '762': { set: 'casing', rate: 0.95, n: 3, ring: [4900, 1.53, 0.06, 0.11] },
  hull: { set: 'plastic', rate: 1.1, n: 2, tap: [900, 0.035, 0.32] },
};

// Sounds made of bank cuts only: layers [bank set, vol, rate = 1, delay s = 0, odds = 1]. A `_<name>` method of
// the same name adds its synthesized part.
const FOLEY = {
  // one hit, per material
  wood: [['wood', 1]], metal: [['metal', 1]], stone: [['stone', 1]], plastic: [['plastic', 1]], soft: [['soft', 1]],
  ceramic: [['ceramic', 1]], glassHit: [['glassHit', 1]], flesh: [['soft', 0.7, 0.85]],
  // the thing giving way
  woodBreak: [['woodBreak', 1], ['wood', 0.5, 0.85]],
  flip: [['wood', 0.8, 0.7], ['thud', 0.9, 0.8, 0.05], ['wood', 0.5, 1.1, 0.12]], // a table going over on its side
  // a galvanised bin going over: the body on the ground, then a few rattles as it rocks and rolls; its lid landing
  binTip: [['sheet', 0.9, 0.85], ['thud', 0.5, 1.1, 0.02], ['metal', 0.6, 0.8, 0.14], ['metal', 0.4, 0.9, 0.29], ['metal', 0.25, 1, 0.42, 0.7]],
  binLid: [['metal', 0.8, 1.35], ['metal', 0.4, 1.5, 0.11, 0.8]],
  // PLACEHOLDERS (assets/sound/PLACEHOLDERS.md) until a pack brings real drags: furniture scraping over the floor as
  // a few low knocks of its material (legs juddering), the soft drag and the rolling can silent
  scrapeWood: [['wood', 0.35, 0.55], ['wood', 0.22, 0.6, 0.07], ['wood', 0.15, 0.65, 0.14, 0.7]],
  scrapeMetal: [['sheet', 0.3, 0.6], ['metal', 0.15, 0.55, 0.08, 0.6]],
  scrapePlastic: [['plastic', 0.3, 0.6], ['plastic', 0.2, 0.7, 0.08, 0.7]],
  scrapeCeramic: [['stone', 0.25, 0.6], ['stone', 0.18, 0.7, 0.08, 0.7]],
  dragSoft: [], rollMetal: [],
  metalBreak: [['metalBreak', 1], ['sheet', 0.6]],
  ceramicBreak: [['ceramic', 1], ['glassHit', 0.5, 0.8], ['stone', 0.5]],
  plasticBreak: [['plastic', 1, 0.8], ['woodBreak', 0.45, 1.5]],
  softBreak: [['soft', 1, 0.8], ['thud', 0.6]],
  glass: [['glass', 1], ['glassFall', 0.45, 1, 0.15, 0.7]],
  crumble: [['rubble', 1], ['stone', 0.7, 0.8], ['rubble', 0.5, 0.75, 0.25]],
  doorBreak: [['woodBreak', 1], ['thud', 0.8, 0.85], ['woodBreak', 0.5, 0.8, 0.1]],
  explosion: [['rubble', 0.5, 0.8, 0.3], ['glassFall', 0.2, 1, 0.5, 0.5], ['rubble', 0.35, 0.65, 0.75], ['stone', 0.3, 0.7, 1.1]],
  tirePop: [['thud', 0.8, 1.2]],
  carHit: [['sheet', 1], ['thud', 0.45, 0.9]],
  // PLACEHOLDERS (assets/sound/PLACEHOLDERS.md) for the van at the wheel (systems/Drive.js): its flank grinding along a
  // wall, the shove's lurch, the crash that kills him
  vanScrape: [['sheet', 0.5, 0.6], ['metal', 0.3, 0.55, 0.06, 0.6]],
  vanShove: [['thud', 0.6, 0.7], ['sheet', 0.25, 0.8, 0.03]],
  vanCrash: [['sheet', 1, 0.7], ['thud', 1, 0.6], ['metalBreak', 0.8, 0.8, 0.02], ['glass', 0.7, 1, 0.05]],
  doorVault: [['soft', 0.6, 1.1], ['sheet', 0.2, 0.9, 0.05]],
  seatDrop: [['soft', 0.7, 0.7], ['thud', 0.3, 0.8, 0.02]],
  hatFly: [['swish', 0.3, 1.3]],
  seatGun: [['soft', 0.4, 1.2], ['metal', 0.2, 1.5, 0.03]],
  // PLACEHOLDERS for the pursuers (systems/Pursuit.js): a gunman's tell starting (the hammer cocked), a pursuer's car
  // wrecked on what does not give
  tellClick: [['click', 0.8, 0.7], ['click', 0.5, 1.3, 0.05]],
  pursuerWreck: [['sheet', 0.9, 0.8], ['thud', 0.9, 0.7], ['metalBreak', 0.6, 0.9, 0.02], ['glass', 0.5, 1.1, 0.04]],
  // PLACEHOLDERS for the back road (systems/Lorries.js, Drive.fx): the lorry's reversing beeper and its air brakes,
  // an awning or a parasol torn down, tyres letting go (faint: the motor's own squeal covers it), spray out of a puddle
  lorryBeep: [['click', 0.7, 1.9], ['click', 0.5, 1.9, 0.06]],
  lorryBrake: [['swish', 0.6, 0.5], ['thud', 0.3, 0.6, 0.05]],
  awningRip: [['soft', 0.8, 1.2], ['swish', 0.4, 0.8, 0.02], ['woodBreak', 0.3, 1.3, 0.05]],
  tyreSkid: [['swish', 0.2, 1.7]],
  waterSpray: [['swish', 0.35, 0.7]],
  // flesh
  // dry blows only: no meat or wet recording anywhere (the user hated every one of them as a "squish")
  punch: [['punch', 1], ['soft', 0.4, 1.1, 0.008], ['thud', 0.7, 0.75]],
  splat: [['punch', 1, 0.8], ['thud', 0.7, 0.9], ['soft', 0.5, 0.7, 0.01]],
  // a body torn apart: a heavy blow, the bone cracking, the weight
  gore: [['punch', 1, 0.65], ['woodBreak', 0.45, 1.7, 0.01], ['thud', 0.9, 0.75, 0.02]],
  slash: [['swish', 0.5, 1.5], ['punch', 0.7, 1.3, 0.03]],
  death: [['punch', 1, 0.7], ['thud', 0.9, 0.7, 0.04]],
  // the guards' voices: their recording further back, a synthesized voice under it (_shout, _cry, _whimper)
  shout: [['yell', 0.55]],
  whimper: [['pain', 0.5, 1.12]], // a man on his knees begging
  scream: [['panic', 1]],         // a long cry of panic: someone running for his life
  sob: [['pain', 0.55, 1.3], ['pain', 0.4, 1.45, 0.3, 0.6]], // curled up in a corner, under his breath
  // a guard seized from behind: sleeves, his stifled grunt; then his neck, a dry crack, and the body let down
  grab: [['swish', 0.35, 1.2], ['soft', 0.7, 1.1, 0.04], ['pain', 0.3, 0.9, 0.1]],
  neck: [['woodBreak', 0.8, 1.9], ['wood', 0.6, 1.5, 0.01], ['soft', 0.5, 0.8, 0.14], ['thud', 0.6, 0.8, 0.32]],
  // PLACEHOLDERS (assets/sound/PLACEHOLDERS.md): a face driven into something, a dull blow and what it is made of
  headSlamWood: [['punch', 1, 0.75], ['wood', 0.8, 0.8, 0.005], ['thud', 0.7, 0.75, 0.01]],
  headSlamWall: [['punch', 1, 0.7], ['stone', 0.7, 0.75, 0.005], ['thud', 0.8, 0.7, 0.01]],
  headSlamMetal: [['punch', 1, 0.75], ['sheet', 0.6, 0.9, 0.005], ['thud', 0.6, 0.8, 0.01]],
  headSlamPorcelain: [['punch', 1, 0.8], ['ceramic', 0.8, 0.8, 0.005], ['thud', 0.6, 0.8, 0.01]],
  toiletDunk: [['splash', 1, 0.85], ['ceramic', 0.6, 0.75, 0.01], ['punch', 0.7, 0.8, 0.005]],
  // doors, movement
  creak: [['creak', 1]],
  splash: [['splash', 1]],
  // pigeons going up: a clatter of wings, short quick beats of air
  flutter: [['swish', 0.5, 2.6], ['swish', 0.4, 2.9, 0.07], ['swish', 0.4, 2.4, 0.15], ['swish', 0.3, 2.8, 0.24], ['swish', 0.2, 2.5, 0.34]],
  // the velvet curtain (systems/Curtains.js), placeholders until the bought library (assets/sound/PLACEHOLDERS.md)
  curtainBrush: [['soft', 0.45, 0.7], ['swish', 0.25, 0.55, 0.03]],
  curtainRings: [['click', 0.25, 1.6], ['click', 0.18, 1.8, 0.05], ['click', 0.12, 1.7, 0.11, 0.6]],
  curtainWhoosh: [['swish', 0.7, 0.5], ['soft', 0.4, 0.6, 0.02]],
  // small things
  ricochet: [['stone', 0.5, 1.5]],
  ammo: [['rattle', 1], ['handle', 0.35, 1.2]],
  // what stands on the furniture (systems/Clutter.js): placeholders made of the closest cuts until the SFX library
  // comes (assets/sound/PLACEHOLDERS.md)
  clutterClink: [['glassHit', 0.55, 1.45]],
  clutterShatter: [['glassHit', 0.8, 1.2], ['glassFall', 0.3, 1.35, 0.04, 0.7]],
  clutterBottle: [['glassHit', 0.5, 0.85], ['glassHit', 0.25, 0.95, 0.13, 0.6]],
  clutterAshtray: [['glassHit', 0.55, 0.7], ['ceramic', 0.35, 0.9, 0.02]],
  clutterChips: [['plastic', 0.45, 1.7], ['plastic', 0.3, 1.9, 0.05], ['plastic', 0.2, 1.8, 0.11, 0.7]],
  clutterTill: [['metal', 0.8, 0.75], ['thud', 0.6, 0.9, 0.01]],
  clutterPaper: [['swish', 0.15, 1.9]],
  cashFlutter: [['swish', 0.1, 2.2]],
  fluteClink: [['glassHit', 0.4, 1.8]],
  fluteShatter: [['glassHit', 0.7, 1.55], ['glassFall', 0.25, 1.6, 0.03, 0.6]],
  bucketKnock: [['metal', 0.6, 1.25], ['glassHit', 0.3, 0.9, 0.04], ['plastic', 0.2, 1.8, 0.08, 0.7]],
  ui: [['click', 1, 0.8], ['thud', 0.4, 1.5]],
  // placeholders (assets/sound/PLACEHOLDERS.md): the nearest cuts of the bank until the bought library
  holster: [['handle', 0.6, 1.2]],
  sling: [['swish', 0.45, 0.75], ['handle', 0.4, 0.9, 0.06]],
  doorPush: [['door', 0.4, 1.15]],
  doorLatch: [['click', 0.5, 0.8], ['door', 0.2, 1.4, 0.01]],
  pushBar: [['handle', 0.6, 0.8], ['click', 0.35, 0.7, 0.02]],
  doorFlap: [['door', 0.35, 1.5], ['wood', 0.2, 1.3, 0.02]],
  doorBoom: [['doorSlam', 0.8, 0.7], ['sheet', 0.6, 0.6, 0.01], ['metal', 0.3, 0.5, 0.05]],
  doorCloserHiss: [['swish', 0.25, 0.35]],
  lockBeep: [['click', 0.45, 2.2]],
  cloth: [['swish', 0.35, 0.6]],
  scuff: [['soft', 0.35, 1.5]],
  kneeShot: [['punch', 0.8, 1.25], ['woodBreak', 0.5, 1.8, 0.01]],
  boneCrack: [['woodBreak', 0.7, 1.7], ['punch', 0.6, 0.9, 0.01]],
  stomp: [['thud', 1, 0.7], ['punch', 0.8, 0.6], ['woodBreak', 0.3, 1.6, 0.01]],
  skullSlam: [['thud', 0.9, 0.8], ['punch', 0.9, 0.7, 0.01]],
  throatCut: [['swish', 0.4, 1.2], ['soft', 0.6, 0.7, 0.05]],
  bladeTwist: [['soft', 0.6, 0.8], ['punch', 0.4, 1.4, 0.04]],
  handPlant: [['soft', 0.6, 1.2], ['wood', 0.15, 1.4]],
  vaultSwish: [['swish', 0.45, 0.7]],
  landThud: [['thud', 0.55, 0.9], ['soft', 0.4, 0.8, 0.03]],
  slideScrape: [['rubble', 0.25, 1.3], ['soft', 0.3, 0.7, 0.05]],
  kickWhoosh: [['swish', 0.55, 0.8]],
  kickHit: [['punch', 1, 0.75], ['thud', 0.8, 0.7, 0.01], ['soft', 0.4, 0.9, 0.03]],
  hoodLean: [['sheet', 0.25, 0.7], ['soft', 0.35, 0.8, 0.04]],
  batSnap: [['woodBreak', 1, 1.15], ['wood', 0.8, 0.8, 0.01]],
  knifeSnap: [['metal', 0.9, 1.7], ['click', 0.7, 0.75, 0.01]],
  snatch: [['swish', 0.6, 1.2], ['handle', 0.5, 1.3, 0.04]],
  clear: [['doorSlam', 0.6, 0.6]],
  // the flat on fire (systems/Tutorial.js, FireSpread.js, Fires.js): placeholders too
  arsonLaugh: [['yell', 0.55, 0.85], ['yell', 0.5, 0.95, 0.24], ['yell', 0.45, 1.05, 0.48]],
  fireRun: [['swish', 0.7, 0.4], ['soft', 0.45, 0.5, 0.04]],
  fireRoar: [['rubble', 0.3, 0.45], ['swish', 0.3, 0.3, 0.1]],
  heatCrack: [['glassHit', 0.6, 0.7], ['click', 0.35, 2.2, 0.07], ['glassHit', 0.3, 1.1, 0.16]],
  // the title (ui/title/Beats.js): placeholders too
  titleFire: [['rubble', 0.5, 0.35], ['swish', 0.4, 0.25, 0.2], ['woodBreak', 0.12, 0.5, 0.6]],
  titleRain: [['splash', 0.3, 0.4], ['soft', 0.25, 0.45, 0.3], ['splash', 0.2, 0.55, 0.6]],
  neonBuzz: [['rattle', 0.5, 2.6], ['click', 0.4, 3.2, 0.04]],
  markerStroke: [['swish', 0.7, 1.5], ['soft', 0.5, 1.7, 0.02], ['plastic', 0.2, 1.4, 0.05]],
  // a boss's beats (entities/Boss.js): placeholders too
  bossCard: [['doorSlam', 0.8, 0.5], ['thud', 0.7, 0.6, 0.02]],
  bossHowl: [['yell', 0.9, 0.6], ['yell', 0.6, 0.5, 0.2]],
  bossRoar: [['yell', 1, 0.5], ['yell', 0.8, 0.42, 0.12], ['yell', 0.6, 0.55, 0.3]],
  bossShake: [['swish', 0.6, 0.6], ['punch', 0.7, 0.8, 0.05]],
  bossDeath: [['yell', 0.9, 0.45], ['thud', 0.9, 0.6, 0.5]],
  shadesDrop: [['plastic', 0.5, 1.9], ['click', 0.3, 2.4, 0.05]],
};

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.chokes = new WeakMap(); // emitter -> its last voice (a new shot fades the previous tail)
    this.listener = { x: 0, y: 0 };
    this.vol = { master: 1, music: 1, sfx: 1, ambience: 1 }; // player volumes (settings), scale the bus gains
    this.active = [];   // live plays, for the caps and voice stealing
    this.lastPlay = {}; // name -> { t, vol } of the last admitted play
    this.duckUntil = 0;
    this.duckDepth = 1;
    this.pv = 1;        // per-play pitch factor (set in play, read by the helpers)
    this.buffers = {};  // decoded recordings (SAMPLES), filled by unlock()
    this.bags = {};     // bank set or baked form -> what was not played yet in this round (see _bag)
    this.baked = {};    // synthesized foley form -> its variations, rendered on first use or in the background
    this.beds = {};     // bed voice -> { g, lp, pan, src, quiet } (setAmbience)
    this.bedBufs = {};  // bed -> its rendered loop (null: being rendered)
    this.bedMarks = {}; // bed -> [[start s, length s]] where a one-shot of it may be played (_cue)
    this.bedQueue = []; // beds waiting to be rendered, one at a time in idle time
    this.laughs = {};   // 'm' | 'f' -> rendered laughs
    this.motors = {};   // key -> a vehicle's live voice (motor)
  }

  // must be called from a user gesture
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this._build(this.ctx = new AC());
    await Promise.all(Object.entries(SAMPLES).map(async ([k, url]) => {
      try {
        this.buffers[k] = await this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      } catch (e) { console.warn('sound load failed', k, e); } // shots fall back on synthesis, foley stays silent
    }));
    this._prebake();
    for (const k in BEDS) this._bakeBed(k); // the beds of the night, all of them in idle time from now on
  }

  // renders every synthesized form's first variation in the background, one at a time, after the start's own load
  // and only in the idle time between frames (a render takes 1 to 10 ms)
  _prebake() {
    const todo = Object.entries(RECIPES).flatMap(([name, r]) => (r.forms ? Object.keys(r.forms).map((f) => [`${name}.${f}`, r.forms[f]]) : [[name, r]]));
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 0 }), PREBAKE[1] * 1000));
    const next = (deadline) => {
      do this._variation(...todo.shift(), 0); while (todo.length && deadline.timeRemaining() > 12);
      if (todo.length) idle(next);
    };
    setTimeout(() => idle(next), PREBAKE[0] * 1000);
  }

  // bus chain + shared buffers (see the header)
  _build(ctx) {
    this.baked = {};
    this.beds = {};
    this.bedBufs = {};
    this.bedMarks = {};
    this.bedQueue = [];
    this.laughs = {};
    this.motors = {};
    this.v8Wave = null;
    const param = (n, v) => { for (const k in v) n[k].value = v[k]; return n; };
    const gain = (v) => param(ctx.createGain(), { gain: v });
    const bq = (type, frequency, Q, g = 0) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      return param(f, { frequency, Q, gain: g });
    };
    const chain = (...nodes) => nodes.reduce((a, b) => (a.connect(b), b));
    const shaper = (fn, oversample) => {
      const s = ctx.createWaveShaper(), curve = new Float32Array(2049);
      for (let i = 0; i < curve.length; i++) curve[i] = fn(i / 1024 - 1);
      s.curve = curve;
      s.oversample = oversample;
      return s;
    };

    const L = LEVELS;
    this.sfx = gain(L.sfx * this.vol.sfx);
    this.music = gain(L.music * this.vol.music);
    this.duck = gain(1);
    this.dip = gain(1); // a held dip of the music while a vehicle roars (motor)
    this.bus = gain(1);
    const mix = gain(1);

    // sfx EQ: no useless sub, a bit of weight, less boxy low-mids, a little presence
    chain(this.sfx, bq('highpass', 30, 0.7), bq('lowshelf', 110, 0.7, 2), bq('peaking', 350, 0.9, -2), bq('peaking', 3200, 0.8, 1.5), mix);
    // gun drive: unity gain for quiet (distant) shots, rounds the peaks of close ones off like an overdriven
    // mic, which is a big part of what makes a recorded gunshot sound heavy. In: +-2 -> out: +-0.96.
    this.guns = gain(0.5);
    chain(this.guns, shaper((x) => Math.tanh(2 * x), '2x'), gain(L.guns * 0.9 / L.sfx), this.sfx);
    // voices: no rumble, a little presence so that a shout reads through the gunfire
    this.voice = gain(L.voice);
    chain(this.voice, bq('highpass', 110, 0.7), bq('peaking', 2500, 1, 2.5), this.sfx);
    // recorded shots keep their full crack: no drive, no low-mid cut, a bit of weight and air
    this.shots = gain(L.shots * L.guns * this.vol.sfx);
    chain(this.shots, bq('highpass', 35, 0.7), bq('lowshelf', 120, 0.7, 3), bq('highshelf', 5000, 0.7, 3.5), mix);
    // the beds of the night and the one-shots flagged `amb` (systems/Ambience.js, Critters): the AMBIENCE volume
    // governs both, the effects volume neither. No boom, a soft top, and round the glue: gunfire never pumps them.
    this.ambBus = gain(this.vol.ambience);
    chain(this.ambBus, bq('highpass', 40, 0.7), bq('peaking', 350, 0.9, -2), bq('highshelf', 6000, 0.7, -2), this.bus);
    this.amb = gain(L.beds);
    this.amb.connect(this.ambBus);
    this.ambOne = gain(L.ambOne);
    this.ambOne.connect(this.ambBus);
    // the room everything that is not music is heard in: it glues the recordings (all made in different places)
    // together, and tells the street from the bar and the tiled toilets (ROOMS, crossfaded by setAmbience)
    this.rooms = {};
    for (const [name, R] of Object.entries(ROOMS)) {
      const on = name === 'warm' ? 1 : 0, sends = [gain(R.sfx * on), gain(R.shots * on), gain(R.amb * on)];
      this.sfx.connect(sends[0]);
      this.shots.connect(sends[1]);
      this.ambBus.connect(sends[2]);
      const out = gain(1), conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = this._room(ctx, R.ir);
      for (const s of sends) s.connect(conv);
      conv.connect(out);
      if (R.slap) {
        const dark = bq('lowpass', SLAP_TONE, 0.7);
        for (const s of sends) s.connect(dark);
        for (const [t, v] of R.slap) {
          const d = ctx.createDelay(0.5);
          d.delayTime.value = t;
          chain(dark, d, gain(v), out);
        }
      }
      chain(out, bq('highpass', 160, 0.7), mix);
      this.rooms[name] = sends;
    }
    // and a bigger space behind gunfire, far sounds and the kill's boom: fed voice by voice (see _out)
    this.hall = ctx.createConvolver();
    this.hall.normalize = false;
    this.hall.buffer = this._room(ctx, HALL);
    chain(this.hall, bq('highpass', 220, 0.7), mix);

    // glue on the effects only: loud bursts are held together, the music bed is left alone. (The browser adds
    // makeup gain from these settings: a low threshold would push clicks and casings up towards the gunshots.)
    const comp = () => param(ctx.createDynamicsCompressor(), { threshold: -10, knee: 8, ratio: 2.5, attack: 0.008, release: 0.22 });
    chain(mix, this.glue = comp(), this.bus);
    chain(this.music, bq('highpass', 28, 0.7), this.duck, this.dip, this.musicComp = comp(), this.bus);

    this.filter = bq('lowpass', 20000, 0.7);
    // soft clip: transparent up to the knee (with the gain the mix was balanced on), rounding off above it
    const G = 1.58, KNEE = 0.4, Y = G * KNEE;
    const clip = shaper((x) => {
      const a = Math.abs(x);
      return a <= KNEE ? G * x : Math.sign(x) * (Y + (1 - Y) * Math.tanh(G * (a - KNEE) / (1 - Y)));
    }, '4x');
    // the limiter only catches what the clip let through, and lets go slowly: it never pumps
    this.limiter = param(ctx.createDynamicsCompressor(), { threshold: -2, knee: 0, ratio: 20, attack: 0.002, release: 0.3 });
    this.master = gain(L.master * this.vol.master);
    chain(this.bus, this.filter, gain(0.85), clip, this.limiter, this.master, ctx.destination);

    // shared noise: white (texture) and brown (rumble), 2 s each, looped by the sources
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.noise.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.04 * w[i]) / 1.04;
      b[i] = last * 6;
    }
  }

  // impulse response of a room: `pre` s of air, early reflections off the nearest walls (spaced by its `size`), then
  // a noise tail dying in `rt` s (RT60) whose highs die faster: it starts low-passed at `damp` Hz and darkens as it
  // goes; unit energy per channel, so the send gain is the wet level. Each channel is its own: a wide tail.
  _room(ctx, { pre = 0.012, rt = 1, damp = 4000, size = 1 } = {}) {
    const R = ctx.sampleRate, p0 = Math.round(R * pre), n = p0 + Math.round(R * rt * 1.1), tau = rt / 6.91;
    const ir = ctx.createBuffer(2, n, R);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0, k = 1, energy = 0;
      for (let i = p0; i < n; i++) {
        const t = (i - p0) / R;
        if (((i - p0) & 63) === 0) k = 1 - Math.exp((-2 * Math.PI * (180 + damp * Math.exp((-3 * t) / rt))) / R);
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t / tau);
      }
      for (const [t, v] of [[0.007, 1.4], [0.017, -1.1], [0.029, 0.8], [0.043, -0.6], [0.061, 0.4]]) {
        const i = p0 + Math.round(R * t * size * rand(0.85, 1.15));
        if (i < n) d[i] += v;
      }
      for (let i = p0; i < n; i++) energy += d[i] * d[i];
      const g = 1 / Math.sqrt(energy || 1);
      for (let i = p0; i < n; i++) d[i] *= g;
    }
    return ir;
  }

  // kind: 'master' | 'music' | 'sfx' | 'ambience' (the beds and the `amb` one-shots), v: 0..1. Safe before the context exists (_build applies this.vol).
  setVolume(kind, v) {
    if (!(kind in this.vol)) return;
    v = clamp(Number.isFinite(v) ? v : 1, 0, 1);
    this.vol[kind] = v;
    if (!this.ctx) return;
    const set = (node, g) => node && node.gain.setTargetAtTime(g, this.ctx.currentTime, 0.03);
    const L = LEVELS;
    if (kind === 'master') set(this.master, L.master * v);
    else if (kind === 'music') set(this.music, L.music * v);
    else if (kind === 'ambience') set(this.ambBus, v);
    else { set(this.sfx, L.sfx * v); set(this.shots, L.shots * L.guns * v); }
  }

  // 0 = clear, 1 = heavily muffled (death / slow motion)
  setMuffle(amount) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(1 - clamp(amount, 0, 0.97), 3) + 300;
    this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  }

  // ---- routing ----
  // loudness (fading out at `reach`) / pan / distance (0 near .. 1 far) of an emitter relative to the listener
  _spatial(opts, reach = 1500) {
    let vol = opts.vol ?? 1, pan = 0, far = 0;
    if (opts.x !== undefined) {
      const dx = opts.x - this.listener.x, dy = opts.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      vol *= clamp(1 - d / reach, 0.08, 1);
      pan = clamp(dx / PAN, -0.85, 0.85);
      far = clamp((d - NEAR) / (FAR - NEAR), 0, 1); // far sounds lose their highs
    } else {
      // somewhere off the map: opts.side (-1 left .. 1 right), opts.distant (0 near .. 1 far)
      if (opts.side !== undefined) pan = clamp(opts.side, -0.85, 0.85);
      if (opts.distant !== undefined) far = clamp(opts.distant, 0, 1);
    }
    const occ = !!opts.occ;
    if (occ) vol *= OCCLUDED[0];
    return { vol, pan, far, occ, hall: 0 };
  }

  // per-play gain node (+ distance lowpass, + pan); `o._n` counts live sources so the chain is disconnected at the end
  _out(sp, dest) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = sp.vol;
    const chain = [g];
    if (sp.far > 0.05 || sp.occ) {
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = Math.min(600 + 15400 * (1 - sp.far) ** 2, sp.occ ? OCCLUDED[1] : Infinity);
      chain.push(lp);
    }
    if (ctx.createStereoPanner && Math.abs(sp.pan) > 0.02) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan;
      chain.push(p);
    }
    chain.forEach((n, i) => n.connect(chain[i + 1] || dest));
    const wet = sp.hall + sp.far * FAR_HALL;
    if (wet > 0.02 && this.hall) {
      const send = ctx.createGain();
      send.gain.value = wet;
      chain[chain.length - 1].connect(send);
      send.connect(this.hall);
      chain.push(send);
    }
    g._chain = chain;
    g._n = 0;
    return g;
  }

  // a source of voice `o` ended: free the whole chain once the last one is gone
  _release(o, ...nodes) {
    nodes.forEach((n) => n.disconnect());
    if (--o._n === 0) o._chain.forEach((n) => n.disconnect());
  }

  // ---- the beds of the night (systems/Ambience.js, through World.atmosphere) ----
  // mix: { beds: { voice: { gain, lp, pan, bed = voice, rate = 1 } }, room: { ROOMS name: weight } }. A voice left out
  // fades away; every voice fades away by itself when no mix comes for BED_HOLD s (a pause, the menu, a level left)
  // and its loop is let go BED_IDLE s later. A bed is heard once it is rendered (all are queued at the unlock).
  setAmbience({ beds = {}, room = null } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    for (const name in beds) this._bed(name, beds[name], now);
    for (const name in this.beds) if (!(name in beds)) this._bed(name, null, now);
    if (room) {
      for (const k in this.rooms) {
        const w = clamp(room[k] ?? 0, 0, 1), [s, g, am] = this.rooms[k];
        this._glide(s.gain, ROOMS[k].sfx * w, now, 0.15);
        this._glide(g.gain, ROOMS[k].shots * w, now, 0.15);
        this._glide(am.gain, ROOMS[k].amb * w, now, 0.15);
      }
    }
  }

  // an automated value: toward v from now; with `hold`, back to 0 unless told again within hold s
  _glide(param, v, now, tau, hold = 0) {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(v, now, tau);
    if (hold) param.setTargetAtTime(0, now + hold, 0.3);
  }

  // one voice of the beds (m: its mix, null: silent)
  _bed(name, m, now) {
    const ctx = this.ctx, on = !!m && m.gain >= BED_FLOOR;
    let b = this.beds[name];
    if (!b) {
      if (!on) return;
      const g = ctx.createGain(), lp = ctx.createBiquadFilter(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      g.gain.value = 0;
      lp.type = 'lowpass';
      lp.Q.value = 0.5;
      lp.frequency.value = m.lp ?? 20000;
      g.connect(lp);
      if (pan) { pan.pan.value = m.pan || 0; lp.connect(pan); pan.connect(this.amb); } else lp.connect(this.amb);
      b = this.beds[name] = { g, lp, pan, src: null, quiet: 0 };
    }
    if (on) {
      b.quiet = 0;
      if (!b.src) {
        const buf = this._bakeBed(m.bed || name);
        if (!buf) return;
        b.src = this._loop(b, buf, m.rate ?? 1);
      }
      this._glide(b.g.gain, m.gain, now, BED_TAU, BED_HOLD);
      this._glide(b.lp.frequency, clamp(m.lp ?? 20000, 40, 20000), now, BED_TAU);
      if (b.pan) this._glide(b.pan.pan, clamp(m.pan || 0, -1, 1), now, BED_TAU);
      this._glide(b.src.playbackRate, clamp(m.rate ?? 1, 0.25, 4), now, BED_TAU);
    } else {
      this._glide(b.g.gain, 0, now, BED_TAU);
      b.quiet ||= now;
      if (b.src && now - b.quiet > BED_IDLE) { b.src.stop(now); b.src = null; }
    }
    // without news it stops by itself (a stop called again replaces the last one)
    if (b.src) b.src.stop(now + BED_HOLD + BED_IDLE);
  }

  // a bed's loop started into voice b, at a random point of it
  _loop(b, buf, rate) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(b.g);
    s.onended = () => { s.disconnect(); if (b.src === s) b.src = null; };
    s.start(this.ctx.currentTime, Math.random() * (buf.duration || 0));
    return s;
  }

  // the rendered loop of a bed, or null while it is not ready (it is queued: rendered one at a time, in idle time)
  _bakeBed(key) {
    if (this.bedBufs[key] !== undefined || !BEDS[key]) return this.bedBufs[key] || null;
    this.bedBufs[key] = null;
    this.bedQueue.push(key);
    if (this.bedQueue.length === 1) this._bakeNext();
    return null;
  }

  _bakeNext() {
    const key = this.bedQueue[0], ctx = this.ctx;
    if (!key) return;
    const gen = renderBed(key, 1 + Object.keys(BEDS).indexOf(key) * 7919);
    const idle = globalThis.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 6 }), 20));
    const step = (deadline) => {
      if (this.ctx !== ctx) return; // the context was rebuilt meanwhile
      let s;
      do s = gen.next(); while (!s.done && deadline.timeRemaining() > 3);
      if (!s.done) { idle(step); return; }
      const { sr, data, marks } = s.value, buf = ctx.createBuffer(data.length, data[0].length, sr);
      data.forEach((d, i) => buf.getChannelData(i).set(d));
      this.bedBufs[key] = buf;
      this.bedMarks[key] = marks;
      this.bedQueue.shift();
      this._bakeNext();
    };
    idle(step);
  }

  // music dip under a loud sound: down fast (no click), held, back up slowly. A burst keeps it down instead of
  // pumping it shot by shot, and a deeper dip still running is kept.
  _duck(depth) {
    const now = this.ctx.currentTime, g = this.duck.gain;
    if (now < this.duckUntil) depth = Math.min(depth, this.duckDepth);
    this.duckDepth = depth;
    this.duckUntil = now + DUCK_HOLD;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(depth, now, 0.015);
    g.setTargetAtTime(1, now + DUCK_HOLD, DUCK_RELEASE);
  }

  // fade a live play out and forget it (voice stealing, choke)
  _kill(entry, now, tau) {
    entry.gain.gain.cancelScheduledValues(now);
    entry.gain.gain.setTargetAtTime(0, now, tau);
    const i = this.active.indexOf(entry);
    if (i >= 0) this.active.splice(i, 1);
  }

  // rate limit + per-name cap + global cap with voice stealing; returns the "active" entry or null
  _admit(name, meta, vol) {
    const now = this.ctx.currentTime, act = this.active;
    for (let i = act.length - 1; i >= 0; i--) if (act[i].end <= now) act.splice(i, 1);
    const last = this.lastPlay[name];
    if (last && now - last.t < meta.gap && vol < last.vol * 1.4) return null;
    let quietest = null, same = 0; // a louder (closer) play of a capped name takes over its quietest voice
    for (const a of act) if (a.name === name) { same++; if (!quietest || a.vol < quietest.vol) quietest = a; }
    if (same >= meta.max) {
      if (vol < quietest.vol * 1.2) return null;
      this._kill(quietest, now, 0.02);
    }
    if (act.length >= GLOBAL_SOFT_CAP) {
      let weakest = null; // quietest of the lowest priority
      for (const a of act) if (!weakest || a.pri < weakest.pri || (a.pri === weakest.pri && a.vol < weakest.vol)) weakest = a;
      const better = meta.pri > weakest.pri || (meta.pri === weakest.pri && vol > weakest.vol * 1.5);
      if (!better || act.length >= GLOBAL_HARD_CAP && meta.pri <= weakest.pri) return null;
      this._kill(weakest, now, 0.02);
    }
    this.lastPlay[name] = { t: now, vol };
    const entry = { name, pri: meta.pri, vol, end: now + meta.dur, gain: null };
    act.push(entry);
    if (meta.duck < 1) this._duck(meta.duck);
    return entry;
  }

  // opts: x, y (positional), vol (loudness / how hard it was hit), choke (emitter key: a new play from the same
  // emitter fades its previous one, which keeps full-auto fire clean), weapon (weapon id for handling sounds),
  // pitch (voice of who makes it)
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    name = ALIAS[name] || name;
    const gun = GUNS[name], layers = FOLEY[name], recipe = !gun && this['_' + name], synth = RECIPES[name];
    if (!gun && !layers && !recipe && !synth) return;
    const meta = META[name] || DEFAULT_META;
    if (meta.gain <= 0) return; // turned off (STEP_LEVEL)
    const sp = this._spatial(opts, meta.reach);
    sp.vol *= meta.gain;
    sp.hall = meta.hall ?? (gun ? GUN_HALL : 0);
    if (sp.vol < 0.012) return; // inaudible
    const entry = this._admit(name, meta, sp.vol);
    if (!entry) return;
    const choke = opts.choke ?? (meta.choke ? meta : null); // META choke: every play of that name chokes the last
    if (choke) {
      const prev = this.chokes.get(choke);
      if (prev && prev.end > this.ctx.currentTime) this._kill(prev, this.ctx.currentTime, CHOKE);
      this.chokes.set(choke, entry);
    }
    const shot = gun && SHOTS[name], buf = shot && this.buffers[shot.key];
    const bus = buf ? this.shots : gun ? this[gun.bus || 'guns'] : opts.amb ? this.ambOne : meta.bus === 'voice' ? this.voice : this.sfx;
    const o = entry.gain = this._out(sp, opts.dest || bus);
    if (gun) this._gun(o, gun, sp, opts, buf && shot, buf);
    else {
      o.gain.value = sp.vol * rand(0.88, 1.1); // never twice the same level
      this.pv = rand(0.95, 1.05) * (opts.pitch ?? 1);
      const v = clamp(opts.vol ?? 1, 0.1, 1.5); // how hard it was hit
      if (layers) this._foley(o, layers, v);
      if (synth) this._synth(o, name, opts, v);
      if (recipe) recipe.call(this, o, opts, v);
    }
    if (!o._n) { // nothing to play (bank not loaded): free the voice
      o._chain.forEach((n) => n.disconnect());
      this.active.splice(this.active.indexOf(entry), 1);
    }
  }

  // ---- recordings ----
  // one cut of a recording into voice `o`, faded out over the end of the cut
  _sample(o, buf, { offset = 0, len = buf.duration, rate = 1, vol = 1, delay = 0, fade = FADE }) {
    const ctx = this.ctx, t = ctx.currentTime + delay, dur = len / rate;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    s.playbackRate.value = rate;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + Math.max(0, dur - fade));
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(g);
    g.connect(o);
    o._n++;
    s.onended = () => this._release(o, s, g);
    s.start(t, offset, len + 0.02);
  }

  // next of n things under `key` (cuts of a bank set, baked variations): drawn from a shuffled round, so none comes
  // back before the others
  _bag(key, n) {
    let bag = this.bags[key];
    if (!bag || !bag.length) {
      const last = bag && bag.last;
      bag = this.bags[key] = Array.from({ length: n }, (_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === last) bag.reverse(); // never the same one twice in a row
    }
    return (bag.last = bag.pop());
  }

  // next cut [offset, length] of a bank set
  _pick(set) { return BANK[set][this._bag(set, BANK[set].length)]; }

  // one cut of bank `set` into voice `o` (silent until the bank is loaded)
  _cut(o, set, { vol = 1, rate = 1, delay = 0 } = {}) {
    const buf = this.buffers.foley;
    if (!buf) return;
    const [offset, len] = this._pick(set);
    this._sample(o, buf, { offset, len, rate: rate * this.pv, vol, delay, fade: 0.004 });
  }

  // FOLEY layers; a harder hit (v) is a little brighter
  _foley(o, layers, v) {
    const k = 0.94 + 0.08 * Math.min(v, 1.2);
    for (const [set, vol, rate = 1, delay = 0, odds = 1] of layers) {
      if (odds >= 1 || Math.random() < odds) this._cut(o, set, { vol, rate: rate * k, delay });
    }
  }

  // ---- synthesized foley (Foley.js) ----
  // variation i of a form, rendered into a buffer the first time it is asked for
  _variation(key, recipe, i) {
    const list = (this.baked[key] ||= []);
    if (!list[i]) {
      const sr = this.ctx.sampleRate, d = render(recipe, sr, i * 7919 + key.length * 104729 + 1);
      const buf = this.ctx.createBuffer(1, d.length, sr);
      buf.getChannelData(0).set(d);
      list[i] = { buf, len: d.length / sr };
    }
    return list[i];
  }

  // one baked variation of `name`'s form for opts into voice `o` at `vol`; a harder hit (v) is a little brighter. Returns
  // whether there was one (a form may not exist for opts: a gun picked up has no grip of its own)
  _synth(o, name, opts, v = 1, vol = 1) {
    const f = formOf(name, opts);
    if (!f) return false;
    const { buf, len } = this._variation(f.key, f.recipe, this._bag(f.key, VARIATIONS));
    this._sample(o, buf, { len, rate: this.pv * rand(0.97, 1.03) * (0.96 + 0.06 * Math.min(v, 1.2)), vol, fade: 0.005 });
    return true;
  }

  // ---- synthesis primitives (all honour the per-play pitch factor this.pv) ----
  // filtered noise burst. src: 'white' | 'brown'; type 'none' skips the filter
  _noiseBurst(o, { src = 'white', dur = 0.2, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, vol = 1, delay = 0, attack = 0.002 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = src === 'brown' ? this.brown : this.noise;
    s.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let filt = null;
    if (type === 'none') s.connect(g);
    else {
      filt = ctx.createBiquadFilter();
      filt.type = type;
      filt.Q.value = q;
      filt.frequency.setValueAtTime(f0 * this.pv, t);
      filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.pv), t + dur);
      s.connect(filt); filt.connect(g);
    }
    g.connect(o);
    o._n++;
    s.onended = () => this._release(o, s, g, ...(filt ? [filt] : []));
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.03);
  }

  // felt bass of a hit: a low sine (or triangle) whose pitch drops fast (over ~40 % of the decay)
  _thump(o, { f0 = 150, f1 = 50, dur = 0.1, vol = 0.8, delay = 0, type = 'sine' }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * this.pv, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, f1 * this.pv), t + dur * 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o);
    o._n++;
    osc.onended = () => this._release(o, osc, g);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  // ---- synthesized parts of the big sounds (their debris and flesh are FOLEY layers) ----
  // a blow that lands: the chest's dull knock under the recorded hit
  _punch(o, opts, v) { this._synth(o, 'punchBody', opts, v, 0.9); }
  _slash(o, opts, v) { this._thump(o, { f0: 130, f1: 50, dur: 0.12, vol: 0.5 * v, delay: 0.03 }); }
  _death(o) {
    this._thump(o, { f0: 90, f1: 28, dur: 0.6, vol: 0.7 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 500, f1: 60, dur: 0.9, vol: 0.8 });
  }
  // a wall coming down: the weight of it under the falling rubble
  _crumble(o) {
    this._thump(o, { f0: 65, f1: 26, dur: 0.45, vol: 0.8 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 900, f1: 90, dur: 0.7, vol: 0.8, attack: 0.006 });
  }
  // a shock front you feel first, the fireball, the boom coming back off the buildings, a long rumble, then the
  // debris raining down. With the recordings loaded, a slowed-down shotgun blast gives it the grain of a real one.
  _explosion(o) {
    const rec = this.buffers.shotgun;
    this._noiseBurst(o, { type: 'none', dur: 0.004, vol: 1.1, attack: 0.0001 });                                // shock front
    this._noiseBurst(o, { type: 'highpass', f0: 2200, f1: 900, q: 0.7, dur: 0.09, vol: 0.8, attack: 0.0003 }); // crack
    if (rec) {
      this._sample(o, rec, { len: 0.6, rate: 0.42 * this.pv, vol: 1.05 });
      this._sample(o, rec, { len: 0.45, rate: 0.27 * this.pv, vol: 0.7, delay: 0.03 });
    }
    this._thump(o, { f0: 110, f1: 24, dur: 1.3, vol: 1.05 });                                                    // sub drop
    this._thump(o, { type: 'triangle', f0: 170, f1: 55, dur: 0.16, vol: 0.55 });                                 // chest punch
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 5200, f1: 90, dur: 1.1, vol: rec ? 0.7 : 1.15, attack: 0.002 }); // fireball
    this._noiseBurst(o, { f0: 900, f1: 180, q: 0.5, dur: 0.6, vol: 0.5, attack: 0.003 });                        // roar
    for (const [t, v] of [[0.16, 0.4], [0.33, 0.25]]) {                                                          // echoes
      this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 1400, f1: 120, dur: 0.45, vol: v, attack: 0.01, delay: t });
      this._thump(o, { f0: 80, f1: 34, dur: 0.3, vol: v, delay: t });
    }
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 260, f1: 45, dur: 2.2, vol: 0.6, attack: 0.15, delay: 0.1 }); // rumble
  }
  // the air let out of a tyre
  _tirePop(o) {
    this._noiseBurst(o, { type: 'lowpass', f0: 3000, f1: 200, dur: 0.13, vol: 1.0, attack: 0.002 });
    this._noiseBurst(o, { type: 'highpass', f0: 3500, f1: 2000, dur: 0.8, vol: 0.2, delay: 0.05, attack: 0.04 }); // hiss
  }
  // a partial of something struck: a pure tone that only dies away (the kill confirm's muted note)
  _ring(o, f, dur, vol, delay = 0) { this._thump(o, { f0: f, f1: f * 0.97, dur, vol, delay }); }

  // ---- synthesized voice (under the guards' recordings, which the user wanted further back) ----
  // a buzzing source (two saws a few cents apart, shaken by `rough`: a growl) through three vowel formants that
  // glide `from` -> `to`; its pitch follows `bend` ([time 0..1, ratio] points); `syl` cuts it in syllables
  // ([start, end] 0..1); `breath` is the air let out with it
  _voice(o, { f = 120, bend = [[0, 1], [1, 0.8]], from = VOWEL.a, to = from, dur = 0.3, vol = 0.5, rough = 0, breath = 0.08, syl = [[0, 1]], delay = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay, f0 = f * this.pv, g = ctx.createGain(), nodes = [g];
    const srcs = [-8, 8].map((cents) => {
      const src = ctx.createOscillator();
      src.type = 'sawtooth';
      src.detune.value = cents;
      src.frequency.setValueAtTime(f0 * bend[0][1], t);
      for (const [k, r] of bend.slice(1)) src.frequency.linearRampToValueAtTime(f0 * r, t + k * dur);
      return src;
    });
    if (rough) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 31;
      depth.gain.value = rough * 100; // cents
      lfo.connect(depth);
      for (const src of srcs) depth.connect(src.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
      nodes.push(lfo, depth);
    }
    [1, 0.55, 0.25].forEach((level, i) => {
      const bp = ctx.createBiquadFilter(), fg = ctx.createGain();
      bp.type = 'bandpass';
      bp.Q.value = 6 + i * 3;
      bp.frequency.setValueAtTime(from[i], t);
      bp.frequency.linearRampToValueAtTime(to[i], t + dur);
      fg.gain.value = level;
      for (const src of srcs) src.connect(bp);
      bp.connect(fg); fg.connect(g);
      nodes.push(bp, fg);
    });
    g.gain.setValueAtTime(0.0001, t);
    for (const [k0, k1] of syl) {
      const t0 = t + k0 * dur, t1 = t + k1 * dur;
      g.gain.linearRampToValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.03, (t1 - t0) * 0.25));
      g.gain.linearRampToValueAtTime(vol * 0.7, t0 + (t1 - t0) * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t1);
    }
    g.connect(o);
    o._n++;
    srcs[0].onended = () => this._release(o, ...srcs, ...nodes);
    for (const src of srcs) { src.start(t); src.stop(t + dur + 0.05); }
    if (breath) this._noiseBurst(o, { f0: from[1], f1: to[1], q: 1.2, dur, vol: breath, attack: 0.02, delay });
  }
  // a guard grumbling at a stranger to clear off, under his breath: "hm?" at first, "hey, hey" when he warns
  _mutter(o, opts, v) {
    if (v > 0.8) this._voice(o, { f: 112, bend: [[0, 1], [1, 0.86]], from: VOWEL.e, dur: 0.4, vol: 0.5, syl: [[0, 0.38], [0.52, 1]], breath: 0.05 });
    else this._voice(o, { f: 108, bend: [[0, 1], [1, 1.14]], from: VOWEL.m, to: VOWEL.o, dur: 0.26, vol: 0.5, breath: 0.05 });
  }
  // a guard calling out: one barked syllable
  _shout(o, opts, v) {
    this._voice(o, { f: 150, bend: [[0, 0.9], [0.25, 1.22], [1, 0.84]], from: VOWEL.e, to: VOWEL.a, dur: 0.27, vol: 0.9 * v, rough: 0.5, breath: 0.1 });
  }
  // a man begging or whining: thin, high, trembling
  _whimper(o) {
    this._voice(o, { f: 215, bend: [[0, 1], [0.5, 1.12], [1, 0.94]], from: VOWEL.i, to: VOWEL.e, dur: 0.36, vol: 0.28, rough: 0.25, breath: 0.1 });
  }

  // ---- guns ----
  // one shot: its recording when loaded (`shot`, `buf`) over the GUNS layers. Every shot differs a little (pitch,
  // level +-1 dB, tail length); with distance the crack and reflections fade first while the thump carries
  // (+ the _out lowpass).
  _gun(o, G, sp, opts, shot = null, buf = null) {
    this.pv = 1 + rand(-1, 1) * (G.jit ?? 0.03);
    o.gain.value = sp.vol * rand(0.89, 1.12);
    const hi = 1 - 0.75 * sp.far, lo = 1 + 0.8 * sp.far;
    const [cf, cd, cv] = G.crack, b = G.body, B = G.blast, T = G.thump;
    const u = shot ? shot.under : 1; // under a recording the synthesis only adds bass and room
    if (shot) {
      this._sample(o, buf, { offset: shot.cut[0], len: shot.cut[1], rate: shot.rate * this.pv, vol: shot.vol });
      this._noiseBurst(o, { type: 'highpass', f0: cf, q: 0.7, dur: 0.012, vol: cv * 0.45 * hi, attack: 0.0002 }); // extra snap
    } else {
      this._noiseBurst(o, { type: 'highpass', f0: cf, q: 0.7, dur: cd, vol: cv * hi, attack: 0.0002 });
      this._noiseBurst(o, { type: 'none', dur: 0.0012, vol: cv * 0.5 * hi, attack: 0.0001 }); // full-band spike
      this._noiseBurst(o, { f0: b[0], f1: b[1], q: b[2], dur: b[3], vol: b[4] * hi, attack: 0.0006 });
      this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: B[0], f1: B[1], dur: B[2], vol: B[3], attack: 0.001 });
      if (G.punch) this._thump(o, { type: 'triangle', f0: G.punch[0], f1: G.punch[1], dur: G.punch[2], vol: G.punch[3] * hi });
    }
    this._thump(o, { f0: T[0], f1: T[1], dur: T[2], vol: T[3] * lo * u });
    if (G.sub) this._thump(o, { f0: G.sub[0], f1: G.sub[1], dur: G.sub[2], vol: G.sub[3] * lo * u, delay: 0.004 });
    if (G.whoosh) {
      const [f0, f1, dur, vol] = G.whoosh;
      this._noiseBurst(o, { f0, f1, q: 1.1, dur, vol: vol * hi, attack: 0.05, delay: 0.01 });
      this._noiseBurst(o, { type: 'highpass', f0: 3500, f1: 1800, dur: dur * 0.8, vol: vol * 0.35 * hi, attack: 0.03, delay: 0.02 });
    }
    if (G.bolt) this._cut(o, 'click', { delay: G.bolt[0], vol: G.bolt[1] * hi, rate: G.bolt[2] });
    if (G.cycle) this._cut(o, G.cycle[0], { delay: G.cycle[1], vol: G.cycle[2] * hi, rate: G.cycle[3] });
    this._tail(o, G.tail, rand(0.85, 1.15), hi * u, lo * u);
  }

  // the street answering: low rumble, a darker mid wash, and a few discrete slap echoes off nearby walls
  _tail(o, [dur, lp, vol, slaps, spacing], len, hi, lo) {
    const d = dur * len;
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: lp, f1: 70, dur: d, vol: vol * lo, attack: 0.012, delay: 0.004 });
    this._noiseBurst(o, { f0: lp * 1.4, f1: lp * 0.3, q: 0.6, dur: d * 0.55, vol: vol * 0.35 * hi, attack: 0.008, delay: 0.01 });
    let t = 0;
    for (let i = 0; i < slaps; i++) {
      t += 0.035 * spacing * rand(0.8, 1.3);
      const v = vol * 0.9 * 0.62 ** i;
      this._noiseBurst(o, { f0: 1100, f1: 450, q: 0.9, dur: 0.05 + 0.02 * i, vol: v * hi, attack: 0.002, delay: t });
      this._thump(o, { f0: 95, f1: 50, dur: 0.08 + 0.03 * i, vol: v * 0.7 * lo, delay: t });
    }
  }

  // ---- reloads and handling (opts.weapon = weapon id, opts.dur = reload length) ----
  _arms(opts) { return ARMS[opts.weapon] || ARMS.pistol; }

  // the catch pressed and the mag sliding out of the well
  _magOut(o, opts) { this._cut(o, 'magOut', { rate: this._arms(opts).rate }); }
  // the mag clattering on the floor (Character.dropMag: when it lands)
  _magLand(o, opts) {
    const A = this._arms(opts);
    this._cut(o, 'plastic', { vol: 0.45, rate: 0.9 * A.rate });
    this._cut(o, 'casing', { vol: 0.2, rate: 0.7, delay: rand(0.07, 0.1) });
  }
  // fresh mag pushed up the well and seated
  _magIn(o, opts) { this._cut(o, 'magIn', { rate: this._arms(opts).rate }); }
  // the weapon's action worked by hand (end of a reload, picking a gun up)
  _rack(o, opts) {
    const A = this._arms(opts);
    this._cut(o, A.rack, { rate: A.rate });
  }
  // one round loaded: a shell thumbed into the tube, or a rocket thunking home
  _shellIn(o, opts) {
    const A = this._arms(opts);
    if (A.load !== 'rocket') { this._cut(o, 'shellIn', { rate: A.rate }); return; }
    this._cut(o, 'magIn', { rate: A.rate });
    this._cut(o, 'thud', { vol: 0.6, rate: 1.1, delay: 0.05 });
  }
  // grabbing / shouldering a gun: hands on it, loose parts moving (+ a launcher's rocket sliding in over the reload)
  _handle(o, opts) {
    const A = this._arms(opts);
    this._cut(o, 'handle', { rate: A.rate });
    if (A.load === 'rocket' && opts.dur) {
      this._noiseBurst(o, { f0: 500, f1: 900, q: 1.5, dur: opts.dur * 0.55, vol: 0.3, attack: opts.dur * 0.4, delay: opts.dur * 0.35 });
    }
  }
  // a melee weapon taken in hand has its own grip, a gun its handling
  _pickup(o, opts) { if (!this._synth(o, 'grip', opts)) this._handle(o, opts); }
  // dry fire: hammer / striker falling on nothing
  _click(o, opts) { this._cut(o, 'click', { rate: this._arms(opts).rate }); }
  // a casing bouncing on the floor (CASINGS kind, default 9 mm brass), bounces closer and quieter each time
  _shell(o, opts) {
    const C = CASINGS[opts.kind] || CASINGS['9mm'];
    let t = opts.delay || 0, gap = rand(0.07, 0.11), vol = 1;
    for (let i = 0, n = opts.bounces ?? C.n; i < n; i++) {
      this._cut(o, C.set, { vol, rate: C.rate * (1 + 0.05 * i), delay: t });
      this._touch(o, C, vol, t);
      t += gap;
      gap *= 0.6;
      vol *= 0.45;
    }
  }
  _touch(o, C, vol, delay) {
    if (C.ring) {
      const [f, r, dur, v] = C.ring, k = rand(0.92, 1.08);
      this._noiseBurst(o, { type: 'highpass', f0: 7000, dur: 0.006, vol: v * 0.8 * vol, attack: 0.0003, delay });
      this._ring(o, f * k, dur, v * vol, delay);
      this._ring(o, f * k * r, dur * 0.6, v * 0.5 * vol, delay);
    } else if (C.tap) {
      const [f, dur, v] = C.tap;
      this._noiseBurst(o, { f0: f * rand(0.9, 1.1), q: 1.4, dur, vol: v * vol, attack: 0.0006, delay });
    }
  }
  // a round whining off a hard surface: a narrow band of noise falling away after the hit
  _ricochet(o) {
    const f = rand(3200, 4600);
    this._noiseBurst(o, { f0: f, f1: f * rand(0.3, 0.45), q: 14, dur: rand(0.18, 0.3), vol: 0.9, attack: 0.004, delay: 0.005 });
  }

  // ---- voices ----
  // someone hit for good: a short cry (opts.pitch: his voice)
  // a runner out of breath: air in, air out (filtered noise, no voice)
  _pant(o) {
    this._noiseBurst(o, { f0: 1500, f1: 2300, q: 1.6, dur: 0.16, vol: 0.5, attack: 0.05 });
    this._noiseBurst(o, { f0: 1100, f1: 700, q: 1.2, dur: 0.24, vol: 0.7, attack: 0.03, delay: 0.2 });
  }

  // the sniff after a sob
  _sob(o) { this._noiseBurst(o, { f0: 1900, f1: 2700, q: 2, dur: 0.12, vol: 0.3, attack: 0.04, delay: 0.62 }); }

  // someone hit for good: his recorded cry, and a hoarse falling one under it
  _cry(o) {
    this._cut(o, Math.random() < 0.6 ? 'die' : 'pain', { vol: 0.6 });
    this._voice(o, { f: 185, bend: [[0, 1.15], [0.3, 1], [1, 0.6]], from: VOWEL.a, to: VOWEL.o, dur: rand(0.38, 0.55), vol: 0.4, rough: 0.8, breath: 0.14 });
  }

  // ---- fire, alarm, UI ----
  // shop alarm: an electric bell, one burst per call (the alarm repeats it): the hammer on the gong 22 times a
  // second, each stroke the same recorded ring of metal (the most bell-like cut of the bank, about 3.6 kHz)
  _shopAlarm(o) {
    const buf = this.buffers.foley;
    if (!buf) return;
    const [offset, len] = BANK.metalBreak[2];
    for (let i = 0; i < 12; i++) {
      this._sample(o, buf, { offset, len: Math.min(len, 0.11), rate: 0.86 + (i & 1) * 0.012, vol: i ? 0.5 : 0.62, delay: i * 0.045, fade: 0.04 });
    }
  }

  // the bar's fire alarm: a big electric gong, one half-second burst per call (systems/Sprinklers.js repeats it): the
  // shop bell's recorded ring slowed into a bigger bell, struck 18 times a second, a low hum of its coil under it
  _fireBell(o) {
    const buf = this.buffers.foley;
    if (buf) {
      const [offset, len] = BANK.metalBreak[2];
      for (let i = 0; i < 9; i++) this._sample(o, buf, { offset, len: Math.min(len, 0.12), rate: 0.62 + (i & 1) * 0.01, vol: i ? 0.5 : 0.6, delay: i * 0.055, fade: 0.05 });
    }
    for (let i = 0; i < 9; i += 2) this._ring(o, 690, 0.1, 0.07, i * 0.055);
  }
  // the arcade cabinet's bell when it is shaken: two strokes of the shop bell's cut, short and higher
  _ding(o) {
    const buf = this.buffers.foley;
    if (!buf) return;
    const [offset, len] = BANK.metalBreak[2];
    [1.9, 2.4].forEach((rate, i) => this._sample(o, buf, { offset, len: Math.min(len, 0.3), rate, vol: 0.6, delay: i * 0.09, fade: 0.1 }));
  }
  // a jukebox knocked off its record: the needle rips across (a swish), then the turntable drags down to a stop
  // (a creak turning slower and slower)
  _derail(o) {
    const buf = this.buffers.foley;
    if (!buf) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.05, [offset, len] = BANK.creak[0], [rip, ripLen] = BANK.swish[0];
    this._sample(o, buf, { offset: rip, len: ripLen, rate: 2.6, vol: 0.6 });
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    s.loop = true;
    s.loopStart = offset;
    s.loopEnd = offset + len;
    s.playbackRate.setValueAtTime(2, t);
    s.playbackRate.exponentialRampToValueAtTime(0.3, t + 1.1);
    g.gain.setValueAtTime(0.8, t);
    g.gain.linearRampToValueAtTime(0, t + 1.15);
    s.connect(g);
    g.connect(o);
    o._n++;
    s.onended = () => this._release(o, s, g);
    s.start(t, offset);
    s.stop(t + 1.17);
  }
  // a police siren far across the city, one wail per call (systems/Sirens.js repeats it): up and back down, its
  // highs eaten by the distance, drowned in the hall; opts.pan and opts.pitch tell two cars apart
  _siren(o, opts) {
    const ctx = this.ctx, t = ctx.currentTime, dur = 4.6, k = opts.pitch || 1;
    const air = ctx.createBiquadFilter(), env = ctx.createGain();
    air.type = 'lowpass';
    air.frequency.value = 1000;
    air.Q.value = 0.5;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 0.5);
    env.gain.setValueAtTime(1, t + dur - 0.6);
    env.gain.linearRampToValueAtTime(0.0001, t + dur);
    const side = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (side.pan) side.pan.value = opts.pan || 0;
    env.connect(air);
    air.connect(side);
    side.connect(o);
    const oscs = [['sawtooth', 1], ['square', 1.006]].map(([type, d]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(520 * k * d, t);
      osc.frequency.exponentialRampToValueAtTime(1150 * k * d, t + dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(520 * k * d, t + dur);
      g.gain.value = 0.3;
      osc.connect(g);
      g.connect(env);
      o._n++;
      osc.start(t);
      osc.stop(t + dur + 0.01);
      return [osc, g];
    });
    oscs.forEach(([osc, g], i) => { osc.onended = () => this._release(o, osc, g, ...(i ? [env, air, side] : [])); });
  }
  // car alarm: one whoop of a harsh horn siren per call (the vehicle repeats it), at a steady level
  _alarm(o) {
    const ctx = this.ctx, t = ctx.currentTime, dur = 0.37;
    const horn = ctx.createBiquadFilter(), env = ctx.createGain();
    horn.type = 'bandpass';
    horn.frequency.value = 2300;
    horn.Q.value = 0.9;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 0.008);
    env.gain.setValueAtTime(1, t + dur - 0.03);
    env.gain.linearRampToValueAtTime(0, t + dur);
    env.connect(horn);
    horn.connect(o);
    const oscs = [['sawtooth', 1], ['square', 1.007]].map(([type, k]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(800 * k, t);
      osc.frequency.exponentialRampToValueAtTime(1600 * k, t + dur * 0.9);
      g.gain.value = 0.3;
      osc.connect(g);
      g.connect(env);
      o._n++;
      osc.start(t);
      osc.stop(t + dur + 0.01);
      return [osc, g];
    });
    oscs.forEach(([osc, g], i) => { osc.onended = () => this._release(o, osc, g, ...(i ? [env, horn] : [])); });
  }
  // gas under pressure through a hole: a hard bright hiss over the roar of its flame (pitch climbs with the fuse)
  _hiss(o, opts) {
    const p = opts.pitch || 1;
    this._noiseBurst(o, { type: 'bandpass', f0: 4600 * p, f1: 5400 * p, q: 1.1, dur: 0.3, vol: 0.55, attack: 0.04 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 900, f1: 700, dur: 0.3, vol: 0.6, attack: 0.05 });
  }
  // a match struck: the head rasping on the strip in a few uneven grains, the pop as it takes, then its small hiss
  _match(o) {
    for (const [d, f, v] of [[0, 2600, 0.5], [0.035, 3400, 0.7], [0.065, 2900, 0.6], [0.1, 3800, 0.45]]) {
      this._noiseBurst(o, { f0: f, f1: f * 0.8, q: 2.2, dur: 0.03, vol: v, attack: 0.002, delay: d });
    }
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 500, f1: 3200, dur: 0.22, vol: 0.9, attack: 0.01, delay: 0.13 });
    this._noiseBurst(o, { type: 'highpass', f0: 5200, f1: 6500, dur: 0.6, vol: 0.12, attack: 0.05, delay: 0.16 });
  }
  _ignite(o) {
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 300, f1: 2200, dur: 0.5, vol: 1.1, attack: 0.12 });
    this._thump(o, { f0: 60, f1: 85, dur: 0.4, vol: 0.5 });
  }
  // a kill confirmed (synthesized, asked for by the user; he found a chime too arcade, then a struck-metal "dink" too
  // much like a bottle, then wanted a deep, low reward, not too strong): a boom felt more than heard (CONFIRM_BOOM: a
  // sine falling an octave, its upper body for small speakers, a breath of low air after it), a dry knock, and one
  // short muted note that climbs a scale with each kill of the chain (opts.n), so a rampage plays a rising line. A new
  // kill chokes the last one's boom (META confirm.choke) and each boom of a chain is a little shorter: no mud.
  _confirm(o, opts) {
    const n = opts.n || 1, step = CONFIRM_SCALE[Math.min(n - 1, CONFIRM_SCALE.length - 1)], f = CONFIRM_ROOT * 2 ** (step / 12), d = 0.012;
    const { sub, body, air } = CONFIRM_BOOM, short = 1 / (1 + 0.08 * Math.min(n - 1, 5));
    this.pv = 1;
    this._thump(o, { f0: sub[0], f1: sub[1], dur: sub[2] * short, vol: sub[3], delay: d });
    this._thump(o, { type: 'triangle', f0: body[0], f1: body[1], dur: body[2], vol: body[3], delay: d });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: air[0], f1: 60, dur: air[1] * short, vol: air[2], attack: 0.008, delay: d });
    this._noiseBurst(o, { f0: 820, f1: 420, q: 1.1, dur: 0.04, vol: 0.22, attack: 0.0005, delay: d });      // the knock
    // the note: harmonic partials dying fast, a muted pluck (inharmonic ones rang like a bottle: the user's word)
    for (const [ratio, vol, dur] of [[1, 0.24, 0.14], [2, 0.08, 0.08], [3, 0.03, 0.045]]) this._ring(o, f * ratio, dur, vol, d + 0.01);
  }
  // level cleared: one dark boom rolling away
  _clear(o) {
    this._thump(o, { f0: 75, f1: 30, dur: 1.4, vol: 1.0 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 700, f1: 60, dur: 1.6, vol: 0.9, attack: 0.01 });
    this._noiseBurst(o, { f0: 2500, f1: 600, q: 0.5, dur: 1.2, vol: 0.1, attack: 0.3 });
  }

  // a car horn (HORN): opts.honks beeps (1: one held, more: short and quick, an impatient driver); opts.pitch: its horn
  _horn(o, opts) {
    const n = Math.max(1, Math.round(opts.honks || 1));
    let at = 0;
    for (let i = 0; i < n; i++) {
      const hold = rand(...(n > 1 ? HORN.beep : HORN.held));
      this._honk(o, opts.pitch || 1, at, hold);
      at += hold + rand(...HORN.space);
    }
  }
  // one beep: both horns at once, square waves softly clipped, the boom cut, the nasal band pushed, the fizz taken off
  _honk(o, p, delay, hold) {
    const ctx = this.ctx, H = HORN, t = ctx.currentTime + delay, end = t + H.attack + hold + H.release;
    const g = ctx.createGain(), ws = ctx.createWaveShaper(), srcs = [];
    const [hp, hp2, band, lp] = ['highpass', 'highpass', 'peaking', 'lowpass'].map((type) => { const f = ctx.createBiquadFilter(); f.type = type; return f; });
    if (!this.hornCurve) {
      this.hornCurve = new Float32Array(1025);
      const k = (x) => Math.tanh((x + H.bias) * H.drive) - Math.tanh(H.bias * H.drive);
      for (let i = 0; i < 1025; i++) this.hornCurve[i] = k(i / 512 - 1) / k(1);
    }
    ws.curve = this.hornCurve;
    hp.frequency.value = hp2.frequency.value = H.hp;
    [band.frequency.value, band.Q.value, band.gain.value] = H.band;
    lp.frequency.value = H.lp;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(H.level, t + H.attack);
    g.gain.setValueAtTime(H.level, t + H.attack + hold);
    g.gain.linearRampToValueAtTime(0, end);
    H.notes.forEach((f, i) => {
      const src = ctx.createOscillator(), share = ctx.createGain();
      src.type = 'square';
      src.frequency.value = f * p;
      src.detune.value = i ? H.cents : -H.cents;
      share.gain.value = 0.5;
      src.connect(share); share.connect(ws);
      src.start(t);
      src.stop(end + 0.02);
      srcs.push(src, share);
    });
    ws.connect(hp); hp.connect(hp2); hp2.connect(band); band.connect(lp); lp.connect(g); g.connect(o);
    o._n++;
    srcs[0].onended = () => this._release(o, ...srcs, ws, hp, hp2, band, lp, g);
  }

  // ---- the far city (soundscape CITY): long one-shots, rendered by Beds.js or synthesized here ----
  // a cut of a rendered one-shot (BEDS `once`) for voice o (into node `to`, o itself by default): mark i of it (or a
  // random one), from `skip` s into it, for `len` s (looping if that is longer than the rest of the mark), its playback
  // rate gliding through `rate` ([[s, rate]...]); returns its source, or null while it is not rendered yet
  _cue(o, key, { to = o, mark = null, skip = 0, len = Infinity, rate = [[0, 1]], vol = 1, fade = 0.05, delay = 0 } = {}) {
    const buf = this._bakeBed(key), ctx = this.ctx;
    if (!buf) return null;
    const marks = this.bedMarks[key] || [[0, buf.duration]], [m0, mLen] = marks[mark ?? Math.floor(Math.random() * marks.length)];
    const t = ctx.currentTime + delay, dur = Math.min(len, Number.isFinite(len) ? len : mLen - skip);
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    s.loop = dur > mLen - skip;
    s.playbackRate.setValueAtTime(rate[0][1], t);
    for (const [at, r] of rate.slice(1)) s.playbackRate.linearRampToValueAtTime(r, t + at);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + Math.max(0, dur - fade));
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(g);
    g.connect(to);
    o._n++;
    s.onended = () => this._release(o, s, g);
    s.start(t, m0 + skip);
    s.stop(t + dur + 0.02);
    return s;
  }

  // a moving source: a panner sweeping from one side to the other (dir +-1, width 0..1) over dur s, into o
  _sweep(o, dir, width, dur) {
    const ctx = this.ctx, t = ctx.currentTime, g = ctx.createGain();
    if (!ctx.createStereoPanner) { g.connect(o); return g; }
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-dir * width, t);
    p.pan.linearRampToValueAtTime(dir * width, t + dur);
    g.connect(p);
    p.connect(o);
    g._pan = p;
    return g;
  }

  // the elevated train going by a block away (the far city's, heard in play): its rendered passage, the
  // wheels on the joints, the rumble and the screech, crossing from one side to the other, its pitch dropping as it
  // goes past (Doppler); opts.dir: which way
  _train(o, opts) {
    const dur = 22, mid = dur / 2, mix = this._sweep(o, opts.dir < 0 ? -1 : 1, 0.75, dur), k = rand(0.94, 1.06);
    const s = this._cue(o, 'train', { to: mix, rate: [[0, k * 1.012], [mid - 3, k * 1.01], [mid + 3, k * 0.99], [dur, k * 0.988]] });
    this._let(o, mix, s);
  }
  // a car alarm going off streets away: a few seconds of its cycle, from wherever it is in it, then somebody shuts it
  _farAlarm(o) {
    this._cue(o, 'carAlarm', { skip: rand(0, 8), len: rand(5, 8.5), rate: [[0, rand(0.94, 1.06)]], fade: 0.03 });
  }
  // a dog barking down the block, another answering it now and then
  _dog(o) {
    this._cue(o, 'dog', { rate: [[0, rand(0.92, 1.08)]] });
    if (Math.random() < 0.35) this._cue(o, 'dog', { rate: [[0, rand(0.8, 0.9)]], vol: 0.6, delay: rand(1.2, 2.4) });
  }
  // the node chain of a moving cut, let go with its source
  _let(o, mix, s) {
    if (!s) { mix.disconnect(); return; }
    const end = s.onended;
    s.onended = () => { end(); mix.disconnect(); mix._pan?.disconnect(); };
  }

  // a police car crossing the city a few blocks away: its siren swelling as it comes and dying as it goes, wailing,
  // then yelping a while, its pitch dropping as it passes (Doppler), from one side to the other, through its small
  // horn speaker (the distance takes the rest: _out). opts.dir: which way it goes.
  _farSiren(o, opts) {
    const ctx = this.ctx, t = ctx.currentTime, dur = rand(10, 15), mid = dur * rand(0.4, 0.6), k = rand(0.93, 1.07);
    const N = 1200, freq = new Float32Array(N), level = new Float32Array(N), yelp = [rand(0.2, 0.5), rand(0.55, 0.8)];
    let ph = 0;
    for (let i = 0; i < N; i++) {
      const u = (i / (N - 1)) * dur, fast = u > yelp[0] * dur && u < yelp[1] * dur; // the yelp a while
      ph += dur / (N - 1) / (fast ? 0.33 : 4.2);
      const sweep = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph), dop = 1 - 0.028 * Math.tanh((u - mid) / 1.6);
      freq[i] = (560 + 640 * sweep) * dop * k;
      level[i] = Math.min(1, u / 1.5, (dur - u) / 1.5) / (1 + ((u - mid) / 3.2) ** 2);
    }
    const mix = this._sweep(o, opts.dir < 0 ? -1 : 1, 0.7, dur), env = ctx.createGain(), horn = ctx.createBiquadFilter();
    horn.type = 'lowpass';
    horn.frequency.value = 1600;
    horn.Q.value = 0.6;
    env.gain.setValueCurveAtTime(level, t, dur);
    env.connect(horn);
    horn.connect(mix);
    const oscs = [['sawtooth', 1], ['square', 1.006]].map(([type, d]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueCurveAtTime(freq.map((f) => f * d), t, dur);
      g.gain.value = 0.3;
      osc.connect(g);
      g.connect(env);
      o._n++;
      osc.start(t);
      osc.stop(t + dur + 0.01);
      return [osc, g];
    });
    oscs.forEach(([osc, g], i) => { osc.onended = () => this._release(o, osc, g, ...(i ? [env, horn, mix, ...(mix._pan ? [mix._pan] : [])] : [])); });
  }

  // ---- the night around: the wind, drops (systems/Ambience.js), the opening cinematic's city ----
  // one long swell of the city's far-off wash: brown noise kept low (lower still from indoors, opts.inside 0..1) under
  // a breath of tyre hiss; each swell sits a little to one side and overlaps the next (in play the city is a bed)
  _air(o, { inside = 0, dur = 9 }) {
    const ctx = this.ctx, t = ctx.currentTime, end = t + dur;
    const env = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1 - 0.45 * inside, t + dur * 0.45);
    env.gain.linearRampToValueAtTime(0.0001, end);
    if (pan) { pan.pan.value = rand(-0.5, 0.5); env.connect(pan); pan.connect(o); } else env.connect(o);
    const low = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
    low.buffer = this.brown; low.loop = true;
    lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.value = (380 - 240 * inside) * rand(0.85, 1.15);
    low.connect(lp); lp.connect(env);
    const hiss = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), hg = ctx.createGain();
    hiss.buffer = this.noise; hiss.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 0.5;
    bp.frequency.value = rand(600, 1100);
    hg.gain.value = 0.05 * (1 - inside);
    hiss.connect(bp); bp.connect(hg); hg.connect(env);
    this._pair(o, [low, lp], [hiss, bp, hg], [env, pan], t, end);
  }

  // two looped sources of one sound, their own nodes after them, started together and let go together with what they share
  _pair(o, a, b, shared, t, end) {
    o._n += 2;
    let left = 2;
    const fin = () => { if (--left === 0) for (const n of shared) n?.disconnect(); };
    for (const nodes of [a, b]) {
      nodes[0].onended = () => { fin(); this._release(o, ...nodes); };
      nodes[0].start(t, Math.random() * 1.5);
      nodes[0].stop(end + 0.05);
    }
  }

  // a gust of wind down the street: air through a band that rises and falls with it over a low rumble, crossing from
  // the side it comes from (opts.pan: -1 from the right to the left .. 1)
  _gust(o, { pan = 0, dur = 3.6 }) {
    const ctx = this.ctx, t = ctx.currentTime, end = t + dur, mid = t + dur * rand(0.35, 0.5);
    const env = ctx.createGain(), sp = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, mid);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    if (sp) {
      sp.pan.setValueAtTime(-0.7 * pan, t);
      sp.pan.linearRampToValueAtTime(0.7 * pan, end);
      env.connect(sp); sp.connect(o);
    } else env.connect(o);
    const air = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ag = ctx.createGain();
    air.buffer = this.noise; air.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.linearRampToValueAtTime(rand(520, 760), mid);
    bp.frequency.linearRampToValueAtTime(300, end);
    ag.gain.value = 0.5;
    air.connect(bp); bp.connect(ag); ag.connect(env);
    const low = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
    low.buffer = this.brown; low.loop = true;
    lp.type = 'lowpass'; lp.frequency.value = 220;
    low.connect(lp); lp.connect(env);
    this._pair(o, [air, bp, ag], [low, lp], [env, sp], t, end);
  }

  // a drop of water on a wet floor: a short note that climbs as the drop closes over, then a smaller one behind it
  _drip(o) {
    const ctx = this.ctx, t = ctx.currentTime, f = rand(850, 1500), nodes = [];
    const drop = (at, f0, vol) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.frequency.setValueAtTime(f0 * this.pv, at);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.7 * this.pv, at + 0.03);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      osc.connect(g); g.connect(o);
      osc.start(at); osc.stop(at + 0.09);
      nodes.push(osc, g);
      return osc;
    };
    drop(t, f, 0.9);
    const last = drop(t + rand(0.07, 0.11), f * rand(1.15, 1.35), 0.3);
    o._n++;
    last.onended = () => this._release(o, ...nodes);
  }

  // ---- the life of the bar and its toilets (systems/Ambience.js events) ----
  // glass on glass: two tumblers touched (a toast) or one set down on a table; three inharmonic partials ringing over
  // a tap of the recorded glass
  _clink(o) {
    const f = rand(1700, 2900), toast = Math.random() < 0.4;
    for (const at of toast ? [0, rand(0.03, 0.07)] : [0]) {
      const k = at ? rand(1.05, 1.2) : 1;
      this._cut(o, 'glassHit', { vol: 0.2, rate: rand(1.6, 2.2), delay: at });
      this._ring(o, f * k, 0.5, 0.35, at);
      this._ring(o, f * k * 2.32, 0.25, 0.14, at);
      this._ring(o, f * k * 4.1, 0.12, 0.06, at);
    }
    if (!toast) this._cut(o, 'wood', { vol: 0.25, rate: rand(1.4, 1.7) });
  }
  // ice cubes swirled in a glass: a handful of small knocks on its side, each ringing high and short
  _ice(o) {
    let t = 0;
    for (let i = 0, n = 3 + Math.floor(rand(0, 4)); i < n; i++) {
      t += rand(0.04, 0.12);
      const f = rand(2600, 4200);
      this._ring(o, f, rand(0.04, 0.08), rand(0.12, 0.3), t);
      this._ring(o, f * 1.9, 0.03, 0.06, t);
    }
    this._cut(o, 'glassHit', { vol: 0.1, rate: rand(2.4, 2.9) });
  }
  // a bottle set down on the counter: glass on wood, the bottle's own low note
  _bottle(o) {
    this._cut(o, 'glassHit', { vol: 0.3, rate: rand(0.8, 1) });
    this._cut(o, 'wood', { vol: 0.45, rate: rand(1.1, 1.4) });
    this._ring(o, rand(650, 900), 0.18, 0.22);
  }
  // a drink poured: the stream into the glass, and its bubbles, their note rising as it fills
  _pour(o) {
    const dur = rand(0.9, 1.5), f0 = rand(380, 520);
    this._noiseBurst(o, { f0: 900, f1: 1400, q: 0.8, dur, vol: 0.1, attack: 0.08 });
    for (let t = 0.05; t < dur; t += rand(0.04, 0.1)) this._bubble(o, f0 * (1 + 1.2 * (t / dur)) * rand(0.85, 1.15), t, rand(0.08, 0.22));
  }
  // one bubble bursting in water: a note that climbs as it closes
  _bubble(o, f, delay, vol) { this._thump(o, { f0: f, f1: f * 1.6, dur: 0.04, vol, delay }); }
  // the till: keys punched, its bell, the drawer sliding out
  _till(o) {
    let t = 0;
    for (let i = 0; i < 3; i++, t += rand(0.12, 0.18)) this._cut(o, 'click', { vol: 0.35, rate: rand(1.1, 1.4), delay: t });
    this._ring(o, 2093, 0.9, 0.25, t);
    this._ring(o, 2093 * 2.76, 0.4, 0.07, t);
    this._cut(o, 'rattle', { vol: 0.35, rate: 1.2, delay: t + 0.05 });
    this._cut(o, 'metal', { vol: 0.25, rate: 1.3, delay: t + 0.3 });
  }
  // a cistern filling after a flush: water hissing through the valve and running in, fading as it fills, bubbles in
  // the tank, then the float shuts it off
  _cistern(o) {
    const dur = rand(4.5, 6);
    this._noiseBurst(o, { f0: 1800, f1: 2600, q: 2.5, dur, vol: 0.22, attack: 0.3 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 600, f1: 300, dur, vol: 0.4, attack: 0.2 });
    for (let t = 0.2; t < dur - 0.4; t += rand(0.12, 0.4)) this._bubble(o, rand(300, 700), t, rand(0.04, 0.12) * (1 - t / dur));
    this._cut(o, 'click', { vol: 0.35, rate: 0.7, delay: dur });
    this._cut(o, 'thud', { vol: 0.15, rate: 1.5, delay: dur });
  }
  // somebody laughing across the room (Beds.js renders the voice, a few of each, a man's or a woman's by opts.pitch)
  _laugh(o, opts) {
    const who = (opts.pitch ?? 1) > 1.18 ? 'f' : 'm', list = (this.laughs[who] ||= []), i = this._bag('laugh.' + who, 4);
    if (!list[i]) {
      const sr = 22050, d = renderLaugh(i * 104729 + (who === 'f' ? 7 : 3), who === 'f', sr), buf = this.ctx.createBuffer(1, d.length, sr);
      buf.getChannelData(0).set(d);
      list[i] = { buf, len: d.length / sr };
    }
    this._sample(o, list[i].buf, { len: list[i].len, rate: rand(0.96, 1.04), fade: 0.05 });
  }

  // ---- a vehicle driven live (the getaway: World.stepOutro; its numbers: Motor.js) ----
  // key: whose; m: { x, y, revs (share of the redline), load (0..1 throttle), squeal (0..1), road (0..1 its speed),
  // fade (0..1), pops (exhaust pops to fire now) }, or null to let it go. Called every frame; each part follows its
  // value within VOICE.tau, and the voice fades out by itself VOICE.hold s after its last update (a skip, a pause).
  // While it runs the music dips a little under it (VOICE.duck).
  motor(key, m) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, V = VOICE;
    let mv = this.motors[key];
    if (!m) { if (mv) this._motorStop(key, mv, now); return; }
    if (!mv) mv = this.motors[key] = this._motorVoice(key);
    const P = mv.p, set = (param, v) => param.setTargetAtTime(v, now, V.tau), lerp = (a, b, k) => a + (b - a) * k;
    const sp = this._spatial({ x: m.x, y: m.y }, V.reach), fade = clamp(m.fade ?? 1, 0, 1);
    const revs = clamp(m.revs, 0, 1.05), load = clamp(m.load, 0, 1), road = clamp(m.road, 0, 1.2), sq = clamp(m.squeal, 0, 1);
    this._glide(mv.out.gain, sp.vol * V.gain * fade, now, V.tau, V.hold);
    if (mv.pan.pan) set(mv.pan.pan, sp.pan);
    const fire = cycleHz(revs) * 8; // the firing frequency
    set(P.osc.frequency, cycleHz(revs));
    set(P.pre.gain, lerp(V.drive[0], V.drive[1], load) / 4);
    set(P.tone.frequency, lerp(V.tone[0], V.tone[1], revs) * (0.55 + 0.45 * load));
    set(P.body.gain, V.body * (0.5 + 0.5 * load));
    set(P.growlBp.frequency, clamp(fire * V.growlBand[0], V.growlBand[1], V.growlBand[2]));
    set(P.growl.gain, V.growl * (0.2 + 0.8 * load) * (0.3 + 0.7 * revs));
    set(P.whine.frequency, lerp(V.whineK[0], V.whineK[1], Math.min(1, road)));
    set(P.whineG.gain, V.whine * load * Math.min(1, road * 2));
    set(P.road.gain, V.road * road ** 1.5);
    set(P.hiss.gain, V.hiss * road * road);
    set(P.squeal.gain, V.squeal * sq);
    P.parts.forEach((bp, i) => set(bp.frequency, lerp(V.squealHz[0], V.squealHz[1], sq) * V.squealParts[i][0]));
    for (const s of mv.srcs) s.stop(now + V.hold + 1.5); // without news it stops by itself
    // the music under it: down while it roars, back up once it is gone
    const g = this.dip.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(1 - (1 - V.duck) * fade, now, 0.2);
    g.setTargetAtTime(1, now + V.hold, 0.5);
    if (m.pops > 0) this._pops(mv.mix, m.pops, fade);
  }

  // the parts of a vehicle's voice, all running from now on (see motor and VOICE)
  _motorVoice(key) {
    const ctx = this.ctx, V = VOICE, srcs = [], nodes = [];
    const gain = (v) => { const n = ctx.createGain(); n.gain.value = v; nodes.push(n); return n; };
    const bq = (type, f, q, db = 0) => {
      const n = ctx.createBiquadFilter();
      n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = db;
      nodes.push(n);
      return n;
    };
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; srcs.push(s); return s; };
    const osc = (type, f) => { const s = ctx.createOscillator(); s.type = type; s.frequency.value = f; srcs.push(s); return s; };
    const chain = (...n) => n.reduce((a, b) => (a.connect(b), b));
    const out = gain(0), mix = gain(1), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1), hall = gain(V.hall);
    nodes.push(pan);
    chain(mix, pan, out, this.sfx);
    out.connect(hall);
    hall.connect(this.hall);
    mix._n = 0; mix._chain = []; // the pops' one-shots go into it (_noiseBurst)
    // the engine: the V8's cycle, driven into a soft clip, through the exhaust's tone, its boom and its rasp
    if (!this.v8Wave) {
      const { real, imag } = v8Cycle();
      this.v8Wave = ctx.createPeriodicWave(real, imag);
      const c = new Float32Array(1025);
      for (let i = 0; i < c.length; i++) c[i] = Math.tanh(4 * (i / 512 - 1)) / Math.tanh(4);
      this.motorCurve = c;
    }
    const p = {};
    p.osc = osc('sine', cycleHz(0.14));
    p.osc.setPeriodicWave(this.v8Wave);
    const ws = ctx.createWaveShaper();
    ws.curve = this.motorCurve;
    ws.oversample = '2x';
    nodes.push(ws);
    p.pre = gain(V.drive[0] / 4);
    p.tone = bq('lowpass', V.tone[0], 0.8);
    p.body = gain(V.body);
    chain(p.osc, p.pre, ws, p.tone, bq('peaking', ...V.boom), bq('peaking', ...V.rasp), p.body, mix);
    // the exhaust's growl: noise pulsed by the firing (the cycle wave sets its level, sample by sample)
    p.growlBp = bq('bandpass', 600, V.growlBand[3]);
    const am = gain(0);
    p.growl = gain(V.growl);
    chain(loop(this.noise), p.growlBp, am, p.growl, mix);
    p.osc.connect(am.gain);
    // the gearbox's whine, the tyres' roar and the tread's hiss
    p.whine = osc('sine', V.whineK[0]);
    p.whineG = gain(0);
    chain(p.whine, p.whineG, mix);
    p.road = gain(0);
    chain(loop(this.brown), bq('bandpass', ...V.roadBand), p.road, mix);
    p.hiss = gain(0);
    chain(loop(this.noise), bq('bandpass', ...V.hissBand), p.hiss, mix);
    // the squeal: narrow bands of noise at the rubber's pitch and its overtones, wandering, chattering
    p.squeal = gain(0);
    const flutter = gain(1 - V.flutter[1] / 2), sq = loop(this.noise);
    p.parts = V.squealParts.map(([k, q, level]) => {
      const bp = bq('bandpass', V.squealHz[0] * k, q);
      chain(sq, bp, gain(level * 4), p.squeal); // a narrow band lets little through
      return bp;
    });
    chain(p.squeal, flutter, mix);
    for (const [hz, cents] of V.wobble) {
      const depth = gain(cents);
      osc('sine', hz).connect(depth);
      for (const bp of p.parts) depth.connect(bp.detune);
    }
    const chatter = gain(V.flutter[1] / 2);
    chain(osc('sine', V.flutter[0]), chatter, flutter.gain);
    const now = ctx.currentTime, mv = { out, mix, pan, p, srcs, nodes };
    srcs.forEach((s, i) => s.start(now, s.loop ? Math.random() * 1.5 : 0));
    srcs[0].onended = () => {
      srcs.forEach((s) => s.disconnect());
      nodes.forEach((n) => n.disconnect());
      if (this.motors[key] === mv) delete this.motors[key];
    };
    return mv;
  }

  _motorStop(key, mv, now) {
    this._glide(mv.out.gain, 0, now, 0.08);
    for (const s of mv.srcs) s.stop(now + 0.6);
    delete this.motors[key];
  }

  // the exhaust popping as the throttle lifts: a few sharp cracks of gas, a little apart, with a dull thud under the
  // first ones (into the voice's mix)
  _pops(mix, n, vol) {
    this.pv = 1;
    let at = 0;
    for (let i = 0; i < n; i++) {
      at += rand(0.02, 0.07);
      const v = vol * rand(0.5, 1) * (1 - i / (n + 2));
      this._noiseBurst(mix, { type: 'bandpass', f0: rand(900, 1500), f1: rand(500, 800), q: 1.1, dur: rand(0.025, 0.05), vol: 1.6 * v, attack: 0.001, delay: at });
      if (i < 2) this._noiseBurst(mix, { src: 'brown', type: 'lowpass', f0: 420, f1: 120, q: 0.7, dur: 0.07, vol: 1.2 * v, attack: 0.002, delay: at });
    }
  }

  // the starter turning the engine over (opts.dur s) before it catches: the solenoid's clunk, the starter's whine
  // climbing, the compression's chugs quickening as it spins up
  _crank(o, { dur = 0.3 }) {
    const ctx = this.ctx, t = ctx.currentTime;
    this._cut(o, 'click', { vol: 0.9, rate: 0.5 });
    this._cut(o, 'metal', { vol: 0.35, rate: 0.6 });
    const saw = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(120, t + 0.03);
    saw.frequency.linearRampToValueAtTime(175, t + dur);
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.05);
    g.gain.setValueAtTime(0.16, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    saw.connect(bp); bp.connect(g); g.connect(o);
    o._n++;
    saw.onended = () => this._release(o, saw, bp, g);
    saw.start(t + 0.03);
    saw.stop(t + dur + 0.08);
    let at = 0.05, gap = 0.11;
    while (at < dur) {
      this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 520, f1: 140, q: 0.7, dur: 0.075, vol: 0.9, attack: 0.008, delay: at });
      this._thump(o, { f0: 72, f1: 44, dur: 0.08, vol: 0.45, delay: at });
      at += gap;
      gap = Math.max(0.07, gap * 0.86);
    }
  }

  // ---- ambient traffic ----
  // a car driving past: engine buzz + tyre roar swelling to the closest point (`lead` s) then fading, panned across
  // in the driving direction (dir +-1); side: 0 = right under the camera .. 1 = across the street; pitch drops as it passes
  _passby(o, { lead = 1, dur = 2.6, dir = 1, side = 0.5, f = 50 }) {
    const ctx = this.ctx, t = ctx.currentTime, peak = t + lead, end = t + Math.max(dur, lead + 0.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, peak);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) {
      const w = 0.85 * (0.5 + 0.5 * side);
      pan.pan.setValueAtTime(-w * dir, t);
      pan.pan.linearRampToValueAtTime(0, peak);
      pan.pan.linearRampToValueAtTime(w * dir, end);
    }
    env.connect(pan);
    pan.connect(o);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 1.05, t);
    osc.frequency.linearRampToValueAtTime(f * 1.04, Math.max(t, peak - 0.1));
    osc.frequency.linearRampToValueAtTime(f * 0.9, peak + 0.25); // doppler
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(950 - side * 450, peak);
    lp.frequency.linearRampToValueAtTime(220, end);
    const og = ctx.createGain();
    og.gain.value = 0.2;
    osc.connect(lp); lp.connect(og); og.connect(env);
    const n = ctx.createBufferSource();
    n.buffer = this.brown;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.linearRampToValueAtTime(900, peak);
    bp.frequency.linearRampToValueAtTime(380, end);
    const ng = ctx.createGain();
    ng.gain.value = 0.8;
    n.connect(bp); bp.connect(ng); ng.connect(env);
    o._n += 2;
    let left = 2;
    const fin = () => { if (--left === 0) { env.disconnect(); pan.disconnect(); } };
    osc.onended = () => { fin(); this._release(o, osc, lp, og); };
    n.onended = () => { fin(); this._release(o, n, bp, ng); };
    osc.start(t);
    n.start(t, Math.random() * 1.5);
    osc.stop(end + 0.05);
    n.stop(end + 0.05);
  }
}

const Audio = new AudioSystem();
export default Audio;
