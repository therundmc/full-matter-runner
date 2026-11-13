import { CAT, MASK, TILE } from '../core/Config.js';
import { sprite } from '../core/Assets.js';
import { rand } from '../core/math.js';

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

  shatter(dirA = 0) {
    if (!this.intact) return;
    this.intact = false;
    const w = this.world;
    w.removeBody(this.body);
    // broken frame still blocks characters (but not bullets or thrown items)
    this.body = Bodies.rectangle(this.x, this.y, this.vertical ? 4 : TILE, this.vertical ? TILE : 4, {
      isStatic: true, label: 'window-frame',
      collisionFilter: { category: CAT.GLASS, mask: MASK.GLASS_BROKEN },
    });
    this.body.entity = this;
    w.addBody(this.body);
    w.particles.glass(this.x, this.y, dirA, 0.9, 28, 200);
    w.particles.glass(this.x, this.y, dirA + Math.PI, 1.2, 8, 80);
    w.sound('glass', this.x, this.y);
    w.noise(this.x, this.y, 260);
  }

  onCollide(other) {
    const e = other.entity;
    if (this.intact && e && e.isItem && Matter.Body.getSpeed(other) > 3) this.shatter(Math.atan2(other.velocity.y, other.velocity.x));
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (this.intact) {
      ctx.drawImage(this.img, -TILE / 2, -this.img.height / 2, TILE, this.img.height);
    } else {
      ctx.fillStyle = 'rgba(190,240,255,0.75)';
      // jagged remains at both ends
      ctx.beginPath();
      ctx.moveTo(-TILE / 2, -1.5); ctx.lineTo(-TILE / 2 + this.shards[0], 0); ctx.lineTo(-TILE / 2 + this.shards[1] * 0.5, 1.5); ctx.lineTo(-TILE / 2, 1.5);
      ctx.moveTo(TILE / 2, -1.5); ctx.lineTo(TILE / 2 - this.shards[2], 0); ctx.lineTo(TILE / 2 - this.shards[3] * 0.5, 1.5); ctx.lineTo(TILE / 2, 1.5);
      ctx.fill();
    }
    ctx.fillStyle = '#140c1c';
    ctx.fillRect(-TILE / 2 - 1, -2.5, 3, 5);
    ctx.fillRect(TILE / 2 - 2, -2.5, 3, 5);
    ctx.restore();
  }
}
