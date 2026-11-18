// A guard. Organic, readable behaviour: a detection meter fills while he sees the player ('?' then '!'),
// he turns toward noises before walking over, reacts with a human delay, aims badly at first and better with
// time, reloads, picks weapons back up, talks to his mates and curses the player (barks, lines in data/barks.js:
// his mates by name, where the player is), follows the player's wet or bloody footprints, may run to fetch the
// others when he is alone or outgunned, may give up when he is the last one left or on his own with nothing left to
// fight with (and go for a gun once the player turns his back: ai/Squad.js), has a word with a stranger caught at
// something odd before it comes to a fight (ai/Conduct.js), finds his way round what blocks it and gives way to the
// people around him (ai/Nav.js), and follows the squad Director
// (ai/Director.js) for alert phases, searches and tactical spots. Geometry lives in ai/Tactics.js,
// perception maths in ai/Perception.js, tuning in Config (ENEMY, AI).
import { ENEMY, AI, TILE, CAT, MASK, PALETTE, BODY_SCALE } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { BARKS, SHOUTED, MUTTERED, BOSS } from '../data/barks.js';
import { rand, angDiff, approachAngle, chance, clamp, spread } from '../../engine/math.js';
import { findPath } from '../../engine/nav/Pathfinding.js';
import { findCover, findFlank, searchPoints, isCovered, randomPoint, throughDoor, pastDoor, tableToFlip } from '../ai/Tactics.js';
import { detectionRate, inView, aimError, hearingError } from '../ai/Perception.js';
import { talks, pours, reliefSpot, gazeAt, STRETCH, Routine, GESTURES, gestureClock, seatPlace, frontOf, wallBehind,
  sideOf, poolSpots, besideCar, hoodSpot, leanBroken, STRIKE, drawn, TOSS, MATCH_FALLS, TOSSED } from '../ai/Pastimes.js';
import { carry, inHand } from '../ai/Carry.js';
import { CellMemory, cellAhead, giveWay } from '../ai/Nav.js';
import { Case, STAGE, judge, complies } from '../ai/Conduct.js';
import { ALARMS } from '../ai/Director.js';
import { backupOdds, backupGroup, recruits, yieldOdds, turnedAway, gunAtHand } from '../ai/Squad.js';
import { pastimeHands, drawPastime } from '../render/PastimeArt.js';
import Character, { heavyBuild } from './Character.js';
import { standPose, postPose, drawPose, bodyFrame, kneelPose } from './CharacterAnim.js';
import { drawPost, drawMouth, drawItem } from './PostArt.js';
import { TELL, GESTURE, TAIL } from '../data/feel.js';
import { POSTS, HELD, HOOD } from '../data/posts.js';
import { FLOATS } from '../data/destruction.js';
import { HURT } from '../data/wounds.js';
import { SLIP } from '../data/devices.js';
import { sprite, spriteOpt, sw } from '../../engine/Assets.js';

const { Body, Bounds } = Matter;

// at ease (see pickActivity): what takes his mind off his watch, what takes his hands, what is done in one go,
// what a round is broken by, and the states in which a weapon stays put away
const ABSORBING = new Set(['smoke', 'phone', 'chat', 'piss']);
// jobs that leave his eyes free: the doormen, the bartender, the two men smoking against a wall (lookouts more than
// smokers); the others have their eyes on what they do (the pool, cards, the money, the dope, a magazine, the bowl)
const WATCHFUL = new Set(['door', 'wipe', 'lean', 'alley']);
const STANDOFF = 26; // px off his seat where a seated man stands up
const DUCK = 1.8; // how far down a bartender ducks behind his counter (1 = kneeling)
const HANDS = new Set(['smoke', 'phone', 'piss', 'stretch', 'wrist', 'cross']);
const ONE_GO = new Set(['stretch', 'wrist']);
const PAUSES = ['smoke', 'phone', 'stretch', 'wrist'];
const JUNK = 10;  // things a man turning a place over leaves lying on its floor (the rest he throws are papers)
const S = {
  IDLE: 'idle', PATROL: 'patrol', RETURN: 'return', SUSPICIOUS: 'suspicious', INVESTIGATE: 'investigate', CHECK: 'check',
  SEARCH: 'search', GUARD: 'guard', DIZZY: 'dizzy', COMBAT: 'combat', HUNT: 'hunt', FETCH: 'fetch', FLEE: 'flee',
  YIELD: 'yield', TRACK: 'track', BACKUP: 'backup', CHALLENGE: 'challenge',
};
const CALM = new Set([S.IDLE, S.PATROL, S.RETURN]);
// awareness implied by each state: 0 unaware, 1 suspicious ('?'), 2 alert ('!')
const AWARE = {
  idle: 0, patrol: 0, return: 0, suspicious: 1, investigate: 1, check: 1, search: 1, guard: 1, dizzy: 1,
  combat: 2, hunt: 2, fetch: 2, flee: 2, yield: 2, track: 1, backup: 2, challenge: 1,
};
const TRACKERS = new Set([S.IDLE, S.PATROL, S.RETURN, S.SEARCH]); // states a guard leaves to follow footprints
const RANGES = ENEMY.ranges;
// what he says on coming upon each kind of incident (Director incidents; the rest: 'damage')
const FOUND = { missing: 'sight', window: 'window', door: 'door', power: 'fuse' };

export default class Enemy extends Character {
  constructor(world, x, y, angle, kind, weapon, roam = false) {
    super(world, x, y, angle, kind, 'enemy');
    this.isEnemy = true;
    this.radius = ENEMY.radius;
    this.setWeapon(weapon, undefined, WEAPONS[weapon].shellReload ? ENEMY.spareShells : ENEMY.spareMags);
    this.home = { x, y, angle };
    this.spawn = { x, y };     // where the level put him, before his job took him to his post (Tutorial: his tile)
    // optional explicit patrol route (level.patrols['col,row'] = [[col, row], ...] for the guard spawned there)
    const route = world.level.patrols?.[`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`];
    this.route = route ? route.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE })) : null;
    this.routeIdx = 0;
    this.roam = roam || !!this.route;
    this.passive = false;      // lab dummies: no perception at all (they still go on at their job, see waitTurn)
    this.hurt = 0;             // s his face still bleeds after he was floored (drip), dripT: s to the next drop
    this.dripT = 0;
    this.slack = 1;            // x his reaction time (the tutorial's men are slower) ...
    this.rate = 1;             // ... and x the time between his shots
    this.standT = 0;           // s he holds his ground and fires, whatever else he would do (Tutorial: a sharp wave)
    this.bolt = null;          // { x, y } a script sends him to at a run while he waits his turn (waitTurn)
    this.dormant = false;      // the tutorial's guards until their wave is called (systems/Tutorial.js): they
                               // stand there, see and hear nothing, and can still be seized from behind
    this.state = this.roam ? S.PATROL : S.IDLE;
    this.aware = 0;
    this.meter = 0;            // detection meter 0..1
    this.stim = null;          // what made us suspicious {x, y, kind}
    this.urgent = false;
    this.sees = false;
    this.visT = rand(0, ENEMY.visionTick); this.visAcc = 0;
    this.seenAt = -99;
    this.lastKnown = null;
    this.lostT = 0;
    this.settle = 0;           // aim steadiness 0..1
    this.path = null; this.pathIdx = 0; this.dest = null; this.repath = 0; this.stuck = 0;
    this.goal = null; this.target = null;
    this.sub = ''; this.t = 0;  // sub-step of the current state and time spent in it
    this.activity = 'watch'; this.activityT = rand(2, 5); this.idleFace = angle; this.turnTo = angle;
    this.job = null;       // his life at his post (level.jobs): a data/posts.js script
    this.ducked = false;   // a bartender has been down behind his counter once (see hear)
    this.duckT = 0;        // s he stays down
    this.actT = 0;         // s actually spent at the current activity
    this.atPost = true;    // standing where he means to be (his post, or `errand`)
    this.errand = null;    // where he went for a moment ({ x, y, face, wall }: to relieve himself)
    this.errandT = 0;
    this.restUntil = 0;    // his post given up on until then (no way through to it): he idles where he stands
    this.reliefCd = rand(...AI.relief.first);
    this.mate = null;      // the colleague he is chatting with; turn: which of the two he is (0 | 1)
    this.turn = 0; this.spoke = false; this.chatCd = rand(4, 25); this.chatScan = 0;
    this.dripT = 0;
    this.stow = 1; this.lower = 1; // weapon put away until something is up (ai/Carry.js)
    this.susT = 0; this.hideT = 0; this.shots = 0; this.ambushT = 0; this.ambushed = false; this.stalkCD = 0;
    this.glance = 0; this.glanceT = 0; this.lookBase = angle; this.lookT = 0;
    this.pauseT = rand(0.5, 2); this.doorT = 0; this.doorKey = -1;
    this.gate = -1; this.gateT = -9; this.gateFor = -1; this.gateWait = 0; // the doorway he holds / waits for
    this.probeT = 0; this.probeX = x; this.probeY = y;                     // ground covered lately (see follow)
    this.jams = new CellMemory();    // tiles he found jammed: his paths go round them a while (ai/Nav.js, see jammed)
    this.jamTo = null; this.jamTries = 0; this.blockCell = -1; this.blockN = 0;
    this.near = [];                  // the people around him he gives way to (see giveWay)
    this.rushHeld = 0;               // s a rush straight at him made no headway (see tRush)
    this.doorOut = null;             // the doorway he has just gone through { cx, cy, s } (see follow)
    this.case = null;                // a word he is having with the stranger (ai/Conduct.js, see challenge)
    this.eyes = null;                // something he glances at a moment, carrying on { x, y, until } (see glanceAt)
    this.react = 0; this.tactic = null; this.thinkT = 0; this.cover = null; this.coverT = 0;
    this.burst = 0; this.volleys = 0; this.burstLeft = 0; this.suppressCD = rand(0, 1.5);
    this.dodge = 0; this.dodgeCD = 0; this.strafe = 0; this.strafeT = rand(1, 2);
    this.shoutT = 0; this.panicT = 0; this.witnessed = []; this.dizzyT = 0;
    this.kneel = false; this.crouch = 0;
    this.searchPt = null; this.localPts = null; this.checkTarget = null; this.guardPt = null; this.guardT = 0;
    this.fetchTarget = null; this.friend = null;
    this.scanT = rand(0, 0.3);
    this.icon = ''; this.iconT = 0; this.barkT = 0;
    this.pace = rand(0.92, 1.08) * (kind === 'brute' ? 1.12 : heavyBuild(kind) ? 0.9 : 1);
    this.seed = rand(0, 100);
    this.sep = { x: 0, y: 0 };
    this.executing = false;
    this.held = null; // the player while he has us from behind (Player.startTakedown)
    this.tauntT = rand(1.5, 5);      // until the next curse thrown at the player
    this.trackAt = null;             // the footprint we are walking to (see doTrack)
    this.nearT = 0;                  // time spent a few steps from a spot without reaching it (see blockedAt)
    this.shaken = false;             // last man standing, about to give up (Director.onKill)
    this.yielded = false;            // on his knees, hands up: out of the fight for good (see surrender)
    this.begT = 0;
    this.nerveT = 0;                 // s to the next roll of his nerve (giving up / going for a gun, see loseNerve)
    this.turnT = 0;                  // s the player has had his back to him while he kneels (see updateYield)
    this.turncoat = false;           // he got up off his knees for a gun
    this.nick = null;                // what the others call him (Director.nickOf)
    this.boss = false;               // the boss of the place (his job): a word when he first sees the player
    this.fetched = false;            // he has had his chance to run for help (goForBackup) ...
    this.backupAt = null;            // ... and where he runs to
    this.lonely = false;             // one of the last two: he called out for the others once (mourn: when, for whom)
    this.mourn = null;
    this.rallyT = 0;                 // s until the man fetched for help answers (doBackup)
    // his job's life at his post (data/posts.js, see takeJob / work)
    this.script = null;    // the script of his job, played by
    this.routine = null;   // ... an ai/Pastimes.js Routine
    this.seat = null;      // the place his job sits him on { x, y, face, side, slot }
    this.workSpot = null;  // where the phase under way is done { x, y, face }
    this.onSpot = false;   // ... and he is there
    this.posture = 0;      // 0 on his feet .. 1 sat down / leant back on his wall (the job's `body`)
    this.postureOf = null; // ... which of them
    this.leanAt = null;    // the spot by a car's hood he leans on (posture 'hood'), its way kept while he gets off
    this.shunned = null;   // a car he got off (struck, burning, driven): never leant on again
    this.through = false;  // going through furniture: on his seat, onto it, off it
    this.holding = null;   // what is in his hands at it (data/posts.js HELD)
    this.mouth = false;    // a cigar left clamped in his teeth
    this.rest = null;      // where his weapon lies while he sits { x, y, a }
    this.ashtray = null;   // where the boss taps his ash { x, y }
    this.eyeOn = false; this.nodT = 0; this.fxT = 0;
  }

  get director() { return this.world.director; }

  setState(s) {
    if (this.case && s !== S.CHALLENGE) this.endCase(false);
    this.state = s;
    this.aware = AWARE[s];
    if (this.aware === 2) this.meter = 1;
    this.sub = ''; this.t = 0;
    this.path = null; this.dest = null; this.repath = 0; this.stuck = 0; this.jamTo = null;
    this.goal = null; this.target = null; this.searchPt = null;
    this.tactic = null; this.cover = null;
    this.errand = null; this.mate = null;
    this.director?.release(this);
  }

  // ---------------- perception ----------------
  canSee(p) {
    if (!p.alive || p.hidden) return false; // hidden: under the street (systems/Passage.js), in the getaway van
    const dx = p.x - this.x, dy = p.y - this.y;
    if (!inView(Math.hypot(dx, dy), Math.abs(angDiff(this.angle, Math.atan2(dy, dx))), this.aware)) return false;
    return this.world.sightLine(this.x, this.y, p.x, p.y);
  }

  // rangeMul: fraction of the view distance; close: radius seen all around
  canSeePoint(x, y, rangeMul = 1, close = 0) {
    const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
    if (d > ENEMY.viewDist * rangeMul) return false;
    if (d > close && Math.abs(angDiff(this.angle, Math.atan2(dy, dx))) > ENEMY.fov / 2) return false;
    return this.world.sightLine(this.x, this.y, x, y);
  }

  get distracted() {
    return (this.state === S.IDLE || (this.state === S.PATROL && this.pauseT > 0))
      && (ABSORBING.has(this.activity) || (this.activity === this.job && !WATCHFUL.has(this.job)));
  }

  // standing at ease: at his post or pausing on his round, nothing on his mind
  get atEase() {
    return this.aware === 0 && (this.state === S.IDLE ? this.atPost : this.state === S.PATROL && this.pauseT > 0);
  }

  // nothing has reached him: the squad is calm, or he is a tutorial man waiting for his turn or a lab dummy (passive),
  // who knows nothing of it
  get quiet() { return this.dormant || this.passive || this.director.phase === 'normal'; }

  // what his hands are at while at ease (a kind of render/PastimeArt.js), or null: free, or on his weapon
  get pastime() {
    if (!this.atEase || this.stow < 0.6 || (this.routine && this.activity === this.job)) return null;
    const a = this.activity;
    if (a === 'chat') return talks(this.world.time, this.turn) ? 'talk' : 'listen';
    return HANDS.has(a) || a === this.job ? a : null;
  }

  // a doorman's eyes: on the player when he comes near in front of him, else the way he stands
  gaze(base) {
    const p = this.world.player, G = AI.gaze;
    if (!p.alive) return base;
    const a = gazeAt(base, p.x - this.x, p.y - this.y, G.range, G.arc);
    return a !== base && this.world.lineOfSight(this.x, this.y, p.x, p.y) ? a : base;
  }

  get pouring() { return this.pastime === 'piss' && pours(this.actT, this.activityT); }

  // CharacterAnim hook
  busyHands() {
    const ph = this.gestureOn;
    if (ph) return this.gestureHands(ph);
    if (this.script?.walk && this.state === S.PATROL && this.pauseT <= 0 && this.aware === 0 && this.stow >= 0.6) {
      return pastimeHands(this.script.walk, this.world.time, this.seed);
    }
    const k = this.pastime;
    return k && pastimeHands(k, ONE_GO.has(k) ? this.actT : this.world.time, this.seed);
  }

  // CharacterAnim hook: on his knees, his shoulders up, his head drawn in, shaking
  mood() {
    if (!this.yielded) return null;
    const Y = GESTURE.panic.yield;
    return { hunch: Y.hunch, duck: Y.duck, shake: Y.px };
  }

  // weapon put away while all is calm, in hand and lowered once something is up, raised on a target
  updateCarry(dt) {
    // (a word with a stranger over a trifle: his weapon stays put away until he warns him)
    const c = this.case, word = !!c && c.stage < STAGE.WARNED && !c.rules.lasting && this.quiet;
    const calm = word || (this.aware === 0 && this.quiet && CALM.has(this.state));
    const was = this.stow, long = this.def.hold === 'two' || this.def.swing === 'club';
    carry(this, calm, this.aware >= 2 || this.recoil > 0, this.def.hold === 'two', dt);
    if (!this.weapon) return;
    // the hand on it, out of the holster (or off the back: swung round), put back (placeholders: PLACEHOLDERS.md)
    if (was >= 1 && this.stow < 1) this.world.sound(long ? 'sling' : 'holster', this.x, this.y, 0.6, { weapon: this.weapon.type });
    if (was >= 0.5 && this.stow < 0.5) this.world.sound('pickup', this.x, this.y, 0.5);
    if (was < 0.9 && this.stow >= 0.9) this.world.sound(long ? 'sling' : 'holster', this.x, this.y, 0.45, { weapon: this.weapon.type });
  }

  // sight check: every step once alert, staggered ticks before (the meter integrates the elapsed time)
  perceive(dt) {
    this.visAcc += dt;
    if (this.aware < 2 && (this.visT -= dt) > 0) return;
    this.visT = ENEMY.visionTick;
    const step = this.visAcc;
    this.visAcc = 0;
    const p = this.world.player;
    const recent = this.world.time - this.seenAt < 3;
    this.sees = !!p && this.canSee(p);
    // A stranger minding his own business on public ground is none of a guard's concern, however long he stands
    // there (the user: the men at the bar's door getting worked up at a man standing about was a nuisance); one who
    // walked into the premises unarmed, or does something odd, gets a word first (Director.conduct)
    const d = this.director, stranger = this.sees && this.aware < 2 && (!d.isThreat(p) || d.isIntruder(p));
    if (stranger) {
      this.sees = false;
      if (Math.hypot(p.x - this.x, p.y - this.y) < AI.gaze.range) this.turnHead(p.x, p.y, ENEMY.visionTick + 0.25); // his eyes on him
    }
    if (this.sees) {
      if (this.aware < 2) {
        const dx = p.x - this.x, dy = p.y - this.y;
        this.meter = Math.min(1, this.meter + step * detectionRate({
          dist: Math.hypot(dx, dy),
          off: Math.abs(angDiff(this.angle, Math.atan2(dy, dx))),
          moving: p.moving,
          light: this.world.lighting?.levelAt?.(p.x, p.y) ?? 0.6,
          vigilance: this.director.vigilance,
          focus: this.state === S.DIZZY ? 0.3 : this.distracted ? 0.45 : 1,
        }));
        if (this.meter >= 1) this.spot(recent);
        else if (this.meter >= ENEMY.suspicious) this.suspect(p.x, p.y, 'sight');
      } else if (this.state === S.HUNT) this.spot(recent);
      if (this.aware === 2) {
        this.lastKnown = { x: p.x, y: p.y };
        this.seenAt = this.world.time;
        this.director.sighted(p.x, p.y);
        if (this.state === S.COMBAT && this.shoutT <= 0) this.director.report(this);
      }
    } else if (this.aware < 2) this.meter = Math.max(0, this.meter - step * ENEMY.meterDecay[this.aware]);
  }

  // meter full: combat ('!'), then call it in
  spot(recent) {
    if (this.state === S.COMBAT || this.state === S.FETCH || this.state === S.FLEE || this.state === S.DIZZY || this.state === S.BACKUP) return;
    this.setState(S.COMBAT);
    this.react = rand(...(recent ? ENEMY.reacquire : ENEMY.reaction)) * this.slack;
    this.settle = 0;
    this.showIcon('!', 1);
    this.world.sound('shout', this.x, this.y, 1, { pitch: this.voice });
    this.shoutT = 0.35;
    this.thinkT = 0;
    if (this.boss && !this.director.bossSpoke) this.bossLine();
  }

  // The boss lays eyes on the player for the first time: his word to him, big over his head in a bubble
  // (data/barks.js BOSS, WorldRenderer.drawBubble), the game slowed down a moment, his fire held while he says it.
  bossLine() {
    const w = this.world;
    this.director.bossSpoke = true;
    const str = BOSS.lines[Math.floor(Math.random() * BOSS.lines.length)];
    w.texts.push({ who: this, x: this.x, y: this.y, str, t: BOSS.dur, dur: BOSS.dur, color: PALETTE.pink, bubble: true });
    w.slowmo(...BOSS.slowmo);
    this.react = Math.max(this.react, BOSS.hold);
    this.barkT = BOSS.hold + 0.5;
    this.speak('threat');
    w.sound('mutter', this.x, this.y, 1, { pitch: this.voice * 0.9 });
  }

  // noise heard (types: see ENEMY.hear); localisation gets worse with distance
  hear(type, x, y, source = null) {
    if (this.passive || this.dormant || this.yielded || !this.alive || this.knocked > 0 || this.state === S.DIZZY) return;
    // a bartender at the first shots: down behind his counter for a moment
    if (this.job === 'wipe' && !this.ducked && this.atPost && this.aware < 2 && (type === 'gunshot' || type === 'explosion')) {
      this.ducked = true;
      this.duckT = rand(...AI.duck);
    }
    if (this.aware === 2) {
      if ((type === 'gunshot' || type === 'explosion') && !this.sees) this.lastKnown = { x, y };
      return;
    }
    // having a word with the stranger: a small noise gets a glance, no more
    if (this.state === S.CHALLENGE && (type === 'footsteps' || !ALARMS.has(type))) { this.glanceAt(x, y, AI.listen.glance); return; }
    const err = hearingError(Math.hypot(x - this.x, y - this.y));
    const sx = x + rand(-err, err), sy = y + rand(-err, err);
    if (type === 'footsteps') {
      this.meter = Math.min(0.55, this.meter + ENEMY.hear.footsteps);
      if (this.meter >= ENEMY.suspicious) this.suspect(sx, sy, type);
      return;
    }
    // a mate is shooting: go and help while the squad is on alert, otherwise check it out
    const d = this.director, lk = d.lastKnown;
    if (type === 'allyFire' && source && d.phase === 'alert' && lk) {
      if (d.hunters() < AI.maxHunters) this.joinHunt(lk.x, lk.y); else this.guard(source.x, source.y);
      this.say('shots');
      return;
    }
    const lvl = ENEMY.hear[type] ?? ENEMY.hear.noise;
    this.meter = Math.max(this.meter, lvl);
    this.suspect(sx, sy, type, lvl >= 0.6);
  }

  // '?': stop, turn the head, then go and look
  suspect(x, y, kind, urgent = false) {
    if (this.aware === 2 || this.state === S.DIZZY) return;
    if (urgent) this.director.raise();
    if (this.state === S.SUSPICIOUS || this.state === S.INVESTIGATE) {
      this.stim = { x, y, kind };
      if (urgent && !this.urgent) this.investigate(x, y, kind, true);
      return;
    }
    if (this.state === S.CHECK) this.checkTarget?.seen?.delete(this);
    this.setState(S.SUSPICIOUS);
    this.stim = { x, y, kind };
    this.urgent = urgent;
    this.susT = urgent ? rand(0.35, 0.55) : rand(0.7, 1.1);
    this.showIcon('?', 1.5);
    this.say(kind === 'sight' ? 'sight' : kind === 'gunshot' ? 'shots' : 'noise');
  }

  investigate(x, y, kind, urgent) {
    if (this.aware === 2 || this.knocked > 0) return;
    this.setState(S.INVESTIGATE);
    this.nearT = 0;
    this.stim = { x, y, kind };
    this.urgent = urgent;
    this.meter = Math.max(this.meter, ENEMY.suspicious);
    this.showIcon('?', 1.2);
  }

  // a mate died in front of us
  witnessKill(victim) {
    const now = this.world.time;
    this.witnessed = this.witnessed.filter((t) => now - t < 5);
    this.witnessed.push(now);
    const named = victim.boss && !victim.traits ? 'chief' : 'down', who = { N: victim.nick }; // (a boss with a name: by it)
    if (this.witnessed.length >= 2 && this.panicT <= 0 && chance(this.kind === 'brute' ? 0.3 : 0.6)) {
      this.panicT = rand(3, 5);
      this.say('panic');
      this.thinkT = 0;
    } else if (this.aware === 2 && chance(0.7)) {
      this.barkT = 0; // the cry cuts short whatever he was saying
      if (!(chance(0.5) && this.say(named, who))) this.say('revenge');
    }
    if (this.aware === 2) return;
    this.director.callIn(this, victim.x, victim.y);
    this.meter = Math.max(this.meter, 0.8);
    // he saw where it came from only if the killer is in view too
    const p = this.world.player;
    const src = p.alive && this.canSeePoint(p.x, p.y) ? p : victim;
    // his cry for the man who fell comes before anything else he would say
    this.barkT = 0;
    if (!this.say(named, who)) this.say('body');
    this.suspect(src.x + rand(-24, 24), src.y + rand(-24, 24), 'witness', true);
  }

  // look for evidence: knocked-out mates, bodies, wrecked walls/doors/windows, empty posts
  scanWorld() {
    if (this.aware === 2 || this.state === S.CHECK || this.state === S.DIZZY) return;
    const w = this.world;
    for (const e of w.enemies) {
      if (e === this || !e.alive || e.knocked < 0.5 || e.executing) continue;
      if (w.enemies.some((o) => o.checkTarget?.friend === e && o.state === S.CHECK)) continue;
      if (this.canSeePoint(e.x, e.y, 0.8)) { this.check({ kind: 'friend', x: e.x, y: e.y, friend: e }); return; }
    }
    for (const inc of this.director.incidents) {
      if (inc.reported || inc.seen.has(this) || (inc.after && w.time < inc.after)) continue;
      if (!this.canSeePoint(inc.x, inc.y, inc.kind === 'body' || inc.kind === 'missing' ? 0.75 : 0.85)) continue;
      inc.seen.add(this);
      this.check(inc);
      return;
    }
    // the player's footprints: blood alarms anyone, wet soles only mean something to a guard already looking
    const d = this.director;
    if (!TRACKERS.has(this.state) || d.tracker) return;
    const looking = this.aware > 0 || d.phase !== 'normal', R = AI.trail;
    const print = d.trail.find((q) => this.canSeePoint(q.x, q.y, R.sight, R.close), (q) => looking || q.kind === 'blood');
    if (print) this.track(print);
  }

  // '?': follow the footprints from that one on
  track(print) {
    this.setState(S.TRACK);
    this.nearT = 0;
    this.trackAt = print;
    this.meter = Math.max(this.meter, ENEMY.suspicious);
    this.showIcon('?', 1.5);
    this.say(print.kind === 'blood' ? 'blood' : 'tracks');
    if (print.kind === 'blood') this.director.raise();
  }

  check(inc) {
    this.setState(S.CHECK);
    this.checkTarget = inc;
    this.meter = Math.max(this.meter, 0.5);
    this.showIcon('?', 1.5);
    this.say(FOUND[inc.kind] ?? 'damage');
  }

  // ---------------- a word with the stranger (ai/Conduct.js) ----------------
  // Could he have seen the stranger at it (Director.conduct): on his feet and free (not in a fight, not on his knees,
  // not down behind a counter), the stranger in sight within AI.challenge.sight px (close by, if his mind is on his
  // game); a noise (heard) turns his head to it, so no view cone then.
  witness(p, heard = false) {
    if (this.passive || this.dormant || this.yielded || this.knocked > 0 || this.held || this.aware === 2 || this.vaulting) return false;
    if (this.state === S.DIZZY || this.state === S.BACKUP || this.duckT > 0) return false;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d > (this.distracted ? AI.challenge.near : AI.challenge.sight)) return false;
    return heard ? this.world.sightLine(this.x, this.y, p.x, p.y) : this.canSee(p);
  }

  // a look at (x, y) for dur s, whatever he is at
  glanceAt(x, y, dur) { this.eyes = { x, y, until: this.world.time + dur }; }

  // He saw the stranger do something odd (act, data/conduct.js ACTS) at (x, y): over to him to have a word. open: the
  // stage the word starts at once there (ai/Conduct.js opening: warned at once, a man let off not long ago).
  challenge(act, x, y, open = STAGE.TOLD) {
    const p = this.world.player;
    this.setState(S.CHALLENGE);
    this.case = new Case(act, { x, y }, this.world.time, open);
    this.director.challenger = this;
    this.barkT = 0;
    if (Math.hypot(p.x - this.x, p.y - this.y) > AI.challenge.talk * 2) this.say('hey');
    this.world.events.emit('challenge', { guard: this, act, stage: STAGE.GO });
  }

  // the word is over (letOff: let off, or the stranger got away from it): the Director remembers him a while
  endCase(letOff) {
    if (!this.case) return;
    this.case = null;
    this.director?.closeCase(this, letOff);
  }

  // Over to him, then talk: told, warned, shoved, and the fight is on unless he does as he is told (ai/Conduct.js
  // judge); out of sight too long, he lets it go.
  doChallenge(dt) {
    const w = this.world, p = w.player, c = this.case, C = AI.challenge, now = w.time;
    if (!c || !p.alive || p.hidden) { this.endCase(false); this.setState(S.RETURN); return; }
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    const seen = dist <= ENEMY.viewDist && w.sightLine(this.x, this.y, p.x, p.y);
    c.lost = seen ? 0 : c.lost + dt;
    if (seen) c.seen = { x: p.x, y: p.y };
    const tg = seen ? p : c.seen ?? c.at;
    if (c.stage === STAGE.GO) {
      if (c.lost > C.lost) { this.letGo(); return; }
      if (!seen || dist > C.talk + 8) {
        // a man he cannot get to (over a counter, up on a roof) is called from where he stands
        const stuck = this.travel(dt, tg.x, tg.y, ENEMY.walkSpeed * C.pace, { near: C.talk, look: !(seen && dist < 200) });
        if (seen && dist < 200) this.faceTo(p.x, p.y, 5, dt);
        if (!(stuck && seen && dist < 160)) return;
      }
      this.stageUp(c);
    }
    if (c.stage === STAGE.SHOVED && !c.shoved) {
      // up to him, and a flat hand in his chest
      if (dist > C.reach && now - c.t < 2.5) {
        this.travel(dt, p.x, p.y, ENEMY.walkSpeed * C.pace * 1.3, { near: C.reach - 4, look: false });
        this.faceTo(p.x, p.y, 6, dt);
        return;
      }
      c.shoved = true;
      c.t = now;
      if (dist <= C.reach + 8) this.shove(p);
    }
    // talking: a word's distance off, his eyes on him
    if (seen && dist > C.talk + 40) this.travel(dt, p.x, p.y, ENEMY.walkSpeed * C.pace, { near: C.talk, look: false });
    else this.halt();
    this.faceTo(tg.x, tg.y, 5, dt);
    const out = !this.director.inPremises(p);
    const v = judge(c, { complied: complies(c, p, !out) || (out && dist > C.gone), lost: c.lost }, now, dt);
    if (v === 'settle') this.letOff('settle');
    else if (v === 'drop') this.letGo();
    else if (v === 'escalate') this.stageUp(c);
  }

  // the next stage of the word: told (what he did), warned, shoved, the fight
  stageUp(c) {
    const from = c.stage, s = c.next(this.world.time);
    this.barkT = 0;
    this.world.events.emit('challenge', { guard: this, act: c.act, stage: s });
    if (s === STAGE.TOLD || (from === STAGE.GO && s === STAGE.WARNED)) this.say(c.rules.order);
    else if (s === STAGE.WARNED) this.say('press');
    if (s === STAGE.WARNED) this.showIcon('!', 1.2);
    else if (s === STAGE.SHOVED) c.shoved = false;
    else if (s === STAGE.FIGHT) this.snapAt();
  }

  // a flat hand in his chest (the hand comes up as on a door leaf: CharacterAnim doorHandPose), thrown back a step
  shove(p) {
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    // a whole door hand (Character.updateDoorHand lets it down after GESTURE.door.follow): pushing, the free hand
    const side = this.armed && !(this.stow >= 0.6) ? -1 : 1;
    this.doorHand = { x: p.x - Math.cos(a) * p.radius, y: p.y - Math.sin(a) * p.radius, a: a + Math.PI, w: 1, push: 1,
      hold: GESTURE.door.follow, side, door: null };
    p.shoved?.(a, AI.challenge.shove);
    this.say('shove');
    this.world.sound('punch', p.x, p.y, 0.35, { pitch: 1.3 });
  }

  // he would not listen: the fight is on, and the squad takes him for a threat for good
  snapAt() {
    const p = this.world.player;
    this.endCase(false);
    this.director.provoked = true;
    this.barkT = 0;
    this.say('snap');
    this.sees = true;
    this.lastKnown = { x: p.x, y: p.y };
    this.spot(false);
  }

  // he did as he was told: a last word, and back to what he was at
  letOff(line) {
    this.barkT = 0;
    this.say(line);
    this.endCase(true);
    this.meter = 0;
    this.setState(S.RETURN);
  }

  // gone out of sight before a word could be had: let it go
  letGo() { this.letOff('letgo'); }

  // ---------------- squad orders ----------------
  joinHunt(x, y) {
    if (this.knocked > 0 || this.aware === 2) return;
    this.setState(S.HUNT);
    this.lastKnown = { x, y };
    this.showIcon('!', 1);
    if (chance(0.5)) this.say('hunt');
  }

  guard(x, y) {
    if (this.knocked > 0 || this.aware === 2) return;
    this.setState(S.GUARD);
    this.guardPt = { x, y };
    this.guardT = rand(8, 14);
    this.meter = Math.max(this.meter, ENEMY.suspicious);
    this.showIcon('?', 1);
  }

  // director-run sweep after losing the target
  beginSearch() {
    if (!this.alive || this.knocked > 0 || this.state === S.BACKUP) return;
    this.setState(S.SEARCH);
    this.localPts = null;
    this.meter = Math.max(this.meter, 0.5);
    if (chance(0.4)) this.say('lost');
  }

  beginLocalSearch(x, y, n) {
    this.setState(S.SEARCH);
    this.localPts = searchPoints(this.world.map, x, y, 6, n + 1).slice(1);
  }

  standDown() {
    if (!this.alive || this.knocked > 0 || this.sees) return;
    if (this.aware === 2 || this.state === S.SEARCH || this.state === S.GUARD) this.calm();
  }

  calm() {
    if (this.state !== S.IDLE && this.state !== S.PATROL) this.say('clear');
    this.setState(S.RETURN);
    this.urgent = false;
    this.meter = Math.min(this.meter, 0.2);
  }

  // ---------------- main update ----------------
  update(dt) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    this.iconT = Math.max(0, this.iconT - dt);
    this.barkT = Math.max(0, this.barkT - dt);
    if (this.rallyT > 0 && (this.rallyT -= dt) <= 0) { this.barkT = 0; this.say('rally'); }
    this.chatCd = Math.max(0, this.chatCd - dt);
    this.reliefCd = Math.max(0, this.reliefCd - dt);
    this.updateCarry(dt);
    this.drip(dt);
    if (this.knocked > 0) { this.updateKnocked(dt); return; }
    if (this.holding && this.held) this.dropHeld(); // seized: what was in his hands falls
    if (this.held) {
      // seized from behind: nothing he can do, unless the grip is lost
      // (pulled to what his head is driven into: he goes where he is put)
      const td = this.held.alive && this.held.takedown?.target === this ? this.held.takedown : null;
      if (td) { if (!td.spot) this.halt(); return; }
      this.held = null;
      this.body.collisionFilter = { ...this.body.collisionFilter, group: 0 }; // let go: solid to him again
    }
    if (this.updateVault(dt)) return;
    if (this.passive || this.dormant) { this.waitTurn(dt); return; } // blind and deaf, at his job if he has one
    this.seatThrough();
    if (this.yielded) { this.updateYield(dt); return; }
    // a blow wound up (windUp) comes now, whether he is still in reach or not
    if (this.tell > 0 && (this.tell -= dt) <= 0) { this.tell = 0; this.attack(true); }
    this.t += dt;
    this.panicT = Math.max(0, this.panicT - dt);
    this.kneel = false;
    this.perceive(dt);
    if ((this.scanT -= dt) <= 0) { this.scanT = 0.3; this.scanWorld(); }
    // one of the last two: a moment after a mate fell, he calls out for the others (Director.onKill)
    if (this.mourn && this.world.time >= this.mourn.at) { const m = this.mourn; this.mourn = null; this.barkT = 0; this.say('alone', m); }
    this.nodT = Math.max(0, this.nodT - dt);
    if (this.holding && !(this.atEase && this.activity === this.job)) {
      if (this.aware > 0 || this.director.phase !== 'normal') this.dropHeld(); else this.holding = null;
    }
    // sat down: he gets up first, and does nothing else until he is on his feet
    if (this.updatePosture(dt)) { this.crouch = Math.max(0, this.crouch - dt * 5); return; }

    // down behind his counter (see hear): nothing else until he dares look, unless the threat is on him
    if (this.duckT > 0 && this.aware < 2) { this.duckT -= dt; this.halt(); this.kneel = true; }
    else switch (this.state) {
      case S.IDLE: this.doIdle(dt); break;
      case S.PATROL: this.doPatrol(dt); break;
      case S.RETURN: this.doReturn(dt); break;
      case S.SUSPICIOUS: this.doSuspicious(dt); break;
      case S.INVESTIGATE: this.doInvestigate(dt); break;
      case S.CHECK: this.doCheck(dt); break;
      case S.SEARCH: this.taunt(dt); this.doSearch(dt); break;
      case S.GUARD: this.doGuard(dt); break;
      case S.DIZZY: this.doDizzy(dt); break;
      case S.COMBAT: this.doCombat(dt); break;
      case S.HUNT: this.taunt(dt); this.doHunt(dt); break;
      case S.FETCH: this.doFetch(dt); break;
      case S.BACKUP: this.doBackup(dt); break;
      case S.FLEE: this.doFlee(dt); break;
      case S.TRACK: this.doTrack(dt); break;
      case S.CHALLENGE: this.doChallenge(dt); break;
      default: break;
    }
    // a glance at something (a noise he leaves to the others, the stranger another one is talking to): his head
    // turns, the rest of him carries on
    if (this.eyes) {
      if (this.world.time < this.eyes.until && this.aware === 0 && !this.held) this.faceTo(this.eyes.x, this.eyes.y, 4, dt);
      else this.eyes = null;
    }
    const k = !this.kneel ? 0 : this.duckT > 0 && this.aware < 2 ? DUCK : 1;
    this.crouch = this.crouch < k ? Math.min(k, this.crouch + dt * 5) : Math.max(k, this.crouch - dt * 5);
  }

  // ---------------- calm behaviours ----------------
  // a tutorial man waiting for his wave (systems/Tutorial.js), a lab dummy (passive): he sees and hears nothing, but
  // goes on at his job
  waitTurn(dt) {
    this.t += dt;
    // a script sends him somewhere at a run, straight there (systems/Tutorial.js: the man with the match makes for
    // the door)
    if (this.bolt) {
      const dx = this.bolt.x - this.x, dy = this.bolt.y - this.y;
      this.steer(dx, dy, ENEMY.runSpeed, 0.3);
      this.faceAngle(Math.atan2(dy, dx), 10, dt);
      return;
    }
    if (this.updatePosture(dt) || !(this.routine && this.activity === this.job)) { this.halt(); return; }
    this.work(dt);
  }

  doIdle(dt) {
    if (this.routine && this.activity === this.job) { this.work(dt); return; }
    const h = this.errand ?? this.home;
    this.atPost = Math.hypot(h.x - this.x, h.y - this.y) <= 14 || (!this.errand && this.world.time < this.restUntil);
    if (!this.atPost) {
      // a spot he cannot get to (something in the way) is forgotten
      if (this.errand && (this.errandT += dt) > AI.relief.giveUp) { this.errand = null; this.activityT = 0; }
      // no way there, or held up on the way too often (a mate standing in the only way, ai/Nav.js jams): an errand
      // is dropped, his post waits a while and he idles where he stands
      if (this.travel(dt, h.x, h.y, ENEMY.walkSpeed, { doors: true })) {
        if (this.errand) { this.errand = null; this.activityT = 0; } else this.restUntil = this.world.time + rand(...AI.nav.jam.rest);
      }
      return;
    }
    this.halt();
    this.actT += dt;
    const busy = this.distracted || HANDS.has(this.activity); // dropped as soon as the squad is on edge
    if ((this.activityT -= dt) <= 0 || (busy && this.director.phase !== 'normal')) this.pickActivity();
    this.easeTick(dt);
    const base = h.angle ?? h.face ?? this.home.angle; // (an errand's spot may only say which way to face)
    if (this.distracted) this.faceAngle(this.idleFace, 2, dt);
    else if (this.activity === 'turn') this.faceAngle(this.turnTo, 2.2, dt);
    else if (this.activity === 'scan') this.faceAngle(base + Math.sin(this.t * 0.8 + this.seed) * 1.2, 2.2, dt);
    else this.sweep(dt, base, 0.7, 1.8);
  }

  // a pastime at his post: he is at it when the level opens and goes back to it as long as all is calm
  takeJob(job) {
    if (!job) return;
    this.job = job;
    this.boss = job === 'boss';
    this.activity = job;
    this.activityT = rand(8, 14);
    const S = POSTS[job];
    if (!S) return;
    this.script = S;
    if (S.seat) {
      // on his seat from the start; he stands up just off it
      const seat = this.takeSeat(S.seat);
      if (seat) {
        this.seat = seat;
        this.home = this.standOff(seat);
        Body.setPosition(this.body, seat);
        this.angle = seat.face;
        this.posture = 1; this.postureOf = S.body; this.onSpot = true;
        this.seatThrough();
      }
    } else if (S.front) {
      // his post: square in the middle of the side he faces of what he works at, his hands on it
      const p = this.nearest(S.front, this, 2 * TILE);
      if (p) {
        const f = sideOf(p, this.home.angle, this.radius + 1);
        this.home = { x: f.x, y: f.y, angle: f.face };
        Body.setPosition(this.body, f);
        this.angle = f.face;
      }
    } else if (S.body === 'wall') {
      // his post: his back against a plain stretch of the wall behind him
      const w = wallBehind(this.world.map, this.x, this.y, this.home.angle);
      if (w) {
        this.home = { x: w.x, y: w.y, angle: w.face };
        Body.setPosition(this.body, w);
        this.angle = w.face;
      }
    }
    if (S.rest === 'desk' && this.seat) {
      // his weapon stood on the floor against the end of the desk, on his left, the barrel on its edge (seen from
      // above it shows short: len); a smoker's ashtray on the arm of his chair (the script's `ash`)
      const desk = this.nearest('desk', this.seat, 3 * TILE), f = this.seat.face;
      if (desk) {
        const lx = Math.cos(f - Math.PI / 2), ly = Math.sin(f - Math.PI / 2), out = desk.def.w / 2 + 8; // his left
        this.rest = { x: desk.x + lx * out - Math.cos(f) * 3, y: desk.y + ly * out - Math.sin(f) * 3, a: f + Math.PI / 2 - 0.15, len: 0.6 };
      }
      if (S.ash) this.ashtray = { x: this.seat.x - Math.sin(f) * 10.5 + Math.cos(f) * 1.5, y: this.seat.y + Math.cos(f) * 10.5 + Math.sin(f) * 1.5 };
    }
    this.routine = new Routine(S, this.seat?.slot ?? 0);
    if (!S.walk) this.routine.begin(this.routine.pick(), true);
    if (S.open && chance(S.open.odds)) this.openAt(S.open);
  }

  // the level opens on him at act O.act, phase O.phase, already in place there (a patrol caught at a halt: on the
  // spot of the act's first phase, in its body)
  openAt(O) {
    const act = this.script.acts[O.act], first = act.phases[0], ph = act.phases[Math.min(O.phase, act.phases.length - 1)];
    const spot = this.spotFor(first);
    if (!spot) return;
    this.routine.beginAt(O.act, O.phase);
    this.activity = this.job;
    this.pauseT = Infinity;
    this.workSpot = spot; this.onSpot = this.atPost = true;
    Body.setPosition(this.body, spot);
    this.angle = spot.face;
    const body = ph.body ?? this.script.body;
    if (body && body !== 'stand') { this.posture = 1; this.postureOf = body; this.leanAt = spot; }
  }

  // ---------------- at his post (data/posts.js) ----------------
  // the prop of `type` nearest to p within `reach` px
  nearest(type, p, reach) {
    let best = null, bd = reach;
    for (const q of this.world.props) {
      const d = q.type === type && !q.dead ? Math.hypot(q.x - p.x, q.y - p.y) : Infinity;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  // the free place nearest him on the nearest piece of furniture his job sits him on
  takeSeat(def) {
    const prop = this.nearest(def.prop, this, 3 * TILE);
    if (!prop) return null;
    const taken = this.world.enemies.filter((e) => e.seat);
    const places = def.places.map((pl, slot) => ({ ...seatPlace(prop, pl, def.face), side: pl[2] ?? 1, slot }))
      .filter((s) => !taken.some((e) => Math.hypot(e.seat.x - s.x, e.seat.y - s.y) < 4));
    places.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
    return places[0] ?? null;
  }

  // where he stands up from his seat: off its front, else off a side (a desk in front of him), else behind
  standOff(seat) {
    for (const da of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const a = seat.face + da, x = seat.x + Math.cos(a) * STANDOFF, y = seat.y + Math.sin(a) * STANDOFF;
      if (!this.world.map.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE)) && !this.furnitureAt(x, y, this.radius)) {
        return { x, y, angle: seat.face };
      }
    }
    return { x: seat.x, y: seat.y, angle: seat.face };
  }

  // a piece of furniture whose box comes within r px of (x, y)
  furnitureAt(x, y, r) {
    const box = { min: { x: x - r, y: y - r }, max: { x: x + r, y: y + r } };
    return this.world.props.some((p) => p.body && !p.dead && !p.def.hung && !p.def.fixture && Bounds.overlaps(p.body.bounds, box));
  }

  // on his seat, on his way onto it or off it, he goes through the furniture (the sofa would shove him off it)
  seatThrough() {
    const st = this.seat;
    if (!st || this.knocked > 0) return;
    const near = this.posture > 0 || (this.activity === this.job && this.aware === 0 && Math.hypot(st.x - this.x, st.y - this.y) < 40);
    const want = near || (this.through && this.furnitureAt(this.x, this.y, this.radius - 2));
    if (want === this.through) return;
    this.through = want;
    this.body.collisionFilter = { category: CAT.CHAR, mask: want ? MASK.CHAR & ~CAT.PROP : MASK.CHAR, group: 0 };
  }

  // the body the phase under way asks for ('seat' | 'desk' | 'wall'), while all is calm and he is at it
  get wantBody() {
    const ph = this.routine?.phase;
    if (!ph || this.activity !== this.job || !this.onSpot || !this.atEase || !this.quiet) return null;
    const b = ph.body ?? this.script.body;
    // against a car: once he has turned his back to it (he backs onto it), while it stays put
    if (b === 'hood') {
      const s = this.workSpot;
      if (!s?.car || (this.posture <= 0 && Math.abs(angDiff(this.angle, s.face)) > HOOD.turned)) return null;
    }
    return b && b !== 'stand' ? b : null;
  }

  // sitting down (leaning back) at the spot, getting up when something is up or the job goes on elsewhere. True
  // while a seated man is still getting up: no step, no blow, no shot till he is on his feet.
  updatePosture(dt) {
    if (!this.script) return false;
    const want = this.wantBody, S = this.script;
    if (want && (want === this.postureOf || this.posture <= 0)) {
      if (want === 'hood' && this.posture <= 0) { this.leanAt = this.workSpot; this.world.sound('hoodLean', this.x, this.y, 0.5); }
      this.postureOf = want;
      this.posture = Math.min(1, this.posture + dt / (want === 'wall' ? 0.4 : want === 'hood' ? HOOD.settle : S.sit ?? 0.8));
      return false;
    }
    if (this.posture <= 0) return false;
    // off a wall or a car he pushes himself up and goes on at once; out of a seat he stands up first
    const seated = this.postureOf !== 'wall' && this.postureOf !== 'hood';
    this.posture = Math.max(0, this.posture - dt / (seated ? S.rise ?? 0.5 : this.postureOf === 'hood' ? HOOD.off : 0.35));
    if (!seated || this.posture <= 0) return false;
    // up and off the front of it as he rises, turning to what called him
    const h = this.home, d = Math.hypot(h.x - this.x, h.y - this.y);
    this.steer(h.x - this.x, h.y - this.y, Math.min(1, d / 12), 0.25);
    const tg = this.lastKnown ?? this.stim;
    if (tg) this.faceTo(tg.x, tg.y, 3, dt);
    return true;
  }

  // the phase under way while he is at it, or null
  get gestureOn() {
    const R = this.routine;
    return R && R.act && this.activity === this.job && this.onSpot && this.atEase && this.stow >= 0.6 ? R.phase : null;
  }

  // where the hands are at phase ph, in the gesture's own frame (render: PostArt mirrors the drawing itself)
  rawHands(ph) {
    const G = GESTURES[ph.g] ?? {}, R = this.routine, t = this.world.time;
    return G.hands ? G.hands(R.k, R.t, t, this.seed, this.def.swing)
      : pastimeHands(G.pastime ?? ph.g, gestureClock(G, R.k, t, this.seed), this.seed);
  }

  // ... and on his body: mirrored for the man on the other side of a couch (his other arm along the backrest)
  gestureHands(ph) {
    const h = this.rawHands(ph);
    if (!h || (this.seat?.side ?? 1) > 0) return h;
    return { hl: { x: h.hr.x, y: -h.hr.y }, hr: { x: h.hl.x, y: -h.hl.y } };
  }

  // CharacterAnim.postPose: how his body is at it, or null (his plain stance)
  postBody() {
    if (!this.script || this.vaulting || this.knocked > 0) return null;
    const ph = this.gestureOn, R = this.routine, side = this.seat?.side ?? 1;
    if (!ph && this.posture <= 0) return null;
    const G = ph && GESTURES[ph.g], b = G?.body?.(R.k, R.t, this.seed) ?? {};
    const B = {
      base: this.postureOf, w: this.posture, face: this.postureOf === 'hood' ? this.leanAt?.face : undefined, fwd: b.fwd ?? 0, side: (b.side ?? 0) * side, twist: (b.twist ?? 0) * side,
      dip: b.dip ?? 0, foot: b.foot ? [side > 0 ? b.foot[0] : 1 - b.foot[0], b.foot[1], b.foot[2] * side] : null,
      hands: ph ? this.gestureHands(ph) : null, wpn: null,
      // (a world point, in pose px: he is drawn BODY_SCALE bigger)
      rest: this.rest && this.posture > 0 ? { x: (this.rest.x - this.x) / BODY_SCALE, y: (this.rest.y - this.y) / BODY_SCALE, a: this.rest.a, len: this.rest.len } : null,
    };
    if (G?.wpn && B.hands) B.wpn = G.wpn(B.hands); // his weapon in his hand at it (the corridor's man, his pistol)
    if (ph?.g === 'fiddle' && B.hands) {
      // his own weapon in his hands: a blade pointed at his nails, a club turning over in the air
      const hr = B.hands.hr;
      if (this.def.swing === 'blade') B.wpn = { x: hr.x, y: hr.y, a: -1.75 * side, len: 0.8, s: 1, top: 0 };
      else {
        const u = (R.t / TOSS) % 1, k = clamp((u - 0.15) / 0.6, 0, 1), up = Math.sin(Math.PI * k);
        B.wpn = { x: hr.x + 2 * up, y: hr.y - 2 * up * side, a: (-0.5 + Math.PI * 2 * k) * side, len: 1, s: 1 + 0.35 * up, top: up > 0.1 ? 1 : 0 };
      }
    }
    return B;
  }

  // can he play act `name` here: all it needs is at hand (a car to look into, a customer to serve, a dancer...)
  canPlay(name) {
    return this.script.acts[name].phases.every((ph) => (!ph.at || ph.at === 'post' || ph.at === 'here' || this.spotFor(ph))
      && (ph.look !== 'dance' || this.dancer()));
  }

  // the nearest dancer in sight
  dancer() {
    let best = null, bd = 7 * TILE;
    for (const c of this.world.chars) {
      if (!c.isCivilian || !c.alive || c.brain?.activity !== 'dance') continue;
      const d = Math.hypot(c.x - this.x, c.y - this.y);
      if (d < bd && this.world.lineOfSight(this.x, this.y, c.x, c.y)) { bd = d; best = c; }
    }
    return best;
  }

  // where phase ph is done { x, y, face }, or null when there is no such place
  spotFor(ph) {
    const w = this.world, h = this.home, R = 4 * TILE;
    switch (ph.at ?? 'post') {
      case 'post': return this.seat ?? { x: h.x, y: h.y, face: h.angle };
      case 'here': return { x: this.x, y: this.y, face: this.angle };
      case 'toilet': { const s = reliefSpot(w.map, w.props, h.x, h.y); return s && !s.wall ? s : null; }
      case 'wall': { const s = reliefSpot(w.map, w.props, this.x, this.y); return s?.wall ? s : null; }
      case 'car': {
        let best = null, bd = R;
        for (const v of w.props) {
          const d = v.isVehicle && !v.moving && !v.dead ? Math.hypot(v.x - this.x, v.y - this.y) - v.w / 2 : Infinity;
          if (d < bd) { bd = d; best = v; }
        }
        return best && besideCar(best, this.x, this.y);
      }
      case 'hood': {
        // his back to the nearest parked car's hood, on the sidewalk side, nobody else leaning there already
        const ok = (x, y) => {
          const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
          return !w.map.isBlocked(cx, cy) && !'=-'.includes(w.map.at(cx, cy));
        };
        let best = null, bd = HOOD.reach;
        for (const v of w.props) {
          if (!v.isVehicle || v.moving || v.dead || v.burning || v.exploded || v.armoured || v === this.shunned) continue;
          if (w.enemies.some((e) => e !== this && e.alive && e.workSpot?.car === v)) continue;
          const s = hoodSpot(v, this.x, this.y, ENEMY.radius + HOOD.gap, ok), d = s ? Math.hypot(s.x - this.x, s.y - this.y) : Infinity;
          if (d < bd) { bd = d; best = s; }
        }
        return best;
      }
      case 'stool': {
        // behind the counter, square in front of a customer having a drink at it
        const ax = -Math.sin(h.angle), ay = Math.cos(h.angle);
        const drinkers = w.chars.filter((c) => c.isCivilian && c.alive && c.brain?.activity === 'drink' && !c.left
          && Math.abs((c.x - h.x) * ax + (c.y - h.y) * ay) < 2.5 * TILE && Math.abs((c.x - h.x) * ay - (c.y - h.y) * ax) < 2 * TILE);
        if (!drinkers.length) return null;
        const c = drinkers[Math.floor(Math.random() * drinkers.length)], along = (c.x - h.x) * ax + (c.y - h.y) * ay;
        return { x: h.x + ax * along, y: h.y + ay * along, face: h.angle };
      }
      case 'pool': {
        // another side of the table, nobody standing there
        const table = this.nearest('pool_table', h, R);
        if (!table) return null;
        const free = poolSpots(table, this.radius + 1).filter((s) => Math.hypot(s.x - this.x, s.y - this.y) > 24
          && !w.map.isSolid(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) && !this.furnitureAt(s.x, s.y, this.radius - 2)
          && !w.chars.some((c) => c !== this && c.alive && Math.hypot(c.x - s.x, c.y - s.y) < 22));
        return free.length ? free[Math.floor(Math.random() * free.length)] : null;
      }
      default: { const p = this.nearest(ph.at, h, R); return p && frontOf(p, this.radius + 1); } // a sink, a fridge...
    }
  }

  // a new act of his job (at a halt on his round only one, then he walks on)
  nextAct() {
    const R = this.routine;
    if (this.state === S.PATROL) { this.pauseT = 0; this.activity = 'walk'; return; }
    if (!this.script.stay && this.activityT <= 0) { this.pickActivity(); if (this.activity !== this.job) return; }
    R.begin(R.pick((n) => this.canPlay(n)));
    this.startPhase();
  }

  // a phase begins: a new spot if it says where, its line
  startPhase() {
    const R = this.routine, ph = R.phase;
    if (!ph) return;
    if (ph.at || R.i === 0) this.workSpot = null;
    this.fxT = 0;
    if (ph.say && chance(ph.say[1]) && this.say(ph.say[0])) {
      this.world.sound('mutter', this.x, this.y, 0.5, { pitch: this.voice });
      // the other man at the same job answers it (a laugh at a joke)
      const mate = ph.answer && this.world.enemies.find((e) => e !== this && e.alive && e.job === this.job && e.atEase
        && Math.hypot(e.x - this.x, e.y - this.y) < 3 * TILE);
      if (mate) mate.routine.cue(ph.answer, R.dur + rand(0.1, 0.4));
    }
  }

  // At his post, the routine of his job (data/posts.js): to the spot of each phase, then at it, phase by phase
  work(dt) {
    const R = this.routine;
    if (!this.quiet && !WATCHFUL.has(this.job)) { this.pickActivity(); return; }
    this.activityT -= dt;
    if (!R.act && !R.cued) { this.nextAct(); if (this.activity !== this.job || !R.act) return; }
    const ph = R.phase;
    if (ph && !this.workSpot) {
      this.workSpot = this.spotFor(ph);
      this.errandT = 0;
      if (!this.workSpot) { this.onSpot = false; if (R.advance() === 'phase') this.startPhase(); return; }
    }
    // the car he leans on drives off, is struck or catches fire: he is off it and never goes back to it
    if (this.workSpot?.car && leanBroken(this.workSpot.car, this.workSpot.at)) {
      this.shunned = this.workSpot.car;
      R.act = null; this.workSpot = null; this.onSpot = false;
      this.nextAct();
      return;
    }
    const s = this.workSpot ?? { x: this.x, y: this.y, face: this.angle }, d = Math.hypot(s.x - this.x, s.y - this.y);
    this.onSpot = d < 10 || (this.posture > 0 && this.onSpot);
    this.atPost = this.onSpot;
    if (!this.onSpot) {
      // a spot he cannot get to (somebody standing there, something in the way) is given up
      if ((this.errandT += dt) > AI.relief.giveUp) { this.workSpot = null; if (R.advance() === 'phase') this.startPhase(); return; }
      // a few steps in plain sight (along behind a counter the grid takes for furniture): straight there
      if (d < 3 * TILE && this.world.lineOfSight(this.x, this.y, s.x, s.y)) {
        this.steer(s.x - this.x, s.y - this.y, ENEMY.walkSpeed * 0.8, 0.15);
        this.faceAngle(Math.atan2(s.y - this.y, s.x - this.x), 4, dt);
      } else this.travel(dt, s.x, s.y, ENEMY.walkSpeed, { doors: true, near: 6 });
      return;
    }
    if (d > 1) this.steer(s.x - this.x, s.y - this.y, Math.min(0.5, d / 16), 0.2); else this.halt();
    this.faceAngle(this.lookFor(ph, s), ph?.look === 'sweep' ? 1.2 : 2.5, dt);
    const body = ph && (ph.body ?? this.script.body);
    if (body && body !== 'stand' && this.posture < 1) return; // sitting down, his back to the wall first
    this.holding = (ph && GESTURES[ph.g]?.item) || null;
    const k0 = R.k, ev = R.step(dt);
    if (ph) this.postFx(ph, k0, ev ? 1 : R.k, dt);
    if (ev === 'phase') this.startPhase();
    else if (ev === 'act') { this.workSpot = null; this.nextAct(); }
  }

  // where his eyes go at phase ph done at spot s
  lookFor(ph, s) {
    switch (ph?.look) {
      case 'sweep': return s.face + Math.sin(this.world.time * 0.42 + this.seed) * 1.05;
      case 'glance': return s.face + Math.sin(this.world.time * 0.5 + this.seed) * 0.4;
      case 'back': return s.face + Math.PI;
      case 'dance': { const c = this.dancer(); return c ? Math.atan2(c.y - this.y, c.x - this.x) : s.face; }
      default: break;
    }
    if (!this.script.gaze) return s.face;
    // a doorman: his eyes on whoever comes near, a nod as he first looks at him
    const base = s.face + Math.sin(this.t * 0.5 + this.seed) * 0.25, a = this.gaze(base), on = a !== base;
    if (on && !this.eyeOn && this.nodT <= 0 && this.script.acts.nod) { this.routine.cue('nod', 0.4); this.nodT = 20; }
    this.eyeOn = on;
    return a;
  }

  // a point of his own frame (px ahead, to his right) in the world
  ahead(fwd, right = 0) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return { x: this.x + c * fwd - s * right, y: this.y + s * fwd + c * right };
  }

  // what phase ph gives off between k0 and k1 of it: its sound, a light, smoke, what flies off
  postFx(ph, k0, k1, dt) {
    const w = this.world, at = (k) => k0 < k && k1 >= k;
    const every = (s) => { if ((this.fxT -= dt) > 0) return false; this.fxT = s; return true; };
    if (ph.sound && at(ph.sound[1])) w.sound(ph.sound[0], this.x, this.y, ph.sound[2], { pitch: ph.sound[3] });
    switch (ph.fx) {
      case 'ember': if (drawn(k1) > 0.5 && every(0.1)) { const p = this.ahead(4, 2); w.light(p.x, p.y, 34, '#ff7a2a', 0.16); } break;
      case 'flame': if (every(0.08)) { const p = this.ahead(7); w.light(p.x, p.y, 20, '#ff9a40', 0.12); } break;
      case 'cloud':
        // a slow thick cloud rolled out of his mouth, in a few breaths
        for (const k of [0.05, 0.25, 0.45]) {
          if (at(k)) w.smoke?.breath(this, 'cloud');
        }
        break;
      case 'ash': if (at(0.45)) { const p = this.hand(ph); w.particles.dust(p.x, p.y, 3, 1, '#8a8a90', { speed: 5, size: 1.2, life: 1.2, alpha: 0.55 }); } break;
      case 'butt': if (at(0.5)) { const p = this.ahead(9, 3); this.dropSmoke(p.x, p.y, this.angle + rand(-0.3, 0.3), rand(90, 130), 'butt'); } break;
      case 'stream': if (k1 > 0.1 && k1 < 0.93 && every(0.55)) w.sound('splash', this.x, this.y, 0.12, { pitch: rand(1.7, 2) }); break;
      case 'tap': if (every(0.7)) w.sound('splash', this.x, this.y, 0.16, { pitch: 1.2 }); break;
      case 'can': {
        const img = spriteOpt('items/can');
        if (img && at(0.38)) {
          const p = this.ahead(8, 3.6);
          w.particles.shard(img, p.x, p.y, this.angle + rand(-0.25, 0.25), rand(150, 210), { z: 2, vz: 70, bounce: 0.45, spin: rand(-12, 12) });
          w.sound('metal', p.x, p.y, 0.35, { pitch: 1.8 });
        }
        break;
      }
      case 'stroke':
        if (at(STRIKE)) {
          const p = this.ahead(30);
          w.sound('pool', p.x, p.y, 0.8);
          w.events.emit('poolStroke', p);
        }
        break;
      case 'chip': if (at(0.5)) w.sound('clack', this.x, this.y, 0.3, { pitch: 1.5 }); break;
      case 'strike': {
        // the match takes: a flare that lights his face, a few sparks, then its small flame
        const p = this.hand(ph);
        if (at(0.42)) { w.light(p.x, p.y, 72, '#ffd27a', 0.35); w.particles.fire(p.x, p.y, 4, 26, { size: [1, 2.2], life: [0.1, 0.3], rise: 30 }); }
        else if (k1 > 0.42 && every(0.07)) w.light(p.x, p.y, rand(26, 32), '#ffa040', 0.12);
        break;
      }
      case 'match': if (every(0.07)) { const p = this.hand(ph); w.light(p.x, p.y, rand(26, 32), '#ffa040', 0.12); } break;
      case 'drop':
        if (k1 < MATCH_FALLS && every(0.07)) { const p = this.hand(ph); w.light(p.x, p.y, rand(26, 32), '#ffa040', 0.12); }
        if (at(MATCH_FALLS)) this.dropMatch(this.ahead(16, 4));
        break;
      case 'junk': if (at(TOSSED)) this.junk(); break;
      case 'cold': if (every(0.12)) { const p = this.ahead(12); w.light(p.x, p.y, 44, '#cfe6ff', 0.2); } break;
      default: break;
    }
  }

  // The end of a scarf flying behind him (KINDS `tail`: LUCKY's): hung from his nape, it trails where he comes from
  // when he moves and off one side of his back when he stands, lagging his turns and fluttering (TAIL).
  drawTail(ctx) {
    const img = spriteOpt(this.look.tail);
    if (!img) return;
    const P = this.pose, w = this.world, sp = Math.hypot(this.vel.x, this.vel.y), ha = P.ha ?? this.angle;
    const flutter = Math.sin(w.time * (TAIL.beat + sp * 3) + this.seed) * (TAIL.wave + 0.1 * Math.min(1, sp));
    const want = (sp > TAIL.moving ? Math.atan2(-this.vel.y, -this.vel.x) : ha + Math.PI + TAIL.side) + flutter;
    const dt = Math.min(0.05, w.time - (this.tailT ?? w.time));
    this.tailT = w.time;
    this.tailA = this.tailA === undefined ? want : this.tailA + angDiff(this.tailA, want) * Math.min(1, dt * TAIL.follow);
    ctx.save();
    bodyFrame(ctx, this);
    ctx.translate(Math.round(this.x + P.tx - Math.cos(ha) * TAIL.nape), Math.round(this.y + P.ty - Math.sin(ha) * TAIL.nape));
    ctx.rotate(this.tailA);
    ctx.scale(img.k || 1, img.k || 1);
    ctx.drawImage(img, 0, -img.height / 2);
    ctx.restore();
  }

  // a lit match let fall at p: the petrol catches there (systems/FireSpread.js)
  dropMatch(p) {
    this.world.particles.fire(p.x, p.y, 3, 18, { size: [1, 2], life: [0.1, 0.25], rise: 20 });
    this.world.events.emit('matchDrop', { x: p.x, y: p.y, by: this });
  }

  // something out of a drawer or the fridge thrown over his right shoulder, left lying where it lands (JUNK of them,
  // then only papers)
  junk() {
    const w = this.world, p = this.ahead(2, 7), a = this.angle + 2.2 + rand(-0.4, 0.4);
    this.tossed = (this.tossed ?? 0) + 1;
    const name = this.tossed > JUNK || this.tossed % 3 === 0 ? null : this.tossed % 3 === 1 ? 'can' : 'magazine';
    const img = name && spriteOpt(`items/${name}`);
    if (!img) {
      w.particles.floaters(p.x, p.y, FLOATS.paper, 3, a, 0.5, 70, 10);
      w.sound('flutter', p.x, p.y, 0.3);
      return;
    }
    w.particles.shard(img, p.x, p.y, a, rand(110, 160), { z: 10, vz: 60, bounce: 0.3, spin: rand(-10, 10) });
    w.after(0.35, () => w.sound(name === 'can' ? 'metal' : 'drop', p.x, p.y, 0.3, { pitch: name === 'can' ? 1.8 : 1.3 }));
  }

  // his right hand at phase ph, in the world
  hand(ph) {
    const h = this.gestureHands(ph);
    return h ? this.ahead(h.hr.x, h.hr.y) : this.ahead(6, 5);
  }

  // a cigarette end (or a cigar) flying off and smoking a while where it lands
  dropSmoke(x, y, a, speed, name) {
    const w = this.world, img = spriteOpt(`items/${name}`);
    if (!img) return;
    w.particles.shard(img, x, y, a, speed, { z: 8, vz: 40, bounce: 0, spin: rand(-8, 8), onLand: (p) => {
      p.life = 0;
      w.decals.bake(img, p.x, p.y, p.rot);
      w.emit(p.x, p.y, rand(4, 7), (e, dt) => w.smoke?.wisp(e, e.x, e.y - 1, dt)); // it smoulders a while
    } });
  }

  // it kicks off: what was in his hands falls (data/posts.js HELD)
  dropHeld() {
    const name = this.holding, it = HELD[name], w = this.world, a = this.angle, p = this.ahead(7, 3);
    this.holding = null;
    if (!it) return;
    switch (it.drop) {
      case 'glass':
        w.particles.glass(p.x, p.y, a, 2.5, 5, 80);
        w.sound('glass', p.x, p.y, 0.4, { pitch: 1.3 });
        w.events.emit('spill', { x: p.x, y: p.y, kind: 'booze', area: it.spill ?? 70, dur: 1 });
        break;
      case 'butt':
        if (chance(it.keep ?? 0)) this.mouth = true;
        else this.dropSmoke(p.x, p.y, a + rand(-1.2, 1.2), rand(20, 50), name === 'cigar' ? 'cigar' : 'butt');
        break;
      case 'magazine': {
        const img = spriteOpt('items/magazine');
        if (img) w.particles.shard(img, p.x, p.y, a + rand(-0.6, 0.6), rand(30, 60), { z: 5, vz: 10, spin: rand(-3, 3), bounce: 0 });
        break;
      }
      case 'paper': case 'cash': w.particles.floaters(p.x, p.y, FLOATS[it.drop], it.n, a, 1.4, 50, 8); break;
      case 'powder': w.particles.dust(p.x, p.y, 4, 3, '#f2f2ec', { alpha: 0.3 }); break;
      case 'match': this.dropMatch(this.ahead(12, 3)); break;
      case 'box': w.sound('drop', p.x, p.y, 0.2, { pitch: 2.2 }); break;
      default: break;
    }
  }

  // what a bored guard does at his post: his pastime if he has one; else a word with a colleague, a leak, a
  // cigarette, his pager, a stretch, a look at his watch, arms folded; or (the only ones left once the squad is
  // on edge) watch, scan, look behind
  pickActivity() {
    const calm = this.director.phase === 'normal', r = Math.random(), q = Math.random();
    const set = (activity, t, face = this.idleFace) => { this.activity = activity; this.activityT = t; this.idleFace = face; };
    this.actT = 0; this.errand = null; this.errandT = 0;
    if (this.routine) { this.routine.act = null; this.routine.cued = null; this.workSpot = null; this.onSpot = false; }
    if (calm && this.job && (this.script?.stay || chance(0.8))) { set(this.job, rand(8, 14), this.home.angle); return; }
    if (calm) {
      const mate = this.chatCd <= 0 && this.findMate(AI.chat.near);
      if (mate) { this.chatWith(mate); return; }
      const spot = r < AI.relief.odds && this.reliefCd <= 0 && reliefSpot(this.world.map, this.world.props, this.x, this.y);
      if (spot) {
        this.errand = spot;
        this.reliefCd = rand(...AI.relief.every);
        set('piss', rand(...AI.relief.time), spot.face);
        return;
      }
      const ahead = this.home.angle + rand(-0.6, 0.6);
      // about half the time something to do with his hands, the other half his job: watching
      const u = r - AI.relief.odds;
      if (u >= 0 && u < 0.12) { set('smoke', rand(6, 10), ahead); return; }
      if (u >= 0 && u < 0.19) { set('phone', rand(4, 7), ahead); return; }
      if (u >= 0 && u < 0.26) { set('stretch', STRETCH); return; }
      if (u >= 0 && u < 0.33) { set('wrist', STRETCH); return; }
      if (u >= 0 && u < 0.45) { set('cross', rand(4, 8)); return; }
    }
    if (q < 0.25) { set('turn', rand(1.5, 2.6)); this.turnTo = this.home.angle + rand(2.3, 4); }
    else if (q < 0.55) set('scan', rand(3, 5));
    else set('watch', rand(3, 6));
  }

  // calm, on his feet, at his post or on his round, with nothing going on
  get idle() {
    return this.aware === 0 && this.knocked <= 0 && !this.held && !this.passive
      && (this.state === S.PATROL || (this.state === S.IDLE && this.atPost))
      && this.activity !== this.job && this.activity !== 'chat' && this.activity !== 'piss';
  }

  // a colleague within `reach` px, in sight, who has a minute
  findMate(reach) {
    for (const e of this.world.enemies) {
      if (e === this || !e.alive || e.chatCd > 0 || !e.idle) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > 20 && d < reach && this.world.lineOfSight(this.x, this.y, e.x, e.y)) return e;
    }
    return null;
  }

  // stop for a word: both turn to each other and talk turn about, until the time is up or one is called away
  chatWith(mate) {
    const t = rand(...AI.chat.time), first = chance(0.5) ? 0 : 1;
    this.joinChat(mate, t, first);
    mate.joinChat(this, t, 1 - first);
  }

  joinChat(mate, t, turn) {
    this.mate = mate; this.turn = turn; this.spoke = false;
    this.activity = 'chat'; this.actT = 0; this.errand = null;
    this.chatCd = t + rand(...AI.chat.every);
    this.idleFace = Math.atan2(mate.y - this.y, mate.x - this.x);
    if (this.state === S.PATROL) this.pauseT = t; else this.activityT = t;
  }

  // upkeep of what he is at: a chat (facing the other, a line when his turn comes, over as soon as the other is
  // called away), a leak (it runs down the wall onto the floor)
  easeTick(dt) {
    if (this.activity === 'chat') {
      const m = this.mate;
      if (!m || !m.alive || m.mate !== this || m.activity !== 'chat' || !m.distracted) {
        this.mate = null;
        this.activity = 'watch';
        if (this.state === S.PATROL) this.pauseT = Math.min(this.pauseT, 0.6); else this.activityT = Math.min(this.activityT, 0.6);
        return;
      }
      this.idleFace = Math.atan2(m.y - this.y, m.x - this.x);
      const mine = talks(this.world.time, this.turn);
      if (mine && !this.spoke && chance(AI.chat.line)) this.say('chat');
      this.spoke = mine;
    } else if (this.errand?.wall && this.pouring && (this.dripT -= dt) <= 0) {
      this.dripT = 0.5;
      this.world.events.emit('spill', { x: this.x + Math.cos(this.angle) * 12, y: this.y + Math.sin(this.angle) * 12, kind: 'water', area: 12 });
    }
  }

  doPatrol(dt) {
    const calm = this.director.phase === 'normal';
    if (this.pauseT > 0) {
      if (this.routine && this.activity === this.job) {
        if (calm) this.work(dt); else { this.pauseT = 0; this.routine.act = null; }
        return;
      }
      this.pauseT -= dt;
      this.actT += dt;
      this.halt();
      this.easeTick(dt);
      if (this.distracted) this.faceAngle(this.idleFace, 2, dt);
      else this.sweep(dt, this.lookBase, 1, 1.8);
      return;
    }
    this.activity = 'walk';
    // walking past a colleague who has a minute: stop for a word
    if (calm && this.chatCd <= 0 && (this.chatScan -= dt) <= 0) {
      this.chatScan = 0.5;
      const mate = this.findMate(AI.chat.pass);
      if (mate) { this.chatWith(mate); return; }
    }
    if (!this.goal) this.goal = this.route ? this.route[this.routeIdx] : randomPoint(this.world.map, this.home.x, this.home.y, 7);
    if (!this.goal) { this.pauseT = 1; return; }
    if (this.travel(dt, this.goal.x, this.goal.y, ENEMY.walkSpeed * (calm ? 1 : 1.25), { doors: true, glance: true })) {
      this.goal = null;
      if (this.route) this.routeIdx = (this.routeIdx + 1) % this.route.length;
      this.pauseT = rand(0.8, 2.4);
      this.lookBase = this.angle;
      if (calm && this.routine && chance(0.6)) {
        // a halt at what his job does on his round (data/posts.js)
        const R = this.routine, name = R.pick((n) => this.canPlay(n));
        if (name) {
          this.activity = this.job; this.pauseT = Infinity;
          R.begin(name);
          this.startPhase();
        }
      } else if (calm && chance(0.3)) {
        // a longer halt: a cigarette, his pager, a stretch, a look at his watch
        const k = PAUSES[Math.floor(rand(0, PAUSES.length))];
        this.activity = k; this.actT = 0;
        this.pauseT = ABSORBING.has(k) ? rand(4, 7) : STRETCH;
        this.idleFace = this.angle + rand(-0.8, 0.8);
      }
    }
  }

  doReturn(dt) {
    if (this.roam) {
      if (this.route) {
        let bi = 0, bd = Infinity;
        this.route.forEach((p, i) => { const d = Math.hypot(p.x - this.x, p.y - this.y); if (d < bd) { bd = d; bi = i; } });
        this.routeIdx = bi;
      }
      this.setState(S.PATROL);
      this.pauseT = rand(0.5, 1.5);
      return;
    }
    const h = this.home;
    if (this.travel(dt, h.x, h.y, ENEMY.walkSpeed * 1.1, { doors: true, glance: true })) {
      this.setState(S.IDLE);
      this.activity = 'watch';
      this.activityT = rand(2, 4);
    }
  }

  // ---------------- suspicious behaviours ----------------
  // the tell: freeze and turn toward what caught his attention before doing anything
  doSuspicious(dt) {
    this.halt();
    this.faceTo(this.stim.x, this.stim.y, 4.5, dt);
    this.target = this.stim;
    if (this.t < this.susT) return;
    if (this.meter >= 0.15 || this.urgent) this.investigate(this.stim.x, this.stim.y, this.stim.kind, this.urgent);
    else this.calm();
  }

  doInvestigate(dt) {
    const st = this.stim;
    if (this.sub === '') {
      const speed = this.urgent ? ENEMY.runSpeed * 0.8 : ENEMY.walkSpeed * 1.2;
      if (this.travel(dt, st.x, st.y, speed, { doors: !this.urgent, near: 14, glance: !this.urgent }) || this.blockedAt(dt, st.x, st.y)) {
        this.sub = 'look'; this.t = 0; this.lookT = rand(1.6, 2.6); this.lookBase = this.angle;
      }
      return;
    }
    this.halt();
    this.sweep(dt, this.lookBase, 1.3);
    if (this.t < this.lookT) return;
    if (this.urgent || this.director.phase !== 'normal') this.beginLocalSearch(st.x, st.y, 2);
    else this.calm();
  }

  // crouch over a body / wake a mate / look at the damage, then call it in
  doCheck(dt) {
    const c = this.checkTarget, f = c.friend;
    if (f && (!f.alive || f.knocked <= 0)) { this.beginLocalSearch(this.x, this.y, 1); return; }
    const x = f ? f.x : c.x, y = f ? f.y : c.y;
    const kneel = !!f || c.kind === 'body';
    if (this.sub === '') {
      if (this.travel(dt, x, y, ENEMY.walkSpeed * 1.7, { near: kneel ? 18 : 40 })) {
        this.sub = 'look'; this.t = 0; this.lookBase = Math.atan2(y - this.y, x - this.x);
      }
      return;
    }
    this.halt();
    this.kneel = kneel;
    if (this.t < 0.5) this.faceTo(x, y, 4, dt);
    else this.sweep(dt, this.lookBase + Math.PI, 1.6);
    if (this.t < (kneel ? 1.4 : 1.8)) return;
    if (f) { f.knocked = Math.min(f.knocked, 0.2); this.say('wake', { N: f.nick }); }
    else if (c.kind === 'body') { if (!this.say(c.who?.boss && !c.who.traits ? 'chief' : 'found', { N: c.who?.nick })) this.say('body'); }
    else this.say(c.kind === 'missing' ? 'missing' : 'damage');
    this.director.callIn(this, x, y);
    this.beginLocalSearch(x, y, 2);
  }

  doSearch(dt) {
    if (this.sub === '' && !this.armed && this.lookForWeapon()) return;
    if (!this.searchPt) {
      this.searchPt = this.localPts ? this.localPts.shift() : this.director.nextSearchPoint(this);
      if (!this.searchPt) {
        const lk = this.director.lastKnown;
        if (!this.localPts && this.director.phase === 'evasion' && lk) this.guard(lk.x, lk.y);
        else this.calm();
        return;
      }
      this.sub = 'go';
      // off to another room: he says which ("CHECK THE STOREROOM!")
      if (this.director.phase !== 'normal' && chance(0.35)) {
        const there = this.director.placeAt(this.searchPt.x, this.searchPt.y);
        if (there && there.key !== this.director.placeAt(this.x, this.y)?.key) this.say('sweep', { P: there.the });
      }
    }
    const pt = this.searchPt;
    const hurry = this.director.phase === 'evasion' || this.director.phase === 'alert';
    if (this.sub === 'go') {
      if (this.travel(dt, pt.x, pt.y, hurry ? ENEMY.runSpeed * 0.7 : ENEMY.walkSpeed * 1.3, { doors: !hurry, near: 12, glance: true })) {
        this.sub = 'look'; this.t = 0; this.lookT = rand(1.3, 2.2); this.lookBase = pt.origin ? this.angle : pt.look;
        if (hurry && chance(0.3)) this.say('search');
      }
      return;
    }
    this.halt();
    this.sweep(dt, this.lookBase, 1.4);
    if (this.t > this.lookT) { pt.done = true; this.searchPt = null; this.sub = 'go'; }
  }

  // walk the footprints one hop at a time, then go and look where they were heading
  doTrack(dt) {
    const d = this.director, at = this.trackAt, hurry = d.phase !== 'normal';
    const speed = hurry ? ENEMY.runSpeed * 0.7 : ENEMY.walkSpeed * 1.3;
    if (!this.travel(dt, at.x, at.y, speed, { near: 12, glance: true }) && !this.blockedAt(dt, at.x, at.y)) return;
    this.nearT = 0;
    d.trail.close(at);
    const next = d.trail.next(at);
    if (next) { this.trackAt = next; return; }
    const x = at.x + Math.cos(at.angle) * AI.trail.ahead, y = at.y + Math.sin(at.angle) * AI.trail.ahead;
    const open = this.world.lineOfSight(at.x, at.y, x, y);
    this.investigate(open ? x : at.x, open ? y : at.y, 'tracks', hurry || at.kind === 'blood');
  }

  // hold a position and watch a spot (guards beyond the hunters' quota)
  doGuard(dt) {
    this.halt();
    const g = this.guardPt;
    this.target = g;
    this.sweep(dt, Math.atan2(g.y - this.y, g.x - this.x), 0.6);
    if (this.t > this.guardT && this.director.phase !== 'alert') this.calm();
  }

  // groggy after a knock-down: staggers, half blind
  doDizzy(dt) {
    const wob = Math.sin(this.world.time * 7 + this.seed);
    this.angle += wob * dt * 2.5;
    const a = this.angle + wob * 1.6;
    this.steer(Math.cos(a), Math.sin(a), 0.35, 0.05);
    if (this.t < this.dizzyT) return;
    if (!this.armed && this.lookForWeapon()) return;
    if (this.sees) { this.meter = 1; this.spot(false); return; }
    this.director.raise();
    this.beginLocalSearch(this.x, this.y, 2);
  }

  // curses thrown into the dark while hunting him down (not before he has given himself away)
  taunt(dt) {
    if ((this.tauntT -= dt) > 0) return;
    this.tauntT = rand(...AI.tauntGap);
    const d = this.director;
    if (d.provoked && (d.phase === 'alert' || d.phase === 'evasion') && chance(0.6)) this.say('taunt');
  }

  // after him to where he was last seen; where a mate just fell, carefully: a brisk walk, weapon up on that spot
  doHunt(dt) {
    const lk = this.lastKnown;
    if (!lk) { this.beginSearch(); return; }
    const wary = this.director.wary(lk.x, lk.y) && Math.hypot(lk.x - this.x, lk.y - this.y) < AI.wary.r * 1.5;
    const speed = wary ? ENEMY.walkSpeed * AI.wary.pace : ENEMY.runSpeed * 0.85 * this.pace;
    if (this.travel(dt, lk.x, lk.y, speed, { near: 20, look: !wary })) { this.beginSearch(); return; }
    if (wary) this.aimAt(lk.x, lk.y, dt, 0.7);
  }

  // ---------------- combat ----------------
  doCombat(dt) {
    const p = this.world.player;
    if (!p.alive) { this.halt(); return; }
    // the last man standing, face to face with the armed killer of all the others, or a man on his own with nothing
    // left to fight with: he may lose his nerve
    if (this.react <= 0 && this.loseNerve(dt)) return;
    this.suppressCD -= dt; this.dodgeCD -= dt; this.stalkCD -= dt; this.standT -= dt;
    if (this.sees) {
      // re-acquiring after losing sight takes a moment, and the aim has to settle again
      if (this.lostT > 0.4) { this.react = Math.max(this.react, rand(...ENEMY.reacquire)); this.settle *= 0.4; }
      this.lostT = 0;
      this.react -= dt;
      if (this.react <= 0) this.settle = Math.min(1, this.settle + dt / ENEMY.aimSettle);
      this.ambushed = false;
    } else this.lostT += dt;
    if (this.shoutT > 0 && (this.shoutT -= dt) <= 0 && this.callOut()) return;
    // curses: at the man in his sights, or at the corner he vanished behind
    if ((this.tauntT -= dt) <= 0) {
      this.tauntT = rand(...AI.tauntGap);
      if (this.panicT <= 0) this.say(this.sees ? (this.def.kind === 'gun' ? 'threat' : 'brawl') : this.lostT > 1.2 ? 'flush' : 'hunt');
    }
    if ((this.thinkT -= dt) <= 0) { this.thinkT = rand(0.3, 0.5); this.plan(p); }
    this.target = this.sees ? p : this.lastKnown;
    switch (this.tactic) {
      case 'rush': this.tRush(dt, p); break;
      case 'stalk': this.tStalk(dt, p); break;
      case 'hold': this.tHold(dt, p); break;
      case 'advance': this.tAdvance(dt, p); break;
      case 'backoff': this.tBackoff(dt, p); break;
      case 'cover': this.tCover(dt, p); break;
      case 'ambush': this.tAmbush(dt, p); break;
      case 'flank': this.tFlank(dt, p); break;
      case 'hunt': this.doHunt(dt); break;
      case 'suppress': this.tSuppress(dt); break;
      case 'reload': this.tReload(dt); break;
      case 'panic': this.tPanic(dt, p); break;
      default: this.halt(); if (this.sees) this.aimAt(p.x, p.y, dt);
    }
  }

  // The last man standing gives up: weapon thrown down, on his knees, hands up. He is out of the fight for good
  // (the world counts him out: 'surrender' clears the level) and it is the player's call to kill him anyway.
  surrender() {
    this.reloading = 0;
    this.dropWeapon(this.angle + rand(-0.5, 0.5), 2.5);
    this.setState(S.YIELD);
    this.yielded = true;
    this.shaken = false;
    this.sees = false;
    this.begT = rand(...AI.surrender.beg);
    this.barkT = 0;
    this.say('yield');
    this.world.sound('whimper', this.x, this.y, 1, { pitch: this.voice });
    this.world.events.emit('surrender', { who: this });
  }

  // gives up on the spot: the last man standing who was shaken, or (ai/Squad.js yieldOdds, a roll every few s) a
  // man on his own with no weapon or no rounds left, the armed player close in front of him. True if he did.
  loseNerve(dt) {
    const p = this.world.player, R = AI.surrender;
    if (!this.sees || !p.armed || this.world.tutorial) return false; // nobody gives up in the lesson
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.shaken && dist < R.range) { this.surrender(); return true; }
    if ((this.nerveT -= dt) > 0) return false;
    this.nerveT = R.every;
    const w = this.weapon, dry = !!w && this.def.kind === 'gun' && w.mag <= 0 && this.reloading <= 0 && this.reserveCount() <= 0;
    const odds = yieldOdds(this.kind, {
      unarmed: !w || dry, alone: !this.director.engagedNear(this, R.alone), playerArmed: p.armed, dist, boss: this.boss,
    });
    if (!chance(odds)) return false;
    this.surrender();
    return true;
  }

  // On his knees: he begs while the player stands over him. Once the player has had his back to him a moment, and
  // a loaded gun lies at hand, he may get up and go for it (ai/Squad.js; never once the level is cleared).
  updateYield(dt) {
    const p = this.world.player, w = this.world, R = AI.surrender;
    this.halt();
    this.crouch = Math.min(1, this.crouch + dt * 5);
    if (!p.alive) return;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    const seen = d <= ENEMY.viewDist && w.lineOfSight(this.x, this.y, p.x, p.y);
    if (!w.cleared && !w.tutorial) {
      this.turnT = turnedAway(p, this, seen) ? this.turnT + dt : 0;
      if (this.turnT > R.wait && (this.nerveT -= dt) <= 0) {
        this.nerveT = 1;
        const gun = chance(R.treachery[this.kind] ?? 0) && gunAtHand(w.items, this);
        if (gun) { this.betray(gun); return; }
      }
    }
    if (!seen) return;
    this.faceAngle(Math.atan2(dy, dx), 4, dt);
    if (d < AI.surrender.range && (this.begT -= dt) <= 0) {
      this.begT = rand(...AI.surrender.beg);
      this.barkT = 0;
      if (this.say('beg')) this.world.sound('whimper', this.x, this.y, 0.8, { pitch: this.voice });
    }
  }

  // up off his knees, quiet, for the gun lying at hand; back in the fight (and counted again) once he is up
  betray(gun) {
    const p = this.world.player;
    this.yielded = false;
    this.turncoat = true;
    this.setState(S.FETCH);
    this.fetchTarget = gun;
    this.lastKnown = { x: p.x, y: p.y };
    this.react = 0.4;
  }

  // "contact!" a moment after spotting him: the squad around is sent in (a mate called by name), then, if that left
  // him on his own or outgunned, he may run for the others instead (true: he is off)
  callOut() {
    const sent = this.director.shout(this);
    this.barkT = 0; // the call cuts short whatever he was saying
    if (!(sent.length && chance(0.6) && this.say('call', { N: this.director.nickOf(sent[0]) }))) this.say('contact');
    return this.goForBackup(sent);
  }

  // one roll per guard: alone (the shout reached nobody, nobody of his fighting near) or outgunned, he may go and
  // fetch the free guards of another room (ai/Squad.js) rather than take the player on by himself; one at a time
  goForBackup(sent) {
    const p = this.world.player, d = this.director, w = this.world;
    if (this.fetched || this.boss || w.tutorial || !p.alive) return false;
    if (w.enemies.some((o) => o.alive && o.state === S.BACKUP)) return false; // one man runs, the others fight
    const alone = !sent.length && !d.engagedNear(this, AI.shoutRadius);
    const outgunned = p.def.kind === 'gun' && this.def.kind !== 'gun';
    if (!alone && !outgunned) return false;
    this.fetched = true;
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    if (!chance(backupOdds(this.kind, { alone, outgunned, dist, boss: this.boss }))) return false;
    const g = backupGroup(w.enemies, this);
    if (!g) return false;
    this.setState(S.BACKUP);
    this.backupAt = { x: g.to.x, y: g.to.y, to: g.to };
    this.lastKnown = { x: p.x, y: p.y };
    this.showIcon('!', 1);
    return true;
  }

  // Running for help: off to the others (saying so once his breath allows); the player on top of him = he turns and
  // fights. There, he sends the free men around in (one of them answers) and goes back with them.
  doBackup(dt) {
    const p = this.world.player, B = AI.backup, at = this.backupAt, d = this.director;
    if (!p.alive || this.t > B.give || (this.sees && Math.hypot(p.x - this.x, p.y - this.y) < B.near * 0.7)) {
      this.setState(S.COMBAT);
      this.thinkT = 0;
      return;
    }
    if (this.sub === '' && this.t > 0.5 && (this.say('run') || this.t > 3)) this.sub = 'run';
    // the man he runs to may have got up and moved: he goes where he is now
    if (at.to.alive && !at.to.yielded && at.to.knocked <= 0) { at.x = at.to.x; at.y = at.to.y; }
    if (!this.travel(dt, at.x, at.y, ENEMY.runSpeed * 1.05, { near: 40, look: false }) && !this.blockedAt(dt, at.x, at.y)) return;
    const lk = this.lastKnown ?? d.lastKnown ?? { x: p.x, y: p.y };
    const men = recruits(this.world.enemies, this, this.x, this.y);
    if (men.length) {
      const first = men[0];
      this.barkT = 0;
      this.say('backup', { N: d.nickOf(first) });
      for (const e of men) e.joinHunt(lk.x, lk.y);
      first.barkT = 0;
      first.rallyT = 0.7;
    }
    this.setState(S.HUNT);
    this.lastKnown = lk;
  }

  setTactic(t) {
    if (t === this.tactic) return;
    this.tactic = t;
    this.sub = ''; this.t = 0;
    this.path = null; this.dest = null; this.repath = 0; this.goal = null;
    if (t !== 'cover' && t !== 'ambush' && t !== 'stalk') { this.cover = null; this.director.release(this); }
  }

  // pick a tactic (every 0.3-0.5 s): weapon state first, then distance and squad role
  plan(p) {
    const dist = Math.hypot(p.x - this.x, p.y - this.y), prev = this.tactic;
    if (this.standT > 0 && this.def.kind === 'gun' && this.weapon.mag > 0) return this.setTactic('hold');
    if (this.def.kind === 'gun' && this.weapon.mag <= 0 && this.reloading <= 0 && this.reserveCount() <= 0) {
      // dry: hurl the empty gun at him (or drop it) and go on with fists
      this.dropWeapon(this.sees ? Math.atan2(p.y - this.y, p.x - this.x) : this.angle + rand(-1, 1), this.sees ? 6 : 2);
      this.say('dry');
    }
    if (!this.armed) {
      if (this.sees && dist < 90) return this.setTactic('rush');
      if (this.lookForWeapon() || this.fleeToFriend()) return;
      return this.setTactic(this.sees ? 'rush' : 'hunt');
    }
    if (this.panicT > 0) return this.setTactic('panic');
    if (this.def.kind === 'melee') return this.planMelee(p, dist);
    if (this.reloading > 0 || this.needsReload()) return this.setTactic('reload');
    if (this.sees && this.meleeThreat(p, dist)) return this.setTactic('backoff');
    const shotgun = this.weapon.type === 'shotgun';
    if (!this.sees) {
      if ((prev === 'flank' && this.goal) || ((prev === 'cover' || prev === 'ambush') && this.lostT < 2.5) || (prev === 'suppress' && this.burstLeft > 0)) return;
      if (prev === 'ambush' && this.ambushT > 0) return;
      // shotguns hold a corner near where he vanished instead of chasing him
      if (shotgun && this.lostT > 0.4 && !this.ambushed && this.lastKnown && this.planCover(this.lastKnown, 70, 4, true)) {
        this.setTactic('ambush');
        this.ambushed = true;
        this.ambushT = rand(4, 7);
        return;
      }
      if (!shotgun && this.lostT > 0.5 && this.lostT < 3 && this.suppressCD <= 0 && this.canSuppress()) {
        this.setTactic('suppress');
        this.burstLeft = this.def.burst ? 3 : 2;
        return;
      }
      if (this.lostT > 0.4) {
        if (this.director.wantsFlank(this) && this.planFlank()) return;
        this.setTactic('hunt');
      }
      return;
    }
    const [rMin, rMax] = RANGES[this.weapon.type] ?? [100, 220];
    if (!shotgun) {
      if (prev === 'cover' && this.cover && isCovered(this.world, this.cover.x, this.cover.y, p.x, p.y) && this.volleys < 3) return;
      if (this.world.time > this.coverT && this.planCover(p, (rMin + rMax) / 2, 5, false)) {
        this.coverT = this.world.time + 1.2;
        this.setTactic('cover');
        this.volleys = 0;
        return;
      }
    }
    if (dist > rMax) return this.setTactic('advance');
    if (dist < rMin) return this.setTactic('backoff');
    if (prev === 'hold' && chance(0.2) && this.director.wantsFlank(this) && this.planFlank()) return;
    this.setTactic('hold');
  }

  // melee: rush, but get closer from cover to cover while a gun is pointed at us from afar
  planMelee(p, dist) {
    if (!this.sees) return this.setTactic(this.lostT < 0.6 ? 'rush' : 'hunt');
    if (this.tactic === 'stalk' && this.cover) return;
    const aimed = p.def.kind === 'gun' && Math.abs(angDiff(p.angle, Math.atan2(this.y - p.y, this.x - p.x))) < 0.35;
    if (aimed && dist > 150 && this.stalkCD <= 0 && this.planCover(p, 60, 4, true)) {
      this.setTactic('stalk');
      this.hideT = 0;
      return;
    }
    this.setTactic('rush');
  }

  // a cover spot (hidden from the threat, with a peek cell) claimed for this guard; false when none / no budget
  planCover(threat, prefDist, radius, approach) {
    const d = this.director;
    if (!d.budget(3)) return false;
    // a table to tip over in front of a spot is worth a detour; he does it once there (tCover)
    const tables = approach ? [] : this.world.props.filter((p) => p.def.flips && !p.dead);
    const flip = (x, y) => tableToFlip(tables, x, y, threat.x, threat.y, AI.flip.reach);
    const c = findCover(this.world, this, threat.x, threat.y, prefDist, (x, y) => d.isClaimed(x, y, this), radius, approach,
      tables.length ? (x, y) => (flip(x, y) ? AI.flip.pull : 0) : null);
    if (!c) return false;
    if (tables.length) c.flip = flip(c.x, c.y);
    this.cover = c;
    d.claim(this, c.x, c.y);
    return true;
  }

  planFlank() {
    const lk = this.lastKnown;
    if (!lk || !this.director.budget(3)) return false;
    const f = findFlank(this.world, this, lk.x, lk.y, this.director.coverage(lk, this), (RANGES[this.weapon?.type]?.[1] ?? 200) * 0.75);
    if (!f) return false;
    this.setTactic('flank');
    this.goal = f;
    this.director.claim(this, f.x, f.y);
    return true;
  }

  // melee rush: weaving, dodging sideways when a gun points at us
  tRush(dt, p) {
    const d = this.def, dx = p.x - this.x, dy = p.y - this.y, dist = Math.hypot(dx, dy);
    if (!this.sees) {
      const lk = this.lastKnown || p;
      this.travel(dt, lk.x, lk.y, ENEMY.runSpeed * this.pace, { near: 16 });
      return;
    }
    this.aimAt(p.x, p.y, dt, 1.4);
    const aimed = p.def.kind === 'gun' && dist > 40 && Math.abs(angDiff(p.angle, Math.atan2(-dy, -dx))) < 0.25;
    if (aimed && this.dodgeCD <= 0) { this.dodge = chance(0.5) ? 0.28 : -0.28; this.dodgeCD = rand(0.9, 1.6); }
    const side = this.dodge !== 0 ? Math.sign(this.dodge) * 1.6 : Math.sin(this.world.time * 4 + this.seed) * 0.35;
    if (this.dodge !== 0) this.dodge = Math.sign(this.dodge) * Math.max(0, Math.abs(this.dodge) - dt) || 0;
    const ux = dx / (dist || 1), uy = dy / (dist || 1);
    // straight at him while the way is open; held up there (a mate in a doorway) he takes the path, which goes round
    const sp = ENEMY.runSpeed * this.pace;
    this.rushHeld = this.moving < sp * 0.25 && dist > 40 ? this.rushHeld + dt : Math.max(0, this.rushHeld - dt);
    if (this.rushHeld < 0.6 && this.world.map.walkLine(this.x, this.y, p.x, p.y, 6)) {
      const gw = this.giveWay(ux, uy);
      const k = dist < 50 ? 0 : 1, planted = this.tell > 0 ? TELL.pace : 1; // winding up, he plants his feet
      this.steer(ux - uy * side * k + gw.x, uy + ux * side * k + gw.y, sp * gw.slow * planted * (this.dodge ? 1.25 : 1), 0.3);
    } else if (this.travel(dt, p.x, p.y, ENEMY.runSpeed * this.pace, { look: false, near: 4 }) && dist > 30 && this.jamTries < AI.nav.jam.tries) {
      // no way round on foot (he stands behind a counter, on a roof edge): straight at him, over what is in the way
      if (!this.tryVault(Math.atan2(dy, dx))) this.steer(ux, uy, ENEMY.runSpeed * this.pace, 0.3);
    }
    // in reach (or about to be): he winds his blow up, it comes a moment later (Character.windUp)
    if (dist < d.range + p.radius + TELL.reach && this.react <= 0) this.windUp();
  }

  // melee: sprint to the next cover closer to him, catch breath a beat, then go again
  tStalk(dt, p) {
    const c = this.cover;
    if (!c || this.t > 3) { this.stalkCD = 1.5; this.thinkT = 0; this.setTactic('rush'); return; }
    if (this.travel(dt, c.x, c.y, ENEMY.runSpeed * this.pace, { near: 8 })) {
      this.halt();
      this.kneel = true;
      if (this.sees) this.aimAt(p.x, p.y, dt);
      if ((this.hideT += dt) > 0.5) { this.hideT = 0; this.stalkCD = rand(1.2, 2.2); this.thinkT = 0; this.setTactic('rush'); }
    }
  }

  tHold(dt, p) {
    if ((this.strafeT -= dt) <= 0) { this.strafeT = rand(1.2, 2.6); this.strafe = chance(0.5) ? 0 : chance(0.5) ? 0.5 : -0.5; }
    if (this.strafe) {
      const a = Math.atan2(p.y - this.y, p.x - this.x) + Math.PI / 2 * Math.sign(this.strafe);
      this.steer(Math.cos(a), Math.sin(a), ENEMY.walkSpeed * 0.9, 0.12);
      this.strafe = Math.sign(this.strafe) * Math.max(0, Math.abs(this.strafe) - dt) || 0;
    } else this.halt();
    if (this.sees) { this.aimAt(p.x, p.y, dt); this.tryFire(p); }
  }

  tAdvance(dt, p) {
    const shotgun = this.weapon.type === 'shotgun';
    this.travel(dt, p.x, p.y, ENEMY.runSpeed * (shotgun ? 0.75 : 0.6), { look: !this.sees, near: 30 });
    if (this.sees) { this.aimAt(p.x, p.y, dt); this.tryFire(p); }
  }

  // keep distance, especially from a player charging with a melee weapon
  tBackoff(dt, p) {
    const dx = this.x - p.x, dy = this.y - p.y, d = Math.hypot(dx, dy) || 1;
    const sep = this.separation();
    let ax = dx / d, ay = dy / d;
    if (this.moving < 0.4 && this.t > 0.3) { const s = this.seed > 50 ? 1 : -1; ax = -dy / d * s + ax * 0.3; ay = dx / d * s + ay * 0.3; }
    this.steer(ax + sep.x, ay + sep.y, ENEMY.walkSpeed * 1.7, 0.15);
    if (this.sees) { this.aimAt(p.x, p.y, dt); this.tryFire(p); }
  }

  // run to cover, duck, peek out to fire a volley, duck back
  tCover(dt, p) {
    const c = this.cover;
    if (!c) { this.thinkT = 0; this.halt(); return; }
    const lk = this.sees ? p : this.lastKnown || p;
    if (this.sub === '') {
      const arrived = this.travel(dt, c.x, c.y, ENEMY.runSpeed * 0.95, { look: false, near: 6 });
      this.aimAt(lk.x, lk.y, dt);
      if (arrived) {
        this.sub = c.flip && Math.hypot(c.x - this.x, c.y - this.y) < 16 ? 'flip' : 'hide';
        this.t = 0; this.hideT = rand(0.6, 1.2);
      }
      return;
    }
    if (this.sub === 'flip') {
      // a step up to the table in front of his spot and over it goes, its top toward the threat; then back behind it
      const f = c.flip, F = AI.flip;
      const dx = f ? f.x - this.x : 0, dy = f ? f.y - this.y : 0, d = Math.hypot(dx, dy);
      if (f && !f.prop.dead && d > F.near && this.t < F.time) {
        this.steer(dx, dy, ENEMY.runSpeed * 0.8);
        this.faceAngle(f.a, ENEMY.turnRate, dt);
        return;
      }
      if (f && d < F.near * 3) f.prop.flip(f.a);
      c.flip = null;
      this.sub = 'hide'; this.t = 0;
      return;
    }
    if (this.sub === 'hide') {
      this.travel(dt, c.x, c.y, ENEMY.walkSpeed * 1.4, { look: false, near: 5 });
      this.kneel = true;
      this.aimAt(lk.x, lk.y, dt, 0.6);
      if (this.t > this.hideT && !(this.reloading > 0)) { this.sub = 'peek'; this.t = 0; this.shots = 0; }
      return;
    }
    this.travel(dt, c.peek.x, c.peek.y, ENEMY.walkSpeed * 1.5, { look: false, near: 5 });
    this.aimAt(lk.x, lk.y, dt);
    if (this.sees && this.tryFire(p)) this.shots++;
    const done = this.def.burst ? this.shots > 0 && this.burst === 0 : this.shots >= 2;
    if (done || this.t > 1.8) {
      this.sub = 'hide'; this.t = 0; this.hideT = rand(0.8, 1.6);
      this.volleys++;
      if (this.needsReload()) this.thinkT = 0;
    }
  }

  // shotgun: crouch behind a corner, gun on the way he will come through
  tAmbush(dt, p) {
    const c = this.cover;
    this.ambushT -= dt;
    if (!c || this.ambushT <= 0) { this.thinkT = 0; this.setTactic('hunt'); return; }
    const lk = this.sees ? p : this.lastKnown || p;
    if (this.sub === '') {
      if (this.travel(dt, c.x, c.y, ENEMY.runSpeed * 0.8, { near: 6 })) this.sub = 'wait';
      return;
    }
    this.halt();
    this.kneel = true;
    this.aimAt(c.peek.x + (lk.x - c.peek.x) * 0.5, c.peek.y + (lk.y - c.peek.y) * 0.5, dt, 0.8);
    if (this.sees) { this.aimAt(p.x, p.y, dt); this.tryFire(p); }
  }

  tFlank(dt, p) {
    const g = this.goal;
    if (!g) { this.thinkT = 0; this.halt(); return; }
    if (this.travel(dt, g.x, g.y, ENEMY.runSpeed * 0.9, { near: 10 })) { this.goal = null; this.thinkT = 0; }
    if (this.sees) { this.aimAt(p.x, p.y, dt); this.tryFire(p); }
  }

  // a short burst at the last known position when he ducks out of sight
  tSuppress(dt) {
    const lk = this.lastKnown;
    this.halt();
    if (!lk) { this.thinkT = 0; return; }
    this.aimAt(lk.x, lk.y, dt);
    if (this.tryFire(lk, 0.12)) this.burstLeft--;
    if (this.burstLeft <= 0 || this.t > 2) { this.burstLeft = 0; this.suppressCD = rand(3, 5); this.thinkT = 0; this.setTactic('hold'); }
  }

  // get to nearby cover if any, then reload and shout it
  tReload(dt) {
    const lk = this.lastKnown;
    if (lk) this.aimAt(lk.x, lk.y, dt, 0.6);
    if (this.reloading > 0) { this.kneel = true; this.halt(); return; }
    if (!this.needsReload()) { this.thinkT = 0; this.halt(); return; }
    if (this.sub === '' && lk) this.sub = this.planCover(lk, 150, 3, false) ? 'go' : 'now';
    if (this.sub === 'go' && this.cover && !this.travel(dt, this.cover.x, this.cover.y, ENEMY.runSpeed, { look: false, near: 6 }) && this.t < 2) return;
    this.halt();
    if (this.reload()) this.say('reload');
  }

  tPanic(dt, p) {
    if (!this.goal) {
      const a = Math.atan2(this.y - p.y, this.x - p.x) + rand(-0.8, 0.8);
      this.goal = randomPoint(this.world.map, this.x + Math.cos(a) * 160, this.y + Math.sin(a) * 160, 2) || { x: this.x, y: this.y };
    }
    if (this.travel(dt, this.goal.x, this.goal.y, ENEMY.runSpeed, { near: 12 })) this.halt();
    if (this.sees && chance(0.5)) { this.aimAt(p.x, p.y, dt, 0.7); this.tryFire(p, 0.35); }
    if (this.panicT <= 0) this.thinkT = 0;
  }

  // ---------------- combat helpers ----------------
  aimAt(x, y, dt, k = 1) { this.faceTo(x, y, ENEMY.turnRate * k, dt); }

  // pull the trigger if the gun is ready and on target; the shot goes off with an error that shrinks
  // with steady sight (settle). wild = extra error (suppressive / panic fire)
  tryFire(tg, wild = 0) {
    const d = this.def;
    if (d.kind !== 'gun' || !inHand(this) || this.react > 0 || this.cooldown > 0 || this.reloading > 0 || this.weapon.mag <= 0) return false;
    const dist = Math.hypot(tg.x - this.x, tg.y - this.y);
    if (dist > ENEMY.fireRange || Math.abs(angDiff(this.angle, Math.atan2(tg.y - this.y, tg.x - this.x))) > ENEMY.aimTolerance + wild) return false;
    // fairness: never fire from outside the player's screen
    if (!this.onScreen()) return false;
    if (this.friendInLine(tg.x, tg.y, dist)) { this.strafe = this.seed > 50 ? 0.5 : -0.5; this.strafeT = 0.6; return false; }
    const a = this.angle;
    this.angle += spread() * (aimError(this.settle, this.world.player.moving) + wild);
    const r = this.attack();
    this.angle = a;
    if (r !== true) return false;
    if (d.burst) {
      this.burst++;
      this.cooldown = this.burst >= d.burst ? rand(0.7, 1.1) : d.rate * ENEMY.fireRateMul;
      if (this.burst >= d.burst) this.burst = 0;
    } else this.cooldown = d.enemyRate * ENEMY.fireRateMul * rand(0.85, 1.25) * this.rate;
    return true;
  }

  onScreen() {
    const cam = this.world.camera, v = cam.viewRadius();
    return Math.abs(this.x - cam.x) < v.x - 52 && Math.abs(this.y - cam.y) < v.y - 52;
  }

  friendInLine(tx, ty, dist) {
    const ux = (tx - this.x) / dist, uy = (ty - this.y) / dist;
    for (const e of this.world.enemies) {
      if (e === this || !e.alive || e.knocked > 0) continue;
      const rx = e.x - this.x, ry = e.y - this.y, along = rx * ux + ry * uy;
      if (along > 0 && along < dist && Math.abs(rx * uy - ry * ux) < 10) return true;
    }
    return false;
  }

  meleeThreat(p, dist) {
    if (p.def.kind !== 'melee' || dist > 130) return false;
    const v = Body.getVelocity(p.body);
    return ((this.x - p.x) * v.x + (this.y - p.y) * v.y) / dist > 1.2;
  }

  canSuppress() {
    const lk = this.lastKnown, d = this.def;
    if (!lk || d.kind !== 'gun' || d.pellets > 1 || d.rocket || this.weapon.mag <= 0) return false;
    return Math.hypot(lk.x - this.x, lk.y - this.y) < 300 && this.onScreen() && this.world.lineOfSight(this.x, this.y, lk.x, lk.y);
  }

  // empty, or low while out of sight (and there is something to reload with)
  needsReload() {
    const w = this.weapon;
    if (!w || this.def.kind !== 'gun' || this.reloading > 0 || this.reserveCount() <= 0) return false;
    return w.mag <= 0 || (!this.sees && w.mag < this.def.mag * 0.35);
  }

  // ---------------- weapons ----------------
  // nearest loaded gun / melee weapon on the floor within reach
  lookForWeapon() {
    let best = null, bd = 260;
    for (const it of this.world.items) {
      if (it.dead || it.speed > 2 || (it.def.kind === 'gun' && it.mag <= 0)) continue;
      const d = Math.hypot(it.x - this.x, it.y - this.y);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best || !this.director.budget(1) || !findPath(this.world.map, this.x, this.y, best.x, best.y)) return false;
    this.setState(S.FETCH);
    this.fetchTarget = best;
    return true;
  }

  doFetch(dt) {
    if (!this.turncoat && this.loseNerve(dt)) return;
    const it = this.fetchTarget;
    if (!it || it.dead) { this.beginLocalSearch(this.x, this.y, 2); return; }
    if (Math.hypot(it.x - this.x, it.y - this.y) < 14) {
      this.setWeapon(it.type, it.mag, it.def.shellReload ? 6 : 1);
      this.weapon.bare = !!it.bare;
      this.world.removeItem(it);
      this.world.sound('pickup', this.x, this.y, 0.5);
      this.pickAnim = 0.35;
      if (this.turncoat) { this.turncoat = false; this.barkT = 0; this.say('turn'); }
      if (this.lastKnown) { this.setState(S.COMBAT); this.thinkT = 0; this.react = Math.max(this.react, 0.3); }
      else this.beginLocalSearch(this.x, this.y, 2);
      return;
    }
    this.travel(dt, it.x, it.y, ENEMY.runSpeed, { near: 0 });
  }

  // unarmed and nothing to pick up: run to the nearest armed mate and send him in
  fleeToFriend() {
    if (this.kind === 'brute') return false; // brutes charge with their fists
    let best = null, bd = 600;
    for (const e of this.world.enemies) {
      if (e === this || !e.alive || e.knocked > 0 || e.def.kind !== 'gun') continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return false;
    this.setState(S.FLEE);
    this.friend = best;
    this.say('help', { N: this.director.nickOf(best) });
    return true;
  }

  doFlee(dt) {
    if (this.loseNerve(dt)) return;
    const f = this.friend, lk = this.lastKnown;
    if (!f || !f.alive) { this.setState(S.COMBAT); return; }
    if (this.t > 1.5 && this.lookForWeapon()) return;
    if (this.travel(dt, f.x, f.y, ENEMY.runSpeed, { near: 40 })) {
      if (lk) f.joinHunt(lk.x, lk.y);
      this.setState(S.GUARD);
      this.guardPt = lk || { x: f.x, y: f.y };
      this.guardT = rand(6, 10);
    }
  }

  // ---------------- movement ----------------
  // true = path found, false = unreachable, null = no path budget left this step (retry next one)
  goTo(x, y) {
    if (!this.director.budget(1)) return null;
    this.dest = { x, y };
    const path = this.world.pathForGuard(this.x, this.y, x, y, this.director.pathCost(this));
    if (!path || !path.length) { this.path = null; return false; }
    this.path = path;
    this.pathIdx = 0;
    this.director.shareRoute(this, path);
    return true;
  }

  // Pushed in vain at something on his way: the tile in it is noted (ai/Nav.js) and his next path goes round it while
  // he remembers (a thing from the second time it holds him there, people from AI.nav.jam.people: they move on).
  // True once he has been held up AI.nav.jam.tries times on his way to the same spot: he gives it up.
  jammed(ux, uy) {
    const J = AI.nav.jam, w = this.world;
    const cell = cellAhead(w.map, this.x, this.y, ux, uy);
    if (cell === null) return false;
    this.blockN = cell === this.blockCell ? this.blockN + 1 : 1;
    this.blockCell = cell;
    const people = w.chars.some((c) => c !== this && c.alive && !(c.knocked > 0) && Math.hypot(c.x - this.x - ux * 16, c.y - this.y - uy * 16) < 20);
    if (this.blockN < (people ? J.people : 2)) return false;
    return this.noteJam(cell);
  }

  // the tile `cell` is in the way: his paths go round it while he remembers (ai/Nav.js); true once that has happened
  // AI.nav.jam.tries times on his way to the same spot (he gives it up)
  noteJam(cell) {
    const J = AI.nav.jam, to = this.dest;
    if (to && (!this.jamTo || Math.hypot(this.jamTo.x - to.x, this.jamTo.y - to.y) > 20)) { this.jamTo = { x: to.x, y: to.y }; this.jamTries = 0; }
    this.jams.mark(cell, J.cost, this.world.time + J.forget);
    return ++this.jamTries >= J.tries;
  }

  // how he gives way to the people around him, heading (ux, uy) (ai/Nav.js giveWay): in a fight the player is not
  // among them, he goes for him
  giveWay(ux, uy) {
    const near = this.near;
    near.length = 0;
    for (const c of this.world.chars) {
      if (c === this || !c.alive || c.knocked > 0 || c.hidden || c.seated || c.vaulting || (c.isPlayer && this.aware === 2)) continue;
      if (Math.abs(c.x - this.x) < 60 && Math.abs(c.y - this.y) < 60) near.push(c);
    }
    return giveWay(this, ux, uy, near);
  }

  // True when we have been a few steps from (x, y) for too long without getting there: something stands on the
  // spot (a car, a pile of wreckage) and close enough is good enough.
  blockedAt(dt, x, y) {
    if (Math.hypot(x - this.x, y - this.y) > 80) { this.nearT = 0; return false; }
    return (this.nearT += dt) > 2;
  }

  // walk/run to (x, y), path-finding as needed; true once there (or unreachable)
  travel(dt, x, y, speed, opts = {}) {
    if (!this.target || this.state !== S.COMBAT) this.target = { x, y };
    const near = opts.near ?? 8;
    if (Math.hypot(x - this.x, y - this.y) < near) { this.path = null; this.halt(); return true; }
    this.repath -= dt;
    const moved = !this.dest || Math.hypot(this.dest.x - x, this.dest.y - y) > 20;
    if ((!this.path || moved) && this.repath <= 0) {
      const r = this.goTo(x, y);
      if (r === false) { this.repath = 0.4; return true; }
      if (r === true) this.repath = 0.4;
    }
    if (!this.path) { this.halt(); return false; }
    return this.follow(dt, speed, opts);
  }

  follow(dt, speed, opts = {}) {
    if (!this.path) return true;
    let t = this.path[this.pathIdx];
    let dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
    if (d < 8) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; this.halt(); return true; }
      t = this.path[this.pathIdx];
      dx = t.x - this.x; dy = t.y - this.y; d = Math.hypot(dx, dy) || 1;
    }
    const ux = dx / d, uy = dy / d, heading = Math.atan2(dy, dx);
    // the keys of the house: a locked door on his way opens for him
    for (const door of this.world.doors) {
      if (!door.locked || !this.world.isHouseDoor(door)) continue;
      const tip = door.tip();
      if (Math.hypot((door.hx + tip.x) / 2 - this.x - ux * 14, (door.hy + tip.y) / 2 - this.y - uy * 14) < 22) { door.unlatch(); this.turnKey(door); }
    }
    const map = this.world.map;
    const cx = Math.floor((this.x + ux * 20) / TILE), cy = Math.floor((this.y + uy * 20) / TILE), key = cy * map.w + cx;
    const mx = Math.floor(this.x / TILE), my = Math.floor(this.y / TILE);
    // a door frame, locked or not (a locked door of the house opens for him like any other)
    const frame = (x, y) => map.at(x, y) === 'D' || map.at(x, y) === 'L';
    const ahead = frame(cx, cy), inside = frame(mx, my);
    // one at a time through a doorway: whoever is in the frame, or was first to it, goes; the others stand back
    const want = inside ? my * map.w + mx : ahead ? key : this.gateWait > 0 ? this.gateFor : -1;
    if (want < 0) this.gate = -1;
    else if (!inside && this.gateTaken(want)) {
      if (this.gateWait >= (speed > 1.6 ? AI.gate.rush : AI.gate.calm)) {
        // the doorway is not clearing (a man stuck in it, coming the other way): another way round, if there is one
        this.gateWait = 0;
        if (this.noteJam(want)) { this.path = null; this.halt(); return true; }
        this.repath = 0; this.dest = null;
        this.halt();
        return false;
      }
      this.gate = -1;
      this.gateFor = want;
      this.gateWait += dt;
      if (!this.standBack(dt, want, heading)) this.gateWait = 0; // sent somewhere else meanwhile
      return false;
    } else {
      this.gate = want;
      this.gateT = this.world.time;
      if (inside) this.gateWait = 0;
    }
    // calm guards pause a beat before stepping through a doorway
    if (opts.doors) {
      if (ahead && key !== this.doorKey) { this.doorKey = key; this.doorT = rand(0.35, 0.8); }
      else if (!inside && !ahead) this.doorKey = -1;
    }
    if (this.doorT > 0) {
      this.doorT -= dt;
      this.halt();
      this.sweep(dt, heading, 0.9);
      return false;
    }
    // organic gait: slight sway, pace drift, giving way to the people around (stepping aside, falling in behind one
    // going his way), smooth acceleration
    const sway = Math.sin(this.world.time * 1.7 + this.seed) * (speed > 1.6 ? 0.08 : 0.16);
    const gw = this.giveWay(ux, uy);
    const sp = speed * this.pace * (1 + Math.sin(this.world.time * 0.6 + this.seed) * 0.06) * gw.slow;
    // a doorway is taken down its middle, not across the corner where the leaf hangs, and left straight on for a
    // tile before turning (a leaf swung open stands beside it)
    let way = (inside || ahead) && throughDoor(map, inside ? mx : cx, inside ? my : cy, this.x, this.y, ux, uy);
    if (inside) {
      const vert = !map.isBlocked(mx, my - 1) && !map.isBlocked(mx, my + 1);
      this.doorOut = { cx: mx, cy: my, s: Math.sign(vert ? uy : ux) || 1 };
    } else if (!way && this.doorOut) {
      const o = this.doorOut;
      way = pastDoor(map, o.cx, o.cy, o.s, this.x, this.y);
      if (!way) this.doorOut = null;
    }
    if (way) this.steer(way.x + gw.x * 0.4, way.y + gw.y * 0.4, sp, 0.16);
    else this.steer(ux - uy * sway + gw.x, uy + ux * sway + gw.y, sp, speed > 1.6 ? 0.16 : 0.09);
    if (opts.look !== false) {
      // the head leads: look into the next leg of the path before the feet turn
      const n = this.path[this.pathIdx + 1];
      const la = n && d < 40 ? Math.atan2(n.y - this.y, n.x - this.x) : heading;
      this.faceAngle(la + (opts.glance ? this.walkGlance(dt) : 0), speed > 1.6 ? 7 : 4, dt);
    }
    // pushing at something that will not give: his legs go, the ground does not
    this.probeT += dt;
    let held = false;
    if (this.probeT >= 0.5) {
      held = Math.hypot(this.x - this.probeX, this.y - this.probeY) < sp * 6; // a fifth of half a second's walk
      this.probeT = 0; this.probeX = this.x; this.probeY = this.y;
    }
    // stuck on furniture or bodies: vault it, else note what is in the way, sidestep and re-plan round it
    if (held || this.moving < sp * 0.25) {
      this.stuck += held ? 1 : dt;
      if (this.stuck > 0.25 && this.tryVault(heading)) { this.stuck = 0; return false; }
      if (this.stuck > 0.7) {
        this.stuck = 0;
        if (this.jammed(ux, uy)) { this.path = null; this.halt(); return true; } // no way through: he gives it up
        // in a door frame there is no room at the sides: back out of it
        const side = heading + (inside ? Math.PI : chance(0.5) ? 1.4 : -1.4);
        Body.setVelocity(this.body, { x: Math.cos(side) * speed, y: Math.sin(side) * speed });
        this.repath = 0;
        this.dest = null;
      }
    } else this.stuck = 0;
    return false;
  }

  // is the doorway (cell key) another guard's: he stands in it, or claimed it a moment ago (see follow)
  gateTaken(key) {
    const w = this.world.map.w, now = this.world.time;
    return this.world.enemies.some((e) => e !== this && e.alive && !(e.knocked > 0)
      && ((e.gate === key && now - e.gateT < 0.3) || Math.floor(e.y / TILE) * w + Math.floor(e.x / TILE) === key));
  }

  // Wait for a doorway: clear of its mouth (a tile out from it and a tile and a bit to one side, out of the way of
  // whoever comes through), eyes on it; false when it is no longer on his way.
  standBack(dt, key, heading) {
    const map = this.world.map, w = map.w, cx = key % w, cy = Math.floor(key / w);
    const dcx = (cx + 0.5) * TILE, dcy = (cy + 0.5) * TILE, dx = this.x - dcx, dy = this.y - dcy;
    if (Math.hypot(dx, dy) > AI.gate.far) return false;
    const vert = !map.isBlocked(cx, cy - 1) && !map.isBlocked(cx, cy + 1);
    const out = (vert ? Math.sign(dy) : Math.sign(dx)) || 1; // the side of the doorway he is on
    let spot = null;
    for (const side of this.seed < 50 ? [1, -1, 0] : [-1, 1, 0]) {
      const along = side ? 1.1 : 1.6, across = side * 1.25;
      const x = vert ? dcx + across * TILE : dcx + out * along * TILE, y = vert ? dcy + out * along * TILE : dcy + across * TILE;
      if (!map.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE))) { spot = { x, y }; break; }
    }
    const d = spot ? Math.hypot(spot.x - this.x, spot.y - this.y) : 0;
    if (d > 4) {
      const s = this.separation();
      this.steer((spot.x - this.x) / d + s.x, (spot.y - this.y) / d + s.y, Math.min(1.3, d / 8), 0.2);
    } else this.halt();
    this.faceTo(dcx, dcy, 4, dt);
    return true;
  }

  // stand still, only nudged apart from mates
  halt() {
    if (this.outOfDoorway()) return;
    const s = this.separation(), m = Math.hypot(s.x, s.y);
    this.steer(s.x, s.y, m > 0.01 ? Math.min(1, m) * 1.2 : 0, 0.2);
  }

  // Standing still in a door frame with somebody close by: he steps out of it along the passage, away from them
  // (a doorway is everyone's way through). True while he does.
  outOfDoorway() {
    const map = this.world.map, cx = Math.floor(this.x / TILE), cy = Math.floor(this.y / TILE), c = map.at(cx, cy);
    if ((c !== 'D' && c !== 'L') || this.vaulting || this.held) return false;
    const vert = !map.isBlocked(cx, cy - 1) && !map.isBlocked(cx, cy + 1);
    if (!vert && (map.isBlocked(cx - 1, cy) || map.isBlocked(cx + 1, cy))) return false;
    let other = null, od = 40;
    for (const o of this.world.chars) {
      const d = o !== this && o.alive && !(o.knocked > 0) ? Math.hypot(o.x - this.x, o.y - this.y) : Infinity;
      if (d < od) { od = d; other = o; }
    }
    if (!other) return false;
    const side = vert ? Math.sign(this.y - other.y) || 1 : Math.sign(this.x - other.x) || 1;
    const tx = vert ? (cx + 0.5) * TILE : (cx + 0.5 + side) * TILE, ty = vert ? (cy + 0.5 + side) * TILE : (cy + 0.5) * TILE;
    this.steer(tx - this.x, ty - this.y, ENEMY.walkSpeed, 0.2);
    return true;
  }

  // push away from mates closer than 26 px (reused vector)
  separation() {
    let sx = 0, sy = 0;
    for (const e of this.world.enemies) {
      if (e === this || !e.alive || e.knocked > 0) continue;
      const dx = this.x - e.x, dy = this.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 > 26 * 26 || d2 < 0.01) continue;
      const d = Math.sqrt(d2), k = (26 - d) / 26;
      sx += (dx / d) * k; sy += (dy / d) * k;
    }
    this.sep.x = sx; this.sep.y = sy;
    return this.sep;
  }

  // turn towards a: at a steady rate on a target, easing into it otherwise (a head that settles, not a turret)
  faceAngle(a, rate, dt) {
    const k = this.aware >= 2 ? 1 : Math.min(1, Math.abs(angDiff(this.angle, a)) / 0.6 + 0.15);
    this.angle = approachAngle(this.angle, a, rate * dt * k);
  }
  faceTo(x, y, rate, dt) { this.faceAngle(Math.atan2(y - this.y, x - this.x), rate, dt); }

  // look around a base direction with pauses between glances
  sweep(dt, base, amp = 1.1, rate = 3.2) {
    if ((this.glanceT -= dt) <= 0) { this.glanceT = rand(0.5, 1.3); this.glance = rand(-amp, amp); }
    this.faceAngle(base + this.glance, rate, dt);
  }

  walkGlance(dt) {
    if ((this.glanceT -= dt) <= 0) { this.glanceT = rand(1.2, 3.5); this.glance = chance(0.55) ? 0 : rand(-0.9, 0.9); }
    return this.glance;
  }

  // what was in his hands falls with him (a lit match on the petrol, a glass...)
  kill(angle, cause, killer, by, how) {
    if (this.alive && !this.invulnerable && this.holding) this.dropHeld();
    super.kill(angle, cause, killer, by, how);
  }

  // ---------------- knock-down ----------------
  // opt (a fall nobody caused, Enemy.slip): time s on the floor, slide: the way he slides on (default: the blow's),
  // speed px/step, dazed: groggy on the floor rather than knocked silly, no blood, nobody provoked
  knock(angle, cause, opt = {}) {
    if (!this.alive || this.knocked > 0) return;
    if (this.holding) this.dropHeld();
    this.knocked = opt.time ?? ENEMY.knockTime * (cause === 'door' ? 1.2 : 1);
    this.dazed = !!opt.dazed;
    this.posture = 0; this.through = false;
    if (!opt.dazed) this.director.provoked = true; // nobody floors a guard by accident
    this.world.events.emit('knock', { victim: this, cause, angle });
    this.downAngle = angle; // on his back, his head away from the blow
    this.dormant = false;   // that wakes a man
    const along = opt.slide ?? angle;
    this.dropWeapon(along + rand(-0.8, 0.8), this.yields ? 0.5 : rand(2, 4)); // (his gun is to be snatched: it stays by him)
    this.vaulting = null;
    this.body.collisionFilter = { category: CAT.CORPSE, mask: MASK.CORPSE, group: 0 };
    const sp = opt.speed ?? (cause === 'punch' ? 3 : 4.5);
    this.vel = { x: Math.cos(along) * sp, y: Math.sin(along) * sp };
    Body.setVelocity(this.body, this.vel);
    this.swing = this.tell = 0;
    this.reloading = 0;
    this.director.release(this);
    if (opt.dazed) return;
    this.world.particles.blood(this.x, this.y, angle, 0.6, 6, 120);
    this.hurt = rand(...HURT.dur); // his nose bleeds a while (drip)
  }

  // his feet went on a slick floor running along a (systems/Slips.js): on his back, his head where he came from,
  // sliding on; dazed a few seconds, trying to get up (a free kill)
  slip(a) {
    const S = SLIP.enemy;
    this.knock(a + Math.PI, 'slip', { time: rand(...S.daze), slide: a, speed: S.push, dazed: true });
    this.say('slip');
  }

  // floored but alive: a drop off his face now and then, where he lies and on his way once he is up (HURT)
  drip(dt) {
    if (this.hurt <= 0) return;
    this.hurt -= dt;
    if ((this.dripT -= dt) > 0) return;
    this.dripT = rand(...HURT.every);
    this.world.particles.blood(this.x + rand(-3, 3), this.y + rand(-3, 3), rand(0, 6.28), 0.3, 1, rand(5, 30), { z: 5 });
  }

  updateKnocked(dt) {
    if (this.executing) { this.steer(0, 0, 0, 0.5); return; }
    this.knocked -= dt;
    this.steer(0, 0, 0, ENEMY.knockBrake);
    this.layClear(dt);
    if (this.knocked <= 0) {
      this.knocked = 0;
      this.dazed = false;
      this.body.collisionFilter = { category: CAT.CHAR, mask: MASK.CHAR, group: 0 };
      this.angle = this.downAngle + Math.PI;
      if (this.passive) return;
      this.setState(S.DIZZY);
      this.dizzyT = rand(...ENEMY.dizzy);
      this.meter = Math.max(this.meter, 0.5);
    }
  }

  // ---------------- feedback ----------------
  showIcon(ch, t) { this.icon = ch; this.iconT = t; }

  // whether the line was actually said (one's own breath and the squad's turn to speak allowing); vars fill its
  // blanks (Director.bark). A yelled occasion goes with his shout, a muttered one with his mutter (the voice cap of
  // audio/Audio.js decides whether that is heard).
  say(kind, vars) {
    if (this.barkT > 0 || !BARKS[kind]) return false;
    if (!this.director.bark(this, kind, vars)) return false;
    this.barkT = 1.5;
    this.speak(kind, kind === 'chat' && this.mate?.alive ? this.mate : null);
    if (SHOUTED.has(kind)) this.world.sound('shout', this.x, this.y, 0.8, { pitch: this.voice });
    else if (MUTTERED.has(kind)) this.world.sound('mutter', this.x, this.y, 0.6, { pitch: this.voice });
    return true;
  }

  draw(ctx) {
    if (this.ashtray) drawItem(ctx, 'ashtray', this.ashtray.x, this.ashtray.y, 0.4);
    const k = 1 - Math.min(1, this.crouch) * 0.12; // ducking lower (DUCK) is in his pose, never a smaller man
    if (k < 1) { ctx.save(); ctx.translate(this.x, this.y); ctx.scale(k, k); ctx.translate(-this.x, -this.y); }
    const B = this.held ? null : this.postBody(); // seized at his post: in the hands of the one behind him
    if (B) drawPose(ctx, this, postPose(this, standPose(this, this.pose), this.pose2, B));
    else if (this.yielded && this.knocked <= 0 && !this.held) drawPose(ctx, this, kneelPose(standPose(this, this.pose)));
    else super.draw(ctx);
    if (this.look?.tail && this.alive && this.knocked <= 0) this.drawTail(ctx);
    if (k < 1) ctx.restore();
    if (!this.alive || this.knocked > 0) return;
    const t = this.world.time;
    const kind = this.pastime;
    ctx.save();
    bodyFrame(ctx, this); // what he holds is drawn from his pose
    if (kind) drawPastime(ctx, this, kind, ONE_GO.has(kind) ? this.actT : t);
    // what is in his hands at his post, in his torso's frame
    const P = this.pose, A = { x: this.x + P.tx, y: this.y + P.ty, angle: P.ta, s: P.s, side: this.seat?.side ?? 1, seed: this.seed };
    const ph = this.held ? null : this.gestureOn; // seized: his hands are off his work
    if (ph) {
      const G = GESTURES[ph.g], R = this.routine;
      if (G?.pastime) drawPastime(ctx, A, G.pastime, gestureClock(G, R.k, t, this.seed));
      drawPost(ctx, A, ph.g, R.k, R.t, t, this.rawHands(ph), { seed: this.seed, reach: 16 });
    }
    if (this.mouth) drawMouth(ctx, A);
    ctx.restore();
    if (this.state === S.DIZZY) {
      ctx.fillStyle = PALETTE.yellow;
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * Math.PI * 2) / 3;
        ctx.fillRect(this.x + Math.cos(a) * 6 - 1, this.y + Math.sin(a) * 3 - 12, 2, 2);
      }
    }
  }

  // awareness marks, drawn after the lighting so they stay readable in the dark:
  // '!' when spotted or giving a last warning, '?' while suspicious, and the detection meter filling up
  drawMarks(ctx) {
    if (!this.alive || this.knocked > 0 || this.passive || this.yielded) return;
    if (this.tell > 0) this.drawTell(ctx);
    const showQ = this.aware === 1 && this.state !== S.DIZZY;
    if (this.iconT > 0 || showQ) {
      const ch = this.iconT > 0 ? this.icon : '?';
      ctx.font = '10px joystix';
      ctx.textAlign = 'center';
      ctx.globalAlpha = this.iconT > 0 ? clamp(this.iconT * 3, 0, 1) : 0.85;
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(ch, this.x + 1, this.y - 13);
      ctx.fillStyle = ch === '!' ? PALETTE.pink : PALETTE.yellow;
      ctx.fillText(ch, this.x, this.y - 14);
      ctx.globalAlpha = 1;
    }
    // the same gauge shows his suspicion, or his patience running out with a stranger he is having a word with (a third of it per stage: told, warned, shoved)
    const c = this.case, word = c && c.stage >= STAGE.TOLD ? Math.min(1, (c.stage - 1 + Math.min(1, (this.world.time - c.t) / c.wait())) / 3) : 0;
    const m = Math.max(this.meter, word);
    if (this.aware < 2 && m > 0.04) {
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(this.x - 7, this.y - 12, 14, 3);
      ctx.fillStyle = m > 0.7 ? PALETTE.orange : PALETTE.yellow;
      ctx.fillRect(this.x - 6, this.y - 11, 12 * m, 1);
    }
  }

  // a blow wound up: a glint on the weapon's tip (or on the fist), growing as it comes, so it reads in the dark
  drawTell(ctx) {
    const P = this.pose, d = this.def, k = 1 - this.tell / this.tellDur;
    let x = this.x + P.hr.x, y = this.y + P.hr.y;
    if (P.wpnOn && d.sprite) {
      const len = (sw(sprite(d.sprite)) - d.grip) * P.wpnLen * P.s;
      x = this.x + P.wpn.x + Math.cos(P.wpn.a) * len; y = this.y + P.wpn.y + Math.sin(P.wpn.a) * len;
    } else if (this.punchSide < 0) { x = this.x + P.hl.x; y = this.y + P.hl.y; }
    const r = 2 + 5 * Math.min(1, k * 1.6), h = 0.9;
    ctx.save();
    bodyFrame(ctx, this);
    ctx.translate(x, y);
    ctx.rotate(this.world.time * 3);
    ctx.globalAlpha = 0.6 + 0.4 * k;
    for (const [col, g] of [[PALETTE.pink, 1.6], ['#fff8f0', 0.8]]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-r * g, 0); ctx.lineTo(0, -h * g); ctx.lineTo(r * g, 0); ctx.lineTo(0, h * g);
      ctx.moveTo(0, -r * g); ctx.lineTo(h * g, 0); ctx.lineTo(0, r * g); ctx.lineTo(-h * g, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  // debug (F2): view cone (sharp centre brighter), state:tactic + meter, current target, cover, last known position
  drawVision(ctx) {
    if (!this.alive || this.knocked) return;
    const col = ['255,255,255', '249,200,14', '255,40,80'][this.aware];
    ctx.fillStyle = `rgba(${col},0.06)`;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, ENEMY.viewDist, this.angle - ENEMY.fov / 2, this.angle + ENEMY.fov / 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, ENEMY.viewDist * 0.7, this.angle - ENEMY.focusCone, this.angle + ENEMY.focusCone);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${col},0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, ENEMY.closeSense[this.aware], 0, Math.PI * 2); ctx.stroke();
    const tg = this.target;
    if (tg) {
      ctx.strokeStyle = `rgba(${col},0.7)`;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(tg.x, tg.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeRect(tg.x - 3, tg.y - 3, 6, 6);
    }
    if (this.cover) { ctx.strokeStyle = PALETTE.cyan; ctx.strokeRect(this.cover.x - 4, this.cover.y - 4, 8, 8); }
    const lk = this.lastKnown;
    if (lk && this.aware > 0) {
      ctx.strokeStyle = PALETTE.pink;
      ctx.beginPath(); ctx.moveTo(lk.x - 4, lk.y - 4); ctx.lineTo(lk.x + 4, lk.y + 4); ctx.moveTo(lk.x + 4, lk.y - 4); ctx.lineTo(lk.x - 4, lk.y + 4); ctx.stroke();
    }
    ctx.font = '5px joystix';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.white;
    const label = this.state + (this.tactic ? ':' + this.tactic : '') + (this.activity !== 'walk' && this.aware === 0 ? ':' + this.activity : '');
    ctx.fillText(`${label} ${Math.round(this.meter * 100)}`, this.x, this.y + 18);
  }
}
