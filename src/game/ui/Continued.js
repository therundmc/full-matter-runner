// The card that closes a chase not finished yet (the level's `chase.next`; Game state 'continued', drawn by
// ui/Screens.js), t s after the end of its road: { black: 0..1 the picture going dark, title / name: 0..1 its two
// lines coming up, skip: a key may pass it, over: it is done }. Numbers: CHASE.finish. DOM-free.
import { clamp } from '../../engine/math.js';
import { CHASE } from '../data/chase.js';

export function finishView(t, F = CHASE.finish) {
  return {
    black: clamp(t / F.fade, 0, 1), title: clamp((t - F.title) / F.rise, 0, 1), name: clamp((t - F.name) / F.rise, 0, 1),
    skip: t >= F.skipAfter, over: t >= F.hold,
  };
}
