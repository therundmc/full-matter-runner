// Player settings (volumes), kept in localStorage. DOM-free like Records.js: the storage is injectable and every
// access is guarded since storage can be missing, full or forbidden.
const KEY = 'fmr.settings.v1';
const DEFAULTS = { master: 1, music: 1, sfx: 1 };

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

// { master, music, sfx }, each 0..1 (missing or garbage values fall back to the default, others are clamped)
export function loadSettings(storage = defaultStorage()) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(KEY)); } catch { /* nothing usable stored */ }
  const out = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const k in DEFAULTS) {
      if (typeof raw[k] === 'number' && Number.isFinite(raw[k])) out[k] = Math.min(1, Math.max(0, raw[k]));
    }
  }
  return out;
}

export function saveSettings(settings, storage = defaultStorage()) {
  const { master, music, sfx } = settings;
  try { storage.setItem(KEY, JSON.stringify({ master, music, sfx })); } catch { /* not saved: still applied this session */ }
}
