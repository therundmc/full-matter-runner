// COUTEAU: dark nu-disco for the fights (original material). Minor key, a hard driven kick, a disco bass galloping
// in 16ths an octave apart, a palm-muted guitar riff that chugs on the root and stabs the minor third, fourth and
// seventh, dark poly stabs, brass hits, strings, a biting detuned-saw hook; F# minor with a phrygian rub in B.
export default {
  id: 'couteau', name: 'COUTEAU', style: 'Dark nu-disco', bpm: 124, key: 'F# minor', swing: 0.03, kit: 'nudisco',
  about: 'The angriest one, still a groove: hard kick, galloping disco bass, a chugging muted guitar riff, dark '
    + 'stabs and a biting synth hook. Made for a fight.',
  hook: 'The guitar riff (root, root, root, then the minor third / fourth / seventh on the last sixteenth of each beat), '
    + 'and a saw lead that rises C#-E-F#, A-G#-F# and falls back E-C#-B-A, one chord lower each time.',
  ladder: [
    'calm: a dark held pad, a bass pedal, hats ticking, filtered low',
    'tense: a half-time kick, the bass galloping in eighths, the guitar chugging on the beat, a shaker, a riser into each return',
    'fight: a hard four on the floor, clap, open hats, the galloping 16th bass, the full guitar riff',
    'chain 1: a snare under the clap, dark poly stabs, a second guitar scratching off the beat',
    'chain 2: the saw hook',
    'chain 3: dark strings',
    'chain 4: 16th octave bass, a kick pickup, brass hits, fills',
    'chain 5: the hook doubled an octave up on a square, a crash every four bars',
  ],
  prog: {
    A: ['F#m9', 'F#m9', 'Dmaj7', 'Dmaj7', 'Bm9', 'Bm9', 'C#7sus4', ['C#7sus4', 'C#7b9']],
    B: ['F#m(add9)', 'Gmaj7#11', 'F#m(add9)', 'Gmaj7#11', 'Dmaj7', 'E6', 'F#m9', ['C#7sus4', 'C#7b9']],
  },
  phrases: {
    hookA: [
      '0:C#5:3 3:E5:3 6:F#5:2 8:A5:3 11:G#5:3 14:F#5:2', '0:E5:6 6:C#5:2 8:B4:4 12:A4:4',
      '0:A4:3 3:C#5:3 6:D5:2 8:F#5:3 11:E5:3 14:D5:2', '0:C#5:8 8:A4:4 12:C#5:4',
      '0:D5:3 3:F#5:3 6:A5:2 8:C#6:4 12:B5:2 14:A5:2', '0:F#5:6 6:E5:2 8:D5:4 12:C#5:4',
      '0:F#5:4 4:G#5:4 8:B5:4 12:G#5:4', '0:F#5:4 4:G#5:4 8:F5:4 12:D5:4',
    ],
    hookB: [
      '0:F#5:2 2:G#5:2 4:A5:4 8:G#5:2 10:F#5:2 12:C#5:4', '0:B4:2 2:C#5:2 4:D5:4 8:F#5:4 12:C#5:4',
      '0:F#5:2 2:G#5:2 4:A5:4 8:C#6:4 12:A5:4', '0:B5:6 6:A5:2 8:F#5:4 12:D5:4',
      '0:F#5:3 3:A5:3 6:C#6:2 8:A5:4 12:F#5:4', '0:G#5:3 3:B5:3 6:C#6:2 8:B5:4 12:G#5:4',
      '0:A5:4 4:G#5:4 8:F#5:4 12:E5:4', '0:F#5:4 4:G#5:4 8:F5:4 12:C#5:4',
    ],
  },
  layers: [
    { id: 'kick', inst: 'kick', pat: { 1: '9.......9.......', 2: '9...9...9...9...', 6: '9...9...9...9.7.' } },
    { id: 'clap', inst: 'clap', pat: { 2: '....9.......9...' }, verb: 0.25 },
    { id: 'snare', inst: 'snare', db: -3, pat: { 3: '....7.......7...' }, verb: 0.2 },
    { id: 'hat', inst: 'hat', pan: 0.2, pat: { 0: '..3...3...3...3.', 1: '3.3.3.3.3.3.3.3.', 2: '..o...o...o...o.', 4: '5.o35.o35.o35.o3' } },
    { id: 'shaker', inst: 'shaker', pan: -0.25, pat: { 1: '..4...4...4...4.', 2: '3434343434343434' } },
    { id: 'bass', inst: 'bass', tone: 'synth', lo: 30,
      pat: { 0: 'R-------r-------', 1: 'R.rrR.rrR.rrR.rr', 2: 'RrrORrrORrrORrOA', 6: 'RrOrRrOrRrOrRrOr' } },
    { id: 'riff', inst: 'guitar', art: 'mute', lo: 54, pan: 0.35, pat: { 1: 'R...R...R...R...', 2: 'RrrTRrrQRrrSRrTQ' } },
    { id: 'scratch', inst: 'guitar', db: 4, gate: 0.5, pan: -0.4, pat: { 3: '..x...x...x...X.' } },
    { id: 'pad', inst: 'poly', pat: { 0: 'C---------------', 2: null }, gate: 1, verb: 0.35 },
    { id: 'stabs', inst: 'poly', stab: true, db: 3, pat: { 3: '...C..C....C..C.' }, verb: 0.2, delay: 0.12 },
    { id: 'lead', inst: 'lead', tone: 'saw', mel: { 4: 'hookA' }, delay: 0.2, verb: 0.2 },
    { id: 'strings', inst: 'strings', pat: { 5: 'C---------------' }, gate: 1, verb: 0.35 },
    { id: 'brass', inst: 'brass', pat: { 6: 'C-.....C-.......' }, verb: 0.2 },
    { id: 'lead2', inst: 'lead', tone: 'square', oct: 12, db: -8, mel: { 7: 'hookA' }, delay: 0.2 },
  ],
  sections: {
    A: { prog: 'A' },
    B: { prog: 'B', parts: { lead: 'hookB', lead2: 'hookB' } },
  },
  forms: { calm: ['A'], tense: ['A', 'B'], fight: ['A', 'B'] },
  mix: { calm: 1200, gain: [0.3, 0.66, 0.68, 0.72, 0.75, 0.78, 0.82, 0.86] },
};
