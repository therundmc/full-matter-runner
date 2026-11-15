// Small lives of the furniture, drawn over it: the balls on a pool table (systems/PoolBalls.js), the snow on a
// television left on (recipe `snow`), the receiver of a phone booth (prop `handset`); the devices of a level
// (data/devices.js): the fire alarm flashing.

const RIM = '#0a2a18', WHITE = '#f4f2ea';
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const DEVICES = new Set(['fire_alarm']);

// ground pass, right after the props
export function drawPropLife(ctx, world, t, vis) {
  for (const p of world.props) {
    if (p.dead || p.parts || !vis(p.x, p.y)) continue;
    const snowy = p.rec?.snow && !p.lightsOut, hook = p.def.handset, device = DEVICES.has(p.type);
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
