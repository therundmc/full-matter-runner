// Draws a World: floor/decals, entities in layer order, walls, particles, additive effects, floating texts.
// Also the physics debug overlay (F4).
import { TILE, PALETTE, CAT, LIQUIDS } from '../Config.js';
import { rand, clamp, TAU } from '../../engine/math.js';
import { puddleShape } from '../systems/Liquids.js';
import { drawShock } from './BlastArt.js';
import { drawLasers } from './LaserSight.js';
import { drawCritters, drawFlying, drawMoths } from './CritterArt.js';
import { drawPropLife } from './PropLife.js';
import { drawPapers, drawButts } from './StreetArt.js';
import { OUTRO } from '../systems/Outro.js';
import { drawCombat } from '../fx/CombatFx.js';

const { Body } = Matter;

export default class WorldRenderer {
  constructor(world) {
    this.world = world;
    this.lightMs = 0; // smoothed cost of the lighting passes
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
    drawPapers(ctx, w.papers, vis);
    for (const p of w.props) if (vis(p.x, p.y)) p.draw(ctx);
    if (w.ambient) drawButts(ctx, w.ambient.butts, vis);
    drawPropLife(ctx, w, t, vis);
    drawCritters(ctx, w.critters, t, vis);
    // window sills under the characters (someone vaulting goes over them)
    for (const g of w.windows) if (vis(g.x, g.y)) g.draw(ctx);
    if (w.showVision) for (const e of w.enemies) e.drawVision(ctx);
    for (const e of w.enemies) if (e.alive && vis(e.x, e.y)) e.draw(ctx);
    for (const c of w.civilians) if (c.alive && vis(c.x, c.y)) c.draw(ctx);
    if (w.player.alive && !w.player.hidden) w.player.draw(ctx); // hidden: in the getaway van
    for (const p of w.props) if (p.def.overhead && vis(p.x, p.y)) p.drawOverhead(ctx, w.player, cam);
    for (const d of w.doors) d.draw(ctx);
    ctx.drawImage(w.decals.wallCanvas, 0, 0);
    drawFlying(ctx, w.critters, t);

    w.particles.draw(ctx);
    // night + coloured lights + wall shadows multiplied over the scene (skipped in the F3 overview)
    const lit = w.lighting.active(cam);
    let l0 = performance.now();
    if (lit) w.lighting.apply(ctx, cam, t);
    let lightMs = performance.now() - l0;
    if (w.cleared && w.level.exit && !w.outro) this.drawExit(ctx, t);
    for (const p of w.projectiles) p.draw(ctx);
    drawCombat(ctx, w); // muzzle flames, hit flashes, impact stars, weapon trails: after the lighting, so they read in the dark
    this.drawAdditive(ctx, lit);
    l0 = performance.now();
    if (lit) w.lighting.post(ctx, cam, t);
    lightMs += performance.now() - l0;
    this.lightMs += (lightMs - this.lightMs) * 0.1; // smoothed, for the F4 overlay
    drawMoths(ctx, w.critters, t, vis);
    drawLasers(ctx, w);
    // guards' '?' / '!' and detection meters stay readable over the night
    for (const e of w.enemies) if (vis(e.x, e.y)) e.drawMarks(ctx);
    const pl = w.player;
    if (pl && pl.alive && !pl.vaulting && pl.vaultHint) this.drawVaultHint(ctx, pl.vaultHint, t);
    if (w.tutorial) this.drawHints(ctx, w.tutorial.hints(), t);
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

  // the tutorial's hints (systems/Tutorial.js): a key cap and a few words over what they are about
  drawHints(ctx, hints, t) {
    ctx.save();
    ctx.font = '8px joystix';
    ctx.textBaseline = 'middle';
    const bob = Math.sin(t * 5) * 1.2;
    for (const h of hints) {
      const kw = h.key ? Math.ceil(ctx.measureText(h.key).width) + 6 : 0, tw = Math.ceil(ctx.measureText(h.text).width);
      const gap = h.key ? 4 : 0, x0 = Math.round(h.x - (kw + gap + tw) / 2), y = Math.round(h.y + bob);
      ctx.fillStyle = 'rgba(8, 4, 16, 0.72)';
      ctx.fillRect(x0 - 3, y - 7, kw + gap + tw + 6, 14);
      if (h.key) {
        ctx.fillStyle = PALETTE.cyan;
        ctx.fillRect(x0, y - 5, kw, 10);
        ctx.fillStyle = PALETTE.ink;
        ctx.textAlign = 'center';
        ctx.fillText(h.key, x0 + kw / 2, y + 0.5);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(h.text, x0 + kw + gap + 1, y + 1.5);
      ctx.fillStyle = '#fff';
      ctx.fillText(h.text, x0 + kw + gap, y + 0.5);
    }
    ctx.restore();
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

  // the way out once the level is cleared: a pulsing ring on the exit zone, and with a getaway van (World.getaway)
  // GET IN over it and a mark on the cab door he will get in by
  drawExit(ctx, t) {
    const w = this.world, ex = w.level.exit, van = w.getaway();
    const x = ex.x * TILE, y = ex.y * TILE, label = van ? 'GET IN' : 'EXIT';
    const pulse = (Math.sin(t * 6) + 1) / 2, color = pulse > 0.5 ? PALETTE.pink : PALETTE.cyan;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(x, y, ex.r * TILE * (0.9 + pulse * 0.1), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '8px joystix';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(label, x + 1, y - ex.r * TILE - 5);
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillText(label, x, y - ex.r * TILE - 6 - pulse * 3);
    if (van) this.drawCabDoor(ctx, van, color, t);
  }

  // the door's edge on the van's side, chevrons stepping in toward it
  drawCabDoor(ctx, van, color, t) {
    const p = this.world.player, q = this.world.cabDoor(van, p.x, p.y);
    const edge = van.toWorld(OUTRO.door, van.toSprite(q.x, q.y).sy < van.h / 2 ? 0 : van.h);
    const o = 3 + 2 * (0.5 + 0.5 * Math.sin(t * 8));
    ctx.save();
    ctx.translate(edge.x, edge.y);
    ctx.rotate(Math.atan2(edge.y - q.y, edge.x - q.x)); // +x: into the van
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const [width, col] of [[3.2, 'rgba(8,4,16,0.8)'], [1.3, color]]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(0, 8);
      for (const c of [o, o + 4]) { ctx.moveTo(-c - 3.5, -3.5); ctx.lineTo(-c, 0); ctx.lineTo(-c - 3.5, 3.5); }
      ctx.stroke();
    }
    ctx.restore();
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
    const pf = this.world.game?.perf;
    return [
      pf ? `FPS ${pf.fps}  FRAME ${pf.frame.toFixed(1)} MS (WORST ${pf.worst.toFixed(1)})  UPDATE ${pf.update.toFixed(1)} MS  RENDER ${pf.render.toFixed(1)} MS  LIGHTING ${this.lightMs.toFixed(1)} MS` : 'FPS ...',
      `BODIES ${bodies.length}  DYNAMIC ${dyn}  FROZEN ${frozen}  SLEEPING ${sleeping}`,
      `CONTACTS ${phys.activePairs().length}  PHYSICS ${phys.stepMs.toFixed(2)} MS x${phys.substeps}`,
      `DEBRIS ${this.world.debris.length}  PARTICLES ${this.world.particles.list.length}`,
    ];
  }
}
