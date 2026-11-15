// RIVIERA 83: Italo disco (original material). A drum machine's four on the floor with snare and clap on the
// backbeat and busy 16th hats, an octave synth bass in eighths, a sequenced arpeggio, off-beat poly chords, a bright
// square-wave hook and a vocoder choir; straight time, no swing, E minor.
export default {
  id: 'riviera', name: 'RIVIERA 83', style: 'Italo disco', bpm: 120, key: 'E minor', swing: 0, kit: 'linn',
  about: 'Straight, shiny and a little melancholic: drum machine, galloping octave synth bass, a sequenced arpeggio '
    + 'and staccato chords on the off-beats. A night drive on the coast in 1983.',
  hook: 'A square-wave melody that runs up B-E-G, steps down F#-E, and repeats the same shape a fourth higher on the '
    + 'next chord (D-G-B, A-G): a call you can sing after one hearing; the second theme climbs one chord at a time.',
  ladder: [
    'calm: a soft poly pad holding the chords, a muted bass on the beat, light hats, all filtered',
    'tense: a half-time kick, the octave bass, the sequenced arpeggio comes in, hats in eighths, a riser into each return',
    'fight: drum machine four on the floor, snare and clap, 16th hats, the octave bass with its ghost notes, off-beat poly stabs, the arpeggio in 16ths',
    'chain 1: a palm-muted guitar in 16ths, a cowbell',
    'chain 2: the square-wave hook',
    'chain 3: the vocoder choir on the chords',
    'chain 4: 16th octave bass, open hats, tom fills',
    'chain 5: the hook doubled an octave down on a fat saw, a crash every four bars',
  ],
  prog: {
    A: ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am7', ['B7sus4', 'B7']],
    B: ['Am7', 'Bm7', 'Cmaj7', 'D', 'Am7', 'Bm7', 'Cmaj7', ['D', 'B7']],
  },
  phrases: {
    hookA: [
      '0:B4:2 2:E5:2 4:G5:2 6:F#5:2 8:E5:4 12:D5:2 14:E5:2', '0:G5:6 6:F#5:2 8:E5:4 12:B4:4',
      '0:D5:2 2:G5:2 4:B5:2 6:A5:2 8:G5:4 12:F#5:2 14:G5:2', '0:A5:6 6:G5:2 8:F#5:4 12:D5:4',
      '0:B4:2 2:E5:2 4:G5:2 6:F#5:2 8:E5:4 12:D5:2 14:E5:2', '0:G5:4 4:C6:4 8:B5:4 12:G5:4',
      '0:E5:4 4:G5:2 6:A5:2 8:C6:4 12:B5:4', '0:B5:6 6:A5:2 8:F#5:2 10:D#5:2 12:F#5:4',
    ],
    hookB: [
      '0:E5:3 3:A5:3 6:G5:2 8:E5:4 12:C5:4', '0:D5:3 3:F#5:3 6:A5:2 8:B5:4 12:A5:4',
      '0:G5:3 3:B5:3 6:C6:2 8:B5:4 12:G5:4', '0:F#5:4 4:A5:4 8:D6:8',
      '0:E5:3 3:A5:3 6:G5:2 8:E5:4 12:C5:4', '0:D5:3 3:F#5:3 6:A5:2 8:B5:4 12:A5:4',
      '0:E6:6 6:D6:2 8:C6:4 12:B5:4', '0:A5:4 4:F#5:4 8:D#5:4 12:B4:4',
    ],
  },
  layers: [
    { id: 'kick', inst: 'kick', pat: { 1: '9.......9.......', 2: '9...9...9...9...' } },
    { id: 'snare', inst: 'snare', pat: { 2: '....9.......9...' }, verb: 0.25 },
    { id: 'clap', inst: 'clap', db: -3, pat: { 2: '....8.......8...' }, verb: 0.2 },
    { id: 'hat', inst: 'hat', pan: 0.2, pat: { 0: '..3...3...3...3.', 1: '4.3.4.3.4.3.4.3.', 2: '6344634463446344', 6: '634463o4634463o4' } },
    { id: 'cowbell', inst: 'cowbell', db: 8, pan: -0.3, pat: { 3: '..5.....5.5.....' } },
    { id: 'bass', inst: 'bass', tone: 'synth', lo: 28,
      pat: { 0: 'R...r...R...r...', 1: 'R.O.R.O.R.O.R.O.', 2: 'R.OrR.OrR.OrR.Or', 6: 'RrOrRrOrRrOrRrOr' } },
    { id: 'arp', inst: 'pluck', lo: 52, pan: -0.2, delay: 0.25, pat: { 1: 'R.T.F.O.R.T.F.O.', 2: 'RTFORTFORTFOSFTF' } },
    { id: 'pad', inst: 'poly', pat: { 0: 'C---------------', 2: null }, gate: 1, verb: 0.3 },
    { id: 'stabs', inst: 'poly', stab: true, pat: { 2: '..C...C...C...C.' }, verb: 0.15, delay: 0.1 },
    { id: 'guitar', inst: 'guitar', art: 'mute', lo: 52, pan: 0.4, pat: { 3: 'R.rrR.rrR.rrR.rr' } },
    { id: 'lead', inst: 'lead', tone: 'square', db: -3, mel: { 4: 'hookA' }, delay: 0.22, verb: 0.2 },
    { id: 'choir', inst: 'vox', db: -5, pat: { 5: 'C---------------' }, gate: 1, verb: 0.35 },
    { id: 'lead2', inst: 'lead', tone: 'saw', oct: -12, db: -5, mel: { 7: 'hookA' }, verb: 0.15 },
  ],
  sections: {
    A: { prog: 'A' },
    B: { prog: 'B', parts: { lead: 'hookB', lead2: 'hookB' } },
  },
  forms: { calm: ['A', 'B'], tense: ['A', 'B'], fight: ['A', 'B'] },
  fills: ['toms', 'run', 'roll'],
};
