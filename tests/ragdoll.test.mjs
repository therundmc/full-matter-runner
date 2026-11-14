import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { BODY, WOUNDS } = await load('game/data/wounds.js');
const { jointAngle, clampJoint, partAngle } = await load('game/fx/Joints.js');

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
