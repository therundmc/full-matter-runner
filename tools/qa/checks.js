// Pure parts of the QA robot (tools/qa/bot.js): the invariants it tests on what the game shows, the trackers that
// turn a condition held too long into a finding, the plan scheduler and the seeded random numbers. No game import,
// no DOM: run.mjs injects this file into the page before bot.js (it sets globalThis.__qaChecks), and
// tests/qachecks.test.mjs loads it in Node to try every check on fake states.
(() => {
  const C = {};
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const hypot = Math.hypot;

  // seeded PRNG (mulberry32); hash: a seed from a few numbers and words (a plan's own dice: seed, session, name)
  C.prng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  C.hash = (...parts) => {
    let h = 2166136261 >>> 0;
    for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  };

  // ---------------------------------------------------------------- numbers of a drawn pose
  // what a character is drawn in: every number finite, the pose's scale sane, the torso on the body
  // (entities/CharacterAnim.js newPose; pose px, before BODY_SCALE)
  C.POSE = { sMin: 0.6, sMax: 1.5, torso: 20 };
  // references to other things, not numbers of the pose
  const SKIP = new Set(['carryImg', 'img', 'canvas', 'world', 'target', 'door', 'car', 'prop', 'ch', 'who', 'led']);
  const plain = (v) => v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype);

  // every non-finite number in a plain object (arrays and plain objects inside, `depth` levels down): [path, value]
  C.nonFinite = (o, prefix = '', depth = 3, out = []) => {
    if (!plain(o)) return out;
    for (const k of Object.keys(o)) {
      if (SKIP.has(k)) continue;
      const v = o[k], at = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'number') { if (!Number.isFinite(v)) out.push([at, v]); }
      else if (depth > 0 && plain(v)) C.nonFinite(v, at, depth - 1, out);
    }
    return out;
  };

  // [{ field, value, why }] for one drawn pose P and its facing layers (Facing.js)
  C.poseIssues = (P, facing, lim = C.POSE) => {
    const out = [];
    if (!P) return out;
    for (const [field, value] of C.nonFinite(P)) out.push({ field, value: String(value), why: 'not finite' });
    for (const [field, value] of C.nonFinite(facing || null, 'facing')) out.push({ field, value: String(value), why: 'not finite' });
    if (finite(P.s) && (P.s < lim.sMin || P.s > lim.sMax)) out.push({ field: 's', value: +P.s.toFixed(3), why: `scale out of [${lim.sMin}, ${lim.sMax}]` });
    const off = hypot(P.tx, P.ty);
    if (finite(off) && off > lim.torso) out.push({ field: 'tx,ty', value: +off.toFixed(1), why: `torso ${off.toFixed(0)} px off the body (> ${lim.torso})` });
    return out;
  };

  // ---------------------------------------------------------------- size on screen
  // a character's drawn size against the one expected (BODY_SCALE x the camera's zoom): the transform scale his draw
  // was called with (camera and crouch), a pose scale (1: the frame only), the camera's zoom x scale. null when fine.
  C.SCALE = { lo: 0.8, hi: 1.4 }; // sat on the floor 0.86, over a window 1.16; a civilian curled up drawn at 0.78 was 'tiny'
  C.drawScale = (entry, ps, camZ, lim = C.SCALE) => {
    const ratio = (entry * ps) / camZ;
    if (!finite(ratio)) return { ratio: String(ratio), why: 'not finite' };
    return ratio < lim.lo || ratio > lim.hi ? { ratio: +ratio.toFixed(3), why: `drawn at ${ratio.toFixed(2)} x the expected size` } : null;
  };

  // ---------------------------------------------------------------- camera
  // cam: { x, y, zoom, scale, w, h }; o.start: first frame of a level (scale back to o.scale, the zoom the one the
  // window size gives, o.zoom); o.player: his screen position { x, y } when he must be seen. [{ sig, why, ... }]
  C.cameraIssues = (cam, o = {}) => {
    const out = [];
    for (const k of ['x', 'y', 'zoom', 'scale']) if (!finite(cam[k])) out.push({ sig: `nan-${k}`, why: `camera ${k} is ${cam[k]}` });
    if (out.length) return out;
    if (cam.scale < 0.4 || cam.scale > 3) out.push({ sig: 'scale-range', why: `camera scale ${cam.scale} out of [0.4, 3]` });
    if (o.start) {
      if (o.scale !== undefined && Math.abs(cam.scale - o.scale) > 1e-3) out.push({ sig: 'scale-not-reset', why: `level start with camera scale ${cam.scale}, its default is ${o.scale}` });
      if (o.zoom !== undefined && cam.zoom !== o.zoom) out.push({ sig: 'zoom-not-reset', why: `level start with zoom ${cam.zoom}, the window gives ${o.zoom}` });
    }
    const s = o.player;
    if (s && (!finite(s.x) || !finite(s.y) || s.x < 0 || s.y < 0 || s.x > cam.w || s.y > cam.h)) out.push({ sig: 'player-off-screen', why: `the player is drawn at (${Math.round(s.x)}, ${Math.round(s.y)}) of a ${cam.w} x ${cam.h} view` });
    return out;
  };

  // ---------------------------------------------------------------- trackers
  // A condition that must not hold for long: hold(key, cond, now) returns the s it has held the first time that passes
  // `after` (once per spell), else null; a spell ends when the condition stops.
  C.Spell = class {
    constructor(after) { this.after = after; this.m = new Map(); }
    hold(key, cond, now) {
      if (!cond) { this.m.delete(key); return null; }
      const s = this.m.get(key);
      if (!s) { this.m.set(key, { t0: now, told: false }); return null; }
      if (s.told || now - s.t0 <= this.after) return null;
      s.told = true;
      return now - s.t0;
    }
    clear() { this.m.clear(); }
  };

  // Something that should get somewhere: still(key, x, y, now) returns the s it has kept within `move` px of one spot
  // the first time that passes `after` (once per stay), else null; drop(key) when it no longer has to move.
  C.Anchor = class {
    constructor(move, after) { this.move = move; this.after = after; this.m = new Map(); }
    still(key, x, y, now) {
      const a = this.m.get(key);
      if (!a || hypot(x - a.x, y - a.y) > this.move) { this.m.set(key, { x, y, t: now, told: false }); return null; }
      if (a.told || now - a.t <= this.after) return null;
      a.told = true;
      return now - a.t;
    }
    drop(key) { this.m.delete(key); }
    clear() { this.m.clear(); }
  };

  // ---------------------------------------------------------------- moves the player is locked in
  // the longest a move may last (s of world time), read from the game's data D: { lockTime (data/finishers.js),
  // lockedFor (systems/Takedown.js), TRAVERSE, GESTURE (data/feel.js), rollDur (PLAYER.roll.dur) }, with slack
  // (a pull into place, a hit-stop, a walk out of it)
  C.moveLimit = (kind, o, D) => {
    let base;
    if (kind === 'execution') base = D.lockTime(o.f);
    else if (kind === 'takedown') base = D.lockedFor(o.f) + 0.6; // pulled to his spot first
    else if (kind === 'kick') base = D.TRAVERSE.kick.dur;
    else if (kind === 'vault') base = (o.ladder ? Math.max(o.dur, 3) : o.dur) + (o.roll || o.rolling ? (o.rolling?.dur ?? D.rollDur) : 0);
    else if (kind === 'trunk') base = D.GESTURE.trunk.dur;
    else if (kind === 'passage') base = o.cfg.down + o.cfg.under + o.cfg.up;
    else return Infinity;
    return base * 1.5 + 1;
  };

  // ---------------------------------------------------------------- a parked car that moves
  // update(key, pos, now, { touched, excused }): px it was carried along while people on foot touched it and nothing
  // else could explain it (a blast, another vehicle, its driver), once over `px` within `within` s; else null. Only a
  // car that stood still `rest` s first (parked, or stopped for good: not one coasting on after its driver ran). The
  // way it went between two samples is excused when either end is (its driver pulled away and stopped in between)
  C.ShoveWatch = class {
    constructor(px = 6, within = 3, rest = 2) { this.px = px; this.within = within; this.rest = rest; this.m = new Map(); }
    update(key, pos, now, { touched = false, excused = false } = {}) {
      let s = this.m.get(key);
      if (!s) { this.m.set(key, { x: pos.x, y: pos.y, sum: 0, t0: now, still: now, told: false, ex: excused }); return null; }
      const d = hypot(pos.x - s.x, pos.y - s.y), was = s.ex;
      s.x = pos.x; s.y = pos.y; s.ex = excused;
      const rested = s.sum > 0 || now - s.still >= this.rest;
      if (d < 0.5 && !s.sum) { if (!rested) return null; } else if (!rested) { s.still = now; return null; }
      if (excused || was || !touched) { s.sum = 0; s.t0 = now; if (d >= 0.5) s.still = now; return null; }
      if (d < 0.5) { if (now - s.t0 > this.within) { s.sum = 0; s.t0 = now; } return null; }
      if (now - s.t0 > this.within) { s.sum = 0; s.t0 = now; }
      s.sum += d;
      if (s.sum > this.px && !s.told) { s.told = true; return +s.sum.toFixed(1); }
      return null;
    }
    clear() { this.m.clear(); }
  };

  // ---------------------------------------------------------------- a body that will not lie still
  // update(key, { x, y, a, age, excused, from }, now): 'spun' when the torso turned more than `spin` rad between `from` s
  // (s.from for a body that must stay where it was slammed: from the start) and `until` s after death, 'drift' when it
  // still moves (> `px` px or > `rad` rad between two samples, `runs` samples running)
  // past `settle` s; each once per body; else null. excused: a blast, a car, somebody on it, rounds flying.
  C.CORPSE = { from: 1, until: 6, spin: 2.6, settle: 5, px: 1, rad: 0.08, runs: 3 }; // sampled 6 times a second
  C.CorpseWatch = class {
    constructor(lim = C.CORPSE) { this.lim = lim; this.m = new Map(); }
    update(key, s, now) {
      const L = this.lim;
      let c = this.m.get(key);
      if (!c) { c = { x: s.x, y: s.y, a: s.a, turn: 0, runs: 0, spun: false, drift: false }; this.m.set(key, c); return null; }
      const d = hypot(s.x - c.x, s.y - c.y), da = Math.abs(angDiff(c.a, s.a));
      c.x = s.x; c.y = s.y; c.a = s.a;
      if (s.excused) { c.runs = 0; return null; }
      if (s.age >= (s.from ?? L.from) && s.age <= L.until) c.turn += da;
      if (!c.spun && c.turn > L.spin) { c.spun = true; return { kind: 'spun', turn: +c.turn.toFixed(2) }; }
      if (s.age < L.settle) return null;
      c.runs = d > L.px || da > L.rad ? c.runs + 1 : 0;
      if (!c.drift && c.runs >= L.runs) { c.drift = true; return { kind: 'drift', px: +d.toFixed(1), rad: +da.toFixed(2) }; }
      return null;
    }
    forget(key) { this.m.delete(key); }
    clear() { this.m.clear(); }
  };
  // a body (box: the bounds round all its parts) touched by loose furniture on the move ({ bounds, speed } px/step: a
  // gas bottle riding its jet, a shoved table, a chair thrown into him) or by a door leaf ({ bounds, press: true }:
  // its hinge is enforced, a leaf swung onto him squeezes him out from under it). Physics shoving him, not a slide.
  C.shovedBy = (box, things, pad = 6, speed = 0.3) => things.some((p) => (p.press || p.speed > speed)
    && p.bounds.min.x < box.max.x + pad && p.bounds.max.x > box.min.x - pad && p.bounds.min.y < box.max.y + pad && p.bounds.max.y > box.min.y - pad);
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  C.angDiff = angDiff;

  // ---------------------------------------------------------------- geometry
  // can he walk from `from` to the exit? way(a, b): a grid path between two points; hatches: the level's passage
  // ([a, b], systems/Passage.js: not in the grid), down one and up the other
  C.exitReachable = (way, from, exit, hatches = []) => way(from, exit)
    || (hatches.length === 2 && hatches.some((h, i) => way(from, h) && way(hatches[1 - i], exit)));
  // fn() run with these cells of a blocked grid open (a locked door: he kicks it open), the grid left as it was
  C.withOpen = (blocked, cells, fn) => {
    const was = cells.map((i) => blocked[i]);
    for (const i of cells) blocked[i] = 0;
    try { return fn(); } finally { cells.forEach((i, k) => { blocked[i] = was[k]; }); }
  };

  // can the player get his centre within `reach` px of (x, y)? free(x, y): no wall or solid furniture there. Spokes
  // in 16 directions, a standing spot needs room for his body (r px each way)
  C.reachable = (x, y, free, reach = 26, r = 8) => {
    const room = (px, py) => free(px, py) && free(px + r, py) && free(px - r, py) && free(px, py + r) && free(px, py - r);
    if (room(x, y)) return true;
    for (const d of [reach - 4, reach * 0.6]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        if (room(x + Math.cos(a) * d, y + Math.sin(a) * d)) return true;
      }
    }
    return false;
  };

  // distance from (px, py) to the segment (ax, ay) - (bx, by)
  C.segDist = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
    return hypot(px - (ax + vx * t), py - (ay + vy * t));
  };

  // a door leaf: { rel (rad from closed), max (its stop), off (px of its middle off where the hinge holds it) } ->
  // [why] (NaN, past its stop, off its hinge)
  C.doorIssues = ({ rel, max, off, x, y }) => {
    const out = [];
    if (![rel, off, x, y].every(finite)) out.push('nan');
    else {
      if (Math.abs(rel) > max + 0.1) out.push('past-stop');
      if (off > 4) out.push('off-hinge');
    }
    return out;
  };

  // ---------------------------------------------------------------- sounds
  // the top-level keys of an object literal's source, `{` included (strings and comments skipped, nesting counted)
  C.topKeys = (src) => {
    const keys = [];
    let depth = 0, i = 0, expect = false;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
      if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; if (i < 2) break; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { i++; while (i < src.length && src[i] !== ch) i += src[i] === '\\' ? 2 : 1; i++; continue; }
      if ('{[('.includes(ch)) { depth++; if (depth === 1) expect = true; i++; continue; }
      if ('}])'.includes(ch)) { depth--; if (depth === 0) break; i++; continue; }
      if (depth === 1 && ch === ',') { expect = true; i++; continue; }
      if (depth === 1 && expect && /[A-Za-z_$]/.test(ch)) {
        const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(src.slice(i, i + 80));
        if (m) keys.push(m[1]);
        expect = false;
      } else if (!/\s/.test(ch)) expect = false;
      i++;
    }
    return keys;
  };

  // the names src/audio/Audio.js can play, read from its source: the keys of GUNS, FOLEY and ALIAS and its
  // `_name(` recipes; Foley.js RECIPES and the live object's methods are added by the bot
  C.soundNames = (src) => {
    const names = new Set();
    for (const block of ['GUNS', 'FOLEY']) {
      const at = src.indexOf(`const ${block} = {`);
      if (at >= 0) for (const k of C.topKeys(src.slice(at + block.length + 9))) names.add(k);
    }
    const alias = src.match(/const ALIAS = \{([^}]*)\}/);
    if (alias) for (const m of alias[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) names.add(m[1]);
    for (const m of src.matchAll(/^ {2}_([A-Za-z][\w$]*)\s*\(/gm)) names.add(m[1]);
    return names;
  };

  // ---------------------------------------------------------------- plans
  // Which plan a session starts on: a seeded shuffled deck per family (normal, chaos) so that every plan comes up as
  // often as the others; a share `share` of the draws (1: all) comes from the chaos deck. next(ok, start): the next
  // name that ok(name) accepts ('free' only at a session start), null when none; skipped(name) counts refusals.
  C.Scheduler = class {
    constructor({ normal = [], chaos = [], share = 0, rnd }) {
      this.names = { normal, chaos };
      this.decks = { normal: [], chaos: [] };
      this.share = chaos.length ? share : 0;
      this.rnd = rnd;
      this.skips = {};
    }
    family() { return this.share > 0 && (this.share >= 1 || this.rnd() < this.share) ? 'chaos' : 'normal'; }
    next(ok = () => true, start = true) {
      const fam = this.family(), names = this.names[fam];
      if (!names.length) return fam === 'chaos' ? null : start ? { name: 'free', chaos: false } : null;
      for (let i = 0; i < names.length * 2; i++) {
        const deck = this.decks[fam];
        if (!deck.length) {
          deck.push(...names);
          for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(this.rnd() * (k + 1)); [deck[k], deck[j]] = [deck[j], deck[k]]; }
        }
        const name = deck.shift();
        if (name === 'free' && !start) continue;
        if (ok(name)) return { name, chaos: fam === 'chaos' };
        this.skips[name] = (this.skips[name] || 0) + 1;
      }
      return start && fam === 'normal' ? { name: 'free', chaos: false } : null;
    }
  };

  globalThis.__qaChecks = C;
})();
