import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Audio } = await load('audio/Audio.js');
const { default: Music } = await load('audio/Music.js');
const { default: Tension } = await load('game/ai/Tension.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { MATERIAL_FX } = await load('game/data/destruction.js');
const { BANK } = await load('audio/bank.js');

// Minimal strict WebAudio stand-in: records every node and rejects what a browser would throw on
// (non-finite values, exponential ramps to <= 0) and counts sources started. With `noPast` set, anything
// scheduled before currentTime fails too.
function mockContext() {
  const ctx = { currentTime: 0, sampleRate: 8000, state: 'running', started: 0, stopped: 0, noPast: false };
  const when = (t) => Number.isFinite(t) && t >= (ctx.noPast ? ctx.currentTime : 0);
  const param = (v = 0) => ({
    value: v,
    setValueAtTime(x, t) { assert.ok(Number.isFinite(x) && when(t)); },
    linearRampToValueAtTime(x, t) { assert.ok(Number.isFinite(x) && when(t)); },
    exponentialRampToValueAtTime(x, t) { assert.ok(x > 0 && when(t), `exp ramp to ${x}`); },
    setTargetAtTime(x, t, tau) { assert.ok(Number.isFinite(x) && when(t) && tau > 0, `target at ${t}, now ${ctx.currentTime}`); },
    cancelScheduledValues() {},
  });
  const node = (extra = {}) => ({ connect: (n) => n, disconnect() {}, ...extra });
  const source = (extra) => node({
    ...extra,
    start(t = ctx.currentTime) { assert.ok(when(t), `start at ${t}, now ${ctx.currentTime}`); ctx.started++; },
    stop(t) { assert.ok(Number.isFinite(t)); ctx.stopped++; },
  });
  Object.assign(ctx, {
    destination: node(),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(350), Q: param(1), gain: param(0) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createWaveShaper: () => node(),
    createConvolver: () => node(),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createOscillator: () => source({ frequency: param(440), detune: param(0) }),
    createDelay: () => node({ delayTime: param(0) }),
    createChannelMerger: () => node(),
    createBufferSource: () => source({ playbackRate: param(1) }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  });
  return ctx;
}

const FOLEY = { duration: 80 }; // stands for the decoded foley bank

function withContext(fn, buffers = { foley: FOLEY }) {
  const ctx = mockContext();
  Audio.ctx = ctx;
  Audio.active = [];
  Audio.lastPlay = {};
  Audio.buffers = buffers;
  Audio._build(ctx);
  fn(ctx);
  Audio.ctx = null;
  Audio.buffers = {};
}

test('audio: every weapon sound, reload and handling sound builds valid nodes for every weapon', () => {
  withContext((ctx) => {
    for (const [type, d] of Object.entries(WEAPONS)) {
      ctx.currentTime += 2; // past every rate limit and voice
      const before = ctx.started;
      Audio.play(d.sound, { x: 0, y: 0 });
      assert.ok(ctx.started > before, `${type}: '${d.sound}' played nothing`);
      if (d.kind !== 'gun') continue;
      for (const name of ['magOut', 'magIn', 'rack', 'shellIn', 'handle', 'click', 'pickup']) {
        ctx.currentTime += 0.5;
        const n = ctx.started;
        Audio.play(name, { weapon: type, dur: d.reload });
        assert.ok(ctx.started > n, `${type}: ${name} played nothing`);
      }
    }
  });
});

test('audio: full auto from one shooter keeps a single live voice (choke), distant shots still play', () => {
  withContext((ctx) => {
    const shooter = {};
    for (let i = 0; i < 30; i++) {
      Audio.play('uzi', { x: 0, y: 0, choke: shooter });
      ctx.currentTime += 0.065;
    }
    assert.equal(Audio.active.filter((a) => a.name === 'uzi').length, 1);
    const n = ctx.started;
    Audio.play('rifle', { x: 2000, y: 0 });
    assert.ok(ctx.started > n, 'a rifle 2000 px away is still heard');
  });
});

test('audio: with the recordings loaded, every shot and the blast play a cut of them', () => {
  withContext((ctx) => {
    const buf = { duration: 1 }, played = [];
    Audio.buffers = { pistol: buf, rifle: buf, shotgun: buf, uzi: buf, foley: FOLEY };
    const make = ctx.createBufferSource;
    ctx.createBufferSource = () => {
      const s = make(), start = s.start;
      s.start = (...a) => { if (s.buffer === buf) played.push(a); start(...a); };
      return s;
    };
    for (const name of ['pistol', 'uzi', 'shotgun', 'rifle', 'sniper', 'explosion']) {
      ctx.currentTime += 3;
      const n = played.length;
      Audio.play(name, { x: 0, y: 0 });
      assert.ok(played.length > n, `${name}: no recording played`);
    }
  });
});

// every other sound the game asks for (world.sound / Audio.play call sites, material tables)
const GAME_SOUNDS = [
  ...Object.values(MATERIAL_FX).flatMap((fx) => [fx.hit, fx.crush]), 'stone', 'flesh', 'impact', 'shell',
  'punch', 'splat', 'gore', 'slash', 'death', 'bodyFall', 'shout', 'cry', 'grab', 'neck', 'whimper', 'scream', 'glass', 'crumble', 'doorBreak', 'explosion',
  'tirePop', 'carHit', 'door', 'doorSlam', 'creak', 'vault', 'climb', 'slide', 'splash', 'throw', 'swing', 'ricochet', 'ammo',
  'alarm', 'crackle', 'ignite', 'confirm', 'clear', 'ui', 'passby', 'pool',
];

test('audio: every sound the game asks for plays, from a cut that lies inside the foley bank', () => {
  const end = Math.max(...Object.values(BANK).flat().map(([at, len]) => at + len));
  withContext((ctx) => {
    const make = ctx.createBufferSource;
    ctx.createBufferSource = () => {
      const s = make(), start = s.start;
      s.start = (t, at = 0, len = 0) => {
        if (s.buffer === FOLEY) assert.ok(at >= 0 && len > 0 && at + len <= end + 0.05, `cut ${at} + ${len} outside the bank`);
        start(t);
      };
      return s;
    };
    for (const name of GAME_SOUNDS) {
      for (let i = 0; i < 12; i++) { // several times: every cut of a set comes up
        ctx.currentTime += 4;
        const n = ctx.started;
        Audio.play(name, { x: 30, y: 0, vol: 0.8, n: i });
        assert.ok(ctx.started > n, `'${name}' played nothing`);
      }
    }
  });
});

test('audio: without the foley bank nothing throws and silent sounds free their voice', () => {
  withContext((ctx) => {
    for (const name of [...GAME_SOUNDS, 'magOut', 'rack', 'click', 'silenced', 'shotgun']) {
      ctx.currentTime += 4;
      Audio.play(name, { x: 30, y: 0 });
    }
    ctx.currentTime += 4;
    Audio.play('wood', { x: 0, y: 0 });
    assert.equal(Audio.active.filter((a) => a.name === 'wood').length, 0);
  }, {});
});

// ---------------------------------------------------------------- soundtrack (audio/Music.js)
const BAR = 240 / 126;
const FIGHT = ['fight', 'chase']; // sections of the combat variant

// Plays the soundtrack on a mock context the way the game does (a tick every 100 ms, 0.3 s ahead) for `seconds`,
// running the scripted calls [time, fn(ctx)] on the way. Returns the bars planned: [{ t, name, bar, plan }].
function playMusic(seconds, script = [], intensity = 0.8) {
  const ctx = mockContext();
  ctx.noPast = true;
  const bars = [];
  Object.assign(Music, { ctx, dest: ctx.destination, playing: false, S: null, passes: {}, voicing: null });
  Music.setIntensity(intensity);
  Music.setCombat(false);
  Music.setCombo(0);
  Music.onBar = (plan, t) => bars.push({ t, name: plan.name, bar: plan.bar, plan });
  Music._open(ctx);
  const todo = script.slice();
  for (let now = 0; now < seconds; now = Math.max(now, ctx.currentTime) + 0.1) {
    ctx.currentTime = now;
    while (todo.length && todo[0][0] <= now) todo.shift()[1](ctx);
    Music._tick(ctx.currentTime + 0.3);
  }
  Object.assign(Music, { ctx: null, dest: null, playing: false, S: null, onBar: null });
  Music.setCombat(false);
  return bars;
}
const onGrid = (bars) => bars.every((b, i) => i === 0 || Math.abs(b.t - bars[i - 1].t - BAR) < 1e-9);

test('music: without a fight the song never plays its combat variant', () => {
  const bars = playMusic(100 * BAR, [[30, () => Music.setIntensity(1)]]);
  assert.ok(bars.length >= 99 && onGrid(bars));
  assert.ok(!bars.some((b) => FIGHT.includes(b.name)));
  assert.deepEqual(bars.slice(7, 9).map((b) => b.name + b.bar), ['verseA7', 'verseB0']);
});

test('music: no beat while all is quiet, a heartbeat when someone wonders, the beat when it kicks off', () => {
  const bars = playMusic(30 * BAR, [[10 * BAR, () => Music.setIntensity(0.55)], [20 * BAR, () => Music.setIntensity(0.75)]], 0.25);
  assert.ok(onGrid(bars));
  const of = (name) => bars.filter((b) => b.name === name);
  assert.ok(of('calm').length >= 9 && of('tense').length >= 9 && of('verseA').length >= 8);
  assert.deepEqual([...new Set(bars.map((b) => b.name))].slice(0, 3), ['calm', 'tense', 'verseA']);
  for (const { plan: p } of of('calm')) {
    assert.equal(p.kick.length + p.snare.length + p.hat.length + p.tom.length, 0, 'no drums');
    assert.ok(p.arp.length <= 2 && !p.bass.length && !p.lead.length && p.level <= 0.5, 'a few quiet plucks, nothing else');
  }
  assert.ok(of('calm').some((b) => b.plan.arp.length) && of('calm').some((b) => !b.plan.arp.length), 'bars of silence between them');
  for (const { plan: p } of of('tense')) assert.ok(p.kick.length === 2 && !p.snare.length, 'a heartbeat');
  assert.equal(of('verseA')[0].bar, 0, 'the song starts from its top');
  assert.ok(of('verseA').every((b) => b.plan.kick.length >= 4 && b.plan.snare.length >= 2));
  // a fight from the calm: cued, then the variant; it stays on its first section until it is hot
  const cold = playMusic(24 * BAR, [[5, () => Music.setCombat(true)]], 0.25);
  assert.ok(cold.some((b) => b.name === 'fight') && !cold.some((b) => b.name === 'chase'));
});

test('tension: the alert phase sets the floor, shots and kills heat the soundtrack up for a few seconds', () => {
  const t = new Tension();
  assert.ok(t.level('normal') < 0.45 && t.level('caution') >= 0.45 && t.level('caution') < 0.7, 'calm, then a heartbeat');
  assert.ok(t.level('evasion') >= 0.7 && t.level('alert') < 0.9, 'the beat; a fight is not hot by itself');
  t.bump('kill');
  assert.ok(t.level('normal') >= 0.45 && t.level('normal') < 0.7, 'a quiet kill: a heartbeat');
  assert.ok(t.level('alert') >= 0.9, 'a kill in a fight: hot');
  t.bump('kill');
  assert.ok(t.level('normal') >= 0.7, 'a massacre gets the beat, alert or not');
  for (let i = 0; i < 20 * 60; i++) t.update(1 / 60);
  assert.equal(t.heat, 0);
  for (let i = 0; i < 3; i++) t.bump('shot');
  assert.ok(t.level('alert') >= 0.9, 'a firefight is hot');
  t.bump('nothing');
  assert.ok(t.heat <= 1);
});

test('music: a fight is cued at once, takes over on the next bar line and hands back when the game calms down', () => {
  let cue = 0;
  const bars = playMusic(60, [
    [5, (ctx) => { cue = ctx.started; Music.setCombat(true); Music.setIntensity(1); Music.setCombo(5); }],
    [5.1, (ctx) => { cue = ctx.started - cue; }],
    [30, () => { Music.setCombat(false); Music.setIntensity(0.8); }],
  ]);
  assert.ok(onGrid(bars), 'every bar starts one bar after the previous one');
  assert.ok(cue >= 2, 'the cue (riser + roll) is scheduled by the tick that sees the fight');
  const first = bars.findIndex((b) => FIGHT.includes(b.name));
  const calm = bars.findIndex((b, i) => i > first && !FIGHT.includes(b.name));
  assert.equal(bars[first].name + bars[first].bar, 'fight0');
  assert.ok(bars[first].t > 5 && bars[first].t <= 5 + BAR + 0.3, 'on the first bar line not scheduled yet');
  assert.ok(bars[first].plan.impact && bars[first].plan.crash, 'the variant lands on an impact');
  assert.ok(bars[calm].t > 30 && bars[calm].t <= 30 + 2 * BAR + 0.3, 'hands back after one closing bar');
  assert.ok(bars[calm - 1].plan.tom.length || bars[calm - 1].plan.snare.length > 3, 'the closing bar ends on a fill');
  assert.equal(bars[calm].name + bars[calm].bar, 'break0');
  assert.ok(bars[calm].plan.down && bars[calm].plan.crash, 'the song resumes at its break, on a downlifter');
  assert.ok(!bars.slice(calm).some((b) => FIGHT.includes(b.name)));
  // the variant alternates its two sections; at the top of a chain every bar is dense, and on the 16-step grid
  assert.deepEqual([...new Set(bars.slice(first, calm).map((b) => b.name))], FIGHT);
  for (const b of bars.slice(first, calm)) {
    const p = b.plan;
    assert.ok(p.bass.length >= 12 && p.arp.length === 16 && p.lead.length >= 5 && p.stab.length >= 6 && p.kick.length >= 4, b.name + b.bar);
    for (const n of [...p.lead, ...p.bass, ...p.arp]) assert.ok(n.s >= 0 && n.s < 16 && n.m > 20 && n.m < 100);
    for (const n of p.lead) assert.ok(n.s + n.len <= 16, 'lead notes end inside their bar');
  }
});

test('music: a fight starts bare, every kill of a chain brings a layer and some volume, and they go one by one', () => {
  const kills = [1, 2, 3, 4, 5].map((n) => [(2 + 4 * n) * BAR, () => Music.setCombo(n)]);
  const bars = playMusic(40 * BAR, [[1, () => Music.setCombat(true)], ...kills, [26 * BAR, () => Music.setCombo(0)]], 0.85);
  const at = (stage) => bars.find((b) => b.name === 'fight' && b.plan.stage === stage && b.bar % 4 !== 3).plan;
  const bare = at(0);
  assert.ok(bare.kick.length === 4 && bare.hat.length === 4 && bare.hat.every((h) => h.ch === 'o' && h.s % 4 === 2), 'four on the floor, the open hat off the beat');
  assert.ok(bare.bass.length >= 4 && bare.bass.every((n) => n.s % 4), 'the bass between the kicks');
  assert.ok(!bare.snare.length && !bare.arp.length && !bare.stab.length && !bare.lead.length, 'and nothing else');
  assert.ok(at(1).snare.length >= 2 && !at(1).arp.length, 'the clap');
  assert.ok(at(2).arp.length === 16 && at(2).hat.length > 4 && !at(2).stab.length, 'the arp and the 16ths');
  assert.ok(at(3).stab.length >= 6 && !at(3).lead.length, 'the chopped pad');
  assert.ok(at(4).lead.length >= 5 && at(5).lead.length >= 5, 'the motif');
  for (let s = 1; s <= 5; s++) assert.ok(at(s).level > at(s - 1).level && at(s).e > at(s - 1).e, 'louder and brighter');
  assert.ok(at(5).level < at(0).level * 1.3, 'only a little louder');
  const down = bars.filter((b) => b.t > 26 * BAR).map((b) => b.plan.stage);
  assert.deepEqual(down.slice(0, 7).filter((s, i, a) => i === 0 || s !== a[i - 1]).slice(-5), [4, 3, 2, 1, 0], 'a step a bar');
});

test('music: at the top of a chain every fourth bar rolls into a crash, and the parts fade into one another', () => {
  const bars = playMusic(40 * BAR, [[1, () => Music.setCombat(true)], [2 * BAR, () => Music.setCombo(5)], [24 * BAR, () => { Music.setCombat(false); Music.setCombo(0); }]], 0.85);
  const hot = bars.filter((b) => FIGHT.includes(b.name) && b.plan.stage >= 4 && b.t < 24 * BAR);
  assert.ok(hot.length >= 8);
  for (const b of hot) {
    assert.equal(!!b.plan.roll, b.bar % 4 === 3, b.name + b.bar);
    if (b.plan.roll) assert.ok(b.plan.snare.every((h) => h.s < 8), 'the roll has the second half to itself');
    else if (b.bar % 4 === 0) assert.ok(b.plan.crash, 'and lands on a crash');
  }
  assert.ok(!bars.some((b) => b.plan.roll && b.plan.stage < 4), 'only at the top');
  const fade = (i) => bars[i].plan.fade;
  assert.deepEqual(fade(0), { from: 500, open: 2 }, 'the first bar opens up out of the muffled mix');
  const first = bars.findIndex((b) => FIGHT.includes(b.name)), calm = bars.findIndex((b, i) => i > first && !FIGHT.includes(b.name));
  assert.deepEqual(fade(first), { open: 0 }, 'a fight hits at once');
  assert.ok(fade(calm - 1).close && fade(calm).from && bars[calm].plan.glide > 1, 'and closes down, the song comes back up slowly');
});

test('music: a fight that stops at once still plays its minimum, a new one during the closing bar carries on', () => {
  const short = playMusic(30, [[5, () => Music.setCombat(true)], [5.2, () => Music.setCombat(false)]]);
  assert.ok(onGrid(short));
  const first = short.findIndex((b) => b.name === 'fight');
  assert.deepEqual(short.slice(first, first + 4).map((b) => b.name), ['fight', 'fight', 'fight', 'break'], 'two bars, a closing bar, the break');
  // back in the fight before the closing bar is over: no hand-back
  const again = playMusic(30, [[5, () => Music.setCombat(true)], [5.2, () => Music.setCombat(false)],
    [short[first + 2].t + 1, () => Music.setCombat(true)]]);
  assert.ok(onGrid(again));
  assert.ok(again.slice(first).every((b) => FIGHT.includes(b.name)));
  assert.deepEqual(again.slice(first, first + 5).map((b) => b.bar), [0, 1, 2, 3, 4]);
});

test('music: the menu ignores the fight, and a throttled timer resyncs without scheduling in the past', () => {
  const menu = playMusic(20, [[3, () => Music.setCombat(true)]], 0);
  assert.ok(menu.length > 5 && menu.every((b) => b.name === 'intro' || b.name === 'ambient'));
  const bars = playMusic(40, [[5, () => Music.setCombat(true)], [12, (ctx) => { ctx.currentTime += 7; }], [25, () => Music.setCombat(false)]]);
  assert.ok(bars.every((b, i) => i === 0 || b.t > bars[i - 1].t));
  assert.ok(FIGHT.includes(bars.find((b) => b.t > 20).name));
  assert.equal(bars[bars.length - 1].name, 'break');
});
