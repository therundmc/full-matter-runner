import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CINE, CINE_END, cineView, cineBeats, cineCaption } = await load('game/ui/Cinematic.js');

test('cinematic: from the street to the window, the room, then the view tips onto the floor plan, in that order', () => {
  const start = cineView(0);
  assert.deepEqual([start.zoom, start.room, start.tilt, start.over], [1, 0, 0, false]);
  let prev = start;
  for (let t = 0; t <= CINE_END + 0.2; t += 0.02) {
    const v = cineView(t);
    assert.ok(v.zoom >= prev.zoom - 1e-9 && v.room >= prev.room - 1e-9 && v.tilt >= prev.tilt - 1e-9, `it went back at ${t.toFixed(2)}`);
    assert.ok(!(v.tilt > 0 && v.room < 1), 'the room is all there before the view tips');
    prev = v;
  }
  const inRoom = cineView(CINE.travel);
  assert.ok(Math.abs(inRoom.zoom - CINE.zoom) < 1e-6 && inRoom.room === 1 && inRoom.tilt === 0);
  assert.equal(cineView(CINE_END - 0.01).over, false);
  assert.ok(cineView(CINE_END).over && cineView(CINE_END).tilt === 1);
  assert.ok(CINE.rise[1] < CINE.room && CINE.lamp < CINE.room, 'he is on his feet, the lamp on, before it tips');
  assert.ok(CINE.skipAfter < 1);
});

test('cinematic: each sound once, the three knocks before he stirs', () => {
  const heard = [];
  for (let t = 0; t < CINE_END; t += 1 / 60) heard.push(...cineBeats(t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard, ['door', 'door', 'door', 'getUp', 'click']);
});

test('cinematic: the date is typed at the foot of the room and goes with it', () => {
  assert.equal(cineCaption(0.5), null);
  const mid = cineCaption(CINE.travel + 0.4), full = cineCaption(CINE.travel + CINE.room - 0.1);
  assert.ok(mid.str.length > 0 && mid.str.length < CINE.caption.length && CINE.caption.startsWith(mid.str));
  assert.equal(full.str, CINE.caption);
  assert.equal(cineCaption(CINE_END), null);
});
