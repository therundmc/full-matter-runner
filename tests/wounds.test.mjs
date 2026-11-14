import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { WOUNDS, CAUSE_WOUND, CRAWL, THROES, woundFor } = await load('game/data/wounds.js');
const { WEAPONS } = await load('game/data/weapons.js');

test('wounds: every profile is complete and every weapon names an existing one', () => {
  for (const [name, w] of Object.entries(WOUNDS)) {
    assert.equal(w.back.length, 3, name);
    assert.equal(w.spray.length, 3, name);
    assert.ok(!w.exit || w.exit.length === 3, name);
    assert.equal(w.splat.length, 2, name);
    assert.ok(w.pool[0] <= w.pool[1] && (w.rate > 0 || !w.pool[1]), name); // no pool, no rate
    assert.ok(w.throw[0] <= w.throw[1], name);
  }
  for (const [id, d] of Object.entries(WEAPONS)) {
    if (d.rocket) continue; // a rocket leaves nothing to bleed
    assert.ok(WOUNDS[d.wound], `${id} -> ${d.wound}`);
  }
  for (const [cause, name] of Object.entries(CAUSE_WOUND)) assert.ok(WOUNDS[name], cause);
});

test('wounds: the weapon decides, the cause is the fallback', () => {
  assert.equal(woundFor('bullet', WEAPONS.rifle), WOUNDS.rifle);
  assert.equal(woundFor('slash', WEAPONS.knife), WOUNDS.slash);
  assert.equal(woundFor('melee', WEAPONS.bat), WOUNDS.blunt);
  assert.equal(woundFor('melee', undefined), WOUNDS.blunt);
  assert.equal(woundFor('execute', undefined), WOUNDS.crush);
  assert.equal(woundFor('glass', { gore: 0.6 }), WOUNDS.glass);
  assert.equal(woundFor('whatever', undefined), WOUNDS.small);
});

test('wounds: a shotgun only tears a body open up close', () => {
  assert.equal(woundFor('blast', WEAPONS.shotgun), WOUNDS.buckshot);
  assert.equal(woundFor('bullet', WEAPONS.shotgun), WOUNDS.pellet);
});

test('wounds: calibrated by weapon (a blade bleeds out, 7.62 goes through, a silenced 9 mm is discreet)', () => {
  const lake = (w) => w.pool[1] * w.rate;
  assert.ok(lake(WOUNDS.slash) > lake(WOUNDS.small) && lake(WOUNDS.buckshot) > lake(WOUNDS.small));
  assert.ok(lake(WOUNDS.blunt) < lake(WOUNDS.small));
  assert.ok(WOUNDS.slash.spurt > 0 && !WOUNDS.small.spurt);
  // exit plumes: sniper > rifle > pistol > silenced, faster and tighter with the energy
  const out = ['heavy', 'rifle', 'small', 'quiet'].map((n) => WOUNDS[n].exit);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1][0] > out[i][0] && out[i - 1][1] > out[i][1]);
  assert.ok(WOUNDS.rifle.exit[2] < WOUNDS.small.exit[2]);
  assert.ok(WOUNDS.buckshot.spray[2] > WOUNDS.rifle.spray[2] * 2);
  // a stabbed man drops where he stood, buckshot carries him off
  assert.ok(WOUNDS.slash.throw[1] < WOUNDS.small.throw[0] && WOUNDS.buckshot.throw[0] > WOUNDS.rifle.throw[1]);
});

test('wounds: only a wound that leaves a man whole lets him crawl, now and then, a little way and not for long', () => {
  for (const [name, w] of Object.entries(WOUNDS)) assert.ok((w.crawl || 0) <= 0.4, name);
  for (const name of ['punch', 'buckshot', 'heavy', 'snap', 'crush', 'impact', 'glass']) assert.ok(!WOUNDS[name].crawl, name);
  assert.ok(WOUNDS.small.crawl > WOUNDS.rifle.crawl && WOUNDS.pellet.crawl > 0);
  // the longest crawl: under a metre and a quarter in all (1 m = 32 px), over in a few seconds
  let far = 0;
  for (let i = 0; i < CRAWL.pulls[1]; i++) far += CRAWL.step * CRAWL.decay ** i;
  assert.ok(far > 15 && far < 40, 'px crawled at most: ' + far);
  assert.ok(CRAWL.decay > 0 && CRAWL.decay < 1 && CRAWL.pulls[0] <= CRAWL.pulls[1]);
  assert.ok(CRAWL.fall + CRAWL.turn + CRAWL.pulls[1] * CRAWL.cycle + CRAWL.giveUp < 9);
});

test('wounds: a body that does not crawl may twitch a moment, a quick jerk now and then', () => {
  assert.ok(THROES.odds > 0 && THROES.odds < 1);
  assert.ok(THROES.dur[0] > 0 && THROES.dur[0] <= THROES.dur[1]);
  assert.ok(THROES.every[0] > 0 && THROES.every[0] <= THROES.every[1] && THROES.every[1] < THROES.dur[0]);
  assert.ok(THROES.kick > 0);
});
