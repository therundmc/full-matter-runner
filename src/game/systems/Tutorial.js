// A level that teaches (level `tutorial`: tools/build_tutorial.py). Its rooms, the stages, are played one after the
// other; each asks for one move and says so next to what it is done to, never in a wall of text. DOM-free: the state
// and the rules; render/WorldRenderer.js draws what hints() returns.
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
//                     standing there (data/posts.js, Routine.cue), dormant or not: the man with the match strikes it
//              spark: s (systems/Fires.js) its fires wait for a match dropped in it, or catch on their own after that
//              hints: [names of HINTS, the first that applies wins a place: two at most are shown]
//              take: TYPE, marks: { name: [col, row] }   what some hints point at
//              leaves: N   the gun a dead man of the stage drops has N rounds left in it, no more (a retry further
//                     on finds that gun, `take`, by where it starts: `owed`) }]
//           A guard may stand in the waves of two stages running (pointed at from one, fought in the next).
//   fall    [c0, r0, c1, r1]: beyond the window. Once he is there the lesson is over ('tutorialEnd').
import { TILE } from '../Config.js';

const SHOWN = 2;       // hints on screen at once
const MOVED = 70;      // px walked before MOVE goes away
const FRONT = 1.7;     // tiles: a dormant guard he walks up to, in front of him, wakes (unless his wave is blind)
const UP = -24;        // px a hint floats over what it points at
const SLACK = 1.7;     // how much slower than a real guard its men react and shoot (Enemy.slack): it is a lesson
const STAND = 2.5;     // s a sharp wave's man holds his ground once woken (Enemy.standT)
const STEPS = [6, 0.2, 0.25]; // men coming up the stairs: steps heard, s between two, s from the last to the first man
const NEXT = 0.45;            // s between two of them coming up
const SIDE = 11;              // px either side of the stairs' middle they come up at

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
  takedown: (T, s, p) => {
    const g = T.guards(s).find((e) => e.alive && e.knocked <= 0 && e.aware === 0);
    if (!g) return null;
    // what the takedown will be: his neck, or his head driven into what stands in front of him (WALL SMASH...)
    const text = p.backMove?.spot ? p.contextAction : 'BREAK HIS NECK';
    return p.nearBack === g ? { x: g.x, y: g.y, key: 'attack', text } : { x: g.x, y: g.y, key: '', text: 'GET BEHIND HIM' };
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
    const at = (list) => world.enemies.filter((e) => list.some((t) => tileOf(e, t)));
    this.stages = def.stages.map((s) => ({
      ...s, kills: 0,
      waves: (s.waves || []).map((w) => ({ on: w.on || 'enter', blind: !!w.blind, sharp: !!w.sharp, slack: w.slack ?? SLACK, up: w.up ?? null, awake: false, guards: at(w.at) })),
      cues: (s.cues || []).map((c) => ({ act: c.act, delay: c.delay ?? 0, guards: at([c.at]) })),
    }));
    for (const s of this.stages) for (const w of s.waves) for (const g of w.guards) Object.assign(g, { dormant: true, slack: w.slack, rate: SLACK });
    // the men still on their way up the stairs are not in the building yet
    for (const s of this.stages) for (const w of s.waves) if (w.up) for (const g of w.guards) world.holdBack(g);
    world.events.on('kill', ({ victim }) => {
      const s = this.stages[this.stage];
      if (!s || !this.guards(s).includes(victim)) return;
      s.kills++;
      if (s.leaves !== undefined) this.left = { x: victim.x, y: victim.y, n: s.leaves, steps: 30 };
    });
    world.events.on('pickup', ({ ch, type }) => { if (ch.isPlayer) this.picked = type; });
    if (from > 0 && from < this.stages.length) this.restore(from);
  }

  guards(s) { return s.waves.flatMap((w) => w.guards); }
  // the guards of a stage still on their feet (those still to come up the stairs too) ...
  standing(s) { return this.guards(s).filter((e) => e.alive && e.knocked <= 0); }
  // ... and those of them that are there to be pointed at
  present(s) { return this.standing(s).filter((e) => !e.offstage); }

  // the stage whose room (x, y) px is in, or -1
  stageAt(x, y) { return this.stages.findIndex((s) => inside(s.zone, x, y)); }

  // a retry: he is put back where stage i starts, the rooms before it are empty
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
    if (this.last) this.moved += Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.last = { x: p.x, y: p.y };
    for (let i = this.stage + 1; i < this.stages.length; i++) {
      if (!inside(this.stages[i].zone, p.x, p.y)) continue;
      this.stage = i;
      if (w.game) w.game.tutorialAt = { name: w.level.name, stage: i };
      // walking in: what the men there were waiting for (the match struck)
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
    if (!s || !p?.alive || this.over || p.execution || p.takedown) return out;
    for (const name of s.hints || []) {
      const h = HINTS[name]?.(this, s, p);
      if (h) out.push({ ...h, y: h.y + UP });
      if (out.length >= SHOWN) break;
    }
    return out;
  }
}
