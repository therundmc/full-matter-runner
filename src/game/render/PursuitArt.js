// What the chase draws over the cars (systems/Pursuit.js, systems/CarGun.js), from above:
//   drawChaseFigures (the standing layer, lit with the scene): each pursuer's gunman leaning out of its window on the
//   runner's side, his arm out and the pistol in his hand (shot: one arm hanging down the door); in a closed car the
//   runner's own hand out of his driver's window with his gun, pointed where he aims (in his arc only; an open car
//   draws him sat at the wheel, his arm out: Vehicle.draw, CharacterAnim.seatPose); a gun or a magazine thrown onto
//   the road, flying, then lying there
//   drawChaseTells (after the lighting: telegraphs read in the dark; docs/LEVEL2.md, "nothing else red on the road"):
//   the alley car's RED LANE across the road; a gunman's tell in its three beats (a white glint at the muzzle, a thin
//   red line fattening into a wedge toward the bracket on the lane band where it will land, the shot's bone tracer);
//   a catch-light on what lies on the road to pick up
//   drawChaseWind (after the lighting too): the streaks of air past his car at speed (systems/Drive.js `wind`): one
//   world px thick, whole px, bone, each fading in and out
import { BODY_SCALE } from '../Config.js';
import { sprite, drawSprite } from '../../engine/Assets.js';
import { clamp } from '../../engine/math.js';
import { CHASE } from '../data/chase.js';

const RED = '255,42,74';        // the telegraph's red
const BONE = '239,230,210';     // enemy tracers
const JACKET = '#262230', SKIN = '#c89a78', COAT = '#3a4460';

export function drawChaseWind(ctx, w) {
  const L = w.drive?.on ? w.drive.wind : null;
  if (!L?.length) return;
  ctx.fillStyle = `rgb(${BONE})`;
  for (const s of L) {
    const u = s.t / s.life, x = Math.round(s.x);
    ctx.globalAlpha = s.a * Math.min(1, u * 5, (1 - u) * 3);
    ctx.fillRect(x, s.y - 0.5, s.len, 1);
    // (its head a little brighter, a third of it)
    ctx.fillRect(x, s.y - 0.5, Math.ceil(s.len / 3), 1);
  }
  ctx.globalAlpha = 1;
}

export function drawChaseFigures(ctx, w, vis) {
  const P = w.pursuit;
  if (P) {
    for (const car of P.cars) if (vis(car.v.x, car.v.y) && !car.v.exploded) drawGunman(ctx, P, car);
    for (const k of P.pickups) drawPickup(ctx, k);
  }
  const gun = w.drive?.on && !w.drive.dead ? w.drive.gun : null;
  if (gun?.aimed?.ok && !gun.van.rider) drawHand(ctx, gun, w.player); // (an open car draws him, his arm out)
}

// the gunman: his shoulder in the window, his head out, the arm and the pistol toward where he aims; shot, his arm
// hangs out down the door, trailing
function drawGunman(ctx, P, car) {
  const v = car.v, side = car.gunSide, out = v.body.angle + side * Math.PI / 2;
  const g = P.gunPoint(car), sh = v.toWorld(v.w * P.G.seat, side < 0 ? 1 : v.h - 1);
  if (!car.gunman) {
    if (!car.shot) return; // gone with his car
    // limp: an arm hanging out of the window, along the side toward the tail
    const back = v.body.angle + Math.PI, hx = sh.x + Math.cos(out) * 4 + Math.cos(back) * 9, hy = sh.y + Math.sin(out) * 4 + Math.sin(back) * 9;
    line(ctx, sh.x, sh.y, hx, hy, JACKET, 3);
    dot(ctx, hx, hy, SKIN, 1.6);
    return;
  }
  // the shoulder in the window, the head leaning out
  ctx.fillStyle = JACKET;
  ctx.beginPath();
  ctx.ellipse((sh.x + g.x) / 2, (sh.y + g.y) / 2, 5.5, 4, out, 0, Math.PI * 2);
  ctx.fill();
  const hand = { x: g.x + Math.cos(car.gunA) * 9, y: g.y + Math.sin(car.gunA) * 9 };
  line(ctx, g.x, g.y, hand.x, hand.y, JACKET, 3);
  dot(ctx, hand.x, hand.y, SKIN, 1.6);
  drawSprite(ctx, sprite('weapons/pistol'), hand.x + Math.cos(car.gunA) * 3, hand.y + Math.sin(car.gunA) * 3, car.gunA, 1, BODY_SCALE);
  drawSprite(ctx, sprite('characters/thug_head'), g.x, g.y, car.gunA, 1, BODY_SCALE * 0.9);
}

// his hand out of the driver's window, his gun in it
function drawHand(ctx, gun, p) {
  const a = gun.aimed.a, v = gun.van, root = v.toWorld(gun.seat[0], 1), h = gun.hand(a);
  line(ctx, root.x, root.y, h.x, h.y, COAT, 3.2);
  dot(ctx, h.x, h.y, SKIN, 1.7);
  const img = p.weapon && sprite(p.def.sprite);
  if (img) drawSprite(ctx, img, h.x + Math.cos(a) * 4, h.y + Math.sin(a) * 4, a, 1, BODY_SCALE);
}

function drawPickup(ctx, k) {
  const P = CHASE.pickup, f = clamp(k.t / P.fly, 0, 1), x = k.x0 + (k.x - k.x0) * f, y = k.y0 + (k.y - k.y0) * f;
  const lift = Math.sin(f * Math.PI) * 0.5, img = sprite(k.kind === 'gun' ? 'weapons/pistol' : 'weapons/mag_pistol');
  drawSprite(ctx, img, x, y, f < 1 ? k.spin * k.t : k.spin * P.fly, 1, BODY_SCALE * (1 + lift));
}

export function drawChaseTells(ctx, w, t) {
  const P = w.pursuit;
  if (w.lorries) drawLorries(ctx, w.lorries, t);
  if (!P) return;
  ctx.save();
  for (const L of P.lanes) drawLane(ctx, L, t);
  if (P.tell) drawTell(ctx, P, P.tell);
  for (const tr of P.tracers) {
    const k = 1 - tr.t / P.G.tracer;
    line(ctx, tr.x0, tr.y0, tr.x1, tr.y1, `rgba(${BONE},${0.9 * k})`, 1.4);
    dot(ctx, tr.x1, tr.y1, `rgba(255,250,235,${k})`, 2);
  }
  // what lies on the road to pick up: a ring of light that beats
  for (const k of P.pickups) {
    if (k.t < CHASE.pickup.fly) continue;
    ctx.strokeStyle = `rgba(249,200,14,${0.45 + 0.35 * Math.sin(t * 8)})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(k.x, k.y, 9, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// A lorry backing out (systems/Lorries.js): its reversing lamps on the beat, the red lane its tail is about to sweep
// (chevrons running the way it goes), bone arrows on the way round it
function drawLorries(ctx, S, t) {
  const C = CHASE.lorry;
  ctx.save();
  for (const L of S.list) {
    const p = L.p, a = Math.atan2(L.dy, L.dx), half = p.def.h / 2, q = S.tail(L);
    if (S.blink(L)) {
      for (const s of [-1, 1]) {
        const x = q.x - L.dy * s * (half - 12), y = q.y + L.dx * s * (half - 12);
        dot(ctx, x, y, 'rgba(255,246,224,0.35)', 7);
        dot(ctx, x, y, '#fffaf0', 2.4);
      }
    }
    if (L.state !== 'tell' && L.state !== 'back') continue;
    const left = L.dist - L.done, k = clamp(L.t / 0.12, 0, 1), beat = 0.5 + 0.5 * Math.sin(t * 14), hw = half + C.pad;
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(${RED},${(0.16 + 0.1 * beat) * k})`;
    ctx.fillRect(0, -hw, left, hw * 2);
    ctx.strokeStyle = `rgba(${RED},${0.9 * k})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -hw); ctx.lineTo(left, -hw); ctx.lineTo(left, hw); ctx.lineTo(0, hw);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${RED},${0.6 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = (t * 90) % 30; x < left - 6; x += 30) {
      ctx.moveTo(x - 5, -12); ctx.lineTo(x + 5, 0); ctx.lineTo(x - 5, 12);
    }
    ctx.stroke();
    ctx.restore();
    // the way round: bone arrows along the road, running
    if (L.gap) {
      ctx.strokeStyle = `rgba(${BONE},${(0.65 + 0.3 * beat) * k})`;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        const x = L.gap.x + i * 26 + ((t * 60) % 26);
        ctx.moveTo(x - 6, L.gap.y - 9); ctx.lineTo(x + 4, L.gap.y); ctx.lineTo(x - 6, L.gap.y + 9);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// the band the alley car will cross: a red wash with hard edges, chevrons up it the way it comes
function drawLane(ctx, L, t) {
  const a = (L.on ? 1 : 1 - clamp((L.fade ?? 0) / 0.3, 0, 1)) * clamp(L.t / 0.12, 0, 1);
  const x0 = L.x - L.w / 2, x1 = L.x + L.w / 2, beat = 0.5 + 0.5 * Math.sin(t * 14);
  ctx.fillStyle = `rgba(${RED},${(0.16 + 0.1 * beat) * a})`;
  ctx.fillRect(x0, L.y0, L.w, L.y1 - L.y0);
  ctx.strokeStyle = `rgba(${RED},${0.9 * a})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, L.y0); ctx.lineTo(x0, L.y1);
  ctx.moveTo(x1, L.y0); ctx.lineTo(x1, L.y1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${RED},${0.55 * a})`;
  ctx.lineWidth = 2;
  const run = (t * 90) % 36;
  ctx.beginPath();
  for (let y = L.y1 - run; y > L.y0 + 8; y -= 36) {
    ctx.moveTo(L.x - 10, y + 6); ctx.lineTo(L.x, y - 4); ctx.lineTo(L.x + 10, y + 6);
  }
  ctx.stroke();
}

// the three beats: the glint, the line fattening into a wedge with the bracket closing on where it lands
function drawTell(ctx, P, T) {
  const G = P.G, B = G.band, m = P.muzzle(T.car), a = T.aim;
  if (T.t < G.glint) {
    const k = T.t / G.glint, r = 2 + 7 * Math.sin(k * Math.PI);
    ctx.strokeStyle = `rgba(255,255,255,${0.95})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const s = (i * Math.PI) / 2 + Math.PI / 4 * (i % 2 ? 0.2 : 0);
      ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + Math.cos(s) * r, m.y + Math.sin(s) * r);
    }
    ctx.stroke();
    dot(ctx, m.x, m.y, '#ffffff', 1.8);
    return;
  }
  const u = clamp((T.t - G.glint) / G.line, 0, 1), ang = Math.atan2(a.y - m.y, a.x - m.x), nx = -Math.sin(ang), ny = Math.cos(ang);
  const wide = 1 + u * B.half * 0.7;
  ctx.fillStyle = `rgba(${RED},${0.12 + 0.3 * u})`;
  ctx.beginPath();
  ctx.moveTo(m.x + nx * 0.6, m.y + ny * 0.6);
  ctx.lineTo(a.x + nx * wide, a.y + ny * wide);
  ctx.lineTo(a.x - nx * wide, a.y - ny * wide);
  ctx.lineTo(m.x - nx * 0.6, m.y - ny * 0.6);
  ctx.fill();
  line(ctx, m.x, m.y, a.x, a.y, `rgba(${RED},${0.55 + 0.45 * u})`, 1);
  // the bracket: the band's box, its corners closing in
  const s = 1.6 - 0.6 * u, hx = B.lead * s, hy = B.half * s, c = 7;
  ctx.strokeStyle = `rgba(${RED},${0.6 + 0.4 * u})`;
  ctx.lineWidth = 1.5 + u;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = a.x + sx * hx, y = a.y + sy * hy;
    ctx.moveTo(x - sx * c, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * c);
  }
  ctx.stroke();
  dot(ctx, a.x, a.y, `rgba(${RED},${0.5 + 0.5 * u})`, 1.5);
}

function line(ctx, x0, y0, x1, y1, col, wd) {
  ctx.strokeStyle = col;
  ctx.lineWidth = wd;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

function dot(ctx, x, y, col, r) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
