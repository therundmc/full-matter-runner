// The title state's picture: the poster (Poster.js) under the menu's first page and, behind a panel, under its other
// pages (ui/MenuArt.js); the hit list (HitList.js) for the LEVELS page and between two levels. The menu's logic is
// ui/Menu.js; this only picks what is drawn and gives back where the items landed, for the mouse.
import { clamp } from '../cine/Ink.js';
import { drawMenu } from '../MenuArt.js';
import { show } from './Paper.js';
import { layPoster, drawPoster } from './Poster.js';
import { drawHitList } from './HitList.js';

// the eye: the mouse across the screen, -1..1, eased (the poster's layers shift against each other with it)
const cam = { x: 0, t: -1 };
function eye(W, t, mouse) {
  const to = mouse ? clamp((mouse.x / W) * 2 - 1, -1, 1) : 0;
  if (cam.t < 0 || t < cam.t || t - cam.t > 1) cam.x = to;
  else cam.x += (to - cam.x) * (1 - Math.exp(-(t - cam.t) * 2.5));
  cam.t = t;
  return cam.x;
}

// is the poster what the title shows for this menu (its fire and its rain are heard then)
export const posterUp = (menu) => menu.top.id !== 'levels';

// view: { menu, progress, device, mouse, between: true on the screen between two levels (no menu), and what the hit
// list wants (HitList.js: crossed, sound, onCrossed) }. Returns the menu's rects.
export function drawTitle(ctx, W, H, t, view) {
  if (view.between) return drawHitList(ctx, W, H, t, { ...view, menu: null });
  if (!posterUp(view.menu)) return drawHitList(ctx, W, H, t, view);
  const x = eye(W, t, view.mouse);
  if (view.menu.page.row) return drawPoster(ctx, W, H, t, x, view);
  layPoster(t, x);
  show(ctx, W, H);
  return drawMenu(ctx, W, H, t, view.menu, 'title');
}
