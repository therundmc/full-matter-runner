// A level that teaches (level `tutorial`: tools/build_tutorial.py), and how it is staged (data/staging.js). Its
// rooms, the stages, are played one after the other; each asks for one move and says so next to what it is done
// to, never in a wall of text: the first time a hint shows, time slows to a crawl until he does it (pace). It opens
// on a scene he can only watch (the man with the match: open / play), names the camera's shot as it goes (shot)
// and ends on the flat blowing up behind him (blow). DOM-free: the state and the rules; render/WorldRenderer.js
// draws what hints() returns, Game eases the time and the camera.
//
// Level data (tiles):
//   stages  [{ zone: [c0, r0, c1, r1]   the room: walking into it makes it the current stage
//              spawn: [col, row, deg]    where a retry puts him back once the stage was reached
//              waves: [{ at: [[col, row]...], on, blind, slack }]   its guards, by the tile they stand on. They are dormant
//                     (Enemy.dormant: they see and hear nothing, stand where they are) until their wave is called:
//                     on = 'enter' (he walks in) | 'kills:N' (N guards of the stage are dead) | 'pickup:TYPE' (he
//                     takes that weapon) | 'never' (a man who is only there to be dealt with). blind: they do not
//                     wake either when he walks up in front of them. slack: how much slower than a real guard
//                     they react (SLACK if not given; they always fire SLACK times slower). sharp: they were waiting for him, they know him at
//                     once when woken (no suspicion to build up first). up: [col, row] they are not there yet but
//                     on their way up the stairs (World.holdBack): called, they are heard coming (STEPS), one of them
//                     shouts, and they come up there one after the other (World.bringOn); he walking up to that
//                     spot calls them too.
//              cues: [{ at: [col, row], act, delay }]   walking into the stage cues act `act` of the job of the guard
//                     standing there (data/posts.js, Routine.cue), dormant or not
//              hold: s, keep: [[c0, r0, c1, r1]...]   the fire is kept out of the room (and of those rectangles)
//                     until `hold` s after he walked in (systems/FireSpread.js)
//              cam: the camera's shot while he is there (data/staging.js SHOTS)
//              hints: [names of HINTS, the first that applies wins a place: two at most are shown, one a target]
//              take: TYPE, marks: { name: [col, row] }   what some hints point at
//              leaves: N   the gun a dead man of the stage drops has N rounds left in it, no more (a retry further
//                     on finds that gun, `take`, by where it starts: `owed`) }]
//           A guard may stand in the waves of two stages running (pointed at from one, fought in the next).
//   opening { man: [col, row] (the tile of the man with the match), match: [col, row] (where it falls: a retry's
//           fire starts there), door: [col, row] (the door he leaves by and slams), out: [col, row] (where he runs to) }
//   blast   { zone: [c0, r0, c1, r1] (the last stretch: stepping into it with nobody left standing sets it off),
//           at: [col, row] (the stove), breach: [col, row] (where the ball of fire comes out) }
//   fall    [c0, r0, c1, r1]: beyond the window. Once he is there the lesson is over ('tutorialEnd'); he lands
//           from its windows in a roll.
import { TILE, PALETTE } from '../Config.js';
import { LESSONS, OPENING, BLAST } from '../data/staging.js';

const SHOWN = 2;       // hints on screen at once
const MOVED = 70;      // px walked before MOVE goes away
const FRONT = 1.7;     // tiles: a dormant guard he walks up to, in front of him, wakes (unless his wave is blind)
const UP = -24;        // px a hint floats over what it points at
const SLACK = 1.7;     // how much slower than a real guard its men react and shoot (Enemy.slack): it is a lesson
const STAND = 2.5;     // s a sharp wave's man holds his ground once woken (Enemy.standT)
const STEPS = [6, 0.2, 0.25]; // men coming up the stairs: steps heard, s between two, s from the last to the first man
const NEXT = 0.45;            // s between two of them coming up
const SIDE = 11;              // px either side of the stairs' middle they come up at
const KEYLESS = 0.7;          // real s a hint without a key slows time at least (he may be walking already)

const inside = ([c0, r0, c1, r1], x, y) => x >= c0 * TILE && x < (c1 + 1) * TILE && y >= r0 * TILE && y < (r1 + 1) * TILE;
const at = ([c, r]) => ({ x: c * TILE, y: r * TILE });
// is guard e the one the level put on tile [c, r] (his job may have taken him a step off it since: Enemy.spawn)
const tileOf = (e, [c, r]) => { const p = e.spawn ?? e; return Math.floor(p.x / TILE) === c && Math.floor(p.y / TILE) === r; };
const nearest = (list, p) => list.reduce((best, e) => (!best || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? e : best), null);

// What a hint says and over what: (tutorial, stage, player) -> { x, y, key, text } or null. key: the action whose cap
// is shown before the words ('' : none), named for the device in use when drawn (data/controls.js ACTIONS: ZQSD or
// the left stick, SPACE or A...).
export const HINTS = {
  move: (T, s, p) => (T.moved < MOVED ? { x: p.x, y: p.y, key: 'move', text: 'MOVE' } : null),
  flee: (T, s) => (s.marks?.flee && T.world.fireSpread?.burning.length ? { ...at(s.marks.flee), key: '', text: 'THE FIRE KILLS  -  GET OUT' } : null),
  takedown: (T, s, p) => {
    const g = T.present(s).find((e) => e.aware === 0);
    if (!g) return null;
    // what the takedown will be: his neck, or his head driven into what stands in front of him (WALL SMASH...)
    // (or, come at face to face, what is done to a man from the front)
    const text = p.takeMove?.spot || p.takeMove?.front ? p.contextAction : 'BREAK HIS NECK';
    return p.nearTakedown === g ? { x: g.x, y: g.y, key: 'attack', text } : { x: g.x, y: g.y, key: '', text: 'GET BEHIND HIM' };
  },
  punch: (T, s, p) => {
    const g = !p.armed && nearest(T.present(s), p);
    return g ? { x: g.x, y: g.y, key: 'attack', text: 'PUNCH' } : null;
  },
  finish: (T, s, p) => {
    const g = nearest(T.guards(s).filter((e) => e.alive && e.knocked > 0), p);
    return g ? { x: g.x, y: g.y, key: 'attack', text: 'FINISH HIM' } : null;
  },
  take: (T, s, p) => {
    const it = p.weapon?.type !== s.take && T.world.items.find((i) => !i.dead && i.type === s.take && inside(s.zone, i.x, i.y));
    return it ? { x: it.x, y: it.y, key: 'use', text: 'TAKE IT' } : null;
  },
  strike: (T, s, p) => {
    const g = p.armed && p.def.kind !== 'gun' && nearest(T.present(s), p);
    return g ? { x: g.x, y: g.y, key: 'attack', text: 'STRIKE' } : null;
  },
  shoot: (T, s, p) => {
    const g = p.armed && p.def.kind === 'gun' && p.weapon.mag > 0 && nearest(T.present(s), p);
    return g ? { x: g.x, y: g.y, key: 'attack', text: 'SHOOT' } : null;
  },
  throw: (T, s, p) => (p.armed && p.def.kind === 'gun' && p.weapon.mag <= 0 && T.present(s).length
    ? { x: p.x, y: p.y, key: 'throw', text: 'THROW IT' } : null),
  slide: (T, s) => (T.standing(s).length && s.marks?.slide ? { ...at(s.marks.slide), key: 'action', text: 'RUN AND SLIDE UNDER HIS FIRE' } : null),
  dive: (T, s) => (s.marks?.dive && !T.standing(s).length ? { ...at(s.marks.dive), key: 'action', text: 'DIVE' } : null),
};

export default class Tutorial {
  // from: the stage a retry starts again at (0: the beginning)
  constructor(world, def, from = 0) {
    this.world = world;
    this.def = def;
    this.stage = -1;   // the furthest stage reached
    this.moved = 0;    // px walked so far
    this.last = null;
    this.picked = null;
    this.left = null;  // a gun just dropped by a dead man, to be left with a few rounds: { x, y, n, steps }
    this.owed = null;  // the gun a retry starts past the dropping of, for the world to lay down: { type, mag, x, y, angle }
    this.over = false;
    this.from = from;
    this.coming = [];  // what is still to happen of men coming up the stairs: { t (world time), step | g }
    this.scene = null; // the opening while it plays: { man, t0, from, step, matchAt, done }
    this.lesson = null;                                 // the hint time is slowed for: { text, slow, t, age }
    this.taught = world.game?.taught || new Set();      // what was said already, this run and its retries
    this.blast = def.blast ? { ...def.blast, t: null } : null;
    const posted = (list) => world.enemies.filter((e) => list.some((t) => tileOf(e, t)));
    this.stages = def.stages.map((s) => ({
      ...s, kills: 0,
      waves: (s.waves || []).map((w) => ({ on: w.on || 'enter', blind: !!w.blind, sharp: !!w.sharp, slack: w.slack ?? SLACK, up: w.up ?? null, awake: false, guards: posted(w.at) })),
      cues: (s.cues || []).map((c) => ({ act: c.act, delay: c.delay ?? 0, guards: posted([c.at]) })),
    }));
    for (const s of this.stages) for (const w of s.waves) for (const g of w.guards) Object.assign(g, { dormant: true, slack: w.slack, rate: SLACK });
    // the men still on their way up the stairs are not in the building yet
    for (const s of this.stages) for (const w of s.waves) if (w.up) for (const g of w.guards) world.holdBack(g);
    // out of the windows over the alley he lands in a roll (Character.tryVault: `land`)
    if (def.fall) {
      const [c0, r0, c1, r1] = def.fall;
      for (const g of world.windows || []) if (g.cx >= c0 - 1 && g.cx <= c1 + 1 && g.cy >= r0 && g.cy <= r1) g.def = { land: 'roll' };
    }
    // the stove is kept for the end: the fire does not set it off before (systems/FireSpread.js)
    if (this.blast) {
      const p = at(this.blast.at);
      this.stove = (world.props || []).filter((q) => q.def?.gas).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] || null;
      if (this.stove) this.stove.staged = true;
    }
    world.events.on('kill', ({ victim }) => {
      const s = this.stages[this.stage];
      if (!s || !this.guards(s).includes(victim)) return;
      s.kills++;
      if (s.leaves !== undefined) this.left = { x: victim.x, y: victim.y, n: s.leaves, steps: 30 };
    });
    world.events.on('pickup', ({ ch, type }) => { if (ch.isPlayer) this.picked = type; });
    world.events.on('matchDrop', () => this.caught());
    if (from > 0 && from < this.stages.length) this.restore(from);
    else if (def.opening) this.open(!!world.game?.tutorialAt);
  }

  guards(s) { return s.waves.flatMap((w) => w.guards); }
  // the guards of a stage still on their feet (those still to come up the stairs too) ...
  standing(s) { return this.guards(s).filter((e) => e.alive && e.knocked <= 0 && !e.gone); }
  // ... and those of them that are there to be pointed at: a man who is only there to be dealt with, or one whose
  // wave was called (never one still waiting his turn behind a door, or down the stairs)
  present(s) { return s.waves.filter((w) => w.on === 'never' || w.awake).flatMap((w) => w.guards).filter((e) => e.alive && e.knocked <= 0 && !e.gone && !e.offstage); }

  // the stage whose room (x, y) px is in, or -1
  stageAt(x, y) { return this.stages.findIndex((s) => inside(s.zone, x, y)); }

  // a retry: he is put back where stage i starts, the rooms before it are empty and burning
  restore(i) {
    const w = this.world, p = w.player, [col, row, deg = 0] = this.stages[i].spawn;
    const ahead = new Set(this.stages.slice(i).flatMap((s) => this.guards(s)));
    const gone = new Set(this.stages.slice(0, i).flatMap((s) => this.guards(s)).filter((e) => !ahead.has(e)));
    for (const e of gone) w.removeBody(e.body);
    w.enemies = w.enemies.filter((e) => !gone.has(e));
    for (const s of this.stages.slice(0, i)) for (const wave of s.waves) Object.assign(wave, { guards: [], awake: true });
    Matter.Body.setPosition(p.body, { x: col * TILE, y: row * TILE });
    p.angle = (deg * Math.PI) / 180;
    const armed = this.stages.slice(0, i).reverse().find((s) => s.leaves !== undefined && s.take);
    if (armed) this.owed = { type: armed.take, mag: armed.leaves, x: col * TILE + Math.cos(p.angle) * TILE * 0.8, y: row * TILE + Math.sin(p.angle) * TILE * 0.8, angle: 0.6 };
    p.sit = 0;
    this.stage = i - 1;
    this.moved = MOVED;
    // the man with the match is long gone, his door shut, and the fire has been burning since
    const O = this.def.opening;
    if (!O) return;
    this.shut(O.door);
    w.fireSpread?.restore(i, O.match[0] * TILE, O.match[1] * TILE);
  }

  // ---- the opening: the man with the match (OPENING in data/staging.js)

  // again: a retry of the first room (the laugh is not played twice)
  open(again) {
    const w = this.world, p = w.player, man = w.enemies.find((e) => tileOf(e, this.def.opening.man));
    if (!man || !p) return;
    this.scene = { man, t0: null, from: again ? OPENING.retry : 0, step: 0, matchAt: null, done: false };
    man.invulnerable = true; // nothing stops him
    p.sit = 1;               // on his mattress, kept down until the match has fallen
    p.rising = false;
    p.pinned = true;
  }

  play(sc) {
    const w = this.world, p = w.player, O = OPENING, g = sc.man, D = this.def.opening;
    if (sc.t0 === null) sc.t0 = w.time - sc.from;
    const t = w.time - sc.t0;
    if (sc.step < 1 && t >= O.turn) {
      // he turns to the man on the mattress ...
      sc.step = 1;
      if (g.home) g.home.angle = Math.atan2(p.y - g.y, p.x - g.x);
      g.workSpot = null;
    }
    if (sc.step < 2 && t >= O.laugh) {
      // ... and laughs, then lights it (his job's acts: laugh -> light, data/posts.js arson)
      sc.step = 2;
      g.routine?.cue(sc.from ? 'light' : 'laugh');
      if (!sc.from) {
        g.speak?.('laugh');
        w.texts?.push({ who: g, x: g.x, y: g.y, str: O.line, t: O.bubble, dur: O.bubble, color: PALETTE.pink, bubble: true });
        w.sound('arsonLaugh', g.x, g.y, 1, { pitch: g.voice });
      }
    }
    // no match after all (he was knocked about): the player is not kept down for ever
    if (sc.matchAt === null && t >= O.down) this.caught();
    if (sc.matchAt === null) return;
    const since = w.time - sc.matchAt, out = at(D.out);
    if (!g.gone && since >= O.run) g.bolt = out; // Enemy.waitTurn: he makes for the door at a run
    if (!g.gone && (since >= O.gone || Math.hypot(out.x - g.x, out.y - g.y) < 12)) {
      g.gone = true;
      w.leave?.(g);
      this.shut(D.door, true);
    }
    if (g.gone && since >= O.shot) { sc.done = true; this.scene = null; }
  }

  // the match is on the floor: the petrol catches (systems/FireSpread.js), a breath of slow motion, and he may get up
  caught() {
    const sc = this.scene, w = this.world;
    if (!sc || sc.matchAt !== null) return;
    sc.matchAt = w.time;
    if (w.player) w.player.pinned = false;
    w.slowmo?.(...OPENING.slow);
  }

  // the door on tile [c, r] shut and locked; slam: heard and felt
  shut(tile, slam = false) {
    const w = this.world, m = w.map, d = m && (w.doors || []).find((o) => o.cells?.includes(tile[1] * m.w + tile[0]));
    if (!d) return;
    Matter.Body.setAngle(d.body, d.a0);
    Matter.Body.setAngularVelocity(d.body, 0);
    d.lock();
    if (!slam) return;
    w.sound('doorSlam', d.hx, d.hy, 1);
    w.shake?.(0.3);
  }

  // ---- the camera's shot now: { name (data/staging.js SHOTS), at: what it looks at or null }
  shot() {
    const w = this.world, p = w.player, sc = this.scene, B = this.blast;
    if (this.over) return { name: 'dive', at: null };
    if (sc) {
      if (sc.matchAt !== null) return { name: 'catch', at: w.fireSpread?.nearest(p.x, p.y) || at(this.def.opening.match) };
      return sc.step >= 1 ? { name: 'laugh', at: sc.man } : { name: 'wake', at: null };
    }
    if (B?.t != null) return { name: 'run', at: w.time - B.t < BLAST.look ? at(B.breach) : null };
    return { name: this.stages[Math.max(0, this.stage)]?.cam || null, at: null };
  }

  // ---- the lessons: time slowed while a hint shows for the first time (LESSONS in data/staging.js).
  // dt: real s; did(action): is that action's key down (data/controls.js ACTIONS)? Returns the time scale wanted.
  pace(dt, did) {
    const shown = this.hints(), L = this.lesson;
    if (L) {
      L.t -= dt;
      L.age += dt;
      const h = shown.find((x) => x.text === L.text);
      const done = h && (h.key ? did(h.key) : L.age >= KEYLESS && did('move'));
      if (L.t <= 0 || !h || done) this.lesson = null; else return L.slow;
    }
    for (const h of shown) {
      const D = LESSONS[h.text];
      if (!D || this.taught.has(h.text)) continue;
      this.taught.add(h.text);
      this.lesson = { text: h.text, slow: D.slow, t: D.hold, age: 0 };
      return D.slow;
    }
    return 1;
  }

  // ---- the end: the flat goes up behind him (BLAST in data/staging.js)
  blow() {
    const w = this.world, p = w.player, B = this.blast, was = p.invulnerable, q = at(B.at), b = at(B.breach);
    B.t = w.time;
    p.invulnerable = true; // a stage blast: nothing of it kills him
    w.after(BLAST.shield, () => { if (!this.over) p.invulnerable = was; });
    w.after(BLAST.after, () => {
      w.slowmo(...BLAST.slow);
      w.shake(BLAST.shake);
      const s = this.stove;
      if (s && !s.dead && !s.dying) s.break(-Math.PI / 2, 2); // torn open: its gas goes (Prop.break), and the bottle's with it
      else w.explode(q.x, q.y, { radius: 84, source: 'oven' });
    });
    w.after(BLAST.after + BLAST.breach[0], () => w.explode(b.x, b.y, { radius: BLAST.breach[1], source: 'gas' }));
  }

  // a wave whose time has come: its guards see and hear again, and know something is up
  call(s, p) {
    for (const w of s.waves) {
      if (w.awake || w.on === 'never') continue;
      const [what, arg] = w.on.split(':');
      const due = what === 'enter' || (what === 'kills' && s.kills >= Number(arg)) || (what === 'pickup' && (this.picked === arg || p.weapon?.type === arg));
      if (due) this.wake(w, p);
    }
  }

  wake(w, p) {
    w.awake = true;
    if (w.up) { this.comeUp(w); return; }
    for (const g of w.guards) {
      if (!g.alive || !g.dormant) continue;
      g.dormant = false;
      if (w.sharp) {
        g.lastKnown = { x: p.x, y: p.y };
        g.stow = 0;        // his gun already in his hand
        g.standT = STAND;  // and he stands there firing down the corridor before he thinks of cover
        g.spot(false);
      } else g.hear('noise', p.x, p.y, p);
    }
  }

  // a wave on its way up the stairs: their steps come up, then they come up one after the other, the first shouting
  comeUp(w) {
    const now = this.world.time, [c, r] = w.up, x = c * TILE, y = r * TILE, [n, gap, lead] = STEPS;
    for (let i = 0; i < n; i++) this.coming.push({ t: now + i * gap, step: { x, y, vol: 0.45 + (0.5 * i) / n } });
    const t0 = now + (n - 1) * gap + lead;
    w.guards.filter((g) => g.alive).forEach((g, i) => {
      const side = i % 2 ? SIDE : i ? -SIDE : 0;
      this.coming.push({ t: t0 + i * NEXT, g, x: x + side, y, first: i === 0 });
    });
  }

  // the steps on the stairs, the men coming up
  arrive() {
    const w = this.world, p = w.player;
    for (const a of this.coming) {
      if (a.done || w.time < a.t) continue;
      a.done = true;
      if (a.step) { w.sound('step', a.step.x, a.step.y, a.step.vol, { floor: w.floorAt?.(a.step.x, a.step.y), run: true }); continue; }
      const g = a.g;
      w.bringOn(g, a.x, a.y, Math.atan2(p.y - a.y, p.x - a.x));
      g.dormant = false;
      g.crouch = 1; // still a step down: he straightens up as he comes onto the landing
      if (a.first) { g.barkT = 0; g.say?.('stairs'); }
      g.hear('noise', p.x, p.y, p);
    }
    this.coming = this.coming.filter((a) => !a.done);
  }

  update() {
    const w = this.world, p = w.player;
    if (!p || !p.alive || this.over) return;
    if (this.scene) this.play(this.scene);
    if (this.last) this.moved += Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.last = { x: p.x, y: p.y };
    for (let i = this.stage + 1; i < this.stages.length; i++) {
      if (!inside(this.stages[i].zone, p.x, p.y)) continue;
      this.stage = i;
      if (w.game) w.game.tutorialAt = { name: w.level.name, stage: i };
      // walking in: what the men there were waiting for
      for (const c of this.stages[i].cues) for (const g of c.guards) if (g.alive && g.knocked <= 0) g.routine?.cue(c.act, c.delay);
    }
    if (this.coming.length) this.arrive();
    if (this.left && this.left.steps-- > 0) {
      // what he had not fired is not handed over: the gun he dropped holds a couple of rounds
      for (const it of w.items) {
        if (!it.dead && it.def.kind === 'gun' && Math.hypot(it.x - this.left.x, it.y - this.left.y) < 90) it.mag = Math.min(it.mag, this.left.n);
      }
    }
    const s = this.stages[this.stage];
    if (s) {
      this.call(s, p);
      // walked up to, in front: he looks up (walked up to the stairs: those coming up them are there)
      for (const wave of s.waves) {
        if (wave.blind || wave.awake) continue;
        const seen = wave.up ? Math.hypot(p.x - wave.up[0] * TILE, p.y - wave.up[1] * TILE) < FRONT * TILE
          : wave.guards.some((g) => g.alive && Math.hypot(p.x - g.x, p.y - g.y) < FRONT * TILE
            && Math.cos(g.angle) * (p.x - g.x) + Math.sin(g.angle) * (p.y - g.y) > 0);
        if (seen) this.wake(wave, p);
      }
      // the last stretch, nobody left standing: the flat goes up behind him
      const B = this.blast;
      if (B && B.t === null && this.stage === this.stages.length - 1 && inside(B.zone, p.x, p.y) && !this.standing(s).length) this.blow();
    }
    // a guard who went out of the window is out of it for good (and never in the way of the way out)
    if (this.def.fall) {
      for (const e of w.enemies) if (e.alive && inside(this.def.fall, e.x, e.y)) { e.gone = true; w.leave?.(e); }
    }
    if (this.def.fall && inside(this.def.fall, p.x, p.y)) {
      this.over = true;
      p.invulnerable = true;
      w.events.emit('tutorialEnd', {});
    }
  }

  // what to show this frame: [{ x, y (world px, already lifted over its object), key, text }]
  hints() {
    const s = this.stages[this.stage], p = this.world.player, out = [];
    if (!s || !p?.alive || this.over || this.scene || p.execution || p.takedown) return out;
    for (const name of s.hints || []) {
      const h = HINTS[name]?.(this, s, p);
      // one thing said about a man (or a thing) at a time
      if (h && !out.some((o) => o.x === h.x && o.y === h.y + UP)) out.push({ ...h, y: h.y + UP });
      if (out.length >= SHOWN) break;
    }
    return out;
  }
}
