// A guard's nerve, worked out (no DOM): whether he runs to fetch the others instead of taking the player on alone,
// which of them he runs to, whether he gives himself up, and whether, on his knees, he goes for a gun once the
// player has turned his back. Pure functions of what is handed in (tuning: Config AI.backup / AI.surrender); the
// rolls and the moves are Enemy's.
import { AI } from '../Config.js';

// a guard who could be fetched: on his feet, not in the fight yet, not on his knees, not a lab dummy or asleep
export function free(e) {
  return e.alive && !e.yielded && !e.passive && !e.dormant && e.knocked <= 0 && e.aware < 2;
}

// Odds that a guard who just made contact runs for help: only when he is `alone` (nobody the shout reaches, nobody
// fighting near him) or `outgunned` (empty-handed or a blade / club against a gun), never with the player already
// on top of him (`dist` px), never the boss.
export function backupOdds(kind, { alone, outgunned, dist, boss = false }, B = AI.backup) {
  if (boss || (!alone && !outgunned) || dist < B.near) return 0;
  return Math.min(1, (B.odds[kind] ?? 0) * (outgunned ? B.outgunned : 1));
}

// Where he runs: the free guard, between B.far and B.reach px away, with the most free mates around him (within
// B.group px), the nearer the better. { to, size } (size: the free men there, him included) or null.
export function backupGroup(guards, from, B = AI.backup) {
  let best = null, bs = 0;
  for (const g of guards) {
    if (g === from || !free(g)) continue;
    const d = Math.hypot(g.x - from.x, g.y - from.y);
    if (d < B.far || d > B.reach) continue;
    let size = 0;
    for (const o of guards) if (o !== from && free(o) && Math.hypot(o.x - g.x, o.y - g.y) <= B.group) size++;
    const s = size / (1 + d / 400);
    if (s > bs) { bs = s; best = { to: g, size }; }
  }
  return best;
}

// the free guards around (x, y) he brings back with him, nearest first
export function recruits(guards, from, x, y, B = AI.backup) {
  return guards.filter((g) => g !== from && free(g) && Math.hypot(g.x - x, g.y - y) <= B.group)
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, B.bring);
}

// Odds (per check, every R.every s) that a guard gives himself up: empty-handed (or out of rounds), nobody of his
// in the fight near him, the armed player facing him within R.close px. The boss never does.
export function yieldOdds(kind, { unarmed, alone, playerArmed, dist, boss = false }, R = AI.surrender) {
  if (boss || !unarmed || !alone || !playerArmed || dist > R.close) return 0;
  return R.unarmed[kind] ?? 0;
}

// Is the player not watching a man on his knees: out of sight, or aiming more than R.turned rad away from him?
export function turnedAway(player, e, seen, R = AI.surrender) {
  if (!seen) return true;
  const a = Math.atan2(e.y - player.y, e.x - player.x);
  let d = Math.abs(player.angle - a) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d > R.turned;
}

// the loaded gun on the floor nearest him within R.grab px, or null
export function gunAtHand(items, e, R = AI.surrender) {
  let best = null, bd = R.grab;
  for (const it of items) {
    if (it.dead || it.def?.kind !== 'gun' || !(it.mag > 0)) continue;
    const d = Math.hypot(it.x - e.x, it.y - e.y);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
