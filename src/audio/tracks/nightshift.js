// NIGHT SHIFT: early-80s boogie funk (original material). Slower and heavy: a syncopated squelchy synth bass,
// handclaps, a rimshot, Rhodes and poly chords, a funky muted guitar, a talkbox hook ("wow-wow"); C dorian.
export default {
  id: 'nightshift', name: 'NIGHT SHIFT', style: 'Boogie funk (early 80s)', bpm: 108, key: 'C minor (dorian)', swing: 0.1, kit: 'boogie',
  about: 'Heavy and strutting, half a step slower: a fat syncopated synth bass, handclaps, rimshots, Rhodes, a funky '
    + 'guitar, and a talkbox singing the hook. The most "1984 car radio" of the set.',
  hook: 'A talkbox that says G-Bb-C, then Eb-D-C, answered D-F-G-F; the third time it reaches up to G and A before '
    + 'falling to D: a call and answer over two chords, Cm9 and F13.',
  ladder: [
    'calm: Rhodes chords held, a muted bass on the downbeats, ticking hats, filtered',
    'tense: a half-time kick, the bass line syncopated, a rimshot pattern, the guitar on the backbeat, a riser into each return',
    'fight: a kick with a boogie push before beat 3, handclaps, hats, the full squelchy bass line, the funky guitar, the Rhodes comping',
    'chain 1: a muted single-note guitar riff on the left, poly chords, the rimshot busier',
    'chain 2: the talkbox hook',
    'chain 3: strings',
    'chain 4: a busier bass, a tambourine, synth brass, fills',
    'chain 5: the talkbox doubled an octave up, a crash every four bars',
  ],
  prog: {
    A: ['Cm9', 'F13', 'Cm9', 'F13', 'Abmaj9', 'Bb13', 'Cm9', ['G7sus4', 'G7#9']],
    B: ['Abmaj9', 'Gm7', 'Fm9', 'Bb13', 'Abmaj9', 'Gm7', 'Fm9', ['G7sus4', 'G7#9']],
  },
  phrases: {
    hookA: [
      '0:G4:2 2:Bb4:2 4:C5:3 8:Eb5:2 10:D5:2 12:C5:4', '0:D5:3 3:F5:3 6:G5:2 8:F5:4 12:D5:2 14:C5:2',
      '0:G4:2 2:Bb4:2 4:C5:3 8:Eb5:2 10:F5:2 12:G5:4', '0:A5:4 4:G5:2 6:F5:2 8:D5:8',
      '0:C5:3 3:Eb5:3 6:G5:2 8:Bb5:4 12:G5:4', '0:F5:3 3:D5:3 6:C5:2 8:Bb4:8',
      '0:G4:2 2:Bb4:2 4:C5:2 6:D5:2 8:Eb5:4 12:D5:4', '0:C5:4 4:D5:4 8:F5:4 12:Bb4:4',
    ],
    hookB: [
      '0:Eb5:3 3:G5:3 6:Bb5:2 8:G5:4 12:Eb5:4', '0:D5:3 3:F5:3 6:G5:2 8:Bb5:8',
      '0:C5:3 3:Eb5:3 6:G5:2 8:Ab5:4 12:G5:4', '0:F5:6 6:D5:2 8:G5:8',
      '0:Eb5:3 3:G5:3 6:Bb5:2 8:G5:4 12:Eb5:4', '0:Bb5:3 3:D6:3 6:C6:2 8:Bb5:8',
      '0:Ab5:4 4:G5:4 8:Eb5:4 12:C5:4', '0:D5:4 4:F5:4 8:B4:4 12:D5:4',
    ],
  },
  layers: [
    { id: 'kick', inst: 'kick', pat: { 1: '9.........9.....', 2: '9...9..79...9...' } },
    { id: 'clap', inst: 'clap', pat: { 2: '....9.......9...' }, verb: 0.25 },
    { id: 'rim', inst: 'rim', pan: -0.2, pat: { 1: '...6..6....6..6.', 3: '...6..6..6..6..6' } },
    { id: 'hat', inst: 'hat', pan: 0.2, pat: { 0: '..3...3...3...3.', 2: '5.3.5.3.5.3.5.3.', 6: '5353535353535o53' } },
    { id: 'tamb', inst: 'tamb', pan: 0.35, pat: { 6: '....7.......7...' } },
    { id: 'bass', inst: 'bass', tone: 'moog', lo: 34, gate: 0.8,
      pat: { 0: 'R-......r.R-....', 1: 'R-.rR.O-.rR.....', 2: 'R-.rR.O-.rR.S.OA', 6: 'R-rrR.OrRrR.SrOA' } },
    { id: 'guitar', inst: 'guitar', db: 3, wah: 'cocked', gate: 0.6, pan: 0.4, pat: { 1: '....x.......x...', 2: '..xC..x...xC..x.' } },
    { id: 'riff', inst: 'guitar', art: 'mute', lo: 48, pan: -0.4, pat: { 3: 'R.r.T.r.R.rQr.S.' } },
    { id: 'rhodes', inst: 'rhodes', trem: 5, verb: 0.25, gate: 0.95, release: 0.15,
      pat: { 0: 'C---------------', 2: 'C-..c.C-..c...c.' } },
    { id: 'poly', inst: 'poly', pat: { 3: '..C-......C-....' }, verb: 0.2 },
    { id: 'talk', inst: 'talk', db: -4, mel: { 4: 'hookA' }, delay: 0.18, verb: 0.2 },
    { id: 'strings', inst: 'strings', pat: { 5: 'C---------------' }, gate: 1, verb: 0.35 },
    { id: 'brass', inst: 'brass', pat: { 6: '......C-......C-' }, verb: 0.2 },
    { id: 'talk2', inst: 'talk', oct: 12, db: -10, mel: { 7: 'hookA' }, delay: 0.2 },
  ],
  sections: {
    A: { prog: 'A' },
    B: { prog: 'B', parts: { talk: 'hookB', talk2: 'hookB' } },
  },
  forms: { calm: ['A', 'B'], tense: ['A', 'B'], fight: ['A', 'B'] },
};
