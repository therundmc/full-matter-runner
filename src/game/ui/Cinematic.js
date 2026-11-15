// The opening. The title screen is the street seen from a window (drawTitleView: ui/cine/Pane.js over
// ui/TitleScene.js): his. NEW GAME pulls the camera back from that window into his bedroom (ui/cine/Room.js), where
// he sleeps. Then the night goes wrong, told like a comic in 8 bits (ui/cine/Panels.js): something heavy falls in
// the flat, his eye opens; a woman screams; a shot, and nothing; blood under the door, his face in the dark, boots
// stopping on the landing, two words. He gets up without a light, the view tips over onto the floor plan, and it is
// the tutorial. Everything is a function of t (s since NEW GAME): cineView() is the timeline as plain numbers
// (unit-tested), drawCinematic() the picture, cineBeats() what is heard.
import { PALETTE } from '../Config.js';
import { LW, LH } from './title/Draw.js';
import { drawTitleScene, drawTitleTexts } from './TitleScene.js';
import { text } from './Text.js';
import { drawPane } from './cine/Pane.js';
import { paintRoom, WIN, DOOR } from './cine/Room.js';
import { drawPanel, paintEye, paintGap, paintFace, paintBoots } from './cine/Panels.js';

export const CINE = {
  zoom: LW / WIN.w,       // the window fills the screen on the title: that much bigger than it is in the room
  pull: 2.4,              // s the camera takes to pull back into the room
  // from here on, s into the room (after the pull):
  thump: 0.7,             // something heavy goes down in the flat
  eye: [1.0, 2.4],        // the panel of his eye: in, out
  eyeOpen: 1.3,
  scream: [2.5, 3.8],
  shot: 3.8,
  strip: [4.3, 8.0],      // three panels on black: the blood under the door, his face, the boots on the landing
  panels: [4.3, 5.15, 6.0],
  steps: [6.2, 6.6],      // a boot, the other
  says: 7.0,              // "FIND HIM."
  rise: [8.1, 9.2],       // he gets out of bed
  tiltAt: 9.4,            // the view tips ...
  tilt: 1.1,              // ... for that long
  skipAfter: 0.3,         // s after which a key or a click goes straight to the game
  date: 'SUNSET BAY  -  MARCH 14TH 1986  -  1:05 AM',
  line: 'FIND HIM.',
};
export const CINE_END = CINE.pull + CINE.tiltAt + CINE.tilt;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
const hash = (n) => { const s = Math.sin(n * 57.3 + 7.1) * 43758.5453; return s - Math.floor(s); };

// The timeline at t: zoom (the window's picture: CINE.zoom on the title, 1 in the room), logo (what is left of the
// title's texts), rt (s into the room, negative during the pull), rise (0..1 out of bed), strip (the panels on
// black are up), tilt (0..1 how far the view has tipped onto the floor plan), over.
export function cineView(t, C = CINE) {
  const k = clamp(t / C.pull, 0, 1), e = k * k * k * (k * (6 * k - 15) + 10), rt = t - C.pull;
  return {
    zoom: Math.exp(Math.log(C.zoom) * (1 - e)),
    logo: 1 - smooth(t / 0.5),
    rt,
    rise: clamp((rt - C.rise[0]) / (C.rise[1] - C.rise[0]), 0, 1),
    strip: rt >= C.strip[0] && rt < C.strip[1],
    tilt: smooth((rt - C.tiltAt) / C.tilt),
    over: rt >= C.tiltAt + C.tilt,
  };
}

// what is heard between t0 and t1: [{ name, vol, opts }] for Audio.play
export function cineBeats(t0, t1, C = CINE) {
  const P = C.pull, cues = [
    [0.1, 'air', 1, { inside: 1 }], [4.5, 'air', 1, { inside: 1 }], [9, 'air', 1, { inside: 1 }],
    [P + C.thump, 'bodyFall', 1], [P + C.thump + 0.03, 'door', 0.7],
    [P + C.scream[0], 'scream', 1], [P + C.shot, 'pistol', 0.9], [P + C.shot + 0.35, 'bodyFall', 0.7],
    ...C.steps.map((s) => [P + s, 'step', 1, { floor: 'wood' }]),
    [P + C.rise[0], 'getUp', 0.5],
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
let pane = null; // the window's view, on a canvas of its own

// world(g, W, H) paints the game seen from above on a W x H canvas; buf: such a canvas { c, g } kept by the caller
export function drawCinematic(ctx, W, H, t, world, buf) {
  const v = cineView(t), C = CINE, rt = v.rt, s = H / 720;
  const sc = Math.max(W / LW, H / LH), ox = (W - LW * sc) / 2, oy = (H - LH * sc) / 2;
  const logical = () => { ctx.setTransform(sc, 0, 0, sc, ox, oy); ctx.imageSmoothingEnabled = false; };
  const screen = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  screen();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  const flash = rt >= C.shot && rt < C.shot + 0.09, black = rt >= C.shot + 0.09 && rt < C.strip[0];
  const screaming = rt >= C.scream[0] && rt < C.shot;

  if (!v.strip && !black && !flash && v.tilt < 1) {
    // the window's view on its own canvas, then the room round it
    if (!pane || pane.c.width !== W || pane.c.height !== H) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      pane = { c, g: c.getContext('2d') };
    }
    drawTitleView(pane.g, W, H, t, null, v.logo);
    const knock = rt >= C.thump ? Math.exp(-(rt - C.thump) * 9) : 0;
    const jolt = knock * 5 + (screaming ? 2.5 : 0);
    const shx = (hash(Math.floor(t * 60)) - 0.5) * jolt * s, shy = (hash(Math.floor(t * 60) + 9) - 0.5) * jolt * s;
    const S = sc * v.zoom, k = (v.zoom - 1) / (C.zoom - 1), flat = 1 - v.tilt;
    const wx = WIN.x + WIN.w / 2, wy = WIN.y + WIN.h / 2;
    // the window is the whole screen on the title, and goes to its place in the wall as the camera pulls back; as
    // the view tips the wall shrinks toward the top of the screen
    const px = lerp(ox + wx * sc, W / 2, k), py = lerp(oy + wy * sc, H / 2, k);
    ctx.setTransform(S, 0, 0, S * flat, px - wx * S + shx, (py - wy * S) * flat + shy);
    ctx.imageSmoothingEnabled = k < 0.98;
    const sw = Math.min(W, (H * LW) / LH), sh = (sw * LH) / LW;
    ctx.drawImage(pane.c, (W - sw) / 2, (H - sh) / 2, sw, sh, WIN.x, WIN.y, WIN.w, WIN.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(paintRoom({
      rise: v.rise, knock, beat: 0.6 + 0.4 * Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1),
      feet: rt >= C.strip[0] ? [7, 23] : screaming ? [6 + Math.sin(t * 23) * 4, 22 + Math.sin(t * 17 + 2) * 5] : [],
      blood: rt >= C.strip[0] ? 1 : 0,
    }), 0, 0);
    screen();
    if (screaming) {
      ctx.fillStyle = `rgba(255,0,40,${(0.1 + 0.16 * Math.abs(Math.sin(rt * 37))).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // his eye, in a panel over the bed
    const E = C.eye, ek = clamp((rt - E[0]) / 0.25, 0, 1) * clamp((E[1] - rt) / 0.2, 0, 1);
    if (ek > 0 && v.tilt <= 0) {
      logical();
      const open = rt < C.eyeOpen ? 0 : Math.min(1, (rt - C.eyeOpen) / 0.07);
      drawPanel(ctx, { x: 204, y: 18, w: 150, h: 58 }, ek, (g, w, h) => paintEye(g, w, h, open, open ? 0.8 + Math.sin(rt * 9) * 0.2 : 0, rt));
      screen();
    }
    // the date, typed at the foot of the picture while nothing has happened yet
    if (t > 0.9 && rt < C.scream[0]) {
      const a = clamp((C.scream[0] - rt) / 0.4, 0, 1);
      text(ctx, C.date.slice(0, Math.floor((t - 0.9) * 26)), 40 * s, H - 44 * s, 15 * s, PALETTE.white, { align: 'left', alpha: a });
    }
    // what is heard, written the way comics write it
    const at = (x, y) => [ox + x * sc, oy + y * sc];
    if (rt >= C.thump && rt < C.thump + 0.8) {
      const u = (rt - C.thump) / 0.8, [x, y] = at(DOOR.x - 34, DOOR.y + 8);
      text(ctx, 'THUMP', x + (hash(Math.floor(t * 30)) - 0.5) * 6 * s, y - u * 14 * s, (46 + 16 * Math.min(1, u * 6)) * s, PALETTE.yellow, { rot: -0.14, alpha: clamp((1 - u) * 3, 0, 1) });
    }
    if (screaming) {
      const str = 'AAAAAAAAH!', shown = Math.floor((rt - C.scream[0]) * 16) + 1;
      for (let i = 0; i < Math.min(shown, str.length); i++) {
        const u = i / (str.length - 1), [x, y] = at(DOOR.x - 286 + u * 262, DOOR.y - 2 + Math.sin(u * 5) * 14); // it swells toward the door
        const j = Math.floor(t * 30) + i * 7;
        text(ctx, str[i], x + (hash(j) - 0.5) * 9 * s, y + (hash(j + 3) - 0.5) * 9 * s, (46 + u * 70) * s, '#ff1038', { rot: (hash(j + 5) - 0.5) * 0.4 });
      }
    }
  }

  if (flash) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    text(ctx, 'BLAM', W / 2, H / 2, 190 * s, '#05030a', { outline: false, shadow: null, rot: -0.06 });
  }

  if (v.strip) {
    // three panels on black, coming up one after the other, going together
    const out = clamp((C.strip[1] - rt) / 0.25, 0, 1), k = (i) => clamp((rt - C.panels[i]) / 0.35, 0, 1) * out;
    const R = [{ x: 14, y: 42, w: 112, h: 132 }, { x: 136, y: 42, w: 112, h: 132 }, { x: 258, y: 42, w: 112, h: 132 }];
    logical();
    drawPanel(ctx, R[0], k(0), (g, w, h) => paintGap(g, w, h, clamp((rt - C.panels[0] - 0.35) / 2.4, 0, 1)));
    drawPanel(ctx, R[1], k(1), (g, w, h) => paintFace(g, w, h, rt));
    drawPanel(ctx, R[2], k(2), (g, w, h) => paintBoots(g, w, h, C.steps.filter((at) => rt >= at).length, rt));
    screen();
    if (rt >= C.says) {
      const n = Math.floor((rt - C.says) * 22);
      text(ctx, C.line.slice(0, n), ox + (R[2].x + R[2].w / 2) * sc, oy + (R[2].y + R[2].h - 18) * sc, 26 * s, PALETTE.white, { alpha: out });
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
