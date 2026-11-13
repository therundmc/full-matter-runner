// Score and combo, driven by 'kill' events.
import { COMBO_WINDOW, PALETTE, AMBIENT } from '../Config.js';
import { chance } from '../../engine/math.js';
import Audio from '../../audio/Audio.js';

export default class Scoring {
  constructor(world) {
    this.world = world;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastKill = -99;
    world.events.on('kill', (e) => this.onKill(e));
  }

  add(points, x, y, label) {
    this.score += points;
    this.world.texts.push({ x, y, str: label ? `${label} +${points}` : `+${points}`, t: 1.1, dur: 1.1, color: chance(0.5) ? PALETTE.pink : PALETTE.cyan });
  }

  onKill({ victim, cause, killer }) {
    if (victim.isPlayer) return;
    // passers-by are not targets: killing one costs points
    if (victim.isCivilian) {
      if (killer?.isPlayer || cause === 'explosion') {
        this.score = Math.max(0, this.score - AMBIENT.penalty);
        this.world.texts.push({ x: victim.x, y: victim.y - 10, str: `CIVILIAN -${AMBIENT.penalty}`, t: 1.1, dur: 1.1, color: PALETTE.white });
      }
      return;
    }
    this.kills++;
    if (!(killer?.isPlayer || cause === 'explosion')) return;
    const t = this.world.time;
    this.combo = t - this.lastKill < COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastKill = t;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const base = cause === 'execute' ? 1000 : cause === 'explosion' ? 600 : (killer?.def?.points ?? 500);
    this.add(base * Math.min(this.combo, 10), victim.x, victim.y - 10, cause === 'execute' ? 'EXECUTION' : null);
    if (this.combo > 1) Audio.play('combo', { n: this.combo });
  }

  update() {
    if (this.combo > 0 && this.world.time - this.lastKill > COMBO_WINDOW) this.combo = 0;
  }
}
