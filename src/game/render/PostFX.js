import { LIGHTING as L } from '../Config.js';

// The 2D stand-in for the lens (render/PostGL.js) where WebGL is not there: full-screen colour grading
// (saturation/contrast, teal shadows / magenta highlights), the red channel shifted on heavy shake, film grain. Pixel
// art stays crisp (no resampling of the base image); at the wheel nothing moves a px of it (no shifted channel).
export default class PostFX {
  constructor() {
    this.tmp = null;
    this.grain = null;
  }

  makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // shake: camera trauma 0..1.2; wheel: at the wheel (Game.wheel: the scene drawn 1:1, nothing may resample it)
  apply(ctx, W, H, shake, wheel = false) {
    if (!L.enabled) return;
    const cv = ctx.canvas, gr = L.grade;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (gr.saturate !== 1 || gr.contrast !== 1) {
      ctx.globalCompositeOperation = 'copy';
      ctx.filter = `saturate(${gr.saturate}) contrast(${gr.contrast})`;
      ctx.drawImage(cv, 0, 0);
      ctx.filter = 'none';
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = gr.shadowTint;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = gr.highlightTint;
    ctx.fillRect(0, 0, W, H);

    // red channel shifted sideways while the screen shakes hard
    const ca = wheel ? 0 : Math.round(L.aberration * Math.max(0, shake - 0.15) * (H / 1080));
    if (ca >= 1) {
      if (!this.tmp || this.tmp.width !== W || this.tmp.height !== H) {
        this.tmp = document.createElement('canvas');
        this.tmp.width = W; this.tmp.height = H;
      }
      const t = this.tmp.getContext('2d');
      t.globalCompositeOperation = 'copy';
      t.drawImage(cv, 0, 0);
      t.globalCompositeOperation = 'multiply';
      t.fillStyle = '#f00';
      t.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#0ff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.tmp, ca, 0);
      ctx.drawImage(this.tmp, 0, 0, ca, H, 0, 0, ca, H);
    }

    if (L.grain > 0) {
      if (!this.grain) this.grain = ctx.createPattern(this.makeGrain(), 'repeat');
      const s = Math.max(1, Math.round(H / 540));
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = L.grain;
      ctx.setTransform(s, 0, 0, s, Math.floor(Math.random() * 128) * s, Math.floor(Math.random() * 128) * s);
      ctx.fillStyle = this.grain;
      ctx.fillRect(-128, -128, W / s + 128, H / s + 128);
    }
    ctx.restore();
  }
}
