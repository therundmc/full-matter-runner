// Small lives of the furniture, drawn over it: the balls on a pool table (systems/PoolBalls.js), the snow on a
// television left on (recipe `snow`), the receiver of a phone booth (prop `handset`), the arcade's attract mode (its
// game when a customer plays it), a washer's lid left open and the washing folded on another's lid, the
// flies over a bin (level prop option `flies`), a tap dripping in its sink (def `tap`), the till's display; the devices of a level
// (data/devices.js): the fire alarm flashing; a dryer's load tumbling behind its door, a shop's wall of televisions
// each on its channel, the video recorders blinking 12:00, a wall clock's second hand (LIVE).

import { hash } from '../../engine/math.js';
import { arcadeAt } from '../ai/Pastimes.js';
import { PIECES } from './PastimeArt.js';

const RIM = '#0a2a18', WHITE = '#f4f2ea';
const DEVICES = new Set(['fire_alarm']);

// The arcade's attract mode (data in the sprite's own px, tools/generate_assets.py p_arcade: the screen, its two rows
// of invaders, the ship): at time t (s) the invaders' step sideways in px (0, 1, 2, 1...), how far up its way the
// ship's shot is (0..1, null between two shots) and whether the score is lit. `seed` shifts one cabinet from another.
export const ATTRACT = { step: 0.55, shot: 1.7, flight: 0.45, score: 0.8 };
export function attractFrame(t, seed = 0) {
  const u = t + hash(seed) * 10, s = Math.floor(u / ATTRACT.step) % 4, into = u % ATTRACT.shot;
  return { dx: s === 3 ? 1 : s, shot: into < ATTRACT.flight ? into / ATTRACT.flight : null, score: Math.floor(u / ATTRACT.score) % 2 === 0 };
}

// A tap that drips (prop def `tap`: [x, y] px from the prop's centre, where the drop lands in the basin): one drop
// every few seconds, each tap at its own pace. `n` drops have fallen at time t, the last one `age` s ago. (Heard
// already: the toilets' soundscape drips at its sink, data/soundscape.js.)
export const DRIP = { every: [2.2, 3.4], ring: 0.45 }; // s between two drops, s its ring lasts in the basin
export function dripAt(t, seed = 0) {
  const period = DRIP.every[0] + (DRIP.every[1] - DRIP.every[0]) * hash(seed * 1.31), u = t / period + hash(seed * 2.7);
  const n = Math.floor(u);
  return { n, age: (u - n) * period };
}

// The till's green display (clutter `till`): steady, its last digit a tired segment that drops out now and then
export function tillDim(t, seed = 0) {
  const u = t * 0.9 + hash(seed) * 20;
  return hash(Math.floor(u) + seed * 3.1) > 0.7 && u % 1 < 0.35;
}

// where a fly is at time t round the thing it circles (px from it): a slow loop with a quick jitter over it, never
// far, never still; i tells one fly from the next
export function flyAt(t, seed, i = 0) {
  const p = hash(seed + i * 7.3) * 6.28, q = 1.3 + hash(seed * 1.7 + i) * 0.8;
  return {
    x: Math.cos(t * q + p) * 6 + Math.sin(t * 7.1 + p * 3) * 1.5,
    y: Math.sin(t * q * 1.3 + p * 2) * 5 + Math.cos(t * 8.3 + p) * 1.5,
  };
}

// ground pass, right after the props
export function drawPropLife(ctx, world, t, vis) {
  for (const p of world.props) {
    if (p.dead || p.parts || !vis(p.x, p.y)) continue;
    const snowy = p.rec?.snow && !p.lightsOut, hook = p.def.handset, device = DEVICES.has(p.type);
    if (p.flies) flies(ctx, p, t);
    if (p.def.tap) inFrame(ctx, p, () => drip(ctx, p.def.tap, dripAt(t, p.x * 0.11 + p.y * 0.07).age));
    if (p.type === 'arcade') {
      if (p.lightsOut || p.unpowered) continue;
      // a customer at it (Civilian.atMachine): his game on the screen, else the attract mode
      const pl = p.player, on = pl && pl.alive && !(pl.knocked > 0) && pl.brain.state === 'stop';
      inFrame(ctx, p, () => (on ? game(ctx, arcadeAt(t, pl.seed), t) : attract(ctx, attractFrame(t, p.x + p.y))));
      continue;
    }
    if (p.type === 'washer' && (p.lidOpen || p.washing?.n)) { inFrame(ctx, p, () => washer(ctx, p)); continue; }
    const live = LIVE[p.type];
    if (live) { if (live.clockwork || !(p.lightsOut || p.unpowered)) inFrame(ctx, p, () => live(ctx, t, p.x * 0.13 + p.y * 0.07)); continue; }
    if (p.type !== 'pool_table' && !snowy && !hook && !device) continue;
    const o = p.centre(), k = p.kick;
    ctx.save();
    ctx.translate(o.x + k.x, o.y + k.y);
    ctx.rotate(p.body.angle + k.r);
    if (snowy) snow(ctx, p, t);
    else if (hook) handset(ctx, hook, p.offHook === undefined ? -1 : world.time - p.offHook);
    else if (p.type === 'fire_alarm') { if (world.sprinklers?.on && world.sprinklers.live() && Math.floor(t * 4) % 2) dot(ctx, 3.2, -0.2, '#ffe0d0'); }
    else for (const b of world.poolBalls.balls(p)) if (!b.in) ball(ctx, b);
    ctx.restore();
  }
  if (world.power?.dark) return; // no display without the mains
  for (const [p, set] of world.clutter?.on || []) {
    if (p.dead || p.parts || !vis(p.x, p.y)) continue;
    for (const i of set) if (i.kind === 'till' && i.state === 'on') inFrame(ctx, p, () => till(ctx, i, tillDim(t, p.x + i.x)));
  }
}

// ---- level 1's interiors: machines left running, in their sprite's own px from its middle (tools/generate_assets.py
// p_dryer, p_tv_stack, p_vcr_shelf, p_wall_clock). Where each thing is at time t, as numbers (tested), then drawn.

// a dryer's load: three pieces going round behind the glass of its door, seen from above as they come up its front
export const TUMBLE = { turn: 2.6, r: 3, y: 9.4, lift: 1.6, colors: ['#e8e6de', '#c8323a', '#3a5a9a'] }; // rad/s, px
export function tumbleAt(t, seed = 0, i = 0) {
  const a = t * TUMBLE.turn + seed + i * 2.1;
  return { x: Math.cos(a) * TUMBLE.r, y: TUMBLE.y + Math.abs(Math.sin(a)) * TUMBLE.lift };
}

// the sets of a shop's wall of televisions: [x0, x1, y] of each strip of glass; at time t the place of the bar that
// rolls down each picture (0..1 across the strip) and which of the channel's colours it shows
export const SCREENS = [[-13, -7, 6], [-3.5, 2.5, 6], [6, 11.5, 6], [-9, -2.5, 2.6], [5.3, 9.7, 2]];
export const CHANNELS = ['#9ef6ff', '#ffd0a0', '#ff9ac8', '#b8ffc8', '#7ab0ff'];
export function screenAt(t, seed = 0, i = 0) {
  const u = t * (0.55 + hash(seed + i * 3.7) * 0.5) + hash(seed * 1.9 + i) * 9;
  return { roll: u % 1, channel: Math.floor(hash(Math.floor(u / 2.5) + i * 5.1 + seed) * CHANNELS.length) };
}

// the second hand of a wall clock at time t: a tick a second, a step of a sixtieth of a turn
export function secondHand(t, seed = 0) {
  const a = (((Math.floor(t) + Math.floor(hash(seed) * 60)) % 60) / 60) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(a) * 1.7, y: 0.1 + Math.sin(a) * 0.9 };
}

const LIVE = {
  dryer(ctx, t, seed) {
    for (let i = 0; i < 3; i++) {
      const q = tumbleAt(t, seed, i);
      ctx.fillStyle = TUMBLE.colors[i];
      ctx.fillRect(Math.round(q.x * 2) / 2 - 0.5, Math.round(q.y * 2) / 2 - 0.5, 1, 1);
    }
  },
  tv_stack(ctx, t, seed) {
    SCREENS.forEach(([x0, x1, y], i) => {
      const f = screenAt(t, seed, i);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = CHANNELS[f.channel];
      ctx.fillRect(x0, y, x1 - x0, 1);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = WHITE;
      ctx.fillRect(Math.round((x0 + f.roll * (x1 - x0 - 1)) * 2) / 2, y, 1, 0.5);
    });
    ctx.globalAlpha = 1;
  },
  // 12:00, 12:00: each recorder's clock out half the time, never two in step
  vcr_shelf(ctx, t, seed) {
    ctx.fillStyle = '#2a0a10';
    for (let k = 0; k < 4; k++) if (Math.floor(t * 1.1 + hash(seed + k) * 2) % 2) ctx.fillRect(2.5 + k * 7.5 + 4.8 - 21, 2.5, 1, 0.5);
  },
  wall_clock(ctx, t, seed) {
    const q = secondHand(t, seed);
    ctx.fillStyle = '#c8242c';
    ctx.fillRect(Math.round(q.x * 2) / 2 - 0.25, Math.round(q.y * 2) / 2 - 0.25, 0.5, 0.5);
  },
};
LIVE.wall_clock.clockwork = true; // no mains: it ticks on in the dark

// the drop landing: a bright pixel, then a ring of four, then a wider, fainter one
const DROP = '#dff2ff';
function drip(ctx, [x, y], age) {
  if (age > DRIP.ring) return;
  const k = age / DRIP.ring, r = k < 0.2 ? 0 : k < 0.55 ? 1 : 2;
  ctx.fillStyle = DROP;
  ctx.globalAlpha = r === 0 ? 0.9 : r === 1 ? 0.55 : 0.28;
  if (!r) ctx.fillRect(x - 0.25, y - 0.25, 0.5, 0.5);
  else for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) ctx.fillRect(x + dx * 0.75 - 0.25, y + dy * 0.75 - 0.25, 0.5, 0.5);
  ctx.globalAlpha = 1;
}

// the till's display (clutter sprite 13 x 10 px, tools/generate_assets.py c_till: its glow 5 px long at the back): the
// gaps between its four digits, the last one out when it drops
function till(ctx, i, dim) {
  ctx.save();
  ctx.translate(i.x, i.y);
  ctx.rotate(i.a);
  ctx.fillStyle = '#0c2a1a';
  for (const x of [-2.5, -1, 0.5]) ctx.fillRect(x, 2.3, 0.5, 0.7);
  if (dim) ctx.fillRect(1, 2.3, 0.5, 0.7);
  ctx.restore();
}

// draw in the prop's own frame (its centre, its angle, its shake)
function inFrame(ctx, p, fn) {
  const o = p.centre(), k = p.kick;
  ctx.save();
  ctx.translate(o.x + k.x, o.y + k.y);
  ctx.rotate(p.body.angle + k.r);
  fn();
  ctx.restore();
}

// the cabinet's screen in attract mode, over the still one painted in the sprite (24 x 29 px, its centre at 0, 0):
// the two rows of invaders stepping, the shot going up from the ship, the score blinking
const SCREEN = ['#0c1238', '#121a4a'], INVADERS = [[-5, -3.5, '#05d9e8', 1], [-4, -2, '#ff2a6d', 0]];
function attract(ctx, f) {
  for (const [x0, y, col, line] of INVADERS) {
    ctx.fillStyle = SCREEN[line]; // its scanline
    ctx.fillRect(x0 - 1, y, 10, 0.5);
    ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) ctx.fillRect(x0 + i * 2 + f.dx - 1, y, 1, 0.5);
  }
  ctx.fillStyle = SCREEN[0];
  ctx.fillRect(-0.5, 1, 0.5, 0.5); // the still shot of the sprite
  if (f.shot !== null) { ctx.fillStyle = WHITE; ctx.fillRect(-0.5, 1.5 - f.shot * 3, 0.5, 0.5); }
  if (!f.score) { ctx.fillStyle = SCREEN[0]; ctx.fillRect(6, -4, 1, 0.5); }
}

// two flies over a bin (level prop option `flies`): a dark pixel each
function flies(ctx, p, t) {
  ctx.fillStyle = '#0e0c10';
  for (let i = 0; i < 2; i++) {
    const f = flyAt(t, p.x * 0.13 + p.y * 0.07, i);
    ctx.fillRect(Math.round((p.x + f.x) * 2) / 2, Math.round((p.y + f.y) * 2) / 2, 1, 1);
  }
}

// a small light (2 x 2 px) on a device
function dot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
}

// three pixels across, dark-rimmed like the rest of the table; a striped one is white top and bottom
function ball(ctx, b) {
  const x = Math.round(b.x - 1.5), y = Math.round(b.y - 1.5);
  ctx.fillStyle = RIM;
  ctx.fillRect(x - 1, y, 5, 3);
  ctx.fillRect(x, y - 1, 3, 5);
  ctx.fillStyle = b.color;
  ctx.fillRect(x, y, 3, 3);
  if (b.stripe) {
    ctx.fillStyle = WHITE;
    ctx.fillRect(x, y, 3, 1);
    ctx.fillRect(x, y + 2, 3, 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(x, y, 1, 1);
}

// no signal: light and dark dots jumping about the tube
function snow(ctx, p, t) {
  const [a, b, c, d] = p.rec.screen, f = Math.floor(t * 18) + p.x;
  const x0 = (a - 0.5) * p.W + 1, y0 = (b - 0.5) * p.H + 1, w = (c - a) * p.W - 2, h = (d - b) * p.H - 2;
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 3 ? '#e4eefa' : '#10141c';
    ctx.fillRect(Math.floor(x0 + hash(f * 7 + i * 13) * w), Math.floor(y0 + hash(f * 11 + i * 29) * h), 1, 1);
  }
}

// the receiver on its hook or, once the booth has taken a blow, swinging at the end of its cord
function handset(ctx, [hx, hy], age) {
  ctx.fillStyle = '#14161c';
  if (age < 0) { ctx.fillRect(hx - 1, hy - 2, 2, 5); return; }
  const s = 0.9 * Math.exp(-age * 0.45) * Math.cos(age * 5), x = hx + Math.sin(s) * 9, y = hy + Math.cos(s) * 9;
  ctx.strokeStyle = '#14161c';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(x, y); ctx.stroke();
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 4);
}

// the cabinet's screen while a customer plays (ai/Pastimes.js arcadeAt f): the ship goes with his stick, every press
// a shot, the invaders stepping faster and coming down the screen as the game goes on; between two games the screen
// blinks its GAME OVER bar
function game(ctx, f, t) {
  ctx.fillStyle = SCREEN[0];
  ctx.fillRect(-2, 2, 4, 1);                          // the still ship of the sprite, wiped
  ctx.fillRect(-0.5, 1, 0.5, 0.5);
  if (!f.play) {
    if (Math.floor(t * 3) % 2) { ctx.fillStyle = '#ff2a6d'; ctx.fillRect(-4, -1, 8, 1); ctx.fillStyle = WHITE; ctx.fillRect(-3, -0.75, 6, 0.5); }
    return;
  }
  const down = Math.min(2, Math.floor(f.k * 5) * 0.5), dx = Math.floor(t / 0.3) % 4;
  for (const [x0, y, col, line] of INVADERS) {
    ctx.fillStyle = SCREEN[line];
    ctx.fillRect(x0 - 1, y, 10, 0.5);
    ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) if ((i + f.n) % 5 !== 4) ctx.fillRect(x0 + i * 2 + (dx === 3 ? 1 : dx) - 1, y + down, 1, 0.5);
  }
  const sx = Math.round(f.stick * 3) - 1.5;
  ctx.fillStyle = '#3aff8a';
  ctx.fillRect(sx, 2, 3, 0.5); ctx.fillRect(sx + 1, 1.5, 1, 0.5);   // the ship
  if (f.press) { ctx.fillStyle = WHITE; ctx.fillRect(sx + 1.25, 1.5 - ((t * 9) % 1) * 4, 0.5, 0.5); }
}

// a top loader (24 x 24 px, its console at -y): its lid up against the console, the drum open with the washing in
// it; on its lid the washing folded and piled by the man beside it (`washing` { n, seed })
const DRUM = '#2a3038';
function washer(ctx, p) {
  if (p.lidOpen) {
    ctx.fillStyle = '#c8ccd2'; ctx.fillRect(-7.5, -5.6, 15, 1.2);   // the lid, stood up on its hinge
    ctx.fillStyle = '#8a9098'; ctx.fillRect(-7.5, -4.4, 15, 0.5);
    ctx.fillStyle = '#5a626c'; ctx.beginPath(); ctx.arc(0, 1.6, 6, 0, Math.PI * 2); ctx.fill();   // the tub's rim
    ctx.fillStyle = DRUM; ctx.beginPath(); ctx.arc(0, 1.6, 5.2, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) {                                    // what is left of the washing in the drum
      const a = i * 1.7 + 0.4, [col] = PIECES[(i * 3) % PIECES.length];
      ctx.fillStyle = col; ctx.globalAlpha = 0.75;
      ctx.fillRect(Math.cos(a) * 2.2 - 1.5, 1.6 + Math.sin(a) * 2.2 - 1, 3, 2);
    }
    ctx.globalAlpha = 1;
  }
  const w = p.washing;
  for (let i = 0; i < (w?.n || 0); i++) {
    const [col, dark] = PIECES[Math.floor(hash(i * 2.3 + w.seed) * PIECES.length)];
    const ox = (hash(i + w.seed) - 0.5) * 1.2, oy = 3 - i * 0.6;      // each one a little higher up the pile
    ctx.fillStyle = '#0a0a10'; ctx.fillRect(ox - 3.6, oy - 2.6, 7.2, 5.2);
    ctx.fillStyle = col; ctx.fillRect(ox - 3, oy - 2, 6, 4);
    ctx.fillStyle = dark; ctx.fillRect(ox - 3, oy - 0.25, 6, 0.5);
  }
}
