// A toll lane's signal drawn as a tell (render/PursuitArt.js over the lane's mouth, ui/HUD.js on the screen's edge):
// the same look as the lane signals over the islands (props lane_signal_go / _stop). Plain canvas, no imports.

// A lane's signal, `size` px square centred on (x, y): its black box, a bone rim, lit as the toll's lane signals
// are (props lane_signal_go / _stop): a green arrow on along the road (go: this way through), or a red X (shut)
export function laneSign(ctx, x, y, size, go, alpha = 1) {
  const h = size / 2, u = size / 12;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#0c0c12';
  ctx.strokeStyle = '#efe6d2';
  ctx.lineWidth = Math.max(1, u * 0.7);
  ctx.beginPath();
  ctx.rect(x - h, y - h, size, size);
  ctx.fill();
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = go ? '#2af08a' : '#ff2a4a';
  ctx.lineWidth = u * 1.8;
  ctx.beginPath();
  if (go) {
    ctx.moveTo(x - 3.5 * u, y); ctx.lineTo(x + 3.5 * u, y);
    ctx.moveTo(x + 0.5 * u, y - 3 * u); ctx.lineTo(x + 3.5 * u, y); ctx.lineTo(x + 0.5 * u, y + 3 * u);
  } else {
    ctx.moveTo(x - 3 * u, y - 3 * u); ctx.lineTo(x + 3 * u, y + 3 * u);
    ctx.moveTo(x + 3 * u, y - 3 * u); ctx.lineTo(x - 3 * u, y + 3 * u);
  }
  ctx.stroke();
  ctx.restore();
}
