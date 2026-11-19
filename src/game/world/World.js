// One playthrough of a level. Owns the entity lists and runs the simulation step in a fixed order;
// the actual rules live in systems (Ballistics, Explosions, Destruction, Scoring, Impacts) and the
// drawing in WorldRenderer. Systems talk through `world.events` (EventBus):
//   'impact'        physics contact            { a, b, speed, x, y }
//   'kill'          a character died           { victim, cause, killer, how, left }
//   'knock'         a guard was floored        { victim, cause, angle }   (entities/Enemy)
//   'shot'          a trigger was pulled       { shooter, weapon }
//   'explosion'     a blast went off           { x, y, radius, source }
//   'wallDestroyed' a wall tile collapsed      { cx, cy, x, y, dirA, power }
//   'noise'         something audible          { x, y, radius, source, type }
//   'windowBroken'  a window shattered         { x, y, by }
//   'windowDestroyed' a window torn out, frame and all  { x, y, cx, cy, dirA, power }
//   'doorBroken'    a lock burst / door ripped { x, y }
//   'alertPhase'    squad alert phase changed  { phase, prev }   (ai/Director)
//   'surrender'     the last guard gave up     { who }   (entities/Enemy)
//   'footprint'     a wet sole marked the floor { who, x, y, angle, kind }   (systems/Liquids)
import { TILE, MAX_DEBRIS, PALETTE, PHYSICS, PLAYER } from '../Config.js';
import { chance, clamp, angDiff } from '../../engine/math.js';
import EventBus from '../../engine/EventBus.js';
import PhysicsWorld from '../../engine/physics/PhysicsWorld.js';
import { gripOn } from '../data/materials.js';
import Audio from '../../audio/Audio.js';
import TileMap from './TileMap.js';
import { buildLevel } from './Level.js';
import MapRenderer from '../render/MapRenderer.js';
import WorldRenderer from '../render/WorldRenderer.js';
import Lighting from '../render/Lighting.js';
import Particles from '../fx/Particles.js';
import { traceBullet, lineOfSight, canSeeCharacter, brushFittings } from '../systems/Ballistics.js';
import { explode } from '../systems/Explosions.js';
import { damageWall, destroyWall, destroyWindow, detachDoor, destroyFence, watchOpenings } from '../systems/Destruction.js';
import Scoring from '../systems/Scoring.js';
import Impacts from '../systems/Impacts.js';
import Liquids from '../systems/Liquids.js';
import Threats from '../systems/Threats.js';
import Alarms from '../systems/Alarms.js';
import Power from '../systems/Power.js';
import Critters from '../systems/Critters.js';
import Sirens from '../systems/Sirens.js';
import Flinch from '../systems/Flinch.js';
import Danger from '../systems/Danger.js';
import { combatFx } from '../fx/CombatFx.js';
import { listenMoments } from '../fx/Impact.js';
import KillCam from '../systems/KillCam.js';
import ChaseCam from '../systems/ChaseCam.js';
import CarFx from '../systems/CarFx.js';
import KillFeed from '../ui/KillFeed.js';
import Ambience from '../systems/Ambience.js';
import Tutorial from '../systems/Tutorial.js';
import Fires from '../systems/Fires.js';
import FireSpread from '../systems/FireSpread.js';
import WeaponItem from '../entities/WeaponItem.js';
import PoolBalls from '../systems/PoolBalls.js';
import Clutter from '../systems/Clutter.js';
import Gadgets from '../systems/Gadgets.js';
import Tipping from '../systems/Tipping.js';
import PropPhysics from '../systems/PropPhysics.js';
import Uses from '../systems/Uses.js';
import Doors from '../systems/Doors.js';
import Slips from '../systems/Slips.js';
import Sprinklers from '../systems/Sprinklers.js';
import Passage from '../systems/Passage.js';
import Jukebox from '../systems/Jukebox.js';
import GasValve from '../systems/GasValve.js';
import { findPath } from '../../engine/nav/Pathfinding.js';
import Steam from '../systems/Steam.js';
import Papers from '../systems/Papers.js';
import Litter from '../systems/Litter.js';
import Curtains from '../systems/Curtains.js';
import Weather from '../systems/Weather.js';
import Smoke from '../systems/Smoke.js';
import Director from '../ai/Director.js';
import BossStage from '../systems/BossStage.js';
import ThrowBeat from '../systems/ThrowBeat.js';
import Ambient from '../systems/Ambient.js';
import { OUTRO, getawayPath, driveStep, spinK, keyK, squatAt, crossed, motorState, fadeAlpha } from '../systems/Outro.js';
import { SEAT, TRAVERSE } from '../data/feel.js';
import Drive, { driveSpot } from '../systems/Drive.js';
import Pursuit from '../systems/Pursuit.js';
import Signals from '../systems/Signals.js';
import Lorries from '../systems/Lorries.js';
import { Gearbox } from '../../audio/Motor.js';

const { Body } = Matter;

export default class World {
  constructor(game, level) {
    this.game = game;
    this.camera = game.camera;
    this.level = level;
    this.time = 0;
    this.timers = [];
    this.events = new EventBus();
    // a round going under a ceiling fitting shakes it a little (it only breaks to a blast)
    this.events.on('round', (e) => brushFittings(this, e.x0, e.y0, e.x1, e.y1));

    this.map = new TileMap(level.tiles);
    this.physics = new PhysicsWorld({
      events: this.events,
      muAt: (x, y, body) => this.floorGrip(x, y, body),
      pushForce: PHYSICS.pushForce,
      substeps: PHYSICS.substeps,
    });
    this.decals = new MapRenderer(this.map, level);
    this.renderer = new WorldRenderer(this);
    this.cues = false; // readability cues drawn (set by Game each frame: render/Readability.js cuesOn)
    this.aimStyle = null; // the aim cue's style and LOCK's floor chevron, the player's settings (set by Game: aimTo)
    this.aimMark = false;
    this.wallBodies = this.map.buildBodies();
    this.addBody(this.wallBodies);
    this.addBody(this.map.buildEdgeBodies()); // nobody walks off an open map border (traffic / passers-by excepted)
    this.wallsDirty = false;
    this.particles = new Particles(this);

    this.player = null;
    this.enemies = [];
    this.offstage = [];   // guards still to come on (holdBack): counted among those left
    this.civilians = [];  // passers-by (systems/Ambient): in `chars`, never level targets
    this.chars = [];
    this.props = [];
    this.doors = [];
    this.windows = [];
    this.fences = [];
    this.items = [];
    this.ammoItems = [];
    this.emitters = [];
    this.projectiles = [];
    this.debris = [];
    this.corpses = [];
    this.lights = [];
    this.rings = [];
    this.texts = [];

    this.cleared = false;
    this.endT = null; // time of the player's death: the run's clock stops there
    this.exited = false;
    this.outro = null; // the getaway playing (startOutro; its state is described in systems/Outro.js)
    this.showVision = false;
    this.debugPhysics = false;

    this.scoring = new Scoring(this);
    this.killFeed = new KillFeed(this.events);    // what is shown of kills and chains (advanced by Game on the real clock)
    listenMoments(this);                          // a multi-kill's slow motion and hit-stop
    this.killCam = new KillCam(this);             // the camera's punch-in and slow motion on his kills (after Scoring: it reads the chain)
    this.bossStage = new BossStage(this);         // the camera on a boss's beats (advanced by Game on the real clock)
    this.throwBeat = new ThrowBeat(this);         // a throw's follow and its impact beat (likewise)
    this.impacts = new Impacts(this);
    this.liquids = new Liquids(this); // the liquid on the floor: spills, blood, the rain's puddles, footprints
    this.threats = new Threats(this); // which unseen guards the player can know about (HUD markers)
    this.alarms = new Alarms(this, level.alarms); // closed shops that ring when broken into
    this.critters = new Critters(this, level.critters); // rats, pigeons, the cat, flies, moths
    this.sirens = new Sirens(this);               // far off, once the shooting drags on
    this.flinch = new Flinch(this);               // guards shot at and missed flinch, rounds striking by the player nudge his view
    this.danger = new Danger(this);               // is somebody on the player: a quick kill or the long execution
    combatFx(this).listen();                      // a fight's marks over the lighting: the player's kills from now on
    this.ambience = new Ambience(this);           // the night heard, place by place: beds, traffic, one-shots
    this.poolBalls = new PoolBalls(this);         // the balls on the pool tables roll
    this.clutter = new Clutter(this);             // glasses, ashtrays, the till on the furniture: shot, knocked off, thrown
    this.gadgets = new Gadgets(this);             // the arcade rings, the jukebox derails
    this.tipping = new Tipping(this);             // street bins run into go over
    this.propPhysics = new PropPhysics(this);     // loose furniture pushed with its weight, scuffing the floor
    this.power = new Power(this, level.power);    // the house's fuse box: smashed, only the battery lamps are left
    this.weather = new Weather(this, level);               // the rain: open sky, its puddles, drips off the eaves
    this.steam = new Steam(this, level.street?.manholes, undefined, this.weather.k); // manholes, vents, pierced steam pipes
    this.smoke = new Smoke(this, level);                   // the air and what it carries: smoke, soot, powder, steam
    this.papers = new Papers(this, level.street?.papers, undefined, this.weather.k); // loose sheets the wind and the cars blow about
    this.litter = new Litter(this, level.litter);          // bills, feathers, a flute on a floor: kicked, blown, lifted by rounds
    this.fires = new Fires(this, level.fires);             // the flames of what burns
    this.fireSpread = new FireSpread(this, level);         // where it burns: along the petrol, over the floors, up the furniture
    // the level's devices (data/devices.js): what E does at them, and what they do used or broken
    this.uses = new Uses();                                 // the spots E works at (HUD hint, Player.nearUse)
    this.slips = new Slips(this);                           // running on a slick floor (a holed keg's beer)
    this.sprinklers = new Sprinklers(this, level.sprinklers); // the fire alarm: bell, rain, a slick floor, panic
    this.passage = new Passage(this, level.passage);       // the trapdoors and the way under the street
    this.jukebox = new Jukebox(this);                       // turned up, it drowns the small noises
    this.gasValve = new GasValve(this);                     // a stove's tap left open, and the spark
    this.lastShot = { owner: null, t: -1 };

    buildLevel(this, level);
    this.curtains = new Curtains(this); // the curtains' cloth: pushed by whoever goes through, parted, hiding or not
    this.doorWork = new Doors(this);    // leaves leaned on with a limited force, the lab's doorbell
    this.jukebox.wire();  // the devices that are props of the level offer their spots now that the props are there
    this.gasValve.wire();
    // a level that teaches: its guards asleep room by room, a retry from the last room reached (Game.tutorialAt)
    const at = game?.tutorialAt;
    this.tutorial = level.tutorial ? new Tutorial(this, level.tutorial, at?.name === level.name ? at.stage : 0) : null;
    const owed = this.tutorial?.owed;
    if (owed) this.addItem(new WeaponItem(this, owed.type, owed.mag, owed.x, owed.y, owed.angle));
    watchOpenings(this); // windows and doors go with the wall that holds them
    this.chars = [this.player, ...this.enemies];
    this.totalEnemies = this.enemies.length + this.offstage.length;
    this.director = new Director(this); // squad AI: alert phase, noises, incidents, search sweeps
    this.events.on('surrender', () => this.checkCleared());
    this.ambient = level.ambient ? new Ambient(this, level.ambient) : null; // traffic + passers-by
    const car = this.getaway();
    if (car) car.armoured = true; // the way out cannot be shot up or blown up before it is needed
    // a level driven in the van (level `chase`: he starts in it), the vans one can get into (the lab: E at the door)
    this.drive = level.chase ? new Drive(this, level.chase) : null;
    for (const p of this.props) if (p.drivable) this.uses.add(driveSpot(this, p));
    // the boss's men after him in their cars (the chase), the lab's pursuer dummy
    this.pursuit = level.chase || this.props.some((p) => p.pursuer) ? new Pursuit(this, level.chase) : null;
    // the lorry that backs out across the street (the chase's event 2, the lab's)
    this.lorries = level.chase || this.props.some((p) => p.backs) ? new Lorries(this, level.chase) : null;
    // the chase's own slow motions and cuts (a pursuer stopped, the lorry across the road): where one can be driven
    this.chaseCam = this.pursuit || this.lorries ? new ChaseCam(this) : null;
    this.carFx = new CarFx(this);     // a car in trouble: its smoke, the sparks where it scrapes, its fire-ball (looks)
    this.signals = new Signals(this); // traffic lights, the works' arrow board and flashers: their lamps in turn
    this.lighting = new Lighting(this);
    this.decals.seal(this.player.x); // the level is painted: what is drawn on its layers from now on is a mark
  }

  // this playthrough is over (a retry, another level, the title): its canvases let go now rather than when collected
  // (the map's layers, the lighting's buffers, the standing layer...). Safe to call again; the world is not drawn after
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.decals.dispose();
    this.renderer.dispose();
    this.lighting?.dispose();
  }

  get engine() { return this.physics.engine; }
  get enemiesLeft() { return this.enemies.filter((e) => e.alive && !e.yielded).length + this.offstage.length; } // guards still in the fight

  // the floor's name under a point (TileMap floors: 'wood', 'asphalt', 'roof'...), for what depends on it (footsteps)
  floorAt(x, y) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE), m = this.map;
    return cx < 0 || cy < 0 || cx >= m.w || cy >= m.h ? 'concrete' : m.floor[cy * m.w + cx] || 'concrete';
  }

  // grip multiplier of the floor at a point; for a loose prop, how its feet (`feet`: Prop.loosen) take to that floor
  floorGrip(x, y, body) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE), m = this.map;
    if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return 1;
    return gripOn(m.floor[cy * m.w + cx], body?.feet) * (this.liquids?.grip(x, y) ?? 1);
  }

  // ---------------- registry ----------------
  addBody(b) { this.physics.add(b); }
  removeBody(b) { this.physics.remove(b); }

  // a locked door of the house (on or within a tile of its guarded premises): the guards have its key
  isHouseDoor(d) {
    if (d.house === undefined) {
      const W = this.map.w, zones = this.level.premises || [];
      d.house = d.cells.some((i) => {
        const c = i % W, r = Math.floor(i / W);
        return zones.some(([c0, r0, c1, r1]) => c >= c0 - 1 && c <= c1 + 1 && r >= r0 - 1 && r <= r1 + 1);
      });
    }
    return d.house;
  }

  // a guard's way from s to t: the locked doors of the house do not stop him (he unlocks them as he comes to them,
  // Enemy.follow); everyone else's are walls to him too. cost(cell): what each tile is worth to him on top of the
  // walk (Director.pathCost: spots he keeps away from)
  pathForGuard(sx, sy, tx, ty, cost = null) {
    const b = this.map.blocked, open = [];
    for (const d of this.doors) if (d.locked && this.isHouseDoor(d)) for (const i of d.cells) { b[i] = 0; open.push(i); }
    const path = findPath(this.map, sx, sy, tx, ty, cost ? 6000 : 4000, cost);
    for (const i of open) b[i] = 1;
    return path;
  }
  characters() { return this.chars; }
  // emits one 'shot' per trigger pull: the pellets of a blast all come from the same shooter in the same step
  addProjectile(p) {
    this.projectiles.push(p);
    const last = this.lastShot;
    if (last.owner === p.owner && last.t === this.time) return;
    last.owner = p.owner; last.t = this.time;
    this.events.emit('shot', { shooter: p.owner, weapon: p.weapon });
  }
  addItem(it) { this.items.push(it); }
  // a guard joining after the level was built (sandbox)
  addEnemy(e) {
    this.enemies.push(e);
    this.chars.push(e);
    this.totalEnemies++;
    this.cleared = false;
  }
  // a guard kept off the level until a script brings him on (systems/Tutorial.js: men still on their way up the
  // stairs): no body, out of `enemies` and `chars`, nothing sees, hears or hits him; but one of those left
  holdBack(e) {
    e.offstage = true;
    this.removeBody(e.body);
    this.enemies = this.enemies.filter((o) => o !== e);
    this.chars = this.chars.filter((o) => o !== e);
    this.offstage.push(e);
  }

  // ... and on he comes, at (x, y) px facing a
  bringOn(e, x, y, a) {
    if (!e.offstage) return;
    e.offstage = false;
    this.offstage = this.offstage.filter((o) => o !== e);
    Body.setPosition(e.body, { x, y });
    Body.setVelocity(e.body, { x: 0, y: 0 });
    e.angle = a;
    e.home = { x, y, angle: a };
    this.addBody(e.body);
    this.enemies.push(e);
    this.chars.push(e);
  }

  // a guard who leaves the level for good, alive (systems/Tutorial.js: the man with the match, out by the door)
  leave(e) {
    this.removeBody(e.body);
    this.enemies = this.enemies.filter((o) => o !== e);
    this.chars = this.chars.filter((o) => o !== e);
  }

  removeItem(it) { it.dead = true; this.removeBody(it.body); }
  addCorpse(c) { this.corpses.push(c); }
  addDebris(d) {
    this.debris.push(d);
    if (this.debris.length > MAX_DEBRIS) {
      const old = this.debris.find((x) => !x.dead && !x.onLand); // not one that has yet to land (a magazine's rounds)
      if (old) this.bakeDebris(old);
    }
  }
  bakeDebris(d) {
    if (d.dead) return;
    // meat lies on the blood, everything else under it
    const p = d.body.position;
    if (d.body.material === 'flesh') this.decals.bake(d.img, p.x, p.y, d.body.angle, 1, true);
    else this.decals.wreck(d.img, p.x, p.y, d.body.angle, !!d.shadow, d.scale);
    this.removeDebris(d);
  }
  // gone without a trace (it shattered, it was consumed)
  removeDebris(d) {
    if (d.dead) return;
    d.dead = true;
    this.removeBody(d.body);
  }

  // ---------------- services used by entities ----------------
  after(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }
  // extra.choke: emitter key, a new sound from it cuts its previous one (gunfire)
  sound(name, x, y, vol = 1, extra) { Audio.play(name, { x, y, vol, occ: this.walledOff(x, y), ...extra }); }
  // the beds of the night and the room's reverb, as systems/Ambience.js mixes them
  atmosphere(mix) { Audio.setAmbience(mix); }

  // is a sound made at (x, y) heard through a wall or a closed door? (the player is the ear)
  walledOff(x, y) {
    const p = this.player;
    if (!p || x === undefined) return false;
    const d = Math.hypot(x - p.x, y - p.y);
    return d > 90 && d < 2400 && !this.lineOfSight(p.x, p.y, x, y);
  }
  // the run's clock: from `clockFrom` (0; level 2A's opening does not count: it starts as the car pulls away,
  // Drive.launch) to his death
  get runTime() { return Math.max(0, (this.endT ?? this.time) - (this.clockFrom || 0)); }
  shake(a) { this.camera.shake(a); }
  hitstop(s) { this.game.hitstop = Math.max(this.game.hitstop, s); }
  slowmo(scale, dur) { this.game.slowmo(scale, dur); }
  light(x, y, r, color, dur) { this.lights.push({ x, y, r, color, t: dur, dur }); }
  // run fn(e) every step for dur seconds (fountains, fires...)
  emit(x, y, dur, fn) { this.emitters.push({ x, y, t: dur, fn }); } // fn(e, dt), e: { x, y, t: s left }
  flashGlass(x, y) { this.light(x, y, 45, '#bff6ff', 0.08); }
  pickupFlash(x, y, color = PALETTE.cyan) {
    this.rings.push({ x, y, r: 2, max: 18, t: 0, dur: 0.25 });
    this.particles.sparks(x, y, 0, Math.PI, 8, 160, color);
    this.light(x, y, 40, color, 0.12);
  }
  // something guards may hear (routed by the Director). type: gunshot, glass, door, wall, explosion, thrown...
  noise(x, y, radius, source = null, type = null) {
    this.events.emit('noise', { x, y, radius, source, type });
  }
  addScore(points, x, y, label) { this.scoring.add(points, x, y, label); }

  // facades over the systems
  lineOfSight(x0, y0, x1, y1) { return lineOfSight(this, x0, y0, x1, y1); }
  // what eyes can make out: no wall in the way, no cloud either
  sightLine(x0, y0, x1, y1) { return this.lineOfSight(x0, y0, x1, y1) && !this.smoke.blocks(x0, y0, x1, y1) && !this.curtained(x0, y0, x1, y1); }
  // whether a curtain's cloth hangs across the line (systems/Curtains.js: parted wide enough, it does not)
  curtained(x0, y0, x1, y1) { return this.curtains.blocks(x0, y0, x1, y1); }
  canSeeCharacter(viewer, ch) { return canSeeCharacter(this, viewer, ch); }
  traceBullet(x0, y0, x1, y1, team, ignore, floor) { return traceBullet(this, x0, y0, x1, y1, team, ignore, floor); }
  explode(x, y, opts) { explode(this, x, y, opts); }
  damageWall(cx, cy, dmg, x, y, dirA, power) { damageWall(this, cx, cy, dmg, x, y, dirA, power); }
  destroyWall(cx, cy, dirA, power) { destroyWall(this, cx, cy, dirA, power); }
  destroyWindow(win, dirA, power) { destroyWindow(this, win, dirA, power); }
  detachDoor(door, dirA, power) { detachDoor(this, door, dirA, power); }
  destroyFence(f, dirA) { destroyFence(this, f, dirA); }

  // ---------------- deaths & level flow ----------------
  // how: the circumstances of the kill, when whoever did it knows them (a round's way there, a blow's side)
  // left: what is left of him (fx/Gore.js: 'corpse', 'headless', 'gibs')
  onKill(ch, cause, killer, how, left) {
    this.events.emit('kill', { victim: ch, cause, killer, how, left });
    if (ch.isPlayer) { this.endT = this.time; this.game.onPlayerDeath(cause, killer); return; }
    if (ch.isCivilian) return;
    // no spare magazine on a guard: a gun picked up holds what was left in it, and that is all (user: count your rounds).
    // The freeze and the slow motion of a kill are the blow's business (fx/Impact.js, data/feel.js).
    this.checkCleared();
  }

  // the last guard is dead or has given up: the way out opens
  checkCleared() {
    if (this.cleared || this.enemiesLeft > 0) return false;
    this.cleared = true;
    this.slowmo(0.22, 1.3);
    this.after(0.4, () => Audio.play('clear'));
    this.game.onCleared();
    return true;
  }

  // what moves without a body, for the picture drawn between two steps (engine/Interp.js): lists of things with x, y
  movers() {
    const M = this.moving || (this.moving = [null, null, null]);
    M[0] = this.particles.list; M[1] = this.projectiles; M[2] = this.critters.list;
    return M;
  }

  // ---------------- the getaway (systems/Outro) ----------------
  // the vehicle the level is left in: the one parked nearest the exit zone (within OUTRO.reach), in one piece and not
  // on fire; null if none
  getaway() {
    const ex = this.level.exit;
    if (!ex) return null;
    const x = ex.x * TILE, y = ex.y * TILE;
    let best = null, near = OUTRO.reach;
    for (const p of this.props) {
      if (!p.isVehicle || p.exploded || p.burning || p.moving) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < near) { best = p; near = d; }
    }
    return best;
  }

  // sprite x of the door one gets in by (the model's `door`, else the van's cab door)
  doorX(car) { return car.m.door?.[0] ?? OUTRO.door; }

  // where one stands to get in: by the door on the side of (x, y), on the other side if that one is against a wall
  cabDoor(car, x, y) {
    const r = PLAYER.radius + 3, near = car.toSprite(x, y).sy < car.h / 2 ? -r : car.h + r, dx = this.doorX(car);
    for (const sy of [near, car.h - near]) {
      const q = car.toWorld(dx, sy), out = car.toWorld(dx, sy + Math.sign(sy) * r);
      if (!this.map.solidAt(q.x, q.y) && !this.map.solidAt(out.x, out.y)) return q;
    }
    return car.toWorld(dx, near);
  }

  // the player stepped into the exit zone: from now on stepOutro runs him instead of the input; nothing can hurt him
  startOutro(car) {
    const p = this.player, ex = this.level.exit, a = car.body.angle;
    p.invulnerable = true;
    p.vaultHint = null;
    p.slide = null;
    p.releaseHands();
    this.ambient?.clearRoad(); // nothing driving on the street the getaway tears across
    this.outro = {
      t: 0, car, door: this.cabDoor(car, p.x, p.y), vault: false, inside: false,
      path: getawayPath(car.x, car.y, a, ex), fadeFrom: (ex.fade ?? OUTRO.fade) * TILE,
      s: 0, v: 0, slip: 0, slipV: 0, wag: 0, heading: a, fadeAt: null, hit: new Map(), ruts: null,
      box: new Gearbox(), lastV: 0, chirpT: 0, // its engine and tyres heard (motorState)
    };
  }

  stepOutro(dt) {
    const o = this.outro, p = this.player, v = o.car, O = OUTRO, t0 = o.t, t = (o.t += dt);
    if (!o.inside) {
      p.baseUpdate(dt);
      p.updateSlideAnim(dt);
      if (o.vault) this.vaultIn(o, dt);
      else if (!(p.vaulting && p.updateVault(dt))) {
        // he walks to the door (a vault of his own under way ends first)
        const dx = o.door.x - p.x, dy = o.door.y - p.y, d = Math.hypot(dx, dy);
        p.angle = d > 4 ? Math.atan2(dy, dx) : Math.atan2(v.y - p.y, v.x - p.x);
        p.steer(dx, dy, Math.min(PLAYER.speed, d * 0.3), PLAYER.accel);
        // an open car: over the door into the seat; a closed one: in by the door, and gone
        if (t >= O.walk) { if (v.m.cabin) this.startVaultIn(o); else this.boardGetaway(); }
      }
    } else if (!v.rider) Body.setPosition(p.body, v.toWorld(this.doorX(v) + 8, v.h / 2)); // riding in the cab
    if (p.riding) p.riding.key = keyK(t); // his hand to the ignition and back
    const exhaust = (n) => {
      for (const [sx, sy] of v.m.pipes || [[1, v.h * 0.7]]) {
        const e = v.toWorld(sx, sy);
        this.particles.smoke(e.x, e.y, n, 2, { speed: 14, size: 3.5, life: 1 });
      }
    };
    if (crossed(t0, t, O.lights)) {
      v.lightsOut = false;
      this.sound('crank', v.x, v.y, 1, { dur: O.catch - O.lights }); // the starter turns it over, then it catches
    }
    if (crossed(t0, t, O.catch)) { exhaust(3); this.shake(O.jolt[2]); this.events?.emit('ride', { beat: 'start', x: v.x, y: v.y }); }
    if (t >= O.catch && chance(t < O.go ? 0.08 : 0.3)) exhaust(1);
    v.bob = t >= O.lights && t < O.go ? Math.sin(this.time * (t < O.catch ? 16 : 38)) * 0.25 : 0; // cranking, then idling
    v.squat = squatAt(t);
    if (t >= O.go) this.driveOutro(o, t, dt);
    // its engine, gearbox and tyres, every step, fading with the picture
    const m = motorState(o, t, dt);
    if (m) Audio.motor('getaway', { ...m, x: v.x, y: v.y, fade: 1 - fadeAlpha(o) ** 1.5 });
  }

  // At the door of an open car: the game's own one-hand vault (Character.updateVault, CharacterAnim's speed vault),
  // scripted from where he stands to the seat: a hand on the door's top, the legs swung over it, and he drops in.
  startVaultIn(o) {
    const p = this.player, v = o.car, T = TRAVERSE.vault;
    if (Math.hypot(o.door.x - p.x, o.door.y - p.y) > PLAYER.radius) Body.setPosition(p.body, o.door);
    const from = { x: p.x, y: p.y }, to = v.seatSpot(), dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const dir = Math.atan2(to.y - from.y, to.x - from.x), c = Math.cos(dir), s = Math.sin(dir);
    // the planted hand: the free one (the left when the right holds something, else the one toward the car's nose)
    const side = angDiff(dir, v.body.angle) >= 0 ? 1 : -1, hand = p.def.hold !== 'none' ? -1 : side;
    const sill = v.sillSpot(v.toSprite(from.x, from.y).sy > v.h / 2);
    const plant = { x: sill.x - s * hand * T.out, y: sill.y + c * hand * T.out };
    p.vaulting = {
      from, to, t: 0, dur: OUTRO.vault, kind: 'prop', over: v, dir, dist, hoist: false, ladder: null, style: 'speed',
      roll: false, rolling: null, hands: [plant, plant], side, hand, plant, planted: false, legSide: -hand,
      m0: 0.5, m1: 0.15, landed: false, strike: null,
    };
    p.body.collisionFilter = { ...p.body.collisionFilter, mask: 0 };
    p.vel = { x: 0, y: 0 };
    o.vault = true;
    this.sound('doorVault', p.x, p.y, 0.8); // placeholder (assets/sound/PLACEHOLDERS.md)
  }

  // over the door: he turns to face the way the car points, and from OUTRO.sit of the way he settles into the seat
  // (the seated pose comes in under the vault's); down, he is in
  vaultIn(o, dt) {
    const p = this.player, v = o.car, vt = p.vaulting;
    p.angle += angDiff(p.angle, v.body.angle) * Math.min(1, dt * 9);
    if (vt && vt.t / vt.dur >= OUTRO.sit) {
      p.riding ??= { v, k: 0, aim: null, key: 0 };
      p.riding.k = Math.min(1, p.riding.k + dt / SEAT.settle);
    }
    if (!p.updateVault(dt)) this.boardGetaway();
  }

  // the car along its route (stepOutro, from OUTRO.go on): where it is (Outro.driveStep), what it runs into, and
  // what its wheels do to the floor and throw up (OUTRO.fx; their squeal: motorState)
  driveOutro(o, t, dt) {
    const v = o.car, O = OUTRO, F = O.fx, path = o.path;
    const at = driveStep(o, path, t, dt), q = at.q, off = o.slip + o.wag, slide = Math.abs(off);
    v.driveTo(at.x, at.y, at.a);
    v.steer = clamp(q.turn * 0.25 - off * 1.1, -0.5, 0.5); // the front wheels: into the bend, against the slide
    v.wake = { x: Math.cos(q.a) * o.v, y: Math.sin(q.a) * o.v }; // (px/step: the papers it drags, systems/Papers.js)
    const hits = o.s < path.length ? v.ram(q.a, o.hit, O.ram, (e, x, y, dir) => this.rammed(e, x, y, dir), o.v) : 0;
    if (hits) this.shake(O.ram.shake);
    const spin = spinK(t), sliding = spin > 0 || slide > O.smoke, back = at.a + Math.PI;
    const wheels = v.m.wheels.map(([sx, sy]) => v.toWorld(sx, sy)), rear = wheels.slice(0, 2);
    if (sliding) {
      // white tyre smoke billowing behind, rubber laid on the floor: it stays
      const [n, size, life] = spin > 0 ? F.spinSmoke : F.slideSmoke;
      for (const r of rear) {
        const puffs = spin > 0 ? Math.round(n * spin) : chance(n) ? 1 : 0;
        if (puffs) this.particles.smoke(r.x + Math.cos(back) * 6, r.y + Math.sin(back) * 6, puffs, 4, { speed: 24 + 30 * spin, size, life });
      }
      if (o.ruts) {
        const xs = [...rear, ...o.ruts].map((r) => r.x), M = O.marks, from = o.ruts;
        this.decals.paint?.((g) => {
          g.strokeStyle = `rgba(${M.color}, ${spin > 0 ? M.spin : M.slide})`;
          g.lineWidth = M.w;
          g.lineCap = 'round';
          rear.forEach((r, i) => { g.beginPath(); g.moveTo(from[i].x, from[i].y); g.lineTo(r.x, r.y); g.stroke(); });
        }, 'floor', Math.min(...xs) - M.w, Math.max(...xs) + M.w);
        o.marks = (o.marks || 0) + 1;
      }
    }
    o.ruts = sliding ? rear : null;
    // grit thrown back by the rear wheels from the launch on, a while
    if (t < O.go + O.spin + F.grit.dur) {
      for (const r of rear) {
        if (chance(F.grit.chance)) this.particles.chips(r.x, r.y, back, 0.45, 1, F.grit.colors[Math.floor(Math.random() * F.grit.colors.length)], F.grit.speed * (0.4 + 0.6 * Math.max(spin, o.v / O.speed)));
      }
    }
    // a wheel through standing water: spray, a ring left behind
    if (this.liquids && o.v > 1) {
      for (const r of wheels) {
        const wet = chance(F.spray[0]) && this.liquids.at(r.x, r.y), splash = wet && this.liquids.cfg.kinds[wet.kind]?.splash;
        if (!splash) continue;
        this.particles.drops(r.x, r.y, back + (Math.random() < 0.5 ? 1 : -1) * 0.9, 0.7, F.spray[1], splash, F.spray[2], 5, false);
        this.liquids.ripple(r.x, r.y);
      }
    }
    // far out, the tail's low corner drags on the ground
    if (slide > F.sparks.from && chance(F.sparks.chance)) {
      const c = v.toWorld(3, off > 0 ? 5 : v.h - 5);
      this.particles.sparks(c.x, c.y, back, 0.7, F.sparks.n, 220);
    }
    // the first hard swing: what lay on the rear seat flies out, to the side the tail goes, and stays where it lands
    if (v.hat && Math.abs(o.slip) >= O.hat.slip) {
      const sg = Math.sign(o.slip), sp = o.v * 60 * O.hat.keep;
      const vx = Math.cos(q.a) * sp + Math.sin(at.a) * sg * O.hat.side, vy = Math.sin(q.a) * sp - Math.cos(at.a) * sg * O.hat.side;
      v.throwHat(Math.atan2(vy, vx), Math.hypot(vx, vy));
      this.sound('hatFly', v.x, v.y, 0.6); // placeholder (assets/sound/PLACEHOLDERS.md)
      o.hatAt = t;
    }
    if (o.fadeAt === null && o.s >= path.length - o.fadeFrom) o.fadeAt = t;
  }

  // a thing the getaway ran into (Vehicle.ram): sheets of paper fly off it, steel throws sparks; a car is a blow the
  // getaway feels (a little of its speed lost, the camera shaken and pushed in)
  rammed(e, x, y, dir) {
    const R = OUTRO.ram;
    if (e.isVehicle) {
      this.outro.v *= R.carKeep;
      this.shake(R.carShake);
      this.camera.punch(R.punch);
      this.events?.emit('ride', { beat: 'ram', x, y });
      return;
    }
    if (!e.def) return;
    this.papers?.drop(x, y, R.papers[0], dir, R.papers[1]);
    if (e.def.material === 'metal' || e.def.sound === 'metal') this.particles.sparks(x, y, dir, 1, 6, 260);
  }

  // He is in. A closed car: by the door, no longer seen. An open one: sat at the wheel, the car carries him and draws
  // him (Vehicle.seatIn). Either way no body, out of `chars` and `hidden` (not drawn with the others, no light of
  // his own, no laser).
  boardGetaway() {
    const o = this.outro, p = this.player, v = o.car, open = !!v.m.cabin, at = open ? v.seatSpot() : o.door;
    o.inside = true;
    p.vel = { x: 0, y: 0 };
    Body.setVelocity(p.body, p.vel);
    Body.setPosition(p.body, at);
    p.hidden = true;
    this.removeBody(p.body);
    const i = this.chars.indexOf(p);
    if (i >= 0) this.chars.splice(i, 1);
    if (open) {
      v.seatIn(p);
      this.sound('seatDrop', at.x, at.y, 0.7); // placeholder (assets/sound/PLACEHOLDERS.md)
      return;
    }
    this.sound('carHit', at.x, at.y, 0.5);
    this.particles.dust(at.x, at.y, 6, 6, '#6a6272', { speed: 30, size: 3, life: 0.5, alpha: 0.2 });
  }

  // ---------------- simulation ----------------
  step(dt, input, aim) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.t <= this.time);
      this.timers = this.timers.filter((t) => t.t > this.time);
      for (const t of due) t.fn();
    }
    // 1. intentions (input, AI)
    if (this.outro) this.stepOutro(dt);
    else if (this.drive) this.drive.step(dt, input, aim); // at the wheel (systems/Drive.js)
    else if (this.player.alive) this.player.update(dt, input, aim);
    else this.player.baseUpdate(dt);
    this.pursuit?.step(dt);
    this.lorries?.step(dt);
    this.chaseCam?.step();
    this.signals.step();
    this.director.update(dt);
    for (const e of this.enemies) e.update(dt);
    this.ambient?.update(dt);
    for (const c of this.chars) if (c.alive) c.animate(dt); // the drawn body after this step's aim (Facing.js)

    // 2. physics (characters walking into loose props and door leaves push them with their limited force first)
    this.propPhysics.prePush(dt);
    this.doorWork.prePush(dt);
    this.physics.step(dt, this.time);
    for (const d of this.doors) d.constrain(dt);
    if (this.wallsDirty) {
      this.wallsDirty = false;
      this.physics.remove(this.wallBodies);
      this.wallBodies = this.map.buildBodies();
      this.addBody(this.wallBodies);
    }

    // 3. entities reacting to the new state
    for (const it of this.items) if (!it.dead) it.update(dt);
    for (const a of this.ammoItems) if (!a.dead) a.update(dt);
    for (const p of this.projectiles) p.update(dt);
    for (const d of this.debris) if (!d.dead) d.update(dt);
    for (const c of this.corpses) if (!c.dead) c.update(dt);
    for (const p of this.props) if (p.update) p.update(dt);
    if (this.drive) {
      // what the van ran into, the end of the road; its engine heard
      this.drive.after(dt);
      Audio.motor('drive', this.drive?.motor(dt) ?? null);
    }
    this.pursuit?.after(dt);
    this.carFx.update(dt);
    for (const e of this.emitters) { e.t -= dt; e.fn(e, dt); }
    this.particles.update(dt);
    this.decals.update(dt);
    this.scoring.update(dt);
    this.impacts.update(dt);
    this.liquids.update(dt);
    this.propPhysics.update(dt);
    this.alarms.update(dt);
    this.power.update();
    this.critters.update(dt);
    this.sirens.update(dt);
    this.ambience.update(dt);
    this.tutorial?.update();
    this.fireSpread.update(dt);
    this.fires.update(dt);
    this.slips.update();
    this.sprinklers.update(dt);
    this.jukebox.update(dt);
    this.gasValve.update(dt);
    this.poolBalls.update(dt);
    this.clutter.update(dt);
    this.steam.update(dt);
    this.papers.update(dt);
    this.litter.update(dt);
    this.curtains.update(dt);
    this.weather.update();
    this.smoke.update(dt);
    this.threats.update(this.view());

    // 4. cleanup
    this.emitters = this.emitters.filter((e) => e.t > 0);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.items = this.items.filter((i) => !i.dead);
    this.ammoItems = this.ammoItems.filter((a) => !a.dead);
    this.debris = this.debris.filter((d) => !d.dead);
    this.corpses = this.corpses.filter((c) => !c.dead);
    this.props = this.props.filter((p) => !p.dead);
    for (const l of this.lights) l.t -= dt;
    this.lights = this.lights.filter((l) => l.t > 0);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const t of this.texts) { t.t -= dt; t.y -= dt * 18; }
    this.texts = this.texts.filter((t) => t.t > 0);

    // 5. level flow
    // (exit.open: a way out that needs no clearing: the lab's getaway)
    if ((this.cleared || this.level.exit?.open) && !this.exited && this.player.alive && this.level.exit && !this.drive) {
      const ex = this.level.exit;
      if (Math.hypot(this.player.x - ex.x * TILE, this.player.y - ex.y * TILE) < ex.r * TILE) {
        this.exited = true;
        this.game.onExit();
      }
    }
  }

  // world rectangle on screen: centre and half sizes
  view() {
    const c = this.camera, v = this.viewRect || (this.viewRect = { x: 0, y: 0, hw: 0, hh: 0 });
    v.x = c.x; v.y = c.y; v.hw = c.w / c.z / 2; v.hh = c.h / c.z / 2;
    return v;
  }

  draw(ctx, cam, t) { this.renderer.draw(ctx, cam, t); }
}
