// Draws a World: floor/decals, entities in layer order, walls, particles, additive effects, floating texts.
// Also the physics debug overlay (F4).
import { TILE, PALETTE, CAT, LIQUIDS } from '../Config.js';
import { rand, clamp, TAU } from '../../engine/math.js';
import { puddleShape } from '../systems/Liquids.js';
import { drawShock } from './BlastArt.js';
import { drawLasers } from './LaserSight.js';
import { drawCritters, drawFlying, drawMoths } from './CritterArt.js';
import { drawPropLife, drawSparkle } from './PropLife.js';

const { Body } = Matter;

export default class WorldRenderer {
  constructor(world) {
    this.world = world;
  }

  draw(ctx, cam, t) {
    const w = this.world;
    const v = cam.viewRadius();
    const pad = Math.max(v.x, v.y) * 1.1;
    const vis = (x, y) => Math.abs(x - cam.x) < pad && Math.abs(y - cam.y) < pad;

    ctx.drawImage(w.decals.floorCanvas, 0, 0);
    for (const p of w.liquids.puddles) if (vis(p.x, p.y)) this.drawPuddle(ctx, p, t);
    // blood lies over everything baked into the floor; the dead and their pieces lie on the blood
    ctx.drawImage(w.decals.bloodCanvas, 0, 0);
    for (const c of w.corpses) if (vis(c.x, c.y)) c.drawPool(ctx);
    ctx.drawImage(w.decals.fleshCanvas, 0, 0);
    for (const d of w.debris) if (!d.dead && vis(d.body.position.x, d.body.position.y)) d.draw(ctx);
    for (const c of w.corpses) if (vis(c.x, c.y)) c.draw(ctx);
    for (const it of w.items) if (!it.dead && vis(it.x, it.y)) it.draw(ctx, t);
    for (const a of w.ammoItems) if (vis(a.x, a.y)) a.draw(ctx);
    for (const p of w.props) if (vis(p.x, p.y)) p.draw(ctx);
    drawPropLife(ctx, w, t, vis);
    drawCritters(ctx, w.critters, t, vis);
    // window sills under the characters (someone vaulting goes over them)
    for (const g of w.windows) if (vis(g.x, g.y)) g.draw(ctx);
    if (w.showVision) for (const e of w.enemies) e.drawVision(ctx);
    for (const e of w.enemies) if (e.alive && vis(e.x, e.y)) e.draw(ctx);
    for (const c of w.civilians) if (c.alive && vis(c.x, c.y)) c.draw(ctx);
    if (w.player.alive) w.player.draw(ctx);
    for (const p of w.props) if (p.def.overhead && vis(p.x, p.y)) p.drawOverhead(ctx, w.player, cam);
    for (const d of w.doors) d.draw(ctx);
    ctx.drawImage(w.decals.wallCanvas, 0, 0);
    drawFlying(ctx, w.critters, t);

    w.particles.draw(ctx);
    // night + coloured lights + wall shadows multiplied over the scene (skipped in the F3 overview)
    const lit = w.lighting.active(cam);
    if (lit) w.lighting.apply(ctx, cam, t);
    if (w.cleared && w.level.exit) this.drawExit(ctx, t);
    for (const p of w.projectiles) p.draw(ctx);
    this.drawAdditive(ctx, lit);
    drawSparkle(ctx, w, t, vis);
    if (lit) w.lighting.post(ctx, cam, t);
    drawMoths(ctx, w.critters, t, vis);
    drawLasers(ctx, w);
    // guards' '?' / '!' and detection meters stay readable over the night
    for (const e of w.enemies) if (vis(e.x, e.y)) e.drawMarks(ctx);
    const pl = w.player;
    if (pl && pl.alive && !pl.vaulting && pl.vaultHint) this.drawVaultHint(ctx, pl.vaultHint, t);
    if (w.showVision) this.drawAIDebug(ctx);
    this.drawTexts(ctx);
    if (w.debugPhysics) this.drawPhysicsDebug(ctx, vis);
  }

  // standing liquid: a dark wet patch with an irregular edge, a pale sheen, glints, rings while something pours
  // into it, in the colours of its kind (the lights it mirrors are added by Lighting.post)
  drawPuddle(ctx, p, t) {
    const shape = puddleShape(p), look = LIQUIDS.kinds[p.kind].puddle;
    const blob = (k) => {
      ctx.beginPath();
      for (const [x, y, rx, ry] of shape) { ctx.moveTo(x + rx * k, y); ctx.ellipse(x, y, rx * k, ry * k, 0, 0, TAU); }
      ctx.fill();
    };
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = look.body;
    blob(1);
    ctx.fillStyle = look.sheen;
    blob(0.72);
    if (look.foam) {
      // froth pushed to the edge
      ctx.fillStyle = look.foam;
      ctx.globalAlpha = p.alpha * 0.5;
      for (const l of p.lobes) {
        for (let j = -1; j <= 1; j++) {
          if (Math.sin(l.ph * 5 + j * 2) < -0.2) continue; // patchy
          const a = l.a + j * 0.4 + l.ph * 0.1, d = (l.d + l.s * (0.86 - 0.1 * Math.abs(j))) * p.r;
          ctx.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), j ? 1 : 2, 1);
        }
      }
      ctx.globalAlpha = p.alpha;
    }
    // glints: short pale dashes that come and go
    ctx.fillStyle = look.glint;
    for (const l of p.lobes) {
      const k = Math.sin(t * 1.3 + l.ph);
      if (k <= 0) continue;
      const x = p.x + Math.cos(l.a + l.ph) * l.d * p.r * 0.9, y = p.y + Math.sin(l.a + l.ph) * l.d * p.r * 0.8;
      const len = 2 + l.s * 5;
      ctx.globalAlpha = p.alpha * k * 0.22;
      ctx.fillRect(Math.round(x - len / 2), Math.round(y), Math.round(len), 1);
    }
    if (p.fed > 0) {
      ctx.strokeStyle = look.ring;
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.7 + i / 3) % 1;
        ctx.globalAlpha = p.alpha * (1 - k);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * k * 0.9, p.r * k * 0.8, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // lit: the lighting pass already put the transient lights into its light map
  drawAdditive(ctx, lit) {
    const w = this.world;
    w.particles.drawFire(ctx);
    ctx.globalCompositeOperation = 'lighter';
    w.particles.drawGlow(ctx);
    for (const l of lit ? [] : w.lights) {
      const a = clamp(l.t / l.dur, 0, 1) * 0.55;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, l.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalAlpha = 1;
    for (const f of w.flashes) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      const s = f.big ? 1.6 : 1;
      ctx.fillStyle = '#ffb020';
      ctx.beginPath();
      ctx.moveTo(-1, 0); ctx.lineTo(4 * s, -5 * s); ctx.lineTo(7 * s, -1.5 * s); ctx.lineTo(14 * s * rand(0.8, 1.2), 0);
      ctx.lineTo(7 * s, 1.5 * s); ctx.lineTo(4 * s, 5 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.arc(2, 0, 2.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // hit sparks: a long thin streak along the blow, a short one across, opening up as they fade
    for (const f of w.hitSparks) {
      const p = 1 - f.t / f.dur, l = (9 + 9 * p) * f.size, h = (2.2 - 1.6 * p) * f.size;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      ctx.globalAlpha = 1 - p * p;
      ctx.fillStyle = '#fff6e0';
      for (let i = 0; i < 2; i++) {
        const k = i ? 0.45 : 1;
        ctx.beginPath();
        ctx.moveTo(-l * k, 0); ctx.lineTo(0, -h); ctx.lineTo(l * k, 0); ctx.lineTo(0, h);
        ctx.closePath(); ctx.fill();
        ctx.rotate(Math.PI / 2);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const r of w.rings) {
      const p = r.t / r.dur;
      if (r.blast) { drawShock(ctx, r, p); continue; }
      ctx.strokeStyle = `rgba(255,240,220,${1 - p})`;
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * Math.sqrt(p), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTexts(ctx) {
    ctx.font = '8px joystix';
    ctx.textAlign = 'center';
    for (const tx of this.world.texts) {
      ctx.globalAlpha = clamp((tx.t / tx.dur) * 2, 0, 1);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(tx.str, tx.x + 1, tx.y + 1);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }

  // F2: incidents (x: orange = unreported, cyan = reported) and the squad search points (filled once checked)
  drawAIDebug(ctx) {
    const d = this.world.director;
    ctx.lineWidth = 1.5;
    for (const inc of d.incidents) {
      ctx.strokeStyle = inc.reported ? PALETTE.cyan : PALETTE.orange;
      ctx.beginPath();
      ctx.moveTo(inc.x - 5, inc.y - 5); ctx.lineTo(inc.x + 5, inc.y + 5); ctx.moveTo(inc.x + 5, inc.y - 5); ctx.lineTo(inc.x - 5, inc.y + 5);
      ctx.stroke();
    }
    for (const sp of d.searchPts) {
      ctx.strokeStyle = sp.owner ? PALETTE.pink : PALETTE.yellow;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      if (sp.done) { ctx.fillStyle = 'rgba(249,200,14,0.4)'; ctx.fill(); }
      ctx.stroke();
    }
    const lk = d.lastKnown;
    if (lk) {
      ctx.strokeStyle = PALETTE.pink;
      ctx.beginPath(); ctx.arc(lk.x, lk.y, 10, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // Space would vault here: a small mark on the obstacle's edge, chevrons hopping over it
  drawVaultHint(ctx, v, t) {
    const { x, y } = v.ledge, o = 2.5 + 2 * (0.5 + 0.5 * Math.sin(t * 8));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(v.to.y - y, v.to.x - x));
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const [width, color] of [[3.2, 'rgba(8,4,16,0.8)'], [1.3, '#7ff6ff']]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(0, 6); // the edge
      for (const c of [o, o + 4]) { ctx.moveTo(c, -3.5); ctx.lineTo(c + 3.5, 0); ctx.lineTo(c, 3.5); }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawExit(ctx, t) {
    const ex = this.world.level.exit;
    const x = ex.x * TILE, y = ex.y * TILE;
    const pulse = (Math.sin(t * 6) + 1) / 2;
    ctx.strokeStyle = pulse > 0.5 ? PALETTE.pink : PALETTE.cyan;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(x, y, ex.r * TILE * (0.9 + pulse * 0.1), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '8px joystix';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText('EXIT', x + 1, y - ex.r * TILE - 5);
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillText('EXIT', x, y - ex.r * TILE - 6 - pulse * 3);
  }

  // F4: every Matter body outlined by state, velocities, live contacts
  drawPhysicsDebug(ctx, vis) {
    const phys = this.world.physics;
    ctx.save();
    ctx.lineWidth = 0.75;
    for (const b of phys.bodies()) {
      if (!vis(b.position.x, b.position.y) && !(b.isStatic && b.label === 'wall')) continue;
      let col = '#3cff7a';                                   // dynamic
      if (b.isStatic) col = b.frozen ? '#4aa0ff' : '#777';   // frozen heavy / static
      else if (b.isSleeping) col = '#2a6a3a';
      if (b.collisionFilter.category === CAT.CHAR) col = '#ffe14a';
      if (b.isSensor) col = '#ff4af0';
      ctx.strokeStyle = col;
      ctx.beginPath();
      const vs = b.vertices;
      ctx.moveTo(vs[0].x, vs[0].y);
      for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y);
      ctx.closePath();
      ctx.stroke();
      if (!b.isStatic) {
        const v = Body.getVelocity(b);
        ctx.strokeStyle = '#ff9a2a';
        ctx.beginPath(); ctx.moveTo(b.position.x, b.position.y); ctx.lineTo(b.position.x + v.x * 4, b.position.y + v.y * 4); ctx.stroke();
      }
    }
    ctx.fillStyle = '#ff2a2a';
    for (const pair of phys.activePairs()) {
      for (const s of pair.collision.supports) if (s) ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    ctx.restore();
  }

  // screen-space stats for the overlay
  debugStats() {
    const phys = this.world.physics;
    const bodies = phys.bodies();
    const dyn = bodies.filter((b) => !b.isStatic).length;
    const frozen = bodies.filter((b) => b.frozen).length;
    const sleeping = bodies.filter((b) => b.isSleeping).length;
    return [
      `BODIES ${bodies.length}  DYNAMIC ${dyn}  FROZEN ${frozen}  SLEEPING ${sleeping}`,
      `CONTACTS ${phys.activePairs().length}  PHYSICS ${phys.stepMs.toFixed(2)} MS x${phys.substeps}`,
      `DEBRIS ${this.world.debris.length}  PARTICLES ${this.world.particles.list.length}`,
    ];
  }
}
