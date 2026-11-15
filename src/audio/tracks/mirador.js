// MIRADOR: Balearic disco-funk (original material). Laid back but bouncy, swung 16ths: a slap bass, a wah'd
// chicken-scratch guitar and a picked one, Rhodes chords with their tremolo, congas, shaker and clave, a sunny
// flute-like lead; B dorian, the sun going down over the sea.
export default {
  id: 'mirador', name: 'MIRADOR', style: 'Balearic disco-funk', bpm: 112, key: 'B dorian', swing: 0.14, kit: 'boogie',
  about: 'Sunny and loose, the most swung of all: slap bass, wah guitar, Rhodes, congas and clave. It grooves more '
    + 'than it hits, a fight on a terrace at sunset.',
  hook: 'A soft flute-like synth: F#-A-B, a turn down A-F#-E, then a long C# that lands on the next chord; the second '
    + 'time it reaches up to D and C#, the third time it climbs to E over the major chord.',
  ladder: [
    'calm: Rhodes chords held with their tremolo, a shaker, a far conga, a slap bass on the downbeats, filtered',
    'tense: a half-time kick, the funk bass line, the wah guitar on the backbeat, congas, a riser into each return',
    'fight: four on the floor, a rimshot snare, swung 16th hats, the full slap line (thumbed roots, popped octaves, dead notes), the scratch guitar, the Rhodes comping',
    'chain 1: the full conga tumbao, the clave, a picked guitar on the right',
    'chain 2: the sunny lead hook',
    'chain 3: warm strings',
    'chain 4: a busier bass, open hats, a tambourine, fills',
    'chain 5: horn hits, a crash every four bars',
  ],
  prog: {
    A: ['Bm9', 'E13', 'Bm9', 'E13', 'Dmaj9', 'C#m7', 'Bm9', ['E13', 'E7sus4']],
    B: ['Gmaj9', 'F#m7', 'Em9', 'A13', 'Gmaj9', 'F#m7', 'Bm9', ['E13', 'F#7sus4']],
  },
  phrases: {
    hookA: [
      '0:F#5:3 3:A5:3 6:B5:2 8:A5:2 10:F#5:2 12:E5:4', '0:G#5:4 4:F#5:2 6:E5:2 8:C#5:8',
      '0:F#5:3 3:A5:3 6:B5:2 8:D6:4 12:C#6:4', '0:B5:6 6:A5:2 8:G#5:4 12:E5:4',
      '0:F#5:4 4:A5:2 6:C#6:2 8:E6:4 12:C#6:4', '0:B5:6 6:G#5:2 8:E5:8',
      '0:D5:2 2:F#5:2 4:A5:2 6:C#6:2 8:B5:8', '0:G#5:4 4:F#5:4 8:E5:4 12:D5:4',
    ],
    hookB: [
      '0:B5:3 3:A5:3 6:F#5:2 8:D5:4 12:F#5:4', '0:E5:3 3:C#5:3 6:A4:2 8:C#5:8',
      '0:B4:2 2:D5:2 4:F#5:2 6:G5:2 8:F#5:4 12:D5:4', '0:C#5:6 6:B4:2 8:A4:8',
      '0:B5:3 3:A5:3 6:F#5:2 8:D5:4 12:F#5:4', '0:A5:3 3:C#6:3 6:E6:2 8:C#6:8',
      '0:D6:4 4:C#6:4 8:B5:4 12:A5:4', '0:G#5:4 4:E5:4 8:C#5:4 12:B4:4',
    ],
  },
  layers: [
    { id: 'kick', inst: 'kick', pat: { 1: '9.........9.....', 2: '9...9...9...9...' } },
    { id: 'snare', inst: 'snare', pat: { 2: '....9.......9...' }, verb: 0.2 },
    { id: 'hat', inst: 'hat', pan: 0.2, pat: { 1: '..3...3...3...3.', 2: '4353435343534353', 6: '43o343o343o343o3' } },
    { id: 'shaker', inst: 'shaker', pan: -0.3, pat: { 0: '3.5.3.5.3.5.3.5.', 2: '3534353435343535' } },
    { id: 'conga', inst: 'conga', db: -4, pan: 0.35, verb: 0.15, pat: { 0: '..........H.L...', 1: 'h...S..hh.H.L.L.', 3: 'h.hhS.hhh.HhL.LH' } },
    { id: 'clave', inst: 'clave', pan: -0.4, pat: { 3: '9..9..9...9.9...' } },
    { id: 'tamb', inst: 'tamb', pan: 0.4, pat: { 6: '..4...4...4...4.' } },
    { id: 'bass', inst: 'bass', tone: 'slap', lo: 35,
      pat: { 0: 'R.......r.R.....', 1: 'R..R..O.R.x...rA', 2: 'R..R..O.R.xR.O.A', 6: 'R.xRxRO.R.xROxOA' } },
    { id: 'scratch', inst: 'guitar', db: 3, wah: 'env', gate: 0.6, pan: -0.4, pat: { 1: '....x.......x...', 2: 'x.xX.x.xx.xX.xxX' } },
    { id: 'picked', inst: 'guitar', db: -2, art: 'open', gate: 0.45, lo: 52, pan: 0.45, delay: 0.15, pat: { 3: 'O.F.R.F.T.F.R.F.' } },
    { id: 'rhodes', inst: 'rhodes', trem: 4.5, verb: 0.25, gate: 0.95, release: 0.15,
      pat: { 0: 'C-------......c.', 2: '..C-..c...C-..c.' } },
    { id: 'lead', inst: 'lead', tone: 'sun', db: -2, mel: { 4: 'hookA' }, delay: 0.28, verb: 0.3 },
    { id: 'strings', inst: 'strings', pat: { 5: 'C---------------' }, gate: 1, verb: 0.35 },
    { id: 'horns', inst: 'brass', pat: { 7: '......C-.....C-.' }, verb: 0.2 },
  ],
  sections: {
    A: { prog: 'A' },
    B: { prog: 'B', parts: { lead: 'hookB' } },
  },
  forms: { calm: ['A', 'B'], tense: ['A', 'B'], fight: ['A', 'B'] },
  mix: { calm: 1700 },
};
