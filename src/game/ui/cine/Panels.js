// The opening's comic panels, 8-bit: a black box with a white rule and a hard shadow, and in it a close-up painted
// with a handful of flat colours and checkerboard shade, in the title's logical px. Each painter gets the context
// already clipped to its panel and translated to its top-left corner.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (n) => { const s = Math.sin(n * 91.7 + 13.1) * 43758.5453; return s - Math.floor(s); };
const px = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

// checkerboard shade: every other pixel of the rectangle
function dither(g, col, x, y, w, h) {
  g.fillStyle = col;
  for (let j = 0; j < h; j++) for (let i = (j + Math.round(x + y)) % 2; i < w; i += 2) g.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
}

// r: { x, y, w, h }; k 0..1: how far it has come up into place (it rises from below, a little too far, and settles)
export function drawPanel(g, r, k, paint) {
  if (k <= 0) return;
  const e = 1 - (1 - k) * (1 - k), over = Math.sin(Math.min(1, k) * Math.PI) * 3;
  const y = Math.round(r.y + (1 - e) * 70 - over);
  g.save();
  g.globalAlpha = clamp(k * 3, 0, 1);
  px(g, '#000', r.x + 3, y + 3, r.w, r.h);
  px(g, '#f4f0e8', r.x - 1, y - 1, r.w + 2, r.h + 2);
  px(g, '#000', r.x, y, r.w, r.h);
  g.beginPath(); g.rect(r.x + 1, y + 1, r.w - 2, r.h - 2); g.clip();
  g.translate(r.x, y);
  paint(g, r.w, r.h);
  g.restore();
}

// his eye in the dark: shut, then open all at once (open 0..1), looking to the side the noise came from (look -1..1)
export function paintEye(g, w, h, open, look, t) {
  px(g, '#3a2c36', 0, 0, w, h);
  dither(g, '#241a26', 0, 0, w, h);
  px(g, '#5a4650', 0, 6, w, h - 16);                                     // the skin, what the window lights of it
  dither(g, '#3a2c36', 0, h - 22, w, 12);
  px(g, '#8a7430', 0, 0, w, 7); dither(g, '#5a4a20', 0, 4, w, 4);        // his hair, low on the brow
  for (let i = 0; i < 9; i++) px(g, '#b89a40', 6 + i * 17 + hash(i) * 6, 1 + hash(i + 3) * 3, 5, 1);
  const cx = Math.round(w / 2), cy = Math.round(h / 2) + 3, rows = [18, 30, 38, 42, 44, 42, 38, 30, 18];
  const n = Math.round(clamp(open, 0, 1) * rows.length);
  px(g, '#1a1018', cx - 26, cy - 9, 52, 3);                              // the brow's shadow
  if (n <= 0) {
    px(g, '#140c14', cx - 22, cy, 44, 2);                                // shut: the lashes
    for (let i = 0; i < 6; i++) px(g, '#140c14', cx - 20 + i * 8, cy + 2, 1, 2);
  } else {
    const first = Math.floor((rows.length - n) / 2);
    for (let j = 0; j < n; j++) px(g, '#e8e4dc', cx - rows[first + j] / 2, cy - n / 2 + j, rows[first + j], 1);
    const ix = cx + Math.round(look * 9), r = Math.min(6, Math.ceil(n / 2) + 1);
    px(g, '#1c5a6e', ix - r, cy - r + 1, r * 2, r * 2 - 2); px(g, '#2e8aa0', ix - r + 1, cy - r + 2, r * 2 - 2, r * 2 - 4);
    px(g, '#05030a', ix - 2, cy - 2, 4, 4);
    px(g, '#ffffff', ix - 3, cy - 3, 2, 2);
    px(g, '#140c14', cx - 23, cy - n / 2 - 1, 46, 1); px(g, '#2a1c24', cx - 21, cy + n / 2, 42, 1);
    for (let i = 0; i < 5; i++) px(g, '#c85a5a', cx - 20 + i * 9 + hash(i) * 3, cy - n / 2 + 1 + hash(i + 2) * (n - 2), 3, 1); // bloodshot
  }
  const drop = (t * 9) % 40;
  px(g, '#9ab0c8', 22, 12 + drop, 2, 3); px(g, '#ffffff', 22, 12 + drop, 1, 1);  // sweat
}

// the foot of the door from inside: the landing's light in the gap, and what comes under it (blood 0..1)
export function paintGap(g, w, h, blood) {
  const gap = Math.round(h * 0.42);
  px(g, '#3e2818', 0, 0, w, gap); dither(g, '#2a1a0e', 0, 0, w, gap);
  px(g, '#5a3c28', 8, 4, w - 16, gap - 10); dither(g, '#3e2818', 8, 4, w - 16, gap - 10);
  px(g, '#ffd9a0', 0, gap, w, 3); px(g, '#fff4d8', 0, gap + 1, w, 1);
  px(g, '#1c1214', 0, gap + 3, w, h - gap - 3);
  for (let y = gap + 3; y < h; y += 10) px(g, '#2a1c1c', 0, y + 1, w, 8);
  for (let y = gap + 3; y < h; y += 10) px(g, '#0e0808', 0, y, w, 1);
  dither(g, 'rgba(255,217,160,0.12)', 0, gap + 3, w, 12);
  // it comes under the door in three tongues of unequal length that run into one pool
  const room = h - gap - 3;
  for (const [cx, wide, len] of [[0.5, 0.34, 1], [0.3, 0.2, 0.62], [0.72, 0.22, 0.78]]) {
    const L = Math.max(0, blood * 1.25 - (1 - len) * 0.5) * room * len;
    for (let jy = 0; jy < L; jy++) {
      const half = wide * w * Math.sqrt(1 - (jy / L) ** 2) + (hash(jy + cx * 40) - 0.5) * 3, x = cx * w - half;
      px(g, '#6a080c', x, gap + 3 + jy, half * 2, 1);
      px(g, '#3a0508', x, gap + 3 + jy, 2, 1); px(g, '#3a0508', x + half * 2 - 2, gap + 3 + jy, 2, 1);
      if (jy % 4 === 1 && half > 6) px(g, '#aa1c1e', x + 3, gap + 3 + jy, half * 0.5, 1);
    }
  }
  if (blood > 0) dither(g, '#3a0508', w * 0.12, gap + 3, w * 0.76, Math.min(6, blood * 30));
}

// his face in the dark: nothing of it but the eyes, wide, and the edge of his hair the window catches
export function paintFace(g, w, h, t) {
  px(g, '#05030a', 0, 0, w, h);
  dither(g, '#0c0916', 0, 0, w, h);
  const cx = Math.round(w / 2), cy = Math.round(h * 0.44), shake = Math.round(Math.sin(t * 31) * 0.6);
  // his head and shoulders, darker than the dark; the window, on his right, edges him with the neon's pink
  px(g, '#0e0b1a', cx - 46, cy + 50, 92, h); px(g, '#141024', cx - 10, cy + 36, 20, 16);
  px(g, '#141024', cx - 28, cy - 30, 56, 62); px(g, '#141024', cx - 24, cy + 32, 48, 6);
  px(g, '#b0306a', cx - 30, cy - 26, 2, 54); dither(g, '#5a1c40', cx - 28, cy - 28, 6, 58);
  px(g, '#b0306a', cx - 48, cy + 50, 2, h); dither(g, '#5a1c40', cx - 46, cy + 50, 5, h);
  px(g, '#2a2412', cx - 30, cy - 40, 60, 14); px(g, '#2a2412', cx - 32, cy - 32, 8, 12);                    // his hair
  for (let i = 0; i < 9; i++) px(g, '#8a7430', cx - 30 + i * 3 + hash(i) * 2, cy - 40 + hash(i + 4) * 5, 2, 3 + hash(i + 2) * 4);
  const blink = (t * 0.9) % 1 > 0.93;
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 13 + shake, ey = cy - 4;
    px(g, '#0a0814', ex - 11, ey - 7, 22, 15);                                                              // the socket
    px(g, '#05030a', ex - 9, ey - 11 - (sx < 0 ? 1 : 0), 18, 2);                                            // the brow, raised
    if (blink) { px(g, '#3a2c36', ex - 8, ey + 2, 16, 1); continue; }
    px(g, '#e8e4dc', ex - 8, ey - 3, 16, 7); px(g, '#e8e4dc', ex - 6, ey - 4, 12, 9);
    px(g, '#1c5a6e', ex + 1, ey - 3, 6, 6); px(g, '#05030a', ex + 3, ey - 1, 3, 3); px(g, '#ffffff', ex + 2, ey - 2, 1, 1);
  }
  px(g, '#0a0814', cx - 2, cy + 6, 4, 8); px(g, '#05030a', cx - 6, cy + 22, 12, 3); px(g, '#2a1c24', cx - 4, cy + 22, 8, 1); // the nose, the mouth
  const drop = (t * 14) % 44;
  px(g, '#9ab0c8', cx + 22, cy - 16 + drop, 2, 3); px(g, '#ffffff', cx + 22, cy - 16 + drop, 1, 1);
}

// floor level, from the bed: the bar of light under the door, and the boots that come and stop in it (n 0..2 of them)
export function paintBoots(g, w, h, n, t) {
  const top = Math.round(h * 0.3);
  px(g, '#1a100a', 0, 0, w, top); dither(g, '#2a1a0e', 0, 0, w, top);
  px(g, '#ffd9a0', 0, top, w, 5); px(g, '#fff4d8', 0, top + 1, w, 2);
  px(g, '#120a0c', 0, top + 5, w, h - top - 5);
  for (let y = top + 5; y < h; y += 12) { px(g, '#1e1214', 0, y + 1, w, 10); px(g, '#0a0606', 0, y, w, 1); }
  // the light it throws into the room, cut by whoever stands in it
  for (let j = 0; j < h - top - 5; j++) {
    const a = 0.3 * (1 - j / (h - top - 5));
    if (a > 0.02 && j % 2 === 0) px(g, `rgba(255,217,160,${a.toFixed(3)})`, 0, top + 5 + j, w, 1);
  }
  for (let i = 0; i < n; i++) {
    const x = Math.round(w * (i ? 0.58 : 0.26)), sway = Math.round(Math.sin(t * 2 + i) * 0.6);
    px(g, '#000', x + sway, top - 1, 16, 7);
    g.fillStyle = 'rgba(0,0,0,0.85)';
    g.beginPath(); g.moveTo(x + sway, top + 5); g.lineTo(x + 16 + sway, top + 5); g.lineTo(x + 30 - i * 26, h); g.lineTo(x - 14 - i * 26, h); g.closePath(); g.fill();
  }
}
