// The opening. The title screen is the street seen from a window (drawTitleView: ui/cine/Pane.js over
// ui/TitleScene.js): his. NEW GAME pulls the camera back from that window into his bedroom (ui/cine/Room.js), where
// he sleeps; the street goes soft and coarse behind the wet glass as it becomes a part of the room. Then the night
// goes wrong, told as comic pages drawn like a noir thriller album (ui/cine/Page.js lays them out, ui/cine/Panels.js
// frames the stills of tools/generate_comic.py and moves what moves in them), slowly enough to be read. He ran
// packages for the boss of the bar for six years and kept every dollar under his floor, to leave town. Boards torn up
// next door, his eye opens; page one: the boss's three men in his forced front door, the heavy one's crowbar under his
// floorboards, his tin box, the young one riffling the money. The building's super shouts at the front door, a shot
// cuts him off; page two: the super hit in his doorway, the heavy one soaking the sofa ("NO LOOSE ENDS."), the one
// with the slicked hair striking a match ("TORCH IT."), the back room's door behind him. He gets up, puts on his coat,
// cap and satchel, firelight under his door, and the view tips over onto the floor plan: the tutorial, where the man
// with the match lights the flat as he walks in. Everything is a function of t (s since NEW GAME): cineView() is the
// timeline as plain numbers (unit-tested), drawCinematic() the picture, cineBeats() what is heard.
import { PALETTE } from '../Config.js';
import { LW, LH } from './title/Draw.js';
import { drawTitleScene, drawTitleTexts } from './TitleScene.js';
import { text } from './Text.js';
import { drawPane } from './cine/Pane.js';
import { paintRoom, paintFore, WIN, DOOR, FM } from './cine/Room.js';
import { drawPanel, balloon, paintEye, paintDoor, paintPry, paintBox, paintCount, paintSuper, paintPour, paintMatch } from './cine/Panels.js';
import { drawPage } from './cine/Page.js';
import { clamp, smooth, lerp, hash } from './cine/Ink.js';

export const CINE = {
  zoom: LW / WIN.w,       // the window fills the screen on the title: that much bigger than it is in the room
  pull: 2.6,              // s the camera takes to pull back into the room
  // from here on, s into the room (after the pull):
  thump: 1.2,             // boards torn up in the next room
  eye: [1.6, 3.4],        // the panel of his eye: in, out
  eyeOpen: 2.1,
  page1: [3.8, 12.6],     // what they came for
  voice: [13.0, 14.4],    // the super at the front door, shouting ...
  shot: 14.4,             // ... until a shot cuts him off
  page2: [15.0, 23.6],    // no loose ends
  strike: 20.4,           // the match struck, in the last panel
  rise: [23.8, 26.8],     // he sits up, gets up, dresses
  tiltAt: 27.2,           // the view tips ...
  tilt: 1.2,              // ... for that long
  skipAfter: 0.3,         // s after which a key or a click goes straight to the game
  date: 'SUNSET BAY  -  MARCH 14TH 1986  -  1:05 AM',
  shout: "HEY! WHAT'S ALL THAT RACKET",
};
export const CINE_END = CINE.pull + CINE.tiltAt + CINE.tilt;
const DRESS = 0.91; // how far through getting up he takes his coat off the hook (Room.paintMan)

// the pages, in s into the room
const SKRITCH = { text: 'SKRITCH', dur: 0.8, size: 9, col: '#ffb040', rot: -0.12 };
export const PAGES = [
  { start: CINE.page1[0], end: CINE.page1[1], panels: [
    { r: { x: 12, y: 10, w: 360, h: 96 }, at: 3.8, paint: paintDoor, caption: ["1:05 AM. THE BOSS'S MEN LET THEMSELVES IN."],
      sfx: [{ text: 'KRAK', at: 0.8, dur: 0.9, x: 198, y: 30, size: 11, col: PALETTE.yellow, rot: -0.15 }] },
    { r: { x: 12, y: 112, w: 116, h: 94 }, at: 5.8, paint: paintPry, caption: ['THEY KNEW WHERE', 'HE HID IT.'],
      sfx: [{ text: 'KRRIK', at: 0.6, dur: 0.9, x: 36, y: 46, size: 8, col: PALETTE.yellow, rot: 0.1 }] },
    { r: { x: 134, y: 112, w: 116, h: 94 }, at: 7.8, paint: paintBox, caption: ['SIX YEARS OF RUNS', 'FOR THE BOSS.'] },
    { r: { x: 256, y: 112, w: 116, h: 94 }, at: 9.8, paint: paintCount, caption: ['EVERY DOLLAR.', 'HIS WAY OUT.'] },
  ] },
  { start: CINE.page2[0], end: CINE.page2[1], panels: [
    { r: { x: 12, y: 10, w: 176, h: 96 }, at: 15.0, paint: (g, w, h, t) => paintSuper(g, w, h, t, (t - 0.3) / 1.6), caption: ['THE SUPER CAME UP', 'ABOUT THE NOISE.'] },
    { r: { x: 196, y: 10, w: 176, h: 96 }, at: 17.2, paint: paintPour, say: { at: 0.7, text: ['THE BOSS SAYS:', 'NO LOOSE ENDS.'], x: 4, y: 4, tail: [112, 40] },
      sfx: [{ text: 'GLUG GLUG', at: 0.2, dur: 1.4, x: 50, y: 82, size: 7, col: '#e8c070', rot: 0.06 }] },
    { r: { x: 12, y: 112, w: 360, h: 94 }, at: 19.4, paint: (g, w, h, t) => paintMatch(g, w, h, t, clamp((t - (CINE.strike - 19.4)) / 0.25, 0, 1)),
      say: { at: 1.8, text: ['TORCH IT.', "HE'S IN THE BACK ROOM."], x: 60, y: 6, tail: [158, 40] },
      sfx: [{ ...SKRITCH, at: CINE.strike - 19.4, x: 150, y: 36 }] },
  ] },
];

// The timeline at t: zoom (the window's picture: CINE.zoom on the title, 1 in the room), logo (what is left of the
// title's texts), rt (s into the room, negative during the pull), rise (0..1 out of bed and dressed), page (the comic
// page up, or null), fire (0..1: the firelight under his door), tilt (0..1 how far the view has tipped onto the floor
// plan), over.
export function cineView(t, C = CINE) {
  const k = clamp(t / C.pull, 0, 1), e = k * k * k * (k * (6 * k - 15) + 10), rt = t - C.pull;
  return {
    zoom: Math.exp(Math.log(C.zoom) * (1 - e)),
    logo: 1 - smooth(t / 0.5),
    rt,
    rise: clamp((rt - C.rise[0]) / (C.rise[1] - C.rise[0]), 0, 1),
    page: PAGES.find((p) => rt >= p.start && rt < p.end) || null,
    fire: 0.35 * clamp((rt - C.page2[1]) / 1.5, 0, 1),
    tilt: smooth((rt - C.tiltAt) / C.tilt),
    over: rt >= C.tiltAt + C.tilt,
  };
}

// what is heard between t0 and t1: [{ name, vol, opts }] for Audio.play
export function cineBeats(t0, t1, C = CINE) {
  const P = C.pull, cues = [
    ...[0.1, 5, 10, 15, 20, 25].map((at) => [at, 'air', 1, { inside: 1 }]),
    [P + C.thump, 'woodBreak', 0.8], [P + C.thump + 0.05, 'door', 0.5],
    [P + PAGES[0].panels[0].at + 0.8, 'door', 0.6],                      // the crowbar in his front door
    [P + PAGES[0].panels[1].at + 0.6, 'woodBreak', 0.5],                 // the board coming up
    [P + C.voice[0], 'shout', 1],
    [P + C.shot, 'pistol', 0.9], [P + C.shot + 0.35, 'bodyFall', 0.7],
    [P + C.strike, 'match', 1],
    [P + C.rise[0], 'getUp', 0.5],
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

// world(g, W, H) paints the game seen from above on a W x H canvas; buf: such a canvas { c, g } kept by the caller
export function drawCinematic(ctx, W, H, t, world, buf) {
  const v = cineView(t), C = CINE, rt = v.rt;
  const sc = Math.max(W / LW, H / LH), ox = (W - LW * sc) / 2, oy = (H - LH * sc) / 2;
  const logical = () => { ctx.setTransform(sc, 0, 0, sc, ox, oy); ctx.imageSmoothingEnabled = false; };
  const screen = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
  const letter = (str, x, y, size, col, opts = {}) => text(ctx, str, ox + x * sc, oy + y * sc, size * sc, col, opts);
  ctx.save();
  screen();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  const flash = rt >= C.shot && rt < C.shot + 0.09, black = (rt >= C.shot + 0.09 && rt < C.page2[0]) || (rt >= C.page1[1] && rt < C.page1[1] + 0.25);
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
    const jolt = knock * 5 + (shouting ? 1.2 : 0);
    const s = H / 720, shx = (hash(Math.floor(t * 60)) - 0.5) * jolt * s, shy = (hash(Math.floor(t * 60) + 9) - 0.5) * jolt * s;
    const S = sc * v.zoom, flat = 1 - v.tilt, wx = WIN.x + WIN.w / 2, wy = WIN.y + WIN.h / 2;
    // the window is the whole screen on the title, and goes to its place in the wall as the camera pulls back; as
    // the view tips the wall shrinks toward the top of the screen
    const cx = lerp(ox + wx * sc, W / 2, k), cy = lerp(oy + wy * sc, H / 2, k);
    ctx.setTransform(S, 0, 0, S * flat, cx - wx * S + shx, (cy - wy * S) * flat + shy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low.c, WIN.x, WIN.y, WIN.w, WIN.h);
    ctx.drawImage(paintRoom({
      t, rise: v.rise, knock, fire: v.fire,
      beat: 0.6 + 0.4 * Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1),
      feet: rt >= C.rise[0] && rt < C.rise[0] + 1.2 ? [6 + (rt - C.rise[0]) * 20, 26 + (rt - C.rise[0]) * 14] : [],
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
      drawPanel(ctx, { x: 204, y: 18, w: 150, h: 58 }, ek, (g, w, h) => paintEye(g, w, h, open));
      screen();
    }
    // the date, typed at the foot of the picture while nothing has happened yet
    if (t > 0.9 && rt < C.page1[0]) {
      const a = clamp((C.page1[0] - rt) / 0.4, 0, 1);
      letter(C.date.slice(0, Math.floor((t - 0.9) * 22)), 12, LH - 12, 5, PALETTE.white, { align: 'left', alpha: a });
    }
    // what is heard, written the way comics write it
    if (rt >= C.thump && rt < C.thump + 0.9) {
      const u = (rt - C.thump) / 0.9;
      letter('KRRAK', DOOR.x - 30 + (hash(Math.floor(t * 30)) - 0.5) * 2, DOOR.y + 10 - u * 5, 15 + 5 * Math.min(1, u * 6), PALETTE.yellow, { rot: -0.14, alpha: clamp((1 - u) * 3, 0, 1) });
    }
    if (shouting) {
      // the super's voice through the wall: a balloon from the door, the words coming as he says them
      const n = Math.floor((rt - C.voice[0]) * 20) + 1, str = C.shout.slice(0, n);
      logical();
      const jx = (hash(Math.floor(t * 20)) - 0.5) * 2;
      balloon(ctx, 176 + jx, 20, 152, 28, DOOR.x + 6, DOOR.y + 30);
      screen();
      letter(str + (n >= C.shout.length ? '-' : ''), 252 + jx, 34, 5.6, '#140c10', { outline: false, shadow: null });
    }
  }

  if (flash) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    letter('BLAM', LW / 2, LH / 2, 64, '#05030a', { outline: false, shadow: null, rot: -0.06 });
  }

  if (v.page) drawPage(ctx, W, H, rt, v.page);

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
