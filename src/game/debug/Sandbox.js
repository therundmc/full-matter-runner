// Sandbox / debug tools, usable in any level (F1; open from the start in passive test rooms such as ?level=lab).
// A tool drops something at the cursor (guards, weapons, props, vehicles, blasts, water); cheats bend the rules
// (god mode, frozen guards, time scale, ammo, teleport). DOM-free: ui/SandboxPanel.js draws `lines()`.
import { TILE, LIQUIDS } from '../Config.js';
import { rand, TAU } from '../../engine/math.js';
import { WEAPONS, AMMO } from '../data/weapons.js';
import { PROPS } from '../data/props.js';
import Enemy from '../entities/Enemy.js';
import Prop from '../entities/Prop.js';
import Vehicle, { VEHICLES } from '../entities/Vehicle.js';
import WeaponItem from '../entities/WeaponItem.js';
import { ENEMIES, markBlocked } from '../world/Level.js';

const { Body } = Matter;
const SPEEDS = [1, 0.5, 0.2];

// a prop or vehicle joins the world, unless its footprint bites into a wall
function addProp(w, p) {
  if (p.body.vertices.some((v) => w.map.solidAt(v.x, v.y))) { w.removeBody(p.body); return false; }
  w.props.push(p);
  if (p.def.blocksPath) markBlocked(w.map, p);
  return true;
}

// name, the variants to cycle through, how to drop one at (x, y) (false = no room); `open` = may be used inside a wall
export const TOOLS = [
  {
    name: 'GUARD', list: Object.values(ENEMIES), label: ([kind, weapon]) => `${kind} ${weapon}`,
    place(w, x, y, [kind, weapon], angle, sandbox) {
      const e = new Enemy(w, x, y, Math.atan2(w.player.y - y, w.player.x - x), kind, weapon);
      e.passive = sandbox.frozen;
      w.addEnemy(e);
    },
  },
  {
    name: 'WEAPON', list: Object.keys(WEAPONS).filter((id) => id !== 'fists'),
    place(w, x, y, type, angle) { w.addItem(new WeaponItem(w, type, undefined, x, y, angle)); },
  },
  {
    name: 'PROP', list: Object.keys(PROPS),
    place: (w, x, y, type, angle) => addProp(w, new Prop(w, type, x, y, angle)),
  },
  {
    name: 'VEHICLE', list: Object.keys(VEHICLES),
    place: (w, x, y, type, angle) => addProp(w, new Vehicle(w, type, x, y, angle)),
  },
  {
    name: 'BLAST', list: [60, 90, 130], label: (r) => `${(r / TILE).toFixed(1)} m`, open: true,
    place(w, x, y, radius) { w.explode(x, y, { radius, source: 'sandbox' }); },
  },
  {
    name: 'WATER', list: [3, 9], label: (s) => `${s} s`,
    place(w, x, y, dur) { w.liquids.source(x, y, { ...LIQUIDS.hydrant, dur }); },
  },
];

export default class Sandbox {
  constructor() {
    this.on = false;
    this.world = null;
    this.tool = 0;
    this.picks = TOOLS.map(() => 0); // chosen variant of each tool
    this.angle = 0;                  // of what gets placed
    this.god = false;
    this.frozen = false;
    this.speed = 0;
    this.note = null;                // { text, until }: feedback line
  }

  // a new world was built: test rooms open the panel, cheats carry over a restart
  attach(world) {
    this.world = world;
    this.frozen = !!world.level.passive;
    if (world.level.passive) this.on = true;
    world.player.invulnerable = this.god;
  }

  get timeScale() { return SPEEDS[this.speed]; }

  label(i = this.tool) {
    const t = TOOLS[i], v = t.list[this.picks[i]];
    return (t.label ? t.label(v) : String(v)).replace(/_/g, ' ').toUpperCase();
  }

  cycle(dir) {
    const n = TOOLS[this.tool].list.length;
    this.picks[this.tool] = (this.picks[this.tool] + dir + n) % n;
  }

  say(text, now) { this.note = { text, until: now + 1.6 }; }

  // once per simulation step, before the world: keys only act while the panel is open
  update(input, aim, now) {
    if (input.hit('F1')) this.on = !this.on;
    if (!this.on || !this.world) return;
    const w = this.world, p = w.player;
    for (let i = 0; i < TOOLS.length; i++) {
      if (!input.hit(`Digit${i + 1}`)) continue;
      if (this.tool === i) this.cycle(1); else this.tool = i;
    }
    if (input.wheel) this.cycle(Math.sign(input.wheel));
    if (input.hit('KeyB')) this.angle = (this.angle + Math.PI / 4) % TAU;
    if (input.hit('KeyF') || input.mouseHit(1)) this.place(aim.x, aim.y, now);
    if (input.hit('KeyG')) { this.god = !this.god; p.invulnerable = this.god; }
    if (input.hit('KeyT')) {
      this.frozen = !this.frozen;
      for (const e of w.enemies) e.passive = this.frozen;
    }
    if (input.hit('KeyO')) this.speed = (this.speed + 1) % SPEEDS.length;
    if (input.hit('KeyU')) {
      for (const c of Object.keys(AMMO)) p.ammo[c] = AMMO[c].max;
      if (p.weapon && p.def.mag) p.weapon.mag = p.def.mag;
      this.say('AMMO REFILLED', now);
    }
    if (input.hit('KeyV') && p.alive && !w.map.solidAt(aim.x, aim.y)) {
      Body.setPosition(p.body, { x: aim.x, y: aim.y });
      Body.setVelocity(p.body, { x: 0, y: 0 });
    }
    if (input.hit('KeyK')) {
      let n = 0;
      for (const e of w.enemies) if (e.alive) { e.kill(rand(0, TAU), 'bullet', p, {}); n++; }
      this.say(`${n} GUARDS KILLED`, now);
    }
  }

  place(x, y, now) {
    const w = this.world, t = TOOLS[this.tool];
    const blocked = !t.open && w.map.solidAt(x, y);
    if (blocked || t.place(w, x, y, t.list[this.picks[this.tool]], this.angle, this) === false) this.say('NO ROOM THERE', now);
    else this.say(`${t.name} : ${this.label()}`, now);
  }

  // the panel: [text, style] with style '' | 'title' | 'sel' | 'on' | 'dim'
  lines(now) {
    const flag = (b) => (b ? 'ON' : 'OFF');
    const out = [['SANDBOX', 'title']];
    TOOLS.forEach((t, i) => out.push(i === this.tool ? [`${i + 1}  ${t.name} : ${this.label(i)}`, 'sel'] : [`${i + 1}  ${t.name}`, '']));
    out.push(
      ['WHEEL / SAME KEY : NEXT ONE', 'dim'],
      ['F / MIDDLE CLICK : DROP AT CURSOR', 'dim'],
      [`B  ROTATE : ${Math.round((this.angle * 180) / Math.PI)} DEG`, ''],
      [`G  GOD MODE : ${flag(this.god)}`, this.god ? 'on' : ''],
      [`T  FREEZE GUARDS : ${flag(this.frozen)}`, this.frozen ? 'on' : ''],
      [`O  TIME : X${this.timeScale}`, this.speed ? 'on' : ''],
      ['U  REFILL AMMO', ''],
      ['V  TELEPORT TO CURSOR', ''],
      ['K  KILL ALL GUARDS', ''],
      ['F2 VISION  F3 MAP  F4 PHYSICS  F6 LENS', 'dim'],
      ['F1  HIDE', 'dim'],
    );
    if (this.note && now < this.note.until) out.push([this.note.text, 'sel']);
    return out;
  }
}
