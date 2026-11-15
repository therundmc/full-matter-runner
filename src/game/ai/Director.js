// Squad brain (no DOM). Owns the global alert phase
//   normal -> caution (something odd) -> alert (player seen) -> evasion (lost him: sweep) -> caution -> normal,
// routes noises to the guards who can hear them, keeps the incidents left in the world (bodies, wrecked
// doors / windows / walls) as evidence, runs search sweeps and the claims on tactical spots, and hands out a
// per-step budget for expensive work (path-finding, cover searches). It also keeps the trail of prints the
// player's wet or bloody soles leave behind (ai/Trail.js), which one guard at a time may follow. It voices the
// squad: one bark at a time, never a line just said (bark), each guard's name (nickOf), and where the player is
// (report).
// Listens on world.events: 'noise', 'kill', 'wallDestroyed', 'windowBroken', 'doorBroken', 'footprint'.
// Emits: 'alertPhase' { phase, prev }.
import { AI, PALETTE, TILE } from '../Config.js';
import { chance, rand } from '../../engine/math.js';
import { BARKS, BARK_TONE, URGENT } from '../data/barks.js';
import { lineFor, freeName, placeOf } from './Barks.js';
import { searchPoints } from './Tactics.js';
import Trail from './Trail.js';

// is the point inside one of the [col0, row0, col1, row1] tile rectangles (inclusive)?
function inZones(zones, p) {
  const x = p.x / TILE, y = p.y / TILE;
  return !!zones && zones.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 + 1 && y >= y0 && y < y1 + 1);
}

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
    this.said = [];             // the last lines barked (see bark)
    this.kindAt = {};           // occasion -> when it was last said
    this.place = null;          // where the player is (playerPlace), worked out at placeT
    this.placeT = -99;
    this.placeSaid = null;      // the last place of his called out (report), and when
    this.placeSaidAt = -99;
    this.bossSpoke = false;     // the boss has had his word (Enemy.bossLine)
    for (const e of world.enemies || []) this.nickOf(e);
    this.provoked = false;      // the player gave himself away (see isThreat)
    this.trail = new Trail();   // the player's footprints
    const ev = world.events;
    ev.on('noise', (e) => this.onNoise(e));
    ev.on('kill', (e) => this.onKill(e));
    ev.on('wallDestroyed', (e) => this.incident('wall', e.x, e.y));
    ev.on('windowBroken', (e) => this.incident('window', e.x, e.y));
    ev.on('doorBroken', (e) => this.incident('door', e.x, e.y));
    ev.on('powerCut', (e) => this.incident('power', e.x, e.y)); // whoever comes to look finds the box smashed
    ev.on('footprint', (e) => { if (e.who.isPlayer) this.trail.add(e.x, e.y, e.angle, e.kind, world.time); });
  }

  get vigilance() { return AI.vigilance[this.phase]; }
  get alive() { return this.world.enemies.filter((e) => e.alive && !e.yielded); } // still in the fight
  // the guard following the player's footprints, if any (one is enough)
  get tracker() { return this.world.enemies.find((e) => e.alive && e.knocked <= 0 && e.state === 'track'); }

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
    // A stranger nobody has anything against (isThreat) walks about and pushes doors like any customer: no guard
    // pricks up his ears at it. Only somebody who has no business being there, or who gave himself away, is listened for.
    const minded = this.isThreat(p);
    // player footsteps (he always runs when moving)
    if (minded && p.alive && p.moving > 1.8 && (this.stepT -= dt) <= 0) {
      this.stepT = 0.28;
      this.emit('footsteps', p.x, p.y, AI.footstepRadius, p);
    }
    // a door swung by the player catches the eye
    for (const d of w.doors) {
      if (!minded || d.pushedByPlayer <= 0 || Math.abs(d.body.angularVelocity) < 0.03 || (this.doorSeen.get(d) ?? 0) > w.time) continue;
      this.doorSeen.set(d, w.time + 0.6);
      const t = d.tip(), mx = (d.hx + t.x) / 2, my = (d.hy + t.y) / 2;
      for (const e of w.enemies) if (e.alive && e.aware < 2 && e.canSeePoint(mx, my, 0.8)) e.hear('door', mx, my);
    }
    this.tick(dt);
  }

  // phase timers
  tick(dt) {
    const w = this.world;
    this.trail.prune(w.time);
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

  // every guard in range hears it; walls muffle the far half of the radius; a jukebox turned up drowns the small
  // noises around it (systems/Jukebox.js)
  emit(type, x, y, radius, source = null) {
    const w = this.world;
    if (w.jukebox) radius = w.jukebox.mask(x, y, radius, type);
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
    return this.provoked || !zones || !!p.armed || inZones(zones, p);
  }

  // where a stranger is a customer (level `welcome` rectangles: a bar room), nobody tells him to clear off
  isGuest(p) { return inZones(this.world.level?.welcome, p); }

  // a harmless stranger who walked in where he has no business: a guard who sees him close goes after him at once
  isIntruder(p) { return !this.provoked && !p.armed && inZones(this.world.level?.premises, p); }

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
    const inc = this.incident('body', victim.x, victim.y, { who: victim });
    // a guard who never comes back to his post is missed after a while
    if (!victim.roam) this.incident('missing', victim.home.x, victim.home.y, { after: w.time + 10 });
    this.emit('body', victim.x, victim.y, AI.bodyFallRadius * (victim.held ? 0.4 : 1), victim); // let down quietly
    for (const e of w.enemies) {
      if (e === victim || !e.alive || e.knocked > 0 || e.yielded) continue;
      if (e.canSeePoint(victim.x, victim.y, 1, 120)) { inc.seen.add(e); e.witnessKill(victim); }
    }
    // the last man standing may lose his nerve the next time he faces the killer (Enemy.surrender)
    const left = this.alive, R = AI.surrender, B = AI.barks;
    if (left.length === 1 && w.totalEnemies >= R.squad) left[0].shaken = chance(left[0].kind === 'brute' ? R.brute : R.odds);
    // the last two of a real squad feel it: a moment later, they call out for the ones who are gone (Enemy.update)
    if (left.length <= 2 && w.totalEnemies >= R.squad) {
      for (const e of left) {
        if (e.lonely || !chance(B.lonely)) continue;
        e.lonely = true;
        e.mourn = { at: w.time + rand(...B.alone), N: victim.nick };
      }
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

  // "contact!": a few nearby guards converge, the others hold and watch the area. Returns the ones sent in.
  shout(from) {
    if (!this.lastKnown) return [];
    const { x, y } = this.lastKnown;
    let hunters = this.hunters();
    const near = this.alive.filter((e) => e !== from && e.aware < 2 && e.knocked <= 0 && Math.hypot(e.x - from.x, e.y - from.y) < AI.shoutRadius)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    const sent = [];
    for (const e of near) {
      if (hunters < AI.maxHunters) { e.joinHunt(x, y); hunters++; sent.push(e); } else e.guard(x, y);
    }
    return sent;
  }

  // is another guard in the fight within r px of e?
  engagedNear(e, r) {
    return this.alive.some((o) => o !== e && o.aware === 2 && o.knocked <= 0 && Math.hypot(o.x - e.x, o.y - e.y) < r);
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
    const searchers = this.alive.filter((e) => e.knocked <= 0 && e.state !== 'backup' && (e.aware === 2 || e.state === 'search' || Math.hypot(e.x - lk.x, e.y - lk.y) < 450))
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
  // Short floating line over a guard (world texts): one at a time for the whole squad so it stays readable (but the
  // URGENT ones), one man only says a given occasion (AI.barks.same), never a line the squad has just used, and the
  // most telling line its blanks can be filled for (ai/Barks.js lineFor; vars: { N, AT, P }). False if none is said.
  bark(e, kind, vars = {}) {
    const w = this.world, lines = BARKS[kind];
    if (!lines) return false;
    if (w.time - this.barkAt < AI.barkGap && !URGENT.has(kind)) return false;
    if (w.time - (this.kindAt[kind] ?? -99) < AI.barks.same) return false;
    const str = lineFor(lines, vars, this.said);
    if (!str) return false;
    this.barkAt = w.time;
    this.kindAt[kind] = w.time;
    this.said.push(str);
    if (this.said.length > AI.barkMemory) this.said.shift();
    // stacked over a line still floating there (two men side by side), not written across it
    let y = e.y - 16;
    for (let moved = true, n = 0; moved && n < 4; n++) {
      moved = false;
      for (const t of w.texts) if (!t.bubble && Math.abs(t.x - e.x) < 70 && Math.abs(t.y - y) < 9) { y = t.y - 9; moved = true; }
    }
    w.texts.push({ x: e.x, y, str, t: 1.4, dur: 1.4, color: PALETTE[BARK_TONE[kind]] || PALETTE.white });
    return true;
  }

  // his name for the others (data/barks.js NAMES, never two the same; the boss is BOSS), given on first need
  nickOf(e) {
    if (!e.nick) e.nick = e.boss ? 'BOSS' : freeName(new Set(this.world.enemies.map((o) => o.nick).filter(Boolean)));
    return e.nick;
  }

  // the named place (x, y) lies in ({ key, at, the }, ai/Barks.js placeOf), or null
  placeAt(x, y) {
    const w = this.world;
    return placeOf(w.level, w.map, w.props, x, y, AI.barks.landmark);
  }

  // where the player is now (worked out again every AI.barks.place s)
  playerPlace() {
    const w = this.world;
    if (w.time - this.placeT >= AI.barks.place) {
      this.placeT = w.time;
      this.place = this.placeAt(w.player.x, w.player.y);
    }
    return this.place;
  }

  // a guard with the player in sight calls out where he is, when it is somewhere new ("HE'S IN THE TOILETS!")
  report(e) {
    const pl = this.playerPlace(), now = this.world.time;
    if (!pl || pl.key === this.placeSaid || now - this.placeSaidAt < AI.barks.where) return false;
    if (!e.say('where', { AT: pl.at })) return false;
    this.placeSaid = pl.key;
    this.placeSaidAt = now;
    return true;
  }
}
