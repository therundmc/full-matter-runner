// How worked up the soundtrack should be (0..1). The squad's alert phase sets the floor; the fight itself (shots,
// kills, blasts) heats it up for a few seconds, so a quiet kill gets a heartbeat and a massacre gets the beat.
import { AI } from '../Config.js';
import { clamp } from '../../engine/math.js';

export default class Tension {
  constructor(cfg = AI.heat) {
    this.cfg = cfg;
    this.heat = 0;
  }

  // kind: shot | kill | blast
  bump(kind) { this.heat = Math.min(1, this.heat + (this.cfg[kind] ?? 0)); }

  update(dt) { this.heat = Math.max(0, this.heat - dt / this.cfg.cool); }

  level(phase) { return clamp((AI.music[phase] ?? 1) + this.heat * this.cfg.gain, 0, 1); }
}
