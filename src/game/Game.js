import { FIXED_DT, PLAYER, PALETTE, TILE, AI } from './Config.js';
import { loadAssets } from '../engine/Assets.js';
import { clamp, lerp, angDiff } from '../engine/math.js';
import Input from '../engine/Input.js';
import Camera, { VIEW, fitView } from '../engine/Camera.js';
import Interp, { StepClock } from '../engine/Interp.js';
import Audio from '../audio/Audio.js';
import Music from '../audio/Music.js';
import { MENU_TRACK, trackOf } from '../audio/tracks/index.js';
import World from './world/World.js';
import Tension from './ai/Tension.js';
import PostFX from './render/PostFX.js';
import { ReplayRecorder, ReplayPlayer } from './render/Replay.js';
import { loadBest, saveBest } from './systems/Records.js';
import { loadSettings, saveSettings } from './systems/Settings.js';
import { CAMPAIGN, loadProgress, saveProgress, complete, latest, resetProgress, nextLevel, levelNumber, loadCrossed, saveCrossed } from './systems/Progress.js';
import { levelScoring } from './data/scoring.js';
import LEVELS from './data/levels/index.js';
import { drawHUD } from './ui/HUD.js';
import { drawLoading, drawIntro, drawDead, drawOutro, drawContinued, describeDeath, INTRO, introBeats, introTint, SHUTTER_SOUND } from './ui/Screens.js';
import { drawResults, resultsTimeline, resultsBeats } from './ui/Results.js';
import { PAD_BINDINGS, PAD_AIM } from './data/controls.js';
import { AIM, nextStyle } from './data/aim.js';
import { assistAim } from './systems/AimCue.js';
import Rumble from './systems/Rumble.js';
import Menu, { selectable, levelNotes } from './ui/Menu.js';
import { drawMenu } from './ui/MenuArt.js';
import { Pick, pauseCard } from './ui/Pause.js';
import { cineView, cineBeats, drawCinematic } from './ui/Cinematic.js';
import { drawTitle, posterUp } from './ui/title/Title.js';
import { posterBeats } from './ui/title/Beats.js';
import { deadCount } from './ui/title/HitList.js';
import { leapView, leapBeats, drawLeap } from './ui/cine/Leap.js';
import HoldSkip, { drawHold } from './ui/cine/Hold.js';
import { ENDINGS, endingView, endingBeats, drawEnding } from './ui/cine/Ending.js';
import { OUTRO, camBlend, outroOver } from './systems/Outro.js';
import { finishView } from './systems/Drive.js';
import { CHASE } from './data/chase.js';
import { drawSandbox } from './ui/SandboxPanel.js';
import Sandbox from './debug/Sandbox.js';
import { neon } from './ui/Text.js';
import Lens from './render/Lens.js';
import Direction from './systems/Direction.js';
import { killcamOn } from './data/killcam.js';
import Opening from './systems/Opening.js';
import { drawMurk } from './render/Murk.js';
import { cuesOn } from './render/Readability.js';
import { SMOKE } from './data/atmosphere.js';
import { createPost } from './render/PostGL.js';
import { POST } from './data/post.js';
import { quality, setQuality, levelOf, QualityWatch } from './systems/Quality.js';
import { devMode, devParam, DEV_KEYS } from './data/build.js';

// Top-level loop and state machine: loading -> title -> [cinematic ->] intro -> play -> dead | [outro -> [ending ->]]
// results, play <-> pause; the tutorial ends play -> fall -> the next level's intro; a chase with more to come ends
// play -> continued (TO BE CONTINUED, ui/Screens.js drawContinued) -> results
// (the title and the pause are the menu: ui/Menu.js for its pages, ui/MenuArt.js for its picture)
const VOLUMES = ['master', 'music', 'sfx', 'ambience'];
// ?level=<id>: the level NEW GAME / CONTINUE start, for the developers (e.g. ?level=lab, the physics test room;
// data/build.js: not in a release build)
const urlLevel = () => { const id = devParam('level'); return LEVELS[id] ? id : null; };
const has = (id) => !!LEVELS[id];
// out of the tutorial's window (state 'fall'): the world in slow motion (he lands and rolls) for `hold` s, going black
// over `fade` s more, then the leap seen from the alley (ui/cine/Leap.js) until the next level starts
const FALL = { hold: 0.7, fade: 0.55, slow: 0.4 };
const FALLEN = FALL.hold + FALL.fade;
// s the mouse rests on one of OPTIONS' things, crossed on its way right to the sheet, before that thing's sheet shows
const HOVER_DWELL = 0.15;
// which keys do an action (data/controls.js ACTIONS), for a lesson that ends when he does it (systems/Tutorial.js
// pace; the pad's buttons come as these: Input.bindPad)
const DOES = {
  attack: (inp) => inp.mouseDown(0),
  throw: (inp) => inp.mouseDown(2),
  use: (inp) => inp.down('KeyE'),
  action: (inp) => inp.down('Space'),
  reload: (inp) => inp.down('KeyR'),
};
// what the intro banner calls a level
const levelLabel = (id) => (id === 'tutorial' ? 'PROLOGUE' : CAMPAIGN.includes(id) ? `LEVEL ${levelNumber(id)}` : 'TEST LEVEL');
// the steps the middle of the backdrop's gradient drifts on (share of its diagonal: Game.backdrop); its flat tone
// under a map that fills the picture
const BACKDROP_STEP = 0.005, BACKDROP_FLAT = '#12061f';

export default class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.input.bindPad(PAD_BINDINGS); // the gamepad plays the keys and buttons (data/controls.js)
    this.padAimAt = null;              // the right stick's virtual cursor: { angle, reach, idle } (padAim)
    // the pad's rumble, felt from the world's events (systems/Rumble.js, data/rumble.js)
    this.rumble = new Rumble({ play: (fx, any) => this.input.rumble(fx, any), stop: () => this.input.stopRumble() });
    this.camera = new Camera();
    this.direction = new Direction();  // the camera's shots where a level is staged (the prologue)
    this.opening = new Opening(null);  // level 1's opening on the camera (startLevel)
    this.skip = new HoldSkip();        // a comic page skipped by holding SPACE (ui/cine/Hold.js)
    this.taught = new Set();           // the lessons already given this run (systems/Tutorial.js)
    this.murk = 0;                     // 0..1: how far thick smoke has closed the view in (render/Murk.js)
    this.paged = false;                // a comic page was over the world last frame (onPage)
    this.view = VIEW;                  // world px of height the picture shows (VIEW; at the wheel the drive's: fit)
    this.wheel = false;                // at the wheel (systems/Drive.js): the scene drawn 1:1 on whole px (fit)
    this.state = 'loading';
    this.stateT = 0;
    this.time = 0;
    this.world = null;
    this.clock = new StepClock(FIXED_DT); // the fixed step's accumulator (engine/Interp.js)
    this.interp = new Interp();        // the world drawn between its last two steps: smooth on a 120 / 144 Hz screen
    this.hitstop = 0;
    this.timeScale = 1;
    this.slow = null;
    this.flashA = 0;
    this.flashColor = '#fff';
    this.clearedT = 0;
    this.deaths = 0;
    this.loadP = 0;
    this.dev = devMode();              // the developer's keys and switches (data/build.js: off in a release build)
    this.pausedFrom = null;            // { state, t } the pause was opened from (pause / resume)
    this.settings = loadSettings();
    this.progress = loadProgress(undefined, has);
    this.menu = new Menu('main', () => this.menuContext());
    this.menuRects = [];               // where the menu's items were drawn last frame (MenuArt), for the mouse
    this.pick = new Pick();            // the pause's chosen line: its tab's slide, a confirm's press (ui/Pause.js)
    this.titleRects = [];              // where the title drew the menu's items (ui/title/Title.js)
    this.crossed = loadCrossed();      // how many dead targets the hit list has shown crossed out (the X is drawn once)
    this.after = null;                 // the level that follows the hit list between two levels (null: the menu)
    this.grab = null;                  // index of the slider held by the mouse
    this.lastMouse = { x: 0, y: 0 };
    this.dwell = null;                 // the thing of OPTIONS the mouse is on (pointed)
    this.postfx = new PostFX();        // 2D grading: only when the lens below cannot be had
    this.lens = new Lens();            // what the last pass of the picture does this frame
    this.post = createPost(canvas);    // that pass, on the graphics card (null: no WebGL, or ?post=0)
    if (this.post) this.post.onLost = () => this.resize(); // the card dropped it: the canvas back to the window's size
    this.lensOn = true;                // always, where it can be had; F6 (the developer's) flips it to compare
    this.lensNote = 0;                 // game time until which the F6 label stays up
    this.aimNote = 0;                  // ... and the F7 one (the aim's style)
    // to compare LOCK's marks (data/aim.js AIM.lock.marks): ?mark=tick picks one for the session
    const mark = devParam('mark');
    if (AIM.lock.marks.includes(mark)) AIM.lock.mark = mark;
    // the kill cam (systems/KillCam.js), but for ?killcam=off (a developer's switch, to compare)
    this.killCamOn = killcamOn(devParam('killcam'));
    // the picture between two steps, but for ?interp=off (a developer's switch, to compare: drawn as stepped)
    this.smooth = devParam('interp') !== 'off';
    this.sandbox = new Sandbox(); // F1: spawn tools and cheats
    this.recorder = new ReplayRecorder();           // kill clips of the run, taken off the rendered frames
    this.replay = new ReplayPlayer(this.recorder);  // plays them behind the results
    // the fullscreen toggle tells the truth: whoever left it (Esc, the browser), the toggle follows; what is kept for
    // the next session is only what was chosen (the menu's toggle: fullChoice), never the browser throwing us out
    this.wantFull = this.settings.fullscreen; // asked last session: taken again at the first key or click
    this.fullChoice = !!this.settings.fullscreen;
    this.fullAsk = null;                      // what setFullscreen asked, until the browser answers
    this.settings.fullscreen = !!document.fullscreenElement;
    document.addEventListener('fullscreenchange', () => this.onFullscreen(!!document.fullscreenElement));
    this.watch = new QualityWatch(this.settings.autoQuality); // AUTO's eye on the frame time (systems/Quality.js)
    for (const k of [...VOLUMES, 'quality', 'shake', 'rumble']) this.applySetting(k);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // The picture for a view `view` world px high in a window h device px high: { ss: scene px a window px, zoom }
  // (engine/Camera.js fitView: on foot the lens brings a larger scene down to the window; at the wheel the scene is
  // the window, at a whole zoom, and the lens scales nothing; the QUALITY option draws fewer px on foot)
  fit(view, h) { return fitView(view, h, !!this.post?.ok && this.lensOn, this.wheel, quality()); }

  resize() {
    const dpr = window.devicePixelRatio || 1, w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
    const { ss, zoom } = this.fit(this.view, h), was = this.canvas.width, wasH = this.canvas.height;
    this.canvas.width = Math.round(w * ss);
    this.canvas.height = Math.round(h * ss);
    this.camera.resize(this.canvas.width, this.canvas.height, zoom);
    // (the mouse is kept in the scene's px: it stays where it was on the window)
    if (was && wasH && this.input) { this.input.mouse.x *= this.canvas.width / was; this.input.mouse.y *= this.canvas.height / wasH; }
    this.post?.resize(w, h);
    this.vignette = null;
  }

  // The view from now on: its height (world px) and whether it is the wheel's (drawn 1:1 and held on whole px:
  // fit, Camera `pixel`). The canvas is resized for it at once: one cut, no zoom eased from one to the other (an
  // in-between zoom is not a whole one)
  setView(view, wheel = false) {
    this.camera.pixel = wheel;
    if (view === this.view && wheel === this.wheel) return;
    this.view = view;
    this.wheel = wheel;
    this.resize();
  }

  async init() {
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    await loadAssets((p) => { this.loadP = p; });
    this.setState('title');
  }

  setState(s) {
    if (s !== 'play') this.introOut = null; // the level's card opens over play only (leaveIntro)
    if (s !== 'pause') this.pausedFrom = null;
    // into play from a menu, a card or a screen: the button that took him there is no shot or swing
    if (s === 'play' && this.state !== 'play') this.input.holdMouse();
    this.skip.reset();
    this.state = s; this.stateT = 0; this.grab = null; this.menuRects = [];
  }

  // ---------------- settings ----------------
  // what a setting does once changed (the value is already in this.settings; fullscreen goes by setFullscreen)
  applySetting(key) {
    const v = this.settings[key];
    if (VOLUMES.includes(key)) Audio.setVolume(key, v);
    else if (key === 'quality') this.applyQuality();
    else if (key === 'shake') this.camera.shakeScale = v;
    else if (key === 'rumble') this.rumble.setScale(v);
  }

  // The QUALITY option put in force (data/quality.js): what the renderers read from now on, and the scene's size
  // with it (fit). AUTO goes on from the level it had settled on.
  applyQuality() {
    this.watch.level = setQuality(levelOf(this.settings)).level;
    this.watch.rest();
    this.resize();
  }

  // AUTO: the frame's real time (ms) told to its watch, in play only (no hit-stop); a level down is
  // put in force at once and kept for the next session
  watchPace(ms) {
    if (this.settings.quality !== 'auto') return;
    const to = this.watch.frame(ms, this.state === 'play' && !!this.world && !(this.hitstop > 0));
    if (!to) return;
    this.settings.autoQuality = to;
    this.applyQuality();
    this.save();
  }

  // the aim's settings as the world reads them: its style (render/AimArt.js, Player.startLunge's LOCK) and LOCK's floor chevron
  aimTo(world) {
    world.aimStyle = this.settings.aim;
    world.aimMark = !!this.settings.aimMark;
  }

  // save: false while a slider is dragged (saved on release)
  setSetting(key, value, save = true) {
    if (key === 'fullscreen') { this.setFullscreen(value); return; } // the setting follows fullscreenchange
    if (this.settings[key] === value) return;
    if (key === 'quality' && value === 'auto') this.settings.autoQuality = 'high'; // chosen again: it finds its level anew
    this.settings[key] = value;
    this.applySetting(key);
    if (save) this.save();
  }

  // the settings kept for the next session: fullscreen as chosen, not as the browser left it (onFullscreen)
  save() { saveSettings({ ...this.settings, fullscreen: this.fullChoice }); }

  // must run within a key press or a click (the browser's rule): update() is called on the frame after one
  setFullscreen(on) {
    // a pad's button is no gesture to the browser: asked from the pad, it is taken at the next key or click
    if (on && globalThis.navigator?.userActivation?.isActive === false) { this.wantFull = true; return; }
    this.fullAsk = on;
    try {
      const d = document, p = on ? d.documentElement.requestFullscreen?.() : d.fullscreenElement && d.exitFullscreen?.();
      p?.catch?.(() => {});
    } catch { /* refused: the toggle keeps showing the truth */ }
  }

  // fullscreen came or went: the toggle shows it; kept when it is what was asked; in it, ESC is the game's (the
  // browser's keyboard lock: held, it still leaves), so that it pauses instead of throwing us out
  onFullscreen(on) {
    this.settings.fullscreen = on;
    if (this.fullAsk === on) { this.fullChoice = on; this.save(); }
    this.fullAsk = null;
    if (!on) return;
    try { globalThis.navigator?.keyboard?.lock?.(['Escape'])?.catch?.(() => {}); } catch { /* no lock: ESC leaves */ }
  }

  // ---------------- progression ----------------
  // the campaign levels there are, in order, for the menu
  campaign() { return CAMPAIGN.filter(has).map((id) => ({ id, name: LEVELS[id].name || id.toUpperCase() })); }
  firstLevel() { return this.campaign()[0]?.id || Object.keys(LEVELS)[0]; }

  menuContext() {
    return { settings: this.settings, progress: this.progress, best: (id) => loadBest(id), levels: this.campaign(), device: this.input.device,
      rumbleOk: !this.input.padConnected || this.input.canRumble, dead: this.pausedFrom?.state === 'dead' };
  }

  // a level finished: marked done, the next one opened (the tutorial calls it too)
  completeLevel(id) {
    this.progress = complete(this.progress, id, has);
    saveProgress(this.progress);
  }

  // ---------------- starting a level ----------------
  // NEW GAME: the first campaign level there is
  startNewGame() {
    const id = urlLevel() || this.firstLevel();
    this.startLevel(id, { state: id === 'tutorial' && !urlLevel() ? 'cinematic' : 'intro' });
  }

  // CONTINUE: the furthest level opened
  continueGame() { this.startLevel(urlLevel() || latest(this.progress, has) || this.firstLevel()); }

  // the current level again (R, Backspace, a retry after a death)
  newGame() { this.startLevel(this.levelId || urlLevel() || this.firstLevel(), { retry: true }); }

  // retry: the same level again (the tutorial then starts at the last room reached: this.tutorialAt, kept by
  // systems/Tutorial.js); state: what it opens on ('intro': the banner; 'cinematic': the opening, ui/Cinematic.js)
  startLevel(id, { retry = false, state = 'intro' } = {}) {
    this.levelId = LEVELS[id] ? id : this.firstLevel();
    if (!retry) { this.tutorialAt = null; this.taught = new Set(); }
    this.world?.dispose?.(); // the last run's canvases let go before the new one makes its own
    this.world = new World(this, LEVELS[this.levelId]);
    this.aimTo(this.world); // before its first step: a melee swing reads it (Player.startLunge)
    Music.setTrack(trackOf(LEVELS[this.levelId])); // the level's own track (its `music`)
    // he gets up off the ground (takes the gun off the car's seat) the first time only: a retry starts on his feet (with
    // the gun in hand), at once
    if (this.seen === this.levelId && !this.world.tutorial?.scene) {
      this.world.player.sit = 0; this.world.player.swig = null;
      this.world.drive?.skipGrab();
    }
    this.seen = this.levelId;
    this.opening = new Opening(this.world.player); // the bottle's shots, where he opens on it
    this.best = loadBest(this.levelId);
    this.replay.stop();
    this.recorder.reset();
    this.recorder.attach(this.world.events);
    this.lens.bind(this.world.events);
    this.world.killCam.on = this.killCamOn;
    const p = this.world.player;
    this.camera.bounds = { w: this.world.map.w * TILE, h: this.world.map.h * TILE };
    // a level driven in the van opens on the drive's view, ahead of it (systems/Drive.js)
    const dr = this.world.drive;
    this.setView(dr ? dr.view : VIEW, !!dr);
    this.camera.sway = !dr;
    this.camera.swayK = dr ? 0 : 1;
    // a staged level opens on its first shot, no easing
    const shot = this.stagedShot();
    this.direction.reset();
    this.direction.set(shot?.name, shot?.at, true, this.camera.zoom);
    this.camera.scale = this.direction.zoom;
    const z0 = this.camera.zoom * this.camera.scale, fr = dr && dr.frame(this.camera.w / z0, z0);
    const at = dr ? dr.lock(this.direction.aim(fr.x, fr.y), z0) : p;
    this.camera.snap(at.x, at.y);
    this.clock.reset();
    this.interp.still();
    this.watch.rest();
    this.clearScreen();
    this.clearedT = 0;
    this.padAimAt = null;
    // the soundtrack: calm until the squad wakes up or blood is shed (Tension, fed every frame in update), its
    // combat variant while the squad fights
    const ev = this.world.events;
    this.tension = new Tension();
    ev.on('shot', () => this.tension.bump('shot'));
    ev.on('kill', ({ victim }) => { if (!victim.isPlayer) this.tension.bump('kill'); });
    ev.on('explosion', () => this.tension.bump('blast'));
    ev.on('boss', () => this.tension.bump('boss')); // a boss's beat: the soundtrack at its fullest
    ev.on('alertPhase', ({ phase }) => Music.setCombat(AI.combatMusic.includes(phase)));
    Music.setCombat(false);
    Music.setCombo(0);
    Music.setIntensity(this.tension.level('normal'));
    ev.on('tutorialEnd', () => this.onTutorialEnd());
    this.sandbox.attach(this.world);
    this.ranked = !this.sandbox.cheats; // until a cheat is used (debugKeys): a cheat carried over a restart counts too
    this.rumble.bind(this.world);
    this.cineT = 0;
    this.introT = 0;
    this.introOut = null;
    this.setState(state);
  }

  // out of the tutorial by the window: a moment of slow motion (he lands in a roll) going black, then the leap seen
  // from the alley (he falls, rolls, gets up and goes), and the next level opens on him three weeks later
  onTutorialEnd() {
    this.slowmo(FALL.slow, FALLEN);
    this.leapT = -1;
    Audio.play('gust', { vol: 0.8 });
    this.setState('fall');
  }

  // a comic page fills the screen (the opening, the leap out of the tutorial, a level's closing page): the world is
  // not seen behind it, nor anything it was doing to the picture
  onPage() { return this.state === 'cinematic' || this.state === 'ending' || (this.state === 'fall' && this.stateT >= FALLEN); }

  // what the world does to the picture and the sound let go: the slow motion and its muffle, a flash, the smoke
  // closing in, the shake and the lens' kicks (a new level; a page coming up over the world, which then stands still
  // and would hold them as they were)
  clearScreen() {
    this.hitstop = 0;
    this.timeScale = 1;
    this.slow = null;
    this.flashA = 0;
    this.murk = 0;
    this.camera.settle();
    this.lens.reset();
    Audio.setMuffle(0);
  }

  // a level left (its results, the title, the hit list): what it did to the picture and the sound goes, and the
  // music's fight with it
  quiet() {
    this.clearScreen();
    Music.setCombat(false);
    Music.setCombo(0);
  }

  // the level left for good (the title, the hit list): nothing keeps its world alive (World.dispose where there is
  // one), the clips of its run are given back
  leaveWorld() {
    this.quiet();
    this.world?.dispose?.();
    this.world = null;
    this.opening = new Opening(null);
    this.rumble.unbind();
    this.sandbox.detach();
    this.recorder.detach?.();
    this.recorder.detach = null;
    this.replay.stop();
    this.recorder.release();
  }

  // play starts at once; the card stays where it was and opens like a shutter over the first moments of play
  leaveIntro() {
    const at = Math.min(this.stateT, INTRO.leave);
    Audio.play(SHUTTER_SOUND.name, { vol: SHUTTER_SOUND.vol, ...SHUTTER_SOUND.opts });
    this.setState('play');
    this.introOut = at;
  }

  // what the level's card shows (ui/Screens.js drawIntro)
  introCard() {
    return { level: this.world.level, best: this.best, label: levelLabel(this.levelId), device: this.input.device, tint: introTint(this.levelId) };
  }

  // ---------------- hooks called by the world ----------------
  slowmo(scale, dur) { this.slow = { scale, t: dur }; }
  flash(color, a) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  // killer: whoever the kill is credited to (a guard, a vehicle, himself for his own blast), told on the death screen
  onPlayerDeath(cause, killer) {
    this.deaths++;
    this.death = { cause, by: describeDeath(cause, killer), n: this.deaths };
    this.setState('dead');
    this.slowmo(0.18, 1.6);
    this.camera.shake(0.8);
    this.flash('#ff2040', 0.5);
    Audio.play('death');
  }
  onCleared() { this.clearedT = 0; }
  // the player stepped into the exit zone: he leaves in the getaway car when there is one (systems/Outro), on foot
  // straight to the results otherwise
  onExit() {
    // the end of a chase's road with more of it to come: the car runs on as the picture goes black (state 'continued')
    if (this.world.level.chase?.next) {
      this.world.player.invulnerable = true;
      this.slow = null;
      this.setState('continued');
      return;
    }
    const car = this.world.getaway();
    if (!car) { this.showResults(); return; }
    this.world.startOutro(car);
    this.slow = null;
    this.timeScale = 1;
    this.hitstop = 0;
    this.setState('outro');
  }
  // the car is gone: the level's closing page when it has one (ui/cine/Ending.js), then the results
  endOutro() {
    this.ending = ENDINGS[this.levelId] || null;
    if (!this.ending) { this.showResults(); return; }
    this.endingT = -1;
    this.setState('ending');
  }
  showResults() {
    const w = this.world;
    const tally = w.scoring.tally(levelScoring(this.levelId, w.totalEnemies));
    this.quiet(); // (on foot out of the exit: the slow motion's tint and muffle would stay over the results)
    // a run helped by the sandbox is shown but never kept as a record
    this.completeLevel(this.levelId);
    const kept = this.ranked ? saveBest(this.levelId, { total: tally.total, grade: tally.grade, time: w.runTime }) : { prev: this.best, record: false };
    const next = nextLevel(this.levelId, has);
    this.results = {
      ...tally, best: kept.prev, record: kept.record, ranked: this.ranked,
      level: { label: levelLabel(this.levelId), name: w.level.name || '' }, nextLevel: next,
    };
    this.resultsT = 0;
    this.replay.start();
    Audio.play('clear');
    this.setState('results');
  }
  toTitle() {
    this.leaveWorld();
    this.sandbox.reset(); // the cheats stay with the session's runs, not past the title
    this.menu.reset('main');
    this.setState('title');
  }

  // ESC / START (or the pad gone, the window left): the pause menu over the state it was opened from (play, or the
  // death screen: then RETRY in place of RESUME, ui/Menu.js)
  pause() {
    this.input.padLost = this.input.focusLost = false;
    if (this.state === 'play') this.world.player.interrupt?.();
    const from = { state: this.state, t: this.stateT };
    this.menu.reset('pause');
    this.pick.reset();
    this.setState('pause');
    this.pausedFrom = from;
  }
  // back to what the pause was opened from (the death screen where it was)
  resume() {
    const from = this.pausedFrom;
    this.setState(from?.state || 'play');
    if (from?.state === 'dead') this.stateT = from.t;
  }

  // ---------------- loop ----------------
  loop(ts) {
    requestAnimationFrame(this.loop);
    const now = ts / 1000, real = this.last ? now - this.last : 0;
    const dt = Math.min(0.1, real);
    this.last = now;
    this.time += dt;
    this.stateT += dt;
    const t0 = performance.now();
    this.update(dt);
    const t1 = performance.now();
    this.render();
    this.sample(dt, t1 - t0, performance.now() - t1);
    this.watchPace(real * 1000);
  }

  // rolling frame stats, refreshed twice a second into this.perf (shown by the F4 overlay)
  sample(dt, upMs, drMs) {
    const p = this.perfAcc || (this.perfAcc = { t: 0, n: 0, worst: 0, up: 0, dr: 0 });
    p.t += dt; p.n++; p.up += upMs; p.dr += drMs;
    p.worst = Math.max(p.worst, dt * 1000);
    if (p.t < 0.5) return;
    this.perf = { fps: Math.round(p.n / p.t), frame: (p.t * 1000) / p.n, worst: p.worst, update: p.up / p.n, render: p.dr / p.n };
    p.t = p.n = p.worst = p.up = p.dr = 0;
  }

  update(dt) {
    this.advance(dt);
    // the pad rumbles in play only (not paused, no menu, no page over the world), the pad in hand
    const s = this.state, live = !!this.world && (['play', 'dead', 'outro', 'continued'].includes(s) || (s === 'fall' && this.stateT < FALLEN));
    this.rumble.update(dt, live, this.input.device === 'pad');
  }

  // the frame's input, menus, screens and simulation
  advance(dt) {
    const inp = this.input;
    inp.poll(dt);
    // the developer's keys do nothing in a release build (data/build.js)
    if (!this.dev) for (const k of DEV_KEYS) inp.pressed.delete(k);
    // the pad gone or the window left pause play only: told anywhere else, it is forgotten
    if (this.state !== 'play') inp.padLost = inp.focusLost = false;
    if (inp.anyPressed) {
      Audio.unlock().then(() => Music.start());
      if (this.wantFull) { this.wantFull = false; this.setFullscreen(true); }
    }

    if (this.state === 'loading') return;
    // a page comes up over the world: what the world was doing to the picture goes
    const page = !!this.world && this.onPage();
    if (page && !this.paged) this.clearScreen();
    this.paged = page;
    // debug: the picture with / without the lens
    if (inp.hit('F6') && this.post) {
      this.lensOn = !this.lensOn;
      this.post.show(this.lensOn);
      this.resize(); // (the canvas' size goes with it: fit)
      this.lensNote = this.time + 1.6;
    }
    // debug: the next way of showing the aim (data/aim.js; the setting `aim` keeps it, no menu row)
    if (inp.hit('F7')) {
      this.setSetting('aim', nextStyle(this.settings.aim));
      this.aimNote = this.time + AIM.note;
    }
    if (this.state === 'hitlist') {
      // the hit list between two levels: the marker crosses the dead man out (heard from the picture, HitList.js),
      // then a key or a click goes on to the next level, or to the menu after the last
      const go = ['Enter', 'NumpadEnter', 'Space', 'Escape', 'PadB'].some((c) => inp.hit(c)) || inp.mouseHit(0);
      if (go && this.stateT > 1) {
        const next = this.after;
        this.after = null;
        this.markCrossed(deadCount(this.progress));
        if (next) this.startLevel(next); else this.toTitle();
      }
      inp.consume();
      return;
    }
    if (this.state === 'title') {
      Music.setTrack(MENU_TRACK);
      Music.setIntensity(0);
      // the poster's fire, its rain, its sign's buzz (ui/title/Beats.js; the picture's clock is the time on the title)
      const t1 = this.stateT, t0 = this.titleT <= t1 && t1 - this.titleT < 0.5 ? this.titleT : t1;
      if (posterUp(this.menu)) for (const b of posterBeats(t0, t1)) Audio.play(b.name, { vol: b.vol });
      this.titleT = t1;
      this.updateMenu(inp);
      inp.consume();
      return;
    }
    if (this.state === 'pause') {
      // (R / Y restart from the pause's own page only: not from its options)
      // (a line confirmed is pressed down for a beat, then does what it says: nothing else is heard meanwhile)
      const root = () => this.menu.stack[0].sel;
      if (this.pick.busy) {
        if (this.pick.update(dt, root())) { const a = this.menu.activate(); if (a) this.applyMenu(a); }
      } else if (this.menu.depth === 0 && inp.hit('KeyR')) this.newGame();
      else {
        if (inp.hit('F2')) this.world.showVision = !this.world.showVision;
        this.updateMenu(inp);
        if (this.state === 'pause') this.pick.update(dt, root());
      }
      inp.consume();
      return;
    }
    if (this.state === 'results') {
      this.updateCamera(dt);
      this.replay.update(dt);
      this.updateResults(inp);
      inp.consume();
      return;
    }
    if (this.state === 'cinematic') {
      // the opening plays by itself; SPACE held, or its end, goes on to the level's card
      Music.setIntensity(0);
      for (const b of cineBeats(this.cineT, this.stateT)) Audio.play(b.name, { vol: b.vol, ...b.opts });
      this.cineT = this.stateT;
      const skip = this.holdSkip(dt);
      inp.consume();
      this.updateCamera(dt);
      if (skip || cineView(this.stateT).over) this.setState('intro');
      return;
    }
    if (this.state === 'intro') {
      // the level's card (ui/Screens.js drawIntro): it plays its beats, then a key, a click or its time is up hands over
      this.updateCamera(dt);
      for (const b of introBeats(this.world.level, this.introT, this.stateT)) Audio.play(b.name, { vol: b.vol, ...b.opts });
      this.introT = this.stateT;
      const skip = this.stateT > INTRO.skipAfter && (inp.mouseHit(0) || inp.anyPressed);
      inp.consume();
      if (skip || this.stateT >= INTRO.leave) this.leaveIntro();
      return;
    }

    if (this.state === 'ending') {
      // the level's closing page: the world waits behind it; SPACE held goes on to the results
      Music.setIntensity(0);
      for (const b of endingBeats(this.ending, this.endingT, this.stateT)) Audio.play(b.name, { vol: b.vol, ...b.opts });
      this.endingT = this.stateT;
      const skip = this.holdSkip(dt);
      inp.consume();
      if (skip || endingView(this.ending, this.stateT).over) this.showResults();
      return;
    }

    // play / dead / outro: run the simulation (R reloads while alive, restarts once dead; Backspace restarts anytime)
    if (inp.hit('Backspace') || (this.state === 'dead' && inp.hit('KeyR'))) { this.newGame(); inp.consume(); return; }
    if (this.state === 'fall' && this.stateT >= FALLEN) {
      // the leap: the world is no longer seen and waits; SPACE held goes on to the next level
      const lt = this.stateT - FALLEN;
      for (const b of leapBeats(this.leapT, lt)) Audio.play(b.name, { vol: b.vol, ...b.opts });
      this.leapT = lt;
      const skip = this.holdSkip(dt);
      inp.consume();
      if (skip || leapView(lt).over) {
        const done = this.levelId;
        this.completeLevel(done);
        this.startLevel(nextLevel(done, has) || this.firstLevel());
      }
      return;
    }
    const outro = this.state === 'outro' || this.state === 'fall' || this.state === 'continued'; // the world plays on by itself
    if (this.state === 'continued') {
      // TO BE CONTINUED: a fresh key or a click passes it once it is up, else the results follow by themselves
      const v = finishView(this.stateT);
      const skip = v.skip && (inp.pressed.size > 0 || inp.mouseHit(0));
      if (skip || v.over) { inp.consume(); this.showResults(); return; }
    }
    if (this.state === 'outro') {
      // the world plays on by itself: no input reaches it; a fresh key press or a click skips to what follows (the
      // level's closing page, or the results)
      const skip = this.stateT > OUTRO.skipAfter && (inp.pressed.size > 0 || inp.mouseHit(0));
      inp.consume();
      if (this.world.outro.car.exploded) { this.showResults(); return; }
      if (skip) { this.endOutro(); return; }
    }
    // Escape / START pauses; so does the gamepad in use going away, or the window losing the focus (hidden, left);
    // once dead, Escape / START opens it too (RETRY, OPTIONS, QUIT TO MENU)
    if ((this.state === 'play' && (inp.hit('Escape') || inp.padLost || inp.focusLost)) || (this.state === 'dead' && inp.hit('Escape'))) {
      this.pause();
      inp.consume();
      return;
    }
    // once dead: R and the pad's A / Y restart at once, a click after a moment (he may have died clicking)
    if (this.state === 'dead' && (inp.hit('PadA') || (this.stateT > 0.5 && inp.mouseHit(0)))) { this.newGame(); inp.consume(); return; }
    this.padAim(dt);

    // time scale (slow motion)
    let target = this.state === 'outro' ? 1 : this.sandbox.timeScale;
    if (this.slow && this.state !== 'outro') {
      target = Math.min(target, this.slow.scale);
      this.slow.t -= dt;
      if (this.slow.t <= 0) this.slow = null;
    }
    const taught = this.teach(dt, inp);
    target = Math.min(target, taught.scale);
    this.timeScale = taught.beat ? target : lerp(this.timeScale, target, 1 - Math.pow(0.001, dt));
    this.timeScale = this.world.killCam.clock(this.timeScale, target); // a beat's ramp: down at once, snapped back
    // at the wheel: the chase's beats (systems/ChaseCam.js), their own ramp as it is; and the opening on his
    // cigarette skipped by holding SPACE / pad A, as a comic page is (systems/LastDrag.js)
    const cc = this.world.chaseCam;
    cc?.update(dt);
    if (cc?.active && this.state === 'play') this.timeScale = Math.min(target, cc.scale);
    const drag = this.state === 'play' ? this.world.drive?.drag : null;
    if (drag?.on) { if (this.holdSkip(dt)) drag.skip(); } else if (this.skipping) this.skip.reset();
    this.skipping = !!drag?.on;
    Audio.setMuffle(this.state === 'dead' ? 0.75 : (1 - this.timeScale) * 0.7);
    if (this.world.cleared) this.clearedT += dt;
    this.tension.update(dt);
    this.world.killFeed.update(dt); // on the real clock: a hit-stop never holds a stamp up
    this.world.bossStage.update(dt);
    this.world.throwBeat.update(dt);
    this.updateKillCam(dt);
    Music.setIntensity(this.tension.level(this.world.director.phase));
    Music.setCombo(this.world.scoring.combo);

    if (this.hitstop > 0) {
      this.hitstop -= dt;
    } else {
      // the fixed step; what moves is noted before each one, and drawn between the last two (render, updateCamera)
      this.clock.run(dt, () => {
        const aim = this.camera.screenToWorld(inp.mouse.x, inp.mouse.y), w = this.world;
        if (!outro) this.debugKeys(inp, aim);
        if (this.smooth) this.interp.capture(w.physics.bodies(), w.movers());
        w.step(FIXED_DT * this.timeScale, inp, aim);
        inp.consume();
        return !(this.hitstop > 0);
      });
    }
    this.updateCamera(dt);
    // thick smoke about him closes the view in, slowly
    const p = this.world.player;
    // (never at the wheel: he drives through the smoke of the cars ahead, the road stays seen)
    const thick = this.world.drive?.on ? 0 : this.world.smoke.murk(p.x, p.y);
    this.murk += (thick - this.murk) * (1 - Math.exp(-SMOKE.murk.ease * dt));
    this.flashA = Math.max(0, this.flashA - dt * 3);
    if (this.state === 'outro' && outroOver(this.world.outro)) this.endOutro();
  }

  // the tutorial's lessons (systems/Tutorial.js pace): the time scale they want, and whether a lesson's slow motion
  // sets it as it is (`beat`: its own ramp down and back, no easing of ours on it). Never a stop: the world goes on,
  // his hands are his all along
  teach(dt, inp) {
    const T = this.state === 'play' ? this.world?.tutorial : null;
    if (!T) return { scale: 1, beat: false };
    const beat = !!T.lesson, scale = T.pace(dt, (action) => !!DOES[action]?.(inp));
    return { scale, beat: beat || !!T.lesson };
  }

  // a comic page is skipped by holding SPACE (a pad's A: bound to it, data/controls.js), nothing else (ui/cine/Hold.js)
  holdSkip(dt) { return this.skip.update(dt, this.input.down('Space') || this.input.down('PadA')); }

  // the results (ui/Results.js): R / Y retries; ENTER / SPACE / A / a click first fills the screen at once, then goes
  // on to the next level (the menu after the last); ESC / START / B go to the menu. Its ticks and stamp are heard here.
  updateResults(inp) {
    const r = this.results, end = resultsTimeline(r).end, key = (...codes) => codes.some((c) => inp.hit(c));
    for (const b of resultsBeats(r, this.resultsT ?? 0, this.stateT)) Audio.play(b.name, { vol: b.vol, ...b.opts });
    this.resultsT = this.stateT;
    const go = key('Enter', 'NumpadEnter', 'Space') || inp.mouseHit(0);
    if (key('KeyR')) this.newGame();
    else if (this.stateT > 0.3 && key('Escape', 'PadB')) this.toTitle();
    else if (go && this.stateT < end) { this.stateT = end; this.resultsT = end; }
    else if (go && this.stateT > 0.3) {
      this.afterResults(r.nextLevel);
    }
  }
  // After the results: the next level, or the menu after the last; through the hit list when the level killed a
  // target the board has not crossed out yet.
  afterResults(next) {
    if (deadCount(this.progress) > this.crossed) {
      this.after = next || null;
      this.leaveWorld();
      this.setState('hitlist');
    } else if (next) this.startLevel(next);
    else this.toTitle();
  }
  markCrossed(n) {
    if (n === this.crossed) return;
    this.crossed = n;
    saveCrossed(n);
  }
  // what the title's picture is told (ui/title/Title.js)
  titleView() {
    return {
      menu: this.menu, progress: this.progress, device: this.input.device, mouse: this.input.mouse, between: this.state === 'hitlist',
      notes: this.state === 'hitlist' ? levelNotes(this.menuContext()) : null,
      crossed: this.crossed, sound: (name, vol, opts) => Audio.play(name, { vol, ...opts }), onCrossed: (n) => this.markCrossed(n),
    };
  }

  // The right stick's virtual cursor (data/controls.js PAD_AIM): a point round the player, nearer or further with the
  // push, put where the mouse would be, so that the aim, the camera's look-ahead and the cursor all follow it. With
  // the stick at rest the aim stays put, and turns to where he walks after a moment. No aim assist, but the LOCK concept's.
  padAim(dt) {
    const inp = this.input, p = this.world?.player;
    if (inp.device !== 'pad' || !p?.alive || this.state !== 'play') return;
    const A = this.padAimAt || (this.padAimAt = { angle: p.angle, reach: PAD_AIM.near, idle: 0 });
    const r = inp.aimStick(), m = inp.move();
    if (r) {
      A.angle = Math.atan2(r.y, r.x);
      A.reach = lerp(PAD_AIM.near, PAD_AIM.far, r.mag);
      A.idle = 0;
    } else {
      A.idle += dt;
      if (m && A.idle > PAD_AIM.follow) A.angle += angDiff(A.angle, Math.atan2(m.y, m.x)) * Math.min(1, dt * 10);
    }
    // the LOCK concept's soft assist (systems/AimCue.js): a man close to the stick's way takes the aim
    const to = this.settings.aim === 'lock' ? assistAim(this.world, A.angle) : null;
    const at = this.camera.worldToScreen(to ? to.x : p.x + Math.cos(A.angle) * A.reach, to ? to.y : p.y + Math.sin(A.angle) * A.reach);
    inp.mouse.x = at.x;
    inp.mouse.y = at.y;
  }

  // read once per simulation step (key presses live until a step consumes them)
  debugKeys(inp, aim) {
    if (inp.hit('F2')) this.world.showVision = !this.world.showVision;
    if (inp.hit('F3')) this.overview = !this.overview;
    if (inp.hit('F4')) this.world.debugPhysics = !this.world.debugPhysics;
    this.sandbox.update(inp, aim, this.time);
    if (this.sandbox.cheats) this.ranked = false;
  }

  // ---------------- menu (title and pause) ----------------
  // keyboard: arrows / ZQSD move, Enter / Space activate, Escape / Backspace go back; gamepad: d-pad / left stick
  // move, A activates, B / START go back (data/controls.js); mouse: pointing selects (and moves the focus between
  // OPTIONS' things and the sheet beside them: Menu.point), a click activates, a slider is dragged (saved on
  // release), right click goes back. On the title's first page a click beside the items starts the game, as the
  // title always did (CONTINUE or NEW GAME). On OPTIONS, the things and their sheet: Menu.js `sheets`.
  updateMenu(inp) {
    const nav = this.menu, before = `${nav.top.id}:${nav.sel}`, acts = [];
    const { x, y } = inp.mouse, dx = x - this.lastMouse.x, moved = dx !== 0 || y !== this.lastMouse.y;
    this.lastMouse = { x, y };
    const rects = this.menuRects, at = rects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    const on = (r) => r.page ?? nav.top.id;   // the page a rect's item is on (the title's and the pause's: the top one)
    const key = (...codes) => codes.some((c) => inp.hit(c));
    // a gamepad's RB / RT play the left button: they do not click in a menu (A does)
    const click = inp.device !== 'pad' && inp.mouseHit(0);
    // on the pause's own page a confirm is a beat first (ui/Pause.js Pick): the line pressed, its action after
    const confirm = () => {
      if (this.state !== 'pause' || nav.depth > 0 || !selectable(nav.item)) return nav.activate();
      this.pick.press();
      Audio.play('ui', { pitch: 0.7 });
      return null;
    };
    if (this.grab === null && click && at?.track) {
      nav.point(on(at), at.i);
      if (nav.top.id === on(at) && nav.page.items[at.i]?.slider) this.grab = at.i;
    }
    if (this.grab !== null) {
      const r = rects.find((q) => q.i === this.grab && on(q) === nav.top.id), it = nav.page.items[this.grab];
      if (!r?.track || !it?.slider) this.grab = null;
      else if (inp.mouseDown(0)) this.setSetting(it.slider, Math.round(clamp((x - r.track.x) / r.track.w, 0, 1) * 100) / 100, false);
      else { saveSettings(this.settings); this.audible(it.slider); if (it.slider === 'rumble') this.rumble.sample(); this.grab = null; }
    } else {
      if (this.pointed(at, moved, dx)) nav.point(on(at), at.i);
      if (click) {
        if (at) nav.point(on(at), at.i);
        acts.push(at ? (nav.top.id === on(at) ? (this.state === 'pause' && nav.depth === 0 ? (nav.hover(at.i), confirm()) : nav.click(at.i)) : null) : this.state === 'title' ? nav.primary() : null);
      } else if (inp.device !== 'pad' && inp.mouseHit(2)) acts.push(nav.back());
      if (key('ArrowUp', 'KeyW', 'NavUp')) acts.push(nav.up());
      if (key('ArrowDown', 'KeyS', 'NavDown')) acts.push(nav.down());
      if (key('ArrowLeft', 'KeyA', 'NavLeft')) acts.push(nav.left());
      if (key('ArrowRight', 'KeyD', 'NavRight')) acts.push(nav.right());
      if (key('Enter', 'Space', 'NumpadEnter')) { acts.push(confirm()); if (inp.hit('PadA')) this.rumble.tick(); }
      if (key('Escape', 'Backspace', 'PadB')) acts.push(nav.back());
    }
    const done = acts.filter(Boolean), turned = `${nav.top.id}:${nav.sel}` !== before;
    for (const a of done) { if (this.applyMenu(a)) break; }
    if (done.some((a) => a.type === 'set' && a.key === 'rumble')) this.rumble.sample(); // felt at its new strength
    // a tick for every move and action, after it: a volume set is heard at its new level (the music speaks for itself)
    if (turned || done.some((a) => a.type !== 'set' || a.key !== 'music')) Audio.play('ui');
  }

  // Is the mouse on `at` to be taken as pointing at it this frame: when it moved onto it, but one of OPTIONS' things
  // crossed on the way right, to the sheet, takes the sheet over only once the mouse has stayed on it HOVER_DWELL s
  // (the sheet of the one he left stays to be reached).
  pointed(at, moved, dx) {
    if (!at) { this.dwell = null; return false; }
    const id = `${at.page}:${at.i}`;
    if (!at.thing) { this.dwell = null; return moved; }
    // (a thing that came under a mouse at rest is not pointed at until the mouse moves)
    if (this.dwell?.id !== id) { this.dwell = { id, t: this.time, wait: dx > 0, done: !moved }; if (!moved) return false; }
    const d = this.dwell;
    if (d.done) return moved;
    if (d.wait && this.time - d.t < HOVER_DWELL) return false;
    d.done = true;
    return true;
  }

  // a menu action (ui/Menu.js); true when it left the menu
  applyMenu(a) {
    switch (a.type) {
      case 'set': this.setSetting(a.key, a.value); return false;
      case 'reset': this.progress = resetProgress(); this.best = null; this.crossed = 0; return false;
      case 'newGame': this.startNewGame(); return true;
      case 'continue': this.continueGame(); return true;
      case 'start': this.startLevel(a.level); return true;
      case 'replayTutorial': this.startLevel('tutorial'); return true;
      case 'resume': this.resume(); return true;
      case 'restart': this.newGame(); return true;
      case 'quit': this.toTitle(); return true;
      default: return false;
    }
  }

  // a volume changed: heard at its new level (the music speaks for itself)
  audible(key) { if (key === 'master' || key === 'sfx') Audio.play('ui'); }

  // the camera's shot: the tutorial's staging, level 1's opening (systems/Opening.js), a boss's beat
  // (systems/BossStage.js), the gun taken off the car's seat (systems/Drive.js grab) or a throw's beat
  // (systems/ThrowBeat.js); null: the usual view
  stagedShot() {
    const w = this.world;
    return w.tutorial?.shot() ?? this.opening.shot() ?? w.bossStage.shot() ?? w.drive?.shot() ?? w.chaseCam?.shot() ?? w.throwBeat.shot();
  }

  // the kill cam's clock (systems/KillCam.js): never in a staged shot; the usual view, without its own zoom
  updateKillCam(dt) {
    const c = this.camera, kc = this.world.killCam, z = c.zoom * c.scale / kc.scale;
    kc.update(dt, { staged: this.state !== 'play' || !!this.stagedShot(), view: { x: c.x, y: c.y, hw: c.w / z / 2, hh: c.h / z / 2 } });
  }

  // The camera follows the world as it is drawn: between its last two steps (engine/Interp.js), the real places put
  // back at once
  updateCamera(dt) {
    if (!this.world) return;
    this.interp.apply(this.clock.alpha);
    try { this.aimCamera(dt); } finally { this.interp.restore(); }
  }

  aimCamera(dt) {
    const w = this.world, p = w.player;
    const aim = this.camera.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    const k = this.input.down('ShiftLeft') || this.input.down('ShiftRight') ? PLAYER.lookAheadFar : PLAYER.lookAhead;
    let ox = (aim.x - p.x) * k, oy = (aim.y - p.y) * k;
    const max = this.input.down('ShiftLeft') || this.input.down('ShiftRight') ? 260 : 110;
    const len = Math.hypot(ox, oy);
    if (len > max) { ox *= max / len; oy *= max / len; }
    // at the wheel (systems/Drive.js): the view is the drive's own, drawn 1:1 at a whole zoom and held on whole px
    // (no tilt, no turn, no lag: engine/Camera.js `pixel`), locked on the car; the cursor plays no part. In and out
    // of the car (the lab) the view changes in one cut
    const dr = w.drive?.on ? w.drive : null;
    if (dr) { ox = 0; oy = 0; }
    this.setView(dr ? dr.view : VIEW, !!dr);
    this.camera.sway = !dr;
    if (!p.alive || this.state !== 'play') { ox = 0; oy = 0; }
    // a staged level names the shot: its zoom on the camera, the view drawn toward what it looks at
    const D = this.direction, shot = this.stagedShot();
    D.set(shot?.name, shot?.at);
    D.update(dt, this.camera.zoom, this.camera.pixel); // (at the wheel a shot's zoom is a cut: Direction.update)
    // (a tutorial lesson's slow motion pushes in on him a little: systems/Tutorial.js push)
    this.camera.scale = D.zoom * (1 + (w.tutorial?.push() ?? 0));
    const kc = w.killCam; // its punch-in on top (1 at rest, and at the wheel), the view drawn toward the kill
    this.camera.scale *= kc.scale;
    const z = this.camera.zoom * this.camera.scale, frame = { x: p.x, y: p.y, hw: this.camera.w / z / 2, hh: this.camera.h / z / 2 };
    const fr = dr && dr.frame(this.camera.w / z, z);
    const seen = dr ? D.aim(fr.x, fr.y) : D.aim(p.x + ox * D.look, p.y + oy * D.look, frame);
    // (a shot of the chase that only looks `ahead`: never back along the road, he must see where he goes)
    if (dr && D.shot?.ahead) seen.x = Math.max(seen.x, fr.x);
    // (at the wheel the view is locked a whole number of picture px from the car as it is drawn: Drive.lock)
    const drawn = dr ? dr.lock(seen, z) : kc.aim(seen.x, seen.y, frame);
    let tx = drawn.x, ty = drawn.y;
    const o = this.state === 'outro' && w.outro;
    if (o) {
      // from the player over to the car's cab, a little ahead of it
      const cab = o.car.toWorld(w.doorX(o.car), o.car.h / 2), k = camBlend(o.t);
      tx += (cab.x + Math.cos(o.heading) * OUTRO.lead - tx) * k;
      ty += (cab.y + Math.sin(o.heading) * OUTRO.lead - ty) * k;
    }
    this.camera.update(dt, tx, ty);
    Audio.listener.x = this.camera.x;
    Audio.listener.y = this.camera.y;
  }

  // ---------------- render ----------------
  // The scene goes on the game's canvas. With the lens (render/PostGL.js) that canvas is only its source: the lens
  // puts it on screen, and what must stay sharp (flash, HUD, screens, cursor) is drawn on a canvas of its own above.
  // Without it everything lands on the game's canvas, graded in 2D, as before.
  // The world is drawn between its last two steps (engine/Interp.js): the in-between places are in its bodies for
  // the time of the draw only.
  render() {
    if (this.world) this.interp.apply(this.clock.alpha);
    try { this.paint(); } finally { this.interp.restore(); }
  }

  paint() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, t = this.time;
    const post = this.post?.ok && this.lensOn ? this.post : null, o = post ? post.octx : ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const inWorld = this.state !== 'loading' && this.state !== 'title' && !!this.world;
    if (inWorld) this.world.cues = cuesOn(this.state, !!this.world.tutorial?.scene); // render/Readability.js
    if (inWorld) this.aimTo(this.world);
    if (this.state === 'loading') drawLoading(ctx, W, H, this.loadP);
    else if (!inWorld) this.safeDraw(ctx, () => { this.titleRects = drawTitle(ctx, W, H, this.stateT, this.titleView()); });
    else if (this.state === 'cinematic') this.safeDraw(ctx, () => drawCinematic(ctx, W, H, this.stateT));
    else if (this.state === 'fall' && this.stateT >= FALLEN) this.safeDraw(ctx, () => drawLeap(ctx, W, H, this.stateT - FALLEN));
    else if (this.state === 'ending') this.safeDraw(ctx, () => drawEnding(ctx, W, H, this.ending, this.stateT));
    else this.drawScene(ctx, W, H, t, post);
    if (post) {
      const now = performance.now() / 1000, view = this.lensView(W, H, inWorld);
      this.lens.update(Math.min(0.1, now - (this.lensT ?? now)), view);
      this.lensT = now;
      post.render(this.lens.uniforms(view), t);
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, W, H);
      o.imageSmoothingEnabled = false;
    }
    if (inWorld) this.drawOver(o, W, H, t);
    else if (this.state === 'title') this.menuRects = this.titleRects || [];
    if (this.lensNote > t) {
      o.font = `${Math.round(14 * H / 720)}px monospace`;
      o.textAlign = 'left';
      o.fillStyle = '#3cff7a';
      o.fillText(`F6  LENS ${this.lensOn ? 'ON' : 'OFF'}`, 12, H - 14 * H / 720);
    }
    if (this.aimNote > t) {
      o.font = `${Math.round(14 * H / 720)}px monospace`;
      o.textAlign = 'left';
      o.fillStyle = '#3cff7a';
      o.fillText(`F7  AIM ${AIM.names[this.settings.aim]}`, 12, H - 32 * H / 720);
    }
    if (!['loading', 'outro', 'ending', 'cinematic', 'fall', 'continued'].includes(this.state)) this.drawCursor(o, t);
  }

  // the world (or the replay of the run behind the results), lit, before any lens
  drawScene(ctx, W, H, t, post) {
    this.replaying = this.state === 'results' && this.replay.ready;
    // backdrop outside the map; when the map fills the whole picture only its darkest tone, flat (cheaper than the
    // gradient: it only shows through the odd texel where the turned floor and walls both miss one)
    const covered = !this.replaying && !this.overview && this.mapCovers(W, H);
    ctx.fillStyle = covered ? BACKDROP_FLAT : this.backdrop(ctx, W, H, t);
    ctx.fillRect(0, 0, W, H);
    if (this.replaying) {
      this.safeDraw(ctx, () => this.replay.draw(ctx, W, H, t));
    } else if (this.overview) {
      // debug: whole level on screen
      const m = this.world.map;
      const z = Math.min(W / m.widthPx, H / m.heightPx);
      ctx.setTransform(z, 0, 0, z, (W - m.widthPx * z) / 2, (H - m.heightPx * z) / 2);
      this.world.draw(ctx, { x: m.widthPx / 2, y: m.heightPx / 2, viewRadius: () => ({ x: 1e5, y: 1e5 }) }, t);
    } else {
      this.camera.apply(ctx);
      this.safeDraw(ctx, () => this.world.draw(ctx, this.camera, t));
      if (this.murk > 0.001) {
        const at = this.camera.worldToScreen(this.world.player.x, this.world.player.y);
        this.safeDraw(ctx, () => drawMurk(ctx, W, H, at.x, at.y, this.murk));
      }
      if (!post) this.safeDraw(ctx, () => this.postfx.apply(ctx, W, H, this.camera.trauma));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const slow = POST.slowTint;
    if (this.timeScale < slow.below) {
      ctx.fillStyle = `rgba(${slow.color.join(',')},${(1 - this.timeScale) * slow.k})`;
      ctx.fillRect(0, 0, W, H);
    }
    // the replay keeps the bare picture: no lens, scanlines, flash or HUD (they go over it again when it plays)
    if (this.state === 'play' && !this.overview) this.recorder.capture(this.canvas, this.world.time);
    if (!post) ctx.drawImage(this.getVignette(W, H), 0, 0);
  }

  // does the map (its floor and walls) fill the whole picture the camera shows: then nothing of the backdrop shows
  mapCovers(W, H) {
    const c = this.camera, a = c.screenToWorld(0, 0), b = c.screenToWorld(W, 0), d = c.screenToWorld(0, H), e = c.screenToWorld(W, H);
    const m = 2; // world px: the camera's rounding to whole picture px
    return this.world.decals.covers(Math.min(a.x, b.x, d.x, e.x) - m, Math.min(a.y, b.y, d.y, e.y) - m,
      Math.max(a.x, b.x, d.x, e.x) + m, Math.max(a.y, b.y, d.y, e.y) + m);
  }

  // the backdrop's gradient; its middle drifts with t, held on steps of BACKDROP_STEP (made again only when it moves
  // a step, not every frame)
  backdrop(ctx, W, H, t) {
    const mid = Math.round((0.5 + Math.sin(t * 0.3) * 0.3) / BACKDROP_STEP) * BACKDROP_STEP, B = this.bg;
    if (B && B.W === W && B.H === H && B.mid === mid) return B.g;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#12061f');
    g.addColorStop(mid, '#2a0a3a');
    g.addColorStop(1, '#07030c');
    this.bg = { W, H, mid, g };
    return g;
  }

  // what goes over the picture and stays sharp
  drawOver(ctx, W, H, t) {
    if (this.flashA > 0) {
      ctx.globalAlpha = clamp(this.flashA, 0, 1);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // (not under the pause: its card says the run so far)
    if (this.state === 'play' || this.state === 'dead') this.safeDraw(ctx, () => drawHUD(ctx, this, t));
    if (this.sandbox.on && this.state === 'play') this.safeDraw(ctx, () => drawSandbox(ctx, H, this.sandbox, t));
    if (this.world.debugPhysics) {
      ctx.font = `${Math.round(12 * H / 720)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#3cff7a';
      this.world.renderer.debugStats().forEach((l, i) => ctx.fillText(l, 12, H - 80 * H / 720 + i * 16 * H / 720));
    }
    this.safeDraw(ctx, () => {
      if (this.state === 'intro') drawIntro(ctx, W, H, this.stateT, this.introCard());
      else if (this.state === 'play' && this.introOut != null && this.stateT < INTRO.out) drawIntro(ctx, W, H, this.introOut, this.introCard(), this.stateT);
      if (this.state === 'fall' && this.stateT < FALLEN) {
        ctx.globalAlpha = clamp((this.stateT - FALL.hold) / FALL.fade, 0, 1);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      if (this.state === 'dead') drawDead(ctx, W, H, this.stateT, this.deaths * 7, this.death, this.input.device);
      if (this.state === 'pause') this.menuRects = drawMenu(ctx, W, H, t, this.menu, { pick: this.pick, card: pauseCard(this.levelId, this.world.level, this.world), bare: ctx === this.ctx });
      if (this.state === 'results') drawResults(ctx, W, H, this.stateT, this.results, this.replaying, this.input.device);
      if (this.state === 'outro') drawOutro(ctx, W, H, this.world.outro);
      if (this.state === 'continued') drawContinued(ctx, W, H, finishView(this.stateT), this.world.level.chase.next, t);
      if (this.state === 'cinematic' || this.state === 'ending' || (this.state === 'fall' && this.stateT >= FALLEN)) drawHold(ctx, W, H, this.skip, this.input.device);
      if (this.state === 'play' && this.world?.drive?.drag?.on) drawHold(ctx, W, H, this.skip, this.input.device); // 2A's opening
    });
  }

  // the situation, as the lens wants it told (render/Lens.js)
  // (one object, and its parts, kept from frame to frame: the lens reads it at once and keeps nothing of it)
  lensView(W, H, inWorld) {
    const w = this.world, p = inWorld ? w.player : null, inp = this.input, v = p?.vaulting;
    const V = this.lensV ||= { toScreen: (x, y) => this.camera.worldToScreen(x, y), you: {}, ride: {}, heat: [], hot: [], none: [] };
    V.W = W; V.H = H; V.outH = this.post ? this.post.canvas.height : H; V.scale = this.camera.z;
    V.state = this.state; V.page = inWorld && this.onPage(); V.phase = inWorld ? w.director.phase : 'normal'; V.powerOn = inWorld ? w.power.on : true;
    V.timeScale = this.timeScale; V.trauma = inWorld ? this.camera.trauma : 0; V.combo = inWorld ? w.scoring.combo : 0;
    V.look = inp.down('ShiftLeft') || inp.down('ShiftRight');
    V.player = p ? V.you : null;
    if (p) {
      V.you.x = p.x; V.you.y = p.y; V.you.angle = v ? v.dir : p.slideAnim ? p.slideAnim.dir : p.angle;
      V.you.move = v?.rolling ? 'roll' : v?.kind === 'window' ? 'dive' : p.slideAnim ? 'slide' : null;
    }
    V.lights = inWorld && !this.overview ? w.lighting?.brightest || V.none : V.none;
    // at the wheel: his speed (share of flat out) and the way he goes, for what the speed does to the picture's edges
    const dr = inWorld && w.drive?.on && !this.overview ? w.drive : null, R = V.ride;
    V.drive = dr ? R : null;
    if (dr) { R.k = dr.v / CHASE.max; R.angle = Math.atan2(dr.u, Math.max(dr.v, 1)) * 0.5; R.x = dr.van.x; R.y = dr.van.y; }
    // (a close-up at the wheel, the grab, the cigarette: the car fills the picture, its ends would be in the speed's band)
    if (dr) R.close = this.camera.z > this.camera.zoom + 1;
    V.rot = this.camera.rot;
    // what heats the air: burning wrecks, pierced steam pipes (blasts are the lens' own business)
    const heat = V.heat, hot = V.hot;
    let n = 0;
    const fire = (x, y) => { const o = hot[n] || (hot[n] = { x: 0, y: 0, kind: 'fire' }); n++; o.x = x; o.y = y; heat.push(o); };
    heat.length = 0;
    if (inWorld) {
      for (const q of w.props) if (q.burning) fire(q.x, q.y);
      for (const f of w.fires.near(w.player.x, w.player.y, 3)) fire(f.x, f.y);
      heat.push(...w.smoke.heat(), ...w.gasValve.heat());
    }
    return V;
  }

  // a failing draw must never take the HUD / cursor / effects down with it: restore the context and report once
  safeDraw(ctx, fn) {
    ctx.save();
    try { fn(); } catch (e) {
      if (!this.drawErrorShown) { this.drawErrorShown = true; console.error('render error', e); }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  getVignette(W, H) {
    if (this.vignette) return this.vignette;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = Math.hypot(W, H) / 2;
    const grad = g.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
    grad.addColorStop(0, 'rgba(10,0,20,0)');
    grad.addColorStop(1, 'rgba(10,0,20,0.7)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // faint scanlines
    g.fillStyle = 'rgba(0,0,0,0.07)';
    const step = Math.max(2, Math.round(H / 360));
    for (let y = 0; y < H; y += step * 2) g.fillRect(0, y, W, step);
    this.vignette = c;
    return c;
  }

  drawCursor(ctx, t) {
    // with a gamepad: the virtual cursor while playing (padAim), none in the menus and screens
    if (this.input.device === 'pad' && !(this.state === 'play' && this.padAimAt)) return;
    const { x, y } = this.input.mouse;
    const s = this.canvas.height / 720;
    // at the wheel, out of his arc (systems/CarGun.js): a still grey cross, his gun cannot point there
    const gun = this.state === 'play' && this.world?.drive?.on ? this.world.drive.gun : null, off = gun?.aimed && !gun.aimed.ok;
    // any aim concept but the cross (data/aim.js): the cue is at the gun, in the world (render/AimArt.js); the mouse
    // keeps a small dot where it is, the gamepad's stick has no point to show
    if (this.state === 'play' && this.settings.aim !== 'cross') {
      if (this.input.device === 'pad') return;
      const r = Math.max(1, Math.round(AIM.dot.r * s)), e = Math.max(1, Math.round(AIM.dot.edge * s));
      ctx.fillStyle = AIM.ink;
      ctx.fillRect(Math.round(x) - r - e, Math.round(y) - r - e, (r + e) * 2, (r + e) * 2);
      ctx.fillStyle = off ? AIM.off : AIM.bone;
      ctx.fillRect(Math.round(x) - r, Math.round(y) - r, r * 2, r * 2);
      return;
    }
    const r = (off ? 8 : 9 + Math.sin(t * 8) * 1.5) * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(off ? Math.PI / 4 : t * 1.5);
    for (const [col, lw] of [[PALETTE.ink, 5 * s], [off ? '#8a8494' : neon(t, 4), 2.5 * s]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
