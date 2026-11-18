// Campaign progression (which levels are open, which were finished), kept in localStorage. DOM-free like Records.js:
// the storage is injectable and every access is guarded since storage can be missing, full or forbidden.
import { clearBest } from './Records.js';

const KEY = 'fmr.progress.v1';

// the order the levels unlock in (an id that is not in the level registry yet is simply skipped by the menu)
export const CAMPAIGN = ['tutorial', 'level1'];

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

const fresh = () => ({ unlocked: [CAMPAIGN[0]], done: [] });
const ids = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string'))] : []);

// { unlocked: [ids], done: [ids] }: the first campaign level is always open, a finished level is open too
export function loadProgress(storage = defaultStorage()) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(KEY)); } catch { /* nothing usable stored */ }
  if (!raw || typeof raw !== 'object') return fresh();
  const done = ids(raw.done);
  return { unlocked: ids([CAMPAIGN[0], ...ids(raw.unlocked), ...done]), done };
}

export function saveProgress(p, storage = defaultStorage()) {
  try { storage.setItem(KEY, JSON.stringify({ unlocked: p.unlocked, done: p.done })); } catch { /* applied this session */ }
}

export const isUnlocked = (p, id) => p.unlocked.includes(id) || p.done.includes(id);

// the campaign level after `id`, or null (last one, or not a campaign level)
export function nextLevel(id) {
  const i = CAMPAIGN.indexOf(id);
  return i >= 0 && i < CAMPAIGN.length - 1 ? CAMPAIGN[i + 1] : null;
}

// a new progress with `id` finished and the next campaign level open (a level outside the campaign changes nothing)
export function complete(p, id) {
  if (!CAMPAIGN.includes(id)) return p;
  const next = nextLevel(id);
  return {
    unlocked: [...new Set([...p.unlocked, id, ...(next ? [next] : [])])],
    done: [...new Set([...p.done, id])],
  };
}

// the furthest open campaign level that `has(id)` (it is in the level registry), or null: what CONTINUE starts
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
