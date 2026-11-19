// The kill cam (KILLCAM in data/killcam.js): a director for the player's kills. It listens to the world ('kill',
// 'blow', Scoring's 'multiKill' and 'chainEnd'), watches his finishers and takedowns, and sorts what happens into
// beats, light to heavy: `combo` (a plain kill of a long chain), `violent`, `exec`, `end`. One beat at a time: a
// stronger one takes over, a weaker one in its shadow or inside its tier's gap is dropped; a plain kill gets none.
// A beat is:
//   the camera   punched in (`scale` on top of the usual view, in within a few frames) and drawn toward the kill
//                (`aim`), kicked along the blow and shaken; let go, the zoom whips back a little past the usual
//                view and settles on exactly 1. Game puts `scale` on Camera.scale next to the director's.
//   the clock    slow motion (Impact.slowAtLeast: never on top of a stronger one) that drops at once and snaps back
//                when it is over (`clock`), a hit-stop; in a finisher every blow is held an instant, the last the most
//   the rest     more blood thrown on in the slow; the lens (render/Lens.js) and the pad (systems/Rumble.js) hear
//                'killcam' { tier, x, y, k (1 and up: the chain's crescendo), hold } and 'killcamOut' { tier }
// Each kill of a chain from its 3rd hits harder (KILLCAM.chain); its end is the big release.
// Never at a wheel, in a staged shot (the tutorial's, a boss's, the opening's, a throw's), nor once he is dead. A
// thrown kill is systems/ThrowBeat.js's: no beat here, it only counts for the chain.
// Advanced by Game on the REAL clock. DOM-free.
import { KILLCAM } from '../data/killcam.js';
import { lastInSight, slowAtLeast } from '../fx/Impact.js';
import { clamp } from '../../engine/math.js';

// What a kill of the player's is, by itself: 'exec' (a finisher on a man down, a takedown), 'violent' (a head off
// or a body in pieces: `left` 'headless' / 'gibs', buckshot at arm's length, a blast, the heavy stroke, a spin, the
// blow that broke the weapon, a thrown blade, a round through a wall or through another man, a quick kill on the
// floor), or null: a plain one. e: the 'kill' event.
export function killTier({ victim, cause, killer, how, left }) {
  const his = !!killer?.isPlayer;
  if (!his && cause !== 'explosion') return null;
  if (his && ((how?.finisher && !how.quick) || (victim?.held && victim.held === killer))) return 'exec';
  if (left === 'headless' || left === 'gibs' || cause === 'blast' || cause === 'explosion' || cause === 'execute') return 'violent';
  if (how && (how.finisher || how.heavy || how.spin || how.broke || how.thrown || how.through || how.pierced > 0)) return 'violent';
  return null;
}

export default class KillCam {
  constructor(world, on = KILLCAM.on, cfg = KILLCAM) {
    this.world = world;
    this.on = on;
    this.cfg = cfg;
    this.scale = 1;        // the zoom on top of the usual view (exactly 1 at rest)
    this.pull = 0;         // 0..1: how far the view is drawn to `at`
    this.at = { x: 0, y: 0 };
    // { tier, rank, zoom, pull, t, hold, pair (the man of a finisher under way), body: { x, y }, slow (s of its slow
    // motion left), heart (s to the next heartbeat) }
    this.beat = null;
    this.out = null;       // the zoom let go: { from (what was left of it), t }
    this.drop = 0;         // a time scale to drop to at once (clock), 0: none
    this.snap = 0;         // its slow motion is over: s left to put the clock back at once (clock), 0: no
    this.slowAt = 1;       // the time scale of that slow motion
    this.now = 0;          // real s
    this.until = [];       // by rank: real time before which a beat of that rank is dropped (the gaps)
    this.staged = false;   // a staged shot has the camera (update)
    this.view = null;      // the usual view, { x, y, hw, hh } in world px (update)
    this.lastKill = null;  // { x, y, n (its place in the chain), end (it had the end beat) }
    this.multi = false;    // the kill being told is the third or more in a breath (Scoring's 'multiKill')
    const ev = world.events;
    ev.on('kill', (e) => this.onKill(e));
    ev.on('blow', (e) => this.onBlow(e));
    // (Scoring tells it from inside its own 'kill' listener, before ours: built after it, we get the kill next)
    ev.on('multiKill', (e) => { this.multi = cfg.multi.includes(e.tag); });
    ev.on('chainEnd', (e) => this.onChainEnd(e));
    // a thing he threw put a man down: that beat is systems/ThrowBeat.js's, the zoom lets go of the camera at once
    ev.on('thrownHit', ({ thrower }) => { if (thrower?.isPlayer) this.letGo(); });
  }

  // may a beat open now?
  get live() {
    const w = this.world, p = w.player;
    return this.on && !this.staged && !!p?.alive && !w.drive?.on && !p.driving;
  }

  onKill(e) {
    const { victim } = e, w = this.world, p = w.player, multi = this.multi;
    this.multi = false;
    if (victim.isPlayer) { this.cancel(); return; } // his death has its own beat
    if (!this.live || !victim.isEnemy) return;
    let tier = killTier(e);
    if (!tier && !e.killer?.isPlayer) return;
    const n = w.scoring?.combo ?? 0, L = this.cfg.last;
    const others = w.enemies.some((g) => g !== victim && g.alive && !g.yielded);
    const last = !others || (n >= L.chain && lastInSight(p, victim, w.enemies, L.radius, (g) => w.lineOfSight(p.x, p.y, g.x, g.y)));
    if (multi || (last && !!e.killer?.isPlayer)) tier = 'end';
    else if (!tier && n >= this.cfg.chain.from) tier = 'combo';
    this.lastKill = { x: victim.x, y: victim.y, n, end: false };
    if (e.how?.thrown) return; // ThrowBeat has it: here it only counts for the chain (its end may come back to it)
    if (tier && this.fire(tier, victim, n) && tier === 'end') this.lastKill.end = true;
  }

  // a blow of a finisher or a takedown under way that does not kill: held an instant, the camera kicked in
  onBlow({ byPlayer, lethal }) {
    const b = this.beat, B = this.cfg.tiers.exec.blow;
    if (!byPlayer || lethal || !b?.pair || !this.live) return;
    this.world.hitstop(B.stop);
    this.world.camera?.punch(B.punch);
  }

  // the chain ran out: its last body, when it was long enough, still in the picture and not shown already
  onChainEnd({ kills }) {
    const k = this.lastKill;
    if (!k || k.end || kills < this.cfg.cash.kills || !this.inView(k.x, k.y)) return;
    if (this.fire('end', k, kills)) k.end = true;
  }

  inView(x, y) {
    const v = this.view;
    return !v || (Math.abs(x - v.x) < v.hw && Math.abs(y - v.y) < v.hh);
  }

  // steps of the crescendo for the n-th kill of a chain
  steps(n) {
    const C = this.cfg.chain;
    return clamp(n - C.from + 1, 0, C.steps);
  }

  // A beat of `tier` on the body at `body`, the n-th kill of its chain. False when it is dropped: the kill cam off,
  // out of the picture, a stronger beat under way, or inside the gap of a beat of its rank or above.
  fire(tier, body, n = 0) {
    const C = this.cfg, T = C.tiers[tier], w = this.world, b = this.beat, p = w.player;
    if (!this.live || !this.inView(body.x, body.y)) return false;
    // (the kill of the finisher the camera is already in on goes on with it)
    const own = tier === 'exec' && b?.tier === 'exec';
    if (!own && ((b && T.rank < b.rank) || this.now < (this.until[T.rank] ?? 0))) return false;
    for (let r = 1; r <= T.rank; r++) this.until[r] = Math.max(this.until[r] ?? 0, this.now + T.gap);
    const s = this.steps(n), at = { x: body.x, y: body.y };
    // (a finisher's blow: held on the pair until he lets go of him, then for its hold)
    const man = tier === 'exec' ? this.pair() : null;
    this.beat = { tier, rank: T.rank, zoom: T.zoom + C.chain.zoom * s, pull: T.pull, t: 0, hold: T.hold, pair: man === body ? man : null, body: at,
      slow: 0, heart: b?.heart ?? C.sounds.every };
    this.out = null;
    // the clock: down at once, for a little longer and deeper as the chain grows
    const slow = [Math.max(C.chain.floor, T.slow[0] - C.chain.slow * s), T.slow[1] + C.chain.hold * s];
    if (slowAtLeast(w, ...slow)) { this.drop = this.slowAt = slow[0]; this.snap = 0; this.beat.slow = slow[1]; }
    if (T.stop) w.hitstop(T.stop);
    // the camera kicked along the blow, the blood it throws on
    const a = Math.atan2(body.y - p.y, body.x - p.x);
    if (T.push) w.camera?.push(Math.cos(a) * T.push, Math.sin(a) * T.push);
    if (T.shake) w.shake?.(T.shake);
    if (T.blood) w.particles?.blood(at.x, at.y, a, T.blood[2], T.blood[0], T.blood[1]);
    w.events.emit('killcam', { tier, x: at.x, y: at.y, k: 1 + C.chain.lens * s, hold: slow[1] });
    if (T.rank >= C.tiers.violent.rank) w.sound?.(C.sounds.in, at.x, at.y);
    return true;
  }

  // the man of a finisher (not a quick kill) or a takedown under way, until he lets go of him
  pair() {
    const p = this.world.player, ex = p?.execution;
    if (ex) return ex.f.quick ? null : ex.target;
    return p?.takedown?.target ?? null;
  }

  // the beat is over: the zoom whips back from where it is
  letGo() {
    if (this.beat) this.out = { from: this.scale - 1, t: 0 };
    this.beat = null;
  }

  // let go of everything at once (his death, a staged shot): the zoom comes back, nothing is done to the clock
  cancel() {
    this.letGo();
    this.drop = 0;
    this.snap = 0;
  }

  // The time scale Game is to run at: `scale` as it eased it toward `target`, but for a beat's ramp: down to its
  // slow motion at once, and back to `target` at once when that is over (a whip, not a fade).
  clock(scale, target) {
    if (this.drop) { scale = Math.min(scale, this.drop); this.drop = 0; }
    // (once the game itself asks for more than that slow motion: its own timer ends within a frame of ours)
    if (this.snap > 0 && target > this.slowAt + 1e-6) { scale = target; this.snap = 0; }
    return scale;
  }

  // once a frame. dt: real s; staged: a staged shot has the camera; view: the usual view { x, y, hw, hh } (world px
  // about where the camera looks, without the kill cam's own zoom)
  update(dt, { staged = false, view = null } = {}) {
    const C = this.cfg, E = C.ease, w = this.world;
    this.now += dt;
    this.snap = Math.max(0, this.snap - dt);
    this.staged = staged;
    this.view = view;
    if (!this.live) this.cancel();
    else this.watch();
    const b = this.beat, p = w.player;
    if (b) {
      // its slow motion is over: the clock snaps back
      if (b.slow > 0 && (b.slow -= dt) <= 0) {
        this.snap = 0.1;
        w.events.emit('killcamOut', { tier: b.tier, x: b.body.x, y: b.body.y });
        if (b.rank >= C.tiers.exec.rank) w.sound?.(C.sounds.out, b.body.x, b.body.y);
      }
      if (b.pair) {
        // pushed in on the pair for as long as it lasts, a heartbeat under it
        b.body = { x: b.pair.x, y: b.pair.y };
        if ((b.heart -= dt) <= 0) { b.heart = C.sounds.every; w.sound?.(C.sounds.heart, p.x, p.y); }
        if ((b.t += dt) > C.tiers.exec.longest) this.letGo();
      } else if ((b.t += dt) >= b.hold && b.slow <= 0) this.letGo();
      // between him and the body; the end beat goes all the way onto it (its pull)
      const f = b.tier === 'end' ? 1 : 0.5;
      this.at.x = p.x + (b.body.x - p.x) * f;
      this.at.y = p.y + (b.body.y - p.y) * f;
    }
    const zoom = this.beat ? this.allowed(this.beat) : 1, pull = zoom > 1 ? this.beat.pull : 0, o = this.out;
    if (this.beat) {
      this.scale += (zoom - this.scale) * (1 - Math.exp(-E.in * dt));
      if (Math.abs(this.scale - zoom) < E.snap) this.scale = zoom;
    } else if (o) {
      // what was left of the zoom dies swinging: once past the usual view, then exactly on it
      o.t += dt;
      const left = o.from * Math.exp(-E.out * o.t);
      this.scale = 1 + left * Math.cos(E.whip * o.t);
      if (Math.abs(left) < E.snap) { this.scale = 1; this.out = null; }
    } else this.scale = 1;
    this.pull += (pull - this.pull) * (1 - Math.exp(-(pull > this.pull ? E.in : E.out) * dt));
    if (Math.abs(this.pull - pull) < E.snap) this.pull = pull;
  }

  // a finisher or a takedown begins: the camera goes in on the pair, and comes back when he lets go of him
  watch() {
    const man = this.pair(), b = this.beat, T = this.cfg.tiers.exec;
    if (b?.pair && b.pair !== man) { b.pair = null; b.t = 0; return; } // he let go of him: its hold, then back
    if (!man?.alive || b?.pair === man || (b && b.rank > T.rank)) return; // (it opens on a man alive: once, before the blow)
    this.beat = { tier: 'exec', rank: T.rank, zoom: T.zoom, pull: T.pull, t: 0, hold: T.hold, pair: man, body: { x: man.x, y: man.y }, slow: 0, heart: 0 };
    this.out = null;
  }

  // The zoom a beat may have: its own, less when a guard with a gun who is after him stands in the usual view and
  // would be cut out of the zoomed one; 1 when what is left is not worth a zoom.
  allowed(b) {
    const v = this.view, G = this.cfg.guard;
    if (!v) return b.zoom;
    const cx = v.x + (this.at.x - v.x) * b.pull, cy = v.y + (this.at.y - v.y) * b.pull;
    let zoom = b.zoom;
    for (const g of this.world.enemies) {
      if (!g.alive || g === b.pair || g.aware !== 2 || g.yielded || g.knocked > 0 || g.held || g.def?.kind !== 'gun') continue;
      if (Math.abs(g.x - v.x) >= v.hw || Math.abs(g.y - v.y) >= v.hh) continue;
      zoom = Math.min(zoom, v.hw / (Math.abs(g.x - cx) + G.margin), v.hh / (Math.abs(g.y - cy) + G.margin));
    }
    return zoom < G.least ? 1 : zoom;
  }

  // Where the view goes for the point (x, y) it would look at: drawn toward the kill by `pull`, the player kept
  // inside the picture. frame: { x, y (the player), hw, hh (the half view, zoom included) }
  aim(x, y, frame = null) {
    const k = this.pull;
    if (!k) return { x, y };
    const vx = x + (this.at.x - x) * k, vy = y + (this.at.y - y) * k;
    if (!frame) return { x: vx, y: vy };
    const kx = frame.hw * this.cfg.keep, ky = frame.hh * this.cfg.keep;
    return { x: clamp(vx, frame.x - kx, frame.x + kx), y: clamp(vy, frame.y - ky, frame.y + ky) };
  }
}
