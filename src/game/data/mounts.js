// How a prop is held up (its def's `mount`, data/props.js), and everything that follows from it, read here and
// nowhere else: the parallax it is drawn with, how it moves when struck, what a round, a blow and a blast do to it.
//   floor      stands on the floor (or on what stands there: the beer tap on its counter); the default
//   wall       on a wall face: goes with the wall tile it hangs on (ON_WALL, world/Openings.js wallMount)
//   inset      set in a wall's face (a house's windows and door): part of the front, it hangs on no tile
//   pole       on a post or a trunk from the ground (palms, lamps, signs, lights): its head overhead, drawn with its
//              parallax `height` (the pole ties top to foot)
//   ceiling    hangs from a ceiling or a wire up high (lamps, the fan, the mirror ball, strings of bulbs): rounds,
//              blows and what is thrown go under it (a round passing under shakes it: Ballistics.brushFittings),
//              only a blast breaks it, and one swings it well beyond its reach; it swings on like a pendulum
//   awning     cloth, canvas, plastic or a line hung low off a front, a frame, a rod or between posts (awnings, the
//              carport, washing, pennants, a doorway's curtain): no parallax (it slides over the wall it is fixed to),
//              shot and torn as anything, a stiff shudder
//   structure  rigid and out of everybody's reach (bridges, gantries' frames, the toll's roof, a fire escape, an
//              aerial, the stucco canopies): nothing touches it, ever. Rounds fly under it (never traced), blows and
//              blasts do nothing (no recoil, no mark, no sound, no fire); drawn where it stands
//   billboard  a structure whose face takes the rounds (entities/Board.js, data/billboards.js BOARDS): holes, its
//              lamps shot out, the paper torn in stages down to the bare frame; the frame and its posts never move,
//              never fall, never stop a round
// hits: what Prop.hit takes ('all'; 'blast': only a blast or its shrapnel; 'none': nothing, a billboard's face is
// its Board's). rounds: 'hit' traced and struck | 'under' goes under (brushing it) | 'pass' never traced | 'face'
// marks its face and flies on. blows: in reach of a swing or a shove. blasts: 'hit' damaged | 'swing' swung from
// afar, broken close | 'none' | 'face' (Board.blast). swing: how it moves when struck (SWING). parallax: drawn with
// its `height`.
export const MOUNTS = {
  floor: { hits: 'all', rounds: 'hit', blows: true, blasts: 'hit', swing: 'shudder', parallax: false },
  wall: { hits: 'all', rounds: 'hit', blows: true, blasts: 'hit', swing: 'shudder', parallax: false },
  inset: { hits: 'all', rounds: 'hit', blows: true, blasts: 'hit', swing: 'shudder', parallax: false },
  pole: { hits: 'all', rounds: 'hit', blows: true, blasts: 'hit', swing: 'shudder', parallax: true },
  ceiling: { hits: 'blast', rounds: 'under', blows: false, blasts: 'swing', swing: 'pendulum', parallax: true },
  awning: { hits: 'all', rounds: 'hit', blows: true, blasts: 'hit', swing: 'shudder', parallax: false },
  structure: { hits: 'none', rounds: 'pass', blows: false, blasts: 'none', swing: 'none', parallax: false },
  billboard: { hits: 'none', rounds: 'face', blows: false, blasts: 'face', swing: 'none', parallax: false },
};

// the spring a struck prop moves on (Prop.recoil / update): kick px/s per unit of power (bolted: static or with no
// body; loose), ks / cs its spring and damping, kr / cr the same for its turn
export const SWING = {
  pendulum: { kick: 60, loose: 60, ks: 45, cs: 1.1, kr: 60, cr: 2.5 },
  shudder: { kick: 40, loose: 20, ks: 700, cs: 24, kr: 500, cr: 20 },
  // a ceiling fitting swung by a blast up to `far` blast radii away, at `power` at the blast (Explosions)
  blast: { far: 3.5, power: 2.2 },
};

// the name of a prop def's mount, and what it does
export const mountName = (def) => def?.mount || 'floor';
export const mountOf = (def) => MOUNTS[mountName(def)];
// the parallax an overhead prop is drawn with (fraction of its distance to the centre of the view)
export const parallaxOf = (def) => (mountOf(def).parallax ? def.height || 0 : 0);
// out of a round's way: it is not traced at all ('pass') or the round goes under it ('under')
export const overRounds = (def) => { const r = mountOf(def).rounds; return r === 'pass' || r === 'under'; };
// up on a ceiling: what only a blast reaches
export const aloft = (def) => mountOf(def).rounds === 'under';
