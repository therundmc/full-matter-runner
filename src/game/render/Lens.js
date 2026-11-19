// The lens' director: what the last pass of the picture (render/PostGL.js) should do this frame, from what is going on
// in the game. Pure state and maths, no DOM, no WebGL: it listens to the world's events (a blow, a shot, a blast),
// is told the situation once a frame (`update`) and hands back plain numbers (`uniforms`). Settings: data/post.js.
//
// The situation (`view`), filled by Game every frame:
//   W, H, scale          picture size in px, world px -> picture px (the camera's zoom)
//   toScreen(x, y)       world point -> { x, y } in picture px
//   state, phase         the game's state ('title', 'play', 'dead', 'pause', 'results', ...) and the alert phase
//   powerOn              false once the house's fuse box is smashed (systems/Power.js)
//   timeScale, trauma    slow motion (1 = none), camera shake 0..1.2
//   look                 the player looks far (Shift)
//   combo                kills in the player's current chain (systems/Scoring.js)
//   player               { x, y, angle, move } with move: 'slide' | 'roll' | 'dive' | null
//   heat                 [{ x, y, kind: 'fire' | 'steam' }] hot spots in the world
//   lights               [{ x, y, k }] the brightest lamps in view, strongest first
//   drive                at the wheel (systems/Drive.js), else null: { k: his speed, share of flat out; angle: the way
//                        he goes (world rad); x, y: his car }
//   page                 a comic page covers the screen (the opening, the leap out of the tutorial, a level's closing
//                        page): nothing of the world reaches the picture, and what it left in the lens is dropped
import { POST } from '../data/post.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));
const copyGrade = (g) => ({ sat: g.sat, con: g.con, gain: [...g.gain], lift: [...g.lift], tint: [...g.tint], tintK: g.tintK });

export default class Lens {
  constructor(cfg = POST) {
    this.cfg = cfg;
    this.grade = copyGrade(cfg.grades.menu);
    this.edge = cfg.focus.edge; // soft edges, 0..1
    this.blur = 0;              // the whole picture soft (menus), 0..1
    this.smear = { x: 0, y: 0 };
    this.radial = 0;
    this.rush = 0;              // 0..1: the speed at the wheel, as the edges of the picture show it (speed.drive)
    this.rushA = 0;             // the way he goes (world rad), eased
    this.rampage = 0;           // 0..1: how hot the chain of kills runs
    this.combo = 0;             // kills in the chain, as of the last frame
    this.state = null;
    this.paged = false;         // a comic page was up last frame
    this.reset();
  }

  // a new run: nothing of the last one hangs in the air
  reset() {
    this.fringe = 0;   // px of colour fringe on top of the resting one
    this.kick = 0;     // 0..1: the colours pushed by a kill
    this.zoom = 0;     // zoom kick, and the world point it goes toward
    this.zoomAt = null;
    this.frame = 0;    // s of impact frame left
    this.frameGap = 0; // s before the next one may come
    this.glitch = 0;   // 0..1 torn tape
    this.waves = [];   // { x, y, t, kind }
    this.embers = [];  // { x, y, t }: where something just blew up, still hot
    this.muzzleT = 0;
    this.jolt = 0;     // a jolt of the car at the wheel, added to the speed's look for an instant
  }

  // listen to a world (a new one at every run)
  bind(events) {
    this.reset();
    events.on('blow', (e) => this.blow(e));
    events.on('kill', (e) => this.kill(e));
    events.on('explosion', (e) => this.blast(e));
    events.on('shot', (e) => this.shot(e));
    events.on('ride', (e) => this.ride(e));
  }

  // a jolt of the car he drives ({ beat }: systems/Drive.js): the edges streak harder for an instant, the colours
  // part there
  ride({ beat }) {
    const K = this.cfg.speed.drive.kick, k = K[beat];
    if (!k) return;
    this.jolt = Math.max(this.jolt, k);
    this.bump(K.fringe * k);
  }

  // a blow or a round landed on somebody: { power 0..1, byPlayer }: the lens shivers, no more (a kill is `kill`)
  blow({ power = 0.5, byPlayer = false }) {
    this.bump(this.cfg.fringe.blow * clamp01(power) * (byPlayer ? 1 : 0.5));
  }

  // the player killed somebody: the lens underlines it, harder for a heavy kill (punch.power)
  kill({ victim, killer, cause, how }) {
    if (!killer?.isPlayer || !victim || victim.isPlayer) return;
    const c = this.cfg, P = c.punch.power;
    const base = how?.finisher ? P.finisher : cause === 'explosion' ? P.blast : how?.heavy || how?.spin || how?.broke ? P.heavy
      : how?.from ? P.blow : P.round;
    // every kill of a chain lands harder than the last
    const p = base * Math.min(c.punch.combo.max, 1 + c.punch.combo.each * this.combo);
    this.combo++;
    this.bump(c.fringe.kill * p);
    this.kick = Math.max(this.kick, Math.min(1.6, p));
    if (c.punch.zoom * p > this.zoom) { this.zoom = c.punch.zoom * Math.min(1.6, p); this.zoomAt = { x: victim.x, y: victim.y }; }
    if (p >= c.punch.frameFrom && this.frameGap <= 0) { this.frame = c.punch.frame; this.frameGap = c.punch.frameGap; }
  }

  blast({ x, y }) {
    this.bump(this.cfg.fringe.blast);
    this.wave(x, y, 'blast');
    this.embers.push({ x, y, t: 0 });
    if (this.embers.length > 3) this.embers.shift();
  }

  // the player fired: a small kick of the lens, and a ring off the muzzle of a big gun (one per shot, not per pellet)
  shot({ shooter, weapon }) {
    if (!shooter?.isPlayer) return;
    const c = this.cfg, s = weapon?.shake || 0;
    if (this.muzzleT > 0) return;
    this.muzzleT = 0.04;
    this.bump(c.fringe.shot * Math.min(1, s / 0.5));
    if (s >= c.wave.muzzle.from) this.wave(shooter.x + Math.cos(shooter.angle) * 16, shooter.y + Math.sin(shooter.angle) * 16, 'muzzle');
  }

  bump(px) { this.fringe = Math.min(this.cfg.fringe.max, this.fringe + px); }

  wave(x, y, kind) {
    this.waves.push({ x, y, t: 0, kind });
    if (this.waves.length > this.cfg.wave.max) this.waves.shift();
  }

  // the tape tears: k 0..1
  tear(k) { this.glitch = Math.max(this.glitch, k); }

  // the look the situation calls for
  gradeFor(v) {
    const g = this.cfg.grades;
    if (v.state === 'dead') return g.dead;
    if (v.state !== 'play' && v.state !== 'pause' && v.state !== 'intro' && v.state !== 'outro') return g.menu;
    if (v.powerOn === false) return g.dark;
    return v.phase === 'alert' ? g.combat : v.phase === 'caution' || v.phase === 'evasion' ? g.caution : g.calm;
  }

  // dt: real seconds since the last frame (the lens does not slow down with the game)
  update(dt, v) {
    const c = this.cfg;
    if (v.state !== this.state) {
      if (v.state === 'dead') this.tear(c.tube.glitch.dead);
      else if (v.state === 'intro' || (v.state === 'play' && this.state === 'dead')) this.tear(c.tube.glitch.start);
      this.state = v.state;
    }
    // (a page shows as it is drawn: no kick, no heat of a chain, no grade still on its way from the world's)
    if (v.page && !this.paged) { this.reset(); this.rampage = 0; this.grade = copyGrade(this.gradeFor(v)); }
    this.paged = !!v.page;
    this.fringe *= Math.exp(-c.fringe.decay * dt);
    this.zoom *= Math.exp(-c.punch.zoomDecay * dt);
    this.kick *= Math.exp(-c.punch.kickDecay * dt);
    this.frame = Math.max(0, this.frame - dt);
    this.frameGap = Math.max(0, this.frameGap - dt);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.glitch = Math.max(0, this.glitch - dt / c.tube.glitch.life);
    for (const w of this.waves) w.t += dt;
    this.waves = this.waves.filter((w) => w.t < c.wave[w.kind].life);
    for (const e of this.embers) e.t += dt;
    this.embers = this.embers.filter((e) => e.t < c.heat.blast.life);

    // the chain of kills, as the score keeps it; the picture heats up with it
    this.combo = v.state === 'play' ? v.combo || 0 : 0;
    const R = c.rampage;
    this.rampage = ease(this.rampage, clamp01((this.combo - R.from + 1) / (R.full - R.from + 1)), R.ease, dt);

    // grading: ease every number toward the situation's
    const to = this.gradeFor(v), g = this.grade, r = c.gradeEase;
    g.sat = ease(g.sat, to.sat, r, dt); g.con = ease(g.con, to.con, r, dt); g.tintK = ease(g.tintK, to.tintK, r, dt);
    for (const k of ['gain', 'lift', 'tint']) for (let i = 0; i < 3; i++) g[k][i] = ease(g[k][i], to[k][i], r, dt);

    // focus
    const f = c.focus;
    const edge = v.state === 'dead' ? f.dead : v.state === 'title' || v.state === 'loading' ? f.title : v.look && v.state === 'play' ? f.look : f.edge;
    const blur = v.state === 'pause' ? f.pause : v.state === 'results' ? f.results : 0;
    this.edge = ease(this.edge, edge, f.ease, dt);
    this.blur = ease(this.blur, blur, f.ease, dt);

    // speed: a smear along the move (picture heights, y up), a stream from the player in slow motion
    const s = c.speed, k = v.state === 'play' && v.player?.move ? s[v.player.move] || 0 : 0;
    const a = v.player?.angle || 0;
    this.smear.x = ease(this.smear.x, Math.cos(a) * k, s.ease, dt);
    this.smear.y = ease(this.smear.y, -Math.sin(a) * k, s.ease, dt);
    this.radial = ease(this.radial, v.state === 'play' ? (1 - clamp01(v.timeScale)) * s.slow : 0, s.ease, dt);

    // at the wheel: how much of the speed the edges show
    const D = s.drive, dr = (v.state === 'play' || v.state === 'continued') && !v.page ? v.drive : null;
    this.rush = ease(this.rush, dr ? Math.pow(clamp01((dr.k - D.from) / (1 - D.from)), D.curve) : 0, D.ease, dt);
    if (dr) this.rushA = ease(this.rushA, dr.angle, D.ease, dt);
    this.jolt *= Math.exp(-D.kick.decay * dt);
    if (!dr) this.jolt = 0;
  }

  // The numbers of this frame for the last pass. Positions are in the picture's own frame: 0..1, y up; lengths in
  // picture heights unless said otherwise.
  uniforms(v) {
    const c = this.cfg, W = v.W, H = v.H, out = v.outH || H, px = out / 1080; // out: the height it ends up on screen
    const at = (x, y) => { const s = v.toScreen(x, y); return [s.x / W, 1 - s.y / H]; };
    const world = !v.page, centre = world && v.player && v.state !== 'title' ? at(v.player.x, v.player.y) : [0.5, 0.5];

    const waves = new Float32Array(c.wave.max * 4);
    this.waves.slice(-c.wave.max).forEach((w, i) => {
      const k = c.wave[w.kind], life = 1 - w.t / k.life, [x, y] = at(w.x, w.y);
      waves.set([x, y, w.t * k.speed, k.bend * life * Math.sqrt(life)], i * 4);
    });

    const heat = new Float32Array(c.heat.max * 4);
    const spots = [
      ...this.embers.map((e) => ({ x: e.x, y: e.y, r: c.heat.blast.r, k: c.heat.blast.k * (1 - e.t / c.heat.blast.life) })),
      ...(world && v.heat || []).map((h) => ({ x: h.x, y: h.y, r: c.heat[h.kind].r, k: c.heat[h.kind].k })),
    ];
    spots.slice(0, c.heat.max).forEach((h, i) => {
      const [x, y] = at(h.x, h.y);
      heat.set([x, y, (h.r * v.scale) / H, h.k], i * 4);
    });

    const lights = new Float32Array(c.rays.max * 4);
    (world && v.lights || []).slice(0, c.rays.max).forEach((l, i) => {
      const [x, y] = at(l.x, l.y);
      lights.set([x, y, Math.min(1, l.k), 0], i * 4);
    });

    // the speed at the wheel: how much, the way he goes in the picture (y up), his car, and the band's numbers.
    // flat: at the wheel the scene is drawn 1:1 and must come out px for px where the road is: no barrel, no zoom
    // kick, the lens' own fringe kept to the band the speed works on (PostGL), and no scan lines (they stand still
    // on the screen: a car changing lanes under them flickers, row by row)
    const D = c.speed.drive, flat = world && !!v.drive, rush = flat ? Math.min(1.6, this.rush + this.jolt) : 0;
    const way = this.rushA - (v.rot || 0), rows = H / Math.max(1, v.scale) / D.rows;
    const t = c.tube, k = this.kick, R = c.rampage, r = this.rampage;
    const g = { ...this.grade, sat: this.grade.sat + c.punch.sat * k + R.sat * r, con: this.grade.con + c.punch.con * k + R.con * r };
    return {
      fringe: (c.fringe.rest + this.fringe + R.fringe * r + D.fringe * rush + c.fringe.trauma * Math.max(0, (world && v.trauma || 0) - 0.15)) * px,
      zoom: flat ? 0 : this.zoom,
      focus: this.zoom > 0.0005 && this.zoomAt ? at(this.zoomAt.x, this.zoomAt.y) : centre,
      frame: this.frame > 0 ? 1 : 0,
      glitch: this.glitch,
      waves, waveWidth: c.wave.width,
      heat,
      smear: [this.smear.x * (H / W), this.smear.y],
      radial: this.radial, centre,
      rush: {
        k: rush, flat: flat ? 1 : 0, dir: [Math.cos(way), -Math.sin(way)], at: flat ? at(v.drive.x, v.drive.y) : [0.5, 0.5],
        band: D.band, car: D.car,
        len: D.len, rows, flick: D.flick, mix: D.mix, pull: D.pull, split: D.split * px, dark: D.dark, lines: D.lines,
      },
      edge: this.edge, blur: this.blur,
      glow: { ...c.glow, strength: c.glow.strength + R.glow * r }, rays: c.rays, lights, tone: c.tone,
      grade: g,
      curve: flat ? 0 : t.curve, scan: flat ? 0 : t.scan, scanStep: Math.max(2, Math.round(out / 360)), mask: t.mask, bleed: t.bleed, grain: t.grain,
      vignette: t.vignette + R.vignette * r,
    };
  }
}
