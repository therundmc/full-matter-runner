// The frame's picture. The scene goes on the game's canvas. With the lens (render/PostGL.js) that canvas is only its
// source: the lens puts it on screen, and what must stay sharp (flash, HUD, screens, cursor) is drawn on a canvas of
// its own above. Without it everything lands on the game's canvas, graded in 2D (render/PostFX.js), with a vignette.
// The world is drawn between its last two steps (engine/Interp.js): the in-between places are in its bodies for the
// time of the draw only. What a state draws (in place of the world, over it, its hold ring) and whether the cursor
// shows come from the state table (flow/States.js). Also: the canvas' size for the view (fit, resize, setView), the
// lens' situation (lensView). Every draw goes through Game.safeDraw (the QA robot wraps it).
import { PALETTE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { fitView } from '../../engine/Camera.js';
import { PROF } from '../../engine/Profiler.js';
import { drawHUD } from '../ui/HUD.js';
import { drawLoading } from '../ui/Screens.js';
import { drawSandbox } from '../ui/SandboxPanel.js';
import { drawPerf } from '../ui/PerfOverlay.js';
import { drawHold } from '../ui/cine/Hold.js';
import { drawTitle } from '../ui/title/Title.js';
import { levelNotes } from '../ui/Menu.js';
import { neon } from '../ui/Text.js';
import Audio from '../../audio/Audio.js';
import { drawMurk } from './Murk.js';
import { cuesOn } from './Readability.js';
import { quality } from '../systems/Quality.js';
import { AIM } from '../data/aim.js';
import { CHASE } from '../data/chase.js';
import { POST } from '../data/post.js';
import { GAME } from '../data/game.js';
import { stateOf } from '../flow/States.js';

export default class FrameRenderer {
  constructor(game) {
    this.game = game;
    this.vignette = null;   // the 2D vignette and scanlines, made for the canvas' size (getVignette)
    this.bg = null;         // the backdrop's gradient as last made (backdrop)
    this.lensV = null;      // the situation told to the lens, kept from frame to frame (lensView)
    this.lensT = undefined; // the real time of the lens' last frame
    this.replaying = false; // the replay of the run is drawn behind the results
    this.drawErrorShown = false;
  }

  // ---------------- the canvas' size ----------------
  // The picture for a view `view` world px high in a window h device px high: { ss: scene px a window px, zoom }
  // (engine/Camera.js fitView: on foot the lens brings a larger scene down to the window; at the wheel the scene is
  // the window, at a whole zoom, and the lens scales nothing; the QUALITY option draws fewer px on foot)
  fit(view, h) { const g = this.game; return fitView(view, h, !!g.post?.ok && g.lensOn, g.wheel, quality()); }

  resize() {
    const g = this.game, canvas = g.canvas;
    const dpr = window.devicePixelRatio || 1, w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
    const { ss, zoom } = this.fit(g.view, h), was = canvas.width, wasH = canvas.height;
    canvas.width = Math.round(w * ss);
    canvas.height = Math.round(h * ss);
    g.camera.resize(canvas.width, canvas.height, zoom);
    // (the mouse is kept in the scene's px: it stays where it was on the window)
    if (was && wasH && g.input) { g.input.mouse.x *= canvas.width / was; g.input.mouse.y *= canvas.height / wasH; }
    g.post?.resize(w, h);
    this.vignette = null;
  }

  // The view from now on: its height (world px) and whether it is the wheel's (drawn 1:1 and held on whole px:
  // fit, Camera `pixel`). The canvas is resized for it at once: one cut, no zoom eased from one to the other (an
  // in-between zoom is not a whole one)
  setView(view, wheel = false) {
    const g = this.game;
    g.camera.pixel = wheel;
    if (view === g.view && wheel === g.wheel) return;
    g.view = view;
    g.wheel = wheel;
    this.resize();
  }

  // debug (F6): the picture with / without the lens, the canvas' size with it (fit)
  toggleLens() {
    const g = this.game;
    g.lensOn = !g.lensOn;
    g.post.show(g.lensOn);
    this.resize();
    g.lensNote = g.time + GAME.lensNote;
  }

  // ---------------- the frame ----------------
  render() {
    const g = this.game;
    if (g.world) g.interp.apply(g.clock.alpha);
    try { this.paint(); } finally { g.interp.restore(); }
  }

  paint() {
    const g = this.game, ctx = g.ctx, W = g.canvas.width, H = g.canvas.height, t = g.time, mi = g.menuInput;
    const post = g.post?.ok && g.lensOn ? g.post : null, o = post ? post.octx : ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const S = stateOf(g), inWorld = !!S.flags.scene && !!g.world;
    if (inWorld) g.world.cues = cuesOn(g.state, !!g.world.tutorial?.scene); // render/Readability.js
    if (inWorld) this.aimTo(g.world);
    if (g.state === 'loading') drawLoading(ctx, W, H, g.loadP);
    else if (!inWorld) g.safeDraw(ctx, () => { mi.titleRects = mi.drawn(drawTitle(ctx, W, H, g.stateT, this.titleView())); });
    else if (S.picture) g.safeDraw(ctx, () => S.picture(g, ctx, W, H));
    else this.drawScene(ctx, W, H, t, post);
    if (post) {
      if (PROF.on) PROF.begin('lens');
      const now = performance.now() / 1000, view = this.lensView(W, H, inWorld);
      g.lens.update(Math.min(0.1, now - (this.lensT ?? now)), view);
      this.lensT = now;
      post.render(g.lens.uniforms(view), t);
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, W, H);
      o.imageSmoothingEnabled = false;
      if (PROF.on) PROF.end('lens');
    }
    if (PROF.on) PROF.begin('hud');
    if (inWorld) this.drawOver(o, W, H, t);
    else if (g.state === 'title') mi.rects = mi.titleRects || [];
    if (g.lensNote > t) {
      o.font = `${Math.round(14 * H / 720)}px monospace`;
      o.textAlign = 'left';
      o.fillStyle = '#3cff7a';
      o.fillText(`F6  LENS ${g.lensOn ? 'ON' : 'OFF'}`, 12, H - 14 * H / 720);
    }
    if (S.flags.cursor) this.drawCursor(o, t);
    if (PROF.on) PROF.end('hud');
    // F8: the perf overlay, over everything (never under the lens: it is on the HUD's canvas)
    if (!g.perf.on) return;
    PROF.begin('overlay');
    g.safeDraw(o, () => drawPerf(o, W, H, g.perf.mode, g.perf.view()));
    PROF.end('overlay');
  }

  // the aim's setting as the world's picture reads it: LOCK's floor chevron (render/AimArt.js only); set before every
  // frame the world is drawn (paint), so that the option changed in the pause shows at once
  aimTo(world) {
    world.aimMark = !!this.game.settings.aimMark;
  }

  // what the title's picture is told (ui/title/Title.js); the hit list between two levels is drawn by it too
  titleView() {
    const g = this.game, between = g.state === 'hitlist';
    return {
      menu: g.menu, progress: g.progress, device: g.input.device, mouse: g.input.mouse, between,
      notes: between ? levelNotes(g.menuInput.context()) : null,
      crossed: g.crossed, sound: (name, vol, opts) => Audio.play(name, { vol, ...opts }), onCrossed: (n) => g.flow.markCrossed(n),
    };
  }

  // the world (or the replay of the run behind the results), lit, before any lens
  drawScene(ctx, W, H, t, post) {
    const g = this.game;
    this.replaying = g.state === 'results' && g.replay.ready;
    // backdrop outside the map; when the map fills the whole picture only its darkest tone, flat (cheaper than the
    // gradient: it only shows through the odd texel where the turned floor and walls both miss one)
    const covered = !this.replaying && !g.overview && this.mapCovers(W, H);
    ctx.fillStyle = covered ? GAME.backdrop.flat : this.backdrop(ctx, W, H, t);
    ctx.fillRect(0, 0, W, H);
    if (this.replaying) {
      g.safeDraw(ctx, () => g.replay.draw(ctx, W, H, t));
    } else if (g.overview) {
      // debug: whole level on screen
      const m = g.world.map;
      const z = Math.min(W / m.widthPx, H / m.heightPx);
      ctx.setTransform(z, 0, 0, z, (W - m.widthPx * z) / 2, (H - m.heightPx * z) / 2);
      g.world.draw(ctx, { x: m.widthPx / 2, y: m.heightPx / 2, viewRadius: () => ({ x: 1e5, y: 1e5 }) }, t);
    } else {
      g.camera.apply(ctx);
      if (PROF.on) PROF.begin('draw');
      g.safeDraw(ctx, () => g.world.draw(ctx, g.camera, t));
      if (PROF.on) PROF.end('draw');
      if (g.murk > 0.001) {
        const at = g.camera.worldToScreen(g.world.player.x, g.world.player.y);
        g.safeDraw(ctx, () => drawMurk(ctx, W, H, at.x, at.y, g.murk));
      }
      if (!post) g.safeDraw(ctx, () => g.postfx.apply(ctx, W, H, g.camera.trauma, g.wheel));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const slow = POST.slowTint;
    if (g.timeScale < slow.below) {
      ctx.fillStyle = `rgba(${slow.color.join(',')},${(1 - g.timeScale) * slow.k})`;
      ctx.fillRect(0, 0, W, H);
    }
    // the replay keeps the bare picture: no lens, scanlines, flash or HUD (they go over it again when it plays)
    if (PROF.on) PROF.begin('replay');
    if (g.state === 'play' && !g.overview) g.recorder.capture(g.canvas, g.world.time);
    if (PROF.on) PROF.end('replay');
    if (!post) ctx.drawImage(this.getVignette(W, H), 0, 0);
  }

  // does the map (its floor and walls) fill the whole picture the camera shows: then nothing of the backdrop shows
  mapCovers(W, H) {
    const c = this.game.camera, a = c.screenToWorld(0, 0), b = c.screenToWorld(W, 0), d = c.screenToWorld(0, H), e = c.screenToWorld(W, H);
    const m = 2; // world px: the camera's rounding to whole picture px
    return this.game.world.decals.covers(Math.min(a.x, b.x, d.x, e.x) - m, Math.min(a.y, b.y, d.y, e.y) - m,
      Math.max(a.x, b.x, d.x, e.x) + m, Math.max(a.y, b.y, d.y, e.y) + m);
  }

  // the backdrop's gradient; its middle drifts with t, held on steps of GAME.backdrop.step (made again only when it
  // moves a step, not every frame)
  backdrop(ctx, W, H, t) {
    const K = GAME.backdrop, mid = Math.round((0.5 + Math.sin(t * K.rate) * K.swing) / K.step) * K.step, B = this.bg;
    if (B && B.W === W && B.H === H && B.mid === mid) return B.g;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, K.from);
    g.addColorStop(mid, K.mid);
    g.addColorStop(1, K.to);
    this.bg = { W, H, mid, g };
    return g;
  }

  // what goes over the picture and stays sharp: the flash, the HUD, the sandbox's panel, F4's lines, then the state's
  // own screen and its hold-to-skip ring (flow/States.js `over`, `hold`)
  drawOver(ctx, W, H, t) {
    const g = this.game, S = stateOf(g);
    if (g.flashA > 0) {
      ctx.globalAlpha = clamp(g.flashA, 0, 1);
      ctx.fillStyle = g.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // (not under the pause: its card says the run so far)
    if (S.flags.hud && !g.world?.tutorial?.leap) g.safeDraw(ctx, () => drawHUD(ctx, g, t));
    if (g.sandbox.on && g.state === 'play') g.safeDraw(ctx, () => drawSandbox(ctx, H, g.sandbox, t));
    if (g.world.debugPhysics) {
      ctx.font = `${Math.round(12 * H / 720)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#3cff7a';
      g.world.renderer.debugStats().forEach((l, i) => ctx.fillText(l, 12, H - 80 * H / 720 + i * 16 * H / 720));
    }
    g.safeDraw(ctx, () => {
      S.over?.(g, ctx, W, H, t);
      if (S.hold?.(g)) drawHold(ctx, W, H, g.skip, g.input.device);
    });
  }

  // the situation, as the lens wants it told (render/Lens.js)
  // (one object, and its parts, kept from frame to frame: the lens reads it at once and keeps nothing of it)
  lensView(W, H, inWorld) {
    const g = this.game, w = g.world, p = inWorld ? w.player : null, inp = g.input, v = p?.vaulting, cam = g.camera;
    const V = this.lensV ||= { toScreen: (x, y) => g.camera.worldToScreen(x, y), you: {}, ride: {}, heat: [], hot: [], none: [] };
    V.W = W; V.H = H; V.outH = g.post ? g.post.canvas.height : H; V.scale = cam.z;
    V.state = g.state; V.page = inWorld && !!stateOf(g).flags.page; V.phase = inWorld ? w.director.phase : 'normal'; V.powerOn = inWorld ? w.power.on : true;
    V.timeScale = g.timeScale; V.trauma = inWorld ? cam.trauma : 0; V.combo = inWorld ? w.scoring.combo : 0;
    V.look = inp.down('ShiftLeft') || inp.down('ShiftRight');
    V.player = p ? V.you : null;
    if (p) {
      V.you.x = p.x; V.you.y = p.y; V.you.angle = v ? v.dir : p.slideAnim ? p.slideAnim.dir : p.angle;
      V.you.move = v?.rolling ? 'roll' : v?.kind === 'window' ? 'dive' : p.slideAnim ? 'slide' : null;
    }
    V.lights = inWorld && !g.overview ? w.lighting?.brightest || V.none : V.none;
    // at the wheel: his speed (share of flat out) and the way he goes, for what the speed does to the picture's edges
    const dr = inWorld && w.drive?.on && !g.overview ? w.drive : null, R = V.ride;
    V.drive = dr ? R : null;
    if (dr) { R.k = dr.v / CHASE.max; R.angle = Math.atan2(dr.u, Math.max(dr.v, 1)) * 0.5; R.x = dr.van.x; R.y = dr.van.y; }
    // (a close-up at the wheel, the grab, the cigarette: the car fills the picture, its ends would be in the speed's band)
    if (dr) R.close = cam.z > cam.zoom + 1;
    V.rot = cam.rot;
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
    const K = GAME.vignette, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = Math.hypot(W, H) / 2;
    const grad = g.createRadialGradient(W / 2, H / 2, r * K.inner, W / 2, H / 2, r);
    grad.addColorStop(0, `rgba(${K.color},0)`);
    grad.addColorStop(1, `rgba(${K.color},${K.edge})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // faint scanlines
    g.fillStyle = `rgba(0,0,0,${K.scan})`;
    const step = Math.max(2, Math.round(H / K.lines));
    if (!this.game.wheel) for (let y = 0; y < H; y += step * 2) g.fillRect(0, y, W, step); // (none at the wheel: Lens `flat`)
    this.vignette = c;
    return c;
  }

  drawCursor(ctx, t) {
    const g = this.game, inp = g.input, padAt = g.cameraDirector.padAimAt;
    // with a gamepad: the virtual cursor while playing (CameraDirector.padAim), none in the menus and screens
    if (inp.device === 'pad' && !(g.state === 'play' && padAt)) return;
    const { x, y } = inp.mouse;
    const s = g.canvas.height / 720;
    // in play the cue is in the world (LOCK, render/AimArt.js); the mouse keeps a small dot where it is, grey at the
    // wheel out of his gun's arc (systems/CarGun.js; AimArt offArc draws the rest); the gamepad's stick has no point
    if (g.state === 'play') {
      if (inp.device === 'pad') return;
      const gun = g.world?.drive?.on ? g.world.drive.gun : null, off = gun?.aimed && !gun.aimed.ok;
      const r = Math.max(1, Math.round(AIM.dot.r * s)), e = Math.max(1, Math.round(AIM.dot.edge * s));
      ctx.fillStyle = AIM.ink;
      ctx.fillRect(Math.round(x) - r - e, Math.round(y) - r - e, (r + e) * 2, (r + e) * 2);
      ctx.fillStyle = off ? AIM.off : AIM.bone;
      ctx.fillRect(Math.round(x) - r, Math.round(y) - r, r * 2, r * 2);
      return;
    }
    // in the menus and screens: a neon cross, turning
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
