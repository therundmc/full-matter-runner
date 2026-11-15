// VELOURS: French-touch filter disco (original material). A disco record's chord, chopped into a syncopated loop and
// played through a resonant lowpass that sweeps over every 8 bars, the whole mix pumping under a round four on the
// floor; an octave bass, a chicken-scratch guitar and a palm-muted riff; the hook sung by a vocoder choir.
// Format of a track: see audio/groove/Groove.js (layers, levels, sections, forms) and audio/groove/theory.js (the
// pattern letters and the melodies).
export default {
  id: 'velours', name: 'VELOURS', style: 'French-touch filter disco', bpm: 122, key: 'D minor', swing: 0.06, kit: 'disco',
  about: 'A chopped disco chord loop breathing through a sweeping filter, pumping under the kick, octave bass, funky '
    + 'muted guitars. Warm and hypnotic, it opens up like a door into the club when the fight starts.',
  hook: 'The loop itself (a chord stabbed on 1, 2, the "and" of 2, the "and" of 3 and a soft push before the bar line) '
    + 'filtered open and shut; then a vocoder line that climbs A-D-F, falls E-D-C and lands on G, answered a step higher.',
  ladder: [
    'calm: the chord loop alone behind a low filter that breathes over 8 bars, a muted round bass, a shaker, guitar chks, the whole mix muffled (the record from the next room)',
    'tense: the filter opens with the tension, a half-time kick, closed hats, a syncopated bass, guitar on the off-beats, a riser into each return',
    'fight: four on the floor, claps, open hats off the beat, the octave disco bass with its ghost notes, the chicken-scratch guitar, the loop sweeping wide',
    'chain 1: a palm-muted 16th guitar riff on the right, a tambourine',
    'chain 2: the hook, sung by a vocoder choir',
    'chain 3: disco strings',
    'chain 4: 16th bass, 16th hats, a fill every four bars',
    'chain 5: the hook doubled an octave up on a bright square lead, the loop wide open, a crash every four bars',
  ],
  prog: {
    A: ['Dm9', 'G13', 'Dm9', 'G13', 'Dm9', 'G13', 'Bbmaj9', ['A7sus4', 'A7']],
    B: ['Bbmaj9', 'Am7', 'Gm9', 'Am7', 'Bbmaj9', 'Am7', 'Gm9', ['A7sus4', 'A7b9']],
  },
  phrases: {
    hookA: [
      '0:A4:3 3:D5:2 6:F5:2 8:E5:3 12:D5:2 14:C5:2', '0:D5:3 3:B4:3 6:A4:2 8:G4:6',
      '0:A4:3 3:D5:2 6:F5:2 8:A5:3 12:G5:2 14:F5:2', '0:E5:3 3:D5:3 6:B4:2 8:D5:8',
      '0:A4:3 3:D5:2 6:F5:2 8:E5:3 12:D5:2 14:C5:2', '0:D5:3 3:B4:3 6:A4:2 8:G4:6',
      '0:F5:3 3:E5:3 6:D5:2 8:C5:4 12:A4:4', '0:G4:4 4:A4:4 8:C#5:4 12:E5:4',
    ],
    hookB: [
      '0:D5:2 2:F5:2 4:A5:4 8:G5:2 10:F5:2 12:D5:4', '0:E5:3 3:C5:3 6:A4:2 8:C5:8',
      '0:D5:2 2:F5:2 4:A5:4 8:Bb5:2 10:A5:2 12:F5:4', '0:G5:3 3:E5:3 6:C5:2 8:E5:8',
      '0:D5:2 2:F5:2 4:A5:4 8:G5:2 10:F5:2 12:D5:4', '0:E5:3 3:G5:3 6:A5:2 8:C6:8',
      '0:Bb5:4 4:A5:4 8:F5:4 12:D5:4', '0:E5:4 4:D5:4 8:C#5:4 12:A4:4',
    ],
  },
  layers: [
    { id: 'kick', inst: 'kick', pat: { 1: '9.......9.......', 2: '9...9...9...9...' } },
    { id: 'clap', inst: 'clap', pat: { 2: '....9.......9...' }, verb: 0.2 },
    { id: 'hat', inst: 'hat', pat: { 1: '..4...4...4...4.', 2: '..o...o...o...o.', 6: '4.o44.o44.o44.o4' }, pan: 0.15 },
    { id: 'shaker', inst: 'shaker', pat: { 0: '..4...4...4...4.', 1: '2.5.2.5.2.5.2.5.', 3: '3534353435343536' }, pan: -0.25 },
    { id: 'tamb', inst: 'tamb', pat: { 3: '....7.......7..4' }, pan: 0.3 },
    { id: 'bass', inst: 'bass', tone: 'finger', lo: 33,
      pat: { 0: 'R-.....rR-......', 1: 'R-.rR.O.R-.rO.rA', 2: 'R.OrR.O.R.OrR.OA', 6: 'RrOrRrOrRrOrRoOA' } },
    { id: 'scratch', inst: 'guitar', wah: 'cocked', gate: 0.6, pan: -0.45, verb: 0.1,
      pat: { 0: '....x.......x...', 1: '..x...x...x...x.', 2: 'x.xCx.x.x.xCx.xc' } },
    { id: 'riff', inst: 'guitar', art: 'mute', lo: 50, pan: 0.45, pat: { 3: 'R.rrO.r.R.rrS.rQ' } },
    { id: 'chop', inst: 'chop', gate: 0.9, q: 4, verb: 0.15, delay: 0.1,
      pat: { 0: 'C-..C-.C-..C-.c.' }, sweep: { 0: [260, 700], 1: [500, 2600], 2: [1200, 6500], 5: [2200, 12000], 7: [5000, 16000] } },
    { id: 'strings', inst: 'strings', pat: { 5: 'C---------------' }, verb: 0.35, gate: 1 },
    { id: 'hook', inst: 'vox', mel: { 4: 'hookA' }, verb: 0.3, delay: 0.2 },
    { id: 'hook2', inst: 'lead', tone: 'square', oct: 12, db: -7, mel: { 7: 'hookA' }, delay: 0.25, verb: 0.2 },
  ],
  sections: {
    A: { prog: 'A' },
    B: { prog: 'B', parts: { hook: 'hookB', hook2: 'hookB' } },
    // the fight's breakdown: the loop and the bass alone, the kick back for the last four bars and a riser into A
    drop: { prog: 'B', mute: ['clap', 'riff', 'tamb', 'hook', 'hook2'], riser: 4, crash: false,
      parts: { bass: 'R-------R-----OA' },
      bars: { kick: [null, null, null, null, '9...9...9...9...', '9...9...9...9...', '9...9...9...9...', '9...9...9.9.9999'] } },
  },
  forms: { calm: ['A', 'B'], tense: ['A', 'B'], fight: ['A', 'B', 'A', 'drop'] },
};
