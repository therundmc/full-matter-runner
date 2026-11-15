// The soundtrack's track registry (audio/tracks), the groove player (audio/groove/Groove.js), its instruments
// (audio/groove/voices.js) and harmony (audio/groove/theory.js), and the conductor that switches tracks (audio/Music.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { mockContext } from './webaudio.mjs';

const { TRACKS, DEFAULT_TRACK, MENU_TRACK, trackOf } = await load('audio/tracks/index.js');
const { default: Groove, compile, planBar, LEVELS } = await load('audio/groove/Groove.js');
const { render, mtof, INSTRUMENTS } = await load('audio/groove/voices.js');
const { chord, voicing, tokens, mel, midi, atLevel } = await load('audio/groove/theory.js');
const { default: Music } = await load('audio/Music.js');
const { default: LEVELS_DATA } = await load('game/data/levels/index.js');

const GROOVES = Object.values(TRACKS).filter((t) => !t.engine);
const LEVEL_TRACKS = GROOVES.filter((t) => !t.forms.menu);
const DRUM_LETTERS = { hat: /^[1-9o]$/, conga: /^[HhSLB]$/, tom: /^[HML]$/ };

// Plays a groove track on a mock context the way the game does (a tick every 100 ms, 0.3 s ahead) for `seconds`,
// running the scripted calls [time, fn(player, ctx)] on the way. Returns the bars planned: [{ t, plan }].
function play(track, seconds, script = [], start = { intensity: 0.25 }) {
  const ctx = mockContext();
  ctx.noPast = true;
  const g = new Groove(track, ctx, ctx.destination);
  g.setIntensity(start.intensity); g.setCombat(!!start.combat); g.setCombo(start.combo || 0);
  const bars = [];
  g.onBar = (plan, t) => bars.push({ t, plan });
  g._open(ctx);
  g.warm = []; // the tests render on demand
  const todo = script.slice();
  for (let now = 0; now < seconds; now = Math.max(now, ctx.currentTime) + 0.1) {
    ctx.currentTime = now;
    while (todo.length && todo[0][0] <= now) todo.shift()[1](g, ctx);
    g._tick(ctx.currentTime + 0.3);
  }
  return bars;
}
const barOf = (t) => 240 / t.bpm;
const hitsOf = (plan, layer) => (plan.parts[layer] || []).map((e) => e.s);
// a plan of bar b of a section at a level, as the player makes it
const plan = (T, sec, level, b = 0, state = level >= 2 ? 'fight' : level === 1 ? 'tense' : 'calm') =>
  planBar(T, { sec, next: { sec, b: (b + 1) % 8 }, b, pass: 0, level, state, open: 0.5, heat: 0 });

test('groove tracks: every track is consistent - chords, phrases, patterns, instruments, forms', () => {
  assert.ok(TRACKS[DEFAULT_TRACK] && TRACKS[MENU_TRACK].forms.menu, 'default and menu tracks');
  assert.ok(LEVEL_TRACKS.length >= 5, 'at least five level proposals');
  for (const t of GROOVES) {
    const T = compile(t);
    assert.ok(t.name && t.style && t.about && t.hook && t.bpm >= 90 && t.bpm <= 130 && t.key, `${t.id}: description`);
    if (!t.forms.menu) {
      assert.equal(t.ladder.length, LEVELS.length, `${t.id}: a line per level`);
      for (const f of ['calm', 'tense', 'fight']) assert.ok(t.forms[f]?.length, `${t.id}: form ${f}`);
    }
    for (const [name, bars] of Object.entries(T.phrases)) {
      assert.ok(bars.length >= 1 && 8 % bars.length === 0, `${t.id}.${name}: bars`);
      for (const bar of bars) for (const [s, m, len] of bar) assert.ok(s >= 0 && len > 0 && s + len <= 16 && m >= 40 && m <= 96, `${t.id}.${name} ${s} ${m}`);
    }
    for (const L of T.layers) {
      assert.ok(INSTRUMENTS[L.inst], `${t.id}.${L.id}: instrument`);
      const maps = [L.pat ?? L.mel, ...Object.values(t.sections).map((s) => s.parts?.[L.id]), ...Object.values(t.sections).flatMap((s) => s.bars?.[L.id] || [])];
      for (const map of maps) {
        if (map == null) continue;
        const values = typeof map === 'object' && !Array.isArray(map) ? Object.values(map) : [map];
        for (const v of values.flat()) {
          if (v == null) continue;
          if (L.mel) { assert.ok(T.phrases[v], `${t.id}.${L.id}: phrase ${v}`); continue; }
          assert.equal(v.length, 16, `${t.id}.${L.id}: ${v}`);
          const ok = INSTRUMENTS[L.inst] === 'drum' ? DRUM_LETTERS[L.inst] || /^[1-9]$/ : INSTRUMENTS[L.inst] === 'keys' ? /^[Cc-]$/ : /^[RrOoFfTtSsNnQqAxCcX-]$/;
          for (const ch of v) if (ch !== '.') assert.match(ch, ok, `${t.id}.${L.id}: '${ch}' in ${v}`);
        }
      }
    }
  }
});

test('groove tracks: each level of a track brings something in - calm without a kick, tense half time, fight on every beat, a layer a kill', () => {
  for (const t of LEVEL_TRACKS) {
    const T = compile(t), sec = t.forms.fight[0];
    const calm = plan(T, t.forms.calm[0], 0), tense = plan(T, t.forms.tense[0], 1);
    assert.ok(!calm.parts.kick, `${t.id}: no kick in the calm`);
    assert.ok(Object.keys(calm.parts).length >= 3, `${t.id}: the calm is not empty`);
    assert.ok(calm.mix.tone < 2500 && tense.mix.tone > calm.mix.tone, `${t.id}: filtered calm, opening when tense`);
    assert.ok(hitsOf(tense, 'kick').length > 0 && hitsOf(tense, 'kick').length <= 2, `${t.id}: a half-time kick when tense`);
    const fight = plan(T, sec, 2);
    for (const s of [0, 4, 8, 12]) assert.ok(hitsOf(fight, 'kick').includes(s), `${t.id}: kick on beat ${s / 4 + 1} in a fight`);
    assert.ok(fight.parts.clap || fight.parts.snare, `${t.id}: a backbeat`);
    assert.equal(fight.mix.tone, 20000, `${t.id}: the fight is wide open`);
    const sig = (p) => new Set(Object.entries(p.parts).map(([id, ev]) => id + ':' + ev.map((e) => e.s + '/' + (e.spec.m ?? e.spec.notes ?? e.spec.voice)).join()));
    for (let level = 3; level < LEVELS.length; level++) {
      const lo = sig(plan(T, sec, level - 1)), hi = sig(plan(T, sec, level));
      const added = [...hi].filter((x) => !lo.has(x));
      assert.ok(added.length > 0, `${t.id}: ${LEVELS[level]} adds or changes a layer`);
      assert.ok(Object.keys(plan(T, sec, level).parts).length >= Object.keys(plan(T, sec, 2).parts).length, `${t.id}: ${LEVELS[level]} keeps the fight's layers`);
    }
    const top = plan(T, sec, 7);
    assert.ok(Object.keys(top.parts).length >= Object.keys(fight.parts).length + 4, `${t.id}: the top of a chain is much fuller`);
    assert.ok(top.mix.pump < fight.mix.pump && top.mix.grit > fight.mix.grit, `${t.id}: pumps and drives harder at the top`);
  }
});

test('groove tracks: a bar plans the same way every time (deterministic), and the notes fit their chords', () => {
  for (const t of GROOVES) {
    const T = compile(t);
    for (const [sec, s] of Object.entries(t.sections)) {
      for (const level of t.forms.menu ? [0] : [0, 1, 2, 7]) {
        for (let b = 0; b < 8; b++) {
          const a = plan(T, sec, level, b, t.forms.menu ? 'menu' : undefined), c = plan(T, sec, level, b, t.forms.menu ? 'menu' : undefined);
          assert.deepEqual(a, c, `${t.id}.${sec} bar ${b}`);
          // the bass plays the chord's root or a tone of it (or an approach / dead note) on every step
          for (const e of a.parts.bass || []) {
            const ch = chord(T.prog[s.prog][b][e.s >= 8 && T.prog[s.prog][b].length > 1 ? 1 : 0].ch.sym);
            const pc = ((e.spec.m % 12) + 12) % 12;
            const tok = tokens(atLevel(T.layers.find((l) => l.id === 'bass').pat, level) || '................');
            assert.ok(ch.pcs.includes(pc) || (pc - ch.root + 12) % 12 === 5 || e.spec.dead || tok.some((x) => x.tok === 'A') || s.parts?.bass,
              `${t.id}.${sec} bar ${b}: bass ${e.spec.m} on ${ch.sym}`);
          }
        }
      }
    }
  }
});

test('groove: changes land on bar lines, calm and tense share the bar clock, a fight is cued and takes over on the next bar', () => {
  const t = TRACKS.velours, BAR = barOf(t);
  const bars = play(t, 30 * BAR, [
    [5.5 * BAR, (g) => g.setIntensity(0.6)],
    [10.3 * BAR, (g) => { g.setCombat(true); g.setIntensity(0.85); }],
    [20.5 * BAR, (g) => { g.setCombat(false); g.setIntensity(0.6); }],
  ]);
  for (let i = 1; i < bars.length; i++) assert.ok(Math.abs(bars[i].t - bars[i - 1].t - BAR) < 1e-9, `bar ${i} on the grid`);
  const states = bars.map((b) => b.plan.state);
  const tenseAt = states.indexOf('tense'), fightAt = states.indexOf('fight');
  assert.equal(tenseAt, 6, 'tense from the bar after the call');
  assert.equal(bars[tenseAt].plan.bar, 6, 'tense goes on with the calm\'s bar clock');
  assert.equal(fightAt, 11, 'the fight on the next bar line');
  assert.equal(bars[fightAt].plan.bar, 0, 'the fight starts its own form');
  assert.ok(bars[fightAt].plan.fx.crash, 'on a crash');
  const back = states.indexOf('tense', fightAt);
  assert.ok(back >= 22 && back <= 23, 'the fight ends on its closing bar, then tense');
  assert.ok(bars[back - 1].plan.parts.fill, 'the closing bar ends on a fill');
});

test('groove: a fight plays its minimum, kill chain stages go up at once and down one a bar', () => {
  const t = TRACKS.couteau, BAR = barOf(t);
  const short = play(t, 12 * BAR, [[2.5 * BAR, (g) => g.setCombat(true)], [2.6 * BAR, (g) => g.setCombat(false)]], { intensity: 0.6 });
  assert.equal(short.filter((b) => b.plan.state === 'fight').length, 3, 'two bars of fight and its closing bar');
  const bars = play(t, 20 * BAR, [
    [0, (g) => g.setCombat(true)], [2.5 * BAR, (g) => g.setCombo(5)], [8.5 * BAR, (g) => g.setCombo(0)],
  ], { intensity: 0.85 });
  const levels = bars.map((b) => b.plan.level);
  assert.deepEqual(levels.slice(0, 3), [2, 2, 2]);
  assert.equal(levels[3], 7, 'a chain of five: all the layers at once');
  assert.ok(bars[3].plan.fx.sting, 'with a stinger');
  assert.deepEqual(levels.slice(9, 15), [6, 5, 4, 3, 2, 2], 'then they go one a bar');
});

test('groove: every instrument of every track renders in tune, finite, normalized, and plays on a strict context', () => {
  const seen = new Set();
  for (const t of GROOVES) {
    const g = new Groove(t);
    for (const spec of g._specs()) {
      const key = JSON.stringify(spec);
      if (seen.has(key)) continue;
      seen.add(key);
      const r = render(spec, 8000);
      let peak = 0;
      for (const d of r.ch) for (const v of d) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
      assert.ok(peak > 0.05 && peak <= 1.0001, `${key}: peak ${peak}`);
    }
  }
  // the plucked strings (Karplus-Strong) land on their note: autocorrelation of 80 ms past the attack
  const pitch = (x, sr) => {
    const a = Math.floor(0.03 * sr), n = Math.floor(0.08 * sr);
    let best = -Infinity, lag = 0;
    for (let L = Math.floor(sr / 1000); L < Math.floor(sr / 40); L++) { let s = 0; for (let i = a; i < a + n; i++) s += x[i] * x[i + L]; if (s > best) { best = s; lag = L; } }
    return sr / lag;
  };
  for (const [spec, m] of [[{ voice: 'bass', tone: 'finger', m: 33, ghost: false, dead: false, pop: false }, 33], [{ voice: 'guitar', notes: [64], art: 'open' }, 64]]) {
    const r = render(spec, 44100), f = pitch(r.ch[0], r.rate);
    assert.ok(Math.abs(1200 * Math.log2(f / mtof(m))) < 25, `${spec.voice} at ${f.toFixed(1)} Hz for ${mtof(m).toFixed(1)}`);
  }
  // and a minute of each track, from the calm to the top of a chain, schedules nothing a browser would refuse
  for (const t of LEVEL_TRACKS) {
    const BAR = barOf(t);
    const bars = play(t, 14 * BAR, [[2.5 * BAR, (g) => g.setIntensity(0.7)], [4.5 * BAR, (g) => g.setCombat(true)],
      ...[1, 2, 3, 4, 5].map((n) => [(5.5 + n) * BAR, (g) => g.setCombo(n)])]);
    assert.ok(bars.length >= 13, t.id);
  }
});

test('groove theory: chords, voicings without semitone rubs, note names, melodies, step maps', () => {
  assert.deepEqual(chord('Dm9').pcs, [2, 5, 9, 0, 4]);
  assert.equal(chord('Gmaj7/F#').bass, 6);
  assert.equal(chord('A7sus4').third, 5);
  assert.throws(() => chord('Hm7'));
  for (const sym of ['Dm9', 'G13', 'F#m9', 'Bb13', 'Cmaj7', 'E6']) {
    const v = voicing(chord(sym), { n: 4, lo: 55, hi: 79 });
    assert.equal(v.length, 4);
    for (let i = 1; i < v.length; i++) assert.ok(v[i] - v[i - 1] > 1, `${sym}: ${v}`);
    for (const m of v) assert.ok(chord(sym).pcs.includes(m % 12));
  }
  assert.equal(midi('A4'), 69); assert.equal(midi('C#5'), 73); assert.equal(midi('Bb3'), 58);
  assert.deepEqual(mel('0:A4:3 3:D5 6:F5:2'), [[0, 69, 3], [3, 74, 1], [6, 77, 2]]);
  assert.deepEqual(tokens('R-.o').map((x) => [x.s, x.tok, x.len, x.accent]), [[0, 'R', 2, true], [3, 'o', 1, false]]);
  assert.equal(atLevel({ 1: 'a', 4: 'b', 6: null }, 0), undefined);
  assert.equal(atLevel({ 1: 'a', 4: 'b', 6: null }, 5), 'b');
  assert.equal(atLevel({ 1: 'a', 4: 'b', 6: null }, 7), null);
});

test('music: a level plays its own track (the default without one), the conductor hands the game state over on a switch', () => {
  assert.equal(trackOf(LEVELS_DATA.level1), DEFAULT_TRACK, 'level 1 keeps the current score until a track is chosen');
  assert.equal(trackOf(LEVELS_DATA.tutorial), DEFAULT_TRACK);
  assert.equal(trackOf({ music: 'velours' }), 'velours');
  assert.equal(trackOf({ music: 'nope' }), DEFAULT_TRACK);
  const ctx = mockContext();
  Object.assign(Music, { ctx, dest: ctx.destination });
  try {
    Music.setTrack('riviera');
    Music.setCombat(true); Music.setCombo(3); Music.setIntensity(0.9);
    Music.start();
    const a = Music.player;
    assert.equal(a.id, 'riviera');
    a._tick(0.3);
    Music.setTrack('nope'); // the default: the synthwave score
    assert.ok(!a.playing && Music.playing && Music.player !== a, 'the old one stopped, the new one plays');
    assert.equal(Music.player.combo, 3);
    assert.ok(Music.player.combat && Music.player.target === 0.9, 'it picks up the game where it is');
    Music.setTrack(MENU_TRACK);
    assert.equal(Music.player.id, MENU_TRACK);
    Music.stop();
    assert.ok(!Music.playing);
  } finally {
    Music.stop();
    for (const p of Music.players.values()) clearInterval(p.timer);
    Object.assign(Music, { ctx: null, dest: null });
  }
});
