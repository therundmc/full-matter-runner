// The opening. The title screen is the street seen from a window (drawTitleView: ui/cine/Pane.js over
// ui/TitleScene.js): his. NEW GAME pulls the camera back from that window into his bedroom (ui/cine/Room.js), where
// he sleeps; the street goes soft and coarse behind the wet glass as it becomes a part of the room. Then the night
// goes wrong, told like a comic (ui/cine/Panels.js). He ran packages for the man who owns the bar for six years and
// kept every dollar under his floor, to leave town: boards torn up in the next room, his eye opens; the building's
// super shouts at the front door and a shot cuts him off; a page: the tin box lifted out of the hole, the notes
// counted, the super on his face in the doorway, a match over the petrol, "TORCH IT." Back in the bedroom the petrol
// runs under his door and goes up; he gets up, puts on his coat, his cap and his satchel, and the view tips over onto
// the floor plan: the tutorial. Everything is a function of t (s since NEW GAME): cineView() is the timeline as plain
// numbers (unit-tested), drawCinematic() the picture, cineBeats() what is heard.
import { PALETTE } from '../Config.js';
import { LW, LH } from './title/Draw.js';
import { drawTitleScene, drawTitleTexts } from './TitleScene.js';
import { text } from './Text.js';
import { drawPane } from './cine/Pane.js';
import { paintRoom, paintFore, WIN, DOOR, FM } from './cine/Room.js';
import { drawPanel, caption, balloon, paintEye, paintHole, paintCash, paintSuper, paintMatch } from './cine/Panels.js';
import { clamp, smooth, lerp, hash, tone } from './cine/Ink.js';

export const CINE = {
  zoom: LW / WIN.w,       // the window fills the screen on the title: that much bigger than it is in the room
  pull: 2.4,              // s the camera takes to pull back into the room
  // from here on, s into the room (after the pull):
  thump: 0.7,             // boards torn up in the next room
  eye: [1.0, 2.4],        // the panel of his eye: in, out
  eyeOpen: 1.3,
  voice: [2.5, 3.8],      // the super at the front door, shouting ...
  shot: 3.8,              // ... until a shot cuts him off
  page: [4.3, 10.3],      // the comic page, on black
  panels: [4.3, 5.6, 6.9, 8.2],
  says: 8.9,              // "TORCH IT."
  gas: 10.3,              // back in the bedroom: the petrol runs under his door ...
  fire: 11.0,             // ... and goes up
  rise: [10.8, 13.6],     // he sits up, gets up, dresses
  tiltAt: 13.9,           // the view tips ...
  tilt: 1.1,              // ... for that long
  skipAfter: 0.3,         // s after which a key or a click goes straight to the game
  date: 'SUNSET BAY  -  MARCH 14TH 1986  -  1:05 AM',
  shout: "HEY! WHAT'S ALL THAT RACKET",
  captions: ['SIX YEARS OF RUNS.', 'EVERY DOLLAR OF IT.', 'THE SUPER HEARD THEM.'],
  line: ['TORCH IT.', "HE'S IN THE BACK."],
};
export const CINE_END = CINE.pull + CINE.tiltAt + CINE.tilt;
const DRESS = 0.91; // how far through getting up he takes his coat off the hook (Room.paintMan)

// The timeline at t: zoom (the window's picture: CINE.zoom on the title, 1 in the room), logo (what is left of the
// title's texts), rt (s into the room, negative during the pull), rise (0..1 out of bed and dressed), page (the comic
// page is up), gas, fire (0..1 under his door), tilt (0..1 how far the view has tipped onto the floor plan), over.
export function cineView(t, C = CINE) {
  const k = clamp(t / C.pull, 0, 1), e = k * k * k * (k * (6 * k - 15) + 10), rt = t - C.pull;
  return {
    zoom: Math.exp(Math.log(C.zoom) * (1 - e)),
    logo: 1 - smooth(t / 0.5),
    rt,
    rise: clamp((rt - C.rise[0]) / (C.rise[1] - C.rise[0]), 0, 1),
    page: rt >= C.page[0] && rt < C.page[1],
    gas: clamp((rt - C.gas) / 1.0, 0, 1),
    fire: clamp((rt - C.fire) / 1.2, 0, 1),
    tilt: smooth((rt - C.tiltAt) / C.tilt),
    over: rt >= C.tiltAt + C.tilt,
  };
}

// what is heard between t0 and t1: [{ name, vol, opts }] for Audio.play
export function cineBeats(t0, t1, C = CINE) {
  const P = C.pull, cues = [
    ...[0.1, 4.5, 9, 13.5].map((at) => [at, 'air', 1, { inside: 1 }]),
    [P + C.thump, 'woodBreak', 0.8], [P + C.thump + 0.05, 'door', 0.5],
    [P + C.voice[0], 'shout', 1],
    [P + C.shot, 'pistol', 0.9], [P + C.shot + 0.35, 'bodyFall', 0.7],
    [P + C.rise[0], 'getUp', 0.5],
    [P + C.fire, 'ignite', 1],
    ...[0.5, 1.2, 1.9].map((d) => [P + C.fire + d, 'crackle', 1]),
    [P + lerp(C.rise[0], C.rise[1], DRESS), 'pickup', 0.8],
  ];
  return cues.filter(([at]) => t0 < at && t1 >= at).map(([, name, vol, opts]) => ({ name, vol, opts: opts || {} }));
}

// ---------------------------------------------------------------- the title: the street, from his window
export function drawTitleView(ctx, W, H, t, mouse, logo = 1) {
  drawTitleScene(ctx, W, H, t, mouse, false);
  const sc = Math.max(W / LW, H / LH);
  ctx.save();
  ctx.setTransform(sc, 0, 0, sc, (W - LW * sc) / 2, (H - LH * sc) / 2);
  ctx.imageSmoothingEnabled = false;
  drawPane(ctx, t);
  ctx.restore();
  drawTitleTexts(ctx, W, H, t, logo);
}

// ---------------------------------------------------------------- the picture
let pane = null, low = null; // the window's view on a canvas of its own, and brought down to the room's pixels

function scratch(old, w, h) {
  if (old && old.c.width === w && old.c.height === h) return old;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d') };
}

// words in the comic's lettering, at a point of the picture's logical px
function letter(ctx, str, at, x, y, size, col, opts = {}) {
  const [sx, sy, sc] = at;
  text(ctx, str, sx + x * sc, sy + y * sc, size * sc, col, opts);
}

// world(g, W, H) paints the game seen from above on a W x H canvas; buf: such a canvas { c, g } kept by the caller
export function drawCinematic(ctx, W, H, t, world, buf) {
  const v = cineView(t), C = CINE, rt = v.rt;
  const sc = Math.max(W / LW, H / LH), ox = (W - LW * sc) / 2, oy = (H - LH * sc) / 2, at = [ox, oy, sc];
  const logical = () => { ctx.setTransform(sc, 0, 0, sc, ox, oy); ctx.imageSmoothingEnabled = false; };
  const screen = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  screen();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  const flash = rt >= C.shot && rt < C.shot + 0.09, black = rt >= C.shot + 0.09 && rt < C.page[0];
  const shouting = rt >= C.voice[0] && rt < C.shot;

  if (!v.page && !black && !flash && v.tilt < 1) {
    // the window's view on its own canvas, brought down to the room's coarse pixels and fogged as the camera pulls
    // back: on the title it is the whole picture, in the room a part of the wall
    pane = scratch(pane, W, H);
    drawTitleView(pane.g, W, H, t, null, v.logo);
    const k = (v.zoom - 1) / (C.zoom - 1), sw = Math.min(W, (H * LW) / LH), sh = (sw * LH) / LW;
    const f = 1 + (sw / WIN.w - 1) * k ** 1.5;
    low = scratch(low, Math.max(WIN.w, Math.round(WIN.w * f)), Math.max(WIN.h, Math.round(WIN.h * f)));
    const lg = low.g;
    lg.imageSmoothingEnabled = true;
    lg.imageSmoothingQuality = 'high';
    lg.drawImage(pane.c, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, low.c.width, low.c.height);
    lg.fillStyle = `rgba(14,10,34,${(0.38 * (1 - k)).toFixed(3)})`;
    lg.fillRect(0, 0, low.c.width, low.c.height);
    lg.fillStyle = `rgba(170,160,210,${(0.1 * (1 - k)).toFixed(3)})`;
    lg.fillRect(0, 0, low.c.width, low.c.height);

    const knock = rt >= C.thump ? Math.exp(-(rt - C.thump) * 9) : 0;
    const jolt = knock * 5 + (shouting ? 1.2 : 0) + v.fire * 0.6;
    const s = H / 720, shx = (hash(Math.floor(t * 60)) - 0.5) * jolt * s, shy = (hash(Math.floor(t * 60) + 9) - 0.5) * jolt * s;
    const S = sc * v.zoom, flat = 1 - v.tilt, wx = WIN.x + WIN.w / 2, wy = WIN.y + WIN.h / 2;
    // the window is the whole screen on the title, and goes to its place in the wall as the camera pulls back; as
    // the view tips the wall shrinks toward the top of the screen
    const cx = lerp(ox + wx * sc, W / 2, k), cy = lerp(oy + wy * sc, H / 2, k);
    ctx.setTransform(S, 0, 0, S * flat, cx - wx * S + shx, (cy - wy * S) * flat + shy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low.c, WIN.x, WIN.y, WIN.w, WIN.h);
    ctx.drawImage(paintRoom({
      t, rise: v.rise, knock, gas: v.gas, fire: v.fire,
      beat: 0.6 + 0.4 * Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1),
      feet: v.gas > 0 && v.fire < 0.3 ? [6 + Math.sin(t * 3) * 2, 25] : [],
    }), 0, 0);
    // the near plane: closer, so it moves more as the camera pulls back, and drifts a little after
    const Sf = sc * (1 + (v.zoom - 1) * 1.7), drift = Math.sin(Math.max(0, rt) * 0.3) * 3;
    ctx.setTransform(Sf, 0, 0, Sf * flat, cx - wx * Sf + shx + drift * sc, (cy - wy * Sf) * flat + shy);
    ctx.drawImage(paintFore(), -FM, 0);
    screen();

    // his eye, in a panel over the bed
    const E = C.eye, ek = clamp((rt - E[0]) / 0.25, 0, 1) * clamp((E[1] - rt) / 0.2, 0, 1);
    if (ek > 0 && v.tilt <= 0) {
      logical();
      const open = rt < C.eyeOpen ? 0 : Math.min(1, (rt - C.eyeOpen) / 0.07);
      drawPanel(ctx, { x: 204, y: 18, w: 150, h: 58 }, ek, (g, w, h) => paintEye(g, w, h, open, open ? 0.8 + Math.sin(rt * 9) * 0.2 : 0, rt));
      screen();
    }
    // the date, typed at the foot of the picture while nothing has happened yet
    if (t > 0.9 && rt < C.voice[0]) {
      const a = clamp((C.voice[0] - rt) / 0.4, 0, 1);
      letter(ctx, C.date.slice(0, Math.floor((t - 0.9) * 26)), at, 12, LH - 12, 5, PALETTE.white, { align: 'left', alpha: a });
    }
    // what is heard, written the way comics write it
    if (rt >= C.thump && rt < C.thump + 0.8) {
      const u = (rt - C.thump) / 0.8;
      letter(ctx, 'KRRAK', at, DOOR.x - 30 + (hash(Math.floor(t * 30)) - 0.5) * 2, DOOR.y + 10 - u * 5, 15 + 5 * Math.min(1, u * 6), PALETTE.yellow, { rot: -0.14, alpha: clamp((1 - u) * 3, 0, 1) });
    }
    if (shouting) {
      // the super's voice through the wall: a balloon from the door, the words coming as he says them
      const n = Math.floor((rt - C.voice[0]) * 20) + 1, str = C.shout.slice(0, n);
      logical();
      const jx = (hash(Math.floor(t * 20)) - 0.5) * 2;
      balloon(ctx, 176 + jx, 20, 152, 28, DOOR.x + 6, DOOR.y + 30);
      screen();
      letter(ctx, str + (n >= C.shout.length ? '-' : ''), at, 252 + jx, 34, 5.6, '#140c10', { outline: false, shadow: null });
    }
    if (v.gas > 0 && v.fire <= 0) letter(ctx, 'GLUG  GLUG', at, DOOR.x - 6, DOOR.y + DOOR.h + 22, 8, '#c89a50', { rot: 0.06, alpha: clamp((C.fire - rt) * 4, 0, 1) });
    if (rt >= C.fire && rt < C.fire + 0.9) {
      const u = (rt - C.fire) / 0.9;
      letter(ctx, 'WHOOMPF', at, DOOR.x - 8, DOOR.y + 40 - u * 10, 18 + 10 * Math.min(1, u * 5), '#ff8a2a', { rot: -0.1, alpha: clamp((1 - u) * 3, 0, 1) });
    }
  }

  if (flash) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    letter(ctx, 'BLAM', at, LW / 2, LH / 2, 64, '#05030a', { outline: false, shadow: null, rot: -0.06 });
  }

  if (v.page) {
    // the page: four panels on black, dropping in one after the other, going together
    const out = clamp((C.page[1] - rt) / 0.3, 0, 1), k = (i) => clamp((rt - C.panels[i]) / 0.3, 0, 1) * out;
    const R = [{ x: 12, y: 12, w: 178, h: 94 }, { x: 198, y: 12, w: 174, h: 94 }, { x: 12, y: 114, w: 150, h: 90 }, { x: 170, y: 114, w: 202, h: 90 }];
    logical();
    tone(ctx, '#140a14', 0, 0, LW, LH, 0.25);
    drawPanel(ctx, R[0], k(0), (g, w, h) => paintHole(g, w, h, rt));
    drawPanel(ctx, R[1], k(1), (g, w, h) => paintCash(g, w, h, rt));
    drawPanel(ctx, R[2], k(2), (g, w, h) => paintSuper(g, w, h, rt, (rt - C.panels[2] - 0.3) / 1.6));
    drawPanel(ctx, R[3], k(3), (g, w, h) => paintMatch(g, w, h, rt));
    // the captions, as each panel settles
    ctx.font = `${Math.round(5 * sc)}px joystix, monospace`;
    const boxes = C.captions.map((str, i) => [i, str, ctx.measureText(str).width / sc + 6]);
    for (const [i, , w] of boxes) if (k(i) >= 1) caption(ctx, R[i].x + 3, R[i].y + 3, w, 10);
    const said = rt >= C.says;
    if (said) balloon(ctx, R[3].x + 44, R[3].y + 5, 96, 32, R[3].x + 134, R[3].y + 44);
    screen();
    for (const [i, str, w] of boxes) {
      if (k(i) >= 1) letter(ctx, str, at, R[i].x + 3 + w / 2, R[i].y + 8.5, 5, '#140c10', { outline: false, shadow: null, alpha: out });
    }
    if (said) {
      const n = Math.floor((rt - C.says) * 24);
      C.line.forEach((l, j) => {
        const before = C.line.slice(0, j).join('').length;
        letter(ctx, l.slice(0, Math.max(0, n - before)), at, R[3].x + 92, R[3].y + 16 + j * 10, 5.4, '#140c10', { outline: false, shadow: null, alpha: out });
      });
    }
  }

  if (v.tilt > 0) {
    // the floor plan comes up from the bottom of the screen as the wall goes
    world(buf.g, W, H);
    const h = H * v.tilt;
    screen();
    ctx.drawImage(buf.c, 0, 0, W, H, 0, H - h, W, h);
    if (v.tilt < 1) {
      const seam = ctx.createLinearGradient(0, H - h - 14, 0, H - h + 14);
      seam.addColorStop(0, 'rgba(5,3,10,0)'); seam.addColorStop(0.5, 'rgba(5,3,10,0.9)'); seam.addColorStop(1, 'rgba(5,3,10,0)');
      ctx.fillStyle = seam;
      ctx.fillRect(0, H - h - 14, W, 28);
    }
  }
  ctx.restore();
}
