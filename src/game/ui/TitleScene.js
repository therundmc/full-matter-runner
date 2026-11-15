// Title screen: the entrance of a dive bar on a rainy, windy night, seen side-on from across a wet street, in
// layered parallax. The picture is pixel art at a low logical resolution; every static layer is painted once
// (title/Layers.js) and lit once, per pixel, by the scene's lights, one pass per light that changes (the letters,
// the glass, the border tube, the bulbs, the pawn shop's tube) so the live states only scale cached passes. Per frame
// the layers are blitted, shifted by the eased mouse and a slow idle sway, and the live things drawn on top: the neon
// sign (title/Sign.js), the rain in three depths and what it does to the ground (title/Rain.js, title/Water.js), the
// wind's work and the street's life (title/Life.js). Everything is a function of t (title/Timeline.js) but for the
// eased camera.
import { PALETTE } from '../Config.js';
import { text, glitchText } from './Text.js';
import { LW, LH, M, MY, CW, CH, RX, RY, GY, ROAD, F, rowF, canvas, shade, put, cropTo, glowSprite } from './title/Draw.js';
import { hash, clamp, smooth, windState, signState, bulbState, sweepState, lightningState, tubeState } from './title/Timeline.js';
import { LAMP, TUBE, WIN, HYD, BOOTH, COLD, WARM, AMBER, BOOTHC, PINK, CYAN, VIOLET, BULB, AMB } from './title/Layout.js';
import { HIDDEN, buildSky, buildClouds, buildFlash, buildFar, buildMid, buildBarAlbedo, buildGround, buildRefl, buildProps, buildBoothGlow, buildFg, buildFgNeon, buildCone, buildWinBase } from './title/Layers.js';
import { buildSign, drawSignLit, drawSignFx, SIGN_LIGHT, REFL_SPAN } from './title/Sign.js';
import { buildRain, rainFrame, drawRain, drawFrontRain, drawSplashes, drawGroundWater, drawMist } from './title/Rain.js';
import { drawBarWater, drawWindowWater, drawBoothWater, buildCarBeads, drawCarWater } from './title/Water.js';
import { buildDoorman, drawDoorman, drawCable, drawValance, drawCat, drawRat, drawPigeon, drawBag, drawFronds, drawSmoke, drawSteam, drawPapers } from './title/Life.js';

// ---------------------------------------------------------------- build all
function build() {
  const S = {};
  S.sky = buildSky();
  S.clouds = buildClouds();
  S.flash = buildFlash();
  S.farWins = [];
  S.far = buildFar(S.farWins);
  S.mid = buildMid();
  S.sign = buildSign();
  // the bar row: albedo lit once by the steady lights, then one cropped pass per light that lives
  const bar = buildBarAlbedo(S.sign.G);
  S.barAlb = bar;
  const [px0, py0] = SIGN_LIGHT.pink, [cx0, cy0] = SIGN_LIGHT.cyan, [ax0, ay0] = SIGN_LIGHT.amber;
  const stat = [
    { x: WIN.x + 22, y: 122, r: 40, c: WARM, k: 0.75 },
    { x: 196, y: 124, r: 24, c: WARM, k: 0.55 },
    { x: 196, y: 110, r: 26, c: WARM, k: 0.75, up: 0.1 },
    { x: 277, y: 110, r: 38, c: [1, 0.8, 0.5], k: 1.1, up: 0.35 },
    { x: LAMP.x, y: LAMP.y + 6, r: 150, c: AMBER, k: 0.45 },
    { x: 307, y: 108, r: 20, c: WARM, k: 0.3 },
    { x: 40, y: 150, r: 70, sy: 1.6, c: [0.6, 0.5, 0.9], k: 0.3 },    // street spill on the pawn shop
    { x: BOOTH.x + 6, y: BOOTH.y - 20, r: 30, sy: 1.2, c: BOOTHC, k: 0.9 },
  ];
  const ambY = (y) => 0.45 + 0.75 * smooth(30, 150, y);
  S.barLit = shade(bar, stat, AMB, ambY);
  S.barPass = {
    pink: shade(bar, [{ x: px0, y: py0, r: 92, c: PINK, k: 1.5 }, { x: px0, y: py0, r: 34, c: PINK, k: 1.1 }]),
    cyan: shade(bar, [{ x: cx0, y: cy0, r: 56, c: CYAN, k: 1.0 }, { x: cx0, y: cy0, r: 20, c: CYAN, k: 0.3 }]),
    violet: shade(bar, [{ x: 168, y: 86, r: 44, c: VIOLET, k: 0.7 }, { x: 240, y: 86, r: 52, c: VIOLET, k: 0.7 }]),
    bulbs: shade(bar, [{ x: ax0, y: ay0, r: 42, c: BULB, k: 1.3 }]),
    tube: shade(bar, [{ x: TUBE.x + 15, y: TUBE.y + 3, r: 46, sy: 1.3, c: COLD, k: 1.5, up: 0.2 }]),
  };
  // ground
  const gr = buildGround();
  S.grAlb = gr;
  const gstat = [
    { x: 196, y: GY + 1, r: 36, sy: 2.6, c: WARM, k: 1.1 },
    { x: WIN.x + 22, y: GY + 1, r: 40, sy: 3, c: WARM, k: 0.6 },
    { x: 277, y: GY, r: 44, sy: 2.4, c: [1, 0.8, 0.5], k: 0.9 },
    { x: LAMP.x + 4, y: 204, r: 100, sy: 1.6, c: AMBER, k: 1.2 },
    { x: LAMP.x - 4, y: 158, r: 70, sy: 2, c: AMBER, k: 0.7 },
    { x: BOOTH.x + 6, y: BOOTH.y, r: 30, sy: 2.2, c: BOOTHC, k: 1 },
  ];
  S.grLit = shade(gr, gstat, AMB, (y) => 0.9 - 0.3 * smooth(160, 216, y));
  S.grPass = {
    pink: shade(gr, [{ x: px0, y: GY - 6, r: 104, sy: 2.1, c: PINK, k: 1.25 }]),
    cyan: shade(gr, [{ x: cx0, y: GY - 6, r: 64, sy: 2.3, c: CYAN, k: 1.0 }]),
    violet: shade(gr, [{ x: 205, y: GY - 6, r: 80, sy: 2.2, c: VIOLET, k: 0.45 }]),
    bulbs: shade(gr, [{ x: ax0 - 6, y: GY, r: 40, sy: 2.2, c: BULB, k: 1 }]),
    tube: shade(gr, [{ x: TUBE.x + 15, y: GY, r: 40, sy: 2.5, c: COLD, k: 0.6 }]),
  };
  const props = buildProps();
  S.propLit = shade(props, gstat.concat([{ x: HYD.x, y: 140, r: 30, c: WARM, k: 0.2 }]), AMB);
  S.propPass = {
    pink: shade(props, [{ x: px0, y: py0, r: 96, c: PINK, k: 1.4 }]),
    cyan: shade(props, [{ x: cx0, y: cy0, r: 76, c: CYAN, k: 1.2 }]),
    bulbs: shade(props, [{ x: ax0, y: ay0, r: 52, c: BULB, k: 1.2 }]),
  };
  S.boothGlow = buildBoothGlow();
  // reflections: long smears down the wet ground, one per light that lives, summed per frame into tmpRefl
  const L = (x0, x1, c, k, yc, s, soft, w) => ({ x0, x1, y0: GY + 2, yc, s, c, k, soft, w });
  const ry = GY + MY, crop = (c) => cropTo(c, 0, ry, CW, CH);
  S.refl = {
    warm: crop(buildRefl([
      L(WIN.x, WIN.x + WIN.w, WARM, 0.3, 176, 22), L(186, 193, WARM, 0.75, 172, 26), L(199, 206, WARM, 0.75, 172, 26),
      L(182, 210, WARM, 0.3, 162, 8), L(275, 279, [1, 0.8, 0.5], 0.75, 174, 28), L(LAMP.x - 9, LAMP.x + 9, AMBER, 0.85, 200, 26),
      L(305, 309, WARM, 0.25, 170, 12), L(BOOTH.x + 1, BOOTH.x + BOOTH.w - 1, BOOTHC, 0.45, 170, 18),
    ])),
    tube: crop(buildRefl([L(TUBE.x, TUBE.x + TUBE.w, COLD, 0.45, 172, 22)])),
  };
  const sg = (k, c, kk, yc) => [L(REFL_SPAN[k][0], REFL_SPAN[k][1], c, kk, yc, 34, 1, S.sign.cols[k]), L(REFL_SPAN[k][0] - 3, REFL_SPAN[k][1] + 3, c, kk * 0.18, yc + 4, 30, 6)];
  S.refl.BA = crop(buildRefl(sg('BA', PINK, 1, 186)));
  S.refl.R = crop(buildRefl(sg('R', PINK, 1, 186)));
  S.refl.glass = crop(buildRefl(sg('glass', CYAN, 0.9, 186)));
  S.refl.border = crop(buildRefl(sg('border', VIOLET, 0.35, 188)));
  S.refl.bulbs = crop(buildRefl(sg('bulbs', BULB, 0.6, 176)));
  S.tmpRefl = canvas(CW, CH - ry);
  // foreground
  S.fg = buildFg();
  S.fgPink = buildFgNeon('255,42,109', 1);
  S.fgCyan = buildFgNeon('5,217,232', 0.3);
  S.beads = buildCarBeads();
  S.cone = buildCone();
  S.glowWarm = glowSprite('255,170,80');
  S.glowPink = glowSprite('255,42,109');
  S.glowRed = glowSprite('255,40,40');
  S.glowCyan = glowSprite('5,217,232');
  S.glowWhite = glowSprite('255,250,240');
  S.glowLilac = glowSprite('200,170,255');
  S.puff = glowSprite('205,175,215', 32);
  S.glowCold = glowSprite('160,255,210');
  S.winBase = buildWinBase();
  S.win = canvas(WIN.w, WIN.h);
  S.man = buildDoorman();
  S.rain = buildRain();
  S.tmpBar = canvas();
  S.tmpGr = canvas();
  S.tmpMask = canvas();
  const v = canvas(LW, LH), vg = v.g.createRadialGradient(LW / 2, LH * 0.5, LH * 0.38, LW / 2, LH * 0.5, LW * 0.62);
  vg.addColorStop(0, 'rgba(4,1,8,0)'); vg.addColorStop(1, 'rgba(4,1,8,0.65)');
  v.g.fillStyle = vg; v.g.fillRect(0, 0, LW, LH);
  S.vignette = v.c;
  return S;
}

// window of the bar: warm light, blinds, the shadows of the people inside, the rain running down the glass
function drawWindow(S, t) {
  const g = S.win.g, { w, h } = WIN;
  g.drawImage(S.winBase, 0, 0);
  const people = [[8, 0.21, 0], [21, 0.13, 2], [34, 0.17, 4.1]];
  g.fillStyle = 'rgba(64,20,8,0.6)';
  people.forEach(([x0, sp, ph], i) => {
    const x = Math.round(x0 + Math.sin(t * sp + ph) * 5 + Math.sin(t * sp * 2.7 + ph) * 1.5);
    const y = 8 + (i === 1 ? 2 : 0) + Math.round(Math.sin(t * 0.9 + ph) * 0.6);
    g.fillRect(x - 1, y, 4, 5); g.fillRect(x - 2, y + 1, 6, 3);           // head
    g.fillRect(x, y + 5, 2, 1);                                           // neck
    g.fillRect(x - 4, y + 6, 10, 12); g.fillRect(x - 5, y + 8, 12, 10);  // shoulders
    if (i === 2 && Math.sin(t * 0.4) > 0.6) g.fillRect(x + 6, y + 1, 2, 7);
  });
  for (let y = 0; y < h - 7; y += 3) { g.fillStyle = 'rgba(60,24,8,0.7)'; g.fillRect(0, y, w, 1); g.fillStyle = 'rgba(255,220,170,0.07)'; g.fillRect(0, y + 1, w, 1); }
  g.fillStyle = '#4a2410'; g.fillRect(0, h - 8, w, 2);
  g.fillStyle = 'rgba(30,10,4,0.55)'; g.fillRect(0, h - 3, w, 3);
  drawWindowWater(g, t);
}

// a band of headlight sweeping a layer: its albedo, cut to a slanted moving band, added on top
function sweep(S, sw, alb, g, k, ground) {
  const m = S.tmpMask.g;
  m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1;
  m.clearRect(0, 0, CW, CH);
  m.drawImage(alb, 0, 0);
  m.globalCompositeOperation = 'destination-in';
  const c = -80 + (LW + 160) * (sw.dir > 0 ? sw.p : 1 - sw.p) + M;
  const gr = m.createLinearGradient(c - 60, 0, c + 60, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${sw.a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = gr;
  m.setTransform(1, 0, ground ? 0 : -0.25, 1, ground ? 0 : 40, 0);
  m.fillRect(-200, 0, CW + 400, CH);
  m.setTransform(1, 0, 0, 1, 0, 0);
  // the lamp post's shadow, thrown across the band
  m.globalCompositeOperation = 'destination-out';
  m.fillStyle = 'rgba(0,0,0,0.85)';
  m.fillRect(c - 8 + (sw.dir > 0 ? -1 : 1) * 10, 0, 3, CH);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = k;
  g.drawImage(S.tmpMask.c, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

const cam = { x: 0, y: 0, t: -1 };
let S = null;

// ---------------------------------------------------------------- per frame
// t: seconds; mouse: { x, y } in canvas pixels, or null
// texts: false leaves the title's lines out (drawTitleTexts draws them, over what is put on the picture)
export function drawTitleScene(ctx, W, H, t, mouse, texts = true) {
  if (!S) S = build();
  // eased mouse + idle sway -> camera offset in about [-1, 1]
  const nx = mouse ? clamp(mouse.x / W * 2 - 1, -1, 1) : 0, ny = mouse ? clamp(mouse.y / H * 2 - 1, -1, 1) : 0;
  if (cam.t < 0 || t < cam.t || t - cam.t > 1) { cam.x = nx; cam.y = ny; }
  else { const k = 1 - Math.exp(-(t - cam.t) * 2.2); cam.x += (nx - cam.x) * k; cam.y += (ny - cam.y) * k; }
  cam.t = t;
  const vx = cam.x + Math.sin(t * 0.19) * 0.16 + Math.sin(t * 0.083 + 1) * 0.1, vy = cam.y + Math.sin(t * 0.13 + 2) * 0.12;
  const sx = (f) => -f * vx * RX, sy = (f) => -f * vy * RY;
  const N = signState(t), bulbs = bulbState(t), sw = sweepState(t), wind = windState(t), sky = lightningState(t), tube = tubeState(t);
  const pinkA = (2 * N.main + N.R) / 3, lit = bulbs.reduce((a, b) => a + b, 0) / bulbs.length;
  const R = S.rain;
  rainFrame(R, t, wind, { pink: pinkA, cyan: N.glass, violet: N.border, bulbs: lit, tube, one: 1 });

  ctx.save();
  const sc = Math.max(W / LW, H / LH);
  ctx.setTransform(sc, 0, 0, sc, (W - LW * sc) / 2, (H - LH * sc) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 1. sky (with the city's haze), stars, clouds; far sheet lightning brightens them behind the skyline
  ctx.drawImage(S.sky, 0, 0, LW, HIDDEN, 0, 0, LW, HIDDEN);
  const co = (t * (1.6 + wind.speed * 1.2)) % (LW * 2);
  ctx.drawImage(S.clouds, 0, 0, LW * 2, HIDDEN, -co, 0, LW * 2, HIDDEN); ctx.drawImage(S.clouds, 0, 0, LW * 2, HIDDEN, LW * 2 - co, 0, LW * 2, HIDDEN);
  if (sky.flash > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = sky.flash * 0.35; ctx.drawImage(S.flash, 0, 0, LW, 130, 0, 0, LW, 130);
    ctx.globalAlpha = sky.flash * 0.8; ctx.drawImage(S.glowLilac, sky.x - 110, -40, 220, 170);
    ctx.globalAlpha = Math.min(1, sky.flash * 2.5); ctx.drawImage(S.clouds, -co, 0); ctx.drawImage(S.clouds, LW * 2 - co, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.max(0, Math.sin(t * (0.7 + hash(i) * 1.3) + i * 3));
    ctx.fillStyle = `rgba(255,240,250,${(a * 0.8).toFixed(3)})`;
    ctx.fillRect(Math.floor(hash(i + 0.3) * LW), Math.floor(hash(i + 0.6) * 56), 1, 1);
  }

  // 2. far skyline, its windows going on and off, the mast light
  const ox = sx(F.far), oy = sy(F.far);
  put(ctx, S.far, ox - M, oy - MY);
  S.farWins.forEach(([x, y], i) => {
    if (hash(Math.floor(t / (3 + (i % 5))) * 7 + i) < 0.5) return;
    ctx.fillStyle = i % 3 ? 'rgba(235,170,90,0.75)' : 'rgba(170,210,255,0.6)';
    ctx.fillRect(x + ox, y + oy, 1, 1);
  });
  if (Math.sin(t * 2.4) > 0.1) {
    ctx.fillStyle = '#ff4040'; ctx.fillRect(22 + ox, 7 + oy, 1, 1);
    ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
    ctx.drawImage(S.glowRed, 22.5 + ox - 7, 7.5 + oy - 7, 14, 14);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  }

  // 3. mid row, the palm whipping in the wind
  const mx = sx(F.mid), my = sy(F.mid);
  put(ctx, S.mid.top, mx - M, my - MY); put(ctx, S.mid.alley, mx - M, my - MY);
  drawFronds(ctx, t, wind, mx, my);

  // 4. the bar row, composed at low res then blitted
  const bg = S.tmpBar.g;
  bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1;
  bg.clearRect(0, 0, CW, CH);
  bg.drawImage(S.barLit, 0, 0);
  bg.globalCompositeOperation = 'lighter';
  const pass = (g, c, a, dx = 0, dy = 0) => { if (c && a > 0.01) { g.globalAlpha = a; put(g, c, dx, dy); } };
  pass(bg, S.barPass.pink, pinkA); pass(bg, S.barPass.cyan, N.glass); pass(bg, S.barPass.violet, N.border);
  pass(bg, S.barPass.bulbs, lit); pass(bg, S.barPass.tube, tube);
  bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1;
  drawSignLit(bg, S.sign, N, bulbs);
  if (sw) sweep(S, sw, S.barAlb, bg, 1.2, 0);
  // live windows: the bar's, the portholes (someone passes behind now and then), a TV and a lamp next door
  drawWindow(S, t);
  bg.drawImage(S.win.c, WIN.x + M, WIN.y + MY);
  const pas = (t % 6.3) / 0.9;
  for (const [cx, i] of [[189, 0], [202, 1]]) {
    const dark = pas > i * 0.35 && pas < i * 0.35 + 0.5;
    bg.fillStyle = dark ? '#5a2410' : '#ffb45c';
    bg.beginPath(); bg.arc(cx + 0.5 + M, 121.5 + MY, 3, 0, Math.PI * 2); bg.fill();
    bg.fillStyle = dark ? '#3a1408' : '#ffe0a8'; bg.fillRect(cx - 1 + M, 119 + MY, 2, 1);
  }
  bg.fillStyle = '#ffb45c'; bg.fillRect(196 + M, 113 + MY, 1, 2); bg.fillRect(183 + M, GY - 1 + MY, 26, 1);
  const tv = hash(Math.floor(t * 7));
  bg.fillStyle = `rgba(${90 + tv * 80},${130 + tv * 70},${220 + tv * 35},${0.45 + tv * 0.35})`;
  bg.fillRect(42 + M, 50 + MY, 10, 14);
  bg.fillStyle = 'rgba(10,8,20,0.6)'; bg.fillRect(42 + M, 56 + MY, 10, 1);
  bg.fillStyle = '#a85c30'; bg.fillRect(-2 + M, 74 + MY, 6, 14);
  bg.fillStyle = '#d08040'; bg.fillRect(0 + M, 77 + MY, 3, 8);
  bg.fillStyle = '#ffe2a0'; bg.fillRect(276 + M, 109 + MY, 3, 2);
  bg.fillStyle = tube > 0.5 ? '#e8fff0' : '#5a6a64'; bg.fillRect(TUBE.x + M, TUBE.y + MY, TUBE.w, 1);
  bg.fillStyle = '#c87a3a'; bg.fillRect(368 + M, 56 + MY, 10, 14);
  bg.fillStyle = '#7a3c1c'; for (let y = 0; y < 7; y += 2) bg.fillRect(368 + M, 56 + MY + y, 10, 1);
  bg.fillStyle = '#e8a050'; bg.fillRect(368 + M, 64 + MY, 10, 6);
  const sh = Math.round(Math.sin(t * 0.17) * 3);
  bg.fillStyle = 'rgba(60,20,8,0.7)'; bg.fillRect(372 + sh + M, 63 + MY, 3, 7); bg.fillRect(373 + sh + M, 62 + MY, 2, 1);
  // the street's life on the bar row, the wind's work, the water running off everything
  drawCat(bg, t);
  drawPigeon(bg, t, wind);
  drawBag(bg, t, wind);
  drawValance(bg, t, wind);
  const ember = drawDoorman(bg, S.man, t, wind);
  drawRat(bg, t);
  drawBarWater(bg, t, wind, R.density);
  drawSplashes(R, 'bar', bg, M, MY);
  drawCable(bg, t, wind);
  // the far rain falls behind all that: drawn under what is there, it shows in the gaps (sky, alley)
  bg.globalCompositeOperation = 'destination-over';
  drawRain(R, 'far', bg, M, MY);
  bg.globalCompositeOperation = 'source-over';
  const bx = sx(F.bar), by = sy(F.bar), top = MY - 6, rows = GY + 8;
  ctx.drawImage(S.tmpBar.c, 0, top, CW, rows, bx - M, top + by - MY, CW, rows);
  drawSmoke(ctx, t, wind, bx, by);
  // the sign's halos, and with them the glows of the neon and of the warm lamps around it
  drawSignFx(ctx, S.sign, N, bulbs, wind, R.density, t, bx, by, S.glowWhite, [
    [S.glowPink, pinkA * 0.18, 132, 44, 120, 84], [S.glowCyan, N.glass * 0.1, SIGN_LIGHT.cyan[0] - 28, SIGN_LIGHT.cyan[1] - 24, 56, 48],
    [S.glowWarm, 0.55, 268.5, 101, 18, 18], [S.glowWarm, 0.28, 182.5, 114.5, 14, 14], [S.glowWarm, 0.28, 195.5, 114.5, 14, 14],
    [S.glowWarm, 0.16, WIN.x - 10, 99, 64, 44], [S.glowWarm, ember.draw ? 0.75 : 0.3, ember.x - 2, ember.y - 2, 5, 5],
  ]);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 * tube; ctx.drawImage(S.glowCold, TUBE.x - 8 + bx, TUBE.y - 7 + by, TUBE.w + 16, 14);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;

  // 5. ground: composed at low res (lit + light passes + shimmering reflections + rain on it), blitted row by row
  const gg = S.tmpGr.g, rr = S.tmpRefl.g, ry = GY + MY;
  rr.globalCompositeOperation = 'copy'; rr.globalAlpha = 1;   // copy: the layer is partly transparent, nothing of the last frame may stay under it
  rr.drawImage(S.refl.warm, 0, 0);
  rr.globalCompositeOperation = 'lighter';
  pass(rr, S.refl.tube, tube, 0, -ry); pass(rr, S.refl.BA, N.main, 0, -ry); pass(rr, S.refl.R, N.R, 0, -ry);
  pass(rr, S.refl.glass, N.glass, 0, -ry); pass(rr, S.refl.border, N.border, 0, -ry); pass(rr, S.refl.bulbs, lit, 0, -ry);
  gg.globalCompositeOperation = 'source-over'; gg.globalAlpha = 1;
  gg.drawImage(S.grLit, 0, 0);
  gg.globalCompositeOperation = 'lighter';
  pass(gg, S.grPass.pink, pinkA); pass(gg, S.grPass.cyan, N.glass); pass(gg, S.grPass.violet, N.border);
  pass(gg, S.grPass.bulbs, lit); pass(gg, S.grPass.tube, tube);
  const tremble = 1 + 1.6 * wind.gust;
  for (let y = ry; y < CH; y++) {
    const ly = y - MY, amp = (ly < ROAD ? 0.3 : 0.6 + (ly - ROAD) * 0.03) * tremble;
    const o = Math.round(Math.sin(ly * 0.21 + t * 1.9) * amp + (hash(ly * 3.1 + Math.floor(t * 10) * 1.37) - 0.5) * amp * 1.4);
    gg.globalAlpha = 0.8 + 0.2 * hash(ly * 1.7 + Math.floor(t * 7) * 2.3);
    gg.drawImage(S.tmpRefl.c, 0, y - ry, CW, 1, o, y, CW, 1);
  }
  gg.globalCompositeOperation = 'source-over'; gg.globalAlpha = 1;
  if (sw) sweep(S, sw, S.grAlb, gg, 0.9, 1);
  drawGroundWater(R, gg);
  drawSplashes(R, 'ground', gg, M, MY);
  for (let y = GY; y < LH + MY; y++) {     // in perspective: each row shifted by its own parallax
    const f = rowF(y);
    ctx.drawImage(S.tmpGr.c, 0, y + MY, CW, 1, sx(f) - M, y + sy(f), CW, 1.08);
  }
  // props at the kerb: hydrant, phone booth (lit from inside, rain running on its glass), parking meter
  const pf = rowF(HYD.y), hx = sx(pf) - M, hy = sy(pf) - MY;
  put(ctx, S.propLit, hx, hy);
  ctx.globalCompositeOperation = 'lighter';
  pass(ctx, S.propPass.pink, pinkA, hx, hy); pass(ctx, S.propPass.cyan, N.glass, hx, hy); pass(ctx, S.propPass.bulbs, lit, hx, hy);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  put(ctx, S.boothGlow, hx, hy);
  ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
  ctx.drawImage(S.glowWhite, BOOTH.x - 10 + hx + M, BOOTH.y - BOOTH.h - 6 + hy + MY, BOOTH.w + 20, BOOTH.h + 14);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  drawBoothWater(ctx, t, hx + M, hy + MY);
  drawSteam(ctx, S.puff, t, wind, bx, by);
  drawPapers(ctx, t, wind, sx, sy);

  // 6. foreground: car rear (beads on it, rain bouncing off it), lamp post, cone, moths; then the rain in front of
  // the facades and of the car (the curtains of a gust in it)
  const fx = sx(F.fg), fy = sy(F.fg);
  put(ctx, S.fg.car, fx - M, fy - MY); put(ctx, S.fg.lamp, fx - M, fy - MY);
  ctx.globalCompositeOperation = 'lighter';
  pass(ctx, S.fgPink, pinkA, fx - M, fy - MY); pass(ctx, S.fgCyan, N.glass, fx - M, fy - MY);
  ctx.fillStyle = `rgba(255,42,109,${(0.45 * pinkA).toFixed(3)})`; ctx.fillRect(LAMP.x + 26 + fx, 50 + fy, 1, LH);   // the pole's rim
  ctx.globalCompositeOperation = 'source-over';
  pass(ctx, S.beads, 0.5 + 0.5 * pinkA, fx - M, fy - MY);
  ctx.globalAlpha = 1;
  drawCarWater(ctx, t, fx, fy);
  drawSplashes(R, 'fg', ctx, fx, fy);
  drawMist(R, ctx, fx, fy, sx(rowF(205)), sy(rowF(205)));
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.6; ctx.drawImage(S.cone, S.cone.ox * 2 + fx, fy, S.cone.width * 2, LH);
  ctx.globalAlpha = 0.9; ctx.drawImage(S.glowWarm, LAMP.x + fx - 14, LAMP.y + fy - 10, 28, 22);
  ctx.globalAlpha = 0.3; ctx.drawImage(S.glowWarm, LAMP.x + fx - 40, LAMP.y + fy - 28, 80, 64);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffe6b0'; ctx.fillRect(LAMP.x - 9 + fx, LAMP.y + fy, 18, 1);
  for (let i = 0; i < 3; i++) {
    const a = t * (2.1 + i * 0.7) + i * 2;
    const x = LAMP.x + Math.sin(a) * (5 + i * 2) + Math.sin(a * 2.7) * 2, y = LAMP.y + 4 + Math.cos(a * 1.3) * 3 + Math.sin(a * 3.1) * 2 + i;
    ctx.fillStyle = '#fff2d8'; ctx.fillRect(Math.round(x) + fx, Math.round(y) + fy, 1, 1);
  }
  ctx.globalCompositeOperation = 'source-over';
  drawFrontRain(R, ctx, sx(0.17), sy(0.17), fx, fy);
  if (sw) {
    const g2 = ctx.createLinearGradient(0, 0, LW, 0), c0 = sw.dir > 0 ? sw.p : 1 - sw.p;
    g2.addColorStop(clamp(c0 - 0.3, 0, 1), 'rgba(255,240,210,0)');
    g2.addColorStop(clamp(c0, 0, 1), `rgba(255,240,210,${0.05 * sw.a})`);
    g2.addColorStop(clamp(c0 + 0.3, 0, 1), 'rgba(255,240,210,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g2; ctx.fillRect(0, 0, LW, LH);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(S.vignette, 0, 0);
  ctx.restore();

  if (texts) drawTexts(ctx, W, H, t);
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
