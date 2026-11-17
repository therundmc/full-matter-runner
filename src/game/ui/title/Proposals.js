// The title screen's proposals, behind an address flag (nothing changes without it: the title is ui/TitleScene.js):
//   ?title=a   THE NEON POSTER (PosterTitle.js): the comic's cover, in its cut paper
//   ?title=b   THE HIT LIST (HitList.js): the menu as his board, the targets crossed out as they die
//   ?title=c   THE NIGHT CITY (NightSign.js): the present title held at night, a fire, a man, a neon sign
//   ?title=ab  A for the title, B for its LEVELS page
// A proposal draws the whole title state: { id, city: the present title's trains are heard,
// scene(ctx, W, H, t, mouse, view) -> the menu's rects, or null when the menu is drawn apart by ui/MenuArt.js };
// view: { menu (ui/Menu.js, untouched), progress, device }.
import { drawPosterTitle } from './PosterTitle.js';
import { drawHitList } from './HitList.js';
import { drawNightSign } from './NightSign.js';

const PROPOSALS = {
  a: { city: false, scene: (ctx, W, H, t, mouse, view) => drawPosterTitle(ctx, W, H, t, view) },
  b: { city: false, scene: (ctx, W, H, t, mouse, view) => drawHitList(ctx, W, H, t, view) },
  c: { city: true, scene: (ctx, W, H, t, mouse) => drawNightSign(ctx, W, H, t, mouse) },
  ab: { city: false, scene: (ctx, W, H, t, mouse, view) => (view.menu.top.id === 'levels' ? drawHitList : drawPosterTitle)(ctx, W, H, t, view) },
};

// the proposal the address asks for, or null (search: the address's query, '?title=a')
export function titleProposal(search = globalThis.location?.search || '') {
  const id = new URLSearchParams(search).get('title');
  return id && Object.hasOwn(PROPOSALS, id) ? { id, ...PROPOSALS[id] } : null;
}
