import { FIXED_DT, PLAYER, PALETTE, TILE, AI } from './Config.js';
import { loadAssets } from '../engine/Assets.js';
import { clamp, lerp } from '../engine/math.js';
import Input from '../engine/Input.js';
import Camera, { VIEW } from '../engine/Camera.js';
import Audio from '../audio/Audio.js';
import Music from '../audio/Music.js';
import World from './world/World.js';
import Tension from './ai/Tension.js';
import PostFX from './render/PostFX.js';
import { ReplayRecorder, ReplayPlayer } from './render/Replay.js';
import { loadBest, saveBest } from './systems/Records.js';
import { loadSettings, saveSettings } from './systems/Settings.js';
import { CAMPAIGN, loadProgress, saveProgress, complete, latest, resetProgress, nextLevel } from './systems/Progress.js';
import { levelScoring } from './data/scoring.js';
import LEVELS from './data/levels/index.js';
import { drawHUD } from './ui/HUD.js';
import { drawLoading, drawIntro, drawDead, drawResults, drawOutro } from './ui/Screens.js';
import Menu from './ui/Menu.js';
import { drawMenu } from './ui/MenuArt.js';
import { CINE, cineView, cineBeats, drawCinematic, drawTitleView } from './ui/Cinematic.js';
import { OUTRO, camBlend, outroOver } from './systems/Outro.js';
import { drawSandbox } from './ui/SandboxPanel.js';
import Sandbox from './debug/Sandbox.js';
import { neon } from './ui/Text.js';
import Lens from './render/Lens.js';
import { createPost } from './render/PostGL.js';

// Top-level loop and state machine: loading -> title -> [cinematic ->] intro -> play -> dead | [outro ->] results,
// play <-> pause; the tutorial ends play -> fall -> the next level's intro
// (the title and the pause are the menu: ui/Menu.js for its pages, ui/MenuArt.js for its picture)
const VOLUMES = ['master', 'music', 'sfx'];
// ?level=<id>: the level NEW GAME / CONTINUE start, for the developers (e.g. ?level=lab, the physics test room)
const urlLevel = () => { const id = new URLSearchParams(location.search).get('level'); return LEVELS[id] ? id : null; };
const has = (id) => !!LEVELS[id];
// out of the tutorial's window (state 'fall'): s to black, s at which he hits the ground, s at which the next level starts
const FALL = { fade: 0.9, thud: 1.15, end: 2.0, slow: 0.3 };
// what the intro banner calls a level
const levelLabel = (id) => (id === 'tutorial' ? 'PROLOGUE' : CAMPAIGN.includes(id) ? `LEVEL ${CAMPAIGN.filter((l) => l !== 'tutorial').indexOf(id) + 1}` : 'TEST LEVEL');

export default class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.camera = new Camera();
    this.state = 'loading';
    this.stateT = 0;
    this.time = 0;
    this.world = null;
    this.acc = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.slow = null;
    this.flashA = 0;
    this.flashColor = '#fff';
    this.clearedT = 0;
    this.deaths = 0;
    this.loadP = 0;
    this.musicOn = true;
    this.settings = loadSettings();
    this.progress = loadProgress();
    this.menu = new Menu('main', () => this.menuContext());
    this.menuRects = [];               // where the menu's items were drawn last frame (MenuArt), for the mouse
    this.grab = null;                  // index of the slider held by the mouse
    this.lastMouse = { x: 0, y: 0 };
    this.postfx = new PostFX();        // 2D grading: only when the lens below cannot be had
    this.lens = new Lens();            // what the last pass of the picture does this frame
    this.post = createPost(canvas);    // that pass, on the graphics card (null: no WebGL, or ?post=0)
    this.lensOn = true;                // the VIDEO option; F6 flips it for the session, to compare
    this.lensNote = 0;                 // game time until which the F6 label stays up
    this.sandbox = new Sandbox(); // F1: spawn tools and cheats
    this.recorder = new ReplayRecorder();           // kill clips of the run, taken off the rendered frames
    this.replay = new ReplayPlayer(this.recorder);  // plays them behind the results
    // the fullscreen toggle tells the truth: whoever left it (Esc, the browser), the setting follows
    this.wantFull = this.settings.fullscreen; // asked last session: taken again at the first key or click
    this.settings.fullscreen = !!document.fullscreenElement;
    document.addEventListener('fullscreenchange', () => {
      this.settings.fullscreen = !!document.fullscreenElement;
      saveSettings(this.settings);
    });
    for (const k of [...VOLUMES, 'lens', 'shake']) this.applySetting(k);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1, w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
    // With the lens, the scene is drawn at a whole zoom (crisp pixels) on a canvas a little larger than the window and
    // the lens brings it down to it: the view is VIEW world px high whatever the window's size. Without the lens the
    // canvas is the window and the zoom the nearest whole one.
    const ss = this.post?.ok ? (VIEW * Math.max(1, Math.ceil(h / VIEW))) / h : 1;
    this.canvas.width = Math.round(w * ss);
    this.canvas.height = Math.round(h * ss);
    this.camera.resize(this.canvas.width, this.canvas.height);
    this.post?.resize(w, h);
    this.vignette = null;
  }

  async init() {
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    await loadAssets((p) => { this.loadP = p; });
    this.setState('title');
  }

  setState(s) { this.state = s; this.stateT = 0; this.grab = null; this.menuRects = []; }

  // ---------------- settings ----------------
  // what a setting does once changed (the value is already in this.settings; fullscreen goes by setFullscreen)
  applySetting(key) {
    const v = this.settings[key];
    if (VOLUMES.includes(key)) Audio.setVolume(key, v);
    else if (key === 'lens') { this.lensOn = v; this.post?.show(v); }
    else if (key === 'shake') this.camera.shakeScale = v;
  }

  // save: false while a slider is dragged (saved on release)
  setSetting(key, value, save = true) {
    if (key === 'fullscreen') { this.setFullscreen(value); return; } // the setting follows fullscreenchange
    if (this.settings[key] === value) return;
    this.settings[key] = value;
    this.applySetting(key);
    if (save) saveSettings(this.settings);
  }

  // must run within a key press or a click (the browser's rule): update() is called on the frame after one
  setFullscreen(on) {
    try {
      const d = document, p = on ? d.documentElement.requestFullscreen?.() : d.fullscreenElement && d.exitFullscreen?.();
      p?.catch?.(() => {});
    } catch { /* refused: the toggle keeps showing the truth */ }
  }

  // ---------------- progression ----------------
  // the campaign levels there are, in order, for the menu
  campaign() { return CAMPAIGN.filter(has).map((id) => ({ id, name: LEVELS[id].name || id.toUpperCase() })); }
  firstLevel() { return this.campaign()[0]?.id || Object.keys(LEVELS)[0]; }

  menuContext() {
    return { settings: this.settings, progress: this.progress, best: (id) => loadBest(id), levels: this.campaign(), lensOk: !!this.post?.ok };
  }

  // a level finished: marked done, the next one opened (the tutorial calls it too)
  completeLevel(id) {
    this.progress = complete(this.progress, id);
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
    if (!retry) this.tutorialAt = null;
    this.world = new World(this, LEVELS[this.levelId]);
    // he gets up off the ground the first time only: a retry starts on his feet, at once
    if (this.seen === this.levelId) { this.world.player.sit = 0; this.world.player.swig = null; }
    this.seen = this.levelId;
    this.best = loadBest(this.levelId);
    this.ranked = true; // until the sandbox panel is opened
    this.replay.stop();
    this.recorder.reset();
    this.recorder.attach(this.world.events);
    this.lens.bind(this.world.events);
    const p = this.world.player;
    this.camera.bounds = { w: this.world.map.w * TILE, h: this.world.map.h * TILE };
    this.camera.snap(p.x, p.y);
    this.acc = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.slow = null;
    this.flashA = 0;
    this.clearedT = 0;
    Audio.setMuffle(0);
    // the soundtrack: calm until the squad wakes up or blood is shed (Tension, fed every frame in update), its
    // combat variant while the squad fights
    const ev = this.world.events;
    this.tension = new Tension();
    ev.on('shot', () => this.tension.bump('shot'));
    ev.on('kill', ({ victim }) => { if (!victim.isPlayer) this.tension.bump('kill'); });
    ev.on('explosion', () => this.tension.bump('blast'));
    ev.on('alertPhase', ({ phase }) => Music.setCombat(AI.combatMusic.includes(phase)));
    Music.setCombat(false);
    Music.setCombo(0);
    Music.setIntensity(this.tension.level('normal'));
    ev.on('tutorialEnd', () => this.onTutorialEnd());
    this.sandbox.attach(this.world);
    this.cineT = 0;
    this.setState(state);
  }

  // out of the tutorial by the window: he falls (slow motion, the picture going black), hits the ground, and the
  // next level opens on him waking
  onTutorialEnd() {
    this.slowmo(FALL.slow, FALL.end);
    Audio.play('gust', { vol: 0.8 });
    this.setState('fall');
  }

  // ---------------- hooks called by the world ----------------
  slowmo(scale, dur) { this.slow = { scale, t: dur }; }
  flash(color, a) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  onPlayerDeath(cause) {
    this.deaths++;
    this.deathCause = cause;
    this.setState('dead');
    this.slowmo(0.18, 1.6);
    this.camera.shake(0.8);
    this.flash('#ff2040', 0.5);
    Audio.play('death');
  }
  onCleared() { this.clearedT = 0; }
  // the player stepped into the exit zone: he leaves in the getaway van when there is one (systems/Outro), on foot
  // straight to the results otherwise
  onExit() {
    const van = this.world.getaway();
    if (!van) { this.showResults(); return; }
    this.world.startOutro(van);
    this.slow = null;
    this.timeScale = 1;
    this.hitstop = 0;
    this.setState('outro');
  }
  showResults() {
    const w = this.world;
    const tally = w.scoring.tally(levelScoring(this.levelId, w.totalEnemies));
    // a run helped by the sandbox is shown but never kept as a record
    this.completeLevel(this.levelId);
    const kept = this.ranked ? saveBest(this.levelId, { total: tally.total, grade: tally.grade, time: w.time }) : { prev: this.best, record: false };
    this.results = { ...tally, best: kept.prev, record: kept.record, ranked: this.ranked };
    this.replay.start();
    Audio.play('clear');
    this.setState('results');
  }
  toTitle() {
    this.world = null;
    this.replay.stop();
    this.recorder.release();
    this.menu.reset('main');
    this.setState('title');
  }

  // ---------------- loop ----------------
  loop(ts) {
    requestAnimationFrame(this.loop);
    const now = ts / 1000;
    const dt = Math.min(0.1, this.last ? now - this.last : 0);
    this.last = now;
    this.time += dt;
    this.stateT += dt;
    const t0 = performance.now();
    this.update(dt);
    const t1 = performance.now();
    this.render();
    this.sample(dt, t1 - t0, performance.now() - t1);
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
    const inp = this.input;
    if (inp.anyPressed) {
      Audio.unlock().then(() => { if (this.musicOn) Music.start(); });
      if (this.wantFull) { this.wantFull = false; this.setFullscreen(true); }
    }

    if (this.state === 'loading') return;
    // debug: the picture with / without the lens
    if (inp.hit('F6') && this.post) {
      this.lensOn = !this.lensOn;
      this.post.show(this.lensOn);
      this.lensNote = this.time + 1.6;
    }
    if (this.state === 'title') {
      Music.setIntensity(0);
      this.updateMenu(inp);
      inp.consume();
      return;
    }
    if (inp.hit('KeyM')) { this.musicOn = !this.musicOn; this.musicOn ? Music.start() : Music.stop(); }

    if (this.state === 'pause') {
      if (inp.hit('KeyR')) this.newGame();
      else if (inp.hit('KeyQ')) this.toTitle();
      else {
        if (inp.hit('F2')) this.world.showVision = !this.world.showVision;
        this.updateMenu(inp);
      }
      inp.consume();
      return;
    }
    if (this.state === 'results') {
      this.updateCamera(dt);
      this.replay.update(dt);
      if (inp.hit('KeyR')) this.newGame();
      else if (this.stateT > 1 && (inp.mouseHit(0) || inp.hit('Enter'))) this.toTitle();
      inp.consume();
      return;
    }
    if (this.state === 'cinematic') {
      // the opening plays by itself; a key or a click goes straight to the game
      Music.setIntensity(0);
      for (const b of cineBeats(this.cineT, this.stateT)) Audio.play(b.name, { vol: b.vol, ...b.opts });
      this.cineT = this.stateT;
      const skip = this.stateT > CINE.skipAfter && (inp.pressed.size > 0 || inp.mouseHit(0));
      inp.consume();
      this.updateCamera(dt);
      if (skip || cineView(this.stateT).over) this.setState('play');
      return;
    }
    if (this.state === 'intro') {
      this.updateCamera(dt);
      if (this.stateT > 2.6 || (this.stateT > 0.3 && (inp.mouseHit(0) || inp.anyPressed))) { inp.consume(); this.setState('play'); }
      else inp.consume();
      return;
    }

    // play / dead / outro: run the simulation (R reloads while alive, restarts once dead; Backspace restarts anytime)
    if (inp.hit('Backspace') || (this.state === 'dead' && inp.hit('KeyR'))) { this.newGame(); inp.consume(); return; }
    if (this.state === 'fall') {
      if (this.stateT - dt < FALL.thud && this.stateT >= FALL.thud) { Audio.play('bodyFall', { vol: 1 }); this.camera.shake(0.5); }
      if (this.stateT >= FALL.end) {
        const done = this.levelId;
        this.completeLevel(done);
        this.startLevel(nextLevel(done) || this.firstLevel());
        inp.consume();
        return;
      }
    }
    const outro = this.state === 'outro' || this.state === 'fall'; // the world plays on by itself
    if (this.state === 'outro') {
      // the world plays on by itself: no input reaches it; a fresh key press or a click skips to the results
      const skip = this.stateT > OUTRO.skipAfter && (inp.pressed.size > 0 || inp.mouseHit(0));
      inp.consume();
      if (skip || this.world.outro.van.exploded) { this.showResults(); return; }
    }
    if (this.state === 'play' && inp.hit('Escape')) { this.menu.reset('pause'); this.setState('pause'); inp.consume(); return; }
    if (this.state === 'dead' && this.stateT > 0.8 && inp.mouseHit(0)) { this.newGame(); inp.consume(); return; }

    // time scale (slow motion)
    let target = this.state === 'outro' ? 1 : this.sandbox.timeScale;
    if (this.slow && this.state !== 'outro') {
      target = Math.min(target, this.slow.scale);
      this.slow.t -= dt;
      if (this.slow.t <= 0) this.slow = null;
    }
    this.timeScale = lerp(this.timeScale, target, 1 - Math.pow(0.001, dt));
    Audio.setMuffle(this.state === 'dead' ? 0.75 : (1 - this.timeScale) * 0.7);
    if (this.world.cleared) this.clearedT += dt;
    this.tension.update(dt);
    Music.setIntensity(this.tension.level(this.world.director.phase));
    Music.setCombo(this.world.scoring.combo);

    if (this.hitstop > 0) {
      this.hitstop -= dt;
    } else {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        const aim = this.camera.screenToWorld(inp.mouse.x, inp.mouse.y);
        if (!outro) this.debugKeys(inp, aim);
        this.world.step(FIXED_DT * this.timeScale, inp, aim);
        this.acc -= FIXED_DT;
        steps++;
        inp.consume();
        if (this.hitstop > 0) break;
      }
      if (steps >= 5) this.acc = 0;
    }
    this.updateCamera(dt);
    this.flashA = Math.max(0, this.flashA - dt * 3);
    if (this.state === 'outro' && outroOver(this.world.outro)) this.showResults();
  }

  // read once per simulation step (key presses live until a step consumes them)
  debugKeys(inp, aim) {
    if (inp.hit('F2')) this.world.showVision = !this.world.showVision;
    if (inp.hit('F3')) this.overview = !this.overview;
    if (inp.hit('F4')) this.world.debugPhysics = !this.world.debugPhysics;
    this.sandbox.update(inp, aim, this.time);
    if (this.sandbox.on) this.ranked = false;
  }

  // ---------------- menu (title and pause) ----------------
  // keyboard: arrows / ZQSD move, Enter / Space activate, Escape / Backspace go back; mouse: hover selects, a click
  // activates, a slider is dragged (saved on release), right click goes back. On the title's first page a click
  // beside the items starts the game, as the title always did (CONTINUE or NEW GAME).
  updateMenu(inp) {
    const nav = this.menu, before = `${nav.top.id}:${nav.sel}`, acts = [];
    const { x, y } = inp.mouse, moved = x !== this.lastMouse.x || y !== this.lastMouse.y;
    this.lastMouse = { x, y };
    const rects = this.menuRects, at = rects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    const key = (...codes) => codes.some((c) => inp.hit(c));
    if (this.grab === null && inp.mouseHit(0) && at?.track && nav.page.items[at.i]?.slider) { nav.hover(at.i); this.grab = at.i; }
    if (this.grab !== null) {
      const r = rects.find((q) => q.i === this.grab), it = nav.page.items[this.grab];
      if (!r?.track || !it?.slider) this.grab = null;
      else if (inp.mouseDown(0)) this.setSetting(it.slider, Math.round(clamp((x - r.track.x) / r.track.w, 0, 1) * 100) / 100, false);
      else { saveSettings(this.settings); this.audible(it.slider); this.grab = null; }
    } else {
      if (at && moved) nav.hover(at.i);
      if (inp.mouseHit(0)) acts.push(at ? nav.click(at.i) : this.state === 'title' ? nav.primary() : null);
      else if (inp.mouseHit(2)) acts.push(nav.back());
      if (key('ArrowUp', 'KeyW')) acts.push(nav.up());
      if (key('ArrowDown', 'KeyS')) acts.push(nav.down());
      if (key('ArrowLeft', 'KeyA')) acts.push(nav.left());
      if (key('ArrowRight', 'KeyD')) acts.push(nav.right());
      if (key('Enter', 'Space', 'NumpadEnter')) acts.push(nav.activate());
      if (key('Escape', 'Backspace')) acts.push(nav.back());
    }
    const done = acts.filter(Boolean), turned = `${nav.top.id}:${nav.sel}` !== before;
    for (const a of done) { if (this.applyMenu(a)) break; }
    // a tick for every move and action, after it: a volume set is heard at its new level (the music speaks for itself)
    if (turned || done.some((a) => a.type !== 'set' || a.key !== 'music')) Audio.play('ui');
  }

  // a menu action (ui/Menu.js); true when it left the menu
  applyMenu(a) {
    switch (a.type) {
      case 'set': this.setSetting(a.key, a.value); return false;
      case 'reset': this.progress = resetProgress(); this.best = null; return false;
      case 'newGame': this.startNewGame(); return true;
      case 'continue': this.continueGame(); return true;
      case 'start': this.startLevel(a.level); return true;
      case 'replayTutorial': this.startLevel('tutorial'); return true;
      case 'resume': this.setState('play'); return true;
      case 'restart': this.newGame(); return true;
      case 'quit': this.toTitle(); return true;
      default: return false;
    }
  }

  // a volume changed: heard at its new level (the music speaks for itself)
  audible(key) { if (key === 'master' || key === 'sfx') Audio.play('ui'); }

  updateCamera(dt) {
    const w = this.world;
    if (!w) return;
    const p = w.player;
    const aim = this.camera.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    const k = this.input.down('ShiftLeft') || this.input.down('ShiftRight') ? PLAYER.lookAheadFar : PLAYER.lookAhead;
    let ox = (aim.x - p.x) * k, oy = (aim.y - p.y) * k;
    const max = this.input.down('ShiftLeft') ? 260 : 110;
    const len = Math.hypot(ox, oy);
    if (len > max) { ox *= max / len; oy *= max / len; }
    if (!p.alive || this.state !== 'play') { ox = 0; oy = 0; }
    let tx = p.x + ox, ty = p.y + oy;
    const o = this.state === 'outro' && w.outro;
    if (o) {
      // from the player over to the van's cab, a little ahead of it
      const cab = o.van.toWorld(OUTRO.door, o.van.h / 2), k = camBlend(o.t);
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
  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, t = this.time;
    const post = this.post?.ok && this.lensOn ? this.post : null, o = post ? post.octx : ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const inWorld = this.state !== 'loading' && this.state !== 'title' && !!this.world;
    if (this.state === 'loading') drawLoading(ctx, W, H, this.loadP);
    else if (!inWorld) drawTitleView(ctx, W, H, t, this.input.mouse);
    else if (this.state === 'cinematic') this.safeDraw(ctx, () => this.drawCine(ctx, W, H, t, post));
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
    else if (this.state === 'title') this.safeDraw(o, () => { this.menuRects = drawMenu(o, W, H, t, this.menu, 'title'); });
    if (this.lensNote > t) {
      o.font = `${Math.round(14 * H / 720)}px monospace`;
      o.textAlign = 'left';
      o.fillStyle = '#3cff7a';
      o.fillText(`F6  LENS ${this.lensOn ? 'ON' : 'OFF'}`, 12, H - 14 * H / 720);
    }
    if (!['loading', 'outro', 'cinematic', 'fall'].includes(this.state)) this.drawCursor(o, t);
  }

  // the opening (ui/Cinematic.js): from the title's window into his room, the night's story, then the level seen
  // from above, painted on a scratch canvas
  drawCine(ctx, W, H, t, post) {
    if (!this.cineBuf || this.cineBuf.c.width !== W || this.cineBuf.c.height !== H) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      this.cineBuf = { c, g: c.getContext('2d') };
    }
    const world = (g, w, h) => { g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; this.drawScene(g, w, h, t, post); };
    drawCinematic(ctx, W, H, this.stateT, world, this.cineBuf);
  }

  // the world (or the replay of the run behind the results), lit, before any lens
  drawScene(ctx, W, H, t, post) {
    // backdrop outside the map
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#12061f');
    bg.addColorStop(0.5 + Math.sin(t * 0.3) * 0.3, '#2a0a3a');
    bg.addColorStop(1, '#07030c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    this.replaying = this.state === 'results' && this.replay.ready;
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
      if (!post) this.safeDraw(ctx, () => this.postfx.apply(ctx, W, H, this.camera.trauma));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.timeScale < 0.95) {
      ctx.fillStyle = `rgba(80,0,120,${(1 - this.timeScale) * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
    // the replay keeps the bare picture: no lens, scanlines, flash or HUD (they go over it again when it plays)
    if (this.state === 'play' && !this.overview) this.recorder.capture(this.canvas, this.world.time);
    if (!post) ctx.drawImage(this.getVignette(W, H), 0, 0);
  }

  // what goes over the picture and stays sharp
  drawOver(ctx, W, H, t) {
    if (this.flashA > 0) {
      ctx.globalAlpha = clamp(this.flashA, 0, 1);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.state === 'play' || this.state === 'dead' || this.state === 'pause') this.safeDraw(ctx, () => drawHUD(ctx, this, t));
    if (this.sandbox.on && this.state === 'play') this.safeDraw(ctx, () => drawSandbox(ctx, H, this.sandbox, t));
    if (this.world.debugPhysics) {
      ctx.font = `${Math.round(12 * H / 720)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#3cff7a';
      this.world.renderer.debugStats().forEach((l, i) => ctx.fillText(l, 12, H - 80 * H / 720 + i * 16 * H / 720));
    }
    this.safeDraw(ctx, () => {
      if (this.state === 'intro') drawIntro(ctx, W, H, this.stateT, this.world.level, this.best, levelLabel(this.levelId));
      if (this.state === 'fall') {
        ctx.globalAlpha = clamp(this.stateT / FALL.fade, 0, 1);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      if (this.state === 'dead') drawDead(ctx, W, H, this.stateT, this.deaths * 7, this.deathCause);
      if (this.state === 'pause') this.menuRects = drawMenu(ctx, W, H, t, this.menu, 'pause');
      if (this.state === 'results') drawResults(ctx, W, H, this.stateT, this.results, this.replaying);
      if (this.state === 'outro') drawOutro(ctx, W, H, this.world.outro);
    });
  }

  // the situation, as the lens wants it told (render/Lens.js)
  lensView(W, H, inWorld) {
    const w = this.world, p = inWorld ? w.player : null, inp = this.input, v = p?.vaulting;
    return {
      W, H, outH: this.post ? this.post.canvas.height : H, scale: this.camera.z, toScreen: (x, y) => this.camera.worldToScreen(x, y),
      state: this.state, phase: inWorld ? w.director.phase : 'normal', powerOn: inWorld ? w.power.on : true,
      timeScale: this.timeScale, trauma: inWorld ? this.camera.trauma : 0, combo: inWorld ? w.scoring.combo : 0, look: inp.down('ShiftLeft') || inp.down('ShiftRight'),
      player: p && {
        x: p.x, y: p.y, angle: v ? v.dir : p.slideAnim ? p.slideAnim.dir : p.angle,
        move: v?.rolling ? 'roll' : v?.kind === 'window' ? 'dive' : p.slideAnim ? 'slide' : null,
      },
      // what heats the air: burning wrecks, pierced steam pipes (blasts are the lens' own business)
      heat: inWorld ? [...w.props.filter((q) => q.burning).map((q) => ({ x: q.x, y: q.y, kind: 'fire' })),
        ...w.steam.leaks.map((l) => ({ x: l.x, y: l.y, kind: 'steam' }))] : [],
      lights: inWorld && !this.overview ? w.lighting?.brightest || [] : [],
    };
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
    const { x, y } = this.input.mouse;
    const s = this.canvas.height / 720;
    const r = (9 + Math.sin(t * 8) * 1.5) * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 1.5);
    for (const [col, lw] of [[PALETTE.ink, 5 * s], [neon(t, 4), 2.5 * s]]) {
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
