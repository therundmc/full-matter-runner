// What the player is shown of his kills and chains, kept apart from the guards' barks (world texts): the points
// stamped at the body (below it, the barks are above heads), the chain count and its fuse under the score, the
// feed of the last labels, the cash-out of a chain that ran out, the banner of a multi-kill. Fed by Scoring's events
// ('scored', 'multiKill', 'chainEnd'), it runs on its own clock, advanced by update() with the REAL time of the frame:
// a hit-stop or slow motion never holds a stamp up. Plain state and numbers (KILLFEED in data/feel.js); the canvas
// side is render/WorldRenderer.drawStamps and ui/HUD.js. DOM-free.
import { KILLFEED } from '../data/feel.js';
import { SCORING } from '../data/scoring.js';
import { clamp, lerp } from '../../engine/math.js';

const ease = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;

// the colour tier of a chain: an index into cfg.tiers, or cfg.tiers.length at the top multiplier (neon)
export function tierOf(combo, multiplier, cfg = KILLFEED, rules = SCORING.combo) {
  if (multiplier >= rules.max) return cfg.tiers.length;
  let i = 0;
  cfg.tiers.forEach(([from], j) => { if (combo >= from) i = j; });
  return i;
}

// the colour of a tier: a PALETTE key, a CSS colour or 'neon'
export const tierColor = (tier, cfg = KILLFEED) => cfg.tiers[tier]?.[1] ?? 'neon';

export default class KillFeed {
  constructor(events, cfg = KILLFEED, rules = SCORING.combo) {
    this.cfg = cfg;
    this.rules = rules;
    this.t = 0;          // real seconds since the level started
    this.stamps = [];    // { x, y, points, kind, color, size, t0, rot }
    this.lines = [];     // { str, color, t0, end } newest first
    this.panel = null;   // { chain, multiplier, tier, hitT, openT, endT (once the chain is over) }
    this.refillT = -99;  // when a knock-down last gave the chain some time back
    this.cash = null;    // { kills, points, t0 }
    this.banner = null;  // { tag, label, size, color, t0; life, y: its own, a boss's card }
    this.n = 0;          // stamps made (each turns the other way)
    events.on('scored', (e) => this.scored(e));
    events.on('multiKill', (e) => this.multi(e));
    events.on('chainEnd', (e) => this.chainEnd(e));
    events.on('boss', ({ boss, beat }) => { if (beat === 'intro') this.card(boss.traits.name); });
  }

  update(dt) {
    const t = (this.t += dt), C = this.cfg;
    this.stamps = this.stamps.filter((s) => t - s.t0 < C.stamp.life);
    this.lines = this.lines.filter((l) => t < l.end);
    if (this.panel?.endT !== undefined && t - this.panel.endT >= C.panel.collapse) this.panel = null;
    if (this.cash && t - this.cash.t0 >= C.cash.slam + C.cash.hold + C.cash.fade) this.cash = null;
    if (this.banner && t - this.banner.t0 >= (this.banner.life ?? C.banner.life)) this.banner = null;
  }

  scored({ x, y, points, labels = [], combo = 0, multiplier = 1, kind }) {
    const C = this.cfg, t = this.t, kill = kind === 'kill';
    const tier = tierOf(combo, multiplier, C, this.rules);
    const color = kill ? tierColor(tier, C) : C.stamp.colors[kind] ?? 'white';
    this.stamp(x, y, points, kind, color, kill ? this.stampSize(multiplier) : C.stamp.knock);
    // the labels go to the HUD's feed, the best of them on top
    const F = C.feed, fresh = labels.map((str, i) => ({ str, color, t0: t + i * F.stagger, end: t + i * F.stagger + F.life }));
    if (fresh.length) this.lines = [...fresh, ...this.lines].slice(0, F.max);
    const P = this.panel;
    if (kill && combo >= 2) {
      // the chain count slams in (or again, one more)
      const open = P && P.endT === undefined;
      this.panel = { chain: combo, multiplier, tier, hitT: t, openT: open ? P.openT : t };
      this.cash = null;
    } else if (kind === 'knock' && combo > 0) this.refillT = t;
  }

  // font size of a kill's stamp: grows with the multiplier
  stampSize(multiplier) {
    const [a, b] = this.cfg.stamp.size, k = clamp((multiplier - 1) / Math.max(1e-6, this.rules.max - 1), 0, 1);
    return Math.round(lerp(a, b, k));
  }

  stamp(x, y, points, kind, color, size) {
    const S = this.cfg.stamp, t = this.t;
    let sy = Math.round(y + S.lift);
    // a stamp still up where this one lands: this one goes under it
    for (let i = 0; i < 4; i++) {
      const o = this.stamps.find((s) => Math.abs(s.x - x) < S.spread && Math.abs(s.y - sy) < (s.size + size) / 2 + 1);
      if (!o) break;
      sy = o.y + Math.round((o.size + size) / 2) + 2;
    }
    if (this.stamps.length >= S.max) this.stamps.shift();
    this.stamps.push({ x: Math.round(x), y: sy, points, kind, color, size, t0: t, rot: (this.n++ % 2 ? 1 : -1) * S.tilt });
  }

  multi({ tag }) {
    const B = this.cfg.banner;
    if (!B.size[tag]) return;
    this.banner = { tag, label: SCORING.tags[tag]?.label ?? tag.toUpperCase(), size: B.size[tag], color: B.color[tag], t0: this.t };
  }

  // a boss's name, slammed like a multi-kill's banner and held longer
  card(name) {
    const K = this.cfg.banner.card;
    this.banner = { tag: 'card', label: name, size: K.size, color: K.color, life: K.life, y: K.y, t0: this.t };
  }

  chainEnd({ kills, points }) {
    const t = this.t;
    this.cash = { kills, points, t0: t };
    if (this.panel && this.panel.endT === undefined) this.panel.endT = t;
    for (const l of this.lines) l.end = Math.min(l.end, t + this.cfg.feed.end);
  }

  // ---- how each thing stands at this instant (the renderers draw from these) ----

  // a stamp: { x, y (whole px), scale, rot, alpha, ghost (0..1 the white ghost of its landing, 0 when gone) }
  stampView(s) {
    const S = this.cfg.stamp, age = this.t - s.t0, k = ease(age / S.slam), land = age - S.slam;
    return {
      x: s.x, y: s.y + Math.round(S.drift * clamp(age / S.life, 0, 1)),
      scale: lerp(S.from, 1, k), rot: s.rot * (1 - k),
      alpha: clamp(age / (S.slam * 0.5), 0, 1) * clamp((S.life - age) / S.fade, 0, 1),
      ghost: land > 0 && land < S.ghost ? 1 - land / S.ghost : 0,
    };
  }

  // the chain count: null when none shows, else { chain, multiplier, tier, open (0..1 of its height), punch (extra
  // scale), jolt (px), flash (0..1 the digits show white) }
  panelView() {
    const P = this.panel, C = this.cfg.panel;
    if (!P) return null;
    const t = this.t, hit = t - P.hitT;
    const open = P.endT !== undefined ? 1 - ease((t - P.endT) / C.collapse) : ease((t - P.openT) / C.open);
    return {
      chain: P.chain, multiplier: P.multiplier, tier: P.tier, open,
      punch: hit < C.punchT ? C.punch * (1 - hit / C.punchT) ** 2 : 0,
      jolt: hit < C.joltT ? C.jolt * (1 - hit / C.joltT) : 0,
      flash: hit < C.flash ? 1 : 0,
    };
  }

  // 0..1 the fuse flashes white after a knock-down won some time back (1 at once, 0 when over)
  refill() {
    const r = this.t - this.refillT, d = this.cfg.fuse.refill;
    return r >= 0 && r < d ? 1 - r / d : 0;
  }

  // the feed's lines, top first: { str, color, x (px it is still off to the right, at 720 p), alpha }; a line whose
  // turn has not come yet is left out
  lineViews() {
    const F = this.cfg.feed, t = this.t, out = [];
    for (const l of this.lines) {
      const age = t - l.t0;
      if (age < 0) continue;
      out.push({ str: l.str, color: l.color, x: Math.round(F.dist * (1 - ease(age / F.slide))), alpha: clamp((l.end - t) / F.fade, 0, 1) });
    }
    return out;
  }

  // the cash-out of a chain: null, or { kills, points, scale, alpha, ghost }
  cashView() {
    const c = this.cash, C = this.cfg.cash;
    if (!c) return null;
    const age = this.t - c.t0, k = ease(age / C.slam), land = age - C.slam;
    return {
      kills: c.kills, points: c.points, scale: lerp(C.from, 1, k),
      alpha: clamp(age / (C.slam * 0.5), 0, 1) * clamp((C.slam + C.hold + C.fade - age) / C.fade, 0, 1),
      ghost: land > 0 && land < 0.2 ? 1 - land / 0.2 : 0,
    };
  }

  // the multi-kill banner: null, or { label, size, color, y (share of the screen's height), scale, jolt (px), alpha, ghost }
  bannerView() {
    const b = this.banner, B = this.cfg.banner;
    if (!b) return null;
    const age = this.t - b.t0, k = ease(age / B.slam), land = age - B.slam;
    return {
      label: b.label, size: b.size, color: b.color, y: b.y ?? B.y, scale: lerp(B.from, 1, k),
      jolt: land > 0 && land < B.joltT ? B.jolt * (1 - land / B.joltT) : 0,
      alpha: clamp(age / (B.slam * 0.5), 0, 1) * clamp(((b.life ?? B.life) - age) / B.fade, 0, 1),
      ghost: land > 0 && land < B.ghost ? 1 - land / B.ghost : 0,
    };
  }
}
