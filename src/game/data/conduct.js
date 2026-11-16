// What a stranger can be caught doing that no customer does, short of a fight (ai/Conduct.js, Director.conduct): a
// guard who sees it walks over and has a word with him instead of raising the alarm. Per act:
//   order   the bark occasion he tells him with (data/barks.js)
//   comply  what doing as he is told means: 'leave' (off the premises), 'unarmed' (nothing in his hands), 'calm'
//           (not doing it again while watched), 'away' (`away` px off the spot it was done at)
//   lasting it goes on as long as he is at it (in the premises, a weapon in hand): seen again, it is not "again"
//   rank    the worse act wins when he does another one during the talk
//   wait    s he is given at each stage (told, warned, shoved) before the next; default AI.challenge.wait
export const ACTS = {
  trespass: { order: 'out', comply: 'leave', lasting: true, rank: 4, wait: [4, 3, 2.5] },
  weapon: { order: 'drop', comply: 'unarmed', lasting: true, rank: 3 },
  window: { order: 'what', comply: 'calm', rank: 3 },
  smash: { order: 'what', comply: 'calm', rank: 2 },
  lurk: { order: 'staff', comply: 'away', away: 110, rank: 2 },
  vault: { order: 'cut', comply: 'calm', rank: 1 },
  slide: { order: 'cut', comply: 'calm', rank: 1 },
  noise: { order: 'what', comply: 'calm', rank: 1 },
  bump: { order: 'watch', comply: 'calm', rank: 1, wait: [3, 3, 3] },
  // hanging about in front of a guard who told him off twice (Enemy.mind): the word opens at the shove
  loiter: { order: 'shoo', comply: 'away', away: 120, rank: 1, wait: [3, 3, 3] },
};
