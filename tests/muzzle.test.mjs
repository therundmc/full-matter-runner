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
const { CANT, cantRows, cantHide, cantPalm } = await load('game/render/HandgunArt.js');

const K = 0.5;                  // world px per sprite px: the weapons are painted at twice the density (Assets.js)
const OUTLINE = [20, 12, 28];   // tools/sprites/core.py OUTLINE, the dark line round every sprite
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
    for (const fist of d.hide === undefined ? [false] : [false, true])
      for (const [a, s, len, thick] of [[0, 1, 1, 1], [2.2, 1.04, 0.75, 1.1], [-1.3, 0.96, -0.6, 1]]) {
        P.wpn.x = 3; P.wpn.y = -2; P.wpn.a = a; P.s = s; P.wpnLen = len; P.wpnS = thick; P.fist = fist;
        muzzleIn(P, d, w * K, out);
        // CharacterAnim drawWeapon: at P.wpn, turned by P.wpn.a, scaled (len, wpnS) x P.s x K, the image's left edge
        // grip / K px behind and its middle line palm / K px above (a handgun: the fist is under the slide). In the
        // fist a handgun is its canted image, CANT.pad rows taller each side, the fist at cantPalm; its barrel rows
        // stay on the sprite's (next test). The muzzle is the right edge of its last barrel column, on the bore line.
        const H = fist ? h + 2 * CANT.pad : h, top = -H / 2 - (fist ? cantPalm(d) : d.palm ?? 0) / K;
        const row = (fist ? CANT.pad : 0) + h / 2 + (d.bore ?? 0) / K;
        const u = ((w - 1) - d.grip / K) * len * s * K, v = (top + row) * thick * s * K;
        const x = 3 + u * Math.cos(a) - v * Math.sin(a), y = -2 + u * Math.sin(a) + v * Math.cos(a);
        assert.ok(Math.hypot(out.x - x, out.y - y) < 1e-9 && out.a === a, `${id} at ${a}${fist ? ' in the fist' : ''}`);
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

test('muzzle: a machine pistol held on its side shows its slide and barrel out of the fist, and hides its grip in it', () => {
  const side = GUNS.filter(([, d]) => d.hold === 'side');
  assert.deepEqual(side.map(([id]) => id).sort(), ['uzi', 'uzi_silenced']);
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

test('muzzle: a handgun in the fist is drawn canted, its barrel where it was, the top of its slide over its side', () => {
  for (const [id, d] of GUNS.filter(([, g]) => g.hide !== undefined)) {
    const { w, h, px } = readPng(d.sprite), on = (x, y) => y >= 0 && y < h && px(x, y)[3] > 0;
    // the slide's top outline: the row most columns start on (as HandgunArt finds it)
    const count = new Array(h).fill(0);
    for (let x = 0; x < w; x++) { let y = 0; while (y < h && !on(x, y)) y++; if (y < h) count[y]++; }
    const rim = count.indexOf(Math.max(...count)), P = CANT.pad;
    const { map, band, cut, cutFrom } = cantRows(h, K, d, rim);
    assert.equal(map.length, h + 2 * P, `${id}: as tall as the sprite and the padding`);
    // the side turns about the bore: the row under the bore line stays in place, and so do the barrel and its muzzle
    const line = h / 2 + d.bore / K, under = Math.ceil(line - 0.5);
    assert.equal(map[P + under], under, `${id}: row ${under} moved`);
    const col = w - 1 - MUZZLE_IN / K;
    assert.ok(on(col, map[P + Math.floor(line)]) || on(col, map[P + Math.floor(line) - 1]), `${id}: no muzzle on the bore line`);
    // the side is squashed toward the bore: less of it shows, its top edge first, the band of the slide's top over it
    const side = map.slice(band[1], cut).filter((y) => y >= 0);
    assert.ok(side.length < cutFrom - rim - 1 && side.length >= (cutFrom - rim - 1) * CANT.f - 1, `${id}: ${side.length} rows of side`);
    assert.equal(map[band[1]], rim + 1, `${id}: the side starts with its top edge`);
    assert.ok(band[1] - band[0] === Math.round(d.deck / K) && map.slice(...band).every((y) => y === -1), `${id}: the band`);
    assert.equal(map[band[0] - 1], rim, `${id}: the outline over the band`);
    // the fist closes on the cut as it does side-on, and the cut is where the pose puts it
    assert.equal(cut - P, Math.round(h / 2 + cantHide(d) / K), `${id}: cut row`);
    assert.ok(Math.abs(cantPalm(d) - cantHide(d) - (d.palm - d.hide)) < 1e-9 && cantPalm(d) < d.palm, `${id}: the fist comes up`);
    assert.ok(map.slice(cut + 1).every((y) => y === -1), `${id}: something shows under the fist`);
  }
});

test('muzzle: a machine pistol raised on a target is held with the elbow bent, the fist pulled in', () => {
  const P = newPose();
  for (const [id, d] of GUNS.filter(([, g]) => g.hold === 'side')) {
    standPose(standing(d), P);
    const reach = Math.hypot(P.hr.x, P.hr.y);
    assert.ok(P.elb[1] >= 0.4, `${id}: elbow out ${P.elb[1]}`);
    assert.ok(reach < 13, `${id}: the fist ${reach.toFixed(2)} px out`);
  }
});

// a closed hand as LimbArt paints it, outline included (world px, half length along the gun and half width across;
// its squareness)
const FIST = [2.1, 1.95, 2.4];

test('muzzle: a pistol is held out in both hands, on its grip up to the trigger guard (the user), the slide and barrel ahead', () => {
  const both = GUNS.filter(([, d]) => d.hold === 'both');
  assert.deepEqual(both.map(([id]) => id), ['pistol']);
  for (const [id, d] of both) {
    const { w, h, px } = readPng(d.sprite), P = standPose(standing(d), newPose());
    assert.ok(!P.fist && P.wpnLen === 1, `${id}: level, drawn side on as it is`);
    // the arms a narrow triangle: both hands out in front, together, the left one from the left
    assert.ok(P.hr.x > 9 && P.hl.x > 9 && Math.hypot(P.hl.x - P.hr.x, P.hl.y - P.hr.y) < 2.5 && P.hl.y < P.hr.y, `${id}: the hands`);
    // the hands in the gun's frame (world px from the gun hand along the barrel, and across it)
    const c = Math.cos(P.wpn.a), s = Math.sin(P.wpn.a);
    const hands = [P.hr, P.hl].map((H) => {
      const dx = (H.x - P.wpn.x) / P.s, dy = (H.y - P.wpn.y) / P.s;
      return [dx * c + dy * s, -dx * s + dy * c];
    });
    const under = (x, y) => {
      const u = (x + 0.5) * K - d.grip, v = (y + 0.5 - h / 2) * K - d.palm;
      return hands.some(([hu, hv]) => (Math.abs(u - hu) / FIST[0]) ** FIST[2] + (Math.abs(v - hv) / FIST[1]) ** FIST[2] <= 1);
    };
    // the wooden grips under the hands or just behind them (the back of the grip shows past the web of the hand), the
    // hands reaching the trigger guard ahead of the grips (the trigger finger in it), never over the slide nor the barrel
    const back = Math.min(...hands.map(([hu]) => hu)) / K + d.grip / K;
    const bore = Math.floor(h / 2 + d.bore / K);
    let front = -1, wood = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b, a] = px(x, y);
        if (a && r > g && r - b > 40) { wood++; front = Math.max(front, x); assert.ok(under(x, y) || x + 0.5 < back, `${id}: the grip shows ahead of the hands at (${x}, ${y})`); }
      }
    }
    assert.ok(wood > 20, `${id}: no wooden grips found`);
    let guard = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (y <= bore) assert.ok(!under(x, y), `${id}: a hand over the slide at (${x}, ${y})`);
        if (x > front + 1 && x <= front + 4 && y > bore && under(x, y)) guard++;
        if (x > front + 8) assert.ok(!under(x, y), `${id}: a hand over the barrel at (${x}, ${y})`);
      }
    }
    assert.ok(guard > 0, `${id}: the hands stop short of the trigger guard`);
  }
});

test('muzzle: a man never drawn (off the picture, headless) fires from his barrel in the pose of the step, as a draw would note it', () => {
  for (const [id, d] of GUNS) {
    const man = () => {
      const { def, ...st } = standing(d);
      return Object.assign(Object.create(Character.prototype), st, { weapon: { type: id, mag: 1 }, body: { position: { x: 300, y: 120 } }, angle: 0.3, lower: 1, pose: newPose(), pose2: newPose() });
    };
    const ch = man();
    const raised = Character.prototype.muzzlePos.call(ch); // (nothing noted: where it is when raised on a target)
    const m = ch.stepMuzzle();
    const drawn = man();
    drawn.noteMuzzle(standPose(drawn, drawn.pose)); // (what the draw notes)
    const n = drawn.muzzlePos();
    assert.ok(Math.hypot(m.x - n.x, m.y - n.y) < 1e-9 && Math.abs(m.a - n.a) < 1e-9, `${id}: the drawn barrel`);
    assert.ok(Math.hypot(m.x - raised.x, m.y - raised.y) > 1, `${id}: carried low, not where it is raised`);
  }
});
