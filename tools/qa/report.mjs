// Report side of the QA tool: analyses that need the whole run (leaks, speed, coverage) and the files an agent or
// the developer reads afterwards (report.json, report.md). Pure Node, no browser.
import fs from 'node:fs';
import path from 'node:path';

// what each count may reach in a session before steady growth is suspicious
const CAPS = { bodies: 2500, debris: 200, particles: 4000, corpses: 80, items: 120, texts: 60, projectiles: 200 };
const HEAP_GROWTH_MB = 150; // within a session
const HEAP_ACROSS_MB = 120; // between the first and last session starts

// series that only goes up (small dips tolerated), at least `min` samples
function climbing(values, min = 6) {
  const v = values.filter((x) => typeof x === 'number');
  if (v.length < min) return false;
  let ups = 0, downs = 0;
  for (let i = 1; i < v.length; i++) { if (v[i] > v[i - 1]) ups++; else if (v[i] < v[i - 1]) downs++; }
  return v[v.length - 1] > v[0] && downs <= Math.max(1, Math.floor(v.length * 0.1)) && ups >= (v.length - 1) * 0.5;
}

// leak findings from the samples (taken every 10 s of game time, see bot.js)
export function leakFindings(samples) {
  const out = [];
  const bySession = new Map();
  for (const s of samples) { if (!bySession.has(s.session)) bySession.set(s.session, []); bySession.get(s.session).push(s); }
  const seen = new Set();
  for (const [session, list] of bySession) {
    for (const k of Object.keys(CAPS)) {
      const series = list.map((s) => s[k]);
      const last = series[series.length - 1];
      if (seen.has(k) || !(last > CAPS[k]) || !climbing(series)) continue;
      seen.add(k);
      out.push(finding('leak', 'warn', k, session, list[list.length - 1].t, { what: k, cap: CAPS[k], series: series.slice(-30), times: list.map((s) => s.t).slice(-30) }));
    }
    const heap = list.map((s) => s.heap);
    if (!seen.has('heap') && heap[0] != null && heap[heap.length - 1] - heap[0] > HEAP_GROWTH_MB && climbing(heap)) {
      seen.add('heap');
      out.push(finding('leak', 'warn', 'heap', session, list[list.length - 1].t, { what: 'JS heap (MB) within a session', series: heap.slice(-30) }));
    }
  }
  return out;
}

// the heap at the start of each session should come back to about the same level (worlds are released)
export function crossSessionLeak(sessions) {
  const starts = sessions.map((s) => s.heapStart).filter((h) => typeof h === 'number');
  if (starts.length < 5) return [];
  if (starts[starts.length - 1] - starts[0] > HEAP_ACROSS_MB && climbing(starts, 5)) {
    return [finding('leak', 'warn', 'heap-across-sessions', null, null, { what: 'JS heap (MB) at each session start keeps rising: old worlds not released?', series: starts.slice(-30) })];
  }
  return [];
}

export function slowFindings(mode, timing, perfSamples) {
  const out = [];
  if (mode === 'fast' && timing.n > 0) {
    const mean = timing.ms / timing.n;
    if (mean > 6) out.push(finding('slow', 'warn', 'mean-step', null, null, { why: 'mean game.update step over 6 ms', meanMs: +mean.toFixed(2), steps: timing.n }));
  }
  perfSamples = perfSamples.filter((p) => p.t > 3); // the first frames load the level
  if (mode === 'realtime' && perfSamples.length) {
    const up = perfSamples.reduce((s, p) => s + p.update, 0) / perfSamples.length;
    const worst = perfSamples.reduce((m, p) => (p.worst > m.worst ? p : m), perfSamples[0]);
    if (up > 6) out.push(finding('slow', 'warn', 'mean-update', null, null, { why: 'mean update per frame over 6 ms (game.perf)', meanMs: +up.toFixed(2) }));
    if (worst.worst > 50) out.push(finding('slow', 'warn', 'worst-frame', null, worst.t, { why: 'a frame over 50 ms (game.perf.worst)', worstMs: +worst.worst.toFixed(1), at: worst.t, perf: worst }));
  }
  return out;
}

export function coverageFindings(coverage, gameSeconds, notApplicable = []) {
  if (gameSeconds < 300) return []; // a long session only (5 game minutes and more)
  return Object.entries(coverage).filter(([f, n]) => !n && !notApplicable?.includes(f)).map(([f]) => finding('not-covered', 'warn', f, null, null,
    { feature: f, why: `never exercised in ${Math.round(gameSeconds)} s of game time (the bot cannot reach it, or the game no longer offers it)` }));
}

function finding(kind, severity, sig, session, t, detail) {
  return { key: `${kind}|${sig}`, kind, severity, sig, t, session, pos: null, detail, lastActions: [], count: 1 };
}

// ---------------------------------------------------------------- files
const fmtPos = (p) => (p ? `(${p.x}, ${p.y}) cell ${p.cell?.join(',')}` : '-');
const oneLine = (o, n = 160) => { const s = typeof o === 'string' ? o : JSON.stringify(o); return s.length > n ? s.slice(0, n - 3) + '...' : s; };
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const list = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '-';

export function writeReport(dir, rep) {
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(rep, null, 1));
  const st = rep.stats || {};
  const f = rep.findings;
  const L = [];
  L.push(`# QA report: ${rep.options.level}, seed ${rep.options.seed}, ${rep.options.mode}${rep.options.god ? ', god' : ''}`);
  L.push('');
  L.push(`- Result: **${rep.result}** (exit code ${rep.exitCode}): ${rep.summary.errors} error kind(s), ${rep.summary.warns} warning kind(s)${rep.interrupted ? ', INTERRUPTED' : ''}${rep.toolError ? `, TOOL ERROR: ${rep.toolError}` : ''}`);
  L.push(`- Covered ${fmtTime(rep.gameSeconds)} of game time in ${fmtTime(rep.realSeconds)} real (${rep.steps} steps), started ${rep.startedAt}`);
  L.push(`- Replay: \`${rep.replay}\``);
  L.push('');
  L.push('## Findings');
  L.push('');
  if (!f.length) L.push('None.');
  else {
    L.push('| severity | kind | signature | count | first at | sessions | screenshot |');
    L.push('|---|---|---|---|---|---|---|');
    for (const x of f) {
      L.push(`| ${x.severity} | ${x.kind} | ${esc(oneLine(x.sig, 80))} | ${x.count} | ${x.t ?? '-'} s | ${x.session ?? '-'}${x.lastSession && x.lastSession !== x.session ? '..' + x.lastSession : ''} | ${x.screenshot ? `[png](${x.screenshot})` : '-'} |`);
    }
    L.push('');
    L.push('### First occurrences');
    for (const x of f) {
      L.push('');
      L.push(`#### ${x.severity.toUpperCase()} ${x.kind}: ${esc(oneLine(x.sig, 120))} (x${x.count})`);
      L.push(`- at ${x.t ?? '-'} s of run time (world time ${x.worldT ?? '-'} s), session ${x.session ?? '-'}, position ${fmtPos(x.pos)}`);
      if (x.detail) {
        const { stack, ...rest } = x.detail;
        L.push('- detail: `' + oneLine(rest, 900).replace(/`/g, "'") + '`');
        if (stack) { L.push('', '```', stack, '```'); }
      }
      if (x.lastActions?.length) L.push(`- bot's last actions: ${x.lastActions.join(' / ')}`);
      if (x.screenshot) L.push(`- screenshot: [${x.screenshot}](${x.screenshot})`);
    }
  }
  L.push('');
  L.push('## Statistics');
  L.push('');
  L.push(`- Sessions: ${st.sessions ?? 0}, deaths: ${sum(st.deaths)}, clears (results screen): ${st.clears?.length ?? 0}, give-ups (no kill for long, restarted): ${st.giveUps ?? 0}, forced restarts: ${st.forcedRestarts ?? 0}${st.restartsAfterClear ? `, restarts a minute after clearing a level with no exit: ${st.restartsAfterClear}` : ''}`);
  L.push(`- Deaths by cause: ${list(st.deaths)}; by killer: ${list(st.deathsBy)}`);
  L.push(`- Guards killed: ${st.kills ?? 0} (by the player ${st.playerKills ?? 0}); most in one session: ${st.maxKills ?? 0} (session ${st.maxKillsSession ?? '-'}) of ${rep.guards ?? '?'}`);
  L.push(`- Kills by style: ${list(st.styles)}`);
  L.push(`- Kill tags seen: ${list(st.tags)}`);
  L.push(`- Kill weapons: ${list(st.killWeapons)}; picked up: ${list(st.picked)}; shots fired: ${list(st.fired)}; ammunition seen on the floor: ${st.ammoOnFloor ?? 0}`);
  L.push(`- Civilians killed: ${list(st.civilians)}`);
  if (st.clears?.length) L.push(`- Clears: ${st.clears.map((c) => `session ${c.session}: ${c.grade} ${c.score} in ${c.time} s`).join('; ')}`);
  L.push(`- Coverage: ${Object.entries(st.coverage || {}).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  L.push(`- Devices used: ${list(st.devices || {})}; falls on a slick floor: ${st.slips ?? 0}`);
  if (st.notApplicable?.length) L.push(`- Not in this level (no warning): ${st.notApplicable.join(', ')}`);
  L.push(`- How the dead went: ${list(st.dying)}`);
  L.push(`- Plans (started / done / cut short by a death or restart / skipped as pointless, failures): ${planLines(st.plans)}`);
  L.push(`- Bot goals: ${list(st.goals)}; abandoned: ${st.goalsAbandoned ?? 0}; one-step wall contacts (not reported): ${st.transientInWall ?? 0}`);
  if (rep.perf) L.push(`- Speed: ${rep.perf}`);
  if (rep.bot) L.push(`- Bot at the end: \`${oneLine(rep.bot, 600).replace(/`/g, "'")}\``);
  L.push('');
  L.push('## Files');
  L.push('');
  L.push('- `report.json`: everything above, machine readable (findings with full details, stats, per-session samples)');
  L.push('- `browser.log`: the page console (errors, warnings, logs) and the browser log');
  L.push('- `*.png`: one screenshot per finding kind, at its first occurrence (the camera on the spot when it has one)');
  L.push('');
  fs.writeFileSync(path.join(dir, 'report.md'), L.join('\n'));
}

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const planLines = (plans) => Object.entries(plans || {}).map(([name, p]) => {
  const failed = Object.entries(p.failed).map(([at, n]) => `${at} x${n}`).join('; ');
  return `${name} ${p.started}/${p.done}/${p.cut ?? 0}/${p.skipped}${failed ? ` (failed: ${failed})` : ''}`;
}).join(', ') || '-';
export function fmtTime(s) { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// ten lines for the terminal
export function summaryLines(rep) {
  const st = rep.stats || {};
  const errs = rep.findings.filter((x) => x.severity === 'error'), warns = rep.findings.filter((x) => x.severity === 'warn');
  const nk = (l) => new Set(l.map((x) => x.kind)).size;
  const kinds = (l) => Object.entries(l.reduce((o, x) => { o[x.kind] = (o[x.kind] || 0) + x.count; return o; }, {})).map(([k, n]) => `${k} x${n}`).join(', ') || 'none';
  return [
    `QA ${rep.result}: ${rep.options.level} seed ${rep.options.seed} ${rep.options.mode}${rep.options.god ? ' god' : ''}, ${fmtTime(rep.gameSeconds)} game in ${fmtTime(rep.realSeconds)} real`,
    `errors (${nk(errs)} kinds): ${kinds(errs)}`,
    `warnings (${nk(warns)} kinds): ${kinds(warns)}`,
    `sessions ${st.sessions ?? 0}, deaths ${sum(st.deaths)} (${list(st.deaths)}), clears ${st.clears?.length ?? 0}, give-ups ${st.giveUps ?? 0}`,
    `guards killed by the bot ${st.playerKills ?? 0}, best session ${st.maxKills ?? 0}/${rep.guards ?? '?'}`,
    `styles: ${list(st.styles)}`,
    `coverage: ${Object.entries(st.coverage || {}).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    rep.perf ? `speed: ${rep.perf}` : 'speed: -',
    `report: ${rep.dir}${path.sep}report.md`,
    `replay: ${rep.replay}`,
  ];
}
