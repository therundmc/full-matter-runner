// Rounds that go by close or strike near somebody (DOM-free, tests/flinch.test.mjs): a guard shot at and missed
// flinches (Character.flinchFrom, drawn by CharacterAnim: head ducked, shoulders hunched, turned away), and the
// player's camera is nudged by rounds striking the wall by him or whizzing past. Fed by the world's events 'round' (a
// round's way over one step) and 'strike' (where one hit anything but a man). Numbers: FLINCH in data/feel.js.
// No gameplay in it: nobody is slowed, hurt or turned by it.
import { FLINCH } from '../data/feel.js';

const PASS = { d: 0, t: 0, qx: 0, qy: 0 };

// where the segment (x0, y0)-(x1, y1) comes closest to (px, py): its distance d, the share t along it (unclamped:
// outside 0..1 the round was not yet level with him, or already past, over this step) and that point (qx, qy)
export function passBy(px, py, x0, y0, x1, y1, out = PASS) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0, u = Math.max(0, Math.min(1, t));
  out.t = t; out.qx = x0 + dx * u; out.qy = y0 + dy * u;
  out.d = Math.hypot(px - out.qx, py - out.qy);
  return out;
}

// how hard one flinches from something `gap` px from his body's edge, within `reach` px (0: not at all .. 1)
export const flinchOf = (gap, reach) => (gap >= reach ? 0 : 1 - Math.max(0, gap) / reach);

// the side of a man facing `a` that the point (qx, qy) is on: 1 his right, -1 his left
export const sideOf = (cx, cy, a, qx, qy) => ((qx - cx) * -Math.sin(a) + (qy - cy) * Math.cos(a) >= 0 ? 1 : -1);

export default class Flinch {
  constructor(world) {
    this.world = world;
    this.nudgeT = -Infinity; // world time of the last nudge of the player's camera
    world.events.on('round', (e) => this.round(e));
    world.events.on('strike', (e) => this.strike(e));
  }

  // a round flew (x0, y0) -> (x1, y1) this step
  round({ x0, y0, x1, y1, owner, team }) {
    const F = FLINCH;
    for (const c of this.world.enemies) {
      if (!c.alive || c.knocked || c === owner || c.team === team) continue;
      const p = passBy(c.x, c.y, x0, y0, x1, y1);
      if (p.t <= 0 || p.t >= 1 || p.d < 0.5) continue; // not level with him over this step (or through him: a hit)
      const k = flinchOf(p.d - c.radius, F.near);
      if (k > 0) c.flinchFrom(k, Math.atan2(c.y - p.qy, c.x - p.qx), sideOf(c.x, c.y, c.angle, p.qx, p.qy));
    }
    const pl = this.world.player;
    if (!pl?.alive || owner === pl) return;
    const p = passBy(pl.x, pl.y, x0, y0, x1, y1);
    if (p.t > 0 && p.t < 1 && p.d >= 0.5) this.nudge(pl, p.qx, p.qy, flinchOf(p.d - pl.radius, F.camera.whiz));
  }

  // a round struck (x, y): a wall, a prop, a door, a pane
  strike({ x, y, owner, team }) {
    const F = FLINCH;
    for (const c of this.world.enemies) {
      if (!c.alive || c.knocked || c === owner || c.team === team) continue;
      const k = flinchOf(Math.hypot(c.x - x, c.y - y) - c.radius, F.strike);
      if (k > 0) c.flinchFrom(k, Math.atan2(c.y - y, c.x - x), sideOf(c.x, c.y, c.angle, x, y));
    }
    const pl = this.world.player;
    if (pl?.alive && owner !== pl) this.nudge(pl, x, y, flinchOf(Math.hypot(pl.x - x, pl.y - y) - pl.radius, F.camera.radius));
  }

  // the player's camera knocked off (x, y), k 0..1 (once every FLINCH.camera.gap s at most)
  nudge(pl, x, y, k) {
    const C = FLINCH.camera, w = this.world;
    if (k <= 0 || w.time - this.nudgeT < C.gap) return;
    this.nudgeT = w.time;
    const a = Math.atan2(pl.y - y, pl.x - x);
    w.camera.push(Math.cos(a) * C.push * k, Math.sin(a) * C.push * k);
    w.shake(C.shake * k);
  }
}
