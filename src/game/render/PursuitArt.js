// What the chase draws over the cars (systems/Pursuit.js, systems/CarGun.js), from above:
//   drawChaseFigures (the standing layer, lit with the scene): each pursuer's gunman leaning out of its window on the
//   runner's side, his arm out and the pistol in his hand (shot: one arm hanging down the door); in a closed car the
//   runner's own hand out of his driver's window with his gun, pointed where he aims (in his arc only; an open car
//   draws him sat at the wheel, his arm out: Vehicle.draw, CharacterAnim.seatPose)
//   drawChaseTells (after the lighting: telegraphs read in the dark; docs/LEVEL2.md, "nothing else red on the road"):
//   the alley car's RED LANE across the road; a gunman's tell in its three beats (a white glint at the muzzle, a thin
//   red line fattening into a wedge toward the bracket on the lane band where it will land, the shot's bone tracer);
//   a lorry backing out; a toll told (bone arrows down the wooden lanes, each lane's signal over its mouth: drawToll)
//   drawChaseWind (after the lighting too): the streaks of air past his car at speed (systems/Drive.js `wind`): one
//   world px thick, whole px, bone, each fading in and out
import { BODY_SCALE } from '../Config.js';
import { sprite, drawSprite } from '../../engine/Assets.js';
import { clamp } from '../../engine/math.js';
import { CHASE } from '../data/chase.js';
import { WEAPONS } from '../data/weapons.js';
import { laneY, mouthX } from '../systems/Toll.js';
import { laneSign } from './LaneSign.js';

const PISTOL = WEAPONS.pistol; // the gunmen's 1911 (systems/Pursuit.js pistolOf)

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
    // (in his car's frame as it is drawn: Vehicle.pose)
    for (const car of P.cars) if (vis(car.v.x, car.v.y) && !car.v.exploded) car.v.carried(ctx, () => drawGunman(ctx, P, car));
  }
  const gun = w.drive?.on && !w.drive.dead ? w.drive.gun : null;
  // (an open car draws him, his arm out; a closed one's hand is in its frame as it is drawn too)
  if (gun?.aimed?.ok && !gun.van.rider) gun.van.carried(ctx, () => drawHand(ctx, gun, w.player));
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
  const { hand, at } = P.pistolOf(car); // (where his shot leaves: Pursuit.muzzle)
  line(ctx, g.x, g.y, hand.x, hand.y, JACKET, 3);
  dot(ctx, hand.x, hand.y, SKIN, 1.6);
  drawSprite(ctx, sprite(PISTOL.sprite), at.x, at.y, car.gunA, 1, BODY_SCALE);
  drawSprite(ctx, sprite('characters/thug_head'), g.x, g.y, car.gunA, 1, BODY_SCALE * 0.9);
}

// his hand out of the driver's window, his gun in it (CarGun.outOf: where its rounds leave)
function drawHand(ctx, gun, p) {
  const a = gun.aimed.a, o = gun.outOf(a);
  line(ctx, o.sh.x, o.sh.y, o.hand.x, o.hand.y, COAT, 3.2);
  dot(ctx, o.hand.x, o.hand.y, SKIN, 1.7);
  const img = p.weapon && sprite(p.def.sprite);
  if (img) drawSprite(ctx, img, o.at.x, o.at.y, a, 1, BODY_SCALE);
}

export function drawChaseTells(ctx, w, t) {
  const P = w.pursuit;
  if (w.lorries) drawLorries(ctx, w.lorries, t);
  if (w.toll) drawToll(ctx, w.toll, t, w.chaseCam?.choosing ?? 0);
  if (!P) return;
  ctx.save();
  for (const L of P.lanes) drawLane(ctx, L, t);
  if (P.tell) drawTell(ctx, P, P.tell);
  for (const tr of P.tracers) {
    const k = 1 - tr.t / P.G.tracer, [p0, p1] = tracerAt(tr);
    line(ctx, p0.x, p0.y, p1.x, p1.y, `rgba(${BONE},${0.9 * k})`, 1.4);
    dot(ctx, p1.x, p1.y, `rgba(255,250,235,${k})`, 2);
  }
  ctx.restore();
}

// a gunman's shot hangs in his car's frame as it is drawn (it goes on with the two cars, out of his muzzle), or where
// it was once his car is gone
function tracerAt(tr) {
  const v = tr.car?.v;
  if (!v || v.exploded) return [{ x: tr.x0, y: tr.y0 }, { x: tr.x1, y: tr.y1 }];
  return [v.carriedAt(v.toWorld(tr.s0.sx, tr.s0.sy)), v.carriedAt(v.toWorld(tr.s1.sx, tr.s1.sy))];
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

// A toll told (systems/Toll.js, CHASE.toll): bone arrows running down each wooden lane toward its arm, along the
// lane's line as it spreads to the plaza (from just ahead of his car to the gate; none once the arm is gone), and each
// lane's own signal big over its mouth (laneSign: a green arrow, a red X), gone as his nose comes up to them (never
// drawn over his car: the gates and the islands' own signals say it by then); all of it `pop` times bigger as the
// choosing's slow motion takes hold (ChaseCam.choosing). No more than that: the gates and their lights say the rest
function drawToll(ctx, S, t, pop = 0) {
  const C = CHASE.toll, beat = 0.5 + 0.5 * Math.sin(t * 14), z = 1 + (C.pop - 1) * pop;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const { P, k, d } of S.told()) {
    const x0 = d?.van ? d.van.x + C.from : P.x - 600, mx = mouthX(P) - C.sign;
    const near = d?.van ? clamp((mx - C.sign - d.van.x - d.van.w / 2) / (2 * C.sign), 0, 1) : 1;
    P.gates.forEach((g, i) => {
      const gate = P.props[i], open = g === 'wood' && gate && !gate.dead && !gate.dying;
      if (open) {
        // (an ink edge under the bone: read on the pale plaza as on the night's asphalt)
        for (const [col, lw] of [[`rgba(20,16,26,${0.55 * k})`, 4.6 * z], [`rgba(${BONE},${(0.7 + 0.3 * beat) * k})`, 2.4 * z]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.beginPath();
          for (let x = P.x - 24 - (C.every - ((t * C.run) % C.every)); x >= x0; x -= C.every) {
            if (Math.abs(x - mx) < C.sign * z) continue; // (not under its sign)
            const y = laneY(P, i, x), a = Math.atan2(laneY(P, i, x + 8) - y, 8), c = Math.cos(a), sn = Math.sin(a);
            const at = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
            ctx.moveTo(...at(-6 * z, -9 * z)); ctx.lineTo(...at(4 * z, 0)); ctx.lineTo(...at(-6 * z, 9 * z));
          }
          ctx.stroke();
        }
      }
      if ((g === 'wood' && !open) || near <= 0) return; // (its arm gone, or he is at the mouths)
      laneSign(ctx, mx, laneY(P, i, mx), C.sign * (1 + 0.3 * pop), g === 'wood', near * k * (g === 'wood' ? 1 : 0.75 + 0.25 * beat));
    });
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
  const G = P.G, B = G.band, m = T.car.v.carriedAt(P.muzzle(T.car)), a = T.aim; // (his muzzle as his car is drawn)
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
