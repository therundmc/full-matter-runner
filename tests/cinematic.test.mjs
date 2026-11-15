import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CINE, CINE_END, cineView, cineBeats } = await load('game/ui/Cinematic.js');

test('cinematic: the camera pulls back from the window into the room, the night goes wrong, the view tips onto the floor plan', () => {
  const start = cineView(0);
  assert.ok(Math.abs(start.zoom - CINE.zoom) < 1e-9 && start.logo === 1 && start.tilt === 0 && !start.over, 'it starts as the title: the window is the screen');
  let prev = start;
  for (let t = 0; t <= CINE_END + 0.2; t += 0.02) {
    const v = cineView(t);
    for (const key of ['tilt', 'rise', 'gas', 'fire']) assert.ok(v[key] >= prev[key] - 1e-9, `${key} went back at ${t.toFixed(2)}`);
    assert.ok(v.zoom <= prev.zoom + 1e-9 && v.logo <= prev.logo + 1e-9, `it went back at ${t.toFixed(2)}`);
    assert.ok(!(v.tilt > 0 && (v.zoom > 1 + 1e-9 || v.rise < 1 || v.page)), 'the room is all there, the man up and dressed, before the view tips');
    assert.ok(!(v.page && (v.gas > 0 || v.rise > 0)), 'nothing happens in the bedroom behind the page');
    prev = v;
  }
  assert.ok(Math.abs(cineView(CINE.pull).zoom - 1) < 1e-9 && cineView(CINE.pull).logo === 0);
  assert.equal(cineView(CINE_END - 0.01).over, false);
  assert.ok(cineView(CINE_END).over && cineView(CINE_END).tilt === 1);
  // the story in its order: the boards, his eye, the super's voice, the shot, the page, the petrol, the fire, he gets up
  const order = [CINE.thump, CINE.eye[0], CINE.eyeOpen, CINE.eye[1], CINE.voice[0], CINE.shot, CINE.page[0], ...CINE.panels, CINE.says,
    CINE.page[1], CINE.gas, CINE.rise[0], CINE.fire, CINE.rise[1], CINE.tiltAt];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1], `beat ${i} comes before the one it follows`);
  assert.equal(CINE.voice[1], CINE.shot, 'the shot cuts him off');
  assert.equal(CINE.captions.length, CINE.panels.length - 1, 'a caption for each panel but the last, which speaks');
  assert.ok(CINE.skipAfter < 1);
});

test('cinematic: each sound once, in the order of the story', () => {
  const heard = [];
  for (let t = 0; t < CINE_END; t += 1 / 60) heard.push(...cineBeats(t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard.filter((n) => n !== 'air'),
    ['woodBreak', 'door', 'shout', 'pistol', 'bodyFall', 'getUp', 'ignite', 'crackle', 'crackle', 'crackle', 'pickup']);
  assert.ok(heard.filter((n) => n === 'air').length >= 3, 'the night outside all along');
});
