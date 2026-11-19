import { CAT, MASK, TILE, MAX_DEBRIS, DESTRUCTION } from '../Config.js';
import { sprite, glassShards } from '../../engine/Assets.js';
import Debris from './Debris.js';
import { rand, angDiff } from '../../engine/math.js';
import { windowSupports } from '../world/Openings.js';
import { SHARDS, shardBurst, shardHarm } from '../systems/Glass.js';

const { Bodies, Body } = Matter;

const THICK = 6;     // px: the glazed frame, set in the middle of the wall (the sill around it is painted on the floor)
const FRAME_HP = 6;  // what the frame takes (blasts, bat blows, heavy rounds) before it is torn out of the wall

// A window at tile (cx, cy): a pane in an aluminium frame, see-through, stops bodies. The glass shatters on bullets,
// blows and fast objects (shards: systems/Glass.js) and leaves a frame to vault through; the frame itself goes with
// enough damage or with the wall holding it (`supports`, see Destruction.destroyWindow / watchOpenings). A `barred`
// one (level `bars`: a shop shut for the night) has iron bars outside the glass: its pane still breaks, but nobody
// goes through it until a blast tears the whole frame out.
export default class Window {
  constructor(world, cx, cy, vertical) {
    this.world = world;
    this.cx = cx; this.cy = cy;
    this.x = (cx + 0.5) * TILE; this.y = (cy + 0.5) * TILE;
    this.vertical = vertical;
    this.angle = vertical ? Math.PI / 2 : 0;
    this.supports = windowSupports(cx, cy, vertical);
    this.wall = this.supports.some(([sx, sy]) => world.map.at(sx, sy) === 'X') ? 'brick' : 'wall'; // what it is set in
    this.intact = true;
    this.barred = false;
    this.hp = FRAME_HP;
    this.nicks = [];                // dents in the frame: [x, y, w] in sprite space
    this.phase = rand(0, 1);        // so the reflections of a glazed front don't slide in step
    this.body = this.makeBody('window', MASK.GLASS);
  }

  makeBody(label, mask) {
    const body = Bodies.rectangle(this.x, this.y, this.vertical ? THICK : TILE, this.vertical ? TILE : THICK, {
      isStatic: true, label, collisionFilter: { category: CAT.GLASS, mask },
    });
    body.entity = this;
    this.world.addBody(body);
    return body;
  }

  // the pane bursts away from the hit (dirA); `breaker` = who did it (never cut by his own shards)
  shatter(dirA = 0, breaker = null, power = 1) {
    if (!this.intact) return;
    this.intact = false;
    const w = this.world;
    if (!this.barred) w.map.blocked[this.cy * w.map.w + this.cx] = 0;
    w.removeBody(this.body);
    // the empty frame still stops characters (they vault it), not bullets or thrown things
    this.body = this.makeBody('window-frame', MASK.GLASS_BROKEN);
    w.particles.glass(this.x, this.y, dirA, 0.9, 40, 240);
    w.particles.glass(this.x, this.y, dirA + Math.PI, 1.2, 10, 80);
    // real shards: the crumbs skitter, the big ones fly through the room and cut whoever stands behind
    const crowded = w.debris.length > MAX_DEBRIS * DESTRUCTION.physicalShare;
    const ca = Math.cos(dirA), sa = Math.sin(dirA);
    for (const s of shardBurst(Math.min(power, 1.5))) {
      if (crowded && s.size === 'small') continue;
      const k = s.along * (TILE - 10);
      const sx = this.x + (this.vertical ? 0 : k) + ca * 3, sy = this.y + (this.vertical ? k : 0) + sa * 3;
      const a = dirA + s.spread, big = s.size === 'big';
      w.addDebris(new Debris(w, glassShards(s.size)[s.variant], sx, sy, big ? a + rand(-0.4, 0.4) : rand(0, 6.28),
        Math.cos(a) * s.speed, Math.sin(a) * s.speed, s.spin * (big ? 0.4 : 1), {
          air: 0.05, bounce: 0.25, kg: SHARDS[s.size].kg, mu: 0.35, shadow: big ? 1 : 0, material: 'glass',
          z: s.z, vz: s.vz, land: 'glassHit', harm: shardHarm(s.size, breaker),
        }));
    }
    w.flashGlass(this.x, this.y);
    w.sound('glass', this.x, this.y);
    w.noise(this.x, this.y, 260, null, 'glass');
    w.events.emit('windowBroken', { x: this.x, y: this.y, by: breaker });
  }

  // the frame takes a beating: it dents, then is torn out of the wall
  damageFrame(dmg, dirA = 0, power = 1) {
    if (this.hp <= 0) return;
    this.hp -= dmg;
    for (let k = 0; k < 1 + dmg; k++) this.nicks.push([Math.floor(rand(1, TILE - 4)), rand(0, 1) < 0.5 ? 1 : 8, Math.ceil(rand(1, 3))]);
    const w = this.world;
    w.particles.sparks(this.x, this.y, dirA, 1.2, 4 + dmg * 2, 220);
    w.sound('metal', this.x, this.y, 0.7);
    if (this.hp <= 0) w.destroyWindow(this, dirA, power);
  }

  // a melee blow struck from (x, y) toward dirA: breaks the glass; once it is gone, `dmg` goes to the frame
  // if the blow is aimed at it. Returns whether it landed.
  blow(x, y, dirA, by, dmg = 0) {
    if (this.intact) { this.shatter(dirA, by); return true; }
    if (dmg <= 0 || Math.abs(angDiff(dirA, Math.atan2(this.y - y, this.x - x))) > 1) return false;
    this.damageFrame(dmg, dirA, 1.2);
    return true;
  }

  onCollide(other) {
    const e = other.entity;
    if (!this.intact || !e) return;
    const sp = Body.getSpeed(other), v = Body.getVelocity(other), a = Math.atan2(v.y, v.x);
    // a car goes through frame and all; thrown things and heavy pieces only break the glass
    if (e.isVehicle && sp > 3) this.world.destroyWindow(this, a, 1.3);
    else if ((e.isItem && sp > 3) || (e.isDebris && sp > 4.5) || (e.def && sp > 3)) this.shatter(a, null, 0.7);
  }

  draw(ctx) {
    const H = TILE / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const img = sprite(this.intact ? 'structure/window' : 'structure/window_broken');
    ctx.drawImage(img, -H, -img.height / 2);
    ctx.fillStyle = '#140c1c';
    for (const [x, y, w] of this.nicks) ctx.fillRect(x - H, y - img.height / 2, w, 1);
    ctx.globalCompositeOperation = 'lighter';
    if (this.intact) {
      // a reflection sliding along the pane now and then
      const t = (this.world.time * 0.22 + this.phase) % 1;
      if (t < 0.3) {
        const gx = -H + 4 + (t / 0.3) * (TILE - 13);
        ctx.fillStyle = `rgba(200,244,255,${0.3 * Math.sin((t / 0.3) * Math.PI)})`;
        ctx.fillRect(gx, -3, 3, 6);
        ctx.fillRect(gx + 4, -3, 1, 6);
      }
    } else if (!this.barred) {
      // passable: a soft pulse along the sill
      ctx.fillStyle = `rgba(5,217,232,${0.25 + 0.2 * Math.sin(this.world.time * 4)})`;
      ctx.fillRect(-H + 4, -1, TILE - 8, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (this.barred) {
      // the iron grille over the glass, seen from above: a rail along each face of the pane, a bar across every 4 px
      // between them, each bar lit on one edge
      const h = img.height, y0 = -h / 2 + 1, y1 = h / 2 - 2;
      ctx.fillStyle = '#121016';
      ctx.fillRect(-H + 1, y0, TILE - 2, 1);
      ctx.fillRect(-H + 1, y1, TILE - 2, 1);
      for (let x = -H + 2; x < H - 1; x += 4) ctx.fillRect(x, y0, 2, y1 - y0 + 1);
      ctx.fillStyle = '#6a6876';
      for (let x = -H + 2; x < H - 1; x += 4) ctx.fillRect(x, y0, 1, y1 - y0 + 1);
    }
    ctx.restore();
  }
}
