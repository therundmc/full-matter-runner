// The opening, told as a comic in the game's one art direction (neon noir: people as black shapes rimmed with neon,
// the night's blues and purples, the print a little off register like the title; tools/generate_comic.py paints the
// stills, ui/cine/Page.js lays the pages out, ui/cine/Panels.js frames them and moves what moves in them), slowly
// enough to be read. He ran packages for the boss of the bar for six years and kept every dollar under his floor, to
// leave town in the morning. Page one, his last night: he sleeps, his suitcase packed by the door; the boss's three
// men force his front door. Page two, what they came for: the heavy one's crowbar under his floorboards, his tin box,
// the young one riffling the money, the heavy one soaking his sofa in petrol ("NO LOOSE ENDS."). Page three: the one
// with the slicked hair strikes a match ("TORCH IT. HE'S IN THE BACK ROOM."); the fire comes in under his door; his eye
// opens. Then a moment of black and the tutorial's card (Game state 'intro'), where the man with the match lights the
// flat as he walks in. Everything is a function of t (s since NEW GAME): cineView() is the timeline as plain numbers
// (unit-tested), drawCinematic() the picture, cineBeats() what is heard.
import { PALETTE } from '../Config.js';
import { LW, LH } from './title/Draw.js';
import { drawTitleScene, drawTitleTexts } from './TitleScene.js';
import { drawPane } from './cine/Pane.js';
import { paintSleep, paintDoor, paintPry, paintBox, paintCount, paintPour, paintMatch, paintFire, paintWake } from './cine/Panels.js';
import { drawPage } from './cine/Page.js';
import { clamp } from './cine/Ink.js';

export const CINE = {
  strike: 20.4,           // the match struck, in page three's first panel
  wake: 25.7,             // his eye opens, in its last panel
  out: 0.5,               // s of black after the last page, before the level's card
  skipAfter: 0.3,         // s after which a key or a click goes straight to the level's card
};

// the pages, in s since NEW GAME (panel sizes in the title's px: generate_comic.py paints each still at 3 x that)
const KRAK = { text: 'KRAK', at: 0.8, dur: 0.9, x: 198, y: 30, size: 11, col: PALETTE.yellow, rot: -0.15 };
const SKRITCH = { text: 'SKRITCH', dur: 0.8, size: 9, col: '#ffb040', rot: -0.12 };
export const PAGES = [
  { start: 0.2, end: 8.2, panels: [
    { r: { x: 12, y: 10, w: 360, h: 96 }, at: 0.2, paint: paintSleep, caption: ['1:05 AM.', 'HIS LAST NIGHT IN TOWN.'] },
    { r: { x: 12, y: 112, w: 360, h: 94 }, at: 3.2, paint: paintDoor, caption: ["THE BOSS'S MEN LET THEMSELVES IN."], sfx: [KRAK] },
  ] },
  { start: 8.6, end: 19.0, panels: [
    { r: { x: 12, y: 10, w: 116, h: 96 }, at: 8.6, paint: paintPry, caption: ['THEY KNEW WHERE', 'HE HID IT.'],
      sfx: [{ text: 'KRRIK', at: 0.6, dur: 0.9, x: 36, y: 50, size: 8, col: PALETTE.yellow, rot: 0.1 }] },
    { r: { x: 134, y: 10, w: 116, h: 96 }, at: 10.6, paint: paintBox, caption: ['SIX YEARS OF RUNS', 'FOR THE BOSS.'] },
    { r: { x: 256, y: 10, w: 116, h: 96 }, at: 12.6, paint: paintCount, caption: ['EVERY DOLLAR.', 'HIS WAY OUT.'] },
    { r: { x: 12, y: 112, w: 360, h: 94 }, at: 14.6, paint: paintPour,
      say: { at: 0.7, text: ['THE BOSS SAYS:', 'NO LOOSE ENDS.'], x: 112, y: 4, tail: [240, 30] },
      sfx: [{ text: 'GLUG GLUG', at: 0.2, dur: 1.4, x: 150, y: 70, size: 7, col: '#e8c070', rot: 0.06 }] },
  ] },
  { start: 19.4, end: 28.0, panels: [
    { r: { x: 12, y: 10, w: 360, h: 94 }, at: 19.4, paint: (g, w, h, t) => paintMatch(g, w, h, t, clamp((t - (CINE.strike - 19.4)) / 0.25, 0, 1)),
      say: { at: 1.8, text: ['TORCH IT.', "HE'S IN THE BACK ROOM."], x: 60, y: 6, tail: [158, 40] },
      sfx: [{ ...SKRITCH, at: CINE.strike - 19.4, x: 150, y: 36 }] },
    { r: { x: 12, y: 110, w: 176, h: 96 }, at: 22.6, paint: paintFire,
      sfx: [{ text: 'FWOOMP', at: 0.3, dur: 1.0, x: 88, y: 30, size: 10, col: '#ff8a20', rot: -0.08 }] },
    { r: { x: 196, y: 110, w: 176, h: 96 }, at: 24.8, paint: (g, w, h, t) => paintWake(g, w, h, t, t >= CINE.wake - 24.8) },
  ] },
];
export const CINE_END = PAGES.at(-1).end + CINE.out;

// The timeline at t: page (the comic page up, or null: the black between pages and at the end), over (the level's
// card is next).
export function cineView(t, C = CINE) {
  return {
    page: PAGES.find((p) => t >= p.start && t < p.end) || null,
    over: t >= PAGES.at(-1).end + C.out,
  };
}

// what is heard between t0 and t1: [{ name, vol, opts }] for Audio.play
export function cineBeats(t0, t1) {
  const [p1, p2, p3] = PAGES.map((p) => p.panels), cues = [
    ...[0.1, 5, 10, 15, 20, 25].map((s) => [s, 'air', 1, { inside: 1 }]),     // the night outside, the rain
    [p1[1].at + KRAK.at, 'door', 0.6],                                    // the crowbar in his front door
    [p2[0].at + 0.6, 'woodBreak', 0.5],                                   // the board coming up
    [p2[3].at + 0.2, 'splash', 0.4],                                      // the petrol on the sofa
    [CINE.strike, 'match', 1],
    [p3[1].at + 0.3, 'ignite', 0.9],                                      // the fire at his door
    [p3[2].at + 0.4, 'crackle', 0.8],
  ];
  return cues.filter(([s]) => t0 < s && t1 >= s).map(([, name, vol, opts]) => ({ name, vol, opts: opts || {} }));
}

// ---------------------------------------------------------------- the title: the city, from his window
export function drawTitleView(ctx, W, H, t, mouse, logo = 1) {
  const fx = drawTitleScene(ctx, W, H, t, mouse, false);
  const sc = Math.max(W / LW, H / LH);
  ctx.save();
  ctx.setTransform(sc, 0, 0, sc, (W - LW * sc) / 2, (H - LH * sc) / 2);
  ctx.imageSmoothingEnabled = false;
  drawPane(ctx, t, fx);
  ctx.restore();
  drawTitleTexts(ctx, W, H, t, logo);
}

// ---------------------------------------------------------------- the picture: black, and the page up
export function drawCinematic(ctx, W, H, t) {
  const v = cineView(t);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  if (v.page) drawPage(ctx, W, H, t, v.page);
}
