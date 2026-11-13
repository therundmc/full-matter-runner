import { TILE, CAT } from '../core/Config.js';
import { WEAPON_CHARS } from '../data/weapons.js';
import { sprite } from '../core/Assets.js';
import { rand } from '../core/math.js';
import { gridRaycast } from '../core/Raycast.js';
import Player from '../entities/Player.js';
import Enemy from '../entities/Enemy.js';
import Prop from '../entities/Prop.js';
import Door from '../entities/Door.js';
import Window from '../entities/Window.js';
import WeaponItem from '../entities/WeaponItem.js';

const { Bodies } = Matter;

// actors layer legend: enemy char -> [kind, weapon]; uppercase = roaming patrol
const ENEMIES = {
  p: ['thug', 'pistol'], u: ['thug', 'uzi'], s: ['thug', 'uzi_silenced'],
  h: ['heavy', 'shotgun'], r: ['heavy', 'rifle'],
  b: ['brute', 'bat'], k: ['brute', 'knife'],
};
const SMALL_PROPS = { x: 'barrel', c: 'crate', t: 'trash_can' };

export function buildLevel(world, level) {
  const map = world.map;
  const cx = (x) => (x + 0.5) * TILE;

  // ---- doors (runs of D), windows (G), fences (F)
  const used = new Set();
  const isD = (x, y) => map.at(x, y) === 'D';
  const wallish = (x, y) => map.isWallChar(x, y) || map.at(x, y) === 'G';
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const ch = map.at(x, y);
      if (ch === 'D' && !used.has(`${x},${y}`)) {
        let hl = 1; while (isD(x + hl, y)) hl++;
        let vl = 1; while (isD(x, y + vl)) vl++;
        const horizontal = hl > 1 || (vl === 1 && (wallish(x - 1, y) || wallish(x + 1, y)));
        const n = horizontal ? hl : vl;
        for (let i = 0; i < n; i++) used.add(horizontal ? `${x + i},${y}` : `${x},${y + i}`);
        if (horizontal) {
          const py = cx(y);
          if (n === 2) {
            world.doors.push(new Door(world, x * TILE + 1, py, 0, TILE - 2));
            world.doors.push(new Door(world, (x + 2) * TILE - 1, py, Math.PI, TILE - 2));
          } else world.doors.push(new Door(world, x * TILE + 1, py, 0, n * TILE - 2));
        } else {
          const px = cx(x);
          if (n === 2) {
            world.doors.push(new Door(world, px, y * TILE + 1, Math.PI / 2, TILE - 2));
            world.doors.push(new Door(world, px, (y + 2) * TILE - 1, -Math.PI / 2, TILE - 2));
          } else world.doors.push(new Door(world, px, y * TILE + 1, Math.PI / 2, n * TILE - 2));
        }
      } else if (ch === 'G') {
        const horizontal = wallish(x - 1, y) || wallish(x + 1, y);
        world.windows.push(new Window(world, cx(x), cx(y), !horizontal));
      } else if (ch === 'F') {
        const horizontal = map.at(x - 1, y) === 'F' || map.at(x + 1, y) === 'F' || map.isWallChar(x - 1, y) || map.isWallChar(x + 1, y);
        buildFence(world, cx(x), cx(y), !horizontal);
      }
    }
  }

  // ---- props list: [type, col, row, deg] with col/row in tile units (floats, tile centre = n + 0.5)
  for (const [type, col, row, deg = 0] of level.props || []) {
    const p = new Prop(world, type, col * TILE, row * TILE, (deg * Math.PI) / 180);
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
      if (ch === '@') world.player = new Player(world, px, py, face);
      else if (ENEMIES[ch.toLowerCase()]) {
        const [kind, weapon] = ENEMIES[ch.toLowerCase()];
        world.enemies.push(new Enemy(world, px, py, face, kind, weapon, ch !== ch.toLowerCase()));
      } else if (WEAPON_CHARS[ch]) {
        const type = WEAPON_CHARS[ch];
        world.items.push(new WeaponItem(world, type, undefined, px, py, rand(0, Math.PI * 2)));
      } else if (SMALL_PROPS[ch]) {
        world.props.push(new Prop(world, SMALL_PROPS[ch], px + rand(-3, 3), py + rand(-3, 3), rand(0, Math.PI * 2)));
      } else console.warn('unknown actor char', ch, x, y);
    }
  }
  // items spawned from the map get a full magazine
  for (const it of world.items) if (it.ammo === undefined) it.ammo = it.def.ammo ?? Infinity;
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

function markBlocked(map, prop) {
  const b = prop.body.bounds;
  const x0 = Math.floor((b.min.x + 4) / TILE), x1 = Math.floor((b.max.x - 4) / TILE);
  const y0 = Math.floor((b.min.y + 4) / TILE), y1 = Math.floor((b.max.y - 4) / TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < map.w && y < map.h) map.blocked[y * map.w + x] = 1;
}

function buildFence(world, x, y, vertical) {
  const body = Bodies.rectangle(x, y, vertical ? 6 : TILE, vertical ? TILE : 6, {
    isStatic: true, label: 'fence', collisionFilter: { category: CAT.WALL, mask: CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.CORPSE | CAT.PROP },
  });
  world.addBody(body);
  // fences are static decoration: paint them on the wall layer
  const g = world.map.wallCtx;
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

