// Far-off police sirens: ambience only, nobody ever comes. Gunfire that goes on brings them: while shots or blasts
// keep coming (less than `lull` s apart) the firefight's clock runs, and past `after` s a wail rises somewhere in
// the city, then a second car answers. They die down once the guns have been silent for `linger` s.
// DOM-free: one wail per 'siren' sound, repeated here.
import { SIRENS } from '../Config.js';
import { clamp } from '../../engine/math.js';

export default class Sirens {
  constructor(world, cfg = SIRENS) {
    this.world = world;
    this.cfg = cfg;
    this.quiet = Infinity; // s since the last shot or blast
    this.fight = 0;        // s the firefight has lasted
    this.level = 0;        // 0..1 how much of them is heard
    this.cars = cfg.cars.map((c) => ({ ...c, beat: c.late }));
    const bang = () => { this.quiet = 0; };
    world.events.on('shot', bang);
    world.events.on('explosion', bang);
  }

  update(dt) {
    const c = this.cfg;
    this.quiet += dt;
    if (this.quiet < c.lull) this.fight += dt;
    else if (this.quiet > c.linger) this.fight = 0;
    this.level = clamp(this.level + dt / (this.fight >= c.after ? c.rise : -c.fade), 0, 1);
    if (this.level <= 0) {
      for (const car of this.cars) car.beat = car.late;
      return;
    }
    for (const car of this.cars) {
      if ((car.beat -= dt) > 0) continue;
      car.beat += c.period;
      this.world.sound('siren', undefined, undefined, this.level * car.vol, { pan: car.pan, pitch: car.pitch });
    }
  }
}
