// The level flow: which level starts and how (NEW GAME, CONTINUE, RESTART, RETRY, the next one), what a new start keeps
// of the last run (the tutorial's last room, the chase's last checkpoint), how a level ends (death, the exit, the
// getaway, the tutorial's window, TO BE CONTINUED) and what follows it (the results, the hit list, the title).
// The run's state it reads and writes is the Game's (levelId, tutorialAt, chaseAt, taught, progress, results...: the
// world, the QA robot and the HUD read it there); Game exposes the verbs and hands them over here.
import { TILE, AI } from '../Config.js';
import Audio from '../../audio/Audio.js';
import Music from '../../audio/Music.js';
import { trackOf } from '../../audio/tracks/index.js';
import World from '../world/World.js';
import Tension from '../ai/Tension.js';
import { loadBest, saveBest } from '../systems/Records.js';
import { CAMPAIGN, saveProgress, complete, latest, nextLevel, levelNumber, saveCrossed } from '../systems/Progress.js';
import Opening from '../systems/Opening.js';
import { levelScoring } from '../data/scoring.js';
import LEVELS from '../data/levels/index.js';
import { describeDeath, introTint } from '../ui/Screens.js';
import { ENDINGS } from '../ui/cine/Ending.js';
import { deadCount } from '../ui/title/HitList.js';
import { devParam } from '../data/build.js';
import { GAME } from '../data/game.js';

// ?level=<id>: the level NEW GAME / CONTINUE start, for the developers (e.g. ?level=lab, the physics test room;
// data/build.js: not in a release build)
export const urlLevel = () => { const id = devParam('level'); return LEVELS[id] ? id : null; };
export const has = (id) => !!LEVELS[id];
// the campaign levels there are, in order, for the menu
export const campaign = () => CAMPAIGN.filter(has).map((id) => ({ id, name: LEVELS[id].name || id.toUpperCase() }));
export const firstLevel = () => campaign()[0]?.id || Object.keys(LEVELS)[0];
// what the intro banner calls a level
export const levelLabel = (id) => (id === 'tutorial' ? 'PROLOGUE' : CAMPAIGN.includes(id) ? `LEVEL ${levelNumber(id)}` : 'TEST LEVEL');

// what the level's card shows (ui/Screens.js drawIntro); g: { world, best, levelId, input }
export function introCard(g) {
  // (a chase resumed at a checkpoint: the part's name in place of the level's)
  const cp = g.world.checkpoints?.from, level = cp ? { ...g.world.level, name: cp.name } : g.world.level;
  return { level, best: g.best, label: levelLabel(g.levelId), device: g.input.device, tint: introTint(g.levelId) };
}

export default class LevelFlow {
  constructor(game) { this.game = game; }

  // ---------------- starting a level ----------------
  // NEW GAME: the first campaign level there is
  startNewGame() {
    const id = urlLevel() || firstLevel();
    this.game.startLevel(id, { state: id === 'tutorial' && !urlLevel() ? 'cinematic' : 'intro' });
  }

  // CONTINUE: the furthest level opened
  continueGame() { this.game.startLevel(urlLevel() || latest(this.game.progress, has) || firstLevel()); }

  // RESTART: the current level again from its very beginning, the tutorial too (the pause's RESTART, Backspace in
  // play or dead, R on the results); only the lessons already taught are kept (forget)
  restart() { const g = this.game; g.startLevel(g.levelId || urlLevel() || firstLevel(), { retry: true }); }

  // RETRY, after a death (R, the pad's A / Y, a click, RETRY in the death screen's pause): the same level, from the
  // last place reached where the level has them (the tutorial's room: Game.tutorialAt; the chase's checkpoint:
  // systems/Checkpoints.js, Game.chaseAt), else its start
  retry() { const g = this.game; g.startLevel(g.levelId || urlLevel() || firstLevel(), { retry: true, resume: true }); }

  // what a new start keeps of the last run: the same level again (retry) keeps its lessons taught; a retry after a
  // death (resume) keeps the tutorial's last room and the chase's last checkpoint reached too
  forget(retry, resume) {
    const g = this.game;
    if (!retry) g.taught = new Set();
    if (!resume) { g.tutorialAt = null; g.chaseAt = null; }
  }

  // retry: the same level again (its lessons taught kept: Game.taught); resume: at the last place reached (the
  // tutorial's room: Game.tutorialAt, kept by systems/Tutorial.js; the chase's checkpoint: Game.chaseAt, kept by
  // systems/Checkpoints.js); state: what it opens on ('intro': the banner; 'cinematic': the opening, ui/Cinematic.js)
  startLevel(id, { retry = false, resume = false, state = 'intro' } = {}) {
    const g = this.game;
    g.levelId = LEVELS[id] ? id : firstLevel();
    this.forget(retry, resume);
    g.world?.dispose?.(); // the last run's canvases let go before the new one makes its own
    g.world = null;   // (nothing here holds the old world while the new one is built: it can be collected then)
    g.interp.still(); // (its bodies held there would keep the old world, all its buffers, alive through the new one)
    g.world = new World(g, LEVELS[g.levelId]);
    Music.setTrack(trackOf(LEVELS[g.levelId])); // the level's own track (its `music`)
    // he gets up off the ground (takes the gun off the car's seat) the first time only: a retry starts on his feet (with
    // the gun in hand), at once
    if (g.seen === g.levelId && !g.world.tutorial?.scene) {
      g.world.player.sit = 0; g.world.player.swig = null;
      g.world.drive?.skipGrab();
    }
    g.seen = g.levelId;
    g.cameraDirector.opening = new Opening(g.world.player); // the bottle's shots, where he opens on it
    g.best = loadBest(g.levelId);
    g.replay.stop();
    g.recorder.reset();
    g.recorder.attach(g.world.events);
    g.lens.bind(g.world.events);
    g.world.killCam.on = g.killCamOn;
    g.camera.bounds = { w: g.world.map.w * TILE, h: g.world.map.h * TILE };
    g.cameraDirector.start(); // the view it opens on: its first shot, no easing
    g.clock.reset();
    g.interp.still();
    g.prefs.watch.rest();
    g.clearScreen();
    g.clearedT = 0;
    // the soundtrack: calm until the squad wakes up or blood is shed (Tension, fed every frame in the world's frame),
    // its combat variant while the squad fights
    const ev = g.world.events;
    g.tension = new Tension();
    ev.on('shot', () => g.tension.bump('shot'));
    ev.on('kill', ({ victim }) => { if (!victim.isPlayer) g.tension.bump('kill'); });
    ev.on('explosion', () => g.tension.bump('blast'));
    ev.on('boss', () => g.tension.bump('boss')); // a boss's beat: the soundtrack at its fullest
    ev.on('alertPhase', ({ phase }) => Music.setCombat(AI.combatMusic.includes(phase)));
    Music.setCombat(false);
    Music.setCombo(0);
    Music.setIntensity(g.tension.level('normal'));
    ev.on('tutorialEnd', () => this.onTutorialEnd());
    g.sandbox.attach(g.world);
    g.ranked = !g.sandbox.cheats; // until a cheat is used (Game.debugKeys): a cheat carried over a restart counts too
    g.rumble.bind(g.world);
    g.cineT = 0;
    g.introT = 0;
    g.introOut = null;
    g.setState(state);
  }

  // a level finished: marked done, the next one opened (the tutorial's leap calls it too)
  completeLevel(id) {
    const g = this.game;
    g.progress = complete(g.progress, id, has);
    saveProgress(g.progress);
  }

  // ---------------- how a level ends ----------------
  // out of the tutorial by the window: a moment of slow motion (he lands in a roll) going black, then the leap seen
  // from the alley (he falls, rolls, gets up and goes), and the next level opens on him the next day (ui/cine/Leap.js)
  onTutorialEnd() {
    this.game.leapT = -1;
    Audio.play('gust', { vol: 0.8 });
    this.game.setState('fall');
  }

  // killer: whoever the kill is credited to (a guard, a vehicle, himself for his own blast), told on the death screen
  onPlayerDeath(cause, killer) {
    const g = this.game, D = GAME.death;
    g.deaths++;
    g.death = { cause, by: describeDeath(cause, killer), n: g.deaths };
    g.setState('dead');
    g.slowmo(...D.slowmo);
    g.camera.shake(D.shake);
    g.flash(D.flash.color, D.flash.a);
    Audio.play('death');
  }

  // the player stepped into the exit zone: he leaves in the getaway car when there is one (systems/Outro), on foot
  // straight to the results otherwise
  onExit() {
    const g = this.game;
    // the end of a chase's road with more of it to come: the car runs on as the picture goes black (state 'continued')
    if (g.world.level.chase?.next) {
      g.world.player.invulnerable = true;
      g.tempo.slow = null;
      g.setState('continued');
      return;
    }
    const car = g.world.getaway();
    if (!car) { this.showResults(); return; }
    g.world.startOutro(car);
    g.tempo.reset();
    g.setState('outro');
  }

  // the car is gone: the level's closing page when it has one (ui/cine/Ending.js), then the results
  endOutro() {
    const g = this.game;
    g.ending = ENDINGS[g.levelId] || null;
    if (!g.ending) { this.showResults(); return; }
    g.endingT = -1;
    g.setState('ending');
  }

  showResults() {
    const g = this.game, w = g.world;
    const tally = w.scoring.tally(levelScoring(g.levelId, w.totalEnemies));
    this.quiet(); // (on foot out of the exit: the slow motion's tint and muffle would stay over the results)
    // a run helped by the sandbox is shown but never kept as a record
    this.completeLevel(g.levelId);
    const kept = g.ranked ? saveBest(g.levelId, { total: tally.total, grade: tally.grade, time: w.runTime }) : { prev: g.best, record: false };
    const next = nextLevel(g.levelId, has);
    g.results = {
      ...tally, best: kept.prev, record: kept.record, ranked: g.ranked,
      level: { label: levelLabel(g.levelId), name: w.level.name || '' }, nextLevel: next,
    };
    g.resultsT = 0;
    g.replay.start();
    Audio.play('clear');
    g.setState('results');
  }

  // After the results: the next level, or the menu after the last; through the hit list when the level killed a
  // target the board has not crossed out yet.
  afterResults(next) {
    const g = this.game;
    if (deadCount(g.progress) > g.crossed) {
      g.after = next || null;
      this.leaveWorld();
      g.setState('hitlist');
    } else if (next) g.startLevel(next);
    else g.toTitle();
  }

  // how many dead targets the hit list has shown crossed out (the X is drawn once), kept
  markCrossed(n) {
    const g = this.game;
    if (n === g.crossed) return;
    g.crossed = n;
    saveCrossed(n);
  }

  toTitle() {
    const g = this.game;
    this.leaveWorld();
    g.sandbox.reset(); // the cheats stay with the session's runs, not past the title
    g.menu.reset('main');
    g.setState('title');
  }

  // ---------------- leaving a level ----------------
  // a level left (its results, the title, the hit list): what it did to the picture and the sound goes, and the
  // music's fight with it
  quiet() {
    this.game.clearScreen();
    Music.setCombat(false);
    Music.setCombo(0);
  }

  // the level left for good (the title, the hit list): nothing keeps its world alive (World.dispose where there is
  // one), the clips of its run are given back
  leaveWorld() {
    const g = this.game;
    this.quiet();
    g.world?.dispose?.();
    g.world = null;
    g.interp.still(); // the bodies it held from the last step: they kept the whole world alive at the title
    g.cameraDirector.opening = new Opening(null);
    g.rumble.unbind();
    g.sandbox.detach();
    g.recorder.detach?.();
    g.recorder.detach = null;
    g.replay.stop();
    g.recorder.release();
  }
}
