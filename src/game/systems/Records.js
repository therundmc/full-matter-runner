// Best result per level, kept in localStorage (DOM-free: the storage is injectable, every access is guarded since
// storage can be missing, full or forbidden).
const KEY = 'fmr.best.v1';

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function readAll(storage) {
  try {
    const all = JSON.parse(storage.getItem(KEY));
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {}; // (an array would lose the named keys)
  } catch { return {}; }
}

// { total, grade, time } of the best run of a level, or null
export function loadBest(levelId, storage = defaultStorage()) {
  const b = readAll(storage)[levelId];
  return b && Number.isFinite(b.total) ? b : null;
}

// Keeps `result` ({ total, grade, time }) if it beats the stored one. Returns the previous best (or null) and
// whether this run is a new record.
export function saveBest(levelId, result, storage = defaultStorage()) {
  const all = readAll(storage);
  const prev = all[levelId] && Number.isFinite(all[levelId].total) ? all[levelId] : null;
  const record = !prev || result.total > prev.total;
  if (record) {
    all[levelId] = { total: result.total, grade: result.grade, time: Math.round(result.time) };
    try { storage.setItem(KEY, JSON.stringify(all)); } catch { /* not saved: the run still counts on screen */ }
  }
  return { prev, record };
}

// forgets every level's best result (the menu's RESET PROGRESSION)
export function clearBest(storage = defaultStorage()) {
  try { storage.removeItem(KEY); } catch { /* nothing stored, or storage refused */ }
}
