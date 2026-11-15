import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CINE, CINE_END, PAGES, cineView, cineBeats } = await load('game/ui/Cinematic.js');

test('cinematic: the camera pulls back from the window into the room, the night goes wrong, the view tips onto the floor plan', () => {
  const start = cineView(0);
  assert.ok(Math.abs(start.zoom - CINE.zoom) < 1e-9 && start.logo === 1 && start.tilt === 0 && !start.over, 'it starts as the title: the window is the screen');
  let prev = start;
  for (let t = 0; t <= CINE_END + 0.2; t += 0.02) {
    const v = cineView(t);
    for (const key of ['tilt', 'rise', 'fire']) assert.ok(v[key] >= prev[key] - 1e-9, `${key} went back at ${t.toFixed(2)}`);
    assert.ok(v.zoom <= prev.zoom + 1e-9 && v.logo <= prev.logo + 1e-9, `it went back at ${t.toFixed(2)}`);
    assert.ok(!(v.tilt > 0 && (v.zoom > 1 + 1e-9 || v.rise < 1 || v.page)), 'the room is all there, the man up and dressed, before the view tips');
    assert.ok(!(v.page && v.rise > 0), 'he does not get up behind a page');
    prev = v;
  }
  assert.ok(Math.abs(cineView(CINE.pull).zoom - 1) < 1e-9 && cineView(CINE.pull).logo === 0);
  assert.equal(cineView(CINE_END - 0.01).over, false);
  assert.ok(cineView(CINE_END).over && cineView(CINE_END).tilt === 1);
  // the story in its order: the boards, his eye, page one, the super's voice, the shot, page two (the match), he gets up
  const order = [CINE.thump, CINE.eye[0], CINE.eyeOpen, CINE.eye[1], CINE.page1[0], CINE.page1[1], CINE.voice[0], CINE.shot, CINE.page2[0],
    CINE.strike, CINE.page2[1], CINE.rise[0], CINE.rise[1], CINE.tiltAt];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1], `beat ${i} comes before the one it follows`);
  assert.equal(CINE.voice[1], CINE.shot, 'the shot cuts him off');
  assert.ok(CINE.skipAfter < 1);
});

test('cinematic: every panel has time to be read before the next drops in, and is down before its page goes', () => {
  for (const page of PAGES) {
    const at = page.panels.map((p) => p.at);
    assert.equal(at[0], page.start);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 1.8, 'about two seconds a panel at least');
    assert.ok(page.end - at.at(-1) >= 2.5, 'the last one stays a while');
    for (const p of page.panels) if (p.say) assert.ok(p.at + p.say.at < page.end - 1.5, 'what is said can be read');
  }
});

test('cinematic: each sound once, in the order of the story, the match among them', () => {
  const heard = [];
  for (let t = 0; t < CINE_END; t += 1 / 60) heard.push(...cineBeats(t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard.filter((n) => n !== 'air'), ['woodBreak', 'door', 'door', 'woodBreak', 'shout', 'pistol', 'bodyFall', 'match', 'getUp', 'pickup']);
  assert.ok(heard.filter((n) => n === 'air').length >= 4, 'the night outside all along');
});
