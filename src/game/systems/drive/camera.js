// The camera at the wheel (systems/Drive.js d: its state; Game.updateCamera asks frame, the staged shots lock): the
// picture drawn 1:1 and held on whole px (engine/Camera.js `pixel`), locked on the car along the road a fixed share
// of the view from the left (CHASE.camera.at, `surge` when slowed), on the street's middle across (the leg's `mid`,
// `track`: eased between two legs' framings, acrossStep), and through a bend an offset looking ahead along its line
// (camStep, CHASE.bend.camera). DOM-free.
import { clamp } from '../../../engine/math.js';

// Where the view is drawn from for a point `at` it would look at (z: picture px a world px): along the road, a
// whole number of picture px from the car as it is drawn (Vehicle.pose), whatever the shot pulls it to; across, on
// the picture's grid. So the car never moves by a px in the picture from one frame to the next but by the shot's
// own pan
export function lock(d, at, z = 1) {
  const snap = (n) => Math.round(n * z) / z, x = d.car.x;
  return { x: snap(x) + snap(at.x - x), y: snap(at.y) };
}

// the camera's offset from the car (world px), a step: in a bend it looks ahead along the line, out of one it comes
// back to the leg's own framing (normalOff) and lets go of it once there (CHASE.bend.camera)
export function camStep(d, dt) {
  if (!d.bend && !d.camOff) { acrossStep(d, dt); return; }
  const K = d.C.bend.camera, o = (d.camOff ??= normalOff(d));
  let want = normalOff(d);
  if (d.bend) {
    const a = d.bend.a ?? 0, W = d.viewW ?? (d.view * 16) / 9;
    want = { x: Math.cos(a) * W * K.lead[0], y: Math.sin(a) * d.view * K.lead[1] };
  }
  const k = Math.min(1, K.ease * dt);
  o.x += clamp((want.x - o.x) * k, -K.most, K.most);
  o.y += clamp((want.y - o.y) * k, -K.most, K.most);
  if (!d.bend && Math.abs(o.x - want.x) < K.done && Math.abs(o.y - want.y) < K.done) d.camOff = null;
}

// the offset the leg's own framing holds the view at from the car (frame): C.camera.at of the view's width
// behind its middle along the road, the street's middle across (trackY)
export function normalOff(d) {
  const C = d.C.camera, v = d.car, mid = d.street, W = d.viewW ?? (d.view * 16) / 9;
  return { x: W * (0.5 - C.at - d.surge), y: mid === null ? 0 : trackY(d) - v.y };
}

// the y the leg's framing holds the view's middle at: the street's middle (its `mid`), and `track` of the way from
// it to his car (a road wider than the picture); none (the lab): on the car
export function trackY(d) {
  const mid = d.street, v = d.car;
  return mid === null ? v.y : mid + (v.y - mid) * (d.leg.track || 0);
}

// Across, out of a bend: on a leg that follows him (`track`), the view's middle eased toward trackY as he moves;
// into the next leg by column with another framing, eased from where the last one had it (no jump), then dropped:
// the leg's middle held exactly (frame). C.camera.across
function acrossStep(d, dt) {
  const K = d.C.camera.across, want = trackY(d);
  if (d.camY === null) { if (!d.leg.track) return; d.camY = want; }
  d.camY += clamp((want - d.camY) * Math.min(1, K.ease * dt), -K.most, K.most);
  if (!d.leg.track && Math.abs(d.camY - want) < K.done) d.camY = null;
}

// Where the camera looks (viewW: world px across the view; z: picture px a world px). Along the road it is locked
// on the car, which sits C.camera.at of the view's width from the left whatever it does (no lead, no lag: a car
// sliding on the picture is drawn between two px, another way every frame); across, on the street's middle (his
// leg's `mid` row, else its lanes'; none, the lab: on the car). Both on the picture's px grid, from the car's place
// as it is drawn (Vehicle.draw snaps it the same way), so the car's offset in the picture is one whole number of
// px, frame after frame. Through a bend and until the next leg's framing is back: the car's place and the eased
// offset (camStep), each on the grid
export function frame(d, viewW, z = 1) {
  d.viewW = viewW;
  const C = d.C.camera, v = d.car, snap = (n) => Math.round(n * z) / z, mid = d.street, o = d.camOff;
  if (o) return { x: snap(v.x) + snap(o.x), y: snap(v.y) + snap(o.y) };
  // (slowed by a hit it sits `surge` further forward: whole px, like the rest; across, eased between two legs'
  // framings or following him: camY)
  return { x: snap(v.x) + snap(viewW * (0.5 - C.at - d.surge)), y: snap(d.camY ?? (mid === null ? v.y : mid)) };
}

// slowed, the car comes forward on the picture; it falls back as its speed comes up (frame: `surge`, C.camera)
export function surgeStep(d, dt) {
  const K = d.C.camera;
  d.surge += (K.surge * clamp((1 - d.v / d.cruise - K.from) / (1 - K.from), 0, 1) - d.surge) * Math.min(1, K.ease * dt);
}
