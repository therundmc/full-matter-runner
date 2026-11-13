import { FIXED_DT, PLAYER, PALETTE } from './Config.js';
import { loadAssets } from './Assets.js';
import { clamp, lerp } from './math.js';
import Input from './Input.js';
import Camera from './Camera.js';
import Audio from './Audio.js';
import Music from './Music.js';
import World from '../world/World.js';
import level1 from '../data/levels/level1.js';
import { drawHUD } from '../ui/HUD.js';
import { drawTitle, drawLoading, drawIntro, drawDead, drawPause, drawResults } from '../ui/Screens.js';
import { neon } from '../ui/Text.js';

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
    this.world = new World(this, level1);
    const p = this.world.player;
    this.camera.snap(p.x, p.y);
    this.acc = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.slow = null;
    this.flashA = 0;
    this.clearedT = 0;
    Audio.setMuffle(0);
    Music.setIntensity(1);
    this.setState('intro');
  }

  // ---------------- hooks called by the world ----------------
  slowmo(scale, dur) { this.slow = { scale, t: dur }; }
  flash(color, a) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  onPlayerDeath() {
    this.deaths++;
    this.setState('dead');
    this.slowmo(0.18, 1.6);
    this.camera.shake(0.8);
    this.flash('#ff2040', 0.5);
    Audio.play('death');
  }
  onCleared() { this.clearedT = 0; }
  onExit() {
    const w = this.world;
    const secs = w.time;
    const timeBonus = Math.max(0, Math.round((240 - secs) * 40));
    const total2 = w.score + timeBonus;
    const ratio = total2 / (w.totalEnemies * 900);
    const grade = ratio >= 2.2 ? 'S' : ratio >= 1.6 ? 'A' : ratio >= 1.15 ? 'B' : ratio >= 0.8 ? 'C' : 'D';
    const mm = Math.floor(secs / 60), ss = Math.floor(secs % 60);
    this.results = {
      kills: w.kills, total: w.totalEnemies, maxCombo: w.maxCombo, score: w.score, timeBonus, total2, grade,
      timeStr: `${mm}:${String(ss).padStart(2, '0')}`,
    };
    Audio.play('clear');
    this.setState('results');
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
      else if (inp.hit('KeyQ')) { this.world = null; this.setState('title'); }
      else if (inp.hit('F2')) this.world.showVision = !this.world.showVision;
      inp.consume();
      return;
    }
    if (this.state === 'results') {
      this.updateCamera(dt);
      if (inp.hit('KeyR')) this.newGame();
      else if (this.stateT > 1 && (inp.mouseHit(0) || inp.hit('Enter'))) { this.world = null; this.setState('title'); }
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
    if (inp.hit('F2')) this.world.showVision = !this.world.showVision;
    if (inp.hit('F3')) this.overview = !this.overview;
    if (this.state === 'dead' && this.stateT > 0.8 && inp.mouseHit(0)) { this.newGame(); inp.consume(); return; }

    // time scale (slow motion)
    let target = 1;
    if (this.slow) {
      target = this.slow.scale;
      this.slow.t -= dt;
      if (this.slow.t <= 0) this.slow = null;
    }
    this.timeScale = lerp(this.timeScale, target, 1 - Math.pow(0.001, dt));
    Audio.setMuffle(this.state === 'dead' ? 0.75 : (1 - this.timeScale) * 0.7);
    if (this.world.cleared) this.clearedT += dt;

    if (this.hitstop > 0) {
      this.hitstop -= dt;
    } else {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        const aim = this.camera.screenToWorld(inp.mouse.x, inp.mouse.y);
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

    if (this.overview) {
      // debug: whole level on screen
      const m = this.world.map;
      const z = Math.min(W / m.widthPx, H / m.heightPx);
      ctx.setTransform(z, 0, 0, z, (W - m.widthPx * z) / 2, (H - m.heightPx * z) / 2);
      this.world.draw(ctx, { x: m.widthPx / 2, y: m.heightPx / 2, viewRadius: () => ({ x: 1e5, y: 1e5 }) }, t);
    } else {
      this.camera.apply(ctx);
      this.world.draw(ctx, this.camera, t);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // post
    if (this.timeScale < 0.95) {
      ctx.fillStyle = `rgba(80,0,120,${(1 - this.timeScale) * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(this.getVignette(W, H), 0, 0);
    if (this.flashA > 0) {
      ctx.globalAlpha = clamp(this.flashA, 0, 1);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    if (this.state === 'play' || this.state === 'dead' || this.state === 'pause') drawHUD(ctx, this, t);
    if (this.state === 'intro') drawIntro(ctx, W, H, this.stateT, this.world.level);
    if (this.state === 'dead') drawDead(ctx, W, H, this.stateT, this.deaths * 7);
    if (this.state === 'pause') drawPause(ctx, W, H, t);
    if (this.state === 'results') drawResults(ctx, W, H, this.stateT, this.results);
    this.drawCursor(ctx, t);
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
