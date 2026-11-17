// Draws a World: floor/decals, entities in layer order, walls, particles, additive effects, floating texts.
// Also the physics debug overlay (F4).
import { TILE, PALETTE, CAT } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { drawShock } from './BlastArt.js';
import { drawLasers } from './LaserSight.js';
import { drawCritters, drawFlying, drawMoths } from './CritterArt.js';
import { drawPropLife } from './PropLife.js';
import { drawClutter } from './ClutterArt.js';
import { drawPapers, drawButts } from './StreetArt.js';
import { drawRainGround, drawRainAir, viewRect } from './WeatherArt.js';
import SmokeArt from './SmokeArt.js';
import LiquidArt from './LiquidArt.js';
import { RAIN } from '../data/atmosphere.js';
import { OUTRO } from '../systems/Outro.js';
import { drawCombat } from '../fx/CombatFx.js';
import { keyLabel } from '../data/controls.js';
import { capWidth, drawCap } from '../ui/Glyphs.js';

const { Body } = Matter;

// the big speech bubble (drawBubble), world px and s: font size, line height, inner margin, wrap width, height over
// his centre, tail length; it opens in `pop` s, the line is typed out in `type` s, it fades out over its last `fade` s
const BUBBLE = { font: 9, line: 11, pad: 4, wrap: 120, lift: 24, tail: 6, pop: 0.12, type: 0.5, fade: 0.4 };

// str cut into lines no wider than max px at the context's font (by words)
function wrapText(ctx, str, max) {
  const out = [];
  let cur = '';
  for (const word of str.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(next).width > max) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export default class WorldRenderer {
  constructor(world) {
    this.world = world;
    this.lightMs = 0; // smoothed cost of the lighting passes
    this.smoke = new SmokeArt(world); // the smoke in the air and the mist, lit
    this.liquid = new LiquidArt(world); // what is wet on the floor
  }

  // the layer of what stands on the floor: the size of the picture, cleared, drawn with the scene's transform
  standing(ctx) {
    const c = ctx.canvas;
    let L = this.layer;
    if (!L || L.width !== c.width || L.height !== c.height) {
      L = this.layer = document.createElement('canvas');
      L.width = c.width; L.height = c.height;
    }
    const g = L.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, L.width, L.height);
    g.setTransform(ctx.getTransform());
    g.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return g;
  }

  draw(ctx, cam, t) {
    const w = this.world;
    const v = cam.viewRadius();
    const pad = Math.max(v.x, v.y) * 1.1;
    const vis = (x, y) => Math.abs(x - cam.x) < pad && Math.abs(y - cam.y) < pad;
    const view = viewRect(cam, w.map);

    // the floor is finer than the world (MapRenderer.floorScale): only the part in view is drawn
    const fs = w.decals.floorScale, fx0 = Math.max(0, Math.floor(cam.x - v.x)), fy0 = Math.max(0, Math.floor(cam.y - v.y));
    const fw = Math.min(w.map.widthPx, Math.ceil(cam.x + v.x)) - fx0, fh = Math.min(w.map.heightPx, Math.ceil(cam.y + v.y)) - fy0;
    if (fw > 0 && fh > 0) ctx.drawImage(w.decals.floorCanvas, fx0 * fs, fy0 * fs, fw * fs, fh * fs, fx0, fy0, fw, fh);
    // blood lies over everything baked into the floor, what is wet over it; the dead and their pieces lie in it
    ctx.drawImage(w.decals.bloodCanvas, 0, 0);
    this.liquid.draw(ctx, view);
    drawRainGround(ctx, w.weather, view, t);
    ctx.drawImage(w.decals.fleshCanvas, 0, 0);
    // what stands or lies on the floor is drawn on a layer of its own, then laid on the scene: its pixels are what the
    // floor's reflections (Lighting.post) must not cover
    const floor = ctx;
    ctx = this.standing(floor);
    for (const d of w.debris) if (!d.dead && vis(d.body.position.x, d.body.position.y)) d.draw(ctx);
    for (const c of w.corpses) if (vis(c.x, c.y)) c.draw(ctx);
    for (const it of w.items) if (!it.dead && vis(it.x, it.y)) it.draw(ctx, t);
    for (const a of w.ammoItems) if (vis(a.x, a.y)) a.draw(ctx);
    drawPapers(ctx, w.papers, vis);
    for (const p of w.props) if (vis(p.x, p.y)) p.draw(ctx);
    if (w.ambient) drawButts(ctx, w.ambient.butts, vis);
    drawPropLife(ctx, w, t, vis);
    drawClutter(ctx, w.clutter, vis);
    drawCritters(ctx, w.critters, t, vis);
    // window sills under the characters (someone vaulting goes over them)
    for (const g of w.windows) if (vis(g.x, g.y)) g.draw(ctx);
    if (w.showVision) for (const e of w.enemies) e.drawVision(ctx);
    for (const e of w.enemies) if (e.alive && vis(e.x, e.y)) e.draw(ctx);
    for (const c of w.civilians) if (c.alive && vis(c.x, c.y)) c.draw(ctx);
    if (w.player.alive && !w.player.hidden) w.player.draw(ctx); // hidden: in the getaway van
    for (const p of w.props) if (p.def.overhead && vis(p.x, p.y)) p.drawOverhead(ctx, w.player, cam);
    for (const d of w.doors) d.draw(ctx);
    ctx = floor;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.layer, 0, 0);
    ctx.restore();
    ctx.drawImage(w.decals.wallCanvas, 0, 0);
    drawFlying(ctx, w.critters, t);

    w.particles.draw(ctx);
    this.smoke.drawThreads(ctx, w.smoke, vis);
    drawRainAir(ctx, w.weather, view, t);
    // night + coloured lights + wall shadows multiplied over the scene (skipped in the F3 overview)
    const lit = w.lighting.active(cam);
    let l0 = performance.now();
    if (lit) {
      w.lighting.apply(ctx, cam, t);
      this.smoke.draw(ctx, w.lighting); // the smoke and the mist where the lamps light them
    }
    let lightMs = performance.now() - l0;
    if (w.cleared && w.level.exit && !w.outro) this.drawExit(ctx, t);
    for (const p of w.projectiles) p.draw(ctx);
    if (lit) drawRainAir(ctx, w.weather, view, t, RAIN.after); // in the air only: crowns and rings would lie over people
    drawCombat(ctx, w); // muzzle flames, hit flashes, impact stars, weapon trails: after the lighting, so they read in the dark
    this.drawAdditive(ctx, lit);
    l0 = performance.now();
    if (lit) w.lighting.post(ctx, cam, t, this.liquid, this.layer);
    lightMs += performance.now() - l0;
    this.lightMs += (lightMs - this.lightMs) * 0.1; // smoothed, for the F4 overlay
    drawMoths(ctx, w.critters, t, vis);
    drawLasers(ctx, w);
    // guards' '?' / '!' and detection meters stay readable over the night
    for (const e of w.enemies) if (vis(e.x, e.y)) e.drawMarks(ctx);
    const pl = w.player;
    if (pl && pl.alive && !pl.vaulting && pl.vaultHint) this.drawVaultHint(ctx, pl.vaultHint, t);
    if (pl && pl.alive && !pl.passage) this.drawUseHints(ctx, pl, t);
    if (w.tutorial) this.drawHints(ctx, w.tutorial.hints(), t);
    if (w.showVision) this.drawAIDebug(ctx);
    this.drawTexts(ctx);
    if (w.debugPhysics) this.drawPhysicsDebug(ctx, vis);
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
    for (const tx of this.world.texts) if (tx.bubble) this.drawBubble(ctx, tx);
    ctx.font = '8px joystix';
    ctx.textAlign = 'center';
    for (const tx of this.world.texts) {
      if (tx.bubble) continue;
      ctx.globalAlpha = clamp((tx.t / tx.dur) * 2, 0, 1);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(tx.str, tx.x + 1, tx.y + 1);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }

  // A line said big (the boss's word, Enemy.bossLine): a speech bubble over the head of who says it, following him,
  // that pops open and fades out at the end; the text wrapped to BUBBLE.wrap px.
  drawBubble(ctx, tx) {
    const who = tx.who ?? tx, B = BUBBLE, age = tx.dur - tx.t;
    const pop = clamp(age / B.pop, 0, 1), alpha = clamp(tx.t / B.fade, 0, 1) * (who.alive === false ? 0.6 : 1);
    ctx.save();
    ctx.font = `${B.font}px joystix`;
    const lines = wrapText(ctx, tx.str, B.wrap), lw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const w = Math.ceil(lw) + B.pad * 2, h = lines.length * B.line + B.pad * 2 - 2;
    const x = Math.round(who.x), y = Math.round(who.y - B.lift);
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(0.5 + 0.5 * pop, 0.5 + 0.5 * pop);
    const x0 = -Math.round(w / 2), y0 = -h;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(0, B.tail + 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tx.color;
    ctx.fillRect(x0, y0, w, h);
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(0, B.tail); ctx.closePath(); ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = tx.color;
    // typed out as it opens, each line centred as it will stand once whole
    let left = Math.floor(clamp(age / B.type, 0, 1) * tx.str.length);
    lines.forEach((l, i) => {
      if (left > 0) ctx.fillText(l.slice(0, left), -Math.round(ctx.measureText(l).width / 2), y0 + B.pad + i * B.line);
      left -= l.length + 1;
    });
    ctx.restore();
  }

  // the tutorial's hints (systems/Tutorial.js): the cap of the device in use (ui/Glyphs.js) and a few words over what
  // they are about
  drawHints(ctx, hints, t) {
    const device = this.world.game?.input?.device, H = 11;
    ctx.save();
    ctx.font = '8px joystix';
    ctx.textBaseline = 'middle';
    const bob = Math.sin(t * 5) * 1.2;
    for (const h of hints) {
      const label = h.key ? keyLabel(h.key, device) : '';
      const kw = label ? Math.ceil(capWidth(ctx, label, H)) : 0, tw = Math.ceil(ctx.measureText(h.text).width);
      const gap = label ? 4 : 0, x0 = Math.round(h.x - (kw + gap + tw) / 2), y = Math.round(h.y + bob);
      ctx.fillStyle = 'rgba(8, 4, 16, 0.72)';
      ctx.fillRect(x0 - 3, y - 8, kw + gap + tw + 6, 16);
      if (label) drawCap(ctx, label, x0, y, H);
      ctx.font = '8px joystix';
      ctx.textBaseline = 'middle';
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

  // What the devices of the level offer (systems/Uses.js), seen from close by: a small diamond over each spot that can
  // be used now within a few metres, faint; the one E would use now bright, its corners pulsing round it.
  drawUseHints(ctx, pl, t) {
    const u = this.world.uses, R = 3 * TILE;
    ctx.save();
    ctx.lineJoin = 'round';
    for (const s of u.spots) {
      if (s.prop && (s.prop.dead || s.prop.dying)) continue;
      const { x, y } = u.at(s), d = Math.hypot(x - pl.x, y - pl.y), on = s === pl.nearUse;
      if (d > R || (!on && s.ok && !s.ok(pl))) continue;
      const k = on ? 1 : 0.35 * (1 - d / R), r = on ? 3 + Math.sin(t * 8) : 2.5;
      for (const [width, color] of [[3, `rgba(8,4,16,${0.8 * k})`], [1.2, on ? '#ffe46a' : `rgba(255,228,106,${k})`]]) {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - 14 - r); ctx.lineTo(x + r, y - 14); ctx.lineTo(x, y - 14 + r); ctx.lineTo(x - r, y - 14); ctx.closePath();
        ctx.stroke();
      }
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
