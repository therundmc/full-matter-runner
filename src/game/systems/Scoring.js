// Score of a run (DOM-free). Fed by world events only:
//   'kill'       points by style x combo multiplier, different ways of killing, hits
//   'knock'      small bonus for flooring a guard (thrown gun, slide), keeps the chain alive
//   'shot'       trigger pulls of the player (accuracy)
//   'explosion'  remembers what blew up (a rocket kill is a hit)
//   'alertPhase' every ALERT eats into the stealth bonus
// The live score only holds what was earned on the spot; `tally()` adds the end bonuses (chain, variety, time,
// stealth, accuracy), the penalties and the grade. Rules are data (data/scoring.js).
import { PALETTE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { WEAPONS } from '../data/weapons.js';
import { SCORING, levelScoring } from '../data/scoring.js';
import Audio from '../../audio/Audio.js';

const GUN_CAUSES = new Set(['bullet', 'blast', 'heavy']);

// How a kill was done: { style (SCORING.styles key), method (what counts for variety) }, or null when the
// player had no hand in it (run over by traffic, shot by a mate).
export function killStyle({ cause, killer, victim }) {
  if (cause === 'explosion') return { style: 'explosion', method: 'explosion' };
  if (!killer?.isPlayer) return null;
  if (cause === 'execute') return { style: 'execution', method: 'execution' };
  if (victim?.held === killer) return { style: 'takedown', method: 'takedown' };
  if (cause === 'slash') return { style: 'blade', method: 'knife' };
  if (cause === 'glass') return { style: 'glass', method: 'glass' };
  const type = killer.weapon?.type;
  if (cause === 'melee') {
    // a blow of the weapon in hand, or wreckage sent flying (same cause, but nobody is swinging)
    const swung = WEAPONS[type]?.kind === 'melee' && killer.swing > 0;
    return swung ? { style: 'melee', method: type } : { style: 'debris', method: 'debris' };
  }
  if (!GUN_CAUSES.has(cause)) return null;
  return { style: cause === 'blast' ? 'pointBlank' : 'shot', method: WEAPONS[type]?.kind === 'gun' ? type : 'gun' };
}

export function comboMultiplier(n, rules = SCORING.combo) {
  return n < 1 ? 1 : Math.min(rules.max, 1 + rules.step * (n - 1));
}

// grades: [[letter, total it starts at], ...] best first
export function gradeFor(total, grades) {
  for (const [g, min] of grades) if (total >= min) return g;
  return grades[grades.length - 1][0];
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// End-of-level breakdown from the run's figures (pure).
// stats: { points, kills, guards, maxCombo, methods, shots, hits, alerts, civilians, time }
// -> { lines: [{ key, label, detail, points }], total, grade, next: { grade, at } | null }
export function tally(stats, level, rules = SCORING) {
  const lines = [];
  const line = (key, label, detail, points) => lines.push({ key, label, detail, points: Math.round(points) });
  line('kills', 'KILLS', `${stats.kills}/${stats.guards}`, stats.points);
  line('chain', 'BEST CHAIN', `x${stats.maxCombo}`, rules.chain * Math.max(0, stats.maxCombo - 1));
  line('variety', 'VARIETY', `${stats.methods} WAY${stats.methods === 1 ? '' : 'S'}`, rules.variety * Math.max(0, stats.methods - 1));
  line('time', 'TIME', `${clock(stats.time)} / ${clock(level.par)}`, rules.time * Math.max(0, level.par - stats.time));
  line('stealth', 'STEALTH', stats.alerts ? `SPOTTED x${stats.alerts}` : 'NEVER SPOTTED',
    Math.max(0, rules.stealth.bonus - rules.stealth.perAlert * stats.alerts));
  if (stats.shots > 0) {
    const acc = clamp(stats.hits / stats.shots, 0, 1);
    line('accuracy', 'ACCURACY', `${Math.round(acc * 100)}%`, rules.accuracy.bonus * acc);
  } else line('accuracy', 'ACCURACY', 'NO SHOT FIRED', rules.accuracy.noShot);
  if (stats.civilians > 0) line('civilians', 'CIVILIANS', `x${stats.civilians}`, -rules.civilian * stats.civilians);
  const total = Math.max(0, lines.reduce((sum, l) => sum + l.points, 0));
  const grade = gradeFor(total, level.grades);
  const i = level.grades.findIndex(([g]) => g === grade);
  const next = i > 0 ? { grade: level.grades[i - 1][0], at: level.grades[i - 1][1] } : null;
  return { lines, total, grade, next };
}

export default class Scoring {
  constructor(world, rules = SCORING) {
    this.world = world;
    this.rules = rules;
    this.points = 0;          // earned on the spot (kills x multiplier, knock-downs)
    this.kills = 0;           // guards down, whoever did it
    this.combo = 0;           // kills in the current chain
    this.maxCombo = 0;
    this.comboEnd = -99;      // world time the chain breaks at
    this.methods = new Set(); // different ways of killing used
    this.shots = 0;
    this.hits = 0;
    this.alerts = 0;
    this.civilians = 0;
    this.lastT = -99;         // world time points last came in (the HUD score swells)
    this.blast = null;        // { t, source } last explosion
    const ev = world.events;
    ev.on('kill', (e) => this.onKill(e));
    ev.on('knock', (e) => this.onKnock(e));
    ev.on('shot', ({ shooter }) => { if (shooter?.isPlayer) this.shots++; });
    ev.on('explosion', ({ source }) => { this.blast = { t: world.time, source }; });
    ev.on('alertPhase', ({ phase }) => { if (phase === 'alert') this.alerts++; });
  }

  // what the HUD shows while playing
  get score() { return Math.max(0, this.points - this.civilians * this.rules.civilian); }
  get multiplier() { return comboMultiplier(this.combo, this.rules.combo); }
  // share of the chain window left, 0..1
  get comboLeft() { return this.combo > 0 ? clamp((this.comboEnd - this.world.time) / this.rules.combo.window, 0, 1) : 0; }

  // direct bonus (door slam...): floating text at x, y
  add(points, x, y, label) {
    this.points += points;
    this.lastT = this.world.time;
    const str = label ? `${label} +${points}` : `+${points}`;
    this.world.texts.push({ x, y, str, t: 1.1, dur: 1.1, color: label ? PALETTE.yellow : PALETTE.white });
  }

  onKill(e) {
    const { victim } = e;
    if (victim.isPlayer) return;
    const w = this.world;
    if (victim.isCivilian) {
      // passers-by are not targets
      if (e.killer?.isPlayer || e.cause === 'explosion') {
        this.civilians++;
        w.texts.push({ x: victim.x, y: victim.y - 10, str: `CIVILIAN -${this.rules.civilian}`, t: 1.1, dur: 1.1, color: PALETTE.pink });
      }
      return;
    }
    this.kills++;
    const how = killStyle(e);
    if (!how) return;
    const style = this.rules.styles[how.style];
    this.methods.add(how.method);
    if (how.style === 'shot' || how.style === 'pointBlank') this.hits++;
    else if (how.style === 'explosion' && this.blast?.source === 'rocket' && w.time - this.blast.t < 0.05) this.hits++;
    this.combo = w.time < this.comboEnd ? this.combo + 1 : 1;
    this.comboEnd = w.time + this.rules.combo.window;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const unseen = victim.aware === 0 && !(victim.knocked > 0);
    const pts = Math.round((style.points + (unseen ? this.rules.unseen : 0)) * this.multiplier);
    this.add(pts, victim.x, victim.y - 10, unseen ? 'UNSEEN' : style.label);
    Audio.play('confirm', { n: this.combo });
  }

  // a guard floored by the player's doing: a few points, and the chain gets some air back
  onKnock({ victim, cause }) {
    const pts = this.rules.knock[cause];
    if (!pts || !victim?.isEnemy) return;
    this.add(pts, victim.x, victim.y - 10, cause === 'debris' ? 'WRECKAGE' : cause.toUpperCase());
    if (this.combo > 0) {
      const c = this.rules.combo;
      this.comboEnd = Math.max(this.comboEnd, this.world.time + c.window * c.knockRefill);
    }
  }

  update() {
    if (this.combo > 0 && this.world.time >= this.comboEnd) this.combo = 0;
  }

  // level: { par, grades } (data/scoring.js); defaults to the generic per-guard scale
  tally(level = levelScoring(null, this.world.totalEnemies)) {
    return tally({
      points: this.points, kills: this.kills, guards: this.world.totalEnemies, maxCombo: this.maxCombo,
      methods: this.methods.size, shots: this.shots, hits: this.hits, alerts: this.alerts,
      civilians: this.civilians, time: this.world.time,
    }, level, this.rules);
  }
}
