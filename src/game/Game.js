import { FIXED_DT, PLAYER, PALETTE, TILE, AI } from './Config.js';
import { loadAssets } from '../engine/Assets.js';
import { clamp, lerp } from '../engine/math.js';
import Input from '../engine/Input.js';
import Camera from '../engine/Camera.js';
import Audio from '../audio/Audio.js';
import Music from '../audio/Music.js';
import World from './world/World.js';
import Tension from './ai/Tension.js';
import PostFX from './render/PostFX.js';
import { ReplayRecorder, ReplayPlayer } from './render/Replay.js';
import { loadBest, saveBest } from './systems/Records.js';
import { levelScoring } from './data/scoring.js';
import LEVELS from './data/levels/index.js';
import { drawHUD } from './ui/HUD.js';
import { drawTitle, drawLoading, drawIntro, drawDead, drawPause, drawResults } from './ui/Screens.js';
import { drawSandbox } from './ui/SandboxPanel.js';
import Sandbox from './debug/Sandbox.js';
import { neon } from './ui/Text.js';

// Top-level loop and state machine: loading -> title -> intro -> play -> dead | results
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
    this.postfx = new PostFX();
    this.sandbox = new Sandbox(); // F1: spawn tools and cheats
    this.recorder = new ReplayRecorder();           // kill clips of the run, taken off the rendered frames
    this.replay = new ReplayPlayer(this.recorder);  // plays them behind the results
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.camera.resize(this.canvas.width, this.canvas.height);
    this.vignette = null;
  }

  async init() {
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    await loadAssets((p) => { this.loadP = p; });
    this.setState('title');
  }

  setState(s) { this.state = s; this.stateT = 0; }

  newGame() {
    // ?level=<id> picks a level (e.g. ?level=lab for the physics test room)
    const id = new URLSearchParams(location.search).get('level');
    this.levelId = LEVELS[id] ? id : 'level1';
    this.world = new World(this, LEVELS[this.levelId]);
    this.best = loadBest(this.levelId);
    this.ranked = true; // until the sandbox panel is opened
    this.replay.stop();
    this.recorder.reset();
    this.recorder.attach(this.world.events);
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
    this.sandbox.attach(this.world);
    this.setState('intro');
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
  onExit() {
    const w = this.world;
    const tally = w.scoring.tally(levelScoring(this.levelId, w.totalEnemies));
    // a run helped by the sandbox is shown but never kept as a record
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
    this.update(dt);
    this.render();
  }

  update(dt) {
    const inp = this.input;
    if (inp.anyPressed) Audio.unlock().then(() => { if (this.musicOn) Music.start(); });

    if (this.state === 'loading') return;
    if (this.state === 'title') {
      Music.setIntensity(0);
      if (inp.mouseHit(0) || inp.hit('Enter') || inp.hit('Space')) { Audio.play('ui'); this.newGame(); }
      inp.consume();
      return;
    }
    if (inp.hit('KeyM')) { this.musicOn = !this.musicOn; this.musicOn ? Music.start() : Music.stop(); }

    if (this.state === 'pause') {
      if (inp.hit('Escape')) this.setState('play');
      else if (inp.hit('KeyR')) this.newGame();
      else if (inp.hit('KeyQ')) this.toTitle();
      else if (inp.hit('F2')) this.world.showVision = !this.world.showVision;
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
    if (this.state === 'intro') {
      this.updateCamera(dt);
      if (this.stateT > 2.6 || (this.stateT > 0.3 && (inp.mouseHit(0) || inp.anyPressed))) { inp.consume(); this.setState('play'); }
      else inp.consume();
      return;
    }

    // play / dead: run the simulation (R reloads while alive, restarts once dead; Backspace restarts anytime)
    if (inp.hit('Backspace') || (this.state === 'dead' && inp.hit('KeyR'))) { this.newGame(); inp.consume(); return; }
    if (this.state === 'play' && inp.hit('Escape')) { this.setState('pause'); inp.consume(); return; }
    if (this.state === 'dead' && this.stateT > 0.8 && inp.mouseHit(0)) { this.newGame(); inp.consume(); return; }

    // time scale (slow motion)
    let target = this.sandbox.timeScale;
    if (this.slow) {
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
        this.debugKeys(inp, aim);
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
  }

  // read once per simulation step (key presses live until a step consumes them)
  debugKeys(inp, aim) {
    if (inp.hit('F2')) this.world.showVision = !this.world.showVision;
    if (inp.hit('F3')) this.overview = !this.overview;
    if (inp.hit('F4')) this.world.debugPhysics = !this.world.debugPhysics;
    this.sandbox.update(inp, aim, this.time);
    if (this.sandbox.on) this.ranked = false;
  }

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
    this.camera.update(dt, p.x + ox, p.y + oy);
    Audio.listener.x = this.camera.x;
    Audio.listener.y = this.camera.y;
  }

  // ---------------- render ----------------
  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, t = this.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (this.state === 'loading') { drawLoading(ctx, W, H, this.loadP); return; }
    if (this.state === 'title' || !this.world) { drawTitle(ctx, W, H, t); this.drawCursor(ctx, t); return; }

    // backdrop outside the map
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#12061f');
    bg.addColorStop(0.5 + Math.sin(t * 0.3) * 0.3, '#2a0a3a');
    bg.addColorStop(1, '#07030c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const replaying = this.state === 'results' && this.replay.ready;
    if (replaying) {
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
      this.safeDraw(ctx, () => this.postfx.apply(ctx, W, H, this.camera.trauma));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // post
    if (this.timeScale < 0.95) {
      ctx.fillStyle = `rgba(80,0,120,${(1 - this.timeScale) * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
    // the replay keeps the bare picture: no scanlines, flash or HUD (they go over it again when it plays)
    if (this.state === 'play' && !this.overview) this.recorder.capture(this.canvas, this.world.time);
    ctx.drawImage(this.getVignette(W, H), 0, 0);
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
      this.world.renderer.debugStats().forEach((l, i) => ctx.fillText(l, 12, H - 60 * H / 720 + i * 16 * H / 720));
    }
    this.safeDraw(ctx, () => {
      if (this.state === 'intro') drawIntro(ctx, W, H, this.stateT, this.world.level, this.best);
      if (this.state === 'dead') drawDead(ctx, W, H, this.stateT, this.deaths * 7, this.deathCause);
      if (this.state === 'pause') drawPause(ctx, W, H, t);
      if (this.state === 'results') drawResults(ctx, W, H, this.stateT, this.results, replaying);
    });
    this.drawCursor(ctx, t);
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
