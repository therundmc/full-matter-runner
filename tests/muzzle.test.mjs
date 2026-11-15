import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { load } from './setup.mjs';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
const { WEAPONS } = await load('game/data/weapons.js');
const { BODY_SCALE } = await load('game/Config.js');
const { newPose, standPose, muzzleIn, muzzleAt, MUZZLE_IN } = await load('game/entities/CharacterAnim.js');
const { default: Character } = await load('game/entities/Character.js');

const K = 0.5;                  // world px per sprite px: the weapons are painted at twice the density (Assets.js)
const OUTLINE = [20, 12, 28];   // tools/generate_assets.py OUTLINE, the dark line round every sprite
const GUNS = Object.entries(WEAPONS).filter(([, d]) => d.kind === 'gun');

// a sprite as the generator writes it: 8-bit RGBA, not interlaced. px(x, y) -> [r, g, b, a]
function readPng(name) {
  const buf = readFileSync(new URL(`../assets/sprites/${name}.png`, import.meta.url));
  let at = 8, w = 0, h = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), type = buf.toString('ascii', at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      assert.deepEqual([data[8], data[9], data[12]], [8, 6, 0], `${name}: 8-bit RGBA, not interlaced`);
    } else if (type === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), row = w * 4, out = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1));
    for (let i = 0; i < row; i++) {
      const a = i >= 4 ? out[y * row + i - 4] : 0, b = y ? out[(y - 1) * row + i] : 0, c = y && i >= 4 ? out[(y - 1) * row + i - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      out[y * row + i] = (src[i] + pred) & 255;
    }
  }
  return { w, h, px: (x, y) => [...out.subarray(y * row + x * 4, y * row + x * 4 + 4)] };
}

test('muzzle: every gun fires from the end of its drawn barrel, on the line through the middle of it', () => {
  for (const [id, d] of GUNS) {
    const { w, h, px } = readPng(d.sprite);
    const steel = (x, y) => y >= 0 && y < h && x < w && px(x, y)[3] > 0 && px(x, y).slice(0, 3).join() !== OUTLINE.join();
    const col = w - 1 - MUZZLE_IN / K, line = h / 2 + (d.bore ?? 0) / K;   // sprite px
    const row = Number.isInteger(line) && !steel(col, line) ? line - 1 : Math.floor(line);
    assert.ok(steel(col, row), `${id}: no barrel at the muzzle (${col}, ${row})`);
    assert.ok(!steel(col + 1, row), `${id}: the barrel goes on past the muzzle`);
    let top = row, bottom = row;
    while (steel(col, top - 1)) top--;
    while (steel(col, bottom + 1)) bottom++;
    assert.ok(Math.abs((top + bottom + 1) / 2 - line) <= 0.25, `${id}: bore line ${line} off the middle of the muzzle (rows ${top}..${bottom})`);
  }
});

test('muzzle: muzzleIn is the point the drawn weapon ends at, whatever the pose', () => {
  const P = newPose(), out = {};
  for (const [id, d] of GUNS) {
    const { w, h } = readPng(d.sprite);
    for (const [a, s, len, thick] of [[0, 1, 1, 1], [2.2, 1.04, 0.75, 1.1], [-1.3, 0.96, -0.6, 1]]) {
      P.wpn.x = 3; P.wpn.y = -2; P.wpn.a = a; P.s = s; P.wpnLen = len; P.wpnS = thick;
      muzzleIn(P, d, w * K, out);
      // CharacterAnim drawWeapon: at P.wpn, turned by P.wpn.a, scaled (len, wpnS) x P.s x K, the image's left edge
      // grip / K px behind and its middle line palm / K px above (a handgun held on its side: the fist is under the
      // slide); the muzzle is the right edge of its last barrel column, on the bore line
      const top = -h / 2 - (d.palm ?? 0) / K;
      const u = ((w - 1) - d.grip / K) * len * s * K, v = (top + h / 2 + (d.bore ?? 0) / K) * thick * s * K;
      const x = 3 + u * Math.cos(a) - v * Math.sin(a), y = -2 + u * Math.sin(a) + v * Math.cos(a);
      assert.ok(Math.hypot(out.x - x, out.y - y) < 1e-9 && out.a === a, `${id} at ${a}`);
    }
  }
});

test('muzzle: a character fires from his gun as last drawn, and it turns with his aim until he is drawn again', () => {
  const P = newPose(), want = {};
  P.wpnOn = true; P.wpn.x = 6; P.wpn.y = 2.5; P.wpn.a = 0.5; P.s = 1; P.wpnLen = 1; P.wpnS = 1;
  for (const [, d] of GUNS) {
    const ch = { def: d, x: 100, y: 40, angle: 0.45 };
    Character.prototype.noteMuzzle.call(ch, P);
    const m = Character.prototype.muzzlePos.call(ch);
    muzzleIn(P, d, 8, want);   // 8: the placeholder sprite drawn when no image is loaded
    assert.ok(Math.hypot(m.x - (100 + want.x * BODY_SCALE), m.y - (40 + want.y * BODY_SCALE)) < 1e-9);
    assert.ok(Math.abs(m.a - 0.5) < 1e-9);
    ch.angle += 1;
    const t = Character.prototype.muzzlePos.call(ch), c = Math.cos(1), s = Math.sin(1);
    const rx = 100 + (m.x - 100) * c - (m.y - 40) * s, ry = 40 + (m.x - 100) * s + (m.y - 40) * c;
    assert.ok(Math.hypot(t.x - rx, t.y - ry) < 1e-9 && Math.abs(t.a - 1.5) < 1e-9);
  }
  // another gun in hand than the one drawn: where it is when raised, along the aim
  const ch = { def: WEAPONS.pistol, x: 0, y: 0, angle: 0, muzzleNote: { def: WEAPONS.rifle, x: 0, y: 0, da: 0 } };
  const m = Character.prototype.muzzlePos.call(ch);
  assert.ok(m.x > 10 && Math.abs(m.y) < 5 && m.a === 0);
});

// a man standing still, the gun in his hand raised on a target straight ahead (CharacterAnim standPose's inputs)
const standing = (d) => ({
  def: d, angle: 0, gait: 0, runK: 0, strideV: 0, walk: 0, strideA: 0, footA: 0, backward: false, lean: { x: 0, y: 0 },
  recoil: 0, lower: 0, stow: 0, reloading: 0, reloadDur: 1, swing: 0, tell: 0, pickAnim: 0, grab: null, held: null,
  isPlayer: true, breath: 0, world: { time: 0 },
});

test('muzzle: where a gun is raised on a target (muzzleAt) is where the standing pose draws it', () => {
  const P = newPose(), out = {};
  for (const [id, d] of GUNS) {
    const w = readPng(d.sprite).w * K;
    muzzleIn(standPose(standing(d), P), d, w, out);
    const m = muzzleAt(d, w);
    assert.ok(Math.hypot(out.x - m.x, out.y - m.y) < 1e-9, `${id}: drawn at (${out.x}, ${out.y}), expected at (${m.x}, ${m.y})`);
    assert.ok(P.fist === (d.hold === 'side'), `${id}: the hand closed on the grip only for a handgun`);
  }
});

test('muzzle: a handgun held on its side shows its slide and barrel out of the fist, and hides its grip in it', () => {
  const side = GUNS.filter(([, d]) => d.hold === 'side');
  assert.deepEqual(side.map(([id]) => id).sort(), ['pistol', 'uzi', 'uzi_silenced']);
  for (const [id, d] of side) {
    const { w, h, px } = readPng(d.sprite);
    assert.ok(typeof d.palm === 'number' && typeof d.hide === 'number', `${id}: palm and hide`);
    const cut = Math.round(h / 2 + d.hide / K), opaque = (x, y) => px(x, y)[3] > 0;
    // the barrel and the muzzle are above the cut, and so is the whole muzzle column
    let low = -1;
    for (let y = 0; y < h; y++) if (opaque(w - 1 - MUZZLE_IN / K, y)) low = y;
    assert.ok(low >= 0 && low < cut, `${id}: the muzzle (down to row ${low}) is cut at row ${cut}`);
    // there is a grip under the cut (that is what the hand hides), round the grip point
    let under = 0;
    for (let y = cut + 1; y < h; y++) for (let x = Math.floor(d.grip / K) - 2; x <= d.grip / K + 2; x++) under += opaque(x, y);
    assert.ok(under > 6, `${id}: no grip under the cut`);
    // the fist sits under the cut, its top edge on it (a fist is about 3 px across)
    assert.ok(d.palm > d.hide && d.palm - d.hide < 1.6, `${id}: the fist (palm ${d.palm}) does not close on the cut (${d.hide})`);
  }
});
