// Title screen: the elevated line seen from his window, at night, in the rain. The picture is pixel art at a low
// logical resolution, in a few parallax layers: the slit of night sky between two glass towers, a thin cloud drifting
// in it and a few buildings far off (title/Sky.js, the far part of title/Towers.js); the towers themselves, their
// curtain walls giving back the city behind him, wavy, pane by pane, a few offices still lit (title/Towers.js); and
// big across the lower part of the picture the riveted truss bridge of the elevated line (title/Bridge.js) with the
// train on it, passing every 22 to 34 s or now and then pulling up a moment (title/Train.js); now and then a patrol
// car runs along the bridge's lower deck, its red and blue on the steel. A light rain falls through it all
// (title/Rain.js). Every static layer is painted once; per frame the layers are blitted, shifted by the eased mouse
// and a slow idle sway, and the live things drawn on top. Everything is a function of t (title/Timeline.js) but for
// the eased camera. drawTitleScene returns what the window pane (ui/cine/Pane.js) feels of it: the train's rumble,
// the patrol car's lights.
import { PALETTE } from '../Config.js';
import { text, glitchText } from './Text.js';
import { LW, LH, M, MY, RX, RY, canvas, halo } from './title/Draw.js';
import { hash, clamp, windState, trainState, policeState } from './title/Timeline.js';
import { F, RGB } from './title/Layout.js';
import { buildSky, buildCloud, drawCloud } from './title/Sky.js';
import { buildFar, buildTowers, drawBeacon, drawOffices } from './title/Towers.js';
import { buildBridge, drawLamps, drawPatrolGlow, drawPatrol, drawPatrolRim } from './title/Bridge.js';
import { buildTrain, carsOf, drawTrain, drawTrainMirror, trainLights } from './title/Train.js';
import { buildRain, rainFrame, drawRain } from './title/Rain.js';

// ---------------------------------------------------------------- build all
function build() {
  const H = {
    lamp: halo(RGB.sodium, 9, 6, 3, 0.1), white: halo(RGB.white, 8, 5, 2, 0.12), redSmall: halo(RGB.red, 5, 4, 2, 0.15),
    spark: halo(RGB.spark, 18, 9, 3, 0.1), sparkDim: halo(RGB.spark, 12, 6, 2, 0.07), brake: halo(RGB.sodium, 6, 4, 2, 0.12),
    redWall: halo(RGB.red, 70, 18, 3, 0.07), blueWall: halo(RGB.blue, 70, 18, 3, 0.09),
    redCar: halo(RGB.red, 14, 6, 2, 0.12), blueCar: halo(RGB.blue, 14, 6, 2, 0.14), head: halo(RGB.warm, 12, 3, 2, 0.1),
  };
  return { H, sky: buildSky(), cloud: buildCloud(), far: buildFar(), towers: buildTowers(), bridge: buildBridge(), train: buildTrain(), rain: buildRain() };
}

const cam = { x: 0, y: 0, t: -1 };
let S = null;

// ---------------------------------------------------------------- per frame
// t: seconds; mouse: { x, y } in canvas pixels, or null
// texts: false leaves the title's lines out (drawTitleTexts draws them, over what is put on the picture)
// returns what the glass feels: { shake 0..1 (the train's rumble), tint [r, g, b, k] (the patrol car's light) or null }
export function drawTitleScene(ctx, W, H, t, mouse, texts = true) {
  if (!S) S = build();
  // eased mouse + idle sway -> camera offset in about [-1, 1]
  const nx = mouse ? clamp(mouse.x / W * 2 - 1, -1, 1) : 0, ny = mouse ? clamp(mouse.y / H * 2 - 1, -1, 1) : 0;
  if (cam.t < 0 || t < cam.t || t - cam.t > 1) { cam.x = nx; cam.y = ny; }
  else { const k = 1 - Math.exp(-(t - cam.t) * 2.2); cam.x += (nx - cam.x) * k; cam.y += (ny - cam.y) * k; }
  cam.t = t;
  const wind = windState(t), tr = trainState(t), police = policeState(t);
  // the glass shivers with the train: the whole view jumps a pixel now and then at the height of it
  const jolt = tr && tr.shake > 0.55 && hash(Math.floor(t * 24)) < (tr.shake - 0.55) * 1.4 ? 1 : 0;
  const vx = cam.x + Math.sin(t * 0.19) * 0.16 + Math.sin(t * 0.083 + 1) * 0.1, vy = cam.y + Math.sin(t * 0.13 + 2) * 0.12;
  const sx = (f) => Math.round(-f * vx * RX), sy = (f) => Math.round(-f * vy * RY) + jolt;
  const put = (c, f) => ctx.drawImage(c, sx(f) - M, sy(f) - MY);
  const tx = sx(F.towers), ty = sy(F.towers), ex = sx(F.el), ey = sy(F.el);

  ctx.save();
  const sc = Math.max(W / LW, H / LH);
  ctx.setTransform(sc, 0, 0, sc, (W - LW * sc) / 2, (H - LH * sc) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 1. the sky in the slit, its cloud, the buildings far off
  ctx.drawImage(S.sky, 0, 0);
  drawCloud(ctx, S.cloud, t * (0.8 + wind.speed), sx(F.clouds), sy(F.clouds));
  put(S.far.c, F.far);
  drawBeacon(ctx, S.far, t, sx(F.far), sy(F.far));

  // 2. the towers, their lit offices, the train given back by their glass, the patrol car's light on their low floors
  put(S.towers.c, F.towers);
  drawOffices(ctx, S.towers, t, tx, ty);
  const cars = tr ? carsOf(tr) : null;
  if (tr) drawTrainMirror(ctx, tr, cars, t, ex, ey, tx, ty);
  drawPatrolGlow(ctx, police, S.H, ex, ey);

  // 3. the rain behind the bridge, lit by what it falls through
  const lights = [];
  if (tr) trainLights(tr, cars, t, lights);
  if (police && (police.red || police.blue)) lights.push({ x: police.x, y: 178, r: 60, type: police.red ? 4 : 5, k: 1 });
  rainFrame(S.rain, t, wind, lights);
  drawRain(S.rain, 'back', ctx, tx, ty);

  // 4. the bridge: its far truss, the patrol car on the lower deck, the near truss, the floodlights, the car's light on
  // the steel; then the train
  put(S.bridge.back, F.el);
  drawPatrol(ctx, police, S.H, ex, ey);
  put(S.bridge.front, F.el);
  drawLamps(ctx, S.H, ex, ey);
  drawPatrolRim(ctx, S.bridge, police, ex, ey);
  if (tr) drawTrain(ctx, tr, cars, S.train, t, ex, ey, S.H);

  // 5. the rain in front of everything
  drawRain(S.rain, 'front', ctx, sx(0.3), sy(0.3));
  ctx.restore();

  if (texts) drawTexts(ctx, W, H, t);
  let tint = null;
  if (police && (police.red || police.blue)) {
    const k = clamp(1 - Math.abs(police.x - LW / 2) / (LW / 2 + 80), 0, 1);
    tint = police.red ? [255, 60, 50, k] : [90, 130, 255, k];
  }
  return { shake: tr ? tr.shake : 0, tint };
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
}
