// A level's closing page, played once the getaway is over and before the results (Game state 'ending'): a comic page
// in the opening's manner (ui/cine/Page.js lays it out, tools/generate_comic.py paints its stills). Level 1's: he
// drives the boss's van away in the rain, the bar's neon getting smaller in the mirror; back in the bar CUEBALL lies
// over the back room's desk and the phone will not stop ringing: the boss, wanting news; a matchbook off that desk, a
// motel's, JITTERS' saw-tooth mark scrawled on it: one down, and where the next one sleeps. ENDINGS maps a level to
// its page; endingView() is the timeline as plain numbers (unit-tested), endingBeats() what is heard, drawEnding() the
// picture. t: s since the page began.
import { spriteOpt } from '../../../engine/Assets.js';
import { text } from '../Text.js';
import { drawPage } from './Page.js';
import { still, fine, smoke } from './Panels.js';
import { clamp, smooth, lerp, hash, px, poly, disc, line } from './Ink.js';

// where things are in the stills (their px; generate_comic.py DRIVE_MIRROR, DRIVE_GLASS, OFFICE_SMOKE, OFFICE_DRIP)
const MIRROR = [438, 44, 626, 84];
const GLASS = [[0, 24], [636, 30], [606, 228], [0, 222]];
const WIPER = { x: 330, y: 240, len: 160 };
// the road in comic/drive: its vanishing point, where its line and its lamps run to, how low a lamp's foot goes
const ROAD = { vp: [236, 150], line: [150, 236], lamps: [590, 56], foot: 228 };
const MUZZLE = [204, 242];   // the dropped shotgun's muzzle in comic/office (ending.py OFFICE_SMOKE)
const DRIP = [446, 203];
const COVER = [[96, 82], [360, 64], [366, 150], [102, 168]];   // the matchbook's printed face (ending.py MATCH_COVER)
// the phone rings in bursts: the first at `first` s into its panel, one every `every` s, each `dur` s long
export const RING = { first: 0.4, every: 1.7, dur: 1.0, n: 3 };
export const ringing = (t) => t >= RING.first && (t - RING.first) % RING.every < RING.dur;

// in a polygon of the still (fine px): what draw() paints is clipped to it
function within(g, pts, draw) {
  g.save();
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  draw();
  g.restore();
}

// ---------------------------------------------------------------- level 1
// 1. At the wheel: the rain running up the windscreen, the wiper going, and in the mirror the bar going away
// (behind: 0 when the panel drops in, 1 when it is a speck).
function paintDrive(g, w, h, t, behind) {
  still(g, 'drive', w, h);
  fine(g, () => {
    within(g, GLASS, () => {
      // the road coming at him: its line, the street lamps going by
      const [vx, vy] = ROAD.vp;
      for (let i = 0; i < 6; i++) {
        const u = ((i / 6 + t * 0.8) % 1) ** 2, v = Math.min(1, u + 0.03 + 0.07 * u);
        line(g, '#b8a890', lerp(vx, ROAD.line[0], u), lerp(vy, ROAD.line[1], u), lerp(vx, ROAD.line[0], v), lerp(vy, ROAD.line[1], v), Math.round(1 + 6 * u));
      }
      for (let i = 4; i >= 0; i--) {
        const s = ((i / 5 + t * 0.16) % 1) ** 2 * 1.3, x = lerp(vx, ROAD.lamps[0], s), y = lerp(vy, ROAD.lamps[1], s);
        line(g, '#0a070c', x, y, x + 4 * s, lerp(vy, ROAD.foot, s), Math.round(1 + 5 * s));
        disc(g, '#c8381a', x, y, 3 + 13 * s);
        disc(g, '#ff8a20', x, y, 1.5 + 7 * s);
      }
      for (let i = 0; i < 34; i++) {
        const u = (t * (0.3 + hash(i + 3) * 0.4) + hash(i)) % 1, x = hash(i + 11) * 620 + u * 40, y = 226 - u * 200;
        line(g, i % 5 ? '#2a2c5a' : '#5a5e96', x, y, x + 5, y - 9 - hash(i + 5) * 8, 2);
      }
      const a = -Math.PI / 2 + 1.0 * Math.sin(t * 2.3), ex = WIPER.x + Math.cos(a) * WIPER.len, ey = WIPER.y + Math.sin(a) * WIPER.len;
      line(g, '#07050c', WIPER.x, WIPER.y, ex, ey, 6);
      line(g, '#3a3650', WIPER.x + 2, WIPER.y - 2, ex + 2, ey - 2, 1);
    });
    // the mirror over all that (its frame and stalk again: the lamps pass behind them); the bar in it, seen back to
    // front, smaller and smaller: its front, its sign, its light on the wet road
    const [x0, y0, x1, y1] = MIRROR;
    poly(g, '#0a070c', [[x0 - 8, y0 - 8], [x1 + 8, y0 - 6], [x1 + 6, y1 + 8], [x0 - 6, y1 + 6]]);
    px(g, '#0a070c', 525, 24, 12, 16);
    px(g, '#0c0812', x0, y0, x1 - x0, y1 - y0);
    g.save();
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0);
    g.clip();
    const z = lerp(1, 0.2, smooth(behind)), cx = (x0 + x1) / 2 + 8 * (1 - z), cy = y0 + 24;
    const R = (dx, dy, rw, rh, col) => px(g, col, cx + dx * z, cy + dy * z, Math.max(1, rw * z), Math.max(1, rh * z));
    disc(g, '#3a1430', cx, cy + 12 * z, 72 * z + 2, 6 * z + 1);
    R(-64, -20, 128, 30, '#140a18');
    R(-64, -20, 128, 2, '#2a1830');
    if (hash(Math.floor(t * 13)) > 0.06) {
      for (const dx of [-42, -28, -14]) R(dx, -15, 11, 11, '#ff3a7a');
      R(6, -15, 11, 11, '#3ad8e8');
    }
    R(-12, -1, 22, 11, '#4a2a18');
    R(-58, 10, 116, 3, '#5a1838');
    g.restore();
  });
}

// 2. The bar's back room, CUEBALL dead over the desk: the phone rattling on its cradle while it rings (the boss), the
// smoke off his dropped shotgun, a drop of blood off the desk.
function paintOffice(g, w, h, t) {
  still(g, 'office', w, h);
  const rec = spriteOpt('comic/office_phone');
  fine(g, () => {
    if (rec) {
      const f = Math.floor(t * 28), on = ringing(t);
      g.drawImage(rec, on ? Math.round((hash(f) - 0.5) * 4) : 0, on ? -Math.round(hash(f + 5) * 4) : 0);
    }
    smoke(g, MUZZLE[0] - 4, MUZZLE[1] - 4, t, '#5a5462', 60);
    const u = (t * 0.7) % 1, [dx, dy] = DRIP;
    if (u < 0.4) px(g, '#7a0e16', dx - 1, dy, 3, 2 + u * 8);
    else px(g, '#7a0e16', dx - 1, dy + ((u - 0.4) / 0.6) ** 2 * 80, 3, 5);
  });
}

// 3. The matchbook in his hand: the motel's name printed on it.
function paintMatchbook(g, w, h, t = 0) {
  still(g, 'matchbook', w, h);
  const k = (t % 3.6) / 0.6;                                             // a glint slides across its cover now and then
  if (k < 1) {
    fine(g, () => within(g, COVER, () => {
      const x = 60 + k * 360;
      poly(g, '#fff0f4', [[x, 50], [x + 26, 50], [x - 14, 180], [x - 40, 180]], 0.45);
    }));
  }
  const a = Math.atan2(64 - 82, 360 - 96);    // the slant of its top edge (generate_comic.py panel_matchbook)
  text(g, 'FLAMINGO', 95, 37, 7, '#f8ecd8', { rot: a, outline: false, shadow: '#a83260' });
  text(g, 'MOTEL', 97, 48.5, 4, '#f8ecd8', { rot: a, outline: false, shadow: '#a83260' });
}

const rings = (x, y, size, rot) => Array.from({ length: RING.n }, (_, i) => (
  { text: 'RRRING', at: RING.first + i * RING.every, dur: RING.dur, x: x + (i % 2) * 12, y: y + (i % 2) * 3, size, col: '#f2d04a', rot: rot * (i % 2 ? -1 : 1) }));

const LEVEL1 = {
  end: 14.6,
  page: { end: 14.6, panels: [
    { r: { x: 12, y: 10, w: 360, h: 96 }, at: 0.5, paint: (g, w, h, t) => paintDrive(g, w, h, t, clamp(t / 11, 0, 1)),
      caption: ['HE TOOK THEIR VAN.', 'HE LEFT THEM A BODY.'] },
    { r: { x: 12, y: 112, w: 176, h: 94 }, at: 4.2, paint: paintOffice, caption: ['THE PHONE RANG.', 'THE BOSS WANTED NEWS.'],
      sfx: rings(70, 34, 8, 0.12) },
    { r: { x: 196, y: 112, w: 176, h: 94 }, at: 7.8, paint: paintMatchbook, caption: ["OFF CUEBALL'S DESK."],
      close: { at: 2.2, text: ['ONE DOWN. JITTERS', 'HAD A ROOM THERE.'] } },
  ] },
  // what is heard: [at, name, vol, opts] for Audio.play
  cues: [
    [0.05, 'passby', 0.7, { lead: 2.6, dur: 7.5, dir: -1, side: 0.1, f: 36 }],   // the van's engine, flat out
    [0.1, 'air', 1, { inside: 0.6 }], [5.1, 'air', 1, { inside: 0.6 }], [10.1, 'air', 1, { inside: 0.6 }],
    [4.4, 'siren', 1],                                                           // far off, on its way to the bar
    [8.1, 'pickup', 0.6],                                                        // the matchbook turned in his fingers
  ],
};

// a level's closing page, if it has one: { end, page, cues }
export const ENDINGS = { level1: LEVEL1 };

// { panels (how many have dropped in), over }
export function endingView(e, t) {
  return { panels: e.page.panels.filter((p) => t >= p.at).length, over: t >= e.end };
}

// what is heard between t0 and t1: [{ name, vol, opts }]
export function endingBeats(e, t0, t1) {
  return e.cues.filter(([at]) => t0 < at && t1 >= at).map(([, name, vol, opts]) => ({ name, vol, opts: opts || {} }));
}

export function drawEnding(ctx, W, H, e, t) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  drawPage(ctx, W, H, t, e.page);
}
