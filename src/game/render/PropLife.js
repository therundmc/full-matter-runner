// Small lives of the furniture, drawn over it: the balls on a pool table (systems/PoolBalls.js), the snow on a
// television left on (recipe `snow`), the receiver of a phone booth (prop `handset`), the arcade's attract mode, the
// flies over a bin (level prop option `flies`), a tap dripping in its sink (def `tap`), the till's display; the devices of a level
// (data/devices.js): the fire alarm flashing.

const RIM = '#0a2a18', WHITE = '#f4f2ea';
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
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
    if (p.type === 'arcade') { if (!p.lightsOut && !p.unpowered) inFrame(ctx, p, () => attract(ctx, attractFrame(t, p.x + p.y))); continue; }
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
