// The game's states, in one table: what each one does with a frame (update), what it draws (picture: in place of
// the world; over: on top of it, sharp; hold: the hold-to-skip ring) and its flags, so that every list of states
// lives here and nowhere else.
//   loading -> title -> [cinematic ->] intro -> play -> dead | [outro -> [ending ->]] results -> [hitlist ->] the next
//   level's intro (or the title); play / dead <-> pause; the tutorial ends play -> fall (-> its leap) -> the next
//   level's intro; a chase with more to come ends play -> continued (TO BE CONTINUED) -> results.
// The tutorial's 'fall' is two phases (phaseOf): the jump still seen in the world, then the leap's comic page ('leap',
// a phase only: Game.state stays 'fall').
// Flags (false when left out):
//   scene      drawn over a world (with one: the world's cues, the HUD's canvas and what goes over it)
//   rumble     the pad rumbles (systems/Rumble.js: in play only, never under a menu or a page)
//   cursor     the mouse's cursor is drawn
//   hud        the HUD (but while the tutorial's jump out of its window is staged: Tutorial `leap`)
//   backspace  Backspace restarts the level from its beginning (never over a level already finished)
//   page       a comic page fills the picture: the world is not seen behind it, nor what it did to the picture
//   lessons    the tutorial's lessons are given (Tutorial.pace)
//   auto       the world plays on by itself: the debug keys are not read
//   realTime   the world runs at 1, no slow motion (systems/TimeScale.js `auto`)
// Each update(g, dt, inp) is handed the Game (its verbs: startLevel, restart, retry, pause, showResults...).
import { FIXED_DT } from '../Config.js';
import { clamp } from '../../engine/math.js';
import Audio from '../../audio/Audio.js';
import Music from '../../audio/Music.js';
import { MENU_TRACK } from '../../audio/tracks/index.js';
import { PROF } from '../../engine/Profiler.js';
import { nextLevel } from '../systems/Progress.js';
import { outroOver } from '../systems/Outro.js';
import { finishView } from '../systems/Drive.js';
import { SMOKE } from '../data/atmosphere.js';
import { LEAP } from '../data/staging.js';
import { GAME } from '../data/game.js';
import { drawIntro, drawDead, drawOutro, drawContinued, INTRO, introBeats, SHUTTER_SOUND } from '../ui/Screens.js';
import { drawResults, resultsTimeline, resultsBeats } from '../ui/Results.js';
import { drawMenu } from '../ui/MenuArt.js';
import { pauseCard } from '../ui/Pause.js';
import { cineView, cineBeats, drawCinematic } from '../ui/Cinematic.js';
import { posterUp } from '../ui/title/Title.js';
import { posterBeats } from '../ui/title/Beats.js';
import { deadCount } from '../ui/title/HitList.js';
import { leapView, leapBeats, drawLeap } from '../ui/cine/Leap.js';
import { endingView, endingBeats, drawEnding } from '../ui/cine/Ending.js';
import { has, firstLevel, introCard } from './LevelFlow.js';

// out of the tutorial's window (state 'fall'): the jump's own staging (LEAP in data/staging.js, systems/Tutorial.js
// leaping: the slow motion, the window going up behind him, his roll) for `hold` s, going black over `fade` s more,
// then the leap seen from the alley (ui/cine/Leap.js) until the next level starts
export const FALL = { hold: LEAP.blast.hold + LEAP.roll.hold + LEAP.out, fade: 0.55 };
export const FALLEN = FALL.hold + FALL.fade;

// the phase the table goes by: a state, or the tutorial's leap once its fall has gone black
export const phaseOf = (state, t) => (state === 'fall' && t >= FALLEN ? 'leap' : state);

const play = (beats, from, to) => { for (const b of beats(from, to)) Audio.play(b.name, { vol: b.vol, ...b.opts }); };
const key = (inp, ...codes) => codes.some((c) => inp.hit(c));

// the menu's music under the title and the hit list
function menuMusic() {
  Music.setTrack(MENU_TRACK);
  Music.setIntensity(0);
}

// play starts at once; the level's card stays where it was and opens like a shutter over the first moments of play
function leaveIntro(g) {
  const at = Math.min(g.stateT, INTRO.leave);
  Audio.play(SHUTTER_SOUND.name, { vol: SHUTTER_SOUND.vol, ...SHUTTER_SOUND.opts });
  g.setState('play');
  g.introOut = at;
}

// the results (ui/Results.js): R / Y restarts the level; ENTER / SPACE / A / a click first fills the screen at once,
// then goes on to the next level (the menu after the last); ESC / START / B go to the menu. Its ticks and stamp are
// heard here.
function results(g, inp) {
  const r = g.results, end = resultsTimeline(r).end, G = GAME.guard.results;
  play((a, b) => resultsBeats(r, a, b), g.resultsT ?? 0, g.stateT);
  g.resultsT = g.stateT;
  const go = key(inp, 'Enter', 'NumpadEnter', 'Space') || inp.mouseHit(0);
  if (key(inp, 'KeyR')) g.restart();
  else if (g.stateT > G && key(inp, 'Escape', 'PadB')) g.toTitle();
  else if (go && g.stateT < end) { g.stateT = end; g.resultsT = end; }
  else if (go && g.stateT > G) g.flow.afterResults(r.nextLevel);
}

// The world's frame (play, dead, fall, outro, continued), once its state has had its keys: the right stick's cursor,
// the clock (systems/TimeScale.js), the sound and the music, the fixed steps (held by a hit-stop), the camera, the
// smoke closing in, the flash fading
function worldFrame(g, dt, inp) {
  const flags = stateOf(g).flags;
  g.cameraDirector.padAim(dt);
  const cc = g.world.chaseCam;
  cc?.update(dt); // at the wheel: the chase's beats (systems/ChaseCam.js), on the real clock
  g.tempo.update(dt, {
    auto: !!flags.realTime, base: g.sandbox.timeScale, lesson: () => g.teach(dt, inp),
    clock: (scale, target) => g.world.killCam.clock(scale, target), // a beat's ramp: down at once, snapped back
    chase: cc?.active && g.state === 'play' ? cc.scale : null,
  });
  // the opening on his cigarette (2A) is skipped by holding SPACE / pad A, as a comic page is (systems/LastDrag.js)
  const drag = g.state === 'play' ? g.world.drive?.drag : null;
  if (drag?.on) { if (g.holdSkip(dt)) drag.skip(); } else if (g.skipping) g.skip.reset();
  g.skipping = !!drag?.on;
  Audio.setMuffle(g.state === 'dead' ? GAME.muffle.dead : (1 - g.timeScale) * GAME.muffle.slow);
  if (g.world.cleared) g.clearedT += dt;
  g.tension.update(dt);
  g.world.killFeed.update(dt); // on the real clock: a hit-stop never holds a stamp up
  g.world.bossStage.update(dt);
  g.world.throwBeat.update(dt);
  g.cameraDirector.updateKillCam(dt);
  Music.setIntensity(g.tension.level(g.world.director.phase));
  Music.setCombo(g.world.scoring.combo);
  if (!g.tempo.held(dt)) {
    // the fixed step; what moves is noted before each one, and drawn between the last two (render, updateCamera)
    g.steps = g.clock.run(dt, () => {
      const aim = g.camera.screenToWorld(inp.mouse.x, inp.mouse.y), w = g.world;
      if (!flags.auto) g.debugKeys(inp, aim);
      if (g.smooth) g.interp.capture(w.physics.bodies(), w.movers());
      if (PROF.on) PROF.begin('sim');
      w.step(FIXED_DT * g.timeScale, inp, aim);
      if (PROF.on) PROF.end('sim');
      inp.consume();
      return !(g.hitstop > 0);
    });
  }
  g.cameraDirector.update(dt);
  // thick smoke about him closes the view in, slowly (never at the wheel: he drives through the smoke of the cars
  // ahead, the road stays seen)
  const p = g.world.player, thick = g.world.drive?.on ? 0 : g.world.smoke.murk(p.x, p.y);
  g.murk += (thick - g.murk) * (1 - Math.exp(-SMOKE.murk.ease * dt));
  g.flashA = Math.max(0, g.flashA - dt * GAME.flash.fade);
  if (g.state === 'outro' && outroOver(g.world.outro)) g.endOutro();
}

// a state of the world: Backspace where its flag says, then its own keys (`keys`: true when they ended the frame),
// then the world's frame
const world = (flags, keys = null, more = {}) => ({
  flags: { scene: true, rumble: true, ...flags },
  update(g, dt, inp) {
    if (this.flags.backspace && inp.hit('Backspace')) { g.restart(); inp.consume(); return; }
    if (keys?.(g, dt, inp)) return;
    worldFrame(g, dt, inp);
  },
  ...more,
});

export const STATES = {
  loading: { flags: {} },

  title: {
    flags: { cursor: true },
    update(g, dt, inp) {
      menuMusic();
      // the poster's fire, its rain, its sign's buzz (ui/title/Beats.js; the picture's clock is the time on the title)
      const t1 = g.stateT, t0 = g.titleT <= t1 && t1 - g.titleT < 0.5 ? g.titleT : t1;
      if (posterUp(g.menu)) for (const b of posterBeats(t0, t1)) Audio.play(b.name, { vol: b.vol });
      g.titleT = t1;
      g.menuInput.update(inp);
      inp.consume();
    },
  },

  // the hit list between two levels: the marker crosses the dead man out (heard from the picture, HitList.js), then a
  // key or a click goes on to the next level, or to the menu after the last; the menu's music under it
  hitlist: {
    flags: { cursor: true },
    update(g, dt, inp) {
      menuMusic();
      const go = key(inp, 'Enter', 'NumpadEnter', 'Space', 'Escape', 'PadB') || inp.mouseHit(0);
      if (go && g.stateT > GAME.guard.hitlist) {
        const next = g.after;
        g.after = null;
        g.flow.markCrossed(deadCount(g.progress));
        if (next) g.startLevel(next); else g.toTitle();
      }
      inp.consume();
    },
  },

  // the pause, over play or the death screen (RETRY in place of RESUME there: ui/Menu.js)
  pause: {
    flags: { scene: true, cursor: true },
    update(g, dt, inp) {
      // (R / Y from the pause's own page only, not from its options: RETRY over the death screen, else RESTART)
      // (a line confirmed is pressed down for a beat, then does what it says: nothing else is heard meanwhile)
      const root = () => g.menu.stack[0].sel;
      if (g.pick.busy) {
        if (g.pick.update(dt, root())) { const a = g.menu.activate(); if (a) g.menuInput.apply(a); }
      } else if (g.menu.depth === 0 && inp.hit('KeyR')) { if (g.pausedFrom?.state === 'dead') g.retry(); else g.restart(); }
      else {
        g.toggleVision(inp);
        g.menuInput.update(inp);
        if (g.state === 'pause') g.pick.update(dt, root());
      }
      inp.consume();
    },
    over(g, ctx, W, H, t) {
      const card = pauseCard(g.levelId, g.world.level, g.world);
      g.menuInput.rects = g.menuInput.drawn(drawMenu(ctx, W, H, t, g.menu, { pick: g.pick, card, bare: ctx === g.ctx }));
    },
  },

  // the level's score over the replay of its kills
  results: {
    flags: { scene: true, cursor: true },
    update(g, dt, inp) {
      g.cameraDirector.update(dt);
      g.replay.update(dt);
      results(g, inp);
      inp.consume();
    },
    over(g, ctx, W, H) { drawResults(ctx, W, H, g.stateT, g.results, g.renderer.replaying, g.input.device); },
  },

  // the opening comic: it plays by itself; SPACE held, or its end, goes on to the level's card
  cinematic: {
    flags: { scene: true, page: true },
    update(g, dt, inp) {
      Music.setIntensity(0);
      play(cineBeats, g.cineT, g.stateT);
      g.cineT = g.stateT;
      const skip = g.holdSkip(dt);
      inp.consume();
      g.cameraDirector.update(dt);
      if (skip || cineView(g.stateT).over) g.setState('intro');
    },
    picture(g, ctx, W, H) { drawCinematic(ctx, W, H, g.stateT); },
    hold: () => true,
  },

  // the level's card (ui/Screens.js drawIntro): it plays its beats, then a key, a click or its time is up hands over
  intro: {
    flags: { scene: true, cursor: true },
    update(g, dt, inp) {
      g.cameraDirector.update(dt);
      play((a, b) => introBeats(g.world.level, a, b), g.introT, g.stateT);
      g.introT = g.stateT;
      const skip = g.stateT > INTRO.skipAfter && (inp.mouseHit(0) || inp.anyPressed);
      inp.consume();
      if (skip || g.stateT >= INTRO.leave) leaveIntro(g);
    },
    over(g, ctx, W, H) { drawIntro(ctx, W, H, g.stateT, introCard(g)); },
  },

  // the level's closing page: the world waits behind it; SPACE held goes on to the results
  ending: {
    flags: { scene: true, page: true },
    update(g, dt, inp) {
      Music.setIntensity(0);
      play((a, b) => endingBeats(g.ending, a, b), g.endingT, g.stateT);
      g.endingT = g.stateT;
      const skip = g.holdSkip(dt);
      inp.consume();
      if (skip || endingView(g.ending, g.stateT).over) g.showResults();
    },
    picture(g, ctx, W, H) { drawEnding(ctx, W, H, g.ending, g.stateT); },
    hold: () => true,
  },

  // in play: Escape / START pauses; so does the gamepad in use going away, or the window losing the focus
  play: world({ cursor: true, hud: true, backspace: true, lessons: true }, (g, dt, inp) => {
    if (!(inp.hit('Escape') || inp.padLost || inp.focusLost)) return false;
    g.pause();
    inp.consume();
    return true;
  }, {
    // the level's card opening like a shutter over the first moments of play (leaveIntro)
    over(g, ctx, W, H) { if (g.introOut != null && g.stateT < INTRO.out) drawIntro(ctx, W, H, g.introOut, introCard(g), g.stateT); },
    hold: (g) => !!g.world?.drive?.drag?.on, // 2A's opening
  }),

  // the death screen over the world still going: R / Y / the pad's A retry at once, a click after a moment (he may have
  // died clicking); Escape / START opens the pause (RETRY, OPTIONS, QUIT TO MENU)
  dead: world({ cursor: true, hud: true, backspace: true }, (g, dt, inp) => {
    if (inp.hit('KeyR')) { g.retry(); inp.consume(); return true; }
    if (inp.hit('Escape')) { g.pause(); inp.consume(); return true; }
    if (inp.hit('PadA') || (g.stateT > GAME.guard.dead && inp.mouseHit(0))) { g.retry(); inp.consume(); return true; }
    return false;
  }, {
    over(g, ctx, W, H) { drawDead(ctx, W, H, g.stateT, g.deaths * 7, g.death, g.input.device); },
  }),

  // out of the tutorial's window: the world plays on by itself, its staging slowing it, going black
  fall: world({ lessons: true, auto: true }, null, {
    over(g, ctx, W, H) {
      ctx.globalAlpha = clamp((g.stateT - FALL.hold) / FALL.fade, 0, 1);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    },
  }),

  // the leap, the fall's page: the world is no longer seen and waits; SPACE held goes on to the next level
  leap: {
    flags: { scene: true, page: true },
    update(g, dt, inp) {
      const lt = g.stateT - FALLEN;
      play(leapBeats, g.leapT, lt);
      g.leapT = lt;
      const skip = g.holdSkip(dt);
      inp.consume();
      if (skip || leapView(lt).over) {
        const done = g.levelId;
        g.completeLevel(done);
        g.startLevel(nextLevel(done, has) || firstLevel());
      }
    },
    picture(g, ctx, W, H) { drawLeap(ctx, W, H, g.stateT - FALLEN); },
    hold: () => true,
  },

  // the getaway: the world plays on by itself, no input reaches it; it is skipped like a comic page, by HOLDING SPACE /
  // pad A (ui/cine/Hold.js), never by a stray key or click: he arrives at the car mid-fight, keys and buttons going
  outro: world({ auto: true, realTime: true }, (g, dt, inp) => {
    const skip = g.holdSkip(dt);
    inp.consume();
    if (g.world.outro.car.exploded) { g.showResults(); return true; }
    if (skip) { g.endOutro(); return true; }
    return false;
  }, {
    over(g, ctx, W, H) { drawOutro(ctx, W, H, g.world.outro); },
    hold: () => true,
  }),

  // TO BE CONTINUED (the end of a chase's road with more to come): skipped like a comic page once it is up, by
  // HOLDING SPACE / pad A, never by a key, a stick's step or a click still going from the drive; else the results
  // follow by themselves
  continued: world({ auto: true }, (g, dt, inp) => {
    const v = finishView(g.stateT), skip = v.skip && g.holdSkip(dt);
    if (!(skip || v.over)) return false;
    inp.consume();
    g.showResults();
    return true;
  }, {
    over(g, ctx, W, H, t) { drawContinued(ctx, W, H, finishView(g.stateT), g.world.level.chase.next, t); },
    hold: (g) => finishView(g.stateT).skip, // 2A's end
  }),
};

// the table's entry for the game's state now (g: { state, stateT })
export const stateOf = (g) => STATES[phaseOf(g.state, g.stateT)];
