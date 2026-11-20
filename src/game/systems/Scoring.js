// Score of a run (DOM-free). Fed by world events only:
//   'kill'       points by style (+ the circumstances: killTags) x combo multiplier, different ways of killing, hits
//   'dodge', 'pickup'  remembered a moment: a kill right after one is tagged
//   'finisher'   a long execution watched to its end: its bonus, the chain's window given back
//   'knock'      small bonus for flooring a guard (thrown gun, slide, a kick), keeps the chain alive
//   'shot'       trigger pulls of the player (accuracy)
//   'explosion'  remembers what blew up (a rocket kill is a hit)
//   'alertPhase' every ALERT eats into the stealth bonus
// It tells what it scored (ui/KillFeed.js shows it, apart from the guards' barks):
//   'scored'     { x, y (where it happened), points, labels (best first, at most 3), combo, multiplier, streak,
//                kind 'kill' | 'knock' | 'bonus' | 'civilian' }
//   'multiKill'  { n, tag 'double' | 'triple' | 'massacre', x, y } several kills in a breath (fx/Impact.js: a moment)
//   'chainEnd'   { kills, points } a chain of 2+ ran out (points: all it earned while it ran)
// The live score only holds what was earned on the spot; `tally()` adds the end bonuses (chain, variety, time,
// stealth, accuracy, mercy), the penalties and the grade. Rules are data (data/scoring.js).
import { clamp } from '../../engine/math.js';
import { WEAPONS } from '../data/weapons.js';
import { SCORING, levelScoring } from '../data/scoring.js';
import Audio from '../../audio/Audio.js';
import { clock } from '../ui/Text.js';

const GUN_CAUSES = new Set(['bullet', 'blast', 'heavy']);

// How a kill was done: { style (SCORING.styles key), method (what counts for variety) }, or null when the
// player had no hand in it (run over by traffic, shot by a mate).
export function killStyle({ cause, killer, victim, how }) {
  if (cause === 'explosion') return { style: 'explosion', method: 'explosion' };
  if (how?.hostage) return { style: 'humanShield', method: 'hostage' }; // shot by his own in the player's arms
  if (!killer?.isPlayer) return null;
  if (cause === 'execute' || how?.finisher) return how?.quick ? { style: 'quickKill', method: 'quickKill' } : { style: 'execution', method: 'execution' };
  if (victim?.held === killer) return { style: 'takedown', method: 'takedown' };
  if (cause === 'slash') return { style: 'blade', method: 'knife' };
  if (cause === 'wreck') return { style: 'wreck', method: 'wreck' }; // a pursuer's car put into the scenery (Pursuit.js)
  if (cause === 'glass') return { style: 'glass', method: 'glass' };
  const type = killer.weapon?.type;
  if (how?.thrown) return { style: 'melee', method: 'thrown' }; // a full throw that gave out on him (WeaponItem.smash)
  if (cause === 'melee') {
    // a blow of the weapon in hand, or wreckage sent flying (same cause, but nobody is swinging)
    const swung = WEAPONS[type]?.kind === 'melee' && killer.swing > 0;
    return swung ? { style: 'melee', method: type } : { style: 'debris', method: 'debris' };
  }
  if (!GUN_CAUSES.has(cause)) return null;
  return { style: cause === 'blast' ? 'pointBlank' : 'shot', method: WEAPONS[type]?.kind === 'gun' ? type : 'gun' };
}

// The circumstances of a kill worth a bonus (SCORING.tags keys). how: what whoever killed knew of it (a round:
// pierced, through, bounced, dist, last; a blow: from, heavy, spin, broke, thrown, disarm; smoked; env: what a
// takedown drove his head into, systems/TakedownSpot.js;
// boss: the boss he was, entities/Boss.js; car: how his car was stopped, crew: the second man of a car stopped with
// both in it (no multi-kill of its own), systems/Pursuit.js; hostage: he was the player's shield, shot by his own);
// victim: the man killed (a kill with another man held as a shield is tagged); ctx: { now, dodgeT, pickT, streak } where streak counts
// the kills of the last instants, this one included.
export function killTags({ killer, victim, how = {} }, ctx, rules = SCORING) {
  const tags = [];
  if (how.hostage) tags.push('hostage');
  else if (killer?.shield && killer.shield.target !== victim) tags.push('shield');
  if (how.pierced > 0) tags.push('collateral');
  if (how.through) tags.push('wallbang');
  if (how.bounced) tags.push('ricochet');
  if (how.dist >= rules.longShot) tags.push('longshot');
  if (how.last) tags.push('lastRound');
  if (killer?.slide) tags.push('slide');
  if (killer?.vaulting) tags.push('airborne');
  if (how.from === 'behind') tags.push('behind');
  if (how.heavy) tags.push('smash');
  if (how.spin) tags.push('spin');
  if (how.broke) tags.push('broke');
  if (how.disarm) tags.push('disarm');
  if (how.thrown) tags.push(how.broke ? 'smashThrow' : 'thrown');
  if (how.smoked) tags.push('smoked');
  if (how.env) tags.push(how.env === 'bowl' || how.env === 'urinal' ? 'flushed' : 'slammed');
  if (rules.tags[how.boss]) tags.push(how.boss);
  if (rules.tags[how.car]) tags.push(how.car);
  if (ctx.now - ctx.dodgeT < rules.dodgeWindow) tags.push('dodge');
  if (ctx.now - ctx.pickT < rules.drawWindow) tags.push('quickdraw');
  if (ctx.streak >= 2 && !how.crew) tags.push(ctx.streak === 2 ? 'double' : ctx.streak === 3 ? 'triple' : 'massacre');
  return tags;
}

export function comboMultiplier(n, rules = SCORING.combo) {
  return n < 1 ? 1 : Math.min(rules.max, 1 + rules.step * (n - 1));
}

// grades: [[letter, total it starts at], ...] best first
export function gradeFor(total, grades) {
  for (const [g, min] of grades) if (total >= min) return g;
  return grades[grades.length - 1][0];
}

// End-of-level breakdown from the run's figures (pure).
// stats: { points, kills, guards, maxCombo, methods, shots, hits, alerts, civilians, spared, time, styled? }
//   styled: { key: n } kills done in a named style or circumstance (SCORING.styles with a label, SCORING.tags)
// -> { lines: [{ key, label, detail, points }], total, grade, next: { grade, at, clean? (it also needs nobody else
//      killed) } | null,
//      tags: [{ key, label, n }] (the styled kills, most done first), run: { kills, guards, maxCombo, time, par } }
export function tally(stats, level, rules = SCORING) {
  const lines = [];
  const line = (key, label, detail, points) => lines.push({ key, label, detail, points: Math.round(points) });
  line('kills', 'KILLS', `${stats.kills}/${stats.guards}`, stats.points);
  line('chain', 'BEST CHAIN', `x${stats.maxCombo}`, rules.chain * Math.max(0, stats.maxCombo - 1));
  const V = rules.variety;
  line('variety', 'VARIETY', `${stats.methods} WAY${stats.methods === 1 ? '' : 'S'}`, V.points * clamp(stats.methods - 1, 0, V.max));
  line('time', 'TIME', `${clock(stats.time)} / ${clock(level.par)}`, rules.time * Math.max(0, level.par - stats.time));
  line('stealth', 'STEALTH', stats.alerts ? `SPOTTED x${stats.alerts}` : 'NEVER SPOTTED',
    Math.max(0, rules.stealth.bonus - rules.stealth.perAlert * stats.alerts));
  if (stats.shots > 0) {
    const acc = clamp(stats.hits / stats.shots, 0, 1);
    const A = rules.accuracy;
    line('accuracy', 'ACCURACY', `${Math.round(acc * 100)}%`, A.bonus * clamp((acc - A.from) / (1 - A.from), 0, 1));
  } else line('accuracy', 'ACCURACY', 'NO SHOT FIRED', rules.accuracy.noShot);
  if (stats.spared > 0) line('mercy', 'MERCY', `x${stats.spared}`, rules.mercy * stats.spared);
  if (stats.civilians > 0) line('civilians', 'CIVILIANS', `x${stats.civilians}`, -rules.civilian * stats.civilians);
  const total = Math.max(0, lines.reduce((sum, l) => sum + l.points, 0));
  // the top grade is never given with a passer-by killed (rules.cleanTop): such a run tops out one grade below
  const barred = !!rules.cleanTop && stats.civilians > 0;
  const grade = gradeFor(total, barred ? level.grades.slice(1) : level.grades);
  const i = level.grades.findIndex(([g]) => g === grade);
  const next = i > 0 ? { grade: level.grades[i - 1][0], at: level.grades[i - 1][1], ...(barred && i === 1 && { clean: true }) } : null;
  const named = (k) => rules.tags[k] || rules.styles[k];
  const tags = Object.entries(stats.styled || {}).filter(([k, n]) => n > 0 && named(k)?.label)
    .map(([key, n]) => ({ key, label: named(key).label, n }))
    .sort((a, b) => b.n - a.n || (named(b.key).points - named(a.key).points));
  const run = { kills: stats.kills, guards: stats.guards, maxCombo: stats.maxCombo, time: stats.time, par: level.par };
  return { lines, total, grade, next, tags, run };
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
    this.chainPts = 0;        // points earned while the current chain runs
    this.methods = new Set(); // different ways of killing used
    this.shots = 0;
    this.hits = 0;
    this.alerts = 0;
    this.civilians = 0;
    this.lastT = -99;         // world time points last came in (the HUD score swells)
    this.blast = null;        // { t, source } last explosion
    this.dodgeT = this.pickT = this.killT = -99; // world time of the last dodge, pick-up, kill by the player
    this.streak = 0;          // kills in quick succession (rules.multiWindow)
    this.tags = [];           // circumstances of the last kill
    this.styled = {};         // kills by named style / circumstance over the run (the results' tally)
    const ev = world.events;
    ev.on('kill', (e) => this.onKill(e));
    ev.on('knock', (e) => this.onKnock(e));
    ev.on('finisher', (e) => this.onFinisher(e));
    ev.on('shot', ({ shooter }) => { if (shooter?.isPlayer) this.shots++; });
    ev.on('explosion', ({ source }) => { this.blast = { t: world.time, source }; });
    ev.on('alertPhase', ({ phase }) => { if (phase === 'alert') this.alerts++; });
    ev.on('dodge', () => { this.dodgeT = world.time; });
    ev.on('pickup', ({ ch }) => { if (ch.isPlayer) this.pickT = world.time; });
  }

  // what the HUD shows while playing
  get score() { return Math.max(0, this.points - this.civilians * this.rules.civilian); }
  get multiplier() { return comboMultiplier(this.combo, this.rules.combo); }
  // share of the chain window left, 0..1
  get comboLeft() { return this.combo > 0 ? clamp((this.comboEnd - this.world.time) / this.rules.combo.window, 0, 1) : 0; }

  // direct bonus (door slam...) earned at x, y
  add(points, x, y, label, kind = 'bonus') {
    this.earn(points, x, y, label ? [label] : [], kind);
  }

  earn(points, x, y, labels, kind) {
    this.points += points;
    this.lastT = this.world.time;
    if (this.combo > 0) this.chainPts += points;
    this.tell(points, x, y, labels, kind);
  }

  tell(points, x, y, labels, kind) {
    this.world.events.emit('scored', { x, y, points, labels, combo: this.combo, multiplier: this.multiplier, streak: this.streak, kind });
  }

  // the chain ran out: told when it was worth one
  endChain() {
    if (this.combo >= 2) this.world.events.emit('chainEnd', { kills: this.combo, points: this.chainPts });
    this.combo = 0;
    this.chainPts = 0;
  }

  onKill(e) {
    const { victim } = e;
    if (victim.isPlayer) return;
    const w = this.world;
    if (victim.isCivilian) {
      // passers-by are not targets
      if (e.killer?.isPlayer || e.cause === 'explosion') {
        this.civilians++;
        this.tell(-this.rules.civilian, victim.x, victim.y, ['CIVILIAN'], 'civilian');
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
    if (w.time >= this.comboEnd && this.combo > 0) this.endChain(); // ran out this very step, before update() saw it
    this.combo = w.time < this.comboEnd ? this.combo + 1 : 1;
    this.comboEnd = w.time + this.rules.combo.window;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const unseen = victim.aware === 0 && !(victim.knocked > 0);
    // the circumstances: each adds its points and counts as a way of killing
    const k = e.killer, R = this.rules;
    // (a car's crew is one kill for the streak: its second man adds none)
    if (!e.how?.crew) {
      this.streak = w.time - this.killT <= R.multiWindow ? this.streak + 1 : 1;
      this.killT = w.time;
    }
    // smoked: through air too thick to see through (never the blast's own soot: it is the blast that killed)
    const circ = { ...e.how, smoked: !!(k && e.cause !== 'explosion' && w.smoke?.blocks(k.x, k.y, victim.x, victim.y)) };
    this.tags = killTags({ killer: k, victim, how: circ }, { now: w.time, dodgeT: this.dodgeT, pickT: this.pickT, streak: this.streak }, R);
    // a `flat` circumstance is paid as it is, outside the multiplier (a multi-kill already is the chain's speed, a
    // boss is put down in every clear)
    let bonus = unseen ? R.unseen : 0, flat = 0;
    for (const t of this.tags) {
      if (R.tags[t].flat) flat += R.tags[t].points; else bonus += R.tags[t].points;
      this.methods.add(t);
    }
    for (const k of [how.style, ...this.tags]) if (R.tags[k] || R.styles[k]?.label) this.styled[k] = (this.styled[k] || 0) + 1;
    const pts = Math.round((style.points + bonus) * this.multiplier) + flat;
    // the three that pay most are spelled out
    const best = [...this.tags].sort((a, b) => R.tags[b].points - R.tags[a].points);
    const labels = [unseen ? 'UNSEEN' : circ.label || style.label, ...best.map((t) => R.tags[t].label)].filter(Boolean);
    this.earn(pts, victim.x, victim.y, labels.slice(0, 3), 'kill');
    const multi = this.tags.find((t) => t === 'double' || t === 'triple' || t === 'massacre');
    if (multi) w.events.emit('multiKill', { n: this.streak, tag: multi, x: victim.x, y: victim.y });
    Audio.play('confirm', { n: this.combo });
  }

  // a long execution watched to its end (Player.endExecution): what watching it is worth, the chain wound back up
  onFinisher({ x, y }) {
    const W = this.rules.watched, c = this.rules.combo;
    this.add(Math.round(W.points * this.multiplier), x, y, W.label);
    if (this.combo > 0) this.comboEnd = Math.max(this.comboEnd, this.world.time + c.window * W.refill);
  }

  // a guard floored by the player's doing: a few points, and the chain gets some air back
  onKnock({ victim, cause }) {
    const pts = this.rules.knock[cause];
    if (!pts || !victim?.isEnemy) return;
    if (this.combo > 0) {
      const c = this.rules.combo;
      this.comboEnd = Math.max(this.comboEnd, this.world.time + c.window * c.knockRefill);
    }
    this.add(pts, victim.x, victim.y, this.rules.knockLabels?.[cause] ?? cause.toUpperCase(), 'knock');
  }

  update() {
    if (this.combo > 0 && this.world.time >= this.comboEnd) this.endChain();
  }

  // what the run has earned so far, as plain data (a chase's checkpoint keeps it: systems/Checkpoints.js); restore
  // gives it back to a new run (the chain under way is not kept)
  snapshot() {
    const { points, kills, maxCombo, shots, hits, alerts, civilians } = this;
    return { points, kills, maxCombo, shots, hits, alerts, civilians, methods: [...this.methods], styled: { ...this.styled } };
  }
  restore(s) {
    Object.assign(this, { points: s.points, kills: s.kills, maxCombo: s.maxCombo, shots: s.shots, hits: s.hits, alerts: s.alerts, civilians: s.civilians });
    this.methods = new Set(s.methods);
    this.styled = { ...s.styled };
  }

  // level: { par, grades } (data/scoring.js); defaults to the generic per-guard scale
  tally(level = levelScoring(null, this.world.totalEnemies)) {
    return tally({
      points: this.points, kills: this.kills, guards: this.world.totalEnemies, maxCombo: this.maxCombo,
      methods: this.methods.size, shots: this.shots, hits: this.hits, alerts: this.alerts,
      civilians: this.civilians, spared: this.world.enemies.filter((e) => e.alive && e.yielded).length, time: this.world.runTime ?? this.world.time,
      styled: this.styled,
    }, level, this.rules);
  }
}
