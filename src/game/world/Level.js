import { TILE, CAT } from '../Config.js';
import { WEAPON_CHARS, AMMO_CHARS } from '../data/weapons.js';
import AmmoItem from '../entities/AmmoItem.js';
import { sprite, spriteOpt } from '../../engine/Assets.js';
import { rand } from '../../engine/math.js';
import { gridRaycast } from '../../engine/physics/Raycast.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import Prop from '../entities/Prop.js';
import Vehicle, { VEHICLES } from '../entities/Vehicle.js';
import Door from '../entities/Door.js';
import Window from '../entities/Window.js';
import WeaponItem from '../entities/WeaponItem.js';
import Ragdoll from '../entities/Ragdoll.js';
import { MARKS } from '../data/wounds.js';
import { doorLeaves } from './Openings.js';

const { Bodies } = Matter;

// actors layer legend: enemy char -> [kind, weapon]; uppercase = roaming patrol
// (optional level.patrols['col,row'] = [[col, row], ...]: explicit route for the guard spawned at col,row;
// optional level.jobs['col,row'] = 'pool' | 'cards': the pastime of the guard posted there, ai/Pastimes.js)
export const ENEMIES = {
  p: ['thug', 'pistol'], u: ['thug', 'uzi'], s: ['thug', 'uzi_silenced'],
  h: ['heavy', 'shotgun'], r: ['heavy', 'rifle'],
  b: ['brute', 'bat'], k: ['brute', 'knife'],
  m: ['thug', 'bat'], j: ['thug', 'knife'], i: ['thug', 'tire_iron'],
};
const SMALL_PROPS = { x: 'barrel', c: 'crate', t: 'trash_can' };

export function buildLevel(world, level) {
  const map = world.map;
  world.decals.dressRoofs(level.roof || []);
  const cx = (x) => (x + 0.5) * TILE;
  // manhole covers (level `street.manholes`), painted on the ground once and for all
  const cover = spriteOpt('props/manhole');
  if (cover) for (const [c, r] of level.street?.manholes || []) world.decals.bake(cover, c * TILE, r * TILE, 0);
  // flattened cardboard someone sleeps on (level `street.beds`), same
  const bed = spriteOpt('props/cardboard_bed');
  if (bed) for (const [c, r, deg = 0] of level.street?.beds || []) world.decals.bake(bed, c * TILE, r * TILE, (deg * Math.PI) / 180);

  // what lies flat on the floor (level `floor`: [sprite, col, row, deg]): a doormat, a carpet runner, a flight of stairs
  for (const [name, c, r, deg = 0] of level.floor || []) {
    const img = spriteOpt(`props/${name}`);
    if (img) world.decals.bake(img, c * TILE, r * TILE, (deg * Math.PI) / 180);
  }

  // ---- doors (runs of D), windows (G), fences (F)
  const used = new Set();
  const isD = (x, y) => map.at(x, y) === 'D' || map.at(x, y) === 'L';
  const wallish = (x, y) => map.isWallChar(x, y) || map.at(x, y) === 'G';
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const ch = map.at(x, y);
      if ((ch === 'D' || ch === 'L') && !used.has(`${x},${y}`)) {
        let hl = 1; while (isD(x + hl, y)) hl++;
        let vl = 1; while (isD(x, y + vl)) vl++;
        const horizontal = hl > 1 || (vl === 1 && (wallish(x - 1, y) || wallish(x + 1, y)));
        const n = horizontal ? hl : vl;
        const cells = [];
        for (let i = 0; i < n; i++) {
          used.add(horizontal ? `${x + i},${y}` : `${x},${y + i}`);
          cells.push(horizontal ? y * map.w + x + i : (y + i) * map.w + x);
        }
        // any 'L' in the run makes it a locked door
        const opts = { locked: cells.some((i) => map.chars[Math.floor(i / map.w)][i % map.w] === 'L'), cells };
        for (const l of doorLeaves(x, y, n, horizontal)) {
          world.doors.push(new Door(world, l.hx, l.hy, l.angle, l.len, { ...opts, support: l.support, strike: l.strike }));
        }
        world.decals.doorway(x, y, n, horizontal);
      } else if (ch === 'G') {
        const horizontal = wallish(x - 1, y) || wallish(x + 1, y);
        world.windows.push(new Window(world, x, y, !horizontal));
        world.decals.windowSill(x, y, !horizontal);
      } else if (ch === 'F') {
        const horizontal = map.at(x - 1, y) === 'F' || map.at(x + 1, y) === 'F' || map.isWallChar(x - 1, y) || map.isWallChar(x + 1, y);
        buildFence(world, cx(x), cx(y), !horizontal);
      }
    }
  }

  // ---- weapons stood against a wall: [type, col, row, deg] (deg: the way its tip points, up the wall)
  for (const [type, col, row, deg = 0] of level.lean || []) {
    world.items.push(new WeaponItem(world, type, undefined, col * TILE, row * TILE, (deg * Math.PI) / 180).leanOn());
  }

  // ---- somebody already dead when it starts: [kind, col, row, deg (the way the head lies), pool px], shot
  for (const [kind, col, row, deg = 0, pool = 18] of level.bodies || []) {
    const x = col * TILE, y = row * TILE;
    world.decals.stampBlood(x, y, 7, 5);
    world.addCorpse(new Ragdoll(world, kind, x, y, (deg * Math.PI) / 180, 0, { pool, poolRate: 40, mark: MARKS.small }));
  }

  // ---- weapons lying about with a given magazine: [type, col, row, deg, rounds] (rounds null: full)
  for (const [type, col, row, deg = 0, mag] of level.drops || []) {
    world.items.push(new WeaponItem(world, type, mag ?? undefined, col * TILE, row * TILE, (deg * Math.PI) / 180));
  }

  // ---- the barred windows (level `bars`: [[col, row], ...]): no way through them
  for (const [col, row] of level.bars || []) {
    const w = world.windows.find((o) => o.cx === col && o.cy === row);
    if (w) w.barred = true;
  }

  // ---- props list: [type, col, row, deg, options?] with col/row in tile units (floats, tile centre = n + 0.5)
  // options: { lights: false } = starts with its lights off (a parked car); { flicker: kind } = its light is unsteady
  // (render/Flicker.js: 'broken', 'stutter', 'dying'...); { valve: true } = a stove whose gas tap can be opened
  for (const [type, col, row, deg = 0, opt] of level.props || []) {
    const a = (deg * Math.PI) / 180;
    const p = VEHICLES[type] ? new Vehicle(world, type, col * TILE, row * TILE, a) : new Prop(world, type, col * TILE, row * TILE, a);
    if (opt?.lights === false) p.lightsOut = true;
    if (opt?.flicker) p.flicker = opt.flicker;
    if (opt?.valve) p.valve = true; // a stove with its gas tap (systems/GasValve.js)
    if (opt?.trunk && p.isVehicle) p.trunk = { item: opt.trunk, open: false };
    world.props.push(p);
    if (p.def.blocksPath) markBlocked(map, p);
  }

  // ---- actors layer
  const rows = level.actors || [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === ' ' || ch === '.') continue;
      const px = cx(x), py = cx(y);
      const face = facing(level, map, x, y);
      if (ch === '@') {
        world.player = new Player(world, px, py, face);
        // he starts sitting on the ground, his back to the wall; 'swig': a bottle in his hand, that he drinks off and
        // smashes before anything else (Player.updateSwig)
        if (level.intro === 'sit' || level.intro === 'swig') world.player.sit = 1;
        if (level.intro === 'swig') world.player.swig = { t: 0, thrown: false, go: false };
      }
      else if (ENEMIES[ch.toLowerCase()]) {
        const [kind, weapon] = ENEMIES[ch.toLowerCase()];
        // a guard may be his own man (level.looks['col,row'] = a kind of his own: the boss)
        const e = new Enemy(world, px, py, face, level.looks?.[`${x},${y}`] || kind, weapon, ch !== ch.toLowerCase());
        // a passive level (the lab): dummies that neither see nor hear, but those it keeps `awake` ('col,row')
        e.passive = !!level.passive && !level.awake?.includes(`${x},${y}`);
        e.takeJob(level.jobs?.[`${x},${y}`]);
        world.enemies.push(e);
      } else if (WEAPON_CHARS[ch]) {
        const type = WEAPON_CHARS[ch];
        world.items.push(new WeaponItem(world, type, undefined, px, py, rand(0, Math.PI * 2)));
      } else if (AMMO_CHARS[ch]) {
        world.ammoItems.push(new AmmoItem(world, AMMO_CHARS[ch], undefined, px, py));
      } else if (SMALL_PROPS[ch]) {
        world.props.push(new Prop(world, SMALL_PROPS[ch], px + rand(-3, 3), py + rand(-3, 3), rand(0, Math.PI * 2)));
      } else console.warn('unknown actor char', ch, x, y);
    }
  }
  if (!world.player) throw new Error('level has no player spawn (@)');
}

// explicit facing override ("col,row": degrees) or the direction with the longest clear view
function facing(level, map, x, y) {
  const key = `${x},${y}`;
  if (level.facing && level.facing[key] !== undefined) return (level.facing[key] * Math.PI) / 180;
  let best = 0, bestD = -1;
  const ox = (x + 0.5) * TILE, oy = (y + 0.5) * TILE;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    // windows/fences count as opaque here so guards face into their room, not out of the building
    const hit = gridRaycast(ox, oy, ox + Math.cos(a) * 600, oy + Math.sin(a) * 600,
      (cx, cy) => map.isSolid(cx, cy) || map.at(cx, cy) === 'G' || map.at(cx, cy) === 'F');
    const d = hit ? hit.t : 1;
    if (d > bestD + 0.02) { bestD = d; best = a; }
  }
  return best;
}

// Tiles under a path-blocking prop (also used when a traffic vehicle comes to rest as a parked wreck). A tile is
// closed to the pathfinder only when the prop really fills it (BLOCK_SHARE of its area): a shelf flat against a wall
// leaves room to walk past, and closing its tiles shut whole shops and the back of the bar to the guards. What stands
// in a gap of a wall to close it (`lasting`: a ladder, a parapet) closes every tile it touches.
const BLOCK_SHARE = 0.4;
export function markBlocked(map, prop) {
  const b = prop.body.bounds, whole = !!prop.def?.lasting;
  const x0 = Math.floor((b.min.x + 4) / TILE), x1 = Math.floor((b.max.x - 4) / TILE);
  const y0 = Math.floor((b.min.y + 4) / TILE), y1 = Math.floor((b.max.y - 4) / TILE);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const ox = Math.min(b.max.x, (x + 1) * TILE) - Math.max(b.min.x, x * TILE);
      const oy = Math.min(b.max.y, (y + 1) * TILE) - Math.max(b.min.y, y * TILE);
      if (whole || ox * oy >= BLOCK_SHARE * TILE * TILE) map.blocked[y * map.w + x] = 1;
    }
  }
}

function buildFence(world, x, y, vertical) {
  const body = Bodies.rectangle(x, y, vertical ? 6 : TILE, vertical ? TILE : 6, {
    isStatic: true, label: 'fence', collisionFilter: { category: CAT.WALL, mask: CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.CORPSE | CAT.PROP },
  });
  world.addBody(body);
  world.fences.push({ x, y, vertical, body, dead: false });
  // fences are static decoration: paint them on the wall layer
  const g = world.decals.wallCtx;
  const img = sprite('structure/fence');
  g.save();
  g.translate(x, y);
  if (vertical) g.rotate(Math.PI / 2);
  g.globalAlpha = 0.35;
  g.fillStyle = '#000';
  g.fillRect(-TILE / 2 + 2, -img.height / 2 + 2, TILE, img.height);
  g.globalAlpha = 1;
  g.drawImage(img, -TILE / 2, -img.height / 2, TILE, img.height);
  g.restore();
}

