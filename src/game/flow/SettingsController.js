// The settings put in force and kept (systems/Settings.js stores them): the volumes, QUALITY (and AUTO's eye on the
// frame time), the shake, the rumble, fullscreen. The values live in Game.settings (the menu's pages read them there);
// this is what changing one does.
// Fullscreen tells the truth: whoever left it (Esc, the browser), the toggle follows; what is kept for the next
// session is only what was chosen (the menu's toggle: fullChoice), never the browser throwing us out.
// Nothing here touches the DOM until listen() (Game's constructor).
import Audio from '../../audio/Audio.js';
import { saveSettings } from '../systems/Settings.js';
import { setQuality, qualityLevel, QualityWatch } from '../systems/Quality.js';

const VOLUMES = ['master', 'music', 'sfx', 'ambience'];

export default class SettingsController {
  constructor(game) {
    const s = game.settings;
    this.game = game;
    this.wantFull = s.fullscreen;      // asked last session: taken again at the first key or click (gesture)
    this.fullChoice = !!s.fullscreen;  // what the menu's toggle chose: what is kept
    this.fullAsk = null;               // what setFullscreen asked, until the browser answers
    this.watch = new QualityWatch(s.autoQuality); // AUTO's eye on the frame time (systems/Quality.js)
  }

  // the browser's fullscreen as it is now, and its changes from now on
  listen() {
    this.game.settings.fullscreen = !!document.fullscreenElement;
    document.addEventListener('fullscreenchange', () => this.onFullscreen(!!document.fullscreenElement));
  }

  // every setting put in force (at the start)
  applyAll() { for (const k of [...VOLUMES, 'quality', 'shake', 'rumble']) this.apply(k); }

  // what a setting does once changed (the value is already in Game.settings; fullscreen goes by setFullscreen)
  apply(key) {
    const g = this.game, v = g.settings[key];
    if (VOLUMES.includes(key)) Audio.setVolume(key, v);
    else if (key === 'quality') this.applyQuality();
    else if (key === 'shake') g.camera.shakeScale = v;
    else if (key === 'rumble') g.rumble.setScale(v);
  }

  // The QUALITY option put in force (data/quality.js): what the renderers read from now on, and the scene's size
  // with it (FrameRenderer.fit). AUTO goes on from the level it had settled on.
  applyQuality() {
    this.watch.level = setQuality(qualityLevel(this.game.settings)).level;
    this.watch.rest();
    this.game.resize();
  }

  // AUTO: the frame's real time (ms) told to its watch, in play only (no hit-stop); a level down is put in force at
  // once and kept for the next session
  watchPace(ms) {
    const g = this.game;
    if (g.settings.quality !== 'auto') return;
    const to = this.watch.frame(ms, g.state === 'play' && !!g.world && !(g.hitstop > 0));
    if (!to) return;
    g.settings.autoQuality = to;
    this.applyQuality();
    this.save();
  }

  // save: false while a slider is dragged (saved on release)
  set(key, value, save = true) {
    const s = this.game.settings;
    if (key === 'fullscreen') { this.setFullscreen(value); return; } // the setting follows fullscreenchange
    if (s[key] === value) return;
    if (key === 'quality' && value === 'auto') s.autoQuality = 'high'; // chosen again: it finds its level anew
    s[key] = value;
    this.apply(key);
    if (save) this.save();
  }

  // the settings kept for the next session: fullscreen as chosen, not as the browser left it (onFullscreen)
  save() { saveSettings({ ...this.game.settings, fullscreen: this.fullChoice }); }

  // a key or a click (the browser's gesture): fullscreen asked last session, or from the pad, is taken now
  gesture() {
    if (!this.wantFull) return;
    this.wantFull = false;
    this.setFullscreen(true);
  }

  // must run within a key press or a click (the browser's rule): Game.update is called on the frame after one
  setFullscreen(on) {
    // a pad's button is no gesture to the browser: asked from the pad, it is taken at the next key or click
    if (on && globalThis.navigator?.userActivation?.isActive === false) { this.wantFull = true; return; }
    this.fullAsk = on;
    try {
      const d = document, p = on ? d.documentElement.requestFullscreen?.() : d.fullscreenElement && d.exitFullscreen?.();
      p?.catch?.(() => {});
    } catch { /* refused: the toggle keeps showing the truth */ }
  }

  // fullscreen came or went: the toggle shows it; kept when it is what was asked; in it, ESC is the game's (the
  // browser's keyboard lock: held, it still leaves), so that it pauses instead of throwing us out
  onFullscreen(on) {
    this.game.settings.fullscreen = on;
    if (this.fullAsk === on) { this.fullChoice = on; this.save(); }
    this.fullAsk = null;
    if (!on) return;
    try { globalThis.navigator?.keyboard?.lock?.(['Escape'])?.catch?.(() => {}); } catch { /* no lock: ESC leaves */ }
  }
}
