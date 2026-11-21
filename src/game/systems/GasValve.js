// A stove's gas tap (prop option `valve` of a level's props list). E opens it: a hiss, the air shimmering over the stove,
// and the gas spreads through the room (its cloud grows to GAS_VALVE.radius over `fill` s; E again shuts it, and what
// is out thins away). A spark in the cloud blows all of it: a trigger pulled in it, a blast, a fire, metal struck
// there. The bigger the cloud, the bigger the blast (Explosions), with a flash of flame through it. DOM-free.
import { GAS_VALVE } from '../data/devices.js';
import { ROUNDS } from '../data/weapons.js';
import { rand, TAU, chance } from '../../engine/math.js';

const SPARKS = new Set([...ROUNDS, 'blunt']);

// how far the gas has spread (px) after it has been filling to `gas` (0..1)
export const reach = (gas, cfg = GAS_VALVE) => cfg.radius * Math.sqrt(gas);

export default class GasValve {
  constructor(world, cfg = GAS_VALVE) {
    this.world = world;
    this.cfg = cfg;
    this.taps = null; // { prop, open, gas, hiss } per stove with a tap, looked up at the first step
    const ev = world.events;
    ev.on('shot', ({ shooter }) => shooter && this.spark(shooter.x, shooter.y));       // a muzzle flash
    ev.on('explosion', ({ x, y, radius }) => this.spark(x, y, radius));
    ev.on('propHit', ({ prop, x, y, kind }) => { if (prop.def.material === 'metal' && SPARKS.has(kind)) this.spark(x, y); });
  }

  // the taps, once the props are there (World, after the level is built; else at the first step)
  wire() {
    if (this.taps) return;
    this.taps = [];
    for (const p of this.world.props) {
      if (!p.valve) continue;
      const tap = { prop: p, open: false, gas: 0, hiss: 0, blown: false };
      this.taps.push(tap);
      this.world.uses?.add({ kind: 'gas', prop: p, r: 26, label: () => (tap.open ? 'SHUT THE GAS' : 'OPEN THE GAS'),
        ok: () => !tap.blown, use: () => this.turn(tap) });
    }
  }

  turn(tap) {
    tap.open = !tap.open;
    this.world.sound('handle', tap.prop.x, tap.prop.y, 0.5);
    if (tap.open) this.world.sound('hiss', tap.prop.x, tap.prop.y, 0.6, { pitch: 0.7 });
  }

  // a spark at (x, y) (r: the blast's own reach): any cloud it touches goes up
  spark(x, y, r = 0) {
    for (const tap of this.taps || []) {
      if (tap.blown || tap.gas < this.cfg.min) continue;
      if (Math.hypot(x - tap.prop.x, y - tap.prop.y) < reach(tap.gas, this.cfg) + r) this.blow(tap);
    }
  }

  blow(tap) {
    const w = this.world, p = tap.prop, c = this.cfg, R = reach(tap.gas, c), gas = tap.gas;
    tap.blown = true;
    tap.open = false;
    tap.gas = 0;
    // the flame runs through the cloud first, then the stove goes
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU), d = R * Math.sqrt(Math.random());
      w.particles.fire(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1, 60, { size: [5, 10], life: [0.25, 0.6], rise: 40 });
    }
    w.light(p.x, p.y, R * 1.6, '#ffb060', 0.3);
    w.explode(p.x, p.y, { radius: c.blast + c.extra * gas, source: 'gas' });
  }

  // what heats the air for the lens (Game.lensView): the shimmer over a tap left open
  heat() {
    return (this.taps || []).filter((t) => t.gas > 0.1 && !t.blown).map((t) => ({ x: t.prop.x, y: t.prop.y, kind: 'steam' }));
  }

  update(dt) {
    if (!this.taps) this.wire();
    const w = this.world, c = this.cfg;
    for (const tap of this.taps) {
      const p = tap.prop;
      if (tap.blown) continue;
      if (p.dead || p.dying) { tap.open = false; tap.blown = true; tap.gas = 0; continue; } // the stove is gone, its tap with it
      tap.gas = tap.open ? Math.min(1, tap.gas + dt / c.fill) : Math.max(0, tap.gas - dt / (c.fill * 1.5));
      if (!tap.open) continue;
      // the hiss of it, and the air bending over the burners
      if ((tap.hiss -= dt) <= 0) {
        tap.hiss = c.hiss;
        w.sound('hiss', p.x, p.y, 0.3, { pitch: 0.6 });
      }
      if (chance(c.shimmer)) w.particles.dust(p.x + rand(-6, 6), p.y + rand(-6, 6), 1, 4, '#c8d8b0', { speed: 8, size: 6, life: 1.6, alpha: 0.05 });
      // a fire in the cloud lights it
      if (w.fires?.lit().some((f) => Math.hypot(f.x - p.x, f.y - p.y) < reach(tap.gas, c))) this.blow(tap);
    }
  }
}
