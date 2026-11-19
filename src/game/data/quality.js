// The QUALITY option (OPTIONS / VIDEO): what each level draws less of. Looks only: nothing here touches the
// simulation (as many guards, the same physics), and the pixel art stays crisp at every level. Read through
// systems/Quality.js `quality()`; the setting is one of QUALITY_CHOICES, 'auto' picking a level by itself (AUTO).
//   ss        the most the scene is drawn larger than the window before the lens brings it down (engine/Camera.js
//             fitView: over it, one whole zoom less and the lens brings the picture UP, its pixels kept square and
//             sharp: render/PostGL.js `uSharp`). Never at the wheel: that picture is 1:1 whatever the level
//   zoom      the largest whole zoom the scene is drawn at (a 4K window draws no more px than a 1080 one)
//   mirrors   the wet floors' and the puddles' reflections of the lights (render/Lighting.js)
//   bloom     the bloom's buffers' share of their full resolution (LIGHTING.bloomScale)
//   light     the light map's share of its full resolution (LIGHTING.scale)
//   smoke     the smoke's grain: its texels' share of the full light map's (render/SmokeArt.js)
//   particles the share of MAX_PARTICLES kept (fx/Particles.js)
//   shimmer   the air shimmering over what burns (render/Lens.js)
//   glow, rays  the lens' own glow of what is bright, and its shafts out of the lamps (render/PostGL.js: their
//             passes are not run); its grade, vignette, fringe, tube and kicks are the look's core and stay
//   lights    the most muzzle flashes / blasts lit with their shadows at once, the nearest to the view's middle
//   fire      the share of FIRE.budget (puffs of flame a second) kept (systems/Fires.js)
//   fx        the share of a car's sparks, burning pieces and casings thrown (systems/CarFx.js, CARFX.budget)
//   fxLights  the most short lights a second those sparks and fire-balls may lay (never over CARFX.budget.lights; 0:
//             no extra light)
export const QUALITY = {
  high: { ss: Infinity, zoom: Infinity, mirrors: true, bloom: 1, light: 1, smoke: 1, particles: 1, shimmer: true, glow: true, rays: true, lights: Infinity, fire: 1, fx: 1, fxLights: Infinity },
  medium: { ss: 1.1, zoom: 4, mirrors: false, bloom: 0.5, light: 1, smoke: 0.5, particles: 0.5, shimmer: false, glow: true, rays: true, lights: Infinity, fire: 1, fx: 0.6, fxLights: 12 },
  low: { ss: 1, zoom: 3, mirrors: false, bloom: 0.5, light: 0.5, smoke: 0.5, particles: 0.5, shimmer: false, glow: false, rays: false, lights: 4, fire: 0.5, fx: 0.35, fxLights: 0 },
};

export const QUALITY_LEVELS = ['low', 'medium', 'high'];              // from the lightest up
export const QUALITY_CHOICES = ['auto', 'low', 'medium', 'high'];     // the option's values, as the row walks them

// AUTO: starts at HIGH and watches the frame time in play. The mean over `window` s of frames over `over` ms: one
// level down, and nothing is measured for `skip` s (as after a level starts: its first frames bake and warm up).
// A frame of `hitch` ms or more is a load or a window left, not the game's pace: not counted. Never back up by
// itself: the level it settled on is kept for the next session (Settings `autoQuality`).
export const AUTO = { window: 3, skip: 2, over: 18, hitch: 100 };
