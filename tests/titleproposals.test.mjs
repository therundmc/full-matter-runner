import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { load } from './setup.mjs';

const { titleProposal } = await load('game/ui/title/Proposals.js');
const { deadCount } = await load('game/ui/title/HitList.js');
const { OPTIONAL_LIST } = await load('engine/Assets.js');

test('title proposals: only the address flag brings one up', () => {
  assert.equal(titleProposal(''), null, 'no flag: the title as it is');
  assert.equal(titleProposal('?level=level1&post=0'), null);
  assert.equal(titleProposal('?title=zz'), null, 'an unknown one too');
  assert.equal(titleProposal('?title=toString'), null);
  for (const id of ['a', 'b', 'c', 'ab']) {
    const p = titleProposal(`?post=0&title=${id}`);
    assert.equal(p.id, id);
    assert.equal(typeof p.scene, 'function');
  }
  assert.equal(titleProposal('?title=c').city, true, 'the night city keeps its trains');
  assert.equal(titleProposal('?title=a').city, false);
});

test('title proposals: the hit list crosses out the targets whose level is done, in order', () => {
  assert.equal(deadCount({ unlocked: ['tutorial'], done: [] }), 0);
  assert.equal(deadCount({ unlocked: ['tutorial', 'level1'], done: ['tutorial'] }), 0, 'the tutorial kills none of them');
  assert.equal(deadCount({ unlocked: ['tutorial', 'level1'], done: ['tutorial', 'level1'] }), 1, 'CUEBALL after level 1');
});

test('title proposals: their stills are optional sprites, painted at 3 px per title px', () => {
  const stills = OPTIONAL_LIST.filter((n) => n.startsWith('title/'));
  assert.ok(stills.length >= 8);
  for (const name of stills) {
    const url = new URL(`../assets/sprites/${name}.png`, import.meta.url);
    assert.ok(existsSync(url), `${name} (python3 tools/comic/title_proposals.py)`);
    const b = readFileSync(url), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.ok(w % 3 === 0 && h % 3 === 0, `${name} is ${w}x${h}`);
    if (/poster|board/.test(name)) assert.deepEqual([w, h], [1152, 648]);
  }
});
