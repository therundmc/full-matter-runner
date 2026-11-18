// The title's frame: its logical picture, 384 x 216 title px, which the comics' pages share (ui/cine), and the
// canvases its sheets are cut on (ui/title/Paper.js).
export const LW = 384, LH = 216;

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}
