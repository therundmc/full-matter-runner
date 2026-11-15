// Title screen: the city in the rain seen from his window, high up, at night. The picture is pixel art at a low
// logical resolution, in parallax layers: the sky and its two decks of low cloud with the searchlights on them
// (title/Sky.js), the far skyline, the middle row of rooftops and the block across the avenue (title/City.js), the
// avenue below with its traffic and now and then a patrol car (title/Street.js), and in front of it all the elevated
// line, a train passing every 20 to 30 s (title/Train.js); the rain in three depths falls through it all
// (title/Rain.js), the roofs have their life (title/Life.js). Every static layer is painted once; per frame the
// layers are blitted, shifted by the eased mouse and a slow idle sway, and the live things drawn on top: windows going
// off and on, the blinking masts, the neon, the traffic, the train. Everything is a function of t (title/Timeline.js)
// but for the eased camera. drawTitleScene returns what the window pane (ui/cine/Pane.js) feels of it: the train's
// rumble, the patrol car's lights, the lightning.
import { PALETTE } from '../Config.js';
import { text, glitchText } from './Text.js';
import { LW, LH, M, MY, RX, RY, canvas, halo } from './title/Draw.js';
import { hash, clamp, windState, trainState, policeState, traffic, beamAngles, lightningState, planeState } from './title/Timeline.js';
import { F, BLOCK, RGB, rowF } from './title/Layout.js';
import { buildSky, buildClouds, drawDeck, drawBeams, drawLightning, drawPlane } from './title/Sky.js';
import { buildFar, buildMid, buildNear, drawLive, drawBeacons, drawSigns } from './title/City.js';
import { buildAvenue, drawAvenue, drawTraffic, drawLampGlow, drawWalkers, MANHOLE } from './title/Street.js';
import { buildEl, buildTrain, carsOf, drawTrain, drawTrainSpill, trainLights, drawSignal } from './title/Train.js';
import { buildRain, rainFrame, setLights, drawRain, drawFrontRain, drawSplashes } from './title/Rain.js';
import { drawPigeons, drawVapours, drawSmoker, plume } from './title/Life.js';

// ---------------------------------------------------------------- build all
function build() {
  const H = {
    beacon: halo(RGB.red, 2.5, 2, 1, 0.22), cyan: halo(RGB.cyan, 12, 20, 3, 0.06), pink: halo(RGB.pink, 32, 14, 3, 0.07),
    red: halo(RGB.red, 14, 6, 2, 0.07), amber: halo(RGB.amber, 14, 6, 2, 0.08), lamp: halo(RGB.sodium, 5, 3, 2, 0.16),
    redRoad: halo(RGB.red, 40, 10, 3, 0.09), blueRoad: halo(RGB.blue, 40, 10, 3, 0.1),
    redWall: halo(RGB.red, 64, 15, 3, 0.08), blueWall: halo(RGB.blue, 64, 15, 3, 0.1),
    white: halo(RGB.white, 6, 4, 2, 0.1), redSmall: halo(RGB.red, 5, 4, 2, 0.15),
    spark: halo(RGB.spark, 30, 14, 3, 0.1), sparkDim: halo(RGB.spark, 20, 9, 2, 0.07),
  };
  return {
    H, sky: buildSky(), clouds: buildClouds(), far: buildFar(), mid: buildMid(), near: buildNear(),
    ave: buildAvenue(), el: buildEl(), train: buildTrain(), rain: buildRain(),
  };
}

const cam = { x: 0, y: 0, t: -1 };
let S = null;

// ---------------------------------------------------------------- per frame
// t: seconds; mouse: { x, y } in canvas pixels, or null
// texts: false leaves the title's lines out (drawTitleTexts draws them, over what is put on the picture)
// returns what the glass feels: { shake 0..1 (the train's rumble), tint [r, g, b, k] (the patrol car's light) or
// null, flash 0..1 (lightning) }
export function drawTitleScene(ctx, W, H, t, mouse, texts = true) {
  if (!S) S = build();
  // eased mouse + idle sway -> camera offset in about [-1, 1]
  const nx = mouse ? clamp(mouse.x / W * 2 - 1, -1, 1) : 0, ny = mouse ? clamp(mouse.y / H * 2 - 1, -1, 1) : 0;
  if (cam.t < 0 || t < cam.t || t - cam.t > 1) { cam.x = nx; cam.y = ny; }
  else { const k = 1 - Math.exp(-(t - cam.t) * 2.2); cam.x += (nx - cam.x) * k; cam.y += (ny - cam.y) * k; }
  cam.t = t;
  const wind = windState(t), tr = trainState(t), police = policeState(t), L = lightningState(t);
  // the glass shivers with the train: the whole view jumps a pixel now and then at the height of it
  const jolt = tr && tr.shake > 0.55 && hash(Math.floor(t * 24)) < (tr.shake - 0.55) * 1.4 ? 1 : 0;
  const vx = cam.x + Math.sin(t * 0.19) * 0.16 + Math.sin(t * 0.083 + 1) * 0.1, vy = cam.y + Math.sin(t * 0.13 + 2) * 0.12;
  const sx = (f) => Math.round(-f * vx * RX), sy = (f) => Math.round(-f * vy * RY) + jolt;
  const at = (f) => ({ x: sx(f), y: sy(f) }), put = (c, f) => ctx.drawImage(c, sx(f) - M, sy(f) - MY);
  const R = S.rain;

  ctx.save();
  const sc = Math.max(W / LW, H / LH);
  ctx.setTransform(sc, 0, 0, sc, (W - LW * sc) / 2, (H - LH * sc) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 1. the sky, the high cloud, the far lightning behind it all, the searchlights, a plane going over
  ctx.drawImage(S.sky, 0, 0);
  const cloudOff = t * (1.1 + wind.speed * 1.4);
  drawDeck(ctx, S.clouds.high, cloudOff, sx(F.clouds), sy(F.clouds));
  drawLightning(ctx, L, S.clouds, cloudOff, sx(F.clouds), sy(F.clouds));
  drawBeams(ctx, beamAngles(t), sx(F.far), sy(F.far), t);
  drawPlane(ctx, planeState(t), sx(F.clouds), sy(F.clouds));

  // 2. the far skyline, its windows, its red lights; the scud going over the tops of the tall ones
  put(S.far.c, F.far);
  drawLive(ctx, S.far.live, t, sx(F.far), sy(F.far));
  drawBeacons(ctx, S.far.beacons, t, sx(F.far), sy(F.far), S.H.beacon);
  drawDeck(ctx, S.clouds.scud, t * (3.2 + wind.speed * 5), sx(F.scud), sy(F.scud));

  // 3. the middle row, the far rain in front of it
  put(S.mid.c, F.mid);
  drawLive(ctx, S.mid.live, t, sx(F.mid), sy(F.mid));
  drawBeacons(ctx, S.mid.beacons, t, sx(F.mid), sy(F.mid), S.H.beacon);
  rainFrame(R, t, wind);
  drawRain(R, 'far', ctx, sx(F.mid), sy(F.mid));

  // 4. the block across: its roofs and fronts, the signs, the man smoking on the roof, the pigeons, the steam, the
  // train's windows sliding over the fronts
  put(S.near.c, F.near);
  const near = at(F.near), el = at(F.el);
  drawLive(ctx, S.near.live, t, near.x, near.y);
  const signs = drawSigns(ctx, t, S.H, near, at(F.mid));
  drawSmoker(ctx, 166 + near.x, BLOCK[2].rb + 6 + near.y, t, wind);
  drawPigeons(ctx, S.near.ledge, t, near.x, near.y);
  drawVapours(ctx, S.near.vents, S.near.chimneys, t, wind, near.x, near.y);
  const cars = tr ? carsOf(tr) : null;
  if (tr) drawTrainSpill(ctx, tr, cars, near.x, near.y, el.x, el.y, t);

  // 5. the avenue, its traffic, the patrol car; the rain in front of all that, lit by whatever it falls through
  drawAvenue(ctx, S.ave, sx, sy);
  const moving = [];
  drawWalkers(ctx, t, sx, sy);
  drawTraffic(ctx, traffic(t), police, sx, sy, S.H, moving);
  const mf = rowF(MANHOLE.y);
  plume(ctx, MANHOLE.x + sx(mf), MANHOLE.y + sy(mf), t, wind, 5.5, '180,160,190', 14, 8);
  drawLampGlow(ctx, S.H.lamp, sx, sy);
  if (tr) trainLights(tr, cars, t, moving);
  setLights(R, signs, moving);
  const st = rowF(170);
  drawSplashes(R, 'near', ctx, near.x, near.y);
  drawSplashes(R, 'street', ctx, sx(st), sy(st));
  drawRain(R, 'mid', ctx, sx(st), sy(st));

  // 6. the elevated line, its signal, the train; the rain in front of everything
  put(S.el, F.el);
  drawSignal(ctx, t, el.x, el.y);
  drawSplashes(R, 'el', ctx, el.x, el.y);
  if (tr) {
    drawTrain(ctx, tr, cars, S.train, t, el.x, el.y, S.H);
    drawSplashes(R, 'train', ctx, el.x, el.y, [Math.min(tr.x, tr.tail), Math.max(tr.x, tr.tail)]);
  }
  drawFrontRain(R, ctx, sx(0.3), sy(0.3));
  ctx.restore();

  if (texts) drawTexts(ctx, W, H, t);
  let tint = null;
  if (police && (police.red || police.blue)) {
    const k = clamp(1 - Math.abs(police.x - LW / 2) / (LW / 2 + 80), 0, 1);
    tint = police.red ? [255, 60, 50, k] : [90, 130, 255, k];
  }
  return { shake: tr ? tr.shake : 0, tint, flash: L.flash };
}

// the title's lines alone, at alpha (the opening fades them as the camera leaves the window)
export function drawTitleTexts(ctx, W, H, t, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawTexts(ctx, W, H, t);
  ctx.restore();
}

// The two big title lines cost more to rasterize as text every frame than the whole scene: each of their layers
// (the cyan and pink ghosts, the outlined line with its shadow) is drawn once per screen size with the same helpers
// as glitchText (Text.js), then blitted with its offsets, bob and tilt.
let titleCache = null;
function titleLayers(str, size, color) {
  const pad = Math.ceil(size * 0.5), font = `${Math.round(size)}px joystix, monospace`;
  const probe = canvas(1, 1).g;
  probe.font = font;
  const w = Math.ceil(probe.measureText(str).width) + 2 * pad, h = Math.ceil(size * 1.6);
  const layer = (col, opts) => { const { c, g } = canvas(w, h); g.imageSmoothingEnabled = true; text(g, str, w / 2, h / 2, size, col, opts); return c; };
  return {
    cyan: layer(PALETTE.cyan, { shadow: null, outline: false, alpha: 0.8 }),
    pink: layer(PALETTE.pink, { shadow: null, outline: false, alpha: 0.8 }),
    main: layer(color, {}),
  };
}
function titleLine(ctx, L, x, y, size, t, rot) {
  const off = size * 0.06 * (1 + Math.sin(t * 13) * 0.5 * (Math.sin(t * 2.3) > 0.85 ? 4 : 1));
  const blit = (c, cx) => { ctx.save(); ctx.translate(cx, y); ctx.rotate(rot); ctx.drawImage(c, -c.width / 2, -c.height / 2); ctx.restore(); };
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'lighter';
  blit(L.cyan, x - off); blit(L.pink, x + off);
  ctx.globalCompositeOperation = 'source-over';
  blit(L.main, x);
  ctx.restore();
}

function drawTexts(ctx, W, H, t) {
  const s = H / 720;
  // a faint shade at the bottom so the tagline reads over the wet street
  const band = ctx.createLinearGradient(0, H * 0.88, 0, H);
  band.addColorStop(0, 'rgba(6,2,10,0)');
  band.addColorStop(1, 'rgba(6,2,10,0.32)');
  ctx.fillStyle = band;
  ctx.fillRect(0, H * 0.88, W, H * 0.12);
  const bob = Math.sin(t * 2) * 4 * s;
  const fontReady = !document.fonts || document.fonts.check(`${Math.round(72 * s)}px joystix`);
  if (fontReady && (!titleCache || titleCache.H !== H)) {
    titleCache = { H, full: titleLayers('FULL MATTER', 72 * s, PALETTE.white), runner: titleLayers('RUNNER', 86 * s, PALETTE.yellow) };
  }
  if (fontReady) {
    titleLine(ctx, titleCache.full, W / 2, H * 0.1 + bob, 72 * s, t, Math.sin(t * 1.3) * 0.02);
    titleLine(ctx, titleCache.runner, W / 2, H * 0.205 + bob, 86 * s, t + 1, Math.sin(t * 1.3 + 1) * 0.02);
  } else {
    glitchText(ctx, 'FULL MATTER', W / 2, H * 0.1 + bob, 72 * s, t, { rot: Math.sin(t * 1.3) * 0.02, color: PALETTE.white });
    glitchText(ctx, 'RUNNER', W / 2, H * 0.205 + bob, 86 * s, t + 1, { rot: Math.sin(t * 1.3 + 1) * 0.02, color: PALETTE.yellow });
  }
  text(ctx, 'ONE HIT AND YOU ARE DEAD. SO ARE THEY.', W / 2, H * 0.95, 13 * s, PALETTE.pink);
}
