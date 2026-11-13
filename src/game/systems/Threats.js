// What the player can plausibly know about the guards he cannot see (DOM-free). Feeds the faint off-screen markers
// (ui/Indicators.js). A guard only counts once he gave himself away: he is after the player, he was heard (shot,
// shout, running steps) or he was on screen a moment ago. A quiet guard never seen gets nothing: no free radar.
import { INDICATORS } from '../Config.js';

// 1 right after the fact, 0 once `dur` s have passed
const fade = (age, dur) => (age >= dur ? 0 : age <= 0 ? 1 : 1 - age / dur);

// Marker strength 0..1 for a guard (0 = no marker).
// g: { alive, knocked, aware (0 unaware, 1 suspicious, 2 after the player), seenAt, heardAt } (world times)
export function awareness(g, now, R = INDICATORS) {
  if (!g.alive || g.knocked > 0) return 0;
  const known = g.aware === 2 ? 1 : g.aware === 1 ? R.suspicious : 0;
  return Math.max(known, fade(now - g.heardAt, R.heardFor), fade(now - g.seenAt, R.seenFor) * R.seen);
}

// Where the marker of a point outside the W x H screen goes: on the border (pulled in by `inset`), toward it.
// `beyond` = how far past the edge the point is (screen px). null when the point is on screen.
export function edgeMarker(sx, sy, W, H, inset) {
  if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) return null;
  const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
  const ax = Math.abs(dx) || 1e-6, ay = Math.abs(dy) || 1e-6;
  const k = Math.min((cx - inset) / ax, (cy - inset) / ay);
  const edge = Math.min(cx / ax, cy / ay);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx), beyond: Math.hypot(dx, dy) * (1 - edge) };
}

export default class Threats {
  constructor(world, rules = INDICATORS) {
    this.world = world;
    this.rules = rules;
    this.memo = new Map(); // guard -> { seenAt, heardAt, firedAt }
    world.events.on('noise', ({ source, type }) => {
      if (!source?.isEnemy) return;
      const m = this.of(source);
      m.heardAt = world.time;
      if (type === 'gunshot') m.firedAt = world.time;
    });
    world.events.on('kill', ({ victim }) => this.memo.delete(victim));
  }

  of(e) {
    let m = this.memo.get(e);
    if (!m) this.memo.set(e, m = { seenAt: -99, heardAt: -99, firedAt: -99 });
    return m;
  }

  // view: visible world rectangle { x, y, hw, hh } (centre, half sizes)
  update(view) {
    const w = this.world, now = w.time;
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const m = this.of(e);
      if (Math.abs(e.x - view.x) < view.hw && Math.abs(e.y - view.y) < view.hh) m.seenAt = now;
      // talking out loud or running: he can be heard
      if (e.barkT > 0 || e.moving > this.rules.runSpeed) m.heardAt = now;
    }
  }

  strength(e) {
    const m = this.memo.get(e);
    if (!m) return 0;
    return awareness({ alive: e.alive && !e.yielded, knocked: e.knocked, aware: e.aware, seenAt: m.seenAt, heardAt: m.heardAt }, this.world.time, this.rules);
  }

  // he has the player in his sights, or just fired
  aiming(e) {
    const m = this.memo.get(e);
    return (e.aware === 2 && !!e.sees) || (!!m && this.world.time - m.firedAt < 0.5);
  }
}
