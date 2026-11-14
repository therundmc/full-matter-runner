// Running water: drops falling from the canopy's scallops and from the air conditioner, the drainpipe's shoe gushing,
// streaks sliding down the bar's window and the phone booth's glass, beads on the parked car (a few sliding).
import { M, MY, GY, canvas, rand, cropTo } from './Draw.js';
import { hash } from './Timeline.js';
import { WIN, BOOTH } from './Layout.js';

// a drop that swells at (x0, y0), lets go and falls to `floor`, bent by the wind; a tick where it lands
function drip(g, t, i, x0, y0, floor, per, slant, col, ox, oy) {
  const a = (t + hash(i * 1.37) * per) % per, hang = 0.5 * per;
  g.fillStyle = col;
  if (a < hang) { if (a > hang * 0.5) g.fillRect(x0 + ox, y0 + oy, 1, 1); return; }
  const f = a - hang, y = y0 + 1 + 150 * f * f + 15 * f;
  if (y > floor + 2) return;
  if (y > floor) { g.fillRect(x0 - Math.round(slant * (floor - y0) * 0.4) - 1 + ox, floor - 1 + oy, 3, 1); return; }
  g.fillRect(Math.round(x0 - slant * (y - y0) * 0.4) + ox, Math.round(y) + oy, 1, 2);
}

// into the bar row (layer canvas): canopy drips, the AC unit's drip, the drainpipe's gush
export function drawBarWater(g, t, wind, rain) {
  for (let i = 0; i < 17; i++) {
    const x = 171 + i * 3;
    drip(g, t, i, x, 110, GY - 1, 0.8 + hash(i + 0.4) * 0.9 - rain * 0.25, wind.slant, i % 3 ? 'rgba(255,190,170,0.6)' : 'rgba(255,150,200,0.6)', M, MY);
  }
  drip(g, t, 40, 88, 72, 99, 1.6, wind.slant, 'rgba(200,190,220,0.55)', M, MY);
  // the shoe of the drainpipe spits a short arc of water onto the pavement
  const k = 0.6 + 0.4 * rain;
  for (let j = 0; j < 6; j++) {
    const f = ((t * 3 + j / 6) % 1), x = 299 + f * 3 * k, y = GY - 2 + f * f * 3;
    if (hash(j + Math.floor(t * 20)) < 0.2) continue;
    g.fillStyle = j % 2 ? 'rgba(255,214,170,0.75)' : 'rgba(190,180,210,0.6)';
    g.fillRect(Math.round(x) + M, Math.round(y) + MY, 1, 1);
  }
  g.fillStyle = 'rgba(220,210,235,0.35)';
  for (let j = 0; j < 3; j++) if (hash(j * 3.1 + Math.floor(t * 15)) > 0.4) g.fillRect(300 + j * 2 + M, GY - 1 + MY, 1, 1);
}

// streaks sliding down a pane: a trickle's head runs down in jerks, a wet trail behind it; static beads around
function trickles(g, t, x0, y0, w, h, n, seed, head, trail) {
  for (let i = 0; i < n; i++) {
    const sp = 6 + hash(seed + i) * 10, per = (h + 10) / sp, a = (t + hash(seed + i + 0.5) * per) % per;
    const jerk = a * sp + Math.sin(a * 5 + i) * 1.5, y = Math.round(jerk) - 4;
    const x = x0 + Math.round(1 + hash(seed + i * 2.7) * (w - 3) + Math.sin(y * 0.3 + i) * 0.7);
    for (let k = 0; k < 7; k++) {
      const yy = y - k;
      if (yy < 0 || yy >= h) continue;
      g.fillStyle = k ? trail : head;
      g.fillRect(x, y0 + yy, 1, 1);
    }
  }
}
// on the bar's window canvas (its own coords)
export function drawWindowWater(g, t) {
  trickles(g, t, 0, 0, WIN.w, WIN.h, 6, 11, 'rgba(255,240,210,0.7)', 'rgba(255,225,180,0.16)');
  const r = rand(5);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * WIN.w), y = Math.floor(r() * WIN.h);
    g.fillStyle = 'rgba(255,236,200,0.45)'; g.fillRect(x, y, 1, 1);
    g.fillStyle = 'rgba(40,12,4,0.35)'; g.fillRect(x, y + 1, 1, 1);
  }
}
// on the phone booth's glass (screen, at the booth's offset)
export function drawBoothWater(ctx, t, ox, oy) {
  trickles(ctx, t, BOOTH.x + 2 + ox, BOOTH.y - BOOTH.h + 6 + oy, BOOTH.w - 4, BOOTH.h - 11, 4, 31, 'rgba(235,250,255,0.75)', 'rgba(200,230,255,0.18)');
}

// beads on the car's glass and trunk, catching the neon (built once); a few sliding down the rear window (live)
export function buildCarBeads() {
  const { c, g } = canvas(), r = rand(91);
  g.translate(M, MY);
  const bead = (x, y, a) => { g.fillStyle = `rgba(255,170,215,${a})`; g.fillRect(x, y, 1, 1); g.fillStyle = 'rgba(8,2,8,0.5)'; g.fillRect(x, y + 1, 1, 1); };
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(-56 + r() * 92), y = Math.floor(141 + r() * 14);
    if (y < 140 + Math.max(0, x - 22) * 1.07) continue;    // only on the side glass
    bead(x, y, 0.35 + r() * 0.5);
  }
  for (let i = 0; i < 18; i++) bead(Math.floor(48 + r() * 44), Math.floor(158 + r() * 9), 0.2 + r() * 0.3);
  for (let i = 0; i < 26; i++) bead(Math.floor(-56 + r() * 78), 137 + Math.floor(r() * 2), 0.3 + r() * 0.4);
  return cropTo(c, 0, 130 + MY, 170, 185 + MY);
}
export function drawCarWater(ctx, t, fx, fy) {
  for (let i = 0; i < 5; i++) {
    const per = 3 + hash(i + 7) * 3, a = (t + hash(i) * per) % per, x0 = -50 + hash(i + 3) * 60;
    const y = 141 + Math.min(14, a * a * 3);
    ctx.fillStyle = 'rgba(255,200,230,0.8)'; ctx.fillRect(Math.round(x0) + fx, Math.round(y) + fy, 1, 1);
    ctx.fillStyle = 'rgba(255,170,215,0.18)'; ctx.fillRect(Math.round(x0) + fx, 141 + fy, 1, Math.max(0, Math.round(y) - 141));
  }
}
