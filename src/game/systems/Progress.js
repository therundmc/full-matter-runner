// Campaign progression (which levels are open, which were finished), kept in localStorage. DOM-free like Records.js:
// the storage is injectable and every access is guarded since storage can be missing, full or forbidden.
import { clearBest } from './Records.js';
import { CAMPAIGN_LEVELS as LEVELS } from '../data/campaign.js';

const KEY = 'fmr.progress.v1';

// the engine's levels (stages) in the order they are played, made or not: data/campaign.js, where a level as the
// player sees it is one or several of them (02 = level2a then level2b). `has(id)`: is that stage in the level
// registry (made); without one every stage counts.
export const CAMPAIGN = LEVELS.flatMap((l) => l.stages);
const all = () => true;

// the player's level a stage belongs to (null: not a campaign level), and its number on the screens: level2a -> 2
export const levelOf = (id) => LEVELS.find((l) => l.stages.includes(id)) || null;
export const levelNumber = (id) => levelOf(id)?.n ?? null;
// a level's number as its note writes it: 00, 01, 02...
export const levelTag = (level) => String(level.n).padStart(2, '0');
// the stage a level starts at: its first made one (null: none made yet, the level is SOON)
export const levelStart = (level, has = all) => level.stages.find(has) ?? null;
// a level is done when its last made stage is (2A done with 2B not made yet: 02 is done)
export function levelDone(p, level, has = all) {
  const made = level.stages.filter(has);
  return made.length > 0 && p.done.includes(made[made.length - 1]);
}
// A level's best result from its stages' (best(id) -> { total, grade, time } | null, systems/Records.js keeps them by
// stage): the stage's own when one is made; with several, once each has one, their scores and times added and the
// lowest of their grades.
const GRADES = 'SABCD';
export function levelBest(level, best, has = all) {
  const each = level.stages.filter(has).map((id) => best(id));
  if (!each.length || each.some((b) => !b)) return null;
  if (each.length === 1) return each[0];
  return {
    total: each.reduce((n, b) => n + b.total, 0), time: each.reduce((n, b) => n + (b.time || 0), 0),
    grade: each.map((b) => b.grade).sort((x, y) => GRADES.indexOf(y) - GRADES.indexOf(x))[0],
  };
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

const fresh = () => ({ unlocked: [CAMPAIGN[0]], done: [] });
const ids = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string'))] : []);

// { unlocked: [ids], done: [ids] }: the first campaign level is always open, a finished level is open too, and so is
// the made one after it (a save from before that level was made opens it on load)
export function loadProgress(storage = defaultStorage(), has = all) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(KEY)); } catch { /* nothing usable stored */ }
  if (!raw || typeof raw !== 'object') return fresh();
  const done = ids(raw.done);
  return { unlocked: ids([CAMPAIGN[0], ...ids(raw.unlocked), ...done, ...done.map((id) => nextLevel(id, has)).filter(Boolean)]), done };
}

export function saveProgress(p, storage = defaultStorage()) {
  try { storage.setItem(KEY, JSON.stringify({ unlocked: p.unlocked, done: p.done })); } catch { /* applied this session */ }
}

export const isUnlocked = (p, id) => p.unlocked.includes(id) || p.done.includes(id);

// the made stage played after `id`, or null (the last one, or not a campaign level)
export function nextLevel(id, has = all) {
  const i = CAMPAIGN.indexOf(id);
  return i < 0 ? null : CAMPAIGN.slice(i + 1).find(has) ?? null;
}

// a new progress with `id` finished and the next made stage open (a level outside the campaign changes nothing)
export function complete(p, id, has = all) {
  if (!CAMPAIGN.includes(id)) return p;
  const next = nextLevel(id, has);
  return {
    unlocked: [...new Set([...p.unlocked, id, ...(next ? [next] : [])])],
    done: [...new Set([...p.done, id])],
  };
}

// the furthest open stage that `has(id)` (it is in the level registry), or null: what CONTINUE starts
export function latest(p, has) {
  for (let i = CAMPAIGN.length - 1; i >= 0; i--) if (isUnlocked(p, CAMPAIGN[i]) && has(CAMPAIGN[i])) return CAMPAIGN[i];
  return null;
}

// How many dead targets the hit list (ui/title/HitList.js) has already shown crossed out: the X is drawn by the
// marker once, the first time the board shows a man dead.
const CROSSED = 'fmr.crossed.v1';
export function loadCrossed(storage = defaultStorage()) {
  try { const n = Number(storage.getItem(CROSSED)); return Number.isInteger(n) && n > 0 ? n : 0; } catch { return 0; }
}
export function saveCrossed(n, storage = defaultStorage()) {
  try { storage.setItem(CROSSED, String(n)); } catch { /* shown again next time */ }
}

// back to a fresh save: progression and best results erased; returns the fresh progress
export function resetProgress(storage = defaultStorage()) {
  try { storage.removeItem(KEY); storage.removeItem(CROSSED); } catch { /* nothing stored, or storage refused */ }
  clearBest(storage);
  return fresh();
}
