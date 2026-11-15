// AFTER HOURS: the title screen's loop (original material). Slow, warm disco-funk: a soft four on the floor, a
// fingered bass, Rhodes, a muted guitar chk on the backbeat, a shaker and a conga, a sunny lead some of the time and
// strings in the bridge. One form only, sections that come and go (an intro filtered as if heard through the window,
// the groove, the hook, a breakdown) so that it can play for minutes without tiring.
export default {
  id: 'afterhours', name: 'AFTER HOURS', style: 'Slow disco-funk (menu loop)', bpm: 100, key: 'Bb major', swing: 0.12, kit: 'boogie',
  about: 'An inviting, laid-back loop for the title: Rhodes, a round bass, a lazy four on the floor, a guitar chk on '
    + 'the backbeat. It breathes through sections (filtered intro, groove, hook, breakdown), about two minutes a turn.',
  hook: 'A soft lead that falls G-F-D-Bb and rises C-D-F to a long A, then answers from the top (G-Bb-D, C-Bb) over '
    + 'the same four chords, Ebmaj9 - Dm7 - Cm9 - F13.',
  ladder: ['one level: the sections change on their own (intro, groove, groove with the hook, bridge with strings, breakdown)'],
  prog: {
    A: ['Ebmaj9', 'Dm7', 'Cm9', 'F13', 'Ebmaj9', 'Dm7', 'Cm9', ['F13', 'F7sus4']],
    B: ['Gm9', 'C13', 'Fmaj9', 'Bbmaj9', 'Ebmaj9', 'Dm7', 'Gm9', ['C13', 'F7sus4']],
  },
  phrases: {
    hookA: [
      '0:G5:3 3:F5:3 6:D5:2 8:Bb4:4 12:D5:4', '0:C5:3 3:D5:3 6:F5:2 8:A5:8',
      '0:G5:3 3:F5:3 6:Eb5:2 8:D5:4 12:Bb4:4', '0:A4:4 4:C5:4 8:D5:8',
      '0:G5:3 3:Bb5:3 6:D6:2 8:C6:4 12:Bb5:4', '0:A5:6 6:F5:2 8:D5:8',
      '0:Eb5:3 3:D5:3 6:C5:2 8:Bb4:4 12:G4:4', '0:A4:4 4:C5:4 8:Eb5:4 12:F5:4',
    ],
    hookB: [
      '0:D5:3 3:F5:3 6:A5:2 8:Bb5:4 12:A5:4', '0:G5:6 6:E5:2 8:D5:8',
      '0:A5:3 3:G5:3 6:E5:2 8:C5:8', '0:D5:4 4:F5:4 8:A5:4 12:C6:4',
      '0:Bb5:6 6:G5:2 8:F5:8', '0:F5:3 3:A5:3 6:C6:2 8:A5:8',
      '0:Bb5:4 4:A5:4 8:F5:4 12:D5:4', '0:E5:4 4:D5:4 8:C5:4 12:Bb4:4',
    ],
  },
  layers: [
    { id: 'kick', inst: 'kick', db: -3, pat: '9...9...9...9...' },
    { id: 'clap', inst: 'clap', db: -5, pat: '....8.......8...', verb: 0.3 },
    { id: 'hat', inst: 'hat', pan: 0.2, pat: '..3...3...3...3.' },
    { id: 'shaker', inst: 'shaker', pan: -0.3, pat: '2423242324232424' },
    { id: 'conga', inst: 'conga', pan: 0.35, verb: 0.2, pat: '..........H.L...' },
    { id: 'bass', inst: 'bass', tone: 'finger', lo: 34, pat: 'R-..R.O.r.R-..rA' },
    { id: 'guitar', inst: 'guitar', wah: 'cocked', gate: 0.6, pan: -0.4, verb: 0.15, pat: '....C..x....C...' },
    { id: 'rhodes', inst: 'rhodes', trem: 4, verb: 0.3, gate: 0.95, release: 0.2, pat: 'C-..c...C-..c.c.' },
    { id: 'lead', inst: 'lead', tone: 'sun', mel: 'hookA', delay: 0.3, verb: 0.35 },
    { id: 'strings', inst: 'strings', pat: 'C---------------', gate: 1, verb: 0.4 },
  ],
  sections: {
    intro: { prog: 'A', mute: ['kick', 'clap', 'hat', 'conga', 'lead', 'strings'], tone: 1600 },
    A: { prog: 'A', mute: ['lead', 'strings'] },
    hook: { prog: 'A', mute: ['strings'] },
    bridge: { prog: 'B', parts: { lead: 'hookB' } },
    brk: { prog: 'B', mute: ['kick', 'clap', 'hat', 'bass', 'lead'], tone: 2400 },
  },
  forms: { menu: ['intro', 'A', 'hook', 'bridge', 'brk', 'hook'] },
  mix: { gain: [0.8] },
};
