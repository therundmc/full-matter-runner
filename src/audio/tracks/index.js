// The soundtrack's tracks (played by audio/Music.js). One track a level: the level's `music` names it (trackOf), the
// default being the synthwave score that level 1 and the tutorial were made with; the title screen plays MENU_TRACK.
// The groove tracks are data (one file each, format in audio/groove/Groove.js); 'synthwave' is the score of
// audio/score.js played by audio/Synthwave.js. audition.html (at the root of the repo) plays them all side by side.
import velours from './velours.js';
import riviera from './riviera.js';
import mirador from './mirador.js';
import couteau from './couteau.js';
import nightshift from './nightshift.js';
import afterhours from './afterhours.js';

const synthwave = {
  id: 'synthwave', name: 'NOCTURNE', style: 'Darksynth / house (the current score)', bpm: 126, key: 'F minor', engine: 'synthwave',
  about: 'The score the game has today (audio/score.js): a dark pad and pulse in the calm, a heartbeat when tense, a '
    + 'house fight whose kill chain brings in arps, stabs, the lead and its double.',
};

export const TRACKS = { synthwave, velours, riviera, mirador, couteau, nightshift, afterhours };
export const DEFAULT_TRACK = 'synthwave';
export const MENU_TRACK = 'afterhours';

// the track a level plays (its `music`, the default when it names none or one that does not exist)
export const trackOf = (level) => (level?.music && TRACKS[level.music] ? level.music : DEFAULT_TRACK);
