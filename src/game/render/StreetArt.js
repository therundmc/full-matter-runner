// Small things lying about that have no body. Loose paper on the pavement (systems/Papers.js): scraps a few
// pixels across, pale but dimmer than anything that matters on the ground; lifted off their shadow while they
// fly. Cigarettes left burning in an ashtray by customers who ran (systems/Ambient.js `butts`).

const TINTS = ['#cfc9b8', '#bdb7a6', '#d9d4c6'];
const SHAPES = [[4, 3], [3, 4], [3, 3], [4, 2]];

export function drawPapers(ctx, papers, vis) {
  for (const s of papers.list) {
    if (!vis(s.x, s.y)) continue;
    const [w, h] = SHAPES[Math.floor(s.rot) & 3], x = Math.round(s.x), y = Math.round(s.y);
    const up = Math.min(3, Math.floor(Math.hypot(s.vx, s.vy) / 15));
    if (up) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = TINTS[s.tint];
    ctx.fillRect(x - up, y - up * 2, w, h);
  }
}

// a small ashtray, the cigarette on its rim, its ember
export function drawButts(ctx, butts, vis) {
  for (const b of butts) {
    if (!vis(b.x, b.y)) continue;
    const x = Math.round(b.x), y = Math.round(b.y);
    ctx.fillStyle = '#14161c'; ctx.fillRect(x - 3, y - 2, 6, 4); ctx.fillRect(x - 2, y - 3, 4, 6);
    ctx.fillStyle = '#6a7480'; ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = '#2a2e36'; ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.fillStyle = '#e8e2d2'; ctx.fillRect(x, y - 1, 3, 1);
    ctx.fillStyle = '#ff8a3a'; ctx.fillRect(x + 3, y - 1, 1, 1);
  }
}
