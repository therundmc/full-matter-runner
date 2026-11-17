// The bosses (data only), by the kind they are drawn as (level `looks`): entities/Boss.js plays them, systems/
// BossStage.js stages their beats (the name card, the camera), ui/KillFeed.js slams the card.
//
//   name     what the kill feed, the results and the others call him
//   react    x a guard's reaction time before his first shot (ENEMY.reaction / reacquire)
//   intro    the first time he sees the player: his line in a bubble for `dur` s, the game slowed (slowmo: [scale, s]),
//            his fire held `hold` s while he says it
//   fire     his pump-action: interval [min, max] s between two shots; the pump is racked `pump` s after a shot
//            (heard, and the forend worked `rack` s long); `tell` s before a shot a glint grows at the muzzle (the
//            telegraph: one hit kills the player); wild: rad of error added to his aim
//   advance  he walks at the player firing from the hip: pace (x ENEMY.runSpeed), near: px he stops at; reload: the
//            pace kept while he thumbs shells in; hip: where the gun goes at his hip (pose px: [forward, to his right])
//   shove    furniture in his way: within `reach` px ahead (cone rad either side), a table goes over, the rest is
//            sent off with J (kg px/step), a blow of `power` on it; no more than one every `every` s
//   wound    the FIRST hit does not kill: `grace` s nothing else touches him (the other pellets of the same blast),
//            he reels `stagger` s thrown back at `back` px/step, the game slowed (slowmo), `points` and the feed's
//            `label`; blood: [drops, px/s] thrown along the blow; fists: bare blows (a punch, a kick, a door) he
//            shrugs off before one wounds him; once wounded a knock floors him `down` s
//   spots    where the wound shows on him and where his free hand goes (pose px on the torso: [forward, to his
//            right]; clear of his head), by the side the blow came from; hand: where the hand goes when the wound is
//            out of its reach (the way out of a round in the back); `limp`: that arm hangs instead
//   berserk  wounded, he goes mad: speed (x his pace), interval between shots, wild (rad), react (x), roar: s he
//            throws his head back and roars before he comes on, taunt: [min, max] s between two lines
//   trail    wounded, he bleeds as he moves: a drop every `every` px, spread px
//   shake    seized from behind unwounded (Player.startTakedown): he throws the player back at `throw` px/step and
//            needs `react` s to bring the gun round; cd: s before it can happen again
//   death    the second hit: slowmo, the gun thrown at `gun` px/step, the shades skittering off at `shades` px/s,
//            blood: [drops, px/s]
//   shot     the camera, by beat of his ('boss' event): [a data/staging.js SHOTS name, real s it holds]
//   lines    what he says, in a bubble
export const BOSSES = {
  cueball: {
    name: 'CUEBALL',
    react: 0.5,
    intro: { hold: 0.9, slowmo: [0.3, 1], dur: 2.4 },
    fire: { interval: [0.5, 0.55], pump: 0.08, rack: 0.16, tell: 0.2, wild: 0.02 },
    advance: { pace: 0.5, near: 44, reload: 0.3, hip: [-1.5, 3.4] },
    shove: { reach: 30, cone: 0.9, J: 260, power: 2.5, every: 0.5 },
    wound: { grace: 0.7, stagger: 1.1, back: 3.4, slowmo: [0.2, 1], points: 1500, label: 'WOUNDED', blood: [26, 330], fists: 2, down: 1.9 },
    spots: {
      front: { at: [4, 5.4] }, behind: { at: [-4.6, 2.6], hand: [4, 5.4] },
      right: { at: [0.6, 8.6] }, left: { at: [0.4, -8.8], limp: true },
    },
    berserk: { speed: 1.4, interval: [0.45, 0.48], wild: 0.09, react: 0.7, roar: 0.55, taunt: [1.8, 3.2] },
    trail: { every: 7, spread: 3 },
    shake: { throw: 5.5, react: 0.6, cd: 1.5 },
    death: { slowmo: [0.14, 2.4], gun: [6, 9], shades: [150, 230], blood: [60, 380] },
    shot: { intro: ['bossIntro', 1.5], wounded: ['bossHurt', 1.1], down: ['bossDown', 2.6] },
    lines: {
      intro: ['KNOCK KNOCK, DEAD MAN.', 'YOU BURNED ONCE. I LIKE SEQUELS.', 'TAKE A NUMBER, KID. IT IS ZERO.',
        'I SAID NO LOOSE ENDS.', 'NICE COAT. BLEED ON IT.'],
      reload: ['HOLD THAT THOUGHT.', 'STAY. GOOD DOG.', 'SIX MORE COMING UP.', "DON'T GO ANYWHERE.", 'COUNT WITH ME, KID.'],
      wounded: ['AAARGH!', 'MY SUIT!', 'YOU LITTLE...', 'THAT WAS MY GOOD SIDE!'],
      berserk: ["I'LL EAT YOUR SHOES!", 'COME HERE, MATCHSTICK!', 'I AM THE WALL!', 'RAAAH!', 'NOBODY CRACKS MY SHADES!',
        "I'LL WEAR YOU AS A TIE!"],
      shrug: ['THAT TICKLES.', 'IS THAT IT?', 'HA.'],
      shake: ['HANDS OFF THE SUIT.', 'NOT FROM BEHIND, KID.', 'DOWN, BOY.'],
    },
  },
};
