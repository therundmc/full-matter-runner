// Reloading a magazine gun: the old magazine leaves through the gun's well (weapons.js `well`, the gun's `_bare`
// sprite), falls and lands by him with its rounds, the free hand brings the fresh one up into the well, then works the
// action; a reload cut short at any beat loses or doubles no magazine and no round. The sprites are read from the
// files (sizes and pixels), as the browser would load them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { load } from './setup.mjs';

const ROOT = new URL('../', import.meta.url);

// an RGBA png (as tools/generate_assets.py writes them): { w, h, alpha(x, y) }
function png(name) {
  const b = readFileSync(new URL(`assets/sprites/${name}.png`, ROOT));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), parts = [];
  for (let o = 8; o < b.length;) {
    const n = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8);
    if (type === 'IDAT') parts.push(b.subarray(o + 8, o + 8 + n));
    o += 12 + n;
  }
  assert.equal(b[25], 6, `${name}: not RGBA`);
  const raw = inflateSync(Buffer.concat(parts)), row = w * 4, px = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1));
    for (let x = 0; x < row; x++) {
      const a = x >= 4 ? px[y * row + x - 4] : 0, up = y ? px[(y - 1) * row + x] : 0, c = x >= 4 && y ? px[(y - 1) * row + x - 4] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
      px[y * row + x] = (src[x] + pred) & 255;
    }
  }
  return { w, h, alpha: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[(Math.floor(y) * w + Math.floor(x)) * 4 + 3]) };
}

// the sprites, loaded as the browser does (sizes from the files)
globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
globalThis.Image = class {
  set src(v) {
    const f = new URL(v, ROOT);
    if (!existsSync(f)) { queueMicrotask(() => this.onerror?.()); return; }
    const b = readFileSync(f);
    this.width = b.readUInt32BE(16); this.height = b.readUInt32BE(20);
    queueMicrotask(() => this.onload?.());
  }
};
const { loadAssets, spriteOpt, sw, sh } = await load('engine/Assets.js');
await loadAssets();
const { BODY_SCALE } = await load('game/Config.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { RELOAD } = await load('game/data/feel.js');
const { newPose, standPose, looseMagIn } = await load('game/entities/CharacterAnim.js');
const { default: Character } = await load('game/entities/Character.js');
const { default: Player } = await load('game/entities/Player.js');

const MAG_GUNS = Object.entries(WEAPONS).filter(([, d]) => d.kind === 'gun' && !d.shellReload);
const L = RELOAD.mag, DT = 1 / 60;

test('reload: every magazine gun has a well at its sprite\'s magazine, a bare sprite without it, a rack on its action', () => {
  assert.ok(MAG_GUNS.length >= 5);
  for (const [id, d] of MAG_GUNS) {
    assert.ok(d.magSprite && spriteOpt(d.magSprite), `${id}: no magazine sprite`);
    assert.ok(Array.isArray(d.well) && d.well.length === 4, `${id}: well = [x, y, rake, depth]`);
    const name = d.sprite.slice('weapons/'.length), full = png(`weapons/${name}`), bare = png(`weapons/${name}_bare`);
    const k = spriteOpt(d.sprite).k, [x, y, rake, depth] = d.well, mx = x / k, my = full.h / 2 + y / k;
    assert.equal(k, 0.5, `${id}: finer than the world`);
    assert.deepEqual([bare.w, bare.h], [full.w, full.h], `${id}: the bare sprite is not the gun's size`);
    // just past the mouth the gun shows its magazine, and the bare gun nothing; just inside it, the gun in both
    const out = [mx + Math.sin(rake) * 1.5, my + Math.cos(rake) * 1.5], inn = [mx - Math.sin(rake) * 1.5, my - Math.cos(rake) * 1.5];
    assert.ok(full.alpha(...out) > 0, `${id}: no magazine past the well's mouth`);
    assert.equal(bare.alpha(...out), 0, `${id}: the bare gun still shows a magazine`);
    assert.ok(full.alpha(...inn) > 0 && bare.alpha(...inn) > 0, `${id}: the mouth is not on the gun`);
    // the two sprites differ only past the mouth: what is taken out is the magazine under the well
    for (let py = 0; py < full.h; py++) {
      for (let px = 0; px < full.w; px++) {
        if (!full.alpha(px + 0.5, py + 0.5) === !bare.alpha(px + 0.5, py + 0.5)) continue;
        const along = (px + 0.5 - mx) * Math.sin(rake) + (py + 0.5 - my) * Math.cos(rake);
        assert.ok(along > -1.6, `${id}: the bare sprite differs at (${px}, ${py}), inside the gun`);
      }
    }
    // the magazine: about as wide as the well, long enough to show under the gun once seated
    const img = spriteOpt(d.magSprite), stub = sh(img) - depth;
    assert.ok(sw(img) <= 5 && depth > 0 && stub >= 0.8 && stub <= 3.5, `${id}: magazine ${sw(img)} x ${sh(img)}, seated ${depth}`);
    // the action: taken hold of on the gun, worked one way and let go
    assert.ok(d.rack.length >= 3, `${id}: rack path`);
    for (const [rx, ry] of d.rack) assert.ok(rx >= 0 && rx <= full.w * k && Math.abs(ry) <= full.h * k / 2 + 1, `${id}: rack off the gun`);
    const [x0, y0] = d.rack[0], far = Math.max(...d.rack.map(([rx, ry]) => Math.hypot(rx - x0, ry - y0)));
    assert.ok(far >= 1.5, `${id}: the action does not move`);
  }
});

test('reload: the magazine timeline runs in order and the old magazine is in the air a believable moment', () => {
  const order = [0, L.release, L.drop, L.belt[0], L.belt[1], L.insert, L.seat, L.rack[0], L.rack[1], 1];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `RELOAD.mag out of order at ${i}`);
  const air = (-L.vz + Math.sqrt(L.vz * L.vz + 2 * 520 * L.fall)) / 520;
  assert.ok(air > 0.12 && air < 0.35, `in the air ${air} s`);
  // it slides out in a few frames at least, for every gun
  for (const [id, d] of MAG_GUNS) assert.ok((L.drop - L.release) * d.reload * 60 >= 6, `${id}: slides out too fast to see`);
});

// a man standing, facing east, a gun in hand, in a world that keeps what he drops
function shooter(type, mag, reserve, player = false) {
  const debris = [], ammoItems = [], items = [], sounds = [];
  const world = {
    time: 0, debris, ammoItems, items, sounds,
    sound: (name) => sounds.push(name),
    addBody() {}, removeBody() {},
    addDebris: (d) => debris.push(d),
    removeDebris: (d) => { d.dead = true; },
    addItem: (it) => items.push(it),
    events: { emit() {} }, pickupFlash() {},
  };
  const ch = Object.create((player ? Player : Character).prototype);
  Object.assign(ch, {
    world, alive: true, knocked: 0, angle: 0, gait: 0, runK: 0, strideV: 0, walk: 0, strideA: 0, footA: 0, backward: false,
    lean: { x: 0, y: 0 }, recoil: 0, lower: 0, stow: 0, swing: 0, tell: 0, pickAnim: 0, grab: null, held: null, isPlayer: player,
    breath: 0, reloading: 0, reloadDur: 1, reloadStage: 0, shellsIn: 0, racking: 0, pose: newPose(), muzzleNote: null,
    body: Matter.Bodies.circle(100, 100, 8), ammo: { '9mm': 0, '762': 0, '12g': 0, rocket: 0 },
  });
  ch.setWeapon(type, mag, reserve);
  return { ch, world };
}

// one frame: he is drawn (his pose noted, as Character.draw does), then the world moves on
function frame(ch, world) {
  const P = standPose(ch, ch.pose);
  ch.noteMuzzle(P);
  world.time += DT;
  ch.updateReload(DT);
  for (const d of world.debris) if (!d.dead) d.update(DT);
  return P;
}

const rounds = (ch, world, perMag) => ch.weapon.mag + ch.weapon.reserve * perMag
  + world.ammoItems.reduce((n, a) => n + a.rounds, 0);

test('reload: the old magazine leaves the gun at its beat, from the well, and lands by him with its rounds', () => {
  for (const [id, d] of MAG_GUNS) {
    const { ch, world } = shooter(id, 3, 2);
    assert.ok(ch.reload());
    let t = 0, dropT = null, P = null, at = null;
    while (ch.reloading > 0) {
      const before = world.debris.length;
      P = frame(ch, world);
      t += DT;
      const p = t / d.reload;
      if (world.debris.length > before) {
        dropT = t;
        at = { ...world.debris[0].body.position };
        // it goes at the beat, not before, and the gun is bare from then
        assert.ok(p > L.drop && p - DT / d.reload <= L.drop + 1e-9, `${id}: dropped at ${p}`);
        assert.equal(ch.weapon.mag, 0); assert.equal(ch.weapon.bare, true);
        // where it was last drawn: just out of the well, to the gun's right (+y facing east), a hand's reach away
        const m = looseMagIn(P, d, {}), mx = ch.x + m.x * BODY_SCALE, my = ch.y + m.y * BODY_SCALE + L.fall * L.lift;
        assert.ok(Math.hypot(at.x - mx, at.y - my) < 0.01, `${id}: not dropped where it was drawn`);
        assert.ok(m.y > 0, `${id}: the magazine does not come out on the gun's grip side`);
        const r = Math.hypot(at.x - ch.x, at.y - ch.y);
        assert.ok(r > 6 && r < 30, `${id}: dropped ${r} px from him`);
      }
      if (p < L.drop) assert.equal(ch.weapon.mag, 3, `${id}: the rounds left the gun before the magazine`);
      if (p > L.release + DT && p < L.drop) assert.ok(P.magIn !== null && P.bare, `${id}: the magazine does not show sliding out`);
    }
    assert.ok(dropT, `${id}: nothing dropped`);
    // it lands (heard) a moment later, by the spot it left from, a magazine to pick up with its 3 rounds
    for (let i = 0; i < 60 && !world.ammoItems.length; i++) frame(ch, world);
    assert.equal(world.ammoItems.length, 1, `${id}: no magazine on the floor`);
    const it = world.ammoItems[0];
    assert.equal(it.rounds, 3);
    assert.equal(world.sounds.filter((s) => s === 'magLand').length, 1);
    assert.ok(world.debris[0].dead, `${id}: the falling one is still there`);
    assert.ok(Math.hypot(it.x - at.x, it.y - at.y) < 8, `${id}: landed ${Math.hypot(it.x - at.x, it.y - at.y)} px off`);
    assert.ok(it.scale > 1 && it.scale <= BODY_SCALE, `${id}: on the floor at ${it.scale}`);
    assert.deepEqual(world.sounds.filter((s) => s !== 'magLand'), ['magOut', 'magIn', 'rack']);
    assert.equal(ch.weapon.mag, d.mag); assert.equal(ch.weapon.bare, false); assert.equal(ch.weapon.reserve, 1);
  }
});

test('reload: an empty magazine lands as a piece of the floor, nothing to pick up', () => {
  const { ch, world } = shooter('rifle', 0, 2);
  ch.reload();
  for (let i = 0; i < 150; i++) frame(ch, world);
  assert.equal(world.debris.length, 1);
  assert.ok(!world.debris[0].dead && world.debris[0].z === 0, 'not lying on the floor');
  assert.equal(world.ammoItems.length, 0);
  assert.ok(world.sounds.includes('magLand'));
});

test('reload: the free hand goes to the belt, brings the fresh magazine up into the well, then onto the action', () => {
  for (const [id, d] of MAG_GUNS) {
    const { ch, world } = shooter(id, 3, 2);
    ch.reload();
    const seen = { carried: false, pushed: [], racked: 0 };
    let t = 0;
    while (ch.reloading > 0) {
      const P = frame(ch, world);
      t += DT;
      const p = (t - DT) / d.reload; // the pose was drawn before the clock moved
      if (p > L.belt[0] + 0.01 && p < L.belt[1]) assert.ok(Math.hypot(P.hl.x - 1, P.hl.y + 6.5) < 4, `${id}: the hand is not at the belt`);
      if (P.carryImg) seen.carried = true;
      if (p > L.insert + 0.01 && p < L.seat - 0.01) seen.pushed.push(P.magIn);
      if (p > L.rack[0] && p < L.rack[1]) seen.racked++;
      if (p > L.drop + 0.02 && p < L.seat) assert.ok(P.bare, `${id}: the gun shows its magazine while it is out`);
      if (p > L.seat + 0.02) assert.ok(!P.bare && P.magIn === null, `${id}: the magazine is still shown loose`);
    }
    assert.ok(seen.carried, `${id}: the fresh magazine never shows in the hand`);
    assert.ok(seen.pushed.length > 3 && seen.pushed.every((v, i, a) => !i || v >= a[i - 1]), `${id}: not pushed home`);
    assert.ok(seen.racked > 3, `${id}: the action is not worked`);
  }
});

test('reload: cut short at any beat, no magazine or round is lost or doubled, and the next reload finishes it', () => {
  for (const [id, d] of MAG_GUNS) {
    for (const cut of [0.02, 0.1, 0.25, 0.5, 0.62, 0.7, 0.8]) {
      const { ch, world } = shooter(id, 3, 2);
      const total = rounds(ch, world, d.mag);
      ch.reload();
      let t = 0;
      while ((t += DT) / d.reload < cut) frame(ch, world);
      ch.reloading = 0; // a shot, a dive, a slip, a death: any of them stops the clock where it is
      for (let i = 0; i < 60; i++) frame(ch, world);
      const dropped = world.debris.length;
      assert.ok(dropped <= 1, `${id} cut at ${cut}: ${dropped} magazines out`);
      assert.equal(ch.weapon.bare, dropped === 1 && cut < L.seat, `${id} cut at ${cut}: bare`);
      assert.equal(rounds(ch, world, d.mag), total, `${id} cut at ${cut}: rounds`);
      // reloaded again (when it still needs it): one magazine out in all, the gun full
      if (ch.reload()) while (ch.reloading > 0) frame(ch, world);
      for (let i = 0; i < 60; i++) frame(ch, world);
      assert.equal(world.debris.length, 1, `${id} cut at ${cut}: magazines out in all`);
      assert.equal(ch.weapon.mag, d.mag);
      assert.equal(ch.weapon.bare, false);
      assert.equal(rounds(ch, world, d.mag), total, `${id} cut at ${cut}: rounds after`);
    }
  }
});

test('reload: a gun let go with its magazine out is bare on the floor and for whoever takes it', () => {
  const { ch, world } = shooter('uzi', 3, 2, true);
  ch.ammo['9mm'] = 60;
  ch.reload();
  for (let t = 0; t / WEAPONS.uzi.reload < 0.4; t += DT) frame(ch, world);
  assert.equal(ch.weapon.bare, true);
  ch.reloading = 0;
  ch.dropWeapon(0, 1);
  const it = world.items[0];
  assert.ok(it.bare && it.mag === 0, 'the gun on the floor has its magazine');
  // the player takes it back: his reload has no magazine to drop, only the fresh one to seat
  ch.take(it.type, it.mag, it.wear, it.bare);
  assert.equal(ch.weapon.bare, true);
  const out = world.debris.length;
  assert.ok(ch.reload());
  while (ch.reloading > 0) frame(ch, world);
  assert.equal(world.debris.length, out, 'a second magazine dropped');
  assert.equal(ch.weapon.mag, 30);
  assert.equal(ch.ammo['9mm'], 30);
});
