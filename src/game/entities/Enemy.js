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
// The class holds his state, his step (update: one behaviour per state), his knock-down and his drawing; the rest
// is in entities/enemy/, functions of the guard (`me`) the class delegates to: Senses (sight, hearing, the meter),
// Word (a word with a stranger), Search (squad orders, suspicious states, the hunt), Calm (at ease, on his round),
// Post (his job at his post), Nerve (giving up, going for help), Combat (tactics, aim, fire), Arms (his weapon),
// Moves (paths, doorways, giving way), Look (what is drawn besides his body); States: the states they share.
import { ENEMY, AI, TILE, CAT, MASK, PALETTE } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { BARKS, SHOUTED, MUTTERED } from '../data/barks.js';
import { rand } from '../../engine/math.js';
import { dice } from '../systems/Rng.js';
import { GESTURES, gestureClock } from '../ai/Pastimes.js';
import { CellMemory } from '../ai/Nav.js';
import { drawPastime } from '../render/PastimeArt.js';
import Character, { heavyBuild } from './Character.js';
import { standPose, postPose, drawPose, bodyFrame, kneelPose } from './CharacterAnim.js';
import { drawPost, drawMouth, drawItem } from './PostArt.js';
import { DROP, SHIELD } from '../data/feel.js';
import { bodyHits } from '../systems/Shield.js';
import { HURT } from '../data/wounds.js';
import { SLIP } from '../data/devices.js';
import * as Senses from './enemy/Senses.js';
import * as Word from './enemy/Word.js';
import * as Search from './enemy/Search.js';
import * as Calm from './enemy/Calm.js';
import * as Post from './enemy/Post.js';
import * as Nerve from './enemy/Nerve.js';
import * as Combat from './enemy/Combat.js';
import * as Arms from './enemy/Arms.js';
import * as Moves from './enemy/Moves.js';
import * as Look from './enemy/Look.js';
import { ONE_GO, S } from './enemy/States.js';

const { Body } = Matter;

const DUCK = 1.8; // how far down a bartender ducks behind his counter (1 = kneeling)
// awareness implied by each state: 0 unaware, 1 suspicious ('?'), 2 alert ('!')
const AWARE = {
  idle: 0, patrol: 0, return: 0, suspicious: 1, investigate: 1, check: 1, search: 1, guard: 1, dizzy: 1,
  combat: 2, hunt: 2, fetch: 2, flee: 2, yield: 2, track: 1, backup: 2, challenge: 1,
};

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
    const D = dice(world); // (his gameplay rolls: systems/Rng.js)
    this.burst = 0; this.volleys = 0; this.burstLeft = 0; this.suppressCD = D.rand(0, 1.5);
    this.dodge = 0; this.dodgeCD = 0; this.strafe = 0; this.strafeT = D.rand(1, 2);
    this.shoutT = 0; this.panicT = 0; this.witnessed = []; this.dizzyT = 0;
    this.kneel = false; this.crouch = 0;
    this.searchPt = null; this.localPts = null; this.checkTarget = null; this.guardPt = null; this.guardT = 0;
    this.fetchTarget = null; this.friend = null;
    this.arms = null;          // his weapon kept somewhere until the fight (see takeArms), or a brawler's fists
    this.scanT = rand(0, ENEMY.scanTick);
    this.icon = ''; this.iconT = 0; this.barkT = 0;
    this.pace = D.rand(0.92, 1.08) * (kind === 'brute' ? 1.12 : heavyBuild(kind) ? 0.9 : 1);
    this.seed = rand(0, 100);
    this.sep = { x: 0, y: 0 };
    this.executing = false;
    this.held = null; // the player while he has us from behind (Player.startTakedown), or as a shield (startShield)
    this.flung = null; // { by, a } thrown by the man who held him as a shield, while he still flies (updateFlung)
    this.hostage = null; // { who, t } the comrade he saw held as a shield, and when: his fire held a moment (holdsFire)
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
      if (this.held.alive && this.held.shield?.target === this) return; // held as a shield: he is where he is put
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
    if ((this.scanT -= dt) <= 0) { this.scanT = ENEMY.scanTick; this.scanWorld(); }
    // one of the last two: a moment after a mate fell, he calls out for the others (Director.onKill)
    if (this.mourn && this.world.time >= this.mourn.at) { const m = this.mourn; this.mourn = null; this.barkT = 0; this.say('alone', m); }
    this.nodT = Math.max(0, this.nodT - dt);
    if (this.holding && !(this.atEase && this.activity === this.job)) {
      if (this.aware > 0 || this.director.phase !== 'normal') this.dropHeld(); else this.holding = null;
    }
    // sat down: he gets up first, and does nothing else until he is on his feet
    if (this.updatePosture(dt)) { this.crouch = Math.max(0, this.crouch - dt * 5); return; }

    // the fight is on and his weapon is kept somewhere: he runs for it first
    if (this.armsDue()) this.armUp();
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
    // the man a lesson keeps to be taken as a shield (systems/Tutorial.js `only`) is not floored: he reels and stands
    if (this.shieldOnly) { this.flinchFrom(1, angle, 1); return; }
    if (this.holding) this.dropHeld();
    this.knocked = opt.time ?? ENEMY.knockTime * (cause === 'door' ? 1.2 : 1);
    this.dazed = !!opt.dazed;
    this.posture = 0; this.through = false;
    if (!opt.dazed) this.director.provoked = true; // nobody floors a guard by accident
    this.world.events.emit('knock', { victim: this, cause, angle });
    this.downAngle = angle; // on his back, his head away from the blow
    this.dormant = false;   // that wakes a man
    const along = opt.slide ?? angle;
    this.dropWeapon(along + rand(-0.8, 0.8), this.yields ? 0.5 : rand(...DROP.knock)); // (his gun is to be snatched: it stays by him)
    this.vaulting = null;
    this.body.collisionFilter = { category: CAT.CORPSE, mask: MASK.CORPSE, group: 0 };
    const sp = opt.speed ?? (cause === 'punch' ? ENEMY.knockSpeed.punch : ENEMY.knockSpeed.other);
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
    if (this.flung) this.updateFlung();
    this.layClear(dt);
    if (this.knocked <= 0) {
      this.knocked = 0;
      this.dazed = false;
      this.flung = null; // (up again: he no longer flies, whatever his speed)
      this.body.collisionFilter = { category: CAT.CHAR, mask: MASK.CHAR, group: 0 };
      this.angle = this.downAngle + Math.PI;
      if (this.passive) return;
      this.setState(S.DIZZY);
      this.dizzyT = rand(...ENEMY.dizzy);
      this.meter = Math.max(this.meter, 0.5);
    }
  }

  // Thrown by the man who held him as a shield (Player.throwShield): while he still flies, a standing man he runs
  // into is floored too (cause 'body': the score's BODY THROW), which takes most of his speed
  updateFlung() {
    const f = this.flung, w = this.world, H = SHIELD.throw.hit, v = Body.getVelocity(this.body);
    if (Math.hypot(v.x, v.y) < H.speed) { this.flung = null; return; }
    for (const e of bodyHits(this, w.enemies)) {
      e.knock(f.a, 'body');
      w.sound('punch', e.x, e.y, 0.9, { pitch: 0.8 });
      w.shake(0.12);
      w.events.emit('thrownHit', { thrower: f.by, victim: e, x: e.x, y: e.y, angle: f.a, kill: false, body: this });
      this.vel = { x: v.x * H.keep, y: v.y * H.keep };
      Body.setVelocity(this.body, this.vel);
      this.flung = null;
      return;
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
    // held as a shield: drawn by the man who holds him, over himself (Player.draw)
    if (this.held?.shield?.target === this && !this.held.drawing) return;
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

  // ---------------- what he sees and hears (enemy/Senses.js) ----------------
  canSee(p) { return Senses.canSee(this, p); }
  canSeePoint(x, y, rangeMul, close) { return Senses.canSeePoint(this, x, y, rangeMul, close); }
  get distracted() { return Senses.distracted(this); }
  get atEase() { return Senses.atEase(this); }
  get quiet() { return Senses.quiet(this); }
  perceive(dt) { return Senses.perceive(this, dt); }
  spot(recent) { return Senses.spot(this, recent); }
  bossLine() { return Senses.bossLine(this); }
  hear(type, x, y, source) { return Senses.hear(this, type, x, y, source); }
  suspect(x, y, kind, urgent) { return Senses.suspect(this, x, y, kind, urgent); }
  investigate(x, y, kind, urgent) { return Senses.investigate(this, x, y, kind, urgent); }
  witnessKill(victim) { return Senses.witnessKill(this, victim); }
  scanWorld() { return Senses.scanWorld(this); }
  track(print) { return Senses.track(this, print); }
  check(inc) { return Senses.check(this, inc); }

  // ---------------- a word with the stranger (enemy/Word.js, ai/Conduct.js) ----------------
  witness(p, heard) { return Word.witness(this, p, heard); }
  glanceAt(x, y, dur) { return Word.glanceAt(this, x, y, dur); }
  challenge(act, x, y, open) { return Word.challenge(this, act, x, y, open); }
  endCase(letOff) { return Word.endCase(this, letOff); }
  doChallenge(dt) { return Word.doChallenge(this, dt); }
  shove(p) { return Word.shove(this, p); }
  letOff(line) { return Word.letOff(this, line); }
  letGo() { return Word.letGo(this); }

  // ---------------- squad orders, suspicious states, the hunt (enemy/Search.js) ----------------
  joinHunt(x, y) { return Search.joinHunt(this, x, y); }
  guard(x, y) { return Search.guard(this, x, y); }
  beginSearch() { return Search.beginSearch(this); }
  beginLocalSearch(x, y, n) { return Search.beginLocalSearch(this, x, y, n); }
  standDown() { return Search.standDown(this); }
  calm() { return Search.calm(this); }
  doSuspicious(dt) { return Search.doSuspicious(this, dt); }
  doInvestigate(dt) { return Search.doInvestigate(this, dt); }
  doCheck(dt) { return Search.doCheck(this, dt); }
  doSearch(dt) { return Search.doSearch(this, dt); }
  doTrack(dt) { return Search.doTrack(this, dt); }
  doGuard(dt) { return Search.doGuard(this, dt); }
  doDizzy(dt) { return Search.doDizzy(this, dt); }
  taunt(dt) { return Search.taunt(this, dt); }
  doHunt(dt) { return Search.doHunt(this, dt); }

  // ---------------- at ease, on his round, his hands (enemy/Calm.js) ----------------
  get pastime() { return Calm.pastime(this); }
  gaze(base) { return Calm.gaze(this, base); }
  get pouring() { return Calm.pouring(this); }
  busyHands() { return Calm.busyHands(this); }
  mood() { return Calm.mood(this); }
  updateCarry(dt) { return Calm.updateCarry(this, dt); }
  waitTurn(dt) { return Calm.waitTurn(this, dt); }
  doIdle(dt) { return Calm.doIdle(this, dt); }
  pickActivity() { return Calm.pickActivity(this); }
  get idle() { return Calm.idle(this); }
  joinChat(mate, t, turn) { return Calm.joinChat(this, mate, t, turn); }
  doPatrol(dt) { return Calm.doPatrol(this, dt); }
  doReturn(dt) { return Calm.doReturn(this, dt); }

  // ---------------- at his post (enemy/Post.js, data/posts.js) ----------------
  takeJob(job) { return Post.takeJob(this, job); }
  openAt(O) { return Post.openAt(this, O); }
  nearest(type, p, reach) { return Post.nearest(this, type, p, reach); }
  seatThrough() { return Post.seatThrough(this); }
  updatePosture(dt) { return Post.updatePosture(this, dt); }
  get gestureOn() { return Post.gestureOn(this); }
  rawHands(ph) { return Post.rawHands(this, ph); }
  gestureHands(ph) { return Post.gestureHands(this, ph); }
  postBody() { return Post.postBody(this); }
  canPlay(name) { return Post.canPlay(this, name); }
  startPhase() { return Post.startPhase(this); }
  work(dt) { return Post.work(this, dt); }
  ahead(fwd, right) { return Post.ahead(this, fwd, right); }
  hand(ph) { return Post.hand(this, ph); }
  dropHeld() { return Post.dropHeld(this); }

  // ---------------- giving up, going for help (enemy/Nerve.js) ----------------
  surrender() { return Nerve.surrender(this); }
  loseNerve(dt) { return Nerve.loseNerve(this, dt); }
  updateYield(dt) { return Nerve.updateYield(this, dt); }
  callOut() { return Nerve.callOut(this); }
  doBackup(dt) { return Nerve.doBackup(this, dt); }

  // ---------------- the fight: tactics, aim, fire (enemy/Combat.js) ----------------
  doCombat(dt) { return Combat.doCombat(this, dt); }
  setTactic(t) { return Combat.setTactic(this, t); }
  plan(p) { return Combat.plan(this, p); }
  tAdvance(dt, p) { return Combat.tAdvance(this, dt, p); }
  tReload(dt) { return Combat.tReload(this, dt); }
  aimAt(x, y, dt, k) { return Combat.aimAt(this, x, y, dt, k); }
  tryFire(tg, wild) { return Combat.tryFire(this, tg, wild); }
  holdsFire(tg) { return Combat.holdsFire(this, tg); }
  seeHostage(p) { return Combat.seeHostage(this, p); }
  freed(p) { return Combat.freed(this, p); }
  onScreen() { return Combat.onScreen(this); }
  friendInLine(tx, ty, dist) { return Combat.friendInLine(this, tx, ty, dist); }
  needsReload() { return Combat.needsReload(this); }

  // ---------------- his weapon (enemy/Arms.js) ----------------
  takeArms(a) { return Arms.takeArms(this, a); }
  armsDue() { return Arms.armsDue(this); }
  armUp() { return Arms.armUp(this); }
  lookForWeapon() { return Arms.lookForWeapon(this); }
  doFetch(dt) { return Arms.doFetch(this, dt); }
  fleeToFriend() { return Arms.fleeToFriend(this); }
  doFlee(dt) { return Arms.doFlee(this, dt); }

  // ---------------- getting about (enemy/Moves.js) ----------------
  giveWay(ux, uy) { return Moves.giveWay(this, ux, uy); }
  blockedAt(dt, x, y) { return Moves.blockedAt(this, dt, x, y); }
  travel(dt, x, y, speed, opts) { return Moves.travel(this, dt, x, y, speed, opts); }
  follow(dt, speed, opts) { return Moves.follow(this, dt, speed, opts); }
  halt() { return Moves.halt(this); }
  separation() { return Moves.separation(this); }
  faceAngle(a, rate, dt) { return Moves.faceAngle(this, a, rate, dt); }
  faceTo(x, y, rate, dt) { return Moves.faceTo(this, x, y, rate, dt); }
  sweep(dt, base, amp, rate) { return Moves.sweep(this, dt, base, amp, rate); }

  // ---------------- drawn besides his body (enemy/Look.js) ----------------
  drawTail(ctx) { return Look.drawTail(this, ctx); }
  drawMarks(ctx) { return Look.drawMarks(this, ctx); }
  drawVision(ctx) { return Look.drawVision(this, ctx); }
}
