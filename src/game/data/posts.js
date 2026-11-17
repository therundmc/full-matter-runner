// A guard's life at his post (level.jobs), as data: Enemy.work plays it through an ai/Pastimes.js Routine, the
// gestures (hands, body, what is in them) are ai/Pastimes.js GESTURES, posed by entities/CharacterAnim.js postPose
// and drawn by entities/PostArt.js.
//
// A script:
//   body   how he is at it: 'stand' (default) | 'seat' (on a sofa or an armchair, slumped, legs out) | 'desk' (in his
//          armchair, leaning back, both feet up on the desk, ankles crossed) | 'wall' (his back flat against the wall
//          behind his post, a sole up on it) | 'hood' (his backside against a parked car by its hood, half sat, the
//          ankles crossed out in front: HOOD)
//   seat   the furniture he sits on: the nearest prop of type `prop`, places [x, y, side] in its own px frame (one man
//          each, the free one nearest his post; side -1: his gestures mirrored, the other arm along the backrest)
//          facing `face` (deg, in that frame)
//   front  what he works at standing (a prop type): his post is square in the middle of the side of the nearest one
//          he faces, his belly against it (it is placed for him: the tile he starts on only says which side)
//   sit, rise   s he takes to sit down, to get up when something is up (frozen meanwhile: a beat the player gets)
//   rest   'desk': his weapon stands against the end of the nearest desk, on his left, while he sits; he grabs it
//          getting up; ash: an ashtray on the arm of his chair
//   stay   all calm, he never leaves it for another pastime (a chat, a cigarette, a leak...)
//   gaze   his eyes follow a stranger coming near in front of him (a doorman)
//   walk   a patrol: how he carries his hands on his round ('pockets'); his acts are played at the halts
//   open   { act, phase, odds }: with those odds the level opens on him at that act, from that phase (somewhere into
//          it), already in place (a patrol caught at a halt)
//   acts   short sequences of phases, picked at random by weight `w` (a number, or one per seat taken: [first, second])
//          never twice in a row unless alone; `cue`: played only when asked (Routine.cue: a nod, a laugh)
// A phase:
//   g      gesture (ai/Pastimes.js GESTURES or a render/PastimeArt.js pastime)
//   dur    [min, max] s
//   at     where it is done: 'post' (his seat for a seated job) | 'here' (where he stands) | 'toilet' |
//          'wall' (the nearest wall, to relieve himself) | 'car' (beside the nearest parked vehicle) | 'hood' (his back
//          to the nearest parked car's hood, off the road: ai/Pastimes.js hoodSpot) | 'stool' (behind the counter, in
//          front of a customer at it) | 'pool' (another side of the pool table) | any other prop type: in front of the
//          nearest one ('sink', 'fridge'). Left out: where the phase before was done (the post for an act's first). A
//          phase whose spot cannot be found is skipped
//   body   overrides the script's body for the phase
//   look   where his eyes go: 'sweep' (slowly up and down the street, round the way he faces) | 'glance' (a little
//          way either side of it, never off it for long) | 'dance' (the nearest dancer) | 'back' (behind him: the bottles)
//   say    [occasion of data/barks.js, odds]; answer: the act the nearest man at the same job plays when it is said
//   sound  [name, at (0..1 of the phase), volume, pitch]
//   fx     what it gives off (Enemy.postFx): 'ember' (a draw lights the face), 'cloud' (a slow thick breath of smoke),
//          'ash', 'flame' (a lighter cupped in the hands), 'butt' (a flicked cigarette end), 'stream' (into a toilet
//          bowl), 'tap' (water at a sink), 'can' (kicked down the sidewalk), 'stroke' (a pool shot), 'deal' (a card a
//          beat), 'chip', 'strike' (a match struck: its flare), 'match' (a match burning in the hands), 'drop' (the lit
//          match let fall: event 'matchDrop', the petrol catches there: systems/FireSpread.js), 'junk' (something pulled out
//          of a drawer or the fridge thrown over his shoulder, left lying), 'cold' (the light of an open fridge)
// An act:  w, phases, cue as above; next: the act played after it, instead of one picked at random (a cued act that
//          leads on to another, one that goes on for ever)
export const POSTS = {
  // a doorman: arms folded, an eye on whoever comes near; a look at his watch, his weight from one foot to the
  // other, his neck cracked, a nod to a customer going in; inside, a glance at the dancers
  door: {
    gaze: true,
    acts: {
      folded: { w: 5, phases: [{ g: 'cross', dur: [5, 10] }] },
      clasped: { w: 2, phases: [{ g: 'clasp', dur: [4, 8] }] },
      watch: { w: 1.5, phases: [{ g: 'cross', dur: [1, 2] }, { g: 'wrist', dur: [2.4, 2.6] }] },
      weight: { w: 1.5, phases: [{ g: 'shift', dur: [3, 6] }] },
      neck: { w: 1, phases: [{ g: 'neck', dur: [1.5, 1.9], sound: ['click', 0.45, 0.12, 0.5] }] },
      dancers: { w: 2, phases: [{ g: 'cross', dur: [2.5, 4.5], look: 'dance' }] },
      nod: { cue: true, phases: [{ g: 'nod', dur: [0.8, 0.9] }] },
    },
  },
  // a patrol on the sidewalk: hands in his pockets on the way; at a halt he lights up cupping the flame, looks into
  // a parked car, kicks a can down the pavement, or sits back against the hood of a parked car for a smoke (the
  // level sometimes opens on him there)
  beat: {
    walk: 'pockets',
    open: { act: 'hood', phase: 1, odds: 0.5 },
    acts: {
      smoke: { w: 2, phases: [{ g: 'light', dur: [1.6, 2.2], fx: 'flame', sound: ['click', 0.15, 0.2, 1.6] },
        { g: 'smoke', dur: [5, 8] }, { g: 'flick', dur: [0.5, 0.6], fx: 'butt' }] },
      car: { w: 1.5, phases: [{ g: 'peer', at: 'car', dur: [2.5, 4] }] },
      kick: { w: 1, phases: [{ g: 'kick', dur: [0.8, 1], fx: 'can' }] },
      watch: { w: 0.7, phases: [{ g: 'wrist', dur: [2.4, 2.6] }] },
      hood: { w: 2, phases: [
        { g: 'light', at: 'hood', body: 'hood', dur: [1.6, 2.2], fx: 'flame', sound: ['click', 0.15, 0.2, 1.6] },
        { g: 'hood', body: 'hood', dur: [10, 16], look: 'glance' },
        { g: 'flick', body: 'hood', dur: [0.5, 0.6], fx: 'butt' },
      ] },
    },
  },
  // the bartender: polishes glasses; takes a bottle off the back bar, pours, slides the glass to a customer on a
  // stool; wipes the counter; leans on it on both hands (eyes free: he sees the room)
  wipe: {
    front: 'bar_counter',
    acts: {
      polish: { w: 3, phases: [{ g: 'wipe', dur: [6, 10] }] },
      serve: { w: 2, phases: [{ g: 'fetch', dur: [1.1, 1.4], look: 'back' }, { g: 'pour', dur: [2, 2.6], sound: ['splash', 0.3, 0.25, 1.5] },
        { g: 'serve', at: 'stool', dur: [1.2, 1.5], fx: 'slide' }] },
      counter: { w: 2, phases: [{ g: 'rag', dur: [3, 5] }] },
      lean: { w: 1.5, phases: [{ g: 'lean', dur: [4, 7] }] },
    },
  },
  // the pool player: chalks his cue, goes round to another side of the table, leans over to aim and shoots, watches
  // the balls run, his cue upright
  pool: {
    acts: {
      shot: { w: 1, phases: [{ g: 'chalk', at: 'here', dur: [1.4, 2] }, { g: 'aim', at: 'pool', dur: [5, 5], fx: 'stroke' },
        { g: 'cue', dur: [2, 4] }] },
    },
  },
  // the dealer: shuffles, deals round the table, picks up his hand, throws a chip in, plays on, rakes the pot
  cards: {
    front: 'card_table',
    acts: {
      hand: { w: 1, phases: [{ g: 'shuffle', dur: [2, 3] }, { g: 'deal', dur: [1.8, 2.2], fx: 'deal' },
        { g: 'cards', dur: [4, 7] }, { g: 'chip', dur: [0.8, 1], fx: 'chip' }, { g: 'cards', dur: [3, 6] },
        { g: 'rake', dur: [1.2, 1.6], sound: ['clack', 0.5, 0.4, 1.2] }] },
    },
  },
  // the pimp at his table: a pinch onto the scale, a little bag tied, a finger licked
  dope: {
    front: 'dope_table',
    acts: {
      weigh: { w: 3, phases: [{ g: 'weigh', dur: [2.5, 3.5] }, { g: 'bag', dur: [1.6, 2.2] }] },
      taste: { w: 1, phases: [{ g: 'lick', dur: [1, 1.3] }] },
      look: { w: 1, phases: [{ g: 'weigh', dur: [1.5, 2] }, { g: 'phone', dur: [2, 3] }] },
    },
  },
  // the night's takings: bills peeled off, a thumb wetted, a wad banded and stacked in the case
  count: {
    front: 'cash_case',
    acts: {
      wad: { w: 1, phases: [{ g: 'count', dur: [4, 6] }, { g: 'thumb', dur: [0.7, 0.9] }, { g: 'count', dur: [3, 5] },
        { g: 'band', dur: [1.3, 1.7] }, { g: 'stack', dur: [1, 1.3], sound: ['pocket', 0.6, 0.3, 0.8] }] },
    },
  },
  // the man in the toilets: at the bowl, shakes, zips up, washes his hands, a look in the mirror, then a cigarette
  // against the wall before he starts again. One long cycle.
  piss: {
    stay: true,
    acts: {
      cycle: { w: 1, phases: [
        { g: 'pee', at: 'toilet', dur: [7, 10], fx: 'stream' }, { g: 'shake', dur: [0.8, 1] }, { g: 'zip', dur: [0.7, 0.9] },
        { g: 'wash', at: 'sink', dur: [3, 4], fx: 'tap' }, { g: 'mirror', dur: [2, 3.5] },
        { g: 'light', at: 'post', body: 'wall', dur: [1.6, 2.2], fx: 'flame', sound: ['click', 0.15, 0.2, 1.6] },
        { g: 'smoke', body: 'wall', dur: [10, 18] }, { g: 'flick', body: 'wall', dur: [0.5, 0.6], fx: 'butt' },
        { g: 'phone', body: 'wall', dur: [3, 6] },
      ] },
    },
  },
  // the boss, in his armchair behind the desk, leaning back, his feet up on it, ankles crossed, a cigar: he draws on
  // it (the ember lights his face), blows a thick slow cloud, taps the ash, rolls it between his fingers. The shotgun
  // lies across the desk: alerted, he swings his legs down, grabs it and stands.
  boss: {
    body: 'desk', seat: { prop: 'armchair', places: [[2, 0]], face: 0 }, sit: 1, rise: 0.6, rest: 'desk', ash: true, stay: true,
    acts: {
      hold: { w: 3, phases: [{ g: 'cigar', dur: [3, 6] }] },
      puff: { w: 3, phases: [{ g: 'draw', dur: [1.4, 1.8], fx: 'ember' }, { g: 'blow', dur: [2.4, 3.2], fx: 'cloud' }] },
      ash: { w: 1.5, phases: [{ g: 'tap', dur: [1.1, 1.4], fx: 'ash' }] },
      roll: { w: 1, phases: [{ g: 'roll', dur: [2, 3] }] },
      word: { w: 0.6, phases: [{ g: 'cigar', dur: [2, 3], say: ['boss', 0.8] }] },
    },
  },
  // CUEBALL (data/bosses.js), who holds the back room: in the armchair behind the desk, his feet up on it, his hands
  // folded on his belly; he cracks his knuckles, pushes his shades back up his nose, has a word for his men. The
  // pump-action stands against the desk: alerted, he is up faster than the old man was.
  cueball: {
    body: 'desk', seat: { prop: 'armchair', places: [[2, 0]], face: 0 }, sit: 1, rise: 0.4, rest: 'desk', stay: true,
    acts: {
      sit: { w: 4, phases: [{ g: 'clasp', dur: [4, 8] }] },
      knuckles: { w: 1.5, phases: [{ g: 'knuckles', dur: [1.6, 2], sound: ['click', 0.5, 0.2, 0.45] }] },
      shades: { w: 1.5, phases: [{ g: 'shades', dur: [1.4, 1.8] }] },
      word: { w: 0.8, phases: [{ g: 'clasp', dur: [2, 3], say: ['cueball', 0.8] }] },
    },
  },
  // his two men on the couch, slumped, legs out, an arm along the backrest: one reads a magazine on his knee, the
  // other plays with his weapon (a blade: his nails; a club: tossed and caught); a joke and the other laughs
  couch: {
    body: 'seat', seat: { prop: 'sofa', places: [[16, -1], [-16, -1, -1]], face: 90 }, sit: 0.8, rise: 0.45, stay: true,
    acts: {
      slump: { w: 2, phases: [{ g: 'slump', dur: [4, 8] }] },
      read: { w: [0.5, 5], phases: [{ g: 'read', dur: [7, 13] }] },
      fiddle: { w: [5, 0.5], phases: [{ g: 'fiddle', dur: [5, 9] }] },
      joke: { w: 1, phases: [{ g: 'talk', dur: [2.2, 3], say: ['joke', 0.9], answer: 'laugh' }, { g: 'slump', dur: [1, 2] }] },
      laugh: { cue: true, phases: [{ g: 'laugh', dur: [1.4, 2], say: ['laugh', 0.8] }] },
    },
  },
  // the back door guard, alone in the lot: his back flat against the wall, a foot up on it, smoking, his head
  // turning slowly; now and then a walk to the van and back
  lean: {
    body: 'wall',
    acts: {
      smoke: { w: 4, phases: [{ g: 'smoke', dur: [8, 14], look: 'sweep' }] },
      light: { w: 1, phases: [{ g: 'flick', dur: [0.5, 0.6], fx: 'butt' }, { g: 'cross', dur: [3, 6], look: 'sweep' },
        { g: 'light', dur: [1.6, 2.2], fx: 'flame', sound: ['click', 0.15, 0.2, 1.6] }] },
      van: { w: 1, phases: [{ g: 'peer', at: 'car', body: 'stand', dur: [3, 5] }, { g: 'smoke', body: 'stand', dur: [2, 4] }] },
    },
  },
  // the man smoking in the service alley, under the neon tube, against the bar's wall: draws, breathes out, flicks the
  // ash, looks up and down the alley; now and then crouches to tie a lace or reads his pager
  alley: {
    body: 'wall',
    acts: {
      smoke: { w: 4, phases: [{ g: 'smoke', dur: [6, 11], look: 'sweep' }, { g: 'ash', dur: [0.8, 1], fx: 'ash' }] },
      light: { w: 1, phases: [{ g: 'flick', dur: [0.5, 0.6], fx: 'butt' }, { g: 'light', dur: [1.6, 2.2], fx: 'flame', sound: ['click', 0.15, 0.2, 1.6] }] },
      lace: { w: 0.8, phases: [{ g: 'tie', body: 'stand', dur: [2.5, 3.5] }] },
      pager: { w: 1, phases: [{ g: 'phone', dur: [3, 5] }] },
    },
  },
  // ---- the prologue (tools/build_tutorial.py): the boss's men in his flat while he sleeps, each at something until
  // his turn comes (systems/Tutorial.js keeps them deaf and blind till then)
  // the man who poured the petrol: the jerrycan is down, the matchbox in his hand, a match ready; he shakes the box,
  // looks over the soaked floor, wipes his hands. When the man on the mattress wakes (systems/Tutorial.js: the
  // opening cues 'laugh') he laughs at him, strikes it, shields the flame a moment and lets it fall: the petrol
  // catches where it lands (systems/FireSpread.js); he backs off from the whoosh, and is sent running for the door
  arson: {
    stay: true,
    acts: {
      ready: { w: 3, phases: [{ g: 'box', dur: [3, 5], look: 'glance' }] },
      rattle: { w: 1.5, phases: [{ g: 'rattle', dur: [1.1, 1.4], sound: ['clack', 0.25, 0.14, 2.6] }, { g: 'box', dur: [1, 2] }] },
      survey: { w: 1.5, phases: [{ g: 'hips', dur: [3, 4.5], look: 'sweep' }] },
      smear: { w: 1, phases: [{ g: 'smear', dur: [1.5, 1.9] }, { g: 'box', dur: [1, 2] }] },
      laugh: { cue: true, next: 'light', phases: [{ g: 'laugh', dur: [1.05, 1.1] }] },
      light: { cue: true, next: 'back', phases: [
        { g: 'strike', dur: [0.4, 0.45], fx: 'strike', sound: ['match', 0.3, 0.9, 1] },
        { g: 'shield', dur: [0.55, 0.65], fx: 'match' },
        { g: 'drop', dur: [0.6, 0.7], fx: 'drop' },
      ] },
      back: { cue: true, next: 'watch', phases: [{ g: 'shy', dur: [1.1, 1.4] }] },
      watch: { cue: true, next: 'watch', phases: [{ g: 'hips', dur: [3, 5] }] },
    },
  },
  // the kitchen: he turns the place over for the money - the drawers under the worktop pulled out and dug through,
  // what is no good thrown over his shoulder; the fridge opened, its light on him, its shelves emptied onto the floor
  rummage: {
    front: 'sink', stay: true,
    acts: {
      drawer: { w: 3, phases: [{ g: 'dig', dur: [2.2, 3.5], sound: ['clack', 0.3, 0.3, 1.7] }, { g: 'toss', dur: [0.6, 0.7], fx: 'junk' },
        { g: 'dig', dur: [1.4, 2.6], sound: ['clack', 0.5, 0.25, 1.9] }, { g: 'toss', dur: [0.6, 0.7], fx: 'junk' }] },
      fridge: { w: 2, phases: [{ g: 'fridge', at: 'fridge', dur: [2.5, 3.5], fx: 'cold' }, { g: 'toss', dur: [0.6, 0.7], fx: 'junk' },
        { g: 'fridge', dur: [1.5, 2.5], fx: 'cold' }] },
      look: { w: 1, phases: [{ g: 'hips', dur: [1.6, 2.4], look: 'sweep' }] },
    },
  },
  // the entrance hall: a lookout at the flat's front door, smoking; an eye to the spyhole now and then, a light for
  // the next one, a look at his watch
  hall: {
    stay: true,
    acts: {
      smoke: { w: 4, phases: [{ g: 'smoke', dur: [6, 10] }, { g: 'ash', dur: [0.8, 1], fx: 'ash' }] },
      spy: { w: 2, phases: [{ g: 'peer', dur: [2.5, 4] }] },
      light: { w: 1, phases: [{ g: 'flick', dur: [0.5, 0.6], fx: 'butt' },
        { g: 'light', dur: [1.6, 2.2], fx: 'flame', sound: ['click', 0.15, 0.2, 1.6] }] },
      watch: { w: 0.8, phases: [{ g: 'wrist', dur: [2.4, 2.6] }] },
    },
  },
  // the corridor: waiting for him at its far end, his pistol out and low in his right hand, a cigarette in the
  // left; his eyes on the corner he will come round, a drag, the ash tapped off, the slide pulled back an inch to see
  // the round in it. His eyes never leave that corner for long: woken, he fires at once.
  lookout: {
    stay: true,
    acts: {
      wait: { w: 4, phases: [{ g: 'armed', dur: [5, 9], look: 'glance' }] },
      ash: { w: 1.5, phases: [{ g: 'armedAsh', dur: [0.8, 1], fx: 'ash' }] },
      check: { w: 1, phases: [{ g: 'check', dur: [1.4, 1.8], sound: ['click', 0.55, 0.3, 0.9] }] },
    },
  },
};

// Leaning on a parked car (body 'hood', at 'hood'): gap: px between his body's circle and the car's bodywork (its
// hitbox is 2 px inside it); reach: px from him the car may be; settle: s to back onto it and settle, off: s to push
// off it (he can move meanwhile); turned: rad he must be square to the spot's way before he sits back
export const HOOD = { gap: 2, reach: 128, settle: 0.7, off: 0.3, turned: 0.5 };

// what is in his hands when it all kicks off, and what becomes of it (Enemy.dropHeld): broken glass and a splash of
// drink, a cigarette end smoking on the floor (a cigar may stay clamped in his teeth: `keep` odds), a magazine sliding
// off, cards or bills fluttering down
export const HELD = {
  glass: { drop: 'glass' },
  bottle: { drop: 'glass', spill: 140 },
  cig: { drop: 'butt' },
  cigar: { drop: 'butt', keep: 0.5 },
  magazine: { drop: 'magazine' },
  cards: { drop: 'paper', n: 5 },
  wad: { drop: 'cash', n: 6 },
  bag: { drop: 'powder' },
  matchbox: { drop: 'box' },
  match: { drop: 'match' }, // a lit match: it falls on the petrol (event 'matchDrop')
};
