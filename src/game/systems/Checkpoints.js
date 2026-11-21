// The chase's checkpoints (level 2A, docs/LEVEL2.md "Story and structure"; the user's call, 2026-11-20: with the
// tutorial's rooms, the one exception to the no-checkpoint rule). The level's `chase.checkpoints`: [{ at: col, name,
// lane?: row, cruise?: px/step }], in order, one at the start of each part of the road as it was cut (the street, the
// detour, the frontage road, the toll). A checkpoint's leg is the one holding its column (legs never overlap).
//   reached (the car's middle at `at`): kept on the game (Game.chaseAt: { name: the level's, i, time: the run's clock
//   then, score: Scoring.snapshot(), guards: the men counted then but for those still in a car, Pursuit.aboard: the
//   retry does not bring those cars back }), its name stamped on the HUD a moment (`card`), told
//   ('checkpoint' event) with a placeholder sound. The first one, at or before the car's start, is the start itself
//   (kept, never told)
//   a death after it retries there (Game.retry; World builds the chase as from it: fromCheckpoint): the car on its
//   leg's lane (ours: the last) at its cruise already rolling, no opening, the gun in hand; the events behind it not
//   replayed, those ahead armed; the props as the level has them (the level is loaded again); the clock and the score
//   as they were when it was reached (resume): a death costs the part, a run through checkpoints is ranked like any.
//   RESTART (the pause, Backspace) and a start from the menus start from the beginning.
// DOM-free.
import { TILE } from '../Config.js';
import { CHASE } from '../data/chase.js';
import { clamp } from '../../engine/math.js';
import { routeOf, legAt } from './Route.js';

// the checkpoint a retry starts at: the one the game kept for this level (Game.chaseAt), with what it kept; or null
export function resumeAt(level, at) {
  const cp = level?.chase?.checkpoints?.[at?.i];
  return cp && at.name === level.name ? { ...cp, ...at, name: cp.name } : null;
}

// the level's chase as from checkpoint cp: the car started at its column on its leg's lane (`start`, Drive), going
// its cruise; the events behind it gone (Pursuit, Lorries: not replayed), no opening. The start's own: the chase as it is
export function fromCheckpoint(chase, cp) {
  if (!cp || cp.at <= chase.van[0]) return chase;
  const legs = routeOf(chase).legs, leg = legs[legAt(legs, cp.at * TILE)];
  const row = cp.lane ?? leg.lanes?.[leg.lanes.length - 1] ?? chase.van[1];
  return {
    ...chase, start: [cp.at, row], speed: cp.cruise ?? leg.cruise, intro: null,
    events: (chase.events || []).filter((e) => e.at > cp.at),
  };
}

export default class Checkpoints {
  // from: the checkpoint this run started at (resumeAt), or null: from the beginning
  constructor(world, chase, from = null) {
    this.world = world;
    this.list = chase?.checkpoints || [];
    this.x0 = (chase?.van?.[0] ?? 0) * TILE; // the car's start: a checkpoint there is the start itself
    this.from = from;
    this.next = from ? from.i + 1 : 0;   // the next one to reach
    this.card = null;                    // the part's name on the HUD: { name, t }
  }

  // a level with checkpoints: theirs (the lab and the levels on foot have none)
  static of(world, level, at) {
    return level.chase?.checkpoints?.length ? new Checkpoints(world, level.chase, resumeAt(level, at)) : null;
  }

  // the run resumed at its checkpoint (World, once built): no opening nor grab, the clock and the score as they were
  // when it was reached; the men counted: those out by then, and those of the cars this run sets off (already
  // counted as they are made: the alley cars waiting ahead)
  resume() {
    const w = this.world, cp = this.from;
    if (!cp) return;
    w.drive?.skipGrab();
    w.clockFrom = w.time - (cp.time || 0);
    if (cp.score) w.scoring?.restore(cp.score);
    if (cp.guards !== undefined) w.totalEnemies = (w.totalEnemies || 0) + cp.guards;
  }

  // a step: the next checkpoint reached by his car (never once he is dead or past the end); the card's clock
  step(dt) {
    if (this.card && (this.card.t += dt) >= CHASE.checkpoint.hold) this.card = null;
    const w = this.world, d = w.drive;
    if (!d?.on || d.dead || !w.player?.alive || w.exited) return;
    while (this.next < this.list.length && d.van.x >= this.list[this.next].at * TILE) this.reach(this.next++);
  }

  reach(i) {
    const w = this.world, cp = this.list[i], v = w.drive.van;
    const guards = (w.totalEnemies || 0) - (w.pursuit?.aboard() ?? 0);
    if (w.game) w.game.chaseAt = { name: w.level.name, i, time: w.runTime, score: w.scoring?.snapshot(), guards };
    if (cp.at * TILE <= this.x0) return;
    this.card = { name: cp.name, t: 0 };
    w.events.emit('checkpoint', { i, name: cp.name, x: v.x, y: v.y });
    w.sound('checkpoint', v.x, v.y, 1); // placeholder (assets/sound/PLACEHOLDERS.md)
  }

  // the card as the HUD draws it: { name, a: alpha, k: 0..1 how far it has landed }, or null
  get view() {
    const c = this.card, K = CHASE.checkpoint;
    if (!c) return null;
    return { name: c.name, k: clamp(c.t / K.rise, 0, 1), a: clamp((K.hold - c.t) / K.fade, 0, 1) };
  }
}
