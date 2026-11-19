// The campaign as the player sees it: numbered levels, 00 the tutorial then 01, 02... one note each on the hit list
// (ui/title/HitList.js), pinned under the man it goes after. A level is one or several STAGES, the engine's levels
// (data/levels/index.js ids), played in a row: 02 is the chase (level2a) then the gas station (level2b); dying in a
// stage restarts that stage, the LEVELS page only ever starts a level at its first stage. A stage that is not in the
// level registry yet is not made: it is skipped, and a level with none made is a greyed note taped SOON.
// title: what its note says (without one: the name of its first made stage); the titles of the levels not made yet
// are working titles. A man dies at the end of his last level.

// the four men, in the order of their cards on the board (tools/comic/title_art.py TARGETS), a column each
export const TARGETS = ['cueball', 'jitters', 'lucky', 'boss'];

export const CAMPAIGN_LEVELS = [
  { n: 0, stages: ['tutorial'], target: null },           // under the photo of his flat
  { n: 1, stages: ['level1'], target: 'cueball' },
  { n: 2, stages: ['level2a', 'level2b'], target: 'jitters' },
  { n: 3, stages: ['level3'], target: 'jitters', title: 'THE FLAMINGO MOTEL' },
  { n: 4, stages: ['level4'], target: 'lucky', title: 'BAD LUCK' },
  { n: 5, stages: ['level5'], target: 'lucky', title: 'SNAKE EYES' },
  { n: 6, stages: ['level6'], target: 'boss', title: 'TOP FLOOR' },
  { n: 7, stages: ['level7'], target: 'boss', title: 'PAID IN FULL' },
];
