import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { mockContext } from './webaudio.mjs';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { default: Audio, META, LEVELS } = await load('audio/Audio.js');
const { RECIPES, formOf, FLOOR_OF, HANDLING } = await load('audio/Foley.js');
const { render, LAYER_KINDS } = await load('audio/Synth.js');
const { FLOORS } = await load('game/world/TileMap.js');
const { GADGETS } = await load('game/Config.js');
const CONFIG_SOUNDS = Object.values(GADGETS).map((g) => g.sound).filter(Boolean);
const { default: Synthwave } = await load('audio/Synthwave.js');
const Music = new Synthwave(); // the synthwave score's player, driven by hand below
const { default: Tension } = await load('game/ai/Tension.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { MATERIAL_FX } = await load('game/data/destruction.js');
const { BANK } = await load('audio/bank.js');
const { ZONES, CITY } = await load('game/data/soundscape.js');
const ZONE_SOUNDS = Object.values(ZONES).flatMap((z) => z.events.flatMap((e) => (typeof e.sound === 'string' ? [e.sound] : Object.keys(e.sound))));

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
      for (const name of ['magOut', 'magLand', 'magIn', 'rack', 'shellIn', 'handle', 'click', 'pickup']) {
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

// every name written in a world.sound / Audio.play call of the game (each literal of its first argument, but the
// ones a condition compares against), plus the material tables, the gadgets and the voices of the crowd
function calledNames() {
  const names = new Set(), walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = `${dir}/${f}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) {
        for (const [, arg] of readFileSync(p, 'utf8').matchAll(/(?:\.sound|Audio\.play)\(([^,)]*)[,)]/g)) {
          for (const [, n] of arg.matchAll(/(?<!===?\s*)'(\w+)'/g)) names.add(n);
        }
      }
    }
  };
  walk(fileURLToPath(new URL('../src/game', import.meta.url))); // not .pathname: a space in the path would stay encoded
  return names;
}
const GAME_SOUNDS = [...new Set([
  ...calledNames(), ...Object.values(MATERIAL_FX).flatMap((fx) => [fx.hit, fx.crush]), ...CONFIG_SOUNDS, ...ZONE_SOUNDS,
  'stone', 'flesh', 'shell', 'scream', 'whimper', 'sob', 'pant', 'step', 'drop', 'drag',
])].filter((n) => !Object.values(WEAPONS).some((d) => d.kind === 'gun' && d.sound === n));

test('audio: every sound the game asks for plays, from a cut that lies inside the foley bank', () => {
  const end = Math.max(...Object.values(BANK).flat().map(([at, len]) => at + len));
  withContext((ctx) => {
    const make = ctx.createBufferSource;
    ctx.createBufferSource = () => {
      const s = make(), start = s.start;
      s.start = (t, at = 0, len = 0) => {
        if (s.buffer === FOLEY && !s.loop) assert.ok(at >= 0 && len > 0 && at + len <= end + 0.05, `cut ${at} + ${len} outside the bank`);
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

test('audio: the beds of the night: a looping voice per bed once rendered, let go when left out, rooms crossfaded', () => {
  withContext((ctx) => {
    const buf = { duration: 4 }, made = [];
    Audio.bedBufs = { city: buf, engine: buf };
    const make = ctx.createBufferSource;
    ctx.createBufferSource = () => { const s = make(); made.push(s); return s; };
    const mix = (beds) => Audio.setAmbience({ beds, room: { open: 1, warm: 0 } });
    mix({ city: { gain: 0.3, lp: 14000, pan: 0 }, car0: { bed: 'engine', gain: 0.2, lp: 9000, pan: 0.5, rate: 1.1 }, radio: { gain: 0.2 } });
    assert.equal(made.length, 2, 'a loop per voice whose bed is ready');
    assert.ok(made.every((s) => s.loop && s.buffer === buf));
    assert.deepEqual(Audio.bedQueue, ['radio'], 'the other one is queued to be rendered');
    assert.equal(Audio.beds.car0.src.playbackRate.value, 1.1);
    for (let t = 0; t < 10; t += 0.1) { ctx.currentTime += 0.1; mix({ city: { gain: 0.3, lp: 14000, pan: 0 } }); }
    assert.equal(Audio.beds.car0.src, null, 'the car gone, its loop is let go');
    assert.ok(Audio.beds.city.src, 'the city goes on');
    assert.equal(made.length, 2, 'and is not restarted');
    Audio.bedQueue = [];
  });
});

// ---------------------------------------------------------------- soundtrack: the synthwave track (audio/Synthwave.js, audio/score.js)
const BAR = 240 / 126;
const FIGHT = ['fightA', 'fightB', 'bridge', 'chase']; // sections of the combat form, in order
const SCORE = await load('audio/score.js');

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
  Music.setCombo(0);
  return bars;
}
const onGrid = (bars) => bars.every((b, i) => i === 0 || Math.abs(b.t - bars[i - 1].t - BAR) < 1e-9);
// the sections in the order they played, once per run of bars
const runs = (bars) => bars.map((b) => b.name).filter((n, i, a) => i === 0 || n !== a[i - 1]);
const drums = (p) => p.kick.length + p.snare.length + p.hat.length + p.tom.length + p.perc.length;

test('music: the score is consistent: every section names patterns, phrases and lists that exist and fit', () => {
  const { SECTIONS, FORMS, PROGRESSIONS, KICK, SNARE, HATS, PERC, BASS, PULSE, ARP, STABS, LEADS } = SCORE;
  const TABLE = { kick: KICK, snare: SNARE, hats: HATS, bass: BASS, pulse: PULSE, arp: ARP, stab: STABS };
  for (const form of Object.values(FORMS)) for (const n of form) assert.ok(SECTIONS[n], n);
  for (const [name, s] of Object.entries(SECTIONS)) {
    assert.equal(PROGRESSIONS[s.prog].length, 8, name);
    for (const [layer, table] of Object.entries(TABLE)) {
      for (const p of [s[layer], s.bars?.[layer]].flat()) if (p) assert.ok(table[p], `${name}.${layer}: ${p}`);
      if (s.bars?.[layer]) assert.equal(s.bars[layer].length, 8, `${name}.bars.${layer}`);
    }
    for (const [buf, pat] of s.perc || []) assert.ok(PERC[pat] && ['shaker', 'rim', 'clank', 'tom'].includes(buf), `${name}.perc ${buf}`);
    if (s.lead) assert.equal(LEADS[s.lead].length, 8, `${name}.lead`);
  }
  for (const name of FORMS.combat) {
    const s = SECTIONS[name];
    for (const layer of ['kick', 'hats', 'bass', 'growl', 'bite']) assert.equal(s[layer].length, 6, `${name}.${layer}: one entry per stage`);
  }
  for (const [name, phrase] of Object.entries(LEADS)) {
    for (const bar of phrase) for (const [s, m, len] of bar || []) assert.ok(s >= 0 && s + len <= 16 && m > 55 && m < 96, `${name} ${s} ${m}`);
  }
  for (const pat of [KICK, SNARE, HATS, PERC, BASS, PULSE, ARP, STABS].flatMap(Object.values)) assert.equal(pat.length, 16, pat);
});

test('music: without a fight the song never plays its combat form', () => {
  const bars = playMusic(100 * BAR, [[30, () => Music.setIntensity(1)]]);
  assert.ok(bars.length >= 99 && onGrid(bars));
  assert.ok(!bars.some((b) => FIGHT.includes(b.name)));
  assert.deepEqual(bars.slice(7, 9).map((b) => b.name + b.bar), ['verseA7', 'verseB0']);
});

test('music: the calm breathes on a pad and a muted pulse, tense brings a heartbeat, the bass and risers, then the beat', () => {
  const bars = playMusic(44 * BAR, [[15.5 * BAR, () => Music.setIntensity(0.55)], [35.5 * BAR, () => Music.setIntensity(0.75)]], 0.25);
  assert.ok(onGrid(bars));
  const of = (name) => bars.filter((b) => b.name === name);
  assert.deepEqual(runs(bars).slice(0, 6), ['calmA', 'calmB', 'tense', 'tenseB', 'tense', 'verseA']);
  assert.ok(of('calmA').length >= 8 && of('calmB').length >= 8);
  for (const { name, plan: p } of [...of('calmA'), ...of('calmB')]) {
    assert.equal(drums(p), 0, 'no drums');
    assert.ok(!p.bass.length && !p.lead.length && !p.stab.length && p.level <= 0.6 && p.pad > 0, 'no bass, no lead, quiet');
    assert.ok(p.pulse.length >= 8 && p.pulse.every((n) => n.m >= 40 && n.m <= 64), 'the pulse, in 8ths, an octave over the bass');
    assert.equal(!!p.arp.length, name === 'calmB', 'the slow arpeggio answers in the second half');
  }
  const v = of('calmA').slice(0, 2).flatMap((b) => b.plan.pulse.map((n) => n.v));
  assert.ok(Math.max(...v) > 2 * Math.min(...v), 'it swells and sinks over two bars');
  for (const { plan: p } of [...of('tense'), ...of('tenseB')]) {
    assert.ok(p.kick.length === 2 && !p.snare.length, 'a heartbeat');
    assert.ok(p.bass.length >= 3 && p.pulse.length === 16, 'the bass and a ticking pulse');
  }
  assert.ok(of('tense').some((b) => b.bar === 6 && b.plan.riser === 2) && of('tenseB').some((b) => b.plan.riser), 'a riser into each return');
  assert.equal(of('verseA')[0].bar, 0, 'the song starts from its top');
  assert.ok(of('verseA').every((b) => b.plan.kick.length >= 4 && b.plan.snare.length >= 2));
  // a fight from the calm: cued, then the combat form; it never chases while it is not hot
  const cold = playMusic(40 * BAR, [[5, () => Music.setCombat(true)]], 0.25);
  assert.deepEqual(runs(cold).slice(0, 6), ['calmA', 'fightA', 'fightB', 'bridge', 'fightA', 'fightB']);
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

test('music: a fight is cued at once, takes over on the next bar line, runs through its sections and hands back', () => {
  let cue = 0;
  const bars = playMusic(75, [
    [5, (ctx) => { cue = ctx.started; Music.setCombat(true); Music.setIntensity(1); Music.setCombo(5); }],
    [5.1, (ctx) => { cue = ctx.started - cue; }],
    [5 + 32 * BAR, () => { Music.setCombat(false); Music.setIntensity(0.8); }],
  ]);
  assert.ok(onGrid(bars), 'every bar starts one bar after the previous one');
  assert.ok(cue >= 3, 'the cue (riser, reversed cymbal, roll) is scheduled by the tick that sees the fight');
  const first = bars.findIndex((b) => FIGHT.includes(b.name));
  const calm = bars.findIndex((b, i) => i > first && !FIGHT.includes(b.name));
  assert.equal(bars[first].name + bars[first].bar, 'fightA0');
  assert.ok(bars[first].t > 5 && bars[first].t <= 5 + BAR + 0.3, 'on the first bar line not scheduled yet');
  assert.ok(bars[first].plan.impact && bars[first].plan.crash && bars[first].plan.stinger, 'the fight lands on an impact');
  assert.deepEqual(runs(bars.slice(first, calm)).slice(0, 4), FIGHT, 'both themes, the breakdown, and the chase while it is hot');
  assert.ok(bars[calm].t > 5 + 32 * BAR && bars[calm].t <= 5 + 34 * BAR + 0.3, 'hands back after one closing bar');
  assert.ok(bars[calm - 1].plan.tom.length || bars[calm - 1].plan.snare.length > 3, 'the closing bar ends on a fill');
  assert.equal(bars[calm].name + bars[calm].bar, 'break0');
  assert.ok(bars[calm].plan.down && bars[calm].plan.crash, 'the song resumes at its break, on a downlifter');
  assert.ok(!bars.slice(calm).some((b) => FIGHT.includes(b.name)));
  // at the top of a chain every bar of the themes is dense, and on the 16-step grid
  for (const b of bars.slice(first, calm)) {
    const p = b.plan;
    for (const n of [...p.lead, ...p.hook, ...p.bass, ...p.arp, ...p.stab]) assert.ok(n.s >= 0 && n.s < 16, 'on the grid');
    for (const n of [...p.lead, ...p.hook]) assert.ok(n.s + n.len <= 16 && n.m > 40 && n.m <= 96, 'lead notes end inside their bar');
    for (const m of [...p.bass.map((n) => n.m), ...p.arp.map((n) => n.m), ...p.stab.flatMap((h) => h.notes)]) assert.ok(m > 20 && m < 100);
    if (b.name === 'bridge') continue;
    assert.ok(p.bass.length >= 12 && p.arp.length === 16 && p.lead.length >= 5 && p.stab.length >= 4 && p.kick.length >= 4, b.name + b.bar);
    assert.equal(p.hook.length, p.lead.length, 'the lead doubled');
  }
});

test('music: a fight kicks from its first bar, every kill of a chain brings a layer and some volume, they go one by one', () => {
  const kills = [1, 2, 3, 4, 5].map((n) => [(1 + 2 * n) * BAR, () => Music.setCombo(n)]);
  const bars = playMusic(30 * BAR, [[1, () => Music.setCombat(true)], ...kills, [20 * BAR, () => Music.setCombo(0)]], 0.85);
  const at = (stage) => bars.find((b) => ['fightA', 'fightB'].includes(b.name) && b.plan.stage === stage && b.bar % 4 !== 3).plan;
  const bare = at(0);
  assert.ok(bare.kick.length === 4 && bare.kick.every((h) => h.s % 4 === 0), 'four on the floor');
  assert.ok(bare.clap.length === 2 && bare.snare.length >= 2, 'the clap on the backbeat');
  assert.ok(bare.hat.some((h) => h.ch === 'o' && h.s % 4 === 2) && bare.hat.some((h) => h.ch !== 'o'), 'closed 16ths, the open hat off the beat');
  assert.ok(bare.bass.length >= 4 && bare.bass.every((n) => n.s % 4) && bare.growl > 0 && bare.duck < 0.5, 'a driven bass pumping between the kicks');
  assert.ok(bare.perc.some((h) => h.buf === 'shaker'), 'a shaker');
  assert.ok(!bare.arp.length && !bare.stab.length && !bare.lead.length && !bare.hook.length, 'and no melody yet');
  assert.ok(at(1).arp.length === 16 && at(1).bass.length > bare.bass.length && !at(1).stab.length, 'the arp, a rolling bass');
  assert.ok(at(2).stab.length >= 4 && ['rim', 'clank'].every((n) => at(2).perc.some((h) => h.buf === n)) && !at(2).lead.length, 'stabs, rim and metal');
  assert.ok(at(3).lead.length >= 5 && !at(3).hook.length, 'the hook');
  assert.ok(at(4).bass.length === 16 && at(4).kick.length === 5 && at(4).growl === 1, 'the 16th bass, the driving kick');
  const top = at(5);
  assert.ok(top.hook.length === top.lead.length && top.hook.every((n, i) => n.m >= top.lead[i].m), 'the lead doubled an octave up');
  assert.ok(top.perc.some((h) => h.buf === 'tom') && top.arpCut > at(4).arpCut && top.bassCut[1] > at(4).bassCut[1], 'toms, every filter open');
  for (let s = 1; s <= 5; s++) assert.ok(at(s).level > at(s - 1).level && at(s).e > at(s - 1).e, 'louder and brighter');
  assert.ok(top.level < bare.level * 1.3, 'only a little louder');
  const stings = bars.filter((b) => b.plan.stinger);
  assert.deepEqual(stings.map((b) => b.plan.stage), [3, 5], 'a stinger when the chain gets big, and at its top');
  const down = bars.filter((b) => b.t > 20 * BAR).map((b) => b.plan.stage);
  assert.deepEqual(down.slice(0, 7).filter((s, i, a) => i === 0 || s !== a[i - 1]).slice(-5), [4, 3, 2, 1, 0], 'a step a bar');
});

test('music: the breakdown drops to half time on a held bass and the crying lead, then builds back into the next theme', () => {
  const bars = playMusic(34 * BAR, [[1, () => Music.setCombat(true)], [2 * BAR, () => Music.setCombo(2)]], 0.85);
  const start = bars.findIndex((b) => b.name === 'bridge');
  const br = bars.slice(start, start + 8).map((b) => b.plan);
  assert.ok(br.every((p) => p.name === 'bridge'));
  for (const p of br.slice(0, 4)) {
    assert.ok(p.kick.length === 2 && p.bass.length === 2 && !p.arp.length && !p.stab.length && p.lead.length >= 2, 'half time, held bass, lead');
  }
  assert.ok(!br[0].snare.length && br[0].down && br[0].crash && br[0].fade.from && br[0].fade.open === 8, 'down into it, muffled, opening up');
  for (const p of br.slice(4)) assert.ok(p.kick.length >= 4 && p.arp.length && p.stab.length, 'the build');
  assert.ok(br[4].riser === 4 && br[7].swell, 'a riser and a reversed cymbal');
  assert.ok([...br[7].kick, ...br[7].snare, ...br[7].bass, ...br[7].lead].every((h) => h.s < 12), 'a breath before the drop');
  const after = bars[start + 8];
  assert.equal(after.name + after.bar, 'fightA0', 'not hot: no chase');
  assert.ok(after.plan.crash && after.plan.impact);
});

test('music: at the top of a chain every fourth bar rolls into a crash, and the parts fade into one another', () => {
  const bars = playMusic(40 * BAR, [[1, () => Music.setCombat(true)], [2 * BAR, () => Music.setCombo(5)], [24 * BAR, () => { Music.setCombat(false); Music.setCombo(0); }]], 0.85);
  const hot = bars.filter((b) => ['fightA', 'fightB'].includes(b.name) && b.plan.stage >= 4 && b.t < 24 * BAR);
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
  assert.ok(bars.filter((b) => b.plan.swell).every((b) => b.bar === 7), 'reversed cymbals only into a section');
});

test('music: the jukebox has no band of its own: Music.setJukebox stays in the API and does nothing', async () => {
  const { default: Soundtrack } = await load('audio/Music.js');
  assert.equal(typeof Soundtrack.setJukebox, 'function');
  const before = JSON.stringify(Soundtrack.game);
  Soundtrack.setJukebox(0.8);
  assert.equal(JSON.stringify(Soundtrack.game), before);
  assert.equal(Music.setJukebox, undefined, 'the players have none');
  const bars = playMusic(4 * BAR, [], 0.25);
  assert.ok(bars.length >= 3 && bars.every((b) => !('juke' in b.plan)));
});

test('music: a fight that stops at once still plays its minimum, a new one during the closing bar carries on', () => {
  const short = playMusic(30, [[5, () => Music.setCombat(true)], [5.2, () => Music.setCombat(false)]]);
  assert.ok(onGrid(short));
  const first = short.findIndex((b) => b.name === 'fightA');
  assert.deepEqual(short.slice(first, first + 4).map((b) => b.name), ['fightA', 'fightA', 'fightA', 'break'], 'two bars, a closing bar, the break');
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

test('audio: every sound the game plays has its own mix settings, and the scan of the call sites found them', () => {
  for (const n of ['rung', 'roll', 'rollUp', 'ledge', 'dive', 'hipSlide', 'getUp', 'trunk', 'clubHit', 'chairScrape', 'swing', 'punch']) {
    assert.ok(GAME_SOUNDS.includes(n), `${n} not found in the game's calls`);
  }
  for (const n of GAME_SOUNDS) assert.ok(META[n === 'impact' ? 'stone' : n], `'${n}' has no META entry`); // impact: an alias
});

test('foley: every recipe and form renders a clean, varied, normalized sound', () => {
  const sr = 22050;
  for (const [name, r] of Object.entries(RECIPES)) {
    const forms = r.forms ? Object.entries(r.forms) : [[name, r]];
    assert.ok(forms.length, name);
    for (const [form, rec] of forms) {
      assert.ok(rec.level > 0 && rec.level <= 1 && rec.dur > 0 && rec.layers.length, `${name}.${form}`);
      for (const l of rec.layers) assert.ok(LAYER_KINDS.includes(l.k), `${name}.${form}: layer ${l.k}`);
      const a = render(rec, sr, 1), b = render(rec, sr, 2);
      for (const x of [a, b]) {
        let peak = 0;
        for (const v of x) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
        assert.ok(Math.abs(peak - rec.level) < 1e-3, `${name}.${form}: peak ${peak}`);
        assert.ok(x.length / sr <= rec.dur + 0.4 && Math.abs(x[x.length - 1]) < 0.01 * rec.level, `${name}.${form}: length / tail`);
      }
      assert.ok(a.length !== b.length || a.some((v, i) => v !== b[i]), `${name}.${form}: two variations are the same`);
    }
  }
});

test('foley: every floor, weapon and option a call can pass has its form', () => {
  for (const f of Object.values(FLOORS)) assert.ok(FLOOR_OF[f], `floor ${f}`);
  for (const w of Object.keys(WEAPONS)) assert.ok(HANDLING[w], `weapon ${w}`);
  for (const floor of [...Object.values(FLOORS), undefined]) {
    for (const run of [false, true]) assert.ok(formOf('step', { floor, run }));
    for (const n of ['slide', 'roll', 'rollUp']) assert.ok(formOf(n, { floor }));
  }
  for (const weapon of [...Object.keys(WEAPONS), undefined]) for (const n of ['swing', 'throw', 'drop']) assert.ok(formOf(n, { weapon }), `${n} ${weapon}`);
  assert.equal(formOf('grip', { weapon: 'pistol' }), null, 'a gun picked up keeps its handling recording');
  for (const material of ['metal', 'wood', 'fabric', undefined]) assert.ok(formOf('hipSlide', { material }) && formOf('clubHit', { material }));
});

test('audio: footsteps never starve the voices, and STEP_LEVEL 0 would silence them', () => {
  withContext((ctx) => {
    for (let i = 0; i < 60; i++) { Audio.play('step', { x: 10 * i, y: 0, floor: 'asphalt', run: true }); ctx.currentTime += 1 / 12; }
    assert.ok(Audio.active.filter((a) => a.name === 'step').length <= META.step.max);
    assert.ok(META.step.pri === 0 && META.step.gain < 0.5);
  });
});

test('audio volumes: each slider moves its own gain node, ambience has its own, and the defaults come at the build', () => {
  withContext(() => {
    const sets = new Map();
    for (const k of ['master', 'music', 'sfx', 'ambBus', 'shots']) {
      Audio[k].gain.setTargetAtTime = (x) => sets.set(k, x);
    }
    const heard = (kind, v) => { sets.clear(); Audio.setVolume(kind, v); return [...sets.keys()].sort().join(); };
    assert.equal(heard('master', 0.5), 'master');
    assert.equal(heard('music', 0.5), 'music');
    assert.equal(heard('sfx', 0.5), 'sfx,shots');
    assert.equal(heard('ambience', 0.5), 'ambBus');
    assert.equal(heard('bogus', 0.5), '');
    assert.equal(Audio.vol.ambience, 0.5);
  });
  // a volume set before the context exists is applied at the build
  Audio.vol.ambience = 0.4;
  withContext(() => assert.ok(Math.abs(Audio.ambBus.gain.value - 0.4) < 1e-9));
  Audio.vol.ambience = 1;
});

test('audio volumes: an ambience one-shot goes through the ambience bus, a gunshot and an impact through the effects', () => {
  withContext(() => {
    const dests = [];
    Audio._out = function (sp, dest) { dests.push(dest); return { gain: { value: 0 }, _chain: [], _n: 0 }; };
    const where = (name, opts) => { dests.length = 0; Audio.lastPlay = {}; Audio.active = []; Audio.play(name, { vol: 1, ...opts }); return dests[0]; };
    assert.equal(where('clink', { amb: true }), Audio.ambOne);
    assert.equal(where('gust', { amb: true }), Audio.ambOne);
    assert.notEqual(where('clink', {}), Audio.ambOne);
    assert.equal(where('clink', {}), Audio.sfx);
    assert.notEqual(where('pistol', {}), Audio.ambOne);
    for (const n of ['shout', 'cry', 'scream', 'whimper', 'mutter', 'pant', 'sob']) assert.equal(where(n, {}), Audio.voice, `${n}: a voice`);
    assert.equal(where('confirm', { n: 1 }), Audio.sfx);
    delete Audio._out;
  });
});

test('audio mix: the night sits under the effects and the music, its small sounds over its beds', () => {
  assert.ok(LEVELS.beds < LEVELS.ambOne && LEVELS.ambOne < LEVELS.sfx && LEVELS.sfx <= LEVELS.music + 0.2);
  assert.ok(LEVELS.beds / LEVELS.music < 0.25, 'the beds far under the music');
  withContext(() => {
    assert.ok(Math.abs(Audio.amb.gain.value - LEVELS.beds) < 1e-9 && Math.abs(Audio.ambOne.gain.value - LEVELS.ambOne) < 1e-9);
    assert.ok(Audio.glue && Audio.limiter && Audio.musicComp, 'the dynamics are reachable (for measurement)');
    assert.ok(Audio.limiter.release.value >= 0.2 && Audio.limiter.threshold.value > -4, 'the limiter catches peaks and never pumps');
  });
});

test('audio: the far city plays its long sounds from far, moving across, and lets them go', () => {
  withContext((ctx) => {
    for (const k of ['train', 'dog', 'carAlarm']) Audio.bedBufs[k] = { duration: 22 };
    Audio.bedMarks.dog = [[0, 2], [3, 2]];
    const pans = [];
    const mk = ctx.createStereoPanner;
    ctx.createStereoPanner = () => { const p = mk(); const ramp = p.pan.linearRampToValueAtTime; p.pan.linearRampToValueAtTime = (x, t) => { pans.push(x); ramp(x, t); }; return p; };
    for (const e of CITY) {
      ctx.currentTime += 60;
      const n = ctx.started;
      Audio.play(e.sound, { vol: 0.8, distant: e.distant[0], side: 0.4, amb: true, dir: -1, honks: 2 });
      assert.ok(ctx.started > n, `${e.sound} played nothing`);
      assert.ok(Audio.active.some((a) => a.name === e.sound));
    }
    assert.ok(pans.filter((x) => x < -0.5).length >= 2, 'the train and the siren cross to the other side');
    assert.equal(Audio.bedQueue.length, 0, 'nothing waited to be rendered');
    // not rendered yet: nothing plays, the voice is freed and the render is queued
    Audio.bedBufs = {};
    Audio.bedQueue = ['busy'];
    ctx.currentTime += 60;
    Audio.play('train', { vol: 1, amb: true });
    assert.ok(!Audio.active.some((a) => a.name === 'train' && a.end > ctx.currentTime), 'a silent voice is let go');
    assert.ok(Audio.bedQueue.includes('train'));
    Audio.bedQueue = [];
  });
});

test('audio: a kill gives a deep boom under its note, and the next kill of a chain chokes the last one', () => {
  withContext((ctx) => {
    const sines = [];
    const mk = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = mk(), set = o.frequency.setValueAtTime, ramp = o.frequency.exponentialRampToValueAtTime, rec = { o, f: [] };
      o.frequency.setValueAtTime = (f, t) => { rec.f.push(f); set(f, t); };
      o.frequency.exponentialRampToValueAtTime = (f, t) => { rec.f.push(f); ramp(f, t); };
      sines.push(rec);
      return o;
    };
    ctx.currentTime = 10;
    Audio.play('confirm', { n: 1 });
    const boom = sines.find((s) => s.f[0] < 100);
    assert.ok(boom && boom.f[1] <= 45 && boom.f[1] >= 30, 'a sine falling to the low 40s: ' + (boom && boom.f));
    const notes = sines.filter((s) => s.f[0] > 180).map((s) => s.f[0]);
    assert.ok(notes.length >= 1, 'the muted note is still there');
    const first = Audio.active.find((a) => a.name === 'confirm'), fades = [];
    first.gain.gain.setTargetAtTime = (x) => fades.push(x);
    ctx.currentTime += 0.4;
    Audio.play('confirm', { n: 2 });
    assert.deepEqual(fades, [0], 'the first boom is choked');
    assert.equal(Audio.active.filter((a) => a.name === 'confirm').length, 1);
    const second = sines.filter((s) => s.f[0] > 180).map((s) => s.f[0]);
    assert.ok(Math.max(...second) > Math.max(...notes), 'the note climbs with the chain');
  });
});

test('music: the grit drives harder and wetter with its value, at the level of the clean mix, never past its cap', () => {
  const { gritDrive, gritCurve, GRIT } = SCORE;
  let last = null;
  const rms = (f, a) => { let s = 0; for (let i = 0; i < 256; i++) { const v = f(a * Math.sin((2 * Math.PI * (i + 0.5)) / 256)); s += v * v; } return Math.sqrt(s / 256); };
  for (let g = 0; g <= 1.0001; g += 0.05) {
    const d = gritDrive(g);
    assert.ok(Math.abs(d.dry + d.wet - 1) < 1e-9 && d.wet >= 0 && d.wet <= GRIT.wet && d.pre >= 1 && d.tone > 1000);
    if (last) assert.ok(d.pre >= last.pre && d.wet >= last.wet && d.tone <= last.tone, 'monotonic at ' + g);
    // the clean and the driven blended, at the reference level: within 0.5 dB of the clean one
    const out = rms((x) => d.dry * x + d.wet * d.makeup * gritCurve(d.pre * x), GRIT.ref), dB = 20 * Math.log10(out / rms((x) => x, GRIT.ref));
    assert.ok(Math.abs(dB) < 0.5, `level at grit ${g.toFixed(2)}: ${dB.toFixed(2)} dB`);
    last = d;
  }
  assert.equal(gritDrive(0).wet, 0, 'clean at 0');
  assert.deepEqual(gritDrive(5), gritDrive(GRIT.max), 'capped');
  // the drive grows: a louder reference is squashed more at high grit (harmonics), not at 0
  const crest = (d) => rms((x) => gritCurve(d.pre * x), 1) / gritCurve(d.pre);
  assert.ok(crest(gritDrive(0.8)) > crest(gritDrive(0.1)) + 0.1);
});

test('music: the calm and the tense are clean, a fight gets dirtier with each kill of the chain and with its heat', () => {
  const calm = playMusic(BAR * 6, [], 0.3), tense = playMusic(BAR * 6, [], 0.55);
  assert.ok([...calm, ...tense].every((b) => b.plan.grit === 0), 'no grit out of a fight');
  const bars = playMusic(BAR * 16, [
    [0, () => Music.setCombat(true)],
    [BAR * 4, () => Music.setCombo(2)],
    [BAR * 8, () => Music.setCombo(5)],
  ], 0.85);
  const fight = bars.filter((b) => FIGHT.includes(b.name)), at = (stage) => fight.find((b) => b.plan.stage === stage)?.plan.grit;
  assert.ok(at(0) > 0 && at(2) > at(0) && at(5) > at(2), `grit by stage: ${at(0)} ${at(2)} ${at(5)}`);
  const hot = playMusic(BAR * 4, [[0, () => Music.setCombat(true)]], 1);
  assert.ok(hot.filter((b) => FIGHT.includes(b.name)).at(-1).plan.grit > at(0), 'the heat adds to it');
});

test('audio: the car horn is a 1980s car\'s, two buzzy notes a third apart, quick short beeps, not a truck\'s blare', () => {
  withContext((ctx) => {
    const oscs = [], gains = [], filters = [];
    const mkO = ctx.createOscillator, mkG = ctx.createGain, mkF = ctx.createBiquadFilter;
    ctx.createOscillator = () => {
      const o = mkO(), start = o.start, stop = o.stop, rec = { o };
      o.start = (t) => { rec.t0 = t; start(t); };
      o.stop = (t) => { rec.t1 = t; stop(t); };
      oscs.push(rec);
      return o;
    };
    ctx.createGain = () => {
      const g = mkG(), rec = { g, pts: [] };
      g.gain.setValueAtTime = (v, t) => rec.pts.push([t, v]);
      g.gain.linearRampToValueAtTime = (v, t) => rec.pts.push([t, v]);
      gains.push(rec);
      return g;
    };
    ctx.createBiquadFilter = () => { const f = mkF(); filters.push(f); return f; };
    ctx.currentTime = 5;
    // a driver held up: honk-honk
    Audio._horn(ctx.createGain(), { honks: 2 });
    assert.equal(oscs.length, 4, 'two horns a beep, two beeps');
    for (const { o } of oscs) assert.equal(o.type, 'square', 'odd harmonics: a buzz');
    const pair = oscs.slice(0, 2).map(({ o }) => o.frequency.value).sort((a, b) => a - b);
    assert.ok(pair[0] >= 380 && pair[0] <= 470 && pair[1] >= 470 && pair[1] <= 560, `around 400-500 Hz: ${pair}`);
    const third = pair[1] / pair[0];
    assert.ok(third > 1.17 && third < 1.28, `a minor to a major third apart: ${third}`);
    const starts = [...new Set(oscs.map((r) => r.t0))].sort((a, b) => a - b);
    assert.equal(starts.length, 2, 'two beeps');
    const beeps = oscs.filter((r) => r.t0 === starts[0]).map((r) => r.t1 - r.t0);
    assert.ok(Math.max(...beeps) < 0.25, `short beeps: ${beeps}`);
    // the envelope speaks in a few ms and lets go fast
    const env = gains.find((r) => r.pts.length === 4);
    assert.ok(env && env.pts[1][0] - env.pts[0][0] <= 0.01 && env.pts[3][0] - env.pts[2][0] <= 0.05, 'quick attack and release');
    // bright: the boom thinned, a nasal band pushed between 1 and 3 kHz
    const hp = filters.filter((f) => f.type === 'highpass'), band = filters.find((f) => f.type === 'peaking');
    assert.ok(hp.length && hp.every((f) => f.frequency.value >= 300));
    assert.ok(band && band.frequency.value >= 1000 && band.frequency.value <= 3000 && band.gain.value > 0);
    // one held honk is longer, three is three
    oscs.length = 0;
    Audio._horn(ctx.createGain(), { honks: 1 });
    assert.equal(oscs.length, 2);
    assert.ok(oscs[0].t1 - oscs[0].t0 > 0.25 && oscs[0].t1 - oscs[0].t0 < 0.6, 'one held');
    oscs.length = 0;
    Audio._horn(ctx.createGain(), { honks: 3 });
    assert.equal(new Set(oscs.map((r) => r.t0)).size, 3);
  });
  // a held up driver gives two or three beeps each time
  const src = readFileSync(fileURLToPath(new URL('../src/game/systems/Ambient.js', import.meta.url)), 'utf8');
  assert.match(src, /sound\('horn',.*honks: .*\? 2 : 3/);
});
