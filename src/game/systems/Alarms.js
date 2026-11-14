// Shop alarms (level `alarms`: [{ rect: [col0, row0, col1, row1], box: [col, row] }]). A closed shop rings when it
// is broken into: a window, its door or a wall of its perimeter gives, or the player stands on its floor. While it
// rings, its box (an `alarm_box` prop) sounds its bell, flashes its beacon, and every few bursts the guards around
// hear it ('noise') and passers-by hurry on ('alarm' event). It stops by itself, or when the box is destroyed.
// DOM-free: sounds, lights and noises go through the world.
import { TILE, ALARM } from '../Config.js';

export default class Alarms {
  constructor(world, defs = []) {
    this.world = world;
    this.list = defs.map(({ rect: [c0, r0, c1, r1], box }) => ({
      x0: c0 * TILE, y0: r0 * TILE, x1: (c1 + 1) * TILE, y1: (r1 + 1) * TILE, // the shop's floor (px)
      x: box[0] * TILE, y: box[1] * TILE,
      box: undefined, // its prop, looked up at the first step (props are built after the systems)
      left: 0,        // s of ringing left
      beat: 0,        // s to the next burst
      n: 0,           // bursts since it went off
    }));
    if (!this.list.length) return;
    const breach = (e) => this.breach(e.x, e.y);
    for (const name of ['windowBroken', 'doorBroken', 'wallDestroyed']) world.events.on(name, breach);
  }

  // one of them is ringing
  get any() { return this.list.some((a) => a.left > 0); }

  // something of a building gave at (x, y): the shop it belongs to goes off
  breach(x, y) {
    const m = ALARM.margin * TILE;
    for (const a of this.list) {
      if (x > a.x0 - m && x < a.x1 + m && y > a.y0 - m && y < a.y1 + m) this.trip(a);
    }
  }

  trip(a) {
    if (!this.live(a)) return;
    if (a.left <= 0) { a.beat = 0; a.n = 0; }
    a.left = ALARM.duration;
  }

  // its box is still on the wall
  live(a) {
    if (a.box === undefined) {
      a.box = this.world.props.find((p) => p.type === 'alarm_box' && Math.hypot(p.x - a.x, p.y - a.y) < TILE) || null;
    }
    return !!a.box && !a.box.dead;
  }

  update(dt) {
    const w = this.world, p = w.player;
    for (const a of this.list) {
      if (p?.alive && p.x > a.x0 && p.x < a.x1 && p.y > a.y0 && p.y < a.y1) this.trip(a);
      if (a.left <= 0) continue;
      if (!this.live(a)) { a.left = 0; continue; }
      a.left -= dt;
      if ((a.beat -= dt) > 0) continue;
      a.beat += ALARM.period;
      w.sound('shopAlarm', a.x, a.y, 1);
      if (a.n % 2 === 0) w.light(a.x, a.y + 5, ALARM.beacon.r, ALARM.beacon.color, ALARM.beacon.dur);
      if (a.n++ % ALARM.call === 0) {
        w.noise(a.x, a.y, ALARM.reach * TILE);
        w.events.emit('alarm', { x: a.x, y: a.y, radius: ALARM.shy * TILE });
      }
    }
  }
}
