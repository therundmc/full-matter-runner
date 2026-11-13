import { CAT, MASK, TILE } from '../Config.js';
import { sprite, glassShards } from '../../engine/Assets.js';
import Debris from './Debris.js';
import { rand } from '../../engine/math.js';

const { Bodies } = Matter;

// Glass pane: see-through, stops bodies, shatters on bullets / fast objects.
export default class Window {
  constructor(world, x, y, vertical) {
    this.world = world;
    this.x = x; this.y = y;
    this.vertical = vertical;
    this.angle = vertical ? Math.PI / 2 : 0;
    this.img = sprite('structure/window');
    this.intact = true;
    this.body = Bodies.rectangle(x, y, vertical ? 4 : TILE, vertical ? TILE : 4, {
      isStatic: true, label: 'window',
      collisionFilter: { category: CAT.GLASS, mask: MASK.GLASS },
    });
    this.body.entity = this;
    this.shards = Array.from({ length: 4 }, () => rand(2, 7));
    world.addBody(this.body);
  }

  shatter(dirA = 0, source = null, power = 1) {
    if (!this.intact) return;
    this.intact = false;
    const w = this.world;
    w.map.blocked[Math.floor(this.y / TILE) * w.map.w + Math.floor(this.x / TILE)] = 0;
    w.removeBody(this.body);
    // broken frame still blocks characters (but not bullets or thrown items)
    this.body = Bodies.rectangle(this.x, this.y, this.vertical ? 4 : TILE, this.vertical ? TILE : 4, {
      isStatic: true, label: 'window-frame',
      collisionFilter: { category: CAT.GLASS, mask: MASK.GLASS_BROKEN },
    });
    this.body.entity = this;
    w.addBody(this.body);
    w.particles.glass(this.x, this.y, dirA, 0.9, 40, 240);
    w.particles.glass(this.x, this.y, dirA + Math.PI, 1.2, 10, 80);
    // real shards: they fly through the room and cut whoever stands behind
    const shards = glassShards();
    const n = 12 + Math.floor(rand(0, 6));
    for (let i = 0; i < n; i++) {
      const along = rand(-TILE / 2, TILE / 2);
      const sx = this.x + (this.vertical ? 0 : along), sy = this.y + (this.vertical ? along : 0);
      const a = dirA + rand(-0.55, 0.55);
      const v = rand(160, 460) * power;
      w.addDebris(new Debris(w, shards[i % shards.length], sx, sy, rand(0, 6.28), Math.cos(a) * v, Math.sin(a) * v, rand(-0.8, 0.8), {
        air: 0.05, bounce: 0.25, kg: 0.1, mu: 0.35, fly: 0.3, shadow: 0, material: 'glass',
        harm: { kind: 'cut', knock: 2.4, lethal: 5.2, ignore: source },
      }));
    }
    w.flashGlass(this.x, this.y);
    w.sound('glass', this.x, this.y);
    w.noise(this.x, this.y, 260);
  }

  onCollide(other) {
    const e = other.entity;
    if (!this.intact || !e) return;
    const fast = Matter.Body.getSpeed(other) > 3;
    if ((e.isItem && fast) || (e.isDebris && Matter.Body.getSpeed(other) > 4.5) || (e.def && fast)) {
      this.shatter(Math.atan2(other.velocity.y, other.velocity.x), null, 0.7);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const H = TILE / 2;
    if (this.intact) {
      ctx.drawImage(this.img, -H, -this.img.height / 2, TILE, this.img.height);
    } else {
      // what is left: the sill and both jambs, glass teeth still stuck in the frame
      ctx.fillStyle = '#140c1c';
      ctx.fillRect(-H, -2, TILE, 4);
      ctx.fillStyle = '#6a5a6e';
      ctx.fillRect(-H + 1, -1, TILE - 2, 2);
      ctx.fillStyle = 'rgba(200,245,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(-H + 2, -1); ctx.lineTo(-H + 2 + this.shards[0], -0.5); ctx.lineTo(-H + 2, 0.5);
      ctx.moveTo(H - 2, -1); ctx.lineTo(H - 2 - this.shards[2], -0.5); ctx.lineTo(H - 2, 0.5);
      ctx.moveTo(-H + 6 + this.shards[1] * 2, -1); ctx.lineTo(-H + 8 + this.shards[1] * 2, -2.5); ctx.lineTo(-H + 10 + this.shards[1] * 2, -1);
      ctx.fill();
      // passable: a soft pulse along the sill
      const pulse = 0.25 + 0.2 * Math.sin(this.world.time * 4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(5,217,232,${pulse})`;
      ctx.fillRect(-H + 3, -0.5, TILE - 6, 1);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = '#140c1c';
    ctx.fillRect(-H - 1, -3, 4, 6);
    ctx.fillRect(H - 3, -3, 4, 6);
    ctx.restore();
  }
}
