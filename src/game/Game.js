import { FIXED_DT } from './Config.js';
import { loadAssets, spriteBytes } from '../engine/Assets.js';
import Input from '../engine/Input.js';
import Camera, { VIEW } from '../engine/Camera.js';
import Interp, { StepClock } from '../engine/Interp.js';
import { PROF } from '../engine/Profiler.js';
import Audio from '../audio/Audio.js';
import Music from '../audio/Music.js';
import PostFX from './render/PostFX.js';
import { ReplayRecorder, ReplayPlayer } from './render/Replay.js';
import { loadSettings } from './systems/Settings.js';
import { loadProgress, loadCrossed } from './systems/Progress.js';
import { PAD_BINDINGS } from './data/controls.js';
import Rumble from './systems/Rumble.js';
import Menu from './ui/Menu.js';
import { Pick } from './ui/Pause.js';
import HoldSkip from './ui/cine/Hold.js';
import Sandbox from './debug/Sandbox.js';
import Lens from './render/Lens.js';
import { killcamOn } from './data/killcam.js';
import { createPost } from './render/PostGL.js';
import { devMode, devParam, DEV_KEYS } from './data/build.js';
import Perf from './systems/Perf.js';
import TimeScale from './systems/TimeScale.js';
import { bakedBytes } from './render/MapRenderer.js';
import { carFxBytes } from './render/CarFxArt.js';
import FrameRenderer from './render/FrameRenderer.js';
import LevelFlow, { has } from './flow/LevelFlow.js';
import SettingsController from './flow/SettingsController.js';
import MenuInput from './flow/MenuInput.js';
import CameraDirector from './flow/CameraDirector.js';
import { stateOf } from './flow/States.js';

// The composition root: the loop, the state machine's frame and the run's state, round the parts that do the work:
//   flow/States.js            the states, one table: what each does with a frame, what it draws, its flags
//   flow/LevelFlow.js         starting, retrying, ending and leaving a level; the results, the hit list, the title
//   flow/SettingsController   the settings put in force and kept, fullscreen
//   flow/MenuInput.js         the title's and the pause's input
//   flow/CameraDirector.js    where the camera looks (staged shots, the kill cam's punch-in, the pad's cursor)
//   systems/TimeScale.js      the world's clock: slow motion, a lesson's, the kill cam's and a chase beat's, hit-stop
//   render/FrameRenderer.js   the frame's picture, the lens' situation, the canvas' size, the cursor
// What the world, the HUD, the QA robot and tools/shot.mjs read (window.game) stays here: the verbs (startLevel,
// restart, retry, toTitle, setState, pause, resume, showResults, stagedShot, safeDraw...), the run's state (state,
// stateT, levelId, tutorialAt, chaseAt, taught, results...) and the clock's (timeScale, hitstop, slow).

// which keys do an action (data/controls.js ACTIONS), for a lesson that ends when he does it (systems/Tutorial.js
// pace; the pad's buttons come as these: Input.bindPad)
const DOES = {
  attack: (inp) => inp.mouseDown(0),
  throw: (inp) => inp.mouseDown(2),
  use: (inp) => inp.down('KeyE'),
  action: (inp) => inp.down('Space'),
  reload: (inp) => inp.down('KeyR'),
};

export default class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.input.bindPad(PAD_BINDINGS); // the gamepad plays the keys and buttons (data/controls.js)
    // the pad's rumble, felt from the world's events (systems/Rumble.js, data/rumble.js)
    this.rumble = new Rumble({ play: (fx, any) => this.input.rumble(fx, any), stop: () => this.input.stopRumble() });
    this.camera = new Camera();
    this.cameraDirector = new CameraDirector(this);
    this.flow = new LevelFlow(this);
    this.tempo = new TimeScale();      // the world's clock against the real one
    this.renderer = new FrameRenderer(this);
    this.menuInput = new MenuInput(this);
    this.skip = new HoldSkip();        // a comic page skipped by holding SPACE (ui/cine/Hold.js)
    this.taught = new Set();           // the lessons already given this run (systems/Tutorial.js)
    this.murk = 0;                     // 0..1: how far thick smoke has closed the view in (render/Murk.js)
    this.paged = false;                // a comic page was over the world last frame (advance)
    this.view = VIEW;                  // world px of height the picture shows (VIEW; at the wheel the drive's: fit)
    this.wheel = false;                // at the wheel (systems/Drive.js): the scene drawn 1:1 on whole px (fit)
    this.state = 'loading';
    this.stateT = 0;
    this.time = 0;
    this.world = null;
    this.clock = new StepClock(FIXED_DT); // the fixed step's accumulator (engine/Interp.js)
    this.interp = new Interp();        // the world drawn between its last two steps: smooth on a 120 / 144 Hz screen
    this.flashA = 0;
    this.flashColor = '#fff';
    this.clearedT = 0;
    this.deaths = 0;
    this.loadP = 0;
    this.dev = devMode();              // the developer's keys and switches (data/build.js: off in a release build)
    this.pausedFrom = null;            // { state, t } the pause was opened from (pause / resume)
    this.settings = loadSettings();
    this.progress = loadProgress(undefined, has);
    this.menu = new Menu('main', () => this.menuInput.context());
    this.pick = new Pick();            // the pause's chosen line: its tab's slide, a confirm's press (ui/Pause.js)
    this.crossed = loadCrossed();      // how many dead targets the hit list has shown crossed out (the X is drawn once)
    this.after = null;                 // the level that follows the hit list between two levels (null: the menu)
    this.postfx = new PostFX();        // 2D grading: only when the lens below cannot be had
    this.lens = new Lens();            // what the last pass of the picture does this frame
    this.post = createPost(canvas);    // that pass, on the graphics card (null: no WebGL, or ?post=0)
    if (this.post) this.post.onLost = () => this.resize(); // the card dropped it: the canvas back to the window's size
    this.lensOn = true;                // always, where it can be had; F6 (the developer's) flips it to compare
    this.lensNote = 0;                 // game time until which the F6 label stays up
    // the frame's numbers (F4's line, the QA robot) and F8's perf overlay (systems/Perf.js, ui/PerfOverlay.js); what
    // it cannot reach without the DOM is handed to it: the voices playing, the module-level caches' bytes
    this.perf = new Perf(this, {
      voices: () => (Audio.ctx ? Audio.active.filter((a) => a.end > Audio.ctx.currentTime).length : 0),
      music: () => Music.liveVoices,
      extra: () => ({ sprites: { cvs: spriteBytes().bytes }, 'retry cache': { cvs: bakedBytes() }, 'car clouds': { cvs: carFxBytes() } }),
    });
    this.steps = 0;                    // simulation steps run this frame
    // the kill cam (systems/KillCam.js), but for ?killcam=off (a developer's switch, to compare)
    this.killCamOn = killcamOn(devParam('killcam'));
    // the picture between two steps, but for ?interp=off (a developer's switch, to compare: drawn as stepped)
    this.smooth = devParam('interp') !== 'off';
    this.sandbox = new Sandbox(); // F1: spawn tools and cheats
    this.recorder = new ReplayRecorder();           // kill clips of the run, taken off the rendered frames
    this.replay = new ReplayPlayer(this.recorder);  // plays them behind the results
    this.prefs = new SettingsController(this);      // the settings put in force and kept, fullscreen
    this.prefs.listen();
    this.prefs.applyAll();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  async init() {
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    await loadAssets((p) => { this.loadP = p; });
    this.setState('title');
  }

  setState(s) {
    if (s !== 'play') this.introOut = null; // the level's card opens over play only (States intro: leaveIntro)
    if (s !== 'pause') this.pausedFrom = null;
    // into play from a menu, a card or a screen: the button that took him there is no shot or swing
    if (s === 'play' && this.state !== 'play') this.input.holdMouse();
    this.skip.reset();
    this.menuInput.reset();
    this.state = s; this.stateT = 0;
  }

  // ---------------- the clock (systems/TimeScale.js) ----------------
  get timeScale() { return this.tempo.scale; }
  set timeScale(v) { this.tempo.scale = v; }
  get hitstop() { return this.tempo.hitstop; }
  set hitstop(v) { this.tempo.hitstop = v; }
  get slow() { return this.tempo.slow; }
  set slow(v) { this.tempo.slow = v; }

  // ---------------- the level flow (flow/LevelFlow.js) ----------------
  startLevel(id, opts) { this.flow.startLevel(id, opts); }
  restart() { this.flow.restart(); }
  retry() { this.flow.retry(); }
  completeLevel(id) { this.flow.completeLevel(id); }
  showResults() { this.flow.showResults(); }
  endOutro() { this.flow.endOutro(); }
  toTitle() { this.flow.toTitle(); }

  // ---------------- hooks called by the world ----------------
  slowmo(scale, dur) { this.tempo.slowmo(scale, dur); }
  flash(color, a) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  onPlayerDeath(cause, killer) { this.flow.onPlayerDeath(cause, killer); }
  onCleared() { this.clearedT = 0; }
  onExit() { this.flow.onExit(); }

  // what the world does to the picture and the sound let go: the slow motion and its muffle, a flash, the smoke
  // closing in, the shake and the lens' kicks (a new level; a page coming up over the world, which then stands still
  // and would hold them as they were)
  clearScreen() {
    this.tempo.reset();
    this.flashA = 0;
    this.murk = 0;
    this.camera.settle();
    this.lens.reset();
    Audio.setMuffle(0);
  }

  // ESC / START (or the pad gone, the window left): the pause menu over the state it was opened from (play, or the
  // death screen: then RETRY in place of RESUME, ui/Menu.js)
  pause() {
    this.input.padLost = this.input.focusLost = false;
    if (this.state === 'play') this.world.player.interrupt?.();
    // (what it was opened from first: the pause's page reads it, RETRY or RESUME)
    this.pausedFrom = { state: this.state, t: this.stateT };
    this.menu.reset('pause');
    this.pick.reset();
    this.setState('pause');
  }
  // back to what the pause was opened from (the death screen where it was)
  resume() {
    const from = this.pausedFrom;
    this.setState(from?.state || 'play');
    if (from?.state === 'dead') this.stateT = from.t;
  }

  // ---------------- the camera and the picture ----------------
  stagedShot() { return this.cameraDirector.stagedShot(); }
  resize() { this.renderer.resize(); }
  setView(view, wheel) { this.renderer.setView(view, wheel); }
  render() { this.renderer.render(); }
  // a failing draw must never take the HUD / cursor / effects down with it (every draw goes through here: the QA
  // robot wraps it to hear every error)
  safeDraw(ctx, fn) { this.renderer.safeDraw(ctx, fn); }
  get vignette() { return this.renderer.vignette; }

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
    this.perf.tick(dt, real, t1 - t0, performance.now() - t1, this.steps); // (F4's line, F8's overlay)
    this.prefs.watchPace(real * 1000);
  }

  update(dt) {
    this.advance(dt);
    // the pad rumbles in play only (not paused, no menu, no page over the world), the pad in hand
    this.rumble.update(dt, !!this.world && !!stateOf(this).flags.rumble, this.input.device === 'pad');
  }

  // the frame's input, then the state's own frame (flow/States.js)
  advance(dt) {
    const inp = this.input;
    this.steps = 0;
    if (PROF.on) PROF.begin('input');
    inp.poll(dt);
    if (PROF.on) PROF.end('input');
    // the developer's keys do nothing in a release build (data/build.js)
    if (!this.dev) for (const k of DEV_KEYS) inp.pressed.delete(k);
    // the pad gone or the window left pause play only: told anywhere else, it is forgotten
    if (this.state !== 'play') inp.padLost = inp.focusLost = false;
    if (inp.anyPressed) {
      Audio.unlock().then(() => Music.start());
      this.prefs.gesture();
    }
    const S = stateOf(this);
    if (!S.update) return; // (loading)
    // a page comes up over the world: what the world was doing to the picture goes
    const page = !!this.world && !!S.flags.page;
    if (page && !this.paged) this.clearScreen();
    this.paged = page;
    // debug: the picture with / without the lens
    if (inp.hit('F6') && this.post) this.renderer.toggleLens();
    // debug: the perf overlay, OFF -> COMPACT -> FULL (systems/Perf.js); read per frame, so the press is taken at
    // once (a frame with no step would read it again)
    if (inp.hit('F8')) { inp.pressed.delete('F8'); this.perf.cycle(); }
    S.update(this, dt, inp);
  }

  // the tutorial's lessons (systems/Tutorial.js pace): the time scale they want, and whether a lesson's slow motion
  // sets it as it is (`beat`: its own ramp down and back, no easing of ours on it). Never a stop: the world goes on,
  // his hands are his all along
  teach(dt, inp) {
    // (the jump out of its window goes on being staged while he falls: state 'fall')
    const T = stateOf(this).flags.lessons ? this.world?.tutorial : null;
    if (!T) return { scale: 1, beat: false };
    if (T.leap) return { scale: T.pace(dt, () => false), beat: true };
    const beat = !!T.lesson, scale = T.pace(dt, (action) => !!DOES[action]?.(inp));
    return { scale, beat: beat || !!T.lesson };
  }

  // a comic page is skipped by holding SPACE (a pad's A: bound to it, data/controls.js), nothing else (ui/cine/Hold.js)
  holdSkip(dt) { return this.skip.update(dt, this.input.down('Space') || this.input.down('PadA')); }

  // debug: F2 shows what the guards see (in play, and from the pause)
  toggleVision(inp) { if (inp.hit('F2')) this.world.showVision = !this.world.showVision; }

  // read once per simulation step (key presses live until a step consumes them)
  debugKeys(inp, aim) {
    this.toggleVision(inp);
    if (inp.hit('F3')) this.overview = !this.overview;
    if (inp.hit('F4')) this.world.debugPhysics = !this.world.debugPhysics;
    this.sandbox.update(inp, aim, this.time);
    if (this.sandbox.cheats) this.ranked = false;
  }
}
