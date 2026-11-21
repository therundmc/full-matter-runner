// The soundtrack: one track at a time out of the registry (audio/tracks/index.js), each played by its engine
// (audio/Synthwave.js for the synthwave score, audio/groove/Groove.js for the groove tracks). A level names its track
// (level `music`, tracks/index.js trackOf), the title screen plays the menu's (MENU_TRACK).
// Public API: setTrack(id), start(), stop(), setIntensity(0..1), setCombat(on), setCombo(n), setJukebox(0..1). The
// game's state (intensity, fight, chain) is kept here and handed to the track playing, so a change of track picks
// up where the game is. A new track starts on its own downbeat while the old one fades out. setJukebox (how well the
// bar's jukebox is heard) does nothing today: its synthesized band was dropped (the user found it horrible, see
// systems/Jukebox.js); it is kept for recorded music, which may bring a jukebox stem.
import Audio from './Audio.js';
import Synthwave from './Synthwave.js';
import Groove from './groove/Groove.js';
import { TRACKS, DEFAULT_TRACK } from './tracks/index.js';

class Music {
  constructor() {
    this.ctx = null;  // the context and the destination: the game's Audio context and music bus unless set
    this.dest = null;
    this.track = DEFAULT_TRACK;
    this.players = new Map(); // track id -> its player (kept: their instruments are rendered once)
    this.player = null;       // the one playing
    this.playing = false;
    this.game = { intensity: 0, combat: false, combo: 0 };
  }

  // one-shots in flight in the track playing (F8's perf overlay)
  get liveVoices() { return this.player ? this.player.liveVoices : 0; }

  // the track to play (an unknown id plays the default); while playing, it takes over at once
  setTrack(id) {
    if (!TRACKS[id]) id = DEFAULT_TRACK;
    if (id === this.track) return;
    this.track = id;
    if (!this.playing) return;
    this._halt();
    this.start();
  }

  start() {
    const ctx = this.ctx || Audio.ctx;
    if (!ctx || this.playing) return;
    const p = this._player(this.track);
    Object.assign(p, { ctx, dest: this.dest || Audio.music });
    const g = this.game;
    p.setIntensity(g.intensity); p.setCombat(g.combat); p.setCombo(g.combo);
    p.start();
    this.player = p;
    this.playing = true;
  }

  stop() { if (this.playing) this._halt(); }

  setIntensity(v) { this.game.intensity = v; this.player?.setIntensity(v); }
  setCombat(on) { this.game.combat = !!on; this.player?.setCombat(on); }
  setCombo(n) { this.game.combo = n || 0; this.player?.setCombo(n); }
  setJukebox() { /* no band of its own (see above) */ }

  _halt() {
    this.player.stop();
    this.player = null;
    this.playing = false;
  }

  // the player of a track (made once); the groove tracks not playing let go of their instruments (memory)
  _player(id) {
    for (const [other, p] of this.players) if (other !== id && p.release) p.release();
    let p = this.players.get(id);
    if (!p) {
      const t = TRACKS[id];
      p = t.engine === 'synthwave' ? new Synthwave() : new Groove(t);
      this.players.set(id, p);
    }
    return p;
  }
}

export default new Music();
