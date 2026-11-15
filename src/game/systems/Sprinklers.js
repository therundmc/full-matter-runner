// The bar's fire alarm (level `sprinklers`: { pull: [col, row], rooms: [[col0, row0, col1, row1], ...] }). A red pull
// station on a wall (a `fire_alarm` prop): pulled (E), or set off by a fire or a blast in its rooms. Its bell rings
// (and every few bursts the guards around hear it and come to look); the sprinkler heads over the rooms (a grid,
// `heads`) open one after another and rain on everything: water stands in puddles under them (systems/Liquids.js),
// the whole floor of the rooms is slick while it is wet (grip, read by World.floorGrip), fires in reach die, and the
// customers run for the street. Shot off the wall, the station stops the bell (not the water). DOM-free.
import { TILE } from '../Config.js';
import { SPRINKLERS } from '../data/devices.js';
import { rand, TAU } from '../../engine/math.js';

const SPRAY = 'rgba(160,200,240,0.22)';

// where the heads are over the rooms (px): a grid about `spacing` tiles apart, each room's own, centred in it
export function heads(rooms, spacing) {
  const out = [];
  for (const [c0, r0, c1, r1] of rooms) {
    const w = c1 + 1 - c0, h = r1 + 1 - r0;
    const nx = Math.max(1, Math.round(w / spacing)), ny = Math.max(1, Math.round(h / spacing));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) out.push({ x: (c0 + ((i + 0.5) * w) / nx) * TILE, y: (r0 + ((j + 0.5) * h) / ny) * TILE });
    }
  }
  return out;
}

export default class Sprinklers {
  constructor(world, def = null, cfg = SPRINKLERS) {
    this.world = world;
    this.cfg = cfg;
    this.on = false;
    this.t = 0;          // s since it went off
    this.wet = 0;        // s the floor stays slick
    this.box = undefined; // the pull station, looked up at the first step (props are built after the systems)
    if (!def) return;
    this.rooms = def.rooms.map(([c0, r0, c1, r1]) => ({ x0: c0 * TILE, y0: r0 * TILE, x1: (c1 + 1) * TILE, y1: (r1 + 1) * TILE }));
    this.heads = heads(def.rooms, cfg.spacing).map((h) => ({ ...h, late: rand(...cfg.late) }));
    this.pull = { x: def.pull[0] * TILE, y: def.pull[1] * TILE };
    this.beat = 0;
    this.n = 0;
    world.uses?.add({ kind: 'fire_alarm', x: this.pull.x, y: this.pull.y, label: 'PULL THE FIRE ALARM', ok: () => !this.on && this.live(), use: (ch) => this.trip(ch) });
    // a blast in the rooms is a fire as far as the heads know
    world.events.on('explosion', ({ x, y }) => { if (this.inside(x, y)) this.trip(null); });
  }

  // the station is still on its wall
  live() {
    if (this.box === undefined) {
      this.box = this.world.props.find((p) => p.type === 'fire_alarm' && Math.hypot(p.x - this.pull.x, p.y - this.pull.y) < TILE) || null;
    }
    return !!this.box && !this.box.dead && !this.box.dying;
  }

  inside(x, y) {
    return !!this.rooms && this.rooms.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);
  }

  // the floor grip multiplier at a point (World.floorGrip): slick while the rooms are wet
  grip(x, y) { return this.wet > 0 && this.inside(x, y) ? this.cfg.grip : 1; }

  // it goes off (by: who pulled it, if anyone)
  trip(by) {
    if (this.on || !this.rooms) return;
    const w = this.world;
    this.on = true;
    this.t = 0;
    this.beat = 0;
    this.n = 0;
    if (by) w.sound('handle', this.pull.x, this.pull.y, 0.8);
    // the customers run for it, the guards around want to know who did it
    for (const r of this.rooms) w.ambient?.panicAround((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, Math.hypot(r.x1 - r.x0, r.y1 - r.y0) / 2 + TILE, 'scream');
    const near = w.enemies.filter((e) => e.alive && !(e.knocked > 0) && this.inside(e.x, e.y));
    for (const e of near.slice(0, 2)) w.after(rand(0.6, 1.8), () => { if (e.alive) e.say('sprinkler'); });
  }

  update(dt) {
    if (!this.rooms) return;
    const w = this.world, c = this.cfg;
    if (this.wet > 0) this.wet -= dt;
    if (!this.on) {
      // a fire burning in the rooms sets it off
      if (w.fires?.lit().some((f) => this.inside(f.x, f.y))) this.trip(null);
      return;
    }
    this.t += dt;
    // the bell, while its station lives
    if (this.t < c.ring && this.live() && (this.beat -= dt) <= 0) {
      this.beat += c.period;
      w.sound('fireBell', this.pull.x, this.pull.y, 1);
      if (this.n++ % c.call === 0) w.noise(this.pull.x, this.pull.y, c.reach * TILE);
    }
    if (this.t > c.spray) return;
    this.wet = c.dry;
    for (const h of this.heads) {
      if (this.t < h.late) continue;
      if (!h.open) {
        h.open = true;
        w.sound('hiss', h.x, h.y, 0.35, { pitch: 0.55 });
      }
      // the rain off the head, and the puddle under it
      w.particles.drops(h.x + rand(-3, 3), h.y + rand(-3, 3), rand(0, TAU), Math.PI, c.drops, SPRAY, 95, 70, false);
      w.liquids.feed(h.x, h.y, c.rate * dt, 'water', c.cap);
    }
    // what burns in the rooms goes out
    w.fires?.douse((x, y) => this.inside(x, y));
  }
}
