// The picture's quality (data/quality.js): the level in force, as every renderer reads it, and AUTO's watch of the
// frame time. DOM-free; looks only.
import { QUALITY, QUALITY_LEVELS, AUTO } from '../data/quality.js';

const now = { level: 'high', ...QUALITY.high };

// what is drawn at the level in force: { level, ss, zoom, mirrors, bloom, ... } (one object, kept: read it each frame)
export const quality = () => now;

// put a level in force ('low' | 'medium' | 'high'; anything else: 'high')
export function setQuality(level) {
  const to = QUALITY[level] ? level : 'high';
  return Object.assign(now, QUALITY[to], { level: to });
}

// the level a player's settings ask for: his own choice, or the one AUTO is at
export function qualityLevel(settings) {
  if (settings.quality !== 'auto' && QUALITY[settings.quality]) return settings.quality;
  return QUALITY[settings.autoQuality] ? settings.autoQuality : 'high';
}

// what the option's row shows: AUTO with the level it chose beside it
export const qualityLabel = (settings) => (QUALITY[settings.quality] ? settings.quality.toUpperCase() : `AUTO (${qualityLevel(settings).toUpperCase()})`);

// AUTO's watch: fed every frame, it answers the level to go down to when the game does not keep up (else null)
export class QualityWatch {
  constructor(level = 'high', cfg = AUTO) {
    this.cfg = cfg;
    this.level = QUALITY[level] ? level : 'high';
    this.rest();
  }

  // nothing counted for a while: a level starts, the level just changed
  rest() {
    this.wait = this.cfg.skip;
    this.t = 0; this.n = 0;
  }

  // ms: the frame's real time; counted: false for a frame that says nothing of the pace (not in play, a hit-stop,
  // a held beat). A level down (its name) once the mean of a full window is over the mark, never back up.
  frame(ms, counted = true) {
    const c = this.cfg;
    if (!counted || !(ms > 0) || ms >= c.hitch) return null;
    if (this.wait > 0) { this.wait -= ms / 1000; return null; }
    this.t += ms; this.n++;
    if (this.t < c.window * 1000) return null;
    const mean = this.t / this.n, at = QUALITY_LEVELS.indexOf(this.level);
    this.t = 0; this.n = 0;
    if (mean <= c.over || at <= 0) return null;
    this.level = QUALITY_LEVELS[at - 1];
    this.wait = c.skip;
    return this.level;
  }
}
