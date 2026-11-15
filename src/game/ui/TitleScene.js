// Title screen: the elevated line in front of two glass towers, through a whole day and night in a loop (ui/title/
// Cycle.js, data/daycycle.js: it opens at sunset, the neons coming on). The picture is pixel art at a low logical
// resolution, in a few parallax layers: the sky with its cloud, the sun or the moon, stars, a plane's lights, pigeons,
// and the buildings far off in the haze (title/Sky.js, the far part of title/Towers.js); the towers, their glass
// giving back the sky of the hour and the city behind the viewer, offices lit at night, the sun glinting in them by
// day, the truss's shadow on their low floors (title/Towers.js); and big across the lower part of the picture the
// riveted truss bridge of the elevated line (title/Bridge.js) with the train on it, passing every 22 to 34 s or now
// and then pulling up a moment (title/Train.js); now and then a patrol car runs along the bridge's lower deck, its
// red and blue on the steel at night. Showers come and go (title/Rain.js). Every layer is painted once as by day and
// lit again each time the palette of the hour steps; per frame the layers are blitted, shifted by the eased mouse and
// a slow idle sway, and the live things drawn on top. Everything is a function of t but for the eased camera.
import { PALETTE } from '../Config.js';
import { text, glitchText } from './Text.js';
import { LW, LH, M, MY, RX, RY, canvas, halo } from './title/Draw.js';
import { hash, clamp, windState, trainState, policeState } from './title/Timeline.js';
import { lookAt, sunAt, moonAt, rainAt, lampLit, planeAt, birdsAt, mix } from './title/Cycle.js';
import { F, RGB } from './title/Layout.js';
import { buildSky, paintSky, buildCloud, paintCloud, drawCloud, drawSun, drawMoon } from './title/Sky.js';
import { buildFar, paintFar, drawFarBeacon, buildTowers, paintTowers, drawTowerLights, drawGlints } from './title/Towers.js';
import { buildBridge, paintBridge, LAMP_AT, drawLamps, drawPatrolGlow, drawPatrol, drawPatrolRim } from './title/Bridge.js';
import { buildTrain, paintTrain, carsOf, drawTrain, drawTrainMirror, trainLights } from './title/Train.js';
import { buildRain, rainColour, rainFrame, drawRain } from './title/Rain.js';

// ---------------------------------------------------------------- build all
function build() {
  const H = {
    lamp: halo(RGB.sodium, 9, 6, 3, 0.1), white: halo(RGB.white, 8, 5, 2, 0.12), redSmall: halo(RGB.red, 5, 4, 2, 0.15),
    spark: halo(RGB.spark, 18, 9, 3, 0.1), sparkDim: halo(RGB.spark, 12, 6, 2, 0.07), brake: halo(RGB.sodium, 6, 4, 2, 0.12),
    redWall: halo(RGB.red, 70, 18, 3, 0.07), blueWall: halo(RGB.blue, 70, 18, 3, 0.09),
    redCar: halo(RGB.red, 14, 6, 2, 0.12), blueCar: halo(RGB.blue, 14, 6, 2, 0.14), head: halo(RGB.warm, 12, 3, 2, 0.1),
  };
  return {
    H, sky: buildSky(), cloud: buildCloud(), far: buildFar(), towers: buildTowers(), bridge: buildBridge(), train: buildTrain(),
    rain: buildRain(), step: -1,
  };
}
// the layers lit again for the palette of the hour (once per step of it)
function relight(S, P, t) {
  const sun = sunAt(t);
  paintSky(S.sky, P);
  paintCloud(S.cloud, P);
  paintFar(S.far, P);
  paintTowers(S.towers, P, S.bridge.sil);
  paintBridge(S.bridge, P, sun ? sun.x : null);
  paintTrain(S.train, P);
  rainColour(S.rain, mix(P.sky[4], P.bright > 0.5 ? [70, 80, 100] : [255, 255, 255], 0.35));    // grey streaks on a bright sky
  S.step = P.step;
}

const cam = { x: 0, y: 0, t: -1 };
let S = null;

// pigeons by day: a beat of wings each, dark against the sky
function drawBirds(ctx, birds, ox, oy) {
  if (!birds) return;
  ctx.fillStyle = '#2e3038';
  for (const b of birds) {
    const x = Math.round(b.x + ox), y = Math.round(b.y + oy);
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x - 1, b.up ? y - 1 : y, 1, 1);
    ctx.fillRect(x + 1, b.up ? y - 1 : y, 1, 1);
  }
}
// a plane at night: hardly more than its lights
function drawPlane(ctx, p, ox, oy) {
  if (!p) return;
  const x = Math.round(p.x + ox), y = Math.round(p.y + oy);
  ctx.fillStyle = '#1a1a26';
  ctx.fillRect(x - 2, y, 5, 1);
  if (p.red) { ctx.fillStyle = '#ff4a3a'; ctx.fillRect(x - 2, y, 1, 1); }
  if (p.white) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, y, 1, 1); }
}

// ---------------------------------------------------------------- per frame
// t: seconds; mouse: { x, y } in canvas pixels, or null. The title's lines are drawn apart (drawTitleTexts).
export function drawTitleScene(ctx, W, H, t, mouse) {
  if (!S) S = build();
  const P = lookAt(t);
  if (P.step !== S.step) relight(S, P, t);
  // eased mouse + idle sway -> camera offset in about [-1, 1]
  const nx = mouse ? clamp(mouse.x / W * 2 - 1, -1, 1) : 0, ny = mouse ? clamp(mouse.y / H * 2 - 1, -1, 1) : 0;
  if (cam.t < 0 || t < cam.t || t - cam.t > 1) { cam.x = nx; cam.y = ny; }
  else { const k = 1 - Math.exp(-(t - cam.t) * 2.2); cam.x += (nx - cam.x) * k; cam.y += (ny - cam.y) * k; }
  cam.t = t;
  const wind = windState(t), tr = trainState(t), lit = P.lamps >= 0.5, police = policeState(t);
  if (police && !lit) police.red = police.blue = 0;                                // by day it only drives by
  // the train shakes the ground: the whole view jumps a pixel now and then at the height of it
  const jolt = tr && tr.shake > 0.55 && hash(Math.floor(t * 24)) < (tr.shake - 0.55) * 1.4 ? 1 : 0;
  const vx = cam.x + Math.sin(t * 0.19) * 0.16 + Math.sin(t * 0.083 + 1) * 0.1, vy = cam.y + Math.sin(t * 0.13 + 2) * 0.12;
  const sx = (f) => Math.round(-f * vx * RX), sy = (f) => Math.round(-f * vy * RY) + jolt;
  const put = (c, f) => ctx.drawImage(c, sx(f) - M, sy(f) - MY);
  const tx = sx(F.towers), ty = sy(F.towers), ex = sx(F.el), ey = sy(F.el), cx = sx(F.clouds), cy = sy(F.clouds);
  const sun = sunAt(t);

  ctx.save();
  const sc = Math.max(W / LW, H / LH);
  ctx.setTransform(sc, 0, 0, sc, (W - LW * sc) / 2, (H - LH * sc) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 1. the sky, the sun or the moon, the cloud, a plane, the buildings far off
  ctx.drawImage(S.sky.c, 0, 0);
  drawSun(ctx, sun, P, cx, cy);
  drawMoon(ctx, moonAt(t), cx, cy);
  drawCloud(ctx, S.cloud, t * (0.8 + wind.speed), cx, cy);
  drawPlane(ctx, planeAt(t), cx, cy);
  put(S.far.c, F.far);
  drawFarBeacon(ctx, S.far, P, t, sx(F.far), sy(F.far));

  // 2. the towers: what lives on them, the sun in their glass, pigeons going by, the train given back by the glass,
  // the patrol car's light
  put(S.towers.c, F.towers);
  drawTowerLights(ctx, S.towers, P, t, tx, ty);
  drawGlints(ctx, sun, P, t, tx, ty);
  drawBirds(ctx, birdsAt(t), sx(0.1), sy(0.1));
  const cars = tr ? carsOf(tr) : null;
  if (tr) drawTrainMirror(ctx, tr, cars, t, ex, ey, tx, ty, P.lamps);
  drawPatrolGlow(ctx, police, S.H, ex, ey);

  // 3. the rain behind the bridge, lit by what it falls through
  const lamps = lampLit(P.lamps, LAMP_AT, 5, t), lights = [];
  if (tr && lit) trainLights(tr, cars, t, lights);
  if (police && (police.red || police.blue)) lights.push({ x: police.x, y: 178, r: 60, type: police.red ? 4 : 5, k: 1 });
  rainFrame(S.rain, t, wind, rainAt(t), lamps, lights);
  drawRain(S.rain, 'back', ctx, tx, ty);

  // 4. the bridge: its far truss, the patrol car on the lower deck, the near truss, the floodlights, the car's light on
  // the steel; then the train
  put(S.bridge.back.c, F.el);
  drawPatrol(ctx, police, S.H, ex, ey, lit);
  put(S.bridge.front.c, F.el);
  if (lamps) drawLamps(ctx, S.H, ex, ey);
  drawPatrolRim(ctx, S.bridge, police, ex, ey);
  if (tr) drawTrain(ctx, tr, cars, S.train, t, ex, ey, S.H);

  // 5. the rain in front of everything
  drawRain(S.rain, 'front', ctx, sx(0.3), sy(0.3));
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

// the title's two lines, over the picture
export function drawTitleTexts(ctx, W, H, t) {
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
