// The gamepad's rumble: what the player feels in his hands (data/rumble.js RUMBLE). DOM-free: the pad is injected,
// { play({ strong, weak, ms }), stop() } (Game: engine/Input.js rumble / stopRumble), and the effects come from the
// world's events (bind):
//   shot          his own, by the gun's family            blow   his blow on a man (a takedown's, a finisher's)
//   kill          a man of his down; his own death        finisher   a finisher's last beat
//   explosion     by its distance to him                  doorBroken   a door burst or torn off near him
//   ride          the van and the getaway: { beat }, one of RUMBLE.ride (systems/Drive.js, Lorries.js, World's outro)
//   thrownHit     a thing he threw put a man down (entities/WeaponItem.js)
// Mixing: every effect under way is kept until its end, and the pad plays the strongest of them on each motor (never
// a sum: two shots at once are one shot), until the first of them ends; a new call only when that mix changes, and
// MIX.gap s at least between two. When the pad has been rumbling more than MIX.duty of the last MIX.window s, a light
// effect (a round of an automatic) is felt at MIX.tired; a heavy one (a kill, a blast) always comes whole. Everything is scaled by the VIBRATION option; nothing is felt but in play (update's
// `live`) with the pad in hand (`pad`), but for a menu's tick (ui).
import { RUMBLE } from '../data/rumble.js';
import { familyOf } from '../data/feel.js';

const EPS = 1e-3;
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);

// 1 within `near` of (x, y), nothing from `far` on, linear between
export const fade = (d, near, far) => (d <= near ? 1 : d >= far ? 0 : 1 - (d - near) / (far - near));

export default class Rumble {
  constructor(pad, table = RUMBLE) {
    this.pad = pad;
    this.T = table;
    this.scale = 1;       // the VIBRATION option, 0..1
    this.live = false;    // in play with the pad in hand (update)
    this.pads = false;    // the pad is the device in use (update)
    this.now = 0;         // s, real time
    this.list = [];       // effects under way: { strong, weak, until, ui }
    this.out = null;      // what the pad was last told: { strong, weak, until }
    this.sentAt = -Infinity;
    this.busy = 0;        // share of the last MIX.window s spent rumbling
    this.world = null;
    this.log = null;      // an array to note every call to the pad in ({ t, strong, weak, ms }; QA and tests)
  }

  setScale(v) {
    this.scale = Number.isFinite(v) ? clamp01(v) : 1;
    if (!(this.scale > 0)) this.silence();
  }

  // the world whose events it feels (a new level: what the old one played is dropped)
  bind(world) {
    this.world = world;
    this.list = this.list.filter((e) => e.ui);
    const ev = world.events, R = this.T, mine = (fn) => (e) => { if (this.world === world) fn(e); };
    const isHim = (c) => !!c && c === world.player;
    ev.on('shot', mine(({ shooter, weapon }) => { if (isHim(shooter)) this.feel(R.shot[familyOf(weapon)] || R.shot.pistol); }));
    ev.on('blow', mine(({ byPlayer, kind, power }) => {
      if (!byPlayer || kind === 'bullet') return;
      this.feel(kind === 'finisher' ? R.finisher : R.hit, 0.5 + 0.5 * clamp01(power ?? 1));
    }));
    ev.on('kill', mine(({ victim, killer }) => {
      if (isHim(victim)) this.feel(R.death);
      else if (isHim(killer)) this.feel(R.kill);
    }));
    ev.on('finisher', mine(({ killer }) => { if (isHim(killer)) this.feel(R.finisher); }));
    ev.on('thrownHit', mine(({ thrower }) => { if (isHim(thrower)) this.feel(R.thrown); }));
    ev.on('explosion', mine(({ x, y, radius }) => {
      const r = radius || 90;
      this.feel(R.blast, fade(this.dist(x, y), r * R.blast.near, r * R.blast.far));
    }));
    ev.on('doorBroken', mine(({ x, y }) => this.feel(R.door, fade(this.dist(x, y), R.door.near, R.door.far))));
    ev.on('ride', mine(({ beat, x, y }) => {
      const fx = R.ride[beat];
      if (fx) this.feel(fx, fx.far && x !== undefined ? fade(this.dist(x, y), fx.near, fx.far) : 1);
    }));
  }

  // px from him to (x, y) (far away when there is nobody)
  dist(x, y) {
    const p = this.world?.player;
    return p ? Math.hypot(x - p.x, y - p.y) : Infinity;
  }

  // an effect asked for at k of its strength; ui: a menu's (felt out of play). True when it was taken.
  feel(fx, k = 1, ui = false) {
    if (!fx || !(this.scale > 0) || !this.pads || !(ui || this.live)) return false;
    const M = this.T.mix, tired = this.busy > M.duty && Math.max(fx.strong, fx.weak) < M.light;
    const g = clamp01(k) * this.scale * (tired ? M.tired : 1);
    const cut = (v) => { const m = clamp01(v * g); return m < M.min ? 0 : m; };
    const strong = cut(fx.strong), weak = cut(fx.weak);
    if (!strong && !weak) return false;
    this.list.push({ strong, weak, until: this.now + Math.min(fx.ms / 1000, M.max), ui });
    return true;
  }

  // a menu's tick (RUMBLE.ui)
  tick(name = 'tick') { return this.feel(this.T.ui[name], 1, true); }

  // once a frame, real dt. live: in play (not paused, no menu, no page); pad: the gamepad is the device in use
  update(dt, live, pad) {
    const M = this.T.mix;
    this.pads = !!pad;
    if (!pad) this.silence();
    else if (!live && this.live) {
      // out of play: what the play asked for stops at once (a menu's tick plays on)
      this.list = this.list.filter((e) => e.ui);
      if (this.out) this.stop();
    }
    this.live = !!live;
    this.list = this.list.filter((e) => e.until > this.now + EPS);
    const on = this.list.length > 0;
    this.busy += ((on ? 1 : 0) - this.busy) * (1 - Math.exp(-dt / M.window));
    this.mix(M);
    this.now += dt; // (after: what was felt this frame is played whole, from now)
  }

  // the strongest of what is under way on each motor, told to the pad when it changed
  mix(M) {
    if (!this.list.length) { this.out = null; return; } // what was sent ends by itself: it was told to last until the mix changed
    let strong = 0, weak = 0, until = Infinity;
    for (const e of this.list) {
      if (e.strong > strong) strong = e.strong;
      if (e.weak > weak) weak = e.weak;
    }
    // until the first of those that make the mix ends (one under them changes nothing when it does)
    for (const e of this.list) {
      if ((strong > 0 && e.strong === strong) || (weak > 0 && e.weak === weak)) until = Math.min(until, e.until);
    }
    const o = this.out;
    if (o && Math.abs(o.strong - strong) < EPS && Math.abs(o.weak - weak) < EPS && o.until >= until - EPS) return;
    if (this.now - this.sentAt < M.gap - EPS) return;
    this.out = { strong, weak, until };
    this.sentAt = this.now;
    const fx = { strong, weak, ms: Math.round((until - this.now) * 1000) };
    this.log?.push({ t: Math.round(this.now * 1000) / 1000, ...fx });
    this.pad.play(fx);
  }

  // nothing more: what is under way dropped, the pad stopped if it was playing
  silence() {
    this.list = [];
    if (this.out) this.stop();
  }

  stop() {
    const was = this.out && this.out.until > this.now;
    this.out = null;
    if (was) { this.log?.push({ t: Math.round(this.now * 1000) / 1000, stop: true }); this.pad.stop(); }
  }
}
