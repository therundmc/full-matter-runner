// Loose paper on the pavement (systems/Papers.js): scraps a few pixels across, pale but dimmer than anything that
// matters on the ground; lifted off their shadow while they fly.

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
