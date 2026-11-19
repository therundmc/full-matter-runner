// Squad brain (no DOM). Owns the global alert phase
//   normal -> caution (something odd) -> alert (player seen) -> evasion (lost him: sweep) -> caution -> normal,
// routes noises to the guards who can hear them, keeps the incidents left in the world (bodies, wrecked
// doors / windows / walls) as evidence, runs search sweeps and the claims on tactical spots, and hands out a
// per-step budget for expensive work (path-finding, cover searches). It also keeps the trail of prints the
// player's wet or bloody soles leave behind (ai/Trail.js), which one guard at a time may follow. It voices the
// squad: one bark at a time, never a line just said (bark), each guard's name (nickOf), and where the player is
// (report).
// It watches the stranger nobody has anything against yet (watchConduct): something odd under a guard's eyes (in the
// premises, a blade in his hand, over the furniture, a window put in...) gets him a word from the nearest one
// (conduct, ai/Conduct.js) instead of the alarm; and while all is calm only the nearest guards go and look at a noise.
// Listens on world.events: 'noise', 'kill', 'wallDestroyed', 'windowBroken', 'doorBroken', 'footprint', 'slide',
// 'propHit'. Emits: 'alertPhase' { phase, prev }; Enemy emits 'challenge' { guard, act, stage } at each stage of a word.
import { AI, PALETTE, TILE } from '../Config.js';
import { opening } from './Conduct.js';
import { chance, rand } from '../../engine/math.js';
import { BARKS, BARK_TONE, URGENT } from '../data/barks.js';
import { lineFor, freeName, placeOf } from './Barks.js';
import { searchPoints } from './Tactics.js';
import { CellMemory, routeCells, pathCost } from './Nav.js';
import Trail from './Trail.js';

// what brings every guard who hears it, whatever the phase; any other noise only the nearest ones while all is calm
export const ALARMS = new Set(['gunshot', 'allyFire', 'explosion', 'body', 'wall', 'footsteps']);
// the stranger's own noises (made where he stands), that a guard who sees him takes him to task for
const ODD = new Set(['glass', 'thrown', 'door', 'noise', 'clatter']);
const gunInHand = (p) => !!p.armed && p.hasGun !== false;

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
    this.widened = false;       // the sweep has been taken further out once (nextSearchPoint)
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
    this.challenger = null;     // the guard having a word with the stranger (Enemy.challenge), one at a time
    this.letOff = [];           // when the stranger was last let off with a word (ai/Conduct.js opening)
    this.conductT = 0; this.lurkT = 0; this.lastVault = null; this.lastAct = null;
    this.trail = new Trail();   // the player's footprints
    this.danger = new CellMemory(); // where mates fell: the squad keeps off those tiles a while (ai/Nav.js)
    this.routes = new Map();    // guard in the fight -> { cells, t }: the way he takes, which the others avoid
    this.hot = new Set();       // tiles by a fire (worked out again every second: hotT)
    this.hotT = 0;
    const ev = world.events;
    ev.on('noise', (e) => this.onNoise(e));
    ev.on('kill', (e) => this.onKill(e));
    ev.on('wallDestroyed', (e) => this.incident('wall', e.x, e.y));
    ev.on('windowBroken', (e) => this.incident('window', e.x, e.y));
    ev.on('doorBroken', (e) => this.incident('door', e.x, e.y));
    ev.on('powerCut', (e) => this.incident('power', e.x, e.y)); // whoever comes to look finds the box smashed
    ev.on('footprint', (e) => { if (e.who.isPlayer) this.trail.add(e.x, e.y, e.angle, e.kind, world.time); });
    ev.on('slide', (e) => { if (e.ch?.isPlayer) this.conduct('slide', e.x, e.y); });
    ev.on('windowBroken', (e) => { if (e.by?.isPlayer) this.conduct('window', e.x, e.y, true); });
    // a blow of his landing on the furniture
    ev.on('propHit', (e) => {
      const p = world.player;
      if (p?.swing > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 60) this.conduct('smash', e.x, e.y, true);
    });
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
    this.watchConduct(dt);
    this.tick(dt);
  }

  // phase timers
  tick(dt) {
    const w = this.world;
    this.trail.prune(w.time);
    this.forget(w.time);
    if ((this.hotT -= dt) <= 0) { this.hotT = 1; this.findHot(); }
    if (this.phase === 'alert' && w.time - this.lastSightT > AI.alertLinger) this.startEvasion();
    else if (this.phase === 'evasion' && (this.phaseT -= dt) <= 0) {
      this.setPhase('caution', AI.caution);
      for (const e of this.alive) e.standDown();
    } else if (this.phase === 'caution' && (this.phaseT -= dt) <= 0) this.setPhase('normal');
  }

  // what the squad no longer needs to keep: the tiles where a mate fell once they are safe again, and the incidents
  // already reported once no guard is wary of them any more (AI.wary.time: nothing reads a reported one after that)
  forget(now) {
    this.danger.prune(now);
    const old = now - AI.wary.time;
    if (this.incidents.some((i) => i.reported && i.t < old)) this.incidents = this.incidents.filter((i) => !i.reported || i.t >= old);
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

  // Every guard in range hears it; walls muffle the far half of the radius; a jukebox turned up drowns the small
  // noises around it (systems/Jukebox.js). The stranger's own odd noise under a guard's eyes gets him a word
  // (conduct) and those who saw him do not go and look; while all is calm, only the AI.listen.go nearest go and look
  // at anything but an alarm (ALARMS), the others glance toward it.
  emit(type, x, y, radius, source = null) {
    const w = this.world;
    if (w.jukebox) radius = w.jukebox.mask(x, y, radius, type);
    const heard = [];
    for (const e of w.enemies) {
      if (!e.alive || e === source || e.knocked > 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius) continue;
      if (d > radius * 0.55 && !w.lineOfSight(e.x, e.y, x, y)) continue;
      if (type === 'gunshot' && source === w.player) this.provoked = true;
      heard.push(e);
    }
    if (!heard.length) return;
    const p = w.player;
    const saw = ODD.has(type) && p && (source === p || (!source && Math.hypot(p.x - x, p.y - y) < 48)) ? this.conduct('noise', x, y, true) : null;
    const calm = this.phase === 'normal' && !ALARMS.has(type);
    if (calm) heard.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    let go = 0;
    for (const e of heard) {
      if (saw?.includes(e)) continue;
      if (calm && e.aware === 0 && go >= AI.listen.go) { e.glanceAt?.(x, y, AI.listen.glance); continue; }
      e.hear(type, x, y, source);
      go++;
    }
  }

  // ---------------- a word with the stranger (ai/Conduct.js) ----------------
  // The stranger did something odd (an act of data/conduct.js) at (x, y) while nobody has anything against him: the
  // guard already having a word with him takes it in (whoever saw it); else the nearest guard who saw it goes over
  // to him; the others who saw it look at him. heard: a noise, seen by whoever turns to it and has him in sight (no
  // view cone). Returns the guards who saw it (empty: nobody), or null when it is no longer a matter for words (he
  // gave himself away, or has a gun in his hand: a threat).
  conduct(act, x, y, heard = false) {
    const w = this.world, p = w.player;
    if (!p?.alive || p.hidden || this.provoked || !w.level?.premises || (this.isThreat(p) && !this.isIntruder(p))) return null;
    if (this.challenger && (!this.challenger.alive || !this.challenger.case)) this.challenger = null;
    const saw = this.alive.filter((e) => e.witness?.(p, heard));
    if (!saw.length) return saw;
    // the same doing, seen another way at once (a pane put in: the window and its glass), is one act
    const last = this.lastAct, same = !!last && w.time - last.t < 0.2 && Math.hypot(last.x - x, last.y - y) < 64;
    this.lastAct = { t: w.time, x, y };
    const cur = this.challenger;
    if (cur) {
      if (cur.case.saw(act, !same)) for (const e of saw) if (e !== cur) e.glanceAt(p.x, p.y, AI.challenge.glance);
      return saw;
    }
    let best = null, bd = Infinity; // (a man already looking about, at his footsteps say, will do as well)
    for (const e of saw) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return saw;
    best.challenge(act, x, y, opening(this.letOff, w.time));
    for (const e of saw) if (e !== best) e.glanceAt(p.x, p.y, AI.challenge.glance);
    return saw;
  }

  // the word is over (letOff: he complied, or got away before it): the stranger is remembered a while
  closeCase(e, letOff) {
    if (this.challenger === e) this.challenger = null;
    if (letOff) this.letOff.push(this.world.time);
  }

  // What he is up to, as the guards around can see it (a few times a second): unarmed in the premises, a blade or a
  // club in his hand on public ground, over the furniture, hanging about a door into the premises, running into a
  // guard. Noises, slides, blows on the furniture and broken windows come in through their events.
  watchConduct(dt) {
    const w = this.world, p = w.player, C = AI.challenge;
    if (this.provoked || !p?.alive || !w.level?.premises) return;
    const v = p.vaulting;
    if (v && v !== this.lastVault) {
      this.lastVault = v;
      if (v.kind === 'prop' && !v.over?.def?.climb && !v.over?.def?.land) this.conduct('vault', p.x, p.y);
    }
    if ((this.conductT -= dt) > 0) return;
    this.conductT = 0.2;
    if (this.isIntruder(p)) { this.conduct('trespass', p.x, p.y); return; }
    if (p.armed && !this.isThreat(p)) this.conduct('weapon', p.x, p.y);
    // a door into the premises he hangs about
    const door = !this.isGuest(p) && (w.doors || []).find((d) => w.isHouseDoor?.(d) && Math.hypot(d.hx - p.x, d.hy - p.y) < C.lurkR + 16);
    this.lurkT = door && p.moving < 1 ? this.lurkT + 0.2 : Math.max(0, this.lurkT - 0.4);
    if (this.lurkT >= C.lurk) { this.lurkT = 0; this.conduct('lurk', p.x, p.y); }
    // running into one of them
    if (p.moving < C.bump) return;
    for (const e of w.enemies) {
      if (e.alive && e.aware === 0 && !(e.knocked > 0) && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius + 3) { this.conduct('bump', p.x, p.y); break; }
    }
  }

  // ---------------- finding the way (ai/Nav.js) ----------------
  // the extra cost of each tile to guard e's path-finding: what he ran into himself, where a mate fell, the routes
  // his mates in the fight already take (he goes round another way), fire, a slick floor
  pathCost(e) {
    const w = this.world, now = w.time, N = AI.nav, W = w.map.w;
    const shared = e.aware === 2 ? this.sharedCells(e) : null;
    const liq = w.liquids;
    return pathCost([
      e.jams?.size ? (i) => e.jams.cost(i, now) : null,
      this.danger.size ? (i) => this.danger.cost(i, now) : null,
      shared?.size ? (i) => (shared.has(i) ? N.shared : 0) : null,
      this.hot.size ? (i) => (this.hot.has(i) ? N.fire : 0) : null,
      liq?.grip ? (i) => (liq.grip(((i % W) + 0.5) * TILE, (Math.floor(i / W) + 0.5) * TILE) < N.grip ? N.slick : 0) : null,
    ]);
  }

  // a guard in the fight sets off along `path`: the others will take another way if there is one
  shareRoute(e, path) {
    if (e.aware !== 2 || !path) { this.routes.delete(e); return; }
    this.routes.set(e, { cells: routeCells(this.world.map, e.x, e.y, path), t: this.world.time });
  }

  // the tiles of the fresh routes of e's mates in the fight
  sharedCells(e) {
    const now = this.world.time, out = new Set();
    for (const [o, r] of this.routes) {
      if (!o.alive || o.aware !== 2 || now - r.t > AI.nav.routeFor) { this.routes.delete(o); continue; }
      if (o !== e) for (const c of r.cells) out.add(c);
    }
    return out;
  }

  // the tiles around a fire burning now (systems/Fires.js)
  findHot() {
    const w = this.world, m = w.map;
    this.hot.clear();
    for (const f of w.fires?.lit?.() || []) {
      const cx = Math.floor(f.x / TILE), cy = Math.floor(f.y / TILE);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (cx + i >= 0 && cy + j >= 0 && cx + i < m.w && cy + j < m.h) this.hot.add((cy + j) * m.w + cx + i);
    }
  }

  // ---------------- the player's cover ----------------
  // Guards mind their own business as long as the player has no gun in his hand, keeps outside the level's guarded
  // `premises` ([col0, row0, col1, row1] tile rectangles), and nobody caught him at anything. A level without
  // premises is hostile ground everywhere. Once he is made (spotted as a threat, heard shooting, a guard down, a
  // word with him that turned into a fight) it is for good. A blade or a club in his hand on public ground, or
  // walking into the premises unarmed, only gets him a word (conduct).
  isThreat(p) {
    const zones = this.world.level?.premises;
    return this.provoked || !zones || gunInHand(p) || inZones(zones, p);
  }

  // is he in the guarded premises
  inPremises(p) { return inZones(this.world.level?.premises, p); }

  // where a stranger is a customer (level `welcome` rectangles: a bar room): standing about a door there is no lurking
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
    const N = AI.nav.danger;
    if (w.map) this.danger.markAround(w.map, victim.x, victim.y, N.r, N.cost, w.time + N.forget);
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
    this.widened = false;
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
    else if (!this.widened && this.phase === 'evasion' && this.searchOrigin) {
      // every spot near where he vanished has been looked at: the sweep goes further out, once
      this.widened = true;
      const o = this.searchOrigin, near = AI.searchTiles * TILE * 0.6;
      const more = searchPoints(this.world.map, o.x, o.y, Math.round(AI.searchTiles * AI.widen), AI.searchSpots * 2)
        .filter((p) => Math.hypot(p.x - o.x, p.y - o.y) > near).slice(0, AI.searchSpots);
      if (more.length) {
        this.searchPts.push(...more.map((p) => ({ ...p, owner: null, done: false })));
        return this.nextSearchPoint(e);
      }
    }
    return best;
  }

  // a guard who knows a mate fell near (x, y) not long ago (a body incident within AI.wary.r px, AI.wary.time s old)
  wary(x, y) {
    const W = AI.wary, now = this.world.time;
    return this.incidents.some((i) => i.kind === 'body' && now - i.t < W.time && Math.hypot(i.x - x, i.y - y) < W.r);
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
