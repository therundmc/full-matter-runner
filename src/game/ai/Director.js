// Squad brain (no DOM). Owns the global alert phase
//   normal -> caution (something odd) -> alert (player seen) -> evasion (lost him: sweep) -> caution -> normal,
// routes noises to the guards who can hear them, keeps the incidents left in the world (bodies, wrecked
// doors / windows / walls) as evidence, runs search sweeps and the claims on tactical spots, and hands out a
// per-step budget for expensive work (path-finding, cover searches).
// Listens on world.events: 'noise', 'kill', 'wallDestroyed', 'windowBroken', 'doorBroken'.
// Emits: 'alertPhase' { phase, prev }.
import { AI, PALETTE, TILE } from '../Config.js';
import { pick } from '../../engine/math.js';
import { searchPoints } from './Tactics.js';

const BARK_COLOR = {
  contact: PALETTE.pink, panic: PALETTE.pink, snap: PALETTE.pink, body: PALETTE.orange, help: PALETTE.orange, warn: PALETTE.orange,
};

export default class Director {
  constructor(world) {
    this.world = world;
    this.phase = 'normal';
    this.phaseT = 0;            // seconds left in caution / evasion
    this.lastKnown = null;      // squad-wide last confirmed player position
    this.lastSightT = -99;
    this.incidents = [];
    this.searchPts = [];
    this.searchOrigin = null;
    this.claims = new Map();    // guard -> {x, y} tactical spot
    this.heardAt = new Map();   // noise source -> last time heard (automatic fire throttling)
    this.doorSeen = new Map();
    this.lastCallIn = null;
    this.stepT = 0;
    this.budgetLeft = AI.planBudget;
    this.barkAt = -99;
    this.provoked = false;      // the player gave himself away (see isThreat)
    const ev = world.events;
    ev.on('noise', (e) => this.onNoise(e));
    ev.on('kill', (e) => this.onKill(e));
    ev.on('wallDestroyed', (e) => this.incident('wall', e.x, e.y));
    ev.on('windowBroken', (e) => this.incident('window', e.x, e.y));
    ev.on('doorBroken', (e) => this.incident('door', e.x, e.y));
  }

  get vigilance() { return AI.vigilance[this.phase]; }
  get alive() { return this.world.enemies.filter((e) => e.alive); }

  setPhase(p, t = 0) {
    this.phaseT = t;
    if (p === this.phase) return;
    const prev = this.phase;
    this.phase = p;
    this.world.events.emit('alertPhase', { phase: p, prev });
  }

  // expensive work allowance for this step: false = try again next step
  budget(cost) {
    if (this.budgetLeft < cost) return false;
    this.budgetLeft -= cost;
    return true;
  }

  // ---------------- per step ----------------
  update(dt) {
    const w = this.world, p = w.player;
    this.budgetLeft = AI.planBudget;
    // player footsteps (he always runs when moving)
    if (p.alive && p.moving > 1.8 && (this.stepT -= dt) <= 0) {
      this.stepT = 0.28;
      this.emit('footsteps', p.x, p.y, AI.footstepRadius, p);
    }
    // a door swung by the player catches the eye
    for (const d of w.doors) {
      if (d.pushedByPlayer <= 0 || Math.abs(d.body.angularVelocity) < 0.03 || (this.doorSeen.get(d) ?? 0) > w.time) continue;
      this.doorSeen.set(d, w.time + 0.6);
      const t = d.tip(), mx = (d.hx + t.x) / 2, my = (d.hy + t.y) / 2;
      for (const e of w.enemies) if (e.alive && e.aware < 2 && e.canSeePoint(mx, my, 0.8)) e.hear('door', mx, my);
    }
    this.tick(dt);
  }

  // phase timers
  tick(dt) {
    const w = this.world;
    if (this.phase === 'alert' && w.time - this.lastSightT > AI.alertLinger) this.startEvasion();
    else if (this.phase === 'evasion' && (this.phaseT -= dt) <= 0) {
      this.setPhase('caution', AI.caution);
      for (const e of this.alive) e.standDown();
    } else if (this.phase === 'caution' && (this.phaseT -= dt) <= 0) this.setPhase('normal');
  }

  // ---------------- noise ----------------
  // world.noise() -> 'noise' event. Untyped noises (engines, crashes) are just 'noise'.
  onNoise({ x, y, radius, source, type }) {
    if (!(radius > 0)) return;
    const w = this.world;
    if (source) {
      if (w.time - (this.heardAt.get(source) ?? -99) < AI.noiseGap) return;
      this.heardAt.set(source, w.time);
    }
    if (type === 'gunshot' && source?.isEnemy) type = 'allyFire';
    this.emit(type || 'noise', x, y, radius, source);
  }

  // every guard in range hears it; walls muffle the far half of the radius
  emit(type, x, y, radius, source = null) {
    const w = this.world;
    for (const e of w.enemies) {
      if (!e.alive || e === source || e.knocked > 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius) continue;
      if (d > radius * 0.55 && !w.lineOfSight(e.x, e.y, x, y)) continue;
      if (type === 'gunshot' && source === w.player) this.provoked = true;
      e.hear(type, x, y, source);
    }
  }

  // ---------------- the player's cover ----------------
  // Guards mind their own business as long as the player is empty-handed, outside the level's guarded `premises`
  // ([col0, row0, col1, row1] tile rectangles), and nobody caught him at anything. A level without premises is
  // hostile ground everywhere. Once he is made (spotted as a threat, heard shooting, a guard down) it is for good.
  isThreat(p) {
    const zones = this.world.level?.premises;
    if (this.provoked || !zones || p.armed) return true;
    const x = p.x / TILE, y = p.y / TILE;
    return zones.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 + 1 && y >= y0 && y < y1 + 1);
  }

  // ---------------- incidents ----------------
  incident(kind, x, y, extra = {}) {
    const inc = { kind, x, y, t: this.world.time, seen: new Set(), reported: this.phase === 'alert' || this.phase === 'evasion', ...extra };
    this.incidents.push(inc);
    return inc;
  }

  onKill({ victim }) {
    if (!victim.isEnemy) return;
    const w = this.world;
    this.provoked = true; // a guard is down: no more benefit of the doubt
    this.release(victim);
    const inc = this.incident('body', victim.x, victim.y);
    // a guard who never comes back to his post is missed after a while
    if (!victim.roam) this.incident('missing', victim.home.x, victim.home.y, { after: w.time + 10 });
    this.emit('body', victim.x, victim.y, AI.bodyFallRadius * (victim.held ? 0.4 : 1), victim); // let down quietly
    for (const e of w.enemies) {
      if (e === victim || !e.alive || e.knocked > 0) continue;
      if (e.canSeePoint(victim.x, victim.y, 1, 120)) { inc.seen.add(e); e.witnessKill(victim); }
    }
  }

  // a guard reports something: the squad goes to CAUTION and sends a pair of idle guards to look around
  callIn(by, x, y) {
    for (const inc of this.incidents) if (Math.hypot(inc.x - x, inc.y - y) < 120) inc.reported = true;
    this.raise();
    const last = this.lastCallIn, now = this.world.time;
    if (last && now - last.t < 10 && Math.hypot(last.x - x, last.y - y) < 160) return;
    this.lastCallIn = { x, y, t: now };
    const pts = searchPoints(this.world.map, x, y, 7, 4);
    const free = this.alive.filter((e) => e !== by && e.aware === 0 && e.knocked <= 0 && Math.hypot(e.x - x, e.y - y) < 700)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    for (let i = 0; i < Math.min(2, free.length); i++) {
      const p = pts[Math.min(i + 1, pts.length - 1)];
      free[i].investigate(p.x, p.y, 'callin', false);
    }
  }

  // incident or suspicious noise: at least CAUTION (timer restarts)
  raise() {
    if (this.phase === 'normal' || this.phase === 'caution') this.setPhase('caution', AI.caution);
  }

  // ---------------- combat coordination ----------------
  sighted(x, y) {
    this.lastKnown = { x, y };
    this.lastSightT = this.world.time;
    this.provoked = true;
    if (this.phase !== 'alert') this.setPhase('alert');
  }

  // "contact!": a few nearby guards converge, the others hold and watch the area
  shout(from) {
    if (!this.lastKnown) return;
    const { x, y } = this.lastKnown;
    let hunters = this.hunters();
    const near = this.alive.filter((e) => e !== from && e.aware < 2 && e.knocked <= 0 && Math.hypot(e.x - from.x, e.y - from.y) < AI.shoutRadius)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    for (const e of near) {
      if (hunters < AI.maxHunters) { e.joinHunt(x, y); hunters++; } else e.guard(x, y);
    }
  }

  // guards currently fighting / hunting the player
  hunters() {
    let n = 0;
    for (const e of this.world.enemies) if (e.alive && e.aware === 2) n++;
    return n;
  }

  // squad members already covering the target, as angles seen from it
  coverage(target, except) {
    const out = [];
    for (const e of this.world.enemies) {
      if (e !== except && e.alive && e.state === 'combat' && e.knocked <= 0 && this.world.time - e.seenAt < 2) {
        out.push(Math.atan2(e.y - target.y, e.x - target.x));
      }
    }
    return out;
  }

  // at most one flanker (two in a big fight); the guard closest to the target pins him down
  wantsFlank(e) {
    const p = this.world.player;
    let engaged = 0, flankers = 0, closest = null, cd = Infinity;
    for (const o of this.world.enemies) {
      if (!o.alive || o.state !== 'combat' || o.knocked > 0) continue;
      engaged++;
      if (o !== e && o.tactic === 'flank') flankers++;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < cd) { cd = d; closest = o; }
    }
    return engaged >= 2 && closest !== e && flankers < (engaged >= 4 ? 2 : 1);
  }

  claim(e, x, y) { this.claims.set(e, { x, y }); }
  release(e) {
    this.claims.delete(e);
    for (const p of this.searchPts) if (p.owner === e) p.owner = null;
  }
  isClaimed(x, y, except) {
    for (const [e, c] of this.claims) if (e !== except && e.alive && Math.hypot(c.x - x, c.y - y) < 28) return true;
    return false;
  }

  // ---------------- search sweep ----------------
  startEvasion() {
    this.setPhase('evasion', AI.evasion);
    const lk = this.lastKnown;
    if (!lk) return;
    this.ensureSearch();
    const searchers = this.alive.filter((e) => e.knocked <= 0 && (e.aware === 2 || e.state === 'search' || Math.hypot(e.x - lk.x, e.y - lk.y) < 450))
      .sort((a, b) => Math.hypot(a.x - lk.x, a.y - lk.y) - Math.hypot(b.x - lk.x, b.y - lk.y)).slice(0, AI.searchers);
    for (const e of searchers) if (e.state !== 'search' || e.localPts) e.beginSearch();
  }

  // search spots around the last known position (kept while it doesn't move)
  ensureSearch() {
    const lk = this.lastKnown, o = this.searchOrigin;
    if (!lk || (o && Math.hypot(o.x - lk.x, o.y - lk.y) < 96 && this.searchPts.some((p) => !p.done))) return;
    this.searchOrigin = { x: lk.x, y: lk.y };
    this.searchPts = searchPoints(this.world.map, lk.x, lk.y, AI.searchTiles, AI.searchSpots).map((p) => ({ ...p, owner: null, done: false }));
  }

  // every searcher takes a different spot: close to him, close to where the target vanished
  nextSearchPoint(e) {
    this.ensureSearch();
    let best = null, bs = Infinity;
    const lk = this.lastKnown || e;
    for (const p of this.searchPts) {
      if (p.done || (p.owner && p.owner !== e && p.owner.alive)) continue;
      const s = Math.hypot(p.x - e.x, p.y - e.y) + Math.hypot(p.x - lk.x, p.y - lk.y) * 0.6;
      if (s < bs) { bs = s; best = p; }
    }
    if (best) best.owner = e;
    return best;
  }

  // ---------------- barks ----------------
  // short floating line over a guard (world texts); one at a time for the whole squad so it stays readable
  bark(e, kind, lines) {
    const w = this.world;
    if (w.time - this.barkAt < AI.barkGap && kind !== 'contact') return false;
    this.barkAt = w.time;
    w.texts.push({ x: e.x, y: e.y - 16, str: pick(lines), t: 1.4, dur: 1.4, color: BARK_COLOR[kind] || PALETTE.white });
    return true;
  }
}
