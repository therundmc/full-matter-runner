// The pixels of a billboard's damage (entities/Board.js decides, this paints), into the prop's own canvas and a
// copy of its emissive map, a sprite pixel at a time (crisp, no smoothing): holes punched, tears that show the
// layers the generator painted under the poster (`<type>_bare`: the sheets, `<type>_frame`: the lattice and what is
// under it), strips of the poster left hanging, lamps shot out. What a tear or a hole takes off the face glows no more.
import { spriteOpt } from '../../engine/Assets.js';
import { hexRgb, rand } from '../../engine/math.js';
import { CELL } from '../data/billboards.js';

const { BARE, LOCK } = CELL;

const pixels = new WeakMap();
// the RGBA of a sprite (read once)
function pixelsOf(img) {
  if (!img) return null;
  let d = pixels.get(img);
  if (d === undefined) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    d = g.getImageData(0, 0, img.width, img.height).data;
    pixels.set(img, d);
  }
  return d?.length ? d : null;
}

const rgb = new Map();
const col = (hex) => { let c = rgb.get(hex); if (!c) rgb.set(hex, (c = hexRgb(hex))); return c; };
const set = (d, o, [r, g, b], a = 255) => { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a; };
const darken = (d, o, k) => { d[o] *= 1 - k; d[o + 1] *= 1 - k; d[o + 2] *= 1 - k; };

// the board's emissive map, its own copy (Board.glow, drawn by render/Lighting.js through prop.drawLamps)
function glowOf(b) {
  if (b.glow === null) {
    const gl = spriteOpt(`props/${b.prop.type}_glow`);
    if (!gl) { b.glow = undefined; return null; }
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    c.k = gl.k;
    c.getContext('2d', { willReadFrequently: true }).drawImage(gl, 0, 0);
    b.glow = c;
  }
  return b.glow || null;
}

export function paintBoard(b, ops) {
  const p = b.prop, g = p.ensureCanvas(), cv = p.canvas;
  if (cv.width !== b.cw || cv.height !== b.ch) return; // (no sprite to paint on: a placeholder, a test)
  const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
  if (!d?.length) return;
  const gc = glowOf(b), gg = gc?.getContext('2d', { willReadFrequently: true });
  const gim = gc && gc.width === cv.width ? gg.getImageData(0, 0, gc.width, gc.height) : null, gd = gim?.data;
  const dark = (o) => { if (gd) gd[o + 3] = 0; };
  const W = cv.width, H = cv.height, k = b.k, look = b.g.look;
  const orig = pixelsOf(p.img);
  const layer = (lv) => pixelsOf(spriteOpt(`props/${p.type}_${lv === BARE ? 'bare' : 'frame'}`));
  for (const op of ops) {
    if (op.op === 'hole') {
      // a punched core, a ragged lip of what it went through (the paper's white back, the plate's bared steel)
      const cx = op.x / k, cy = op.y / k, r = Math.max(0.6, op.r / k), core = col(look.core);
      const lip = col(look.lip), bare = col('#b8bcc4');
      for (let j = Math.floor(cy - r - 2); j <= cy + r + 2; j++) {
        for (let i = Math.floor(cx - r - 2); i <= cx + r + 2; i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const o = (j * W + i) * 4, e = Math.hypot(i + 0.5 - cx, j + 0.5 - cy), m = b.mask[j * W + i];
          if (d[o + 3] === 0 || m > BARE) continue;
          if (e <= r) { set(d, o, core); dark(o); } else if (e <= r + 1.3 && Math.random() < 0.65) set(d, o, m === BARE ? bare : lip);
        }
      }
    } else if (op.op === 'tear') {
      // what was under: copied from its layer, a pixel at a time; the paper's torn edge round it
      const src = layer(op.level);
      if (src && src.length === d.length) {
        for (const c of op.cells) {
          const o = c * 4;
          d[o] = src[o]; d[o + 1] = src[o + 1]; d[o + 2] = src[o + 2]; d[o + 3] = src[o + 3];
          dark(o);
        }
      }
      const lip = col(look.lip);
      for (const c of op.edge) if (d[c * 4 + 3] && Math.random() < 0.7) set(d, c * 4, lip);
    } else if (op.op === 'strip') {
      // a strip of the poster hanging off the tear's edge: shaded (it hangs away from the light), its fold the
      // paper's back, its end ragged
      if (!orig || orig.length !== d.length) continue;
      const x0 = Math.round(op.x / k), y0 = Math.round(op.y / k), w = Math.max(2, Math.round(op.w / k));
      const len = Math.round(op.len / k), drop = Math.round(op.drop / k), lip = col(look.lip);
      for (let i = 0; i < w; i++) {
        const sx = x0 + i, end = len - Math.floor(rand(0, Math.min(len, 4 / k)));
        if (sx < 0 || sx >= W) continue;
        for (let j = 0; j < end; j++) {
          const sy = y0 + j, ty = y0 + drop + j;
          if (sy < 0 || ty < 0 || sy >= H || ty >= H) continue;
          const so = (sy * W + sx) * 4, o = (ty * W + sx) * 4;
          if (!orig[so + 3] || b.mask[ty * W + sx] === LOCK) continue;
          if (j === 0) { set(d, o, lip); continue; }
          d[o] = orig[so]; d[o + 1] = orig[so + 1]; d[o + 2] = orig[so + 2]; d[o + 3] = 255;
          darken(d, o, i === 0 || i === w - 1 ? 0.42 : 0.24);
          dark(o);
        }
      }
    } else if (op.op === 'lamp') {
      // the lens gone dark and cracked, the head dulled
      const [x0, y0, x1, y1] = op.at.map((v) => v / k), lens = col(look.lens), glint = col('#8a96a4');
      for (let j = Math.floor(y0); j < y1; j++) {
        for (let i = Math.floor(x0); i < x1; i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const o = (j * W + i) * 4;
          if (gd) gd[o + 3] = 0;
          if (!d[o + 3]) continue;
          if (d[o] + d[o + 1] + d[o + 2] > 560) set(d, o, Math.random() < 0.2 ? glint : lens);
          else darken(d, o, 0.3);
        }
      }
    }
  }
  g.putImageData(im, 0, 0);
  if (gim) gg.putImageData(gim, 0, 0);
  p.shadow = null;
}
