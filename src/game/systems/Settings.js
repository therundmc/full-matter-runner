// Player settings, kept in localStorage. DOM-free like Records.js: the storage is injectable and every access is
// guarded since storage can be missing, full or forbidden.
//   master, music, sfx, ambience  volumes, 0..1 (sfx = effects, ambience = the beds of the night)
//   lens                the WebGL last pass of the picture on (render/PostGL.js)
//   shake               how much the camera shakes, 0..1 (Camera.shakeScale)
//   fullscreen          the game wants the whole screen (re-entered at the first key or click of a session)
const KEY = 'fmr.settings.v1';
const DEFAULTS = { master: 1, music: 1, sfx: 1, ambience: 1, lens: true, shake: 1, fullscreen: false };

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

// every key of DEFAULTS: missing or garbage values fall back to the default, numbers are clamped to 0..1
export function loadSettings(storage = defaultStorage()) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(KEY)); } catch { /* nothing usable stored */ }
  const out = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const k in DEFAULTS) {
      const v = raw[k];
      if (typeof DEFAULTS[k] === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
      else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(1, Math.max(0, v));
    }
  }
  return out;
}

export function saveSettings(settings, storage = defaultStorage()) {
  const out = {};
  for (const k in DEFAULTS) out[k] = settings[k] ?? DEFAULTS[k];
  try { storage.setItem(KEY, JSON.stringify(out)); } catch { /* not saved: still applied this session */ }
}
