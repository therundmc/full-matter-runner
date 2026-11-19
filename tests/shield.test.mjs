// The human shield (SHIELD in data/feel.js, systems/Shield.js, Player.startShield .. endShield): E behind a guard with a
// hand free takes him; held, he slows the player, takes what comes from the front and dies of it; the click kills
// him, the right click throws him; the guards hold their fire a moment, the melee ones come round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }) }) };
const { default: Player } = await load('game/entities/Player.js');
const { default: Enemy } = await load('game/entities/Enemy.js');
const { default: Projectile } = await load('game/entities/Projectile.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Tutorial, HINTS } = await load('game/systems/Tutorial.js');
const { default: level } = await load('game/data/levels/tutorial.js');
const { SHIELD } = await load('game/data/feel.js');
const { LESSONS } = await load('game/data/staging.js');
const { PLAYER, ENEMY, TAKEDOWN } = await load('game/Config.js');
const { WEAPONS, oneHanded } = await load('game/data/weapons.js');
const { SCORING } = await load('game/data/scoring.js');
const { KBM_CONTROLS, PAD_CONTROLS } = await load('game/data/controls.js');
const { offers, covers, hesitation, flankSide, bodyHits } = await load('game/systems/Shield.js');
const { killStyle, killTags } = await load('game/systems/Scoring.js');
const { killTier } = await load('game/systems/KillCam.js');
const { throwSpeed } = await load('game/systems/Kick.js');

const noop = () => {};
const sink = new Proxy({}, { get: () => noop });
const DT = 1 / 60;
const quiet = { now: 100, dodgeT: -99, pickT: -99, streak: 1 };

function world() {
  const told = [], sounds = [];
  const w = {
    told, sounds, particles: sink, decals: sink, events: new EventBus(), time: 0, timers: [], light: noop, shake: noop, noise: noop, hitstop: noop,
    camera: { punch: noop, push: noop }, slowmo: noop, sound: (n) => sounds.push(n),
    after(s, fn) { this.timers.push({ t: this.time + s, fn }); },
    map: { solidAt: () => false, raycast: () => null, isWallChar: () => false, at: () => '.' }, lineOfSight: () => true, sightLine: () => true,
    traceBullet: () => null,
    props: [], items: [], corpses: [], debris: [], uses: { near: () => null }, windows: [], fences: [], ladders: [], doors: [],
    director: { phase: 'combat', release: noop, provoked: false },
    aimStyle: 'cross', aimMark: false, enemies: [], chars: [],
    addBody: noop, removeBody: noop, addItem(it) { this.items.push(it); }, removeItem(it) { it.dead = true; }, pickupFlash: noop,
    addDebris(d) { this.debris.push(d); },
  };
  for (const name of ['shield', 'shieldKill', 'thrownHit']) w.events.on(name, (e) => told.push([name, e]));
  w.characters = () => w.chars;
  return w;
}

function player(w, type = 'fists') {
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, recoil: 0,
    body: Matter.Bodies.circle(0, 0, 10), radius: 10, nearItem: null, slideCd: 0, winded: 0, stamina: 1, safe: { x: 0, y: 0 }, sit: 0,
    vel: { x: 0, y: 0 }, cooldown: 0, swing: 0, throwT: 0, throwDur: 0.28, throwHold: null, ammo: { '9mm': 0, '12g': 0 }, held: null,
    lunge: null, facingLock: null, snatch: null, shield: null, nearShield: null, reloading: 0,
    baseUpdate() {}, unstick() {}, updateVault: () => false });
  p.setWeapon(type);
  w.player = p;
  w.chars.push(p);
  return p;
}

// a guard 20 px ahead of the player, his back to him (angle 0) unless told otherwise
function guard(w, x = 20, y = 0, more = {}) {
  const g = {
    alive: true, team: 'enemy', isEnemy: true, kind: 'thug', aware: 0, meter: 0, radius: 10, held: null, knocked: 0, angle: 0, voice: 1,
    barkT: 0, said: [], dropped: 0, body: Matter.Bodies.circle(x, y, 10),
    get x() { return this.body.position.x; }, get y() { return this.body.position.y; },
    // (the way the score and the kill cam read it at that very moment: still in his arms or not)
    kill(a, cause, killer, by, how) {
      Object.assign(this, { alive: false, cause, killer, by, how, style: killStyle({ cause, killer, victim: this, how }),
        tags: killTags({ killer, victim: this, how }, quiet), tier: killTier({ victim: this, cause, killer, how }) });
    },
    knock(a, cause, opt = {}) {
      Object.assign(this, { knocked: 2, knockedBy: cause, downAngle: a });
      Matter.Body.setVelocity(this.body, { x: Math.cos(a) * (opt.speed ?? 4), y: Math.sin(a) * (opt.speed ?? 4) });
    },
    say(kind) { this.said.push(kind); return true; }, dropWeapon() { this.dropped++; }, freed() { this.free = true; },
    ...more,
  };
  w.enemies.push(g);
  w.chars.push(g);
  return g;
}

const idle = { down: () => false, hit: () => false, mouseDown: () => false, mouseHit: () => false, move: () => null };
const AHEAD = { x: 100, y: 0 };
// steps of the player; `first`: what is pressed on the first of them only
function steps(w, p, n, input = idle, first = null, aim = AHEAD) {
  for (let i = 0; i < n; i++) {
    p.update(DT, i === 0 && first ? first : input, aim);
    p.cooldown = Math.max(0, p.cooldown - DT);
    w.time += DT;
  }
}
const pressE = { ...idle, hit: (k) => k === 'KeyE' };
const click = { ...idle, mouseHit: (b) => b === 0, mouseDown: (b) => b === 0 };
// a round of `by` flying along a, as Projectile meets the player: whether it stopped there without touching him
function round(w, p, a, by = WEAPONS.pistol, owner = { x: -Math.cos(a) * 200, y: -Math.sin(a) * 200, weapon: { mag: 3 } }) {
  const pr = Object.create(Projectile.prototype);
  Object.assign(pr, { world: w, angle: a, weapon: by, owner, ignore: new Set(), kills: 0, through: false, bounced: false, energy: 10, energy0: 10 });
  const hits = p.hits ?? 0;
  p.shot = () => { p.hits = (p.hits ?? 0) + 1; };
  const r = pr.onHit({ kind: 'char', target: p, x: p.x, y: p.y });
  return r === true && (p.hits ?? 0) === hits;
}
function held(type = 'fists') {
  const w = world(), p = player(w, type), g = guard(w);
  steps(w, p, 1, idle, pressE);
  assert.equal(p.shield?.target, g);
  steps(w, p, 15);
  return { w, p, g };
}

test('shield: the rules - who offers it, what a hand is free for, what the arc covers', () => {
  assert.ok(oneHanded(WEAPONS.fists) && oneHanded(WEAPONS.pistol) && oneHanded(WEAPONS.uzi) && oneHanded(WEAPONS.knife) && oneHanded(WEAPONS.cue_half));
  for (const t of ['bat', 'cue', 'tire_iron', 'tire_iron_bent', 'shotgun', 'rifle', 'sniper', 'bazooka']) assert.equal(oneHanded(WEAPONS[t]), false, t);
  const p = { x: 0, y: 0, angle: 0 }, e = { x: 20, y: 0, angle: 0, alive: true, isEnemy: true, knocked: 0 };
  assert.ok(offers(p, e), 'right behind him');
  assert.equal(offers(p, { ...e, angle: Math.PI }), false, 'face to face');
  assert.equal(offers(p, { ...e, x: SHIELD.reach + 4 }), false, 'out of reach');
  assert.equal(offers(p, { ...e, boss: true }), false, 'never a boss');
  assert.equal(offers(p, { ...e, traits: {} }), false, 'nor a named one (CUEBALL)');
  assert.equal(offers(p, { ...e, isEnemy: false, isCivilian: true }), false, 'nor a passer-by');
  assert.equal(offers(p, { ...e, yielded: true }), false);
  assert.equal(offers(p, { ...e, held: {} }), false);
  assert.ok(offers(p, { ...e, angle: Math.PI, knocked: 2 }), 'a man down, whichever way he lies');
  assert.equal(SHIELD.reach, TAKEDOWN.reach, "the takedown's reach");
  assert.ok(covers(0, Math.PI) && covers(0, Math.PI + 1.2) && covers(0, Math.PI - 1.2), 'what comes from the front, 70 degrees either side');
  assert.ok(!covers(0, Math.PI + 1.3) && !covers(0, Math.PI / 2) && !covers(0, 0), 'not from the side, not from behind');
});

test('shield: E behind a standing guard takes him with empty hands or a handgun; not with a bat, not facing him, never a boss', () => {
  for (const type of ['fists', 'pistol', 'uzi', 'knife']) {
    const w = world(), p = player(w, type), g = guard(w);
    steps(w, p, 1);
    assert.equal(p.nearShield, g, `offered with ${type}`);
    steps(w, p, 1, idle, pressE);
    assert.equal(p.shield?.target, g, type);
    assert.equal(g.held, p);
    assert.equal(p.weapon?.type ?? 'fists', type, 'what he holds stays in his hand');
    assert.ok(w.sounds.includes('shieldGrab') && w.told.some(([n, e]) => n === 'shield' && e.target === g));
    assert.ok(w.director.provoked);
  }
  for (const [type, more, why] of [['bat', {}, 'two hands on a bat'], ['shotgun', {}, 'a long gun'], ['fists', { angle: Math.PI }, 'facing him'],
    ['fists', { boss: true }, 'a boss']]) {
    const w = world(), p = player(w, type), g = guard(w, 20, 0, more);
    steps(w, p, 2, idle, pressE);
    assert.equal(p.nearShield, null, why);
    assert.equal(p.shield, null, why);
    assert.equal(g.held, null);
  }
});

test('shield: a man down is hauled up off the floor; E keeps its other uses when nobody offers it', () => {
  const w = world(), p = player(w), g = guard(w, 18, 0, { angle: Math.PI, knocked: 2, dazed: true });
  steps(w, p, 1, idle, pressE);
  assert.equal(p.shield?.target, g);
  assert.ok(g.knocked === 0 && !g.dazed);
  const w2 = world(), p2 = player(w2);
  let used = 0;
  w2.uses.near = () => ({ use: () => { used++; } });
  w2.uses.at = () => ({ x: 5, y: 0 });
  steps(w2, p2, 1, idle, pressE);
  assert.equal(used, 1, 'no guard: E uses the device');
});

test('shield: held in front of him and turned with the aim; he walks at the move share and SPACE does nothing', () => {
  const { w, p, g } = held();
  assert.ok(Math.abs(g.x - SHIELD.gap) < 0.5 && Math.abs(g.y) < 0.5, 'in front of him');
  steps(w, p, 1, idle, null, { x: 0, y: 100 });
  assert.ok(Math.abs(g.y - SHIELD.gap) < 0.5 && Math.abs(g.x) < 0.5 && Math.abs(g.angle - Math.PI / 2) < 1e-6, 'he goes where the aim goes');
  const asked = [];
  p.steer = (dx, dy, sp) => asked.push(sp);
  let slid = 0, vaulted = 0;
  p.startSlide = () => { slid++; };
  p.tryVault = () => { vaulted++; return false; };
  const run = { ...idle, down: (k) => k === 'KeyD', hit: (k) => k === 'Space' };
  steps(w, p, 3, run);
  assert.ok(asked.every((sp) => Math.abs(sp - PLAYER.speed * SHIELD.move) < 1e-9), 'slowed');
  assert.equal(slid + vaulted, 0, 'SPACE: no slide, no vault');
  assert.equal(p.vaultHint, null);
  assert.equal(p.nearTakedown, null);
  p.endShield();
  steps(w, p, 1, run);
  assert.equal(slid + vaulted > 0, true, 'let go, SPACE is his again');
});

test('shield: a round from the front hits the hostage, one from the side or from behind hits the player', () => {
  const { w, p } = held();
  assert.equal(round(w, p, Math.PI), true, 'head on: stopped');
  assert.equal(p.shield.hp, SHIELD.hp - 1);
  assert.equal(round(w, p, Math.PI + 1.1), true, 'within the arc');
  assert.equal(round(w, p, 0), false, 'from behind: his');
  assert.equal(round(w, p, Math.PI / 2), false, 'from the side: his');
  assert.equal(p.hits, 2);
  assert.equal(p.shield.hp, SHIELD.hp - 2, 'those two cost the hostage nothing');
});

test('shield: three rounds kill him in the arms, his body stops two more, then slips to the floor', () => {
  const { w, p, g } = held('pistol');
  const shooter = { x: 200, y: 0, weapon: { mag: 5 } };
  for (let i = 0; i < SHIELD.hp; i++) assert.equal(round(w, p, Math.PI, WEAPONS.pistol, shooter), true);
  assert.ok(p.shield?.dead && g.alive && g.dropped === 1, 'dead in his arms: his gun falls, the body is still held');
  assert.equal(p.shieldHint(), null, 'a loaded gun still fires past him');
  for (let i = 0; i < SHIELD.corpse - 1; i++) assert.equal(round(w, p, Math.PI, WEAPONS.pistol, shooter), true);
  assert.ok(p.shield, 'one more it still stops');
  assert.equal(round(w, p, Math.PI, WEAPONS.pistol, shooter), true);
  assert.equal(p.shield, null, 'it slips to the floor: his hands are free');
  assert.ok(!g.alive && g.killer === shooter && g.how.hostage && g.how.still && g.held === null);
  assert.deepEqual([g.style, g.tags], [{ style: 'humanShield', method: 'hostage' }, ['hostage']], 'killed by his own: HOSTAGE');
  assert.equal(g.tier, null, 'no kill cam for it');
  assert.equal(round(w, p, Math.PI, WEAPONS.pistol, shooter), false, 'the next one is his');
  assert.ok(SCORING.styles.humanShield.points > 0 && SCORING.tags.hostage.label === 'HOSTAGE' && SCORING.tags.shield.label === 'SHIELD');
});

test('shield: a shotgun blast is one hit that kills him; its pellets are not counted one by one', () => {
  const { w, p, g } = held();
  const shooter = { x: 200, y: 0, weapon: { mag: 5 } };
  for (let i = 0; i < 8; i++) assert.equal(round(w, p, Math.PI + (i - 4) * 0.03, WEAPONS.shotgun, shooter), true);
  assert.ok(p.shield.dead && g.alive && p.shield.cover === SHIELD.corpse, 'one blast: dead, the body whole');
  w.time += 1;
  for (let i = 0; i < 8; i++) round(w, p, Math.PI, WEAPONS.shotgun, shooter);
  assert.ok(p.shield && p.shield.cover === SHIELD.corpse - 1, 'a second blast is one hit on the body');
  assert.equal(p.hits ?? 0, 0);
  // a heavy round goes through the two
  const h = held();
  assert.equal(round(h.w, h.p, Math.PI, WEAPONS.sniper), false);
  assert.ok(h.p.shield.dead);
});

test('shield: a thing thrown at them lands on the hostage', () => {
  const { p } = held();
  assert.equal(p.shieldStops(Math.PI, null, { x: 200, y: 0 }), true);
  assert.equal(p.shield.hp, SHIELD.hp - SHIELD.thrown);
  assert.equal(p.shieldStops(0, null, { x: -200, y: 0 }), false);
});

test('shield: the click breaks his neck with empty hands, cuts his throat with a blade, fires past him with a gun', () => {
  const a = held();
  assert.equal(a.p.contextAction, 'BREAK HIS NECK');
  steps(a.w, a.p, 1, idle, click);
  assert.ok(!a.g.alive && a.p.shield === null && a.g.held === null);
  assert.deepEqual([a.g.cause, a.g.how.label, a.g.how.close], ['snap', 'NECK SNAP', true]);
  assert.deepEqual(a.g.style, { style: 'takedown', method: 'takedown' }, 'scored as a takedown');
  assert.equal(a.g.tier, 'exec', "the kill cam's exec tier");
  assert.ok(a.w.sounds.includes('shieldNeck') && a.w.told.some(([n]) => n === 'shieldKill'));
  const b = held('knife');
  assert.equal(b.p.contextAction, 'CUT HIS THROAT');
  steps(b.w, b.p, 1, idle, click);
  assert.deepEqual([b.g.alive, b.g.cause, b.g.by.wound, b.g.how.label], [false, 'slash', 'throat', 'THROAT CUT']);
  assert.equal(b.p.weapon.type, 'knife');
  const c = held('pistol');
  let fired = 0;
  c.p.attack = () => { fired++; return true; };
  assert.equal(c.p.contextAction, null);
  steps(c.w, c.p, 1, idle, click);
  assert.ok(fired === 1 && c.g.alive && c.p.shield, 'the gun fires, he is still held');
  // a kill made with another man held is tagged; the man held himself is not
  assert.ok(killTags({ killer: c.p, victim: {}, how: {} }, quiet).includes('shield'));
  assert.ok(!killTags({ killer: c.p, victim: c.g, how: {} }, quiet).includes('shield'));
  assert.ok(!killTags({ killer: a.p, victim: {}, how: {} }, quiet).includes('shield'));
});

test('shield: his own rounds go past the man he holds', () => {
  const { w, p, g } = held('pistol');
  const shots = [];
  w.addProjectile = (pr) => shots.push(pr);
  w.fx = null;
  p.muzzlePos = () => ({ x: 14, y: 6, a: 0 });
  p.eject = noop;
  p.weapon.mag = 3;
  try { p.fire(WEAPONS.pistol); } catch { /* the flash needs a real world: the round is out already */ }
  assert.ok(shots.length === 1 && shots[0].ignore.has(g));
});

test('shield: the right click throws him - a tap at once, a hold further; he is floored, and floors the man he runs into', () => {
  const tap = held();
  steps(tap.w, tap.p, 2, idle, { ...idle, mouseHit: (b) => b === 2 });
  assert.ok(tap.p.shield === null && tap.g.alive && tap.g.knocked > 0 && tap.g.knockedBy === 'thrown' && tap.g.held === null);
  assert.ok(tap.g.flung?.by === tap.p && !tap.g.free, 'thrown, not let go on his feet');
  const v0 = Math.hypot(tap.g.body.velocity.x, tap.g.body.velocity.y);
  assert.ok(Math.abs(v0 - throwSpeed(SHIELD.throw.dist[0], ENEMY.knockBrake)) < 1e-6 && tap.g.body.velocity.x > 0, 'along the aim, the short throw');
  assert.ok(tap.w.sounds.includes('shieldThrow'));
  const full = held('pistol');
  const hold = { ...idle, mouseDown: (b) => b === 2 };
  steps(full.w, full.p, 40, hold, { ...hold, mouseHit: (b) => b === 2 });
  assert.ok(full.p.shield && full.p.throwHold, 'wound up, he is still held');
  steps(full.w, full.p, 1);
  const v1 = Math.hypot(full.g.body.velocity.x, full.g.body.velocity.y);
  assert.ok(Math.abs(v1 - throwSpeed(SHIELD.throw.dist[1], ENEMY.knockBrake)) < 1e-6 && v1 > v0, 'the full throw');
  assert.equal(full.p.weapon.type, 'pistol', 'his gun stays in his hand');
  // in flight he floors the standing man he runs into, once
  const g = full.g, other = guard(full.w, g.x + 15, 0), far = guard(full.w, g.x + 200, 0);
  assert.deepEqual(bodyHits(g, full.w.enemies), [other]);
  Enemy.prototype.updateFlung.call(Object.assign(g, { world: full.w }));
  assert.ok(other.knocked > 0 && other.knockedBy === 'body' && far.knocked === 0);
  assert.equal(g.flung, null);
  assert.ok(Math.hypot(g.body.velocity.x, g.body.velocity.y) < v1 * 0.5, 'it takes most of his speed');
  assert.ok(full.w.told.some(([n, e]) => n === 'thrownHit' && e.victim === other && e.thrower === full.p && !e.kill), 'the throw has its beat');
  assert.ok(SCORING.knock.body > 0 && SCORING.knockLabels.body === 'BODY THROW');
  // too slow, he floors nobody
  const slow = guard(full.w, 500, 0, { flung: { by: full.p, a: 0 } }), near = guard(full.w, 510, 0);
  Enemy.prototype.updateFlung.call(Object.assign(slow, { world: full.w }));
  assert.ok(near.knocked === 0 && slow.flung === null);
});

test('shield: a man dead in his arms is thrown as a body, or dropped by the click', () => {
  const a = held();
  for (let i = 0; i < SHIELD.hp; i++) round(a.w, a.p, Math.PI);
  assert.equal(a.p.shieldHint(), 'DROP HIM');
  steps(a.w, a.p, 1, idle, click);
  assert.ok(a.p.shield === null && !a.g.alive && a.g.how.hostage && a.g.how.still);
  const b = held();
  for (let i = 0; i < SHIELD.hp; i++) round(b.w, b.p, Math.PI);
  steps(b.w, b.p, 2, idle, { ...idle, mouseHit: (k) => k === 2 });
  assert.ok(b.p.shield === null && !b.g.alive && b.g.how.hostage && !b.g.how.still && !(b.g.knocked > 0));
});

test('shield: killed, taken over by the getaway or robbed of him by a blast, the hold ends cleanly', () => {
  const a = held();
  a.p.invulnerable = false;
  a.w.onKill = noop;
  try { a.p.kill(0, 'bullet', null, {}, {}); } catch { /* his own death needs a real world: the man is let go first */ }
  assert.ok(a.p.shield === null && a.g.alive && a.g.held === null && a.g.free, 'the man is let go alive and turns on him');
  const b = held('pistol');
  b.p.throwHold = { t: 0.2, paused: false };
  b.p.releaseHands();
  assert.ok(b.p.shield === null && b.p.throwHold === null && b.g.free && b.p.weapon.type === 'pistol');
  const c = held();
  c.g.alive = false; // a blast
  steps(c.w, c.p, 1);
  assert.equal(c.p.shield, null);
  assert.equal(c.p.body.collisionFilter.group, 0);
});

test('shield: a gunman holds his fire at a comrade held for `hesitate` s, a brute far less; a dead hostage holds nobody', () => {
  assert.equal(hesitation('thug'), SHIELD.hesitate);
  assert.equal(hesitation('brute'), SHIELD.brute);
  assert.ok(SHIELD.brute < SHIELD.hesitate);
  const { w, p, g } = held();
  const man = (kind) => ({ world: w, kind, hostage: null, barkT: 1, said: [], say(k) { this.said.push(k); return true; } });
  const thug = man('thug'), brute = man('brute'), fires = (e) => !Enemy.prototype.holdsFire.call(e, p);
  const t0 = w.time;
  assert.ok(!fires(thug) && !fires(brute), 'both hold at first');
  assert.deepEqual(thug.said, ['release'], 'LET HIM GO!');
  assert.ok(g.said.includes('hostage'), "DON'T SHOOT! from the man held");
  w.time = t0 + SHIELD.brute + 0.02;
  assert.ok(fires(brute) && !fires(thug), 'the brute fires anyway');
  w.time = t0 + SHIELD.hesitate - 0.02;
  assert.ok(!fires(thug));
  w.time = t0 + SHIELD.hesitate + 0.02;
  assert.ok(fires(thug), 'then he fires through his comrade');
  assert.equal(thug.said.length, 1, 'said once');
  // a comrade in the line of fire is spared, the hostage is not
  const e = { world: w, x: 200, y: 0 };
  assert.equal(Enemy.prototype.friendInLine.call(e, p.x, p.y, 200), false);
  g.held = null;
  assert.equal(Enemy.prototype.friendInLine.call(e, p.x, p.y, 200), true);
  g.held = p;
  // dead in the arms: nothing holds them
  const late = man('thug');
  p.shield.dead = { a: 0, by: {}, killer: null };
  assert.ok(fires(late) && late.said.length === 0);
  // nobody held: no hesitation at all
  assert.ok(!Enemy.prototype.holdsFire.call(man('thug'), { shield: null }));
});

test('shield: a man with a blade comes round to the open side, not straight at the hostage', () => {
  const p = { x: 0, y: 0, angle: 0 };
  assert.equal(flankSide(p, { x: 100, y: 20 }), 1, 'ahead and to his right: on round by the right');
  assert.equal(flankSide(p, { x: 100, y: -20 }), -1);
  assert.equal(flankSide(p, { x: 100, y: 0 }, -1), -1, 'dead ahead: the side given');
  assert.equal(flankSide(p, { x: -100, y: 5 }), 0, 'behind him already');
  assert.equal(flankSide(p, { x: 0, y: 100 }), 0, 'on his side: straight in');
  assert.equal(flankSide(p, { x: SHIELD.flank.near - 5, y: 0 }), 0, 'on him: he strikes');
  assert.equal(flankSide(p, { x: SHIELD.flank.far + 5, y: 0 }), 0);
});

test('shield: the controls page lists it in FIGHT, for the keyboard and the pad', () => {
  const fight = (page) => page[0].find(([name]) => name === 'FIGHT')[1];
  assert.ok(fight(KBM_CONTROLS).some(([cap, what]) => cap === 'E' && what === 'SHIELD (FROM BEHIND)'));
  assert.ok(fight(PAD_CONTROLS).some(([cap, what]) => cap === 'X' && what === 'SHIELD (FROM BEHIND)'));
});

test('shield: the tutorial - a man on the landing with his back to the fire door, and taking him calls the stair men', () => {
  const T = level.tutorial, last = T.stages[T.stages.length - 1];
  assert.equal(level.actors[14][9], 'p', 'a pistol');
  assert.equal(level.facing['9,14'], 180, 'looking west down the corridor');
  assert.deepEqual(level.stand['9,14'], [9.4, 14.6]);
  assert.deepEqual(last.waves[0], { at: [[9, 14]], on: 'never', blind: true });
  assert.deepEqual(last.waves.slice(1).map((w) => [w.on, w.at.length]), [['shield', 2]], 'the two men of the stairs, nobody after them');
  assert.equal(last.hints[0], 'shield');
  assert.ok(LESSONS.shield && HINTS.shield);
  // the trigger: taken as a shield, or dead some other way
  for (const how of ['shield', 'kill']) {
    const mk = (c, r, more) => ({ x: (c + 0.5) * 32, y: (r + 0.5) * 32, alive: true, knocked: 0, aware: 0, body: {}, hear() { this.heard = true; }, spot() {}, say() {}, speak() {}, ...more });
    const hostage = mk(9, 14), up = [mk(7, 19), mk(9, 19)];
    const body = Matter.Bodies.circle(11.5 * 32, 14.5 * 32, 10);
    const pl = { body, alive: true, isPlayer: true, weapon: { type: 'pistol', mag: 2 }, def: { kind: 'gun' }, nearShield: null,
      get x() { return body.position.x; }, get y() { return body.position.y; } };
    const w = { events: new EventBus(), enemies: [hostage, ...up], offstage: [], chars: [], player: pl, items: [], level, game: {}, time: 0, texts: [],
      map: { w: level.tiles[0].length }, doors: [], windows: [], props: [], removeBody: noop, sound: noop, slowmo: noop, shake: noop, after: noop, explode: noop,
      fireSpread: { burning: [], restore: noop, nearest: () => null },
      holdBack(e) { e.offstage = true; this.enemies = this.enemies.filter((o) => o !== e); this.offstage.push(e); },
      bringOn(e) { e.offstage = false; this.enemies.push(e); } };
    const t = new Tutorial(w, T, T.stages.length - 1);
    const run = (s) => { for (let k = 0; k < s * 20; k++) { w.time += 0.05; t.update(); } };
    run(1.5);
    assert.ok(up.every((g) => g.offstage && g.dormant), 'a pistol in his hand calls nobody');
    pl.nearShield = hostage;
    assert.deepEqual(t.hints().map((h) => `${h.key} ${h.text}`)[0], 'use SHIELD');
    if (how === 'shield') w.events.emit('shield', { holder: pl, target: hostage });
    else { hostage.alive = false; w.events.emit('kill', { victim: hostage }); }
    run(2.5);
    assert.ok(!up[0].offstage && !up[1].offstage, `the two come up the stairs (${how})`);
  }
});

test('shield: bare hands on a man with a pistol take his pistol, its rounds and no spare; a gun in hand keeps its own', () => {
  const w = world(), p = player(w), g = guard(w, 20, 0, { weapon: { type: 'pistol', mag: 4, reserve: 2, wear: undefined, bare: false } });
  p.take = function (type, mag) { this.setWeapon(type, mag); };
  steps(w, p, 1, idle, pressE);
  assert.equal(p.shield?.target, g);
  assert.equal(p.weapon?.type, 'pistol');
  assert.equal(p.weapon.mag, 4);
  assert.equal(p.ammo['9mm'], 0, 'no spare magazine');
  assert.equal(g.weapon, null);
  const w2 = world(), p2 = player(w2, 'uzi'), g2 = guard(w2, 20, 0, { weapon: { type: 'pistol', mag: 4, reserve: 0 } });
  steps(w2, p2, 1, idle, pressE);
  assert.equal(p2.weapon.type, 'uzi');
  assert.equal(g2.weapon.type, 'pistol');
});
