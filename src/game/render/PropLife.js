// Small lives of the furniture, drawn over it: the balls on a pool table (systems/PoolBalls.js), the snow on a
// television left on (recipe `snow`) and, over the night, the specks a mirror ball (prop `sparkle`) throws round
// its room.

const RIM = '#0a2a18', WHITE = '#f4f2ea', SPECKS = ['#ffffff', '#ff7ab8', '#7ae8ff'];
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ground pass, right after the props
export function drawPropLife(ctx, world, t, vis) {
  for (const p of world.props) {
    if (p.dead || p.parts || !vis(p.x, p.y)) continue;
    const snowy = p.rec?.snow && !p.lightsOut;
    if (p.type !== 'pool_table' && !snowy) continue;
    const o = p.centre(), k = p.kick;
    ctx.save();
    ctx.translate(o.x + k.x, o.y + k.y);
    ctx.rotate(p.body.angle + k.r);
    if (snowy) snow(ctx, p, t);
    else for (const b of world.poolBalls.balls(p)) if (!b.in) ball(ctx, b);
    ctx.restore();
  }
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

// additive, over the night: specks turning both ways round the ball, stopped by the walls
export function drawSparkle(ctx, world, t, vis) {
  for (const p of world.props) {
    const n = p.def.sparkle;
    if (!n || p.dead || p.parts || !vis(p.x, p.y)) continue;
    const bx = p.x + p.kick.x, by = p.y + p.kick.y;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const r = 14 + hash(i * 7.3) * 62, a = t * (i % 2 ? 0.5 : -0.36) + i * 2.4;
      const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r * 0.75;
      if (!world.lineOfSight(bx, by, x, y)) continue;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 2.3 + i * 1.7);
      ctx.fillStyle = SPECKS[i % 3];
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
