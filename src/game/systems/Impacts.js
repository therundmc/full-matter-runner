// Turns physics 'impact' events into sounds: the material of what hit, how hard and how heavy it was.
// (bodies carry body.material, see data/materials.js)
import { MATERIALS } from '../data/materials.js';
import { kgOf } from '../../engine/physics/Body.js';
import { clamp } from '../../engine/math.js';

const { Body } = Matter;

const SOUND = { wood: 'wood', metal: 'metal', glass: 'glassHit', ceramic: 'ceramic', stone: 'stone', flesh: 'flesh', plastic: 'plastic', soft: 'soft', shell: 'shell' };
const MIN_SPEED = 1.2;      // px/step closing speed below which nothing is heard
const BODY_COOLDOWN = 0.12; // s between two sounds of the same body
const MAX_PER_SECOND = 14;

export default class Impacts {
  constructor(world) {
    this.world = world;
    this.budget = MAX_PER_SECOND;
    world.events.on('impact', (e) => this.onImpact(e));
  }

  onImpact({ a, b, speed, x, y }) {
    if (speed < MIN_SPEED || this.budget < 1) return;
    // the sound comes from whichever body carries the most kinetic energy
    const energy = (body) => (body.isStatic ? 0 : kgOf(body) * Body.getSpeed(body) ** 2);
    const src = energy(a) >= energy(b) ? a : b;
    const mat = MATERIALS[src.material];
    const name = mat && SOUND[mat.sound];
    if (!name) return;
    const t = this.world.time;
    if (src.lastImpactSound > t - BODY_COOLDOWN) return;
    src.lastImpactSound = t;
    this.budget--;
    const vol = clamp(speed / 6, 0.15, 1) * clamp(Math.sqrt(kgOf(src)) / 3, 0.2, 1);
    this.world.sound(name, x, y, vol);
  }

  update(dt) { this.budget = Math.min(MAX_PER_SECOND, this.budget + MAX_PER_SECOND * dt); }
}
