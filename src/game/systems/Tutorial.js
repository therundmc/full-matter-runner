// A level that teaches (level `tutorial`: tools/build_tutorial.py), and how it is staged (data/staging.js). Its
// rooms, the stages, are played one after the other; each asks for one move and says so next to what it is done
// to: a hint is a key and what it does (HINTS), never advice (where to go is said by the rooms, the fire, the
// camera and the way out marked on the floor). The first time a hint's action is DUE (its trigger: DUE, read from
// the situation) a lesson: a slow motion that starts at that moment and lasts until he does it, never a stop, the
// hand always his (pace). It opens on a scene he can only watch (the man with the match: open / play), names the
// camera's shot as it goes (shot) and ends on the flat blowing up behind him (blow). DOM-free: the state and the
// rules; render/WorldRenderer.js draws what hints() returns, Game puts the time scale and the camera's push on.
//
// Level data (tiles):
//   stages  [{ zone: [c0, r0, c1, r1]   the room: walking into it makes it the current stage
//              spawn: [col, row, deg]    where a retry puts him back once the stage was reached
//              waves: [{ at: [[col, row]...], on, blind, slack }]   its guards, by the tile they stand on. They are dormant
//                     (Enemy.dormant: they see and hear nothing, stand where they are) until their wave is called:
//                     on = 'enter' (he walks in) | 'kills:N' (N guards of the stage are dead) | 'pickup:TYPE' (he
//                     takes that weapon) | 'shield' (he takes a guard of the stage as a shield, or one of them dies
//                     some other way) | 'never' (a man who is only there to be dealt with). blind: they do not
//                     wake either when he walks up in front of them. slack: how much slower than a real guard
//                     they react (SLACK if not given; they always fire SLACK times slower). sharp: they were waiting for him, they know him at
//                     once when woken (no suspicion to build up first). up: [col, row] they are not there yet but
//                     on their way up the stairs (World.holdBack): called, they are heard coming (STEPS), one of them
//                     shouts, and they come up there one after the other (World.bringOn); he walking up to that
//                     spot calls them too.
//                     only: 'shield': its man is there to be taken as a shield and nothing else (Enemy.shieldOnly: no
//                     takedown on him, nothing hurts or floors him until he is held: a blow, a thing thrown, he reels
//                     and stands, Enemy.knock); the hint E SHIELD shows on him from afar
//              cues: [{ at: [col, row], act, delay }]   walking into the stage cues act `act` of the job of the guard
//                     standing there (data/posts.js, Routine.cue), dormant or not
//              hold: s, keep: [[c0, r0, c1, r1]...]   the fire is kept out of the room (and of those rectangles)
//                     until `hold` s after he walked in (systems/FireSpread.js); keep + keepFor: s without hold:
//                     only those rectangles, until keepFor s after he walked in
//              cam: the camera's shot while he is there (data/staging.js SHOTS)
//              waves may also say frame: true (called, its men are framed with the player by the camera until they
//                     are on him: shot `threat`)
//              snatch: true   the weapon in his hand breaks on a man of this stage, whose gun he then snatches
//                     (FORCE in data/staging.js): killed by his hand in any way, the man's gun always ends up in it
//                     (Character.yields); spare: N magazines that come with the stage's gun (`take`), once
//                     (spareOn: 'shield': handed as he takes the stage's man as a shield, not as he takes the gun)
//              hints: [names of HINTS, the first that applies wins a place: two at most are shown, one a target]
//              take: TYPE, marks: { vault: [col, row], dive: [col, row] }   what some hints are about
//              leaves: N   the gun a dead man of the stage drops has N rounds left in it, no more (a retry further
//                     on finds that gun, `take`, by where it starts: `owed`) }]
//           A guard may stand in the waves of two stages running (pointed at from one, fought in the next).
//   opening { man: [col, row] (the tile of the man with the match), match: [col, row] (where it falls: a retry's
//           fire starts there), door: [col, row] (the door he leaves by and slams), out: [col, row] (where he runs to) }
//   blast   { at: [col, row] (the gas bottle: its valve lit as the last man of the last stage goes down, it goes BLAST.fuse s later, what other gas the flat holds with it), breach: [col, row] (where the ball of fire comes out),
//           chain: [[col, row, radius px]...] (the balls of fire that follow, down the corridor to the window) }
//   exit    { zone: [c0, r0, c1, r1] (the floor before the window), window: [c0, r0, c1, r1] (its tiles) }: marked
//           once nobody is left standing (exit(), drawn by render/WorldRenderer.js)
//   fall    [c0, r0, c1, r1]: beyond the window. Once he is there the lesson is over ('tutorialEnd'); he lands
//           from its windows in a roll.
import { TILE, PALETTE, PLAYER } from '../Config.js';
import { LESSONS, BEAT, RELOAD, OPENING, BLAST, LEAP, FRAME, FORCE, STAIRS, FRONT, SLACK, STAND } from '../data/staging.js';
import { ignite } from './Gas.js';

const SHOWN = 2;       // hints on screen at once
const MOVED = 70;      // px walked before MOVE goes away
const UP = -24;        // px a hint floats over what it points at ...
const MAN = -37;       // ... over a man: clear of what he says (the barks float 16 px over him)
const SIDE = 11;              // px either side of the stairs' middle they come up at

const smooth = (k) => { const u = Math.min(1, Math.max(0, k)); return u * u * (3 - 2 * u); };
// 0..1 with a little overshoot on the way: a pop
const pop = (k) => { const u = Math.min(1, Math.max(0, k)) - 1; return 1 + u * u * (2.7 * u + 1.7); };
const inside = ([c0, r0, c1, r1], x, y) => x >= c0 * TILE && x < (c1 + 1) * TILE && y >= r0 * TILE && y < (r1 + 1) * TILE;
const at = ([c, r]) => ({ x: c * TILE, y: r * TILE });
// is guard e the one the level put on tile [c, r] (his job may have taken him a step off it since: Enemy.spawn)
const tileOf = (e, [c, r]) => { const p = e.spawn ?? e; return Math.floor(p.x / TILE) === c && Math.floor(p.y / TILE) === r; };
const nearest = (list, p) => list.reduce((best, e) => (!best || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? e : best), null);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// a man who knows he is there (one who does not is taken from behind, not hit or shot)
const knows = (e) => e.aware > 0;

// What a hint says and over what: (tutorial, stage, player) -> { x, y, key, text, id, who } or null. Always a key
// and the action it does: key is the action whose cap is shown before the words, named for the device in use when
// drawn (data/controls.js ACTIONS: ZQSD or the left stick, SPACE or A...). id: its lesson (LESSONS in
// data/staging.js; the hint's own name if not given). who: the man it is about when it is not drawn over him.
export const HINTS = {
  move: (T, s, p) => (T.moved < MOVED ? { x: p.x, y: p.y, key: 'move', text: 'MOVE' } : null),
  // something across his way (stage mark `vault`), once he is on his feet and walking: on it, not over it (he comes
  // at it from there: the hint must not hide him)
  vault: (T, s, p) => (s.marks?.vault && T.moved >= MOVED && !p.vaulting ? { ...at(s.marks.vault), up: 0, key: 'action', text: 'VAULT' } : null),
  // behind a man who has not seen him, within reach (Player.nearTakedown): what the takedown will be, his neck, or
  // his head driven into what stands in front of him (WALL SMASH...)
  takedown: (T, s, p) => {
    const g = p.nearTakedown;
    if (!g || !T.guards(s).includes(g)) return null;
    const text = p.takeMove?.spot || p.takeMove?.front ? p.contextAction : 'BREAK HIS NECK';
    return { x: g.x, y: g.y, up: MAN, key: 'attack', text, id: 'neck' };
  },
  // the man who is there to be taken as a shield (a `never` wave's): behind him, within reach and a hand free for
  // it (Player.nearShield), E; held, how he is let go
  shield: (T, s, p) => {
    const h = p.shield?.target;
    if (h && T.guards(s).includes(h)) return { x: h.x, y: h.y, up: MAN, key: 'throw', text: 'THROW HIM', id: 'release' };
    const g = p.nearShield;
    const his = g && !p.shield && s.waves.some((w) => w.on === 'never' && w.guards.includes(g));
    if (his) return { x: g.x, y: g.y, up: MAN, key: 'use', text: 'SHIELD' };
    // the man who is there for nothing else: said on him from as far as he is seen (the lesson waits for the reach)
    const only = !p.shield && T.present(s).find((e) => e.shieldOnly);
    return only ? { x: only.x, y: only.y, up: MAN, key: 'use', text: 'SHIELD' } : null;
  },
  punch: (T, s, p) => {
    const g = !p.armed && nearest(T.present(s).filter(knows), p);
    return g ? { x: g.x, y: g.y, up: MAN, key: 'attack', text: 'PUNCH HIM' } : null;
  },
  finish: (T, s, p) => {
    const g = nearest(T.guards(s).filter((e) => e.alive && e.knocked > 0), p);
    return g ? { x: g.x, y: g.y, up: MAN, key: 'attack', text: 'FINISH HIM' } : null;
  },
  take: (T, s, p) => {
    const it = p.weapon?.type !== s.take && T.world.items.find((i) => !i.dead && i.type === s.take && inside(s.zone, i.x, i.y));
    return it ? { x: it.x, y: it.y, key: 'use', text: 'TAKE IT' } : null;
  },
  strike: (T, s, p) => {
    const g = p.armed && p.def.kind !== 'gun' && nearest(T.present(s).filter(knows), p);
    return g ? { x: g.x, y: g.y, up: MAN, key: 'attack', text: 'STRIKE HIM' } : null;
  },
  shoot: (T, s, p) => {
    const g = p.armed && p.def.kind === 'gun' && p.weapon.mag > 0 && nearest(T.present(s).filter(knows), p);
    return g ? { x: g.x, y: g.y, up: MAN, key: 'attack', text: 'SHOOT' } : null;
  },
  // the gun is dry: a magazine left, R; none, it is thrown
  reload: (T, s, p) => (p.armed && p.def.kind === 'gun' && p.weapon.mag <= 0 && p.reserveCount?.() > 0 && !(p.reloading > 0)
    ? { x: p.x, y: p.y, key: 'reload', text: 'RELOAD' } : null),
  throw: (T, s, p) => {
    const g = p.armed && p.def.kind === 'gun' && p.weapon.mag <= 0 && !(p.reserveCount?.() > 0) && !(p.reloading > 0) && nearest(T.present(s).filter((e) => !e.shieldOnly), p);
    return g ? { x: p.x, y: p.y, key: 'throw', text: 'THROW IT', who: g } : null;
  },
  // the man who was waiting for him, his gun out (a `sharp` wave's, called): SPACE on the run goes under his fire;
  // not once he is on him
  slide: (T, s, p) => {
    const g = nearest(s.waves.filter((w) => w.sharp && w.awake).flatMap((w) => w.guards).filter((e) => e.alive && e.knocked <= 0 && !e.gone), p);
    return g && !p.slide && dist(g, p) > LESSONS.slide.near ? { x: p.x, y: p.y, key: 'action', text: 'SLIDE', who: g } : null;
  },
  // nobody left, at the window, once SPACE would take him through (the player's own prompt says so: never earlier, a
  // SPACE on the run is a slide): the jump. The way there is marked on the floor (exit)
  dive: (T, s, p) => {
    if (!s.marks?.dive || T.standing(s).length) return null;
    const m = at(s.marks.dive);
    return /DIVE|VAULT/.test(p.contextAction || '') && dist(p, m) < TILE * 2 ? { ...m, key: 'action', text: 'DIVE' } : null;
  },
};

// When a lesson's action is DUE, by its id: (tutorial, stage, player, its hint, its LESSONS entry) -> is it now? The
// slow motion starts the first time this holds, and ends when it no longer does.
const within = (T, s, p, h, D) => dist(p, { x: h.ax, y: h.ay }) <= D.reach;
const inLine = (T, p, g, range) => dist(p, g) <= range && (T.world.lineOfSight?.(p.x, p.y, g.x, g.y) ?? true);
const now = () => true; // its hint only shows when it is
const DUE = {
  // closing on the table, his body within reach of its edge
  vault: (T, s, p, h, D) => {
    const b = T.box(s), qx = Math.min(b.max.x, Math.max(b.min.x, p.x)), qy = Math.min(b.max.y, Math.max(b.min.y, p.y));
    const d = Math.hypot(qx - p.x, qy - p.y) || 1, v = Matter.Body.getVelocity(p.body);
    return d - (p.radius ?? PLAYER.radius) <= D.reach && (v.x * (qx - p.x) + v.y * (qy - p.y)) / d >= D.closing;
  },
  neck: now,
  shield: (T, s, p) => !!p.nearShield, // behind him, in reach, a hand free (its hint shows from afar)
  take: within,
  punch: within,
  strike: within,
  finish: within,
  shoot: (T, s, p, h, D) => inLine(T, p, { x: h.ax, y: h.ay }, D.range),
  throw: (T, s, p, h, D) => inLine(T, p, h.who, D.range),
  reload: now,
  // he is in the gunman's sights and the shot is told: about to come, or coming
  slide: (T, s, p, h, D) => !h.who.dormant && (h.who.react ?? 0) <= D.lead && inLine(T, p, h.who, Infinity),
  dive: now,
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
    // the lesson playing (pace): { id, key, slow, cap, push, shot, at, free, k (0..1: how far in), age (real s),
    // off (s its trigger has been gone), out (easing back), held (its key down since before) }
    this.lesson = null;
    this.shutting = null;                               // a door to shut and lock once nobody stands in its leaf: { tile, slam }
    this.calm = -1;                                     // world time until which nobody fires at him (the reload)
    this.taught = world.game?.taught || new Set();      // what was said already, this run and its retries
    this.blast = def.blast ? { ...def.blast, t: null, front: null, queue: [] } : null;   // t: when it was set off; front: its last ball of fire
    this.spared = false;                                // the spare magazine was handed over
    this.shielded = false;                              // he took a guard as a shield (a wave's `shield`)
    this.leap = null;                                   // the jump out of the window, staged (LEAP): { age, overAt } real s
    const posted = (list) => world.enemies.filter((e) => list.some((t) => tileOf(e, t)));
    this.stages = def.stages.map((s) => ({
      ...s, kills: 0,
      waves: (s.waves || []).map((w) => ({ on: w.on || 'enter', blind: !!w.blind, sharp: !!w.sharp, frame: !!w.frame, slack: w.slack ?? SLACK, up: w.up ?? null, only: w.only ?? null, awake: false, guards: posted(w.at) })),
      cues: (s.cues || []).map((c) => ({ act: c.act, delay: c.delay ?? 0, guards: posted([c.at]) })),
    }));
    for (const s of this.stages) for (const w of s.waves) for (const g of w.guards) Object.assign(g, { dormant: true, slack: w.slack, rate: SLACK, yields: g.yields || !!s.snatch });
    // the man kept to be taken as a shield: no takedown on him (Player.nearTakedown), nothing hurts him until he is held
    for (const s of this.stages) for (const w of s.waves) if (w.only === 'shield') for (const g of w.guards) Object.assign(g, { shieldOnly: true, invulnerable: true });
    // the men still on their way up the stairs are not in the building yet
    for (const s of this.stages) for (const w of s.waves) if (w.up) for (const g of w.guards) world.holdBack(g);
    // out of the windows over the alley he lands in a roll (Character.tryVault: `land`)
    if (def.fall) {
      const [c0, r0, c1, r1] = def.fall;
      for (const g of world.windows || []) if (g.cx >= c0 - 1 && g.cx <= c1 + 1 && g.cy >= r0 && g.cy <= r1) g.def = { land: 'roll' };
    }
    // the gas is kept for the end: neither the fire nor a round sets it off before (systems/FireSpread.js, Prop.hit).
    // `bottle`: the one whose valve is lit (the nearest to the level's blast.at); the others go with it
    if (this.blast) {
      const p = at(this.blast.at);
      this.gas = (world.props || []).filter((q) => q.def?.gas).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      for (const q of this.gas) q.staged = true;
      this.bottle = this.gas[0] || null;
    }
    world.events.on('kill', ({ victim }) => {
      const s = this.stages[this.stage];
      if (!s || !this.guards(s).includes(victim)) return;
      s.kills++;
      if (s.leaves === undefined) return;
      this.left = { x: victim.x, y: victim.y, n: s.leaves, steps: 30 };
      // (the gun he had, wherever it went: the one snatched from him too)
      const it = victim.lastDrop;
      if (it && !it.dead) it.mag = Math.min(it.mag, s.leaves);
    });
    world.events.on('pickup', ({ ch, type }) => {
      if (!ch.isPlayer) return;
      this.picked = type;
      // the gun of the lesson comes with a magazine to spare (stage `spare`), once: he will have to reload
      const s = this.stages.find((q) => q.spare && !q.spareOn && q.take === type);
      if (s) this.spare(ch, s);
    });
    world.events.on('shield', ({ holder, target }) => {
      if (!holder.isPlayer) return;
      this.shielded = true;
      // the man kept for it is a man like any other from now on; the magazine off his belt (stage `spareOn`)
      if (target?.shieldOnly) Object.assign(target, { shieldOnly: false, invulnerable: false });
      const s = this.stages.find((q) => q.spare && q.spareOn === 'shield' && this.guards(q).includes(target));
      if (s) this.spare(holder, s);
    });
    world.events.on('matchDrop', () => this.caught());
    if (from > 0 && from < this.stages.length) this.restore(from);
    else if (def.opening) this.open(!!world.game?.tutorialAt);
  }

  // the stage's magazines to spare, handed once, to a gun in his hand
  spare(ch, s) {
    if (this.spared || ch.def?.kind !== 'gun') return;
    this.spared = true;
    ch.addAmmo?.(ch.def.ammo, ch.def.mag * s.spare);
  }

  guards(s) { return s.waves.flatMap((w) => w.guards); }
  // the guards of a stage still on their feet (those still to come up the stairs too) ...
  standing(s) { return this.guards(s).filter((e) => e.alive && e.knocked <= 0 && !e.gone); }
  // ... and those of them that are there to be pointed at: a man who is only there to be dealt with, or one whose
  // wave was called (never one still waiting his turn behind a door, or down the stairs)
  present(s) { return s.waves.filter((w) => w.on === 'never' || w.awake).flatMap((w) => w.guards).filter((e) => e.alive && e.knocked <= 0 && !e.gone && !e.offstage); }

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
    if (sc.step === 2 && !sc.from && !sc.named && t >= O.card[0]) {
      // his name, slammed down at his feet
      sc.named = true;
      w.texts?.push({ who: { x: g.x, y: g.y }, x: g.x, y: g.y, str: O.name, t: O.card[1], dur: O.card[1], color: PALETTE.pink, card: true });
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
    // never on somebody standing where the leaf shuts: it waits for him to be out of it (update)
    const c = Math.cos(d.a0), s = Math.sin(d.a0), len = d.len ?? TILE;
    const inLeaf = (ch) => {
      const t = Math.max(0, Math.min(len, (ch.x - d.hx) * c + (ch.y - d.hy) * s));
      return Math.hypot(ch.x - d.hx - c * t, ch.y - d.hy - s * t) < (ch.radius ?? 10) + 4;
    };
    if ((w.chars || []).some((ch) => ch.alive && inLeaf(ch))) { this.shutting = { tile, slam }; return; }
    this.shutting = null;
    // the leaf back on its frame, about its hinge (its middle stays where it is along it), then locked
    const b = d.body, h = Math.hypot(b.position.x - d.hx, b.position.y - d.hy);
    Matter.Body.setAngle(b, d.a0);
    Matter.Body.setPosition(b, { x: d.hx + c * h, y: d.hy + s * h });
    Matter.Body.setVelocity(b, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(b, 0);
    d.lock();
    if (!slam) return;
    w.sound('doorSlam', d.hx, d.hy, 1);
    w.shake?.(0.3);
  }

  // ---- the camera's shot now: { name (data/staging.js SHOTS), at: what it looks at or null }, or null: the usual
  // view. A throw's beat (systems/ThrowBeat.js) goes over the room's framing, as it does anywhere else
  shot() {
    const w = this.world, p = w.player, sc = this.scene, B = this.blast;
    // the jump: pushed in on him in the air, the window going up behind him, his roll, then back out (LEAP)
    const J = this.leap;
    if (J) {
      const a = J.overAt === null ? -1 : J.age - J.overAt;
      if (a < 0) return { name: 'leapAir', at: null };
      if (a < LEAP.blast.hold) return { name: 'leapBlast', at: this.window() };
      return { name: a < LEAP.blast.hold + LEAP.roll.hold ? 'leapRoll' : 'leapOut', at: null };
    }
    if (this.over) return { name: 'dive', at: null };
    if (sc) {
      if (sc.matchAt !== null) return { name: 'catch', at: w.fireSpread?.nearest(p.x, p.y) || at(this.def.opening.match) };
      return sc.step >= 1 ? { name: 'laugh', at: sc.man } : { name: 'wake', at: null };
    }
    // the end's slow motion: the camera on the stove going (a lesson otherwise leaves it on him: push)
    const L = this.lesson;
    if (L?.shot) return { name: L.shot, at: L.at };
    // the end: back at the stove as it goes, then on the fire coming down the corridor
    if (B?.t != null) return { name: 'run', at: B.front || (w.time - B.t < BLAST.look ? at(B.breach) : null) };
    const thrown = w.throwBeat?.shot();
    if (thrown) return thrown;
    const s = this.stages[Math.max(0, this.stage)], g = s && this.framed(s, p);
    if (g) return { name: 'threat', at: g };
    return s?.cam ? { name: s.cam, at: null } : null;
  }

  // the man called into the fight whom the camera frames with the player (wave `frame`): the nearest still standing
  // and not yet on him (FRAME.near)
  framed(s, p) {
    const far = s.waves.filter((w) => w.frame && (w.awake || (w.only && !this.shielded))).flatMap((w) => w.guards)
      .filter((e) => e.alive && e.knocked <= 0 && !e.gone && !e.offstage && Math.hypot(e.x - p.x, e.y - p.y) > FRAME.near);
    return nearest(far, p);
  }

  // ---- the way out to mark on the floor (level `exit`: { zone, window } tile rectangles), once nobody is left
  // standing in the last stage: { zone, window } in px [x0, y0, x1, y1], or null
  exit() {
    const E = this.def.exit, s = this.stages[this.stage];
    if (!E || this.over || this.stage !== this.stages.length - 1 || this.standing(s).length) return null;
    const px = ([c0, r0, c1, r1]) => [c0 * TILE, r0 * TILE, (c1 + 1) * TILE, (r1 + 1) * TILE];
    return { zone: px(E.zone), window: px(E.window) };
  }

  // ---- the lessons (LESSONS, BEAT in data/staging.js): the first time a hint's action is due, a slow motion until
  // he does it. dt: real s; did(action): is that action's key down (data/controls.js ACTIONS)? Returns the time
  // scale wanted, never 0: 1, or eased down to the lesson's `slow` and back (its own ramp: Game puts it on as it is).
  pace(dt, did) {
    if (this.leap) return this.leaping(dt);
    const shown = this.hints(), p = this.world.player, s = this.stages[this.stage];
    const due = (h) => !!DUE[h.id]?.(this, s, p, h, { ...BEAT, ...LESSONS[h.id] });
    let L = this.lesson, scale = 1;
    if (!L) {
      const h = shown.find((q) => LESSONS[q.id] && !this.taught.has(q.id) && due(q));
      if (h) L = this.begin(h.id, h.key);
    }
    if (L) {
      L.age += dt;
      if (!L.out) {
        L.k = Math.min(1, L.k + dt / BEAT.in);
        // he does it (a fresh press: a key held since before must be let go first), it is no longer due (he backed
        // off, the man fell), or it has lasted long enough
        const h = shown.find((q) => q.id === L.id), press = !!L.key && did(L.key);
        L.off = L.free || (h && due(h)) ? 0 : L.off + dt;
        if ((press && !L.held) || L.off > BEAT.grace || L.age >= L.cap) L.out = true;
        if (!press) L.held = false;
      } else if ((L.k -= dt / BEAT.out) <= 0) L = this.lesson = null;
      if (L) { const e = smooth(L.k); scale = L.slow * e + (1 - e); }
    }
    // his hands on the magazine: the world all but stops (the reload goes at its own pace: update)
    if (p.reloading > 0 && p.def?.kind === 'gun') scale = Math.min(scale, RELOAD.slow);
    return scale;
  }

  // the jump out of the window (LEAP): time all but stops while he is in the air and the window goes up behind him,
  // comes back through his roll, then is his again. dt: real s. The time scale
  leaping(dt) {
    const J = this.leap;
    J.age += dt;
    this.lesson = null;
    if (this.over && J.overAt === null) J.overAt = J.age;
    if (J.overAt === null) return J.age > LEAP.air.cap ? 1 : LEAP.air.slow; // (a jump that never lands him outside)
    const a = J.age - J.overAt;
    return a < LEAP.blast.hold ? LEAP.blast.slow : a < LEAP.blast.hold + LEAP.roll.hold ? LEAP.roll.slow : 1;
  }

  // the middle of the way out's window (px)
  window() {
    const [c0, r0, c1, r1] = this.def.exit?.window || this.def.fall;
    return { x: ((c0 + c1 + 1) / 2) * TILE, y: ((r0 + r1 + 1) / 2) * TILE };
  }

  // the window goes up behind him: a ball of fire in its frame, what was left of its panes blown out, glass and
  // fire thrown after him into the night
  windowBlast() {
    const w = this.world, o = this.window(), P = w.particles, [c0, r0, c1, r1] = this.def.fall;
    const out = Math.atan2((r0 + r1 + 1) / 2 * TILE - o.y, (c0 + c1 + 1) / 2 * TILE - o.x); // toward where he lands
    for (const g of w.windows || []) if (g.intact && Math.hypot(g.x - o.x, g.y - o.y) < TILE * 2) g.shatter(out, null, 1.4);
    const k = LEAP.blast.inside;
    w.explode(o.x - Math.cos(out) * k, o.y - Math.sin(out) * k, { radius: LEAP.blast.radius, source: 'gas' });
    w.shake(LEAP.blast.shake);
    const [glass, embers, flames] = LEAP.blast.rain;
    P?.glass(o.x, o.y, out, 1.1, glass, 260);
    P?.embers(o.x, o.y, embers, 300);
    for (let i = 0; i < flames; i++) {
      const a = out + (Math.random() - 0.5) * 1.6, d = 8 + Math.random() * 40;
      P?.fire(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 2, 120, { size: [3, 8], life: [0.25, 0.7], heat: 0.3, rise: 14 });
    }
  }

  // lesson `id` starts (key: the action that ends it; at: what its camera looks at, for one that has a shot and no
  // hint: it lasts its `cap`)
  begin(id, key, at = null) {
    const D = { ...BEAT, ...LESSONS[id] };
    this.taught.add(id);
    return (this.lesson = { id, key, slow: D.slow, cap: D.cap, push: D.push, shot: D.shot ?? null, at, free: !!at, k: 0, age: 0, off: 0, out: false, held: true });
  }

  // how far the camera is pushed in on him by the lesson on now: a share of its zoom, 0 at rest
  push() { const L = this.lesson; return L ? L.push * smooth(L.k) : 0; }

  // the edge of what a stage's vault is over (px, { min, max }): the piece of furniture standing on its mark
  box(s) {
    if (s.box) return s.box;
    const m = at(s.marks.vault), q = (this.world.props || []).find((o) => !o.dead && o.body?.bounds && dist(o, m) < TILE / 2);
    return (s.box = q ? q.body.bounds : { min: m, max: m });
  }

  // ---- the end: the flat goes up behind him, and the fire comes down the corridor after him (BLAST in
  // data/staging.js; the level's `blast`)
  blow() {
    const w = this.world, p = w.player, B = this.blast, C = BLAST.chain, q = at(B.at), b = at(B.breach);
    B.t = w.time;
    B.was = p.invulnerable;
    p.invulnerable = true; // a stage blast: only its balls of fire kill him (fireball)
    // the fuse: the bottle's valve lit, a jet of flame out of it hissing higher and higher (systems/Gas.js), then it
    // goes (Prop.break), and what other gas the flat holds with it
    const s = this.bottle, live = s && !s.dead && !s.dying;
    if (live && !s.gasLeak) ignite(s, (s.W ?? 0) / 2, (s.H ?? 0) / 2, BLAST.jet - Math.PI + s.body.angle, BLAST.fuse);
    w.after(BLAST.fuse, () => {
      w.shake(BLAST.shake);
      if (!live) w.explode(q.x, q.y, { radius: 110, source: 'propane' });
      (this.gas || []).forEach((g, k) => { if (k && !g.dead && !g.dying) w.after(BLAST.breach[0] * k, () => g.break(-Math.PI / 2, 2)); });
    });
    let t = w.time + BLAST.fuse + BLAST.breach[0];
    B.queue.push({ t, x: b.x, y: b.y, radius: BLAST.breach[1], lethal: false });
    // then one after the other down the corridor, quicker and quicker
    const chain = B.chain || [];
    chain.forEach(([c, r, radius], k) => {
      t += k ? C.gap[0] + ((C.gap[1] - C.gap[0]) * k) / Math.max(1, chain.length - 1) : C.first;
      B.queue.push({ t, x: c * TILE, y: r * TILE, radius, lethal: true });
    });
    B.end = t + C.tail;
    // seen in slow motion, the camera on it (lesson `run`), the first time
    if (!this.taught.has('run')) this.begin('run', '', b);
  }

  // the balls of fire due go off; as he goes through the window, what is left of them at once, right behind him
  chain() {
    const w = this.world, B = this.blast, Q = B.queue;
    if (this.over && !B.rushed) {
      B.rushed = true;
      Q.forEach((q, k) => { q.t = Math.min(q.t, w.time + k * BLAST.chain.rush); });
    }
    while (Q.length && Q[0].t <= w.time) { const q = Q.shift(); this.fireball(q.x, q.y, q.radius, q.lethal); }
    if (!Q.length && B.end !== null && w.time >= B.end) {
      B.end = null;
      if (!this.over) w.player.invulnerable = B.was; // he is on his own again
    }
  }

  // one ball of fire of the end; lethal: whoever it goes off on dies of it, shield or not
  fireball(x, y, radius, lethal) {
    const w = this.world, p = w.player, B = this.blast, C = BLAST.chain;
    B.front = { x, y };
    w.explode(x, y, { radius, source: 'gas' });
    if (!lethal) return;
    w.shake(C.shake);
    if (this.over || B.was || !p.alive || Math.hypot(p.x - x, p.y - y) > radius * C.kill) return;
    p.invulnerable = false;
    p.kill(Math.atan2(p.y - y, p.x - x), 'explosion', null);
  }

  // a wave whose time has come: its guards see and hear again, and know something is up
  call(s, p) {
    for (const w of s.waves) {
      if (w.awake || w.on === 'never') continue;
      const [what, arg] = w.on.split(':');
      const due = what === 'enter' || (what === 'kills' && s.kills >= Number(arg)) || (what === 'pickup' && (this.picked === arg || p.weapon?.type === arg))
        || (what === 'shield' && (this.shielded || s.kills >= 1));
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
    const now = this.world.time, [c, r] = w.up, x = c * TILE, y = r * TILE, [n, gap, lead] = STAIRS.steps;
    for (let i = 0; i < n; i++) this.coming.push({ t: now + i * gap, step: { x, y, vol: 0.45 + (0.5 * i) / n } });
    const t0 = now + (n - 1) * gap + lead;
    w.guards.filter((g) => g.alive).forEach((g, i) => {
      const side = i % 2 ? SIDE : i ? -SIDE : 0;
      this.coming.push({ t: t0 + i * STAIRS.next, g, x: x + side, y, first: i === 0 });
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
    if (p && this.blast?.t != null) this.chain();
    if (!p || !p.alive || this.over) return;
    // the jump: he is going through a window onto the alley
    const v = p.vaulting;
    if (!this.leap && this.def.fall && v?.kind === 'window' && v.to && inside(this.def.fall, v.to.x, v.to.y)) this.leap = { age: 0, overAt: null };
    if (this.shutting) this.shut(this.shutting.tile, this.shutting.slam);
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
    // the weapon in his hand holds until the man it is to break on (FORCE): then his gun is snatched
    if (p.weapon && p.def?.wear) {
      const prey = s?.snatch && this.guards(s).some((g) => g.alive && !g.gone && Math.hypot(g.x - p.x, g.y - p.y) < FORCE.near); // (on his feet or down)
      p.weapon.wear = prey ? FORCE.last : Math.max(p.weapon.wear, FORCE.keep);
    }
    // the reload: it goes at its real pace while the world crawls (pace), and nobody fires or strikes from the
    // moment his gun is dry, a magazine left, until a beat after it is loaded (RELOAD)
    const gun = p.weapon && p.def?.kind === 'gun';
    p.haste = gun && p.reloading > 0 ? 1 / Math.max(0.02, w.game?.timeScale ?? 1) : 1;
    if (gun && (p.reloading > 0 || (p.weapon.mag <= 0 && p.reserveCount?.() > 0))) this.calm = w.time + RELOAD.grace;
    if (w.time < this.calm) for (const g of w.enemies) g.react = Math.max(g.react || 0, 0.15);
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
      // the last man of the last stage is down: the flat goes up behind him, at once
      const B = this.blast;
      if (B && B.t === null && this.stage === this.stages.length - 1 && !this.standing(s).length) this.blow();
    }
    // a guard who went out of the window is out of it for good (and never in the way of the way out)
    if (this.def.fall) {
      for (const e of w.enemies) if (e.alive && inside(this.def.fall, e.x, e.y)) { e.gone = true; w.leave?.(e); }
    }
    if (this.def.fall && inside(this.def.fall, p.x, p.y)) {
      this.over = true;
      p.invulnerable = true;
      this.leap ||= { age: 0, overAt: null };
      w.after(LEAP.blast.at, () => this.windowBlast());
      w.events.emit('tutorialEnd', {});
    }
  }

  // what to show this frame: [{ x, y (world px, already lifted over its object), ax, ay (what it points at), key, text,
  // id, who, focus (the hint the lesson on now is about: 0..1 and a little over, how big it is drawn) }]
  hints() {
    const s = this.stages[this.stage], p = this.world.player, out = [];
    if (!s || !p?.alive || this.over || this.leap || this.scene || p.execution || p.takedown) return out;
    for (const name of s.hints || []) {
      const h = HINTS[name]?.(this, s, p);
      // one thing said about a man (or a thing) at a time
      if (h && !out.some((o) => o.ax === h.x && o.ay === h.y)) out.push({ ...h, y: h.y + (h.up ?? UP), ax: h.x, ay: h.y, id: h.id ?? name });
      if (out.length >= SHOWN) break;
    }
    const L = this.lesson;
    if (L) for (const h of out) if (h.id === L.id) h.focus = L.out ? smooth(L.k) : pop(L.k);
    return out;
  }
}
