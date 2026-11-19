// The kill cam (KILLCAM in data/killcam.js): a director for the player's kills. It listens to the world ('kill',
// Scoring's 'multiKill' and 'chainEnd'), watches his finishers and takedowns, and sorts what happens into beats, light
// to heavy: `combo` (a plain kill of a long chain), `violent`, `exec`, `end`. One beat at a time: a stronger one
// takes over, a weaker one in its shadow or inside its tier's gap is dropped; a plain kill gets none.
//   mode 'zoom'   a beat is a camera punch-in (`scale` on top of the usual view, `aim` drawing the view toward the
//                 kill), slow motion (Impact.slowAtLeast: never on top of a stronger one) and a hit-stop. Game puts
//                 `scale` on Camera.scale next to the director's; with no beat left it is exactly 1 again.
//   mode 'panel'  nothing on the camera or the clock: a beat opens a comic panel (`panelView`, drawn by
//                 render/KillPanel.js off its own footage), a strip of three for `exec` and `end`.
//   mode 'off'    nothing.
// Never at a wheel, in a staged shot (the tutorial's, a boss's, the opening's, a throw's), nor once he is dead. A
// thrown kill is ThrowBeat's in the zoom version (no beat here), a panel like any violent kill in the other. It tells
// 'killcam' { tier, mode, x, y } when a beat opens (the pad's rumble). Advanced by Game on the REAL clock. DOM-free.
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
  constructor(world, mode = KILLCAM.mode, cfg = KILLCAM) {
    this.world = world;
    this.mode = mode;
    this.cfg = cfg;
    this.scale = 1;        // the zoom on top of the usual view (exactly 1 at rest)
    this.pull = 0;         // 0..1: how far the view is drawn to `at`
    this.at = { x: 0, y: 0 };
    this.beat = null;      // { tier, rank, zoom, pull, t, hold, pair (the man of a finisher under way), body: { x, y } }
    this.now = 0;          // real s
    this.until = [];       // by rank: real time before which a beat of that rank is dropped (the gaps)
    this.staged = false;   // a staged shot has the camera (update)
    this.view = null;      // the usual view, { x, y, hw, hh } in world px (update)
    this.lastKill = null;  // { x, y, n (its place in the chain), end (it had the end beat) }
    this.panel = null;     // { kind 'single' | 'strip', t, dur, frames, x, y, word, id }
    this.panels = 0;       // panels opened so far (a panel's id)
    this.multi = false;    // the kill being told is the third or more in a breath (Scoring's 'multiKill')
    const ev = world.events;
    ev.on('kill', (e) => this.onKill(e));
    // (Scoring tells it from inside its own 'kill' listener, before ours: built after it, we get the kill next)
    ev.on('multiKill', (e) => { this.multi = cfg.multi.includes(e.tag); });
    ev.on('chainEnd', (e) => this.onChainEnd(e));
    // a thing he threw put a man down: that beat is systems/ThrowBeat.js's (its own hit-stop, slow motion and shot),
    // the zoom lets go of the camera at once
    ev.on('thrownHit', ({ thrower }) => { if (thrower?.isPlayer && this.mode === 'zoom') this.beat = null; });
  }

  // in this version the kills' own slow motions (MOMENTS.lastInRoom, MOMENTS.multi) stay off: play never slows
  get mutes() { return this.mode === 'panel' && !!this.cfg.panel.mutes; }

  // may a beat open now?
  get live() {
    const w = this.world, p = w.player;
    return this.mode !== 'off' && !this.staged && !!p?.alive && !w.drive?.on && !p.driving;
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
    this.lastKill = { x: victim.x, y: victim.y, n, end: false, cause: e.cause, label: e.how?.finisher || victim.held ? e.how?.label : null };
    // a thrown kill (how.thrown) in the zoom version: ThrowBeat has it, here it only counts for the chain (its end
    // may still come back to this body); the panels show it like any violent kill
    if (e.how?.thrown && this.mode === 'zoom') return;
    if (tier && this.fire(tier, victim, n) && tier === 'end') this.lastKill.end = true;
  }

  // the chain ran out: its last body, when it was long enough, still in the picture and not shown already
  onChainEnd({ kills }) {
    const k = this.lastKill;
    if (!k || k.end || kills < this.cfg.cash.kills || !this.inView(k.x, k.y)) return;
    if (this.fire('end', k, 0, `CHAIN x${kills}`)) k.end = true;
  }

  inView(x, y) {
    const v = this.view;
    return !v || (Math.abs(x - v.x) < v.hw && Math.abs(y - v.y) < v.hh);
  }

  // A beat of `tier` on the body at `body`, the n-th kill of its chain. False when it is dropped: the kill cam off,
  // out of the picture, a stronger beat under way, or inside the gap of a beat of its rank or above.
  fire(tier, body, n = 0, word = null) {
    const C = this.cfg, T = C.tiers[tier], w = this.world, b = this.beat;
    if (!this.live || !this.inView(body.x, body.y)) return false;
    // (the kill of the finisher the camera is already in on goes on with it)
    const own = tier === 'exec' && b?.tier === 'exec';
    if (!own && ((b && T.rank < b.rank) || this.now < (this.until[T.rank] ?? 0))) return false;
    const mile = tier === 'combo' && C.panel.milestones.includes(n);
    if (this.mode === 'panel' && tier === 'combo' && !mile) return false; // a plain kill of a chain: nothing to show again
    for (let r = 1; r <= T.rank; r++) this.until[r] = Math.max(this.until[r] ?? 0, this.now + T.gap);
    const more = n >= C.chain.from ? Math.min(C.chain.max, C.chain.each * (n - C.chain.from + 1)) : 0;
    const at = { x: body.x, y: body.y };
    if (this.mode === 'panel') {
      const strip = T.rank >= C.tiers.exec.rank, P = strip ? C.panel.strip : C.panel.single, k = this.lastKill;
      this.panel = { kind: strip ? 'strip' : 'single', t: 0, dur: P.dur, frames: P.frames, x: at.x, y: at.y, id: ++this.panels,
        word: word || (mile ? `x${n}!` : k?.label || C.panel.words[k?.cause] || C.panel.word) };
      this.beat = { tier, rank: T.rank, zoom: 1, pull: 0, t: 0, hold: P.dur, pair: null, body: at };
    } else {
      // (a finisher's blow: held on the pair until he lets go of him, then for its hold)
      const man = tier === 'exec' ? this.pair() : null;
      this.beat = { tier, rank: T.rank, zoom: T.zoom + more, pull: T.pull, t: 0, hold: T.hold, pair: man === body ? man : null, body: at };
      if (T.slow) slowAtLeast(w, ...T.slow);
      if (T.stop) w.hitstop(T.stop);
    }
    w.events.emit('killcam', { tier, mode: this.mode, x: at.x, y: at.y });
    // placeholder sounds (assets/sound/PLACEHOLDERS.md): the panel's pop, the breath into the heaviest slow motions
    if (this.mode === 'panel') w.sound?.('panelPop', at.x, at.y);
    else if (T.rank >= C.tiers.exec.rank) w.sound?.('killcamIn', at.x, at.y);
    return true;
  }

  // the man of a finisher (not a quick kill) or a takedown under way, until he lets go of him
  pair() {
    const p = this.world.player, ex = p?.execution;
    if (ex) return ex.f.quick ? null : ex.target;
    return p?.takedown?.target ?? null;
  }

  // let go of everything at once (his death): the zoom eases back, the panel is cut
  cancel() {
    this.beat = null;
    this.panel = null;
  }

  // once a frame. dt: real s; staged: a staged shot has the camera; view: the usual view { x, y, hw, hh } (world px
  // about where the camera looks, without the kill cam's own zoom)
  update(dt, { staged = false, view = null } = {}) {
    const C = this.cfg, E = C.ease;
    this.now += dt;
    this.staged = staged;
    this.view = view;
    if (!this.live) this.cancel();
    else if (this.mode === 'zoom') this.watch();
    const b = this.beat, p = this.world.player;
    if (b) {
      if (b.pair) {
        // pushed in on the pair for as long as it lasts
        b.body = { x: b.pair.x, y: b.pair.y };
        if ((b.t += dt) > C.tiers.exec.longest) this.beat = null;
      } else if ((b.t += dt) >= b.hold) this.beat = null;
      // between him and the body; the end beat goes all the way onto it (its pull)
      const f = b.tier === 'end' ? 1 : 0.5;
      this.at.x = p.x + (b.body.x - p.x) * f;
      this.at.y = p.y + (b.body.y - p.y) * f;
    }
    const zoom = this.beat ? this.allowed(this.beat) : 1, pull = zoom > 1 ? this.beat.pull : 0;
    this.scale += (zoom - this.scale) * (1 - Math.exp(-(zoom > this.scale ? E.in : E.out) * dt));
    this.pull += (pull - this.pull) * (1 - Math.exp(-(pull > this.pull ? E.in : E.out) * dt));
    if (Math.abs(this.scale - zoom) < E.snap) this.scale = zoom;
    if (Math.abs(this.pull - pull) < E.snap) this.pull = pull;
    if (this.panel && (this.panel.t += dt) >= this.panel.dur) this.panel = null;
  }

  // a finisher or a takedown begins: the camera goes in on the pair, and comes back when he lets go of him
  watch() {
    const man = this.pair(), b = this.beat, T = this.cfg.tiers.exec;
    if (b?.pair && b.pair !== man) { b.pair = null; b.t = b.hold; return; } // he let go of him: the camera comes back
    if (!man?.alive || b?.pair === man || (b && b.rank > T.rank)) return; // (it opens on a man alive: once, before the blow)
    this.beat = { tier: 'exec', rank: T.rank, zoom: T.zoom, pull: T.pull, t: 0, hold: T.hold, pair: man, body: { x: man.x, y: man.y } };
    this.world.events.emit('killcam', { tier: 'exec', mode: this.mode, x: man.x, y: man.y });
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
    const kx = frame.hw * 0.7, ky = frame.hh * 0.7;
    return { x: clamp(vx, frame.x - kx, frame.x + kx), y: clamp(vy, frame.y - ky, frame.y + ky) };
  }

  // The panel to draw, or null: { id, kind, word, x, y (the kill, world px), frames: [{ i, pop (x its size as it
  // pops in, 1 once landed), clip (s about the kill of the picture it shows) }] } - the panels of a strip popped so far
  panelView() {
    const p = this.panel, P = this.cfg.panel;
    if (!p) return null;
    const frames = [];
    p.frames.forEach((f, i) => {
      const t = p.t - f.at;
      if (t < 0) return;
      const u = clamp(t / Math.max(0.01, p.dur - f.at - P.hold), 0, 1);
      frames.push({ i, pop: t < P.pop ? P.from + (1 - P.from) * (t / P.pop) : 1, clip: f.span[0] + (f.span[1] - f.span[0]) * u });
    });
    return { id: p.id, kind: p.kind, word: p.word, x: p.x, y: p.y, n: p.frames.length, frames };
  }
}
