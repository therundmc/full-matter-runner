// The last pass of the picture, on the graphics card. The game still draws its scene on its 2D canvas; this takes that
// canvas as a texture and puts it on screen through a few small programs (WebGL 1, no dependency):
//
//   scene -> half size, blurred            the soft picture (focus, colour bleed)
//         -> quarter size, bright parts    blurred: the glow; streaked toward the lamps: the shafts
//   scene + soft + glow + shafts -> screen bent (zoom kick, tube, torn tape, shock waves, heat), fringed, smeared,
//                                          graded, with its impact frame, scan lines, vignette and grain; at the
//                                          wheel, its edges streaked by the speed (the road itself left as drawn)
//
// What each number means: render/Lens.js (`uniforms`) and data/post.js. `createPost` returns null when WebGL is not
// there or the lens is switched off: the game then draws as it always did. The HUD is not ours: it goes on its own
// 2D canvas above (`overlay`), so it stays sharp.
import { POST } from '../data/post.js';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);`;

// separable gaussian, 9 taps worth in 5 fetches; uStep: one texel of the target along the blur axis
const BLUR = `${HEAD}
uniform sampler2D uTex;
uniform vec2 uStep;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.227027;
  c += (texture2D(uTex, vUv + uStep * 1.384615).rgb + texture2D(uTex, vUv - uStep * 1.384615).rgb) * 0.316216;
  c += (texture2D(uTex, vUv + uStep * 3.230769).rgb + texture2D(uTex, vUv - uStep * 3.230769).rgb) * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;

// what is bright enough to glow, with a soft knee
const BRIGHT = `${HEAD}
uniform sampler2D uTex;
uniform float uThreshold, uKnee;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uThreshold - uKnee, uThreshold + uKnee, l), 1.0);
}`;

// shafts: the glow dragged away from each lamp (xy: its place, z: its strength)
const RAYS = `${HEAD}
uniform sampler2D uTex;
uniform vec4 uLights[3];
uniform float uReach;
void main() {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 L = uLights[i];
    if (L.z > 0.0) {
      vec2 d = (L.xy - vUv) * uReach / 10.0;
      vec2 p = vUv;
      float w = 1.0;
      for (int j = 0; j < 10; j++) { p += d; acc += texture2D(uTex, p).rgb * w * L.z; w *= 0.86; }
    }
  }
  gl_FragColor = vec4(acc / 6.5, 1.0);
}`;

const FINAL = `${HEAD}
uniform sampler2D uScene, uSoft, uGlow, uRays;
uniform vec2 uRes, uFocus, uCentre, uSmear;
uniform float uTime, uFringe, uZoom, uFrame, uGlitch, uCurve, uScan, uScanStep, uMask, uBleed, uGrain, uVignette;
uniform float uEdge, uBlur, uGlowK, uRaysK, uRadial, uWaveWidth, uToneKnee, uToneSoften;
uniform vec4 uWaves[4];
uniform vec4 uHeat[6];
uniform vec3 uGain, uLift, uTint;
uniform float uSat, uCon, uTintK;
uniform vec2 uRushDir, uRushAt, uRushBand, uRushCar;
uniform float uFlat, uRush, uRushLen, uRushRows, uRushFlick, uRushMix, uRushPull, uRushSplit, uRushDark, uRushShare, uRushRun, uRushGlow;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  float asp = uRes.x / uRes.y;
  // the zoom kick, toward where the blow landed
  vec2 uv = uFocus + (vUv - uFocus) / (1.0 + uZoom);
  // the glass of the tube
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + uCurve * vec2(c.y * c.y, c.x * c.x);
  uv = c * 0.5 + 0.5;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  // torn tape: some bands jump sideways, the picture rolls a hair
  if (uGlitch > 0.001) {
    float n = hash(vec2(floor(uv.y * 26.0), floor(uTime * 24.0)));
    uv.x += (n - 0.5) * 0.11 * uGlitch * step(0.6, n);
    uv.y += 0.006 * uGlitch * sin(uTime * 47.0);
  }
  // shock waves: the picture pushed outward on a ring
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    if (w.w > 0.0) {
      vec2 d = (uv - w.xy) * vec2(asp, 1.0);
      float dist = length(d), ring = (dist - w.z) / uWaveWidth;
      uv -= (d / max(dist, 0.0001)) * exp(-ring * ring) * w.w * vec2(1.0 / asp, 1.0);
    }
  }
  // heat: the air shimmers
  for (int i = 0; i < 6; i++) {
    vec4 h = uHeat[i];
    if (h.w > 0.0) {
      vec2 d = (uv - h.xy) * vec2(asp, 1.0);
      float f = max(0.0, 1.0 - length(d) / h.z);
      uv += vec2(sin(uv.y * 210.0 + uTime * 8.0) / asp, cos(uv.x * asp * 170.0 - uTime * 6.1)) * 0.0017 * h.w * f * f;
    }
  }
  // at the wheel: how far this point is into the band the speed works on (0 on the road and round his car, 1 on
  // the picture's edges, measured across the way he goes), and that band stretched along the road about his car.
  // The scene is drawn 1:1 there (uFlat): out of the band every px comes out as it was drawn, so the lens' own
  // fringe is kept to the band too
  float rush = 0.0, lens = 1.0;
  vec2 along = uRushDir * vec2(1.0 / asp, 1.0);
  if (uFlat > 0.5) {
    vec2 mid = (uv - 0.5) * vec2(asp, 1.0);
    lens = smoothstep(uRushBand.x, uRushBand.y, abs(dot(mid, vec2(-uRushDir.y, uRushDir.x))))
      * smoothstep(uRushCar.x, uRushCar.y, length((uv - uRushAt) * vec2(asp, 1.0)));
    rush = lens * uRush;
    uv -= along * dot((uv - uRushAt) * vec2(asp, 1.0), uRushDir) * uRushPull * rush;
  }
  // the lens: colours part toward the corners (and along the road in that band)
  vec2 dir = uv - 0.5;
  vec2 fr = dir * dot(dir, dir) * uFringe * lens * 2.83 / uRes.y + along * uRushSplit * rush / uRes.y;
  vec3 col = vec3(texture2D(uScene, uv + fr).r, texture2D(uScene, uv).g, texture2D(uScene, uv - fr).b);
  if (rush > 0.002) {
    // what is bright leaves a trail behind it along the road, row by row, each row its own length: pixel combs
    float rowAt = dot(uv * vec2(asp, 1.0), vec2(-uRushDir.y, uRushDir.x)) * uRushRows, row = floor(rowAt), k = min(1.0, rush);
    float n = hash(vec2(row, floor(uTime * uRushFlick)));
    vec2 st = along * uRushLen * min(rush, 1.3) * (0.25 + 0.75 * n * n) / 10.0;
    vec3 trail = col;
    for (int i = 1; i <= 10; i++) trail = max(trail, texture2D(uScene, uv - st * float(i)).rgb * (1.0 - float(i) / 11.0));
    col = mix(col, trail, k * uRushMix) * (1.0 - uRushDark * k);
    // streaks of air: on a few rows, dashes running back along the road, their head bright, the colour of what
    // light they cross
    float h1 = hash(vec2(row, 7.0));
    if (h1 > 1.0 - uRushShare && fract(rowAt) < 0.5) {
      float x = dot(uv * vec2(asp, 1.0), uRushDir), duty = 0.07 + 0.2 * k * hash(vec2(row, 3.0));
      float ph = fract(x * (0.5 + h1) + uTime * uRushRun * (0.6 + 0.8 * hash(vec2(row, 5.0))) + h1 * 17.0);
      col += mix(vec3(0.94, 0.9, 0.82), trail * 1.6, 0.55) * step(ph, duty) * (1.0 - ph / duty) * uRushGlow * k;
    }
  }
  // speed: smeared along the move, streaming from the player in slow motion
  vec2 bv = uSmear + (uv - uCentre) * uRadial;
  if (dot(bv, bv) > 0.0000001) {
    vec3 acc = col;
    for (int i = 1; i <= 6; i++) acc += texture2D(uScene, uv - bv * (float(i) / 6.0)).rgb;
    col = acc / 7.0;
  }
  // focus: soft toward the edges, soft all over behind a menu
  vec3 soft = texture2D(uSoft, uv).rgb;
  float edge = smoothstep(0.42, 1.0, length(c * vec2(1.0, 1.08)) * 0.78);
  col = mix(col, soft, clamp(edge * uEdge + uBlur, 0.0, 1.0));
  // glow and shafts
  col += texture2D(uGlow, uv).rgb * uGlowK + texture2D(uRays, uv).rgb * uRaysK;
  // highlights rolled off: bright stays bright, never a flat white
  col -= max(col - uToneKnee, 0.0) * uToneSoften;
  // tape: the colour runs, the drawing does not
  col = mix(col, vec3(dot(col, LUMA)) + soft - dot(soft, LUMA), uBleed);
  // grading
  col = clamp(col, 0.0, 1.0);
  col = mix(vec3(dot(col, LUMA)), col, uSat);
  col = (col - 0.5) * uCon + 0.5;
  col = clamp(col * uGain, 0.0, 1.0);
  col = 1.0 - (1.0 - col) * (1.0 - uLift);
  col += (2.0 * uTint - 1.0) * col * (1.0 - col) * uTintK;
  // impact frame: two tones, for an instant
  float l = dot(col, LUMA);
  col = mix(col, mix(vec3(0.05, 0.0, 0.09), vec3(1.0, 0.96, 0.9), smoothstep(0.2, 0.36, l)), uFrame);
  // the tube: scan lines, phosphor triads, dark corners, grain
  col *= 1.0 - uScan * step(0.5, fract(gl_FragCoord.y / (2.0 * uScanStep)));
  float m = mod(gl_FragCoord.x, 3.0);
  col *= 1.0 - uMask + uMask * 3.0 * vec3(step(m, 1.0), step(1.0, m) * step(m, 2.0), step(2.0, m));
  col *= 1.0 - uVignette * smoothstep(0.45, 1.0, length(c) * 0.7071);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrain;
  gl_FragColor = vec4(col * inside, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// a program and a setter per uniform: u.name(...values)
function program(gl, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    loc[name] = gl.getUniformLocation(p, name);
  }
  return { p, loc };
}

class Post {
  constructor(scene, gl, canvas, overlay) {
    this.scene = scene;       // the game's 2D canvas
    this.gl = gl;
    this.canvas = canvas;     // ours, on top of it
    this.overlay = overlay;   // the HUD's 2D canvas, on top of ours
    this.octx = overlay.getContext('2d');
    this.ok = true;
    this.blurP = program(gl, BLUR);
    this.brightP = program(gl, BRIGHT);
    this.raysP = program(gl, RAYS);
    this.finalP = program(gl, FINAL);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.sceneTex = this.texture();
    this.targets = null;
    // the card dropped us: step aside for good, the game goes back to drawing on its own canvas
    canvas.addEventListener('webglcontextlost', () => {
      this.ok = false;
      canvas.style.display = overlay.style.display = 'none';
    });
    this.resize();
  }

  texture() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }

  // a texture to draw into
  target(w, h) {
    const gl = this.gl, tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  // on show / off show (the debug key that compares the picture with and without the lens)
  show(on) { if (this.ok) this.canvas.style.display = this.overlay.style.display = on ? '' : 'none'; }

  // follow the game's canvas (called by Game.resize)
  // outW, outH: the window, in device px. The scene may be larger (Game.resize): we bring it down. The HUD's canvas
  // keeps the scene's size, so everything drawn on it is laid out as on the scene, and the page scales it.
  resize(outW = this.scene.width, outH = this.scene.height) {
    const gl = this.gl, W = this.scene.width, H = this.scene.height;
    this.canvas.width = outW; this.canvas.height = outH;
    this.overlay.width = W; this.overlay.height = H;
    for (const t of this.targets || []) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1), qw = Math.max(1, W >> 2), qh = Math.max(1, H >> 2);
    this.targets = [this.target(hw, hh), this.target(hw, hh), this.target(qw, qh), this.target(qw, qh), this.target(qw, qh)];
  }

  // one pass: program `P` reading texture `src` (unit 0) into `dst` (null: the screen)
  pass(P, src, dst, set) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
    gl.viewport(0, 0, dst ? dst.w : this.canvas.width, dst ? dst.h : this.canvas.height);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    set(gl, P.loc);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // u: Lens.uniforms(); t: seconds
  render(u, t) {
    if (!this.ok) return;
    const gl = this.gl, [h0, h1, q0, q1, q2] = this.targets, W = this.canvas.width, H = this.canvas.height;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene);
    const blur = (src, dst, x, y) => this.pass(this.blurP, src, dst, (g, l) => { g.uniform1i(l.uTex, 0); g.uniform2f(l.uStep, x, y); });
    // the soft picture
    blur(this.sceneTex, h0, 1 / h0.w, 0);
    blur(h0.tex, h1, 0, 1 / h1.h);
    // the glow of what is bright
    this.pass(this.brightP, h1.tex, q0, (g, l) => { g.uniform1i(l.uTex, 0); g.uniform1f(l.uThreshold, u.glow.threshold); g.uniform1f(l.uKnee, u.glow.knee); });
    blur(q0.tex, q1, 1.6 / q1.w, 0);
    blur(q1.tex, q0, 0, 1.6 / q0.h);
    // shafts out of the lamps
    this.pass(this.raysP, q0.tex, q2, (g, l) => { g.uniform1i(l.uTex, 0); g.uniform4fv(l.uLights, u.lights); g.uniform1f(l.uReach, u.rays.reach); });
    // the picture
    this.pass(this.finalP, this.sceneTex, null, (g, l) => {
      [h1, q0, q2].forEach((tg, i) => { g.activeTexture(g.TEXTURE1 + i); g.bindTexture(g.TEXTURE_2D, tg.tex); });
      g.uniform1i(l.uScene, 0); g.uniform1i(l.uSoft, 1); g.uniform1i(l.uGlow, 2); g.uniform1i(l.uRays, 3);
      g.uniform2f(l.uRes, W, H);
      g.uniform2f(l.uFocus, u.focus[0], u.focus[1]);
      g.uniform2f(l.uCentre, u.centre[0], u.centre[1]);
      g.uniform2f(l.uSmear, u.smear[0], u.smear[1]);
      g.uniform4fv(l.uWaves, u.waves);
      g.uniform4fv(l.uHeat, u.heat);
      g.uniform3fv(l.uGain, u.grade.gain); g.uniform3fv(l.uLift, u.grade.lift); g.uniform3fv(l.uTint, u.grade.tint);
      const R = u.rush;
      g.uniform2f(l.uRushDir, R.dir[0], R.dir[1]); g.uniform2f(l.uRushAt, R.at[0], R.at[1]); g.uniform2f(l.uRushBand, R.band[0], R.band[1]);
      g.uniform2f(l.uRushCar, R.car[0], R.car[1]);
      const one = {
        uTime: t % 1000, uFringe: u.fringe, uZoom: u.zoom, uFrame: u.frame, uGlitch: u.glitch, uCurve: u.curve, uScan: u.scan,
        uScanStep: u.scanStep, uMask: u.mask, uBleed: u.bleed, uGrain: u.grain, uVignette: u.vignette, uEdge: u.edge, uBlur: u.blur,
        uGlowK: u.glow.strength, uRaysK: u.rays.strength, uRadial: u.radial, uWaveWidth: u.waveWidth,
        uToneKnee: u.tone.knee, uToneSoften: u.tone.soften,
        uSat: u.grade.sat, uCon: u.grade.con, uTintK: u.grade.tintK,
        uRushShare: R.lines.share, uRushRun: R.lines.run, uRushGlow: R.lines.glow,
        uFlat: R.flat, uRush: R.k, uRushLen: R.len, uRushRows: R.rows, uRushFlick: R.flick, uRushMix: R.mix, uRushPull: R.pull, uRushSplit: R.split, uRushDark: R.dark,
      };
      for (const k in one) g.uniform1f(l[k], one[k]);
    });
  }
}

// Sets the lens up over the game's canvas: our canvas and the HUD's are stacked on it (style.css: #post, #hud) and
// let the mouse through. Returns null when it cannot be (no WebGL, switched off, a shader that does not build).
export function createPost(scene, cfg = POST) {
  if (!cfg.enabled || new URLSearchParams(location.search).get('post') === '0') return null;
  const canvas = document.createElement('canvas'), overlay = document.createElement('canvas');
  canvas.id = 'post';
  overlay.id = 'hud';
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  try {
    const post = new Post(scene, gl, canvas, overlay);
    scene.after(canvas, overlay);
    return post;
  } catch (e) {
    console.warn('lens off:', e.message);
    return null;
  }
}
