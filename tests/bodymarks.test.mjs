import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { WOUNDS, MARKS, markOf, woundFor } = await load('game/data/wounds.js');
const { bodyMarks, markAt } = await load('game/fx/BodyMarks.js');
const { WEAPONS } = await load('game/data/weapons.js');

const BODY = { tw: 17, th: 19, head: 4.5 };

test('body marks: every wound that opens a man leaves its mark, a punch and a broken neck none', () => {
  for (const name of Object.keys(WOUNDS)) {
    const spec = markOf(WOUNDS[name]);
    if (name === 'punch' || name === 'snap') assert.equal(spec, null, name);
    else assert.ok(spec && spec === MARKS[name], name);
  }
  assert.equal(markOf(woundFor('bullet', WEAPONS.pistol)).kind, 'hole');
  assert.equal(markOf(woundFor('melee', WEAPONS.bat)).kind, 'bruise');
  assert.equal(markOf(woundFor('slash', WEAPONS.knife)).kind, 'cut');
});

test('body marks: they sit on the torso or the head, clear of the edges, as many as the wound says', () => {
  for (const [name, spec] of Object.entries(MARKS)) {
    for (let i = 0; i < 200; i++) {
      const marks = bodyMarks(spec, BODY);
      assert.ok(marks.length >= spec.n[0] && marks.length <= spec.n[1], name);
      for (const m of marks) {
        if (m.part === 'head') assert.ok(Math.hypot(m.x, m.y) + m.size / 2 <= BODY.head + 0.01, name + ' on the head');
        else {
          assert.equal(m.part, 'torso');
          assert.ok(Math.abs(m.y) <= BODY.th / 2 - 1, name + ' along the torso');
          assert.ok(Math.abs(m.x) <= BODY.tw / 2 - 1, name + ' across the torso');
        }
      }
    }
  }
});

test('body marks: a blow to the head leaves nothing on a body without one, a cut throat sits at the collar', () => {
  assert.equal(markAt(MARKS.blunt, { ...BODY, head: 0 }), null);
  const m = markAt(MARKS.throat, BODY);
  assert.ok(m.part === 'torso' && m.y < -BODY.th / 2 + 3);
  assert.deepEqual(bodyMarks(null, BODY), []);
});
