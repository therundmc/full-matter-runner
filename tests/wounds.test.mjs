import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { WOUNDS, CAUSE_WOUND, CRAWL, SPASM, CURL, THROES, woundFor } = await load('game/data/wounds.js');
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
  // (how far and how long: tests/crawl.test.mjs)
  assert.ok(CRAWL.decay > 0 && CRAWL.decay < 1 && CRAWL.pulls[0] >= 3 && CRAWL.pulls[0] <= CRAWL.pulls[1] && CRAWL.pulls[1] <= 5);
  assert.ok(CRAWL.weak > 0 && CRAWL.weak < 1 && CRAWL.slip > 0 && CRAWL.slip < 1);
  for (const k of ['reach', 'claw', 'haul', 'pause']) assert.ok(CRAWL[k][0] > 0 && CRAWL[k][0] <= CRAWL[k][1], k);
});

test('wounds: a body that does not crawl may curl up round a cut or a bullet, spasm or twitch, briefly', () => {
  for (const [name, w] of Object.entries(WOUNDS)) {
    // spasm and curl take their share of the throes' odds first: there is some of it left
    assert.ok((w.curl || 0) + SPASM.odds < THROES.odds - 0.1, name);
  }
  for (const name of ['punch', 'blunt', 'crush', 'snap', 'impact']) assert.ok(!WOUNDS[name].curl, name);
  for (const name of ['slash', 'small', 'rifle', 'glass']) assert.ok(WOUNDS[name].curl > 0, name);
  assert.ok(SPASM.dur[0] >= 0.8 && SPASM.dur[1] <= 1.6 && SPASM.kicks[0] >= 3 && SPASM.kicks[1] <= 4);
  assert.ok(CURL.dur[0] >= 1.2 && CURL.dur[1] <= 2 && CURL.roll > 0 && CURL.roll < 1);
  assert.ok(THROES.odds > 0 && THROES.odds < 1);
  assert.ok(THROES.dur[0] > 0 && THROES.dur[0] <= THROES.dur[1]);
  assert.ok(THROES.every[0] > 0 && THROES.every[0] <= THROES.every[1] && THROES.every[1] < THROES.dur[0]);
  assert.ok(THROES.kick > 0);
});
