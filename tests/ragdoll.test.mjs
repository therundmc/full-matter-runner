import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { BODY, WOUNDS } = await load('game/data/wounds.js');
const { jointAngle, clampJoint, partAngle } = await load('game/fx/Joints.js');
const { angDiff } = await load('engine/math.js');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const { PI } = Math;

test('joints: a part on the left is read as its mirror on the right, and turned back the same way', () => {
  // an arm straight out sideways is 0 on either side, along his side toward the feet PI/2
  assert.ok(near(jointAngle(0, 0, false), 0) && near(jointAngle(0, PI, true), 0));
  assert.ok(near(jointAngle(0.7, 0.7 + PI / 2, false), PI / 2) && near(jointAngle(0.7, 0.7 + PI / 2, true), PI / 2));
  for (let t = -3; t <= 3; t += 0.5) {
    for (let a = -3; a <= 3; a += 0.25) {
      for (const left of [false, true]) assert.ok(near(jointAngle(t, partAngle(t, a, left), left), a), `${t} ${a} ${left}`);
    }
  }
});

test('joints: a turn past the end of its range stops at the nearer end, the short way round', () => {
  const R = [-1, 1];
  assert.equal(clampJoint(0.4, R), 0.4);
  assert.equal(clampJoint(1.3, R), 1);
  assert.equal(clampJoint(-1.2, R), -1);
  assert.equal(clampJoint(2.9, R), 1); // nearer 1 than -1 going round
  assert.equal(clampJoint(-2.9, R), -1);
  assert.equal(clampJoint(3.1, [0.95, 1.85]), 1.85);
  assert.equal(clampJoint(-2.2, [0.95, 1.85]), 1.85); // a leg flung up past the head comes back down the near side
  assert.equal(clampJoint(-0.4, [0.95, 1.85]), 0.95);
});

test('ragdoll: the joints of a body as a body has them, and it goes down within them', () => {
  const { shoulder, hip, neck } = BODY.joints;
  // an arm may go up past his head or lie by his thigh, never across or under him
  assert.ok(shoulder[0] < -PI / 2 && shoulder[0] > -2.1 && shoulder[1] > PI / 2 && shoulder[1] < 2);
  // a leg splays out some 30 to 50 deg at most, crosses in a little, never comes up
  assert.ok(hip[0] > PI / 2 - 0.9 && hip[0] < PI / 2 - 0.5 && hip[1] > PI / 2 && hip[1] < PI / 2 + 0.4);
  assert.ok(neck[0] === -neck[1] && neck[1] > 0.3 && neck[1] < 0.8);
  assert.ok(BODY.arms[0] >= shoulder[0] && BODY.arms[1] <= shoulder[1]);
  assert.ok(BODY.legs[0] >= hip[0] && BODY.legs[1] <= hip[1]);
  assert.ok(BODY.damp.spin > 0 && BODY.damp.slide > 0 && BODY.lag >= 0 && BODY.lag < 0.5);
  assert.ok(BODY.how.finisher < BODY.how.held && BODY.how.held < 1 && BODY.how.heavy > 1);
  assert.ok(BODY.jolt[2] > BODY.jolt[0] && BODY.jolt[0] < 6, 'a round barely moves a dead man');
});

test('ragdoll: thrown as far as the weapon has weight (cloth on the floor: about v^2 / 690 + 0.18 v px)', () => {
  const far = (w) => w.throw[1] ** 2 / 690 + 0.18 * w.throw[1], m = 32;
  // a punch, a knife, a broken neck: he goes down where he stood
  for (const n of ['punch', 'stab', 'slash', 'throat', 'snap']) assert.ok(far(WOUNDS[n]) < 0.8 * m, n);
  // a club or a pistol: a short way; buckshot and a sniper round carry him off, not across the room
  assert.ok(far(WOUNDS.blunt) < 2 * m && far(WOUNDS.small) < 1.3 * m);
  assert.ok(far(WOUNDS.buckshot) > 2.5 * m && far(WOUNDS.buckshot) < 5 * m && far(WOUNDS.heavy) < 5.5 * m);
  assert.ok(far(WOUNDS.punch) < far(WOUNDS.blunt) && far(WOUNDS.blunt) < far(WOUNDS.buckshot) && far(WOUNDS.rifle) < far(WOUNDS.heavy));
});

// a brute's body (its real part sizes: in Node the sprites are 8 px placeholders, sized here) in a room with a bar
// on a floor of grip `grip`: a back bar against the north wall and a counter 40 px off it, static, as level 1 has them
async function barStrip(grip) {
  const noop = () => {}, sink = new Proxy({}, { get: () => noop });
  globalThis.document ??= { createElement: () => ({ width: 8, height: 8, getContext: () => sink }) };
  const { sprite } = await load('engine/Assets.js');
  const { default: TileMap } = await load('game/world/TileMap.js');
  const { default: EventBus } = await load('engine/EventBus.js');
  const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
  const { CAT, MASK } = await load('game/Config.js');
  const sizes = { torso: [17, 19], torso_up: [17, 19], torso_down: [17, 19], arm: [17, 6], leg: [20, 7], head: [10, 10], head_up: [10, 10] };
  for (const [k, [w, h]] of Object.entries(sizes)) Object.assign(sprite(`characters/brute_rag_${k}`), { width: w, height: h });
  const physics = new PhysicsWorld({ muAt: () => grip, substeps: 2 });
  const w = {
    particles: sink, decals: sink, events: new EventBus(), sound: noop, shake: noop, emit: noop, time: 0, physics,
    map: new TileMap(['##########', '#........#', '#........#', '#........#', '#........#', '##########']),
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), addCorpse: noop, items: [], windows: [], doors: [],
    engine: physics.engine,
  };
  const f = { isStatic: true, collisionFilter: { category: CAT.PROP, mask: MASK.PROP } };
  physics.add(Matter.Bodies.rectangle(160, 37, 220, 8, f));  // the back bar
  physics.add(Matter.Bodies.rectangle(160, 91, 220, 19, f)); // the counter
  return w;
}
const energy = (r) => r.parts.reduce((e, p) => {
  const v = Matter.Body.getVelocity(p.body), om = Matter.Body.getAngularVelocity(p.body);
  return e + p.body.mass * (v.x * v.x + v.y * v.y) + p.body.inertia * om * om;
}, 0);

test('ragdoll: a part held at the end of its joint goes on with the torso without adding to their motion', async () => {
  const w = await barStrip(1);
  const { default: Ragdoll } = await load('game/entities/Ragdoll.js');
  const r = new Ragdoll(w, 'brute', 160, 140, 0, 0, {});
  const t = r.torso.body, leg = r.limbs[3];
  // the torso turning fast, a leg at rest bent far past its hip (as a counter pressing on it leaves it)
  Matter.Body.setAngularVelocity(t, 0.15);
  Matter.Body.setAngle(leg.body, partAngle(t.angle, 0.2, false));
  for (const p of r.parts) if (p !== r.torso) { Matter.Body.setVelocity(p.body, { x: 0, y: 0 }); Matter.Body.setAngularVelocity(p.body, 0); }
  const before = energy(r);
  r.limp(1 / 60);
  assert.ok(energy(r) <= before + 1e-9, `no energy out of nothing: ${before.toFixed(2)} -> ${energy(r).toFixed(2)}`);
});

// QA level 1 seed 61563 (plan kegs): a brute clubbed into the strip behind the bar, on the beer of the holed kegs,
// went on turning round between the counter and the back bar, 3.5 rad in 0.6 s, a second after he died
test('ragdoll: a body thrown into the strip behind the bar on a slick floor settles, never spun round', async () => {
  const { default: Ragdoll } = await load('game/entities/Ragdoll.js');
  const { seeded } = await load('engine/math.js');
  const random = Math.random;
  try {
    for (const [seed, x, y, dir, speed] of [[3729862, 169.35, 74.48, 2.4545, 111.95], [1, 160, 64, 2.2, 140], [2, 120, 60, 0.9, 120]]) {
      Math.random = seeded(seed);
      const w = await barStrip(0.3);
      const r = new Ragdoll(w, 'brute', x, y, dir, speed, {});
      const t = r.torso.body;
      let prev = t.angle, turn = 0, gain = 0, e = energy(r);
      for (let i = 0; i < 360; i++) {
        w.time += 1 / 60;
        w.physics.step(1 / 60, w.time);
        const e1 = energy(r);
        r.update(1 / 60);
        gain = Math.max(gain, energy(r) - e1);
        e = energy(r);
        if (r.age >= 1 && !r.dying) turn += Math.abs(angDiff(prev, t.angle));
        prev = t.angle;
      }
      assert.ok(gain < 0.5, `seed ${seed}: the limp body never gains motion of its own (+${gain.toFixed(2)} in one step)`);
      assert.ok(turn < 2.6, `seed ${seed}: turned ${turn.toFixed(2)} rad after his first second`);
      assert.ok(e < 1e-3, `seed ${seed}: at rest in the end`);
    }
  } finally { Math.random = random; }
});
