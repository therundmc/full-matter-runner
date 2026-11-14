// The end of a level that has a getaway vehicle (DOM-free): once the way out is open and the player steps into the
// exit zone, he walks to the cab door and gets in, the lights come on, the engine starts and the van pulls away
// while black bars close the picture and it fades out, then the results come up. Data + pure functions of the
// time t (s since he stepped into the zone): World.stepOutro plays it, Game and ui/Screens.drawOutro only read it.
import { TILE } from '../Config.js';
import { clamp } from '../../engine/math.js';

export const OUTRO = {
  walk: 0.6,        // he walks to the cab door (snapped there if not reached) and gets in
  lights: 0.8,      // lights on, engine started
  go: 1.0,          // it pulls away...
  full: 2.4,        // ...and is up to speed here
  fade: [1.8, 2.5], // fade to black
  end: 2.6,         // the results
  skipAfter: 0.4,   // any key or click from then on goes straight to the results
  speed: 7,         // px per step at full speed (eased in: about 200 px by `full`)
  maxDist: 9 * TILE, // never further than this from where it was parked, whatever the timing
  bars: 0.09,       // height of each letterbox bar, share of the screen
  barsIn: 0.35,     // s for the bars to slide in
  door: 115,        // sprite x of the cab door (the van's sprite is 160 px long, nose at +x)
  reach: 8 * TILE,  // a van parked this close to the exit zone is the getaway
  cam: 0.5,         // s for the camera to go from the player to the cab, from `walk` on
  lead: 40,         // px the camera looks ahead of the cab once it moves
};

const ease = (k) => k * k * (3 - 2 * k); // smoothstep

// 'walk' -> 'board' -> 'ignition' -> 'drive' -> 'fade' -> 'done'
export function outroPhase(t, o = OUTRO) {
  if (t < o.walk) return 'walk';
  if (t < o.lights) return 'board';
  if (t < o.go) return 'ignition';
  if (t < o.fade[0]) return 'drive';
  if (t < o.end) return 'fade';
  return 'done';
}

// van speed (px per step) at time t, eased in from `go` to `full`; done: px already covered (it stops at maxDist)
export function vanSpeed(t, done = 0, o = OUTRO) {
  const k = clamp((t - o.go) / (o.full - o.go), 0, 1);
  return Math.max(0, Math.min(o.speed * k * k, o.maxDist - done));
}

// 0..1 black over the picture
export function fadeAlpha(t, o = OUTRO) {
  return ease(clamp((t - o.fade[0]) / (o.fade[1] - o.fade[0]), 0, 1));
}

// 0..1 how far the letterbox bars are in (ease out)
export function barsK(t, o = OUTRO) {
  const k = clamp(t / o.barsIn, 0, 1);
  return 1 - (1 - k) ** 3;
}

// 0..1 the camera's way from the player to the cab
export function camBlend(t, o = OUTRO) {
  return ease(clamp((t - o.walk) / o.cam, 0, 1));
}

// did the clock cross `at` during the step from t0 to t1? (one-shot beats of the timeline)
export function crossed(t0, t1, at) { return t0 < at && t1 >= at; }
