// What the standing pose (entities/CharacterAnim.js) and the poses of entities/anim/ share: the limbs' lengths, the
// ways a handgun is held, the muzzle's place on a gun, the legs' key frames, what a pose is painted of, a few easings
// and the scratch points they work in. DOM-free.
import { sprite, sw as spriteW } from '../../../engine/Assets.js';
import { clamp } from '../../../engine/math.js';

export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// the arm as drawn: shoulder joint (torso-local, under the sprite's shoulder), upper arm and forearm (their real
// lengths: an arm bent toward the floor or the eye shows shorter, its elbow out to the side), the hips' half width,
// the neck (torso-local x of the head's centre)
export const NECK = 0.9;
export const LIMB = { sx: -0.6, sy: 6.1, upper: 6.9, fore: 6.7, hip: 2.3, neck: NECK };

// a machine pistol held canted in one hand (weapons.js 'side', render/HandgunArt.js): the fist on a target, the elbow
// bent (further out for a gun whose rear would go into the chest: its back end `clear` px ahead of the body's centre),
// how far the elbow goes out (LimbArt's 0 .. 1), the gun shoulder led forward (rad); held low, the fist by the thigh,
// the gun pointing at the floor ahead (turned out, foreshortened); the kick (entities/Recoil.js) throws the muzzle
// toward the slide's top and the fist back along the arm (`up`: the share of it that goes toward the other shoulder);
// the hand closed round the grip is a little bigger than an empty fist
export const SIDE = { aim: [10, 4.3], clear: 5, elb: 0.5, twist: -0.3, low: [4.2, 8.4], lowA: 0.35, lowLen: 0.55, up: 0.3, fist: 1.1 };
export const sideReach = (d) => Math.max(SIDE.aim[0], d.grip + SIDE.clear);

// a pistol held out in both hands (weapons.js 'both'): the gun hand on a target (aim-space px), the other hand closed
// over it on the butt (`cup`: from the gun hand, in the gun's frame), how far the elbows go out (left, right); running,
// the hands come in toward the chest by `run` px; held low (low ready), the hands in before the belly, the muzzle
// pointing at the floor ahead (turned out, foreshortened); the kick (entities/Recoil.js) lifts the muzzle at the eye
// and over toward the top of the slide; reloading, the gun hand comes in to `reload`
export const PAIR = {
  aim: [11, 3.2], cup: [0.5, -1.3], elb: [0.2, 0.3], run: 2.5, low: [7, 3], lowA: 0.25, lowLen: 0.6,
  reload: [8, 2],
};

// The muzzle of gun d is the end of its sprite on the bore line: `bore` world px off the sprite's middle line (- =
// toward its top), MUZZLE_IN px in from its last column (the dark outline round the steel). w: the sprite's width.
export const MUZZLE_IN = 0.5;
export const muzzleX = (d, w) => w - MUZZLE_IN - d.grip; // from the hand along the barrel, world px

// feet key frames in move space (x forward). y = foot side * ys + leg swing side * yl
export const LEGS = {
  // over a sill: crouch, legs tucked and swung to one side, reaching for the floor, landing stance
  window: { t: [0, 0.18, 0.45, 0.72, 1], x: [1, -1, -4, 5, 1], ys: [3.6, 3.2, 2.2, 3, 3.6], yl: [0, 0, 5.5, 1.5, 0] },
  // hip slide on a hood: legs thrown forward together and swung round
  prop: { t: [0, 0.15, 0.4, 0.7, 1], x: [1, 2, 9, 8, 1], ys: [3.6, 3, 2.4, 2.4, 3.6], yl: [0, 0, 4, 3, 0] },
  // speed vault: the last step, the feet off together and tucked, carried past the hand on the far side, reaching
  // for the floor ahead, down
  speed: { t: [0, 0.12, 0.26, 0.44, 0.62, 0.8, 1], x: [1, -1.5, -2.5, 2.5, 7, 6, 1], ys: [3.6, 3.4, 1.5, 1.2, 1.6, 3, 3.6], yl: [0, 0, 3.5, 7.5, 6, 1.5, 0] },
};

export const in2 = (k) => { k = clamp(k, 0, 1); return k * k; };

// bent at the waist (P.bow = 1): px the head goes on ahead of the neck, share it shrinks (lower: further from the
// eye), share the back shows longer
export const BOW = { reach: 5, low: 0.2, long: 0.22 };

// px from the hand to the muzzle of a gun, to the far end of anything else
export const ahead = (d) => (d.kind === 'gun' ? muzzleX(d, spriteW(sprite(d.sprite))) : spriteW(sprite(d.sprite)) - d.grip);

// a man on his knees (anim/Down.js kneelPose, a held man brought down): the shins flat on the floor behind him, knees
// together, the feet turned back (pose px, aim frame)
export const YIELD_FEET = [[-6.5, -3.4], [-6.5, 3.4]];

// scratch points the poses and the painting work in (never kept from one call to the next)
export const WAY = { x: 0, y: 0 }, MOUTH = { x: 0, y: 0 }, AT = { x: 0, y: 0 }, TO = { x: 0, y: 0 };
export const SH = { x: 0, y: 0 }, TMP = { x: 0, y: 0 };

// What a pose is painted of, from the floor up; a pose alone is all of it at once, a pair's is interleaved (drawPair):
// arms: the sleeves, what is carried, and the weapon and hands that are not held over the shoulders; body: the coat's
// skirt and the torso; top: what is held over the shoulders (P.top)
export const PART = { shadow: 1, legs: 2, arms: 4, body: 8, head: 16, top: 32, all: 63 };
