import { MAX_PARTICLES, PALETTE, DESTRUCTION, LITTER, WALL_RIM } from '../Config.js';
import { rand, randi, pick, chance, spread } from '../../engine/math.js';
import { silhouette, sw, sh } from '../../engine/Assets.js';
import { RUNS } from '../data/wounds.js';
import { run, faceNormal, shutBetween } from './Spatter.js';

// Lightweight non-physics particles. Particles with a height (z) fall and stamp decals when they land.
// FLOAT: stuffing / feathers / paper drifting down slowly; DUST: clouds that hang and settle; DROP: liquid;
// MOTE: a fleck of floor dust kicked up low (a slide, a landing): a whole pixel or two that fades in steps.
// JET: water thrown high (a geyser), seen from above: it grows and leans away from the middle of the view as it rises.
export const P = { BLOOD: 0, SPARK: 1, SMOKE: 2, FIRE: 3, GLASS: 4, CHIP: 5, MIST: 6, EMBER: 7, SHARD: 8, FLOAT: 9, DUST: 10, DROP: 11, JET: 12, MOTE: 13 };
const SHARD_REST = 0.5; // seconds a landed shard lies still before it is baked into the floor
const GRAVITY = 520;    // px/s2 of fake height
// what goes really high (JET, shards thrown with opts.high) comes toward the camera: per px of height it grows by
// HIGH.grow, leans away from the view centre by HIGH.lean of its distance to it, and climbs HIGH.up px up the screen
const HIGH = { grow: 0.009, lean: 0.0012, up: 0.3 };
const WATER = ['#f4faff', '#d6e8fa', '#b4cfec', '#8fb2da'];
// a flame is one flat colour, the one of its heat (HEAT: where each band starts), from soot to white-hot
const FLAME = ['#2c1c1a', '#7e1a0c', '#d8401a', '#ff8a1e', '#ffd040', '#fff6cf'];
const HEAT = [0, 0.16, 0.32, 0.5, 0.7, 0.9];
// smoke is a few flat greys; the billows of a fire are chunks of one of them with their lit corner one step lighter
// (the last tone is only ever a highlight) that thin in steps, then break up into wisps; other smoke is soft puffs
const SMOKE = { light: ['#62626e', '#7c7c88', '#989aa6', '#b6b8c2'], dark: ['#1b191d', '#29262b', '#39353b', '#4b464d'] };
const WISP = 0.3;       // share of its life a chunk of fire smoke ends as wisps
// soft puffs (see puff()): sprite size, shape variants per colour, drawn size per unit of particle size, opacity
// (dust: times its own alpha), below `min` it is not drawn
const PUFF = { px: 16, variants: 3, scale: 2.2, dust: 2.4, smoke: 0.8, min: 0.025 };

export default class Particles {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.floats = 0; // FLOAT particles alive (they live long: capped)
    this.bands = FLAME.map(() => []); // flames sorted by heat, refilled at every draw
  }

  add(p) {
    if (this.list.length >= MAX_PARTICLES) {
      // land the oldest blood immediately rather than dropping it
      const old = this.list.shift();
      if (old.type === P.BLOOD) this.world.decals.stampBlood(old.x, old.y, old.size * 0.8);
    }
    this.list.push(p);
    return p;
  }

  // ---- emitters ----
  // Blood leaving a wound, `count` drops within `spreadA` of `angle` plus the fine spray that comes with them and
  // that the air stops short; a few heavy drops carry (more with opts.big), the cone is denser in its middle, and
  // now and then a string of drops leaves one behind the other. opts.jet: an arterial jet, every drop on the line
  // at the given speed.
  blood(x, y, angle, spreadA, count, speed, opts = {}) {
    const wide = spreadA > 2, heavy = opts.big ? 0.72 : 0.88;
    let string = 0, sa = 0, sv = 0;
    for (let i = 0, n = opts.jet ? count : Math.ceil(count * 1.5); i < n; i++) {
      const u = Math.random();
      let a = angle + (wide || opts.jet ? rand(-1, 1) : spread() * (u > heavy ? 0.7 : 1.15)) * spreadA;
      let v = speed * (opts.jet ? rand(0.92, 1.05) : u < 0.5 ? rand(0.15, 1.1) : u > heavy ? rand(0.3, 0.85) : rand(0.3, 1.15));
      let size = opts.jet ? rand(1.3, 2.1) : u < 0.5 ? 1 : u > heavy ? rand(2.3, opts.big ? 3.8 : 3) : rand(1.3, 2.2);
      if (string > 0) {
        // the next drop of a string: same line, a little slower, a little smaller
        string--;
        a = sa + rand(-0.02, 0.02);
        v = sv *= rand(0.8, 0.92);
        size = Math.max(1, 1.2 + string * 0.3);
      } else if (count >= 8 && !opts.jet && chance(0.07)) {
        string = randi(3, 6); sa = a; sv = v = speed * rand(0.8, 1.2);
      }
      this.add({
        type: P.BLOOD, x, y, z: opts.z ?? rand(8, 16), vz: opts.jet ? rand(50, 100) : rand(-20, 120),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size, color: pick(PALETTE.blood), life: 3, drag: size <= 1 ? 2.4 : size > 2.3 ? 0.8 : 1.2,
      });
    }
  }

  // the fine red cloud of a hit (blown along `angle` if given): it hangs a moment and settles as a stipple
  mist(x, y, count, r = 10, angle) {
    for (let i = 0; i < count * 2; i++) {
      const a = angle === undefined ? rand(0, Math.PI * 2) : angle + spread() * 1.1, v = rand(10, 120);
      const life = rand(0.15, 0.5);
      this.add({ type: P.MIST, x: x + rand(-r, r) * 0.3, y: y + rand(-r, r) * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: chance(0.25) ? 2 : 1, life, maxLife: life, drag: 4, color: pick(PALETTE.blood) });
    }
  }

  sparks(x, y, angle, spreadA, count, speed = 300, color) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.3, 1.2);
      const life = rand(0.08, 0.3);
      this.add({ type: P.SPARK, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, maxLife: life, drag: 5,
        color: color || (chance(0.5) ? '#fff6b0' : PALETTE.yellow) });
    }
  }

  // opts.puff: the smoke of a fire, in square billows that roll up toward the camera (opts.h: height it starts at)
  smoke(x, y, count, r = 6, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = rand(5, opts.speed ?? 40);
      const life = rand(0.6, opts.life ?? 1.6);
      this.add({ type: P.SMOKE, x: x + rand(-r, r), y: y + rand(-r, r), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: rand(3, opts.size ?? 9), grow: opts.puff ? rand(3, 8) : rand(6, 16), life, maxLife: life, drag: 2.5,
        tones: opts.dark ? SMOKE.dark : SMOKE.light, tone: randi(0, 2),
        puff: !!opts.puff, h: opts.h || 0, rise: opts.puff ? rand(8, 24) : 0, lobe: rand(0, 6.28) });
    }
  }

  // Flames: square chunks leaving (x, y) at up to `speed`. The slow ones stay in the middle and stay hot, the fast
  // ones cool at the rim, so a burst reads white, yellow, orange, red from its heart outward.
  // opts: size [min, max], life [min, max], rise (px/s toward the camera), h (height they start at), heat (added
  // to every flame: by default a fire that just burns, yellow at birth; 0 for a blast, born white-hot).
  fire(x, y, count, speed = 160, opts = {}) {
    const [s0, s1] = opts.size || [3, 8], [l0, l1] = opts.life || [0.15, 0.55], base = opts.heat ?? -0.12;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), u = Math.sqrt(Math.random()), v = speed * u;
      const life = rand(l0, l1) * (1.15 - 0.4 * u);
      this.add({ type: P.FIRE, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rand(s0, s1), life, maxLife: life, drag: 3.5,
        heat: base + (1 - u) * 0.42 + rand(-0.06, 0.06), h: opts.h || 0, rise: (opts.rise ?? 36) * rand(0.5, 1.4), lobe: rand(0, 6.28) });
    }
  }

  embers(x, y, count, speed = 220) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = speed * rand(0.3, 1.3);
      const life = rand(0.5, 1.4);
      this.add({ type: P.EMBER, x, y, z: rand(2, 10), vz: rand(40, 160), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life, maxLife: life, drag: 1.5 });
    }
  }

  // burning scraps thrown high: each trails flame and smoke on its way, and onLand(x, y) is called where it falls
  cinders(x, y, count, speed, onLand) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = speed * rand(0.45, 1.2);
      this.add({ type: P.EMBER, x, y, z: rand(4, 10), vz: rand(150, 300), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 3, maxLife: 3, drag: 0.8, trail: true, onLand });
    }
  }

  glass(x, y, angle, spreadA, count, speed = 160) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.2, 1.2);
      this.add({ type: P.GLASS, x: x + rand(-8, 8), y: y + rand(-8, 8), z: rand(4, 12), vz: rand(0, 80),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rand(1, 2.5), life: 3, drag: 1.5, rot: rand(0, 6) });
    }
  }

  chips(x, y, angle, spreadA, count, color, speed = 140) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.2, 1.2);
      this.add({ type: P.CHIP, x, y, z: rand(3, 10), vz: rand(10, 90), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: rand(1, 2.2), color, life: 3, drag: 1.8 });
    }
  }

  // purely visual piece of an object (img): flies, lands, skids a little, fades away. No physics body.
  // It tumbles, lands, bounces, skids, then is baked into the floor (the remains stay).
  // opts.high: thrown metres up, it comes toward the camera (see HIGH); opts.onLand(p): called when it touches the
  // floor, instead of the bounce and the bake (the caller takes over from there).
  shard(img, x, y, angle, speed, opts = {}) {
    const a = angle;
    this.add({ type: P.SHARD, img, x, y, z: opts.z ?? 6, vz: opts.vz ?? (40 + Math.random() * 90),
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, rot: opts.rot ?? Math.random() * 6.28,
      spin: opts.spin ?? (Math.random() - 0.5) * 14, life: 8, drag: opts.drag ?? 1.2, landed: false,
      bounce: opts.bounce ?? 0.3, high: !!opts.high, onLand: opts.onLand || null });
  }

  // water under pressure, straight up: `count` gobs leaving at up to `vz` px/s, scattered sideways up to `speed`
  // (alpha: how solid they look, 1 = white water, less = spray)
  jet(x, y, count, { vz = 400, speed = 30, size = 3, alpha = 0.8 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = speed * Math.sqrt(Math.random());
      this.add({ type: P.JET, x: x + rand(-1.5, 1.5), y: y + rand(-1.5, 1.5), z: 2, vz: vz * rand(0.72, 1.05),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: size * rand(0.6, 1.2), color: pick(WATER),
        alpha: alpha * rand(0.65, 1.1), life: 4, drag: 0.3 });
    }
  }

  // slow floating bits: stuffing, foam, feathers, paper, leaves (kind = a data/destruction.js FLOATS entry)
  floaters(x, y, kind, count, angle = 0, spreadA = Math.PI, speed = 60, z = 10) {
    count = Math.min(count, DESTRUCTION.maxFloats - this.floats);
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.2, 1.1);
      this.floats++;
      this.add({ type: P.FLOAT, x: x + rand(-3, 3), y: y + rand(-3, 3), z: z * rand(0.6, 1.4), vz: rand(20, 70),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, fall: kind.fall * rand(0.7, 1.3), ph: rand(0, 6.28), sway: rand(6, 16),
        size: rand(kind.size[0], kind.size[1]), color: pick(kind.colors), flat: !!kind.flat, life: 14, drag: 3 });
    }
  }

  // a cloud that hangs in the air and slowly settles
  dust(x, y, count, r, color, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = rand(4, opts.speed ?? 30);
      const life = rand(1.4, opts.life ?? 3.4);
      this.add({ type: P.DUST, x: x + rand(-r, r), y: y + rand(-r, r) * 0.7, vx: Math.cos(a) * v + (opts.vx || 0), vy: Math.sin(a) * v + (opts.vy || 0),
        size: rand(1.5, opts.size ?? 5), grow: rand(1, 3.5), life, maxLife: life, drag: 1.6, color, alpha: opts.alpha ?? 0.18, tag: opts.tag });
    }
  }

  // flecks of floor dust kicked along a (within spread rad) off (x, y) (r: px they start scattered over), alpha at most
  motes(x, y, a, spread, count, color, speed = 40, alpha = 0.6, r = 1) {
    for (let i = 0; i < count; i++) {
      const d = a + rand(-spread, spread), v = speed * rand(0.35, 1.1), life = rand(0.25, 0.55);
      this.add({ type: P.MOTE, x: x + rand(-r, r), y: y + rand(-r, r), vx: Math.cos(d) * v, vy: Math.sin(d) * v,
        size: chance(0.3) ? 2 : 1, color, alpha, life, maxLife: life, drag: 4.5 });
    }
  }

  // a ring of them thrown out from (x, y) all round, starting r px out: the dust a landing pushes off the floor
  ring(x, y, count, r, speed, color, alpha = 0.6) {
    const a0 = rand(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const a = a0 + (i / count) * Math.PI * 2 + rand(-0.2, 0.2), v = speed * rand(0.75, 1.15), life = rand(0.3, 0.5);
      this.add({ type: P.MOTE, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: chance(0.4) ? 2 : 1, color, alpha, life, maxLife: life, drag: 5 });
    }
  }

  // liquid: droplets that leave a wet stain where they land (stain = false: spray that dries at once)
  drops(x, y, angle, spreadA, count, color, speed = 120, z = 6, stain = true) {
    const fly = color.replace(/[\d.]+\)$/, '0.75)'); // a stain is faint, a flying drop catches the light
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spreadA, spreadA), v = speed * rand(0.4, 1.1);
      this.add({ type: P.DROP, x, y, z: z * rand(0.6, 1.2), vz: rand(0, 60), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: rand(0.8, 1.6), color, fly, stain, life: 3, drag: 1 });
    }
  }

  // ---- simulation ----
  update(dt) {
    const map = this.world.map;
    const decals = this.world.decals;
    const list = this.list;
    let w = 0, floats = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      const f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f; p.vy *= f;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      let alive = p.life > 0;

      if (p.type === P.SHARD) {
        // airborne (tumbling), bounces, skids to a stop, then becomes part of the floor
        if (!p.landed) {
          p.vz -= GRAVITY * dt;
          p.z += p.vz * dt;
          p.rot += p.spin * dt;
          if (p.z <= 0 && p.onLand) {
            p.z = 0;
            p.onLand(p);
            continue;
          }
          if (p.z <= 0) {
            p.z = 0;
            if (p.vz < -70 && p.bounce > 0) { p.vz *= -p.bounce; p.bounce *= 0.5; p.vx *= 0.7; p.vy *= 0.7; p.spin *= 0.6; }
            else { p.landed = true; p.life = SHARD_REST + 1.5; p.vx *= 0.5; p.vy *= 0.5; p.spin *= 0.3; }
          }
        } else {
          const f2 = Math.max(0, 1 - 6 * dt);
          p.vx *= f2; p.vy *= f2; p.spin *= f2;
          p.rot += p.spin * dt;
          if ((p.life < 1.5 && p.vx * p.vx + p.vy * p.vy < 4) || p.life <= 0) { this._rest(p); alive = false; }
        }
        if (!alive && !p.landed) { p.landed = true; this._rest(p); }
        // a wall, a shut door or a pane: it bounces back off it
        if (map.solidAt(nx, ny) || (!p.landed && shutBetween(this.world, p.x, p.y, nx, ny))) { p.vx *= -0.3; p.vy *= -0.3; p.x += p.vx * dt; p.y += p.vy * dt; if (alive) list[w++] = p; continue; }
      } else if (p.type === P.FLOAT) {
        // pops up, then flutters down, swaying
        p.vz = Math.max(-p.fall, p.vz - 140 * dt);
        p.z += p.vz * dt;
        p.ph += dt * 3;
        p.vx += Math.sin(p.ph) * p.sway * dt * 4;
        if (map.solidAt(nx, ny)) { p.vx = -p.vx * 0.3; p.vy = -p.vy * 0.3; } else { p.x = nx; p.y = ny; }
        if (p.z <= 0 || !alive) { this._land(p, p.x, p.y); alive = false; }
        if (alive) { floats++; list[w++] = p; }
        continue;
      } else if (p.type === P.JET) {
        // far above the walls: it only meets the floor (and is lost on a roof)
        p.vz -= GRAVITY * dt;
        p.z += p.vz * dt;
        p.x = nx; p.y = ny;
        if (p.z > 0 && alive) list[w++] = p;
        else if (chance(0.4) && !map.solidAt(nx, ny)) this.drops(nx, ny, rand(0, 6.28), 3.14, 1, 'rgba(200,225,250,0.5)', 30, 2, false);
        continue;
      } else if (p.z !== undefined) {
        p.vz -= 520 * dt;
        p.z += p.vz * dt;
        if (p.type === P.BLOOD && shutBetween(this.world, p.x, p.y, nx, ny)) {
          alive = false; // a shut door or a pane takes it: nothing beyond
        } else if (map.solidAt(nx, ny)) {
          // hit a wall while airborne: blood splashes its top and runs down to its foot
          if (p.type === P.BLOOD) {
            // on its top, behind the outline of the face it struck
            const [fx, fy] = faceNormal(map, p.x, p.y, nx, ny), deep = WALL_RIM + p.size;
            decals.stampWall(nx - fx * deep, ny - fy * deep, p.size * 0.9, fx, fy);
            if (chance(0.5)) decals.stampBlood(p.x, p.y, p.size * 0.8);
            if (p.size > 1.8 && chance(RUNS.odds)) run(this.world, p.x, p.y, fx, fy, rand(...RUNS.len) * p.size * 0.4);
          }
          alive = false;
        } else if (p.z <= 0) {
          this._land(p, nx, ny);
          alive = false;
        } else if (p.trail) {
          if (chance(0.75)) this.fire(nx, ny, 1, 6, { size: [2, 4], life: [0.12, 0.3], h: p.z, rise: 0 });
          if (chance(0.25)) this.smoke(nx, ny, 1, 1, { dark: true, puff: true, speed: 8, size: 4, life: 0.9, h: p.z });
        }
      } else if ((p.type === P.SPARK) && map.solidAt(nx, ny)) {
        p.vx *= -0.4; p.vy *= -0.4;
      } else if (p.type === P.MIST && shutBetween(this.world, p.x, p.y, nx, ny)) {
        continue; // a shut door or a pane takes the fine spray too
      } else if (p.type === P.MIST && !alive && chance(0.6) && !map.solidAt(nx, ny)) {
        decals.speck(nx, ny);
      }
      if (p.type === P.SMOKE || p.type === P.DUST) p.size += p.grow * dt;
      if (p.rise) p.h += p.rise * dt;
      p.x = nx; p.y = ny;
      if (alive) list[w++] = p;
    }
    list.length = w;
    this.floats = floats;
  }

  // a shard that has come to rest becomes part of the floor; of the tiny ones only some stay (LITTER)
  _rest(p) {
    if (sw(p.img) * sh(p.img) < LITTER.small && !chance(LITTER.keep)) return;
    this.world.decals.wreck(p.img, p.x, p.y, p.rot);
  }

  // what a falling particle leaves on the floor. Crumbs (glass, chips, cinders, fluff) only now and then, and faint
  // (LITTER): the floor must not fill up with rubble; blood always marks.
  _land(p, x, y) {
    const decals = this.world.decals;
    const crumb = (color, w, h) => {
      if (!chance(LITTER.keep)) return;
      const g = decals.floorCtx;
      g.globalAlpha = LITTER.alpha;
      g.fillStyle = color;
      g.fillRect(Math.round(x), Math.round(y), w, h);
      g.globalAlpha = 1;
    };
    switch (p.type) {
      case P.BLOOD: {
        // the flatter a drop comes in, the longer its stain; one falling straight leaves a round spot
        const flat = Math.hypot(p.vx, p.vy) / Math.max(40, -p.vz);
        if (p.size <= 1) {
          if (flat > 1.1) decals.stampStreak(x, y, p.vx, p.vy, 1 + Math.min(3, flat), 1);
          else decals.speck(x, y, 1);
        } else if (flat > 0.6) decals.stampStreak(x, y, p.vx, p.vy, p.size * (1.3 + Math.min(3.6, flat * 1.3)), p.size * 1.35);
        else if (p.size > 2.6 && chance(0.5)) decals.stampBlood(x, y, p.size * 1.2, 3, Math.atan2(p.vy, p.vx)); // a heavy one bursts
        else decals.stampBlood(x, y, p.size * 1.1);
        break;
      }
      case P.GLASS:
        crumb(chance(0.5) ? 'rgba(200,250,255,0.85)' : 'rgba(120,220,240,0.7)', Math.ceil(p.size), 1);
        break;
      case P.CHIP:
        crumb(p.color, Math.ceil(p.size), Math.ceil(p.size * 0.6));
        break;
      case P.EMBER:
        crumb('rgba(20,10,10,0.6)', 1, 1);
        if (p.onLand) p.onLand(x, y);
        break;
      case P.FLOAT:
        crumb(p.color, Math.round(p.size), Math.max(1, Math.round(p.flat ? p.size * 0.6 : p.size)));
        break;
      case P.DROP:
        if (p.stain) decals.spill(x, y, p.size * rand(1.2, 2.2), p.color);
        if (chance(0.35)) this.world.liquids?.ripple(x, y, p.size * 2); // a ring where it falls in standing liquid
        break;
      default: break;
    }
  }

  // normal-blended particles (drawn before the additive pass)
  draw(ctx) {
    const cam = this.world.camera;
    for (const p of this.list) {
      switch (p.type) {
        case P.SHARD: {
          // the shadow stays on the floor while the piece is up in the air
          // a piece of a finer sprite (Assets.js `density`) is drawn at its world size
          const hw = p.img.width / 2, hh = p.img.height / 2, d = p.img.k || 1;
          const c = Math.cos(p.rot) * d, s = Math.sin(p.rot) * d;
          ctx.save();
          ctx.globalAlpha = 0.3 / (1 + p.z * 0.03);
          ctx.transform(c, s, -s, c, p.x + 1, p.y + 1);
          ctx.drawImage(silhouette(p.img), -hw, -hh);
          ctx.restore();
          ctx.save();
          if (p.high) {
            const k = 1 + p.z * HIGH.grow, l = p.z * HIGH.lean;
            ctx.transform(c * k, s * k, -s * k, c * k, p.x + (p.x - cam.x) * l, p.y + (p.y - cam.y) * l - p.z * HIGH.up);
          } else {
            const k = 1 + p.z * 0.006;
            ctx.transform(c * k, s * k, -s * k, c * k, p.x, p.y - p.z * 0.5);
          }
          ctx.drawImage(p.img, -hw, -hh);
          ctx.restore();
          break;
        }
        case P.JET: {
          // a gob and the streak it leaves behind it (where it was a moment ago)
          const s = Math.max(1, Math.round(p.size * (1 + p.z * HIGH.grow)));
          const dx = p.x - cam.x, dy = p.y - cam.y;
          ctx.fillStyle = p.color;
          for (let i = 0; i < 2; i++) {
            const z = Math.max(0, p.z - i * p.vz * 0.035), l = z * HIGH.lean;
            ctx.globalAlpha = Math.min(1, p.alpha) * (i ? 0.45 : 1);
            ctx.fillRect(Math.round(p.x + dx * l - s / 2), Math.round(p.y + dy * l - z * HIGH.up - s / 2), s, s);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case P.FLOAT: {
          // paper and leaves flutter (their width flips as they turn)
          const fl = p.flat ? Math.abs(Math.cos(p.ph * 1.7)) * 0.8 + 0.2 : 1;
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(p.x + 1, p.y + 1, p.size * fl, p.size * 0.7);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y - p.z * 0.5, p.size * fl, p.flat ? p.size * 0.7 : p.size);
          break;
        }
        case P.DUST: {
          // a soft puff that swells, thins away and is gone: a pile of them is a cloud without an outline
          const s = p.size * PUFF.scale, al = p.alpha * PUFF.dust * fade(p.life / p.maxLife);
          if (al < PUFF.min) break;
          ctx.globalAlpha = Math.min(1, al);
          ctx.drawImage((p.spr ||= puff(p.color, (p.maxLife * 31) | 0)).img, p.x - s / 2, p.y - s / 2, s, s);
          ctx.globalAlpha = 1;
          break;
        }
        case P.DROP:
          ctx.fillStyle = p.fly;
          ctx.fillRect(p.x, p.y - p.z * 0.4, p.size, p.size);
          break;
        case P.BLOOD: {
          // a drop on whole pixels, stretched back along its way when it flies fast
          const s = p.size < 1.3 ? 1 : p.size < 2.5 ? 2 : 3, y = p.y - p.z * 0.25;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x - s / 2), Math.round(y - s / 2), s, s);
          if (p.vx * p.vx + p.vy * p.vy > 4900) {
            const t = s > 1 ? s - 1 : 1;
            ctx.fillRect(Math.round(p.x - p.vx * 0.012 - t / 2), Math.round(y - p.vy * 0.012 - t / 2), t, t);
            ctx.fillRect(Math.round(p.x - p.vx * 0.024), Math.round(y - p.vy * 0.024), 1, 1);
          }
          break;
        }
        case P.MIST:
          ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 2) * 0.75;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, 1);
          ctx.globalAlpha = 1;
          break;
        case P.SMOKE: {
          const a = Math.max(0, p.life / p.maxLife);
          if (!p.puff) {
            // the smoke of a short or a dying motor: soft, like dust (the billows of a fire stay square, below)
            const s = p.size * PUFF.scale, al = PUFF.smoke * fade(a);
            if (al < PUFF.min) break;
            ctx.globalAlpha = al;
            ctx.drawImage((p.spr ||= puff(p.tones[p.tone], (p.lobe * 5) | 0)).img, p.x - s / 2, p.y - s / 2, s, s);
            ctx.globalAlpha = 1;
            break;
          }
          // a chunk: a billow of a fire is lit from below while it is young; all thin in flat steps
          const y = p.y - p.h * 0.5, s = Math.max(2, Math.round(p.size * (p.puff ? 1.5 * (1 + p.h * 0.006) : 1.7)));
          const glow = p.puff && p.maxLife - p.life < 0.22;
          ctx.globalAlpha = (Math.ceil(a * 4) / 4) * (p.puff ? 0.5 : 0.55);
          ctx.fillStyle = glow ? '#6a3a20' : p.tones[p.tone];
          if (a <= WISP) wisps(ctx, p.x, y, s, p.lobe, 1 - a / WISP);
          else {
            block(ctx, p.x, y, s, p.lobe);
            if (s >= 5 && !glow) {
              ctx.fillStyle = p.tones[p.tone + 1];
              const q = s >> 1;
              ctx.fillRect(Math.round(p.x - s / 2) + 1, Math.round(y - s / 2) + 1, q, q);
            }
          }
          ctx.globalAlpha = 1;
          break;
        }
        case P.MOTE:
          // on whole pixels, thinning in three flat steps
          ctx.globalAlpha = p.alpha * Math.ceil((p.life / p.maxLife) * 3) / 3;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, 1); // a fleck of two lies along the floor
          ctx.globalAlpha = 1;
          break;
        case P.GLASS:
          ctx.fillStyle = '#c8faff';
          ctx.fillRect(p.x, p.y - p.z * 0.25, p.size, 1);
          break;
        case P.CHIP:
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y - p.z * 0.25, p.size, p.size * 0.7);
          break;
        default: break;
      }
    }
  }

  // Flames, after the lighting (they shine by themselves): opaque, on whole pixels, the hottest on top, so a fire
  // is a few flat bands of colour with a broken edge instead of a soft glow.
  drawFire(ctx) {
    const bands = this.bands;
    for (const b of bands) b.length = 0;
    for (const p of this.list) {
      if (p.type !== P.FIRE) continue;
      const heat = p.life / p.maxLife + p.heat;
      let b = HEAT.length - 1;
      while (b > 0 && heat < HEAT[b]) b--;
      bands[b].push(p);
    }
    for (let b = 0; b < bands.length; b++) {
      ctx.fillStyle = FLAME[b];
      ctx.globalAlpha = b ? 1 : 0.5;
      for (const p of bands[b]) {
        // it swells as it leaves, then burns out
        const a = p.life / p.maxLife, k = Math.min(1, 0.45 + (1 - a) * 2.2) * Math.min(1, a * 2.5 + 0.2);
        block(ctx, p.x, p.y - p.h * 0.5, Math.max(1, Math.round(p.size * k * (1 + p.h * 0.006))), p.lobe);
      }
    }
    ctx.globalAlpha = 1;
  }

  // additive pass (sparks, embers)
  drawGlow(ctx) {
    for (const p of this.list) {
      if (p.type === P.SPARK) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      } else if (p.type === P.EMBER) {
        if (p.trail) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ffe9a0';
          ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y - p.z * 0.5) - 1, 3, 3);
        } else {
          ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
          ctx.fillStyle = '#ffa030';
          ctx.fillRect(p.x, p.y - p.z * 0.3, 1.5, 1.5);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Soft puffs (dust, the extinguisher's powder, the smoke of a short): a small sprite per colour and variant, made once
// (kept on the particle as `spr`: { img }) and drawn scaled. Its alpha falls off to nothing at the rim from a few
// overlapping lobes, so a pile of them is a lumpy cloud with no square edge; scaled on whole texels it keeps the
// pixel grain of the rest.
const puffs = new Map();
function puff(color, variant) {
  const key = color + (variant % PUFF.variants);
  let e = puffs.get(key);
  if (e) return e;
  const n = PUFF.px, m = n / 2;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  let seed = (variant % PUFF.variants) * 7919 + 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2, d = i ? n * 0.17 : 0, r = n * (i ? 0.27 : 0.46);
    const x = m + Math.cos(a) * d, y = m + Math.sin(a) * d;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(0,0,0,${i ? 0.35 : 0.6})`);
    grad.addColorStop(0.55, `rgba(0,0,0,${i ? 0.15 : 0.28})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  }
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, n, n);
  // drawn as a bitmap once it is ready (it stays on the GPU; a small canvas would be uploaded at every draw)
  e = { img: c };
  createImageBitmap(c).then((b) => { e.img = b; }, () => {});
  puffs.set(key, e);
  return e;
}

// how much of a soft puff shows at k = life left / life: it comes in quickly, then thins away smoothly
function fade(k) {
  const out = Math.min(1, k / 0.65);
  return Math.min(1, (1 - k) * 8) * out * out;
}

// what is left of a chunk of smoke of side s: three small squares drifting apart (k: 0 -> 1) on whole pixels
function wisps(ctx, x, y, s, turn, k) {
  const t = Math.max(1, Math.round(s * (0.42 - 0.2 * k))), o = s * (0.3 + 0.35 * k);
  for (let i = 0; i < 3; i++) {
    const a = turn + i * 2.1;
    ctx.fillRect(Math.round(x + Math.cos(a) * o - t / 2), Math.round(y + Math.sin(a) * o - t / 2), t, t);
  }
}

// a chunk of flame or smoke: a square of side s on whole pixels and a smaller one stuck to it (toward `lobe`),
// so that a pile of them has a lumpy outline
function block(ctx, x, y, s, lobe) {
  ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  if (s < 3) return;
  const t = s >> 1, o = s * 0.55;
  ctx.fillRect(Math.round(x + Math.cos(lobe) * o - t / 2), Math.round(y + Math.sin(lobe) * o - t / 2), t, t);
}
