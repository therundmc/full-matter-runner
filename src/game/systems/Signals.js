// Lamps that take turns: traffic lights (red / amber / green), the works' arrow board, a barricade's flashers
// (data/signals.js SIGNALS, by the `signal` of a prop's def). Each step a prop of theirs gets its `lamps`: one flag a
// light of its def, which render/Lighting.js reads (the light itself, and its slices of the emissive map: def
// `lamps`). Looks only: nobody stops at a red light. DOM-free.
import { SIGNALS } from '../data/signals.js';

// the lights lit t s into a cycle [[lit, s], ...] (it goes round for ever)
export function litAt(cycle, t) {
  const total = cycle.reduce((s, [, d]) => s + d, 0);
  let u = ((t % total) + total) % total;
  for (const [lit, d] of cycle) {
    if (u < d) return lit;
    u -= d;
  }
  return cycle[cycle.length - 1][0];
}

export default class Signals {
  constructor(world) {
    this.world = world;
    this.list = world.props.filter((p) => SIGNALS[p.def?.signal]);
    this.step();
  }

  step() {
    const t = this.world.time || 0;
    for (const p of this.list) {
      const lit = litAt(SIGNALS[p.def.signal].cycle, t + (p.phase || 0)), n = [].concat(p.def.light || []).length;
      const flags = (p.lamps ||= new Array(n).fill(false));
      for (let i = 0; i < n; i++) flags[i] = lit.includes(i);
    }
  }
}
