// Where the camera looks, once a frame: the usual view (the player, a look-ahead toward the cursor, SHIFT further),
// the staged shots that take it over (stagedShot: the tutorial's staging, level 1's opening, a boss's beat, the gun
// off the car's seat, a chase beat, a throw's beat: systems/Direction.js eases between them), the kill cam's punch-in
// on top, the drive's own view at the wheel, the getaway's pan to the car; the right stick's virtual cursor on a pad
// (padAim). The time scale is not its business (systems/TimeScale.js).
import { PLAYER } from '../Config.js';
import { lerp, angDiff } from '../../engine/math.js';
import { VIEW } from '../../engine/Camera.js';
import Audio from '../../audio/Audio.js';
import Direction from '../systems/Direction.js';
import Opening from '../systems/Opening.js';
import { assistAim } from '../systems/AimCue.js';
import { OUTRO, camBlend } from '../systems/Outro.js';
import { PAD_AIM } from '../data/controls.js';
import { GAME } from '../data/game.js';

export default class CameraDirector {
  constructor(game) {
    this.game = game;
    this.direction = new Direction();  // the camera's shots where a level is staged (the prologue)
    this.opening = new Opening(null);  // level 1's opening on the camera (LevelFlow.startLevel)
    this.padAimAt = null;              // the right stick's virtual cursor: { angle, reach, idle } (padAim)
  }

  // the camera's shot: the tutorial's staging, level 1's opening (systems/Opening.js), a boss's beat
  // (systems/BossStage.js), the gun taken off the car's seat (systems/Drive.js grab), a chase beat or a throw's beat
  // (systems/ThrowBeat.js); null: the usual view
  stagedShot() {
    const w = this.game.world;
    return w.tutorial?.shot() ?? this.opening.shot() ?? w.bossStage.shot() ?? w.drive?.shot() ?? w.chaseCam?.shot() ?? w.throwBeat.shot();
  }

  // a level starts: a level driven in the van opens on the drive's view, ahead of it (systems/Drive.js); a staged
  // level on its first shot, no easing
  start() {
    const g = this.game, cam = g.camera, w = g.world, p = w.player, dr = w.drive;
    g.setView(dr ? dr.view : VIEW, !!dr);
    cam.sway = !dr;
    cam.swayK = dr ? 0 : 1;
    const shot = this.stagedShot();
    this.direction.reset();
    this.direction.set(shot?.name, shot?.at, true, cam.zoom);
    cam.scale = this.direction.zoom;
    const z0 = cam.zoom * cam.scale, fr = dr && dr.frame(cam.w / z0, z0);
    const at = dr ? dr.lock(this.direction.aim(fr.x, fr.y), z0) : p;
    cam.snap(at.x, at.y);
    this.padAimAt = null;
  }

  // the kill cam's clock (systems/KillCam.js): never in a staged shot; the usual view, without its own zoom
  updateKillCam(dt) {
    const g = this.game, c = g.camera, kc = g.world.killCam, z = c.zoom * c.scale / kc.scale;
    kc.update(dt, { staged: g.state !== 'play' || !!this.stagedShot(), view: { x: c.x, y: c.y, hw: c.w / z / 2, hh: c.h / z / 2 } });
  }

  // The camera follows the world as it is drawn: between its last two steps (engine/Interp.js), the real places put
  // back at once
  update(dt) {
    const g = this.game;
    if (!g.world) return;
    g.interp.apply(g.clock.alpha);
    try { this.aim(dt); } finally { g.interp.restore(); }
  }

  aim(dt) {
    const g = this.game, w = g.world, p = w.player, inp = g.input, cam = g.camera;
    const aim = cam.screenToWorld(inp.mouse.x, inp.mouse.y), far = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const k = far ? PLAYER.lookAheadFar : PLAYER.lookAhead;
    let ox = (aim.x - p.x) * k, oy = (aim.y - p.y) * k;
    const max = far ? GAME.look.far : GAME.look.max;
    const len = Math.hypot(ox, oy);
    if (len > max) { ox *= max / len; oy *= max / len; }
    // at the wheel (systems/Drive.js): the view is the drive's own, drawn 1:1 at a whole zoom and held on whole px
    // (no tilt, no turn, no lag: engine/Camera.js `pixel`), locked on the car; the cursor plays no part. In and out
    // of the car (the lab) the view changes in one cut
    const dr = w.drive?.on ? w.drive : null;
    if (dr) { ox = 0; oy = 0; }
    g.setView(dr ? dr.view : VIEW, !!dr);
    cam.sway = !dr;
    if (!p.alive || g.state !== 'play') { ox = 0; oy = 0; }
    // a staged level names the shot: its zoom on the camera, the view drawn toward what it looks at
    const D = this.direction, shot = this.stagedShot();
    D.set(shot?.name, shot?.at);
    D.update(dt, cam.zoom, cam.pixel); // (at the wheel a shot's zoom is a cut: Direction.update)
    // (a tutorial lesson's slow motion pushes in on him a little: systems/Tutorial.js push)
    cam.scale = D.zoom * (1 + (w.tutorial?.push() ?? 0));
    const kc = w.killCam; // its punch-in on top (1 at rest, and at the wheel), the view drawn toward the kill
    cam.scale *= kc.scale;
    const z = cam.zoom * cam.scale, frame = { x: p.x, y: p.y, hw: cam.w / z / 2, hh: cam.h / z / 2 };
    const fr = dr && dr.frame(cam.w / z, z);
    const seen = dr ? D.aim(fr.x, fr.y) : D.aim(p.x + ox * D.look, p.y + oy * D.look, frame);
    // (a shot of the chase that only looks `ahead`: never back along the road, he must see where he goes)
    if (dr && D.shot?.ahead) seen.x = Math.max(seen.x, fr.x);
    // (at the wheel the view is locked a whole number of picture px from the car as it is drawn: Drive.lock)
    const drawn = dr ? dr.lock(seen, z) : kc.aim(seen.x, seen.y, frame);
    let tx = drawn.x, ty = drawn.y;
    const o = g.state === 'outro' && w.outro;
    if (o) {
      // from the player over to the car's cab, a little ahead of it
      const cab = o.car.toWorld(w.doorX(o.car), o.car.h / 2), b = camBlend(o.t);
      tx += (cab.x + Math.cos(o.heading) * OUTRO.lead - tx) * b;
      ty += (cab.y + Math.sin(o.heading) * OUTRO.lead - ty) * b;
    }
    cam.update(dt, tx, ty);
    Audio.listener.x = cam.x;
    Audio.listener.y = cam.y;
  }

  // The right stick's virtual cursor (data/controls.js PAD_AIM): a point round the player, nearer or further with the
  // push, put where the mouse would be, so that the aim, the camera's look-ahead and the cursor all follow it. With
  // the stick at rest the aim stays put, and turns to where he walks after a moment. No aim assist, but LOCK's.
  padAim(dt) {
    const g = this.game, inp = g.input, p = g.world?.player;
    if (inp.device !== 'pad' || !p?.alive || g.state !== 'play') return;
    const A = this.padAimAt || (this.padAimAt = { angle: p.angle, reach: PAD_AIM.near, idle: 0 });
    const r = inp.aimStick(), m = inp.move();
    if (r) {
      A.angle = Math.atan2(r.y, r.x);
      A.reach = lerp(PAD_AIM.near, PAD_AIM.far, r.mag);
      A.idle = 0;
    } else {
      A.idle += dt;
      if (m && A.idle > PAD_AIM.follow) A.angle += angDiff(A.angle, Math.atan2(m.y, m.x)) * Math.min(1, dt * 10);
    }
    // LOCK's soft assist (systems/AimCue.js): a man close to the stick's way takes the aim
    const to = assistAim(g.world, A.angle);
    const at = g.camera.worldToScreen(to ? to.x : p.x + Math.cos(A.angle) * A.reach, to ? to.y : p.y + Math.sin(A.angle) * A.reach);
    inp.mouse.x = at.x;
    inp.mouse.y = at.y;
  }
}
